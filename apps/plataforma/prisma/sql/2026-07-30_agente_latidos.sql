-- Huella FIABLE de los agentes que solo escriben "cuando hay trabajo".
--
-- 🚨 Por qué: `lib/monitoring/latidos.ts` solo puede vigilar agentes que dejan
-- rastro en CADA pasada, y por eso excluía a propósito el escaneo de facturas
-- (`facturas_proveedor` solo crece si llega una factura → un mes sin facturas
-- daría falsa alarma). El efecto secundario es que ese agente se quedó SIN
-- NINGÚN vigilante: si el IMAP muere (contraseña rotada, etiqueta renombrada),
-- devuelve «0 facturas nuevas», el chat afirma «no tienes facturas pendientes 🎉»
-- y nadie se entera nunca.
--
-- Esta tabla rompe el empate: el agente escribe aquí SIEMPRE que corre, haya
-- encontrado algo o no, y marca si la pasada fue bien. Así se puede distinguir
-- «no había facturas» de «no se pudo mirar».
--
-- Aplicar por Supabase MCP en la BD compartida (wswbehlcuxqxyinousql).

CREATE TABLE IF NOT EXISTS agente_latidos (
  agente       text PRIMARY KEY,
  -- Última vez que el agente se EJECUTÓ (aunque fallara).
  ultimo_at    timestamptz NOT NULL DEFAULT now(),
  -- Última vez que completó su trabajo SIN error. Es la que mide la frescura:
  -- un agente que corre y falla cada vez se queda obsoleto aquí y salta el aviso.
  ultimo_ok_at timestamptz,
  ok           boolean NOT NULL DEFAULT true,
  detalle      text
);

-- Tabla interna de monitorización: nada que exponer a los roles de la API.
REVOKE ALL ON agente_latidos FROM anon, authenticated;
