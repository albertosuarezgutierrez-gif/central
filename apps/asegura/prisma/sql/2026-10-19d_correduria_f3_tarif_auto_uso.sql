-- 2026-10-19d_correduria_f3_tarif_auto_uso.sql — Tope DIARIO de tarificaciones con BOTS pedidas desde el aviso de Telegram
-- de un lead (spec 2026-10-19 lead → propuesta, F3a §0.4 y §5.4). SIN APLICAR: lo aplica Alberto.
--
-- Una fila por correduría y día (hora de Madrid). `usadas` = trabajos de bot ENCOLADOS por el botón «🤖 Tarificar con
-- bots» (`clp_tar`) — un duplicado de un trabajo vivo no cuenta. El tope es `ASEGURA_TARIF_AUTO_TOPE_DIARIO` (20 por
-- defecto, máximo duro 100) + `tope_extra` (cada «➕ 10 más hoy», `clp_top`, suma 10). Protege los portales de bloqueos;
-- lo que no cabe se queda EN COLA y se avisa, nunca se descarta.
--
-- Va con `correduria_id` en la clave (multi-tenant: la spec decía `dia` solo). Sin esta tabla, asegura NO tarifica desde
-- el lead y lo dice (`estado: 'sin_tabla'`): nunca se tarifica sin poder contar. Código ANTES que el SQL. Idempotente.

CREATE TABLE IF NOT EXISTS seguros.correduria_tarif_auto_uso (
  correduria_id  uuid NOT NULL REFERENCES seguros.corredurias (id),
  dia            date NOT NULL,
  usadas         integer NOT NULL DEFAULT 0 CHECK (usadas >= 0),
  tope_extra     integer NOT NULL DEFAULT 0 CHECK (tope_extra >= 0 AND tope_extra <= 100),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (correduria_id, dia)
);

ALTER TABLE seguros.correduria_tarif_auto_uso ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON seguros.correduria_tarif_auto_uso TO prisma_seguros;

COMMENT ON TABLE seguros.correduria_tarif_auto_uso IS
  'Tope diario (Madrid) de trabajos de bot encolados desde el aviso «Listo para tarificar» de un lead (19/10/2026, F3a). usadas + tope_extra; sin datos personales.';
