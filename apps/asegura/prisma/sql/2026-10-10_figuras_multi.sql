-- Figuras multi + rol `asegurado` (10/10/2026, fase 2 del riesgo unificado:
-- docs/superpowers/specs/2026-10-10-riesgo-unificado-todos-los-ramos-design.md, H3).
--
-- Antes: `check rol in (tomador, propietario, conductor_habitual, conductor_ocasional)` y
-- `unique (oportunidad_id, rol)` → una persona por papel y sin asegurados.
-- Después:
--   · el check admite `asegurado` (beneficiarios de vida NO: son texto, decisión de Alberto);
--   · los papeles de UNA persona (todo lo que no es `asegurado`) siguen siendo únicos por oportunidad
--     (índice único PARCIAL `oportunidad_figura_rol_unico_uq`): nunca dos tomadores;
--   · `asegurado` admite varias fichas, pero la MISMA ficha no entra dos veces (`oportunidad_figura_multi_uq`):
--     identidad = cliente_id, nunca el nombre.
-- El tope por ramo (hogar/vida/comercio 1, salud/decesos 10) lo pone el puerto (`cardinalidadesDelRamo`).
--
-- 🚨 ORDEN DE DESPLIEGUE: PRIMERO el código de asegura (sus `on conflict (oportunidad_id, rol) where rol <> 'asegurado'`
-- valen contra el único viejo y contra el parcial), DESPUÉS este SQL. Aplicado antes que el código, el
-- `on conflict (oportunidad_id, rol)` sin predicado del código viejo FALLA (no infiere un índice parcial).
-- El predicado `rol <> 'asegurado'` debe ser IDÉNTICO al del código (inferencia de índice parcial).
--
-- Sin tocar datos: las filas de hoy (propietario/conductor_habitual) ya cumplen el check y el índice nuevo.
-- RLS: la tabla no tiene RLS ni políticas; los grants son de tabla y un ALTER no los cambia. Idempotente.

begin;

-- 1. El check de roles, con `asegurado`.
alter table seguros.oportunidad_figura drop constraint if exists oportunidad_figura_rol_ck;
alter table seguros.oportunidad_figura add constraint oportunidad_figura_rol_ck
  check (rol in ('tomador', 'propietario', 'conductor_habitual', 'conductor_ocasional', 'asegurado'));

-- 2. Únicos: primero los nuevos (nunca hay un momento sin guarda), luego fuera el viejo.
create unique index if not exists oportunidad_figura_rol_unico_uq
  on seguros.oportunidad_figura (oportunidad_id, rol) where rol <> 'asegurado';
create unique index if not exists oportunidad_figura_multi_uq
  on seguros.oportunidad_figura (oportunidad_id, rol, cliente_id) where rol = 'asegurado';
drop index if exists seguros.oportunidad_figura_rol_uq;

comment on index seguros.oportunidad_figura_rol_unico_uq is
  'Una persona por papel (tomador, propietario, conductores). El predicado lo repite el código en sus on conflict.';
comment on index seguros.oportunidad_figura_multi_uq is
  'Varios asegurados por riesgo; la misma ficha no entra dos veces (identidad = cliente_id).';
comment on table seguros.oportunidad_figura is
  'Figuras vigentes del riesgo de una oportunidad (29/09/2026; asegurados multi 10/10/2026). Sin fila de tomador, el tomador es oportunidades.cliente_id. Sin filas de asegurado = no consta (no «el tomador» ni «ninguno»).';

-- 3. Grants: los mismos de siempre (no cambian con el ALTER; se reafirman por si se recrea la tabla).
grant select, insert, update, delete on seguros.oportunidad_figura to prisma_seguros;

commit;

-- Comprobación (solo lectura):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'oportunidad_figura_rol_ck';
--   select indexname, indexdef from pg_indexes where schemaname = 'seguros' and tablename = 'oportunidad_figura';

-- ─── ROLLBACK (comentado; solo si NO hay ya filas `asegurado` ni dos filas del mismo rol) ───────────────
-- Antes de volver atrás, mira qué se perdería:
--   select oportunidad_id, rol, count(*) from seguros.oportunidad_figura group by 1, 2 having count(*) > 1 or rol = 'asegurado';
-- Si sale algo, decide a mano (no se borran asegurados en silencio). Y el código desplegado debe ser el que
-- ya lleva el predicado (vale contra ambos índices).
--
-- begin;
-- create unique index if not exists oportunidad_figura_rol_uq on seguros.oportunidad_figura (oportunidad_id, rol);
-- drop index if exists seguros.oportunidad_figura_multi_uq;
-- drop index if exists seguros.oportunidad_figura_rol_unico_uq;
-- alter table seguros.oportunidad_figura drop constraint if exists oportunidad_figura_rol_ck;
-- alter table seguros.oportunidad_figura add constraint oportunidad_figura_rol_ck
--   check (rol in ('tomador', 'propietario', 'conductor_habitual', 'conductor_ocasional'));
-- comment on table seguros.oportunidad_figura is
--   'Figuras vigentes del riesgo de una oportunidad (29/09/2026). Sin fila de tomador, el tomador es oportunidades.cliente_id.';
-- commit;
