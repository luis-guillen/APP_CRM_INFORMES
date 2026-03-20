const express = require('express');
const cors = require('cors');
const path = require('path');
const { applySecurityHeaders } = require('./middleware/securityHeaders');

function createApp(requireDb) {
    const app = express();
    const dbGuard = typeof requireDb === 'function' ? requireDb : (req, res, next) => next();

    app.disable('x-powered-by');
    app.set('trust proxy', 1);
    app.use(applySecurityHeaders);
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    app.get('/health', (req, res) => {
        res.status(200).send('OK');
    });

    app.use(express.static(path.join(__dirname, '../public')));

    // Bloquear acceso HTTP directo a archivos sensibles.
    app.use(['/uploads', '/reports'], (req, res) => {
        res.status(404).json({ error: 'Recurso no disponible' });
    });

    app.use('/api/auth', dbGuard, require('./routes/auth'));
    app.use('/api/clientes', dbGuard, require('./routes/clientes'));
    app.use('/api/reuniones', dbGuard, require('./routes/reuniones'));
    app.use('/api/usuarios', dbGuard, require('./routes/usuarios'));
    app.use('/api/informes', dbGuard, require('./routes/informes'));
    app.use('/api/compartir', dbGuard, require('./routes/compartir'));

    app.get('*', (req, res) => {
        if (req.path.startsWith('/api/')) {
            return res.status(404).json({ error: 'Endpoint no encontrado' });
        }
        res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    app.use((err, req, res, next) => {
        console.error('Error:', err);
        res.status(500).json({
            error: process.env.NODE_ENV === 'production'
                ? 'Error interno del servidor'
                : err.message
        });
    });

    return app;
}

module.exports = { createApp };
