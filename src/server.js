const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { getDb } = require('./database/db');
const { createApp } = require('./app');
const { resolveBootstrapAdminPassword } = require('./services/securityConfig');

const PORT = process.env.PORT || 5001;

// Estado de inicialización
let dbReady = false;

// Middleware para verificar que la BD está lista
const requireDb = (req, res, next) => {
    if (!dbReady) {
        return res.status(503).json({ error: 'Base de datos iniciándose, intente de nuevo en unos segundos' });
    }
    next();
};

const app = createApp(requireDb);

const { initializeDatabase } = require('./database/init');

// Iniciar servidor PRIMERO, luego inicializar BD
async function start() {
    // 1. Iniciar servidor inmediatamente para que Render vea el puerto
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`
╔═══════════════════════════════════════════════════╗
║  Reker Tech Solutions - Sistema de Reuniones      ║
║  Servidor iniciado en http://0.0.0.0:${PORT}        ║
╚═══════════════════════════════════════════════════╝
        `);
    });

    // 2. Luego inicializar la base de datos en segundo plano
    try {
        console.log('📦 Cargando base de datos...');
        const db = await getDb();
        await initializeDatabase(db);
        dbReady = true;
        console.log('🚀 Sistema completamente listo');
    } catch (error) {
        console.error('❌ Error al inicializar la base de datos:', error);
        // No salir del proceso - el servidor sigue funcionando para health checks
    }
}

if (require.main === module) {
    start();
}

module.exports = {
    app,
    start,
    initializeDatabase
};
