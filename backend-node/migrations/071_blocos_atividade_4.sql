-- 21/11/2026 (2): "Preparatório" vira "Atividade 1" e as atividades vão até a 4 (pedido do treinador).
-- Renomeia pela POSIÇÃO do bloco (2..5), que bate com o nome em todos os treinos gravados.
UPDATE training_activity_blocks SET name = CASE "order"
    WHEN 2 THEN 'Atividade 1' WHEN 3 THEN 'Atividade 2' WHEN 4 THEN 'Atividade 3' WHEN 5 THEN 'Atividade 4' END
 WHERE "order" BETWEEN 2 AND 5 AND name IN ('Preparatório', 'Atividade 1', 'Atividade 2', 'Atividade 3');
-- modelos de treino guardam o nome do bloco só para exibir (aplicar usa a posição)
UPDATE treinos_modelo SET blocos = (
  SELECT COALESCE(jsonb_agg(CASE WHEN (b->>'ordem')::int BETWEEN 2 AND 5
           THEN jsonb_set(b, '{nome}', to_jsonb('Atividade ' || ((b->>'ordem')::int - 1))) ELSE b END ORDER BY (b->>'ordem')::int), '[]'::jsonb)
  FROM jsonb_array_elements(blocos) b);
