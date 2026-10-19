-- Migration 050 (19/10/2026): formação tática por jogo + vaga de cada titular no campo.
-- A posição cadastrada do atleta deixa de decidir onde ele aparece: quem decide é a vaga.
-- Só adição, nullable. Jogos antigos ficam com formation/slot NULL (o app usa a formação
-- padrão da modalidade e mostra os titulares como "sem vaga").

BEGIN;

ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS formation VARCHAR(16);

ALTER TABLE match_players
  ADD COLUMN IF NOT EXISTS slot SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'match_players_slot_check'
  ) THEN
    ALTER TABLE match_players
      ADD CONSTRAINT match_players_slot_check CHECK (slot IS NULL OR (slot >= 0 AND slot < 16));
  END IF;
END $$;

-- Uma vaga por jogo.
CREATE UNIQUE INDEX IF NOT EXISTS match_players_session_slot_uniq
  ON match_players (session_id, slot) WHERE slot IS NOT NULL;

COMMIT;
