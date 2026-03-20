const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.REKER_DB_PATH = path.resolve(__dirname, '../tmp/object-acl-test.db');

const { getDb } = require('../src/database/db');
const clientesRouter = require('../src/routes/clientes');
const reunionesRouter = require('../src/routes/reuniones');
const informesRouter = require('../src/routes/informes');
const compartirRouter = require('../src/routes/compartir');

const reportsDir = path.resolve(__dirname, '../reports');
const ownedReportFilename = 'Informe_RT-2026-001_owner.pdf';
const foreignReportFilename = 'Informe_RT-2026-002_other.pdf';

let users = {};

function getRouteHandlers(router, method, routePath) {
    const layer = router.stack.find((item) => item.route && item.route.path === routePath && item.route.methods[method]);
    assert.ok(layer, `No se encontró la ruta ${method.toUpperCase()} ${routePath}`);
    return layer.route.stack.map((routeLayer) => routeLayer.handle);
}

function createResponse() {
    return {
        statusCode: 200,
        body: null,
        downloaded: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.sent = true;
            this.body = payload;
            return this;
        },
        download(filePath, filename) {
            this.sent = true;
            this.downloaded = { filePath, filename };
            return this;
        }
    };
}

async function runRoute(handlers, { params = {}, body = {}, user = null } = {}) {
    const req = {
        params,
        body,
        user,
        protocol: 'http',
        get: () => 'localhost'
    };
    const res = createResponse();

    for (const handler of handlers) {
        let nextCalled = false;
        await new Promise((resolve, reject) => {
            Promise.resolve(handler(req, res, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                nextCalled = true;
                resolve();
            })).then(() => {
                if (!nextCalled) {
                    resolve();
                }
            }).catch(reject);
        });

        if (res.sent) {
            break;
        }
    }

    return res;
}

async function seedDatabase() {
    const dbFile = process.env.REKER_DB_PATH;
    if (fs.existsSync(dbFile)) {
        fs.unlinkSync(dbFile);
    }

    const db = await getDb();
    const schema = fs.readFileSync(path.resolve(__dirname, '../src/database/schema.sql'), 'utf8');
    const statements = schema.split(';').map((s) => s.trim()).filter(Boolean);

    for (const statement of statements) {
        db.exec(statement);
    }

    db.prepare(`
        INSERT INTO usuarios (id, nombre, email, username, password_hash, rol, activo)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(1, 'Admin', 'admin@test.local', 'admin', 'x', 'admin');
    db.prepare(`
        INSERT INTO usuarios (id, nombre, email, username, password_hash, rol, activo)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(2, 'Owner Tech', 'owner@test.local', 'ownertech', 'x', 'tecnico');
    db.prepare(`
        INSERT INTO usuarios (id, nombre, email, username, password_hash, rol, activo)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(3, 'Other Tech', 'other@test.local', 'othertech', 'x', 'tecnico');
    db.prepare(`
        INSERT INTO usuarios (id, nombre, email, username, password_hash, rol, activo)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(5, 'Shared Tech', 'shared@test.local', 'sharedtech', 'x', 'tecnico');

    db.prepare(`
        INSERT INTO clientes (id, empresa, persona_contacto, creado_por, publico)
        VALUES (?, ?, ?, ?, ?)
    `).run(1, 'Cliente Propio', 'Contacto A', 2, 0);
    db.prepare(`
        INSERT INTO clientes (id, empresa, persona_contacto, creado_por, publico)
        VALUES (?, ?, ?, ?, ?)
    `).run(2, 'Cliente Ajeno', 'Contacto B', 3, 0);

    db.prepare(`
        INSERT INTO usuarios (id, nombre, email, username, password_hash, rol, cliente_id, activo)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(4, 'Cliente User', 'cliente@test.local', 'clienteuser', 'x', 'cliente', 1);

    db.prepare(`
        INSERT INTO reuniones (id, cliente_id, creado_por, codigo_referencia, fecha_hora, motivo, publico)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 1, 2, 'RT-2026-001', '2026-03-20T10:00:00Z', 'Reunión propia', 0);
    db.prepare(`
        INSERT INTO reuniones (id, cliente_id, creado_por, codigo_referencia, fecha_hora, motivo, publico)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(2, 2, 3, 'RT-2026-002', '2026-03-20T11:00:00Z', 'Reunión ajena', 0);

    db.prepare(`
        INSERT INTO compartidos (tipo, recurso_id, compartido_por, compartido_con)
        VALUES ('cliente', 1, 2, 5)
    `).run();
    db.prepare(`
        INSERT INTO compartidos (tipo, recurso_id, compartido_por, compartido_con)
        VALUES ('reunion', 1, 2, 5)
    `).run();

    db.save();

    users = {
        admin: db.prepare('SELECT id, nombre, email, rol, cliente_id FROM usuarios WHERE id = 1').get(),
        owner: db.prepare('SELECT id, nombre, email, rol, cliente_id FROM usuarios WHERE id = 2').get(),
        other: db.prepare('SELECT id, nombre, email, rol, cliente_id FROM usuarios WHERE id = 3').get(),
        cliente: db.prepare('SELECT id, nombre, email, rol, cliente_id FROM usuarios WHERE id = 4').get(),
        shared: db.prepare('SELECT id, nombre, email, rol, cliente_id FROM usuarios WHERE id = 5').get()
    };
}

test.before(async () => {
    await seedDatabase();

    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }

    fs.writeFileSync(path.join(reportsDir, ownedReportFilename), 'report-content-owner');
    fs.writeFileSync(path.join(reportsDir, foreignReportFilename), 'report-content-other');
});

test.after(() => {
    const ownedPath = path.join(reportsDir, ownedReportFilename);
    const foreignPath = path.join(reportsDir, foreignReportFilename);
    if (fs.existsSync(ownedPath)) {
        fs.unlinkSync(ownedPath);
    }
    if (fs.existsSync(foreignPath)) {
        fs.unlinkSync(foreignPath);
    }
    if (fs.existsSync(process.env.REKER_DB_PATH)) {
        fs.unlinkSync(process.env.REKER_DB_PATH);
    }
});

test('clientes: acceso permitido a propio/compartido/admin y denegado a ajeno', async () => {
    const getCliente = getRouteHandlers(clientesRouter, 'get', '/:id');

    const ownerRes = await runRoute(getCliente, { params: { id: '1' }, user: users.owner });
    assert.equal(ownerRes.statusCode, 200);
    assert.equal(ownerRes.body.id, 1);

    const sharedRes = await runRoute(getCliente, { params: { id: '1' }, user: users.shared });
    assert.equal(sharedRes.statusCode, 200);
    assert.equal(sharedRes.body.id, 1);

    const adminRes = await runRoute(getCliente, { params: { id: '1' }, user: users.admin });
    assert.equal(adminRes.statusCode, 200);
    assert.equal(adminRes.body.id, 1);

    const deniedRes = await runRoute(getCliente, { params: { id: '1' }, user: users.other });
    assert.equal(deniedRes.statusCode, 403);
});

test('reuniones: lectura permitida a propio/compartido/admin y denegada a ajeno', async () => {
    const getReunion = getRouteHandlers(reunionesRouter, 'get', '/:id');

    const ownerRes = await runRoute(getReunion, { params: { id: '1' }, user: users.owner });
    assert.equal(ownerRes.statusCode, 200);
    assert.equal(ownerRes.body.id, 1);

    const sharedRes = await runRoute(getReunion, { params: { id: '1' }, user: users.shared });
    assert.equal(sharedRes.statusCode, 200);
    assert.equal(sharedRes.body.id, 1);

    const adminRes = await runRoute(getReunion, { params: { id: '1' }, user: users.admin });
    assert.equal(adminRes.statusCode, 200);
    assert.equal(adminRes.body.id, 1);

    const deniedRes = await runRoute(getReunion, { params: { id: '1' }, user: users.other });
    assert.equal(deniedRes.statusCode, 403);
});

test('reuniones: edición y acciones sensibles denegadas si no hay propiedad', async () => {
    const updateReunion = getRouteHandlers(reunionesRouter, 'put', '/:id');
    const visibilidadReunion = getRouteHandlers(reunionesRouter, 'put', '/:id/visibilidad');
    const addNota = getRouteHandlers(reunionesRouter, 'post', '/:id/notas');

    const ownerUpdateRes = await runRoute(updateReunion, {
        params: { id: '1' },
        body: { motivo: 'Actualizado por owner' },
        user: users.owner
    });
    assert.equal(ownerUpdateRes.statusCode, 200);

    const sharedDeniedUpdate = await runRoute(updateReunion, {
        params: { id: '1' },
        body: { motivo: 'No debe actualizar' },
        user: users.shared
    });
    assert.equal(sharedDeniedUpdate.statusCode, 403);

    const otherDeniedVisibilidad = await runRoute(visibilidadReunion, {
        params: { id: '1' },
        body: { publico: true },
        user: users.other
    });
    assert.equal(otherDeniedVisibilidad.statusCode, 403);

    const otherDeniedNota = await runRoute(addNota, {
        params: { id: '1' },
        body: { descripcion: 'No permitido' },
        user: users.other
    });
    assert.equal(otherDeniedNota.statusCode, 403);
});

test('informes: descarga permitida con ACL y denegada para reunión ajena', async () => {
    const downloadInforme = getRouteHandlers(informesRouter, 'get', '/download/:filename');
    const generatePdf = getRouteHandlers(informesRouter, 'get', '/:reunionId/pdf');

    const ownerDownload = await runRoute(downloadInforme, {
        params: { filename: ownedReportFilename },
        user: users.owner
    });
    assert.equal(ownerDownload.statusCode, 200);
    assert.equal(ownerDownload.downloaded.filename, ownedReportFilename);

    const sharedDownload = await runRoute(downloadInforme, {
        params: { filename: ownedReportFilename },
        user: users.shared
    });
    assert.equal(sharedDownload.statusCode, 200);
    assert.equal(sharedDownload.downloaded.filename, ownedReportFilename);

    const deniedDownload = await runRoute(downloadInforme, {
        params: { filename: ownedReportFilename },
        user: users.other
    });
    assert.equal(deniedDownload.statusCode, 403);

    const deniedGenerate = await runRoute(generatePdf, {
        params: { reunionId: '1' },
        user: users.other
    });
    assert.equal(deniedGenerate.statusCode, 403);
});

test('compartir: no se puede compartir recurso ajeno sin permiso de propiedad', async () => {
    const shareResource = getRouteHandlers(compartirRouter, 'post', '/');

    const deniedShare = await runRoute(shareResource, {
        body: { tipo: 'reunion', recurso_id: 1, username_destino: 'sharedtech' },
        user: users.other
    });
    assert.equal(deniedShare.statusCode, 403);

    const allowedShare = await runRoute(shareResource, {
        body: { tipo: 'reunion', recurso_id: 1, username_destino: 'othertech' },
        user: users.owner
    });
    assert.equal(allowedShare.statusCode, 201);
});

test('lectura por id para rol cliente solo permite su propio cliente/reunión', async () => {
    const getCliente = getRouteHandlers(clientesRouter, 'get', '/:id');
    const getReunion = getRouteHandlers(reunionesRouter, 'get', '/:id');

    const allowedCliente = await runRoute(getCliente, { params: { id: '1' }, user: users.cliente });
    assert.equal(allowedCliente.statusCode, 200);

    const deniedCliente = await runRoute(getCliente, { params: { id: '2' }, user: users.cliente });
    assert.equal(deniedCliente.statusCode, 403);

    const allowedReunion = await runRoute(getReunion, { params: { id: '1' }, user: users.cliente });
    assert.equal(allowedReunion.statusCode, 200);

    const deniedReunion = await runRoute(getReunion, { params: { id: '2' }, user: users.cliente });
    assert.equal(deniedReunion.statusCode, 403);
});
