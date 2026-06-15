# E-recibo digital — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que al pedir la cuenta se imprima un QR en el ticket térmico que abre un e-recibo digital mobile-first en el móvil del cliente.

**Architecture:** Al generar el ticket de cuenta (`crearPrintJobCuenta`) se crea un token + snapshot autocontenido en la tabla nueva `recibos_digitales`; se añade un bloque QR ESC/POS al ticket con la URL `iarest.es/recibo/[token]`; una ruta pública `app/recibo/[token]` (server component, token = secreto) renderiza el recibo con el tema ia.rest.

**Tech Stack:** Next.js App Router (server components), Supabase (schema `iarest`, service role), ESC/POS (Buffer), TypeScript.

> **Verificación (este proyecto NO tiene runner de tests):** cada tarea cierra con `npx tsc --noEmit` (0 errores). La última tarea corre `next build`. Verificación funcional = manual (pedir cuenta en demo → abrir `/recibo/[token]`). Esto sustituye al TDD clásico porque el repo no tiene vitest/jest.

> **Spec:** `apps/ia-rest/docs/superpowers/specs/2026-06-15-e-recibo-digital-design.md`

---

### Task 1: Migración — tabla `recibos_digitales`

**Files:**
- Create: `apps/ia-rest/supabase/migrations/20260615_recibos_digitales.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- recibos_digitales: snapshot público del ticket de cuenta para el e-recibo por QR.
-- Vive en el schema iarest del proyecto compartido (wswbehlcuxqxyinousql).
CREATE TABLE IF NOT EXISTS iarest.recibos_digitales (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         TEXT UNIQUE NOT NULL,
  local_id      UUID NOT NULL,
  comanda_id    UUID,
  factura_verifactu_id UUID,
  snapshot      JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_recibos_token ON iarest.recibos_digitales(token);
CREATE INDEX IF NOT EXISTS idx_recibos_local ON iarest.recibos_digitales(local_id);
ALTER TABLE iarest.recibos_digitales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON iarest.recibos_digitales
  USING (auth.role() = 'service_role');
```

- [ ] **Step 2: Aplicar en el proyecto compartido (schema iarest)**

Aplicar vía Supabase MCP `apply_migration` (project_id `wswbehlcuxqxyinousql`, name `recibos_digitales`, el SQL de arriba). `createServerClient()` ya fija el schema `iarest`, así que `.from('recibos_digitales')` resolverá a `iarest.recibos_digitales`.
Expected: migración aplicada sin error; `list_tables` muestra `recibos_digitales` en schema `iarest`.

- [ ] **Step 3: Commit**

```bash
git add apps/ia-rest/supabase/migrations/20260615_recibos_digitales.sql
git commit -m "feat(ia-rest): migracion recibos_digitales (e-recibo)"
```

---

### Task 2: `src/lib/recibo.ts` — tipos, token y creación del recibo

**Files:**
- Create: `apps/ia-rest/src/lib/recibo.ts`

- [ ] **Step 1: Escribir el módulo completo**

```ts
// ============================================================
// ia.rest · RECIBO DIGITAL — snapshot público del ticket de cuenta
// ============================================================
import { randomBytes } from 'crypto'
import { createServerClient } from '@/lib/supabase'

export interface ReciboSnapshotItem {
  nombre: string
  cantidad: number
  precio_unitario: number
}

export interface ReciboSnapshot {
  restaurante: {
    nombre: string
    razon_social: string | null
    nif: string | null
    direccion: string | null
  }
  mesa_label: string
  zona_nombre: string | null
  fecha: string                 // ISO
  numero_ticket: number
  items: ReciboSnapshotItem[]
  total: number
  iva: { tipo: number; base: number; cuota: number }
  aeat: { qr_content: string; numero_factura: string; url: string } | null
}

/** Token url-safe de ~22 chars (16 bytes base64url). El token ES el secreto del recibo. */
export function generarTokenRecibo(): string {
  return randomBytes(16).toString('base64url')
}

export interface CrearReciboParams {
  local_id: string
  comanda_id: string
  snapshot: ReciboSnapshot
}

/** Inserta el recibo y devuelve el token, o null si falla (no debe bloquear la impresión). */
export async function crearReciboDigital(params: CrearReciboParams): Promise<string | null> {
  const supabase = createServerClient()
  const token = generarTokenRecibo()
  const { error } = await supabase
    .from('recibos_digitales')
    .insert({
      token,
      local_id: params.local_id,
      comanda_id: params.comanda_id,
      snapshot: params.snapshot,
    })
  if (error) {
    console.error('[RECIBO] Error creando recibo digital:', error)
    return null
  }
  return token
}
```

- [ ] **Step 2: Verificar tipos**

Run: `cd apps/ia-rest && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add apps/ia-rest/src/lib/recibo.ts
git commit -m "feat(ia-rest): lib recibo (snapshot + token + crear)"
```

---

### Task 3: `src/lib/courier.ts` — QR ESC/POS + wiring en `crearPrintJobCuenta`

**Files:**
- Modify: `apps/ia-rest/src/lib/courier.ts`

- [ ] **Step 1: Importar la lib del recibo** (arriba, junto al import de supabase, ~línea 11)

```ts
import { crearReciboDigital, type ReciboSnapshot } from '@/lib/recibo'
```

- [ ] **Step 2: Añadir helper `escposQR`** (justo antes de `export function generarEscPosCuenta`)

```ts
/** Bloque ESC/POS para imprimir un QR (modelo 2) con `data`. Compatible Epson TM / Star. */
function escposQR(data: string): Buffer {
  const GS = 0x1d
  const bytes = Buffer.from(data, 'latin1')
  const len = bytes.length + 3
  const pL = len & 0xff
  const pH = (len >> 8) & 0xff
  return Buffer.concat([
    Buffer.from([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]), // modelo 2
    Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]),       // módulo size 6
    Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]),       // corrección M
    Buffer.from([GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]), bytes,    // guardar datos
    Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]),       // imprimir
  ])
}
```

- [ ] **Step 3: Añadir `recibo_url` a `CuentaParams`** (interfaz `CuentaParams`, junto a los campos opcionales)

```ts
  // E-recibo digital: URL a /recibo/[token] (si se generó). Imprime QR si está presente.
  recibo_url?: string | null
```

- [ ] **Step 4: Imprimir el QR en `generarEscPosCuenta`** — dentro de `generarEscPosCuenta`, justo ANTES del bloque `// ── BRANDING ia.rest ──`:

```ts
  // ── E-RECIBO DIGITAL (QR) ───────────────────────────────
  if (p.recibo_url) {
    bufs.push(b(ESC, 0x61, 0x01)) // center
    bufs.push(t('Escanea para tu recibo digital'), b(LF))
    bufs.push(escposQR(p.recibo_url))
    bufs.push(b(LF))
  }
```

- [ ] **Step 5: Crear el recibo dentro de `crearPrintJobCuenta`** — al inicio de la función (tras `const supabase = createServerClient()`), construir snapshot + token y fijar `p.recibo_url`:

```ts
  // ── E-recibo digital: snapshot + token (no bloquea impresión si falla) ──
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.iarest.es'
  const baseImp = p.total / 1.10
  const snapshot: ReciboSnapshot = {
    restaurante: {
      nombre: p.restaurante_nombre,
      razon_social: p.razon_social ?? null,
      nif: p.nif_emisor ?? null,
      direccion: p.restaurante_direccion ?? null,
    },
    mesa_label: p.mesa_label,
    zona_nombre: p.zona_nombre ?? null,
    fecha: new Date().toISOString(),
    numero_ticket: p.numero_ticket,
    items: p.items.map(it => ({
      nombre: it.nombre, cantidad: it.cantidad, precio_unitario: it.precio_unitario,
    })),
    total: p.total,
    iva: {
      tipo: 10,
      base: Math.round(baseImp * 100) / 100,
      cuota: Math.round((p.total - baseImp) * 100) / 100,
    },
    aeat: null, // la factura legal aún no existe al pedir la cuenta (fase 2)
  }
  const reciboToken = await crearReciboDigital({
    local_id: p.local_id, comanda_id: p.comanda_id, snapshot,
  })
  if (reciboToken) p.recibo_url = `${baseUrl}/recibo/${reciboToken}`
```

- [ ] **Step 6: Añadir la URL al fallback de texto plano** — en `crearPrintJobCuenta`, en el array `lines` del branch `else` (no-TCP), antes de la línea `'', '     Gestion con ia.rest',`:

```ts
      ...(p.recibo_url ? ['', '  Recibo digital:', '  ' + p.recibo_url] : []),
```

- [ ] **Step 7: Verificar tipos**

Run: `cd apps/ia-rest && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 8: Commit**

```bash
git add apps/ia-rest/src/lib/courier.ts
git commit -m "feat(ia-rest): QR e-recibo en ticket de cuenta (courier)"
```

---

### Task 4: `src/app/recibo/[token]/ReciboView.tsx` — diseño del e-recibo

**Files:**
- Create: `apps/ia-rest/src/app/recibo/[token]/ReciboView.tsx`

- [ ] **Step 1: Escribir el componente presentacional**

```tsx
// E-recibo digital — vista mobile-first. Server component puro (sin estado).
import { C } from '@/lib/colors'
import type { ReciboSnapshot } from '@/lib/recibo'

const eur = (v: number) => v.toFixed(2).replace('.', ',') + ' €'

export function ReciboNoDisponible() {
  return (
    <div style={{ minHeight: '100vh', background: C.dark, color: C.darkFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
        <p style={{ fontSize: 16, fontWeight: 600 }}>Este recibo ya no está disponible</p>
        <p style={{ fontSize: 13, color: C.darkFg3, marginTop: 6 }}>gestionado con ia.rest</p>
      </div>
    </div>
  )
}

export default function ReciboView({ snapshot }: { snapshot: ReciboSnapshot }) {
  const s = snapshot
  const inicial = (s.restaurante.nombre || '?').trim().charAt(0).toUpperCase()
  const fecha = new Date(s.fecha).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ minHeight: '100vh', background: C.dark, display: 'flex', justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '24px 14px' }}>
      <div style={{ width: '100%', maxWidth: 360, background: C.bone, borderRadius: 20, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,.4)', color: C.ink, alignSelf: 'flex-start' }}>
        {/* Cabecera */}
        <div style={{ background: C.dark1, color: C.darkFg, padding: '20px 18px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: C.amber, color: C.dark1, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>{inicial}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{s.restaurante.nombre}</div>
              <div style={{ fontSize: 11, color: C.darkFg3 }}>
                {(s.zona_nombre ? s.zona_nombre + ' · ' : '')}Mesa {s.mesa_label} · {fecha}
              </div>
            </div>
          </div>
        </div>

        {/* Items */}
        <div style={{ padding: '14px 18px 4px' }}>
          {s.items.map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '7px 0', color: C.ink2 }}>
              <span>{it.cantidad}× {it.nombre}</span>
              <span>{eur(it.precio_unitario * it.cantidad)}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px dashed ${C.rule}`, marginTop: 8, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>Total</span>
            <span style={{ fontWeight: 800, fontSize: 22 }}>{eur(s.total)}</span>
          </div>
          <div style={{ fontSize: 11, color: C.ink4, marginTop: 2 }}>
            IVA {s.iva.tipo}% incluido · {eur(s.iva.cuota)}
          </div>
        </div>

        {/* Verificación AEAT (si hay factura) */}
        {s.aeat && (
          <div style={{ padding: '14px 18px 0', textAlign: 'center' }}>
            <a href={s.aeat.url} style={{ fontSize: 12, color: C.red, textDecoration: 'none' }}>
              Factura {s.aeat.numero_factura} · verificable en AEAT
            </a>
          </div>
        )}

        {/* Pie */}
        <div style={{ padding: '18px', textAlign: 'center', fontSize: 11, color: C.ink4 }}>
          ⚡ gestionado con ia.rest
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `cd apps/ia-rest && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add apps/ia-rest/src/app/recibo/\[token\]/ReciboView.tsx
git commit -m "feat(ia-rest): vista e-recibo digital (ReciboView)"
```

---

### Task 5: `src/app/recibo/[token]/page.tsx` — ruta pública

**Files:**
- Create: `apps/ia-rest/src/app/recibo/[token]/page.tsx`

- [ ] **Step 1: Escribir la página (server component)**

```tsx
// /recibo/[token] — e-recibo público del cliente. Sin sesión: el token es el secreto.
import type { Metadata } from 'next'
import { createServerClient } from '@/lib/supabase'
import type { ReciboSnapshot } from '@/lib/recibo'
import ReciboView, { ReciboNoDisponible } from './ReciboView'

export const metadata: Metadata = {
  title: 'Tu recibo · ia.rest',
  description: 'Recibo digital de tu consumición',
}

export default async function ReciboPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createServerClient()
  const { data } = await supabase
    .from('recibos_digitales')
    .select('snapshot, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!data || (data.expires_at && new Date(data.expires_at) < new Date())) {
    return <ReciboNoDisponible />
  }
  return <ReciboView snapshot={data.snapshot as ReciboSnapshot} />
}
```

- [ ] **Step 2: Verificar tipos + build**

Run: `cd apps/ia-rest && npx tsc --noEmit && npm run build`
Expected: 0 errores TS; `next build` termina OK y lista la ruta `/recibo/[token]`.

- [ ] **Step 3: Commit**

```bash
git add apps/ia-rest/src/app/recibo/\[token\]/page.tsx
git commit -m "feat(ia-rest): ruta publica /recibo/[token]"
```

---

### Task 6: Verificación funcional + memoria

**Files:**
- Modify: `docs/CONTEXTO-SESIONES.md`

- [ ] **Step 1: Verificación manual**

En demo: pedir cuenta de una comanda con items → comprobar en el log que se imprime `recibo_url` y que el ticket lleva el bloque QR. Insertar/usar el token → abrir `https://<preview>/recibo/<token>` en móvil → ver el e-recibo (cabecera con inicial, items, total, IVA). Probar token inexistente → "Este recibo ya no está disponible".

- [ ] **Step 2: Actualizar memoria**

En `docs/CONTEXTO-SESIONES.md`, añadir entrada arriba en "Estado actual": e-recibo digital MVP implementado (tabla `recibos_digitales`, QR en ticket de cuenta, ruta `/recibo/[token]`). Fase 2 pendiente: PDF, NIF desde móvil, email, marca por restaurante.

- [ ] **Step 3: Commit**

```bash
git add docs/CONTEXTO-SESIONES.md
git commit -m "docs(memoria): e-recibo digital MVP implementado"
```

---

## Self-Review (hecho)

- **Cobertura del spec:** tabla `recibos_digitales` (T1) · lib snapshot/token (T2) · QR + wiring courier (T3) · vista (T4) · ruta pública (T5) · verificación/memoria (T6). Todos los puntos del spec tienen tarea. El `aeat` del snapshot queda en `null` en el MVP (la factura legal se emite en cobro/cierre, no al pedir cuenta) — la vista ya soporta el caso no-null para fase 2.
- **Sin placeholders:** todo el código va completo.
- **Consistencia de tipos:** `ReciboSnapshot`/`ReciboSnapshotItem`/`crearReciboDigital` definidos en T2 y usados igual en T3/T4/T5. `recibo_url` añadido a `CuentaParams` en T3 y consumido en `generarEscPosCuenta`. `ReciboView` default export + `ReciboNoDisponible` named export, importados así en T5.
```
