-- Migration 055 (21/10/2026): modelo "1 clube ativo + arquivados sem limite" e tipo da conta.
--   clubs.archived_at: clube arquivado = só leitura (histórico e relatórios), some do seletor
--     e NÃO conta no limite features.max_clubs (+ subscriptions.extra_club_slots).
--   workspaces.tipo: 'clube' (clube/escolinha) ou 'comissao' (comissão técnica). NULL = não informado
--     (conta antiga) → textos tratam como clube. Só muda textos; o preço é o mesmo.
-- Só ADD: nenhuma linha é alterada.
BEGIN;

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_clubs_workspace_ativos ON clubs (workspace_id) WHERE archived_at IS NULL;

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS tipo VARCHAR(20);
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_tipo_check;
ALTER TABLE workspaces ADD CONSTRAINT workspaces_tipo_check CHECK (tipo IS NULL OR tipo IN ('clube', 'comissao'));

COMMIT;
