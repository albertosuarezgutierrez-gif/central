// Guardián: toda ACCIÓN DE SERVIDOR de `/correduria` exige la correduría en su PRIMERA línea
// (`node --test`, gate en CI vía `pnpm test:guardia`).
//
// ─── Qué pasó (02/11/2026) ───────────────────────────────────────────────────
// Una acción de servidor (`'use server'`) es un endpoint POST propio: se ejecuta ANTES del
// layout y no pasa por él, y el middleware solo exige *alguna* sesión. `pedirCotizacionPack`
// (POST /insurances real, 0,50€) y siete lecturas de tarificaciones guardadas, catálogos,
// coberturas y el relé `product-form` no llamaban a la puerta: cualquier cuenta con sesión de
// plataforma (rol `empresas`, otras verticales, invitados) podía usarlas con ids que manda el
// navegador. Las rutas `/api/correduria/**` ya las vigila `regression-correduria-autorizacion`.
//
// Qué exige: en cada fichero con `'use server'` bajo `app/(usuario)/correduria`, cada export
// es `export async function` y su cuerpo EMPIEZA por
//   const g = await exigirCorreduria(); if (!g.ok) return …
// o por la variante local
//   const b = await sinAccesoCorreduria(); if (b) return …
// y ese `sinAccesoCorreduria` llama de verdad a `resolverAccesoCorreduria`.
//
// Lee el FUENTE (no importa los módulos): el job de guardián corre sin `prisma generate`, y
// una acción sin guarda compila igual que una con ella.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const BASE = join(RAIZ, 'apps', 'plataforma', 'app', '(usuario)', 'correduria')

/** Quita comentarios sin romper las cadenas (los comentarios EXPLICAN la regla y no deben contar). */
function sinComentarios(src: string): string {
  let out = ''
  let i = 0
  let comilla: string | null = null
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (comilla) {
      if (c === '\\') { out += c + (d ?? ''); i += 2; continue }
      if (c === comilla) comilla = null
      out += c; i++; continue
    }
    if (c === '"' || c === "'" || c === '`') { comilla = c; out += c; i++; continue }
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && d === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    out += c; i++
  }
  return out
}

/** Ficheros `.ts`/`.tsx` bajo /correduria cuya PRIMERA sentencia es `'use server'`. */
function ficherosUseServer(): string[] {
  const out: string[] = []
  const recorrer = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) recorrer(p)
      else if (/\.tsx?$/.test(e.name) && /^\s*['"]use server['"]/.test(sinComentarios(readFileSync(p, 'utf8')))) {
        out.push(p.slice(RAIZ.length + 1))
      }
    }
  }
  recorrer(BASE)
  return out.sort()
}

/** Índice del `{` que abre el cuerpo de la función cuyos parámetros empiezan en `abre` (el `(`). */
function inicioCuerpo(src: string, abre: number): number {
  let i = abre
  let paren = 0
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break } }
  }
  // Tipo de retorno: `{` dentro de `<…>`, `(…)` o `[…]` es tipo, no cuerpo.
  let angulo = 0
  let otros = 0
  for (; i < src.length; i++) {
    const c = src[i]
    if (c === '=' && src[i + 1] === '>') { i++; continue }
    if (c === '<') angulo++
    else if (c === '>') angulo--
    else if (c === '(' || c === '[') otros++
    else if (c === ')' || c === ']') otros--
    else if (c === '{') {
      if (angulo === 0 && otros === 0) {
        const previo = src.slice(0, i).trimEnd().slice(-1)
        if (previo !== ':' && previo !== '|' && previo !== '&' && previo !== ',') return i
      }
      // Literal de objeto en el tipo: saltarlo entero.
      let prof = 0
      for (; i < src.length; i++) {
        if (src[i] === '{') prof++
        else if (src[i] === '}') { prof--; if (prof === 0) break }
      }
    }
  }
  return -1
}

const GUARDA_EXIGIR = /^\{\s*const\s+(\w+)\s*=\s*await\s+exigirCorreduria\(\)\s*;?\s*if\s*\(\s*!\s*\1\.ok\s*\)\s*return\b/
const GUARDA_LOCAL = /^\{\s*const\s+(\w+)\s*=\s*await\s+sinAccesoCorreduria\(\)\s*;?\s*if\s*\(\s*\1\s*\)\s*return\b/

type Hallazgo = { fichero: string; problema: string }

function revisar(fichero: string): { exportadas: number; hallazgos: Hallazgo[] } {
  const src = sinComentarios(readFileSync(join(RAIZ, fichero), 'utf8'))
  const hallazgos: Hallazgo[] = []
  let exportadas = 0

  // Cualquier export de VALOR que no sea `export async function` se escapa del análisis: prohibido.
  for (const m of src.matchAll(/^export\s+(?!type\b|interface\b|async\s+function\b)(.{0,40})/gm)) {
    hallazgos.push({ fichero, problema: `export no analizable: «export ${m[1].trim()}…» (usa export async function)` })
  }

  for (const m of src.matchAll(/^export\s+async\s+function\s+(\w+)\s*(?:<[^>]*>)?\s*\(/gm)) {
    exportadas++
    const nombre = m[1]
    const abre = m.index! + m[0].length - 1
    const cuerpo = inicioCuerpo(src, abre)
    if (cuerpo < 0) { hallazgos.push({ fichero, problema: `${nombre}: no se encuentra el cuerpo` }); continue }
    const resto = src.slice(cuerpo)
    if (GUARDA_EXIGIR.test(resto)) continue
    if (GUARDA_LOCAL.test(resto)) {
      const def = src.match(/async\s+function\s+sinAccesoCorreduria\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/)
      if (!def || !/resolverAccesoCorreduria\(/.test(def[1]) || /^export\s+async\s+function\s+sinAccesoCorreduria/m.test(src)) {
        hallazgos.push({ fichero, problema: `${nombre}: sinAccesoCorreduria() local no llama a resolverAccesoCorreduria (o se exporta)` })
      }
      continue
    }
    hallazgos.push({ fichero, problema: `${nombre}: no empieza por la guarda de la correduría` })
  }
  return { exportadas, hallazgos }
}

test('toda acción de servidor de /correduria exige la correduría en su primera línea', () => {
  const ficheros = ficherosUseServer()
  // Cepo del cepo: si el recorrido dejara de ver ficheros, el test pasaría sobre una lista vacía.
  assert.ok(ficheros.length >= 10, `se esperaban >=10 ficheros 'use server' bajo /correduria, hay ${ficheros.length}`)
  let total = 0
  const hallazgos: Hallazgo[] = []
  for (const f of ficheros) {
    const r = revisar(f)
    total += r.exportadas
    hallazgos.push(...r.hallazgos)
  }
  assert.ok(total >= 35, `se esperaban >=35 acciones exportadas, hay ${total}: ¿se ha roto el análisis?`)
  assert.deepEqual(
    hallazgos,
    [],
    'una acción de servidor es un POST que NO pasa por el layout: sin la guarda la usa cualquier sesión de plataforma',
  )
})

test('el analizador detecta una acción sin guarda (autoprueba)', () => {
  const src = `'use server'
export async function a(x: { id: string }): Promise<{ estado: 'ok' } | { estado: 'error' }> {
  return hacer(x)
}
export async function b(): Promise<R> {
  const g = await exigirCorreduria()
  if (!g.ok) return { estado: 'error' }
  return hacer()
}
`
  const cuerpoA = inicioCuerpo(src, src.indexOf('a(') + 1)
  const cuerpoB = inicioCuerpo(src, src.indexOf('b(') + 1)
  assert.equal(GUARDA_EXIGIR.test(src.slice(cuerpoA)), false)
  assert.equal(GUARDA_EXIGIR.test(src.slice(cuerpoB)), true)
})

// ─── La llave maestra (`CRON_SECRET`) no abre /correduria ───────────────────
// El pase de crons del middleware dejaba entrar SIN sesión cualquier ruta con `?secret=` o Bearer
// igual a `CRON_SECRET`, también la página de una acción de servidor de la correduría.

const MIDDLEWARE = () => sinComentarios(readFileSync(join(RAIZ, 'apps', 'plataforma', 'middleware.ts'), 'utf8'))

test('middleware: el pase de CRON_SECRET excluye /correduria y /api/correduria', () => {
  const src = MIDDLEWARE()
  const bloque = src.match(/const cronSecret = process\.env\.CRON_SECRET\s*\n\s*if \(([^)]*\)?[^)]*)\)\s*\{/)
  assert.ok(bloque, 'no se encuentra el pase de CRON_SECRET en middleware.ts')
  assert.match(bloque![1], /^cronSecret\s*&&\s*!esRutaCorreduria\(pathname\)$/, 'el pase de CRON_SECRET tiene que excluir la correduría')
  const def = src.match(/function esRutaCorreduria\(pathname: string\): boolean \{\s*return (.*)\n/)
  assert.ok(def, 'falta esRutaCorreduria()')
  const re = new Function('pathname', `return ${def![1]}`) as (p: string) => boolean
  for (const p of ['/correduria', '/correduria/cliente/x/pack', '/api/correduria/cartera-lista']) assert.equal(re(p), true, p)
  for (const p of ['/api/cron/dispatch', '/correduriax', '/api/sivra/correduria']) assert.equal(re(p), false, p)
})

test('middleware: CRON_SECRET se compara en tiempo constante (nunca ===)', () => {
  const src = MIDDLEWARE()
  assert.doesNotMatch(src, /(===|!==|==)\s*cronSecret\b|\bcronSecret\s*(===|!==|==)/, 'comparación directa con CRON_SECRET')
  assert.match(src, /secretoCoincide\(bearer, cronSecret\)/)
  assert.match(src, /secretoCoincide\(qs, cronSecret\)/)
  assert.match(src, /import \{ secretoCoincide \} from '@central\/core-identity'/, 'el helper vive en core-identity (apto edge)')
  assert.ok(!/function igualConstante/.test(src), 'sin copia local del comparador')
})

// ─── Cabecera de la ficha: «cliente» nunca sale de `clientes.tipo` ──────────
test('Cabecera de la ficha: esCliente no lee ficha.tipo y usa esCarteraEnVigor', () => {
  const src = sinComentarios(readFileSync(join(BASE, 'cliente', '[id]', 'Cabecera.tsx'), 'utf8'))
  assert.doesNotMatch(src, /ficha\.tipo\b/, 'cliente = póliza de CIMA en vigor, nunca clientes.tipo')
  const def = src.match(/const esCliente = ([\s\S]*?)\n\s*\/\/|const esCliente = ([\s\S]*?)\)\)\n/)
  assert.ok(def, 'no se encuentra esCliente')
  assert.match(def![0], /esCarteraEnVigor\(/)
})

// ─── La sesión de la trastienda (asegura) no tiene secreto de reserva ───────
test('apps/asegura/lib/auth.ts: el secreto de sesión sale de requireSecret, sin literal ni fallback', () => {
  const src = sinComentarios(readFileSync(join(RAIZ, 'apps', 'asegura', 'lib', 'auth.ts'), 'utf8'))
  assert.match(src, /const SECRET = \(\) => requireSecret\('ASEGURA_SESSION_SECRET'\)\s*\n/, 'SECRET tiene que ser requireSecret sin devFallback')
  assert.doesNotMatch(src, /ASEGURA_SESSION_SECRET\s*\|\|/, 'fallback con ||')
  assert.doesNotMatch(src, /'[^']*secret[^']*change[^']*'/i, 'literal de secreto')
})
