const mongoose = require('mongoose');

const ClassSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // unique string ID 'CS401'
    name: { type: String, required: true },
    instructorId: { type: Number }, // Ref to User.id
    instructorName: { type: String },
    description: { type: String },
    schedule: { type: String },
    status: { type: String, default: 'Active' },
    lectureStatus: { type: String, default: 'Inactive' },
    lectureStartTime: { type: Date },
    lectureId: { type: String },

    studentsCount: { type: Number, default: 0 },
    participation: { type: Number, default: 0 },

    stats: [{
        label: String,
        value: String
    }],

    tracking: [{
        id: Number,
        name: String,
        email: String,
        attendance: Number,
        participation: Number,
        engagement: Number,
        assignments: String,
        trend: String
    }],

    analytics: {
        summary: {
            happy: Number,
            engaged: Number,
            neutral: Number,
            disengaged: Number,
            improvement: Number,
            totalStudentsDetected: Number,
            totalEmotionSamples: Number
        },
        trends: [{
            week: String,
            engaged: Number,
            neutral: Number,
            disengaged: Number
        }]
    },

    recentActivity: [{
        title: String,
        time: String,
        type: { type: String } // 'upload', etc.
    }]
}, { timestamps: true });

module.exports = mongoose.model('Class', ClassSchema, 'Classes');
