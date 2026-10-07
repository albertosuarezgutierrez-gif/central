import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  RAMOS_VARIANTE, accionesPrecio, capitalDeRiesgo, etiquetaRiesgo, motivoSinPrecioRamo, ramoConEnlaceDatos, ramoRetomable, ramoVariante, retarificaEnRiesgo,
  rutaRetarificarPoliza, rutaVariante, viviendaDeRiesgo,
} from './variante.ts'
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
  assert.deepEqual(capitalDeRiesgo(v), { capital: 100000, modalidadDeseada: null, profesion: null, fumador: null, asegurados: null }, 'lo que no se sabe es null (ni 0, ni «no fuma», ni «ninguno»); la duración ya no existe')
  const pv = riesgo('vida', { clave: 'datosCapital', datos: { capital: 5, profesion: '2612', fumador: false }, faltan: [] })
  assert.deepEqual(capitalDeRiesgo(pv), { capital: 5, modalidadDeseada: null, profesion: '2612', fumador: false, asegurados: null })
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

// ─── Qué botón es el principal (07/10/2026) ──────────────────────────────────

test('🪤 el PRINCIPAL pide precio con los datos de la OPORTUNIDAD, con o sin póliza; retarificar la póliza solo es secundario', () => {
  for (const ramo of RAMOS_VARIANTE) {
    for (const polizaId of [null, 'p1']) {
      const a = accionesPrecio({ ramo, polizaId, tomadorId: 't1', oportunidadId: 'op1' })
      assert.equal(a.principal?.href, rutaVariante(ramo, 't1', 'op1'), `${ramo}/${polizaId}: el principal es la pantalla de precio con la oportunidad`)
      assert.match(a.principal?.href ?? '', /oportunidad=op1/)
      assert.doesNotMatch(a.principal?.href ?? '', /retarificar/, `${ramo}/${polizaId}: el principal NUNCA retarifica la póliza vieja`)
      const hayRetarificar = polizaId !== null && retarificaEnRiesgo(ramo)
      assert.equal(a.secundario !== null, hayRetarificar, `${ramo}/${polizaId}: retarificar solo con póliza y en auto/moto/hogar`)
      if (a.secundario) {
        assert.equal(a.secundario.href, rutaRetarificarPoliza('p1', 'op1'))
        assert.match(a.secundario.href, /^\/correduria\/poliza\/p1\/retarificar\?oportunidad=op1$/)
        assert.match(a.secundario.etiqueta, /datos de la póliza/, 'dice que usa los datos de la póliza')
        assert.match(a.secundario.nota, /NO los de arriba/)
        assert.notEqual(a.secundario.href, a.principal?.href)
      }
    }
  }
})

test('ramos sin tarifa de Codeoscopic: ningún botón de precio, ni con póliza', () => {
  for (const ramo of ['comercio', 'comunidades', 'responsabilidad_civil', 'otros']) {
    assert.deepEqual(accionesPrecio({ ramo, polizaId: 'p1', tomadorId: 't1', oportunidadId: 'op1' }), { principal: null, secundario: null }, ramo)
  }
})

test('«Pedir precio →» de los bloques: bloquea editar, guardar y un ramo sin tarifa; lo que falte NO bloquea (se pide en la pantalla de precio)', () => {
  assert.equal(motivoSinPrecioRamo({ ramoCotizable: true, editando: false, ocupado: false }), null)
  assert.match(motivoSinPrecioRamo({ ramoCotizable: true, editando: true, ocupado: false }) ?? '', /editar/)
  assert.match(motivoSinPrecioRamo({ ramoCotizable: true, editando: false, ocupado: true }) ?? '', /Guardando/)
  assert.match(motivoSinPrecioRamo({ ramoCotizable: false, editando: false, ocupado: false }) ?? '', /no se cotiza/)
})
