const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Student = require('./models/Student');
const Teacher = require('./models/Teacher');
const Class = require('./models/Class');
const User = require('./models/User');

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    family: 4,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
})
    .then(() => console.log('Mongoose background connection initiated...'))
    .catch(err => console.error('Immediate connection error:', err));

const seedData = async () => {
    console.log('Starting seed process...');
    try {
        await Student.deleteMany({});
        console.log('Cleared Students');
        await Teacher.deleteMany({});
        console.log('Cleared Teachers');
        await Class.deleteMany({});
        console.log('Cleared Classes');
        await User.deleteMany({});
        console.log('Cleared Users');

        const users = [
            { id: 1, firstName: 'Sarah', lastName: 'Johnson', email: 'sarah.j@classmind.ai', password: 'password123', role: 'teacher', assignedClasses: ['CS401'] },
            { id: 2, firstName: 'Michael', lastName: 'Chen', email: 'michael.c@classmind.ai', password: 'password123', role: 'teacher', assignedClasses: ['CS502'] },
            { id: 101, firstName: 'Jane', lastName: 'Doe', email: 'janedoe@student.edu', password: 'password123', role: 'student', enrolledClasses: ['CS401'] },
            { id: 102, firstName: 'Alex', lastName: 'Smith', email: 'student@classmind.ai', password: 'password123', role: 'student', enrolledClasses: ['CS401', 'CS502'] },
            { id: 999, firstName: 'Admin', lastName: 'User', email: 'admin@classmind.ai', password: 'password123', role: 'admin' },
        ];

        await User.insertMany(users);
        console.log('Seeded Users');

        const teachers = [
            { id: 1, firstName: 'Sarah', lastName: 'Johnson', email: 'sarah.j@classmind.ai', phone: '+1 234-567-8901', department: 'Computer Science', specialization: 'AI & ML', assignedClasses: ['CS401'], status: 'Active', performance: '98%', office: 'Campus Building 4, Office 401', materialsCount: 15, role: 'teacher' },
            { id: 2, firstName: 'Michael', lastName: 'Chen', email: 'michael.c@classmind.ai', phone: '+1 234-567-8902', department: 'Computer Science', specialization: 'Deep Learning', assignedClasses: ['CS502'], status: 'Active', performance: '92%', office: 'Campus Building 4, Office 402', materialsCount: 22, role: 'teacher' },
            { id: 3, firstName: 'Emily', lastName: 'Brown', email: 'emily.b@classmind.ai', phone: '+1 234-567-8903', department: 'Mathematics', specialization: 'Statistics', assignedClasses: [], status: 'On Leave', performance: '88%', office: 'Math Building, Office 101', materialsCount: 8, role: 'teacher' },
            { id: 4, firstName: 'David', lastName: 'Wilson', email: 'david.w@classmind.ai', phone: '+1 234-567-8904', department: 'Physics', specialization: 'Quantum Mechanics', assignedClasses: [], status: 'Active', performance: '95%', office: 'Physics Lab, Office B1', materialsCount: 12, role: 'teacher' },
            { id: 5, firstName: 'Jessica', lastName: 'Davis', email: 'jessica.d@classmind.ai', phone: '+1 234-567-8905', department: 'Mathematics', specialization: 'Calculus', assignedClasses: [], status: 'Active', performance: '91%', office: 'Math Building, Office 102', materialsCount: 5, role: 'teacher' },
        ];

        const students = [
            { id: 101, firstName: 'Jane', lastName: 'Doe', email: 'janedoe@student.edu', studentId: 'STU2024001', program: 'Computer Science', year: 'Year 2', enrollmentDate: '2024-09-01', status: 'Active', role: 'student', enrolledClasses: ['CS401'], materialsCount: 0, updatesCount: 0 },
            { id: 102, firstName: 'Alex', lastName: 'Smith', email: 'student@classmind.ai', studentId: 'STU2024002', program: 'AI Intelligence', year: 'Year 3', enrollmentDate: '2024-09-01', status: 'Active', role: 'student', enrolledClasses: ['CS401', 'CS502'], materialsCount: 0, updatesCount: 0 },
            { id: 103, firstName: 'Alice', lastName: 'Johnson', email: 'alice.j@student.edu', studentId: 'STU2024003', program: 'Mathematics', year: 'Year 3', enrollmentDate: '2023-09-01', status: 'Suspended', role: 'student', materialsCount: 0, updatesCount: 0 },
            { id: 104, firstName: 'Bob', lastName: 'Brown', email: 'bob.b@student.edu', studentId: 'STU2024004', program: 'Physics', year: 'Year 2', enrollmentDate: '2024-01-15', status: 'Active', role: 'student', materialsCount: 0, updatesCount: 0 },
        ];

        const classes = [
            {
                id: 'CS401',
                name: 'Introduction to Machine Learning',
                instructorId: 1,
                instructorName: 'Sarah Johnson',
                description: 'A comprehensive introduction to machine learning algorithms, techniques, and applications.',
                schedule: 'Monday, Wednesday 10:00 AM - 11:30 AM',
                status: 'Active',
                stats: [
                    { label: 'Total Students', value: '0' },
                    { label: 'Avg Attendance', value: '—' },
                    { label: 'Engagement', value: '—' },
                    { label: 'Pending Reviews', value: '0' }
                ],
                studentsCount: 0,
                participation: 0,
                tracking: [],
                analytics: {
                    summary: { happy: 0, engaged: 0, neutral: 0, disengaged: 0, improvement: 0 },
                    trends: []
                },
                recentActivity: []
            },
            {
                id: 'CS502',
                name: 'Advanced Deep Learning',
                instructorId: 2,
                instructorName: 'Michael Chen',
                description: 'Deep neural networks and their applications in modern AI systems.',
                schedule: 'Tuesday, Thursday 2:00 PM - 3:30 PM',
                status: 'Active',
                stats: [
                    { label: 'Total Students', value: '0' },
                    { label: 'Avg Attendance', value: '—' },
                    { label: 'Engagement', value: '—' },
                    { label: 'Pending Reviews', value: '0' }
                ],
                studentsCount: 0,
                participation: 0,
                tracking: [],
                analytics: {
                    summary: { happy: 0, engaged: 0, neutral: 0, disengaged: 0, improvement: 0 },
                    trends: []
                },
                recentActivity: []
            }
        ];

        await Teacher.insertMany(teachers);
        console.log('Seeded Teachers');
        await Student.insertMany(students);
        console.log('Seeded Students');
        await Class.insertMany(classes);
        console.log('Seeded Classes');

        console.log('Database Seeded Successfully');
        process.exit(0);
    } catch (err) {
        console.error('Seeding Error:', err.message);
        process.exit(1);
    }
};

mongoose.connection.on('open', () => {
    console.log('MongoDB connection is open. Starting seedData...');
    seedData();
});
