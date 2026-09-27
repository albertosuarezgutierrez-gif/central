# Consentimiento Unificado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un paquete compartido `@central/core-consent` que sustituye a Cookiebot por un CMP
propio (`vanilla-cookieconsent`) y unifica la analítica gateada por consentimiento en
asegura-web (PostHog), ia-rest (GA4) y housesevillana (GA4 + Meta Pixel).

**Architecture:** Núcleo puro (`puedeCargar`, textos, config de categorías) + adaptadores
por proveedor (funciones que solo tocan `document`/`window` cuando se las llama, nunca al
importarlas) en `packages/core-consent`. Cada app consume el paquete con su propio wiring
mínimo: asegura-web e ia-rest con un componente `'use client'` local (mismo patrón que ya
usa hoy `components/Analitica.tsx` de asegura-web); housesevillana con una función que
devuelve el `<script>` como STRING, porque esa app sirve su HTML entero como un template
literal (`app/route.ts`), no como árbol de componentes React.

**Tech Stack:** TypeScript, `vanilla-cookieconsent` (MIT, primera dependencia npm propia del
paquete, symlinkeada por pnpm igual que `core-push`), Supabase (tabla de auditoría),
`node --test` para las pruebas.

**Corrección respecto a la spec:** la spec (`docs/superpowers/specs/2026-09-14-consentimiento-unificado-design.md`)
proponía un `ConsentBanner.tsx` DENTRO del paquete compartido. Comprobado al mapear archivos:
ningún paquete de `packages/*` tiene hoy un `.tsx` ni React como dependencia, y el
`tsconfig.json` de los paquetes existentes usa `"include": ["src/**/*.ts"]` (sin `.tsx`). Meter
el primer componente React en un paquete "core" rompe ese patrón. Este plan mantiene el
paquete 100% TypeScript puro + vanilla JS; el "pegamento" de React vive en cada app, como ya
ocurre hoy con `components/Analitica.tsx` de asegura-web.

---

## Task Group A — `packages/core-consent`

### Task A1: Scaffold del paquete + núcleo puro (`puedeCargar`)

**Files:**
- Create: `packages/core-consent/package.json`
- Create: `packages/core-consent/tsconfig.json`
- Create: `packages/core-consent/src/consentimiento.ts`
- Test: `packages/core-consent/src/consentimiento.test.ts`

- [ ] **Step 1: Crear el directorio y `package.json`**

```json
{
  "name": "@central/core-consent",
  "version": "0.0.0",
  "private": true,
  "description": "Gestión de consentimiento compartida: núcleo puro fail-closed, textos del banner y adaptadores por proveedor (GA4, PostHog, Meta Pixel) sobre vanilla-cookieconsent. Portable, agnóstico de vertical y de framework — sin React.",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "sideEffects": false,
  "license": "UNLICENSED",
  "dependencies": {
    "vanilla-cookieconsent": "^3.1.0"
  },
  "scripts": {
    "test": "node --test src/*.test.ts"
  }
}
```

- [ ] **Step 2: Crear `tsconfig.json`** (necesita `dom` porque los adaptadores tocan
  `document`/`window`; `core-fiscal` no la lleva, `module-contabilidad` sí — se copia esa)

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["esnext", "dom"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": []
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Escribir el test que falla primero**

`packages/core-consent/src/consentimiento.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puedeCargar } from './consentimiento.ts'

test('sin credencial no carga aunque haya consentimiento', () => {
  assert.equal(puedeCargar({ statistics: true }, { categoria: 'statistics', credencial: '' }), false)
})

test('sin consentimiento (null) no carga', () => {
  assert.equal(puedeCargar(null, { categoria: 'statistics', credencial: 'G-XXX' }), false)
})

test('consentimiento undefined en la categoría no carga (no es un sí)', () => {
  assert.equal(puedeCargar({ marketing: true }, { categoria: 'statistics', credencial: 'G-XXX' }), false)
})

test('consentimiento explícitamente denegado no carga', () => {
  assert.equal(puedeCargar({ statistics: false }, { categoria: 'statistics', credencial: 'G-XXX' }), false)
})

test('con credencial y consentimiento true en la categoría, carga', () => {
  assert.equal(puedeCargar({ statistics: true }, { categoria: 'statistics', credencial: 'G-XXX' }), true)
})

test('categorías distintas no se cruzan: marketing true no habilita statistics', () => {
  assert.equal(
    puedeCargar({ marketing: true, statistics: false }, { categoria: 'statistics', credencial: 'G-XXX' }),
    false
  )
})
```

- [ ] **Step 4: Ejecutar y comprobar que falla**

Run: `cd packages/core-consent && node --test src/consentimiento.test.ts`
Expected: FAIL — `Cannot find module './consentimiento.ts'` (el archivo aún no existe)

- [ ] **Step 5: Implementación mínima**

`packages/core-consent/src/consentimiento.ts`:

```ts
// Núcleo puro del consentimiento. Generaliza puedeMedir() de asegura-web (una sola
// categoría, statistics) a un mapa de categorías — housesevillana necesita `marketing`
// para el Meta Pixel de retargeting, que no es medición interna.
//
// La regla de fondo no cambia: sin credencial no hay nada que arrancar, y `undefined` en
// el consentimiento es «aún no ha contestado», nunca un sí.

export type Categoria = 'statistics' | 'marketing'

export type Consentimiento = Partial<Record<Categoria, boolean>>

export type ConfigProveedor = {
  categoria: Categoria
  /** Credencial pública del proveedor (id de GA4, key de PostHog, id de Meta Pixel...). */
  credencial: string
}

export function puedeCargar(
  consentimiento: Consentimiento | null | undefined,
  config: ConfigProveedor
): boolean {
  if (!config.credencial) return false
  return consentimiento?.[config.categoria] === true
}
```

- [ ] **Step 6: Ejecutar y comprobar que pasa**

Run: `cd packages/core-consent && node --test src/consentimiento.test.ts`
Expected: PASS — 6 tests, 0 fallos

- [ ] **Step 7: Commit**

```bash
git add packages/core-consent/package.json packages/core-consent/tsconfig.json \
  packages/core-consent/src/consentimiento.ts packages/core-consent/src/consentimiento.test.ts
git commit -m "feat(core-consent): núcleo puro puedeCargar(), fail-closed por categoría"
```

---

### Task A2: Textos del banner (ES/EN/IT)

**Files:**
- Create: `packages/core-consent/src/textos.ts`
- Test: `packages/core-consent/src/textos.test.ts`

- [ ] **Step 1: Escribir el test que falla primero**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TEXTOS_BANNER } from './textos.ts'

const IDIOMAS = ['es', 'en', 'it'] as const

test('los tres idiomas existen', () => {
  for (const idioma of IDIOMAS) assert.ok(TEXTOS_BANNER[idioma], `falta ${idioma}`)
})

test('los tres idiomas declaran las mismas claves (ningún hueco de traducción)', () => {
  const claves = (idioma: (typeof IDIOMAS)[number]) => Object.keys(TEXTOS_BANNER[idioma]).sort()
  const base = claves('es')
  for (const idioma of IDIOMAS) assert.deepEqual(claves(idioma), base, `${idioma} no cubre las mismas claves que es`)
})

test('ningún texto está vacío', () => {
  for (const idioma of IDIOMAS) {
    for (const [clave, valor] of Object.entries(TEXTOS_BANNER[idioma])) {
      assert.ok(valor.trim().length > 0, `${idioma}.${clave} está vacío`)
    }
  }
})
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `cd packages/core-consent && node --test src/textos.test.ts`
Expected: FAIL — `Cannot find module './textos.ts'`

- [ ] **Step 3: Implementación**

`packages/core-consent/src/textos.ts`:

```ts
// Textos legales del banner. Los tres idiomas se escriben desde el principio porque
// housesevillana los necesita los tres — sus /en y /it se derivan de la misma plantilla por
// diccionario de cadenas exactas (ver apps/housesevillana/CLAUDE.md), y un banner solo en
// español ahí rompería la coherencia de idioma de la página. asegura-web e ia-rest solo usan `es`.

export type TextosIdioma = {
  titulo: string
  descripcion: string
  aceptarTodo: string
  rechazarTodo: string
  gestionarPreferencias: string
  guardarPreferencias: string
  categoriaNecesaria: string
  categoriaNecesariaDescripcion: string
  categoriaStatistics: string
  categoriaStatisticsDescripcion: string
  categoriaMarketing: string
  categoriaMarketingDescripcion: string
}

export const TEXTOS_BANNER: Record<'es' | 'en' | 'it', TextosIdioma> = {
  es: {
    titulo: 'Usamos cookies',
    descripcion: 'Usamos cookies para medir las visitas y, si lo aceptas, para mostrarte anuncios relevantes. Puedes cambiar de opinión cuando quieras.',
    aceptarTodo: 'Aceptar todo',
    rechazarTodo: 'Rechazar todo',
    gestionarPreferencias: 'Gestionar preferencias',
    guardarPreferencias: 'Guardar preferencias',
    categoriaNecesaria: 'Necesarias',
    categoriaNecesariaDescripcion: 'Imprescindibles para que la web funcione. No se pueden desactivar.',
    categoriaStatistics: 'Estadística',
    categoriaStatisticsDescripcion: 'Nos ayudan a saber qué páginas se visitan más.',
    categoriaMarketing: 'Marketing',
    categoriaMarketingDescripcion: 'Se usan para mostrarte anuncios relevantes en otras webs.',
  },
  en: {
    titulo: 'We use cookies',
    descripcion: 'We use cookies to measure visits and, if you accept, to show you relevant ads. You can change your mind at any time.',
    aceptarTodo: 'Accept all',
    rechazarTodo: 'Reject all',
    gestionarPreferencias: 'Manage preferences',
    guardarPreferencias: 'Save preferences',
    categoriaNecesaria: 'Necessary',
    categoriaNecesariaDescripcion: 'Essential for the website to work. They cannot be disabled.',
    categoriaStatistics: 'Statistics',
    categoriaStatisticsDescripcion: 'Help us understand which pages are visited the most.',
    categoriaMarketing: 'Marketing',
    categoriaMarketingDescripcion: 'Used to show you relevant ads on other websites.',
  },
  it: {
    titulo: 'Utilizziamo i cookie',
    descripcion: 'Utilizziamo i cookie per misurare le visite e, se accetti, per mostrarti annunci pertinenti. Puoi cambiare idea in qualsiasi momento.',
    aceptarTodo: 'Accetta tutto',
    rechazarTodo: 'Rifiuta tutto',
    gestionarPreferencias: 'Gestisci preferenze',
    guardarPreferencias: 'Salva preferenze',
    categoriaNecesaria: 'Necessari',
    categoriaNecesariaDescripcion: 'Essenziali per il funzionamento del sito. Non possono essere disattivati.',
    categoriaStatistics: 'Statistiche',
    categoriaStatisticsDescripcion: 'Ci aiutano a capire quali pagine vengono visitate di più.',
    categoriaMarketing: 'Marketing',
    categoriaMarketingDescripcion: 'Usati per mostrarti annunci pertinenti su altri siti web.',
  },
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `cd packages/core-consent && node --test src/textos.test.ts`
Expected: PASS — 3 tests, 0 fallos

- [ ] **Step 5: Commit**

```bash
git add packages/core-consent/src/textos.ts packages/core-consent/src/textos.test.ts
git commit -m "feat(core-consent): textos del banner en ES/EN/IT, con cepo de paridad de claves"
```

---

### Task A3: Adaptadores por proveedor (parte pura)

**Files:**
- Create: `packages/core-consent/src/adaptadores.ts`
- Test: `packages/core-consent/src/adaptadores.test.ts`

Cada adaptador se parte en dos: una función PURA que construye la URL/config (testeada) y
una función que hace el efecto (`document.createElement`, `window.posthog.init`...), que NO
se testea a nivel unitario — mismo criterio que hoy `components/Analitica.tsx` de
asegura-web, donde solo `puedeMedir()` tiene test y el `useEffect` que toca el DOM no.

- [ ] **Step 1: Escribir el test que falla primero**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { urlScriptGa4, urlScriptPostHog, urlScriptMetaPixel } from './adaptadores.ts'

test('urlScriptGa4 usa el id tal cual', () => {
  assert.equal(urlScriptGa4('G-EN2YQLRLEX'), 'https://www.googletagmanager.com/gtag/js?id=G-EN2YQLRLEX')
})

test('urlScriptPostHog usa el host por defecto (nube EU, nunca la de EE. UU. por defecto)', () => {
  assert.equal(urlScriptPostHog(), 'https://eu.i.posthog.com/static/array.js')
})

test('urlScriptPostHog quita barras finales del host', () => {
  assert.equal(urlScriptPostHog('https://eu.i.posthog.com///'), 'https://eu.i.posthog.com/static/array.js')
})

test('urlScriptMetaPixel es constante, no depende del id (el id va en el init, no en la URL)', () => {
  assert.equal(urlScriptMetaPixel(), 'https://connect.facebook.net/en_US/fbevents.js')
})
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `cd packages/core-consent && node --test src/adaptadores.test.ts`
Expected: FAIL — `Cannot find module './adaptadores.ts'`

- [ ] **Step 3: Implementación**

`packages/core-consent/src/adaptadores.ts`:

```ts
// Adaptadores por proveedor. Las funciones `urlScript*` son puras (testeadas); las
// `cargar*`/`apagar*` tocan el DOM y solo se llaman cuando puedeCargar() ya dio verde —
// nunca al importar este módulo, para que no quepa la posibilidad de dispararse por un `if`
// mal escrito en otro sitio.

export function urlScriptGa4(id: string): string {
  return `https://www.googletagmanager.com/gtag/js?id=${id}`
}

/** Host de ingesta de PostHog. Por defecto la nube EUROPEA: un defecto EE.UU. sacaría datos
 * de visitantes del EEE fuera sin que nada fallara. */
export function urlScriptPostHog(host: string = 'https://eu.i.posthog.com'): string {
  return `${host.replace(/\/+$/, '')}/static/array.js`
}

export function urlScriptMetaPixel(): string {
  return 'https://connect.facebook.net/en_US/fbevents.js'
}

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    fbq?: ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown }
    posthog?: {
      init: (key: string, opciones: Record<string, unknown>) => void
      capture: (evento: string, props?: Record<string, unknown>) => void
      opt_out_capturing: () => void
      reset: (borrarId?: boolean) => void
    }
  }
}

/** Carga GA4. Sin función de parada: gtag.js no ofrece un opt_out limpio por script suelto,
 * así que el gate real es no cargar el script — igual que ya asumía asegura-web con PostHog. */
export function cargarGa4(id: string): void {
  const s1 = document.createElement('script')
  s1.async = true
  s1.src = urlScriptGa4(id)
  document.head.appendChild(s1)

  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args)
  }
  window.gtag('js', new Date())
  window.gtag('config', id)
}

/** Carga Meta Pixel. Mismo criterio que GA4: sin parada limpia, el gate es no cargar. */
export function cargarMetaPixel(id: string): void {
  if (window.fbq) return
  const n: typeof window.fbq = Object.assign(
    function (...args: unknown[]) {
      ;(n.queue as unknown[]).push(args)
    },
    { queue: [] as unknown[], loaded: true, version: '2.0' }
  )
  window.fbq = n
  const s = document.createElement('script')
  s.async = true
  s.src = urlScriptMetaPixel()
  document.head.appendChild(s)
  window.fbq('init', id)
  window.fbq('track', 'PageView')
}

/** Arranca PostHog. Refleja components/Analitica.tsx de asegura-web tal cual: pageview
 * manual (App Router no recarga en la navegación), perfiles anónimos, sin grabación de
 * sesión (los formularios de estas webs piden datos personales). */
export function arrancarPostHog(key: string, host: string, alTerminar: () => void): void {
  const s = document.createElement('script')
  s.src = urlScriptPostHog(host)
  s.async = true
  s.onload = () => {
    if (!window.posthog) return
    window.posthog.init(key, {
      api_host: host,
      capture_pageview: false,
      capture_pageleave: true,
      person_profiles: 'identified_only',
      disable_session_recording: true,
    })
    window.posthog.capture('$pageview')
    alTerminar()
  }
  document.head.appendChild(s)
}

export function apagarPostHog(): void {
  if (!window.posthog) return
  window.posthog.opt_out_capturing()
  window.posthog.reset(true)
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `cd packages/core-consent && node --test src/adaptadores.test.ts`
Expected: PASS — 4 tests, 0 fallos

- [ ] **Step 5: Commit**

```bash
git add packages/core-consent/src/adaptadores.ts packages/core-consent/src/adaptadores.test.ts
git commit -m "feat(core-consent): adaptadores GA4/PostHog/Meta Pixel, gate por no-cargar"
```

---

### Task A4: Config del banner (vanilla-cookieconsent) + barril `index.ts`

**Files:**
- Create: `packages/core-consent/src/banner.ts`
- Test: `packages/core-consent/src/banner.test.ts`
- Create: `packages/core-consent/src/index.ts`

- [ ] **Step 1: Escribir el test que falla primero**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configBanner } from './banner.ts'

test('declara las tres categorías, necessary readOnly', () => {
  const cfg = configBanner('es')
  assert.equal(cfg.categories.necessary.readOnly, true)
  assert.ok('statistics' in cfg.categories)
  assert.ok('marketing' in cfg.categories)
})

test('el idioma por defecto de la config es el pedido', () => {
  assert.equal(configBanner('en').language.default, 'en')
  assert.equal(configBanner('it').language.default, 'it')
})

test('las traducciones incluyen el título correcto por idioma', () => {
  const cfg = configBanner('es')
  assert.equal(cfg.language.translations.es.consentModal.title, 'Usamos cookies')
})
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `cd packages/core-consent && node --test src/banner.test.ts`
Expected: FAIL — `Cannot find module './banner.ts'`

- [ ] **Step 3: Implementación**

`packages/core-consent/src/banner.ts`:

```ts
// Construye la config de vanilla-cookieconsent (https://cookieconsent.orestbida.com) a
// partir de nuestros textos. Función pura: no llama a CookieConsent.run() aquí, eso lo hace
// quien consuma el paquete (ver ConsentBanner.tsx de cada app, o el snippet vanilla de
// housesevillana) — así esta pieza se puede testear sin navegador.
import { TEXTOS_BANNER, type TextosIdioma } from './textos.ts'

type Idioma = 'es' | 'en' | 'it'

function traduccion(t: TextosIdioma) {
  return {
    consentModal: {
      title: t.titulo,
      description: t.descripcion,
      acceptAllBtn: t.aceptarTodo,
      acceptNecessaryBtn: t.rechazarTodo,
      showPreferencesBtn: t.gestionarPreferencias,
    },
    preferencesModal: {
      title: t.gestionarPreferencias,
      acceptAllBtn: t.aceptarTodo,
      acceptNecessaryBtn: t.rechazarTodo,
      savePreferencesBtn: t.guardarPreferencias,
      sections: [
        { title: t.categoriaNecesaria, description: t.categoriaNecesariaDescripcion, linkedCategory: 'necessary' },
        { title: t.categoriaStatistics, description: t.categoriaStatisticsDescripcion, linkedCategory: 'statistics' },
        { title: t.categoriaMarketing, description: t.categoriaMarketingDescripcion, linkedCategory: 'marketing' },
      ],
    },
  }
}

export function configBanner(idioma: Idioma) {
  return {
    categories: {
      necessary: { enabled: true, readOnly: true },
      statistics: {},
      marketing: {},
    },
    language: {
      default: idioma,
      translations: {
        es: traduccion(TEXTOS_BANNER.es),
        en: traduccion(TEXTOS_BANNER.en),
        it: traduccion(TEXTOS_BANNER.it),
      },
    },
  }
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `cd packages/core-consent && node --test src/banner.test.ts`
Expected: PASS — 3 tests, 0 fallos

- [ ] **Step 5: Barril `index.ts`**

`packages/core-consent/src/index.ts`:

```ts
export { puedeCargar, type Categoria, type Consentimiento, type ConfigProveedor } from './consentimiento.ts'
export { TEXTOS_BANNER, type TextosIdioma } from './textos.ts'
export { configBanner } from './banner.ts'
export {
  urlScriptGa4,
  urlScriptPostHog,
  urlScriptMetaPixel,
  cargarGa4,
  cargarMetaPixel,
  arrancarPostHog,
  apagarPostHog,
} from './adaptadores.ts'
```

- [ ] **Step 6: Ejecutar TODOS los tests del paquete**

Run: `cd packages/core-consent && npm test` (o `pnpm --filter @central/core-consent test`)
Expected: PASS — 16 tests, 0 fallos (6 de A1 + 3 de A2 + 4 de A3 + 3 de A4)

- [ ] **Step 7: Commit**

```bash
git add packages/core-consent/src/banner.ts packages/core-consent/src/banner.test.ts \
  packages/core-consent/src/index.ts
git commit -m "feat(core-consent): config del banner vanilla-cookieconsent + barril público"
```

---

## Task Group E — Registro de auditoría (Supabase)

Se hace ANTES de tocar apps porque asegura-web (Task Group B) ya lo necesita.

### Task E1: Tabla `consentimiento_registro`

**Files:**
- Create: `apps/plataforma/prisma/sql/2026-09-14_consentimiento_registro.sql`

- [ ] **Step 1: Escribir la migración** (idempotente, sin PII — solo qué app, qué categorías
  y cuándo; es la prueba de que el banner se mostró y se actuó, no un rastreo de personas)

```sql
-- consentimiento_registro — prueba de qué se aceptó/rechazó y cuándo, sustituye al registro
-- que daba Cookiebot. SIN PII a propósito: ni IP, ni user-agent, ni identificador de persona.
-- Aplicar como postgres por el Supabase MCP. Idempotente.

CREATE TABLE IF NOT EXISTS public.consentimiento_registro (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app        text        NOT NULL CHECK (app IN ('asegura-web', 'ia-rest', 'housesevillana')),
  categorias jsonb       NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consentimiento_registro_app_creado_idx
  ON public.consentimiento_registro (app, creado_en DESC);

ALTER TABLE public.consentimiento_registro ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Aplicar la migración**

Con el Supabase MCP (`apply_migration`, proyecto `wswbehlcuxqxyinousql`), **solo con el "ok"
explícito de Alberto para esta migración concreta** (regla del repo). Antes de aplicar,
comprobar con `list_tables` que no existe ya una tabla `consentimiento_registro` con un
esquema distinto (la landmine del `CREATE TABLE IF NOT EXISTS` silencioso).

- [ ] **Step 3: Rol de escritura por app**

Cada app necesita permiso de `INSERT` únicamente (nunca `SELECT`/`UPDATE`/`DELETE` desde el
cliente público). Antes de decidir el rol exacto por app, comprobar en el plan de cada
integración (Tasks B, C, D) qué rol Prisma usa hoy esa app contra la Supabase compartida —
si ya tiene uno con `INSERT` de sobra en `public`, se reutiliza; si no, se crea uno mínimo
`GRANT INSERT ON public.consentimiento_registro TO <rol>;` en la misma migración antes de
aplicarla.

- [ ] **Step 4: Commit**

```bash
git add apps/plataforma/prisma/sql/2026-09-14_consentimiento_registro.sql
git commit -m "feat(db): tabla consentimiento_registro, sin PII, sustituye el registro de Cookiebot"
```

---

## Task Group B — asegura-web (URGENTE: antes de que caduque el trial de Cookiebot, ~19/09/2026)

### Task B1: Dependencia del paquete

**Files:**
- Modify: `apps/asegura-web/package.json`

- [ ] **Step 1: Añadir la dependencia**

```json
"@central/core-consent": "workspace:*",
```

(en el bloque `dependencies`, junto a `"@central/brand": "workspace:*"`)

- [ ] **Step 2: Instalar**

Run: `npx --yes pnpm@10.33.0 install --no-frozen-lockfile` desde la raíz del repo
Expected: `pnpm-lock.yaml` se actualiza, symlink de `@central/core-consent` creado en
`node_modules/@central/`

- [ ] **Step 3: Commit**

```bash
git add apps/asegura-web/package.json pnpm-lock.yaml
git commit -m "chore(asegura-web): añadir dependencia @central/core-consent"
```

### Task B2: Endpoint de registro de consentimiento

**Files:**
- Create: `apps/asegura-web/app/api/consentimiento/route.ts`

- [ ] **Step 1: Implementación** (fire-and-forget desde el cliente; nunca bloquea la
  navegación si falla)

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma' // ajustar al cliente Prisma real de asegura-web

export async function POST(req: Request) {
  const { categorias } = await req.json().catch(() => ({ categorias: null }))
  if (!categorias || typeof categorias !== 'object') {
    return NextResponse.json({ error: 'categorias inválidas' }, { status: 400 })
  }
  await prisma.$executeRaw`
    INSERT INTO public.consentimiento_registro (app, categorias)
    VALUES ('asegura-web', ${JSON.stringify(categorias)}::jsonb)
  `
  return NextResponse.json({ ok: true })
}
```

Nota de verificación: confirmar en el momento de implementar cuál es el import real del
cliente Prisma de `apps/asegura-web` (`grep -r "from '@/lib/prisma'" apps/asegura-web` o
equivalente) — este paso usa un placeholder de import que debe ajustarse al patrón real de
la app, no al de otra.

- [ ] **Step 2: Commit**

```bash
git add apps/asegura-web/app/api/consentimiento/route.ts
git commit -m "feat(asegura-web): endpoint de registro de consentimiento (fire-and-forget)"
```

### Task B3: Sustituir Cookiebot por el paquete

**Files:**
- Modify: `apps/asegura-web/lib/analitica.ts`
- Modify: `apps/asegura-web/components/Analitica.tsx`
- Modify: `apps/asegura-web/lib/analitica.test.ts`

- [ ] **Step 1: Reescribir `lib/analitica.ts`** — ya no hay `COOKIEBOT_ID` (el CMP es propio,
  no depende de una credencial externa); se reexporta lo del paquete configurado con las
  envs de esta app

```ts
// Analítica de la web pública: PostHog SOLO con consentimiento, gestionado por nuestro
// propio banner (@central/core-consent), no por Cookiebot.
export { puedeCargar, configBanner, arrancarPostHog, apagarPostHog } from '@central/core-consent'

export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || ''
export const POSTHOG_HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com').replace(/\/+$/, '')
```

- [ ] **Step 2: Actualizar `lib/analitica.test.ts`** — ya no testea `puedeMedir` (vive y se
  testea en el paquete), testea que esta app configura bien sus envs

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puedeCargar } from './analitica.ts'

test('re-exporta puedeCargar del paquete compartido, no una copia local', () => {
  assert.equal(typeof puedeCargar, 'function')
  assert.equal(puedeCargar(null, { categoria: 'statistics', credencial: 'x' }), false)
})
```

- [ ] **Step 3: Reescribir `components/Analitica.tsx`**

```tsx
'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import * as CookieConsent from 'vanilla-cookieconsent'
import 'vanilla-cookieconsent/dist/cookieconsent.css'
import {
  puedeCargar,
  configBanner,
  arrancarPostHog,
  apagarPostHog,
  POSTHOG_KEY,
  POSTHOG_HOST,
} from '@/lib/analitica'

const CONFIG = { categoria: 'statistics' as const, credencial: POSTHOG_KEY }

export default function Analitica() {
  const pathname = usePathname()
  const arrancado = useRef(false)

  useEffect(() => {
    if (!POSTHOG_KEY) return

    function revisar() {
      const acepta = CookieConsent.acceptedCategory('statistics')
      if (puedeCargar({ statistics: acepta }, CONFIG) && !arrancado.current) {
        arrancarPostHog(POSTHOG_KEY, POSTHOG_HOST, () => {
          arrancado.current = true
        })
      } else if (!acepta && arrancado.current) {
        apagarPostHog()
        arrancado.current = false
      }
    }

    CookieConsent.run({
      ...configBanner('es'),
      onFirstConsent: revisar,
      onConsent: revisar,
      onChange: revisar,
    })
  }, [])

  useEffect(() => {
    if (!arrancado.current || !window.posthog) return
    window.posthog.capture('$pageview')
  }, [pathname])

  return null
}

export function renovarConsentimiento() {
  CookieConsent.showPreferences()
}
```

- [ ] **Step 4: Registrar el consentimiento (POST fire-and-forget)** — añadir dentro de
  `revisar()`, tras `CookieConsent.run(...)`, tal que cada `onConsent`/`onChange` también
  llame:

```ts
      fetch('/api/consentimiento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categorias: CookieConsent.getUserPreferences().acceptedCategories }),
      }).catch(() => {})
```

(dentro de `revisar()`, después de decidir arrancar/apagar — un fallo de red aquí nunca
bloquea la navegación, por eso el `.catch(() => {})` sin más)

- [ ] **Step 5: Quitar el script de Cookiebot y la env `NEXT_PUBLIC_COOKIEBOT_ID`**

Buscar en `apps/asegura-web/app/layout.tsx` (o donde esté) el `<script id="Cookiebot" ...>` y
eliminarlo — el banner ahora lo monta `<Analitica />` en cliente. Marcar
`NEXT_PUBLIC_COOKIEBOT_ID` como obsoleta en `lib/secrets-registry.ts` de `apps/plataforma`
(no se borra la fila del registro sin más — se anota que ya no la usa ninguna app, para que
`/operador/secretos` no la siga listando como viva sin que nadie lo sepa).

- [ ] **Step 6: Correr los tests**

Run: `cd apps/asegura-web && node --test lib/analitica.test.ts`
Expected: PASS

- [ ] **Step 7: Typecheck**

Run: `cd apps/asegura-web && pnpm exec tsc --noEmit`
Expected: 0 errores

- [ ] **Step 8: Commit**

```bash
git add apps/asegura-web/lib/analitica.ts apps/asegura-web/lib/analitica.test.ts \
  apps/asegura-web/components/Analitica.tsx apps/asegura-web/app/layout.tsx \
  apps/plataforma/lib/secrets-registry.ts
git commit -m "feat(asegura-web): sustituir Cookiebot por @central/core-consent (trial caduca ~19/09)"
```

### Task B4: Guardián — nada de PostHog sin condición

**Files:**
- Create: `apps/asegura-web/test/regression-analitica-fail-closed.test.ts`

- [ ] **Step 1: Escribir el guardián, leyendo el fuente (no importando — `Analitica.tsx`
  arrastra `'use client'` y hooks de React que `node --test` no resuelve sin un DOM)**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf-8')
const analitica = readFileSync(new URL('../components/Analitica.tsx', import.meta.url), 'utf-8')

test('layout.tsx no tiene NINGÚN script de Cookiebot ni de PostHog suelto', () => {
  assert.ok(!/Cookiebot/.test(layout), 'quedó un rastro de Cookiebot en layout.tsx')
  assert.ok(!/posthog/i.test(layout), 'PostHog no debe cargarse desde layout.tsx directamente')
})

test('Analitica.tsx arranca PostHog SOLO dentro de la comprobación de consentimiento', () => {
  assert.ok(/puedeCargar/.test(analitica), 'el componente debe usar puedeCargar() para decidir')
  assert.ok(/arrancarPostHog/.test(analitica), 'debe usar el adaptador del paquete, no un init suelto')
})
```

- [ ] **Step 2: Ejecutar y comprobar que pasa**

Run: `cd apps/asegura-web && node --test test/regression-analitica-fail-closed.test.ts`
Expected: PASS

- [ ] **Step 3: Romperlo a propósito y ver el rojo** (regla del repo: un cepo no cuenta si no
  se le ha visto fallar)

Comentar temporalmente la línea `if (!POSTHOG_KEY) return` de `Analitica.tsx` — no cambia
nada de lo que el test mira. En su lugar, para ver el rojo de verdad: añadir temporalmente
`<script src="https://eu.i.posthog.com/static/array.js"></script>` a `app/layout.tsx`.

Run: `cd apps/asegura-web && node --test test/regression-analitica-fail-closed.test.ts`
Expected: **FAIL** — `PostHog no debe cargarse desde layout.tsx directamente`

Deshacer el cambio temporal (`git checkout -- apps/asegura-web/app/layout.tsx`), volver a
correr y confirmar que vuelve a PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/asegura-web/test/regression-analitica-fail-closed.test.ts
git commit -m "test(asegura-web): guardián — PostHog nunca sin puedeCargar(), visto fallar"
```

---

## Task Group C — ia-rest (GA4 sin consentimiento hoy)

### Task C1: Dependencia + wiring

**Files:**
- Modify: `apps/ia-rest/package.json`
- Create: `apps/ia-rest/src/components/ConsentimientoAnalitica.tsx`
- Modify: `apps/ia-rest/src/app/layout.tsx:194-201` (bloque actual de GA4 suelto)

- [ ] **Step 1: Añadir dependencia**

```json
"@central/core-consent": "workspace:*",
```

Run: `npx --yes pnpm@10.33.0 install --no-frozen-lockfile` desde la raíz.

- [ ] **Step 2: Crear el componente de wiring**

`apps/ia-rest/src/components/ConsentimientoAnalitica.tsx`:

```tsx
'use client'
import { useEffect } from 'react'
import * as CookieConsent from 'vanilla-cookieconsent'
import 'vanilla-cookieconsent/dist/cookieconsent.css'
import { puedeCargar, configBanner, cargarGa4 } from '@central/core-consent'

const GA4_ID = 'G-EN2YQLRLEX'
const CONFIG = { categoria: 'statistics' as const, credencial: GA4_ID }
let arrancado = false

export default function ConsentimientoAnalitica() {
  useEffect(() => {
    function revisar() {
      const acepta = CookieConsent.acceptedCategory('statistics')
      if (puedeCargar({ statistics: acepta }, CONFIG) && !arrancado) {
        cargarGa4(GA4_ID)
        arrancado = true
      }
      fetch('/api/consentimiento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categorias: CookieConsent.getUserPreferences().acceptedCategories }),
      }).catch(() => {})
    }

    CookieConsent.run({
      ...configBanner('es'),
      onFirstConsent: revisar,
      onConsent: revisar,
      onChange: revisar,
    })
  }, [])

  return null
}
```

(GA4 no tiene parada limpia — igual que documenta `adaptadores.ts` — así que aquí no hay
rama de apagado; retirar el consentimiento deja de cargarlo en la SIGUIENTE visita, no en
caliente. Coherente con que gtag no expone un `opt_out` fiable sin su propia extensión.)

- [ ] **Step 3: Quitar el script suelto de `src/app/layout.tsx:194-201`**

Borrar:

```tsx
{/* Google Analytics 4 — G-EN2YQLRLEX */}
<script async src="https://www.googletagmanager.com/gtag/js?id=G-EN2YQLRLEX" />
<script dangerouslySetInnerHTML={{ __html: `
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-EN2YQLRLEX', { page_path: window.location.pathname });
`}} />
```

Sustituir por, dentro de `<body>` (no en `<head>` — es un componente cliente):

```tsx
<ConsentimientoAnalitica />
```

Y el `import` correspondiente arriba del archivo:

```tsx
import ConsentimientoAnalitica from '@/components/ConsentimientoAnalitica'
```

- [ ] **Step 4: Endpoint de registro** (mismo patrón que Task B2, para `ia-rest`)

`apps/ia-rest/src/app/api/consentimiento/route.ts` — mismo contenido que B2 cambiando
`'asegura-web'` por `'ia-rest'` en el INSERT, y ajustando el import de Prisma al cliente real
de ia-rest.

- [ ] **Step 5: Typecheck**

Run: `cd apps/ia-rest && pnpm exec tsc --noEmit`
Expected: 0 errores

- [ ] **Step 6: Commit**

```bash
git add apps/ia-rest/package.json apps/ia-rest/src/components/ConsentimientoAnalitica.tsx \
  apps/ia-rest/src/app/layout.tsx apps/ia-rest/src/app/api/consentimiento/route.ts
git commit -m "feat(ia-rest): GA4 gateado por consentimiento, ya no carga sin condición"
```

### Task C2: Guardián

**Files:**
- Create: `apps/ia-rest/src/test/regression-ga4-fail-closed.test.ts` (o el directorio de
  tests que ya use ia-rest — comprobar convención real del proyecto al implementar)

- [ ] **Step 1: Guardián por lectura de fuente**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf-8')

test('layout.tsx no tiene el script de GA4 suelto (debe vivir dentro del adaptador gateado)', () => {
  assert.ok(!/googletagmanager\.com\/gtag\/js/.test(layout), 'quedó un <script> de GA4 sin condición')
})

test('layout.tsx monta el componente de consentimiento', () => {
  assert.ok(/ConsentimientoAnalitica/.test(layout))
})
```

- [ ] **Step 2: Verlo en rojo antes de darlo por bueno** — restaurar temporalmente el bloque
  de GA4 borrado en C1 Step 3, correr el test, confirmar **FAIL**, deshacer, confirmar PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/ia-rest/src/test/regression-ga4-fail-closed.test.ts
git commit -m "test(ia-rest): guardián — GA4 nunca sin condición, visto fallar"
```

---

## Task Group D — housesevillana (GA4 + Meta Pixel sin consentimiento hoy)

La más laboriosa: multi-idioma, dos proveedores, y `app/route.ts` sirve el HTML entero como
STRING (sin árbol de componentes) — ver `apps/housesevillana/CLAUDE.md`.

### Task D1: Dependencia + snippet vanilla en el paquete

**Files:**
- Modify: `apps/housesevillana/package.json`
- Create: `packages/core-consent/src/snippetVanilla.ts`
- Test: `packages/core-consent/src/snippetVanilla.test.ts`

- [ ] **Step 1: Añadir dependencia** (primera vez que esta app declara un `@central/*`)

```json
"@central/core-consent": "workspace:*",
```

Run: `npx --yes pnpm@10.33.0 install --no-frozen-lockfile` desde la raíz.

- [ ] **Step 2: Comprobar que `scripts/vercel-ignore-build.mjs` reconoce la dependencia
  nueva** — leyendo `packages/vercel-ignore-build.mjs` (o `scripts/`), confirmar que calcula
  el cierre transitivo de `@central/*` a partir de `package.json` (no de una lista fija). Si
  es así, no hace falta tocar nada más; si es una lista fija, añadir `housesevillana` a la
  entrada de `core-consent`.

- [ ] **Step 3: Escribir el test del snippet, que falla primero**

`packages/core-consent/src/snippetVanilla.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarBannerHtml } from './snippetVanilla.ts'

test('el HTML generado no contiene comillas invertidas (rompería el template literal de housesevillana)', () => {
  const html = montarBannerHtml('es')
  assert.ok(!html.includes('`'), 'una comilla invertida en el snippet rompe app/route.ts')
})

test('incluye la carga de la librería vanilla-cookieconsent', () => {
  assert.ok(montarBannerHtml('es').includes('CookieConsent'))
})

test('el idioma pedido queda en la config generada', () => {
  assert.ok(montarBannerHtml('en').includes('"default":"en"') || montarBannerHtml('en').includes("default: 'en'"))
})
```

- [ ] **Step 4: Ejecutar y comprobar que falla**

Run: `cd packages/core-consent && node --test src/snippetVanilla.test.ts`
Expected: FAIL — `Cannot find module './snippetVanilla.ts'`

- [ ] **Step 5: Implementación**

`packages/core-consent/src/snippetVanilla.ts`:

```ts
// housesevillana sirve su HTML entero como un template literal (app/route.ts) — no hay
// árbol de componentes React ahí. Esta función devuelve el bloque <script> como STRING,
// para interpolarlo en ese template exactamente como hoy se interpolan los scripts sueltos
// de GA4 y Meta Pixel. Sin comillas invertidas: rompería el template literal que lo aloja
// (ver apps/housesevillana/CLAUDE.md).
import { configBanner } from './banner.ts'

export function montarBannerHtml(idioma: 'es' | 'en' | 'it'): string {
  const config = JSON.stringify(configBanner(idioma))
  return [
    '<script src="https://cdn.jsdelivr.net/gh/orestbida/cookieconsent@3/dist/cookieconsent.umd.js"></script>',
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orestbida/cookieconsent@3/dist/cookieconsent.css">',
    '<script>',
    `window.CookieConsent.run(${config});`,
    '</script>',
  ].join('\n')
}
```

- [ ] **Step 6: Ejecutar y comprobar que pasa**

Run: `cd packages/core-consent && node --test src/snippetVanilla.test.ts`
Expected: PASS — 3 tests, 0 fallos

- [ ] **Step 7: Exportarlo desde el barril**

Añadir a `packages/core-consent/src/index.ts`:

```ts
export { montarBannerHtml } from './snippetVanilla.ts'
```

- [ ] **Step 8: Commit**

```bash
git add apps/housesevillana/package.json packages/core-consent/src/snippetVanilla.ts \
  packages/core-consent/src/snippetVanilla.test.ts packages/core-consent/src/index.ts
git commit -m "feat(core-consent): snippet vanilla del banner para apps sin árbol de componentes"
```

### Task D2: Gatear GA4 y Meta Pixel en `app/route.ts`

**Files:**
- Modify: `apps/housesevillana/app/route.ts:371-376`

- [ ] **Step 1: Sustituir el bloque incondicional actual**

Antes (líneas 371-376, tal como quedó confirmado leyendo el archivo en esta sesión):

```html
</style>
<!-- Meta Pixel retargeting -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','12124662686780882173');fbq('track','PageView');
</script>
```

Después: el bloque de GA4/Meta Pixel se borra de aquí sin más — ya no van incondicionales.
En su lugar, importar `montarBannerHtml` arriba del archivo:

```ts
import { montarBannerHtml } from '@central/core-consent'
```

Y en la construcción de `HTML` (donde antes iba el bloque borrado), interpolar:

```
${montarBannerHtml('es')}
<script>
window.addEventListener('cc:onConsent', cargarProveedoresConsentidos);
window.addEventListener('cc:onChange', cargarProveedoresConsentidos);
function cargarProveedoresConsentidos(e) {
  var cats = (e.detail && e.detail.cookie && e.detail.cookie.categories) || [];
  if (cats.indexOf('statistics') > -1 && !window.__ga4Cargado) {
    window.__ga4Cargado = true;
    var s1 = document.createElement('script');
    s1.async = true; s1.src = 'https://www.googletagmanager.com/gtag/js?id=G-N5CMQL9C4M';
    document.head.appendChild(s1);
    window.dataLayer = window.dataLayer || [];
    function gtag(){window.dataLayer.push(arguments);}
    gtag('js', new Date()); gtag('config', 'G-N5CMQL9C4M');
  }
  if (cats.indexOf('marketing') > -1 && !window.__fbqCargado) {
    window.__fbqCargado = true;
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init','12124662686780882173');fbq('track','PageView');
  }
  fetch('/api/consentimiento', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({categorias: cats})}).catch(function(){});
}
</script>
```

**Sin comillas invertidas** en ninguno de estos dos bloques — se comprueba en el Step 3 del
guardián de Task D3. `vanilla-cookieconsent` dispara los eventos DOM `cc:onConsent` /
`cc:onChange` en `window` (además de los callbacks JS del `run()`), que es la vía correcta
para engancharse desde un script suelto como este, sin depender del objeto de configuración
que ya se pasó en `montarBannerHtml`.

Nota de verificación al implementar: confirmar contra la documentación instalada de
`vanilla-cookieconsent` (`node_modules/vanilla-cookieconsent`) el nombre exacto de estos
eventos DOM y la forma de `event.detail` antes de dar este bloque por bueno — no se ha
verificado en un navegador real dentro de este plan.

- [ ] **Step 2: Repetir para `/en` y `/it`** si esos routes tienen su propio bloque de
  scripts (comprobar `app/en/route.ts` y `app/it/route.ts` — por lo visto en
  `apps/housesevillana/CLAUDE.md`, `motor.ts` deriva el CUERPO por diccionario pero cada
  `route.ts` de idioma escribe sus propios `<title>`/`meta`/`og:`; confirmar si también
  duplica el bloque de scripts de analítica o lo hereda del español antes de tocar nada).
  Si cada idioma tiene su propio bloque, `montarBannerHtml('en')` / `montarBannerHtml('it')`
  respectivamente.

- [ ] **Step 3: Ejecutar los tests existentes de la app** (no deben romperse por este cambio)

Run: `cd apps/housesevillana && npm test`
Expected: PASS — en particular `app/i18n/traducciones.test.ts` no debe quejarse (este cambio
no toca ningún texto en español del cuerpo, solo el bloque de scripts)

- [ ] **Step 4: Commit**

```bash
git add apps/housesevillana/app/route.ts
git commit -m "feat(housesevillana): GA4 y Meta Pixel gateados por consentimiento"
```

### Task D3: Guardián + endpoint

**Files:**
- Create: `apps/housesevillana/app/consentimiento.test.ts`
- Create: `apps/housesevillana/app/api/consentimiento/route.ts` (o el mecanismo de API que
  ya use esta app — comprobar si tiene rutas de API hoy; si no tiene NINGUNA y toda la BD es
  ajena por diseño ["esta app no tiene BD ni secretos", según su CLAUDE.md], considerar en su
  lugar reenviar el registro al endpoint YA existente de `apps/plataforma`
  —`/api/publico/...`— en vez de montarle una API propia. **Decisión a tomar al implementar,
  no asumida aquí**: housesevillana se diseñó explícitamente sin BD propia.)

- [ ] **Step 1: Guardián por lectura de texto** (mismo criterio que sus tests existentes:
  `route.ts` arrastra `next/server`, así que se lee como texto, no se importa)

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../app/route.ts', import.meta.url), 'utf-8')

test('route.ts no tiene el fbq(init) de Meta Pixel FUERA del bloque gateado', () => {
  const antesDelGate = route.split('cc:onConsent')[0]
  assert.ok(!/fbq\('init'/.test(antesDelGate), 'Meta Pixel se inicializa antes de comprobar el consentimiento')
})

test('route.ts monta el snippet del banner (montarBannerHtml)', () => {
  assert.ok(/montarBannerHtml/.test(route))
})

test('ningún bloque de script tiene comillas invertidas (rompería el template literal del HTML)', () => {
  const bloques = route.match(/<script>[\s\S]*?<\/script>/g) || []
  for (const bloque of bloques) assert.ok(!bloque.includes('`'), 'comilla invertida dentro de un <script>')
})
```

- [ ] **Step 2: Verlo en rojo** — restaurar temporalmente el `fbq('init',...)` incondicional
  de antes de D2, correr el test, confirmar **FAIL** en el primer caso, deshacer, confirmar
  PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/housesevillana/app/consentimiento.test.ts
git commit -m "test(housesevillana): guardián — Meta Pixel/GA4 nunca antes del consentimiento, visto fallar"
```

---

## Verificación final (los tres apps + el paquete)

- [ ] `cd packages/core-consent && npm test` — PASS
- [ ] `cd apps/asegura-web && node --test lib/*.test.ts test/*.test.ts` — PASS
- [ ] `cd apps/asegura-web && pnpm exec tsc --noEmit` — 0 errores
- [ ] `cd apps/ia-rest && pnpm exec tsc --noEmit` — 0 errores
- [ ] `cd apps/housesevillana && npm test` — PASS
- [ ] `pnpm test` desde la raíz — 0 fallos en el resto del monorepo (nada debería haberse
  roto fuera de estas tres apps y el paquete nuevo)
