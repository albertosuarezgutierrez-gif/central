// El saludo de entrada del portal: «Buenas tardes, Alberto». Puro y sin BD.
//
// ── Por qué existe (07/09/2026) ─────────────────────────────────────────────
//
// Alberto: «me gustaría que al entrar el cliente sea más ameno, no tan frío».
// La bóveda abría con «Mis seguros» y una tarjeta de vencimientos: correcto y
// glacial.
//
// ── 🚨 Las dos formas de que un saludo salga PEOR que no saludar ────────────
//
// 1. **Saludar a nadie.** «Buenos días, cliente» o «Buenos días, ,» es peor que
//    un titular seco: delata que no sabemos quién ha entrado. Por eso
//    `nombreDePila` devuelve `null` en cuanto duda, y la pantalla saluda sin
//    nombre en vez de rellenar el hueco.
// 2. **Saludar a la hora equivocada.** «Buenos días» a las once de la noche.
//    Y esto es fácil de romper sin enterarse: el servidor de Vercel corre en
//    UTC, así que la hora «del servidor» y la de quien mira se separan una o
//    dos horas — a la 01:00 de Madrid en UTC son las 23:00 o las 00:00, o sea
//    otro tramo del día. La zona entra como parámetro y NO se da por hecha.
//
// El porqué de `nombreDePila` (medición de la cartera incluida) vive con ella
// en `module-seguros/src/nombre-de-pila.ts`.

/** Los tres tramos, con el texto exacto que se pinta. */
export const TRAMOS = ['Buenos días', 'Buenas tardes', 'Buenas noches'] as const
export type Tramo = (typeof TRAMOS)[number]

/**
 * Qué se dice a esta hora.
 *
 * 6-13 mañana · 13-21 tarde · resto noche. Los cortes son los del castellano
 * hablado, no los del reloj: a las 14:00 en España se dice «buenas tardes»
 * aunque el mediodía haya pasado hace dos horas.
 *
 * 🚨 `zona` es obligatoria a propósito. Sin ella, `getHours()` daría la hora del
 * proceso —UTC en Vercel— y el saludo se equivocaría de tramo una o dos horas
 * al día, todos los días, sin que nada fallara.
 */
export function saludoPorHora(ahora: Date, zona: string): Tramo {
  const hora = Number(
    new Intl.DateTimeFormat('es-ES', {
      timeZone: zona,
      hour: 'numeric',
      hour12: false,
    }).format(ahora),
  )
  // `Intl` devuelve 24 para la medianoche en algunas plataformas.
  const h = hora === 24 ? 0 : hora
  if (h >= 6 && h < 13) return 'Buenos días'
  if (h >= 13 && h < 21) return 'Buenas tardes'
  return 'Buenas noches'
}

// `nombreDePila` bajó a `@central/module-seguros` el 08/09/2026 (la usa también
// el mensaje de WhatsApp de plataforma). Se re-exporta para no mover a nadie.
export { nombreDePila } from '@central/module-seguros'
