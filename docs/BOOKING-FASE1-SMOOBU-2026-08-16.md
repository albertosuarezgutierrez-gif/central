# Informe Fase 1 — Smoobu: +20% escaparate canal Booking
**Fecha:** 16 agosto 2026 · **Alcance:** 4 alojamientos · **Precios base:** NO tocados

---

## Resumen

**Ajuste aplicado y verificado dentro de Smoobu.** El push se forzó con el botón correcto. **La verificación en la extranet de Booking (paso A5) NO se pudo hacer: la extensión del navegador dejó de responder justo después del push y no recuperó.** El paso B (precios por ocupación) tampoco se llegó a explorar — no se aplicó nada.

---

## A) Ajuste +20% canal Booking

### Dónde está el campo

`Portales → Booking.com → ⚙ → /es/settings/channels/edit/14/price-synchronization`
(también accesible en `Precios → ··· Ajustes → Ajustes de Precio`, que muestra los 5 canales juntos)

**El ajuste NO existe por alojamiento.** Es un único campo a nivel de **canal**, que aplica a las 4 propiedades mapeadas. En esa misma pantalla, lo único que hay por propiedad es el mapeo de plan de tarifas y, en «Propiedades individuales», la disponibilidad (`Cantidad de días` / `Fecha fija`) — nada de precio.

Tal como preveías en tu punto A1: se aplicó igualmente, **solo al canal Booking**, y queda anotado.

### Valor antes → después

| Campo | Antes | Después |
|---|---|---|
| `priceDifference` («Ajuste de precios», canal Booking.com, id 14) | **0.00 %** | **20.00 %** |
| `enable_sync` («Habilitar sincronización de precios») | activado | activado (sin tocar) |

Verificado tras recargar la página: `Booking priceDifference=20.00 | sync=true`.

### Los otros canales, sin tocar

Comprobado uno a uno y después en la pantalla consolidada:

| Canal | Ajuste de precios |
|---|---|
| Airbnb | 0.00 % |
| **Booking.com** | **20.00 %** |
| Expedia | 0.00 % |
| Agoda | 0.00 % |
| HomeToGo | 0.00 % |

La web directa no aparece como portal con ajuste de precio, así que no se ve afectada.

### Mapeos de tarifa — verificados intactos

| Propiedad | Plan de tarifas Booking |
|---|---|
| Duplex Center | 43172214 - Standard Rate |
| House sevillana | 43163158 - Standard Rate |
| Busto Reform | 43171914 - Standard Rate |
| Luxury Busto | 43172500 - Standard Rate |

Coinciden con los IDs del inventario de la extranet. No se tocó ninguno.

### Push forzado

Guardar **no** basta, y Smoobu lo dice explícitamente en la pantalla:

> **Guardar:** actualiza tu ajuste porcentual. El nuevo ajuste porcentual solo se aplicará a los cambios de precio (nuevas entradas) que realices posteriormente.
> **Sobrescribir precios:** actualiza tu ajuste de precios y cambia tus precios inmediatamente. Las solicitudes suelen tardar unos minutos.

Se pulsó **«Sobrescribir precios»** (`Precios → ··· Ajustes → Ajustes de Precio → Sobrescribir precios`), **una sola vez**. Tras ello, el ajuste sigue en 20.00 % al reabrir la pantalla.

⚠️ **Matiz que debes conocer:** ese botón es **global**, no por canal ni por alojamiento. Al pulsarlo, Smoobu reenvía precios a los 5 portales conectados. Como Airbnb, Expedia, Agoda y HomeToGo están a 0 %, lo que recibieron son **sus mismos precios de siempre** — ningún valor cambia en ellos. Pero técnicamente sí hubo una reescritura hacia esos canales, porque Smoobu no ofrece un push selectivo. Si eso te incomoda, conviene saberlo antes de repetir la operación.

---

## Fechas de referencia para verificar (paso A5, pendiente)

Precios base en Smoobu para el **16.08.2026**, leídos antes del push y **sin modificar**:

| Alojamiento | Base Smoobu 16.08 | Esperado en extranet tras +20% |
|---|---|---|
| Luxury Busto | € 123 | **€ 147,60** |
| Busto Reform | € 107 | **€ 128,40** |
| Duplex Center | € 94 | **€ 112,80** |
| House sevillana | € 306 | **€ 367,20** |

El de Luxury (€123) coincidía **exactamente** con el Standard Rate que mostraba la extranet para el 16 ago, lo que confirma que el ajuste estaba en 0 % antes y que la referencia es buena. Tu estimación de €147-148 era correcta.

**Cómo completarlo cuando vuelva el navegador:**
`admin.booking.com → Calendario` de cada piso, rango 16 ago 2026, fila Standard Rate. Si a los ~15 min de la ventana de push no se refleja, es propagación pendiente — **no volver a pulsar «Sobrescribir precios»**.

---

## Hallazgo no previsto: PriceLabs

La pantalla de Precios de Smoobu lleva el rótulo **«Precios Sobrescritos por PriceLabs»**. Es decir, los precios base no los fijas a mano en Smoobu: los empuja **PriceLabs**. La cadena real es:

```
PriceLabs  →  precio base Smoobu  →  ×1,20 (ajuste canal Booking)  →  Standard Rate extranet
                                                                      ↓
                                          oferta 8% × Genius (10/15/20) × tarifa móvil 10%
```

Esto **no rompe nada** — al contrario, es la arquitectura ideal para lo que querías: PriceLabs sigue moviendo el base según demanda y el +20% viaja siempre encima, sin que haya que retocarlo. Pero conviene tenerlo presente: si algún día el markup «desaparece», el sitio donde mirar es este campo del canal, no PriceLabs.

---

## B) Precios por ocupación en Luxury — NO EJECUTADO

**No se aplicó nada y no se llegó a evaluar.** La extensión del navegador cayó en el momento en que iba a desplegar la vista por ocupación en `Precios → Luxury Busto → Precio base ⌄`.

Estado: **exactamente igual que antes de la sesión**. Sigue pendiente, y sigue siendo la vía correcta (Smoobu, en porcentaje) frente a la extranet (importes fijos por fecha sobre un plan XML sobrescrito).

Cuando se retome, hay que confirmar que Smoobu lo ofrece como **porcentaje o derivación del base**. Si solo ofreciera importes fijos por fecha, **no aplicarlo** — sería el mismo problema que en la extranet.

---

## Pendiente y bloqueado

| # | Qué | Por qué |
|---|---|---|
| 1 | **Verificación A5 en la extranet** | La extensión del navegador dejó de responder tras el push y no recuperó en ~5 min de reintentos espaciados. El push está enviado; falta comprobar la llegada. |
| 2 | **Paso B — precios por ocupación Luxury** | Mismo motivo. Nada aplicado, nada a medias. |

---

## Prohibiciones — control

- ❌ Precios base del calendario — **no tocados** (siguen 107 / 94 / 123 / 306 en Smoobu)
- ❌ Mínimos de estancia — **no tocados** (siguen en 2 noches donde estaban)
- ❌ Canal desconectado o reconfigurado — **no**
- ❌ Mapeos de tarifa — **no tocados**, verificados los 4
- ❌ Otros canales — **0.00 % los cuatro**, sin cambios de valor
- ❌ Avisos/asistentes de Smoobu — **ninguno aceptado**; el modal «Transferir precios de un año al siguiente» se abrió por error al buscar el push y se **canceló sin guardar**
