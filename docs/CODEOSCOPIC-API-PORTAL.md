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
3. Exportar del portal el detalle de `POST /insurances` para **hogar**, si `supports.rating` sale a
   `true`: es el único ramo con volumen en la cartera (19 pólizas) además de auto.
