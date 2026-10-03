import test from 'node:test'
import assert from 'node:assert/strict'
import { formDeCompanias, porCompaniaAMandar, capitalesDeFilas, filaCapitalVacia, filasDeCapitales, filasDeMedidas, listaAMandar, medidasDeFilas } from './piezas-comercio.ts'

const guardados = [{ bien: 'CONTENIDO' as const, importe: 20000, modalidad: null, descripcion: null }]

test('filas ↔ lista: null y [] son «sin filas»; una fila en blanco no viaja; el importe se lee en español', () => {
  assert.deepEqual(filasDeCapitales(null), [])
  assert.deepEqual(filasDeCapitales([]), [])
  assert.deepEqual(capitalesDeFilas([filaCapitalVacia()]), [])
  assert.deepEqual(capitalesDeFilas([{ bien: 'MERCADERIAS', importe: '10.000,50', modalidad: '', descripcion: '' }]),
    [{ bien: 'MERCADERIAS', importe: 10000.5, modalidad: null, descripcion: null }])
  // Elegir el bien sin importe NO se descarta: el servidor dice «falta el importe» en vez de perder la fila en silencio.
  assert.deepEqual(capitalesDeFilas([{ bien: 'RC', importe: '', modalidad: '', descripcion: '' }]), [{ bien: 'RC', importe: null, modalidad: null, descripcion: null }])
  assert.deepEqual(capitalesDeFilas([{ bien: 'RC', importe: 'mucho', modalidad: '', descripcion: '' }])[0].importe, 'mucho')
  assert.deepEqual(medidasDeFilas([{ medida: '', valor: '' }, { medida: ' Alarma ', valor: '' }]), [{ medida: 'Alarma', valor: null }])
  assert.deepEqual(filasDeMedidas([{ medida: 'Alarma', valor: null }]), [{ medida: 'Alarma', valor: '' }])
})

test('listaAMandar: solo si difiere; sin filas sobre null no inventa «revisado»; sin filas sobre datos es borrar', () => {
  assert.equal(listaAMandar(guardados, capitalesDeFilas(filasDeCapitales(guardados))), undefined, 'lo mismo → no se manda')
  assert.equal(listaAMandar(null, []), undefined)
  assert.equal(listaAMandar([], []), undefined)
  assert.deepEqual(listaAMandar(guardados, []), [])
  assert.deepEqual(listaAMandar(guardados, [{ bien: 'CONTENIDO', importe: 25000, modalidad: null, descripcion: null }]), [{ bien: 'CONTENIDO', importe: 25000, modalidad: null, descripcion: null }])
  assert.equal(listaAMandar(null, [{ bien: 'RC', importe: 1, modalidad: null, descripcion: null }])?.length, 1)
})

test('porCompania: el formulario guarda null como vacío, y solo se manda lo que cambia', () => {
  const guardado = { occident: { aforoMaximo: 60, colectivo: false, descuento: null } } as never
  const f = formDeCompanias(guardado)
  assert.equal(f.occident.aforoMaximo, '60')
  assert.equal(f.occident.colectivo, 'no')
  assert.equal(f.occident.descuento, '', 'null no es 0 ni «No»')
  assert.equal(f.reale.sotano, '')
  assert.equal(porCompaniaAMandar(guardado, f), undefined, 'sin tocar no se manda nada ni se inventa un bloque')
  assert.equal(porCompaniaAMandar(null, formDeCompanias(null)), undefined)
  const g = { ...f, occident: { ...f.occident, aforoMaximo: '75', colectivo: '' }, reale: { ...f.reale, sotano: 'si', capitalDanosEsteticos: '1.500,50' } }
  assert.deepEqual(porCompaniaAMandar(guardado, g), { occident: { aforoMaximo: 75, colectivo: null }, reale: { sotano: true, capitalDanosEsteticos: 1500.5 } })
})
