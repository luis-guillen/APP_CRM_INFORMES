const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.use(authorize('admin'));

// GET /api/usuarios
router.get('/', async (req, res) => {
    try {
        const db = await getDb();
        const usuarios = db.prepare(`
            SELECT u.id, u.nombre, u.email, u.rol, u.cliente_id, u.activo, u.creado_en,
                   c.empresa as cliente_empresa
            FROM usuarios u
            LEFT JOIN clientes c ON u.cliente_id = c.id
            ORDER BY u.nombre ASC
        `).all();
        res.json(usuarios);
    } catch (error) {
        console.error('Error al listar usuarios:', error);
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

// GET /api/usuarios/:id
router.get('/:id', async (req, res) => {
    try {
        const db = await getDb();
        const usuario = db.prepare(`
            SELECT u.id, u.nombre, u.email, u.rol, u.cliente_id, u.activo, u.creado_en,
                   c.empresa as cliente_empresa
            FROM usuarios u
            LEFT JOIN clientes c ON u.cliente_id = c.id
            WHERE u.id = ?
        `).get(parseInt(req.params.id));

        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json(usuario);
    } catch (error) {
        console.error('Error al obtener usuario:', error);
        res.status(500).json({ error: 'Error al obtener usuario' });
    }
});

// POST /api/usuarios
router.post('/', async (req, res) => {
    try {
        const { nombre, email, password, rol, cliente_id } = req.body;

        if (!nombre || !email || !password) {
            return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        }

        const db = await getDb();
        const exists = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
        if (exists) {
            return res.status(400).json({ error: 'El email ya está registrado' });
        }

        if (rol === 'cliente' && cliente_id) {
            const clienteExists = db.prepare('SELECT id FROM clientes WHERE id = ?').get(parseInt(cliente_id));
            if (!clienteExists) {
                return res.status(400).json({ error: 'Cliente no encontrado' });
            }
        }

        const passwordHash = bcrypt.hashSync(password, 10);

        const result = db.prepare(`
            INSERT INTO usuarios (nombre, email, password_hash, rol, cliente_id)
            VALUES (?, ?, ?, ?, ?)
        `).run(nombre, email, passwordHash, rol || 'tecnico', rol === 'cliente' ? parseInt(cliente_id) : null);

        db.save();
        const usuario = db.prepare('SELECT id, nombre, email, rol, cliente_id, activo, creado_en FROM usuarios WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(usuario);
    } catch (error) {
        console.error('Error al crear usuario:', error);
        res.status(500).json({ error: 'Error al crear usuario' });
    }
});

// PUT /api/usuarios/:id
router.put('/:id', async (req, res) => {
    try {
        const { nombre, email, password, rol, cliente_id, activo } = req.body;
        const id = parseInt(req.params.id);

        const db = await getDb();
        const exists = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
        if (!exists) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        if (email) {
            const emailExists = db.prepare('SELECT id FROM usuarios WHERE email = ? AND id != ?').get(email, id);
            if (emailExists) {
                return res.status(400).json({ error: 'El email ya está en uso por otro usuario' });
            }
        }

        db.prepare(`
            UPDATE usuarios SET
                nombre = ?,
                email = ?,
                rol = ?,
                cliente_id = ?,
                activo = ?,
                actualizado_en = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            nombre || exists.nombre,
            email || exists.email,
            rol || exists.rol,
            rol === 'cliente' ? (cliente_id ? parseInt(cliente_id) : null) : null,
            activo !== undefined ? activo : exists.activo,
            id
        );

        if (password) {
            if (password.length < 6) {
                return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
            }
            const passwordHash = bcrypt.hashSync(password, 10);
            db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(passwordHash, id);
        }

        db.save();
        const usuario = db.prepare('SELECT id, nombre, email, rol, cliente_id, activo, creado_en FROM usuarios WHERE id = ?').get(id);
        res.json(usuario);
    } catch (error) {
        console.error('Error al actualizar usuario:', error);
        res.status(500).json({ error: 'Error al actualizar usuario' });
    }
});

// DELETE /api/usuarios/:id
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (id === req.user.id) {
            return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
        }

        const db = await getDb();
        const exists = db.prepare('SELECT id FROM usuarios WHERE id = ?').get(id);
        if (!exists) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
        db.save();
        res.json({ message: 'Usuario eliminado correctamente' });
    } catch (error) {
        console.error('Error al eliminar usuario:', error);
        res.status(500).json({ error: 'Error al eliminar usuario' });
    }
});

module.exports = router;
