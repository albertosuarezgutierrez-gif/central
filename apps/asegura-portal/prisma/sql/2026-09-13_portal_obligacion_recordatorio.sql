-- Recordatorios propios del cliente (ITV, carnet, caldera, extintores, o
-- texto libre) sobre el mismo motor de `portal_obligacion` — sin bien ni
-- póliza detrás: `bien_id`/`poliza_id`/`poliza_declarada_id` quedan NULL.
-- Decisión de Alberto (13/09/2026): «añade todo, texto libre y cuándo quiera
-- que le avise, todo modular» — objetivo, que usen la intranet.
--
-- `repite_cada_meses` es lo único que faltaba en la tabla: el resto (tipo con
-- sitio para `itv`/`carnet`/`mantenimiento`/`revision_gas`/`libre`, título en
-- texto libre, fecha sin recorte a 30 días) ya lo traía desde
-- `2026-09-03_portal_obligacion.sql`.

ALTER TABLE seguros.portal_obligacion
  ADD COLUMN IF NOT EXISTS repite_cada_meses smallint;

ALTER TABLE seguros.portal_obligacion
  ADD CONSTRAINT portal_obligacion_repite_rango
  CHECK (repite_cada_meses IS NULL OR (repite_cada_meses BETWEEN 1 AND 120));
