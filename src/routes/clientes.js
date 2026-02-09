const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');

// Aplicar autenticación a todas las rutas
router.use(authenticate);

// GET /api/clientes - Listar todos los clientes
router.get('/', async (req, res) => {
    try {
        const db = await getDb();
        // Si es cliente, solo ver su propia empresa
        if (req.user.rol === 'cliente' && req.user.cliente_id) {
            const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.user.cliente_id);
            return res.json([cliente].filter(Boolean));
        }

        const clientes = db.prepare('SELECT * FROM clientes ORDER BY empresa ASC').all();
        res.json(clientes);
    } catch (error) {
        console.error('Error al listar clientes:', error);
        res.status(500).json({ error: 'Error al obtener clientes' });
    }
});

// GET /api/clientes/:id - Obtener un cliente
router.get('/:id', async (req, res) => {
    try {
        const db = await getDb();
        const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(parseInt(req.params.id));

        if (!cliente) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        // Verificar acceso si es rol cliente
        if (req.user.rol === 'cliente' && req.user.cliente_id !== cliente.id) {
            return res.status(403).json({ error: 'No tienes acceso a este cliente' });
        }

        // Obtener contactos adicionales
        const contactos = db.prepare('SELECT * FROM contactos_cliente WHERE cliente_id = ?').all(cliente.id);
        cliente.contactos = contactos;

        res.json(cliente);
    } catch (error) {
        console.error('Error al obtener cliente:', error);
        res.status(500).json({ error: 'Error al obtener cliente' });
    }
});

// POST /api/clientes - Crear cliente (solo admin)
router.post('/', authorize('admin', 'tecnico'), async (req, res) => {
    try {
        const { empresa, cif, persona_contacto, cargo, telefono, email, ubicacion, actividad_principal, contactos } = req.body;

        if (!empresa || !persona_contacto) {
            return res.status(400).json({ error: 'Empresa y persona de contacto son requeridos' });
        }

        const db = await getDb();
        const result = db.prepare(`
            INSERT INTO clientes (empresa, cif, persona_contacto, cargo, telefono, email, ubicacion, actividad_principal, creado_por)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(empresa, cif || null, persona_contacto, cargo || null, telefono || null, email || null, ubicacion || null, actividad_principal || null, req.user.id);

        const clienteId = result.lastInsertRowid;

        // Insertar contactos adicionales si existen
        if (contactos && contactos.length > 0) {
            for (const c of contactos) {
                if (c.nombre) {
                    db.prepare(`
                        INSERT INTO contactos_cliente (cliente_id, nombre, cargo, telefono, email, es_principal)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `).run(clienteId, c.nombre, c.cargo || null, c.telefono || null, c.email || null, c.es_principal ? 1 : 0);
                }
            }
        }

        db.save();
        const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
        cliente.contactos = db.prepare('SELECT * FROM contactos_cliente WHERE cliente_id = ?').all(clienteId);
        res.status(201).json(cliente);
    } catch (error) {
        console.error('Error al crear cliente:', error);
        res.status(500).json({ error: 'Error al crear cliente' });
    }
});

// PUT /api/clientes/:id - Actualizar cliente (solo admin)
router.put('/:id', authorize('admin'), async (req, res) => {
    try {
        const { empresa, cif, persona_contacto, cargo, telefono, email, ubicacion, actividad_principal, contactos } = req.body;
        const id = parseInt(req.params.id);

        const db = await getDb();
        const exists = db.prepare('SELECT id FROM clientes WHERE id = ?').get(id);
        if (!exists) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const current = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);

        db.prepare(`
            UPDATE clientes SET
                empresa = ?,
                cif = ?,
                persona_contacto = ?,
                cargo = ?,
                telefono = ?,
                email = ?,
                ubicacion = ?,
                actividad_principal = ?,
                actualizado_en = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            empresa || current.empresa,
            cif !== undefined ? cif : current.cif,
            persona_contacto || current.persona_contacto,
            cargo !== undefined ? cargo : current.cargo,
            telefono !== undefined ? telefono : current.telefono,
            email !== undefined ? email : current.email,
            ubicacion !== undefined ? ubicacion : current.ubicacion,
            actividad_principal !== undefined ? actividad_principal : current.actividad_principal,
            id
        );

        // Actualizar contactos si se proporcionan
        if (contactos !== undefined) {
            db.prepare('DELETE FROM contactos_cliente WHERE cliente_id = ?').run(id);
            for (const c of contactos) {
                if (c.nombre) {
                    db.prepare(`
                        INSERT INTO contactos_cliente (cliente_id, nombre, cargo, telefono, email, es_principal)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `).run(id, c.nombre, c.cargo || null, c.telefono || null, c.email || null, c.es_principal ? 1 : 0);
                }
            }
        }

        db.save();
        const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
        cliente.contactos = db.prepare('SELECT * FROM contactos_cliente WHERE cliente_id = ?').all(id);
        res.json(cliente);
    } catch (error) {
        console.error('Error al actualizar cliente:', error);
        res.status(500).json({ error: 'Error al actualizar cliente' });
    }
});

// DELETE /api/clientes/:id - Eliminar cliente (solo admin)
router.delete('/:id', authorize('admin'), async (req, res) => {
    try {
        const db = await getDb();
        const exists = db.prepare('SELECT id FROM clientes WHERE id = ?').get(parseInt(req.params.id));
        if (!exists) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        db.prepare('DELETE FROM clientes WHERE id = ?').run(parseInt(req.params.id));
        db.save();
        res.json({ message: 'Cliente eliminado correctamente' });
    } catch (error) {
        console.error('Error al eliminar cliente:', error);
        res.status(500).json({ error: 'Error al eliminar cliente' });
    }
});

// GET /api/clientes/:id/reuniones - Obtener reuniones de un cliente
router.get('/:id/reuniones', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        // Verificar acceso si es rol cliente
        if (req.user.rol === 'cliente' && req.user.cliente_id !== id) {
            return res.status(403).json({ error: 'No tienes acceso a este cliente' });
        }

        const db = await getDb();
        const reuniones = db.prepare(`
            SELECT r.*, c.empresa as cliente_empresa
            FROM reuniones r
            JOIN clientes c ON r.cliente_id = c.id
            WHERE r.cliente_id = ?
            ORDER BY r.fecha_hora DESC
        `).all(id);

        res.json(reuniones);
    } catch (error) {
        console.error('Error al obtener reuniones del cliente:', error);
        res.status(500).json({ error: 'Error al obtener reuniones' });
    }
});

module.exports = router;
