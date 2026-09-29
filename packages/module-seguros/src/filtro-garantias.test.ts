import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { EstadoGarantia, GarantiasClasificadas } from './catalogo-garantias.ts'
import { clasificarCoberturas, etiquetasGarantiasDeLey } from './catalogo-garantias.ts'
import { diferenciasDeOpcion, interruptoresGarantias } from './filtro-garantias.ts'

test('diferencias entre opciones: solo donde no dicen lo mismo; una sin leer ni aporta ni recibe', () => {
  const g = (porClave: Record<string, EstadoGarantia>): GarantiasClasificadas => ({ version: 1, porClave })
  const allianz = { id: 'a', compania: 'Allianz', primaEur: 300, garantias: g({ asistencia_viaje: 'si', asistencia_ampliada: 'no', lunas: 'si' }) }
  const mapfre = { id: 'm', compania: 'Mapfre', primaEur: 310, garantias: g({ asistencia_viaje: 'si', asistencia_ampliada: 'no_consta', lunas: 'si' }) }
  const sinLeer = { id: 'x', compania: 'Reale', primaEur: 290, garantias: null }
  const todas = [allianz, mapfre, sinLeer]
  assert.deepEqual(diferenciasDeOpcion('auto', allianz, todas), { noIncluye: ['Asistencia en viaje ampliada'], sinConfirmar: [] })
  assert.deepEqual(diferenciasDeOpcion('auto', mapfre, todas), { noIncluye: [], sinConfirmar: ['Asistencia en viaje ampliada'] })
  assert.equal(diferenciasDeOpcion('auto', sinLeer, todas), null)
  // Sola en la parrilla no hay con quién compararla.
  assert.deepEqual(diferenciasDeOpcion('auto', allianz, [allianz]), { noIncluye: [], sinConfirmar: [] })
})

test('RC obligatoria (auto/moto): la da la ley — sí siempre, sin interruptor, nunca diferencia (29/09/2026)', () => {
  const g = (porClave: Record<string, EstadoGarantia>): GarantiasClasificadas => ({ version: 1, porClave })
  // Precio guardado antes de este cambio: la RC obligatoria quedó «no consta» en uno y «sí» en otro.
  const a = { id: 'a', compania: 'Allianz', primaEur: 188, garantias: g({ rc_obligatoria: 'si', robo: 'si' }) }
  const b = { id: 'b', compania: 'Reale', primaEur: 243, garantias: g({ rc_obligatoria: 'no_consta', robo: 'si' }) }
  assert.ok(!interruptoresGarantias('moto', [a, b]).some((i) => i.clave === 'rc_obligatoria'))
  assert.deepEqual(diferenciasDeOpcion('moto', b, [a, b]), { noIncluye: [], sinConfirmar: [] })
  assert.deepEqual(etiquetasGarantiasDeLey('moto'), ['Responsabilidad civil obligatoria'])
  assert.deepEqual(etiquetasGarantiasDeLey('hogar'), [])
  // Clasificación nueva: sí aunque la compañía no la nombre.
  assert.equal(clasificarCoberturas('auto', [{ nombre: 'Lunas', incluida: true }]).porClave.rc_obligatoria, 'si')
  assert.equal(clasificarCoberturas('auto', null).porClave.rc_obligatoria, 'si')
  assert.equal(clasificarCoberturas('hogar', null).porClave.rc_obligatoria, undefined)
})
