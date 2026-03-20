'use strict';

/**
 * ClienteRepository
 * Encapsula todas las consultas SQL relacionadas con la entidad Cliente.
 * Las rutas HTTP no deberían contener SQL en línea: deben llamar métodos de este repositorio.
 */
class ClienteRepository {
    /** @param {import('../database/db').DatabaseWrapper} db */
    constructor(db) {
        this.db = db;
    }

    // ----------------------------------------------------------------
    // LECTURA
    // ----------------------------------------------------------------

    /**
     * Devuelve la lista de clientes visibles para el usuario según su rol.
     * @param {{ id: number, rol: string, cliente_id?: number }} user
     */
    getAll(user) {
        if (user.rol === 'cliente' && user.cliente_id) {
            const row = this.db.prepare('SELECT * FROM clientes WHERE id = ?').get(user.cliente_id);
            return row ? [row] : [];
        }

        if (user.rol === 'admin') {
            return this.db.prepare(`
                SELECT c.*, u.email AS creador_email
                FROM clientes c
                LEFT JOIN usuarios u ON c.creado_por = u.id
                ORDER BY c.empresa ASC
            `).all();
        }

        // Técnico: los suyos + favoritos + compartidos con él
        return this.db.prepare(`
            SELECT DISTINCT c.*, u.email AS creador_email
            FROM clientes c
            LEFT JOIN usuarios u ON c.creado_por = u.id
            WHERE c.creado_por = ?
               OR c.id IN (SELECT recurso_id FROM favoritos    WHERE tipo = 'cliente' AND usuario_id   = ?)
               OR c.id IN (SELECT recurso_id FROM compartidos  WHERE tipo = 'cliente' AND compartido_con = ?)
            ORDER BY c.empresa ASC
        `).all(user.id, user.id, user.id);
    }

    /** @returns {object|undefined} */
    getById(id) {
        return this.db.prepare('SELECT * FROM clientes WHERE id = ?').get(Number(id));
    }

    /** @returns {object[]} */
    getContactos(clienteId) {
        return this.db.prepare('SELECT * FROM contactos_cliente WHERE cliente_id = ?').all(Number(clienteId));
    }

    /** @returns {object[]} Reuniones ligadas al cliente */
    getReuniones(clienteId) {
        return this.db.prepare(`
            SELECT r.*, c.empresa AS cliente_empresa
            FROM reuniones r
            JOIN clientes c ON r.cliente_id = c.id
            WHERE r.cliente_id = ?
            ORDER BY r.fecha_hora DESC
        `).all(Number(clienteId));
    }

    // ----------------------------------------------------------------
    // ESCRITURA
    // ----------------------------------------------------------------

    /**
     * Crea un cliente y sus contactos en una sola operación.
     * @param {{ empresa, cif?, persona_contacto, cargo?, telefono?, email?, ubicacion?, actividad_principal?, contactos?: object[] }} data
     * @param {number} creadorId
     * @returns {object} Cliente creado con contactos
     */
    create(data, creadorId) {
        const { empresa, cif, persona_contacto, cargo, telefono, email, ubicacion, actividad_principal, contactos } = data;

        const result = this.db.prepare(`
            INSERT INTO clientes (empresa, cif, persona_contacto, cargo, telefono, email, ubicacion, actividad_principal, creado_por)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(empresa, cif || null, persona_contacto, cargo || null, telefono || null, email || null, ubicacion || null, actividad_principal || null, creadorId);

        const clienteId = result.lastInsertRowid;
        this._insertContactos(clienteId, contactos);
        this.db.save();

        return this.getWithContactos(clienteId);
    }

    /**
     * Actualiza los campos suministrados de un cliente.
     * @param {number} id
     * @param {object} data Campos a actualizar (parcial)
     * @param {object} current Registro actual (para merge)
     * @returns {object} Cliente actualizado con contactos
     */
    update(id, data, current) {
        const { empresa, cif, persona_contacto, cargo, telefono, email, ubicacion, actividad_principal, contactos } = data;

        this.db.prepare(`
            UPDATE clientes SET
                empresa              = ?,
                cif                  = ?,
                persona_contacto     = ?,
                cargo                = ?,
                telefono             = ?,
                email                = ?,
                ubicacion            = ?,
                actividad_principal  = ?,
                actualizado_en       = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            empresa              ?? current.empresa,
            cif                  !== undefined ? cif : current.cif,
            persona_contacto     ?? current.persona_contacto,
            cargo                !== undefined ? cargo : current.cargo,
            telefono             !== undefined ? telefono : current.telefono,
            email                !== undefined ? email : current.email,
            ubicacion            !== undefined ? ubicacion : current.ubicacion,
            actividad_principal  !== undefined ? actividad_principal : current.actividad_principal,
            id
        );

        if (contactos !== undefined) {
            this.db.prepare('DELETE FROM contactos_cliente WHERE cliente_id = ?').run(id);
            this._insertContactos(id, contactos);
        }

        this.db.save();
        return this.getWithContactos(id);
    }

    /**
     * Cambia la visibilidad pública/privada.
     */
    toggleVisibilidad(id, publico) {
        this.db.prepare('UPDATE clientes SET publico = ? WHERE id = ?').run(publico ? 1 : 0, id);
        this.db.save();
    }

    /** Elimina el cliente (los contactos se borran por CASCADE). */
    delete(id) {
        this.db.prepare('DELETE FROM clientes WHERE id = ?').run(id);
        this.db.save();
    }

    // ----------------------------------------------------------------
    // HELPERS
    // ----------------------------------------------------------------

    /** Devuelve el cliente junto con su lista de contactos. */
    getWithContactos(id) {
        const cliente = this.getById(id);
        if (cliente) {
            cliente.contactos = this.getContactos(id);
        }
        return cliente;
    }

    _insertContactos(clienteId, contactos) {
        if (!Array.isArray(contactos)) return;
        for (const c of contactos) {
            if (!c.nombre) continue;
            this.db.prepare(`
                INSERT INTO contactos_cliente (cliente_id, nombre, cargo, telefono, email, es_principal)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(clienteId, c.nombre, c.cargo || null, c.telefono || null, c.email || null, c.es_principal ? 1 : 0);
        }
    }
}

module.exports = ClienteRepository;
