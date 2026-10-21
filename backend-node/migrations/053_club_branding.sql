-- 053: Personalização visual por clube (cores do app + logo do tema escuro).
-- branding = { light?: {primary,background,surface,border,text,textSecondary}, dark?: {...} }
-- (validação em src/utils/branding.js). NULL/{} = cores padrão (com primary_color legado).
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS branding JSONB;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS logo_dark_path TEXT;
