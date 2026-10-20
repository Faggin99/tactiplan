-- Migration 052 (20/10/2026): minutagem automática pelas substituições.
-- match_players.minutes_played passa a ser CALCULADO (substituições/expulsão) ao salvar o jogo.
-- minutes_manual = true marca o ajuste manual explícito do usuário: o recálculo não sobrescreve.
-- Só adição. NÃO reescreve minutos de jogos antigos (o recálculo acontece quando o jogo é salvo).

BEGIN;

ALTER TABLE match_players
  ADD COLUMN IF NOT EXISTS minutes_manual BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO schema_migrations (filename) VALUES ('052_minutes_manual.sql') ON CONFLICT DO NOTHING;

COMMIT;
