-- Portal de Grupo ASegura — aviso push «cambios en tu póliza» (27/09/2026).
-- Amplía los CHECK de tipo de `portal_aviso_cima` y `portal_aviso_silenciado` con `poliza_modificada`
-- (lista = `TIPOS_AVISO_CIMA` de `@central/module-seguros-portal/avisos-cima`; la compara
-- `test/regression-portal-avisos-cima.test.ts` contra `2026-09-25_c_portal_avisos_cima.sql`).
SET search_path = seguros, public;

ALTER TABLE seguros.portal_aviso_cima DROP CONSTRAINT IF EXISTS portal_aviso_cima_tipo_check;
ALTER TABLE seguros.portal_aviso_cima ADD CONSTRAINT portal_aviso_cima_tipo_check
  CHECK (tipo IN ('base', 'recibo_nuevo', 'recibo_devuelto', 'siniestro', 'poliza_nueva', 'poliza_modificada'));

ALTER TABLE seguros.portal_aviso_silenciado DROP CONSTRAINT IF EXISTS portal_aviso_silenciado_tipo_check;
ALTER TABLE seguros.portal_aviso_silenciado ADD CONSTRAINT portal_aviso_silenciado_tipo_check
  CHECK (tipo IN ('recibo_nuevo', 'recibo_devuelto', 'siniestro', 'poliza_nueva', 'poliza_modificada'));
