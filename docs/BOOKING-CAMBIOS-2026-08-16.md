# Informe de ejecución — Extranet Booking.com
**Fecha:** 16 agosto 2026 · **Operador:** sesión Claude · **Alcance:** 4 alojamientos
**Regla aplicada:** oferta nueva primero → palanca vieja después. En ningún momento un piso quedó sin descuento visible.

---

## Resumen en una línea

3 de los 4 cambios ejecutados y verificados en los 3 pisos previstos. **El cambio 4 (precios por ocupación en Luxury) queda PARADO sin aplicar** — la extranet no ofrece el mecanismo que hace falta y aplicarlo como sí lo ofrece habría chocado con el XML de Smoobu. Detalle en §4.

Decisión de partida: la oferta se activó al **8%**, no al 12%, según tu instrucción tras ver el cálculo de apilado.

---

## 1. Oferta visible fija — Oferta estándar 8%

Activada en los tres pisos, idéntica configuración:

| Campo | Valor |
|---|---|
| Producto | **Oferta estándar** (Portfolio deals) |
| Descuento | **8%** |
| Público | Disponible para todo el mundo |
| Fechas de la estancia | **16 ago 2026 – 31 dic 2028** |
| Días de la semana | los 7 |
| Planes y habitaciones | **Todos los planes de tarifas y habitaciones** |
| Fechas en que se puede reservar | Cualquier fecha |
| Horas en que se puede reservar | En cualquier momento |
| Nombre interno | `Oferta estandar 8% permanente` |
| Acumulable con | Genius · Tarifa para móviles **o** tarifa por país |

**Por qué 31 dic 2028 y no "sin fin":** el formulario obliga a poner fecha de fin (`Seleccionar un periodo` con inicio y fin). El campo acepta entrada manual, así que se metió la fecha más lejana que aceptó sin error. Queda **~2 años y 4 meses** de cobertura continua. Ponte un recordatorio para renovarla en 2028.

| Alojamiento | ID | Confirmación de la extranet |
|---|---|---|
| Luxury Busto | 4340072 | ✅ *"Se ha añadido la promoción"* — listado: `Portfolio deals · Oferta estandar 8% permanente · 8% · 16 ago 2026 - Ahora · 16 ago 2026 - 31 dic 2028` |
| Busto Reform | 4771238 | ✅ *"Se ha añadido la promoción"* — mismo listado |
| Dúplex Center | 2888928 | ✅ *"Se ha añadido la promoción"* — mismo listado |

Tras el alta, cada piso muestra **2 promociones activas**: `Mobile rate 10%` + `Oferta estandar 8% permanente`.

**No** se activó Black Friday, Oferta por tiempo limitado, Escapada ni Oferta de finales de año, según tu instrucción.

---

## 2. Genius dinámico → NO

Ejecutado **después** de confirmar la oferta activa en cada piso, uno por uno.

| Alojamiento | Antes | Después |
|---|---|---|
| Luxury Busto (4340072) | Dinámico **Sí** · *"Rango del 0% al 30% para los Niveles 1, 2 y 3"* | Dinámico **No** · *"10% para el Nivel 1, 15% para el Nivel 2 y 20% para el Nivel 3"* |
| Busto Reform (4771238) | Dinámico **Sí** · rango 0–30% | Dinámico **No** · tramos fijos 10/15/20 |
| Dúplex Center (2888928) | Dinámico **Sí** · rango 0–30% | Dinámico **No** · tramos fijos 10/15/20 |

**Confirmación en los tres:** *"Los cambios se han guardado correctamente"*, y la cabecera de la página pasó de *"Tu descuento dinámico: Rango del 0% al 30%…"* a *"Tus descuentos: 10% para el Nivel 1 de Genius, 15% para el Nivel 2 y 20% para el Nivel 3"*.

**Tramos fijos intactos**, verificado visualmente antes y después de guardar:
- Nivel 1, 2 y 3 → 10% · **Activo** (no desactivable)
- Nivel 2 y 3 → 15% · **casilla marcada**
- Nivel 3 → 20% · **casilla marcada**

En Busto Reform, la asignación *"Aplicado a todos los planes de tarifas"* / *"Todos los planes de tarifas"* sigue igual — no se tocó.

**Efecto secundario esperado:** la puntuación del potencial Genius baja de **100/100 → 92/100** en los tres. Booking muestra ahora un aviso *"Estás dejando escapar una oportunidad"* y, en algunos, un bloque *"Recomendado para mejorar tu puntuación"*. **No se aceptó ninguna recomendación.**

---

## 3. No reembolsable de Luxury Busto: −15% → −10%

| Campo | Antes | Después |
|---|---|---|
| Plan | No reembolsable · ID **43172523** | igual |
| Diferencia de precio | *Un **15%** más barato que Standard Rate* | *Un **10%** más barato que Standard Rate* |

**Confirmación:** el listado de Planes de tarifas de 4340072 muestra ahora `No reembolsable · ID 43172523 · No reembolsable · Un 10% más barato que Standard Rate`.

**Verificación cruzada en el calendario:** para el 16 ago, Standard Rate €123 → No reembolsable €110,70 (= exactamente −10%). Antes era €104,55 (−15%). El cambio se propagó correctamente.

No se tocó nada más de ese piso de tarifas: condición (No reembolsable), comidas, extras, estancia mínima de 2 noches, reservable 7 días o más antes del check-in, habitaciones y nombre siguen igual.

Los cuatro alojamientos quedan ahora alineados en **No reembolsable = −10%**.

---

## 4. ⛔ Precios por ocupación en Luxury — PARADO, NO APLICADO

**Objetivo pedido:** habitación 434007201 (máx. 5), ×4 = −5%, ×3 = −8%, ×2 = −10% respecto al precio de 5.

**Me detuve aquí sin aplicar nada.** Motivo, en orden de gravedad:

### 4.1 La extranet no ofrece porcentajes, solo importes fijos en euros

Recorrí las tres vías posibles:

| Vía | Qué ofrece |
|---|---|
| Establecimiento → Información de las habitaciones → Editar | Solo configuración física (camas, baños, ocupación máxima). **Ningún ajuste de precio.** |
| Planes de tarifas → Standard Rate → Editar → Precio | Solo *"Configurar nuevo plan de tarifas"* / *"Gestionar en función de uno de mis planes de tarifas actuales"*. **Ningún ajuste por ocupación.** |
| Calendario → Precios por persona → Edición en bloque | Filas ×4/×3/×2/×1 **editables**, pero solo como **importe fijo en €**, por **rango de fechas**, y el desplegable solo lista `Standard Rate (1 persona)` … `Standard Rate (5 personas)`. **No hay opción de porcentaje.** |

Tu instrucción contemplaba *"si la extranet solo permite porcentajes/importes fijos por huésped de menos, usa el equivalente más cercano"*. El problema es que no es un importe fijo *por huésped de menos* (que sí sería convertible), sino un **precio absoluto por nivel de ocupación**, y eso rompe con precios variables.

### 4.2 El precio de ×5 varía demasiado para que un importe fijo funcione

Standard Rate en los próximos 30 días, solo con los datos que vi en pantalla:

```
€92 · €94 · €123 · €128 · €134 · €135 · €172 · €184 · €188 · €235 · €265
```

Un −5% sobre €92 son €87,40. Un −5% sobre €265 son €251,75. Si meto un único importe fijo para ×4 en el rango, en las fechas baratas ese número quedaría **por encima** del precio de 5 huéspedes — es decir, cobrarías **más** a 4 personas que a 5. Eso no es "escalonado por debajo", es un fallo de precio visible en la web.

Hacerlo bien exigiría escribir un valor distinto para **cada fecha × 3 niveles de ocupación**, indefinidamente. Eso es exactamente *"tocar precios del calendario"*, que está en tu lista de prohibiciones.

### 4.3 El Standard Rate es XML de Smoobu con sobrescritura

La cabecera del calendario de 4340072 dice literalmente:

> **XML (cambios sobrescritos)** — Última sincronización: 16 ago 2026, 10:30

El Standard Rate **no** lleva la etiqueta `No XML` (sí la llevan Flexible, No reembolsable, Tarifa semanal y Tarifa mensual). Es decir: es el plan que Smoobu controla y sobrescribe. Cualquier precio por ocupación que metiera a mano ahí tiene alta probabilidad de ser borrado en la siguiente sincronización, dejándote con el trabajo hecho y sin efecto — y sin aviso.

### 4.4 Qué recomiendo

**Configurar la ocupación en Smoobu, no en la extranet.** Smoobu soporta precios derivados por ocupación y los empuja por el mismo XML que ya controla el Standard Rate. Así:
- se expresa en porcentaje sobre el precio base, que es lo que quieres;
- se recalcula solo cuando cambia el precio base;
- no hay riesgo de sobrescritura, porque es la propia fuente.

Si prefieres hacerlo igualmente desde la extranet asumiendo el riesgo, dímelo y lo aplico con importes fijos sobre un rango corto (p. ej. 3 meses) calculados fecha a fecha — pero necesitaría que levantes explícitamente la prohibición de tocar el calendario.

---

## 5. HOUSE SEVILLANA (2039943) — verificado, sin cambios

Revisado en solo lectura. **Idéntico al inventario del 16/08:**

| Elemento | Estado |
|---|---|
| Genius Nivel 1 | 10% · Activo |
| Genius Nivel 2 y 3 | 15% · marcado |
| Genius Nivel 3 (20%) | **NO activado** ✔ sigue apagado |
| Descuento dinámico | **No** ✔ sigue apagado |
| Puntuación Genius | 78/100 (sin cambios) |
| Promociones activas | 4: `EEA country rate 10%`, `Mobile rate 10%`, `UK country rate 10%`, `US country rate 10%` — sin altas ni bajas |

Booking sigue mostrando el banner *"Recomendado para mejorar tu puntuación → Atrae a los clientes del Nivel 3 de Genius"* y *"7 alojamientos de tu grupo de referencia tienen activada esta opción"*. **Ignorado, como pediste.**

---

## 6. Nuevo apilado máximo teórico

Recordatorio de la mecánica: los descuentos se aplican **en cascada (multiplicativo)**, y solo cuenta el mayor de cada categoría. Genius + tarifa específica (móvil/país) + catálogo de ofertas (la nueva oferta estándar) apilan los tres.

### Sobre el plan Standard Rate

| Alojamiento | Antes | Después | Δ |
|---|---|---|---|
| **Luxury Busto** | 0,70 × 0,90 = **−37,0%** | 0,80 × 0,90 × 0,92 = **−33,8%** | −3,2 pts |
| **Busto Reform** | 0,70 × 0,90 = **−37,0%** | 0,80 × 0,90 × 0,92 = **−33,8%** | −3,2 pts |
| **Dúplex Center** | 0,70 × 0,90 = **−37,0%** | 0,80 × 0,90 × 0,92 = **−33,8%** | −3,2 pts |
| **House Sevillana** | 0,85 × 0,90 = **−23,5%** | sin cambios = **−23,5%** | — |

### Peor caso: sobre el plan No reembolsable

| Alojamiento | Antes | Después | Δ |
|---|---|---|---|
| **Luxury Busto** | 0,85 × 0,70 × 0,90 = **−46,5%** | 0,90 × 0,80 × 0,90 × 0,92 = **−40,4%** | **−6,1 pts** |
| **Busto Reform** | 0,90 × 0,70 × 0,90 = **−43,3%** | 0,90 × 0,80 × 0,90 × 0,92 = **−40,4%** | −2,9 pts |
| **Dúplex Center** | 0,90 × 0,70 × 0,90 = **−43,3%** | 0,90 × 0,80 × 0,90 × 0,92 = **−40,4%** | −2,9 pts |
| **House Sevillana** | 0,90 × 0,85 × 0,90 = **−31,2%** | sin cambios = **−31,2%** | — |

### El otro lado de la moneda: el suelo sube

| Escenario | Antes | Después |
|---|---|---|
| No-Genius, escritorio, Standard Rate | **0%** de descuento | **−8%** (la oferta estándar aplica a todo el mundo) |
| Genius N1, escritorio, Standard Rate | −10% | −17,2% |
| Genius N1, móvil, Standard Rate | −19,0% | −25,5% |

Esto ya lo tenías calculado: el techo baja ~3 puntos y se vuelve **fijo y predecible**, y a cambio el suelo sube 8 puntos. La ganancia real no es tanto el techo como **quitarle a Booking el mando del dinámico**.

---

## 7. Cosas que conviene vigilar

1. **Renovar la oferta antes del 31 dic 2028.** No es "sin fin"; el formulario no lo permite.
2. **Medición a 14 días.** Si la mediana del ratio pagado/listado sale por debajo de 0,85, bajar la oferta estándar del 8% al 5-6% — se edita en Promociones → la fila `Oferta estandar 8% permanente` → Editar, sin desactivar nada.
3. **Booking va a insistir.** Los tres pisos han bajado a 92/100 y ya muestran *"Estás dejando escapar una oportunidad"*. No es un error, es el coste esperado de apagar el dinámico.
4. **Precios por ocupación pendientes** (§4). La palanca está en Smoobu.
5. Se cerró un popup de onboarding *"Descuentos de cartera"* en Busto Reform. Solo informativo, no se aceptó nada.

---

## 8. Cambios NO realizados (lista de control de prohibiciones)

- ❌ Precios base del calendario — **no tocados**
- ❌ Tarifas semanal y mensual — **no tocadas** (Luxury/Reform/Dúplex siguen a −5%; House a −10%)
- ❌ Tarifas por país nuevas — **no creadas**
- ❌ Tarifa móvil — **sigue activa al 10%** en los cuatro
- ❌ Recomendaciones y banners de Booking (Preferred, Visibility Booster, subir Genius, last-minute deal, country rate) — **ninguna aceptada**
- ❌ Reservas — **no consultadas para modificar, no canceladas, no tocadas**
- ❌ HOUSE SEVILLANA — **cero cambios**
