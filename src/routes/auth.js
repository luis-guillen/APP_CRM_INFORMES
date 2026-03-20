'use strict';

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { getDb }                   = require('../database/db');
const { JWT_SECRET, AUTH_COOKIE_NAME, authenticate } = require('../middleware/auth');
const { authLoginLimiter, authSensitiveLimiter }    = require('../middleware/rateLimit');
const UsuarioRepository           = require('../repositories/UsuarioRepository');

function getCookieOptions() {
    return {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge:   24 * 60 * 60 * 1000,
        path:     '/'
    };
}

// ----------------------------------------------------------------
// POST /api/auth/login
// ----------------------------------------------------------------
router.post('/login', authLoginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son requeridos' });

        const db   = await getDb();
        const repo = new UsuarioRepository(db);
        const user = repo.getByEmail(email);

        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const token = jwt.sign({ userId: user.id, email: user.email, rol: user.rol }, JWT_SECRET, { expiresIn: '24h' });

        res.cookie(AUTH_COOKIE_NAME, token, getCookieOptions());
        res.json({ user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, cliente_id: user.cliente_id } });
    } catch (err) {
        console.error('Error en login:', err);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});

// ----------------------------------------------------------------
// GET /api/auth/me
// ----------------------------------------------------------------
router.get('/me', authenticate, (req, res) => {
    res.json({ user: req.user });
});

// ----------------------------------------------------------------
// POST /api/auth/logout
// ----------------------------------------------------------------
router.post('/logout', (req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, { path: '/', sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    res.json({ message: 'Sesión cerrada' });
});

// ----------------------------------------------------------------
// POST /api/auth/change-password
// ----------------------------------------------------------------
router.post('/change-password', authenticate, authSensitiveLimiter, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
        if (newPassword.length < 6) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });

        const db    = await getDb();
        const repo  = new UsuarioRepository(db);
        const user  = repo.getPasswordHash(req.user.id);

        if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
            return res.status(401).json({ error: 'Contraseña actual incorrecta' });
        }

        repo.updatePassword(req.user.id, bcrypt.hashSync(newPassword, 10));
        res.json({ message: 'Contraseña actualizada correctamente' });
    } catch (err) {
        console.error('Error al cambiar contraseña:', err);
        res.status(500).json({ error: 'Error al cambiar contraseña' });
    }
});

module.exports = router;
