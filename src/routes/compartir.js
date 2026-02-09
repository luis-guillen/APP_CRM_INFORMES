const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getDb } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const PDFGenerator = require('../services/pdfGenerator');

router.use(authenticate);

// ================================
// Perfil del usuario
// ================================

// GET /api/compartir/mi-perfil - Obtener mi perfil
router.get('/mi-perfil', async (req, res) => {
    try {
        const db = await getDb();
        const user = db.prepare('SELECT id, nombre, email, username, perfil_publico FROM usuarios WHERE id = ?').get(req.user.id);
        res.json(user);
    } catch (error) {
        console.error('Error al obtener perfil:', error);
        res.status(500).json({ error: 'Error al obtener perfil' });
    }
});

// PUT /api/compartir/mi-perfil - Actualizar perfil (username, público/privado)
router.put('/mi-perfil', async (req, res) => {
    try {
        const { username, perfil_publico } = req.body;
        const db = await getDb();

        if (username !== undefined) {
            // Validar formato username
            const clean = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
            if (clean.length < 3) {
                return res.status(400).json({ error: 'El nombre de usuario debe tener al menos 3 caracteres' });
            }
            // Verificar que no exista
            const exists = db.prepare('SELECT id FROM usuarios WHERE username = ? AND id != ?').get(clean, req.user.id);
            if (exists) {
                return res.status(400).json({ error: 'Ese nombre de usuario ya está en uso' });
            }
            db.prepare('UPDATE usuarios SET username = ? WHERE id = ?').run(clean, req.user.id);
        }

        if (perfil_publico !== undefined) {
            db.prepare('UPDATE usuarios SET perfil_publico = ? WHERE id = ?').run(perfil_publico ? 1 : 0, req.user.id);
        }

        db.save();
        const user = db.prepare('SELECT id, nombre, email, username, perfil_publico FROM usuarios WHERE id = ?').get(req.user.id);
        res.json(user);
    } catch (error) {
        console.error('Error al actualizar perfil:', error);
        res.status(500).json({ error: 'Error al actualizar perfil' });
    }
});

// ================================
// Ver perfiles públicos
// ================================

// GET /api/compartir/perfil/:username - Ver perfil público
router.get('/perfil/:username', async (req, res) => {
    try {
        const db = await getDb();
        const username = req.params.username.toLowerCase();

        const user = db.prepare('SELECT id, nombre, username, perfil_publico FROM usuarios WHERE username = ?').get(username);

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        if (!user.perfil_publico && user.id !== req.user.id) {
            return res.status(403).json({ error: 'Este perfil es privado' });
        }

        // Obtener clientes públicos del usuario
        const clientes = db.prepare(`
            SELECT id, empresa, persona_contacto, ubicacion, actividad_principal
            FROM clientes WHERE creado_por = ? AND publico = 1
            ORDER BY empresa ASC
        `).all(user.id);

        // Obtener reuniones públicas del usuario
        const reuniones = db.prepare(`
            SELECT r.id, r.codigo_referencia, r.fecha_hora, r.lugar, r.motivo, c.empresa as cliente_empresa
            FROM reuniones r
            JOIN clientes c ON r.cliente_id = c.id
            WHERE r.creado_por = ? AND r.publico = 1
            ORDER BY r.fecha_hora DESC
        `).all(user.id);

        res.json({
            id: user.id,
            nombre: user.nombre,
            username: user.username,
            clientes,
            reuniones
        });
    } catch (error) {
        console.error('Error al obtener perfil:', error);
        res.status(500).json({ error: 'Error al obtener perfil público' });
    }
});

// GET /api/compartir/buscar/:query - Buscar usuarios
router.get('/buscar/:query', async (req, res) => {
    try {
        const db = await getDb();
        const query = `%${req.params.query.toLowerCase()}%`;

        const users = db.prepare(`
            SELECT id, nombre, username, perfil_publico
            FROM usuarios
            WHERE (LOWER(username) LIKE ? OR LOWER(nombre) LIKE ?)
            AND id != ?
            AND activo = 1
            AND username IS NOT NULL
        `).all(query, query, req.user.id);

        res.json(users);
    } catch (error) {
        console.error('Error al buscar usuarios:', error);
        res.status(500).json({ error: 'Error al buscar usuarios' });
    }
});

// ================================
// Compartir contenido
// ================================

// POST /api/compartir - Compartir un cliente o reunión
router.post('/', async (req, res) => {
    try {
        const { tipo, recurso_id, username_destino } = req.body;
        const db = await getDb();

        if (!tipo || !recurso_id || !username_destino) {
            return res.status(400).json({ error: 'Faltan datos: tipo, recurso_id, username_destino' });
        }

        if (!['cliente', 'reunion'].includes(tipo)) {
            return res.status(400).json({ error: 'Tipo debe ser "cliente" o "reunion"' });
        }

        // Buscar usuario destino
        const destino = db.prepare('SELECT id FROM usuarios WHERE username = ?').get(username_destino.toLowerCase());
        if (!destino) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        if (destino.id === req.user.id) {
            return res.status(400).json({ error: 'No puedes compartir contigo mismo' });
        }

        // Verificar que el recurso existe y es del usuario
        if (tipo === 'cliente') {
            const cliente = db.prepare('SELECT id, creado_por FROM clientes WHERE id = ?').get(recurso_id);
            if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
        } else {
            const reunion = db.prepare('SELECT id, creado_por FROM reuniones WHERE id = ?').get(recurso_id);
            if (!reunion) return res.status(404).json({ error: 'Reunión no encontrada' });
        }

        // Verificar que no existe ya
        const exists = db.prepare(
            'SELECT id FROM compartidos WHERE tipo = ? AND recurso_id = ? AND compartido_con = ?'
        ).get(tipo, recurso_id, destino.id);

        if (exists) {
            return res.status(400).json({ error: 'Ya está compartido con este usuario' });
        }

        db.prepare(`
            INSERT INTO compartidos (tipo, recurso_id, compartido_por, compartido_con)
            VALUES (?, ?, ?, ?)
        `).run(tipo, recurso_id, req.user.id, destino.id);

        db.save();
        res.status(201).json({ message: `${tipo === 'cliente' ? 'Cliente' : 'Reunión'} compartido con @${username_destino}` });
    } catch (error) {
        console.error('Error al compartir:', error);
        res.status(500).json({ error: 'Error al compartir' });
    }
});

// GET /api/compartir/recibidos - Ver lo que han compartido conmigo
router.get('/recibidos', async (req, res) => {
    try {
        const db = await getDb();

        const clientesCompartidos = db.prepare(`
            SELECT c.id, c.empresa, c.persona_contacto, c.ubicacion, c.actividad_principal,
                   u.nombre as compartido_por_nombre, u.username as compartido_por_username,
                   comp.id as compartido_id, comp.creado_en as compartido_en
            FROM compartidos comp
            JOIN clientes c ON comp.recurso_id = c.id AND comp.tipo = 'cliente'
            JOIN usuarios u ON comp.compartido_por = u.id
            WHERE comp.compartido_con = ?
            ORDER BY comp.creado_en DESC
        `).all(req.user.id);

        const reunionesCompartidas = db.prepare(`
            SELECT r.id, r.codigo_referencia, r.fecha_hora, r.lugar, r.motivo,
                   cl.empresa as cliente_empresa,
                   u.nombre as compartido_por_nombre, u.username as compartido_por_username,
                   comp.id as compartido_id, comp.creado_en as compartido_en
            FROM compartidos comp
            JOIN reuniones r ON comp.recurso_id = r.id AND comp.tipo = 'reunion'
            JOIN clientes cl ON r.cliente_id = cl.id
            JOIN usuarios u ON comp.compartido_por = u.id
            WHERE comp.compartido_con = ?
            ORDER BY comp.creado_en DESC
        `).all(req.user.id);

        res.json({
            clientes: clientesCompartidos,
            reuniones: reunionesCompartidas
        });
    } catch (error) {
        console.error('Error al obtener compartidos:', error);
        res.status(500).json({ error: 'Error al obtener compartidos' });
    }
});

// DELETE /api/compartir/:id - Dejar de compartir
router.delete('/:id', async (req, res) => {
    try {
        const db = await getDb();
        const id = parseInt(req.params.id);

        const comp = db.prepare('SELECT * FROM compartidos WHERE id = ?').get(id);
        if (!comp) {
            return res.status(404).json({ error: 'Compartido no encontrado' });
        }

        // Solo puede eliminar el que compartió o el que recibió
        if (comp.compartido_por !== req.user.id && comp.compartido_con !== req.user.id) {
            return res.status(403).json({ error: 'No tienes permiso' });
        }

        db.prepare('DELETE FROM compartidos WHERE id = ?').run(id);
        db.save();

        res.json({ message: 'Compartido eliminado' });
    } catch (error) {
        console.error('Error al eliminar compartido:', error);
        res.status(500).json({ error: 'Error al eliminar compartido' });
    }
});

// ================================
// Descargar PDF de reunión pública
// ================================

// GET /api/compartir/perfil/:username/reunion/:id/pdf - Descargar PDF de reunión pública
router.get('/perfil/:username/reunion/:id/pdf', async (req, res) => {
    try {
        const db = await getDb();
        const username = req.params.username.toLowerCase();
        const reunionId = parseInt(req.params.id);

        const user = db.prepare('SELECT id, perfil_publico FROM usuarios WHERE username = ?').get(username);
        if (!user || !user.perfil_publico) {
            return res.status(403).json({ error: 'Perfil no disponible' });
        }

        const reunion = db.prepare(`
            SELECT r.*, c.empresa as cliente_empresa
            FROM reuniones r
            JOIN clientes c ON r.cliente_id = c.id
            WHERE r.id = ? AND r.creado_por = ? AND r.publico = 1
        `).get(reunionId, user.id);

        if (!reunion) {
            return res.status(404).json({ error: 'Reunión no encontrada o no es pública' });
        }

        const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(reunion.cliente_id);
        const asistentes = db.prepare('SELECT * FROM asistentes WHERE reunion_id = ?').all(reunionId);
        const resumen_ejecutivo = db.prepare('SELECT * FROM resumenes_ejecutivos WHERE reunion_id = ?').get(reunionId);
        const necesidad_cliente = db.prepare('SELECT * FROM necesidades_cliente WHERE reunion_id = ?').get(reunionId);
        const situacion_actual = db.prepare('SELECT * FROM situacion_actual WHERE reunion_id = ?').get(reunionId);
        const anexos = db.prepare('SELECT * FROM anexos WHERE reunion_id = ?').all(reunionId);

        const data = {
            ...reunion,
            cliente,
            asistentes,
            resumen_ejecutivo,
            necesidad_cliente,
            situacion_actual,
            anexos
        };

        const reportsDir = path.join(__dirname, '../../reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        const filename = `Informe_${data.codigo_referencia}_${Date.now()}.pdf`;
        const outputPath = path.join(reportsDir, filename);

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const generator = new PDFGenerator();
        await generator.generate(data, outputPath, baseUrl);

        res.download(outputPath, filename);
    } catch (error) {
        console.error('Error al generar PDF público:', error);
        res.status(500).json({ error: 'Error al generar el informe PDF' });
    }
});

module.exports = router;
