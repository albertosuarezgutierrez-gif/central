# 📡 Radar España — estado entre pasadas

> Estado del agente programado `radar-espana` (quincenal, días 1 y 16). Cada pasada actualiza
> este archivo: es su única memoria entre sesiones (entorno efímero). Skill:
> `.claude/skills/radar-espana/SKILL.md`. Diseño:
> `docs/superpowers/specs/2026-08-22-patrimonio-cfo-design.md`.

**Última pasada: 01/09/2026** (primera pasada real vía trigger).

## 🌡️ Termómetro de ciclo por zona

> `sin datos` es un estado válido: significa «todavía no se ha medido», nunca «todo bien».

| Zona | Estado | Señales (con fuente) | Medido |
|---|---|---|---|
| Sevilla capital (municipal) | acelerando | `mercado_zonas` p50 2.635→2.869€/m² (+8,9% en un mes, 29/07→29/08). Consistente con prensa: [récord histórico en julio 2026](https://www.elespanol.com/sevilla/20260824/vivienda-sevilla-no-toma-respiro-verano-precio-bate-record-pese-frenazo-estival/1003744359756_0.html), casas/villas +10% interanual en agosto ([Idealista/BrainsRE](https://brainsre.news/precio-vivienda-sevilla/)). Matiz: el ritmo MENSUAL se modera según otra lectura de la misma fuente (+0,1% m/m) — los expertos anticipan subidas anuales del 2-7% "de madurez" en próximos meses. | 01/09/2026 |
| Sevilla capital / casco antiguo | estable | `mercado_zonas` p50 4.390→4.444€/m² (+1,2% en un mes, muestra 24) — mucho más moderado que el municipal. Sin señal de agotamiento ni de aceleración propia. | 01/09/2026 |
| Sevilla provincia | sin datos | No medido esta pasada (solo capital). | — |
| Asturias | acelerando | 1.878€/m² en julio 2026, **+15,4% interanual** ([Idealista](https://www.idealista.com/sala-de-prensa/informes-precio-vivienda/venta/asturias/asturias/)). | 01/09/2026 |
| Cantabria | acelerando | 2.377€/m² en julio 2026, **+18,2% interanual** — líder nacional ([Idealista](https://www.idealista.com/sala-de-prensa/informes-precio-vivienda/venta/cantabria/cantabria/)). | 01/09/2026 |
| Huelva | sin datos | Señal heterogénea sin agregado provincial fiable: algún municipio en caída (Ayamonte −15,3% interanual) mientras Andalucía en conjunto sube +10,8%. No se afirma tendencia provincial con esto. | 01/09/2026 |
| Cádiz | sin datos | No se encontró dato específico de provincia esta pasada (solo el agregado autonómico Andalucía +10,8%, que no es Cádiz). | 01/09/2026 |

## 🏠 Últimas valoraciones escritas por el agente

**Refresco 01/09/2026 (`fuente='agente:m2zona'`, enfoque `vivienda`)** — la zona `mercado_zonas` se
actualizó el 29/08/2026 (dato nuevo respecto al snapshot del 29/07 que usaba la pasada anterior):

- **Socorro 24** (275 m² Catastro): **1.222.100€** (antes 1.207.250€, +1,2%) — p50 casco-antiguo
  subió de 4.390 a 4.444€/m². Sigue sin testigos en `mercado_comparables` de Sevilla capital
  200-350 m² para contrastar por tamaño (esa tabla es en realidad el corpus de subastas de otras
  provincias — Huelva/Cádiz/Asturias — no cubre direcciones de Sevilla capital). El AVM de BBVA
  (832.000€, 23/08) sigue ~47% por debajo: confirmado otra vez que el p50 plano de zona sobrevalora
  una casa de 275 m² frente a los pisos de 60-120 m² que dominan la muestra.
- **Dúplex Center** (65,46 m² ficha; 61 Catastro): **290.904€** (antes 287.369€, +1,2%); con 61 m²
  catastrales, 271.084€. AVM BBVA 294.000€ (23/08) sigue casi idéntico (−1%).
- **Monte Carmelo 68** (205 m² Catastro, Los Remedios): **588.145€** (antes 540.175€, **+8,9%**) —
  PROXY `sevilla-capital` MUNICIPAL porque sigue sin existir slug `los-remedios`. El salto es casi
  todo el movimiento de la zona municipal este mes, no ruido de método. AVM BBVA (764.000€) implica
  ~3.727€/m² reales en Los Remedios, muy por encima del proxy: la infravaloración por proxy persiste
  y se agranda si el barrio corre más que la media de la ciudad (probable, dado su perfil).

**Enfoque `vut` (Socorro 24 y Dúplex Center): SIGUE PENDIENTE, y esta pasada confirma por qué no se
improvisa.** Intento de capitalizar el P&L de los últimos 12 meses:
- Ingresos netos 12m (`incomes.amount`): Socorro 99.399,38€ · Dúplex 23.375,75€.
- Gastos directos por factura (`gastos`, no `expenses` — esa tabla está congelada): Socorro
  3.586,91€ · Dúplex 1.389,01€. Tarjeta asignada a Socorro: 2.825,87€.
- **Bloqueo real:** limpieza/lavandería de Sique Brilla + Giraldillo se reparten entre los 4 pisos
  turísticos por peso de huéspedes reales mes a mes (`lib/sivra/pl-mensual.ts`), con matching de
  facturas y fallbacks — no es una regla de tres. Los pagos brutos observados a Sique Brilla en banco
  (5.557,17€/12m, TODOS los pisos) son muy inferiores al coste esperado solo por tarifa×salidas
  (12.023€/12m para los 4 pisos: 90€×75 Socorro + 25€×65 Dúplex + 20€×55 Busto Reform + 28€×91
  Luxury) — la brecha sugiere un hueco de cobertura bancaria o pagos por otra vía que esta sesión no
  puede reconciliar con SQL suelto sin el riesgo real de escribir un NOI y una valoración VUT
  fabricados. **Decisión: no se escribe fila `vut` esta pasada.** La vía correcta es exponer
  `getPLMensual()` (ya construida y probada en `apps/plataforma`) por un endpoint interno que esta
  rutina pueda leer, en vez de reimplementar su lógica de reparto a mano cada quincena.

Las semilla (`fuente='alberto'`) y el AVM (`fuente='bbva'`) siguen sin tocar al lado, con su fecha.

Referencia disponible en BD (`mercado_zonas`, 29/08/2026): `sevilla-capital` p50 2.869€/m²
(muestra 26) · `sevilla-capital/casco-antiguo` p50 4.444€/m² (muestra 24).

## 🏷️ Regulación VUT — vigilancia

**Hallazgo nuevo y directamente relevante para Alberto: el barrio de Socorro 24 (San Julián,
Casco Antiguo) ya tiene su cupo de VUT AGOTADO.** Confirmado por prensa (no visto en pasadas
anteriores de este radar):
- Sevilla capital limita las VUT al 10% del parque residencial por barrio desde el
  29/10/2024 ([Gerencia de Urbanismo de Sevilla](https://www.urbanismosevilla.org/noticias/limite-a-las-viviendas-de-uso-turistico)).
- **San Julián es uno de los barrios de crecimiento restringido** (junto a Museo, en el Casco
  Antiguo): su cupo se fijó en **7 viviendas turísticas** y **ya se agotó** en el primer año de
  vigencia de la norma ([hosteltur](https://www.hosteltur.com/166233_sevilla-pone-coto-a-la-vivienda-turistica-un-maximo-del-10-por-barrio.html)).
  Sevilla capital tiene 11 barrios ya saturados en total (Casco Antiguo + Triana).
- **Y desde el registro autonómico, más presión todavía:** ni en abril ni en mayo de 2026 se ha
  inscrito NINGUNA vivienda turística nueva en Sevilla capital en el Registro de Turismo de
  Andalucía — bloqueo administrativo de facto por revisiones más estrictas
  ([andaluciainformacion.es](https://www.andaluciainformacion.es/articulo/sevilla/viviendas-turisticas-sevilla-ha-inscrito-ninguna-nueva/202606090923193399192.html)).
- **Lectura para el patrimonio:** exactamente el patrón que describe la skill — la restricción es
  escasez que sube el valor de la licencia VIVA de Socorro 24 (no se puede replicar; nadie más va a
  poder abrir un VUT nuevo en San Julián). Pendiente cuantificarlo el día que se resuelva el enfoque
  `vut` (ver huecos). No hay plazo/fecha límite que accione nada nuevo — es información de fondo, no
  una ventana.

## 📈 Coyuntura económica

- **Tipos al alza, giro relevante:** el euríbor cerró julio 2026 en 2,855%, su nivel más alto desde
  septiembre de 2024. El mercado da ~85% de probabilidad a que el BCE suba 25 p.b. en su reunión del
  10/09/2026 (depósito 2,25%→2,50%), por inflación de la eurozona en 2,9% en julio
  ([infobae](https://www.infobae.com/espana/2026/08/27/el-bce-prepara-el-terreno-para-una-subida-de-tipos-de-interes-en-septiembre-ante-el-riesgo-de-que-la-inflacion-se-dispare/)).
  Primera subida tras el ciclo de bajadas — afecta directamente al coste de oportunidad de mantener
  patrimonio inmobiliario frente a otras alternativas.
- **Esfuerzo hipotecario por encima del umbral de riesgo del Banco de España:** 36,1% de la renta en
  el 1T-2026 ([Vozpópuli](https://www.vozpopuli.com/economia/inmobiliario/el-esfuerzo-para-comprar-vivienda-supera-el-umbral-de-riesgo-del-banco-de-espana.html)); precio medio ≈8x la renta bruta anual de un hogar. Presión de demanda con
  tipos subiendo simultáneamente: dos fuerzas en direcciones opuestas sobre el ciclo — la señal a
  vigilar la próxima pasada.
- Sin novedad normativa fiscal detectada (eso lo vigila `fiscal-novedades`; no se pisa aquí).

## Huecos conocidos

- **Enfoque `vut` de Socorro 24 y Dúplex Center: sigue pendiente** (ver arriba el detalle del
  bloqueo real de esta pasada — reparto de gastos compartidos entre los 4 pisos, no reconciliable
  con SQL suelto sin riesgo de fabricar la cifra). Próxima pasada: pedir un endpoint interno que
  exponga `getPLMensual()` en vez de reimplementarlo.
- No hay zona `los-remedios` en `mercado_zonas`: Monte Carmelo se sigue valorando con el proxy
  municipal (infravalorado, y la brecha con el AVM de BBVA se mantiene ancha).
- Sevilla provincia, Huelva y Cádiz: sin termómetro propio esta pasada (solo agregados
  autonómicos/nacionales, insuficientes para afirmar tendencia local).
- Los dos Busto (subarrendados) siguen en `estado='baja'`: no son propiedad, fuera del patrimonio;
  su negocio sigue en SIVRA.
