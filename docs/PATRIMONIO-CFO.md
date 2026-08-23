# 💼 Coordinador patrimonial (patrimonio-cfo) — estado entre pasadas

> Estado del agente programado `patrimonio-cfo` (mensual, día 2). Cada pasada actualiza este
> archivo: foto patrimonial, recomendaciones vivas e intake pendiente. Skill:
> `.claude/skills/patrimonio-cfo/SKILL.md`. Diseño:
> `docs/superpowers/specs/2026-08-22-patrimonio-cfo-design.md`.

**Última pasada:** — (aún no ha corrido; trigger pendiente de crear por Alberto en
claude.ai/code → Rutinas — ver `docs/RUTINAS-PROGRAMADAS.md`). **La primera pasada es el
DOSSIER INICIAL**: foto completa + cuestionario de intake entero.

## Calibración vigente (Alberto, 22/08/2026)
Objetivo **mixto** (rentas hoy + crecimiento largo plazo) · riesgo **dinámico** (puede proponer
apalancamiento/rotación con el peor caso cuantificado; salvaguarda: Socorro = base de
subsistencia familiar, siempre marcada) · **nunca ejecuta ni comunica a terceros**.

## 📸 Foto patrimonial

Sin pasadas todavía. La foto viva se ve en `/patrimonio` (plataforma); la base está sembrada
(22/08/2026, revisada 23/08/2026): **3 activos en propiedad** — Socorro 50/50 (275 m², RC
`5732032TG3453B0001PK`), Dúplex 100% de Alberto, y Monte Carmelo vivienda habitual (205 m²,
RC `4707007TG3440N0003TR`; **comprado el 29/03/2021 por 270.000€, 50/50 Alberto+Pilar por
mitades indivisas con carácter privativo — de la escritura de compraventa, 23/08/2026**;
hipoteca de cuota conocida y capital sin dato). Los 2 Bustos
(subarrendados, no propiedad) pasaron a `estado='baja'` el 23/08/2026 por orden de Alberto:
fuera del patrimonio, su negocio sigue en SIVRA. Valoraciones `agente:m2zona` (enfoque
vivienda) en `patrimonio_valoraciones` junto a las de Alberto — ver `docs/RADAR-ESPANA.md`.

## 🧭 Recomendaciones vivas

Ninguna registrada (`patrimonio_recomendaciones` vacía — 0 filas = tabla recién creada, no
«sin recomendaciones históricas»).

## 🏦 Hipoteca de Monte Carmelo — condiciones cargadas (22/08/2026, de la escritura)

Alberto subió la escritura (CAJASUR nº 856289293-5, abr-2021) y la ficha `act_monte_carmelo`
de `patrimonio_activos` quedó completada: capital inicial 230.501,03€ · 30 años (vence
05/04/2051) · tipo FIJO 2,10% nominal **bonificable** (aplicado real ~1,11% hasta abr-2026 y
~1,31% desde entonces — perdió ~0,20 pts de bonificación, revisar qué producto dejó de
cumplir) · cuota 772,86€ · capital pendiente **≈195.300€ (ESTIMADO** por sistema francés;
confirmar con recibo) · amortización anticipada con comisión efectiva ≈0€ mientras los tipos
de mercado superen el suyo. **Consigna de Alberto: el CFO evalúa en cada pasada si merece la
pena amortizar** — contra la alternativa neta, y mirando primero las bonificaciones perdidas
(recuperar 0,10-0,50 pts suele rendir más que amortizar). Detalle en la skill, Paso 4.

**Vigilancia continua (23/08/2026):** el agente contable proactivo (cron lunes 09:00) vigila
los recibos `CUOTA PTMO 856289293-5` de la banca — si la cuota cambia entre recibos, o la
ficha `act_monte_carmelo` se desincroniza de lo que el banco cobra, avisa por Telegram
(`apps/plataforma/lib/contable/hipoteca-vigia.ts`, helper puro con tests). Este agente
analiza en mensual lo que aquel detecta en semanal. Además hay borrador de email a la
gestora (María Luz, CajaSur) en el Gmail de Alberto pidiendo bonificación perdida, capital
exacto y cuadro — pendiente de que Alberto lo envíe y llegue respuesta.

## ❓ Intake pendiente (espejo de /patrimonio)

Primer cuestionario previsto para el dossier inicial: ~~m² y ref. catastral de Socorro y
Monte Carmelo~~ (cerrado 23/08/2026 — Alberto dio las refs y el Catastro dio m²/año);
valor/año de compra de Socorro (la cifra sembrada es orientativa); ~~valor/año de compra y
titularidad de Monte Carmelo~~ (cerrado 23/08/2026 — escritura de compraventa: 270.000€ el
29/03/2021, 50/50 Alberto+Pilar privativo, finca 7523 Registro Sevilla nº2, superficie
registral 172,50 m²; los gastos de adquisición —ITP/notaría/registro— NO constan y siguen
pendientes); números de licencia VUT de los pisos en propiedad; y confirmar
el capital pendiente exacto de la hipoteca con el recibo/área de cliente (el sembrado es
estimación).

## Escenarios en cartera (contexto para próximas pasadas)

- **Venta del Dúplex** — estudio fiscal completo en `docs/FISCAL-venta-duplex-villasis.md`
  (venta 320k → neto 271-286k) y plan de precio/reforma en
  `docs/DUPLEX-plan-precio-reforma-venta.md`. La rutina mensual «revisión plan dúplex» (día 1)
  sigue viva; cuando este agente esté rodado, se estudiará absorberla para no duplicar.
- **Jugada de referencia de Alberto**: vender cerca del tope → aparcar en fondo → recomprar
  en la bajada (1-2 años). Necesita el termómetro del radar y el corpus de subastas.
