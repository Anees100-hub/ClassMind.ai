const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function listStudents() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const Student = require('./models/Student');
        const students = await Student.find({}, 'id firstName lastName email');
        console.log('Students in DB:', students);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
listStudents();
