#!/usr/bin/env node
// Radiografía de estructura: audita el monorepo (apps/* + packages/*) y escribe
// apps/plataforma/lib/estructura.generated.json. Node puro, sin dependencias.
//
//   node scripts/auditar-estructura.mjs            → regenera el JSON
//   node scripts/auditar-estructura.mjs --check    → falla si el JSON está desfasado
//
// Salida determinista (orden estable) para que el diff sea limpio y el check de CI fiable.
// Al añadir una capacidad nueva, amplía el catálogo CAPACIDADES de abajo.

import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  estableJson as stable,
  estableMd as stableMd,
  estableMapa as stableMapa,
} from './auditar-comparacion.mjs'
import { extraerNovedades } from './auditar-novedades.mjs'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const APPS_DIR = join(ROOT, 'apps')
const PKGS_DIR = join(ROOT, 'packages')
const SKILLS_DIR = join(ROOT, '.claude', 'skills')
const CTX_FILE = join(ROOT, 'docs', 'CONTEXTO-SESIONES.md')
const OUT = join(ROOT, 'apps', 'plataforma', 'lib', 'estructura.generated.json')
// Archivo-resumen legible: el mapa que una sesión NUEVA de Claude lee del repo sin abrir la app.
// Las novedades salen a su PROPIO fichero: se derivan de la memoria, no del código, así que
// mezclarlas con la radiografía hacía que cada PR que anotara memoria reescribiera el JSON
// grande (y, hasta el #2053, rompiera el gate). Ver `auditar-comparacion.mjs`.
const NOV_OUT = join(ROOT, 'apps', 'plataforma', 'lib', 'novedades.generated.json')
const MD_OUT = join(ROOT, 'docs', 'ARQUITECTURA.generated.md')
// Índice de arquitectura a nivel de FUNCIÓN (firmas + resúmenes) para el Director de código.
// Coste 0 tokens: se extrae con regex Node-puro. Se inyecta en Supabase `mapa_arquitectura`
// (ver apps/plataforma/app/api/internal/mapa-arquitectura). NO se mete en estructura.generated.json
// (ese se empaqueta en el bundle de la app y se mantiene fino para la UI).
const MF_OUT = join(ROOT, 'docs', 'mapa-funciones.generated.json')

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.vercel', 'dist', 'build', 'out', 'coverage', '.turbo'])

// La matriz es la raíz (no es una vertical de producto): se muestra en la matriz pero
// no entra en el cálculo de "oportunidades de portar" entre verticales hermanas.
const MATRIZ = 'plataforma'

// Catálogo curado de capacidades/áreas. El CÓDIGO marca ✅/❌; este catálogo define
// QUÉ buscar (globs relativos a la raíz de cada app: ** = cualquier tramo, * = un tramo).
// `modulo` (opcional): el package de dominio que DEBERÍA respaldar la capacidad. Si una
// vertical tiene la capacidad pero NO usa ese módulo → reimplementación (lógica duplicada).
const CAPACIDADES = [
  { id: 'tpv',                    grupo: 'Venta y operación', label: 'TPV / comanda',           match: ['**/api/caja/**', '**/api/turno/**', '**/api/comanda*/**', '**/api/mesa/**', '**/api/marchar/**'] },
  { id: 'kds',                    grupo: 'Venta y operación', label: 'KDS (cocina)',            match: ['**/api/kds/**', '**/api/cocina/**', '**/kds/**'] },
  { id: 'eventos-catering',       grupo: 'Venta y operación', label: 'Eventos / catering / BEO', match: ['**/api/eventos/**', '**/api/eventos-catering/**', '**/api/kds-evento/**', '**/api/propuesta/**'] },
  { id: 'reservas',              grupo: 'Venta y operación', label: 'Reservas',                match: ['**/api/reservas/**', '**/api/booking*/**', '**/propuesta/*/booking/**'] },
  { id: 'qr-portal',             grupo: 'Cliente',           label: 'QR / portal cliente',     match: ['**/api/edge/**', '**/api/qr/**', '**/api/portal/**', '**/qr/**', '**/portal/**'] },
  { id: 'feedback',              grupo: 'Cliente',           label: 'Feedback / propinas',     modulo: 'module-feedback', match: ['**/api/feedback/**', '**/api/propinas/**', '**/feedback/**'] },
  { id: 'limpiadoras',           grupo: 'Limpieza / inmob.', label: 'Equipo limpiadoras',      match: ['**/api/limpiadoras/**', '**/api/*/limpiadoras/**', '**/limpiadoras/**'] },
  { id: 'agenda-asignacion',     grupo: 'Limpieza / inmob.', label: 'Agenda / auto-asignación', match: ['**/api/*/agenda/**', '**/api/*/asignacion/**', '**/auto-assign/**', '**/api/*/auto-assign/**'] },
  { id: 'pricing',               grupo: 'Inmobiliario',      label: 'Pricing dinámico',        match: ['**/api/rates/**', '**/api/pricing/**', '**/api/pricing-alerts/**', '**/api/inversion/**', '**/pricing/**', '**/pricing-auto/**'] },
  { id: 'mercado',               grupo: 'Inmobiliario',      label: 'Mercado / ingest',        match: ['**/api/mercado/**', '**/api/updates/**', '**/api/smoobu/**', '**/mercado/**'] },
  { id: 'crm-leads',             grupo: 'Negocio',           label: 'CRM / leads / cotizador', modulo: 'module-crm', match: ['**/api/crm/**', '**/api/leads/**', '**/api/lead-saas/**', '**/api/cotizador/**', '**/cotizador/**', '**/crm/**'] },
  { id: 'marketing',             grupo: 'Negocio',           label: 'Marketing (blog/IG/SEO)', match: ['**/api/blog*/**', '**/api/instagram/**', '**/api/ig-*/**', '**/api/marketing/**', '**/api/seo*/**', '**/seo/**'] },
  { id: 'rrhh',                  grupo: 'Negocio',           label: 'RRHH / equipo',           match: ['**/api/rrhh/**', '**/api/*/nomina/**', '**/api/*/equipo/**', '**/equipo/**', '**/rrhh/**'] },
  { id: 'almacen-stock',         grupo: 'Stock',             label: 'Almacén / stock / ASN',   modulo: 'module-materiales', match: ['**/api/asn/**', '**/api/almacen*/**', '**/api/*/productos/**', '**/api/*/menaje/**', '**/api/*/reposiciones/**', '**/api/*/stock/**', '**/stock/**', '**/materiales/**', '**/lenceria/**'] },
  { id: 'proveedores',           grupo: 'Stock',             label: 'Proveedores / compras',   modulo: 'module-proveedores', match: ['**/api/**/proveedores/**', '**/api/**/proveedores-*/**', '**/proveedores/**'] },
  { id: 'contabilidad',          grupo: 'Finanzas',          label: 'Contabilidad',            match: ['**/api/*/contabilidad/**', '**/api/contabilidad/**', '**/contabilidad/**'] },
  { id: 'facturacion-verifactu', grupo: 'Finanzas',          label: 'Facturación / VeriFactu', match: ['**/api/factura/**', '**/api/*/factura*/**', '**/api/*/facturacion/**', '**/facturas/**', '**/verifactu/**'] },
  { id: 'hardware-bridge',       grupo: 'Plataforma',        label: 'Hardware bridge',         match: ['**/api/bridge/**', '**/api/print/**', '**/api/cloudprnt/**', '**/api/cashdro/**', '**/bridge/**'] },
  { id: 'escaner-ocr',           grupo: 'Plataforma',        label: 'Escáner / OCR',           match: ['**/api/*/escanear/**', '**/api/*/ocr/**', '**/api/asn/ocr/**', '**/api/*/comparar-foto/**', '**/smart-scan/**'] },
  { id: 'informes',             grupo: 'Plataforma',        label: 'Informes',                match: ['**/api/*/informes/**', '**/api/informes/**', '**/informes/**'] },
  { id: 'notificaciones',        grupo: 'Plataforma',        label: 'Notificaciones (push)',   match: ['**/api/push/**', '**/api/*/vapid*/**', '**/api/*/push/**'] },
  { id: 'asistente-ia',          grupo: 'Plataforma',        label: 'Asistente / copiloto IA', match: ['**/api/*/asistente/**', '**/api/asistente/**', '**/api/agente/**', '**/api/brain/**', '**/api/owner/**', '**/asistente/**', '**/agente/**'] },
  { id: 'concursos',            grupo: 'Negocio',           label: 'Concursos públicos',      modulo: 'module-concursos', match: ['**/api/*/concursos/**', '**/api/concursos/**', '**/concursos/**'] },
]

// ── helpers ───────────────────────────────────────────────────────────────────
function dirs(p) {
  if (!existsSync(p)) return []
  return readdirSync(p).filter(n => { try { return statSync(join(p, n)).isDirectory() } catch { return false } })
}
function readJSON(p) { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }

/** Lista recursiva de rutas (posix, relativas a `base`) y de ficheros de código con su texto. */
function walk(base) {
  const paths = []
  const code = []
  function rec(abs) {
    let ents
    try { ents = readdirSync(abs, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      if (e.name.startsWith('.git')) continue
      const full = join(abs, e.name)
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue
        rec(full)
      } else {
        const rel = relative(base, full).split(sep).join('/')
        paths.push(rel)
        const dot = e.name.lastIndexOf('.')
        if (dot >= 0 && CODE_EXT.has(e.name.slice(dot))) {
          try { code.push({ rel, text: readFileSync(full, 'utf8') }) } catch { /* skip */ }
        }
      }
    }
  }
  rec(base)
  return { paths, code }
}

/** glob (** = cualquier nº de tramos, * = un tramo) → RegExp anclado. */
function globToRe(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i++ } else re += '[^/]*'
    } else if ('.+?^${}()|[]\\'.includes(c)) {
      re += '\\' + c
    } else re += c
  }
  return new RegExp('^' + re + '$')
}
const CAP_RE = new Map(CAPACIDADES.map(c => [c.id, c.match.map(globToRe)]))

// ── Índice a nivel de FUNCIÓN (Node puro, 0 tokens) ────────────────────────────
// Ruido que NO entra en el índice de funciones (tests, tipos, generados).
function esRuido(rel) {
  return /\.(test|spec)\.[jt]sx?$/.test(rel) || /\.d\.ts$/.test(rel) || /\.generated\./.test(rel)
}

/** Comentario de CABECERA del archivo (bloque `//` o `/* *​/` inicial) → "para qué sirve". */
function comentarioCabecera(text) {
  const lineas = text.replace(/^#![^\n]*\n/, '').split('\n')
  let i = 0
  while (i < lineas.length && lineas[i].trim() === '') i++
  const out = []
  if (lineas[i] && lineas[i].trim().startsWith('/*')) {
    for (; i < lineas.length; i++) {
      out.push(lineas[i].replace(/^\s*\/?\*+/, '').replace(/\*+\/\s*$/, '').trim())
      if (lineas[i].includes('*/')) break
    }
  } else {
    for (; i < lineas.length; i++) {
      const l = lineas[i].trim()
      if (l.startsWith('//')) out.push(l.replace(/^\/\/+\s?/, ''))
      else break
    }
  }
  return out.join(' ').replace(/\s+/g, ' ').trim().slice(0, 300)
}

/** Comentario contiguo JUSTO encima de una firma (JSDoc o líneas `//`). */
function comentarioEncima(text, sigIdx) {
  const before = text.slice(0, sigIdx).split('\n')
  const out = []
  for (let i = before.length - 2; i >= 0; i--) {
    const l = before[i].trim()
    if (l === '' || l === '}' || l.endsWith(';') || l.endsWith('{')) break
    if (l.endsWith('*/') || l.startsWith('*') || l.startsWith('//') || l.startsWith('/*')) {
      out.unshift(l.replace(/^\/\/+\s?/, '').replace(/^\/?\*+\/?\s?/, '').replace(/\s*\*\/$/, '').trim())
      if (l.startsWith('/*') || l.startsWith('/**')) break
    } else break
  }
  return out.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 200)
}

/** Desde el `(` de apertura, balancea paréntesis → { params, retorno }. */
function leerParametros(text, parenIdx) {
  let depth = 0, i = parenIdx
  for (; i < text.length; i++) {
    const c = text[i]
    if (c === '(') depth++
    else if (c === ')') { depth--; if (depth === 0) { i++; break } }
  }
  const params = text.slice(parenIdx + 1, Math.max(parenIdx + 1, i - 1)).replace(/\s+/g, ' ').trim()
  const rest = text.slice(i)
  return { params, rest }
}

/**
 * Firmas de las funciones EXPORTADAS y de PRIMER NIVEL (columna 0): `function`, `async function`,
 * `export default function` y `const NAME = (...) =>`. Aproximado a propósito (regex, sin compilador
 * de TS) — basta para que el Director SEÑALE el archivo; luego el agente lee el archivo entero.
 */
function extraerFirmas(text) {
  const vistos = new Set()
  const firmas = []
  const patrones = [
    { kind: 'function', re: /(^|\n)((?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)\s*(?:<[^>]*>)?\s*)\(/g },
    { kind: 'arrow', re: /(^|\n)((?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*(?::\s*[^=]+?)?=\s*(?:async\s+)?(?:<[^>]*>)?\s*)\(/g },
  ]
  for (const { kind, re } of patrones) {
    let m
    while ((m = re.exec(text)) !== null) {
      const nombre = m[3]
      if (!nombre || vistos.has(nombre)) continue
      const sigIdx = m.index + m[1].length            // inicio real de la línea de la firma
      const parenIdx = m.index + m[0].length - 1       // posición del '(' de apertura
      const { params, rest } = leerParametros(text, parenIdx)
      // Para arrow: confirmar que TRAS los parámetros viene `=>` (evita `const x = (a + b)`).
      const arrowOk = kind !== 'arrow' || /^\s*(?::\s*[^=]+?)?=>/.test(rest)
      if (!arrowOk) continue
      const rt = rest.match(/^\s*:\s*([^{;=\n]+?)\s*(?:=>|\{|$)/)
      const resumen = comentarioEncima(text, sigIdx)
      vistos.add(nombre)
      firmas.push({
        nombre, kind,
        exportada: /export/.test(m[2]),
        params: params.slice(0, 240),
        retorno: rt ? rt[1].trim().slice(0, 120) : null,
        linea: text.slice(0, sigIdx).split('\n').length,
        ...(resumen ? { resumen } : {}),
      })
    }
  }
  return firmas.sort((a, b) => a.linea - b.linea)
}

/** Tablas SQL que el archivo referencia (solo si parece contener SQL) — heurístico útil al Director. */
function tablasReferenciadas(text) {
  if (!/queryRaw|executeRaw|INSERT\s+INTO|CREATE\s+TABLE|\bSELECT\b/i.test(text)) return []
  const t = new Set()
  for (const m of text.matchAll(/\b(?:from|into|update|join)\s+["'`]?([a-z_][a-z0-9_]*)/gi)) {
    const n = m[1].toLowerCase()
    if (n.length > 2 && !['req', 'res', 'this', 'the', 'new', 'now'].includes(n)) t.add(n)
  }
  return [...t].sort()
}

/** SHA de git del checkout (stdlib, sin NPM). Cinturón: GITHUB_SHA de CI o '' fuera de git. */
function gitSha() {
  try { return execSync('git rev-parse HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }
  catch { return process.env.GITHUB_SHA ?? '' }
}

/** Recorre `apps/*` + `packages/*` y construye el índice a nivel de función (rutas repo-relativas). */
function construirMapaFunciones() {
  const archivos = []
  const bases = [
    ...dirs(APPS_DIR).filter(id => existsSync(join(APPS_DIR, id, 'package.json'))).map(id => ({ abs: join(APPS_DIR, id), rel: `apps/${id}` })),
    ...dirs(PKGS_DIR).filter(id => id.startsWith('core-') || id.startsWith('module-')).map(id => ({ abs: join(PKGS_DIR, id), rel: `packages/${id}` })),
  ]
  for (const base of bases) {
    const { code } = walk(base.abs)
    for (const f of code) {
      const ruta = `${base.rel}/${f.rel}`
      if (esRuido(ruta)) continue
      const funciones = extraerFirmas(f.text)
      const tablas = tablasReferenciadas(f.text)
      const am = ruta.match(/(?:^|\/)(?:src\/)?app\/api\/(.+?)\/route\.(?:ts|tsx|js)$/)
      const rutaApi = am ? '/api/' + am[1] : null
      // Solo archivos con "superficie" útil para acotar (funciones, tablas o ruta API).
      if (!funciones.length && !tablas.length && !rutaApi) continue
      archivos.push({
        ruta,
        ambito: base.rel,
        resumen: comentarioCabecera(f.text) || undefined,
        exporta: funciones.filter(fn => fn.exportada).map(fn => fn.nombre),
        funciones,
        tablas,
        rutaApi,
        hash: createHash('sha1').update(f.text).digest('hex').slice(0, 12),
      })
    }
  }
  archivos.sort((a, b) => a.ruta.localeCompare(b.ruta))
  return archivos
}

// ── auditoría ─────────────────────────────────────────────────────────────────
// Packages: core-* y module-*, ordenados (core primero).
const packages = dirs(PKGS_DIR)
  .map(id => {
    const pj = readJSON(join(PKGS_DIR, id, 'package.json'))
    const tipo = id.startsWith('core-') ? 'core' : id.startsWith('module-') ? 'module' : 'otro'
    return { id, tipo, npm: pj?.name || `@central/${id}` }
  })
  .filter(p => p.tipo !== 'otro')
  .sort((a, b) => (a.tipo === b.tipo ? a.id.localeCompare(b.id) : a.tipo === 'core' ? -1 : 1))

// Apps = verticales.
const verticales = dirs(APPS_DIR)
  .filter(id => existsSync(join(APPS_DIR, id, 'package.json')))
  .sort()

const matrizModulos = {}      // pkgId -> appId -> { estado, evidencias }
const matrizCapacidades = {}  // capId -> appId -> { presente, evidencias }
const apisPorVertical = {}    // appId -> ['/api/...']
const tablasPorVertical = {}  // appId -> ['tabla', ...] (de los .sql de la app)
for (const p of packages) matrizModulos[p.id] = {}
for (const c of CAPACIDADES) matrizCapacidades[c.id] = {}

for (const app of verticales) {
  const appAbs = join(APPS_DIR, app)
  const pj = readJSON(join(appAbs, 'package.json')) || {}
  const deps = new Set([...Object.keys(pj.dependencies || {}), ...Object.keys(pj.devDependencies || {})])
  const { paths, code } = walk(appAbs)

  // Módulos: importado (cuenta de ficheros) / declarado / no.
  for (const p of packages) {
    const evidencias = code.reduce((n, f) => n + (f.text.includes(p.npm) ? 1 : 0), 0)
    const estado = evidencias > 0 ? 'usado' : deps.has(p.npm) ? 'declarado' : 'no'
    matrizModulos[p.id][app] = { estado, evidencias }
  }

  // Capacidades: presente si alguna ruta hace match con algún patrón.
  for (const c of CAPACIDADES) {
    const res = CAP_RE.get(c.id)
    const evidencias = paths.reduce((n, rel) => n + (res.some(r => r.test(rel)) ? 1 : 0), 0)
    matrizCapacidades[c.id][app] = { presente: evidencias > 0, evidencias }
  }

  // APIs: rutas App Router (`.../app/api/<ruta>/route.ts`) → '/api/<ruta>'.
  const rutas = new Set()
  for (const rel of paths) {
    const m = rel.match(/(?:^|\/)(?:src\/)?app\/api\/(.+?)\/route\.(?:ts|tsx|js)$/)
    if (m) rutas.add('/api/' + m[1])
  }
  apisPorVertical[app] = [...rutas].sort()

  // Tablas: nombres de `CREATE TABLE` en los .sql de la app (las tablas viven a nivel app;
  // los módulos son BD-agnósticos). Normaliza quitando el prefijo de schema `public.`.
  const tablas = new Set()
  for (const rel of paths) {
    if (!rel.endsWith('.sql')) continue
    let txt = ''
    try { txt = readFileSync(join(appAbs, rel), 'utf8') } catch { continue }
    for (const m of txt.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?["'`]?([a-z0-9_."]+)["'`]?/gi)) {
      tablas.add(m[1].replace(/["'`]/g, '').replace(/^public\./, ''))
    }
  }
  tablasPorVertical[app] = [...tablas].sort()
}

// Gaps derivados.
const modulosInfrautilizados = []
for (const p of packages)
  for (const app of verticales)
    if (matrizModulos[p.id][app].estado === 'declarado')
      modulosInfrautilizados.push({ package: p.id, app })

const prod = verticales.filter(v => v !== MATRIZ)
const oportunidadesPortar = []
for (const c of CAPACIDADES) {
  const tiene = prod.filter(v => matrizCapacidades[c.id][v].presente)
  const falta = prod.filter(v => !matrizCapacidades[c.id][v].presente)
  if (tiene.length && falta.length) oportunidadesPortar.push({ capacidad: c.id, label: c.label, tiene, falta })
}

// Reimplementaciones: la capacidad ESTÁ presente en la vertical, pero NO usa el módulo de
// dominio que debería respaldarla → lógica duplicada a mano (deuda de portabilidad). Esto
// NO lo ve "oportunidadesPortar" (que solo compara presencia/ausencia entre verticales):
// una capacidad presente en todas, pero con módulo compartido solo en una, salía "en verde".
const reimplementaciones = []
for (const c of CAPACIDADES) {
  if (!c.modulo || !matrizModulos[c.modulo]) continue
  const duplicada = prod.filter(v => matrizCapacidades[c.id][v].presente && matrizModulos[c.modulo][v].estado !== 'usado')
  const conModulo = prod.filter(v => matrizCapacidades[c.id][v].presente && matrizModulos[c.modulo][v].estado === 'usado')
  if (duplicada.length) reimplementaciones.push({ capacidad: c.id, label: c.label, modulo: c.modulo, conModulo, duplicada })
}

// Grafo de dependencias entre packages: qué @central/* importa cada package en su src.
const depsModulos = {}
for (const p of packages) {
  const { code } = walk(join(PKGS_DIR, p.id, 'src'))
  depsModulos[p.id] = packages
    .filter(o => o.id !== p.id && code.some(f => f.text.includes(o.npm)))
    .map(o => o.id)
    .sort()
}

// Skills del proyecto: frontmatter (name, description) de .claude/skills/*/SKILL.md.
const skills = dirs(SKILLS_DIR)
  .map(id => {
    const md = join(SKILLS_DIR, id, 'SKILL.md')
    if (!existsSync(md)) return null
    const txt = readFileSync(md, 'utf8')
    const fm = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    let name = id, description = ''
    if (fm) {
      const nm = fm[1].match(/^name:\s*(.+)$/m); if (nm) name = nm[1].trim()
      const dm = fm[1].match(/^description:\s*([\s\S]+?)(?:\r?\n[a-z_]+:|$)/m); if (dm) description = dm[1].trim().replace(/\s+/g, ' ')
    }
    return { id, name, description }
  })
  .filter(Boolean)
  .sort((a, b) => a.id.localeCompare(b.id))

// Novedades: cabeceras de entrada de docs/CONTEXTO-SESIONES.md (timeline, lo más reciente arriba).
// Titulares de las últimas sesiones. El criterio de qué es una entrada vive en
// `auditar-novedades.mjs` (que lo toma de `rotar-memoria.mjs`): el regex que había aquí
// casaba con cualquier bullet en negrita, así que pintaba sub-bullets del cuerpo —sin
// fecha— y no veía NINGUNA entrada del formato `### `.
const novedades = existsSync(CTX_FILE) ? extraerNovedades(readFileSync(CTX_FILE, 'utf8')) : []

// Salud derivable del repo (señales baratas; lo runtime se lee en vivo en el panel).
const saludRepo = {
  packagesSinDescripcion: packages.filter(p => !(readJSON(join(PKGS_DIR, p.id, 'package.json'))?.description)).map(p => p.id),
  appsSinClaudeMd: verticales.filter(a => !existsSync(join(APPS_DIR, a, 'CLAUDE.md'))).sort(),
  appsSinVercelJson: verticales.filter(a => !existsSync(join(APPS_DIR, a, 'vercel.json'))).sort(),
}

const out = {
  generadoEn: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  verticales,
  matriz: MATRIZ,
  packages,
  capacidades: CAPACIDADES.map(({ id, grupo, label, modulo }) => (modulo ? { id, grupo, label, modulo } : { id, grupo, label })),
  matrizModulos,
  matrizCapacidades,
  depsModulos,
  apisPorVertical,
  tablasPorVertical,
  skills,
  saludRepo,
  gaps: { modulosInfrautilizados, oportunidadesPortar, reimplementaciones },
  resumen: {
    verticales: verticales.length,
    packages: packages.length,
    capacidades: CAPACIDADES.length,
    skills: skills.length,
    apis: Object.values(apisPorVertical).reduce((n, a) => n + a.length, 0),
    modulosInfrautilizados: modulosInfrautilizados.length,
    oportunidadesPortar: oportunidadesPortar.length,
    reimplementaciones: reimplementaciones.length,
  },
}

// ── Índice a nivel de función (docs/mapa-funciones.generated.json) ─────────────
// Se inyecta en Supabase `mapa_arquitectura` para que el Director de código acote
// archivos a coste 0 tokens. Artefacto aparte de estructura.generated.json.
const mfArchivos = construirMapaFunciones()
const mapaFunciones = {
  generadoEn: out.generadoEn,
  sha: gitSha(),
  archivos: mfArchivos,
  resumen: {
    archivos: mfArchivos.length,
    funciones: mfArchivos.reduce((n, a) => n + a.funciones.length, 0),
  },
}
// El criterio de comparación (qué cuenta como "desfasado") vive en `auditar-comparacion.mjs`.

// ── Archivo-resumen legible (docs/ARQUITECTURA.generated.md) ───────────────────
// Mapa completo en markdown para que una sesión NUEVA de Claude lea la arquitectura
// del repo sin abrir la app. Se deriva 100% de `out` (mismo origen que el JSON).
function buildMd(o) {
  const L = []
  const consumidores = pkgId => o.verticales.filter(v => o.matrizModulos[pkgId][v]?.estado === 'usado')
  L.push('# 🗺️ Arquitectura viva — casa de marcas `central`')
  L.push('')
  L.push(`> **Generado automáticamente** por \`scripts/auditar-estructura.mjs\` (${o.generadoEn}). NO editar a mano.`)
  L.push('> Se regenera en cada push (\`.github/workflows/auditoria.yml\`). Es el mapa que una sesión nueva lee del repo.')
  L.push('> Descripciones curadas, agentes y glosario: `apps/plataforma/lib/estructura.ts`. Visual: panel `/admin` → 🗺️ Estructura.')
  L.push('')
  L.push(`**Resumen:** ${o.resumen.verticales} apps · ${o.resumen.packages} packages · ${o.resumen.capacidades} capacidades · ${o.resumen.skills} skills · ${o.resumen.apis} rutas API.`)
  L.push('')
  L.push('## Apps (verticales)')
  for (const app of o.verticales) {
    const mods = o.packages.filter(p => o.matrizModulos[p.id][app]?.estado === 'usado').map(p => p.id)
    const caps = o.capacidades.filter(c => o.matrizCapacidades[c.id][app]?.presente).map(c => c.label)
    L.push(`### ${app}${app === o.matriz ? ' _(matriz)_' : ''}`)
    L.push(`- **Módulos que usa:** ${mods.join(', ') || '—'}`)
    L.push(`- **Capacidades:** ${caps.join(', ') || '—'}`)
    L.push(`- **Tablas (${o.tablasPorVertical[app]?.length || 0}):** ${(o.tablasPorVertical[app] || []).slice(0, 30).join(', ') || '—'}${(o.tablasPorVertical[app]?.length || 0) > 30 ? '…' : ''}`)
    L.push(`- **Rutas API:** ${o.apisPorVertical[app]?.length || 0}`)
  }
  L.push('')
  L.push('## Packages compartidos (`@central/*`)')
  for (const p of o.packages) {
    L.push(`- **${p.id}** (${p.tipo}) → \`${p.npm}\``)
    L.push(`  - Lo usan: ${consumidores(p.id).join(', ') || '—'}`)
    L.push(`  - Depende de: ${o.depsModulos[p.id]?.join(', ') || '—'}`)
  }
  L.push('')
  L.push('## Skills del proyecto')
  for (const s of o.skills) L.push(`- **${s.id}** — ${s.description || s.name}`)
  L.push('')
  if (o.gaps.reimplementaciones.length || o.gaps.oportunidadesPortar.length) {
    L.push('## Avisos de arquitectura')
    for (const r of o.gaps.reimplementaciones) L.push(`- 🔴 **${r.label}**: duplicada en ${r.duplicada.join(', ')} (debería usar \`${r.modulo}\`).`)
    for (const g of o.gaps.oportunidadesPortar) L.push(`- ⚠️ **${g.label}**: en ${g.tiene.join(', ')}; falta en ${g.falta.join(', ')}.`)
    L.push('')
  }
  if (novedades.length) {
    L.push('## Novedades recientes (de `docs/CONTEXTO-SESIONES.md`)')
    for (const n of novedades.slice(0, 10)) L.push(`- ${n.fecha ? `(${n.fecha}) ` : ''}${n.titulo}`)
    L.push('')
  }
  return L.join('\n') + '\n'
}



if (process.argv.includes('--check')) {
  const prevJson = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  const prevMd = existsSync(MD_OUT) ? readFileSync(MD_OUT, 'utf8') : ''
  const prevMf = existsSync(MF_OUT) ? readFileSync(MF_OUT, 'utf8') : ''
  const jsonOk = stable(JSON.parse(prevJson || '{}')) === stable(out)
  const mdOk = stableMd(prevMd) === stableMd(buildMd(out))
  const mfOk = stableMapa(JSON.parse(prevMf || '{}')) === stableMapa(mapaFunciones)
  if (!jsonOk || !mdOk || !mfOk) {
    const cual = !jsonOk ? 'estructura.generated.json' : !mdOk ? 'docs/ARQUITECTURA.generated.md' : 'docs/mapa-funciones.generated.json'
    console.error(`✗ ${cual} desfasado. Corre: npm run auditar`)
    process.exit(1)
  }
  console.log('✓ Radiografía al día (JSON + markdown + mapa de funciones).')
} else {
  // Conserva el timestamp anterior si el contenido (sin él) no cambió → sin churn.
  const prevRaw = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  let prev = null
  try { prev = JSON.parse(prevRaw) } catch { /* fichero nuevo o corrupto */ }
  if (prev && stable(prev) === stable(out)) out.generadoEn = prev.generadoEn

  const json = JSON.stringify(out, null, 2) + '\n'
  if (json === prevRaw) console.log('✓ JSON ya al día.')
  else { writeFileSync(OUT, json); console.log(`✓ JSON escrito en ${relative(ROOT, OUT)}`) }

  // Novedades: fichero propio. NO entra en `--check` — se deriva de la memoria, que cambia en
  // cada sesión, así que exigirlo al día en cada PR es el falso positivo que ya costó el #2053.
  const nov = JSON.stringify({ novedades }, null, 2) + '\n'
  const prevNov = existsSync(NOV_OUT) ? readFileSync(NOV_OUT, 'utf8') : ''
  if (nov === prevNov) console.log('✓ Novedades ya al día.')
  else { writeFileSync(NOV_OUT, nov); console.log(`✓ Novedades escritas en ${relative(ROOT, NOV_OUT)}`) }

  const md = buildMd(out)
  const prevMd = existsSync(MD_OUT) ? readFileSync(MD_OUT, 'utf8') : ''
  // Byte a byte (no `stableMd`): al comparar se ignoran las novedades, pero al ESCRIBIR se
  // refrescan. Sin churn: si nada estructural cambió, `out.generadoEn` conserva el anterior.
  if (md === prevMd) console.log('✓ Markdown ya al día.')
  else { writeFileSync(MD_OUT, md); console.log(`✓ Markdown escrito en ${relative(ROOT, MD_OUT)}`) }

  // Índice de funciones: conserva timestamp/sha anteriores si las firmas no cambiaron → sin churn.
  const prevMfRaw = existsSync(MF_OUT) ? readFileSync(MF_OUT, 'utf8') : ''
  let prevMf = null
  try { prevMf = JSON.parse(prevMfRaw) } catch { /* nuevo o corrupto */ }
  if (prevMf && stableMapa(prevMf) === stableMapa(mapaFunciones)) {
    mapaFunciones.generadoEn = prevMf.generadoEn
    mapaFunciones.sha = prevMf.sha
  }
  const mfJson = JSON.stringify(mapaFunciones, null, 2) + '\n'
  if (mfJson === prevMfRaw) console.log('✓ Mapa de funciones ya al día.')
  else { writeFileSync(MF_OUT, mfJson); console.log(`✓ Mapa de funciones escrito en ${relative(ROOT, MF_OUT)}`) }

  console.log(`  ${out.resumen.verticales} verticales · ${out.resumen.packages} packages · ${out.resumen.capacidades} capacidades · ${out.resumen.skills} skills · ${out.resumen.apis} APIs`)
  console.log(`  mapa-funciones: ${mapaFunciones.resumen.archivos} archivos · ${mapaFunciones.resumen.funciones} funciones`)
  console.log(`  ${out.resumen.modulosInfrautilizados} módulos infrautilizados · ${out.resumen.oportunidadesPortar} oportunidades de portar · ${out.resumen.reimplementaciones} reimplementaciones`)

  // Comprueba que VERTICALES en estructura.ts cubre todas las apps detectadas.
  const estructuraTs = join(ROOT, 'apps', 'plataforma', 'lib', 'estructura.ts')
  if (existsSync(estructuraTs)) {
    const tsText = readFileSync(estructuraTs, 'utf8')
    const curadas = [...tsText.matchAll(/app:\s*['"]([^'"]+)['"]/g)].map(m => m[1])
    const sinCurar = verticales.filter(v => !curadas.includes(v))
    if (sinCurar.length) {
      console.warn(`\n⚠️  VERTICALES sin entrada curada en estructura.ts: ${sinCurar.join(', ')}`)
      console.warn('   Copia el stub de abajo en el array VERTICALES de apps/plataforma/lib/estructura.ts:\n')
      for (const v of sinCurar)
        console.warn(`  { app: '${v}', nombre: '${v}', sector: '???', desc: '???' },`)
    }
  }
}
