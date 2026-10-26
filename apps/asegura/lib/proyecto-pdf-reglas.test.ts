// Cepos del PDF del proyecto guardado (26/10/2026). `node --test`. Datos SINTÉTICOS.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  VALIDEZ_PROYECTO_DIAS, caducidadProyecto, estadoCaducidad, importesEnTexto, marcaPrecio, riesgoParaVerificar,
  textoVerificacion, validezDelPdf, verificacionDeJson, verificarProyectoPdf,
} from './proyecto-pdf-reglas.ts'

const PDF = 'Presupuesto. Matrícula 0000-AAA. Efecto: 01/11/2026. Prima total anual 1.234,56 €. Impuestos incluidos.'

test('verificación ok: prima del PDF, matrícula y fecha aparecen', () => {
  const v = verificarProyectoPdf({ texto: PDF, primaEur: 1234.56, primaPdfEur: 1234.56, matricula: '0000 aaa', fechaEfecto: '2026-11-01' })
  assert.equal(v.estado, 'ok')
  assert.deepEqual(v.campos, { prima: 'coincide', matricula: 'coincide', fechaEfecto: 'coincide' })
  assert.deepEqual(v.discrepancias, [])
})

test('verificación: la prima fuera de tolerancia (1 € / 1 %) es discrepancia; dentro, no', () => {
  const base = { texto: PDF, matricula: null, fechaEfecto: null }
  assert.equal(verificarProyectoPdf({ ...base, primaEur: 1234.0, primaPdfEur: 1234.56 }).campos.prima, 'coincide')
  assert.equal(verificarProyectoPdf({ ...base, primaEur: 1240.0, primaPdfEur: 1234.56 }).campos.prima, 'coincide') // 1 % de 1240 = 12,4
  const v = verificarProyectoPdf({ ...base, primaEur: 1300, primaPdfEur: 1234.56 })
  assert.equal(v.estado, 'discrepancia')
  assert.deepEqual(v.discrepancias, ['prima'])
})

test('verificación: sin prima leída del PDF se busca el importe en el texto', () => {
  const base = { texto: PDF, matricula: null, fechaEfecto: null, primaPdfEur: null }
  assert.equal(verificarProyectoPdf({ ...base, primaEur: 1234.56 }).campos.prima, 'coincide')
  assert.equal(verificarProyectoPdf({ ...base, primaEur: 999 }).campos.prima, 'no_aparece')
})

test('verificación: matrícula y fecha que no aparecen son discrepancia; null = no comprobado (no discrepancia)', () => {
  const v = verificarProyectoPdf({ texto: PDF, primaEur: 1234.56, primaPdfEur: 1234.56, matricula: '1111-BBB', fechaEfecto: '2026-12-01' })
  assert.equal(v.estado, 'discrepancia')
  assert.deepEqual(v.discrepancias, ['matrícula', 'fecha de efecto'])
  const n = verificarProyectoPdf({ texto: PDF, primaEur: null, primaPdfEur: null, matricula: null, fechaEfecto: null })
  assert.equal(n.estado, null)
  assert.deepEqual(n.campos, { prima: 'no_comprobado', matricula: 'no_comprobado', fechaEfecto: 'no_comprobado' })
})

test('verificación: fecha en formato largo y con ceros distintos', () => {
  const f = (texto: string) => verificarProyectoPdf({ texto, primaEur: null, primaPdfEur: null, matricula: null, fechaEfecto: '2026-11-01' }).campos.fechaEfecto
  assert.equal(f('Fecha de efecto: 1 de noviembre de 2026'), 'coincide')
  assert.equal(f('Efecto 1/11/2026'), 'coincide')
  assert.equal(f('Efecto 11/01/2026'), 'no_aparece')
})

test('textoVerificacion y verificacionDeJson: sin valores personales y ida y vuelta', () => {
  const v = verificarProyectoPdf({ texto: PDF, primaEur: 1234.56, primaPdfEur: 1234.56, matricula: '1111-BBB', fechaEfecto: null })
  const t = textoVerificacion(v)
  assert.equal(t, 'prima: coincide · matrícula: no aparece · fecha de efecto: no comprobada')
  assert.ok(!t.includes('1111'))
  assert.deepEqual(verificacionDeJson(JSON.parse(JSON.stringify(v))), v)
  assert.equal(verificacionDeJson(null), null)
  assert.equal(verificacionDeJson({ estado: 'ok' }), null)
})

test('importesEnTexto: miles con punto y coma decimal', () => {
  assert.deepEqual(importesEnTexto('a 1.234,56 € y 80,00 y 12.5'), [1234.56, 80])
})

test('riesgoParaVerificar: de info_riesgo y de la columna; lo que no consta es null', () => {
  assert.deepEqual(riesgoParaVerificar({ datosVehiculo: { matricula: '0000AAA' }, presupuestosCompanias: { formulario: { fechaEfecto: '2026-11-01' } } }, null), { matricula: '0000AAA', fechaEfecto: '2026-11-01' })
  assert.deepEqual(riesgoParaVerificar({ matricula: '0000AAA' }, '2026-12-01'), { matricula: '0000AAA', fechaEfecto: '2026-12-01' })
  assert.deepEqual(riesgoParaVerificar(null, null), { matricula: null, fechaEfecto: null })
  assert.deepEqual(riesgoParaVerificar({ datosVehiculo: { matricula: '  ' } }, null), { matricula: null, fechaEfecto: null })
})

test('validezDelPdf: fecha, días, y «vigencia» NO cuenta', () => {
  assert.deepEqual(validezDelPdf('Presupuesto válido hasta el 15/11/2026.'), { validoHasta: '2026-11-15', validezDias: null })
  assert.deepEqual(validezDelPdf('Oferta válida hasta el 3 de diciembre de 2026'), { validoHasta: '2026-12-03', validezDias: null })
  assert.deepEqual(validezDelPdf('Validez del presupuesto: 30 días'), { validoHasta: null, validezDias: 30 })
  assert.deepEqual(validezDelPdf('Vigencia: 01/11/2026 a 01/11/2027'), { validoHasta: null, validezDias: null })
  assert.deepEqual(validezDelPdf('Válido hasta el 31/02/2026'), { validoHasta: null, validezDias: null })
})

test('VALIDEZ_PROYECTO_DIAS: allianz/mapfre/generali desconocidas (no se inventa)', () => {
  for (const c of ['allianz', 'mapfre', 'generali']) assert.equal(VALIDEZ_PROYECTO_DIAS[c], null)
})

test('caducidadProyecto: PDF > portal > constante > desconocida', () => {
  const b = { guardadoEn: '2026-10-20', compania: 'Allianz', validoHastaPdf: null, validezDiasPdf: null, validaHastaPortal: null }
  assert.deepEqual(caducidadProyecto(b), { caduca: null, origen: 'desconocida' })
  assert.deepEqual(caducidadProyecto({ ...b, validaHastaPortal: '2026-11-30' }), { caduca: '2026-11-30', origen: 'portal' })
  assert.deepEqual(caducidadProyecto({ ...b, validaHastaPortal: '2026-11-30', validoHastaPdf: '2026-11-15' }), { caduca: '2026-11-15', origen: 'pdf' })
  assert.deepEqual(caducidadProyecto({ ...b, validezDiasPdf: 30 }), { caduca: '2026-11-19', origen: 'pdf' })
  assert.deepEqual(caducidadProyecto({ ...b, compania: 'otra' }), { caduca: null, origen: 'desconocida' })
})

test('estadoCaducidad: 5 días antes avisa; el día de caducidad aún vale; después caducado', () => {
  assert.equal(estadoCaducidad(null, '2026-10-26'), 'desconocida')
  assert.equal(estadoCaducidad('2026-11-01', '2026-10-26'), 'vigente') // 6 días
  assert.equal(estadoCaducidad('2026-10-31', '2026-10-26'), 'caduca_pronto') // 5 días
  assert.equal(estadoCaducidad('2026-10-26', '2026-10-26'), 'caduca_pronto')
  assert.equal(estadoCaducidad('2026-10-25', '2026-10-26'), 'caducado')
})

test('marcaPrecio: con supuestos / limpio / no consta', () => {
  assert.deepEqual(marcaPrecio(['Precio con supuestos: uso diario.', 'otro'], []), { estado: 'con_supuestos', supuestos: ['Precio con supuestos: uso diario.'] })
  assert.deepEqual(marcaPrecio([], ['Precio con supuestos: garaje.']), { estado: 'con_supuestos', supuestos: ['Precio con supuestos: garaje.'] })
  assert.deepEqual(marcaPrecio(['Vehículo según el catálogo de X: Y.'], []), { estado: 'limpio', supuestos: [] })
  assert.equal(marcaPrecio(undefined, undefined), null)
})
