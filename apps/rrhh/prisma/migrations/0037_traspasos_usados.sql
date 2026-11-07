-- Traspaso desde «Mi empresa» (empresa.grupoasegura.es): jti CONSUMIDOS (un solo uso). Spec 2026-11-07-mi-empresa-herramientas §5.
-- ⛔ NO APLICADA. Aplicar como postgres. Idempotente. Regla de rrhh: tabla nueva → REVOKE ALL + GRANT explícito a rrhh_app.
-- El token no autoriza nada: tras consumir el jti, la ruta exige `rrhh.usuario_empresas` para esa empresa (empresasAutorizadas).
CREATE TABLE IF NOT EXISTS rrhh.traspasos_usados (
  jti      uuid PRIMARY KEY,
  exp      timestamptz NOT NULL,
  usado_en timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON rrhh.traspasos_usados FROM PUBLIC;
REVOKE ALL ON rrhh.traspasos_usados FROM rrhh_app;
GRANT SELECT, INSERT ON rrhh.traspasos_usados TO rrhh_app;
