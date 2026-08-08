const crypto = require('crypto');

const SESSION_SECRET = process.env.SESSION_SECRET || 'classmind-dev-session-secret-change-in-production';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function createSessionToken(user) {
    const payload = {
        email: user.email,
        role: user.role,
        id: user.id,
        exp: Date.now() + TOKEN_TTL_MS,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
    return `${body}.${sig}`;
}

function verifySessionToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
    if (sig !== expected) return null;
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (!payload.exp || Date.now() > payload.exp) return null;
        if (!payload.email || !payload.role) return null;
        return payload;
    } catch {
        return null;
    }
}

module.exports = { createSessionToken, verifySessionToken, SESSION_SECRET };
