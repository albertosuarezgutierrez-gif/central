// Procesa UNA factura ya extraída: huella → regla → decisión → dedup → imputa.
// Compartido por el cron `scan` y el `backfill` (DRY).
import { fingerprint, huellasDe } from './fingerprint'
import { evaluar } from './reglas'
import { conciliar, mapeaPropiedadAlquiler } from './conciliar'
import { getRegla, existeDuplicado, insertarGasto, reforzarRegla, escribirTitular, log, type DatosGasto } from './imputar'
import { asignarTitular } from './asignar-titular'
import { contextoTitularSiAplicado } from './contexto-titular'
import { esBooking, parseBooking, bookingFingerprint } from './booking'
import { esPresupuesto, esPresupuestoExtraido } from './clasificar'
import { pareceIngresoDeCorreduria } from './no-es-gasto'
import { esDocumentoPolizaCliente, mencionaAseguradoraPropia, MOTIVO_POLIZA_CLIENTE, MOTIVO_POLIZA_DUDA } from './poliza-cliente'
import { esFacturaComisionPortal, MOTIVO_COMISION_PORTAL } from './portal-comision'
import { evaluaReceptor, nifProveedorEsNuestro, type Titular } from './receptor'
import { decidirPorTipo } from './tipo-documento'
import { avisosDeLectura } from './revision-lectura'
import { leerLiquidacion, claseAllianzPorNombre, esLiquidacionInequivoca, type LiquidacionIA } from '../correduria/liquidacion-doc'
import { guardarLiquidacionDoc } from '../correduria/liquidacion-doc-db'
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
  const presup = esPresupuestoExtraido(data as { tipo_documento?: unknown; concepto?: string | null }) || esPresupuesto(texto, etiqueta)
  return { factura: data, esPresupuesto: presup, archivar: !presup, esBooking: false }
}

export interface DriveRef {
  url?: string | null
  carpeta?: string | null
  nombre?: string | null
}

export type Decision = 'auto' | 'bandeja' | 'duplicado' | 'error' | 'omitido' | 'ajena'

export interface ProcesarResult {
  decision: Decision
  gastoId?: string
  fingerprint: string
  total: number
  proveedor: string | null
  motivo?: string
  /** A nombre de quién venía, cuando se descarta por ser de un tercero. */
  receptor?: string | null
}

export async function procesarFactura(
  data: FacturaExtraida,
  ctx: { fuente: string; drive?: DriveRef; propiedadPorDefecto?: string | null; esPresupuesto?: boolean; fingerprintOverride?: string; esBooking?: boolean; titulares?: Titular[]; huellaDoc?: string; nombreArchivo?: string | null },
): Promise<ProcesarResult> {
  const total = Number(data.total ?? 0)
  const proveedor = data.proveedor ?? null
  const titulares = ctx.titulares ?? []

  // Si el "NIF del proveedor" es en realidad uno de los NUESTROS, el extractor confundió emisor
  // y receptor. No sirve para la huella: la usarían TODOS los proveedores a la vez, ninguno
  // aprendería regla y el dedup dejaría de distinguirlos. Se ignora y se cae al nombre.
  const nifEmisorFiable = !nifProveedorEsNuestro(data.nif_proveedor, titulares)
  // Huella: la del override (p.ej. Booking por establecimiento) o la calculada.
  // Sin proveedor ni NIF la huella del proveedor sale '' y el dedup no comparaba nada (caso WhatsApp
  // 644,81 € ×2, 03/11/2026): entonces se guarda la huella del DOCUMENTO (`huella-documento.ts`).
  const fp = ctx.fingerprintOverride || fingerprint({
    nif_proveedor: nifEmisorFiable ? data.nif_proveedor : null,
    proveedor,
    concepto: data.concepto,
  }) || ctx.huellaDoc || ''

  // Presupuesto/cotización: no es un gasto → se omite (no se inserta para que no
  // tape a la factura real del mismo importe).
  if (ctx.esPresupuesto) {
    await log({ fuente: ctx.fuente, fingerprint: fp, decision: 'omitido', motivo: 'Presupuesto/cotización, no factura', payload: { total } })
    return { decision: 'omitido', fingerprint: fp, total, proveedor, motivo: 'Presupuesto/cotización' }
  }

  // Tipo de documento (vocabulario cerrado, `tipo-documento.ts`). Presupuesto, proforma, solicitud,
  // liquidación de comisiones, resumen de pagos o aviso → omitido y registrado. `null`/'otro' → sigue,
  // pero forzado a la bandeja con aviso (más abajo): nunca confirmable en silencio (03/11/2026).
  // Booking trae su factura del parser determinista, no de la IA: su tipo no se juzga aquí.
  let porTipo = ctx.esBooking ? null : decidirPorTipo(data.tipo_documento, total)
  // Los seguros PROPIOS (lista blanca Occident/ASISA) los media la propia correduría: su recibo lleva
  // código de mediador y la IA podría llamarlo «liquidación». No se omite: a la bandeja con aviso.
  // Excepción: si el bloque `liquidacion` trae retención de IRPF y su aritmética cuadra, es una
  // liquidación al mediador sin duda (un recibo de prima propio no lleva retención): sigue omitiéndose.
  const nombreArchivo = ctx.nombreArchivo ?? ctx.drive?.nombre ?? null
  if (porTipo?.accion === 'omitir' && porTipo.tipo === 'liquidacion_comisiones'
      && mencionaAseguradoraPropia(`${proveedor ?? ''} ${data.concepto ?? ''}`)
      && !esLiquidacionInequivoca(leerLiquidacion(entradaLiquidacion(data), nombreArchivo))) {
    porTipo = { accion: 'revisar', tipo: porTipo.tipo, aviso: 'La IA lo lee como liquidación de comisiones, pero es de una aseguradora de tus seguros propios: confirma si es gasto' }
  }
  if (porTipo?.accion === 'omitir') {
    // Liquidación/extracto de comisiones: no es gasto, pero bruto y retención van a la renta → se
    // GUARDAN (`comisiones_liquidacion_docs`) para el libro de comisiones. Antes se perdían.
    const liq = porTipo.tipo === 'liquidacion_comisiones' ? await capturarLiquidacion(data, ctx, nombreArchivo) : null
    const motivo = liq ? `${porTipo.motivo} · ${liq}` : porTipo.motivo
    await log({ fuente: ctx.fuente, fingerprint: fp, decision: 'omitido', motivo, payload: { total, tipo_documento: porTipo.tipo, drive_url: ctx.drive?.url ?? null } })
    return { decision: 'omitido', fingerprint: fp, total, proveedor, motivo }
  }

  // Documento que NO es un gasto (dictado por Alberto, 29-30/08/2026): la liquidación de un
  // mediador de seguros es un INGRESO de la correduría, y la comisión de Booking/Airbnb ya está
  // descontada del ingreso NETO de `incomes` — darla de alta y confirmarla la restaría dos veces.
  // Se omite ANTES de imputar (el PDF se archiva igual en Drive aguas arriba); queda rastro en el
  // log y en el recuento `omitidos` del parte de Telegram, nunca desaparece en silencio.
  const sospecha = pareceIngresoDeCorreduria({ proveedor, concepto: data.concepto })
  if (sospecha.esSospechoso) {
    // Un extracto/aviso de Allianz (ADYP/ADXP por el nombre del fichero) que la IA no tipó como
    // liquidación también se guarda: el prefijo es determinista.
    const liq = claseAllianzPorNombre(nombreArchivo) ? await capturarLiquidacion(data, ctx, nombreArchivo) : null
    await log({ fuente: ctx.fuente, fingerprint: fp, decision: 'omitido', motivo: `No es un gasto: ${sospecha.motivo}${liq ? ` · ${liq}` : ''}`, payload: { total } })
    return { decision: 'omitido', fingerprint: fp, total, proveedor, motivo: sospecha.motivo ?? undefined }
  }

  // Factura de comisión de un portal de reservas (Booking, Airbnb, Expedia, Vrbo): justificante, no
  // gasto (el portal paga en neto y el motor fiscal ya resta bruto−neto). Mismo cauce `omitido`;
  // el PDF ya está archivado en Drive aguas arriba y `ctx.drive` va en el payload.
  if (esFacturaComisionPortal({ proveedor, concepto: data.concepto })) {
    await log({ fuente: ctx.fuente, fingerprint: fp, decision: 'omitido', motivo: MOTIVO_COMISION_PORTAL, payload: { total, drive_url: ctx.drive?.url ?? null } })
    return { decision: 'omitido', fingerprint: fp, total, proveedor, motivo: MOTIVO_COMISION_PORTAL }
  }

  // Póliza de un CLIENTE de la correduría: la comisión ya entra como ingreso por el banco → no es
  // gasto. true = se omite (mismo cauce que arriba); 'duda' (tomador desconocido) = sigue, pero
  // forzada a la bandeja más abajo con el motivo de revisión.
  const polizaCliente = esDocumentoPolizaCliente({
    proveedor, concepto: data.concepto, categoria: data.categoria, numero_factura: data.numero_factura,
    nif_proveedor: data.nif_proveedor, cliente: data.cliente, nif_cliente: data.nif_cliente,
  }, titulares)
  if (polizaCliente === true) {
    await log({ fuente: ctx.fuente, fingerprint: fp, decision: 'omitido', motivo: MOTIVO_POLIZA_CLIENTE, payload: { total, drive_url: ctx.drive?.url ?? null } })
    return { decision: 'omitido', fingerprint: fp, total, proveedor, motivo: MOTIVO_POLIZA_CLIENTE }
  }

  // Factura de un TERCERO (llega al Gmail de Alberto por un reenvío, pero está a nombre de otro):
  // ni se imputa ni ensucia la bandeja. Se registra en el log y el scan lo canta por Telegram —
  // decisión de Alberto (31/07/2026): "ignorar, pero avisar". Solo descarta con identificación
  // positiva por NIF; ante la duda `evaluaReceptor` devuelve 'desconocido' y la factura sigue.
  const dictamen = evaluaReceptor(data, titulares)
  if (dictamen.veredicto === 'ajeno') {
    await log({ fuente: ctx.fuente, fingerprint: fp, decision: 'ajena', motivo: dictamen.motivo, payload: { total, receptor: dictamen.receptor } })
    return { decision: 'ajena', fingerprint: fp, total, proveedor, motivo: dictamen.motivo, receptor: dictamen.receptor }
  }

  if (!data.fecha || !(total > 0)) {
    const motivo = 'No se pudo leer fecha/total de la factura'
    await log({ fuente: ctx.fuente, fingerprint: fp, decision: 'error', motivo, payload: data })
    return { decision: 'error', fingerprint: fp, total, proveedor, motivo }
  }

  // Se busca la regla bajo TODAS las huellas del proveedor (NIF y nombre), no solo bajo la que
  // esta factura genera: el mismo proveedor está registrado bajo una u otra según si el PDF traía
  // el NIF. Ver `huellasDe`. Con override (Booking por establecimiento) manda el override.
  const huellas = ctx.fingerprintOverride
    ? [ctx.fingerprintOverride]
    : [...new Set([fp, ...huellasDe({
        nif_proveedor: nifEmisorFiable ? data.nif_proveedor : null,
        proveedor,
        concepto: data.concepto,
      })])]
  const regla = await getRegla(huellas)
  const veredicto = evaluar(data, regla)

  // Propiedad: regla > mapeo de alquiler por concepto > por defecto del origen
  // (p.ej. la carpeta "Personal" → prop_personal) > nada.
  const propiedad = veredicto.propiedad || mapeaPropiedadAlquiler(data.concepto || '') || ctx.propiedadPorDefecto || null

  // Duplicado → no imputar.
  if (await existeDuplicado({ fingerprint: fp, huellaDoc: ctx.huellaDoc, numero_factura: data.numero_factura ?? null, fecha: data.fecha, total, proveedor, nif_proveedor: nifEmisorFiable ? data.nif_proveedor ?? null : null, propiedad })) {
    await log({ fuente: ctx.fuente, fingerprint: fp, decision: 'duplicado', payload: { total } })
    return { decision: 'duplicado', fingerprint: fp, total, proveedor }
  }
  const categoria = data.categoria || veredicto.categoria || 'OTRO'

  // Conciliación de importes: si no cuadra, no auto-imputar.
  const conc = conciliar(data)
  let decision = veredicto.decision
  let motivo = veredicto.motivo
  if (decision === 'auto' && !conc.ok && (data.base_imponible != null || data.irpf != null)) {
    decision = 'bandeja'
    motivo = `Descuadre: base+IVA−IRPF=${conc.esperado} ≠ total ${total}`
  }

  if (polizaCliente === 'duda' && decision === 'auto') {
    decision = 'bandeja'
    motivo = MOTIVO_POLIZA_DUDA
  } else if (polizaCliente === 'duda') {
    motivo = motivo ? `${MOTIVO_POLIZA_DUDA} · ${motivo}` : MOTIVO_POLIZA_DUDA
  }

  // Lectura dudosa (tipo sin clasificar, proveedor = cliente/titular/dirección del piso, documento
  // antiguo): a la bandeja con el aviso delante. La antigüedad solo en los agentes automáticos; en
  // la subida manual Alberto sube a propósito lo que quiere.
  const avisos = [
    ...(porTipo?.accion === 'revisar' ? [porTipo.aviso] : []),
    ...avisosDeLectura({ proveedor, cliente: data.cliente, fecha: data.fecha }, titulares, new Date(), {
      antiguedad: ctx.fuente.startsWith('agente-'),
    }),
  ]
  if (avisos.length) {
    const aviso = avisos.join(' · ')
    if (decision === 'auto') { decision = 'bandeja'; motivo = aviso }
    else motivo = motivo ? `${aviso} · ${motivo}` : aviso
  }

  // Booking: la liquidación NUNCA se auto-imputa en silencio. Trae varias reservas, comisiones
  // e IVA en un mismo PDF (no cuadra con la conciliación simple de arriba, que se salta al no
  // haber base/IRPF) → siempre a la bandeja para que Alberto/el contable confirme que cuadra con
  // el ingreso real. Decisión de Alberto: "auto-confirma si cuadra exacto; Booking → toque".
  if (ctx.esBooking && decision === 'auto') {
    decision = 'bandeja'
    motivo = 'Booking: confirma la liquidación (revisa el PDF en Drive)'
  }

  const datos: DatosGasto = {
    fecha: data.fecha,
    proveedor,
    // Si no es fiable (es un NIF nuestro), no se guarda: al aprobar desde la bandeja se
    // recalcula la huella a partir de este campo y volveríamos a envenenar la regla.
    nif_proveedor: nifEmisorFiable ? data.nif_proveedor ?? null : null,
    numero_factura: data.numero_factura ?? null,
    // Cuándo se cobra. NO se rellena con `fecha` si falta: un vencimiento inventado
    // haría reclamar cargos que aún no han vencido (o callar los que sí).
    fecha_vencimiento: data.fecha_cargo ?? null,
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

  // A quién va (sociedad/negocio). Sin la migración `2026-10-04_gastos_titular.sql` aplicada,
  // `contextoTitularSiAplicado()` da null y no se hace NADA: el gasto queda como antes.
  const ctxTit = await contextoTitularSiAplicado().catch(() => null)
  if (ctxTit && gastoId) {
    await escribirTitular(gastoId, asignarTitular({
      nif_cliente: data.nif_cliente ?? null,
      cliente: data.cliente ?? null,
      nif_proveedor: datos.nif_proveedor ?? null,
      proveedor,
      propiedad,
    }, ctxTit))
  }

  if (revisado) await reforzarRegla(datos)
  await log({ fuente: ctx.fuente, fingerprint: fp, gasto_id: gastoId, decision, confianza: veredicto.confianza, motivo })

  return { decision: revisado ? 'auto' : 'bandeja', gastoId, fingerprint: fp, total, proveedor, motivo }
}

// ── Liquidaciones de comisiones → libro de comisiones ──────────────────────────────────────────────

function entradaLiquidacion(data: FacturaExtraida) {
  return {
    liquidacion: (data.liquidacion ?? null) as LiquidacionIA | null,
    proveedor: data.proveedor, concepto: data.concepto, numero_factura: data.numero_factura, fecha: data.fecha,
    base_imponible: data.base_imponible, irpf: data.irpf, total: data.total,
  }
}

/** Guarda la liquidación y devuelve la frase para el log. Nunca lanza: el escaneo no se rompe por esto. */
async function capturarLiquidacion(
  data: FacturaExtraida,
  ctx: { fuente: string; drive?: DriveRef; huellaDoc?: string },
  nombreArchivo: string | null,
): Promise<string> {
  try {
    const l = leerLiquidacion(entradaLiquidacion(data), nombreArchivo)
    if (!l) return 'cartera prevista (AMYA): no se contabiliza'
    const r = await guardarLiquidacionDoc(l, { fuente: ctx.fuente, driveUrl: ctx.drive?.url ?? null, nombreArchivo, huellaDoc: ctx.huellaDoc ?? null })
    if (r.estado === 'guardado') return `liquidación guardada para el libro de comisiones (${l.compania ?? '?'} ${r.numeroDocumento}${l.clase === 'aviso_recibo' ? ', informativa' : ''})`
    if (r.estado === 'duplicado') return `liquidación ya registrada (${r.numeroDocumento})`
    if (r.estado === 'no_guardado') return `liquidación NO guardada: ${r.motivo}`
    return 'liquidación NO guardada'
  } catch (e) {
    return `liquidación NO guardada: ${String((e as Error)?.message ?? e).slice(0, 120)}`
  }
}
