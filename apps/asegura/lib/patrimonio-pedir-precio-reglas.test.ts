import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  aplicaPedirPrecio,
  identidadDeConsulta,
  ramoDeUso,
  textoAvisoPedirPrecio,
  textoTareaPrecioPatrimonio,
  validarPedirPrecio,
} from './patrimonio-pedir-precio-reglas.ts'

const U = '11111111-1111-4111-8111-111111111111'
const I = '22222222-2222-4222-8222-222222222222'

test('el cuerpo: solo identidad, inmueble y tipo; un clienteId o titular del cuerpo se IGNORA (no se lee)', () => {
  const ok = validarPedirPrecio({ identidadId: U, inmuebleId: I, tipo: 'inmueble_sin_seguro', clienteId: 'otro', titularId: 'otro' })
  assert.deepEqual(ok, { ok: true, datos: { identidadId: U, inmuebleId: I, tipo: 'inmueble_sin_seguro' } })
  assert.deepEqual(validarPedirPrecio({ identidadId: 'x', inmuebleId: I, tipo: 'inmueble_sin_seguro' }), { ok: false, campo: 'identidadId' })
  assert.deepEqual(validarPedirPrecio({ identidadId: U, inmuebleId: 'x', tipo: 'inmueble_sin_seguro' }), { ok: false, campo: 'inmuebleId' })
  assert.deepEqual(validarPedirPrecio({ identidadId: U, inmuebleId: I, tipo: 'vida' }), { ok: false, campo: 'tipo' })
  assert.deepEqual(validarPedirPrecio(null), { ok: false, campo: 'identidadId' })
})

test('🚨 aplica solo si NO hay seguro en vigor ni dudas: en vigor o «no se sabe» no abren petición', () => {
  assert.equal(aplicaPedirPrecio('inmueble_sin_seguro', []), true)
  assert.equal(aplicaPedirPrecio('inmueble_sin_seguro', [false]), true)
  assert.equal(aplicaPedirPrecio('inmueble_sin_seguro', [false, true]), false)
  assert.equal(aplicaPedirPrecio('inmueble_sin_seguro', [null]), false, 'no se sabe: no se afirma «sin seguro»')
  assert.equal(aplicaPedirPrecio('seguro_no_vigente', [false]), true)
  assert.equal(aplicaPedirPrecio('seguro_no_vigente', []), false, 'sin ningún enlace no hay seguro «caducado»')
})

test('ramo por uso y textos: sin dirección ni nº de póliza; Telegram solo ids', () => {
  assert.equal(ramoDeUso('local'), 'comercio')
  assert.equal(ramoDeUso('vivienda'), 'hogar')
  assert.equal(ramoDeUso(null), 'hogar')
  const t = textoTareaPrecioPatrimonio({ tipo: 'inmueble_sin_seguro', alias: '  Piso   de Triana ', ramo: 'hogar' })
  assert.match(t, /«Piso de Triana»/)
  assert.match(t, /no tiene seguro/)
  const aviso = textoAvisoPedirPrecio({ oportunidadId: 'o1', inmuebleId: 'i1' })
  assert.match(aviso, /o1/)
  assert.doesNotMatch(aviso, /Triana/)
})

test('🚨 cableado: el puente no usa lead-declarada, recalcula el nivel y la ruta exige el Bearer del puente', () => {
  const lib = readFileSync(new URL('./patrimonio-pedir-precio-portal.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  assert.doesNotMatch(lib, /lead-declarada/)
  assert.match(lib, /puedePatrimonio\(correduriaId, d\.identidadId, inm\.cliente_id, 'pedir_precio'\)/)
  assert.match(lib, /where i\.id = \$\{d\.inmuebleId\}::uuid and i\.archivado_en is null/)
  assert.match(lib, /t\.correduria_id = \$\{correduriaId\}::uuid/)
  assert.match(lib, /pg_advisory_xact_lock/)
  assert.match(lib, /'portal', 'en_negociacion'/)
  assert.doesNotMatch(lib, /clienteId\b/, 'el cliente sale del inmueble, nunca de un parámetro')
  const ruta = readFileSync(new URL('../app/api/portal/patrimonio/pedir-precio/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /puentePortalAutorizado\(req\)/)
  assert.match(ruta, /auditado\(/)
  assert.doesNotMatch(ruta, /ASEGURA_OPERADOR_SECRET|operadorAutorizado/)
})

test('GET de peticiones abiertas: solo identidadId; clienteId/inmuebleId de la query se ignoran y la ficha sale de asegura', () => {
  assert.equal(identidadDeConsulta(`https://x.test/api/portal/patrimonio/pedir-precio?identidadId=${U}&clienteId=otro&inmuebleId=${I}`), U)
  assert.equal(identidadDeConsulta('https://x.test/api/portal/patrimonio/pedir-precio?identidadId=no-es-uuid'), null)
  assert.equal(identidadDeConsulta('https://x.test/api/portal/patrimonio/pedir-precio'), null)
  assert.equal(identidadDeConsulta('no es una url'), null)
  const fuente = readFileSync(new URL('./patrimonio-pedir-precio-portal.ts', import.meta.url), 'utf8')
  const f = fuente.slice(fuente.indexOf('export async function peticionesPedirPrecioAbiertas'))
  assert.match(f, /fichasDeIdentidad\(correduriaId, identidadId\)/)
  assert.doesNotMatch(f, /clienteId\s*[:=]/)
  const ruta = readFileSync(new URL('../app/api/portal/patrimonio/pedir-precio/route.ts', import.meta.url), 'utf8')
  const get = ruta.slice(ruta.indexOf('export async function GET'), ruta.indexOf('export const POST'))
  assert.match(get, /puentePortalAutorizado\(req\)/)
  assert.doesNotMatch(get, /clienteId|searchParams/)
})
