#!/usr/bin/env node
// Grafo de código PROPIO del monorepo (Node puro, sin dependencias: el workflow lo corre sin
// `pnpm install`, igual que auditar-estructura.mjs). Sustituye la parte de Graphify que se usa a
// diario —¿quién importa/llama a qué, qué archivos toca modificar uno dado, radio de impacto,
// qué tests cubren un archivo— con dos tablas en Supabase (`grafo_nodos`, `grafo_aristas`) que se
// consultan por SQL (ver .claude/skills/code-map/SKILL.md). NO sustituye `query_graph` semántico
// ni la memoria (`remember`): eso exige embeddings y no compensa.
//
// Aproximado A PROPÓSITO (regex, sin compilador): los `import`/`export … from` son sintaxis
// simple y se resuelven bien; las llamadas se detectan como `nombre(` / `<Nombre` sobre nombres
// IMPORTADOS de archivos del repo o declarados en el propio archivo, atribuidas a la función de
// primer nivel cuyo rango (inicio → siguiente declaración) contiene la línea. Lo que NO ve:
// llamadas por variable intermedia, imports dinámicos con cadenas calculadas, y `/*` dentro de un
// string literal (abre un comentario falso). Antes de fiarte de un «nadie llama a X», lee el código (misma regla que
// con Graphify). La precisión se midió contra Graphify el 12/09/2026: ver docs/USO-HERRAMIENTAS.md.
//
// Uso:  node scripts/grafo-codigo.mjs [--out <ruta.json>] [--stats]
// Exporta funciones puras (extraerGrafo, resolverImport, …) para test/grafo-codigo.test.ts.

import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXTS = ['.ts', '.tsx', '.mjs', '.js', '.jsx']
const RESOLVE_TRY = ['', '.ts', '.tsx', '.js', '.mjs', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.mjs']
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.turbo', '.vercel', 'generated', 'coverage', '.git'])

// ── Recorrido ──────────────────────────────────────────────────────────────────

/** Archivos de código de apps/* y packages/* (+ scripts/ y test/ de la raíz). */
export function listarArchivos(root = ROOT) {
  const out = []
  const walk = (dir, rel) => {
    let entries = []
    try { entries = readdirSync(dir) } catch { return }
    for (const e of entries) {
      if (SKIP_DIRS.has(e) || e.startsWith('.')) continue
      const full = join(dir, e)
      const r = rel ? `${rel}/${e}` : e
      let st
      try { st = statSync(full) } catch { continue }
      if (st.isDirectory()) walk(full, r)
      else if (EXTS.some(x => e.endsWith(x)) && !/\.d\.ts$/.test(e) && !/\.generated\./.test(e)) {
        try { out.push({ rel: r, text: readFileSync(full, 'utf8') }) } catch { /* skip */ }
      }
    }
  }
  for (const top of ['apps', 'packages', 'scripts', 'test']) walk(join(root, top), top)
  return out
}

/** Alias `@/*` por app, leído de su tsconfig (ia-rest apunta a `src/`, el resto a la raíz de la app). */
export function leerAliases(root = ROOT) {
  const alias = {}
  let apps = []
  try { apps = readdirSync(join(root, 'apps')) } catch { return alias }
  for (const app of apps) {
    const p = join(root, 'apps', app, 'tsconfig.json')
    if (!existsSync(p)) continue
    try {
      const json = JSON.parse(readFileSync(p, 'utf8').replace(/^\s*\/\/.*$/mg, '').replace(/,\s*([}\]])/g, '$1'))
      const target = json?.compilerOptions?.paths?.['@/*']?.[0] ?? './*'
      alias[`apps/${app}`] = posix.normalize(`apps/${app}/${target.replace(/^\.\//, '').replace(/\/?\*$/, '')}`).replace(/\/$/, '')
    } catch { alias[`apps/${app}`] = `apps/${app}` }
  }
  return alias
}

// ── Resolución de imports ──────────────────────────────────────────────────────

/** Ámbito (app o package) de una ruta repo-relativa: 'apps/plataforma', 'packages/core-ai', 'scripts'. */
export function ambitoDe(rel) {
  const m = rel.match(/^(apps|packages)\/([^/]+)/)
  return m ? `${m[1]}/${m[2]}` : rel.split('/')[0]
}

/**
 * Resuelve el especificador de un import a una ruta del repo, o null si es externo/no existe.
 * `existe` decide qué rutas son archivos reales (Set de rutas o función).
 */
export function resolverImport(spec, desde, existe, alias = {}) {
  const has = typeof existe === 'function' ? existe : (r) => existe.has(r)
  const probar = (base) => {
    const b = posix.normalize(base)
    for (const t of RESOLVE_TRY) if (has(b + t)) return b + t
    return null
  }
  if (spec.startsWith('.')) return probar(posix.join(posix.dirname(desde), spec))
  if (spec.startsWith('@/')) {
    const amb = ambitoDe(desde)
    return probar(`${alias[amb] ?? amb}/${spec.slice(2)}`)
  }
  const m = spec.match(/^@central\/([^/]+)(?:\/(.+))?$/)
  if (m) {
    const pkg = `packages/${m[1]}`
    if (m[2]) return probar(`${pkg}/src/${m[2]}`) ?? probar(`${pkg}/${m[2]}`)
    return probar(`${pkg}/src/index`) ?? probar(`${pkg}/index`)
  }
  return null
}

// ── Análisis de un archivo ─────────────────────────────────────────────────────

/** Quita comentarios (bloque y línea) conservando los saltos de línea → los números de línea no cambian. */
export function sinComentarios(text) {
  // UNA sola pasada con alternancia: el comentario que EMPIEZA antes gana. En dos pasadas, un `/*`
  // dentro de un `// …` (p. ej. «bajo `/motorcycle/*`») abría un bloque falso que se tragaba código
  // real hasta el siguiente `*/` (medido: 15 declaraciones perdidas en ≥10 archivos, 12/09/2026).
  return text.replace(/\/\*[\s\S]*?\*\/|(^|[^:\\'"`])\/\/[^\n]*/g, (m, pre) => {
    if (m.startsWith('/*')) return m.replace(/[^\n]/g, ' ')
    return pre + ' '.repeat(m.length - pre.length)
  })
}

const DECL_RES = [
  { tipo: 'funcion', re: /^(export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/ },
  { tipo: 'clase', re: /^(export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/ },
  { tipo: 'const', re: /^(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+?)?=/ },
]

const EXPORT_LOCAL_RE = /(?:^|\n)[ \t]*export\s*\{([^}]*)\}\s*(?:;|\n|$)/g

/** `export { a, b as c }` SIN `from`: [{ local:'b', exportado:'c' }]. Lo que se exporta así se declaró (o importó) en el mismo archivo. */
export function exportsLocales(text) {
  const out = []
  let m
  EXPORT_LOCAL_RE.lastIndex = 0
  while ((m = EXPORT_LOCAL_RE.exec(text))) {
    for (const part of m[1].split(',')) {
      const p = part.trim().replace(/^type\s+/, '')
      if (!p) continue
      const [loc, exp] = p.split(/\s+as\s+/)
      out.push({ local: loc.trim(), exportado: (exp ?? loc).trim() })
    }
  }
  return out
}

/** Declaraciones de PRIMER NIVEL (columna 0): { nombre, tipo, linea, exportado }. */
export function declaraciones(text) {
  const out = []
  const lineas = text.split('\n')
  const exportadosLocal = new Set(exportsLocales(text).map(e => e.local))
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]
    if (!l || /^\s/.test(l)) continue
    for (const { tipo, re } of DECL_RES) {
      const m = l.match(re)
      if (m) {
        // `const x = 5` no es función: solo cuenta como nodo si es flecha/función, está exportado
        // en la propia línea o lo exporta más abajo un `export { x }`.
        const exportado = !!m[1] || exportadosLocal.has(m[2])
        const esFn = tipo !== 'const' || /=>|\bfunction\b/.test(l) || exportado
        if (esFn) out.push({ nombre: m[2], tipo: tipo === 'const' && /=>|\bfunction\b/.test(l) ? 'funcion' : tipo, linea: i + 1, exportado })
        break
      }
    }
    const d = l.match(/^export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/)
    if (d) out.push({ nombre: 'default', alias: d[1], tipo: 'reexport', linea: i + 1, exportado: true })
  }
  return out
}

// La cláusula se acota a las formas reales (`X`, `* as X`, `{ … }`, `X, { … }`, `X, * as Y`, `*`):
// un `[\s\S]*?` lazy se tragaba medio archivo hasta el primer ` from '` de un string.
const CLAUSE = String.raw`(\*|\*\s+as\s+[\w$]+|\{[^}]*\}|[\w$]+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+[\w$]+))?)`
const IMPORT_RE = new RegExp(String.raw`(?:^|\n)[ \t]*(import|export)\s+(type\s+)?(?:${CLAUSE}\s+from\s+)?['"]([^'"\n]+)['"]`, 'g')
const DYN_RE = /\b(?:import|require)\(\s*['"]([^'"\n]+)['"]\s*\)/g

/** Imports/re-exports estáticos y dinámicos: [{ spec, simbolos:[{local, exportado}], linea, tipo }]. */
export function imports(text) {
  const out = []
  const lineaDe = (idx) => text.slice(0, idx).split('\n').length
  let m
  IMPORT_RE.lastIndex = 0
  while ((m = IMPORT_RE.exec(text))) {
    const [full, kw, isType, clause, spec] = m
    if (isType) continue // `import type` no genera arista de ejecución
    const simbolos = []
    if (clause) {
      const c = clause.replace(/\s+/g, ' ').trim()
      const braces = c.match(/\{([^}]*)\}/)
      if (braces) {
        for (const part of braces[1].split(',')) {
          const p = part.trim().replace(/^type\s+/, '')
          if (!p || /^type\s/.test(part.trim())) continue
          const [exp, loc] = p.split(/\s+as\s+/)
          simbolos.push({ exportado: exp.trim(), local: (loc ?? exp).trim() })
        }
      }
      const rest = c.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim()
      const ns = rest.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/)
      if (ns) simbolos.push({ exportado: '*', local: ns[1] })
      const def = rest.replace(/\*\s+as\s+[A-Za-z_$][\w$]*/, '').trim()
      if (def && /^[A-Za-z_$][\w$]*$/.test(def)) simbolos.push({ exportado: 'default', local: def })
      if (kw === 'export' && /^\*$/.test(rest)) simbolos.push({ exportado: '*', local: '*' })
    }
    const linea = lineaDe(m.index + full.search(/\S/))
    out.push({ spec, simbolos, linea, lineaFin: linea + (full.match(/\n/g)?.length ?? 0) - (full.startsWith('\n') ? 1 : 0), tipo: kw === 'export' ? 'reexporta' : 'importa' })
  }
  DYN_RE.lastIndex = 0
  while ((m = DYN_RE.exec(text))) { const linea = lineaDe(m.index); out.push({ spec: m[1], simbolos: [], linea, lineaFin: linea, tipo: 'importa' }) }
  return out
}

/** Función de primer nivel que contiene la línea (rango = inicio → siguiente declaración). */
function contenedor(decls, linea) {
  let cur = null
  for (const d of decls) {
    if (d.linea > linea) break
    cur = d
  }
  return cur
}

/**
 * Referencias a `nombres` en el texto: `nombre(` o `<Nombre` = llamada; el resto = uso.
 * Devuelve [{ nombre, linea, tipo:'llama'|'usa' }] (una por nombre y línea).
 */
export function referencias(text, nombres, saltarLineas = new Set()) {
  if (!nombres.size) return []
  const out = []
  const seen = new Set()
  const lineas = text.split('\n')
  const validos = [...nombres].filter(n => /^[A-Za-z_$][\w$]*$/.test(n))
  if (!validos.length) return []
  const names = validos.map(n => n.replace(/[$]/g, '\\$')).join('|')
  // `<` en el lookbehind: `<Ficha />` lo cuenta SOLO la regex JSX (si no, salía como uso Y llamada).
  const re = new RegExp(`(?<![\\w$.<])(${names})(?![\\w$])(\\s*\\(|\\s*<[A-Za-z]|)`, 'g')
  const jsx = new RegExp(`<(${names})(?![\\w$])`, 'g')
  for (let i = 0; i < lineas.length; i++) {
    const n = i + 1
    if (saltarLineas.has(n)) continue
    const l = lineas[i]
    let m
    re.lastIndex = 0
    while ((m = re.exec(l))) {
      const tipo = /^[(<]/.test(m[2].trim()) ? 'llama' : 'usa' // `f(` o `f<T>(`
      const k = `${m[1]}:${n}:${tipo}`
      if (seen.has(k)) continue
      seen.add(k); out.push({ nombre: m[1], linea: n, tipo })
    }
    jsx.lastIndex = 0
    while ((m = jsx.exec(l))) {
      const k = `${m[1]}:${n}:llama`
      if (seen.has(k)) continue
      seen.add(k); out.push({ nombre: m[1], linea: n, tipo: 'llama' })
    }
  }
  return out
}

// ── Construcción del grafo ─────────────────────────────────────────────────────

export const esTest = (rel) => /\.(test|spec)\.[jt]sx?$/.test(rel) || /^test\//.test(rel) || /(^|\/)__tests__\//.test(rel)

/**
 * Grafo completo a partir de [{ rel, text }]. Nodos: archivo (id = ruta) y símbolo (id = ruta#nombre).
 * Aristas: importa/reexporta (archivo→archivo, con símbolos), llama/usa (símbolo-o-archivo → símbolo).
 */
export function extraerGrafo(archivos, alias = {}) {
  const rutas = new Set(archivos.map(a => a.rel))
  const nodos = new Map()
  const aristas = new Map()
  const addNodo = (n) => { if (!nodos.has(n.id)) nodos.set(n.id, n) }
  const addArista = (a) => {
    const k = `${a.origen}|${a.destino}|${a.tipo}|${a.linea}`
    if (!aristas.has(k)) aristas.set(k, a)
  }

  // Pasada 1: nodos de archivo y de símbolo (para poder apuntar a `ruta#nombre` en la pasada 2).
  const declsPor = new Map()
  for (const a of archivos) {
    const limpio = sinComentarios(a.text)
    const decls = declaraciones(limpio)
    declsPor.set(a.rel, { limpio, decls })
    addNodo({ id: a.rel, tipo: 'archivo', ruta: a.rel, nombre: posix.basename(a.rel), linea: null, exportado: null, ambito: ambitoDe(a.rel), es_test: esTest(a.rel) })
    for (const d of decls) {
      if (d.tipo === 'reexport') continue
      addNodo({ id: `${a.rel}#${d.nombre}`, tipo: d.tipo, ruta: a.rel, nombre: d.nombre, linea: d.linea, exportado: d.exportado, ambito: ambitoDe(a.rel), es_test: esTest(a.rel) })
    }
  }
  // `export default function X` / `export default X` → el símbolo `default` del archivo es X.
  const defaultDe = (ruta) => {
    const d = declsPor.get(ruta)?.decls ?? []
    const re = d.find(x => x.tipo === 'reexport')
    if (re) return re.alias
    const l = declsPor.get(ruta)?.limpio.match(/^export\s+default\s+(?:async\s+)?(?:function\s*\*?\s*|class\s+)([A-Za-z_$][\w$]*)/m)
    return l ? l[1] : null
  }

  // Re-exports: `export { x } from './y'` / `export * from './y'` en un barril → el símbolo real
  // vive en otro archivo. Se sigue la cadena (máx. 4 saltos) para que `barril#x` apunte a `y#x`.
  const impsPor = new Map(archivos.map(a => [a.rel, imports(declsPor.get(a.rel).limpio)]))
  const declarado = (ruta, nombre) => nodos.has(`${ruta}#${nombre}`) && nodos.get(`${ruta}#${nombre}`).tipo !== 'simbolo'
  const resolverSimbolo = (ruta, nombre, salto = 0) => {
    if (nombre === 'default') nombre = defaultDe(ruta) ?? 'default'
    if (declarado(ruta, nombre) || salto > 4) return `${ruta}#${nombre}`
    // `export { x as y }` local: `y` es el `x` del archivo, que puede ser un import (`import { x } from './db'`).
    const el = exportsLocales(declsPor.get(ruta)?.limpio ?? '').find(e => e.exportado === nombre)
    if (el) {
      if (declarado(ruta, el.local)) return `${ruta}#${el.local}`
      for (const im of impsPor.get(ruta) ?? []) {
        const s = im.simbolos.find(x => x.local === el.local)
        if (!s) continue
        const dest = resolverImport(im.spec, ruta, rutas, alias)
        if (dest) return resolverSimbolo(dest, s.exportado, salto + 1)
      }
    }
    for (const im of impsPor.get(ruta) ?? []) {
      if (im.tipo !== 'reexporta') continue
      const dest = resolverImport(im.spec, ruta, rutas, alias)
      if (!dest) continue
      const s = im.simbolos.find(x => x.local === nombre || (x.local === '*' && x.exportado === '*'))
      if (!s) continue
      const id = resolverSimbolo(dest, s.local === '*' ? nombre : s.exportado, salto + 1)
      if (declarado(...id.split('#'))) return id
    }
    return `${ruta}#${nombre}`
  }

  // Pasada 2: aristas.
  for (const a of archivos) {
    const { limpio, decls } = declsPor.get(a.rel)
    const imps = impsPor.get(a.rel)
    const locales = new Map() // nombre local → id de nodo destino
    const lineasImport = new Set()
    for (const im of imps) {
      const dest = resolverImport(im.spec, a.rel, rutas, alias)
      if (!dest) continue
      // Se salta el statement ENTERO (un `export { a,\n b } from` de varias líneas no es un uso).
      for (let l = im.linea; l <= (im.lineaFin ?? im.linea); l++) lineasImport.add(l)
      addArista({ origen: a.rel, destino: dest, tipo: im.tipo, linea: im.linea, simbolos: im.simbolos.map(s => s.exportado) })
      for (const s of im.simbolos) {
        if (s.local === '*') continue
        const id = s.exportado === '*' ? dest : resolverSimbolo(dest, s.exportado)
        if (s.exportado !== '*' && !nodos.has(id)) {
          const [ruta, nombre] = id.split('#')
          addNodo({ id, tipo: 'simbolo', ruta, nombre, linea: null, exportado: true, ambito: ambitoDe(ruta), es_test: esTest(ruta) })
        }
        locales.set(s.local, id)
      }
    }
    // Llamadas intra-archivo a funciones/clases de primer nivel.
    for (const d of decls) if (d.tipo === 'funcion' || d.tipo === 'clase') locales.set(d.nombre, `${a.rel}#${d.nombre}`)
    const declLineas = new Set(decls.map(d => d.linea))
    for (const r of referencias(limpio, new Set(locales.keys()), lineasImport)) {
      const destino = locales.get(r.nombre)
      const c = contenedor(decls, r.linea)
      const origen = c && c.tipo !== 'reexport' ? `${a.rel}#${c.nombre}` : a.rel
      if (origen === destino || declLineas.has(r.linea) && c?.nombre === r.nombre) continue
      addArista({ origen, destino, tipo: r.tipo, linea: r.linea, simbolos: [] })
    }
  }
  return { nodos: [...nodos.values()], aristas: [...aristas.values()] }
}

function gitSha() {
  try { return execSync('git rev-parse HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return '' }
}

// ── CLI ────────────────────────────────────────────────────────────────────────
const esMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (esMain) {
  const args = process.argv.slice(2)
  const outIdx = args.indexOf('--out')
  const t0 = Date.now()
  const archivos = listarArchivos()
  const grafo = extraerGrafo(archivos, leerAliases())
  const res = { sha: gitSha(), generado: new Date().toISOString(), archivos: archivos.length, ...grafo }
  const porTipo = (xs) => xs.reduce((acc, x) => { acc[x.tipo] = (acc[x.tipo] ?? 0) + 1; return acc }, {})
  console.log(`grafo: ${archivos.length} archivos → ${grafo.nodos.length} nodos ${JSON.stringify(porTipo(grafo.nodos))}, ${grafo.aristas.length} aristas ${JSON.stringify(porTipo(grafo.aristas))} en ${Date.now() - t0} ms`)
  if (outIdx >= 0 && args[outIdx + 1]) {
    writeFileSync(args[outIdx + 1], JSON.stringify(res))
    console.log(`escrito ${args[outIdx + 1]} (${Math.round(statSync(args[outIdx + 1]).size / 1024)} kB)`)
  }
}
