const mongoose = require('mongoose');

const EngagementSegmentSchema = new mongoose.Schema({
    lectureId: { type: String, required: true },
    classId: { type: String },
    segmentNumber: { type: Number },
    engagedPercent: { type: Number },
    neutralPercent: { type: Number },
    disengagedPercent: { type: Number },
    totalReadings: { type: Number },
    startedAt: { type: Date },
    endedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('EngagementSegment', EngagementSegmentSchema, 'EngagementSegments');
