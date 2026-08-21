// Sobre SOAP de SES.HOSPEDAJES y construcción de la solicitud de CONSULTA.
//
// Estructura verificada contra la guía oficial v3.1.2 (anexos II y III).
import { solicitudEnBase64 } from './zip.ts'

export const ENDPOINTS = {
  pruebas: 'https://hospedajes.pre-ses.mir.es/hospedajes-web/ws/v1/comunicacion',
  produccion: 'https://hospedajes.ses.mir.es/hospedajes-web/ws/v1/comunicacion',
} as const

export type Entorno = keyof typeof ENDPOINTS

/** A = alta · C = consulta · B = baja/anulación. */
export type TipoOperacion = 'A' | 'C' | 'B'

export function escaparXml(s: string): string {
  return String(s).replace(/[<>&'"]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] as string)
}

/**
 * Sobre SOAP completo.
 *
 * 🚨 `tipoComunicacion` va en el ALTA pero **no** en la consulta: la cabecera de `C` solo lleva
 * `codigoArrendador`, `aplicacion` y `tipoOperacion`. Por eso es opcional aquí y no se emite
 * cuando falta, en vez de mandarlo vacío.
 */
export function envolverPeticion(params: {
  codigoArrendador: string
  aplicacion: string
  tipoOperacion: TipoOperacion
  tipoComunicacion?: 'PV' | 'RH' | 'AV' | 'RV'
  solicitudB64: string
}): string {
  const { codigoArrendador, aplicacion, tipoOperacion, tipoComunicacion, solicitudB64 } = params
  const lineaComunicacion = tipoComunicacion
    ? `\n          <tipoComunicacion>${escaparXml(tipoComunicacion)}</tipoComunicacion>`
    : ''
  return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:com="http://www.soap.servicios.hospedajes.mir.es/comunicacion">
  <soapenv:Header/>
  <soapenv:Body>
    <com:comunicacionRequest>
      <peticion>
        <cabecera>
          <codigoArrendador>${escaparXml(codigoArrendador)}</codigoArrendador>
          <aplicacion>${escaparXml(aplicacion)}</aplicacion>
          <tipoOperacion>${tipoOperacion}</tipoOperacion>${lineaComunicacion}
        </cabecera>
        <solicitud>${solicitudB64}</solicitud>
      </peticion>
    </com:comunicacionRequest>
  </soapenv:Body>
</soapenv:Envelope>`
}

/**
 * Solicitud de consulta de lotes (operación `C`). Máximo 10 lotes por petición.
 *
 * Es la única operación de SOLO LECTURA del servicio: no da de alta ni anula nada. Por eso es la
 * que usa el latido para comprobar el transporte sin efectos sobre el Ministerio.
 */
export function solicitudConsultaLotes(lotes: string[]): string {
  const cuerpo = lotes.map(l => `<con:lote>${escaparXml(l)}</con:lote>`).join('')
  return `<con:lotes xmlns:con="http://www.neg.hospedajes.mir.es/consultarComunicacion">${cuerpo}</con:lotes>`
}

/** Sobre listo para enviar de una consulta de lotes. */
export function peticionConsulta(params: {
  codigoArrendador: string
  aplicacion: string
  lotes: string[]
}): string {
  return envolverPeticion({
    codigoArrendador: params.codigoArrendador,
    aplicacion: params.aplicacion,
    tipoOperacion: 'C',
    solicitudB64: solicitudEnBase64(solicitudConsultaLotes(params.lotes)),
  })
}
