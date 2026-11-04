/* eslint-disable @typescript-eslint/no-explicit-any */
// Presupuestos: cálculo desde la CONFIG del taller, enlace con token, aceptación pública.
// Cepos vistos fallar el 04/11/2026: (1) en lib/presupuestos.ts `vistaPorToken` devolviendo el primer presupuesto del taller
// aunque el hash no coincida (quitar `tokenHash` del where): rojo en 'token inválido → 404'. (2) quitar la guarda
// `if (!UUID…)` de tallerDeToken: rojo en 'formato inválido'. Restaurados → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TEXTOS_CONSENTIMIENTO_ASEGURA, VERSION_TEXTO_ASEGURA_VIGENTE } from '@central/module-taller'
import {
  aceptarPorToken, crearPresupuestoDesdeOt, generarEnlace, hashToken, nuevoToken, tallerDeToken, vistaPorToken,
} from '../lib/presupuestos.ts'
import { AHORA, montar, recibir, T, T2 } from './_escenario.ts'

const lineas = [{ tipo: 'paquete' as const, paqueteCodigo: 'revision' }]

async function conPresupuesto(m: ReturnType<typeof montar>, firma = true) {
  const r = await recibir(m, firma ? {} : { firma: null })
  const c = await m.conTaller(T, (tx: any) => crearPresupuestoDesdeOt(tx, { tallerId: T, otId: r.otId, tipoVehiculo: 'turismo', lineas, ahora: AHORA }, m.config))
  return { r, c }
}

test('el precio sale de la CONFIGURACIÓN: cambiar el precio hora cambia el siguiente presupuesto', async () => {
  const m = montar()
  const { c } = await conPresupuesto(m)
  assert.ok(c.ok)
  const p = m.bd.filas('presupuesto')[0]
  // 60 min × 60,00 €/h = 6.000 céntimos de base; IVA del alta (general) sale de la config, no de un literal.
  assert.equal(Number(p.baseCent), m.config.precioHoraCent)
  assert.equal(Number(p.totalCent), Number(p.baseCent) + Number(p.cuotaIvaCent))
  assert.equal(Number(p.precioHoraCent), 6000, 'precio hora congelado en el presupuesto')

  const m2 = montar()
  m2.config.precioHoraCent = 9000
  await conPresupuesto(m2)
  assert.equal(Number(m2.bd.filas('presupuesto')[0].baseCent), 9000)
})

test('sin recepción firmada no se presupuesta; la OT pasa a «presupuesto» al crearlo', async () => {
  const m = montar()
  const sin = await conPresupuesto(m, false)
  assert.equal(sin.c.ok, false)
  assert.equal(m.bd.filas('presupuesto').length, 0)
  const m2 = montar()
  const { r, c } = await conPresupuesto(m2)
  assert.ok(c.ok)
  assert.equal(m2.bd.filas('ordenTrabajo').find((o) => o.id === r.otId).estado, 'presupuesto')
})

test('tipo de vehículo desconocido o línea sin datos: errores del módulo, nada se escribe', async () => {
  const m = montar()
  const r = await recibir(m)
  const c = await m.conTaller(T, (tx: any) => crearPresupuestoDesdeOt(tx, { tallerId: T, otId: r.otId, tipoVehiculo: null, lineas, ahora: AHORA }, m.config))
  assert.equal(c.ok, false)
  assert.equal(m.bd.filas('presupuesto').length, 0)
})

test('formato inválido de token → null (404 sin tocar la BD)', () => {
  for (const malo of [undefined, null, '', 'abc', 'x.y', `${T}.abc`, `${T.replace(/-/g, '')}.corto`, 'a.b.c', 42]) {
    assert.equal(tallerDeToken(malo), null, String(malo))
  }
  const t = nuevoToken(T)
  assert.equal(tallerDeToken(t), T)
})

test('token inválido o desconocido → 404; el hash, no el token, está en BD', async () => {
  const m = montar()
  const { r, c } = await conPresupuesto(m)
  assert.ok(c.ok && r.otId)
  const g = await m.conTaller(T, (tx: any) => generarEnlace(tx, { tallerId: T, presupuestoId: (c as any).presupuestoId, ahora: AHORA, config: m.config }))
  assert.ok(g.ok)
  const token = (g as any).token as string
  const fila = m.bd.filas('presupuesto')[0]
  assert.equal(fila.tokenHash, hashToken(token))
  assert.ok(!JSON.stringify(fila, (_k, v) => (typeof v === 'bigint' ? String(v) : v)).includes(token), 'el token no se guarda')
  assert.equal(fila.estado, 'enviado')

  const ver = (t: string, taller = T) => m.conTaller(taller, (tx: any) => vistaPorToken(tx, taller, t, AHORA))
  const bueno = await ver(token)
  assert.ok(bueno.ok && bueno.estado === 'abierto')
  assert.deepEqual(await ver(nuevoToken(T)), { ok: false, status: 404 }, 'token bien formado pero desconocido')
  assert.deepEqual(await ver(token, T2), { ok: false, status: 404 }, 'el taller equivocado no lo ve (RLS)')
})

test('aceptar: queda fecha/IP/texto, la OT pasa a «aceptado» y copia las líneas con su baremo', async () => {
  const m = montar()
  const { r, c } = await conPresupuesto(m)
  const g: any = await m.conTaller(T, (tx: any) => generarEnlace(tx, { tallerId: T, presupuestoId: (c as any).presupuestoId, ahora: AHORA, config: m.config }))
  const acepta = (casillas = { asegura: false, taller: false }) =>
    m.conTaller(T, (tx: any) => aceptarPorToken(tx, { tallerId: T, token: g.token, ip: '5.6.7.8', userAgent: 'ua', ahora: AHORA, casillas }, {
      textoTaller: { version: m.config.textos.versionTextoComercialTaller, texto: m.config.textos.textoConsentimientoComercialTaller },
    }))
  const a = await acepta()
  assert.ok(a.ok)
  const p = m.bd.filas('presupuesto')[0]
  assert.equal(p.estado, 'aceptado')
  assert.equal(p.aceptadoIp, '5.6.7.8')
  assert.match(p.aceptadoTexto, /Acepto el presupuesto de .*€/)
  assert.equal(m.bd.filas('ordenTrabajo').find((o) => o.id === r.otId).estado, 'aceptado')
  const ls = m.bd.filas('otLinea')
  assert.equal(ls.length, 1)
  assert.equal(ls[0].baremoMinutos, 60)
  assert.equal(ls[0].minutosReales, null)
  assert.equal(m.bd.filas('consentimiento').length, 0, 'sin marcar: ninguna fila, y aceptó igual')
  assert.deepEqual(await acepta(), { ok: false, status: 409, motivo: 'el presupuesto está aceptado' }, 'no se acepta dos veces')
})

test('aceptar con casillas marcadas: canal presupuesto_casa y texto exacto; no repite lo que el cliente ya tenía', async () => {
  const m = montar()
  const { c } = await conPresupuesto(m)
  const g: any = await m.conTaller(T, (tx: any) => generarEnlace(tx, { tallerId: T, presupuestoId: (c as any).presupuestoId, ahora: AHORA, config: m.config }))
  await m.conTaller(T, (tx: any) => aceptarPorToken(tx, { tallerId: T, token: g.token, ip: null, userAgent: null, ahora: AHORA, casillas: { asegura: true, taller: false } }, {
    textoTaller: { version: 'v', texto: 't' },
  }))
  const fs = m.bd.filas('consentimiento')
  assert.equal(fs.length, 1)
  assert.equal(fs[0].canal, 'presupuesto_casa')
  assert.equal(fs[0].textoMostrado, TEXTOS_CONSENTIMIENTO_ASEGURA[VERSION_TEXTO_ASEGURA_VIGENTE])
})

test('presupuesto caducado no se acepta', async () => {
  const m = montar()
  const { c } = await conPresupuesto(m)
  const g: any = await m.conTaller(T, (tx: any) => generarEnlace(tx, { tallerId: T, presupuestoId: (c as any).presupuestoId, ahora: AHORA, config: m.config }))
  const tarde = new Date(AHORA.getTime() + (m.config.validezPresupuestoDias + 1) * 86_400_000)
  const a = await m.conTaller(T, (tx: any) => aceptarPorToken(tx, { tallerId: T, token: g.token, ip: null, userAgent: null, ahora: tarde, casillas: { asegura: false, taller: false } }, { textoTaller: { version: 'v', texto: 't' } }))
  assert.equal(a.ok, false)
  assert.equal(m.bd.filas('presupuesto')[0].estado, 'enviado')
})
