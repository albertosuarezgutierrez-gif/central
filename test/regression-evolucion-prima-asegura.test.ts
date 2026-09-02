// «¿Por qué ha subido la prima?» en plataforma: los lectores del bloque que
// manda asegura y la pantalla que lo pinta.
//
// La regla que se protege: `null` (asegura no lo manda) ≠ `sin_datos` (se miró
// y CIMA no da la anualidad anterior) ≠ `igual` (se comparó y no cambió). Un
// lector que colapsara el primero en cualquiera de los otros dos diría algo
// sobre una póliza de la que no se sabe nada.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { interpretarFicha, leerEvolucionCompacta, leerEvolucionPrima } from '../apps/plataforma/lib/ficha-asegura.ts'
import { interpretarPoliza } from '../apps/plataforma/lib/poliza-asegura.ts'

const ANUALIDAD = {
  desde: '2024-10-01', hasta: '2025-09-30', recibos: 2, esperados: 2, completa: true,
  primaTotal: 207.9, primaNeta: 190.12, suplementos: 0, siniestros: 0, variacionPct: null,
}
const EVOLUCION = {
  anualidades: [
    ANUALIDAD,
    { ...ANUALIDAD, desde: '2025-10-01', hasta: '2026-09-30', primaTotal: 236.96, primaNeta: 216.7, siniestros: 1, variacionPct: 14 },
  ],
  veredicto: 'sube_sin_siniestro',
  variacionPct: 14,
  siniestrosSinFecha: 0,
  explicacion: 'Sube +14,0 % SIN siniestros en el ciclo anterior: no hay penalización que lo justifique → candidata a retarificar.',
}

const POLIZA = {
  id: 'p1', cliente: { id: 'c1', nombre: 'Jose Suarez Salas' }, tipo: 'auto', aseguradora: 'Mapfre',
  estado: 'activa', viva: true, prima: 236.96, coberturas: [], listaRecibos: [], siniestros: [], intervinientes: [],
}
const FICHA = {
  id: 'c1', nombre: 'Jose Suarez Salas', tipo: 'cliente',
  polizas: [{ id: 'p1', tipo: 'auto', aseguradora: 'Mapfre', estado: 'activa', viva: true, prima: 236.96 }],
}

test('el caso completo pasa entero por los dos lectores', () => {
  const entero = leerEvolucionPrima(EVOLUCION)
  assert.deepEqual(entero, EVOLUCION)
  const compacta = leerEvolucionCompacta({ veredicto: 'igual', variacionPct: 0.2, explicacion: 'La prima no ha cambiado (+0,2 %).' })
  assert.deepEqual(compacta, { veredicto: 'igual', variacionPct: 0.2, explicacion: 'La prima no ha cambiado (+0,2 %).' })
})

test('🚨 ausente (asegura vieja) → null, jamás un sin_datos inventado ni variacionPct 0', () => {
  assert.equal(leerEvolucionPrima(undefined), null)
  assert.equal(leerEvolucionPrima(null), null)
  assert.equal(leerEvolucionCompacta(undefined), null)
  assert.equal(leerEvolucionCompacta('sube'), null)

  const p = interpretarPoliza(200, { estado: 'ok', poliza: POLIZA })
  assert.equal(p.estado, 'ok')
  if (p.estado !== 'ok') return
  assert.equal(p.poliza.evolucionPrima, null)

  const f = interpretarFicha(200, { estado: 'ok', ficha: FICHA })
  assert.equal(f.estado, 'ok')
  if (f.estado !== 'ok') return
  assert.equal(f.ficha.polizas[0].evolucionPrima, null)
})

test('🚨 sin_datos SÍ es un dato: se conserva tal cual, distinto de null', () => {
  const r = leerEvolucionPrima({ anualidades: [], veredicto: 'sin_datos', variacionPct: null, siniestrosSinFecha: 2, explicacion: 'CIMA no ha mandado recibos de renovación de esta póliza: no se puede comparar anualidades.' })
  assert.ok(r)
  assert.equal(r.veredicto, 'sin_datos')
  assert.equal(r.variacionPct, null)
  assert.equal(r.siniestrosSinFecha, 2)
  assert.deepEqual(r.anualidades, [])
})

test('🚨 un veredicto fuera del enum tumba el bloque entero → null', () => {
  assert.equal(leerEvolucionPrima({ ...EVOLUCION, veredicto: 'sube_mucho' }), null)
  assert.equal(leerEvolucionCompacta({ veredicto: 'desconocido', variacionPct: 3, explicacion: 'x' }), null)
  assert.equal(leerEvolucionCompacta({ veredicto: null, variacionPct: 3, explicacion: 'x' }), null)
  // Y en la ficha del cliente: la basura no tumba la ficha, pero el bloque queda en null.
  const f = interpretarFicha(200, { estado: 'ok', ficha: { ...FICHA, polizas: [{ ...FICHA.polizas[0], evolucionPrima: { veredicto: 'raro', variacionPct: 1, explicacion: 'x' } }] } })
  assert.equal(f.estado, 'ok')
  if (f.estado !== 'ok') return
  assert.equal(f.ficha.polizas[0].evolucionPrima, null)
})

test('🚨 una lista rara de anualidades → bloque entero null (media lista compara mal)', () => {
  assert.equal(leerEvolucionPrima({ ...EVOLUCION, anualidades: 'dos' }), null)
  assert.equal(leerEvolucionPrima({ ...EVOLUCION, anualidades: null }), null)
  const { anualidades: _a, ...sinLista } = EVOLUCION
  assert.equal(leerEvolucionPrima(sinLista), null)
  // Una anualidad con un campo basura tumba el bloque: no se pinta un % sobre ciclos que no están.
  assert.equal(leerEvolucionPrima({ ...EVOLUCION, anualidades: [ANUALIDAD, { ...ANUALIDAD, primaTotal: 'doscientos' }] }), null)
  assert.equal(leerEvolucionPrima({ ...EVOLUCION, anualidades: [ANUALIDAD, 'basura'] }), null)
  assert.equal(leerEvolucionPrima({ ...EVOLUCION, anualidades: [{ ...ANUALIDAD, completa: 'sí' }] }), null)
})

test('🚨 variacionPct basura o explicación ausente → null; un null legítimo se queda en null', () => {
  assert.equal(leerEvolucionCompacta({ veredicto: 'baja', variacionPct: '-3', explicacion: 'x' }), null)
  assert.equal(leerEvolucionCompacta({ veredicto: 'baja', variacionPct: -3 }), null)
  assert.equal(leerEvolucionPrima({ ...EVOLUCION, siniestrosSinFecha: 'uno' }), null)
  const r = leerEvolucionCompacta({ veredicto: 'sin_datos', variacionPct: null, explicacion: 'x' })
  assert.equal(r?.variacionPct, null)
})

test('la póliza entera lleva el bloque con sus anualidades', () => {
  const p = interpretarPoliza(200, { estado: 'ok', poliza: { ...POLIZA, evolucionPrima: EVOLUCION } })
  assert.equal(p.estado, 'ok')
  if (p.estado !== 'ok') return
  assert.equal(p.poliza.evolucionPrima?.anualidades.length, 2)
  assert.equal(p.poliza.evolucionPrima?.anualidades[1].variacionPct, 14)
  assert.equal(p.poliza.evolucionPrima?.veredicto, 'sube_sin_siniestro')
})

// ── La pantalla: sin «no lo sé» disfrazado de dato y sin colores a ojo ──────

test('🚨 EvolucionPrima.tsx no colapsa null a 0/sin_datos ni usa hex', () => {
  const src = readFileSync(new URL('../apps/plataforma/app/(usuario)/correduria/EvolucionPrima.tsx', import.meta.url), 'utf8')
  for (const patron of [/\?\?\s*0\b/, /\|\|\s*0\b/, /\?\?\s*'sin_datos'/, /#[0-9a-fA-F]{3,6}\b/]) {
    assert.doesNotMatch(src, patron, `EvolucionPrima.tsx contiene ${patron}`)
  }
  // Y las tres cosas distintas están en pantalla: «no disponible» (null) no es la etiqueta de sin_datos.
  assert.match(src, /evolución no disponible/)
  assert.match(src, /etiquetaVeredictoPrima/)
  assert.match(src, /UMBRAL_SUBIDA_GENERAL_PCT/)
})
