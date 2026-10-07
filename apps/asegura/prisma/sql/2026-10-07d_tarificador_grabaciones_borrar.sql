-- Borrado de grabaciones del tarificador (07/10/2026). La 07b revocó DELETE a prisma_seguros; Alberto ya puede
-- borrar una grabación desde /correduria → Grabaciones (DELETE /api/operador/tarificador/grabaciones/[id]).
-- Borra pantallas → documentos de la grabación → grabación, en una transacción. Idempotente.
BEGIN;
GRANT DELETE ON seguros.tarificador_grabaciones, seguros.tarificador_grabacion_pantallas TO prisma_seguros;
-- seguros.documentos ya tiene DELETE desde el bootstrap (2026-08-19); se repite por si algún REVOKE posterior lo quitó.
GRANT DELETE ON seguros.documentos TO prisma_seguros;
COMMIT;
