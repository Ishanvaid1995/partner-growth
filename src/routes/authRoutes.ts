import { Router, Request, Response } from 'express';
import { storageService } from '../services/storageService';

const router = Router();

/**
 * POST /api/auth/register
 * Register a new user account with name, email, and password.
 */
router.post('/api/auth/register', (req: Request, res: Response): void => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      res.status(400).json({ error: 'Bad Request', message: 'Name, email, and password are required.' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Bad Request', message: 'Password must be at least 6 characters.' });
      return;
    }

    const user = storageService.registerUser(name, email, password);
    const { passwordHash, ...userPayload } = user;
    res.status(201).json({ user: userPayload, token: user.id });
  } catch (err: any) {
    res.status(400).json({ error: 'Registration Failed', message: err?.message || 'Failed to register user.' });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user credentials.
 */
router.post('/api/auth/login', (req: Request, res: Response): void => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'Bad Request', message: 'Email and password are required.' });
      return;
    }

    const user = storageService.authenticateUser(email, password);
    const { passwordHash, ...userPayload } = user;
    res.status(200).json({ user: userPayload, token: user.id });
  } catch (err: any) {
    res.status(401).json({ error: 'Authentication Failed', message: err?.message || 'Invalid email or password.' });
  }
});

/**
 * GET /api/auth/me
 * Retrieve profile of authenticated user via Authorization or x-user-id header.
 */
router.get('/api/auth/me', (req: Request, res: Response): void => {
  const userId = (req.headers['x-user-id'] || req.headers['authorization']?.replace('Bearer ', '')) as string;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized', message: 'User token header missing.' });
    return;
  }

  const user = storageService.findUserById(userId);
  if (!user) {
    res.status(404).json({ error: 'Not Found', message: 'User profile not found.' });
    return;
  }

  const { passwordHash, ...userPayload } = user;
  res.status(200).json(userPayload);
});

/**
 * PUT /api/auth/profile
 * Update user name, password, or theme preference.
 */
router.put('/api/auth/profile', (req: Request, res: Response): void => {
  const userId = (req.headers['x-user-id'] || req.headers['authorization']?.replace('Bearer ', '')) as string;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized', message: 'User token header missing.' });
    return;
  }

  try {
    const { name, password, theme } = req.body || {};
    const updated = storageService.updateUserProfile(userId, { name, password, theme });
    const { passwordHash, ...userPayload } = updated;
    res.status(200).json(userPayload);
  } catch (err: any) {
    res.status(400).json({ error: 'Update Failed', message: err?.message || 'Failed to update profile.' });
  }
});

export default router;
