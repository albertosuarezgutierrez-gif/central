-- Cuadro de comisiones PACTADO con cada compañía (28/09/2026).
--
-- Lo que CIMA manda en cada recibo es la comisión que la compañía HA APLICADO; esto es la que se
-- FIRMÓ. Sin la segunda no hay contra qué comparar la primera: si la compañía aplica mal su propio
-- cuadro, calcular el % desde los recibos solo copia el error.
--
-- · `producto` = el código de producto de la compañía, el mismo que trae CIMA en
--   `polizas.datos_especificos->'producto'->>'ramoEntidad'` (Allianz 1434 = RC PYME). Por él se cruza.
-- · `modalidad` NULL = todo el producto. CIMA no trae la modalidad en el recibo: con modalidades a
--   % distintos el cruce se queda en «por modalidad» y no emite veredicto.
-- · `acuerdo` = 'directo' (lo firmado por la correduría) o el nombre de la asociación/agrupación.
--   Con los dos vigentes, el extra de la asociación es la diferencia, y los recibos se comparan contra
--   el de la asociación.
-- · Nueva producción (recibo NP) y cartera (recibo CA) por separado: hay cuadros que las pagan distinto.
-- · Histórico por `vigente_desde`: un cuadro nuevo es una fila NUEVA, nunca un UPDATE de la vieja.
CREATE TABLE IF NOT EXISTS seguros.comision_pactada (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compania_codigo_dgs varchar(16) NOT NULL REFERENCES seguros.companias_dgs (codigo_dgs),
  producto            text NOT NULL CHECK (producto <> ''),
  producto_nombre     text,
  modalidad           text CHECK (modalidad IS NULL OR modalidad <> ''),
  acuerdo             text NOT NULL DEFAULT 'directo' CHECK (acuerdo <> ''),
  pct_nueva           numeric(5, 2) NOT NULL CHECK (pct_nueva >= 0 AND pct_nueva <= 100),
  pct_cartera         numeric(5, 2) NOT NULL CHECK (pct_cartera >= 0 AND pct_cartera <= 100),
  vigente_desde       date NOT NULL,
  fuente              text NOT NULL CHECK (fuente <> ''),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS comision_pactada_clave
  ON seguros.comision_pactada (compania_codigo_dgs, producto, coalesce(modalidad, ''), acuerdo, vigente_desde);

ALTER TABLE seguros.comision_pactada ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON seguros.comision_pactada TO prisma_seguros;

-- Allianz (C0109, clave 0018638): comunicación «Condiciones particulares de la carta de condiciones de
-- correduría de seguros», producto 1434 RESPONSABILIDAD CIVIL PYME, «Comisión 1º año y sucesivos»,
-- aplica desde el 28/10/2026. Captura aportada por Alberto el 28/09/2026.
INSERT INTO seguros.comision_pactada
  (compania_codigo_dgs, producto, producto_nombre, modalidad, acuerdo, pct_nueva, pct_cartera, vigente_desde, fuente)
VALUES
  ('C0109', '1434', 'RESPONSABILIDAD CIVIL PYME', 'RC Vida privada',          'directo', 22.5, 22.5, '2026-10-28', 'Comunicación de Allianz (condiciones particulares de la carta de condiciones), captura del 28/09/2026'),
  ('C0109', '1434', 'RESPONSABILIDAD CIVIL PYME', 'Explotaciones Agrícolas',  'directo', 17.5, 17.5, '2026-10-28', 'Comunicación de Allianz (condiciones particulares de la carta de condiciones), captura del 28/09/2026'),
  ('C0109', '1434', 'RESPONSABILIDAD CIVIL PYME', 'Industria y comercio',     'directo', 17.5, 17.5, '2026-10-28', 'Comunicación de Allianz (condiciones particulares de la carta de condiciones), captura del 28/09/2026'),
  ('C0109', '1434', 'RESPONSABILIDAD CIVIL PYME', 'Construcción',             'directo', 17.5, 17.5, '2026-10-28', 'Comunicación de Allianz (condiciones particulares de la carta de condiciones), captura del 28/09/2026'),
  ('C0109', '1434', 'RESPONSABILIDAD CIVIL PYME', 'Profesional',              'directo', 17.5, 17.5, '2026-10-28', 'Comunicación de Allianz (condiciones particulares de la carta de condiciones), captura del 28/09/2026'),
  ('C0109', '1434', 'RESPONSABILIDAD CIVIL PYME', 'Colectividades y Asoc',    'directo', 17.5, 17.5, '2026-10-28', 'Comunicación de Allianz (condiciones particulares de la carta de condiciones), captura del 28/09/2026'),
  ('C0109', '1434', 'RESPONSABILIDAD CIVIL PYME', 'Varios',                   'directo', 17.5, 17.5, '2026-10-28', 'Comunicación de Allianz (condiciones particulares de la carta de condiciones), captura del 28/09/2026')
ON CONFLICT DO NOTHING;
