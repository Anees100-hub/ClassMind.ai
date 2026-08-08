<p align="center">
  <img src="docs/demo/hero.png" alt="ClassMind — AI Classroom Intelligence" width="920" />
</p>

<h1 align="center">ClassMind.ai</h1>

<p align="center">
  <strong>AI-Powered Learning Management System</strong><br />
  Face recognition attendance · Live emotion & engagement analytics · Smart classroom dashboards
</p>

<p align="center">
  <a href="#-project-demos">Demos</a> ·
  <a href="#-features">Features</a> ·
  <a href="#-architecture">Architecture</a> ·
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-demo-accounts">Demo Accounts</a>
</p>

---

## 🎬 Project Demos

### 1) Cartoon overview (how ClassMind works)

<p align="center">
  <img src="docs/demo/classmind-overview.gif" alt="ClassMind animated overview" width="920" />
</p>

| Step | What happens |
|------|----------------|
| **1. Roles** | Admin, Teacher, and Student each get a tailored dashboard |
| **2. Live lecture** | Teacher starts a session from their course hub |
| **3. Face attendance** | Webcam + AI verify the teacher and mark attendance |
| **4. Engagement** | Emotion analysis tracks Engaged / Neutral / Disengaged in real time |
| **5. Materials & alerts** | Uploads get AI summaries; class-scoped notifications reach the right people |
| **6. Smarter classrooms** | Admins see institution-wide analytics; everyone stays in sync |

### 2) Live emotion detection (real app recording)

Teacher Portal → Student Emotion Scan during a live session (**muted** — audio track removed):

<p align="center">
  <video src="docs/demo/emotion-detection.mp4" width="920" controls muted playsinline loop></video>
</p>

> Open / download: [`docs/demo/emotion-detection.mp4`](docs/demo/emotion-detection.mp4)
>
> Storyboard stills: [`docs/demo/`](docs/demo/). Rebuild cartoon GIF: `python docs/demo/make_demo_gif.py`

---

## ✨ What is ClassMind?

**ClassMind** is a full-stack smart classroom platform that helps institutions run lectures with confidence:

- **Administrators** manage teachers, students, classes, system settings, and institution analytics
- **Teachers** run live sessions, take AI face attendance, upload materials, and review engagement
- **Students** see enrolled classes, materials, CGPA context, and **only notifications for their classes**

It combines a modern React dashboard, a Node.js API, MongoDB Atlas, and a Python AI microservice (DeepFace) for recognition and emotion analysis.

---

## 🌟 Features

### Admin
- System overview with live stats and charts
- Teachers & students CRUD + Excel bulk import
- Class management and teacher assignment
- Institution & per-course engagement analytics
- Settings, audit logs, backup/export, announcements

### Teacher
- Course dashboard with live session status
- **Face recognition attendance** (webcam → DeepFace / ArcFace)
- **Emotion & engagement scanner** during lectures
- Material upload with optional **Gemini AI summaries**
- Class analytics (sessions, trends, attendance)
- Reschedule / timetable updates
- Student tracking for enrolled learners
- Notifications for assigned / taught classes only

### Student
- Enrolled-class dashboard
- Class detail with materials & schedule
- Class-scoped notifications (no unrelated noise)
- CGPA display when available

### AI & Analytics
| Capability | Technology |
|------------|------------|
| Teacher face registration & recognition | DeepFace (ArcFace 512D) or optional `face_recognition` / dlib |
| Live emotion analysis | DeepFace emotion model + OpenCV fallback |
| Engagement aggregation | Segment → lecture → class analytics in MongoDB |
| Material summaries | Google Gemini (`GEMINI_API_KEY`) or labeled demo summary |

---

## 🏗 Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│  Browser  ·  React + Vite  ·  http://localhost:5173             │
│  RoleGate: Admin · Teacher · Student                            │
└───────────────┬───────────────────────────────┬─────────────────┘
                │ /api/*  /uploads              │ /python-api/*
                ▼                               ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│  Node.js Express  :5003      │   │  Python FastAPI  :8000        │
│  Auth · CRUD · Materials     │◄──│  Face train / recognize       │
│  Attendance rules            │   │  Emotion analyze              │
│  Engagement persistence      │   │  X-Internal-Key → Node        │
└───────────────┬──────────────┘   └───────────────┬──────────────┘
                │                                  │
                └────────────┬─────────────────────┘
                             ▼
                   MongoDB Atlas  (database: test)
```

**Vite proxies** (`vite.config.js`):

| Frontend path | Target |
|---------------|--------|
| `/api`, `/uploads` | `http://127.0.0.1:5003` |
| `/python-api/*` | `http://127.0.0.1:8000/api/*` |

---

## 📁 Project Structure

```text
classmind-dashboard/
├── README.md                 ← you are here
├── docs/demo/                ← hero, storyboard frames, animated GIF
├── package.json              ← frontend (Vite)
├── vite.config.js
├── public/
├── src/
│   ├── App.jsx               ← routes + RoleGate
│   ├── components/           ← layout, sidebar, gates
│   ├── context/              ← AuthContext, DataContext
│   ├── pages/                ← Admin / Teacher / Student UI
│   └── utils/api.js          ← authenticated fetch helper
├── server/
│   ├── index.js              ← Express entry (port 5003)
│   ├── seed.js               ← demo data
│   ├── .env.example
│   ├── models/  routes/  middleware/  utils/
│   └── uploads/
└── ClassMind.ai/             ← Python AI microservice
    ├── fastapi_server.py
    ├── face_engine.py
    ├── emotion_engine.py
    ├── requirements.txt
    ├── dataset/              ← teacher face photos
    └── model/                ← trained encodings
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+
- **Python** 3.10+ (3.11–3.13 recommended)
- **MongoDB Atlas** cluster (cloud)
- Webcam for attendance / emotion demo

### 1) Clone & install frontend

```bash
git clone https://github.com/Anees100-hub/ClassMind.ai.git classmind-dashboard
cd classmind-dashboard
npm install
```

### 2) Configure & start Node API

```bash
cd server
cp .env.example .env
# Edit .env — set MONGO_URI, SESSION_SECRET, optional GEMINI_API_KEY
npm install
npm run seed          # first time only
npm run dev           # → http://127.0.0.1:5003
```

Example `server/.env` (use **your** secrets — never commit real keys):

```env
PORT=5003
MONGO_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/test?retryWrites=true&w=majority
SESSION_SECRET=change-this-to-a-long-random-string
INTERNAL_API_KEY=classmind-internal-dev-key
# GEMINI_API_KEY=your-key-here
```

### 3) Start Python AI server

```bash
cd ClassMind.ai
# optional: python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt

# Ensure .env has the same MONGO_URI and NODE_BACKEND_URL=http://localhost:5003
python -m uvicorn fastapi_server:app --host 127.0.0.1 --port 8000
```

Swagger docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 4) Start the React app

```bash
# from project root
npm run dev
# → http://localhost:5173
```

### Startup order

1. MongoDB Atlas reachable (Network Access allows your IP)
2. Node API on **5003**
3. Python AI on **8000**
4. Vite on **5173**

---

## 🔐 Demo Accounts

After `npm run seed` in `server/`:

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@classmind.ai` | `password123` |
| Teacher | `sarah.j@classmind.ai` | `password123` |
| Teacher | `michael.c@classmind.ai` | `password123` |
| Student | `student@classmind.ai` | `password123` |
| Student | `janedoe@student.edu` | `password123` |

---

## 🔄 End-to-End Flows

### Face attendance (teacher)

1. Admin registers teacher face photos (Teachers page → Python train)
2. Teacher opens course → **Attendance Scanner**
3. Browser captures frame → `POST /python-api/face/recognize`
4. Match must be the logged-in teacher, confidence ≥ threshold
5. Node marks attendance and can start / resume the lecture session

### Emotion & engagement

1. During an active lecture, scanner sends short clips / frames
2. Python DeepFace classifies emotions → Engaged / Neutral / Disengaged
3. Segments (~15s) are saved via Node (`X-Internal-Key`)
4. **End Analytics** closes the lecture and aggregates class analytics
5. Teacher & Admin analytics pages show live session history & trends

### Materials

1. Teacher uploads slides/docs
2. Node parses content; Gemini (if configured) builds a summary
3. Students see materials under their enrolled class only

### Notifications

- Created for a **class** (materials, reschedule) or a **specific user**
- Students see only enrolled-class + personal notifications
- Teachers see only assigned/taught-class + personal notifications

---

## 🛠 Scripts Reference

| Location | Command | Purpose |
|----------|---------|---------|
| Root | `npm run dev` | Vite frontend |
| Root | `npm run build` | Production build |
| `server/` | `npm run dev` | API with nodemon |
| `server/` | `npm run seed` | Seed demo data |
| `server/` | `npm start` | API production |
| `ClassMind.ai/` | `uvicorn fastapi_server:app --host 127.0.0.1 --port 8000` | AI server |
| `docs/demo/` | `python make_demo_gif.py` | Rebuild overview GIF |

---

## 🔌 Key API Surfaces

### Node (`:5003`)
- `/api/users` — login, session
- `/api/teachers`, `/api/students`, `/api/classes`
- `/api/attendance`, `/api/materials`, `/api/timetable`
- `/api/engagement/*` — segments, class reports, admin summary
- `/api/notifications/*` — class-scoped inbox

### Python (`:8000`)
- `/api/face/upload-photo`, `/train`, `/recognize`, `/health`
- `/api/emotion/analyze-clip`, related lecture helpers
- Full list: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## ⚙️ Environment Variables

| Variable | Service | Required | Description |
|----------|---------|----------|-------------|
| `MONGO_URI` | Node + Python | ✅ | Atlas connection string (DB name `test`) |
| `PORT` | Node | | Default `5003` |
| `SESSION_SECRET` | Node | ✅ | HMAC session signing |
| `INTERNAL_API_KEY` | Node + Python | ✅ | Shared key for Python → Node |
| `GEMINI_API_KEY` | Node | | Real AI material summaries |
| `NODE_BACKEND_URL` | Python | | Default `http://localhost:5003` |
| `DISTANCE_THRESHOLD` | Python | | Face match distance (default `0.45`) |
| `WEBCAM_INDEX` | Python | | Camera index (default `0`) |

> **Security:** Never commit real `.env` files. Rotate any credentials that were shared in chat or screenshots.

---

## 🧭 Atlas checklist (if DB won’t connect)

1. [MongoDB Atlas](https://cloud.mongodb.com) → **Network Access** → allow your IP or `0.0.0.0/0` (dev only)
2. Cluster is **Running** (not paused)
3. Database user/password match `MONGO_URI`
4. Wait 1–2 minutes after IP changes, then restart `npm run dev`

Quick test from `server/`:

```bash
node test_atlas_connection.js
```

---

## 🧪 Suggested Demo Script (for presentation)

1. Login as **admin** → show System Overview, Teachers, Classes
2. Login as **sarah.j@classmind.ai** → open CS401 → start attendance scanner
3. Face mark → show live session / Resume
4. Run emotion scan briefly → open Teacher Analytics
5. Upload a small material → show AI summary (or Demo Summary)
6. Login as **student@classmind.ai** → enrolled classes + class-scoped notifications

---

## 📚 More docs

- Python AI deep-dive: [`ClassMind.ai/README.md`](ClassMind.ai/README.md)
- Demo assets & regenerator: [`docs/demo/`](docs/demo/)

---

## 🛡 License

Private / academic project unless otherwise stated by the authors.
Ask the repository owner before redistributing.

---

<p align="center">
  <sub>Built for smarter classrooms — ClassMind.ai</sub>
</p>
