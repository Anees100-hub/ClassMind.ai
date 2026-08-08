"""
Bootstrap / repair the ClassMind face recognition system.

- Purges legacy invalid face descriptors (e.g. old 128D mock data)
- Rebuilds the model file from valid MongoDB descriptors (512D DeepFace)
- Trains from dataset photos when available
"""

import os
import subprocess
import sys

from dotenv import load_dotenv
from pymongo import MongoClient

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)
load_dotenv(os.path.join(BASE_DIR, ".env"))
load_dotenv(os.path.join(BASE_DIR, "..", "server", ".env"))

import face_engine
from face_engine import (
    build_known_data_from_teachers,
    is_valid_descriptor,
    save_known_data_to_disk,
    train_script_name,
)

MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise SystemExit("MONGO_URI is not set. Configure MongoDB Atlas URI in ClassMind.ai/.env or server/.env")
DATASET_DIR = "dataset"


def purge_legacy_descriptors(teachers_col) -> int:
    purged = 0
    for teacher in teachers_col.find({"faceDescriptor": {"$exists": True}}):
        descriptor = teacher.get("faceDescriptor") or []
        if descriptor and not is_valid_descriptor(descriptor):
            teachers_col.update_one(
                {"_id": teacher["_id"]},
                {"$unset": {"faceDescriptor": ""}},
            )
            purged += 1
            print(f"  [PURGED] Teacher {teacher.get('id')} {teacher.get('firstName')} — invalid dim {len(descriptor)}")
    return purged


def has_dataset_photos() -> bool:
    if not os.path.isdir(DATASET_DIR):
        return False
    for folder in os.listdir(DATASET_DIR):
        folder_path = os.path.join(DATASET_DIR, folder)
        if not os.path.isdir(folder_path) or not folder.startswith("teacher_"):
            continue
        for fname in os.listdir(folder_path):
            if fname.lower().endswith((".jpg", ".jpeg", ".png", ".bmp")):
                return True
    return False


def main():
    print("=" * 60)
    print("  ClassMind.ai — Face System Bootstrap")
    print("=" * 60)

    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
    db = client.get_default_database()
    if db.name in ("admin", "local"):
        db = client["test"]
    teachers_col = db["Teachers"]
    print(f"[DB] Connected to '{db.name}'")

    purged = purge_legacy_descriptors(teachers_col)
    print(f"[INFO] Purged {purged} legacy face descriptor(s).")

    if has_dataset_photos():
        print(f"[INFO] Training from dataset using {train_script_name()} ...")
        result = subprocess.run([sys.executable, train_script_name()], cwd=BASE_DIR)
        if result.returncode != 0:
            print("[ERROR] Dataset training failed.")
            return 1
    else:
        print("[INFO] No dataset photos found.")

    teachers = list(teachers_col.find({"faceDescriptor": {"$exists": True, "$not": {"$size": 0}}}))
    known = build_known_data_from_teachers(teachers)
    if known:
        path = save_known_data_to_disk(known)
        print(f"[SUCCESS] Model saved: {path} ({len(known['encodings'])} encodings)")
    else:
        print("[WARN] No valid face descriptors remain.")
        print("       Teachers must use Attendance Scanner → Register Face Now.")

    print("=" * 60)
    return 0 if known else 2


if __name__ == "__main__":
    raise SystemExit(main())
