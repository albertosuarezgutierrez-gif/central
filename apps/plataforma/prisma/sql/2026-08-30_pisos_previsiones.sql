-- Previsión de rendimiento por piso: foto diaria + dedupe de avisos (30/08/2026).
--
-- Petición de Alberto: además de VER la previsión (confirmado vs estimado, siempre por separado),
-- quiere SABER si las previsiones se cumplen — si aciertan, sirven de previsión de tesorería.
-- Para juzgar una previsión hay que recordar QUÉ se previó y CUÁNDO: eso es esta tabla. La rellena
-- el cron diario `/api/cron/prevision-pisos` (mes en curso + 2 siguientes, por piso) y la lee la
-- página `/sivra/resultado-pisos` (sección «Seguimiento»: último snapshot ANTES de empezar el mes
-- contra el ingreso real cuando el mes cierra).
--
-- Nombres deliberados (regla «dato que no hay ≠ dato que no se ha mirado»):
--   · `estimado` admite NULL = «sin base histórica con la que estimar» (piso sin ese mes en el año
--     anterior). NO se escribe 0: un 0 se leería como «no vas a vender más».
--   · `gastos_estimados` admite NULL por el mismo motivo (sin meses cerrados con datos).
--   · La tabla nace VACÍA el 30/08/2026: un mes cerrado sin snapshot previo es «sin registro»,
--     nunca «la previsión acertó/falló».

CREATE TABLE IF NOT EXISTS pisos_previsiones (
  id               bigserial PRIMARY KEY,
  fecha            date NOT NULL DEFAULT CURRENT_DATE, -- día del snapshot
  mes              text NOT NULL,                      -- mes previsto 'YYYY-MM'
  property_id      text NOT NULL,
  confirmado       double precision NOT NULL,          -- ingreso de reservas YA en calendario (medido)
  estimado         double precision,                   -- adicional estimado; NULL = sin base
  gastos_estimados double precision,                   -- NULL = sin meses cerrados con datos
  creado_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fecha, mes, property_id)
);

CREATE INDEX IF NOT EXISTS ix_pisos_previsiones_mes ON pisos_previsiones (mes, property_id, fecha);

-- Dedupe de los avisos Telegram de «previsión floja»: UNA vez por (mes, piso, tipo).
CREATE TABLE IF NOT EXISTS pisos_previsiones_avisos (
  mes         text NOT NULL,
  property_id text NOT NULL,
  tipo        text NOT NULL,           -- 'pace_flojo' (ampliable)
  avisado_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mes, property_id, tipo)
);

-- Mismo criterio que el resto del esquema: RLS activada sin políticas (los roles de servicio
-- llevan BYPASSRLS); `anon`/`authenticated` sin privilegio.
ALTER TABLE pisos_previsiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE pisos_previsiones_avisos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pisos_previsiones, pisos_previsiones_avisos FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pisos_previsiones, pisos_previsiones_avisos TO prisma_plataforma;
GRANT USAGE, SELECT ON SEQUENCE pisos_previsiones_id_seq TO prisma_plataforma;
