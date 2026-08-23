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

**Tercera fuente desde el 23/08/2026: `fuente='bbva'`** (AVM del banco, pantallazo de la
Posición Global de Alberto): Socorro **832.000€** (−1,82%) · Dúplex/«Campana» **294.000€**
(+9,35%) · Monte Carmelo **764.000€** (+5,2%). Lecciones para las pasadas del agente:
- Dúplex casi idéntico al `agente:m2zona` (−2%) → el método €/m² de zona vale cuando el
  inmueble es del tamaño típico de la muestra.
- Socorro: la de zona sale ~45% por encima del AVM — **el p50 de pisos de 60-120 m² NO
  extrapola a una casa de 275 m²** (descuento por tamaño). Próxima pasada: usar testigos
  de superficie comparable (±30%, que la skill ya pide) y no el p50 plano.
- Monte Carmelo: el AVM implica **~3.727€/m² en Los Remedios** vs los 2.635 del proxy
  municipal → confirma el hueco «medir zona los-remedios».
Alberto puede refrescar el AVM con un pantallazo cuando quiera; se registra sin pisar nada.

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
