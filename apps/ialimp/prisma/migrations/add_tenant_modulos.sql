-- Módulos por cliente (god-panel de plataforma). BD compartida.
-- Override explícito por (vertical, ref, modulo). Sin fila = ACTIVO (opt-out):
-- el operador solo apaga lo que quiera; las empresas existentes no se ven afectadas.
-- Lo consume: plataforma (panel) para leer/escribir, e ialimp (login → JWT → middleware)
-- para el gateo real (lib/modulos-tenant.ts → modulos_off en la sesión).
CREATE TABLE IF NOT EXISTS tenant_modulos (
  vertical   text NOT NULL,           -- 'ialimp' | 'iarest' | 'sivra'
  ref        text NOT NULL,           -- empresa_id / restaurante_id
  modulo     text NOT NULL,           -- agenda, clientes, rrhh, stock, facturacion, informes, contabilidad, concursos
  activo     boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vertical, ref, modulo)
);
CREATE INDEX IF NOT EXISTS idx_tenant_modulos_ref ON tenant_modulos(vertical, ref);
