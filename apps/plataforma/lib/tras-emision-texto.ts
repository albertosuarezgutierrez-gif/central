// Cómo se cuenta lo que pasó DESPUÉS de emitir (baja de la anterior + correo al cliente). PURO y sin
// dependencias de Node: lo usan el Telegram del asistente, la ruta del botón de la póliza y la pantalla
// de emisión (componente de cliente). Una sola forma de contarlo en los tres sitios.
import type { TrasEmision } from './retarificar-asegura.ts'

const CORREO_TRAS: Record<NonNullable<TrasEmision['correo']>, string> = {
  no_resuelve: '📧 NO se ha avisado al cliente: su correo no le lleva a SU ficha en el portal (hay otra ficha con ese correo). Resuelve el duplicado y reenvíalo desde la póliza nueva.',
  no_comprobado: '📧 NO se ha avisado al cliente: no se pudo comprobar a qué ficha le lleva su correo. Reenvíalo desde la póliza nueva.',
  incierto: '📧 No sé si le ha llegado el correo: se cortó con el proveedor y pudo salir. Míralo en su ficha ANTES de reenviarlo.',
  enviado: '📧 Se le ha enviado al cliente el correo de su nuevo seguro.',
  sin_email: '📧 NO se ha avisado al cliente: su ficha no tiene correo.',
  baja_de_correo: '📧 NO se ha avisado al cliente: se dio de baja del correo. Llámale.',
  ilegible: '📧 NO se ha avisado al cliente: su correo no se puede descifrar (clave PII en central-asegura).',
  sin_portal: '📧 NO se ha avisado al cliente: falta la URL del portal (ASEGURA_PORTAL_URL).',
  apagado: '📧 El correo al cliente está apagado (ASEGURA_CORREO_EMISION=0).',
  sin_proveedor: '📧 NO se ha avisado al cliente: central-asegura no tiene proveedor de correo.',
  rechazado: '📧 NO se ha avisado al cliente: el proveedor de correo rechazó el mensaje.',
  error: '📧 No sé si le ha llegado el correo al cliente: falló al enviarlo. Míralo en su ficha.',
}

/** PURO. Lo que pasó después de emitir; sin dato, se dice que no se sabe (nunca «hecho»). */
export function lineasTrasEmision(t: TrasEmision | null | undefined): string {
  if (!t) return '\n\n❔ No sé si se ha avisado al cliente ni si se ha abierto la baja de la anterior: míralo en su ficha.'
  if (t.enCurso) return '\n\n⏳ El aviso al cliente y la baja de la anterior siguen en marcha: en un minuto lo tienes en la póliza nueva.'
  const l: string[] = []
  if (t.baja === 'en_curso') l.push('✍️ La baja de la póliza anterior ya estaba firmada o comunicada: no hay nada más que firmar.')
  else if (t.baja === 'abierta') l.push('✍️ La baja de la póliza anterior está abierta y esperando su firma en el portal; al firmar sale sola a la compañía si su buzón de bajas ya está elegido (si no, te llegará a «Hoy»).')
  else if (t.baja === 'sin_datos') l.push('⚠️ NO se ha podido abrir la baja de la póliza anterior (faltan datos o ya no está en vigor): gestiónala desde su ficha.')
  else if (t.baja === 'error') l.push('⚠️ Falló al abrir la baja de la póliza anterior: gestiónala desde su ficha.')
  l.push(t.correo ? CORREO_TRAS[t.correo] : '📧 No sé si se ha avisado al cliente.')
  return `\n\n${l.join('\n')}`
}

