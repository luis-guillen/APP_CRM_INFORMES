const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');

// Configuración de multer para carga de archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = file.fieldname === 'fotografias' ? 'fotografias' : 'documentos';
        const dir = path.join(__dirname, '../../uploads', type);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|ppt|pptx/;
        const ext = path.extname(file.originalname).toLowerCase().slice(1);
        if (allowedTypes.test(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de archivo no permitido'));
        }
    }
});

router.use(authenticate);

// Generar código de referencia
async function generarCodigoReferencia() {
    const db = await getDb();
    const year = new Date().getFullYear();
    const count = db.prepare('SELECT COUNT(*) as total FROM reuniones WHERE codigo_referencia LIKE ?').get(`RT-${year}-%`);
    const num = ((count?.total || 0) + 1).toString().padStart(3, '0');
    return `RT-${year}-${num}`;
}

// GET /api/reuniones
router.get('/', async (req, res) => {
    try {
        const db = await getDb();
        let reuniones;

        if (req.user.rol === 'cliente' && req.user.cliente_id) {
            reuniones = db.prepare(`
                SELECT r.*, c.empresa as cliente_empresa, u.nombre as creado_por_nombre
                FROM reuniones r
                JOIN clientes c ON r.cliente_id = c.id
                LEFT JOIN usuarios u ON r.creado_por = u.id
                WHERE r.cliente_id = ?
                ORDER BY r.fecha_hora DESC
            `).all(req.user.cliente_id);
        } else {
            reuniones = db.prepare(`
                SELECT r.*, c.empresa as cliente_empresa, u.nombre as creado_por_nombre
                FROM reuniones r
                JOIN clientes c ON r.cliente_id = c.id
                LEFT JOIN usuarios u ON r.creado_por = u.id
                ORDER BY r.fecha_hora DESC
            `).all();
        }

        res.json(reuniones);
    } catch (error) {
        console.error('Error al listar reuniones:', error);
        res.status(500).json({ error: 'Error al obtener reuniones' });
    }
});

// GET /api/reuniones/:id
router.get('/:id', async (req, res) => {
    try {
        const db = await getDb();
        const id = parseInt(req.params.id);

        const reunion = db.prepare(`
            SELECT r.*, c.empresa as cliente_empresa
            FROM reuniones r
            JOIN clientes c ON r.cliente_id = c.id
            WHERE r.id = ?
        `).get(id);

        if (!reunion) {
            return res.status(404).json({ error: 'Reunión no encontrada' });
        }

        if (req.user.rol === 'cliente' && req.user.cliente_id !== reunion.cliente_id) {
            return res.status(403).json({ error: 'No tienes acceso a esta reunión' });
        }

        const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(reunion.cliente_id);
        const asistentes = db.prepare('SELECT * FROM asistentes WHERE reunion_id = ?').all(id);
        const resumen = db.prepare('SELECT * FROM resumenes_ejecutivos WHERE reunion_id = ?').get(id);
        const necesidades = db.prepare('SELECT * FROM necesidades_cliente WHERE reunion_id = ?').get(id);
        const situacion = db.prepare('SELECT * FROM situacion_actual WHERE reunion_id = ?').get(id);
        const anexos = db.prepare('SELECT * FROM anexos WHERE reunion_id = ?').all(id);

        res.json({
            ...reunion,
            cliente,
            asistentes,
            resumen_ejecutivo: resumen,
            necesidad_cliente: necesidades,
            situacion_actual: situacion,
            anexos
        });
    } catch (error) {
        console.error('Error al obtener reunión:', error);
        res.status(500).json({ error: 'Error al obtener reunión' });
    }
});

// POST /api/reuniones
router.post('/', authorize('admin', 'tecnico'), async (req, res) => {
    try {
        const {
            cliente_id,
            fecha_hora,
            lugar,
            motivo,
            autor_documento,
            asistentes,
            resumen_ejecutivo,
            necesidad_cliente,
            situacion_actual
        } = req.body;

        if (!cliente_id || !fecha_hora) {
            return res.status(400).json({ error: 'Cliente y fecha/hora son requeridos' });
        }

        const db = await getDb();
        const clienteExists = db.prepare('SELECT id FROM clientes WHERE id = ?').get(parseInt(cliente_id));
        if (!clienteExists) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const codigo_referencia = await generarCodigoReferencia();

        // Insertar reunión
        const result = db.prepare(`
            INSERT INTO reuniones (cliente_id, creado_por, codigo_referencia, fecha_hora, lugar, motivo, autor_documento)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(parseInt(cliente_id), req.user.id, codigo_referencia, fecha_hora, lugar || null, motivo || null, autor_documento || null);

        const reunionId = result.lastInsertRowid;

        // Insertar asistentes
        if (asistentes && asistentes.length > 0) {
            for (const a of asistentes) {
                if (a.nombre) {
                    db.prepare('INSERT INTO asistentes (reunion_id, nombre, cargo, tipo) VALUES (?, ?, ?, ?)').run(reunionId, a.nombre, a.cargo || null, a.tipo || 'cliente');
                }
            }
        }

        // Insertar resumen ejecutivo
        if (resumen_ejecutivo?.sintesis) {
            db.prepare('INSERT INTO resumenes_ejecutivos (reunion_id, sintesis) VALUES (?, ?)').run(reunionId, resumen_ejecutivo.sintesis);
        }

        // Insertar necesidades
        if (necesidad_cliente) {
            db.prepare('INSERT INTO necesidades_cliente (reunion_id, solicitud_explicita, objetivo_negocio) VALUES (?, ?, ?)').run(
                reunionId, necesidad_cliente.solicitud_explicita || null, necesidad_cliente.objetivo_negocio || null
            );
        }

        // Insertar situación actual
        if (situacion_actual) {
            db.prepare('INSERT INTO situacion_actual (reunion_id, proceso_actual, equipos_instalados, limitaciones_problemas) VALUES (?, ?, ?, ?)').run(
                reunionId, situacion_actual.proceso_actual || null, situacion_actual.equipos_instalados || null, situacion_actual.limitaciones_problemas || null
            );
        }

        db.save();
        const reunion = db.prepare('SELECT * FROM reuniones WHERE id = ?').get(reunionId);
        res.status(201).json(reunion);
    } catch (error) {
        console.error('Error al crear reunión:', error);
        res.status(500).json({ error: 'Error al crear reunión' });
    }
});

// PUT /api/reuniones/:id
router.put('/:id', authorize('admin', 'tecnico'), async (req, res) => {
    try {
        const {
            fecha_hora,
            lugar,
            motivo,
            autor_documento,
            asistentes,
            resumen_ejecutivo,
            necesidad_cliente,
            situacion_actual
        } = req.body;

        const id = parseInt(req.params.id);
        const db = await getDb();

        const exists = db.prepare('SELECT * FROM reuniones WHERE id = ?').get(id);
        if (!exists) {
            return res.status(404).json({ error: 'Reunión no encontrada' });
        }

        // Actualizar reunión principal
        db.prepare(`
            UPDATE reuniones SET
                fecha_hora = ?,
                lugar = ?,
                motivo = ?,
                autor_documento = ?,
                actualizado_en = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            fecha_hora || exists.fecha_hora,
            lugar !== undefined ? lugar : exists.lugar,
            motivo !== undefined ? motivo : exists.motivo,
            autor_documento !== undefined ? autor_documento : exists.autor_documento,
            id
        );

        // Actualizar asistentes
        if (asistentes) {
            db.prepare('DELETE FROM asistentes WHERE reunion_id = ?').run(id);
            for (const a of asistentes) {
                if (a.nombre) {
                    db.prepare('INSERT INTO asistentes (reunion_id, nombre, cargo, tipo) VALUES (?, ?, ?, ?)').run(id, a.nombre, a.cargo || null, a.tipo || 'cliente');
                }
            }
        }

        // Actualizar resumen
        if (resumen_ejecutivo) {
            const existsResumen = db.prepare('SELECT id FROM resumenes_ejecutivos WHERE reunion_id = ?').get(id);
            if (existsResumen) {
                db.prepare('UPDATE resumenes_ejecutivos SET sintesis = ? WHERE reunion_id = ?').run(resumen_ejecutivo.sintesis || null, id);
            } else {
                db.prepare('INSERT INTO resumenes_ejecutivos (reunion_id, sintesis) VALUES (?, ?)').run(id, resumen_ejecutivo.sintesis || null);
            }
        }

        // Actualizar necesidades
        if (necesidad_cliente) {
            const existsNec = db.prepare('SELECT id FROM necesidades_cliente WHERE reunion_id = ?').get(id);
            if (existsNec) {
                db.prepare('UPDATE necesidades_cliente SET solicitud_explicita = ?, objetivo_negocio = ? WHERE reunion_id = ?').run(
                    necesidad_cliente.solicitud_explicita || null, necesidad_cliente.objetivo_negocio || null, id
                );
            } else {
                db.prepare('INSERT INTO necesidades_cliente (reunion_id, solicitud_explicita, objetivo_negocio) VALUES (?, ?, ?)').run(
                    id, necesidad_cliente.solicitud_explicita || null, necesidad_cliente.objetivo_negocio || null
                );
            }
        }

        // Actualizar situación
        if (situacion_actual) {
            const existsSit = db.prepare('SELECT id FROM situacion_actual WHERE reunion_id = ?').get(id);
            if (existsSit) {
                db.prepare('UPDATE situacion_actual SET proceso_actual = ?, equipos_instalados = ?, limitaciones_problemas = ? WHERE reunion_id = ?').run(
                    situacion_actual.proceso_actual || null, situacion_actual.equipos_instalados || null, situacion_actual.limitaciones_problemas || null, id
                );
            } else {
                db.prepare('INSERT INTO situacion_actual (reunion_id, proceso_actual, equipos_instalados, limitaciones_problemas) VALUES (?, ?, ?, ?)').run(
                    id, situacion_actual.proceso_actual || null, situacion_actual.equipos_instalados || null, situacion_actual.limitaciones_problemas || null
                );
            }
        }

        db.save();
        const reunion = db.prepare('SELECT * FROM reuniones WHERE id = ?').get(id);
        res.json(reunion);
    } catch (error) {
        console.error('Error al actualizar reunión:', error);
        res.status(500).json({ error: 'Error al actualizar reunión' });
    }
});

// DELETE /api/reuniones/:id
router.delete('/:id', authorize('admin'), async (req, res) => {
    try {
        const db = await getDb();
        const id = parseInt(req.params.id);

        const exists = db.prepare('SELECT id FROM reuniones WHERE id = ?').get(id);
        if (!exists) {
            return res.status(404).json({ error: 'Reunión no encontrada' });
        }

        const anexos = db.prepare('SELECT ruta_archivo FROM anexos WHERE reunion_id = ?').all(id);
        for (const anexo of anexos) {
            if (anexo.ruta_archivo && fs.existsSync(anexo.ruta_archivo)) {
                fs.unlinkSync(anexo.ruta_archivo);
            }
        }

        db.prepare('DELETE FROM reuniones WHERE id = ?').run(id);
        db.save();
        res.json({ message: 'Reunión eliminada correctamente' });
    } catch (error) {
        console.error('Error al eliminar reunión:', error);
        res.status(500).json({ error: 'Error al eliminar reunión' });
    }
});

// POST /api/reuniones/:id/anexos
router.post('/:id/anexos', authorize('admin', 'tecnico'), upload.fields([
    { name: 'documentos', maxCount: 10 },
    { name: 'fotografias', maxCount: 20 }
]), async (req, res) => {
    try {
        const db = await getDb();
        const reunionId = parseInt(req.params.id);

        const exists = db.prepare('SELECT id FROM reuniones WHERE id = ?').get(reunionId);
        if (!exists) {
            return res.status(404).json({ error: 'Reunión no encontrada' });
        }

        const insertedAnexos = [];

        if (req.files?.documentos) {
            for (const file of req.files.documentos) {
                const result = db.prepare(`INSERT INTO anexos (reunion_id, tipo, nombre_archivo, ruta_archivo, descripcion) VALUES (?, ?, ?, ?, ?)`).run(reunionId, 'documento', file.originalname, file.path, req.body.descripcion || '');
                insertedAnexos.push({ id: result.lastInsertRowid, tipo: 'documento', nombre: file.originalname });
            }
        }

        if (req.files?.fotografias) {
            for (const file of req.files.fotografias) {
                const result = db.prepare(`INSERT INTO anexos (reunion_id, tipo, nombre_archivo, ruta_archivo, descripcion) VALUES (?, ?, ?, ?, ?)`).run(reunionId, 'fotografia', file.originalname, file.path, req.body.descripcion || '');
                insertedAnexos.push({ id: result.lastInsertRowid, tipo: 'fotografia', nombre: file.originalname });
            }
        }

        db.save();
        res.json({ message: 'Anexos subidos correctamente', anexos: insertedAnexos });
    } catch (error) {
        console.error('Error al subir anexos:', error);
        res.status(500).json({ error: 'Error al subir anexos' });
    }
});

// POST /api/reuniones/:id/notas
router.post('/:id/notas', authorize('admin', 'tecnico'), async (req, res) => {
    try {
        const { descripcion } = req.body;

        if (!descripcion) {
            return res.status(400).json({ error: 'Descripción es requerida' });
        }

        const db = await getDb();
        const id = parseInt(req.params.id);

        const exists = db.prepare('SELECT id FROM reuniones WHERE id = ?').get(id);
        if (!exists) {
            return res.status(404).json({ error: 'Reunión no encontrada' });
        }

        const result = db.prepare(`INSERT INTO anexos (reunion_id, tipo, descripcion) VALUES (?, 'nota', ?)`).run(id, descripcion);
        db.save();

        res.json({ id: result.lastInsertRowid, message: 'Nota añadida correctamente' });
    } catch (error) {
        console.error('Error al añadir nota:', error);
        res.status(500).json({ error: 'Error al añadir nota' });
    }
});

// DELETE /api/reuniones/:reunionId/anexos/:anexoId
router.delete('/:reunionId/anexos/:anexoId', authorize('admin', 'tecnico'), async (req, res) => {
    try {
        const db = await getDb();
        const anexo = db.prepare('SELECT * FROM anexos WHERE id = ? AND reunion_id = ?').get(parseInt(req.params.anexoId), parseInt(req.params.reunionId));

        if (!anexo) {
            return res.status(404).json({ error: 'Anexo no encontrado' });
        }

        if (anexo.ruta_archivo && fs.existsSync(anexo.ruta_archivo)) {
            fs.unlinkSync(anexo.ruta_archivo);
        }

        db.prepare('DELETE FROM anexos WHERE id = ?').run(parseInt(req.params.anexoId));
        db.save();
        res.json({ message: 'Anexo eliminado correctamente' });
    } catch (error) {
        console.error('Error al eliminar anexo:', error);
        res.status(500).json({ error: 'Error al eliminar anexo' });
    }
});

module.exports = router;
