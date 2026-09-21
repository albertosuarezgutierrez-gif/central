// Los SUPUESTOS del ramo de auto: lo que viaja al tarificador cuando nadie ha
// preguntado el dato.
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
