import type { EscrituraBackfillDni } from '@/lib/correduria-puerto'

/**
 * Cuántos índices quedan por escribir, mirando el dato más FRESCO que haya.
 *
 * 🚨 Por qué no basta con la cifra del plan (05/09/2026, visto por Alberto en la
 * pantalla): esa cifra se calcula al CARGAR la página, y la escritura no la
 * cambia. Después de escribir los 476, el botón seguía diciendo «Escribir 476
 * índices» debajo de un «✅ Escritos 476. No queda ninguno pendiente» — las dos
 * cosas a la vez, y la de arriba invitando a pulsar otra vez para nada.
 *
 * El `router.refresh()` que dispara la escritura SÍ recalcula el plan, pero
 * tarda: el otro lado descifra las ~32.000 fichas antes de contestar. Durante
 * esos segundos la cifra vieja sigue en pantalla como si fuera la de ahora, que
 * es exactamente el fallo que este repo persigue en la BD —dar por bueno un
 * dato que no se ha vuelto a mirar— pero en la UI.
 *
 * La respuesta de la escritura ya trae `restantes`, contado por quien acaba de
 * escribir. En cuanto existe, manda ella.
 */
export function quedanPorEscribir(
  segunElPlan: number,
  resultado: EscrituraBackfillDni | null,
): number {
  // Un error (o una conexión cortada) NO dice cuántas quedan: puede haberse
  // escrito todo, nada o la mitad. Ahí se mantiene la del plan, que es lo
  // último que se supo de verdad, y el aviso de al lado explica el resto.
  if (resultado === null || resultado.estado !== 'ok') return segunElPlan
  return resultado.restantes
}
