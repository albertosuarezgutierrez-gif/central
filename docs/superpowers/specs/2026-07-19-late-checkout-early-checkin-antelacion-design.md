# Diseño — Confirmación mismo día vs. con antelación (late check-out / early check-in) en el agente de huéspedes

> **Estado:** borrador de diseño (brainstorming). Aprobado por Alberto en conversación; pendiente de plan de implementación.
> **Fecha:** 2026-07-19
> **Módulo:** `apps/plataforma/lib/sivra/agente-huesped/*`

## 1. Motivación

Un huésped de Luxury Busto (reserva 145956056) pidió salir el domingo a las 12:00 en vez de las 11:00,
**5 días antes de la salida**. El borrador del agente decía "voy a consultarlo con el anfitrión" — no
resolvía la pregunta. Al comprobar el calendario a mano (Smoobu vía la tabla sincronizada `incomes`),
no había ninguna entrada para ese piso hasta 6 días después, así que la respuesta correcta era un "sí"
directo.

El caso destapa dos huecos reales en el agente:

1. **Late check-out no calcula disponibilidad.** Hoy `decidir.ts` fuerza SIEMPRE "no lo confirmes tú,
   dile que lo consultas" — nunca mira el calendario, a diferencia del early check-in (que sí tiene
   `nocheAnteriorLibre` desde el 23/06/2026).
2. **Ni el early check-in de hoy ni el futuro late check-out deberían prometer en firme con días de
   antelación.** Una reserva de última hora puede ocupar el hueco entre que se responde y el día en
   cuestión. El código actual del early check-in confirma en firme aunque falten varios días, sin ese
   matiz — mismo bug de fondo, dirección contraria.

Decisión de Alberto: cubrir **ambas** direcciones con la misma regla ("firme solo el mismo día, si no
se matiza"), pero **late check-out sigue escalando siempre** a Telegram (a diferencia del early check-in,
que ya es auto-enviable vía graduación) — el objetivo aquí es que el borrador que le llega ya sea
correcto, no automatizar el envío.

## 2. Enfoque

Extiende el patrón ya existente del early check-in (`disponibilidad.ts` + inyección en `contexto.ts` +
bloque de prompt tri-estado en `decidir.ts`) en vez de introducir un mecanismo nuevo.

**Alternativas descartadas:**
- *Fusionar `nocheAnteriorLibre` en una función bidireccional genérica* — tocaría código ya probado en
  producción por un ahorro marginal de líneas. Se mantiene como función espejo independiente.
- *Pasarle el calendario crudo a la IA y que decida ella si hay hueco* — contradice el principio ya
  establecido en el repo ("la IA narra, el código calcula": guardrail anti-invención, agente contable,
  cazador-deducciones). El cálculo de disponibilidad sigue siendo código puro, determinista y testeado.

## 3. Componentes

### 3.1 `disponibilidad.ts` — nueva función pura

Espejo de `nocheAnteriorLibre`: en vez de mirar si la noche ANTERIOR a una llegada está libre, mira si
el día de la salida coincide con la llegada de OTRA reserva (turnover el mismo día = no hay margen).

```ts
// ¿Hay otra reserva que ENTRA el mismo día en que este huésped SALE? Si la hay, el piso necesita
// turnover (limpieza + entrada de otro huésped) ese día → no hay margen para un late check-out.
export function entradaMismoDiaLibre(checkOut: string, estancias: Estancia[], selfId?: string | number): boolean {
  if (!checkOut) return false // sin fecha fiable → conservador: NO confirmar
  for (const e of estancias || []) {
    if (!e || !e.arrival) continue
    if (selfId != null && String(e.id) === String(selfId)) continue
    if ((e.type || '').toLowerCase() === 'cancellation') continue
    if (e.arrival === checkOut) return false // alguien entra ese mismo día
  }
  return true
}
```

Pequeño helper adicional para legibilidad (suma días, ya que hoy `disponibilidad.ts` solo resta):
```ts
export const sumarDias = (fecha: string, n: number): string => restarDias(fecha, -n)
```

### 3.2 `contexto.ts` — wiring con Smoobu

Igual patrón que el bloque de `earlyCheckinPosible` (líneas 112-125 actuales), pero con ventana hacia
delante desde `checkOut` (no hace falta mirar 30 días, con `checkOut` → `checkOut+2` sobra para detectar
una entrada el mismo día):

```ts
const departureDate = String(reserva?.departure || '').trim()
let lateCheckoutPosible = false
let lateCheckoutChequeado = false
if (apartmentId && departureDate) {
  const hasta = sumarDias(departureDate, 2)
  const estanciasSalida: any[] | null = await smoobuFetch(
    `/api/reservations?apartments[]=${apartmentId}&from=${departureDate}&to=${hasta}&showCancellation=false&pageSize=100`,
    { cache: 'no-store' },
  ).then(r => r.json()).then(d => (Array.isArray(d?.bookings) ? d.bookings : Array.isArray(d?.data) ? d.data : [])).catch(() => null)
  if (estanciasSalida !== null) {
    lateCheckoutChequeado = true
    lateCheckoutPosible = entradaMismoDiaLibre(departureDate, estanciasSalida, bookingId)
  }
}
```

Añade `lateCheckoutPosible` / `lateCheckoutChequeado` al type `Contexto` y al objeto devuelto, junto a
los ya existentes `earlyCheckinPosible` / `earlyCheckinChequeado`.

### 3.3 `reglas.ts` — detector de intención (para forzar el escalado)

`decidir.ts` no puede fiarse de que el clasificador de calidad (`debeEscalar`) siga escalando el late
check-out una vez el borrador ya responda bien — precisamente ESE es el objetivo del cambio, así que si
funciona, `debeEscalar` dejaría de escalarlo. Como Alberto quiere que siga escalando siempre, hace falta
un gate determinista, independiente de si el borrador es bueno o no:

```ts
// ¿Es una petición de LATE CHECK-OUT (salir más tarde de la hora oficial)? Distinto de una pregunta
// meramente informativa ("¿a qué hora es el check-out?"), que no debe forzar el escalado.
const RE_LATE_CHECKOUT = /late\s*check.?out|salida\s*tard[ií]a|salir\s*(un poco\s*)?m[aá]s\s*tarde|irnos?\s*m[aá]s\s*tarde|quedarnos?\s*(un poco\s*)?m[aá]s(\s*tiempo)?|ampliar\s*(la\s*)?salida|retrasar\s*(la\s*)?salida|leave\s*later|stay\s*(a bit\s*)?longer|later\s*check.?out|extend(er)?\s*(the\s*)?check.?out|check.?out\s*plus\s*tard|partir\s*plus\s*tard|sp[aä]ter\s*(aus)?check.?out/i

export function esSolicitudLateCheckout(text: string): boolean {
  return RE_LATE_CHECKOUT.test(text || '')
}
```

Heurística por regex, mismo estilo que `esSensible`/`RE_CIERRE`/`detectCategory` ya en el repo. Falsos
negativos caen al comportamiento actual (el clasificador de calidad decide); falsos positivos solo
significan una escalada de más a Telegram — coste bajo, encaja con "que siga escalando siempre".

### 3.4 `decidir.ts` — el cambio central

**(a) Matiz "mismo día vs. con antelación", en AMBOS bloques.**

Se calcula una vez, junto al resto de fechas: `const esDiaSalida = hoy === ctx.checkOut`.

- **Early check-in** (bloque existente, líneas 132-139): cuando `earlyCheckinPosible` es `true`, se
  bifurca por `esDiaLlegada` (ya existe como variable):
  - `esDiaLlegada` → confirmación firme, texto actual sin cambios.
  - si no → **nuevo matiz**: *"en principio SÍ va a ser posible (ahora mismo la víspera está libre),
    pero como pueden entrar reservas de última hora, no te lo confirmamos del todo hasta el mismo día
    de la llegada — dile que en principio no hay problema y que se lo confirmáis definitivamente esa
    mañana"*. El caso `false` (ocupada) y el caso "no chequeado" no cambian.

- **Late check-out** (bloque nuevo, sustituye la línea 155 actual): mismo patrón tri-estado + matiz,
  MÁS la sugerencia de consigna de equipaje cuando se declina (ver 3.4b):
  - No chequeado → ni confirma ni niega, dice que lo verifica y confirma en breve (igual que el
    early check-in sin comprobar).
  - Chequeado y posible (`entradaMismoDiaLibre`):
    - `esDiaSalida` → confirmación firme del horario pedido.
    - si no → mismo matiz que el early check-in: "en principio sí, te lo confirmamos el mismo día".
  - Chequeado y NO posible → declina explicando que ese día entra otro huésped, **y sugiere la
    consigna de equipaje** (dato ya en la `ficha` vía `bloqueEquipaje`, cero riesgo de invención) como
    alternativa para guardar las maletas mientras tanto.

**(b) Sugerencia de consigna al declinar (idea añadida por Alberto).**

El bloque de equipaje (`bloqueEquipaje(propertyId)`) ya viaja siempre dentro de `ctx.ficha`
(`contexto.ts` línea 140), así que el modelo YA tiene el dato — solo hace falta instruirlo a usarlo en
este caso concreto. Esto es una excepción explícita, igual que ya existen otras, a la REGLA DE ORO
("no añadas info no pedida"): declinar sin más deja al huésped sin alternativa; ofrecer la consigna es
ayuda directamente accionable, no relleno.

**(c) Forzar el escalado determinista.**

Tras calcular `needs_human` con la lógica actual (línea 197), añadir:
```ts
const needs_human = sensible || sentimiento === 'negativo' || inventado || escalaIA || esSolicitudLateCheckout(pregunta)
```
Y, si ese es el motivo (los demás no aplicaron), fijar `motivo = 'late check-out: requiere confirmación del anfitrión'`
para que en Telegram quede claro por qué escala (hoy `motivo` queda `''` si ningún otro gate saltó).

## 4. Manejo de errores / valores conservadores

Mismo criterio que el early check-in ya en producción: si el fetch a Smoobu falla o no hay fecha
fiable, `lateCheckoutChequeado=false` → el agente NUNCA afirma ni niega disponibilidad sin haberla
comprobado. No se cachea "libre" por defecto.

## 5. Testing

- `disponibilidad.test.ts`: casos para `entradaMismoDiaLibre` espejo de los ya existentes para
  `nocheAnteriorLibre` (libre, ocupado por entrada el mismo día, cancelación no cuenta, propia reserva
  excluida, fecha vacía → conservador).
- `reglas.test.ts`: casos positivos/negativos para `esSolicitudLateCheckout` (frases en ES/EN, y
  contraejemplo "¿a qué hora es el check-out?" que NO debe disparar el forzado).

## 6. Fuera de alcance (posible Fase 2)

Graduar el caso "mismo día + libre" de late check-out para auto-envío (como ya pasa con el early
check-in), dejando el caso "con antelación" u "ocupado" escalando siempre. No se implementa ahora —
Alberto quiere que late check-out siga escalando siempre mientras se rueda el patrón nuevo.
