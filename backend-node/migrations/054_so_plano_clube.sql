-- Migration 054 (21/10/2026): só o plano Clube é vendido.
--   Clube mensal R$ 120,00 · Clube anual R$ 1.200,00 (R$ 100/mês, cobrado uma vez por ano).
--   Limites (features) do Clube não mudam.
--   Plano de entrada "Essencial" (pro / pro_annual) sai da venda: is_active = false.
--   As linhas NÃO são apagadas (FK de subscriptions, histórico, webhooks MP/RevenueCat).
--   Assinaturas já existentes não são alteradas (o valor no Mercado Pago é do preapproval).
BEGIN;

UPDATE plans SET price_cents = 12000,  updated_at = NOW() WHERE id = 'clube';
UPDATE plans SET price_cents = 120000, updated_at = NOW() WHERE id = 'clube_annual';
UPDATE plans SET is_active = false,    updated_at = NOW() WHERE id IN ('pro', 'pro_annual');

COMMIT;
