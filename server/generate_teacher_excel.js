const XLSX = require('xlsx');
const path = require('path');

const data = [
    {
        firstName: 'Michael',
        lastName: 'Jordan',
        email: 'michael.jordan@classmind.ai',
        phone: '555-0101',
        department: 'Sports Science',
        specialization: 'Performance Analytics',
        office: 'Gym Complex, Office 101',
        status: 'Active',
        performance: '98%'
    },
    {
        firstName: 'Sarah',
        lastName: 'Connor',
        email: 'sarah.connor@classmind.ai',
        phone: '555-0102',
        department: 'Defense Studies',
        specialization: 'Cybersecurity',
        office: 'Tech Building, Room 404',
        status: 'Active',
        performance: '95%'
    },
    {
        firstName: 'Alan',
        lastName: 'Turing',
        email: 'alan.turing@classmind.ai',
        phone: '555-0103',
        department: 'Computer Science',
        specialization: 'Artificial Intelligence',
        office: 'Lab 3, Bletchley Wing',
        status: 'On Leave',
        performance: '99%'
    },
    {
        firstName: 'Marie',
        lastName: 'Curie',
        email: 'marie.curie@classmind.ai',
        phone: '555-0104',
        department: 'Physics',
        specialization: 'Nuclear Physics',
        office: 'Science Park, Lab 1',
        status: 'Active',
        performance: '97%'
    },
    {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada.lovelace@classmind.ai',
        phone: '555-0105',
        department: 'Mathematics',
        specialization: 'Algorithms',
        office: 'Math Dept, Room 303',
        status: 'Active',
        performance: '96%'
    }
];

const ws = XLSX.utils.json_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Teachers');

const filePath = path.join(__dirname, '..', 'sample_teachers.xlsx');
XLSX.writeFile(wb, filePath);

console.log(`Sample Excel file created at: ${filePath}`);
