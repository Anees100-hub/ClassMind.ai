const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Material = require('../models/Material');
const Notification = require('../models/Notification');
const Class = require('../models/Class');
const Teacher = require('../models/Teacher');
const pdfParse = require('pdf-parse');
const JSZip = require('jszip');
const { XMLParser } = require('fast-xml-parser');
const { GoogleGenAI } = require('@google/genai');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Multer Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Helper to generate AI summary
async function generateAISummary(filePath, mimetype) {
    let extractedText = '';

    try {
        if (mimetype === 'application/pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            extractedText = data.text;
        } else if (filePath.toLowerCase().endsWith('.pptx') || mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
            // Extract text from PPTX by reading slide XML inside the ZIP
            try {
                const pptxData = fs.readFileSync(filePath);
                const zip = await JSZip.loadAsync(pptxData);

                // Collect slide filenames in order
                const slideFiles = Object.keys(zip.files)
                    .filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p))
                    .sort((a, b) => {
                        const na = parseInt(a.match(/slide(\d+)\.xml$/)[1], 10);
                        const nb = parseInt(b.match(/slide(\d+)\.xml$/)[1], 10);
                        return na - nb;
                    });

                const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
                const slidesText = [];

                for (const slidePath of slideFiles) {
                    const fileData = await zip.files[slidePath].async('string');
                    const json = parser.parse(fileData);

                    // Extract all text runs <a:t> anywhere in the slide XML
                    const collectAT = (obj) => {
                        let acc = [];
                        if (!obj || typeof obj !== 'object') return acc;
                        for (const k of Object.keys(obj)) {
                            if (k === 'a:t') {
                                if (Array.isArray(obj[k])) acc = acc.concat(obj[k]);
                                else acc.push(obj[k]);
                            } else if (typeof obj[k] === 'object') {
                                acc = acc.concat(collectAT(obj[k]));
                            }
                        }
                        return acc;
                    };

                    const textRuns = collectAT(json);
                    const slideText = textRuns.map(t => (typeof t === 'object' && t['#text']) ? t['#text'] : String(t)).join(' ');
                    slidesText.push(slideText.trim());
                }

                // Use first slide's first text as a better title fallback (if available)
                extractedText = slidesText.filter(s => s && s.length).join('\n\n');
            } catch (pptErr) {
                console.error('PPTX extraction failed:', pptErr);
                extractedText = "This is a presentation file regarding class lectures.";
            }
        } else if (filePath.toLowerCase().endsWith('.ppt') || mimetype === 'application/vnd.ms-powerpoint') {
            // Legacy binary PPT files are not supported in this environment
            throw new Error('Legacy .ppt/.pps formats are not supported. Please upload .pptx files.');
        } else {
            // Unknown formats: fallback generic text
            extractedText = "This is a presentation file regarding class lectures.";
        }

        // Limit length of text passed to AI to avoid gigantic token usage
        extractedText = extractedText.substring(0, 15000);

        if (!process.env.GEMINI_API_KEY) {
            console.log("No GEMINI_API_KEY found. Falling back to mock summary.");
            return generateMockSummary(extractedText);
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Please read the following lecture excerpt and provide a concise, structured 3-bullet point summary for students to review quickly:\n\n${extractedText}`,
        });
        
        return response.text;
    } catch (err) {
        console.error("AI Generation Error", err);
        return "Summary could not be automatically generated.";
    }
}

function generateMockSummary(text) {
    return `[Demo Summary — configure GEMINI_API_KEY for real AI summaries]\n• Key concepts relating to ${text.substring(0, 30).replace(/[^a-zA-Z]/g, ' ')} are covered.\n• Reviews foundational principles designed for student learning.\n• Includes practice elements and detailed slides.`;
}

// Routes
// POST /api/materials/upload
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const { title, description, classId, teacherId } = req.body;
        const file = req.file;

        if (!file) return res.status(400).json({ message: 'No file uploaded' });

        // Reject legacy binary .ppt/.pps formats; require .pptx
        const lowerName = file.originalname.toLowerCase();
        if (lowerName.endsWith('.ppt') || lowerName.endsWith('.pps')) {
            // remove uploaded file
            try { fs.unlinkSync(file.path); } catch { /* ignore */ }
            return res.status(400).json({ message: 'Legacy .ppt/.pps formats are not supported. Please convert to .pptx and re-upload.' });
        }

        let format = 'PDF';
        if (lowerName.endsWith('.pptx')) {
            format = 'PPTX';
        }

        const fileUrl = `/uploads/${file.filename}`;
        
        // Generate AI Summary
        const aiSummary = await generateAISummary(file.path, file.mimetype);
        const isDemoSummary = !process.env.GEMINI_API_KEY || aiSummary.startsWith('[Demo Summary');

        const material = new Material({
            id: 'MAT' + Date.now().toString().slice(-6),
            title,
            description,
            format,
            fileUrl,
            classId,
            teacherId,
            aiSummary,
            isDemoSummary: !!isDemoSummary,
            accessedBy: []
        });

        const savedMaterial = await material.save();

        // Dispatch notification for students — include materialId so students can navigate directly
        try {
            const notif = new Notification({
                id: 'NTF' + Date.now(),
                classId: classId,
                materialId: savedMaterial.id,  // ← links to the actual material for navigation
                title: `New Material Uploaded: ${title}`,
                message: `New learning material "${title}" (${format}) has been uploaded with AI summary.`,
                type: 'material',
                code: classId,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                unread: true
            });
            await notif.save();
        } catch (notifErr) {
            console.error("Failed to save material notification:", notifErr);
        }

        // Update class recentActivity so teacher sees the upload immediately on their course page
        try {
            const cls = await Class.findOne({ id: classId });
            if (cls) {
                cls.recentActivity = cls.recentActivity || [];
                cls.recentActivity.unshift({
                    title: `Material uploaded: "${title}" (${format})`,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    type: 'upload'
                });
                // Keep only last 10 activities
                if (cls.recentActivity.length > 10) cls.recentActivity = cls.recentActivity.slice(0, 10);
                await cls.save();
            }
        } catch (actErr) {
            console.error("Failed to update class recentActivity:", actErr);
        }

        // Increment teacher materialsCount in MongoDB
        let updatedMaterialsCount = null;
        if (teacherId) {
            try {
                const updatedTeacher = await Teacher.findOneAndUpdate(
                    { id: Number(teacherId) },
                    { $inc: { materialsCount: 1 } },
                    { new: true }
                );
                if (updatedTeacher) {
                    updatedMaterialsCount = updatedTeacher.materialsCount;
                }
            } catch (countErr) {
                console.error("Failed to increment teacher materialsCount:", countErr);
            }
        }

        res.status(201).json({ ...savedMaterial.toObject(), teacherMaterialsCount: updatedMaterialsCount });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
});

// GET /api/materials/all — list all materials (for dashboard counts)
router.get('/all', async (req, res) => {
    try {
        const allMaterials = await Material.find().sort({ uploadDate: -1 });
        res.json(allMaterials);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/materials/teacher/:teacherId — all materials uploaded by a teacher
router.get('/teacher/:teacherId', async (req, res) => {
    try {
        const teacherId = String(req.params.teacherId);
        const materials = await Material.find({ teacherId }).sort({ uploadDate: -1 });
        res.json(materials);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/materials/class/:classId
router.get('/class/:classId', async (req, res) => {
    try {
        const materials = await Material.find({ classId: req.params.classId });
        res.json(materials);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/materials/:id
router.get('/:id', async (req, res) => {
    try {
        const material = await Material.findOne({ id: req.params.id });
        if (!material) return res.status(404).json({ message: 'Material not found' });
        res.json(material);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/materials/:id
router.put('/:id', async (req, res) => {
    try {
        const updated = await Material.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// DELETE /api/materials/:id
router.delete('/:id', async (req, res) => {
    try {
        const material = await Material.findOne({ id: req.params.id });
        if (material) {
            const filePath = path.join(__dirname, '../', material.fileUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            await Material.findOneAndDelete({ id: req.params.id });
        }
        res.json({ message: 'Material deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST mark as accessed
router.post('/:id/access', async (req, res) => {
    try {
        const { studentId } = req.body;
        const material = await Material.findOne({ id: req.params.id });
        
        if (!material.accessedBy.includes(studentId)) {
            material.accessedBy.push(studentId);
            await material.save();
        }
        res.json(material);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
