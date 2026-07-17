# Agente conversacional de Empresas (Fase 2, pieza 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development o superpowers:executing-plans. Steps con checkbox (`- [ ]`).

**Goal:** Un chat en la sección `/empresas` para preguntar en lenguaje natural por las empresas en dificultad (por provincia, tipo de señal y score), respondiendo SOLO con datos reales de la BD (sin inventar empresas ni cifras).

**Architecture:** Endpoint que carga el dataset actual (`getEmpresasYRadar`), lo serializa a un contexto compacto y se lo pasa a la pasarela IA (`aiComplete`, cadena gratis del monorepo) con un SYSTEM que acota el agente a esa lista. La UI es un panel de chat en la página de Empresas. Las empresas/cifras salen de la BD; la IA solo filtra/ordena/narra.

**Tech Stack:** Next.js 15, `@/lib/ai-client` (`aiComplete` → `chatConDirector`), `@/lib/empresas`, `node --test`.

**Límite conocido:** con los datos de Fase 1 el agente responde por **provincia, tipo de señal (concurso/disolución/ampliación) y score/nombre**. NO puede filtrar por **sector/CNAE ni facturación** hasta el enriquecimiento (piezas 2 y 3). El SYSTEM lo dice explícitamente.

---

## Task 1: Lógica del agente (contexto puro + respuesta)

**Files:**
- Create: `apps/plataforma/lib/empresas-agente.ts`
- Create: `apps/plataforma/lib/empresas-agente.test.ts`

- [ ] **Step 1: Test del contexto (falla)**

```ts
// lib/empresas-agente.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirContexto } from './empresas-agente.ts'

test('construirContexto lista empresas y provincias reales, acotado', () => {
  const ctx = construirContexto({
    empresas: [
      { empresa: 'CALZADOS PASOLI SL', empresaNorm: 'CALZADOS PASOLI', provincia: 'ALICANTE', score: 70, motivo: 'concurso de acreedores' },
      { empresa: 'SWIPE LEVANTE SL', empresaNorm: 'SWIPE LEVANTE', provincia: 'ALICANTE', score: 45, motivo: 'disolución/extinción' },
    ],
    radar: [{ clave: 'ALICANTE', concursos: 1, disoluciones: 1, dificultad: 2, cuadrante: 'declive', constituciones: 0, crecimiento: -2 }],
    total: 2,
    provincias: ['ALICANTE'],
  }, 300)
  assert.match(ctx, /CALZADOS PASOLI SL/)
  assert.match(ctx, /ALICANTE/)
  assert.match(ctx, /70/)
})

test('construirContexto respeta el tope de empresas', () => {
  const empresas = Array.from({ length: 500 }, (_, i) => ({ empresa: `E${i} SL`, empresaNorm: `E${i}`, provincia: 'X', score: 10, motivo: 'x' }))
  const ctx = construirContexto({ empresas, radar: [], total: 500, provincias: ['X'] }, 100)
  assert.ok((ctx.match(/ SL/g) || []).length <= 100)
})
```

- [ ] **Step 2: Verificar fallo** — Run: `cd apps/plataforma && node --test lib/empresas-agente.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
// lib/empresas-agente.ts
import { aiComplete } from '@/lib/ai-client'
import { getEmpresasYRadar, getProvincias, type FiltroEmpresas } from '@/lib/empresas'
import type { DatosEmpresas } from '@/lib/empresas'

type Datos = DatosEmpresas & { provincias: string[] }

const SYSTEM = `Eres un analista que ayuda a encontrar empresas en dificultad financiera a partir de eventos del BORME.
REGLAS ESTRICTAS:
- Responde SOLO con empresas que aparezcan en la lista de CONTEXTO. NUNCA inventes empresas ni cifras.
- Puedes filtrar/ordenar por provincia, tipo de señal (concurso, disolución, ampliación de capital) y score (0-100).
- AÚN NO hay datos de sector/CNAE ni de facturación: si te preguntan por eso, di que llegará con el enriquecimiento y ofrece filtrar por lo que sí hay.
- Sé conciso. Al listar empresas, pon: nombre · provincia · señal · score. Si no hay coincidencias, dilo.`

/** Serializa el dataset a un contexto compacto y acotado para la IA. */
export function construirContexto(d: Datos, maxEmpresas: number): string {
  const radar = d.radar
    .slice(0, 30)
    .map((r) => `${r.clave}: ${r.concursos} concursos, ${r.disoluciones} disoluciones`)
    .join('\n')
  const empresas = d.empresas
    .slice(0, maxEmpresas)
    .map((e) => `- ${e.empresa} · ${e.provincia ?? '—'} · ${e.motivo} · ${e.score}/100`)
    .join('\n')
  return `# Radar por provincia\n${radar || '(sin datos)'}\n\n# Empresas (${d.total})\n${empresas || '(sin empresas)'}\n\n# Provincias con datos\n${d.provincias.join(', ')}`
}

/** Responde a una pregunta cargando el dataset (filtrado por provincia si se pasa) y consultando la IA. */
export async function responderEmpresas(pregunta: string, provincia?: string): Promise<{ text: string }> {
  const filtro: FiltroEmpresas = provincia ? { provincia } : {}
  const [datos, provincias] = await Promise.all([getEmpresasYRadar(filtro), getProvincias()])
  const contexto = construirContexto({ ...datos, provincias }, 200)
  const text = await aiComplete([
    { role: 'system', content: `${SYSTEM}\n\nCONTEXTO:\n${contexto}` },
    { role: 'user', content: pregunta },
  ])
  return { text: text?.trim() || 'No he podido generar respuesta.' }
}
```

- [ ] **Step 4: Verificar** — Run: `cd apps/plataforma && node --test lib/empresas-agente.test.ts` → PASS. Ajustar `DatosEmpresas`/import si el nombre del tipo difiere (ver `lib/empresas.ts`).

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/empresas-agente.ts apps/plataforma/lib/empresas-agente.test.ts
git commit -m "feat(empresas): lógica del agente conversacional (contexto puro + respuesta IA)"
```

---

## Task 2: Endpoint del agente

**Files:**
- Create: `apps/plataforma/app/api/empresas/agente/route.ts`

- [ ] **Step 1: Implementar** (reautentica con sesión)

```ts
// app/api/empresas/agente/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { responderEmpresas } from '@/lib/empresas-agente'
export const dynamic = 'force-dynamic'
export const maxDuration = 30
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { pregunta?: unknown; provincia?: unknown }
  const pregunta = typeof body.pregunta === 'string' ? body.pregunta.slice(0, 500) : ''
  if (!pregunta.trim()) return NextResponse.json({ error: 'Pregunta vacía' }, { status: 400 })
  const provincia = typeof body.provincia === 'string' && body.provincia ? body.provincia : undefined
  try {
    const r = await responderEmpresas(pregunta, provincia)
    return NextResponse.json(r)
  } catch (e) {
    console.error('[empresas agente]', e)
    return NextResponse.json({ text: 'La IA no está disponible ahora mismo. Inténtalo en un momento.' }, { status: 200 })
  }
}
```

- [ ] **Step 2: Verificar tipos** — Run: `cd apps/plataforma && npx tsc --noEmit` → sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/app/api/empresas/agente/route.ts
git commit -m "feat(empresas): endpoint /api/empresas/agente"
```

---

## Task 3: Chat en la página de Empresas

**Files:**
- Create: `apps/plataforma/app/(usuario)/empresas/AgenteEmpresas.tsx`
- Modify: `apps/plataforma/app/(usuario)/empresas/EmpresasClient.tsx` (renderizar el chat)

- [ ] **Step 1: Componente de chat**

```tsx
// app/(usuario)/empresas/AgenteEmpresas.tsx
'use client'
import { useState } from 'react'

interface Turno { rol: 'user' | 'bot'; texto: string }

export default function AgenteEmpresas({ provincia }: { provincia: string }) {
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [q, setQ] = useState('')
  const [cargando, setCargando] = useState(false)

  async function enviar() {
    const pregunta = q.trim()
    if (!pregunta || cargando) return
    setTurnos((t) => [...t, { rol: 'user', texto: pregunta }])
    setQ('')
    setCargando(true)
    try {
      const r = await fetch('/api/empresas/agente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta, provincia: provincia || undefined }),
      })
      const j = await r.json()
      setTurnos((t) => [...t, { rol: 'bot', texto: j.text || j.error || 'Sin respuesta.' }])
    } catch {
      setTurnos((t) => [...t, { rol: 'bot', texto: 'No se pudo conectar.' }])
    } finally {
      setCargando(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12, background: 'var(--surface)', marginTop: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>🤖 Pregúntale al agente</div>
      <div style={{ display: 'grid', gap: 8, maxHeight: 280, overflowY: 'auto', marginBottom: 8 }}>
        {turnos.length === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Ej.: «las de Alicante en concurso», «las 5 más graves», «¿cuántas disoluciones hay?». (Sector y facturación llegan con el enriquecimiento.)</div>
        )}
        {turnos.map((t, i) => (
          <div key={i} style={{ justifySelf: t.rol === 'user' ? 'end' : 'start', maxWidth: '85%', background: t.rol === 'user' ? 'var(--primary-light)' : 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 11px', fontSize: 14, whiteSpace: 'pre-wrap' }}>
            {t.texto}
          </div>
        ))}
        {cargando && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Pensando…</div>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') enviar() }}
          placeholder="Escribe tu pregunta…"
          style={{ flex: 1, minHeight: 44, padding: '0 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
        />
        <button onClick={enviar} disabled={cargando} style={{ minHeight: 44, padding: '0 16px', borderRadius: 'var(--radius)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: cargando ? 'default' : 'pointer' }}>Enviar</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Renderizarlo en EmpresasClient** — importar y colocar `<AgenteEmpresas provincia={prov} />` justo debajo del bloque de filtros (después del `aviso`), pasándole el estado `prov` existente.

```tsx
import AgenteEmpresas from './AgenteEmpresas'
// … tras el bloque {aviso && …}:
<AgenteEmpresas provincia={prov} />
```

- [ ] **Step 3: Verificar build** — Run: `cd apps/plataforma && npx tsc --noEmit && npx next build` → exit 0; la ruta `/api/empresas/agente` aparece en el build.

- [ ] **Step 4: Commit**

```bash
git add "apps/plataforma/app/(usuario)/empresas/"
git commit -m "feat(empresas): chat del agente en la página de Empresas"
```

---

## Task 4: Verificación end-to-end

- [ ] **Step 1: Tests + tipos + build** — Run: `cd apps/plataforma && node --test lib/empresas-agente.test.ts && npx tsc --noEmit` → PASS/0. `npx next build` → exit 0.
- [ ] **Step 2: Guardia de secretos** — Run (raíz): `node --test test/*.test.ts` → PASS (no hay secretos hardcodeados; la IA usa la pasarela existente).
- [ ] **Step 3: PR + merge** — abrir PR, fusionar a `main`. Tras desplegar: en `/empresas`, preguntar «las de Alicante en concurso» y comprobar que responde con empresas reales de la lista.

---

## Notas
- El agente NO ejecuta SQL del LLM: las empresas salen de `getEmpresasYRadar` y la IA solo razona sobre esa lista (evita cifras alucinadas — regla del repo).
- Cuando lleguen sector/CNAE y facturación (piezas 2-3), basta con enriquecer el contexto de `construirContexto` y ampliar el SYSTEM.
