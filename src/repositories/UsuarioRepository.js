'use strict';

/**
 * UsuarioRepository
 * Encapsula la gestión de usuarios, creación de hashes y filtros de autenticación.
 */
class UsuarioRepository {
    /** @param {import('../database/db').DatabaseWrapper} db */
    constructor(db) {
        this.db = db;
    }

    // ----------------------------------------------------------------
    // LECTURA
    // ----------------------------------------------------------------

    /** @returns {object[]} */
    getAll() {
        return this.db.prepare(`
            SELECT u.id, u.nombre, u.email, u.rol, u.cliente_id, u.activo, u.creado_en,
                   c.empresa AS cliente_empresa
            FROM usuarios u
            LEFT JOIN clientes c ON u.cliente_id = c.id
            ORDER BY u.nombre ASC
        `).all();
    }

    /** @returns {object|undefined} */
    getById(id) {
        return this.db.prepare(`
            SELECT u.id, u.nombre, u.email, u.rol, u.cliente_id, u.activo, u.creado_en,
                   c.empresa AS cliente_empresa
            FROM usuarios u
            LEFT JOIN clientes c ON u.cliente_id = c.id
            WHERE u.id = ?
        `).get(Number(id));
    }

    /** @returns {object|undefined} Utilizado para login/auth */
    getByEmail(email) {
        return this.db.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').get(email.toLowerCase());
    }

    /** @returns {object|undefined} Solo para verificar hashing local */
    getPasswordHash(id) {
        return this.db.prepare('SELECT password_hash FROM usuarios WHERE id = ?').get(Number(id));
    }

    validarClienteId(clienteId) {
        if (!clienteId) return false;
        return !!this.db.prepare('SELECT id FROM clientes WHERE id = ?').get(Number(clienteId));
    }

    // ----------------------------------------------------------------
    // ESCRITURA
    // ----------------------------------------------------------------

    /**
     * @returns {object} Usuario recién creado (plano, sin hash).
     */
    create({ nombre, email, passwordHash, rol, clienteId }) {
        const result = this.db.prepare(`
            INSERT INTO usuarios (nombre, email, password_hash, rol, cliente_id)
            VALUES (?, ?, ?, ?, ?)
        `).run(nombre, email.toLowerCase(), passwordHash, rol || 'tecnico', rol === 'cliente' && clienteId ? Number(clienteId) : null);

        this.db.save();
        return this.db.prepare('SELECT id, nombre, email, rol, cliente_id, activo, creado_en FROM usuarios WHERE id = ?').get(result.lastInsertRowid);
    }

    /**
     * @param {number} id
     * @param {object} data Campos corregidos (parcial)
     * @param {object} current Fila actual
     */
    update(id, data, current) {
        const { nombre, email, rol, clienteId, activo } = data;

        this.db.prepare(`
            UPDATE usuarios SET
                nombre = ?,
                email = ?,
                rol = ?,
                cliente_id = ?,
                activo = ?,
                actualizado_en = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            nombre || current.nombre,
            email ? email.toLowerCase() : current.email,
            rol || current.rol,
            rol === 'cliente' ? (clienteId ? Number(clienteId) : null) : null,
            activo !== undefined ? Number(activo) : current.activo,
            id
        );

        this.db.save();
        return this.db.prepare('SELECT id, nombre, email, rol, cliente_id, activo, creado_en FROM usuarios WHERE id = ?').get(id);
    }

    updatePassword(id, passwordHash) {
        this.db.prepare('UPDATE usuarios SET password_hash = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?').run(passwordHash, Number(id));
        this.db.save();
    }

    delete(id) {
        this.db.prepare('DELETE FROM usuarios WHERE id = ?').run(Number(id));
        this.db.save();
    }
}

module.exports = UsuarioRepository;
