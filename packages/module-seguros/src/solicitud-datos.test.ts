import test from 'node:test'
import assert from 'node:assert/strict'
import { camposSolicitud, contrastarConDocumentos, mensajeSolicitud, normalizarLecturaSolicitud, validarRespuestas } from './solicitud-datos.ts'

const nadaConocido = { dni: false, fechaNacimiento: false, codigoPostal: false, carnetMoto: false, carnetCoche: false }
const todoConocido = { dni: true, fechaNacimiento: true, codigoPostal: true, carnetMoto: true, carnetCoche: true }
const HOY = new Date('2026-09-24T10:00:00Z')

test('no se le vuelve a pedir lo que la ficha ya tiene', () => {
  const claves = camposSolicitud('moto', todoConocido).map((c) => c.clave)
  for (const k of ['dni', 'fechaNacimiento', 'codigoPostal', 'tipoCarnet', 'fechaCarnet']) assert.ok(!claves.includes(k), k)
  assert.ok(claves.includes('matricula') && claves.includes('marca'))
  const todo = camposSolicitud('moto', nadaConocido).map((c) => c.clave)
  for (const k of ['dni', 'fechaNacimiento', 'codigoPostal', 'tipoCarnet', 'fechaCarnet']) assert.ok(todo.includes(k), k)
})

test('en coche no se pregunta el tipo de carné de moto', () => {
  const claves = camposSolicitud('auto', nadaConocido).map((c) => c.clave)
  assert.ok(!claves.includes('tipoCarnet'))
  assert.ok(claves.includes('fechaCarnet'))
})

test('valida y normaliza; un error por campo; lo no pedido se ignora', () => {
  const campos = camposSolicitud('moto', nadaConocido)
  const bien = validarRespuestas(campos, {
    dni: '12345678z', fechaNacimiento: '01/02/1990', codigoPostal: '41003', tipoCarnet: 'A2', fechaCarnet: '15/03/2015',
    matricula: '1234 abc', marca: 'Yamaha', modelo: 'MT-07', garaje: 'calle', tieneSeguro: false, colado: 'x',
  }, HOY)
  assert.ok(bien.ok)
  if (bien.ok) {
    assert.equal(bien.respuestas.dni, '12345678Z')
    assert.equal(bien.respuestas.matricula, '1234ABC')
    assert.equal(bien.respuestas.fechaCarnet, '2015-03-15')
    assert.equal(bien.respuestas.companiaActual, null, 'sin seguro, la compañía ni se mira')
    assert.equal('colado' in bien.respuestas, false)
  }
  const mal = validarRespuestas(campos, { dni: '12345678A', fechaCarnet: '31/02/2020', garaje: 'tejado', tieneSeguro: 'si' }, HOY)
  assert.equal(mal.ok, false)
  if (!mal.ok) {
    assert.match(mal.errores.dni, /letra/)
    assert.ok(mal.errores.fechaCarnet && mal.errores.garaje && mal.errores.tieneSeguro && mal.errores.matricula)
  }
})

test('una fecha de carné futura no vale; el vencimiento del seguro actual sí puede ser futuro', () => {
  const campos = camposSolicitud('moto', { ...todoConocido, carnetMoto: false })
  const r = validarRespuestas(campos, {
    tipoCarnet: 'A', fechaCarnet: '2030-01-01', matricula: '1234ABC', marca: 'x', modelo: 'y', garaje: 'calle',
    tieneSeguro: true, vencimientoActual: '2027-01-10',
  }, HOY)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.ok(r.errores.fechaCarnet)
    assert.equal(r.errores.vencimientoActual, undefined)
  }
})

test('el mensaje para el cliente no lleva ningún dato suyo, solo el enlace', () => {
  const m = mensajeSolicitud('moto', 'https://x/datos/abc')
  assert.match(m, /tu moto/)
  assert.match(m, /https:\/\/x\/datos\/abc$/)
})

test('lo leído de un documento solo propone campos pedidos y válidos', () => {
  const campos = camposSolicitud('moto', nadaConocido)
  const r = normalizarLecturaSolicitud({
    tipo: 'carnet', dni: '12345678Z', fechaNacimiento: '1990-02-01',
    carnets: [{ clase: 'B', fecha: '2010-01-01' }, { clase: 'A2', fecha: '2015-03-15' }, { clase: 'AM', fecha: '2006-01-01' }],
    matricula: 'dudoso', marca: '',
  }, 'moto', campos, HOY)
  assert.equal(r.tipo, 'carnet')
  assert.equal(r.valores.dni, '12345678Z')
  assert.equal(r.valores.tipoCarnet, 'A2', 'la clase de moto más alta con fecha')
  assert.equal(r.valores.fechaCarnet, '2015-03-15')
  assert.equal('matricula' in r.valores, false, 'una matrícula que no valida no se propone')
  assert.equal('marca' in r.valores, false)
  const conocido = normalizarLecturaSolicitud({ tipo: 'dni', dni: '12345678Z' }, 'moto', camposSolicitud('moto', todoConocido), HOY)
  assert.equal('dni' in conocido.valores, false, 'lo que no se pidió no se propone')
  assert.equal(normalizarLecturaSolicitud({ tipo: 'pasaporte' }, 'moto', campos, HOY).tipo, 'otro')
})

test('el contraste avisa si lo declarado no casa con el papel, sin tener en cuenta espacios ni guiones', () => {
  const lecturas = [{ documentoId: 'd1', tipo: 'permiso_circulacion' as const, valores: { matricula: '1234ABC', fechaMatriculacion: '2020-05-01' } }]
  assert.deepEqual(contrastarConDocumentos({ matricula: '1234 abc', fechaMatriculacion: '2020-05-01' }, lecturas), [])
  const d = contrastarConDocumentos({ matricula: '1234ABD' }, lecturas)
  assert.equal(d.length, 1)
  assert.equal(d[0].clave, 'matricula')
  assert.equal(d[0].documento, '1234ABC')
})
