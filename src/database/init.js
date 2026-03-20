const { getDb } = require('./db');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { resolveBootstrapAdminPassword } = require('../services/securityConfig');

async function init() {
    console.log('🔧 Inicializando base de datos Reker Tech Solutions...\n');
    const db = await getDb();
    await initializeDatabase(db);
    console.log('✅ Base de datos lista.');
}

async function initializeDatabase(db) {
    // Leer y ejecutar el esquema SQL
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Ejecutar cada statement del esquema
    const statements = schema.split(';').filter(s => s.trim());
    for (const statement of statements) {
        if (statement.trim()) {
            try {
                db.exec(statement);
            } catch (e) {
                if (!e.message.includes('already exists')) {
                    console.error('Error ejecutando:', statement.substring(0, 50), e.message);
                }
            }
        }
    }

    // Migraciones para bases de datos existentes
    const migrations = [
        "ALTER TABLE usuarios ADD COLUMN username TEXT UNIQUE",
        "ALTER TABLE usuarios ADD COLUMN perfil_publico INTEGER DEFAULT 0",
        "ALTER TABLE clientes ADD COLUMN creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL"
    ];
    for (const migration of migrations) {
        try { db.exec(migration); } catch (e) { /* columna ya existe */ }
    }

    // Crear usuario administrador por defecto si no existe
    const adminExists = db.prepare('SELECT id FROM usuarios WHERE email = ?').get('admin@reker.es');

    if (!adminExists) {
        const adminPassword = resolveBootstrapAdminPassword({
            env: process.env,
            nodeEnv: process.env.NODE_ENV,
            logger: console
        });
        const passwordHash = bcrypt.hashSync(adminPassword, 10);
        db.prepare(`
            INSERT INTO usuarios (nombre, email, password_hash, rol)
            VALUES (?, ?, ?, ?)
        `).run('Administrador', 'admin@reker.es', passwordHash, 'admin');

        console.log('👤 Usuario administrador creado:');
        console.log('   Email: admin@reker.es');
        if (process.env.NODE_ENV !== 'production') {
            console.log(`   Contraseña temporal: ${adminPassword}`);
            console.log('   ⚠️  Cambia la contraseña después del primer login\n');
        }
    } else {
        console.log('👤 Usuario administrador ya existe\n');
    }

    // Crear directorios necesarios
    const dirs = [
        path.join(__dirname, '../../uploads'),
        path.join(__dirname, '../../uploads/documentos'),
        path.join(__dirname, '../../uploads/fotografias'),
        path.join(__dirname, '../../reports')
    ];

    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`📁 Directorio creado: ${path.basename(dir)}`);
        }
    }

    // Guardar la base de datos
    db.save();

    console.log('\n✨ Base de datos inicializada correctamente');
}

// Permitir ejecución directa como script
if (require.main === module) {
    init().catch(console.error);
}

module.exports = { initializeDatabase };
