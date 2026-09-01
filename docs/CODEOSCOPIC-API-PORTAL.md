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

## La API es mucho más que tarificar

Además del cotizador hay superficie de CRM completa, que no estaba en el radar:

- **Pólizas y recibos:** `GET /policies`, `/policies/{id}`, `/receipts`, `/receipt-statuses`,
  `PUT /policies/{id}/receipts/{receiptId}`, `PATCH /policies/{id}`.
- **Siniestros:** `GET /claims`, `POST /policies/{id}/claims`, `/claim-categories`,
  `/claim-coordinators`, `/claim-statuses`.
- **Clientes:** `GET|POST|PUT|DELETE /clients`, `/client-groups`, `/client-tags`, `/client-statuses`.
- **Organización:** `/organizations`, `/offices`, `/sales-agents`, `/collaborators`.
- **Direcciones normalizadas:** `/provinces/{id}/municipalities/{id}/roads/{id}/properties`.

Merece una decisión aparte: parte de lo que estamos migrando de la BD de Manuel quizá se pueda leer
directamente de aquí.

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
