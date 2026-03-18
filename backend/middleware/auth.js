const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'meshcarrier-secret-2024';

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'No token provided' });

  try {
    req.user = jwt.verify(header.slice(7), SECRET);
    next();
  } catch(e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    next();
  };
}

module.exports = { auth, requireRole };
