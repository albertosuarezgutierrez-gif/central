# Spec — «Mi empresa» (empresa.grupoasegura.es) + circuito del contrato de encargo (07/11/2026)

Estado: BORRADOR para Alberto. Sin código. Base: `docs/HERRAMIENTAS-DOS-VENTANAS.md` (manda en todo lo que toque
seguros), propuesta de arquitectura y diseño UX del 07/11. [Seguro] = leído en código · [Decisión] = de Alberto el 07/11 ·
[Propuesta] = mía, revisable.

## 1. Objetivos
1. UNA entrada para DUEÑOS y ADMINISTRACIÓN de cualquier empresa cliente o captada: OTP por correo → selector de empresa →
   solo las herramientas ACTIVAS de esa empresa (contabilidad, rrhh, nóminas, taller, portal del proveedor…). [Decisión]
2. Ninguna herramienta trata datos reales de una empresa sin el CONTRATO DE ENCARGO (art. 28 RGPD) firmado por ella. [Decisión]
3. El clic del operador en plataforma es el OK de Alberto para ESE envío del contrato (regla de comunicaciones salientes). [Decisión]
4. No se crea ninguna fuente de verdad duplicada: «Mi empresa» sabe QUÉ está contratado y firmado; cada app sigue sabiendo
   CÓMO funciona y QUIÉN entra en ella.
- Fuera de alcance: empleados (siguen en `/e` de `apps/rrhh`; «Mis seguros» será una segunda ventana aparte, dos-ventanas §6),
  cualquier lectura de `seguros`, datos de negocio en la portada (contadores = F3).

## 2. Piezas nuevas
- **`packages/core-herramientas`** (TS puro, sin Prisma): catálogo CERRADO de herramientas (id, nombre, app destino,
  `ref_externa` que exige, categorías de datos y de interesados para el anexo del contrato), máquina de estados
  (`transicionHerramienta`, `transicionContrato`), `herramientasVisibles(cuenta, miembro)`, `variablesContrato()` (falla si
  falta un dato: nunca rellena con «N/A» ni vacío), `firmarTraspaso/verificarTraspaso` (HS256 fijo, `aud`, `iss`, `typ`, `jti`, 60 s).
- **`apps/empresa`** (Next, `empresa.grupoasegura.es`): OTP, selector, portada, contrato y firma, puerto de operador. No lee
  ningún schema de negocio.
- **Schema `herramientas`** + rol `prisma_herramientas` (LOGIN, NOBYPASSRLS, sin GRANT en ningún otro schema).

## 3. Modelo de datos (schema `herramientas`)
| Tabla | Columnas clave | Notas |
|---|---|---|
| `cuenta` | id, cif (UNIQUE, formato validado), razon_social, domicilio_* (CP→provincia→municipio→calle Catastro→nº), marca_logo_ruta, marca_acento, creada_por, activo | La empresa. CIF de sociedad en claro (no es dato personal). Autónomo: `doc_tipo` + 4 últimos, nunca el NIF en claro (dos-ventanas §1) → F1 solo sociedades. |
| `persona` | id, email (UNIQUE, minúsculas), nombre, email_verificado_en | Solo autentica. Nunca se funde por nombre. |
| `cuenta_miembro` | cuenta_id, persona_id, rol `dueno\|admin`, titulo_representacion `administrador\|apoderado\|null`, estado `activo\|revocado`, alta_por, fechas | PK (cuenta_id, persona_id). Solo un `dueno` activo por cuenta (índice parcial). F1: lo da de alta el operador. |
| `cuenta_herramienta` | cuenta_id, herramienta (CHECK = catálogo), ref_externa uuid, estado `pendiente_firma\|activa\|suspendida\|retirada`, contrato_version_id (la que la cubre), activada_por/en, propagacion `no_aplica\|pendiente\|hecha\|fallida` | **Sin fila = apagada (opt-in).** `ref_externa` = id de la empresa EN la app (contabilidad.empresas.id, rrhh.empresas.id, taller.talleres.id). |
| `plantilla` | id, codigo `encargo_tratamiento`, version, texto_md, sha256, publicada_en | **Inmutable.** Se carga desde `docs/contratos/encargo-tratamiento-vN.md` por migración. |
| `contrato` | id, cuenta_id (UNIQUE), numero legible | UN contrato marco por empresa. |
| `contrato_version` | id, contrato_id, n (1,2,…), plantilla_id, herramientas text[] (anexo COMPLETO vigente), variables jsonb, pdf_ruta, pdf_sha256, estado `enviado\|firmado\|anulado\|caducado\|sustituido`, emitida_por, emitida_en, caduca_en | Contenido inmutable desde que se emite; solo cambia `estado` por función con lista blanca de transiciones. |
| `firma` | id, contrato_version_id (UNIQUE), persona_id, nombre_confirmado, titulo_representacion, metodo `otp_email`, ip, user_agent, firmado_en, evidencia jsonb (`Evidencia` de core-firma), certificado_ruta, certificado_sha256 | **Append-only.** Una firma por versión. |
| `envio` | id, contrato_version_id, tipo `contrato\|recordatorio`, destinatario, confirmado_por (operador), proveedor_id, estado `aceptado\|fallido`, error, creado_en | UNIQUE (contrato_version_id, tipo, intento). Prueba del OK. |
| `evento` | id, cuenta_id, actor, accion, detalle jsonb (sin datos personales salvo el email del actor), creado_en | Auditoría append-only. |
| `acceso_otp`, `traspaso_emitido` | como contabilidad | `traspaso_emitido` solo guarda jti/aud/persona/exp (sin token). |

- **Contrato con anexo versionado [Propuesta, la recomendada]:** activar herramientas nuevas = nueva `contrato_version`
  n+1 cuyo anexo es la lista COMPLETA (lo vigente + lo nuevo). Al firmarla, la anterior pasa a `sustituido`; lo que ya estaba
  `activa` sigue activo mientras la n+1 está pendiente (lo cubre la versión anterior). Retirar una herramienta no exige firma
  (se registra el `evento` y el fin del encargo de esa herramienta; devolución/supresión según la cláusula de la plantilla).
- **Inmutabilidad (en BD, no solo en código):** `REVOKE UPDATE, DELETE` sobre `plantilla`, `firma`, `envio`, `evento`; trigger
  que rechaza cualquier UPDATE de `contrato_version` que no sea `estado` (y solo transiciones válidas); PDFs en bucket privado
  `herramientas-contratos/<cuenta>/<version>-<sha256>.pdf` con `upsert:false`; descarga por URL firmada de 5 min que recalcula
  el hash (`verificarIntegridad`) antes de servir.
- **RLS:** cada petición del panel fija `app.persona_id` en la transacción (patrón `conEmpresa()` de contabilidad); políticas:
  se ve una `cuenta` solo si hay `cuenta_miembro` activo de esa persona. El puerto de operador usa funciones SECURITY DEFINER
  (patrón de los vínculos del taller) tras `requireSecret('HERRAMIENTAS_OPERADOR_SECRET')`.
- **Cepo de aislamiento:** consulta a `information_schema.role_table_grants`: `prisma_herramientas` sin nada en
  `contabilidad|rrhh|taller|seguros|public`; y test de que la portada de la persona A no devuelve la cuenta de B.

## 4. Sincronización con lo existente (sin duplicar)
| Pregunta | Fuente de verdad | Qué hace «Mi empresa» |
|---|---|---|
| ¿Está contratada y con encargo firmado? | `herramientas.cuenta_herramienta` | Es la dueña. |
| ¿Existe la empresa en la app? | La app (`contabilidad.empresas`, `rrhh.empresas`, `taller.talleres`) | Solo guarda `ref_externa`. Activar exige que el operador ya hizo el alta en la app por su flujo actual. |
| Submódulos (nóminas modo reparto/cálculo, contabilidad_nominas, portal del proveedor) | `rrhh.empresa_modulos` y equivalentes [Seguro: gobierna el cron de nóminas] | No los copia. `nominas` es herramienta del catálogo (otro anexo: salarios, SS) mapeada a `rrhh.empresa_modulos.nominas`; al firmarse, llama al puerto de operador de rrhh (`PUT /api/operador/empresas/modulos`, idempotente) y anota `propagacion`. Sin respuesta = `fallida`, nunca «hecha». |
| ¿Quién entra y qué puede hacer dentro? | `usuario_empresas` de cada app | El traspaso no autoriza nada: la app vuelve a comprobar su tabla. |
| Vínculos taller↔rrhh↔contabilidad | `talleres.*_empresa_id`, `empresa_modulos.contabilidad_empresa_id` | No se tocan. |
| Marca | `cuenta.marca_*` (presentación del panel) | `rrhh.empresas.color_primario` sigue siendo la de rrhh; unificar = F4. Colores con la skill `marca-cliente`. |
- Deriva: registro «activa» pero la app no reconoce a la persona → la app deniega y el panel dice «No tienes acceso en esta
  herramienta; pídeselo al titular». Nunca se arregla creando el usuario desde el panel.

## 5. Identidad
1. Entrada: correo + código de 6 cifras (`@central/core-identity/codigo-otp`, mismo flujo y límites que contabilidad).
   Cookie host-only `__Host-empresa_session` (HMAC, 12 h, `sv` revalidado en BD). **Nunca cookie en `.grupoasegura.es`.**
2. Salto a una herramienta (solo `dueno|admin`, solo herramienta `activa`): token de un solo uso firmado con un secreto
   POR APP DESTINO (`HERRAMIENTAS_TRASPASO_SECRET_CONTABILIDAD|_RRHH|_TALLER`, `requireSecret`, jamás `JWT_SECRET` de rrhh),
   entregado por POST autoenviado a `<app>/api/auth/traspaso`. La app verifica alg/aud/iss/typ/exp, consume el `jti` en SU
   tabla `traspasos_usados` (PK; repetido = 401), busca a la persona por email en SU tabla y exige SU `usuario_empresas` para
   `ref_externa`; entonces emite su cookie normal. Nunca para sesiones de empleado (`typ:'empleado'`).
3. Taller (F2): `usuarios_taller` no tiene email → `persona_email_verificado` que fija el operador, solo `dueno|admin`.
4. «Salir» del panel no cierra las sesiones de las apps: se dice en pantalla.

## 6. Circuito del contrato (paso a paso)
| # | Quién / dónde | Qué pasa | Estado |
|---|---|---|---|
| 1 | Operador, plataforma `/operador/empresas/[cuenta]` | Marca una o varias herramientas (solo las que ya tienen `ref_externa`). | — |
| 2 | plataforma → `POST empresa./api/operador/cuentas/:id/activar` (dry-run) | Devuelve: anexo resultante, variables que faltan, destinatario (el `dueno` activo). Si falta algo → lista «Falta: domicilio social, título del firmante» y NO se puede seguir. | — |
| 3 | Operador | Modal: «Se enviará el contrato de encargo (anexo v{n}: Contabilidad, RRHH) a **pilar@…** desde hola@grupoasegura.es». Botón «Enviar contrato». Ese clic = OK de Alberto para ESE envío. | — |
| 4 | `POST …/activar` con `confirmo_destinatario` | El servidor exige que `confirmo_destinatario` == email del dueño actual (si cambió entre 2 y 4 → 409, se vuelve a mostrar). En UNA transacción: `contrato_version` n+1, PDF renderizado (pdf-lib) desde `plantilla` + `variables`, subido, hash guardado; `cuenta_herramienta` → `pendiente_firma`; `evento`. | `pendiente_firma` / versión `enviado` |
| 5 | Correo (`@central/core-email`, Resend) | Asunto y cuerpo fijos, SIN el PDF ni datos de la empresa más allá de su nombre: enlace a `empresa./contrato`. Se registra `envio` con el id del proveedor. Fallo → `envio.fallido`; el contrato queda emitido y el operador ve «No salió el correo · Reintentar» (un reintento = otro clic = otro OK). El aviso «Contrato pendiente» del panel sale aunque el correo falle. | |
| 6 | Dueño en «Mi empresa» | Banner fijo «Contrato pendiente de firma» en la portada; las herramientas pendientes se ven en gris «Pendiente de tu firma» (no se pueden abrir). Admin lo VE, no firma. | |
| 7 | Dueño, `/contrato/[version]` | Lee el PDF (visor + descarga). Confirma título (administrador/apoderado), teclea su nombre (`nombreCoincide`), marca `TEXTO_CONSENTIMIENTO`, pide un código NUEVO al correo y lo introduce (paso de seguridad: control exclusivo en el momento de firmar, `metodo: otp_email`). Se envía con `pdf_sha256` visto. | |
| 8 | Servidor | En UNA transacción: recomprueba hash visto == guardado (si no → «El documento ha cambiado, vuelve a leerlo», como `entregarOt`); `FirmaPropia.firmar` con los bytes EXACTOS del PDF; certificado de firma (PDF aparte con evidencia, IP, UA, sello, hash del contrato) subido; `firma`; versión → `firmado`, anterior → `sustituido`; herramientas → `activa`; propagación de submódulos. Si Storage falla, se deshace todo: nunca «firmado» sin certificado. Doble clic → la UNIQUE de `firma` lo para. | `activa` / `firmado` |
| 9 | Avisos | Al operador: Telegram (`core-telegram`, interno) + marca en plataforma. Al dueño: copia por correo con enlace de descarga (no adjunto). | |
- Errores y bordes: dueño revocado o cambiado antes de firmar → versión `anulado`, se reemite al nuevo (nuevo OK); `caduca_en`
  (30 días [Propuesta]) → `caducado`, recordatorio solo con clic del operador; el operador puede anular una versión no firmada;
  plantilla nueva publicada mientras hay una pendiente → la pendiente sigue con SU versión (se firma lo que se envió).
- **Antes de firmar no se tratan datos reales:** F1 lo garantiza en el panel (no hay traspaso a `pendiente_firma`) y por
  procedimiento (el operador no carga datos). F2 lo lleva a cada app: espejo `encargo_firmado_en` escrito SOLO por este circuito
  por el puerto de operador de la app, y las rutas de ingesta (importaciones, hechos, subidas) lo exigen; ausente = no firmado.

## 7. Pantallas
- **Plataforma `/operador/empresas`:** lista de cuentas (CIF, nombre, dueño, herramientas con su estado, versión vigente,
  «Contrato pendiente desde hace N días»), ficha con alta de cuenta (dirección con `BuscadorDireccionCp` + `core-catastro`),
  miembros, `ref_externa` por herramienta, botón «Activar herramientas…» con el modal del paso 3, descarga del contrato firmado
  y del certificado, historial (`evento`). Alberto no ve datos de negocio de la cuenta (dos-ventanas §6).
- **«Mi empresa» portada (F1 mínima):** cabecera con selector (logo/iniciales + nombre + chevron; hoja inferior 95 vw en móvil,
  desplegable en PC; sin chevron con 1 empresa), «con Grupo ASegura» pequeño en cobalto, acento de la empresa; banner de contrato
  pendiente; tarjetas SOLO de herramientas `activa`/`pendiente_firma` con botón «Abrir» (traspaso); lo no contratado se OCULTA;
  pie con «Más herramientas de Grupo ASegura» (solicitud, F3). Reutiliza `Card`/`Chip` de `apps/rrhh/components/InicioAdmin.tsx`
  y `_cabecera.tsx` de contabilidad. ≥320 px, botones ≥44 px.
- **Contrato y firma:** `/contrato/[version]` (PDF, datos de las partes, anexo, casillas, nombre, código), `/contratos`
  (histórico firmado, descarga).

## 8. Seguridad y RGPD
- Encargado = `MEDIADOR.identidad` (Alberto Suárez Gutiérrez, NIF 28823484E, domicilio y `hola@grupoasegura.es` de
  `packages/module-seguros/src/mediador.ts`), marca `MEDIADOR.marca`. Se importa; ningún literal en la plantilla ni en el código.
  🚨 `apps/empresa` importaría `module-seguros` solo por `mediador.ts`: choca con el cepo «ninguna herramienta importa
  `module-seguros*`» (dos-ventanas §2). [Propuesta] mover `MEDIADOR` a un paquete neutro (`@central/legal-templates` o
  `core-herramientas` re-exportando) con `module-seguros` re-exportándolo, para no abrir esa puerta.
- Responsable = la empresa (razón social, CIF, domicilio, firmante y título). Anexo por herramienta con categorías de datos y de
  interesados del catálogo de `core-herramientas` (una sola copia; la plantilla las inserta).
- Minimización: `envio` y `evento` sin datos de empleados; el correo no lleva el PDF; IP y UA solo en `firma` (prueba de la firma,
  conservación = vida del contrato + plazo de prescripción; lo fija la plantilla).
- Secretos: `HERRAMIENTAS_SESSION_SECRET`, `HERRAMIENTAS_OPERADOR_SECRET`, tres de traspaso; todos con `requireSecret`
  (guardián `regression-secrets`). Ningún secreto compartido con rrhh ni con el portal.
- Ni un byte de `seguros`: el panel enlaza a `clientes.grupoasegura.es` como texto, sin identidad.

## 9. Fases y criterio de «hecho»
| Fase | Alcance | Hecho cuando |
|---|---|---|
| **F1 — prueba con Pilar** | `core-herramientas` (catálogo: contabilidad, rrhh, nominas; estados; variables; traspaso) · migración `herramientas` 0001 · `apps/empresa` (OTP, selector, portada mínima, contrato y firma, puerto operador) · `/api/auth/traspaso` + `traspasos_usados` en contabilidad y rrhh · pantalla `/operador/empresas` en plataforma · plantilla v1 cargada · alta de «Talleres de Automoción G2, S.L.» (B88936158) y «Global2 Instalaciones Técnicas» (B05457247) con sus `ref_externa` reales | (a) cepos vistos en ROJO y restaurados: token con `aud` ajeno, `jti` repetido, expirado, firma con secreto de otra app, `alg:none`, persona sin `usuario_empresas` en destino, admin intentando firmar, hash visto ≠ guardado, UPDATE sobre `firma`/`plantilla` rechazado por la BD, `confirmo_destinatario` distinto → 409, variable ausente → no emite, cuenta ajena invisible por RLS, `prisma_herramientas` sin GRANT fuera; (b) Pilar recibe el correo, firma G2 y Global2, ve sus dos empresas, salta a contabilidad y rrhh sin reloguear; (c) Alberto recibe el aviso y descarga PDF + certificado con hash verificado; (d) CI verde con 16 apps |
| F2 | Taller (`persona_email_verificado`, traspaso dueno/admin) · espejo `encargo_firmado_en` en las apps y bloqueo de ingesta sin él · portal del proveedor en el catálogo | Cepo: importación en empresa sin firma → 403 |
| F3 | Contadores en portada (puertos de lectura firmados; sin respuesta = «sin comprobar»), «Solicitar herramienta», dueño invita admins | — |
| F4 | Autónomos (NIF fuera de claro), marca unificada, permisos finos por miembro (dos-ventanas F3), costura con `seguros.herramienta_cuenta` desde asegura | — |

## 10. Archivos y altas (F1)
- Nuevo: `packages/core-herramientas/` (`src/catalogo.ts`, `estados.ts`, `contrato-variables.ts`, `traspaso.ts` + tests).
- Nuevo: `apps/empresa/` (`package.json`, `prisma/schema.prisma` solo schema `herramientas`, `prisma/migrations/0001_herramientas.sql`
  con rol, RLS, REVOKE y triggers, `lib/{sesion,rls,contrato-pdf,firma,envio,operador}.ts`, `app/{login,page,contrato,contratos,api}`,
  `CLAUDE.md` propio). `vercel.json` con `"ignoreCommand": "node ../../scripts/vercel-ignore-build.mjs apps/empresa --sin-previews"`
  y el install `npx --yes pnpm@10.33.0 install --no-frozen-lockfile`.
- CI: añadir `empresa` a la matriz de `.github/workflows/tests.yml` (15 → **16**), `test/regression-matriz-typecheck.test.ts`
  y la cifra en `CLAUDE.md`; el job `Typecheck · empresa` al ruleset lo decide Alberto (no se toca el ruleset).
- Tocar: `apps/contabilidad` y `apps/rrhh` (`app/api/auth/traspaso/route.ts`, migración `traspasos_usados`);
  `apps/plataforma/app/(usuario)/operador/empresas/*` + `lib/adapters/herramientas.ts`.
- Infra (Alberto): proyecto Vercel `empresa` (Root `apps/empresa`), DNS `empresa.grupoasegura.es`, rol de BD y su `DATABASE_URL`,
  remitente `hola@grupoasegura.es` verificado en Resend (hoy hay `envios.` como subdominio: comprobar antes de F1).

## 11. Decisiones (Alberto, 07/11/2026) y dudas
- Pilar GESTIONA (rol `admin`: ve y opera, NO firma). Firma Manuel (representante) como `dueno`. En contabilidad hoy Pilar figura como
  `dueno` de G2 y Global2 (alta del 07/11): se rebaja a gestora/admin cuando Manuel se dé de alta (falta su email).
- Recordatorios: SOLO con clic del operador (nunca automáticos). Caducidad: 30 días.
- `MEDIADOR` a paquete neutro: aprobado por defecto.

Dudas abiertas:
1. ¿Manuel firma también por Global2 Instalaciones Técnicas o lo representa otra persona?
2. G2 y Global2 ya están dadas de alta en contabilidad y rrhh: ¿hay ya datos reales cargados? Si sí, el encargo va con retraso y
   F1 lo regulariza; si no, no se carga nada hasta la firma.
3. ¿El ruleset exige `Typecheck · empresa` desde el alta?
