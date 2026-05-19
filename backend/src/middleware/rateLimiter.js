const rateLimit = require('express-rate-limit');

// AI endpoints: 20 requests per hour per IP
const aiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many AI requests. You are limited to 20 AI requests per hour. Please try again later.',
    retryAfter: 'See Retry-After header',
  },
  keyGenerator: (req) => req.user?.id || req.ip,
});

// General endpoints: 100 requests per 15 minutes per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. You are limited to 100 requests per 15 minutes. Please try again later.',
  },
  keyGenerator: (req) => req.user?.id || req.ip,
});

// Auth endpoints: stricter — 10 requests per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts. Please try again in 15 minutes.',
  },
});

module.exports = { aiRateLimiter, generalLimiter, authLimiter };
