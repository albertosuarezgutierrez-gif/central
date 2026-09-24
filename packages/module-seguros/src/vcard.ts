// Contactos para el móvil (23/09/2026). Alberto: «tenerlo en el móvil y saber
// quién es cada uno, y que diga si es lead o cliente».
//
// Un fichero .vcf (vCard 3.0, lo leen Android e iOS) con la cartera en vigor y
// los leads que se están trabajando. El nombre que se ve al recibir una llamada
// o un WhatsApp lleva detrás si es CLIENTE o LEAD.
//
// 🚨 Lo que NO lleva, a propósito: DNI, dirección, pólizas, primas. Un contacto
// del móvil se ve en la pantalla de bloqueo y se copia a otras apps; basta con
// saber quién es. La ficha entera está en el enlace de la nota.
//
// 🚨 Y se importa en el ALMACENAMIENTO DEL TELÉFONO, no en la cuenta de Google:
// la cuenta es un Gmail personal (medido el 23/09/2026) y subir ahí datos de
// clientes sería cederlos a un tercero sin contrato de encargado (RGPD).

export type GrupoContacto = 'cliente' | 'lead'

export type ContactoMovil = {
  clienteId: string
  nombre: string | null
  apellidos: string | null
  telefono: string | null
  email: string | null
  grupo: GrupoContacto
}

const ETIQUETA: Record<GrupoContacto, string> = { cliente: 'Cliente', lead: 'Lead' }

/** RFC 6350 §3.4: en un valor de texto se escapan `\`, `,`, `;` y el salto de línea. */
function esc(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\;').replace(/\r?\n/g, '\\n')
}

function limpio(v: string | null): string | null {
  const t = (v ?? '').replace(/\s+/g, ' ').trim()
  return t === '' ? null : t
}

/** Lo que se ve en pantalla: «Ana Pérez · AS Cliente». Sin nombre, se dice. */
export function nombreVisible(c: Pick<ContactoMovil, 'nombre' | 'apellidos' | 'grupo'>): string {
  const nombre = [limpio(c.nombre), limpio(c.apellidos)].filter(Boolean).join(' ') || '(sin nombre)'
  return `${nombre} · AS ${ETIQUETA[c.grupo]}`
}

/**
 * Una tarjeta, o `null` si no hay ni teléfono ni correo: un contacto sin forma
 * de reconocer una llamada o un mensaje solo ocupa sitio en la agenda.
 */
export function vcardContacto(c: ContactoMovil, opts: { urlFicha: string | null; fecha: string }): string | null {
  const tel = limpio(c.telefono)?.replace(/[^\d+]/g, '') || null
  const email = limpio(c.email)
  if (!tel && !email) return null
  const lineas = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `UID:asegura-${c.clienteId}`,
    `FN:${esc(nombreVisible(c))}`,
    `N:${esc(limpio(c.apellidos) ?? '')};${esc(limpio(c.nombre) ?? '')};;;`,
    'ORG:Grupo ASegura',
    `CATEGORIES:${esc(`Grupo ASegura ${ETIQUETA[c.grupo]}`)}`,
    ...(tel ? [`TEL;TYPE=CELL:${tel}`] : []),
    ...(email ? [`EMAIL;TYPE=INTERNET:${esc(email)}`] : []),
    `NOTE:${esc(`${ETIQUETA[c.grupo]} de Grupo ASegura (lista del ${opts.fecha}).${opts.urlFicha ? ` Ficha: ${opts.urlFicha}` : ''}`)}`,
    'END:VCARD',
  ]
  return lineas.join('\r\n')
}

/**
 * El fichero entero. Si un id sale dos veces (cliente y lead a la vez), gana
 * CLIENTE: es lo que hay que saber al descolgar.
 */
export function libroVcard(
  contactos: readonly ContactoMovil[],
  opts: { urlFicha: (clienteId: string) => string | null; fecha: string },
): { vcf: string; incluidos: number; sinCanal: number } {
  const porId = new Map<string, ContactoMovil>()
  for (const c of contactos) {
    const ya = porId.get(c.clienteId)
    if (!ya || (ya.grupo === 'lead' && c.grupo === 'cliente')) porId.set(c.clienteId, c)
  }
  const tarjetas: string[] = []
  let sinCanal = 0
  for (const c of porId.values()) {
    const t = vcardContacto(c, { urlFicha: opts.urlFicha(c.clienteId), fecha: opts.fecha })
    if (t) tarjetas.push(t)
    else sinCanal++
  }
  return { vcf: tarjetas.length ? `${tarjetas.join('\r\n')}\r\n` : '', incluidos: tarjetas.length, sinCanal }
}
