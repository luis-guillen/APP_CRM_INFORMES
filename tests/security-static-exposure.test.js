const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../src/app');
const informesRouter = require('../src/routes/informes');

test('no expone /uploads ni /reports por express.static', () => {
    const app = createApp((req, res, next) => next());
    const staticLayers = app._router.stack.filter((layer) => layer.name === 'serveStatic');

    assert.ok(staticLayers.length > 0, 'Debe existir al menos el static de /public');

    const staticRegexes = staticLayers.map((layer) => String(layer.regexp));
    assert.ok(
        staticRegexes.every((value) => !value.includes('/uploads') && !value.includes('/reports')),
        'No debe haber middleware static montado en /uploads ni /reports'
    );
});

test('bloquea acceso HTTP directo a /uploads y /reports', () => {
    const app = createApp((req, res, next) => next());
    const blockLayer = app._router.stack.find((layer) => String(layer.regexp).includes('/uploads') && String(layer.regexp).includes('/reports'));

    assert.ok(blockLayer, 'Debe existir middleware explícito de bloqueo para /uploads y /reports');
});

test('la descarga de informes se publica en endpoint autenticado', () => {
    const firstLayer = informesRouter.stack[0];
    assert.equal(firstLayer.name, 'authenticate', 'El router de informes debe exigir autenticación global');

    const downloadLayer = informesRouter.stack.find((layer) => layer.route && layer.route.path === '/download/:filename');
    assert.ok(downloadLayer, 'Debe existir el endpoint GET /download/:filename');
    assert.equal(downloadLayer.route.methods.get, true);
});

test('resolveReportPath evita path traversal', () => {
    const { resolveReportPath } = require('../src/routes/informes');
    const valid = resolveReportPath('informe.pdf');
    assert.ok(valid, 'Debe resolver nombres válidos');
    assert.equal(valid.safeName, 'informe.pdf');
    assert.equal(valid.filePath, path.resolve(__dirname, '../reports', 'informe.pdf'));

    assert.equal(resolveReportPath('../secreto.pdf'), null);
    assert.equal(resolveReportPath('subdir/otro.pdf'), null);
    assert.equal(resolveReportPath(''), null);
});

test('frontend ya no enlaza directamente /reports como estático público', () => {
    const appJsPath = path.resolve(__dirname, '../public/js/app.js');
    const source = fs.readFileSync(appJsPath, 'utf8');
    assert.equal(source.includes('/reports/'), false);
});
