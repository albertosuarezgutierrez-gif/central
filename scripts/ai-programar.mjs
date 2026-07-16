#!/usr/bin/env node
// ORQUESTADOR de la Fase 2 ("caro planifica / barato ejecuta") — el ciclo completo por CLI:
//   1) ACOTA (0 tokens)  → POST /api/ai/codigo   (qué archivos toca la orden)
//   2) PLANIFICA (caro)  → POST /api/ai/programar (Claude alto: plan por archivo)
//   3) EJECUTA (barato)  → POST /api/ai/ejecutar  (coder barato reescribe cada archivo)
//   4) APLICA en disco. El HUMANO revisa el diff (git) + verifica (tsc/tests) + commitea.
// Nada se auto-commitea ni auto-mergea. El planificador remoto es Claude alto; NO es la sesión.
//
//   node scripts/ai-programar.mjs --tarea "arregla el bug del login" [--topN 6] [--dry]
//   --dry  = imprime plan + resultados SIN escribir en disco.
//
// Envs: PLATAFORMA_URL, AI_GATEWAY_SECRET. Node puro, sin dependencias (fetch global, Node ≥18).

import { readFileSync, writeFileSync, existsSync } from 'node:fs'

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; if (!a.startsWith('--')) continue
    const key = a.slice(2); const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) out[key] = true
    else { out[key] = next; i++ }
  }
  return out
}

const USO = `Uso:
  node scripts/ai-programar.mjs --tarea "<orden de desarrollo>" [--topN N] [--dry]

Flujo: acota (/api/ai/codigo) → planifica con Claude alto (/api/ai/programar) → ejecuta cada
archivo con el coder barato (/api/ai/ejecutar) → aplica en disco. Revisa el diff y verifica antes
de commitear. Nada se auto-commitea.

Envs: PLATAFORMA_URL, AI_GATEWAY_SECRET.`

function fallar(msg) { console.error(`✖ ${msg}`); process.exit(1) }

async function post(base, secret, ruta, payload) {
  const res = await fetch(`${base.replace(/\/$/, '')}${ruta}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90_000),
  })
  const txt = await res.text()
  if (!res.ok) {
    let detalle = txt; try { detalle = JSON.parse(txt).error ?? txt } catch {}
    throw new Error(`${ruta} → HTTP ${res.status}: ${detalle}`)
  }
  return JSON.parse(txt)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args.h) { console.log(USO); process.exit(0) }

  const base = process.env.PLATAFORMA_URL
  const secret = process.env.AI_GATEWAY_SECRET
  if (!base || !secret) fallar('faltan envs PLATAFORMA_URL y/o AI_GATEWAY_SECRET.')
  const tarea = typeof args.tarea === 'string' ? args.tarea : null
  if (!tarea) { console.error(USO); fallar('falta --tarea.') }

  // 1) ACOTAR
  console.error('▸ Acotando archivos…')
  let acot
  try { acot = await post(base, secret, '/api/ai/codigo', { tarea, topN: args.topN ? Number(args.topN) : 6 }) }
  catch (e) { fallar(`acotado falló: ${e.message}`) }
  const candidatos = Array.isArray(acot.archivos) ? acot.archivos : []
  if (acot.sinMapa || !candidatos.length) fallar('el acotado no devolvió archivos (mapa vacío/caído). Usa el método clásico.')
  console.error(`  ${candidatos.length} candidatos: ${candidatos.map(a => a.ruta).join(', ')}`)

  // Leer contenido de los candidatos que existan en el working tree.
  const conContenido = candidatos
    .filter(a => existsSync(a.ruta))
    .map(a => ({ ruta: a.ruta, resumen: a.resumen ?? null, contenido: readFileSync(a.ruta, 'utf8') }))
  if (!conContenido.length) fallar('ninguno de los candidatos existe en el working tree (¿rama desfasada del mapa?).')

  // 2) PLANIFICAR (Claude alto)
  console.error('▸ Planificando (modelo alto)…')
  let plan
  try { plan = await post(base, secret, '/api/ai/programar', { tarea, archivos: conContenido }) }
  catch (e) { fallar(`planificación falló: ${e.message}`) }
  const pasos = Array.isArray(plan.plan) ? plan.plan : []
  if (!pasos.length) fallar(`el planificador no devolvió pasos (${plan.aviso ?? 'plan vacío'}). Planifica a mano.`)
  console.error(`  plan (${plan.modelo ?? '?'}): ${pasos.length} paso(s)`)
  for (const p of pasos) console.error(`   · ${p.ruta}: ${p.instruccion}`)

  // 3) EJECUTAR cada paso (coder barato) + 4) APLICAR
  const cambios = []
  for (const p of pasos) {
    if (!existsSync(p.ruta)) { console.error(`   ⚠ ${p.ruta} no existe, salto`); continue }
    const contenido = readFileSync(p.ruta, 'utf8')
    let r
    try { r = await post(base, secret, '/api/ai/ejecutar', { ruta: p.ruta, contenido, instruccion: p.instruccion, criterio: p.criterio }) }
    catch (e) { console.error(`   ✖ ${p.ruta}: ${e.message}`); continue }
    if (args.dry) { console.error(`   [dry] ${p.ruta} (${r.modelo})`); continue }
    writeFileSync(p.ruta, r.contenido ?? contenido)
    cambios.push({ ruta: p.ruta, modelo: r.modelo })
    console.error(`   ✓ ${p.ruta} reescrito por ${r.modelo}`)
  }

  if (args.dry) { console.error('— dry-run: nada escrito —'); return }
  console.error(`\n✓ ${cambios.length} archivo(s) modificados. REVISA el diff (git diff) y VERIFICA (tsc/tests/build) ANTES de commitear. Nada se ha commiteado.`)
}

main()
