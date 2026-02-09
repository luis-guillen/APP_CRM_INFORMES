const express = require('express');
const cors = require('cors');
const path = require('path');
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

// Iniciar servidor después de inicializar la base de datos
async function start() {
    try {
        // Inicializar la base de datos
        await getDb();
        console.log('✅ Base de datos conectada');

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
