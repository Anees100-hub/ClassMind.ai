const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

console.log('Testing connection (database: test)...');

async function test() {
    try {
        const uri = process.env.MONGO_URI;
        await mongoose.connect(uri, {
            family: 4,
            tlsAllowInvalidCertificates: true,
            serverSelectionTimeoutMS: 30000,
        });
        console.log('SUCCESS: Connected to Atlas/Database:', mongoose.connection.name);

        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Found Collections:', collections.map(c => c.name));

        process.exit(0);
    } catch (err) {
        console.error('FAILURE: Could not connect to MongoDB:', err.message);
        process.exit(1);
    }
}

test();
