# Fixtures de Codeoscopic / Avant2

## `2026-06-10-sandbox-quote-response.json`

Respuesta REAL de una cotización de auto (`POST /insurances`) contra el **sandbox**, del
10/06/2026. La entregó Manuel el 01/09/2026 desde su repo `asegura-app`
(`src/lib/integrations/codeoscopic/__fixtures__/`).

**Sanitizado — verificado aquí, no solo dicho:** cero claves `holder`/`risk`/`owner`/
`primaryDriver`, cero DNI, IBAN, teléfonos o emails. Los únicos textos con forma de matrícula
(`2407TCB`, `2407TRB`) son **nombres de PDF de condicionados** (códigos de modalidad), y los 159
campos `name` son productos y compañías. Es la petición la que lleva PII, no la respuesta.

Es la referencia del contrato de respuesta mientras no tengamos el OpenAPI (Manuel no lo tiene;
lo custodia Codeoscopic).

### Forma medida sobre este fichero

Raíz: `id`, `insuranceLine`, `effectiveDate`, `creationDateTime`, `mainQuotes[18]`,
`addonQuotes[2]`, `offers[18]`, `errors[3]`, `appUrls`.

Lo que hay que tener en cuenta al escribir el parser, y que **no está en el documento de
traspaso**:

- **`id` de la raíz es un NÚMERO** (`364732`), mientras que los `mainQuotes[].id` son **strings**
  con prefijo (`"Q7601460"`). No unificar tipos a ciegas.
- **`offers[]` referencia a `mainQuotes[]` por JSON-Pointer**: `{"$ref": "#/mainQuotes/0", "id":
  "Q7601460"}`. Trae también el `id` al lado, así que se puede casar por `id` sin resolver el
  `$ref` — más robusto que seguir el puntero.
- 🚨 **`estimate` (bool) y `messages[]` deciden si un precio es EN FIRME.** Hay precios con
  `messages: [{type: "warning", text: "Riesgo condicionado"}]` y observaciones de la compañía
  («NECESARIO DOCUMENTO ORIGINAL ACREDITATIVO BONIFICACION»). Pintar 251,77€ sin ese aviso es
  exactamente la regla «dato que SÍ está pero se lee mal» de `CLAUDE.md`: el número es plausible
  y la condición que lo sostiene desaparece. **Un precio condicionado o estimado se muestra como
  tal, siempre.**
- **`actions[]`** dice qué hace falta para avanzar: `{"id": "ReRate", "required": true}` — la
  preemisión no es opcional en esa oferta.
- **`paymentFrequency`** (`Annual`, `installments`) no aparecía en la lista de campos del
  traspaso; conviene guardarlo: fraccionar cambia la prima.
- **`errors[]` es por COMPAÑÍA y no aborta la cotización** (aquí 3 de 21: Pelayo, Reale y Zurich
  fallaron; 18 devolvieron precio). Sus `messages[].description` son legibles y accionables («La
  matrícula introducida ya está asegurada en la compañía»): hay que enseñárselos a Alberto, no
  tragárselos — que una compañía no dé precio es información comercial, no ruido.

### 🚨 Tres cosas que solo se ven leyendo el fichero ENTERO (01/09/2026)

Una segunda lectura completa destapó tres fallos del parser, ya corregidos:

- **`errors[]` es por CONFIGURACIÓN de producto, NO por compañía.** Reale aparece en los errores
  con la config `37786__` **y a la vez devuelve 8 precios** con la config `83474 (ASM y API)`.
  Resumirlo como «Reale no dio precio» era falso justo sobre la compañía que más dio. De ahí
  `tambienDioPrecio` en `FalloProducto`, y que el resumen solo nombre a las que no dieron NADA
  (aquí, Pelayo y Zurich).
- **`deductible` (la franquicia) la traen 10 de los 18 precios** y el parser la tiraba. Enseñar un
  todo riesgo de 427,79€ callando que lleva **1.500€ de franquicia** es la regla «dato que SÍ está
  pero se lee mal» en su forma más cara. Ojo: ausente es `null` («no lo declara»), nunca `0`, que
  significaría «sin franquicia».
- **`modality.category.name` da los seis niveles de cobertura** — Terceros · Terceros Ampliado ·
  Todo Riesgo Con Franquicia Alta/Media/Baja · Todo Riesgo Sin Franquicia. Es la agrupación
  natural de la comparativa: sin ella se comparan peras con manzanas.

Además, sin usar todavía: `addonQuotes` (RACE-UNACSA, asistencia en carretera a 54,99€ y 199,00€)
con `compatibleAddonQuotes` por precio y `includeInOffers: false` — las 18 ofertas vienen sin
complementos. Y `links[]` con el PDF del condicionado general por producto.

### ⚠️ Las compañías de este fixture NO son la parrilla de producción

Salen Mutua Madrileña, Pelayo, RACE-UNACSA, Zurich… con `config.name` de prueba
(`PelayoAutos_Test`, `ZurichTest`, `OccidentAutosTEST`). Es el catálogo del **sandbox**. Las
compañías realmente contratadas por Alberto son las de `agente-correduria/references/sector.md`
§4 (Allianz, Mapfre, Reale, Occident, Fidelidade). No inferir la parrilla de producción de aquí.
