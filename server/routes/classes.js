const express = require('express');
const router = express.Router();
const Class = require('../models/Class');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const { logAudit } = require('../utils/auditLog');

async function enrichClassesWithLiveData(classes) {
    const allStudents = await Student.find({}, 'enrolledClasses');
    const EmotionRecord = require('../models/EmotionRecord');
    return Promise.all(classes.map(async (cls) => {
        const obj = cls.toObject ? cls.toObject() : cls;
        const enrolledCount = allStudents.filter(s =>
            (s.enrolledClasses || []).includes(obj.id)
        ).length;
        obj.studentsCount = enrolledCount;
        obj.tracking = [];
        obj.recentActivity = [];
        obj.participation = 0;

        const hasLiveEmotion = await EmotionRecord.exists({ classId: obj.id });
        if (!hasLiveEmotion) {
            obj.analytics = {
                summary: { happy: 0, engaged: 0, neutral: 0, disengaged: 0, improvement: 0 },
                trends: [],
            };
        }

        obj.stats = [
            { label: 'Total Students', value: String(enrolledCount) },
            { label: 'Avg Attendance', value: '—' },
            { label: 'Engagement', value: hasLiveEmotion ? `${obj.analytics?.summary?.engaged ?? 0}%` : '—' },
            { label: 'Pending Reviews', value: '0' },
        ];
        if (obj.instructorId) {
            const teacher = await Teacher.findOne({ id: Number(obj.instructorId) });
            if (teacher) {
                obj.instructorName = `${teacher.firstName} ${teacher.lastName}`;
            }
        }
        return obj;
    }));
}

// Get all classes — syncs instructorName and live enrollment counts
router.get('/', async (req, res) => {
    console.log('GET /api/classes');
    try {
        const classes = await Class.find();
        const enriched = await enrichClassesWithLiveData(classes);
        res.json(enriched);
    } catch (err) {
        console.error('Error in GET /:', err);
        res.status(500).json({ message: err.message });
    }
});

// Get specific class
router.get('/:id', async (req, res) => {
    console.log(`GET /api/classes/${req.params.id}`);
    try {
        const cls = await Class.findOne({ id: req.params.id });
        if (!cls) return res.status(404).json({ message: 'Class not found' });

        const obj = cls.toObject();
        if (obj.instructorId) {
            const teacher = await Teacher.findOne({ id: Number(obj.instructorId) });
            if (teacher) {
                obj.instructorName = `${teacher.firstName} ${teacher.lastName}`;
            }
        }
        res.json(obj);
    } catch (err) {
        console.error('Error in GET /:id:', err);
        res.status(500).json({ message: err.message });
    }
});

// Create class
router.post('/', async (req, res) => {
    console.log('POST /api/classes', req.body);
    try {
        const body = { ...req.body };

        // If instructorId provided, also sync assignedClasses on Teacher
        const cls = new Class(body);
        const newClass = await cls.save();
        console.log('Successfully saved class:', newClass.id);

        await logAudit({ user: 'Admin', action: 'Created class', entity: 'class', entityId: newClass.id, details: newClass.name });

        // Keep teacher's assignedClasses in sync
        if (body.instructorId) {
            const numId = Number(body.instructorId);
            const teacher = await Teacher.findOne({ id: numId });
            if (teacher) {
                const newAssigned = Array.from(new Set([...(teacher.assignedClasses || []), newClass.id]));
                await Teacher.findOneAndUpdate({ id: numId }, { assignedClasses: newAssigned });
            }
        }

        res.status(201).json(newClass);
    } catch (err) {
        console.error('Error in POST /api/classes:', err);
        res.status(400).json({ message: err.message });
    }
});

// Update class — also sync teacher assignedClasses if instructorId changed
router.patch('/:id', async (req, res) => {
    console.log(`PATCH /api/classes/${req.params.id}`, req.body);
    try {
        const updatedClass = await Class.findOneAndUpdate(
            { id: req.params.id },
            req.body,
            { new: true }
        );
        if (!updatedClass) {
            console.log(`Class ${req.params.id} not found for update`);
            return res.status(404).json({ message: 'Class not found' });
        }

        // If instructorId was updated, keep Teacher's assignedClasses in sync
        if (req.body.instructorId !== undefined) {
            const numId = Number(req.body.instructorId);
            const teacher = await Teacher.findOne({ id: numId });
            if (teacher) {
                const newAssigned = Array.from(new Set([...(teacher.assignedClasses || []), req.params.id]));
                await Teacher.findOneAndUpdate({ id: numId }, { assignedClasses: newAssigned });
            }
        }

        console.log(`Successfully updated class ${req.params.id}`);
        await logAudit({ user: 'Admin', action: 'Updated class', entity: 'class', entityId: req.params.id });
        res.json(updatedClass);
    } catch (err) {
        console.error('Error in PATCH /api/classes:', err);
        res.status(400).json({ message: err.message });
    }
});

// Delete class — remove from student enrollments and teacher assignments
router.delete('/:id', async (req, res) => {
    console.log(`DELETE /api/classes/${req.params.id}`);
    try {
        const deleted = await Class.findOneAndDelete({ id: req.params.id });
        if (!deleted) return res.status(404).json({ message: 'Class not found' });

        // Cleanup: Remove this class from all students' enrolledClasses
        await Student.updateMany(
            { enrolledClasses: req.params.id },
            { $pull: { enrolledClasses: req.params.id } }
        );

        // Cleanup: Remove from teacher's assignedClasses
        await Teacher.updateMany(
            { assignedClasses: req.params.id },
            { $pull: { assignedClasses: req.params.id } }
        );

        console.log(`Removed class ${req.params.id} from student/teacher records`);
        await logAudit({ user: 'Admin', action: 'Deleted class', entity: 'class', entityId: req.params.id });
        res.json({ message: 'Class deleted and records cleaned up' });
    } catch (err) {
        console.error('Error in DELETE /:', err);
        res.status(500).json({ message: err.message });
    }
});

// POST /api/classes/sync-teacher — re-sync all assignedClasses from instructorId
// Call this once to repair existing data if teacher.assignedClasses is empty
router.post('/sync-teacher', async (req, res) => {
    try {
        const classes = await Class.find({ instructorId: { $exists: true, $ne: null } });
        let synced = 0;

        for (const cls of classes) {
            const numId = Number(cls.instructorId);
            if (numId) {
                const teacher = await Teacher.findOne({ id: numId });
                if (teacher) {
                    const newAssigned = Array.from(new Set([...(teacher.assignedClasses || []), cls.id]));
                    await Teacher.findOneAndUpdate({ id: numId }, { assignedClasses: newAssigned });
                    synced++;
                }
            }
        }

        res.json({ message: `Synced ${synced} class-teacher assignments` });
    } catch (err) {
        console.error('Sync error:', err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
