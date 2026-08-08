"""
========================================================
ClassMind.ai – Alternative: DeepFace / ArcFace Training
========================================================

USE THIS INSTEAD OF train_encodings.py if you:
    - Cannot install dlib / face_recognition (Windows build issues)
    - Want higher accuracy with ArcFace model
    - Have GPU available for faster processing

USAGE:
    pip install deepface
    python train_encodings_deepface.py

DEEPFACE MODELS SUPPORTED (set MODEL_NAME below):
    - "ArcFace"     → Best accuracy, production-ready
    - "Facenet512"  → Good accuracy, fast
    - "VGG-Face"    → Classic, widely used
    - "DeepFace"    → Facebook's original model
"""

import os
import pickle
import sys

import cv2
import numpy as np
from deepface import DeepFace

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def safe_print(message: str) -> None:
    try:
        print(message)
    except UnicodeEncodeError:
        print(message.encode("ascii", errors="replace").decode("ascii"))

# -----------------------------------------------------------
# CONFIG
# -----------------------------------------------------------
DATASET_DIR = "dataset"
MODEL_DIR   = "model"
OUTPUT_FILE = os.path.join(MODEL_DIR, "face_encodings_deepface.pkl")

# Choose the face recognition model
MODEL_NAME  = "ArcFace"   # Options: "ArcFace", "Facenet512", "VGG-Face", "DeepFace"
DETECTOR    = "opencv"     # Face detector backend: "opencv", "retinaface", "mtcnn"


def extract_deepface_embedding(image_path: str) -> np.ndarray:
    """
    Extract face embedding from an image using DeepFace.
    Returns a numpy array (embedding vector).
    """
    embedding_result = DeepFace.represent(
        img_path=image_path,
        model_name=MODEL_NAME,
        detector_backend=DETECTOR,
        enforce_detection=True   # Raises error if no face found
    )
    # DeepFace returns a list of dicts; take the first face's embedding
    return np.array(embedding_result[0]["embedding"])


def train_deepface_encodings():
    """Train face encodings using DeepFace/ArcFace."""
    all_embeddings   = []
    all_teacher_ids  = []
    all_teacher_names = []

    os.makedirs(MODEL_DIR, exist_ok=True)

    if not os.path.exists(DATASET_DIR):
        print(f"[ERROR] Dataset directory '{DATASET_DIR}' not found!")
        return

    teacher_folders = [
        f for f in os.listdir(DATASET_DIR)
        if os.path.isdir(os.path.join(DATASET_DIR, f)) and f.startswith("teacher_")
    ]

    print(f"\n[INFO] Using DeepFace Model: {MODEL_NAME}")
    print(f"[INFO] Found {len(teacher_folders)} teacher folders.")
    print("=" * 60)

    for folder_name in sorted(teacher_folders):
        teacher_id  = folder_name.replace("teacher_", "").strip()
        folder_path = os.path.join(DATASET_DIR, folder_name)
        image_files = [
            f for f in os.listdir(folder_path)
            if f.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp'))
        ]

        if not image_files:
            print(f"[WARN] No images in {folder_name}. Skipping.")
            continue

        print(f"\n[+] Processing Teacher ID: {teacher_id}")
        count = 0

        for img_file in image_files:
            img_path = os.path.join(folder_path, img_file)
            try:
                embedding = extract_deepface_embedding(img_path)
                all_embeddings.append(embedding)
                all_teacher_ids.append(teacher_id)
                all_teacher_names.append(folder_name)
                count += 1
                safe_print(f"   [OK] {img_file} - dim {len(embedding)}")
            except Exception as e:
                safe_print(f"   [SKIP] {img_file}: {str(e).encode('ascii', errors='replace').decode('ascii')}")

        safe_print(f"   Total encodings for teacher_{teacher_id}: {count}")

    if not all_embeddings:
        print("\n[ERROR] No embeddings generated.")
        return

    data = {
        "embeddings": all_embeddings,
        "teacher_ids": all_teacher_ids,
        "teacher_names": all_teacher_names,
        "model": MODEL_NAME
    }

    with open(OUTPUT_FILE, "wb") as f:
        pickle.dump(data, f)

    print("\n" + "=" * 60)
    print(f"[SUCCESS] DeepFace Training Complete!")
    print(f"  Model    : {MODEL_NAME}")
    print(f"  Encodings: {len(all_embeddings)} total")
    print(f"  Teachers : {len(set(all_teacher_ids))} unique")
    print(f"  Saved to : {OUTPUT_FILE}")
    print("=" * 60)


def recognize_with_deepface(frame_bgr: np.ndarray, known_data: dict) -> dict:
    """
    Recognize teacher from frame using DeepFace embeddings.
    Uses cosine similarity for comparison.
    """
    from datetime import datetime

    # Convert BGR → RGB, then save temp file (DeepFace needs file path or numpy array)
    rgb_frame = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

    try:
        embedding_result = DeepFace.represent(
            img_path=rgb_frame,
            model_name=MODEL_NAME,
            detector_backend=DETECTOR,
            enforce_detection=True
        )
    except Exception as e:
        return {
            "matched": False,
            "teacher_id": None,
            "teacher_name": None,
            "confidence": 0.0,
            "timestamp": datetime.now().isoformat(),
            "message": f"No face detected or error: {str(e)}"
        }

    if len(embedding_result) > 1:
        return {
            "matched": False,
            "multiple_faces": True,
            "teacher_id": None,
            "teacher_name": None,
            "confidence": 0.0,
            "timestamp": datetime.now().isoformat(),
            "message": "Multiple faces detected."
        }

    unknown_embedding = np.array(embedding_result[0]["embedding"])

    # Cosine similarity: 1.0 = identical, 0.0 = unrelated
    best_similarity = -1.0
    best_idx = -1
    for i, known_emb in enumerate(known_data["embeddings"]):
        similarity = np.dot(unknown_embedding, known_emb) / (
            np.linalg.norm(unknown_embedding) * np.linalg.norm(known_emb) + 1e-10
        )
        if similarity > best_similarity:
            best_similarity = similarity
            best_idx = i

    SIMILARITY_THRESHOLD = 0.75  # Above this = match (for cosine similarity)
    is_match = best_similarity >= SIMILARITY_THRESHOLD

    return {
        "matched": is_match,
        "multiple_faces": False,
        "teacher_id": known_data["teacher_ids"][best_idx] if is_match else None,
        "teacher_name": known_data["teacher_names"][best_idx] if is_match else None,
        "confidence": round(float(best_similarity), 4),
        "timestamp": datetime.now().isoformat(),
        "message": "Match found." if is_match else "No match."
    }


if __name__ == "__main__":
    print("=" * 60)
    print(f"  ClassMind.ai – DeepFace/{MODEL_NAME} Encoder")
    print("=" * 60)
    train_deepface_encodings()
