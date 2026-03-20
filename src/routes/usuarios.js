'use strict';

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { getDb }                  = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');
const UsuarioRepository          = require('../repositories/UsuarioRepository');

router.use(authenticate);
router.use(authorize('admin'));

// ----------------------------------------------------------------
// GET /api/usuarios
// ----------------------------------------------------------------
router.get('/', async (req, res) => {
    try {
        const db   = await getDb();
        const repo = new UsuarioRepository(db);
        res.json(repo.getAll());
    } catch (err) {
        console.error('Error al listar usuarios:', err);
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

// ----------------------------------------------------------------
// GET /api/usuarios/:id
// ----------------------------------------------------------------
router.get('/:id', async (req, res) => {
    try {
        const db   = await getDb();
        const repo = new UsuarioRepository(db);
        const user = repo.getById(req.params.id);

        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json(user);
    } catch (err) {
        console.error('Error al obtener usuario:', err);
        res.status(500).json({ error: 'Error al obtener usuario' });
    }
});

// ----------------------------------------------------------------
// POST /api/usuarios
// ----------------------------------------------------------------
router.post('/', async (req, res) => {
    try {
        const { nombre, email, password, rol, cliente_id } = req.body;
        if (!nombre || !email || !password)
            return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
        if (password.length < 6)
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

        const db   = await getDb();
        const repo = new UsuarioRepository(db);

        const exists = repo.getByEmail(email);
        if (exists) return res.status(400).json({ error: 'El email ya está registrado' });

        if (rol === 'cliente' && cliente_id) {
            if (!repo.validarClienteId(cliente_id))
                return res.status(400).json({ error: 'Cliente no encontrado' });
        }

        const passwordHash = bcrypt.hashSync(password, 10);
        const user = repo.create({ nombre, email, passwordHash, rol, clienteId: cliente_id });

        res.status(201).json(user);
    } catch (err) {
        console.error('Error al crear usuario:', err);
        res.status(500).json({ error: 'Error al crear usuario' });
    }
});

// ----------------------------------------------------------------
// PUT /api/usuarios/:id
// ----------------------------------------------------------------
router.put('/:id', async (req, res) => {
    try {
        const { nombre, email, password, rol, cliente_id, activo } = req.body;
        const id   = parseInt(req.params.id, 10);
        const db   = await getDb();
        const repo = new UsuarioRepository(db);

        const current = repo.getById(id);
        if (!current) return res.status(404).json({ error: 'Usuario no encontrado' });

        if (email && email.toLowerCase() !== current.email.toLowerCase()) {
            if (repo.getByEmail(email))
                return res.status(400).json({ error: 'El email ya está en uso por otro usuario' });
        }

        const user = repo.update(id, { nombre, email, rol, clienteId: cliente_id, activo }, current);

        if (password) {
            if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
            repo.updatePassword(id, bcrypt.hashSync(password, 10));
        }

        res.json(user);
    } catch (err) {
        console.error('Error al actualizar usuario:', err);
        res.status(500).json({ error: 'Error al actualizar usuario' });
    }
});

// ----------------------------------------------------------------
// DELETE /api/usuarios/:id
// ----------------------------------------------------------------
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (id === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });

        const db   = await getDb();
        const repo = new UsuarioRepository(db);
        const user = repo.getById(id);
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        repo.delete(id);
        res.json({ message: 'Usuario eliminado correctamente' });
    } catch (err) {
        console.error('Error al eliminar usuario:', err);
        res.status(500).json({ error: 'Error al eliminar usuario' });
    }
});

module.exports = router;
