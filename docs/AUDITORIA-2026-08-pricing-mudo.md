# Auditoría — dónde es MUDO un fallo en la cadena de pricing (23/08/2026)

> **Alcance acotado** (pedido de Alberto): mercado → canal → motor (`apply`) → Smoobu.
> **Pregunta única en cada eslabón: si esto falla hoy, ¿quién se entera?**
> No se ha tocado nada. Esto es inventario; qué se arregla lo decides tú.
>
> **Por qué ahora.** En cinco días aparecieron CUATRO fallos silenciosos distintos en esta misma
> cadena: el cron de canal muerto por `date - bigint` (20/08, PR #1530), el suelo de PriceLabs
> inerte tapado por un `.catch(() => [])` (20/08, mismo PR), la desviación medida en un solo punto
> que se saltaba House sin declararlo (21/08, PR #1582) y el corpus sombreado que dejó a House sin
> tarifar un día entero (22/08, PR #1594). **Los cuatro se encontraron de rebote, mirando otra cosa.
> Ninguno lo cazó un vigía.** Eso es lo que se audita aquí: no los bugs, la sordera.

## Resumen

| # | Hallazgo | Sev | Estado |
|---|---|---|---|
| 1 | `apply-auto` — el eslabón que ESCRIBE precios — no tiene latido | 🔴 | ✅ **CERRADO 23/08/2026** |
| 2 | Un fallo de escritura en Smoobu es mudo, y `pricing_applied` se escribe igual | 🔴 | ✅ **CERRADO 23/08/2026** |
| 3 | El raíl de ±20%/día se ensancha a ±20%/pasada si falla una lectura | 🔴 | ✅ **CERRADO 23/08/2026** |
| 4 | 8 de las 11 lecturas del motor degradan sin declararse | 🟡 | ✅ **CERRADO 24/08/2026** |
| 5 | El watchdog de la cadena existe y no lo lee nadie | 🟡 | ✅ **CERRADO 24/08/2026** |
| 6 | Cinco jobs de la cadena sin latido | 🟡 | ✅ **CERRADO 24/08/2026** |
| — | Lo que SÍ está vigilado (**13** latidos con sonda tras cerrar el nº6) | 🟢 | — |

---

## 🔴 1 · El eslabón que escribe precios es el único sin latido

> ✅ **CERRADO el 23/08/2026.** Latido `sivra_pricing_apply` (umbral **26 h**, razonado sobre el
> horario real del cron: hueco legítimo máximo 20:30→08:30 = 12 h, comprobación a las 07:45; los
> 30 h de los crons diarios no llegarían a saltar hasta perder día y medio). Escribe latido de
> INTENTO al arrancar, así que un 504 a mitad se distingue de «no se dispara». Detalle en
> `apps/plataforma/CLAUDE.md`.

De los jobs de la cadena, **siete registran latido** (`sivra_mercado_sweep`,
`sivra_mercado_booking`, `sivra_eventos`, `sivra_eventos_verificar`, `sivra_pricing_guard`,
`sivra_canal`, `smoobu_sync`). **`apply-auto` no.**

Es el que corre tres veces al día y el único que toca el precio que ve el huésped.

Consecuencia medida el 22/08: `pricing_applied` con cero filas no distingue «corrió y nada cruzó
el umbral del 3%» de «no corrió». Hubo que resolverlo comparando patrones históricos de otros
días — no con un dato.

Hay una entrada `pricing` en `AGENTES_VIGILADOS`, pero vigila **otra cosa**: la Rutina semanal
(`pricing_decisiones.ciclo_at`), no el cron que aplica.

`apps/plataforma/lib/monitoring/latidos.ts:116` · `apps/plataforma/app/api/cron/agentes-latido/route.ts:35`

## 🔴 2 · Si Smoobu rechaza la escritura, no se entera nadie

> ✅ **CERRADO el 23/08/2026.** El rechazo sale por Telegram (sin dedupe: es una avería viva del
> canal), marca `ok:false` y tiñe el latido. **Y el `INSERT INTO pricing_applied` ya no ocurre
> cuando la escritura falló** — que era el agravante y la mitad menos obvia: esa tabla es de donde
> sale `ref24`, el ancla del raíl del día siguiente, así que un precio fantasma no solo mentía en
> la auditoría, se convertía en el punto desde el que se mide el ±20% del día siguiente.

```ts
// apps/plataforma/app/api/sivra/pricing/apply/route.ts:954
written = res.ok
if (!res.ok) results.push({ property: r.property_id, error: `Smoobu POST ${res.status}` })
```

Ese `error` va **solo** al array `results` de la respuesta HTTP. No marca `ok:false`
(`ok: !eventosIlegibles && !plIlegible`, línea 1095), no manda Telegram, y no hay latido que
pudiera recogerlo. Es exactamente el patrón del `skipped: "datos_insuficientes"` que el PR #1594
acaba de sacar del silencio, un eslabón más abajo.

**Y hay un agravante:** el `INSERT INTO pricing_applied` (línea 962) ocurre **con independencia**
de que el POST haya funcionado, y su propio fallo se traga con `catch { /* no crítico */ }`. O sea
que la tabla de auditoría puede decir «aplicado 481€» con Smoobu manteniendo 534€ — y al revés.

**Comprobado a mano hoy: no está ocurriendo.** De las 526 fechas que el motor dijo aplicar el
22/08, **523 coinciden exactamente** con el snapshot de Smoobu del 23/08 a las 07:00; las 3
restantes no tienen snapshot (borde del horizonte), no difieren. Las escrituras están llegando.
Lo que no existe es nada que lo compruebe salvo esta consulta hecha a mano.

> Ojo con la lectura de esto: verificar `pricing_applied` demuestra que **el motor decidió**, no
> que **Smoobu aceptó**. Son dos afirmaciones distintas y hoy solo la primera es observable.

## 🔴 3 · El raíl «±20%/día» se convierte en ±20%/pasada si falla una lectura

> ✅ **CERRADO el 23/08/2026.** Las dos lecturas del ancla ya no se tragan la excepción: si
> `ref24` o `anclaHoy` revientan, la pasada **se ABORTA** (503, `ok:false`, Telegram, latido rojo) en
> vez de tarifar con el raíl ensanchado. También en simulacro, para dejar un solo camino que razonar.
> El aviso **calcula** el tope real (`topeRealSinAncla`) en vez de citar un «−49%/+73%» hardcodeado,
> que dejaría de ser verdad al cambiar `max_change_pct` o el nº de pasadas del cron.

El ancla del raíl sale de dos consultas, y las dos degradan a lista vacía:

```ts
// apply/route.ts:579  → ref24    (último precio aplicado ANTES de hoy)
// apply/route.ts:592  → anclaHoy (old_price de la 1ª pasada de HOY)
`).catch(() => [])
```

`anclaRail()` está bien escrita y degrada en orden: `ref24` → `primeroHoy` → **`actual`** (el
precio vivo). Pero si ambas lecturas fallan, todas las fechas caen a `actual`, y como el cron
corre **tres veces al día**, cada pasada se ancla en lo que dejó la anterior: el tope real del día
pasa de ±20% a **(1±0,20)³ = −49% / +73%**.

Es el mismo agujero que la cabecera de `pricing-ancla-rail.ts` documenta como cerrado el
19/08/2026 —el que costó −36% en 16 fechas de House Sevillana— **entrando por otra puerta**: no por
falta de histórico, sino por un error de lectura. Y que ese tipo de error ocurre está probado: el
20/08 un `42883` mató una consulta de esta misma cadena.

`apps/plataforma/lib/sivra/pricing-ancla-rail.ts` · `apply/route.ts:579,592,809-819`

## 🟡 4 · Ocho lecturas del motor degradan sin dejar rastro

El `apply` tiene once lecturas que pueden degradar. **Tres se declaran** y avisan por Telegram:
eventos ilegibles, PriceLabs ilegible y ocupación-por-mes ilegible. **Las otras ocho caen a `[]`
en silencio:**

| línea | qué se pierde | efecto si falla |
|---|---|---|
| 415 | **bucket de mercado por MES** | el motor cae al ancla global: tarifica ciego pero plausible |
| 468 | **bucket de mercado por FECHA** | pierde la estacionalidad; cae al bucket mensual |
| 238 | demanda de vuelos | no sube en fechas de demanda aérea alta |
| 301 | curva de antelación | pierde la palanca de antelación |
| 501 | prior estacional (ADR 6 años) | pierde el suelo/techo histórico |
| 523 | velocidad de reservas (7 d) | pierde la señal de ritmo |
| 579 | `ref24` | ver hallazgo 3 |
| 592 | ancla de hoy | ver hallazgo 3 |

Las dos primeras son **las señales principales de mercado**. Un motor que pierde ambas sigue
devolviendo precios con toda la pinta de estar bien.

> ✅ **CERRADO 24/08/2026.** Las anclas (579/592) abortan la pasada desde el nº3; las otras SEIS
> lecturas se DECLARAN sin abortar (tienen fallback razonable): cada `.catch` empuja a
> `lecturasCaidas`, la respuesta sale `ok:false` + campo `lecturas_degradadas`, hay Telegram con el
> EFECTO de cada señal perdida (`lib/sivra/pricing-lecturas.ts`, puro, 6 tests) y `apply-auto` la
> mete en las degradaciones del latido → rojo. Las 11 lecturas quedan: 3 declaradas de antes + 2
> que abortan + 6 declaradas ahora.

## 🟡 5 · El watchdog de la cadena existe y es mudo

`pilot-track` detecta exactamente lo que haría falta saber —snapshot viejo, mercado de más de 7
días, calendario corto— y lo mete en un array que **no va a ningún sitio**:

```ts
// apps/plataforma/app/api/sivra/pricing/pilot-track/route.ts:247
// Loguear rojos + watchdog (sin push/email en plataforma — simplificado)
```

No hay ni un `tgSend` en toda la ruta. `resumen-diario` tampoco. Son los dos jobs cuyo trabajo es
precisamente contar cómo fue el día.

> ✅ **CERRADO 24/08/2026.** `pilot-track`: rojos + watchdog → Telegram (`avisoPilotTrack` en
> `lib/sivra/pilot-track.ts`, puro y testeado; el día normal devuelve `null` — un vigía que da la
> lata a diario se silencia solo). Los avisos de DATOS van antes que los rojos: un veredicto medido
> sobre un snapshot viejo puede ser mentira. `resumen-diario` NO manda Telegram a propósito (sería
> ruido diario): su «cómo fue el día» vive en el detalle de su latido nuevo (hallazgo 6), que el
> vigía de las 07:45 enseña tal cual.

## 🟡 6 · Cinco jobs de la cadena sin latido

`mercado/cron` (07:15) · `rates/snapshot` (07:00) · `pricing/resumen-diario` (09:00) ·
`pricing/pilot-track` (09:15) · `pricing/experiments/check-results` (08:00).

`rates/snapshot` es el que más pesa: alimenta la ocupación y el precio vivo con el que se compara
todo. Si deja de correr, lo único que lo notaría es el watchdog mudo del hallazgo 5.

> ✅ **CERRADO 24/08/2026.** Los cinco con `registrarLatido` + entrada en `AGENTES_VIGILADOS` + sonda
> en `PROBES` (mismo PR, regla del #1447): `sivra_rates_snapshot`, `sivra_mercado_cron`,
> `sivra_resumen_diario`, `sivra_pilot_track`, `sivra_experimentos` (todos diarios, umbral 30 h).
> *(Horas después, `sivra_mercado_cron` se retiró junto con toda la vía Serper — decisión de
> Alberto del mismo día: cuenta sin créditos y corpus fiable de Booking ya suficiente.)*
> De propina, `mercado/cron` deja de tragarse los fallos de Serper (`searchPortal` los anota y el
> `ok` los refleja) — así murió la vía Serper entera del 22 al 24/08 con `ok:true` en cada pasada —
> y los TRES `serperSearch` del repo incluyen el CUERPO del error («Serper 400: Not enough credits»
> manda a recargar la cuenta; un «400» pelado mandaba a leer código).

## 🟢 Lo que sí está vigilado

Siete latidos con sonda declarada y verificada hoy: `sivra_mercado_sweep`,
`sivra_mercado_booking`, `sivra_eventos`, `sivra_eventos_verificar`, `sivra_pricing_guard`,
`sivra_canal`, `smoobu_sync`. Los cuatro de la cadena estaban frescos y en OK esta mañana.

El canal, además, reparte ya en **tres cubos** (`cambios` / `frenados` / `sinCambio`), así que un
piso que no se ajusta no desaparece del parte — el arreglo del 22/08 sostiene.

---

## Orden que propongo (tú decides)

1. ~~**Latido para `apply-auto`**~~ ✅ **hecho el 23/08/2026** + que un `error` de Smoobu lo ponga en rojo. Cierra 1 y 2 de una vez,
   y es lo más pequeño de los tres 🔴.
2. ~~**Declarar las dos lecturas del ancla**~~ ✅ **hecho el 23/08/2026** — (579/592): si fallan, marcar la pasada degradada y **no
   aplicar** en vez de aplicar con el raíl ensanchado. Cierra el 3.
3. **Conciliación `pricing_applied` ↔ snapshot**: la consulta de este informe, en el cron diario.
   Convierte el hallazgo 2 en algo observable en vez de en algo que compruebo yo a mano.
4. ~~Declarar las 6 degradaciones restantes del hallazgo 4~~ ✅ **hecho el 24/08/2026**.
5. ~~Enchufar el watchdog de `pilot-track` al Telegram~~ ✅ **hecho el 24/08/2026** (y los 5 latidos del hallazgo 6).

## Fuera de alcance, ya declarado en otro sitio

- **Brecha escaparate↔caja** (listado 1,07–1,47× la base, cobrado 0,87–0,98×). Causa **sin
  comprobar**. Rutina propia el 30/08.
- **Apalancamiento del calibrado**: la ventana de junio 2027 pesa el 78% del ajuste de House.
