const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const Teacher = require('../models/Teacher');
const Class = require('../models/Class');

// ─────────────────────────────────────────────────────────────
// POST /api/attendance/mark — Mark Teacher Attendance
// Called by:  React TeacherAttendanceScanner OR Python FastAPI
// ─────────────────────────────────────────────────────────────
router.post('/mark', async (req, res) => {
    console.log('POST /api/attendance/mark', req.body);
    const {
        teacherId,
        classId,
        lectureId,
        confidence,
        multipleFaces,
        teacherName,        // optional: passed by Python FastAPI backend
        recognitionMethod   // optional: 'face_recognition' | 'deepface' | 'simulation'
    } = req.body;

    // BR-5: Multiple faces detected in front of camera should reject attendance.
    if (multipleFaces) {
        return res.status(400).json({ message: 'Multiple faces detected. Please ensure only the teacher is visible.' });
    }

    if (!teacherId || !classId || !lectureId || confidence === undefined) {
        return res.status(400).json({ message: 'teacherId, classId, lectureId, and confidence are required' });
    }

    // BR-4: Face recognition confidence must be at least 80% and at most 100%.
    if (confidence < 0.8 || confidence > 1.0) {
        return res.status(400).json({ message: 'Face recognition confidence must be between 80% and 100%.' });
    }

    // Only accept attendance marked via real AI verification — reject simulation/mock paths.
    const allowedMethods = ['face_recognition', 'deepface'];
    if (!allowedMethods.includes(recognitionMethod)) {
        return res.status(400).json({
            message: 'Attendance must be verified by the face recognition AI server. Simulation or manual bypass is not allowed.'
        });
    }

    try {
        // BR-1: Only registered teachers can be recognized & BR-6: Unknown faces must not be marked.
        const teacher = await Teacher.findOne({ id: Number(teacherId) });
        if (!teacher) {
            return res.status(404).json({ message: 'Unknown faces must not be marked as present.' });
        }
        if (!teacher.faceDescriptor || teacher.faceDescriptor.length === 0) {
            return res.status(400).json({ message: 'Only registered teachers can be recognized.' });
        }

        // Additional Validation: Teacher must be Active
        if (teacher.status !== 'Active') {
            return res.status(400).json({ message: 'Only active teachers can mark attendance.' });
        }

        // Additional Validation: Class must exist and be Active
        const cls = await Class.findOne({ id: classId });
        if (!cls) {
            return res.status(400).json({ message: 'Class not found in database.' });
        }
        if (cls.status !== 'Active') {
            return res.status(400).json({ message: 'Cannot mark attendance for an inactive class.' });
        }

        // BR-2: Teacher must be assigned to the class (by assignedClasses OR as instructorId on class)
        const assignedByList = teacher.assignedClasses && teacher.assignedClasses.includes(classId);
        const assignedByInstructor = cls.instructorId !== undefined && Number(cls.instructorId) === Number(teacherId);
        if (!assignedByList && !assignedByInstructor) {
            return res.status(400).json({ message: 'Teacher must be assigned to the class before attendance can be marked.' });
        }

        // ── TODO: Re-enable timetable time-slot validation after demo/testing ──────
        // The block below enforces that attendance can only be marked within the
        // scheduled timetable window (±10 min buffer). Temporarily disabled so all
        // scanner features can be tested at any time of day.
        //
        // To re-enable: uncomment everything between BEGIN and END below.
        //
        // ── BEGIN TIMETABLE VALIDATION ─────────────────────────────────────────────
        // if (recognitionMethod !== 'simulation') {
        //     const Timetable = require('../models/Timetable');
        //     const now = new Date();
        //     const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        //     const currentDay = days[now.getDay()];
        //
        //     const h = String(now.getHours()).padStart(2, '0');
        //     const m = String(now.getMinutes()).padStart(2, '0');
        //     const currentTimeStr = `${h}:${m}`;
        //
        //     const parseTimeToMinutes = (tStr) => {
        //         const [hr, mn] = tStr.split(':').map(Number);
        //         return hr * 60 + mn;
        //     };
        //     const currentMinutes = parseTimeToMinutes(currentTimeStr);
        //
        //     const timetables = await Timetable.find({
        //         teacherId: Number(teacherId),
        //         courseId: classId,
        //         day: currentDay
        //     });
        //
        //     if (timetables.length === 0) {
        //         return res.status(400).json({
        //             message: `Timetable Validation Failed: No lecture scheduled for you on ${currentDay} for class ${classId}.`
        //         });
        //     }
        //
        //     const buffer = 10; // ±10 minutes buffer
        //     let timeValid = false;
        //
        //     for (const entry of timetables) {
        //         const start = parseTimeToMinutes(entry.startTime);
        //         const end = parseTimeToMinutes(entry.endTime);
        //
        //         if (currentMinutes >= (start - buffer) && currentMinutes <= (end + buffer)) {
        //             timeValid = true;
        //             break;
        //         }
        //     }
        //
        //     if (!timeValid) {
        //         const slotsStr = timetables.map(t => `${t.startTime}-${t.endTime} in ${t.roomNo}`).join(', ');
        //         return res.status(400).json({
        //             message: `Timetable Validation Failed: You have a lecture scheduled on ${currentDay}, but the current time (${currentTimeStr}) is outside the scheduled slot(s): [${slotsStr}] with a 10-minute buffer.`
        //         });
        //     }
        // }
        // ── END TIMETABLE VALIDATION ───────────────────────────────────────────────

        // BR-3 / FR-6: Prevent duplicate attendance for the same lecture.
        // Return 409 with alreadyRecorded:true so the frontend can resume
        // the emotion-detection workflow rather than blocking with a hard error.
        const existingAttendance = await Attendance.findOne({ teacherId: Number(teacherId), classId, lectureId });
        if (existingAttendance) {
            return res.status(409).json({
                message: 'Attendance already recorded for this lecture.',
                alreadyRecorded: true,
                attendance: existingAttendance,
                lectureStatus: 'Active'
            });
        }

        // Save attendance record (with extended fields from Python backend)
        const attendance = new Attendance({
            teacherId: Number(teacherId),
            teacherName: teacherName || `${teacher.firstName} ${teacher.lastName}`,
            classId,
            lectureId,
            confidence,
            status: 'Present',
            recognitionMethod: recognitionMethod || 'face_recognition',
            date: new Date()
        });
        await attendance.save();

        // FR-5: Start Lecture automatically (update class status & recorded start time)
        cls.lectureStatus = 'Active';
        cls.lectureStartTime = new Date();
        cls.lectureId = lectureId;
        cls.recentActivity = cls.recentActivity || [];
        cls.recentActivity.unshift({
            title: `Lecture session started automatically via Face Recognition`,
            time: 'Just now',
            type: 'upload'
        });
        await cls.save();

        res.status(201).json({
            message: 'Attendance recorded and lecture started successfully.',
            attendance,
            lectureStatus: 'Active'
        });

    } catch (err) {
        console.error('Error in mark attendance:', err);

        // BR-3: Duplicate key error — attendance already recorded for this lecture.
        // This can happen if the unique index fires before the findOne check resolves
        // (e.g. race condition or retry). Treat it as a recoverable state so the
        // teacher can still proceed to the emotion-detection workflow.
        if (err.code === 11000) {
            try {
                const existing = await Attendance.findOne({ teacherId: Number(teacherId), classId, lectureId });
                return res.status(409).json({
                    message: 'Attendance already recorded for this lecture.',
                    alreadyRecorded: true,
                    attendance: existing,
                    lectureStatus: 'Active'
                });
            } catch (_) {
                return res.status(409).json({
                    message: 'Attendance already recorded for this lecture.',
                    alreadyRecorded: true,
                    lectureStatus: 'Active'
                });
            }
        }

        res.status(500).json({ message: err.message });
    }
});


// ─────────────────────────────────────────────────────────────
// GET /api/attendance/history — Get Attendance Logs (filtered)
// Query params: ?teacherId=1  OR  ?classId=CS401  OR both
// ─────────────────────────────────────────────────────────────
router.get('/history', async (req, res) => {
    console.log('GET /api/attendance/history', req.query);
    const { teacherId, classId } = req.query;
    const filter = {};
    if (teacherId) filter.teacherId = Number(teacherId);
    if (classId) filter.classId = classId;

    try {
        const history = await Attendance.find(filter).sort({ date: -1 });
        res.json(history);
    } catch (err) {
        console.error('Error fetching attendance history:', err);
        res.status(500).json({ message: err.message });
    }
});


// ─────────────────────────────────────────────────────────────
// GET /api/attendance/teacher/:id — Attendance History for Teacher
// Returns: { teacher, total, records[] }
// Called by: Python FastAPI /api/attendance/teacher/:id proxy
// ─────────────────────────────────────────────────────────────
router.get('/teacher/:id', async (req, res) => {
    const teacherId = Number(req.params.id);
    console.log(`GET /api/attendance/teacher/${teacherId}`);

    if (isNaN(teacherId)) {
        return res.status(400).json({ message: 'Teacher ID must be a number.' });
    }

    try {
        const teacher = await Teacher.findOne({ id: teacherId });
        if (!teacher) {
            return res.status(404).json({ message: `Teacher with ID ${teacherId} not found.` });
        }

        const records = await Attendance.find({ teacherId }).sort({ date: -1 });

        // Build per-class summary
        const classSummary = {};
        records.forEach(r => {
            if (!classSummary[r.classId]) {
                classSummary[r.classId] = { classId: r.classId, sessions: 0, avgConfidence: 0 };
            }
            classSummary[r.classId].sessions++;
            classSummary[r.classId].avgConfidence += r.confidence;
        });
        Object.values(classSummary).forEach(c => {
            c.avgConfidence = parseFloat((c.avgConfidence / c.sessions * 100).toFixed(1));
        });

        res.json({
            teacher: {
                id: teacher.id,
                name: `${teacher.firstName} ${teacher.lastName}`,
                department: teacher.department,
                faceRegistered: !!(teacher.faceDescriptor && teacher.faceDescriptor.length > 0)
            },
            total: records.length,
            classSummary: Object.values(classSummary),
            records: records
        });

    } catch (err) {
        console.error('Error fetching teacher attendance:', err);
        res.status(500).json({ message: err.message });
    }
});


module.exports = router;
