// Cepo de «el cliente escribe sus carnés desde el portal» (`carnets-portal-reglas.ts`): la ficha destino solo
// vale si está vinculada con nivel que opera, el carné que se edita/borra tiene que ser de esa ficha, la
// entrada se valida con Zod (nunca `as`) y la respuesta del corredor se traduce sin culpar al cliente.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { PREFIJO_HISTORIAL_CARNET_PROPIO } from '@central/module-seguros-portal'

import {
  destinoCarnet,
  leerOperacionCarnet,
  statusCarnetPortal,
  textoHistorialCarnet,
  traducirResultadoCarnet,
} from './carnets-portal-reglas.ts'
import type { VinculoPortal } from './ficha-de-poliza.ts'

const ID = '11111111-1111-4111-8111-111111111111'
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const AJENA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const K = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const dos: VinculoPortal[] = [{ clienteId: A, nivel: 'gestionar' }, { clienteId: B, nivel: 'administrar' }]

// ─── Entrada ─────────────────────────────────────────────────────────────────

test('alta válida → operación con la ficha destino; un clienteId colado se descarta', () => {
  const op = leerOperacionCarnet('POST', { identidadId: ID, fichaId: A, tipo: 'B', fecha: '2010-05-04', clienteId: AJENA })
  assert.deepEqual(op, { accion: 'alta', identidadId: ID, fichaId: A, tipo: 'B', fecha: '2010-05-04' })
})

test('🪤 sin fichaId, sin identidad o con ids que no son uuid → inválido', () => {
  assert.equal(leerOperacionCarnet('POST', { identidadId: ID, tipo: 'B', fecha: '2010-05-04' }), null)
  assert.equal(leerOperacionCarnet('POST', { fichaId: A, tipo: 'B', fecha: '2010-05-04' }), null)
  assert.equal(leerOperacionCarnet('POST', { identidadId: ID, fichaId: 'x', tipo: 'B', fecha: '2010-05-04' }), null)
  assert.equal(leerOperacionCarnet('PATCH', { identidadId: ID, fichaId: A, tipo: 'B', fecha: '2010-05-04' }), null, 'cambio sin id')
  assert.equal(leerOperacionCarnet('DELETE', { identidadId: ID, fichaId: A }), null, 'baja sin id')
  assert.equal(leerOperacionCarnet('POST', null), null)
  assert.equal(leerOperacionCarnet('PUT', { identidadId: ID, fichaId: A, id: K }), null)
})

test('cambio y baja válidos', () => {
  assert.equal(leerOperacionCarnet('PATCH', { identidadId: ID, fichaId: A, id: K, tipo: 'A2', fecha: '01/02/2015' })?.accion, 'cambio')
  assert.equal(leerOperacionCarnet('DELETE', { identidadId: ID, fichaId: A, id: K })?.accion, 'baja')
})

// ─── Ficha destino ───────────────────────────────────────────────────────────

test('alta en la ficha A o en la B (ambas vinculadas y operables) → ok en esa ficha', () => {
  assert.deepEqual(destinoCarnet({ accion: 'alta', vinculos: dos, fichaId: A }), { estado: 'ok', clienteId: A })
  assert.deepEqual(destinoCarnet({ accion: 'alta', vinculos: dos, fichaId: B, tipoPersonaDestino: 'fisica' }), { estado: 'ok', clienteId: B })
})

test('🪤 alta en una ficha NO vinculada → rechazo', () => {
  assert.deepEqual(destinoCarnet({ accion: 'alta', vinculos: dos, fichaId: AJENA }), { estado: 'ajena', motivo: 'no_vinculada' })
})

test('🪤 vínculo de solo ver (tarjeta/completo/raro) → rechazo aunque la ficha esté vinculada', () => {
  for (const nivel of ['tarjeta', 'completo', 'raro', '']) {
    const v: VinculoPortal[] = [{ clienteId: A, nivel: 'gestionar' }, { clienteId: B, nivel }]
    assert.deepEqual(destinoCarnet({ accion: 'alta', vinculos: v, fichaId: B }), { estado: 'ajena', motivo: 'sin_permiso' }, nivel)
    assert.deepEqual(destinoCarnet({ accion: 'baja', vinculos: v, fichaId: B, duenoCarnet: B }), { estado: 'ajena', motivo: 'sin_permiso' }, nivel)
  }
})

test('sin ninguna ficha vinculada → sin_ficha', () => {
  assert.deepEqual(destinoCarnet({ accion: 'alta', vinculos: [], fichaId: A }), { estado: 'sin_ficha' })
})

test('🪤 alta en una ficha de EMPRESA → rechazo (una SL no conduce)', () => {
  assert.deepEqual(destinoCarnet({ accion: 'alta', vinculos: dos, fichaId: A, tipoPersonaDestino: 'juridica' }), { estado: 'ajena', motivo: 'empresa' })
})

test('editar/borrar un carné de esa misma ficha → ok', () => {
  assert.deepEqual(destinoCarnet({ accion: 'cambio', vinculos: dos, fichaId: B, duenoCarnet: B }), { estado: 'ok', clienteId: B })
  assert.deepEqual(destinoCarnet({ accion: 'baja', vinculos: dos, fichaId: A, duenoCarnet: A }), { estado: 'ok', clienteId: A })
})

test('🪤 carné de OTRA ficha (aunque también sea suya) → rechazo: fichaId no mueve carnés de titular', () => {
  assert.deepEqual(destinoCarnet({ accion: 'cambio', vinculos: dos, fichaId: A, duenoCarnet: B }), { estado: 'ajena', motivo: 'otra_ficha' })
})

test('🪤 carné de una ficha ajena → rechazo', () => {
  assert.deepEqual(destinoCarnet({ accion: 'baja', vinculos: dos, fichaId: A, duenoCarnet: AJENA }), { estado: 'ajena', motivo: 'otra_ficha' })
})

test('carné que no existe → rechazo (igual que ajeno hacia fuera)', () => {
  assert.deepEqual(destinoCarnet({ accion: 'baja', vinculos: dos, fichaId: A, duenoCarnet: null }), { estado: 'ajena', motivo: 'sin_dueno' })
})

// ─── Respuestas ──────────────────────────────────────────────────────────────

test('traducción de lo que devuelve guardarCarnet/borrarCarnet', () => {
  assert.deepEqual(traducirResultadoCarnet({ ok: true, id: K }), { estado: 'ok', id: K })
  assert.deepEqual(
    traducirResultadoCarnet({ ok: false, estado: 'invalido', motivo: 'Ya tiene carné B en la ficha', campo: 'tipo', status: 409 }),
    { estado: 'duplicado', campo: 'tipo' },
  )
  assert.deepEqual(
    traducirResultadoCarnet({ ok: false, estado: 'invalido', motivo: 'La fecha del carné no puede ser futura.', campo: 'fecha', status: 422 }),
    { estado: 'invalido', motivo: 'La fecha del carné no puede ser futura.', campo: 'fecha' },
  )
  assert.deepEqual(traducirResultadoCarnet({ ok: false, estado: 'no_encontrado', motivo: 'x', status: 404 }), { estado: 'no_encontrado' })
  assert.deepEqual(traducirResultadoCarnet({ ok: false, estado: 'error', motivo: 'x', status: 500 }), { estado: 'error', causa: 'error' })
})

test('status: solo «no se ha podido» es 503; lo del cliente, 4xx', () => {
  assert.equal(statusCarnetPortal('ok'), 200)
  assert.equal(statusCarnetPortal('invalido'), 422)
  assert.equal(statusCarnetPortal('duplicado'), 409)
  assert.equal(statusCarnetPortal('no_encontrado'), 404)
  assert.equal(statusCarnetPortal('sin_ficha'), 409)
  assert.equal(statusCarnetPortal('error'), 503)
})

// ─── Trazabilidad ────────────────────────────────────────────────────────────

test('el historial del portal lleva el prefijo compartido y el acceso; el de plataforma, el texto de siempre', () => {
  const t = textoHistorialCarnet('Carné B añadido', { origen: 'portal', identidadId: ID })
  assert.ok(t.startsWith(PREFIJO_HISTORIAL_CARNET_PROPIO), t)
  assert.match(t, /acceso 11111111/)
  assert.equal(textoHistorialCarnet('Carné B añadido', { origen: 'plataforma', actor: 'humano:x' }), 'Carné B añadido desde plataforma por humano:x')
})

test('la ruta del puente no lee clienteId y usa safeParse, nunca `as` sobre el cuerpo', () => {
  const ruta = readFileSync(new URL('../app/api/portal/carnets/route.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
  assert.equal(/clienteId/.test(ruta), false, 'la ruta del portal menciona clienteId')
  assert.match(ruta, /leerOperacionCarnet\(/)
  const reglas = readFileSync(new URL('./carnets-portal-reglas.ts', import.meta.url), 'utf8')
  assert.match(reglas, /safeParse\(/)
})
