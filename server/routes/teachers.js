const express = require('express');
const router = express.Router();
const Teacher = require('../models/Teacher');
const User = require('../models/User');
const Class = require('../models/Class');
const Notification = require('../models/Notification');
const { logAudit } = require('../utils/auditLog');

// Get all teachers
router.get('/', async (req, res) => {
    try {
        const teachers = await Teacher.find();
        res.json(teachers);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get teacher by email
router.get('/email/:email', async (req, res) => {
    console.log(`GET /api/teachers/email/${req.params.email}`);
    try {
        const teacher = await Teacher.findOne({ email: req.params.email });
        if (!teacher) return res.status(404).json({ message: 'Teacher not found' });
        res.json(teacher);
    } catch (err) {
        console.error('Error in GET /email:', err);
        res.status(500).json({ message: err.message });
    }
});

// Create teacher
router.post('/', async (req, res) => {
    console.log('POST /api/teachers', req.body);
    try {
        const body = { ...req.body };

        if (!body.email || !body.firstName || !body.lastName) {
            return res.status(400).json({ message: 'First name, last name, and email address are required.' });
        }

        // Check if teacher with email already exists
        const existingTeacher = await Teacher.findOne({ email: body.email });
        if (existingTeacher) {
            return res.status(400).json({ message: `Teacher with email "${body.email}" already exists.` });
        }

        // Calculate max ID safely across both Teacher and User collections
        if (!body.id) {
            const [lastTeacher, lastUser] = await Promise.all([
                Teacher.findOne().sort({ id: -1 }),
                User.findOne().sort({ id: -1 })
            ]);
            const maxId = Math.max(lastTeacher ? lastTeacher.id : 0, lastUser ? lastUser.id : 0, 0);
            body.id = maxId + 1;
        }

        const teacher = new Teacher(body);
        const newTeacher = await teacher.save();

        // Sync with User collection safely using upsert
        await User.findOneAndUpdate(
            { email: body.email },
            {
                id: body.id,
                firstName: body.firstName,
                lastName: body.lastName,
                email: body.email,
                password: body.password || 'password123',
                role: 'teacher',
                assignedClasses: body.assignedClasses || [],
                department: body.department,
                specialization: body.specialization,
                status: body.status || 'Active'
            },
            { upsert: true, new: true }
        );

        await logAudit({ user: 'Admin', action: 'Created teacher', entity: 'teacher', entityId: String(body.id), details: `${body.firstName} ${body.lastName}` });
        res.status(201).json(newTeacher);
    } catch (err) {
        console.error('Error in POST /api/teachers:', err);
        res.status(400).json({ message: err.message });
    }
});

// Update teacher
router.patch('/:id', async (req, res) => {
    const id = Number(req.params.id);
    console.log(`PATCH /api/teachers/${id}`, req.body);
    try {
        const updatedTeacher = await Teacher.findOneAndUpdate({ id: id }, req.body, { new: true });
        if (!updatedTeacher) return res.status(404).json({ message: 'Teacher not found' });

        // Sync with User collection
        await User.findOneAndUpdate({ id: id }, req.body);

        await logAudit({ user: 'Admin', action: 'Updated teacher', entity: 'teacher', entityId: String(id), details: updatedTeacher.email });
        res.json(updatedTeacher);
    } catch (err) {
        console.error('Error in PATCH /:', err);
        res.status(400).json({ message: err.message });
    }
});

// Delete teacher — removes profile, login account, and class assignments
router.delete('/:id', async (req, res) => {
    const id = Number(req.params.id);
    console.log(`DELETE /api/teachers/${id}`);
    try {
        const deleted = await Teacher.findOneAndDelete({ id });
        if (!deleted) return res.status(404).json({ message: 'Teacher not found' });

        // Remove login account(s) — by numeric id AND email (handles id/email drift)
        const userResult = await User.deleteMany({
            $or: [
                { id },
                { email: deleted.email, role: 'teacher' }
            ]
        });

        // Unassign from all classes they instruct
        await Class.updateMany(
            { instructorId: id },
            { $set: { instructorId: null, instructorName: 'Unassigned' } }
        );

        // Remove teacher-targeted notifications
        await Notification.deleteMany({ teacherId: id });

        await logAudit({
            user: 'Admin',
            action: 'Deleted teacher',
            entity: 'teacher',
            entityId: String(id),
            details: `${deleted.email} (login accounts removed: ${userResult.deletedCount})`
        });

        res.json({
            message: 'Teacher deleted',
            usersRemoved: userResult.deletedCount
        });
    } catch (err) {
        console.error('Error in DELETE /:', err);
        res.status(500).json({ message: err.message });
    }
});

// Bulk Import Teachers
router.post('/bulk', async (req, res) => {
    const teachersData = req.body;
    if (!Array.isArray(teachersData)) {
        return res.status(400).json({ message: 'Input must be an array of teachers' });
    }

    const results = { success: 0, failed: 0, errors: [] };

    try {
        const lastTeacher = await Teacher.findOne().sort({ id: -1 });
        let currentId = lastTeacher ? lastTeacher.id + 1 : 1;

        for (const data of teachersData) {
            try {
                const teacherId = currentId++;
                const teacher = new Teacher({
                    ...data,
                    id: teacherId,
                    status: data.status || 'Active',
                    role: 'teacher',
                    assignedClasses: []
                });
                await teacher.save();

                const user = new User({
                    id: teacherId,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    email: data.email,
                    password: data.password || 'password123',
                    role: 'teacher',
                    assignedClasses: [],
                    department: data.department
                });
                await user.save();

                results.success++;
            } catch (err) {
                results.failed++;
                results.errors.push({ email: data.email, error: err.message });
            }
        }
        res.json(results);
    } catch (err) {
        console.error('Bulk import error:', err);
        res.status(500).json({ message: 'Bulk import failed', error: err.message });
    }
});

// Register teacher face descriptor
router.post('/register-face', async (req, res) => {
    console.log('POST /api/teachers/register-face', req.body);
    const { teacherId, faceDescriptor } = req.body;
    if (!teacherId || !faceDescriptor || !Array.isArray(faceDescriptor)) {
        return res.status(400).json({ message: 'Teacher ID and face descriptor array are required' });
    }

    // Reject legacy/mock 128D descriptors — DeepFace requires 512D embeddings
    if (faceDescriptor.length > 0 && faceDescriptor.length < 512) {
        return res.status(400).json({
            message: 'Invalid face descriptor. Please re-register your face using the camera (legacy data is not accepted).'
        });
    }

    try {
        const teacher = await Teacher.findOne({ id: Number(teacherId) });
        if (!teacher) {
            return res.status(404).json({ message: 'Teacher not found' });
        }

        teacher.faceDescriptor = faceDescriptor;
        // Synced classId to first assigned class for convenient data lookup if present
        if (teacher.assignedClasses && teacher.assignedClasses.length > 0) {
            teacher.classId = teacher.assignedClasses[0];
        }
        await teacher.save();

        res.json({ message: 'Face descriptor registered successfully', teacher });
    } catch (err) {
        console.error('Error in register-face:', err);
        res.status(500).json({ message: err.message });
    }
});

// Get all teacher face data
router.get('/face-data', async (req, res) => {
    console.log('GET /api/teachers/face-data');
    try {
        const teachers = await Teacher.find({ faceDescriptor: { $exists: true, $ne: null } });
        res.json(teachers);
    } catch (err) {
        console.error('Error in face-data:', err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
