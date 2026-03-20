'use strict';

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb }                  = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadActionLimiter }    = require('../middleware/rateLimit');
const { validateUploadedFiles }  = require('../services/uploadValidation');
const { canAccessCliente, canAccessReunion, getClienteById, getReunionById } = require('../services/objectAccess');
const ReunionRepository          = require('../repositories/ReunionRepository');

// ----------------------------------------------------------------
// Multer config
// ----------------------------------------------------------------
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = file.fieldname === 'fotografias' ? 'fotografias' : 'documentos';
        const dir  = path.join(__dirname, '../../uploads', type);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const allowed = {
            documentos:  new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']),
            fotografias: new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']),
        };
        const set = allowed[file.fieldname];
        cb(set && set.has(ext) ? null : new Error(`Tipo de archivo no permitido: ${ext}`), set && set.has(ext));
    }
});

const uploadAnexosMiddleware = (req, res, next) => {
    upload.fields([{ name: 'documentos', maxCount: 50 }, { name: 'fotografias', maxCount: 50 }])(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message || 'Error al procesar adjuntos' });
        next();
    });
};

router.use(authenticate);

// ----------------------------------------------------------------
// Middleware de acceso a reunión (write)
// ----------------------------------------------------------------
async function requireWriteAccess(req, res, next) {
    try {
        const db      = await getDb();
        const reunion = getReunionById(db, req.params.id || req.params.reunionId);
        if (!reunion) return res.status(404).json({ error: 'Reunión no encontrada' });
        if (!canAccessReunion(db, req.user, reunion, { action: 'write' }))
            return res.status(403).json({ error: 'No tienes permisos sobre esta reunión' });
        req.db      = db;
        req.reunion = reunion;
        next();
    } catch (err) {
        console.error('Error validando permisos de reunión:', err);
        res.status(500).json({ error: 'Error validando permisos de reunión' });
    }
}

// ----------------------------------------------------------------
// GET /api/reuniones
// ----------------------------------------------------------------
router.get('/', async (req, res) => {
    try {
        const db   = await getDb();
        const repo = new ReunionRepository(db);
        res.json(repo.getAll(req.user));
    } catch (err) {
        console.error('Error al listar reuniones:', err);
        res.status(500).json({ error: 'Error al obtener reuniones' });
    }
});

// ----------------------------------------------------------------
// GET /api/reuniones/:id
// ----------------------------------------------------------------
router.get('/:id', async (req, res) => {
    try {
        const db     = await getDb();
        const repo   = new ReunionRepository(db);
        const reunion = repo.getById(req.params.id);

        if (!reunion) return res.status(404).json({ error: 'Reunión no encontrada' });
        if (!canAccessReunion(db, req.user, reunion, { action: 'read' }))
            return res.status(403).json({ error: 'No tienes acceso a esta reunión' });

        res.json(repo.getWithDetails(reunion.id));
    } catch (err) {
        console.error('Error al obtener reunión:', err);
        res.status(500).json({ error: 'Error al obtener reunión' });
    }
});

// ----------------------------------------------------------------
// POST /api/reuniones
// ----------------------------------------------------------------
router.post('/', authorize('admin', 'tecnico'), async (req, res) => {
    try {
        const { cliente_id, fecha_hora } = req.body;
        if (!cliente_id || !fecha_hora)
            return res.status(400).json({ error: 'Cliente y fecha/hora son requeridos' });

        const db     = await getDb();
        const cliente = getClienteById(db, cliente_id);
        if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
        if (!canAccessCliente(db, req.user, cliente, { action: 'write' }))
            return res.status(403).json({ error: 'No tienes permisos sobre este cliente' });

        const repo   = new ReunionRepository(db);
        const reunion = repo.create(req.body, req.user.id);
        res.status(201).json(reunion);
    } catch (err) {
        console.error('Error al crear reunión:', err);
        res.status(500).json({ error: 'Error al crear reunión' });
    }
});

// ----------------------------------------------------------------
// PUT /api/reuniones/:id
// ----------------------------------------------------------------
router.put('/:id', authorize('admin', 'tecnico'), requireWriteAccess, async (req, res) => {
    try {
        const repo    = new ReunionRepository(req.db);
        const updated = repo.update(req.reunion.id, req.body, req.reunion);
        res.json(updated);
    } catch (err) {
        console.error('Error al actualizar reunión:', err);
        res.status(500).json({ error: 'Error al actualizar reunión' });
    }
});

// ----------------------------------------------------------------
// DELETE /api/reuniones/:id
// ----------------------------------------------------------------
router.delete('/:id', authorize('admin'), async (req, res) => {
    try {
        const db     = await getDb();
        const repo   = new ReunionRepository(db);
        const reunion = repo.getById(req.params.id);
        if (!reunion) return res.status(404).json({ error: 'Reunión no encontrada' });

        repo.delete(reunion.id);
        res.json({ message: 'Reunión eliminada correctamente' });
    } catch (err) {
        console.error('Error al eliminar reunión:', err);
        res.status(500).json({ error: 'Error al eliminar reunión' });
    }
});

// ----------------------------------------------------------------
// POST /api/reuniones/:id/anexos
// ----------------------------------------------------------------
router.post('/:id/anexos', authorize('admin', 'tecnico'), uploadActionLimiter, requireWriteAccess, uploadAnexosMiddleware, async (req, res) => {
    try {
        const validation = validateUploadedFiles(req.files || {});
        if (!validation.valid) return res.status(400).json({ error: validation.reason });

        const repo    = new ReunionRepository(req.db);
        const inserted = repo.insertAnexos(req.reunion.id, req.files || {});
        res.json({ message: 'Anexos subidos correctamente', anexos: inserted });
    } catch (err) {
        console.error('Error al subir anexos:', err);
        res.status(500).json({ error: 'Error al subir anexos' });
    }
});

// ----------------------------------------------------------------
// POST /api/reuniones/:id/notas
// ----------------------------------------------------------------
router.post('/:id/notas', authorize('admin', 'tecnico'), requireWriteAccess, async (req, res) => {
    try {
        const { descripcion } = req.body;
        if (!descripcion) return res.status(400).json({ error: 'Descripción es requerida' });

        const repo = new ReunionRepository(req.db);
        const id   = repo.insertNota(req.reunion.id, descripcion);
        res.json({ id, message: 'Nota añadida correctamente' });
    } catch (err) {
        console.error('Error al añadir nota:', err);
        res.status(500).json({ error: 'Error al añadir nota' });
    }
});

// ----------------------------------------------------------------
// DELETE /api/reuniones/:reunionId/anexos/:anexoId
// ----------------------------------------------------------------
router.delete('/:reunionId/anexos/:anexoId', authorize('admin', 'tecnico'), requireWriteAccess, async (req, res) => {
    try {
        const repo  = new ReunionRepository(req.db);
        const anexo = repo.getAnexo(req.params.anexoId, req.reunion.id);
        if (!anexo) return res.status(404).json({ error: 'Anexo no encontrado' });

        repo.deleteAnexo(anexo);
        res.json({ message: 'Anexo eliminado correctamente' });
    } catch (err) {
        console.error('Error al eliminar anexo:', err);
        res.status(500).json({ error: 'Error al eliminar anexo' });
    }
});

// ----------------------------------------------------------------
// PUT /api/reuniones/:id/visibilidad
// ----------------------------------------------------------------
router.put('/:id/visibilidad', authorize('admin', 'tecnico'), requireWriteAccess, async (req, res) => {
    try {
        const repo    = new ReunionRepository(req.db);
        const publico = req.body.publico;
        repo.toggleVisibilidad(req.reunion.id, publico);
        res.json({ message: publico ? 'Reunión marcada como pública' : 'Reunión marcada como privada', publico: publico ? 1 : 0 });
    } catch (err) {
        console.error('Error al cambiar visibilidad:', err);
        res.status(500).json({ error: 'Error al cambiar visibilidad' });
    }
});

module.exports = router;
