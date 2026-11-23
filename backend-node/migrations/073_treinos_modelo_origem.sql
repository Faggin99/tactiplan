-- 23/11/2026: sessão salva guarda de qual treino veio (data e período) para mostrar na lista. Só ADD.
ALTER TABLE treinos_modelo ADD COLUMN IF NOT EXISTS origem_session_id UUID REFERENCES training_sessions(id) ON DELETE SET NULL;
ALTER TABLE treinos_modelo ADD COLUMN IF NOT EXISTS origem_data DATE;
ALTER TABLE treinos_modelo ADD COLUMN IF NOT EXISTS origem_periodo VARCHAR(10);
