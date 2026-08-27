# Agente de análisis de inversión inmobiliaria (VUT) — diseño (27/08/2026)

> **Origen:** Alberto recibe un anuncio de idealista de un inmueble en **Conil de la Frontera
> (Cádiz)** —Calle José Tomás Borrego, plano de planta baja + planta primera con ~14 estancias y
> dos entradas— y pide (1) un estudio económico con datos reales de Booking y (2) saber si ya
> existe un agente que, dada una situación, saque ocupación, rentabilidad, €/m² y amortización.
>
> **Respuesta corta a (2): no existe.** Existe el instrumental repartido. Este spec define la
> pieza que falta: el **underwriting de una compra concreta**.

---

## 1. Qué hay ya en el repo (y por qué no basta)

| Pieza | Qué hace hoy | Reutilizable |
|---|---|---|
| `apps/plataforma/app/api/sivra/inversion/*` + tabla `inmuebles_busqueda` | **Criba** de anuncios que llegan por Gmail (etiqueta `inmobiliaria`), con "puntuación chollo" 1-10 por IA (precio bajo + playa + piscina) | El **carril de entrada** del anuncio. No calcula rentabilidad |
| `@central/module-subastas` | Coste real de adquisición, puja máxima y yield con comparables | La **lógica financiera** ya existe, pero atada al BOE |
| skill `mercado-booking` | Mide precio REAL por **fecha × aforo** con el conector Booking → `market_rates` (`fuente: booking_mcp`) | El **motor de medición**, íntegro |
| skill `radar-espana` | Ciclo inmobiliario por zona, regulación VUT, valoración dual vivienda/VUT | El **contexto de zona** |
| skill `patrimonio-cfo` | Coste de oportunidad por activo y escenarios con impuestos | El **"¿comparado con qué?"** |
| `lib/sivra/rentabilidad-anual.ts`, `pricing-rentabilidad.ts` | Rentabilidad de los pisos que YA se explotan | Fórmulas base |

**El hueco:** nada toma un inmueble *que todavía no es tuyo* y responde si comprarlo renta.

## 2. Arquitectura elegida — híbrida (opción C)

Se descartaron:
- **A. Solo skill** — sin UI y sin memoria; solo existe cuando la sesión corre.
- **B. Solo plataforma** — imposible: el conector de Booking **necesita una sesión**, no un cron.
  Es la misma razón por la que `mercado-booking` es rutina y no `CRON_JOBS`.

**C (elegida)** replica el patrón que ya funciona en pricing —*la rutina mide, el motor
determinista decide*:

```
skill inversion-inmueble  ──mide──>  Booking MCP (fecha × aforo × municipio)
        │                            RTA / INE (densidad de oferta)
        │                            BOE / ayuntamiento (licencia, registro único)
        │
        └──POST──> /api/inversion/underwrite  ──>  lib/inversion/underwriting.ts (PURO)
                                                    │
                                                    └──> tabla `inversion_analisis`
```

**Ubicación de la ruta:** se propone `/api/inversion/underwrite` **fuera** de `/api/sivra/*`,
porque esto no es de la vertical de Sevilla (el primer caso es Conil). El carril de entrada
existente (`/api/sivra/inversion`, criba desde Gmail) se mantiene donde está y solo se enlaza;
mover la criba es un cambio aparte que este spec no pide.

### 2.1 `apps/plataforma/lib/inversion/underwriting.ts` (helper puro + tests)

Todo el cálculo vive aquí. **Nada de aritmética en el JSX** (patrón de referencia:
`lib/subastas/resumen-docs.ts` + su `.test.ts`).

**Entrada** — ficha (`precio`, `m2`, `unidades[]`, `reforma`, `financiacion{pct, tipo, años}`),
curva de mercado por mes (de `market_rates`), costes y bloque de competencia.

**Salida** — `€/m²` contra comparables · ingreso bruto **por mes** · costes (comisión Booking
**19,72%**, gestión, limpieza, IBI, seguro, suministros, vacancia, **rampa de reseñas**) ·
**NOI, yield bruto, yield neto, cash-on-cash, payback y TIR a 10 años** · veredicto.

### 2.2 Tabla `inversion_analisis`

Un análisis por fila, con **los supuestos versionados** y la fecha. Es lo que permite volver en
12 meses y contrastar la ocupación estimada con la real — la diferencia entre un agente y una
calculadora (mismo papel que `pricing_aprendizaje`).

### 2.3 Skill `inversion-inmueble`

Mide lo que necesita conector, resuelve el bloque legal, llama al endpoint y devuelve veredicto.
**No decide compras y no envía nada a terceros.**

## 3. La puerta legal va PRIMERO

Sin **licencia turística + número de Registro Único** confirmados, el análisis turístico **no se
calcula**: sale `pendiente de verificar`, nunca un yield optimista. Sin número, Booking y Airbnb
no publican el anuncio y el estudio vale cero.

**Hallazgo que condiciona la operación** ([BOE-A-2026-5827](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-5827),
caso de la registradora de **Conil de la Frontera**): se suspendió la asignación del número de
registro por faltar **autorización expresa de la comunidad de propietarios**, al haberse obtenido
la licencia después del **3/4/2025** (reforma de la LPH: 3/5 de la comunidad puede vetar).

→ **Comprar el edificio ENTERO elimina ese veto** (no hay comunidad). Es una ventaja estructural
que puede hacer que el edificio valga más que la suma de sus pisos. Comprar solo una parte
arrastra riesgo real de no poder registrar.

## 4. Bloque `competencia`

Cuatro métricas, y solo la segunda y la tercera salen de Booking:

1. **Densidad de oferta** — VFT inscritas en el municipio (Registro de Turismo de Andalucía / INE)
   por cada 100 viviendas. Contexto: España perdió ~47.000 VUT interanuales (INE, nov-2025): la
   oferta se está contrayendo por regulación, lo que **favorece al que ya tiene licencia**.
2. **Profundidad a TU aforo** — comparables disponibles al aforo real del inmueble, **nunca al
   genérico** (el bug del 31/07/2026: un piso de 12 plazas no se compara con apartamentos de 4).
3. **Presión por fecha** — % de comparables agotados por ventana. **Es un PROXY de ocupación, y
   se etiqueta como tal:** Booking da precio y disponibilidad, no ocupación.
4. **Calidad de los vecinos** — distribución de nota y nº de reseñas → **coste de rampa**.

### 4.1 Rampa de reseñas (coste de arranque, obligatorio)

Los comparables medidos en Conil tienen 9,2 con 296 reseñas, 9,1 con 58, 9,3 con 44. Un anuncio
nuevo entra con **cero**: el primer año no hace el ADR del comparable porque el ranking lo
entierra y hay que comprar visibilidad con precio. Se presupuesta como **una temporada por debajo
del mercado**, no se descubre en agosto.

## 5. Escenario obligatorio: entero vs segregado

Medición propia del 27/08/2026 (conector Booking, Conil de la Frontera, ventana 28–30 ago 2026):

| Aforo | Comparables disponibles | Mediana €/noche | €/plaza/noche |
|---|---|---|---|
| 4 plazas | 10 | 332,50€ | **83,10€** |
| 10 plazas | 3 | 665,00€ | **66,50€** |

Y la estacionalidad, mismo municipio y aforo 4:

| Ventana | Mediana €/noche |
|---|---|
| 28–30 ago 2026 (pico) | 332,50€ |
| 13–15 nov 2026 (valle) | 92,24€ |

**3,6× entre pico y valle**, y el mercado de aforo grande es fino **pero más barato por plaza**.
Mercado fino ≠ mercado caro. Consecuencia: un inmueble grande tiene la **curva de temporada más
estrecha** que el mercado pequeño (juntar un grupo de 12 en una playa en noviembre casi no pasa;
House Sevillana aguanta porque Sevilla tiene demanda de ciudad todo el año). Por eso el
underwriting **calcula y compara los dos escenarios** —explotación entera y segregada en unidades
de ~4 plazas— y no da uno solo por bueno.

**Limitaciones de estas mediciones, declaradas:** 10 y 3 comparables por ventana (el conector
pagina), no un censo; y es disponibilidad **a un día vista**, así que en pico lo que queda libre
tiende a ser lo peor colocado → los 332,50€ probablemente **subestiman** el ADR real de agosto.

## 6. Reglas del repo que aplican

- **Tres estados** (`CLAUDE.md`): `null` = no comprobado · `0`/`[]` = comprobado y no hay · dato.
  Ni un `?? 0` que convierta "no lo sé" en "no hay". Vale para licencia, competencia y ocupación.
- **Nada de valores de cajón** (`'otro'`, `'desconocido'`) que se cuelen por las guardas de NULL.
- **Veredicto NO por defecto**, con umbral pre-registrado y comparación obligatoria contra:
  amortizar hipoteca, larga duración, bolsa y **recuperar la comisión de Booking en los pisos que
  ya se tienen** (`docs/INVERSION-VEREDICTO-2026-08.md`). Un scoring "chollo" hecho por IA tiende
  a aprobar; el umbral es lo que lo frena.
- **Formato de dinero español** (`2.162,49€`) vía `eur()` de `lib/dinero.ts`.
- **Responsive** y **rendimiento UI** (listas largas paginadas, montaje perezoso) en la pantalla.

## 7. Fases

1. **Estudio manual de ESTE inmueble** — a mano, en sesión. Va primero a propósito: hasta hacer
   uno de verdad no se sabe qué preguntas debe contestar el agente, y codificar antes produce
   calculadoras que nadie usa. **Bloqueado** por los datos del §9.
2. **`underwriting.ts` + `inversion_analisis` + tests** — con lo aprendido en la fase 1.
3. **Skill `inversion-inmueble` + pantalla** — reutilizable para cualquier anuncio.

## 8. Fuera de alcance (YAGNI)

Scraping de idealista (bloqueado por el proxy de egress y además hay carril: reenviar el correo
del anuncio a Gmail con etiqueta `inmobiliaria`) · valoración automática de reforma · gestión de
la compra · cualquier comunicación a terceros.

## 9. Datos pendientes de Alberto (bloquean la fase 1)

1. **Precio pedido, m² construidos/útiles y estado** (a reformar / habitable).
2. **Qué es exactamente**: edificio entero, varias unidades, o casa explotada por habitaciones.
   Las ~14 estancias del plano son un extremo o el otro: o arrastra **licencia de establecimiento
   hotelero** (que hoy no se concede y vale oro) o es un uso irregular no legalizable.
3. **Explotación prevista**: VUT completa, por habitaciones, larga duración o comprar-reformar-vender.
4. **Financiación**: % de hipoteca, tipo y plazo (decide yield vs cash-on-cash).
5. **Quién compra**: Alberto persona física o **Punto y Coma SL** (IRPF vs IS, amortización,
   ITP ~7% en Andalucía).
6. Presupuesto aproximado de reforma, si aplica.
