const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');

dotenv.config();

const testLogin = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            family: 4,
            serverSelectionTimeoutMS: 30000,
        });
        console.log('✓ Connected to MongoDB:', mongoose.connection.name);

        // Test 1: Check if admin user exists
        console.log('\n--- Test 1: Checking for admin user ---');
        const adminUser = await User.findOne({ email: 'admin@classmind.ai' });

        if (adminUser) {
            console.log('✓ Admin user found:');
            console.log('  ID:', adminUser.id);
            console.log('  Name:', adminUser.firstName, adminUser.lastName);
            console.log('  Email:', adminUser.email);
            console.log('  Password (stored):', adminUser.password);
            console.log('  Role:', adminUser.role);
        } else {
            console.log('✗ Admin user NOT found in database');
        }

        // Test 2: Check all users
        console.log('\n--- Test 2: All users in database ---');
        const allUsers = await User.find({});
        console.log(`Total users: ${allUsers.length}`);
        allUsers.forEach(user => {
            console.log(`  - ${user.email} (${user.role}) - password: ${user.password}`);
        });

        // Test 3: Test login query
        console.log('\n--- Test 3: Testing login query ---');
        const testEmail = 'admin@classmind.ai';
        const testPassword = 'password123';

        const loginResult = await User.findOne({
            email: testEmail,
            password: testPassword
        });

        if (loginResult) {
            console.log('✓ Login query successful!');
            console.log('  User:', loginResult.firstName, loginResult.lastName);
        } else {
            console.log('✗ Login query failed');
            console.log('  Attempted email:', testEmail);
            console.log('  Attempted password:', testPassword);

            // Check if user exists with different password
            const userWithEmail = await User.findOne({ email: testEmail });
            if (userWithEmail) {
                console.log('  User exists but password mismatch');
                console.log('  Stored password:', userWithEmail.password);
                console.log('  Attempted password:', testPassword);
                console.log('  Match:', userWithEmail.password === testPassword);
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

testLogin();
