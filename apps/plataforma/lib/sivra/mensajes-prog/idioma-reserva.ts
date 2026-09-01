// lib/sivra/mensajes-prog/idioma-reserva.ts — ¿en qué idioma le escribimos? PURO.
//
// Hallazgo del 31/08/2026, comprobado contra Smoobu con dos reservas reales: el campo `language`
// NO viene siempre. En la de Booking llega `"es"`; en la de AGODA llega **vacío** — y esa reserva
// era de una huésped de Hong Kong con el portal en chino tradicional.
//
// El bug que eso destapa no es que no sepamos el idioma: es que el código trataba «vacío» y «es»
// como la MISMA cosa (`idiomaReserva !== 'es'` es falso en los dos casos), así que el mensaje salía
// en español y se anotaba `idioma='es'` — un «no lo sé» archivado como decisión. Es la regla de
// siempre: un dato que no está no es un dato que valga por defecto.
//
// Qué se hace con el hueco: se escribe igualmente en español (es lo único que sabemos redactar sin
// inventar) pero se DECLARA — en el registro y en el parte de Telegram— para que se pueda corregir
// a mano. No se adivina por el prefijo del teléfono ni por el país: un +852 no dice en qué idioma
// lee esa persona, y una traducción a un idioma equivocado es peor que el español.

export type IdiomaReserva = {
  /** Código ISO de 2 letras con el que se rotula el mensaje. */
  idioma: string
  /** false = la reserva NO publicó idioma; el 'es' es un relleno, no una elección. */
  conocido: boolean
  /** true = hay que traducir (idioma conocido y distinto del español). */
  traducir: boolean
}

export function decidirIdioma(raw: unknown): IdiomaReserva {
  const cod = String(raw ?? '').trim().toLowerCase().slice(0, 2)
  if (!cod) return { idioma: 'es', conocido: false, traducir: false }
  if (cod === 'es') return { idioma: 'es', conocido: true, traducir: false }
  return { idioma: cod, conocido: true, traducir: true }
}

/** Nota para el parte cuando el canal no publica el idioma. Vacía si no hay nada que declarar. */
export function notaIdioma(d: IdiomaReserva, canal?: string): string {
  if (d.conocido) return ''
  return `⚠️ La reserva no trae idioma${canal ? ` (canal ${canal})` : ''}: va en ESPAÑOL por defecto. Si el huésped no lo lee, hay que escribirle a mano.`
}
