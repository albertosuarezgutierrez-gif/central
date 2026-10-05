// TARIFICAR ≠ EMITIR (05/10/2026). El bot entra en portales donde, a dos clics de la cotización,
// está el botón que CONTRATA una póliza de verdad a nombre de un cliente. Este guard es la
// barrera: si la URL a la que se navega o el botón que se va a pulsar casa con el patrón, el
// trabajo se aborta como `error_definitivo` y NO se reintenta.
//
// Es deliberadamente bruto: «planta baja» o «datos del contratante» en un BOTÓN también lo
// disparan. Mejor un falso positivo (el adaptador rellena esos campos con `fill`/`selectOption`/
// `check`, no pulsando botones) que una póliza emitida por un bot.

// El patrón pedido (/emit|contrat|formaliz|suplement|anul|baja/i) NO casa con «emisión»/«emision»
// (no contiene «emit»): visto en rojo el 05/10/2026. Se añade `emisi` (una «remisión» también lo
// dispara: falso positivo aceptado).
export const PATRON_EMISION = /emit|emisi|contrat|formaliz|suplement|anul|baja/i

// Textos del formulario REAL de Allianz ePAC «Comunidades 2020» (captura del 05/10/2026) que
// materializan o inician una alta y que el bot NUNCA debe pulsar: «Aceptar» (acepta/guarda la
// oferta elegida), «NUEVA ALTA» (abre un alta nueva) y el radio «ELIJA UNA OPCIÓN» (elige modalidad
// para contratar). Se comparan sin tildes y tolerando separadores (`nueva_alta`, `NuevaAlta`).
// «aceptar» también casa con «Aceptar cookies»: falso positivo aceptado (fail-closed).
export const TEXTOS_BLOQUEADOS_ALTA: readonly RegExp[] = [
  /aceptar/i,
  /nueva[\s_+-]*alta/i,
  /elij[ae][\s_+-]*una[\s_+-]*opcion/i,
  // Login de ePAC: «RECUPERACIÓN DE CONTRASEÑA» dispara un cambio de credenciales de la cuenta.
  /recuperacion[\s_+-]*de[\s_+-]*contrasena/i,
]

// Sin «parameter properties» (`constructor(readonly x)`): `node --test` solo QUITA tipos y no las admite.
export class EmisionBloqueadaError extends Error {
  readonly tipo = 'emision' as const
  readonly donde: 'url' | 'boton'
  readonly texto: string
  constructor(donde: 'url' | 'boton', texto: string) {
    super(`guard_emision: ${donde} bloqueada (casa con el patrón de emisión): «${texto.slice(0, 200)}»`)
    this.name = 'EmisionBloqueadaError'
    this.donde = donde
    this.texto = texto
  }
}

/** Quita tildes para que «Emisión» o «Formalización» no se escapen por un acento. */
function plano(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function pareceEmision(texto: string | null | undefined): boolean {
  if (typeof texto !== 'string' || texto === '') return false
  let t = plano(texto)
  // Las URL pueden venir codificadas (`%C3%A9mitir`, `contrat%61r`): se decodifica si se puede.
  try {
    t = plano(decodeURIComponent(t))
  } catch {
    /* no era URI válida: se mira tal cual */
  }
  return PATRON_EMISION.test(t) || TEXTOS_BLOQUEADOS_ALTA.some((r) => r.test(t))
}

/** Lanza si la URL casa con el patrón. */
export function comprobarUrl(url: string): void {
  if (pareceEmision(url)) throw new EmisionBloqueadaError('url', url)
}

/**
 * Lanza si el botón a pulsar casa con el patrón. Se mira TODO lo que lo describe (texto visible,
 * `aria-label`, `title`, `value`, `id`, `name`, `href`): un botón con icono y `id="btnEmitir"`
 * también es emitir.
 */
export function comprobarBoton(descripciones: readonly (string | null | undefined)[]): void {
  for (const d of descripciones) {
    if (pareceEmision(d)) throw new EmisionBloqueadaError('boton', String(d))
  }
}
