import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  costeConservador, rastroArgs, tienePrefijo, apagado, clasificarDestino, diasValidos, enmascarar, idValido, leerArgumentos, leerClasificacion,
  paraIA, reglaConDatoPersonal, sinPrefijo, systemAsistente, turnoDeNota, preguntaNota,
} from './correduria-asistente.ts'

test('reparto: el atajo y las palabras de la correduría van al asistente', () => {
  assert.equal(clasificarDestino('seguro: ¿qué tiene Pablo Guzmán?'), 'correduria')
  assert.equal(clasificarDestino('/seguros impagados'), 'correduria')
  assert.equal(clasificarDestino('¿cuándo vence la póliza de Moncosi?'), 'correduria')
  assert.equal(clasificarDestino('¿de quién es la 8737HVF?'), 'correduria')
  assert.equal(clasificarDestino('renovaciones de esta semana'), 'correduria')
})

test('reparto: lo contable sigue siendo del contable', () => {
  assert.equal(clasificarDestino('¿cuánto llevo en luz este año?'), 'contable')
  assert.equal(clasificarDestino('clasifica el cargo de netflix'), 'contable')
  assert.equal(clasificarDestino('factura de Endesa'), 'contable')
  assert.equal(clasificarDestino(''), 'contable')
})

test('reparto: un nombre suelto es dudoso (lo decide la IA)', () => {
  assert.equal(clasificarDestino('¿qué tiene Pablo Guzmán?'), 'dudoso')
})

test('el atajo se quita de la pregunta', () => {
  assert.equal(sinPrefijo('seguro: impagados'), 'impagados')
  assert.equal(sinPrefijo('/seguros vencimientos'), 'vencimientos')
})

test('clasificador IA: cualquier cosa que no diga correduría cae al contable', () => {
  assert.equal(leerClasificacion('correduria'), 'correduria')
  assert.equal(leerClasificacion('Correduría.'), 'correduria')
  assert.equal(leerClasificacion('contable'), 'contable')
  assert.equal(leerClasificacion(null), 'contable')
  assert.equal(leerClasificacion('no sé'), 'contable')
})

test('🔒 enmascara DNI, NIE, IBAN y tarjeta', () => {
  assert.equal(enmascarar('DNI 28347769Q'), 'DNI …769Q')
  assert.equal(enmascarar('NIE X1234567L'), 'NIE …567L')
  assert.equal(enmascarar('cuenta ES91 2100 0418 4502 0005 1332'), 'cuenta ES…1332')
  assert.equal(enmascarar('ES9121000418450200051332'), 'ES…1332')
  assert.equal(enmascarar('tarjeta 4111 1111 1111 1111'), 'tarjeta …1111')
  // 16 cifras que no pasan el dígito de control: un nº de póliza, se queda entero.
  assert.equal(enmascarar('póliza 1234567812345678'), 'póliza 1234567812345678')
  // Lo que no es dato personal se queda: teléfono (hace falta para llamar), póliza, CIF.
  assert.equal(enmascarar('tel 634766644 póliza 0008414300069 CIF B12345678'), 'tel 634766644 póliza 0008414300069 CIF B12345678')
})

test('🔒 paraIA enmascara y avisa del recorte', () => {
  const s = paraIA({ dni: '28347769Q', nulo: null })
  assert.equal(s, '{"dni":"…769Q","nulo":null}')
  assert.match(paraIA({ x: 'a'.repeat(100) }, 20), /RECORTADO/)
})

test('argumentos e ids: nada de la IA llega crudo al puerto', () => {
  assert.deepEqual(leerArgumentos('{"q":"pablo"}'), { q: 'pablo' })
  assert.equal(leerArgumentos('no json'), null)
  assert.equal(leerArgumentos('[1]'), null)
  assert.equal(idValido('3f2b8c1e-1234-4abc-9def-0123456789ab'), '3f2b8c1e-1234-4abc-9def-0123456789ab')
  assert.equal(idValido('../cartera?x=1'), null)
  assert.equal(diasValidos(500), 120)
  assert.equal(diasValidos(0), 1)
  assert.equal(diasValidos('x'), 30)
})

test('🔒 una «regla» con datos de cliente no se guarda', () => {
  assert.equal(reglaConDatoPersonal('el teléfono de Pablo es 634766644'), true)
  assert.equal(reglaConDatoPersonal('su DNI es 28347769Q'), true)
  assert.equal(reglaConDatoPersonal('escríbele a pjgulo@gmail.com'), true)
  assert.equal(reglaConDatoPersonal('la 8737HVF es de Pablo'), true)
  assert.equal(reglaConDatoPersonal('dame siempre el total anual primero'), false)
})

test('el prompt lleva las reglas aprendidas y la prohibición de inventar', () => {
  const s = systemAsistente(['dame el total anual primero'], '2026-09-26')
  assert.match(s, /1\. dame el total anual primero/)
  assert.match(s, /no consta/)
  assert.match(s, /SOLO LECTURA/)
})

test('interruptor de apagado', () => {
  assert.equal(apagado('1'), true)
  assert.equal(apagado('sí'), true)
  assert.equal(apagado(undefined), false)
  assert.equal(apagado('0'), false)
})

test('la nota del 👎 se liga a su turno', () => {
  assert.equal(turnoDeNota(preguntaNota(42)), 42)
  assert.equal(turnoDeNota('otra cosa'), null)
})

test('reparto: unidades que parecen matrícula no roban preguntas al contable', () => {
  assert.equal(clasificarDestino('¿cuánto consumí de luz, 1500 kWh?'), 'contable')
  assert.equal(clasificarDestino('seguros de coche que pago'), 'dudoso')
  assert.equal(tienePrefijo('/seguros impagados'), true)
  assert.equal(tienePrefijo('¿qué tiene Pablo?'), false)
})

test('🔒 el rastro guarda ids, no el texto buscado', () => {
  assert.deepEqual(rastroArgs('buscar', { q: '634766644' }), { q: '[búsqueda]' })
  assert.deepEqual(rastroArgs('proponer_regla', { regla: 'x' }), { regla: '[texto]' })
  assert.deepEqual(rastroArgs('ficha_cliente', { clienteId: 'abc', basura: 'z' }), { clienteId: 'abc' })
  assert.deepEqual(rastroArgs('buscar', null), {})
})

test('el coste sin catálogo nunca es 0', () => {
  assert.ok(costeConservador(1000) > 0)
  assert.equal(costeConservador(-5), 0)
})
