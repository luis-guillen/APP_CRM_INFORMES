const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { getDb } = require('./database/db');

const app = express();
const PORT = process.env.PORT || 5001;

// Estado de inicialización
let dbReady = false;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ruta de salud para Render (DEBE SER PRIMERA para evitar catch-all)
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Middleware para verificar que la BD está lista
const requireDb = (req, res, next) => {
    if (!dbReady) {
        return res.status(503).json({ error: 'Base de datos iniciándose, intente de nuevo en unos segundos' });
    }
    next();
};

// Archivos estáticos
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/reports', express.static(path.join(__dirname, '../reports')));

// Rutas API (todas requieren BD lista)
app.use('/api/auth', requireDb, require('./routes/auth'));
app.use('/api/clientes', requireDb, require('./routes/clientes'));
app.use('/api/reuniones', requireDb, require('./routes/reuniones'));
app.use('/api/usuarios', requireDb, require('./routes/usuarios'));
app.use('/api/informes', requireDb, require('./routes/informes'));

// Ruta fallback para SPA (DESPUÉS de /health y /api)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Manejo de errores
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Error interno del servidor'
            : err.message
    });
});

// Función para inicializar la base de datos con esquema y usuario admin
async function initializeDatabase(db) {
    console.log('🔧 Inicializando base de datos...');

    // Leer y ejecutar el esquema SQL
    const schemaPath = path.join(__dirname, 'database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    const statements = schema.split(';').filter(s => s.trim());
    for (const statement of statements) {
        if (statement.trim()) {
            try {
                db.exec(statement);
            } catch (e) {
                if (!e.message.includes('already exists')) {
                    console.error('Error ejecutando SQL:', e.message);
                }
            }
        }
    }

    // Crear usuario administrador por defecto si no existe
    const adminExists = db.prepare('SELECT id FROM usuarios WHERE email = ?').get('admin@reker.es');

    if (!adminExists) {
        const passwordHash = bcrypt.hashSync('admin123', 10);
        db.prepare(`
            INSERT INTO usuarios (nombre, email, password_hash, rol)
            VALUES (?, ?, ?, ?)
        `).run('Administrador', 'admin@reker.es', passwordHash, 'admin');
        console.log('👤 Usuario admin creado: admin@reker.es / admin123');
    }

    // Crear directorios necesarios
    const dirs = ['../uploads', '../uploads/documentos', '../uploads/fotografias', '../reports'];
    for (const dir of dirs) {
        const fullPath = path.join(__dirname, dir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
    }

    db.save();
    console.log('✅ Base de datos inicializada');
}

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

start();
