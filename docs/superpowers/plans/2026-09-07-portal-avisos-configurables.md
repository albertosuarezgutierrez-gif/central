# «Avisos» del portal del cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un cliente de Grupo ASegura decida por sí mismo con cuánta antelación se le avisa de un vencimiento y si quiere saber cuándo se mueve un siniestro suyo — y que el aviso de siniestro, que hoy no existe, exista.

**Architecture:** Una tabla nueva (`seguros.portal_preferencia_aviso`) con la preferencia general y sus excepciones por póliza; la regla que la resuelve vive en `@central/module-seguros-portal`, pura y testeada; la pantalla es una vista más de `/boveda`; y los **dos** envíos salen de `apps/asegura`, que es la única app que puede leer un correo en claro. El aviso de siniestro se detecta comparando el estado actual con un sello (`avisado_estado`) escrito al lado de la propia fila.

**Tech Stack:** Next.js 15 (App Router) · Prisma 5 (multiSchema) · Postgres (Supabase compartida, schema `seguros`) · `node --test` · `@central/core-email`.

**Spec:** `docs/superpowers/specs/2026-09-06-portal-avisos-configurables-design.md` — léelo entero antes de empezar.

---

## 🚨 Cuatro cosas que el spec dice y que se han MEDIDO desde entonces

Léelas antes de la Tarea 1: dos cambian el trabajo.

| Lo que dice el spec | Lo medido (07/09/2026) | Consecuencia |
|---|---|---|
| «`portal_obligacion.tipo` modela **siete** recordatorios → hay siete cosas que configurar el día 1» | **Falso.** El único sitio del repo que escribe una obligación es `apps/asegura-portal/lib/obligaciones.ts:100`, y siempre con `tipo: 'poliza'`. Los otros seis valores del enum no los crea nadie, y no existe función que los traduzca a texto | **No se construyen siete interruptores.** Sería una lista de un elemento y seis que no apagan nada. Ver Tarea 6 |
| §3.2: «⚠️ A VERIFICAR: que el UPDATE de `persist-siniestro.ts` del CRM no reescriba la fila entera» | **Verificado y NO se cumple el riesgo.** `src/lib/integrations/cima/persist-siniestro.ts:165-190` del repo `asegura` usa `onConflictDoUpdate` con un `set` **explícito**: `estado`, `tipo`, `fechaHora`, `lugarDireccion/Cp/Ciudad/Provincia`, `updatedAt`. Nada más | El sello **puede vivir dentro de `seguros.siniestros`**. No hace falta la tabla `portal_*` alternativa del §8 |
| §0: «69 siniestros ya cargados» | **68** en cartera viva (07/09/2026) | El backfill de la Tarea 2 no lleva número escrito a mano: cuenta lo que haya |
| §0: «5 identidades, 46 invitables» | Sigue así, y además **0 identidades tienen varias fichas** y hay **1 autorización viva** | Esto se construye para muy poca gente todavía. El orden que lo hace útil sigue siendo: encender el cron → invitar → mirar quién entra |

---

## File Structure

**Se crean:**

| Fichero | Responsabilidad |
|---|---|
| `apps/asegura-portal/prisma/sql/2026-09-07_portal_preferencia_aviso.sql` | La tabla, sus CHECKs, su índice único con `COALESCE` y los GRANTs a los dos roles |
| `apps/asegura/prisma/sql/2026-09-07_siniestro_sello_aviso.sql` | Las dos columnas de sello en `seguros.siniestros` **y su siembra en la misma migración** |
| `packages/module-seguros-portal/src/preferencia-aviso.ts` | La regla pura: antelación efectiva, rango, advertencia, silenciado |
| `packages/module-seguros-portal/src/preferencia-aviso.test.ts` | Su cepo |
| `apps/asegura-portal/lib/preferencias.ts` | Leer y escribir la preferencia de UNA identidad (la de la cookie, nunca otra) |
| `apps/asegura-portal/app/(portal)/boveda/VistaAvisos.tsx` | La pantalla |
| `apps/asegura-portal/app/api/preferencias/route.ts` | `GET`/`PUT` de la preferencia |
| `apps/asegura/lib/avisos-siniestro.ts` | El envío del aviso de siniestro (lógica) |
| `apps/asegura/lib/correo-aviso-siniestro.ts` | El cuerpo del correo, PURO (para que su cepo pueda recorrerlo sin SMTP) |
| `apps/asegura/lib/correo-aviso-siniestro.test.ts` | El cepo del correo |
| `apps/asegura/app/api/cron/avisos-siniestro/route.ts` | Su endpoint |
| `test/regression-portal-avisos.test.ts` | Los cepos de raíz |

**Se modifican:**

| Fichero | Qué cambia |
|---|---|
| `apps/asegura-portal/prisma/schema.prisma` | Declara `PortalPreferenciaAviso` (**después** del GRANT) |
| `apps/asegura/prisma/asegura.prisma` | Declara el sello en `Siniestro` y el modelo `PortalPreferenciaAviso` (solo SELECT) |
| `packages/module-seguros-portal/src/index.ts` | Exporta lo nuevo |
| `packages/module-seguros-portal/src/vista-portal.ts` | Añade la vista `avisos` |
| `packages/module-seguros-portal/src/vista-portal.test.ts` | Actualiza el cepo del recuento de pestañas |
| `apps/asegura-portal/app/(portal)/boveda/page.tsx` | Monta `VistaAvisos` |
| `apps/asegura/lib/avisos-vencimiento.ts` | Lee el vencimiento de `polizas` (no de `portal_obligacion`) y aplica las tres condiciones |
| `apps/asegura/vercel.json` | Añade el cron del aviso de siniestro |

---

### Task 1: La tabla de preferencias (SQL), y su índice único

**Files:**
- Create: `apps/asegura-portal/prisma/sql/2026-09-07_portal_preferencia_aviso.sql`

- [ ] **Step 1: Escribir la migración**

Copia el idioma del `COALESCE` de `2026-09-04_portal_autorizacion_por_poliza.sql`: en Postgres `NULL ≠ NULL`, así que un `UNIQUE(identidad_id, poliza_id)` a secas deja meter varias filas «generales».

```sql
-- 2026-09-07 — La preferencia de avisos de un cliente del portal.
--
-- ── Qué guarda ──────────────────────────────────────────────────────────────
-- `poliza_id IS NULL`  = la preferencia GENERAL de esa identidad.
-- `poliza_id NOT NULL` = la excepción para ESA póliza, y solo puede llevar
--                        `dias_antelacion` (ver el CHECK de abajo).
--
-- 🚨 `dias_antelacion IS NULL` = «no ha elegido», NO cero. Un cero avisaría el
-- mismo día del vencimiento, que es exactamente el aviso que no sirve.
--
-- 🚨 `avisar_siniestro IS NULL` = usa el defecto (`true`). Tres estados, no dos.

create table if not exists seguros.portal_preferencia_aviso (
  id                 uuid primary key default gen_random_uuid(),
  identidad_id       uuid not null references seguros.portal_identidad(id) on delete cascade,
  poliza_id          uuid references seguros.polizas(id) on delete cascade,
  dias_antelacion    integer,
  tipos_silenciados  seguros.portal_obligacion_tipo[] not null default '{}',
  avisar_siniestro   boolean,
  actualizada_en     timestamptz not null default now(),

  -- El rango de la regla pura (`ANTELACION_MIN`/`ANTELACION_MAX`). Por debajo
  -- de 30 la pantalla ADVIERTE pero deja pedirlo: a esa antelación ya no se
  -- puede evitar la prórroga (art. 22 LCS), y decir que sí y no mandarlo sería
  -- la misma mentira en versión amable.
  constraint portal_preferencia_dias_rango check (
    dias_antelacion is null or dias_antelacion between 7 and 120
  ),

  -- 🚨 Una EXCEPCIÓN por póliza solo puede llevar la antelación. Sin esto, la
  -- misma columna significaría dos cosas según la fila y habría DOS sitios
  -- donde apagar el mismo aviso: la clase de ambigüedad que no falla, solo
  -- hace lo que no esperabas. Silenciar un tipo o los siniestros es una
  -- decisión de la PERSONA, no de una póliza.
  constraint portal_preferencia_excepcion_solo_dias check (
    poliza_id is null
    or (tipos_silenciados = '{}'::seguros.portal_obligacion_tipo[] and avisar_siniestro is null)
  )
);

-- 🚨 En Postgres dos NULL nunca son iguales, así que un UNIQUE normal dejaría
-- acumular preferencias «generales» infinitas para la misma identidad y la
-- lectura cogería una al azar. Mismo centinela que `portal_autorizacion`.
create unique index if not exists idx_portal_preferencia_aviso_unica
  on seguros.portal_preferencia_aviso (
    identidad_id,
    coalesce(poliza_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists idx_portal_preferencia_identidad
  on seguros.portal_preferencia_aviso (identidad_id);

comment on table seguros.portal_preferencia_aviso is
  'Preferencia de avisos de una identidad del portal. poliza_id NULL = la general; con valor = excepción de esa póliza (solo dias_antelacion). dias_antelacion NULL = no ha elegido, nunca 0.';

-- El portal la escribe; el cron del corredor solo la LEE.
grant select, insert, update, delete on seguros.portal_preferencia_aviso to prisma_asegura_portal;
grant select on seguros.portal_preferencia_aviso to prisma_seguros;
grant usage on type seguros.portal_obligacion_tipo to prisma_asegura_portal;
```

- [ ] **Step 2: Aplicarla, y VER MORDER los dos CHECKs y el índice**

Un CHECK que nadie ha visto morder es una suposición. Los tres, dentro de un `ROLLBACK`, con `mcp__Supabase__execute_sql` sobre el proyecto `wswbehlcuxqxyinousql`:

```sql
begin;
-- 1) Rango: 3 días tiene que reventar (23514).
insert into seguros.portal_preferencia_aviso (identidad_id, dias_antelacion)
select id, 3 from seguros.portal_identidad limit 1;
rollback;
```

Esperado: `new row for relation "portal_preferencia_aviso" violates check constraint "portal_preferencia_dias_rango"`.

```sql
begin;
-- 2) Excepción con silenciados: tiene que reventar (23514).
insert into seguros.portal_preferencia_aviso (identidad_id, poliza_id, tipos_silenciados)
select i.id, p.id, '{poliza}'::seguros.portal_obligacion_tipo[]
from seguros.portal_identidad i, seguros.polizas p limit 1;
rollback;
```

Esperado: `violates check constraint "portal_preferencia_excepcion_solo_dias"`.

```sql
begin;
-- 3) Dos generales para la misma identidad: la segunda tiene que reventar (23505).
insert into seguros.portal_preferencia_aviso (identidad_id, dias_antelacion)
select id, 60 from seguros.portal_identidad limit 1;
insert into seguros.portal_preferencia_aviso (identidad_id, dias_antelacion)
select id, 90 from seguros.portal_identidad limit 1;
rollback;
```

Esperado: `duplicate key value violates unique constraint "idx_portal_preferencia_aviso_unica"`.

- [ ] **Step 3: Commit**

```bash
git add apps/asegura-portal/prisma/sql/2026-09-07_portal_preferencia_aviso.sql
git commit -m "feat(portal): tabla de preferencias de aviso, con sus tres cepos vistos morder"
```

---

### Task 2: El sello del siniestro (SQL) — con su siembra EN LA MISMA migración

**Files:**
- Create: `apps/asegura/prisma/sql/2026-09-07_siniestro_sello_aviso.sql`

🚨 **La siembra va aquí y no en un paso posterior.** Entre crear las columnas y sembrarlas cabe una pasada del cron, y esa pasada mandaría un correo por cada siniestro ya cargado.

- [ ] **Step 1: Escribir la migración**

```sql
-- 2026-09-07 — El sello del aviso de siniestro, al lado de la propia fila.
--
-- ── Por qué DENTRO de `siniestros` y no en una tabla `portal_*` ─────────────
-- Porque se comprobó que la ingesta de CIMA no lo pisa: el upsert de
-- `src/lib/integrations/cima/persist-siniestro.ts` (repo `asegura`) usa
-- `onConflictDoUpdate` con un `set` EXPLÍCITO —estado, tipo, fecha_hora,
-- lugar_* y updated_at— y no toca ninguna otra columna. Verificado el
-- 07/09/2026 leyendo ese fichero, no supuesto. Si algún día ese `set` pasara a
-- reescribir la fila entera, el sello se muda a una tabla propia.
--
-- ── 🚨 LA SIEMBRA VA AQUÍ, en la misma transacción ─────────────────────────
-- Hay siniestros ya cargados y ninguno tiene sello. Si el cron arrancara
-- tratando NULL como «nunca avisé», mandaría un correo por cada uno de ellos —
-- varios de 2024 y ya cerrados. Entre crear la columna y sembrarla cabe una
-- pasada del cron, así que no son dos pasos: es uno.
--
-- Se siembra con el estado ACTUAL de cada fila, que es justo lo que significa
-- «de esto ya no hay novedad que contar».

begin;

alter table seguros.siniestros
  add column if not exists avisado_estado seguros.estado_siniestro,
  add column if not exists avisado_en     timestamptz;

-- Los dos o ninguno: un sello a medias no dice nada.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'siniestros_sello_aviso_completo') then
    alter table seguros.siniestros
      add constraint siniestros_sello_aviso_completo check (
        (avisado_estado is null and avisado_en is null)
        or (avisado_estado is not null and avisado_en is not null)
      );
  end if;
end $$;

-- La siembra. Sin número escrito a mano: lo que haya.
update seguros.siniestros
set avisado_estado = estado, avisado_en = now()
where avisado_estado is null;

commit;

comment on column seguros.siniestros.avisado_estado is
  'Estado con el que se avisó por última vez al cliente. Se avisa cuando estado <> avisado_estado. NULL = nunca se ha avisado (solo posible en filas creadas tras esta migración).';

grant select, update (avisado_estado, avisado_en) on seguros.siniestros to prisma_seguros;
```

- [ ] **Step 2: Aplicarla y comprobar que NO queda ningún siniestro sin sello**

```sql
select count(*) as sin_sello from seguros.siniestros where avisado_estado is null;
```

Esperado: `0`. Si sale otra cosa, **no sigas**: el cron de la Tarea 8 mandaría un correo por cada una.

- [ ] **Step 3: Ver morder el CHECK del sello a medias**

```sql
begin;
update seguros.siniestros set avisado_en = null where avisado_estado is not null;
rollback;
```

Esperado: `violates check constraint "siniestros_sello_aviso_completo"`.

- [ ] **Step 4: Commit**

```bash
git add apps/asegura/prisma/sql/2026-09-07_siniestro_sello_aviso.sql
git commit -m "feat(asegura): sello del aviso de siniestro, sembrado en la misma migracion"
```

---

### Task 3: La regla pura — `antelacionEfectiva`

**Files:**
- Create: `packages/module-seguros-portal/src/preferencia-aviso.ts`
- Test: `packages/module-seguros-portal/src/preferencia-aviso.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ANTELACION_DEFECTO,
  ANTELACION_MIN,
  ANTELACION_MAX,
  antelacionEfectiva,
  antelacionValida,
  antelacionLlegaTarde,
  avisarSiniestroEfectivo,
} from './preferencia-aviso.ts'

test('sin ninguna preferencia se usa el DEFECTO, nunca silencio', () => {
  // 🚨 No tener preferencia NO es haber pedido silencio. Quien no ha entrado
  // nunca al portal no tiene fila, y tiene que seguir recibiendo su aviso.
  assert.equal(antelacionEfectiva(null, null), ANTELACION_DEFECTO)
})

test('la general gana al defecto, y la excepcion gana a la general', () => {
  assert.equal(antelacionEfectiva(null, 90), 90)
  assert.equal(antelacionEfectiva(45, 90), 45)
})

test('🚨 un 0 guardado NO se colapsa con «no ha elegido»', () => {
  // Si algún día entra un 0 por otro camino, avisar el mismo día del
  // vencimiento es peor que no avisar: llega cuando ya no se puede hacer nada.
  assert.equal(antelacionValida(0), false)
  assert.equal(antelacionValida(null), true, 'null es «no ha elegido», que sí es válido')
})

test('el rango es 7-120', () => {
  assert.equal(ANTELACION_MIN, 7)
  assert.equal(ANTELACION_MAX, 120)
  assert.equal(antelacionValida(6), false)
  assert.equal(antelacionValida(7), true)
  assert.equal(antelacionValida(121), false)
})

test('🚨 por debajo de 30 se ADVIERTE, no se bloquea', () => {
  // El tomador tiene que comunicar que no prorroga con un mes de antelación
  // (art. 22 LCS). A 20 días el aviso llega cuando ya no sirve para eso — pero
  // sigue sirviendo para retarificar, así que se manda igual y se DICE.
  assert.equal(antelacionLlegaTarde(20), true)
  assert.equal(antelacionValida(20), true)
  assert.equal(antelacionLlegaTarde(30), false)
  assert.equal(antelacionLlegaTarde(60), false)
})

test('🚨 el defecto de siniestro es AVISAR, y null no es «no»', () => {
  assert.equal(avisarSiniestroEfectivo(null), true)
  assert.equal(avisarSiniestroEfectivo(false), false)
  assert.equal(avisarSiniestroEfectivo(true), true)
})
```

- [ ] **Step 2: Verlo fallar**

Run: `cd packages/module-seguros-portal && node --test src/preferencia-aviso.test.ts`
Expected: FAIL — `Cannot find module './preferencia-aviso.ts'`.

- [ ] **Step 3: Escribir el módulo**

```ts
// La antelación con la que se avisa a un cliente, y si quiere saber de sus
// siniestros. Puro: sin BD, sin red, sin Next.
//
// ── Por qué 60 y no 30 ──────────────────────────────────────────────────────
// [Probable] El tomador debe comunicar por escrito que NO prorroga con un mes
// de antelación (art. 22 LCS). Un aviso a 30 días le llega EN la fecha límite,
// con cero holgura para pensarlo, pedir precio y decidir. A 60 le quedan ~30
// días de margen para retarificar. Por eso la antelación es una decisión
// comercial, no cosmética: es el tiempo que queda para enseñarle algo.

/** Lo que se usa cuando nadie ha elegido nada. */
export const ANTELACION_DEFECTO = 60
export const ANTELACION_MIN = 7
export const ANTELACION_MAX = 120
/** Por debajo de esto el aviso ya no sirve para oponerse a la prórroga. */
export const ANTELACION_UTIL_LCS = 30

/**
 * Con cuántos días de antelación se avisa de ESTA póliza.
 *
 * 🚨 `null` significa «no ha elegido» en los dos niveles, y por eso cae al
 * defecto y NUNCA a silencio: quien no ha entrado al portal no tiene fila, y
 * dejar de avisarle por no haber entrado es exactamente lo contrario de lo que
 * el aviso pretende (es lo que lo traería).
 */
export function antelacionEfectiva(
  excepcionDeLaPoliza: number | null | undefined,
  general: number | null | undefined,
  defecto: number = ANTELACION_DEFECTO,
): number {
  return excepcionDeLaPoliza ?? general ?? defecto
}

/** `null` (no ha elegido) es válido; un 0 o algo fuera de rango, no. */
export function antelacionValida(dias: number | null | undefined): boolean {
  if (dias === null || dias === undefined) return true
  return Number.isInteger(dias) && dias >= ANTELACION_MIN && dias <= ANTELACION_MAX
}

/**
 * `true` = a esa antelación el aviso ya no permite evitar la prórroga. NO
 * bloquea: la pantalla lo dice y lo manda igual. Dejar pedir algo inútil sin
 * decirlo es la misma mentira en versión amable.
 */
export function antelacionLlegaTarde(dias: number): boolean {
  return dias < ANTELACION_UTIL_LCS
}

/** El defecto es avisar. `null` = no ha elegido, que no es «no». */
export function avisarSiniestroEfectivo(elegido: boolean | null | undefined): boolean {
  return elegido ?? true
}
```

- [ ] **Step 4: Verlo pasar**

Run: `cd packages/module-seguros-portal && node --test src/preferencia-aviso.test.ts`
Expected: `# pass 6 # fail 0`.

- [ ] **Step 5: Verlo ROJO a propósito (uno por aserción)**

Rompe y restaura, una a una, pegando la salida:

1. `antelacionEfectiva`: cambia `?? defecto` por `?? 0` → falla el primero.
2. `antelacionValida`: quita la guarda de `dias >= ANTELACION_MIN` → falla el del rango.
3. `antelacionLlegaTarde`: cambia `<` por `<=` → falla el de la advertencia.
4. `avisarSiniestroEfectivo`: cambia `?? true` por `=== true` → falla el del defecto.

- [ ] **Step 6: Exportar y commitear**

En `packages/module-seguros-portal/src/index.ts`:

```ts
// La antelación del aviso y el interruptor del siniestro. `null` = «no ha
// elegido» en los dos, y cae al defecto — nunca a silencio.
export {
  ANTELACION_DEFECTO,
  ANTELACION_MIN,
  ANTELACION_MAX,
  ANTELACION_UTIL_LCS,
  antelacionEfectiva,
  antelacionValida,
  antelacionLlegaTarde,
  avisarSiniestroEfectivo,
} from './preferencia-aviso.ts'
```

```bash
git add packages/module-seguros-portal/src/preferencia-aviso.ts \
        packages/module-seguros-portal/src/preferencia-aviso.test.ts \
        packages/module-seguros-portal/src/index.ts
git commit -m "feat(module-seguros-portal): la antelacion efectiva, pura y con sus cuatro mutaciones rojas"
```

---

### Task 4: Declarar el modelo en Prisma (el GRANT ya está dado)

**Files:**
- Modify: `apps/asegura-portal/prisma/schema.prisma`
- Modify: `apps/asegura/prisma/asegura.prisma`

🚨 **Este orden no es negociable y ya mordió una vez en esta app:** el rol lee por COLUMNAS, así que declarar una columna sin conceder revienta **todas** las lecturas del modelo con `42501`. El GRANT se dio en la Tarea 1; por eso esta tarea va después.

- [ ] **Step 1: Añadir el modelo al schema del portal**

```prisma
/// La preferencia de avisos. `poliza_id` NULL = la general de esa identidad.
model PortalPreferenciaAviso {
  id               String                 @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  identidadId      String                 @map("identidad_id") @db.Uuid
  /// NULL = la preferencia general. Con valor = excepción de esa póliza, y
  /// entonces la BD solo le deja llevar `diasAntelacion` (CHECK).
  polizaId         String?                @map("poliza_id") @db.Uuid
  /// 🚨 NULL = «no ha elegido», NO cero.
  diasAntelacion   Int?                   @map("dias_antelacion")
  tiposSilenciados PortalObligacionTipo[] @map("tipos_silenciados")
  /// NULL = usa el defecto (avisar).
  avisarSiniestro  Boolean?               @map("avisar_siniestro")
  actualizadaEn    DateTime               @default(now()) @map("actualizada_en") @db.Timestamptz(6)

  identidad PortalIdentidad @relation(fields: [identidadId], references: [id], onDelete: Cascade)

  @@map("portal_preferencia_aviso")
  @@schema("seguros")
}
```

Y en `model PortalIdentidad`, añade la relación inversa:

```prisma
  preferencias PortalPreferenciaAviso[]
```

- [ ] **Step 2: Añadir el sello y el modelo (solo lectura) al schema de asegura**

En `apps/asegura/prisma/asegura.prisma`, dentro de `model Siniestro`:

```prisma
  /// Estado con el que se avisó al cliente. Se avisa cuando `estado <> avisadoEstado`.
  avisadoEstado        EstadoSiniestro?   @map("avisado_estado")
  avisadoEn            DateTime?          @map("avisado_en") @db.Timestamptz(6)
```

Y el modelo de la preferencia, que este rol solo LEE:

```prisma
/// La lee el cron para decidir si manda. El portal es quien la escribe.
model PortalPreferenciaAviso {
  id               String                 @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  identidadId      String                 @map("identidad_id") @db.Uuid
  polizaId         String?                @map("poliza_id") @db.Uuid
  diasAntelacion   Int?                   @map("dias_antelacion")
  tiposSilenciados PortalObligacionTipo[] @map("tipos_silenciados")
  avisarSiniestro  Boolean?               @map("avisar_siniestro")
  actualizadaEn    DateTime               @default(now()) @map("actualizada_en") @db.Timestamptz(6)

  @@map("portal_preferencia_aviso")
}
```

- [ ] **Step 3: Regenerar y typecheckear las DOS apps, una a una**

🚨 El cliente por defecto de Prisma es **uno solo** para todo el monorepo: generar una app pisa el de la otra y deja el typecheck de la segunda en rojo con errores que parecen de código. Se hace en dos tandas separadas:

```bash
cd apps/asegura-portal && npx prisma generate && npx tsc --noEmit -p tsconfig.json
cd ../asegura && npx prisma generate && npx prisma generate --schema prisma/asegura.prisma && npx tsc --noEmit -p tsconfig.json
```

Expected: las dos con código de salida 0.

- [ ] **Step 4: Commit**

```bash
git add apps/asegura-portal/prisma/schema.prisma apps/asegura/prisma/asegura.prisma
git commit -m "feat(portal): declara la preferencia de aviso y el sello del siniestro en Prisma"
```

---

### Task 5: Leer y escribir la preferencia (portal)

**Files:**
- Create: `apps/asegura-portal/lib/preferencias.ts`

- [ ] **Step 1: Escribir el módulo**

```ts
// La preferencia de avisos de la identidad de la COOKIE. Ningún `identidadId`
// entra desde fuera de este fichero — es la regla de aislamiento de esta app,
// y aquí no hay RLS que rescate un olvido.
import { antelacionValida } from '@central/module-seguros-portal'

import { prisma } from './db'
import { requireIdentidad } from './session'

export type PreferenciaAvisos = {
  /** `null` = no ha elegido; la pantalla enseña el defecto y lo dice. */
  diasAntelacion: number | null
  /** `null` = no ha elegido. El defecto es avisar. */
  avisarSiniestro: boolean | null
  /** Excepciones por póliza, solo con su antelación. */
  excepciones: { polizaId: string; diasAntelacion: number | null }[]
}

export async function preferenciasDeSesion(): Promise<PreferenciaAvisos> {
  const identidad = await requireIdentidad()
  // Sin `try/catch`: si la consulta falla, que suba. Devolver un objeto vacío
  // haría pasar un fallo de BD por «no has configurado nada» en la pantalla
  // donde la persona decide si lo configura.
  const filas = await prisma.portalPreferenciaAviso.findMany({
    where: { identidadId: identidad.id },
    select: { polizaId: true, diasAntelacion: true, avisarSiniestro: true },
  })
  const general = filas.find((f) => f.polizaId === null) ?? null
  return {
    diasAntelacion: general?.diasAntelacion ?? null,
    avisarSiniestro: general?.avisarSiniestro ?? null,
    excepciones: filas
      .filter((f): f is typeof f & { polizaId: string } => f.polizaId !== null)
      .map((f) => ({ polizaId: f.polizaId, diasAntelacion: f.diasAntelacion })),
  }
}

export type GuardarPreferencia =
  | { estado: 'ok' }
  | { estado: 'antelacion_invalida' }

/**
 * Guarda la preferencia GENERAL. La validación de rango la hace el módulo puro
 * (y la BD la repite con un CHECK): dos guardas, porque esta ruta la puede
 * llamar cualquiera con sesión.
 */
export async function guardarPreferenciaGeneral(p: {
  diasAntelacion: number | null
  avisarSiniestro: boolean | null
}): Promise<GuardarPreferencia> {
  if (!antelacionValida(p.diasAntelacion)) return { estado: 'antelacion_invalida' }
  const identidad = await requireIdentidad()
  await prisma.portalPreferenciaAviso.upsert({
    where: { identidadId_polizaId: { identidadId: identidad.id, polizaId: null } },
    create: {
      identidadId: identidad.id,
      diasAntelacion: p.diasAntelacion,
      avisarSiniestro: p.avisarSiniestro,
    },
    update: {
      diasAntelacion: p.diasAntelacion,
      avisarSiniestro: p.avisarSiniestro,
      actualizadaEn: new Date(),
    },
  })
  return { estado: 'ok' }
}
```

⚠️ **Si el `upsert` con `polizaId: null` no compila** (Prisma no siempre acepta un `null` dentro de un `@@unique` compuesto), usa el patrón que ya emplea `lib/invitaciones.ts`: intenta el `create` y lee el `P2002` como «ya existe» para hacer el `update`. Nunca un `SELECT` previo y un `if`: entre los dos cabe otra escritura.

- [ ] **Step 2: Typecheck**

Run: `cd apps/asegura-portal && npx prisma generate && npx tsc --noEmit -p tsconfig.json`
Expected: 0.

- [ ] **Step 3: Commit**

```bash
git add apps/asegura-portal/lib/preferencias.ts
git commit -m "feat(portal): leer y escribir la preferencia de avisos de la identidad de la cookie"
```

---

### Task 6: La pestaña «Avisos»

**Files:**
- Modify: `packages/module-seguros-portal/src/vista-portal.ts`
- Modify: `packages/module-seguros-portal/src/vista-portal.test.ts`
- Create: `apps/asegura-portal/app/(portal)/boveda/VistaAvisos.tsx`
- Create: `apps/asegura-portal/app/api/preferencias/route.ts`
- Modify: `apps/asegura-portal/app/(portal)/boveda/page.tsx`

🚨 **La barra ya tiene CUATRO pestañas** (Mis seguros · Recibos · Siniestros · Quién me ve) y se midió que a 390 px la cuarta se salía. **Una quinta NO va en la barra.** «Avisos» se monta como sección dentro de «Mis seguros», al lado de «Tus datos», que es donde ya vive lo que es configuración de la persona.

- [ ] **Step 1: NO tocar `vista-portal.ts`**

Sáltate este fichero. Si aun así decides que «Avisos» merece pestaña propia, **mide antes** el carril con Playwright a 320/360/390/412 con cinco etiquetas, y no lo des por bueno sin ver `navDesborda: 0` y `cortadas: []`.

- [ ] **Step 2: Escribir la pantalla**

```tsx
'use client'
import { useState } from 'react'

import {
  ANTELACION_DEFECTO,
  ANTELACION_MAX,
  ANTELACION_MIN,
  antelacionLlegaTarde,
} from '@central/module-seguros-portal'

/**
 * «Avisos»: lo único configurable de verdad de este portal.
 *
 * 🚨 REGLA DE REDACCIÓN DE TODA LA PANTALLA: se habla de lo que se ha PEDIDO,
 * no de lo que va a pasar. El portal no puede leer `clientes.email_opt_out_at`
 * (su rol no tiene esa columna), así que «recibirás un aviso el 30/07» sería
 * afirmar algo que no sabe. Dice «aquí has pedido que te avise 60 días antes».
 * Es la misma distinción que la bóveda ya hace entre «no hay» y «no lo sé».
 *
 * Y por lo mismo NO dice a qué correo escribe: solo tiene un hash con pimienta.
 * Dice «al correo con el que entras».
 *
 * ⚠️ NO hay siete interruptores de tipo de recordatorio, aunque el enum
 * `portal_obligacion_tipo` tenga siete valores: medido el 07/09/2026, el único
 * que alguien escribe es `poliza` (`lib/obligaciones.ts:105`). Seis
 * interruptores que no apagan nada son ruido que además promete recordatorios
 * que no existen.
 */
export function VistaAvisos({
  inicial,
}: {
  inicial: { diasAntelacion: number | null; avisarSiniestro: boolean | null }
}) {
  const [dias, setDias] = useState<number>(inicial.diasAntelacion ?? ANTELACION_DEFECTO)
  const [siniestro, setSiniestro] = useState<boolean>(inicial.avisarSiniestro ?? true)
  const [estado, setEstado] = useState<'reposo' | 'guardando' | 'guardado' | 'error'>('reposo')

  async function guardar() {
    setEstado('guardando')
    try {
      const r = await fetch('/api/preferencias', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ diasAntelacion: dias, avisarSiniestro: siniestro }),
      })
      setEstado(r.ok ? 'guardado' : 'error')
    } catch {
      setEstado('error')
    }
  }

  return (
    <section className="seccion" aria-labelledby="avisos-titulo">
      <h2 id="avisos-titulo">Avisos</h2>

      <p className="suave" style={{ fontSize: 14, marginTop: 0 }}>
        Aquí eliges cuándo te escribimos. Te avisamos al correo con el que entras.
      </p>

      <label htmlFor="dias" style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
        Avisarme antes de que venza una póliza
      </label>
      <input
        id="dias"
        type="number"
        min={ANTELACION_MIN}
        max={ANTELACION_MAX}
        value={dias}
        onChange={(e) => setDias(Number(e.target.value))}
        style={{ minHeight: 44, width: 120 }}
      />
      <span style={{ marginLeft: 8 }}>días antes</span>

      {inicial.diasAntelacion === null && (
        <p className="suave" style={{ fontSize: 13 }}>
          Todavía no lo has elegido: usamos {ANTELACION_DEFECTO} días.
        </p>
      )}

      {antelacionLlegaTarde(dias) && (
        <p className="pendiente" style={{ fontSize: 13 }}>
          A esa antelación ya no puedes evitar que la póliza se renueve sola —el plazo para
          comunicarlo es de un mes—. Te lo mandamos igual, por si quieres que la revisemos.
        </p>
      )}

      <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44, marginTop: 16 }}>
        <input type="checkbox" checked={siniestro} onChange={(e) => setSiniestro(e.target.checked)} />
        Avisarme cuando haya novedad en un siniestro mío
      </label>

      <button type="button" className="boton" onClick={guardar} disabled={estado === 'guardando'}>
        {estado === 'guardando' ? 'Guardando…' : 'Guardar'}
      </button>

      {estado === 'guardado' && (
        // «Has pedido», nunca «recibirás»: ver la cabecera de este fichero.
        <p className="confirmacion" style={{ fontSize: 14 }}>
          Guardado. Has pedido que te avisemos {dias} días antes.
        </p>
      )}
      {estado === 'error' && (
        <p className="error-linea" role="alert">
          No hemos podido guardarlo. Inténtalo otra vez.
        </p>
      )}
    </section>
  )
}
```

- [ ] **Step 3: La ruta**

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { guardarPreferenciaGeneral, preferenciasDeSesion } from '@/lib/preferencias'
import { getIdentidad } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const Cuerpo = z.object({
  diasAntelacion: z.number().int().nullable(),
  avisarSiniestro: z.boolean().nullable(),
})

export async function GET() {
  if (!(await getIdentidad())) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  return NextResponse.json(await preferenciasDeSesion())
}

export async function PUT(req: Request) {
  if (!(await getIdentidad())) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  const datos = Cuerpo.safeParse(await req.json().catch(() => null))
  if (!datos.success) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
  const r = await guardarPreferenciaGeneral(datos.data)
  if (r.estado === 'antelacion_invalida') {
    return NextResponse.json({ error: 'antelacion_invalida' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Montarla en la página**

En `apps/asegura-portal/app/(portal)/boveda/page.tsx`, dentro de `vista === 'seguros'`, justo antes de `<TusDatos …/>`:

```tsx
      <VistaAvisos
        inicial={{
          diasAntelacion: preferencias.diasAntelacion,
          avisarSiniestro: preferencias.avisarSiniestro,
        }}
      />
```

Y arriba, en el `Promise.all` de lecturas, añade `preferenciasDeSesion()`.

- [ ] **Step 5: Typecheck y commit**

```bash
cd apps/asegura-portal && npx prisma generate && npx tsc --noEmit -p tsconfig.json
git add apps/asegura-portal/app apps/asegura-portal/lib
git commit -m "feat(portal): la pantalla de Avisos, que habla de lo pedido y no de lo que pasara"
```

---

### Task 7: El cron de vencimiento lee de `polizas`, no de `portal_obligacion`

**Files:**
- Modify: `apps/asegura/lib/avisos-vencimiento.ts:188-196`

🚨 **Este es el cambio que decide si el aviso sirve para algo.** `portal_obligacion.identidad_id` es NOT NULL, así que una obligación no puede existir para quien todavía no ha entrado al portal: medido, **3 identidades con obligaciones, 6 filas, para 111 pólizas vivas**. Con el cron encendido hoy saldrían **3 correos**. Y es circular: el aviso es lo que traería a la gente al portal, pero solo existiría si ya hubieran venido.

- [ ] **Step 1: Cambiar la fuente de las candidatas**

Sustituye el `db.portalObligacion.findMany({…})` por una lectura de `polizas`:

```ts
  // 🚨 El vencimiento es un hecho de la CARTERA, no del portal: la sabe la
  // correduría lo sepa el cliente o no. Leerlo de `portal_obligacion` ataba el
  // aviso a que la persona ya hubiera entrado —3 de 80— y era circular: el
  // aviso es justo lo que la traería.
  //
  // Los otros seis tipos de obligación (itv, carnet, recibo…) SÍ siguen
  // saliendo de `portal_obligacion`: esos los declara el cliente y nadie más
  // los sabe. Hoy no los escribe nadie, así que esta consulta es la única viva.
  const polizasCandidatas = await db.poliza.findMany({
    where: {
      ...WHERE_CARTERA_VIVA,
      mergedIntoPolizaId: null,
      estado: { in: [...POLIZA_ESTADOS_VIGENTES] },
      cliente: { activo: true },
      fechaVencimiento: { gte: hoy, lte: new Date(hoy.getTime() + ANTELACION_MAX * MS_DIA) },
    },
    select: {
      id: true,
      aseguradora: true,
      numeroPoliza: true,
      primaAnual: true,
      fechaVencimiento: true,
      cliente: {
        select: {
          emailOptOutAt: true,
          email: true,
          emails: { select: { email: true, esPrincipal: true, createdAt: true } },
        },
      },
    },
    take: 500,
  })
```

- [ ] **Step 2: Aplicar la antelación de cada cliente**

La criba de SQL usa `ANTELACION_MAX` (120) porque no se sabe todavía qué antelación tiene cada uno; quien decide es el módulo puro, con la preferencia de esa identidad:

```ts
  // La antelación de cada póliza sale de la preferencia de SU titular, si la
  // tiene. Sin preferencia = el defecto, nunca silencio.
  const prefs = await db.portalPreferenciaAviso.findMany({
    select: { identidadId: true, polizaId: true, diasAntelacion: true },
  })
  // … resolver `antelacionEfectiva(excepcion, general)` por póliza y quedarse
  // con las que hoy caen dentro de su ventana.
```

⚠️ **Cómo se ata una preferencia a una póliza**: la preferencia es de una IDENTIDAD y la póliza es de una FICHA, así que el puente es `portal_vinculo`. Ese join hay que **escribirlo y medirlo**: hoy hay 4 vínculos, así que casi ninguna póliza tendrá preferencia y casi todas caerán al defecto — que es lo correcto y hay que comprobar que es lo que pasa, no suponerlo.

- [ ] **Step 3: Las TRES condiciones del envío**

```ts
  // 🚨 Se envía SOLO si: la preferencia no lo silencia Y `emailOptOutAt` está
  // vacío Y el correo es legible. Cualquiera de las tres que diga no, no sale —
  // y se cuenta como `sinCanal`, no se resta del total. Una baja no se reabre
  // por haber entrado al portal (art. 21 LSSI).
```

- [ ] **Step 4: Ensayo contra la BD, y la puerta del §6**

Run: `GET /api/cron/avisos-vencimiento?contar=1` con `Authorization: Bearer $CRON_SECRET`.

Expected: `candidatas` **≤ 110** (las pólizas vivas de CIMA). Si sale de miles, el filtro de cartera viva no funciona: **no enciendas nada** y vuelve a la Tarea 7.

⚠️ Antes de esto, Alberto tiene que mirar las **18 pólizas vivas vencidas y aún en estado `activa`** (§6.0): o CIMA no refresca la fecha al renovar, o caducaron de verdad. Es una consulta, no código, y decide si el recuento significa algo.

- [ ] **Step 5: Commit**

```bash
git add apps/asegura/lib/avisos-vencimiento.ts
git commit -m "fix(asegura): el aviso de vencimiento sale de la cartera, no de quien ya entro al portal"
```

---

### Task 8: El aviso de siniestro

**Files:**
- Create: `apps/asegura/lib/correo-aviso-siniestro.ts`
- Test: `apps/asegura/lib/correo-aviso-siniestro.test.ts`
- Create: `apps/asegura/lib/avisos-siniestro.ts`
- Create: `apps/asegura/app/api/cron/avisos-siniestro/route.ts`
- Modify: `apps/asegura/vercel.json`

- [ ] **Step 1: El cepo del correo, primero**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'

import { CAMPOS_PROHIBIDOS_EN_INVITACION } from '@central/module-seguros-portal'

import { cuerpoAvisoSiniestro } from './correo-aviso-siniestro.ts'

const aplanar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

test('🚨 el aviso de siniestro no nombra NINGUN campo de la cartera', () => {
  const c = cuerpoAvisoSiniestro({ nombre: 'Jose Suarez', enlace: 'https://portal.example.com/' })
  const todo = aplanar([c.asunto, c.texto, c.html].join('\n'))
  const colados = CAMPOS_PROHIBIDOS_EN_INVITACION.filter((x) => todo.includes(aplanar(x)))
  assert.deepEqual(colados, [], 'un correo se reenvía y sobrevive en buzones compartidos')
})

test('🚨 no dice el ESTADO del siniestro', () => {
  // «Tu siniestro ha sido rechazado» no puede acabar en el correo del trabajo
  // de nadie. Lo que se dice es que hay novedad; el estado se ve DENTRO.
  const c = cuerpoAvisoSiniestro({ nombre: null, enlace: 'https://portal.example.com/' })
  const todo = aplanar([c.asunto, c.texto, c.html].join('\n'))
  for (const estado of ['abierto', 'en tramitacion', 'cerrado', 'rechazado']) {
    assert.ok(!todo.includes(aplanar(estado)), `no puede aparecer «${estado}»`)
  }
})

test('el enlace lleva al portal y NO abre sesion por si mismo', () => {
  const c = cuerpoAvisoSiniestro({ nombre: null, enlace: 'https://portal.example.com/' })
  assert.ok(c.texto.includes('https://portal.example.com/'))
  assert.ok(aplanar(c.texto).includes('no abre sesion por si mismo'))
})
```

- [ ] **Step 2: Verlo fallar**

Run: `cd apps/asegura && node --test lib/correo-aviso-siniestro.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: El cuerpo del correo**

```ts
/**
 * «Hay novedad en un expediente tuyo.»
 *
 * 🚨 Y nada más: ni el estado, ni la compañía, ni el número, ni el importe.
 * Mismo cepo que el correo de invitación (`CAMPOS_PROHIBIDOS_EN_INVITACION`) y
 * por el mismo motivo: un correo se reenvía y sobrevive en buzones compartidos.
 * «Tu siniestro ha sido rechazado» no puede acabar en el correo del trabajo de
 * nadie.
 *
 * El enlace abre SU siniestro, no una oferta: colgar la venta de este correo lo
 * convertiría en comunicación comercial (art. 21 LSSI) y quemaría la confianza
 * de quien lo abre porque se ha movido su expediente. El escaparate cuelga del
 * VENCIMIENTO, que es cuando ofrecer revisar la póliza es el trabajo.
 */
export function cuerpoAvisoSiniestro(d: { nombre: string | null; enlace: string }): {
  asunto: string
  texto: string
  html: string
} {
  const saludo = d.nombre ? `Hola, ${d.nombre}:` : 'Hola:'
  const asunto = 'Hay novedad en un expediente tuyo'
  const texto =
    `${saludo}\n\n` +
    `Hay novedad en uno de tus expedientes. Puedes verlo aquí:\n${d.enlace}\n\n` +
    `Este enlace no abre sesión por sí mismo: te pediremos un código de un solo uso.\n\n` +
    `— Grupo ASegura`
  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px">` +
    `<p>${saludo}</p><p>Hay novedad en uno de tus expedientes.</p>` +
    `<p><a href="${d.enlace}">Verlo en Mis Seguros</a></p>` +
    `<p style="color:#666;font-size:13px">Este enlace no abre sesión por sí mismo: te pediremos un código de un solo uso.</p></div>`
  return { asunto, texto, html }
}
```

- [ ] **Step 4: Verlo pasar, y ROJO**

Run: `cd apps/asegura && node --test lib/correo-aviso-siniestro.test.ts` → `# pass 3 # fail 0`.

Rómpelo: mete `Estado: cerrado` en el `texto` → el segundo test falla. Mete `Póliza nº 12345` → el primero falla. Restaura.

- [ ] **Step 5: Las cuatro guardas del envío**

En `apps/asegura/lib/avisos-siniestro.ts`, con el mismo esqueleto que `avisos-vencimiento.ts` (interruptor, modo cuenta, `sinCanal`, sello inmediato):

```ts
// Las CUATRO guardas, y ninguna es opcional:
//
// 1. SOLO AL TITULAR. Un tercero autorizado no puede *ver* siniestros
//    (`NUNCA_A_UN_TERCERO.siniestros === false`); mandarle un correo sería peor
//    que la pantalla que se le niega. Solo identidades con `portal_vinculo` a
//    la ficha dueña de la póliza.
// 2. SOLO CARTERA VIVA (`WHERE_CARTERA_VIVA`). Sin esto, siniestros del volcado.
// 3. EL INTERRUPTOR: `avisarSiniestroEfectivo(pref?.avisarSiniestro)`.
// 4. SELLO INMEDIATO tras el envío aceptado, y si el sello falla SE GRITA —
//    igual que el de vencimiento: el correo ya salió y un reintento lo repetiría.
const candidatos = await db.siniestro.findMany({
  where: {
    OR: [{ avisadoEstado: null }, { NOT: { avisadoEstado: { equals: db.siniestro.fields.estado } } }],
  },
})
```

⚠️ Si Prisma no deja comparar dos columnas en el `where` (`fields` es de Prisma 5.x y no siempre está), **tráete las filas candidatas por fecha y filtra en código** con `s.estado !== s.avisadoEstado`. No inventes un `$queryRaw` con la comparación dentro sin necesidad.

- [ ] **Step 6: El endpoint y el cron**

Copia literal la puerta de `app/api/cron/avisos-vencimiento/route.ts` (`isCronAuthorized`, `?contar=1`, 503 con causa clasificada). En `apps/asegura/vercel.json`, junto al que ya hay:

```json
    {
      "path": "/api/cron/avisos-siniestro",
      "schedule": "0 9 * * *"
    }
```

(09:00 UTC, una hora después del de vencimiento: no compiten por el mismo minuto ni por la misma bandeja.)

- [ ] **Step 7: Ensayo**

Run: `GET /api/cron/avisos-siniestro?contar=1`
Expected: **`candidatas: 0`** — porque la Tarea 2 selló todos los siniestros existentes. Si sale distinto de 0, la siembra no se aplicó: **para y vuelve a la Tarea 2** antes de encender nada.

- [ ] **Step 8: Commit**

```bash
git add apps/asegura/lib/correo-aviso-siniestro.ts apps/asegura/lib/correo-aviso-siniestro.test.ts \
        apps/asegura/lib/avisos-siniestro.ts apps/asegura/app/api/cron/avisos-siniestro apps/asegura/vercel.json
git commit -m "feat(asegura): el aviso de siniestro, con sus cuatro guardas y el correo que no dice el estado"
```

---

### Task 9: Los cepos de raíz

**Files:**
- Create: `test/regression-portal-avisos.test.ts`

- [ ] **Step 1: Escribirlos**

Los nueve del §7 del spec, menos los que ya cubren los tests de las tareas anteriores. Los que **solo** pueden vivir aquí, porque son sobre el fuente de otra app:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const RAIZ = new URL('..', import.meta.url).pathname
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const CRON = sinComentarios(readFileSync(`${RAIZ}apps/asegura/lib/avisos-vencimiento.ts`, 'utf8'))
const PANTALLA = sinComentarios(
  readFileSync(`${RAIZ}apps/asegura-portal/app/(portal)/boveda/VistaAvisos.tsx`, 'utf8'),
)

test('🚨 el vencimiento se lee de `polizas`, NO de `portal_obligacion`', () => {
  // Cepo 8 del spec. Si vuelve a `portalObligacion`, el aviso alcanza solo a
  // quien ya entró al portal —3 personas— y nada falla.
  assert.match(CRON, /db\.poliza\.findMany/, 'las candidatas salen de la cartera')
  assert.doesNotMatch(
    CRON,
    /db\.portalObligacion\.findMany\([\s\S]{0,200}fechaAccionable/,
    'el vencimiento no puede volver a depender de que el cliente haya entrado',
  )
})

test('🚨 la pantalla NO dice «recibirás»', () => {
  // Cepo 5. El portal no puede leer `email_opt_out_at`, así que prometer un
  // envío es afirmar algo que no sabe.
  assert.doesNotMatch(PANTALLA, /recibir[áa]s/i, 'se habla de lo PEDIDO, no de lo que pasará')
  assert.match(PANTALLA, /has pedido/i, 'y hay que decirlo con esas palabras (cepo positivo)')
})

test('🚨 la pantalla no promete un canal que no existe', () => {
  // La WABA no existe. Un desplegable con WhatsApp o SMS es peor que no tenerlo.
  assert.doesNotMatch(PANTALLA, /whatsapp|sms/i, 'el canal es el correo, y punto')
})
```

- [ ] **Step 2: Verlos ROJOS**

Uno por aserción, restaurando después:

1. Cambia `db.poliza.findMany` por `db.portalObligacion.findMany` en el cron → falla el primero.
2. Cambia «Has pedido que te avisemos» por «Recibirás un aviso» → fallan las dos aserciones del segundo.
3. Añade la palabra `WhatsApp` a la pantalla → falla el tercero.

Pega la salida de los tres rojos en el PR. Un cepo que no se ha visto morder es una suposición.

- [ ] **Step 3: Suite completa y commit**

```bash
node --test test/*.test.ts
cd packages/module-seguros-portal && node --test src/*.test.ts
cd ../../apps/asegura && node --test lib/*.test.ts
```

Expected: los tres con `# fail 0`.

```bash
git add test/regression-portal-avisos.test.ts
git commit -m "test: los cepos de raiz de los avisos, los tres vistos rojos"
```

---

### Task 10: Encender el cron — y esto es de Alberto, no del código

- [ ] **Step 1: Mirar las 18 vencidas-pero-`activa`** (§6.0). O CIMA no refresca la fecha al renovar, o caducaron de verdad. Decide si el recuento del paso siguiente significa algo.
- [ ] **Step 2:** `GET /api/cron/avisos-vencimiento?contar=1` — ensayo, no envía.
- [ ] **Step 3:** Comprobar que el número sale **≤ 110**. Si sale de miles, **no se enciende nada**.
- [ ] **Step 4:** Solo entonces `ASEGURA_AVISOS_ACTIVOS=1` en Vercel **y redesplegar** — una env nueva no se aplica hasta que hay un deployment nuevo, y en este repo el `ignoreCommand` cancela los que no tocan la app: el que la activa es el siguiente PR que toque `apps/asegura`.

---

## Riesgos abiertos (del spec, y siguen abiertos)

- **29 de 80 clientes no tienen correo.** Para ellos ningún aviso de este diseño existe, y el panel tampoco: sin correo no hay código de acceso. Es teléfono, no código.
- **Nadie ve a quién se avisó y a quién no se pudo.** El sello ya existe (`avisada_at`, `avisado_en`) y no lo mira nadie: cuando un cliente diga «a mí no me avisasteis», hoy no hay con qué contestarle. Una pantalla en `/correduria` que lo enseñe está **fuera de esta entrega** y anotada.
- **Con 5 identidades, esto se construye para casi nadie todavía.** El orden que lo hace útil: encender el cron → invitar a los 46 → mirar quién entra. El panel vale lo que valga esa invitación.
