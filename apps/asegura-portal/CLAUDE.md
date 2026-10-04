# CLAUDE.md — apps/asegura-portal (portal del CLIENTE de Grupo ASegura)

> 📦 **Índice + reglas (recortado el 03/10/2026 para gastar menos tokens).** La versión íntegra, con cada
> incidente, medición, cifra y porqué, está en `docs/claude-md/ASEGURA-PORTAL-completo-2026-10-03.md`. **No la leas
> entera: búscala con Grep** por la palabra del tema («vínculo», «autorización», «hoja», «campana», «parte»,
> «supresión», «invitación», «push», «landmines»…). Producto: `docs/superpowers/specs/2026-09-01-asegura-portal-clientes-empresas-design.md`
> y `docs/superpowers/plans/2026-09-01-asegura-portal-fase-1.md`.

## Qué es
- **Esta app la ve el ASEGURADO** (cliente o no), no Alberto. El panel del corredor es `apps/asegura`; la pantalla de Alberto es `plataforma` → `/correduria`. Portal abierto a cualquiera: «aporta tus seguros».
- ✍️ Se escribe **«Grupo ASegura»** (A y S mayúsculas); canónico en `seguros.corredurias.nombre`. Guardián `test/regression-nombre-comercial-asegura.test.ts`.
- Tipografía de marca: Quicksand (titulares) + Nunito Sans (cuerpo), sin cursivas; el logo/monograma sale de `public/brand/*.svg` (`lib/monograma.ts`).
- Despliegue separado de `apps/asegura` a propósito (superficie de ataque): rol, cookie y secreto propios. Una sesión del portal no vale jamás en la app interna.

| | `apps/asegura` | `apps/asegura-portal` |
|---|---|---|
| Rol BD | `prisma_seguros` (BYPASSRLS) | `prisma_asegura_portal` (**SIN BYPASSRLS**) |
| Cookie | `asegura_session` | `asegura_portal_session` |
| Secreto | `ASEGURA_SESSION_SECRET` | `ASEGURA_PORTAL_SESSION_SECRET` |

## Aislamiento entre clientes (lo da el CÓDIGO, no RLS) — lo más importante
- 🚨 Sin RLS que rescate un olvido: una consulta sin `where` devuelve las pólizas de todos y nada falla.
- La identidad SIEMPRE sale de la cookie por `lib/session.ts` (`getIdentidad()`/`requireIdentidad()`); nunca del cuerpo ni de un query param; sin fallback a literal.
- Toda consulta `prisma.portal*` filtra por `identidadId`; toda lectura de cartera parte de `portal_vinculo` (`lib/cartera-lectura.ts`, `carteraDeIdentidad`). Ningún `clienteId` entra desde la request.
- Guardián `test/regression-portal-aislamiento.test.ts` (lista EXENTOS: añadir algo es una decisión; no extraer prisma a ficheros sueltos sin sesión). Lista incluye ficheros sin commitear.
- `/boveda/poliza/[id]`: el id de la URL NO consulta; se lee todo lo autorizado y se busca el id DENTRO de esa lista; 404 nunca 403. `/boveda/anadida/[id]`: identidad dentro del `where`.
- `schema.prisma` de cartera = espejo del SQL de GRANTs por columnas: primero `GRANT`, luego schema (si no, 42501 en toda la lectura del modelo). El rol NO lee `clientes.dni`, `iban`, `lugar_direccion`, `puede_ver_polizas`, `telefono_fuente`.
- Toda tabla `portal_*` nueva: `REVOKE ALL … FROM crm_seguros` en su SQL (`test/regression-portal-sin-crm.test.ts`); su DDL se aplica en el MISMO paso que el despliegue que la usa.
- Leer no escribe: `registrarUso` lo llama quien pinta, no `carteraDeIdentidad`.

## Identidad, sesión y código de un solo uso
- Sin contraseñas: código de 6 dígitos (`generarCodigo`, `randomInt`) por un canal; cookie httpOnly/secure/lax 30 días; el canje crea la identidad (`app/api/acceso/verificar/route.ts`). `estadoCodigo()` orden: `ya_usado` → `bloqueado` → `caducado` → acierto; `VALIDEZ_MINUTOS=10`, `MAX_INTENTOS=5`; el intento se reserva con `updateMany` condicionado ANTES de comparar.
- `portal_codigo.codigo` guarda el HASH (`hashCodigo()` de `lib/auth.ts`), comparación en tiempo constante. `hashCanal()` normaliza (trim+minúsculas): cambiarlo o su pimienta desvincula a todos.
- El canal es un PUERTO (`lib/canal.ts`, `canal-email.ts`, `canal-consola.ts`; consola devuelve `false` en producción). 🚨 **`canal_no_disponible` (503, canal no registrado) ≠ `envio_fallido` (502, envío no salió)**; `obtenerCanal()` devuelve `null`, `enviarCodigo()` devuelve `false`, ninguno lanza.
- `POST /api/acceso/solicitar` (pública): orden de guardas = canal (503) → tope IP 6/h (429, en memoria, no es el límite real) → `destino_invalido` (400, `src/destino.ts` valida PERO NO normaliza) → tope por DESTINO 5/h (429, cuenta filas en BD). La fila se escribe para cualquier destino (no ser oráculo de «¿es cliente?»). `/api/acceso/verificar`: 30/15 min por IP.
- La raíz `/` (`app/page.tsx`, servidor) mira `getIdentidad()` y redirige a `/boveda`; el formulario vive en `app/Entrada.tsx`. El enlace del correo (`?d=&c=`, `lib/enlace-acceso.ts`) pre-rellena y NO canjea; sin `PORTAL_PUBLIC_URL` https no hay enlace, el correo sale con el código.
- Cambio de correo en «Mis datos»/«Añadir correo»: exige `codigoCorreo` a ese correo (`lib/correo-cambio.ts`, `lib/verificar-correo.ts`); se comprueba antes y se gasta solo si el guardado sale bien.

## Vínculo con la cartera (Fase 4)
- Costura: `seguros.portal_vinculo`; sin fila no se lee NADA. `lib/vinculo.ts` `vincularIdentidad` (solo en el canje, único momento con email en claro): índice ciego `computeEmailLookupHash` en `clientes` y `cliente_emails`, sin fusionadas; UNA ficha → `gestionar`/`email_hash`; varias → `ambiguo` (no vincula); ninguna → `sin_ficha`; sin `PII_LOOKUP_KEY` → `sin_clave`. Móvil = hogar → no vincula. No bloquea el login. `es_principal` NO participa en el desempate.
- Un vínculo por correo NO sobrevive a que el correo cambie de ficha (`retirarVinculosCaducados`, trigger en BD); `manual`/`corredor` nunca se retiran.
- Sello `portal_identidad.ultimo_vinculo(_en)` (siempre, también en `ok`; `null` = no consta ≠ `sin_ficha`): la bóveda no puede recalcular. `ambiguo` NUNCA se dice «no hemos encontrado ninguna póliza»; `sin_clave`/`error` = «problema nuestro».
- El DUEÑO ve su empresa sin vínculo escrito (`empresasDeFichas()`, `lib/representacion.ts`; solo «Dueño», empresa `juridica` explícita).
- Pólizas VIVAS = `WHERE_CARTERA_VIVA`/`esCarteraViva()` de `@central/module-seguros` (`import_ref IS NULL` O `eiac_xml_hash IS NOT NULL`) y sin fusionar; el volcado histórico no se enseña ni genera avisos. `confirmadaCima` NO sirve para decidir «viva».
- Niveles `tarjeta`→`completo`→`gestionar`→`administrar` (`camposVisibles(nivel)`, `src/acceso.ts`): dato de la COSA ≠ dato de la PERSONA; fuera de nivel → `null` y la UI dice «no visible en tu nivel»; valor fuera de `NIVELES` → `tarjeta`. Tres estados: sin vínculo ≠ sin pólizas vivas ≠ campo oculto.

## Visibilidad: qué se oculta y qué se dice en voz alta
- Se OCULTA si la ausencia no cambia nada para el cliente; se DICE si cambia lo que haría. `null` = no sabemos ≠ 0: sin vencimiento no es «vigente»; `recibos.total===0` no es «al corriente»; `coberturas.total===0` no es «sin coberturas»; prima `null` → `—`, jamás `0,00€` (`lib/dinero.ts`, `Number()` antes de formatear).
- Siniestros: ven TODO el detalle (reserva, culpa, tramitador/perito…, `siniestro-detalle.ts`, 28/09), PERO nunca a un tercero de persona física (`NUNCA_A_UN_TERCERO`); de los terceros del siniestro el cliente ve SOLO papel, nombre, matrícula y compañía del contrario, nunca documento, teléfono, email ni domicilio (decisión de Alberto 04/10/2026; filtro por lista blanca `packages/module-seguros-portal/src/personas-cliente.ts`); fuera siempre: persona de asistencia, `contacto_*_cima`, `ref_mediador_cima`, `tipo` (código numérico). `siniestrosAbiertos` `null` = no visible en tu nivel (la pantalla calla). `comentario` se pinta entero, sin recortar ni «limpiar».
- Recibos: `anulado` no entra en listas ni cubos; 3 estados `sin_informar` / `solo_anulados` / `con_recibos` (`estadoRecibos()` sobre lista CRUDA); `pendiente` ≠ impago (no rojo); fechas centinela anuladas (`fechaReciboFiable`). Siniestros: ordenar en código, `[]` = «no nos consta».
- `describirBien()` (`src/bien-asegurado.ts`): `cosa` (marca/modelo/matrícula) desde `tarjeta`; `ubicacion` (dirección) desde `completo` y NUNCA a un tercero de persona física (`direccionRiesgo` en `NUNCA_A_UN_TERCERO`); claves `_*` no se leen; `null` → se calla.
- 🚨 El nº de póliza NUNCA identifica una póliza para el cliente: motor → `bien.cosa`, inmueble → `bien.ubicacion`, nº solo de último recurso (filas, selectores, parte).

## Autorizaciones a terceros
- `seguros.portal_autorizacion` (+ `_uso`); reglas puras `src/autorizacion.ts` (lee su cabecera). Nace pendiente, **doble aceptación** (el autorizado acepta), no caduca (25/09): revisión anual (`pideRevision`, `DIAS_REVISION`), no contestar no corta nada. Sustituye al booleano `cliente_relaciones.puede_ver_polizas` (REVOCADO al rol).
- **Dos permisos**: `ver_economico` = «Solo ver»; `total` = «Acceso total» (único que salta `NUNCA_A_UN_TERCERO`: DNI, IBAN, documentos, actuar; incluye `puedeDarParte`). El total NO se da por invitación ni petición (`ampliarATotal`, nace pendiente, en sociedad pide título). Nadie reautoriza a un cuarto. Textos de consentimiento: `textoDeConcesion()` de `lib/autorizaciones.ts`, versiones antiguas no se reescriben. `origen` `portal`/`corredor` distinguible (CHECK).
- Destinatario: FICHA o IDENTIDAD, exactamente una (CHECK `num_nonnulls`); `poliza_id` NULL = todas (incluye FUTURAS; la pantalla lo dice); FK compuesta `(otorgante_cliente_id, poliza_id)`; póliza fusionada se sigue (`merged_into_poliza_id`); los alcances se suman póliza a póliza. En la lectura, `caduca === null` = no caduca (no `continue`).
- Peticiones (`peticion-acceso.ts`, `lib/peticiones.ts`): `respuestaPublica()` colapsa 4 resultados en `registrada` (texto, TIEMPO y cuerpo iguales; solo se distinguen `a_si_mismo` 400 y `limite_diario` 429); destinatario por índice ciego; INSERT siempre y el índice único decide (P2002 = `ya_pendiente`); caduca 30 días; retirar ≠ rechazar; sin permiso 404 nunca 403; al conceder, aceptada con la fecha de la petición. Una identidad no se autoriza a sí misma (lo cierra el código).
- Invitaciones (`invitacion.ts`, `lib/invitaciones.ts`, `lib/correo-invitacion.ts`, `app/invitacion/[token]/`): el token NO abre sesión (lo dice QUÉ invitación; el código al correo dice QUIÉN); aceptación atada al canal hash, token hasheado; `sin_enlace` 503 NO escribe fila, `envio_fallido` 502 SÍ; el correo nunca lleva compañía/póliza/matrícula/importe ni la `relacion` (`CAMPOS_PROHIBIDOS_EN_INVITACION`); la lista no puede decir a quién invitó; alcance solo `ver`/`ver_economico` o `ninguno` (=«solo te presento»; sin argumento comercial, art. 21 LSSI). `core-email` se importa dinámico.
- «Contactos» = ruta `/autorizaciones` (la ruta no cambia). Estudio legal: `docs/ASEGURA-AUTORIZACION-TERCEROS.md`.

## Parte de siniestro y teléfonos de compañía
- `ParteSiniestro.tsx` → `POST /api/siniestros` → `lib/partes-siniestro.ts` → `portal_parte_siniestro` (el rol solo INSERTA y LEE). 🚨 Un parte enviado NO es siniestro comunicado: `comunicadoACompania(estado)` es la ÚNICA fuente (nunca `estado !== 'enviado'`); estados `enviado`→`recibido`→`abierto_en_compania`→`descartado`; CHECK `portal_parte_abierto_con_sello`.
- `hay_heridos`/`hay_terceros` tri-estado (`normalizarTriestado`); con heridos aviso `tel:112` + Telegram inmediato (`aviso-parte-nuevo.ts`); plazo art. 16 LCS por `plazoComunicacion()` (delega en `module-seguros`); `fueraDePlazo` ≠ pérdida de cobertura. Dar parte de póliza AJENA exige `puedeDarParte()` / `polizasParaParte()` (si no, solo teléfonos).
- Canal de la compañía ARRIBA y sin elegir póliza (`canal-compania.ts`, `canalesConCompaniaPrimero`): cruce por nombre EXACTO; ordenar ≠ recortar; `sinDatos` no se filtran; `null` = «pídenoslo»; sin «24 h»; sin `tel:` sobre WhatsApp; asistencia no hereda horario. Fuente única de teléfonos = `packages/module-seguros/src/telefonos-companias.ts` vía `lib/canales-compania.ts` (columnas `telefono_*` de `companias_dgs` OBSOLETAS; cambiar un número = PR al catálogo con fuente y fecha; `test/regression-telefonos-fuente-unica.test.ts`). `ParteSiniestro.tsx` sigue siendo UN fichero por sus cepos.

## Hoja de la nevera y QR (`/hoja/[token]`)
- El QR lleva un ENLACE, no datos; la página pública lee EN VIVO (`polizasDeLaHoja`) y vuelve a filtrar por la cartera actual del dueño; cero filas de selección = TODAS (incluye futuras; la pantalla lo dice; `crearHoja` rechaza `sin_seleccion`, nunca inserta ids del formulario); anular NO borra (`anulada_en`, sin DELETE); token HASHEADO; solo pólizas PROPIAS (`lib/hojas.ts`, `lib/enlace-hoja.ts`, `src/hoja-qr.ts`). Sin prima/recibos/siniestros/DNI/dirección.
- En el papel NO va ningún dato: allow-list `.hoja > *` a `display:none` salvo `.hoja-masthead`; `@media print` re-declara tokens (`:root:root`) y oculta `.marca-barra` y `PieLegal` con `body:has(> .hoja)`.

## Calendario, recordatorios y avisos
- `portal_obligacion` (`lib/obligaciones.ts`, `sincronizarObligacionesDeIdentidad`): fecha accionable = vencimiento − 30 días (art. 22 LCS, en días); `polizaGeneraObligacion()` usa `esCarteraViva()` (el `''` es volcado); poda solo las de cartera y sin vínculo no toca nada; el chip dice el hecho («todavía no te hemos avisado»). El portal NO manda correo (no tiene el email en claro): el envío vive en `apps/asegura`.
- Push: `GET /api/cron/avisos-push` (sello propio `avisadaPushAt`, tabla `portal_push_suscripcion`, `src/push.ts`), `GET /api/cron/avisos-cima` (`src/avisos-cima.ts`, `portal_aviso_cima`, `portal_aviso_silenciado`; semilla silenciosa + ventana 45 días; texto sin importes/matrícula/tipo de siniestro; clave del paso = código EIAC; `poliza_modificada` por `portal_poliza_cambio`). Sin claves VAPID → 503 `sin_vapid`. `app/ActivarPush.tsx`.
- Campana (`lib/avisos.ts`, `app/api/avisos/route.ts` con `allSettled`, `Campana.tsx`): globo `n` · `n+` · `!`, nunca «0» sobre fuente no leída; no acepta ni revoca (solo enlaces); cuarta fuente `datos_por_revisar` (`reparosDeMisDatos`, id = tipo de reparo). `.marca-acciones` lleva el único `margin-left:auto` (instalar → avisos → tema → salir).
- «Pendiente de ti» (`PendienteDeTi.tsx`, `lib/pendiente-de-ti.ts`): fuente ilegible → `sinComprobar`, nunca «nada pendiente». `/datos/[token]` pública (`app/api/datos/route.ts` 10/h IP, `/api/datos/documento` 20/h, `lib/solicitud-datos.ts`).

## Mis datos, dirección y sugerencias
- Contacto propio por PUENTE a `apps/asegura` (`lib/mis-datos.ts`, `GET/POST /api/portal/contacto`; el portal NO tiene `PII_ENCRYPTION_KEY` ni descifra); sin cola de aprobación (art. 16 RGPD); la dirección de contacto ≠ la de la PÓLIZA (la pantalla lo dice); solo viajan campos escritos; varias fichas vinculadas → no escribe (`decidirFichaPropia`); mismas reglas `revisarEdicion`; un canal se cambia, nunca se borra; `en_otra_ficha` 409. `AvisoContacto.tsx`/`estadoConfirmacion()` en servidor. Reglas: `src/contacto-propio.ts`.
- Sugerencias (`POST /api/sugerencia`, `app/SugerenciaBarra.tsx`): Telegram ES el registro (solo `enviada` da las gracias; `sin_canal` ≠ `error`); texto escapado con `escaparHtml`; tope por IP en memoria (no copiar a rutas públicas).
- Subir póliza (`POST /api/polizas`, 10 MB, `lib/extraer-poliza.ts`): siempre `declarado`, `confirmada_por_usuario=false`; `fuente:'none'` = «no hemos podido leerla»; `aiComplete` necesita una key de IA (comprobar la env antes de culpar al PDF); `src/poliza-leida.ts` anula valores de cajón; procedencia `compania>documento>calculado>declarado` (`debeSustituir`). `pdf-parse` en `serverExternalPackages`.

## Supresión (derecho al olvido) y legal
- `portal_supresion` (`src/supresion.ts`, `lib/supresion.ts`, `app/api/supresion/route.ts`, `TusDatos.tsx`): NO borra; recibir, acusar y contestar en un mes; listas `loQueSeSuprime()`/`loQueSeConserva()` calculadas y mostradas ANTES de pulsar; reloj arranca al pulsar; prorrogar exige motivo; una pendiente bloquea otra por índice único parcial; retirar ≠ denegar; rol sin DELETE; cola ordenada por reloj vía `/api/operador/supresiones`.
- Legal (`app/legal/*`, `PieLegal` en `app/layout.tsx` raíz, sin sesión): datos del mediador de `@central/module-seguros` (`src/mediador.ts`, sin teclear `CS-F/0170`); `VERSION_TEXTOS_LEGALES` sube con cada cambio de política (se sella en `portal_consentimiento.version_texto`); cada frase de privacidad es una afirmación sobre el código; UN solo correo `MEDIADOR.identidad.email`; sin lista de ramos ni DPO declarados; sin banner de cookies (una sola cookie técnica). `portal_consentimiento` APPEND-ONLY (`avisos`/`comercial`/`lds_art19`).

## Vista de corredor y PWA
- `GET /corredor/[token]` (1 uso, 10 min, `portal_vista_corredor`): identidad dedicada `IDENTIDAD_CORREDOR_ID` sin canales + vínculo temporal `origen='corredor'` (asegura lo EXCLUYE de «ya entra»); claim `corredor` 4 h; `middleware.ts` veta `POST/PATCH/DELETE` de `/api/*` con 403 `modo_corredor` salvo `/api/salir` y `/api/acceso/*`; importa `lib/auth-cookie.ts` (edge), no `lib/auth.ts`. El `middleware` NO resuelve sesión.
- PWA (`app/manifest.ts`, `app/icono-app/route.tsx` 512 px, `public/sw.js`, `RegistrarSW.tsx`, `InstalarBoton.tsx`): el SW NO CACHEA NADA (datos personales; `lib/pwa.test.ts`); iOS no dispara `beforeinstallprompt` → instrucciones con glifo; colores del manifiesto en hex.

## Arquitectura (resumen)
- Next 15 App Router, React 19, Prisma 5 multiSchema; lógica PURA en `packages/module-seguros-portal/src/*` (`acceso`, `procedencia`, `codigo`, `poliza-leida`, `destino`, …). Compone `@central/module-seguros`, `-seguros-pii` (`computeEmailLookupHash`), `core-ai`, `core-email`, `core-identity`, `core-catastro`.
- Vercel: Root `apps/asegura-portal`, región `fra1`, `ignoreCommand` obligatorio con `--sin-previews`; cambiar una env solo llega con el siguiente commit que toque la app. CI: está en la matriz `Typecheck · asegura-portal`.

## Envs (solo NOMBRES; ningún valor al repo)
- `DATABASE_URL` = URL ENTERA del rol `prisma_asegura_portal` (no solo la contraseña; percent-encodear `/ @ : + # ?`); rotar contraseña y env en el mismo paso.
- `ASEGURA_PORTAL_SESSION_SECRET` (sin fallback, `requireSecret`), `ASEGURA_PORTAL_CANAL_PEPPER`, `PII_LOOKUP_KEY` (IDÉNTICA a `central-asegura`; irreversible, nunca regenerar), `PORTAL_MAIL_FROM`, `PORTAL_MAIL_REPLY_TO`, `PORTAL_PUBLIC_URL` (https), `ASEGURA_PUENTE_URL`, `ASEGURA_PORTAL_PUENTE_SECRET` (mismo valor en `central-asegura`; NO es `ASEGURA_OPERADOR_SECRET`), `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, `OPENROUTER_API_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`, `CRON_SECRET`, proveedor de correo (`RESEND_API_KEY` o `SMTP_*` o `GMAIL_*`; no existen `PORTAL_SMTP_*`).

## Reglas de la casa aplicables
- Dinero `2.162,49€` con `eur()`; responsive ≥320 px (44 px táctiles, medir sobre el scroller real); `router.refresh()` sin desmontar listas; secretos con `requireSecret()` (`test/regression-secrets.test.ts`); dato que NO hay ≠ dato que NO se ha mirado (tres estados); agrupar personas por identidad, no por nombre; un teléfono/dato impreso o enviado a un tercero solo con autorización de Alberto.
- Un móvil identifica un HOGAR, no una persona (nunca resuelve solo a una ficha); el papel PROPONE el acceso, no lo concede.
- Recordatorios propios (`Recordatorios.tsx`, `lib/recordatorios.ts`): fecha sin recortar; `avanzarRecordatoriosRecurrentesDeIdentidad` mira `avisadaAt` O `avisadaPushAt`; filtran por `identidadId`; pestaña «Recordatorios» ≠ campana «Avisos».
- Los 3 ENUM de Postgres van como `enum` en `schema.prisma` (no `String`); el cliente Prisma generado es COMPARTIDO por el monorepo (regenerar desde esta app antes de diagnosticar un typecheck rojo). Un cepo no está terminado hasta verlo fallar; los guardianes que buscan texto quitan comentarios antes de mirar. Guardianes: `test/regression-portal-*.test.ts` (todos).
