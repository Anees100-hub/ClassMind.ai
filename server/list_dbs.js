const mongoose = require('mongoose');

async function listDbs() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017');
        const admin = mongoose.connection.db.admin();
        const dbs = await admin.listDatabases();
        console.log('Databases:', dbs.databases.map(d => d.name));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
listDbs();
