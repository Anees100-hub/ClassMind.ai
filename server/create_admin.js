const mongoose = require('mongoose');
require('dotenv').config({ path: './server/.env' });

const MONGO_URI = process.env.MONGO_URI;

console.log('Connecting to MongoDB...');

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    family: 4,
})
    .then(async () => {
        console.log('✓ Connected to MongoDB');

        // Define User schema
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

        // Check if admin already exists
        const existingAdmin = await User.findOne({ email: 'admin@classmind.ai' });

        if (existingAdmin) {
            console.log('✓ Admin user already exists');
            console.log('  Email:', existingAdmin.email);
            console.log('  Password:', existingAdmin.password);
            await mongoose.connection.close();
            process.exit(0);
            return;
        }

        // Find the highest ID
        const allUsers = await User.find({}).sort({ id: -1 }).limit(1);
        const nextId = allUsers.length > 0 ? allUsers[0].id + 1 : 999;

        console.log('\n--- Creating admin user ---');
        console.log('  Assigning ID:', nextId);

        // Create admin user
        const adminUser = new User({
            id: nextId,
            firstName: 'Admin',
            lastName: 'User',
            email: 'admin@classmind.ai',
            password: 'password123',
            role: 'admin',
            status: 'Active'
        });

        await adminUser.save();

        console.log('✓ Admin user created successfully!');
        console.log('  Email: admin@classmind.ai');
        console.log('  Password: password123');
        console.log('  Role: admin');
        console.log('  ID:', nextId);

        // Verify it was created
        const verify = await User.findOne({ email: 'admin@classmind.ai' });
        if (verify) {
            console.log('\n✓ Verification successful - admin user exists in database');
        } else {
            console.log('\n✗ Verification failed - something went wrong');
        }

        await mongoose.connection.close();
        console.log('\n✓ Done');
        process.exit(0);
    })
    .catch(err => {
        console.error('✗ Error:', err.message);
        process.exit(1);
    });
