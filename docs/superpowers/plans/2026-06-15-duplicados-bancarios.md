# Resolución de cargos duplicados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `plataforma` detecte cargos bancarios duplicados de forma fiable (con confianza/umbral y sin falsos positivos de micro-gastos) y permita al dueño **resolverlos** (ignorar / confirmar / deshacer), con la decisión persistida.

**Architecture:** Aditivo sobre la consolidación bancaria existente (`apps/plataforma`). Una columna nueva `duplicado_estado` en `movimientos_bancarios` guarda la resolución. La detección se centraliza en `lib/banca.ts` (`getDuplicadosSospechosos`), reutilizada por el banner del dashboard y por una bandeja nueva en `/banca`. La lógica pura (confianza + umbral) se extrae a funciones testeables; el SQL se verifica con Supabase MCP. Fases 2 (reclamación IA) y 3 (auto-recurrentes) son aditivas sobre el mismo modelo.

**Tech Stack:** Next.js 15 · React 19 · Prisma 5 (`$queryRaw`) · zod · `@central/core-ai` (solo F2) · `node --test` (lib pura). BD compartida Supabase `wswbehlcuxqxyinousql`, schema `public`.

**Spec:** `docs/superpowers/specs/2026-06-15-duplicados-bancarios-design.md`

---

## File Structure

- **Crear** `apps/plataforma/prisma/sql/2026-06-15_banca_duplicados.sql` — migración aditiva (columna + índice parcial).
- **Modificar** `apps/plataforma/lib/banca.ts` — funciones puras (`clasificarConfianza`, `superaUmbralBanner`), `getDuplicadosSospechosos`, `getDuplicadosResueltos`, `resolverDuplicados`; `getAlertas` reusa la detección.
- **Crear** `apps/plataforma/lib/banca.test.ts` — tests de las funciones puras.
- **Crear** `apps/plataforma/app/api/banca/duplicados/route.ts` — `POST` resolver/deshacer.
- **Modificar** `apps/plataforma/app/(usuario)/banca/BancaClient.tsx` — componente `DuplicadosBandeja`.
- **Modificar** `apps/plataforma/app/(usuario)/banca/page.tsx` — cargar y renderizar la bandeja.
- **Modificar** `apps/plataforma/app/(usuario)/dashboard/page.tsx` — banner enlazado a `/banca#duplicados`.
- **(F2)** Crear `apps/plataforma/lib/reclamacion.ts` + `app/api/banca/duplicados/reclamacion/route.ts`; modificar `BancaClient.tsx`.
- **(F3)** Modificar `lib/banca.ts` (detección de recurrentes); migración opcional `contrapartes_recurrentes`.

---

# FASE 1 — Detección fiable + resolución

### Task 1: Migración — columna `duplicado_estado`

**Files:**
- Create: `apps/plataforma/prisma/sql/2026-06-15_banca_duplicados.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Banca · resolución de cargos duplicados. duplicado_estado guarda la decisión del dueño
-- sobre un par sospechoso (mismo importe + contraparte en ±4 días):
--   NULL        → sospechoso sin resolver (lo ve el detector)
--   'ignorado'  → "es normal, no avisar"  → excluido de la detección
--   'confirmado'→ "es un cobro doble real" → fuera de pendientes, queda registrado
-- Aditivo y nullable, mismo patrón que requiere_revision/conciliado/destino.
alter table public.movimientos_bancarios
  add column if not exists duplicado_estado text;

-- Acelera el filtro de pendientes (gastos sin resolver). Volumen pequeño, parcial.
create index if not exists idx_mov_dup_pendiente
  on public.movimientos_bancarios (cuenta_bancaria_id, fecha_operacion)
  where duplicado_estado is null and importe < 0;
```

- [ ] **Step 2: Aplicar la migración con Supabase MCP**

Usar `mcp__Supabase__apply_migration` con `project_id` del proyecto `wswbehlcuxqxyinousql` (obtener con `mcp__Supabase__list_projects` si hace falta), `name: "banca_duplicados"` y el SQL del Step 1.
Expected: éxito; `mcp__Supabase__list_tables` muestra `duplicado_estado` en `movimientos_bancarios`.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/prisma/sql/2026-06-15_banca_duplicados.sql
git commit -m "feat(plataforma): migración duplicado_estado en movimientos_bancarios"
```

---

### Task 2: Funciones puras de confianza + umbral (TDD)

**Files:**
- Modify: `apps/plataforma/lib/banca.ts` (añadir exports al final, antes de `getAlertas`)
- Test: `apps/plataforma/lib/banca.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/plataforma/lib/banca.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificarConfianza, superaUmbralBanner } from './banca'

test('clasificarConfianza: recibo mismo día = alta', () => {
  assert.equal(clasificarConfianza('RECIBO EXCMO AYUNTAMIENTO IBI', true), 'alta')
  assert.equal(clasificarConfianza('TRANSFERENCIA A PROVEEDOR', true), 'alta')
  assert.equal(clasificarConfianza('ADEUDO DOMICILIADO LUZ', true), 'alta')
})

test('clasificarConfianza: compra física o distinto día = baja', () => {
  assert.equal(clasificarConfianza('COMPRA EN HORNO NUEVA FLORIDA', true), 'baja')   // no es recibo
  assert.equal(clasificarConfianza('RECIBO IBI', false), 'baja')                     // recibo pero distinto día
})

test('superaUmbralBanner: micro-gasto de baja confianza NO supera', () => {
  assert.equal(superaUmbralBanner(-3, 'baja', 5), false)
})

test('superaUmbralBanner: alta confianza siempre supera, aunque sea pequeño', () => {
  assert.equal(superaUmbralBanner(-3, 'alta', 5), true)
})

test('superaUmbralBanner: baja confianza por encima del umbral supera', () => {
  assert.equal(superaUmbralBanner(-172, 'baja', 5), true)
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `cd apps/plataforma && npx tsx --test lib/banca.test.ts`
Expected: FAIL — `clasificarConfianza`/`superaUmbralBanner` no exportadas.

> Nota: si `tsx` no está, usar `node --import tsx --test lib/banca.test.ts`. Los tests existentes (`lib/norma43.test.ts`) ya corren así en este paquete.

- [ ] **Step 3: Implementar las funciones puras**

Añadir a `apps/plataforma/lib/banca.ts` (cerca de `getAlertas`):

```ts
// Palabras que delatan un cargo "de sistema" (recibo/transferencia/domiciliación): si dos
// caen el MISMO día con el mismo importe y contraparte, la sospecha de cobro doble es ALTA.
// Una compra en comercio físico repetida en días distintos es ruido normal → BAJA.
const DUP_PALABRAS_ALTA = /RECIBO|TRANSFERENCIA|ADEUDO|DOMICIL|PAGO|CUOTA|LETRA/i

export function clasificarConfianza(concepto: string, mismaFecha: boolean): 'alta' | 'baja' {
  return mismaFecha && DUP_PALABRAS_ALTA.test(concepto || '') ? 'alta' : 'baja'
}

// El banner solo grita por lo que merece la pena: cualquier sospecha de confianza ALTA, o las
// de BAJA cuyo importe supera el umbral (env DUP_UMBRAL_BANNER, por defecto 5 €). Así los
// micro-gastos recurrentes (el pan de 3 €) no disparan el aviso, pero siguen en la página.
export function superaUmbralBanner(importe: number, confianza: 'alta' | 'baja', umbral: number): boolean {
  return confianza === 'alta' || Math.abs(importe) >= umbral
}

export const DUP_UMBRAL_BANNER = Number(process.env.DUP_UMBRAL_BANNER ?? 5)
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `cd apps/plataforma && npx tsx --test lib/banca.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/banca.ts apps/plataforma/lib/banca.test.ts
git commit -m "feat(plataforma): confianza + umbral de duplicados (funciones puras + tests)"
```

---

### Task 3: `getDuplicadosSospechosos` y `getDuplicadosResueltos`

**Files:**
- Modify: `apps/plataforma/lib/banca.ts`

- [ ] **Step 1: Añadir los tipos y la función de detección**

Añadir a `apps/plataforma/lib/banca.ts`:

```ts
export type DupMovimiento = { id: string; fecha: string | null; concepto: string; importe: number; conciliado: boolean }
export type DupGrupo = {
  clave: string
  confianza: 'alta' | 'baja'
  importe: number
  superaUmbral: boolean
  movimientos: DupMovimiento[]
}

type DupRow = {
  id: string; otro_id: string
  concepto: string | null; otro_concepto: string | null
  importe: number
  fecha_operacion: Date | null; otro_fecha: Date | null
  conciliado: boolean; otro_conciliado: boolean
  factura_ref: string | null; otro_factura_ref: string | null
  contraparte_key: string | null
}

// Pares de gastos sospechosos de cobro doble: mismo importe + misma contraparte/concepto en
// ±4 días, últimos 60 días, AMBOS sin resolver (duplicado_estado IS NULL). Excluye pares donde
// los dos están conciliados a facturas DISTINTAS (son gastos legítimos, no duplicado). Agrupa
// por (importe + contraparte) y clasifica confianza/umbral con las funciones puras.
export async function getDuplicadosSospechosos(cuentaId: string): Promise<DupGrupo[]> {
  const rows = await prisma.$queryRaw<DupRow[]>`
    SELECT a.id, b.id AS otro_id,
           coalesce(a.concepto_normalizado, a.concepto, a.contraparte) AS concepto,
           coalesce(b.concepto_normalizado, b.concepto, b.contraparte) AS otro_concepto,
           a.importe::float AS importe,
           a.fecha_operacion, b.fecha_operacion AS otro_fecha,
           a.conciliado, b.conciliado AS otro_conciliado,
           a.factura_ref, b.factura_ref AS otro_factura_ref,
           coalesce(a.contraparte, a.concepto) AS contraparte_key
    FROM movimientos_bancarios a
    JOIN movimientos_bancarios b
      ON b.cuenta_bancaria_id = a.cuenta_bancaria_id AND b.id > a.id
     AND b.importe = a.importe
     AND coalesce(b.contraparte, b.concepto) = coalesce(a.contraparte, a.concepto)
     AND abs(b.fecha_operacion - a.fecha_operacion) <= 4
    JOIN cuentas_bancarias cb ON cb.id = a.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND a.importe < 0
      AND a.duplicado_estado IS NULL AND b.duplicado_estado IS NULL
      AND a.fecha_operacion >= current_date - 60
      AND NOT (a.conciliado AND b.conciliado
               AND a.factura_ref IS NOT NULL AND b.factura_ref IS NOT NULL
               AND a.factura_ref <> b.factura_ref)
    ORDER BY a.fecha_operacion DESC NULLS LAST
  `

  // Agrupar pares por (importe|contraparte) y deduplicar movimientos del grupo.
  const grupos = new Map<string, { clave: string; importe: number; concepto: string; mismaFecha: boolean; movs: Map<string, DupMovimiento> }>()
  const toIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
  for (const r of rows) {
    const clave = `${r.importe}|${(r.contraparte_key || '').trim().toUpperCase()}`
    const g = grupos.get(clave) ?? { clave, importe: r.importe, concepto: r.concepto || r.contraparte_key || 'Movimiento', mismaFecha: false, movs: new Map() }
    if (toIso(r.fecha_operacion) && toIso(r.fecha_operacion) === toIso(r.otro_fecha)) g.mismaFecha = true
    g.movs.set(r.id, { id: r.id, fecha: toIso(r.fecha_operacion), concepto: r.concepto || g.concepto, importe: r.importe, conciliado: r.conciliado })
    g.movs.set(r.otro_id, { id: r.otro_id, fecha: toIso(r.otro_fecha), concepto: r.otro_concepto || g.concepto, importe: r.importe, conciliado: r.otro_conciliado })
    grupos.set(clave, g)
  }

  return [...grupos.values()].map(g => {
    const confianza = clasificarConfianza(g.concepto, g.mismaFecha)
    return {
      clave: g.clave,
      confianza,
      importe: g.importe,
      superaUmbral: superaUmbralBanner(g.importe, confianza, DUP_UMBRAL_BANNER),
      movimientos: [...g.movs.values()].sort((x, y) => (y.fecha || '').localeCompare(x.fecha || '')),
    }
  }).sort((a, b) => (a.confianza === b.confianza ? Math.abs(b.importe) - Math.abs(a.importe) : a.confianza === 'alta' ? -1 : 1))
}

// Resueltos recientes (para el plegable "ya resueltos" con opción de reactivar).
export type DupResuelto = { id: string; fecha: string | null; concepto: string; importe: number; estado: 'ignorado' | 'confirmado' }
export async function getDuplicadosResueltos(cuentaId: string, limite = 40): Promise<DupResuelto[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string; fecha_operacion: Date | null; concepto: string | null; contraparte: string | null; importe: number; duplicado_estado: string }>>`
    SELECT mb.id, mb.fecha_operacion,
           coalesce(mb.concepto_normalizado, mb.concepto, mb.contraparte) AS concepto,
           mb.contraparte, mb.importe::float AS importe, mb.duplicado_estado
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.duplicado_estado IN ('ignorado', 'confirmado')
    ORDER BY mb.fecha_operacion DESC NULLS LAST, mb.created_at DESC
    LIMIT ${limite}
  `
  return rows.map(r => ({
    id: r.id,
    fecha: r.fecha_operacion ? r.fecha_operacion.toISOString().slice(0, 10) : null,
    concepto: r.concepto || r.contraparte || 'Movimiento',
    importe: Number(r.importe),
    estado: r.duplicado_estado as 'ignorado' | 'confirmado',
  }))
}
```

- [ ] **Step 2: Verificar el typecheck/build**

Run: `cd apps/plataforma && npx tsc --noEmit`
Expected: sin errores. (Si `tsc` no está como script, usar `npm run build` y comprobar que compila el módulo.)

- [ ] **Step 3: Verificar la query con Supabase MCP sobre datos reales**

Con `mcp__Supabase__execute_sql` (project `wswbehlcuxqxyinousql`), ejecutar la query de detección sustituyendo `${cuentaId}` por una cuenta real con movimientos. Comprobar que devuelve pares plausibles (p. ej. el IBI / el horno).
Expected: filas de pares con mismo importe/contraparte en ±4 días.

- [ ] **Step 4: Commit**

```bash
git add apps/plataforma/lib/banca.ts
git commit -m "feat(plataforma): detección agrupada de duplicados (sospechosos + resueltos)"
```

---

### Task 4: `resolverDuplicados` + reusar en `getAlertas`

**Files:**
- Modify: `apps/plataforma/lib/banca.ts`

- [ ] **Step 1: Añadir la mutación de resolución**

Añadir a `apps/plataforma/lib/banca.ts`:

```ts
// Marca (o desmarca) movimientos como duplicado resuelto. Scoped por cuenta_id vía join: solo
// toca movimientos de cuentas bancarias de la sesión. estado=null → deshacer (vuelve a NULL).
export async function resolverDuplicados(
  cuentaId: string,
  ids: string[],
  estado: 'ignorado' | 'confirmado' | null,
): Promise<number> {
  if (ids.length === 0) return 0
  const res = await prisma.$executeRaw`
    UPDATE movimientos_bancarios mb
    SET duplicado_estado = ${estado}
    FROM cuentas_bancarias cb
    WHERE cb.id = mb.cuenta_bancaria_id
      AND cb.cuenta_id = ${cuentaId}::uuid
      AND mb.id = ANY(${ids}::uuid[])
  `
  return Number(res)
}
```

- [ ] **Step 2: Reusar la detección en `getAlertas`**

Reemplazar el cuerpo de `getAlertas` (el SQL `dups` y el `Promise.all`) por reutilización de `getDuplicadosSospechosos`, contando solo los grupos que superan el umbral:

```ts
export async function getAlertas(cuentaId: string): Promise<Alertas> {
  const [rev, grupos] = await Promise.all([
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.requiere_revision = true`,
    getDuplicadosSospechosos(cuentaId),
  ])
  const visibles = grupos.filter(g => g.superaUmbral)
  return {
    porRevisar: Number(rev[0]?.n ?? 0),
    duplicados: visibles.length,
    duplicadosDetalle: visibles.slice(0, 3).map(g => ({
      concepto: g.movimientos[0]?.concepto || 'Movimiento',
      importe: g.importe,
      fecha: g.movimientos[0]?.fecha ?? null,
    })),
  }
}
```

> `getDuplicadosSospechosos` debe estar declarada antes de `getAlertas` en el archivo, o ser una `function` hoisted. Si quedó después, moverla arriba o convertir ambas en `export function`/`export async function` (hoisted) — no usar `const`.

- [ ] **Step 3: Verificar el build**

Run: `cd apps/plataforma && npm run build`
Expected: compila sin errores de tipos.

- [ ] **Step 4: Commit**

```bash
git add apps/plataforma/lib/banca.ts
git commit -m "feat(plataforma): resolverDuplicados + getAlertas reusa la detección con umbral"
```

---

### Task 5: API `POST /api/banca/duplicados`

**Files:**
- Create: `apps/plataforma/app/api/banca/duplicados/route.ts`

- [ ] **Step 1: Escribir el endpoint**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/session'
import { resolverDuplicados } from '@/lib/banca'

export const dynamic = 'force-dynamic'

const Body = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
  estado: z.enum(['ignorado', 'confirmado']).nullable(),
})

// POST /api/banca/duplicados { ids, estado } — el dueño resuelve un par sospechoso de cobro
// doble: 'ignorado' (es normal), 'confirmado' (es un cobro doble real) o null (deshacer).
// Scoped por sesión (cuenta).
export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const actualizados = await resolverDuplicados(session.id, parsed.data.ids, parsed.data.estado).catch(() => -1)
  if (actualizados < 0) return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 400 })
  return NextResponse.json({ ok: true, actualizados })
}
```

- [ ] **Step 2: Verificar que zod está disponible**

Run: `cd apps/plataforma && node -e "require.resolve('zod')" && echo OK`
Expected: `OK`. (Si falla, usar validación manual como en `/api/banca/revisar` en vez de zod.)

- [ ] **Step 3: Verificar el build**

Run: `cd apps/plataforma && npm run build`
Expected: la ruta `/api/banca/duplicados` aparece en el output del build.

- [ ] **Step 4: Commit**

```bash
git add apps/plataforma/app/api/banca/duplicados/route.ts
git commit -m "feat(plataforma): API POST /api/banca/duplicados (resolver/deshacer)"
```

---

### Task 6: UI — `DuplicadosBandeja` en `BancaClient.tsx`

**Files:**
- Modify: `apps/plataforma/app/(usuario)/banca/BancaClient.tsx`

- [ ] **Step 1: Añadir el componente**

Añadir a `apps/plataforma/app/(usuario)/banca/BancaClient.tsx` (reutiliza `eur`, `input`, estilos ya definidos en el archivo):

```tsx
type DupMov = { id: string; fecha: string | null; concepto: string; importe: number; conciliado: boolean }
type DupGrupoUI = { clave: string; confianza: 'alta' | 'baja'; importe: number; superaUmbral: boolean; movimientos: DupMov[] }
type DupResueltoUI = { id: string; fecha: string | null; concepto: string; importe: number; estado: 'ignorado' | 'confirmado' }

// Bandeja "Posibles cargos duplicados": pares sospechosos de cobro doble. El dueño los
// resuelve con un clic ("Es normal" / "Es un cobro doble"); la decisión persiste. Plegable de
// "ya resueltos" para reactivar lo que se ignoró por error.
export function DuplicadosBandeja({ grupos, resueltos }: { grupos: DupGrupoUI[]; resueltos: DupResueltoUI[] }) {
  const router = useRouter()
  const [pend, setPend] = useState(grupos)
  const [res, setRes] = useState(resueltos)
  const [busy, setBusy] = useState<string | null>(null)
  const [verResueltos, setVerResueltos] = useState(false)

  async function resolver(g: DupGrupoUI, estado: 'ignorado' | 'confirmado') {
    setBusy(g.clave)
    const ids = g.movimientos.map(m => m.id)
    const r = await fetch('/api/banca/duplicados', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, estado }),
    })
    setBusy(null)
    if (r.ok) {
      setPend(p => p.filter(x => x.clave !== g.clave))
      setRes(prev => [...g.movimientos.map(m => ({ id: m.id, fecha: m.fecha, concepto: m.concepto, importe: m.importe, estado })), ...prev])
      router.refresh()
    }
  }

  async function reactivar(id: string) {
    setBusy(id)
    const r = await fetch('/api/banca/duplicados', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], estado: null }),
    })
    setBusy(null)
    if (r.ok) { setRes(prev => prev.filter(x => x.id !== id)); router.refresh() }
  }

  if (pend.length === 0 && res.length === 0) return null
  return (
    <section id="duplicados" style={{ marginBottom: '32px' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>⚠️ Posibles cargos duplicados ({pend.length})</h2>
      <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '14px' }}>Mismo importe y comercio en pocos días. Revisa cada par y resuélvelo: no vuelve a salir.</p>

      {pend.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {pend.map(g => (
            <div key={g.clave} style={{ background: 'var(--surface)', border: '1px solid #f59e0b66', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: g.confianza === 'alta' ? '#fee2e2' : '#fef3c7', color: g.confianza === 'alta' ? '#b91c1c' : '#92400e' }}>
                  {g.confianza === 'alta' ? 'Sospecha alta' : 'Sospecha baja'}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#dc2626' }}>{eur(g.importe)}</span>
              </div>
              {g.movimientos.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', padding: '3px 0' }}>
                  <span style={{ color: 'var(--muted)', width: '84px', flexShrink: 0 }}>{m.fecha || '—'}</span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.concepto}{m.conciliado ? ' 🔗' : ''}</span>
                  <span style={{ fontWeight: 700, color: '#dc2626', width: '92px', textAlign: 'right', flexShrink: 0 }}>{eur(m.importe)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button disabled={busy === g.clave} onClick={() => resolver(g, 'ignorado')} style={dupGhost}>Es normal</button>
                <button disabled={busy === g.clave} onClick={() => resolver(g, 'confirmado')} style={dupDanger}>Es un cobro doble</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {res.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <button onClick={() => setVerResueltos(v => !v)} style={{ ...dupGhost, fontSize: '12px' }}>
            {verResueltos ? '▾' : '▸'} Ya resueltos ({res.length})
          </button>
          {verResueltos && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginTop: '8px' }}>
              {res.map((m, i) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', fontSize: '13px' }}>
                  <span style={{ color: 'var(--muted)', width: '84px', flexShrink: 0 }}>{m.fecha || '—'}</span>
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.concepto}</span>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0 }}>{m.estado === 'confirmado' ? 'cobro doble' : 'normal'}</span>
                  <span style={{ fontWeight: 700, color: '#dc2626', width: '80px', textAlign: 'right', flexShrink: 0 }}>{eur(m.importe)}</span>
                  <button disabled={busy === m.id} onClick={() => reactivar(m.id)} style={{ ...dupGhost, fontSize: '12px', flexShrink: 0 }}>Reactivar</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

const dupGhost: React.CSSProperties = { background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }
const dupDanger: React.CSSProperties = { background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }
```

- [ ] **Step 2: Verificar el build**

Run: `cd apps/plataforma && npm run build`
Expected: compila sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/app/(usuario)/banca/BancaClient.tsx
git commit -m "feat(plataforma): UI bandeja de cargos duplicados (resolver/deshacer)"
```

---

### Task 7: Wiring de la página `/banca`

**Files:**
- Modify: `apps/plataforma/app/(usuario)/banca/page.tsx`

- [ ] **Step 1: Importar y cargar los datos**

En `apps/plataforma/app/(usuario)/banca/page.tsx`:

1. Añadir a los imports de `@/lib/banca` (línea 4): `getDuplicadosSospechosos, getDuplicadosResueltos`.
2. Añadir al import de `./BancaClient` (línea 8): `DuplicadosBandeja`.
3. Añadir dos llamadas al `Promise.all` (línea 20) y sus destructuras:

```ts
  const [sociedades, saldo, movimientos, tesoreria, porRevisar, porDestino, evolucionNegocio, fiscal, duplicados, dupResueltos] = await Promise.all([
    prisma.sociedad.findMany({ where: { cuentaId: session.id }, orderBy: { createdAt: 'asc' }, select: { id: true, nombre: true } }),
    getSaldoConsolidado(session.id),
    listarMovimientos(session.id, undefined, 300),
    getTesoreria(session.id),
    listarPorRevisar(session.id),
    getResumenPorDestino(session.id),
    getEvolucionPorDestino(session.id, 6),
    getEstimacionFiscal(session.id, anio),
    getDuplicadosSospechosos(session.id),
    getDuplicadosResueltos(session.id),
  ])
```

- [ ] **Step 2: Renderizar la bandeja**

Insertar justo ANTES del bloque `{/* Por revisar (IA dudó) ... */}` (línea 134):

```tsx
        {/* Posibles cargos duplicados — el dueño los resuelve */}
        <DuplicadosBandeja grupos={duplicados} resueltos={dupResueltos} />
```

- [ ] **Step 3: Verificar el build**

Run: `cd apps/plataforma && npm run build`
Expected: compila; la página `/banca` se genera sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/plataforma/app/(usuario)/banca/page.tsx
git commit -m "feat(plataforma): /banca renderiza la bandeja de duplicados"
```

---

### Task 8: Banner del dashboard enlazado

**Files:**
- Modify: `apps/plataforma/app/(usuario)/dashboard/page.tsx:315-324`

- [ ] **Step 1: Convertir el contador de duplicados en enlace**

Reemplazar el bloque `{alertas.duplicados > 0 && (...)}` (líneas 315-324) por:

```tsx
      {alertas.duplicados > 0 && (
        <Link href="/banca#duplicados" style={{ fontSize: '13px', color: 'var(--text)', textDecoration: 'none' }}>
          ⚠️ <strong>{alertas.duplicados}</strong> {alertas.duplicados === 1 ? 'posible cargo duplicado' : 'posibles cargos duplicados'}
          {alertas.duplicadosDetalle.length > 0 && (
            <span style={{ color: 'var(--muted)' }}>
              {' '}— {alertas.duplicadosDetalle.map(d => `${d.concepto} (${fmtEur(d.importe)})`).join(', ')}
            </span>
          )}
          {' '}→
        </Link>
      )}
```

(`Link` ya está importado en el archivo — lo usa la alerta de "por revisar".)

- [ ] **Step 2: Verificar el build**

Run: `cd apps/plataforma && npm run build`
Expected: compila sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/app/(usuario)/dashboard/page.tsx
git commit -m "feat(plataforma): banner de duplicados enlaza a /banca#duplicados"
```

---

### Task 9: Verificación end-to-end (Supabase MCP)

**Files:** ninguno (verificación)

- [ ] **Step 1: Probar el ciclo completo con datos reales**

Con `mcp__Supabase__execute_sql` (project `wswbehlcuxqxyinousql`), en una cuenta de prueba:

1. **Aparece:** insertar/identificar un par sospechoso (mismo importe + contraparte, ±2 días, gasto). Ejecutar la query de `getDuplicadosSospechosos` → el par aparece.
2. **Resolver persiste:** `UPDATE movimientos_bancarios SET duplicado_estado='ignorado' WHERE id IN (<par>)` → reejecutar la query → el par desaparece.
3. **Umbral:** un par de −3 € en comercio físico (concepto sin RECIBO/TRANSFERENCIA) → `superaUmbral=false` (no contaría en el banner). Un par RECIBO el mismo día → `confianza='alta'`, `superaUmbral=true`.
4. **Conciliados distintos:** marcar un par con `conciliado=true` y `factura_ref` distintos → no aparece.
5. **Deshacer:** `UPDATE ... SET duplicado_estado=NULL` → vuelve a aparecer.

Expected: cada paso se comporta como se describe.

- [ ] **Step 2: Limpiar los datos de prueba**

Revertir cualquier `duplicado_estado` que se haya tocado para la prueba (volver a `NULL` salvo decisiones reales).

- [ ] **Step 3: Build final + tests**

Run: `cd apps/plataforma && npm run build && npx tsx --test lib/banca.test.ts`
Expected: build OK, tests PASS.

---

# FASE 2 — Borrador de reclamación con IA

### Task 10: `redactarReclamacion` (degrada a plantilla)

**Files:**
- Create: `apps/plataforma/lib/reclamacion.ts`

- [ ] **Step 1: Implementar el generador**

```ts
// Mismo cliente que lib/categorizar.ts: aiComplete(prompt, opts) sobre NVIDIA NIM (gratis);
// si no hay NVIDIA_API_KEY o falla, degrada limpio (devuelve '').
import { aiComplete } from '@central/core-ai'

export type ReclamacionInput = { comercio: string; importe: number; fechas: string[] }

// Genera un texto para reclamar un cobro doble. Usa core-ai si está disponible; si no, una
// plantilla estática (degrada limpio, sin romper si falta la API key).
export async function redactarReclamacion(input: ReclamacionInput): Promise<{ asunto: string; cuerpo: string }> {
  const asunto = `Reclamación por cargo duplicado — ${input.comercio} (${Math.abs(input.importe).toFixed(2)} €)`
  const plantilla = [
    `Estimados,`,
    ``,
    `He detectado un cargo duplicado de ${Math.abs(input.importe).toFixed(2)} € correspondiente a "${input.comercio}",`,
    `registrado en las fechas ${input.fechas.join(' y ')}. Solo una de las operaciones es legítima.`,
    `Solicito la anulación del cargo duplicado y el reintegro del importe.`,
    ``,
    `Quedo a la espera de su confirmación. Un saludo.`,
  ].join('\n')

  try {
    const cuerpo = await aiComplete(
      `Comercio: ${input.comercio}. Importe duplicado: ${Math.abs(input.importe).toFixed(2)} €. Fechas: ${input.fechas.join(', ')}.`,
      {
        system: 'Redacta en español formal y breve una reclamación por un cargo bancario duplicado. Devuelve SOLO el cuerpo del email, sin asunto ni encabezados.',
        model: 'meta/llama-3.1-8b-instruct', maxTokens: 500, temperature: 0.2, timeoutMs: 30_000,
      },
    )
    return { asunto, cuerpo: (cuerpo || '').trim() || plantilla }
  } catch {
    return { asunto, cuerpo: plantilla }
  }
}
```

> `aiComplete(prompt, { system, model, maxTokens, temperature, timeoutMs })` es la firma real usada en `lib/categorizar.ts:61`. Devuelve `string` (vacío si la IA no está disponible) — de ahí el fallback a `plantilla`.

- [ ] **Step 2: Verificar el build**

Run: `cd apps/plataforma && npm run build`
Expected: compila (con el export correcto de core-ai).

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/lib/reclamacion.ts
git commit -m "feat(plataforma): redactarReclamacion (IA con fallback a plantilla)"
```

---

### Task 11: API + botón de reclamación

**Files:**
- Create: `apps/plataforma/app/api/banca/duplicados/reclamacion/route.ts`
- Modify: `apps/plataforma/app/(usuario)/banca/BancaClient.tsx`

- [ ] **Step 1: Endpoint**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/session'
import { redactarReclamacion } from '@/lib/reclamacion'

export const dynamic = 'force-dynamic'

const Body = z.object({ comercio: z.string().min(1), importe: z.number(), fechas: z.array(z.string()).min(1) })

// POST /api/banca/duplicados/reclamacion — devuelve {asunto, cuerpo} para reclamar un cobro
// doble confirmado. Scoped por sesión (no toca BD; solo redacta).
export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const out = await redactarReclamacion(parsed.data)
  return NextResponse.json({ ok: true, ...out })
}
```

- [ ] **Step 2: Botón en `DuplicadosBandeja`**

Tras el botón "Es un cobro doble" (Task 6), envolver `resolver(g,'confirmado')` para, además, ofrecer la reclamación. Añadir estado y un modal simple dentro de `DuplicadosBandeja`:

```tsx
  const [recl, setRecl] = useState<{ asunto: string; cuerpo: string } | null>(null)

  async function redactar(g: DupGrupoUI) {
    setBusy(g.clave)
    const r = await fetch('/api/banca/duplicados/reclamacion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comercio: g.movimientos[0]?.concepto || 'Comercio', importe: g.importe, fechas: g.movimientos.map(m => m.fecha).filter(Boolean) }),
    })
    setBusy(null)
    const d = await r.json().catch(() => null)
    if (r.ok && d) setRecl({ asunto: d.asunto, cuerpo: d.cuerpo })
  }
```

Añadir un botón `📝 Redactar reclamación` junto a los de resolver, y un modal (patrón `overlay`/`modal` ya en el archivo) que muestre `recl.asunto` + `recl.cuerpo` en un `<textarea readOnly>` con botón "Copiar" (`navigator.clipboard.writeText`).

- [ ] **Step 3: Build + commit**

Run: `cd apps/plataforma && npm run build`

```bash
git add apps/plataforma/app/api/banca/duplicados/reclamacion/route.ts apps/plataforma/app/(usuario)/banca/BancaClient.tsx
git commit -m "feat(plataforma): borrador de reclamación IA para cobros dobles confirmados"
```

---

# FASE 3 — Auto-detección de recurrentes

### Task 12: Degradar confianza de contrapartes recurrentes (TDD)

**Files:**
- Modify: `apps/plataforma/lib/banca.ts`
- Test: `apps/plataforma/lib/banca.test.ts`

- [ ] **Step 1: Test que falla**

Añadir a `apps/plataforma/lib/banca.test.ts`:

```ts
import { esRecurrente } from './banca'

test('esRecurrente: muchas apariciones/mes = recurrente', () => {
  // 12 cargos de la misma contraparte en 60 días → recurrente
  assert.equal(esRecurrente(12, 60), true)
})
test('esRecurrente: pocas apariciones = no recurrente', () => {
  assert.equal(esRecurrente(2, 60), false)
})
```

- [ ] **Step 2: Ejecutar y ver fallo**

Run: `cd apps/plataforma && npx tsx --test lib/banca.test.ts`
Expected: FAIL — `esRecurrente` no exportada.

- [ ] **Step 3: Implementar**

Añadir a `apps/plataforma/lib/banca.ts`:

```ts
// Heurística: una contraparte es "recurrente conocida" si aparece de forma sostenida (umbral
// de ~2 cargos/mes). Sus pares duplicados nacen con confianza baja → no molestan en el banner.
export function esRecurrente(ocurrencias: number, dias: number): boolean {
  const meses = Math.max(dias / 30, 1)
  return ocurrencias / meses >= 2
}
```

- [ ] **Step 4: Integrar en `getDuplicadosSospechosos`**

En la query de `getDuplicadosSospechosos`, añadir un conteo de apariciones por contraparte en 60 días (subconsulta o `COUNT(*) OVER (PARTITION BY contraparte)`), pasarlo a `DupRow` como `ocurrencias_contraparte`, y al construir el grupo: si `esRecurrente(ocurrencias, 60)` → forzar `confianza = 'baja'` (de modo que solo cuente en el banner si supera el umbral de importe). Mantener el resto igual.

- [ ] **Step 5: Ejecutar tests**

Run: `cd apps/plataforma && npx tsx --test lib/banca.test.ts`
Expected: PASS.

- [ ] **Step 6: Verificar con MCP + build**

Run: `cd apps/plataforma && npm run build`
Verificar con `execute_sql` que una contraparte con ≥12 cargos en 60 días sale como `confianza='baja'`.

- [ ] **Step 7: Commit**

```bash
git add apps/plataforma/lib/banca.ts apps/plataforma/lib/banca.test.ts
git commit -m "feat(plataforma): degradar confianza de contrapartes recurrentes (auto-recurrentes)"
```

---

## Self-Review (cobertura del spec)

- **Persistencia (columna):** Task 1. ✅
- **Detección agrupada + solo NULL:** Task 3. ✅
- **Idea 1 (confianza + umbral):** Task 2 (puras) + Task 3 (aplicación) + Task 4 (banner). ✅
- **Idea 2 (excluir ya conciliados a facturas distintas):** Task 3 (`NOT (... factura_ref <> ...)`). ✅
- **Idea 3 (deshacer / ver resueltos):** Task 3 (`getDuplicadosResueltos`) + Task 4 (`resolverDuplicados` con `null`) + Task 6 (UI plegable). ✅
- **API resolver:** Task 5. ✅
- **UI bandeja + banner enlazado:** Tasks 6, 7, 8. ✅
- **Verificación:** Task 9. ✅
- **Idea 4 (reclamación IA):** Tasks 10, 11. ✅
- **Idea 5 (auto-recurrentes):** Task 12. ✅

Consistencia de tipos: `DupGrupo`/`DupMovimiento`/`DupResuelto` definidos en Task 3 y consumidos con los mismos nombres de campo en Tasks 4-8. `resolverDuplicados(cuentaId, ids, estado)` con la misma firma en Tasks 4 y 5. `clasificarConfianza`/`superaUmbralBanner`/`esRecurrente` exportadas en Tasks 2/12 y usadas en Task 3/12.

**Riesgo conocido a validar en Task 10:** el nombre exacto del export de `@central/core-ai` (`generarTexto` es provisional) — verificar contra `packages/core-ai/src/index.ts` antes de implementar.
