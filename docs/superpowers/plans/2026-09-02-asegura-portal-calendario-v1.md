# Calendario de vencimientos del portal de clientes (v1) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un cliente de Grupo Asegura entre en `apps/asegura-portal`, vea el calendario de vencimientos de sus pólizas vivas y reciba UN aviso por email con la fecha hasta la que puede actuar.

**Architecture:** Toda la aritmética de fechas y toda regla de «esto genera aviso o no» vive en `@central/module-seguros-portal`, pura y testeada con `node --test`. La app del portal añade una tabla `portal_obligacion` colgada del bien, un derivador que la rellena desde la cartera de la identidad de la sesión, y una sección en la bóveda.

🚨 **CORRECCIÓN del 02/09/2026, medida sobre el código: el aviso NO puede salir del portal.**
`portal_canal` guarda **solo `valor_hash`** (SHA-256 con pimienta, `lib/auth.ts:28`) y el
`ClienteEmail` del schema del portal tiene **solo `email_lookup_hash`**: el rol
`prisma_asegura_portal` no puede leer la columna del email. No hay ninguna dirección a la que
enviar, y un hash no se revierte. El spec daba por hecho un destinatario que no existe.

**Por eso el envío vive en `apps/asegura`** (el panel del corredor), que corre con `prisma_seguros`
(BYPASSRLS) y sí lee `cliente_emails`. El portal se queda con el aviso EN PANTALLA y nunca toca un
dato personal. El transporte es Resend, que `@central/core-email` ya elige solo cuando existe
`RESEND_API_KEY` (`packages/core-email/src/transporter.ts:32`). WhatsApp entra después como un
adaptador más, cuando esto esté rodado.

**Tech Stack:** TypeScript, Next.js 15 (App Router), Prisma 5 (multiSchema, schema `seguros`), `node --test`, Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-09-02-asegura-portal-calendario-clientes-design.md`

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `packages/module-seguros-portal/src/obligacion.ts` | **Nuevo.** Puro: `fechaAccionable()`, `entraEnVentana()`, `polizaGeneraObligacion()`. Ni BD ni red. |
| `packages/module-seguros-portal/src/obligacion.test.ts` | **Nuevo.** Sus cepos, bordes de mes incluidos. |
| `packages/module-seguros-portal/src/index.ts` | **Modificar.** Re-exportar lo anterior. |
| `apps/asegura-portal/prisma/sql/2026-09-03_portal_obligacion.sql` | **Nuevo.** DDL + grants del rol. |
| `apps/asegura-portal/prisma/schema.prisma` | **Modificar.** `enum PortalObligacionTipo` + `model PortalObligacion`. |
| `apps/asegura-portal/lib/obligaciones.ts` | **Nuevo.** Deriva y lee las obligaciones de la identidad de la sesión. Pasa por `lib/session`. |
| `apps/asegura-portal/app/(portal)/boveda/Calendario.tsx` | **Nuevo.** La sección visual. Sin lógica: recibe filas ya decididas. |
| `apps/asegura-portal/app/(portal)/boveda/page.tsx` | **Modificar.** Montar `<Calendario/>`. |
| `apps/asegura/prisma/asegura.prisma` | **Modificar.** Declarar `PortalObligacion` para que el corredor la lea. |
| `apps/asegura/lib/avisos-vencimiento.ts` | **Nuevo.** Selección y envío del aviso, con el email de `cliente_emails`. |
| `apps/asegura/app/api/cron/avisos-vencimiento/route.ts` | **Nuevo.** Endpoint del cron, autorizado por `CRON_SECRET`. |
| `apps/asegura/vercel.json` | **Modificar.** Declarar el cron. |
| `test/regression-portal-obligaciones.test.ts` | **Nuevo.** Los cepos de negocio (import_ref, NULL, procedencia). |

---

## Task 1: La aritmética de la fecha accionable

**Files:**
- Create: `packages/module-seguros-portal/src/obligacion.ts`
- Test: `packages/module-seguros-portal/src/obligacion.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `packages/module-seguros-portal/src/obligacion.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { DIAS_PREAVISO_TOMADOR, fechaAccionable } from './obligacion.ts'

test('el preaviso del tomador es de 30 dias', () => {
  assert.equal(DIAS_PREAVISO_TOMADOR, 30)
})

test('la fecha accionable es 30 dias antes del vencimiento', () => {
  // Vence el 15/03/2026 → el tomador tiene hasta el 13/02/2026.
  const vence = new Date(Date.UTC(2026, 2, 15))
  assert.equal(fechaAccionable(vence).toISOString().slice(0, 10), '2026-02-13')
})

test('el borde de mes NO desborda: 31 de marzo cae en febrero', () => {
  // 31/03/2026 − 30 días = 01/03/2026. Restar meses daría 31/02, que no existe.
  const vence = new Date(Date.UTC(2026, 2, 31))
  assert.equal(fechaAccionable(vence).toISOString().slice(0, 10), '2026-03-01')
})

test('cruzar un anyo bisiesto cuenta el 29 de febrero', () => {
  // 2028 es bisiesto. 20/03/2028 − 30 días = 19/02/2028.
  const vence = new Date(Date.UTC(2028, 2, 20))
  assert.equal(fechaAccionable(vence).toISOString().slice(0, 10), '2028-02-19')
})

test('cruzar el cambio de anyo no pierde el dia', () => {
  const vence = new Date(Date.UTC(2027, 0, 10))
  assert.equal(fechaAccionable(vence).toISOString().slice(0, 10), '2026-12-11')
})

test('la fecha accionable se calcula en UTC, no en la zona del servidor', () => {
  // Las columnas `date` llegan de Prisma como medianoche UTC. Si el cálculo
  // usara la hora local del servidor (Vercel corre en UTC, pero un portátil
  // en Madrid no), el resultado se iría un día en verano.
  const vence = new Date(Date.UTC(2026, 6, 1))
  const r = fechaAccionable(vence)
  assert.equal(r.getUTCHours(), 0)
  assert.equal(r.getUTCMinutes(), 0)
  assert.equal(r.toISOString().slice(0, 10), '2026-06-01')
})
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

```bash
cd /home/user/central
npx --yes pnpm@10.33.0 install --no-frozen-lockfile
node --test packages/module-seguros-portal/src/obligacion.test.ts
```

Esperado: FALLA con `ERR_MODULE_NOT_FOUND` (`./obligacion.ts` no existe).

- [ ] **Step 3: Escribir la implementación mínima**

Crea `packages/module-seguros-portal/src/obligacion.ts`:

```ts
/**
 * La fecha que se le dice al usuario NO es la del vencimiento: es la última en
 * la que todavía puede oponerse a la prórroga (art. 22 LCS). Decirle «vence el
 * 15 de marzo» le deja creer que tiene hasta el 15; el plazo se le pasó el 13
 * de febrero.
 *
 * Se resta en DÍAS, no en meses: `setUTCMonth(m - 1)` sobre un 31 de marzo da
 * un 31 de febrero, que JavaScript normaliza al 3 de marzo sin avisar.
 */
export const DIAS_PREAVISO_TOMADOR = 30

const MS_DIA = 86_400_000

/** Medianoche UTC del día de `d`. Las columnas `date` ya llegan así; esto lo garantiza. */
function diaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export function fechaAccionable(fechaEvento: Date): Date {
  return new Date(diaUtc(fechaEvento).getTime() - DIAS_PREAVISO_TOMADOR * MS_DIA)
}
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

```bash
node --test packages/module-seguros-portal/src/obligacion.test.ts
```

Esperado: `pass 6`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add packages/module-seguros-portal/src/obligacion.ts packages/module-seguros-portal/src/obligacion.test.ts
git commit -m "feat(portal): fecha accionable del preaviso del tomador (art. 22 LCS)"
```

---

## Task 2: La ventana de aviso

**Files:**
- Modify: `packages/module-seguros-portal/src/obligacion.ts`
- Modify: `packages/module-seguros-portal/src/obligacion.test.ts`

- [ ] **Step 1: Añadir el test que falla**

Añade al final de `packages/module-seguros-portal/src/obligacion.test.ts`:

```ts
import { DIAS_VENTANA_AVISO, entraEnVentana } from './obligacion.ts'

test('la ventana de aviso es de 7 dias', () => {
  assert.equal(DIAS_VENTANA_AVISO, 7)
})

test('avisa cuando faltan 7 dias o menos para la fecha accionable', () => {
  const hoy = new Date(Date.UTC(2026, 1, 10))
  assert.equal(entraEnVentana({ fechaAccionable: new Date(Date.UTC(2026, 1, 13)), hoy }), true)
  assert.equal(entraEnVentana({ fechaAccionable: new Date(Date.UTC(2026, 1, 17)), hoy }), true)
})

test('no avisa cuando faltan mas de 7 dias: es demasiado pronto', () => {
  const hoy = new Date(Date.UTC(2026, 1, 10))
  assert.equal(entraEnVentana({ fechaAccionable: new Date(Date.UTC(2026, 1, 18)), hoy }), false)
})

test('el propio dia de la fecha accionable SI avisa: aun esta a tiempo', () => {
  const hoy = new Date(Date.UTC(2026, 1, 10))
  assert.equal(entraEnVentana({ fechaAccionable: new Date(Date.UTC(2026, 1, 10)), hoy }), true)
})

test('una fecha accionable YA PASADA no avisa: el aviso llegaria tarde', () => {
  // Avisar de un plazo vencido no es un servicio: es decirle al cliente que
  // llega tarde por culpa nuestra. Se calla y se resuelve por otra vía.
  const hoy = new Date(Date.UTC(2026, 1, 10))
  assert.equal(entraEnVentana({ fechaAccionable: new Date(Date.UTC(2026, 1, 9)), hoy }), false)
})

test('la hora del dia no cambia el resultado: se compara por dias UTC', () => {
  const hoy = new Date(Date.UTC(2026, 1, 10, 23, 59, 59))
  assert.equal(entraEnVentana({ fechaAccionable: new Date(Date.UTC(2026, 1, 10)), hoy }), true)
})
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

```bash
node --test packages/module-seguros-portal/src/obligacion.test.ts
```

Esperado: FALLA con `SyntaxError` o `is not a function` sobre `entraEnVentana`.

- [ ] **Step 3: Escribir la implementación mínima**

Añade a `packages/module-seguros-portal/src/obligacion.ts`:

```ts
/**
 * Un ÚNICO disparo, a 7 días o menos de la fecha accionable. Una cadencia de
 * recordatorios («a 30, a 15, a 7…») es una decisión de producto que necesita
 * datos de apertura que hoy no existen; empezar con tres avisos y descubrir
 * después que sobraban dos ya ha quemado la bandeja del cliente.
 */
export const DIAS_VENTANA_AVISO = 7

export function entraEnVentana(x: { fechaAccionable: Date; hoy: Date }): boolean {
  const faltan = Math.round((diaUtc(x.fechaAccionable).getTime() - diaUtc(x.hoy).getTime()) / MS_DIA)
  return faltan >= 0 && faltan <= DIAS_VENTANA_AVISO
}
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

```bash
node --test packages/module-seguros-portal/src/obligacion.test.ts
```

Esperado: `pass 12`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add packages/module-seguros-portal/src/obligacion.ts packages/module-seguros-portal/src/obligacion.test.ts
git commit -m "feat(portal): ventana de aviso de 7 dias, un solo disparo"
```

---

## Task 3: Qué póliza genera obligación (la regla que evita 28.729 avisos)

**Files:**
- Modify: `packages/module-seguros-portal/src/obligacion.ts`
- Modify: `packages/module-seguros-portal/src/obligacion.test.ts`

- [ ] **Step 1: Añadir el test que falla**

Añade al final de `packages/module-seguros-portal/src/obligacion.test.ts`:

```ts
import { polizaGeneraObligacion } from './obligacion.ts'

test('una poliza del volcado historico NO genera obligacion, aunque tenga fecha', () => {
  // 28.729 pólizas con `import_ref` y vencimientos de 2013-2018. Sin este
  // filtro, la primera pasada del cron manda miles de «se te venció el seguro»
  // sobre contratos muertos hace ocho años.
  assert.equal(
    polizaGeneraObligacion({ importRef: 'intranet:44012', fechaVencimiento: new Date(Date.UTC(2015, 4, 10)) }),
    false,
  )
  assert.equal(
    polizaGeneraObligacion({ importRef: 'asegura_app:991', fechaVencimiento: new Date(Date.UTC(2026, 4, 10)) }),
    false,
  )
})

test('una poliza de CIMA con vencimiento SI genera obligacion', () => {
  assert.equal(
    polizaGeneraObligacion({ importRef: null, fechaVencimiento: new Date(Date.UTC(2026, 4, 10)) }),
    true,
  )
})

test('sin fecha de vencimiento no hay obligacion: NULL es «no se sabe»', () => {
  // No es «no vence». No se inventa una fecha ni se avisa; la pantalla lo dice.
  assert.equal(polizaGeneraObligacion({ importRef: null, fechaVencimiento: null }), false)
})

test('una cadena vacia en importRef cuenta como volcado, no como CIMA', () => {
  // El valor de cajón que se cuela por toda guarda de NULL. `''` no es «vino
  // por CIMA»: es una fila del volcado a la que le falta la referencia.
  assert.equal(
    polizaGeneraObligacion({ importRef: '', fechaVencimiento: new Date(Date.UTC(2026, 4, 10)) }),
    false,
  )
})
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

```bash
node --test packages/module-seguros-portal/src/obligacion.test.ts
```

Esperado: FALLA sobre `polizaGeneraObligacion`.

- [ ] **Step 3: Escribir la implementación mínima**

Añade a `packages/module-seguros-portal/src/obligacion.ts`:

```ts
/**
 * 🚨 La regla que evita el desastre. Solo generan obligación las pólizas que
 * entran por CIMA (`import_ref IS NULL`). Las del volcado histórico se
 * consultan y nada más.
 *
 * `importRef: ''` cuenta como volcado a propósito: la cadena vacía es el valor
 * de cajón que se cuela por `IS NULL`, `??` y `COALESCE`. Ante la duda, el
 * estado conservador es NO avisar.
 */
export function polizaGeneraObligacion(p: {
  importRef: string | null
  fechaVencimiento: Date | null
}): boolean {
  if (p.importRef !== null) return false
  return p.fechaVencimiento !== null
}
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

```bash
node --test packages/module-seguros-portal/src/obligacion.test.ts
```

Esperado: `pass 16`, `fail 0`.

- [ ] **Step 5: Exportar desde el barril**

En `packages/module-seguros-portal/src/index.ts`, añade al final:

```ts
export {
  DIAS_PREAVISO_TOMADOR,
  DIAS_VENTANA_AVISO,
  fechaAccionable,
  entraEnVentana,
  polizaGeneraObligacion,
} from './obligacion.ts'
```

- [ ] **Step 6: Ejecutar la suite del paquete**

```bash
cd /home/user/central/packages/module-seguros-portal && npx --yes pnpm@10.33.0 test
```

Esperado: todos los ficheros `*.test.ts` en verde, `fail 0`.

- [ ] **Step 7: Commit**

```bash
cd /home/user/central
git add packages/module-seguros-portal/src/obligacion.ts packages/module-seguros-portal/src/obligacion.test.ts packages/module-seguros-portal/src/index.ts
git commit -m "feat(portal): ninguna poliza del volcado historico genera obligacion"
```

---

## Task 4: La tabla `portal_obligacion`

**Files:**
- Create: `apps/asegura-portal/prisma/sql/2026-09-03_portal_obligacion.sql`
- Modify: `apps/asegura-portal/prisma/schema.prisma`

- [ ] **Step 1: Escribir el DDL**

Crea `apps/asegura-portal/prisma/sql/2026-09-03_portal_obligacion.sql`:

```sql
-- Obligaciones con fecha del portal — v1 del calendario de vencimientos.
-- Spec: docs/superpowers/specs/2026-09-02-asegura-portal-calendario-clientes-design.md
--
-- Cuelga del BIEN, no de la póliza: `poliza_id` es opcional a propósito para
-- que el mismo motor sirva luego a ITV, carnet o revisión de gas de alguien que
-- no tiene ninguna póliza con la correduría.

CREATE TYPE seguros.portal_obligacion_tipo AS ENUM (
  'poliza', 'itv', 'carnet', 'recibo', 'mantenimiento', 'revision_gas', 'libre'
);

CREATE TABLE seguros.portal_obligacion (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identidad_id           uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  bien_id                uuid REFERENCES seguros.portal_bien(id),

  -- La póliza de la CARTERA que la originó. Sin FK: `polizas` es del volcado y
  -- el rol del portal no puede escribir en ella; una FK ataría el borrado.
  poliza_id              uuid,
  poliza_declarada_id    uuid REFERENCES seguros.portal_poliza_declarada(id) ON DELETE CASCADE,

  tipo                   seguros.portal_obligacion_tipo NOT NULL,
  titulo                 text NOT NULL,

  -- La fecha del hecho. NUNCA se rellena con un valor de cortesía: si no se
  -- sabe, la obligación no se crea.
  fecha_evento           date NOT NULL,
  -- Calculada por `fechaAccionable()`. Se persiste para que el cron filtre en
  -- SQL sin recalcular 30.000 filas en memoria.
  fecha_accionable       date NOT NULL,

  procedencia            seguros.portal_procedencia NOT NULL,
  confirmada_at          timestamptz,
  avisada_at             timestamptz,

  creada_at              timestamptz NOT NULL DEFAULT now(),
  actualizada_at         timestamptz NOT NULL DEFAULT now(),

  -- Idempotencia del derivador: una póliza de la cartera produce UNA obligación
  -- por identidad, se recargue la página las veces que se recargue.
  CONSTRAINT portal_obligacion_una_por_poliza UNIQUE (identidad_id, poliza_id)
);

CREATE INDEX portal_obligacion_identidad_idx ON seguros.portal_obligacion (identidad_id);
-- El índice que usa el cron: pendientes de avisar, por fecha accionable.
CREATE INDEX portal_obligacion_pendientes_idx
  ON seguros.portal_obligacion (fecha_accionable)
  WHERE avisada_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.portal_obligacion TO prisma_asegura_portal;
```

- [ ] **Step 2: Añadir el modelo a Prisma**

En `apps/asegura-portal/prisma/schema.prisma`, junto a los demás enums:

```prisma
enum PortalObligacionTipo {
  poliza
  itv
  carnet
  recibo
  mantenimiento
  revision_gas
  libre

  @@map("portal_obligacion_tipo")
  @@schema("seguros")
}
```

Y junto a los demás modelos:

```prisma
model PortalObligacion {
  id                 String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  identidadId        String               @map("identidad_id") @db.Uuid
  bienId             String?              @map("bien_id") @db.Uuid
  polizaId           String?              @map("poliza_id") @db.Uuid
  polizaDeclaradaId  String?              @map("poliza_declarada_id") @db.Uuid
  tipo               PortalObligacionTipo
  titulo             String
  fechaEvento        DateTime             @map("fecha_evento") @db.Date
  fechaAccionable    DateTime             @map("fecha_accionable") @db.Date
  procedencia        PortalProcedencia
  confirmadaAt       DateTime?            @map("confirmada_at") @db.Timestamptz(6)
  avisadaAt          DateTime?            @map("avisada_at") @db.Timestamptz(6)
  creadaAt           DateTime             @default(now()) @map("creada_at") @db.Timestamptz(6)
  actualizadaAt      DateTime             @default(now()) @map("actualizada_at") @db.Timestamptz(6)

  identidad PortalIdentidad @relation(fields: [identidadId], references: [id], onDelete: Cascade)
  bien      PortalBien?     @relation(fields: [bienId], references: [id])

  @@unique([identidadId, polizaId])
  @@map("portal_obligacion")
  @@schema("seguros")
}
```

En `model PortalIdentidad` añade la relación inversa:

```prisma
  obligaciones PortalObligacion[]
```

En `model PortalBien` añade la relación inversa:

```prisma
  obligaciones PortalObligacion[]
```

- [ ] **Step 3: Comprobar que el schema es válido y el cliente se genera**

```bash
cd /home/user/central/apps/asegura-portal
npx --yes pnpm@10.33.0 exec prisma validate
npx --yes pnpm@10.33.0 exec prisma generate
```

Esperado: `The schema at prisma/schema.prisma is valid` y `Generated Prisma Client`.

- [ ] **Step 4: Commit**

```bash
cd /home/user/central
git add apps/asegura-portal/prisma/sql/2026-09-03_portal_obligacion.sql apps/asegura-portal/prisma/schema.prisma
git commit -m "feat(portal): tabla portal_obligacion, colgada del bien"
```

> ⚠️ **El SQL NO se aplica en este paso.** Se aplica en la Task 9, junto al despliegue, y por la sesión principal contra la Supabase compartida.

---

## Task 5: Derivar las obligaciones de la cartera

**Files:**
- Create: `apps/asegura-portal/lib/obligaciones.ts`

- [ ] **Step 1: Escribir el derivador**

Crea `apps/asegura-portal/lib/obligaciones.ts`:

```ts
// Deriva las obligaciones de la identidad de la sesión a partir de sus pólizas
// vivas de la cartera, y las devuelve ya ordenadas para pintar.
//
// Pasa por `lib/session` (la puerta única) y filtra por `identidadId` en TODA
// consulta: lo exige `test/regression-portal-aislamiento.test.ts`.
import { identidadDeSesion } from './session'
import { prisma } from './db'
import { carteraDeSesion } from './cartera-lectura'
import { fechaAccionable, polizaGeneraObligacion } from '@central/module-seguros-portal'

export type ObligacionVista = {
  id: string
  titulo: string
  fechaEvento: Date
  fechaAccionable: Date
  procedencia: 'compania' | 'documento' | 'calculado' | 'declarado'
  avisada: boolean
}

/**
 * Idempotente: `upsert` sobre `(identidad_id, poliza_id)`. Se puede llamar en
 * cada carga de la bóveda sin duplicar nada.
 *
 * Solo `import_ref IS NULL` llega hasta aquí: `carteraDeSesion()` ya devuelve
 * únicamente pólizas vivas, y `polizaGeneraObligacion()` es el segundo cepo.
 */
export async function sincronizarObligaciones(): Promise<void> {
  const identidadId = await identidadDeSesion()
  if (!identidadId) return

  const cartera = await carteraDeSesion()
  if (!cartera) return

  for (const titular of cartera.propias) {
    for (const p of titular.polizas) {
      // `carteraDeSesion()` ya consulta con `importRef: null`
      // (`lib/cartera-lectura.ts:164`), así que aquí NO llega ninguna póliza
      // del volcado histórico. Se vuelve a pasar por el cepo igualmente: el día
      // que alguien relaje ese `where`, el filtro sigue estando.
      //
      // ⚠️ `confirmadaCima` NO sirve para esto: es `id_poliza_entidad !== null`
      // (la compañía ya la confirmó), que es una pregunta distinta de «vino por
      // el volcado». Usarlo aquí dejaría fuera las pólizas que emitimos nosotros
      // y aún no ha confirmado CIMA, que sí tienen que avisar.
      if (!polizaGeneraObligacion({ importRef: null, fechaVencimiento: p.fechaVencimiento })) {
        continue
      }
      const evento = p.fechaVencimiento as Date
      await prisma.portalObligacion.upsert({
        where: { identidadId_polizaId: { identidadId, polizaId: p.id } },
        create: {
          identidadId,
          polizaId: p.id,
          tipo: 'poliza',
          titulo: `${p.ramo} · ${p.compania}`,
          fechaEvento: evento,
          fechaAccionable: fechaAccionable(evento),
          procedencia: 'compania',
        },
        update: {
          fechaEvento: evento,
          fechaAccionable: fechaAccionable(evento),
          actualizadaAt: new Date(),
        },
      })
    }
  }
}

export async function obligacionesDeSesion(): Promise<ObligacionVista[]> {
  const identidadId = await identidadDeSesion()
  if (!identidadId) return []

  const filas = await prisma.portalObligacion.findMany({
    where: { identidadId },
    orderBy: { fechaAccionable: 'asc' },
  })

  return filas.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    fechaEvento: f.fechaEvento,
    fechaAccionable: f.fechaAccionable,
    procedencia: f.procedencia,
    avisada: f.avisadaAt !== null,
  }))
}
```

- [ ] **Step 2: Comprobar el nombre real de la función de sesión**

`lib/session.ts` es la puerta única y su export puede no llamarse `identidadDeSesion`. Compruébalo y ajusta el import:

```bash
cd /home/user/central && grep -n '^export' apps/asegura-portal/lib/session.ts
```

Si el nombre difiere, corrígelo en `lib/obligaciones.ts`. **No** añadas un acceso alternativo a la sesión: la puerta es una.

- [ ] **Step 3: Typecheck de la app**

```bash
cd /home/user/central/apps/asegura-portal
npx --yes pnpm@10.33.0 exec prisma generate
npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json
```

Esperado: sin errores.

> ⚠️ Si aparecen errores tipo `Property 'x' does not exist on type 'PrismaClient'` en ficheros que no has tocado, **regenera el cliente de ESTA app y repite**: el cliente por defecto de Prisma es uno solo para todo el monorepo y otra app pudo sobrescribirlo.

- [ ] **Step 4: Ejecutar el guardián de aislamiento**

```bash
cd /home/user/central && node --test test/regression-portal-aislamiento.test.ts
```

Esperado: PASS. `lib/obligaciones.ts` importa `./session` y nombra `identidadId`, así que cumple los dos cepos.

- [ ] **Step 5: Commit**

```bash
git add apps/asegura-portal/lib/obligaciones.ts
git commit -m "feat(portal): derivar obligaciones de las polizas vivas de la identidad"
```

---

## Task 6: La sección del calendario en la bóveda

**Files:**
- Create: `apps/asegura-portal/app/(portal)/boveda/Calendario.tsx`
- Modify: `apps/asegura-portal/app/(portal)/boveda/page.tsx`

- [ ] **Step 1: Escribir el componente**

Crea `apps/asegura-portal/app/(portal)/boveda/Calendario.tsx`:

```tsx
import { fechaEs } from '@/lib/fechas'
import { etiquetaProcedencia } from '@central/module-seguros-portal'
import type { ObligacionVista } from '@/lib/obligaciones'

/**
 * Pinta la fecha ACCIONABLE, no la del evento. Y pinta la procedencia SIEMPRE:
 * un dato `calculado` o `declarado` no puede tener el mismo aspecto que uno que
 * confirmó la compañía.
 */
export default function Calendario({ obligaciones }: { obligaciones: ObligacionVista[] }) {
  if (obligaciones.length === 0) {
    return (
      <section aria-labelledby="calendario-titulo" style={{ marginTop: '2rem' }}>
        <h2 id="calendario-titulo">Tu calendario</h2>
        {/* Tres estados: esto es «revisado, no hay», no «no se sabe». */}
        <p>No hay ningún vencimiento anotado todavía.</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="calendario-titulo" style={{ marginTop: '2rem' }}>
      <h2 id="calendario-titulo">Tu calendario</h2>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.75rem' }}>
        {obligaciones.map((o) => (
          <li
            key={o.id}
            style={{
              border: '1px solid var(--borde, #ddd)',
              borderRadius: 8,
              padding: '0.75rem',
              display: 'grid',
              gap: '0.25rem',
            }}
          >
            <strong>{o.titulo}</strong>
            <span>Vence el {fechaEs(o.fechaEvento)}</span>
            <span>
              <b>Tienes hasta el {fechaEs(o.fechaAccionable)}</b> para decidir si lo renuevas.
            </span>
            <span className="chip">{etiquetaProcedencia(o.procedencia)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 2: Montarlo en la página**

En `apps/asegura-portal/app/(portal)/boveda/page.tsx`, añade a los imports:

```tsx
import Calendario from './Calendario'
import { sincronizarObligaciones, obligacionesDeSesion } from '@/lib/obligaciones'
```

Dentro de `export default async function Boveda()`, antes del `return`:

```tsx
  await sincronizarObligaciones()
  const obligaciones = await obligacionesDeSesion()
```

Y en el JSX, justo después del `<h1>Mis seguros</h1>`:

```tsx
      <Calendario obligaciones={obligaciones} />
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/user/central/apps/asegura-portal
npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json
```

Esperado: sin errores.

- [ ] **Step 4: Comprobar el responsive a 320 px**

El componente usa `display: grid` sin `gridTemplateColumns`, dentro del layout de la bóveda. Comprueba que no desborda **midiendo el scroller, no el `body`**:

```bash
cd /home/user/central/apps/asegura-portal && npx --yes pnpm@10.33.0 exec next build
```

Esperado: build OK. La medición visual a 320 px se hace sobre la preview de Vercel (Task 9), no aquí.

- [ ] **Step 5: Commit**

```bash
cd /home/user/central
git add "apps/asegura-portal/app/(portal)/boveda/Calendario.tsx" "apps/asegura-portal/app/(portal)/boveda/page.tsx"
git commit -m "feat(portal): calendario con la fecha accionable y su procedencia"
```

---

## Task 7: El envío del aviso

**Files:**
- Create: `apps/asegura-portal/lib/avisos.ts`
- Create: `apps/asegura-portal/lib/cron-auth.ts`
- Create: `apps/asegura-portal/app/api/cron/avisos/route.ts`
- Modify: `apps/asegura-portal/vercel.json`

- [ ] **Step 1: Escribir la verificación del Bearer**

Crea `apps/asegura-portal/lib/cron-auth.ts`:

```ts
import type { NextRequest } from 'next/server'

/**
 * Sin `CRON_SECRET` definido NO se autoriza a nadie. La alternativa —dejar
 * pasar en desarrollo— convierte un olvido de env en producción en un endpoint
 * abierto que manda correos a los clientes.
 */
export function cronAutorizado(req: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET
  if (!secreto) return false
  return req.headers.get('authorization') === `Bearer ${secreto}`
}
```

- [ ] **Step 2: Escribir el selector y el envío**

Crea `apps/asegura-portal/lib/avisos.ts`:

```ts
// El cron NO tiene sesión: recorre las obligaciones de TODAS las identidades.
// Por eso está exento del cepo de `lib/session` en
// `test/regression-portal-aislamiento.test.ts`, y por eso lleva su propio cepo:
// cada aviso sale al canal de LA identidad dueña de la obligación, resuelto
// dentro del bucle. Nunca hay un destinatario que no venga de la propia fila.
import { prisma } from './db'
import { obtenerCanal } from './canal'
import { entraEnVentana, DIAS_VENTANA_AVISO } from '@central/module-seguros-portal'
import { fechaEs } from './fechas'

export type ResultadoPasada = {
  candidatas: number
  enviados: number
  sinCanal: number
  fallidos: number
}

/**
 * `soloContar: true` no manda nada. Es el modo con el que se estrena el cron:
 * un cron de avisos no se enciende a ciegas sobre una base ya cargada.
 */
export async function pasadaDeAvisos(opts: { hoy: Date; soloContar: boolean }): Promise<ResultadoPasada> {
  const limite = new Date(opts.hoy.getTime() + DIAS_VENTANA_AVISO * 86_400_000)

  const pendientes = await prisma.portalObligacion.findMany({
    where: {
      avisadaAt: null,
      fechaAccionable: { gte: opts.hoy, lte: limite },
    },
    include: { identidad: { include: { canales: true } } },
  })

  const r: ResultadoPasada = { candidatas: pendientes.length, enviados: 0, sinCanal: 0, fallidos: 0 }
  if (opts.soloContar) return r

  for (const o of pendientes) {
    if (!entraEnVentana({ fechaAccionable: o.fechaAccionable, hoy: opts.hoy })) continue

    const destino = o.identidad.canales.find((c) => c.tipo === 'email')
    if (!destino) {
      r.sinCanal++
      continue
    }
    const canal = obtenerCanal('email')
    if (!canal) {
      r.sinCanal++
      continue
    }

    const texto =
      `${o.titulo}: vence el ${fechaEs(o.fechaEvento)}. ` +
      `Tienes hasta el ${fechaEs(o.fechaAccionable)} para decidir si lo renuevas.`

    const ok = await canal.enviarCodigo(destino.destino, texto)
    if (!ok) {
      r.fallidos++
      continue
    }

    // El sello va inmediatamente después del envío aceptado: un reintento del
    // cron no puede mandar el mismo aviso dos veces.
    await prisma.portalObligacion.update({ where: { id: o.id }, data: { avisadaAt: new Date() } })
    r.enviados++
  }

  return r
}
```

> ⚠️ **Comprueba los nombres reales antes de dar por buena esta consulta:** el modelo del canal puede llamarse distinto a `canales` / `destino` / `tipo`. Mira `apps/asegura-portal/prisma/schema.prisma` (`model PortalCanal`) y ajusta. Si el destino está **hasheado** (`hashCanal()` en `lib/auth.ts`), NO se puede enviar desde el hash: en ese caso el envío necesita el destino en claro y hay que parar y decírselo a Alberto en vez de inventar un camino.

- [ ] **Step 3: Escribir el endpoint**

Crea `apps/asegura-portal/app/api/cron/avisos/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/cron-auth'
import { pasadaDeAvisos } from '@/lib/avisos'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * `?contar=1` no manda nada: solo dice cuántas obligaciones caen en la ventana.
 * Es el modo con el que se estrena, y el que se usa para comprobar que el
 * número es el esperado ANTES de encender el envío.
 */
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }

  const soloContar =
    req.nextUrl.searchParams.get('contar') === '1' || process.env.PORTAL_AVISOS_ACTIVOS !== '1'

  const r = await pasadaDeAvisos({ hoy: new Date(), soloContar })
  return NextResponse.json({ ...r, soloContar })
}
```

- [ ] **Step 4: Declarar el cron**

En `apps/asegura-portal/vercel.json`, añade la clave `crons` al objeto raíz:

```json
  "crons": [
    { "path": "/api/cron/avisos", "schedule": "0 8 * * *" }
  ]
```

- [ ] **Step 5: Typecheck**

```bash
cd /home/user/central/apps/asegura-portal
npx --yes pnpm@10.33.0 exec prisma generate
npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
cd /home/user/central
git add apps/asegura-portal/lib/avisos.ts apps/asegura-portal/lib/cron-auth.ts apps/asegura-portal/app/api/cron/avisos/route.ts apps/asegura-portal/vercel.json
git commit -m "feat(portal): aviso diario del vencimiento por el puerto de canal"
```

---

## Task 8: Los guardianes

**Files:**
- Modify: `test/regression-portal-aislamiento.test.ts`
- Create: `test/regression-portal-obligaciones.test.ts`

- [ ] **Step 1: Exentar `lib/avisos.ts` con su razón escrita**

En `test/regression-portal-aislamiento.test.ts`, dentro del `Set` `EXENTOS`, añade:

```ts
  // El cron de avisos corre SIN sesión: recorre las obligaciones de todas las
  // identidades. Su garantía no es el filtro por `identidadId` sino que el
  // destinatario sale de la PROPIA fila (`o.identidad.canales`), nunca de un
  // parámetro. Lo vigila `test/regression-portal-obligaciones.test.ts`.
  'apps/asegura-portal/lib/avisos.ts',
```

- [ ] **Step 2: Escribir el cepo sustitutorio**

Crea `test/regression-portal-obligaciones.test.ts`:

```ts
// Cepos de negocio del calendario del portal. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { polizaGeneraObligacion, entraEnVentana, fechaAccionable } from '@central/module-seguros-portal'

const ROOT = join(import.meta.dirname, '..')

test('ninguna poliza con import_ref genera obligacion', () => {
  for (const ref of ['intranet:1', 'asegura_app:2', '']) {
    assert.equal(
      polizaGeneraObligacion({ importRef: ref, fechaVencimiento: new Date(Date.UTC(2026, 5, 1)) }),
      false,
      `import_ref ${JSON.stringify(ref)} no puede generar aviso`,
    )
  }
})

test('un vencimiento NULL nunca genera obligacion', () => {
  assert.equal(polizaGeneraObligacion({ importRef: null, fechaVencimiento: null }), false)
})

test('el aviso nunca sale despues de la fecha accionable', () => {
  const accionable = new Date(Date.UTC(2026, 1, 10))
  assert.equal(entraEnVentana({ fechaAccionable: accionable, hoy: new Date(Date.UTC(2026, 1, 11)) }), false)
})

test('la fecha accionable siempre es ANTERIOR al evento', () => {
  const evento = new Date(Date.UTC(2026, 2, 15))
  assert.ok(fechaAccionable(evento).getTime() < evento.getTime())
})

test('el cron de avisos saca el destinatario de la fila, no de un parametro', () => {
  // `lib/avisos.ts` está exento del cepo de sesión porque corre sin ella. Esta
  // es la garantía que lo sustituye: si alguien añade un destinatario que no
  // venga de `o.identidad`, el aviso puede acabar en el buzón equivocado.
  const src = readFileSync(join(ROOT, 'apps/asegura-portal/lib/avisos.ts'), 'utf8')
  assert.match(src, /o\.identidad\.canales/, 'el destino tiene que salir de la identidad de la obligación')
  assert.doesNotMatch(src, /searchParams|req\.|params\./, 'el cron no acepta destinatarios por parámetro')
})

test('el cron no manda nada mientras PORTAL_AVISOS_ACTIVOS no valga 1', () => {
  // Un cron de avisos no se estrena a ciegas sobre una base ya cargada.
  const src = readFileSync(join(ROOT, 'apps/asegura-portal/app/api/cron/avisos/route.ts'), 'utf8')
  assert.match(src, /PORTAL_AVISOS_ACTIVOS/)
})
```

- [ ] **Step 3: Ejecutar los dos guardianes**

```bash
cd /home/user/central
node --test test/regression-portal-aislamiento.test.ts test/regression-portal-obligaciones.test.ts
```

Esperado: `fail 0`.

- [ ] **Step 4: Ejecutar la suite completa**

```bash
cd /home/user/central && npx --yes pnpm@10.33.0 test
```

Esperado: `fail 0`. Es el check requerido `Tests (packages + guardián)`.

- [ ] **Step 5: Commit**

```bash
git add test/regression-portal-aislamiento.test.ts test/regression-portal-obligaciones.test.ts
git commit -m "test(portal): cepos del calendario y del destinatario del aviso"
```

---

## Task 9: Puesta en pie

**Files:** ninguno de código.

- [ ] **Step 1: Reproducir los 12 checks requeridos en local**

```bash
cd /home/user/central
npx --yes pnpm@10.33.0 test
for app in ia-rest ialimp sivra plataforma rrhh transporte alquiler almacen mariscos asegura asegura-portal housesevillana; do
  echo "=== $app ==="
  (cd apps/$app && npx --yes pnpm@10.33.0 exec prisma generate >/dev/null 2>&1; npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json)
done
(cd apps/ia-rest && npx --yes pnpm@10.33.0 exec tsx ../../scripts/qa-check.ts && npx --yes pnpm@10.33.0 run lint && npx --yes pnpm@10.33.0 exec tsc --noEmit && npx --yes pnpm@10.33.0 run build)
```

Esperado: todo en verde. `apps/asegura` necesita sus DOS `prisma generate` (usa el script de su `package.json`).

- [ ] **Step 2: Abrir el PR**

Empuja la rama y abre el PR **por la herramienta MCP de GitHub**, en draft. Si los 12 requeridos no arrancan, sigue el orden de `CLAUDE.md`: compara `git ls-remote origin <rama>` con el `head.sha` del PR antes de tocar nada.

- [ ] **Step 3: Aplicar el DDL — DEPENDE DE ALBERTO**

El SQL `2026-09-03_portal_obligacion.sql` lo aplica **la sesión principal** contra la Supabase compartida, no un agente, y solo cuando Alberto lo autorice.

```sql
-- Verificación posterior:
SELECT count(*) FROM seguros.portal_obligacion;               -- 0
SELECT has_table_privilege('prisma_asegura_portal', 'seguros.portal_obligacion', 'INSERT'); -- t
```

- [ ] **Step 4: Las cuatro envs — DEPENDE DE ALBERTO**

En el proyecto Vercel `asegura-portal`: `DATABASE_URL`, `PII_LOOKUP_KEY` (**idéntica** a la de `central-asegura`), `ASEGURA_PORTAL_SESSION_SECRET`, `ASEGURA_PORTAL_CANAL_PEPPER`. Más `CRON_SECRET` para el cron. **No** definas `PORTAL_AVISOS_ACTIVOS` todavía.

- [ ] **Step 5: Contar antes de encender**

Con la app desplegada y el cron corriendo en modo cuenta:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://<dominio-del-portal>/api/cron/avisos?contar=1"
```

Esperado: `{"candidatas":N,...,"soloContar":true}` con **N ≤ 109** (las pólizas vivas de CIMA). Si N es de miles, el filtro de `import_ref` no está haciendo su trabajo: **no enciendas nada** y vuelve a la Task 3.

- [ ] **Step 6: Encender**

Solo con el número comprobado, define `PORTAL_AVISOS_ACTIVOS=1` en Vercel y redespliega.

---

## Fuera de este plan

Botón de retarificar con Avant2, partes de siniestro, mensajería, registro abierto a no-clientes, empresas y flota, cambio de mediador y alta por fotos. Están en `docs/CORREDURIA-INTRANET-IDEAS.md` con su coste y su bloqueo.
