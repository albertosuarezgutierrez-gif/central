# Avant2 vs. lo nuestro para tarificar AUTO — comparativa y plan (21/09/2026)

Alberto pasa cinco capturas del multitarificador de Codeoscopic (**Avant2**, presupuesto 40823099 /
oportunidad 12724003, una Nissan Navara de Jaén) «comparado con lo nuestro». Este documento es esa
comparación, campo a campo, contra `/correduria/cliente/[id]/auto-nuevo` y contra lo que de verdad
viaja al vendor (`apps/asegura/lib/codeoscopic/peticion-auto.ts`).

Reglas que lo enmarcan: `.claude/skills/correduria-crm/SKILL.md` (20: Codeoscopic cuesta 0,50€ por
consulta y **no es idempotente**; 6: emisión ⇒ spec + OK) y la regla raíz **«dato que NO hay ≠ dato
que NO se ha mirado»**, que es exactamente de lo que trata la mitad de esto.

---

## §1. Lo incómodo primero

**No nos falta pantalla: nos faltan datos que ya viajan INVENTADOS.**

Avant2 pregunta once cosas del riesgo que nuestra pantalla no pregunta. De esas once, **seis ya
viajan hoy** en nuestra petición — con un valor que nadie ha preguntado — y **cinco no viajan en
absoluto**. Las seis primeras son el problema serio, porque un supuesto que viaja tiene exactamente
la misma forma que un dato: la compañía tarifica sobre él y devuelve un precio firme construido
sobre algo que nadie dijo.

Dos de ellas son las que más pesan:

1. 🔴 **Los kilómetros al año.** Avant2 los pide explícitamente (`15000`, con su regla «múltiplo de
   mil»). Nosotros los suponíamos siempre: `suponer('kmAnuales', KM_ANUALES_POR_DEFECTO, …)`
   (`apps/asegura/lib/codeoscopic/desde-cartera.ts:354,480,626`), sin que el corredor pudiera
   corregirlos desde ninguna pantalla — el formulario tenía **cero** apariciones de `kmAnuales`. Es
   factor de tarifa de primer orden. **Corregido en este PR.**
2. 🔴 **La zona de expedición y el tipo de carnet están CABLEADOS.**
   `apps/asegura/lib/codeoscopic/persona.ts:136` manda siempre
   `{ type: { id: 'B' }, date: …, issuingZone: { id: 'Spain' } }`. Avant2 pregunta la «Zona de
   expedición» (en la captura, España) porque el catálogo del vendor
   **`/car/driving-license-issuing-zones`** existe y tiene más de un valor
   (`docs/CODEOSCOPIC-API-PORTAL.md`, «Catálogos sin citar»). Un cliente con carnet extranjero se
   declara hoy como español sin que nada falle: no es un precio malo, es una **declaración inexacta
   del riesgo** (art. 10 LCS), y quien la paga es el asegurado el día del siniestro. **NO se toca en
   este PR**: cambiar ese objeto altera la petición de todas las cotizaciones y hay que verificarlo
   contra el vendor, a 0,50€ el intento. Va al §5 con su orden.

---

## §2. El flujo: cuatro pasos suyos, una pantalla nuestra

| | Avant2 | Nosotros |
|---|---|---|
| Macro | `1 Datos del Riesgo → 2 Presupuestos → 3 Pre-emisión → 4 Emisión` | cotizar → parrilla de precios → ReRate → Submit, en la misma pantalla + `presupuesto` (PR #3252) |
| Micro (paso 1) | `Vehículo → Personas → Seguro → Productos` | un formulario de tres bloques: `1 · El coche`, `2 · El tomador`, `3 · ¿Tiene seguro en vigor ahora mismo?` |
| Cabecera | Nº presupuesto · **Código oportunidad** · Fecha de creación · **Fecha de cierre** | `externalId = cliente-<id>` + `seguros.tarificaciones`. **No hay «oportunidad» con fecha de cierre.** |
| Compañías | paso «Productos»: se eligen a mano, con el código de mediador a la vista (Allianz `PA342521`, Mapfre `5239640`, Occident `M00171`, Reale `38605`) | no se eligen: la petición no lleva selección y cotiza con lo que el vendor tenga configurado |
| De dónde salen los datos | **los teclea el corredor, todos** | **se rellenan desde la ficha** y lo supuesto va marcado (`supuestos[]` con su `porque`) |

**El wizard de cuatro pasos no es lo que hay que copiar.** Avant2 es una pantalla de tecleo: quince
campos en blanco cada vez. Lo nuestro es un rellenador desde la cartera que declara lo que supone —
eso es ventaja, no deuda, y convertirlo en un asistente de cuatro pantallas sería un retroceso. Lo
que sí hay que copiar es la **lista de campos**, porque ahí Avant2 es el contrato del vendor hecho
formulario.

---

## §3. Campo a campo

### Paso «Vehículo»

| Avant2 pide | ¿Viaja en nuestra petición? | ¿Lo pregunta nuestra pantalla? |
|---|---|---|
| Matrícula | sí (`registrationPlate`) | sí |
| Fecha de 1ª matriculación | sí (`registrationDate`) | sí |
| **Fecha de compra** | sí (`purchaseDate`) — **supuesta = la de matriculación** | ❌ → ✅ **en este PR** |
| Marca / Modelo / Versión | sí (`vehicle.code`, Base7) | sí (cascada marca → combustible → versión) |
| Clase, puertas, cilindrada, potencia | no hacen falta: van dentro del código de versión | los pinta Avant2 como confirmación; nosotros no |
| Código postal + municipio de circulación | sí (`circulationAddress`) — **supuesto = donde vive el tomador** | ❌ (queda en §5) |
| Tipo de garaje | sí (`garageType.id`) | sí, y **marcado como supuesto** |
| **Kilómetros anuales** | sí (`kilometersPerYear`) — **supuesto 15.000** | ❌ → ✅ **en este PR** |
| **Remolque ligero (<750 kg)** | sí (`lightTrailer`) — **supuesto `false`** | ❌ → ✅ **en este PR** |
| **Accesorios** | ❌ no viaja (`installedAccessories[]` existe en el contrato) | ❌ (queda en §5) |

### Paso «Personas»

| Avant2 pide | ¿Viaja? | ¿Lo pregunta nuestra pantalla? |
|---|---|---|
| Roles (Tomador / Propietario / Conductor habitual) como chips | sí (`holder`, `risk.owner`, `risk.primaryDriver`) | sí, con casillas «es otra persona» (🚧 el caso «otra persona» sigue **sin verificar** contra el vendor) |
| DNI, nombre, dos apellidos, teléfono, nacimiento, sexo, estado civil | sí | sí (lo que la ficha no trae se teclea) |
| Fecha de carnet | sí (`drivingLicenses[].date`) | sí |
| **Zona de expedición del carnet** | **cableada a `Spain`** | ❌ — §1, punto 2 |
| Tipo de carnet | **cableado a `B`** | ❌ — mismo sitio |
| **Conductor ocasional** | ❌ no viaja (`secondaryDriver` existe en el contrato, `docs/CODEOSCOPIC-API-PORTAL.md:444`) | ❌ (queda en §5) |

### Paso «Seguro» (datos complementarios)

| Avant2 pide | ¿Viaja? | ¿Lo pregunta nuestra pantalla? |
|---|---|---|
| Fecha de efecto | sí (`effectiveDate`) — **supuesta**, y con dos cepos del vendor ya cazados (ni pasada ni a más de 90 días) | ❌: no se elige. Avant2 avisa «recomendamos la fecha definitiva» — y en emisión importa |
| ¿Tiene o ha tenido seguro? + compañía, matrícula asegurada, nº de póliza, años asegurado, años en compañía, años sin siniestros | sí (`previousInsurance`) | **sí, y mejor que Avant2**: nosotros además prohibimos `0 años` con el interruptor encendido, que es lo que cotizaba a 1.963,57€ en vez de ~250€ |

Ese último renglón conviene decirlo entero: **en el bloque del historial estamos por delante.**
Avant2 acepta «sí tuvo seguro» con los años a cero y cotiza como novel sin pestañear;
`revisarDatosAuto` lo para antes de gastar (`peticion-auto.ts`, comentario del 21/09/2026).

### Paso «Productos»

Avant2 obliga a marcar compañías antes de «Obtener precios». Nosotros no las mandamos. **No es un
problema de coste** —se paga por `POST /insurances`, no por compañía— pero sí impide dos cosas que
el corredor querrá: excluir la compañía actual de una defensa de cartera, y ver a qué compañías se
está pidiendo precio de verdad. Prioridad baja, va al §5.

---

## §4. Lo que entra en este PR (y por qué solo esto)

Tres campos, los tres **sin riesgo de vendor**: `kilometersPerYear`, `purchaseDate` y `lightTrailer`
**ya viajan hoy** en el cuerpo de la petición. No se añade ningún campo nuevo al JSON: lo único que
cambia es que el valor puede venir del corredor en vez de del supuesto. Cero cotizaciones gastadas
para verificarlo.

- `packages/module-seguros/src/supuestos-auto.ts` — `KM_ANUALES_SUPUESTOS = 15000` con su cepo de
  valor. Vive en el paquete y no en `apps/asegura` porque hacen falta a la vez en la petición y en
  el hueco del campo de la pantalla: con una copia por app, el día que cambie una, la pantalla
  seguiría prometiendo el número viejo. `KM_ANUALES_POR_DEFECTO` de asegura pasa a ser ese.
- `AutoNuevo.tsx` — los tres campos en el bloque «1 · El coche», **vacíos a propósito**: en blanco
  significa «no se ha preguntado» y viaja el supuesto de siempre; con valor, manda el corredor.
  Prerrellenarlos con el supuesto convertiría un «no lo sé» en un dato afirmado, que es justo lo que
  este documento reprocha. Entran en el borrador local, así que no se pierden al salir a corregir
  otra cosa. Un número mal tecleado bloquea el botón en la pantalla, sin viaje.
- 🚨 **El kilometraje NO se lee con `Number()`** (lo cazó la revisión del propio PR). En español el
  punto es el separador de miles, así que `Number('15.000')` es **15** — y «15.000» es exactamente
  lo que imprime la ayuda del campo con `toLocaleString('es-ES')`. Ese 15 no lo rechazaba nadie: ni
  la pantalla, ni `revisarDatosAuto` (solo exige finito y ≥ 0), ni el vendor, que tarifica un coche
  de quince kilómetros al año y devuelve un precio bajo y firme por los 0,50€ ya pagados. Un error
  de tecleo con forma de chollo. La regla vive testeada en `kilometrosDesdeTexto`: el punto solo
  vale como separador de miles y solo en su sitio (`15.000` sí, `1.5` no), la coma no se acepta, y
  el cero tampoco — es un «no lo sé» disfrazado.
- 🚨 **Y un supuesto corregido deja de pintarse como supuesto.** El precalificador supone ANTES de
  recibir las correcciones, así que su lista habla del estado anterior: con 8.000 tecleados, la
  pantalla seguía diciendo, junto al precio recién pagado, «este precio sale suponiendo kmAnuales:
  15000». Nada fallaba; solo mentía, y sobre la cotización que acaba de costar dinero.
  `supuestosVigentes()` filtra la lista con las correcciones aplicadas, y se aplica en las **cinco**
  salidas del puerto (auto, hogar, auto nueva, moto nueva y el genérico de vida/salud/decesos) —
  el fallo era del patrón, no de este campo.

---

## §5. Lo que NO entra, con su motivo y su orden

| # | Hueco | Por qué no ahora | Qué haría falta |
|---|---|---|---|
| 1 | ~~Zona de expedición + tipo de carnet~~ | ✅ **HECHO** (21/09/2026, con OK de Alberto) | — |
| 2 | ~~Conductor ocasional~~ (`secondaryDriver`) | ✅ **HECHO** (21/09/2026). 🚧 **Sin verificar contra el vendor**: falta UNA cotización real | — |
| 3 | **Fecha de efecto elegible** | hoy es supuesta y tiene dos cepos del vendor ya cazados; tocarla sin pantalla es fácil de romper | campo `date` con los dos cepos pintados antes de pulsar (hoy ≤ fecha ≤ hoy+90) |
| 4 | **CP de circulación distinto del de residencia** | necesita resolver `town.id` del CP nuevo, que es otro catálogo y otra cascada | reutilizar el resolutor de municipios que ya usa el bloque del tomador |
| 5 | **Accesorios / opciones instaladas** (`installedAccessories[]`, `installedOptions[]`) | `/car/vehicles/{code}/options` sin explorar; valor comercial bajo hoy | medir primero qué devuelve para un coche real |
| 6 | **Elegir compañías** | no ahorra dinero; es visibilidad | pasar la selección en la petición y enseñarla |
| 7 | **«Oportunidad» con fecha de cierre** | es CRM comercial, no tarificación | va con el embudo de leads, no aquí |

Orden propuesto: ~~**1 → 2**~~ hechos el mismo día; sigue **3**, y el resto cuando estorben.

### §5bis. Lo que falta de los dos primeros: UNA cotización real (0,50€)

El código está puesto y verificado hasta donde se puede sin gastar: los dos catálogos se sirven
(`GET`, gratis), la proyección está testeada y los cepos se han visto en rojo. Lo que **no** se ha
comprobado es que el vendor acepte el cuerpo:

- `drivingLicenses[].issuingZone.id` con un valor distinto de `Spain` — el catálogo existe, pero que
  el ReRate lo acepte sin pedir un dato más es una suposición razonable, no un hecho medido.
- `risk.secondaryDriver` — está en el contrato de `CarRisk`, nunca se ha mandado. Un 400 nuevo es
  plausible: pasó con `email`, `roadName` y `engine`, y **ese 400 se paga**.

Por eso la verificación la dispara ALBERTO desde la pantalla, con un cliente real, y no un agente por
su cuenta (regla 20 de `correduria-crm`: Codeoscopic cuesta 0,50€ y no es idempotente). Con una sola
cotización se prueban los dos a la vez: se elige una zona de expedición distinta **y** se declara un
conductor ocasional en el mismo presupuesto.

---

## §6. Lo que este documento NO autoriza a decir

- Que Avant2 pida **solo** estos campos: son cinco capturas de un formulario con pasos, no el
  esquema. El contrato de verdad lo dicta la respuesta del vendor, no una pantalla ni un PDF.
- Que los huecos del §5 se resuelvan mandando el campo: cada uno **puede** devolver un 400 nuevo,
  como pasó con `email`, `roadName` y `engine`. Se verifican de uno en uno, y cada intento cuesta.
- Que nuestro precio esté mal hoy. Está construido sobre supuestos declarados, que es distinto de
  estar mal — y a partir de este PR, tres de ellos se pueden desmentir sin salir de la pantalla.
