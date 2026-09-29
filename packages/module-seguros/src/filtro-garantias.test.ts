import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { EstadoGarantia, GarantiasClasificadas } from './catalogo-garantias.ts'
import { diferenciasDeOpcion } from './filtro-garantias.ts'

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
