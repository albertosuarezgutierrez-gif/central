// XML de suministro VeriFactu (RegFactuSistemaFacturacion) según los esquemas de la AEAT. Lógica PURA.
//
// Esquemas: SuministroLR.xsd (prefijo `sum`, contenedor) + SuministroInformacion.xsd (prefijo `sum1`, registros).
// El orden de los elementos es el de la secuencia del XSD: no reordenar. Sin firma XAdES (solo obligatoria en
// sistemas NO VERI*FACTU) y sin envío: el envío lo hace un `TransporteVerifactu` inyectado (transporte.ts).

import { escapeXml } from '../xml.ts'
import { centimosAImporte, fechaAeat, formatoTipoImpositivo } from './importe.ts'
import { TIPO_HUELLA_SHA256 } from './huella.ts'
import type { EslabonAnterior, IdFactura, RegistroAlta, RegistroAnulacion, RegistroFacturacion } from './registro.ts'

const XSD_BASE = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws'
export const NS_SUMINISTRO_LR = `${XSD_BASE}/SuministroLR.xsd`
export const NS_SUMINISTRO_INFORMACION = `${XSD_BASE}/SuministroInformacion.xsd`
export const NS_SOAP = 'http://schemas.xmlsoap.org/soap/envelope/'
export const ID_VERSION = '1.0'

/** Identificación del sistema informático de facturación (la pone el adaptador del productor del software). */
export interface SistemaInformatico {
  nombreRazon:                 string   // productor del software
  nif:                         string
  nombreSistemaInformatico:    string
  idSistemaInformatico:        string   // 2 caracteres (código asignado por el productor)
  version:                     string
  numeroInstalacion:           string
  tipoUsoPosibleSoloVerifactu: 'S' | 'N'
  tipoUsoPosibleMultiOT:       'S' | 'N'
  indicadorMultiplesOT:        'S' | 'N'
}

export interface ObligadoEmision { nombreRazon: string; nif: string }

const e = (s: string) => escapeXml(s.trim())
const el = (tag: string, valor: string) => `<sum1:${tag}>${e(valor)}</sum1:${tag}>`
const imp = (c: number) => centimosAImporte(c)

function idFacturaXml(f: IdFactura, envolvente: string): string {
  return `<sum1:${envolvente}>${el('IDEmisorFactura', f.idEmisor)}${el('NumSerieFactura', f.numSerie)}` +
    `${el('FechaExpedicionFactura', fechaAeat(f.fechaExpedicion))}</sum1:${envolvente}>`
}

function encadenamientoXml(a: EslabonAnterior | null): string {
  if (a === null) return `<sum1:Encadenamiento>${el('PrimerRegistro', 'S')}</sum1:Encadenamiento>`
  return `<sum1:Encadenamiento><sum1:RegistroAnterior>${el('IDEmisorFactura', a.idEmisor)}` +
    `${el('NumSerieFactura', a.numSerie)}${el('FechaExpedicionFactura', fechaAeat(a.fechaExpedicion))}` +
    `${el('Huella', a.huella)}</sum1:RegistroAnterior></sum1:Encadenamiento>`
}

function sistemaXml(s: SistemaInformatico): string {
  return `<sum1:SistemaInformatico>${el('NombreRazon', s.nombreRazon)}${el('NIF', s.nif)}` +
    `${el('NombreSistemaInformatico', s.nombreSistemaInformatico)}${el('IdSistemaInformatico', s.idSistemaInformatico)}` +
    `${el('Version', s.version)}${el('NumeroInstalacion', s.numeroInstalacion)}` +
    `${el('TipoUsoPosibleSoloVerifactu', s.tipoUsoPosibleSoloVerifactu)}${el('TipoUsoPosibleMultiOT', s.tipoUsoPosibleMultiOT)}` +
    `${el('IndicadorMultiplesOT', s.indicadorMultiplesOT)}</sum1:SistemaInformatico>`
}

/** Elemento `sum1:RegistroAlta` (sin contenedor). */
export function xmlRegistroAlta(r: RegistroAlta, sistema: SistemaInformatico): string {
  const p: string[] = []
  p.push(el('IDVersion', ID_VERSION))
  p.push(`<sum1:IDFactura>${el('IDEmisorFactura', r.factura.idEmisor)}${el('NumSerieFactura', r.factura.numSerie)}` +
    `${el('FechaExpedicionFactura', fechaAeat(r.factura.fechaExpedicion))}</sum1:IDFactura>`)
  p.push(el('NombreRazonEmisor', r.nombreRazonEmisor))
  p.push(el('TipoFactura', r.tipoFactura))
  if (r.rectificativa) {
    p.push(el('TipoRectificativa', r.rectificativa.tipo))
    p.push(`<sum1:FacturasRectificadas>${r.rectificativa.facturas.map(f => idFacturaXml(f, 'IDFacturaRectificada')).join('')}</sum1:FacturasRectificadas>`)
  }
  if (r.facturasSustituidas?.length) {
    p.push(`<sum1:FacturasSustituidas>${r.facturasSustituidas.map(f => idFacturaXml(f, 'IDFacturaSustituida')).join('')}</sum1:FacturasSustituidas>`)
  }
  if (r.rectificativa?.importeRectificado) {
    const ir = r.rectificativa.importeRectificado
    p.push(`<sum1:ImporteRectificacion>${el('BaseRectificada', imp(ir.baseCentimos))}${el('CuotaRectificada', imp(ir.cuotaCentimos))}</sum1:ImporteRectificacion>`)
  }
  if (r.fechaOperacion) p.push(el('FechaOperacion', fechaAeat(r.fechaOperacion)))
  p.push(el('DescripcionOperacion', r.descripcion))
  if (r.destinatario) {
    p.push(`<sum1:Destinatarios><sum1:IDDestinatario>${el('NombreRazon', r.destinatario.nombreRazon)}` +
      `${el('NIF', r.destinatario.nif)}</sum1:IDDestinatario></sum1:Destinatarios>`)
  }
  p.push(`<sum1:Desglose>${r.desglose.map(l =>
    `<sum1:DetalleDesglose>${el('Impuesto', '01')}${el('ClaveRegimen', '01')}${el('CalificacionOperacion', 'S1')}` +
    `${el('TipoImpositivo', formatoTipoImpositivo(l.tipoImpositivo))}${el('BaseImponibleOimporteNoSujeto', imp(l.baseCentimos))}` +
    `${el('CuotaRepercutida', imp(l.cuotaCentimos))}</sum1:DetalleDesglose>`).join('')}</sum1:Desglose>`)
  p.push(el('CuotaTotal', imp(r.cuotaTotalCentimos)))
  p.push(el('ImporteTotal', imp(r.importeTotalCentimos)))
  p.push(encadenamientoXml(r.anterior))
  p.push(sistemaXml(sistema))
  p.push(el('FechaHoraHusoGenRegistro', r.fechaHoraHusoGenRegistro))
  p.push(el('TipoHuella', TIPO_HUELLA_SHA256))
  p.push(el('Huella', r.huella))
  return `<sum1:RegistroAlta>${p.join('')}</sum1:RegistroAlta>`
}

/** Elemento `sum1:RegistroAnulacion` (sin contenedor). */
export function xmlRegistroAnulacion(r: RegistroAnulacion, sistema: SistemaInformatico): string {
  const f = r.facturaAnulada
  return `<sum1:RegistroAnulacion>${el('IDVersion', ID_VERSION)}` +
    `<sum1:IDFactura>${el('IDEmisorFacturaAnulada', f.idEmisor)}${el('NumSerieFacturaAnulada', f.numSerie)}` +
    `${el('FechaExpedicionFacturaAnulada', fechaAeat(f.fechaExpedicion))}</sum1:IDFactura>` +
    `${encadenamientoXml(r.anterior)}${sistemaXml(sistema)}` +
    `${el('FechaHoraHusoGenRegistro', r.fechaHoraHusoGenRegistro)}${el('TipoHuella', TIPO_HUELLA_SHA256)}` +
    `${el('Huella', r.huella)}</sum1:RegistroAnulacion>`
}

/**
 * Documento `sum:RegFactuSistemaFacturacion` completo (cabecera + 1..1000 registros), con declaración XML.
 * `soap: true` lo envuelve en un sobre SOAP 1.1 listo para el servicio VerifactuSOAP.
 */
export function xmlSuministroLR(params: {
  obligado:  ObligadoEmision
  registros: RegistroFacturacion[]
  sistema:   SistemaInformatico
  soap?:     boolean
}): string {
  const { obligado, registros, sistema } = params
  if (!registros.length || registros.length > 1000) {
    throw new Error(`Un envío lleva entre 1 y 1000 registros (llegaron ${registros.length})`)
  }
  const cuerpo =
    `<sum:RegFactuSistemaFacturacion xmlns:sum="${NS_SUMINISTRO_LR}" xmlns:sum1="${NS_SUMINISTRO_INFORMACION}">` +
    `<sum:Cabecera><sum1:ObligadoEmision>${el('NombreRazon', obligado.nombreRazon)}${el('NIF', obligado.nif)}` +
    `</sum1:ObligadoEmision></sum:Cabecera>` +
    registros.map(r => `<sum:RegistroFactura>${r.tipo === 'alta' ? xmlRegistroAlta(r, sistema) : xmlRegistroAnulacion(r, sistema)}</sum:RegistroFactura>`).join('') +
    `</sum:RegFactuSistemaFacturacion>`
  const decl = '<?xml version="1.0" encoding="UTF-8"?>'
  if (!params.soap) return `${decl}${cuerpo}`
  return `${decl}<soapenv:Envelope xmlns:soapenv="${NS_SOAP}"><soapenv:Header/><soapenv:Body>${cuerpo}</soapenv:Body></soapenv:Envelope>`
}
