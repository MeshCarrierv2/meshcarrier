const router = require('express').Router();
const db     = require('../db');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'meshcarrier-secret-2024';

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await db.queryOne('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.password_hash) return res.status(401).json({ error: 'Account not set up' });
    if (user.status !== 'active') return res.status(403).json({ error: 'Account suspended' });

    const valid = bcrypt.compareSync(String(password), String(user.password_hash));
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    await db.execute('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.full_name },
      SECRET, { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.full_name, full_name: user.full_name } });
  } catch(e) {
    console.error('Login error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
