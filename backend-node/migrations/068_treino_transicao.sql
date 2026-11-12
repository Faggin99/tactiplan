-- 12/11/2026: TREINO DE TRANSIÇÃO (atletas voltando do DM têm treino próprio). Período de treino marcado
-- como transição: aparece na Programação ("Manhã · Transição") e NÃO entra nas estatísticas do grupo
-- (como a avaliação). Só ADD; vale só quando session_type = 'training'.
ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS treino_transicao BOOLEAN NOT NULL DEFAULT false;
