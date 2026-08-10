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
import time
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
from fastapi.responses import JSONResponse, Response, StreamingResponse
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
# ENVIRONMENT SETUP (must load before classroom_camera singleton)
# -----------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))
load_dotenv(os.path.join(BASE_DIR, "..", "server", ".env"))

from classroom_camera import classroom_camera  # noqa: E402

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
def connect_mongo():
    """Connect to Atlas (pymongo — do not pass mongoose-only options like family)."""
    client = MongoClient(
        MONGO_URI,
        serverSelectionTimeoutMS=30000,
        connectTimeoutMS=20000,
        socketTimeoutMS=45000,
        tlsAllowInvalidCertificates=True,
        retryWrites=True,
    )
    client.admin.command("ping")
    try:
        database = client.get_default_database()
        if database.name in ("admin", "local"):
            raise ValueError("No default database in URI")
    except Exception:
        database = client["test"]
    return client, database


try:
    mongo_client, db = connect_mongo()
    teachers_col = db["Teachers"]
    attendance_col = db["Attendance"]
    print(f"[DB] Connected to MongoDB database '{db.name}'")
except Exception as e:
    print(f"[DB ERROR] Could not connect to MongoDB: {e}")
    print("[DB] Face registration will still work via Node API (descriptor extract only).")
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
    Upload teacher photo → extract face descriptor (DeepFace 512D).
    Saves to MongoDB when Python can reach Atlas; always returns the descriptor
    so the Node API can persist it even if Python Mongo is down.
    """
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
        validation = await asyncio.to_thread(validate_image_for_registration, img)
        if not validation.get("valid"):
            raise HTTPException(status_code=422, detail=validation.get("message", "Face validation failed."))
        encoding_list = await asyncio.to_thread(extract_descriptor_from_bgr, img)
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

    matched_count = 0
    modified_count = 0
    mongo_saved = False
    mongo_warning = None

    # Prefer direct Mongo write when available; never block registration if Atlas is down
    global mongo_client, db, teachers_col, attendance_col
    if teachers_col is None:
        try:
            mongo_client, db = connect_mongo()
            teachers_col = db["Teachers"]
            attendance_col = db["Attendance"]
            print(f"[DB] Reconnected to MongoDB database '{db.name}'")
        except Exception as exc:
            mongo_warning = f"Python Mongo unavailable ({exc}); descriptor returned for Node to save."

    if teachers_col is not None:
        try:
            result = teachers_col.update_one(
                {"id": int(teacher_id)},
                {"$set": {"faceDescriptor": encoding_list}}
            )
            matched_count = result.matched_count
            modified_count = result.modified_count
            if matched_count == 0:
                # Still return descriptor — Node may have the teacher even if Python query failed
                mongo_warning = f"Teacher ID {teacher_id} not found in Python Mongo write; use Node save."
            else:
                mongo_saved = True
                try:
                    rebuild_encodings_from_mongo()
                except Exception as rebuild_err:
                    print(f"[WARN] rebuild after register failed: {rebuild_err}")
        except Exception as exc:
            mongo_warning = f"Mongo save failed ({exc}); descriptor returned for Node to save."

    return {
        "message": (
            "Face descriptor registered to MongoDB successfully."
            if mongo_saved
            else "Face descriptor extracted. Save via Node API if Mongo was unavailable."
        ),
        "teacher_id": teacher_id,
        "descriptor": encoding_list,
        "descriptor_dimensions": len(encoding_list),
        "matched_count": matched_count,
        "modified_count": modified_count,
        "mongo_saved": mongo_saved,
        "mongo_warning": mongo_warning,
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

    # Do NOT auto-open RTSP on boot — OpenCV/FFmpeg can freeze the whole AI process
    # on Windows. Teachers connect via Dashboard "Connect / Test Camera".
    if os.getenv("CLASSROOM_CAMERA_URL"):
        print("  Classroom cam: configured (connect from Teacher Dashboard when needed)")

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


# -----------------------------------------------------------
# CLASSROOM WIFI CAMERA (V380 Pro RTSP) FOR STUDENT EMOTION
# -----------------------------------------------------------
class ClassroomCameraConfig(BaseModel):
    url: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None


@app.get("/api/classroom-camera/status")
async def classroom_camera_status():
    return classroom_camera.status()


@app.post("/api/classroom-camera/configure")
async def classroom_camera_configure(body: ClassroomCameraConfig):
    classroom_camera.configure(
        url=body.url or "",
        username=body.username or "",
        password=body.password if body.password is not None else "",
    )
    return {"ok": True, **classroom_camera.status()}


@app.post("/api/classroom-camera/test")
async def classroom_camera_test(body: Optional[ClassroomCameraConfig] = None):
    if body is not None:
        classroom_camera.configure(
            url=body.url or "",
            username=body.username or "",
            password=body.password if body.password is not None else "",
        )
    result = await asyncio.to_thread(classroom_camera.test_connection)
    return result


@app.post("/api/classroom-camera/start")
async def classroom_camera_start(body: Optional[ClassroomCameraConfig] = None):
    # Prefer permanent .env; only apply non-empty UI overrides
    classroom_camera.reload_env()
    if body is not None:
        classroom_camera.configure(
            url=body.url or "",
            username=body.username or "",
            password=body.password if body.password is not None else "",
        )
    # Never hard-fail with timeout — start() returns soft status and keeps retrying
    status = await asyncio.to_thread(classroom_camera.start)
    return {"ok": bool(status.get("has_frame")), **status}


@app.post("/api/classroom-camera/stop")
async def classroom_camera_stop():
    status = await asyncio.to_thread(classroom_camera.stop)
    return {"ok": True, **status}


@app.get("/api/classroom-camera/snapshot")
async def classroom_camera_snapshot():
    # Serve last good frame even during brief reconnects (no timeout error to UI)
    jpeg = await asyncio.to_thread(classroom_camera.get_jpeg_bytes, 70)
    if jpeg:
        return Response(content=jpeg, media_type="image/jpeg", headers={"Cache-Control": "no-store"})
    # Kick connect quietly; return 204 so UI does not show "Scanning Failure"
    if not classroom_camera.running:
        asyncio.create_task(asyncio.to_thread(classroom_camera.start))
    return Response(status_code=204)


@app.get("/api/classroom-camera/stream")
async def classroom_camera_stream():
    """
    Live MJPEG preview for dashboard / emotion UI.
    Much smoother than reloading a snapshot URL every few seconds.
    """
    # IMPORTANT: never use `not get_frame()` — numpy arrays break truthiness
    has_live = bool(classroom_camera.running and classroom_camera.get_frame() is not None)
    if not has_live:
        # Start once in background; stream will begin when frames arrive
        asyncio.create_task(asyncio.to_thread(classroom_camera.start))

    boundary = "frame"

    def mjpeg_generator():
        idle = 0
        while True:
            try:
                jpeg = classroom_camera.get_jpeg_bytes(55)
            except Exception:
                jpeg = None
            if jpeg is not None:
                idle = 0
                yield (
                    b"--" + boundary.encode() + b"\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
                )
                time.sleep(0.15)  # ~6–7 fps — stable for Wi‑Fi V380
            else:
                idle += 1
                time.sleep(0.35 if idle > 20 else 0.2)

    return StreamingResponse(
        mjpeg_generator(),
        media_type=f"multipart/x-mixed-replace; boundary={boundary}",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Connection": "keep-alive",
        },
    )


async def _analyze_emotion_frames(frames_bgr: list) -> tuple[dict, int, int]:
    """Returns (percentages, max_students, total_readings)."""
    counts = {"Happy": 0, "Engaged": 0, "Neutral": 0, "Disengaged": 0}
    total_readings = 0
    max_students = 0

    for frame in frames_bgr:
        try:
            faces = await asyncio.to_thread(analyze_frame, frame)
            if len(faces) > max_students:
                max_students = len(faces)
            for face in faces:
                raw = face.get("raw_emotion", "neutral").lower()
                metric = EMOTION_4_MAP.get(raw, "Neutral")
                counts[metric] += 1
                total_readings += 1
        except Exception as frame_err:
            print(f"[emotion] frame skipped: {frame_err}")

    if total_readings == 0 and max_students == 0:
        percentages = {"Happy": 0.0, "Engaged": 0.0, "Neutral": 0.0, "Disengaged": 0.0}
    elif total_readings == 0 and max_students > 0:
        percentages = {"Happy": 0.0, "Engaged": 0.0, "Neutral": 100.0, "Disengaged": 0.0}
    else:
        percentages = {
            m: round((counts[m] / total_readings) * 100.0, 2)
            for m in ["Happy", "Engaged", "Neutral", "Disengaged"]
        }
    return percentages, max_students, total_readings


@app.post("/api/emotion/analyze-classroom-clip")
async def analyze_classroom_clip(payload: dict = Body(...)):
    """Grab frames from V380 RTSP and run 4-metric emotion analysis."""
    lecture_id = payload.get("lectureId") or payload.get("lecture_id")
    class_id = payload.get("classId") or payload.get("class_id")
    session_id = payload.get("sessionId") or payload.get("session_id") or f"SES-{int(datetime.now().timestamp())}"
    segment_number = payload.get("segmentNumber", 1)
    frame_count = int(payload.get("frameCount") or 8)
    interval_sec = float(payload.get("intervalSec") or 0.35)
    timestamp = payload.get("timestamp") or datetime.now().isoformat()

    if not lecture_id:
        raise HTTPException(status_code=400, detail="lectureId is required")

    if not classroom_camera.running:
        if classroom_camera.effective_url:
            try:
                await asyncio.to_thread(classroom_camera.start)
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Could not start classroom camera: {exc}")
        else:
            raise HTTPException(status_code=400, detail="Classroom camera URL not configured")

    frames = await asyncio.to_thread(classroom_camera.grab_frames, frame_count, interval_sec)
    if not frames:
        raise HTTPException(status_code=503, detail="No frames from classroom camera")

    percentages, max_students, _ = await _analyze_emotion_frames(frames)

    node_payload = {
        "lectureId": lecture_id,
        "classId": class_id,
        "sessionId": session_id,
        "segmentNumber": segment_number,
        "totalStudents": max_students,
        "timestamp": timestamp,
        "emotions": percentages,
        "cameraSource": "classroom",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{NODE_BACKEND}/api/engagement/emotion-record",
                json=node_payload,
                headers=node_internal_headers(),
            )
    except Exception as e:
        print("[WARN] Failed to save classroom EmotionRecord to Node backend:", e)

    return {
        "status": "success",
        "lectureId": lecture_id,
        "sessionId": session_id,
        "segmentNumber": segment_number,
        "totalStudents": max_students,
        "timestamp": timestamp,
        "emotions": percentages,
        "cameraSource": "classroom",
        "framesAnalyzed": len(frames),
        "message": "No students detected" if max_students == 0 else f"{max_students} student(s) detected",
    }


@app.post("/api/emotion/analyze-multi")
async def analyze_multi_camera_clip(payload: dict = Body(...)):
    """
    Multi-camera emotion detection:
    - front/back laptop frames from browser
    - classroom V380 frames from cached RTSP reader (never opens a 2nd stream)
    Classroom failures must not fail the whole request if laptop frames exist.
    """
    try:
        lecture_id = payload.get("lectureId") or payload.get("lecture_id")
        class_id = payload.get("classId") or payload.get("class_id")
        session_id = payload.get("sessionId") or payload.get("session_id") or f"SES-{int(datetime.now().timestamp())}"
        segment_number = payload.get("segmentNumber", 1)
        timestamp = payload.get("timestamp") or datetime.now().isoformat()
        front_frames_b64 = payload.get("frontFrames") or []
        back_frames_b64 = payload.get("backFrames") or []
        laptop_frames_b64 = payload.get("laptopFrames") or payload.get("frames") or []
        use_classroom = payload.get("useClassroom", True)
        classroom_frame_count = int(payload.get("classroomFrameCount") or 4)
        raw_interval = payload.get("intervalSec")
        if raw_interval is None:
            raw_interval = float(payload.get("classroomIntervalMs") or 300) / 1000.0
        interval_sec = max(0.1, float(raw_interval))

        if not lecture_id:
            raise HTTPException(status_code=400, detail="lectureId is required")

        sources_used = []
        all_frames = []

        def _decode_sample(b64_list, cap=10):
            if not b64_list:
                return []
            sample = b64_list
            if len(sample) > cap:
                step = len(sample) / float(cap)
                sample = [b64_list[int(i * step)] for i in range(cap)]
            out = []
            for b64 in sample:
                frame = decode_base64_image(b64)
                if frame is not None:
                    out.append(frame)
            return out

        front_decoded = _decode_sample(front_frames_b64, 8)
        if front_decoded:
            all_frames.extend(front_decoded)
            sources_used.append("front")

        back_decoded = _decode_sample(back_frames_b64, 6)
        if back_decoded:
            all_frames.extend(back_decoded)
            sources_used.append("back")

        if not front_decoded and not back_decoded and laptop_frames_b64:
            laptop_decoded = _decode_sample(laptop_frames_b64, 12)
            all_frames.extend(laptop_decoded)
            if laptop_decoded:
                sources_used.append("laptop")

        classroom_error = None
        if use_classroom and (classroom_camera.effective_url or classroom_camera.url or os.getenv("CLASSROOM_CAMERA_URL")):
            try:
                # Soft start only if idle — NEVER force-reopen (that kills live MJPEG preview)
                if not classroom_camera.running or classroom_camera.get_frame() is None:
                    await asyncio.to_thread(classroom_camera.start)
                room_frames = await asyncio.to_thread(
                    classroom_camera.grab_frames, classroom_frame_count, interval_sec
                )
                # Wait briefly for cached frames; do not restart RTSP
                if not room_frames:
                    await asyncio.sleep(1.0)
                    room_frames = await asyncio.to_thread(
                        classroom_camera.grab_frames, max(2, classroom_frame_count // 2), 0.2
                    )
                all_frames.extend(room_frames)
                if room_frames:
                    sources_used.append("classroom")
                else:
                    classroom_error = "Classroom frames unavailable this clip (preview kept alive)"
            except Exception as exc:
                classroom_error = "Classroom unavailable this clip"
                print(f"[emotion] classroom camera deferred: {exc}")
        elif use_classroom:
            classroom_error = "Classroom camera URL not configured in ClassMind.ai/.env"

        if not all_frames:
            raise HTTPException(
                status_code=503,
                detail=classroom_error or "No frames from laptop or classroom cameras",
            )

        percentages, max_students, total_readings = await _analyze_emotion_frames(all_frames)

        node_payload = {
            "lectureId": lecture_id,
            "classId": class_id,
            "sessionId": session_id,
            "segmentNumber": segment_number,
            "totalStudents": max_students,
            "timestamp": timestamp,
            "emotions": percentages,
            "cameraSource": "+".join(sources_used) if sources_used else "unknown",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"{NODE_BACKEND}/api/engagement/emotion-record",
                    json=node_payload,
                    headers=node_internal_headers(),
                )
        except Exception as e:
            print("[WARN] Failed to save multi-camera EmotionRecord:", e)

        msg = (
            "No students detected"
            if max_students == 0
            else f"{max_students} student(s) detected from {', '.join(sources_used)}"
        )
        if classroom_error and "classroom" not in sources_used:
            msg += f" (classroom skipped: {classroom_error})"

        return {
            "status": "success",
            "lectureId": lecture_id,
            "sessionId": session_id,
            "segmentNumber": segment_number,
            "totalStudents": max_students,
            "timestamp": timestamp,
            "emotions": percentages,
            "cameraSources": sources_used,
            "framesAnalyzed": len(all_frames),
            "totalReadings": total_readings,
            "classroomError": classroom_error,
            "message": msg,
        }
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[emotion] analyze-multi failed: {exc}")
        raise HTTPException(status_code=500, detail=f"Emotion analysis failed: {exc}") from exc


