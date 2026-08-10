"""
Classroom WiFi / IP camera (V380 Pro RTSP) for student emotion detection.

Designed to avoid freezing the FastAPI process on Windows:
- short open/read timeouts
- at most 2 URL candidates
- no aggressive multi-minute reconnect loops that hang OpenCV/FFmpeg
"""

from __future__ import annotations

import os
import re
import threading
import time
from typing import Optional
from urllib.parse import quote, urlparse, urlunparse

import cv2
import numpy as np

os.environ.setdefault(
    "OPENCV_FFMPEG_CAPTURE_OPTIONS",
    "rtsp_transport;tcp|fflags;nobuffer|max_delay;500000|stimeout;5000000",
)


def build_rtsp_url(url: str, username: str = "", password: str = "") -> str:
    url = (url or "").strip()
    if not url:
        return ""
    if username and "://" in url and "@" not in url.split("://", 1)[1]:
        scheme, rest = url.split("://", 1)
        user = quote(username, safe="")
        pwd = quote(password or "", safe="")
        return f"{scheme}://{user}:{pwd}@{rest}"
    return url


def mask_rtsp_url(url: str) -> str:
    try:
        parsed = urlparse(url)
        if parsed.password:
            netloc = parsed.netloc.replace(f":{parsed.password}", ":****", 1)
            return urlunparse(parsed._replace(netloc=netloc))
    except Exception:
        pass
    return url


def _swap_channel(url: str, channel: str) -> str:
    if not url:
        return url
    if re.search(r"/live/ch00_[01]", url):
        return re.sub(r"/live/ch00_[01]", f"/live/{channel}", url)
    return url


class ClassroomCamera:
    def __init__(self):
        self.url = ""
        self.username = ""
        self.password = ""
        self._cap: Optional[cv2.VideoCapture] = None
        self._thread: Optional[threading.Thread] = None
        self._frame_lock = threading.Lock()
        self._start_lock = threading.Lock()
        self._latest: Optional[np.ndarray] = None
        self.running = False
        self.reconnecting = False
        self.last_error: Optional[str] = None
        self.frames_read = 0
        self.connected_at: Optional[float] = None
        self._active_url: str = ""
        self._opening = False
        self.reload_env()

    def reload_env(self) -> None:
        env_url = (os.getenv("CLASSROOM_CAMERA_URL") or "").strip()
        env_user = (os.getenv("CLASSROOM_CAMERA_USER") or "").strip()
        env_pass = (os.getenv("CLASSROOM_CAMERA_PASSWORD") or "").strip()
        if env_url:
            self.url = env_url
        if env_user:
            self.username = env_user
        if env_pass:
            self.password = env_pass

    @property
    def effective_url(self) -> str:
        return self._active_url or build_rtsp_url(self.url, self.username, self.password)

    def configure(self, url: str = "", username: str = "", password: str = "") -> None:
        if url is not None and str(url).strip():
            self.url = str(url).strip()
        if username is not None and str(username).strip():
            self.username = str(username).strip()
        if password is not None and str(password) != "":
            self.password = str(password)

    def _candidate_urls(self) -> list[str]:
        """Prefer SD (ch00_0) first for smoother preview, then HD, then admin user."""
        self.reload_env()
        primary = build_rtsp_url(self.url, self.username, self.password)
        if not primary:
            return []
        urls = []
        for ch in ("ch00_0", "ch00_1"):
            u = _swap_channel(primary, ch)
            if u and u not in urls:
                urls.append(u)
        if primary not in urls:
            urls.insert(0, primary)
        if self.username and self.username.lower() != "admin":
            bare = self.url
            try:
                p = urlparse(self.url)
                if p.username or p.password:
                    host = p.hostname or ""
                    port = f":{p.port}" if p.port else ""
                    path = p.path or "/live/ch00_0"
                    bare = f"{p.scheme}://{host}{port}{path}"
            except Exception:
                pass
            for ch in ("ch00_0", "ch00_1"):
                admin_u = build_rtsp_url(_swap_channel(bare, ch), "admin", self.password)
                if admin_u and admin_u not in urls:
                    urls.append(admin_u)
        return urls[:4]

    def status(self) -> dict:
        env_url = (os.getenv("CLASSROOM_CAMERA_URL") or "").strip()
        env_user = (os.getenv("CLASSROOM_CAMERA_USER") or "").strip()
        env_pass = (os.getenv("CLASSROOM_CAMERA_PASSWORD") or "").strip()
        with self._frame_lock:
            has_frame = self._latest is not None
            frames_read = self.frames_read
        soft = None
        if self._opening or self.reconnecting:
            soft = "Connecting classroom camera…"
        return {
            "configured": bool(self.url or env_url),
            "has_env_config": bool(env_url),
            "has_permanent_credentials": bool(env_url and (env_user or "@" in env_url)),
            "password_saved": bool(env_pass or (self.password and str(self.password).strip())),
            "running": bool(self.running and has_frame),
            "reconnecting": bool(self.reconnecting or self._opening),
            "has_frame": has_frame,
            "frames_read": frames_read,
            "url": mask_rtsp_url(self.effective_url) if self.effective_url else "",
            "last_error": soft,
            "connected_at": self.connected_at,
            "ok": has_frame,
        }

    def _safe_release(self, cap: Optional[cv2.VideoCapture]) -> None:
        if cap is None:
            return
        try:
            cap.release()
        except Exception:
            pass

    def _open_one(self, url: str, warm_sec: float = 4.0):
        cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass
        if not cap.isOpened():
            self._safe_release(cap)
            return None, None
        deadline = time.time() + warm_sec
        while time.time() < deadline:
            ok, frame = cap.read()
            if ok and frame is not None:
                return cap, frame
            time.sleep(0.1)
        self._safe_release(cap)
        return None, None

    def _reader_loop(self) -> None:
        fail_streak = 0
        while self.running:
            cap = self._cap
            if cap is None:
                break
            try:
                ok, frame = cap.read()
            except Exception:
                ok, frame = False, None

            if not ok or frame is None:
                fail_streak += 1
                if fail_streak >= 80:
                    # Soft reopen once — do not spam candidates (avoids process hang)
                    self.reconnecting = True
                    self._safe_release(cap)
                    self._cap = None
                    url = self._active_url or (self._candidate_urls()[0] if self._candidate_urls() else "")
                    if url:
                        new_cap, new_frame = self._open_one(url, warm_sec=3.5)
                        if new_cap is not None:
                            self._cap = new_cap
                            with self._frame_lock:
                                self._latest = new_frame
                                self.frames_read += 1
                            fail_streak = 0
                            self.reconnecting = False
                            continue
                    time.sleep(5.0)
                    self.reconnecting = False
                else:
                    time.sleep(0.1)
                continue

            fail_streak = 0
            self.reconnecting = False
            with self._frame_lock:
                self._latest = frame
                self.frames_read += 1
            # Keep buffer drained for low-latency preview
            time.sleep(0.02)

    def start(self, force: bool = False) -> dict:
        # Non-blocking if another open is in progress
        if self._opening:
            return self.status()

        with self._start_lock:
            # Reuse live stream — force reopen is almost never needed and kills MJPEG clients
            if self.running and self._thread and self._thread.is_alive():
                with self._frame_lock:
                    if self._latest is not None:
                        return self.status()
            if not force:
                with self._frame_lock:
                    # Keep serving last frame; do not tear down for soft start calls
                    if self._latest is not None and self.running:
                        return self.status()

            self._opening = True
            try:
                # Stop reader only when we must reopen
                self.running = False
                thread = self._thread
                self._thread = None
                if thread and thread.is_alive():
                    thread.join(timeout=1.5)
                self._safe_release(self._cap)
                self._cap = None

                cap = frame = None
                active = ""
                for url in self._candidate_urls():
                    print(f"[classroom] trying {mask_rtsp_url(url)}")
                    cap, frame = self._open_one(url, warm_sec=4.0)
                    if cap is not None:
                        active = url
                        break

                if cap is None or frame is None:
                    print("[classroom] not connected yet (will not block AI server)")
                    return self.status()

                self._cap = cap
                self._active_url = active
                with self._frame_lock:
                    self._latest = frame
                    self.frames_read = max(1, self.frames_read)
                self.running = True
                self.connected_at = time.time()
                self._thread = threading.Thread(
                    target=self._reader_loop, name="classroom-camera", daemon=True
                )
                self._thread.start()
                print(f"[classroom] live via {mask_rtsp_url(active)}")
                return self.status()
            finally:
                self._opening = False

    def stop(self) -> dict:
        with self._start_lock:
            self.running = False
            thread = self._thread
            self._thread = None
            if thread and thread.is_alive():
                thread.join(timeout=2.0)
            self._safe_release(self._cap)
            self._cap = None
            self.connected_at = None
            self.reconnecting = False
            return self.status()

    def get_frame(self) -> Optional[np.ndarray]:
        with self._frame_lock:
            if self._latest is None:
                return None
            return self._latest.copy()

    def get_jpeg_bytes(self, quality: int = 80) -> Optional[bytes]:
        frame = self.get_frame()
        if frame is None:
            return None
        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
        if not ok:
            return None
        return buf.tobytes()

    def grab_frames(self, count: int = 6, interval_sec: float = 0.25) -> list:
        if (not self.running or self.get_frame() is None) and not self._opening:
            try:
                self.start()
            except Exception:
                pass
        frames = []
        deadline = time.time() + 6.0
        while time.time() < deadline and self.get_frame() is None:
            time.sleep(0.2)
        for _ in range(max(1, count)):
            frame = self.get_frame()
            if frame is not None:
                frames.append(frame)
            time.sleep(max(0.1, float(interval_sec)))
        return frames

    def test_connection(self, timeout_sec: float = 8.0) -> dict:
        st = self.start()
        if st.get("has_frame"):
            frame = self.get_frame()
            h, w = frame.shape[:2]
            return {
                "ok": True,
                "message": f"Classroom camera connected — {w}x{h}",
                "width": w,
                "height": h,
                "url": mask_rtsp_url(self.effective_url),
            }
        return {
            "ok": False,
            "message": "Classroom camera not connected yet",
            "url": mask_rtsp_url(self.effective_url),
            "reconnecting": False,
        }


classroom_camera = ClassroomCamera()
