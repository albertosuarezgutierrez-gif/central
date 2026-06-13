// Procesa UNA factura ya extraída: huella → regla → decisión → dedup → imputa.
// Compartido por el cron `scan` y el `backfill` (DRY).
import { fingerprint } from './fingerprint'
import { evaluar } from './reglas'
import { conciliar, mapeaPropiedadAlquiler } from './conciliar'
import { getRegla, existeDuplicado, insertarGasto, reforzarRegla, log, type DatosGasto } from './imputar'
import { esBooking, parseBooking, bookingFingerprint } from './booking'
import { esPresupuesto } from './clasificar'
import type { FacturaExtraida } from './extraer'

// Decide cómo tratar un documento ya extraído: Booking (por establecimiento),
// presupuesto (se omite) o factura genérica. Centraliza la lógica para scan/backfill.
export interface DocClasificado {
  factura: FacturaExtraida
  fingerprintOverride?: string
  esPresupuesto: boolean
  archivar: boolean // si conviene subir/archivar el PDF (los presupuestos no)
  esBooking: boolean
}

export function clasificarDocumento(data: FacturaExtraida, texto: string, etiqueta = ''): DocClasificado {
  if (esBooking(texto, etiqueta)) {
    const { establishmentId, factura } = parseBooking(texto)
    if (factura.total) {
      return { factura, fingerprintOverride: bookingFingerprint(establishmentId), esPresupuesto: false, archivar: true, esBooking: true }
    }
  }
  const presup = esPresupuesto(texto, etiqueta)
  return { factura: data, esPresupuesto: presup, archivar: !presup, esBooking: false }
}

export interface DriveRef {
  url?: string | null
  carpeta?: string | null
  nombre?: string | null
}

export type Decision = 'auto' | 'bandeja' | 'duplicado' | 'error' | 'omitido'

export interface ProcesarResult {
  decision: Decision
  gastoId?: string
  fingerprint: string
  total: number
  proveedor: string | null
  motivo?: string
}

export async function procesarFactura(
  data: FacturaExtraida,
  ctx: { fuente: string; drive?: DriveRef; propiedadPorDefecto?: string | null; esPresupuesto?: boolean; fingerprintOverride?: string },
): Promise<ProcesarResult> {
  const total = Number(data.total ?? 0)
  const proveedor = data.proveedor ?? null
  // Huella: la del override (p.ej. Booking por establecimiento) o la calculada.
  const fp = ctx.fingerprintOverride || fingerprint({ nif_proveedor: data.nif_proveedor, proveedor, concepto: data.concepto })

  // Presupuesto/cotización: no es un gasto → se omite (no se inserta para que no
  // tape a la factura real del mismo importe).
  if (ctx.esPresupuesto) {
    await log({ fuente: ctx.fuente, fingerprint: fp, decision: 'omitido', motivo: 'Presupuesto/cotización, no factura', payload: { total } })
    return { decision: 'omitido', fingerprint: fp, total, proveedor, motivo: 'Presupuesto/cotización' }
  }

  if (!data.fecha || !(total > 0)) {
    const motivo = 'No se pudo leer fecha/total de la factura'
    await log({ fuente: ctx.fuente, fingerprint: fp, decision: 'error', motivo, payload: data })
    return { decision: 'error', fingerprint: fp, total, proveedor, motivo }
  }

  // Duplicado → no imputar.
  if (await existeDuplicado({ fingerprint: fp, numero_factura: data.numero_factura ?? null, fecha: data.fecha, total })) {
    await log({ fuente: ctx.fuente, fingerprint: fp, decision: 'duplicado', payload: { total } })
    return { decision: 'duplicado', fingerprint: fp, total, proveedor }
  }

  const regla = await getRegla(fp)
  const veredicto = evaluar(data, regla)

  // Propiedad: regla > mapeo de alquiler por concepto > por defecto del origen
  // (p.ej. la carpeta "Personal" → prop_personal) > nada.
  const propiedad = veredicto.propiedad || mapeaPropiedadAlquiler(data.concepto || '') || ctx.propiedadPorDefecto || null
  const categoria = data.categoria || veredicto.categoria || 'OTRO'

  // Conciliación de importes: si no cuadra, no auto-imputar.
  const conc = conciliar(data)
  let decision = veredicto.decision
  let motivo = veredicto.motivo
  if (decision === 'auto' && !conc.ok && (data.base_imponible != null || data.irpf != null)) {
    decision = 'bandeja'
    motivo = `Descuadre: base+IVA−IRPF=${conc.esperado} ≠ total ${total}`
  }

  const datos: DatosGasto = {
    fecha: data.fecha,
    proveedor,
    nif_proveedor: data.nif_proveedor ?? null,
    numero_factura: data.numero_factura ?? null,
    concepto: data.concepto ?? null,
    categoria,
    propiedad,
    base_imponible: data.base_imponible ?? null,
    iva: data.iva ?? null,
    iva_porcentaje: data.iva_porcentaje ?? null,
    irpf: data.irpf ?? null,
    irpf_porcentaje: data.irpf_porcentaje ?? null,
    total,
    fingerprint: fp,
    drive_url: ctx.drive?.url ?? null,
    carpeta_drive: ctx.drive?.carpeta ?? null,
    drive_file_name: ctx.drive?.nombre ?? null,
    raw_extraction: data,
  }

  const revisado = decision === 'auto'
  const gastoId = await insertarGasto(datos, {
    revisado,
    origen: ctx.fuente,
    confianza: veredicto.confianza,
    motivo_revision: revisado ? null : motivo ?? null,
  })

  if (revisado) await reforzarRegla(datos)
  await log({ fuente: ctx.fuente, fingerprint: fp, gasto_id: gastoId, decision, confianza: veredicto.confianza, motivo })

  return { decision: revisado ? 'auto' : 'bandeja', gastoId, fingerprint: fp, total, proveedor, motivo }
}
