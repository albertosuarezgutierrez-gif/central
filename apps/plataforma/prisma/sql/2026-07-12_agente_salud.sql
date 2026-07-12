-- Estado de salud de los agentes programados (para badges en la UI + backoff de avisos).
-- Una fila por agente (clave única `agente`). La escribe cada agente por upsert idempotente;
-- la lee la app para pintar avisos en pantalla (p.ej. badge 🔴 de corte de extracción en /finanzas).
--
-- Primer consumidor: la skill `facturas-correo` escribe la fila `agente='facturas-extraccion-pdf'`
-- (Paso 0.d) y `lib/finanzas.ts::getResumenFinanciero` la lee (tolerante a que la tabla no exista aún).
--
-- Aplicar como `postgres` por el Supabase MCP (NO por el rol de la app). Idempotente.

CREATE TABLE IF NOT EXISTS agente_salud (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente           text NOT NULL UNIQUE,            -- p.ej. 'facturas-extraccion-pdf'
  ok               boolean NOT NULL DEFAULT true,    -- false = hay un corte/incidencia activa
  dias_caido       integer NOT NULL DEFAULT 0,       -- días que lleva el corte (0 si sano)
  detalle          text,                             -- descripción corta del estado
  ultimo_ok        timestamptz,                      -- última vez que estuvo sano
  ultima_alerta_ts timestamptz,                      -- último aviso Telegram enviado (backoff semanal)
  cuenta_id        uuid,                             -- opcional; NULL = agente global (no por tenant)
  actualizado_at   timestamptz NOT NULL DEFAULT now()
);

-- Sin RLS (rol de la app con BYPASSRLS, como el resto de tablas de plataforma); no exponer a anon.
REVOKE ALL ON agente_salud FROM anon;
