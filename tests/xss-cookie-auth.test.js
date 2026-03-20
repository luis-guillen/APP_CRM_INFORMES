const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

process.env.JWT_SECRET = 'test-jwt-cookie-secret';
process.env.REKER_DB_PATH = path.resolve(__dirname, '../tmp/xss-cookie-auth-test.db');

const securityUtils = require('../public/js/security-utils.js');
const { getDb, resetDbForTests } = require('../src/database/db');
const authRouter = require('../src/routes/auth');
const { authenticate, AUTH_COOKIE_NAME } = require('../src/middleware/auth');

function createResponse() {
    return {
        statusCode: 200,
        body: null,
        cookiesSet: [],
        cookiesCleared: [],
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
        cookie(name, value, options) {
            this.cookiesSet.push({ name, value, options });
            return this;
        },
        clearCookie(name, options) {
            this.cookiesCleared.push({ name, options });
            return this;
        }
    };
}

function getRouteHandlers(router, method, routePath) {
    const layer = router.stack.find((item) => item.route && item.route.path === routePath && item.route.methods[method]);
    assert.ok(layer, `No se encontró la ruta ${method.toUpperCase()} ${routePath}`);
    return layer.route.stack.map((routeLayer) => routeLayer.handle);
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
    }
}

async function seedDatabase() {
    const dbFile = process.env.REKER_DB_PATH;
    if (fs.existsSync(dbFile)) {
        fs.unlinkSync(dbFile);
    }

    resetDbForTests();
    const db = await getDb();
    const schema = fs.readFileSync(path.resolve(__dirname, '../src/database/schema.sql'), 'utf8');
    const statements = schema.split(';').map((s) => s.trim()).filter(Boolean);
    for (const statement of statements) {
        db.exec(statement);
    }

    const passwordHash = bcrypt.hashSync('secret123', 10);
    db.prepare(`
        INSERT INTO usuarios (id, nombre, email, username, password_hash, rol, activo)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(501, 'Security Tester', 'security@test.local', 'securitytester', passwordHash, 'admin');

    db.save();
}

test.before(async () => {
    await seedDatabase();
});

test.after(() => {
    resetDbForTests();
    if (fs.existsSync(process.env.REKER_DB_PATH)) {
        fs.unlinkSync(process.env.REKER_DB_PATH);
    }
});

test('sanitizador bloquea payload XSS en HTML dinámico', () => {
    const payload = '<img src=x onerror=alert(1)><script>alert(2)</script><a href="javascript:alert(3)">x</a><p>ok</p>';
    const html = `<div class="data-card"><h3>${payload}</h3></div>`;
    const sanitized = securityUtils.sanitizeHtml(html);

    assert.equal(sanitized.includes('<script'), false);
    assert.equal(sanitized.toLowerCase().includes('onerror='), false);
    assert.equal(sanitized.toLowerCase().includes('javascript:'), false);
    assert.equal(sanitized.toLowerCase().includes('<img'), false);
    assert.equal(sanitized.includes('<p>ok</p>'), true);
});

test('frontend ya no persiste JWT en localStorage y usa credenciales same-origin', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../public/js/app.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf8');
    assert.equal(source.includes('localStorage'), false);
    assert.equal(source.includes("credentials: 'same-origin'"), true);
    assert.equal(source.includes('Authorization'), false);
    assert.equal(indexHtml.includes('/js/security-utils.js'), true);
});

test('login configura cookie httpOnly y flujo autenticado funciona sin bearer en localStorage', async () => {
    const loginHandlers = getRouteHandlers(authRouter, 'post', '/login');
    const logoutHandlers = getRouteHandlers(authRouter, 'post', '/logout');

    const loginReq = {
        body: { email: 'security@test.local', password: 'secret123' },
        headers: {}
    };
    const loginRes = createResponse();
    await runHandlers(loginHandlers, loginReq, loginRes);

    assert.equal(loginRes.statusCode, 200);
    assert.ok(loginRes.body && loginRes.body.user);
    assert.equal(Object.prototype.hasOwnProperty.call(loginRes.body, 'token'), false);
    assert.ok(loginRes.cookiesSet.length > 0);

    const authCookie = loginRes.cookiesSet.find((item) => item.name === AUTH_COOKIE_NAME);
    assert.ok(authCookie, 'El login debe establecer cookie de autenticación');
    assert.equal(authCookie.options.httpOnly, true);
    assert.equal(authCookie.options.sameSite, 'strict');

    const authReq = {
        headers: {
            cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(authCookie.value)}`
        }
    };
    const authRes = createResponse();
    let nextCalled = false;
    await authenticate(authReq, authRes, () => {
        nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(authReq.user.email, 'security@test.local');

    const logoutReq = { headers: {} };
    const logoutRes = createResponse();
    await runHandlers(logoutHandlers, logoutReq, logoutRes);
    assert.equal(logoutRes.statusCode, 200);
    assert.ok(logoutRes.cookiesCleared.find((item) => item.name === AUTH_COOKIE_NAME));
});
