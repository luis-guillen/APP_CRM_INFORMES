const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { getDb } = require('./database/db');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Archivos estáticos
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/reports', express.static(path.join(__dirname, '../reports')));

// Rutas API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/reuniones', require('./routes/reuniones'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/informes', require('./routes/informes'));

// Ruta fallback para SPA
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

// Iniciar servidor
async function start() {
    try {
        const db = await getDb();
        await initializeDatabase(db);

        app.listen(PORT, () => {
            console.log(`
╔═══════════════════════════════════════════════════╗
║  Reker Tech Solutions - Sistema de Reuniones      ║
║  Servidor iniciado en http://localhost:${PORT}      ║
╚═══════════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('❌ Error al iniciar el servidor:', error);
        process.exit(1);
    }
}

start();
