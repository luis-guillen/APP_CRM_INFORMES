'use strict';

const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const { getDb }              = require('../database/db');
const { authenticate }       = require('../middleware/auth');
const { sharingActionLimiter } = require('../middleware/rateLimit');
const PDFGenerator           = require('../services/pdfGenerator');
const { canAccessCliente, canAccessReunion, getClienteById, getReunionById } = require('../services/objectAccess');
const CompartirRepository    = require('../repositories/CompartirRepository');

router.use(authenticate);

// ----------------------------------------------------------------
// PERFIL
// ----------------------------------------------------------------

router.get('/mi-perfil', async (req, res) => {
    try {
        const db   = await getDb();
        const repo = new CompartirRepository(db);
        res.json(repo.getUsuarioById(req.user.id));
    } catch (err) {
        console.error('Error al obtener perfil:', err);
        res.status(500).json({ error: 'Error al obtener perfil' });
    }
});

router.put('/mi-perfil', async (req, res) => {
    try {
        const db   = await getDb();
        const repo = new CompartirRepository(db);
        const user = repo.updatePerfil(req.user.id, req.body);
        res.json(user);
    } catch (err) {
        if (err.message === 'USERNAME_TAKEN') return res.status(400).json({ error: 'Ese nombre de usuario ya está en uso' });
        if (err.message === 'USERNAME_TOO_SHORT') return res.status(400).json({ error: 'El nombre de usuario debe tener al menos 3 caracteres' });
        console.error('Error al actualizar perfil:', err);
        res.status(500).json({ error: 'Error al actualizar perfil' });
    }
});

// ----------------------------------------------------------------
// PERFILES PÚBLICOS Y BÚSQUEDA
// ----------------------------------------------------------------

router.get('/perfil/:username', async (req, res) => {
    try {
        const db   = await getDb();
        const repo = new CompartirRepository(db);
        const user = repo.getUsuarioByUsername(req.params.username);

        if (!user)                                    return res.status(404).json({ error: 'Usuario no encontrado' });
        if (!user.perfil_publico && user.id !== req.user.id) return res.status(403).json({ error: 'Este perfil es privado' });

        const { clientes, reuniones } = repo.getPerfilPublico(user.id);
        res.json({ id: user.id, nombre: user.nombre, username: user.username, clientes, reuniones });
    } catch (err) {
        console.error('Error al obtener perfil:', err);
        res.status(500).json({ error: 'Error al obtener perfil público' });
    }
});

router.get('/buscar/:query', async (req, res) => {
    try {
        const db   = await getDb();
        const repo = new CompartirRepository(db);
        res.json(repo.buscarUsuarios(req.params.query, req.user.id));
    } catch (err) {
        console.error('Error al buscar usuarios:', err);
        res.status(500).json({ error: 'Error al buscar usuarios' });
    }
});

// ----------------------------------------------------------------
// COMPARTIR
// ----------------------------------------------------------------

router.post('/', sharingActionLimiter, async (req, res) => {
    try {
        const { tipo, recurso_id, username_destino } = req.body;
        if (!tipo || !recurso_id || !username_destino)
            return res.status(400).json({ error: 'Faltan datos: tipo, recurso_id, username_destino' });
        if (!['cliente', 'reunion'].includes(tipo))
            return res.status(400).json({ error: 'Tipo debe ser "cliente" o "reunion"' });

        const db   = await getDb();
        const repo = new CompartirRepository(db);

        const destino = repo.getUsuarioByUsername(username_destino);
        if (!destino)                  return res.status(404).json({ error: 'Usuario no encontrado' });
        if (destino.id === req.user.id) return res.status(400).json({ error: 'No puedes compartir contigo mismo' });

        // ACL: verificar que el recurso existe y el usuario tiene acceso
        if (tipo === 'cliente') {
            const cliente = getClienteById(db, recurso_id);
            if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
            if (!canAccessCliente(db, req.user, cliente, { action: 'share' }))
                return res.status(403).json({ error: 'No tienes permiso para compartir este cliente' });
        } else {
            const reunion = getReunionById(db, recurso_id);
            if (!reunion) return res.status(404).json({ error: 'Reunión no encontrada' });
            if (!canAccessReunion(db, req.user, reunion, { action: 'share' }))
                return res.status(403).json({ error: 'No tienes permiso para compartir esta reunión' });
        }

        if (repo.yaCompartido(tipo, recurso_id, destino.id))
            return res.status(400).json({ error: 'Ya está compartido con este usuario' });

        repo.compartir(tipo, recurso_id, req.user.id, destino.id);
        res.status(201).json({ message: `${tipo === 'cliente' ? 'Cliente' : 'Reunión'} compartido con @${username_destino}` });
    } catch (err) {
        console.error('Error al compartir:', err);
        res.status(500).json({ error: 'Error al compartir' });
    }
});

router.get('/recibidos', async (req, res) => {
    try {
        const db   = await getDb();
        const repo = new CompartirRepository(db);
        res.json(repo.getRecibidos(req.user.id));
    } catch (err) {
        console.error('Error al obtener compartidos:', err);
        res.status(500).json({ error: 'Error al obtener compartidos' });
    }
});

router.delete('/:id', sharingActionLimiter, async (req, res) => {
    try {
        const db   = await getDb();
        const repo = new CompartirRepository(db);
        const comp = repo.getById(req.params.id);
        if (!comp) return res.status(404).json({ error: 'Compartido no encontrado' });
        if (comp.compartido_por !== req.user.id && comp.compartido_con !== req.user.id)
            return res.status(403).json({ error: 'No tienes permiso' });

        repo.eliminarCompartido(comp.id);
        res.json({ message: 'Compartido eliminado' });
    } catch (err) {
        console.error('Error al eliminar compartido:', err);
        res.status(500).json({ error: 'Error al eliminar compartido' });
    }
});

// ----------------------------------------------------------------
// PDF PÚBLICO
// ----------------------------------------------------------------

router.get('/perfil/:username/reunion/:id/pdf', async (req, res) => {
    try {
        const db   = await getDb();
        const repo = new CompartirRepository(db);

        const user = repo.getUsuarioByUsername(req.params.username);
        if (!user || !user.perfil_publico) return res.status(403).json({ error: 'Perfil no disponible' });

        const data = repo.getReunionPublicaConDetalles(req.params.id, user.id);
        if (!data) return res.status(404).json({ error: 'Reunión no encontrada o no es pública' });

        const reportsDir = path.join(__dirname, '../../reports');
        if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

        const filename   = `Informe_${data.codigo_referencia}_${user.username}.pdf`;
        const outputPath = path.join(reportsDir, filename);
        const baseUrl    = `${req.protocol}://${req.get('host')}`;

        const generator = new PDFGenerator();
        await generator.generate(data, outputPath, baseUrl);
        res.download(outputPath, filename);
    } catch (err) {
        console.error('Error al generar PDF público:', err);
        res.status(500).json({ error: 'Error al generar el informe PDF' });
    }
});

// ----------------------------------------------------------------
// FAVORITOS
// ----------------------------------------------------------------

router.post('/favorito', async (req, res) => {
    try {
        const { tipo, recurso_id } = req.body;
        if (!tipo || !recurso_id || !['cliente', 'reunion'].includes(tipo))
            return res.status(400).json({ error: 'tipo y recurso_id requeridos' });

        const db      = await getDb();
        const repo    = new CompartirRepository(db);
        const recurso = repo.getRecursoPublico(tipo, recurso_id);

        if (!recurso)               return res.status(404).json({ error: 'Recurso no encontrado' });
        if (!recurso.publico)       return res.status(403).json({ error: 'El recurso no es público' });
        if (recurso.creado_por === req.user.id) return res.status(400).json({ error: 'No puedes añadir tus propios items' });

        repo.addFavorito(req.user.id, tipo, recurso_id);
        res.json({ message: 'Añadido a favoritos' });
    } catch (err) {
        console.error('Error al añadir favorito:', err);
        res.status(500).json({ error: 'Error al añadir favorito' });
    }
});

router.delete('/favorito/:tipo/:recursoId', async (req, res) => {
    try {
        const db   = await getDb();
        const repo = new CompartirRepository(db);
        repo.removeFavorito(req.user.id, req.params.tipo, req.params.recursoId);
        res.json({ message: 'Eliminado de favoritos' });
    } catch (err) {
        console.error('Error al eliminar favorito:', err);
        res.status(500).json({ error: 'Error al eliminar favorito' });
    }
});

module.exports = router;
