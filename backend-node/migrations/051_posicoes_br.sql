-- Migration 051 (20/10/2026): posições com a nomenclatura brasileira.
-- Futebol 11 e Futebol 7 passam a usar a mesma lista:
--   GOL · ZAG · LD · LE · VOL · MEI · ED · EE · CA
-- Futsal NÃO muda (GOL, FIX, ALA-D, ALA-E, PIV): atletas de clube futsal ficam de fora.
-- Mapa (o mesmo de backend-node/tests/posicoes-br.test.js):
--   GR → GOL · DC, Z → ZAG · DD → LD · DE → LE · MC → VOL
--   MD, ME, MOF, M → MEI · PL, SA, A → CA · LD, LE, ED, EE ficam.
-- Os códigos antigos continuam aceitos como sinônimo no código (positionSector.js,
-- frontend/src/lib/formation.js), então dado legado que escapar não quebra.
-- Jogadas salvas (tactical_plays) NÃO são tocadas: o nome das peças é conteúdo do usuário.

BEGIN;

UPDATE athletes a
   SET position = CASE upper(trim(a.position))
         WHEN 'GR'  THEN 'GOL'
         WHEN 'DC'  THEN 'ZAG'
         WHEN 'Z'   THEN 'ZAG'
         WHEN 'DD'  THEN 'LD'
         WHEN 'DE'  THEN 'LE'
         WHEN 'MC'  THEN 'VOL'
         WHEN 'MD'  THEN 'MEI'
         WHEN 'ME'  THEN 'MEI'
         WHEN 'MOF' THEN 'MEI'
         WHEN 'M'   THEN 'MEI'
         WHEN 'PL'  THEN 'CA'
         WHEN 'SA'  THEN 'CA'
         WHEN 'A'   THEN 'CA'
       END,
       updated_at = now()
 WHERE upper(trim(a.position)) IN ('GR', 'DC', 'Z', 'DD', 'DE', 'MC', 'MD', 'ME', 'MOF', 'M', 'PL', 'SA', 'A')
   AND NOT EXISTS (
     SELECT 1 FROM clubs c WHERE c.id = a.club_id AND c.modality = 'futsal'
   );

COMMIT;
