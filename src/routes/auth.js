const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');
const { JWT_SECRET, authenticate } = require('../middleware/auth');

// POST /api/auth/login - Iniciar sesión
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña son requeridos' });
        }

        const db = await getDb();
        const user = db.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').get(email);

        if (!user) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const validPassword = bcrypt.compareSync(password, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email, rol: user.rol },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                nombre: user.nombre,
                email: user.email,
                rol: user.rol,
                cliente_id: user.cliente_id
            }
        });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});

// GET /api/auth/me - Obtener usuario actual
router.get('/me', authenticate, (req, res) => {
    res.json({ user: req.user });
});

// POST /api/auth/change-password - Cambiar contraseña
router.post('/change-password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
        }

        const db = await getDb();
        const user = db.prepare('SELECT password_hash FROM usuarios WHERE id = ?').get(req.user.id);

        if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
            return res.status(401).json({ error: 'Contraseña actual incorrecta' });
        }

        const newHash = bcrypt.hashSync(newPassword, 10);
        db.prepare('UPDATE usuarios SET password_hash = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?').run(newHash, req.user.id);
        db.save();

        res.json({ message: 'Contraseña actualizada correctamente' });
    } catch (error) {
        console.error('Error al cambiar contraseña:', error);
        res.status(500).json({ error: 'Error al cambiar contraseña' });
    }
});

module.exports = router;
