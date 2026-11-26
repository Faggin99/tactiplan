-- 26/11/2026 (pedido do treinador): sai a "Atividade 4" e entra "Academia" ANTES da Ativação.
-- Ordem nova: 1 Academia · 2 Ativação · 3 Atividade 1 · 4 Atividade 2 · 5 Atividade 3 · 6 Treino de goleiro.
-- Antes de renumerar, a atividade que estava na Atividade 4 é ADEQUADA:
--   a) Ativação vazia → as atividades sobem uma posição (Atividade 1 vira Ativação … Atividade 4 vira Atividade 3)
--      [caso real: Uberlândia 20/11, "Abordagem e corridas intermitentes" vira a Ativação];
--   b) Ativação preenchida e alguma Atividade 1–3 vazia → as de baixo sobem até preencher o buraco;
--   c) sem vaga: só na conta DEMO (workspace 18c87849…) a Atividade 4 é apagada; em qualquer outra conta ABORTA.
-- Mesma regra nas sessões salvas (treinos_modelo.blocos). Tudo numa transação.
BEGIN;

CREATE TEMP TABLE _cheia AS
SELECT DISTINCT b.session_id, b."order" AS o
  FROM training_activity_blocks b JOIN training_activities a ON a.block_id = b.id
 WHERE a.title_id IS NOT NULL OR a.duration_minutes > 0 OR COALESCE(a.description, '') <> ''
    OR EXISTS (SELECT 1 FROM training_activity_contents x WHERE x.activity_id = a.id);

DO $$
DECLARE
  r record; vaga int; k int; blk_de uuid; blk_para uuid;
  demo uuid := '18c87849-226d-4331-91db-e6c490078260';
BEGIN
  FOR r IN SELECT s.id, s.workspace_id FROM training_sessions s
            WHERE EXISTS (SELECT 1 FROM _cheia c WHERE c.session_id = s.id AND c.o = 5) LOOP
    -- 1ª posição livre: Ativação (1) e depois Atividade 1–3 (2..4)
    SELECT min(p) INTO vaga FROM generate_series(1, 4) p
     WHERE NOT EXISTS (SELECT 1 FROM _cheia c WHERE c.session_id = r.id AND c.o = p);
    IF vaga IS NULL THEN
      IF r.workspace_id <> demo THEN RAISE EXCEPTION 'Treino % (conta %) sem vaga para a Atividade 4', r.id, r.workspace_id; END IF;
      DELETE FROM training_activities a USING training_activity_blocks b
       WHERE a.block_id = b.id AND b.session_id = r.id AND b."order" = 5;
      CONTINUE;
    END IF;
    -- linhas em branco (sem nada e sem anexo) nas posições que vão receber atividade saem do caminho
    DELETE FROM training_activities a USING training_activity_blocks b
     WHERE a.block_id = b.id AND b.session_id = r.id AND b."order" BETWEEN vaga AND 5
       AND NOT EXISTS (SELECT 1 FROM _cheia c WHERE c.session_id = r.id AND c.o = b."order")
       AND NOT EXISTS (SELECT 1 FROM training_activity_files f WHERE f.activity_id = a.id);
    -- sobe uma posição, de cima para baixo (o destino já está vazio)
    FOR k IN vaga .. 4 LOOP
      SELECT id INTO blk_para FROM training_activity_blocks WHERE session_id = r.id AND "order" = k ORDER BY id LIMIT 1;
      SELECT id INTO blk_de FROM training_activity_blocks WHERE session_id = r.id AND "order" = k + 1 ORDER BY id LIMIT 1;
      UPDATE training_activities SET block_id = blk_para WHERE block_id = blk_de;
    END LOOP;
  END LOOP;
END $$;

-- renumera e renomeia: 5 (Atividade 4, agora vazia) → 1 Academia; 1..4 → 2..5; 6 fica
UPDATE training_activity_blocks
   SET "order" = CASE "order" WHEN 5 THEN 1 ELSE "order" + 1 END
 WHERE "order" BETWEEN 1 AND 5;
UPDATE training_activity_blocks
   SET name = (ARRAY['Academia', 'Ativação', 'Atividade 1', 'Atividade 2', 'Atividade 3', 'Treino de goleiro'])["order"]
 WHERE "order" BETWEEN 1 AND 6;

-- sessões salvas: mesma regra no JSON
DO $$
DECLARE
  m record; arr jsonb; vaga int; k int; cheio boolean;
  nomes text[] := ARRAY['Academia', 'Ativação', 'Atividade 1', 'Atividade 2', 'Atividade 3', 'Treino de goleiro'];
BEGIN
  FOR m IN SELECT id, blocos FROM treinos_modelo LOOP
    arr := m.blocos;
    cheio := EXISTS (SELECT 1 FROM jsonb_array_elements(arr) b WHERE (b->>'ordem')::int = 5 AND jsonb_typeof(b->'atividade') = 'object');
    IF cheio THEN
      SELECT min(p) INTO vaga FROM generate_series(1, 4) p
       WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(arr) b WHERE (b->>'ordem')::int = p AND jsonb_typeof(b->'atividade') = 'object');
      IF vaga IS NULL THEN RAISE EXCEPTION 'Sessão salva % sem vaga para a Atividade 4', m.id; END IF;
      FOR k IN vaga .. 4 LOOP
        arr := (SELECT jsonb_agg(CASE WHEN (b->>'ordem')::int = k
                   THEN jsonb_set(b, '{atividade}', COALESCE((SELECT b2->'atividade' FROM jsonb_array_elements(arr) b2 WHERE (b2->>'ordem')::int = k + 1 LIMIT 1), 'null'::jsonb))
                 WHEN (b->>'ordem')::int = k + 1 THEN jsonb_set(b, '{atividade}', 'null'::jsonb)
                 ELSE b END) FROM jsonb_array_elements(arr) b);
      END LOOP;
    END IF;
    arr := (SELECT jsonb_agg(jsonb_set(jsonb_set(x.b, '{ordem}', to_jsonb(x.nova)), '{nome}', to_jsonb(nomes[x.nova])) ORDER BY x.nova)
              FROM (SELECT b, CASE WHEN (b->>'ordem')::int = 5 THEN 1 WHEN (b->>'ordem')::int BETWEEN 1 AND 4 THEN (b->>'ordem')::int + 1 ELSE (b->>'ordem')::int END AS nova
                      FROM jsonb_array_elements(arr) b) x);
    UPDATE treinos_modelo SET blocos = arr, updated_at = NOW() WHERE id = m.id;
  END LOOP;
END $$;

COMMIT;
