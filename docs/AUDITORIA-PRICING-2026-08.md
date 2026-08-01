# Informe para auditoría — motor de pricing SIVRA (31/07 y 01/08/2026)

Documento de apoyo para auditar el trabajo de estos dos días sobre el motor de precios dinámicos de
los pisos turísticos. Está escrito para que **otra persona (o agente) pueda comprobarlo todo**: cada
afirmación va con la fuente de la que sale y, cuando el dato no permite concluir, se dice.

Contexto de partida: Alberto iba a confirmar el paso a 100% precios dinámicos y a cancelar PriceLabs
(~3/08). La pregunta original era «¿está todo bien?».

---

## 1. Resumen ejecutivo

Se encontraron **seis defectos**, cuatro de ellos con dinero directamente encima. Cinco están
corregidos y en producción; el sexto (suelo plano) está documentado y pendiente.

| # | Defecto | Estado | Dinero |
|---|---|---|---|
| 1 | Comparables de mercado sin distinguir aforo | ✅ en producción (#1186) | House tarificaba a mitad de precio |
| 2 | Feria de Abril 2027 con fechas de otra semana | ✅ en producción (#1186) | 7 noches normales a ×2,5 |
| 3 | El suelo de evento no veía la tabla de eventos | ✅ en producción (#1186) | Karol G podía deslizarse al mínimo |
| 4 | Bucket del mes contaminado por noches de evento | ✅ en producción (#1196) | Luxury a 841€/noche todo junio 2027 |
| 5 | El motor no tenía palanca de last-minute | ✅ implementada, **apagada** (#1202) | 70% de noches vacías en House |
| 6 | Suelo (`min_price`) plano para todo el año | ⏳ pendiente | — |

Además, **dos errores míos de análisis** que Alberto cazó y que quedan documentados abajo (§6),
porque son tan relevantes para la auditoría como los defectos del código.

---

## 2. Defectos encontrados y corregidos

### 2.1 Los comparables no distinguían el aforo (PR #1186)

**Cómo salió:** Alberto, mirando House Sevillana (Socorro): *«tiene 12 plazas, a 165€ saldrían 13,75€
por persona»*.

**El defecto era doble y sistémico:**
- **Recogida:** el cron `mercado/sweep` buscaba precios con «4 personas» y guardaba **los mismos
  comparables para los cuatro pisos** (`guests = 4` fijo). Busto (2 plazas) y House (12) recibían
  idéntico mercado.
- **Consumo:** `apply/route.ts` calculaba sus percentiles **sin mirar `guests`**.

**Corrección:** el sweep busca por el aforo real de cada piso; cada comparable se normaliza con
`pricing_factor_aforo()` (función SQL + gemela pura `lib/sivra/pricing-aforo.ts`, 10 tests).

**El exponente k = 1,1 está medido, no elegido.** Se comparó el p50 de la **misma fecha** con aforos
distintos (única comparación honesta: entre fechas distintas mandaría la temporada):

| Comparación | Fechas | Ratio | k implícito |
|---|---|---|---|
| House 8p vs Dúplex 4p (doble de plazas) | 12 | 2,20 | 1,14 |
| House 12p vs Luxury 5p (2,4× plazas) | 2 | 2,52 | 1,06 |

**Efecto sobre el ancla de mercado — y aquí está la validación:**

| Piso | Antes | Después | |
|---|---|---|---|
| Busto (2p) | 95€ | 95€ | **sin cambio** ✓ |
| Dúplex (4p) | 118€ | 118€ | **sin cambio** ✓ |
| House (12p) | 258€ | 403€ | +56% |
| Luxury (5p) | 123€ | 157€ | +28% |

Que Busto y Dúplex **no se muevan** es la prueba de que el factor no distorsiona: sus comparables ya
eran de su aforo.

**Cómo verificarlo:** ejecutar `pricing_factor_aforo(12,8)` → 1,562; `(5,4)` → 1,278; `(2,2)` → 1;
`(12,NULL)` → 1.

### 2.2 La Feria de Abril 2027 estaba una semana tarde (PR #1186)

`pricing-calendar.ts` la tenía «estimada 18-25 abr» (patrón de 2026 calcado) cuando las fechas
oficiales son **13-18 abr, alumbrado el 12**.

**Daño doble:** 19-25 de abril (semana normal) se tarificaba de Feria —hasta ×2,5 de precio y ×2 de
**suelo**, que además impide corregir a la baja— y los días de Feria real se quedaban sin protección.

**Verificado contra el mercado real:** 15-abr p50 **417€** y 17-abr **304€** (Feria) frente a 20-abr
**162€**, día normal que el calendario inflaba ×2,8.

**Lección anotada:** las fechas de Feria no se estiman «dos semanas después de Semana Santa»; se
confirman contra el mercado o contra fuente oficial.

### 2.3 El suelo de evento solo miraba una de las dos fuentes (PR #1186)

`seasonalFloorFactor` leía únicamente el calendario del repo. Los 3 días de **Karol G** en La Cartuja
viven solo en `pricing_eventos_auto` (Ticketmaster): subían de precio pero conservaban el suelo de un
junio cualquiera, así que si sus comparables caducaban el precio podía deslizarse al mínimo.

### 2.4 El bucket del mes se calculaba con las noches de evento dentro (PR #1196)

**Síntoma:** Luxury a **841€/noche las 28 noches de junio de 2027** — 168€ por plaza en un piso de
cinco.

**Causa:** el bucket por MES es la referencia de lo que vale una noche *normal*, y se calculaba con
todas las fechas. El **único** mercado de Luxury en junio de 2027 son **10 comparables del día 11, la
noche de Karol G, p50 931€**. El motor tomaba ese p50 como «junio normal» y lo repartía al mes entero.
Contraste con los mismos datos: el **18 de junio** el mercado va a **109€**.

Esto **no lo causó el arreglo de aforo** (junio ya estaba a 701€); el aforo le sumó su +20% encima.

**Corrección, con dos guardas que tapan agujeros distintos:**
1. Se **excluyen** del bucket las fechas con evento conocido (calendario + `pricing_eventos_auto` con
   factor ≥ 1,15).
2. Se exige muestra de **≥3 fechas distintas**, no solo ≥3 comparables — diez anuncios del mismo día
   describen un día, no un mes. Sin esta segunda guarda, un barrido que solo cubriera un evento **sin
   catalogar** volvería a contaminar el bucket por la puerta de atrás.

**Verificado contra la BD real:** junio-27 desaparece del bucket (cae al global, lo conservador) y
otros seis meses cuya muestra era de uno o dos días dejan de darse por buenos. Agosto, septiembre,
octubre y enero (muestra real) no se mueven.

### 2.5 El motor no tenía palanca de last-minute (PR #1202)

`apply/route.ts` dice en **tres comentarios** «cerca dejamos que el last-minute suavice». **Ese
last-minute no existía.** El motor nunca ha bajado un precio porque la fecha se acerque sin venderse.

**La referencia se mide, no se configura** — ver §4.

**Diseño y salvaguardas:**
- Solo **propone bajar**; después mandan el raíl de ±%/día, el suelo de coste, el estacional y el techo.
- Las **noches de evento no se rebajan** (factor ≥ 1,15 → intacto): se venden solas.
- **Arranca apagada** en los cuatro pisos (`lastminute_k = 0`). Se enciende piso a piso con OK
  explícito, igual que `apply_enabled`.
- Sin antelación medida, o con <10 noches observadas, devuelve `evaluado:false`: no inventa urgencia.

---

## 3. Los tres centinelas (PR #1186)

Los fallos 2.1-2.3 tienen la misma forma: **un dato metido a ojo que nadie volvió a mirar**, y que el
motor usó como verdad durante meses porque **no tenía forma de quejarse**. La respuesta no es «revisar
más», es que el sistema se contraste solo.

`lib/sivra/pricing-centinelas.ts` (puro, 14 tests), en el guardián diario de las 07:30:

| Centinela | Qué mira | Habría cazado |
|---|---|---|
| **€/plaza** | precio vivo y suelo repartidos entre plazas, en efectivo (canal ×0,76), mín. 18€ | Socorro a 165€ |
| **Evento sin respaldo** | factor ≥2 con mercado en línea con un día normal del mes | la Feria mal fechada |
| **Mercado sin evento** | mercado ≥1,5× su mes y ninguna fuente conoce el día | la Bienal de septiembre |

**Dos decisiones de diseño que conviene auditar:**
- El **€/plaza solo aplica a pisos de ≥6 plazas**. En uno pequeño las plazas son en buena parte
  sofás-cama (Luxury: 5 plazas en 2 dormitorios): su suelo de 72€ da 10,94€/plaza y sin embargo cubre
  el coste 2,4× y va a mercado. Sin ese corte habrían saltado 65 falsas alarmas.
- El p50 de la fecha y el del mes se calculan **sobre los mismos pisos-escenario**. Sin ese control,
  un día barrido solo para la casa grande dispararía «evento desconocido» cada semana.

**Simulado contra el mercado real del 31/07: 3 avisos, no una avalancha** — 27-nov-2026 (1,75× sin
evento), 07-ago-2026 (1,54×) y 18-abr-2027 (declarado ×2,5 con el mercado a 0,87×: la última noche de
Feria está sobrevalorada). Los tres se crearon de verdad al día siguiente.

**Los tres devuelven `evaluado:false` sin muestra** — nunca un «todo bien» que en realidad significa
«no lo he mirado» (regla del repo sobre NULL ≠ 0).

---

## 4. La curva de anticipación: cómo se midió

Idea de Alberto: *«¿por qué no estudias cómo lo hace PriceLabs y lo usamos de base?»*.

**En `incomes` no se puede** — y esto es una trampa que conviene tener anotada: el `createdAt` de las
reservas de 2024-25 es la fecha de la **importación masiva de junio de 2026**, no la de la reserva.
Cualquier «vamos tarde / vamos normal» calculado con esa columna es inventado.

**En `rate_snapshots` sí.** Llevamos una foto diaria de la disponibilidad desde el 10/05/2026 (65.725
filas, 4 pisos, horizonte a un año). Cada transición de `available` 1→0 entre dos snapshots es una
reserva entrando, y `rate_date - snapshot_date` es su antelación exacta.

```sql
LAG(available) OVER (PARTITION BY property_id, rate_date ORDER BY snapshot_date)
-- prev = 1 AND available = 0  →  una reserva entró ese día
```

| Piso | Noches observadas | Antelación mediana |
|---|---|---|
| Busto | 51 | **108 días** |
| Luxury | 51 | 57 días |
| House | 48 | 32 días |
| Dúplex | 11 | 7 días |

**Limitación declarada:** 78 días de observación y entre 11 y 51 noches por piso. Es brújula, no GPS,
y no cubre un ciclo estacional completo. Se afina sola cada día que pasa.

⚠️ **`rate_snapshots.was_booked` está casi vacía** (5.139 de 65.725 filas): **no sirve como etiqueta**.
El proxy bueno es `available`.

---

## 5. Qué hace PriceLabs (medido, no supuesto)

Mismo corpus, por días de antelación (mayo-julio 2026):

| Días antes | House | ocupado | Busto | ocupado |
|---|---|---|---|---|
| 23 | 460€ | 10% | 94€ | 24% |
| 14 | 453€ | 13% | 98€ | 23% |
| 7 | 446€ | 19% | 104€ | 45% |
| 0 | 428€ | 30% | 105€ | 47% |

**PriceLabs no hace last-minute.** House baja un **−7% en tres semanas** y se queda con el **70% de
las noches vacías**; Busto ni baja, sube. Ese «aguantar el precio» explica agosto a cero y octubre a
2-4× el ADR realizado.

**Conclusión: sirve como fuente de datos, no como modelo a copiar.**

---

## 6. Errores míos de análisis (documentados a propósito)

Esta sección existe porque una auditoría debe poder ver también dónde falló el analista.

### 6.1 Falsa alarma leyendo `rate_snapshots.price_ours`

A mitad de la auditoría concluí que el motor tarificaba al doble del mercado. **Era falso:**
`price_ours` es una fórmula LEGACY congelada (`calcOurs`), no el precio vivo. Lo detecté cruzando con
`pricing_applied`. Era la **segunda** vez que esa columna engañaba a una revisión (la primera, el
27/07). Queda documentada como trampa en la skill.

### 6.2 Promediar las dos etapas de House

Alberto: *«Socorro está dando 1.500/2.000€ por un fin de semana»*. Tenía razón.

| Año | ADR | Ticket medio |
|---|---|---|
| 2020 | 67€ | 501€ |
| 2021 | 106€ | 310€ |
| 2022 | 147€ | 421€ |
| 2023 | 175€ | 620€ |
| **2024** | **553€** | **1.363€** |
| **2025** | **459€** | **1.329€** |
| **2026** | **487€** | **1.424€** |

**House cambió de categoría en 2024.** Yo promedié las dos etapas, saqué un «ADR de agosto de 102€» y
**propuse bajar House a 285€ — habría sido regalarlo.** Además llegué a bajar su suelo de 300€ a 180€
(revertido; no llegó a afectar porque House está en dry-run).

Es el mismo fallo que perseguimos en el radar de trading: **número plausible, periodo equivocado, sin
hueco que lo delate**. Allí lo cazó una comprobación; aquí lo cazó Alberto.

**Regla anotada: al analizar House, solo desde 2024.**

---

## 7. Estado del mercado y de las ventas al cierre (01/08/2026)

### Agosto 2026
Busto **0/31** · Dúplex **0/31** · Luxury **0/31** · House 4/31 (bloqueo propio del 4 al 7).

**Se canceló la reserva de House del 16 al 23 de agosto** (Booking, 2.340€, creada el 20/07). Verificado
que **no fue un fallo del sync**: las otras dos reservas creadas ese mismo día siguen en `incomes`, y
Smoobu liberó los 7 días. Quedan a la venta a 450-483€.

**Sin reservas nuevas desde el 25/07** (8 días al cierre del informe), con un ritmo normal de 4-8/semana.

### Competencia real (Booking, 12 personas, 16-23/08)

| | €/noche |
|---|---|
| Más barato (Arco Macarena) | 147€ |
| **Mediana** | **228€** |
| Más caro (Luxury Palace, 9,6) | 443€ |
| **House hoy** | **450-483€** |

House está por encima del techo de la muestra. Matiz honesto: varios de esos «para 12» reparten a la
gente en **varias unidades** (Placentines pone «Different locations»), no son una casa entera de 290 m².
House juega en la gama de General Castaños (376€) y Luxury Palace (443€) — y aun así está por encima
de ambos.

### Octubre 2026 (el mejor mes de Sevilla, a dos meses)

| Piso | Vendidas | Publicado | ADR real oct 24-25 | Lectura con la antelación |
|---|---|---|---|---|
| Busto | 7/31 | 307€ | 77-86€ | **va tarde** (vende a 108 días) |
| Dúplex | 0/31 | 194€ | 90-100€ | **es su patrón** (vende a 7 días) |
| House | 6/31 | 867€ | 423-499€ | normal, aún no le toca |
| Luxury | 4/31 | 212€ | 98-100€ | entrando en ventana |

**Sin la curva de anticipación, este cuadro se lee al revés:** Dúplex a 0/31 parece lo más grave y es
lo normal; Busto a 7/31 parece el mejor y es el que va tarde. House ha colocado sus 6 noches a **709€**,
su mejor ADR de octubre — el precio alto no es absurdo, el problema sería el volumen.

---

## 8. Costes y suelos

Costes por noche calculados con datos vivos (`pricing_aprendizaje/ALL/costes_por_noche_31_07_2026`):

| Piso | Coste/noche | Suelo | Margen |
|---|---|---|---|
| Busto | 19,40€ | 65€ | 3,3× |
| Luxury | 29,70€ | 72€ | 2,4× (el más ajustado) |
| Dúplex | 10,60€ | 85€ | 8× |
| House | ≥30€ | 300€ | — |

**Ningún suelo vende bajo coste.**

**Huecos conocidos:**
- House **no tiene ni un gasto fijo registrado** en `gastos_fijos` (290 m², 6 dormitorios): su coste
  está infravalorado.
- Dúplex y House **no tienen calibración de suelo contra competencia** (la de Busto y Luxury es del 28/07).
- ⏳ **El suelo plano es un error de diseño**: el ADR de House va de ~230€ en agosto a >500€ en octubre.
  Un `min_price` único no puede servir a los dos. Pendiente de calibrar por temporada con la serie 2024+.

---

## 9. Estado de configuración al cierre

| Piso | `apply_enabled` | `min_price` | `lastminute_k` |
|---|---|---|---|
| Busto | ✅ true | 65€ | 0 (apagada) |
| Luxury | ❌ **false — congelado** | 72€ | 0 |
| Dúplex | ❌ false (dry-run) | 85€ | 0 |
| House | ❌ false (dry-run) | 300€ | 0 |

**Luxury está congelado por decisión de Alberto hasta el 01/09**: reactivarlo haría que el motor
subiera agosto hacia el mercado (~139€), lo contrario de lo que quiere en temporada baja. Congelado no
empeora en ninguna dirección.

---

## 10. Cobertura de eventos

- ✅ Semana Santa 2027 (21-28 mar) correcta y confirmada contra mercado (25-mar p50 554€).
- ✅ Feria 2027 corregida a 12-18 abr.
- ✅ Karol G (11-13 jun 2027) con suelo de evento.
- 🕳️ **Septiembre 2026: cero eventos en ambas fuentes** pese a ser mes alto (ahí cae la **Bienal de
  Flamenco**, años pares). Pendiente de que Alberto confirme fechas.
- 🕳️ Julio 2027 vacío (límite del horizonte de 365 días; el calendario acaba el 2027-05-02).

---

## 11. Qué está verificado y cómo

| Afirmación | Cómo se comprobó |
|---|---|
| El factor de aforo no distorsiona | Busto y Dúplex sin cambio en el ancla |
| k = 1,1 | p50 de la misma fecha a distinto aforo, 14 fechas |
| Feria mal fechada | p50 de mercado 15/17-abr vs 20-abr |
| Bucket contaminado | junio-27 desaparece del bucket; 18-jun a 109€ |
| Antelación por piso | 65.725 snapshots, transiciones `available` 1→0 |
| PriceLabs no hace last-minute | mismos snapshots, agrupados por días vista |
| House cambió en 2024 | ADR y ticket medio por año en `incomes` |
| Competencia de agosto | conector Booking, 12 personas, fechas reales |
| Cancelación de House | ausencia en `incomes` + liberación en Smoobu, contrastadas |
| Código | `tsc` 0 · 71 tests `node --test` · `next build` OK · CI verde en los 3 PRs |

---

## 12. Pendientes

**De Alberto:**
1. Precio del hueco de House 16-23/08 (propuesta: **330-350€/noche**).
2. Encender `lastminute_k` — sugerencia: **Busto a 0,5** (es el que va tarde para octubre, está vivo,
   y su suelo cubre el coste 3,3×).
3. Reactivar Luxury el 01/09.
4. Fechas de la **Bienal de Flamenco 2026**.
5. Activar `apply_enabled` de Dúplex y House antes del corte de PriceLabs (ya es seguro: el motor que
   los tarificaría es el corregido).

**Técnicos:**
6. Calibrar el **suelo por temporada** (§8).
7. Registrar **gastos fijos de House** (§8).
8. Vigilar la **primera pasada del sweep por aforo real** (domingo 02/08, 03:00 UTC): hasta entonces
   House solo tiene 20 comparables de 12 plazas del 9 de junio frente a 136 de 8 plazas.
9. Retirar la copia legada `apps/sivra/app/api/pricing/guard/route.ts` (no programada, con el bug de
   dedup viejo y solo los checks #1/#3).

---

## 13. Referencias

- PRs: **#1186** (aforo + Feria + suelo de evento + centinelas), **#1196** (bucket de mes), **#1202**
  (palanca de urgencia + memoria).
- Código: `lib/sivra/pricing-aforo.ts` · `pricing-centinelas.ts` · `pricing-lastminute.ts` ·
  `pricing-guardia.ts` · `lib/pricing-calendar.ts` · `app/api/sivra/pricing/{apply,guard}/route.ts`
- SQL: `prisma/sql/2026-07-31_pricing_factor_aforo.sql` · `2026-08-01_pricing_lastminute_k.sql`
- Skill: `.claude/skills/pricing-agente/references/estado-y-protocolo.md`
