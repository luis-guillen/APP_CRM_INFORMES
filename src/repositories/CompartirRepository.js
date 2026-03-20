'use strict';

/**
 * CompartirRepository
 * Encapsula consultas SQL para compartir, favoritos y búsqueda de usuarios.
 */
class CompartirRepository {
    /** @param {import('../database/db').DatabaseWrapper} db */
    constructor(db) {
        this.db = db;
    }

    // ----------------------------------------------------------------
    // USUARIOS
    // ----------------------------------------------------------------

    getUsuarioById(id) {
        return this.db.prepare('SELECT id, nombre, email, username, perfil_publico FROM usuarios WHERE id = ?').get(Number(id));
    }

    getUsuarioByUsername(username) {
        return this.db.prepare('SELECT id, nombre, username, perfil_publico FROM usuarios WHERE username = ?').get(username.toLowerCase());
    }

    buscarUsuarios(query, exclusorId) {
        const like = `%${query.toLowerCase()}%`;
        return this.db.prepare(`
            SELECT id, nombre, username, perfil_publico
            FROM usuarios
            WHERE (LOWER(username) LIKE ? OR LOWER(nombre) LIKE ?)
              AND id != ?
              AND activo = 1
              AND username IS NOT NULL
        `).all(like, like, exclusorId);
    }

    // ----------------------------------------------------------------
    // PERFIL
    // ----------------------------------------------------------------

    getPerfilPublico(userId) {
        return {
            clientes: this.db.prepare(`
                SELECT id, empresa, persona_contacto, ubicacion, actividad_principal
                FROM clientes WHERE creado_por = ? AND publico = 1 ORDER BY empresa ASC
            `).all(userId),
            reuniones: this.db.prepare(`
                SELECT r.id, r.codigo_referencia, r.fecha_hora, r.lugar, r.motivo, c.empresa AS cliente_empresa
                FROM reuniones r
                JOIN clientes c ON r.cliente_id = c.id
                WHERE r.creado_por = ? AND r.publico = 1 ORDER BY r.fecha_hora DESC
            `).all(userId),
        };
    }

    updatePerfil(userId, { username, perfil_publico }) {
        if (username !== undefined) {
            const clean = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
            const exists = this.db.prepare('SELECT id FROM usuarios WHERE username = ? AND id != ?').get(clean, userId);
            if (exists) throw new Error('USERNAME_TAKEN');
            if (clean.length < 3) throw new Error('USERNAME_TOO_SHORT');
            this.db.prepare('UPDATE usuarios SET username = ? WHERE id = ?').run(clean, userId);
        }
        if (perfil_publico !== undefined) {
            this.db.prepare('UPDATE usuarios SET perfil_publico = ? WHERE id = ?').run(perfil_publico ? 1 : 0, userId);
        }
        this.db.save();
        return this.getUsuarioById(userId);
    }

    // ----------------------------------------------------------------
    // COMPARTIR
    // ----------------------------------------------------------------

    getById(id) {
        return this.db.prepare('SELECT * FROM compartidos WHERE id = ?').get(Number(id));
    }

    yaCompartido(tipo, recursoId, destinoId) {
        return !!this.db.prepare('SELECT id FROM compartidos WHERE tipo = ? AND recurso_id = ? AND compartido_con = ?').get(tipo, recursoId, destinoId);
    }

    compartir(tipo, recursoId, compartidoPor, compartidoCon) {
        this.db.prepare('INSERT INTO compartidos (tipo, recurso_id, compartido_por, compartido_con) VALUES (?, ?, ?, ?)').run(tipo, recursoId, compartidoPor, compartidoCon);
        this.db.save();
    }

    getRecibidos(userId) {
        const clientes = this.db.prepare(`
            SELECT c.id, c.empresa, c.persona_contacto, c.ubicacion, c.actividad_principal,
                   u.nombre AS compartido_por_nombre, u.username AS compartido_por_username,
                   comp.id AS compartido_id, comp.creado_en AS compartido_en
            FROM compartidos comp
            JOIN clientes  c ON comp.recurso_id = c.id AND comp.tipo = 'cliente'
            JOIN usuarios  u ON comp.compartido_por = u.id
            WHERE comp.compartido_con = ? ORDER BY comp.creado_en DESC
        `).all(userId);

        const reuniones = this.db.prepare(`
            SELECT r.id, r.codigo_referencia, r.fecha_hora, r.lugar, r.motivo,
                   cl.empresa AS cliente_empresa,
                   u.nombre AS compartido_por_nombre, u.username AS compartido_por_username,
                   comp.id AS compartido_id, comp.creado_en AS compartido_en
            FROM compartidos comp
            JOIN reuniones r  ON comp.recurso_id = r.id AND comp.tipo = 'reunion'
            JOIN clientes  cl ON r.cliente_id = cl.id
            JOIN usuarios  u  ON comp.compartido_por = u.id
            WHERE comp.compartido_con = ? ORDER BY comp.creado_en DESC
        `).all(userId);

        return { clientes, reuniones };
    }

    eliminarCompartido(id) {
        this.db.prepare('DELETE FROM compartidos WHERE id = ?').run(Number(id));
        this.db.save();
    }

    // ----------------------------------------------------------------
    // FAVORITOS
    // ----------------------------------------------------------------

    getRecursoPublico(tipo, recursoId) {
        const table = tipo === 'cliente' ? 'clientes' : 'reuniones';
        return this.db.prepare(`SELECT id, publico, creado_por FROM ${table} WHERE id = ?`).get(recursoId);
    }

    addFavorito(userId, tipo, recursoId) {
        this.db.prepare('INSERT OR IGNORE INTO favoritos (usuario_id, tipo, recurso_id) VALUES (?, ?, ?)').run(userId, tipo, recursoId);
        this.db.save();
    }

    removeFavorito(userId, tipo, recursoId) {
        this.db.prepare('DELETE FROM favoritos WHERE usuario_id = ? AND tipo = ? AND recurso_id = ?').run(userId, tipo, Number(recursoId));
        this.db.save();
    }

    // ----------------------------------------------------------------
    // PDF PÚBLICO (datos para generación)
    // ----------------------------------------------------------------

    getReunionPublicaConDetalles(reunionId, ownerUserId) {
        const reunion = this.db.prepare(`
            SELECT r.*, c.empresa AS cliente_empresa
            FROM reuniones r
            JOIN clientes c ON r.cliente_id = c.id
            WHERE r.id = ? AND r.creado_por = ? AND r.publico = 1
        `).get(Number(reunionId), Number(ownerUserId));

        if (!reunion) return null;

        return {
            ...reunion,
            cliente:           this.db.prepare('SELECT * FROM clientes               WHERE id         = ?').get(reunion.cliente_id),
            asistentes:        this.db.prepare('SELECT * FROM asistentes              WHERE reunion_id = ?').all(reunion.id),
            resumen_ejecutivo: this.db.prepare('SELECT * FROM resumenes_ejecutivos    WHERE reunion_id = ?').get(reunion.id),
            necesidad_cliente: this.db.prepare('SELECT * FROM necesidades_cliente     WHERE reunion_id = ?').get(reunion.id),
            situacion_actual:  this.db.prepare('SELECT * FROM situacion_actual        WHERE reunion_id = ?').get(reunion.id),
            anexos:            this.db.prepare('SELECT * FROM anexos                  WHERE reunion_id = ?').all(reunion.id),
        };
    }
}

module.exports = CompartirRepository;
