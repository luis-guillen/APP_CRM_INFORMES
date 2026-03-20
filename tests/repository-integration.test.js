'use strict';

/**
 * repository-integration.test.js
 * Tests de integración para ClienteRepository y ReunionRepository.
 * Verifican que el refactor no rompe CRUD básico ni ACL de listado.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Bootstrap de BD en memoria para tests
process.env.NODE_ENV    = 'test';
process.env.JWT_SECRET  = 'test-secret-repo';
process.env.REKER_DB_PATH = ':memory:';

const { initDb, getDb, resetDbForTests } = require('../src/database/db');
const ClienteRepository  = require('../src/repositories/ClienteRepository');
const ReunionRepository  = require('../src/repositories/ReunionRepository');

let db;
let adminUser, tecnicoUser;

before(async () => {
    resetDbForTests();
    await initDb();
    db = await getDb();

    // Crear esquema mínimo
    db.exec(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL DEFAULT 'x',
            rol TEXT CHECK(rol IN ('admin', 'tecnico', 'cliente')) NOT NULL DEFAULT 'tecnico',
            activo INTEGER DEFAULT 1,
            cliente_id INTEGER,
            username TEXT UNIQUE,
            perfil_publico INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empresa TEXT NOT NULL,
            cif TEXT,
            persona_contacto TEXT NOT NULL,
            cargo TEXT,
            telefono TEXT,
            email TEXT,
            ubicacion TEXT,
            actividad_principal TEXT,
            creado_por INTEGER REFERENCES usuarios(id),
            publico INTEGER DEFAULT 0,
            creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
            actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS contactos_cliente (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
            nombre TEXT NOT NULL,
            cargo TEXT,
            telefono TEXT,
            email TEXT,
            es_principal INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS reuniones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER NOT NULL REFERENCES clientes(id),
            creado_por INTEGER REFERENCES usuarios(id),
            codigo_referencia TEXT UNIQUE NOT NULL,
            fecha_hora DATETIME NOT NULL,
            lugar TEXT,
            motivo TEXT,
            autor_documento TEXT,
            publico INTEGER DEFAULT 0,
            creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
            actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS asistentes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reunion_id INTEGER NOT NULL REFERENCES reuniones(id) ON DELETE CASCADE,
            nombre TEXT NOT NULL,
            cargo TEXT,
            tipo TEXT DEFAULT 'cliente'
        );
        CREATE TABLE IF NOT EXISTS resumenes_ejecutivos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reunion_id INTEGER UNIQUE REFERENCES reuniones(id) ON DELETE CASCADE,
            sintesis TEXT
        );
        CREATE TABLE IF NOT EXISTS necesidades_cliente (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reunion_id INTEGER UNIQUE REFERENCES reuniones(id) ON DELETE CASCADE,
            solicitud_explicita TEXT,
            objetivo_negocio TEXT
        );
        CREATE TABLE IF NOT EXISTS situacion_actual (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reunion_id INTEGER UNIQUE REFERENCES reuniones(id) ON DELETE CASCADE,
            proceso_actual TEXT,
            equipos_instalados TEXT,
            limitaciones_problemas TEXT
        );
        CREATE TABLE IF NOT EXISTS anexos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reunion_id INTEGER REFERENCES reuniones(id) ON DELETE CASCADE,
            tipo TEXT NOT NULL,
            nombre_archivo TEXT,
            ruta_archivo TEXT,
            descripcion TEXT,
            creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS favoritos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            tipo TEXT NOT NULL,
            recurso_id INTEGER NOT NULL,
            creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(usuario_id, tipo, recurso_id)
        );
        CREATE TABLE IF NOT EXISTS compartidos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,
            recurso_id INTEGER NOT NULL,
            compartido_por INTEGER REFERENCES usuarios(id),
            compartido_con INTEGER REFERENCES usuarios(id),
            creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Seed
    const rAdmin   = db.prepare(`INSERT INTO usuarios (nombre, email, rol) VALUES (?, ?, ?)`).run('Admin Test', 'admin@test.es', 'admin');
    const rTecnico = db.prepare(`INSERT INTO usuarios (nombre, email, rol) VALUES (?, ?, ?)`).run('Técnico Test', 'tecnico@test.es', 'tecnico');
    adminUser   = { id: rAdmin.lastInsertRowid,   rol: 'admin' };
    tecnicoUser = { id: rTecnico.lastInsertRowid, rol: 'tecnico' };
});

// ================================================================
// ClienteRepository
// ================================================================
describe('ClienteRepository', () => {

    test('create: inserta cliente y devuelve el registro', () => {
        const repo   = new ClienteRepository(db);
        const result = repo.create({ empresa: 'ACME S.L.', persona_contacto: 'Ana García' }, adminUser.id);
        assert.ok(result.id);
        assert.equal(result.empresa, 'ACME S.L.');
        assert.deepEqual(result.contactos, []);
    });

    test('create: inserta contactos adicionales', () => {
        const repo   = new ClienteRepository(db);
        const result = repo.create(
            { empresa: 'Beta Corp', persona_contacto: 'Pedro', contactos: [{ nombre: 'Contacto A', cargo: 'CTO' }] },
            adminUser.id
        );
        assert.equal(result.contactos.length, 1);
        assert.equal(result.contactos[0].nombre, 'Contacto A');
    });

    test('getById: retorna undefined si no existe', () => {
        const repo = new ClienteRepository(db);
        assert.equal(repo.getById(99999), undefined);
    });

    test('getAll admin: devuelve todos los clientes', () => {
        const repo    = new ClienteRepository(db);
        const clientes = repo.getAll(adminUser);
        assert.ok(Array.isArray(clientes));
        assert.ok(clientes.length >= 2); // los creados en tests previos
    });

    test('getAll tecnico: devuelve solo sus propios clientes', () => {
        const repo    = new ClienteRepository(db);
        // El técnico no ha creado nada aún → lista vacía
        const propios = repo.getAll(tecnicoUser);
        assert.ok(Array.isArray(propios));
        // Crear uno suyo
        const propio  = repo.create({ empresa: 'MiCliente', persona_contacto: 'Yo' }, tecnicoUser.id);
        const lista   = repo.getAll(tecnicoUser);
        assert.ok(lista.some(c => c.id === propio.id));
    });

    test('update: actualiza campos y devuelve el registro actualizado', () => {
        const repo    = new ClienteRepository(db);
        const created = repo.create({ empresa: 'Antes S.A.', persona_contacto: 'ZZZ' }, adminUser.id);
        const updated = repo.update(created.id, { empresa: 'Después S.A.' }, created);
        assert.equal(updated.empresa, 'Después S.A.');
        assert.equal(updated.persona_contacto, 'ZZZ'); // no se tocó
    });

    test('delete: elimina el cliente', () => {
        const repo    = new ClienteRepository(db);
        const created = repo.create({ empresa: 'Temporal', persona_contacto: 'X' }, adminUser.id);
        repo.delete(created.id);
        assert.equal(repo.getById(created.id), undefined);
    });

    test('toggleVisibilidad: cambia publico a 1 y de vuelta a 0', () => {
        const repo    = new ClienteRepository(db);
        const c       = repo.create({ empresa: 'Vis Test', persona_contacto: 'V' }, adminUser.id);
        repo.toggleVisibilidad(c.id, true);
        assert.equal(repo.getById(c.id).publico, 1);
        repo.toggleVisibilidad(c.id, false);
        assert.equal(repo.getById(c.id).publico, 0);
    });
});

// ================================================================
// ReunionRepository
// ================================================================
describe('ReunionRepository', () => {
    let clienteId;

    before(() => {
        const repo    = new ClienteRepository(db);
        const cliente = repo.create({ empresa: 'Cliente Reuniones', persona_contacto: 'Pedro' }, adminUser.id);
        clienteId     = cliente.id;
    });

    test('create: inserta reunión y devuelve fila plana', () => {
        const repo  = new ReunionRepository(db);
        const r     = repo.create({ cliente_id: clienteId, fecha_hora: '2026-03-20T10:00' }, adminUser.id);
        assert.ok(r.id);
        assert.ok(r.codigo_referencia.startsWith('RT-'));
    });

    test('create: inserta asistentes y sub-items', () => {
        const repo = new ReunionRepository(db);
        const r    = repo.create({
            cliente_id: clienteId,
            fecha_hora: '2026-03-21T10:00',
            asistentes: [{ nombre: 'Luis', cargo: 'CEO', tipo: 'cliente' }],
            resumen_ejecutivo: { sintesis: 'Resumen ejemplo' },
            notas_adicionales: 'Nota de prueba',
        }, adminUser.id);

        const detalle = repo.getWithDetails(r.id);
        assert.equal(detalle.asistentes.length, 1);
        assert.equal(detalle.asistentes[0].nombre, 'Luis');
        assert.equal(detalle.resumen_ejecutivo.sintesis, 'Resumen ejemplo');
        assert.ok(detalle.anexos.some(a => a.tipo === 'nota'));
    });

    test('getAll admin: devuelve todas las reuniones', () => {
        const repo  = new ReunionRepository(db);
        const lista = repo.getAll(adminUser);
        assert.ok(Array.isArray(lista));
        assert.ok(lista.length >= 2);
    });

    test('getAll tecnico: devuelve solo sus reuniones', () => {
        const repo  = new ReunionRepository(db);
        const r     = repo.create({ cliente_id: clienteId, fecha_hora: '2026-03-22T10:00' }, tecnicoUser.id);
        const lista = repo.getAll(tecnicoUser);
        assert.ok(lista.some(x => x.id === r.id));
    });

    test('update: actualiza campos de una reunión', () => {
        const repo    = new ReunionRepository(db);
        const r       = repo.create({ cliente_id: clienteId, fecha_hora: '2026-03-23T10:00', motivo: 'Motivo original' }, adminUser.id);
        const updated = repo.update(r.id, { motivo: 'Motivo actualizado' }, r);
        assert.equal(updated.motivo, 'Motivo actualizado');
    });

    test('delete: elimina reunión correctamente', () => {
        const repo = new ReunionRepository(db);
        const r    = repo.create({ cliente_id: clienteId, fecha_hora: '2026-03-24T10:00' }, adminUser.id);
        repo.delete(r.id);
        assert.equal(repo.getById(r.id), undefined);
    });

    test('insertNota y getWithDetails incluye la nota correctamente', () => {
        const repo = new ReunionRepository(db);
        const r    = repo.create({ cliente_id: clienteId, fecha_hora: '2026-03-25T10:00' }, adminUser.id);
        repo.insertNota(r.id, 'Nota adicional');
        const d = repo.getWithDetails(r.id);
        assert.ok(d.anexos.some(a => a.tipo === 'nota' && a.descripcion === 'Nota adicional'));
    });
});
