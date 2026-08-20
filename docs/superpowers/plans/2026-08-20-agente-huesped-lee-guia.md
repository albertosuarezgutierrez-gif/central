# Agente de huéspedes: leer la guía real de Smoobu — Plan de implementación (Entrega 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el agente de huéspedes lea la guía real de la guest app de Smoobu (llaves, wifi, normas, parking, basura) en vez de responder sin ninguna fuente sobre la vivienda.

**Architecture:** La guest app es una SPA de React pero su API es JSON y abierta con el token del propio enlace: `GET https://login.smoobu.com/api-guest/bookings/{bookingId}?token={t}` y `.../contents?token={t}`. Se extrae `t`/`b` del `guest-app-url` que ya devuelve la API normal de Smoobu, se normalizan las secciones a texto (conservando enlaces), se filtran por vigencia (`displayTimePeriods` + ventana de 7 días para datos de acceso) y se inyectan en el prompt. Toda la lógica de decisión vive en helpers puros testeables con `node --test`; el I/O queda aislado en dos funciones.

**Tech Stack:** TypeScript, Next.js (apps/plataforma), Prisma `$queryRaw` sobre Supabase, `node --test` (Node 22 ejecuta `.ts` directamente).

**Alcance:** Entrega 1 del spec `docs/superpowers/specs/2026-08-20-agente-huesped-autonomo-design.md` (§3, §5, §10, §11) **más** la ventana de 7 días de §6. La ventana se adelanta a esta entrega a propósito: la categoría `checkin` ya está graduada y auto-envía, así que sin el filtro una pregunta de check-in a tres meses vista podría soltar la caja de llaves sin que nadie lo revise.

**Fuera de esta entrega:** detector de conflictos guía↔override (§4), nueva regla de autonomía (§7), hechos permanentes (§8), minería del histórico (§9).

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `apps/plataforma/lib/sivra/agente-huesped/guest-app.ts` (nuevo) | Todo lo de la guest app: parseo del enlace, normalización de secciones, clasificación acceso/normal, vigencia, y las dos llamadas HTTP. Puro salvo `fetchGuestApp*`. |
| `apps/plataforma/lib/sivra/agente-huesped/guest-app.test.ts` (nuevo) | Tests de los helpers puros, incluido uno contra la forma real de la respuesta. |
| `apps/plataforma/lib/sivra/agente-huesped/guia.ts` (modificar) | Pasa de bajar HTML a usar la API; caché JSON con TTL 24 h; distingue "no hay" de "no se pudo leer". |
| `apps/plataforma/lib/sivra/agente-huesped/contexto.ts` (modificar) | Enchufa las secciones a `ficha`/`guia`; añade `guiaCargada` y `guiaAccesoOculto`; lee `htmlMessage` para conservar enlaces; deduplica automáticos. |
| `apps/plataforma/lib/sivra/agente-huesped/hilo.ts` (modificar) | Sube la ventana del hilo a 25 mensajes. |
| `apps/plataforma/lib/sivra/agente-huesped/decidir.ts` (modificar) | Bloque de guía en el prompt y frase de "una semana antes" cuando hay acceso fuera de ventana. |

---

## Task 1: Parsear el enlace de la guest app

**Files:**
- Create: `apps/plataforma/lib/sivra/agente-huesped/guest-app.ts`
- Test: `apps/plataforma/lib/sivra/agente-huesped/guest-app.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test'
import assert from 'node:assert'
import { parseGuestAppUrl } from './guest-app.ts'

test('extrae token y bookingId del enlace de la guest app', () => {
  assert.deepEqual(
    parseGuestAppUrl('https://guest.smoobu.com/?t=abc123&b=152291091'),
    { token: 'abc123', bookingId: '152291091' },
  )
})

test('acepta los nombres largos de parámetro', () => {
  assert.deepEqual(
    parseGuestAppUrl('https://guest.smoobu.com/?token=abc123&bookingId=99'),
    { token: 'abc123', bookingId: '99' },
  )
})

test('devuelve null si falta el token o la reserva', () => {
  assert.equal(parseGuestAppUrl('https://guest.smoobu.com/?b=1'), null)
  assert.equal(parseGuestAppUrl(''), null)
  assert.equal(parseGuestAppUrl('no-es-una-url'), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/guest-app.test.ts`
Expected: FAIL, no existe el módulo `./guest-app.ts`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/sivra/agente-huesped/guest-app.ts — lectura de la guest app de Smoobu.
//
// La guest app (el enlace que Smoobu manda al huésped) es una SPA de React, así que bajar su HTML
// no sirve de nada: devuelve ~2,8 KB sin texto. Pero su API SÍ es legible. El bundle fija
// `baseURL = https://login.smoobu.com/api-guest` y manda el token del enlace como parámetro
// `token`, así que con la `guest-app-url` de la reserva (que ya trae la API normal de Smoobu)
// tenemos acceso a la guía entera sin API key y sin navegador. Verificado en vivo el 20/08/2026.

export type GuestAppRef = { token: string; bookingId: string }

// Saca `t`/`b` (o `token`/`bookingId`) de la guest-app-url. null si el enlace no sirve.
export function parseGuestAppUrl(url: string): GuestAppRef | null {
  if (!url) return null
  let params: URLSearchParams
  try {
    params = new URL(url).searchParams
  } catch {
    return null
  }
  const token = (params.get('t') || params.get('token') || '').trim()
  const bookingId = (params.get('b') || params.get('bookingId') || '').trim()
  if (!token || !bookingId) return null
  return { token, bookingId }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/guest-app.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/guest-app.ts apps/plataforma/lib/sivra/agente-huesped/guest-app.test.ts
git commit -m "feat(sivra): parsear el enlace de la guest app de Smoobu"
```

---

## Task 2: HTML de la guía a texto, conservando los enlaces

**Files:**
- Modify: `apps/plataforma/lib/sivra/agente-huesped/guest-app.ts`
- Test: `apps/plataforma/lib/sivra/agente-huesped/guest-app.test.ts`

**Por qué conservar los enlaces:** el bug de `[lien d'accès]` del 20/08/2026 salió justo de perderlos. La guía real usa anclas con el texto "HERE"/"AQUÍ" y toda la información está en el `href`.

- [ ] **Step 1: Write the failing test**

```ts
import { htmlATexto } from './guest-app.ts'

test('convierte enlaces a "texto (url)" para no perder la URL', () => {
  const html = '<p>Reserva tu consigna: <b><a href="https://ejemplo.com/x" target="_blank">HERE&nbsp;</a></b></p>'
  assert.equal(htmlATexto(html), 'Reserva tu consigna: HERE (https://ejemplo.com/x)')
})

test('respeta los saltos de párrafo y de línea', () => {
  assert.equal(htmlATexto('<p>uno</p><p>dos<br>tres</p>'), 'uno\ndos\ntres')
})

test('descodifica las entidades más comunes y colapsa espacios', () => {
  assert.equal(htmlATexto('<p>Nº&nbsp;7 &amp;  ss</p>'), 'Nº 7 & ss')
})

test('un enlace sin texto visible deja solo la url', () => {
  assert.equal(htmlATexto('<a href="https://ejemplo.com/v"></a>'), 'https://ejemplo.com/v')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/guest-app.test.ts`
Expected: FAIL, `htmlATexto is not a function`.

- [ ] **Step 3: Write minimal implementation**

Añadir a `guest-app.ts`:

```ts
const ENTIDADES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&aacute;': 'á',
  '&eacute;': 'é', '&iacute;': 'í', '&oacute;': 'ó', '&uacute;': 'ú', '&ntilde;': 'ñ', '&Ntilde;': 'Ñ',
}

// Convierte el HTML de una sección de la guía en texto plano CONSERVANDO las URLs: la guía usa
// anclas con el texto "HERE"/"AQUÍ" y toda la chicha está en el href. Perder el href es lo que
// produjo el "[lien d'accès]" que se le escribió a un huésped el 20/08/2026.
export function htmlATexto(html: string): string {
  let s = html || ''
  s = s.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
  s = s.replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, texto) => {
    const t = texto.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
    return t ? ` ${t} (${href}) ` : ` ${href} `
  })
  s = s.replace(/<\s*br\s*\/?\s*>/gi, '\n')
  s = s.replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
  s = s.replace(/<[^>]+>/g, ' ')
  for (const [ent, ch] of Object.entries(ENTIDADES)) s = s.replaceAll(ent, ch)
  s = s.replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
  s = s.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n')
  return s.trim()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/guest-app.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/guest-app.ts apps/plataforma/lib/sivra/agente-huesped/guest-app.test.ts
git commit -m "feat(sivra): pasar el HTML de la guía a texto sin perder los enlaces"
```

---

## Task 3: Normalizar las secciones que devuelve la API

**Files:**
- Modify: `apps/plataforma/lib/sivra/agente-huesped/guest-app.ts`
- Test: `apps/plataforma/lib/sivra/agente-huesped/guest-app.test.ts`

**Forma real de la respuesta** (capturada el 20/08/2026 del Dúplex; los valores sensibles van cambiados en el fixture, la ESTRUCTURA es la de producción):

```json
[{"id":15587,"title":"WIFI (DUPLEX)","content":"<p>WIFI: red&nbsp; Password:XXXX</p>","displayTimePeriods":[2,4],"icon":"https://login.smoobu.com/img/guest-app/content-icons/icon-53.svg","active":true}]
```

- [ ] **Step 1: Write the failing test**

```ts
import { normalizarSecciones } from './guest-app.ts'

const CRUDO = [
  { id: 15593, title: 'KEYS - DUPLEX', content: '<p>STREET JAVIER LASSO DE LA VEGA Nº 7</p><p>IMPORTANT: RESTRICTED AREA DO NOT USE GOOGLE MAPS OR GPS</p><p><a href="https://ejemplo.com/video">EXPLANATORY VIDEO</a></p>', displayTimePeriods: [2, 4], active: true },
  { id: 15587, title: 'WIFI (DUPLEX)', content: '<p>WIFI: red-de-prueba&nbsp; Password:CLAVE-DE-PRUEBA</p>', displayTimePeriods: [2, 4], active: true },
  { id: 16802, title: 'MEJORES BARES', content: '<p>¿DONDE COMER?</p>', displayTimePeriods: [2, 4, 8], active: true },
  { id: 99999, title: 'SECCIÓN APAGADA', content: '<p>nada</p>', displayTimePeriods: [2], active: false },
]

test('normaliza id, título, texto y periodos, y descarta las inactivas', () => {
  const s = normalizarSecciones(CRUDO)
  assert.equal(s.length, 3)
  assert.equal(s[0].id, '15593')
  assert.equal(s[0].titulo, 'KEYS - DUPLEX')
  assert.match(s[0].texto, /RESTRICTED AREA DO NOT USE GOOGLE MAPS/)
  assert.match(s[0].texto, /EXPLANATORY VIDEO \(https:\/\/ejemplo\.com\/video\)/)
  assert.deepEqual(s[0].periodos, [2, 4])
})

test('aguanta basura sin reventar', () => {
  assert.deepEqual(normalizarSecciones(null), [])
  assert.deepEqual(normalizarSecciones([{ title: '', content: '' }]), [])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/guest-app.test.ts`
Expected: FAIL, `normalizarSecciones is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
export type SeccionGuia = {
  id: string
  titulo: string
  texto: string
  periodos: number[]   // displayTimePeriods de Smoobu: 2 = antes de llegar, 4 = durante, 8 = después
  esAcceso: boolean    // ¿lleva llaves/códigos/contraseñas? (se rellena en clasificarSeccion)
}

// Pasa la respuesta cruda de /contents a secciones utilizables. Descarta las inactivas y las que se
// quedan sin texto. Nunca lanza: una guía mal formada debe degradar a "sin guía", no romper el turno.
export function normalizarSecciones(crudo: unknown): SeccionGuia[] {
  if (!Array.isArray(crudo)) return []
  const out: SeccionGuia[] = []
  for (const c of crudo as any[]) {
    if (!c || c.active === false) continue
    const titulo = String(c.title ?? '').trim()
    const texto = htmlATexto(String(c.content ?? ''))
    if (!titulo && !texto) continue
    if (!texto) continue
    const periodos = Array.isArray(c.displayTimePeriods)
      ? c.displayTimePeriods.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
      : []
    out.push({ id: String(c.id ?? titulo), titulo, texto, periodos, esAcceso: esSeccionDeAcceso(titulo, texto) })
  }
  return out
}
```

(`esSeccionDeAcceso` se implementa en la Task 4; para que este paso compile, añádela ya como stub
`export function esSeccionDeAcceso(_t: string, _x: string): boolean { return false }` y sustitúyela
en la Task 4.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/guest-app.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/guest-app.ts apps/plataforma/lib/sivra/agente-huesped/guest-app.test.ts
git commit -m "feat(sivra): normalizar las secciones de la guía de la guest app"
```

---

## Task 4: Clasificar qué sección es "de acceso"

**Files:**
- Modify: `apps/plataforma/lib/sivra/agente-huesped/guest-app.ts`
- Test: `apps/plataforma/lib/sivra/agente-huesped/guest-app.test.ts`

**Política de Alberto (20/08/2026):** las claves de acceso se dan **una semana antes** de la llegada, con recordatorios, porque un huésped puede reservar y luego cancelar. Esta función decide qué cae bajo esa regla. Ante la duda, `true` (no revelar).

- [ ] **Step 1: Write the failing test**

```ts
import { esSeccionDeAcceso } from './guest-app.ts'

test('marca como acceso las secciones de llaves y códigos', () => {
  assert.equal(esSeccionDeAcceso('KEYS - DUPLEX', 'lockbox 1234'), true)
  assert.equal(esSeccionDeAcceso('LLAVES', 'la caja está en el portal'), true)
  assert.equal(esSeccionDeAcceso('CÓMO ENTRAR', 'el código del portal es 4471'), true)
})

test('marca como acceso cualquier sección con contraseña, aunque el título no lo diga', () => {
  assert.equal(esSeccionDeAcceso('WIFI (DUPLEX)', 'WIFI: red Password:ABCD1234'), true)
})

test('no marca como acceso lo que es información pública del barrio', () => {
  assert.equal(esSeccionDeAcceso('MEJORES BARES', '¿Dónde comer? En la Alfalfa'), false)
  assert.equal(esSeccionDeAcceso('WHERE TO DISPOSE OF THE GARBAGE?', 'Calle Martín Villa'), false)
  assert.equal(esSeccionDeAcceso('RULES', 'No fumar. Check out 11am.'), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/guest-app.test.ts`
Expected: FAIL, el stub devuelve siempre `false`.

- [ ] **Step 3: Write minimal implementation**

Sustituir el stub por:

```ts
// Títulos que son inequívocamente de acceso.
const RE_TITULO_ACCESO = /\b(key|keys|keybox|lockbox|llave|llaves|acceso|access|entrar|entrada|check\s*-?\s*in|c[oó]digo|code|pin|cerradura|portal|wifi)\b/i
// Marcadores de credencial en el cuerpo, aunque el título no lo cante.
const RE_CREDENCIAL = /\b(password|passwd|contrase[nñ]a|clave|c[oó]digo|pin|keybox|lockbox|caja\s+de\s+llaves)\b/i

// ¿Esta sección contiene datos de acceso que NO deben salir hasta 7 días antes de la llegada?
// Ante la duda, true: el coste de callar una norma de la casa una semana es cero, el de soltar la
// caja de llaves a una reserva que se va a cancelar, no.
export function esSeccionDeAcceso(titulo: string, texto: string): boolean {
  return RE_TITULO_ACCESO.test(titulo || '') || RE_CREDENCIAL.test(texto || '')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/guest-app.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/guest-app.ts apps/plataforma/lib/sivra/agente-huesped/guest-app.test.ts
git commit -m "feat(sivra): clasificar las secciones de acceso de la guía"
```

---

## Task 5: Vigencia — periodos de Smoobu + ventana de 7 días

**Files:**
- Modify: `apps/plataforma/lib/sivra/agente-huesped/guest-app.ts`
- Test: `apps/plataforma/lib/sivra/agente-huesped/guest-app.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { seccionesVigentes } from './guest-app.ts'

const S = (titulo: string, periodos: number[], esAcceso: boolean) =>
  ({ id: titulo, titulo, texto: `texto de ${titulo}`, periodos, esAcceso })

const KEYS = S('KEYS', [2, 4], true)
const BARES = S('BARES', [2, 4, 8], false)
const RULES = S('RULES', [2, 4], false)

test('a 3 meses de la llegada oculta el acceso pero deja el resto', () => {
  const r = seccionesVigentes([KEYS, BARES, RULES], { hoy: '2026-05-20', checkIn: '2026-08-20', checkOut: '2026-08-22' })
  assert.deepEqual(r.secciones.map(s => s.titulo), ['BARES', 'RULES'])
  assert.equal(r.accesoOculto, true)
})

test('dentro de la ventana de 7 días ya enseña el acceso', () => {
  const r = seccionesVigentes([KEYS, BARES, RULES], { hoy: '2026-08-15', checkIn: '2026-08-20', checkOut: '2026-08-22' })
  assert.deepEqual(r.secciones.map(s => s.titulo), ['KEYS', 'BARES', 'RULES'])
  assert.equal(r.accesoOculto, false)
})

test('el día 7 justo entra en la ventana', () => {
  const r = seccionesVigentes([KEYS], { hoy: '2026-08-13', checkIn: '2026-08-20', checkOut: '2026-08-22' })
  assert.equal(r.secciones.length, 1)
})

test('durante la estancia sigue enseñando el acceso', () => {
  const r = seccionesVigentes([KEYS, BARES], { hoy: '2026-08-21', checkIn: '2026-08-20', checkOut: '2026-08-22' })
  assert.deepEqual(r.secciones.map(s => s.titulo), ['KEYS', 'BARES'])
})

test('después del check-out cae el acceso y quedan solo las secciones marcadas para después', () => {
  const r = seccionesVigentes([KEYS, BARES, RULES], { hoy: '2026-08-25', checkIn: '2026-08-20', checkOut: '2026-08-22' })
  assert.deepEqual(r.secciones.map(s => s.titulo), ['BARES'])
  assert.equal(r.accesoOculto, false)
})

test('sin periodos declarados la sección se considera siempre vigente', () => {
  const r = seccionesVigentes([S('SIN PERIODOS', [], false)], { hoy: '2026-08-25', checkIn: '2026-08-20', checkOut: '2026-08-22' })
  assert.equal(r.secciones.length, 1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/guest-app.test.ts`
Expected: FAIL, `seccionesVigentes is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
export const DIAS_VENTANA_ACCESO = 7

function aDias(fecha: string): number | null {
  const t = Date.parse(`${fecha}T00:00:00Z`)
  return Number.isFinite(t) ? Math.floor(t / 86400000) : null
}

// Periodo de Smoobu según la fase de la reserva: 2 = antes de llegar, 4 = durante, 8 = después.
function periodoDe(hoy: string, checkIn: string, checkOut: string): number {
  if (checkIn && hoy < checkIn) return 2
  if (checkOut && hoy > checkOut) return 8
  return 4
}

// Filtra las secciones que se le pueden enseñar HOY a este huésped.
// - Vigencia de Smoobu: la propia guest app marca en qué fase enseña cada sección.
// - Ventana de acceso: las llaves/códigos solo desde 7 días antes de la llegada (política de
//   Alberto: se reserva y se cancela, así que no se reparten claves con meses de antelación).
// `accesoOculto` avisa de que SÍ hay secciones de acceso pero aún no toca enseñarlas, para que el
// agente pueda responder "te lo mandamos una semana antes" en vez de callarse o inventar.
export function seccionesVigentes(
  secciones: SeccionGuia[],
  ctx: { hoy: string; checkIn: string; checkOut: string },
): { secciones: SeccionGuia[]; accesoOculto: boolean } {
  const periodo = periodoDe(ctx.hoy, ctx.checkIn, ctx.checkOut)
  const dHoy = aDias(ctx.hoy)
  const dIn = aDias(ctx.checkIn)
  const faltan = dHoy !== null && dIn !== null ? dIn - dHoy : 0
  const dentroVentana = faltan <= DIAS_VENTANA_ACCESO
  let accesoOculto = false
  const vivas = (secciones || []).filter(s => {
    if (s.periodos.length && !s.periodos.includes(periodo)) return false
    if (s.esAcceso && !dentroVentana) { accesoOculto = true; return false }
    return true
  })
  return { secciones: vivas, accesoOculto }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/guest-app.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/guest-app.ts apps/plataforma/lib/sivra/agente-huesped/guest-app.test.ts
git commit -m "feat(sivra): vigencia de las secciones y ventana de 7 días para las claves"
```

---

## Task 6: Render de las secciones al prompt

**Files:**
- Modify: `apps/plataforma/lib/sivra/agente-huesped/guest-app.ts`
- Test: `apps/plataforma/lib/sivra/agente-huesped/guest-app.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { seccionesATexto } from './guest-app.ts'

test('renderiza cada sección con su título como cabecera', () => {
  const txt = seccionesATexto([
    { id: '1', titulo: 'KEYS', texto: 'la caja está en el portal', periodos: [], esAcceso: true },
    { id: '2', titulo: 'RULES', texto: 'no fumar', periodos: [], esAcceso: false },
  ])
  assert.equal(txt, '## KEYS\nla caja está en el portal\n\n## RULES\nno fumar')
})

test('sin secciones devuelve cadena vacía', () => {
  assert.equal(seccionesATexto([]), '')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/guest-app.test.ts`
Expected: FAIL, `seccionesATexto is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// Texto de la guía tal y como lo ve el modelo.
export function seccionesATexto(secciones: SeccionGuia[]): string {
  return (secciones || []).map(s => `## ${s.titulo}\n${s.texto}`).join('\n\n').trim()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/guest-app.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/guest-app.ts apps/plataforma/lib/sivra/agente-huesped/guest-app.test.ts
git commit -m "feat(sivra): renderizar la guía para el prompt del agente"
```

---

## Task 7: Las dos llamadas HTTP a la guest app

**Files:**
- Modify: `apps/plataforma/lib/sivra/agente-huesped/guest-app.ts`

No lleva test unitario: es I/O puro contra un tercero. Se verifica en la Task 11 contra una reserva real.

- [ ] **Step 1: Write the implementation**

```ts
const API_GUEST = 'https://login.smoobu.com/api-guest'
const TIMEOUT_MS = 10_000

async function getJson(url: string): Promise<unknown | null> {
  try {
    const r = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'central-agente-huesped' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!r.ok) {
      console.error(`[guest-app] ${url.replace(/token=[^&]+/, 'token=***')} → HTTP ${r.status}`)
      return null
    }
    return await r.json()
  } catch (e: any) {
    console.error(`[guest-app] fallo de red: ${e?.message}`)
    return null
  }
}

// Guía del huésped (secciones). null = NO SE PUDO LEER (≠ "no hay guía").
export async function fetchGuiaSecciones(ref: GuestAppRef): Promise<SeccionGuia[] | null> {
  const j = await getJson(`${API_GUEST}/bookings/${encodeURIComponent(ref.bookingId)}/contents?token=${encodeURIComponent(ref.token)}`)
  if (j === null) return null
  return normalizarSecciones(j)
}

// Ficha de la reserva según la guest app (dirección postal completa, horas, onlineCheckInUrl).
// null = no se pudo leer.
export async function fetchFichaReserva(ref: GuestAppRef): Promise<Record<string, any> | null> {
  const j = await getJson(`${API_GUEST}/bookings/${encodeURIComponent(ref.bookingId)}?token=${encodeURIComponent(ref.token)}`)
  return j && typeof j === 'object' ? (j as Record<string, any>) : null
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/plataforma && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: sin errores nuevos en `guest-app.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/guest-app.ts
git commit -m "feat(sivra): llamadas a la API de la guest app de Smoobu"
```

---

## Task 8: `guia.ts` pasa a usar la API, con caché y tres estados

**Files:**
- Modify: `apps/plataforma/lib/sivra/agente-huesped/guia.ts`

**Regla que no se puede romper:** `cargada = false` significa "no se pudo leer", y NO autoriza a decir que no hay guía. Es la regla de los tres estados del CLAUDE.md, y aquí es crítica porque la autonomía de la Entrega 3 se apoyará justo en "esto está en la guía".

- [ ] **Step 1: Rewrite the module**

```ts
// lib/sivra/agente-huesped/guia.ts — guía del huésped (guest app de Smoobu) con caché por piso.
//
// Antes esto bajaba el HTML del `guest-app-url`, pero la guest app es una SPA de React: devolvía
// ~2,8 KB sin texto, se descartaba por el umbral de 400 caracteres y `mensajes_guia_cache` llevaba
// CERO filas desde que existe → el agente respondía a los huéspedes sin ninguna fuente sobre la
// vivienda (y se inventaba llaves, rutas y servicios). Ahora se usa la API JSON de la guest app.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { smoobuFetch } from '@/lib/smoobu'
import { parseGuestAppUrl, fetchGuiaSecciones, type SeccionGuia } from './guest-app'

const TTL_MS = 24 * 3600_000

export type GuiaPiso = {
  secciones: SeccionGuia[]
  // false = NO SE PUDO LEER. Nunca lo trates como "no hay guía": ver CLAUDE.md, tres estados.
  cargada: boolean
}

async function getGuestUrl(reservationId: string): Promise<string | null> {
  try {
    const d = await smoobuFetch(`/api/reservations/${reservationId}`, { cache: 'no-store' }).then(r => r.json())
    return d?.['guest-app-url'] || null
  } catch { return null }
}

async function leerCache(propertyId: string): Promise<{ secciones: SeccionGuia[]; fresca: boolean } | null> {
  const rows = await prisma.$queryRaw<{ contenido: string; fetched_at: Date }[]>(Prisma.sql`
    SELECT contenido, fetched_at FROM mensajes_guia_cache WHERE property_id = ${propertyId}
  `).catch(() => [])
  const row = rows[0]
  if (!row) return null
  try {
    const secciones = JSON.parse(row.contenido)
    if (!Array.isArray(secciones)) return null
    return { secciones, fresca: Date.now() - new Date(row.fetched_at).getTime() < TTL_MS }
  } catch { return null }   // caché antigua en texto plano: se ignora y se re-descarga
}

async function guardarCache(propertyId: string, secciones: SeccionGuia[], url: string): Promise<void> {
  const json = JSON.stringify(secciones)
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_guia_cache (property_id, contenido, fuente_url, fetched_at)
    VALUES (${propertyId}, ${json}, ${url}, now())
    ON CONFLICT (property_id) DO UPDATE SET contenido = ${json}, fuente_url = ${url}, fetched_at = now()
  `).catch(() => {})
}

// Guía del piso. Caché de 24 h; si la descarga falla se usa la caché vieja (mejor una guía de ayer
// que ninguna) y solo se marca `cargada=false` cuando no hay NADA que ofrecer.
export async function getGuiaPiso(propertyId: string, reservationId: string): Promise<GuiaPiso> {
  const cache = await leerCache(propertyId)
  if (cache?.fresca) return { secciones: cache.secciones, cargada: true }

  const url = await getGuestUrl(reservationId)
  const ref = url ? parseGuestAppUrl(url) : null
  if (!ref) return { secciones: cache?.secciones ?? [], cargada: !!cache }

  const secciones = await fetchGuiaSecciones(ref)
  if (secciones === null) return { secciones: cache?.secciones ?? [], cargada: !!cache }

  await guardarCache(propertyId, secciones, url as string)
  return { secciones, cargada: true }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/plataforma && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'guia\.ts|contexto\.ts' | head -20`
Expected: solo errores en `contexto.ts` por el cambio de tipo de retorno (se arreglan en la Task 9).

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/guia.ts
git commit -m "feat(sivra): la guía del huésped se lee de la API de la guest app"
```

---

## Task 9: Enchufar la guía al contexto

**Files:**
- Modify: `apps/plataforma/lib/sivra/agente-huesped/contexto.ts`

- [ ] **Step 1: Update the type**

En el `export type Contexto`, sustituir `guia: string | null` por:

```ts
  guia: string | null           // texto de la guía YA filtrado por vigencia (null = no hay nada que enseñar)
  guiaCargada: boolean          // false = no se pudo leer. NO significa "no hay guía" (CLAUDE.md, tres estados)
  guiaAccesoOculto: boolean     // hay secciones de llaves/códigos pero aún no toca (faltan >7 días)
```

- [ ] **Step 2: Update the import and the call**

Sustituir `import { getGuiaPiso } from './guia'` por:

```ts
import { getGuiaPiso } from './guia'
import { seccionesVigentes, seccionesATexto } from './guest-app'
```

Y sustituir la línea `const guia = await getGuiaPiso(propertyId, bookingId)` por:

```ts
  // Guía real del piso (guest app), filtrada por lo que HOY se le puede enseñar a este huésped:
  // vigencia de Smoobu + ventana de 7 días para llaves y códigos.
  const guiaPiso = await getGuiaPiso(propertyId, bookingId)
  const hoyMadrid = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
  const vigentes = seccionesVigentes(guiaPiso.secciones, {
    hoy: hoyMadrid,
    checkIn: String(reserva?.arrival || ''),
    checkOut: String(reserva?.departure || ''),
  })
  const guia = seccionesATexto(vigentes.secciones) || null
```

- [ ] **Step 3: Update the return**

En el `return`, sustituir `direccion, ficha, guia, historial, enviados, aprendizajes,` por:

```ts
    direccion, ficha, guia, guiaCargada: guiaPiso.cargada, guiaAccesoOculto: vigentes.accesoOculto,
    historial, enviados, aprendizajes,
```

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/plataforma && npx tsc --noEmit -p tsconfig.json 2>&1 | grep 'agente-huesped' | head -20`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/contexto.ts
git commit -m "feat(sivra): el contexto del agente incluye la guía real del piso"
```

---

## Task 10: El prompt usa la guía y sabe decir "te lo mandamos una semana antes"

**Files:**
- Modify: `apps/plataforma/lib/sivra/agente-huesped/decidir.ts`

- [ ] **Step 1: Add the access-window block**

En `decidir()`, justo después de `const faseBlock = ...`, añadir:

```ts
  // Falta más de una semana para la llegada y el huésped pregunta por llaves/códigos: la política es
  // mandarlos una semana antes (se reserva y se cancela). No es un hueco de información — es la
  // respuesta correcta, y la promete la propia plantilla de confirmación de Smoobu.
  const accesoBlock = ctx.guiaAccesoOculto
    ? `\nCLAVES DE ACCESO: aún NO se le pueden dar las instrucciones de entrada porque faltan más de 7 días para su llegada. Si pregunta por llaves, códigos o cómo entrar, dile con naturalidad que le enviaremos toda la información para recoger las llaves UNA SEMANA ANTES de su llegada. NO te inventes códigos, cajas de llaves ni instrucciones de acceso, y NO le digas que no lo sabes.`
    : ''
```

- [ ] **Step 2: Inject it into the system prompt**

Localizar la plantilla del system prompt que ya contiene `${ctx.guia ? `\nGUÍA DEL HUÉSPED:\n${ctx.guia}` : ''}` (línea ~203) y añadir `${accesoBlock}` inmediatamente después de esa interpolación.

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/plataforma && npx tsc --noEmit -p tsconfig.json 2>&1 | grep 'agente-huesped' | head -20`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/decidir.ts
git commit -m "feat(sivra): el agente sabe que las claves se dan una semana antes"
```

---

## Task 11: Conservar los enlaces y deduplicar los automáticos del hilo

**Files:**
- Modify: `apps/plataforma/lib/sivra/agente-huesped/contexto.ts`
- Modify: `apps/plataforma/lib/sivra/agente-huesped/hilo.ts`
- Test: `apps/plataforma/lib/sivra/agente-huesped/hilo.test.ts`

**Por qué:** en el hilo de la reserva 152291091, de 25 mensajes **8 eran duplicados exactos** (Smoobu manda cada automático dos veces) y ocupaban las 15 ranuras de contexto; y el texto plano de esos automáticos trae los "AQUÍ"/"HERE" sin su URL, que es lo que produjo el `[lien d'accès]`.

**Bug extra descubierto al capturar la respuesta real:** los mensajes de Smoobu traen la fecha en
`createdAt` (camelCase), pero `contexto.ts` lee `m.created_at` → **el `ts` de TODOS los mensajes del
historial está vacío**. Eso deja mudo el guard anti-duplicado `ya_respondido` (compara la fecha del
último mensaje del huésped con la de nuestras respuestas) y explica en parte los borradores
repetidos del 20/08/2026: tres propuestas para la misma pregunta «Nous pouvons venir maintenant ?».
El `m.created_at || m.createdAt` del paso 5 lo arregla.

- [ ] **Step 1: Write the failing test**

```ts
import { dedupHilo } from './hilo.ts'

const M = (from: 'guest' | 'host', text: string, ts: string) => ({ id: `${text}-${ts}`, from, text, ts })

test('quita el automático duplicado que manda Smoobu por partida doble', () => {
  const out = dedupHilo([
    M('host', 'Booking Confirmation', '2026-08-20 13:30:20'),
    M('host', 'Booking Confirmation', '2026-08-20 13:30:20'),
    M('guest', 'gracias', '2026-08-20 13:31:00'),
  ])
  assert.equal(out.length, 2)
})

test('no toca una repetición legítima horas después', () => {
  const out = dedupHilo([
    M('guest', '¿hola?', '2026-08-20 10:00:00'),
    M('guest', '¿hola?', '2026-08-20 14:00:00'),
  ])
  assert.equal(out.length, 2)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/hilo.test.ts`
Expected: FAIL, `dedupHilo is not a function`.

- [ ] **Step 3: Implement `dedupHilo` in `hilo.ts`**

```ts
const VENTANA_DUP_MS = 120_000

// Smoobu manda CADA mensaje automático por duplicado (en el hilo de la reserva 152291091, 8 de 25
// mensajes eran copias) y esos duplicados se comían la ventana de contexto. Quitamos un mensaje si
// ya hubo otro idéntico, del mismo emisor, en los 2 minutos anteriores: mata las copias sin tocar a
// un huésped que repite su pregunta una hora después.
export function dedupHilo(historial: MensajeHist[]): MensajeHist[] {
  const vistos: { clave: string; t: number }[] = []
  const out: MensajeHist[] = []
  for (const m of historial || []) {
    const clave = `${m.from}|${(m.text || '').trim().toLowerCase()}`
    const t = Date.parse((m.ts || '').replace(' ', 'T'))
    const dup = vistos.some(v => v.clave === clave && (!Number.isFinite(t) || Math.abs(t - v.t) <= VENTANA_DUP_MS))
    if (dup) continue
    vistos.push({ clave, t: Number.isFinite(t) ? t : 0 })
    out.push(m)
  }
  return out
}
```

Y cambiar la firma de `hiloComoMensajes` para que la ventana por defecto sea 25 en vez de 15:

```ts
  max = 25,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/hilo.test.ts`
Expected: PASS, todos los tests (los 3 que ya había más los 2 nuevos).

- [ ] **Step 5: Use `htmlMessage` and `dedupHilo` in `contexto.ts`**

Sustituir el bloque `const historialRaw: MensajeHist[] = msgRaw.map(...)` por:

```ts
  // El texto PLANO de Smoobu (`message`) se come los enlaces: los automáticos traen anclas con el
  // texto "AQUÍ"/"HERE" y la URL solo está en `htmlMessage`. Leer el plano es lo que hizo que el
  // agente le escribiera "[lien d'accès]" a un huésped teniendo el enlace delante (20/08/2026).
  const historialRaw: MensajeHist[] = msgRaw.map(m => {
    const html = String(m.htmlMessage || '')
    const cuerpo = html ? htmlATexto(html) : strip(m.message || m.text || '')
    const asunto = String(m.subject || '').trim()
    return {
      id: String(m.id || m.created_at || ''),
      from: atribuirEmisor(m),
      text: asunto ? `${asunto}\n${cuerpo}`.trim() : cuerpo,
      ts: m.created_at || m.createdAt || '',
    }
  }).filter(m => m.text)
```

Añadir a los imports de `contexto.ts`:

```ts
import { htmlATexto } from './guest-app'
import { dedupHilo } from './hilo'
```

Y sustituir `const historial = corregirAtribucion(historialRaw, enviados)` por:

```ts
  const historial = dedupHilo(corregirAtribucion(historialRaw, enviados))
```

- [ ] **Step 6: Run the whole suite**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/`
Expected: PASS, sin fallos.

- [ ] **Step 7: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/hilo.ts apps/plataforma/lib/sivra/agente-huesped/hilo.test.ts apps/plataforma/lib/sivra/agente-huesped/contexto.ts
git commit -m "fix(sivra): conservar los enlaces del hilo y deduplicar los automáticos de Smoobu"
```

---

## Task 12: Verificación contra la reserva real

**Files:** ninguno (comprobación)

- [ ] **Step 1: Run the full test suite and the type check**

Run: `cd apps/plataforma && node --test lib/sivra/agente-huesped/ && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c error`
Expected: tests en verde y cero errores de tipos nuevos.

- [ ] **Step 2: Regression check against the real guide**

Comprobar con la guía real del Dúplex (10 secciones) que:
- La sección `KEYS - DUPLEX` sale clasificada como acceso.
- Con `hoy` a más de 7 días del `checkIn`, no aparece en el texto del prompt y `accesoOculto` es `true`.
- El aviso "RESTRICTED AREA DO NOT USE GOOGLE MAPS OR GPS" **sí** aparece cuando la reserva está dentro de la ventana: es exactamente lo que el agente no supo contestar el 20/08/2026.
- El enlace del vídeo explicativo aparece como URL, no como "EXPLANATORY VIDEO" a secas.

- [ ] **Step 3: Commit and push**

```bash
git push -u origin claude/guest-agent-smoobu-info-h5fl8e
```

---

## Notas de seguridad

- La guía contiene contraseñas de wifi e instrucciones de la caja de llaves. **No** se escriben en
  tests, fixtures, documentación ni mensajes de commit: los tests usan valores de pinta realista pero
  falsos.
- El token de la guest app va en la URL. En los logs se enmascara (`token=***`).
- La caché vive en nuestra Supabase, en `mensajes_guia_cache`, que ya existía y no es pública.
