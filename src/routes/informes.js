'use strict';

const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const { getDb }               = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');
const { reportActionLimiter }  = require('../middleware/rateLimit');
const PDFGenerator            = require('../services/pdfGenerator');
const DocxGenerator           = require('../services/docxGenerator');
const { canAccessReunion, getReunionByCodigo, extractCodigoReferenciaFromReportFilename } = require('../services/objectAccess');
const ReunionRepository       = require('../repositories/ReunionRepository');

router.use(authenticate);

const reportsDir = path.join(__dirname, '../../reports');
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

function resolveReportPath(filename) {
    const safeName = path.basename(filename || '');
    if (!safeName || safeName !== filename) return null;

    const resolved = path.resolve(reportsDir, safeName);
    const root     = path.resolve(reportsDir) + path.sep;
    if (!resolved.startsWith(root)) return null;

    return { safeName, filePath: resolved };
}

// ----------------------------------------------------------------
// GET /api/informes/download/:filename
// ----------------------------------------------------------------
router.get('/download/:filename', reportActionLimiter, async (req, res) => {
    try {
        const db       = await getDb();
        const resolved = resolveReportPath(req.params.filename);
        if (!resolved) return res.status(400).json({ error: 'Nombre de archivo inválido' });

        const codigo = extractCodigoReferenciaFromReportFilename(resolved.safeName);
        if (!codigo) return res.status(403).json({ error: 'No tienes acceso a este informe' });

        const reunion = getReunionByCodigo(db, codigo);
        if (!reunion) return res.status(404).json({ error: 'Reunión no encontrada para este informe' });

        if (!canAccessReunion(db, req.user, reunion, { action: 'read' }))
            return res.status(403).json({ error: 'No tienes acceso a este informe' });

        if (!fs.existsSync(resolved.filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });

        res.download(resolved.filePath, resolved.safeName);
    } catch (err) {
        console.error('Error al descargar informe:', err);
        res.status(500).json({ error: 'Error al descargar informe' });
    }
});

// ----------------------------------------------------------------
// GET /api/informes/:reunionId/pdf
// ----------------------------------------------------------------
router.get('/:reunionId/pdf', reportActionLimiter, async (req, res) => {
    try {
        const db     = await getDb();
        const repo   = new ReunionRepository(db);
        const data   = repo.getWithDetails(req.params.reunionId);

        if (!data) return res.status(404).json({ error: 'Reunión no encontrada' });
        if (!canAccessReunion(db, req.user, data, { action: 'read' }))
            return res.status(403).json({ error: 'No tienes acceso a esta reunión' });

        const filename   = `Informe_${data.codigo_referencia}.pdf`;
        const outputPath = path.join(reportsDir, filename);

        const generator = new PDFGenerator();
        await generator.generate(data, outputPath, `${req.protocol}://${req.get('host')}`);
        res.download(outputPath, filename);
    } catch (err) {
        console.error('Error al generar PDF:', err);
        res.status(500).json({ error: 'Error al generar el informe PDF' });
    }
});

// ----------------------------------------------------------------
// GET /api/informes/:reunionId/docx
// ----------------------------------------------------------------
router.get('/:reunionId/docx', reportActionLimiter, async (req, res) => {
    try {
        const db     = await getDb();
        const repo   = new ReunionRepository(db);
        const data   = repo.getWithDetails(req.params.reunionId);

        if (!data) return res.status(404).json({ error: 'Reunión no encontrada' });
        if (!canAccessReunion(db, req.user, data, { action: 'read' }))
            return res.status(403).json({ error: 'No tienes acceso a esta reunión' });

        const filename   = `Informe_${data.codigo_referencia}.docx`;
        const outputPath = path.join(reportsDir, filename);

        const generator = new DocxGenerator();
        await generator.generate(data, outputPath);
        res.download(outputPath, filename);
    } catch (err) {
        console.error('Error al generar Word:', err);
        res.status(500).json({ error: 'Error al generar el informe Word' });
    }
});

// ----------------------------------------------------------------
// GET /api/informes/:reunionId/preview
// ----------------------------------------------------------------
router.get('/:reunionId/preview', async (req, res) => {
    try {
        const db   = await getDb();
        const repo = new ReunionRepository(db);
        const data = repo.getWithDetails(req.params.reunionId);

        if (!data) return res.status(404).json({ error: 'Reunión no encontrada' });
        if (!canAccessReunion(db, req.user, data, { action: 'read' }))
            return res.status(403).json({ error: 'No tienes acceso a esta reunión' });

        res.json(data);
    } catch (err) {
        console.error('Error al obtener preview:', err);
        res.status(500).json({ error: 'Error al obtener vista previa' });
    }
});

// ----------------------------------------------------------------
// GET /api/informes
// ----------------------------------------------------------------
router.get('/', (req, res) => {
    try {
        if (!fs.existsSync(reportsDir)) return res.json([]);

        const files = fs.readdirSync(reportsDir)
            .filter(f => f.endsWith('.pdf') || f.endsWith('.docx'))
            .map(f => {
                const stats = fs.statSync(path.join(reportsDir, f));
                return { nombre: f, tipo: f.endsWith('.pdf') ? 'PDF' : 'Word', tamaño: stats.size, fecha: stats.mtime };
            })
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        res.json(files);
    } catch (err) {
        console.error('Error al listar informes:', err);
        res.status(500).json({ error: 'Error al listar informes' });
    }
});

// ----------------------------------------------------------------
// DELETE /api/informes/:filename
// ----------------------------------------------------------------
router.delete('/:filename', authorize('admin'), (req, res) => {
    try {
        const filePath = path.join(reportsDir, req.params.filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });

        fs.unlinkSync(filePath);
        res.json({ message: 'Informe eliminado correctamente' });
    } catch (err) {
        console.error('Error al eliminar informe:', err);
        res.status(500).json({ error: 'Error al eliminar informe' });
    }
});

module.exports = router;
module.exports.resolveReportPath = resolveReportPath; // Exportado para tests
