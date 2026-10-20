require('dotenv').config();

// Sentry: opcional. Se SENTRY_DSN não estiver setado, vira no-op.
const Sentry = require('@sentry/node');
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.1,
  });
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const authRoutes = require('./src/routes/auth');
const clubsRoutes = require('./src/routes/clubs');
const athletesRoutes = require('./src/routes/athletes');
const microcyclesRoutes = require('./src/routes/microcycles');
const sessionsRoutes = require('./src/routes/sessions');
const activitiesRoutes = require('./src/routes/activities');
const contentsRoutes = require('./src/routes/contents');
const titlesRoutes = require('./src/routes/titles');
const gamesRoutes = require('./src/routes/games');
const statsRoutes = require('./src/routes/stats');
const playsRoutes = require('./src/routes/plays');
const themesRoutes = require('./src/routes/themes');
const filesRoutes = require('./src/routes/files');
const billingRoutes = require('./src/routes/billing');
const adminRoutes = require('./src/routes/admin');
const injuriesRoutes = require('./src/routes/injuries');
const announcementsRoutes = require('./src/routes/announcements');
const homeRoutes = require('./src/routes/home');
const categoriesRoutes = require('./src/routes/categories');
const clubMembersRoutes = require('./src/routes/clubMembers');
const workspacesRoutes = require('./src/routes/workspaces');
const competitionsRoutes = require('./src/routes/competitions');
const externalCompetitionsRoutes = require('./src/routes/externalCompetitions');
const publicStatsRoutes = require('./src/routes/publicStats');
const contaRoutes = require('./src/routes/conta'); // seletor de produtos Faggin (F3)
const reportsRoutes = require('./src/routes/reports'); // PDFs (HTML → Chromium)

const app = express();
const PORT = process.env.PORT || 3001;

// Confia no nginx (rate limiter, IP correto)
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Rotas públicas SEM auth chamadas por outros domínios (ex: landing page).
// Montadas ANTES do rate limiter genérico e do CORS middleware — o próprio
// router seta CORS manualmente pra tactiplan.faggin.com.br e tem cache de
// 10min in-memory, então não precisa da proteção de rate limit padrão.
app.use('/api/public', publicStatsRoutes);

const { generalLimiter } = require('./src/middleware/rateLimit');
app.use('/api/', generalLimiter);

const requireActiveSubscription = require('./src/middleware/requireActiveSubscription');
app.use(requireActiveSubscription);
// CORS — em produção exige lista explícita, nunca aceita '*' de fallback.
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !process.env.CORS_ORIGIN) {
  console.error('FATAL: CORS_ORIGIN ausente em produção. Defina domínios permitidos (vírgula-separados) no .env.');
  process.exit(1);
}
const allowedOrigins = (process.env.CORS_ORIGIN || '*').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const uploadDir = path.resolve(process.env.UPLOAD_DIR || '../uploads');
app.use('/uploads', express.static(uploadDir));

// IMPORTANTE: rotas com prefix específico DEVEM vir antes de qualquer mount em '/api'
// (contentsRoutes usa app.use('/api', ...) e tem authMiddleware global no router —
//  se vier antes, intercepta TUDO que começa com /api e quebra outras rotas)
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/conta', contaRoutes);
app.use('/api/clubs', clubsRoutes);
app.use('/api/athletes', athletesRoutes);
app.use('/api/microcycles', microcyclesRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/titles', titlesRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/plays', playsRoutes);
app.use('/api/themes', themesRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/workspaces', workspacesRoutes);
app.use('/api/competitions', competitionsRoutes);
app.use('/api/external', externalCompetitionsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', injuriesRoutes);
app.use('/api', announcementsRoutes);
app.use('/api', homeRoutes);
app.use('/api', categoriesRoutes);
app.use('/api', clubMembersRoutes);

// Último: pega /contents e /stages, mas tem authMiddleware global no router
// (precisa ficar depois de todas as outras rotas e do /api/health)
app.use('/api', contentsRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (process.env.SENTRY_DSN) {
    try { Sentry.captureException(err); } catch (_) {}
  }
  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

const { startBillingCleanupTimer } = require('./src/jobs/cleanupExpiredSubscriptions');
const { startTrialExpiringNotifierTimer } = require('./src/jobs/trialExpiringNotifier');
const { startPendingReconcileTimer } = require('./src/jobs/reconcilePendingSubscriptions');

app.listen(PORT, () => {
  console.log(`Sports Platform API running on port ${PORT}`);
  // Cron leve: sobe subs com cancel_at_period_end vencidas pra 'canceled' (1x/h).
  startBillingCleanupTimer();
  // Cron leve: notifica trials que expiram em 2–3 dias (1x/h).
  startTrialExpiringNotifierTimer();
  // Cron leve: reconcilia checkouts pendentes com o MP caso o webhook falhe (1x/15min).
  startPendingReconcileTimer();
});

module.exports = app;
