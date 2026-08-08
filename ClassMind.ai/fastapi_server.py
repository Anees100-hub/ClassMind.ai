"""
========================================================
ClassMind.ai – Part 3: FastAPI Python Backend
========================================================

USAGE:
    uvicorn fastapi_server:app --host 0.0.0.0 --port 8000 --reload

ENDPOINTS:
    POST /api/face/upload-photo       → Upload teacher photo to dataset folder
    POST /api/face/train              → Re-train encodings from dataset
    POST /api/face/recognize          → Upload image → recognize teacher face
    POST /api/face/scan-webcam        → Trigger webcam scan, return JSON result
    GET  /api/face/health             → Health check

    POST /api/attendance/mark         → Mark teacher attendance (proxied to Node.js)
    GET  /api/attendance/teacher/{id} → Get attendance history for a teacher

This FastAPI server runs on port 8000.
Your Node.js Express backend continues to run on port 5003.
"""

import os
import io
import pickle
import json
import subprocess
import asyncio
from datetime import datetime
from typing import Optional

import cv2
import numpy as np
try:
    import face_recognition
    HAS_FACE_RECOGNITION = True
except ImportError:
    face_recognition = None
    HAS_FACE_RECOGNITION = False
import httpx
from dotenv import load_dotenv
from pymongo import MongoClient
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, BackgroundTasks, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from PIL import Image

# Import our local recognition module
from recognize_teacher import DISTANCE_THRESHOLD
import face_engine
from face_engine import (
    recognition_available,
    recognition_backend,
    train_script_name,
    train_output_file,
    load_encodings_from_disk,
    count_faces_in_bgr,
    extract_descriptor_from_bgr,
    recognize_face_from_frame,
    build_known_data_from_teachers,
    save_known_data_to_disk,
    is_valid_descriptor,
    expected_descriptor_dim,
    validate_image_for_registration,
)
from emotion_engine import analyze_frame, summarize_segment, summarize_lecture, decode_base64_image, HAS_DEEPFACE

# -----------------------------------------------------------
# ENVIRONMENT SETUP
# -----------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))
load_dotenv(os.path.join(BASE_DIR, "..", "server", ".env"))

MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise RuntimeError("MONGO_URI is not set. Configure MongoDB Atlas URI in ClassMind.ai/.env or server/.env")
NODE_BACKEND    = os.getenv("NODE_BACKEND_URL", "http://localhost:5003")  # Node.js server URL
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "classmind-internal-dev-key")

def node_internal_headers():
    return {
        "Content-Type": "application/json",
        "X-Internal-Key": INTERNAL_API_KEY,
    }
DATASET_DIR     = "dataset"
MODEL_DIR       = "model"
ENCODINGS_FILE  = os.path.join(MODEL_DIR, "face_encodings.pkl")

# -----------------------------------------------------------
# MONGODB CONNECTION (Python direct access)
# -----------------------------------------------------------
try:
    mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    mongo_client.admin.command("ping")
    try:
        db = mongo_client.get_default_database()
        if db.name == "admin" or db.name == "local":
            raise ValueError("No default database in URI")
    except Exception:
        db = mongo_client["test"]
    teachers_col    = db["Teachers"]
    attendance_col  = db["Attendance"]
    print(f"[DB] Connected to MongoDB database '{db.name}': {MONGO_URI}")
except Exception as e:
    print(f"[DB ERROR] Could not connect to MongoDB: {e}")
    mongo_client = None
    db = None
    teachers_col = None
    attendance_col = None

# -----------------------------------------------------------
# CACHE LOADED ENCODINGS (loaded once at startup)
# -----------------------------------------------------------
known_data_cache = None

def rebuild_encodings_from_mongo() -> dict | None:
    """Build recognition model from valid MongoDB face descriptors."""
    if db is None or teachers_col is None:
        return None
    try:
        teachers = list(teachers_col.find({"faceDescriptor": {"$exists": True, "$not": {"$size": 0}}}))
        known_data = build_known_data_from_teachers(teachers)
        if not known_data:
            return None
        save_known_data_to_disk(known_data)
        global known_data_cache
        known_data_cache = known_data
        return known_data
    except Exception as e:
        print(f"[ERROR] rebuild_encodings_from_mongo failed: {e}")
        return None


def get_known_data():
    """Load encodings from disk or return cached version, falling back to MongoDB."""
    global known_data_cache
    if known_data_cache is None:
        try:
            known_data_cache = load_encodings_from_disk()
        except Exception as e:
            print(f"[WARN] Failed to load encodings from disk: {e}")

        if known_data_cache is None:
            print("[INFO] Encodings file not found or failed to load. Falling back to MongoDB.")
            if db is not None:
                try:
                    teachers = list(teachers_col.find({"faceDescriptor": {"$exists": True, "$not": {"$size": 0}}}))
                    known_data_cache = build_known_data_from_teachers(teachers)
                    if known_data_cache:
                        print(
                            f"[INFO] Dynamically loaded {len(known_data_cache['encodings'])} "
                            f"valid face encodings from MongoDB."
                        )
                    else:
                        print("[WARN] No valid face descriptors found in MongoDB for current backend.")
                except Exception as e:
                    print(f"[ERROR] Failed to load encodings from MongoDB: {e}")
    return known_data_cache

def invalidate_encodings_cache():
    """Call after re-training to reload from disk."""
    global known_data_cache
    known_data_cache = None


# -----------------------------------------------------------
# FASTAPI APP SETUP
# -----------------------------------------------------------
app = FastAPI(
    title="ClassMind.ai – Python Face Recognition API",
    description="Face recognition microservice for teacher attendance.",
    version="1.0.0"
)

# Allow requests from React frontend (Vite dev), Node backend, and any localhost port
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://localhost:5003",
        "http://localhost:8000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5003",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------------------------------------
# PYDANTIC MODELS (Request/Response Schemas)
# -----------------------------------------------------------
class AttendanceMarkRequest(BaseModel):
    """Request body for marking teacher attendance."""
    teacher_id: str         # e.g., "1"
    class_id: str           # e.g., "CS401"
    timestamp: Optional[str] = None   # ISO string; defaults to now
    confidence: Optional[float] = None


class AttendanceRecord(BaseModel):
    """Schema for attendance records in MongoDB."""
    teacher_id: str
    class_id: str
    lecture_id: str
    confidence: float
    date: str
    status: str = "Present"


# -----------------------------------------------------------
# ROUTE: Health Check
# -----------------------------------------------------------
@app.get("/api/face/ping", tags=["Health"])
async def ping():
    """Instant liveness check — no DB or model loading."""
    return {"online": True, "server": "ClassMind.ai"}


@app.get("/api/face/health", tags=["Health"])
async def health_check():
    """Check if the Python server is running and encodings are loaded."""
    enc_count = len(known_data_cache["encodings"]) if known_data_cache else 0

    return {
        "status": "ok",
        "server": "ClassMind.ai Python Face Recognition API",
        "encodings_file": ENCODINGS_FILE,
        "encodings_loaded": enc_count > 0,
        "total_encodings": enc_count,
        "mongo_connected": mongo_client is not None,
        "timestamp": datetime.now().isoformat()
    }


@app.get("/api/face/status", tags=["Health"])
async def python_status():
    """
    Status check for React frontend. Uses cached encodings for speed.
    """
    global known_data_cache
    enc_count = 0
    teacher_count = 0
    known = known_data_cache or get_known_data()
    if known and known.get("encodings"):
        enc_count = len(known["encodings"])
        teacher_count = len(set(known.get("teacher_ids") or []))

    legacy_count = 0

    face_recognition_available = HAS_FACE_RECOGNITION and face_recognition is not None
    rec_available = recognition_available()
    backend = recognition_backend()
    model_ready = enc_count > 0 and rec_available

    return {
        "online": True,
        "model_ready": model_ready,
        "recognition_available": rec_available,
        "recognition_backend": backend,
        "face_recognition_available": face_recognition_available,
        "deepface_available": HAS_DEEPFACE,
        "emotion_ready": HAS_DEEPFACE,
        "total_encodings": enc_count,
        "teacher_count": teacher_count,
        "legacy_descriptor_count": legacy_count,
        "expected_descriptor_dim": expected_descriptor_dim(),
        "needs_face_reregistration": legacy_count > 0 and enc_count == 0,
        "mongo_connected": mongo_client is not None,
    }


# -----------------------------------------------------------
# ROUTE: Upload Teacher Photo
# -----------------------------------------------------------
@app.post("/api/face/upload-photo", tags=["Face Management"])
async def upload_teacher_photo(
    teacher_id: str = Form(..., description="Teacher ID (e.g., '1')"),
    file: UploadFile = File(..., description="Teacher photo (JPG/PNG)")
):
    """
    Upload a teacher photo to the dataset.
    Creates folder: dataset/teacher_<id>/ and saves the image.
    Supports multiple photos per teacher (just call this endpoint multiple times).
    """
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are accepted.")

    # Create teacher folder if needed
    teacher_folder = os.path.join(DATASET_DIR, f"teacher_{teacher_id}")
    os.makedirs(teacher_folder, exist_ok=True)

    # Count existing photos to generate unique filename
    existing = [f for f in os.listdir(teacher_folder) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    photo_index = len(existing) + 1
    extension = file.filename.split(".")[-1].lower() if "." in file.filename else "jpg"
    filename = f"photo{photo_index}.{extension}"
    save_path = os.path.join(teacher_folder, filename)

    # Save file
    contents = await file.read()
    with open(save_path, "wb") as f:
        f.write(contents)

    # Validate that the image contains a detectable face
    img_array = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    if img is None:
        os.remove(save_path)
        raise HTTPException(status_code=400, detail="Could not decode image. Please upload a valid JPG/PNG.")

    rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    if not recognition_available():
        os.remove(save_path)
        raise HTTPException(
            status_code=503,
            detail="No face recognition backend available. Install face_recognition or deepface."
        )

    try:
        validation = validate_image_for_registration(img)
    except Exception as exc:
        os.remove(save_path)
        raise HTTPException(status_code=422, detail=str(exc))

    if not validation.get("valid"):
        os.remove(save_path)
        raise HTTPException(status_code=422, detail=validation.get("message", "Face validation failed."))

    faces_detected = validation.get("faces_detected", 1)

    if faces_detected <= 0:
        os.remove(save_path)
        raise HTTPException(
            status_code=422,
            detail="No face detected in the uploaded image. Please upload a clear front-facing photo."
        )

    return {
        "message": "Photo uploaded successfully.",
        "teacher_id": teacher_id,
        "saved_path": save_path,
        "faces_detected": faces_detected,
        "photo_index": photo_index,
        "tip": "Call /api/face/train after uploading all photos to update the recognition model."
    }


# -----------------------------------------------------------
# ROUTE: Train/Re-Train Encodings
# -----------------------------------------------------------
@app.post("/api/face/bootstrap", tags=["Face Management"])
async def bootstrap_face_system():
    """Purge legacy descriptors and rebuild the recognition model."""
    if not teachers_col:
        raise HTTPException(status_code=503, detail="MongoDB not connected.")

    purged = 0
    for teacher in teachers_col.find({"faceDescriptor": {"$exists": True}}):
        descriptor = teacher.get("faceDescriptor") or []
        if descriptor and not is_valid_descriptor(descriptor):
            teachers_col.update_one({"_id": teacher["_id"]}, {"$unset": {"faceDescriptor": ""}})
            purged += 1

    invalidate_encodings_cache()
    rebuilt = rebuild_encodings_from_mongo()
    known = get_known_data()
    enc_count = len(known["encodings"]) if known else 0

    return {
        "message": "Face system bootstrap complete.",
        "purged_legacy_descriptors": purged,
        "model_ready": enc_count > 0,
        "total_encodings": enc_count,
        "next_step": "Register faces from Attendance Scanner if model_ready is false.",
    }


@app.post("/api/face/train", tags=["Face Management"])
async def train_encodings(background_tasks: BackgroundTasks, sync: bool = False):
    """
    Triggers re-training of face encodings from all photos in the dataset folder.
    Falls back to rebuilding from MongoDB when the dataset is empty.
    """

    def run_training():
        try:
            has_dataset_photos = False
            if os.path.isdir(DATASET_DIR):
                for folder in os.listdir(DATASET_DIR):
                    folder_path = os.path.join(DATASET_DIR, folder)
                    if os.path.isdir(folder_path) and folder.startswith("teacher_"):
                        for fname in os.listdir(folder_path):
                            if fname.lower().endswith((".jpg", ".jpeg", ".png", ".bmp")):
                                has_dataset_photos = True
                                break
                    if has_dataset_photos:
                        break

            if has_dataset_photos:
                result = subprocess.run(
                    ["python", train_script_name()],
                    capture_output=True, text=True, cwd=os.getcwd()
                )
                invalidate_encodings_cache()
                get_known_data()
                return result.returncode, result.stdout, result.stderr

            rebuilt = rebuild_encodings_from_mongo()
            invalidate_encodings_cache()
            if rebuilt:
                return 0, f"Rebuilt model from MongoDB ({len(rebuilt['encodings'])} encodings).", ""
            return 1, "", "No dataset photos or valid MongoDB descriptors found. Re-register faces from the camera."
        except Exception as e:
            return -1, "", str(e)

    if sync:
        code, stdout, stderr = run_training()
        known = get_known_data()
        enc_count = len(known["encodings"]) if known else 0
        if code != 0 or enc_count == 0:
            raise HTTPException(
                status_code=400,
                detail=stderr or stdout or "Training failed. Re-register your face from the scanner, then try again."
            )
        return {
            "message": stdout or "Training completed.",
            "status": "training_complete",
            "backend": recognition_backend(),
            "total_encodings": enc_count,
            "output_file": train_output_file(),
        }

    background_tasks.add_task(run_training)

    return {
        "message": "Training started in background. Encodings will be updated.",
        "status": "training_started",
        "backend": recognition_backend(),
        "dataset_dir": DATASET_DIR,
        "output_file": train_output_file()
    }


# -----------------------------------------------------------
# ROUTE: Recognize Face from Uploaded Image
# -----------------------------------------------------------
@app.post("/api/face/recognize", tags=["Recognition"])
async def recognize_from_image(
    file: UploadFile = File(..., description="Image to recognize (JPG/PNG)")
):
    """
    Upload an image and get face recognition result.
    Returns: teacher_id, teacher_name, matched, confidence, timestamp.
    """
    if not recognition_available():
        raise HTTPException(
            status_code=503,
            detail="No face recognition backend available. Install face_recognition or deepface."
        )

    known_data = get_known_data()
    if not known_data:
        raise HTTPException(
            status_code=503,
            detail="Face encodings not loaded. Run training first via /api/face/train."
        )

    # Decode uploaded image
    contents = await file.read()
    img_array = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

    if frame is None:
        raise HTTPException(status_code=400, detail="Could not decode uploaded image.")

    # Run recognition
    result = recognize_face_from_frame(frame, known_data)
    return JSONResponse(content=result)


# -----------------------------------------------------------
# ROUTE: Webcam One-Shot Scan (captures single frame from server webcam)
# -----------------------------------------------------------
@app.post("/api/face/scan-webcam", tags=["Recognition"])
async def scan_webcam():
    """
    Opens the server-side webcam, captures one frame, runs recognition.
    Returns JSON result.
    NOTE: This works when server runs locally (same machine as webcam).
          For remote deployments, use /api/face/recognize with client-captured frame.
    """
    known_data = get_known_data()
    if not known_data:
        raise HTTPException(
            status_code=503,
            detail="Face encodings not loaded. Run training first via /api/face/train."
        )

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        raise HTTPException(status_code=503, detail="Could not open webcam on server.")

    # Warm-up: skip a few frames for camera to adjust exposure
    for _ in range(5):
        cap.read()

    ret, frame = cap.read()
    cap.release()

    if not ret or frame is None:
        raise HTTPException(status_code=503, detail="Failed to capture frame from webcam.")

    result = recognize_face_from_frame(frame, known_data)
    return JSONResponse(content=result)


# -----------------------------------------------------------
# ROUTE: Mark Attendance (calls Node.js backend)
# -----------------------------------------------------------
@app.post("/api/attendance/mark", tags=["Attendance"])
async def mark_teacher_attendance(payload: AttendanceMarkRequest):
    """
    Mark teacher attendance by forwarding verified recognition to Node.js backend.
    Requires explicit confidence from a face recognition result — no default bypass.
    """
    if payload.confidence is None or payload.confidence < 0.8:
        raise HTTPException(status_code=400, detail="Valid face recognition confidence (>= 80%) is required.")

    lecture_id = f"LEC-{datetime.now().strftime('%Y-%m-%d')}"

    node_payload = {
        "teacherId": payload.teacher_id,
        "classId": payload.class_id,
        "lectureId": lecture_id,
        "confidence": payload.confidence,
        "recognitionMethod": recognition_backend() or "face_recognition",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{NODE_BACKEND}/api/attendance/mark",
                json=node_payload,
                headers=node_internal_headers(),
            )
            return JSONResponse(content=response.json(), status_code=response.status_code)

    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Could not connect to Node.js backend at {NODE_BACKEND}. Is it running?"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error forwarding attendance: {str(e)}")


# -----------------------------------------------------------
# ROUTE: Get Attendance History for Teacher
# -----------------------------------------------------------
@app.get("/api/attendance/teacher/{teacher_id}", tags=["Attendance"])
async def get_teacher_attendance(teacher_id: str):
    """
    Returns all attendance records for a given teacher (from MongoDB directly).
    """
    if not attendance_col:
        raise HTTPException(status_code=503, detail="MongoDB not connected.")

    try:
        records = list(attendance_col.find(
            {"teacherId": int(teacher_id)},
            {"_id": 0}  # Exclude MongoDB _id from response
        ).sort("date", -1))

        # Convert datetime objects to ISO strings for JSON serialization
        for r in records:
            if "date" in r and hasattr(r["date"], "isoformat"):
                r["date"] = r["date"].isoformat()
            if "createdAt" in r and hasattr(r["createdAt"], "isoformat"):
                r["createdAt"] = r["createdAt"].isoformat()
            if "updatedAt" in r and hasattr(r["updatedAt"], "isoformat"):
                r["updatedAt"] = r["updatedAt"].isoformat()

        return {
            "teacher_id": teacher_id,
            "total_records": len(records),
            "attendance": records
        }
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid teacher_id. Must be numeric.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# -----------------------------------------------------------
# ROUTE: Register Face Encoding Directly to MongoDB
# -----------------------------------------------------------
@app.post("/api/face/register-to-db", tags=["Face Management"])
async def register_face_to_db(
    teacher_id: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Upload teacher photo → extract 128D face encoding → save to MongoDB directly.
    This integrates with your existing Teacher schema's faceDescriptor field.
    """
    if not teachers_col:
        raise HTTPException(status_code=503, detail="MongoDB not connected.")

    if not recognition_available():
        raise HTTPException(
            status_code=503,
            detail="No face recognition backend available. Install face_recognition or deepface."
        )

    contents = await file.read()
    img_array = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image file.")

    try:
        validation = validate_image_for_registration(img)
        if not validation.get("valid"):
            raise HTTPException(status_code=422, detail=validation.get("message", "Face validation failed."))
        encoding_list = extract_descriptor_from_bgr(img)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    if not is_valid_descriptor(encoding_list):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid face descriptor dimensions ({len(encoding_list)}). Expected {expected_descriptor_dim()}."
        )

    # Update MongoDB Teacher document
    result = teachers_col.update_one(
        {"id": int(teacher_id)},
        {"$set": {"faceDescriptor": encoding_list}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail=f"Teacher with ID {teacher_id} not found.")

    rebuild_encodings_from_mongo()

    return {
        "message": "Face descriptor registered to MongoDB successfully.",
        "teacher_id": teacher_id,
        "descriptor": encoding_list,
        "descriptor_dimensions": len(encoding_list),
        "matched_count": result.matched_count,
        "modified_count": result.modified_count
    }


# -----------------------------------------------------------
# STARTUP EVENT: Load encodings on server boot
# -----------------------------------------------------------
@app.on_event("startup")
async def startup_event():
    """Pre-load face encodings when server starts."""
    global known_data_cache
    print("\n[ClassMind.ai] FastAPI server starting up...")
    print(f"  MongoDB     : {MONGO_URI}")
    print(f"  Node Backend: {NODE_BACKEND}")
    print(f"  Backend     : {recognition_backend() or 'none'}")
    print(f"  Encodings   : {train_output_file()}")

    try:
        data = get_known_data()
        if data:
            print(
                f"  Encodings loaded: {len(data['encodings'])} faces for "
                f"{len(set(data['teacher_ids']))} teachers"
            )
        elif not recognition_available():
            print("  [WARN] No recognition backend. pip install deepface")
        else:
            print("  [WARN] No encodings loaded. Register faces and call /api/face/train")
    except Exception as e:
        print(f"  [WARN] Could not load encodings: {e}")

    if db is not None and teachers_col is not None:
        try:
            teachers = list(teachers_col.find({"faceDescriptor": {"$exists": True, "$not": {"$size": 0}}}))
            legacy = sum(
                1 for t in teachers
                if t.get("faceDescriptor") and not is_valid_descriptor(t.get("faceDescriptor"))
            )
            valid = build_known_data_from_teachers(teachers)
            if valid and not known_data_cache:
                known_data_cache = valid
                save_known_data_to_disk(valid)
                print(f"  [INFO] Bootstrapped {len(valid['encodings'])} encodings from MongoDB.")
            if legacy:
                print(f"  [WARN] {legacy} teacher(s) have legacy face data — re-register from scanner.")
        except Exception as e:
            print(f"  [WARN] MongoDB bootstrap skipped: {e}")

    print("[ClassMind.ai] Server ready! Swagger UI: http://localhost:8000/docs\n")


# -----------------------------------------------------------
# Lecture & Emotion Endpoints
# -----------------------------------------------------------
_active_lecture_sessions = {}
SEGMENT_DURATION_SECONDS = 15


@app.post('/api/lecture/feed-frame')
async def lecture_feed_frame(payload: dict):
    """Payload: { lectureId: str, image: base64 string }
    Analyzes the image for emotions, buffers per-lecture segments, and when a
    segment completes, proxies it to the Node backend for persistence.
    """
    lecture_id = payload.get('lectureId') or payload.get('lecture_id')
    image_b64 = payload.get('image')
    if not lecture_id or not image_b64:
        raise HTTPException(status_code=400, detail='lectureId and image are required')

    session = _active_lecture_sessions.get(lecture_id)
    if session is None:
        # initialize session
        session = { 'segment_number': 1, 'segment_readings': [], 'segment_started_at': datetime.now() }
        _active_lecture_sessions[lecture_id] = session

    frame = decode_base64_image(image_b64)
    if frame is None:
        raise HTTPException(status_code=400, detail='Invalid image data')

    faces = analyze_frame(frame)
    session['segment_readings'].append(faces)

    elapsed = (datetime.now() - session['segment_started_at']).total_seconds()
    segment_completed = None

    if elapsed >= SEGMENT_DURATION_SECONDS:
        summary = summarize_segment(session['segment_readings'])

        # Proxy segment to Node backend for persistence
        node_payload = {
            'lectureId': lecture_id,
            'segmentNumber': session['segment_number'],
            'startedAt': session['segment_started_at'].isoformat(),
            'endedAt': datetime.now().isoformat(),
            'engagedPercent': summary['Engaged'],
            'disengagedPercent': summary['Disengaged'],
            'neutralPercent': summary['Neutral'],
            'totalReadings': summary['total_readings']
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(f"{NODE_BACKEND}/api/engagement/segment", json=node_payload, headers=node_internal_headers())
        except Exception as e:
            print('[WARN] Failed to proxy segment to Node backend:', e)

        segment_completed = {'segment_number': session['segment_number'], **summary}
        session['segment_number'] += 1
        session['segment_readings'] = []
        session['segment_started_at'] = datetime.now()

    return {
        'faces': [ { 'box': f['box'], 'bucket': f['bucket'], 'raw_emotion': f['raw_emotion'] } for f in faces ],
        'current_segment_number': session['segment_number'],
        'seconds_into_segment': round(elapsed,1) if not segment_completed else 0,
        'segment_duration_seconds': SEGMENT_DURATION_SECONDS,
        'segment_completed': segment_completed
    }


@app.post('/api/lecture/end')
async def lecture_end(payload: dict):
    lecture_id = payload.get('lectureId') or payload.get('lecture_id')
    if not lecture_id:
        raise HTTPException(status_code=400, detail='lectureId is required')

    session = _active_lecture_sessions.get(lecture_id)
    if session and session['segment_readings']:
        summary = summarize_segment(session['segment_readings'])
        node_payload = {
            'lectureId': lecture_id,
            'segmentNumber': session['segment_number'],
            'startedAt': session['segment_started_at'].isoformat(),
            'endedAt': datetime.now().isoformat(),
            'engagedPercent': summary['Engaged'],
            'disengagedPercent': summary['Disengaged'],
            'neutralPercent': summary['Neutral'],
            'totalReadings': summary['total_readings']
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(f"{NODE_BACKEND}/api/engagement/segment", json=node_payload, headers=node_internal_headers())
        except Exception as e:
            print('[WARN] Failed to proxy final segment to Node backend:', e)

    # Remove in-memory session
    if lecture_id in _active_lecture_sessions:
        del _active_lecture_sessions[lecture_id]

    # Ask Node backend to compute final lecture summary and update Class analytics
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(f"{NODE_BACKEND}/api/engagement/lecture/end", json={ 'lectureId': lecture_id }, headers=node_internal_headers())
            return JSONResponse(content=res.json(), status_code=res.status_code)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Could not contact Node backend to finalize lecture: {e}")


@app.get('/api/lecture/{lecture_id}/report')
async def lecture_report(lecture_id: str):
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(f"{NODE_BACKEND}/api/engagement/lecture/{lecture_id}")
            return JSONResponse(content=res.json(), status_code=res.status_code)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Could not fetch lecture report from Node backend: {e}")


# -----------------------------------------------------------
# 4-EMOTION STUDENT CLIP ANALYSIS ENDPOINTS
# -----------------------------------------------------------
EMOTION_4_MAP = {
    "happy": "Happy",
    "surprise": "Engaged",
    "neutral": "Neutral",
    "sad": "Disengaged",
    "angry": "Disengaged",
    "fear": "Disengaged",
    "disgust": "Disengaged",
}


@app.post('/api/emotion/analyze-clip')
async def analyze_student_clip(payload: dict = Body(...)):
    """
    Accepts video clip frames, detects student faces, calculates percentages
    for the 4 metrics (Happy, Engaged, Neutral, Disengaged), and saves result to MongoDB via Node.
    """
    try:
        lecture_id = payload.get('lectureId') or payload.get('lecture_id')
        class_id = payload.get('classId') or payload.get('class_id')
        session_id = payload.get('sessionId') or payload.get('session_id') or f"SES-{int(datetime.now().timestamp())}"
        segment_number = payload.get('segmentNumber', 1)
        frames_b64 = payload.get('frames', [])
        timestamp = payload.get('timestamp') or datetime.now().isoformat()

        if not lecture_id or not frames_b64:
            raise HTTPException(status_code=400, detail="lectureId and frames are required")

        counts = {"Happy": 0, "Engaged": 0, "Neutral": 0, "Disengaged": 0}
        total_readings = 0
        max_students = 0

        if len(frames_b64) > 10:
            step = len(frames_b64) / 10.0
            sampled_frames = [frames_b64[int(i * step)] for i in range(10)]
        else:
            sampled_frames = frames_b64

        for b64 in sampled_frames:
            try:
                frame = decode_base64_image(b64)
                if frame is None:
                    continue

                faces = await asyncio.to_thread(analyze_frame, frame)
                if len(faces) > max_students:
                    max_students = len(faces)

                for face in faces:
                    raw = face.get("raw_emotion", "neutral").lower()
                    metric = EMOTION_4_MAP.get(raw, "Neutral")
                    counts[metric] += 1
                    total_readings += 1
            except Exception as frame_err:
                print(f"[emotion] Frame analysis skipped: {frame_err}")
                continue

        if total_readings == 0 and max_students == 0:
            percentages = {"Happy": 0.0, "Engaged": 0.0, "Neutral": 0.0, "Disengaged": 0.0}
        elif total_readings == 0 and max_students > 0:
            percentages = {"Happy": 0.0, "Engaged": 0.0, "Neutral": 100.0, "Disengaged": 0.0}
        else:
            percentages = {
                m: round((counts[m] / total_readings) * 100.0, 2)
                for m in ["Happy", "Engaged", "Neutral", "Disengaged"]
            }

        node_payload = {
            "lectureId": lecture_id,
            "classId": class_id,
            "sessionId": session_id,
            "segmentNumber": segment_number,
            "totalStudents": max_students,
            "timestamp": timestamp,
            "emotions": percentages
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(f"{NODE_BACKEND}/api/engagement/emotion-record", json=node_payload, headers=node_internal_headers())
        except Exception as e:
            print("[WARN] Failed to save EmotionRecord to Node backend:", e)

        return {
            "status": "success",
            "lectureId": lecture_id,
            "sessionId": session_id,
            "segmentNumber": segment_number,
            "totalStudents": max_students,
            "timestamp": timestamp,
            "emotions": percentages,
            "message": "No students detected" if max_students == 0 else f"{max_students} student(s) detected"
        }
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[emotion] analyze-clip failed: {exc}")
        raise HTTPException(status_code=500, detail=f"Emotion analysis failed: {exc}")


