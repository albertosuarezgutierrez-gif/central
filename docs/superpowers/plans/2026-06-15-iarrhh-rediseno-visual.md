# iarrhh — Rediseño visual (Portal del Empleado) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vestir `apps/rrhh` con la marca **iarrhh** (paleta papel/tinta + acento teal, fuentes de la casa, layout admin con sidebar y portal de empleado en cartas) sin tocar nada de lógica, datos, API ni auth.

**Architecture:** Se centralizan tokens de diseño como CSS vars en `globals.css` y se mapean a Tailwind en `tailwind.config.ts`. Las fuentes se cargan con `next/font/google` en `layout.tsx` y se exponen como vars. Un componente presentacional `Wordmark` y un `AdminShell` (sidebar) envuelven las pantallas existentes. Cada página/componente reemplaza sus `style={{…}}` inline por clases Tailwind con los tokens. **Ningún cambio de comportamiento**: props, estado, fetch y rutas se mantienen idénticos.

**Tech Stack:** Next.js 15 (App Router), Tailwind CSS, next/font/google (Inter Tight, Newsreader, JetBrains Mono).

---

## Restricciones (invariantes que NO se pueden romper)

- **NO** modificar `app/api/**`, `lib/*`, `prisma/*`, ni la firma de props de ningún componente.
- **NO** cambiar nombres de rutas, endpoints fetch, ni los literales `yo="gestor"` / `yo="titular"`.
- **NO** añadir dependencias de runtime (solo `next/font` que ya viene con Next).
- El acento por defecto es teal `#2B6A6E` expuesto como `--accent`. El white-label por empresa (`marca_color`) queda **fuera de alcance** en este plan (requeriría tocar las queries de datos): se deja el hook CSS var listo pero sin cablear datos.

## File Structure

- `apps/rrhh/app/globals.css` — **Modify**: tokens CSS (paleta + fuentes) + estilos base (body, inputs, botones).
- `apps/rrhh/tailwind.config.ts` — **Modify**: mapear tokens a `colors` y `fontFamily`.
- `apps/rrhh/app/layout.tsx` — **Modify**: cargar fuentes con `next/font/google`, aplicar clases al `<body>`.
- `apps/rrhh/components/Wordmark.tsx` — **Create**: logotipo tipográfico `ia·rrhh`.
- `apps/rrhh/components/AdminShell.tsx` — **Create**: layout con sidebar para las pantallas admin.
- `apps/rrhh/app/login/page.tsx` — **Modify**: restyle (login con tarjeta).
- `apps/rrhh/app/admin/empleados/EmpleadosClient.tsx` — **Modify**: restyle dentro de AdminShell.
- `apps/rrhh/app/admin/empleados/[id]/ExpedienteClient.tsx` — **Modify**: restyle dentro de AdminShell.
- `apps/rrhh/app/admin/solicitudes/SolicitudesClient.tsx` — **Modify**: restyle dentro de AdminShell.
- `apps/rrhh/components/ChatPanel.tsx` — **Modify**: restyle burbujas/cartas.
- `apps/rrhh/components/SolicitudesEmpleado.tsx` — **Modify**: restyle carta.
- `apps/rrhh/components/ActivarPush.tsx` — **Modify**: restyle botón.
- `apps/rrhh/app/e/ExpedienteEmpleado.tsx` — **Modify**: restyle portal empleado (cartas, móvil).
- `apps/rrhh/public/icon.svg` — **Create**: monograma teal (favicon/PWA).

## Verificación (no hay tests unitarios de UI)

El criterio de "hecho" de cada tarea es: **`npm run build` compila sin errores** en `apps/rrhh` y el markup no conserva `style={{…}}` inline en el archivo tocado. La verificación visual final es sobre la preview de Vercel `central-rrhh`.

Comando de build (desde la raíz del repo):
```bash
cd apps/rrhh && npm run build
```
Esperado: `✓ Compiled successfully` y la lista de rutas, sin errores de TypeScript/ESLint que rompan el build.

---

## Task 1: Tokens de diseño en globals.css

**Files:**
- Modify: `apps/rrhh/app/globals.css`

- [ ] **Step 1: Reemplazar el contenido de globals.css por tokens + base**

Sustituir TODO el contenido actual (las 3 directivas `@tailwind`) por:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --paper: #F6F1E7;
  --paper-2: #EFE8DA;
  --card: #FCFAF4;
  --ink: #1A1714;
  --ink-2: #4A443C;
  --ink-3: #857C6E;
  --line: #E2D9C7;
  --line-2: #D6CAB2;
  --accent: #2B6A6E;
  --accent-ink: #21565A;
  --accent-soft: #DCEAEA;
  --green: #3F7D44;
  --vermilion: #D9442B;
}

@layer base {
  body {
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-sans), system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  h1, h2, h3 { font-family: var(--font-serif), Georgia, serif; }
  code, .mono { font-family: var(--font-mono), monospace; }

  /* Controles de formulario con el estilo de la casa */
  input, select, textarea {
    font: inherit;
    color: var(--ink);
    background: var(--card);
    border: 1px solid var(--line-2);
    border-radius: 10px;
    padding: 9px 12px;
  }
  input::placeholder, textarea::placeholder { color: var(--ink-3); }
  input:focus, select:focus, textarea:focus {
    outline: 2px solid var(--accent-soft);
    border-color: var(--accent);
  }
  button {
    font: inherit;
    cursor: pointer;
    border: 0;
    border-radius: 10px;
    padding: 9px 14px;
    background: var(--accent);
    color: #fff;
    font-weight: 600;
  }
  button:hover { background: var(--accent-ink); }
}
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/rrhh && npm run build`
Expected: `✓ Compiled successfully` (las vars `--font-*` aún no existen; se añaden en Task 3 — el CSS es válido igualmente porque son custom properties que resuelven al fallback).

- [ ] **Step 3: Commit**

```bash
git add apps/rrhh/app/globals.css
git commit -m "rrhh: tokens de diseño iarrhh en globals.css"
```

---

## Task 2: Mapear tokens en tailwind.config.ts

**Files:**
- Modify: `apps/rrhh/tailwind.config.ts`

- [ ] **Step 1: Extender el theme con los tokens**

Reemplazar TODO el contenido por:

```ts
import type { Config } from "tailwindcss"
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)",
        "paper-2": "var(--paper-2)",
        card: "var(--card)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        line: "var(--line)",
        "line-2": "var(--line-2)",
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        "accent-soft": "var(--accent-soft)",
        ok: "var(--green)",
        alert: "var(--vermilion)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: { card: "14px" },
    },
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/rrhh && npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add apps/rrhh/tailwind.config.ts
git commit -m "rrhh: mapear tokens iarrhh a Tailwind"
```

---

## Task 3: Cargar las fuentes de la casa en layout.tsx

**Files:**
- Modify: `apps/rrhh/app/layout.tsx`

- [ ] **Step 1: Cargar Inter Tight + Newsreader + JetBrains Mono y aplicarlas al body**

Reemplazar TODO el contenido por:

```tsx
import "./globals.css"
import type { Metadata, Viewport } from "next"
import { Inter_Tight, Newsreader, JetBrains_Mono } from "next/font/google"
import RegisterSW from "@/components/RegisterSW"

const sans = Inter_Tight({ subsets: ["latin"], variable: "--font-sans", display: "swap" })
const serif = Newsreader({ subsets: ["latin"], variable: "--font-serif", display: "swap" })
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" })

export const metadata: Metadata = {
  title: "iarrhh · Portal del Empleado",
  manifest: "/manifest.json",
}

export const viewport: Viewport = { themeColor: "#2B6A6E" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>{children}<RegisterSW /></body>
    </html>
  )
}
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/rrhh && npm run build`
Expected: `✓ Compiled successfully`. (next/font descarga las fuentes en build; ya se usa en otras apps de la casa.)

- [ ] **Step 3: Commit**

```bash
git add apps/rrhh/app/layout.tsx
git commit -m "rrhh: fuentes de la casa (Inter Tight/Newsreader/JetBrains Mono)"
```

---

## Task 4: Componente Wordmark

**Files:**
- Create: `apps/rrhh/components/Wordmark.tsx`

- [ ] **Step 1: Crear el logotipo tipográfico**

```tsx
/** Logotipo tipográfico iarrhh: "ia" tinta fuerte, punto teal, "rrhh" medio. */
export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline font-sans tracking-tight ${className}`}>
      <span className="font-bold text-ink">ia</span>
      <span className="font-bold text-accent px-0.5">·</span>
      <span className="font-medium text-ink-2">rrhh</span>
    </span>
  )
}
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/rrhh && npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add apps/rrhh/components/Wordmark.tsx
git commit -m "rrhh: componente Wordmark iarrhh"
```

---

## Task 5: Icono / monograma SVG (PWA)

**Files:**
- Create: `apps/rrhh/public/icon.svg`

- [ ] **Step 1: Crear el monograma teal**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192">
  <rect width="192" height="192" rx="40" fill="#2B6A6E"/>
  <text x="96" y="96" fill="#F6F1E7" font-family="'Inter Tight',system-ui,sans-serif"
        font-size="92" font-weight="700" letter-spacing="-4"
        text-anchor="middle" dominant-baseline="central">ia</text>
</svg>
```

- [ ] **Step 2: Referenciar el icono SVG en metadata**

En `apps/rrhh/app/layout.tsx`, dentro del objeto `metadata`, añadir la línea `icons` (justo después de `manifest`):

```tsx
export const metadata: Metadata = {
  title: "iarrhh · Portal del Empleado",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg" },
}
```

- [ ] **Step 3: Verificar build**

Run: `cd apps/rrhh && npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add apps/rrhh/public/icon.svg apps/rrhh/app/layout.tsx
git commit -m "rrhh: monograma SVG iarrhh + icono en metadata"
```

---

## Task 6: AdminShell (layout con sidebar)

**Files:**
- Create: `apps/rrhh/components/AdminShell.tsx`

- [ ] **Step 1: Crear el shell de admin**

Componente presentacional puro: recibe `children` y un `activo` para marcar el item del nav. No hace fetch ni lógica.

```tsx
import Wordmark from '@/components/Wordmark'

type NavKey = 'empleados' | 'solicitudes'

/** Marco del panel del responsable: sidebar + contenido. Presentacional puro. */
export default function AdminShell({ activo, children }: { activo: NavKey; children: React.ReactNode }) {
  const item = (key: NavKey, href: string, label: string) => (
    <a
      href={href}
      className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-medium no-underline ${
        activo === key ? 'bg-accent text-white' : 'text-ink-2 hover:bg-paper-2'
      }`}
    >
      {label}
    </a>
  )
  return (
    <div className="min-h-screen md:grid md:grid-cols-[212px_1fr]">
      <aside className="flex flex-col gap-1 border-b border-line bg-paper-2 p-4 md:border-b-0 md:border-r">
        <Wordmark className="mx-1 mb-4 text-xl" />
        <nav className="flex flex-row gap-1 md:flex-col">
          {item('empleados', '/admin/empleados', 'Empleados')}
          {item('solicitudes', '/admin/solicitudes', 'Solicitudes')}
        </nav>
      </aside>
      <main className="mx-auto w-full max-w-3xl p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/rrhh && npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add apps/rrhh/components/AdminShell.tsx
git commit -m "rrhh: AdminShell con sidebar"
```

---

## Task 7: Restyle del login

**Files:**
- Modify: `apps/rrhh/app/login/page.tsx`

- [ ] **Step 1: Vestir el login con tarjeta (sin tocar la lógica)**

Mantener intactos `useState`, `enviar`, fetch y la redirección. Reemplazar SOLO el `return`:

```tsx
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm rounded-[18px] border border-line bg-card p-7 shadow-sm">
        <Wordmark className="text-2xl" />
        <h1 className="mt-3 text-xl">Acceso responsable</h1>
        <form onSubmit={enviar} className="mt-5 grid gap-2.5">
          <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input placeholder="Contraseña" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <button type="submit" className="mt-1">Entrar</button>
          {err && <p className="text-alert text-sm">{err}</p>}
        </form>
      </div>
    </main>
  )
```

Y añadir el import al principio del archivo (debajo de `import { useState } from 'react'`):

```tsx
import Wordmark from '@/components/Wordmark'
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/rrhh && npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add apps/rrhh/app/login/page.tsx
git commit -m "rrhh: restyle login iarrhh"
```

---

## Task 8: Restyle de EmpleadosClient

**Files:**
- Modify: `apps/rrhh/app/admin/empleados/EmpleadosClient.tsx`

- [ ] **Step 1: Envolver en AdminShell y vestir (sin tocar lógica)**

Mantener `useState`, `alta` y los fetch idénticos. Reemplazar imports y `return`:

Imports (arriba):
```tsx
import { useState } from 'react'
import ActivarPush from '@/components/ActivarPush'
import AdminShell from '@/components/AdminShell'
```

Return:
```tsx
  return (
    <AdminShell activo="empleados">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl">Empleados</h1>
        <ActivarPush endpoint="/api/admin/push/subscribe" />
      </div>
      <form onSubmit={alta} className="mb-4 flex flex-wrap gap-2">
        <input placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} />
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <button type="submit">Añadir</button>
      </form>
      <ul className="overflow-hidden rounded-[12px] border border-line bg-card">
        {lista.map(e => (
          <li key={e.id} className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 last:border-b-0">
            <a href={`/admin/empleados/${e.id}`} className="font-medium text-ink no-underline hover:text-accent">{e.nombre}</a>
            {e.email && <span className="text-ink-3 text-sm">· {e.email}</span>}
            <code className="ml-auto rounded-md bg-accent-soft px-2 py-0.5 text-xs text-accent-ink">/e/{e.acceso_token}</code>
          </li>
        ))}
        {lista.length === 0 && <li className="px-4 py-3 text-ink-3">Sin empleados todavía</li>}
      </ul>
    </AdminShell>
  )
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/rrhh && npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add apps/rrhh/app/admin/empleados/EmpleadosClient.tsx
git commit -m "rrhh: restyle EmpleadosClient en AdminShell"
```

---

## Task 9: Restyle de ExpedienteClient (admin)

**Files:**
- Modify: `apps/rrhh/app/admin/empleados/[id]/ExpedienteClient.tsx`

- [ ] **Step 1: Envolver en AdminShell y vestir (sin tocar lógica)**

Mantener `useState`, `recargar`, `subir`, `borrar` y todos los fetch idénticos. Cambiar imports y el `return`.

Imports (arriba):
```tsx
import { useState } from 'react'
import ChatPanel from '@/components/ChatPanel'
import AdminShell from '@/components/AdminShell'
```

Return:
```tsx
  return (
    <AdminShell activo="empleados">
      <a href="/admin/empleados" className="text-ink-3 text-sm no-underline hover:text-accent">← Empleados</a>
      <h1 className="mt-1 text-2xl">Expediente · {empleado.nombre}</h1>
      <p className="text-ink-3 text-sm">{[empleado.puesto, empleado.email].filter(Boolean).join(' · ')}</p>
      {error && <p className="text-alert text-sm">{error}</p>}

      <ChatPanel endpoint={`/api/admin/empleados/${empleado.id}/chat`} yo="gestor" />

      {carpetas.map(c => {
        const dc = docs.filter(d => d.carpeta === c.id)
        return (
          <section key={c.id} className="my-3 rounded-card border border-line bg-card p-4">
            <h2 className="mb-2 text-base">{c.etiqueta} <span className="text-ink-3">({dc.length})</span></h2>
            <ul className="mb-2 grid gap-1">
              {dc.map(d => (
                <li key={d.id} className="flex items-center gap-2 text-sm">
                  {d.url
                    ? <a href={d.url} target="_blank" rel="noreferrer" className="text-accent no-underline hover:underline">{d.nombre}</a>
                    : <span>{d.nombre}</span>}
                  <span className="text-ink-3 text-xs">· {d.subido_por}</span>
                  <button onClick={() => borrar(d.id)} className="ml-auto bg-transparent px-2 py-0.5 text-alert hover:bg-paper-2">Borrar</button>
                </li>
              ))}
              {dc.length === 0 && <li className="text-ink-3 text-sm">Sin documentos</li>}
            </ul>
            <label className="text-ink-2 text-sm">
              {subiendo === c.id ? 'Subiendo… ' : 'Subir documento: '}
              <input type="file" disabled={subiendo === c.id}
                onChange={e => { const f = e.target.files?.[0]; if (f) subir(c.id, f); e.currentTarget.value = '' }} />
            </label>
          </section>
        )
      })}
    </AdminShell>
  )
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/rrhh && npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add "apps/rrhh/app/admin/empleados/[id]/ExpedienteClient.tsx"
git commit -m "rrhh: restyle ExpedienteClient en AdminShell"
```

---

## Task 10: Restyle de SolicitudesClient (admin)

**Files:**
- Modify: `apps/rrhh/app/admin/solicitudes/SolicitudesClient.tsx`

- [ ] **Step 1: Envolver en AdminShell y vestir (sin tocar lógica)**

Mantener `useState`, `recargar`, `resolver`, `rango` y los fetch. Mantener `tipoEtiqueta` import. Cambiar la tabla `COLOR` a clases de texto y el `return`.

Reemplazar la constante `COLOR` por un mapa a clases Tailwind:
```tsx
const COLOR: Record<string, string> = { solicitada: 'text-ink-3', aprobada: 'text-ok', rechazada: 'text-alert' }
```

Añadir import arriba:
```tsx
import AdminShell from '@/components/AdminShell'
```

Return:
```tsx
  return (
    <AdminShell activo="solicitudes">
      <h1 className="text-2xl">Solicitudes</h1>
      <ul className="mt-3 grid list-none gap-2 p-0">
        {lista.map(s => (
          <li key={s.id} className="rounded-card border border-line bg-card p-3">
            <strong>{s.empleado_nombre}</strong> · {tipoEtiqueta(s.tipo)} {rango(s) && <span>· {rango(s)}</span>}
            <span className={`ml-2 ${COLOR[s.estado] ?? ''}`}>[{s.estado}]</span>
            {s.motivo && <div className="text-ink-3 text-sm">{s.motivo}</div>}
            {s.estado === 'solicitada' && (
              <div className="mt-2 flex gap-2">
                <button onClick={() => resolver(s.id, true)}>Aprobar</button>
                <button onClick={() => resolver(s.id, false)} className="bg-paper-2 text-ink-2 hover:bg-line">Rechazar</button>
              </div>
            )}
          </li>
        ))}
        {lista.length === 0 && <li className="text-ink-3">Sin solicitudes</li>}
      </ul>
    </AdminShell>
  )
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/rrhh && npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add apps/rrhh/app/admin/solicitudes/SolicitudesClient.tsx
git commit -m "rrhh: restyle SolicitudesClient en AdminShell"
```

---

## Task 11: Restyle de ChatPanel

**Files:**
- Modify: `apps/rrhh/components/ChatPanel.tsx`

- [ ] **Step 1: Vestir burbujas y carta (sin tocar lógica)**

Mantener `useState`, `useRef`, `cargar`, los `useEffect` (polling 5s incluido), `enviar` y el endpoint/`yo`. Reemplazar SOLO el `return`:

```tsx
  return (
    <section className="my-3 rounded-card border border-line bg-card p-4">
      <h2 className="mb-2 text-base">Chat</h2>
      <div className="flex max-h-[260px] flex-col gap-1.5 overflow-y-auto">
        {mensajes.map(m => {
          const mio = m.remitente === yo
          return (
            <div
              key={m.id}
              className={`max-w-[80%] rounded-[13px] px-3 py-1.5 text-sm ${
                mio ? 'self-end rounded-br-[4px] bg-accent text-white' : 'self-start rounded-bl-[4px] bg-paper-2 text-ink'
              }`}
            >
              {m.texto}
            </div>
          )
        })}
        {mensajes.length === 0 && <p className="text-ink-3">Sin mensajes todavía</p>}
        <div ref={finRef} />
      </div>
      <form onSubmit={enviar} className="mt-2 flex gap-2">
        <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe un mensaje…" className="flex-1" />
        <button type="submit">Enviar</button>
      </form>
    </section>
  )
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/rrhh && npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add apps/rrhh/components/ChatPanel.tsx
git commit -m "rrhh: restyle ChatPanel"
```

---

## Task 12: Restyle de SolicitudesEmpleado

**Files:**
- Modify: `apps/rrhh/components/SolicitudesEmpleado.tsx`

- [ ] **Step 1: Vestir la carta (sin tocar lógica)**

Mantener `useState`, `recargar`, `useEffect`, `enviar`, `TIPOS`, `ET` y los fetch. Cambiar `COLOR` a clases y el `return`.

Reemplazar `COLOR`:
```tsx
const COLOR: Record<string, string> = { solicitada: 'text-ink-3', aprobada: 'text-ok', rechazada: 'text-alert' }
```

Return:
```tsx
  return (
    <section className="my-3 rounded-card border border-line bg-card p-4">
      <h2 className="mb-2 text-base">Solicitudes</h2>
      <form onSubmit={enviar} className="mb-3 grid gap-1.5">
        <select value={tipo} onChange={e => setTipo(e.target.value)}>{TIPOS.map(t => <option key={t.id} value={t.id}>{t.et}</option>)}</select>
        <div className="flex gap-1.5">
          <label className="text-ink-2 flex-1 text-xs">Desde <input className="w-full" type="date" value={ini} onChange={e => setIni(e.target.value)} /></label>
          <label className="text-ink-2 flex-1 text-xs">Hasta <input className="w-full" type="date" value={fin} onChange={e => setFin(e.target.value)} /></label>
        </div>
        <input placeholder="Motivo (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)} />
        <button type="submit">Enviar solicitud</button>
        {error && <p className="text-alert text-sm">{error}</p>}
      </form>
      <ul className="grid gap-1">
        {lista.map(s => (
          <li key={s.id} className="text-sm">{ET[s.tipo] ?? s.tipo} {[s.fecha_inicio, s.fecha_fin].filter(Boolean).join(' → ')}
            <span className={`ml-1.5 ${COLOR[s.estado] ?? ''}`}>[{s.estado}]</span></li>
        ))}
        {lista.length === 0 && <li className="text-ink-3 text-sm">Sin solicitudes</li>}
      </ul>
    </section>
  )
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/rrhh && npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add apps/rrhh/components/SolicitudesEmpleado.tsx
git commit -m "rrhh: restyle SolicitudesEmpleado"
```

---

## Task 13: Restyle de ActivarPush

**Files:**
- Modify: `apps/rrhh/components/ActivarPush.tsx`

- [ ] **Step 1: Vestir el botón (sin tocar lógica)**

Mantener `base64ToUint8Array`, `useState`, `clave`, `activar` idénticos. Reemplazar SOLO el `return`:

```tsx
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={activar} className="bg-paper-2 text-ink-2 hover:bg-line">Activar notificaciones</button>
      {estado && <span className="text-ink-3 text-sm">{estado}</span>}
    </span>
  )
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/rrhh && npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add apps/rrhh/components/ActivarPush.tsx
git commit -m "rrhh: restyle ActivarPush"
```

---

## Task 14: Restyle del portal del empleado (ExpedienteEmpleado)

**Files:**
- Modify: `apps/rrhh/app/e/ExpedienteEmpleado.tsx`

- [ ] **Step 1: Vestir cartas móvil-primero (sin tocar lógica)**

Mantener `useState`, `etiqueta`, `recargar`, `subir` y los fetch. Añadir import del Wordmark y reemplazar el `return`.

Imports (arriba, junto a los existentes):
```tsx
import Wordmark from '@/components/Wordmark'
```

Return:
```tsx
  return (
    <main className="mx-auto max-w-[520px] p-4">
      <header className="mb-3 flex items-center justify-between">
        <Wordmark className="text-lg" />
        <span className="rounded-full bg-accent-soft px-3 py-0.5 text-sm text-accent-ink">Mi portal</span>
      </header>

      <p className="mb-2"><ActivarPush endpoint="/api/e/push/subscribe" /></p>

      <ChatPanel endpoint="/api/e/chat" yo="titular" />

      <SolicitudesEmpleado />

      <section className="my-3 rounded-card border border-line bg-card p-4">
        <h2 className="mb-2 text-base">Enviar un documento</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={carpeta} onChange={e => setCarpeta(e.target.value)}>
            {subibles.map(c => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
          </select>
          <input type="file" disabled={subiendo} onChange={e => { const f = e.target.files?.[0]; if (f) subir(f); e.currentTarget.value = '' }} />
        </div>
        {subiendo && <p className="text-ink-3 text-sm">Subiendo…</p>}
        {error && <p className="text-alert text-sm">{error}</p>}
      </section>

      <section className="my-3 rounded-card border border-line bg-card p-4">
        <h2 className="mb-2 text-base">Mis documentos</h2>
        <ul className="grid gap-1">
          {docs.map(d => (
            <li key={d.id} className="text-sm">
              {d.url
                ? <a href={d.url} target="_blank" rel="noreferrer" className="text-accent no-underline hover:underline">{d.nombre}</a>
                : <span>{d.nombre}</span>}
              <span className="text-ink-3 text-xs"> · {etiqueta(d.carpeta)}</span>
            </li>
          ))}
          {docs.length === 0 && <li className="text-ink-3 text-sm">Aún no tienes documentos</li>}
        </ul>
      </section>
    </main>
  )
```

- [ ] **Step 2: Verificar build**

Run: `cd apps/rrhh && npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add apps/rrhh/app/e/ExpedienteEmpleado.tsx
git commit -m "rrhh: restyle portal del empleado"
```

---

## Task 15: Verificación final y push

**Files:** (ninguno — verificación)

- [ ] **Step 1: Build limpio de toda la app**

Run: `cd apps/rrhh && npm run build`
Expected: `✓ Compiled successfully` con todas las rutas listadas (`/login`, `/admin/empleados`, `/admin/empleados/[id]`, `/admin/solicitudes`, `/e`, etc.).

- [ ] **Step 2: Confirmar que no quedan estilos inline en los archivos tocados**

Run: `cd apps/rrhh && grep -rn "style={{" app components || echo "OK: sin estilos inline"`
Expected: `OK: sin estilos inline` (o solo coincidencias en archivos fuera del alcance de este plan, si los hubiera).

- [ ] **Step 3: Push de la rama**

```bash
git push -u origin claude/bold-ride-s4s8eq
```

- [ ] **Step 4: Verificación visual en la preview**

Abrir la preview de Vercel `central-rrhh` (URL en el PR #276) y comprobar: login con tarjeta + wordmark, panel admin con sidebar teal, expediente con cartas, portal del empleado con cartas y chat tipo WhatsApp en teal. Si todo se ve correcto, la tarea está completa.

---

## Self-Review (hecho por el autor del plan)

- **Cobertura del spec:** tokens (T1-2), fuentes (T3), wordmark (T4), icono PWA (T5), layout admin sidebar (T6), login (T7), 3 pantallas admin (T8-10), chat (T11), solicitudes empleado (T12), push (T13), portal empleado (T14). White-label `marca_color` declarado fuera de alcance en las restricciones (no toca datos) — coherente con "no tocar lógica".
- **Sin placeholders:** cada paso incluye el código completo.
- **Consistencia de tipos/nombres:** `AdminShell` usa prop `activo: 'empleados' | 'solicitudes'`, usada igual en T8/T9 (`empleados`) y T10 (`solicitudes`). `Wordmark` recibe `className` opcional, usado en T7/T8/T9/T14. Las clases de color (`text-ok`, `text-alert`, `bg-accent`, `accent-soft`) están todas definidas en `tailwind.config.ts` (T2).
