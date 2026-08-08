const mongoose = require('mongoose');

/** Same options as test_atlas_connection.js — Atlas only, no local fallback */
const CONNECT_OPTIONS = {
    family: 4,
    tlsAllowInvalidCertificates: true,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
};

async function connectDatabase() {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error('[MongoDB] MONGO_URI is not set in server/.env');
        return false;
    }
    await mongoose.connect(uri, CONNECT_OPTIONS);
    console.log('MongoDB Connected successfully to:', mongoose.connection.name);
    return true;
}

module.exports = { connectDatabase, CONNECT_OPTIONS };
