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
(22/08/2026): 5 activos (Socorro 50/50, Dúplex 100% de Alberto, 2 Bustos subarrendados,
Monte Carmelo vivienda habitual con hipoteca de cuota conocida y capital sin dato).

## 🧭 Recomendaciones vivas

Ninguna registrada (`patrimonio_recomendaciones` vacía — 0 filas = tabla recién creada, no
«sin recomendaciones históricas»).

## ❓ Intake pendiente (espejo de /patrimonio)

Primer cuestionario previsto para el dossier inicial: m² y ref. catastral de Socorro y Monte
Carmelo; valor/año de compra de Socorro (la cifra sembrada es orientativa) y Monte Carmelo;
capital pendiente, tipo y vencimiento de la hipoteca; titularidad de Monte Carmelo; números de
licencia VUT de los 4 pisos.

## Escenarios en cartera (contexto para próximas pasadas)

- **Venta del Dúplex** — estudio fiscal completo en `docs/FISCAL-venta-duplex-villasis.md`
  (venta 320k → neto 271-286k) y plan de precio/reforma en
  `docs/DUPLEX-plan-precio-reforma-venta.md`. La rutina mensual «revisión plan dúplex» (día 1)
  sigue viva; cuando este agente esté rodado, se estudiará absorberla para no duplicar.
- **Jugada de referencia de Alberto**: vender cerca del tope → aparcar en fondo → recomprar
  en la bajada (1-2 años). Necesita el termómetro del radar y el corpus de subastas.
