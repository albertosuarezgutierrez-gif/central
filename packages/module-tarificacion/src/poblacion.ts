// Población de un CÓDIGO POSTAL con varias localidades (13/10/2026). PURO: ni BD, ni red.
//
// Algunos portales (Allianz ePAC Moto: «BUSCADOR DE POBLACIONES») enseñan, tras teclear el CP, una celda por población con
// el texto «CP- NOMBRE». Una sola → se pulsa. Varias → se casa EXACTA (salvo mayúsculas/tildes/espacios) con la `poblacion`
// del riesgo; si no casa con UNA, o no viene, el robot PARA y pide una persona (`requiere_humano`) con la lista. La persona
// elige en la bandeja (`eleccionPoblacion` = texto EXACTO de la celda). La IA NO elige poblaciones: no hay base para adivinar.
// Nombres de localidad: no son datos personales, pero la `poblacion` del cliente no se escribe en logs.

/** Prefijo del mensaje de «hay que elegir la población» (viaja como `eleccion` —antes `captcha`— → `requiere_humano`). */
export const PREFIJO_ELECCION_POBLACION = 'requiere_eleccion_poblacion:'
/** Opciones que se nombran en el mensaje (la lista completa viaja en `error.opcionesPoblacion`). */
export const MAX_OPCIONES_POBLACION = 12
/** Tope de la lista en el cable. */
export const MAX_OPCIONES_POBLACION_CABLE = 60
const MAX_TEXTO_OPCION = 120

/** Caracteres que `validarFormularioAuto` rechaza en el texto libre de población (única fuente del filtro). */
const CARACTERES_PROHIBIDOS = /[<>{}\[\]\\`$]|[\u0000-\u001f]/
export function tieneCaracteresProhibidos(texto: string): boolean {
  return CARACTERES_PROHIBIDOS.test(texto)
}

/** `codigo` = texto EXACTO de la celda del portal (lo que se vuelve a buscar para pulsarla); `etiqueta` = nombre legible. */
export type OpcionPoblacion = { codigo: string; etiqueta: string }

/** Clave de comparación: sin tildes, mayúsculas, espacios colapsados. */
export function clavePoblacion(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
}

/** «18102- AMBROZ» → { cp: '18102', nombre: 'AMBROZ' }. Otra forma → `null` (no se adivina). */
export function leerCeldaPoblacion(texto: string): { cp: string; nombre: string } | null {
  const m = /^\s*(\d{5})\s*-\s*(\S.*?)\s*$/.exec(texto.replace(/\s+/g, ' '))
  return m ? { cp: m[1], nombre: m[2] } : null
}

/** Celdas leídas → opciones (codigo = texto exacto de la celda). Celdas sin la forma «CP- NOMBRE» o duplicadas → fuera. */
export function opcionesPoblacionDesdeCeldas(textos: readonly string[]): OpcionPoblacion[] {
  const out: OpcionPoblacion[] = []
  for (const t of textos) {
    const c = leerCeldaPoblacion(t)
    if (!c || out.some((o) => o.codigo === t)) continue
    out.push({ codigo: t, etiqueta: c.nombre.replace(/\s+/g, ' ').trim() })
  }
  return out
}

export type ResolucionPoblacion =
  | { tipo: 'elegida'; opcion: OpcionPoblacion; por: 'unica' | 'poblacion' | 'eleccion' }
  | { tipo: 'ambigua'; opciones: OpcionPoblacion[] }
  | { tipo: 'ninguna' }

/**
 * Qué celda pulsar. Una sola opción → esa. Varias: `eleccionPoblacion` (texto exacto de la celda, de la bandeja) si está en
 * la lista; si no, la `poblacion` del riesgo si casa con UNA (por nombre normalizado); si no → `ambigua` (pide persona).
 * Nunca «la parecida»: sin coincidencia exacta y única, no se elige.
 */
export function resolverPoblacion(opciones: readonly OpcionPoblacion[], f: { poblacion?: string | null; eleccionPoblacion?: string | null }): ResolucionPoblacion {
  if (opciones.length === 0) return { tipo: 'ninguna' }
  if (opciones.length === 1) return { tipo: 'elegida', opcion: opciones[0], por: 'unica' }
  const ele = f.eleccionPoblacion?.trim() ?? ''
  if (ele !== '') {
    const casan = opciones.filter((o) => o.codigo.replace(/\s+/g, ' ').trim() === ele.replace(/\s+/g, ' ').trim())
    if (casan.length === 1) return { tipo: 'elegida', opcion: casan[0], por: 'eleccion' }
    // Una persona escogió y no casa con la lista: que decida una persona, nunca caer a la población de la ficha.
    return { tipo: 'ambigua', opciones: [...opciones] }
  }
  const k = clavePoblacion(f.poblacion ?? '')
  if (k !== '') {
    const casan = opciones.filter((o) => clavePoblacion(o.etiqueta) === k)
    if (casan.length === 1) return { tipo: 'elegida', opcion: casan[0], por: 'poblacion' }
  }
  return { tipo: 'ambigua', opciones: [...opciones] }
}

export function mensajeEleccionPoblacion(opciones: readonly OpcionPoblacion[]): string {
  const lista = opciones.slice(0, MAX_OPCIONES_POBLACION).map((o) => o.etiqueta)
  const resto = opciones.length - lista.length
  return `${PREFIJO_ELECCION_POBLACION} el código postal tiene ${opciones.length} poblaciones; elige una en la bandeja y reintenta: ${lista.join(' · ')}${resto > 0 ? ` (+${resto} más)` : ''}`
}

/** Valida la lista del cable (`error.opcionesPoblacion`). `null` = ausente, inválida o sin opciones ofrecibles; una opción estructuralmente mala invalida la lista y una con caracteres prohibidos se descarta. */
export function validarOpcionesPoblacion(v: unknown): OpcionPoblacion[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_OPCIONES_POBLACION_CABLE) return null
  const out: OpcionPoblacion[] = []
  for (const o of v) {
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return null
    const r = o as Record<string, unknown>
    if (typeof r.codigo !== 'string' || !r.codigo.trim() || r.codigo.length > MAX_TEXTO_OPCION) return null
    if (typeof r.etiqueta !== 'string' || !r.etiqueta.trim() || r.etiqueta.length > MAX_TEXTO_OPCION) return null
    // Una opción con caracteres que el formulario rechazaría no se ofrece (su elección daría 400): se descarta.
    if (tieneCaracteresProhibidos(r.codigo) || tieneCaracteresProhibidos(r.etiqueta)) continue
    out.push({ codigo: r.codigo.replace(/\s+/g, ' ').trim(), etiqueta: r.etiqueta.replace(/\s+/g, ' ').trim() })
  }
  return out.length > 0 ? out : null
}
