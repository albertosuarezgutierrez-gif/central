# Plan — revisar Avant2/Codeoscopic ramo a ramo (23/09/2026)

Auditoría de `apps/asegura/lib/codeoscopic/` contra la referencia oficial de la API
(`docs/CODEOSCOPIC-API-REFERENCIA-2026-09.md`, sacada del portal `portal.api-int.codeoscopic.io`
ese mismo día). Solo lectura: no se hizo ninguna llamada facturable. Las líneas citadas son de ese día.

## Por qué existe

Alberto retarificaba la moto de Víctor De la Fuente (Allianz 031698897, Honda NTV 700) y le salían
modelos de COCHE. Tres causas encadenadas, de abajo arriba:

1. **CIMA clasificaba motos como `auto`.** La ingesta (repo `asegura`, `eiac-pol-mapper.ts`) solo
   reconoce moto con `ClaseVehiculo='MO'`, y Allianz y Mapfre mandan otro valor. **18 pólizas de moto
   vivas** estaban como `auto`. Corregidas en BD el 23/09/2026 (ids en asegura#848) y parcheada la
   ingesta: si la matrícula ya consta como moto en la cartera, se persiste como moto, y se guardan en
   crudo `claseVehiculo`/`categoriaVehiculo`/`baseSiete`/`cilindrada` para ver qué manda cada compañía.
2. **Una póliza `auto` retarifica por `prepararAuto`** → catálogo `/car/*` → modelos de coche.
3. **Una póliza `moto` NO se puede retarificar:** `retarificar-cartera.ts:310-319` devuelve 409 y
   `packages/module-seguros/src/retarificable.ts` solo admite auto y hogar. Tras la corrección de BD,
   la moto de Víctor ya no enseña coches, pero **tampoco deja retarificar**. Es el punto 1 del plan.

## Estado por ramo

| Ramo | Cotizar nueva | Retarificar cartera | Emitir | Estado |
|---|---|---|---|---|
| Auto | ✅ | ✅ | ✅ (con póliza) | Único probado de punta a punta (1ª emisión real 21/09) |
| Moto | ✅ `peticion-moto.ts` | ❌ 409 | ❌ | Usa catálogos de COCHE y declara solo carnet B |
| Hogar | ✅ | ✅ | ✅ (con póliza) | Sin tope de 90 días de efecto; `recommend-limits` sin cablear |
| Vida riesgo | 🔴 risk mal formado | ❌ | ❌ | Manda `insured`+`capital`; la API exige `deathBenefit` |
| Salud | 🔴 risk mal formado | ❌ | ❌ | Manda `insured`+`capital`; la API exige `insureds[]` |
| Decesos | 🔴 risk mal formado | ❌ | ❌ | Igual que salud |
| RC, comercio, comunidades | — | — | — | **No existen en la API** (confirmado por Codeoscopic 21/09). Se llama a la compañía |

## Hallazgos transversales

🔴 = rompe o cobra en vano · 🟠 = riesgo · 🟡 = mejora.

- 🔴 **Vida/salud/decesos cotizan con un `risk` que la API contradice** (`peticion-vida.ts:98-101`,
  `peticion-salud.ts:80-83`, `peticion-decesos.ts:74-77`). Si el vendor responde 200 con `errors[]`
  son 0,50€ sin precio.
- 🔴 **Moto usa catálogos de coche:** garaje `catalogos.ts:103` (`/car/garage-types`), carnets y zonas
  `:138-151`, matriculación `:388`. Faltan `/motorcycle/garage-types`, `driving-licenses`,
  `driving-license-issuing-zones`, `insurance-companies`, `engine-types` y `registration-date`.
- 🔴 **Moto declara el carnet B y nunca el A** (`peticion-moto.ts:147` → `persona.ts:122`
  `TIPO_CARNET_SUPUESTO='B'`). Tarificar una moto con la antigüedad del carnet de coche es declarar mal
  el riesgo. El dato existe: `cliente_carnets_conducir` tiene 288 carnets A y 4 A1.
- 🔴 **Timeouts de ReRate y Submit más cortos que lo que la API avisa (>60 s):** `maxDuration=60` en
  `oferta/route.ts:34` y `emitir/route.ts:35`; el `fetch` del Submit sin timeout propio
  (`emitir-envio.ts:246`). Un Submit lento acaba en «quizá emitido».
- 🟠 Proyectos `*-nuevo` no se pueden emitir: `emitir/route.ts:129` exige `poliza_id` y `oferta/route.ts:414`
  guarda el producto como `'auto'`.
- 🟠 Tope de 90 días de efecto solo en auto (`fecha-efecto.ts` solo lo usa `peticion-auto.ts:252`).
- 🟠 Opciones por defecto de Allianz por compañía, no por ramo (`opciones-producto.ts:58-63`): un ReRate
  de Allianz Motos recibiría las de Allianz Auto 320200.
- 🟠 No se leen los flags de `SubmitPolicyApplication` (`checkDocuments`, tarjeta, normalización de
  dirección): se paga el ReRate de cotizaciones que no se pueden emitir por la API.
- 🟠 `RevisedQuote` tratado como «pendiente», sin flujo de reenvío (`reintento-emision.ts:120-126`).
- 🟠 `issuedDocuments` no se descargan y caducan (`expirationDateTime`).
- 🟠 Todo 400 se clasifica «sin cargo» sin mirar `Error_V1.name` (`cliente.ts:382-385`), y el cuerpo se
  recorta a 300 caracteres antes de parsearlo.
- 🟠 Tipo de identificación siempre `Dni` (`persona.ts:157`): NIE/CIF/pasaporte se declaran mal.
- 🟡 `person-roles` sin consultar (los 14 400 de auto se descubrieron pagando), polling de estado de
  solicitudes sin cron, teléfono solo 6/7 (el vendor admite 6-9).
- ✅ Bien: caché de token con margen, cabeceras obligatorias, `/organizations` (deprecado el 30/09)
  **no se usa** en ninguno de los dos repos, proxy de `product-form-requests`, cotizar a 150 s.

## Plan priorizado

| # | Qué | Tamaño |
|---|---|---|
| 1 | **Retarificar moto desde cartera**: `'moto'` en `retarificable.ts`; `precalificarMoto()` copiando `precalificarAuto` (`desde-cartera.ts:268-445`); `prepararMoto()` en `retarificar-cartera.ts` reutilizando `construirPeticionMoto`; rama moto en la pantalla de plataforma | M |
| 2 | Catálogos `/motorcycle/*` que faltan, y cablearlos en moto-nuevo y en el punto 1 | S |
| 3 | Carnet de moto: tipo A/A2/A1/AM + fecha desde `cliente_carnets_conducir`, cruzado con `maxDisplacement`/`maxEnginePower` de la versión antes de pagar | M |
| 4 | ✅ Vida/salud/decesos con la forma de la referencia (vida `insured`+`deathBenefit`; salud/decesos `insureds[]`) y **desbloqueados con OK de Alberto (23/09/2026)**. El primer intento real de cada ramo es el estreno: un 400 se lee y se corrige en `peticion-<ramo>.ts`. Falta quitar de la pantalla el capital de salud/decesos y la duración de vida (ya no viajan) | S + M |
| 5 | Timeouts ReRate/Submit a ~150 s y `maxDuration` 180 | S |
| 6 | `motivoFechaEfectoInvalida` en hogar, moto y demás ramos | S |
| 7 | Opciones por defecto por (compañía, ramo) | S |
| 8 | Leer `actions[]` (SubmitPolicyApplication y flags, `ReRate.required`) | M |
| 9 | Emisión de proyectos nuevos (enlace a cliente, ramo real, póliza al acuñar) | M |
| 10 | Descargar `issuedDocuments`, flujo `RevisedQuote`, cron de polling | M |
| 11 | Parsear el error en sus dos formas antes de recortar | S |
| 12 | `person-roles` antes de cotizar/emitir; tipo de identificación NIE/CIF/pasaporte | M |

## Preguntas para el portal — prompt listo para Claude en Chrome

Pegar tal cual:

> Abre https://portal.api-int.codeoscopic.io/ (no pide login) y consulta la especificación (el visor
> carga `https://portal.api-int.codeoscopic.io/static/fdb74c4d.yaml`, y hay ejemplos en
> `https://api-int.codeoscopic.io/doc/examples/...`). Responde cada pregunta con el path, el esquema
> y los nombres de campo LITERALES; si algo no está documentado, escribe «NO DOCUMENTADO» y no lo
> deduzcas. Devuélvelo en Markdown, numerado igual que aquí.
>
> 1. `TermLifeRisk_V1`: campos obligatorios exactos, tipo y unidad de `deathBenefit`, ¿hay campo de
>    duración o fecha de fin?, esquema de `insured`. Copia el ejemplo de petición de vida si existe.
> 2. `HealthRisk_V1` y `BurialRisk_V1`: esquema completo de `insureds[]` (¿solo `NaturalPerson_V1` o
>    lleva parentesco/rol/capital?). Catálogos propios de salud y decesos además de `person-roles`.
>    Copia los ejemplos de petición.
> 3. `GET /motorcycle/garage-types`: ¿qué ids devuelve en los ejemplos? ¿Coinciden con `/car/garage-types`?
> 4. `GET /motorcycle/driving-licenses`: ids de ejemplo y sus `minAge`, `maxDisplacement`,
>    `maxEnginePower`. ¿Es obligatorio declarar el carnet B además del de moto?
> 5. `MotorcycleDriver_V1` y `/motorcycle/person-roles`: ¿`drivingLicense` es obligatorio para el
>    conductor habitual? ¿Un carnet por tipo?
> 6. `POST /insurances/{id}/offers`: ¿el `effectiveDate` opcional permite cambiar la fecha de efecto
>    de un proyecto ya cotizado?
> 7. Esquema exacto de `actions[]` de una quote (`ReRate` y `SubmitPolicyApplication`), con ejemplo.
> 8. ¿Se dice en algún sitio si `POST .../offers` y `POST .../policy-applications` son facturables?
> 9. Lista completa de `status.id` de solicitudes (`/policy-application-statuses`), si hay ejemplo.
> 10. Flujo de `RevisedQuote`: ¿cómo se reenvía? ¿Va `revisedQuote.id` en `quote.id`?
> 11. `issuedDocuments[]` (`InsuranceFile_V1`): duración hasta `expirationDateTime` y qué documentos
>     son de una sola descarga.
> 12. `Error_V1.name = CompanyError` en un 400: ¿la compañía llegó a recibir la petición?
> 13. URL base y URL del token de PRODUCCIÓN, si aparecen en algún sitio.
> 14. `X-Client-App`: ¿qué dice exactamente la doc y si hay fecha para que sea obligatoria?
> 15. En los ejemplos de `GET /insurance-lines/Motorcycle/products`, ¿qué productos de Allianz Motos
>     aparecen, con su `product.id` y `config.id`?
> 16. `POST /insurances/{id}/policy-application-documents`: lista de `type` posibles y cómo se entregan
>     los ficheros mientras la parte `files` siga «Upcoming».
> 17. `POST /home/recommend-limits`: cuerpo de petición y respuesta completos.
> 18. Identificación: ¿`Cif` vale para el `holder` en auto y moto? ¿`nationality.code` obligatorio con `Nie`?
> 19. ¿Hay algo sobre webhooks o notificaciones fuera del spec (Notion enlazado, changelog)?
> 20. ¿Hay límites de peticiones (rate limits) para los catálogos?
