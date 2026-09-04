/**
 * Qué ve cada papel en una póliza.
 *
 * La línea que sostiene la seguridad del portal: **dato de la COSA ≠ dato de la
 * PERSONA**. El conductor de la furgoneta necesita compañía, nº de póliza y el
 * teléfono de siniestros para resolver un golpe; no necesita —y no debe ver— la
 * prima que paga el dueño, su IBAN ni su DNI.
 *
 * Los cuatro niveles son CRECIENTES: lo que ve uno lo ve el siguiente. Un test
 * lo comprueba, para que nadie añada un campo a `tarjeta` y se lo olvide arriba.
 */
export const NIVELES = ['tarjeta', 'completo', 'gestionar', 'administrar'] as const
export type Nivel = (typeof NIVELES)[number]

export type CamposVisibles = {
  compania: boolean
  numeroPoliza: boolean
  coberturas: boolean
  telefonoSiniestros: boolean
  abrirParte: boolean
  prima: boolean
  recibos: boolean
  /**
   * Los siniestros ABIERTOS de esa póliza. Va aparte de `recibos` y de `prima`
   * porque no es un dato del contrato: es un HECHO DE LA VIDA de su dueño —
   * «tiene un parte abierto del 12/06»— y se puede leer sin ver un euro.
   *
   * 🚨 Estuvo SIN puerta hasta el 04/09/2026: `carteraDeIdentidad` los pegaba a
   * la póliza sin mirar el nivel, mientras prima, coberturas y recibos sí la
   * miraban. Un tercero con el alcance más bajo veía los siniestros abiertos de
   * quien le autorizó. No fallaba nada: salían, y punto.
   */
  siniestros: boolean
  iban: boolean
  dniTomador: boolean
  documentos: boolean
  crearPeticiones: boolean
  autorizarTerceros: boolean
}

const TARJETA: CamposVisibles = {
  compania: true,
  numeroPoliza: true,
  coberturas: true,
  telefonoSiniestros: true,
  abrirParte: true,
  prima: false,
  recibos: false,
  siniestros: false,
  iban: false,
  dniTomador: false,
  documentos: false,
  crearPeticiones: false,
  autorizarTerceros: false,
}

const COMPLETO: CamposVisibles = {
  ...TARJETA,
  prima: true,
  recibos: true,
  siniestros: true,
  iban: true,
  dniTomador: true,
  documentos: true,
}

const GESTIONAR: CamposVisibles = { ...COMPLETO, crearPeticiones: true }

const ADMINISTRAR: CamposVisibles = { ...GESTIONAR, autorizarTerceros: true }

const POR_NIVEL: Record<Nivel, CamposVisibles> = {
  tarjeta: TARJETA,
  completo: COMPLETO,
  gestionar: GESTIONAR,
  administrar: ADMINISTRAR,
}

export function camposVisibles(nivel: Nivel): CamposVisibles {
  return POR_NIVEL[nivel]
}
