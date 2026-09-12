#!/usr/bin/env node
// Agregado del uso de herramientas por sesión (docs/uso-herramientas/**/*.json, que escribe el hook
// scripts/uso-herramientas.mjs) → tabla por categoría: sesiones, llamadas, tokens pagados (≈ chars/4
// de las respuestas), tokens que la sesión habría gastado leyendo los archivos citados (cota
// superior del ahorro) y errores. Numerador Y denominador, que es lo que faltaba.
//
// Uso:  node scripts/ahorro-herramientas.mjs [--mes AAAA-MM] [--json] [--md <fichero>]
//   --md reescribe el bloque entre <!-- ahorro:inicio --> y <!-- ahorro:fin --> de ese fichero
//   (docs/USO-HERRAMIENTAS.md) y deja el resto intacto.
// Lógica pura exportada (agregar, tablaMarkdown) para test/ahorro-herramientas.test.ts.

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const DIR_USO = join(ROOT, 'docs', 'uso-herramientas')
const TOKENS_POR_CHAR = 1 / 4

/** Lee todos los resúmenes de sesión (opcionalmente de un mes AAAA-MM). */
export function leerResumenes(dir = DIR_USO, mes = null) {
  const out = []
  if (!existsSync(dir)) return out
  for (const m of readdirSync(dir)) {
    if (mes && m !== mes) continue
    const d = join(dir, m)
    let st; try { st = statSync(d) } catch { continue }
    if (!st.isDirectory()) continue
    for (const f of readdirSync(d)) {
      if (!f.endsWith('.json')) continue
      try { out.push(JSON.parse(readFileSync(join(d, f), 'utf8'))) } catch { /* fichero a medias: se salta */ }
    }
  }
  return out
}

/**
 * Agrega N resúmenes de sesión → { sesiones, filas:[{categoria, sesiones, llamadas, tokens_pagados,
 * tokens_citados, errores, tools}] } ordenado por llamadas desc.
 */
export function agregar(resumenes) {
  const porCat = new Map()
  for (const r of resumenes) {
    for (const [cat, c] of Object.entries(r?.categorias ?? {})) {
      const f = porCat.get(cat) ?? { categoria: cat, sesiones: 0, llamadas: 0, chars_out: 0, chars_citados: 0, errores: 0, tools: {} }
      f.sesiones++
      f.llamadas += c.llamadas ?? 0
      f.chars_out += c.chars_out ?? 0
      f.chars_citados += c.chars_citados ?? 0
      f.errores += c.errores ?? 0
      for (const [t, n] of Object.entries(c.tools ?? {})) f.tools[t] = (f.tools[t] ?? 0) + n
      porCat.set(cat, f)
    }
  }
  const filas = [...porCat.values()].map(f => ({
    categoria: f.categoria,
    sesiones: f.sesiones,
    llamadas: f.llamadas,
    tokens_pagados: Math.round(f.chars_out * TOKENS_POR_CHAR),
    tokens_citados: Math.round(f.chars_citados * TOKENS_POR_CHAR),
    errores: f.errores,
    tools: f.tools,
  })).sort((a, b) => b.llamadas - a.llamadas)
  return { sesiones: resumenes.length, filas }
}

const fmt = (n) => n.toLocaleString('es-ES', { useGrouping: 'always' })

/** Tabla markdown del agregado. `tokens_citados` se rotula como cota superior, no como ahorro. */
export function tablaMarkdown(ag, titulo = '') {
  const L = []
  if (titulo) L.push(`**${titulo}** — ${ag.sesiones} sesión(es) medida(s).`, '')
  L.push('| Herramienta | Sesiones | Llamadas | Tokens pagados (≈) | Tokens citados (cota sup.) | Errores |')
  L.push('|---|---:|---:|---:|---:|---:|')
  for (const f of ag.filas) L.push(`| \`${f.categoria}\` | ${fmt(f.sesiones)} | ${fmt(f.llamadas)} | ${fmt(f.tokens_pagados)} | ${fmt(f.tokens_citados)} | ${fmt(f.errores)} |`)
  if (!ag.filas.length) L.push('| _(sin datos todavía)_ | | | | | |')
  return L.join('\n')
}

/** Sustituye el bloque marcado de un markdown (o lo añade al final si no existe). */
export function inyectarBloque(md, bloque) {
  const ini = '<!-- ahorro:inicio -->', fin = '<!-- ahorro:fin -->'
  const cuerpo = `${ini}\n${bloque}\n${fin}`
  const i = md.indexOf(ini), j = md.indexOf(fin)
  if (i >= 0 && j > i) return md.slice(0, i) + cuerpo + md.slice(j + fin.length)
  return md.replace(/\s*$/, '') + '\n\n' + cuerpo + '\n'
}

const esMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (esMain) {
  const args = process.argv.slice(2)
  const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
  const mes = arg('--mes')
  const ag = agregar(leerResumenes(DIR_USO, mes))
  if (args.includes('--json')) { console.log(JSON.stringify(ag, null, 2)) }
  else {
    const titulo = `Uso de herramientas${mes ? ` · ${mes}` : ' · todo lo medido'} (generado ${new Date().toISOString().slice(0, 10)})`
    const tabla = tablaMarkdown(ag, titulo)
    const md = arg('--md')
    if (md) {
      const prev = existsSync(md) ? readFileSync(md, 'utf8') : ''
      writeFileSync(md, inyectarBloque(prev, tabla))
      console.log(`✓ bloque de ahorro actualizado en ${md} (${ag.sesiones} sesiones, ${ag.filas.length} categorías)`)
    } else console.log(tabla)
  }
}
