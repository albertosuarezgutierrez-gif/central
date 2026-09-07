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
  /**
   * QUÉ está asegurado: marca, modelo, matrícula. Es un dato de la COSA, así
   * que lo ve hasta el nivel más bajo — quien conduce la furgoneta de su padre
   * necesita saber cuál es la furgoneta, y ese es literalmente el ejemplo con
   * el que se escribió este fichero.
   */
  bien: boolean
  /**
   * DÓNDE está el riesgo: la dirección del inmueble asegurado.
   *
   * 🚨 **DECISIÓN DE ALBERTO, 07/09/2026: se ve desde el nivel más bajo, igual
   * que la matrícula.** Hasta hoy este flag era `false` en `tarjeta` y además
   * estaba en `NUNCA_A_UN_TERCERO` (`autorizacion.ts`), con el argumento de que
   * la dirección de un hogar es la casa donde duerme el titular y por tanto un
   * dato de la PERSONA. Se le planteó así, con la alternativa de enseñar solo
   * la localidad, y eligió la dirección completa.
   *
   * El motivo, y por qué es coherente con el resto del fichero: **en un hogar
   * la dirección ES la identificación del bien**, exactamente el papel que
   * juega la matrícula en un auto. Sin ella, dos pólizas de hogar de la misma
   * compañía salen como dos filas idénticas y lo único que las distingue es el
   * número de póliza, que no se sabe nadie (medido en su propia bóveda el
   * 07/09/2026: dos «Occident · Hogar» indistinguibles).
   *
   * ⚠️ Sigue siendo un flag APARTE de `bien` y no se colapsa con él: es la
   * palanca para volver a cerrarlo sin tocar nada más si algún día se decide lo
   * contrario. Quien lo cambie, que cambie también el cepo de
   * `bien-asegurado.test.ts` a conciencia, no para que pase.
   */
  direccionRiesgo: boolean
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
  bien: true,
  // Ver el docblock del campo: identifica el inmueble, como la matrícula al
  // coche. Decisión de Alberto del 07/09/2026.
  direccionRiesgo: true,
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
