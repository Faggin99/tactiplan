-- 065: análise do jogo em VÍDEO (03/11/2026). O treinador abre o vídeo do jogo no computador (o arquivo NÃO
-- sobe ao servidor) e marca lances com tags; aqui ficam só os lances, as tags do clube e os marcos do vídeo.
-- Aplicar com: psql -v ON_ERROR_STOP=1 -f 065_analise_video.sql
BEGIN;

-- Conjunto de tags do clube (sem linhas = tags padrão do código)
CREATE TABLE IF NOT EXISTS video_tags (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  club_id      UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  nome         VARCHAR(40) NOT NULL,
  cor          VARCHAR(7) NOT NULL,
  ordem        SMALLINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_video_tags_club ON video_tags(club_id);

-- Lances marcados no vídeo de um jogo
CREATE TABLE IF NOT EXISTS match_video_clips (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  tag_nome     VARCHAR(40) NOT NULL,
  tag_cor      VARCHAR(7) NOT NULL,
  equipe       VARCHAR(10) CHECK (equipe IN ('nosso', 'adversario')),
  athlete_id   UUID REFERENCES athletes(id) ON DELETE SET NULL,
  adv_numero   SMALLINT,
  adv_nome     VARCHAR(80),
  inicio_ms    INTEGER NOT NULL CHECK (inicio_ms >= 0),
  fim_ms       INTEGER NOT NULL,
  observacao   VARCHAR(300),
  lancado      BOOLEAN NOT NULL DEFAULT false, -- já virou evento do jogo (gol/cartão)
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fim_ms > inicio_ms)
);
CREATE INDEX IF NOT EXISTS idx_match_video_clips_session ON match_video_clips(session_id);
CREATE INDEX IF NOT EXISTS idx_match_video_clips_athlete ON match_video_clips(athlete_id) WHERE athlete_id IS NOT NULL;

-- Marcos do vídeo do jogo: nome do arquivo e onde começa cada tempo (converte tempo do vídeo em minuto do jogo)
CREATE TABLE IF NOT EXISTS match_video_meta (
  session_id   UUID PRIMARY KEY REFERENCES training_sessions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  arquivo_nome VARCHAR(200),
  duracao_ms   INTEGER,
  inicio1_ms   INTEGER,
  inicio2_ms   INTEGER,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE video_tags OWNER TO sports_admin;
ALTER TABLE match_video_clips OWNER TO sports_admin;
ALTER TABLE match_video_meta OWNER TO sports_admin;
GRANT SELECT ON video_tags, match_video_clips, match_video_meta TO admin_ro;

INSERT INTO schema_migrations (filename) VALUES ('065_analise_video.sql') ON CONFLICT DO NOTHING;

COMMIT;
