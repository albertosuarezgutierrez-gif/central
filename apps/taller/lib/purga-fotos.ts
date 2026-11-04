/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// Purga de fotos tras el plazo de conservación (cron diario). Borra de Storage SOLO las fotos de daños (recepción) y de trabajo
// (OT) de órdenes ENTREGADAS hace más días que el plazo de SU taller, y marca la fila con `purgada_en` (la fila no se borra).
//
// Garantías:
//   · Por taller y bajo RLS (`conTaller`); cada taller usa SU `fotos_retencion_dias`. Qué fotos tocan lo decide el helper puro
//     `fotosAPurgar` de module-taller (la consulta solo preselecciona).
//   · Por lotes de órdenes e idempotente: lo ya marcado no vuelve a salir; borrar un archivo que ya no existe es éxito.
//   · Si Storage falla, la foto NO se marca (se reintenta mañana). Si el rollback de la BD pierde las marcas, mañana se repite
//     el borrado, que es inocuo.
//   · Nunca toca firmas (recepción, entrega, consentimiento), resguardo, presupuestos ni facturas. Una foto de la OT que se copió a
//     una ampliación enviada al cliente comparte el archivo con ese presupuesto: se deja como está (`protegidas`).
import { fotosAPurgar, fechaLimitePurga, lotes, plazoRetencionValido, type FotoCandidata, type OrdenEntrega } from '@central/module-taller'
import type { AlmacenArchivos } from './almacen.ts'

type Delegado = {
  findMany(a?: any): Promise<any[]>
  findUnique?(a: any): Promise<any>
  updateMany(a: any): Promise<any>
}
export type TxPurga = {
  configuracion: Pick<Delegado, 'findUnique'>
  ordenTrabajo: Pick<Delegado, 'findMany'>
  recepcion: Pick<Delegado, 'findMany'>
  otFoto: Delegado
  recepcionFoto: Delegado
  ampliacionFoto: Pick<Delegado, 'findMany'>
}

/** Órdenes por página. */
export const LOTE_ORDENES = 50
/** Páginas por taller y noche (el resto sigue a la noche siguiente: es idempotente). */
export const MAX_LOTES_POR_TALLER = 40
const CONCURRENCIA_BORRADO = 8

export type ResumenTaller = {
  tallerId: string
  borradas: number
  protegidas: number
  fallidas: number
  /** Motivo por el que no se purgó nada en este taller (sin configuración, plazo inválido, error). */
  omitido?: string
}

type Seleccionada = FotoCandidata & { ruta: string; tabla: 'otFoto' | 'recepcionFoto' }

export async function purgarFotosDeTaller(
  tx: TxPurga, almacen: AlmacenArchivos, o: { tallerId: string; hoy: Date; loteOrdenes?: number; maxLotes?: number },
): Promise<ResumenTaller> {
  const r: ResumenTaller = { tallerId: o.tallerId, borradas: 0, protegidas: 0, fallidas: 0 }
  const cfg = await tx.configuracion.findUnique!({ where: { tallerId: o.tallerId } })
  if (!cfg) return { ...r, omitido: 'sin configuración' }
  const dias = Number(cfg.fotosRetencionDias)
  // Plazo ilegible o por debajo del mínimo legal: no se borra NADA de este taller.
  if (!plazoRetencionValido(dias)) return { ...r, omitido: 'plazo de conservación inválido' }
  const limite = fechaLimitePurga(o.hoy, dias)
  const take = o.loteOrdenes ?? LOTE_ORDENES

  let cursor: string | null = null
  for (let pagina = 0; pagina < (o.maxLotes ?? MAX_LOTES_POR_TALLER); pagina++) {
    const ots: any[] = await tx.ordenTrabajo.findMany({
      where: { tallerId: o.tallerId, estado: 'entregado', entregadoEn: { lte: limite }, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: 'asc' }, take,
    })
    if (ots.length === 0) break
    cursor = ots[ots.length - 1].id as string

    const ordenes: OrdenEntrega[] = ots.map((x) => ({ id: x.id, estado: x.estado, entregadoEn: x.entregadoEn ?? null }))
    const otDeRecepcion = new Map<string, string>(ots.map((x) => [x.recepcionId as string, x.id as string]))
    const [fotosOt, fotosRec] = await Promise.all([
      tx.otFoto.findMany({ where: { tallerId: o.tallerId, otId: { in: ots.map((x) => x.id) }, purgadaEn: null } }),
      tx.recepcionFoto.findMany({ where: { tallerId: o.tallerId, recepcionId: { in: [...otDeRecepcion.keys()] }, purgadaEn: null } }),
    ])
    const candidatas: Seleccionada[] = [
      ...fotosOt.map((f): Seleccionada => ({ id: f.id, tipo: 'trabajo', otId: f.otId, purgadaEn: f.purgadaEn ?? null, ruta: f.ruta, tabla: 'otFoto' })),
      ...fotosRec.map((f): Seleccionada => ({ id: f.id, tipo: 'dano', otId: otDeRecepcion.get(f.recepcionId) ?? '', purgadaEn: f.purgadaEn ?? null, ruta: f.ruta, tabla: 'recepcionFoto' })),
    ]
    const tocan = new Set(fotosAPurgar({ fotos: candidatas, ordenes, retencionDias: dias, hoy: o.hoy }))
    const sel = candidatas.filter((f) => tocan.has(f.id))
    if (sel.length === 0) continue

    // Rutas que NO se pueden borrar aunque la foto toque: compartidas con un presupuesto de ampliación o que son una firma.
    const rutas = [...new Set(sel.map((f) => f.ruta))]
    const [amp, recFirmas, otFirmas] = await Promise.all([
      tx.ampliacionFoto.findMany({ where: { tallerId: o.tallerId, ruta: { in: rutas } } }),
      tx.recepcion.findMany({ where: { tallerId: o.tallerId, firmaRuta: { in: rutas } } }),
      tx.ordenTrabajo.findMany({ where: { tallerId: o.tallerId, entregaFirmaRuta: { in: rutas } } }),
    ])
    const protegidas = new Set<string>([...amp.map((x) => x.ruta), ...recFirmas.map((x) => x.firmaRuta), ...otFirmas.map((x) => x.entregaFirmaRuta)])

    const borradas = new Set<string>()
    const falladas = new Set<string>()
    for (const grupo of lotes(rutas.filter((x) => !protegidas.has(x)), CONCURRENCIA_BORRADO)) {
      await Promise.all(grupo.map(async (ruta) => {
        try { await almacen.borrar(o.tallerId, ruta); borradas.add(ruta) } catch { falladas.add(ruta) }
      }))
    }

    for (const tabla of ['otFoto', 'recepcionFoto'] as const) {
      const ids = sel.filter((f) => f.tabla === tabla && borradas.has(f.ruta)).map((f) => f.id)
      if (ids.length > 0) await tx[tabla].updateMany({ where: { tallerId: o.tallerId, id: { in: ids }, purgadaEn: null }, data: { purgadaEn: o.hoy } })
      r.borradas += ids.length
    }
    r.protegidas += sel.filter((f) => protegidas.has(f.ruta)).length
    r.fallidas += sel.filter((f) => falladas.has(f.ruta)).length
  }
  return r
}

export type ResumenPurga = { talleres: number; borradas: number; protegidas: number; fallidas: number; talleresConError: number; detalle: ResumenTaller[] }

export type DepsPurga = {
  talleres(): Promise<string[]>
  conTaller<R>(tallerId: string, fn: (tx: any) => Promise<R>, opciones?: { timeout?: number }): Promise<R>
  almacen: AlmacenArchivos
  hoy: Date
}

/** Recorre los talleres de uno en uno; el fallo de uno no frena a los demás. */
export async function purgarFotos(d: DepsPurga): Promise<ResumenPurga> {
  const detalle: ResumenTaller[] = []
  for (const tallerId of await d.talleres()) {
    try {
      detalle.push(await d.conTaller(tallerId, (tx) => purgarFotosDeTaller(tx as TxPurga, d.almacen, { tallerId, hoy: d.hoy }), { timeout: 120_000 }))
    } catch (e) {
      console.error('[purga-fotos]', tallerId, e)
      detalle.push({ tallerId, borradas: 0, protegidas: 0, fallidas: 0, omitido: 'error' })
    }
  }
  const suma = (k: 'borradas' | 'protegidas' | 'fallidas') => detalle.reduce((s, x) => s + x[k], 0)
  return {
    talleres: detalle.length, borradas: suma('borradas'), protegidas: suma('protegidas'), fallidas: suma('fallidas'),
    talleresConError: detalle.filter((x) => x.omitido === 'error').length, detalle,
  }
}
