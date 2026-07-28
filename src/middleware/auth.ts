import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export type AuthSource = 'x-api-key' | 'x-pgc-key' | 'bearer' | null;

export interface ExtractedCredential {
  token: string | null;
  source: AuthSource;
}

/**
 * Reusable helper to extract API credentials from incoming request headers.
 * Priority order:
 * 1. x-api-key (Standard for watsonx Orchestrate)
 * 2. x-pgc-key / X-PGC-KEY (Legacy custom client support)
 * 3. Authorization: Bearer <token> (Standard Bearer token header)
 */
export function extractApiCredential(req: Request): ExtractedCredential {
  // 1. Check x-api-key header
  const xApiKey = req.headers['x-api-key'];
  if (xApiKey) {
    const token = Array.isArray(xApiKey) ? xApiKey[0] : xApiKey;
    if (token && token.trim()) {
      return { token: token.trim(), source: 'x-api-key' };
    }
  }

  // 2. Check x-pgc-key header (Express normalizes header keys to lowercase)
  const xPgcKey = req.headers['x-pgc-key'];
  if (xPgcKey) {
    const token = Array.isArray(xPgcKey) ? xPgcKey[0] : xPgcKey;
    if (token && token.trim()) {
      return { token: token.trim(), source: 'x-pgc-key' };
    }
  }

  // 3. Check Authorization: Bearer <token> header
  const authHeader = req.headers['authorization'];
  if (authHeader && typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1] && match[1].trim()) {
      return { token: match[1].trim(), source: 'bearer' };
    }
  }

  return { token: null, source: null };
}

/**
 * Express middleware enforcing API key authentication.
 * Accepts x-api-key, X-PGC-KEY, or Authorization Bearer credentials consistently.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const { token, source } = extractApiCredential(req);

  const expectedKey = config.pgcApiKey;

  if (!token || token !== expectedKey) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API credentials were not provided.',
    });
    return;
  }

  // Non-production debug logging & response header
  if (process.env.NODE_ENV !== 'production') {
    if (source) {
      res.setHeader('X-Auth-Mode', source);
      console.log(`[Auth Debug] Request authorized via ${source}`);
    }
  }

  next();
}
