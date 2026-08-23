// apps/plataforma/lib/sivra/pricing-ancla-rail.ts
//
// Ancla del raíl ±max_change_pct del motor de precios de SIVRA.
//
// 🚨 Por qué existe (auditoría 19/08/2026). El raíl está documentado como tope "±X%/DÍA", pero
// el cron corre 3 veces al día: si cada pasada se ancla en el precio que dejó la anterior, el
// tope real del día es (1±X)³ — con X=0,20 eso es −49%/+73%. El fix del 18/07/2026 lo resolvió
// anclando en `ref24` (el último precio aplicado ANTES de hoy)… pero solo cuando ese precio
// existía, y buscándolo únicamente 7 días atrás. Quedaban DOS agujeros, y los dos se vieron
// escribiendo de verdad el 19/08/2026:
//
//   1. Fecha con histórico MÁS VIEJO que la ventana. Busto Reform 18/09/2026 llevaba sin
//      tocarse desde el 06/08 (13 días). Sin `ref24`, la 1ª pasada ancló en el precio vivo
//      —que casualmente era el mismo, 312€, y clavó el −20%: 250€— pero la 2ª ancló en esos
//      250€ y bajó a 200€. Total del día: −35,9% en una fecha de septiembre.
//
//   2. Fecha NUNCA escrita. Las 16 fechas de jun–ago 2027 de House Sevillana que entraron ese
//      día en el horizonte cayeron −36% en dos pasadas por lo mismo. Aquí no hay `ref24` que
//      ampliar: no existe histórico. Lo que sí existe es el precio con el que la fecha EMPEZÓ
//      el día, y ése es el ancla correcta.
//
// De ahí el orden de preferencia: el último precio de ayer si lo hay; si no, el precio con el
// que la fecha llegó a la primera pasada de HOY; y solo si tampoco (primera pasada del día), el
// precio vivo. Con eso el tope vuelve a ser por día de verdad, haya histórico o no.
//
// Nota sobre por qué `ref24` manda sobre `primeroHoy` cuando existen los dos: si alguien tocó
// un precio a mano en Smoobu, `primeroHoy` recoge ese cambio manual y `ref24` no. El contrato
// del raíl es «±X% respecto a lo que aplicó el motor ayer», así que gana `ref24` — un retoque
// manual no ensancha el raíl del motor.

/** Precio sobre el que se calcula el rango ±max_change_pct de la pasada. */
export function anclaRail(opts: {
  /** Último precio aplicado por el motor ANTES de hoy. `null` si la fecha no tiene histórico. */
  ref24?: number | null
  /** `old_price` de la PRIMERA pasada de hoy: con qué precio empezó el día la fecha. */
  primeroHoy?: number | null
  /** Precio vivo en Smoobu en esta pasada. Último recurso. */
  actual: number
}): number {
  const { ref24, primeroHoy, actual } = opts
  if (esPrecio(ref24)) return ref24
  if (esPrecio(primeroHoy)) return primeroHoy
  return actual
}

/**
 * Un ancla vale si es un número positivo.
 *
 * El 0 y los negativos se descartan a propósito en vez de colarse como ancla: un 0 haría que
 * `lo` y `hi` fueran 0 y el clamp dejaría el precio en 0€ — regalar la noche en lugar de
 * limitar su movimiento, que es lo contrario de lo que el raíl existe para hacer.
 */
function esPrecio(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
}

// ─────────────────────────────────────────────────────────────────────────────
// 🚨 TERCER agujero del raíl (auditoría 23/08/2026, hallazgo 🔴 3): las dos lecturas que
// alimentan el ancla —`ref24` y `anclaHoy`— colgaban de un `.catch(() => [])`. Un array vacío es
// LEGÍTIMO (una fecha sin histórico, la 1ª pasada del día), así que un fallo de lectura entraba
// por la MISMA puerta que el caso normal y `anclaRail()` caía a `actual` para TODAS las fechas.
// Con el cron corriendo 3 veces al día, el tope deja de ser ±X%/día y pasa a ±X%/PASADA.
//
// Es el MISMO agujero de arriba (−36% en 16 fechas de House en dos pasadas) entrando por otra
// puerta: allí faltaba histórico, aquí falla la consulta. Y que la consulta puede fallar no es
// teórico — el `42883` del 20/08 tumbó `sivra_canal` en esta misma cadena.
//
// La cura no es adivinar un ancla: es NO TARIFAR. Una pasada saltada cuesta seis horas de precio
// viejo; una pasada con el raíl ciego puede costar la mitad del precio de la noche.

/** Una lectura de ancla que reventó. `error` es el mensaje, recortado. */
export type LecturaAncla = { nombre: string; error: string }

/**
 * Tope REAL que queda cuando el ancla se pierde y cada pasada se ancla en la anterior.
 *
 * Se CALCULA en vez de escribirse a mano porque `max_change_pct` es por piso y el nº de pasadas
 * sale del cron: un «−49%/+73%» hardcodeado deja de ser verdad en cuanto cambie cualquiera de los
 * dos, y un aviso con un número falso es peor que uno sin número.
 */
export function topeRealSinAncla(maxChangePct: number, pasadasPorDia: number): { caidaPct: number; subidaPct: number } {
  const caida = 1 - Math.pow(1 - maxChangePct, pasadasPorDia)
  const subida = Math.pow(1 + maxChangePct, pasadasPorDia) - 1
  return { caidaPct: Math.round(caida * 1000) / 10, subidaPct: Math.round(subida * 1000) / 10 }
}

/**
 * Aviso de Telegram cuando la pasada se aborta por no poder leer el ancla. `null` si no hay fallos.
 *
 * Dice explícitamente que los precios se quedan como estaban Y por qué eso es lo correcto: si no,
 * «no se ha tarificado» se lee como una avería del motor y no como la salvaguarda que es.
 */
export function avisoRailCiego(
  fallos: LecturaAncla[],
  rail: { maxChangePct: number; pasadasPorDia: number },
): string | null {
  if (fallos.length === 0) return null
  const { caidaPct, subidaPct } = topeRealSinAncla(rail.maxChangePct, rail.pasadasPorDia)
  return (
    `🛑 *Pricing: pasada ABORTADA — no se ha podido leer el ancla del raíl*\n\n` +
    fallos.map(f => `• ${f.nombre}: ${f.error}`).join('\n') +
    `\n\nNO se ha tarificado nada, y es lo correcto: sin ancla, cada una de las ` +
    `${rail.pasadasPorDia} pasadas del día se anclaría en la anterior y el tope de ` +
    `±${Math.round(rail.maxChangePct * 100)}%/día pasaría a ser −${caidaPct}% / +${subidaPct}% ` +
    `en un solo día. Los precios se quedan como estaban.\n\n` +
    `La siguiente pasada lo reintenta sola. Si se repite, mira la BD (\`pricing_applied\`).`
  )
}
