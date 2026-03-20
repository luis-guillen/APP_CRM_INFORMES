const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'persistence-test-secret-key-1234567890123456';
process.env.REKER_DB_PATH = path.resolve(__dirname, '../tmp/persistence-transactional-test.db');

const { getDb, resetDbForTests } = require('../src/database/db');
const authRouter = require('../src/routes/auth');
const clientesRouter = require('../src/routes/clientes');
const reunionesRouter = require('../src/routes/reuniones');
const informesRouter = require('../src/routes/informes');

function getRouteHandlers(router, method, routePath) {
    const layer = router.stack.find((item) => item.route && item.route.path === routePath && item.route.methods[method]);
    assert.ok(layer, `No se encontró la ruta ${method.toUpperCase()} ${routePath}`);
    return layer.route.stack.map((routeLayer) => routeLayer.handle);
}

function createResponse() {
    return {
        statusCode: 200,
        body: null,
        cookiesSet: [],
        headers: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        setHeader(name, value) {
            this.headers[String(name).toLowerCase()] = value;
            return this;
        },
        json(payload) {
            this.body = payload;
            this.sent = true;
            return this;
        },
        cookie(name, value, options) {
            this.cookiesSet.push({ name, value, options });
            return this;
        }
    };
}

async function runHandlers(handlers, req, res) {
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
}

async function seedBaseSchemaAndUsers() {
    const dbPath = process.env.REKER_DB_PATH;
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }

    resetDbForTests();
    const db = await getDb();
    const schema = fs.readFileSync(path.resolve(__dirname, '../src/database/schema.sql'), 'utf8');
    db.exec(schema);

    const adminPassword = bcrypt.hashSync('secret123', 10);
    const techPassword = bcrypt.hashSync('secret123', 10);

    db.prepare(`
        INSERT INTO usuarios (id, nombre, email, username, password_hash, rol, activo)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(1, 'Admin Persist', 'admin.persist@test.local', 'adminpersist', adminPassword, 'admin');

    db.prepare(`
        INSERT INTO usuarios (id, nombre, email, username, password_hash, rol, activo)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(2, 'Tech Persist', 'tech.persist@test.local', 'techpersist', techPassword, 'tecnico');
}

test.before(async () => {
    await seedBaseSchemaAndUsers();
});

test.after(() => {
    resetDbForTests();
    const dbPath = process.env.REKER_DB_PATH;
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }
});

test('transacciones reales: rollback y commit persisten correctamente tras reinicio', async () => {
    const db = await getDb();

    const insertClienteTx = db.transaction((empresa, shouldFail) => {
        db.prepare('INSERT INTO clientes (empresa, persona_contacto, creado_por) VALUES (?, ?, ?)').run(empresa, 'Persona TX', 1);
        if (shouldFail) {
            throw new Error('force rollback');
        }
    });

    assert.throws(() => insertClienteTx('Cliente Rollback', true), /force rollback/);

    const rollbackRow = db.prepare('SELECT * FROM clientes WHERE empresa = ?').get('Cliente Rollback');
    assert.equal(rollbackRow, undefined);

    insertClienteTx('Cliente Commit', false);
    const committedBeforeRestart = db.prepare('SELECT * FROM clientes WHERE empresa = ?').get('Cliente Commit');
    assert.ok(committedBeforeRestart);

    resetDbForTests();
    const reopened = await getDb();
    const committedAfterRestart = reopened.prepare('SELECT * FROM clientes WHERE empresa = ?').get('Cliente Commit');
    assert.ok(committedAfterRestart, 'El registro committed debe existir tras reinicio');
});

test('flujo funcional login + clientes + reuniones + informes sigue operativo con nueva persistencia', async () => {
    const loginHandlers = getRouteHandlers(authRouter, 'post', '/login');
    const createClienteHandlers = getRouteHandlers(clientesRouter, 'post', '/');
    const getClienteHandlers = getRouteHandlers(clientesRouter, 'get', '/:id');
    const createReunionHandlers = getRouteHandlers(reunionesRouter, 'post', '/');
    const previewInformeHandlers = getRouteHandlers(informesRouter, 'get', '/:reunionId/preview');

    const loginReq = {
        body: { email: 'admin.persist@test.local', password: 'secret123' },
        headers: {},
        ip: '203.0.113.5'
    };
    const loginRes = createResponse();
    await runHandlers(loginHandlers, loginReq, loginRes);
    assert.equal(loginRes.statusCode, 200);
    assert.ok(loginRes.body?.user?.id === 1);
    assert.ok(loginRes.cookiesSet.length > 0);

    const adminUser = { id: 1, nombre: 'Admin Persist', email: 'admin.persist@test.local', rol: 'admin', cliente_id: null };

    const createClienteReq = {
        body: {
            empresa: 'Cliente Persistencia E2E',
            persona_contacto: 'Contacto Persistente',
            email: 'contacto@persist.local'
        },
        params: {},
        user: adminUser
    };
    const createClienteRes = createResponse();
    await runHandlers(createClienteHandlers, createClienteReq, createClienteRes);
    assert.equal(createClienteRes.statusCode, 201);
    const clienteId = createClienteRes.body.id;

    const createReunionReq = {
        body: {
            cliente_id: clienteId,
            fecha_hora: '2026-03-20T10:00:00Z',
            motivo: 'Validación persistencia'
        },
        params: {},
        user: adminUser
    };
    const createReunionRes = createResponse();
    await runHandlers(createReunionHandlers, createReunionReq, createReunionRes);
    assert.equal(createReunionRes.statusCode, 201);
    const reunionId = createReunionRes.body.id;

    const previewReq = {
        params: { reunionId: String(reunionId) },
        body: {},
        user: adminUser
    };
    const previewRes = createResponse();
    await runHandlers(previewInformeHandlers, previewReq, previewRes);
    assert.equal(previewRes.statusCode, 200);
    assert.equal(previewRes.body.id, reunionId);

    resetDbForTests();
    const reopenedDb = await getDb();
    const persistedCliente = reopenedDb.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
    const persistedReunion = reopenedDb.prepare('SELECT * FROM reuniones WHERE id = ?').get(reunionId);
    assert.ok(persistedCliente);
    assert.ok(persistedReunion);

    const readClienteReq = {
        params: { id: String(clienteId) },
        body: {},
        user: adminUser
    };
    const readClienteRes = createResponse();
    await runHandlers(getClienteHandlers, readClienteReq, readClienteRes);
    assert.equal(readClienteRes.statusCode, 200);
    assert.equal(readClienteRes.body.id, clienteId);

    const reloginReq = {
        body: { email: 'admin.persist@test.local', password: 'secret123' },
        headers: {},
        ip: '203.0.113.5'
    };
    const reloginRes = createResponse();
    await runHandlers(loginHandlers, reloginReq, reloginRes);
    assert.equal(reloginRes.statusCode, 200);
});
