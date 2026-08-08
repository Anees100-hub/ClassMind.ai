const mongoose = require('mongoose');

/**
 * Teacher Attendance Schema
 * Records each face-recognition-verified teacher attendance event.
 * Matches the Python FastAPI backend output and React Scanner page expectations.
 */
const AttendanceSchema = new mongoose.Schema({
    // Teacher identity fields
    teacherId:   { type: Number, required: true },    // Numeric teacher ID (matches Teacher.id)
    teacherName: { type: String, default: '' },        // Full name (optional, for quick display)

    // Session fields
    classId:     { type: String, required: true },     // Course code e.g. "CS401"
    lectureId:   { type: String, required: true },     // e.g. "LEC-2026-06-23"

    // Recognition result
    confidence:  { type: Number, required: true },     // 0.0 - 1.0 match confidence
    status:      { type: String, default: 'Present', enum: ['Present', 'Absent', 'Unverified'] },

    // How was this recognition done?
    recognitionMethod: {
        type: String,
        default: 'face_recognition',  // 'face_recognition' | 'deepface' | 'simulation'
        enum: ['face_recognition', 'deepface', 'simulation']
    },

    // Timestamp of when the attendance was marked
    date: { type: Date, default: Date.now }

}, { timestamps: true });

// Compound index to prevent duplicate attendance per (teacher, class, lecture)
AttendanceSchema.index({ teacherId: 1, classId: 1, lectureId: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', AttendanceSchema, 'Attendance');
