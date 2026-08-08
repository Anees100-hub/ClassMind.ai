const express = require('express');
const router = express.Router();
const EngagementSegment = require('../models/Engagement');
const EmotionRecord = require('../models/EmotionRecord');
const Class = require('../models/Class');
const Attendance = require('../models/Attendance');

function aggregateEmotionRecords(records) {
    if (!records || records.length === 0) {
        return {
            hasData: false,
            totalStudentsDetected: 0,
            totalEmotionSamples: 0,
            emotions: { Happy: 0, Engaged: 0, Neutral: 0, Disengaged: 0 },
            sessionStartTime: null,
            sessionEndTime: null,
        };
    }

    let maxStudents = 0;
    let totalSamples = 0;
    let happySum = 0, engagedSum = 0, neutralSum = 0, disengagedSum = 0;

    for (const r of records) {
        const count = r.totalStudents || 0;
        if (count > maxStudents) maxStudents = count;
        totalSamples += count;
        const em = r.emotions || {};
        happySum += ((em.Happy || 0) / 100) * count;
        engagedSum += ((em.Engaged || 0) / 100) * count;
        neutralSum += ((em.Neutral || 0) / 100) * count;
        disengagedSum += ((em.Disengaged || 0) / 100) * count;
    }

    const emotions = totalSamples > 0 ? {
        Happy: parseFloat(((happySum / totalSamples) * 100).toFixed(2)),
        Engaged: parseFloat(((engagedSum / totalSamples) * 100).toFixed(2)),
        Neutral: parseFloat(((neutralSum / totalSamples) * 100).toFixed(2)),
        Disengaged: parseFloat(((disengagedSum / totalSamples) * 100).toFixed(2)),
    } : { Happy: 0, Engaged: 0, Neutral: 0, Disengaged: 0 };

    return {
        hasData: true,
        totalStudentsDetected: maxStudents,
        totalEmotionSamples: totalSamples,
        emotions,
        sessionStartTime: records[0].timestamp,
        sessionEndTime: records[records.length - 1].timestamp,
    };
}

function buildSessionSummaries(records) {
    const grouped = {};
    for (const r of records) {
        const key = r.lectureId || r.sessionId || 'unknown';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(r);
    }

    return Object.entries(grouped)
        .map(([lectureId, recs]) => {
            const sorted = recs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            const agg = aggregateEmotionRecords(sorted);
            return {
                lectureId,
                sessionId: sorted[0].sessionId,
                classId: sorted[0].classId,
                segmentCount: sorted.length,
                startTime: sorted[0].timestamp,
                endTime: sorted[sorted.length - 1].timestamp,
                totalStudents: agg.totalStudentsDetected,
                emotions: agg.emotions,
            };
        })
        .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
}

function buildTrendFromSessions(sessions) {
    return sessions
        .slice()
        .reverse()
        .map((s, i) => ({
            label: new Date(s.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            week: `Session ${i + 1}`,
            date: s.startTime,
            happy: s.emotions?.Happy || 0,
            engaged: s.emotions?.Engaged || 0,
            neutral: s.emotions?.Neutral || 0,
            disengaged: s.emotions?.Disengaged || 0,
            totalStudents: s.totalStudents || 0,
        }));
}

function parseDateFilter(value, endOfDay = false) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    if (endOfDay) d.setHours(23, 59, 59, 999);
    return d;
}

async function fetchEmotionRecords({ classId, lectureId, from, to }) {
    const filter = {};
    if (classId) filter.classId = classId;
    if (lectureId) filter.lectureId = lectureId;

    const fromDate = parseDateFilter(from);
    const toDate = parseDateFilter(to, true);
    if (fromDate || toDate) {
        filter.timestamp = {};
        if (fromDate) filter.timestamp.$gte = fromDate;
        if (toDate) filter.timestamp.$lte = toDate;
    }

    return EmotionRecord.find(filter).sort({ timestamp: 1 }).lean();
}

// POST /api/engagement/segment
router.post('/segment', async (req, res) => {
    try {
        const payload = req.body;
        if (!payload.lectureId) return res.status(400).json({ message: 'lectureId required' });

        // Attempt to associate classId by lectureId if not provided
        let classId = payload.classId;
        if (!classId) {
            const cls = await Class.findOne({ lectureId: payload.lectureId });
            if (cls) classId = cls.id;
        }

        const seg = new EngagementSegment({
            lectureId: payload.lectureId,
            classId,
            segmentNumber: payload.segmentNumber,
            engagedPercent: payload.engagedPercent,
            neutralPercent: payload.neutralPercent,
            disengagedPercent: payload.disengagedPercent,
            totalReadings: payload.totalReadings,
            startedAt: payload.startedAt ? new Date(payload.startedAt) : undefined,
            endedAt: payload.endedAt ? new Date(payload.endedAt) : undefined
        });

        await seg.save();
        res.status(201).json({ message: 'Segment saved' });
    } catch (err) {
        console.error('Error saving segment:', err);
        res.status(500).json({ message: err.message });
    }
});


// POST /api/engagement/lecture/end
// Compute overall lecture summary from EmotionRecords (or segments) and update Class analytics
router.post('/lecture/end', async (req, res) => {
    try {
        const { lectureId, classId } = req.body;
        if (!lectureId && !classId) {
            return res.status(400).json({ message: 'lectureId or classId required' });
        }

        const resolvedLectureId = lectureId || null;
        const emotionFilter = resolvedLectureId ? { lectureId: resolvedLectureId } : { classId };
        const emotionRecords = await EmotionRecord.find(emotionFilter).sort({ timestamp: 1 }).lean();
        const segments = resolvedLectureId
            ? await EngagementSegment.find({ lectureId: resolvedLectureId }).lean()
            : [];

        let totalStudentsMax = 0;
        let totalSamples = 0;
        let happyWeighted = 0, engagedWeighted = 0, neutralWeighted = 0, disengagedWeighted = 0;

        if (emotionRecords && emotionRecords.length > 0) {
            for (const r of emotionRecords) {
                const count = r.totalStudents || 0;
                if (count > totalStudentsMax) totalStudentsMax = count;
                totalSamples += count;

                const em = r.emotions || {};
                happyWeighted += ((em.Happy || 0) / 100) * count;
                engagedWeighted += ((em.Engaged || 0) / 100) * count;
                neutralWeighted += ((em.Neutral || 0) / 100) * count;
                disengagedWeighted += ((em.Disengaged || 0) / 100) * count;
            }
        }

        const overallEmotions = totalSamples > 0 ? {
            Happy: parseFloat(((happyWeighted / totalSamples) * 100).toFixed(2)),
            Engaged: parseFloat(((engagedWeighted / totalSamples) * 100).toFixed(2)),
            Neutral: parseFloat(((neutralWeighted / totalSamples) * 100).toFixed(2)),
            Disengaged: parseFloat(((disengagedWeighted / totalSamples) * 100).toFixed(2)),
        } : { Happy: 0, Engaged: 0, Neutral: 0, Disengaged: 0 };

        // Update Class analytics — prefer classId lookup
        let cls = null;
        if (classId) {
            cls = await Class.findOne({ id: classId });
        }
        if (!cls && resolvedLectureId) {
            cls = await Class.findOne({ lectureId: resolvedLectureId });
        }
        if (cls) {
            cls.analytics = cls.analytics || {};
            cls.analytics.summary = {
                happy: overallEmotions.Happy,
                engaged: overallEmotions.Engaged,
                neutral: overallEmotions.Neutral,
                disengaged: overallEmotions.Disengaged,
                totalStudents: totalStudentsMax,
                totalSamples,
                lastSessionAt: emotionRecords.length > 0 ? emotionRecords[emotionRecords.length - 1].timestamp : cls.analytics.summary?.lastSessionAt,
                improvement: 0
            };

            const sessionDate = emotionRecords.length > 0
                ? new Date(emotionRecords[0].timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                : 'Session';
            cls.analytics.trends = cls.analytics.trends || [];
            cls.analytics.trends.push({
                week: sessionDate,
                date: emotionRecords.length > 0 ? emotionRecords[0].timestamp : new Date(),
                happy: overallEmotions.Happy,
                engaged: overallEmotions.Engaged,
                neutral: overallEmotions.Neutral,
                disengaged: overallEmotions.Disengaged,
            });
            if (cls.analytics.trends.length > 12) {
                cls.analytics.trends = cls.analytics.trends.slice(-12);
            }

            cls.lectureStatus = 'Inactive';
            cls.lectureId = null;
            cls.lectureStartTime = null;
            await cls.save();
        }

        res.json({
            lectureId: resolvedLectureId || cls?.id,
            classId: cls?.id || classId || null,
            hasData: emotionRecords.length > 0 || segments.length > 0,
            totalStudentsDetected: totalStudentsMax,
            totalEmotionSamples: totalSamples,
            emotions: overallEmotions,
            sessionStartTime: emotionRecords.length > 0 ? emotionRecords[0].timestamp : null,
            sessionEndTime: emotionRecords.length > 0 ? emotionRecords[emotionRecords.length - 1].timestamp : null,
            timeline: emotionRecords
        });
    } catch (err) {
        console.error('Error finalizing lecture:', err);
        res.status(500).json({ message: err.message });
    }
});


// GET /api/engagement/lecture/:lectureId
router.get('/lecture/:lectureId', async (req, res) => {
    try {
        const lectureId = req.params.lectureId;
        const segments = await EngagementSegment.find({ lectureId }).sort({ segmentNumber: 1 }).lean();
        res.json({ lectureId, segments });
    } catch (err) {
        console.error('Error fetching lecture segments:', err);
        res.status(500).json({ message: err.message });
    }
});


// POST /api/engagement/emotion-record
router.post('/emotion-record', async (req, res) => {
    try {
        const { lectureId, classId, sessionId, segmentNumber, totalStudents, emotions, timestamp } = req.body;
        if (!lectureId || !sessionId) {
            return res.status(400).json({ message: 'lectureId and sessionId are required' });
        }

        let resolvedClassId = classId;
        if (!resolvedClassId) {
            const cls = await Class.findOne({ lectureId });
            if (cls) resolvedClassId = cls.id;
        }

        const record = new EmotionRecord({
            lectureId,
            classId: resolvedClassId,
            sessionId,
            segmentNumber: segmentNumber || 1,
            totalStudents: totalStudents || 0,
            timestamp: timestamp ? new Date(timestamp) : new Date(),
            emotions: emotions || { Happy: 0, Engaged: 0, Neutral: 0, Disengaged: 0 }
        });

        await record.save();
        res.status(201).json({ message: 'Emotion record saved successfully', record });
    } catch (err) {
        console.error('Error saving emotion record:', err);
        res.status(500).json({ message: err.message });
    }
});

// GET /api/engagement/emotion-records/:lectureId
router.get('/emotion-records/:lectureId', async (req, res) => {
    try {
        const lectureId = req.params.lectureId;
        const records = await EmotionRecord.find({ lectureId }).sort({ timestamp: 1 }).lean();
        res.json({ lectureId, totalRecords: records.length, records });
    } catch (err) {
        console.error('Error fetching emotion records:', err);
        res.status(500).json({ message: err.message });
    }
});

// GET /api/engagement/class-report/:classId
// Live analytics for a class with optional lectureId / date filters
router.get('/class-report/:classId', async (req, res) => {
    try {
        const classId = req.params.classId;
        const { lectureId, from, to } = req.query;

        const records = await fetchEmotionRecords({ classId, lectureId, from, to });
        const agg = aggregateEmotionRecords(records);
        const sessions = buildSessionSummaries(records);
        const trends = buildTrendFromSessions(sessions);

        const attendanceFilter = { classId };
        if (lectureId) attendanceFilter.lectureId = lectureId;
        const attendanceLogs = await Attendance.find(attendanceFilter).sort({ date: -1 }).limit(50).lean();

        res.json({
            classId,
            hasData: agg.hasData,
            ...agg,
            sessions,
            trends,
            detectionTimeline: records.map(r => ({
                sessionId: r.sessionId,
                lectureId: r.lectureId,
                segmentNumber: r.segmentNumber,
                timestamp: r.timestamp,
                totalStudents: r.totalStudents,
                emotions: r.emotions,
            })),
            attendanceLogs: attendanceLogs.map(a => ({
                teacherId: a.teacherId,
                teacherName: a.teacherName,
                lectureId: a.lectureId,
                confidence: a.confidence,
                date: a.date,
                status: a.status,
            })),
        });
    } catch (err) {
        console.error('Error generating class report:', err);
        res.status(500).json({ message: err.message });
    }
});

// GET /api/engagement/admin-summary
router.get('/admin-summary', async (req, res) => {
    try {
        const classes = await Class.find({}).lean();
        const allRecords = await EmotionRecord.find({}).sort({ timestamp: 1 }).lean();
        const allAttendance = await Attendance.find({}).sort({ date: -1 }).lean();

        const classReports = await Promise.all(classes.map(async (cls) => {
            const records = allRecords.filter(r => r.classId === cls.id);
            const agg = aggregateEmotionRecords(records);
            const sessions = buildSessionSummaries(records);
            const lastSession = sessions[0] || null;
            const attendanceCount = allAttendance.filter(a => a.classId === cls.id).length;

            return {
                classId: cls.id,
                className: cls.name,
                instructorName: cls.instructorName,
                hasData: agg.hasData,
                emotions: agg.emotions,
                totalStudentsDetected: agg.totalStudentsDetected,
                totalSessions: sessions.length,
                totalAttendanceRecords: attendanceCount,
                lastSessionTime: lastSession?.startTime || null,
                lastSessionEnd: lastSession?.endTime || null,
            };
        }));

        const withData = classReports.filter(c => c.hasData);
        const avg = (field) => withData.length
            ? parseFloat((withData.reduce((s, c) => s + (c.emotions?.[field] || 0), 0) / withData.length).toFixed(2))
            : 0;

        res.json({
            generatedAt: new Date().toISOString(),
            totalClasses: classes.length,
            classesWithData: withData.length,
            averages: {
                Happy: avg('Happy'),
                Engaged: avg('Engaged'),
                Neutral: avg('Neutral'),
                Disengaged: avg('Disengaged'),
            },
            classes: classReports.sort((a, b) => (b.emotions?.Engaged || 0) - (a.emotions?.Engaged || 0)),
        });
    } catch (err) {
        console.error('Error generating admin summary:', err);
        res.status(500).json({ message: err.message });
    }
});

// GET /api/engagement/emotion-report/:lectureId
// Backward compatible: param can be classId or lectureId
router.get('/emotion-report/:lectureId', async (req, res) => {
    try {
        const param = req.params.lectureId;
        const { from, to } = req.query;

        let records = await fetchEmotionRecords({ classId: param, from, to });
        if (!records.length) {
            records = await fetchEmotionRecords({ lectureId: param, from, to });
        }

        if (!records || records.length === 0) {
            return res.json({
                lectureId: param,
                classId: param,
                hasData: false,
                message: "No emotion data recorded yet",
                totalStudentsDetected: 0,
                totalEmotionSamples: 0,
                emotions: { Happy: 0.0, Engaged: 0.0, Neutral: 0.0, Disengaged: 0.0 },
                sessionStartTime: null,
                sessionEndTime: null,
                sessions: [],
                detectionTimeline: []
            });
        }

        const agg = aggregateEmotionRecords(records);
        const sessions = buildSessionSummaries(records);

        res.json({
            classId: records[0].classId || param,
            lectureId: param,
            ...agg,
            sessions,
            detectionTimeline: records.map(r => ({
                sessionId: r.sessionId,
                lectureId: r.lectureId,
                segmentNumber: r.segmentNumber,
                timestamp: r.timestamp,
                totalStudents: r.totalStudents,
                emotions: r.emotions
            }))
        });
    } catch (err) {
        console.error('Error generating emotion report:', err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
