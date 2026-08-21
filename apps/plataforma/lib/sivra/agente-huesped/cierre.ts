// lib/sivra/agente-huesped/cierre.ts — coherencia de la DESPEDIDA con la fase de la reserva.
//
// Caso fundacional (20/08/2026, detectado por Alberto): a Pilar, que estaba EN PLENA ESTANCIA y
// preguntaba dónde dejar las maletas el domingo, el agente le auto-envió una respuesta correcta en
// el fondo… cerrada con «¡Que tengas un buen viaje!». Esa fórmula solo tiene sentido cuando el
// huésped está viajando: viniendo (antes de entrar) o volviéndose (el día de salida o después).
// Dicha a alguien que sigue en el piso suena a que le estamos despidiendo, o a plantilla.
//
// Dos capas, como el resto del agente:
//  1) `bloqueCierre()` → instrucción en el system prompt (lo que EVITA el fallo).
//  2) `revisarCierre()` → red determinista sobre el borrador ya generado (lo que lo CAZA cuando el
//     modelo la ignora): si la fórmula está aislada en su propia frase, se poda y el mensaje sale
//     igual de bien; si va entretejida con contenido real, no tocamos el texto y el mensaje pasa
//     por Alberto. Nunca reescribimos una frase con sustancia por nuestra cuenta.
import type { FaseReserva } from './fases'

// Fórmulas de VIAJE (desplazamiento). Válidas mientras el huésped viaja hacia aquí (pre-llegada y
// día de llegada) o de vuelta (día de salida y post-estancia). Nunca en mitad de la estancia.
const RE_VIAJE = /(?:buen|feliz|excelente)\s+(?:viaje|vuelo|regreso|retorno|camino)|buena\s+vuelta|vuelta\s+a\s+casa|(?:safe|good|great|pleasant)\s+(?:travels?|trip|flight|journey)|have\s+a\s+(?:safe|good|great|nice|lovely)\s+(?:trip|flight|journey|travel)|travel\s+safe|bon\s+voyage|bon\s+retour|gute\s+reise|gute\s+heimreise|buon\s+viaggio|buon\s+rientro/i

// Fórmulas de FIN DE RELACIÓN (nos despedimos hasta otra vez). Solo valen cuando la estancia se
// está acabando de verdad: el día de salida o después.
const RE_DESPEDIDA_FINAL = /hasta\s+(?:la\s+pr[oó]xima|otra|pronto)|vuelve\s+pronto|esperamos\s+ver(?:te|le|os)\s+de\s+nuevo|nos\s+encantar[ií]a\s+ver(?:te|le|os)\s+de\s+nuevo|come\s+back\s+soon|hope\s+to\s+see\s+you\s+again|see\s+you\s+(?:again|next\s+time)|[àa]\s+bient[ôo]t|bis\s+bald|a\s+presto/i

// ¿En esta fase el huésped está viajando (viniendo o volviéndose)?
function enViaje(fase: FaseReserva, esDiaSalida: boolean): boolean {
  return fase === 'pre-llegada' || fase === 'dia-llegada' || fase === 'post-estancia' || esDiaSalida
}

// ¿En esta fase se está cerrando la relación (se va o ya se ha ido)?
function enCierre(fase: FaseReserva, esDiaSalida: boolean): boolean {
  return fase === 'post-estancia' || esDiaSalida
}

// Instrucción para el system prompt: qué tipo de cierre encaja con el momento de la reserva.
export function bloqueCierre(fase: FaseReserva, esDiaSalida: boolean): string {
  if (fase === 'post-estancia') {
    return 'CIERRE: el huésped ya ha terminado su estancia, así que aquí SÍ encajan las fórmulas de despedida y de vuelta a casa («buen regreso», «hasta la próxima»).'
  }
  if (esDiaSalida) {
    return 'CIERRE: hoy es su día de salida, así que puedes despedirte y desearle buen viaje de vuelta.'
  }
  if (fase === 'pre-llegada' || fase === 'dia-llegada') {
    return 'CIERRE: el huésped todavía está de camino, así que puedes desearle buen viaje HASTA AQUÍ, pero NO te despidas como si su estancia hubiera terminado («hasta la próxima», «vuelve pronto», «buen regreso»): aún no ha llegado.'
  }
  return 'CIERRE: el huésped está EN MITAD de su estancia, así que NO uses fórmulas de viaje ni de despedida final («que tengas un buen viaje», «buen regreso», «hasta la próxima», «vuelve pronto»): no se va todavía, y suena a que le estás echando. Si cierras el mensaje, deséale que disfrute de Sevilla o de su estancia y ofrécete para cualquier cosa que necesite.'
}

// Trocea el borrador en frases conservando su puntuación y saltos de línea, para poder quitar UNA
// sin descolocar el resto.
function frases(texto: string): string[] {
  return texto.match(/[^.!?\n]+[.!?]*\n*/g) || []
}

// ¿Esta frase es SOLO la fórmula de despedida (con su envoltorio de cortesía), sin contenido propio?
// Se quita del texto la parte que casó con el patrón y se mira lo que sobra: «¡Que tengas un buen
// viaje!» deja «quetengasun» (relleno), mientras que «Que tengas un buen viaje y avísame si
// necesitas algo» deja una petición real que NO podemos tirar a la basura.
const RESTO_MAX = 14

function esSoloFormula(frase: string, re: RegExp): boolean {
  const sinFormula = frase.replace(re, ' ')
  const resto = sinFormula.replace(/[^\p{L}]/gu, '')
  return resto.length <= RESTO_MAX
}

export type RevisionCierre = {
  texto: string        // borrador (podado si se pudo corregir solo)
  podado: boolean      // se eliminó una frase de despedida fuera de fase
  incoherente: boolean // hay despedida fuera de fase y NO se pudo podar → que lo mire Alberto
}

// Red determinista sobre el borrador ya escrito. `fase`/`esDiaSalida` vienen de `faseReserva()`.
export function revisarCierre(reply: string, fase: FaseReserva, esDiaSalida: boolean): RevisionCierre {
  const texto = reply || ''
  const prohibidos: RegExp[] = []
  if (!enViaje(fase, esDiaSalida)) prohibidos.push(RE_VIAJE)
  if (!enCierre(fase, esDiaSalida)) prohibidos.push(RE_DESPEDIDA_FINAL)
  const re = prohibidos.find(r => r.test(texto))
  if (!re) return { texto, podado: false, incoherente: false }

  const trozos = frases(texto)
  const restantes = trozos.filter(f => !(re.test(f) && esSoloFormula(f, re)))
  const podado = restantes.join('').replace(/\n{3,}/g, '\n\n').trim()
  // Si no se pudo quitar nada, o quitarlo dejaría el mensaje vacío, o aún queda la fórmula
  // entretejida con contenido real → no tocamos el texto y que lo revise una persona.
  if (restantes.length === trozos.length || !podado || re.test(podado)) {
    return { texto, podado: false, incoherente: true }
  }
  return { texto: podado, podado: true, incoherente: false }
}
