import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparHilos, anadirDatosContrato, conocidosDeFicha, estadoDatosTrasRespuesta, leerDatosContrato, previosDeFicha, textoHistorialRespuesta,
  validarAdjunto, validarCasar, validarGuardar, conPendientes, elegirEnContrato,
} from './correo-respuesta-lead-puro.ts'

test('🪤 F3b: una discrepancia queda PENDIENTE hasta que Alberto elige; «ficha» la descarta, «correo» la usa (y avisa de la ficha)', () => {
  const base = leerDatosContrato({ valores: { kmAnuales: 9000 }, pendientes: { raro: { cifrado: 'claro' } } })
  assert.deepEqual(base.pendientes, {})
  const p = conPendientes(base, { fechaNacimiento: { cifrado: 'v1:a:b:c' }, kmAnuales: 12000 })
  assert.deepEqual(Object.keys(p.pendientes).sort(), ['fechaNacimiento', 'kmAnuales'])
  assert.equal(p.valores.kmAnuales, 9000) // no se pisa
  const f = elegirEnContrato(p, 'kmAnuales', 'ficha', { ahora: 't' })
  assert.ok(f.ok && f.dc.valores.kmAnuales === 9000 && !('kmAnuales' in f.dc.pendientes) && f.dc.elecciones.kmAnuales === 'ficha')
  const c = elegirEnContrato(p, 'kmAnuales', 'correo', { ahora: 't' })
  assert.ok(c.ok && c.dc.valores.kmAnuales === 12000 && !c.corregirFicha)
  const n = elegirEnContrato(p, 'fechaNacimiento', 'correo', { ahora: 't' })
  assert.ok(n.ok && n.corregirFicha && 'fechaNacimiento' in n.dc.valores)
  assert.deepEqual(elegirEnContrato(p, 'matricula', 'correo', { ahora: 't' }), { ok: false, motivo: 'no_pendiente' })
  // Lo leído y vuelto a escribir conserva lo pendiente.
  assert.deepEqual(Object.keys(leerDatosContrato(JSON.parse(JSON.stringify(p))).pendientes).sort(), ['fechaNacimiento', 'kmAnuales'])
})

const C1 = '11111111-1111-4111-8111-111111111111'
const C2 = '33333333-3333-4333-8333-333333333333'
const OP = '22222222-2222-4222-8222-222222222222'

test('🪤 casar: un hilo = cliente + raíz; 0 → sin_hilo; dos clientes (o dos raíces) → ambiguo, no se lee', () => {
  assert.deepEqual(agruparHilos([]), { estado: 'sin_hilo' })
  const ok = agruparHilos([
    { id: '7', clienteId: C1, raiz: '<a@x>', oportunidadId: OP, ramo: 'hogar' },
    { id: '5', clienteId: C1, raiz: '<a@x>', oportunidadId: null, ramo: null },
  ])
  assert.deepEqual(ok, { estado: 'ok', hiloId: '5', clienteId: C1, raiz: '<a@x>', oportunidades: [{ id: OP, ramo: 'hogar' }] })
  assert.equal(agruparHilos([
    { id: '1', clienteId: C1, raiz: '<a@x>', oportunidadId: OP, ramo: 'hogar' },
    { id: '2', clienteId: C2, raiz: '<a@x>', oportunidadId: null, ramo: null },
  ]).estado, 'ambiguo')
  assert.equal(agruparHilos([
    { id: '1', clienteId: C1, raiz: '<a@x>', oportunidadId: OP, ramo: 'hogar' },
    { id: '2', clienteId: C1, raiz: '<b@x>', oportunidadId: OP, ramo: 'hogar' },
  ]).estado, 'ambiguo')
})

test('cuerpos del puerto: referencias, from simple, hiloId numérico, claves con forma', () => {
  assert.equal(validarCasar({ referencias: ['<a@x.es>', 'basura'], from: 'Ana@X.es' }).ok, true)
  assert.equal(validarCasar({ referencias: ['basura'], from: 'ana@x.es' }).ok, false)
  assert.equal(validarCasar({ referencias: ['<a@x.es>'], from: '"Ana" <ana@x.es>' }).ok, false)
  const g = validarGuardar({ hiloId: '12', from: 'ana@x.es', gmailMessageId: '<r@x.es>', actor: 'agente:triaje-correo', valores: { dni: '1', 'mal clave': 2, kmAnuales: 1000, fumador: false, obj: { a: 1 } } })
  assert.equal(g.ok, true)
  if (g.ok) assert.deepEqual(g.valor.valores, { dni: '1', kmAnuales: 1000, fumador: false })
  assert.equal(validarGuardar({ hiloId: 'x', from: 'ana@x.es', gmailMessageId: '<r@x.es>', actor: 'a', valores: {} }).ok, false)
})

test('🪤 guardar: un valor vacío o solo espacios cuenta como «no dado» (no bloquea el campo)', () => {
  const g = validarGuardar({ hiloId: '12', from: 'ana@x.es', gmailMessageId: '<r@x.es>', actor: 'a', valores: { dni: '', matricula: '   ', ciudad: ' Sevilla ' } })
  assert.equal(g.ok, true)
  if (g.ok) assert.deepEqual(g.valor.valores, { ciudad: 'Sevilla' })
})

test('🪤 datosContrato: lo nuevo se AÑADE con procedencia; lo que ya había no se cambia; lo raro se ignora', () => {
  const actual = leerDatosContrato({ valores: { kmAnuales: 9000, dni: { cifrado: 'v1:a:b:c', hash: 'h' }, malo: { cifrado: 'claro' } }, _procedencia: { kmAnuales: { fuente: 'cliente', at: 't0', correo: '<a@x>' } } })
  assert.deepEqual(Object.keys(actual.valores).sort(), ['dni', 'kmAnuales'])
  const n = anadirDatosContrato(actual, { kmAnuales: 12000, matricula: '1234BCD' }, { ahora: 't1', correo: '<r@x>' })
  assert.equal(n.valores.kmAnuales, 9000)
  assert.equal(n.valores.matricula, '1234BCD')
  assert.deepEqual(n._procedencia.matricula, { fuente: 'cliente', at: 't1', correo: '<r@x>' })
  assert.equal(n._procedencia.kmAnuales.at, 't0')
})

test('conocidos de la ficha sin descifrar; estado y historial sin valores', () => {
  assert.deepEqual(conocidosDeFicha({ nombre: 'Ana', apellidos: 'Ruiz Gil', dniLookupHash: 'h', telefonoLookupHash: null, emailLookupHash: 'e', fechaNacimiento: null, estadoCivil: null }),
    ['nombre', 'apellido1', 'apellido2', 'dni', 'email'])
  assert.deepEqual(conocidosDeFicha({ nombre: 'Sin nombre', apellidos: '', dniLookupHash: null, telefonoLookupHash: null, emailLookupHash: null, fechaNacimiento: null, estadoCivil: null }), [])
  assert.equal(estadoDatosTrasRespuesta(0), 'lista_para_tarificar')
  assert.equal(estadoDatosTrasRespuesta(2), 'incompleta')
  const t = textoHistorialRespuesta({ nuevos: 3, discrepancias: 1, faltan: 0, actor: 'agente:triaje-correo' })
  assert.match(t, /3 datos nuevos/)
  assert.match(t, /completos/)
})

test('🪤 adjuntos: solo fotos y PDF, con tamaño acotado', () => {
  const b64 = Buffer.alloc(2000, 1).toString('base64')
  const base = { hiloId: '3', from: 'ana@x.es', gmailMessageId: '<r@x.es>', nombre: 'dni.jpg', mime: 'image/jpeg', base64: b64 }
  assert.equal(validarAdjunto(base).ok, true)
  assert.equal(validarAdjunto({ ...base, mime: 'text/html' }).ok, false)
  assert.equal(validarAdjunto({ ...base, base64: Buffer.alloc(10).toString('base64') }).ok, false)
  assert.equal(validarAdjunto({ ...base, base64: Buffer.alloc(2_600_000).toString('base64') }).ok, false)
})

test('🪤 revisión F2: nacimiento y estado civil de la ficha entran en la comparación (distinto = discrepancia, no dato nuevo)', async () => {
  const { decidirFusion } = await import('@central/module-seguros')
  const conocidos = new Set(['nombre', 'fechaNacimiento', 'estadoCivil'])
  const ficha = { nombre: 'Ana', apellidos: 'Pérez Gil', fechaNacimiento: 'v1:cifrado', estadoCivil: 'Casado' }
  const prev = previosDeFicha(ficha, conocidos, () => '07/03/1990')
  assert.equal(prev.fechaNacimiento, '1990-03-07')
  assert.equal(prev.estadoCivil, 'Casado')
  const d = decidirFusion({ nuevos: { fechaNacimiento: '1985-03-07', estadoCivil: 'soltera' }, previos: prev, claveBloque: 'datosVehiculo', bloque: null })
  assert.deepEqual(d.discrepancias.sort(), ['estadoCivil', 'fechaNacimiento'])
  assert.deepEqual(d.escribir, [])
  const igual = decidirFusion({ nuevos: { fechaNacimiento: '1990-03-07', estadoCivil: 'casada' }, previos: prev, claveBloque: 'datosVehiculo', bloque: null })
  assert.deepEqual(igual.iguales.sort(), ['estadoCivil', 'fechaNacimiento'])
  // Ilegible: cuenta como «ya hay algo» → discrepancia, nunca se escribe encima.
  const roto = previosDeFicha(ficha, conocidos, () => { throw new Error('no abre') })
  assert.equal(roto.fechaNacimiento, '¿?')
  assert.deepEqual(decidirFusion({ nuevos: { fechaNacimiento: '1990-03-07' }, previos: roto, claveBloque: 'datosVehiculo', bloque: null }).discrepancias, ['fechaNacimiento'])
})
