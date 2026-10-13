// El badge de la pestaña «Gestión» (antes «Hoy») y el encabezado «Avisos» del cockpit cuentan LAS MISMAS colas.
// Antes el badge sumaba diez y la celda de la franja cinco: dos números que no
// se podían reconciliar en la misma pantalla (26/09/2026). La fuente única es
// `colasIncid`. Desde el 13/10/2026 la franja y las tareas de hoy viven en «Mi mesa», así que
// el badge = colasIncid a secas, y renovaciones/leads/tareas ya no suman aquí (no se pintan aquí).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../apps/plataforma/app/(usuario)/correduria/CorreduriaClient.tsx', import.meta.url), 'utf8')

test('el badge de «Gestión» se construye desde colasIncid, no con su propia lista', () => {
  // «Clientes» ya no lleva badge (30/09/2026): el bloque de «gestion» acaba donde empieza «comisiones».
  const ini = src.indexOf('gestion: {')
  const fin = src.indexOf('comisiones: {', ini)
  assert.ok(ini >= 0 && fin > ini, 'no se encontró el bloque de contadores de «gestion»')
  const gestion = src.slice(ini, fin)
  assert.match(gestion, /contador:\s*agregarContadores\(colasIncid\)/)
  assert.doesNotMatch(gestion, /nTareasHoy/, 'las tareas de hoy viven en «Mi mesa»: no pueden sumar en un badge que no las enseña')
})

test('colasIncid lleva todas las colas de los bloques de Gestión (y solo esas)', () => {
  const m = src.match(/const colasIncid = \[([^\]]*)\]/)
  assert.ok(m, 'no se encontró colasIncid')
  for (const c of ['nPartes', 'nSupresiones', 'nCambiosCuenta', 'nQuejas', 'nCima', 'nRetencion', 'nSustituciones', 'nDescuadres']) {
    assert.ok(m[1].includes(c), `falta ${c} en colasIncid: el encabezado «Avisos» no cuadraría con el badge`)
  }
  // Lo que ya no se pinta en «Gestión» no puede seguir sumando en su badge (contaría trabajo que no se ve ahí).
  for (const c of ['nRenovaciones', 'nLeads']) assert.ok(!m[1].includes(c), `${c} sigue en colasIncid pero su bloque ya no está en «Gestión»`)
})
