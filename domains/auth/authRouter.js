/**
 * Auth Domain – Router
 *
 * Handles login and logout. Uses express-session to persist the logged-in
 * user across requests. No roles or access restrictions are enforced.
 */

const express = require('express');
const userService = require('../../services/userService');

function createAuthRouter() {
  const router = express.Router();

  /**
   * POST /api/auth/login
   * Body: { username, password }
   * Returns the logged-in user (without password) or 401.
   */
  router.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const user = userService.login(username, password);
    if (!user) {
      return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
    }

    // Store in session
    req.session.user = user;
    res.json({ user });
  });

  /**
   * POST /api/auth/logout
   * Destroys the session.
   */
  router.post('/api/auth/logout', (req, res) => {
    req.session.destroy(err => {
      if (err) {
        return res.status(500).json({ error: 'Failed to log out' });
      }
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });

  /**
   * GET /api/auth/me
   * Returns the currently logged-in user, or 401.
   */
  router.get('/api/auth/me', (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Not logged in' });
    }
    res.json({ user: req.session.user });
  });

  return router;
}

module.exports = { createAuthRouter };
