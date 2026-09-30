import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RAMOS_VARIANTE, capitalDeRiesgo, etiquetaRiesgo, ramoConEnlaceDatos, ramoRetomable, ramoVariante, rutaVariante, viviendaDeRiesgo } from './variante.ts'
import { interpretarRiesgo } from '../../../../../lib/riesgo-asegura.ts'

function riesgo(ramo: string, datosRiesgo?: unknown, extra: Record<string, unknown> = {}) {
  const r = interpretarRiesgo(200, { estado: 'ok', oportunidad: { id: 'op1', clienteId: 'c1', ramo, ...extra }, roles: ['tomador'], figuras: [], vinculos: [], variantes: [], datosRiesgo })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') throw new Error('no se pudo leer')
  return r.riesgo
}

test('rutaVariante: la oportunidad viaja SIEMPRE (regla 9) y ?tarificacion= solo donde se puede retomar', () => {
  for (const r of RAMOS_VARIANTE) {
    const u = rutaVariante(r, 't1', 'op1', 'tar1')
    assert.match(u, new RegExp(`^/correduria/cliente/t1/${r}-nuevo\\?`), r)
    assert.match(u, /oportunidad=op1/, `${r}: sin oportunidad la tarificación quedaría suelta`)
    assert.equal(u.includes('tarificacion=tar1'), ramoRetomable(r), r)
  }
})

test('ramos: seis se pueden cotizar desde el riesgo, los que se cotizan fuera no; el enlace de datos sigue siendo de vehículo', () => {
  assert.deepEqual([...RAMOS_VARIANTE], ['auto', 'moto', 'hogar', 'vida', 'salud', 'decesos'])
  for (const r of ['responsabilidad_civil', 'comercio', 'comunidades', 'otros']) assert.equal(ramoVariante(r), null, r)
  assert.deepEqual(RAMOS_VARIANTE.filter(ramoConEnlaceDatos), ['auto', 'moto'], 'el formulario del portal es de coche y moto')
  assert.deepEqual(RAMOS_VARIANTE.filter(ramoRetomable), ['auto', 'moto'])
})

test('la vivienda y el capital del riesgo se sacan de su bloque, y de ningún otro', () => {
  const h = riesgo('hogar', { clave: 'datosVivienda', datos: { nombreVia: 'Socorro', numeroVia: '24' }, faltan: [] })
  assert.equal(viviendaDeRiesgo(h)?.nombreVia, 'Socorro')
  assert.equal(capitalDeRiesgo(h), null)
  const v = riesgo('vida', { clave: 'datosCapital', datos: { capital: 100000 }, faltan: [] })
  assert.deepEqual(capitalDeRiesgo(v), { capital: 100000, duracionAnios: null, modalidadDeseada: null })
  assert.equal(viviendaDeRiesgo(v), null)
  assert.equal(viviendaDeRiesgo(riesgo('hogar')), null, 'sin bloque = null, no una vivienda vacía')
})

test('la etiqueta del riesgo de hogar/libre sale de lo que se sabe; sin nada, null', () => {
  assert.equal(etiquetaRiesgo(riesgo('hogar', { clave: 'datosVivienda', datos: { nombreVia: 'Socorro', numeroVia: '24' }, faltan: [] })), 'Socorro 24')
  assert.equal(etiquetaRiesgo(riesgo('hogar', { clave: 'datosVivienda', datos: { direccion: 'Calle Socorro 24' }, faltan: [] })), 'Calle Socorro 24')
  assert.equal(etiquetaRiesgo(riesgo('comercio', { clave: 'datosComercio', datos: { actividad: 'Bar de Antonio', direccion: 'Calle A 1' } as never, faltan: [], dePoliza: false, tarifica: false })), 'Bar de Antonio')
  assert.equal(etiquetaRiesgo(riesgo('comercio', { clave: 'datosComercio', datos: { actividad: null, direccion: 'Calle A 1' } as never, faltan: [], dePoliza: false, tarifica: false })), 'Calle A 1')
  assert.equal(etiquetaRiesgo(riesgo('comercio', { clave: 'datosRiesgoLibre', datos: { descripcion: 'Bar de Antonio' }, faltan: [], tarifica: false })), 'Bar de Antonio')
  assert.equal(etiquetaRiesgo(riesgo('hogar')), null)
  assert.equal(etiquetaRiesgo(riesgo('auto', undefined, { matricula: '1234BCD', vehiculo: 'SEAT Ibiza' })), '1234BCD · SEAT Ibiza')
})
