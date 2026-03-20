const REPORT_FILENAME_REGEX = /^Informe_(RT-\d{4}-\d{3})_[A-Za-z0-9._-]+\.(pdf|docx)$/i;

function parseId(value) {
    const id = Number.parseInt(value, 10);
    return Number.isNaN(id) ? null : id;
}

function isAdmin(user) {
    return user?.rol === 'admin';
}

function isClienteRole(user) {
    return user?.rol === 'cliente';
}

function isOwner(user, recurso) {
    return Boolean(recurso && recurso.creado_por && user && recurso.creado_por === user.id);
}

function isAssignedCliente(user, clienteId) {
    return Boolean(user && user.cliente_id && user.cliente_id === clienteId);
}

function hasSharedAccess(db, tipo, recursoId, userId) {
    return Boolean(
        db.prepare('SELECT id FROM compartidos WHERE tipo = ? AND recurso_id = ? AND compartido_con = ?')
            .get(tipo, recursoId, userId)
    );
}

function hasFavoriteAccess(db, tipo, recursoId, userId, isPublic) {
    if (!isPublic) {
        return false;
    }

    return Boolean(
        db.prepare('SELECT id FROM favoritos WHERE tipo = ? AND recurso_id = ? AND usuario_id = ?')
            .get(tipo, recursoId, userId)
    );
}

function canAccessCliente(db, user, cliente, options = {}) {
    const action = options.action || 'read';
    if (!user || !cliente) {
        return false;
    }

    if (isAdmin(user)) {
        return true;
    }

    if (isClienteRole(user)) {
        return action === 'read' && isAssignedCliente(user, cliente.id);
    }

    if (isOwner(user, cliente)) {
        return true;
    }

    if (action !== 'read') {
        return false;
    }

    if (hasSharedAccess(db, 'cliente', cliente.id, user.id)) {
        return true;
    }

    return hasFavoriteAccess(db, 'cliente', cliente.id, user.id, cliente.publico === 1);
}

function canAccessReunion(db, user, reunion, options = {}) {
    const action = options.action || 'read';
    if (!user || !reunion) {
        return false;
    }

    if (isAdmin(user)) {
        return true;
    }

    if (isClienteRole(user)) {
        return action === 'read' && isAssignedCliente(user, reunion.cliente_id);
    }

    if (isOwner(user, reunion)) {
        return true;
    }

    if (action !== 'read') {
        return false;
    }

    if (hasSharedAccess(db, 'reunion', reunion.id, user.id)) {
        return true;
    }

    if (hasSharedAccess(db, 'cliente', reunion.cliente_id, user.id)) {
        return true;
    }

    return hasFavoriteAccess(db, 'reunion', reunion.id, user.id, reunion.publico === 1);
}

function getClienteById(db, clienteId) {
    const id = parseId(clienteId);
    if (!id) {
        return null;
    }
    return db.prepare('SELECT * FROM clientes WHERE id = ?').get(id) || null;
}

function getReunionById(db, reunionId) {
    const id = parseId(reunionId);
    if (!id) {
        return null;
    }
    return db.prepare(`
        SELECT r.*, c.empresa as cliente_empresa
        FROM reuniones r
        JOIN clientes c ON r.cliente_id = c.id
        WHERE r.id = ?
    `).get(id) || null;
}

function getReunionByCodigo(db, codigoReferencia) {
    if (!codigoReferencia) {
        return null;
    }
    return db.prepare(`
        SELECT r.*, c.empresa as cliente_empresa
        FROM reuniones r
        JOIN clientes c ON r.cliente_id = c.id
        WHERE r.codigo_referencia = ?
    `).get(codigoReferencia) || null;
}

function extractCodigoReferenciaFromReportFilename(filename) {
    const match = REPORT_FILENAME_REGEX.exec(filename || '');
    return match ? match[1] : null;
}

module.exports = {
    canAccessCliente,
    canAccessReunion,
    getClienteById,
    getReunionById,
    getReunionByCodigo,
    extractCodigoReferenciaFromReportFilename
};
