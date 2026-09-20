-- Descartes TEMPORALES de la cola de retención (20/09/2026).
--
-- Por qué NO es un "marcar como hecho" que borra la fila para siempre: la cola
-- de `colaRetencion()` está DERIVADA en vivo de `poliza_recibos.situacion` — un
-- botón que oculte una póliza sin que el recibo cambie de estado convertiría
-- «ya la he llamado» en «sigue sin cobrar y ya no se ve», que es justo la
-- mentira que esta cola existe para no decir (ver cabecera de `retencion.ts`,
-- caso María Alcalá 03/09/2026). Especialmente grave en `suspendida`: ocultar
-- un "circula sin cobertura" a las primeras de cambio es un riesgo legal, no
-- solo una cola más limpia.
--
-- Por eso el descarte CADUCA (`vence_at`): quita la fila un tiempo (la llamada
-- ya se hizo, o se está esperando a que el banco actualice el recibo) y
-- REAPARECE sola si para entonces el recibo sigue sin cobrar. No es "resuelto",
-- es "ya lo sé, no me lo vuelvas a enseñar todavía".
SET search_path = seguros, public;

CREATE TABLE IF NOT EXISTS seguros.retencion_descartes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id uuid NOT NULL,
  poliza_id     uuid NOT NULL,
  actor         text NOT NULL,
  motivo        text,
  creado_at     timestamptz NOT NULL DEFAULT now(),
  -- Sin fecha por defecto: quien descarta decide el plazo, no el sistema.
  vence_at      timestamptz NOT NULL
);

-- La consulta de `colaRetencion` filtra "¿hay un descarte vivo para esta
-- póliza?" en cada carga: el índice es por eso, no por el listado histórico.
CREATE INDEX IF NOT EXISTS idx_retencion_descartes_poliza_vigente
  ON seguros.retencion_descartes (poliza_id, vence_at);

GRANT SELECT, INSERT ON seguros.retencion_descartes TO prisma_seguros;
