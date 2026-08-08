const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true }, // Using generic number ID to match mock data simplicity
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },
    department: { type: String }, // For Teachers
    specialization: { type: String }, // For Teachers
    classes: { type: Number, default: 0 }, // Teacher stats
    students: { type: Number, default: 0 }, // Teacher stats

    studentId: { type: String }, // For Students (STU...)
    program: { type: String },
    year: { type: String },
    enrollmentDate: { type: String },

    assignedClasses: [String], // Array of Class IDs (e.g. 'CS401')
    enrolledClasses: [String], // Array of Class IDs

    status: { type: String, default: 'Active' },
    role: { type: String, enum: ['admin', 'teacher', 'student'], default: 'student' }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema, 'Users');
