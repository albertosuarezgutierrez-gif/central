# Intranet de clientes de Grupo Asegura — calendario de vencimientos (v1) — diseño

> **Ámbito:** primera entrega en producción de `apps/asegura-portal`, para los ~80 clientes vivos.
> **No sustituye** a `docs/superpowers/specs/2026-09-01-asegura-portal-clientes-empresas-design.md`,
> que sigue siendo el spec del producto completo (B2C abierto + empresas). Este acota QUÉ se entrega
> primero y declara HACIA DÓNDE va, para que nadie rediseñe la fontanería en otra dirección.

Fecha: 02/09/2026.

## Contexto

`apps/asegura-portal` tiene Fase 1 y Fase 4 en `main` y el DDL aplicado en la Supabase compartida
(schema `seguros`, 7 tablas `portal_*`). **Nunca se ha desplegado**: el proyecto Vercel existe pero
le faltan las variables de entorno. O sea, el trabajo de esta entrega es *menos* código del que
parece y más puesta en pie.

### Lo que ya existe y no se toca

| Pieza | Dónde |
|---|---|
| Entrada por código de un solo uso sobre un puerto de canal | `app/page.tsx`, `lib/canal*.ts`, `app/api/acceso/*` |
| Vínculo identidad → ficha de la cartera por índice ciego del email | `lib/vinculo.ts` |
| Lectura acotada de la cartera (pólizas, recibos, siniestros, autorizadas) | `lib/cartera-lectura.ts` |
| Pantalla «Mis seguros» + bóveda de pólizas aportadas | `app/(portal)/boveda/` |
| Subida de póliza (PDF o foto) leída por IA, con su procedencia | `lib/extraer-poliza.ts`, `SubirPoliza.tsx` |
| Puerta única de acceso a `seguros.*` | `lib/session.ts` + `lib/cartera-lectura.ts` |
| Tablas `portal_identidad`, `portal_canal`, `portal_codigo`, `portal_bien`, `portal_poliza_declarada`, `portal_consentimiento`, `portal_vinculo` | `prisma/sql/2026-09-01_portal_fase1.sql`, `2026-09-02_portal_rol_vinculo_grants.sql` |

### Precondición de despliegue — depende de Alberto, no del código

En el proyecto Vercel `asegura-portal` (`prj_MNrsMRVrBft6KLq1skgi8XU9s9y9`, Root Directory
`apps/asegura-portal`):

1. **`DATABASE_URL`** con el rol `prisma_asegura_portal` (contraseña en el Vault de Supabase,
   secreto `prisma_asegura_portal_password`). Rotar la contraseña y cambiar esta env son **el mismo
   paso**: una sin la otra deja la app muerta en silencio con `password authentication failed`, que
   solo se ve en los logs del pooler (lección de `prisma_seguros`, 02/09/2026).
2. **`PII_LOOKUP_KEY` IDÉNTICA a la de `central-asegura`.** Con otra clave el hash del índice ciego
   no casa y **nadie se vincula nunca**: todo el mundo entra y no ve su cartera, sin ningún error.
3. `ASEGURA_PORTAL_SESSION_SECRET` y `ASEGURA_PORTAL_CANAL_PEPPER`.

## Decisiones de alcance

1. **La v1 es para los clientes de la casa, no para leads.** No porque sea el producto más valioso
   —no lo es—, sino porque es el que ya está construido y el que no abre ningún frente de coste ni
   de RGPD. Lo que se construye aquí (bien → obligación → aviso) es literalmente la fontanería que
   el producto de leads reutiliza entera.
2. **80 clientes no son un piloto del producto de captación.** No se van a extraer conclusiones de
   conversión de gente que ya tiene el teléfono de Alberto.
3. **El cliente mira y aporta.** Ve sus pólizas vivas y su calendario, y puede subir a la bóveda las
   pólizas que tiene contratadas fuera. Nada más.
4. **Cero gasto en Avant2 en esta entrega.** El botón de retarificar queda fuera (ver Fuera de
   alcance y Riesgos).
5. **El canal de aviso es email.** Es el único que existe hoy: la WABA de WhatsApp no está dada de
   alta y el push exige que el cliente instale la PWA. Sale por el **mismo puerto de canal** que ya
   manda el código de acceso, así que cuando exista la WABA se cambia el adaptador y no el motor.

## La pieza nueva: `portal_obligacion`

Una obligación es **cualquier cosa con fecha colgada de un bien**. La póliza es opcional a
propósito: el mismo motor tiene que servir para ITV, mantenimiento, revisión de gas o el IBI de una
persona que no tiene ni una póliza con la correduría. Esa generalidad no es especulación: es el eje
del producto (ver Destino declarado).

| Campo | Para qué |
|---|---|
| `id` | uuid |
| `bien_id` → `portal_bien` | **el ancla**. Una obligación siempre cuelga de una cosa |
| `poliza_id` (nullable) | la póliza de la cartera que la originó, si la hay |
| `poliza_declarada_id` (nullable) | ídem para una póliza aportada por el usuario |
| `tipo` | enum. v1 emite solo `poliza`; el enum nace con `itv`, `carnet`, `recibo`, `mantenimiento`, `revision_gas`, `libre` |
| `fecha_evento` | la fecha real del hecho (el vencimiento) |
| `fecha_accionable` | la fecha hasta la que el tomador puede actuar. **Calculada**, no tecleada |
| `procedencia` | `compania` \| `calculado` \| `declarado` |
| `confirmada_at` (nullable) | `calculado` y `declarado` nacen **sin confirmar** |
| `avisada_at` (nullable) | sello del envío, para no repetir el aviso |
| `creada_at`, `actualizada_at` | auditoría |

### Reglas que sostienen el motor

1. 🚨 **Una póliza con `import_ref IS NOT NULL` NO genera obligación.** Son las 28.729 del volcado
   histórico, con vencimientos de 2013-2018. Sin este filtro, la primera pasada del cron manda
   miles de avisos de «se te venció el seguro» sobre pólizas muertas hace ocho años. Solo generan
   obligación las de CIMA (`import_ref IS NULL`) y las declaradas por el usuario.
2. **La `fecha_accionable` es la del aviso, no la del evento.** El tomador tiene un plazo de
   preaviso para oponerse a la prórroga (art. 22 LCS). El aviso dice *«tienes hasta el 13 de
   febrero para no renovarlo»*, no *«vence el 15 de marzo»*. El plazo vive como constante
   (`DIAS_PREAVISO_TOMADOR`) en `@central/module-seguros-portal`, con su test — incluido el borde
   de mes (31 de marzo → 28/29 de febrero según el año).
3. **Tres estados, no dos.** `fecha_evento` a NULL no es «no vence»: es «no se sabe». Se pinta
   *«vigencia sin confirmar: falta el vencimiento»* — que es lo que la bóveda ya hace bien hoy — y
   **no genera aviso**.
4. **La procedencia se pinta SIEMPRE.** Una obligación `declarado` o `calculado` nunca aparece con
   el mismo aspecto que una `compania`. La `compania` es la única fiable sin confirmar.

## El aviso

Un endpoint de cron diario en `apps/asegura-portal` recorre las obligaciones con
`avisada_at IS NULL` y `fecha_accionable` dentro de la **ventana de aviso**, y manda **un** mensaje
por obligación a través del puerto de canal (`lib/canal.ts` → `canal-email.ts`). El sello
`avisada_at` se escribe en la misma transacción, para que un reintento del cron no duplique el envío.

**La ventana de aviso en v1 es un único disparo**, cuando faltan **7 días o menos** para la
`fecha_accionable` y esta no ha pasado todavía. Un solo aviso por obligación, no una secuencia: una
cadencia de recordatorios es una decisión de producto que necesita datos de apertura que hoy no
existen. La constante vive en `@central/module-seguros-portal` junto a `DIAS_PREAVISO_TOMADOR`.

⚠️ **Y la primera pasada del cron sobre una base ya cargada avisa de todo lo que caiga en la
ventana.** Antes de encenderlo hay que contar cuántas obligaciones la cumplen; si el número no es el
esperado, no se enciende. Un cron de avisos no se estrena a ciegas.

El contenido es informativo —qué vence, de qué compañía, hasta cuándo puede actuar y un enlace al
portal—. **No es una recomendación de producto**: un aviso del tipo «tengo mejor oferta para ti» es
asesoramiento y arrastra análisis objetivo e IPID (ver Riesgos).

## Destino declarado — hacia dónde va esta fontanería

Esto **no se construye en la v1**. Se escribe para que la v1 no se diseñe en una dirección que haya
que deshacer.

- **Producto abierto a cualquiera.** El eje no es «mira tus pólizas» (sirve a 80 personas) sino
  «aporta tus seguros y yo te aviso» (sirve a los ~32.520 leads). Un lead que se registra y declara
  sus vencimientos **está pidiendo** el contacto: es la base de legitimación limpia que la campaña
  a la base fría de 2015-2018 no tiene.
- **Servicios que no dependen de tener la póliza en casa.** ITV, mantenimiento, carnet, gas, IBI.
  Por eso `poliza_id` es opcional desde el primer día. La tesis comercial es que el cliente se
  acostumbre a que la correduría le avise de todo.
- **Alta por fotos.** Ficha técnica, carnet y DNI dan casi toda la tarificación de auto *y*, gratis,
  dos obligaciones calculadas (ITV por fecha de matriculación, caducidad del carnet). La dirección
  del DNI, cruzada con `@central/core-catastro` (`precalificarHogar()`, servicios libres, sin
  coste), da superficie, año y uso de la vivienda — **como hipótesis a confirmar con un toque**
  («¿es esta tu vivienda habitual? ¿eres propietario?»), nunca como base de un precio.
- **Cambio de mediador.** Un tomador puede nombrar a Grupo Asegura mediador de una póliza que ya
  tiene con otra compañía. Es la única vía que convierte un lead en cliente **sin tarificar, sin
  cambiar su seguro y sin gasto de Avant2**, y tiene un efecto de segundo orden que es el
  verdadero premio: [Probable] una vez eres el mediador, esa póliza **empieza a entrar por CIMA**,
  con lo que su vencimiento y su prima dejan de ser dato declarado y pasan a ser dato verificado,
  solo y para siempre. La bóveda de la v1 ya produce los candidatos: cada póliza que un cliente
  sube «de fuera» es uno.
- **Empresas y flota.** Mismo motor, con cascada administrador → jefe de flota → conductor,
  autorizaciones con `caduca_at` por defecto y QR en el vehículo que devuelve solo la tarjeta (dato
  de la cosa, sin PII ni login). ⚠️ Antes de diseñar su pantalla hay que medir si el parser de CIMA
  trae los intervinientes: hoy `poliza_intervinientes` está al **1,7%** y `tipo_persona` es NULL en
  **32.519 de 32.600** fichas, así que el dato que ese producto vende no existe todavía.

## Fuera de alcance de la v1

Botón de retarificar con Avant2, partes de siniestro desde el portal, mensajería con el corredor,
registro abierto a no-clientes, empresas y flota, cambio de mediador, alta por fotos, y cualquier
escritura o envío dirigido a leads.

## Guardianes (tests que fallan si alguien rompe la regla)

1. **Ninguna póliza con `import_ref` genera obligación ni aviso.**
2. **Una obligación `declarado` o `calculado` nunca se pinta como verificada.**
3. **`fecha_accionable` sale del módulo puro** y tiene test propio, con el borde de mes cubierto.
4. **`fecha_evento` NULL nunca se pinta como «sin vencimiento» a secas** ni genera aviso.
5. **Ningún fichero de `apps/asegura-portal` consulta `seguros.*` sin pasar por la puerta única**
   (molde: `test/regression-asegura-aislamiento.test.ts`).
6. **Un aviso no se manda dos veces** para la misma obligación.
7. `ASEGURA_PORTAL_SESSION_SECRET` sin fallback a literal (`test/regression-secrets.test.ts`).
8. Formato de dinero español (`eur()`) y responsive ≥320 px en toda pantalla nueva.

## Riesgos y decisiones abiertas

- **El coste de Avant2 es el riesgo económico del proyecto entero.** [Seguro] Cada `POST /insurances`
  cuesta **0,50€ y no es idempotente**: repetir la llamada crea otro proyecto y otro cargo
  (`apps/asegura/prisma/sql/2026-09-01_codeoscopic_consumo.sql`). Un botón que cualquiera pueda
  pulsar, o una vigilancia periódica de la base, son facturas de cuatro cifras al mes (vigilar
  mensualmente a 4.000 leads = 2.000€/mes). **La regla que se propone cuando llegue el momento:**
  el sistema vigila la FECHA, que es gratis, y tarifica **una vez**, al acercarse el vencimiento,
  contra el cupo y el motivo que ya registra `seguros.codeoscopic_consumo`.
- **La dirección del DNI no es una vivienda asegurable.** Aunque acierte —y suele acertar—, no dice
  si es propietario o inquilino, ni m², ni año, ni capital de continente. Catastro rellena parte
  gratis; el resto se pregunta. Es la regla de la casa: un `NULL` colapsado a un valor plausible es
  una mentira sobre la que se decide.
- **El cambio de mediador no se automatiza de punta a punta.** [Probable] Exige mandato firmado por
  el tomador, cada compañía tiene su procedimiento y la aceptación no está garantizada. Lo
  automatizable es el papel (carta de nombramiento pre-rellenada con lo que la IA leyó de la
  póliza), la firma y el seguimiento del estado. [Suposición] Y se hereda la póliza al precio que
  ponga la compañía en la renovación: se gana la relación y el dato, no el margen inmediato.
- **Un aviso de «mejor oferta» es asesoramiento**, no información. [Probable] Arrastra análisis
  objetivo e IPID (RDL 3/2020). El texto de los avisos de la v1 se mantiene informativo por eso.
- **La cartera de leads como palanca de negociación con compañías.** [Suposición] Una base de
  primas declaradas no es producción emitida, que es lo que una compañía valora. Su valor real es
  saber el precio a batir antes de tarificar y decidir a qué compañía llevar cada riesgo.
- **Sin `PII_LOOKUP_KEY` correcta el portal falla en silencio.** No es un riesgo teórico: el módulo
  degrada a `sin_clave` y el cliente entra sin ver nada. Hace falta una comprobación explícita en
  el despliegue, no confiar en que «no da error».
