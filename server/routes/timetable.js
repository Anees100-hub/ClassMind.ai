const express = require('express');
const router = express.Router();
const Timetable = require('../models/Timetable');
const Teacher = require('../models/Teacher');
const Class = require('../models/Class');
const Notification = require('../models/Notification');

// Helper to parse HH:MM to minutes from midnight
function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(':');
    if (parts.length < 2) return 0;
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
}

// Helper to calculate Day from Date string (YYYY-MM-DD)
function getDayFromDateStr(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[d.getDay()];
}

// ─────────────────────────────────────────────────────────────
// POST /api/timetable/add — Add new schedule entry (Admin or Teacher)
// ─────────────────────────────────────────────────────────────
router.post('/add', async (req, res) => {
    console.log('POST /api/timetable/add', req.body);
    const { teacherId, courseId, courseName, roomNo, day, date, startTime, endTime, effectiveFrom, reason } = req.body;

    if (!teacherId || !courseId || !startTime || !endTime) {
        return res.status(400).json({ message: 'Teacher, Course ID, Start Time, and End Time are required' });
    }

    try {
        // Derive day from date if provided
        const computedDay = day || getDayFromDateStr(date) || getDayFromDateStr(effectiveFrom) || 'Monday';
        const finalRoomNo = roomNo || 'Room 101';
        const finalCourseName = courseName || courseId;

        // Parse & validate time
        if (parseTimeToMinutes(startTime) >= parseTimeToMinutes(endTime)) {
            return res.status(400).json({ message: 'Start time must be before end time' });
        }

        const entry = new Timetable({
            teacherId: Number(teacherId),
            courseId,
            courseName: finalCourseName,
            roomNo: finalRoomNo,
            day: computedDay,
            date: date || new Date().toISOString().split('T')[0],
            startTime,
            endTime,
            effectiveFrom: effectiveFrom || date || new Date().toISOString().split('T')[0],
            reason: reason || ''
        });

        await entry.save();

        // Also update class schedule in Class model
        await Class.findOneAndUpdate(
            { id: courseId },
            { schedule: `${computedDay}s, ${startTime} - ${endTime} (${finalRoomNo})` }
        );

        res.status(201).json({ message: 'Timetable entry added successfully', entry });

    } catch (err) {
        console.error('Error adding timetable entry:', err);
        res.status(500).json({ message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// POST /api/timetable/reschedule — Reschedule Class & Notify Students
// ─────────────────────────────────────────────────────────────
router.post('/reschedule', async (req, res) => {
    console.log('POST /api/timetable/reschedule', req.body);
    const { courseId, teacherId, day, days, startTime, endTime, date, effectiveFrom, reason } = req.body;

    if (!courseId || !startTime || !endTime) {
        return res.status(400).json({ message: 'Course ID, Start Time, and End Time are required' });
    }

    try {
        const cls = await Class.findOne({ id: courseId });
        const courseName = cls ? cls.name : courseId;
        const roomNo = cls ? (cls.room || 'Room 201') : 'Room 201';
        const finalTeacherId = Number(teacherId) || (cls ? cls.instructorId : 1);

        const targetDays = Array.isArray(days) && days.length > 0 
            ? days 
            : [day || getDayFromDateStr(effectiveFrom || date) || 'Monday'];

        const createdEntries = [];

        for (const targetDay of targetDays) {
            // Remove old entries for this course and day if updating
            await Timetable.deleteMany({ courseId, day: targetDay });

            const entry = new Timetable({
                teacherId: finalTeacherId,
                courseId,
                courseName,
                roomNo,
                day: targetDay,
                date: date || effectiveFrom || new Date().toISOString().split('T')[0],
                startTime,
                endTime,
                effectiveFrom: effectiveFrom || new Date().toISOString().split('T')[0],
                reason: reason || 'Schedule updated by instructor'
            });

            const saved = await entry.save();
            createdEntries.push(saved);
        }

        // Update main Class schedule string
        const formattedSchedule = `${targetDays.join('/')}s, ${startTime} - ${endTime} (${roomNo})`;
        await Class.findOneAndUpdate(
            { id: courseId },
            { schedule: formattedSchedule }
        );

        const notifMessage = `Class timing rescheduled to ${formattedSchedule}.${reason ? ` Reason: ${reason}` : ''}`;

        // Notify enrolled students
        const studentNotif = new Notification({
            id: 'NTF' + Date.now(),
            classId: courseId,
            title: `Schedule Updated: ${courseId}`,
            message: notifMessage,
            type: 'reschedule',
            code: courseId,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            unread: true
        });
        await studentNotif.save();

        // Notify the assigned teacher
        if (finalTeacherId) {
            const teacherNotif = new Notification({
                id: 'NTF' + (Date.now() + 1),
                teacherId: finalTeacherId,
                classId: courseId,
                title: `Your Class Was Rescheduled: ${courseId}`,
                message: notifMessage,
                type: 'reschedule',
                code: courseId,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                unread: true
            });
            await teacherNotif.save();
        }

        res.status(200).json({
            message: 'Class rescheduled successfully — students and teacher notified',
            schedule: formattedSchedule,
            entries: createdEntries
        });

    } catch (err) {
        console.error('Error rescheduling class:', err);
        res.status(500).json({ message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// GET /api/timetable/validate/:teacherId/:courseId — Validate lecture start
// ─────────────────────────────────────────────────────────────
router.get('/validate/:teacherId/:courseId', async (req, res) => {
    const teacherId = Number(req.params.teacherId);
    const { courseId } = req.params;

    try {
        const now = new Date();
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const currentDay = days[now.getDay()];
        const todayDateStr = now.toISOString().split('T')[0];

        // Check if there is any timetable entry for this teacher & course
        const allCourseEntries = await Timetable.find({ courseId });

        // If no entries exist yet in DB for this course, allow first-time start and create default schedule entry
        if (allCourseEntries.length === 0) {
            return res.json({
                valid: true,
                message: 'No restriction: First lecture session for this course.',
                reason: 'No timetable restrictions set yet.'
            });
        }

        // Check if today matches or if entry exists for today / this day
        const todayEntries = allCourseEntries.filter(e => e.day === currentDay || e.date === todayDateStr);

        if (todayEntries.length === 0) {
            return res.json({
                valid: true, // Soft warning for demo flexibility, valid is true but with warning banner
                warning: true,
                message: `Teacher is scheduled on: ${allCourseEntries.map(e => `${e.day} (${e.startTime}-${e.endTime})`).join(', ')}. Today is ${currentDay}.`,
                entries: allCourseEntries
            });
        }

        // Check time range match with 60-minute window buffer
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const currentMinutes = parseTimeToMinutes(`${h}:${m}`);

        let matchFound = false;
        let matchedEntry = null;

        for (const entry of todayEntries) {
            const start = parseTimeToMinutes(entry.startTime);
            const end = parseTimeToMinutes(entry.endTime);
            const buffer = 60; // 60 min early/late window

            if (currentMinutes >= (start - buffer) && currentMinutes <= (end + buffer)) {
                matchFound = true;
                matchedEntry = entry;
                break;
            }
        }

        if (matchFound) {
            res.json({
                valid: true,
                message: `Timetable Verified: Scheduled slot ${matchedEntry.startTime} - ${matchedEntry.endTime} (${matchedEntry.roomNo})`,
                entry: matchedEntry
            });
        } else {
            res.json({
                valid: true,
                warning: true,
                message: `Timetable slot for today is ${todayEntries[0].startTime} - ${todayEntries[0].endTime}. Current time is ${h}:${m}.`,
                entries: todayEntries
            });
        }

    } catch (err) {
        console.error('Error validating timetable:', err);
        res.status(500).json({ message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// GET /api/timetable/now — Get active entries
// ─────────────────────────────────────────────────────────────
router.get('/now', async (req, res) => {
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = days[now.getDay()];

    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const currentMinutes = parseTimeToMinutes(`${h}:${m}`);

    try {
        const todayEntries = await Timetable.find({ day: currentDay });
        const activeEntries = [];

        for (const entry of todayEntries) {
            const start = parseTimeToMinutes(entry.startTime);
            const end = parseTimeToMinutes(entry.endTime);
            if (currentMinutes >= (start - 15) && currentMinutes <= (end + 15)) {
                const teacher = await Teacher.findOne({ id: entry.teacherId });
                activeEntries.push({
                    ...entry.toObject(),
                    teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : `Teacher #${entry.teacherId}`,
                });
            }
        }
        res.json(activeEntries);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// GET /api/timetable/teacher/:id — Get schedule for specific teacher
// ─────────────────────────────────────────────────────────────
router.get('/teacher/:id', async (req, res) => {
    const teacherId = Number(req.params.id);
    try {
        const schedule = await Timetable.find({ teacherId }).sort({ day: 1, startTime: 1 });
        res.json(schedule);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// GET /api/timetable/course/:courseId — Get schedule for specific course
// ─────────────────────────────────────────────────────────────
router.get('/course/:courseId', async (req, res) => {
    try {
        const schedule = await Timetable.find({ courseId: req.params.courseId }).sort({ day: 1, startTime: 1 });
        res.json(schedule);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// GET /api/timetable — Get all timetable entries
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const entries = await Timetable.find().sort({ teacherId: 1, day: 1, startTime: 1 });
        res.json(entries);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
