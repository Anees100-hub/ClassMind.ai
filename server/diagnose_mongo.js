/**
 * Run: node diagnose_mongo.js
 * Checks DNS, TCP port 27017, public IP (for Atlas whitelist), and Mongoose connect.
 */
require('dotenv').config();
const dns = require('dns').promises;
const net = require('net');
const mongoose = require('mongoose');
const https = require('https');

const HOST = 'cluster0.pklthsm.mongodb.net';
const SHARD_HOST = 'ac-i4ujzwq-shard-00-00.pklthsm.mongodb.net';
const PORT = 27017;

function fetchPublicIp() {
    return new Promise((resolve) => {
        https.get('https://api.ipify.org?format=json', (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(data).ip); } catch { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

function testTcp(host, port, timeoutMs = 8000) {
    return new Promise((resolve) => {
        const socket = net.connect({ host, port, family: 4 });
        const timer = setTimeout(() => {
            socket.destroy();
            resolve({ ok: false, error: 'ETIMEDOUT' });
        }, timeoutMs);
        socket.on('connect', () => {
            clearTimeout(timer);
            socket.destroy();
            resolve({ ok: true });
        });
        socket.on('error', (err) => {
            clearTimeout(timer);
            resolve({ ok: false, error: err.code || err.message });
        });
    });
}

async function main() {
    console.log('=== ClassMind MongoDB Diagnostics ===\n');

    const publicIp = await fetchPublicIp();
    if (publicIp) {
        console.log('Your public IP (whitelist THIS in Atlas Network Access):');
        console.log('  →', publicIp);
        console.log('');
    }

    console.log('1) DNS lookup for', HOST);
    try {
        const records = await dns.resolveSrv(`_mongodb._tcp.${HOST}`);
        console.log('   OK —', records.length, 'SRV record(s)');
        records.slice(0, 2).forEach((r) => console.log('   ', r.name + ':' + r.port));
    } catch (e) {
        console.log('   FAIL —', e.message);
    }

    console.log('\n2) TCP connect to Atlas shard port 27017');
    const tcp = await testTcp(SHARD_HOST, PORT);
    if (tcp.ok) {
        console.log('   OK — port 27017 is reachable');
    } else {
        console.log('   FAIL —', tcp.error);
        console.log('   → Atlas Network Access must allow your IP:', publicIp || '(check whatismyip.com)');
        console.log('   → Or firewall/antivirus is blocking outbound port 27017');
        console.log('   → Try: mobile hotspot, disable VPN, allow Node.js in Windows Firewall');
    }

    console.log('\n3) Mongoose connect (database: test)');
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.log('   SKIP — MONGO_URI not set in .env');
        process.exit(1);
    }
    try {
        await mongoose.connect(uri, {
            family: 4,
            tlsAllowInvalidCertificates: true,
            serverSelectionTimeoutMS: 20000,
        });
        console.log('   OK — connected to database:', mongoose.connection.name);
        const cols = await mongoose.connection.db.listCollections().toArray();
        console.log('   Collections:', cols.map((c) => c.name).join(', ') || '(none)');
        await mongoose.disconnect();
        process.exit(0);
    } catch (e) {
        console.log('   FAIL —', e.message);
        console.log('\n=== Fix in MongoDB Atlas ===');
        console.log('1. https://cloud.mongodb.com → Network Access → Add IP Address');
        console.log('2. Add:', publicIp || 'your current IP', 'OR Allow Access from Anywhere (0.0.0.0/0)');
        console.log('3. Clusters → Resume if Paused');
        console.log('4. Wait 2 min → npm run dev');
        process.exit(1);
    }
}

main();
