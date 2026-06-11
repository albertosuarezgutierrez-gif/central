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

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const APPS_DIR = join(ROOT, 'apps')
const PKGS_DIR = join(ROOT, 'packages')
const OUT = join(ROOT, 'apps', 'plataforma', 'lib', 'estructura.generated.json')

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
  { id: 'almacen-stock',         grupo: 'Stock',             label: 'Almacén / stock / ASN',   modulo: 'module-inventario', match: ['**/api/asn/**', '**/api/almacen*/**', '**/api/*/productos/**', '**/api/*/menaje/**', '**/api/*/reposiciones/**', '**/api/*/stock/**', '**/stock/**', '**/materiales/**', '**/lenceria/**'] },
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

// ── auditoría ─────────────────────────────────────────────────────────────────
// Packages: core-* y module-*, ordenados (core primero).
const packages = dirs(PKGS_DIR)
  .map(id => {
    const pj = readJSON(join(PKGS_DIR, id, 'package.json'))
    const tipo = id.startsWith('core-') ? 'core' : id.startsWith('module-') ? 'module' : 'otro'
    return { id, tipo, npm: pj?.name || `@iarest/${id}` }
  })
  .filter(p => p.tipo !== 'otro')
  .sort((a, b) => (a.tipo === b.tipo ? a.id.localeCompare(b.id) : a.tipo === 'core' ? -1 : 1))

// Apps = verticales.
const verticales = dirs(APPS_DIR)
  .filter(id => existsSync(join(APPS_DIR, id, 'package.json')))
  .sort()

const matrizModulos = {}      // pkgId -> appId -> { estado, evidencias }
const matrizCapacidades = {}  // capId -> appId -> { presente, evidencias }
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

const out = {
  generadoEn: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  verticales,
  matriz: MATRIZ,
  packages,
  capacidades: CAPACIDADES.map(({ id, grupo, label, modulo }) => (modulo ? { id, grupo, label, modulo } : { id, grupo, label })),
  matrizModulos,
  matrizCapacidades,
  gaps: { modulosInfrautilizados, oportunidadesPortar, reimplementaciones },
  resumen: {
    verticales: verticales.length,
    packages: packages.length,
    capacidades: CAPACIDADES.length,
    modulosInfrautilizados: modulosInfrautilizados.length,
    oportunidadesPortar: oportunidadesPortar.length,
    reimplementaciones: reimplementaciones.length,
  },
}

// `generadoEn` se ignora al comparar (cambia en cada corrida). Así el fichero solo
// cambia cuando cambia la estructura real → sin churn ni auto-commits en bucle.
const stable = o => JSON.stringify({ ...o, generadoEn: '' }, null, 2)

if (process.argv.includes('--check')) {
  const prev = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  if (stable(JSON.parse(prev || '{}')) !== stable(out)) {
    console.error('✗ estructura.generated.json está desfasado. Corre: npm run auditar')
    process.exit(1)
  }
  console.log('✓ Radiografía al día.')
} else {
  // Conserva el timestamp anterior si el contenido (sin él) no cambió.
  const prevRaw = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  let prev = null
  try { prev = JSON.parse(prevRaw) } catch { /* fichero nuevo o corrupto */ }
  if (prev && stable(prev) === stable(out)) out.generadoEn = prev.generadoEn

  const json = JSON.stringify(out, null, 2) + '\n'
  if (json === prevRaw) {
    console.log('✓ Radiografía ya al día (sin cambios).')
  } else {
    writeFileSync(OUT, json)
    console.log(`✓ Radiografía escrita en ${relative(ROOT, OUT)}`)
  }
  console.log(`  ${out.resumen.verticales} verticales · ${out.resumen.packages} packages · ${out.resumen.capacidades} capacidades`)
  console.log(`  ${out.resumen.modulosInfrautilizados} módulos infrautilizados · ${out.resumen.oportunidadesPortar} oportunidades de portar · ${out.resumen.reimplementaciones} reimplementaciones`)
}
