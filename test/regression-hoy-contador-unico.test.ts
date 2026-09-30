// El badge de la pestaña «Hoy» y la franja del cockpit cuentan LAS MISMAS colas.
// Antes el badge sumaba diez y la celda de la franja cinco: dos números que no
// se podían reconciliar en la misma pantalla (26/09/2026). La fuente única es
// `colasIncid`; el badge = colasIncid + tareas de hoy.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../apps/plataforma/app/(usuario)/correduria/CorreduriaClient.tsx', import.meta.url), 'utf8')

test('el badge de «Hoy» se construye desde colasIncid + tareas, no con su propia lista', () => {
  // «Clientes» ya no lleva badge (30/09/2026): el bloque de «hoy» acaba donde empieza «comisiones».
  const ini = src.indexOf('hoy: {')
  const fin = src.indexOf('comisiones: {', ini)
  assert.ok(ini >= 0 && fin > ini, 'no se encontró el bloque de contadores de «hoy»')
  const hoy = src.slice(ini, fin)
  assert.match(hoy, /contador:\s*agregarContadores\(\[\s*\.\.\.colasIncid,\s*nTareasHoy\s*\]\)/)
})

test('colasIncid lleva todas las colas de los bloques de Hoy', () => {
  const m = src.match(/const colasIncid = \[([^\]]*)\]/)
  assert.ok(m, 'no se encontró colasIncid')
  for (const c of ['nPartes', 'nSupresiones', 'nQuejas', 'nCima', 'nRetencion', 'nRenovaciones', 'nLeads', 'nSustituciones', 'nDescuadres']) {
    assert.ok(m[1].includes(c), `falta ${c} en colasIncid: la franja no cuadraría con el badge`)
  }
})
