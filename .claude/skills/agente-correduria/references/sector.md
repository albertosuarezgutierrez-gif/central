# El sector — manual del agente de la correduría

> Acumulativo: cada ciclo el agente añade lo estructural que aprenda (por PR). Fecha cada
> adición. Lo coyuntural (titulares de la semana) va al informe de Telegram, NO aquí.

## 1. Marco regulatorio español (lo mínimo que un corredor no puede ignorar)
- **RD-ley 3/2020** transpone la **IDD** (Directiva de Distribución de Seguros): regula la
  distribución, la información precontractual y la formación. Deroga la vieja Ley 26/2006.
- **LCS — Ley 50/1980 de Contrato de Seguro**: el contrato en sí. Art. 22 (prórroga y
  oposición): el TOMADOR puede oponerse a la prórroga con **1 mes** de preaviso; el
  ASEGURADOR necesita **2 meses**. De ahí sale la ventana comercial de renovaciones.
- **DGSFP** (Dirección General de Seguros y Fondos de Pensiones): registro administrativo
  de mediadores. **Alberto = corredor de seguros, clave `CS-F/0170`** (persona física).
- Obligaciones del corredor: **análisis objetivo** (comparar un número suficiente de
  contratos del mercado — es lo que lo distingue del agente), información precontractual
  documentada, **seguro de RC profesional**, capacidad financiera, formación continua,
  y RGPD reforzado (salud en vida/decesos = categoría especial art. 9).
- Figuras de mediación: **corredor** (independiente, análisis objetivo, cobra comisión de
  la compañía y/u honorarios) vs **agente exclusivo** (una compañía) vs **agente
  vinculado** (varias, sin independencia). ASegura es correduría → corredor.

## 2. Operativa de una correduría (el día a día que el agente debe dominar)
- **Ciclo de una póliza:** tarificación → emisión → recibo (prima) → cartera →
  renovación/anulación. **Siniestro** = el momento de la verdad con el cliente.
- **Nueva producción vs cartera:** comisión de nueva producción (primer año) y comisión
  de cartera (renovaciones). El valor de una correduría ES su cartera: ingreso recurrente
  con tasa de caída (churn) baja si se trabaja la renovación.
- **Vencimientos = la máquina comercial:** 60-90 días antes del vencimiento se revisa la
  póliza, se retarifica en el multitarificador y se retiene o mejora. Una correduría que
  no trabaja vencimientos pierde cartera en silencio.
- **Recibos:** la compañía gira el recibo; la comisión llega por liquidación (CIMA/TIREA
  la estandariza). Impago de recibo → suspensión de cobertura (LCS art. 15) → aviso al
  cliente ANTES de que pase.

## 3. Estándares e infraestructura del sector
- **EIAC**: formato estándar de intercambio compañía↔mediador (ficheros de cartera,
  recibos, siniestros). Las compañías lo publican a diario; se descarga cuando se quiera
  (no es un stream: una pausa no pierde datos).
- **CIMA / TIREA**: plataforma de intercambio (liquidaciones, comisiones). La matriz de
  comisiones COBRADAS de plataforma `/correduria` sale de ahí (vía movimientos BBVA).
- **Multitarificadores**: el corredor tarifica N compañías de una vez. El de la casa es
  **Avant2 Sales Manager (Codeoscopic)** — ver §4.

## 4. Codeoscopic / Avant2 — LA fuente de tarificación y emisión
- Contrato **Workspace + API REST** firmado el **20/05/2026 a nombre de Alberto** (Grupo
  ASegura). Manuel (hermano) fue solo el integrador; sin relación contractual con
  Codeoscopic (dicho por su DPD, 22/05/2026).
- Panel Avant2 operativo a nombre de Alberto (alta abril/2026; recuperación de contraseña
  → su Gmail).
- **Compañías VIVAS en PRODUCCIÓN** (resumen de soporte del 09/06/2026 + alta posterior):
  **Allianz** (autos, motos, hogar, vida-riesgo) · **Mapfre** (autos, motos, hogar) ·
  **Reale** (autos, motos, hogar, comercios, comunidades, decesos, vida-riesgo) ·
  **Occident/Catalana** (auto, moto, hogar, comunidades, comercios) · **Fidelidade** (hogar,
  desde 14/07/2026). Pendiente: **Reale VIDA-RIESGO** devuelve «mediador no está activo» — hay
  que pedir a Reale que habilite al mediador para Avant2.
- 🔑 **Las claves de las compañías NO se generan en el panel**: el corredor se las pide a cada
  compañía y las manda a `soporte@codeoscopic.com`, que las configura. Por eso viajaron en claro
  por email (mayo-junio/2026, tickets 267334) — **pendientes de rotar**.
- **Entornos (web):** sandbox/integración `https://app-int.avant2.es` · producción, tenant propio
  `https://albertosuarezgutierrez.avant2.es`. ✅ **Hosts de la API REST (cerrados 01/09/2026):
  producción `https://api.codeoscopic.io` · sandbox `https://api-int.codeoscopic.io`** (OJO: sin el
  prefijo `portal.` que menciona una doc vieja). El de producción lo confirmó Manuel por mensaje
  (iba en su Bitwarden Send junto a las credenciales).
- 🚨 **Credenciales (mensaje de Manuel, 01/09/2026): las del Send son de PRODUCCIÓN y están
  ACTIVAS.** Lo que caducó en junio era solo el **usuario de sandbox** (`albertocsf0170ws`) — la
  regeneración queda EN PAUSA: se prueba a cotizar en prod directamente y, si diera 401, escribe
  Manuel a JM (tiene el hilo). **Consecuencia: NO hay sandbox utilizable → toda cotización es real
  y facturable (0,50€)**; el contador+tope no es para «cuando se automatice»: va en el PRIMER
  smoke, y ese smoke (1 cotización, 0,50€) se lanza solo con OK explícito de Alberto.
- **OpenAPI: Manuel NO lo tiene** (su `SPEC_REF` era un enlace de trazabilidad a Linear, no el
  spec). Referencia de trabajo = el traspaso + el fixture; el contrato formal, si hace falta, se
  pide a JM. ✅ **Fixture ya en el repo:** `apps/asegura/fixtures/codeoscopic/` (respuesta real de
  18 precios + 3 errores; sanitizado **verificado aquí**, no solo dicho). Su `README.md` recoge lo
  que el traspaso NO decía y que cambia el parser: `offers[]` referencia a `mainQuotes[]` por
  `$ref` JSON-Pointer (pero trae el `id` al lado, mejor casar por ahí), el `id` de raíz es NÚMERO
  y los de precio STRING (`"Q…"`), y sobre todo 🚨 **`estimate` + `messages[]` deciden si un precio
  va EN FIRME**: los hay marcados «Riesgo condicionado» o con condiciones de la compañía, así que
  pintar la prima sola es la regla «dato que se lee mal» de `CLAUDE.md`. Los `errors[]` son POR
  compañía, no abortan, y su texto es accionable («la matrícula ya está asegurada»): se le enseñan
  a Alberto. ⚠️ Las compañías del fixture son del **sandbox** (Zurich, Pelayo, Mutua…, con configs
  `*_Test`): la parrilla real es la de arriba.
- **Coste: 0,50€ POR COTIZACIÓN — resuelto el 01/09/2026 leyendo el Gmail.** Dos fuentes escritas y
  coherentes: el correo del CEO Ángel Blesa (09/04/2026, «se cobra por cotización… 50 céntimos por
  cotización», tarifa de amigo; recotizar el mismo coche añadiendo un conductor son «2 cotizaciones
  independientes») y el **presupuesto de Cristina Ferreiro (14/05/2026), en TEXTO del correo, no en
  el PDF**: «las cotizaciones API, tal y como te ha indicado Ángel, serán a **0.50€ la cotización**,
  normalmente éstas se facturan a mes vencido». El usuario de Avant2 va bonificado al 100%; la
  puesta en marcha fueron 636€+IVA (769,56€ pagados). El recuerdo de Alberto («por emisión») queda
  descartado por ambas fuentes; el contrato C00 (PDF, sin leer) sería la única palabra final, pero
  el presupuesto es su base. **Consecuencia operativa: tarificar en masa cuesta dinero** — una
  cotización = una parrilla con todas las compañías; retarificar la cartera viva (~109 pólizas)
  ronda los 54,50€ por pasada. Cualquier automatismo que cotice lleva **contador y tope** de serie.

### 📜 Contrato técnico de la API — recibido del repo de Manuel (01/09/2026)
Su Claude contestó al prompt con un traspaso completo, transcrito en
**`docs/CODEOSCOPIC-TRASPASO-MANUEL.md`** (leer ahí el detalle; esto es el resumen que no puede
faltar al construir el cliente en `central`):
- **Auth:** OAuth2 `client_credentials` (`POST {BASE_URL}/oauth2/token`) + en CADA request las
  cabeceras **`X-Client-App`** y **`X-User-Email`** (obligatorias) y media type
  **`application/vnd.codeoscopic.v1+json`** en `Accept`/`Content-Type` (la versión va ahí, no en el path).
- **Cotizar = `POST /insurances`**, SÍNCRONO (los precios vienen en la respuesta; timeout 150 s) y
  🚨 **facturable y NO idempotente: UN solo intento, jamás retry** — un reintento duplica proyecto y
  cargo de 0,50€. Respuesta: `id` (= **project_id**, hay que persistirlo SIEMPRE: es la clave con la
  que el webhook nos encontrará el día que llegue uno real), `mainQuotes[]` (los precios),
  `offers[]`, `errors[]` (fallos POR compañía, no abortan).
- **Preemisión = `POST /insurances/{id}/offers`** (re-rate de la oferta elegida, también noRetry) ·
  estado = `GET /insurances/{id}` · emisión = `POST /insurances/{id}/policy-applications`
  (multipart, tras el flag **`BROKER_SUBMIT_ENABLED`**, que sigue OFF y así se queda).
- **Catálogos** por GET (mismo auth): `towns?postalCode=` (CP→town.id, requerido en el payload),
  `car/brands`, `car/brands/{id}/models`, `…/vehicles` (código Base7), `car/garage-types`,
  `car/insurance-companies`, `marital-statuses`.
- **Solo AUTO está cableado como cotización real**; hogar/vida/salud no tienen schema de cotización.
  El payload proyecta la MISMA persona en `holder`/`owner`/`primaryDriver` (el vendor lo exige).
- **Webhook** (`https://app.grupoasegura.com/api/webhooks/codeoscopic`): solo dispara en EMISIÓN OK
  (+ heartbeats ~1/h sin project_id) — **para tarificar no hace falta**. El Basic Auth quedó resuelto
  de diseño: **lo genera ASegura** y Codeoscopic lo carga en su panel; falta ejecutarlo (drift del
  secret desde 12/06).
- **Sin contador/tope de coste en su repo** — confirmado: hay rate-limit por IP (40/15min) y circuit
  breaker, pero nada que limite la facturación. El contador+tope se pone en `central` (regla ya
  anotada arriba).
- **OpenAPI: no está en su repo** (lo entrega Codeoscopic al dar de alta el acceso). Contacto: Juan
  Manuel Fernández, PM de la API. **Pendiente de pedir a Manuel:** el fixture sanitizado
  `__fixtures__/2026-06-10-sandbox-quote-response.json` (la mejor referencia del formato de respuesta).

### 🚦 Dónde se paró EXACTAMENTE la API (03/06/2026) y qué falta
Reconstruido el 01/09/2026 desde el Gmail de Alberto y la BD. La plataforma web funciona; lo
congelado es la API REST, en un correo de Manuel a Juan Manuel Fernández (PM de la API) que
**nunca tuvo respuesta**. Tres puntos (estado tras el traspaso del 01/09):
1. **Credenciales de sandbox CADUCADAS** — usuario `albertocsf0170ws`, enviadas el 30/04/2026 por
   Bitwarden Send con TTL de 7 días. Se pidió regenerarlas el 03/06 y no llegaron. **Sigue abierto:**
   son el OAuth2 `client_id`/`client_secret`; los regenera Codeoscopic (JM Fernández, ref LOO-162).
2. ~~**Basic Auth del webhook SIN DEFINIR**~~ → **DEFINIDO** (traspaso 01/09): las genera ASegura
   (script en el repo de Manuel) y Codeoscopic las configura en su panel. Queda **ejecutarlo**
   (generar, subir a envs, pasarlas a JM). No bloquea la tarificación.
3. **Smoke end-to-end sin correr** (Quote → preemisión → Submit → webhook). Sigue pendiente.

- **Pero el flujo llegó a funcionar de verdad.** Medido en la BD: el **29/07/2026** una cotización
  de auto devolvió **15 precios reales de Mapfre, Allianz y Occident** (278,59€ a 609,64€), con el
  formato de la API (`id, premium, product, estimate, termMonths, downPayment, paymentMethod,
  referenceFromVendor`). Y el **21/05** hubo una **emisión real en sandbox** (nº 360447, avisada por
  correo). O sea: tarificar SÍ; emitir, nunca se cerró.
- 🔬 **Forense de esos 15 precios (leídos de `codeoscopic_prices` el 01/09/2026), y cambia el
  diseño de la pantalla:**
  - **Los 15 son `estimado`. Ni uno en firme.** En el fixture del sandbox pasaba igual (0 de 18).
    Dos muestras de dos: en esta API **lo normal es que el precio venga con reservas**, así que
    enseñar la prima sin su firmeza no es un descuido de borde, es el caso general.
  - **La parrilla real que respondió fue Mapfre, Allianz y Occident** — NO Reale ni Fidelidade,
    que son las que la ficha llama «vivas». Modalidades exactas: `Mapfre Autos`,
    `Allianz Autos 2025`, `Occident GCO Autos 3.0`.
  - **`expires_at` está a NULL en los 15**: no sabemos cuánto vale un precio. Mientras siga así,
    **un precio ya pagado no se puede reutilizar con seguridad** (afecta a cualquier plan de
    cachear cotizaciones para no pagar dos veces). Capturar la caducidad es trabajo pendiente.
  - **`referenceFromVendor` es por COMPAÑÍA:** Allianz y Occident lo mandan, Mapfre no. Tratarlo
    como opcional siempre.
  - El `project_id` de PRODUCCIÓN es de 8 dígitos (`40058158`); el del sandbox, de 6 (`364732`).
  - El `submit_attempt_id` se acuña **al crear el proyecto**, no al emitir (el proyecto real ya lo
    tiene con `submit_in_flight_at` a NULL y estado `cotizacion`).
- 🚨 **CORREGIDO el 01/09/2026 — el `project_not_found` del webhook NO era un fallo de
  correlación. Los dos eventos son SMOKE TESTS hechos a mano**, leídos de su `raw_payload`: el del
  26/05 lleva `project_id: "999999"` y `externalId: "smoke-test-s168"` con `policyApplication.id:
  "PA-SMOKE"`; el del 24/06, `project_id: "smoke-fix-webhook"`. Los identificadores son inventados,
  así que por supuesto no hay fila local que casar. **Nunca ha llegado un evento real de
  Codeoscopic**, y es coherente: el vendor solo dispara el webhook al EMITIR (confirmado por JM) y
  no se ha emitido nunca — el único proyecto real sigue en estado `cotizacion`.
  Lo que sí queda en pie es el mecanismo: persistir el `id` de la cotización en
  `codeoscopic_projects.project_id_codeoscopic` es lo que permitirá casarlo el día que llegue uno
  de verdad. Lo que NO se puede decir es que «el canal de vuelta está abierto»: **está sin
  estrenar**, y los smoke tests solo prueban nuestro receptor, no el envío de Codeoscopic.
- **Máquina de estados ya modelada por Manuel:** `cotizacion → preemision → emitida | rechazada |
  riesgo_condicionado | vencida | error`, con `submit_attempt_id` (idempotencia) y polling.
  Tablas `codeoscopic_projects/offers/prices/documents/participants/product_forms/webhook_events`.
- **DPA art. 28 RGPD: decisión abierta.** El DPD de Codeoscopic se niega a firmarlo con el
  integrador (no hay relación contractual con él) y solo remite su política de privacidad. Manuel
  lo consideraba requisito previo a producción.
- ✅ **La documentación de la API ya está conseguida** (01/09/2026): el traspaso del repo de Manuel
  (`docs/CODEOSCOPIC-TRASPASO-MANUEL.md`) trae host base, auth y contratos de endpoints. Lo único
  documental que falta es el **OpenAPI oficial** (no está en su repo; lo entrega Codeoscopic).
- Manuales de la PLATAFORMA (no de la API) sí están: ticket 267332 del 25/05/2026, más
  `academy.codeoscopic.com` y el KB `codeoscopicavant2.zohodesk.com`.

### 📚 La documentación OFICIAL de la API — conseguida el 01/09/2026

Alberto exportó el portal (`portal.api-int.codeoscopic.io`) y de ahí sale el índice completo de
operaciones: **`docs/CODEOSCOPIC-API-PORTAL.md`**. Es la primera fuente del FABRICANTE que tenemos;
el traspaso de Manuel describe lo que él implementó, no lo que la API ofrece. Y corrige cuatro cosas:

- 🚨 **Hogar SÍ está en la API**, con 11 catálogos propios (`/home/property-types`,
  `build-materials`, `alarm-types`, `door-types`, `occupancy-types`…) y `POST /home/recommend-limits`.
  Lo que no existe es en el repo de Manuel. Y hay **seis ramos**: auto, moto, hogar, vida temporal,
  salud y decesos.
- 🚨 **`GET /insurance-lines` dice, ramo por ramo, si se puede tarificar** (`supports.rating`) y
  emitir, para TU organización. Es un catálogo: **gratis**. Nunca supongas qué ramos hay — pregúntalo.
- 🚨 **La fecha de matriculación sale de la matrícula:** `GET /car/registration-date?plate=` (y su
  gemela de moto). Es **aproximada** y puede venir `null` = «no encontrada», no «no tiene».
- 🚨 **`GET /vehicles?registrationPlate=` resuelve la matrícula al VEHÍCULO** —el código de versión,
  que era el cuello de botella de «matrícula → precio»—, pero es **la única operación de toda la API
  que exige créditos de pago** (`comercial@codeoscopic.com`). Antes de diseñar nada encima, pedir precio.

También: `POST /insurance-drafts` crea un borrador con **todos los campos opcionales salvo el ramo**,
para que lo remate una persona en Avant2 — la vía barata para un lead sin pagar cotización.

🧭 **El reparto, en cuatro palabras de Alberto (01/09/2026): «Avant2 vender, CIMA backoffice.»**
Avant2/Codeoscopic es el canal de **venta** (comparar, tarificar, cerrar nueva producción: nosotros
empujamos un riesgo y nos devuelve precios). CIMA/EIAC es el **backoffice** (cartera viva, recibos,
siniestros, comisiones: las compañías nos mandan lo suyo a diario, y cubre TODA la cartera, no solo
lo que pase por Avant2). Úsalo como regla de decisión: de esta API interesa lo que ayude a vender;
lo que huela a backoffice, no.

🚫 **La API expone pólizas, recibos, siniestros y clientes, pero NO son nuestra fuente** (dictado de
Alberto, 01/09/2026): eso **ya lo tenemos por CIMA y conectado**, que es la conexión DIRECTA con las
compañías. Codeoscopic solo sería el espejo de lo que haya pasado por Avant2 —hoy un proyecto—, de
segunda mano y con dependencia añadida. Si alguna vez sirven, será para **empujar** lo emitido, no
para leer la cartera.

Confirmado además: el host de la API **no lleva `portal.`** (el propio portal muestra el Token URL
`https://api-int.codeoscopic.io/oauth2/token`), y `identification`/`identificationType` están
**deprecados** desde 2024-03-07 en favor de `identificationDocument`.

### 📸 Alta por fotos, ficha técnica y SINCO (investigado 01/09/2026)

**La ficha técnica (tarjeta ITV) SÍ trae la versión del vehículo**, en el **campo `D.2`** (tipo
homologado + código de variante + código de versión); `K`/`K.1`/`K.2` son los de homologación. Es
una corrección a la creencia de partida de que solo traía la marca.

⚠️ Pero `D.2` son códigos de **homologación europea**, NO códigos **Base7** (que es con lo que
tarifica Codeoscopic), y no hay equivalencia publicada. El emparejamiento se cierra filtrando el
catálogo por lo que la propia ficha da exacto:
`D.1` marca → `D.3` denominación comercial → `P.1` cilindrada + `P.2` potencia (kW) + `P.3`
combustible + `B` fecha de matriculación. **Si quedan 2 o más candidatos, NO se elige uno**: se
enseñan y decide una persona (misma regla que `emparejar()` en `catalogos.ts`).

**No hay BD de matrículas gratis que sirva:** los datos abiertos de la DGT publican matriculaciones
**anonimizadas, sin matrícula**; el resto (Ganvam, GT Motive, revendedores) son de pago; EUCARIS es
solo para administraciones. Y aunque la hubiera, daría **texto**, no el código Base7.

**Qué aporta cada foto:** DNI → todos los datos personales que el mapeador se niega a suponer ·
carnet → `fechaCarnet` (la del permiso B, en el reverso por categorías) · ficha técnica → vehículo y
fecha exacta · póliza actual → compañía DGS, número y antigüedad (los bonificadores).

🎯 **SINCO = fichero SIHSA de TIREA.** Historial de siniestralidad de los **últimos CINCO años**,
consultable **en el momento de tarificar** — exactamente la ventana del campo
`lastFiveYearsAccidents` que exige Codeoscopic. Es el bonificador de verdad.

- ⚠️ **Se ofrece a «Entidades Aseguradoras del ramo de Automóvil», y una correduría NO lo es.** NO
  está confirmado que Grupo Asegura pueda consultarlo. Hay que **preguntar a TIREA** si se añade al
  acuerdo que ya existe por CIMA (`accesos.cima@tirea.es`).
- ✅ Lo que sí está claro: **el propio asegurado puede pedir su historial gratis** con DNI y número
  de póliza. Vía inmediata y sin contrato: pedírselo al cliente.
- 🚨 **La compañía lo consulta igual al emitir.** O sea que una precalificación con siniestralidad
  presumida limpia **se corrige sola** si el cliente tuvo partes. Por eso el aviso «puede abaratar
  el precio» no es cosmético: es la diferencia entre orientar y prometer.
- 🔒 Es dato personal: consultarlo exige consentimiento y entra en el registro de tratamientos.
- ⚠️ **No verificado contra `tirea.es`**: el proxy de la sesión bloquea ese dominio por política de
  la organización. Lo anterior sale de fuentes del sector (Mapfre, Allianz, Reale, AMV,
  comparadores) y del glosario de TIREA vía buscador. **Confirmar antes de diseñar encima.**

### 🏠 Siguiente ramo: HOGAR (dictado de Alberto, 01/09/2026)

Segundo más vendido y **más fácil que auto**, por dos motivos concretos: no hay vehículo que
identificar (desaparecen el código Base7, el emparejamiento y los créditos de `/vehicles`), y la API
ya lo sirve con **11 catálogos `/home/*`** que encajan con lo que `bienes_asegurables` ya guarda
(`m2`, `tipoVivienda`, `yearConstruccion`, `rejas`, `puertaBlindada`, `alarmaConectada`).

Primer paso, **gratis y sin preguntar a nadie**: `GET /insurance-lines` devuelve por ramo
`supports.rating` y `supports.policyApplication` para nuestra organización.

Diseño completo: `docs/superpowers/specs/2026-09-01-asegura-alta-por-fotos-y-bonificadores.md`.

### 🔌 Cliente de tarificación en `central` — construido el 01/09/2026

Vive en **`apps/asegura/lib/codeoscopic/`** y es la ÚNICA puerta por la que se gasta dinero en
Codeoscopic. Piezas: `config.ts` (resolución de entorno), `contador.ts` (tope, **puro**),
`consumo.ts` (libro en BD), `cliente.ts` (token + transporte), `respuesta.ts` (parser, **puro**),
`cotizar.ts` (orquestador). 43 tests en verde.

**Lo que hay que saber para no romperlo:**
- **Apagado por defecto.** Sin `CODEOSCOPIC_TARIFICACION_ACTIVA=true` (literal exacto) no sale ni
  una petición facturable. Es «el smoke solo con el OK de Alberto» puesto en código.
- **Sonda GRATIS antes de encender:** `GET /api/operador/codeoscopic/sonda` (Bearer
  `ASEGURA_OPERADOR_SECRET`) pide solo el token OAuth2 —que no se factura— y funciona con el
  interruptor apagado. Distingue «no conecta» (sospecha del HOST) de «conecta y rechaza»
  (sospecha de las CREDENCIALES), que es el diagnóstico que siempre se confunde.
- **El tope vive en BD, no en memoria** (`seguros.codeoscopic_consumo`, SQL en
  `apps/asegura/prisma/sql/2026-09-01_codeoscopic_consumo.sql`). En serverless un contador en
  memoria se reinicia en cada cold start: sería un tope que parece existir y no existe.
- 🚨 **Una cotización EN VUELO cuenta como gastada.** El libro tiene tres estados y solo
  `descartado` —con evidencia— libera cupo. Un **timeout NO es evidencia**: la cotización tarda
  hasta 150 s y el proyecto puede haberse creado igual. Tampoco lo es un 5xx ni un corte de red a
  media petición (solo los fallos ANTERIORES al envío, tipo `ENOTFOUND`/`ECONNREFUSED`, prueban
  que no hubo cargo). Es la regla «dato que NO hay ≠ dato que NO se ha mirado» aplicada al dinero.
- **Si no se puede leer el libro, NO se cotiza** (fail closed). Un tope que no se puede comprobar
  no es un tope.
- Topes por defecto **20/día y 200/mes** (10,00€ y 100,00€), techo duro de 250/1000 contra el dedo
  gordo. Se suben con `CODEOSCOPIC_TOPE_DIARIO` / `CODEOSCOPIC_TOPE_MENSUAL`.

🚨 **Hallazgo del parser, medido sobre el fixture real: de los 18 precios que devolvió aquella
cotización, NINGUNO era firme** — 2 venían con `estimate: true` y 16 con avisos del tipo «Riesgo
condicionado» u «observaciones de la compañía». Por eso cada precio sale del parser con su
**firmeza** (`firme` / `condicionado` / `estimado`) y sus avisos: enseñar «251,77€» a pelo es
prometer al cliente un precio que la compañía no ha cerrado. Y `estimate` ausente **no** se asume
`false`.


## 5. El negocio real de ASegura (estado 01/09/2026)
- Cartera en el Supabase de ASEGURA (leída en vivo por plataforma): **50 pólizas en
  vigor · 995 sin fecha · 27.793 históricas · 2.742 clientes · 29.858 leads · 7
  siniestros**. ⚠️ «Sin fecha» = enriquecimiento pendiente, no «no vencen».
- El CRM lo desarrolló Manuel (favor de hermano, arranque del proyecto) pero **el negocio
  y la web son de Alberto**. El CRM aún no está operativo (nadie lo usa a diario) → el
  traspaso a `apps/asegura` va sin ventana, paso a paso (`docs/TRASPASO-CORREDURIA.md`).
- Ingesta diaria EIAC de las compañías → entra en ese Supabase (cron de Manuel).
- **Inventario de la BD (01/09/2026, `public` del Supabase de ASEGURA).** Núcleo: `clientes`
  32.600 · `polizas` 28.843 · `cliente_telefonos` 4.794 · `cliente_emails` 4.017 ·
  `oportunidades` 3.676 · `bienes_asegurables` 1.614 · `poliza_coberturas` 1.425 ·
  `gestiones` 694 · `poliza_recibos` 184 · `cima_ficheros` 128 · `siniestros` 67 ·
  `liquidaciones` 9. Codeoscopic dejó tablas propias (`codeoscopic_offers`/`prices` 15,
  `projects` 1, `webhook_events` 2; `documents`/`product_forms`/`participants` vacías) →
  la integración llegó a funcionar en pruebas, no en producción.
- 🤖 **Manuel dejó montado el andamiaje de un BOT conversacional, TODO a 0 filas:**
  `whatsapp_kb_chunks`, `whatsapp_outbound_messages`, `channel_inbound_messages`,
  `bot_turn_traces`, `bot_eval_runs`, `bot_eval_scores`. Es exactamente la Fase 3 de este
  agente: cuando llegue, **mirar primero ese esquema** en vez de inventar uno.
- **Frescura (01/09/2026):** `cima_ficheros` último 30/08 → la ingesta CIMA sigue viva.
  `polizas`/`clientes` sin altas desde el **24/08**; `oportunidades` desde jun/2026. No
  confundir «no hay altas» con «la ingesta está rota»: son cosas distintas y hay que mirar
  cuál de las dos es antes de afirmar nada.
- **Vencimientos (01/09/2026, con la regla de vigencia de `@central/module-seguros`): 5 en 30 días,
  7 en 60, 13 en 90**, con **3.899,05€** de prima conocida a 90 días y **4 pólizas sin prima
  informada** (Allianz no la manda por EIAC). ⚠️ Un primer conteo dio «6 y 8» porque contaba por
  `fecha_vencimiento` a secas, sin filtrar el estado: colaba pólizas **canceladas (`situacion='AN'`)**
  con vencimiento futuro. La fecha sola no dice que una póliza esté viva.
- **La cartera VIVA son las 59 pólizas con `situacion='EV'`** (37 auto · 13 hogar · 8 RC · 1 moto;
  Mapfre y Allianz). Las 25.892 `vencida` (2013→2018) y las 830 `en_renovacion` (2023-24) son
  histórico heredado. Ramos DGS observados en la cartera: **241** en auto/moto, **2151** en hogar,
  **282** en RC — el campo semántico fiable es `polizas.tipo`, no `ramo_dgs`.
- **Ventana comercial (LCS art. 22), ya implementada:** a más de un mes del vencimiento el tomador
  puede oponerse a la prórroga y la póliza se puede mover; a menos de un mes se prorroga sí o sí.
  Helper puro `@central/module-seguros/vencimientos` (`urgenciaRenovacion`, `fechaLimiteOposicion`,
  `primaEnRiesgo`), consumido por el puerto `/api/operador/vencimientos` de asegura y pintado en
  plataforma `/correduria`.
- **📡 CIMA es SOLO DESCENDENTE, y el canal pierde datos (medido 01/09/2026).** Dos cosas que hay
  que saber antes de opinar de siniestros o de recibos:
  - **No se puede aperturar un siniestro desde nuestro CRM.** El canal baja ficheros y devuelve un
    ACK; nunca ha salido de aquí un siniestro. `cima_ficheros` **no tiene ni columna de sentido** y
    el cron se llama `cima-pull`. El **estándar EIAC sí es bidireccional** e incluye «solicitar
    nuevas aperturas de siniestro», y la Fase IV de CIMA lo metió en el modelo — pero lo VIVO en
    producción hoy son los **recibos** (Occident, Reale, Allianz y Mapfre con ebroker). De
    siniestros **no consta ninguna compañía**: eso es «no consta», no «no existe». El endpoint para
    subir sería el mismo que ya se usa para bajar (`ws.cimaseg.es/wsEstandar/`) y **la cuenta de
    mediador ya es de Alberto** (CS-F/0170), así que la pregunta a TIREA es barata. ⚠️ **Avant2 NO
    hace siniestros** (es tarificación y emisión); la tramitación de Codeoscopic es otro producto.
    **Consecuencia de diseño:** no se construye un módulo de siniestros. Los 67 siniestros bajan y
    **se congelan** —solo 1 se ha actualizado nunca, y 0 traen tramitador, perito, reserva o
    indemnización—, así que una pantalla de «siniestros abiertos» mentiría. Van dentro de la ficha
    del cliente, como historial y con la fecha de la última noticia a la vista.
  - **Se están perdiendo recibos y siniestros por el emparejamiento con la póliza.** Del 24/06 al
    30/08/2026: 42 ficheros en cuarentena, **23 recibos (7.721,71€ de prima) y 20 siniestros** sin
    guardar, 39 de ellos de **Occident (C0468)**. Causa: se empareja por `id_poliza_entidad` y
    **Occident, Catalana Occidente y Plus Ultra son el MISMO grupo bajo C0468** — 9 de las 19
    pólizas afectadas sí están en la cartera, con otro nombre de compañía y sin código de entidad.
    🚨 **Regla que deja:** al contar cartera o comisiones por compañía, **normaliza el grupo antes
    de agrupar**; el nombre de `polizas.aseguradora` es texto libre y la misma compañía aparece con
    tres nombres. Y el vigía que lo caza es el cron `correduria-ingesta` de plataforma (latido
    `correduria_ingesta`) — el health-check de origen tenía el número delante (`cuarentenaTotal: 41`
    y subiendo) y estuvo en verde dos meses porque sus señales miraban otras dos columnas.
  - **🔑 Y la pieza que faltaba, apuntada por Alberto: la CLAVE DE MEDIADOR.** «Cada compañía asigna
    una clave» — y es el **2º campo del nombre EIAC**: `C0468_8-92361_REC_261_1_20260801_….zip`.
    Medidas **nueve claves en cinco compañías**: Mapfre `5239640` · Allianz `209-A-0018638-0000`,
    `209-C-…`, `209-E-…` (¡y variantes sin ceros, `209-A-18638-0000`!) · Occident **`8-92361`,
    `M00171` y `306333`** · Reale `38605`. 🚨 **Una compañía NO es una cartera**: bajo `8-92361`
    están en cuarentena los 10 ficheros de siniestros y 6 de 9 de recibos, mientras `306333` va
    limpia. Agrupar por `codigo_entidad` esconde de QUÉ cartera se pierde el dato y manda a revisar
    la que va bien. (`8-92361` es además el código que aparece en los conceptos del banco, ver
    `RE_LIQUID_SEGUROS` en plataforma; `M00171` también.)
  - **🗂️ EL CORREO DE ALBERTO ES LA TERCERA BASE DE DATOS (01/09/2026, idea suya).** Las compañías
    le escriben a `alberto.suarez.gutierrez@gmail.com` y ahí hay cosas que NO están ni en el CRM ni
    en CIMA. Emisores útiles, medidos:
    · **`mediadores@occidentinforma.com`** — un correo por cada movimiento de póliza de Occident, con
      **número de póliza, nombre del cliente y contrato (`M00171`)** en el asunto: emisión,
      modificación, rechazo de suplemento, aviso de regularización, recordatorio de firma de mandato.
      Es un registro de altas paralelo al EIAC.
    · **`mediador@allianz.es`** — «Cartera No Vida del mes de …», «Cuenta Agente», «Relación anulación
      pólizas por impago» con **fichero adjunto**. Cartera y saldo por correo.
    · **`carlos.salas@occident.com`** (Director Corredores Sevilla-Huelva) — visitas comerciales con
      producción y objetivos; `concepcion.porras@occident.com`, operativa de prestaciones/vida.
    · **`accesos.cima@tirea.es`** — credenciales de CIMA. `conectividad@reale.es` — adhesión a EIAC.
      `cstsoportecorredores@mapfre.com` — soporte, exige la clave en cada petición.
    · **`digitaliza@comunicacionesoccident.com`** — documentación de siniestros.
    🚨 **Regla:** antes de decir que un dato «no está», mira también el correo. Y al revés: el correo
    NO es la fuente de la cartera (no es estructurado ni completo) — es la fuente de lo que la
    compañía **dijo**, con fecha, que es justo lo que falta cuando el canal EIAC no lo trajo.
  - **📇 MAPA DE CLAVES DE MEDIADOR (correo + ficheros EIAC, 01/09/2026).** DGSFP: **CS-F/0170**.
    DNI 28823484E.

    | Compañía | Cód. entidad | Clave(s) que llegan por EIAC | Lo que dice el correo |
    |---|---|---|---|
    | Mapfre | C0058 | `5239640` | clave de mediador 5239640 (usada en todas sus peticiones) |
    | Allianz | C0109 | `209-A-0018638-0000`, `209-C-…`, `209-E-…` (y `209-A-18638-0000` sin ceros) | **Código 18638 / Clave PA342520**, sucursal **209**. Es UNA clave con prefijo de sucursal y una letra que varía |
    | Occident | C0468 | `8-92361`, `M00171`, `306333` | contrato **`M00171`** en todos sus avisos; usuario `M823484E` |
    | Reale | C0613 | `38605` | «código de mediador 38605» (adhesión a EIAC pedida el 13/04/2026) |
    | Fidelidade | — | (aún ninguna) | credenciales de CIMA entregadas el **31/08/2026** |

    ⚠️ **Occident/Catalana/Plus Ultra: Alberto avisa de que la absorción le dejó varias claves y que
    Catalana le tenía DOS «que no saben por qué».** Cuadra con las tres que se ven en los ficheros.
    **NO se da por cerrado el mapa**: `306333` y `8-92361` no aparecen aún en ningún correo leído, así
    que su origen (¿Plus Ultra? ¿Catalana?) es **desconocido**, no «Occident a secas».
  - **Y hay DOS averías, no una.** De las 20 pólizas huérfanas, **3 YA están en la cartera**,
    activas y con el mismo `id_poliza_entidad`: su recibo o siniestro llegó **antes** que la póliza
    (una esperó del 24/06 al 26/07) y nadie volvió a mirarlas — se arreglan **reprocesando**, sin
    preguntar a nadie, y es justo lo que hacía el reconciliador parado desde el 25/06. Las otras 17
    son **cartera que la compañía nunca mandó**: los procesos ordinarios de EIAC no envían nunca
    la cartera preexistente de una clave — hace falta una **CARGA MASIVA** (ver el apartado
    siguiente, con los códigos del estándar). Contarlas juntas manda a pedir a la compañía algo que
    ya está en la BD.
    ✅ **Y una de las diez está IDENTIFICADA por el correo, sin intranet: la 549147797** es una **RC
    profesional del «Instituto Técnico Superior de Informática Studium», emitida el 27/06/2025** bajo
    el contrato `M00171` (correo de `mediadores@occidentinforma.com`, con recordatorio de firma del
    mandato de cobro). O sea: **NO está anulada** — es una póliza real, viva, **de un año ANTES de
    que arrancara la ingesta**. Eso confirma el diagnóstico y descarta la hipótesis de las anuladas.
    📌 **Y el camino para arreglarlo ya lo ha andado Alberto:** el 11/04/2026 pidió a Reale una
    carga de cartera en formato EIAC para la clave 38605. Lo mismo hay que pedirle a **Occident
    para `8-92361` y `M00171`** (y confirmar `306333`) — pero **pidiéndolo por su nombre del
    estándar**, ver abajo: «carga inicial» no existe en EIAC y por eso las compañías contestan que
    no se hace.

- **📖 LOS PROCESOS DE EIAC, LEÍDOS DE LA NORMA (01/09/2026).** Fuente: **TIREA, «Documentos
  Estándar V07.1», código `209_IAC_ESP_DOC`, versión 05, 03/06/2026** + los XSD
  `ProcesosEIAC-V07-1_V05` / `TiposEIAC-V07-1_V05` (los aportó Alberto; antes de esto lo que había
  aquí era una inferencia a partir de los nombres de fichero).

  El **4º campo del nombre** del fichero EIAC es el **código de proceso**, y es lo que dice si
  viene un movimiento del día o la cartera entera:

  | Cód. | Objeto | Denominación | Clase | Transacción |
  |---|---|---|---|---|
  | 131 | Póliza | Información de Pólizas de Nueva Producción | NP | OR |
  | 132 | Póliza | Información de Pólizas de Cartera | CA | OR |
  | 133 | Póliza | Información de Suplementos de Póliza | SU | OR |
  | 134 | Póliza | Precartera de pólizas colectivas | PC | OR |
  | 151 | Póliza | Información de Anulaciones de Póliza | AN | OR |
  | **199** | Póliza | **Carga Masiva de Pólizas, Suplementos y Anulaciones** | NP, CA, SU, AN | **CM** |
  | 211-214 · 251 · 261 | Recibo | Emisión (NP/CA/SU), precartera, extornos, movimientos | — | OR |
  | **269 / 299** | Recibo | **Carga Masiva de Movimientos de Recibo / de Recibos** | — | **CM** |
  | 311 · 361 | Siniestro | Declaración de nuevos siniestros · Movimientos y pagos | — | OR |
  | **399** | Siniestro | **Carga masiva de siniestros** | CA | **CM** |
  | 502 | Cuenta efectivo | Emisión de cuenta de efectivo | CE | OR |

  `claves_transaccion`: **OR** = Ordinaria · **CM** = Carga Masiva · RE = Rechazo · **SO** = Solicitud.

  🚨 **«Cartera» (132) NO es «toda mi cartera».** Es, literal, *«pólizas que han renovado o van a
  renovar durante un periodo»*. Una póliza cuya renovación no cae en ninguna ventana desde que
  arrancó la ingesta **no llega jamás** por los procesos ordinarios. Lo único que manda el histórico
  completo es la **carga masiva**, y hay una por objeto: **199 pólizas · 299 recibos · 269
  movimientos de recibo · 399 siniestros**.

  🚨 **Y no hay ningún proceso EIAC para PEDIR una carga masiva.** El único Mediador→Entidad con
  transacción SO es el **841, Solicitud alta nuevos siniestros**. Así que el 199/299/399 se pide
  **fuera del canal**, a la compañía. Por eso «no hay botón» y por eso una petición mal nombrada se
  contesta con un «eso no se hace»: **el término correcto es «carga masiva», proceso 199/299/399**,
  no «carga inicial» ni «primera carga», que no existen en la norma.

  La cabecera del proceso lleva `Transaccion`, `Periodo` (DI/SE/ME/BI/TR/CU/SM/AN/SP) y
  `FechaDesde`/`FechaHasta`, así que **una carga masiva se puede acotar por fechas** — argumento
  útil si la compañía objeta el volumen.

- **📊 QUÉ CARGA MASIVA HA LLEGADO DE VERDAD (medido 01/09/2026 sobre `cima_ficheros`).**

  | Compañía | POL 199 | REC 299 | SIN 399 | Pólizas suyas en cartera |
  |---|---|---|---|---:|
  | Mapfre `C0058` | ✅ 6 ficheros (132 pólizas, abr/2026) | ✅ 6 ficheros | ❌ | 64 |
  | Allianz `C0109` | ✅ 1 fichero (26 pólizas, 11/04/2026) | ❌ | ❌ | 26 |
  | Occident `C0468` | ❌ | ❌ | ❌ | 19 |
  | Reale `C0613` | ❌ | ❌ | ❌ | 1 |

  Allianz **cuadra al registro**: 26 pólizas en su 199 → 26 en cartera. Esa es la prueba de que el
  199 es lo que trae la cartera y de que funciona. Occident solo manda ordinarias (131/132/151,
  212/261, 311/361) y por eso de él solo hay lo movido desde abril.
  📌 **El 399 no lo ha mandado NADIE** — de ahí que los 67 siniestros bajen y se congelen. No es
  que las compañías no actualicen: es que la actualización histórica va por un proceso que nadie
  tiene activado.
  📌 **Petición que corresponde a cada una:** Occident → 199 + 299 + 399 · Reale → 199 + 299 ·
  Allianz → 299 + 399 · Mapfre → 399.

  ✅ **Y esto corrige el apartado de arriba sobre siniestros:** el proceso **841 «Solicitud alta
  nuevos siniestros» (Mediador → Entidad, transacción SO) EXISTE en el estándar** — o sea, declarar
  un siniestro desde nuestro CRM **sí está previsto**. Lo que no consta es que ninguna compañía lo
  tenga activado para Alberto, que es una afirmación distinta y mucho más barata de resolver:
  se pregunta.

- **🔑 EL OBJETO ASEGURADO: dónde vive y qué se puede leer (01/09/2026).** «Auto · Mapfre ·
  431,85€» no identifica una póliza: el mismo tomador puede tener tres coches. El dato del bien
  vive en **`polizas.datos_especificos`** (JSON libre que escribe la ingesta EIAC, distinto por
  ramo) y, para lo que no tiene bien, en **`poliza_coberturas.descripcion`**. Medido sobre la
  cartera entera:
  - **auto/moto** → `matricula` (4.506 filas, **EN CLARO**), `marca`/`modelo` (~1.420 cada uno),
    `version`, `anio`, `combustible`, `tipoVehiculo`. ⚠️ **La clave `vehiculo` (2.781 filas) NO es
    una descripción: contiene la MATRÍCULA.** Pintarla como modelo es inventarse el dato.
  - **hogar** → `localidad` (181) y `cp` (330) en claro, `metrosCuadrados`, `anioConstruccion`,
    `continente`/`contenido`. La **`direccion` (172) viene CIFRADA** (`v1:iv:cipher:tag`,
    AES-256-GCM, clave `PII_ENCRYPTION_KEY` que hoy vive en el Vercel de Manuel). Sin esa env se
    dice **«cifrado»**, que NO es «sin dato»: el dato existe y aparecerá solo el día que la clave
    llegue con el traspaso (`descifrarDireccion` en `apps/asegura/lib/cartera.ts` ya lo intenta).
  - **RC (81) y comercio (110)** → `datos_especificos` NO trae nada útil; lo que identifica una RC
    son sus **modalidades** (`poliza_coberturas`: «Básica», «Locativa», «Accidentes de trabajo»).
    Solo 9 de las 81 RC tienen coberturas cargadas. Comercio sí trae `actividad` (28).
  - **vida / salud / decesos / accidentes** → no hay bien: son seguros de PERSONAS. Ausencia
    **definitiva**, no «pendiente» — prometer una pasada futura que traiga el dato sería mentir.
  - `_estado_legacy_pre_loo695` es ruido de una migración del CRM, no un dato.
  Helper puro **`@central/module-seguros/objeto`** (`objetoAsegurado`) con **cuatro** salidas
  (`conocido` · `no_informado` · `cifrado` · `sin_objeto`); lo consumen el puerto
  `/api/operador/vencimientos` de asegura, la columna **«Qué asegura»** de plataforma `/correduria`
  y el aviso de renovaciones por Telegram. **Al informar a Alberto de una renovación, di SIEMPRE
  qué asegura** — sin eso el aviso no sirve para llamar. Y sigue vigente la regla de PII: en
  informes y chats, agregados; la matrícula solo si Alberto pregunta por un caso concreto.

## 6. Novedades 2026 y argumentario de renovación (investigado 01/09/2026)
> ⚠️ Verificado contra fuentes secundarias del sector (INESE, UNESPA, ICEA, DGSFP): el proxy de la
> sesión bloquea `boe.es` y `dgsfp.mineco.gob.es`, así que **antes de citarle una norma a un cliente
> o a una compañía, hay que leer el texto oficial**. Lo marcado «no confirmado» NO se afirma.

- **⚡ Oportunidad comercial directa: seguro obligatorio de RC para VMP/patinetes** (RD 52/2026, BOE
  30/01/2026) + registro en la DGT con etiqueta. Encaja con una cartera de auto/hogar y es venta
  cruzada sobre clientes que ya están. ⚠️ Las fuentes discrepan en la fecha efectiva (02/01 por la
  Ley 5/2025 vs 30/01 por el RD): comprobar antes de usarlo en una campaña.
- **Ley 10/2025 de servicios de atención a la clientela** — adaptación hasta el **28/12/2026**.
  Atención gratuita, 95% de llamadas en <3 min y **derecho a hablar con una persona: el servicio no
  puede basarse solo en bots**. 🚨 **Esto condiciona la Fase 3 de este agente**: un bot que atienda
  clientes necesita escape a persona por diseño, no como añadido. ⚠️ No confirmado si el ámbito
  subjetivo alcanza a una correduría pequeña — leer el artículo de ámbito antes de dar nada por hecho.
- **Baremo de autos**: reforma con efectos 01/01/2026 (Ley 5/2025, amplía «hecho de la circulación»)
  y actualización **+2,9%** para 2026. Sube la siniestralidad de autos y RC.
- **Prioridades de supervisión DGSFP 2026-2028**, por primera vez con apartado propio de mediación:
  diseño de producto, **relación coste/valor**, calidad del asesoramiento. Endurece el enfoque de conducta.
- **Revisión de la IDD (paquete RIS)**: aplicación estimada ~julio 2029. Estructural para el modelo de
  correduría (prohibiría retener comisiones a quien asesore de forma independiente). Radar, no acción.

**Argumentario de renovación (con datos, no impresiones):**
- La subida no la decide la compañía, la decide el coste del siniestro: **recambio +9%**, coste de
  reparación **+3,3%** (contra IPC 2,2%), baremo **+2,9%**. Traducir la subida a causa verificable.
- **Cartera vs nueva producción, canal corredor 2T 2026** (Asegurómetro): auto cartera 470€ (+4,7%)
  frente a nueva producción 441€ (**−2,2%**). Existe precio de captación → **re-tarificar en otra
  compañía antes que perder al cliente**. Hogar: mercado ~319€ (+6%), canal corredor 329€ (+3,9%).
- **Hogar: el argumento no es el precio, es el INFRASEGURO.** Con la inflación de construcción, un
  capital desactualizado activa la regla proporcional en el siniestro.
- **🔑 La palanca legal más útil (LCS art. 22.3 + criterio DGSFP): una subida de prima es una
  MODIFICACIÓN del contrato, no una prórroga**, así que el asegurador debe comunicarla con **2 meses**
  de antelación. Sin ese preaviso no puede imponerla: el contrato se prorroga en los términos
  anteriores. Implementado en `comunicacionEnPlazo` — y devuelve `null` cuando no consta la fecha de
  comunicación, porque afirmar que una subida es inoponible sin tenerla mandaría al cliente a discutir
  con la compañía con un argumento falso.
- **STS 141/2020**: si el ASEGURADOR se opuso a la prórroga por el art. 22, NO aplica el mes de gracia
  del art. 15.2 — no hay cobertura adicional tras el vencimiento.
- ⚠️ Titular de prensa de 24/02/2026 («prohíben subir la póliza del coche sin avisar con dos meses»):
  **no es una ley nueva**, es el art. 22.3 de siempre. No citarlo como cambio normativo.

**No confirmado (pendiente de fuente primaria):** la tabla de códigos de ramo EIAC la custodia TIREA y
no está publicada, así que **241 / 2151 / 282 no están verificados** — y muchas compañías usan códigos
propios además del estándar. Por eso el campo semántico que se usa es `polizas.tipo`, no `ramo_dgs`.

## 7. El activo dormido
- Los **29.858 leads** son el activo comercial dormido: nadie los trabaja hoy. RGPD manda:
  verificar base de legitimación antes de cualquier campaña (fase 3, con OK de Alberto).

## 8. Qué hay DE VERDAD detrás de una ficha de cliente (medido 01/09/2026)

Inventario hecho para rediseñar la ficha (diseño completo en
`docs/superpowers/specs/2026-09-01-asegura-ficha-cliente-design.md`; maqueta en
https://claude.ai/code/artifact/22b57a16-739c-4e45-bd9d-9e494275aeda). Todo restringido a la
**cartera VIVA** (`polizas.import_ref IS NULL`) = **109 pólizas / 80 clientes**.

🚨 **La regla de esta sección: una pantalla que se abre a cero no dice «no hay», dice «pendiente».**
Casi todas estas tablas están vacías porque nadie las ha usado todavía, no porque el cliente no
tenga nada.

**Con contenido real (se puede construir encima ya):**
- `poliza_recibos` — 182 en **89 de las 109** pólizas (20 sin ninguno; media 2,04; máx 10).
  `situacion`: cobrado 103 · anulado 54 · pendiente 24 · devuelto 1 → **21 pólizas con algún
  pendiente**. `prima_total`/`prima_neta`/`comision_bruta`/`fecha_vencimiento` al 100%;
  `comision_liquida` solo 15,9%. **`clase_recibo` `SU` en 62 de 182: son los suplementos** — no hay
  tabla de movimientos de póliza, así que el historial de una póliza SON sus recibos.
- `poliza_coberturas` — 1.418 filas y **las 109 pólizas tienen las suyas** (media 13, máx 59).
  `descripcion` 100%, `capital_asegurado` 73,2%, **`franquicia` 0%**. Es el dato más rico de la
  cartera y hoy no se ve en ninguna pantalla.
- `siniestros` — 67, **todos de cartera viva** (30 clientes, 37 pólizas), 60 cerrados / 7 abiertos,
  `origen`=`cima` al 100%. `tipo`/`fecha_hora`/`referencia` 100%, `comentario` 95,5%. **Al 0%:
  `gravedad`, `reserva_importe`, `indemnizacion_importe`, tramitador y perito.**
- **Comisión POR PÓLIZA: sí se puede**, vía `poliza_recibos.comision_bruta` (100%) + su `poliza_id`.
  La vía contable no vale para una ficha: `liquidacion_movimientos` (33 filas) solo tiene
  `poliza_id` en 11 y `recibo_id` en 8; `cuenta_efectivo` es agregado por periodo/entidad **sin FK
  a póliza ni cliente**.
- `poliza_intervinientes` — 95 en 81 pólizas. **Van dentro de la póliza, no en las relaciones.**

**Vacío hoy (decir «pendiente», nunca «no hay»):** `historial_interno` **0** y `clientes.notas`
0/80 (⚠️ **no hay dónde apuntar una llamada**) · conversaciones/mensajes de WhatsApp 0 de cartera
viva y `wa_opt_in` false en los 80 · `recordatorios`, `whatsapp_outbound_messages`,
`channel_inbound_messages`, `ofertas_automaticas` vacías.

**Trampas medidas, que se repiten y hay que conocer:**
- **`cliente_relaciones` 1.710 ≠ 1.710 relaciones.** **902 son roles de póliza**: Ocasional–Tomador
  491, Propietario–Tomador 208, Tomador–Contacto 203. Lo humano es cónyuge 168, padre/madre 111,
  hijo/a 111, empresa 108, amigo/a 91, hermano/a 58… Y **de cartera viva solo hay 65, en 17 de los
  80 clientes**.
- **`oportunidades` 3.676 NO son presupuestos de Alberto**: los 3.676 están en estado
  `competencia`, sin excepción, y **ninguno cuelga de un cliente vivo** — son pólizas de la
  competencia del volcado histórico. Los presupuestos reales son las **24 `cotizaciones`**… y ahí
  **`mejor_oferta`, la prima y la compañía están al 0%**: se sabe qué se pidió y cuándo, no por
  cuánto. Estados: `pendiente` 22 · `rechazada` 2.
- **`gestiones` 694 son casi todas de leads**: de cartera viva hay **23, en 22 clientes** (22
  llamadas, 1 tarea), ninguna ligada a siniestro y ninguna con `fecha_aviso`.
- **Contacto: la columna plana gana a la tabla multivalor.** `clientes.telefono` 55/80 y
  `clientes.email` 40/80, contra `cliente_telefonos` 16 y `cliente_emails` 15 — y **0 clientes con
  más de uno**. `cliente_direcciones` **no existe** (`clientes.direccion` 62/80).
- **26 pólizas de auto vivas no traen prima** (`prima_anual` 76,1%). Nunca pintarlas como 0,00€ ni
  sumarlas como cero.
- **El objeto asegurado está en dos sitios y sin FK a la póliza.** La matrícula sí está en
  `polizas.datos_especificos` (81/81 de auto+moto), pero **la dirección del hogar solo en 2 de 19**;
  `bienes_asegurables` (51 de cartera viva) **no tiene `poliza_id`**, solo `cliente_id`.
- Reparto de la cartera viva: auto 80 · hogar 19 · RC 9 · moto 1, con **solo 3 aseguradoras**.

### 📎 Documentos: hacen falta en TRES sitios y solo uno tiene tabla
Alberto lo pidió explícitamente (01/09/2026): *«hay que subir documentos tanto del cliente como de
la póliza, inclusive siniestro»*.

| Nivel | Tabla | Estado |
|---|---|---|
| Cliente (DNI, carnet, IBAN) | — | 🔴 **`cliente_documentos` NO EXISTE**. Y `poliza_documentos.poliza_id` es `NOT NULL`: un DNI habría que colgarlo de una póliza, y a un **lead sin póliza** no se le puede adjuntar nada |
| Póliza | `poliza_documentos` | ✅ existe y bien: blob, MIME, tamaño, quién lo subió y **`visible_por_cliente`** (interruptor del portal). **0 filas** |
| Siniestro | — | 🔴 **`siniestro_documentos` NO EXISTE**. Es donde más papel hay (parte, fotos, factura, peritaje) y con tramitador/reserva al 0%, **las fotos serían lo único** |
| Objeto | `bien_documentos` | ✅ la mejor pensada: tipo cerrado `ficha_tecnica`/`permiso_circulacion`/`titulo_propiedad`/`planos`/`foto`/`seguro_anterior`/`factura_compra`/`otro`. **El permiso es del coche, no de la póliza** — pero `bienes_asegurables` sin `poliza_id` hace que no se vea desde ella |

**Cero ficheros en TODO el sistema:** las cuatro tablas a 0, `polizas.documento_url` al 0% y
`storage.objects` vacío. No hay ni una póliza en PDF. Lo único parecido son los 128 XML de
`cima_ficheros` (24 de póliza viva), que valen como «ver el origen», no como documentación.

Y el estado que falta en todas: **«pedido pero no recibido»**. Sin él, «0 documentos» no distingue
no habérselo pedido de que el cliente no lo mande — la regla de la casa, aplicada al archivo.
