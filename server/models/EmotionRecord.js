const mongoose = require('mongoose');

const EmotionRecordSchema = new mongoose.Schema({
    lectureId: { type: String, required: true },
    classId: { type: String },
    sessionId: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    segmentNumber: { type: Number, default: 1 },
    totalStudents: { type: Number, default: 0 },
    emotions: {
        Happy: { type: Number, default: 0 },
        Engaged: { type: Number, default: 0 },
        Neutral: { type: Number, default: 0 },
        Disengaged: { type: Number, default: 0 }
    }
}, { timestamps: true });

module.exports = mongoose.model('EmotionRecord', EmotionRecordSchema, 'EmotionRecords');
