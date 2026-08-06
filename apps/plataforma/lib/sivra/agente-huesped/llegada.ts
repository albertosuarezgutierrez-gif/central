// lib/sivra/agente-huesped/llegada.ts — política de LLEGADA TARDÍA + horario de atención.
//
// Caso fundacional (06/08/2026): a Daniela (Luxury Busto), que pedía entrar entre la 1:00 y las 2:00
// de la madrugada, el agente respondió —y AUTO-ENVIÓ— que «no podemos atender llegadas entre la 1:00
// y las 2:00» y que se buscara un hotel para la primera noche. Es FALSO y además comercialmente malo:
// la entrada es AUTÓNOMA (el huésped accede por su cuenta, nadie le recibe), así que a partir de la
// hora oficial de entrada NO hay hora límite y llegar de madrugada no es ningún problema. El agente
// se lo inventó porque en ninguna fuente ponía cuál es la política de llegadas tardías: el prompt le
// daba la hora de ENTRADA y él dedujo una hora de CIERRE que no existe.
//
// Lo que sí hay que avisar es lo contrario de lo que dijo: la ATENCIÓN al huésped es de 09:00 a 21:00
// (hora española). Fuera de ese horario no hay nadie respondiendo mensajes, así que quien llegue de
// noche debe llevarse resueltas las instrucciones de acceso ANTES de que cerremos.
//
// Por qué vive aquí y se inyecta en la `ficha` (mismo patrón que `parking.ts` / `equipaje.ts`):
// la ficha es la ÚNICA fuente de verdad del agente y la que valida el guardrail anti-invención, así
// que un dato que solo estuviera en el prompt seguiría siendo "inventado" aguas abajo.

export const HORARIO_ATENCION = { desde: '09:00', hasta: '21:00' } as const

// Bloque que se añade a la `ficha` del piso. El agente lo usará SOLO si el huésped pregunta por la
// hora de llegada o anuncia una llegada tardía (REGLA DE ORO: no añadir información no pedida).
export function bloqueLlegada(horaCheckIn = '15:00'): string {
  const entrada = horaCheckIn || '15:00'
  return [
    `LLEGADA TARDÍA — NO hay hora límite de entrada: el check-in es AUTÓNOMO (el huésped accede por su cuenta con sus instrucciones de acceso, nadie le recibe ni le abre), así que a partir de las ${entrada} puede llegar a CUALQUIER hora, incluida la madrugada. Llegar a la 1:00 o a las 3:00 de la mañana NO es ningún problema.`,
    `NUNCA le digas a un huésped que no se le puede atender por llegar tarde, ni le propongas cambiar su viaje, ni le sugieras un hotel u otro alojamiento para la primera noche: su reserva le da acceso al apartamento desde las ${entrada} de su día de llegada, llegue a la hora que llegue.`,
    `ATENCIÓN AL HUÉSPED: contestamos mensajes de ${HORARIO_ATENCION.desde} a ${HORARIO_ATENCION.hasta} (hora de España). Fuera de ese horario no hay nadie al otro lado. Por eso, a quien llegue después de las ${HORARIO_ATENCION.hasta} o de madrugada, confírmale que su llegada no es problema y pídele que revise y tenga a mano sus instrucciones de acceso ANTES de las ${HORARIO_ATENCION.hasta}, y que nos escriba cualquier duda mientras estemos operativos, porque a esas horas no podremos ayudarle.`,
  ].join('\n')
}

// ¿La hora `h` (0-23) cae fuera de nuestro horario de atención (09:00–21:00)?
export function fueraDeHorarioAtencion(h: number): boolean {
  return h < 9 || h >= 21
}

// Horas mencionadas en un texto, normalizadas a 0-23. Conservador a propósito: solo reconoce formas
// inequívocas de hora (12:30 · 1am · a las 2 · 23h), nunca un número suelto ("somos 2 personas").
export function horasDeTexto(text: string): number[] {
  let t = (text || '').toLowerCase()
  const horas: number[] = []
  const push = (raw: string, meridiano?: string) => {
    let h = parseInt(raw, 10)
    if (!Number.isFinite(h) || h < 0 || h > 24) return
    if (h === 24) h = 0
    if (meridiano) {
      const pm = /p/.test(meridiano)
      if (pm && h < 12) h += 12
      if (!pm && h === 12) h = 0
    }
    if (h > 23) return
    horas.push(h)
  }
  // Los patrones se aplican EN ORDEN de más específico a menos, y cada acierto se TACHA del texto:
  // si no, "at 6 pm" lo leería el patrón del meridiano como 18:00 y el de la preposición otra vez
  // como las 6 de la mañana → una llegada en horario se contaría como llegada de madrugada.
  const barrer = (re: RegExp, hora: number, meridiano = 0) => {
    t = t.replace(re, (...args: any[]) => {
      push(args[hora], meridiano ? args[meridiano] : undefined)
      return ' '.repeat(String(args[0]).length)
    })
  }
  // 1) HH:MM / HH.MM (con am/pm opcional) — cubre "01:00 - 02:00", "23.30", "11:30 pm".
  barrer(/\b(\d{1,2})[:.](\d{2})\s*(a\.?m\.?|p\.?m\.?)?/g, 1, 3)
  // 2) Hora escueta con meridiano — "1am", "11 pm".
  barrer(/\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)/g, 1, 2)
  // 3) Hora con sufijo horario — "23h", "22 horas".
  barrer(/\b(\d{1,2})\s*(?:h|hs|hrs|horas?|uhr|ore)\b/g, 1)
  // 4) Hora escueta introducida por preposición — "a las 2", "at 1", "sobre las 23", "gegen 22".
  barrer(/\b(?:a las|sobre las|hacia las|entre las|y las|las|at|around|about|towards|by|vers|gegen|verso le|alle)\s+(\d{1,2})\b/g, 1)
  return horas
}

// Señales de que el mensaje habla de LLEGAR / entrar al apartamento (no de otra cosa con horas).
const RE_LLEGADA = /lleg(?:o|ar|amos|ada|aremos|aríamos)|entrar|entrada|acceder|acceso|check.?in|arriv|coming|get there|ankunft|ankomm|einchecken|arriv[eé]e|arrivo|arrivare/i

// Señales explícitas de "tarde / de madrugada" que no dependen de leer una hora concreta.
const RE_NOCTURNO = /madrugada|medianoche|midnight|middle of the night|late (?:at )?night|very late|really late|late arrival|llegada tard[ií]a|lleg(?:o|ar|amos|aremos)\s+(?:muy\s+)?tarde|late check.?in|sp[aä]t(?:e)?s? (?:in der )?nacht|tard dans la nuit|nuit|notte fonda|tardi la notte/i

// ¿El huésped anuncia/pregunta por una llegada FUERA de nuestro horario de atención (09:00–21:00)?
// Exige señal de llegada + (hora fuera de horario O marcador nocturno explícito): así una pregunta
// normal ("¿puedo entrar a las 15:00?") no dispara el bloque y la REGLA DE ORO se mantiene.
export function esLlegadaFueraDeHorario(text: string): boolean {
  const t = text || ''
  if (!RE_LLEGADA.test(t)) return false
  if (RE_NOCTURNO.test(t)) return true
  return horasDeTexto(t).some(fueraDeHorarioAtencion)
}
