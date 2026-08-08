const mongoose = require('mongoose');

async function dropDb() {
    const uri = 'mongodb://127.0.0.1:27017/classmind';
    try {
        await mongoose.connect(uri);
        console.log('Connected to classmind');
        await mongoose.connection.db.dropDatabase();
        console.log('Database classmind dropped successfully');
        process.exit(0);
    } catch (err) {
        console.error('Error dropping database:', err);
        process.exit(1);
    }
}

dropDb();
