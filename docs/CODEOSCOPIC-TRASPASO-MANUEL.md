# 📜 Traspaso de la integración Codeoscopic/Avant2 — documento RECIBIDO de Manuel

> **Procedencia:** generado por el Claude de Manuel sobre su repo `asegura-app` (respuesta al prompt
> de `docs/CODEOSCOPIC-PROMPT-MANUEL.md`), entregado por Alberto el **01/09/2026**. Es **contenido
> externo transcrito tal cual** (sin secretos ni PII; las rutas de fichero citadas son del repo de
> Manuel, no de `central`). El resumen operativo vive en la skill `agente-correduria`
> (`references/sector.md` §4); este archivo es la fuente de detalle.
> **Actualización (mensaje de Manuel, 01/09/2026), que corrige/completa lo de abajo:**
> · Las credenciales entregadas por Bitwarden Send son de **PRODUCCIÓN y están ACTIVAS** — lo que
>   caducó en junio era solo el usuario de sandbox `albertocsf0170ws`. Regeneración EN PAUSA:
>   si un 401 lo desmiente, Manuel escribe a JM.
> · **Host de producción de la API: `https://api.codeoscopic.io`** (el `-int` es el sandbox).
> · El OpenAPI **no lo tiene Manuel** (`SPEC_REF` era un enlace a Linear); si hace falta el
>   contrato formal, se pide a JM.
> · El **fixture** `2026-06-10-sandbox-quote-response.json` fue enviado por Manuel (sanitizado);
>   pendiente de incorporarlo al repo cuando Alberto lo pase.

---

# Traspaso — Integración Codeoscopic / Avant2 (TARIFICACIÓN)

> **Alcance:** solo la parte de **cotizar** (tarificación). La emisión existe en el código pero está tras un flag apagado (§6/§7) y así se deja.
> **Método:** todo leído del código real de `asegura-app`, con rutas de fichero citadas. Donde algo no está en el repo, se dice explícitamente **«no está en el repo»**. Cero secretos (solo nombres de variables). Payloads de ejemplo anonimizados.
> **Ubicación del código:** repo `asegura-app` (Next.js). El grueso de la integración vive en `src/lib/integrations/codeoscopic/`.
> Fecha: 2026-09-01.

---

## 0. Aviso previo — hay DOS flujos de "tarifa" en el código

Es la primera fuente de confusión, así que conviene fijarlo antes:

| Flujo | Fichero | Estado | Qué es |
|---|---|---|---|
| **Cotización REAL** (`POST /insurances`) | `src/lib/integrations/codeoscopic/quote.ts` | **El que funcionó** (29/07: 15 precios) | Entrypoint `requestRealCarQuote`. Aislado del funnel público. Es el que hay que reconstruir. |
| Tarifa "minimizada" clásica | `src/lib/integrations/codeoscopic/tariff.ts` + `src/lib/cotizador/codeoscopic-tariff-flow.ts` | Placeholder, **cortado** | Funnel público antiguo; corta en `vendor_contract_pending`. Path `CODEOSCOPIC_TARIFF_PATH` nunca se cableó a un endpoint real. Ignóralo para tarificar. |

Todo lo que sigue describe el **flujo REAL** (`quote.ts` → `POST /insurances`), salvo mención expresa.

---

## 1. DOCUMENTACIÓN Y HOSTS

### Documentación de la API

- **En el repo (markdown, no PDF):**
  - `asegura-app/docs/integrations/codeoscopic.md` — guía de integración (hosts, auth, paths, payload).
  - `asegura-app/docs/integrations/codeoscopic.env.example` — plantilla comentada de variables.
  - `asegura-app/docs/integrations/codeoscopic-readiness-gate-LOO-56.md` — gate de activación (dependencias legales + checklist).
  - `asegura-app/docs/integrations/codeoscopic-openapi-LOO-56.md` — nota sobre el OpenAPI.
  - `asegura-app/docs/security/codeoscopic-threat-model.md` — STRIDE + logging.
  - `asegura-app/docs/decisions/ADR-010-codeoscopic-product-form-render.md` — decisión sobre el render del formulario de producto.
  - `asegura-app/docs/runbooks/codeoscopic-webhook-basic-auth.md` — runbook del Basic Auth del webhook.
- **Fixture real de respuesta de cotización (sanitizado, sin PII):** `asegura-app/src/lib/integrations/codeoscopic/__fixtures__/2026-06-10-sandbox-quote-response.json`. **Es la mejor referencia del formato de respuesta** — Manuel debería adjuntarlo.
- **OpenAPI del vendor:** **no está en el repo** como fichero. El código lo referencia como algo que "facilita Codeoscopic al dar de alta el acceso" (`docs/integrations/codeoscopic.md:6`). Solo se guarda una *referencia* documental opcional en la env `CODEOSCOPIC_OPENAPI_SPEC_REF` (un enlace/ID, no el spec).
- **Documentación comercial (link):** `https://codeoscopic.com/es/workspace/integra/` (`docs/integrations/codeoscopic.md:6`).

### Hosts

| Qué | Valor | Fuente |
|---|---|---|
| **Host API REST — sandbox** | `https://api-int.codeoscopic.io` | Default en código: `src/lib/integrations/codeoscopic/config.ts:42-45`. Confirmado en `docs/integrations/codeoscopic.env.example:4`. |
| Token OAuth2 (sandbox) | `https://api-int.codeoscopic.io/oauth2/token` | Default `${BASE_URL}/oauth2/token` (`config.ts:55-56`). |
| **Host API REST — producción** | **No está en el repo.** Solo se define la base sandbox; en producción se inyecta por env `CODEOSCOPIC_BASE_URL`, cuyo valor no consta en el repo. | — |
| Web Avant2 (sandbox) | `app-int.avant2.es` | Aparece en `imageUrl`/`appUrls` del fixture de respuesta (es la web, **no** la API). |

> ⚠️ **Drift a corregir:** `docs/integrations/codeoscopic.md:5` menciona `https://portal.api-int.codeoscopic.io/`, pero el código y el `.env.example` usan `https://api-int.codeoscopic.io` **sin** el prefijo `portal.` (el `.env.example:3` avisa literalmente: *"ojo: NO incluir 'portal.'"*). **El valor bueno es el del código: `api-int.codeoscopic.io`.**

### Versión de la API

Pineada por **media type**, no por path: las llamadas de cotización/estado/emisión mandan `Accept` y `Content-Type` = **`application/vnd.codeoscopic.v1+json`** (constante `VND_CODEOSCOPIC_V1_JSON` en `src/lib/integrations/codeoscopic/tariff-contract-constants.ts`, usada en `quote.ts:140-141`, `submit.ts:404`, `submit-state.ts:175`). Los catálogos usan el mismo media type (`catalogs.ts`).

---

## 2. AUTENTICACIÓN

### Esquema

Hay **cuatro modos** soportados (`config.ts:3-7`, selector `CODEOSCOPIC_AUTH_MODE`): `oauth2`, `basic`, `bearer`, `disabled`. **El modo real de Avant2 es OAuth2 `client_credentials`** (así lo marca el `.env.example:6-13` como "modo recomendado" y lo auto-detecta el código si hay `CLIENT_ID` + `CLIENT_SECRET`, `config.ts:68-69`).

**Flujo OAuth2 (`src/lib/integrations/codeoscopic/oauth2.ts`):**
1. `POST` a `CODEOSCOPIC_TOKEN_URL` (default `${BASE_URL}/oauth2/token`), body `application/x-www-form-urlencoded` con `grant_type=client_credentials`, `client_id`, `client_secret` (`oauth2.ts:65-85`).
2. Respuesta: `{ access_token, expires_in, token_type, ... }` (`oauth2.ts:29-36`).
3. El token se **cachea en memoria** por `(tokenUrl, clientId)` con margen de refresco (`CODEOSCOPIC_OAUTH2_REFRESH_MARGIN_S`, default 30s) (`oauth2.ts:161-174`). Cache per-instance (cold-start serverless → re-exchange).
4. Auto-cura de 401: ante un 401 del vendor invalida el token cacheado y reintenta una vez con token fresco (`client.ts:261-307`).

### Dónde viajan las credenciales/cabeceras

En cada request al vendor (`src/lib/integrations/codeoscopic/auth.ts` + `client.ts:163-169`):
- **`Authorization: Bearer <access_token>`** (para OAuth2; para `basic` sería `Authorization: Basic base64(user:pass)`; para `bearer`, el token estático).
- **`X-Client-App: <CODEOSCOPIC_CLIENT_APP>`** — obligatorio (`auth.ts:30-34`).
- **`X-User-Email: <CODEOSCOPIC_USER_EMAIL>`** — obligatorio (`auth.ts:30-34`).
- El código **exige** `clientApp` + `userEmail` en modo oauth2 o lanza `codeoscopic_missing_required_headers` (`config.ts:118-120`).

### Credenciales necesarias (nombres; valores aparte por gestor de contraseñas)

- OAuth2: `CODEOSCOPIC_CLIENT_ID`, `CODEOSCOPIC_CLIENT_SECRET` (**secretos**), + `CODEOSCOPIC_CLIENT_APP`, `CODEOSCOPIC_USER_EMAIL` (identificadores de cabecera).
- El usuario de sandbox `albertocsf0170ws` (caducado jun/2026) encaja como identificador de la cuenta WS del contrato; **su regeneración es un pendiente** (§8).

### Quién emite/regenera las credenciales

- **Codeoscopic** las provee al dar de alta el acceso. Contacto de referencia en la doc/comentarios: **JM Fernández (PM de la API)** — es quien confirma contrato y configuración del webhook (`docs/runbooks/codeoscopic-webhook-basic-auth.md:8-10`; comentarios en `webhook.ts` y `webhook-processing.ts:11-16` citando reuniones 2026-04-28 y sesión129). Buzón de soporte: **no consta un email `soporte@codeoscopic.com` explícito en el repo** — el canal referenciado es JM directamente.
- Tickets referenciados en código/comentarios: **LOO-162** (reapertura sandbox / confirmar creds), **LOO-65** (registrar auth real + rate limits cuando llegue el OpenAPI), **LOO-56** (gate de activación).

---

## 3. FLUJO DE TARIFICACIÓN, ENDPOINT A ENDPOINT

Secuencia real implementada. Base = `CODEOSCOPIC_BASE_URL`. Todas con `Authorization: Bearer`, `X-Client-App`, `X-User-Email` y media type `application/vnd.codeoscopic.v1+json`.

### Paso 1 — Crear proyecto + cotizar (obtener precios)

- **`POST /insurances`** (override `CODEOSCOPIC_QUOTE_PATH`, default `/insurances`).
- Timeout largo: `CODEOSCOPIC_QUOTE_TIMEOUT_MS` (default **150 s**; la cotización puede tardar >1 min).
- **Un solo intento** (`noRetry: true`): es facturable y **no idempotente** vendor-side — un retry duplicaría proyecto y cargo (`quote.ts:143-147`).
- Código: `src/lib/integrations/codeoscopic/quote.ts` → `requestRealCarQuote`; builder del body `quote-request.ts` → `buildCarQuoteRequestBody`; cliente HTTP `client.ts` → `codeoscopicRequest`.

**Request de ejemplo (Auto, `CreateInsuranceRequest_V1`, ANONIMIZADO):**

```json
{
  "insuranceLine": { "id": "Car" },
  "effectiveDate": "2026-09-15",
  "externalId": "cot-000000",
  "holder": {
    "identificationDocument": { "type": { "id": "Dni" }, "id": "00000000T" },
    "name": "NOMBRE",
    "surname": "APELLIDO1",
    "surname2": "APELLIDO2",
    "birthDate": "1985-01-01",
    "gender": { "id": "Male" },
    "maritalStatus": { "id": "Single" },
    "phones": [{ "number": "600000000", "primary": true }],
    "drivingLicenses": [
      { "type": { "id": "B" }, "date": "2005-01-01", "issuingZone": { "id": "Spain" } }
    ],
    "addresses": [{ "postalCode": "28001", "town": { "id": 12345 }, "primary": true }]
  },
  "risk": {
    "vehicle": { "code": "BASE7CODE" },
    "registrationPlate": "0000XXX",
    "registrationDate": "2018-06-01",
    "purchaseDate": "2018-06-01",
    "kilometersPerYear": 12000,
    "circulationAddress": { "postalCode": "28001", "town": { "id": 12345 } },
    "garageType": { "id": "CommunalParking" },
    "lightTrailer": false,
    "owner":         { "... idéntico a holder ..." : true },
    "primaryDriver": { "... idéntico a holder ..." : true },
    "previouslyInsured": true,
    "previousInsurance": {
      "policyNumber": "POL-000",
      "previousCompany": { "code": "M0083" },
      "registrationPlate": "0000XXX",
      "totalYearsInsured": 6,
      "yearsInPreviousCompany": 3,
      "yearsWithoutAccidents": 6
    }
  }
}
```

Reglas del builder (de `quote-request.ts`, verificadas contra sandbox s215):
- **Persona única proyectada IDÉNTICA a los 3 roles** (`holder`, `risk.owner`, `risk.primaryDriver`). El vendor valida consistencia por DNI y devuelve 400 *"Two persons have been declared with the same identification by different data"* si difieren; y prohíbe omitir roles. No amplía el alcance PII (mismo sujeto).
- `addresses` (CP + `town.id`) solo se añade si hay `townId` + `postalCode`; lo exigen 4 productos del launch set. **CP→town.id** vía catálogo `GET towns?postalCode=` (§4).
- `purchaseDate` y `kilometersPerYear` son **obligatorios** para el vendor (default de `purchaseDate` = `registrationDate`).
- `previousInsurance.lastFiveYearsAccidents` requerido si `yearsWithoutAccidents < 5 && yearsWithoutAccidents !== totalYearsInsured`.
- **NO se envían**: email, dirección de calle/número, `economicOccupation`, `employmentStatus`, `birthCountry`.

### Paso 2 — Leer los precios de la respuesta

Respuesta `{ id, mainQuotes[], addonQuotes[], offers[], errors[] }` (Zod tolerante `z.looseObject`, ignora campos extra). Parser: `src/lib/integrations/codeoscopic/quote-response.ts` → `parseQuoteResponse`.

- `id` (number) = **project_id de Codeoscopic** (clave de correlación con el webhook — §5).
- **Precios** = `mainQuotes[]`. Cada uno (`quote-response.ts:26-35`) trae exactamente: **`id`, `premium`, `downPayment`, `paymentMethod`, `estimate`, `referenceFromVendor`, `termMonths`, `product`** (con `product.vendor` = compañía).
- `offers[]` = agrupaciones (compañía principal + complementarias); cada offer referencia un `mainQuote.id` y trae `totalPremium`/`totalDownPayment`.
- `errors[]` = fallos **por compañía** (se loguean por count y **NO abortan** la cotización).
- No hay polling para la cotización: los precios llegan **síncronos** en la respuesta del `POST /insurances`. (El polling existe pero es para reconciliar el estado tras emisión — §6.)

**Ejemplo real de un precio (sanitizado, del fixture):**

```json
{
  "id": "Q7601460",
  "premium": 251.77,
  "downPayment": 251.77,
  "estimate": false,
  "termMonths": 12,
  "referenceFromVendor": "1243991216",
  "paymentMethod": { "id": "Company", "name": "Compañía" },
  "product": {
    "id": 10, "name": "Reale Autos",
    "vendor": { "id": 5, "name": "Reale" },
    "modality": { "name": "Reale Terceros", "category": { "name": "Terceros" } }
  }
}
```

### Paso 3 — Preemisión (re-rate de la oferta elegida)

- **`POST /insurances/{id}/offers`** (operationId `offers.reRateOffer`) — `src/lib/integrations/codeoscopic/rerate.ts:22,74-79`.
- Se pasa el `mainQuote.id` elegido (y opcionalmente `product.options`). Timeout largo (puede tardar >1 min). También `noRetry`.
- Mueve el proyecto a estado `preemision` en local (§6). Es el único estado desde el que se puede emitir.

### Paso 4 — Submit / emisión (FUERA DE ALCANCE, tras flag)

- **`POST /insurances/{id}/policy-applications`** (operationId `policyApplications.submit`), **`multipart/form-data`**: parte JSON `policyApplications` (array con `quote.id`, `product.options?`, `payment.bankAccount.iban?`) + `files` opcional. Segmento override `CODEOSCOPIC_POLICY_APPLICATIONS_SEGMENT`.
- Código: `src/lib/integrations/codeoscopic/submit.ts` → `submitCodeoscopicProject` (path en `buildCodeoscopicSubmitPath`, `submit.ts:211-215`).
- **Gated** por `isCodeoscopicOpenapiReady()` + flag de emisión (§7). No se activa en este traspaso.

### Paso auxiliar — Estado del proyecto en el vendor

- **`GET /insurances/{id}`** (operationId `insurance.getInsurance`) — `submit-state.ts:16,166-175`. Se usa como pre-check de idempotencia antes de emitir (no es parte del cotizar).

### Ficheros donde vive el cliente HTTP y el flujo

| Fichero | Rol |
|---|---|
| `src/lib/integrations/codeoscopic/client.ts` | **Cliente HTTP** genérico: auth, timeout, retries + jitter, circuit breaker, multipart, logs sin URL/cuerpos. |
| `src/lib/integrations/codeoscopic/config.ts` | Resolución de config desde env (base URL, auth, timeouts, paths). |
| `src/lib/integrations/codeoscopic/auth.ts` + `oauth2.ts` | Cabeceras Authorization + intercambio/cache del token OAuth2. |
| `src/lib/integrations/codeoscopic/quote.ts` | Orquesta `POST /insurances` (cotización real). |
| `src/lib/integrations/codeoscopic/quote-request.ts` | Builder del body `CreateInsuranceRequest_V1` (Auto). |
| `src/lib/integrations/codeoscopic/quote-response.ts` | Parser/validador de la respuesta (lectura de precios). |
| `src/lib/integrations/codeoscopic/quote-persistence.ts` | Persistencia de proyecto/precios/ofertas (§6). |
| `src/lib/integrations/codeoscopic/rerate.ts` | Re-rate / preemisión. |
| `src/lib/integrations/codeoscopic/submit.ts` + `submit-state.ts` | Emisión (fuera de alcance) + GET estado. |
| `src/lib/integrations/codeoscopic/catalogs.ts` + `car-catalogs.ts` | Catálogos (towns, marcas/modelos, garaje…). |
| `src/lib/cotizador/codeoscopic-real-quote/*` | Capa de formulario B2B → `CarQuoteInput` (§4). |
| `src/app/api/webhooks/codeoscopic/route.ts` | Receptor del webhook (§5). |
| `src/app/api/crons/codeoscopic-polling/route.ts` | Cron de polling de reconciliación (§6). |

---

## 4. FORMULARIOS DE PRODUCTO

### Campos que exige la cotización, por ramo

**Solo AUTO tiene cotización real cableada.** El formulario B2B (`src/lib/cotizador/codeoscopic-real-quote/form-schema.ts`, `carQuoteFormSchema`) se re-valida contra el schema canónico `carQuoteInputSchema` de `quote-request.ts`.

**Auto — obligatorios:** `dni`, `nombre`, `apellidos`, `fechaNacimiento`, `genero` (`Male`/`Female`), `estadoCivil`, `telefono` (`/^[67][0-9]{8}$/`), `fechaCarnet`, `vehicleCode` (código Base7), `matricula`, `fechaMatriculacion`, `kmAnuales`, `cpCirculacion`, `townIdCirculacion`, `garaje`, `fechaEfecto`.
**Auto — opcionales/condicionales:** `apellido2`; residencia `cpResidencia`+`townIdResidencia` (si hay town ⇒ CP obligatorio); `fechaCompra`; `remolqueLigero`, `aseguradoAntes`; e historial previo (`ciaAnterior`, `numPolizaAnterior`, `aniosAsegurado`, `aniosEnCia`, `aniosSinSiniestros`) obligatorio **si** `aseguradoAntes`.

**Hogar / vivienda: no está en el repo como cotización.** No existe schema de cotización real de hogar; hogar/vida/salud/decesos van por el flujo clásico de **captura de lead sin precio instantáneo** (`src/lib/cotizador/ramos-beta.ts:8-15`).

### ¿Formularios descargados de la API o cableados?

**Conviven dos mecanismos; hoy manda el cableado.**
- **Descarga dinámica del vendor (EXISTE pero DORMIDA, sin callers en runtime):** proxy genérico `product-form.ts` → `POST /product-form-requests`, y runner `product-form-runner.ts` → `GET /insurance-lines/{lineId}/product-configs/fields?stage=&priceId=`. Marcado *"DORMIDO"* en `product-form-runner.ts:16-17`.
- **Catálogo estático CABLEADO (lo activo hoy):** `product-form-catalog.ts` + `product-form-catalog.data.ts`. Única entrada: **Allianz Auto `320200`** (13 campos capturados del front en vivo). Proyecta las `product.options`.
- **Tabla `codeoscopic_product_forms`:** solo **persiste snapshots opacos** (`schema_payload`, `answers_payload` jsonb) por `(project_id, fase)`; **no** define el formulario, es passthrough para auditoría (`product-form-persistence.ts:14-17`).

### Catálogos (de dónde salen)

Todos por `GET` al vendor con cache **in-memory TTL 24h por instancia** (no hay caché persistente en BD). Transporte común `catalogs.ts` → `fetchCatalog` (cap 512KB).

| Catálogo | Endpoint | Función · fichero |
|---|---|---|
| Municipios por CP | `GET towns?postalCode={cp}` | `lookupTownByPostalCode` · `catalogs.ts:92-128` |
| Marcas | `GET car/brands?onlyPopular=` | `listCarBrands` · `car-catalogs.ts:224` |
| Modelos | `GET car/brands/{brandId}/models` | `listCarModels` · `:237` |
| Versiones (código Base7) | `GET car/brands/{brandId}/models/{modelId}/vehicles?engine=` | `searchCarVehicles` · `:271` |
| Tipos de motor | `GET car/engine-types` | `listCarEngineTypes` · `:297` |
| Tipos de garaje | `GET car/garage-types` | `listCarGarageTypes` · `:308` |
| Compañías (DGS) | `GET car/insurance-companies` | `listCarInsuranceCompanies` · `:319` |
| Estados civiles | `GET marital-statuses` | `listMaritalStatuses` · `:330` |

Match marca/modelo desde texto EIAC: módulo puro `vehicle-catalog-match.ts` (no red; ante duda no preselecciona).

---

## 5. WEBHOOK

### Receptor y URL registrada

- **Ruta en la app:** `POST /api/webhooks/codeoscopic` — `src/app/api/webhooks/codeoscopic/route.ts`.
- **URL registrada en Codeoscopic:** `https://app.grupoasegura.com/api/webhooks/codeoscopic` (`docs/runbooks/codeoscopic-webhook-basic-auth.md:15,60,69`).
- **Payload real:** mínimo `{ project_id }` (el vendor dispara el webhook **solo en emisión OK**, confirmado por JM Fernández 2026-04-28; `webhook-processing.ts:11-16`). Además el backend Java envía **heartbeats** ~1/h sin `project_id` que el receptor acusa con `200` para que el vendor no deshabilite el hook (`route.ts:45-50,168-179`).

### Basic Auth del webhook — qué hay y qué quedó pendiente

- **Implementado:** el receptor **exige** `Authorization: Basic base64(user:pass)` y lo verifica contra `CODEOSCOPIC_WEBHOOK_BASIC_USER` + `CODEOSCOPIC_WEBHOOK_BASIC_PASS` (`webhook.ts:23-40`, verificación `verifyCodeoscopicWebhookBasicAuth`). Sin creds configuradas → `503`; firma inválida → `401` (con telemetría forense sin PII).
- **Quién genera vs quién configura:** **ASegura genera** las credenciales (script `scripts/gen-codeoscopic-webhook-creds.sh`, user 32 chars / pass 48 chars) y **Codeoscopic las configura en su panel** — se las pasa a JM por Bitwarden Send (`runbook:8-10,22-27,74-83`). JM confirmó (sesión129) que **prefieren Basic Auth** (no HMAC).
- **Pendiente (esto es lo que quedó "sin definir" en abril/2026):** subir `CODEOSCOPIC_WEBHOOK_BASIC_USER/_PASS` a los 3 entornos de Vercel (no marcar "sensitive"), enviar el Send a JM, que JM las cargue en su lado, y el **smoke E2E conjunto** (emisión sandbox que dispare el webhook real). Hay evidencia de **drift del secret** con Codeoscopic desde 2026-06-12 (comentario en `route.ts:110-113`).

### Por qué los eventos acaban en `processing_error='project_not_found'`

Al recibir el webhook, el receptor busca la fila local por el id del vendor:

```
codeoscopic_projects.project_id_codeoscopic == payload.project_id
```

(`route.ts:210-215`). Si **no hay fila local** con ese `project_id`, la reconciliación devuelve `no_local_project` con `processingNote = "project_not_found"` (`webhook-processing.ts:108-114`) — el evento se registra pero no hay nada que reconciliar.

Causa práctica: el `project_id` que devuelve la cotización (`id` de la respuesta de `POST /insurances`, §3) **debe persistirse** en `codeoscopic_projects.project_id_codeoscopic` para que el webhook lo case. Cuando la emisión se hizo/probó sin que existiera esa fila local (p. ej. emisión manual en el portal Avant2, o cotización no persistida), el webhook llega con un `project_id` que la BD no conoce → `project_not_found`. **La correlación correcta es: persistir el `id` del proyecto Codeoscopic en el momento de cotizar, y buscar por él en el webhook.**

---

## 6. MÁQUINA DE ESTADOS Y TABLAS

### Enum de estados

`pgEnum` **`codeoscopic_project_estado`** (`src/db/schema.ts:279`; creado en `src/db/migrations/0014_loo160_codeoscopic_schema.sql:27`). Valores:

```
cotizacion → preemision → emitida | rechazada | riesgo_condicionado | vencida | error
```

Columna: **`codeoscopic_projects.estado`** (default `cotizacion`, `schema.ts:1724`). Terminales: `emitida`, `rechazada`, `vencida`, `error` (`submit-state.ts:43`).

### Tablas `codeoscopic_*` (todas en `src/db/schema.ts`, DDL en migración `0014`)

| Tabla | Propósito | Columnas clave |
|---|---|---|
| **`codeoscopic_projects`** (`:1686`) | El expediente. 1 fila por proyecto. | `project_id_codeoscopic` (UNIQUE — id del vendor), `estado`, `aseguradora`, `submittable_quote_id` + `accepted_offer_id_codeoscopic` (oferta aceptada, mig `0083`), `poliza_id`, `submit_attempt_id`, `submit_in_flight_at`, campos de polling. |
| **`codeoscopic_prices`** (`:1801`) | Un precio por compañía/modalidad. | `price_id_codeoscopic` (`Q*` cotización / `I*` emisión), `fase`, `compania`, `modalidad`, `prima_cents`, `tipo` (`estimado`/`definitivo`), `raw_payload`. |
| **`codeoscopic_offers`** (`:1837`) | Ofertas (principal + complementarias). | `offer_id_codeoscopic`, `compania_principal`, `complementarias` jsonb. |
| **`codeoscopic_participants`** (`:1867`) | Snapshot de roles (audit LOPD). | `rol`, `cliente_id`, `snapshot` jsonb. |
| **`codeoscopic_product_forms`** (`:1892`) | Formulario dinámico por fase (§4). | `fase` (`preemision`/`emision`), `schema_payload`, `answers_payload`, unique `(project_id, fase)`. |
| **`codeoscopic_documents`** (`:1922`) | Documentación de la compañía. | `tipo`, `blob_url`, `visible_por_cliente`. |
| **`codeoscopic_webhook_events`** (`:1958`) | Eventos webhook crudos (idempotencia + audit). | `project_id_codeoscopic`, `event_type`, `payload_hash` (UNIQUE SHA256), `raw_payload`, `processing_error`. |

No hay tabla dedicada de submit/emisión: el resultado se escribe sobre `codeoscopic_projects` (+ `mediator_audit_log` como evidencia legal, fuera del set `codeoscopic_*`).

### Qué escribe cada tabla / qué dispara las transiciones

- **Tras cotizar** → `quote-persistence.ts:persistQuoteResult` (en `db.transaction`): INSERT `codeoscopic_projects` con `estado='cotizacion'` (estado inicial) + INSERT `codeoscopic_prices` (`fase='cotizacion'`) + INSERT `codeoscopic_offers`.
- **`cotizacion → preemision`** ← aceptar oferta como corredor / re-rate (`POST /insurances/{id}/offers`), que puebla `submittable_quote_id`/`accepted_offer_id`.
- **`preemision → emitida|error|riesgo_condicionado`** ← persistencia del submit (`auto-submit/persist-with-audit.ts` / `broker-submit/persist-with-audit.ts`; legacy `submit-persistence.ts`). Fuera de alcance.
- **Reconciliación a terminal** ← **webhook** (`webhook-processing.ts` + `webhook-reconcile.ts`) o **polling** (`polling-apply-update.ts`), ambos con UPDATE **guarded** `WHERE estado NOT IN (terminales)` para no pisar un estado ya fijado. Polling: backoff cap 60 min, hard cap 7 días → `vencida`.

### Idempotencia del submit

Codeoscopic **NO deduplica** por attempt_id (afirmado en el código: `schema.ts:278,1685`; `submit-state.ts:12-13`; `submit.ts:226,386`). La protección es **propia**, en tres capas:
1. **`submit_attempt_id`** (uuid propia en `codeoscopic_projects`, `schema.ts:1732`): identificador **client-side** para trazabilidad/índice único terminal. **No se envía al vendor como clave de dedupe.**
2. **`submit_in_flight_at`** (lock server-side, `schema.ts:1740`; lógica en `broker-submit/submit-lock.ts`, TTL 360 s): UPDATE condicional antes del re-rate facturable; 0 filas ⇒ ya hay emisión en curso → cortar. Cierra la ventana de doble-click/F5.
3. **Pre-check de estado del vendor** (`GET /insurances/{id}`) antes de cada POST: si terminal → `already_finalized`; si hay application en vuelo → no re-POST. Y **fail-closed** ante "quizá-emitido" (`submit_pending_reconciliation` / `http_server_error` → `estado='error'`, nunca retry ciego).

**Hasta dónde llega:** evita duplicados **por nuestra parte** (doble POST desde la app). No protege contra un duplicado si se emite por dos canales distintos fuera del lock (p. ej. panel Avant2 + app). El attempt_id es trazabilidad, no una garantía honrada por el vendor.

### Flag de emisión

Nombre exacto: **`BROKER_SUBMIT_ENABLED`** (emisión facturable disparada por el corredor). Se lee en `src/lib/broker-submit/feature-flag.ts:20-22` (`isBrokerSubmitEnabled`), gate real en `broker-submit/orchestrate.ts:334-335` (503 si OFF). Ver matiz de los 3 flags en §7. **Nunca se activó; se deja OFF.**

---

## 7. VARIABLES DE ENTORNO (nombres; valores por gestor de contraseñas)

> ⚠️ **Nunca** pegar los valores aquí. **Secretos** marcados con 🔒.

### Host / contrato
| Variable | Qué es |
|---|---|
| `CODEOSCOPIC_BASE_URL` | Host base de la API (default sandbox `https://api-int.codeoscopic.io`). |
| `CODEOSCOPIC_OPENAPI_READY` | Gate: sin `=true` **no hay ninguna llamada** HTTP al vendor. |
| `CODEOSCOPIC_OPENAPI_SPEC_REF` | Referencia documental al OpenAPI (URL/Linear, sin secretos). |

### Autenticación
| Variable | Qué es |
|---|---|
| `CODEOSCOPIC_AUTH_MODE` | `oauth2` / `basic` / `bearer` / `disabled`. |
| `CODEOSCOPIC_CLIENT_ID` 🔒 | OAuth2 client_credentials — client_id. |
| `CODEOSCOPIC_CLIENT_SECRET` 🔒 | OAuth2 client_credentials — client_secret. |
| `CODEOSCOPIC_TOKEN_URL` | Endpoint del token (default `${BASE_URL}/oauth2/token`). |
| `CODEOSCOPIC_OAUTH2_REFRESH_MARGIN_S` | Margen (s) para refrescar el token (default 30). |
| `CODEOSCOPIC_CLIENT_APP` | Header `X-Client-App` (requerido). |
| `CODEOSCOPIC_USER_EMAIL` | Header `X-User-Email` (requerido). |
| `CODEOSCOPIC_ACCESS_TOKEN` 🔒 | Bearer estático (modo `bearer`). |
| `CODEOSCOPIC_USERNAME` 🔒 | Modo legacy `basic` — usuario. |
| `CODEOSCOPIC_PASSWORD` 🔒 | Modo legacy `basic` — password. |

### Paths REST
| Variable | Qué es |
|---|---|
| `CODEOSCOPIC_QUOTE_PATH` | Path cotización (default `/insurances`). |
| `CODEOSCOPIC_PROJECT_STATE_PATH` | Path GET estado (default `insurances`). |
| `CODEOSCOPIC_POLICY_APPLICATIONS_SEGMENT` | Segmento del emit (default `policy-applications`). |
| `CODEOSCOPIC_TARIFF_PATH` | Path del flujo tarifa clásico (placeholder, sin uso real). |
| `CODEOSCOPIC_PROBE_PATH` | Path opcional de health/probe. |
| `CODEOSCOPIC_SUBMIT_PATH` | Legacy; sin valor el emit devuelve `submit_path_not_configured` (hoy el path se deriva del project id). |

### Timeouts / resiliencia
| Variable | Qué es |
|---|---|
| `CODEOSCOPIC_REQUEST_TIMEOUT_MS` | Timeout genérico (default 5000). |
| `CODEOSCOPIC_QUOTE_TIMEOUT_MS` | Timeout de cotización/re-rate/emisión (default 150000). |
| `CODEOSCOPIC_MAX_RETRIES` | Reintentos, clamp 1–5 (default 3). |
| `CODEOSCOPIC_CIRCUIT_FAILURE_THRESHOLD` | Umbral fallos para abrir el circuito (default 5). |
| `CODEOSCOPIC_CIRCUIT_WINDOW_MS` | Ventana del circuit breaker (default 60000). |
| `CODEOSCOPIC_CIRCUIT_RESET_MS` | Reset del breaker (default 30000). |

### Webhook (Basic Auth entrante)
| Variable | Qué es |
|---|---|
| `CODEOSCOPIC_WEBHOOK_BASIC_USER` 🔒 | Usuario Basic Auth del webhook (≥32 chars). |
| `CODEOSCOPIC_WEBHOOK_BASIC_PASS` 🔒 | Password Basic Auth del webhook (≥48 chars). |

### Flags de emisión / comportamiento (todos fail-closed, solo `"true"` activa)
| Variable | Qué es |
|---|---|
| `BROKER_SUBMIT_ENABLED` | **Emisión facturable** disparada por el corredor (503 si OFF). El flag de emisión. |
| `BROKER_INITIATED_EMISSION_ENABLED` | Permite aceptar oferta como corredor → `preemision` (paso previo, NO emite). |
| `NON_AUTO_EMISSION_ENABLED` | CSV de ramos habilitados para el flujo de **solicitud de emisión NO-automática** (a ops, no dispara al vendor). |
| `AUTO_SUBMIT_ENABLED` | Emisión automática cliente-driven (ortogonal; post-MVP). |
| `CODEOSCOPIC_PRODUCT_OPTIONS_ENABLED` | Habilita `product.options` en re-rate/submit. |
| `CODEOSCOPIC_VENDOR_REASON_CAPTURE` | Captura sanitizada del motivo de un 400 del vendor (default OFF). |
| `CODEOSCOPIC_PRICE_DIVERGENCE_TOLERANCE_BPS` | Tolerancia de divergencia de precio en bps (default 0). |
| `IBAN_TRANSMISSION_ENABLED` | Habilita transmitir IBAN en el submit. |
| `NEXT_PUBLIC_BROKER_MULTIRAMO_ENABLED` | Flag de cliente multi-ramo. |

### Ops
| Variable | Qué es |
|---|---|
| `BROKER_OPS_EMAIL` | Buzón de ops para solicitud interna de emisión (fallback `operaciones@grupoasegura.com`). |

**No están en el repo** (solo mencionadas como patrón futuro): `CODEOSCOPIC_OPENAPI_KEY`, `CODEOSCOPIC_OPENAPI_BASE_URL`. `LINEAR_WEBHOOK_SECRET` y `SLACK_WEBHOOK_URL` aparecen en el código pero **no son de Codeoscopic**.

---

## 8. PENDIENTES Y COSTE

### Contador / tope de cotizaciones

- **No hay un contador ni tope propio del número de cotizaciones al vendor** dentro de `src/lib/integrations/codeoscopic/`. (El test `codeoscopic-abuse.test.ts` prueba hardening anti-inyección de payload, **no** volumen.)
- Lo que **sí** existe como freno anti-masa:
  - **Rate-limit por IP del cotizador público:** `src/lib/cotizador/rate-limit.ts:7-16` — **40 peticiones / 15 min** por IP (`allowPublicCotizadorRequest`). Limita el frontend, no la facturación.
  - **Circuit breaker** + manejo reactivo de **429** (`http-failure.ts`, `quote.ts:207-208`).
  - **`noRetry` en quote/submit** (evita duplicar cargos por reintentos internos).
- **Recomendación:** si queréis un tope duro de cotizaciones/mes por control de coste (0,50 €/cotización), **hay que añadirlo** — no vive en el repo. El sitio natural es un contador antes de `requestRealCarQuote` en `quote.ts`.

### Pendientes para llegar a producción (según código/docs)

1. **Regenerar credenciales de sandbox** (OAuth2 `CLIENT_ID`/`CLIENT_SECRET` + usuario WS `albertocsf0170ws`, caducadas jun/2026) — confirmar con JM/Codeoscopic (refs LOO-162). *No hay un runbook dedicado a esta regeneración en el repo; el único runbook de rotación es el del webhook.*
2. **Definir el Basic Auth del webhook** (§5): generar creds, subirlas a Vercel (3 entornos, no "sensitive"), pasarlas a JM por Bitwarden Send, que Codeoscopic las cargue en su panel.
3. **Smoke E2E** conjunto: Quote → preemisión → Submit → webhook contra sandbox, verificando el webhook real en logs (`runbook:85-94`).
4. **Gate LOO-56** (`docs/integrations/codeoscopic-readiness-gate-LOO-56.md`): dependencias legales (LOO-53/54/55: LOPD-GDD, RIPD, DPA) en Done antes de datos reales; OpenAPI final versionado; **rate limits y SLA del vendor documentados** (hoy pendientes); `CODEOSCOPIC_OPENAPI_READY=true` en prod.
5. **TODO en código:** `submit-state.ts:59` — llamada one-time a `GET /policy-application-statuses` (post-merge LOO-593). Único TODO accionable real.
6. **Emisión**: se deja OFF (`BROKER_SUBMIT_ENABLED=false`); su activación exige autofirma + RC profesional (LOO-184), sign-off legal (LOO-185) y smoke sandbox verde — fuera de este traspaso.

### Coste (confirmado)

- **0,50 € por cotización, facturación a mes vencido.** El repo **no** implementa contador/tope de coste (ver arriba) — se añadirá en el lado de `central`.

---

*Fin del documento. Todo lo anterior está leído del código real de `asegura-app`; lo que no consta en el repo está marcado como tal.*
