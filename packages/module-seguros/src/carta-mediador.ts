// La CARTA DE NOMBRAMIENTO DE MEDIADOR (spec 2026-09-21, «salida B», PR 6): el cliente se queda con
// su compañía y su póliza, pero nombra a la correduría como su corredor en ella. Convierte un lead en
// cliente sin tarificar ni gastar un euro, y la póliza empieza a entrar por CIMA.
//
// 🚨 La carta NO toca el contrato: ni prima, ni garantías, ni condiciones. Lo dice en su cara, porque
// es lo que el cliente firma y lo que teme al firmar.
// 🚨 Se firma en el portal pero no sale sola: la manda Alberto (su clic), y hasta que la compañía la
// acepta la póliza NO es nuestra — el estado `enviada` no es `aceptada`.

import { MEDIADOR } from './mediador.ts'

export type EstadoCartaMediador = 'pendiente' | 'firmada' | 'enviada' | 'aceptada' | 'rechazada' | 'desistida'

export const ESTADOS_CARTA_ABIERTA: readonly EstadoCartaMediador[] = ['pendiente', 'firmada', 'enviada']

export type DatosCartaMediador = {
  tomador: string
  compania: string | null
  numeroPoliza: string | null
  ramo: string | null
  /** `YYYY-MM-DD`: el día en que se compone y se firma. */
  fechaCarta: string
}

function fechaEs(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/**
 * El texto EXACTO que se firma y se manda. `null` si falta la compañía o el número: una carta que no
 * identifica la póliza no la puede aplicar nadie, y firmarla engañaría al cliente.
 */
export function cartaNombramientoMediador(d: DatosCartaMediador): string | null {
  const tomador = d.tomador.trim()
  const compania = d.compania?.trim()
  const numero = d.numeroPoliza?.trim()
  if (!tomador || !compania || !numero) return null
  const poliza = `la póliza nº ${numero}${d.ramo ? ` (${d.ramo})` : ''}`
  const { nombre, figura, claveDgsfp, nif } = MEDIADOR.identidad
  return [
    `A la atención de ${compania}`,
    '',
    `Asunto: nombramiento de mediador de ${poliza}`,
    '',
    `Yo, ${tomador}, tomador de ${poliza}, designo como mediador de dicha póliza a ${MEDIADOR.marca} ` +
      `(${nombre}, ${figura.toLowerCase()}, clave DGSFP ${claveDgsfp}, NIF ${nif}), con efecto desde la recepción de ` +
      'esta carta, y revoco cualquier designación anterior de mediador para ella.',
    '',
    'Este nombramiento no modifica el contrato: la prima, las garantías y las condiciones siguen siendo las mismas. ' +
      'Solo cambia quién me atiende y gestiona la póliza.',
    '',
    `Firmado electrónicamente el ${fechaEs(d.fechaCarta)}.`,
    tomador,
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
