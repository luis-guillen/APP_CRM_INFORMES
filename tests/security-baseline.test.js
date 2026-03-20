const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { createApp } = require('../src/app');
const authRouter = require('../src/routes/auth');
const {
    resolveJwtSecret,
    resolveBootstrapAdminPassword,
    isWeakJwtSecret
} = require('../src/services/securityConfig');
const {
    validateUploadedFiles,
    MAX_UPLOAD_SIZE_BYTES
} = require('../src/services/uploadValidation');
const { applySecurityHeaders } = require('../src/middleware/securityHeaders');

function getRouteHandlers(router, method, routePath) {
    const layer = router.stack.find((item) => item.route && item.route.path === routePath && item.route.methods[method]);
    assert.ok(layer, `No se encontró la ruta ${method.toUpperCase()} ${routePath}`);
    return layer.route.stack.map((routeLayer) => routeLayer.handle);
}

function createResponse() {
    return {
        statusCode: 200,
        body: null,
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

const uploadTmpDir = path.resolve(__dirname, '../tmp/upload-security-tests');

test.before(() => {
    fs.mkdirSync(uploadTmpDir, { recursive: true });
});

test.after(() => {
    if (fs.existsSync(uploadTmpDir)) {
        fs.rmSync(uploadTmpDir, { recursive: true, force: true });
    }
});

test('JWT_SECRET y credenciales bootstrap se endurecen y no hay password por defecto hardcodeada', () => {
    const secureSecret = resolveJwtSecret({
        env: { JWT_SECRET: 'a'.repeat(48) },
        nodeEnv: 'production',
        logger: { warn() {} }
    });
    assert.equal(secureSecret.length, 48);

    assert.throws(() => resolveJwtSecret({
        env: { JWT_SECRET: 'admin123' },
        nodeEnv: 'production',
        logger: { warn() {} }
    }), /JWT_SECRET es obligatorio/);

    const devSecret = resolveJwtSecret({
        env: {},
        nodeEnv: 'development',
        logger: { warn() {} }
    });
    assert.equal(isWeakJwtSecret(devSecret), false);

    assert.throws(() => resolveBootstrapAdminPassword({
        env: {},
        nodeEnv: 'production',
        logger: { warn() {} }
    }), /DEFAULT_ADMIN_PASSWORD es obligatorio/);

    const devPassword = resolveBootstrapAdminPassword({
        env: {},
        nodeEnv: 'development',
        logger: { warn() {} }
    });
    assert.ok(devPassword.length >= 16);

    const serverSource = fs.readFileSync(path.resolve(__dirname, '../src/server.js'), 'utf8');
    const initSource = fs.readFileSync(path.resolve(__dirname, '../src/database/init.js'), 'utf8');
    assert.equal(serverSource.includes('admin123'), false);
    assert.equal(initSource.includes('admin123'), false);
});

test('rate limiting en login bloquea intentos repetidos desde el mismo cliente', async () => {
    const loginHandlers = getRouteHandlers(authRouter, 'post', '/login');

    let lastResponse = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
        const req = {
            body: {},
            headers: {},
            ip: '198.51.100.10'
        };
        const res = createResponse();
        await runHandlers(loginHandlers, req, res);
        lastResponse = res;
    }

    assert.equal(lastResponse.statusCode, 429);
    assert.match(lastResponse.body.error, /Demasiados intentos de inicio de sesión/);
    assert.ok(lastResponse.headers['retry-after']);
});

test('aplica CSP y cabeceras de seguridad HTTP en respuestas de la app', async () => {
    const app = createApp();
    const firstMiddleware = app._router.stack.find((layer) => layer.name === 'applySecurityHeaders');
    assert.ok(firstMiddleware, 'La app debe registrar el middleware de cabeceras de seguridad');

    const headers = {};
    const req = { headers: {} };
    const res = {
        removeHeader(name) {
            delete headers[name.toLowerCase()];
        },
        setHeader(name, value) {
            headers[name.toLowerCase()] = value;
        }
    };

    await new Promise((resolve, reject) => {
        applySecurityHeaders(req, res, (err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });

    assert.match(headers['content-security-policy'], /default-src 'self'/);
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['x-frame-options'], 'DENY');
    assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.equal(headers['cross-origin-opener-policy'], 'same-origin');
    assert.equal(headers['cross-origin-resource-policy'], 'same-origin');
    assert.ok(headers['permissions-policy']);
});

test('valida MIME + extensión + firma real en adjuntos y rechaza archivos camuflados', () => {
    const goodPdfPath = path.join(uploadTmpDir, 'ok.pdf');
    const fakePdfPath = path.join(uploadTmpDir, 'bad.pdf');

    fs.writeFileSync(goodPdfPath, Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n'));
    fs.writeFileSync(fakePdfPath, Buffer.from('<html><body>malicious</body></html>'));

    const validFiles = {
        documentos: [{
            fieldname: 'documentos',
            originalname: 'informe.pdf',
            mimetype: 'application/pdf',
            size: fs.statSync(goodPdfPath).size,
            path: goodPdfPath
        }]
    };
    const valid = validateUploadedFiles(validFiles);
    assert.equal(valid.valid, true);

    const invalidFiles = {
        documentos: [{
            fieldname: 'documentos',
            originalname: 'camuflado.pdf',
            mimetype: 'application/pdf',
            size: fs.statSync(fakePdfPath).size,
            path: fakePdfPath
        }]
    };
    const invalid = validateUploadedFiles(invalidFiles);
    assert.equal(invalid.valid, false);
    assert.match(invalid.reason, /Firma\/binario/);

    const oversizedFiles = {
        documentos: [{
            fieldname: 'documentos',
            originalname: 'grande.pdf',
            mimetype: 'application/pdf',
            size: MAX_UPLOAD_SIZE_BYTES + 1,
            path: goodPdfPath
        }]
    };
    const oversized = validateUploadedFiles(oversizedFiles);
    assert.equal(oversized.valid, false);
    assert.match(oversized.reason, /Tamaño/);
});
