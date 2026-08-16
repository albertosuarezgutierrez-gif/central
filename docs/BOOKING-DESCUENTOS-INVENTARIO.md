# Inventario de descuentos activos — Booking.com Extranet
**Fecha de auditoría:** 16 agosto 2026 · **Modo:** solo lectura (no se ha activado ni modificado nada)

---

## 0. Cómo apila Booking (regla oficial, del simulador "Simular descuento máximo")

Los descuentos se agrupan en **categorías**. Solo cuenta **el mayor de cada categoría**, y se aplican **en cascada (multiplicativo)**, nunca sumando:

| Categoría | Ejemplos | Acumula con |
|---|---|---|
| **Programas Premium** | Genius | Tarifas específicas + Catálogo de ofertas + Campañas |
| **Tarifas específicas** | Tarifa móvil, tarifa por país, tarifa estados EE.UU. | Genius + Catálogo de ofertas |
| **Catálogo de ofertas** | Oferta estándar, última hora, reservas anticipadas | Genius + Tarifas específicas |
| **Campañas de descuentos** | Oferta Escapada, fin de año, principios de año | **Solo Genius** |
| **Ofertas con gran descuento** | Black Friday, Oferta por tiempo limitado | **No acumulan con nada** |

Ejemplo de Booking: €100 → −10% = €90 → −10% = €81 → −10% = €72,90 (**27,1% real**, no 30%).

**Importante:** el plan de tarifas (No reembolsable, semanal, mensual) NO es una "categoría" — es la tarifa base sobre la que se aplica todo lo demás. Es decir, se multiplica también.

---

## 1. Luxury Busto Patio privado Centro — ID 4340072

**Habitación única:** Apartamento de 2 dormitorios (ID 434007201), ocupación máx. 5

### Genius
| Nivel | Público | Descuento | Estado |
|---|---|---|---|
| Nivel 1, 2 y 3 | Todos los clientes Genius | 10% | ✅ Activo (base, no desactivable) |
| Nivel 2 y 3 | ≥5 reservas completadas | 15% | ✅ Activado |
| Nivel 3 | ≥15 reservas completadas | 20% | ✅ Activado |
| **Descuento dinámico** | — | **0%–30%** (media 15%) | ✅ **SÍ** |

- Aplica a: la única habitación, **todos los planes de tarifas**
- Puntuación potencial Genius: 100/100
- ⚠️ **El dinámico es la clave:** con "Sí" activado, Booking puede subir el descuento Genius hasta el **30%**, por encima del 20% del Nivel 3.

### Promociones activas
| Promoción | % | Periodo | Público | Planes | Habitaciones |
|---|---|---|---|---|---|
| Mobile rate | 10% | 7 mar 2024 → ahora, siempre activa | App y web móvil | Todos | Todas |

Sin ofertas relámpago, escapada, early booker, last minute ni campañas. **Sin tarifa por país.**

### Planes de tarifa
| Plan | ID | Condición | vs. Standard |
|---|---|---|---|
| Standard Rate | 43172500 | Flexible 7 días (mapeado Smoobu) | base |
| Flexible | 43172517 | Flexible 1 día | **+10%** |
| No reembolsable | 43172523 | No reembolsable | **−15%** ⚠️ |
| Tarifa semanal | 43172530 | Flexible 7 días | −5% ✓ |
| Tarifa mensual | 43172551 | Flexible 7 días | −5% ✓ |

⚠️ **Anomalía:** el No reembolsable está a −15% aquí, frente a −10% en los otros tres alojamientos.

### Precios por ocupación (5 huéspedes)
Solo hay precio configurado para **×5** (ocupación máxima). Las filas ×4, ×3 y ×2 están **vacías** → no hay precios por ocupación diferenciados: 2 huéspedes pagan lo mismo que 5. **No es un descuento**, pero tampoco hay upsell por huésped adicional.

### Apilado máximo
| Escenario | Cálculo | Descuento real |
|---|---|---|
| Genius N3 (20%) + móvil | 0,80 × 0,90 | **−28,0%** |
| Genius dinámico tope (30%) + móvil | 0,70 × 0,90 | **−37,0%** |
| Sobre No reembolsable + Genius N3 + móvil | 0,85 × 0,80 × 0,90 | **−38,8%** |
| **Peor caso absoluto:** NR + Genius dinámico 30% + móvil | 0,85 × 0,70 × 0,90 | **−46,5%** |

---

## 2. Busto Reform Apartamento Centro Sevilla — ID 4771238

**Habitación única:** Apartamento de 1 dormitorio

### Genius
| Nivel | Descuento | Estado |
|---|---|---|
| Nivel 1, 2 y 3 | 10% | ✅ Activo (todos los planes) |
| Nivel 2 y 3 | 15% | ✅ Activado |
| Nivel 3 | 20% | ✅ Activado |
| Descuento dinámico | **0%–30%** | ✅ **SÍ** |

- Planes a los que aplica el 15% / 20% / dinámico: **"Todos los planes de tarifas"** (opción "Maximiza tu alcance")
- Puntuación: 100/100

### Promociones activas
| Promoción | % | Periodo | Público | Planes |
|---|---|---|---|---|
| Mobile rate | 10% | 7 mar 2024 → ahora, siempre activa | App y web móvil | Todos |

Ninguna otra. Sin tarifa por país.

### Planes de tarifa
| Plan | ID | vs. Standard |
|---|---|---|
| Standard Rate | 43171914 | base |
| Flexible | 43171981 | +10% |
| No reembolsable | 43171991 | −10% |
| Tarifa semanal | 43172012 | −5% ✓ |
| Tarifa mensual | 43172032 | −5% ✓ |

### Apilado máximo
| Escenario | Cálculo | Descuento real |
|---|---|---|
| Genius N3 + móvil | 0,80 × 0,90 | −28,0% |
| Genius dinámico 30% + móvil | 0,70 × 0,90 | **−37,0%** |
| NR + Genius 30% + móvil | 0,90 × 0,70 × 0,90 | **−43,3%** |

---

## 3. Dúplex Center — ID 2888928

**Habitación única:** Apartamento Dúplex

### Genius
| Nivel | Descuento | Estado |
|---|---|---|
| Nivel 1, 2 y 3 | 10% | ✅ Activo |
| Nivel 2 y 3 | 15% | ✅ Activado |
| Nivel 3 | 20% | ✅ Activado |
| Descuento dinámico | **0%–30%** | ✅ **SÍ** |

Puntuación: 100/100.

### Promociones activas
| Promoción | % | Periodo |
|---|---|---|
| Mobile rate | 10% | 7 mar 2024 → ahora, siempre activa |

Ninguna otra. Sin tarifa por país.

### Planes de tarifa
| Plan | ID | vs. Standard |
|---|---|---|
| Standard Rate | 43172214 | base |
| Flexible | 43172257 | +10% |
| No reembolsable | 43172266 | −10% |
| Tarifa semanal | 43172282 | −5% ✓ |
| Tarifa mensual | 43172292 | −5% ✓ |

### Apilado máximo
Idéntico a Busto Reform: **−28,0%** (Genius N3 + móvil) / **−37,0%** (dinámico tope + móvil) / **−43,3%** (sobre NR).

---

## 4. HOUSE SEVILLANA 6 habitaciones — ID 2039943

**Habitación única:** Casa de 6 dormitorios

### Genius
| Nivel | Descuento | Estado |
|---|---|---|
| Nivel 1, 2 y 3 | 10% | ✅ Activo |
| Nivel 2 y 3 | 15% | ✅ Activado |
| Nivel 3 | 20% | ❌ **NO activado** |
| Descuento dinámico | — | ❌ **NO** |

- **Máximo Genius posible: 15%** — es el alojamiento más protegido de los cuatro.
- Puntuación: 78/100 (Booking recomienda activar Nivel 3; no lo hagas si quieres mantener el ADR).

### Promociones activas
| Promoción | % | Periodo | Público | Planes | Restricción |
|---|---|---|---|---|---|
| Mobile rate | 10% | 7 mar 2024 → ahora | App y web móvil | **Todos** | — |
| European Economic Area country rate | 10% | 19 feb 2026 → ahora | EEE | **Solo No reembolsable** | mín. 3 noches |
| United Kingdom country rate | 10% | 19 feb 2026 → ahora | Reino Unido | **Solo No reembolsable** | mín. 3 noches |
| United States country rate | 10% | 19 feb 2026 → ahora | EE. UU. | **Solo No reembolsable** | mín. 3 noches |

✅ **Buena noticia:** tarifa móvil y tarifa por país son **la misma categoría** ("tarifas específicas") → **no se acumulan entre sí**. Un británico reservando desde el móvil recibe 10%, no 19%.

### Planes de tarifa
| Plan | ID | vs. Standard |
|---|---|---|
| Standard Rate | 43163158 | base |
| Flexible | 43164126 | +10% |
| No reembolsable | 43164268 | −10% |
| Tarifa semanal | 43164690 | **−10%** ✓ (como esperabas) |
| Tarifa mensual | 43164716 | **−10%** ✓ (como esperabas) |

### Apilado máximo
| Escenario | Cálculo | Descuento real |
|---|---|---|
| Genius 15% + móvil (o país) 10% | 0,85 × 0,90 | **−23,5%** |
| Sobre No reembolsable + Genius 15% + país 10% | 0,90 × 0,85 × 0,90 | **−31,2%** |
| Sobre semanal (−10%) + Genius 15% + móvil | 0,90 × 0,85 × 0,90 | **−31,2%** |

---

## 5. Resumen comparativo

| Alojamiento | Genius máx. | Dinámico | Móvil | País | NR | Sem/Mes | **Apilado máx. s/ standard** | **Peor caso (sobre NR)** |
|---|---|---|---|---|---|---|---|---|
| **Luxury Busto** | 20% (→30% din.) | ✅ | 10% | — | −15% | −5% / −5% | **−37,0%** | **−46,5%** |
| **Busto Reform** | 20% (→30% din.) | ✅ | 10% | — | −10% | −5% / −5% | **−37,0%** | **−43,3%** |
| **Dúplex Center** | 20% (→30% din.) | ✅ | 10% | — | −10% | −5% / −5% | **−37,0%** | **−43,3%** |
| **House Sevillana** | **15%** | ❌ | 10% | 10% (solo NR) | −10% | −10% / −10% | **−23,5%** | **−31,2%** |

---

## 6. El −29% de Luxury Busto: de dónde sale

**Reserva identificada:** nº 6509021916 · Christophe Schoonbroodt · reservada el **15 ago 2026** · estancia 22–25 oct 2026 (3 noches) · 5 adultos · **€430,00** · comisión €70,09 · etiqueta **Genius** en la lista de reservas.

**Tarifa estándar en calendario** para esas noches: €203 + €203 + €203 = **€609,00**

```
430 / 609 = 0,7061  →  −29,4%
```

**Coincide exactamente con el 29% que has visto.**

### Descomposición
No he podido abrir el desglose de la reserva: la página de detalle de reserva de la extranet (`booking.html`) devuelve error hoy. Con los descuentos activos, las dos combinaciones que dan 0,7061 exacto son:

1. **Genius dinámico ≈21,5% × Tarifa móvil 10%** → 0,785 × 0,90 = 0,7061 ← **la más probable**
2. No reembolsable (−15%) × Genius dinámico ≈7,7% × móvil 10% → 0,85 × 0,923 × 0,90 = 0,7061

Comprobación con los tramos fijos:
- Genius N3 20% × móvil 10% = −28,0% → €438,48 (no cuadra, se quedó corto)
- Genius N2/3 15% × móvil 10% = −23,5% → €465,89 (no cuadra)

👉 **Conclusión:** el descuento no viene de un tramo fijo de Genius. Viene del **descuento dinámico**, que Booking empujó por encima del 20% (a ~21,5%) para esas fechas, **multiplicado por la tarifa para móviles del 10%**. Es exactamente el mecanismo que el ajuste "¿Quieres que el descuento sea dinámico? → Sí" le autoriza a hacer, hasta el 30%.

### Comprobación cruzada
La otra reserva reciente (Maria Antonia, reservada 9 ago, 16–18 oct, 5 adultos, €341,74 vs. €194 × 2 = €388 estándar) sale a **−11,9%** — coherente con Genius bajo/dinámico sin apilar móvil.

> ⚠️ **Salvedad:** los precios del calendario los sincroniza Smoobu por XML (última sincronización 16 ago 2026, 10:30). El precio listado el día de la reserva podría haber diferido ligeramente del que muestra hoy el calendario.

---

## 7. Puntos que merecen tu atención

1. **El descuento dinámico de Genius (0–30%) está activo en 3 de 4 alojamientos.** Es el mayor mordisco no controlado: puede superar el 20% del Nivel 3 sin que tú lo decidas fecha a fecha. House Sevillana lo tiene en "No" — por eso su exposición máxima es la mitad.
2. **Luxury Busto tiene el No reembolsable a −15%** frente a −10% en los otros tres. Sobre esa base, todo lo demás apila más.
3. **En House Sevillana, país y móvil no se suman** (misma categoría). Riesgo menor del que parece con 4 promociones activas.
4. **Las tarifas por país de House solo aplican al plan No reembolsable** y con mínimo 3 noches — el alcance está bien acotado.
5. **Ningún alojamiento tiene ofertas de campaña activas** (Escapada, fin de año, Black Friday, tiempo limitado, última hora, early booker). Booking está sugiriendo activar "last-minute deal" y "country rate" en Luxury Busto y Busto Reform — recomendaciones, no activaciones.
6. **Sin precios por ocupación en Luxury Busto:** 2 huéspedes pagan lo mismo que 5. No te resta, pero tampoco captura el valor de la ocupación alta en un apartamento de 2 dormitorios para 5 personas.
7. **Las tarifas semanal/mensual están donde esperabas:** −5% en los tres apartamentos y −10% en House Sevillana. ✓
