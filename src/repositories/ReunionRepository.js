'use strict';

const path = require('path');
const fs   = require('fs');

/**
 * ReunionRepository
 * Encapsula todas las consultas SQL relacionadas con la entidad Reunión
 * y sus tablas débiles (asistentes, resúmenes, necesidades, situación, anexos).
 */
class ReunionRepository {
    /** @param {import('../database/db').DatabaseWrapper} db */
    constructor(db) {
        this.db = db;
    }

    // ----------------------------------------------------------------
    // LECTURA
    // ----------------------------------------------------------------

    /**
     * Lista de reuniones visibles para el usuario según su rol.
     * @param {{ id: number, rol: string, cliente_id?: number }} user
     */
    getAll(user) {
        const base = `
            SELECT r.*, c.empresa AS cliente_empresa, u.nombre AS creado_por_nombre, u.email AS creador_email
            FROM reuniones r
            JOIN   clientes  c ON r.cliente_id  = c.id
            LEFT JOIN usuarios u ON r.creado_por = u.id
        `;

        if (user.rol === 'cliente' && user.cliente_id) {
            return this.db.prepare(`${base} WHERE r.cliente_id = ? ORDER BY r.fecha_hora DESC`).all(user.cliente_id);
        }

        if (user.rol === 'admin') {
            return this.db.prepare(`${base} ORDER BY r.fecha_hora DESC`).all();
        }

        // Técnico
        return this.db.prepare(`
            SELECT DISTINCT r.*, c.empresa AS cliente_empresa, u.nombre AS creado_por_nombre, u.email AS creador_email
            FROM reuniones r
            JOIN   clientes  c ON r.cliente_id  = c.id
            LEFT JOIN usuarios u ON r.creado_por = u.id
            WHERE r.creado_por = ?
               OR r.id IN (SELECT recurso_id FROM favoritos   WHERE tipo = 'reunion'  AND usuario_id    = ?)
               OR r.id IN (SELECT recurso_id FROM compartidos WHERE tipo = 'reunion'  AND compartido_con = ?)
               OR r.cliente_id IN (SELECT recurso_id FROM compartidos WHERE tipo = 'cliente' AND compartido_con = ?)
            ORDER BY r.fecha_hora DESC
        `).all(user.id, user.id, user.id, user.id);
    }

    /** @returns {object|undefined} Solo la fila de reuniones (sin sub-items). */
    getById(id) {
        return this.db.prepare('SELECT * FROM reuniones WHERE id = ?').get(Number(id));
    }

    /**
     * Devuelve la reunión enriquecida con todos sus sub-items.
     */
    getWithDetails(id) {
        const reunion = this.getById(id);
        if (!reunion) return null;

        const rid = reunion.id;
        return {
            ...reunion,
            cliente:         this.db.prepare('SELECT * FROM clientes               WHERE id         = ?').get(reunion.cliente_id),
            asistentes:      this.db.prepare('SELECT * FROM asistentes              WHERE reunion_id = ?').all(rid),
            resumen_ejecutivo: this.db.prepare('SELECT * FROM resumenes_ejecutivos WHERE reunion_id = ?').get(rid),
            necesidad_cliente: this.db.prepare('SELECT * FROM necesidades_cliente  WHERE reunion_id = ?').get(rid),
            situacion_actual:  this.db.prepare('SELECT * FROM situacion_actual      WHERE reunion_id = ?').get(rid),
            anexos:          this.db.prepare('SELECT * FROM anexos                  WHERE reunion_id = ?').all(rid),
        };
    }

    /** Genera el próximo código de referencia (RT-YYYY-NNN). */
    generarCodigoReferencia() {
        const year  = new Date().getFullYear();
        const row   = this.db.prepare(`SELECT COUNT(*) as total FROM reuniones WHERE codigo_referencia LIKE ?`).get(`RT-${year}-%`);
        const num   = ((row?.total || 0) + 1).toString().padStart(3, '0');
        return `RT-${year}-${num}`;
    }

    // ----------------------------------------------------------------
    // ESCRITURA
    // ----------------------------------------------------------------

    /**
     * Crea una reunión con todos sus sub-items.
     * @returns {object} Reunión recién creada (fila plana).
     */
    create(data, creadorId) {
        const { cliente_id, fecha_hora, lugar, motivo, autor_documento,
                asistentes, resumen_ejecutivo, necesidad_cliente, situacion_actual, notas_adicionales } = data;

        const codigo_referencia = this.generarCodigoReferencia();

        const result = this.db.prepare(`
            INSERT INTO reuniones (cliente_id, creado_por, codigo_referencia, fecha_hora, lugar, motivo, autor_documento)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(Number(cliente_id), creadorId, codigo_referencia, fecha_hora, lugar || null, motivo || null, autor_documento || null);

        const reunionId = result.lastInsertRowid;

        this._insertAsistentes(reunionId, asistentes);
        this._upsertResumen(reunionId, resumen_ejecutivo, false);
        this._upsertNecesidad(reunionId, necesidad_cliente, false);
        this._upsertSituacion(reunionId, situacion_actual, false);
        this._upsertNota(reunionId, notas_adicionales);

        this.db.save();
        return this.getById(reunionId);
    }

    /**
     * Actualiza una reunión existente.
     * @param {number}  id
     * @param {object}  data Campos nuevos (parcial)
     * @param {object}  current Registro actual para merge
     */
    update(id, data, current) {
        const { fecha_hora, lugar, motivo, autor_documento,
                asistentes, resumen_ejecutivo, necesidad_cliente, situacion_actual, notas_adicionales } = data;

        this.db.prepare(`
            UPDATE reuniones SET
                fecha_hora      = ?,
                lugar           = ?,
                motivo          = ?,
                autor_documento = ?,
                actualizado_en  = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            fecha_hora      ?? current.fecha_hora,
            lugar           !== undefined ? lugar : current.lugar,
            motivo          !== undefined ? motivo : current.motivo,
            autor_documento !== undefined ? autor_documento : current.autor_documento,
            id
        );

        if (asistentes !== undefined) {
            this.db.prepare('DELETE FROM asistentes WHERE reunion_id = ?').run(id);
            this._insertAsistentes(id, asistentes);
        }
        if (resumen_ejecutivo   !== undefined) this._upsertResumen(id,   resumen_ejecutivo,   true);
        if (necesidad_cliente   !== undefined) this._upsertNecesidad(id, necesidad_cliente,   true);
        if (situacion_actual    !== undefined) this._upsertSituacion(id, situacion_actual,    true);
        if (notas_adicionales   !== undefined) this._upsertNota(id, notas_adicionales);

        this.db.save();
        return this.getById(id);
    }

    /** Cambia la visibilidad pública/privada. */
    toggleVisibilidad(id, publico) {
        this.db.prepare('UPDATE reuniones SET publico = ? WHERE id = ?').run(publico ? 1 : 0, id);
        this.db.save();
    }

    /**
     * Elimina la reunión y borra sus archivos físicos de disco.
     */
    delete(id) {
        const anexos = this.db.prepare('SELECT ruta_archivo FROM anexos WHERE reunion_id = ?').all(id);
        for (const a of anexos) {
            if (a.ruta_archivo && fs.existsSync(a.ruta_archivo)) {
                try { fs.unlinkSync(a.ruta_archivo); } catch { /* best-effort */ }
            }
        }
        this.db.prepare('DELETE FROM reuniones WHERE id = ?').run(id);
        this.db.save();
    }

    // ----------------------------------------------------------------
    // ANEXOS Y NOTAS
    // ----------------------------------------------------------------

    /** Inserta un conjunto de archivos físicos como anexos. */
    insertAnexos(reunionId, files) {
        const inserted = [];
        const insert = this.db.prepare(
            'INSERT INTO anexos (reunion_id, tipo, nombre_archivo, ruta_archivo, descripcion) VALUES (?, ?, ?, ?, ?)'
        );
        for (const file of (files.documentos || [])) {
            const r = insert.run(reunionId, 'documento',  file.originalname, file.path, '');
            inserted.push({ id: r.lastInsertRowid, tipo: 'documento',  nombre: file.originalname });
        }
        for (const file of (files.fotografias || [])) {
            const r = insert.run(reunionId, 'fotografia', file.originalname, file.path, '');
            inserted.push({ id: r.lastInsertRowid, tipo: 'fotografia', nombre: file.originalname });
        }
        this.db.save();
        return inserted;
    }

    getAnexo(id, reunionId) {
        return this.db.prepare('SELECT * FROM anexos WHERE id = ? AND reunion_id = ?').get(Number(id), Number(reunionId));
    }

    deleteAnexo(anexo) {
        if (anexo.ruta_archivo && fs.existsSync(anexo.ruta_archivo)) {
            try { fs.unlinkSync(anexo.ruta_archivo); } catch { /* best-effort */ }
        }
        this.db.prepare('DELETE FROM anexos WHERE id = ?').run(anexo.id);
        this.db.save();
    }

    insertNota(reunionId, descripcion) {
        const r = this.db.prepare(`INSERT INTO anexos (reunion_id, tipo, descripcion) VALUES (?, 'nota', ?)`).run(reunionId, descripcion);
        this.db.save();
        return r.lastInsertRowid;
    }

    // ----------------------------------------------------------------
    // INTERNOS
    // ----------------------------------------------------------------

    _insertAsistentes(reunionId, asistentes) {
        if (!Array.isArray(asistentes)) return;
        const stmt = this.db.prepare('INSERT INTO asistentes (reunion_id, nombre, cargo, tipo) VALUES (?, ?, ?, ?)');
        for (const a of asistentes) {
            if (a.nombre) stmt.run(reunionId, a.nombre, a.cargo || null, a.tipo || 'cliente');
        }
    }

    _upsertResumen(reunionId, resumen, exists) {
        if (!resumen) return;
        if (exists && this.db.prepare('SELECT id FROM resumenes_ejecutivos WHERE reunion_id = ?').get(reunionId)) {
            this.db.prepare('UPDATE resumenes_ejecutivos SET sintesis = ? WHERE reunion_id = ?').run(resumen.sintesis || null, reunionId);
        } else {
            this.db.prepare('INSERT INTO resumenes_ejecutivos (reunion_id, sintesis) VALUES (?, ?)').run(reunionId, resumen.sintesis || null);
        }
    }

    _upsertNecesidad(reunionId, nec, exists) {
        if (!nec) return;
        if (exists && this.db.prepare('SELECT id FROM necesidades_cliente WHERE reunion_id = ?').get(reunionId)) {
            this.db.prepare('UPDATE necesidades_cliente SET solicitud_explicita = ?, objetivo_negocio = ? WHERE reunion_id = ?')
                .run(nec.solicitud_explicita || null, nec.objetivo_negocio || null, reunionId);
        } else {
            this.db.prepare('INSERT INTO necesidades_cliente (reunion_id, solicitud_explicita, objetivo_negocio) VALUES (?, ?, ?)')
                .run(reunionId, nec.solicitud_explicita || null, nec.objetivo_negocio || null);
        }
    }

    _upsertSituacion(reunionId, sit, exists) {
        if (!sit) return;
        if (exists && this.db.prepare('SELECT id FROM situacion_actual WHERE reunion_id = ?').get(reunionId)) {
            this.db.prepare('UPDATE situacion_actual SET proceso_actual = ?, equipos_instalados = ?, limitaciones_problemas = ? WHERE reunion_id = ?')
                .run(sit.proceso_actual || null, sit.equipos_instalados || null, sit.limitaciones_problemas || null, reunionId);
        } else {
            this.db.prepare('INSERT INTO situacion_actual (reunion_id, proceso_actual, equipos_instalados, limitaciones_problemas) VALUES (?, ?, ?, ?)')
                .run(reunionId, sit.proceso_actual || null, sit.equipos_instalados || null, sit.limitaciones_problemas || null);
        }
    }

    _upsertNota(reunionId, texto) {
        this.db.prepare("DELETE FROM anexos WHERE reunion_id = ? AND tipo = 'nota'").run(reunionId);
        if (texto && texto.trim()) {
            this.db.prepare(`INSERT INTO anexos (reunion_id, tipo, descripcion) VALUES (?, 'nota', ?)`).run(reunionId, texto.trim());
        }
    }
}

module.exports = ReunionRepository;
