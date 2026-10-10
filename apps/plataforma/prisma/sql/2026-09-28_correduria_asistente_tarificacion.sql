-- Pedir precio de COCHE o MOTO desde el asistente de la correduría por Telegram (28/09/2026, fase 1).
-- Ver lib/correduria-tarificacion-tg.ts. Una fila = una petición de precio (0,50€ reales en Codeoscopic)
-- que se le enseñó a Alberto con su botón «Pedir precio». Mismo candado que emitir/corregir: botón de UN
-- SOLO USO (`UPDATE … WHERE estado = 'propuesta' AND caduca_at > now()`) que caduca a los 15 minutos.
-- `cuerpo` es lo que irá al puerto de asegura (resueltos + correcciones, con DNI y fechas); al cerrar la fila
-- se vacía (cuerpo = NULL): la cotización ya vive en `seguros.tarificaciones`.
-- `prima_actual` = lo que paga hoy con su compañía, si Alberto lo dijo (para comparar el precio nuevo).
-- Estados: `hecha` = hay precios · `sin_gasto` = consta que no se cobró · `incierta` = pudo cobrarse y no
-- trajo precios (NUNCA se lee como «no se ha gastado»).
-- ✅ YA APLICADA en Supabase (migración `correduria_asistente_tarificacion`). No volver a aplicar.
CREATE TABLE IF NOT EXISTS correduria_asistente_tarificacion (
  id            bigserial PRIMARY KEY,
  turno_id      bigint REFERENCES correduria_asistente_turno (id) ON DELETE SET NULL,
  cliente_id    uuid NOT NULL,
  ramo          text NOT NULL CHECK (ramo IN ('auto', 'moto')),
  cuerpo        jsonb,
  prima_actual  numeric(10, 2),
  estado        text NOT NULL DEFAULT 'propuesta'
                CHECK (estado IN ('propuesta', 'pidiendo', 'hecha', 'sin_gasto', 'incierta', 'caducada', 'descartada')),
  creada_at     timestamptz NOT NULL DEFAULT now(),
  caduca_at     timestamptz NOT NULL,
  decidida_at   timestamptz,
  resultado     jsonb
);
CREATE INDEX IF NOT EXISTS idx_correduria_asistente_tarificacion_creada ON correduria_asistente_tarificacion (creada_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON correduria_asistente_tarificacion TO prisma_plataforma;
GRANT USAGE, SELECT ON SEQUENCE correduria_asistente_tarificacion_id_seq TO prisma_plataforma;
REVOKE ALL ON correduria_asistente_tarificacion FROM anon, authenticated;
