import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptadorDeRamo } from './tarificador-bots-ramos.ts'
import { pendientesPorBloque, type Pendiente, type PendientesPorBloque, type ResumenCompania } from './tarificador-pendientes.ts'
import { bloqueDeChip, idBloqueMotor, pendientesConGenerales, rotuloCompleto, textoChip, textoErrorGuardado, tituloChip, vistaBloque } from './tarificador-pendientes-vista.ts'

const p = (clave: string, estado: Pendiente['estado'], companias = ['mapfre']): Pendiente => ({ clave, etiqueta: `Dato ${clave}`, bloque: 'riesgo', estado, companias })
const resumen = (estado: ResumenCompania['estado'], faltan = 0, compania = 'mapfre'): ResumenCompania => ({ compania, estado, faltan, supuestos: 0 })
const MOTO = {
  matricula: '1234BCD', marca: 'Honda', modelo: 'PCX', version: null, codigoPostal: '41003', fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01',
  sexo: null, conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: true, aniosAsegurado: '', aniosSinSiniestros: '', siniestrosUltimos5: '',
}

test('chips: listo · faltan n · no disponible (singular y plural)', () => {
  assert.equal(textoChip(resumen('listo'), 'Allianz'), 'Allianz listo')
  assert.equal(textoChip(resumen('faltan', 2), 'Mapfre'), 'Mapfre faltan 2')
  assert.equal(textoChip(resumen('faltan', 1), 'Mapfre'), 'Mapfre falta 1')
  assert.equal(textoChip(resumen('no_disponible'), 'Generali'), 'Generali no disponible')
})

test('title del chip: lista etiquetas pendientes y por confirmar; lo de la ficha no cuenta; no disponible nunca dice «listo»', () => {
  const pend: PendientesPorBloque = {
    bloques: { personas: [p('a', 'ficha')], riesgo: [p('b', 'falta'), p('c', 'supuesto')], poliza: [] },
    companias: [], generales: [],
  }
  const t = tituloChip(resumen('faltan', 2), pend, 'Mapfre')
  assert.match(t, /falta Dato b/)
  assert.match(t, /Confirmar: Dato c/)
  assert.doesNotMatch(t, /Dato a/)
  assert.doesNotMatch(tituloChip(resumen('no_disponible'), pend, 'Generali'), /listo/i)
  assert.match(tituloChip(resumen('listo'), pend, 'Allianz'), /no queda nada/)
})

test('el chip lleva al primer bloque con algo de ESA compañía; listo/no disponible no llevan a ninguno', () => {
  const pend: PendientesPorBloque = {
    bloques: { personas: [p('a', 'ficha')], riesgo: [p('b', 'falta', ['allianz'])], poliza: [p('c', 'supuesto', ['mapfre'])] },
    companias: [], generales: [],
  }
  assert.equal(bloqueDeChip(resumen('faltan', 1, 'mapfre'), pend), 'poliza')
  assert.equal(bloqueDeChip(resumen('faltan', 1, 'allianz'), pend), 'riesgo')
  assert.equal(bloqueDeChip(resumen('listo'), pend), null)
  assert.equal(bloqueDeChip(resumen('no_disponible'), pend), null)
  assert.equal(idBloqueMotor('poliza'), 'motor-bloque-poliza')
})

test('vistaBloque: arriba solo falta/confirmar; ficha aparte; lo completo se pliega; sin saber qué falta NO se pliega', () => {
  const v = vistaBloque([p('x', 'falta'), p('y', 'supuesto'), p('z', 'ficha')])
  assert.deepEqual(v.aEditar.map((q) => q.clave), ['x', 'y'])
  assert.deepEqual(v.deLaFicha.map((q) => q.clave), ['z'])
  assert.equal(v.plegarCompleto, true)
  assert.equal(v.resumen, '1 por completar · 1 por confirmar')
  const listo = vistaBloque([p('z', 'ficha')])
  assert.equal(listo.hayPendiente, false)
  assert.equal(listo.resumen, 'Todo listo')
  assert.equal(listo.plegarCompleto, true)
  const sinSaber = vistaBloque(null)
  assert.equal(sinSaber.plegarCompleto, false)
  assert.equal(sinSaber.resumen, '')
  assert.equal(rotuloCompleto('personas'), 'Personas · completo')
})

test('vistaBloque con datos reales de moto: la cilindrada vacía es del bloque Riesgo y editable; Allianz+Mapfre', () => {
  const base = pendientesPorBloque({ adaptador: adaptadorDeRamo('moto')!, formulario: MOTO, extra: {}, companias: ['allianz', 'mapfre'] })
  assert.equal(base.bloques.riesgo.length, 0, 'formulario incompleto: solo hay generales')
  const { pendientes: r, sueltos } = pendientesConGenerales(base, adaptadorDeRamo('moto')!)
  assert.deepEqual(sueltos, [])
  const riesgo = vistaBloque(r.bloques.riesgo)
  assert.ok(riesgo.aEditar.some((q) => q.campoExtra === 'cilindrada'))
  const conCil = pendientesPorBloque({ adaptador: adaptadorDeRamo('moto')!, formulario: MOTO, extra: { cilindrada: '125' }, companias: ['allianz', 'mapfre'] })
  assert.ok(!vistaBloque(conCil.bloques.riesgo).aEditar.some((q) => q.campoExtra === 'cilindrada'))
})

test('error de guardado: usa el texto del servidor saneado (sin DNI, correo, IBAN ni números largos) y nunca dice «guardado»', () => {
  const t = textoErrorGuardado(422, { estado: 'invalido', motivo: 'Dice que no tiene seguro; contacto juan@ejemplo.es, 12345678Z, ES9121000418450200051332.' })
  assert.doesNotMatch(t, /@|12345678|ES91/)
  assert.match(t, /no tiene seguro/)
  assert.doesNotMatch(t, /guardad/i)
  assert.ok(textoErrorGuardado(422, { motivo: 'x'.repeat(500) }).length <= 161)
  assert.match(textoErrorGuardado(422, null), /no cuadra/)
  assert.match(textoErrorGuardado(0, null), /conectar/)
  assert.match(textoErrorGuardado(400, {}), /no lo ha aceptado/)
})

test('generales que no son un campo suelto se quedan sueltos; no se duplica un campo ya pendiente', () => {
  const moto = adaptadorDeRamo('moto')!
  const base: PendientesPorBloque = {
    bloques: { personas: [], riesgo: [{ ...p('seleccionVehiculo.cilindradaCc', 'falta'), campoExtra: 'cilindrada' }], poliza: [] },
    companias: [], generales: ['Cilindrada en cc (el bot separa Moto y Ciclomotor)', 'Matrícula del vehículo'],
  }
  const { pendientes, sueltos } = pendientesConGenerales(base, moto)
  assert.equal(pendientes.bloques.riesgo.length, 1)
  assert.deepEqual(sueltos, ['Matrícula del vehículo'])
})

test('compañía sin nada pendiente pero con aviso de la ficha: «bloqueada», nunca «listo»; el aviso va en el title', () => {
  assert.equal(textoChip(resumen('listo'), 'Mapfre', 'Falta el nombre del tomador.'), 'Mapfre bloqueada')
  assert.equal(textoChip(resumen('faltan', 2), 'Mapfre', 'Aviso.'), 'Mapfre faltan 2')
  const pend: PendientesPorBloque = { bloques: { personas: [], riesgo: [], poliza: [] }, companias: [], generales: [] }
  assert.match(tituloChip(resumen('listo'), pend, 'Mapfre', 'Falta el nombre del tomador.'), /Falta el nombre del tomador/)
  assert.doesNotMatch(tituloChip(resumen('no_disponible'), pend, 'Generali', 'Aviso.'), /Aviso/)
})
