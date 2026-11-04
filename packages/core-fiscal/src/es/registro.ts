// Registros de facturación VeriFactu (alta y anulación): construcción, validación y encadenamiento. PURO.
//
// Normativa: RD 1007/2023 (Reglamento de sistemas informáticos de facturación) y Orden HAC/1177/2024.
// Estructura de campos: esquema SuministroInformacion.xsd de la AEAT (RegistroAlta / RegistroAnulacion).
// Este módulo NO conoce al emisor concreto (identidad del SistemaInformatico, reloj, BD): eso lo pone el
// adaptador de cada app. La cadena de huellas es ÚNICA por obligado tributario y sistema; quién guarda el
// último eslabón y lo bloquea (FOR UPDATE / RPC) es responsabilidad del llamador.
//
// Dinero en CÉNTIMOS ENTEROS. Fechas de factura en AAAA-MM-DD (se pasan a dd-mm-aaaa al escribir).

import { centimosAImporte, exigirCentimos, exigirFechaHoraHuso, fechaAeat, ErrorVerifactu } from './importe.ts'
import { esHuellaValida, huellaAlta, huellaAnulacion } from './huella.ts'

// ── Tipos de factura (L2 del esquema) ───────────────────────────────────────
//  F1 completa (art. 6/7.2/7.3 RD 1619/2012) · F2 simplificada (art. 6.1.d / sin destinatario identificado)
//  F3 emitida en sustitución de simplificadas · R1 rectificativa art. 80.1, 80.2 y error fundado en derecho
//  R2 art. 80.3 (concurso) · R3 art. 80.4 (créditos incobrables) · R4 resto · R5 rectificativa de simplificada
export type TipoFactura = 'F1' | 'F2' | 'F3' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5'
export const TIPOS_FACTURA: readonly TipoFactura[] = ['F1', 'F2', 'F3', 'R1', 'R2', 'R3', 'R4', 'R5']
export const TIPOS_RECTIFICATIVA: readonly TipoFactura[] = ['R1', 'R2', 'R3', 'R4', 'R5']
export function esRectificativa(t: TipoFactura): boolean {
  return TIPOS_RECTIFICATIVA.includes(t)
}

/** S = por sustitución (importes nuevos completos) · I = por diferencias (importes = la diferencia). */
export type TipoRectificativa = 'S' | 'I'

/** Identificación de una factura (IDFactura). */
export interface IdFactura {
  idEmisor:        string   // NIF del emisor (obligado a expedir)
  numSerie:        string   // serie + número, tal como se imprime (máx. 60)
  fechaExpedicion: string   // AAAA-MM-DD
}

/** Línea de desglose de IVA (DetalleDesglose). Régimen general (ClaveRegimen 01), operación sujeta no exenta (S1). */
export interface DetalleIva {
  tipoImpositivo: number   // puntos porcentuales: 21, 10, 4, 0…
  baseCentimos:   number
  cuotaCentimos:  number
}

export interface Destinatario { nombreRazon: string; nif: string }

/** Eslabón que encadena con el registro anterior (RegistroAnterior). */
export interface EslabonAnterior {
  idEmisor:        string
  numSerie:        string
  fechaExpedicion: string   // AAAA-MM-DD
  huella:          string
}

export interface DatosRegistroAlta {
  factura:            IdFactura
  nombreRazonEmisor:  string
  tipoFactura:        TipoFactura
  descripcion:        string                 // DescripcionOperacion (máx. 500)
  desglose:           DetalleIva[]           // al menos una línea
  destinatario?:      Destinatario | null    // obligatorio en F1/F3/R1-R4; prohibido en F2/R5
  /** Rectificativas (R1-R5): tipo y facturas rectificadas. */
  rectificativa?: {
    tipo:      TipoRectificativa
    facturas:  IdFactura[]
    /** Solo con tipo 'S': base y cuota de la(s) factura(s) original(es). */
    importeRectificado?: { baseCentimos: number; cuotaCentimos: number }
  } | null
  /** F3: facturas simplificadas que se sustituyen. */
  facturasSustituidas?: IdFactura[] | null
  fechaOperacion?:      string | null        // AAAA-MM-DD, solo si difiere de la expedición
  /** null = primer registro de la cadena (PrimerRegistro=S). */
  anterior:             EslabonAnterior | null
  fechaHoraHusoGenRegistro: string           // AAAA-MM-DDThh:mm:ss±hh:mm
}

export interface RegistroAlta extends DatosRegistroAlta {
  tipo:                 'alta'
  cuotaTotalCentimos:   number
  importeTotalCentimos: number
  huella:               string
}

export interface DatosRegistroAnulacion {
  facturaAnulada:           IdFactura
  anterior:                 EslabonAnterior | null
  fechaHoraHusoGenRegistro: string
}

export interface RegistroAnulacion extends DatosRegistroAnulacion {
  tipo:   'anulacion'
  huella: string
}

export type RegistroFacturacion = RegistroAlta | RegistroAnulacion

// ── Desglose por tipo de IVA ────────────────────────────────────────────────

function agrupar<T>(lineas: T[], tipoDe: (l: T) => number): Map<number, T[]> {
  const m = new Map<number, T[]>()
  for (const l of lineas) {
    const t = tipoDe(l)
    const g = m.get(t)
    if (g) g.push(l)
    else m.set(t, [l])
  }
  return m
}

/**
 * Desglose a partir de líneas con importe IVA INCLUIDO (tickets / simplificadas). Agrupa por tipo y, por
 * grupo: base = round(total · 100 / (100 + tipo)), cuota = total − base (base + cuota = total, al céntimo).
 */
export function desglosarDesdeTotales(lineas: { totalCentimos: number; tipoIva: number }[]): DetalleIva[] {
  const out: DetalleIva[] = []
  for (const [tipo, g] of agrupar(lineas, l => l.tipoIva)) {
    const total = g.reduce((s, l) => s + exigirCentimos(l.totalCentimos, 'totalCentimos'), 0)
    const base = Math.round((total * 100) / (100 + tipo))
    out.push({ tipoImpositivo: tipo, baseCentimos: base, cuotaCentimos: total - base })
  }
  return out.sort((a, b) => b.tipoImpositivo - a.tipoImpositivo)
}

/** Desglose a partir de líneas con BASE imponible (facturas completas). Cuota por grupo: round(base · tipo / 100). */
export function desglosarDesdeBases(lineas: { baseCentimos: number; tipoIva: number }[]): DetalleIva[] {
  const out: DetalleIva[] = []
  for (const [tipo, g] of agrupar(lineas, l => l.tipoIva)) {
    const base = g.reduce((s, l) => s + exigirCentimos(l.baseCentimos, 'baseCentimos'), 0)
    out.push({ tipoImpositivo: tipo, baseCentimos: base, cuotaCentimos: Math.round((base * tipo) / 100) })
  }
  return out.sort((a, b) => b.tipoImpositivo - a.tipoImpositivo)
}

// ── Validación ──────────────────────────────────────────────────────────────

function exigirTexto(v: string | undefined | null, campo: string, max: number): string {
  const t = (v ?? '').trim()
  if (!t) throw new ErrorVerifactu(`${campo} es obligatorio`)
  if (t.length > max) throw new ErrorVerifactu(`${campo} supera ${max} caracteres`)
  return t
}

function validarIdFactura(f: IdFactura, campo: string): void {
  exigirTexto(f.idEmisor, `${campo}.idEmisor`, 9)
  exigirTexto(f.numSerie, `${campo}.numSerie`, 60)
  fechaAeat(f.fechaExpedicion)
}

function validarAnterior(a: EslabonAnterior | null): void {
  if (a === null) return
  validarIdFactura(a, 'anterior')
  if (!esHuellaValida(a.huella)) throw new ErrorVerifactu('anterior.huella no es un SHA-256 hex en mayúsculas')
}

function validarDatosAlta(d: DatosRegistroAlta): void {
  validarIdFactura(d.factura, 'factura')
  exigirTexto(d.nombreRazonEmisor, 'nombreRazonEmisor', 120)
  exigirTexto(d.descripcion, 'descripcion', 500)
  if (!TIPOS_FACTURA.includes(d.tipoFactura)) throw new ErrorVerifactu(`TipoFactura desconocido: ${d.tipoFactura}`)
  if (!d.desglose?.length) throw new ErrorVerifactu('El desglose necesita al menos una línea de IVA')
  for (const l of d.desglose) {
    exigirCentimos(l.baseCentimos, 'desglose.baseCentimos')
    exigirCentimos(l.cuotaCentimos, 'desglose.cuotaCentimos')
  }

  const t = d.tipoFactura
  const llevaDestinatario = t === 'F1' || t === 'F3' || t === 'R1' || t === 'R2' || t === 'R3' || t === 'R4'
  if (llevaDestinatario && !d.destinatario) throw new ErrorVerifactu(`${t} exige destinatario identificado`)
  if (!llevaDestinatario && d.destinatario) throw new ErrorVerifactu(`${t} no admite destinatario`)
  if (d.destinatario) {
    exigirTexto(d.destinatario.nombreRazon, 'destinatario.nombreRazon', 120)
    exigirTexto(d.destinatario.nif, 'destinatario.nif', 9)
  }

  if (esRectificativa(t)) {
    const r = d.rectificativa
    if (!r) throw new ErrorVerifactu(`${t} (rectificativa) exige tipo de rectificación y factura(s) rectificada(s)`)
    if (r.tipo !== 'S' && r.tipo !== 'I') throw new ErrorVerifactu(`TipoRectificativa desconocido: ${String(r.tipo)}`)
    if (!r.facturas?.length) throw new ErrorVerifactu(`${t} exige al menos una factura rectificada`)
    r.facturas.forEach((f, i) => validarIdFactura(f, `rectificativa.facturas[${i}]`))
    if (r.tipo === 'S' && !r.importeRectificado) {
      throw new ErrorVerifactu('Rectificativa por sustitución (S) exige importeRectificado (base y cuota originales)')
    }
    if (r.tipo === 'I' && r.importeRectificado) {
      throw new ErrorVerifactu('Rectificativa por diferencias (I) no lleva importeRectificado')
    }
    if (r.importeRectificado) {
      exigirCentimos(r.importeRectificado.baseCentimos, 'importeRectificado.baseCentimos')
      exigirCentimos(r.importeRectificado.cuotaCentimos, 'importeRectificado.cuotaCentimos')
    }
  } else if (d.rectificativa) {
    throw new ErrorVerifactu(`${t} no es rectificativa: no admite datos de rectificación`)
  }

  if (t === 'F3') {
    if (!d.facturasSustituidas?.length) throw new ErrorVerifactu('F3 exige las facturas simplificadas sustituidas')
    d.facturasSustituidas.forEach((f, i) => validarIdFactura(f, `facturasSustituidas[${i}]`))
  } else if (d.facturasSustituidas?.length) {
    throw new ErrorVerifactu(`${t} no admite facturas sustituidas`)
  }

  if (d.fechaOperacion) fechaAeat(d.fechaOperacion)
  validarAnterior(d.anterior)
  exigirFechaHoraHuso(d.fechaHoraHusoGenRegistro)
}

// ── Construcción ────────────────────────────────────────────────────────────

/** Totales del registro: CuotaTotal = Σ cuotas; ImporteTotal = Σ (base + cuota). */
export function totalesDesglose(desglose: DetalleIva[]): { cuotaTotalCentimos: number; importeTotalCentimos: number } {
  let cuota = 0, base = 0
  for (const l of desglose) { cuota += l.cuotaCentimos; base += l.baseCentimos }
  return { cuotaTotalCentimos: cuota, importeTotalCentimos: base + cuota }
}

/** Construye y valida un registro de ALTA y calcula su huella encadenada. Lanza ErrorVerifactu si no es válido. */
export function construirRegistroAlta(d: DatosRegistroAlta): RegistroAlta {
  validarDatosAlta(d)
  const { cuotaTotalCentimos, importeTotalCentimos } = totalesDesglose(d.desglose)
  const huella = huellaAlta({
    IDEmisorFactura:          d.factura.idEmisor,
    NumSerieFactura:          d.factura.numSerie,
    FechaExpedicionFactura:   fechaAeat(d.factura.fechaExpedicion),
    TipoFactura:              d.tipoFactura,
    CuotaTotal:               centimosAImporte(cuotaTotalCentimos),
    ImporteTotal:             centimosAImporte(importeTotalCentimos),
    Huella:                   d.anterior?.huella ?? '',
    FechaHoraHusoGenRegistro: d.fechaHoraHusoGenRegistro,
  })
  return { ...d, tipo: 'alta', cuotaTotalCentimos, importeTotalCentimos, huella }
}

/** Construye y valida un registro de ANULACIÓN y calcula su huella encadenada. */
export function construirRegistroAnulacion(d: DatosRegistroAnulacion): RegistroAnulacion {
  validarIdFactura(d.facturaAnulada, 'facturaAnulada')
  validarAnterior(d.anterior)
  exigirFechaHoraHuso(d.fechaHoraHusoGenRegistro)
  const huella = huellaAnulacion({
    IDEmisorFacturaAnulada:        d.facturaAnulada.idEmisor,
    NumSerieFacturaAnulada:        d.facturaAnulada.numSerie,
    FechaExpedicionFacturaAnulada: fechaAeat(d.facturaAnulada.fechaExpedicion),
    Huella:                        d.anterior?.huella ?? '',
    FechaHoraHusoGenRegistro:      d.fechaHoraHusoGenRegistro,
  })
  return { ...d, tipo: 'anulacion', huella }
}

/** Eslabón para encadenar el SIGUIENTE registro a partir de este (alta o anulación). */
export function eslabonDe(r: RegistroFacturacion): EslabonAnterior {
  const f = r.tipo === 'alta' ? r.factura : r.facturaAnulada
  return { idEmisor: f.idEmisor, numSerie: f.numSerie, fechaExpedicion: f.fechaExpedicion, huella: r.huella }
}

/**
 * Comprueba una cadena ordenada de registros: el primero sin anterior (o con el eslabón dado), cada uno
 * apuntando a la huella del previo y cada huella recalculable. Devuelve el índice del primer registro roto, o null.
 */
export function primerEslabonRoto(registros: RegistroFacturacion[], inicio: EslabonAnterior | null = null): number | null {
  let previo: EslabonAnterior | null = inicio
  for (let i = 0; i < registros.length; i++) {
    const r = registros[i]
    if ((r.anterior?.huella ?? null) !== (previo?.huella ?? null)) return i
    const recalculado = r.tipo === 'alta' ? construirRegistroAlta(r) : construirRegistroAnulacion(r)
    if (recalculado.huella !== r.huella) return i
    previo = eslabonDe(r)
  }
  return null
}
