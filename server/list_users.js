const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

mongoose.connect(process.env.MONGO_URI, { family: 4 })
    .then(async () => {
        const UserSchema = new mongoose.Schema({
            id: Number, firstName: String, lastName: String,
            email: String, password: String, role: String, status: String
        }, { collection: 'Users' });

        const User = mongoose.model('User', UserSchema);
        const users = await User.find({}).sort({ role: 1, id: 1 });

        console.log('\n=== ALL USERS ===\n');
        users.forEach(u => {
            console.log(`Role: ${u.role}`);
            console.log(`Name: ${u.firstName} ${u.lastName}`);
            console.log(`Email: ${u.email}`);
            console.log(`Password: ${u.password}`);
            console.log('---');
        });
        console.log(`\nTotal: ${users.length} users`);
        await mongoose.connection.close();
        process.exit(0);
    })
    .catch(err => { console.error('Error:', err.message); process.exit(1); });
