// Guardián: el gate del auditor NO se rompe porque una sesión anote memoria.
//
// `estructura.generated.json` incrusta el bloque `novedades`, derivado de
// `docs/CONTEXTO-SESIONES.md`, donde escribe TODA sesión al cerrar (hook `Stop`). Antes de
// esto (02/09/2026, PRs #2044 y #2053), eso bastaba para que `auditar-estructura.mjs --check`
// declarase el generado «desfasado» sin que hubiera cambiado una línea de código — y un gate
// que se rompe solo se acaba ignorando, con lo que deja de avisar del desfase que SÍ importa.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estableJson, estableMd, estableMapa, sinSeccionNovedades } from '../scripts/auditar-comparacion.mjs'

const RADIOGRAFIA = {
  generadoEn: '2026-09-02T11:00:00Z',
  verticales: ['alquiler', 'plataforma'],
  novedades: [{ titulo: 'Lo de ayer', fecha: '01/09/2026' }],
  gaps: { reimplementaciones: [] },
}

test('anotar memoria NO desfasa la radiografía', () => {
  const conMemoriaNueva = { ...RADIOGRAFIA, novedades: [{ titulo: 'Lo de hoy', fecha: '02/09/2026' }] }
  assert.equal(estableJson(RADIOGRAFIA), estableJson(conMemoriaNueva))
})

test('un cambio ESTRUCTURAL sí la desfasa (el gate sigue sirviendo para algo)', () => {
  const conAppNueva = { ...RADIOGRAFIA, verticales: ['alquiler', 'plataforma', 'mariscos'] }
  assert.notEqual(estableJson(RADIOGRAFIA), estableJson(conAppNueva))

  const conAviso = { ...RADIOGRAFIA, gaps: { reimplementaciones: [{ capacidad: 'almacen-stock' }] } }
  assert.notEqual(estableJson(RADIOGRAFIA), estableJson(conAviso))
})

test('el timestamp no cuenta (evita churn y auto-commits en bucle)', () => {
  assert.equal(estableJson(RADIOGRAFIA), estableJson({ ...RADIOGRAFIA, generadoEn: '2030-01-01T00:00:00Z' }))
  assert.equal(estableMapa({ generadoEn: 'x', sha: 'a1' }), estableMapa({ generadoEn: 'y', sha: 'b2' }))
})

test('el markdown ignora timestamp y novedades, pero NO el cuerpo', () => {
  const md = (novedad: string) =>
    `# Mapa (2026-09-02T11:00:00Z)\n\n## Apps\n- alquiler\n\n## Novedades recientes\n- ${novedad}\n`
  assert.equal(estableMd(md('lo de ayer')), estableMd(md('lo de hoy')))
  assert.notEqual(estableMd(md('x')), estableMd(md('x').replace('- alquiler', '- alquiler\n- mariscos')))
})

test('sin sección de novedades, el markdown se compara entero', () => {
  const md = '# Mapa\n\n## Apps\n- alquiler\n'
  assert.equal(sinSeccionNovedades(md), md)
})
