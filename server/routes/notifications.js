const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Class = require('../models/Class');
const { logAudit } = require('../utils/auditLog');

/** Class-level notifs (materials, schedule) — no personal student/teacher target */
function classScopedFilter(classIds) {
    return {
        classId: { $in: classIds },
        $and: [
            { $or: [{ studentId: { $exists: false } }, { studentId: null }] },
            { $or: [{ teacherId: { $exists: false } }, { teacherId: null }] },
        ],
    };
}

async function resolveTeacherClassIds(teacherId) {
    const teacherObj = await Teacher.findOne({ id: teacherId });
    const assigned = teacherObj?.assignedClasses || [];
    const taught = await Class.find({ instructorId: teacherId }).select('id').lean();
    return [...new Set([...assigned, ...taught.map((c) => c.id)])];
}

// GET /api/notifications/teacher/:identifier (numeric id or email)
router.get('/teacher/:identifier', async (req, res) => {
    const { identifier } = req.params;
    try {
        let teacherId = Number(identifier);

        if (isNaN(teacherId)) {
            const teacher = await Teacher.findOne({ email: identifier });
            if (teacher) teacherId = teacher.id;
        }

        if (isNaN(teacherId)) {
            return res.json([]);
        }

        const assigned = await resolveTeacherClassIds(teacherId);

        // Only: targeted to this teacher, OR class-level for their assigned/taught classes
        const notifications = await Notification.find({
            $or: [
                { teacherId },
                classScopedFilter(assigned),
            ],
        }).sort({ createdAt: -1 });

        res.json(notifications);
    } catch (err) {
        console.error('Error fetching teacher notifications:', err);
        res.status(500).json({ message: err.message });
    }
});

// GET /api/notifications/student/:studentId (or email lookup)
router.get('/student/:identifier', async (req, res) => {
    const { identifier } = req.params;
    try {
        let studentId = Number(identifier);

        if (isNaN(studentId)) {
            const student = await Student.findOne({ email: identifier });
            if (student) {
                studentId = student.id;
            }
        }

        if (isNaN(studentId)) {
            return res.json([]);
        }

        const studentObj = await Student.findOne({ id: studentId });
        const enrolled = studentObj?.enrolledClasses || [];

        // Only: targeted to this student, OR class-level for enrolled classes
        // (excludes teacher-only notifs and other classes / SYSTEM broadcasts)
        const notifications = await Notification.find({
            $or: [
                { studentId },
                classScopedFilter(enrolled),
            ],
        }).sort({ createdAt: -1 });

        res.json(notifications);
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ message: err.message });
    }
});

// POST /api/notifications/send — Broadcast or targeted notification
router.post('/send', async (req, res) => {
    const { classId, title, message, type, code, studentId, teacherId, materialId } = req.body;

    if (!classId || !title || !message) {
        return res.status(400).json({ message: 'classId, title, and message are required' });
    }

    try {
        const notif = new Notification({
            id: 'NTF' + Date.now() + Math.floor(Math.random() * 1000),
            studentId: studentId ? Number(studentId) : undefined,
            teacherId: teacherId ? Number(teacherId) : undefined,
            classId,
            materialId: materialId || undefined,
            title,
            message,
            type: type || 'reschedule',
            code: code || classId,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            unread: true,
        });

        const saved = await notif.save();
        await logAudit({ user: 'Admin', action: 'Published announcement', entity: 'notification', entityId: saved.id, details: title });
        res.status(201).json(saved);
    } catch (err) {
        console.error('Error creating notification:', err);
        res.status(500).json({ message: err.message });
    }
});

// PATCH /api/notifications/read-all — Mark all notifications read for a student or teacher
router.patch('/read-all', async (req, res) => {
    const { studentId, teacherId } = req.body;
    try {
        let query = null;

        if (studentId) {
            const studentObj = await Student.findOne({ id: Number(studentId) });
            const enrolled = studentObj?.enrolledClasses || [];
            query = {
                $or: [
                    { studentId: Number(studentId) },
                    classScopedFilter(enrolled),
                ],
            };
        } else if (teacherId) {
            const assigned = await resolveTeacherClassIds(Number(teacherId));
            query = {
                $or: [
                    { teacherId: Number(teacherId) },
                    classScopedFilter(assigned),
                ],
            };
        }

        if (!query) {
            return res.status(400).json({ message: 'studentId or teacherId is required' });
        }

        await Notification.updateMany(query, { unread: false });
        res.json({ message: 'Notifications marked as read' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PATCH /api/notifications/:id/read — Mark single notification read
router.patch('/:id/read', async (req, res) => {
    try {
        const updated = await Notification.findOneAndUpdate(
            { id: req.params.id },
            { unread: false },
            { new: true }
        );
        res.json(updated);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE /api/notifications/:id — Delete notification
router.delete('/:id', async (req, res) => {
    try {
        await Notification.findOneAndDelete({ id: req.params.id });
        res.json({ message: 'Notification deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
