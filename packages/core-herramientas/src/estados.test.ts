import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  transicionContrato, estadoEfectivo, firmable, caducaEn, transicionHerramienta, puede, herramientasVisibles,
  puedeAbrir, concesionValida, PARES_TRANSICION_VERSION, type HerramientaDeCuenta,
} from './estados.ts'

const ahora = new Date()
const hace = (dias: number) => new Date(ahora.getTime() - dias * 86_400_000)

test('contrato: lista blanca de transiciones', () => {
  assert.deepEqual(transicionContrato('enviado', 'firmar'), { ok: true, estado: 'firmado' })
  assert.deepEqual(transicionContrato('firmado', 'sustituir'), { ok: true, estado: 'sustituido' })
  assert.equal(transicionContrato('firmado', 'anular').ok, false, 'un contrato firmado no se anula: se sustituye')
  assert.equal(transicionContrato('anulado', 'firmar').ok, false)
  assert.equal(transicionContrato('caducado', 'firmar').ok, false)
  assert.equal(transicionContrato('sustituido', 'firmar').ok, false)
})

test('el trigger de BD repite la MISMA lista blanca', () => {
  const sql = readFileSync(new URL('../../../apps/empresa/prisma/sql/0001_herramientas.sql', import.meta.url), 'utf8')
  const m = /-- TRANSICIONES-VERSION:INICIO([\s\S]*?)-- TRANSICIONES-VERSION:FIN/.exec(sql)
  assert.ok(m, 'no encuentro el bloque de transiciones en 0001')
  const pares = [...m![1].matchAll(/\('(\w+)',\s*'(\w+)'\)/g)].map((x) => `${x[1]}>${x[2]}`).sort()
  assert.deepEqual(pares, PARES_TRANSICION_VERSION.map(([a, b]) => `${a}>${b}`).sort())
})

test('caducidad a 30 días: enviado y vencido se ENSEÑA caducado y ya no es firmable', () => {
  const emitida = hace(31)
  const v = { estado: 'enviado' as const, caducaEn: caducaEn(emitida) }
  assert.equal(estadoEfectivo(v, ahora), 'caducado')
  assert.equal(firmable(v, ahora), false)
  const fresca = { estado: 'enviado' as const, caducaEn: caducaEn(hace(2)) }
  assert.equal(estadoEfectivo(fresca, ahora), 'enviado')
  assert.equal(firmable(fresca, ahora), true)
  assert.equal(firmable({ estado: 'firmado', caducaEn: caducaEn(hace(2)) }, ahora), false)
})

test('herramienta: activa sigue activa al reemitir; pendiente → activa al firmar; apagada no se firma', () => {
  assert.deepEqual(transicionHerramienta('activa', 'emitir'), { ok: true, estado: 'activa' })
  assert.deepEqual(transicionHerramienta('pendiente_firma', 'firmar'), { ok: true, estado: 'activa' })
  assert.deepEqual(transicionHerramienta('apagada', 'emitir'), { ok: true, estado: 'pendiente_firma' })
  assert.equal(transicionHerramienta('apagada', 'firmar').ok, false)
})

test('permisos: el admin NO firma ni reparte accesos; el dueño sí', () => {
  assert.equal(puede('dueno', 'firmar'), true)
  assert.equal(puede('admin', 'firmar'), false)
  assert.equal(puede('admin', 'dar_acceso'), false)
  assert.equal(puede('admin', 'abrir'), true)
  assert.equal(puede(null, 'ver_portada'), false)
  assert.equal(puede('consulta', 'firmar'), false, 'el socio en consulta no firma')
  assert.equal(puede('consulta', 'dar_acceso'), false, 'el socio en consulta no reparte accesos')
  assert.equal(puede('consulta', 'abrir'), false, 'consulta no abre apps (roles.ts mapea consulta → null): ve el panel')
})

const cuenta: HerramientaDeCuenta[] = [
  { herramienta: 'contabilidad', estado: 'activa' },
  { herramienta: 'rrhh', estado: 'pendiente_firma' },
  { herramienta: 'taller', estado: 'apagada' },
  { herramienta: 'nominas', estado: 'retirada' },
]

test('portada del dueño: activas abribles + pendientes en gris; lo no contratado se OCULTA', () => {
  const v = herramientasVisibles(cuenta, { rol: 'dueno', concedidas: [] })
  assert.deepEqual(v, [
    { herramienta: 'contabilidad', estado: 'activa', abrible: true },
    { herramienta: 'rrhh', estado: 'pendiente_firma', abrible: false },
  ])
})

test('portada del admin: SOLO lo concedido; sin concesiones no ve nada', () => {
  assert.deepEqual(herramientasVisibles(cuenta, { rol: 'admin', concedidas: [] }), [])
  const v = herramientasVisibles(cuenta, { rol: 'admin', concedidas: ['contabilidad', 'taller'] })
  assert.deepEqual(v, [{ herramienta: 'contabilidad', estado: 'activa', abrible: true }])
  assert.equal(puedeAbrir(cuenta, { rol: 'admin', concedidas: ['rrhh'] }, 'rrhh'), false, 'pendiente de firma no se abre')
  assert.equal(puedeAbrir(cuenta, { rol: 'admin', concedidas: ['contabilidad'] }, 'contabilidad'), true)
})

test('portada de consulta: ve TODO lo contratado sin concesiones (como el dueño) pero NADA es abrible', () => {
  const v = herramientasVisibles(cuenta, { rol: 'consulta', concedidas: [] })
  assert.deepEqual(v.map((t) => [t.herramienta, t.estado]), herramientasVisibles(cuenta, { rol: 'dueno', concedidas: [] }).map((t) => [t.herramienta, t.estado]))
  assert.ok(v.every((t) => t.abrible === false))
  assert.equal(puedeAbrir(cuenta, { rol: 'consulta', concedidas: [] }, 'contabilidad'), false)
})

test('conceder solo lo contratado', () => {
  assert.equal(concesionValida(cuenta, 'rrhh'), true)
  assert.equal(concesionValida(cuenta, 'taller'), false)
  assert.equal(concesionValida(cuenta, 'portal_proveedores'), false)
})
