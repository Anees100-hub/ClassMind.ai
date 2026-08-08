const express = require('express');
const router = express.Router();
const SystemSettings = require('../models/SystemSettings');
const AuditLog = require('../models/AuditLog');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Class = require('../models/Class');
const Notification = require('../models/Notification');
const Material = require('../models/Material');
const { logAudit } = require('../utils/auditLog');

const DEFAULT_SETTINGS = {
    key: 'global',
    academicYear: '2024-2025',
    language: 'en',
    maintenanceMode: false
};

async function getOrCreateSettings() {
    let settings = await SystemSettings.findOne({ key: 'global' });
    if (!settings) {
        settings = await SystemSettings.create(DEFAULT_SETTINGS);
    }
    return settings;
}

// GET /api/settings
router.get('/', async (req, res) => {
    try {
        const settings = await getOrCreateSettings();
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PATCH /api/settings
router.patch('/', async (req, res) => {
    try {
        const { academicYear, language, maintenanceMode, updatedBy } = req.body;
        const settings = await SystemSettings.findOneAndUpdate(
            { key: 'global' },
            {
                academicYear,
                language,
                maintenanceMode,
                updatedBy: updatedBy || 'Admin'
            },
            { new: true, upsert: true }
        );

        await logAudit({
            user: updatedBy || 'Admin',
            action: 'Updated system configuration',
            entity: 'settings',
            details: `Year: ${settings.academicYear}, Language: ${settings.language}, Maintenance: ${settings.maintenanceMode}`
        });

        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/settings/audit-logs
router.get('/audit-logs', async (req, res) => {
    try {
        const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(50);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/settings/announcements
router.get('/announcements', async (req, res) => {
    try {
        const announcements = await Notification.find({ classId: 'SYSTEM', type: 'general' })
            .sort({ createdAt: -1 })
            .limit(20);
        res.json(announcements);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/settings/backup — full database export
router.get('/backup', async (req, res) => {
    try {
        const [students, teachers, classes, materials, settings] = await Promise.all([
            Student.find(),
            Teacher.find(),
            Class.find(),
            Material.find(),
            getOrCreateSettings()
        ]);

        res.json({
            exportedAt: new Date().toISOString(),
            settings,
            students,
            teachers,
            classes,
            materials
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/settings/stats — live platform stats for admin
router.get('/stats', async (req, res) => {
    try {
        const [studentCount, teacherCount, classCount, materialCount, announcementCount] = await Promise.all([
            Student.countDocuments(),
            Teacher.countDocuments({ status: 'Active' }),
            Class.countDocuments({ status: 'Active' }),
            Material.countDocuments(),
            Notification.countDocuments({ classId: 'SYSTEM' })
        ]);

        res.json({ studentCount, teacherCount, classCount, materialCount, announcementCount });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
