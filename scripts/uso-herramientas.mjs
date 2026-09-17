#!/usr/bin/env node
// Medidor de USO de herramientas — hook `PostToolUse` (matcher vacío: todas las tools).
//
// ─── POR QUÉ EXISTE (12/09/2026) ─────────────────────────────────────────────────────────────
// Graphify (MCP externo, cuota gratis agotándose), el grafo propio (`grafo_*` en Supabase), el
// índice `mapa_arquitectura` (skill code-map), los subagentes (`agente-mecanico`) y la lectura
// directa de archivos compiten por lo mismo: contexto de la sesión. Hasta hoy el único registro era
// una bitácora a mano (docs/AGENTE-MECANICO-BITACORA.md) que depende de que la sesión se acuerde —
// y sin denominador no se puede saber si una herramienta ahorra tokens o si el re-trabajo se lo come.
// Alberto (12/09/2026): «se debería controlar el ahorro que tenemos con cada cosa que tenemos».
//
// ─── QUÉ MIDE ────────────────────────────────────────────────────────────────────────────────
// Por SESIÓN y por CATEGORÍA de herramienta: nº de llamadas, chars de entrada, chars de respuesta
// (≈ tokens que la sesión PAGA por usarla: chars/4), errores, y `chars_citados` = tamaño en disco
// de los archivos del repo que la respuesta menciona (lo que la sesión habría tenido que LEER
// entero sin la herramienta; es una COTA SUPERIOR del ahorro, no el ahorro). Un archivo por sesión
// en docs/uso-herramientas/AAAA-MM/<sesión>.json — el hook `Stop` (persist-memoria.sh) lo commitea
// con la memoria. Agregado: `node scripts/ahorro-herramientas.mjs`.
//
// 🔁 DÓNDE SE ESCRIBE MIENTRAS LA SESIÓN VIVE (12/09/2026): en un STAGING fuera del árbol
// (`<repo>/.git/uso-herramientas/…`), NO en docs/. Medido el mismo día que nació: el JSON cambia
// con cada tool call, el `Stop` lo commiteaba y empujaba en cada turno, y cada push dispara el CI
// y 12 deployments de Vercel — cuatro pushes en 40 s en una sesión despierta por eventos del PR
// (la cuota `api-deployments-paid-per-hour` de CLAUDE.md). El `Stop` copia el staging a docs/ y
// lo commitea SOLO junto a la memoria o, como mucho, una vez cada 30 min.
//
// Lo que NO mide (y no se afirma): si la respuesta fue ÚTIL. Eso sigue en la bitácora a mano.
//
// FAIL-OPEN: nunca bloquea ni escribe en stdout (un hook PostToolUse que falla no debe frenar a la
// sesión). Cualquier error → exit 0 en silencio. Sin `session_id` no se escribe nada.
// Lógica pura exportada (clasificar, acumular, archivosCitados) para test/uso-herramientas.test.ts.

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Categoría de una llamada: qué "cosa de las que tenemos" se está usando. */
export function clasificar(toolName, toolInput = {}) {
  const t = String(toolName ?? '')
  if (/^mcp__Graphify__/.test(t)) return 'graphify'
  if (/^mcp__Supabase(_[\w-]+)?__execute_sql$/.test(t)) {
    const q = String(toolInput?.query ?? '')
    if (/\bgrafo_(nodos|aristas|embeddings|callers|callees|impacto|vecinos|tests_de|find|deps_archivo|buscar|rank_files|camino|referencias|imports_exports|nodo|subgrafo)\b/.test(q)) return 'grafo-propio'
    if (/\bmapa_arquitectura\b/.test(q)) return 'code-map'
    return 'sql'
  }
  if (t === 'Agent' || t === 'Task') {
    const st = String(toolInput?.subagent_type ?? 'general')
    return `agente:${st}`
  }
  if (t === 'Read' || t === 'Grep' || t === 'Glob') return 'lectura-directa'
  if (t === 'Bash') return 'bash'
  if (t === 'Edit' || t === 'Write' || t === 'MultiEdit') return 'escritura'
  if (/^mcp__/.test(t)) return `mcp:${t.split('__')[1] ?? 'otro'}`
  return 'otro'
}

/** Texto plano de un tool_response (string, {content:[{text}]}, objeto…). */
export function textoDe(resp) {
  if (resp == null) return ''
  if (typeof resp === 'string') return resp
  if (Array.isArray(resp)) return resp.map(textoDe).join('\n')
  if (typeof resp === 'object') {
    if (typeof resp.text === 'string') return resp.text
    if (Array.isArray(resp.content)) return resp.content.map(textoDe).join('\n')
    try { return JSON.stringify(resp) } catch { return '' }
  }
  return String(resp)
}

const RUTA_RE = /(?:^|[^\w/.-])((?:apps|packages|scripts|test|docs)\/[\w./-]+\.(?:tsx?|mjs|jsx?|sql|md))(?![\w/])/g

/**
 * Rutas del repo mencionadas en un texto que EXISTEN en disco, con su tamaño. `existe(ruta)` → bytes|null
 * (inyectable para test). Es la cota superior de lo que se habría leído sin la herramienta.
 */
export function archivosCitados(texto, existe = tamanoEnDisco) {
  const vistas = new Map()
  let m
  RUTA_RE.lastIndex = 0
  while ((m = RUTA_RE.exec(texto))) {
    const r = m[1]
    if (vistas.has(r)) continue
    const bytes = existe(r)
    if (bytes != null) vistas.set(r, bytes)
  }
  return vistas
}

function tamanoEnDisco(rel) {
  try { const p = join(ROOT, rel); return existsSync(p) ? statSync(p).size : null } catch { return null }
}

/** Acumula una llamada en el resumen de la sesión (puro: devuelve el objeto mutado). */
export function acumular(resumen, { categoria, tool, charsIn, charsOut, error, citados }) {
  resumen.llamadas = (resumen.llamadas ?? 0) + 1
  const c = (resumen.categorias[categoria] ??= { llamadas: 0, chars_in: 0, chars_out: 0, errores: 0, archivos_citados: 0, chars_citados: 0, tools: {} })
  c.llamadas++
  c.chars_in += charsIn
  c.chars_out += charsOut
  if (error) c.errores++
  c.archivos_citados += citados.size
  for (const b of citados.values()) c.chars_citados += b
  c.tools[tool] = (c.tools[tool] ?? 0) + 1
  return resumen
}

export function esError(resp) {
  if (resp && typeof resp === 'object' && (resp.is_error === true || resp.isError === true)) return true
  const t = textoDe(resp).slice(0, 200)
  return /^\s*(Error|error:|\{"error")/.test(t)
}

/** Ruta COMMITEADA del resumen (docs/uso-herramientas/AAAA-MM/<sesión>.json). */
export function rutaResumen(sessionId, fecha = new Date(), root = ROOT) {
  const mes = fecha.toISOString().slice(0, 7)
  return join(root, 'docs', 'uso-herramientas', mes, `${nombreSesion(sessionId)}.json`)
}

/**
 * Ruta de STAGING, fuera del árbol de trabajo: `<root>/.git/uso-herramientas/AAAA-MM/<sesión>.json`.
 * Ahí escribe el hook en cada tool call sin ensuciar `git status`; el Stop lo copia a docs/ cuando toca.
 * Si `.git` no es un directorio (worktree) o no existe, cae al tmpdir del sistema.
 */
export function rutaStaging(sessionId, fecha = new Date(), root = ROOT, gitDirEsDirectorio = esDirectorio) {
  const mes = fecha.toISOString().slice(0, 7)
  const base = gitDirEsDirectorio(join(root, '.git')) ? join(root, '.git', 'uso-herramientas') : join(tmpdir(), 'uso-herramientas')
  return join(base, mes, `${nombreSesion(sessionId)}.json`)
}

function nombreSesion(sessionId) { return String(sessionId).replace(/[^\w-]/g, '').slice(0, 40) }
function esDirectorio(p) { try { return statSync(p).isDirectory() } catch { return false } }

function main() {
  let raw = ''
  try { raw = readFileSync(0, 'utf8') } catch { return }
  let ev
  try { ev = JSON.parse(raw.replace(/^﻿/, '')) } catch { return }
  const sessionId = ev?.session_id
  if (!sessionId || !ev?.tool_name) return

  const categoria = clasificar(ev.tool_name, ev.tool_input)
  const salida = textoDe(ev.tool_response)
  const entrada = (() => { try { return JSON.stringify(ev.tool_input ?? {}) } catch { return '' } })()
  const citados = categoria === 'lectura-directa' || categoria === 'escritura' || categoria === 'bash'
    ? new Map() // leer/editar un archivo no "cita" nada: ES la lectura
    : archivosCitados(salida)

  const ruta = rutaStaging(sessionId)
  let resumen = { sesion: String(sessionId), inicio: new Date().toISOString(), fin: null, llamadas: 0, categorias: {} }
  // Arranca del staging; si no existe aún, continúa el JSON ya commiteado de esta sesión (si lo hay).
  for (const candidata of [ruta, rutaResumen(sessionId)]) {
    try { if (existsSync(candidata)) { resumen = JSON.parse(readFileSync(candidata, 'utf8')); break } } catch { /* se reinicia */ }
  }
  resumen.categorias ??= {}
  acumular(resumen, { categoria, tool: ev.tool_name, charsIn: entrada.length, charsOut: salida.length, error: esError(ev.tool_response), citados })
  resumen.fin = new Date().toISOString()
  mkdirSync(dirname(ruta), { recursive: true })
  const tmp = `${ruta}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(resumen, null, 1))
  renameSync(tmp, ruta)
}

const esMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (esMain) { try { main() } catch { /* fail-open */ } }
