const { verifySessionToken } = require('../utils/sessionToken');

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'classmind-internal-dev-key';

function isInternalRequest(req) {
    return req.headers['x-internal-key'] === INTERNAL_API_KEY;
}

function requireAuth(req, res, next) {
    if (isInternalRequest(req)) {
        req.user = { role: 'internal', email: 'system@internal' };
        return next();
    }
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    const payload = verifySessionToken(auth.slice(7));
    if (!payload) {
        return res.status(401).json({ message: 'Invalid or expired session' });
    }
    req.user = payload;
    next();
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (req.user?.role === 'internal') return next();
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied' });
        }
        next();
    };
}

module.exports = { requireAuth, requireRole, isInternalRequest, INTERNAL_API_KEY };
