// Guardián del lector de edición/alta de clientes de la correduría en
// plataforma (`apps/plataforma/lib/cliente-edicion-asegura.ts`). Puro: sin red.
//
// Lo que fija: `contactos: null` = «no se pudo consultar» y `[]` = «se miró y
// no hay» no se confunden; un conflicto trae sus coincidencias y si se puede
// forzar; un inválido trae su motivo (y el campo, si el puerto lo señala).

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  interpretarContactos,
  interpretarEscritura,
  leerContactos,
  leerIdentidad,
  textoMotivo,
  campoDesdeTermino,
} from '../apps/plataforma/lib/cliente-edicion-asegura.ts'

const TEL = { id: 't1', tipo: 'telefono', valor: '600000000', ilegible: false, etiqueta: 'móvil', principal: true, creado: '2026-09-02T10:00:00.000Z' }
const EMAIL = { id: 'e1', tipo: 'email', valor: null, ilegible: true, etiqueta: null, principal: true, creado: '2026-09-02T10:00:00.000Z' }

test('🚨 sin bloque de contactos → null; con listas vacías → [] (son cosas distintas)', () => {
  assert.equal(leerContactos(undefined), null)
  assert.equal(leerContactos(null), null)
  assert.equal(leerContactos({ telefonos: 'no', emails: [] }), null, 'una lista que no es lista tumba el bloque a null, no a []')
  assert.deepEqual(leerContactos({ telefonos: [], emails: [] }), { telefonos: [], emails: [] })
})

test('un contacto cifrado que no abre se conserva como fila ilegible, no se oculta', () => {
  const c = leerContactos({ telefonos: [TEL, 'basura', { id: 'x' }], emails: [EMAIL] })
  assert.equal(c?.telefonos.length, 1, 'las filas raras se saltan sin tumbar el bloque')
  assert.equal(c?.telefonos[0].valor, '600000000')
  assert.equal(c?.emails.length, 1)
  assert.equal(c?.emails[0].valor, null)
  assert.equal(c?.emails[0].ilegible, true)
})

test('GET contactos: ok / sin_configurar / no_encontrado / error no se confunden', () => {
  const ok = interpretarContactos(200, { estado: 'ok', telefonos: [TEL], emails: [] })
  assert.equal(ok.estado, 'ok')
  if (ok.estado === 'ok') assert.equal(ok.contactos.telefonos[0].id, 't1')
  assert.deepEqual(interpretarContactos(200, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarContactos(404, { estado: 'no_encontrado' }), { estado: 'no_encontrado' })
  assert.deepEqual(interpretarContactos(200, { estado: 'error', causa: 'tabla caída' }), { estado: 'error', motivo: 'tabla caída' })
  assert.deepEqual(interpretarContactos(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  // `ok` sin las listas NO es «no tiene»: es respuesta ilegible.
  assert.deepEqual(interpretarContactos(200, { estado: 'ok' }), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('identidad: null si asegura no la manda (versión anterior), no un nombre vacío', () => {
  assert.equal(leerIdentidad(undefined), null)
  assert.equal(leerIdentidad({}), null)
  const i = leerIdentidad({ nombre: 'Jose', apellidos: 'Suarez', dniEnmascarado: '*****678Z', dniIlegible: false, fechaNacimiento: '1980-01-02', fechaNacimientoIlegible: false, tipoPersona: 'fisica' })
  assert.equal(i?.dniEnmascarado, '*****678Z')
  assert.equal(i?.fechaNacimiento, '1980-01-02')
  const sinDni = leerIdentidad({ nombre: 'Jose', dniIlegible: true })
  assert.equal(sinDni?.dniEnmascarado, null)
  assert.equal(sinDni?.dniIlegible, true, 'cifrado que no abre ≠ sin DNI')
})

test('escritura ok: alta trae id; contactos trae la lista nueva', () => {
  const alta = interpretarEscritura(201, { estado: 'ok', id: 'c9' })
  assert.equal(alta.estado, 'ok')
  if (alta.estado === 'ok') {
    assert.equal(alta.id, 'c9')
    assert.equal(alta.contactos, null, 'el alta no manda contactos: null, no []')
  }
  const con = interpretarEscritura(200, { estado: 'ok', contacto: TEL, contactos: { telefonos: [TEL], emails: [] } })
  assert.equal(con.estado, 'ok')
  if (con.estado === 'ok') {
    assert.equal(con.contacto?.id, 't1')
    assert.equal(con.contactos?.telefonos.length, 1)
  }
})

test('🚨 conflicto: coincidencias con enlace y si se puede forzar', () => {
  const r = interpretarEscritura(409, {
    estado: 'conflicto',
    coincidencias: [{ id: 'c1', nombre: 'Jose Suarez', por: 'telefono', tipo: 'cliente' }, { por: 'raro', id: 'x' }],
    forzable: true,
  })
  assert.equal(r.estado, 'conflicto')
  if (r.estado !== 'conflicto') return
  assert.equal(r.coincidencias.length, 1, 'una coincidencia con `por` desconocido se salta')
  assert.equal(r.coincidencias[0].id, 'c1')
  assert.equal(r.forzable, true)
  const dni = interpretarEscritura(409, { estado: 'conflicto', coincidencias: [{ id: 'c1', nombre: 'J', por: 'dni', tipo: 'cliente' }] })
  assert.equal(dni.estado, 'conflicto')
  if (dni.estado === 'conflicto') assert.equal(dni.forzable, false, 'sin `forzable: true` explícito NO se ofrece forzar')
})

test('inválido lleva motivo y campo; documento_requerido tiene su frase', () => {
  const r = interpretarEscritura(422, { estado: 'invalido', motivo: 'documento_requerido' })
  assert.deepEqual(r, { estado: 'invalido', motivo: 'documento_requerido', campo: null })
  const c = interpretarEscritura(422, { estado: 'invalido', motivo: 'El código postal son 5 dígitos.', campo: 'codigoPostal' })
  assert.equal(c.estado, 'invalido')
  if (c.estado === 'invalido') assert.equal(c.campo, 'codigoPostal')
  assert.match(textoMotivo('documento_requerido'), /documentado/)
  assert.equal(textoMotivo('El código postal son 5 dígitos.'), 'El código postal son 5 dígitos.')
})

test('no_encontrado, sin_configurar y error de red no se leen como éxito ni como inválido', () => {
  assert.deepEqual(interpretarEscritura(404, { estado: 'no_encontrado' }), { estado: 'no_encontrado' })
  assert.deepEqual(interpretarEscritura(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarEscritura(502, { estado: 'error', motivo: 'red' }), { estado: 'error', motivo: 'red' })
  assert.deepEqual(interpretarEscritura(500, null), { estado: 'error', motivo: 'HTTP 500' })
  assert.deepEqual(interpretarEscritura(403, null), { estado: 'error', motivo: 'secreto_rechazado' })
  // Un 200 sin `estado: 'ok'` tampoco es un éxito.
  assert.equal(interpretarEscritura(200, {}).estado, 'error')
})

test('el término del buscador cae en la casilla que le toca por su forma', () => {
  assert.equal(campoDesdeTermino('jose@ejemplo.es'), 'email')
  assert.equal(campoDesdeTermino('600 00 00 00'), 'telefono')
  assert.equal(campoDesdeTermino('+34600000000'), 'telefono')
  assert.equal(campoDesdeTermino('12345678z'), 'dni')
  assert.equal(campoDesdeTermino('X1234567L'), 'dni')
  assert.equal(campoDesdeTermino('Jose Suarez'), 'nombre')
  assert.equal(campoDesdeTermino('1234BCD'), 'nombre', 'una matrícula no es un DNI ni un teléfono')
})
