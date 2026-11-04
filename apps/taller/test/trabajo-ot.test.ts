/* eslint-disable @typescript-eslint/no-explicit-any */
// El mecánico en su OT (notas, fotos, propuestas de ampliación sin precios) y el flujo ampliación → enlace → aceptación.
// Cepos vistos fallar el 04/11/2026: (1) en lib/presupuestos.ts quitar `origen === 'ampliacion'` del `if` de aceptarPorToken: la
// ampliación aceptada no llega a la OT (rojo en 'ampliación aceptada'). (2) en contarAmpliacionesPendientes devolver 0: rojo en
// 'con una ampliación sin responder no se termina la OT'. Restaurados → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { almacenSoloMetadatos } from '../lib/almacen.ts'
import { abrirParteMecanico, cambiarEstadoOt, cerrarParteMecanico } from '../lib/ordenes.ts'
import { aceptarPorToken, crearPresupuestoDesdeOt, generarEnlace, rechazarPorToken, reemplazarBorrador } from '../lib/presupuestos.ts'
import { anadirFotos, anadirNota, descartarPropuesta, enviarPropuesta, proponerAmpliacion, ErrorTrabajo } from '../lib/trabajo-ot.ts'
import { AHORA, montar, recibir, T } from './_escenario.ts'

const deps = { textoTaller: { version: 'v', texto: 't' } }
const foto = { mime: 'image/jpeg', nombre: 'f.jpg', bytes: new Uint8Array([9, 9, 9]), capturadaEn: AHORA }

async function otEnCurso(m: ReturnType<typeof montar>) {
  const r = await recibir(m)
  const c: any = await m.conTaller(T, (tx: any) => crearPresupuestoDesdeOt(tx, { tallerId: T, otId: r.otId, tipoVehiculo: 'turismo', lineas: [{ tipo: 'paquete', paqueteCodigo: 'revision' }], ahora: AHORA }, m.config))
  const g: any = await m.conTaller(T, (tx: any) => generarEnlace(tx, { tallerId: T, presupuestoId: c.presupuestoId, ahora: AHORA, config: m.config }))
  await m.conTaller(T, (tx: any) => aceptarPorToken(tx, { tallerId: T, token: g.token, ip: null, userAgent: null, ahora: AHORA, casillas: { asegura: false, taller: false } }, deps))
  await m.conTaller(T, (tx: any) => abrirParteMecanico(tx, { tallerId: T, mecanicoId: m.mec.id, otId: r.otId, ahora: AHORA }))
  return r.otId as string
}
const estado = (m: ReturnType<typeof montar>, otId: string) => m.bd.filas('ordenTrabajo').find((o) => o.id === otId).estado
const proponer = (m: ReturnType<typeof montar>, otId: string, fotos = [foto]) =>
  m.conTaller(T, (tx: any) => proponerAmpliacion(tx, almacenSoloMetadatos, {
    tallerId: T, usuarioId: m.mec.id, otId, explicacion: 'Pastillas gastadas', lineas: [{ descripcion: 'Pastillas delanteras', referencia: 'PD-1', cantidad: 1 }], fotos,
  }))
const enviar = (m: ReturnType<typeof montar>, propuestaId: string, precio = 4550) =>
  m.conTaller(T, (tx: any) => enviarPropuesta(tx, { tallerId: T, propuestaId, precios: [{ orden: 1, precioUnitarioCent: precio }], config: m.config, ahora: AHORA }))

test('nota y fotos del mecánico quedan en SU orden y taller; nota vacía rechazada; orden cerrada no admite nada', async () => {
  const m = montar()
  const ot = await otEnCurso(m)
  await m.conTaller(T, (tx: any) => anadirNota(tx, { tallerId: T, usuarioId: m.mec.id, otId: ot, texto: '  Ruido en el eje  ' }))
  assert.equal(m.bd.filas('otNota')[0].texto, 'Ruido en el eje')
  assert.equal(m.bd.filas('otNota')[0].autorId, m.mec.id)
  await assert.rejects(m.conTaller(T, (tx: any) => anadirNota(tx, { tallerId: T, usuarioId: m.mec.id, otId: ot, texto: '   ' })), ErrorTrabajo)
  const n = await m.conTaller(T, (tx: any) => anadirFotos(tx, almacenSoloMetadatos, { tallerId: T, usuarioId: m.mec.id, otId: ot, fotos: [foto] }))
  assert.equal(n, 1)
  const f = m.bd.filas('otFoto')[0]
  assert.ok(f.ruta.startsWith(`${T}/ot/${ot}/`), f.ruta)
  assert.equal(f.huellaSha256.length, 64)
  // OT en recepción (aún no se trabaja): no admite notas.
  const r2 = await recibir(m, { matricula: '9999ZZZ' })
  await assert.rejects(m.conTaller(T, (tx: any) => anadirNota(tx, { tallerId: T, usuarioId: m.mec.id, otId: r2.otId, texto: 'x' })), /ya no admite/)
})

test('la propuesta del mecánico NO lleva precios y queda «pendiente de envío»; sin cliente no se manda nada', async () => {
  const m = montar()
  const ot = await otEnCurso(m)
  const id = await proponer(m, ot)
  const p = m.bd.filas('otPropuesta')[0]
  assert.equal(p.estado, 'pendiente_envio')
  assert.equal(p.presupuestoId, undefined)
  assert.ok(!('precio' in m.bd.filas('otPropuestaLinea')[0]) && !('precioUnitarioCent' in m.bd.filas('otPropuestaLinea')[0]))
  assert.equal(m.bd.filas('presupuesto').filter((x) => x.origen === 'ampliacion').length, 0, 'nada llega al cliente hasta que recepción lo manda')
  assert.equal(m.bd.filas('otFoto').filter((x) => x.propuestaId === id).length, 1)
  await assert.rejects(proponer(m, ot, []).then(() => m.conTaller(T, (tx: any) => proponerAmpliacion(tx, almacenSoloMetadatos, { tallerId: T, usuarioId: m.mec.id, otId: ot, explicacion: '', lineas: [], fotos: [] }))), /al menos una/)
})

test('enviar: crea el presupuesto «ampliacion» hijo, copia fotos, OT → ampliacion_pendiente; el token solo se devuelve una vez', async () => {
  const m = montar()
  const ot = await otEnCurso(m)
  const id = await proponer(m, ot)
  const r: any = await enviar(m, id)
  assert.ok(r.ok, JSON.stringify(r))
  const pres = m.bd.filas('presupuesto').find((x) => x.id === r.presupuestoId)
  assert.equal(pres.origen, 'ampliacion')
  assert.equal(pres.estado, 'enviado')
  assert.equal(pres.presupuestoPadreId, m.bd.filas('ordenTrabajo').find((o) => o.id === ot).presupuestoId)
  assert.notEqual(pres.tokenHash, r.token)
  assert.equal(Number(pres.baseCent), 4550, 'precio de recepción × cantidad, sin IVA')
  assert.equal(m.bd.filas('ampliacionFoto').length, 1)
  assert.equal(m.bd.filas('otPropuesta')[0].estado, 'enviada')
  assert.equal(estado(m, ot), 'ampliacion_pendiente')
  // no se envía dos veces
  assert.equal(((await enviar(m, id)) as any).ok, false)
  // sin precio de una línea → no se envía
  const id2 = await proponer(m, ot, [])
  const sinPrecio: any = await m.conTaller(T, (tx: any) => enviarPropuesta(tx, { tallerId: T, propuestaId: id2, precios: [], config: m.config, ahora: AHORA }))
  assert.equal(sinPrecio.ok, false)
})

test('con una ampliación sin responder no se termina la OT', async () => {
  const m = montar()
  const ot = await otEnCurso(m)
  const id = await proponer(m, ot)
  await enviar(m, id)
  // vuelve a en_curso a la fuerza para intentar terminar con la ampliación pendiente
  m.bd.filas('ordenTrabajo') // (solo lectura)
  await m.conTaller(T, (tx: any) => tx.ordenTrabajo.update({ where: { id: ot }, data: { estado: 'en_curso' } }))
  await m.conTaller(T, (tx: any) => cerrarParteMecanico(tx, { tallerId: T, mecanicoId: m.mec.id, ahora: AHORA }))
  const r: any = await m.conTaller(T, (tx: any) => cambiarEstadoOt(tx, { tallerId: T, otId: ot, hacia: 'terminado', ahora: AHORA }))
  assert.equal(r.ok, false)
  assert.match(r.motivo, /ampliaciones/)
})

test('ampliación aceptada: sus líneas entran en la OT (origen «ampliacion») y la OT vuelve a en_curso', async () => {
  const m = montar()
  const ot = await otEnCurso(m)
  const antes = m.bd.filas('otLinea').length
  const id = await proponer(m, ot)
  const r: any = await enviar(m, id)
  const a: any = await m.conTaller(T, (tx: any) => aceptarPorToken(tx, { tallerId: T, token: r.token, ip: null, userAgent: null, ahora: AHORA, casillas: { asegura: false, taller: false } }, deps))
  assert.ok(a.ok, JSON.stringify(a))
  const nuevas = m.bd.filas('otLinea').slice(antes)
  assert.equal(nuevas.length, 1)
  assert.equal(nuevas[0].origen, 'ampliacion')
  assert.equal(nuevas[0].descripcion, 'Pastillas delanteras')
  assert.ok(nuevas[0].aceptadaEn)
  assert.equal(estado(m, ot), 'en_curso')
  assert.equal(m.bd.filas('presupuesto').find((x) => x.id === r.presupuestoId).estado, 'aceptado')
})

test('ampliación rechazada: la línea NO entra en la OT y la OT vuelve a en_curso', async () => {
  const m = montar()
  const ot = await otEnCurso(m)
  const antes = m.bd.filas('otLinea').length
  const r: any = await enviar(m, await proponer(m, ot))
  const x: any = await m.conTaller(T, (tx: any) => rechazarPorToken(tx, { tallerId: T, token: r.token, ahora: AHORA }))
  assert.ok(x.ok)
  assert.equal(m.bd.filas('otLinea').length, antes)
  assert.equal(estado(m, ot), 'en_curso')
})

test('descartar una propuesta pendiente; una ya enviada no se descarta', async () => {
  const m = montar()
  const ot = await otEnCurso(m)
  const id = await proponer(m, ot)
  await m.conTaller(T, (tx: any) => descartarPropuesta(tx, { tallerId: T, propuestaId: id }))
  assert.equal(m.bd.filas('otPropuesta')[0].estado, 'descartada')
  assert.equal(((await enviar(m, id)) as any).ok, false)
  const id2 = await proponer(m, ot, [])
  await enviar(m, id2)
  await assert.rejects(m.conTaller(T, (tx: any) => descartarPropuesta(tx, { tallerId: T, propuestaId: id2 })), ErrorTrabajo)
})

// ── Presupuesto en borrador: se rehace; enviado/aceptado, no ──
test('borrador: se sustituye con la config vigente y conserva id y OT; enviado o aceptado NO se toca', async () => {
  const m = montar()
  const r = await recibir(m)
  const c: any = await m.conTaller(T, (tx: any) => crearPresupuestoDesdeOt(tx, { tallerId: T, otId: r.otId, tipoVehiculo: 'turismo', lineas: [{ tipo: 'paquete', paqueteCodigo: 'revision' }], ahora: AHORA }, m.config))
  assert.equal(Number(m.bd.filas('presupuesto')[0].baseCent), 6000)
  m.config.precioHoraCent = 9000
  const rr: any = await m.conTaller(T, (tx: any) => reemplazarBorrador(tx, { tallerId: T, presupuestoId: c.presupuestoId, tipoVehiculo: 'turismo', lineas: [{ tipo: 'paquete', paqueteCodigo: 'revision' }, { tipo: 'pieza', descripcion: 'Filtro', cantidad: 1, precioUnitarioCent: 1000 }], ahora: AHORA }, m.config))
  assert.ok(rr.ok, JSON.stringify(rr))
  assert.equal(rr.presupuestoId, c.presupuestoId)
  assert.equal(m.bd.filas('presupuesto').length, 1)
  assert.equal(Number(m.bd.filas('presupuesto')[0].baseCent), 10000)
  assert.equal(m.bd.filas('presupuestoLinea').length, 2, 'las líneas viejas se borran, no se acumulan')
  assert.equal(m.bd.filas('ordenTrabajo').find((o) => o.id === r.otId).presupuestoId, c.presupuestoId)
  // enviado → no
  await m.conTaller(T, (tx: any) => generarEnlace(tx, { tallerId: T, presupuestoId: c.presupuestoId, ahora: AHORA, config: m.config }))
  const no: any = await m.conTaller(T, (tx: any) => reemplazarBorrador(tx, { tallerId: T, presupuestoId: c.presupuestoId, tipoVehiculo: 'turismo', lineas: [{ tipo: 'paquete', paqueteCodigo: 'revision' }], ahora: AHORA }, m.config))
  assert.equal(no.ok, false)
  assert.match(no.errores[0], /solo se rehace un borrador/)
  assert.equal(m.bd.filas('presupuestoLinea').length, 2)
})

test('borrador con líneas inválidas: error del módulo y NADA se borra', async () => {
  const m = montar()
  const r = await recibir(m)
  const c: any = await m.conTaller(T, (tx: any) => crearPresupuestoDesdeOt(tx, { tallerId: T, otId: r.otId, tipoVehiculo: 'turismo', lineas: [{ tipo: 'paquete', paqueteCodigo: 'revision' }], ahora: AHORA }, m.config))
  const mal: any = await m.conTaller(T, (tx: any) => reemplazarBorrador(tx, { tallerId: T, presupuestoId: c.presupuestoId, tipoVehiculo: 'turismo', lineas: [{ tipo: 'paquete', paqueteCodigo: 'no-existe' }], ahora: AHORA }, m.config))
  assert.equal(mal.ok, false)
  assert.equal(m.bd.filas('presupuestoLinea').length, 1)
})
