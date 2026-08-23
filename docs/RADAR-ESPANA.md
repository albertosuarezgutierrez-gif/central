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

Primeras valoraciones `fuente='agente:m2zona'`, enfoque `vivienda` (23/08/2026, sesión
interactiva con Alberto — m² sacados del Catastro por referencia catastral):

- **Socorro 24** (275 m² Catastro, año 2000): **1.207.250€** — p50 4.390€/m² de
  `sevilla-capital/casco-antiguo` (muestra 25, 29/07/2026). Horquilla p25–p75:
  979.550€–1.329.075€. Enfoque `vut` pendiente (capitalización P&L ÷ yield).
- **Dúplex Center** (65,46 m² ficha; 61 según Catastro): **287.369€** — misma zona p50.
  Horquilla 233.168€–316.368€; con 61 m² catastrales: 267.790€.
- **Monte Carmelo 68** (205 m² Catastro, año 1964, Los Remedios): **540.175€** — PROXY
  `sevilla-capital` municipal p50 2.635€/m² porque NO hay slug `los-remedios` en
  `mercado_zonas`; el barrio cotiza por encima de la media → probable infravaloración.
  **Hueco para la próxima pasada: medir zona los-remedios.**

Las semilla (`fuente='alberto'`) siguen al lado: Dúplex 320.000€ (vut, plan de venta
20/08/2026) y Socorro 1.000.000€ (mixto, estimación verbal orientativa 22/08/2026 — la
valoración por zona sale un ~20% por encima).

Referencia disponible en BD (`mercado_zonas`, 29/07/2026): `sevilla-capital` p50 2.635 €/m² ·
`sevilla-capital/casco-antiguo` p50 4.390 €/m². OJO: es el corpus de subastas — contrastar
frescura antes de usarlo.

## 🏷️ Regulación VUT — vigilancia

Sin pasadas todavía. Puntos de partida conocidos (a verificar en la primera pasada): registro
único estatal de alquileres de corta duración; limitación de VUT por zonas en Sevilla.

## Huecos conocidos

- ~~Solo el Dúplex tiene m²~~ **Cerrado 23/08/2026:** Socorro (275 m², RC
  `5732032TG3453B0001PK`) y Monte Carmelo (205 m², RC `4707007TG3440N0003TR`) ya tienen m² y
  año desde el Catastro (`Consulta_DNPRC`).
- No hay zona `los-remedios` en `mercado_zonas`: Monte Carmelo se valora con el proxy
  municipal (infravalorado, ver arriba).
- Los dos Busto (subarrendados) pasaron a `estado='baja'` el 23/08/2026 por orden de Alberto:
  no son propiedad, fuera del patrimonio; su negocio sigue en SIVRA.
