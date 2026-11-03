-- 2026-11-03 · Liquidaciones/extractos de comisiones que llegan por CORREO (PDF) al agente de facturas.
--
-- Por qué: `lib/agente-facturas/procesar.ts` descartaba estos documentos como «no es gasto» y se
-- perdían bruto y retención. Ahora el agente los guarda aquí (`lib/correduria/liquidacion-doc*.ts`) y el
-- cron `/api/cron/cima-liq` los usa como fuente del eje LIQUIDADO de `comisiones_devengo`
-- (`liq_origen = 'pdf'`) SOLO en los periodos que CIMA no cubre (CIMA manda siempre).
--
-- Por qué una tabla y no columnas de `comisiones_devengo`: aquella es el LIBRO (una fila por compañía y
-- periodo, sumable); esta es la EVIDENCIA (una fila por documento, con dedupe por compañía + nº
-- documento, enlace a Drive y los avisos ADXP de Allianz que son informativos y NO se suman). Meterlos
-- en el libro duplicaría el periodo o mezclaría granularidades.
--
-- 🚨 Importes NULLABLE: NULL = el documento no lo trae / no se pudo leer. 0 = consta y es cero.
-- Sin datos personales: solo compañía, periodo e importes agregados del mediador.
-- Aditivo e idempotente. Aplicar por Supabase MCP en la BD compartida (wswbehlcuxqxyinousql) con OK.
-- Sin esta tabla: el agente sigue omitiendo como antes (motivo en agente_log) y el cron no fusiona PDF.

CREATE TABLE IF NOT EXISTS comisiones_liquidacion_docs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id         UUID NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  -- Código DGS ('C0109') si se conoce; NULL para compañías sin código en NOMBRE_POR_CODIGO_DGS
  -- (Caser, Asisa, Pelayo…): se guardan igual, pero no entran al libro hasta tener código.
  compania_codigo   TEXT,
  compania          TEXT,
  -- Clave de dedupe: el código DGS o el nombre en minúsculas.
  compania_clave    TEXT NOT NULL,
  -- 'extracto' (Allianz ADYP o liquidación de otra compañía: CUENTA) | 'aviso_recibo' (Allianz ADXP: informativo).
  -- La cartera prevista (AMYA) no se guarda.
  clase             TEXT NOT NULL CHECK (clase IN ('extracto', 'aviso_recibo')),
  numero_documento  TEXT NOT NULL,
  periodo_inicio    DATE,
  periodo_fin       DATE,
  fecha_documento   DATE,
  bruto             NUMERIC(12,2),
  retencion         NUMERIC(12,2),
  otros_descuentos  NUMERIC(12,2),
  neto              NUMERIC(12,2),
  saldo_anterior    NUMERIC(12,2),
  -- bruto − retención − otros = neto (±1 céntimo). NULL = faltan importes para comprobarlo.
  aritmetica_ok     BOOLEAN,
  drive_url         TEXT,
  drive_file_id     TEXT,
  nombre_archivo    TEXT,
  huella_documento  TEXT,
  fuente            TEXT NOT NULL,          -- 'agente-email' | 'agente-drive' | 'subida-manual'
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cuenta_id, compania_clave, numero_documento),
  CHECK (periodo_inicio IS NULL OR periodo_fin IS NULL OR periodo_inicio <= periodo_fin)
);

CREATE INDEX IF NOT EXISTS idx_comisiones_liq_docs_periodo
  ON comisiones_liquidacion_docs (cuenta_id, compania_codigo, periodo_inicio);

ALTER TABLE comisiones_liquidacion_docs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON comisiones_liquidacion_docs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON comisiones_liquidacion_docs TO prisma_plataforma;

COMMENT ON TABLE comisiones_liquidacion_docs IS
  'Liquidaciones de comisiones recibidas por correo (PDF), una fila por documento. Fuente del eje LIQUIDADO de comisiones_devengo (liq_origen=pdf) cuando CIMA no cubre el periodo.';

-- Verificación (a mano, tras aplicar):
--   SELECT has_table_privilege('prisma_plataforma','comisiones_liquidacion_docs','INSERT');   -- true
--   SELECT has_table_privilege('anon','comisiones_liquidacion_docs','SELECT');                -- false
--   SELECT count(*) FROM comisiones_liquidacion_docs;                                         -- 0
