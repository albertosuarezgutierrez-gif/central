/* eslint-disable @typescript-eslint/no-explicit-any */
// Fichaje del taller → rrhh con fetch FALSO: el PIN se valida, el taller solo ENVÍA, y si rrhh falla no se finge éxito.
// Cepos vistos fallar el 04/11/2026: (1) en ficharConPin quitar la rama `if (!r.ok)` del login (PIN erróneo ficha) → rojo en 'PIN incorrecto';
// (2) en enviarFichajeRrhh devolver ok sin mirar `res.ok` → rojo en 'rrhh responde error'. Restaurados → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hashPin } from '@central/core-identity/pin'
import { crearConTaller } from '../lib/rls.ts'
import { ficharConPin, fichajeRrhhDisponible } from '../lib/fichar-rrhh.ts'
import * as vinculo from '../lib/vinculo-rrhh.ts'
import { guardarIdentificadorRrhh } from '../lib/vinculo-rrhh.ts'
import { crearBdFake } from './_fake-prisma.ts'

const T = 'f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b'
const EMPRESA = '33333333-3333-4333-8333-333333333333'
const ENV = { RRHH_URL: 'https://rrhh.test/', RRHH_FICHAJE_TALLER_SECRET: 'sec-fichaje' }
const AHORA = new Date('2026-11-04T10:00:00Z')

async function montar(o: { identificador?: string | null; empresa?: string | null } = {}) {
  const bd = crearBdFake()
  bd.sembrar('taller', { id: T, rrhhEmpresaId: o.empresa === undefined ? EMPRESA : o.empresa })
  const pepe = bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Pepe', rol: 'mecanico', pinHash: await hashPin('4826', 1000), rrhhIdentificador: o.identificador === undefined ? '12345678Z' : o.identificador })
  return { bd, pepe, conTaller: crearConTaller(bd.cliente) as any }
}
function fetchFalso(respuesta: () => Response | Promise<Response>) {
  const llamadas: { url: string; init: any }[] = []
  const fn = (async (url: string, init: any) => { llamadas.push({ url, init }); return respuesta() }) as unknown as typeof fetch
  return { fn, llamadas }
}
const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })
const secreto = () => 'sec-fichaje'

test('PIN correcto: manda entrada a rrhh con Bearer, empresa, NIF e IP; sin hora (la pone rrhh)', async () => {
  const { conTaller, pepe } = await montar()
  const f = fetchFalso(() => json({ ok: true, empleado: { nombre: 'Pepe' } }, 201))
  const r = await ficharConPin({ conTaller, fetchFn: f.fn, env: ENV, secreto }, { tallerId: T, usuarioId: pepe.id, ip: '7.7.7.7', pin: '4826', accion: 'entrada', ahora: AHORA })
  assert.deepEqual(r, { ok: true, accion: 'entrada' }, 'al trabajador solo «registrado»: ni el nombre de rrhh')
  assert.equal(f.llamadas.length, 1)
  assert.equal(f.llamadas[0].url, 'https://rrhh.test/api/operador/fichajes')
  assert.equal(f.llamadas[0].init.headers.authorization, 'Bearer sec-fichaje')
  assert.deepEqual(JSON.parse(f.llamadas[0].init.body), { taller_id: T, empresa_id: EMPRESA, accion: 'entrada', dni: '12345678Z', ip: '7.7.7.7' })
})

test('un identificador uuid se manda como empleado_id', async () => {
  const id = '44444444-4444-4444-8444-444444444444'
  const { conTaller, pepe } = await montar({ identificador: id })
  const f = fetchFalso(() => json({ ok: true }, 201))
  await ficharConPin({ conTaller, fetchFn: f.fn, env: ENV, secreto }, { tallerId: T, usuarioId: pepe.id, ip: 'sin-ip', pin: '4826', accion: 'salida', ahora: AHORA })
  const b = JSON.parse(f.llamadas[0].init.body)
  assert.equal(b.empleado_id, id); assert.equal(b.dni, undefined); assert.equal(b.ip, undefined)
})

test('PIN incorrecto: no se llama a rrhh', async () => {
  const { conTaller, pepe } = await montar()
  const f = fetchFalso(() => json({}, 201))
  const r = await ficharConPin({ conTaller, fetchFn: f.fn, env: ENV, secreto }, { tallerId: T, usuarioId: pepe.id, ip: '1.1.1.1', pin: '9999', accion: 'entrada', ahora: AHORA })
  assert.equal(r.ok, false); assert.equal((r as any).status, 401)
  assert.equal(f.llamadas.length, 0)
})

test('rrhh responde error: se dice claro y NO se finge éxito', async () => {
  const { conTaller, pepe } = await montar()
  const dup = fetchFalso(() => json({ codigo: 'ya_fichado' }, 409))
  const a = await ficharConPin({ conTaller, fetchFn: dup.fn, env: ENV, secreto }, { tallerId: T, usuarioId: pepe.id, ip: '1.1.1.1', pin: '4826', accion: 'entrada', ahora: AHORA })
  assert.equal(a.ok, false); assert.match((a as any).error, /entrada abierta[\s\S]*NO se ha registrado/)
  const caido = fetchFalso(() => json({ error: 'boom' }, 500))
  const b = await ficharConPin({ conTaller, fetchFn: caido.fn, env: ENV, secreto }, { tallerId: T, usuarioId: pepe.id, ip: '1.1.1.1', pin: '4826', accion: 'entrada', ahora: AHORA })
  assert.equal(b.ok, false); assert.match((b as any).error, /NO se ha registrado/)
  const mal = fetchFalso(() => json({ error: 'No autorizado' }, 401))
  const c = await ficharConPin({ conTaller, fetchFn: mal.fn, env: ENV, secreto }, { tallerId: T, usuarioId: pepe.id, ip: '1.1.1.1', pin: '4826', accion: 'salida', ahora: AHORA })
  assert.equal(c.ok, false); assert.match((c as any).error, /conectado con RR\.HH\./)
})

test('rrhh no responde (red caída): error claro, sin éxito', async () => {
  const { conTaller, pepe } = await montar()
  const r = await ficharConPin({ conTaller, fetchFn: (async () => { throw new Error('ECONNRESET') }) as any, env: ENV, secreto }, { tallerId: T, usuarioId: pepe.id, ip: '1.1.1.1', pin: '4826', accion: 'entrada', ahora: AHORA })
  assert.equal(r.ok, false); assert.match((r as any).error, /contactar con RR\.HH[\s\S]*NO se ha registrado/)
})

test('usuario o taller sin vincular: 422 y rrhh no se llama', async () => {
  for (const o of [{ identificador: null }, { empresa: null }]) {
    const { conTaller, pepe } = await montar(o)
    const f = fetchFalso(() => json({}, 201))
    const r = await ficharConPin({ conTaller, fetchFn: f.fn, env: ENV, secreto }, { tallerId: T, usuarioId: pepe.id, ip: '1.1.1.1', pin: '4826', accion: 'entrada', ahora: AHORA })
    assert.equal((r as any).status, 422); assert.equal(f.llamadas.length, 0)
  }
})

test('sin RRHH_URL o sin secreto: no disponible (los botones no aparecen) y ficharConPin rechaza', async () => {
  assert.equal(fichajeRrhhDisponible({}), false)
  assert.equal(fichajeRrhhDisponible({ RRHH_URL: 'https://x' }), false)
  assert.equal(fichajeRrhhDisponible({ RRHH_FICHAJE_TALLER_SECRET: 's' }), false)
  assert.equal(fichajeRrhhDisponible(ENV), true)
  const { conTaller, pepe } = await montar()
  const r = await ficharConPin({ conTaller, env: {}, secreto }, { tallerId: T, usuarioId: pepe.id, ip: '1.1.1.1', pin: '4826', accion: 'entrada', ahora: AHORA })
  assert.equal((r as any).status, 503)
})

test('acción inventada: 400', async () => {
  const { conTaller, pepe } = await montar()
  const r = await ficharConPin({ conTaller, env: ENV, secreto }, { tallerId: T, usuarioId: pepe.id, ip: '1.1.1.1', pin: '4826', accion: 'toggle', ahora: AHORA })
  assert.equal((r as any).status, 400)
})

test('el vínculo con el empleado lo edita el dueño (valida formato; vacío = sin vincular); la EMPRESA de rrhh ya no', async () => {
  const { bd, conTaller } = await montar({ identificador: null, empresa: null })
  const u = bd.filas('usuarioTaller')[0]
  await conTaller(T, async (tx: any) => {
    assert.equal(await guardarIdentificadorRrhh(tx, T, u.id, ' 12.345.678-z '), '12345678-Z')
    assert.equal(await guardarIdentificadorRrhh(tx, T, u.id, '  '), null)
    await assert.rejects(guardarIdentificadorRrhh(tx, T, u.id, 'a b$'), /no válido/)
  })
  // Hallazgo 2 (revisión de seguridad): el dueño no puede apuntar el fichaje a OTRA empresa de rrhh. La función de escritura ya no existe...
  assert.equal((vinculo as Record<string, unknown>).guardarEmpresaRrhh, undefined)
  const raiz = join(import.meta.dirname, '..')
  assert.ok(!/guardarEmpresaRrhh|rrhhEmpresaId/.test(readFileSync(join(raiz, 'app', 'ajustes', 'acciones.ts'), 'utf8')), 'ninguna acción de Ajustes escribe rrhhEmpresaId')
  assert.ok(!/rrhhEmpresaId/.test(readFileSync(join(raiz, 'lib', 'vinculo-rrhh.ts'), 'utf8').replace(/\/\/.*$/gm, '')), 'el vínculo del dueño no toca la empresa')
  // ... y la BD tampoco se lo permite: 0006 le quita el UPDATE de la columna al rol de la app (solo el operador, por función).
  const sql6 = readFileSync(join(raiz, 'prisma', 'sql', '0006_login_taller_usuario_pin.sql'), 'utf8')
  assert.match(sql6, /REVOKE UPDATE \(rrhh_empresa_id\) ON taller\.talleres FROM prisma_taller;/)
})

test('sin empresa vinculada por el operador no se ficha, aunque el dueño intente fijarla desde la propia fila (422)', async () => {
  const { conTaller, pepe } = await montar({ empresa: null })
  const f = fetchFalso(() => json({}, 201))
  const r = await ficharConPin({ conTaller, fetchFn: f.fn, env: ENV, secreto }, { tallerId: T, usuarioId: pepe.id, ip: '1.1.1.1', pin: '4826', accion: 'entrada', ahora: AHORA })
  assert.equal((r as any).status, 422); assert.equal(f.llamadas.length, 0)
})

test('rrhh responde que ese taller no está habilitado: mensaje claro y sin éxito', async () => {
  const { conTaller, pepe } = await montar()
  const f = fetchFalso(() => json({ error: 'no habilitado', codigo: 'fichaje_taller_no_habilitado' }, 403))
  const r = await ficharConPin({ conTaller, fetchFn: f.fn, env: ENV, secreto }, { tallerId: T, usuarioId: pepe.id, ip: '1.1.1.1', pin: '4826', accion: 'entrada', ahora: AHORA })
  assert.equal(r.ok, false); assert.match((r as any).error, /no tiene habilitado el fichaje desde este taller[\s\S]*NO se ha registrado/)
})

test('usuario equivocado o PIN de otra persona: no ficha ni llama a rrhh', async () => {
  const { bd, conTaller, pepe } = await montar()
  const ana = bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Ana', rol: 'mecanico', pinHash: await hashPin('7391', 1000), rrhhIdentificador: '87654321X' })
  const f = fetchFalso(() => json({}, 201))
  const cruzado = await ficharConPin({ conTaller, fetchFn: f.fn, env: ENV, secreto }, { tallerId: T, usuarioId: pepe.id, ip: '1.1.1.1', pin: '7391', accion: 'entrada', ahora: AHORA })
  assert.equal((cruzado as any).status, 401)
  const sinUsuario = await ficharConPin({ conTaller, fetchFn: f.fn, env: ENV, secreto }, { tallerId: T, usuarioId: undefined, ip: '1.1.1.1', pin: '4826', accion: 'entrada', ahora: AHORA })
  assert.equal((sinUsuario as any).status, 401)
  assert.equal(f.llamadas.length, 0)
  const bien = await ficharConPin({ conTaller, fetchFn: fetchFalso(() => json({ ok: true }, 201)).fn, env: ENV, secreto }, { tallerId: T, usuarioId: ana.id, ip: '1.1.1.1', pin: '7391', accion: 'entrada', ahora: AHORA })
  assert.equal(bien.ok, true)
})

test('el taller no lee rrhh: ningún GET ni lectura contra RRHH_URL en el código de fichaje', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'lib', 'fichar-rrhh.ts'), 'utf8')
  assert.equal([...src.matchAll(/method:\s*'(\w+)'/g)].map((m) => m[1]).join(), 'POST')
  assert.ok(!/RRHH_OPERADOR_SECRET/.test(src), 'el taller no usa el secreto de operador de rrhh')
})
