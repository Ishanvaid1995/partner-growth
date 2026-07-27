import rateLimit from 'express-rate-limit';

/**
 * Rate limiting middleware enforcing 50 requests per 1-minute window per IP.
 */
export const proposalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 50, // limit each IP to 50 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
