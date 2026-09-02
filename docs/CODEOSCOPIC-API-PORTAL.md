# 📚 La API de Codeoscopic / Avant2 — leída del portal oficial (01/09/2026)

> **Procedencia:** Alberto exportó el portal de documentación
> (`portal.api-int.codeoscopic.io`, snapshot MHTML del 01/09/2026 a las 22:06) y de ahí se extrajo
> el índice completo de operaciones. **Es la primera documentación del fabricante que tenemos**:
> hasta hoy solo teníamos el traspaso del repo de Manuel, que describe lo que ÉL implementó, no lo
> que la API ofrece. El fichero no se guarda en el repo (16 MB y es material del proveedor).

## 🚨 Lo que esto CORRIGE de lo que dábamos por sabido

| Lo que creíamos | Lo que dice el fabricante |
|---|---|
| «De hogar no hay nada; la API quizá no lo sirva» | **Hogar está en la API con 11 catálogos propios** (`/home/*`). Lo que no existe es en el repo de Manuel |
| «La fecha de matriculación hay que pedirla o sacarla de una foto» | **`GET /car/registration-date?plate=` la devuelve desde la matrícula** |
| «De la matrícula no sale la versión del vehículo; haría falta un proveedor externo» | **`GET /vehicles?registrationPlate=` lo hace** — pero es la ÚNICA operación que exige créditos de pago |
| `portal.api-int…` podía ser el host de la API | Es la **web de documentación**. El propio portal muestra el Token URL: `https://api-int.codeoscopic.io/oauth2/token`, sin `portal.` |

## Los ramos: la API lo dice ella misma, gratis

`GET /insurance-lines` devuelve, por ramo, si se puede tarificar y emitir:

```json
{ "id": "Car", "path": "car", "name": "Autos", "active": true,
  "supports": { "rating": true, "policyApplication": true, "policyApplicationsReport": true } }
```

Con `X-User-Email` lista los ramos de la organización de ese usuario; con `onlyActive=true`, solo los
activos. **Es la forma correcta de responder «¿hogar tarifica para nosotros?»: preguntándoselo a
ellos, gratis, en vez de suponerlo.**

Ramos con catálogos propios en el portal: **auto** (`/car/*`), **moto** (`/motorcycle/*`),
**hogar** (`/home/*`), **vida temporal** (`/term-life/*`), **salud** (`/health/*`) y
**decesos** (`/burial/*`).

### Hogar, con nombre y apellidos

`/home/property-types` · `/home/build-materials` · `/home/build-qualities` · `/home/door-types` ·
`/home/alarm-types` · `/home/locations` · `/home/occupancy-types` · `/home/settlement-types` ·
`/home/uses` · `/home/person-roles` · y `POST /home/recommend-limits`.

Son los factores de tarificación clásicos de un multirriesgo. Encajan con lo que ya guarda la ficha
de bienes (`m2`, `tipoVivienda`, `yearConstruccion`, `rejas`, `puertaBlindada`, `alarmaConectada`),
lo que sugiere que Manuel modeló la ficha mirando esta misma API aunque no llegara a cablear la
cotización.

## Las dos operaciones de matrícula, y cuál cuesta

| Operación | Qué devuelve | Coste |
|---|---|---|
| `GET /car/registration-date?plate=` | `{"date":"2021-10-01"}` — la fecha **aproximada** de matriculación. `null` si no la encuentra | Sin nota de créditos |
| `GET /motorcycle/registration-date?plate=` | Ídem para moto | Sin nota de créditos |
| `GET /vehicles?registrationPlate=` | **El vehículo**, que es lo que da el código de versión | 🚨 **«requires credits that can be requested through our sales team»** |

⚠️ Ojo con dos cosas del `registration-date`: la fecha es **aproximada** (vale para orientar, no
para emitir) y **puede venir `null`** — que es «no la he encontrado», no «no tiene». Tres estados,
como siempre.

🚨 **`GET /vehicles` es la pieza que hace posible «matrícula → precio» para un coche que no
tengamos en ficha**, y es la única de toda la API que se paga aparte. Antes de diseñar nada que
dependa de ella hay que preguntar el precio a `comercial@codeoscopic.com` (lo pregunta Alberto).

✅ **PERO el código de versión NO está detrás de ese muro (01/09/2026).** Lo que se paga es
buscar el vehículo **por matrícula**; el mismo código sale gratis **navegando el catálogo**:

```
GET /car/brands  →  GET /car/brands/{id}/models  →  GET /car/brands/{id}/models/{id}/vehicles
```

Esa última lista da el código Base7 de cada versión, y es un catálogo como los de municipios o
garajes (traspaso de Manuel §4, `car-catalogs.ts:271`). Consecuencia práctica: **la pantalla del
corredor cotiza HOY, sin comprar créditos** — se eligen marca, modelo y versión en tres clics. Los
créditos solo hacen falta el día que el CLIENTE teclee una matrícula y no haya nadie eligiendo.

🚫 **Y una BD externa gratis no sustituye a esto.** Cualquier fuente de terceros (DGT open data va
anonimizada y no lleva matrícula; el resto son de pago) devolvería **texto** («Seat León 1.6 TDI»),
y la cotización no se hace con texto sino con el código Base7 de ELLOS. Casar texto→código es
justo la parte que falla, y cada fallo cuesta 0,50€.

## La API es mucho más que tarificar

Además del cotizador hay superficie de CRM completa, que no estaba en el radar:

- **Pólizas y recibos:** `GET /policies`, `/policies/{id}`, `/receipts`, `/receipt-statuses`,
  `PUT /policies/{id}/receipts/{receiptId}`, `PATCH /policies/{id}`.
- **Siniestros:** `GET /claims`, `POST /policies/{id}/claims`, `/claim-categories`,
  `/claim-coordinators`, `/claim-statuses`.
- **Clientes:** `GET|POST|PUT|DELETE /clients`, `/client-groups`, `/client-tags`, `/client-statuses`.
- **Organización:** `/organizations`, `/offices`, `/sales-agents`, `/collaborators`.
- **Direcciones normalizadas:** `/provinces/{id}/municipalities/{id}/roads/{id}/properties`.

## 🧭 El reparto, en cuatro palabras de Alberto (01/09/2026)

> **«Avant2 vender, CIMA backoffice.»**

Esa frase es la regla de decisión para todo lo que venga después, y resuelve sola la pregunta de qué
endpoint de esta API vale la pena:

| | **Avant2 / Codeoscopic** | **CIMA / EIAC** |
|---|---|---|
| Para qué | **Vender**: comparar, tarificar, cerrar nueva producción | **Backoffice**: cartera viva, recibos, siniestros, comisiones |
| Sentido del dato | Nosotros **empujamos** un riesgo y nos devuelve precios | Las compañías **nos mandan** lo suyo, a diario |
| Cobertura | Solo lo que pase por su plataforma | **Toda** la cartera, compañía a compañía |
| Estado | Por conectar (este trabajo) | **Ya conectado** |

O sea: de esta API interesa lo que ayude a **vender** (`/insurances`, `/insurance-drafts`,
los catálogos, las dos operaciones de matrícula). Lo que huela a backoffice, no.

🚫 **NO usar esto como fuente de la cartera. Dictado por Alberto (01/09/2026), y tiene razón:**
esa función **ya la tenemos por CIMA, y conectada** — que es **la conexión directa con las
compañías**. Mapfre, Allianz, Occident y Reale mandan sus pólizas, recibos, liquidaciones y
siniestros por EIAC/TIREA todos los días, y de ahí sale el control de comisiones.

Leer `/policies` o `/receipts` de Codeoscopic sería leer **el espejo de Avant2**: solo lo que haya
pasado por su plataforma (hoy, un proyecto), de segunda mano, y añadiendo dependencia de un
proveedor para un dato que ya llega de la fuente. **Peor en cobertura, en frescura y en riesgo.**

Estos endpoints se documentan aquí para saber que existen, no porque haya que usarlos. Si algún día
sirven para algo será para lo contrario: **empujar** a Avant2 lo que emitamos, no leer de él.

## Piezas del flujo de cotización

- `POST /insurances` — cotizar (**0,50€**, no idempotente).
- `PATCH /insurances/{id}` · `PATCH /insurances/{insuranceId}/quotes/{quoteId}`.
- `POST /insurances/{id}/offers` — preemisión · `GET …/offers/{offerId}/coverages` — las coberturas.
- `POST /insurances/{id}/policy-applications` — emisión · `…/policy-application-fields` ·
  `…/policy-application-documents`.
- **`POST /insurance-drafts`** — crea un BORRADOR que luego se termina a mano en el asistente de
  Avant2. **Todos los campos son opcionales salvo `insuranceLine`.** Es la vía natural para «capté
  un lead con cuatro datos, que lo remate una persona» sin pagar una cotización.
- `POST /product-form-requests` — los formularios por producto (el mecanismo que en el repo de
  Manuel está dormido).
- `GET /insurances` — buscar proyectos por el `externalId` que mandemos nosotros.

## Autenticación (confirmado por el portal)

OAuth2 **client_credentials** sobre un proveedor **OIDC**. `POST <host>/oauth2/token` con
`client_id`, `client_secret` y `grant_type=client_credentials` en el cuerpo como
`x-www-form-urlencoded`. Responde `access_token`, `expires_in`, `token_type: Bearer`, `scope` y
**`refresh_expires_in: 0` — el token NO se refresca**, hay que volver a pedirlo.

Alternativa a OAuth: cabecera **`X-Client-App`** (hay un `POST /app-auth-tokens` para obtenerla).

Del changelog del portal: **`identification` y `identificationType` están DEPRECADOS** desde
2024-03-07 en favor de `identificationDocument` — que es el que usa nuestro constructor.

## Qué hacer con esto

1. **Preguntar a la API por los ramos** (`GET /insurance-lines`) en cuanto haya conexión. Gratis.
2. **Pedir precio de los créditos de `GET /vehicles`** a `comercial@codeoscopic.com` — decide si
   «matrícula → precio» es viable para clientes nuevos.
3. ✅ (02/09/2026) El detalle de `POST /insurances` para **hogar** ya está extraído del snapshot: ver la
   sección siguiente.

## 🏠 Hogar: el contrato `HomeRisk`, VERIFICADO contra el portal (02/09/2026)

**De dónde sale:** del mismo snapshot MHTML del 01/09 (16 MB; vive en los uploads de la sesión, no en el
repo). El 02/09 se decodificó entero (`python email` → HTML → texto) y ahí estaba el esquema completo de
`POST /insurances` para hogar (opción `3 HomeRisk` del `risk`), los ejemplos de request/response de
`POST /home/recommend-limits` y los roles de persona de hogar. La sección anterior de este documento decía
que «el detalle del cuerpo para hogar no se extrajo»: era verdad hasta que se buscó. Alberto (02/09): «usa
la IA e internet para nombres, no? tienes ya el contexto de todo como yo».

**Cableado y gratis:** `GET /insurance-lines` (id exacto del ramo), los 10 catálogos `/home/*` +
`GET /road-types` (`catalogoHogar()` y `tiposDeVia()` en `apps/asegura/lib/codeoscopic/catalogos.ts`), la
precalificación desde cartera + gemela + Catastro (`desde-cartera-hogar.ts`, que trocea la dirección con
`partirDireccion`) y el constructor `peticion-hogar.ts`, cuya tabla `CAMPOS_VENDOR` es esta:

| Nuestro dato (`DatosHogar`) | Campo del vendor (`risk.…`) | Oblig. | De dónde sale |
|---|---|---|---|
| cp, municipioId, tipoViaId, nombreVia, numeroVia | `address.{postalCode, town.id, roadType.id, roadName, roadNumber}` | ✱ todos | ficha/gemela troceada; `/towns?postalCode=`; `/road-types` |
| planta, puertaVivienda, referenciaCatastral | `address.{floor, door, cadastralReference}` | — | troceo de la dirección; Catastro |
| anioConstruccion / metrosCuadrados | `yearBuilt` / `floorArea` (construida, con terrazas y garaje) | ✱ | ficha, gemela o Catastro |
| habitaciones | `rooms` (≥1, sin salón/cocina/baños) | ✱ | **ninguna ficha lo tiene** → estimado por m², supuesto |
| anioUltimaReforma | `lastReformYear` | si hay reforma | a mano (Lagun Aro lo exige) |
| tipoVivienda | `buildingType.id` | ✱ | `/home/property-types` (ej. `MiddleFloor`) |
| uso ⚠️ | `use.id` = **RÉGIMEN** (propietario/inquilino) | ✱ | `/home/uses` (ej. `Owner`/«Propietario») |
| ocupacion ⚠️ | `occupancy.id` = **USO** (habitual/segunda) | ✱ | `/home/occupancy-types` (ej. `MainResidence`/«Habitual») |
| ubicacion / asentamiento | `location.id` / `settlementType.id` | ✱ | `/home/locations` (`CityCentre`) / `/home/settlement-types` (`ReplacementValue`) |
| material / calidad | `materials.id` / `buildQuality.id` | ✱ | `/home/build-materials` (`NonCombustible`) / `/home/build-qualities` (`Normal`) |
| alarma / puertasSecundarias | `alarm.id` / `secondaryDoorsType.id` | ✱ | `/home/alarm-types` (`NoAlarm`) / `/home/door-types` (`NonReinforcedOtherDoor`) |
| puertaPrincipalBlindada, ventanasSeguras, urbanizacionCerrada | `securityMainDoor`, `securityWindows`, `gatedCommunity` | ✱ | ficha no los tiene → `false`, supuesto |
| vigilante | `securityGuard` | — | solo si se dice |
| propietarioEsTomador | `owner` (la misma persona que `holder`) | rol `owner` min 1 | preseleccionado si el régimen «parece propietario» |
| capitalContinente / capitalContenido | `buildingsLimit` / `contentsLimit` | al menos uno | ficha/gemela; **no se inventan** |
| joyasEnCajaFuerte, joyasFueraDeCaja | `jewelsInSafeBoxLimit`, `jewelsOutSafeBoxLimit` (0…100000) | ✱ | 0, supuesto optimista |
| objetosDeValor, perrosPeligrosos | `highValueItemsLimit`, `numberOfDangerousDogs` | ✱ | 0, supuesto optimista |

Los ids entre paréntesis son los del **ejemplo del portal** (`DEFECTOS_HOGAR` en `catalogos.ts`): la pantalla
los preselecciona **solo si el catálogo vivo los trae** (`elegirDefecto`) y siempre como supuesto visible.
No se manda ningún id que no haya venido de un catálogo.

**Roles de persona de hogar** (`GET /home/person-roles`, ejemplo del portal): `holder` (path `holder`) exige
`identification`, `birthDate`, `name` y `phone` (patrón `^[9|8|7|6][0-9]{8}$`); `maritalStatus`, `gender`,
`email`, `town` y `address` no son obligatorios. `owner` (path `risk.owner`, min 1 / max 1) no exige ningún
campo; `holder` lleva `owner` como rol por defecto y requerido, por eso se manda la misma persona.

**`POST /home/recommend-limits`** (gratis según el portal, que no menciona créditos; puede tardar >1 min):
mismo `holder` + `risk` que la cotización (en el ejemplo el `risk` lleva además `floorId` y `reformed`), sin
`insuranceLine`. Responde `{ buildingsLimit: {average, highest, lowest}, contentsLimit: {…}, results: [ {product, buildingsLimit, contentsLimit} ] }`
(los `results` por compañía solo con `?includeIndividualResults=true`). **Por cablear**: es la forma de no
teclear capitales a ojo cuando la ficha no los trae.

**Lo que respondió el ejemplo del portal a una cotización de hogar** (útil para saber qué mensajes esperar):
Reale y Catalana «Error de conexión con la compañía»; Lagun Aro «Es obligatorio indicar los años de las
ultimas reformas realizadas»; Mutua Tinerfeña «No se permite asegurar viviendas fuera de las Islas Canarias»;
Mussap «Garantía obligatoria no definida». O sea: **por compañía**, y una cotización con errores de
compañía sigue siendo una cotización cobrada.

**Qué pasa si algo está mal:** el vendor responde **400 de validación**, que `cliente.ts` clasifica como
`validacion` = **no se cobra** (`pruebaQueNoHuboCargo`), y su mensaje dice qué campo sobra o falta. La
pantalla enseña ese mensaje entero. Un cuerpo aceptado es una cotización de verdad (0,50€).


## 🛡️ Garantías y opciones por compañía — auditado el 02/09/2026

Alberto preguntó si hacía falta una pantalla nuestra para preconfigurar, por compañía, las
garantías y sus capitales (lo que él hacía en Avant2). Se auditó el snapshot del portal entero
y el CRM de Manuel. **La respuesta es que no hace falta, y estas son las razones medidas.**

### Lo que el fabricante NO tiene

| Lo que buscábamos | Lo que hay |
|---|---|
| Catálogo de garantías por producto | **No existe.** `guarantee`, `warranty`, `franchise` y `excess` aparecen **cero veces** en todo el portal |
| Fijar por API los capitales por defecto de una compañía | **No existe.** Solo se pueden *pisar* petición a petición (`products[].options`) |
| Saber de antemano qué opciones pide cada producto | **No existe por REST.** La única vía documentada es su formulario incrustado |
| Desglose de prima como JSON | **No existe.** Solo dentro del PDF de informe (`includePremiumBreakdown`) |

`GET /insurances/{id}/offers/{offerId}/coverages` **no es** un catálogo de garantías: el propio
portal dice que «the set of coverages returned is the same for all the offers» — es una rejilla
comparativa normalizada de Avant2, de solo lectura, con `included` + `text`, **sin capital y sin
franquicia**.

### Dónde vive entonces la configuración

En Avant2, colgada de la **`config`** del producto, que en la práctica es la clave de conexión de
la correduría con esa compañía (los `config.name` de los ejemplos son códigos como `25499` o
`M06YT80013`). El fabricante lo dice así:

> «Avant2 defines proper default options for each product and also allows you to configure these
> default options for most products. However, if you plan on using this API to complete the rating
> of these quotes and issue insurance applications, depending on the product you will probably be
> required to specify the final value for certain options.»

Y explica por qué no publica un catálogo: «These options are defined by vendors themselves and vary
substantially from one vendor to another and, sometimes, even across products of the same vendor».
Su solución es una librería JavaScript que pinta el formulario de cada producto dentro de un
`iframe`, con un `dataCallback` que hay que reenviar por `POST /product-form-requests` (el iframe no
puede llevar el token: usar credenciales de cliente en el navegador está «explicitly forbidden»).

**Consecuencia práctica:** lo que Alberto preconfiguró en Avant2 se hereda al cotizar por API sin
pedir nada. Duplicarlo en una tabla nuestra crearía dos verdades, y la que manda es la suya.

### Lo que sí se puede leer y escribir por API

- `GET /insurances/{id}/offers/{offerId}` — «Retrieves an insurance offer **with its product
  options**». Devuelve `formattedOptions` (`label` + `formattedValue`, listo para pintar: «Mínimo
  litigioso: 300 €», «Núm. de baños: 1», «Alarma de agua conectada: No») y `options`
  (`id` + `label` + `textValue`). **Este es el cuadro que ve Alberto**, y por aquí se lee.
- `POST /insurances/{id}/offers` — re-tarificar cambiando `mainQuote.product.options`.
- `POST /insurances` acepta `products[].config.id` + `products[].options` para pisar los valores por
  defecto ya en la primera cotización.
- `POST /home/recommend-limits` — **el único punto de la API que da un capital por defecto por
  compañía**: continente y contenido recomendados, con media, máximo y mínimo, desglosados por
  `results[].product.config` y con `favorite: true` marcando la configuración preferida.

### 🚨 El primer precio es SIEMPRE estimado — y NO solo en hogar

⚠️ **Corregido el 02/09/2026 releyendo el snapshot.** Este apartado se escribió como una
particularidad de hogar y no lo es: en los ejemplos del propio portal, **las 28 cotizaciones del
ejemplo de coche traen `"estimate": true`**, 23 de ellas con `actions:[{"id":"ReRate","required":true}]`,
y el ejemplo de moto igual. O sea, el «primer precio estimado + re-tarificación obligatoria» aplica a
auto, moto y hogar por igual. Lo que sigue vale, pero no como excepción del ramo.

En el ejemplo de hogar del portal, **todas** las cotizaciones traen `"estimate": true` y
`actions: [{"id": "ReRate", "required": true}]`. El portal: «This operation is **mandatory** for
offers whose quotes have the action `ReRate` as required». O sea: para un precio firme de hogar hay
una segunda llamada obligatoria. El CRM de Manuel trata ese re-rate como **facturable y no
idempotente** (`noRetry` siempre), así que **un precio firme de hogar probablemente cuesta el
doble**. Sin medir todavía: se mide en la primera cotización real.

### Lo que cada compañía exige y no se puede anticipar

El error de Lagun Aro que ya conocíamos («Es obligatorio indicar los años de las ultimas reformas
realizadas») llega en `errors[].messages[].description`, **después** de cotizar. No hay ninguna
operación que lo anticipe: `GET /insurances/{id}/policy-application-fields` es de emisión y exige una
oferta ya existente. La respuesta del fabricante a este problema es, otra vez, el formulario
incrustado.

Sí hay una pista aprovechable y gratis: `GET /home/person-roles` devuelve, por campo,
`requiredForRatingProducts`, «the products that require the field to complete the rating», con la
advertencia de que tocar esos campos después de cotizar **invalida las cotizaciones anteriores**.

### Qué hizo Manuel con todo esto

Construyó la tubería y **nunca la pantalla**: leer los campos de una compañía, coger sus valores por
defecto, proyectarlos a `product.options` y meterlos en el re-rate **después** de aceptar un precio.
Con una sola compañía en catálogo (Allianz auto a terceros, 14 campos) y **sin tocar hogar**
(`insuranceLine: { id: "Car" }` está escrito a fuego). Su ADR-010 avisa de que en hogar el formulario
trae subformularios anidados (joyas, perros peligrosos) que su mecanismo plano no cubre. Parte de eso
nosotros ya lo mandamos dentro del `risk`.

Trampas que él pagó y conviene heredar: el formulario tarda como una tarificación (timeout de 150 s,
no el de 5 s), el re-rate y la emisión **no se reintentan nunca** por ser facturables, y antes de
gastar se comprueba que no falte ningún obligatorio para no pagar por un rechazo seguro.

---

## 🏢 Qué compañías y ramos alcanza Integra — y cuánto de NUESTRA cartera cubre (02/09/2026)

Alberto pasó `avant2.pdf` («Codeoscopic Integra — Compañías Disponibles», generado desde
`codeoscopic.com/es/workspace/integra/integra-companias-disponibles/`). Es **catálogo comercial**, no
configuración: dice lo que Integra soporta, **no lo que nuestra organización tiene abierto**.

🚨 **Y se demuestra a sí mismo incompleto:** nuestras notas dicen que las compañías vivas para Grupo
Asegura son **Reale y Fidelidade**, y **Fidelidade no aparece en el catálogo**. Así que esta tabla es
un mapa de lo posible, no una fuente de verdad. La fuente de verdad sigue siendo `GET /insurance-lines`
(gratis, ya cableado en `lib/codeoscopic/catalogos.ts`). **No sustituir la llamada por esta tabla.**

### La matriz, tal cual la publica el fabricante

18 aseguradoras × 7 columnas: AUTOS · HOGAR · MOTOS · DECESOS · VIDA · SALUD · COMPLEMENTARIOS.

| Aseguradora | Autos | Hogar | Motos | Decesos | Vida | Salud | Compl. |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Allianz | ✓ | ✓ | ✓ | – | ✓ | – | ✓ |
| AXA Seguros | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Mapfre | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ |
| Generali | ✓ | ✓ | ✓ | – | ✓ | – | ✓ |
| Reale Seguros | ✓ | ✓ | ✓ | – | ✓ | – | ✓ |
| Pelayo | ✓ | ✓ | ✓ | – | – | – | – |
| Santamaría / Helvetia | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ |
| Liberty Seguros | ✓ | ✓ | ✓ | – | – | – | ✓ |
| Zurich | ✓ | ✓ | – | – | ✓ | – | ✓ |
| AIG / Aegon | – | – | – | – | ✓ | ✓ | – |
| Sanitas | – | – | – | – | – | ✓ | – |
| DKV | – | – | – | – | – | ✓ | – |
| FIATC Seguros | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Adeslas / SegurCaixa | ✓ | ✓ | – | ✓ | – | ✓ | ✓ |
| Qualitas Auto / Admiral | ✓ | – | ✓ | – | – | – | – |
| Asisa | – | – | – | ✓ | ✓ | ✓ | – |
| Preventiva Seguros | – | – | – | ✓ | – | – | – |
| Arais / Patria Hispana | ✓ | ✓ | – | – | – | – | ✓ |

Funcionalidades por conexión: **cotizar** · **pre-emitir** · **emitir** · **complementarios**
(suplementos y anexos). El resto del ecosistema del fabricante —Avant2 Sales Manager, Versus Data
Analytics, bCover, Tesis ERP— es producto suyo, no API.

### El cruce con la cartera viva (`import_ref IS NULL`, medido el 02/09/2026)

**Las 109 pólizas de CIMA son de TRES compañías**, y ninguna otra:

| Compañía | DGS | Ramo | Vivas | Activas | ¿Está en el catálogo? |
|---|---|---|--:|--:|---|
| Mapfre | C0058 | auto | 53 | 24 | ✅ |
| Allianz | C0109 | auto | 26 | 20 | ✅ |
| Occident | C0468 | hogar | 10 | 9 | ❌ **la compañía no está** |
| Mapfre | C0058 | hogar | 9 | 4 | ✅ |
| Occident | C0468 | responsabilidad civil | 7 | 6 | ❌ compañía **y** ramo |
| Mapfre | C0058 | responsabilidad civil | 2 | 2 | ❌ **el ramo no existe** |
| Occident | C0468 | auto | 1 | 1 | ❌ la compañía no está |
| Occident | C0468 | moto | 1 | 1 | ❌ la compañía no está |

### Las cuatro consecuencias, y una que NO lo es

1. 🚨 **RC no es un ramo de Integra.** No hay columna en la matriz ni catálogo en el portal
   (`/car`, `/motorcycle`, `/home`, `/term-life`, `/health`, `/burial` — y ya está). Son **9 pólizas,
   8 activas**, sin camino automático de precio. `retarificabilidad()` ya las rechaza («hoy solo se
   retarifica auto y hogar»), pero la frase se escribió como un *todavía*: para RC **no hay endpoint
   que cablear**, hay que llamar a la compañía.
2. **Moto SÍ existe** (12 de las 18 compañías, catálogos `/motorcycle/*`) y nosotros no la
   tarificamos. Es 1 póliza, así que no corre prisa; cuando toque es el ramo más barato de añadir
   porque repite el patrón de auto.
3. **Que Occident no esté NO bloquea retarificar.** Retarificar es pedir precio a OTRAS compañías: la
   actual solo aporta el bonus de la póliza anterior. Lo que sí dice el hueco es que a esos 17
   contratos activos **no se les puede renovar con la suya por API**.
4. **Decesos, vida y salud están en Integra y nosotros tenemos CERO pólizas.** Es mercado que la
   correduría no toca hoy, no una carencia técnica.

⚠️ Lo que este documento **no** autoriza a decir: cuántas de esas compañías puede cotizar Grupo
Asegura de verdad. Eso son `GET /insurance-lines` y los acuerdos firmados, no un PDF de marketing.

---

# 🔬 Segunda pasada al snapshot (02/09/2026): moto, el índice entero y las dos preguntas caras

El `.mht` del portal se volvió a decodificar entero buscando lo que la primera pasada no miró. El
portal es un **rapi-doc sobre un OpenAPI**; los esquemas se leen del árbol del DOM, y **los ejemplos
de los seis ramos están todos ahí** (request solo el de coche; respuestas las seis).

## 🏍️ El ramo MOTO, contrato completo

Hoy no está cableado y **es el ramo más barato de añadir**: `MotorcycleRisk` es `CarRisk` con cuatro
diferencias, ni una más.

| | Auto (`CarRisk`) | Moto (`MotorcycleRisk`) |
|---|---|---|
| `drivingExperience`* | **no existe** | **obligatorio** (`/motorcycle/driving-experience-options`: `ThisMotorcycle`, `OtherMotorcycle`) |
| `previousMotorcycle.code` | — | obligatorio **si** `drivingExperience = OtherMotorcycle` |
| `secondaryDriver` | sí (conductor ocasional) | **no existe** |
| `lightTrailer`* | **obligatorio** (remolque ligero) | no existe |
| `installedOptions` | sí (opciones Base7) | **no existe** |
| Todo lo demás | idéntico | idéntico |

Obligatorios del `risk` de moto: `vehicle.code` (Base7), `circulationAddress.postalCode` +
`circulationAddress.town.id`, `garageType.id`, `primaryDriver`, `owner`, `drivingExperience.id`,
`previouslyInsured`. Condicional: `registrationDate` «**Required:** if `registrationPlate` is not null».

**Y una diferencia fina que ahorra un 400 pagado:** en el `holder` de moto, `town` y `address` son
`required: false`; en auto son `required: true`. El resto (identificación, nacimiento, estado civil,
sexo, nombre, teléfono) es obligatorio en los dos, con el mismo `phone.pattern`
`^[9|8|7|6][0-9]{8}$`.

Sus **11 catálogos** (todos gratis): `/motorcycle/` `brands` · `brands/{id}/models` ·
`brands/{id}/models/{id}/vehicles` · `driving-experience-options` · `driving-license-issuing-zones` ·
`driving-licenses` · `engine-types` · `garage-types` · `insurance-companies` · `person-roles` ·
`registration-date`. Dos detalles medidos: `driving-licenses` de moto añade **`maxDisplacement`**
(`{"id":"A1","minAge":16,"maxDisplacement":125}`), que auto no trae; y en `…/vehicles` el parámetro
`engine` es **obligatorio y enum cerrado** (`Gasoline` | `Diesel` | `Others`), mientras que en auto es
texto libre.

## 🚨 `onlyPopular` tiene `Default: true` — y nos estaba recortando las marcas

`GET /car/brands` (y el de moto) admite `onlyPopular`, **por defecto `true`**. Llamarlo a secas
devuelve solo las marcas «populares»: **una marca fuera de esa lista no aparece en el desplegable, sin
error y sin hueco que la delate** — se ve exactamente igual que si no existiera, y deja un coche
entero sin poder retarificar. Corregido el 02/09/2026 (`catalogos.ts` pasa `onlyPopular=false`
explícito) con cepo en `test/regression-asegura-gasto-codeoscopic.test.ts`, verificado quitándolo.

## Lo demás de AUTO que no estaba escrito

- **Catálogos sin citar:** `/car/driving-license-issuing-zones` · `/car/driving-licenses` ·
  `/car/engine-types` · `/car/garage-types` · `/car/insurance-companies` · `/car/person-roles` ·
  **`/car/vehicles/{vehicleCode}/options`** (las opciones catalogadas de ESE coche en Base7).
- **Campos del `risk` sin citar:** `installedOptions[]` (con `includedOptions`/`excludedOptions`/
  `requiredOptions`), `installedAccessories[]`, `lightTrailer`, `secondaryDriver`, `purchaseDate`,
  `kilometersPerYear` (Min 0 / Max 9.999.999). Y ojo: **`circulationAddress` NO es una dirección** —
  son solo `postalCode` + `town.id`.
- **Reglas literales:** matrícula `^([ceCE]?\d{4}[\D\w]{3})|([\D\w]{1,2}\d{4}[\D\w]{1,2})$` ·
  `externalId` `^[a-zA-Z0-9-._~]+$` · `GET /insurances`: «the date range cannot be wider than 1 year»
  y `fromDate`/`toDate` obligatorias si no mandas `id`/`externalId` · `PATCH /insurances/{id}` es
  **incremental** y descarta lo que no esté en el esquema.
- 🎯 **`person-roles` acepta `offerId`** y entonces devuelve lo que hace falta **para EMITIR** esa
  oferta, no para cotizar. Es la lista de tareas de la fase 2 servida por el vendor. Y avisa:
  «incorporating or modifying these fields **after quoting will invalidate any previous quotes**
  (they will need to be re-rated)».

## El índice: 131 operaciones

**Insurance (9)**: `/insurance-companies` · `/insurance-lines` · `/insurance-lines/{id}/products` ·
`/insurance-vendors` · `GET /insurances` · **`POST /insurances`** (cotizar) · `GET|PATCH /insurances/{id}` ·
`POST /insurances/{id}/reports`.
**Offer (3)**: `POST …/offers` (re-tarificar) · `GET …/offers/{id}` · `GET …/offers/{id}/coverages`
(rejilla comparativa normalizada de garantías — es lo que hoy nos falta para comparar coberturas).
**Quote (1)**: `PATCH …/quotes/{id}` — **solo toca `brokerFee`**.
**Policy application (5)** · **Policy (6)** · **Claim (8)** · **Receipt (7)** · **Report (1)** ·
**File (1)** · **Brokerage (9)** · **Sales organization (3)** · **Client (16)** · **ASM app (2)** ·
**Product Form (1)** · **Person (12)** · **Location (7)** · **Payment (2)** · **Vehicle (1)** ·
**Car (11)** · **Motorcycle (11)** · **Home (11)** · **Health/Burial (1+1)** · **Term life (2)**.

Las marcadas `[TBM]` exigen licencia de **Tesis Broker Manager** (todo `Brokerage`, y los `POST/PUT/
DELETE` de clientes, siniestros y recibos). `POST /reports` tipo `PolicyApplications` exporta
**en el formato del ERP de la organización — y el portal cita EIAC**: hay un puente documentado entre
lo que emitamos por Codeoscopic y el estándar por el que entra CIMA.

⚠️ **Y algo que NO está: webhooks.** Las palabras `webhook`, `subscribe`, `notification` y `polling`
aparecen **cero veces** en todo el snapshot; la API es petición/respuesta síncrona, avisando de que
cotizar «can take more than a minute». Esto **no** demuestra que el webhook que ya tenemos no exista
—se configura en el panel de Codeoscopic, no en esta API— pero sí que **no hay contrato publicado
que leer**: lo que sepamos de él saldrá de sus entregas reales, no de aquí.

## ⏳ Caducidad de un precio: la mejor pista que hay

**El portal no documenta ninguna caducidad.** No define `expires_at` en ningún sitio. La única frase
que la roza está en `POST /insurances/{id}/offers`: una vez re-tarificado, no debería hacer falta
repetirlo «unless other restrictions apply (such as the **offer being expired**)».

Pero los EJEMPLOS traen `quote.expirationDate`, y **dónde aparece es lo informativo**:

| Ejemplo del portal | ¿trae `expirationDate`? |
|---|---|
| `POST /insurances` (los seis ramos) | **NO** |
| `GET /insurances/{id}` | **NO** |
| `GET …/offers/{id}` con la oferta aún `estimate:true` | **NO** |
| **`POST …/offers`** (ya re-tarificado) | **SÍ** |
| **`…/policy-applications`** | **SÍ** |

**Deducción, no afirmación del portal:** la caducidad **aparece cuando el precio deja de ser
estimado**, o sea tras el re-rate — que es exactamente lo que explica nuestra medición de que **los 15
precios reales tenían `expires_at` a NULL**: eran todos primeros precios estimados. Y el plazo **lo
pone cada compañía**: en los cinco ejemplos va de 15 a 60 días desde la creación, y respecto a la
fecha de efecto va de **−1** a **+22** días (uno caduca ANTES de entrar en vigor). **No se puede
calcular: hay que leer el campo.**

Sigue sin respuesta: cuánto vale un precio ya pagado y si una cotización caducada se puede reabrir
sin volver a pagar.

## 🔁 Idempotencia: la pregunta sigue abierta, y el portal empeora el riesgo

Búsqueda exhaustiva de `idempot`, `retry`, `duplicate`, `dedup`, `charge`, `billing`, `credit`:
**cero coincidencias**. No hay cabecera `Idempotency-Key`, ni una nota de qué pasa al repetir un
`POST /insurances`. El portal **ni siquiera menciona que cotizar cueste dinero** (la única nota
económica de toda la API es la de créditos de `GET /vehicles`).

Lo más cercano, en literal:

- **`POST /insurances`, campo `id` del cuerpo:** «If the insurance project has already been quoted,
  set this field to the previous insurance project identifier, so the new insurance project gets
  **associated** with the previous one. Otherwise… **a new independent insurance project will be
  created**.» Asocia; **no deduplica**.
- **`externalId`:** sirve para **buscar después** (`GET /insurances?externalId=`). No se documenta
  ninguna restricción de unicidad. Es la herramienta para **detectar** un duplicado, no para evitarlo.
- **502/503/504:** «Please, **try again** the operation in a few minutes.» O sea: **el fabricante te
  pide reintentar la misma operación que él describe como creadora de un proyecto nuevo e
  independiente.** Eso refuerza la política de un solo intento que ya tiene el código.
- `POST …/policy-applications` avisa de que «the main product will be submitted first and, **if
  accepted**, the addons next»: puede quedarse **a medias**, y no dice cómo reanudarlo.

**Conclusión operativa:** la pregunta «¿un reintento duplica proyecto y cargo?» **no la responde el
portal** y hay que preguntarla a `soporteapi@codeoscopic.com` (comercial, para créditos:
`comercial@codeoscopic.com`). Mientras tanto: un intento, `externalId` siempre puesto, y consultar
antes de gastar.

## Cabeceras y detalles de cableado que faltaban

- `Accept: application/vnd.codeoscopic.v1+json` es **obligatoria en todas las peticiones**: ahí se
  elige la versión de cada operación.
- `X-Client-App` — «**will be mandatory eventually**»; el valor lo da su soporte por correduría.
- `X-User-Email` es **obligatoria** en `POST …/offers`, y «some operations, such as the quote
  operation, cannot be executed as a brokerage».
- `X-Total-Count` **solo viene en la primera página** (`pageNumber=1`).
- Esquema de error: `path`, `requestId`, `error`, `message`, `status`, `timestamp` — el portal pide
  incluirlo entero al reportar incidencias, así que **se registran los seis**.
- Caducan además: el `access_token` (`expires_in: 360`), el token de app (`120 s`), el borrador de
  `/insurance-drafts` (24 h) y el fichero del informe de ofertas (24 h, y **solo se descarga una vez**).
- **El changelog del portal tiene UNA entrada, de 2024-03-07.** La API no publica cambios desde
  entonces.
