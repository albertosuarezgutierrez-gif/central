import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MOTIVO_DOCUMENTO_REQUERIDO,
  coincidenciaBloquea,
  documentoAcredita,
  documentosAcreditativos,
  enmascararDni,
  etiquetaContacto,
  normalizarDni,
  normalizarEmail,
  normalizarFechaNacimiento,
  normalizarTelefono,
  provinciaPorCp,
  revisarAlta,
  revisarEdicion,
  textoHistorialEdicion,
} from './cliente-edicion.ts'
import type { DocumentoResumen } from './documentos.ts'

test('teléfono: español con espacios, +34 y 0034 → 9 dígitos; extranjero conserva el +', () => {
  assert.deepEqual(normalizarTelefono(' 954 22 05 48 '), { ok: true, valor: '954220548' })
  assert.deepEqual(normalizarTelefono('+34 600-12-34-56'), { ok: true, valor: '600123456' })
  assert.deepEqual(normalizarTelefono('0034600123456'), { ok: true, valor: '600123456' })
  assert.deepEqual(normalizarTelefono('+33 6 12 34 56 78'), { ok: true, valor: '+33612345678' })
  assert.equal(normalizarTelefono('123456789').ok, false)
  assert.equal(normalizarTelefono('60012345').ok, false)
  assert.equal(normalizarTelefono('').ok, false)
})

test('email: minúsculas y forma mínima', () => {
  assert.deepEqual(normalizarEmail(' JSuarez@Gmail.com '), { ok: true, valor: 'jsuarez@gmail.com' })
  assert.equal(normalizarEmail('jsuarez@gmail').ok, false)
  assert.equal(normalizarEmail('sin arroba').ok, false)
})

test('DNI/NIE comprueban la letra; CIF solo la forma; el tipo de persona sale de ahí', () => {
  assert.deepEqual(normalizarDni(' 12.345.678-z '), { ok: true, valor: { valor: '12345678Z', tipoPersona: 'fisica' } })
  assert.equal(normalizarDni('12345678A').ok, false)
  assert.deepEqual(normalizarDni('x-1234567-l'), { ok: true, valor: { valor: 'X1234567L', tipoPersona: 'fisica' } })
  assert.equal(normalizarDni('X1234567A').ok, false)
  assert.deepEqual(normalizarDni('b12345674'), { ok: true, valor: { valor: 'B12345674', tipoPersona: 'juridica' } })
  assert.equal(normalizarDni('1234').ok, false)
  assert.equal(enmascararDni('12345678Z'), '*****678Z')
  assert.equal(enmascararDni(null), null)
})

test('fecha de nacimiento: ISO o española, tiene que existir y ser pasada', () => {
  const hoy = new Date('2026-09-02T00:00:00Z')
  assert.deepEqual(normalizarFechaNacimiento('5/3/1980', hoy), { ok: true, valor: '1980-03-05' })
  assert.deepEqual(normalizarFechaNacimiento('1980-03-05', hoy), { ok: true, valor: '1980-03-05' })
  assert.equal(normalizarFechaNacimiento('31/02/1980', hoy).ok, false)
  assert.equal(normalizarFechaNacimiento('01/01/2027', hoy).ok, false)
  assert.equal(normalizarFechaNacimiento('01/01/1850', hoy).ok, false)
  assert.equal(normalizarFechaNacimiento('ayer', hoy).ok, false)
})

test('provincia por CP y etiquetas cerradas', () => {
  assert.equal(provinciaPorCp('41003'), 'Sevilla')
  assert.equal(provinciaPorCp('43800'), 'Tarragona')
  assert.equal(provinciaPorCp('99999'), null)
  assert.equal(etiquetaContacto('telefono', ' Móvil '), 'móvil')
  assert.equal(etiquetaContacto('telefono', 'personal'), null)
  assert.equal(etiquetaContacto('email', 'trabajo'), 'trabajo')
})

test('edición: identidad sin documento se rechaza con el motivo que la pantalla entiende', () => {
  const r = revisarEdicion({ identidad: { dni: '12345678Z' } })
  assert.deepEqual(r, { ok: false, motivo: MOTIVO_DOCUMENTO_REQUERIDO })
  const ok = revisarEdicion({ identidad: { dni: '12345678Z', fechaNacimiento: '5/3/1980' }, documentoId: 'd1' })
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.equal(ok.tocaIdentidad, true)
    assert.deepEqual(ok.identidad.dni, { valor: '12345678Z', tipoPersona: 'fisica' })
    assert.equal(ok.identidad.fechaNacimiento, '1980-03-05')
  }
})

test('edición: lo libre no pide documento; CP valida y vacío = borrar; nada = sin cambios', () => {
  const r = revisarEdicion({ libre: { ciudad: '  Sevilla ', codigoPostal: '41003', direccion: '' } })
  assert.deepEqual(r, { ok: true, identidad: {}, libre: { ciudad: 'Sevilla', codigoPostal: '41003', direccion: null }, tocaIdentidad: false })
  const mal = revisarEdicion({ libre: { codigoPostal: '4100' } })
  assert.equal(mal.ok, false)
  if (!mal.ok) assert.equal(mal.campo, 'codigoPostal')
  assert.equal(revisarEdicion({}).ok, false)
  const sinNombre = revisarEdicion({ identidad: { nombre: '   ' }, documentoId: 'd1' })
  assert.equal(sinNombre.ok, false)
  if (!sinNombre.ok) assert.equal(sinNombre.campo, 'nombre')
})

test('el historial no lleva el DNI ni la dirección, sí la ciudad y el documento', () => {
  const r = revisarEdicion({ identidad: { dni: '12345678Z' }, libre: { ciudad: 'Sevilla', direccion: 'Calle X 1' }, documentoId: 'doc-9' })
  assert.equal(r.ok, true)
  if (!r.ok) return
  const t = textoHistorialEdicion(r, { actor: 'alberto@x', documentoId: 'doc-9' })
  assert.match(t, /identidad \(DNI\) acreditada con el documento doc-9/)
  assert.match(t, /ciudad → Sevilla/)
  assert.match(t, /dirección cambiada/)
  assert.doesNotMatch(t, /12345678Z/)
  assert.doesNotMatch(t, /Calle X/)
})

test('documento que acredita: tipo dni y que haya llegado', () => {
  const d = (p: Partial<DocumentoResumen>): DocumentoResumen => ({
    id: 'd', tipo: 'dni', estado: 'recibido', nombre: null, mime: null, bytes: null, sha256: null, notas: null,
    subidoPor: 'corredor', clienteId: 'c', polizaId: null, siniestroId: null, creado: '', revisadoEn: null, ...p,
  })
  assert.equal(documentoAcredita(d({})), true)
  assert.equal(documentoAcredita(d({ estado: 'pedido' })), false)
  assert.equal(documentoAcredita(d({ tipo: 'poliza' })), false)
  assert.deepEqual(documentosAcreditativos(null), [])
  assert.equal(documentosAcreditativos([d({ id: 'a' }), d({ id: 'b', estado: 'pedido' })]).length, 1)
})

test('alta: nombre + algo por lo que encontrarla; provincia sale del CP; DNI repetido bloquea, teléfono no', () => {
  const sin = revisarAlta({ nombre: 'Ana' })
  assert.equal(sin.ok, false)
  const r = revisarAlta({ nombre: ' ana ', apellidos: 'López  Pérez', telefono: '600 12 34 56', codigoPostal: '41003', email: '' })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.alta.nombre, 'ana')
    assert.equal(r.alta.apellidos, 'López Pérez')
    assert.equal(r.alta.telefono, '600123456')
    assert.equal(r.alta.email, null)
    assert.equal(r.alta.provincia, 'Sevilla')
    assert.equal(r.alta.tipoPersona, null)
  }
  const emp = revisarAlta({ nombre: 'Esquiansa SL', dni: 'B12345674' })
  assert.equal(emp.ok && emp.alta.tipoPersona, 'juridica')
  const mal = revisarAlta({ nombre: 'Ana', dni: '12345678A' })
  assert.equal(mal.ok, false)
  if (!mal.ok) assert.equal(mal.campo, 'dni')
  assert.equal(coincidenciaBloquea([{ id: '1', nombre: 'x', por: 'telefono', tipo: 'lead' }]), false)
  assert.equal(coincidenciaBloquea([{ id: '1', nombre: 'x', por: 'dni', tipo: 'cliente' }]), true)
})
