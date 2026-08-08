const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    studentId: { type: String },
    program: { type: String },
    year: { type: String },
    enrollmentDate: { type: String },
    enrolledClasses: [String],
    status: { type: String, default: 'Active' },
    progress: { type: String, default: '0%' },
    previousCGPA: { type: String, default: '0.00' },
    overallCGPA: { type: String, default: '0.00' },
    materialsCount: { type: Number, default: 0 },
    updatesCount: { type: Number, default: 0 },
    role: { type: String, default: 'student' }
}, { timestamps: true });

module.exports = mongoose.model('Student', StudentSchema, 'Students');
