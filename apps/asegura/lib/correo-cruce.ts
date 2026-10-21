// apps/asegura/lib/correo-cruce.ts
//
// Textos de los avisos de CRUCE correo ↔ CIMA (F1 del agente de correo, 21/10/2026, spec §4.2 y §4.8). PURO
// (`node --test`). Se guardan ya compuestos en `correo_cruce_aviso.texto` y el cron de plataforma los manda por Telegram
// tal cual (con el enlace a la ficha que pone plataforma). SIN datos personales: ni nombre del tomador, ni NIF, ni IBAN;
// solo compañía, nº de póliza/solicitud/recibo, fechas y días.

import { CODIGO_DGS_COMPANIA, diasEsperaCima, sinDatosSensibles, type MotivoEnlaceAmbiguo, type TipoAvisoCruce } from '@central/module-seguros'
import { nombreCompania, type ResolucionEvento } from './correo-evento.ts'

/**
 * ¿CIMA trae la póliza de una emisión comunicada por correo? `true` · `false` (de verdad no está) · `null` (no se sabe).
 * `cartera`: lo resuelto contra la cartera viva de fichas ACTIVAS; `fueraDeCartera`: lo resuelto contra las pólizas de
 * CIMA que no entran ahí (ficha inactiva o fusionada). Que esté en una ficha inactiva NO es «CIMA no la trae»: `null`.
 */
export function enCimaSegunResolucion(cartera: ResolucionEvento, fueraDeCartera: ResolucionEvento): boolean | null {
  if (cartera.estado === 'en_vigor' || cartera.estado === 'no_en_vigor') return true
  if (cartera.motivo === 'ambigua') return null
  if (cartera.motivo === 'sin_numero') return false
  // `no_encontrada` entre las activas: ¿la tiene CIMA en una ficha inactiva/fusionada? Entonces no se sabe.
  if (fueraDeCartera.estado !== 'sin_resolver' || fueraDeCartera.motivo === 'ambigua') return null
  return false
}

const fechaEs = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** Nombre de la compañía por su código DGS (las cuatro de los eventos); otro código, tal cual. `null` → «la compañía». */
export function companiaDeDgs(dgs: string | null): string {
  if (!dgs) return 'la compañía'
  const clave = Object.entries(CODIGO_DGS_COMPANIA).find(([, c]) => c === dgs)?.[0]
  return clave ? nombreCompania(clave) : dgs
}

const limpio = (t: string): string => sinDatosSensibles(t).slice(0, 600)

export function textoAvisoEmisionSinCima(p: { compania: string; numeroPoliza: string; numeroSolicitud: string | null; fechaCorreo: string; diasHabiles: number }): string {
  const sol = p.numeroSolicitud ? ` (solicitud ${p.numeroSolicitud})` : ''
  return limpio(`📭 ${nombreCompania(p.compania)} comunicó por correo el ${fechaEs(p.fechaCorreo)} la emisión de la póliza ${p.numeroPoliza}${sol} y CIMA aún no la trae (${p.diasHabiles} días hábiles; se esperan ${diasEsperaCima(p.compania)}). Mírala en el portal de la compañía: no se ha creado nada en la cartera.`)
}

export function textoAvisoAnulacionSinCima(p: { compania: string; numeroPoliza: string; fechaCorreo: string; diasHabiles: number }): string {
  return limpio(`🧾 ${nombreCompania(p.compania)} comunicó por correo el ${fechaEs(p.fechaCorreo)} la ANULACIÓN de la póliza ${p.numeroPoliza} y CIMA la sigue dando en vigor (${p.diasHabiles} días hábiles). Confírmalo en el portal de la compañía antes de tocar nada.`)
}

export function textoAvisoDevolucionSinRecibo(p: { codigoDgs: string; idRecibo: string; numeroPoliza: string | null; fechaCorreo: string; diasHabiles: number }): string {
  const pol = p.numeroPoliza ? ` de la póliza ${p.numeroPoliza}` : ''
  return limpio(`↩️ ${companiaDeDgs(p.codigoDgs)} avisó por correo el ${fechaEs(p.fechaCorreo)} de la devolución del recibo ${p.idRecibo}${pol} y ese recibo no consta en la cartera (CIMA no lo ha traído en ${p.diasHabiles} días hábiles). La devolución está apuntada y se enlazará sola cuando llegue.`)
}

export function textoAvisoEnlaceAmbiguo(p: { numeroPoliza: string | null; ramo: string | null; codigoDgs: string | null; candidatas: number; motivo: MotivoEnlaceAmbiguo }): string {
  const que = `${p.numeroPoliza ?? 'sin nº'} (${companiaDeDgs(p.codigoDgs)}${p.ramo ? `, ${p.ramo}` : ''})`
  const por = p.motivo === 'varias_oportunidades'
    ? `casa con ${p.candidatas} oportunidades abiertas del mismo tomador, compañía y ramo`
    : p.motivo === 'varias_polizas'
      ? 'su oportunidad casa con más de una póliza nueva del mismo tomador, compañía y ramo'
      : p.motivo === 'solicitud_otro_tomador'
        ? 'casa por el nº de solicitud, pero la póliza es de otro tomador que la oportunidad'
        : 'hay más de una póliza en CIMA con el nº que dio la compañía para la solicitud'
  return limpio(`🔗 Póliza nueva ${que} entrada por CIMA: ${por}. No la he enlazado con ninguna: elígela tú en la ficha (Ganar → esa póliza).`)
}

/** Clave de idempotencia de un aviso (un hecho, un aviso). */
export function claveAvisoCruce(tipo: TipoAvisoCruce, id: string): string {
  return `${tipo}:${id}`
}
