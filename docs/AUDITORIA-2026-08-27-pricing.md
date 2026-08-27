# 💰 Auditoría del motor de precios — SIVRA (27/08/2026)

> Pedida por Alberto: *«que esté todo correcto y funcionando al 100% para el tema de los precios;
> y que la auditoría diaria y semanal revise bien este apartado, porque nos jugamos mucho dinero»*.

**Veredicto: el motor está SANO y no hay dinero escapándose por un fallo.** Lo que sí había es un
**hueco de vigilancia** (nadie comprobaba que los precios escritos fueran sanos, solo que el cron
corriera) y **un comportamiento que merece decisión**: la oscilación.

---

## 1. Lo que está verificado y correcto

| Comprobación | Resultado |
|---|---|
| Tests del motor (`node --test lib/sivra/pricing-*.test.ts`) | ✅ **246/246** |
| Los 4 pisos con motor encendido (`enabled` + `apply_enabled`) | ✅ 4/4 |
| `antelacion_k` = 0 (palanca apagada, decisión del 27/08) | ✅ 4/4 |
| Raíl configurado `max_change_pct` = 0,20 | ✅ 4/4 |
| `min_price` puesto en los 4 (suelo anti-malventa) | ✅ 65 / 72 / 85 / 300 € |
| **Raíl roto A LA BAJA** en 10 días (~4.200 noches) | ✅ **0** — el invariante crítico, intacto |
| Noches escritas **por debajo de `min_price`** | ✅ **0** |
| Última pasada `apply-auto` | ✅ 14:30 UTC, 243 noches, 4 pisos, `ok=true` |
| Cadena de crons (calendario, sync, websearch, verificar, snapshot, guard, canal, apply ×3) | ✅ toda fresca y en verde |
| Calendario de eventos sembrado ayer (15 filas, 21/03→18/04/2027) | ✅ intacto |
| Guardián de sub-mercado (07:31) | ✅ 0 hallazgos · 130 fechas con mercado evaluable |

## 2. 🟠 El hallazgo que sí merece decisión: **el motor oscila**

Medido sobre 7 días, contando los pares (piso, fecha) que cambian de dirección ≥3 veces:

| Piso | Fechas oscilando | de las tocadas | % | Amplitud media (máx/mín de la semana) |
|---|---|---|---|---|
| Dúplex Center | 112 | 353 | **32 %** | 1,49× |
| Busto Reform | 70 | 341 | 21 % | 1,50× |
| Luxury Busto | 69 | 289 | 24 % | 1,51× |
| **House Sevillana** | **0** | 331 | **0 %** | — |

**Qué significa.** En ~1 de cada 4 noches el precio sube, baja y vuelve a subir dentro de la misma
semana, con un recorrido medio del **50 %** entre su mínimo y su máximo. El huésped que mire el
martes y el jueves ve dos precios muy distintos para la misma noche. No es malventa —los suelos y
el raíl aguantan— pero es un motor que **no converge**.

**La pista más fuerte: House Sevillana tiene CERO** con 331 fechas tocadas. Es el único de los
cuatro con `min_price` alto (300 €) y buena cobertura de mercado medido. Eso apunta a que la
oscilación nace donde el **techo de mercado** empuja hacia abajo y algún suelo/premio vuelve a
empujar hacia arriba en la pasada siguiente, sin que ninguno gane.

⚠️ **Es una hipótesis, no una causa medida.** No se ha tocado el motor. Diagnosticarlo de verdad
exige instrumentar qué componente fija el precio en cada pasada de una fecha oscilante, y eso es
un cambio en `apply/route.ts` que **necesita autorización de Alberto**.

## 3. Dos falsas alarmas que esta auditoría estuvo a punto de dar (y por qué importan)

Las dos son de la familia «verde no dice que el diff sea el tuyo» de `CLAUDE.md`, y quedan
documentadas para que la próxima pasada no las repita:

1. **«112 noches fuera del raíl ±20%»** — falso. El raíl **no se ancla en `old_price`** sino en
   `ref24`, el último precio del día ANTERIOR, para que tres pasadas no compongan ±20% tres veces
   (`pricing-ancla-rail.ts`). Midiéndolo mal, salían 112 violaciones que eran redondeos a euro.
2. **«23 subidas de golpe sin evento»** — falso en su mayoría. Al alza hay **DOS** vías legítimas
   de saltarse el raíl, no una: el *salto de evento* **y** el *premio de mercado por fecha*
   (`premioMercadoFecha`), que existe justo para lo contrario de lo que parece — es el hueco por
   el que **Karol G y la Feria se vendieron BARATAS**. Descontando las dos quedan **4** noches
   realmente sin explicar.

**La asimetría es la señal**: al alza el raíl puede romperse legítimamente; **a la baja, nunca**.

## 4. Lo que se ha construido para que esto no dependa de que alguien mire

**El hueco real que había:** la auditoría vigilaba que el motor *se moviera* (heartbeat), no que
lo escrito estuviera *sano*. Un `apply_enabled = false` no rompe nada visible —crons verdes, latido
verde, precios quietos— y solo se ve en la factura.

- **`apps/plataforma/lib/sivra/pricing-salud.ts`** — módulo PURO con los invariantes y sus
  umbrales, + **13 tests** (`pricing-salud.test.ts`), probados por sabotaje. Fija en código que
  romper el raíl a la baja es 🔴, que el motor apagado es 🔴 y que la oscilación se nombra.
- **`/auditoria-diaria`, bloque 2bis «💰 Salud del precio»** — obligatorio en TODAS las pasadas,
  también en modo ligero, con la consulta SQL ya probada contra la BD y la tabla de umbrales.
  Cualquier 🔴 → Telegram inmediato.
- **Auditoría semanal** — tramo caro añadido: posición vs mercado (rellena la tabla de
  `POSICION-MERCADO-lejano.md`), las tres condiciones de `antelacion_k`, la oscilación comparada
  con la semana anterior, y los 246 tests del motor con prioridad sobre el resto de la pasada.
- **Rutina 8-ter** (vigilancia temporal, colgada de un trigger *self-bind* frágil): su cobertura
  ya no depende de ella. Se puede borrar sin perder vigilancia.

## 5. Para Alberto — lo único que requiere decisión

1. **La oscilación** (32 % de las noches en Dúplex): ¿autorizas investigar la causa en
   `apply/route.ts`? Es el único punto donde el motor se comporta de forma que no controlamos.
2. Las **4 noches** que suben de golpe sin evento ni premio de mercado: revisables en la próxima
   pasada diaria, ya cubiertas por el bloque nuevo.
3. `antelacion_k` sigue en **0** en los cuatro. Reencenderla exige las tres condiciones de
   `docs/POSICION-MERCADO-lejano.md`; la semanal las evaluará y las reportará, pero **no la
   encenderá sola**.
