# Control de comisiones de la correduría — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Alberto pueda ver, por compañía y mes, cuánto ha **devengado**, cuánto le han **liquidado** y cuánto le han **ingresado** — y que el total anual de brutos y retenciones sirva para contrastar el borrador del IRPF en vez de copiarlo.

**Architecture:** Los datos de CIMA viven en la BD de la correduría, a la que **solo `apps/asegura` tiene acceso**. Plataforma los lee por el **puerto HTTP de operador** (`Bearer ASEGURA_OPERADOR_SECRET`), exactamente como ya hace `lib/cartera-asegura.ts` con la cartera. El cuadre es un **helper puro y testeado** en plataforma; la persistencia, una tabla nueva en la BD compartida. Se retira el intento anterior (`lib/cima.ts` + `cima_liquidaciones`), que hablaba SOAP contra un endpoint nunca validado.

**Tech Stack:** Next.js 15 (App Router), Prisma (dos clientes en asegura), Postgres/Supabase, `node --test` con `--experimental-strip-types`, Telegram vía `@central/core-telegram`.

---

## 🚨 Corrección al spec

El spec (`docs/superpowers/specs/2026-09-01-comisiones-renta-control-design.md`, §4.3) dice que el cron de
plataforma leerá «por `ASEGURA_DATABASE_URL` (rol `central_asegura`, SELECT-only)». **Es falso:**
`ASEGURA_DATABASE_URL` solo existe en `apps/asegura` (`lib/asegura-db.ts`), y plataforma **no la tiene**.
Comprobado con `grep`: en `apps/plataforma` solo aparece `ASEGURA_OPERADOR_SECRET`, que es el Bearer del
puerto HTTP.

La ruta real es la que ya existe para la cartera:

```
plataforma (lib/comisiones-asegura.ts)
  → GET https://central-asegura.vercel.app/api/operador/comisiones   [Bearer ASEGURA_OPERADOR_SECRET]
    → asegura (lib/comisiones.ts) → prismaAsegura() → ASEGURA_DATABASE_URL
```

Esto **no cambia el diseño**, solo por dónde entra el dato. La Task 12 corrige el spec.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `apps/asegura/prisma/asegura.prisma` | + modelos `CuentaEfectivo` y `Liquidacion` (hoy no están; `PolizaRecibo` sí) |
| `apps/asegura/lib/comisiones.ts` | Lecturas de comisiones sobre la cartera. Devengado (recibos), liquidado (cuenta de efectivo), cobertura por compañía |
| `apps/asegura/app/api/operador/comisiones/route.ts` | Puerto HTTP read-only, Bearer, tres estados |
| `apps/plataforma/lib/comisiones-asegura.ts` | Cliente del puerto + `interpretarComisiones()` puro |
| `apps/plataforma/lib/correduria/cuadre.ts` | **Helper puro**: los nueve estados del cuadre. Sin BD ni red |
| `apps/plataforma/lib/correduria/cuadre.test.ts` | Tests del helper con los casos reales medidos |
| `apps/plataforma/lib/correduria/pdf-allianz.ts` | Parser del «Cuenta Agente» (texto EBCDIC dentro del PDF) |
| `apps/plataforma/lib/correduria/pdf-allianz.test.ts` | Tests del parser |
| `apps/plataforma/prisma/sql/2026-09-01_comisiones_devengo.sql` | Tablas `comisiones_devengo` y `comisiones_cobertura` |
| `apps/plataforma/app/api/cron/cima-liq/route.ts` | Reescrito: lee del puerto, no SOAP |
| `apps/plataforma/app/api/correduria/comisiones/route.ts` | Datos de la pantalla |
| `apps/plataforma/app/api/correduria/comisiones/confirmar/route.ts` | Confirmación manual de un periodo |
| `apps/plataforma/app/(usuario)/correduria/CorreduriaClient.tsx` | + pestaña «Cuadre» |
| **Se borran** | `apps/plataforma/lib/cima.ts`, tabla `cima_liquidaciones` |

---

### Task 1: Modelos Prisma de la cuenta de efectivo

**Files:**
- Modify: `apps/asegura/prisma/asegura.prisma`

La BD de la correduría ya tiene estas dos tablas (comprobado: 7 filas en `cuenta_efectivo`, 9 en
`liquidaciones`), pero el schema espejo de asegura no las modela. Los importes van en **TEXT** tal cual
llegan del EIAC, igual que en `PolizaRecibo`.

- [ ] **Step 1: Añadir los modelos al final del schema**

```prisma
/// Cuenta de efectivo EIAC: el extracto de liquidación de una compañía para un
/// periodo. Importes en TEXT (como llegan del EIAC) — parsear al leer.
model CuentaEfectivo {
  id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  correduriaId        String    @map("correduria_id") @db.Uuid
  codigoEntidadDgs    String?   @map("codigo_entidad_dgs")
  periodoInicio       DateTime? @map("periodo_inicio") @db.Timestamptz(6)
  periodoFin          DateTime? @map("periodo_fin") @db.Timestamptz(6)
  saldoInicial        String?   @map("saldo_inicial")
  saldoFinal          String?   @map("saldo_final")
  recibosCobrados     String?   @map("recibos_cobrados")
  comisionesRecibos   String?   @map("comisiones_recibos")
  retencionComisiones String?   @map("retencion_comisiones")
  siniestrosPagados   String?   @map("siniestros_pagados")
  otrosConceptos      String?   @map("otros_conceptos")
  retencionOtros      String?   @map("retencion_otros")
  remesas             String?
  eiacXmlHash         String?   @map("eiac_xml_hash")
  createdAt           DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  @@map("cuenta_efectivo")
}

/// Remesa concreta de una compañía. `fechaPago` NULL = reconocida y no pagada.
model Liquidacion {
  id                   String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  correduriaId         String    @map("correduria_id") @db.Uuid
  cuentaEfectivoId     String?   @map("cuenta_efectivo_id") @db.Uuid
  idLiquidacionEntidad String?   @map("id_liquidacion_entidad")
  codigoEntidadDgs     String?   @map("codigo_entidad_dgs")
  fechaLiquidacion     DateTime? @map("fecha_liquidacion") @db.Timestamptz(6)
  fechaPago            DateTime? @map("fecha_pago") @db.Timestamptz(6)
  importeRemesa        String?   @map("importe_remesa")
  createdAt            DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  @@map("liquidaciones")
}
```

⚠️ `estadoLiquidacion` y `estado` son enums `USER-DEFINED` en el origen que **no** se modelan aquí: no
hacen falta y declararlos mal rompería `prisma generate`.

- [ ] **Step 2: Generar y comprobar que compila**

Run desde `apps/asegura`:
`npx --yes pnpm@10.33.0 exec prisma generate --schema prisma/asegura.prisma && npx --yes pnpm@10.33.0 exec prisma generate && npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/asegura/prisma/asegura.prisma
git commit -m "feat(asegura): modelar cuenta_efectivo y liquidaciones en el schema de la cartera"
```

---

### Task 2: Lecturas de comisiones en asegura

**Files:**
- Create: `apps/asegura/lib/comisiones.ts`

- [ ] **Step 1: Escribir el módulo**

```ts
import { aseguraConfigurada, prismaAsegura } from './asegura-db'

/** Importe EIAC (TEXT) → número. `null` si no se puede leer: NUNCA 0. */
export function importeEiac(v: string | null | undefined): number | null {
  if (v == null) return null
  const n = Number(String(v).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export type PeriodoComisiones = {
  companiaCodigo: string
  periodoInicio: string          // 'YYYY-MM-DD'
  periodoFin: string
  liqBruto: number | null
  liqRetencion: number | null
  liqRemesa: number | null
  liqHash: string | null
  /** Remesa efectivamente pagada por la compañía (fecha_pago no nula). */
  pagado: number | null
}

export type DevengoCompania = {
  companiaCodigo: string
  mes: string                    // 'YYYY-MM'
  bruto: number
  recibos: number
}

export type CoberturaCompania = {
  companiaCodigo: string
  recibos: number
  liquidaciones: number
  primerRecibo: string | null
  ultimoRecibo: string | null
}

export type ComisionesCartera =
  | { estado: 'sin_configurar' }
  | { estado: 'error' }
  | {
      estado: 'ok'
      periodos: PeriodoComisiones[]
      devengos: DevengoCompania[]
      cobertura: CoberturaCompania[]
    }

const iso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)

/**
 * Comisiones de la cartera desde `desde` (inclusive). Tres estados: sin la env
 * es `sin_configurar` (NO «no hay comisiones»); un fallo de BD es `error`.
 *
 * El DEVENGADO se cuenta por `fechaSituacion` del recibo COBRADO: es la fecha en
 * que la compañía se quedó el dinero del cliente, que es lo que dispara su
 * obligación de liquidar. Un recibo anulado o devuelto NO devenga.
 */
export async function comisionesCartera(correduriaId: string, desde: Date): Promise<ComisionesCartera> {
  if (!aseguraConfigurada()) return { estado: 'sin_configurar' }
  try {
    const db = prismaAsegura()

    const cuentas = await db.cuentaEfectivo.findMany({
      where: { correduriaId, periodoInicio: { gte: desde } },
      orderBy: { periodoInicio: 'asc' },
    })
    const liqs = await db.liquidacion.findMany({
      where: { correduriaId, fechaLiquidacion: { gte: desde } },
    })

    const periodos: PeriodoComisiones[] = cuentas.map(c => {
      // Remesa PAGADA: solo las liquidaciones de esa compañía con fecha_pago
      // dentro del periodo. Sin fecha_pago = reconocida y no ingresada.
      const pagadas = liqs.filter(l =>
        l.codigoEntidadDgs === c.codigoEntidadDgs &&
        l.fechaPago != null &&
        c.periodoInicio != null && c.periodoFin != null &&
        l.fechaPago >= c.periodoInicio && l.fechaPago <= c.periodoFin)
      const pagado = pagadas.length
        ? pagadas.reduce((s, l) => s + (importeEiac(l.importeRemesa) ?? 0), 0)
        : null
      return {
        companiaCodigo: c.codigoEntidadDgs ?? '',
        periodoInicio: iso(c.periodoInicio) ?? '',
        periodoFin: iso(c.periodoFin) ?? '',
        liqBruto: importeEiac(c.comisionesRecibos),
        liqRetencion: importeEiac(c.retencionComisiones),
        liqRemesa: importeEiac(c.remesas),
        liqHash: c.eiacXmlHash,
        pagado,
      }
    }).filter(p => p.companiaCodigo && p.periodoInicio && p.periodoFin)

    const recibos = await db.polizaRecibo.findMany({
      where: { correduriaId, situacion: 'cobrado', fechaSituacion: { gte: desde } },
      select: { codigoEntidadDgs: true, fechaSituacion: true, comisionBruta: true },
    })
    const acc = new Map<string, { bruto: number; recibos: number }>()
    for (const r of recibos) {
      if (!r.codigoEntidadDgs || !r.fechaSituacion) continue
      const clave = `${r.codigoEntidadDgs}|${r.fechaSituacion.toISOString().slice(0, 7)}`
      const cur = acc.get(clave) ?? { bruto: 0, recibos: 0 }
      cur.bruto += importeEiac(r.comisionBruta) ?? 0
      cur.recibos += 1
      acc.set(clave, cur)
    }
    const devengos: DevengoCompania[] = [...acc.entries()].map(([k, v]) => {
      const [companiaCodigo, mes] = k.split('|')
      return { companiaCodigo, mes, bruto: Math.round(v.bruto * 100) / 100, recibos: v.recibos }
    }).sort((a, b) => a.mes.localeCompare(b.mes))

    // Cobertura: TODO el histórico, sin filtro de fecha. Sirve para decir qué
    // compañías tienen fuente y desde cuándo — un recuento de la ventana daría
    // «sin cobertura» a una compañía que simplemente no ha movido nada este año.
    const porCia = await db.polizaRecibo.groupBy({
      by: ['codigoEntidadDgs'],
      _count: { _all: true },
      _min: { fechaSituacion: true },
      _max: { fechaSituacion: true },
      where: { correduriaId },
    })
    const liqsPorCia = await db.cuentaEfectivo.groupBy({
      by: ['codigoEntidadDgs'],
      _count: { _all: true },
      where: { correduriaId },
    })
    const cobertura: CoberturaCompania[] = porCia
      .filter(g => g.codigoEntidadDgs)
      .map(g => ({
        companiaCodigo: g.codigoEntidadDgs!,
        recibos: g._count._all,
        liquidaciones: liqsPorCia.find(l => l.codigoEntidadDgs === g.codigoEntidadDgs)?._count._all ?? 0,
        primerRecibo: iso(g._min.fechaSituacion),
        ultimoRecibo: iso(g._max.fechaSituacion),
      }))

    return { estado: 'ok', periodos, devengos, cobertura }
  } catch {
    return { estado: 'error' }
  }
}
```

- [ ] **Step 2: Typecheck**

Run desde `apps/asegura`: `npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/asegura/lib/comisiones.ts
git commit -m "feat(asegura): lecturas de comisiones devengadas y liquidadas sobre la cartera"
```

---

### Task 3: Puerto HTTP de comisiones

**Files:**
- Create: `apps/asegura/app/api/operador/comisiones/route.ts`

- [ ] **Step 1: Escribir la ruta, calcada de `operador/resumen`**

```ts
import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { comisionesCartera } from '@/lib/comisiones'

export const dynamic = 'force-dynamic'

// GET ?desde=YYYY-MM-DD — comisiones para el cuadre de plataforma (read-only).
// Conserva los tres estados: quien consume no puede confundir «sin conectar»
// con «no hay comisiones».
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ comisiones: { estado: 'sin_configurar' } })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ comisiones: { estado: 'error' } })
    const desdeParam = new URL(req.url).searchParams.get('desde')
    const desde = desdeParam && /^\d{4}-\d{2}-\d{2}$/.test(desdeParam)
      ? new Date(`${desdeParam}T00:00:00Z`)
      : new Date('2026-01-01T00:00:00Z')
    return NextResponse.json({ comisiones: await comisionesCartera(correduria.id, desde) })
  } catch {
    return NextResponse.json({ comisiones: { estado: 'error' } })
  }
}
```

- [ ] **Step 2: Typecheck y commit**

Run desde `apps/asegura`: `npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json` → exit 0.

```bash
git add apps/asegura/app/api/operador/comisiones/route.ts
git commit -m "feat(asegura): puerto /api/operador/comisiones para el cuadre de plataforma"
```

---

### Task 4: Helper puro del cuadre (TDD)

**Files:**
- Create: `apps/plataforma/lib/correduria/cuadre.ts`
- Test: `apps/plataforma/lib/correduria/cuadre.test.ts`

Es la pieza que evita mentir. **Nueve estados, nunca dos.**

- [ ] **Step 1: Escribir el test que falla**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoCuadre, type EntradaCuadre } from './cuadre.ts'

const base: EntradaCuadre = {
  leidoOk: true, tieneCobertura: true,
  esperadoBruto: null, liqBruto: null, liqRetencion: null, liqRemesa: null, bancoTotal: null,
}

test('una lectura fallida es no-comprobado, no «no hay»', () => {
  assert.equal(estadoCuadre({ ...base, leidoOk: false }), 'no-comprobado')
})

test('una compañía sin ninguna fuente es sin-cobertura, no sin-datos', () => {
  assert.equal(estadoCuadre({ ...base, tieneCobertura: false }), 'sin-cobertura')
})

test('con cobertura y sin nada llegado es sin-datos', () => {
  assert.equal(estadoCuadre(base), 'sin-datos')
})

test('Allianz feb/2026 cuadra: 95,03 − 14,26 = 80,77 = banco', () => {
  assert.equal(estadoCuadre({
    ...base, esperadoBruto: 95.03, liqBruto: 95.03, liqRetencion: 14.26, liqRemesa: 80.77, bancoTotal: 80.77,
  }), 'cuadra')
})

test('Occident jul/2026 es deudor, NO un impago', () => {
  assert.equal(estadoCuadre({
    ...base, esperadoBruto: -346.20, liqBruto: -346.20, liqRetencion: 51.90, liqRemesa: 0, bancoTotal: 0,
  }), 'deudor')
})

test('Mapfre: devenga y no consta liquidación', () => {
  assert.equal(estadoCuadre({ ...base, esperadoBruto: 3614.65 }), 'esperado-sin-liquidar')
})

test('Allianz: liquidado y no ingresado', () => {
  assert.equal(estadoCuadre({
    ...base, liqBruto: 95.03, liqRetencion: 14.26, liqRemesa: 80.77, bancoTotal: null,
  }), 'liquidado-sin-cobrar')
})

test('entra dinero que ninguna fuente explica', () => {
  assert.equal(estadoCuadre({ ...base, bancoTotal: 250 }), 'cobrado-sin-liquidar')
})

test('bruto − retención ≠ remesa descuadra, con tolerancia de un céntimo', () => {
  assert.equal(estadoCuadre({
    ...base, liqBruto: 95.03, liqRetencion: 14.26, liqRemesa: 70, bancoTotal: 70,
  }), 'descuadra')
  assert.equal(estadoCuadre({
    ...base, liqBruto: 95.03, liqRetencion: 14.26, liqRemesa: 80.78, bancoTotal: 80.78,
  }), 'cuadra')
})

test('un cero NO es lo mismo que un null: 0 liquidado con banco a 0 cuadra', () => {
  assert.equal(estadoCuadre({ ...base, liqBruto: 0, liqRetencion: 0, liqRemesa: 0, bancoTotal: 0 }), 'cuadra')
})
```

- [ ] **Step 2: Verificar que falla**

Run desde `apps/plataforma`: `node --experimental-strip-types --test lib/correduria/cuadre.test.ts`
Expected: FAIL — `Cannot find module './cuadre.ts'`.

- [ ] **Step 3: Implementar**

```ts
// Cuadre de comisiones de la correduría. PURO: sin BD ni red, testeable con
// `node --test`. La UI no decide nada; solo pinta lo que devuelve esto.
//
// 🚨 `null` = no ha llegado. `0` = comprobado y es cero. No se colapsan nunca:
// es la diferencia entre «Mapfre no me ha liquidado» y «Mapfre me liquidó 0 €».

export type EstadoCuadre =
  | 'no-comprobado'          // falló la lectura de una fuente
  | 'sin-cobertura'          // esa compañía no tiene NINGUNA fuente de importe
  | 'sin-datos'              // hay cobertura y aún no ha llegado nada
  | 'esperado-sin-liquidar'  // devengaste y la compañía no ha liquidado
  | 'liquidado-sin-cobrar'   // te lo reconoce y no te lo ingresa
  | 'cobrado-sin-liquidar'   // entró dinero que ninguna fuente explica
  | 'deudor'                 // comisión negativa y remesa 0: saldo a favor de la cía
  | 'descuadra'              // dos fuentes hablan del mismo periodo y no coinciden
  | 'cuadra'

export interface EntradaCuadre {
  /** `false` = alguna fuente no se pudo leer. Manda sobre todo lo demás. */
  leidoOk: boolean
  tieneCobertura: boolean
  esperadoBruto: number | null
  liqBruto: number | null
  liqRetencion: number | null
  liqRemesa: number | null
  bancoTotal: number | null
}

/** Aritmética exacta: bruto − retención = remesa. Un céntimo de redondeo. */
export const TOLERANCIA_ARITMETICA = 0.011
/** Ventana banco↔remesa: comisiones que llegan partidas o con gastos. */
export const TOLERANCIA_BANCO = 1

export function estadoCuadre(e: EntradaCuadre): EstadoCuadre {
  if (!e.leidoOk) return 'no-comprobado'
  if (!e.tieneCobertura) return 'sin-cobertura'

  const hayLiq = e.liqBruto != null
  const hayBanco = e.bancoTotal != null
  const hayEsperado = e.esperadoBruto != null

  if (!hayLiq && !hayBanco && !hayEsperado) return 'sin-datos'

  // Saldo deudor: la compañía se queda a deber, no te paga. Ni impago ni descuadre.
  if (hayLiq && (e.liqBruto as number) < 0 && (e.liqRemesa ?? 0) === 0) return 'deudor'

  if (!hayLiq && hayEsperado) return 'esperado-sin-liquidar'
  if (!hayLiq && hayBanco) return 'cobrado-sin-liquidar'

  // Con liquidación: primero la aritmética interna del extracto.
  const remesaEsperada = (e.liqBruto as number) - (e.liqRetencion ?? 0)
  if (Math.abs(remesaEsperada - (e.liqRemesa ?? 0)) > TOLERANCIA_ARITMETICA) return 'descuadra'

  if (!hayBanco) return 'liquidado-sin-cobrar'
  if (Math.abs((e.liqRemesa ?? 0) - (e.bancoTotal as number)) > TOLERANCIA_BANCO) return 'descuadra'
  return 'cuadra'
}

/** ¿El total anual se puede presentar como CERRADO? Solo si ningún periodo
 *  está pendiente de dato o de comprobación. Un total con huecos que se pinta
 *  como definitivo es exactamente la mentira que este módulo evita. */
export function totalEsCerrado(estados: EstadoCuadre[]): boolean {
  return !estados.some(s => s === 'sin-datos' || s === 'sin-cobertura' || s === 'no-comprobado')
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `node --experimental-strip-types --test lib/correduria/cuadre.test.ts`
Expected: `# pass 10`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/correduria/cuadre.ts apps/plataforma/lib/correduria/cuadre.test.ts
git commit -m "feat(correduría): helper puro del cuadre de comisiones con nueve estados"
```

---

### Task 5: Tablas del libro de comisiones

**Files:**
- Create: `apps/plataforma/prisma/sql/2026-09-01_comisiones_devengo.sql`

- [ ] **Step 1: Escribir el SQL**

```sql
-- Libro de comisiones de la correduría: una fila por (cuenta, compañía, periodo).
-- Los tres importes son NULLABLE a propósito: NULL = no ha llegado, 0 = comprobado
-- y es cero. Colapsarlos convertiría «no me han liquidado» en «me liquidaron 0 €».
CREATE TABLE IF NOT EXISTS comisiones_devengo (
  cuenta_id        UUID NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  compania_codigo  TEXT NOT NULL,              -- 'C0109' (DGS): la clave real, no el nombre
  compania         TEXT NOT NULL,              -- 'Allianz', legible
  periodo_inicio   DATE NOT NULL,              -- fechas reales, NO 'YYYY-MM': CIMA trae
  periodo_fin      DATE NOT NULL,              -- periodos como 31/05 → 01/07

  esperado_bruto        NUMERIC(12,2),
  esperado_recibos      INTEGER,

  liq_bruto             NUMERIC(12,2),
  liq_retencion         NUMERIC(12,2),
  liq_remesa            NUMERIC(12,2),
  liq_origen            TEXT,                  -- 'cima' | 'pdf' | 'manual'
  liq_hash              TEXT,                  -- eiac_xml_hash / hash del PDF: idempotencia
  liq_email_message_id  TEXT,
  liq_confirmado_at     TIMESTAMPTZ,           -- solo si liq_origen='manual'

  banco_total           NUMERIC(12,2),
  banco_movimiento_ids  UUID[],

  leido_ok         BOOLEAN NOT NULL DEFAULT true,
  actualizado_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (cuenta_id, compania_codigo, periodo_inicio, periodo_fin)
);

CREATE INDEX IF NOT EXISTS idx_comisiones_devengo_periodo
  ON comisiones_devengo (cuenta_id, periodo_inicio);

-- Qué fuente cubre a cada compañía. Sin esto, el total anual parecería completo
-- estando ciego a Generali.
CREATE TABLE IF NOT EXISTS comisiones_cobertura (
  cuenta_id            UUID NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  compania_codigo      TEXT NOT NULL,
  compania             TEXT NOT NULL,
  tiene_recibos_cima   BOOLEAN NOT NULL DEFAULT false,
  desde_recibos        DATE,
  tiene_liq_cima       BOOLEAN NOT NULL DEFAULT false,
  tiene_correo_importe BOOLEAN NOT NULL DEFAULT false,
  remitente            TEXT,
  nota_gestion         TEXT,
  actualizado_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cuenta_id, compania_codigo)
);

-- El intento anterior: SOAP nunca validado, parser adivinado y códigos de
-- compañía equivocados. Se retira con su tabla.
DROP TABLE IF EXISTS cima_liquidaciones;
```

- [ ] **Step 2: Aplicar en Supabase y verificar**

Aplicar el fichero con el MCP de Supabase (`apply_migration`) sobre `wswbehlcuxqxyinousql`, y comprobar:

```sql
select count(*) from comisiones_devengo;              -- 0
select count(*) from comisiones_cobertura;            -- 0
select to_regclass('public.cima_liquidaciones');      -- NULL
```

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/prisma/sql/2026-09-01_comisiones_devengo.sql
git commit -m "feat(correduría): tablas del libro de comisiones y retirada de cima_liquidaciones"
```

---

### Task 6: Cliente del puerto en plataforma (TDD)

**Files:**
- Create: `apps/plataforma/lib/comisiones-asegura.ts`
- Test: `apps/plataforma/lib/comisiones-asegura.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretarComisiones } from './comisiones-asegura.ts'

test('401 es secreto rechazado, no «sin comisiones»', () => {
  assert.deepEqual(interpretarComisiones(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
})

test('sin_configurar se propaga tal cual', () => {
  assert.deepEqual(interpretarComisiones(200, { comisiones: { estado: 'sin_configurar' } }), { estado: 'sin_configurar' })
})

test('una respuesta rara NO se convierte en cero comisiones', () => {
  assert.deepEqual(interpretarComisiones(200, { pepe: 1 }), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('ok con listas vacías es ok, no error', () => {
  const r = interpretarComisiones(200, { comisiones: { estado: 'ok', periodos: [], devengos: [], cobertura: [] } })
  assert.equal(r.estado, 'ok')
})
```

- [ ] **Step 2: Verificar que falla**

Run desde `apps/plataforma`: `node --experimental-strip-types --test lib/comisiones-asegura.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar**

```ts
// Comisiones de la correduría en vivo, por el puerto HTTP de central-asegura.
// Mismo patrón y misma disciplina de tres estados que `lib/cartera-asegura.ts`:
// `sin_configurar` NO es «no hay comisiones», y un fallo lleva MOTIVO.

export type MotivoErrorComisiones =
  | 'secreto_rechazado' | 'asegura_error' | 'respuesta_ilegible' | 'red'

export type PeriodoComisiones = {
  companiaCodigo: string
  periodoInicio: string
  periodoFin: string
  liqBruto: number | null
  liqRetencion: number | null
  liqRemesa: number | null
  liqHash: string | null
  pagado: number | null
}
export type DevengoCompania = { companiaCodigo: string; mes: string; bruto: number; recibos: number }
export type CoberturaCompania = {
  companiaCodigo: string; recibos: number; liquidaciones: number
  primerRecibo: string | null; ultimoRecibo: string | null
}

export type ComisionesAsegura =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: MotivoErrorComisiones }
  | { estado: 'ok'; periodos: PeriodoComisiones[]; devengos: DevengoCompania[]; cobertura: CoberturaCompania[] }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** Interpretación PURA de la respuesta del puerto (testeable sin red). */
export function interpretarComisiones(status: number, json: unknown): ComisionesAsegura {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status !== 200 || typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  const c = (json as Record<string, unknown>).comisiones
  if (typeof c !== 'object' || c === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
  const com = c as Record<string, unknown>
  if (com.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (com.estado === 'error') return { estado: 'error', motivo: 'asegura_error' }
  if (com.estado !== 'ok') return { estado: 'error', motivo: 'respuesta_ilegible' }
  if (!Array.isArray(com.periodos) || !Array.isArray(com.devengos) || !Array.isArray(com.cobertura)) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  return {
    estado: 'ok',
    periodos: (com.periodos as Record<string, unknown>[]).map(p => ({
      companiaCodigo: str(p.companiaCodigo) ?? '',
      periodoInicio: str(p.periodoInicio) ?? '',
      periodoFin: str(p.periodoFin) ?? '',
      liqBruto: num(p.liqBruto), liqRetencion: num(p.liqRetencion),
      liqRemesa: num(p.liqRemesa), liqHash: str(p.liqHash), pagado: num(p.pagado),
    })).filter(p => p.companiaCodigo && p.periodoInicio),
    devengos: (com.devengos as Record<string, unknown>[]).map(d => ({
      companiaCodigo: str(d.companiaCodigo) ?? '', mes: str(d.mes) ?? '',
      bruto: num(d.bruto) ?? 0, recibos: num(d.recibos) ?? 0,
    })).filter(d => d.companiaCodigo && d.mes),
    cobertura: (com.cobertura as Record<string, unknown>[]).map(k => ({
      companiaCodigo: str(k.companiaCodigo) ?? '',
      recibos: num(k.recibos) ?? 0, liquidaciones: num(k.liquidaciones) ?? 0,
      primerRecibo: str(k.primerRecibo), ultimoRecibo: str(k.ultimoRecibo),
    })).filter(k => k.companiaCodigo),
  }
}

export async function comisionesAsegura(desde: string): Promise<ComisionesAsegura> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { estado: 'sin_configurar' }
  try {
    const base = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
    const res = await fetch(`${base}/api/operador/comisiones?desde=${encodeURIComponent(desde)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    })
    const json = await res.json().catch(() => null)
    return interpretarComisiones(res.status, json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}

/** Código DGS → nombre legible. Los códigos son la clave; el nombre cambia
 *  (Catalana Occidente → Occident), el código no. */
export const NOMBRE_POR_CODIGO_DGS: Record<string, string> = {
  C0058: 'Mapfre', C0109: 'Allianz', C0468: 'Occident', C0613: 'Reale', C0072: 'Generali',
}
export function nombreCompania(codigo: string): string {
  return NOMBRE_POR_CODIGO_DGS[codigo] ?? codigo
}
```

- [ ] **Step 4: Verificar que pasa y commitear**

Run: `node --experimental-strip-types --test lib/comisiones-asegura.test.ts` → `# fail 0`.

```bash
git add apps/plataforma/lib/comisiones-asegura.ts apps/plataforma/lib/comisiones-asegura.test.ts
git commit -m "feat(correduría): cliente del puerto de comisiones de central-asegura"
```

---

### Task 7: Parser del PDF de Allianz (TDD)

**Files:**
- Create: `apps/plataforma/lib/correduria/pdf-allianz.ts`
- Test: `apps/plataforma/lib/correduria/pdf-allianz.test.ts`

El texto del PDF va en **EBCDIC** (`cp500`) dentro de los content streams. Medido sobre
`ADYP_260803_A0018638_Ct10270_003153.pdf`: `ÃÖÂÙÖâ@ÄÅÓ@ÔÅâ` → `COBROS DEL MES`, `õõøkøø` → `558,88`.

- [ ] **Step 1: Test que falla**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { decodificarEbcdic, importeEs, periodoDeExtracto } from './pdf-allianz.ts'

test('el texto del PDF va en EBCDIC', () => {
  assert.equal(decodificarEbcdic('ÃÖÂÙÖâ@ÄÅÓ@ÔÅâ'), 'COBROS DEL MES')
})

test('los importes vienen en formato español dentro del PDF', () => {
  assert.equal(importeEs('558,88'), 558.88)
  assert.equal(importeEs('2.162,49'), 2162.49)
  assert.equal(importeEs('-346,20'), -346.2)
})

test('un importe ilegible es null, NUNCA 0', () => {
  assert.equal(importeEs(''), null)
  assert.equal(importeEs('n/d'), null)
})

test('el periodo se lee del CUERPO, no del asunto', () => {
  assert.deepEqual(
    periodoDeExtracto('Conceptos del periodo  01-07-2026 al 31-07-2026'),
    { inicio: '2026-07-01', fin: '2026-07-31' },
  )
  assert.equal(periodoDeExtracto('Cartera No Vida del mes de Noviembre de 2026'), null)
})
```

- [ ] **Step 2: Verificar que falla**

Run: `node --experimental-strip-types --test lib/correduria/pdf-allianz.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
// Parser del extracto «Cuenta Agente» de Allianz (mediador@allianz.es).
//
// 🚨 El texto del PDF NO es Latin-1: va en EBCDIC (cp500) dentro de los content
// streams. Sin decodificar, `COBROS DEL MES` se lee como `ÃÖÂÙÖâ@ÄÅÓ@ÔÅâ` y el
// parser devolvería basura con forma de dato. Medido 01/09/2026.
//
// 🚨 Y el periodo se lee del CUERPO del extracto, nunca del asunto del correo:
// Allianz fechó «Noviembre de 2026» un correo enviado en agosto.

/** EBCDIC (cp500) → texto. La entrada son los bytes tal cual salen del stream. */
export function decodificarEbcdic(s: string): string {
  return Buffer.from(s, 'latin1').toString('cp500' as BufferEncoding)
}

/** Importe en formato español → número. `null` si no se puede leer: nunca 0. */
export function importeEs(s: string): number | null {
  const limpio = s.trim().replace(/\./g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

/** Periodo del extracto: «Conceptos del periodo  DD-MM-YYYY al DD-MM-YYYY». */
export function periodoDeExtracto(texto: string): { inicio: string; fin: string } | null {
  const m = texto.match(/periodo\s+(\d{2})-(\d{2})-(\d{4})\s+al\s+(\d{2})-(\d{2})-(\d{4})/i)
  if (!m) return null
  return { inicio: `${m[3]}-${m[2]}-${m[1]}`, fin: `${m[6]}-${m[5]}-${m[4]}` }
}
```

⚠️ Node no trae `cp500` en `Buffer`. Si `decodificarEbcdic` falla en el test, sustituir por una tabla
explícita: EBCDIC cp500 mapea `0xC1..0xC9` → `A..I`, `0xD1..0xD9` → `J..R`, `0xE2..0xE9` → `S..Z`,
`0xF0..0xF9` → `0..9`, `0x40` → espacio, `0x6B` → coma, `0x4B` → punto, `0x60` → guion. La
implementación de fallback está en el Step 3 bis.

- [ ] **Step 3 bis: Fallback sin `cp500` (usar este si el Step 3 falla)**

```ts
const EBCDIC: Record<number, string> = (() => {
  const t: Record<number, string> = { 0x40: ' ', 0x4b: '.', 0x60: '-', 0x6b: ',', 0x5c: '*', 0x7a: ':' }
  'ABCDEFGHI'.split('').forEach((c, i) => { t[0xc1 + i] = c })
  'JKLMNOPQR'.split('').forEach((c, i) => { t[0xd1 + i] = c })
  'STUVWXYZ'.split('').forEach((c, i) => { t[0xe2 + i] = c })
  '0123456789'.split('').forEach((c, i) => { t[0xf0 + i] = c })
  return t
})()

export function decodificarEbcdic(s: string): string {
  return Array.from(Buffer.from(s, 'latin1')).map(b => EBCDIC[b] ?? '').join('')
}
```

- [ ] **Step 4: Verificar que pasa y commitear**

Run: `node --experimental-strip-types --test lib/correduria/pdf-allianz.test.ts` → `# fail 0`.

```bash
git add apps/plataforma/lib/correduria/pdf-allianz.ts apps/plataforma/lib/correduria/pdf-allianz.test.ts
git commit -m "feat(correduría): parser EBCDIC del extracto Cuenta Agente de Allianz"
```

---

### Task 8: Reescribir el cron y borrar `lib/cima.ts`

**Files:**
- Modify: `apps/plataforma/app/api/cron/cima-liq/route.ts` (reescritura completa)
- Delete: `apps/plataforma/lib/cima.ts`

- [ ] **Step 1: Reescribir la ruta**

El cron: lee el puerto, cruza con banco, hace upsert en `comisiones_devengo` y `comisiones_cobertura`,
y avisa por Telegram **solo si hay algo que decir**, con el recuento de lo NO comprobado.

```ts
// /api/cron/cima-liq — libro de comisiones de la correduría.
// Tres ejes por (compañía, periodo): devengado (recibos cobrados) → liquidado
// (extracto CIMA) → cobrado (BBVA). Antes hablaba SOAP contra un endpoint que
// nunca se validó; ahora lee el puerto de central-asegura, que sirve lo que el
// JAR oficial de TIREA ya dejó parseado.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { eur } from '@/lib/dinero'
import { tgAviso } from '@/lib/telegram/avisos'
import { comisionesAsegura, nombreCompania } from '@/lib/comisiones-asegura'
import { estadoCuadre, type EstadoCuadre } from '@/lib/correduria/cuadre'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const ok = (!!secret && auth === `Bearer ${secret}`)
           || (!!secret && req.nextUrl.searchParams.get('secret') === secret)
  if (!ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cuenta = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM cuentas LIMIT 1`
  if (!cuenta.length) return NextResponse.json({ ok: true, msg: 'Sin cuentas' })
  const cuentaId = cuenta[0].id

  const anio = new Date().getFullYear()
  const com = await comisionesAsegura(`${anio}-01-01`)

  if (com.estado === 'sin_configurar') {
    return NextResponse.json({ ok: true, msg: 'Puerto de asegura sin configurar' })
  }
  if (com.estado === 'error') {
    // No se pudo mirar ≠ no hay comisiones. Se marca y se dice.
    await prisma.$executeRaw`
      UPDATE comisiones_devengo SET leido_ok = false, actualizado_at = now()
      WHERE cuenta_id = ${cuentaId}::uuid`
    await tgAviso('correduria.cima-liq',
      `⚪ <b>Comisiones</b> — no se ha podido leer la cartera (<code>${com.motivo}</code>).\n` +
      `El libro queda como <b>no comprobado</b>, no a cero.`, { html: true })
    return NextResponse.json({ ok: false, motivo: com.motivo }, { status: 502 })
  }

  // ── Cobertura por compañía ────────────────────────────────────────────────
  for (const k of com.cobertura) {
    await prisma.$executeRaw`
      INSERT INTO comisiones_cobertura
        (cuenta_id, compania_codigo, compania, tiene_recibos_cima, desde_recibos, tiene_liq_cima, actualizado_at)
      VALUES (${cuentaId}::uuid, ${k.companiaCodigo}, ${nombreCompania(k.companiaCodigo)},
              ${k.recibos > 0}, ${k.primerRecibo ? new Date(k.primerRecibo) : null},
              ${k.liquidaciones > 0}, now())
      ON CONFLICT (cuenta_id, compania_codigo) DO UPDATE SET
        compania = EXCLUDED.compania,
        tiene_recibos_cima = EXCLUDED.tiene_recibos_cima,
        desde_recibos = EXCLUDED.desde_recibos,
        tiene_liq_cima = EXCLUDED.tiene_liq_cima,
        actualizado_at = now()`
  }

  // ── Un periodo por liquidación, más los meses que solo tienen devengo ──────
  type Fila = { codigo: string; inicio: string; fin: string
                bruto: number | null; ret: number | null; remesa: number | null; hash: string | null }
  const filas: Fila[] = com.periodos.map(p => ({
    codigo: p.companiaCodigo, inicio: p.periodoInicio, fin: p.periodoFin,
    bruto: p.liqBruto, ret: p.liqRetencion, remesa: p.liqRemesa, hash: p.liqHash,
  }))
  for (const d of com.devengos) {
    const [a, m] = d.mes.split('-').map(Number)
    const inicio = `${d.mes}-01`
    const fin = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
    const yaEsta = filas.some(f => f.codigo === d.companiaCodigo && f.inicio <= fin && f.fin >= inicio)
    if (!yaEsta) filas.push({ codigo: d.companiaCodigo, inicio, fin, bruto: null, ret: null, remesa: null, hash: null })
  }

  const avisos: string[] = []
  let noComprobados = 0

  for (const f of filas) {
    const esperado = com.devengos
      .filter(d => d.companiaCodigo === f.codigo && `${d.mes}-01` >= f.inicio.slice(0, 8) + '01' && `${d.mes}-01` <= f.fin)
      .reduce((s, d) => s + d.bruto, 0)
    const recibos = com.devengos
      .filter(d => d.companiaCodigo === f.codigo && `${d.mes}-01` >= f.inicio.slice(0, 8) + '01' && `${d.mes}-01` <= f.fin)
      .reduce((s, d) => s + d.recibos, 0)

    const banco = await prisma.$queryRaw<Array<{ total: number | null; ids: string[] }>>`
      SELECT sum(mb.importe)::float AS total, array_agg(mb.id) AS ids
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND mb.destino = 'seguros' AND mb.importe > 0
        AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
        AND mb.compania_seguros = ${nombreCompania(f.codigo)}
        AND mb.fecha_operacion >= ${new Date(f.inicio)}
        AND mb.fecha_operacion <= ${new Date(new Date(f.fin).getTime() + 45 * 864e5)}`
    const bancoTotal = banco[0]?.total ?? null
    const bancoIds = banco[0]?.ids ?? []

    await prisma.$executeRaw`
      INSERT INTO comisiones_devengo
        (cuenta_id, compania_codigo, compania, periodo_inicio, periodo_fin,
         esperado_bruto, esperado_recibos, liq_bruto, liq_retencion, liq_remesa,
         liq_origen, liq_hash, banco_total, banco_movimiento_ids, leido_ok, actualizado_at)
      VALUES (${cuentaId}::uuid, ${f.codigo}, ${nombreCompania(f.codigo)},
              ${f.inicio}::date, ${f.fin}::date,
              ${recibos > 0 ? esperado : null}, ${recibos > 0 ? recibos : null},
              ${f.bruto}, ${f.ret}, ${f.remesa},
              ${f.bruto == null ? null : 'cima'}, ${f.hash},
              ${bancoTotal}, ${bancoIds}::uuid[], true, now())
      ON CONFLICT (cuenta_id, compania_codigo, periodo_inicio, periodo_fin) DO UPDATE SET
        esperado_bruto = EXCLUDED.esperado_bruto,
        esperado_recibos = EXCLUDED.esperado_recibos,
        liq_bruto = coalesce(EXCLUDED.liq_bruto, comisiones_devengo.liq_bruto),
        liq_retencion = coalesce(EXCLUDED.liq_retencion, comisiones_devengo.liq_retencion),
        liq_remesa = coalesce(EXCLUDED.liq_remesa, comisiones_devengo.liq_remesa),
        liq_origen = coalesce(EXCLUDED.liq_origen, comisiones_devengo.liq_origen),
        liq_hash = coalesce(EXCLUDED.liq_hash, comisiones_devengo.liq_hash),
        banco_total = EXCLUDED.banco_total,
        banco_movimiento_ids = EXCLUDED.banco_movimiento_ids,
        leido_ok = true, actualizado_at = now()`

    const cobertura = com.cobertura.find(k => k.companiaCodigo === f.codigo)
    const estado: EstadoCuadre = estadoCuadre({
      leidoOk: true,
      tieneCobertura: Boolean(cobertura && (cobertura.recibos > 0 || cobertura.liquidaciones > 0)),
      esperadoBruto: recibos > 0 ? esperado : null,
      liqBruto: f.bruto, liqRetencion: f.ret, liqRemesa: f.remesa, bancoTotal,
    })
    if (estado === 'no-comprobado' || estado === 'sin-datos' || estado === 'sin-cobertura') noComprobados++
    if (estado === 'esperado-sin-liquidar' || estado === 'liquidado-sin-cobrar' || estado === 'descuadra') {
      avisos.push(`• <b>${nombreCompania(f.codigo)}</b> ${f.inicio} → ${f.fin}: <b>${estado}</b>\n` +
        `  devengado ${f.bruto == null && recibos === 0 ? '—' : eur(esperado)} · ` +
        `liquidado ${f.bruto == null ? '—' : eur(f.bruto)} · banco ${bancoTotal == null ? '—' : eur(bancoTotal)}`)
    }
  }

  if (avisos.length) {
    await tgAviso('correduria.cima-liq',
      `🔴 <b>Comisiones — hay dinero que no cuadra</b>\n\n${avisos.join('\n\n')}\n\n` +
      (noComprobados ? `⚪ ${noComprobados} periodo(s) sin dato todavía.\n` : '') +
      `Revisa en <b>/correduria</b>.`, { html: true })
  }

  return NextResponse.json({ ok: true, periodos: filas.length, avisos: avisos.length, noComprobados })
}
```

- [ ] **Step 2: Borrar el intento anterior**

```bash
git rm apps/plataforma/lib/cima.ts
```

- [ ] **Step 3: Comprobar que nadie más lo importaba**

Run: `grep -rn "lib/cima\|from '@/lib/cima'\|cima_liquidaciones" apps/plataforma --include=*.ts --include=*.tsx`
Expected: sin resultados (fuera del SQL de la Task 5).

- [ ] **Step 4: Typecheck y commit**

Run desde `apps/plataforma`: `npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json` → exit 0.

```bash
git add -A apps/plataforma
git commit -m "feat(correduría): el cron de comisiones lee el puerto de asegura y retira el SOAP adivinado"
```

---

### Task 9: API de la pantalla

**Files:**
- Create: `apps/plataforma/app/api/correduria/comisiones/route.ts`

- [ ] **Step 1: Escribir la ruta**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { estadoCuadre, totalEsCerrado, type EstadoCuadre } from '@/lib/correduria/cuadre'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const año = parseInt(new URL(req.url).searchParams.get('año') || '') || new Date().getFullYear()

  const filas = await prisma.$queryRaw<Array<{
    compania_codigo: string; compania: string; periodo_inicio: Date; periodo_fin: Date
    esperado_bruto: number | null; liq_bruto: number | null; liq_retencion: number | null
    liq_remesa: number | null; liq_origen: string | null; banco_total: number | null; leido_ok: boolean
  }>>`
    SELECT compania_codigo, compania, periodo_inicio, periodo_fin,
           esperado_bruto::float, liq_bruto::float, liq_retencion::float,
           liq_remesa::float, liq_origen, banco_total::float, leido_ok
    FROM comisiones_devengo
    WHERE cuenta_id = ${session.id}::uuid
      AND EXTRACT(year FROM periodo_inicio) = ${año}
    ORDER BY compania, periodo_inicio`

  const cobertura = await prisma.$queryRaw<Array<{
    compania_codigo: string; compania: string; tiene_recibos_cima: boolean
    tiene_liq_cima: boolean; tiene_correo_importe: boolean; nota_gestion: string | null
  }>>`
    SELECT compania_codigo, compania, tiene_recibos_cima, tiene_liq_cima,
           tiene_correo_importe, nota_gestion
    FROM comisiones_cobertura WHERE cuenta_id = ${session.id}::uuid ORDER BY compania`

  const conCobertura = new Set(
    cobertura.filter(c => c.tiene_recibos_cima || c.tiene_liq_cima || c.tiene_correo_importe)
      .map(c => c.compania_codigo))

  const periodos = filas.map(f => {
    const estado: EstadoCuadre = estadoCuadre({
      leidoOk: f.leido_ok,
      tieneCobertura: conCobertura.has(f.compania_codigo),
      esperadoBruto: f.esperado_bruto, liqBruto: f.liq_bruto,
      liqRetencion: f.liq_retencion, liqRemesa: f.liq_remesa, bancoTotal: f.banco_total,
    })
    return {
      companiaCodigo: f.compania_codigo, compania: f.compania,
      inicio: f.periodo_inicio.toISOString().slice(0, 10),
      fin: f.periodo_fin.toISOString().slice(0, 10),
      esperado: f.esperado_bruto, liqBruto: f.liq_bruto, liqRetencion: f.liq_retencion,
      liqRemesa: f.liq_remesa, liqOrigen: f.liq_origen, banco: f.banco_total, estado,
    }
  })

  // 🚨 El total anual NO se presenta como cerrado si falta algún periodo.
  const estados = periodos.map(p => p.estado)
  const suma = (k: 'liqBruto' | 'liqRetencion') =>
    periodos.reduce((s, p) => s + (p[k] ?? 0), 0)

  return NextResponse.json({
    año, periodos, cobertura,
    total: {
      bruto: Math.round(suma('liqBruto') * 100) / 100,
      retencion: Math.round(suma('liqRetencion') * 100) / 100,
      cerrado: totalEsCerrado(estados),
      pendientes: estados.filter(s => s === 'sin-datos' || s === 'sin-cobertura' || s === 'no-comprobado').length,
    },
  })
}
```

- [ ] **Step 2: Typecheck y commit**

```bash
git add apps/plataforma/app/api/correduria/comisiones/route.ts
git commit -m "feat(correduría): API del libro de comisiones por año"
```

---

### Task 10: Confirmación manual de un periodo

**Files:**
- Create: `apps/plataforma/app/api/correduria/comisiones/confirmar/route.ts`

Para Mapfre: el agente avisa, Alberto teclea el importe. Queda marcado como `manual`, nunca mezclado
con lo que viene de CIMA.

- [ ] **Step 1: Escribir la ruta**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as {
    companiaCodigo?: string; compania?: string; inicio?: string; fin?: string
    bruto?: number; retencion?: number; remesa?: number
  } | null
  if (!body?.companiaCodigo || !body.inicio || !body.fin || typeof body.bruto !== 'number') {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  }
  const retencion = typeof body.retencion === 'number' ? body.retencion : null
  const remesa = typeof body.remesa === 'number'
    ? body.remesa
    : (retencion != null ? Math.round((body.bruto - retencion) * 100) / 100 : null)

  await prisma.$executeRaw`
    INSERT INTO comisiones_devengo
      (cuenta_id, compania_codigo, compania, periodo_inicio, periodo_fin,
       liq_bruto, liq_retencion, liq_remesa, liq_origen, liq_confirmado_at, leido_ok, actualizado_at)
    VALUES (${session.id}::uuid, ${body.companiaCodigo}, ${body.compania ?? body.companiaCodigo},
            ${body.inicio}::date, ${body.fin}::date,
            ${body.bruto}, ${retencion}, ${remesa}, 'manual', now(), true, now())
    ON CONFLICT (cuenta_id, compania_codigo, periodo_inicio, periodo_fin) DO UPDATE SET
      liq_bruto = EXCLUDED.liq_bruto, liq_retencion = EXCLUDED.liq_retencion,
      liq_remesa = EXCLUDED.liq_remesa, liq_origen = 'manual',
      liq_confirmado_at = now(), actualizado_at = now()`

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Typecheck y commit**

```bash
git add apps/plataforma/app/api/correduria/comisiones/confirmar/route.ts
git commit -m "feat(correduría): confirmación manual del importe liquidado de un periodo"
```

---

### Task 11: Pestaña «Cuadre» en `/correduria`

**Files:**
- Modify: `apps/plataforma/app/(usuario)/correduria/CorreduriaClient.tsx`

Reglas de la casa que aplican aquí: **móvil ≥320 px** (la tabla va en un contenedor con
`overflow-x:auto`, nunca scroll horizontal del body), importes con `eur()`, y el total anual con su
aviso cuando no está cerrado.

- [ ] **Step 1: Añadir el componente**

```tsx
// Dentro de CorreduriaClient.tsx, como pestaña nueva.
const SEMAFORO: Record<string, string> = {
  'cuadra': '🟢', 'deudor': '🟠', 'cobrado-sin-liquidar': '🟠',
  'esperado-sin-liquidar': '🔴', 'liquidado-sin-cobrar': '🔴', 'descuadra': '🔴',
  'sin-datos': '⚪', 'no-comprobado': '⚪', 'sin-cobertura': '🟠',
}
const ETIQUETA: Record<string, string> = {
  'cuadra': 'Cuadra',
  'deudor': 'Saldo a favor de la compañía',
  'cobrado-sin-liquidar': 'Ingreso sin explicar',
  'esperado-sin-liquidar': 'Devengado y sin liquidar',
  'liquidado-sin-cobrar': 'Liquidado y sin ingresar',
  'descuadra': 'Descuadra',
  'sin-datos': 'Sin datos todavía',
  'no-comprobado': 'No se ha podido comprobar',
  'sin-cobertura': 'Sin fuente — hay gestión pendiente',
}

function Cuadre({ datos }: { datos: RespuestaCuadre }) {
  return (
    <section>
      <div style={{ marginBottom: 16 }}>
        <strong>Total {datos.año}:</strong> bruto {eur(datos.total.bruto)} · retención {eur(datos.total.retencion)}
        {!datos.total.cerrado && (
          <p style={{ color: '#b45309', marginTop: 4 }}>
            ⚠️ Cifra <strong>provisional</strong>: {datos.total.pendientes} periodo(s) sin dato o sin
            fuente. No la mandes a la asesoría como definitiva.
          </p>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: 640, width: '100%' }}>
          <thead>
            <tr><th>Compañía</th><th>Periodo</th><th>Devengado</th><th>Liquidado</th><th>Retención</th><th>Banco</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {datos.periodos.map(p => (
              <tr key={`${p.companiaCodigo}-${p.inicio}`}>
                <td>{p.compania}</td>
                <td>{p.inicio} → {p.fin}</td>
                <td>{p.esperado == null ? '—' : eur(p.esperado)}</td>
                <td>{p.liqBruto == null ? '—' : eur(p.liqBruto)}{p.liqOrigen === 'manual' ? ' ✍️' : ''}</td>
                <td>{p.liqRetencion == null ? '—' : eur(p.liqRetencion)}</td>
                <td>{p.banco == null ? '—' : eur(p.banco)}</td>
                <td>{SEMAFORO[p.estado]} {ETIQUETA[p.estado]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

⚠️ **`—` y no `0,00€`** en cada casilla nula. Un cero ahí diría «la compañía te liquidó cero», que es
una afirmación distinta de «no ha llegado».

- [ ] **Step 2: Comprobar en móvil**

Verificar a 320 px que la tabla scrollea dentro de su contenedor y el body no.

- [ ] **Step 3: Typecheck y commit**

```bash
git add apps/plataforma/app/\(usuario\)/correduria/CorreduriaClient.tsx
git commit -m "feat(correduría): pestaña de cuadre con los tres ejes y el total anual honesto"
```

---

### Task 12: Corregir el spec y cerrar

**Files:**
- Modify: `docs/superpowers/specs/2026-09-01-comisiones-renta-control-design.md`
- Modify: `docs/CONTEXTO-SESIONES.md`

- [ ] **Step 1: Corregir la vía de acceso en el spec**

Sustituir en la cabecera y en §4.3 las menciones a que plataforma lee «por `ASEGURA_DATABASE_URL`» por
el puerto HTTP `/api/operador/comisiones` de central-asegura con `ASEGURA_OPERADOR_SECRET`.

- [ ] **Step 2: Los 12 checks en local**

```bash
npx --yes pnpm@10.33.0 install --no-frozen-lockfile
npx --yes pnpm@10.33.0 test                       # desde la raíz
# por app (11): prisma generate + tsc --noEmit
#   ⚠️ apps/asegura necesita LOS DOS clientes:
#      prisma generate && prisma generate --schema prisma/asegura.prisma
cd apps/ia-rest && npx --yes pnpm@10.33.0 exec tsx scripts/qa-check.ts
cd apps/ia-rest && npx --yes pnpm@10.33.0 run lint      # 0 errores
```

- [ ] **Step 3: PR**

```bash
git push -u origin claude/comisiones-renta-control-jcvfzt
```

Abrir PR draft y sacarlo de draft para que arranquen los 12 requeridos.

---

## Fuera de alcance (recordatorio del spec)

- Descargar o descifrar el PDF de Mapfre (enlace + NIF, caduca a 90 días).
- Reconstruir 2025.
- Escribir en la BD de la correduría: **solo lectura**.
- Emitir el modelo 190. Esto produce un libro registro, no una presentación.
