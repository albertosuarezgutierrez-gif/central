/**
 * Qué se le dice al cliente cuando el ENLACE DIRECTO del correo de avisos no le abre la puerta.
 *
 * 🚨 Nunca un «Ha ocurrido un error.» seco (29/09/2026: un cliente respondió al correo «no puedo
 * entrar error»). Cuando el enlace falla, `Entrada.tsx` ya le deja en la pantalla de pedir código
 * con su correo puesto: el texto tiene que decirle QUÉ ha pasado (si se sabe) y QUÉ hacer, que
 * siempre es lo mismo — pulsar «Enviarme un código» y entrar con él.
 *
 * Puro y sin imports para poder probarlo con `node --test`. `motivo` es el `error` que devuelve
 * `/api/acceso/verificar` (o `error` si la respuesta no se pudo leer). Un motivo desconocido NO
 * cae al genérico: cae a un texto que igualmente le dice cómo entrar.
 */
export const PASO_SIGUIENTE = 'Pulsa «Enviarme un código» y entra con el código que te llegue al correo.'

export function textoFalloEnlace(motivo: string | null | undefined): string {
  switch (motivo) {
    case 'ya_usado':
      return `Ese enlace ya se usó: vale una sola vez. ${PASO_SIGUIENTE}`
    case 'caducado':
      return `Ese enlace ha caducado: vale 24 horas. ${PASO_SIGUIENTE}`
    case 'incorrecto':
      return `Ese enlace no corresponde a este correo. ${PASO_SIGUIENTE}`
    case 'demasiados_intentos':
      return 'Demasiados intentos desde esta conexión. Espera unos minutos y pide un código.'
    default:
      // `error`, `datos_invalidos` (enlace recortado al copiarlo) o cualquier otro: no sabemos
      // por qué, y no lo afirmamos; pero el camino para entrar es el mismo.
      return `No hemos podido abrir ese enlace. ${PASO_SIGUIENTE}`
  }
}
