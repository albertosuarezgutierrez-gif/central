# Codeoscopic / Avant2 API — Referencia técnica para integración

**Fuente:** portal `https://portal.api-int.codeoscopic.io/` (consultado 2026-09-23).
**Spec descargado:** `codeoscopic-openapi-fdb74c4d.yaml` (OpenAPI 3.0.3, 606 KB). Origen: `https://portal.api-int.codeoscopic.io/static/fdb74c4d.yaml`. El portal no tiene botón de descarga; es el fichero que carga el visor (RapiDoc). Se complementa con `/refs/overview.md`, `/refs/oauth2-client-credentials.md` y 50 ejemplos JSON en `https://api-int.codeoscopic.io/doc/examples/...`, todos revisados.

> **Avisos importantes (antes de nada)**
> 1. **La doc no incluye los valores de los catálogos.** Los id de `garageType`, `drivingExperience`, tipos de carnet, estados civiles, etc. solo se obtienen llamando a los endpoints con token. Los valores de este documento salen **de los ejemplos**, y no son listas completas.
> 2. **No hay webhooks ni rate limits documentados.** Los estados se consultan haciendo polling.
> 3. **La API no emite pólizas "en firme".** Envía *policy applications* (solicitudes) que la compañía aprueba, rechaza o revisa. Por la API solo se pueden solicitar las cotizaciones que traigan la acción `SubmitPolicyApplication`; si no la traen, se emite desde ASM (app.avant2.es).
> 4. **URL base de producción: NO DOCUMENTADA de forma explícita.** El spec no tiene `servers`. El portal apunta a INT. En los ejemplos aparece `https://api.codeoscopic.io` [Probable = producción].
> 5. **`GET /organizations` está deprecado y se retira el 2026-09-30** (dentro de 7 días). No lo uséis.
> 6. **El formato de error no cuadra entre la guía y el schema** (ver §8).

---

## 1. Mapa general

### 1.1 Secciones del portal

| Sección (tag) | Qué cubre |
|---|---|
| Overview | Getting Started, Concepts, Request Headers, Request Timeouts, Response Headers, Errors, Product Form Library, Changelog |
| Authentication | OAuth2 client credentials (OIDC) + formulario GET TOKEN |
| Insurance | Líneas, productos, vendors, compañías DGS, cotizar (`POST /insurances`), buscar, recuperar, patch e informe de ofertas |
| Offer | Recuperar oferta, coberturas y re-tarificación |
| Quote | Patch de cotización (`brokerFee`) |
| Policy application | Campos y documentos requeridos, envío de la solicitud, consulta y estados |
| Policy | Pólizas: buscar, ver, patch y borrar (patch y delete son TBM) |
| Claim | Siniestros (crear, modificar y borrar son TBM) |
| Receipt | Recibos (modificar y borrar son TBM) |
| Report | Informe de solicitudes en formato ERP |
| File | Descarga de ficheros (la operación `GET {url}` solo existe en el portal) |
| Brokerage | Oficinas, gestores, colaboradores (TBM) |
| Sales organization | Organizaciones y agentes |
| Client | Clientes, grupos y tags (grupos y tags son TBM) |
| ASM app | Token SSO para la app ASM y borradores de proyecto |
| Product Form | Proxy de la librería JS de formularios de producto |
| Person | Catálogos de persona |
| Location | Países, provincias, municipios, vías, catastro, poblaciones |
| Payment | Formas y frecuencias de pago |
| Vehicle | Búsqueda por matrícula (con créditos) |
| Car / Motorcycle / Home / Health / Burial / Term life insurance line | Catálogos y roles de cada ramo |
| Status | Tag declarado en el spec **sin operaciones**. No aparece en el menú |

**TBM** = requiere licencia *Tesis Broker Manager*.

### 1.2 URL base

| Entorno | URL | Fuente |
|---|---|---|
| Integración (INT) | `https://api-int.codeoscopic.io` | atributo `server-url` del portal y `tokenUrl` |
| Producción | NO DOCUMENTADO (en los ejemplos aparece `https://api.codeoscopic.io/...`) | ejemplos de `InsuranceFile_V1` |
| App ASM | `https://app.avant2.es` (en un ejemplo también `https://app-pre.avant2.es`) | ejemplos |

En el Notion enlazado desde el portal hay una página «Entornos de test», pero su contenido no es público. Tratadla como NO DOCUMENTADA.

### 1.3 Autenticación

- Tipo: **OAuth2 Client Credentials** sobre un proveedor OIDC (`securitySchemes.OIDC`), más un apiKey en la cabecera `X-Client-App` (`securitySchemes.clientApp`).
- Token: `POST https://api-int.codeoscopic.io/oauth2/token`, con `Content-Type: application/x-www-form-urlencoded`
  - Body: `grant_type=client_credentials&client_id=...&client_secret=...` (los tres obligatorios; `grant_type` solo admite `client_credentials`)
  - Respuesta: `access_token`*, `expires_in`* (en el ejemplo, **360 s**), `refresh_expires_in`* (siempre `0`: no hay refresh), `token_type`* (`Bearer`), `not-before-policy`, `scope`*
- Las credenciales se piden a soporteapi@avant2.es (el spec también da soporteapi@codeoscopic.com y apisupport@codeoscopic.com).
- Prohibido usar las credenciales en el navegador: el token se gestiona siempre en el backend.

**Cabeceras:**

| Cabecera | Obligatoria | Valor |
|---|---|---|
| `Authorization` | Sí, en todas | `Bearer <access_token>` |
| `Accept` | Sí, en todas | `application/vnd.codeoscopic.v1+json` |
| `Content-Type` | Sí, si hay body | `application/json` o `application/vnd.codeoscopic.v1+json` (en el spec se declara la segunda) |
| `X-User-Email` | Obligatoria en cotizar, re-tarificar, policy applications y product-form-requests, entre otras | email de un usuario Avant2. Limita el alcance a su organización |
| `X-Client-App` | "Será obligatoria eventualmente" | valor que asigna soporte (p. ej. `mybrokerage.com`) |

Cabeceras de respuesta: `Content-Encoding: gzip`, y `X-Total-Count` en el `pageNumber=1` de las búsquedas paginadas.

### 1.4 Versiones

Hay una sola versión de la API. Cada operación puede tener varias versiones, y se eligen con el media type (`vnd.codeoscopic.vN+json`). **Hoy solo existe `v1`** (159 apariciones en el spec, ninguna `v2`). La guía dice que la versión va en `Content-Type`, pero el ejemplo la pone en `Accept`. Enviad las dos.

---

## 2. Ramos disponibles

Todos los ramos cotizan con **el mismo endpoint** (`POST /insurances`) y un único esquema raíz, `CreateInsuranceRequest_V1`. Lo que cambia es `insuranceLine.id` y el objeto `risk`, que es un `oneOf` **sin discriminator**: el ramo lo determina `insuranceLine.id`.

| Ramo | `insuranceLine.id` | Esquema `risk` | Prefijo de catálogos |
|---|---|---|---|
| Coche | `Car` | `CarRisk_V1` | `/car/...` |
| Moto | `Motorcycle` | `MotorcycleRisk_V1` | `/motorcycle/...` |
| Hogar | `Home` | `HomeRisk_V1` | `/home/...` (+ `POST /home/recommend-limits`) |
| Vida riesgo | `TermLife` | `TermLifeRisk_V1` (`insured`, `deathBenefit`*, …Benefit) | `/term-life/...` |
| Salud | `Health` | `HealthRisk_V1` (`insureds`*: array de `NaturalPerson_V1`) | `/health/person-roles` |
| Decesos | `Burial` | `BurialRisk_V1` (`insureds`*) | `/burial/person-roles` |

**Comercio, PYME, RC, accidentes, mascotas, viaje: NO DOCUMENTADOS** (no hay ramo ni esquema). La lista real de ramos activos para vuestra correduría se obtiene con `GET /insurance-lines` (campos `id`, `path`, `name`, `active` y `supports.rating|policyApplication|policyApplicationsReport`).

---

## 3. Flujo completo de una operación

| # | Paso | Endpoint | Obligatorio en la petición | Clave en la respuesta |
|---|---|---|---|---|
| 0 | Token | `POST /oauth2/token` | `client_id`, `client_secret`, `grant_type` | `access_token`, `expires_in` |
| 1 | Ramos | `GET /insurance-lines` (`onlyActive`, `X-User-Email` opcional) | — | `id`, `path`, `active`, `supports` |
| 2 | Productos | `GET /insurance-lines/{id}/products` | `id` | `id`, `name`, `configs[].id`, `supports.policyApplication` |
| 3 | Roles y campos | `GET /{path}/person-roles` (`X-User-Email`, `offerId`, `holderIsJuridicalPerson`) | — | `fields[].required`, `requiredForRatingProducts` |
| 4 | Catálogos | ver §4 y §5 | — | `id` / `code` |
| 5 | **Cotizar** | `POST /insurances` | `X-User-Email`; body: `insuranceLine`*, `effectiveDate`*, `holder`*, `risk`*; opcionales `id`, `externalId`, `products[]` (`config.id`*, `options`*) | `Insurance_V1`: `id`, `mainQuotes[]`, `addonQuotes[]`, `offers[]`, `errors[]` |
| 6 | Consultar | `GET /insurances/{id}`, `GET /insurances` (búsqueda; rango de fechas ≤ 1 año; `pageSize` ≤ 100) | `id` | igual que el paso 5 |
| 7 | Ver oferta | `GET /insurances/{id}/offers/{offerId}` y `GET .../coverages` | `id`, `offerId` | `mainQuote.actions`, `product.formattedOptions`; coberturas: `name`, `included`, `text` |
| 8 | **Elegir y re-tarificar** | `POST /insurances/{id}/offers` | `X-User-Email`; `mainQuote.id`*; opcionales `effectiveDate`, `product.options`*, `paymentMethod`, `paymentFrequency`, `brokerFee`, `addonQuotes[]` | una oferta nueva (`GetOfferResponse_V1`) |
| 8b | Comisión | `PATCH /insurances/{insuranceId}/quotes/{quoteId}` | `brokerFee` (`null` la resetea) | 204 |
| 9 | Completar datos | `PATCH /insurances/{id}` (incremental) | `insuranceLine`*; `holder`, `risk` (`CarRiskPatch_V1`/`MotorcycleRiskPatch_V1`: `owner`, `primaryDriver`, `registrationPlate`, `registrationDate`; `type` es readOnly) | 204 |
| 10 | **Pre-emisión: campos** | `GET /insurances/{id}/policy-application-fields?offerId=` | `X-User-Email`, `offerId`* | array de JSON Schemas (`SchemaMixin_V1`); 204 si no hace falta nada |
| 11 | **Pre-emisión: documentos** | `POST /insurances/{id}/policy-application-documents` | `X-User-Email`; body `SubmitPolicyApplicationsRequest_V1` (`quote.id`*) | `type`, `url`, `constraints` (`minFiles`, `maxFiles`, `maxFileSize`, `signatureRequired`, `allowedMediaTypes`) |
| 12 | **Emisión (solicitud)** | `POST /insurances/{id}/policy-applications` (`multipart/form-data`) | `X-User-Email`; parte `policyApplications` (JSON): `quote.id`*, `product.options`, `payment.bankAccount.iban` o `payment.creditCard` (`number`*, `expirationMonth`*, `expirationYear`*, `securityCode`), `attachments`; parte `files` (marcada "*Upcoming*") | `PolicyApplication_V1[]`: `id`, `status`, `policyNumber`, `issuedDocuments[]`, `revisedQuote` |
| 13 | Estado | `GET /insurances/{id}/policy-applications/{policyApplicationId}`, `GET /policy-application-statuses` | `X-User-Email` | `status.id` |
| 14 | Documentos / PDF | `issuedDocuments[].url` → `GET <url>` con `Authorization` (y opcionalmente `X-User-Email`) | — | binario. Caduca en `expirationDateTime`; algunos ficheros solo se descargan una vez |
| 15 | Informes | `POST /insurances/{id}/reports` (`type: "Offers"`, `offerIds`, `includeCoverages`, `includePremiumBreakdown`, `includeBrokerFee`, `includeBrokerFeeAmount`, `includeIpid`) y `POST /reports` (`PolicyApplications`) | — | `InsuranceFile_V1` (`name`, `url`, `creationDateTime`, `expirationDateTime`) |
| 16 | Pólizas y recibos | `GET /policies`, `GET /policies/{policyId}`, `GET /receipts` | — | — |

**Acciones de cada cotización** (`actions[]`):
- `ReRate`: `required` y `addressNormalizationRequired`. Si `required: true`, **hay que re-tarificar antes de solicitar la póliza**. En el ejemplo de moto, todas las cotizaciones de Mapfre llegan con `ReRate.required: true`.
- `SubmitPolicyApplication`: `checkFields`, `checkDocuments`, `paymentBankAccountRequired`, `paymentCreditCardRequired` y `addressNormalizationRequired`. Si falta, esa cotización no se puede solicitar por la API.
- `estimate: true` indica un precio estimado; `false`, un precio confirmado.

**Estados de solicitud** que aparecen en la doc: `Approved`, `RevisedQuote` (la compañía propone cambios y hay que volver a enviar con `revisedQuote`). También describe "rechazada" y "pendiente de revisión o intervención manual", pero sin id literal. La lista completa es NO DOCUMENTADA: sale de `GET /policy-application-statuses`.

**Timeouts:** cotizar, re-tarificar y los documentos pueden tardar **más de 1 minuto**. Hay que ajustar el timeout del cliente HTTP y de los proxies.

---

## 4. COCHE frente a MOTO

### 4.1 Catálogos

| Catálogo | Coche | Moto | Parámetros |
|---|---|---|---|
| Marcas | `GET /car/brands` | `GET /motorcycle/brands` | `onlyPopular` (bool, default `true`) |
| Modelos | `GET /car/brands/{brandId}/models` | `GET /motorcycle/brands/{brandId}/models` | `brandId` int32 |
| Versiones (Base7) | `GET /car/brands/{brandId}/models/{modelId}/vehicles` | `GET /motorcycle/brands/{brandId}/models/{modelId}/vehicles` | `engine`* y `minEnginePower`, `maxEnginePower` (CV), `minDisplacement`, `maxDisplacement` (CC). **En moto `engine` es un enum: `Gasoline`, `Diesel`, `Others`**; en coche es un string libre |
| Opciones de fábrica | `GET /car/vehicles/{vehicleCode}/options` | — (no existe) | `vehicleCode` |
| Tipos de motor | `GET /car/engine-types` | `GET /motorcycle/engine-types` | — |
| Tipos de garaje | `GET /car/garage-types` | `GET /motorcycle/garage-types` | — |
| Tipos de carnet | `GET /car/driving-licenses` (`id`, `name`, `minAge`) | `GET /motorcycle/driving-licenses` (`id`, `name`, `minAge`, **`maxDisplacement`, `maxEnginePower`** en kW) | — |
| Zona de expedición del carnet | `GET /car/driving-license-issuing-zones` | `GET /motorcycle/driving-license-issuing-zones` | — |
| Experiencia de conducción | — | `GET /motorcycle/driving-experience-options` | — |
| Compañías anteriores (DGS) | `GET /car/insurance-companies` | `GET /motorcycle/insurance-companies` | — |
| Roles | `GET /car/person-roles` | `GET /motorcycle/person-roles` | `X-User-Email`, `offerId`, `holderIsJuridicalPerson` |
| Fecha de matriculación | `GET /car/registration-date?plate=` | `GET /motorcycle/registration-date?plate=` | `plate`* (patrón `^([ceCE]?\d{4}[\D\w]{3})\|([\D\w]{1,2}\d{4}[\D\w]{1,2})$`) |
| Búsqueda por matrícula | `GET /vehicles?registrationPlate=` (común; **consume créditos**, contratar con comercial@codeoscopic.com; devuelve `Car_V1[]`) | igual | — |
| Uso del vehículo | **NO DOCUMENTADO** como campo o catálogo. [Probable] Es una opción de producto de cada compañía: en un ejemplo aparece `formattedOptions: {"label":"Usos","formattedValue":"PART"}` | igual | vía Product Form |

**Valores literales vistos en los ejemplos** (no son exhaustivos): garaje `CommunalParking` («Garaje colectivo»); motor `Gasoline` («Gasolina»); carnet `B`, `A` (`minAge: 20`); zona `Spain`; experiencia moto `ThisMotorcycle` («Esta Motocicleta») y `OtherMotorcycle` (citado en la descripción de `previousMotorcycle`); compañía anterior `M0083` («MUTUA MADRILEÑA»).

### 4.2 Cuerpo de tarificación

Común a los dos: `insuranceLine`*, `effectiveDate`*, `holder`* (`NaturalPerson_V1` | `JuridicalPerson_V1`), `risk`*, `externalId`, `id`, `products[]`.

**`CarRisk_V1`**: `registrationPlate`, `registrationDate` (obligatoria si hay matrícula), `purchaseDate`, `vehicle`* (`code`* Base7), `installedOptions[]` (`id`*), `installedAccessories[]` (`audioAccessory`*, `value`*, `description`), `circulationAddress`* (`postalCode`*, `town.id`*), `garageType`* (`id`), `kilometersPerYear` (0–9999999), `lightTrailer`* (bool), `primaryDriver`*, `secondaryDriver`, `owner`*, `previouslyInsured`*, `previousInsurance`.

**`MotorcycleRisk_V1`**: `registrationPlate`, `registrationDate`, `purchaseDate`, `vehicle`* (`code`* Base7), `installedAccessories[]`, `circulationAddress`*, `garageType`*, `kilometersPerYear`, `primaryDriver`*, `owner`*, `drivingExperience`* (`id`), `previouslyInsured`*, `previousInsurance`, `previousMotorcycle` (obligatorio si `drivingExperience` = `OtherMotorcycle`; `code`* Base7).

**`previousInsurance`** (`MotorPreviousInsurance_V1`, igual en los dos): `previousCompany.code`* (DGS), `registrationPlate`*, `policyNumber`*, `totalYearsInsured`*, `yearsInPreviousCompany`*, `yearsWithoutAccidents`*, `lastFiveYearsAccidents` (mínimo 0, máximo `totalYearsInsured`, tope 5).

### 4.3 Tabla comparativa

| Campo `risk.*` | Coche | Moto | Obligatorio | Valores / formato |
|---|---|---|---|---|
| `registrationPlate` | ✔ | ✔ | No | string |
| `registrationDate` | ✔ | ✔ | Si hay `registrationPlate` | `yyyy-MM-dd` |
| `purchaseDate` | ✔ | ✔ | No | `yyyy-MM-dd` |
| `vehicle.code` | ✔ | ✔ | Sí | código Base7 |
| `installedOptions[].id` | ✔ | ✗ | No | de `/car/vehicles/{vehicleCode}/options` |
| `installedAccessories[]` | ✔ | ✔ | No | `audioAccessory`*, `value`* ≥ 0 |
| `circulationAddress` | ✔ | ✔ | Sí | `postalCode`, `town.id` (`GET /towns?postalCode=`) |
| `garageType.id` | ✔ | ✔ | Sí | catálogo del ramo |
| `kilometersPerYear` | ✔ | ✔ | No | 0–9999999 |
| `lightTrailer` | ✔ | ✗ | Sí (coche) | boolean (<750 kg) |
| `primaryDriver` | ✔ `CarMainDriver_V1` | ✔ `MotorcycleDriver_V1` | Sí | persona |
| `secondaryDriver` | ✔ | ✗ | No | persona (rol «Conductor ocasional», `min` 0, `max` 1) |
| `owner` | ✔ | ✔ | Sí | natural o jurídica |
| `drivingExperience.id` | ✗ | ✔ | Sí (moto) | `/motorcycle/driving-experience-options` |
| `previousMotorcycle.code` | ✗ | ✔ | Si `OtherMotorcycle` | Base7 |
| `previouslyInsured` | ✔ | ✔ | Sí | boolean |
| `previousInsurance` | ✔ | ✔ | Si `previouslyInsured` = true | ver 4.2 |
| `drivingLicenses[].type.id` (persona) | ✔ | ✔ | Si el rol exige `drivingLicense` | moto: el tipo trae `maxDisplacement` y `maxEnginePower` |

### 4.4 Solo en moto

`drivingExperience`*, `previousMotorcycle`, el filtro `engine` como enum y los límites `maxDisplacement`/`maxEnginePower` del tipo de carnet. **No hay un campo "cilindrada" en el risk**: la cilindrada va implícita en `vehicle.code` (Base7 → `engine.displacement`) y se usa como filtro de búsqueda. **La "fecha del carnet A" no es un campo propio**: es `drivingLicenses[]` con `type.id: "A"` y su `date`. Tampoco hay un campo de antigüedad del carnet A2/A1: NO DOCUMENTADO.

### 4.5 Ejemplos literales de moto

- Petición: `https://api-int.codeoscopic.io/doc/examples/motorcycle/quotation-request.json`. Datos: `insuranceLine.id: "Motorcycle"`, `vehicle.code: "02360100002"` (APRILIA AF1 125, 125 cc, 34 CV), `drivingLicenses: [{type:{id:"B"}...},{type:{id:"A"},date:"2000-01-01",issuingZone:{id:"Spain"}}]`, `drivingExperience: {id:"ThisMotorcycle"}`, `garageType: {id:"CommunalParking"}`, `previousInsurance.previousCompany.code: "M0083"`, `circulationAddress: {postalCode:"08013", town:{id:3679}}`.
- Respuesta: `.../motorcycle/quotation-response.json`. 3 `mainQuotes` de Mapfre Motos (213.75 / 400.15 / 435.56 €, con `ReRate.required: true`) y 22 `errors`, entre ellos **Allianz Motos: "VEHICULO NO PERMITIDO"**.
- Patch: `.../motorcycle/insurance-patch.json`. Roles: `.../motorcycle/person-roles-response.json`.

---

## 5. Datos del conductor y del tomador

Todas las personas usan `NaturalPerson_V1` o `JuridicalPerson_V1`. **Qué campos son obligatorios lo decide el rol**, vía `GET /{ramo}/person-roles` → `fields[]` (`id`, `required`, `modifiable`, `pattern`, `requiredForRatingProducts`).

Ids de campo de rol vistos: `identification`, `birthDate`, `maritalStatus`, `gender`, `name`, `email`, `contactLanguage`, `town`, `address`, `drivingLicense`, `phone` (patrón `^[9|8|7|6][0-9]{8}$`). En el spec también se mencionan `identificationExpirationDate`, `birthCountry`, `weight`, `height`, `smoker` y `economicOccupation`.

| Rol (moto) | path | Id admitidos | Obligatorios (ejemplo) |
|---|---|---|---|
| `primaryDriver` «Conductor habitual» | `risk.primaryDriver` | Dni, Nie, Passport | identification, birthDate, maritalStatus, gender, drivingLicense |
| `owner` «Propietario» | `risk.owner` | Dni, Cif, Nie, Passport | identification, birthDate, maritalStatus, gender |
| `holder` «Tomador» | `holder` | Dni, Cif, Nie, Passport | + name, phone |

En coche se añade `secondaryDriver` «Conductor ocasional» (`min` 0). **Diferencia:** en el ejemplo de coche, el tomador además exige `town` y `address`; en el de moto, no.

Campos de persona relevantes: `identificationDocument` (`type.id`*, `id`*, `expirationDate`), `name`, `surname`, `surname2` (obligatorio si `Dni`), `birthDate`, `gender`, `maritalStatus`, `nationality.code` (ISO alpha-3; obligatorio si `Nie` o `Passport`), `birthCountry`, `addresses[]`, `phones[]`, `emails[]`, `drivingLicenses[]` (`type`*, `date`*, `issuingZone`*), `employmentStatus`, `economicOccupation.code` (CNO-11), `economicInactivityStatus`, `contactLanguage`, `legalRepresentative`. Jurídica: `registrationCountry`, `registrationDate`, `legalForm`, `employeeRange`, `annualTurnoverRange` y `economicActivities`.

- **Conductor ocasional:** solo en coche (`secondaryDriver`).
- **Siniestralidad previa:** `previousInsurance.yearsWithoutAccidents` y `lastFiveYearsAccidents`. No hay más detalle; el certificado de siniestralidad aparece como documento de pre-emisión (`claimsCertificate`).
- **Compañía anterior:** `previousInsurance.previousCompany.code` (código DGS) de `GET /{car|motorcycle}/insurance-companies` o `GET /insurance-companies`.

| Catálogo | Endpoint | Valores vistos |
|---|---|---|
| Tipos de identificación | `GET /identification-types` (`includeNaturalPersons`, `includeJuridicalPersons`) | `Dni` (pattern `^\d{8}[A-HJ-NP-TV-Z]$`), `Nie`, `Passport`, `Cif` |
| Estados civiles | `GET /marital-statuses` | `Single` |
| Géneros | `GET /genders` | `Male` |
| Profesiones (CNO-11) | `GET /economic-occupations` (`level` 1–4, `mainGroup` `[A-Qa-q]`) | `2612` |
| Situación laboral | `GET /employment-statuses` | `Employee` |
| Inactividad | `GET /economic-inactivity-statuses` | — |
| Idiomas | `GET /contact-languages` | — |
| Países | `GET /countries` | `ESP` |
| Tipos de vía | `GET /road-types` | `Calle` |
| Poblaciones | `GET /towns?postalCode=` | `3679` (BARCELONA) |
| CNAE | `GET /economic-activities` (`level`*: Section, Division, Group o Class) | `4121` |
| Otros | `/legal-forms`, `/employee-ranges`, `/annual-turnover-ranges`, `/annual-income-ranges` | — |
| Carnets | `GET /car/driving-licenses`, `GET /motorcycle/driving-licenses` | `B`, `A` |

---

## 6. Compañías y formularios por producto

- **Vendors:** `GET /insurance-vendors` → `id`, `name`, `description`.
- **Productos por ramo:** `GET /insurance-lines/{id}/products` → `id`, `name`, `description`, `imageUrl`, `configs[]` (`id`, `name`, `favorite`), `supports.policyApplication`. El `config.id` es el que se usa en `products[].config.id` al cotizar.
- **Compañías DGS:** `GET /insurance-companies` → `code`, `name`.
- **Product Form:** no hay endpoint de tipo "product options" en REST. Los campos específicos de cada compañía se obtienen con la **librería JS** `https://product-form.avant.codeoscopic.io/js.js` (clase `AvantProductForm`, métodos `render(quote)`, `render(insurance, product, initialOptions)` y `getProductOptions()`), que se pinta en un iframe (CSP: `frame-src *.codeoscopic.io`). El iframe hace sus peticiones por un callback que vuestro backend reenvía a **`POST /product-form-requests`** (`X-User-Email`*; body `method` [`GET`|`POST`|`PUT`|`DELETE`|`PATCH`], `path`*, `params[]` (`name`, `value`), `body`). El resultado (`options[]`) se envía en `products[].options` (al cotizar), `mainQuote.product.options` (al re-tarificar) o `product.options` (en la solicitud).
- Opciones ya tarificadas: `product.options[]` (`InsuranceProductOption_V1`: `id`, `type` [`unknown`, `string`, `integer`, `number`, `boolean`, `percentage`, `currency`, `date`, `datetime`, `time`, `array`, `options`, `file`, `PostalAddress`, `PersonIdentification`, `Base7Option`], `label`, `value`, `deductible`, `deductibleType` [`flat`|`percentage`]) y `formattedOptions`.
- En el portal hay un "RENDER PRODUCT FORM" con tipo `ReRating` o `PolicyApplication` (solo en el portal).
- Sin la librería se cotiza con las opciones por defecto de la configuración, pero **algunas compañías exigirán opciones concretas para confirmar el precio o emitir**.

**Allianz:** no hay un catálogo documentado. Aparece solo en los ejemplos (INT, 2022):

| Producto (`product.name`) | Ramo | `config.id` / `config.name` | Resultado en el ejemplo |
|---|---|---|---|
| Allianz Motos | Motorcycle | `3515` / `PRUEBAS_ALLIANZ` | error "VEHICULO NO PERMITIDO" |
| Allianz Autos | Car | `3439` / `PA014674` | error "FECHA EFECTO SUPERIOR A 90 DIAS, PWE1232" |
| Allianz Autos Turismos Particulares | Car | `3489` / `PA014674` | error, efecto diferido > 90 días |
| Allianz Hogar 2050 | Home | `3554` / `TEST_CONNECTION` | error, efecto > 90 días |
| Allianz Vida-Riesgo | TermLife | `6026` / `PA014674` | 6 modalidades cotizadas (BÁSICO, ÓPTIMO, AMPLIADO, EXTRA, PROFESIONAL, TODO RIESGO) |

El `product.id` de Allianz no aparece en los ejemplos. Los códigos reales de vuestra cuenta se sacan de `GET /insurance-lines/Motorcycle/products`. [Probable] `PA014674` es un código de mediador de Allianz de la cuenta de pruebas, no un código de producto. El vendor tiene logo `company/2`.

---

## 7. Webhooks / notificaciones

**NO DOCUMENTADO.** El spec no tiene `callbacks` ni `webhooks`, y ninguna sección habla de eventos. El estado de las solicitudes se consulta por polling (`GET /insurances/{id}/policy-applications/{policyApplicationId}` o `GET /insurances?policyApplicationStatusIds=...`).

---

## 8. Errores

**Códigos HTTP documentados:** `400` (validación), `401` (token ausente o inválido), `403` (sin acceso, o el usuario no puede enviar solicitudes), `404` (no existe o no es visible con estas credenciales), `500` (reportar a soporte con la respuesta completa), `502` (error con la compañía, reintentar), `503` (servicio caído, reintentar), `504` (timeout de la compañía, reintentar). También hay `204` sin contenido en `policy-application-fields` y `POST /reports`.

**Formato de error: hay una inconsistencia.**
- La guía (Overview → Errors) dice: `path`*, `requestId`*, `error`*, `message`, `status`* (integer), `timestamp`* (date-time).
- El schema `Error_V1` (respuestas 400) dice: `name` (enum `UnknownError`, `CompanyError`, `ValidationError`, `CrmError`, `CredentialsExpired`, `ThirdPartyServiceError`) y `message`.
- Conviene parsear las dos formas.

**Errores por compañía:** no llegan como HTTP. Van en un `200`, dentro de `errors[]` del proyecto (`product`, `messages[]` con `type` en `success`|`info`|`warning`|`error`, `text`, `description`).

**Rate limits: NO DOCUMENTADOS.** El único límite es que `/vehicles` consume créditos.

---

## 9. Cosas raras y avisos

1. **`GET /organizations` está deprecado.** Retirada: **2026-09-30**. Hay que usar `GET /sales-organizations`.
2. **Changelog (2024-03-07):** deprecados `identification` e `identificationType` en favor de `identificationDocument`. Siguen existiendo en `InsuranceSearchResultHolder_V1`, el titular que devuelve `GET /insurances`.
3. **El token dura 360 s en el ejemplo** y no tiene refresh: hay que cachearlo y renovarlo antes de que caduque.
4. **`X-User-Email` es obligatorio para cotizar.** No se puede cotizar como correduría.
5. **`X-Client-App` "será obligatoria eventualmente".** Pedid ya el valor a soporte.
6. **El `risk` no tiene discriminator.** En el PATCH hay un `type` readOnly (`Car`/`Motorcycle`).
7. **Fecha de efecto:** varias compañías (Allianz incluida) rechazan un efecto diferido **de más de 90 días**. No es una regla de la API, pero se repite en los ejemplos.
8. **`ReRate.required: true`** es habitual: el precio inicial suele ser `estimate` y hay que re-tarificar antes de emitir.
9. **Normalización de dirección:** si `addressNormalizationRequired` es true, hay que buscar la vía con `GET /provinces/{p}/municipalities/{m}/roads?source=ProductSpecific&productId=` y hacer PATCH con `normalizations`.
10. **Subida de ficheros en la solicitud:** la parte `files` del multipart está marcada como "*Upcoming*".
11. **Errores en la doc:** el parámetro `plate` de `registration-date` tiene como descripción un placeholder ("The 'stage' parameter is not present or not supported."); el texto enlaza `policy-application-fields` como POST, pero es **GET**; el tipo de `minEnginePower` es int64 en moto e int32 en el resto.
12. **Operaciones TBM:** todo Brokerage, crear, modificar y borrar siniestros, grupos y tags de clientes, patch y delete de pólizas, modificar y borrar recibos.
13. **Los catálogos de INT pueden no coincidir con los de producción:** NO DOCUMENTADO. Los ejemplos son de 2022–2023 y tienen URLs de `localhost:8080` y de `app-pre`.
14. **Ficheros e informes caducan** (`expirationDateTime`), y algunos solo se descargan una vez.
15. **Búsquedas:** el rango de fechas es de 1 año como máximo y `pageSize` de 100 como máximo.

---

## Resumen ejecutivo

- **Ramos:** `Car`, `Motorcycle`, `Home`, `TermLife`, `Health` y `Burial`. Todos cotizan en `POST /insurances`, cambiando `insuranceLine.id` y `risk`.
- **Flujo:** token (360 s) → roles → catálogos → cotizar → re-tarificar si `ReRate.required` → PATCH de datos → campos y documentos → `POST .../policy-applications` → polling del estado → descarga de `issuedDocuments`.
- **Moto frente a coche:** la moto añade `drivingExperience`* y `previousMotorcycle`, filtra versiones con `engine` enum (`Gasoline`/`Diesel`/`Others`) y sus carnets traen `maxDisplacement` y `maxEnginePower`. No tiene `lightTrailer`, `secondaryDriver` ni `installedOptions`.
- La "fecha del carnet A" es `drivingLicenses[{type:{id:"A"},date,issuingZone}]`. La cilindrada va implícita en el `vehicle.code` Base7.
- **Moto de Allianz:** `X-User-Email` de un usuario con Allianz Motos activo; `config.id` real (en INT, `3515`), obtenido de `GET /insurance-lines/Motorcycle/products`.
- Además: vehículo Base7 que Allianz admita (el ejemplo da "VEHICULO NO PERMITIDO"), `effectiveDate` a 90 días o menos, conductor/propietario/tomador con los campos de `/motorcycle/person-roles`, carnet A con fecha, `garageType`, `drivingExperience`, `previouslyInsured` y, si procede, `previousInsurance` con el código DGS.
- Opciones propias de Allianz, como el uso: Product Form.
- Bloqueos pendientes: URL de producción, valor de `X-Client-App`, rate limits y la ausencia de webhooks. Hay que confirmarlo con soporte.
