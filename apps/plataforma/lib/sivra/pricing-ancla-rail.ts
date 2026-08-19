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
