const Class = require('../models/Class');
const Student = require('../models/Student');
const EmotionRecord = require('../models/EmotionRecord');

async function migrateSeedData() {
    try {
        const classes = await Class.find({});
        for (const cls of classes) {
            const hasLiveEmotion = await EmotionRecord.exists({ classId: cls.id });
            const update = {
                tracking: [],
                participation: 0,
                recentActivity: [],
            };
            if (!hasLiveEmotion) {
                update.analytics = {
                    summary: { happy: 0, engaged: 0, neutral: 0, disengaged: 0, improvement: 0 },
                    trends: [],
                };
            }
            await Class.updateOne({ id: cls.id }, { $set: update });
        }

        await Student.updateMany(
            { overallCGPA: { $in: ['3.20', '3.45', '3.65', '3.72', '2.10', '2.35', '3.05', '3.18'] } },
            { $set: { progress: null, previousCGPA: null, overallCGPA: null } }
        );

        console.log('[migrate] Cleared seed tracking/analytics and demo CGPA values');
    } catch (err) {
        console.warn('[migrate] Seed data cleanup skipped:', err.message);
    }
}

module.exports = { migrateSeedData };
