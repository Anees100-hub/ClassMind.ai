const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const { createSessionToken, verifySessionToken } = require('../utils/sessionToken');
const { requireAuth, requireRole } = require('../middleware/auth');

function sanitizeUser(user) {
    const obj = user.toObject ? user.toObject() : { ...user };
    delete obj.password;
    return obj;
}

// Public: validate session token
router.get('/session', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No session token' });
    }
    const payload = verifySessionToken(auth.slice(7));
    if (!payload) {
        return res.status(401).json({ message: 'Invalid or expired session' });
    }
    res.json({
        email: payload.email,
        role: payload.role,
        id: payload.id,
        name: payload.name || payload.email,
    });
});

// Public: login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email, password });
        if (!user) return res.status(401).json({ message: 'Invalid email or password' });

        if (user.role === 'teacher') {
            const teacher = await Teacher.findOne({ email: user.email });
            if (!teacher) {
                await User.deleteMany({ email: user.email, role: 'teacher' });
                return res.status(403).json({ message: 'This teacher account has been removed. Please contact your administrator.' });
            }
            if (teacher.status === 'Inactive') {
                return res.status(403).json({ message: 'This teacher account is inactive.' });
            }
        }

        if (user.role === 'student') {
            const student = await Student.findOne({ email: user.email });
            if (!student) {
                await User.deleteMany({ email: user.email, role: 'student' });
                return res.status(403).json({ message: 'This student account has been removed. Please contact your administrator.' });
            }
        }

        const safe = sanitizeUser(user);
        const token = createSessionToken(safe);
        res.json({ ...safe, token });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Protected routes below
router.use(requireAuth);

// Get all users (admin only, passwords excluded)
router.get('/', requireRole('admin'), async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get specific user by email
router.get('/email/:email', requireRole('admin'), async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email }).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Change password (plaintext — no hashing per project scope)
router.post('/change-password', async (req, res) => {
    const { email, currentPassword, newPassword } = req.body;

    if (!email || !currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Email, current password, and new password are required' });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }
    if (req.user.role !== 'admin' && req.user.email !== email) {
        return res.status(403).json({ message: 'You can only change your own password' });
    }

    try {
        const user = await User.findOne({ email, password: currentPassword });
        if (!user) {
            return res.status(401).json({ message: 'Current password is incorrect' });
        }

        user.password = newPassword;
        await user.save();

        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Add new user (admin only)
router.post('/', requireRole('admin'), async (req, res) => {
    const user = new User(req.body);
    try {
        const newUser = await user.save();
        res.status(201).json(sanitizeUser(newUser));
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Update user (admin only)
router.patch('/:id', requireRole('admin'), async (req, res) => {
    try {
        const updatedUser = await User.findOneAndUpdate({ id: req.params.id }, req.body, { new: true }).select('-password');
        res.json(updatedUser);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Delete user (admin only)
router.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
        const id = Number(req.params.id);
        await User.deleteMany({ $or: [{ id }, { id: req.params.id }] });
        res.json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
