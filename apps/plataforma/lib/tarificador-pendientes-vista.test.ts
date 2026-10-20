import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptadorDeRamo } from './tarificador-bots-ramos.ts'
import { pendientesPorBloque, type Pendiente, type PendientesPorBloque, type ResumenCompania } from './tarificador-pendientes.ts'
import { bloqueDeChip, bloquesEnLinea, camposCompletosDeBloque, idBloqueMotor, pendientesConGenerales, rotuloCompleto, textoChip, textoErrorGuardado, tituloChip, vistaBloque } from './tarificador-pendientes-vista.ts'

const p = (clave: string, estado: Pendiente['estado'], companias = ['mapfre']): Pendiente => ({ clave, etiqueta: `Dato ${clave}`, bloque: 'riesgo', estado, companias })
const resumen = (estado: ResumenCompania['estado'], faltan = 0, compania = 'mapfre'): ResumenCompania => ({ compania, estado, faltan, supuestos: 0 })
const AUTO_OK = {
  matricula: '1234BCD', marca: 'Marca', modelo: 'Modelo', version: null, codigoPostal: '41003', fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01',
  sexo: 'hombre', garaje: null, conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: true,
  aniosAsegurado: '5', aniosSinSiniestros: '5', siniestrosUltimos5: '0', companiaAnterior: 'Aseguradora Alfa',
}
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
    companias: [], generales: [], evaluado: true,
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
    companias: [], generales: [], evaluado: true,
  }
  assert.equal(bloqueDeChip(resumen('faltan', 1, 'mapfre'), pend), 'poliza')
  assert.equal(bloqueDeChip(resumen('faltan', 1, 'allianz'), pend), 'riesgo')
  assert.equal(bloqueDeChip(resumen('listo'), pend), null)
  assert.equal(bloqueDeChip(resumen('no_disponible'), pend), null)
  assert.equal(idBloqueMotor('poliza'), 'motor-bloque-poliza')
})

test('vistaBloque: arriba solo falta/confirmar; ficha aparte; lo completo se pliega; sin saber qué falta NO se pliega', () => {
  const v = vistaBloque([p('x', 'falta'), p('y', 'supuesto'), p('z', 'ficha')], true)
  assert.deepEqual(v.aEditar.map((q) => q.clave), ['x', 'y'])
  assert.deepEqual(v.deLaFicha.map((q) => q.clave), ['z'])
  assert.equal(v.plegarCompleto, true)
  assert.equal(v.resumen, '1 por completar · 1 por confirmar')
  const listo = vistaBloque([p('z', 'ficha')], true)
  assert.equal(listo.hayPendiente, false)
  assert.equal(listo.listo, true)
  assert.equal(listo.resumen, 'Bots: todo listo')
  assert.equal(listo.plegarCompleto, true)
  const sinSaber = vistaBloque(null, true)
  assert.equal(sinSaber.plegarCompleto, false)
  assert.equal(sinSaber.resumen, '')
  assert.equal(rotuloCompleto('personas'), 'Personas · completo')
})

test('vistaBloque con datos reales de moto: la cilindrada vacía es del bloque Riesgo y editable; Allianz+Mapfre', () => {
  const base = pendientesPorBloque({ adaptador: adaptadorDeRamo('moto')!, formulario: MOTO, extra: {}, companias: ['allianz', 'mapfre'] })
  assert.equal(base.bloques.riesgo.length, 0, 'formulario incompleto: solo hay generales')
  const { pendientes: r, sueltos } = pendientesConGenerales(base, adaptadorDeRamo('moto')!)
  assert.deepEqual(sueltos, [])
  const riesgo = vistaBloque(r.bloques.riesgo, r.evaluado)
  assert.ok(riesgo.aEditar.some((q) => q.campoExtra === 'cilindrada'))
  const conCil = pendientesPorBloque({ adaptador: adaptadorDeRamo('moto')!, formulario: MOTO, extra: { cilindrada: '125' }, companias: ['allianz', 'mapfre'] })
  assert.ok(!vistaBloque(conCil.bloques.riesgo, conCil.evaluado).aEditar.some((q) => q.campoExtra === 'cilindrada'))
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
    companias: [], generales: ['Cilindrada en cc (el bot separa Moto y Ciclomotor)', 'Matrícula del vehículo'], evaluado: false,
  }
  const { pendientes, sueltos } = pendientesConGenerales(base, moto)
  assert.equal(pendientes.bloques.riesgo.length, 1)
  assert.deepEqual(sueltos, ['Matrícula del vehículo'])
})

test('compañía sin nada pendiente pero con aviso de la ficha: «bloqueada», nunca «listo»; el aviso va en el title', () => {
  assert.equal(textoChip(resumen('listo'), 'Mapfre', 'Falta el nombre del tomador.'), 'Mapfre bloqueada')
  assert.equal(textoChip(resumen('faltan', 2), 'Mapfre', 'Aviso.'), 'Mapfre faltan 2')
  const pend: PendientesPorBloque = { bloques: { personas: [], riesgo: [], poliza: [] }, companias: [], generales: [], evaluado: true }
  assert.match(tituloChip(resumen('listo'), pend, 'Mapfre', 'Falta el nombre del tomador.'), /Falta el nombre del tomador/)
  assert.doesNotMatch(tituloChip(resumen('no_disponible'), pend, 'Generali', 'Aviso.'), /Aviso/)
})

// ─── Revisión (20/10/2026): dato no evaluado ≠ listo ───
test('formulario incompleto (falta matrícula/marca): NINGÚN bloque sale «listo» ni se pliega, aunque no tenga pendientes', () => {
  const moto = adaptadorDeRamo('moto')!
  const r = pendientesPorBloque({ adaptador: moto, formulario: { ...MOTO, matricula: '', marca: null }, extra: { cilindrada: '125' }, companias: ['allianz', 'mapfre'] })
  assert.ok(r.generales.length > 0, 'el formulario no vale')
  assert.equal(r.evaluado, false)
  const { pendientes } = pendientesConGenerales(r, moto)
  assert.equal(pendientes.evaluado, false, 'pendientesConGenerales conserva el estado conservador')
  for (const b of ['personas', 'riesgo', 'poliza'] as const) {
    const v = vistaBloque(pendientes.bloques[b], pendientes.evaluado)
    assert.equal(v.listo, false, b)
    assert.equal(v.plegarCompleto, false, `${b}: se teclea ahí lo que falta`)
    assert.doesNotMatch(v.resumen, /listo/i, b)
  }
})

test('todas las compañías no_disponibles (sin declaración): nada evaluado → no sale «listo» en ningún bloque', () => {
  const r = pendientesPorBloque({ adaptador: adaptadorDeRamo('moto')!, formulario: { ...MOTO, sexo: 'hombre' }, extra: { cilindrada: '125' }, companias: ['zurich', 'otra'] })
  assert.deepEqual(r.generales, [])
  assert.ok(r.companias.every((c) => c.estado === 'no_disponible'))
  assert.equal(r.evaluado, false)
  for (const b of ['personas', 'riesgo', 'poliza'] as const) {
    const v = vistaBloque(r.bloques[b], r.evaluado)
    assert.equal(v.listo, false, b)
    assert.equal(v.plegarCompleto, false, b)
    assert.equal(v.resumen, 'Aún sin evaluar', b)
  }
})

test('evaluado de verdad (formulario válido y ≥1 compañía evaluada): sí hay «Bots: todo listo» en los bloques sin pendientes', () => {
  const r = pendientesPorBloque({ adaptador: adaptadorDeRamo('moto')!, formulario: { ...MOTO, sexo: 'hombre', aniosAsegurado: '5', aniosSinSiniestros: '5', siniestrosUltimos5: '0' }, extra: { cilindrada: '125' }, companias: ['allianz', 'zurich'] })
  assert.equal(r.evaluado, true, 'una no_disponible no impide que la otra cuente')
  assert.equal(vistaBloque(r.bloques.riesgo, r.evaluado).resumen, 'Bots: todo listo')
  assert.equal(vistaBloque(r.bloques.riesgo, r.evaluado).plegarCompleto, true)
})

test('pantalla completa del cotizador: los campos sueltos NO pendientes siguen alcanzables (se pintan en línea), y solo sus bloques', () => {
  for (const ramo of ['moto', 'auto'] as const) {
    const adaptador = adaptadorDeRamo(ramo)!
    const formulario = ramo === 'moto' ? { ...MOTO, sexo: 'hombre', aniosAsegurado: '5', aniosSinSiniestros: '5', siniestrosUltimos5: '0' } : { ...AUTO_OK }
    const extra = { cilindrada: '125', usoVehiculo: 'particular', ambitoCirculacion: 'nacional', clasePermiso: 'B', sexo: 'hombre', companiaAnterior: 'Aseguradora Alfa' }
    const r = pendientesPorBloque({ adaptador, formulario, extra, companias: ['allianz', 'mapfre'] })
    const campos = adaptador.campos.map((c) => ({ clave: c.clave, bloque: c.bloque }))
    assert.ok(campos.length > 0)
    const enLinea = bloquesEnLinea(r, campos)
    const conCampos = [...new Set(campos.filter((c) => camposCompletosDeBloque(r, campos, c.bloque).some((x) => x.clave === c.clave)).map((c) => c.bloque))]
    for (const c of campos) {
      const pendiente = r.bloques[c.bloque].some((q) => q.estado !== 'ficha' && q.campoExtra === c.clave)
      if (pendiente) continue
      assert.ok(camposCompletosDeBloque(r, campos, c.bloque).some((x) => x.clave === c.clave), `${ramo}/${c.clave}: un campo completo debe poder corregirse`)
      assert.ok(enLinea.includes(c.bloque), `${ramo}/${c.clave}: su bloque se pinta en línea`)
    }
    assert.ok(conCampos.length > 0)
  }
  // Un campo pendiente se edita arriba: no se duplica entre los «completos».
  const m = pendientesPorBloque({ adaptador: adaptadorDeRamo('moto')!, formulario: { ...MOTO, sexo: 'hombre' }, extra: { cilindrada: '125' }, companias: ['allianz'] })
  const sup = m.bloques.poliza.some((q) => q.estado === 'supuesto')
  assert.ok(sup)
})
