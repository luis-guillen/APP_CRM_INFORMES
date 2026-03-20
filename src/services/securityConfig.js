const crypto = require('crypto');

const KNOWN_WEAK_JWT_SECRETS = new Set([
    'reker-tech-solutions-secret-key-2026',
    'changeme',
    'secret',
    'jwt-secret'
]);

function isWeakJwtSecret(secret) {
    if (!secret || typeof secret !== 'string') {
        return true;
    }
    if (secret.length < 32) {
        return true;
    }
    return KNOWN_WEAK_JWT_SECRETS.has(secret.toLowerCase());
}

function resolveJwtSecret({ env = process.env, nodeEnv = process.env.NODE_ENV, logger = console } = {}) {
    const configured = env.JWT_SECRET;
    if (configured && !isWeakJwtSecret(configured)) {
        return configured;
    }

    if (nodeEnv === 'production') {
        throw new Error('JWT_SECRET es obligatorio y debe tener al menos 32 caracteres seguros en producción');
    }

    const generated = crypto.randomBytes(48).toString('hex');
    logger.warn('[SECURITY] JWT_SECRET no definido/seguro. Se usa secreto efímero solo para desarrollo local.');
    return generated;
}

function resolveBootstrapAdminPassword({ env = process.env, nodeEnv = process.env.NODE_ENV, logger = console } = {}) {
    if (env.DEFAULT_ADMIN_PASSWORD && env.DEFAULT_ADMIN_PASSWORD.length >= 12) {
        return env.DEFAULT_ADMIN_PASSWORD;
    }

    if (nodeEnv === 'production') {
        throw new Error('DEFAULT_ADMIN_PASSWORD es obligatorio (>=12 caracteres) en producción');
    }

    const generated = crypto.randomBytes(18).toString('base64url');
    logger.warn('[SECURITY] DEFAULT_ADMIN_PASSWORD no definido. Se genera contraseña temporal de arranque.');
    return generated;
}

module.exports = {
    isWeakJwtSecret,
    resolveJwtSecret,
    resolveBootstrapAdminPassword
};
