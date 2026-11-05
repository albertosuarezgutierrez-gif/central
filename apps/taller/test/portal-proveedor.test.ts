/* eslint-disable @typescript-eslint/no-explicit-any */
// Portal del proveedor (0012) sobre la BD falsa con RLS emulado: pedido → enlace → albarán → «Recepción verificada» → factura → case.
// Cepos vistos FALLAR (05/11/2026), uno por aserción, y restaurados:
// (1) en nuevoEnlace guardar `tokenHash: token` → rojo «solo el hash».
// (2) en nuevoEnlace quitar el updateMany que revoca → rojo «un enlace nuevo revoca el anterior».
// (3) en enlaceVigente pasar siempre `proposito: e.proposito` (ignorar el pedido) → rojo «alcance».
// (4) en contabilizarFactura saltarse `puedeContabilizar` → rojo «no contabiliza sin case ni confirmación».
// (5) en casarFactura no llamar a contabilizarFactura cuando cuadra → rojo «case exacto: contabilizada».
// (6) en verificarRecepcion quitar la comprobación de factura en curso → rojo «una sola factura viva».
// (7) en registrarDocumentoProveedor no cerrar el enlace de factura → rojo «la factura cierra su enlace».
// (8) en aceptarRecambio quitar `esPendiente` → rojo «recambio ya aceptado».
// (9) en el middleware quitar '/prov/' → rojo «ruta pública sin sesión».
// (10) en la ruta API registrar `console.error('[prov]', token)` → rojo «el token nunca a un log».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatoTokenValido, hashToken } from '@central/module-portal-proveedor'
import { crearPedido, registrarAlbaran } from '../lib/pedidos.ts'
import { crearArticulo, type DatosArticulo } from '../lib/stock.ts'
import {
  confirmarFactura, confirmarPedidoProveedor, contabilizarFactura, corregirFactura, crearEnlacePedido, enlaceVigente, procesarFactura,
  enlaceLlenoDeDocumentos, registrarDocumentoProveedor, verificarRecepcion, vistaProveedor, MAX_DOCS_POR_ENLACE, type ExtractorFactura,
} from '../lib/portal-proveedor.ts'
import { aceptarRecambio, recambiosPendientes } from '../lib/recambios-pendientes.ts'
import { claveProveedor, LIMITE_ENLACE, resolverProveedorLimitado } from '../lib/limite-enlace.ts'
import type { FilaCodigo, StoreCodigo } from '../lib/limite-codigo.ts'
import { AHORA, montar, T, T2 } from './_escenario.ts'

const RAIZ = join(import.meta.dirname, '..')
const lee = (f: string) => readFileSync(join(RAIZ, f), 'utf8')
const DESPUES = new Date(AHORA.getTime() + 60_000)

const datosArt = (o: Partial<DatosArticulo> = {}): DatosArticulo => ({
  referencia: 'F-01', referenciaFabricante: 'W712/75', descripcion: 'Filtro de aceite', marca: 'Mann', unidad: 'ud', minimo: null, pvpCent: 1500,
  margenPuntosBasicos: null, ivaCodigo: 'g', mlPorEnvase: null, ...o,
})

/** Taller con proveedor (NIF), artículo con IVA, pedido de 4 filtros a 6,50 € y su enlace. */
async function mundo(o: { nif?: string | null } = {}) {
  const m = montar()
  m.bd.sembrar('tipoIva', { tallerId: T, codigo: 'g', nombre: 'General', puntosBasicos: 2100 })
  m.bd.sembrar('configuracion', { tallerId: T, portalEnlaceCaducaDias: 14, portalMaxMb: 4, portalTolPrecioCent: 1, portalTolPrecioPb: 0, portalTolImporteLineaCent: 1, portalTolTotalCent: 2, portalTolCantidadMil: 0 })
  const prov = m.bd.sembrar('proveedor', { tallerId: T, nombre: 'Recambios Sur', ...(o.nif === null ? {} : { nif: o.nif ?? 'B41234567' }) })
  const art = ((await m.conTaller(T, (tx: any) => crearArticulo(tx, { tallerId: T, datos: datosArt() }))) as any).articuloId as string
  const ped = await m.conTaller(T, (tx: any) => crearPedido(tx, { tallerId: T, proveedorId: prov.id, lineas: [{ articuloId: art, cantidad: 4, costeUnitarioCent: 650 }] }))
  assert.ok(ped.ok)
  const pedidoId = (ped as any).pedidoId as string
  const enl = await m.conTaller(T, (tx: any) => crearEnlacePedido(tx, { tallerId: T, usuarioId: m.dueno.id, pedidoId, ahora: AHORA }))
  assert.ok(enl.ok)
  const token = (enl as any).token as string
  const enlaceId = m.bd.filas('enlaceProveedor').find((e: any) => e.tokenHash === hashToken(token)).id as string
  return { m, prov, art, pedidoId, token, enlaceId }
}
const vigente = (m: any, tallerId: string, enlaceId: string, token: string, o: any = {}) =>
  m.conTaller(tallerId, (tx: any) => enlaceVigente(tx, { tallerId, enlaceId, token, ahora: DESPUES, ...o }))
const subida = (tallerId: string, enlaceId: string, huella: string, mime = 'application/pdf') =>
  ({ ruta: `${tallerId}/proveedor/${enlaceId}/doc-${huella}.pdf`, huella, mime, bytes: 1234, nombre: 'doc.pdf' })
const hex = (c: string) => c.repeat(64)

/** Recepción completa: albarán registrado en el taller + «Recepción verificada» + factura subida. */
async function hastaFactura(w: Awaited<ReturnType<typeof mundo>>) {
  const { m, prov, pedidoId } = w
  const pl = m.bd.filas('pedidoLinea').find((l: any) => l.pedidoId === pedidoId)
  const alb = await m.conTaller(T, (tx: any) => registrarAlbaran(tx, { tallerId: T, usuarioId: m.dueno.id, proveedorId: prov.id, pedidoId, numeroProveedor: 'AL-77', fecha: '2026-11-04', lineas: [{ pedidoLineaId: pl.id, cantidad: 4 }] }))
  assert.ok(alb.ok, JSON.stringify(alb))
  const albaranId = (alb as any).albaranId as string
  const v = await m.conTaller(T, (tx: any) => verificarRecepcion(tx, { tallerId: T, usuarioId: m.dueno.id, albaranId, ahora: AHORA }))
  assert.ok(v.ok, JSON.stringify(v))
  const tokenF = (v as any).token as string
  const enlaceF = m.bd.filas('enlaceProveedor').find((e: any) => e.tokenHash === hashToken(tokenF))
  const e = await vigente(m, T, enlaceF.id, tokenF)
  const reg = await m.conTaller(T, (tx: any) => registrarDocumentoProveedor(tx, e, { subida: subida(T, enlaceF.id, hex('b')), ip: null, ahora: AHORA }))
  assert.ok(reg.ok)
  return { albaranId, tokenF, enlaceF, documentoId: (reg as any).documentoId as string }
}
const facturaRaw = (o: any = {}) => ({
  nif_emisor: 'ESB41234567', numero: 'F-118', fecha: '2026-11-03', divisa: 'EUR',
  lineas: [{ referencia: 'W712/75', descripcion: 'Filtro aceite W712/75', cantidad: 4, precio_unitario: 6.5, iva_porcentaje: 21, importe: 26 }],
  bases: [{ iva_porcentaje: 21, base: 26, cuota: 5.46 }], retencion: 0, total: 31.46, ...o,
})
const extractor = (raw: unknown, origen: 'xml' | 'ia' = 'ia'): ExtractorFactura => ({ async extraer() { return { ok: true, raw, origen } } })
const procesar = (m: any, documentoId: string, ex: ExtractorFactura) =>
  procesarFactura({ conTaller: (id, fn) => m.conTaller(id, fn as any), leer: async () => new Uint8Array([1]), extractor: ex }, { tallerId: T, documentoId, ahora: AHORA })
const compras = (m: any) => m.bd.filas('hechoPendiente').filter((h: any) => h.tipo === 'compra')

// ─── Tokens y alcance ────────────────────────────────────────────────────────
test('solo el hash: el token no queda en ninguna fila; el pedido pasa a enviado (con quién y cuándo)', async () => {
  const { m, token, pedidoId } = await mundo()
  assert.ok(formatoTokenValido(token))
  const todo = JSON.stringify(['enlaceProveedor', 'pedido', 'documentoProveedor', 'auditoria'].map((t) => m.bd.filas(t)))
  assert.ok(!todo.includes(token))
  assert.ok(!todo.includes(token.slice(3)))
  const p = m.bd.filas('pedido').find((x: any) => x.id === pedidoId)
  assert.equal(p.estado, 'enviado')
  assert.equal(p.enviadoPor, m.dueno.id)
})

test('un enlace nuevo revoca el anterior', async () => {
  const { m, pedidoId, token, enlaceId } = await mundo()
  const otro = await m.conTaller(T, (tx: any) => crearEnlacePedido(tx, { tallerId: T, usuarioId: m.dueno.id, pedidoId, ahora: AHORA }))
  assert.ok(otro.ok)
  assert.equal(await vigente(m, T, enlaceId, token), null)
  const vivos = m.bd.filas('enlaceProveedor').filter((e: any) => !e.revocadoEn)
  assert.equal(vivos.length, 1)
})

test('alcance: un enlace de pedido no vale para la factura; caducado y revocado tampoco', async () => {
  const { m, token, enlaceId } = await mundo()
  assert.ok(await vigente(m, T, enlaceId, token))
  assert.equal(await vigente(m, T, enlaceId, token, { proposito: 'factura' }), null)
  assert.equal(await vigente(m, T, enlaceId, token, { ahora: new Date(AHORA.getTime() + 15 * 86_400_000) }), null)
  assert.equal(await vigente(m, T, enlaceId, 'pp_' + 'x'.repeat(43)), null)
})

test('aislamiento por taller: el enlace y sus documentos no se ven desde otro taller', async () => {
  const { m, token, enlaceId } = await mundo()
  assert.equal(await vigente(m, T2, enlaceId, token), null)
  const e = await vigente(m, T, enlaceId, token)
  await m.conTaller(T, (tx: any) => registrarDocumentoProveedor(tx, e, { subida: subida(T, enlaceId, hex('a')), ip: null, ahora: AHORA }))
  assert.equal(((await m.conTaller(T2, (tx: any) => tx.documentoProveedor.findMany({}))) as any[]).length, 0)
  // y una ruta de Storage de otro taller no se registra
  const r = await m.conTaller(T, (tx: any) => registrarDocumentoProveedor(tx, e, { subida: subida(T2, enlaceId, hex('c')), ip: null, ahora: AHORA }))
  assert.equal(r.ok, false)
})

test('vista del proveedor: solo el documento del enlace, sin precios ni datos del cliente final', async () => {
  const { m, token, enlaceId } = await mundo()
  const e = await vigente(m, T, enlaceId, token)
  const v: any = (await m.conTaller(T, (tx: any) => vistaProveedor(tx, e, AHORA)))
  assert.ok(v)
  assert.equal(v.proposito, 'pedido')
  assert.deepEqual(v.lineas.map((l: any) => [l.descripcion, l.cantidad]), [['Filtro de aceite', '4 ud']])
  assert.ok(!JSON.stringify(v).includes('650'))
  assert.equal(v.maxMb, 4)
  assert.ok((await m.conTaller(T, (tx: any) => confirmarPedidoProveedor(tx, e, AHORA))).ok)
  assert.ok(m.bd.filas('enlaceProveedor').find((x: any) => x.id === enlaceId).confirmadoEn)
})

test('albarán del proveedor: el mismo fichero no se duplica y hay un máximo por enlace', async () => {
  const { m, token, enlaceId } = await mundo()
  const e = await vigente(m, T, enlaceId, token)
  const a = await m.conTaller(T, (tx: any) => registrarDocumentoProveedor(tx, e, { subida: subida(T, enlaceId, hex('1')), ip: null, ahora: AHORA }))
  const b = await m.conTaller(T, (tx: any) => registrarDocumentoProveedor(tx, e, { subida: subida(T, enlaceId, hex('1')), ip: null, ahora: AHORA }))
  assert.ok(a.ok && b.ok && !b.nuevo && a.documentoId === b.documentoId && a.tipo === 'albaran')
  for (let i = 2; i <= MAX_DOCS_POR_ENLACE; i++) await m.conTaller(T, (tx: any) => registrarDocumentoProveedor(tx, e, { subida: subida(T, enlaceId, hex(i.toString(16))), ip: null, ahora: AHORA }))
  const tope = await m.conTaller(T, (tx: any) => registrarDocumentoProveedor(tx, e, { subida: subida(T, enlaceId, 'd'.repeat(63) + 'e'), ip: null, ahora: AHORA }))
  assert.equal(tope.ok, false)
})

// ─── Recepción verificada → enlace de factura ────────────────────────────────
test('«Recepción verificada» genera el 2.º enlace (factura, alcance = el albarán) y cierra el del pedido si llegó todo', async () => {
  const w = await mundo()
  const { albaranId, enlaceF } = await hastaFactura(w)
  assert.equal(enlaceF.proposito, 'factura')
  assert.equal(enlaceF.albaranId, albaranId)
  const alb = w.m.bd.filas('albaran').find((a: any) => a.id === albaranId)
  assert.equal(alb.recepcionVerificadaPor, w.m.dueno.id)
  assert.ok(w.m.bd.filas('enlaceProveedor').find((e: any) => e.id === w.enlaceId).cerradoEn)
})

test('la factura cierra su enlace', async () => {
  const w = await mundo()
  const { enlaceF, tokenF } = await hastaFactura(w)
  assert.equal(await vigente(w.m, T, enlaceF.id, tokenF), null)
})

test('una sola factura viva por albarán', async () => {
  const w = await mundo()
  const { albaranId } = await hastaFactura(w)
  const otra = await w.m.conTaller(T, (tx: any) => verificarRecepcion(tx, { tallerId: T, usuarioId: w.m.dueno.id, albaranId, ahora: AHORA }))
  assert.equal(otra.ok, false)
})

// ─── Case y contabilización ──────────────────────────────────────────────────
test('case exacto leído del XML: contabilizada sola; albarán valorado con los precios de la factura; hecho de compra en el outbox', async () => {
  const w = await mundo()
  const { documentoId, albaranId } = await hastaFactura(w)
  const r = await procesar(w.m, documentoId, extractor(facturaRaw(), 'xml'))
  assert.deepEqual(r, { ok: true, estado: 'contabilizada' })
  const d = w.m.bd.filas('documentoProveedor').find((x: any) => x.id === documentoId)
  assert.equal(d.caseCuadra, true)
  assert.equal(w.m.bd.filas('albaran').find((a: any) => a.id === albaranId).estado, 'valorado')
  assert.equal(w.m.bd.filas('albaran').find((a: any) => a.id === albaranId).facturaProveedorNumero, 'F-118')
  assert.equal(compras(w.m).length, 1)
})

test('case exacto pero leído por IA (PDF/imagen): NO se contabiliza sola; queda en Revisar y una persona la confirma con un toque', async () => {
  const w = await mundo()
  const { documentoId } = await hastaFactura(w)
  assert.deepEqual(await procesar(w.m, documentoId, extractor(facturaRaw(), 'ia')), { ok: true, estado: 'revisar' })
  const d = w.m.bd.filas('documentoProveedor').find((x: any) => x.id === documentoId)
  assert.equal(d.caseCuadra, true)
  assert.equal(compras(w.m).length, 0)
  const c = await w.m.conTaller(T, (tx: any) => confirmarFactura(tx, { tallerId: T, documentoId, usuarioId: w.m.dueno.id, ahora: AHORA }))
  assert.deepEqual(c, { ok: true, contabilizada: true })
  assert.equal(compras(w.m).length, 1)
})

test('no contabiliza sin case ni confirmación: precio distinto → Revisar, sin hecho; contabilizar a la fuerza tampoco', async () => {
  const w = await mundo()
  const { documentoId } = await hastaFactura(w)
  const raw = facturaRaw({ lineas: [{ ...facturaRaw().lineas[0], precio_unitario: 6.9, importe: 27.6 }], bases: [{ iva_porcentaje: 21, base: 27.6, cuota: 5.8 }], total: 33.4 })
  assert.deepEqual(await procesar(w.m, documentoId, extractor(raw)), { ok: true, estado: 'revisar' })
  const d = w.m.bd.filas('documentoProveedor').find((x: any) => x.id === documentoId)
  assert.deepEqual(d.caseResultado.diferencias.filter((x: any) => x.bloquea).map((x: any) => x.tipo), ['precio'])
  assert.equal(compras(w.m).length, 0)
  const forzada = await w.m.conTaller(T, (tx: any) => contabilizarFactura(tx, { tallerId: T, documentoId, ahora: AHORA }))
  assert.equal(forzada.ok, false)
  assert.equal(compras(w.m).length, 0)
  // una PERSONA confirma → se contabiliza (con quién)
  const c = await w.m.conTaller(T, (tx: any) => confirmarFactura(tx, { tallerId: T, documentoId, usuarioId: w.m.dueno.id, ahora: AHORA }))
  assert.deepEqual(c, { ok: true, contabilizada: true })
  const d2 = w.m.bd.filas('documentoProveedor').find((x: any) => x.id === documentoId)
  assert.equal(d2.estado, 'contabilizada')
  assert.equal(d2.confirmadoPor, w.m.dueno.id)
  assert.equal(compras(w.m).length, 1)
})

test('NIF del proveedor sin registrar → Revisar; corregir guardando el NIF vuelve a casar y, confirmada, contabiliza', async () => {
  const w = await mundo({ nif: null })
  const { documentoId } = await hastaFactura(w)
  assert.deepEqual(await procesar(w.m, documentoId, extractor(facturaRaw())), { ok: true, estado: 'revisar' })
  const r = await w.m.conTaller(T, (tx: any) => corregirFactura(tx, { tallerId: T, documentoId, usuarioId: w.m.dueno.id, ahora: AHORA, correccion: { nifEmisor: 'B41234567', guardarNifProveedor: true } }))
  assert.deepEqual(r, { ok: true, estado: 'revisar' }) // corregida a mano (origen persona): cuadra, pero solo el XML contabiliza sin confirmar
  assert.equal(compras(w.m).length, 0)
  assert.deepEqual(await w.m.conTaller(T, (tx: any) => confirmarFactura(tx, { tallerId: T, documentoId, usuarioId: w.m.dueno.id, ahora: AHORA })), { ok: true, contabilizada: true })
  assert.equal(w.m.bd.filas('proveedor').find((p: any) => p.id === w.prov.id).nif, 'B41234567')
  assert.equal(w.m.bd.filas('documentoProveedor').find((x: any) => x.id === documentoId).extraccionOrigen, 'persona')
})

test('NIF distinto en la factura → Revisar (no se contabiliza)', async () => {
  const w = await mundo()
  const { documentoId } = await hastaFactura(w)
  assert.deepEqual(await procesar(w.m, documentoId, extractor(facturaRaw({ nif_emisor: 'B11111111' }))), { ok: true, estado: 'revisar' })
  assert.equal(compras(w.m).length, 0)
})

test('extractor que falla → ilegible, sin hecho; nada se da por leído', async () => {
  const w = await mundo()
  const { documentoId } = await hastaFactura(w)
  const r = await procesar(w.m, documentoId, { async extraer() { return { ok: false, motivo: 'PDF sin capa de texto' } } })
  assert.deepEqual(r, { ok: true, estado: 'ilegible' })
  const d = w.m.bd.filas('documentoProveedor').find((x: any) => x.id === documentoId)
  assert.equal(d.extraccion ?? null, null)
  assert.equal(d.caseCuadra ?? null, null)
  assert.equal(compras(w.m).length, 0)
  const c = await w.m.conTaller(T, (tx: any) => confirmarFactura(tx, { tallerId: T, documentoId, usuarioId: w.m.dueno.id, ahora: AHORA }))
  assert.equal(c.ok, false)
})

// ─── Recambios pendientes de aceptar ─────────────────────────────────────────
test('recambio pendiente: se acepta después (quién y cuándo); ya aceptado o de otro taller, no', async () => {
  const m = montar()
  const veh = m.bd.sembrar('vehiculo', { tallerId: T, matricula: '1111 AAA' })
  const ot = m.bd.sembrar('ordenTrabajo', { tallerId: T, numero: 1, vehiculoId: veh.id, estado: 'en_curso' })
  const base = { tallerId: T, otId: ot.id, tipo: 'pieza', descripcion: 'Filtro', cantidad: 1, unidad: 'ud', totalCent: 1815, articuloId: 'a-1', origen: 'manual' }
  const pend = m.bd.sembrar('otLinea', { ...base })
  const ya = m.bd.sembrar('otLinea', { ...base, aceptadaEn: AHORA })
  assert.deepEqual((await m.conTaller(T, (tx: any) => recambiosPendientes(tx, T, ot.id))).map((l: any) => l.id), [pend.id])
  const r = await m.conTaller(T, (tx: any) => aceptarRecambio(tx, { tallerId: T, otId: ot.id, lineaId: pend.id, usuarioId: m.dueno.id, ahora: AHORA }))
  assert.deepEqual(r, { ok: true })
  const l = m.bd.filas('otLinea').find((x: any) => x.id === pend.id)
  assert.equal(l.aceptadaPor, m.dueno.id)
  assert.equal(+l.aceptadaEn, +AHORA)
  assert.equal((await m.conTaller(T, (tx: any) => aceptarRecambio(tx, { tallerId: T, otId: ot.id, lineaId: ya.id, usuarioId: m.dueno.id, ahora: AHORA }))).ok, false)
  assert.equal((await m.conTaller(T2, (tx: any) => aceptarRecambio(tx, { tallerId: T2, otId: ot.id, lineaId: pend.id, usuarioId: m.dueno.id, ahora: AHORA }))).ok, false)
})

test('límite por IP: tras los fallos, ni un token correcto resuelve (misma respuesta que uno malo)', async () => {
  const filas = new Map<string, FilaCodigo>()
  const store: StoreCodigo = { leer: async (k) => filas.get(k) ?? null, guardar: async (k, f) => { filas.set(k, f) }, borrar: async (k) => { filas.delete(k) } }
  const ip = '203.0.113.9'
  for (let i = 0; i < LIMITE_ENLACE.maxFallos; i++) assert.equal(await resolverProveedorLimitado(store, { ip, ahora: AHORA, resolver: async () => null }), null)
  assert.ok(filas.get(claveProveedor(ip))?.bloqueadoHasta)
  assert.equal(await resolverProveedorLimitado(store, { ip, ahora: AHORA, resolver: async () => ({ tallerId: T }) }), null)
  assert.deepEqual(await resolverProveedorLimitado(store, { ip: '203.0.113.10', ahora: AHORA, resolver: async () => ({ tallerId: T }) }), { tallerId: T })
})

// ─── Cableado (fuentes) ──────────────────────────────────────────────────────
test('ruta pública sin sesión: /prov/ y /api/prov/ en el middleware; la página y la API no usan sesión y pasan por el límite por IP', () => {
  const mw = lee('middleware.ts')
  assert.match(mw, /'\/prov\/'/)
  assert.match(mw, /'\/api\/prov\/'/)
  for (const f of ['app/prov/[token]/page.tsx', 'app/api/prov/[token]/route.ts']) {
    const s = lee(f)
    assert.match(s, /enlaceProveedorLimitado\(token/, f)
    assert.doesNotMatch(s, /getSession|conPermiso|paraPagina/, f)
  }
  assert.match(lee('lib/db.ts'), /enlace_proveedor_por_hash\(\$\{hashToken\(token\)\}::text\)/)
})

test('el token nunca a un log y la respuesta ante token malo es uniforme', () => {
  const s = lee('app/api/prov/[token]/route.ts')
  for (const m of s.matchAll(/console\.(log|error|warn|info)\(([^\n]*)/g)) assert.match(m[2], /sinToken\(/, m[0])
  assert.doesNotMatch(s, /console\.\w+\([^)]*\btoken\b/)
  assert.match(s, /RESPUESTA_ENLACE_NO_VALIDO/)
  // nada sale por nuestro servidor hacia el proveedor: ni correo ni HTTP en el adaptador
  const lib = lee('lib/portal-proveedor.ts')
  assert.doesNotMatch(lib, /fetch\(|sendMail|resend|nodemailer/i)
})

test('el tope de documentos del enlace se mira ANTES de subir al bucket', async () => {
  const w = await mundo()
  const { enlaceF } = await hastaFactura(w)
  assert.equal(await w.m.conTaller(T, (tx: any) => enlaceLlenoDeDocumentos(tx, { tallerId: T, id: enlaceF.id })), false)
  for (let i = 0; i < MAX_DOCS_POR_ENLACE; i++) w.m.bd.sembrar('documentoProveedor', { tallerId: T, enlaceId: enlaceF.id, tipo: 'factura', estado: 'recibida', huellaSha256: `h${i}` })
  assert.equal(await w.m.conTaller(T, (tx: any) => enlaceLlenoDeDocumentos(tx, { tallerId: T, id: enlaceF.id })), true)
  const ruta = lee('app/api/prov/[token]/route.ts')
  assert.ok(ruta.indexOf('previo.lleno') > 0 && ruta.indexOf('previo.lleno') < ruta.indexOf('.guardar('), 'el tope va antes de almacenActivo().guardar()')
})
