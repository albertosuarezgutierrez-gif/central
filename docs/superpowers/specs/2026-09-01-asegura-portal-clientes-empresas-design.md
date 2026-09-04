# Portal de clientes, leads y empresas de Grupo ASegura — diseño

**Fecha:** 01/09/2026 · **Vertical:** `asegura` (correduría, negocio principal de Alberto)
**Aprobado por:** Alberto (conversación de brainstorming, 01/09/2026)

## Contexto

Alberto quiere una intranet **abierta a todo el mundo** —cliente o no— donde cada persona unifique
sus seguros y sus recordatorios, y una intranet **de empresas** donde el dueño tenga sus pólizas a
mano y autorice a sus empleados (el conductor de una furgoneta que necesita compañía, nº de póliza y
teléfono de siniestros). Con esos datos, la correduría ofrece precios.

### 🚨 La cartera NO es lo que dice `CLAUDE.md` (medido el 01/09/2026)

`CLAUDE.md` y `docs/TRASPASO-CORREDURIA.md` describen «32.600 clientes, 28.843 pólizas» como si
fuera un libro vivo. Medido sobre la BD de Manuel (`uijsgeocgdaxkhvwtjqs`), la realidad es otra, y
**dimensiona mal el proyecto entero si no se corrige**:

| Bloque (por `polizas.import_ref`) | Pólizas | Vto. futuro | Qué es |
|---|---:|---:|---|
| `intranet:` (cargado 20/06/2026) | 26.117 | **0** | Archivo histórico, vencimientos 2013-2018 |
| `asegura_app:` (cargado 21/06/2026) | 2.612 | **1** | Histórico de la app anterior |
| **sin `import_ref`** (05/06 → 24/08/2026) | **109** | **54** | **Lo vivo: entra por CIMA** |

- **Cartera real: ~80 clientes / 109 pólizas** (45 auto activas, 13 hogar, 8 RC, 1 moto). 43 clientes
  con vencimiento estrictamente futuro; 72 contando los últimos 18 meses.
- **Leads: 32.520 fichas** — es decir, todo lo que no es cartera viva (32.600 − 80). ⚠️ La columna
  `tipo` dice otra cosa (29.858 `lead`, 2.742 `cliente`) y **está desactualizada**: manda la regla de
  CIMA, no la etiqueta. Por segmento: 27.624 `ex_cliente`, 4.921 `prospecto`, **55** `cliente`.
- Las 28.729 pólizas importadas **no tienen ni una** con vencimiento en los últimos 18 meses.
- CIMA funciona: primer fichero 05/06/2026, último **30/08/2026**.
- Reparto por ramo del histórico: auto 17.375 (60%), hogar 5.659, salud 4.470, decesos 773.
  Prima media: auto 335€, hogar 145€, **salud 748€**, comercio 607€.

**Regla de negocio dictada por Alberto (01/09/2026):** *lo que entra por CIMA son clientes actuales;
todo lo demás son leads a los que atacar para vender; y a los clientes de CIMA se les pide que
aporten los seguros que tienen con otros para poder ampliarles cobertura.* El marcador operativo de
esa regla es `import_ref IS NULL`.

**Acción derivada (fuera de este spec, pero obligatoria):** corregir la cifra en `CLAUDE.md` y en
`docs/TRASPASO-CORREDURIA.md`. Hoy inducen a error a cualquiera que los lea.

### Lo que ya existe y no hay que reinventar

- `@central/module-seguros` — vigencia, `DIAS_PREAVISO_TOMADOR`, urgencia de renovación.
- `@central/module-flota` — documentos de vehículo (`itv | seguro | permiso | tacografo`), estado
  `vigente | por_caducar | caducado`, y ya respeta la regla de la casa: un vehículo **sin ITV
  registrada** no sale verde.
- `@central/core-push` — Web Push, gratis, sin dependencia de Meta.
- `@central/core-ai` — extracción de datos de PDF/foto de póliza.
- En el CRM origen: `poliza_intervinientes` (roles reales), `poliza_origen` con el valor
  **`declarada_usuario`** ya previsto y a 0 filas, `ofertas_automaticas` (motor de oferta al
  vencimiento, diseñado y a 0 filas), `peticiones`, `lds_consent`, `mediator_audit_log`.

### Lo que NO se puede reutilizar

- **`recordatorios` del CRM origen: `poliza_id` es NOT NULL.** No puede existir un recordatorio sin
  póliza, así que no cabe la ITV, ni el carnet, ni nada de un lead. Se sustituye, no se hereda.

## Decisiones

1. **Todo se desarrolla sin depender de Manuel.** Ningún hito del portal espera al traspaso.
2. **BD compartida de la casa** (`wswbehlcuxqxyinousql`), schema **`seguros`**. Sin Supabase aparte.
   Medido: central ocupa 205 MB y el schema de Manuel 79 MB → ~284 MB de los 500 del plan free.
3. **App nueva `apps/asegura-portal`**, proyecto Vercel propio, `ignoreCommand` obligatorio con
   `--sin-previews`, cookie y secreto propios. **No comparte despliegue con `apps/asegura`**: el
   panel del corredor corre con `prisma_seguros` (BYPASSRLS, vista de dios sobre toda la cartera) y
   un registro público no puede vivir en esa misma superficie.
4. **Rol propio `prisma_asegura_portal`, SIN BYPASSRLS**, con GRANT solo sobre las tablas `portal_*`
   y lectura acotada de la cartera. Es lo que toca internet; no lleva la llave maestra.
5. **Lógica en `@central/module-seguros-portal`**, pura y sin BD (molde: `lib/tenant-ambito.ts`).
6. **Canal por defecto: WhatsApp.** Email solo de rescate. **WABA nueva a nombre de Grupo ASegura** —
   la de Manuel no viaja en ninguna transferencia, y no hay historial que perder: `wa_opt_in` = 0 en
   las 32.600 fichas y `whatsapp_outbound_messages` = 0.
7. **El eje del producto es «aporta tus seguros»**, no «mira tus pólizas». Mirar sirve a 80 personas;
   aportar sirve a los 32.520 leads (captación) **y** a los 80 clientes (ampliar cobertura). Un solo
   desarrollo, las dos audiencias que pidió Alberto.

## Modelo — cuatro piezas que hoy están confundidas en una

- **`Identidad`** — persona con un canal verificado. Es quien entra. **No es un cliente.**
- **`Ficha`** — el cliente/lead de la cartera. Una identidad puede no tener ninguna (lead puro) o
  varias vinculadas (la suya y la de su padre).
- **`Bien`** — coche, vivienda, local, mascota, la propia persona, la empresa. **Es el ancla de los
  recordatorios**, no la póliza.
- **`Póliza`** — con `origen: gestionada_correduria | declarada_usuario`. Ese campo es **la costura**:
  hoy lo `gestionada_correduria` se lee del rol SELECT-only contra Manuel; tras la migración saldrá
  de nuestras tablas, y el portal no se entera del cambio.

Y encima, dos relaciones que **no se pueden fundir**:

- **`PapelEnPoliza`** — tomador, asegurado, conductor habitual/ocasional, propietario, beneficiario.
  Es un **hecho del contrato**; lo pone la compañía.
- **`Autorizacion`** — identidad → objeto, con nivel, quién la concedió, con qué prueba y cuándo caduca.

> **La regla que sostiene la seguridad del portal: el papel PROPONE el acceso, no lo concede.**
> Ser conductor habitual del coche de tu padre no abre nada: le da al sistema una razón para
> sugerirle a él que te autorice con un toque.

## Tablas nuevas (schema `seguros`, prefijo `portal_` para no colisionar con el volcado futuro)

| Tabla | Qué guarda |
|---|---|
| `portal_identidad` | La persona que entra. Sin PII más allá del nombre que ella dé |
| `portal_canal` | Canal verificado (`whatsapp` \| `email`), con hash de búsqueda y fecha de verificación |
| `portal_vinculo` | Identidad ↔ ficha de cartera. Estado `verificado \| ambiguo_pendiente \| rechazado`, y **qué prueba** se usó |
| `portal_autorizacion` | Identidad → objeto (`ficha` \| `poliza` \| `bien`), `nivel`, quién concedió, prueba, `caduca_at`, `revocada_at` |
| `portal_bien` | Coche, vivienda, local, mascota, persona, empresa. `datos` jsonb |
| `portal_poliza_declarada` | La póliza que aporta el usuario: compañía, nº, ramo, prima, vencimiento, fraccionamiento, coberturas |
| `portal_obligacion` | La obligación con fecha. Ancla a `portal_bien`; póliza **opcional** |
| `portal_aviso` | Cada envío: canal, programado, enviado, leído. Una obligación genera N avisos |
| `portal_consentimiento` | **Append-only.** LDS art. 19 + RGPD, separando «avísame» de «ofertadme» |
| `portal_auditoria` | Quién vio qué y cuándo. Obligatorio en cuanto hay accesos delegados |
| `portal_revision` | Cola para Alberto: vínculos ambiguos, PDFs que la IA no supo leer, autorizaciones a aprobar |

## Identidad y vinculación

Entrada por **OTP de WhatsApp**. Email solo para quien no tenga móvil (704 clientes reales) o lo pida.

**El móvil identifica un HOGAR, no una persona** — así está la cartera, medido:

| Caso | Qué hace el sistema | Volumen real |
|---|---|---:|
| Número → 1 ficha | Vincula y entra | 3.778 números |
| Número → varias, **mismo apellido** | Es una familia. El OTP prueba el móvil; la **fecha de nacimiento** dice cuál eres (la hay en 24.242 fichas). Luego ofrece gestionar los del resto, **con consentimiento de cada uno** | 630 grupos |
| Número → varias, **apellidos distintos** | **No adivina.** Bóveda propia y `portal_revision` para Alberto | 73 grupos |
| Número desconocido | Bóveda propia. Es un lead | el resto |

Datos que respaldan esto: 740 números compartidos por 1.599 fichas; **672 son parejas** y solo 10
grupos tienen ≥5; **630 de los 740 comparten primer apellido**; **ninguno comparte `import_ref`**
(no es basura de importación, lo metió alguien a mano); ninguna ficha jurídica en los grupos grandes.
**Emails duplicados entre clientes distintos: 0** — el email es identificador limpio, el móvil no.

Efecto lateral buscado: de 1.107 parejas que comparten número, 763 comparten apellido pero **solo 24
tienen el parentesco declarado**. El portal rellena ese hueco solo, con consentimiento.

## Niveles de acceso

**La línea que hace seguro todo el edificio: dato de la COSA ≠ dato de la PERSONA.** Ya la intuyó
Manuel — el comentario de `poliza_coberturas` dice *«Dato de contrato, NO PII»*.

| Nivel | Ve | No ve |
|---|---|---|
| `tarjeta` | Compañía, nº póliza, coberturas, teléfono de siniestros. Puede abrir parte | Prima, IBAN, DNI del tomador, otras pólizas |
| `completo` | Todo lo de esa póliza: prima, recibos, documentos | Otras pólizas no autorizadas |
| `gestionar` | `completo` + crear peticiones, abrir siniestro, subir documentos | — |
| `administrar` | `gestionar` + **autorizar a terceros** | — |

Derivación automática desde el papel: **tomador → `gestionar` sobre lo suyo**; **conductor/asegurado
→ `tarjeta`**; cualquier otra cosa exige autorización explícita.

Con esto **el empleado de la furgoneta no necesita que nadie le configure permisos**: es conductor,
ve la tarjeta del vehículo, y no ve la contabilidad de la flota.

### Empresas

Mismo mecanismo, dos diferencias reales:

- **Quien autoriza es el representante, no la sociedad.** Se registra quién es y con qué prueba.
- **Hay cascada:** administrador → jefe de flota → conductor. Las autorizaciones de empleado nacen
  **con `caduca_at` por defecto**: el que se va deja de ver sin que nadie se acuerde de quitarlo.
- **Acceso sin cuenta para la cuneta:** QR pegado en el vehículo → abre WhatsApp con el vehículo
  identificado en el enlace. Devuelve **solo la tarjeta** (dato de la cosa). Sin login ni contraseña.

⚠️ `tipo_persona` está **NULL en 32.519 de 32.600** fichas y solo 6 constan como jurídicas. Eso **no
significa que Alberto tenga 6 empresas**: significa que no está anotado. El portal B2B **no puede
arrancar filtrando por esa columna**; la empresa se pregunta en el alta o se infiere de tener varios
vehículos.

## Motor de recordatorios

Genérico: **cualquier obligación con fecha, colgada de un bien**. Póliza opcional.

**Tres procedencias, pintadas SIEMPRE distinto** (`portal_obligacion.procedencia`):

- **`compania`** — vino por CIMA. El único fiable sin confirmar.
- **`calculado`** — el sistema sabe la norma (ITV según matriculación y tipo, DNI 10 años, carnet
  10 años hasta los 65 y 5 después, revisión de gas cada 5). **Propone; el usuario confirma.**
- **`declarado`** — lo escribió el usuario. Se guarda y se avisa, pero **el sistema no pretende
  entenderlo** ni sugerir nada sobre él.

Tipos que el sistema entiende de verdad: póliza, recibo, ITV, carnet/CAP, tacógrafo, mantenimiento
(por fecha **o por km**), revisión de gas, certificado energético. Más **recordatorio libre** para
todo lo demás (IBI, licencia de actividad, extintores, revisión médica, vacuna del perro…).

**Cada tipo mapea a un ramo**, y ahí es donde el calendario deja de competir con una agenda y pasa a
ser el cuestionario que la gente sí rellena: gas/caldera → hogar · modelo 303 → RC profesional ·
mascota → RC animales · pasaporte → viaje · extintores/PRL → RC empresa y convenio.

**El aviso lleva la fecha ACCIONABLE, no la del evento.** No «vence el 15 de marzo» sino «tienes
hasta el **13 de febrero** para no renovarlo» (LCS art. 22, `DIAS_PREAVISO_TOMADOR`).

### 🚨 Regla que evita un desastre

**Las pólizas del volcado histórico (`import_ref IS NOT NULL`) NO generan ni un recordatorio.** Si el
motor leyera esas fechas mandaría hasta **28.729 avisos de «se te venció el seguro» sobre pólizas de 2013-2018**.
Solo avisan las de CIMA (`import_ref IS NULL`) y las `declarada_usuario`. El histórico queda como
consulta y para nada más.

### Canales

- **Push** (`@central/core-push`): lo rutinario. Gratis, sin Meta, sin coste por mensaje.
- **WhatsApp**: vencimiento, siniestro y oferta. Plantillas pre-aprobadas (Authentication para el
  OTP, Utility para avisos) y opt-in registrado en `portal_consentimiento`.
- **Email**: rescate.

## Componentes

| Pieza | Dónde |
|---|---|
| Lógica pura (niveles, hogar, vencimientos, procedencia) | `packages/module-seguros-portal/src/*` + `.test.ts` |
| SQL de las 11 tablas + rol | `apps/asegura-portal/prisma/sql/2026-09-01_portal_bootstrap.sql` |
| App | `apps/asegura-portal/` (Next.js, `vercel.json` con `ignoreCommand` + `--sin-previews`) |
| Resolutor de acceso (**puerta única**) | `apps/asegura-portal/lib/acceso.ts` |
| Lectura de cartera tras la costura | `apps/asegura-portal/lib/cartera-lectura.ts` (`origen: cartera \| aportada`) |
| OTP + vinculación | `apps/asegura-portal/lib/identidad.ts` |
| Extracción de póliza (foto/PDF) | `apps/asegura-portal/lib/extraer-poliza.ts` sobre `@central/core-ai` |
| Cola de revisión de Alberto | pantalla en `apps/asegura` (el corredor), leyendo `portal_revision` |

## Alcance y fases

Este spec define el producto completo (portal B2C + portal de empresas) porque comparten motor y no
tiene sentido diseñarlos por separado. **El troceado en entregas va en el plan de implementación, no
aquí.** Orden previsto: identidad y bóveda propia → «aporta tus seguros» → motor de obligaciones →
vinculación con cartera → autorizaciones y empresas.

## Fuera de alcance de esta entrega

Emisión por Codeoscopic (el flag nunca activado, y **no deduplica de punta a punta**: Codeoscopic no
usa nuestro `attempt_id`), agente conversacional autónomo, migración de la cartera, detector de
solapes e infraseguro, marca blanca para colectivos, observatorio de precios.

## Guardianes (tests que fallan si alguien rompe la regla)

1. **Ningún fichero de `apps/asegura-portal` consulta `seguros.*` sin pasar por `lib/acceso.ts`** —
   molde: `test/regression-asegura-aislamiento.test.ts`, que ya está verificado con un fichero
   infractor real.
2. **Una póliza sin intervinientes registrados nunca dice «aquí solo estás tú»** — hoy solo el 1,7%
   de las pólizas los tiene (504 filas para 28.834 pólizas). Ausencia = «no se ha anotado».
3. **Un número compartido nunca resuelve solo** a una ficha.
4. **Una obligación `declarado` nunca se pinta como verificada.**
5. **Ninguna póliza con `import_ref` genera un aviso.**
6. **`ASEGURA_PORTAL_SESSION_SECRET` sin fallback a literal** — `test/regression-secrets.test.ts`.
7. Formato de dinero español (`eur()`) y responsive ≥320 px en toda pantalla nueva.

## Riesgos y decisiones abiertas

- **Escribir a 25.882 ex-clientes de 2015-2018 es marketing a una base fría de 8 años.** Antes de
  cualquier campaña hay que revisar base de legitimación y plazo de conservación. No es papeleo: es
  lo único de este proyecto que puede costar dinero de verdad. **El portal se puede construir sin
  resolverlo; la campaña no.**
- **Coste por mensaje de WhatsApp.** Hay que dimensionarlo con las tarifas vigentes de España antes
  de prometer «gratis para siempre». Mitigación ya prevista: push para lo rutinario.
- **`poliza_intervinientes` al 1,7%.** Merece la pena comprobar si el parser de CIMA los trae y los
  descarta — si es eso, arreglarlo desbloquea la derivación automática de accesos casi sola.
- **La copia de la BD de Manuel y su borrado son dos eventos distintos.** Copiar: ya, sin riesgo.
  Borrar: **solo tras dos pruebas sobre NUESTRA copia** — descifrar un registro real **y** buscar un
  cliente por email y por DNI. Sin las dos claves (cifrado de campo + índice ciego, ambas en su
  Vercel) la copia es texto ilegible y el borrado es irreversible. Es lo único que hay que pedirle:
  dos secretos.
- **Si Manuel apaga, CIMA deja de entrar** (su GitHub Actions + el adaptador de Fly). Proyecto aparte;
  la buena noticia es que **la cuenta de TIREA ya es de Alberto** (`albertosuarez.testws`).
