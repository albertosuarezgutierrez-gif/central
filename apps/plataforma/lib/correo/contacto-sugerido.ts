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
