// ============================================================
// ia.rest · VERIFACTU — ADAPTADOR de la app sobre @central/core-fiscal
// Phase 1: registros locales + QR en ticket ✅
// Phase 2: envío SOAP/XML a AEAT (cuando AEAT lo habilite)
// ============================================================
// Lo GENÉRICO (registro de alta/anulación, huella encadenada conforme AEAT, QR de cotejo, XML SuministroLR,
// contrato del transporte) vive en @central/core-fiscal (dinero en céntimos). Aquí solo lo de ia.rest:
//   - el reloj (FechaHoraHusoGenRegistro en hora de Madrid),
//   - el formato de número de serie del ticket («T-00000042»),
//   - la identidad del SistemaInformatico,
//   - el paso euros (columnas `numeric` de `facturas_verifactu`) ↔ céntimos.
// Los tickets de ia.rest son FACTURAS SIMPLIFICADAS (TipoFactura F2, sin destinatario).
//
// ⚠️ `facturas_verifactu.fecha_expedicion` es `timestamptz`: la BD devuelve el instante en UTC y pierde el
// huso con el que se generó. Por eso la FechaHoraHusoGenRegistro se RE-DERIVA siempre en hora de Madrid a partir
// del instante (`fechaHoraHusoDe`), tanto al emitir como al reconstruir el registro para el XML: así la huella
// guardada es recalculable desde la fila.
// ============================================================

import {
  calcularFiscal,
  construirRegistroAlta,
  construirRegistroAnulacion,
  desglosarDesdeTotales,
  eurosACentimos,
  fechaHoraHuso,
  urlQrCotejo,
  xmlSuministroLR,
} from '@central/core-fiscal'
import type {
  EslabonAnterior,
  RegistroAlta,
  RegistroAnulacion,
  SistemaInformatico,
} from '@central/core-fiscal'

export { calcularFiscal }
export type { EslabonAnterior }

export interface FacturaVeri {
  numero_serie:     string
  numero_factura:   number
  fecha_expedicion: string
  razon_social:     string
  nif_emisor:       string
  importe_total:    number
  base_imponible:   number
  cuota_iva:        number
  tipo_iva:         number
  huella:           string
  huella_anterior:  string | null
  primer_registro:  boolean
  qr_data:          string
  comanda_id:       string
  mesa_label:       string
  num_items:        number
}

const DESCRIPCION_OPERACION = 'Servicio de restauración'

/** Identidad del sistema informático de facturación de ia.rest (productor del software). */
export const SISTEMA_IAREST: SistemaInformatico = {
  nombreRazon:                 'ia.rest SL',
  nif:                         'B00000000',   // TODO: NIF real del productor antes de enviar a la AEAT
  nombreSistemaInformatico:    'ia.rest',
  idSistemaInformatico:        'IR',          // 2 caracteres según el XSD
  version:                     '2.0',
  numeroInstalacion:           'CLOUD',
  tipoUsoPosibleSoloVerifactu: 'S',
  tipoUsoPosibleMultiOT:       'N',
  indicadorMultiplesOT:        'N',
}

/** «T» + 42 → «T-00000042» (NumSerieFactura de ia.rest). */
export function numSerieIaRest(serie: string, numero: number): string {
  return `${serie}-${String(numero).padStart(8, '0')}`
}

/** Instante (ISO con o sin huso, tal como venga de la BD) → «AAAA-MM-DDThh:mm:ss±hh:mm» en hora de Madrid. */
export function fechaHoraHusoDe(fecha: string | Date): string {
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha
  if (Number.isNaN(d.getTime())) throw new Error(`[verifactu] fecha no válida: ${String(fecha)}`)
  return fechaHoraHuso(d)
}

/** Fila previa de `facturas_verifactu` → eslabón para encadenar el registro siguiente. */
export function eslabonDeFila(f: {
  nif_emisor: string; numero_serie: string; numero_factura: number; fecha_expedicion: string; huella: string
}): EslabonAnterior {
  return {
    idEmisor:        f.nif_emisor,
    numSerie:        numSerieIaRest(f.numero_serie, Number(f.numero_factura)),
    fechaExpedicion: fechaHoraHusoDe(f.fecha_expedicion).slice(0, 10),
    huella:          f.huella,
  }
}

function registroAltaDe(p: {
  nif_emisor: string; razon_social: string; numero_serie: string; numero_factura: number
  fechaHoraHuso: string; importe_total_centimos: number; tipo_iva: number
  base_centimos?: number; cuota_centimos?: number; anterior: EslabonAnterior | null
}): RegistroAlta {
  const desglose = p.base_centimos !== undefined && p.cuota_centimos !== undefined
    ? [{ tipoImpositivo: p.tipo_iva, baseCentimos: p.base_centimos, cuotaCentimos: p.cuota_centimos }]
    : desglosarDesdeTotales([{ totalCentimos: p.importe_total_centimos, tipoIva: p.tipo_iva }])
  return construirRegistroAlta({
    factura: {
      idEmisor:        p.nif_emisor,
      numSerie:        numSerieIaRest(p.numero_serie, p.numero_factura),
      fechaExpedicion: p.fechaHoraHuso.slice(0, 10),
    },
    nombreRazonEmisor:        p.razon_social,
    tipoFactura:              'F2',
    descripcion:              DESCRIPCION_OPERACION,
    desglose,
    destinatario:             null,
    anterior:                 p.anterior,
    fechaHoraHusoGenRegistro: p.fechaHoraHuso,
  })
}

// ── Construir FacturaVeri completa ───────────────────────────

export function construirFactura(params: {
  nif_emisor:       string
  razon_social:     string
  numero_serie:     string
  numero_factura:   number
  /** Eslabón del registro anterior de la serie (`eslabonDeFila`); null = primer registro. */
  anterior:         EslabonAnterior | null
  comanda_id:       string
  mesa_label:       string
  num_items:        number
  importe_total:    number
  tipo_iva?:        number
  /** Para tests: instante de generación (por defecto, ahora). */
  ahora?:           Date
}): FacturaVeri {
  const fhh = fechaHoraHusoDe(params.ahora ?? new Date())
  const tipo_iva = params.tipo_iva ?? 10

  const reg = registroAltaDe({
    nif_emisor:             params.nif_emisor,
    razon_social:           params.razon_social,
    numero_serie:           params.numero_serie,
    numero_factura:         params.numero_factura,
    fechaHoraHuso:          fhh,
    importe_total_centimos: eurosACentimos(params.importe_total),
    tipo_iva,
    anterior:               params.anterior,
  })
  const [linea] = reg.desglose

  return {
    numero_serie:     params.numero_serie,
    numero_factura:   params.numero_factura,
    fecha_expedicion: fhh,
    razon_social:     params.razon_social,
    nif_emisor:       params.nif_emisor,
    importe_total:    reg.importeTotalCentimos / 100,
    base_imponible:   linea.baseCentimos / 100,
    cuota_iva:        linea.cuotaCentimos / 100,
    tipo_iva,
    huella:           reg.huella,
    huella_anterior:  params.anterior?.huella ?? null,
    primer_registro:  params.anterior === null,
    qr_data:          urlQrCotejo({
      nif:                  params.nif_emisor,
      numSerie:             reg.factura.numSerie,
      fechaExpedicion:      reg.factura.fechaExpedicion,
      importeTotalCentimos: reg.importeTotalCentimos,
    }),
    comanda_id:       params.comanda_id,
    mesa_label:       params.mesa_label,
    num_items:        params.num_items,
  }
}

/**
 * Reconstruye el registro de alta desde una FacturaVeri guardada y comprueba que su huella es la guardada.
 * Lanza si no coincide (fila alterada o emitida con el cálculo antiguo, no conforme): ese registro NO se envía.
 */
export function registroDeFactura(f: FacturaVeri, anterior: EslabonAnterior | null): RegistroAlta {
  if ((anterior?.huella ?? null) !== (f.huella_anterior ?? null)) {
    throw new Error(`[verifactu] ${numSerieIaRest(f.numero_serie, f.numero_factura)}: el eslabón anterior no casa con huella_anterior`)
  }
  const reg = registroAltaDe({
    nif_emisor:             f.nif_emisor,
    razon_social:           f.razon_social,
    numero_serie:           f.numero_serie,
    numero_factura:         Number(f.numero_factura),
    fechaHoraHuso:          fechaHoraHusoDe(f.fecha_expedicion),
    importe_total_centimos: eurosACentimos(Number(f.importe_total)),
    tipo_iva:               Number(f.tipo_iva),
    base_centimos:          eurosACentimos(Number(f.base_imponible)),
    cuota_centimos:         eurosACentimos(Number(f.cuota_iva)),
    anterior,
  })
  if (reg.huella !== f.huella) {
    throw new Error(`[verifactu] ${reg.factura.numSerie}: la huella guardada no se puede recalcular (registro alterado o no conforme)`)
  }
  return reg
}

// ── Anulación ────────────────────────────────────────────────

/**
 * Registro de anulación de una factura de ia.rest. `anterior` = eslabón del último registro de la cadena.
 * Hoy ia.rest encadena la anulación a la propia factura anulada (no al último registro de la serie): ver
 * el aviso en /api/factura/anular.
 */
export function construirAnulacion(params: {
  factura:  { nif_emisor: string; numero_serie: string; numero_factura: number; fecha_expedicion: string }
  anterior: EslabonAnterior | null
  ahora?:   Date
}): RegistroAnulacion {
  const f = params.factura
  return construirRegistroAnulacion({
    facturaAnulada: {
      idEmisor:        f.nif_emisor,
      numSerie:        numSerieIaRest(f.numero_serie, Number(f.numero_factura)),
      fechaExpedicion: fechaHoraHusoDe(f.fecha_expedicion).slice(0, 10),
    },
    anterior:                 params.anterior,
    fechaHoraHusoGenRegistro: fechaHoraHusoDe(params.ahora ?? new Date()),
  })
}

// ── Generar XML de suministro para envío a AEAT (Phase 2) ────
// Cuando la AEAT habilite la recepción, este XML va con el certificado digital del restaurante (PKCS#12)
// a través de un TransporteVerifactu (@central/core-fiscal).

export function generarXmlLROE(params: {
  factura:      FacturaVeri
  nif_emisor:   string
  razon_social: string
  /** Eslabón del registro anterior (`eslabonDeFila` de la factura previa); null si es el primero. */
  anterior:     EslabonAnterior | null
}): string {
  const reg = registroDeFactura(params.factura, params.anterior)
  return xmlSuministroLR({
    obligado:  { nombreRazon: params.razon_social, nif: params.nif_emisor },
    registros: [reg],
    sistema:   SISTEMA_IAREST,
    soap:      true,
  })
}

// ── Estado de conformidad VeriFactu ──────────────────────────

export const VERIFACTU_STATUS = {
  phase: 1,
  conforme: true,
  descripcion: 'Sistema conforme RD 1007/2023 — Hash SHA-256 encadenado + QR AEAT',
  envio_aeat: 'pendiente_activacion_aeat',
  fecha_obligatoria_sociedades: '2027-01-01', // aplazado por RD-ley 15/2025 (antes 2026-01-01)
  fecha_obligatoria_autonomos:  '2027-07-01', // aplazado por RD-ley 15/2025 (antes 2026-07-01)
  nota: 'Plazo aplazado por RD-ley 15/2025 (BOE 3-dic-2025): sociedades 1-ene-2027, resto 1-jul-2027. El envío SOAP/XML a la AEAT está preparado; confirmar fecha en sede AEAT antes de uso legal.',
} as const
