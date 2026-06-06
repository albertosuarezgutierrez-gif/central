# Maître IA — Recomendador de carta — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el comensal, desde el QR de mesa, marque alérgenos + escriba qué le apetece y la IA le recomiende 2-3 platos seguros de la carta, que puede seleccionar y añadir al pedido.

**Architecture:** Motor puro (`lib/carta-recomendar.ts`) con el filtro de seguridad de alérgenos en código + prompt + `callAI`. Una API route Next.js `/api/qr/recomendar` (GET config para la UI, POST recomienda) valida el token QR sin sesión, igual que `/api/qr/carta-i18n`. UI en un componente nuevo `MaitreSheet.tsx` montado dentro de `QrClientApp`. Config 100% del dueño en `restaurantes.configuracion.maitre_ia`, gateado por el módulo `carta_ia`.

**Tech Stack:** Next.js (App Router), TypeScript, Supabase (`createServerClient`), `lib/ai-client.ts` (`callAI` NIM→Haiku, `cleanJSON`).

**Spec:** `docs/superpowers/specs/2026-06-06-maitre-ia-recomendador-carta-design.md`

---

## Nota sobre verificación (el proyecto NO usa framework de tests)

Este repo no tiene jest/vitest/playwright. La verificación oficial (CLAUDE.md) es:
`npx tsc --noEmit` (0 errores), `npm run lint`, y `next build`. El default TDD de la
skill se adapta a esto: cada tarea verifica con typecheck/lint y, donde aplica, una
comprobación manual (curl o UI). Las **instrucciones del proyecto mandan** sobre el TDD.

> Pre-requisito de datos (verificar antes de Task 4): los valores de
> `productos.alergenos` deben coincidir (en minúsculas) con las etiquetas de los chips
> del §Task 4. Si el restaurante guarda otras cadenas (p. ej. "Gluten" vs "gluten"), el
> filtro las normaliza a minúsculas, pero nombres distintos ("lacteos" vs "lácteos") NO
> casan. Confirmar con: `select distinct unnest(alergenos) from productos where restaurante_id = '<rid>';`

---

## File Structure

**Nuevos:**
- `src/lib/carta-recomendar.ts` — tipos, defaults de config, filtro de seguridad, motor `recomendarPlatos`.
- `src/app/api/qr/recomendar/route.ts` — GET (config UI) + POST (recomendar), valida token QR.
- `src/components/qr/MaitreSheet.tsx` — bottom sheet del comensal (chips, antojo, resultados).

**Modificados:**
- `src/components/owner/ModulosTab.tsx` — módulo `carta_ia` + panel de config `maitre_ia`.
- `src/app/api/owner/modulos/route.ts` — aceptar/mergear `maitre_ia` y `carta_ia`.
- `src/app/q/[token]/QrClientApp.tsx` — fetch config + botón + montaje del sheet + mapear ids→addToCart.

---

## Task 1: Motor de recomendación (`lib/carta-recomendar.ts`)

**Files:**
- Create: `src/lib/carta-recomendar.ts`

- [ ] **Step 1: Crear el fichero completo**

```typescript
// src/lib/carta-recomendar.ts
// Motor del "Maître IA": filtro de seguridad de alérgenos (en código) + prompt + callAI.
// Reutilizable por el QR (comensal) y, en el futuro, por /edge (camarero).

import { callAI, cleanJSON } from '@/lib/ai-client'

export interface MaitreConfig {
  nombre_asistente: string
  personalidad: 'clasico' | 'cercano' | 'gastro'
  num_sugerencias: number          // 2 o 3
  incluir_no_declarados: boolean   // incluir platos SIN alérgenos declarados cuando el comensal declara alergias
  permitir_antojo_texto: boolean
  mostrar_precios: boolean
}

export const MAITRE_DEFAULTS: MaitreConfig = {
  nombre_asistente: 'Maître IA',
  personalidad: 'cercano',
  num_sugerencias: 3,
  incluir_no_declarados: false,
  permitir_antojo_texto: true,
  mostrar_precios: true,
}

// Mezcla la config guardada (parcial) con los defaults seguros.
export function mergeMaitreConfig(raw: unknown): MaitreConfig {
  const c = (raw ?? {}) as Partial<MaitreConfig>
  const n = Number(c.num_sugerencias)
  return {
    nombre_asistente: typeof c.nombre_asistente === 'string' && c.nombre_asistente.trim() ? c.nombre_asistente.trim().slice(0, 40) : MAITRE_DEFAULTS.nombre_asistente,
    personalidad: c.personalidad === 'clasico' || c.personalidad === 'gastro' ? c.personalidad : 'cercano',
    num_sugerencias: n === 2 ? 2 : 3,
    incluir_no_declarados: c.incluir_no_declarados === true,
    permitir_antojo_texto: c.permitir_antojo_texto !== false,
    mostrar_precios: c.mostrar_precios !== false,
  }
}

export interface PlatoCarta {
  id: string
  nombre: string
  descripcion: string | null
  precio: number
  seccion: string | null
  categoria: string
  alergenos: string[] | null
}

export interface PlatoRecomendado {
  id: string
  nombre: string
  precio: number
  alergenos: string[]
  motivo: string
}

// Categorías que NO se recomiendan como "plato" (son bebidas).
const CATEGORIAS_EXCLUIDAS = new Set(['vino', 'bebida', 'bebidas', 'refresco', 'refrescos', 'cerveza', 'cervezas', 'cafe', 'café'])

const norm = (s: string) => s.toLowerCase().trim()

// FILTRO DE SEGURIDAD — se ejecuta SIEMPRE antes del LLM.
// Devuelve solo platos seguros para los alérgenos declarados.
export function filtrarSeguros(
  productos: PlatoCarta[],
  alergenosCliente: string[],
  incluirNoDeclarados: boolean
): PlatoCarta[] {
  const al = alergenosCliente.map(norm).filter(Boolean)
  return productos.filter(p => {
    if (CATEGORIAS_EXCLUIDAS.has(norm(p.categoria || ''))) return false
    if (al.length === 0) return true               // sin alergias declaradas → entra todo (no bebida)
    const declar = (p.alergenos ?? []).map(norm).filter(Boolean)
    if (declar.length === 0) return incluirNoDeclarados   // array vacío = "sin datos", no "sin alérgenos"
    return !declar.some(d => al.includes(d))
  })
}

const PERSONALIDAD_TONO: Record<MaitreConfig['personalidad'], string> = {
  clasico: 'Eres un maître clásico y formal de restaurante.',
  cercano: 'Eres un maître cercano y amable que aconseja como a un amigo.',
  gastro: 'Eres un maître gastronómico, descriptivo y evocador con la comida.',
}

const LANG_NAMES: Record<string, string> = {
  es: 'español', en: 'inglés', fr: 'francés', de: 'alemán', it: 'italiano',
  pt: 'portugués', ca: 'catalán', eu: 'euskera', gl: 'gallego', nl: 'neerlandés',
}

export interface RecomendarInput {
  productos: PlatoCarta[]
  alergenos: string[]
  antojo: string
  idioma: string
  comensales: number
  config: MaitreConfig
}

// Motor principal. Devuelve [] si no hay platos seguros o si el LLM falla.
export async function recomendarPlatos(input: RecomendarInput): Promise<PlatoRecomendado[]> {
  const { alergenos, antojo, idioma, comensales, config } = input
  const seguros = filtrarSeguros(input.productos, alergenos, config.incluir_no_declarados)
  if (seguros.length === 0) return []

  const idiomaNombre = LANG_NAMES[idioma] ?? 'español'
  const lista = seguros.slice(0, 80).map(p => {
    const precio = config.mostrar_precios ? ` | ${p.precio}€` : ''
    const desc = p.descripcion ? ` — ${p.descripcion}` : ''
    return `- id:${p.id} | ${p.nombre}${desc} | sección: ${p.seccion ?? '-'}${precio}`
  }).join('\n')

  const n = config.num_sugerencias
  const system = `${PERSONALIDAD_TONO[config.personalidad]}
El restaurante tiene estos platos DISPONIBLES Y SEGUROS para este comensal:
${lista}

Recomienda como MÁXIMO ${n} platos de esa lista que mejor encajen con lo que pide.
Usa SOLO los id que aparecen arriba. No inventes platos ni id.
Responde EXCLUSIVAMENTE con un array JSON válido, sin texto alrededor, con esta forma:
[{"id":"<id exacto>","motivo":"<una frase corta, máx 18 palabras, en ${idiomaNombre}>"}]`

  const userMsg = `Comensales: ${comensales}. Antojo/preferencia: ${antojo?.trim() || 'sin preferencia concreta, sorpréndeme'}.`

  let raw: string
  try {
    raw = await callAI(system, userMsg, 350)
  } catch {
    return []
  }

  let parsed: Array<{ id?: string; motivo?: string }>
  try {
    parsed = JSON.parse(cleanJSON(raw))
    if (!Array.isArray(parsed)) return []
  } catch {
    return []
  }

  // Defensa en profundidad: solo ids que estén en la lista segura.
  const byId = new Map(seguros.map(p => [p.id, p]))
  const out: PlatoRecomendado[] = []
  for (const r of parsed) {
    const p = r?.id ? byId.get(r.id) : undefined
    if (!p) continue
    if (out.some(o => o.id === p.id)) continue
    out.push({
      id: p.id,
      nombre: p.nombre,
      precio: p.precio,
      alergenos: p.alergenos ?? [],
      motivo: typeof r.motivo === 'string' ? r.motivo.trim().slice(0, 160) : '',
    })
    if (out.length >= n) break
  }
  return out
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/carta-recomendar.ts
git commit -m "feat(maitre): motor de recomendación de carta con filtro de alérgenos"
```

---

## Task 2: API route del comensal (`/api/qr/recomendar`)

**Files:**
- Create: `src/app/api/qr/recomendar/route.ts`

- [ ] **Step 1: Crear el fichero completo**

```typescript
export const dynamic = 'force-dynamic'

// src/app/api/qr/recomendar/route.ts
// GET  ?token=xxx        → { activo, config }  (para gating/UI del QR)
// POST { token, alergenos[], antojo, idioma, comensales } → { activo, platos[] }
// Auth: valida token contra qr_sesiones_cliente (sin sesión de camarero), igual que carta-i18n.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import {
  recomendarPlatos, mergeMaitreConfig, MAITRE_DEFAULTS,
  type PlatoCarta, type MaitreConfig,
} from '@/lib/carta-recomendar'

export const runtime = 'nodejs'
export const maxDuration = 30

async function resolverSesion(token: string | null) {
  if (!token) return { error: NextResponse.json({ error: 'token requerido' }, { status: 400 }) }
  const supabase = createServerClient()
  const { data: sesion } = await supabase
    .from('qr_sesiones_cliente')
    .select('restaurante_id, estado')
    .eq('token', token)
    .single()
  if (!sesion) return { error: NextResponse.json({ error: 'Token QR inválido' }, { status: 404 }) }
  if (sesion.estado === 'expirada') return { error: NextResponse.json({ error: 'Sesión QR expirada' }, { status: 410 }) }
  return { supabase, restauranteId: sesion.restaurante_id as string }
}

async function leerEstado(supabase: ReturnType<typeof createServerClient>, rid: string) {
  const { data } = await supabase
    .from('restaurantes')
    .select('modulos_activos, configuracion')
    .eq('id', rid)
    .single()
  const activos: string[] = data?.modulos_activos ?? []
  const config: MaitreConfig = mergeMaitreConfig(data?.configuracion?.maitre_ia)
  return { activo: activos.includes('carta_ia'), config }
}

// Solo los campos que la UI necesita conocer por adelantado.
function configUI(c: MaitreConfig) {
  return {
    nombre_asistente: c.nombre_asistente,
    permitir_antojo_texto: c.permitir_antojo_texto,
    mostrar_precios: c.mostrar_precios,
  }
}

export async function GET(req: NextRequest) {
  try {
    const r = await resolverSesion(req.nextUrl.searchParams.get('token'))
    if ('error' in r) return r.error
    const { activo, config } = await leerEstado(r.supabase, r.restauranteId)
    return NextResponse.json({ activo, config: activo ? configUI(config) : configUI(MAITRE_DEFAULTS) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const r = await resolverSesion(body.token ?? null)
    if ('error' in r) return r.error

    const { activo, config } = await leerEstado(r.supabase, r.restauranteId)
    if (!activo) return NextResponse.json({ activo: false, platos: [] })

    const { data: productos } = await r.supabase
      .from('productos')
      .select('id, nombre, descripcion, precio, seccion, categoria, alergenos')
      .eq('restaurante_id', r.restauranteId)
      .eq('activo', true)

    const platos = await recomendarPlatos({
      productos: (productos ?? []) as PlatoCarta[],
      alergenos: Array.isArray(body.alergenos) ? body.alergenos.map(String) : [],
      antojo: typeof body.antojo === 'string' ? body.antojo : '',
      idioma: typeof body.idioma === 'string' ? body.idioma : 'es',
      comensales: Number(body.comensales) > 0 ? Number(body.comensales) : 1,
      config,
    })

    return NextResponse.json({ activo: true, platos })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Comprobación manual (opcional, requiere dev server + token QR real)**

Run: `curl -s "http://localhost:3000/api/qr/recomendar?token=<TOKEN>"`
Expected: JSON `{"activo":false,...}` si el módulo no está activo, o `{"activo":true,...}` si lo está. (Sin token → 400; token inválido → 404.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/qr/recomendar/route.ts
git commit -m "feat(maitre): API /api/qr/recomendar (config GET + recomendar POST)"
```

---

## Task 3: Config del dueño (módulo `carta_ia` + `maitre_ia`)

**Files:**
- Modify: `src/app/api/owner/modulos/route.ts`
- Modify: `src/components/owner/ModulosTab.tsx`

- [ ] **Step 1: Aceptar `carta_ia` y `maitre_ia` en el API de módulos**

En `src/app/api/owner/modulos/route.ts`:

Añadir `'carta_ia'` al array `TODOS_MODULOS` (tras `'carta_vinos'`):

```typescript
const TODOS_MODULOS = [
  'voz','mesas','comandas','cobro','impresion','turnos',
  'kds','supervisor','forecaster','fichajes','verifactu',
  'almacen','carta_vinos','carta_ia','qr','storefront','reservas',
  'rrhh','escaner','contabilidad','analytics',
]
```

En el handler `PUT`, ampliar el destructuring y el merge de config. Reemplazar:

```typescript
  const { modulos_activos, modo_vinos } = body
```

por:

```typescript
  const { modulos_activos, modo_vinos, maitre_ia } = body
```

Y justo después del bloque que setea `configNueva.modo_vinos`, añadir el merge de `maitre_ia`:

```typescript
  // Actualizar config del Maître IA si se envía (merge sobre lo existente)
  if (maitre_ia && typeof maitre_ia === 'object') {
    configNueva.maitre_ia = { ...(configActual.maitre_ia ?? {}), ...maitre_ia }
  }
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Añadir el módulo `carta_ia` a la lista de `ModulosTab`**

En `src/components/owner/ModulosTab.tsx`, dentro de `const MODULOS = [...]`, en el grupo OPCIONALES (tras la entrada `carta_vinos`), añadir:

```typescript
  { id: 'carta_ia',       label: 'Maître IA',        grupo: 'opcional', desc: 'El comensal marca alérgenos y qué le apetece, y la IA le recomienda platos seguros de la carta desde el QR.' },
```

- [ ] **Step 4: Importar el tipo/defaults y añadir estado de config**

Al principio de `ModulosTab.tsx`, junto a los imports existentes:

```typescript
import { MAITRE_DEFAULTS, type MaitreConfig } from '@/lib/carta-recomendar'
```

Dentro del componente, junto a `const [modoVinos, setModoVinos] = ...`:

```typescript
  const [maitre, setMaitre] = useState<MaitreConfig>(MAITRE_DEFAULTS)
```

En `cargar()`, tras `setModoVinos(...)`:

```typescript
      setMaitre({ ...MAITRE_DEFAULTS, ...(d.configuracion?.maitre_ia ?? {}) })
```

En `guardar()`, cambiar el body del fetch para incluir `maitre_ia`:

```typescript
        body: JSON.stringify({ modulos_activos: activos, modo_vinos: modoVinos, maitre_ia: maitre }),
```

- [ ] **Step 5: Panel de config bajo el módulo `carta_ia`**

En el JSX, justo después del bloque `{m.id === 'carta_vinos' && esActivo && ( ... )}` (cierra en la línea del `)}` tras su `</div>`), añadir el panel gemelo para `carta_ia`:

```tsx
                      {/* Config Maître IA — solo cuando carta_ia está activo */}
                      {m.id === 'carta_ia' && esActivo && (
                        <div
                          onClick={e => e.stopPropagation()}
                          style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.ruleS}`, display: 'flex', flexDirection: 'column', gap: 10 }}
                        >
                          {/* Nombre del asistente */}
                          <div>
                            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4 }}>Nombre del asistente</div>
                            <input
                              value={maitre.nombre_asistente}
                              onChange={e => { setMaitre(p => ({ ...p, nombre_asistente: e.target.value })); setOk(false) }}
                              maxLength={40}
                              style={{ width: '100%', fontFamily: SN, fontSize: 12, color: C.ink, padding: '7px 9px', border: `1px solid ${C.ruleS}`, borderRadius: 6, background: C.paper }}
                            />
                          </div>
                          {/* Personalidad */}
                          <div>
                            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4 }}>Tono</div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              {([
                                { v: 'clasico', label: 'Clásico' },
                                { v: 'cercano', label: 'Cercano' },
                                { v: 'gastro',  label: 'Gastronómico' },
                              ] as const).map(op => (
                                <button key={op.v}
                                  onClick={() => { setMaitre(p => ({ ...p, personalidad: op.v })); setOk(false) }}
                                  style={{ flex: 1, padding: '7px 8px', border: `1px solid ${maitre.personalidad === op.v ? C.red : C.ruleS}`, borderRadius: 6, background: maitre.personalidad === op.v ? '#D9442B14' : C.paper, cursor: 'pointer', fontFamily: SN, fontSize: 12, fontWeight: 600, color: maitre.personalidad === op.v ? C.red : C.ink }}>
                                  {op.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* Nº sugerencias */}
                          <div>
                            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 4 }}>Nº de sugerencias</div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              {[2, 3].map(num => (
                                <button key={num}
                                  onClick={() => { setMaitre(p => ({ ...p, num_sugerencias: num })); setOk(false) }}
                                  style={{ flex: 1, padding: '7px 8px', border: `1px solid ${maitre.num_sugerencias === num ? C.red : C.ruleS}`, borderRadius: 6, background: maitre.num_sugerencias === num ? '#D9442B14' : C.paper, cursor: 'pointer', fontFamily: SN, fontSize: 12, fontWeight: 600, color: maitre.num_sugerencias === num ? C.red : C.ink }}>
                                  {num}
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* Toggles */}
                          {([
                            { k: 'permitir_antojo_texto', label: 'Permitir que el comensal escriba qué le apetece' },
                            { k: 'mostrar_precios',       label: 'Mostrar precios en las sugerencias' },
                            { k: 'incluir_no_declarados', label: 'Incluir platos SIN alérgenos declarados (⚠ bajo tu responsabilidad)' },
                          ] as const).map(t => (
                            <label key={t.k} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: SN, fontSize: 11, color: C.ink2 }}>
                              <input type="checkbox" checked={maitre[t.k]}
                                onChange={e => { setMaitre(p => ({ ...p, [t.k]: e.target.checked })); setOk(false) }} />
                              {t.label}
                            </label>
                          ))}
                        </div>
                      )}
```

- [ ] **Step 6: Verificar typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errores TS; lint sin errores nuevos.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/owner/modulos/route.ts src/components/owner/ModulosTab.tsx
git commit -m "feat(maitre): toggle módulo carta_ia y config del dueño en ModulosTab"
```

---

## Task 4: Componente del comensal (`MaitreSheet.tsx`)

**Files:**
- Create: `src/components/qr/MaitreSheet.tsx`

- [ ] **Step 1: Crear el componente completo**

> Los valores de `ALERGENOS_UE` deben coincidir (en minúsculas) con lo guardado en
> `productos.alergenos` (ver nota de datos arriba). Ajustar si el restaurante usa otras etiquetas.

```tsx
'use client'
// src/components/qr/MaitreSheet.tsx
// Bottom sheet del "Maître IA" para el comensal en el QR.
// Pide alérgenos (chips) + antojo (texto) y muestra 2-3 platos. Emite ids al añadir.

import { useState } from 'react'
import { SN } from '@/lib/colors'

const C = {
  bg: '#14110E', bg2: '#1E1A15', bg3: '#2A221A',
  vermilion: '#D9442B', cream: '#F6F1E7', creamMid: '#D8CDB6',
  creamDim: '#8C7B69', rule: '#2E2720', green: '#3F7D44',
}

const fmt = (n: number) => n.toFixed(2).replace('.', ',') + ' €'

// 14 alérgenos de declaración obligatoria (UE). El value se compara en minúsculas.
const ALERGENOS_UE = [
  'gluten', 'crustáceos', 'huevos', 'pescado', 'cacahuetes', 'soja', 'lácteos',
  'frutos de cáscara', 'apio', 'mostaza', 'sésamo', 'sulfitos', 'altramuces', 'moluscos',
]

interface PlatoRec { id: string; nombre: string; precio: number; alergenos: string[]; motivo: string }

interface Props {
  token: string
  idioma: string
  comensales: number
  config: { nombre_asistente: string; permitir_antojo_texto: boolean; mostrar_precios: boolean }
  onAddIds: (ids: string[]) => void
  onClose: () => void
}

export default function MaitreSheet({ token, idioma, comensales, config, onAddIds, onClose }: Props) {
  const [fase, setFase] = useState<'form' | 'cargando' | 'resultado'>('form')
  const [alergenos, setAlergenos] = useState<string[]>([])
  const [antojo, setAntojo] = useState('')
  const [platos, setPlatos] = useState<PlatoRec[]>([])
  const [seleccion, setSeleccion] = useState<string[]>([])
  const [err, setErr] = useState('')

  const toggleAlergeno = (a: string) =>
    setAlergenos(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])
  const toggleSel = (id: string) =>
    setSeleccion(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const pedir = async () => {
    setFase('cargando'); setErr('')
    try {
      const res = await fetch('/api/qr/recomendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, alergenos, antojo, idioma, comensales }),
      })
      const d = await res.json()
      const lista: PlatoRec[] = Array.isArray(d.platos) ? d.platos : []
      setPlatos(lista)
      setSeleccion([])
      setFase('resultado')
    } catch {
      setErr('No se pudo obtener recomendación. Inténtalo de nuevo.')
      setFase('form')
    }
  }

  const anadir = () => {
    if (seleccion.length) onAddIds(seleccion)
    onClose()
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 90, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxHeight: '88vh', overflowY: 'auto', background: C.bg2, borderRadius: '18px 18px 0 0', border: `1px solid ${C.rule}`, padding: 18, fontFamily: SN }}>
        {/* Cabecera */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.cream }}>{config.nombre_asistente}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.creamDim, fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        {fase === 'form' && (
          <>
            <div style={{ fontSize: 12, color: C.creamMid, marginBottom: 8 }}>¿Tienes alergias o intolerancias? Márcalas:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>
              {ALERGENOS_UE.map(a => {
                const on = alergenos.includes(a)
                return (
                  <button key={a} onClick={() => toggleAlergeno(a)}
                    style={{ padding: '6px 11px', borderRadius: 16, border: `1px solid ${on ? C.vermilion : C.rule}`, background: on ? C.vermilion : C.bg3, color: on ? '#fff' : C.creamMid, fontSize: 12, cursor: 'pointer', textTransform: 'capitalize' }}>
                    {a}
                  </button>
                )
              })}
            </div>

            {config.permitir_antojo_texto && (
              <>
                <div style={{ fontSize: 12, color: C.creamMid, marginBottom: 6 }}>¿Qué te apetece? (opcional)</div>
                <textarea value={antojo} onChange={e => setAntojo(e.target.value)} maxLength={200}
                  placeholder="Algo ligero para compartir, sin mucha hambre…"
                  style={{ width: '100%', minHeight: 60, resize: 'none', background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 10, color: C.cream, fontSize: 13, fontFamily: SN, padding: 10, marginBottom: 16, boxSizing: 'border-box' }} />
              </>
            )}

            {err && <div style={{ color: C.vermilion, fontSize: 12, marginBottom: 10 }}>{err}</div>}

            <button onClick={pedir}
              style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: C.vermilion, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              Recomiéndame
            </button>
          </>
        )}

        {fase === 'cargando' && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: C.creamMid, fontSize: 14 }}>
            Pensando la mejor recomendación para ti…
          </div>
        )}

        {fase === 'resultado' && (
          <>
            {platos.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: C.creamMid, fontSize: 14 }}>
                No encontramos platos que encajen con tus alergias. Pregunta a nuestro personal y te ayudamos. 🙏
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {platos.map(p => {
                    const on = seleccion.includes(p.id)
                    return (
                      <button key={p.id} onClick={() => toggleSel(p.id)}
                        style={{ textAlign: 'left', display: 'flex', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: 12, border: `2px solid ${on ? C.vermilion : C.rule}`, background: C.bg3, cursor: 'pointer' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: C.cream }}>{p.nombre}</span>
                            {config.mostrar_precios && <span style={{ fontSize: 13, color: C.creamMid }}>{fmt(p.precio)}</span>}
                          </div>
                          {p.motivo && <div style={{ fontSize: 12, color: C.creamMid, marginTop: 4, fontStyle: 'italic' }}>{p.motivo}</div>}
                          {p.alergenos.length > 0 && (
                            <div style={{ fontSize: 10, color: C.creamDim, marginTop: 4, textTransform: 'capitalize' }}>Contiene: {p.alergenos.join(', ')}</div>
                          )}
                        </div>
                        <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, background: on ? C.vermilion : 'transparent', border: `1px solid ${on ? C.vermilion : C.rule}`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{on ? '✓' : ''}</div>
                      </button>
                    )
                  })}
                </div>

                <div style={{ fontSize: 10, color: C.creamDim, margin: '12px 0', lineHeight: 1.4 }}>
                  Sugerencias orientativas. Confirma cualquier alergia o intolerancia con el personal de sala.
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setFase('form')}
                    style={{ flex: 1, padding: 13, borderRadius: 12, border: `1px solid ${C.rule}`, background: 'transparent', color: C.creamMid, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    Cambiar
                  </button>
                  <button onClick={anadir} disabled={seleccion.length === 0}
                    style={{ flex: 2, padding: 13, borderRadius: 12, border: 'none', background: seleccion.length ? C.vermilion : C.rule, color: seleccion.length ? '#fff' : C.creamDim, fontSize: 14, fontWeight: 700, cursor: seleccion.length ? 'pointer' : 'not-allowed' }}>
                    {seleccion.length ? `Añadir ${seleccion.length} al pedido` : 'Selecciona platos'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errores TS; lint sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/components/qr/MaitreSheet.tsx
git commit -m "feat(maitre): bottom sheet del comensal en el QR"
```

---

## Task 5: Montar el Maître en `QrClientApp`

**Files:**
- Modify: `src/app/q/[token]/QrClientApp.tsx`

- [ ] **Step 1: Importar el componente**

Junto a los imports de componentes (tras `import SelectorIdioma ...`):

```typescript
import MaitreSheet from '@/components/qr/MaitreSheet'
```

- [ ] **Step 2: Estado del Maître**

Junto a los `useState` del componente (tras `const [cart, setCart] = ...`):

```typescript
  const [maitreActivo, setMaitreActivo] = useState(false)
  const [maitreConfig, setMaitreConfig] = useState<{ nombre_asistente: string; permitir_antojo_texto: boolean; mostrar_precios: boolean }>({ nombre_asistente: 'Maître IA', permitir_antojo_texto: true, mostrar_precios: true })
  const [maitreOpen, setMaitreOpen] = useState(false)
```

- [ ] **Step 3: Cargar la config del Maître al montar**

Añadir un `useEffect` (cerca de los demás efectos del componente). Usa el `token` que ya recibe el componente por props:

```typescript
  useEffect(() => {
    let vivo = true
    fetch(`/api/qr/recomendar?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => { if (vivo && d?.activo) { setMaitreActivo(true); if (d.config) setMaitreConfig(d.config) } })
      .catch(() => {})
    return () => { vivo = false }
  }, [token])
```

- [ ] **Step 4: Handler para añadir ids recomendados al carrito**

Junto a `addToCart` (tras su definición, líneas ~500-503):

```typescript
  const addRecomendados = (ids: string[]) => {
    const productos = data?.productos ?? []
    ids.forEach(id => {
      const prod = productos.find(p => p.id === id)
      if (prod) addToCart(prod)
    })
    showToast('Añadido a tu pedido ✓')
  }
```

- [ ] **Step 5: Botón de entrada en la pantalla de carta + montaje del sheet**

En el render de la pantalla `menu` (buscar `screen === 'menu'` / el bloque que pinta la carta), añadir, cerca de la cabecera de la carta, un botón visible solo si `maitreActivo`:

```tsx
        {maitreActivo && (
          <button onClick={() => setMaitreOpen(true)}
            style={{ width: '100%', margin: '6px 0 14px', padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.vermilion}`, background: '#D9442B14', color: C.cream, fontFamily: SN, fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
            ✨ ¿No sabes qué pedir? Pregúntale al {maitreConfig.nombre_asistente}
          </button>
        )}
```

Y al final del return del componente (junto a otros modales/overlays condicionales, antes del cierre del JSX raíz), montar el sheet:

```tsx
      {maitreOpen && (
        <MaitreSheet
          token={token}
          idioma={leerIdioma()}
          comensales={numComensales || 1}
          config={maitreConfig}
          onAddIds={addRecomendados}
          onClose={() => setMaitreOpen(false)}
        />
      )}
```

> Nota: `leerIdioma()` ya está importado y devuelve el `CodigoIdioma` activo. `numComensales`
> y `showToast` ya existen en el componente. Si el linter marca `leerIdioma` sin argumentos,
> revisar su firma en `@/lib/useIdiomasCarta` y pasar el valor de idioma que el componente
> ya tenga en estado.

- [ ] **Step 6: Verificar typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errores TS; lint sin errores nuevos.

- [ ] **Step 7: Commit**

```bash
git add src/app/q/[token]/QrClientApp.tsx
git commit -m "feat(maitre): montar Maître IA en el QR del comensal"
```

---

## Task 6: Verificación final + build + PR

- [ ] **Step 1: Typecheck + lint global**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 errores.

- [ ] **Step 2: Build de producción (reproduce Vercel — obligatorio)**

Run: `npm run build`
Expected: build OK, sin errores. (Si falta `.env.local`, las vars públicas del QR pueden
requerir `vercel env pull .env.local` antes.)

- [ ] **Step 3: Smoke manual (si hay entorno con datos)**

1. `/owner → Módulos`: activar **Maître IA**, ajustar tono/nombre, guardar.
2. Abrir `/q/<token>` de una mesa: aparece el botón "¿No sabes qué pedir?".
3. Marcar un alérgeno presente en algún plato → ese plato no debe aparecer en las sugerencias.
4. Seleccionar 1-2 sugerencias → "Añadir N al pedido" → revisar que entran en el carrito.
5. Desactivar el módulo en Módulos → el botón desaparece en el QR.

- [ ] **Step 4: Actualizar memoria de sesión**

Añadir entrada arriba en "Registro de sesiones" y refrescar "Estado actual" en
`docs/CONTEXTO-SESIONES.md` (lo persiste el hook Stop, pero el resumen lo redacta el agente).

- [ ] **Step 5: Push + PR (draft)**

```bash
git push -u origin claude/ai-meal-recommender-3vVLJ
```

Crear PR draft hacia `main` con resumen de la feature.

---

## Self-Review (cobertura del spec)

- §2 Motor compartido → Task 1 (`recomendarPlatos`), reutilizable; puerta camarero queda fuera v1 (documentado).
- §2 Puerta comensal `/api/qr/recomendar` → Task 2 (GET+POST, valida token).
- §2 Gating módulo `carta_ia` → Task 2 (chequeo en API) + Task 3 (toggle owner) + Task 5 (UI).
- §4 Seguridad alérgenos: filtro en código → `filtrarSeguros` (Task 1); no declarados excluidos por defecto (`incluir_no_declarados=false`) → Task 1 + config Task 3; defensa en profundidad (descartar ids fuera de lista segura) → Task 1; disclaimer → Task 4.
- §5 Config dueño (`maitre_ia`) → Task 3 (nombre, tono, nº sugerencias, 3 toggles). *Nota:* `secciones` y `objetivo` del spec se omiten en v1 (YAGNI) — `CATEGORIAS_EXCLUIDAS` cubre el caso "no recomendar bebidas". El resto es ampliable sin reescritura.
- §6 UX QR: botón en carta, bottom sheet (chips + antojo + comensales), tarjetas con porqué/precio/alérgenos, multi-selección, "Añadir N", idioma, estados → Task 4 + Task 5.
- §7 Ficheros → coinciden con File Structure.
- §8 Fuera de alcance (maridaje vino, puerta /edge, voz) → no incluido, arquitectura lo permite.
- §9 Verificación → Task 6 (tsc + lint + build + smoke).
