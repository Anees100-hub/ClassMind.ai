const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
    id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String },
    format: { type: String, enum: ['PDF', 'PPT', 'PPTX'], required: true },
    fileUrl: { type: String, required: true },
    classId: { type: String, required: true },
    teacherId: { type: String, required: true },
    uploadDate: { type: Date, default: Date.now },
    aiSummary: { type: String },
    isDemoSummary: { type: Boolean, default: false },
    accessedBy: [{ type: String }] // Array of student IDs who viewed the material
});

module.exports = mongoose.model('Material', materialSchema);
