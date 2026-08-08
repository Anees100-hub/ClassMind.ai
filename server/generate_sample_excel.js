const XLSX = require('xlsx');
const path = require('path');

const data = [
    {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        studentId: 'STU001',
        program: 'Computer Science',
        year: 'Year 1',
        status: 'Active',
        progress: '45%'
    },
    {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
        studentId: 'STU002',
        program: 'Mathematics',
        year: 'Year 2',
        status: 'Active',
        progress: '78%'
    },
    {
        firstName: 'Alice',
        lastName: 'Brown',
        email: 'alice.b@example.com',
        studentId: 'STU003',
        program: 'Physics',
        year: 'Year 3',
        status: 'Inactive',
        progress: '12%'
    },
    {
        firstName: 'Bob',
        lastName: 'Wilson',
        email: 'bob.w@example.com',
        studentId: 'STU004',
        program: 'Chemistry',
        year: 'Year 1',
        status: 'Active',
        progress: '90%'
    },
    {
        firstName: 'Charlie',
        lastName: 'Davis',
        email: 'charlie.d@example.com',
        studentId: 'STU005',
        program: 'Biology',
        year: 'Year 2',
        status: 'Active',
        progress: '55%'
    }
];

const ws = XLSX.utils.json_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Students');

const filePath = path.join(__dirname, '..', 'sample_students.xlsx');
XLSX.writeFile(wb, filePath);

console.log(`Sample Excel file created at: ${filePath}`);
