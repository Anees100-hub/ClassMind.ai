import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { apiFetch } from '../utils/api';
import { motion as MOTION, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Camera, AlertCircle, CheckCircle2, ShieldAlert, Settings,
    Cpu, WifiOff, UserCheck, UserX, Clock, Users, Play, RefreshCw,
    Smile, Sparkles, Video, Activity
} from 'lucide-react';

const EMOTION_CLIP_DURATION_SECONDS = 120;
const EMOTION_CLIP_FRAME_COUNT = 30;
const EMOTION_CLIP_FRAME_INTERVAL_MS = (EMOTION_CLIP_DURATION_SECONDS * 1000) / EMOTION_CLIP_FRAME_COUNT;

const TeacherAttendanceScanner = () => {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const { getTeacherCourse, teachers, updateClass, refreshData } = useData(); // refreshData used after face register

    const currentCourse = getTeacherCourse(currentUser?.email, courseId);
    const teacherProfile = teachers.find(t => t.email === currentUser?.email);

    // Scanner States
    const [webcamStream, setWebcamStream] = useState(null);
    const [cameraError, setCameraError] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [scanningStatus, setScanningStatus] = useState('Initializing camera...');
    const [isScanning, setIsScanning] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [successDetails, setSuccessDetails] = useState(null);
    const [lectureIdState, setLectureIdState] = useState(null);
    const [isLectureLive, setIsLectureLive] = useState(false);
    const feedIntervalRef = useRef(null);

    // Face registration state
    const [isRegistering, setIsRegistering] = useState(false);
    const [registerSuccess, setRegisterSuccess] = useState(false);
    const [registerError, setRegisterError] = useState('');

    // Python AI server: null=checking, true=online, false=offline
    const [pythonServerOnline, setPythonServerOnline] = useState(null);
    // face_recognition library installed on Python server
    const [faceRecognitionAvailable, setFaceRecognitionAvailable] = useState(null);
    const [recognitionBackend, setRecognitionBackend] = useState(null);
    const [expectedDescriptorDim, setExpectedDescriptorDim] = useState(512);
    const [needsFaceReregistration, setNeedsFaceReregistration] = useState(false);
    const [isRetraining, setIsRetraining] = useState(false);
    // Face recognition model: null=checking, true=encodings loaded, false=not ready
    const [pythonOnline, setPythonOnline] = useState(null);
    // Python emotion engine readiness
    const [pythonEmotionReady, setPythonEmotionReady] = useState(null);
    const aiMode = pythonOnline === true;

    // Derived: does this teacher have a valid face registered for the active AI backend?
    const descriptorLen = teacherProfile?.faceDescriptor?.length || 0;
    const faceRegistered = descriptorLen >= expectedDescriptorDim;
    const hasLegacyFace = descriptorLen > 0 && descriptorLen < expectedDescriptorDim;

    // Simulation settings
    const [simMultipleFaces, setSimMultipleFaces] = useState(false);
    const [simUnknownFace, setSimUnknownFace] = useState(false);
    const [simSideFace, setSimSideFace] = useState(false);
    const [simHalfFace, setSimHalfFace] = useState(false);
    const [simLowLighting, setSimLowLighting] = useState(false);
    const [simTooFar, setSimTooFar] = useState(false);

    // ------------------------------------------------------------------
    // STUDENT EMOTION DETECTION WORKFLOW STATES
    // ------------------------------------------------------------------
    const [isEmotionMode, setIsEmotionMode] = useState(false);
    const [sessionIdState, setSessionIdState] = useState(null);
    const [isRecordingClip, setIsRecordingClip] = useState(false);
    const [clipRecordingProgress, setClipRecordingProgress] = useState(0);
    const [emotionResults, setEmotionResults] = useState({ Happy: 0, Engaged: 0, Neutral: 0, Disengaged: 0 });
    const [totalStudentsDetected, setTotalStudentsDetected] = useState(0);
    const [segmentIndex, setSegmentIndex] = useState(1);
    const [scanHistory, setScanHistory] = useState([]);
    const [sessionResumed, setSessionResumed] = useState(false);

    // Schedule & Duration Timers
    const [secondsToNextScan, setSecondsToNextScan] = useState(0);
    const [totalLectureElapsedSeconds, setTotalLectureElapsedSeconds] = useState(0);
    const [fastDemoMode, setFastDemoMode] = useState(false); // Fast schedule toggle (10s intervals for fast demo)

    // Classroom V380 credentials are permanent in ClassMind.ai/.env — UI only shows status
    const [classroomStatus, setClassroomStatus] = useState(null);
    const [classroomBusy, setClassroomBusy] = useState(false);
    const [classroomPreviewKey, setClassroomPreviewKey] = useState(0);
    const [showClassroomEdit, setShowClassroomEdit] = useState(false);
    const [classroomRtspUrl, setClassroomRtspUrl] = useState(() => localStorage.getItem('classmind_classroom_rtsp') || '');
    const [classroomUser, setClassroomUser] = useState(() => localStorage.getItem('classmind_classroom_user') || '');
    const [classroomPass, setClassroomPass] = useState(() => localStorage.getItem('classmind_classroom_pass') || '');
    const [emotionSourcesUsed, setEmotionSourcesUsed] = useState([]);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const webcamStreamRef = useRef(null);
    const scanTimerRef = useRef(null);
    const scheduleTimerRef = useRef(null);
    const lectureTimerRef = useRef(null);
    const isRecordingClipRef = useRef(false);
    const classroomStatusRef = useRef(null);
    classroomStatusRef.current = classroomStatus;

    // Helper format seconds as MM:SS
    const formatTimeMMSS = (sec) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    // Wait until the video element has frames ready to capture
    const waitForVideoReady = useCallback((video, timeoutMs = 8000) => {
        return new Promise((resolve, reject) => {
            if (!video) {
                reject(new Error('No video element'));
                return;
            }
            const isReady = () => video.videoWidth > 0 && video.readyState >= 2;
            if (isReady()) {
                resolve(video);
                return;
            }
            const onReady = () => {
                if (isReady()) {
                    video.removeEventListener('loadeddata', onReady);
                    video.removeEventListener('playing', onReady);
                    clearTimeout(timer);
                    resolve(video);
                }
            };
            video.addEventListener('loadeddata', onReady);
            video.addEventListener('playing', onReady);
            const timer = setTimeout(() => {
                video.removeEventListener('loadeddata', onReady);
                video.removeEventListener('playing', onReady);
                reject(new Error('Camera feed not ready'));
            }, timeoutMs);
        });
    }, []);

    // Check Python server status (online vs face-model ready are separate)
    const checkPythonServer = useCallback(async () => {
        try {
            const pingRes = await fetch('/python-api/face/ping', { signal: AbortSignal.timeout(8000) });
            if (!pingRes.ok) throw new Error('Python AI server ping failed');

            const res = await fetch('/python-api/face/status', { signal: AbortSignal.timeout(15000) });
            if (res.ok) {
                const data = await res.json();
                const serverOnline = data.online !== false;
                const recAvailable = data.recognition_available === true || (data.recognition_available !== false && data.deepface_available === true);
                const modelReady = !!data.model_ready && recAvailable;
                const emotionReady = data.emotion_ready === true;
                const backend = data.recognition_backend || (data.deepface_available ? 'deepface' : null);
                const expectedDim = data.expected_descriptor_dim || (backend === 'deepface' ? 512 : 128);
                setPythonServerOnline(serverOnline);
                setFaceRecognitionAvailable(recAvailable);
                setRecognitionBackend(backend);
                setExpectedDescriptorDim(expectedDim);
                setNeedsFaceReregistration(!!data.needs_face_reregistration);
                setPythonOnline(modelReady);
                setPythonEmotionReady(emotionReady);
                return { online: serverOnline, modelReady, emotionReady, recognitionAvailable: recAvailable, recognitionBackend: backend };
            }
            setPythonServerOnline(false);
            setFaceRecognitionAvailable(false);
            setRecognitionBackend(null);
            setExpectedDescriptorDim(512);
            setNeedsFaceReregistration(false);
            setPythonOnline(false);
            setPythonEmotionReady(false);
            return { online: false, modelReady: false, emotionReady: false, recognitionAvailable: false, recognitionBackend: null };
        } catch {
            setPythonServerOnline(false);
            setFaceRecognitionAvailable(false);
            setRecognitionBackend(null);
            setPythonOnline(false);
            setPythonEmotionReady(false);
            return { online: false, modelReady: false, emotionReady: false, recognitionAvailable: false, recognitionBackend: null };
        }
    }, []);

    // Capture current webcam frame as JPEG blob
    const captureFrameAsBlob = useCallback(() => {
        return new Promise((resolve, reject) => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (!video || !canvas) return reject(new Error('No video/canvas ref'));
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas toBlob failed'));
            }, 'image/jpeg', 0.92);
        });
    }, []);

    // Teacher face recognition — laptop FRONT camera only
    const startCamera = async () => {
        setCameraError(false);
        setErrorMessage('');
        setSuccessMessage('');
        setScanProgress(0);
        setScanningStatus('Accessing laptop front camera...');
        setIsScanning(false);

        try {
            if (webcamStreamRef.current) {
                webcamStreamRef.current.getTracks().forEach(track => track.stop());
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' }
            });
            webcamStreamRef.current = stream;
            setWebcamStream(stream);

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }

            setScanningStatus('Front camera ready (teacher attendance only). Waiting for face model...');
        } catch (err) {
            console.error("Camera access failed:", err);
            setCameraError(true);
            setScanningStatus('Camera Failure');
            setErrorMessage('Camera Failure: Laptop front camera required for teacher attendance.');
        }
    };

    // Capture a few frames from a specific facingMode (user=front, environment=back)
    const captureFramesFromFacing = async (facingMode, count, intervalMs) => {
        let stream = null;
        const frames = [];
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: { ideal: facingMode } }
            });
            const video = document.createElement('video');
            video.playsInline = true;
            video.muted = true;
            video.srcObject = stream;
            await video.play().catch(() => {});
            await waitForVideoReady(video, 6000);
            const canvas = document.createElement('canvas');
            for (let i = 0; i < count; i++) {
                if (i > 0) await new Promise(r => setTimeout(r, intervalMs));
                if (video.videoWidth > 0) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    canvas.getContext('2d').drawImage(video, 0, 0);
                    frames.push(canvas.toDataURL('image/jpeg', 0.72));
                }
            }
        } catch (err) {
            console.warn(`Could not open ${facingMode} camera:`, err.message);
        } finally {
            if (stream) stream.getTracks().forEach(t => t.stop());
        }
        return frames;
    };

    // Start face scan only when model is trained and teacher face is registered
    useEffect(() => {
        if (sessionResumed || isLectureLive || isEmotionMode) {
            return;
        }
        if (isEmotionMode || cameraError || successMessage || !webcamStream) {
            return;
        }
        if (!faceRegistered) {
            setIsScanning(false);
            setScanningStatus('Register your face before attendance can be marked.');
            return;
        }
        if (!aiMode) {
            setIsScanning(false);
            setScanningStatus('Face recognition model not ready. Ask admin to register faces and retrain the AI model.');
            return;
        }
        setScanProgress(0);
        setIsScanning(true);
        setScanningStatus('Scanning front camera... Align face inside guide.');
    }, [sessionResumed, isLectureLive, isEmotionMode, cameraError, successMessage, webcamStream, faceRegistered, aiMode]);

    useEffect(() => {
        checkPythonServer();
        startCamera();
        fetch('/python-api/classroom-camera/status')
            .then(r => r.json())
            .then(data => setClassroomStatus(data))
            .catch(() => { });
        return () => {
            if (webcamStreamRef.current) {
                webcamStreamRef.current.getTracks().forEach(track => track.stop());
                webcamStreamRef.current = null;
            }
            if (scanTimerRef.current) clearInterval(scanTimerRef.current);
            if (scheduleTimerRef.current) clearInterval(scheduleTimerRef.current);
            if (lectureTimerRef.current) clearInterval(lectureTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-bind front camera to the emotion-mode <video> after it mounts
    useEffect(() => {
        if (!isEmotionMode || !webcamStreamRef.current || !videoRef.current) return;
        videoRef.current.srcObject = webcamStreamRef.current;
        videoRef.current.play().catch(() => { });
    }, [isEmotionMode]);

    // Face registration handler — requires Python face_recognition + dataset upload + train
    const handleRegisterFace = async () => {
        if (!teacherProfile) return;
        if (!pythonServerOnline) {
            setRegisterError('Python AI server is offline. Start the FastAPI server before registering your face.');
            return;
        }
        if (!faceRecognitionAvailable) {
            setRegisterError('Face recognition is not available. Install deepface or face_recognition on the Python AI server.');
            return;
        }

        setIsRegistering(true);
        setRegisterError('');
        setRegisterSuccess(false);
        try {
            await waitForVideoReady(videoRef.current, 10000);
            const blob = await captureFrameAsBlob();
            const teacherId = String(teacherProfile.id);

            const uploadForm = new FormData();
            uploadForm.append('teacher_id', teacherId);
            uploadForm.append('file', blob, `teacher_${teacherId}_capture.jpg`);

            const uploadRes = await fetch('/python-api/face/upload-photo', {
                method: 'POST',
                body: uploadForm,
                signal: AbortSignal.timeout(120000),
            });
            const uploadData = await uploadRes.json();
            if (!uploadRes.ok) throw new Error(uploadData.detail || 'Photo upload failed');

            const regForm = new FormData();
            regForm.append('teacher_id', teacherId);
            regForm.append('file', blob, `teacher_${teacherId}_capture.jpg`);

            const regRes = await fetch('/python-api/face/register-to-db', {
                method: 'POST',
                body: regForm,
                signal: AbortSignal.timeout(180000),
            });
            const regData = await regRes.json().catch(() => ({}));
            if (!regRes.ok) {
                const detail = regData.detail;
                throw new Error(typeof detail === 'string' ? detail : (detail?.[0]?.msg || 'Face descriptor registration failed'));
            }
            if (!regData.descriptor || !Array.isArray(regData.descriptor) || regData.descriptor.length < expectedDescriptorDim) {
                throw new Error(`Invalid face descriptor (${regData.descriptor?.length || 0}D). Expected at least ${expectedDescriptorDim}D. Try again with better lighting / face the camera.`);
            }

            // Node has the working Mongo connection — always persist here (with auth token)
            const nodeRes = await apiFetch('/api/teachers/register-face', {
                method: 'POST',
                body: JSON.stringify({
                    teacherId: teacherProfile.id,
                    faceDescriptor: regData.descriptor
                }),
            });
            if (!nodeRes.ok) {
                const nodeErr = await nodeRes.json().catch(() => ({}));
                throw new Error(nodeErr.message || 'Failed to save face to teacher profile (login session may have expired — log in again).');
            }

            // Train model — do not fail registration if train is slow/fails; user can retrain
            try {
                const trainRes = await fetch('/python-api/face/train?sync=true', {
                    method: 'POST',
                    signal: AbortSignal.timeout(180000),
                });
                if (!trainRes.ok) {
                    console.warn('Train after register failed; face is still saved in DB');
                }
            } catch (trainErr) {
                console.warn('Train after register error:', trainErr);
            }

            await refreshData?.();
            await checkPythonServer();
            setRegisterSuccess(true);
            setTimeout(() => window.location.reload(), 1200);
        } catch (err) {
            const msg = err?.message || 'Face registration error';
            setRegisterError(msg);
            console.error('Face registration failed:', err);
        } finally {
            setIsRegistering(false);
        }
    };

    const handleRetrainModel = async () => {
        if (!pythonServerOnline || !faceRecognitionAvailable) {
            setRegisterError('Python AI server or face recognition backend is not available.');
            return;
        }
        setIsRetraining(true);
        setRegisterError('');
        try {
            const res = await fetch('/python-api/face/train?sync=true', { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.detail || 'Training failed. Re-register your face from the camera first.');
            }
            const status = await checkPythonServer();
            if (!status.modelReady) {
                throw new Error('Model still not ready. Please use Register Face Now to capture a new photo.');
            }
        } catch (err) {
            setRegisterError(err.message || 'Retrain failed');
        } finally {
            setIsRetraining(false);
        }
    };

    // Perform Face Recognition Logic (triggered when scan reaches 100%)
    const handleFaceVerification = async () => {
        setIsScanning(false);
        setScanningStatus('Verifying face descriptor matching...');

        if (simMultipleFaces) {
            setErrorMessage('Multiple faces detected. Please ensure only the teacher is visible.');
            setScanningStatus('Scan Rejected');
            return;
        }
        if (simUnknownFace) {
            setErrorMessage('Unknown faces must not be marked as present. Match confidence below threshold (45%).');
            setScanningStatus('Verification Failed');
            return;
        }
        if (simSideFace) {
            setErrorMessage('Biometric Validation Failed: Side face detected. Look straight into camera.');
            setScanningStatus('Scan Rejected');
            return;
        }
        if (simHalfFace) {
            setErrorMessage('Biometric Validation Failed: Partial face detected. Ensure full face is visible.');
            setScanningStatus('Scan Rejected');
            return;
        }
        if (simLowLighting) {
            setErrorMessage('Biometric Validation Failed: Poor illumination / low lighting.');
            setScanningStatus('Scan Rejected');
            return;
        }
        if (simTooFar) {
            setErrorMessage('Biometric Validation Failed: Face is too far or offset from center.');
            setScanningStatus('Scan Rejected');
            return;
        }

        const isAssigned = teacherProfile?.assignedClasses?.includes(courseId)
            || Number(currentCourse?.instructorId) === Number(teacherProfile?.id);
        const lectureId = `LEC-${new Date().toISOString().split('T')[0]}`;

        if (!aiMode) {
            setErrorMessage('Face recognition is unavailable. The AI model must be trained with your registered face before attendance can be marked.');
            setScanningStatus('Verification Failed — Model Not Ready');
            return;
        }

        let confidence;
        try {
            setScanningStatus('Sending frame to AI recognition server...');
            const frameBlob = await captureFrameAsBlob();
            const formData = new FormData();
            formData.append('file', frameBlob, 'frame.jpg');

            const pyRes = await fetch('/python-api/face/recognize', {
                method: 'POST',
                body: formData,
            });

            if (!pyRes.ok) {
                const errData = await pyRes.json().catch(() => ({}));
                throw new Error(errData.detail || `Python server returned ${pyRes.status}`);
            }
            const recognitionResult = await pyRes.json();

            if (recognitionResult.multiple_faces) {
                setErrorMessage('Multiple faces detected in frame. Only teacher should be in view.');
                setScanningStatus('Scan Rejected — Multiple Faces');
                return;
            }

            if (!recognitionResult.matched) {
                setErrorMessage(recognitionResult.message || `Face not recognized (confidence: ${(recognitionResult.confidence * 100).toFixed(0)}%). Only your registered face can mark attendance.`);
                setScanningStatus('Verification Failed — Unknown Face');
                return;
            }

            const recognizedId = String(recognitionResult.teacher_id);
            const loggedInId = String(teacherProfile?.id);
            if (recognizedId !== loggedInId) {
                setErrorMessage(`Identity mismatch — recognized Teacher ID ${recognizedId}, logged in as ${loggedInId}.`);
                setScanningStatus('Verification Failed — Identity Mismatch');
                return;
            }

            confidence = recognitionResult.confidence;
            if (confidence < 0.8) {
                setErrorMessage(`Match confidence too low (${(confidence * 100).toFixed(0)}%). Minimum 80% required.`);
                setScanningStatus('Verification Failed — Low Confidence');
                return;
            }

            setScanningStatus('AI Match Confirmed...');
        } catch (pyErr) {
            console.error('[ClassMind.ai] Python recognition error:', pyErr);
            setErrorMessage(pyErr.message || 'Face recognition failed. Ensure the AI server is running and your face is registered.');
            setScanningStatus('Verification Failed');
            return;
        }

        if (!isAssigned) {
            setErrorMessage('Teacher must be assigned to the class before attendance can be marked.');
            setScanningStatus('Verification Failed');
            return;
        }

        try {
            const res = await apiFetch('/api/attendance/mark', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    teacherId: teacherProfile.id,
                    classId: courseId,
                    lectureId,
                    confidence,
                    recognitionMethod: recognitionBackend || 'deepface'
                })
            });

            const data = await res.json();

            // Success: attendance newly recorded (201)
            if (res.ok) {
                setSuccessMessage('Teacher Verified Successfully!');
                setSuccessDetails(data);
                setScanningStatus('Teacher Verified');

                await updateClass(courseId, {
                    lectureStatus: 'Active',
                    lectureStartTime: new Date(),
                    lectureId: lectureId
                });

                setLectureIdState(lectureId);
                setIsLectureLive(true);

                // AUTOMATIC WORKFLOW TRANSITION:
                // Keep front camera active for student emotion detection
                setTimeout(() => {
                    setSuccessMessage('');
                    startStudentEmotionWorkflow(lectureId);
                }, 1500);

                // Already recorded (409): attendance exists — resume the lecture workflow
            } else if (res.status === 409 && data.alreadyRecorded) {
                setSuccessMessage('Lecture Already Active — Resuming Emotion Detection');
                setSuccessDetails(data);
                setScanningStatus('Lecture Resumed');

                await updateClass(courseId, {
                    lectureStatus: 'Active',
                    lectureId: lectureId
                });

                setLectureIdState(lectureId);
                setIsLectureLive(true);

                setTimeout(() => {
                    setSuccessMessage('');
                    startStudentEmotionWorkflow(lectureId);
                }, 1500);

            } else {
                setErrorMessage(data.message || 'Verification Error');
                setScanningStatus('Verification Failed');
            }
        } catch (err) {
            console.error("Attendance submission failed:", err);
            setErrorMessage('Network Error. Failed to mark attendance.');
            setScanningStatus('Network Error');
        }
    };

    // ------------------------------------------------------------------
    // STUDENT EMOTION DETECTION WORKFLOW IMPLEMENTATION
    // ------------------------------------------------------------------

    const classroomPayload = () => {
        // Empty body → AI server uses permanent ClassMind.ai/.env credentials
        const payload = {};
        if (classroomRtspUrl.trim()) payload.url = classroomRtspUrl.trim();
        if (classroomUser.trim()) payload.username = classroomUser.trim();
        if (classroomPass) payload.password = classroomPass;
        return payload;
    };

    const refreshClassroomStatus = async () => {
        try {
            const res = await fetch('/python-api/classroom-camera/status');
            const data = await res.json().catch(() => null);
            if (data) setClassroomStatus(data);
        } catch (_) { /* ignore */ }
    };

    const isTimeoutError = (err) => {
        const msg = String(err?.message || err || '').toLowerCase();
        return msg.includes('timeout') || msg.includes('timed out') || err?.name === 'TimeoutError' || err?.name === 'AbortError';
    };

    const testClassroomCamera = async () => {
        setClassroomBusy(true);
        // Never surface classroom timeout as Scanning Failure
        try {
            const res = await fetch('/python-api/classroom-camera/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(classroomPayload()),
                signal: AbortSignal.timeout(90000),
            });
            const data = await res.json().catch(() => ({}));
            setClassroomStatus(data);
            if (data.has_frame || data.ok) setClassroomPreviewKey(Date.now());
        } catch (err) {
            if (!isTimeoutError(err)) {
                setClassroomStatus(prev => ({ ...(prev || {}), reconnecting: true, last_error: 'Connecting classroom camera…' }));
            } else {
                setClassroomStatus(prev => ({ ...(prev || {}), reconnecting: true, last_error: 'Connecting classroom camera…' }));
            }
        } finally {
            setClassroomBusy(false);
        }
    };

    const connectClassroomCamera = async (silent = false) => {
        // Already live — do not reopen RTSP (that made emotion stick on "Connecting")
        if (classroomStatusRef.current?.has_frame || classroomStatusRef.current?.running) {
            await refreshClassroomStatus();
            return true;
        }
        setClassroomBusy(true);
        try {
            const payload = classroomPayload();
            if (payload.url) localStorage.setItem('classmind_classroom_rtsp', payload.url);
            if (payload.username) localStorage.setItem('classmind_classroom_user', payload.username);
            if (payload.password) localStorage.setItem('classmind_classroom_pass', payload.password);

            const res = await fetch('/python-api/classroom-camera/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(90000),
            });
            const data = await res.json().catch(() => ({}));
            setClassroomStatus({
                ...data,
                running: !!(data.running || data.has_frame || data.ok),
                has_frame: !!(data.has_frame || data.ok),
                last_error: data.has_frame || data.ok ? null : (data.last_error || null),
            });
            // Do not bump classroomPreviewKey here — remounting MJPEG stops the video
            return !!(data.has_frame || data.running || data.ok);
        } catch (err) {
            setClassroomStatus(prev => ({
                ...(prev || {}),
                reconnecting: true,
            }));
            return false;
        } finally {
            setClassroomBusy(false);
        }
    };

    // Emotion mode: connect once. Never remount the MJPEG <img> (key changes kill the video).
    useEffect(() => {
        if (!isEmotionMode) return undefined;
        let cancelled = false;
        (async () => {
            await refreshClassroomStatus();
            const st = classroomStatusRef.current;
            if (!cancelled && !st?.has_frame && !st?.running) {
                await connectClassroomCamera(true);
            }
        })();
        const statusId = setInterval(() => {
            if (cancelled || isRecordingClipRef.current) return;
            refreshClassroomStatus();
        }, 8000);
        return () => {
            cancelled = true;
            clearInterval(statusId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEmotionMode]);

    const startStudentEmotionWorkflow = async (lecId, resumeOptions = null) => {
        const newSessionId = resumeOptions?.sessionId || `SES-${Date.now()}`;
        setSessionIdState(newSessionId);

        const { online: serverOnline, emotionReady } = await checkPythonServer();
        if (!serverOnline) {
            setErrorMessage('AI server is offline. Student emotion detection requires the Python AI server to be running.');
            setIsEmotionMode(false);
            return;
        }
        if (!emotionReady) {
            setErrorMessage('Emotion detection is not fully available. The Python AI server is running but the DeepFace emotion engine is not installed.');
            setIsEmotionMode(false);
            return;
        }

        setIsEmotionMode(true);
        setErrorMessage('');
        setSuccessMessage('');

        // Keep laptop FRONT camera open for emotion preview + frame capture
        try {
            let stream = webcamStreamRef.current;
            if (!stream || stream.getVideoTracks().every(t => t.readyState === 'ended')) {
                if (stream) stream.getTracks().forEach(track => track.stop());
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 640, height: 480, facingMode: 'user' }
                });
                webcamStreamRef.current = stream;
                setWebcamStream(stream);
            }
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play().catch(() => { });
                await waitForVideoReady(videoRef.current);
            }
        } catch (err) {
            console.error('Front camera initialization error:', err);
            setErrorMessage('Could not access laptop front camera for emotion detection. Please allow camera permissions.');
            setIsEmotionMode(false);
            return;
        }

        // Soft-connect classroom if needed (won't remount preview / reopen RTSP if live)
        await connectClassroomCamera(true);

        startLectureDurationTimer(lecId);

        if (resumeOptions?.skipInitialCapture) {
            const nextSeg = resumeOptions.nextSegment || 1;
            setSegmentIndex(Math.max(0, nextSeg - 1));
            if (resumeOptions.history?.length) {
                setScanHistory(resumeOptions.history);
            }
            setSuccessMessage(`Resumed session ${lecId}. Next segment: #${nextSeg}`);
            const initialDelay = fastDemoMode ? 10 : 30 * 60;
            startScheduleCountdown(lecId, newSessionId, initialDelay, nextSeg);
            return;
        }

        // Let MJPEG preview settle before first emotion clip
        await new Promise(r => setTimeout(r, 1500));
        await captureAndAnalyzeClip(lecId, newSessionId, 1);

        const initialDelay = fastDemoMode ? 10 : 30 * 60;
        startScheduleCountdown(lecId, newSessionId, initialDelay, 2);
    };

    const resumeActiveLecture = async (lecId) => {
        try {
            const res = await apiFetch(`/api/engagement/emotion-records/${lecId}`);
            const data = res.ok ? await res.json() : { records: [] };
            const records = data.records || [];
            const maxSeg = records.reduce((max, r) => Math.max(max, r.segmentNumber || 0), 0);
            const lastSessionId = records.length
                ? records[records.length - 1].sessionId
                : `SES-${Date.now()}`;
            const history = records
                .slice()
                .reverse()
                .map(r => ({
                    segmentNumber: r.segmentNumber,
                    timestamp: new Date(r.timestamp).toLocaleTimeString(),
                    students: r.totalStudents,
                    emotions: r.emotions
                }));

            setLectureIdState(lecId);
            setIsLectureLive(true);
            setSessionResumed(true);
            setIsScanning(false);

            await startStudentEmotionWorkflow(lecId, {
                sessionId: lastSessionId,
                nextSegment: maxSeg + 1,
                history,
                skipInitialCapture: true
            });
        } catch (err) {
            console.error('Failed to resume lecture session:', err);
            setErrorMessage('Could not resume the active session. Try starting the scanner again.');
        }
    };

    useEffect(() => {
        if (!currentCourse || sessionResumed || isLectureLive) return;
        if (currentCourse.lectureStatus === 'Active' && currentCourse.lectureId) {
            resumeActiveLecture(currentCourse.lectureId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentCourse?.lectureStatus, currentCourse?.lectureId, sessionResumed, isLectureLive]);

    // Multi-camera emotion: laptop front (+ back if 2nd device) + classroom V380
    const captureAndAnalyzeClip = async (lecId, sessId, segNum) => {
        if (isRecordingClipRef.current) return;
        isRecordingClipRef.current = true;
        setIsRecordingClip(true);
        setClipRecordingProgress(0);
        setErrorMessage('');

        let clipResult = null;
        let apiError = null;
        const sources = [];

        try {
            const frontCount = fastDemoMode ? 4 : 8;
            const backCount = fastDemoMode ? 2 : 4;
            const intervalMs = fastDemoMode ? 250 : 300;

            // 1) Laptop FRONT (keep live preview stream — do not reopen)
            setClipRecordingProgress(10);
            const frontFrames = [];
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (video && canvas) {
                try {
                    await waitForVideoReady(video, 5000);
                    for (let i = 0; i < frontCount; i++) {
                        if (i > 0) await new Promise(r => setTimeout(r, intervalMs));
                        setClipRecordingProgress(10 + Math.round((i / frontCount) * 30));
                        if (video.videoWidth > 0) {
                            canvas.width = video.videoWidth;
                            canvas.height = video.videoHeight;
                            canvas.getContext('2d').drawImage(video, 0, 0);
                            frontFrames.push(canvas.toDataURL('image/jpeg', 0.72));
                        }
                    }
                } catch (_) { /* ignore */ }
            }
            if (!frontFrames.length) {
                const extra = await captureFramesFromFacing('user', frontCount, intervalMs);
                frontFrames.push(...extra);
            }
            if (frontFrames.length) sources.push('front');

            // 2) Back camera only if a second video input exists (avoids killing front cam)
            setClipRecordingProgress(45);
            let backFrames = [];
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const cams = devices.filter(d => d.kind === 'videoinput');
                if (cams.length > 1) {
                    backFrames = await captureFramesFromFacing('environment', backCount, intervalMs);
                    if (backFrames.length) sources.push('back');
                    if (webcamStreamRef.current && videoRef.current) {
                        videoRef.current.srcObject = webcamStreamRef.current;
                        await videoRef.current.play().catch(() => { });
                    }
                }
            } catch (_) { /* back camera optional */ }

            // 3) Ensure classroom stream once (AI server uses cached frames)
            setClipRecordingProgress(60);
            if (!classroomStatus?.running) {
                await connectClassroomCamera(true);
            }
            setEmotionSourcesUsed([...sources, 'classroom']);
            setClipRecordingProgress(70);

            let pyRes = await fetch('/python-api/emotion/analyze-multi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lectureId: lecId,
                    classId: courseId,
                    sessionId: sessId,
                    segmentNumber: segNum,
                    frontFrames,
                    backFrames,
                    useClassroom: true,
                    classroomFrameCount: fastDemoMode ? 3 : 4,
                    classroomIntervalMs: 200,
                    timestamp: new Date().toISOString()
                }),
                signal: AbortSignal.timeout(300000),
            });

            if (pyRes.ok) {
                clipResult = await pyRes.json();
            } else {
                const errBody = await pyRes.json().catch(() => ({}));
                // Fallback: front-only if multi-cam returns 500 / server died mid-request
                if (frontFrames.length) {
                    console.warn('analyze-multi failed, falling back to front-only:', errBody);
                    const fbRes = await fetch('/python-api/emotion/analyze-clip', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            lectureId: lecId,
                            classId: courseId,
                            sessionId: sessId,
                            segmentNumber: segNum,
                            frames: frontFrames.slice(0, 10),
                            timestamp: new Date().toISOString()
                        }),
                        signal: AbortSignal.timeout(300000),
                    });
                    if (fbRes.ok) {
                        clipResult = await fbRes.json();
                        clipResult.cameraSources = ['front'];
                        clipResult.classroomError = errBody.detail || 'Classroom/multi-cam unavailable — used front camera';
                    } else {
                        const err2 = await fbRes.json().catch(() => ({}));
                        apiError = err2.detail || errBody.detail || `AI server returned ${fbRes.status}`;
                    }
                } else {
                    apiError = errBody.detail || `AI server returned ${pyRes.status}`;
                }
            }
            setClipRecordingProgress(95);
        } catch (err) {
            apiError = err.message || 'Could not reach multi-camera emotion API';
        }

        isRecordingClipRef.current = false;
        setIsRecordingClip(false);
        setClipRecordingProgress(100);
        refreshClassroomStatus();

        if (!clipResult) {
            const soft = isTimeoutError(apiError) || /signal timed out|timed out|TimeoutError|AbortError|reconnecting/i.test(String(apiError || ''));
            if (!soft) {
                setErrorMessage(apiError || 'Real AI emotion results are unavailable. Ensure the Python AI server is running.');
            } else {
                // Do not show signal timeout as Scanning Failure — keep reconnecting
                setErrorMessage('');
                connectClassroomCamera(true);
            }
            setScanHistory(prev => [
                {
                    segmentNumber: segNum,
                    timestamp: new Date().toLocaleTimeString(),
                    students: 0,
                    emotions: { Happy: 0, Engaged: 0, Neutral: 0, Disengaged: 0 },
                    note: soft ? 'Waiting for classroom camera…' : 'Analysis failed'
                },
                ...prev
            ]);
            return;
        }

        const used = clipResult.cameraSources || sources;
        setEmotionSourcesUsed(used);

        const resEmotions = clipResult.emotions || { Happy: 0, Engaged: 0, Neutral: 0, Disengaged: 0 };
        const resStudents = clipResult.totalStudents || clipResult.total_students || 0;

        if (resStudents === 0) {
            setErrorMessage(clipResult.message || 'No students detected. Point cameras toward the class.');
        } else if (clipResult.classroomError) {
            setErrorMessage(''); // soft notice via history, not hard failure
            console.warn('Classroom note:', clipResult.classroomError);
        } else {
            setErrorMessage('');
        }

        setEmotionResults(resEmotions);
        setTotalStudentsDetected(resStudents);
        setSegmentIndex(segNum);

        setScanHistory(prev => [
            {
                segmentNumber: segNum,
                timestamp: new Date().toLocaleTimeString(),
                students: resStudents,
                emotions: resEmotions,
                sources: used,
                note: clipResult.classroomError || undefined
            },
            ...prev
        ]);
    };

    // Scheduler Countdown: First 30 minutes, then every 15 minutes up to 90 minutes
    const startScheduleCountdown = (lecId, sessId, delaySeconds, nextSegNum) => {
        if (scheduleTimerRef.current) clearInterval(scheduleTimerRef.current);

        let remaining = delaySeconds;
        setSecondsToNextScan(remaining);

        scheduleTimerRef.current = setInterval(() => {
            remaining -= 1;
            setSecondsToNextScan(remaining);

            if (remaining <= 0) {
                clearInterval(scheduleTimerRef.current);
                (async () => {
                    await captureAndAnalyzeClip(lecId, sessId, nextSegNum);
                    const nextDelay = fastDemoMode ? 10 : 15 * 60;
                    startScheduleCountdown(lecId, sessId, nextDelay, nextSegNum + 1);
                })();
            }
        }, 1000);
    };

    // 90-minute lecture timer (5400 seconds)
    const startLectureDurationTimer = (lecId) => {
        if (lectureTimerRef.current) clearInterval(lectureTimerRef.current);

        let elapsed = 0;
        lectureTimerRef.current = setInterval(() => {
            elapsed += 1;
            setTotalLectureElapsedSeconds(elapsed);

            const maxDuration = fastDemoMode ? 120 : 90 * 60; // 90 min (or 2 min in demo mode)
            if (elapsed >= maxDuration) {
                clearInterval(lectureTimerRef.current);
                if (scheduleTimerRef.current) clearInterval(scheduleTimerRef.current);
                handleEndLecture();
            }
        }, 1000);
    };

    const handleEndLecture = async () => {
        if (webcamStreamRef.current) {
            webcamStreamRef.current.getTracks().forEach(track => track.stop());
            webcamStreamRef.current = null;
            setWebcamStream(null);
        }
        if (scheduleTimerRef.current) clearInterval(scheduleTimerRef.current);
        if (lectureTimerRef.current) clearInterval(lectureTimerRef.current);

        const targetLecId = lectureIdState || currentCourse?.lectureId || `LEC-${new Date().toISOString().split('T')[0]}`;
        try {
            const res = await apiFetch('/api/engagement/lecture/end', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lectureId: targetLecId, classId: courseId })
            });

            if (res.ok) {
                await updateClass(courseId, {
                    lectureStatus: 'Inactive',
                    lectureStartTime: null,
                    lectureId: null
                });
                await refreshData();
                setTimeout(() => navigate(`/teacher/course/${courseId}/analytics`), 800);
            } else {
                setErrorMessage('Could not finalize session on server. Please try End Analytics again.');
            }
        } catch (err) {
            console.error('Error finalizing lecture analytics:', err);
            setErrorMessage('Network error ending session. Your data may still be saved — check analytics.');
        }
    };

    // Face scan progress timer — only runs when model is ready and face is registered
    useEffect(() => {
        if (isScanning && !cameraError && !isEmotionMode && aiMode && faceRegistered) {
            scanTimerRef.current = setInterval(() => {
                setScanProgress(prev => {
                    const nextVal = prev + 5;
                    if (nextVal >= 100) {
                        clearInterval(scanTimerRef.current);
                        handleFaceVerification();
                        return 100;
                    }
                    if (nextVal < 30) setScanningStatus('Scanning laptop front camera...');
                    else if (nextVal < 60) setScanningStatus('Detecting facial boundaries...');
                    else if (nextVal < 90) setScanningStatus('Analyzing face descriptor vectors...');
                    else setScanningStatus('Verifying against registered MongoDB descriptors...');

                    return nextVal;
                });
            }, 150);
        }

        return () => {
            if (scanTimerRef.current) clearInterval(scanTimerRef.current);
        };
    }, [isScanning, cameraError, simMultipleFaces, simUnknownFace, simSideFace, simHalfFace, simLowLighting, simTooFar, teacherProfile, isEmotionMode, aiMode, faceRegistered]);

    const handleReset = async () => {
        setErrorMessage('');
        setSuccessMessage('');
        setSuccessDetails(null);
        setIsEmotionMode(false);
        if (webcamStreamRef.current) {
            webcamStreamRef.current.getTracks().forEach(track => track.stop());
            webcamStreamRef.current = null;
            setWebcamStream(null);
        }
        await checkPythonServer();
        startCamera();
    };

    if (!currentCourse) {
        return (
            <div style={{ padding: '32px', maxWidth: '640px', margin: '0 auto' }}>
                <div className="dashboard-empty">
                    <ShieldAlert size={56} />
                    <h3>Course Not Available</h3>
                    <p>This class is not assigned to your teacher account or may have been removed.</p>
                    <button onClick={() => navigate('/teacher/dashboard')} className="teacher-btn-main" style={{ marginTop: '16px' }}>
                        Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <MOTION.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ padding: '32px', maxWidth: '1280px', margin: '0 auto' }}
        >
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                <button onClick={() => navigate(`/teacher/course/${courseId}`)} className="close-btn-round" style={{ background: '#FFF', color: 'var(--text-main)', border: '1px solid var(--border)', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', cursor: 'pointer' }}>
                    <ArrowLeft size={20} />
                </button>
                <div style={{ flex: 1 }}>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
                        {isEmotionMode ? 'Student Emotion Detection Workflow' : 'Classroom Teacher Attendance Scanner'}
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                        Class: {currentCourse.name} ({courseId}) {sessionIdState && `• Session: ${sessionIdState}`}
                    </p>
                </div>

                {/* Status Badges */}
                <div style={{ display: 'flex', gap: '10px' }}>
                    {isEmotionMode && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '12px', background: '#EEF2FF', border: '1px solid #C7D2FE', color: '#4338CA', fontSize: '0.8rem', fontWeight: 700 }}>
                            <Video size={16} />
                            <span>
                                Multi-cam emotion
                                {emotionSourcesUsed.length ? `: ${emotionSourcesUsed.join(' + ')}` : ': front + back + classroom'}
                            </span>
                        </div>
                    )}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 16px', borderRadius: '12px',
                        background: pythonServerOnline === true ? '#ECFDF5' : pythonServerOnline === false ? '#FEF2F2' : '#FEF9C3',
                        border: `1px solid ${pythonServerOnline === true ? '#A7F3D0' : pythonServerOnline === false ? '#FCA5A5' : '#FDE68A'}`,
                        fontSize: '0.8rem', fontWeight: 600,
                        color: pythonServerOnline === true ? '#065F46' : pythonServerOnline === false ? '#991B1B' : '#92400E'
                    }}>
                        {pythonServerOnline === true ? <Cpu size={15} /> : pythonServerOnline === false ? <WifiOff size={15} /> : <Camera size={15} />}
                        <span>
                            {pythonServerOnline === true
                                ? (aiMode ? `AI Server: Face Recognition Ready (${recognitionBackend || 'DeepFace'})` : faceRecognitionAvailable === false ? 'AI Server: Install deepface or face_recognition' : 'AI Server: Model Not Trained — register face & retrain')
                                : pythonServerOnline === false ? 'AI Server Offline' : 'Checking...'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Registration / retrain banner */}
            {!isEmotionMode && !registerSuccess && (!faceRegistered || !aiMode) && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '16px',
                    padding: '16px 20px', borderRadius: '14px',
                    background: hasLegacyFace || needsFaceReregistration
                        ? 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)'
                        : 'linear-gradient(135deg, #FEF2F2 0%, #FFF5F5 100%)',
                    border: `1.5px solid ${hasLegacyFace || needsFaceReregistration ? '#FCD34D' : '#FCA5A5'}`,
                    marginBottom: '20px'
                }}>
                    <UserX size={32} color={hasLegacyFace || needsFaceReregistration ? '#D97706' : '#EF4444'} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                        <h3 style={{ margin: 0, color: hasLegacyFace || needsFaceReregistration ? '#92400E' : '#991B1B', fontWeight: 700, fontSize: '1rem' }}>
                            {!faceRegistered ? 'Face Not Registered' : 'AI Model Not Trained'}
                        </h3>
                        <p style={{ margin: '4px 0 0 0', color: hasLegacyFace || needsFaceReregistration ? '#B45309' : '#B91C1C', fontSize: '0.85rem' }}>
                            {hasLegacyFace || needsFaceReregistration
                                ? 'Your saved face data uses an old format. Click Register Face Now to capture a new photo with DeepFace, then the model will train automatically.'
                                : !faceRegistered
                                    ? 'Register your face with the camera before attendance can be marked.'
                                    : 'The recognition model has no trained encodings yet. Register your face or retrain the model.'}
                        </p>
                        {registerError && <p style={{ margin: '4px 0 0 0', color: '#7F1D1D', fontSize: '0.8rem', fontWeight: 600 }}>{registerError}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        {faceRegistered && !aiMode && (
                            <button
                                onClick={handleRetrainModel}
                                disabled={isRetraining || cameraError}
                                style={{
                                    background: isRetraining ? '#9CA3AF' : '#F59E0B',
                                    color: '#FFF', padding: '10px 16px', borderRadius: '10px',
                                    fontWeight: 700, cursor: isRetraining ? 'not-allowed' : 'pointer',
                                    border: 'none', fontSize: '0.85rem'
                                }}
                            >
                                {isRetraining ? 'Training...' : 'Retrain Model'}
                            </button>
                        )}
                        <button
                            onClick={handleRegisterFace}
                            disabled={isRegistering || cameraError}
                            style={{
                                background: isRegistering ? '#9CA3AF' : '#EF4444',
                                color: '#FFF', padding: '10px 20px', borderRadius: '10px',
                                fontWeight: 700, cursor: isRegistering ? 'not-allowed' : 'pointer',
                                border: 'none', fontSize: '0.9rem'
                            }}
                        >
                            {isRegistering ? 'Registering...' : 'Register Face Now'}
                        </button>
                    </div>
                </div>
            )}

            {/* Layout Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '32px', alignItems: 'start', marginTop: '24px' }}>

                {/* Main Scanning & Camera View */}
                <div className="white-card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '520px', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>

                    {/* MODE 1: Teacher Front Camera Scan View */}
                    {!isEmotionMode && !cameraError && !successMessage && (
                        <div style={{ position: 'relative', width: '440px', height: '330px', background: '#000', borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--shadow-lg)', border: '3px solid var(--border)' }}>
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />

                            {/* Circular Scan Reticle */}
                            <div style={{
                                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                width: '220px', height: '220px',
                                border: `4px dashed ${errorMessage ? '#EF4444' : '#00C2FF'}`,
                                borderRadius: '50%', pointerEvents: 'none',
                                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                {isScanning && (
                                    <div style={{
                                        position: 'absolute', width: '100%', height: '3px',
                                        background: 'linear-gradient(90deg, transparent, #00C2FF, transparent)',
                                        animation: 'scanLineHorizontal 2s linear infinite'
                                    }} />
                                )}
                            </div>

                            {/* Corner Guides */}
                            <div style={{ position: 'absolute', top: '20px', left: '20px', width: '24px', height: '24px', borderTop: '4px solid #FFF', borderLeft: '4px solid #FFF' }} />
                            <div style={{ position: 'absolute', top: '20px', right: '20px', width: '24px', height: '24px', borderTop: '4px solid #FFF', borderRight: '4px solid #FFF' }} />
                            <div style={{ position: 'absolute', bottom: '20px', left: '20px', width: '24px', height: '24px', borderBottom: '4px solid #FFF', borderLeft: '4px solid #FFF' }} />
                            <div style={{ position: 'absolute', bottom: '20px', right: '20px', width: '24px', height: '24px', borderBottom: '4px solid #FFF', borderRight: '4px solid #FFF' }} />

                            {isScanning && (
                                <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0, 0, 0, 0.75)', padding: '6px 12px', borderRadius: '12px', color: '#FFF', fontSize: '0.85rem', fontWeight: 600 }}>
                                    Scanning Teacher: {scanProgress}%
                                </div>
                            )}
                        </div>
                    )}

                    {/* MODE 2: Student Emotion — front + classroom preview (back captured per clip) */}
                    {isEmotionMode && (
                        <div style={{ width: '100%', maxWidth: '560px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '10px' }}>
                                <div style={{ position: 'relative', height: '300px', background: '#000', borderRadius: '14px', overflow: 'hidden', border: '3px solid #6366F1' }}>
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                                    />
                                    <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(0,0,0,0.75)', color: '#FFF', padding: '4px 10px', borderRadius: '14px', fontSize: '0.72rem', fontWeight: 700 }}>
                                        Laptop front
                                    </div>
                                </div>
                                <div style={{ position: 'relative', height: '300px', background: '#0F172A', borderRadius: '14px', overflow: 'hidden', border: '3px solid #22C55E' }}>
                                    {/* Stable MJPEG src — never change key/src or the feed dies after ~2s */}
                                    <img
                                        src="/python-api/classroom-camera/stream"
                                        alt="Classroom camera"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                    {!(classroomStatus?.has_frame || classroomStatus?.running || classroomStatus?.ok) && (
                                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '0.75rem', padding: '12px', textAlign: 'center', background: 'rgba(15,23,42,0.55)', pointerEvents: 'none' }}>
                                            {classroomBusy ? 'Connecting classroom camera…' : 'Waiting for classroom stream…'}
                                        </div>
                                    )}
                                    <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(0,0,0,0.75)', color: '#FFF', padding: '4px 10px', borderRadius: '14px', fontSize: '0.72rem', fontWeight: 700 }}>
                                        Classroom V380
                                    </div>
                                </div>
                            </div>
                            <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#64748B', textAlign: 'center' }}>
                                Back camera is captured automatically each clip when available. Teacher face login uses front camera only.
                            </p>

                            {isRecordingClip && (
                                <div style={{ marginTop: '12px', background: '#0F172A', padding: '12px 16px', borderRadius: '12px', border: '1px solid #EF4444' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#FFF', fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>
                                        <span>Recording multi-camera emotion clip…</span>
                                        <span>{clipRecordingProgress}%</span>
                                    </div>
                                    <div style={{ width: '100%', height: '6px', background: '#374151', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{ width: `${clipRecordingProgress}%`, height: '100%', background: 'linear-gradient(90deg, #EF4444, #F59E0B)', transition: 'width 0.2s linear' }} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Camera Error View */}
                    {cameraError && (
                        <div style={{ textAlign: 'center', padding: '40px', background: '#FEF2F2', borderRadius: '16px', border: '1px solid #FCA5A5', maxWidth: '500px' }}>
                            <AlertCircle size={48} color="#EF4444" style={{ marginBottom: '16px' }} />
                            <h3 style={{ margin: 0, color: '#991B1B', fontWeight: 700 }}>Camera Stream Initialization Failed</h3>
                            <p style={{ color: '#B91C1C', fontSize: '0.9rem', marginTop: '8px' }}>
                                Unable to acquire media stream. Please check camera permissions.
                            </p>
                            <button onClick={startCamera} className="btn-primary" style={{ background: '#EF4444', color: '#FFF', marginTop: '16px', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>
                                Retry Camera
                            </button>
                        </div>
                    )}

                    {/* Failure / warning message */}
                    {errorMessage && (
                        <div style={{
                            textAlign: 'center', padding: '24px', borderRadius: '16px', maxWidth: '500px', marginTop: '24px', boxShadow: 'var(--shadow-md)',
                            background: errorMessage.toLowerCase().includes('no students') ? '#FFFBEB' : '#FFF5F5',
                            border: errorMessage.toLowerCase().includes('no students') ? '2px solid #FCD34D' : '2px solid #FEB2B2'
                        }}>
                            <ShieldAlert size={40} color={errorMessage.toLowerCase().includes('no students') ? '#D97706' : '#E53E3E'} style={{ marginBottom: '12px' }} />
                            <h3 style={{ margin: 0, color: errorMessage.toLowerCase().includes('no students') ? '#92400E' : '#9B2C2C', fontWeight: 700 }}>
                                {errorMessage.toLowerCase().includes('no students') ? 'No Students Detected' : 'Scanning Failure'}
                            </h3>
                            <p style={{ color: errorMessage.toLowerCase().includes('no students') ? '#B45309' : '#C53030', fontSize: '0.9rem', marginTop: '8px', fontWeight: 500 }}>
                                {errorMessage}
                            </p>
                            {isEmotionMode ? (
                                <button
                                    onClick={() => captureAndAnalyzeClip(lectureIdState, sessionIdState, segmentIndex)}
                                    className="btn-secondary"
                                    style={{ marginTop: '16px', cursor: 'pointer', padding: '8px 16px', borderRadius: '8px' }}
                                >
                                    Record Clip Again
                                </button>
                            ) : (
                                <button onClick={handleReset} className="btn-secondary" style={{ marginTop: '16px', cursor: 'pointer', padding: '8px 16px', borderRadius: '8px' }}>
                                    Reset and Scan Again
                                </button>
                            )}
                        </div>
                    )}

                    {/* Status Logger below Video */}
                    {!errorMessage && !successMessage && !isEmotionMode && (
                        <div style={{ textAlign: 'center', marginTop: '24px' }}>
                            <p style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                <Camera size={20} className={isScanning ? 'pulse-icon' : ''} />
                                {scanningStatus}
                            </p>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                                Match Threshold: 80% | DB Status: Connected
                            </p>
                        </div>
                    )}

                    {/* Success Overlay Animation before emotion workflow */}
                    <AnimatePresence>
                        {successMessage && (
                            <MOTION.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                style={{
                                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                    background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10
                                }}
                            >
                                <MOTION.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                                    <CheckCircle2 size={72} color="#10B981" />
                                </MOTION.div>
                                <h2 style={{ color: '#065F46', margin: '16px 0 8px 0', fontSize: '1.8rem', fontWeight: 800 }}>Teacher Verified ✓</h2>
                                <p style={{ color: '#047857', fontWeight: 600, fontSize: '1.05rem', margin: 0 }}>
                                    Starting student emotion detection...
                                </p>
                            </MOTION.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Sidebar Controls & Emotion Metrics */}
                <div className="white-card" style={{ padding: '24px' }}>

                    {/* Emotion Mode UI Panel */}
                    {isEmotionMode ? (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
                                <Sparkles size={20} color="#6366F1" />
                                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Student Emotion Metrics</h2>
                            </div>

                            {/* Multi-camera status — credentials stay in ClassMind.ai/.env */}
                            <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>Emotion cameras (all used together)</div>
                                <div style={{ display: 'grid', gap: '6px', fontSize: '0.75rem', color: '#475569', marginBottom: '10px' }}>
                                    <div>Laptop front — live preview + emotion frames</div>
                                    <div>Laptop back — captured each clip when available</div>
                                    <div>
                                        Classroom V380 — {classroomStatus?.running ? 'connected' : classroomStatus?.has_env_config ? 'saved credentials ready' : 'not configured'}
                                        {classroomStatus?.has_permanent_credentials ? ' (password saved permanently)' : ''}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button type="button" disabled={classroomBusy} onClick={() => connectClassroomCamera(false)} className="btn-primary" style={{ flex: 1, padding: '8px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                        {classroomBusy ? 'Connecting…' : 'Connect classroom'}
                                    </button>
                                    <button type="button" disabled={classroomBusy} onClick={testClassroomCamera} className="btn-secondary" style={{ flex: 1, padding: '8px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                        Test
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowClassroomEdit(v => !v)}
                                    style={{ marginTop: '8px', background: 'none', border: 'none', color: '#6366F1', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                >
                                    {showClassroomEdit ? 'Hide advanced override' : 'Advanced: override RTSP (optional)'}
                                </button>
                                {showClassroomEdit && (
                                    <div style={{ display: 'grid', gap: '8px', marginTop: '8px' }}>
                                        <input type="text" placeholder="rtsp://… (leave blank to use .env)" value={classroomRtspUrl} onChange={(e) => setClassroomRtspUrl(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} />
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <input type="text" placeholder="Username override" value={classroomUser} onChange={(e) => setClassroomUser(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} />
                                            <input type="password" placeholder="Password override" value={classroomPass} onChange={(e) => setClassroomPass(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} />
                                        </div>
                                    </div>
                                )}
                                <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: classroomStatus?.has_frame ? '#047857' : '#64748B' }}>
                                    {classroomStatus?.has_frame
                                        ? 'Classroom camera linked to emotion detection'
                                        : 'Classroom camera connecting in background (no timeout errors shown)'}
                                </p>
                            </div>

                            {/* Key Stats Bar */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                    <div style={{ fontSize: '0.75rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Users size={14} /> Total Students
                                    </div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                                        {totalStudentsDetected}
                                    </div>
                                </div>
                                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                    <div style={{ fontSize: '0.75rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Clock size={14} /> Next Scan In
                                    </div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#6366F1', marginTop: '4px' }}>
                                        {formatTimeMMSS(secondsToNextScan)}
                                    </div>
                                </div>
                            </div>

                            {/* Lecture Elapsed Progress */}
                            <div style={{ marginBottom: '20px', background: '#F1F5F9', padding: '12px', borderRadius: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                                    <span>Total Lecture Duration</span>
                                    <span>{formatTimeMMSS(totalLectureElapsedSeconds)} / {fastDemoMode ? '02:00' : '90:00'}</span>
                                </div>
                                <div style={{ width: '100%', height: '8px', background: '#CBD5E1', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${Math.min(100, (totalLectureElapsedSeconds / (fastDemoMode ? 120 : 5400)) * 100)}%`,
                                        height: '100%',
                                        background: '#6366F1'
                                    }} />
                                </div>
                            </div>

                            {/* 4 Emotion Gauges */}
                            <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
                                4 Emotion Percentages (Segment #{segmentIndex})
                            </h4>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                                {/* Happy */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#166534' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>🟢 Happy</span>
                                        <span>{emotionResults.Happy}%</span>
                                    </div>
                                    <div style={{ width: '100%', height: '8px', background: '#DCFCE7', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{ width: `${emotionResults.Happy}%`, height: '100%', background: '#22C55E' }} />
                                    </div>
                                </div>

                                {/* Engaged */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#1E40AF' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>🔷 Engaged</span>
                                        <span>{emotionResults.Engaged}%</span>
                                    </div>
                                    <div style={{ width: '100%', height: '8px', background: '#DBEAFE', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{ width: `${emotionResults.Engaged}%`, height: '100%', background: '#3B82F6' }} />
                                    </div>
                                </div>

                                {/* Neutral */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#854D0E' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>🟡 Neutral</span>
                                        <span>{emotionResults.Neutral}%</span>
                                    </div>
                                    <div style={{ width: '100%', height: '8px', background: '#FEF9C3', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{ width: `${emotionResults.Neutral}%`, height: '100%', background: '#EAB308' }} />
                                    </div>
                                </div>

                                {/* Disengaged */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#991B1B' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>🔴 Disengaged</span>
                                        <span>{emotionResults.Disengaged}%</span>
                                    </div>
                                    <div style={{ width: '100%', height: '8px', background: '#FEE2E2', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{ width: `${emotionResults.Disengaged}%`, height: '100%', background: '#EF4444' }} />
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <button
                                    onClick={() => captureAndAnalyzeClip(lectureIdState, sessionIdState, segmentIndex + 1)}
                                    disabled={isRecordingClip}
                                    className="btn-secondary"
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', padding: '10px' }}
                                >
                                    <RefreshCw size={16} /> Record 2-Minute Clip Now
                                </button>

                                {/* Fast Schedule Demo Toggle */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0', marginTop: '4px' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>⚡ Fast Demo Schedule (10s intervals)</span>
                                    <input
                                        type="checkbox"
                                        checked={fastDemoMode}
                                        onChange={(e) => {
                                            setFastDemoMode(e.target.checked);
                                            const newDelay = e.target.checked ? 10 : 30 * 60;
                                            startScheduleCountdown(lectureIdState, sessionIdState, newDelay, segmentIndex + 1);
                                        }}
                                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                    />
                                </div>

                                {totalStudentsDetected === 0 && scanHistory.length > 0 && (
                                    <div style={{ marginTop: '12px', background: '#FEF3C7', color: '#92400E', padding: '12px 14px', borderRadius: '12px', border: '1px solid #FCD34D' }}>
                                        <strong>No students detected.</strong> The current report is built only from real AI results.
                                    </div>
                                )}

                                <button
                                    onClick={handleEndLecture}
                                    className="btn-primary"
                                    style={{ width: '100%', marginTop: '8px', background: '#EF4444', color: '#FFF' }}
                                >
                                    End Analytics & Close Session
                                </button>
                            </div>

                            {/* Scan History Log */}
                            {scanHistory.length > 0 && (
                                <div style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                                    <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
                                        Recorded Clips Log ({scanHistory.length})
                                    </h4>
                                    <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {scanHistory.map((item, idx) => (
                                            <div key={idx} style={{ fontSize: '0.75rem', background: '#F8FAFC', padding: '8px', borderRadius: '6px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between' }}>
                                                <span>#{item.segmentNumber} @ {item.timestamp}</span>
                                                <span style={{ fontWeight: 700 }}>H:{item.emotions.Happy}% E:{item.emotions.Engaged}% N:{item.emotions.Neutral}% D:{item.emotions.Disengaged}%</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Teacher attendance tools — face ID is front camera only */
                        <div>
                            <div style={{ marginBottom: '20px', padding: '12px', borderRadius: '12px', background: '#EEF2FF', border: '1px solid #C7D2FE' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#3730A3', marginBottom: '6px' }}>Camera roles</div>
                                <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', color: '#4338CA', lineHeight: 1.45 }}>
                                    <strong>Teacher attendance:</strong> laptop front camera only.<br />
                                    <strong>Student emotion:</strong> front + back + classroom V380 together.<br />
                                    Classroom username/password are saved permanently in <code>ClassMind.ai/.env</code> — no re-entry each time.
                                </p>
                                <button
                                    type="button"
                                    disabled={classroomBusy}
                                    onClick={() => connectClassroomCamera(false)}
                                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: 'none', background: '#4F46E5', color: '#FFF', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}
                                >
                                    {classroomBusy ? 'Connecting…' : 'Connect classroom camera (saved credentials)'}
                                </button>
                                {classroomStatus?.url && (
                                    <p style={{ margin: '8px 0 0', fontSize: '0.68rem', color: '#64748B', wordBreak: 'break-all' }}>
                                        {classroomStatus.url}
                                    </p>
                                )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
                                <Settings size={20} color="var(--primary)" />
                                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Simulation Tools</h2>
                            </div>

                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4, margin: '0 0 20px 0' }}>
                                Toggles to test alternative verification outcomes during evaluation.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F9FAFB', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                    <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Multiple Faces</label>
                                    <input type="checkbox" checked={simMultipleFaces} onChange={(e) => setSimMultipleFaces(e.target.checked)} style={{ cursor: 'pointer' }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F9FAFB', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                    <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Unknown Teacher</label>
                                    <input type="checkbox" checked={simUnknownFace} onChange={(e) => setSimUnknownFace(e.target.checked)} style={{ cursor: 'pointer' }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F9FAFB', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                    <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Side Face Profile</label>
                                    <input type="checkbox" checked={simSideFace} onChange={(e) => setSimSideFace(e.target.checked)} style={{ cursor: 'pointer' }} />
                                </div>

                                <button onClick={handleReset} className="btn-secondary" style={{ width: '100%', marginTop: '8px', cursor: 'pointer', padding: '8px' }}>
                                    Reset Engine
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes scanLineHorizontal {
                    0% { top: 0%; }
                    50% { top: 100%; }
                    100% { top: 0%; }
                }
                .pulse-icon {
                    animation: pulseLight 1.5s infinite;
                }
                @keyframes pulseLight {
                    0% { transform: scale(1); opacity: 0.7; }
                    50% { transform: scale(1.1); opacity: 1; }
                    100% { transform: scale(1); opacity: 0.7; }
                }
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.3; }
                    100% { opacity: 1; }
                }
            `}</style>
        </MOTION.div>
    );
};

export default TeacherAttendanceScanner;
