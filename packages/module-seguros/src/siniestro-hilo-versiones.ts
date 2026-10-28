// Versiones de los mensajes del hilo de siniestro. PURO.
// El hilo es SOLO-AÑADIR (la BD prohíbe UPDATE/DELETE): «editar» un mensaje = añadir uno NUEVO con
// `meta.sustituyeA = <id del anterior>`. El anterior se conserva (auditoría) pero deja de ser «vigente».
// Plazos, espera a la compañía y contexto de la IA deben leer SOLO la última versión de cada cadena.

export type MensajeConVersion = {
  id: string
  creadoAt: string
  meta?: Record<string, unknown> | null
}

export type MensajeVigente<T extends MensajeConVersion> = T & {
  /** `true` = es una versión que sustituye a otra. */
  editado: boolean
  /** Ids de las versiones anteriores, de la más reciente a la original. `[]` si nunca se editó. */
  versionesAnteriores: string[]
  /** Fecha efectiva (`meta.fechaOriginal` si existe, si no `creadoAt`) del mensaje ORIGINAL de la cadena: editar una errata no reinicia un plazo legal. */
  creadoAtOriginal: string
}

/** `meta.fechaOriginal` (ISO válido: la fecha real de un mensaje volcado de la intranet) o `null`. */
export function fechaOriginalDe(m: { meta?: Record<string, unknown> | null }): string | null {
  const v = m.meta?.fechaOriginal
  return typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Date.parse(v)) ? v.trim() : null
}

/** Instante que cuenta para plazos y esperas: `meta.fechaOriginal` si existe; si no, `creadoAt`. */
export function instanteEfectivo(m: { creadoAt: string; meta?: Record<string, unknown> | null }): string {
  return fechaOriginalDe(m) ?? m.creadoAt
}

/** Día de Madrid (`YYYY-MM-DD`) de un instante ISO. */
export function diaMadridDeIso(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

/** `meta.sustituyeA` si es un id no vacío; si no, `null`. */
export function sustituyeADe(m: { meta?: Record<string, unknown> | null }): string | null {
  const v = m.meta?.sustituyeA
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/** Para cada id sustituido, el id del mensaje que lo sustituye (solo si el sustituido está en la lista). */
export function mapaSustituidoPor<T extends MensajeConVersion>(mensajes: readonly T[]): Map<string, string> {
  const ids = new Set(mensajes.map((m) => m.id))
  const out = new Map<string, string>()
  for (const m of mensajes) {
    const a = sustituyeADe(m)
    if (a !== null && a !== m.id && ids.has(a) && !out.has(a)) out.set(a, m.id)
  }
  return out
}

/** Solo la última versión de cada cadena, en el orden recibido. Un `sustituyeA` que no existe se ignora (el mensaje cuenta como original). */
export function hiloVigente<T extends MensajeConVersion>(mensajes: readonly T[]): MensajeVigente<T>[] {
  const porId = new Map(mensajes.map((m) => [m.id, m] as const))
  const sustituidos = mapaSustituidoPor(mensajes)
  const out: MensajeVigente<T>[] = []
  for (const m of mensajes) {
    if (sustituidos.has(m.id)) continue
    const anteriores: string[] = []
    const vistos = new Set<string>([m.id])
    let original: T = m
    let a = sustituyeADe(m)
    while (a !== null && !vistos.has(a)) {
      const prev = porId.get(a)
      if (!prev) break
      vistos.add(a)
      anteriores.push(a)
      original = prev
      a = sustituyeADe(prev)
    }
    out.push({ ...m, editado: anteriores.length > 0, versionesAnteriores: anteriores, creadoAtOriginal: instanteEfectivo(original) })
  }
  return out
}
