-- Borradores de las pantallas de PRESUPUESTO (05/10/2026, decisión de Alberto).
--
-- «Todo lo que se teclea en un presupuesto se conserva aunque la página falle, se cierre el
-- navegador o se cambie de dispositivo.» Hasta hoy el borrador vivía SOLO en `localStorage`
-- (`apps/plataforma/lib/correduria/borrador-local.ts`): otro equipo, otro navegador o un modo
-- privado lo perdían. Esta tabla es la segunda línea; el `localStorage` sigue siendo la primera.
--
-- Lo que esta tabla NO es:
--   · NO es una oportunidad ni una cotización. La oportunidad solo nace al pagar
--     (`apps/asegura/lib/oportunidad-presupuesto.ts`) y aquí no se crea ninguna ni se toca
--     `estado_comercial`. `oportunidad_id` solo se rellena cuando la pantalla ya trabaja sobre una
--     oportunidad existente (variante de un riesgo).
--   · NO es dato de la cartera: nadie lo ha confirmado. No deja fila en `historial_interno`.
--
-- 🔐 `datos_cifrados` va CIFRADO con `encryptField` (como `solicitud_datos.respuestas`): el
-- borrador lleva DNI, nombre, fecha de nacimiento y fecha de carnet tecleados a mano. Un jsonb en
-- claro sería la única copia de esos datos sin cifrar en todo `seguros`.
--
-- ⏱️ `guardado_en` = cuándo se TECLEÓ (marca del navegador, recortada a `now()` al escribir para
-- que un reloj adelantado no gane siempre). Es la marca con la que la pantalla elige entre el
-- borrador local y este. `actualizado_en` = cuándo llegó aquí (lo usa la purga).
-- Un guardado más VIEJO que el que ya hay no lo pisa (pestaña antigua, `keepalive` tardío): lo
-- hace el `WHERE` del upsert en `apps/asegura/lib/borrador-presupuesto.ts`.
--
-- 🧹 Purga: pg_cron diario (03:40 UTC) borra lo que lleve > 60 días sin tocar. Al pagar con éxito la
-- pantalla lo borra ella misma (igual que el local).
--
-- 🚪 Permisos: solo `prisma_seguros` (el puerto de asegura). Ni el portal del cliente
-- (`prisma_asegura_portal`), ni la ingesta de Manuel (`crm_seguros`, que recibe DML en `seguros`
-- por privilegios por defecto: se le QUITA aquí), ni `anon`/`authenticated`. RLS activada sin
-- políticas, como las hermanas.
--
-- 🚨 Aplicar ANTES de desplegar el código: sin la tabla, el guardado en servidor responde 503 y la
-- pantalla dice «Sin conexión: guardado en este equipo» (el local sigue funcionando, nada se pierde).

CREATE TABLE IF NOT EXISTS seguros.borradores_presupuesto (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id   uuid NOT NULL REFERENCES seguros.corredurias (id),
  cliente_id      uuid NOT NULL REFERENCES seguros.clientes (id) ON DELETE CASCADE,
  oportunidad_id  uuid REFERENCES seguros.oportunidades (id) ON DELETE CASCADE,
  ramo            text NOT NULL CHECK (ramo IN ('auto', 'moto', 'hogar', 'salud', 'vida', 'decesos')),
  datos_cifrados  text NOT NULL CHECK (length(datos_cifrados) <= 200000),
  guardado_en     timestamptz NOT NULL,
  actualizado_por text NOT NULL,
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  creado_en       timestamptz NOT NULL DEFAULT now()
);

-- Uno por (correduría, cliente, ramo, oportunidad); «sin oportunidad» cuenta como una más.
CREATE UNIQUE INDEX IF NOT EXISTS borradores_presupuesto_uno
  ON seguros.borradores_presupuesto
  (correduria_id, cliente_id, ramo, coalesce(oportunidad_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS borradores_presupuesto_actualizado
  ON seguros.borradores_presupuesto (actualizado_en);

ALTER TABLE seguros.borradores_presupuesto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.borradores_presupuesto FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.borradores_presupuesto TO prisma_seguros;

COMMENT ON TABLE seguros.borradores_presupuesto IS
  'Lo tecleado en una pantalla de presupuesto ANTES de pagar la cotización (no es oportunidad ni '
  'cartera). datos_cifrados con encryptField. Purga pg_cron > 60 días sin tocar.';

-- Purga diaria.
SELECT cron.unschedule('seguros-purga-borradores-presupuesto')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'seguros-purga-borradores-presupuesto');
SELECT cron.schedule('seguros-purga-borradores-presupuesto', '40 3 * * *',
  $$DELETE FROM seguros.borradores_presupuesto WHERE actualizado_en < now() - interval '60 days'$$);
