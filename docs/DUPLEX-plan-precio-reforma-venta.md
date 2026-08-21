# Dúplex de Villasís — plan de decisión: precio, reforma o venta

> Abierto el **20/08/2026**. Decisión pendiente de Alberto; este documento es el guion y el sitio
> donde se anotan las mediciones. El estudio fiscal de la venta vive aparte, en
> [`FISCAL-venta-duplex-villasis.md`](./FISCAL-venta-duplex-villasis.md).
>
> **Regla de este documento:** cada fase tiene un **criterio numérico de decisión escrito ANTES** de
> medir. Si al llegar la fecha el número no está, la fase no se da por superada — no se decide «a ojo».

## El punto de partida

Alberto planteó vender el dúplex por 320.000€, o reformarlo para sacar un segundo dormitorio y subir
el precio por noche. Midiendo, apareció una tercera opción que no estaba sobre la mesa y que es la
más barata de todas: **el piso está por debajo de mercado**.

| Dato | Valor | Fuente |
|---|---|---|
| ADR 2025 | 104,36€ | `_csv_staging`, 63 reservas / 251 noches |
| ADR 2026 (ene-abr) | **119,23€** | `_csv_staging` |
| Ocupación 2025 | **251 noches = 68,8%** | idem |
| **Mediana de mercado, 4 plazas** | **144,00€** | `market_rates`, **2.501 observaciones**, todas las temporadas |
| **Hueco** | **−18%** | |

⚠️ **Ojo con qué mide cada número.** Los 118€ son **ADR realizado** — lo que dejaron reservas
hechas hace meses. El **precio publicado hoy** es otra cosa: la mediana de `price_pricelabs` para
los próximos 366 días es **148€ de base** (×1,20 de markup ≈ 178€ al huésped). O sea que el
escaparate ya está en mercado; lo que estaba por debajo era la cartera vieja.

Y una foto puntual, medida con el conector de Booking el 20/08/2026 — comparables de 4 plazas en un
radio de 400 m, para el fin de semana del 16 al 18 de octubre de 2026:

| €/noche | Nota | Alojamiento |
|---|---|---|
| 306,00 | 8,7 | Setas Center *(aparthotel)* |
| 230,94 | 9,3 | La Rosa de la Alfalfa *(aparthotel)* |
| 217,07 | 8,8 | Singular Metropol *(aparthotel)* |
| 214,00 | 8,8 | Apartamentos Trinidad |
| 209,75 | 9,1 | HomeySeville San Juan de la Palma |
| 204,50 | 8,3 | Apartamento Calle Sierpes |
| 185,86 | 8,8 | Waou Sevilla Centro II |
| 185,38 | 9,0 | fedelena flat |
| 170,00 | 8,5 | MonKeys Santa Marta |
| **169,92** | 8,1 | **«Luminous and spacious» — 1 dormitorio para 4** |

Mediana 207,12€; **sin los tres aparthoteles, 185,86€**. El dúplex hizo **111,72€** en octubre de 2025.

⚠️ **Esa tabla es UNA fecha de temporada alta, no una medición.** El número en el que se apoya el plan
es el **−18% del corpus completo**. Los dos apuntan igual, pero no son la misma clase de dato y no se
deben citar como si lo fueran.

## Las tres opciones, con su coste y su retorno

| Opción | Coste | Retorno estimado | Reversible |
|---|---|---|---|
| **A. Reajustar el agente de precios** | 0€ | +5.097€/año netos si llega a la mediana | ✅ total |
| **B. Bajar el baño a planta baja** | ⚠️ pedir presupuesto | mata la queja de las reseñas | ❌ |
| **C. Segundo dormitorio** | ⚠️ 25.000-40.000€ | necesita **+48 noches/año** (69% → 82%) solo para pagarse | ❌ |
| **D. Vender y recomprar fuera** | ~32.300€ de IRPF + ~970€ de plusvalía | neto 271.000-286.000€ | ❌ irreversible |

**El orden correcto es A → B → C → D**, de lo gratis y reversible a lo caro e irreversible. Nadie
debería gastarse 25.000€ en un segundo dormitorio antes de comprobar si el problema era el precio.

## El plan

### Fase 1 — Reajustar el agente de precios (septiembre a noviembre de 2026)

> **Corrección del 20/08/2026, medida en BD.** Esta fase estaba mal planteada: no es «encender el
> agente de precios». **El agente ya está encendido y aplicando** sobre el dúplex —
> `pricing_settings.enabled = true`, `apply_enabled = true`, `pricing_config.paused = false`. Lleva
> meses moviendo el precio solo. La prueba, por tanto, es **cambiarle un parámetro**, no activarlo.

> ⚠️ **Y una segunda corrección, el mismo día.** La primera versión de esta sección acusaba al motor
> de dos fallos, leyendo `apps/sivra/lib/pricing-engine.ts`. **Ese fichero es una copia RETIRADA**
> (`apps/sivra/app/api/pricing/apply/route.ts` devuelve 410 desde el 18/07/2026). El motor vivo es
> **`apps/plataforma/app/api/sivra/pricing/apply`** y es mucho más fino. Los dos «fallos» no existen:
>
> - **«Confunde calendario vacío con falta de demanda»** — ya está resuelto, y por el mismo
>   razonamiento, desde el **09/08/2026**. `lib/sivra/pricing-demanda.ts` mide la **antelación real de
>   venta por piso y por mes** (de `incomes.reserved_at`) y **neutraliza el descuento en las fechas
>   cuya ventana de venta aún no ha abierto**, conservando el premio si las hay. Su cabecera dice
>   literalmente que un 0% a diez meses vista «es un "todavía no se sabe" con forma de dato». El
>   dúplex está medido ahí: vende con **7 días de antelación** en global, **11 en octubre**. Las filas
>   de `pricing_applied` de hoy salen con `demanda_gateada = true`: el gate está actuando.
> - **`demand_baseline` 0,50 → 0,10** era, por tanto, **una mala idea y no se ha aplicado.** Con
>   baseline 0,50 y k 0,16 premiar exige pasar del 50% vendido, y eso es deliberado y está testeado.
>   Bajarlo a 0,10 encendería el premio casi siempre e inflaría el precio de los meses que solo están
>   «sin juzgar todavía» — reintroduciendo el bug con otro disfraz.
>
> Lección de método, que es la misma de siempre en este repo: **antes de acusar a un motor, comprobar
> cuál de sus copias es la que corre.**

**Lo que sí está medido y sigue en pie:**

| Qué | Valor | Nota |
|---|---|---|
| `target_pctl` | 0,50 → **0,60** ✅ aplicado el 20/08/2026 | Apuntaba a la mediana de sus comparables; ahora al percentil 60 |
| p50 / p60 de sus comparables | **129,00€ / 135,00€** | 87 comparables del snapshot del 20/08 |
| `channel_markup` | 1,20 | El recomendado al huésped se divide por 1,20 para dar la base de Smoobu |
| Nota propia vs mercado | **7,6 contra 8,40 de mediana** | ⚠️ El piso puntúa **por DEBAJO** de sus comparables → el factor de calidad le resta ~3% |

⚠️ **Ojo con esa última fila.** La primera versión decía «7,6 contra 6,2, compite hacia abajo». Era
**la media, no la mediana**, y el motor usa la mediana: **8,40**. O sea justo lo contrario — el piso
está peor valorado que su competencia, y el motor le descuenta por ello con razón. **Eso no es un
fallo del motor: es la queja del baño saliendo en el precio.** Refuerza la Fase 2, no la debilita.

**Lo que queda pendiente de decidir:** `max_change_pct` 0,20 → 0,08. El vaivén está medido (el 20/08,
103 cambios **todos a la baja**, −20,1€ de media, el tope exacto del ±20%; el 19/08, 85 al alza; el
18/08, 133 a la baja) pero **no está demostrado que sea patológico** en vez del raíl haciendo su
trabajo mientras el bucket de mercado se mueve. Es un juicio, no un fallo probado, así que se deja a
decisión de Alberto.

**Sobre «que el agente sepa que agosto es el peor mes» (idea de Alberto, 20/08/2026):**

- ✅ **Ya lo sabe, y por su propio histórico.** El motor aplica un **prior estacional**
  (`lib/sivra/prior-estacional.ts`, activo desde el 17/07/2026): un índice por mes calculado con el
  ADR histórico y la ocupación relativa del propio piso, asimétrico a propósito (sube con ADR ×
  ocupación, baja solo con ADR). Además tarifica el mercado **por mes de entrada**, no con una cifra
  anual aplanada.
- ❌ **La ocupación de la competencia NO se puede usar hoy.** `market_rates` no guarda disponibilidad:
  solo precios de los anuncios que devolvió cada búsqueda. Y el número de comparables por fecha
  (entre 2 y 10, con tope aparente de 10) **depende de lo que rascó el scraper ese día**, no de lo
  llena que esté la zona — así que «solo salen 2» no distingue «zona llena» de «búsqueda floja».
  Para hacerlo bien habría que seguir un **panel fijo** de los mismos competidores fecha a fecha y
  anotar disponible/no disponible. Eso es tocar el scraper, no una consulta. **Queda anotado como
  mejora, sin fingir que el dato está.**

**Criterio de decisión, escrito por adelantado:**

| Si a los 3 meses la ocupación… | Entonces |
|---|---|
| **se mantiene ≥ 60%** | El problema era el precio. Seguir subiendo hacia 144€. **No hay nada que reformar.** |
| **cae entre 50% y 60%** | Mezcla de precio y producto. Ir a la Fase 2 (baño) y volver a probar precio después. |
| **cae por debajo del 50%** | Es producto, no precio. Volver al precio anterior y pasar a Fase 2. |

**Cómo se mide la ocupación en esta fase, para no engañarse:** se mide **a toro pasado**, mes
cerrado, tomando el último snapshot de cada noche — nunca mirando el calendario a futuro, que en este
piso siempre está casi vacío y no predice nada.

**Y dos contextos que hay que tener delante antes de asustarse con un mes malo:**

- **Agosto al 0% es estacional y de toda la cartera, no del dúplex.** Medido sobre `rate_snapshots`:
  en agosto de 2026 están al 0% *tres* de los cuatro pisos (dúplex, Busto Reform y Luxury Busto);
  solo House Sevillana aguanta un 21%. La serie del dúplex fue 85% (mayo) → 60% (junio) → 29%
  (julio) → 0% (agosto), con el precio base plano en 95-101€. Bajar precio no llenó julio ni agosto.
- **El libro a futuro no es un termómetro.** 7 noches vendidas para los próximos 90 días parece
  alarmante y no lo es: es el patrón normal de este piso (ver arriba, el 0/90 del 10/05 que acabó en
  85%). Septiembre y octubre **no** están perdidos.

**Por qué el 60%:** hoy se facturan **29.618€** (118€ × 251 noches). A 131€ hace falta llegar a
**226 noches = 61,9%** para igualar esa cifra: ese es el umbral real de indiferencia. El listón se
fija en **60%** a sabiendas de que queda un pelo por debajo — con 3 meses de muestra no conviene
revertir por una diferencia de 2 puntos. Por debajo del 60% la subida destruye ingreso y se revierte.

### Fase 2 — El baño abajo (solo si la Fase 1 no basta)

Bajar el baño principal a la planta baja, en un rincón de los 20,09 m² de cocina. **Sin tocar el
altillo y sin cerrar el hueco a doble altura.** Los baños no necesitan luz natural y ya hay extractor.

Mata la queja que están escribiendo los huéspedes (techo bajo) sin meterse en modificar la VFT ni en
la estructura, y es una fracción del coste de la Fase 3.

**Pendiente:** ⚠️ pedir 2-3 presupuestos. No hay ninguna cifra medida todavía.

### Fase 3 — El segundo dormitorio (solo si la Fase 2 no basta)

**Distribución propuesta** (no la que planteó Alberto, ver «Lo que se descartó»):

- **Comedor (9,65 m²) → dormitorio 2.** Es la única pieza de abajo con ventana a exterior.
- **Cocina actual (20,09 m², central) → salón-comedor-cocina.**
- **Baño nuevo** en un rincón de esos 20 m².
- **Arriba se queda el dormitorio actual** (10,64 m²).
- **El hueco a doble altura no se toca** — es la luz cenital de toda la planta baja.

**Tres preguntas para el arquitecto, en este orden. La primera decide toda la fase:**

1. **¿El Pasaje Francisco Molina cumple como espacio exterior al que puede ventilar e iluminar un
   dormitorio?** Es peatonal y estrecho. **Si la respuesta es no, la Fase 3 no existe.**
2. Superficie de hueco frente a superficie de la pieza (suele exigirse 1/8-1/10).
3. Altura libre real del altillo, medida con metro, para saber si arriba sigue siendo dormitorio legal.

Y un trámite: pasar de 4 plazas a más exige modificar la inscripción en el Registro de Turismo de
Andalucía. El tope lo marca **la licencia de ocupación**, no el decreto ([Decreto 28/2016](https://www.juntadeandalucia.es/export/drupaljda/Texto_consolidado_282016.pdf)).

### Fase 4 — Vender (solo si A, B y C se agotan)

Los números fiscales están en el estudio: ganancia ~145.000€, **IRPF ~32.300€ + ~970€ de plusvalía**,
neto entre **271.000€ y 286.000€** según cómo se venda.

**Si la idea es recomprar fuera de Sevilla (playa, Asturias), dos cosas que hay que tener delante:**

- ✅ **La estacionalidad juega a favor.** En 2025 junio+julio+agosto dieron **2.175,32€ = el 8,3% del
  año** en el 25% del calendario. Sevilla se muere en verano; la costa y el norte pican exactamente
  ahí. Diversificar temporada es un argumento real, no una intuición.
- ❌ **La gestora se come la ventaja.** Se lleva típicamente un **20-25% de los ingresos además de la
  comisión del portal**. Alberto tiene su propia maquinaria (ialimp para limpiezas, el agente de
  pricing, sivra): su coste marginal de gestionar es mucho menor que pagar a un tercero. Y vender 1
  de 5 pisos no elimina esa maquinaria, solo reparte su coste entre 4.

⚠️ **Sin medir:** no hay ni una cifra de rentabilidad real de costa o Asturias en este documento. El
conector de Booking puede medirlo igual que midió Sevilla. **Hasta que se mida, la Fase 4 se decide a
intuición y no debe decidirse.**

## Lo que se descartó, y por qué

**El plan original de Alberto** era dos dormitorios arriba, baño donde la cocina y cocina en el salón.
Se descartó por dos razones que aparecieron al leer el plano junto con la descripción de la ventilación:

1. **Tapa la luz.** Las claraboyas del salón iluminan el hueco a doble altura. Cerrar el altillo para
   meter dos dormitorios deja la planta baja sin luz cenital.
2. **Empeora la altura.** Mete dos piezas con exigencia de altura libre justo donde el techo bajo ya
   es el problema; un dormitorio exige igual o más altura que un baño.

**Y la primera contrapropuesta (dormitorio donde la cocina) también era mala:** la cocina es la pieza
**sin fachada y bajo el altillo** — sin ventana y con el mismo techo bajo. De ahí que el dormitorio 2
tenga que ir en el comedor.

**Subir a 5-6 plazas** se descartó por dos objeciones de Alberto, ambas correctas: no caben en 55,52 m²
útiles, y el sofá-cama es mal producto aunque el decreto permita computar «dos plazas convertibles en
el salón».

## Tabla de seguimiento

Se rellena en cada revisión. Sin estas filas, ninguna fase se da por superada.

| Mes | ADR €/noche | Noches | Ocupación | Nota Booking | Observaciones |
|---|---|---|---|---|---|
| Ago 2026 (base) | 118 realizado / **148 publicado** | 0 | **0%** | ⚠️ sin medir | Punto de partida. El 0% es estacional: 3 de los 4 pisos igual |
| Sep 2026 | | | | | |
| Oct 2026 | | | | | |
| Nov 2026 | | | | | |

⚠️ **La nota de Booking no está medida y no hay tabla de reseñas en la BD.** Es el indicador que dice
si la queja del baño se está corrigiendo, así que hay que empezar a anotarla a mano.

## Lo que falta de terceros

| Qué | A quién | Bloquea |
|---|---|---|
| ¿Bajar `max_change_pct` de 0,20 a 0,08? | Alberto | Nada; la Fase 1 ya corre con `target_pctl` 0,60 |
| Panel fijo de competidores para medir su ocupación | Scraper de mercado | Usar la ocupación de la zona como señal |
| ¿Ventila el pasaje un dormitorio? | Arquitecto | **Toda la Fase 3** |
| Altura libre del altillo | Arquitecto (metro) | Fase 3 |
| Presupuestos del baño abajo | 2-3 industriales | Fase 2 |
| Desglose de los 3.052,26€ de gastos 2025 | Marta (Asecon) | Nada; es dinero a recuperar |
| ¿Aplicáis la deducción por vivienda habitual? | Marta (Asecon) | Qué hacer con el dinero si se vende |
| Informe fiscal de IBKR en euros | IBKR | Compensación de pérdidas si se vende |
| Export de Booking actualizado | Alberto | Cerrar la estimación de 2026 con cartera real |
