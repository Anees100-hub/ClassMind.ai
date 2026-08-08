const mongoose = require('mongoose');

const TimetableSchema = new mongoose.Schema({
    teacherId: { type: Number, required: true },
    courseId: { type: String, required: true },      // e.g. "CS401"
    courseName: { type: String, required: true },    // e.g. "Introduction to Machine Learning"
    roomNo: { type: String, required: true },        // e.g. "Room 302"
    day: { 
        type: String, 
        required: true,
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    },
    startTime: { type: String, required: true },     // format: "HH:MM" e.g., "09:00"
    endTime: { type: String, required: true },       // format: "HH:MM" e.g., "10:30"
    date: { type: String },                          // format: "YYYY-MM-DD" e.g., "2026-08-05"
    effectiveFrom: { type: String },                 // format: "YYYY-MM-DD"
    reason: { type: String }                         // optional reschedule note
}, { timestamps: true });

// Compound index to speed up checking teacher schedule
TimetableSchema.index({ teacherId: 1, day: 1 });
TimetableSchema.index({ courseId: 1 });

module.exports = mongoose.model('Timetable', TimetableSchema, 'Timetable');
