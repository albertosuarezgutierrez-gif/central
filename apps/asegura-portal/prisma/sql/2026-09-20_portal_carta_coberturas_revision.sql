-- Tres columnas nuevas para cerrar tres bucles del portal (20/09/2026):
--
--   1. `coberturas` (jsonb, lista de textos cortos) en `portal_poliza_declarada`:
--      la IA que lee el PDF ya sacaba compañía, número, ramo, prima y vencimiento;
--      ahora saca también las garantías, y con eso las pólizas DECLARADAS entran
--      en el detector de solapamientos junto a las de cartera. NULL = «no se
--      ha leído» (alta a mano, o subida anterior a hoy); `[]` = «leído, no
--      encontró ninguna».
--   2. `carta_generada_en` / `carta_enviada_en` en la misma tabla: el cliente
--      redactó la carta de no renovación (copiar/imprimir/abrir el correo) y,
--      si lo dice, la envió. Son la señal de lead más fuerte que tiene el
--      corredor: alguien que se ha molestado en escribir a su compañía para
--      dejarla. Las lee `apps/asegura` (`leads-portal.ts`) para subir esa
--      póliza a lo alto de la lista.
--   3. `revision_anual_enviada_en` en `portal_identidad`: cuándo se le mandó
--      la última «revisión anual» (el cron mensual de `apps/asegura`). NULL =
--      nunca. Lo escribe `prisma_seguros`, no el portal.
--
-- 🚨 GRANT por columna ANTES de declararla en Prisma: declarar sin conceder
-- rompe TODAS las lecturas del modelo con 42501. (Hoy los dos roles tienen
-- GRANT a nivel de tabla sobre estas dos tablas, así que las columnas nuevas
-- ya quedan cubiertas; los GRANT explícitos de abajo son la red por si algún
-- día se pasa a grants por columna, como ya ocurre en otras tablas.)

alter table seguros.portal_poliza_declarada
  add column if not exists coberturas jsonb,
  add column if not exists carta_generada_en timestamptz,
  add column if not exists carta_enviada_en timestamptz;

grant select (coberturas, carta_generada_en, carta_enviada_en),
      insert (coberturas, carta_generada_en, carta_enviada_en),
      update (coberturas, carta_generada_en, carta_enviada_en)
  on seguros.portal_poliza_declarada to prisma_asegura_portal;

grant select (coberturas, carta_generada_en, carta_enviada_en)
  on seguros.portal_poliza_declarada to prisma_seguros;

alter table seguros.portal_identidad
  add column if not exists revision_anual_enviada_en timestamptz;

grant select (revision_anual_enviada_en), update (revision_anual_enviada_en)
  on seguros.portal_identidad to prisma_seguros;

grant select (revision_anual_enviada_en)
  on seguros.portal_identidad to prisma_asegura_portal;

-- Índice parcial: el cron pregunta «¿a quién no le he mandado nada en 330
-- días?» y la tabla crecerá con cada cliente que entre en el portal.
create index if not exists portal_identidad_revision_anual_idx
  on seguros.portal_identidad (revision_anual_enviada_en);
