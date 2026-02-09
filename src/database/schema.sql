-- Esquema de Base de Datos - Reker Tech Solutions
-- Sistema de Gestión de Reuniones

-- Tabla de Usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    rol TEXT CHECK(rol IN ('admin', 'tecnico', 'cliente')) NOT NULL DEFAULT 'tecnico',
    cliente_id INTEGER,
    perfil_publico INTEGER DEFAULT 0,
    activo INTEGER DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
);

-- Tabla de Clientes
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
    creado_por INTEGER,
    publico INTEGER DEFAULT 0,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Tabla de Contactos adicionales por Cliente
CREATE TABLE IF NOT EXISTS contactos_cliente (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    cargo TEXT,
    telefono TEXT,
    email TEXT,
    es_principal INTEGER DEFAULT 0,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
);

-- Tabla de Reuniones
CREATE TABLE IF NOT EXISTS reuniones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    creado_por INTEGER NOT NULL,
    codigo_referencia TEXT UNIQUE NOT NULL,
    fecha_hora DATETIME NOT NULL,
    lugar TEXT,
    motivo TEXT,
    autor_documento TEXT,
    publico INTEGER DEFAULT 0,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Tabla de Asistentes a Reuniones
CREATE TABLE IF NOT EXISTS asistentes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reunion_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    cargo TEXT,
    tipo TEXT CHECK(tipo IN ('cliente', 'reker')) NOT NULL,
    FOREIGN KEY (reunion_id) REFERENCES reuniones(id) ON DELETE CASCADE
);

-- Tabla de Resúmenes Ejecutivos
CREATE TABLE IF NOT EXISTS resumenes_ejecutivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reunion_id INTEGER UNIQUE NOT NULL,
    sintesis TEXT,
    FOREIGN KEY (reunion_id) REFERENCES reuniones(id) ON DELETE CASCADE
);

-- Tabla de Necesidades del Cliente
CREATE TABLE IF NOT EXISTS necesidades_cliente (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reunion_id INTEGER UNIQUE NOT NULL,
    solicitud_explicita TEXT,
    objetivo_negocio TEXT,
    FOREIGN KEY (reunion_id) REFERENCES reuniones(id) ON DELETE CASCADE
);

-- Tabla de Situación Actual
CREATE TABLE IF NOT EXISTS situacion_actual (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reunion_id INTEGER UNIQUE NOT NULL,
    proceso_actual TEXT,
    equipos_instalados TEXT,
    limitaciones_problemas TEXT,
    FOREIGN KEY (reunion_id) REFERENCES reuniones(id) ON DELETE CASCADE
);

-- Tabla de Anexos
CREATE TABLE IF NOT EXISTS anexos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reunion_id INTEGER NOT NULL,
    tipo TEXT CHECK(tipo IN ('documento', 'fotografia', 'nota')) NOT NULL,
    nombre_archivo TEXT,
    ruta_archivo TEXT,
    descripcion TEXT,
    subido_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reunion_id) REFERENCES reuniones(id) ON DELETE CASCADE
);

-- Índices para optimización
CREATE INDEX IF NOT EXISTS idx_reuniones_cliente ON reuniones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_reuniones_fecha ON reuniones(fecha_hora);
CREATE INDEX IF NOT EXISTS idx_asistentes_reunion ON asistentes(reunion_id);
CREATE INDEX IF NOT EXISTS idx_anexos_reunion ON anexos(reunion_id);

-- Tabla de Compartidos
CREATE TABLE IF NOT EXISTS compartidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT CHECK(tipo IN ('cliente', 'reunion')) NOT NULL,
    recurso_id INTEGER NOT NULL,
    compartido_por INTEGER NOT NULL,
    compartido_con INTEGER NOT NULL,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (compartido_por) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (compartido_con) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_compartidos_con ON compartidos(compartido_con);
CREATE INDEX IF NOT EXISTS idx_compartidos_por ON compartidos(compartido_por);
