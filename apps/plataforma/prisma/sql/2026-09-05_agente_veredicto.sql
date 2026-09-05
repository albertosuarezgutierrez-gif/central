-- El veredicto del vigía de agentes vive en su propia tabla (05/09/2026).
--
-- 🚨 POR QUÉ EXISTE ESTE ARCHIVO: la migración `2026-09-02_agente_salud.sql` NUNCA se aplicó, y
-- no falló — su `CREATE TABLE IF NOT EXISTS agente_salud` fue un NO-OP silencioso porque ya
-- existía otra `agente_salud`, la de `2026-07-12_agente_salud.sql`, con un esquema totalmente
-- distinto. Resultado medido el 05/09/2026 en los logs de producción: desde el 03/09 07:45 UTC,
-- CADA día, ~30 errores `column "evaluado_at" of relation "agente_salud" does not exist` (P2010),
-- uno por agente vigilado. El vigía calculaba su veredicto y lo tiraba, igual que antes del 02/09.
--
-- Y el fallo era INVISIBLE desde la pantalla: `getSaludLatidos` y el expediente capturan el error
-- y devuelven `{}` / `null`, así que /operador/agentes volvió a pintar ⚪ «sin telemetría» sobre
-- ~30 agentes sin que nada dijera por qué. Solo el `console.error` del cron dejaba rastro.
--
-- POR QUÉ UNA TABLA NUEVA Y NO AÑADIR COLUMNAS A LA VIVA: son dos cosas distintas que se llamaban
-- igual por accidente.
--   · `agente_salud` (julio, VIVA): badge que el PROPIO agente se auto-declara. Hoy la escribe la
--     skill `facturas-correo` (fila `facturas-extraccion-pdf`) y la lee `lib/finanzas.ts`.
--   · `agente_veredicto` (esta): juicio EXTERNO que el vigía emite cada día sobre los latidos de
--     todos los agentes del registro.
-- Fusionarlas mezclaría `ok` con `alerta`, que son INVERSOS entre sí — un fallo de signo ahí pinta
-- verde lo que está rojo, que es el error más caro que hay. Además la fila de facturas no tiene
-- `evaluado_at`, y ese campo es justo lo que impide dar por fresco un veredicto viejo.
--
-- Aplicar como `postgres` por el Supabase MCP (NO por el rol de la app). Idempotente.
CREATE TABLE IF NOT EXISTS public.agente_veredicto (
  agente       text PRIMARY KEY,
  evaluado_at  timestamptz NOT NULL,
  alerta       boolean     NOT NULL,
  horas        double precision,          -- NULL = sin señal, NO cero
  motivo       text        NOT NULL,
  max_horas    integer     NOT NULL,
  etiqueta     text        NOT NULL,
  nota         text,
  -- Una sonda que revienta NO es un agente sano: se guarda aparte para poder decir
  -- «no se ha podido comprobar», que no es «está bien».
  sonda_error  text
);

ALTER TABLE public.agente_veredicto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agente_veredicto FROM anon;
