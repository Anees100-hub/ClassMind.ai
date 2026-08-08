"""
========================================================
ClassMind.ai – Part 1: Face Encoding Training Script
========================================================

USAGE:
    python train_encodings.py

WHAT THIS DOES:
    1. Reads teacher photos from /dataset/teacher_<id>/ folders
    2. Encodes each face into a 128-dimension vector using face_recognition (dlib)
    3. Saves all encodings to /model/face_encodings.pkl

FOLDER STRUCTURE REQUIRED:
    dataset/
    ├── teacher_1/
    │   ├── photo1.jpg
    │   └── photo2.jpg
    ├── teacher_2/
    │   ├── photo1.jpg
    │   └── photo2.jpg
    └── ...
"""

import os
import pickle
import face_recognition
from PIL import Image
import numpy as np

# -----------------------------------------------------------
# CONFIG
# -----------------------------------------------------------
DATASET_DIR = "dataset"          # Folder containing teacher photo subfolders
MODEL_DIR   = "model"            # Output folder for encodings
OUTPUT_FILE = os.path.join(MODEL_DIR, "face_encodings.pkl")

# -----------------------------------------------------------
# MAIN TRAINING FUNCTION
# -----------------------------------------------------------
def train_face_encodings():
    """
    Iterates through all teacher subfolders in DATASET_DIR,
    encodes each photo, and saves all encodings + labels to a .pkl file.
    """
    all_encodings = []  # List of 128D numpy arrays
    all_teacher_ids = []  # Corresponding teacher IDs (string: "1", "2", ...)
    all_teacher_names = []  # Optional metadata: teacher name (from folder name)

    # Create model output dir if it doesn't exist
    os.makedirs(MODEL_DIR, exist_ok=True)

    # Verify dataset directory exists
    if not os.path.exists(DATASET_DIR):
        print(f"[ERROR] Dataset directory '{DATASET_DIR}' not found!")
        print(f"        Create it and add folders like: teacher_1/photo1.jpg")
        return

    # Scan teacher subfolders
    teacher_folders = [
        f for f in os.listdir(DATASET_DIR)
        if os.path.isdir(os.path.join(DATASET_DIR, f)) and f.startswith("teacher_")
    ]

    if not teacher_folders:
        print(f"[ERROR] No teacher folders found in '{DATASET_DIR}'.")
        print(f"        Expected format: teacher_<id>/ (e.g., teacher_1/)")
        return

    print(f"\n[INFO] Found {len(teacher_folders)} teacher folders.")
    print("=" * 55)

    for folder_name in sorted(teacher_folders):
        # Extract teacher ID from folder name: "teacher_1" → "1"
        teacher_id = folder_name.replace("teacher_", "").strip()
        folder_path = os.path.join(DATASET_DIR, folder_name)

        # Get all image files in this teacher's folder
        image_files = [
            f for f in os.listdir(folder_path)
            if f.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp', '.webp'))
        ]

        if not image_files:
            print(f"[WARN] No images found for teacher_{teacher_id}. Skipping.")
            continue

        print(f"\n[+] Processing Teacher ID: {teacher_id}")
        teacher_encoded_count = 0

        for img_file in image_files:
            img_path = os.path.join(folder_path, img_file)

            try:
                # Load image using face_recognition (handles RGB conversion internally)
                image = face_recognition.load_image_file(img_path)

                # Detect face locations in the image
                # model="hog" is fast; use model="cnn" for higher accuracy (requires GPU)
                face_locations = face_recognition.face_locations(image, model="hog")

                if not face_locations:
                    print(f"   [WARN] No face detected in: {img_file}. Skipping.")
                    continue

                if len(face_locations) > 1:
                    print(f"   [WARN] Multiple faces in: {img_file}. Using the first face only.")

                # Encode the first (or only) detected face → 128D vector
                face_encodings = face_recognition.face_encodings(image, face_locations)
                encoding = face_encodings[0]  # Take first face's encoding

                # Store the encoding and its label
                all_encodings.append(encoding)
                all_teacher_ids.append(teacher_id)
                all_teacher_names.append(folder_name)

                teacher_encoded_count += 1
                print(f"   [OK] Encoded: {img_file}  (128D vector generated)")

            except Exception as e:
                print(f"   [ERROR] Failed to process {img_file}: {e}")

        print(f"   → Total encodings for teacher_{teacher_id}: {teacher_encoded_count}")

    # Save everything to pickle file
    if not all_encodings:
        print("\n[ERROR] No face encodings were generated. Check your images.")
        return

    data = {
        "encodings": all_encodings,      # List of 128D numpy arrays
        "teacher_ids": all_teacher_ids,  # Matching teacher IDs
        "teacher_names": all_teacher_names  # Matching folder names
    }

    with open(OUTPUT_FILE, "wb") as f:
        pickle.dump(data, f)

    print("\n" + "=" * 55)
    print(f"[SUCCESS] Training Complete!")
    print(f"  - Total encodings saved : {len(all_encodings)}")
    print(f"  - Unique teachers       : {len(set(all_teacher_ids))}")
    print(f"  - Saved to              : {OUTPUT_FILE}")
    print("=" * 55)


# -----------------------------------------------------------
# ENTRY POINT
# -----------------------------------------------------------
if __name__ == "__main__":
    print("ClassMind.ai – Teacher Face Encoding Trainer")
    print("=" * 55)
    train_face_encodings()
