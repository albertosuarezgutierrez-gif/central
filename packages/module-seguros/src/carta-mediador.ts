// La CARTA DE NOMBRAMIENTO DE MEDIADOR (spec 2026-09-21, «salida B», PR 6): el cliente se queda con
// su compañía y su póliza, pero nombra a la correduría como su corredor en ella. Convierte un lead en
// cliente sin tarificar ni gastar un euro, y la póliza empieza a entrar por CIMA.
//
// 🚨 La carta NO toca el contrato: ni prima, ni garantías, ni condiciones. Lo dice en su cara, porque
// es lo que el cliente firma y lo que teme al firmar.
// 🚨 Se firma en el portal pero no sale sola: la manda Alberto (su clic), y hasta que la compañía la
// acepta la póliza NO es nuestra — el estado `enviada` no es `aceptada`.

import { normalizarDni } from './cliente-edicion.ts'
import { MEDIADOR } from './mediador.ts'

export type EstadoCartaMediador = 'pendiente' | 'firmada' | 'enviada' | 'aceptada' | 'rechazada' | 'desistida'

export const ESTADOS_CARTA_ABIERTA: readonly EstadoCartaMediador[] = ['pendiente', 'firmada', 'enviada']

export type DatosCartaMediador = {
  tomador: string
  /**
   * DNI, NIE o CIF del tomador, tal cual consta en su ficha (descifrado). La compañía identifica al
   * tomador por él: sin documento válido la carta no la aplica nadie, y no se ofrece firmarla.
   */
  documento: string | null
  compania: string | null
  numeroPoliza: string | null
  ramo: string | null
  /** `YYYY-MM-DD`: el día en que se compone y se firma. */
  fechaCarta: string
}

/**
 * Valores de «cajón» que el volcado histórico escribe en `polizas.aseguradora` (26.987 pólizas con
 * «(legacy)», medido el 23/09/2026). No identifican a nadie: una carta «A la atención de (legacy)»
 * se firmaría y no se podría mandar. Se tratan como compañía que falta.
 */
export function esCompaniaDeRelleno(compania: string): boolean {
  return /^\(.*\)$|^(n\/?a|otr[ao]s?|desconocid[ao]|sin compa[ñn][ií]a|-+)$/i.test(compania.trim())
}

/** El documento del tomador normalizado (sin espacios ni guiones, letra comprobada), o `null`. */
export function documentoParaCarta(v: string | null): string | null {
  const r = normalizarDni(v)
  return r.ok ? r.valor.valor : null
}

function fechaEs(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/**
 * El texto EXACTO que se firma y se manda. `null` si falta la compañía, el número o el documento del
 * tomador: una carta que no identifica la póliza y a quien la firma no la puede aplicar nadie, y
 * firmarla engañaría al cliente.
 */
export function cartaNombramientoMediador(d: DatosCartaMediador): string | null {
  const tomador = d.tomador.trim()
  const compania = d.compania?.trim()
  const numero = d.numeroPoliza?.trim()
  const documento = documentoParaCarta(d.documento)
  if (!tomador || !compania || !numero || !documento || esCompaniaDeRelleno(compania)) return null
  const poliza = `la póliza nº ${numero}${d.ramo ? ` (${d.ramo})` : ''}`
  const { nombre, figura, claveDgsfp, nif } = MEDIADOR.identidad
  return [
    `A la atención de ${compania}`,
    '',
    `Asunto: nombramiento de mediador de ${poliza}`,
    '',
    `Yo, ${tomador}, con DNI/NIF ${documento}, tomador de ${poliza}, designo como mediador de dicha póliza a ${MEDIADOR.marca} ` +
      `(${nombre}, ${figura.toLowerCase()}, clave DGSFP ${claveDgsfp}, NIF ${nif}), con efecto desde la recepción de ` +
      'esta carta, y revoco cualquier designación anterior de mediador para ella.',
    '',
    'Este nombramiento no modifica el contrato: la prima, las garantías y las condiciones siguen siendo las mismas. ' +
      'Solo cambia quién me atiende y gestiona la póliza.',
    '',
    `Firmado electrónicamente el ${fechaEs(d.fechaCarta)}.`,
    `${tomador} · DNI/NIF ${documento}`,
  ].join('\n')
}

export const ACCIONES_CARTA_MEDIADOR = ['enviada', 'aceptada', 'rechazada', 'desistida'] as const
export type AccionCartaMediador = (typeof ACCIONES_CARTA_MEDIADOR)[number]

/**
 * El siguiente estado de una acción del corredor, o `null` si no se puede desde el actual.
 * Solo una firmada se envía; solo una enviada se acepta o se rechaza; desistir, desde cualquier abierta.
 * Una `pendiente` (sin firmar) NO se envía: sin firma la compañía no aplica nada.
 */
export function transicionCartaMediador(actual: EstadoCartaMediador, accion: AccionCartaMediador): EstadoCartaMediador | null {
  if (accion === 'enviada') return actual === 'firmada' ? 'enviada' : null
  if (accion === 'aceptada' || accion === 'rechazada') return actual === 'enviada' ? accion : null
  return ESTADOS_CARTA_ABIERTA.includes(actual) ? 'desistida' : null
}
