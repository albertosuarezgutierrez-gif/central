-- Liquidaciones recibidas de CIMA (ficheros LIQ EIAC 6.0).
-- Una fila = un fichero LIQ de una compañía para un periodo.
-- Se usa para cruzar con movimientos_bancarios (destino='seguros') y detectar descuadres.
CREATE TABLE IF NOT EXISTS cima_liquidaciones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id     UUID NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  compania      TEXT NOT NULL,                   -- 'Mapfre', 'Allianz', …
  periodo       TEXT NOT NULL,                   -- 'YYYY-MM' (mes al que corresponde la LIQ)
  nombre_fichero TEXT NOT NULL,
  importe_bruto NUMERIC(12,2) NOT NULL DEFAULT 0,
  importe_neto  NUMERIC(12,2) NOT NULL DEFAULT 0,
  fecha_fichero TIMESTAMPTZ,
  raw_cabecera  TEXT,                            -- primera línea del fichero para debug
  procesado_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cuenta_id, nombre_fichero)
);

CREATE INDEX IF NOT EXISTS idx_cima_liq_cuenta_periodo
  ON cima_liquidaciones (cuenta_id, periodo);
