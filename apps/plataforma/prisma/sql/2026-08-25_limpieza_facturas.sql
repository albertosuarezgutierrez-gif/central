-- Desglose REAL de las facturas de limpieza (Sique Brilla) — 25/08/2026.
--
-- Hasta ahora el P&L por piso INFERÍA el desglose de cada pago por mejor ajuste al importe
-- (`lib/sivra/reparto-siquebrilla.ts`). La factura trae el desglose de verdad; esta tabla lo
-- guarda para que el P&L lo use cuando existe y siga infiriendo cuando no.
--
-- Solo se escriben lecturas que CUADRAN con el total de la factura (ver `factura-limpieza.ts`):
-- una lectura que no cuadra no llega aquí, se registra su motivo y el P&L se queda con su
-- inferencia. `limpieza`/`lavanderia` van SIN IVA, como las imprime la factura.

CREATE TABLE IF NOT EXISTS limpieza_facturas (
  id             TEXT PRIMARY KEY,
  cuenta_id      TEXT NOT NULL,
  proveedor      TEXT NOT NULL DEFAULT 'sique_brilla',
  numero         TEXT,
  periodo        TEXT,                              -- 'YYYY-MM' del mes de SERVICIO, si consta
  fecha          DATE,
  total          NUMERIC(12,2) NOT NULL,            -- CON IVA: es lo que casa con el banco
  base           NUMERIC(12,2),
  iva            NUMERIC(12,2),
  lavanderia     NUMERIC(12,2) NOT NULL DEFAULT 0,  -- SIN IVA
  limpieza       JSONB NOT NULL,                    -- [{propertyId, sesiones, tarifa, importe}] SIN IVA
  movimiento_id  TEXT,                              -- pago casado, si se conoce al darla de alta
  fuente         TEXT NOT NULL,                     -- 'pdf_ia' | 'manual'
  nombre_fichero TEXT,
  avisos         JSONB,                             -- lo que llamó la atención aunque cuadre
  creada_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedupe: una factura numerada es única por proveedor y cuenta. Reimportar el mismo PDF
-- actualiza la fila en vez de duplicar el gasto en el P&L.
--
-- 🚨 Sin número NO hay índice único que valga: en Postgres dos NULL no colisionan, así que un
-- índice sobre (…, numero) dejaría entrar dos veces la misma factura sin numerar y el P&L
-- contaría el gasto doble. El caso sin número lo deduplica el código con un DELETE explícito
-- (`IS NOT DISTINCT FROM`, que sí compara NULLs) antes de insertar.
CREATE UNIQUE INDEX IF NOT EXISTS limpieza_facturas_numero_uq
  ON limpieza_facturas (cuenta_id, proveedor, numero)
  WHERE numero IS NOT NULL;

-- El P&L busca por importe dentro de una ventana de meses.
CREATE INDEX IF NOT EXISTS limpieza_facturas_total_idx ON limpieza_facturas (proveedor, total);
CREATE INDEX IF NOT EXISTS limpieza_facturas_periodo_idx ON limpieza_facturas (periodo);
