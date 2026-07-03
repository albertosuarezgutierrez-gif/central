# Agente de contabilidad conversacional — Fase 1 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una página `/contable` en plataforma donde Alberto pregunta sobre su contabilidad (solo lectura) y el agente aprende sus hábitos en una tabla de memoria que le inyecta en cada charla.

**Architecture:** Un "cerebro" en `apps/plataforma/lib/contable/` (contexto de solo lectura + llamada IA + memoria) y una "boca" web (route `/api/contable/chat` + página cliente `/contable`). Reutiliza el patrón exacto del chat del agente de precios (`app/api/agente/chat/route.ts`), la pasarela `aiComplete` de `@central/core-ai`, y el aprendizaje por canal lateral (`GUARDAR_APRENDIZAJE:` → aquí `APRENDER:`). Multi-tenant: todo scoped por `cuenta_id`.

**Tech Stack:** Next.js 15 / React 19, Prisma raw SQL sobre la Supabase compartida (`wswbehlcuxqxyinousql`), `@central/core-ai` (NVIDIA NIM Llama 3.3-70b), tests `node --test` (type-stripping).

**Alcance de esta fase:** SOLO responder (Q&A) + aprender hábitos. NADA de acciones/escritura contable, documentos ni Telegram — eso son las Fases 2-4 (planes de seguimiento). Referencia del spec: `docs/superpowers/specs/2026-07-03-agente-contabilidad-conversacional-design.md`.

**Nota de UI:** el spec proponía un panel dentro de `/finanzas?tab=contable`. Para esta fase se hace como **página dedicada `/contable`** (igual que `/agente` del agente de precios): es el patrón establecido, más simple y de menor riesgo. Embeberlo como pestaña de `/finanzas` queda como opción posterior.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `apps/plataforma/prisma/sql/2026-07-03_contable.sql` | Migración: tablas `contable_memoria` (hábitos) + `contable_log` (traza/historial) |
| `apps/plataforma/lib/contable/parse.ts` | PURO: extrae las líneas `APRENDER: {json}` de la respuesta del modelo |
| `apps/plataforma/lib/contable/parse.test.ts` | Tests del parser |
| `apps/plataforma/lib/contable/memoria.ts` | Lee/escribe `contable_memoria` + `contable_log` |
| `apps/plataforma/lib/contable/formato.ts` | Formateador PURO (contexto→string). Sin `@/`/Prisma para que el test cargue aislado |
| `apps/plataforma/lib/contable/contexto.ts` | Fetch de finanzas+memoria+historial y llamada al formateador puro |
| `apps/plataforma/lib/contable/contexto.test.ts` | Tests del formateador puro (importa `./formato.ts`) |
| `apps/plataforma/lib/contable/cerebro.ts` | System prompt + `responder()` (orquesta contexto→IA→memoria→log) |
| `apps/plataforma/app/api/contable/chat/route.ts` | Endpoint web POST |
| `apps/plataforma/app/(usuario)/contable/page.tsx` | UI de chat (espejo de `/agente`) |
| `apps/plataforma/app/(usuario)/UserSidebar.tsx` | +1 entrada de navegación |
| `apps/plataforma/app/(usuario)/CommandPalette.tsx` | +1 entrada en la paleta |

---

## Task 1: Migración de BD (memoria + traza)

**Files:**
- Create: `apps/plataforma/prisma/sql/2026-07-03_contable.sql`

- [ ] **Step 1: Escribir el fichero de migración**

```sql
-- Memoria y traza del agente de contabilidad conversacional (Fase 1).
-- Multi-tenant: scoped por cuenta_id. Aplicar como postgres (Supabase MCP), NO por el rol de la app.
-- Supabase auto-activa RLS en tablas nuevas de public; el rol prisma_plataforma tiene BYPASSRLS,
-- así que la app lee/escribe sin políticas. NO exponer estas tablas por REST/anon.

CREATE TABLE IF NOT EXISTS contable_memoria (
  id          BIGSERIAL PRIMARY KEY,
  cuenta_id   UUID NOT NULL,
  clave       TEXT NOT NULL,
  insight     TEXT NOT NULL,
  metricas    JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cuenta_id, clave)
);

CREATE TABLE IF NOT EXISTS contable_log (
  id          BIGSERIAL PRIMARY KEY,
  cuenta_id   UUID NOT NULL,
  canal       TEXT NOT NULL DEFAULT 'web',
  rol         TEXT NOT NULL,            -- 'user' | 'assistant'
  mensaje     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contable_log_cuenta_fecha ON contable_log (cuenta_id, created_at DESC);
```

- [ ] **Step 2: Aplicar la migración en la Supabase compartida**

Aplicar como `postgres` vía Supabase MCP (`apply_migration` con name `contable_fase1`, o `execute_sql` con el contenido del fichero). Proyecto: `wswbehlcuxqxyinousql`.

- [ ] **Step 3: Verificar que las tablas existen**

Vía Supabase MCP `execute_sql`:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('contable_memoria','contable_log');
```
Expected: dos filas (`contable_memoria`, `contable_log`).

- [ ] **Step 4: Commit**

```bash
git add apps/plataforma/prisma/sql/2026-07-03_contable.sql
git commit -m "feat(contable): migración memoria + traza (fase 1)"
```

---

## Task 2: Parser del canal lateral `APRENDER:` (puro, TDD)

**Files:**
- Create: `apps/plataforma/lib/contable/parse.ts`
- Test: `apps/plataforma/lib/contable/parse.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// apps/plataforma/lib/contable/parse.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extraerAprendizajes } from './parse.ts'

test('sin línea APRENDER → texto intacto, sin aprendizajes', () => {
  const r = extraerAprendizajes('Llevas 320€ en luz este mes.')
  assert.equal(r.limpio, 'Llevas 320€ en luz este mes.')
  assert.deepEqual(r.aprendizajes, [])
})

test('una línea APRENDER → se extrae y se quita del texto', () => {
  const r = extraerAprendizajes(
    'Entendido, lo recordaré.\nAPRENDER: {"clave":"criterio_gasto","insight":"Meter todo el gasto en el año, no amortizar de oficio"}')
  assert.equal(r.limpio, 'Entendido, lo recordaré.')
  assert.deepEqual(r.aprendizajes, [{ clave: 'criterio_gasto', insight: 'Meter todo el gasto en el año, no amortizar de oficio' }])
})

test('JSON mal formado → se ignora, no rompe', () => {
  const r = extraerAprendizajes('Vale.\nAPRENDER: {roto')
  assert.equal(r.limpio, 'Vale.')
  assert.deepEqual(r.aprendizajes, [])
})

test('dos líneas APRENDER → dos aprendizajes y texto limpio', () => {
  const r = extraerAprendizajes(
    'Ok.\nAPRENDER: {"clave":"a","insight":"uno"}\nAPRENDER: {"clave":"b","insight":"dos"}')
  assert.equal(r.aprendizajes.length, 2)
  assert.equal(r.limpio, 'Ok.')
})

test('clave/insight vacíos → se descartan', () => {
  const r = extraerAprendizajes('X\nAPRENDER: {"clave":"","insight":"algo"}')
  assert.deepEqual(r.aprendizajes, [])
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `cd apps/plataforma && node --test lib/contable/parse.test.ts`
Expected: FAIL — `Cannot find module './parse.ts'`.

- [ ] **Step 3: Implementar el parser**

```ts
// apps/plataforma/lib/contable/parse.ts
// Extrae las líneas técnicas `APRENDER: {json}` de la respuesta del modelo y devuelve el texto
// limpio (sin esas líneas) + los aprendizajes parseados. Puro y testeable (node --test).

export type Aprendizaje = { clave: string; insight: string }

export function extraerAprendizajes(texto: string): { limpio: string; aprendizajes: Aprendizaje[] } {
  const re = /APRENDER:\s*(\{[\s\S]*?\})/g
  const aprendizajes: Aprendizaje[] = []
  for (const m of texto.matchAll(re)) {
    try {
      const obj = JSON.parse(m[1])
      const clave = typeof obj?.clave === 'string' ? obj.clave.trim().slice(0, 60) : ''
      const insight = typeof obj?.insight === 'string' ? obj.insight.trim().slice(0, 500) : ''
      if (clave && insight) aprendizajes.push({ clave, insight })
    } catch { /* línea mal formada: ignorar */ }
  }
  // Borra cualquier línea que empiece por APRENDER: (válida o mal formada) del texto visible.
  const limpio = texto.replace(/^[ \t]*APRENDER:.*$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
  return { limpio, aprendizajes }
}
```

> Nota: el borrado del texto visible es **por línea** (`/^[ \t]*APRENDER:.*$/gm`), no por el
> mismo regex que captura el JSON — así una línea `APRENDER:` con JSON mal formado (sin `}`)
> también se elimina de la respuesta mostrada al usuario.

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `cd apps/plataforma && node --test lib/contable/parse.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/contable/parse.ts apps/plataforma/lib/contable/parse.test.ts
git commit -m "feat(contable): parser del canal APRENDER (puro, con tests)"
```

---

## Task 3: Capa de memoria (lee/escribe memoria + traza)

**Files:**
- Create: `apps/plataforma/lib/contable/memoria.ts`

*(Sin test unitario: es I/O sobre BD; se verifica end-to-end en Task 7. Sigue el patrón de `app/api/agente/chat/route.ts`.)*

- [ ] **Step 1: Implementar la capa de memoria**

```ts
// apps/plataforma/lib/contable/memoria.ts
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { Aprendizaje } from './parse'

export type MemoriaRow = { clave: string; insight: string }
export type TurnoRow = { rol: string; mensaje: string }

export async function getMemoria(cuentaId: string): Promise<MemoriaRow[]> {
  return prisma.$queryRaw<MemoriaRow[]>(Prisma.sql`
    SELECT clave, insight FROM contable_memoria
    WHERE cuenta_id = ${cuentaId}::uuid
    ORDER BY updated_at DESC LIMIT 40`).catch(() => [])
}

export async function guardarInsight(cuentaId: string, a: Aprendizaje): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO contable_memoria (cuenta_id, clave, insight, metricas, updated_at)
    VALUES (${cuentaId}::uuid, ${a.clave}, ${a.insight},
            ${JSON.stringify({ source: 'chat', at: new Date().toISOString() })}::jsonb, now())
    ON CONFLICT (cuenta_id, clave) DO UPDATE
    SET insight = EXCLUDED.insight, metricas = EXCLUDED.metricas, updated_at = now()`).catch(() => {})
}

// Historial en orden cronológico (los N más recientes, ascendente).
export async function getHistorial(cuentaId: string, n = 8): Promise<TurnoRow[]> {
  const rows = await prisma.$queryRaw<TurnoRow[]>(Prisma.sql`
    SELECT rol, mensaje FROM contable_log
    WHERE cuenta_id = ${cuentaId}::uuid AND mensaje IS NOT NULL
    ORDER BY created_at DESC LIMIT ${n}`).catch(() => [])
  return rows.reverse()
}

export async function logTurno(
  cuentaId: string, canal: string, rol: 'user' | 'assistant', mensaje: string,
): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO contable_log (cuenta_id, canal, rol, mensaje)
    VALUES (${cuentaId}::uuid, ${canal}, ${rol}, ${mensaje})`).catch(() => {})
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/plataforma/lib/contable/memoria.ts
git commit -m "feat(contable): capa de memoria y traza"
```

---

## Task 4: Contexto de solo lectura (formateador puro + fetch)

> **Split necesario:** el formateador PURO vive en `formato.ts` (sin `@/`/Prisma) y el fetch en
> `contexto.ts`. Node `--test` resuelve todo el grafo de imports al cargar, y no entiende el alias
> `@/`; si el test importase `contexto.ts` (que importa `@/lib/db`), fallaría al cargar. Por eso el
> test importa `./formato.ts`. Mismo principio que hace testeable a `parse.ts` (autónomo).

**Files:**
- Create: `apps/plataforma/lib/contable/formato.ts` (formateador puro + `CtxData` + `DESTINO_LABEL`)
- Create: `apps/plataforma/lib/contable/contexto.ts` (fetch + `construirContexto`, re-exporta el formateador)
- Test: `apps/plataforma/lib/contable/contexto.test.ts` (importa `./formato.ts`)

Nota de columnas (verificadas en `lib/finanzas.ts` y skills): `movimientos_bancarios` tiene `destino`, `importe`, `concepto`, `fecha_operacion`, `cuenta_bancaria_id`, `duplicado_estado`; se une a `cuentas_bancarias (id, cuenta_id, banco)`. Se filtran duplicados con `duplicado_estado`. `facturas_proveedor` tiene `cuenta_id, proveedor, importe, estado, fecha_factura`.

- [ ] **Step 1: Escribir el test del formateador (puro)**

```ts
// apps/plataforma/lib/contable/contexto.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatearContexto } from './contexto.ts'

test('formatea destinos, movimientos, memoria e historial', () => {
  const txt = formatearContexto({
    year: 2026,
    porDestino: [{ destino: 'turistico_pisos', gastos: 1200, ingresos: 5000 }],
    ultimos: [{ fecha: '2026-07-01', concepto: 'RECIBO ENDESA', importe: -66.98, destino: 'turistico_pisos' }],
    facturas: [{ proveedor: 'IONOS', importe: 12.1, estado: 'nueva' }],
    memoria: [{ clave: 'criterio_gasto', insight: 'Meter todo el gasto en el año' }],
    historial: [{ rol: 'user', mensaje: 'hola' }, { rol: 'assistant', mensaje: 'buenas' }],
  })
  assert.match(txt, /Pisos turísticos: gastos 1200€, ingresos 5000€/)
  assert.match(txt, /RECIBO ENDESA/)
  assert.match(txt, /IONOS · 12\.10€ · nueva/)
  assert.match(txt, /\[criterio_gasto\] Meter todo el gasto en el año/)
  assert.match(txt, /Alberto: hola/)
})

test('secciones vacías → textos por defecto, sin bloque de conversación', () => {
  const txt = formatearContexto({ year: 2026, porDestino: [], ultimos: [], facturas: [], memoria: [], historial: [] })
  assert.match(txt, /sin movimientos este año/)
  assert.match(txt, /aún no sé nada de tu rutina/)
  assert.doesNotMatch(txt, /# Conversación reciente/)
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `cd apps/plataforma && node --test lib/contable/contexto.test.ts`
Expected: FAIL — `Cannot find module './contexto.ts'`.

- [ ] **Step 3: Implementar contexto (formateador puro + fetch)**

```ts
// apps/plataforma/lib/contable/contexto.ts
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getMemoria, getHistorial, type MemoriaRow, type TurnoRow } from './memoria'

export type CtxData = {
  year: number
  porDestino: { destino: string; gastos: number; ingresos: number }[]
  ultimos: { fecha: string; concepto: string; importe: number; destino: string }[]
  facturas: { proveedor: string; importe: number; estado: string }[]
  memoria: MemoriaRow[]
  historial: TurnoRow[]
}

const DESTINO_LABEL: Record<string, string> = {
  turistico_pisos: 'Pisos turísticos', turistico_duplex: 'Dúplex/Villasís',
  seguros: 'Correduría (seguros)', personal: 'Personal', traspaso_interno: 'Traspaso interno',
}

// PURO — testeable sin BD.
export function formatearContexto(d: CtxData): string {
  const dest = d.porDestino.length
    ? d.porDestino.map(x => `- ${DESTINO_LABEL[x.destino] || x.destino}: gastos ${Math.round(x.gastos)}€, ingresos ${Math.round(x.ingresos)}€`).join('\n')
    : '- (sin movimientos este año)'
  const ult = d.ultimos.length
    ? d.ultimos.map(x => `- ${x.fecha} · ${(x.concepto || '').slice(0, 60)} · ${Number(x.importe).toFixed(2)}€ [${x.destino}]`).join('\n')
    : '- (sin movimientos recientes)'
  const fac = d.facturas.length
    ? d.facturas.map(x => `- ${x.proveedor} · ${Number(x.importe).toFixed(2)}€ · ${x.estado}`).join('\n')
    : '- (ninguna pendiente)'
  const mem = d.memoria.length
    ? d.memoria.map(x => `- [${x.clave}] ${x.insight}`).join('\n')
    : '- (aún no sé nada de tu rutina — cuéntamelo y lo recordaré)'
  const hist = d.historial.length
    ? d.historial.map(x => `${x.rol === 'user' ? 'Alberto' : 'Tú'}: ${x.mensaje}`).join('\n')
    : ''
  return `# Resumen ${d.year} por destino (deducibilidad)
${dest}

# Últimos movimientos
${ult}

# Facturas de proveedor pendientes
${fac}

# Lo que sé de tu rutina (memoria)
${mem}${hist ? `\n\n# Conversación reciente\n${hist}` : ''}`
}

// Fetch + formato. Defensivo (BD compartida, SQL crudo).
export async function construirContexto(cuentaId: string): Promise<string> {
  const year = new Date().getFullYear()

  const porDestino = await prisma.$queryRaw<CtxData['porDestino']>(Prisma.sql`
    SELECT coalesce(mb.destino, 'personal') AS destino,
           sum(CASE WHEN mb.importe < 0 THEN -mb.importe ELSE 0 END)::float8 AS gastos,
           sum(CASE WHEN mb.importe > 0 THEN  mb.importe ELSE 0 END)::float8 AS ingresos
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND EXTRACT(year FROM mb.fecha_operacion) = ${year}
      AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado <> 'ignorado')
    GROUP BY 1 ORDER BY 2 DESC`).catch(() => [])

  const ultimos = await prisma.$queryRaw<CtxData['ultimos']>(Prisma.sql`
    SELECT mb.fecha_operacion::text AS fecha, mb.concepto,
           mb.importe::float8 AS importe, coalesce(mb.destino, '?') AS destino
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado <> 'ignorado')
    ORDER BY mb.fecha_operacion DESC LIMIT 10`).catch(() => [])

  const facturas = await prisma.$queryRaw<CtxData['facturas']>(Prisma.sql`
    SELECT proveedor, importe::float8 AS importe, estado
    FROM facturas_proveedor
    WHERE cuenta_id = ${cuentaId}::uuid AND estado NOT IN ('pagada', 'rechazada')
    ORDER BY fecha_factura DESC NULLS LAST LIMIT 10`).catch(() => [])

  const [memoria, historial] = await Promise.all([getMemoria(cuentaId), getHistorial(cuentaId, 8)])

  return formatearContexto({ year, porDestino, ultimos, facturas, memoria, historial })
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `cd apps/plataforma && node --test lib/contable/contexto.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/contable/contexto.ts apps/plataforma/lib/contable/contexto.test.ts
git commit -m "feat(contable): contexto de solo lectura (formateador puro + fetch)"
```

---

## Task 5: Cerebro (system prompt + orquestación)

**Files:**
- Create: `apps/plataforma/lib/contable/cerebro.ts`

- [ ] **Step 1: Implementar el cerebro**

```ts
// apps/plataforma/lib/contable/cerebro.ts
// Un turno del agente de contabilidad: arma contexto → llama IA → aprende hábitos → traza.
// Solo lectura (Fase 1). Reutiliza el patrón de app/api/agente/chat/route.ts.
import { aiComplete } from '@central/core-ai'
import { construirContexto } from './contexto'
import { extraerAprendizajes, type Aprendizaje } from './parse'
import { guardarInsight, logTurno } from './memoria'

const SYSTEM = `Eres el agente de CONTABILIDAD de Alberto (casa de marcas: pisos turísticos, correduría de seguros, gastos personales). Hablas con Alberto, el dueño, en español, claro y breve.

Tu trabajo en esta fase:
1. RESPONDER preguntas sobre su contabilidad leyendo SOLO el contexto que te doy (movimientos por destino, últimos cargos, facturas pendientes). No inventes cifras: si un dato no está en el contexto, dilo.
2. APRENDER su rutina: cuando Alberto te cuente un hábito, criterio o dato que debas RECORDAR para siempre (ej. "meto todo el gasto en el año", "ENERGIA XXI es la luz de mi casa, personal"), añade AL FINAL de tu respuesta UNA línea por cada uno, EXACTAMENTE así (y nada más en esa línea):
APRENDER: {"clave":"<slug corto y estable, ej: criterio_gasto|energia_xxi|estructura_pisos>","insight":"<la regla o dato en una sola frase>"}

Reglas:
- Si es solo una pregunta (sin hábito nuevo que recordar), NO añadas ninguna línea APRENDER.
- Reutiliza la MISMA "clave" si actualizas un hábito que ya conoces (para no duplicar).
- SOLO LECTURA: todavía no puedes clasificar cargos, conciliar facturas ni pagar. Si Alberto te lo pide, dile que en esta fase solo informas y que esas acciones llegan en la siguiente fase.`

export async function responder(
  cuentaId: string, mensaje: string, canal = 'web',
): Promise<{ respuesta: string; guardados: Aprendizaje[] }> {
  // Contexto ANTES de registrar el turno (el historial no debe incluir el mensaje actual).
  const ctx = await construirContexto(cuentaId).catch(() => '(no se pudo leer el contexto)')
  await logTurno(cuentaId, canal, 'user', mensaje)

  const prompt = `${ctx}\n\n# Mensaje de Alberto\n${mensaje}\n\n# Tu respuesta`
  const raw = await aiComplete(prompt, { system: SYSTEM, maxTokens: 700, timeoutMs: 25_000 })

  const { limpio, aprendizajes } = extraerAprendizajes(raw)
  for (const a of aprendizajes) await guardarInsight(cuentaId, a)
  await logTurno(cuentaId, canal, 'assistant', limpio)

  return { respuesta: limpio, guardados: aprendizajes }
}
```

- [ ] **Step 2: Verificar que tipa (typecheck del paquete)**

Run: `cd apps/plataforma && npx tsc --noEmit`
Expected: sin errores nuevos en `lib/contable/*`. (Si el proyecto no expone `tsc`, este check se cubre en el build de Task 8.)

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/lib/contable/cerebro.ts
git commit -m "feat(contable): cerebro (system prompt + orquestación de un turno)"
```

---

## Task 6: Endpoint web `/api/contable/chat`

**Files:**
- Create: `apps/plataforma/app/api/contable/chat/route.ts`

- [ ] **Step 1: Implementar la route**

```ts
// apps/plataforma/app/api/contable/chat/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { responder } from '@/lib/contable/cerebro'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const mensaje = typeof body?.mensaje === 'string' ? body.mensaje.trim() : ''
  if (!mensaje) return NextResponse.json({ error: 'mensaje requerido' }, { status: 400 })

  try {
    // session.id === cuenta_id (ver lib/tenant.ts / requireEmpresaId).
    const { respuesta, guardados } = await responder(session.id, mensaje, 'web')
    return NextResponse.json({ respuesta, guardados })
  } catch (e: any) {
    const msg = String(e?.message || e)
    if (msg.includes('NVIDIA_API_KEY')) {
      return NextResponse.json({ respuesta: 'El agente necesita la variable NVIDIA_API_KEY en el proyecto Vercel de plataforma.' })
    }
    return NextResponse.json({ respuesta: 'No se pudo consultar al agente: ' + msg.slice(0, 140) })
  }
}
```

- [ ] **Step 2: Verificar el acceso a `session.id`**

Confirmar en `apps/plataforma/lib/session.ts` que `requireSession()` devuelve un objeto con `.id` (el `cuenta_id`). El chat del agente de precios (`app/api/agente/chat/route.ts`) usa `requireSession()`; el módulo de concursos documenta `requireSession().id === cuenta_id`. Si el nombre del campo difiere, ajustar `session.id` en consecuencia.

Run: `cd apps/plataforma && grep -n "return" lib/session.ts | head`
Expected: ver la forma del objeto de sesión (campo `id`).

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/app/api/contable/chat/route.ts
git commit -m "feat(contable): endpoint web /api/contable/chat"
```

---

## Task 7: UI de chat `/contable`

**Files:**
- Create: `apps/plataforma/app/(usuario)/contable/page.tsx`

Espejo de `app/(usuario)/agente/page.tsx` (mismo look con tokens `var(--*)`, responsive), sin selector de piso, mostrando los hábitos aprendidos como badge.

- [ ] **Step 1: Implementar la página**

```tsx
// apps/plataforma/app/(usuario)/contable/page.tsx
'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

const SUGERENCIAS = [
  '¿Cuánto llevo gastado en luz este año?',
  '¿Qué facturas de proveedor tengo pendientes?',
  '¿Cómo van mis gastos de pisos vs correduría?',
  'Recuerda: meto todo el gasto en el año, no amortices de oficio',
]

type Guardado = { clave: string; insight: string }
type Msg = { rol: 'tu' | 'agente'; texto: string; guardados?: Guardado[] }

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
}

export default function ContablePage() {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs, loading])

  const enviar = useCallback(async (texto: string) => {
    const mensaje = texto.trim()
    if (!mensaje || loading) return
    setInput('')
    setMsgs(m => [...m, { rol: 'tu', texto: mensaje }])
    setLoading(true)
    try {
      const r = await fetch('/api/contable/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje }),
      })
      const data = await r.json().catch(() => ({}))
      setMsgs(m => [...m, { rol: 'agente', texto: data?.respuesta || data?.error || 'Sin respuesta.', guardados: data?.guardados || [] }])
    } catch {
      setMsgs(m => [...m, { rol: 'agente', texto: 'No se pudo conectar con el agente.' }])
    } finally {
      setLoading(false)
    }
  }, [loading])

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '28px 20px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 8px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 24 }}>🧮</span>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Agente de contabilidad</h1>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0, marginBottom: 14 }}>
        Pregúntale por tus gastos, ingresos y facturas, o cuéntale un criterio para que lo recuerde
        (“meto todo el gasto en el año”). De momento solo informa; clasificar y conciliar llegan pronto.
      </p>

      <div ref={scrollRef} style={{ ...card, flex: 1, overflowY: 'auto', padding: 16, marginBottom: 12 }}>
        {msgs.length === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>
            <p style={{ marginTop: 0 }}>Empieza con una de estas:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SUGERENCIAS.map(s => (
                <button key={s} onClick={() => enviar(s)} style={{
                  padding: '7px 12px', borderRadius: 16, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer',
                }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.rol === 'tu' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <div style={{
              maxWidth: '78%', padding: '10px 13px', borderRadius: 12, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
              background: m.rol === 'tu' ? 'var(--primary)' : 'var(--primary-light)',
              color: m.rol === 'tu' ? '#fff' : 'var(--text)',
            }}>
              {m.texto}
              {m.guardados && m.guardados.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                  {m.guardados.map(g => <div key={g.clave}>✓ Recordado ({g.clave}): “{g.insight}”</div>)}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <div style={{ color: 'var(--muted)', fontSize: 13 }}>El agente está pensando…</div>}
      </div>

      <form onSubmit={e => { e.preventDefault(); enviar(input) }} style={{ display: 'flex', gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Escribe a tu agente de contabilidad…"
          disabled={loading} style={{
            flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
          }} />
        <button type="submit" disabled={loading || !input.trim()} style={{
          padding: '11px 20px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 14,
          background: 'var(--primary)', color: '#fff', cursor: loading || !input.trim() ? 'default' : 'pointer',
          opacity: loading || !input.trim() ? 0.6 : 1,
        }}>Enviar</button>
      </form>
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/plataforma/app/(usuario)/contable/page.tsx
git commit -m "feat(contable): página de chat /contable"
```

---

## Task 8: Navegación (sidebar + command palette) y build

**Files:**
- Modify: `apps/plataforma/app/(usuario)/UserSidebar.tsx` (array `NAV_NEGOCIO`, tras la línea `{ href: '/agente', icon: '🤖', label: 'Agente precios' },`)
- Modify: `apps/plataforma/app/(usuario)/CommandPalette.tsx` (tras la línea `{ label: 'Finanzas', icon: '💶', href: '/finanzas', group: 'Mi negocio' },`)

- [ ] **Step 1: Añadir la entrada al sidebar**

En `UserSidebar.tsx`, dentro de `NAV_NEGOCIO`, añadir tras la entrada `Agente precios`:

```tsx
  { href: '/contable', icon: '🧮', label: 'Contable' },
```

- [ ] **Step 2: Añadir la entrada a la command palette**

En `CommandPalette.tsx`, añadir tras la entrada `Finanzas`:

```tsx
  { label: 'Contable', icon: '🧮', href: '/contable', group: 'Mi negocio' },
```

- [ ] **Step 3: Build de la app (typecheck + compilación)**

Run: `cd apps/plataforma && npx --yes pnpm@10.33.0 install --no-frozen-lockfile && pnpm build`
Expected: build OK, sin errores de tipos ni de import en `lib/contable/*`, `app/api/contable/*`, `app/(usuario)/contable/*`.

- [ ] **Step 4: Commit**

```bash
git add apps/plataforma/app/(usuario)/UserSidebar.tsx apps/plataforma/app/(usuario)/CommandPalette.tsx
git commit -m "feat(contable): entrada de navegación al agente de contabilidad"
```

---

## Verificación end-to-end

Tras desplegar el preview de `plataforma` (o en local con `DATABASE_URL` + `NVIDIA_API_KEY`):

1. **Tests unitarios** (rápido, sin BD):
   `cd apps/plataforma && node --test lib/contable/parse.test.ts lib/contable/contexto.test.ts` → todo PASS.

2. **Q&A de solo lectura:** entrar en `/contable`, preguntar *"¿cuánto llevo gastado en luz este año?"*. La respuesta debe cuadrar con el contexto (contrastar con SQL directo por Supabase MCP: suma de `movimientos_bancarios.importe<0` con `destino` de luz del año). Preguntar *"¿qué facturas tengo pendientes?"* → debe listar filas de `facturas_proveedor` no pagadas.

3. **Aprendizaje:** escribir *"recuerda: meto todo el gasto en el año, no amortices de oficio"*. La UI debe mostrar el badge "✓ Recordado (…)". Verificar la fila:
   ```sql
   SELECT clave, insight FROM contable_memoria WHERE cuenta_id = '<cuenta_id de Alberto>'::uuid;
   ```
   En un turno posterior, preguntar *"¿cuál es mi criterio de gasto?"* → debe responder con lo aprendido (prueba de que el contexto reinyecta la memoria).

4. **Traza / historial:** tras varios turnos, `SELECT rol, mensaje FROM contable_log WHERE cuenta_id = '…' ORDER BY created_at` muestra la conversación; una nueva pregunta que dependa del turno anterior (ej. "¿y el mes pasado?") mantiene contexto.

5. **Sin NVIDIA_API_KEY:** el endpoint responde el mensaje guía, no un 500.

6. **Responsive** (regla global): en móvil ≥320px el chat es usable (input y burbujas no desbordan; `max-width:78%` en burbujas, layout flex).

---

## Self-review (hecho)

- **Cobertura del spec (Fase 1):** cerebro (`cerebro.ts`) ✓; memoria de hábitos (`contable_memoria` + `memoria.ts`) ✓; traza/historial (`contable_log`) ✓; contexto de solo lectura (`contexto.ts`) ✓; boca web (`route.ts` + `page.tsx`) ✓; canal `APRENDER:` (`parse.ts`) ✓. Reglas de clasificación (`banca_destino_reglas`), acciones, documentos y Telegram son Fases 2-4 (fuera de alcance, declarado).
- **Placeholders:** ninguno — todo el código está completo.
- **Consistencia de tipos:** `Aprendizaje {clave,insight}` se define en `parse.ts` y se usa igual en `memoria.ts`/`cerebro.ts`; `MemoriaRow`/`TurnoRow` definidos en `memoria.ts` y reusados en `contexto.ts`; `responder()` devuelve `{respuesta, guardados}` y la route/UI consumen esos mismos nombres; el canal lateral es `APRENDER:` en el system prompt y en el parser.
