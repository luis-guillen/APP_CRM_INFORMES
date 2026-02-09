const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getDb } = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');
const PDFGenerator = require('../services/pdfGenerator');
const DocxGenerator = require('../services/docxGenerator');

router.use(authenticate);

const reportsDir = path.join(__dirname, '../../reports');
if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
}

async function getReunionData(reunionId, userId, userRole, userClienteId) {
    const db = await getDb();

    const reunion = db.prepare(`
        SELECT r.*, c.empresa as cliente_empresa
        FROM reuniones r
        JOIN clientes c ON r.cliente_id = c.id
        WHERE r.id = ?
    `).get(parseInt(reunionId));

    if (!reunion) {
        return null;
    }

    if (userRole === 'cliente' && userClienteId !== reunion.cliente_id) {
        return { forbidden: true };
    }

    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(reunion.cliente_id);
    const asistentes = db.prepare('SELECT * FROM asistentes WHERE reunion_id = ?').all(parseInt(reunionId));
    const resumen_ejecutivo = db.prepare('SELECT * FROM resumenes_ejecutivos WHERE reunion_id = ?').get(parseInt(reunionId));
    const necesidad_cliente = db.prepare('SELECT * FROM necesidades_cliente WHERE reunion_id = ?').get(parseInt(reunionId));
    const situacion_actual = db.prepare('SELECT * FROM situacion_actual WHERE reunion_id = ?').get(parseInt(reunionId));
    const anexos = db.prepare('SELECT * FROM anexos WHERE reunion_id = ?').all(parseInt(reunionId));

    return {
        ...reunion,
        cliente,
        asistentes,
        resumen_ejecutivo,
        necesidad_cliente,
        situacion_actual,
        anexos
    };
}

// GET /api/informes/:reunionId/pdf
router.get('/:reunionId/pdf', async (req, res) => {
    try {
        const data = await getReunionData(req.params.reunionId, req.user.id, req.user.rol, req.user.cliente_id);

        if (!data) {
            return res.status(404).json({ error: 'Reunión no encontrada' });
        }

        if (data.forbidden) {
            return res.status(403).json({ error: 'No tienes acceso a esta reunión' });
        }

        const filename = `Informe_${data.codigo_referencia}_${Date.now()}.pdf`;
        const outputPath = path.join(reportsDir, filename);

        const generator = new PDFGenerator();
        await generator.generate(data, outputPath);

        res.download(outputPath, filename);
    } catch (error) {
        console.error('Error al generar PDF:', error);
        res.status(500).json({ error: 'Error al generar el informe PDF' });
    }
});

// GET /api/informes/:reunionId/docx
router.get('/:reunionId/docx', async (req, res) => {
    try {
        const data = await getReunionData(req.params.reunionId, req.user.id, req.user.rol, req.user.cliente_id);

        if (!data) {
            return res.status(404).json({ error: 'Reunión no encontrada' });
        }

        if (data.forbidden) {
            return res.status(403).json({ error: 'No tienes acceso a esta reunión' });
        }

        const filename = `Informe_${data.codigo_referencia}_${Date.now()}.docx`;
        const outputPath = path.join(reportsDir, filename);

        const generator = new DocxGenerator();
        await generator.generate(data, outputPath);

        res.download(outputPath, filename);
    } catch (error) {
        console.error('Error al generar DOCX:', error);
        res.status(500).json({ error: 'Error al generar el informe Word' });
    }
});

// GET /api/informes/:reunionId/preview
router.get('/:reunionId/preview', async (req, res) => {
    try {
        const data = await getReunionData(req.params.reunionId, req.user.id, req.user.rol, req.user.cliente_id);

        if (!data) {
            return res.status(404).json({ error: 'Reunión no encontrada' });
        }

        if (data.forbidden) {
            return res.status(403).json({ error: 'No tienes acceso a esta reunión' });
        }

        res.json(data);
    } catch (error) {
        console.error('Error al obtener preview:', error);
        res.status(500).json({ error: 'Error al obtener vista previa' });
    }
});

// GET /api/informes
router.get('/', (req, res) => {
    try {
        if (!fs.existsSync(reportsDir)) {
            return res.json([]);
        }

        const files = fs.readdirSync(reportsDir)
            .filter(f => f.endsWith('.pdf') || f.endsWith('.docx'))
            .map(f => {
                const stats = fs.statSync(path.join(reportsDir, f));
                return {
                    nombre: f,
                    tipo: f.endsWith('.pdf') ? 'PDF' : 'Word',
                    tamaño: stats.size,
                    fecha: stats.mtime
                };
            })
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        res.json(files);
    } catch (error) {
        console.error('Error al listar informes:', error);
        res.status(500).json({ error: 'Error al listar informes' });
    }
});

// DELETE /api/informes/:filename
router.delete('/:filename', authorize('admin'), (req, res) => {
    try {
        const filePath = path.join(reportsDir, req.params.filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Archivo no encontrado' });
        }

        fs.unlinkSync(filePath);
        res.json({ message: 'Informe eliminado correctamente' });
    } catch (error) {
        console.error('Error al eliminar informe:', error);
        res.status(500).json({ error: 'Error al eliminar informe' });
    }
});

module.exports = router;
