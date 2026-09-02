-- 02/09/2026 — dos valores de enum que el CRM de la correduría necesita y el volcado no traía.
-- Aplicado en la BD compartida como migración `seguros_enums_fuente_web_y_origen_emitida`.
--
--   · fuente_origen: `web` (formulario público), `portal` (alta desde el portal del cliente),
--     `whatsapp` (cuando exista la WABA). Hasta hoy un lead de canal solo podía ser `otros`,
--     que es un «no lo sé» disfrazado de dato.
--   · poliza_origen: `emitida_codeoscopic` = «la emitimos nosotros y CIMA aún no la ha traído».
--     Es la marca que la emisión legacy nunca puso y por la que una emitida se duplicaba o se
--     pisaba (spec docs/superpowers/specs/2026-09-02-emision-conciliacion-cima-design.md, D2).
ALTER TYPE seguros.fuente_origen ADD VALUE IF NOT EXISTS 'web';
ALTER TYPE seguros.fuente_origen ADD VALUE IF NOT EXISTS 'portal';
ALTER TYPE seguros.fuente_origen ADD VALUE IF NOT EXISTS 'whatsapp';
ALTER TYPE seguros.poliza_origen ADD VALUE IF NOT EXISTS 'emitida_codeoscopic';
