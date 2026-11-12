const rateLimit = require('express-rate-limit');

// Login: 5 tentativas a cada 15 min por IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// Register: 3 por hora por IP
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Limite de cadastros atingido. Tente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Password recovery: 3 por hora por IP
const recoveryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Muitas solicitações. Tente novamente em uma hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Geral: 1500 reqs / 15min por IP (proteção contra robôs). Era 200: o app faz ~15 chamadas por
// tela e uma pessoa navegando (ou várias na mesma rede) passava do limite e não conseguia nem
// entrar ("Request failed" no login, 12/11/2026).
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  message: { error: 'Muitos acessos em pouco tempo. Aguarde alguns minutos e tente de novo.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { loginLimiter, registerLimiter, recoveryLimiter, generalLimiter };
