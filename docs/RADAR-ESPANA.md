# 📡 Radar España — estado entre pasadas

> Estado del agente programado `radar-espana` (quincenal, días 1 y 16). Cada pasada actualiza
> este archivo: es su única memoria entre sesiones (entorno efímero). Skill:
> `.claude/skills/radar-espana/SKILL.md`. Diseño:
> `docs/superpowers/specs/2026-08-22-patrimonio-cfo-design.md`.

**Última pasada: 16/09/2026.**

## 🌡️ Termómetro de ciclo por zona

> `sin datos` es un estado válido: significa «todavía no se ha medido», nunca «todo bien».

| Zona | Estado | Señales (con fuente) | Medido |
|---|---|---|---|
| Sevilla capital (municipal) | **posible agotamiento (vigilar)** | Idealista agosto 2026: **2.924€/m², −0,3% m/m** (primera lectura mensual negativa de esta serie) frente a +11,5% interanual ([idealista/news 08/09/2026](https://www.idealista.com/news/inmobiliario/vivienda/2026/09/08/912292-el-precio-de-la-vivienda-en-sevilla-en-agosto-ya-es-un-11-5-mas-caro-que-hace-un)). `mercado_zonas` sigue con el snapshot de 29/08 (p50 2.869€/m², sin refresco nuevo esta quincena). Aún 12% por debajo del máximo histórico de 2007 — no se declara agotamiento confirmado con un solo mes, pero es la señal a las que apunta el Paso 2: primera desaceleración m/m tras meses de aceleración. | 16/09/2026 |
| Sevilla capital / casco antiguo | estable | Sin refresco: `mercado_zonas` sigue en el snapshot de 29/08 (p50 4.444€/m², muestra 24, +1,2% respecto a 29/07). No se ha encontrado prensa con dato de barrio para septiembre. | 16/09/2026 (sin dato nuevo) |
| Sevilla provincia | sin datos | No medido esta pasada (solo capital). | — |
| Asturias | acelerando | 1.887€/m² en agosto 2026, **+14,1% interanual** ([Idealista](https://www.idealista.com/sala-de-prensa/informes-precio-vivienda/venta/asturias/asturias/)) — ritmo altísimo pero algo menor que el +15,4% de julio. Oviedo +16,6% interanual. | 16/09/2026 |
| Cantabria | acelerando | 2.392€/m² en agosto 2026, **+17,2% interanual** (+0,6% m/m) — sigue líder nacional aunque algo por debajo del +18,2% de julio ([Idealista vía ifomo.es](https://www.ifomo.es/articulo/economia22/cantabria-cantabria-lidera-agosto-subida-vivienda-usada-172-rozar-2400-euro-m2/20260902114414357807.html)). | 16/09/2026 |
| Huelva | acelerando | **Primer dato provincial fiable**: 1.794€/m² en julio 2026, **+12,7% interanual** ([Idealista](https://www.idealista.com/sala-de-prensa/informes-precio-vivienda/venta/andalucia/huelva-provincia/)) — sustituye la lectura heterogénea de la pasada anterior (Ayamonte a la baja no representaba a la provincia). | 16/09/2026 |
| Cádiz | sin datos | Sigue sin agregado provincial limpio: Idealista provincia solo trae mayo 2026 (2.340€/m², m/m); la ciudad de Cádiz sí tiene julio (3.310€/m², +8,1% interanual) pero no es la provincia. No se afirma tendencia provincial con esto. | 16/09/2026 |

## 🏠 Últimas valoraciones escritas por el agente

**Esta pasada (16/09/2026): SIN escritura nueva.** `mercado_zonas` sigue en el snapshot de
29/08/2026 (mismos p50: sevilla-capital 2.869€/m², casco-antiguo 4.444€/m² — 18 días sin refresco,
no hay dato nuevo) y la fila vigente de `patrimonio_valoraciones` es del 01/09/2026 (15 días, no
>30). Por regla del Paso 1 (solo se escribe con dato nuevo o vigente >30 días), no se inserta fila.
Sigue vigente lo escrito el 01/09/2026:

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

**Sin cambios respecto a la pasada anterior — sigue vigente el hallazgo del 01/09/2026 (San Julián
con cupo AGOTADO), confirmado de nuevo esta pasada sin novedad de plazo:**
- Sevilla capital limita las VUT al 10% del parque residencial por barrio desde el
  29/10/2024 ([Gerencia de Urbanismo de Sevilla](https://www.urbanismosevilla.org/noticias/limite-a-las-viviendas-de-uso-turistico)).
  San Julián (Socorro 24) es uno de los barrios con crecimiento cerrado (cupo agotado), junto a
  Museo y todo el Casco Antiguo + Triana.
- **El bloqueo del Registro de Turismo de Andalucía sigue activo**: la búsqueda de esta pasada no
  encontró dato posterior a abril-mayo 2026 (última cifra confirmada: 0 altas nuevas en Sevilla
  capital esos dos meses) — no hay fuente que confirme si se ha desbloqueado en junio-agosto, así
  que se mantiene como `sin dato más reciente`, no como «sigue igual» dado por hecho.
  ([andaluciainformacion.es](https://www.andaluciainformacion.es/articulo/sevilla/viviendas-turisticas-sevilla-ha-inscrito-ninguna-nueva/202606090923193399192.html))
- Sin novedad de moratoria ampliada ni de cambios al 10%/barrio esta pasada.
- **Lectura para el patrimonio:** sin cambios — la restricción sigue siendo escasez que sostiene el
  valor de la licencia VIVA de Socorro 24. Pendiente de cuantificar cuando se resuelva el enfoque
  `vut` (ver huecos). No hay plazo/fecha límite que accione nada nuevo.

## 📈 Coyuntura económica

- **El giro de tipos que se anticipaba el 01/09 SE MATERIALIZÓ:** el BCE subió los tres tipos
  oficiales 25 p.b. en su reunión del 9-10/09/2026 — depósito **2,25%→2,50%**, principal
  **2,65%**, marginal **2,90%** ([BCE, comunicado oficial](https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~314e508016.es.html)).
  Primera subida confirmada tras el ciclo de bajadas.
- **Y el euríbor se ha acelerado más de lo esperado:** media de agosto 2026 = 2,954%; media
  provisional de septiembre (a 7/09) = **3,08%**, con el dato diario del 15/09 ya en **3,147%**
  ([euribordiario.es](https://www.euribordiario.es/); [gibobs.com](https://www.gibobs.com/blog/euribor/)) —
  primera vez que cruza el 3% en esta serie. Encarece directamente cualquier hipoteca variable en
  revisión (~1.000€/año más de media) y sube el coste de oportunidad de mantener patrimonio
  inmobiliario frente a otras alternativas. **Señal accionable: aviso por Telegram esta pasada.**
- **Esfuerzo hipotecario:** sin dato más reciente que el 36,1% (1T-2026) de la pasada anterior — no
  se ha encontrado actualización esta quincena.
- Sin novedad normativa fiscal detectada (eso lo vigila `fiscal-novedades`; no se pisa aquí).

## Huecos conocidos

- **Enfoque `vut` de Socorro 24 y Dúplex Center: sigue pendiente**, sin avance esta pasada (no se ha
  montado el endpoint interno sobre `getPLMensual()` que pedía la pasada anterior). Próxima pasada:
  seguir pendiente de ese endpoint antes de reintentar.
- No hay zona `los-remedios` en `mercado_zonas`: Monte Carmelo se sigue valorando con el proxy
  municipal (infravalorado, y la brecha con el AVM de BBVA se mantiene ancha).
- Sevilla provincia y Cádiz: sin termómetro propio esta pasada (agregados provinciales limpios no
  encontrados o desfasados). Huelva SÍ se resolvió esta pasada (ver tabla).
- `mercado_zonas` lleva 18 días sin refresco nuevo (último snapshot 29/08/2026) — las valoraciones
  del agente y el estado de casco-antiguo en la tabla de zonas siguen con ese dato, no uno nuevo.
- Los dos Busto (subarrendados) siguen en `estado='baja'`: no son propiedad, fuera del patrimonio;
  su negocio sigue en SIVRA.
