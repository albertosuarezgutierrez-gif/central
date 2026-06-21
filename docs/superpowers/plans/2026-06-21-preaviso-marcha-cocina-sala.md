# Preaviso de marcha cocina ⇄ sala — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cocina avise al camarero con tiempo de un cambio de plato ("esto sale ya"), el camarero monte la mesa y confirme "mesa lista", y cocina lo vea antes de emplatar — todo **activable/desactivable por el dueño** (off por defecto).

**Architecture:** Tabla `preavisos` en schema `iarest` + API route `/api/preaviso` (POST crea desde `/kds`, PATCH confirma desde `/edge`), notificación al camarero asignado reusando la infra de push de `qr-call-waiter`, y Realtime por el canal `kds-{restaurante_id}` que ya existe. Un flag `restaurantes.preaviso_activo` gobierna TODO: si está off, ni el botón aparece ni la API acepta peticiones.

**Tech Stack:** Next.js App Router (TS), Supabase (Postgres 17, schema `iarest`, RLS multi-tenant), Web Push (`@central/core-push` / `push-send`), Supabase Realtime.

> ⚠️ **Repo:** el código vive en `github.com/albertosuarezgutierrez-gif/ia.rest`, NO en `central`. Las rutas de UI (`app/kds/**`, `app/edge/**`, `app/owner/**`) se dan según la convención documentada; confírmalas en el repo real antes de editar. Patrones obligatorios: ver `.claude/skills/ia-rest-maestro` (auth en API routes, `comanda_items`, estados exactos, EF, Realtime, `useModulo`).

---

## File Structure

**En el repo `ia.rest`:**

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/2026XXXX_preavisos.sql` (nuevo) | Tabla `preavisos` + RLS + índice; columna `restaurantes.preaviso_activo` |
| `lib/preaviso.ts` (nuevo) | Lógica pura: `resumenPlatos()` (snapshot legible de la comanda). Sin I/O → testeable |
| `app/api/preaviso/route.ts` (nuevo) | POST (crear, gated, dedup, push) + PATCH (confirmar mesa lista) |
| `lib/push.ts` o EF `qr-call-waiter` (existente) | Reusar el envío de push al camarero asignado. NO crear infra nueva |
| `components/kds/PreavisoBoton.tsx` (nuevo) | Botón "📣 Preaviso" + estado en la tarjeta del KDS. Solo si `preaviso_activo` |
| `app/kds/page.tsx` (modificar) | Montar `PreavisoBoton` por comanda; pasar flag de config |
| `components/edge/PreavisoBanner.tsx` (nuevo) | Banner entrante + botón "Mesa lista" en `/edge` |
| `app/edge/page.tsx` (modificar) | Suscripción Realtime a `iarest.preavisos` + render del banner |
| `app/owner/**` config (modificar) | Toggle "Preaviso de marcha" que escribe `restaurantes.preaviso_activo` |
| `lib/help-prompts.ts` (modificar) | Microcopy de ayuda para el preaviso (regla del proyecto) |

**Default del flag:** `preaviso_activo = false`. El dueño lo enciende. "100% configurable".

---

## Task 1: Migración de BD — tabla `preavisos` + flag de config

**Files:**
- Create: `supabase/migrations/2026XXXX_preavisos.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Preaviso de marcha cocina⇄sala. Schema iarest. Aditiva.

-- 1) Flag de activación por restaurante (off por defecto: el dueño opta-in)
ALTER TABLE iarest.restaurantes
  ADD COLUMN IF NOT EXISTS preaviso_activo BOOLEAN NOT NULL DEFAULT false;

-- 2) Tabla de preavisos
CREATE TABLE IF NOT EXISTS iarest.preavisos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id  UUID NOT NULL,
  comanda_id      UUID NOT NULL,
  mesa            TEXT,
  platos          JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{nombre, cantidad}]
  estado          TEXT NOT NULL DEFAULT 'enviado'
                    CHECK (estado IN ('enviado','mesa_lista','servido','cancelado')),
  emitido_por     TEXT,
  emitido_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  mesa_lista_at   TIMESTAMPTZ,
  mesa_lista_por  UUID,
  listo_at        TIMESTAMPTZ,                          -- dato para Fase 2 (antelación real)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preavisos_restaurante ON iarest.preavisos(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_preavisos_comanda ON iarest.preavisos(comanda_id);
-- Garantiza el dedup a nivel BD: 1 preaviso "enviado" por comanda
CREATE UNIQUE INDEX IF NOT EXISTS uq_preavisos_comanda_enviado
  ON iarest.preavisos(comanda_id) WHERE estado = 'enviado';

-- 3) RLS
ALTER TABLE iarest.preavisos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own" ON iarest.preavisos
  FOR SELECT USING (restaurante_id = current_setting('app.restaurante_id', true)::uuid);
CREATE POLICY "insert_own" ON iarest.preavisos
  FOR INSERT WITH CHECK (restaurante_id = current_setting('app.restaurante_id', true)::uuid);
CREATE POLICY "update_own" ON iarest.preavisos
  FOR UPDATE USING (restaurante_id = current_setting('app.restaurante_id', true)::uuid);
CREATE POLICY "service_role_all" ON iarest.preavisos
  USING (auth.role() = 'service_role');

-- 4) Realtime: publicar la tabla (mismo canal kds-{restaurante_id})
ALTER PUBLICATION supabase_realtime ADD TABLE iarest.preavisos;
```

- [ ] **Step 2: Aplicar la migración**

Vía MCP Supabase (`apply_migration`) sobre el proyecto compartido `wswbehlcuxqxyinousql`, o `supabase db push`. Antes confirma con `list_tables` que `iarest.preavisos` no existe.
Expected: tabla creada, columna añadida, sin error.

- [ ] **Step 3: Verificar**

Run (MCP `execute_sql`):
```sql
select column_name from information_schema.columns
where table_schema='iarest' and table_name='preavisos' order by 1;
```
Expected: aparecen las 12 columnas. Y `restaurantes.preaviso_activo` existe.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026XXXX_preavisos.sql
git commit -m "feat(preaviso): migracion tabla preavisos + flag preaviso_activo"
```

---

## Task 2: Helper puro `resumenPlatos` (TDD)

Convierte los items de una comanda en el snapshot legible del aviso. Pura → se testea sin BD.

**Files:**
- Create: `lib/preaviso.ts`
- Test: `lib/preaviso.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { describe, it, expect } from 'vitest'
import { resumenPlatos, textoPreaviso } from './preaviso'

describe('resumenPlatos', () => {
  it('agrupa por nombre y suma cantidades', () => {
    const items = [
      { nombre: 'Entrecot', cantidad: 1 },
      { nombre: 'Entrecot', cantidad: 1 },
      { nombre: 'Lubina', cantidad: 1 },
    ]
    expect(resumenPlatos(items)).toEqual([
      { nombre: 'Entrecot', cantidad: 2 },
      { nombre: 'Lubina', cantidad: 1 },
    ])
  })

  it('ignora items sin nombre', () => {
    const items = [{ nombre: '', cantidad: 3 }, { nombre: 'Pan', cantidad: 1 }]
    expect(resumenPlatos(items)).toEqual([{ nombre: 'Pan', cantidad: 1 }])
  })
})

describe('textoPreaviso', () => {
  it('compone el texto del aviso para una mesa', () => {
    const platos = [{ nombre: 'Entrecot', cantidad: 2 }, { nombre: 'Lubina', cantidad: 1 }]
    expect(textoPreaviso('7', platos)).toBe('Mesa 7: salen 2 Entrecot, 1 Lubina')
  })

  it('cae a un texto genérico si no hay platos', () => {
    expect(textoPreaviso('7', [])).toBe('Mesa 7: va a salir comida, prepárate')
  })
})
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run lib/preaviso.test.ts`
Expected: FAIL — `resumenPlatos is not a function`.
> Si el repo no tiene vitest configurado, añádelo en este paso (`npm i -D vitest`, script `"test": "vitest"`). Es el primer test puro del módulo y justifica el harness.

- [ ] **Step 3: Implementar el mínimo**

```typescript
// lib/preaviso.ts — lógica pura del preaviso de marcha (sin I/O)

export type PlatoLinea = { nombre: string; cantidad: number }

/** Agrupa items por nombre y suma cantidades, conservando el orden de aparición. */
export function resumenPlatos(items: PlatoLinea[]): PlatoLinea[] {
  const orden: string[] = []
  const acc = new Map<string, number>()
  for (const it of items) {
    const nombre = (it.nombre ?? '').trim()
    if (!nombre) continue
    if (!acc.has(nombre)) orden.push(nombre)
    acc.set(nombre, (acc.get(nombre) ?? 0) + (it.cantidad ?? 0))
  }
  return orden.map(nombre => ({ nombre, cantidad: acc.get(nombre)! }))
}

/** Texto humano del aviso. Si no hay platos, mensaje genérico. */
export function textoPreaviso(mesa: string, platos: PlatoLinea[]): string {
  if (platos.length === 0) return `Mesa ${mesa}: va a salir comida, prepárate`
  const lista = platos.map(p => `${p.cantidad} ${p.nombre}`).join(', ')
  return `Mesa ${mesa}: salen ${lista}`
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npx vitest run lib/preaviso.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/preaviso.ts lib/preaviso.test.ts package.json
git commit -m "feat(preaviso): helper puro resumenPlatos/textoPreaviso + tests"
```

---

## Task 3: API route POST `/api/preaviso` — crear desde cocina

Crea el preaviso (gated por `preaviso_activo`), hace snapshot de la comanda, dedup, y dispara push al camarero asignado.

**Files:**
- Create: `app/api/preaviso/route.ts`

- [ ] **Step 1: Implementar el POST**

```typescript
// app/api/preaviso/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession, getRestauranteId } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { resumenPlatos, textoPreaviso } from '@/lib/preaviso'
import { enviarPushCamarero } from '@/lib/push' // ver Task 4

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { comanda_id } = await req.json()
  if (!comanda_id) return NextResponse.json({ error: 'comanda_id requerido' }, { status: 400 })

  // 1) Gate de configuración: si el dueño no lo activó, 403
  const { data: rest } = await supabase
    .from('restaurantes')
    .select('preaviso_activo')
    .eq('id', restauranteId)
    .single()
  if (!rest?.preaviso_activo) {
    return NextResponse.json({ error: 'Preaviso desactivado' }, { status: 403 })
  }

  // 2) Cargar comanda + items + camarero asignado
  const { data: comanda } = await supabase
    .from('comandas')
    .select('id, mesa, camarero_id, restaurante_id, estado')
    .eq('id', comanda_id)
    .eq('restaurante_id', restauranteId)
    .maybeSingle()
  if (!comanda) return NextResponse.json({ error: 'Comanda no encontrada' }, { status: 404 })

  const { data: items } = await supabase
    .from('comanda_items')
    .select('nombre, cantidad')
    .eq('comanda_id', comanda_id)
    .eq('restaurante_id', restauranteId)

  const platos = resumenPlatos(items ?? [])
  const mesa = String(comanda.mesa ?? '')

  // 3) Insertar (el índice único uq_preavisos_comanda_enviado garantiza el dedup)
  const { data: preaviso, error } = await supabase
    .from('preavisos')
    .insert({
      restaurante_id: restauranteId,
      comanda_id,
      mesa,
      platos,
      emitido_por: session.rol ?? 'cocina',
      estado: 'enviado',
    })
    .select()
    .single()

  if (error) {
    // 23505 = unique_violation → ya hay un preaviso activo para esta comanda
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ ok: true, dedup: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 4) Push al camarero asignado (no romper el flujo si falla el push)
  if (comanda.camarero_id) {
    try {
      await enviarPushCamarero(restauranteId, comanda.camarero_id, {
        titulo: 'Preaviso de marcha',
        cuerpo: textoPreaviso(mesa, platos),
        url: '/edge',
      })
    } catch { /* el banner Realtime en /edge cubre el caso de push caído */ }
  }

  return NextResponse.json({ ok: true, preaviso })
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores (asume `enviarPushCamarero` ya existe tras Task 4 — si haces Task 4 antes, perfecto; si no, créalo como stub temporal con la firma de abajo).

- [ ] **Step 3: Commit**

```bash
git add app/api/preaviso/route.ts
git commit -m "feat(preaviso): POST /api/preaviso (gated + dedup + push)"
```

---

## Task 4: Envío de push al camarero (reusar infra existente)

No crear infra nueva: envolver el `push-send` que ya usa `qr-call-waiter`.

**Files:**
- Modify: `lib/push.ts` (o crear el wrapper si no existe un helper server-side reutilizable)

- [ ] **Step 1: Localizar la infra existente**

Run: `grep -rn "push-send\|web-push\|sendNotification\|qr-call-waiter" lib app supabase/functions`
Expected: encuentras cómo `qr-call-waiter` resuelve la suscripción del camarero y envía. Reusa ESO.

- [ ] **Step 2: Implementar el wrapper**

```typescript
// lib/push.ts (añadir)
import { createServerClient } from '@/lib/supabase'
// importar el sender real ya usado por qr-call-waiter (p. ej. webpush de @central/core-push)

export type PushPayload = { titulo: string; cuerpo: string; url?: string }

/** Envía una push a un camarero concreto resolviendo su(s) suscripción(es). */
export async function enviarPushCamarero(
  restauranteId: string,
  camareroId: string,
  payload: PushPayload,
): Promise<void> {
  const supabase = createServerClient()
  const { data: subs } = await supabase
    .from('push_subscriptions')        // CONFIRMAR nombre real de la tabla en el repo
    .select('subscription')
    .eq('restaurante_id', restauranteId)
    .eq('camarero_id', camareroId)
  if (!subs?.length) return            // sin push → el banner Realtime cubre
  await Promise.allSettled(
    subs.map(s => /* sender real */ enviarWebPush(s.subscription, {
      title: payload.titulo,
      body: payload.cuerpo,
      data: { url: payload.url ?? '/edge' },
    })),
  )
}
```

> Ajusta `push_subscriptions`/`subscription` y `enviarWebPush` a los nombres reales que use `qr-call-waiter`. La regla del proyecto: coordinación interna = **web push, nunca email/Telegram**.

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add lib/push.ts
git commit -m "feat(preaviso): enviarPushCamarero reutilizando push-send"
```

---

## Task 5: API route PATCH `/api/preaviso` — confirmar "mesa lista"

**Files:**
- Modify: `app/api/preaviso/route.ts`

- [ ] **Step 1: Añadir el PATCH**

```typescript
// app/api/preaviso/route.ts (añadir export)
export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { preaviso_id, accion } = await req.json()
  if (!preaviso_id) return NextResponse.json({ error: 'preaviso_id requerido' }, { status: 400 })

  const nuevoEstado = accion === 'cancelar' ? 'cancelado' : 'mesa_lista'
  const patch: Record<string, unknown> = { estado: nuevoEstado }
  if (nuevoEstado === 'mesa_lista') {
    patch.mesa_lista_at = new Date().toISOString()
    patch.mesa_lista_por = session.camarero_id ?? null
  }

  const { data, error } = await supabase
    .from('preavisos')
    .update(patch)
    .eq('id', preaviso_id)
    .eq('restaurante_id', restauranteId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // El UPDATE viaja por Realtime al canal kds-{restaurante_id} → cocina lo ve.
  return NextResponse.json({ ok: true, preaviso: data })
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add app/api/preaviso/route.ts
git commit -m "feat(preaviso): PATCH /api/preaviso (confirmar mesa lista / cancelar)"
```

---

## Task 6: UI cocina — botón "📣 Preaviso" en `/kds` (gated)

**Files:**
- Create: `components/kds/PreavisoBoton.tsx`
- Modify: `app/kds/page.tsx`

- [ ] **Step 1: Componente del botón**

```tsx
// components/kds/PreavisoBoton.tsx
'use client'
import { useState } from 'react'
import { C } from '@/lib/colors'

type Props = {
  comandaId: string
  /** estado del preaviso de esta comanda, si existe */
  estadoPreaviso?: 'enviado' | 'mesa_lista' | 'servido' | 'cancelado'
  sh: () => Record<string, string>   // headers de sesión firmada del KDS
}

export default function PreavisoBoton({ comandaId, estadoPreaviso, sh }: Props) {
  const [loading, setLoading] = useState(false)

  async function enviar() {
    setLoading(true)
    try {
      await fetch('/api/preaviso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ comanda_id: comandaId }),
      })
    } finally { setLoading(false) }
  }

  if (estadoPreaviso === 'mesa_lista')
    return <span style={{ color: C.green, fontWeight: 600 }}>Mesa lista ✅ emplatar</span>
  if (estadoPreaviso === 'enviado')
    return <span style={{ color: C.amber }}>Preaviso enviado ⏳</span>

  return (
    <button onClick={enviar} disabled={loading}
      style={{ background: C.amber, color: C.dark, border: 'none', borderRadius: 8,
               padding: '6px 10px', fontWeight: 600, cursor: 'pointer' }}>
      {loading ? '…' : '📣 Preaviso'}
    </button>
  )
}
```

- [ ] **Step 2: Montar en el KDS (gated por config)**

En `app/kds/page.tsx`: (a) cargar `restaurantes.preaviso_activo` y la lista de preavisos activos por comanda; (b) renderizar el botón solo si el flag está on. Patrón:

```tsx
// dentro del render de cada tarjeta de comanda, solo si preavisoActivo:
{preavisoActivo && (
  <PreavisoBoton
    comandaId={comanda.id}
    estadoPreaviso={preavisosPorComanda[comanda.id]?.estado}
    sh={sh}
  />
)}
```

Suscríbete por Realtime a `iarest.preavisos` (canal `kds-${restauranteId}`, `schema: 'iarest'`) para refrescar `preavisosPorComanda` cuando el camarero confirme.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: 0 errores.
Manual: con `preaviso_activo=false` el botón NO aparece; con `true`, sí.

- [ ] **Step 4: Commit**

```bash
git add components/kds/PreavisoBoton.tsx app/kds/page.tsx
git commit -m "feat(preaviso): boton de preaviso en KDS (gated por config)"
```

---

## Task 7: UI sala — banner + "Mesa lista" en `/edge` (Realtime)

**Files:**
- Create: `components/edge/PreavisoBanner.tsx`
- Modify: `app/edge/page.tsx`

- [ ] **Step 1: Componente del banner**

```tsx
// components/edge/PreavisoBanner.tsx
'use client'
import { useState } from 'react'
import { C } from '@/lib/colors'
import { textoPreaviso, type PlatoLinea } from '@/lib/preaviso'

type Preaviso = { id: string; mesa: string; platos: PlatoLinea[] }
type Props = { preaviso: Preaviso; sh: () => Record<string, string>; onHecho: (id: string) => void }

export default function PreavisoBanner({ preaviso, sh, onHecho }: Props) {
  const [loading, setLoading] = useState(false)

  async function confirmar() {
    setLoading(true)
    try {
      await fetch('/api/preaviso', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ preaviso_id: preaviso.id, accion: 'mesa_lista' }),
      })
      onHecho(preaviso.id)
    } finally { setLoading(false) }
  }

  return (
    <div style={{ background: C.bg3, borderLeft: `4px solid ${C.amber}`, borderRadius: 8,
                  padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: C.ink2 }}>📣 {textoPreaviso(preaviso.mesa, preaviso.platos)} — monta la mesa</span>
      <button onClick={confirmar} disabled={loading}
        style={{ background: C.green, color: C.paper, border: 'none', borderRadius: 8,
                 padding: '8px 12px', fontWeight: 600, cursor: 'pointer' }}>
        {loading ? '…' : 'Mesa lista'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Realtime + render en `/edge`**

En `app/edge/page.tsx`: suscríbete a INSERT en `iarest.preavisos` filtrando por `restaurante_id` Y por el `camarero_id` de la sesión (la comanda asignada). Mantén una cola de preavisos `enviado` y renderiza un `PreavisoBanner` por cada uno; `onHecho` lo quita de la cola.

```tsx
useEffect(() => {
  const ch = supabase.channel(`kds-${restauranteId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'iarest', table: 'preavisos',
        filter: `restaurante_id=eq.${restauranteId}` },
      (payload) => {
        const p = payload.new as any
        if (p.estado === 'enviado') setPreavisos(prev => [...prev, p])
      })
    .subscribe()
  return () => { supabase.removeChannel(ch) }
}, [restauranteId])
```

> Filtrar el camarero en cliente tras recibir (el `filter` de Realtime no compone bien dos columnas). El push de Task 4 ya va dirigido solo al camarero asignado; el banner es el respaldo si no hay push.

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: 0 errores.
Manual: pulsar Preaviso en `/kds` → aparece banner en `/edge` → "Mesa lista" → el KDS pasa a "Mesa lista ✅".

- [ ] **Step 4: Commit**

```bash
git add components/edge/PreavisoBanner.tsx app/edge/page.tsx
git commit -m "feat(preaviso): banner + mesa lista en /edge via Realtime"
```

---

## Task 8: Toggle del dueño — activar/desactivar el preaviso

**Files:**
- Modify: `app/owner/**` (sección Config del restaurante)
- Modify: `app/api/restaurante/route.ts` (o la ruta que ya guarda config del restaurante) — permitir actualizar `preaviso_activo`

- [ ] **Step 1: Permitir guardar el flag**

En la API route que actualiza el restaurante, admite `preaviso_activo: boolean` en el body y haz el `update` sobre `restaurantes` (con `getSession`/`getRestauranteId`, solo rol `owner`).

- [ ] **Step 2: Toggle en `/owner`**

Añade en la pantalla de Config un switch "Preaviso de marcha (avisar a sala antes de que salga el plato)" que lee/escribe `preaviso_activo`. Texto de ayuda: "Cuando está activo, cocina puede avisar a la mesa desde el KDS para que el camarero monte a tiempo."

```tsx
<label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
  <input type="checkbox" checked={preavisoActivo}
    onChange={e => guardarConfig({ preaviso_activo: e.target.checked })} />
  Preaviso de marcha cocina ⇄ sala
</label>
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: 0 errores.
Manual: owner activa → el botón aparece en `/kds`; desactiva → desaparece y `POST /api/preaviso` responde 403.

- [ ] **Step 4: Commit**

```bash
git add app/owner app/api/restaurante/route.ts
git commit -m "feat(preaviso): toggle owner para activar/desactivar el preaviso"
```

---

## Task 9: Ayuda en pantalla (regla del proyecto)

**Files:**
- Modify: `lib/help-prompts.ts`

- [ ] **Step 1: Añadir microcopy**

En `ROLE_PROMPTS`, añade contexto del preaviso para los roles `cocina` (cómo lanzarlo) y `camarero` (qué hacer al recibirlo). El `<HelpChat />` ya existe en los headers de `/kds` y `/edge`; solo falta el prompt.

- [ ] **Step 2: Verificar + commit**

Run: `npx tsc --noEmit`
```bash
git add lib/help-prompts.ts
git commit -m "feat(preaviso): ayuda en pantalla para cocina y sala"
```

---

## Task 10: Verificación end-to-end

- [ ] **Step 1: Type-check global**

Run: `npx tsc --noEmit`
Expected: 0 errores (gate pre-push obligatorio del proyecto).

- [ ] **Step 2: Tests puros**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 3: Flujo manual (demo)**

1. Owner (PIN 1369) → Config → activa "Preaviso de marcha".
2. `/kds` (PIN 3297): en una comanda con camarero asignado, pulsa "📣 Preaviso". Tarjeta → "Preaviso enviado ⏳".
3. `/edge` (PIN 7672): llega push + banner "Mesa 7: salen…". Pulsa "Mesa lista".
4. `/kds`: la tarjeta pasa a "Mesa lista ✅ emplatar".
5. Owner desactiva → el botón desaparece y `POST /api/preaviso` → 403.

- [ ] **Step 4: Push final**

```bash
git fetch origin && git merge origin/main --no-edit
git push origin <rama>
```

---

## Fuera de alcance (Fase 2, futuro)

- Disparador automático por tiempos aprendidos (usa `listo_at - emitido_at` que ya se registra).
- Menaje específico por producto (flag por producto que enriquece `textoPreaviso`).
- Escalado/alarma si nadie confirma en X min (apoyado en el supervisor de tiempos existente).
