/**
 * Lead web de auto/moto (06/10/2026): reglas PURAS de `lib/lead-web-solicitud.ts`.
 *
 * La página `/datos/[token]` del portal trae RELLENOS el DNI y la fecha de nacimiento de la ficha
 * (decisión del 24/09/2026) y deja subir documentos a ESA ficha. El formulario web es anónimo y el
 * enlace se manda al teléfono que se TECLEÓ: con una ficha que ya existía (casada por email o por
 * teléfono) cualquiera podría escribir el email de un cliente y su propio móvil y ver sus datos. Por
 * eso el enlace automático es SOLO para una ficha recién nacida del formulario, sin DNI ni
 * nacimiento: no hay nada suyo que enseñar.
 */
export const TOPE_DIARIO_LEADS_WEB = 20
/** Ventana en la que una ficha cuenta como «recién creada por el formulario». */
export const HORAS_FICHA_RECIENTE = 1

export type FichaLeadWeb = {
  fuente: string | null
  /** `true` = la columna está vacía. Si no se ha podido mirar, no se llama aquí. */
  sinDni: boolean
  sinNacimiento: boolean
  fusionada: boolean
  horasDesdeAlta: number
}

export function fichaAptaParaEnlace(f: FichaLeadWeb): boolean {
  return (
    f.fuente === 'web' &&
    f.sinDni &&
    f.sinNacimiento &&
    !f.fusionada &&
    Number.isFinite(f.horasDesdeAlta) &&
    f.horasDesdeAlta >= 0 &&
    f.horasDesdeAlta <= HORAS_FICHA_RECIENTE
  )
}
