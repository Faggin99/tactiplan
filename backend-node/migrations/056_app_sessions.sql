-- Migration 056 (21/10/2026): sessões do APP NATIVO (BFF /api/app/*) e aparelhos para push.
--   app_sessions: token próprio do app (opaco, "tpa_…"), guardado só como SHA-256. Revogável
--     (revoked_at) e com expiração longa e deslizante (expires_at renova com o uso). O JWT de
--     7 dias do web não muda.
--   app_push_devices: token de push do aparelho (FCM/APNs). Só guardado: nada é enviado ainda.
-- Só ADD: nenhuma linha existente é alterada.
BEGIN;

CREATE TABLE IF NOT EXISTS app_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    CHAR(64) NOT NULL UNIQUE,
  metodo        VARCHAR(10) NOT NULL CHECK (metodo IN ('senha', 'google', 'apple')),
  plataforma    VARCHAR(10) CHECK (plataforma IS NULL OR plataforma IN ('ios', 'android')),
  aparelho      VARCHAR(120),
  versao_app    VARCHAR(20),
  ip            VARCHAR(64),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_app_sessions_user_ativas ON app_sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS app_push_devices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id  UUID REFERENCES app_sessions(id) ON DELETE SET NULL,
  plataforma  VARCHAR(10) NOT NULL CHECK (plataforma IN ('ios', 'android')),
  token       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_push_devices_user ON app_push_devices (user_id);

COMMIT;
