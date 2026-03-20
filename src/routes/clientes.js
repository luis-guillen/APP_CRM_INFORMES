'use strict';

const express = require('express');
const router  = express.Router();
const { getDb }           = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');
const { canAccessCliente, canAccessReunion, getClienteById } = require('../services/objectAccess');
const ClienteRepository   = require('../repositories/ClienteRepository');

router.use(authenticate);

// ----------------------------------------------------------------
// GET /api/clientes
// ----------------------------------------------------------------
router.get('/', async (req, res) => {
    try {
        const db   = await getDb();
        const repo = new ClienteRepository(db);
        res.json(repo.getAll(req.user));
    } catch (err) {
        console.error('Error al listar clientes:', err);
        res.status(500).json({ error: 'Error al obtener clientes' });
    }
});

// ----------------------------------------------------------------
// GET /api/clientes/:id
// ----------------------------------------------------------------
router.get('/:id', async (req, res) => {
    try {
        const db   = await getDb();
        const repo = new ClienteRepository(db);
        const cliente = repo.getById(req.params.id);

        if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
        if (!canAccessCliente(db, req.user, cliente, { action: 'read' }))
            return res.status(403).json({ error: 'No tienes acceso a este cliente' });

        res.json(repo.getWithContactos(cliente.id));
    } catch (err) {
        console.error('Error al obtener cliente:', err);
        res.status(500).json({ error: 'Error al obtener cliente' });
    }
});

// ----------------------------------------------------------------
// POST /api/clientes
// ----------------------------------------------------------------
router.post('/', authorize('admin', 'tecnico'), async (req, res) => {
    try {
        const { empresa, persona_contacto } = req.body;
        if (!empresa || !persona_contacto)
            return res.status(400).json({ error: 'Empresa y persona de contacto son requeridos' });

        const db   = await getDb();
        const repo = new ClienteRepository(db);
        const cliente = repo.create(req.body, req.user.id);
        res.status(201).json(cliente);
    } catch (err) {
        console.error('Error al crear cliente:', err);
        res.status(500).json({ error: 'Error al crear cliente' });
    }
});

// ----------------------------------------------------------------
// PUT /api/clientes/:id
// ----------------------------------------------------------------
router.put('/:id', authorize('admin'), async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const db   = await getDb();
        const repo = new ClienteRepository(db);
        const current = repo.getById(id);
        if (!current) return res.status(404).json({ error: 'Cliente no encontrado' });

        const cliente = repo.update(id, req.body, current);
        res.json(cliente);
    } catch (err) {
        console.error('Error al actualizar cliente:', err);
        res.status(500).json({ error: 'Error al actualizar cliente' });
    }
});

// ----------------------------------------------------------------
// DELETE /api/clientes/:id
// ----------------------------------------------------------------
router.delete('/:id', authorize('admin'), async (req, res) => {
    try {
        const db   = await getDb();
        const repo = new ClienteRepository(db);
        const cliente = repo.getById(req.params.id);
        if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

        repo.delete(cliente.id);
        res.json({ message: 'Cliente eliminado correctamente' });
    } catch (err) {
        console.error('Error al eliminar cliente:', err);
        res.status(500).json({ error: 'Error al eliminar cliente' });
    }
});

// ----------------------------------------------------------------
// GET /api/clientes/:id/reuniones
// ----------------------------------------------------------------
router.get('/:id/reuniones', async (req, res) => {
    try {
        const db      = await getDb();
        const repo    = new ClienteRepository(db);
        const cliente = repo.getById(req.params.id);

        if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
        if (!canAccessCliente(db, req.user, cliente, { action: 'read' }))
            return res.status(403).json({ error: 'No tienes acceso a este cliente' });

        res.json(repo.getReuniones(cliente.id));
    } catch (err) {
        console.error('Error al obtener reuniones del cliente:', err);
        res.status(500).json({ error: 'Error al obtener reuniones' });
    }
});

// ----------------------------------------------------------------
// PUT /api/clientes/:id/visibilidad
// ----------------------------------------------------------------
router.put('/:id/visibilidad', authorize('admin', 'tecnico'), async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const db   = await getDb();
        const repo = new ClienteRepository(db);
        const cliente = repo.getById(id);

        if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
        if (!canAccessCliente(db, req.user, cliente, { action: 'write' }))
            return res.status(403).json({ error: 'No tienes permisos sobre este cliente' });

        const publico = req.body.publico;
        repo.toggleVisibilidad(id, publico);
        res.json({ message: publico ? 'Cliente marcado como público' : 'Cliente marcado como privado', publico: publico ? 1 : 0 });
    } catch (err) {
        console.error('Error al cambiar visibilidad:', err);
        res.status(500).json({ error: 'Error al cambiar visibilidad' });
    }
});

module.exports = router;
