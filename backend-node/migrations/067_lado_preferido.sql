-- 12/11/2026: lado em que o atleta prefere jogar (pedido do treinador: zagueiro pela direita,
-- pela esquerda ou pelos dois lados). Só ADD; a tela mostra o campo para zagueiros.
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS lado_preferido VARCHAR(8);
ALTER TABLE athletes DROP CONSTRAINT IF EXISTS athletes_lado_preferido_check;
ALTER TABLE athletes ADD CONSTRAINT athletes_lado_preferido_check
  CHECK (lado_preferido IS NULL OR lado_preferido IN ('direita', 'esquerda', 'ambos'));
