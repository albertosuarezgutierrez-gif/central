/* eslint-disable @typescript-eslint/no-explicit-any */
// Almacén, pedidos y albaranes (F2) sobre la BD falsa con RLS emulado.
// Cepos vistos FALLAR (05/11/2026), uno por aserción, y restaurados:
// (1) en registrarAlbaran quitar el `costeMedioPonderado` (poner `p.coste`) → rojo «coste medio ponderado».
// (2) en salirStockOt quitar el `movimientoDeCierre` (apuntar siempre `necesario`) → rojo «cerrar la OT dos veces».
// (3) en apuntarMovimiento quitar `m.articulo.stock = r.stockNuevo` → rojo «dos líneas del mismo artículo» (la segunda lee el stock viejo).
// (4) en salirStockOt no devolver `avisos` (devolver []) → rojo «stock negativo nunca en silencio».
// (5) en anadirRecambioDesdeCatalogo guardar `costeCent: null` en la línea → rojo «margen con coste real».
// (6) en registrarAlbaran quitar la comprobación de albarán duplicado → rojo «mismo albarán dos veces».
// (7) en registrarAlbaran quitar `estadoTrasRecepcion` (dejar 'recibido') → rojo «pedido parcial».
// (8) en marcarPedidoEnviado quitar `p.estado !== 'borrador'` → rojo «solo un borrador se marca enviado».
// (9) en lib/stock.ts añadir una llamada `tx.movimientoStock.update(` → rojo «movimientos inmutables» (fuente).
// (10) en registrarAlbaran buscar el proveedor sin `tallerId` en el where → rojo «toda lectura lleva tallerId» (el RLS del fake ya aísla; esto vigila el fuente).
// (11) en registrarAlbaran volver a leer el artículo por línea (sin caché) → rojo «dos líneas del mismo artículo».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cambiarEstadoOt } from '../lib/ordenes.ts'
import { margenOt } from '../lib/panel-dueno.ts'
import {
  ajustarInventario, anadirRecambioDesdeCatalogo, cargarAvisosStock, crearArticulo, editarArticulo, salirStockOt, type DatosArticulo,
} from '../lib/stock.ts'
import { cancelarPedido, crearPedido, marcarPedidoEnviado, registrarAlbaran, textoPedido, valorarAlbaran } from '../lib/pedidos.ts'
import { crearConTaller } from '../lib/rls.ts'
import { AHORA, montar, T, T2 } from './_escenario.ts'

function mundo() {
  const m = montar()
  m.bd.sembrar('tipoIva', { tallerId: T, codigo: 'g', nombre: 'General', puntosBasicos: 2100 })
  m.bd.sembrar('tipoIva', { tallerId: T2, codigo: 'g', nombre: 'General', puntosBasicos: 2100 })
  const prov = m.bd.sembrar('proveedor', { tallerId: T, nombre: 'Recambios Sur' })
  const prov2 = m.bd.sembrar('proveedor', { tallerId: T2, nombre: 'Otro taller proveedor' })
  return { ...m, prov, prov2 }
}
const datosArt = (o: Partial<DatosArticulo> = {}): DatosArticulo => ({
  referencia: null, referenciaFabricante: null, descripcion: 'Filtro de aceite', marca: 'Mann', unidad: 'ud', minimo: null, pvpCent: 1500,
  margenPuntosBasicos: null, ivaCodigo: 'g', mlPorEnvase: null, ...o,
})
const art = async (m: any, o: Partial<DatosArticulo> = {}, tallerId = T) =>
  (await m.conTaller(tallerId, (tx: any) => crearArticulo(tx, { tallerId, datos: datosArt(o) }))).articuloId as string
const articulo = (m: any, id: string) => m.bd.filas('articulo').find((a: any) => a.id === id)
const movs = (m: any, id?: string) => m.bd.filas('movimientoStock').filter((x: any) => !id || x.articuloId === id)
const albaran = (m: any, o: any, tallerId = T) => m.conTaller(tallerId, (tx: any) => registrarAlbaran(tx, { tallerId, usuarioId: m.dueno.id, fecha: '2026-11-04', ...o }))

let nOt = 0
/** OT en curso con recepción firmada (lista para cerrarse). */
function ordenEnCurso(m: any, estado = 'en_curso', tallerId = T) {
  const veh = m.bd.sembrar('vehiculo', { tallerId, matricula: `${3000 + nOt} XYZ` })
  const rec = m.bd.sembrar('recepcion', { tallerId, vehiculoId: veh.id, clienteId: null, firmadoEn: AHORA })
  return m.bd.sembrar('ordenTrabajo', { tallerId, numero: ++nOt, recepcionId: rec.id, vehiculoId: veh.id, estado })
}
const cerrar = (m: any, otId: string) => m.conTaller(T, (tx: any) => cambiarEstadoOt(tx, { tallerId: T, otId, hacia: 'terminado', ahora: AHORA, usuarioId: m.dueno.id }))
const reabrir = (m: any, otId: string) => m.conTaller(T, (tx: any) => cambiarEstadoOt(tx, { tallerId: T, otId, hacia: 'en_curso', ahora: AHORA, usuarioId: m.dueno.id }))
const recambio = (m: any, otId: string, articuloId: string, cantidad: number) =>
  m.conTaller(T, (tx: any) => anadirRecambioDesdeCatalogo(tx, { tallerId: T, otId, articuloId, cantidad, aceptadaEn: AHORA }))

test('coste medio ponderado con albaranes sucesivos; el stock sube; cada entrada es un movimiento', async () => {
  const m = mundo()
  const id = await art(m)
  assert.equal(articulo(m, id).stock, null, 'un artículo nuevo NO se lleva a stock (null ≠ 0)')
  await m.conTaller(T, (tx: any) => ajustarInventario(tx, { tallerId: T, usuarioId: m.dueno.id, articuloId: id, contado: 0, nota: 'alta' }))
  assert.equal(articulo(m, id).stock, 0)
  assert.equal((await albaran(m, { proveedorId: m.prov.id, numeroProveedor: 'A-1', lineas: [{ articuloId: id, cantidad: 10, costeUnitarioCent: 100 }] })).ok, true)
  assert.equal(Number(articulo(m, id).costeMedioCent), 100)
  await albaran(m, { proveedorId: m.prov.id, numeroProveedor: 'A-2', lineas: [{ articuloId: id, cantidad: 10, costeUnitarioCent: 200 }] })
  assert.deepEqual([articulo(m, id).stock, Number(articulo(m, id).costeMedioCent)], [20, 150])
  await albaran(m, { proveedorId: m.prov.id, numeroProveedor: 'A-3', lineas: [{ articuloId: id, cantidad: 5, costeUnitarioCent: 250 }] })
  assert.deepEqual([articulo(m, id).stock, Number(articulo(m, id).costeMedioCent)], [25, 170])
  const es = movs(m, id).filter((x: any) => x.motivo === 'entrada_albaran')
  assert.deepEqual(es.map((x: any) => [x.cantidad, x.stockResultante]), [[10, 10], [10, 20], [5, 25]])
})

test('dos líneas del mismo artículo en un albarán suman el stock y ponderan el coste en cadena', async () => {
  const m = mundo()
  const id = await art(m)
  await m.conTaller(T, (tx: any) => ajustarInventario(tx, { tallerId: T, usuarioId: null, articuloId: id, contado: 0, nota: 'x' }))
  await albaran(m, { proveedorId: m.prov.id, numeroProveedor: 'DL-1', lineas: [{ articuloId: id, cantidad: 3, costeUnitarioCent: 100 }, { articuloId: id, cantidad: 1, costeUnitarioCent: 200 }] })
  assert.deepEqual([articulo(m, id).stock, Number(articulo(m, id).costeMedioCent)], [4, 125])
  assert.deepEqual(movs(m, id).map((x: any) => x.stockResultante), [3, 4])
})

test('granel: litros con decimales (milésimas), coste por litro y consumo en la OT', async () => {
  const m = mundo()
  const id = await art(m, { descripcion: 'Aceite 5W30', unidad: 'ml', pvpCent: 900, mlPorEnvase: 5000 })
  const r = await m.conTaller(T, (tx: any) => ajustarInventario(tx, { tallerId: T, usuarioId: m.dueno.id, articuloId: id, contado: 2500, nota: 'recuento inicial' }))
  assert.deepEqual([r.ok, articulo(m, id).stock], [true, 2500])
  await albaran(m, { proveedorId: m.prov.id, numeroProveedor: 'G-1', lineas: [{ articuloId: id, cantidad: 7500, costeUnitarioCent: 400 }] })
  assert.deepEqual([articulo(m, id).stock, Number(articulo(m, id).costeMedioCent)], [10000, 400])
  const ot = ordenEnCurso(m)
  const l = await recambio(m, ot.id, id, 1250) // 1,25 L
  assert.equal(l.ok, true)
  const linea = m.bd.filas('otLinea')[0]
  assert.deepEqual([linea.tipo, linea.unidad, linea.cantidad, Number(linea.baseCent), Number(linea.costeCent)], ['granel', 'ml', 1250, 1125, 500])
  await cerrar(m, ot.id)
  assert.equal(articulo(m, id).stock, 8750, '10 L − 1,25 L')
  assert.equal(movs(m, id).at(-1).cantidad, -1250)
})

test('cerrar la OT dos veces no descuenta dos veces; reabrir y quitar/añadir apunta solo la diferencia', async () => {
  const m = mundo()
  const id = await art(m)
  await m.conTaller(T, (tx: any) => ajustarInventario(tx, { tallerId: T, usuarioId: null, articuloId: id, contado: 20, nota: 'inicio' }))
  const ot = ordenEnCurso(m)
  await recambio(m, ot.id, id, 5)
  assert.equal((await cerrar(m, ot.id)).ok, true)
  assert.equal(articulo(m, id).stock, 15)
  await m.conTaller(T, (tx: any) => salirStockOt(tx, { tallerId: T, otId: ot.id, usuarioId: null })) // repetido
  assert.equal(articulo(m, id).stock, 15, 'idempotente')
  assert.equal(movs(m, id).filter((x: any) => x.otId === ot.id).length, 1)
  // reabrir, añadir 2 más y cerrar: sale solo la diferencia
  assert.equal((await reabrir(m, ot.id)).ok, true)
  await recambio(m, ot.id, id, 2)
  await cerrar(m, ot.id)
  assert.deepEqual([articulo(m, id).stock, movs(m, id).at(-1).motivo], [13, 'consumo_ot_extra'])
  // reabrir y quitar una línea (la de 5): se devuelve
  await reabrir(m, ot.id)
  const l5 = m.bd.filas('otLinea').find((x: any) => x.cantidad === 5)
  await m.conTaller(T, (tx: any) => tx.otLinea.update({ where: { id: l5.id }, data: { aceptadaEn: null } })) // deja de ser material aceptado
  await cerrar(m, ot.id)
  assert.deepEqual([articulo(m, id).stock, movs(m, id).at(-1).motivo], [18, 'devolucion_ot'])
})

test('stock negativo NUNCA en silencio: aviso al cerrar, en el inicio del dueño y en el recambio', async () => {
  const m = mundo()
  const id = await art(m, { minimo: 2 })
  await m.conTaller(T, (tx: any) => ajustarInventario(tx, { tallerId: T, usuarioId: null, articuloId: id, contado: 3, nota: 'inicio' }))
  const ot = ordenEnCurso(m)
  const l = await recambio(m, ot.id, id, 5)
  assert.match(l.avisoStock, /Stock insuficiente/, 'el aviso salta al añadir el recambio')
  const r: any = await cerrar(m, ot.id)
  assert.equal(r.ok, true, 'el coche se cierra igualmente')
  assert.deepEqual(r.avisosStock.map((a: any) => [a.articuloId, a.stockNuevo]), [[id, -2]])
  assert.equal(articulo(m, id).stock, -2)
  assert.equal(movs(m, id).at(-1).stockResultante, -2, 'el movimiento deja constancia del negativo')
  const av = await m.conTaller(T, (tx: any) => cargarAvisosStock(tx, T))
  assert.deepEqual(av.map((a: any) => [a.articuloId, a.tipo]), [[id, 'negativo']])
})

test('el artículo que no se lleva a stock no genera movimientos ni avisos', async () => {
  const m = mundo()
  const id = await art(m, { minimo: 5 })
  const ot = ordenEnCurso(m)
  await recambio(m, ot.id, id, 3)
  const r: any = await cerrar(m, ot.id)
  assert.deepEqual([r.ok, r.avisosStock, movs(m).length], [true, undefined, 0])
  assert.deepEqual(await m.conTaller(T, (tx: any) => cargarAvisosStock(tx, T)), [])
})

test('avisos de stock mínimo: agotado y bajo mínimo en el inicio del dueño', async () => {
  const m = mundo()
  const bajo = await art(m, { descripcion: 'Pastillas', minimo: 4 })
  const ok = await art(m, { descripcion: 'Bujías', minimo: 2 })
  await m.conTaller(T, async (tx: any) => {
    await ajustarInventario(tx, { tallerId: T, usuarioId: null, articuloId: bajo, contado: 3, nota: 'inicio' })
    await ajustarInventario(tx, { tallerId: T, usuarioId: null, articuloId: ok, contado: 9, nota: 'inicio' })
  })
  const av = await m.conTaller(T, (tx: any) => cargarAvisosStock(tx, T))
  assert.deepEqual(av.map((a: any) => [a.articuloId, a.tipo]), [[bajo, 'bajo_minimo']])
})

test('margen con coste REAL: la línea guarda el coste medio de ese momento y el panel calcula el margen', async () => {
  const m = mundo()
  const id = await art(m, { pvpCent: 1500 })
  await m.conTaller(T, (tx: any) => ajustarInventario(tx, { tallerId: T, usuarioId: null, articuloId: id, contado: 0, nota: 'inicio' }))
  await albaran(m, { proveedorId: m.prov.id, numeroProveedor: 'M-1', lineas: [{ articuloId: id, cantidad: 10, costeUnitarioCent: 900 }] })
  const ot = ordenEnCurso(m)
  await recambio(m, ot.id, id, 2)
  // el coste medio cambia DESPUÉS: la línea conserva el de su momento
  await albaran(m, { proveedorId: m.prov.id, numeroProveedor: 'M-2', lineas: [{ articuloId: id, cantidad: 10, costeUnitarioCent: 1100 }] })
  const linea = m.bd.filas('otLinea')[0]
  assert.deepEqual([Number(linea.baseCent), Number(linea.costeCent), linea.articuloId, linea.tipo], [3000, 1800, id, 'pieza'])
  assert.equal(Number(articulo(m, id).costeMedioCent), 1000)
  const mg: any = margenOt(Number(linea.baseCent), [{ tipo: linea.tipo, costeCent: linea.costeCent }])
  assert.deepEqual([mg.estado, mg.costeCent, mg.margenCent], ['ok', 1800, 1200])
  // sin coste conocido: la línea guarda NULL y el panel dice «sin datos» (nunca margen = ventas)
  const sinCoste = await art(m, { descripcion: 'Sin coste', pvpCent: 500 })
  const ot2 = ordenEnCurso(m)
  await recambio(m, ot2.id, sinCoste, 1)
  const l2 = m.bd.filas('otLinea').find((x: any) => x.otId === ot2.id)
  assert.equal(l2.costeCent, null)
  assert.equal((margenOt(500, [{ tipo: l2.tipo, costeCent: l2.costeCent }]) as any).estado, 'sin_datos')
})

test('recambio: precio por margen por defecto si no hay PVP; sin precio ni IVA se rechaza; la OT cerrada no admite recambios', async () => {
  const m = mundo()
  const a = await art(m, { pvpCent: null, margenPuntosBasicos: 3500 })
  await m.conTaller(T, (tx: any) => ajustarInventario(tx, { tallerId: T, usuarioId: null, articuloId: a, contado: 0, nota: 'x' }))
  await albaran(m, { proveedorId: m.prov.id, numeroProveedor: 'P-1', lineas: [{ articuloId: a, cantidad: 4, costeUnitarioCent: 1000 }] })
  const ot = ordenEnCurso(m)
  assert.equal((await recambio(m, ot.id, a, 1)).ok, true)
  assert.equal(Number(m.bd.filas('otLinea')[0].baseCent), 1350, 'coste 10,00 € + 35 %')
  const sinPrecio = await art(m, { descripcion: 'Sin precio', pvpCent: null })
  assert.match((await recambio(m, ot.id, sinPrecio, 1) as any).motivo, /PVP/)
  const sinIva = await art(m, { descripcion: 'Sin IVA', ivaCodigo: null })
  assert.match((await recambio(m, ot.id, sinIva, 1) as any).motivo, /IVA/)
  const cerrada = ordenEnCurso(m, 'terminado')
  assert.match((await recambio(m, cerrada.id, a, 1) as any).motivo, /ya no admite/)
  assert.equal((await recambio(m, ot.id, a, 0) as any).ok, false)
})

test('pedido parcial: borrador → enviado (a mano) → parcial → recibido, con lo pendiente en cada paso', async () => {
  const m = mundo()
  const a = await art(m, { descripcion: 'Disco', referenciaFabricante: 'D-1' })
  const b = await art(m, { descripcion: 'Pastilla' })
  const ot = ordenEnCurso(m)
  const p: any = await m.conTaller(T, (tx: any) => crearPedido(tx, { tallerId: T, proveedorId: m.prov.id, otId: ot.id, lineas: [{ articuloId: a, cantidad: 10 }, { articuloId: b, cantidad: 4 }] }))
  assert.equal(p.ok, true)
  const ped = () => m.bd.filas('pedido')[0]
  assert.deepEqual([ped().estado, ped().enviadoPor, ped().matricula], ['borrador', undefined, m.bd.filas('vehiculo')[0].matricula], 'la matrícula sale de la OT')
  // un borrador no se recibe
  assert.match((await albaran(m, { proveedorId: m.prov.id, pedidoId: p.pedidoId, numeroProveedor: 'X', lineas: [{ articuloId: a, cantidad: 1 }] }) as any).motivo, /solo se recibe lo enviado/)
  assert.equal((await m.conTaller(T, (tx: any) => marcarPedidoEnviado(tx, { tallerId: T, pedidoId: p.pedidoId, usuarioId: m.dueno.id, ahora: AHORA }))).ok, true)
  assert.deepEqual([ped().estado, ped().enviadoPor, ped().enviadoEn], ['enviado', m.dueno.id, AHORA])
  const pl = m.bd.filas('pedidoLinea')
  const l1 = pl.find((x: any) => x.articuloId === a), l2 = pl.find((x: any) => x.articuloId === b)
  const r1: any = await albaran(m, { proveedorId: m.prov.id, pedidoId: p.pedidoId, numeroProveedor: 'ALB-1', lineas: [{ pedidoLineaId: l1.id, cantidad: 6, costeUnitarioCent: 500 }] })
  assert.equal(r1.ok, true)
  assert.deepEqual([ped().estado, m.bd.filas('pedidoLinea').find((x: any) => x.id === l1.id).cantidadRecibida], ['parcial', 6])
  const r2: any = await albaran(m, { proveedorId: m.prov.id, pedidoId: p.pedidoId, numeroProveedor: 'ALB-2', lineas: [{ pedidoLineaId: l1.id, cantidad: 4 }, { pedidoLineaId: l2.id, cantidad: 3 }] })
  assert.equal(ped().estado, 'parcial', 'falta 1 pastilla')
  assert.ok(r2.avisos.some((x: any) => x.tipo === 'sin_valorar'))
  await albaran(m, { proveedorId: m.prov.id, pedidoId: p.pedidoId, numeroProveedor: 'ALB-3', lineas: [{ pedidoLineaId: l2.id, cantidad: 1 }] })
  assert.equal(ped().estado, 'recibido')
  assert.ok(ped().recibidoEn)
})

test('solo un borrador se marca enviado y un recibido ya no se cancela; el pedido nunca sale solo (sin envío en el código)', async () => {
  const m = mundo()
  const a = await art(m)
  const p: any = await m.conTaller(T, (tx: any) => crearPedido(tx, { tallerId: T, proveedorId: m.prov.id, lineas: [{ articuloId: a, cantidad: 2 }] }))
  const marcar = () => m.conTaller(T, (tx: any) => marcarPedidoEnviado(tx, { tallerId: T, pedidoId: p.pedidoId, usuarioId: m.dueno.id, ahora: AHORA }))
  assert.equal((await marcar()).ok, true)
  assert.match(((await marcar()) as any).motivo, /ya está «enviado»/)
  assert.equal((await m.conTaller(T, (tx: any) => crearPedido(tx, { tallerId: T, proveedorId: m.prov.id, lineas: [] }))).ok, false)
  const c: any = await m.conTaller(T, (tx: any) => crearPedido(tx, { tallerId: T, proveedorId: m.prov.id, lineas: [{ descripcion: 'Texto libre', cantidad: 1 }] }))
  assert.equal((await m.conTaller(T, (tx: any) => cancelarPedido(tx, { tallerId: T, pedidoId: c.pedidoId, ahora: AHORA }))).ok, true)
  const lib = readFileSync(join(import.meta.dirname, '..', 'lib', 'pedidos.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '')
  assert.equal(/\bfetch\(|resend|nodemailer|sendMail|enviarCorreo|core-email|mailto:/i.test(lib), false, 'lib/pedidos.ts no envía nada a nadie')
  const ac = readFileSync(join(import.meta.dirname, '..', 'app', 'pedidos', 'acciones.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '')
  assert.equal(/\bfetch\(|resend|nodemailer|core-email|mailto:/i.test(ac), false)
  assert.match(ac, /conPermiso\('pedidos_enviar'/, 'marcar enviado exige la capacidad del dueño')
})

test('texto del pedido para imprimir/copiar: litros legibles, referencia y matrícula', () => {
  const t = textoPedido({ id: 'abcdef12-0000-4000-8000-000000000001', matricula: '1234 BCD', notas: null }, { nombre: 'Recambios Sur' }, { nombreComercial: 'Taller G2' },
    [{ descripcion: 'Aceite 5W30', referencia: 'A5', cantidad: 5000, unidad: 'ml' }, { descripcion: 'Filtro', referencia: null, cantidad: 2, unidad: 'ud' }], new Date('2026-11-04T10:00:00Z'))
  assert.match(t, /PEDIDO ABCDEF12 · Taller G2 → Recambios Sur/)
  assert.match(t, /Fecha: 04\/11\/2026 · Vehículo: 1234 BCD/)
  assert.match(t, /- 5 L · Aceite 5W30 \(ref\. A5\)/)
  assert.match(t, /- 2 ud · Filtro/)
})

test('el mismo albarán no entra dos veces (ni sube el stock dos veces) y un albarán sin líneas o sin número se rechaza', async () => {
  const m = mundo()
  const id = await art(m)
  await m.conTaller(T, (tx: any) => ajustarInventario(tx, { tallerId: T, usuarioId: null, articuloId: id, contado: 0, nota: 'x' }))
  const e = { proveedorId: m.prov.id, numeroProveedor: 'DUP-1', lineas: [{ articuloId: id, cantidad: 5, costeUnitarioCent: 100 }] }
  assert.equal((await albaran(m, e)).ok, true)
  assert.match(((await albaran(m, e)) as any).motivo, /ya está registrado/)
  assert.equal(articulo(m, id).stock, 5)
  assert.equal((await albaran(m, { ...e, numeroProveedor: ' ' })).ok, false)
  assert.equal((await albaran(m, { ...e, numeroProveedor: 'Z', lineas: [] })).ok, false)
  assert.equal((await albaran(m, { ...e, numeroProveedor: 'Z', fecha: 'ayer' })).ok, false)
})

test('albarán sin precio: el coste medio no cambia; valorarlo con la factura ajusta el coste y encola la compra una sola vez', async () => {
  const m = mundo()
  const id = await art(m)
  await m.conTaller(T, (tx: any) => ajustarInventario(tx, { tallerId: T, usuarioId: null, articuloId: id, contado: 0, nota: 'x' }))
  await albaran(m, { proveedorId: m.prov.id, numeroProveedor: 'V-1', lineas: [{ articuloId: id, cantidad: 10, costeUnitarioCent: 100 }] })
  await albaran(m, { proveedorId: m.prov.id, numeroProveedor: 'V-2', lineas: [{ articuloId: id, cantidad: 4 }] }) // sin precio
  assert.deepEqual([articulo(m, id).stock, Number(articulo(m, id).costeMedioCent)], [14, 100], 'sin precio: sube el stock, el coste no se inventa')
  const alb = m.bd.filas('albaran').find((a: any) => a.numeroProveedor === 'V-2')
  const lin = m.bd.filas('albaranLinea').find((l: any) => l.albaranId === alb.id)
  const val = (costes: any[]) => m.conTaller(T, (tx: any) => valorarAlbaran(tx, { tallerId: T, albaranId: alb.id, facturaNumero: 'FP-77', facturaFecha: '2026-11-03', costes, ahora: AHORA }))
  assert.match(((await val([])) as any).motivo, /Falta el precio/)
  assert.equal(m.bd.filas('hechoPendiente').length, 0, 'nada se encola si no se pudo valorar')
  assert.equal((await val([{ lineaId: lin.id, costeUnitarioCent: 200 }])).ok, true)
  // 10 a 100 y 4 a 200 → (10·100+4·200)/14 = 128,57 → 129 (aún queda todo el stock)
  assert.equal(Number(articulo(m, id).costeMedioCent), 129)
  assert.equal(m.bd.filas('albaran').find((a: any) => a.id === alb.id).estado, 'valorado')
  const hs = m.bd.filas('hechoPendiente')
  assert.equal(hs.length, 1)
  assert.deepEqual([hs[0].tipo, hs[0].estado, hs[0].ref, hs[0].facturaId], ['compra', 'pendiente', `albaran:${alb.id}`, null])
  assert.deepEqual(hs[0].hecho.desglose, [{ base: 800, tipoIva: 21, cuota: 168 }])
  assert.deepEqual([hs[0].hecho.documento, hs[0].hecho.fecha], ['FP-77', '2026-11-03'])
  assert.match(((await val([{ lineaId: lin.id, costeUnitarioCent: 300 }])) as any).motivo, /ya está valorado/)
  assert.equal(m.bd.filas('hechoPendiente').length, 1, 'idempotente')
})

test('compra sin IVA en alguna línea: queda «no_soportado» con motivo, no se inventa el tipo', async () => {
  const m = mundo()
  const id = await art(m, { ivaCodigo: null })
  await m.conTaller(T, (tx: any) => ajustarInventario(tx, { tallerId: T, usuarioId: null, articuloId: id, contado: 0, nota: 'x' }))
  await albaran(m, { proveedorId: m.prov.id, numeroProveedor: 'N-1', lineas: [{ articuloId: id, cantidad: 2, costeUnitarioCent: 100 }] })
  const alb = m.bd.filas('albaran')[0]
  const r = await m.conTaller(T, (tx: any) => valorarAlbaran(tx, { tallerId: T, albaranId: alb.id, facturaNumero: 'F1', facturaFecha: '2026-11-03', costes: [], ahora: AHORA }))
  assert.equal(r.ok, true)
  const h = m.bd.filas('hechoPendiente')[0]
  assert.deepEqual([h.tipo, h.estado], ['no_soportado', 'no_soportado'])
  assert.match(h.hecho.motivo, /sin tipo de IVA/)
})

test('movimientos inmutables: ninguna operación del almacén modifica ni borra un movimiento (en ejecución y en el fuente)', async () => {
  const m = mundo()
  // Cliente envuelto: cualquier update/delete sobre movimientoStock lanza (como el trigger solo_insertar de 0011).
  const envuelto = {
    async $transaction<R>(fn: (tx: any) => Promise<R>): Promise<R> {
      return m.bd.cliente.$transaction((tx: any) => fn(new Proxy(tx, {
        get(t, prop: string) {
          if (prop !== 'movimientoStock') return t[prop]
          return new Proxy(t.movimientoStock, { get(d, op: string) { if (['update', 'updateMany', 'upsert', 'delete', 'deleteMany'].includes(op)) throw new Error(`movimientos_stock es solo-añadir (${op})`); return d[op] } })
        },
      })))
    },
  }
  const con = crearConTaller(envuelto as any)
  const id = await art(m)
  const ot = ordenEnCurso(m)
  await con(T, async (tx: any) => {
    await ajustarInventario(tx, { tallerId: T, usuarioId: null, articuloId: id, contado: 10, nota: 'inicio' })
    await registrarAlbaran(tx, { tallerId: T, usuarioId: null, proveedorId: m.prov.id, numeroProveedor: 'I-1', fecha: '2026-11-04', lineas: [{ articuloId: id, cantidad: 5, costeUnitarioCent: 100 }] })
    await anadirRecambioDesdeCatalogo(tx, { tallerId: T, otId: ot.id, articuloId: id, cantidad: 3, aceptadaEn: AHORA })
    await salirStockOt(tx, { tallerId: T, otId: ot.id, usuarioId: null })
    await salirStockOt(tx, { tallerId: T, otId: ot.id, usuarioId: null })
  })
  assert.equal(movs(m, id).length, 3)
  // y la prueba negativa: el envoltorio de verdad lanza
  await assert.rejects(con(T, (tx: any) => tx.movimientoStock.update({ where: { id: movs(m)[0].id }, data: { cantidad: 99 } })), /solo-añadir/)
  // Fuente: ningún módulo del taller toca movimientoStock salvo create/findMany.
  const RAIZ = join(import.meta.dirname, '..')
  const ficheros = (d: string): string[] => readdirSync(d).flatMap((f) => {
    const p = join(d, f)
    return statSync(p).isDirectory() ? (f === 'node_modules' || f === '.next' ? [] : ficheros(p)) : /\.(ts|tsx)$/.test(f) ? [p] : []
  })
  const culpables = [...ficheros(join(RAIZ, 'lib')), ...ficheros(join(RAIZ, 'app'))].filter((f) => /movimientoStock\s*\.\s*(update|updateMany|upsert|delete|deleteMany)\b/.test(readFileSync(f, 'utf8')))
  assert.deepEqual(culpables, [])
})

test('aislamiento por taller: un taller no ve ni mueve el almacén, los pedidos ni los albaranes de otro', async () => {
  const m = mundo()
  const idT = await art(m)
  const idT2 = await art(m, { descripcion: 'De T2' }, T2)
  await m.conTaller(T, (tx: any) => ajustarInventario(tx, { tallerId: T, usuarioId: null, articuloId: idT, contado: 5, nota: 'x' }))
  // T2 no ve los artículos de T
  assert.deepEqual(((await m.conTaller(T2, (tx: any) => tx.articulo.findMany({ where: { tallerId: T2 } }))) as any[]).map((a: any) => a.id), [idT2])
  assert.deepEqual(await m.conTaller(T2, (tx: any) => tx.articulo.findMany({ where: { tallerId: T } })), [], 'ni pidiéndolo con el tallerId ajeno')
  // T2 no puede ajustar, editar ni recibir con ids de T
  assert.equal((await m.conTaller(T2, (tx: any) => ajustarInventario(tx, { tallerId: T2, usuarioId: null, articuloId: idT, contado: 99, nota: 'x' }))).ok, false)
  assert.equal((await m.conTaller(T2, (tx: any) => editarArticulo(tx, { tallerId: T2, articuloId: idT, datos: datosArt() }))).ok, false)
  assert.match(((await albaran(m, { proveedorId: m.prov.id, numeroProveedor: 'AJ-1', lineas: [{ articuloId: idT2, cantidad: 1 }] }, T2)) as any).motivo, /Proveedor no encontrado/)
  assert.equal(articulo(m, idT).stock, 5)
  // un albarán de T2 con SU proveedor y un artículo de T no encuentra el artículo
  assert.match(((await albaran(m, { proveedorId: m.prov2.id, numeroProveedor: 'AJ-2', lineas: [{ articuloId: idT, cantidad: 1 }] }, T2)) as any).motivo, /Artículo no encontrado/)
  // el mismo número de albarán y proveedor en otro taller es otro albarán
  await m.conTaller(T, (tx: any) => ajustarInventario(tx, { tallerId: T, usuarioId: null, articuloId: idT, contado: 0, nota: 'x' }))
  assert.equal((await albaran(m, { proveedorId: m.prov.id, numeroProveedor: 'SAME', lineas: [{ articuloId: idT, cantidad: 1, costeUnitarioCent: 1 }] })).ok, true)
  assert.equal((await albaran(m, { proveedorId: m.prov2.id, numeroProveedor: 'SAME', lineas: [{ articuloId: idT2, cantidad: 1, costeUnitarioCent: 1 }] }, T2)).ok, true)
  // pedido de T sobre proveedor de T2: no
  assert.equal((await m.conTaller(T, (tx: any) => crearPedido(tx, { tallerId: T, proveedorId: m.prov2.id, lineas: [{ descripcion: 'x', cantidad: 1 }] }))).ok, false)
  // la salida de stock de una OT de T2 no toca artículos de T
  const ot2 = ordenEnCurso(m, 'en_curso', T2)
  await m.conTaller(T2, (tx: any) => tx.otLinea.create({ data: { tallerId: T2, otId: ot2.id, tipo: 'pieza', descripcion: 'x', cantidad: 4, unidad: 'ud', baseCent: BigInt(1), ivaCodigo: 'g', ivaPuntosBasicos: 2100, cuotaIvaCent: BigInt(0), totalCent: BigInt(1), articuloId: idT, origen: 'manual', aceptadaEn: AHORA } }))
  const s = await m.conTaller(T2, (tx: any) => salirStockOt(tx, { tallerId: T2, otId: ot2.id, usuarioId: null }))
  assert.equal(s.movimientos, 0)
  assert.equal(articulo(m, idT).stock, 1)
})

test('toda lectura de lib/stock.ts y lib/pedidos.ts lleva tallerId en el where (defensa en profundidad además del RLS)', () => {
  for (const f of ['stock.ts', 'pedidos.ts']) {
    const src = readFileSync(join(import.meta.dirname, '..', 'lib', f), 'utf8')
    const lecturas = [...src.matchAll(/\.(?:findFirst|findMany)\(\{\s*where:\s*\{([^}]*)\}/g)]
    assert.ok(lecturas.length >= 8, `${f}: el guardián tiene qué vigilar`)
    for (const l of lecturas) assert.match(l[1], /tallerId/, `${f}: lectura sin tallerId → ${l[0]}`)
  }
})

test('artículos: validaciones (referencia única por taller, unidad inmutable con stock, sin descripción)', async () => {
  const m = mundo()
  const a = await art(m, { referencia: 'R-1' })
  assert.match(((await m.conTaller(T, (tx: any) => crearArticulo(tx, { tallerId: T, datos: datosArt({ referencia: 'R-1' }) }))) as any).motivo, /referencia/)
  assert.equal((await m.conTaller(T2, (tx: any) => crearArticulo(tx, { tallerId: T2, datos: datosArt({ referencia: 'R-1' }) }))).ok, true, 'otra referencia R-1 en OTRO taller sí')
  assert.equal((await m.conTaller(T, (tx: any) => crearArticulo(tx, { tallerId: T, datos: datosArt({ descripcion: '  ' }) }))).ok, false)
  assert.equal((await m.conTaller(T, (tx: any) => crearArticulo(tx, { tallerId: T, datos: datosArt({ unidad: 'kg' }) }))).ok, false)
  await m.conTaller(T, (tx: any) => ajustarInventario(tx, { tallerId: T, usuarioId: null, articuloId: a, contado: 1, nota: 'x' }))
  assert.match(((await m.conTaller(T, (tx: any) => editarArticulo(tx, { tallerId: T, articuloId: a, datos: datosArt({ referencia: 'R-1', unidad: 'ml' }) }))) as any).motivo, /unidad/)
  assert.equal((await m.conTaller(T, (tx: any) => ajustarInventario(tx, { tallerId: T, usuarioId: null, articuloId: a, contado: 3, nota: ' ' }))).ok, false, 'el ajuste exige motivo')
  assert.equal(articulo(m, a).stock, 1)
})
