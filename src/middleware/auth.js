const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');
const { resolveJwtSecret } = require('../services/securityConfig');

const JWT_SECRET = resolveJwtSecret({
    env: process.env,
    nodeEnv: process.env.NODE_ENV,
    logger: console
});
const AUTH_COOKIE_NAME = 'auth_token';

function getTokenFromCookieHeader(cookieHeader) {
    if (!cookieHeader) {
        return null;
    }

    const pairs = cookieHeader.split(';');
    for (const pair of pairs) {
        const [rawName, ...rest] = pair.trim().split('=');
        if (rawName === AUTH_COOKIE_NAME) {
            return decodeURIComponent(rest.join('='));
        }
    }

    return null;
}

// Middleware de autenticación
async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    if (!token) {
        token = getTokenFromCookieHeader(req.headers.cookie);
    }

    if (!token) {
        return res.status(401).json({ error: 'Token de acceso requerido' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const db = await getDb();
        const user = db.prepare('SELECT id, nombre, email, rol, cliente_id FROM usuarios WHERE id = ? AND activo = 1').get(decoded.userId);

        if (!user) {
            return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
}

// Middleware de autorización por rol
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'No autenticado' });
        }

        if (!roles.includes(req.user.rol)) {
            return res.status(403).json({ error: 'No tienes permisos para esta acción' });
        }

        next();
    };
}

// Middleware para verificar acceso a cliente específico (para rol cliente)
function authorizeClientAccess(req, res, next) {
    if (req.user.rol === 'cliente') {
        const clienteId = parseInt(req.params.clienteId || req.body.cliente_id);
        if (clienteId && req.user.cliente_id !== clienteId) {
            return res.status(403).json({ error: 'No tienes acceso a este cliente' });
        }
    }
    next();
}

module.exports = {
    authenticate,
    authorize,
    authorizeClientAccess,
    JWT_SECRET,
    AUTH_COOKIE_NAME,
    getTokenFromCookieHeader
};
