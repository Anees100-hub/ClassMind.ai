const mongoose = require('mongoose');

async function testAtlas() {
    const uri = 'mongodb+srv://ab8432202:Aneesbutt786@cluster0.pklthsm.mongodb.net/ClassMind?retryWrites=true&w=majority';
    console.log('Attempting to connect to Atlas...');
    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000,
            tlsAllowInvalidCertificates: true
        });
        console.log('Atlas Connected Successfully!');
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name));
        process.exit(0);
    } catch (err) {
        console.error('Atlas Connection Failed:', err);
        process.exit(1);
    }
}

testAtlas();
