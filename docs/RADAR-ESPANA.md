# 📡 Radar España — estado entre pasadas

> Estado del agente programado `radar-espana` (quincenal, días 1 y 16). Cada pasada actualiza
> este archivo: es su única memoria entre sesiones (entorno efímero). Skill:
> `.claude/skills/radar-espana/SKILL.md`. Diseño:
> `docs/superpowers/specs/2026-08-22-patrimonio-cfo-design.md`.

**Última pasada:** — (aún no ha corrido; trigger pendiente de crear por Alberto en
claude.ai/code → Rutinas — ver `docs/RUTINAS-PROGRAMADAS.md`).

## 🌡️ Termómetro de ciclo por zona

> `sin datos` es un estado válido: significa «todavía no se ha medido», nunca «todo bien».

| Zona | Estado | Señales (con fuente) | Medido |
|---|---|---|---|
| Sevilla capital / casco antiguo | sin datos | — | — |
| Sevilla provincia | sin datos | — | — |
| Asturias | sin datos | — | — |
| Cantabria | sin datos | — | — |
| Huelva | sin datos | — | — |
| Cádiz | sin datos | — | — |

## 🏠 Últimas valoraciones escritas por el agente

Ninguna todavía. Las semilla (`fuente='alberto'`) viven en `patrimonio_valoraciones`:
Dúplex 320.000€ (vut, plan de venta 20/08/2026) y Socorro 1.000.000€ (mixto, estimación
verbal orientativa 22/08/2026 — pendiente de contraste con €/m² de zona).

Referencia disponible en BD (`mercado_zonas`, 29/07/2026): `sevilla-capital` p50 2.635 €/m² ·
`sevilla-capital/casco-antiguo` p50 4.390 €/m². OJO: es el corpus de subastas — contrastar
frescura antes de usarlo.

## 🏷️ Regulación VUT — vigilancia

Sin pasadas todavía. Puntos de partida conocidos (a verificar en la primera pasada): registro
único estatal de alquileres de corta duración; limitación de VUT por zonas en Sevilla.

## Huecos conocidos

- Solo el Dúplex tiene m² en `patrimonio_activos` (65,46): sin m² de Socorro y Monte Carmelo
  no hay valoración por €/m² — lo pregunta el intake de `/patrimonio` y el `patrimonio-cfo`.
