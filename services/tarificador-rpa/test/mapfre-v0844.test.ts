// Mapfre auto v0.8.44 · dos diálogos apilados («Operación consolidada» + alta de cliente), «Nº Proyecto: X» y el icono picture_as_pdf. Datos SINTÉTICOS.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clasificarDialogoMapfre, esBotonDescargaProyecto, esDialogoConsolidadoMapfre, numeroProyectoMapfreNuevo, puntuarBotonDescargaProyecto } from '../src/guard.ts'
import { mapfreAuto } from '../src/adapters/mapfre/auto.ts'

const CONS = 'Operación consolidada correctamente Cliente Prueba: 12345Y67890'
const ALTA = 'warning ¿Desea dar de alta al cliente en el CRM Mapfre al contratar esta póliza? ¡Mapfre! info_outlined Mapfre'

test('v0.8.44 · versión', () => assert.equal(mapfreAuto.version, '0.8.48'))

test('clasificarDialogoMapfre: textos reales → consolidada (Aceptar) / alta (No, Sí); el resto, otro', () => {
  assert.equal(clasificarDialogoMapfre(CONS, ['Aceptar']), 'consolidada')
  assert.equal(clasificarDialogoMapfre(`info_outlined ${CONS}`, ['Aceptar']), 'consolidada')
  assert.equal(clasificarDialogoMapfre(`info_outlined${CONS}`, ['Aceptar']), 'consolidada', 'textContent sin separador tras el icono')
  assert.equal(clasificarDialogoMapfre(ALTA, ['No', 'Sí']), 'alta')
  assert.equal(clasificarDialogoMapfre('Para continuar debe realizar el pago', ['Aceptar']), 'otro')
})

test('esDialogoConsolidadoMapfre: solo UN botón «Aceptar»; nada de emitir/contratar/pagar/firmar/cuenta en el texto; otros botones paran', () => {
  assert.equal(esDialogoConsolidadoMapfre(CONS, ['Aceptar']), true)
  assert.equal(esDialogoConsolidadoMapfre(CONS, ['Aceptar', 'Cancelar']), false)
  assert.equal(esDialogoConsolidadoMapfre(CONS, ['Contratar']), false)
  assert.equal(esDialogoConsolidadoMapfre(CONS, []), false)
  for (const resto of ['y se emitirá la póliza', 'pague ahora', 'introduzca IBAN', 'firme el contrato', 'cuenta bancaria', '<script>x</script>']) {
    assert.equal(esDialogoConsolidadoMapfre(`Operación consolidada correctamente ${resto}`, ['Aceptar']), false, resto)
  }
  assert.equal(esDialogoConsolidadoMapfre(`Operación consolidada correctamente ${'x'.repeat(130)}`, ['Aceptar']), false)
  assert.equal(esDialogoConsolidadoMapfre('Aviso: Operación consolidada correctamente', ['Aceptar']), false)
})

test('Nº de proyecto: «Nº / N° / No. / Num. Proyecto: X» (también con letras)', () => {
  for (const [t, esperado] of [
    ['Nº Proyecto: 12345A67890', '12345A67890'],
    ['N° Proyecto: 2026A123456', '2026A123456'],
    ['No. Proyecto 123456789A', '123456789A'],
    ['Num. Proyecto: AB1234567', 'AB1234567'],
    ['Nº PROYECTO:9876543210', '9876543210'],
  ] as const) {
    assert.equal(numeroProyectoMapfreNuevo('5. Proyectos', `5. Proyectos\n${t}`), esperado, t)
  }
  assert.equal(numeroProyectoMapfreNuevo('Nº Proyecto: 12345A67890', 'Nº Proyecto: 12345A67890'), null, 'el que ya estaba no es nuevo')
  assert.equal(numeroProyectoMapfreNuevo('', 'Nº Proyecto: 00000000T'), null, 'forma de NIF')
  assert.equal(numeroProyectoMapfreNuevo('', 'Nº Proyecto: ABCDEFGH'), null, 'sin cifras')
  assert.equal(numeroProyectoMapfreNuevo('', 'Proyecto multiprecio'), null)
})

test('descarga: el icono «picture_as_pdf» es candidato en Mapfre (con o sin nº leído); en otras compañías, solo con proyecto guardado', () => {
  assert.equal(esBotonDescargaProyecto(['picture_as_pdf'], 'mapfre', false), true)
  assert.equal(esBotonDescargaProyecto(['picture_as_pdf'], 'mapfre', true), true)
  assert.equal(esBotonDescargaProyecto(['picture_as_pdf'], 'allianz', false), false)
  assert.equal(esBotonDescargaProyecto(['picture_as_pdf'], 'generali', true), false)
  assert.equal(esBotonDescargaProyecto(['picture_as_pdf', null, null, null, null], 'mapfre', false), true)
})

test('descarga: picture_as_pdf NO vale si el rótulo no es exacto o un atributo/rótulo habla de emitir/contratar/enviar', () => {
  assert.equal(esBotonDescargaProyecto(['picture_as_pdf contratar'], 'mapfre', false), false)
  assert.equal(esBotonDescargaProyecto(['picture_as_pdf', 'Enviar por email'], 'mapfre', false), false)
  assert.equal(esBotonDescargaProyecto(['picture_as_pdf', null, null, null, 'btnContratar'], 'mapfre', false), false)
  assert.equal(esBotonDescargaProyecto(['Search'], 'mapfre', false), false)
  assert.equal(esBotonDescargaProyecto(['Cancelar'], 'mapfre', false), false)
  assert.equal(puntuarBotonDescargaProyecto(['picture_as_pdf'], 'mapfre', false), 1)
})
