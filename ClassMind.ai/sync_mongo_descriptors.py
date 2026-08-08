"""Sync 512D DeepFace descriptors from dataset photos into MongoDB Teachers collection."""

import os
import sys

from dotenv import load_dotenv
from pymongo import MongoClient

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)
load_dotenv(os.path.join(BASE_DIR, ".env"))
load_dotenv(os.path.join(BASE_DIR, "..", "server", ".env"))

import face_engine
from face_engine import extract_descriptor_from_bgr, is_valid_descriptor

import cv2

DATASET_DIR = "dataset"
MONGO_URI = os.getenv("MONGO_URI")


def main():
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
    db = client.get_default_database()
    if db.name in ("admin", "local"):
        db = client["test"]
    teachers_col = db["Teachers"]

    updated = 0
    for folder in sorted(os.listdir(DATASET_DIR)):
        if not folder.startswith("teacher_"):
            continue
        teacher_id = int(folder.replace("teacher_", ""))
        folder_path = os.path.join(DATASET_DIR, folder)
        images = sorted(
            f for f in os.listdir(folder_path)
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".bmp"))
        )
        if not images:
            continue

        img_path = os.path.join(folder_path, images[-1])
        img = cv2.imread(img_path)
        if img is None:
            print(f"[SKIP] Could not read {img_path}")
            continue

        try:
            descriptor = extract_descriptor_from_bgr(img)
        except Exception as exc:
            print(f"[SKIP] Teacher {teacher_id}: {exc}")
            continue

        if not is_valid_descriptor(descriptor):
            print(f"[SKIP] Teacher {teacher_id}: invalid descriptor dim {len(descriptor)}")
            continue

        result = teachers_col.update_one(
            {"id": teacher_id},
            {"$set": {"faceDescriptor": descriptor}},
        )
        if result.matched_count:
            updated += 1
            print(f"[OK] Teacher {teacher_id}: saved {len(descriptor)}D descriptor from {images[-1]}")
        else:
            print(f"[WARN] Teacher {teacher_id} not found in MongoDB")

    print(f"[DONE] Updated {updated} teacher(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
