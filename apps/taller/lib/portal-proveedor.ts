/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// PORTAL DEL PROVEEDOR del taller: adaptador de `@central/module-portal-proveedor` (la lógica vive en el paquete). Dentro de
// `conTaller` (RLS) salvo la resolución pública del token, que hace `lib/db.ts` con `taller.enlace_proveedor_por_hash()`.
//
// · NADA SALE DE NUESTRO SERVIDOR: el enlace se enseña al dueño, que lo comparte con la Web Share API de SU móvil o lo copia.
// · El token en claro solo existe en el valor devuelto al crear el enlace; en la BD va su hash y nunca se escribe en un log.
// · El 2.º enlace (factura) solo nace cuando una PERSONA pulsa «Recepción verificada» (`verificarRecepcion`).
// · NUNCA se contabiliza nada que no case o no confirme una persona: la única puerta es `puedeContabilizar` del módulo (y un CHECK
//   en 0012 lo repite en la BD).
import {
  calcularCaducidad, casarTresBandas, estadoTrasCase, evaluarEnlace, generarToken, mapearExtraccion, puedeContabilizar,
  POLITICA_POR_DEFECTO, TOLERANCIAS_POR_DEFECTO, type BorradorFacturaRecibida, type LineaAlbaranBanda, type LineaPedidoBanda,
  type PoliticaSubida, type Proposito, type ResultadoCase, type Tolerancias,
} from '@central/module-portal-proveedor'
import { formatearCantidad, type UnidadStock } from '@central/module-taller'
import { marcarPedidoEnviado, valorarAlbaran, type TxPedidos } from './pedidos.ts'

type Delegado = {
  findMany(a?: any): Promise<any[]>
  findFirst(a?: any): Promise<any>
  create(a: any): Promise<any>
  update(a: any): Promise<any>
  updateMany?(a: any): Promise<{ count: number }>
}
export type TxPortal = TxPedidos & {
  enlaceProveedor: Delegado & { updateMany(a: any): Promise<{ count: number }> }
  documentoProveedor: Delegado
  configuracion: Delegado
  taller: Delegado
}
export type Resultado<T> = ({ ok: true } & T) | { ok: false; motivo: string }

/** Vercel corta el cuerpo de una petición en ~4,5 MB: el máximo de subida del portal no puede pasar de 4 MB aunque la config diga más. */
export const MAX_MB_PLATAFORMA = 4
/** Documentos por enlace (evita usar el enlace como almacén ilimitado). */
export const MAX_DOCS_POR_ENLACE = 10

// ─── Configuración ───────────────────────────────────────────────────────────
export interface PoliticaPortal { caducaDias: number; subida: PoliticaSubida; tolerancias: Tolerancias }
const ent = (v: unknown, def: number) => (v == null || !Number.isFinite(Number(v)) ? def : Number(v))

export async function politicaPortal(tx: Pick<TxPortal, 'configuracion'>, tallerId: string): Promise<PoliticaPortal> {
  const c = await tx.configuracion.findFirst({ where: { tallerId } })
  const mb = Math.min(MAX_MB_PLATAFORMA, Math.max(1, ent(c?.portalMaxMb, MAX_MB_PLATAFORMA)))
  return {
    caducaDias: ent(c?.portalEnlaceCaducaDias, 14),
    subida: { tipos: POLITICA_POR_DEFECTO.tipos, maxBytes: mb * 1024 * 1024 },
    tolerancias: {
      ...TOLERANCIAS_POR_DEFECTO,
      precioUnitCent: ent(c?.portalTolPrecioCent, TOLERANCIAS_POR_DEFECTO.precioUnitCent),
      precioPb: ent(c?.portalTolPrecioPb, TOLERANCIAS_POR_DEFECTO.precioPb),
      importeLineaCent: ent(c?.portalTolImporteLineaCent, TOLERANCIAS_POR_DEFECTO.importeLineaCent),
      totalCent: ent(c?.portalTolTotalCent, TOLERANCIAS_POR_DEFECTO.totalCent),
      cantidadMil: ent(c?.portalTolCantidadMil, TOLERANCIAS_POR_DEFECTO.cantidadMil),
    },
  }
}

// ─── Enlaces (lado del taller, con sesión) ───────────────────────────────────
async function nuevoEnlace(
  tx: TxPortal,
  o: { tallerId: string; usuarioId: string; proveedorId: string; proposito: Proposito; pedidoId: string | null; albaranId: string | null; ahora: Date },
): Promise<{ token: string; caducaEn: Date }> {
  const p = await politicaPortal(tx, o.tallerId)
  const doc = o.proposito === 'pedido' ? { pedidoId: o.pedidoId } : { albaranId: o.albaranId }
  // Un solo enlace vivo por documento y propósito: el anterior queda revocado (ux_enlaces_proveedor_vivo en 0012).
  await tx.enlaceProveedor.updateMany({
    where: { tallerId: o.tallerId, proposito: o.proposito, ...doc, revocadoEn: null, cerradoEn: null },
    data: { revocadoEn: o.ahora, revocadoPor: o.usuarioId },
  })
  const { token, hash } = generarToken()
  const caducaEn = calcularCaducidad(o.ahora, p.caducaDias)
  await tx.enlaceProveedor.create({
    data: {
      tallerId: o.tallerId, proveedorId: o.proveedorId, proposito: o.proposito, pedidoId: o.pedidoId, albaranId: o.albaranId,
      tokenHash: hash, creadoPor: o.usuarioId, creadoEn: o.ahora, caducaEn, accesos: 0,
    },
  })
  return { token, caducaEn }
}

/** Enlace 1 (pedido). Generarlo ES mandarlo: un borrador pasa a «enviado» con quién y cuándo. Anula el enlace anterior. */
export async function crearEnlacePedido(
  tx: TxPortal, o: { tallerId: string; usuarioId: string; pedidoId: string; ahora: Date },
): Promise<Resultado<{ token: string; caducaEn: Date }>> {
  const p = await tx.pedido.findFirst({ where: { tallerId: o.tallerId, id: o.pedidoId } })
  if (!p) return { ok: false, motivo: 'Pedido no encontrado' }
  if (!['borrador', 'enviado', 'parcial'].includes(p.estado)) return { ok: false, motivo: `El pedido está «${p.estado}»: ya no admite enlace` }
  if (p.estado === 'borrador') {
    const r = await marcarPedidoEnviado(tx, { tallerId: o.tallerId, pedidoId: p.id, usuarioId: o.usuarioId, ahora: o.ahora })
    if (!r.ok) return r
  }
  const e = await nuevoEnlace(tx, { tallerId: o.tallerId, usuarioId: o.usuarioId, proveedorId: p.proveedorId, proposito: 'pedido', pedidoId: p.id, albaranId: null, ahora: o.ahora })
  return { ok: true, ...e }
}

const FACTURA_EN_CURSO = ['recibida', 'extraida', 'ilegible', 'lista', 'revisar', 'confirmada', 'contabilizada']

/**
 * «Recepción verificada»: una PERSONA confirma que lo recibido es lo del albarán. Solo entonces se genera el enlace 2 (factura,
 * alcance = este albarán). Marca verificados los albaranes que subió el proveedor y cierra el enlace del pedido si ya llegó todo.
 */
export async function verificarRecepcion(
  tx: TxPortal, o: { tallerId: string; usuarioId: string; albaranId: string; ahora: Date },
): Promise<Resultado<{ token: string; caducaEn: Date }>> {
  const a = await tx.albaran.findFirst({ where: { tallerId: o.tallerId, id: o.albaranId } })
  if (!a) return { ok: false, motivo: 'Albarán no encontrado' }
  if (a.estado !== 'recibido') return { ok: false, motivo: 'El albarán ya está valorado con su factura' }
  const facturas = await tx.documentoProveedor.findMany({ where: { tallerId: o.tallerId, albaranId: a.id, tipo: 'factura' } })
  if (facturas.some((f) => FACTURA_EN_CURSO.includes(f.estado))) return { ok: false, motivo: 'Ya hay una factura del proveedor para este albarán' }
  if (!a.recepcionVerificadaEn) {
    await tx.albaran.update({ where: { id: a.id }, data: { recepcionVerificadaEn: o.ahora, recepcionVerificadaPor: o.usuarioId } })
  }
  if (a.pedidoId) {
    const docs = await tx.documentoProveedor.findMany({ where: { tallerId: o.tallerId, pedidoId: a.pedidoId, tipo: 'albaran', estado: 'recibido' } })
    for (const d of docs) await tx.documentoProveedor.update({ where: { id: d.id }, data: { estado: 'verificado' } })
    const ped = await tx.pedido.findFirst({ where: { tallerId: o.tallerId, id: a.pedidoId } })
    if (ped && ['recibido', 'facturado'].includes(ped.estado)) {
      await tx.enlaceProveedor.updateMany({ where: { tallerId: o.tallerId, proposito: 'pedido', pedidoId: a.pedidoId, revocadoEn: null, cerradoEn: null }, data: { cerradoEn: o.ahora } })
    }
  }
  const e = await nuevoEnlace(tx, { tallerId: o.tallerId, usuarioId: o.usuarioId, proveedorId: a.proveedorId, proposito: 'factura', pedidoId: a.pedidoId ?? null, albaranId: a.id, ahora: o.ahora })
  return { ok: true, ...e }
}

/** Revoca a mano el enlace vivo de un documento. */
export async function revocarEnlaces(
  tx: TxPortal, o: { tallerId: string; usuarioId: string; proposito: Proposito; documentoId: string; ahora: Date },
): Promise<number> {
  const doc = o.proposito === 'pedido' ? { pedidoId: o.documentoId } : { albaranId: o.documentoId }
  const r = await tx.enlaceProveedor.updateMany({
    where: { tallerId: o.tallerId, proposito: o.proposito, ...doc, revocadoEn: null, cerradoEn: null }, data: { revocadoEn: o.ahora, revocadoPor: o.usuarioId },
  })
  return r.count
}

// ─── Lado PÚBLICO (sin sesión; el taller y el enlace ya los resolvió la BD por el hash) ─────
export interface EnlaceFila { id: string; tallerId: string; proveedorId: string; proposito: Proposito; pedidoId: string | null; albaranId: string | null; confirmadoEn: Date | null }

/** Relee la fila bajo RLS y repite la evaluación del módulo (defensa en profundidad). null = no vale (respuesta uniforme). */
export async function enlaceVigente(
  tx: Pick<TxPortal, 'enlaceProveedor'>, o: { tallerId: string; enlaceId: string; token: string; ahora: Date; proposito?: Proposito },
): Promise<EnlaceFila | null> {
  const e = await tx.enlaceProveedor.findFirst({ where: { tallerId: o.tallerId, id: o.enlaceId } })
  if (!e) return null
  const ev = evaluarEnlace(
    { tokenHash: e.tokenHash, proposito: e.proposito, documentoId: (e.proposito === 'pedido' ? e.pedidoId : e.albaranId) ?? '', caducaEn: e.caducaEn, revocadoEn: e.revocadoEn ?? null, cerradoEn: e.cerradoEn ?? null },
    { token: o.token, proposito: o.proposito ?? e.proposito, ahora: o.ahora },
  )
  if (!ev.ok) return null
  return { id: e.id, tallerId: e.tallerId, proveedorId: e.proveedorId, proposito: e.proposito, pedidoId: e.pedidoId ?? null, albaranId: e.albaranId ?? null, confirmadoEn: e.confirmadoEn ?? null }
}

const unidad = (u: string): UnidadStock => (u === 'ml' ? 'ml' : 'ud')
const cant = (c: unknown, u: string) => `${formatearCantidad(Number(c), unidad(u))}${u === 'ml' ? '' : ' ud'}`
const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10).split('-').reverse().join('/') : '')

export interface VistaProveedor {
  proposito: Proposito
  proveedor: string
  confirmadoEn: string | null
  referencia: string // «Pedido ABCD1234» / «Albarán 123»
  fecha: string
  lineas: { descripcion: string; referencia: string | null; cantidad: string }[]
  documentos: { tipo: string; nombre: string; subidoEn: string }[]
  maxMb: number
}

/** SOLO lo necesario del documento del enlace: sin precios, sin cliente final, sin nada más del taller. */
export async function vistaProveedor(tx: TxPortal, e: EnlaceFila, ahora: Date): Promise<VistaProveedor | null> {
  const prov = await tx.proveedor.findFirst({ where: { tallerId: e.tallerId, id: e.proveedorId } })
  const docs = await tx.documentoProveedor.findMany({ where: { tallerId: e.tallerId, enlaceId: e.id }, orderBy: { subidoEn: 'asc' } })
  const pol = await politicaPortal(tx, e.tallerId)
  const fila = await tx.enlaceProveedor.findFirst({ where: { tallerId: e.tallerId, id: e.id } })
  await tx.enlaceProveedor.update({ where: { id: e.id }, data: { accesos: Number(fila?.accesos ?? 0) + 1, ultimoAccesoEn: ahora } })
  const base = {
    proposito: e.proposito, proveedor: prov?.nombre ?? '', confirmadoEn: e.confirmadoEn ? e.confirmadoEn.toISOString() : null,
    documentos: docs.map((d) => ({ tipo: d.tipo as string, nombre: d.nombre as string, subidoEn: (d.subidoEn as Date).toISOString() })),
    maxMb: Math.floor(pol.subida.maxBytes / (1024 * 1024)),
  }
  if (e.proposito === 'pedido') {
    const p = await tx.pedido.findFirst({ where: { tallerId: e.tallerId, id: e.pedidoId } })
    if (!p) return null
    const ls = await tx.pedidoLinea.findMany({ where: { tallerId: e.tallerId, pedidoId: p.id }, orderBy: { creadoEn: 'asc' } })
    return { ...base, referencia: `Pedido ${String(p.id).slice(0, 8).toUpperCase()}`, fecha: dia(p.creadoEn), lineas: ls.map((l) => ({ descripcion: l.descripcion, referencia: l.referencia ?? null, cantidad: cant(l.cantidad, l.unidad) })) }
  }
  const a = await tx.albaran.findFirst({ where: { tallerId: e.tallerId, id: e.albaranId } })
  if (!a) return null
  const ls = await tx.albaranLinea.findMany({ where: { tallerId: e.tallerId, albaranId: a.id }, orderBy: { creadoEn: 'asc' } })
  return { ...base, referencia: `Albarán ${a.numeroProveedor}`, fecha: dia(a.fecha), lineas: ls.map((l) => ({ descripcion: l.descripcion, referencia: null, cantidad: cant(l.cantidad, l.unidad) })) }
}

/** El proveedor confirma el pedido (idempotente). Solo con un enlace de PEDIDO. */
export async function confirmarPedidoProveedor(tx: TxPortal, e: EnlaceFila, ahora: Date): Promise<Resultado<object>> {
  if (e.proposito !== 'pedido') return { ok: false, motivo: 'alcance' }
  if (!e.confirmadoEn) await tx.enlaceProveedor.update({ where: { id: e.id }, data: { confirmadoEn: ahora } })
  return { ok: true }
}

export interface SubidaGuardada { ruta: string; huella: string; mime: string; bytes: number; nombre: string }

/**
 * Registra lo que subió el proveedor (el fichero ya está en Storage). Enlace de pedido → ALBARÁN; enlace de factura → FACTURA (y el
 * enlace se cierra: una factura por enlace). El mismo fichero dos veces por el mismo enlace devuelve el documento existente.
 */
export async function registrarDocumentoProveedor(
  tx: TxPortal, e: EnlaceFila, o: { subida: SubidaGuardada; ip: string | null; ahora: Date },
): Promise<Resultado<{ documentoId: string; tipo: 'albaran' | 'factura'; nuevo: boolean }>> {
  const tipo = e.proposito === 'pedido' ? 'albaran' : 'factura'
  if (!o.subida.ruta.startsWith(`${e.tallerId}/proveedor/${e.id}/`)) return { ok: false, motivo: 'ruta' }
  const previos = await tx.documentoProveedor.findMany({ where: { tallerId: e.tallerId, enlaceId: e.id } })
  const igual = previos.find((d) => d.huellaSha256 === o.subida.huella)
  if (igual) return { ok: true, documentoId: igual.id, tipo, nuevo: false }
  if (previos.length >= MAX_DOCS_POR_ENLACE) return { ok: false, motivo: 'Has llegado al máximo de documentos de este enlace' }
  const doc = await tx.documentoProveedor.create({
    data: {
      tallerId: e.tallerId, enlaceId: e.id, proveedorId: e.proveedorId, pedidoId: e.pedidoId, albaranId: e.albaranId, tipo,
      ruta: o.subida.ruta, huellaSha256: o.subida.huella, mime: o.subida.mime, bytes: o.subida.bytes, nombre: o.subida.nombre,
      subidoEn: o.ahora, subidoIp: o.ip, estado: tipo === 'albaran' ? 'recibido' : 'recibida',
    },
  })
  if (tipo === 'factura') await tx.enlaceProveedor.update({ where: { id: e.id }, data: { cerradoEn: o.ahora } })
  return { ok: true, documentoId: doc.id, tipo, nuevo: true }
}

// ─── Extracción, case y contabilización (lado del taller) ────────────────────
export type ExtraccionFactura = { ok: true; raw: unknown; origen: 'xml' | 'ia' } | { ok: false; motivo: string }
/** Puerto del extractor (real en lib/extractor-factura.ts; fake en tests). Recibe solo los bytes y el tipo: nada del taller. */
export interface ExtractorFactura { extraer(a: { mime: string; bytes: Uint8Array }): Promise<ExtraccionFactura> }

const aMil = (cantidad: unknown, u: string) => (u === 'ml' ? Number(cantidad) : Number(cantidad) * 1000)
const n = (v: unknown): number | null => (v == null ? null : Number(v))

/** Bandas del taller → forma del módulo (cantidades en milésimas: 1 ud = 1000; granel ya va en ml = milésimas de litro). */
async function bandas(tx: TxPortal, tallerId: string, albaranId: string) {
  const a = await tx.albaran.findFirst({ where: { tallerId, id: albaranId } })
  if (!a) return null
  const la = await tx.albaranLinea.findMany({ where: { tallerId, albaranId } })
  const lp = a.pedidoId ? await tx.pedidoLinea.findMany({ where: { tallerId, pedidoId: a.pedidoId } }) : []
  const arts = new Map<string, any>()
  for (const id of new Set([...la, ...lp].map((l) => l.articuloId).filter(Boolean) as string[])) {
    arts.set(id, await tx.articulo.findFirst({ where: { tallerId, id } }))
  }
  const refArt = (id: string | null) => (id ? arts.get(id)?.referenciaFabricante ?? arts.get(id)?.referencia ?? null : null)
  const pedido: LineaPedidoBanda[] = lp.map((l) => ({
    id: l.id, clave: l.referencia ?? refArt(l.articuloId), descripcion: l.descripcion, cantidadMil: aMil(l.cantidad, l.unidad),
    precioUnitCent: n(l.costeUnitarioCent), ivaPb: null,
  }))
  const porPedido = new Map(pedido.map((p) => [p.id, p]))
  const albaran: LineaAlbaranBanda[] = la.map((l) => ({
    id: l.id, pedidoLineaId: l.pedidoLineaId ?? null, clave: (l.pedidoLineaId ? porPedido.get(l.pedidoLineaId)?.clave : null) ?? refArt(l.articuloId),
    descripcion: l.descripcion, cantidadMil: aMil(l.cantidad, l.unidad), precioUnitCent: n(l.costeUnitarioCent), ivaPb: n(l.ivaPuntosBasicos),
  }))
  const prov = await tx.proveedor.findFirst({ where: { tallerId, id: a.proveedorId } })
  return { a, la, pedido, albaran, nifProveedor: (prov?.nif ?? null) as string | null }
}

/** Casa la factura (ya extraída) contra pedido y albarán y deja `lista` (y la contabiliza) o `revisar`. */
export async function casarFactura(tx: TxPortal, o: { tallerId: string; documentoId: string; ahora: Date }): Promise<Resultado<{ estado: string; resultado: ResultadoCase }>> {
  const d = await tx.documentoProveedor.findFirst({ where: { tallerId: o.tallerId, id: o.documentoId } })
  if (!d || d.tipo !== 'factura') return { ok: false, motivo: 'Factura no encontrada' }
  if (!['extraida', 'revisar', 'lista'].includes(d.estado) || !d.extraccion) return { ok: false, motivo: `La factura está «${d.estado}»: no se puede casar` }
  const b = await bandas(tx, o.tallerId, d.albaranId)
  if (!b) return { ok: false, motivo: 'Albarán no encontrado' }
  const pol = await politicaPortal(tx, o.tallerId)
  const resultado = casarTresBandas({ nifProveedor: b.nifProveedor, pedido: b.pedido, albaran: b.albaran, factura: d.extraccion as BorradorFacturaRecibida, tolerancias: pol.tolerancias })
  const estado = estadoTrasCase(resultado.cuadra)
  await tx.documentoProveedor.update({ where: { id: d.id }, data: { estado, caseCuadra: resultado.cuadra, caseResultado: resultado as any } })
  if (estado === 'lista') {
    const c = await contabilizarFactura(tx, { tallerId: o.tallerId, documentoId: d.id, ahora: o.ahora })
    if (!c.ok) {
      // Cuadra, pero no se pudo valorar el albarán: a revisión con el motivo (nunca se queda «lista» sin contabilizar en silencio).
      await tx.documentoProveedor.update({ where: { id: d.id }, data: { estado: 'revisar', nota: c.motivo } })
      return { ok: true, estado: 'revisar', resultado }
    }
    return { ok: true, estado: 'contabilizada', resultado }
  }
  return { ok: true, estado, resultado }
}

/**
 * Contabiliza (valora el albarán con los precios de la factura → `valorarAlbaran` encola el hecho `compra` en el outbox). SOLO si
 * `puedeContabilizar` lo autoriza: case que cuadra o persona que confirmó. Si el albarán ya estaba valorado a mano, el hecho ya se
 * encoló entonces (idempotente por albarán) y aquí solo se cierra el documento.
 */
export async function contabilizarFactura(tx: TxPortal, o: { tallerId: string; documentoId: string; ahora: Date }): Promise<Resultado<object>> {
  const d = await tx.documentoProveedor.findFirst({ where: { tallerId: o.tallerId, id: o.documentoId } })
  if (!d) return { ok: false, motivo: 'Factura no encontrada' }
  const dec = puedeContabilizar({ tipo: d.tipo, estado: d.estado, caseCuadra: d.caseCuadra ?? null, confirmadoPor: d.confirmadoPor ?? null })
  if (!dec.contabilizar) return { ok: false, motivo: dec.motivo }
  const borrador = d.extraccion as BorradorFacturaRecibida | null
  if (!borrador?.numero || !borrador.fecha) return { ok: false, motivo: 'Faltan el número o la fecha de la factura: corrígelos' }
  const a = await tx.albaran.findFirst({ where: { tallerId: o.tallerId, id: d.albaranId } })
  if (!a) return { ok: false, motivo: 'Albarán no encontrado' }
  if (a.estado === 'recibido') {
    const parejas = ((d.caseResultado as ResultadoCase | null)?.parejas ?? [])
    const lineas = await tx.albaranLinea.findMany({ where: { tallerId: o.tallerId, albaranId: a.id } })
    const costes = []
    for (const l of lineas) {
      if (l.costeUnitarioCent != null) continue
      const p = parejas.find((x) => x.albaranLineaId === l.id)
      if (!p || p.precioUnitCent == null) return { ok: false, motivo: `La factura no trae precio para «${l.descripcion}»: valora el albarán a mano` }
      costes.push({ lineaId: l.id, costeUnitarioCent: p.precioUnitCent, ivaPuntosBasicos: p.ivaPb })
    }
    const r = await valorarAlbaran(tx, { tallerId: o.tallerId, albaranId: a.id, facturaNumero: borrador.numero, facturaFecha: borrador.fecha, costes, ahora: o.ahora })
    if (!r.ok) return r
  }
  await tx.documentoProveedor.update({ where: { id: d.id }, data: { estado: 'contabilizada', contabilizadoEn: o.ahora } })
  return { ok: true }
}

/**
 * Lee la factura (XML sin IA; PDF/imagen con IA) y la casa. La IA se llama FUERA de una transacción: `conTaller` se abre dos veces
 * (leer el documento / guardar el resultado). `bytes` opcional: si no vienen, se leen de Storage.
 */
export async function procesarFactura(
  deps: {
    conTaller: <R>(tallerId: string, fn: (tx: TxPortal) => Promise<R>) => Promise<R>
    leer(tallerId: string, ruta: string): Promise<Uint8Array | null>
    extractor: ExtractorFactura
  },
  o: { tallerId: string; documentoId: string; ahora: Date; bytes?: Uint8Array },
): Promise<Resultado<{ estado: string }>> {
  const d = await deps.conTaller(o.tallerId, (tx) => tx.documentoProveedor.findFirst({ where: { tallerId: o.tallerId, id: o.documentoId } }))
  if (!d || d.tipo !== 'factura') return { ok: false, motivo: 'Factura no encontrada' }
  if (!['recibida', 'ilegible'].includes(d.estado)) return { ok: false, motivo: `La factura ya está «${d.estado}»` }
  let error: string | null = null
  let raw: unknown = null
  let origen: 'xml' | 'ia' | null = null
  try {
    const bytes = o.bytes ?? (await deps.leer(o.tallerId, d.ruta))
    if (!bytes) error = 'no se encuentra el fichero'
    else {
      const x = await deps.extractor.extraer({ mime: d.mime, bytes })
      if (x.ok) { raw = x.raw; origen = x.origen } else error = x.motivo
    }
  } catch (e) {
    error = `extractor: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`
  }
  const m = error ? null : mapearExtraccion(raw)
  if (m && !m.ok) error = m.motivo
  return deps.conTaller(o.tallerId, async (tx) => {
    if (!m || !m.ok) {
      await tx.documentoProveedor.update({ where: { id: d.id }, data: { estado: 'ilegible', extraccionError: (error ?? 'sin datos').slice(0, 300) } })
      return { ok: true as const, estado: 'ilegible' }
    }
    await tx.documentoProveedor.update({ where: { id: d.id }, data: { estado: 'extraida', extraccion: m.borrador as any, extraccionOrigen: origen, extraccionError: null } })
    const c = await casarFactura(tx, { tallerId: o.tallerId, documentoId: d.id, ahora: o.ahora })
    return c.ok ? { ok: true as const, estado: c.estado } : c
  })
}

/** Una PERSONA confirma una factura en «Revisar» (acepta las diferencias señaladas) → se contabiliza. */
export async function confirmarFactura(
  tx: TxPortal, o: { tallerId: string; documentoId: string; usuarioId: string; ahora: Date },
): Promise<Resultado<{ contabilizada: boolean; motivo?: string }>> {
  const d = await tx.documentoProveedor.findFirst({ where: { tallerId: o.tallerId, id: o.documentoId } })
  if (!d || d.tipo !== 'factura') return { ok: false, motivo: 'Factura no encontrada' }
  if (d.estado === 'revisar') {
    if (!d.extraccion) return { ok: false, motivo: 'La factura no tiene datos leídos: corrígela o recházala' }
    await tx.documentoProveedor.update({ where: { id: d.id }, data: { estado: 'confirmada', confirmadoPor: o.usuarioId, confirmadoEn: o.ahora } })
  } else if (d.estado !== 'confirmada') return { ok: false, motivo: `La factura está «${d.estado}»` }
  const c = await contabilizarFactura(tx, { tallerId: o.tallerId, documentoId: d.id, ahora: o.ahora })
  return c.ok ? { ok: true, contabilizada: true } : { ok: true, contabilizada: false, motivo: c.motivo }
}

export interface CorreccionFactura {
  nifEmisor?: string | null
  numero?: string | null
  fecha?: string | null
  totalCent?: number | null
  lineas?: { indice: number; precioUnitCent?: number | null; ivaPb?: number | null; cantidadMil?: number | null }[]
  /** Guarda el NIF corregido en la ficha del proveedor si aún no lo tenía. */
  guardarNifProveedor?: boolean
}

/** Una PERSONA corrige lo leído y se vuelve a casar (si ahora cuadra, se contabiliza por case). */
export async function corregirFactura(
  tx: TxPortal, o: { tallerId: string; documentoId: string; usuarioId: string; ahora: Date; correccion: CorreccionFactura },
): Promise<Resultado<{ estado: string }>> {
  const d = await tx.documentoProveedor.findFirst({ where: { tallerId: o.tallerId, id: o.documentoId } })
  if (!d || d.tipo !== 'factura') return { ok: false, motivo: 'Factura no encontrada' }
  if (d.estado !== 'revisar' || !d.extraccion) return { ok: false, motivo: `La factura está «${d.estado}»: no se corrige` }
  const b = structuredClone(d.extraccion) as BorradorFacturaRecibida
  const c = o.correccion
  if (c.nifEmisor !== undefined) b.nifEmisor = c.nifEmisor ? c.nifEmisor.toUpperCase().replace(/[\s.\-/]/g, '').replace(/^ES(?=[0-9A-Z]{9}$)/, '') : null
  if (c.numero !== undefined) b.numero = c.numero?.trim() || null
  if (c.fecha !== undefined) b.fecha = c.fecha && /^\d{4}-\d{2}-\d{2}$/.test(c.fecha) ? c.fecha : null
  if (c.totalCent !== undefined) b.totalCent = c.totalCent
  for (const l of c.lineas ?? []) {
    const x = b.lineas[l.indice]
    if (!x) return { ok: false, motivo: 'Línea inexistente' }
    if (l.precioUnitCent !== undefined) { x.precioUnitCent = l.precioUnitCent; x.importeCent = null }
    if (l.ivaPb !== undefined) x.ivaPb = l.ivaPb
    if (l.cantidadMil !== undefined) { x.cantidadMil = l.cantidadMil; x.importeCent = null }
  }
  if (c.guardarNifProveedor && b.nifEmisor) {
    const a = await tx.albaran.findFirst({ where: { tallerId: o.tallerId, id: d.albaranId } })
    const prov = a ? await tx.proveedor.findFirst({ where: { tallerId: o.tallerId, id: a.proveedorId } }) : null
    if (prov && !prov.nif) await tx.proveedor.update({ where: { id: prov.id }, data: { nif: b.nifEmisor } })
  }
  await tx.documentoProveedor.update({ where: { id: d.id }, data: { extraccion: b as any, extraccionOrigen: 'persona', corregidoPor: o.usuarioId, corregidoEn: o.ahora } })
  const r = await casarFactura(tx, { tallerId: o.tallerId, documentoId: d.id, ahora: o.ahora })
  return r.ok ? { ok: true, estado: r.estado } : r
}

/** Rechaza la factura (p. ej. no es de este albarán). Después se puede pedir otra con «Recepción verificada». */
export async function rechazarFactura(
  tx: TxPortal, o: { tallerId: string; documentoId: string; usuarioId: string; nota: string; ahora: Date },
): Promise<Resultado<object>> {
  const d = await tx.documentoProveedor.findFirst({ where: { tallerId: o.tallerId, id: o.documentoId } })
  if (!d || d.tipo !== 'factura') return { ok: false, motivo: 'Factura no encontrada' }
  if (!['revisar', 'ilegible', 'recibida'].includes(d.estado)) return { ok: false, motivo: `La factura está «${d.estado}»` }
  await tx.documentoProveedor.update({ where: { id: d.id }, data: { estado: 'rechazada', nota: o.nota.trim().slice(0, 300) || 'rechazada', corregidoPor: o.usuarioId, corregidoEn: o.ahora } })
  return { ok: true }
}
