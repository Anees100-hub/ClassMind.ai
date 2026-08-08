const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config({ path: './server/.env' });

const MONGO_URI = process.env.MONGO_URI;
const output = [];

function log(msg) {
    console.log(msg);
    output.push(msg);
}

log('Connecting to: ' + (MONGO_URI ? MONGO_URI.substring(0, 30) + '...' : 'NOT SET'));

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    family: 4,
})
    .then(async () => {
        log('✓ Connected to MongoDB');

        // Define User schema inline to avoid import issues
        const UserSchema = new mongoose.Schema({
            id: Number,
            firstName: String,
            lastName: String,
            email: String,
            password: String,
            role: String
        }, { collection: 'Users' });

        const User = mongoose.model('User', UserSchema);

        // Check for admin user
        log('\n--- Searching for admin user ---');
        const admin = await User.findOne({ email: 'admin@classmind.ai' });

        if (admin) {
            log('✓ Admin user EXISTS');
            log('  Email: ' + admin.email);
            log('  Password: ' + admin.password);
            log('  Role: ' + admin.role);
            log('  Name: ' + admin.firstName + ' ' + admin.lastName);

            // Test the exact login query
            log('\n--- Testing login query ---');
            const loginTest = await User.findOne({
                email: 'admin@classmind.ai',
                password: 'password123'
            });

            if (loginTest) {
                log('✓ Login query WORKS - credentials match!');
            } else {
                log('✗ Login query FAILS');
                log('  Expected password: password123');
                log('  Actual password: ' + admin.password);
                log('  Match: ' + (admin.password === 'password123'));
            }
        } else {
            log('✗ Admin user DOES NOT EXIST');
            log('\n--- All users in database ---');
            const allUsers = await User.find({});
            log('Total users: ' + allUsers.length);
            allUsers.forEach(u => {
                log(`  ${u.email} - ${u.role} - pwd: ${u.password}`);
            });
        }

        // Write to file
        fs.writeFileSync('./server/admin_check_result.txt', output.join('\n'));
        log('\n✓ Results saved to server/admin_check_result.txt');

        await mongoose.connection.close();
        process.exit(0);
    })
    .catch(err => {
        log('✗ Connection failed: ' + err.message);
        fs.writeFileSync('./server/admin_check_result.txt', output.join('\n'));
        process.exit(1);
    });
