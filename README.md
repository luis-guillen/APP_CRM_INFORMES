# Reker Tech Solutions - Sistema de Reuniones

Sistema web para gestión de reuniones técnicas con clientes y generación automática de informes profesionales.

## Características

- 📋 Gestión de clientes
- 📅 Registro de reuniones
- 📄 Generación automática de informes PDF/Word
- 👥 Control de usuarios y roles
- 🔐 Autenticación JWT

## Instalación Local

```bash
npm install
node src/database/init.js
npm start
```

## Variables de Entorno

- `PORT` - Puerto del servidor (default: 5001)
- `JWT_SECRET` - Clave secreta para tokens JWT
- `NODE_ENV` - Entorno (development/production)

## Credenciales por defecto

- **Email**: admin@reker.es
- **Contraseña**: admin123

## Estructura

```
├── public/          # Frontend (HTML, CSS, JS)
├── src/
│   ├── database/    # Esquema y conexión BD
│   ├── middleware/  # Autenticación JWT
│   ├── routes/      # API REST
│   └── services/    # Generadores PDF/DOCX
├── data/            # Base de datos SQLite
├── reports/         # Informes generados
└── uploads/         # Archivos adjuntos
```

## Licencia

Privado - Reker Tech Solutions © 2026
