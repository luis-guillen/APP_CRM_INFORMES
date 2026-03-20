const MAX_BUCKETS = 5000;

function getClientKey(req) {
    const headers = req?.headers || {};
    const ip = req?.ip || headers['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown';
    return String(ip).split(',')[0].trim();
}

function createRateLimiter({ windowMs, max, keyPrefix = 'global', message = 'Demasiadas solicitudes. Inténtalo de nuevo más tarde.' }) {
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
        throw new Error('windowMs debe ser un número positivo');
    }
    if (!Number.isFinite(max) || max <= 0) {
        throw new Error('max debe ser un número positivo');
    }

    const buckets = new Map();

    return function rateLimiter(req, res, next) {
        const now = Date.now();
        const clientKey = `${keyPrefix}:${getClientKey(req)}`;
        const existing = buckets.get(clientKey);

        if (!existing || now >= existing.resetAt) {
            buckets.set(clientKey, { count: 1, resetAt: now + windowMs });
        } else {
            existing.count += 1;
        }

        const current = buckets.get(clientKey);
        const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
        const remaining = Math.max(0, max - current.count);

        if (typeof res.setHeader === 'function') {
            res.setHeader('X-RateLimit-Limit', String(max));
            res.setHeader('X-RateLimit-Remaining', String(remaining));
            res.setHeader('X-RateLimit-Reset', String(Math.floor(current.resetAt / 1000)));
        }

        if (current.count > max) {
            if (typeof res.setHeader === 'function') {
                res.setHeader('Retry-After', String(retryAfterSeconds));
            }
            return res.status(429).json({ error: message });
        }

        if (buckets.size > MAX_BUCKETS) {
            for (const [key, value] of buckets.entries()) {
                if (now >= value.resetAt) {
                    buckets.delete(key);
                }
            }
        }

        return next();
    };
}

const authLoginLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyPrefix: 'auth-login',
    message: 'Demasiados intentos de inicio de sesión. Espera unos minutos antes de reintentar.'
});

const authSensitiveLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    keyPrefix: 'auth-sensitive',
    message: 'Se alcanzó el límite de acciones sensibles de autenticación.'
});

const reportActionLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 30,
    keyPrefix: 'reports',
    message: 'Demasiadas acciones sobre informes. Inténtalo de nuevo más tarde.'
});

const uploadActionLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 20,
    keyPrefix: 'uploads',
    message: 'Demasiadas subidas de archivos. Inténtalo de nuevo más tarde.'
});

const sharingActionLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 40,
    keyPrefix: 'sharing',
    message: 'Demasiadas acciones de compartición. Inténtalo de nuevo más tarde.'
});

module.exports = {
    createRateLimiter,
    authLoginLimiter,
    authSensitiveLimiter,
    reportActionLimiter,
    uploadActionLimiter,
    sharingActionLimiter
};
