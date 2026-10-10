# CLAUDE.md — apps/asegura (Grupo ASegura, correduría de seguros)

> 📦 **Índice + reglas (recortado el 30/09/2026 para gastar menos tokens).** La versión íntegra, con cada
> incidente, medición, cifra y porqué, está en `docs/claude-md/ASEGURA-completo-2026-09-30.md`. **No la leas
> entera: búscala con Grep** por la palabra del tema («webhook», «ReRate», «fusión», «backfill», «avisos»…).
> Visión y orden de trabajo del CRM: `docs/CORREDURIA-CRM-VISION.md` (skill `correduria-crm`). Ingesta de CIMA:
> skill `cima-ingesta`.

## Qué es esta app
- ✍️ Se escribe **«Grupo ASegura»** (A y S mayúsculas). Canónico en `seguros.corredurias.nombre`.
- 🖥️ **NO es una pantalla: es la TRASTIENDA.** Alberto trabaja en `plataforma` → `/correduria`. Aquí viven la BD
  de la cartera (schema `seguros` de la Supabase compartida), el puerto `/api/operador/*` (Bearer
  `ASEGURA_OPERADOR_SECRET`) y lo único que gasta dinero (Codeoscopic). **Una pantalla nueva se monta en
  plataforma y su dato se sirve por un endpoint de `/api/operador/*`.** Lo único propio de aquí: retarificar y
  subir una póliza para que la lea el agente; `/cartera` es respaldo y no crece.
- El CRM de Manuel (repo `asegura`, Vercel `asegura`, `app.grupoasegura.com`) queda SOLO como motor de ingesta
  de CIMA, escribiendo en `seguros` con el rol `crm_seguros`. Su web no se usa ni se migra su login.

## Arquitectura
- **BD:** `DATABASE_URL` (rol `prisma_seguros`, BYPASSRLS) + `?schema=seguros` forzado por `lib/asegura-url.ts`
  (`urlFuenteCartera`). `ASEGURA_FUENTE=origen` vuelve al Supabase congelado de Manuel. Prisma `multiSchema`.
  Pool: `connection_limit=3` (ni 1 ni 5: medido).
- **Auth:** cookie `asegura_session` + `jose` contra `public.cuentas`; `ASEGURA_SESSION_SECRET` sin fallback.
- **🛡️ Toda consulta a `seguros` pasa por `lib/tenant.ts`** (`lib/tenant-ambito.ts`: `pendiente` · `sin-asignar` ·
  `ok`; `exigirCorreduriaId()` lanza). Con BYPASSRLS un fallo no es «no se ve nada» sino «se ve todo»: el
  aislamiento es del CÓDIGO. Guardián `test/regression-asegura-aislamiento.test.ts` (y en SQL crudo no escribas
  `seguros.x` en texto de mensajes: el cepo lo marca).
- **Errores de lectura:** nunca pelados. `registrarErrorCartera()` de `lib/error-cartera.ts` (clasificador ÚNICO:
  `credenciales` · `permisos` · `conexion` · `esquema` · `sin_correduria` · `otro`, borra la URL del mensaje).
- **Escrituras del puerto:** toda ruta POST/PATCH/PUT/DELETE va envuelta en `auditado()` (`lib/auditoria.ts`,
  cepo `lib/auditoria.test.ts`); el qué, con `anotarCambio()` (solo campos de `CAMPOS_CON_VALOR`, `lib/cambios.ts`).
  Toda escritura de cartera deja fila en `historial_interno`.
- **Dinero:** `lib/dinero.ts` → `eur()` (`2.162,49€`; `null` → `—`, nunca `0,00€`).
- **IA de texto:** `iaTexto()` de `lib/ia.ts` (pasarela de plataforma, tope 5 €/mes). No llames a `aiComplete`.

## La cartera: qué es «cliente» (reglas de `@central/module-seguros`)
- **Viva** (origen CIMA) = `esCarteraViva()` = `import_ref IS NULL` O `eiac_xml_hash IS NOT NULL`.
  **Cliente HOY** = `esCarteraEnVigor()` (viva Y estado vigente). Nunca `clientes.tipo`, nunca `confirmadaCima`.
  El volcado histórico (28.728 pólizas, vencimientos 2013-2018) son LEADS y no generan avisos.
- **Prima y vencimiento: la póliza MIENTE por compañía.** Prima → `primaConRecibos()`, vencimiento →
  `vencimientoConRecibos()` (`vencimientos.ts`), nunca `primaReferencia()` sola. Allianz solo da prima y
  renovación en el recibo; Mapfre deja pólizas en EV sin fecha nueva («Renovación sin confirmar»); CIMA puede
  decir EV de una anulada (la verdad es el portal de la compañía). Guardián `test/regression-prima-con-recibos.test.ts`.
- **Contacto de un cliente = CUATRO sitios:** su ficha, su propio dato colgado de la póliza
  (`poliza_intervinientes` con su `cliente_id`), otra persona de su póliza, y `cliente_relaciones`. Tener a quién
  llamar ≠ poder notificar (el preaviso del art. 22 LCS va al TOMADOR). `contactoEfectivo()` decide.
- **El TOMADOR no está en `poliza_intervinientes`**: toda lista de «quién hay en la póliza» lo añade.
- **Personas por identidad:** NIF → ficha → nombre; el NIF no cruza el puerto (etiqueta opaca `p1`, `p2`…).
- **Relaciones:** fila A→B = «B es <tipo> de A»; `puede_ver_polizas` = A autoriza a B (direccional). `Sin vínculo`
  no autoriza nada (guarda en tres sitios).
- **Búsqueda:** DNI/teléfono/email solo por ÍNDICE CIEGO y exactos (email también por mitades `dom:`/`usr:`);
  un «no aparece» suele ser «esa ficha no tiene hash», y se dice con la cobertura (`explicarVacio()`). La calle
  se busca descifrando en memoria. Backfills por tandas: `/api/operador/backfill-dni` y `backfill-contacto`
  (el DNI centinela compartido por ≥3 nombres NO se escribe).
- **Duplicados:** se fusionan por SQL con lote y guarda de identidad escritos (`prisma/sql/*fusion*`), nunca por
  botón. Hereda los `*_lookup_hash` ANTES de anularlos en la lápida. `cliente_merge_log` es append-only.
- **Retención de recibos:** el reloj del art. 15 LCS solo arranca si la compañía AFIRMA el impago
  (`retencion(vencimiento, situacion, hoy)`): `pendiente` es 🟠 `sin_confirmar`, nunca «sin cobertura».
- **Nunca cruzan el puerto:** DNI entero, IBAN, dirección del tomador. Sí teléfono/email (para llamar).

## 🔑 Envs y credenciales (lo que ya ha tumbado producción)
- **Rotar la contraseña de un rol = actualizar su `DATABASE_URL`/`DIRECT_URL` en Vercel EN EL MISMO PASO** (si no,
  la app muere en silencio; el texto solo sale en los logs del pooler). El pooler cachea credenciales unos minutos.
- **`PII_ENCRYPTION_KEY` y `PII_LOOKUP_KEY` idénticas a las del proyecto Vercel `asegura`.** Nunca «Rotate Variable»
  (la cartera cifrada quedaría ilegible). Una variable nueva no aplica hasta el **Redeploy**, y un redeploy del
  panel reutiliza el último commit: si ese commit no toca `apps/asegura/`, el `ignoreCommand` lo salta.
  `lib/pii-estado.ts` dice por qué no descifra (`ok` · `sin_clave` · `mal_formada` · `no_abre` · `sin_muestra`).
- **`RESEND_API_KEY` restringida al MISMO dominio del remitente** (`envios.grupoasegura.es`). El transporte es SMTP.
- `CRON_SECRET` solo por `Authorization: Bearer`; sin él no se autoriza a nadie, tampoco en desarrollo.
- `ASEGURA_PORTAL_PUENTE_SECRET` (puerto estrecho del portal, `/api/portal/*`): mismo valor en `asegura-portal`;
  esas rutas nunca aceptan `clienteId` (la ficha la resuelve `portal_vinculo`).

## 💶 Codeoscopic (Avant2): tarificar y emitir
- **Cada `POST /insurances` cuesta 0,50€ y NO es idempotente: UN solo intento** (solo se re-pide el token tras un
  401). Arranca APAGADO (`CODEOSCOPIC_TARIFICACION_ACTIVA`). Contador persistente `seguros.codeoscopic_consumo`:
  sin libro no se cotiza; una cotización sin desenlace CUENTA como gastada. ReRate y Submit pasan por su propio
  embudo (`libro-emision.ts`, motivos y topes separados; su coste va en env y **0 = «sin confirmar», no gratis**).
  Codeoscopic (correo 02/10/2026, hilo «Duda»): se factura por cada `POST /insurances` con HTTP 200 (aunque sea el
  mismo riesgo; 4xx/5xx no cuentan), solo en producción; septiembre = 28 facturables. ReRate y Submit no aparecen
  como facturables: resuelto por inferencia; confirmación explícita no pedida.
  Ningún botón público ni vigilancia periódica tarifica.
- **Se guarda TODO lo del vendor:** `tarificaciones.respuesta` (escritura aparte que no lanza; no sale por el
  puerto), `fallos` (NULL = anterior al 29/09 ≠ `[]`) y por precio `id_precio`, forma/frecuencia de pago y meses.
- **Emitir EXACTAMENTE lo pulsado:** `encontrarPrecio()` casa por el `id` del vendor (`idPrecio`); si ya no está,
  por compañía + categoría + modalidad; si no hay una exacta, **409, nunca otra en su lugar**.
- **Coherencia al recibir:** `revisarCoherenciaCotizacion()` → parrilla, panel de emisión y nota en la ficha
  (`cotizacion_incoherente` → Telegram). **Re-proceso gratis:** `GET /api/operador/codeoscopic/reproceso`.
  Nada de IA decidiendo precios o coberturas en vivo.
- **Coberturas:** catálogo de `module-seguros` (`clasificarCoberturas`, por FILA, con categoría/modalidad); un
  todo riesgo de coche/moto incluye daños propios; `garantias` NULL = «aún sin leer» (se reintenta 7 días). El
  vocabulario del vendor es cerrado: un nombre nuevo sale en `coberturasNuevas` y se decide a mano.
- **Firmeza:** todo precio se pinta con su firmeza (`firmezaDe`); lo normal es `estimado`. Un precio que la
  compañía dejará BLOQUEADO (`bloqueoCompania()`) se avisa antes de emitir.
- **Petición:** `revisarDatos*()` valida GRATIS antes de pagar. Persona idéntica en holder/owner/driver; email como
  `emails[]`; calle troceada; la fecha de efecto CADUCA (si ya pasó, el proyecto está muerto: `fechaEfectoCaducada`).
  Presupuesto rápido (se SUPONE y se marca) vs. emisión (se verifica); nunca se supone un dato personal.
- **400 del vendor:** se TRADUCE (`interprete-400.ts`) y se repara por PATCH gratis con relectura; lo que no está
  sale como `faltan_vendor`. Un mensaje no reconocido se enseña entero.
- **Submit:** Allianz exige `product.options` con sus 4 consentimientos (`conProductoPorDefecto`, a `false`). Tras un
  5xx o corte, `reintento_sin_confirmar`: no se reenvía a ciegas; `policyApplications[]` dice si ya existe, y una
  aprobada se ACUÑA sin Submit. El PDF de la póliza se archiva desde `issuedDocuments[]` (descarga con el Bearer y
  `x-client-app`/`x-user-email`).
- La API REST solo cubre auto, moto, hogar, salud, decesos y vida. **RC, comercios y comunidades: no hay endpoint**
  (se llama a la compañía).
- **Descubrimiento autónomo de emisiones:** plataforma corre cron `correduria-descubrir-emisiones` (`10,40 5-21 * * *` UTC) que consulta GET /insurances (gratis), acuña por hash de DNI, y pone pendientes en cola `seguros.codeoscopic_emisiones_revision`. Rotación en anillo: tope 40 llamadas/pasada, latido rojo tras 3 pasadas seguidas con pendientes por tope. **Acuñar solo por `registrarPolizaEmitida` (compuerta atómica `ya_acunada`)**, nunca por otro camino.
- **Webhook nuevo en `https://api.grupoasegura.es/api/webhooks/codeoscopic`** (Vercel central-asegura, CNAME IONOS): guarda, no acuña. Contacto: `soporteapi@codeoscopic.com` / Juan Manuel. PENDIENTE: Codeoscopic cambie URL (confía en certificado 30/09/2026; reintentan ~30 min hasta 200/204).

## ✉️ Correos y crons (todos con cerrojos)
- Tres cerrojos: `CRON_SECRET` Bearer, **modo cuenta por defecto** (`ASEGURA_AVISOS_ACTIVOS=1` para enviar;
  `?contar=1` fuerza ensayo) y filtro de cartera viva re-aplicado en la consulta. Sin proveedor de correo → 503,
  nunca `enviados: 0`. `avisada_at`/sellos se escriben justo tras el envío.
- `avisos-vencimiento` (08:00 UTC) · `avisos-intranet` (08:15, deriva de la campana del portal, sello
  `portal_aviso_enviado`, el correo nunca dice el TÍTULO del aviso) · `avisos-web` (08:30, APAGADO) ·
  `felicitaciones` (APAGADO) · `polizas-pdf` (horario).
- Un aviso a un tercero (persona de referencia) nunca se manda como si fuera al tomador (`textoAviso`, `paraTercero`).
- **Bloqueos de compañía (30/09/2026):** solo es bloqueante si la compañía YA lo anuncia (Allianz, moto de Manuel
  Piña Franco); si no avisa, se emite sin recomendar la básica (no hay aviso preventivo). Un bloqueo anunciado lo
  levanta SOLO Alberto; Allianz contesta únicamente por su intranet y sin otra póliza suya no admite robo ni daños.
  Textos en `@central/module-seguros` (`bloqueo-compania.ts`); recordatorio diario por el cron `correduria-retenidas`.
  Ver regla 22 de la skill `correduria-crm`.
- Correo de emisión tras acuñar (`trasEmision`): resumen sin nº de póliza, matrícula, IBAN ni DNI; póliza adjunta.
- Anulación firmada por el cliente sale sola SOLO con buzón de bajas recordado (`anulacionSeEnviaSola`); el resto
  de correos a compañías pasan por la cola de aprobaciones (`seguros.aprobacion`).
- Invitación al portal y aviso de acceso: predicen con `elegirFicha` (la misma regla que el portal), el enlace NO
  lleva token, y `sin_correo_configurado` (reintentar no arregla) ≠ `error_envio`.

## Oportunidad/riesgo/correduría
- **Datos del riesgo por ramo (PR #4127):** módulo puro `@central/module-seguros/datos-riesgo-{generico,ramo,vivienda,capital,libre}.ts` con claves `datosVehiculo|datosVivienda|datosCapital|datosRiesgoLibre` en `info_riesgo`. PATCH `/api/operador/oportunidad/riesgo` edita una clave (400 si no es del ramo); precarga desde `polizas.datos_especificos` (nunca confirmada). Helper `leerRiesgo()` con validación pura `calcularEdicionRiesgo()`.

## Tarificador RPA (bots Playwright)
Guía viva (arquitectura, DOM de ePAC, seguridad, interruptores, plan): **`docs/TARIFICADOR-RPA.md`**. TARIFICAR ≠ EMITIR; guardián `test/regression-tarificador-rpa.test.ts`.

## Cuando dudes
Busca el tema en `docs/claude-md/ASEGURA-completo-2026-09-30.md` antes de suponer: casi todo lo de aquí ya se midió
una vez y está escrito con su cifra y su porqué.
