/* eslint-disable @typescript-eslint/no-explicit-any */
// Citas por enlace: invitación (hash, caducidad, un solo uso), reserva ATÓMICA, consentimientos y agenda del taller.
// Cepos vistos fallar el 04/11/2026 (rompiendo el código, mirándolo en rojo y restaurando):
//   · lib/citas.ts: quitar `await bloquearAgenda(tx, e.tallerId)` de reservarPorInvitacion → rojo en «la última plaza».
//   · lib/citas.ts: quitar el `if (!comp.ok)` de la reserva → rojo en «franja llena» y «capacidad».
//   · lib/citas.ts: `invitacionAbierta` → `true` en vistaInvitacion/reservar → rojo en «caducado / usado → 404».
//   · lib/citas.ts: registrar consentimientos sin mirar las casillas (marcadas fijas a true) → rojo en «sin casillas».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { instanteLocal, SERVICIO_DIAGNOSTICO, type ConfigTaller } from '@central/module-taller'
import { aceptarCita, crearInvitacion, huecosPublicos, listarInvitaciones, moverCita, rechazarCita, reservarPorInvitacion, revocarInvitacion, vincularCitaARecepcion, vistaInvitacion } from '../lib/citas.ts'
import { hashToken, tallerDeToken } from '../lib/presupuestos.ts'
import { notificadorRegistro } from '../lib/notificador.ts'
import { resolverEnlaceLimitado, LIMITE_ENLACE } from '../lib/limite-enlace.ts'
import type { FilaCodigo, StoreCodigo } from '../lib/limite-codigo.ts'
import { origenPublico } from '../lib/enlaces.ts'
import { AHORA, montar, T, T2 } from './_escenario.ts'

const JUEVES = '2026-11-05' // AHORA es miércoles 04/11/2026 11:00 en Madrid
const textoTaller = { version: 'v1', texto: 'promos del taller' }

function config(m: ReturnType<typeof montar>, retoque: (c: ConfigTaller) => void = () => {}): ConfigTaller {
  const c = m.config
  c.horarioCitas = { franjas: [1, 2, 3, 4, 5].map((d) => ({ diaSemana: d, desde: '09:00', hasta: '14:00' })), duracionHuecoMinutos: 60, puestos: 2 }
  c.agenda = { ...c.agenda, maxCochesPorFranja: 1, ocupablePuntosBasicos: 10000, margenEntreTrabajosMinutos: 0, antelacionMinimaHoras: 0, confirmacion: 'manual' }
  retoque(c)
  return c
}
const inicio = (hora: string, fecha = JUEVES) => instanteLocal(fecha, hora, 'Europe/Madrid')

async function invitar(m: ReturnType<typeof montar>, c: ConfigTaller, o: { nombre?: string; correo?: string; matricula?: string; ahora?: Date } = {}) {
  const r: any = await m.conTaller(T, (tx: any) => crearInvitacion(tx, {
    tallerId: T, usuarioId: m.dueno.id, nombre: o.nombre ?? 'Ana Pérez', correo: o.correo ?? '', matricula: o.matricula ?? '', ahora: o.ahora ?? AHORA, config: c, origen: 'https://taller.example',
  }, notificadorRegistro(tx)))
  assert.ok(r.ok, JSON.stringify(r))
  return r as { token: string; invitacionId: string; caducaEn: Date }
}

const datos = (c: ConfigTaller, token: string, o: Partial<Parameters<typeof reservarPorInvitacion>[1]> = {}) => ({
  tallerId: T, token, ahora: AHORA, config: c, servicio: 'revision', inicio: inicio('10:00'), matricula: '1234 bcd', nombre: 'Ana Pérez', movil: '600111222',
  correo: '', casillas: { asegura: false, taller: false }, ip: null, userAgent: null, textoTaller, ...o,
})
const reservar = (m: ReturnType<typeof montar>, c: ConfigTaller, token: string, o: Partial<Parameters<typeof reservarPorInvitacion>[1]> = {}): Promise<any> =>
  m.conTaller(T, (tx: any) => reservarPorInvitacion(tx, datos(c, token, o)))

test('la invitación guarda SOLO el hash del token (256 bits), caduca a los N días de la config y no deja el token en la auditoría', async () => {
  const m = montar()
  const c = config(m, (x) => { x.agenda.invitacionCaducaDias = 3 })
  const inv = await invitar(m, c, { correo: 'ana@example.com' })
  assert.equal(tallerDeToken(inv.token), T)
  assert.equal(Buffer.from(inv.token.split('.')[1], 'base64url').length, 32, '256 bits')
  const fila = m.bd.filas('invitacionCita')[0]
  assert.equal(fila.tokenHash, hashToken(inv.token))
  assert.equal(fila.caducaEn.getTime(), AHORA.getTime() + 3 * 86_400_000)
  assert.ok(!JSON.stringify(m.bd.filas('invitacionCita')).includes(inv.token.split('.')[1]), 'el token no está en ninguna columna')
  assert.ok(!JSON.stringify(m.bd.filas('auditoria')).includes(inv.token.split('.')[1]), 'ni en la auditoría')
  assert.equal(m.bd.filas('auditoria').filter((a) => a.accion === 'correo:invitacion_cita').length, 1, 'el envío queda REGISTRADO (no hay transporte)')
})

test('invitación sin nombre, con correo o matrícula inválidos: se rechaza', async () => {
  const m = montar()
  const c = config(m)
  for (const o of [{ nombre: ' ' }, { correo: 'no-es-correo' }, { matricula: '12' }]) {
    const r: any = await m.conTaller(T, (tx: any) => crearInvitacion(tx, { tallerId: T, usuarioId: m.dueno.id, nombre: 'A', correo: '', matricula: '', ahora: AHORA, config: c, origen: null, ...o }, notificadorRegistro(tx)))
    assert.equal(r.ok, false, JSON.stringify(o))
  }
  assert.equal(m.bd.filas('invitacionCita').length, 0)
})

test('reserva: crea vehículo y cliente, cita pendiente (confirmación manual) y CONSUME el token; segundo uso → 404', async () => {
  const m = montar()
  const c = config(m)
  const { token } = await invitar(m, c)
  const r = await reservar(m, c, token)
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(r.estado, 'pedida')
  const cita = m.bd.filas('cita')[0]
  assert.deepEqual([cita.servicio, cita.origen, cita.duracionMinutos], ['revision', 'enlace', 60])
  assert.equal(m.bd.filas('vehiculo')[0].matriculaNormalizada, '1234BCD')
  assert.ok(m.bd.filas('invitacionCita')[0].usadaEn)
  assert.equal(m.bd.filas('invitacionCita')[0].citaId, cita.id)
  const otra = await reservar(m, c, token, { inicio: inicio('11:00') })
  assert.deepEqual([otra.ok, otra.status], [false, 404])
  assert.equal(m.bd.filas('cita').length, 1)
})

test('confirmación automática: la cita entra confirmada', async () => {
  const m = montar()
  const c = config(m, (x) => { x.agenda.confirmacion = 'automatica' })
  const { token } = await invitar(m, c)
  assert.equal((await reservar(m, c, token)).estado, 'confirmada')
})

test('token caducado, usado o revocado → 404 (vista y reserva), y un token de otro taller no abre nada', async () => {
  const m = montar()
  const c = config(m, (x) => { x.agenda.invitacionCaducaDias = 1 })
  const { token, invitacionId } = await invitar(m, c)
  const manana = new Date(AHORA.getTime() + 2 * 86_400_000)
  assert.equal(await m.conTaller(T, (tx: any) => vistaInvitacion(tx, T, token, manana)), null, 'caducado')
  const rc = await reservar(m, c, token, { ahora: manana, inicio: inicio('10:00', '2026-11-09') })
  assert.deepEqual([rc.ok, rc.status], [false, 404])
  assert.ok(await m.conTaller(T, (tx: any) => vistaInvitacion(tx, T, token, AHORA)), 'vigente hoy')
  assert.equal(await m.conTaller(T, (tx: any) => revocarInvitacion(tx, { tallerId: T, invitacionId, ahora: AHORA })), true)
  const rr = await reservar(m, c, token)
  assert.deepEqual([rr.ok, rr.status], [false, 404])
  assert.equal(m.bd.filas('cita').length, 0)
  assert.equal(await m.conTaller(T2, (tx: any) => vistaInvitacion(tx, T2, token, AHORA)), null, 'otro taller (RLS)')
  // y la usada
  const o = await invitar(m, c)
  assert.equal((await reservar(m, c, o.token)).ok, true)
  assert.equal(await m.conTaller(T, (tx: any) => vistaInvitacion(tx, T, o.token, AHORA)), null, 'usada')
  assert.equal((await m.conTaller(T, (tx: any) => listarInvitaciones(tx, T, AHORA))).filter((i: any) => i.estado === 'usada').length, 1)
})

test('franja llena: no se puede reservar la que ya tiene el máximo de coches, y no se gasta el token', async () => {
  const m = montar()
  const c = config(m)
  const a = await invitar(m, c)
  const b = await invitar(m, c, { nombre: 'Luis' })
  assert.equal((await reservar(m, c, a.token)).ok, true)
  const r = await reservar(m, c, b.token, { matricula: '9999 zzz', nombre: 'Luis' })
  assert.deepEqual([r.ok, r.status], [false, 409])
  assert.equal(m.bd.filas('invitacionCita').find((i) => i.id === b.invitacionId)!.usadaEn ?? null, null, 'el token sigue vivo para elegir otra franja')
  assert.equal((await reservar(m, c, b.token, { matricula: '9999 zzz', nombre: 'Luis', inicio: inicio('11:00') })).ok, true)
})

test('capacidad diaria agotada: aunque la franja esté libre, no se reserva', async () => {
  const m = montar()
  const c = config(m, (x) => { x.horarioCitas.puestos = 1; x.horarioCitas.franjas = [1, 2, 3, 4, 5].map((d) => ({ diaSemana: d, desde: '09:00', hasta: '11:00' })) })
  // capacidad del jueves = 120 min; el servicio dura 60 → caben dos reservas, la tercera no aunque quede franja
  c.agenda.maxCochesPorFranja = 5
  const ts = [await invitar(m, c), await invitar(m, c), await invitar(m, c)]
  assert.equal((await reservar(m, c, ts[0].token, { inicio: inicio('09:00'), matricula: '1111 aaa' })).ok, true)
  assert.equal((await reservar(m, c, ts[1].token, { inicio: inicio('09:00'), matricula: '2222 bbb' })).ok, true)
  const r = await reservar(m, c, ts[2].token, { inicio: inicio('10:00'), matricula: '3333 ccc' })
  assert.deepEqual([r.ok, r.status], [false, 409])
  const h = await m.conTaller(T, (tx: any) => huecosPublicos(tx, { tallerId: T, token: ts[2].token, servicio: 'revision', desde: inicio('00:00'), hasta: inicio('23:59'), ahora: AHORA, config: c }))
  assert.deepEqual((h as any).huecos, [], 'el día entero desaparece del calendario público')
})

test('DOBLE RESERVA de la última plaza a la vez: una gana, la otra recibe 409 y solo hay UNA cita', async () => {
  const m = montar()
  const c = config(m)
  const a = await invitar(m, c)
  const b = await invitar(m, c, { nombre: 'Luis' })
  const res: any[] = await Promise.all([
    reservar(m, c, a.token),
    reservar(m, c, b.token, { matricula: '9999 zzz', nombre: 'Luis' }),
  ])
  assert.equal(res.filter((x) => x.ok).length, 1, JSON.stringify(res))
  assert.equal(res.find((x) => !x.ok).status, 409)
  assert.equal(m.bd.filas('cita').length, 1)
  assert.equal(m.bd.filas('invitacionCita').filter((i) => i.usadaEn).length, 1, 'solo se gasta el token del ganador')
})

test('el MISMO token usado dos veces a la vez: una sola cita', async () => {
  const m = montar()
  const c = config(m, (x) => { x.agenda.maxCochesPorFranja = 5 })
  const { token } = await invitar(m, c)
  const res: any[] = await Promise.all([reservar(m, c, token), reservar(m, c, token, { inicio: inicio('11:00') })])
  assert.equal(res.filter((x) => x.ok).length, 1, JSON.stringify(res))
  assert.equal(m.bd.filas('cita').length, 1)
})

test('una OT abierta con horas pendientes quita capacidad al día', async () => {
  const m = montar()
  const c = config(m, (x) => { x.horarioCitas.puestos = 1; x.agenda.maxCochesPorFranja = 5 })
  const rec = m.bd.sembrar('recepcion', { tallerId: T })
  const ot = m.bd.sembrar('ordenTrabajo', { tallerId: T, numero: 1, recepcionId: rec.id, vehiculoId: 'v', estado: 'en_curso' })
  m.bd.sembrar('otLinea', { tallerId: T, otId: ot.id, baremoMinutos: 99999 }) // llena hoy y los días siguientes
  const { token } = await invitar(m, c)
  const r = await reservar(m, c, token)
  assert.deepEqual([r.ok, r.status], [false, 409])
})

test('SIN casillas marcadas no se crea ningún consentimiento y la cita se reserva igual', async () => {
  const m = montar()
  const c = config(m)
  const { token } = await invitar(m, c)
  assert.equal((await reservar(m, c, token, { casillas: { asegura: false, taller: false } })).ok, true)
  assert.equal(m.bd.filas('consentimiento').length, 0)
})

test('con casillas marcadas: una fila por casilla, canal cita_enlace, texto exacto; y solo si no las tenía ya', async () => {
  const m = montar()
  const c = config(m, (x) => { x.agenda.maxCochesPorFranja = 5 })
  const a = await invitar(m, c, { correo: 'ana@example.com' })
  assert.equal((await reservar(m, c, a.token, { casillas: { asegura: true, taller: true }, correo: 'ana@example.com' })).ok, true)
  const filas = m.bd.filas('consentimiento')
  assert.deepEqual(filas.map((f) => [f.finalidad, f.canal]).sort(), [['asegura', 'cita_enlace'], ['taller_comercial', 'cita_enlace']])
  assert.equal(filas.find((f) => f.finalidad === 'taller_comercial')!.textoMostrado, textoTaller.texto)
  // segunda cita del mismo cliente (mismo correo, mismo coche): ya las tiene, no se duplican
  const b = await invitar(m, c, { correo: 'ana@example.com', matricula: '1234BCD' })
  assert.equal((await reservar(m, c, b.token, { inicio: inicio('12:00'), casillas: { asegura: true, taller: true }, correo: 'ana@example.com' })).ok, true)
  assert.equal(m.bd.filas('consentimiento').length, 2)
})

test('matrícula de un vehículo AJENO: no se le atribuye al titular el consentimiento de otra persona', async () => {
  const m = montar()
  const c = config(m, (x) => { x.agenda.maxCochesPorFranja = 5 })
  const dueno = m.bd.sembrar('cliente', { tallerId: T, nombre: 'Titular', correo: 'titular@example.com' })
  m.bd.sembrar('vehiculo', { tallerId: T, matricula: '1234BCD', matriculaNormalizada: '1234BCD', clienteId: dueno.id })
  const { token } = await invitar(m, c, { nombre: 'Curioso', correo: 'curioso@example.com' })
  const r = await reservar(m, c, token, { casillas: { asegura: true, taller: true }, nombre: 'Curioso', correo: 'curioso@example.com' })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(m.bd.filas('consentimiento').filter((f) => f.clienteId === dueno.id).length, 0, 'nada a nombre del titular')
  assert.equal(m.bd.filas('vehiculo').length, 1, 'el vehículo existente se enlaza, no se duplica')
  assert.equal(m.bd.filas('vehiculo')[0].clienteId, dueno.id, 'y no se le quita al titular')
})

test('si la matrícula ya existe y es del invitado (misma matrícula en la invitación), se enlaza al cliente existente', async () => {
  const m = montar()
  const c = config(m)
  const cli = m.bd.sembrar('cliente', { tallerId: T, nombre: 'Ana', correo: null })
  m.bd.sembrar('vehiculo', { tallerId: T, matricula: '1234BCD', matriculaNormalizada: '1234BCD', clienteId: cli.id })
  const { token } = await invitar(m, c, { matricula: '1234 bcd' })
  assert.equal((await reservar(m, c, token)).ok, true)
  assert.equal(m.bd.filas('cita')[0].clienteId, cli.id)
  assert.equal(m.bd.filas('cliente').length, 1)
})

test('datos inválidos: matrícula, contacto, servicio; nada se escribe ni se gasta el token', async () => {
  const m = montar()
  const c = config(m)
  const { token } = await invitar(m, c)
  for (const o of [{ matricula: '12' }, { movil: '', correo: '' }, { movil: '123' }, { nombre: '' }, { servicio: 'inventado' }]) {
    const r = await reservar(m, c, token, o)
    assert.equal(r.ok, false, JSON.stringify(o))
  }
  assert.equal(m.bd.filas('cita').length, 0)
  assert.equal(m.bd.filas('invitacionCita')[0].usadaEn ?? null, null)
  assert.equal((await reservar(m, c, token, { servicio: SERVICIO_DIAGNOSTICO })).ok, true)
})

test('agenda del taller: aceptar, rechazar, mover y convertir en recepción (cada una solo una vez)', async () => {
  const m = montar()
  const c = config(m, (x) => { x.agenda.maxCochesPorFranja = 5 })
  const ids: string[] = []
  for (const [i, h] of ['09:00', '10:00', '11:00'].entries()) {
    const { token } = await invitar(m, c)
    const r = await reservar(m, c, token, { inicio: inicio(h), matricula: `${1000 + i} ABC` })
    ids.push(r.citaId)
  }
  const [a, b, d] = ids
  assert.equal((await m.conTaller(T, (tx: any) => aceptarCita(tx, { tallerId: T, citaId: a }))).ok, true)
  assert.equal((await m.conTaller(T, (tx: any) => aceptarCita(tx, { tallerId: T, citaId: a }))).ok, false, 'ya no está pendiente')
  assert.equal((await m.conTaller(T, (tx: any) => rechazarCita(tx, { tallerId: T, citaId: b, motivo: 'Sin recambio' }))).ok, true)
  assert.equal(m.bd.filas('cita').find((x) => x.id === b)!.estado, 'cancelada')
  // lo cancelado libera la franja
  const libre = await m.conTaller(T, (tx: any) => moverCita(tx, { tallerId: T, citaId: d, nuevoInicio: inicio('10:00'), ahora: AHORA, config: c }))
  assert.equal(libre.ok, true, JSON.stringify(libre))
  assert.equal((await m.conTaller(T, (tx: any) => moverCita(tx, { tallerId: T, citaId: d, nuevoInicio: inicio('03:00'), ahora: AHORA, config: c }))).ok, false, 'fuera de horario')
  assert.equal((await m.conTaller(T, (tx: any) => moverCita(tx, { tallerId: T, citaId: b, nuevoInicio: inicio('12:00'), ahora: AHORA, config: c }))).ok, false, 'una cancelada no se mueve')
  const rec = m.bd.sembrar('recepcion', { tallerId: T })
  assert.equal(await m.conTaller(T, (tx: any) => vincularCitaARecepcion(tx, { tallerId: T, citaId: a, recepcionId: rec.id, ahora: AHORA })), true)
  assert.equal(await m.conTaller(T, (tx: any) => vincularCitaARecepcion(tx, { tallerId: T, citaId: a, recepcionId: rec.id, ahora: AHORA })), false)
  assert.equal(m.bd.filas('cita').find((x) => x.id === a)!.estado, 'realizada')
})

test('límite por IP del enlace: 10 tokens malos la bloquean 1 h; ni el token CORRECTO resuelve y la respuesta es la misma (null)', async () => {
  const mapa = new Map<string, FilaCodigo>()
  const store: StoreCodigo = { leer: async (k) => mapa.get(k) ?? null, guardar: async (k, f) => void mapa.set(k, f), borrar: async (k) => void mapa.delete(k) }
  const prueba = (bueno: boolean, ip: string | null, ahora: Date) => resolverEnlaceLimitado(store, { ip, ahora, resolver: async () => (bueno ? T : null) })
  for (let i = 0; i < LIMITE_ENLACE.maxFallos; i++) assert.equal(await prueba(false, '1.1.1.1', AHORA), null)
  assert.equal(await prueba(true, '1.1.1.1', new Date(AHORA.getTime() + 60_000)), null, 'IP bloqueada')
  assert.equal(await prueba(true, '2.2.2.2', AHORA), T, 'otra IP no')
  assert.equal(await prueba(true, '1.1.1.1', new Date(AHORA.getTime() + (LIMITE_ENLACE.bloqueoMinutos + 1) * 60_000)), T, 'vencido el bloqueo')
  assert.ok(mapa.has('enlace:2.2.2.2') === false && [...mapa.keys()].every((k) => k.startsWith('enlace:')))
  await prueba(false, null, AHORA)
  assert.ok(mapa.has('enlace:sin-ip'), 'sin IP: una cubeta común, nunca se salta el límite')
})

test('origen público: variable de entorno primero, luego el host; sin ninguno válido, null', () => {
  assert.equal(origenPublico({ TALLER_URL_PUBLICA: 'https://taller.example/x' }, 'otro.com', 'https'), 'https://taller.example')
  assert.equal(origenPublico({}, 'taller.example', 'https'), 'https://taller.example')
  assert.equal(origenPublico({}, null, null), null)
  assert.equal(origenPublico({}, 'a b.com', 'https'), null)
  assert.equal(origenPublico({ NODE_ENV: 'production' }, 'x.com', 'http'), null, 'en producción solo https')
})

test('guardianes de fuentes: /c/ pasa por el límite por IP y el token; middleware lo deja pasar; 0007 sin token en claro', () => {
  const lee = (...r: string[]) => readFileSync(join(import.meta.dirname, '..', ...r), 'utf8')
  const ac = lee('app', 'c', '[token]', 'acciones.ts')
  assert.match(ac, /tallerPorEnlaceLimitado\(token/)
  assert.match(lee('app', 'c', '[token]', 'page.tsx'), /tallerPorEnlaceLimitado\(token/)
  assert.match(lee('middleware.ts'), /'\/c\/'/)
  const sql = lee('prisma', 'sql', '0007_citas_enlace.sql')
  assert.match(sql, /token_hash\s+text NOT NULL/)
  assert.doesNotMatch(sql, /\btoken\s+text/, 'solo existe el hash')
  assert.match(sql, /CONSTRAINT ux_invitaciones_cita_token UNIQUE \(token_hash\)/)
  assert.match(sql, /ux_citas_invitacion ON taller\.citas \(invitacion_id\)/)
})
