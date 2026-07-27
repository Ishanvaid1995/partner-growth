import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Middleware enforcing API key authentication via the 'X-PGC-KEY' header.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const clientKey = req.header('X-PGC-KEY');

  if (!clientKey || clientKey !== config.pgcApiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
