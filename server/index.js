const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const { requireAuth } = require('./middleware/auth');
const { migrateSeedData } = require('./utils/migrateSeedData');

app.use(express.json());
app.use(cors());

// Serve uploads directory
app.use('/uploads', express.static('uploads'));

// Public health check (no auth)
app.get('/api/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    res.json({
        ok: dbState === 1,
        db: states[dbState] || 'unknown',
        dbName: mongoose.connection.name || null,
    });
});
console.log("Mongo URI:", process.env.MONGO_URI);
// Connect to MongoDB Atlas (original direct connection — same as test_atlas_connection.js)
mongoose.connect(process.env.MONGO_URI, {
    family: 4,
    tlsAllowInvalidCertificates: true,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
})
    .then(async () => {
        console.log('MongoDB Connected successfully to:', mongoose.connection.name);
        try {
            await migrateSeedData();
        } catch (err) {
            console.warn('[migrate] Seed cleanup skipped:', err.message);
        }
    })
    .catch(err => console.error('Initial MongoDB Connection Error:', err.message));

mongoose.connection.on('error', err => {
    if (mongoose.connection.readyState === 1) {
        console.error('[MongoDB] Runtime error:', err.message);
    }
});

mongoose.connection.on('disconnected', () => {
    if (mongoose.connection.readyState === 0) {
        // only log after connect attempts finish — connect.js handles retry messages
    }
});

// Routes
const studentRoutes = require('./routes/students');
const teacherRoutes = require('./routes/teachers');
const classRoutes = require('./routes/classes');
const userRoutes = require('./routes/users');
const materialRoutes = require('./routes/materials');
const attendanceRoutes = require('./routes/attendance');
const timetableRoutes = require('./routes/timetable');
const engagementRoutes = require('./routes/engagement');
const notificationRoutes = require('./routes/notifications');
const settingsRoutes = require('./routes/settings');

app.use('/api/users', userRoutes);
app.use('/api/students', requireAuth, studentRoutes);
app.use('/api/teachers', requireAuth, teacherRoutes);
app.use('/api/classes', requireAuth, classRoutes);
app.use('/api/materials', requireAuth, materialRoutes);
app.use('/api/attendance', requireAuth, attendanceRoutes);
app.use('/api/timetable', requireAuth, timetableRoutes);
app.use('/api/engagement', requireAuth, engagementRoutes);
app.use('/api/notifications', requireAuth, notificationRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);


const PORT = process.env.PORT || 5003;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
