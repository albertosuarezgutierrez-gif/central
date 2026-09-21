// Los SUPUESTOS del ramo de auto: lo que viaja al tarificador cuando nadie ha
// preguntado el dato, y las dos reglas que impiden que un supuesto siga
// diciéndose después de que alguien SÍ lo haya dicho.
//
// Vive aquí, y no en `apps/asegura`, porque hacen falta en DOS sitios a la vez:
// el precalificador de asegura los mete en la petición, y la pantalla de
// plataforma tiene que poder DECIR cuál es el supuesto en el hueco del campo.
// Con una copia en cada app, el día que cambie uno la pantalla seguiría
// prometiendo el otro — y el corredor decidiría con un número que ya no viaja.

/**
 * Kilómetros al año que se declaran cuando el formulario no los recoge.
 *
 * Es la media declarada habitual en el mercado español, no una medición de
 * este cliente: por eso viaja marcado como supuesto (`suponer('kmAnuales', …)`)
 * y por eso la pantalla lo enseña como tal, con el campo VACÍO, en vez de
 * prerrellenarlo — un hueco se ve, un número puesto de oficio no.
 *
 * 🚨 Cambiarlo cambia el precio de TODAS las cotizaciones que no lo declaren,
 * y sin dejar rastro en ninguna pantalla. Por eso lo fija un test.
 */
export const KM_ANUALES_SUPUESTOS = 15000

/** Tope del vendor para `kilometersPerYear` (Max 9.999.999 en su esquema). */
export const KM_ANUALES_MAXIMO = 9_999_999

/**
 * Lee los kilómetros al año tal y como los teclea un corredor ESPAÑOL.
 * Devuelve el entero, o `null` si lo escrito no es un kilometraje.
 *
 * 🚨 `Number('15.000')` es **15**, no quince mil. En España el punto es el
 * separador de miles, y la propia pantalla imprime el supuesto como «15.000»
 * con `toLocaleString('es-ES')`: copiar lo que se lee y pegarlo en el campo
 * producía un `kilometersPerYear: 15` que NADA rechaza — ni la pantalla, ni
 * `revisarDatosAuto` (solo exige finito y ≥ 0), ni el vendor, que tarifica un
 * coche de 15 km al año y devuelve un precio bajo y firme por los 0,50€ ya
 * pagados. Un error de tecleo con forma de chollo.
 *
 * Reglas, todas por el mismo motivo (que no haya forma silenciosa de acertar
 * un número distinto del que se quería decir):
 * - El punto SOLO vale como separador de miles, y solo en su sitio:
 *   `15.000` sí, `1.5` no. Un grupo mal puesto se rechaza en vez de
 *   interpretarse.
 * - La coma NO se acepta: `15,5` km no es un kilometraje, es un decimal, y el
 *   vendor quiere un entero.
 * - Cero es «no lo sé» disfrazado de dato, no un coche parado: se rechaza.
 * - Nada de notación científica (`1e5`) ni signos: solo dígitos y puntos.
 */
export function kilometrosDesdeTexto(texto: string): number | null {
  const limpio = texto.trim().replace(/\s/g, '')
  if (limpio === '') return null
  // `12345` o `12.345` / `1.234.567`, nunca `1.5` ni `12.34.5`.
  if (!/^\d{1,3}(\.\d{3})*$/.test(limpio) && !/^\d+$/.test(limpio)) return null
  const n = Number(limpio.replace(/\./g, ''))
  if (!Number.isInteger(n) || n <= 0 || n > KM_ANUALES_MAXIMO) return null
  return n
}

/** Un supuesto tal y como lo emite el precalificador: qué campo y por qué. */
export type SupuestoConCampo = { campo: string }

/**
 * Quita de la lista de supuestos los campos que el corredor ha CORREGIDO.
 *
 * El precalificador supone ANTES de que lleguen las correcciones, así que su
 * lista habla del estado anterior: sin este filtro la pantalla pinta, junto al
 * precio que acaba de costar 0,50€, «este precio sale suponiendo kmAnuales:
 * 15000» cuando el corredor tecleó 8.000 y es ese el número que viajó. No es
 * un adorno desactualizado: es la pantalla afirmando sobre qué se ha
 * tarificado, y afirmándolo mal.
 *
 * Solo se quitan los campos que de verdad vienen con valor en las
 * correcciones: un campo ausente sigue siendo supuesto, y decirlo es el
 * trabajo de esta lista.
 */
export function supuestosVigentes<S extends SupuestoConCampo>(
  supuestos: S[],
  correcciones: Record<string, unknown> | undefined | null,
): S[] {
  if (!correcciones) return supuestos
  const corregidos = new Set(
    Object.entries(correcciones)
      .filter(([, v]) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === ''))
      .map(([k]) => k),
  )
  if (corregidos.size === 0) return supuestos
  return supuestos.filter((s) => !corregidos.has(s.campo))
}
