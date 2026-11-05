-- Interruptor de módulos por empresa (05/11/2026, fase N0 de nóminas). Aditiva e idempotente. NO aplicada a la BD real desde el código.
-- Sin fila = módulo APAGADO (por defecto). Solo lo escribe el OPERADOR (`PUT /api/operador/empresas/modulos`, RRHH_OPERADOR_SECRET);
-- el responsable de la empresa solo lo VE en /admin/nominas.
-- modo 'reparto' = la gestoría calcula y rrhh reparte sus PDF (uso real hoy) · 'calculo' = rrhh calcula con @central/module-nominas.
-- 🚨 Cambio de comportamiento: el cron `/api/cron/nominas` SOLO genera borradores de empresas con nominas activo + modo 'calculo'
-- (antes recorría TODAS). Hasta aplicar esta migración el cron falla al leer la tabla y no genera nada (fail-closed).
CREATE TABLE IF NOT EXISTS rrhh.empresa_modulos (
  empresa_id   uuid        NOT NULL REFERENCES rrhh.empresas(id) ON DELETE CASCADE,
  modulo       text        NOT NULL CHECK (modulo ~ '^[a-z_]{2,40}$'),
  activo       boolean     NOT NULL DEFAULT false,
  modo         text        NOT NULL DEFAULT 'reparto' CHECK (modo IN ('reparto', 'calculo')),
  activado_por text,
  activado_at  timestamptz,
  PRIMARY KEY (empresa_id, modulo)
);
CREATE INDEX IF NOT EXISTS idx_empresa_modulos_activos ON rrhh.empresa_modulos (modulo, modo) WHERE activo;
ALTER TABLE rrhh.empresa_modulos ENABLE ROW LEVEL SECURITY;
-- Sin DELETE: ningún código borra filas (se apaga con activo=false).
GRANT SELECT, INSERT, UPDATE ON rrhh.empresa_modulos TO rrhh_app;
