# Connect V380 Pro Camera to ClassMind (Student Emotion)

ClassMind uses your **V380 Pro Wi‑Fi camera** (pointed at students) for emotion detection.
Teacher attendance still uses the laptop webcam.

## What I need from you (V380 Pro app)

Send / enter these in the Teacher Scanner “Classroom Camera” panel:

| Item | Where in V380 Pro app | Example |
|------|------------------------|---------|
| **Camera IP address** | Device → Settings → Device info / Network | `192.168.1.50` |
| **Username** | The login you set for the camera (often `admin`) | `admin` |
| **Password** | Camera password you set in V380 Pro | `********` |
| **RTSP enabled** | Settings → **Advanced settings** → turn **ONVIF** / RTSP **ON** | must be ON |

### Exact RTSP URL ClassMind will use

```text
rtsp://USERNAME:PASSWORD@CAMERA_IP:554/live/ch00_1
```

- `/live/ch00_1` = HD (preferred)  
- `/live/ch00_0` = SD (if HD fails)

Example:

```text
rtsp://admin:mypassword@192.168.1.50:554/live/ch00_1
```

## Enable RTSP / ONVIF in V380 Pro (required)

Many V380 cameras ship with RTSP **off**.

### Option A — App toggle (if shown)
1. Open **V380 Pro**
2. Open your camera → **Settings** (⋯)
3. **Advanced settings**
4. Turn **ONVIF** / RTSP **ON**
5. Wait ~30 seconds, reboot camera if asked

### Option B — SD card unlock (if toggle missing)
1. Put this file on a microSD card **root** (not in a folder): `ceshi.ini`  
   Copy from: `ClassMind.ai/v380_ceshi.ini`
2. Power off camera → insert SD → power on → wait 1–5 minutes  
3. Power off → remove SD → power on  
4. In V380 Pro: Settings → Advanced → enable **ONVIF** if it appears now

## Network rules

- Camera and the PC running ClassMind AI (`python` on port 8000) must be on the **same Wi‑Fi**
- Prefer a **static IP** for the camera (router DHCP reservation or V380 network settings)
- Laptop browser does **not** need to open RTSP; the **Python AI server** pulls the stream

## Test in ClassMind

1. Start Python AI server  
2. Teacher portal → Attendance / Emotion scanner  
3. Choose **Classroom WiFi Camera (V380)**  
4. Paste RTSP URL (or IP + user + password) → **Test Camera** → **Connect**  
5. Start lecture → emotion scans use the V380 feed

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Test fails / timeout | Enable ONVIF/RTSP; check IP with phone on same Wi‑Fi |
| Opens but black / no frames | Try `/live/ch00_0` instead of `ch00_1` |
| Auth failed | Reset camera password in V380 Pro; URL-encode special characters in password |
| Works in V380 app only | App uses cloud; ClassMind needs **local RTSP** — ONVIF must be enabled |
