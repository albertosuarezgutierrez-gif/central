/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// Facturación VeriFactu del taller (SERVIDOR). Todo dentro de UNA transacción `conTaller()` (RLS por taller).
//
// Concurrencia (el bug de ia-rest era soltar el candado ANTES del INSERT): lo PRIMERO de cada operación es
// `pg_advisory_xact_lock(hashtext('factura:<taller>'))`, candado de TRANSACCIÓN: no se suelta hasta el COMMIT/ROLLBACK, es decir,
// después de insertar factura + líneas + registro + contador. Dos emisiones a la vez del mismo taller se serializan: la segunda lee
// el contador y el último eslabón YA confirmados. Con READ COMMITTED cada sentencia toma foto nueva tras obtener el candado.
// En BD, además: trigger de correlatividad (número = último + 1, fecha que no retrocede), trigger de cadena (secuencia y huella
// anterior) que toman el mismo candado, índice único de una factura viva por OT, y triggers de inmutabilidad.
//
// Envío a la AEAT: NO se hace aquí. Todo nace `no_enviado`; `aplicarRespuestaEnvio` traduce la respuesta de un transporte inyectado
// (hoy `transporteDesactivado`, que no envía nada). «incierto» no se reintenta a ciegas.
import {
  construirRegistroAlta, construirRegistroAnulacion, fechaHoraHuso, urlQrCotejo, validarNifCif, xmlSuministroLR,
  type DatosRegistroAlta, type EslabonAnterior, type IdFactura, type RespuestaTransporte, type SistemaInformatico,
} from '@central/core-fiscal'
import {
  construirFacturaDesdeOt, construirRectificativa, lineasAbonoTotal, numeroFactura, planCobros, transicionarOt,
  type CausaRectificativa, type CobroNuevo, type EstadoEnvioAeat, type EstadoOt, type GrupoIva, type LineaFactura,
  type LineaOtFacturable, type TotalesFactura,
} from '@central/module-taller'
import { encolarAnulacion, encolarCobro, encolarFactura, type TxOutbox } from './hechos-outbox.ts'
import { CONFIG_SIF, sistemaInformatico, SistemaSinConfigurarError, type ConfigSif } from './sistema-informatico.ts'

type Delegado = {
  findMany(a?: any): Promise<any[]>
  findFirst(a?: any): Promise<any>
  findUnique(a: any): Promise<any>
  create(a: any): Promise<any>
  update(a: any): Promise<any>
}
export type TxFacturas = {
  $executeRaw(s: TemplateStringsArray, ...v: unknown[]): Promise<unknown>
  taller: Delegado
  ordenTrabajo: Delegado
  recepcion: Delegado
  cliente: Delegado
  vehiculo: Delegado
  otLinea: Delegado
  serieFactura: Delegado
  medioCobro: Delegado
  contadorFactura: Delegado
  factura: Delegado
  facturaLinea: Delegado
  registroVerifactu: Delegado
  cobro: Delegado
  hechoPendiente: Delegado
}

export type Resultado<T> = ({ ok: true } & T) | { ok: false; motivo: string }
export interface DepsFacturas { sif?: ConfigSif }

/** Estados de OT desde los que se factura (terminado → facturado; entregado sin factura; facturado con la factura anulada). */
export const ESTADOS_FACTURABLES: readonly EstadoOt[] = ['terminado', 'entregado', 'facturado']

/** Error que DEBE deshacer la transacción (algo ya escrito no cuadra). */
export class ErrorFacturacion extends Error {
  constructor(m: string) { super(m); this.name = 'ErrorFacturacion' }
}

const n = (v: unknown) => Number(v)
const iso = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10))
const comoFecha = (f: string) => new Date(`${f}T00:00:00.000Z`) // columna `date`
const domicilio = (x: any): string | null => {
  const s = [x?.via, x?.numero, x?.cp, x?.municipio, x?.provincia].map((v) => (v ?? '').toString().trim()).filter(Boolean)
  return x?.via && x?.cp ? s.join(', ') : null
}
export const nifValido = (nif: string) => validarNifCif(nif).ok && nif.length === 9

async function candado(tx: TxFacturas, tallerId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'factura:' + tallerId}))`
}

function sif(deps: DepsFacturas, tallerId: string): SistemaInformatico | string {
  try {
    return sistemaInformatico(deps.sif ?? CONFIG_SIF, tallerId)
  } catch (e) {
    if (e instanceof SistemaSinConfigurarError) return e.message
    throw e
  }
}

async function emisorDe(tx: TxFacturas, tallerId: string): Promise<Resultado<{ razon: string; nif: string; domicilio: string | null }>> {
  const t = await tx.taller.findFirst({ where: { id: tallerId } })
  if (!t) return { ok: false, motivo: 'taller no encontrado' }
  const nif = (t.nif ?? '').trim().toUpperCase()
  if (!nif) return { ok: false, motivo: 'falta el NIF del taller (Ajustes): sin él no se factura' }
  if (!nifValido(nif)) return { ok: false, motivo: `el NIF del taller (${nif}) no es válido` }
  return { ok: true, razon: t.razonSocial, nif, domicilio: domicilio(t) }
}

/** Último eslabón de la cadena del taller (o null si no hay ninguno). */
async function ultimoEslabon(tx: TxFacturas, tallerId: string): Promise<{ eslabon: EslabonAnterior | null; secuencia: number }> {
  const u = await tx.registroVerifactu.findFirst({ where: { tallerId }, orderBy: { secuencia: 'desc' } })
  if (!u) return { eslabon: null, secuencia: 0 }
  return {
    eslabon: { idEmisor: u.idEmisor, numSerie: u.numSerie, fechaExpedicion: iso(u.fechaExpedicion), huella: u.huella },
    secuencia: n(u.secuencia),
  }
}

/** Siguiente número de (serie, año) SIN huecos: contador comprobado contra la última factura, dentro del candado. */
async function siguienteNumero(tx: TxFacturas, o: { tallerId: string; serieId: string; anio: number; fecha: string }): Promise<Resultado<{ numero: number }>> {
  const clave = { tallerId: o.tallerId, serieId: o.serieId, anio: o.anio }
  const c = await tx.contadorFactura.findUnique({ where: { tallerId_serieId_anio: clave } })
  const ultima = await tx.factura.findFirst({ where: clave, orderBy: { numero: 'desc' } })
  const ultimo = c ? n(c.ultimoNumero) : 0
  if ((ultima ? n(ultima.numero) : 0) !== ultimo) {
    throw new ErrorFacturacion(`contador de la serie desincronizado (contador ${ultimo}, última factura ${ultima?.numero ?? 0})`)
  }
  if (ultima && iso(ultima.fechaExpedicion) > o.fecha) {
    return { ok: false, motivo: `la fecha ${o.fecha} es anterior a la de la última factura de la serie (${iso(ultima.fechaExpedicion)}): revisa el reloj` }
  }
  const numero = ultimo + 1
  if (c) await tx.contadorFactura.update({ where: { tallerId_serieId_anio: clave }, data: { ultimoNumero: numero } })
  else await tx.contadorFactura.create({ data: { ...clave, ultimoNumero: numero } })
  return { ok: true, numero }
}

const desgloseAeat = (d: GrupoIva[]) =>
  d.map((g) => ({ tipoImpositivo: g.ivaPuntosBasicos / 100, baseCentimos: g.baseCent, cuotaCentimos: g.cuotaCent }))

interface AltaFactura {
  tallerId: string
  otId: string
  usuarioId: string | null
  ahora: Date
  serie: { id: string; codigo: string; prefijo: string }
  tipo: string
  lineas: LineaFactura[]
  totales: TotalesFactura
  destinatario: { nombre: string; nif: string } | null
  cliente: { id: string | null; nombre: string | null; domicilio: string | null }
  descripcion: string
  rectificativa: { id: string; modo: 'S' | 'I'; original: IdFactura; motivo: string; importe: { baseCent: number; cuotaCent: number } | null } | null
}

/** Numera, construye el registro de alta encadenado y escribe factura + líneas + registro. Debe ir bajo `candado`. */
async function escribirAlta(tx: TxFacturas, a: AltaFactura, emisor: { razon: string; nif: string; domicilio: string | null }, sistema: SistemaInformatico, cfg: ConfigSif):
  Promise<Resultado<{ facturaId: string; numSerie: string; tipo: string; totalCent: number }>> {
  const fhh = fechaHoraHuso(a.ahora)
  const fecha = fhh.slice(0, 10)
  const anio = Number(fecha.slice(0, 4))
  const num = await siguienteNumero(tx, { tallerId: a.tallerId, serieId: a.serie.id, anio, fecha })
  if (!num.ok) return num
  const numSerie = numeroFactura(a.serie.prefijo, anio, num.numero)
  const { eslabon, secuencia } = await ultimoEslabon(tx, a.tallerId)
  const datos: DatosRegistroAlta = {
    factura: { idEmisor: emisor.nif, numSerie, fechaExpedicion: fecha },
    nombreRazonEmisor: emisor.razon,
    tipoFactura: a.tipo as DatosRegistroAlta['tipoFactura'],
    descripcion: a.descripcion,
    desglose: desgloseAeat(a.totales.desglose),
    destinatario: a.destinatario ? { nombreRazon: a.destinatario.nombre, nif: a.destinatario.nif } : null,
    rectificativa: a.rectificativa
      ? {
        tipo: a.rectificativa.modo, facturas: [a.rectificativa.original],
        ...(a.rectificativa.importe ? { importeRectificado: { baseCentimos: a.rectificativa.importe.baseCent, cuotaCentimos: a.rectificativa.importe.cuotaCent } } : {}),
      }
      : null,
    anterior: eslabon,
    fechaHoraHusoGenRegistro: fhh,
  }
  const reg = construirRegistroAlta(datos)
  if (reg.importeTotalCentimos !== a.totales.totalCent || reg.cuotaTotalCentimos !== a.totales.cuotaIvaCent) {
    throw new ErrorFacturacion('los totales del registro VeriFactu no cuadran con los de la factura')
  }
  const xml = xmlSuministroLR({ obligado: { nombreRazon: emisor.razon, nif: emisor.nif }, registros: [reg], sistema })
  const qrUrl = urlQrCotejo({ nif: emisor.nif, numSerie, fechaExpedicion: fecha, importeTotalCentimos: a.totales.totalCent, verifactu: cfg.verifactu, entorno: cfg.entorno })

  const f = await tx.factura.create({
    data: {
      tallerId: a.tallerId, otId: a.otId, serieId: a.serie.id, serieCodigo: a.serie.codigo, anio, numero: num.numero, numSerie,
      fechaExpedicion: comoFecha(fecha), emitidaEn: a.ahora, emitidaPor: a.usuarioId, tipo: a.tipo,
      tipoRectificativa: a.rectificativa?.modo ?? null, rectificadaId: a.rectificativa?.id ?? null,
      motivoRectificacion: a.rectificativa?.motivo ?? null,
      baseRectificadaCent: a.rectificativa?.importe?.baseCent ?? null, cuotaRectificadaCent: a.rectificativa?.importe?.cuotaCent ?? null,
      emisorRazonSocial: emisor.razon, emisorNif: emisor.nif, emisorDomicilio: emisor.domicilio,
      clienteId: a.cliente.id, clienteNombre: a.cliente.nombre, clienteNif: a.destinatario?.nif ?? null, clienteDomicilio: a.cliente.domicilio,
      descripcion: a.descripcion, desgloseIva: a.totales.desglose,
      baseCent: a.totales.baseCent, cuotaIvaCent: a.totales.cuotaIvaCent, totalCent: a.totales.totalCent,
      huella: reg.huella, huellaAnterior: eslabon?.huella ?? null, fechaHoraHuso: fhh, qrUrl, xml,
      estado: 'emitida', estadoEnvio: 'no_enviado',
    },
  })
  for (const l of a.lineas) {
    await tx.facturaLinea.create({
      data: {
        tallerId: a.tallerId, facturaId: f.id, orden: l.orden, otLineaId: l.otLineaId, tipo: l.tipo, descripcion: l.descripcion,
        cantidad: l.cantidad, unidad: l.unidad, baseCent: l.baseCent, ivaCodigo: l.ivaCodigo, ivaPuntosBasicos: l.ivaPuntosBasicos,
      },
    })
  }
  await tx.registroVerifactu.create({
    data: {
      tallerId: a.tallerId, facturaId: f.id, tipo: 'alta', secuencia: secuencia + 1, idEmisor: emisor.nif, numSerie,
      fechaExpedicion: comoFecha(fecha), huella: reg.huella, huellaAnterior: eslabon?.huella ?? null, fechaHoraHuso: fhh, xml,
      estadoEnvio: 'no_enviado',
    },
  })
  // Outbox contabilidad: MISMA transacción (si algo posterior lanza, el hecho se deshace con la factura). Sin HTTP aquí.
  await encolarFactura(tx as TxOutbox, {
    tallerId: a.tallerId, facturaId: f.id,
    factura: { numSerie, fechaExpedicion: fecha, tipo: a.tipo, desglose: a.totales.desglose, clienteNombre: a.cliente.nombre, tipoRectificativa: a.rectificativa?.modo ?? null },
  })
  return { ok: true, facturaId: f.id, numSerie, tipo: a.tipo, totalCent: a.totales.totalCent }
}

export interface CobroSolicitado { medioCodigo: string; importeCent: number }

async function resolverCobros(tx: TxFacturas, tallerId: string, cobros: readonly CobroSolicitado[]): Promise<Resultado<{ nuevos: (CobroNuevo & { medioId: string })[] }>> {
  const nuevos: (CobroNuevo & { medioId: string })[] = []
  for (const c of cobros) {
    const m = await tx.medioCobro.findFirst({ where: { tallerId, codigo: c.medioCodigo, activo: true } })
    if (!m) return { ok: false, motivo: `medio de cobro «${c.medioCodigo}» no configurado o inactivo` }
    nuevos.push({ medioCodigo: m.codigo, esEfectivo: m.esEfectivo === true, importeCent: c.importeCent, medioId: m.id })
  }
  return { ok: true, nuevos }
}

async function escribirCobros(tx: TxFacturas, o: { tallerId: string; facturaId: string; numSerie: string; totalCent: number; usuarioId: string | null; ahora: Date; cobros: readonly CobroSolicitado[] }):
  Promise<Resultado<{ pendienteCent: number }>> {
  const r = await resolverCobros(tx, o.tallerId, o.cobros)
  if (!r.ok) return r
  const ya = (await tx.cobro.findMany({ where: { tallerId: o.tallerId, facturaId: o.facturaId } }))
    .map((c) => ({ importeCent: n(c.importeCent), esEfectivo: c.esEfectivo === true }))
  const plan = planCobros({ totalCent: o.totalCent, yaCobrados: ya, nuevos: r.nuevos })
  if (!plan.ok) return plan
  for (const c of r.nuevos) {
    const creado = await tx.cobro.create({
      data: {
        tallerId: o.tallerId, facturaId: o.facturaId, medioCobroId: c.medioId, medioCodigo: c.medioCodigo, esEfectivo: c.esEfectivo,
        importeCent: c.importeCent, cobradoEn: o.ahora, registradoPor: o.usuarioId, justificante: null,
      },
    })
    await encolarCobro(tx as TxOutbox, {
      tallerId: o.tallerId, facturaId: o.facturaId,
      cobro: { id: creado.id, fecha: fechaHoraHuso(o.ahora).slice(0, 10), importeCent: c.importeCent, medioCodigo: c.medioCodigo, numSerie: o.numSerie, esEfectivo: c.esEfectivo },
    })
  }
  return { ok: true, pendienteCent: plan.pendienteCent }
}

const aLineaOt = (l: any): LineaOtFacturable => ({
  id: l.id, tipo: l.tipo, descripcion: l.descripcion, cantidad: n(l.cantidad), unidad: l.unidad, baseCent: n(l.baseCent),
  ivaCodigo: l.ivaCodigo, ivaPuntosBasicos: n(l.ivaPuntosBasicos), origen: l.origen, aceptadaEn: l.aceptadaEn ?? null,
})

/** Lo que se facturaría ahora (para la pantalla de la OT). No escribe nada. */
export async function previsualizarFactura(tx: TxFacturas, o: { tallerId: string; otId: string }) {
  const ot = await tx.ordenTrabajo.findFirst({ where: { tallerId: o.tallerId, id: o.otId } })
  if (!ot) return { ok: false as const, motivo: 'orden no encontrada' }
  const rec = await tx.recepcion.findFirst({ where: { tallerId: o.tallerId, id: ot.recepcionId } })
  const cli = rec ? await tx.cliente.findFirst({ where: { tallerId: o.tallerId, id: rec.clienteId } }) : null
  const lineas = (await tx.otLinea.findMany({ where: { tallerId: o.tallerId, otId: o.otId } })).map(aLineaOt)
  return construirFacturaDesdeOt({ lineas, cliente: { nombre: cli?.nombre ?? null, nif: cli?.nif ?? null, domicilio: domicilio(cli) }, nifValido })
}

/** Factura viva (ordinaria emitida) de una OT, o null. */
export async function facturaVivaDeOt(tx: Pick<TxFacturas, 'factura'>, tallerId: string, otId: string) {
  const fs = await tx.factura.findMany({ where: { tallerId, otId, estado: 'emitida' } })
  return fs.find((f) => f.tipo === 'F1' || f.tipo === 'F2') ?? null
}

/**
 * EMITIR la factura de una OT (y, si se piden, sus cobros) en la transacción en curso. Validaciones → ok:false sin escribir;
 * cualquier incoherencia tras empezar a escribir LANZA (rollback: ni número consumido ni eslabón).
 */
export async function emitirFactura(
  tx: TxFacturas,
  o: { tallerId: string; otId: string; usuarioId: string | null; ahora: Date; cobros?: readonly CobroSolicitado[] },
  deps: DepsFacturas = {},
): Promise<Resultado<{ facturaId: string; numSerie: string; tipo: string; totalCent: number; pendienteCent: number | null }>> {
  await candado(tx, o.tallerId)
  const sistema = sif(deps, o.tallerId)
  if (typeof sistema === 'string') return { ok: false, motivo: sistema }
  const emisor = await emisorDe(tx, o.tallerId)
  if (!emisor.ok) return emisor

  const ot = await tx.ordenTrabajo.findFirst({ where: { tallerId: o.tallerId, id: o.otId } })
  if (!ot) return { ok: false, motivo: 'orden no encontrada' }
  if (!ESTADOS_FACTURABLES.includes(ot.estado)) return { ok: false, motivo: `no se factura una orden en estado «${ot.estado}» (tiene que estar terminada)` }
  const viva = await facturaVivaDeOt(tx, o.tallerId, o.otId)
  if (viva) return { ok: false, motivo: `la orden ya tiene la factura ${viva.numSerie}` }
  const rec = await tx.recepcion.findFirst({ where: { tallerId: o.tallerId, id: ot.recepcionId } })
  if (!rec || rec.firmadoEn == null) return { ok: false, motivo: 'no se factura sin la recepción firmada por el cliente' }
  const cli = await tx.cliente.findFirst({ where: { tallerId: o.tallerId, id: rec.clienteId } })
  const veh = await tx.vehiculo.findFirst({ where: { tallerId: o.tallerId, id: ot.vehiculoId } })
  const lineas = (await tx.otLinea.findMany({ where: { tallerId: o.tallerId, otId: o.otId } })).map(aLineaOt)
  const fac = construirFacturaDesdeOt({ lineas, cliente: { nombre: cli?.nombre ?? null, nif: cli?.nif ?? null, domicilio: domicilio(cli) }, nifValido })
  if (!fac.ok) return fac
  const serie = await tx.serieFactura.findFirst({ where: { tallerId: o.tallerId, porDefecto: true, rectificativa: false } })
  if (!serie) return { ok: false, motivo: 'falta la serie de facturas por defecto (Ajustes)' }
  if (o.cobros?.length) {
    // Se valida ANTES de numerar: un cobro imposible no debe dejar una factura a medias.
    const r = await resolverCobros(tx, o.tallerId, o.cobros)
    if (!r.ok) return r
    const plan = planCobros({ totalCent: fac.totales.totalCent, yaCobrados: [], nuevos: r.nuevos })
    if (!plan.ok) return plan
  }

  const alta = await escribirAlta(tx, {
    tallerId: o.tallerId, otId: o.otId, usuarioId: o.usuarioId, ahora: o.ahora,
    serie: { id: serie.id, codigo: serie.codigo, prefijo: serie.prefijo }, tipo: fac.tipo, lineas: fac.lineas, totales: fac.totales,
    destinatario: fac.destinatario,
    cliente: { id: cli?.id ?? null, nombre: (cli?.nombre ?? '').trim() || null, domicilio: domicilio(cli) },
    descripcion: `Reparación y mantenimiento del vehículo ${veh?.matricula ?? ''} (OT ${ot.numero})`.replace(/\s+/g, ' ').trim(),
    rectificativa: null,
  }, emisor, sistema, deps.sif ?? CONFIG_SIF)
  if (!alta.ok) return alta

  if (ot.estado === 'terminado') {
    const t = transicionarOt('terminado', 'facturado', { recepcionFirmada: true, facturaEmitida: true })
    if (!t.ok) throw new ErrorFacturacion(t.motivo)
    await tx.ordenTrabajo.update({ where: { id: ot.id }, data: { estado: 'facturado' } })
  }
  let pendienteCent: number | null = null
  if (o.cobros?.length) {
    const c = await escribirCobros(tx, { tallerId: o.tallerId, facturaId: alta.facturaId, numSerie: alta.numSerie, totalCent: alta.totalCent, usuarioId: o.usuarioId, ahora: o.ahora, cobros: o.cobros })
    if (!c.ok) throw new ErrorFacturacion(c.motivo)
    pendienteCent = c.pendienteCent
  }
  return { ...alta, pendienteCent }
}

/** Registrar cobros (parciales o divididos) de una factura emitida. */
export async function registrarCobros(
  tx: TxFacturas, o: { tallerId: string; facturaId: string; usuarioId: string | null; ahora: Date; cobros: readonly CobroSolicitado[] },
): Promise<Resultado<{ pendienteCent: number }>> {
  await candado(tx, o.tallerId)
  const f = await tx.factura.findFirst({ where: { tallerId: o.tallerId, id: o.facturaId } })
  if (!f) return { ok: false, motivo: 'factura no encontrada' }
  if (f.estado !== 'emitida') return { ok: false, motivo: 'la factura está anulada' }
  return escribirCobros(tx, { tallerId: o.tallerId, facturaId: f.id, numSerie: f.numSerie, totalCent: n(f.totalCent), usuarioId: o.usuarioId, ahora: o.ahora, cobros: o.cobros })
}

/** ANULAR: registro de anulación encadenado y estado `anulada`. Con cobros no se anula (se rectifica). */
export async function anularFactura(
  tx: TxFacturas, o: { tallerId: string; facturaId: string; motivo: string; ahora: Date }, deps: DepsFacturas = {},
): Promise<Resultado<{ numSerie: string }>> {
  await candado(tx, o.tallerId)
  const motivo = o.motivo.trim()
  if (motivo.length < 5) return { ok: false, motivo: 'explica el motivo de la anulación' }
  const sistema = sif(deps, o.tallerId)
  if (typeof sistema === 'string') return { ok: false, motivo: sistema }
  const f = await tx.factura.findFirst({ where: { tallerId: o.tallerId, id: o.facturaId } })
  if (!f) return { ok: false, motivo: 'factura no encontrada' }
  if (f.estado !== 'emitida') return { ok: false, motivo: 'la factura ya está anulada' }
  const cobros = await tx.cobro.findMany({ where: { tallerId: o.tallerId, facturaId: f.id } })
  if (cobros.length) return { ok: false, motivo: 'la factura tiene cobros: no se anula, se hace una rectificativa' }
  const { eslabon, secuencia } = await ultimoEslabon(tx, o.tallerId)
  const fhh = fechaHoraHuso(o.ahora)
  const reg = construirRegistroAnulacion({
    facturaAnulada: { idEmisor: f.emisorNif, numSerie: f.numSerie, fechaExpedicion: iso(f.fechaExpedicion) },
    anterior: eslabon, fechaHoraHusoGenRegistro: fhh,
  })
  const xml = xmlSuministroLR({ obligado: { nombreRazon: f.emisorRazonSocial, nif: f.emisorNif }, registros: [reg], sistema })
  await tx.registroVerifactu.create({
    data: {
      tallerId: o.tallerId, facturaId: f.id, tipo: 'anulacion', secuencia: secuencia + 1, idEmisor: f.emisorNif, numSerie: f.numSerie,
      fechaExpedicion: f.fechaExpedicion, huella: reg.huella, huellaAnterior: eslabon?.huella ?? null, fechaHoraHuso: fhh, xml,
      estadoEnvio: 'no_enviado',
    },
  })
  await encolarAnulacion(tx as TxOutbox, { tallerId: o.tallerId, facturaId: f.id, numSerie: f.numSerie })
  await tx.factura.update({ where: { id: f.id }, data: { estado: 'anulada', anuladaEn: o.ahora, motivoAnulacion: motivo } })
  return { ok: true, numSerie: f.numSerie }
}

const aLineaFactura = (l: any): LineaFactura => ({
  orden: n(l.orden), otLineaId: l.otLineaId ?? null, tipo: l.tipo, descripcion: l.descripcion, cantidad: n(l.cantidad), unidad: l.unidad,
  baseCent: n(l.baseCent), ivaCodigo: l.ivaCodigo, ivaPuntosBasicos: n(l.ivaPuntosBasicos),
})

/**
 * RECTIFICATIVA de una factura emitida, en la serie rectificativa. `abono_total` = por diferencias con todas las líneas en negativo;
 * con `lineas` explícitas: por diferencias (I) o por sustitución (S).
 */
export async function rectificarFactura(
  tx: TxFacturas,
  o: {
    tallerId: string; facturaId: string; usuarioId: string | null; ahora: Date; motivo: string
    modo: 'abono_total' | 'diferencias' | 'sustitucion'; lineas?: LineaFactura[]; causa?: CausaRectificativa
  },
  deps: DepsFacturas = {},
): Promise<Resultado<{ facturaId: string; numSerie: string; tipo: string; totalCent: number }>> {
  await candado(tx, o.tallerId)
  const motivo = o.motivo.trim()
  if (motivo.length < 5) return { ok: false, motivo: 'explica el motivo de la rectificación' }
  const sistema = sif(deps, o.tallerId)
  if (typeof sistema === 'string') return { ok: false, motivo: sistema }
  const emisor = await emisorDe(tx, o.tallerId)
  if (!emisor.ok) return emisor
  const f = await tx.factura.findFirst({ where: { tallerId: o.tallerId, id: o.facturaId } })
  if (!f) return { ok: false, motivo: 'factura no encontrada' }
  const lineasOrig = (await tx.facturaLinea.findMany({ where: { tallerId: o.tallerId, facturaId: f.id }, orderBy: { orden: 'asc' } })).map(aLineaFactura)
  const original = {
    tipo: f.tipo, estado: f.estado, lineas: lineasOrig,
    totales: { desglose: f.desgloseIva as GrupoIva[], baseCent: n(f.baseCent), cuotaIvaCent: n(f.cuotaIvaCent), totalCent: n(f.totalCent) },
  }
  const r = construirRectificativa({
    original,
    modo: o.modo === 'sustitucion' ? 'sustitucion' : 'diferencias',
    lineas: o.modo === 'abono_total' ? lineasAbonoTotal(lineasOrig) : (o.lineas ?? []),
    causa: o.causa ?? 'R1',
  })
  if (!r.ok) return r
  if (o.modo === 'abono_total') {
    const cobrado = (await tx.cobro.findMany({ where: { tallerId: o.tallerId, facturaId: f.id } })).reduce((s, c) => s + n(c.importeCent), 0)
    if (cobrado > 0) return { ok: false, motivo: 'la factura tiene cobros: devuelve el dinero y regístralo antes del abono total' }
  }
  const serie = await tx.serieFactura.findFirst({ where: { tallerId: o.tallerId, rectificativa: true } })
  if (!serie) return { ok: false, motivo: 'falta la serie de rectificativas (Ajustes)' }
  return escribirAlta(tx, {
    tallerId: o.tallerId, otId: f.otId, usuarioId: o.usuarioId, ahora: o.ahora,
    serie: { id: serie.id, codigo: serie.codigo, prefijo: serie.prefijo }, tipo: r.tipo, lineas: r.lineas, totales: r.totales,
    destinatario: r.tipo === 'R5' ? null : { nombre: f.clienteNombre, nif: f.clienteNif },
    cliente: { id: f.clienteId ?? null, nombre: f.clienteNombre ?? null, domicilio: f.clienteDomicilio ?? null },
    descripcion: `Rectificación de la factura ${f.numSerie}: ${motivo}`.slice(0, 500),
    rectificativa: {
      id: f.id, modo: r.modo, motivo,
      original: { idEmisor: f.emisorNif, numSerie: f.numSerie, fechaExpedicion: iso(f.fechaExpedicion) },
      importe: r.importeRectificado,
    },
  }, emisor, sistema, deps.sif ?? CONFIG_SIF)
}

/** Respuesta del transporte → estado de envío. `no_enviado` no cambia nada (nunca llegó); `incierto` NO se reintenta solo. */
export function estadoEnvioDe(r: RespuestaTransporte): EstadoEnvioAeat {
  switch (r.estado) {
    case 'aceptado':
    case 'aceptado_con_errores':
      return 'enviado'
    case 'rechazado':
      return 'rechazado'
    case 'incierto':
      return 'incierto'
    case 'no_enviado':
      return 'no_enviado'
  }
}

/**
 * Anota la respuesta del transporte (inyectado; hoy `transporteDesactivado`) en el registro y, si es un alta, en su factura.
 * `no_enviado` no escribe nada: el registro sigue pendiente de envío.
 */
export async function aplicarRespuestaEnvio(
  tx: Pick<TxFacturas, 'registroVerifactu' | 'factura'>, o: { tallerId: string; registroId: string; respuesta: RespuestaTransporte },
): Promise<EstadoEnvioAeat> {
  const estado = estadoEnvioDe(o.respuesta)
  if (estado === 'no_enviado') return estado
  const r = await tx.registroVerifactu.findFirst({ where: { tallerId: o.tallerId, id: o.registroId } })
  if (!r) throw new ErrorFacturacion('registro VeriFactu no encontrado')
  await tx.registroVerifactu.update({ where: { id: r.id }, data: { estadoEnvio: estado } })
  if (r.tipo === 'alta') await tx.factura.update({ where: { id: r.facturaId }, data: { estadoEnvio: estado } })
  return estado
}
