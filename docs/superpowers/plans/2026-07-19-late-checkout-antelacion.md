# Late check-out con disponibilidad real + matiz de antelación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El agente de huéspedes de SIVRA calcula disponibilidad REAL para el late check-out (espejo del
early check-in ya existente), y en ambos casos solo promete en firme el mismo día del hecho (llegada/salida);
con antelación, matiza que se confirma ese mismo día. Late check-out sigue escalando SIEMPRE a Telegram, pero
con un borrador que ya trae la respuesta correcta (y, si toca declinar, sugiere la consigna de equipaje).

**Architecture:** Extiende el patrón ya en producción del early check-in: función pura de disponibilidad en
`disponibilidad.ts` → wiring a Smoobu en `contexto.ts` → bloque de prompt tri-estado en `decidir.ts`. Nuevo
detector determinista en `reglas.ts` fuerza el escalado del late check-out independientemente de si el
clasificador de calidad (`debeEscalar`) decide que el borrador ya resuelve la pregunta.

**Tech Stack:** TypeScript puro (sin deps), `node --test` para las funciones puras, Next.js/Smoobu API para el
wiring (no testeable sin red — se verifica por revisión + los tests de las funciones puras que consume).

**Spec:** `docs/superpowers/specs/2026-07-19-late-checkout-early-checkin-antelacion-design.md`

---

## Task 1: `disponibilidad.ts` — función espejo `entradaMismoDiaLibre`

**Files:**
- Modify: `apps/plataforma/lib/sivra/agente-huesped/disponibilidad.ts`
- Modify: `apps/plataforma/lib/sivra/agente-huesped/disponibilidad.test.ts`

- [ ] **Step 1: Añadir los nuevos tests (fallarán: las funciones aún no existen)**

Edita `disponibilidad.test.ts`. Primero, la línea de import (línea 3) pasa de:
```ts
import { nocheAnteriorLibre, diaAnterior, restarDias } from './disponibilidad.ts'
```
a:
```ts
import { nocheAnteriorLibre, diaAnterior, restarDias, entradaMismoDiaLibre, sumarDias } from './disponibilidad.ts'
```

Y se añaden estos tests al final del archivo (después del último `test(...)`, que termina en la línea 43):

```ts
test('sumarDias', () => {
  assert.equal(sumarDias('2026-07-26', 2), '2026-07-28')
  assert.equal(sumarDias('no-fecha', 2), '')
})

test('sin otras estancias → el día de salida está libre para late check-out', () => {
  assert.equal(entradaMismoDiaLibre('2026-07-26', []), true)
})

test('otra reserva ENTRA el mismo día de la salida → OCUPADO (no hay late check-out)', () => {
  const otras = [{ id: 'B', arrival: '2026-07-26', departure: '2026-07-28' }]
  assert.equal(entradaMismoDiaLibre('2026-07-26', otras), false)
})

test('la siguiente reserva entra DÍAS después de la salida → libre', () => {
  const otras = [{ id: 'B', arrival: '2026-08-01', departure: '2026-08-13' }]
  assert.equal(entradaMismoDiaLibre('2026-07-26', otras), true)
})

test('la PROPIA reserva no cuenta como ocupación (late check-out)', () => {
  const otras = [{ id: 'SELF', arrival: '2026-07-26', departure: '2026-07-26' }]
  assert.equal(entradaMismoDiaLibre('2026-07-26', otras, 'SELF'), true)
})

test('las cancelaciones no ocupan (late check-out)', () => {
  const otras = [{ id: 'B', arrival: '2026-07-26', departure: '2026-07-28', type: 'cancellation' }]
  assert.equal(entradaMismoDiaLibre('2026-07-26', otras), true)
})

test('sin fecha de salida fiable → conservador (NO libre)', () => {
  assert.equal(entradaMismoDiaLibre('', []), false)
})
```

- [ ] **Step 2: Verificar que fallan**

Run (desde `apps/plataforma`): `node --test lib/sivra/agente-huesped/disponibilidad.test.ts`
Expected: FAIL — `entradaMismoDiaLibre is not a function` / `sumarDias is not a function` (import roto).

- [ ] **Step 3: Implementar las dos funciones**

Añade al final de `disponibilidad.ts` (después del cierre de `nocheAnteriorLibre`, que termina en la línea 35):

```ts

// Suma n días a una fecha YYYY-MM-DD (UTC). Complementario de restarDias, para ventanas hacia delante.
export const sumarDias = (fecha: string, n: number): string => restarDias(fecha, -n)

// ¿Hay otra reserva que ENTRA el mismo día en que este huésped SALE? Si la hay, el piso necesita
// turnover (limpieza + entrada de otro huésped) ese día → no hay margen para un late check-out.
// Espejo de nocheAnteriorLibre, pero mirando hacia delante desde la salida en vez de hacia atrás
// desde la llegada.
export function entradaMismoDiaLibre(checkOut: string, estancias: Estancia[], selfId?: string | number): boolean {
  if (!checkOut) return false // sin fecha fiable → conservador: NO confirmar late check-out
  for (const e of estancias || []) {
    if (!e || !e.arrival) continue
    if (selfId != null && String(e.id) === String(selfId)) continue // la propia reserva no cuenta
    if ((e.type || '').toLowerCase() === 'cancellation') continue   // cancelaciones no ocupan
    if (e.arrival === checkOut) return false // alguien entra ese mismo día
  }
  return true
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `node --test lib/sivra/agente-huesped/disponibilidad.test.ts`
Expected: PASS — `# tests 15`, `# pass 15`, `# fail 0` (8 tests previos + 7 nuevos).

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/disponibilidad.ts apps/plataforma/lib/sivra/agente-huesped/disponibilidad.test.ts
git commit -m "feat(agente-huesped): entradaMismoDiaLibre, espejo de nocheAnteriorLibre para late check-out"
```

---

## Task 2: `reglas.ts` — detector determinista `esSolicitudLateCheckout`

**Files:**
- Modify: `apps/plataforma/lib/sivra/agente-huesped/reglas.ts`
- Modify: `apps/plataforma/lib/sivra/agente-huesped/reglas.test.ts`

- [ ] **Step 1: Añadir los tests (fallarán)**

Edita `reglas.test.ts`. La línea de import (línea 3) pasa de:
```ts
import { detectLang, detectCategory, extractEarlyTime, PARKING_SPOTS } from './reglas.ts'
```
a:
```ts
import { detectLang, detectCategory, extractEarlyTime, PARKING_SPOTS, esSolicitudLateCheckout } from './reglas.ts'
```

Y se añaden estos tests al final del archivo (línea 16 en adelante):

```ts
test('esSolicitudLateCheckout: petición típica ES con comparación de horas', () =>
  assert.equal(esSolicitudLateCheckout('Sería posible salir el domingo a las 12:00 en vez de las 11:00?'), true))
test('esSolicitudLateCheckout: pregunta meramente informativa NO dispara', () =>
  assert.equal(esSolicitudLateCheckout('¿A qué hora es el check-out?'), false))
test('esSolicitudLateCheckout: pregunta informativa EN NO dispara', () =>
  assert.equal(esSolicitudLateCheckout('What time is checkout?'), false))
test('esSolicitudLateCheckout: "late check-out" explícito EN', () =>
  assert.equal(esSolicitudLateCheckout('Could we do a late check-out?'), true))
test('esSolicitudLateCheckout: "más tarde" ES', () =>
  assert.equal(esSolicitudLateCheckout('¿Podríamos salir un poco más tarde?'), true))
test('esSolicitudLateCheckout: "later than" EN con hora', () =>
  assert.equal(esSolicitudLateCheckout('Can we leave a bit later than 11am?'), true))
test('esSolicitudLateCheckout: "instead of" EN con horas', () =>
  assert.equal(esSolicitudLateCheckout('Is it possible to check out at 1pm instead of 11am?'), true))
test('esSolicitudLateCheckout: "quedarnos más tiempo" ES', () =>
  assert.equal(esSolicitudLateCheckout('Nos podemos quedar un poco más de tiempo?'), true))
test('esSolicitudLateCheckout: FR "partir plus tard"', () =>
  assert.equal(esSolicitudLateCheckout('Bonjour, pouvons-nous partir plus tard?'), true))
test('esSolicitudLateCheckout: cierre de cortesía NO dispara', () =>
  assert.equal(esSolicitudLateCheckout('Gracias por todo, un saludo'), false))
test('esSolicitudLateCheckout: mensaje sin relación NO dispara', () =>
  assert.equal(esSolicitudLateCheckout('¿Hay wifi?'), false))
```

- [ ] **Step 2: Verificar que fallan**

Run: `node --test lib/sivra/agente-huesped/reglas.test.ts`
Expected: FAIL — `esSolicitudLateCheckout is not a function`.

- [ ] **Step 3: Implementar el detector**

Añade al final de `reglas.ts` (después del cierre de `detectLang`, que termina en la línea 72):

```ts

// ¿Es una petición de LATE CHECK-OUT (salir más tarde de la hora oficial)? Distinto de una pregunta
// meramente informativa ("¿a qué hora es el check-out?"), que NO debe forzar el escalado a Alberto.
// Dos frentes: (a) palabras clave típicas de "salir/quedarnos más tarde"; (b) comparación explícita de
// horas ("a las 12 en vez de las 11") — la forma más habitual de pedirlo sin decir la palabra "tarde".
const RE_LATE_CHECKOUT_KEYWORDS = /late\s*check.?out|salida\s*tard[ií]a|salir\s*(un poco\s*)?m[aá]s\s*tarde|irnos?\s*(un poco\s*)?m[aá]s\s*tarde|quedar(nos)?\s*(un poco\s*)?m[aá]s(\s*tiempo)?|ampliar\s*(la\s*)?salida|retrasar\s*(la\s*)?salida|leave\s*(a bit\s*)?later|stay\s*(a bit\s*)?longer|later\s*check.?out|extend(er)?\s*(the\s*)?check.?out|check.?out\s*plus\s*tard|partir\s*plus\s*tard|sp[aä]ter\s*(aus)?check.?out/i
const RE_LATE_CHECKOUT_COMPARACION = /(salir|irnos|marcharnos|check.?out|leave|leaving).{0,30}(en vez de|en lugar de|instead of|rather than|au lieu de|later than).{0,15}\d{1,2}([:.]\d{2})?/i

export function esSolicitudLateCheckout(text: string): boolean {
  const t = text || ''
  return RE_LATE_CHECKOUT_KEYWORDS.test(t) || RE_LATE_CHECKOUT_COMPARACION.test(t)
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `node --test lib/sivra/agente-huesped/reglas.test.ts`
Expected: PASS — `# tests 20`, `# pass 20`, `# fail 0` (9 tests previos + 11 nuevos).

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/reglas.ts apps/plataforma/lib/sivra/agente-huesped/reglas.test.ts
git commit -m "feat(agente-huesped): esSolicitudLateCheckout, detector determinista para forzar el escalado"
```

---

## Task 3: `contexto.ts` — calcular disponibilidad de late check-out contra Smoobu

**Files:**
- Modify: `apps/plataforma/lib/sivra/agente-huesped/contexto.ts`

No es testeable con `node --test` (llama a la API real de Smoobu); se verifica por revisión de código
contra el patrón gemelo ya en producción (`earlyCheckinPosible`, líneas 105-125 del archivo actual) y por
el uso que hace `decidir.ts` en la Task 4.

- [ ] **Step 1: Ampliar el import de `disponibilidad`**

La línea 7 actual:
```ts
import { nocheAnteriorLibre, restarDias } from './disponibilidad'
```
pasa a:
```ts
import { nocheAnteriorLibre, restarDias, entradaMismoDiaLibre, sumarDias } from './disponibilidad'
```

- [ ] **Step 2: Añadir los dos campos nuevos al type `Contexto`**

Justo después de la línea `earlyCheckinChequeado: boolean  // ¿pudimos comprobarlo en Smoobu? (false = fetch falló / sin datos → NO afirmar disponibilidad)` (línea 28), añade:

```ts
  lateCheckoutPosible: boolean   // ¿está LIBRE el día de la salida (nadie más entra ese mismo día)?
  lateCheckoutChequeado: boolean // ¿pudimos comprobarlo en Smoobu? (false = fetch falló → NO afirmar disponibilidad)
```

- [ ] **Step 3: Calcular la disponibilidad, igual patrón que el early check-in**

Justo después del bloque que calcula `earlyCheckinPosible`/`earlyCheckinChequeado` (el `if (apartmentId && arrivalDate) { ... }` que termina en la línea 125, justo antes de `const direccion = [apt?.location?.street, ...`), añade:

```ts

  // ¿Se puede confirmar late check-out? Solo si NADIE entra el mismo día de la salida (si entra, el
  // piso necesita turnover: limpieza + la siguiente entrada). Mismo criterio conservador que el early
  // check-in: si el fetch falla, `chequeado=false` y NUNCA se afirma disponibilidad sin verificarla.
  const departureDate = String(reserva?.departure || '').trim()
  let lateCheckoutPosible = false
  let lateCheckoutChequeado = false
  if (apartmentId && departureDate) {
    const hasta = sumarDias(departureDate, 2) || departureDate
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

- [ ] **Step 4: Devolver los campos nuevos**

La línea del `return`:
```ts
    horaCheckIn, horaCheckOut, earlyCheckinPosible, earlyCheckinChequeado,
```
pasa a:
```ts
    horaCheckIn, horaCheckOut, earlyCheckinPosible, earlyCheckinChequeado,
    lateCheckoutPosible, lateCheckoutChequeado,
```

- [ ] **Step 5: Revisión manual (no hay test automático)**

Relee el archivo completo y confirma:
1. `departureDate` usa `reserva?.departure` (igual que `arrivalDate` usa `reserva?.arrival` unas líneas arriba) — NO `reserva?.checkOut` (ese campo no existe en la respuesta de Smoobu, el objeto trae `arrival`/`departure` como fechas y `check-in`/`check-out` como horas, ver comentario de `horario` más arriba en el mismo archivo).
2. El `catch(() => null)` del fetch deja `estanciasSalida = null` ante cualquier fallo de red/parseo, y por tanto `lateCheckoutChequeado` se queda en `false` — igual que el bloque gemelo del early check-in.
3. `bookingId` (el id de ESTA reserva, parámetro de `construirContexto`) se pasa como `selfId` a `entradaMismoDiaLibre` para que la propia reserva no se cuente a sí misma como conflicto.

- [ ] **Step 6: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/contexto.ts
git commit -m "feat(agente-huesped): calcular lateCheckoutPosible/Chequeado contra Smoobu"
```

---

## Task 4: `decidir.ts` — matiz de antelación (ambas direcciones) + bloque de late check-out + escalado forzado

**Files:**
- Modify: `apps/plataforma/lib/sivra/agente-huesped/decidir.ts`

Tampoco testeable con `node --test` (orquesta `aiComplete`, red). Se verifica por revisión manual con una
tabla de casos (Step 6) y porque las piezas de las que depende (`entradaMismoDiaLibre`,
`esSolicitudLateCheckout`) ya están testeadas en las Tasks 1 y 2.

- [ ] **Step 1: Añadir el import del detector**

La línea 20 actual:
```ts
import { faseReserva, aplicaEarlyCheckin } from './fases'
```
pasa a:
```ts
import { faseReserva, aplicaEarlyCheckin } from './fases'
import { esSolicitudLateCheckout } from './reglas'
```

- [ ] **Step 2: Calcular `esDiaSalida` junto a `esDiaLlegada`**

La línea 118 actual:
```ts
  const esDiaLlegada = fase === 'dia-llegada'
```
pasa a:
```ts
  const esDiaLlegada = fase === 'dia-llegada'
  const esDiaSalida = hoy === ctx.checkOut
```

- [ ] **Step 3: Matizar el bloque EARLY CHECK-IN existente por antelación**

El bloque actual (líneas 132-139):
```ts
  const entrada = ctx.horaCheckIn || '15:00'
  const earlyBlock = !aplicaEarlyCheckin(fase)
    ? ''
    : !ctx.earlyCheckinChequeado
      ? `EARLY CHECK-IN: ahora mismo NO hemos podido comprobar si la noche anterior está libre. Si el huésped pregunta por entrar antes de las ${entrada} o por dejar el equipaje, NO se lo confirmes NI se lo niegues: dile con amabilidad que lo verificas y se lo confirmas en breve (a más tardar el día antes de la llegada). NUNCA inventes disponibilidad ni des el early check-in por hecho.`
      : ctx.earlyCheckinPosible
        ? `EARLY CHECK-IN: la noche ANTERIOR está LIBRE, así que la entrada anticipada SÍ es posible${esDiaLlegada ? ' HOY MISMO, que es su día de llegada' : ''}. Si el huésped quiere entrar antes de las ${entrada} —o pregunta dónde dejar el equipaje mientras tanto—, puedes confirmarle el early check-in GRATIS (sin coste), sujeto a que el piso esté limpio y listo; pídele su hora estimada de llegada. NUNCA lo ofrezcas como servicio de pago NI digas que no puedes confirmarlo hasta el día anterior: si la víspera está libre, ya se lo puedes confirmar.`
        : `EARLY CHECK-IN: la noche anterior está OCUPADA por otros huéspedes, así que NO es posible entrar antes de las ${entrada} (el piso aún está ocupado y hay que limpiarlo). Explícalo con amabilidad y confirma que la entrada es a partir de las ${entrada}. NUNCA ofrezcas early check-in (ni gratis ni de pago) en este caso.`
```

pasa a (el único cambio es que la rama `ctx.earlyCheckinPosible` se bifurca por `esDiaLlegada` en vez de solo añadir una coletilla):

```ts
  const entrada = ctx.horaCheckIn || '15:00'
  const earlyBlock = !aplicaEarlyCheckin(fase)
    ? ''
    : !ctx.earlyCheckinChequeado
      ? `EARLY CHECK-IN: ahora mismo NO hemos podido comprobar si la noche anterior está libre. Si el huésped pregunta por entrar antes de las ${entrada} o por dejar el equipaje, NO se lo confirmes NI se lo niegues: dile con amabilidad que lo verificas y se lo confirmas en breve (a más tardar el día antes de la llegada). NUNCA inventes disponibilidad ni des el early check-in por hecho.`
      : ctx.earlyCheckinPosible
        ? esDiaLlegada
          ? `EARLY CHECK-IN: la noche ANTERIOR está LIBRE, así que la entrada anticipada SÍ es posible HOY MISMO, que es su día de llegada. Si el huésped quiere entrar antes de las ${entrada} —o pregunta dónde dejar el equipaje mientras tanto—, puedes confirmarle el early check-in GRATIS (sin coste), sujeto a que el piso esté limpio y listo; pídele su hora estimada de llegada. NUNCA lo ofrezcas como servicio de pago.`
          : `EARLY CHECK-IN: ahora mismo la noche anterior está LIBRE, así que EN PRINCIPIO la entrada anticipada antes de las ${entrada} SÍ va a ser posible. Pero como pueden entrar reservas de última hora antes de su llegada, NO se lo prometas en firme todavía: dile que en principio no hay problema y que se lo confirmáis definitivamente el día antes de su llegada. NUNCA lo ofrezcas como servicio de pago.`
        : `EARLY CHECK-IN: la noche anterior está OCUPADA por otros huéspedes, así que NO es posible entrar antes de las ${entrada} (el piso aún está ocupado y hay que limpiarlo). Explícalo con amabilidad y confirma que la entrada es a partir de las ${entrada}. NUNCA ofrezcas early check-in (ni gratis ni de pago) en este caso.`
```

- [ ] **Step 4: Sustituir el bloque LATE CHECK-OUT plano por el bloque tri-estado**

Justo después del bloque `earlyBlock` de arriba (antes de `const system = ...`), añade:

```ts

  // Late check-out: mismo patrón tri-estado que el early check-in, con el mismo matiz de "firme solo
  // el mismo día del hecho, si no se matiza". A diferencia del early check-in, esto SIEMPRE escala a
  // Alberto (ver esSolicitudLateCheckout más abajo) — el objetivo es que el borrador que le llega ya
  // traiga la respuesta correcta, no automatizar el envío.
  const salida = ctx.horaCheckOut || '11:00'
  const lateBlock = esPostEstancia
    ? ''
    : !ctx.lateCheckoutChequeado
      ? `LATE CHECK-OUT: ahora mismo NO hemos podido comprobar si el piso queda libre el día de la salida. Si el huésped pide salir más tarde de las ${salida}, NO se lo confirmes NI se lo niegues: dile con amabilidad que lo verificas y se lo confirmas en breve. NUNCA inventes disponibilidad.`
      : ctx.lateCheckoutPosible
        ? esDiaSalida
          ? `LATE CHECK-OUT: hoy mismo, que es su día de salida, no entra nadie más al piso, así que SÍ puedes confirmarle que puede salir más tarde de las ${salida} (a la hora que haya pedido, dentro de lo razonable).`
          : `LATE CHECK-OUT: ahora mismo no hay ninguna entrada programada para el día de su salida, así que EN PRINCIPIO SÍ va a ser posible salir más tarde de las ${salida}. Pero como pueden entrar reservas de última hora, NO se lo prometas en firme todavía: dile que en principio no hay problema y que se lo confirmáis definitivamente el mismo día de la salida.`
        : `LATE CHECK-OUT: ese mismo día entra otro huésped al piso, así que NO va a ser posible alargar la salida más allá de las ${salida} (hace falta limpiarlo y prepararlo para la siguiente entrada). Explícaselo con amabilidad y, como alternativa, ofrécele la consigna de equipaje del bloque CONSIGNAS de la ficha para que pueda dejar las maletas y seguir disfrutando de la ciudad hasta la hora que necesite.`
```

- [ ] **Step 5: Enganchar `lateBlock` en el prompt y forzar el escalado**

La línea 155 actual del `system` (dentro de la plantilla):
```ts
${!esPostEstancia ? `LATE CHECK-OUT: si piden salir más tarde de las ${ctx.horaCheckOut || '11:00'}, NO lo confirmes tú (depende de la reserva siguiente y de la limpieza): dile que lo consultas con el anfitrión y le confirmas.` : ''}
```
pasa a:
```ts
${lateBlock}
```

Las líneas 195-210 actuales:
```ts
  const escalaIA = (sensible || sentimiento === 'negativo' || inventado) ? false : await debeEscalar(ctx, pregunta, reply)

  const needs_human = sensible || sentimiento === 'negativo' || inventado || escalaIA
  // Un cierre de conversación (gracias/ok…) por defecto no requiere respuesta; cualquier otra cosa sí.
  // Si escalamos, SIEMPRE requiere respuesta (no se descarta a la ligera).
  const requiere_respuesta = needs_human ? true : !esCierre(pregunta)

  const motivo = inventado
    ? 'guardrail: dato no presente en las fuentes'
    : sensible
      ? 'mensaje sensible (queja/dinero/cambios/emergencia)'
      : sentimiento === 'negativo'
        ? 'sentimiento negativo'
        : escalaIA
          ? 'la respuesta no cubre bien la pregunta'
          : ''
```
pasan a:
```ts
  const escalaIA = (sensible || sentimiento === 'negativo' || inventado) ? false : await debeEscalar(ctx, pregunta, reply)
  // Late check-out SIEMPRE escala, pase lo que pase con el clasificador de calidad — si el borrador
  // ahora responde bien, `escalaIA` dejaría de marcarlo, y Alberto pidió que siguiera pasando por él.
  const lateCheckout = esSolicitudLateCheckout(pregunta)

  const needs_human = sensible || sentimiento === 'negativo' || inventado || escalaIA || lateCheckout
  // Un cierre de conversación (gracias/ok…) por defecto no requiere respuesta; cualquier otra cosa sí.
  // Si escalamos, SIEMPRE requiere respuesta (no se descarta a la ligera).
  const requiere_respuesta = needs_human ? true : !esCierre(pregunta)

  const motivo = inventado
    ? 'guardrail: dato no presente en las fuentes'
    : sensible
      ? 'mensaje sensible (queja/dinero/cambios/emergencia)'
      : sentimiento === 'negativo'
        ? 'sentimiento negativo'
        : escalaIA
          ? 'la respuesta no cubre bien la pregunta'
          : lateCheckout
            ? 'late check-out: requiere confirmación del anfitrión'
            : ''
```

- [ ] **Step 6: Revisión manual — tabla de casos**

Sin test automático posible (depende de `aiComplete`), traza a mano estos 6 casos contra el código final
y confirma que el bloque de prompt que se generaría es el esperado:

| `fase` | `lateCheckoutChequeado` | `lateCheckoutPosible` | `esDiaSalida` | Bloque esperado |
|---|---|---|---|---|
| `en-estancia` | `false` | — | — | "NO hemos podido comprobar... lo verificas y confirmas en breve" |
| `en-estancia` | `true` | `false` | — | "NO va a ser posible... ofrécele la consigna de equipaje" |
| `en-estancia` | `true` | `true` | `false` (con antelación) | "EN PRINCIPIO SÍ... NO se lo prometas en firme... confirmáis el mismo día" |
| `en-estancia` | `true` | `true` | `true` (mismo día) | "SÍ puedes confirmarle que puede salir más tarde" |
| `post-estancia` | — | — | — | `lateBlock === ''` (no se menciona, huésped ya se fue) |
| Cualquiera, `esSolicitudLateCheckout(pregunta)===true` | — | — | — | `needs_human=true` SIEMPRE, `motivo='late check-out: requiere confirmación del anfitrión'` si ningún otro gate saltó antes |

Confirma también que el caso real que motivó este cambio (mensaje de Manuel, "Sería posible salir el
domingo a las 12:00 en vez de las 11:00?", 5 días antes de la salida, piso libre hasta el 01/08) cae en
la fila 3 de la tabla: EN PRINCIPIO sí, matizado, y con `needs_human=true` por `esSolicitudLateCheckout`.

- [ ] **Step 7: Commit**

```bash
git add apps/plataforma/lib/sivra/agente-huesped/decidir.ts
git commit -m "feat(agente-huesped): late check-out con disponibilidad real + matiz de antelación en ambas direcciones"
```

---

## Task 5: Verificación final

**Files:** ninguno (solo comandos).

- [ ] **Step 1: Correr TODOS los tests del módulo del agente de huéspedes**

Run (desde `apps/plataforma`):
```bash
node --test lib/sivra/agente-huesped/*.test.ts
```
Expected: PASS en todos los archivos, incluidos los dos modificados (`disponibilidad.test.ts`,
`reglas.test.ts`) y el resto sin regresiones (`fases.test.ts`, `hilo.test.ts`, `atribucion.test.ts`,
`parking.test.ts`, `equipaje.test.ts`, `guardrail.test.ts`, `sensibilidad.test.ts`, `retoque.test.ts`,
`redactar.test.ts`, `horarios.test.ts`, `clave-dedup.test.ts`).

- [ ] **Step 2: Actualizar `CONTEXTO-SESIONES.md`**

Añade una entrada nueva (arriba del todo) resumiendo el cambio: late check-out ahora calcula
disponibilidad real (espejo del early check-in) y matiza la confirmación por antelación en ambas
direcciones, sigue escalando siempre a Telegram, y sugiere la consigna de equipaje al declinar. Referencia
al caso real (reserva 145956056, Luxury Busto) y al spec.

- [ ] **Step 3: Commit final**

```bash
git add docs/CONTEXTO-SESIONES.md
git commit -m "docs(memoria): anotar late check-out con disponibilidad real (PR pendiente)"
```

- [ ] **Step 4: Push y PR**

```bash
git push -u origin claude/late-checkout-response-fn6qw7
```
Crear PR draft (plantilla del repo si existe) resumiendo: qué se rompía (borrador de late check-out
siempre decía "voy a consultarlo", sin mirar el calendario), qué arregla (disponibilidad real + matiz de
antelación en ambas direcciones + siempre escala a Telegram + sugiere consigna al declinar), y el link al
spec.
