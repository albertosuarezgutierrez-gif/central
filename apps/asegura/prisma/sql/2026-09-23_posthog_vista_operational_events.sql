-- Vista `public.operational_events` para el warehouse de PostHog (proyecto 167360). Aplicada como
-- migraciones `posthog_vista_operational_events` + `posthog_vista_operational_events_solo_lectura`.
--
-- Por qué existe (23/09/2026): la fuente Postgres de PostHog se repuntó del Supabase congelado de
-- Frankfurt a central (schema `seguros`), pero la tabla que ya tenía dada de alta se quedó anclada a
-- `public.operational_events` — ni «Sync now» ni «Delete table and resync» cambian el schema de
-- origen de una tabla existente, y «Pull new schemas» no crea otra con el mismo nombre. Recrearla con
-- otro nombre obligaría a reescribir las alertas que leen `postgres_operational_events` (heartbeat de
-- CIMA, A1 sign-in failures, A14 webhook signature failures). La vista mantiene ese nombre.
--
-- Solo lectura para `posthog_readonly`. Se retiran los permisos que `public` concede por defecto:
-- `anon`/`authenticated` la expondrían por la API REST, y los roles de las apps tendrían escritura
-- (una vista `select *` es actualizable). `security_invoker` hace que se compruebe el permiso del que
-- consulta sobre la tabla base.
--
-- Se borra si algún día se recrea la fuente de PostHog directamente sobre `seguros`.

create view public.operational_events
  with (security_invoker = true)
  as select * from seguros.operational_events;

revoke all on public.operational_events from anon, authenticated, public;
revoke all on public.operational_events from app_user, prisma_almacen, prisma_alquiler, prisma_ialimp,
  prisma_plataforma, prisma_sivra, prisma_transporte;
grant select on public.operational_events to posthog_readonly;
