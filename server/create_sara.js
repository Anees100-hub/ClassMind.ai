const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const MONGO_URI = process.env.MONGO_URI;

console.log('Connecting to MongoDB...');

mongoose.connect(MONGO_URI, {
    family: 4,
})
    .then(async () => {
        console.log('✓ Connected to MongoDB');

        const UserSchema = new mongoose.Schema({
            id: Number,
            firstName: String,
            lastName: String,
            email: String,
            password: String,
            role: String,
            phone: String,
            department: String,
            specialization: String,
            classes: Number,
            students: Number,
            studentId: String,
            program: String,
            year: String,
            enrollmentDate: String,
            assignedClasses: [String],
            enrolledClasses: [String],
            status: String
        }, { collection: 'Users' });

        const User = mongoose.model('User', UserSchema);

        // Check if Sara already exists
        const existing = await User.findOne({ email: 'sara@classmind.ai' });

        if (existing) {
            console.log('Sara already exists — updating password...');
            existing.password = 'sara123';
            await existing.save();
            console.log('✓ Password updated to: sara123');
            await mongoose.connection.close();
            process.exit(0);
            return;
        }

        // Find highest ID
        const allUsers = await User.find({}).sort({ id: -1 }).limit(1);
        const nextId = allUsers.length > 0 ? allUsers[0].id + 1 : 1;

        console.log('Creating Sara user with ID:', nextId);

        const sara = new User({
            id: nextId,
            firstName: 'Sara',
            lastName: '',
            email: 'sara@classmind.ai',
            password: 'sara123',
            role: 'admin',
            status: 'Active'
        });

        await sara.save();

        console.log('✓ Sara user created!');
        console.log('  Email:    sara@classmind.ai');
        console.log('  Password: sara123');
        console.log('  Role:     admin');

        await mongoose.connection.close();
        console.log('✓ Done');
        process.exit(0);
    })
    .catch(err => {
        console.error('✗ Error:', err.message);
        process.exit(1);
    });
