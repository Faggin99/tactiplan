-- 23/11/2026: ARQUIVOS DA SEMANA (microciclo). Material da comissão (planilhas, PDFs, vídeos, fotos) ligado à semana,
-- não a uma atividade. NÃO entram em nenhuma conta (estatísticas, relatórios, minutos). Só ADD.
CREATE TABLE IF NOT EXISTS training_microcycle_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  microcycle_id UUID NOT NULL REFERENCES training_microcycles(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title         VARCHAR(255),
  file_path     TEXT NOT NULL,
  file_name     VARCHAR(255),
  file_size     BIGINT,
  mime_type     VARCHAR(120),
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_microcycle_files_mc ON training_microcycle_files(microcycle_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON training_microcycle_files TO sports_admin;
