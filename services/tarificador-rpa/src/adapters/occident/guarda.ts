// Guarda de EMISIÓN propia de Occident / Catalana Occidente (07/10/2026). TARIFICAR ≠ EMITIR.
//
// Capa EXTRA sobre `pareceEmision` de @central/module-tarificacion (que ya cubre emitir/emisión, contratar,
// formalizar, suplemento, anular, baja, «Aceptar» y la lista de ePAC): aquí, además, lo propio del portal GCO.
// Las dos capas se suman: un texto es prohibido si lo dice CUALQUIERA de las dos. Fail-closed: un falso positivo
// (un botón «Calcular» con un onclick raro) es preferible a una póliza emitida por un bot.
//
// Este fichero es PURO (sin Playwright): lo prueba test/occident-guarda.test.ts, con su cepo.

import { EmisionBloqueadaError, pareceEmision } from '@central/module-tarificacion'
import { ErrorTarificador } from '../../errores.ts'

/**
 * Textos/ids/hrefs que el bot NUNCA pulsa ni abre en Occident. Se comparan sin tildes y en minúsculas.
 * (La palabra «aceptar» y los radios los cubre `pareceEmision`; este fichero no los nombra.)
 */
export const PROHIBIDOS_OCCIDENT: readonly { motivo: string; patron: RegExp }[] = [
  { motivo: 'emitir', patron: /emit|emisi/ },
  { motivo: 'contratar', patron: /contrat/ },
  { motivo: 'formalizar', patron: /formaliz/ },
  { motivo: 'grabar/guardar', patron: /grab(ar|aci)|guardar|\bsave\b/ },
  { motivo: 'firmar', patron: /\bfirm(ar|a|ado|e)\b|firma[\s_-]*(digital|electronica)|signature/ },
  { motivo: 'confirmar', patron: /confirmar|\bconfirm\b/ },
  { motivo: 'pagar/cobrar', patron: /\bpag(ar|o|os)\b|cobr(o|ar)|domicili|mandato|\bsepa\b|\bpay\b/ },
  { motivo: 'alta/tramitar', patron: /\balta\b|tramitar|\bsolicitar\b|\benviar[\s_-]*a\b|\bsubmit[\s_-]*(order|policy)/ },
  { motivo: 'accept (inglés)', patron: /\baccept\b|btn[\s_-]*acc/ },
  { motivo: 'credenciales', patron: /olvidado[\s_-]*su[\s_-]*clave|forgot|resetear|reset[\s_-]*password|cambiar[\s_-]*(la[\s_-]*)?(clave|contrasena)/ },
  { motivo: 'gestión de emisiones', patron: /gestiondeproyectosyemisiones|proyectosypropuestas|negocio\/polizas|negocio\/clientes/ },
]

function plano(t: string): string {
  let s = t.normalize('NFD').replace(/[̀-ͯ]/g, '')
  try {
    s = decodeURIComponent(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  } catch {
    /* no era URI válida: tal cual */
  }
  return s.toLowerCase()
}

/** Motivo por el que el texto es prohibido, o `null`. Mira primero la guarda común y luego la lista de Occident. */
export function motivoProhibidoOccident(texto: string | null | undefined): string | null {
  if (typeof texto !== 'string' || texto === '') return null
  if (pareceEmision(texto)) return 'guarda común'
  const t = plano(texto)
  return PROHIBIDOS_OCCIDENT.find((p) => p.patron.test(t))?.motivo ?? null
}

export function textoProhibidoOccident(texto: string | null | undefined): boolean {
  return motivoProhibidoOccident(texto) !== null
}

/** Descriptor de un elemento (texto, aria-label, title, value, id, name, href, onclick…): si ALGUNO es prohibido → lanza. */
export function comprobarDescriptorOccident(descriptor: readonly (string | null | undefined)[]): void {
  for (const d of descriptor) {
    const motivo = motivoProhibidoOccident(d)
    if (motivo) throw new EmisionBloqueadaError('boton', `[occident: ${motivo}] ${d}`)
  }
}

/** Únicos orígenes a los que el adaptador navega (login SSO, portal y la aplicación de tarificación). */
export const HOSTS_PERMITIDOS: readonly string[] = ['portaloccident.gco.global', 'ssoaut.gco.global', 'catalanaaplicaciones.gco.global']

/** Navegación: https, host de la lista blanca y ruta/consulta sin patrón de emisión. Si no → lanza. */
export function comprobarUrlOccident(url: string): URL {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new ErrorTarificador('portal', 'occident: URL de navegación no válida')
  }
  if (u.protocol !== 'https:' || !HOSTS_PERMITIDOS.includes(u.hostname)) {
    throw new ErrorTarificador('portal', `occident: navegación fuera de la lista blanca (${u.hostname})`)
  }
  const motivo = motivoProhibidoOccident(u.pathname + u.search)
  if (motivo) throw new EmisionBloqueadaError('url', `[occident: ${motivo}] ${u.origin}${u.pathname}`)
  return u
}
