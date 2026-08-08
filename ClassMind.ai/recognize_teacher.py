"""
========================================================
ClassMind.ai – Part 2: Real-Time Teacher Recognition Script
========================================================

USAGE:
    python recognize_teacher.py

WHAT THIS DOES:
    1. Opens webcam using OpenCV
    2. On each frame, detects faces and compares against saved .pkl encodings
    3. If confidence/distance below threshold (match found): prints teacher info
    4. Returns JSON result: { teacher_id, teacher_name, matched, timestamp }
    5. Can also be imported and called as a function by the FastAPI server
"""

import cv2
import pickle
import numpy as np
import json
from datetime import datetime
import os

try:
    import face_recognition
    HAS_FACE_RECOGNITION = True
except ImportError:
    face_recognition = None
    HAS_FACE_RECOGNITION = False
    print("[WARN] face_recognition package not installed. Using OpenCV Haar Cascade fallback for face detection.")

# -----------------------------------------------------------
# CONFIG
# -----------------------------------------------------------
ENCODINGS_FILE  = "model/face_encodings.pkl"    # Pre-built encodings
DISTANCE_THRESHOLD = 0.45   # Lower = stricter. 0.45 recommended for dlib.
                              # face_recognition.compare_faces uses 0.6 default
WEBCAM_INDEX   = 0           # 0 = default webcam. Change if using external camera
SCALE_FACTOR   = 0.5         # Shrink frame for faster processing (0.5 = 50% size)

# -----------------------------------------------------------
# LOAD ENCODINGS
# -----------------------------------------------------------
def load_encodings():
    """Load pre-trained face encodings from .pkl file."""
    if not os.path.exists(ENCODINGS_FILE):
        raise FileNotFoundError(
            f"Encodings file not found: {ENCODINGS_FILE}\n"
            f"Run train_encodings.py first to generate the encodings."
        )

    with open(ENCODINGS_FILE, "rb") as f:
        data = pickle.load(f)

    print(f"[INFO] Loaded {len(data['encodings'])} face encodings "
          f"for {len(set(data['teacher_ids']))} teachers.")
    return data


# -----------------------------------------------------------
# CORE RECOGNITION FUNCTION (can be called from FastAPI)
# -----------------------------------------------------------
def recognize_face_from_frame(frame_bgr: np.ndarray, known_data: dict) -> dict:
    """
    Recognizes a teacher face from a single BGR frame (OpenCV format).

    Args:
        frame_bgr: OpenCV BGR image (numpy array)
        known_data: Dict with keys 'encodings', 'teacher_ids', 'teacher_names'

    Returns:
        dict: { teacher_id, teacher_name, matched, confidence, timestamp, multiple_faces }
    """
    # Convert BGR (OpenCV) → RGB (face_recognition expects RGB)
    rgb_frame = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

    # Downscale for faster face detection (process at SCALE_FACTOR resolution)
    small_frame = cv2.resize(rgb_frame, (0, 0), fx=SCALE_FACTOR, fy=SCALE_FACTOR)

    # Step 1: Find all face locations in this frame
    if not HAS_FACE_RECOGNITION or face_recognition is None:
        return {
            "matched": False,
            "multiple_faces": False,
            "teacher_id": None,
            "teacher_name": None,
            "confidence": 0.0,
            "timestamp": datetime.now().isoformat(),
            "message": "face_recognition library is not installed. Real face matching is unavailable."
        }

    face_locations = face_recognition.face_locations(small_frame, model="hog")
    face_encodings_in_frame = face_recognition.face_encodings(small_frame, face_locations) if face_locations else []

    # --- Business Rule: Multiple faces → reject ---
    if len(face_locations) > 1:
        return {
            "matched": False,
            "multiple_faces": True,
            "teacher_id": None,
            "teacher_name": None,
            "confidence": 0.0,
            "timestamp": datetime.now().isoformat(),
            "message": "Multiple faces detected. Only the teacher should be in frame."
        }

    if len(face_locations) == 0:
        return {
            "matched": False,
            "multiple_faces": False,
            "teacher_id": None,
            "teacher_name": None,
            "confidence": 0.0,
            "timestamp": datetime.now().isoformat(),
            "message": "No face detected in frame."
        }

    if not face_encodings_in_frame:
        return {
            "matched": False,
            "multiple_faces": False,
            "teacher_id": None,
            "teacher_name": None,
            "confidence": 0.0,
            "timestamp": datetime.now().isoformat(),
            "message": "Could not encode the detected face."
        }

    unknown_encoding = face_encodings_in_frame[0]

    # Step 3: Compare against all known encodings using Euclidean face distance
    known_encodings = known_data.get("encodings") or []
    known_ids = known_data.get("teacher_ids") or []
    known_names = known_data.get("teacher_names") or []

    if len(known_encodings) == 0:
        return {
            "matched": False,
            "multiple_faces": False,
            "teacher_id": None,
            "teacher_name": None,
            "confidence": 0.0,
            "distance": None,
            "timestamp": datetime.now().isoformat(),
            "message": "No known face encodings available for recognition."
        }

    try:
        face_distances = face_recognition.face_distance(known_encodings, unknown_encoding)
    except Exception as e:
        return {
            "matched": False,
            "multiple_faces": False,
            "teacher_id": None,
            "teacher_name": None,
            "confidence": 0.0,
            "distance": None,
            "timestamp": datetime.now().isoformat(),
            "message": f"Recognition failure: {str(e)}"
        }

    # Find the best match (minimum distance)
    best_match_idx = np.argmin(face_distances)
    best_distance  = face_distances[best_match_idx]

    # Convert distance to confidence score (0-1 scale, 1 = perfect match)
    # Formula: confidence = max(0, 1 - distance)  → capped at 1.0
    confidence = max(0.0, round(1.0 - float(best_distance), 4))

    # Step 4: Check against threshold (distance must be below threshold to be a match)
    is_match = bool(best_distance <= DISTANCE_THRESHOLD)

    if is_match:
        matched_teacher_id   = known_ids[best_match_idx]
        matched_teacher_name = known_names[best_match_idx].replace("teacher_", "Teacher ")
        return {
            "matched": True,
            "multiple_faces": False,
            "teacher_id": matched_teacher_id,
            "teacher_name": matched_teacher_name,
            "confidence": confidence,
            "distance": round(float(best_distance), 4),
            "timestamp": datetime.now().isoformat(),
            "message": f"Match found: Teacher ID {matched_teacher_id}"
        }
    else:
        return {
            "matched": False,
            "multiple_faces": False,
            "teacher_id": None,
            "teacher_name": None,
            "confidence": confidence,
            "distance": round(float(best_distance), 4),
            "timestamp": datetime.now().isoformat(),
            "message": f"Unknown face. Best distance: {best_distance:.3f} (threshold: {DISTANCE_THRESHOLD})"
        }


# -----------------------------------------------------------
# REAL-TIME WEBCAM RECOGNITION (Live Demo)
# -----------------------------------------------------------
def run_realtime_recognition():
    """
    Opens webcam, continuously detects and recognizes teacher faces.
    Press 'q' to quit, 's' to scan and return JSON result.
    """
    print("\n[ClassMind.ai] Loading face encodings...")
    known_data = load_encodings()

    print(f"[INFO] Opening webcam (index {WEBCAM_INDEX})...")
    cap = cv2.VideoCapture(WEBCAM_INDEX)

    if not cap.isOpened():
        print(f"[ERROR] Could not open webcam at index {WEBCAM_INDEX}.")
        return

    print("[INFO] Webcam opened. Press 's' to scan, 'q' to quit.")
    print("=" * 55)

    scan_result = None

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[ERROR] Failed to read frame from webcam.")
            break

        # --- Draw guide circle overlay ---
        h, w = frame.shape[:2]
        center = (w // 2, h // 2)
        cv2.circle(frame, center, 130, (0, 194, 255), 2)  # Cyan circle guide
        cv2.putText(frame, "ClassMind.ai | Teacher Scanner",
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 194, 255), 2)
        cv2.putText(frame, "Press 'S' = Scan Face | 'Q' = Quit",
                    (10, h - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1)

        cv2.imshow("ClassMind.ai - Teacher Recognition", frame)

        key = cv2.waitKey(1) & 0xFF

        if key == ord('q'):
            print("[INFO] Exiting...")
            break

        elif key == ord('s'):
            # Capture current frame and run recognition
            print("\n[SCANNING] Analyzing frame...")
            result = recognize_face_from_frame(frame, known_data)
            scan_result = result

            # Print JSON result
            print(json.dumps(result, indent=2))

            # Show result overlay on screen
            if result["matched"]:
                msg = f"MATCHED: Teacher {result['teacher_id']} | {result['confidence']*100:.1f}%"
                color = (0, 200, 0)  # Green
            elif result.get("multiple_faces"):
                msg = "REJECTED: Multiple faces detected!"
                color = (0, 0, 255)  # Red
            else:
                msg = f"NO MATCH | Conf: {result['confidence']*100:.1f}%"
                color = (0, 0, 255)

            cv2.putText(frame, msg, (10, 65), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
            cv2.imshow("ClassMind.ai - Teacher Recognition", frame)
            cv2.waitKey(2500)  # Show result for 2.5 seconds

    cap.release()
    cv2.destroyAllWindows()

    # Return the last scan result
    return scan_result


# -----------------------------------------------------------
# ENTRY POINT
# -----------------------------------------------------------
if __name__ == "__main__":
    print("=" * 55)
    print("  ClassMind.ai – Real-Time Teacher Face Recognition")
    print("=" * 55)
    result = run_realtime_recognition()
    if result:
        print("\n[FINAL RESULT]")
        print(json.dumps(result, indent=2))
