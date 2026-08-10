"""
Unified face recognition for ClassMind.ai.

Uses face_recognition (dlib, 128D) when installed; otherwise falls back to
DeepFace ArcFace (512D), which works on Windows/Python 3.13 without cmake.
"""

import os
import pickle
from datetime import datetime

import cv2
import numpy as np

try:
    import face_recognition
    HAS_FACE_RECOGNITION = True
except ImportError:
    face_recognition = None
    HAS_FACE_RECOGNITION = False

try:
    from deepface import DeepFace
    HAS_DEEPFACE = True
except Exception:
    DeepFace = None
    HAS_DEEPFACE = False

ENCODINGS_FILE = os.path.join("model", "face_encodings.pkl")
DEEPFACE_ENCODINGS_FILE = os.path.join("model", "face_encodings_deepface.pkl")
DEEPFACE_MODEL = "ArcFace"
DEEPFACE_DETECTOR = "opencv"
DEEPFACE_SIMILARITY_THRESHOLD = 0.75


def expected_descriptor_dim() -> int:
    return 128 if HAS_FACE_RECOGNITION else 512


def is_valid_descriptor(descriptor) -> bool:
    if not descriptor:
        return False
    dim = len(descriptor)
    if HAS_FACE_RECOGNITION:
        return dim == 128
    if HAS_DEEPFACE:
        return dim >= 512
    return False


def recognition_available() -> bool:
    return HAS_FACE_RECOGNITION or HAS_DEEPFACE


def recognition_backend() -> str | None:
    if HAS_FACE_RECOGNITION:
        return "face_recognition"
    if HAS_DEEPFACE:
        return "deepface"
    return None


def train_script_name() -> str:
    return "train_encodings.py" if HAS_FACE_RECOGNITION else "train_encodings_deepface.py"


def train_output_file() -> str:
    return ENCODINGS_FILE if HAS_FACE_RECOGNITION else DEEPFACE_ENCODINGS_FILE


def _normalize_known_data(data: dict) -> dict:
    if data and "embeddings" in data and "encodings" not in data:
        data = dict(data)
        data["encodings"] = data["embeddings"]
    return data


def load_encodings_from_disk():
    if HAS_FACE_RECOGNITION and os.path.exists(ENCODINGS_FILE):
        from recognize_teacher import load_encodings
        return load_encodings()

    if HAS_DEEPFACE and os.path.exists(DEEPFACE_ENCODINGS_FILE):
        with open(DEEPFACE_ENCODINGS_FILE, "rb") as f:
            return _normalize_known_data(pickle.load(f))

    return None


def build_known_data_from_teachers(teachers: list[dict]) -> dict | None:
    encodings = []
    teacher_ids = []
    teacher_names = []

    for teacher in teachers:
        descriptor = teacher.get("faceDescriptor")
        if not is_valid_descriptor(descriptor):
            continue
        encodings.append(np.array(descriptor, dtype=np.float64))
        teacher_ids.append(str(teacher.get("id")))
        teacher_names.append(
            f"{teacher.get('firstName', '')} {teacher.get('lastName', '')}".strip()
            or f"teacher_{teacher.get('id')}"
        )

    if not encodings:
        return None

    return {
        "encodings": encodings,
        "teacher_ids": teacher_ids,
        "teacher_names": teacher_names,
        "backend": recognition_backend(),
    }


def save_known_data_to_disk(known_data: dict) -> str:
    os.makedirs(os.path.dirname(train_output_file()), exist_ok=True)
    payload = {
        "encodings": [np.asarray(e).tolist() for e in known_data["encodings"]],
        "teacher_ids": known_data["teacher_ids"],
        "teacher_names": known_data["teacher_names"],
        "backend": recognition_backend(),
    }
    if recognition_backend() == "deepface":
        payload["embeddings"] = payload["encodings"]
        payload["model"] = DEEPFACE_MODEL

    with open(train_output_file(), "wb") as f:
        pickle.dump(payload, f)

    return train_output_file()


def validate_image_for_registration(img_bgr: np.ndarray) -> dict:
    """Validate a registration photo: one clear face, large enough in frame."""
    if not recognition_available():
        return {
            "valid": False,
            "faces_detected": 0,
            "message": "No face recognition backend available.",
        }

    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    min_face_size = 80

    try:
        if HAS_FACE_RECOGNITION:
            locations = face_recognition.face_locations(rgb)
            if not locations:
                return {"valid": False, "faces_detected": 0, "message": "No face detected. Look straight at the camera."}
            if len(locations) > 1:
                return {"valid": False, "faces_detected": len(locations), "message": "Multiple faces detected. Only you should be in frame."}
            top, right, bottom, left = locations[0]
            if (bottom - top) < min_face_size or (right - left) < min_face_size:
                return {"valid": False, "faces_detected": 1, "message": "Face too small. Move closer to the camera."}
            return {"valid": True, "faces_detected": 1, "message": "Face validated."}

        # Try opencv first, then a stronger detector if needed
        last_err = None
        for detector in (DEEPFACE_DETECTOR, "ssd", "retinaface"):
            try:
                result = DeepFace.represent(
                    img_path=rgb,
                    model_name=DEEPFACE_MODEL,
                    detector_backend=detector,
                    enforce_detection=True,
                )
                if len(result) > 1:
                    return {"valid": False, "faces_detected": len(result), "message": "Multiple faces detected. Only you should be in frame."}
                if len(result) == 0:
                    last_err = "No face detected"
                    continue

                area = result[0].get("facial_area") or {}
                width = int(area.get("w") or 0)
                height = int(area.get("h") or 0)
                # Allow slightly smaller faces from laptop webcams
                if width and height and (width < 50 or height < 50):
                    return {"valid": False, "faces_detected": 1, "message": "Face too small. Move closer to the camera."}

                return {"valid": True, "faces_detected": 1, "message": f"Face validated ({detector})."}
            except Exception as exc:
                last_err = str(exc)
                continue

        return {"valid": False, "faces_detected": 0, "message": f"No face detected. Look straight at the camera with good lighting. ({last_err})"}
    except Exception as exc:
        return {"valid": False, "faces_detected": 0, "message": f"Face validation failed: {exc}"}


def count_faces_in_bgr(img_bgr: np.ndarray) -> int:
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    if HAS_FACE_RECOGNITION:
        return len(face_recognition.face_locations(rgb))

    if HAS_DEEPFACE:
        result = DeepFace.represent(
            img_path=rgb,
            model_name=DEEPFACE_MODEL,
            detector_backend=DEEPFACE_DETECTOR,
            enforce_detection=True,
        )
        return len(result)

    raise RuntimeError(
        "No face recognition backend available. Install face_recognition or deepface."
    )


def extract_descriptor_from_bgr(img_bgr: np.ndarray) -> list[float]:
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    if HAS_FACE_RECOGNITION:
        locations = face_recognition.face_locations(rgb)
        if not locations:
            raise ValueError("No face detected in image.")
        encoding = face_recognition.face_encodings(rgb, locations)[0]
        return [round(float(v), 6) for v in encoding.tolist()]

    if HAS_DEEPFACE:
        last_err = None
        for detector in (DEEPFACE_DETECTOR, "ssd", "retinaface"):
            try:
                result = DeepFace.represent(
                    img_path=rgb,
                    model_name=DEEPFACE_MODEL,
                    detector_backend=detector,
                    enforce_detection=True,
                )
                if result:
                    return [round(float(v), 6) for v in result[0]["embedding"]]
            except Exception as exc:
                last_err = str(exc)
                continue
        raise ValueError(last_err or "No face detected in image.")

    raise RuntimeError(
        "No face recognition backend available. Install face_recognition or deepface."
    )


def recognize_face_from_frame(frame_bgr: np.ndarray, known_data: dict) -> dict:
    known_data = _normalize_known_data(known_data)

    if HAS_FACE_RECOGNITION:
        from recognize_teacher import recognize_face_from_frame as fr_recognize
        return fr_recognize(frame_bgr, known_data)

    if HAS_DEEPFACE:
        rgb_frame = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        try:
            embedding_result = DeepFace.represent(
                img_path=rgb_frame,
                model_name=DEEPFACE_MODEL,
                detector_backend=DEEPFACE_DETECTOR,
                enforce_detection=True,
            )
        except Exception as exc:
            return {
                "matched": False,
                "multiple_faces": False,
                "teacher_id": None,
                "teacher_name": None,
                "confidence": 0.0,
                "timestamp": datetime.now().isoformat(),
                "message": f"No face detected or error: {exc}",
            }

        if len(embedding_result) > 1:
            return {
                "matched": False,
                "multiple_faces": True,
                "teacher_id": None,
                "teacher_name": None,
                "confidence": 0.0,
                "timestamp": datetime.now().isoformat(),
                "message": "Multiple faces detected. Only the teacher should be in frame.",
            }

        unknown_embedding = np.array(embedding_result[0]["embedding"])
        encodings = known_data.get("encodings") or []
        teacher_ids = known_data.get("teacher_ids") or []
        teacher_names = known_data.get("teacher_names") or []

        if not encodings:
            return {
                "matched": False,
                "multiple_faces": False,
                "teacher_id": None,
                "teacher_name": None,
                "confidence": 0.0,
                "timestamp": datetime.now().isoformat(),
                "message": "No known face encodings available for recognition.",
            }

        best_similarity = -1.0
        best_idx = -1
        for i, known_emb in enumerate(encodings):
            known_vec = np.asarray(known_emb, dtype=np.float64)
            similarity = float(
                np.dot(unknown_embedding, known_vec)
                / (np.linalg.norm(unknown_embedding) * np.linalg.norm(known_vec) + 1e-10)
            )
            if similarity > best_similarity:
                best_similarity = similarity
                best_idx = i

        is_match = best_similarity >= DEEPFACE_SIMILARITY_THRESHOLD
        return {
            "matched": is_match,
            "multiple_faces": False,
            "teacher_id": teacher_ids[best_idx] if is_match else None,
            "teacher_name": teacher_names[best_idx] if is_match else None,
            "confidence": round(best_similarity, 4),
            "timestamp": datetime.now().isoformat(),
            "message": "Match found." if is_match else f"No match (similarity {best_similarity:.3f}).",
        }

    return {
        "matched": False,
        "multiple_faces": False,
        "teacher_id": None,
        "teacher_name": None,
        "confidence": 0.0,
        "timestamp": datetime.now().isoformat(),
        "message": "No face recognition backend available.",
    }
