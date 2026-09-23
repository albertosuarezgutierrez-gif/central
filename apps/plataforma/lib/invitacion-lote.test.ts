import test from 'node:test'
import assert from 'node:assert/strict'

import { interpretarCenso, interpretarLote } from './invitacion-lote.ts'

const censoOk = {
  estado: 'ok',
  maxPorLote: 80,
  total: 67,
  decision: { enviar: ['a'], fuera: { sin_email: 29, resuelve_a_otra: 5, raro_nuevo: 1, ya_entra: 0 } },
  destinatarios: [{ clienteId: 'a', nombre: 'Ana' }],
  muestra: { asunto: 'Ya puedes consultar tus seguros por internet', texto: 'Hola:' },
}

test('censo: cada motivo fuera con su nombre, y uno desconocido NO se tira', () => {
  const r = interpretarCenso(200, censoOk)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.censo.destinatarios.length, 1)
  const porMotivo = Object.fromEntries(r.censo.fuera.map((f) => [f.motivo, f.etiqueta]))
  assert.match(porMotivo.resuelve_a_otra, /OTRA ficha/)
  assert.equal(porMotivo.raro_nuevo, 'raro_nuevo')
  assert.equal('ya_entra' in porMotivo, false, 'un 0 no se pinta')
})

test('censo sin muestra = no hay portal: se dice, no se inventa texto', () => {
  const r = interpretarCenso(200, { ...censoOk, muestra: null })
  assert.ok(r.ok && r.censo.muestra === null)
})

test('censo ilegible NO ofrece enviar', () => {
  assert.equal(interpretarCenso(200, { estado: 'ok' }).ok, false)
  assert.equal(interpretarCenso(500, { estado: 'error', causa: 'credenciales' }).ok, false)
})

test('un corte de espera es «sin confirmar», nunca «falló»', () => {
  const r = interpretarLote(502, { estado: 'error', motivo: 'red' })
  assert.equal(r.estado, 'sin_confirmar')
})

test('lote parado por la instalación se lee como hecho con parado', () => {
  const r = interpretarLote(503, { estado: 'parado', enviados: 0, fallidos: [{ clienteId: 'a', estado: 'sin_correo_configurado', motivo: 'x' }], parado: 'sin_correo_configurado', sinIntentar: 10, descartados: 0 })
  assert.equal(r.estado, 'hecho')
  if (r.estado === 'hecho') assert.equal(r.parado, 'sin_correo_configurado')
})

test('un 401 es el secreto, no «no se pudo»', () => {
  const r = interpretarLote(401, { error: 'No autorizado' })
  assert.equal(r.estado, 'error')
  if (r.estado === 'error') assert.match(r.motivo, /secreto/)
})

test('los fallos se agrupan por motivo y conservan el nombre', () => {
  const r = interpretarLote(503, {
    estado: 'parado',
    enviados: 0,
    fallidos: [
      { clienteId: 'a', nombre: 'Ana', estado: 'error_envio', motivo: 'm1' },
      { clienteId: 'b', nombre: null, estado: 'error_envio', motivo: 'm1' },
      { clienteId: 'c', nombre: 'Carlos', estado: 'sin_email', motivo: 'm2' },
    ],
    parado: 'error_envio',
    sinIntentar: 22,
    descartados: 0,
  })
  assert.equal(r.estado, 'hecho')
  if (r.estado !== 'hecho') return
  assert.deepEqual(r.porMotivo, [{ motivo: 'm1', n: 2 }, { motivo: 'm2', n: 1 }])
  assert.equal(r.fallidos[0].nombre, 'Ana')
  assert.equal(r.fallidos[1].nombre, null)
})
