const mongoose = require('mongoose');

const TeacherSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    department: { type: String },
    specialization: { type: String },
    assignedClasses: [String],
    status: { type: String, default: 'Active' },
    performance: { type: String, default: '94%' },
    office: { type: String, default: 'Campus Building 4, Office 201' },
    materialsCount: { type: Number, default: 0 },
    role: { type: String, default: 'teacher' },
    faceDescriptor: { type: [Number] },
    classId: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Teacher', TeacherSchema, 'Teachers');
