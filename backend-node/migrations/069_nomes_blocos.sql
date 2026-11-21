-- 21/11/2026 (pedido do treinador): o 1º bloco do treino vira "Ativação" (era "Aquecimento") e o 6º vira
-- "Treino de goleiro" (era "Complementos"). Os novos já nascem assim (BLOCK_NAMES); aqui renomeia os gravados.
UPDATE training_activity_blocks SET name = 'Ativação' WHERE name = 'Aquecimento';
UPDATE training_activity_blocks SET name = 'Treino de goleiro' WHERE name = 'Complementos';
