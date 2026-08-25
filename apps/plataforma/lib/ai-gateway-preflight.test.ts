// ────────────────────────────────────────────────────────────────────────────
// Guardián de la atribución de los rechazos PRE-VUELO de la pasarela de IA.
//
// 🚨 Por qué existe (25/08/2026): los routes de /api/ai/* registraban el rechazo
// del presupuesto mensual con un proveedor HARDCODEADO que nunca se llamó
// ('gemini' en search, 'nim'/'openrouter' en el resto). Al cruzarse el límite
// mensual el 24/08, cada rechazo contaba como «llamada fallida de Gemini» y el
// Check 12 del health-check (proveedor de IA muerto) acusó a Gemini —apagado
// desde el 01/08— de «15 llamadas y ninguna correcta». Un rechazo del gate no
// es una llamada a ningún proveedor: se registra como PROVEEDOR_PASARELA, y el
// Check 12 excluye ese valor (el agotamiento del presupuesto tiene check propio).
//
// Se lee el FUENTE de los routes (mismo patrón que cols-subasta.test.ts):
// tsc no distingue un literal de proveedor de otro.
// ────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const DIR_AI = fileURLToPath(new URL('../app/api/ai', import.meta.url))
const RUTA_HEALTH = new URL('../app/api/cron/health-check/route.ts', import.meta.url)

// Errores que solo puede emitir el propio gate ANTES de llamar a nadie.
const ERRORES_PREVUELO = ["'presupuesto mensual excedido'", "'sin GEMINI_API_KEY ni OPENROUTER_API_KEY'"]

function routesPasarela(): Array<{ ruta: string; src: string }> {
  return readdirSync(DIR_AI, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const ruta = join(DIR_AI, d.name, 'route.ts')
      try { return { ruta: `${d.name}/route.ts`, src: readFileSync(ruta, 'utf8') } }
      catch { return null }
    })
    .filter((r): r is { ruta: string; src: string } => r !== null)
}

test('ningún rechazo pre-vuelo se atribuye a un proveedor real', () => {
  const malas: string[] = []
  for (const { ruta, src } of routesPasarela()) {
    for (const linea of src.split('\n')) {
      if (!linea.includes('registrarUso')) continue
      if (!ERRORES_PREVUELO.some((e) => linea.includes(`error: ${e}`))) continue
      if (!linea.includes('proveedor: PROVEEDOR_PASARELA')) malas.push(`${ruta}: ${linea.trim()}`)
    }
  }
  assert.deepEqual(malas, [], `rechazos pre-vuelo atribuidos a un proveedor que no se llamó:\n${malas.join('\n')}`)
})

test('el guardián encuentra los rechazos que vigila (no aprueba por vacío)', () => {
  // Si los routes cambiaran de forma y el patrón dejara de casar, el test de
  // arriba daría verde sin mirar nada — un colador. Hoy hay 7 gates mensuales
  // (chat, tools, vision, search, codigo, ejecutar, programar) + 1 de «sin key».
  const n = routesPasarela()
    .flatMap(({ src }) => src.split('\n'))
    .filter((l) => l.includes('registrarUso') && ERRORES_PREVUELO.some((e) => l.includes(`error: ${e}`)))
    .length
  assert.ok(n >= 8, `solo se han encontrado ${n} registros pre-vuelo (se esperaban ≥8)`)
})

test('el Check 12 del health-check excluye al pseudo-proveedor de la pasarela', () => {
  const src = readFileSync(RUTA_HEALTH, 'utf8')
  const desdeCheck12 = src.slice(src.indexOf('proveedoresMuertos'))
  const query = desdeCheck12.slice(0, desdeCheck12.indexOf('HAVING'))
  assert.ok(query.includes('proveedoresMuertos'), 'no se encuentra la query del Check 12 en health-check')
  assert.ok(
    query.includes('proveedor <> ${PROVEEDOR_PASARELA}'),
    'el Check 12 no excluye PROVEEDOR_PASARELA: los rechazos del gate volverían a disparar «proveedor muerto»',
  )
})
