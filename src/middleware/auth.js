const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'reker-tech-solutions-secret-key-2026';

// Middleware de autenticación
async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token de acceso requerido' });
    }

    const token = authHeader.split(' ')[1];

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
    JWT_SECRET
};
