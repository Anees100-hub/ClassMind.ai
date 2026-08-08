"""
Emotion Detection Engine for ClassMind.ai
Ported from the standalone prototype.
"""

try:
    from deepface import DeepFace
    HAS_DEEPFACE = True
except Exception as _deepface_err:
    DeepFace = None
    HAS_DEEPFACE = False
    print(f"[WARN] DeepFace could not be loaded ({type(_deepface_err).__name__}: {_deepface_err}). "
          "Using OpenCV fallback for frame analysis. "
          "Run: pip install tf-keras  to resolve.")

import cv2
import numpy as np

EMOTION_BUCKET_MAP = {
    "happy": "Engaged",
    "surprise": "Engaged",
    "neutral": "Neutral",
    "sad": "Disengaged",
    "angry": "Disengaged",
    "fear": "Disengaged",
    "disgust": "Disengaged",
}

BUCKETS = ["Engaged", "Disengaged", "Neutral"]


def decode_base64_image(base64_string: str):
    import base64
    if "," in base64_string:
        base64_string = base64_string.split(",", 1)[1]
    img_bytes = base64.b64decode(base64_string)
    npimg = np.frombuffer(img_bytes, np.uint8)
    image_bgr = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
    return image_bgr


def analyze_frame(frame_bgr):
    if not HAS_DEEPFACE or DeepFace is None:
        return _opencv_face_fallback(frame_bgr)

    try:
        results = DeepFace.analyze(
            img_path=frame_bgr,
            actions=["emotion"],
            detector_backend="opencv",
            enforce_detection=False,
            silent=True,
        )
    except Exception as exc:
        print(f"[emotion_engine] DeepFace analyze failed: {exc}")
        return _opencv_face_fallback(frame_bgr)

    if isinstance(results, dict):
        results = [results]

    faces = []
    for face_result in results:
        region = face_result.get("region", {})
        w = region.get("w", 0)
        h = region.get("h", 0)
        if w == 0 or h == 0:
            continue

        raw_emotion = str(face_result.get("dominant_emotion", "neutral") or "neutral").lower()
        emotion_scores = face_result.get("emotion", {}) or {}
        confidence = emotion_scores.get(raw_emotion, emotion_scores.get("neutral", 0.0))
        bucket = EMOTION_BUCKET_MAP.get(raw_emotion, "Neutral")

        faces.append({
            "box": (int(region.get("x", 0)), int(region.get("y", 0)), int(w), int(h)),
            "raw_emotion": raw_emotion,
            "bucket": bucket,
            "confidence": round(float(confidence), 2),
        })

    if not faces:
        return _opencv_face_fallback(frame_bgr)

    return faces


def _opencv_face_fallback(frame_bgr):
    """OpenCV Haar cascade fallback when DeepFace is unavailable or finds no faces."""
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    face_cascade = cv2.CascadeClassifier(cascade_path)
    faces_detected = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
    faces = []
    for (x, y, w, h) in faces_detected:
        faces.append({
            "box": (int(x), int(y), int(w), int(h)),
            "raw_emotion": "neutral",
            "bucket": "Neutral",
            "confidence": 0.75
        })
    return faces


def summarize_segment(all_face_readings):
    counts = {b: 0 for b in BUCKETS}
    total = 0
    for frame_faces in all_face_readings:
        for face in frame_faces:
            counts[face["bucket"]] += 1
            total += 1

    if total == 0:
        return {"Engaged": 0.0, "Disengaged": 0.0, "Neutral": 0.0, "total_readings": 0}

    percentages = {b: round((counts[b] / total) * 100, 2) for b in BUCKETS}
    percentages["total_readings"] = total
    return percentages


def summarize_lecture(segment_summaries):
    counts = {b: 0 for b in BUCKETS}
    total = 0
    for seg in segment_summaries:
        seg_total = seg.get("total_readings", 0)
        for b in BUCKETS:
            counts[b] += round((seg.get(b, 0) / 100) * seg_total) if seg_total else 0
        total += seg_total

    if total == 0:
        return {"Engaged": 0.0, "Disengaged": 0.0, "Neutral": 0.0, "total_readings": 0}

    percentages = {b: round((counts[b] / total) * 100, 2) for b in BUCKETS}
    percentages["total_readings"] = total
    return percentages
