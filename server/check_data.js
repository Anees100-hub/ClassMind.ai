const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function checkData() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('\n--- Database Verification ---');
        console.log('Connected to:', mongoose.connection.name);

        const teachers = await mongoose.connection.db.collection('Teachers').countDocuments();
        const students = await mongoose.connection.db.collection('Students').countDocuments();
        const classes = await mongoose.connection.db.collection('Classes').countDocuments();

        console.log(`\nTotal Teachers: ${teachers}`);
        console.log(`Total Students: ${students}`);
        console.log(`Total Classes: ${classes}`);

        console.log('\n--- Recent Teachers ---');
        const recentTeachers = await mongoose.connection.db.collection('Teachers').find().limit(3).toArray();
        recentTeachers.forEach(t => console.log(`- ${t.firstName} ${t.lastName} (${t.email})`));

        process.exit(0);
    } catch (err) {
        console.error('Error connecting to database:', err);
        process.exit(1);
    }
}

checkData();
