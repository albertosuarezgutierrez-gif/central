// Piezas PURAS del «elegir el piso en el Catastro» de `DireccionConfirmable`.

/** Hay calle Y número: «Calle San Vicente 40», «C/ Sierpes, 12». */
export const TIENE_NUMERO = /[a-záéíóúñ]\s*,?\s*\d+/i

/** `00` → «Bajo», `02` → «2º»; lo no numérico, tal cual («OD», «SS»). */
export function etiquetaPlanta(pt: string | null): string {
  if (pt === null || pt === '') return 'Pl. ?'
  if (/^-?\d+$/.test(pt)) {
    const n = Number(pt)
    return n === 0 ? 'Bajo' : n < 0 ? `Sótano ${-n}` : `${n}º`
  }
  return `Pl. ${pt}`
}

/**
 * La dirección tecleada, cortada tras el número del portal, con el piso
 * elegido: «Calle San Vicente 40, 2º 11». Lo que viniera detrás del número
 * (un piso escrito a mano) se sustituye por el del Catastro.
 */
export function conPiso(direccion: string, planta: string | null, puerta: string | null): string {
  // El número del PORTAL es el que va seguido de fin, coma o un piso: así «Calle 28 de
  // Febrero 5» no se corta en el 28.
  const m = direccion.match(/^(.*?\d+[a-z]?)(?=\s*(?:,|$|\d+\s*[ºª°]|(?:bajo|piso|planta|pta|puerta|esc)\b))/i)
  const base = (m ? m[1] : direccion).trim().replace(/,\s*$/, '')
  const piso = [planta !== null ? etiquetaPlanta(planta) : null, puerta].filter(Boolean).join(' ')
  return piso ? `${base}, ${piso}` : base
}
