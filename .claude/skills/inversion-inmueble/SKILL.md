---
name: inversion-inmueble
description: Analiza si comprar UN inmueble concreto renta como piso turístico (VUT). Mide el mercado real por fecha y aforo con el conector de Booking, resuelve la puerta legal (licencia + Registro Único), llama al motor de underwriting de plataforma y devuelve veredicto con los dos escenarios —entero y segregado—. Úsala cuando Alberto pase un anuncio ("¿me interesa esto?", "hazme el estudio de este piso", "¿cuánto rentaría?"). NO decide compras. Sin secretos - solo nombres de variable.
---

# Underwriting de una compra inmobiliaria (VUT)

**Qué haces:** recoges la ficha, MIDES el mercado del municipio con el conector de Booking,
resuelves el bloque legal, llamas al motor y presentas el veredicto. **El cálculo no es tuyo:**
vive en `apps/plataforma/lib/inversion/underwriting.ts` (puro y testeado) y se invoca por
`POST {PLATAFORMA_URL}/api/inversion/underwrite`. Tú mides y contextualizas; él decide.

Diseño completo: `docs/superpowers/specs/2026-08-27-agente-inversion-inmobiliaria-design.md`.

## 🚨 No romper

- **La puerta legal va PRIMERO.** Sin licencia turística Y número de Registro Único confirmados,
  el motor devuelve `no_calculable` y NO enseña ningún yield. Es correcto: un rendimiento sobre una
  explotación que no se puede publicar no es optimista, es falso. No lo esquives inventando
  `confirmada` para «ver los números».
- **`price.book` del conector es el TOTAL de la estancia, NO el precio por noche.** Divide entre
  las noches de la ventana antes de nada. Es el mismo error de unidad que costó el radar de trading.
- **Booking NO da ocupación.** Da precio y disponibilidad. Si no has medido el universo de
  comparables del municipio, la ocupación va como `null` y se declara el supuesto en
  `ocupacionPorDefecto`; el veredicto lo cantará. Nunca la presentes como medida.
- **Una ventana que no devuelve nada es `comparables: 0` con `adrGuest: null`**, no un mercado a 0€.
  «El conector no contestó» y «no hay mercado» son cosas distintas.
- **Mide al AFORO real**, uno por escenario. Un inmueble de 12 plazas no se compara con
  apartamentos de 4 — y al revés: si vas a segregarlo en unidades de 4, necesitas TAMBIÉN la curva
  de 4. Sin la curva de un aforo, ese escenario no se calcula: no se estima a ojo.
- **No inventes el precio ni los m².** Si el anuncio no se puede leer (idealista está bloqueado
  desde el entorno cloud por el proxy de egress), pídeselos a Alberto o usa el carril que ya existe:
  reenviar el correo del anuncio a Gmail con la etiqueta `inmobiliaria`, que lo mete en
  `inmuebles_busqueda` por `/api/sivra/inversion/analyze`.
- **Auth: `Authorization: Bearer {ALERTA_TOKEN}`** no vale aquí — el endpoint pide **sesión**. Si
  corres sin sesión, calcula en local con el helper y dilo, o pídele a Alberto que lo lance desde
  `/inversion`.
- **No envías nada a terceros.** Ni al vendedor, ni a la inmobiliaria, ni al ayuntamiento. Se
  prepara borrador y decide Alberto (regla global del `CLAUDE.md` raíz).

## Pasos

### 1. La ficha
Precio pedido · m² · qué es exactamente (edificio entero / N unidades / casa por habitaciones) ·
plazas explotado entero · cómo quedaría segregado · reforma estimada · quién compra (persona
física o sociedad: cambia IRPF vs IS y la amortización) · financiación.

Lo que no sepas, **déjalo a `null`**. El motor te dirá exactamente qué falta.

### 2. Mide el mercado con Booking, mes a mes
Por cada mes del año y por cada aforo que necesites (el del inmueble entero y el de la unidad
segregada), una búsqueda de alojamientos con:
- `destination` = el municipio · `accommodation_types: ["APARTMENT"]` · `currency: EUR` ·
  `user_country_code: es`
- una ventana de 2 noches representativa del mes (un fin de semana a mitad de mes)
- **`number_of_adults` = el aforo** que estés midiendo

De cada alojamiento quédate con `name`, `price.book`, `rating.review_score`,
`rating.number_of_reviews`. **Ignora `facilities`** (es enorme y no aporta).

`adr = mediana(price.book / noches)`. Los helpers ya lo hacen:
`construirCurva()` de `lib/inversion/curva-mercado.ts`.

### 3. Bloque legal
- **Licencia turística** del municipio y **número de Registro Único** de alquiler de corta duración
  (obligatorio desde julio de 2025; sin él no hay anuncio en ningún portal).
- **¿Se compra el edificio entero?** Desde la reforma de la LPH, 3/5 de la comunidad pueden vetar
  el registro de una VUT nueva — hay resolución del BOE sobre un caso de Conil (BOE-A-2026-5827).
  Sin comunidad no hay veto: es una ventaja estructural del edificio completo, no un detalle.
- **Densidad de oferta** del municipio (Registro de Turismo de Andalucía / INE) y si hay moratoria
  o cupo de licencias. Si el ayuntamiento tiene el cupo cerrado, la competencia está congelada y
  eso juega a favor del que ya tiene licencia.

### 4. Competencia
`analizarCompetencia()` de `lib/inversion/competencia.ts` con los comparables de la ventana de
pico: te da profundidad al aforo, €/plaza, calidad de los vecinos y **rampa sugerida del año 1**
(el descuento que hay que hacer por entrar con cero reseñas contra vecinos consolidados).

### 5. Llama al motor
```
POST {PLATAFORMA_URL}/api/inversion/underwrite
{ ficha, legal, mercado: [{aforo, curva}], costes, financiacion, supuestos, nota }
```
Devuelve `{ resultado, guardado, motivoNoGuardado }`. **Si `guardado` es `false`, dilo**: el
análisis es válido igual, pero no ha quedado registrado y no se podrá contrastar dentro de un año.

### 6. Presenta el veredicto
Los dos escenarios (entero y segregado) con NOI, yield, cash-on-cash, payback y TIR; el veredicto
con sus motivos; **los huecos declarados** (meses sin medir, ocupación supuesta); y las
alternativas. Importes en formato español (`2.162,49€`).

**Ojo con el titular:** el motor dice `condicional` cuando lo medido ya bate el listón pero el año
no está completo. No lo redondees a «sí».

## Lo que el motor decide por ti (y no debes recalcular)

| | |
|---|---|
| Umbral de yield neto | pre-registrado en `UMBRAL_YIELD_NETO` |
| Prima de iliquidez | `PRIMA_ILIQUIDEZ` sobre la mejor alternativa |
| Cobertura mínima | `UMBRAL_COBERTURA` del año medido |
| Comisión del canal | `COMISION_BOOKING` (la medida sobre la facturación real de los pisos) |

Si crees que un umbral está mal, se cambia en el código **con su test**, no en el informe.

## Envs
`PLATAFORMA_URL`. La escritura exige sesión de usuario (cookie `plataforma_session`).
