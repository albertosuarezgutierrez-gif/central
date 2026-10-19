// Sugerir alta de contacto de compañía desde el propio triaje (20/09/2026).
//
// El directorio (`compania_contactos`) lo mantiene una pasada manual de la
// skill `agente-correduria` minando el Gmail de vez en cuando — no hay nada
// que lo alimente en el momento. Esto NO da de alta a nadie (sería inventar
// un contacto sin que Alberto lo mirara): solo AVISA la primera vez que ve
// escribir a una persona de una aseguradora, para que decida si merece la
// pena añadirla. Una sugerencia rechazada sin querer no borra nada; un alta
// automática equivocada ensucia un directorio que hoy es de fiar.
//
// Puro: decide si un remitente PARECE una persona (no un buzón genérico) al
// que merece la pena sugerir. La cuenta de «es la primera vez que lo vemos»
// necesita `correo_triaje` y vive aparte, en `contacto-sugerido-consulta.ts`.
import { esDominioAseguradora } from './keywords.ts'

const LOCAL_GENERICO = [
  'mediadores', 'comunicacion.mediadores', 'no-reply', 'noreply', 'donotreply',
  'info', 'informacion', 'atencion', 'atencioncliente', 'clientes', 'contacto',
  'notificaciones', 'notificacion', 'avisos', 'newsletter', 'marketing', 'comunicacion',
]

function parteLocal(from: string): string | null {
  const f = (from || '').trim().toLowerCase()
  const at = f.indexOf('@')
  if (at <= 0) return null // sin '@' (o vacía antes de la '@') no es una dirección
  return f.slice(0, at)
}

/**
 * `true` cuando el remitente TIENE forma de persona (nombre.apellido@, o
 * cualquier cosa que no sea un buzón genérico conocido). Conservador: ante la
 * duda de si es genérico, se prefiere SUGERIR de más que callar una persona
 * real — la sugerencia la descarta Alberto con un vistazo; una persona real
 * que nunca se sugiere no se añade jamás.
 */
export function pareceContactoPersonal(from: string): boolean {
  const local = parteLocal(from)
  if (local === null) return false
  return !LOCAL_GENERICO.includes(local)
}

// ── Remitente que NO es una aseguradora (19/10/2026) ──────────────────────────────────────────────
// Caso real: un CLIENTE reenvió desde su gmail a hola@ el aviso «Devolución de Recibo MAPFRE». La IA lo
// clasificó como correo de correduría y, como la única puerta era «tiene forma de persona», el triaje lo
// propuso como «Posible contacto nuevo de aseguradora». Que el asunto o el cuerpo hablen de Mapfre o de un
// recibo no convierte al remitente en una compañía: lo decide SU DOMINIO, y solo los de `ASEGURADORAS`.

/** Proveedores de correo PERSONAL: quien escribe desde aquí es una persona, nunca una compañía. */
const DOMINIOS_PERSONALES = [
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'live.com',
  'live.es', 'msn.com', 'yahoo.com', 'yahoo.es', 'ymail.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'gmx.com', 'gmx.es', 'protonmail.com', 'proton.me', 'telefonica.net', 'movistar.es',
  'orange.es', 'vodafone.es', 'yandex.com', 'mail.com', 'zoho.com',
]

function dominio(from: string): string | null {
  const f = (from || '').trim().toLowerCase()
  const at = f.indexOf('@')
  return at > 0 && at < f.length - 1 ? f.slice(at + 1) : null
}

/** `true` = el remitente escribe desde un proveedor de correo personal (gmail, hotmail, outlook…). */
export function esDominioPersonal(from: string): boolean {
  const d = dominio(from)
  return !!d && DOMINIOS_PERSONALES.some((p) => d === p || d.endsWith('.' + p))
}

/** `true` = el remitente es de una aseguradora conocida y no de un correo personal. */
export function esRemitenteAseguradora(from: string): boolean {
  return !esDominioPersonal(from) && esDominioAseguradora(from)
}

/**
 * La puerta de la sugerencia «Posible contacto nuevo de aseguradora»: una PERSONA (no un buzón genérico)
 * de un dominio de ASEGURADORA conocida. Un gmail/hotmail o un dominio cualquiera, NUNCA — ante la duda,
 * callar: proponer a un cliente como contacto de compañía es peor que no sugerir a alguien.
 */
export function debeSugerirContactoAseguradora(from: string): boolean {
  return pareceContactoPersonal(from) && esRemitenteAseguradora(from)
}

/**
 * `true` = antes de tratar el correo como «de aseguradora», mirar si el remitente es un CLIENTE (ficha
 * con ese email). Solo si tiene dirección y no es de una compañía: el correo de Mapfre no se busca.
 */
export function buscarFichaDeRemitente(from: string): boolean {
  return dominio(from) !== null && !esRemitenteAseguradora(from)
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Aviso de Telegram (HTML) de un correo de un CLIENTE de la cartera. */
export function textoAvisoCorreoCliente(o: { nombre: string; asunto: string; url: string; anotado: boolean }): string {
  return [
    `📩 <b>Correo de tu cliente ${esc(o.nombre)}</b>: ${esc(o.asunto)}`,
    `👤 <a href="${esc(o.url)}">Abrir su ficha</a>`,
    o.anotado ? '📝 Anotado en su historial.' : '⚠️ NO he podido anotarlo en su historial: anótalo a mano.',
  ].join('\n')
}
