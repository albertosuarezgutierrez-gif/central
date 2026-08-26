# 🛡️ Traspaso del CRM de correduría (Manuel Suárez) → `central`

> **Estado: FASE 1 COMPLETADA (26/08/2026).** Manuel dio acceso a su Supabase y el inventario está
> hecho y medido — ver «FASE 1 CERRADA» abajo. Faltan el **código** (repo, bloqueado) y el **Vercel**
> (sin invitación). **Nada se ha migrado todavía**, y antes de migrar hay que firmar el contrato de
> encargado de tratamiento: son 32.600 clientes reales.
> Ningún dato se ha migrado todavía; lo único hecho en `central` son los cimientos vacíos (ver
> «Hecho ya»). Este documento es el runbook del traspaso y **la ÚNICA fuente de verdad** mientras dure.
> Cuando el traspaso se cierre, esto se sustituye por `apps/asegura/CLAUDE.md` y una entrada en
> `docs/CONTEXTO-SESIONES.md`.
>
> 🔗 **Documento único (20/08/2026).** Hasta hoy había **dos planes en paralelo** para lo mismo, escritos
> por dos sesiones distintas que no se vieron: este (`docs/TRASPASO-CORREDURIA.md`, vertical `apps/seguros`)
> y `docs/ASEGURA-MIGRACION.md` (vertical `apps/asegura`). Se han **fundido en este**, que absorbe todo lo
> que el otro tenía y el otro se ha borrado. Si encuentras una referencia suelta a `apps/seguros`, es de
> antes de la fusión: el nombre bueno es **`apps/asegura`**.

## 📍 Estado de los tres accesos (comprobado el 26/08/2026, no supuesto)

| Acceso | Estado real | Qué falta |
|---|---|---|
| **Supabase** | ✅ **RESUELTO.** Manuel invitó a Alberto a su organización (`qdrmgpvqhcmhmpcrvtan`) el 26/08/2026 y el conector **lee el proyecto `uijsgeocgdaxkhvwtjqs` sin problema**. La Fase 1 está hecha | ✅ Nada. ~~Reconectar el conector marcando la organización~~ — **era innecesario**: `list_projects` no enumera proyectos de otras organizaciones, pero el acceso por `project_id` funciona igual |
| **GitHub** | ⚠️ Invitación del **12/08/2026** a `manuelsuarez/asegura`, sin confirmar que esté aceptada | 🔴 **Claude no puede leer ese repo desde esta sesión, pase lo que pase**: `add_repo` → *cross-tier adds are not supported* (esta sesión ya tiene fuentes de `albertosuarezgutierrez-gif`). Haría falta una sesión NUEVA con `manuelsuarez/asegura` como fuente inicial, y eso exige que la app de Claude esté instalada en la cuenta de Manuel. Mientras tanto, el rodeo sigue siendo `docs/ASEGURA-PROMPT-CHROME.md` (Claude Chrome) o un ZIP del árbol de trabajo |
| **Vercel** | 🔴 Sin invitación: `list_teams` solo devuelve `pisos-turisticos-projects` | Pedírsela a Manuel (o, si su cuenta es Hobby, la lista de **nombres** de variables por aquí y los **valores** por gestor de contraseñas) |

> **Regla de esta tabla:** «no lo veo» ≠ «no existe». Que un proyecto no salga en `list_projects` no
> dice nada del CRM de Manuel; dice que este conector todavía no tiene permiso para mirarlo.

**Nada se ha copiado todavía.** La Fase 1 (inventario y medición) no puede empezar hasta que el
proyecto de `LOOR` sea visible desde el conector.

## ✅ FASE 1 CERRADA — inventario real del Supabase de Manuel (26/08/2026)

> **Cómo se entró, y la corrección que importa:** el conector de Supabase de Claude **sí puede leer el
> proyecto de Manuel**, por referencia directa. Lo que NO hace es *enumerarlo*: `list_projects` solo
> lista los proyectos de la organización propia, y de ahí salió la conclusión equivocada de que hacía
> falta reautorizar el OAuth por organización. **No hacía falta nada: solo el `project_id`.**
> Lección de método: *«no aparece en el listado» ≠ «no tengo acceso»* — antes de pedirle a nadie que
> toque permisos, prueba el acceso directo.

**Proyecto: `uijsgeocgdaxkhvwtjqs`** · `ASEGURA-prod-eu` · AWS `eu-central-1` · Postgres 17.6 ·
compute NANO · plan free · `ACTIVE_HEALTHY` · creado el 20/04/2026 · organización
`qdrmgpvqhcmhmpcrvtan` (el panel la muestra como `PISO`, el correo de invitación la llamaba `LOOR`).

### 🚨 Esto NO es un prototipo: es una correduría con cartera real

| Tabla | Filas | Tabla | Filas |
|---|---:|---|---:|
| `clientes` | **32.600** | `bienes_asegurables` | 1.614 |
| `polizas` | **28.843** | `poliza_coberturas` | 1.425 |
| `cliente_telefonos` | 4.794 | `gestiones` | 694 |
| `cliente_emails` | 4.017 | `poliza_intervinientes` | 504 |
| `oportunidades` | 3.676 | `poliza_recibos` | 186 |
| `operational_events` | 3.518 | `cima_ficheros` | 125 |
| `cliente_carnets_conducir` | **2.189** | `siniestros` | 69 |
| `cliente_relaciones` | 1.710 | `usuarios` | 17 |

**52 tablas en `public`.** Y con eso, el punto 6 del mensaje a Manuel deja de ser papeleo: hay
**32.600 clientes reales** con teléfonos, correos, **carnets de conducir** y relaciones familiares.
El **contrato de encargado de tratamiento (`docs/CONTRATO-ENCARGADO-TRATAMIENTO-MANUEL.md`) pasa a ser
lo más urgente del traspaso**, por delante de cualquier decisión técnica.

### Veredicto free vs. Pro: **FREE**, y ahora medido

- BD total del proyecto: **92 MB** (el panel dice 112 MB: incluye WAL y overhead).
- Las dos tablas gordas son `clientes` (38 MB) y `polizas` (22 MB); el resto no llega a 3 MB cada una.
- El schema `public` a trasladar ronda los **~75 MB**. Sobre los ~180 MB que ocupa `central` hoy,
  quedaría en **~255 MB de 500 MB**. Cabe holgado. **La estimación de ~200 MB era casi triple de la real.**
- Egress 36 MB de 5 GB. No hay presión por ningún lado.

### Lo que NO hay (y por tanto no hay que migrar)

| | |
|---|---|
| **Edge Functions** | **Ninguna** |
| **Buckets de Storage** | **0**, y **0 objetos** |
| **`pg_cron`** | **No instalada** → cero tareas programadas en la BD |
| **Triggers** | **0** |
| **Vistas / vistas materializadas** | **0 / 0** |
| **Secuencias** | **0** (todo son UUID, no hay contadores que resincronizar) |
| **Secretos en Vault** | **0** |

Extensiones realmente instaladas: `pgcrypto`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements`,
`plpgsql` y **`vector` 0.8.0 (pgvector) en `public`** — esta última la usa `whatsapp_kb_chunks`, así
que **hay que asegurarse de que `vector` está disponible en `central` antes de restaurar**.

### 🚩 Los tres asuntos que decide Alberto, no la sesión

1. **RLS: 86 políticas, y RLS activo en las 52 tablas.** El aislamiento multi-tenant del CRM
   (`correduria_id`) vive **en las políticas RLS**, no en el código. Pero `prisma_seguros` se creó con
   **`BYPASSRLS`** (como el resto de roles de la casa) → **al conectar la app, las 86 políticas dejan de
   aplicarse y nadie se entera: no falla, simplemente deja de aislar.** Es el patrón de fallo silencioso
   que más caro sale. Hay dos salidas y hay que elegir a conciencia: (a) `prisma_seguros` **sin**
   BYPASSRLS y se conservan las políticas, o (b) con BYPASSRLS y el aislamiento pasa al código de la app.
   Hoy la correduría es un solo tenant (`corredurias` = 1 fila), así que el riesgo es bajo *ahora* —
   pero la decisión se toma antes de restaurar, no después.
2. **Autenticación: `auth.users` = 9 usuarios, los 9 han entrado alguna vez.** Con nueve, la bifurcación
   se resuelve sola: **re-plataformar al patrón de la casa** (tabla propia + cookie + `jose`, como
   `apps/mariscos`) sale más barato que migrar `auth.users`. ⚠️ Ojo al descuadre: `public.usuarios`
   tiene **17** filas frente a 9 en `auth.users` — hay 8 usuarios lógicos sin cuenta de acceso, o
   bajas. Mirarlo antes de dar la lista por buena.
3. **Cero claves foráneas en 52 tablas.** La integridad referencial está en el código, no en la BD.
   Para el volcado es buena noticia (no hay orden de carga que respetar); como herencia, es deuda que
   conviene conocer antes de construir encima. **132 funciones en `public`** sí viajan en el dump, pero
   hay que revisarlas: si alguna usa `auth.uid()`, depende del Supabase Auth que estamos quitando.

### Lo que sigue sin saberse

- **Dónde viven los documentos.** Storage está vacío, pero existen `bien_documentos`,
  `poliza_documentos`, `solicitud_cambio_documentos` (4 filas) y `cima_ficheros` (125). Esta última
  guarda **metadatos** (`nombre_fichero`, `xml_hash`, `zip_entry_count`), no el binario. Así que
  «0 buckets» significa **«los ficheros no están en Supabase»**, no «no hay ficheros»: hay que
  averiguar a dónde apuntan antes de apagar nada de Manuel.
- **Los crons y las integraciones**, que viven en su Vercel (el comentario de una tabla menciona un
  «vencimientos-detector»). Sigue haciendo falta la invitación a Vercel, o al menos los nombres de las
  variables de entorno.
- **El código**: sigue bloqueado (`add_repo` cross-tier). Vía Chrome o ZIP.

### Rastro de su forma de trabajar (útil para leer el código)

Los comentarios de tabla citan tickets **`LOO-xxx`** (Linear) y normas españolas por su nombre:
`lds_consent` referencia la **Ley de Distribución de Seguros art. 19** y el **RDLeg 6/2004 art. 173**;
`cotizaciones_anonimas` describe un «flipped funnel» con TTL de 7 días. Hay integración con **CIMA/EIAC**
(el estándar de intercambio con aseguradoras), con **Codeoscopic** (7 tablas `codeoscopic_*`) y un canal
de **WhatsApp** con base de conocimiento vectorial. No es un CRM genérico: es software de correduría.

---

## 💸 Cómo se corta la duplicidad de pagos, y por qué NO hace falta API ni conector (26/08/2026)

> **Contexto que lo simplifica todo (dicho por Alberto, 26/08/2026): Manuel es su hermano y TODO está a
> nombre de Alberto** — los contratos, Codeoscopic incluido. **Queda cerrado el riesgo contractual** que
> este documento marcaba como «puede tumbarlo todo»: no hay que renegociar nada con Avant2, ni hay
> conflicto de intereses. Esto no es un traspaso entre proveedor y cliente: es mover de sitio algo que
> ya es suyo, y el objetivo declarado es **que Manuel deje de pagar duplicidades**.

### La pregunta: ¿API a medida, conector MCP, o acceso a su Vercel?

**Ninguna de las dos primeras.** Y el motivo es que resuelven un problema que ya está resuelto:

| Opción | Veredicto |
|---|---|
| **Que Manuel monte una API y nosotros «chupemos» los datos** | ❌ **Innecesario.** Ya tenemos **lectura completa** de su Supabase por el `project_id`. Los datos ya se leen hoy. Montar una API sería trabajo nuevo **para él** que replicaría peor lo que ya funciona: fila a fila, en JSON, y perdiendo tipos, índices y constraints |
| **Un conector MCP enchufado a su proyecto** | ❌ **Lo mismo, con más pasos.** Un MCP sirve para *mirar*, y para mirar ya estamos dentro. Y para *copiar*, la herramienta es `pg_dump`, que se lleva el esquema entero de una vez |
| **El código por ZIP** | ✅ **Lo más simple que existe.** Dos carpetas comprimidas por el canal que quiera. **15 minutos de su tiempo**, cero infraestructura nueva |
| **Acceso/transferencia de su Vercel** | ✅ **Lo que de verdad corta el gasto.** Ver abajo |

🚨 **La clave: lo que falta NO son datos, es código.** Los datos ya los tenemos. Cualquier solución
pensada para «traer los datos» —API, MCP, sincronización— está atacando el problema equivocado.

### El gasto duplicado: qué paga Manuel de verdad

- **Supabase: 0 €.** Su organización está en **plan FREE** (comprobado). La base de datos no le cuesta nada.
- **Vercel: sí paga.** Dice que le obligan a **Pro** (~20 $/mes). Es coherente: los términos de Vercel
  **no permiten uso comercial en el plan Hobby**, y esto es una correduría facturando. Además, Hobby no
  admite invitar miembros de equipo — que es justo por lo que la invitación nunca llegó.
- Quedan por confirmar: **dominio propio** y el coste de **WhatsApp Business API**, si lo hay.

**Así que la duplicidad es esencialmente el Vercel.** Y aquí está lo bueno: **Alberto YA tiene un equipo
Vercel en plan Pro** (`pisos-turisticos-projects`). Meter esta app ahí **no añade coste**: el Pro se
paga por miembro, no por proyecto. **En cuanto la app corra en el equipo de Alberto, Manuel cancela su
Pro y la duplicidad desaparece.**

### La ruta más corta, en orden

1. **Manuel comprime dos carpetas** (ingestor EIAC/CIMA + cliente Codeoscopic) y las manda. Y con ellas,
   **la lista de nombres de sus variables de entorno y de sus crons**. *(Si prefiere, el repo entero
   comprimido también vale: lo que no entra en `central` es su historia git.)*
2. **Los valores de los secretos, por gestor de contraseñas** — nunca por WhatsApp ni correo.
3. **Se despliega en el equipo Pro de Alberto**, apuntando ya al Supabase de `central`.
4. **Se verifica en paralelo** contra su sistema, todavía encendido.
5. **Se acuerda fecha y hora del corte**, se apaga el suyo y **Manuel cancela el Pro**.

> **Alternativa que ahorra el paso 3:** Vercel permite **transferir un proyecto** de una cuenta a otra.
> Si se transfiere el suyo al equipo de Alberto, se lleva configuración y variables de golpe. **Pero
> obliga a reconectar el repositorio de git**, así que solo compensa si además se mueve el repo. Con el
> ZIP se llega igual y sin sorpresas.

### 🚨 Lo que ningún ZIP trae: los terceros que apuntan a SU URL

Esto es lo que se olvida en todas las migraciones y revienta el día del corte. Hay proveedores externos
con **la dirección de su despliegue configurada en su propio panel**:

- **Codeoscopic** tiene registrada una URL de webhook suya (lo prueba `codeoscopic_webhook_events`).
- **Meta / WhatsApp Business** tiene registrado su webhook de mensajes entrantes
  (lo prueban `channel_inbound_messages` y las columnas `wa_*` de `corredurias`).
- **Lo que descargue los ficheros de CIMA** puede tener IP o credencial asociada a su lado.

**Cambiar esas URLs se hace en el panel de cada proveedor, no en el código.** Va en la lista del corte,
junto a la fecha — y es el motivo por el que el corte tiene que ser un momento acordado y no un apagón.

---

## 🔌 Las dos integraciones: qué está en la BD y qué NO (26/08/2026)

Alberto lo planteó bien: **la intranet da igual, se rehace**. Lo que no se rehace barato son las dos
conexiones. Esto es lo que se puede afirmar mirando su base de datos.

> **Dato de método:** de las **132 funciones** de `public`, ninguna implementa lógica de Codeoscopic
> ni de CIMA (solo dos guardas de inmutabilidad, `poliza_documentos_reject_update` y
> `poliza_merge_log_reject_modification`). **Toda la integración vive en el código, no en la BD.**
> La base de datos es el destino del dato, no el motor que lo trae.

### 🔴 CIMA / EIAC — está VIVA y alimentándose HOY

| | |
|---|---|
| Estándar | **EIAC 6.0** |
| Compañías conectadas | **4** |
| Ficheros procesados | 125 (86 en estado `confirmed`) |
| Tipos de objeto | **CEF** (certificado) · **POL** (póliza) · **REC** (recibo) · **SIN** (siniestro) |
| Lo que ha metido en la BD | **188 pólizas**, 184 recibos, 96 intervinientes, y **67 de los 67 siniestros** |
| **Último fichero descargado** | **25/08/2026 — ayer.** La última póliza creada es del 24/08 |

🚨 **Esto no es una migración de un sistema parado: es una migración EN CALIENTE.** Hay un proceso
corriendo en el Vercel de Manuel que descarga ficheros de las aseguradoras **todos los días** y los
vuelca aquí. El día que se apague su despliegue, la correduría deja de recibir pólizas, recibos y
siniestros de sus compañías. Eso convierte el punto «no desactives nada» del mensaje a Manuel en el
más importante de todos, y obliga a que el corte tenga **fecha y hora acordadas**, no «cuando acabemos».

Los estados del ingestor (`pending | persisted | confirmed | review | review_salud | deferred | error`)
son la prueba de que **el parser está rodado**: `review_salud` y `deferred` no se diseñan de antemano,
salen de casos reales que fallaron. Rehacer eso desde cero es meses, no semanas.

### 🟡 Codeoscopic (multitarificador) — desarrollada, pero PARADA y sin emisión ejercitada

El esquema describe una integración seria: flujo `cotizacion → preemision → emitida / rechazada /
riesgo_condicionado / vencida / error`, **doble raíl de sincronización** (polling con
`polling_next_at`/`polling_attempts` **y** webhooks con `payload_hash` para deduplicar), control de
idempotencia en el envío (`submit_attempt_id`, `submit_in_flight_at`) y almacenamiento del
**`raw_payload`** de cada precio y cada webhook.

**Pero los datos dicen que no ha llegado a emitir:**

| Tabla | Filas | Qué significa |
|---|---:|---|
| `codeoscopic_projects` | 1 | y su estado es **`cotizacion`**, nunca `emitida` |
| `codeoscopic_prices` / `offers` | 15 / 15 | cotizar sí funciona |
| `codeoscopic_participants` | **0** | los intervinientes de emisión, sin estrenar |
| `codeoscopic_product_forms` | **0** | los formularios de preemisión/emisión, sin estrenar |
| `codeoscopic_documents` | **0** | ni pólizas, ni recibos, ni SEPA, ni IPID descargados |
| `codeoscopic_webhook_events` | 2 | uno de tipo `emision_ok` |
| **Último proyecto** | **29/07/2026** | lleva **casi un mes parada** |

⚠️ **Cero filas no prueba que el código no exista** — prueba que **no se ha ejercitado**. Puede estar
escrito y sin probar, o probado en un entorno de pruebas que no es este. Pero cambia la conversación:
antes de dar por hecho que «la emisión ya está», hay que verla funcionar. **La cotización sí está
demostrada; la emisión no.**

> 💡 **Lo que salva el día si el código no llegara:** guardan el `raw_payload` crudo de cada respuesta.
> Aunque no consiguiéramos una línea de su código, esos payloads **documentan el formato real de la API
> de Codeoscopic** mejor que cualquier manual. Eso ya está en nuestra copia.

### 🔑 Credenciales: parte están en la BD, no solo en Vercel

`corredurias` tiene columnas **`wa_access_token`, `wa_phone_number_id`, `wa_business_account_id`** —
credenciales de WhatsApp Business **dentro de la tabla**. Hoy están a NULL (0 filas con token), así que
el dump no arrastra nada, pero **hay que tratar esa columna como campo de secreto** en el traspaso y en
cualquier exportación futura. Y confirma que el inventario de credenciales no se agota en los envs de
Vercel: hay que mirar también dentro de la base.

### ➡️ Lo que esto cambia en la petición a Manuel

No hace falta el repositorio entero, ni la transferencia, ni pelearse por el historial. **Hacen falta
cuatro cosas concretas**, y son mucho más fáciles de conceder:

1. **La carpeta del cliente de Codeoscopic** — endpoints, autenticación, y el mapeo de formularios por
   producto/compañía. Y la respuesta a: *¿la emisión llegó a probarse?*
2. **La carpeta del ingestor EIAC/CIMA** — cómo se descargan los ficheros (¿SFTP, portal, API de
   TIREA?), el parser del ZIP/XML y las reglas de conciliación. **Es la pieza más valiosa del traspaso.**
3. **La lista de variables de entorno** (solo nombres aquí; los valores por gestor de contraseñas) y
   **la lista de crons** de su Vercel — ahí está el «vencimientos-detector» que dispara
   `ofertas_automaticas` a 30/15/7 días del vencimiento.
4. **Una fecha y hora acordadas para el corte**, por lo de CIMA.

### 🧾 Y lo que no es técnico y puede tumbarlo todo

- ~~**Codeoscopic/Avant2 es un contrato de licencia** y hay que saber a nombre de quién está.~~
  ✅ **RESUELTO (26/08/2026): está todo a nombre de Alberto**, Codeoscopic incluido. Manuel es su
  hermano y desarrolló el proyecto adelantándoselo; no hay tercero con quien negociar.
- **CIMA/TIREA va asociada a la clave de mediador**, que es de la correduría — es decir, de Alberto.
  Esa parte no tiene sorpresa contractual, pero hay que confirmar con qué credenciales se está
  descargando hoy.

---

## 🏷️ Cómo se llama cada cosa (y por qué no todo igual)

| Pieza | Nombre | Por qué |
|---|---|---|
| Vertical / carpeta / proyecto Vercel | **`apps/asegura`** | Es la **marca** del negocio, «Grupo Asegura». Y la carpeta ya existe con su SQL aplicado (PR #1489): renombrarla ahora sería churn sin ganancia |
| Schema de la BD | **`seguros`** | **Ya creado y aplicado** en `central`. Es el **dominio**, no la marca: si mañana la marca cambia, el schema no se toca |
| Rol de BD de la app | **`prisma_seguros`** | Ya creado (inerte, sin contraseña). Renombrar un rol vivo por estética no se hace |
| Módulo compartido, si aparece | **`packages/module-seguros`** | Los módulos van por dominio (`module-pesca`, `module-flota`), no por marca |
| Secreto de sesión | **`ASEGURA_SESSION_SECRET`** | Los envs van por app |

> **La confusión de fondo, dicha una vez:** «Asegura» es el **cliente/marca** y «seguros» es el
> **dominio**. Ambos nombres son correctos, cada uno en su capa. Lo que estaba mal era tener dos
> documentos usándolos como si fueran dos proyectos distintos.

## Qué es esto

Manuel Suárez desarrolló, en **su** cuenta de Supabase y **su** cuenta de Vercel, un CRM de correduría
de seguros prácticamente terminado, con integraciones ya hechas contra proveedores externos. El negocio
es de Alberto, así que el desarrollo tiene que cambiar de dueño: datos a la Supabase de Alberto,
despliegue a su equipo de Vercel, y código dentro del monorepo.

**Sí es posible y no exige que Manuel reescriba nada.** Son tres activos independientes, cada uno con
su vía.

| Activo | De dónde | A dónde | Mecanismo |
|---|---|---|---|
| Datos + esquema | Supabase de Manuel | `central` (`wswbehlcuxqxyinousql`) → schema **`seguros`** | `pg_dump` → `psql` en tubería directa (ver «¿MCP o API?») |
| Código | repo de Manuel | `apps/asegura` del monorepo | copia del árbol de trabajo, **sin historia git**; el repo original se transfiere y se archiva aparte |
| Despliegue | Vercel de Manuel | proyecto nuevo en `pisos-turisticos-projects` | Root Directory `apps/asegura` |
| Credenciales de proveedores | envs de Manuel | envs del proyecto Vercel nuevo | lista de nombres + **rotación** |

### Decisiones ya tomadas (20/08/2026)
1. **Schema `seguros` dentro de `central`**, no un proyecto Supabase aparte. Lo manda `MATRIZ.md`:
   una sola BD para todo el holding (dos proyectos = doble cobro y consolidación imposible).
2. **Vertical nueva `apps/asegura`** con su proyecto Vercel propio, patrón `apps/mariscos`.
3. **Free vs. Pro de Supabase se decide midiendo el dump real**, no con la estimación de los ~200 MB.
4. **NO se transfiere el proyecto Supabase de Manuel.** Sería un segundo proyecto (rompe el punto 1) y
   exigiría meterle como miembro de la organización que contiene TODOS los datos del holding. Se copia
   el contenido y él borra el suyo después.

> **Por qué un segundo proyecto Supabase no es «gratis» aunque el free permita dos.** Cuesta 0 €/mes,
> sí, pero: (a) **un proyecto free se pausa solo a los 7 días de poca actividad** —una correduría que
> se consulta a ratos se apaga sola, y recuperarla es manual, con ventana de 90 días—; (b) los límites
> del free (5 GB de egress, cuotas) son **por organización**, así que dos proyectos no dan el doble:
> se reparten y suman puntos de fallo; (c) sin joins contra `movimientos_bancarios` / `cuentas` /
> `negocios` la consolidación es imposible, y hay que duplicar roles, backups, migraciones y envs.
> **Cuándo sí tocaría proyecto aparte:** si la correduría se vendiera o se separara del grupo, o si un
> requisito legal obligara a aislar los datos. Hoy no es el caso.

### Punto de partida verificado (20/08/2026)
- Supabase: una sola organización (`fzagbwkkzfjlsvflkkvn`), **plan FREE**, un solo proyecto `central`.
  Uso ≈ **180 MB** de 500 (`public` 151 MB · `iarest` 22 MB · `rrhh` 1,5 MB). `cron` y `net` ya instaladas.
- Vercel: equipo `pisos-turisticos-projects` (`team_f4gPpt6dPuNcd5YyMt3q27uf`).
- En el repo, `apps/asegura/` existe pero **solo contiene su SQL de cimientos** — no hay app Next.js
  todavía, ni `package.json`, ni `CLAUDE.md` propio.

### ✅ Hecho ya en `central` (19/08/2026, PR #1489) — sin depender de Manuel
- **Schema `seguros` creado** y **rol `prisma_seguros`** (LOGIN + BYPASSRLS, **sin `CREATE`**), en
  `apps/asegura/prisma/sql/2026-08-19_asegura_bootstrap.sql`. Aplicado por MCP y verificado.
- El rol está **inerte a propósito: sin contraseña**. No puede conectarse hasta que Alberto ejecute
  `ALTER ROLE prisma_seguros WITH PASSWORD '…'`. Sobre `public` solo tiene **SELECT** de `cuentas`,
  `sociedades` y `negocios` (mínimo privilegio, lección de `prisma_almacen`).
- **Cero tablas.** Y eso es «sin inventariar», no «no hay»: el modelo de datos vive en el sistema de
  Manuel. La Fase 1 es la que lo cierra.

### 🚧 Frontera con lo que YA existe (no confundir, no duplicar)
`apps/plataforma` ya tiene `/correduria` + `lib/correduria.ts` + `app/api/correduria/*` + CIMA/TIREA.
Eso es la **contabilidad de las comisiones cobradas** de ASegura S.L. (CS-F/0170), derivada del banco
(`movimientos_bancarios`, `destino='seguros'`, siempre BBVA). **No se toca en este traspaso.**

Lo de Manuel es la **operativa**: clientes, pólizas, siniestros, vencimientos, integraciones con
aseguradoras. Conviven. Que plataforma consolide leyendo `seguros.*` (como ya hace con `rrhh.*`) o por
puerto HTTP es una **fase posterior**, fuera del alcance del PR de traspaso.

**Lo que esa fase posterior arregla, para no perderlo de vista:** hoy `/correduria` **adivina la
compañía por el concepto bancario** y arrastra una fila «Otras» poco fiable. Con la cartera real
cargada deja de adivinar: se cruza cada ingreso contra las pólizas. Es la ganancia concreta del
traspaso para lo que ya existe — pero se hace **después** de que los datos estén dentro y verificados,
no durante.

---

## 🔌 ¿Hace falta montar un MCP o una API para copiar los datos?

**No, y conviene no hacerlo.** Son dos necesidades distintas y cada una ya tiene su herramienta:

**Para MIRAR (inventario, Fase 1) → el MCP de Supabase que Alberto YA tiene.**
No hay que construir nada. El conector de Supabase de Claude lista *todos* los proyectos de la cuenta,
en cualquier organización. Así que basta con que **Manuel invite a Alberto a SU organización de
Supabase** (*Organization → Team → Invite*). En cuanto acepte, el proyecto de Manuel aparece en
`list_projects` y Claude puede hacer `list_tables`, `execute_sql`, `get_advisors`, ver migraciones y
funciones — sin que viaje ninguna contraseña por WhatsApp.

Con rol **Read-only** basta para *mirar*; con **Administrator** (opción A de abajo) además se hace todo
lo demás sin volver a molestarle. Esa es la única diferencia entre las dos opciones.

Es exactamente la dirección segura del favor: **Alberto entra en la organización de Manuel**, no al
revés. Meter a Manuel en la organización de Alberto le daría acceso a `central`, que contiene los datos
de TODO el holding. Y Manuel puede revocarlo con un clic cuando acabemos.

**Para COPIAR (Fase 2) → `pg_dump | psql`, no un MCP ni una API.**
Un conector o un endpoint a medida haría el traslado fila a fila y en JSON: tardaría muchísimo más y
—lo importante— **perdería lo que no son filas**: tipos, índices, claves foráneas, secuencias (los
contadores de los IDs), constraints, triggers, funciones y vistas. Habría que reconstruir todo eso a
mano y descubrir lo que falta en producción. `pg_dump` se lo lleva entero en un solo comando, que es
justo el trabajo que ya está resuelto.

**Una API de sincronización solo tendría sentido si los dos sistemas fueran a convivir** alimentándose
en paralelo durante un tiempo. No es el caso: esto es un corte único: se copia, se verifica, y el
sistema de Manuel se apaga.

Resumiendo: **invitación a su organización para inspeccionar + `pg_dump` para el traslado.** Cero
código nuevo de fontanería.

---

## 🧩 GitHub: el repo externo, y por qué NO se hace igual que Supabase y Vercel

### Estado real del acceso (comprobado, no supuesto)

| Cosa | Estado |
|---|---|
| El repo | **`manuelsuarez/asegura`** en GitHub. **787 commits, 258 ramas**, suite e2e, tickets de Linear (`LOO-xxx`), desplegado en `asegura.vercel.app`. No es un prototipo: es un proyecto con historia |
| Invitación a Alberto | Enviada el **12/08/2026** (correo de `noreply@github.com`) como colaborador. Sin confirmar que esté aceptada — el repo no aparece entre los accesibles (ver «Estado de los tres accesos», 26/08/2026) |
| Acceso de Claude a ese repo | **NO, y no se puede arreglar desde aquí.** La app de Claude solo está instalada en `albertosuarezgutierrez-gif`, y una sesión no admite añadir repos de otro dueño (`add_repo` → *cross-tier adds are not supported*) |

**El rodeo mientras siga bloqueado:** `docs/ASEGURA-PROMPT-CHROME.md` es un prompt listo para que
**Claude Chrome** saque el inventario del repo por el navegador —Alberto sí entra como colaborador— y
lo devuelva aquí. No sustituye al acceso real, pero desbloquea el inventario sin esperar a Manuel.

**Y un dato que falta y decide bastante:** **en qué plataforma se desarrolló** (Lovable / Bolt /
Base44 / Replit / Next.js a mano). Determina si el Supabase es de Manuel o es el que le da la
plataforma, y si el código exportado es directamente usable o hay que reescribir el andamiaje.

### Por qué el código no viaja como repo


Los otros dos activos se **copian**. El código **no se transfiere como repo**: entra como carpeta
`apps/asegura` dentro de `central`. Un repo suelto más sería justo lo contrario de la matriz — ya pasó
con `house-sevillana-landing`, que vivía fuera y por eso era invisible al leer el monorepo.

Y hay una regla dura: **se importa el árbol de trabajo, SIN la historia git.** Precedente del
12/08/2026: la historia de `house-sevillana-landing` contenía una `service_role` de Supabase. Un
`clone` + merge arrastraría toda la historia de Manuel, y **un secreto borrado de un fichero sigue
vivo en los commits antiguos**. Borrarlo después no arregla nada: una clave publicada está quemada
aunque luego borres el repo.

**Qué hacer con su repo original, entonces:** que **lo transfiera a la cuenta de GitHub de Alberto**
(*Settings → Transfer ownership*) y ahí se deja **privado y archivado** como museo consultable — fuera
de `central`, sin contaminar el monorepo.

🚨 **Pero AL FINAL, no al principio:** transferir el repo rompe la conexión git de su proyecto de
Vercel y le tumba el despliegue. Mientras el traspaso no esté verificado, su sistema tiene que seguir
en pie (es la comparación lado a lado de la verificación). Así que primero acceso de LECTURA, y la
transferencia como último paso. Si no quiere o no puede transferirlo (repo dentro de una organización
suya, por ejemplo), se pierde el museo, no el traspaso: a `central` solo entra el árbol de trabajo.

⚠️ Al transferirlo, los secretos de su historia pasan a la cuenta de Alberto. Da igual: se rotan
igualmente (Fase 4) y el repo queda privado y archivado.

**Revisar antes de archivar:** si su repo tiene GitHub Actions o *repository secrets*, no viajan a
`central` (que tiene su propio CI). Comprobar si algún workflow hace algo imprescindible — un deploy,
un cron, una sincronización — antes de darlo por muerto.

---

## 📩 Qué pedirle a Manuel

> ✅ **ENVIADO por WhatsApp el 20/08/2026** (lo envió Alberto). La Fase 0 deja de ser el bloqueo:
> ahora se espera respuesta de Manuel. El texto se conserva abajo tal cual se mandó, como referencia
> de qué se le pidió exactamente.
>
> 📄 **Falta entregarle el documento que le promete el punto 6**: el contrato de encargado de
> tratamiento. Borrador en **`docs/CONTRATO-ENCARGADO-TRATAMIENTO-MANUEL.md`** — pendiente de rellenar
> quién firma como responsable, de revisión por la asesoría, y del visto bueno de Alberto antes de
> enviarlo (regla del repo: ninguna comunicación a terceros sin autorización para ese envío concreto).

### Lo más fácil para Manuel: que dé ACCESO, no que haga TAREAS

Casi todo lo que hay que hacer puede hacerlo Alberto con Claude **si tiene acceso**. Convertir cada
paso en una tarea para Manuel es lo que alarga el traspaso semanas: hay que explicárselo, esperarle,
y si sale mal, repetir. Por eso la **opción A es la recomendada**: son **tres invitaciones y se acabó**.

| | Opción A — tres invitaciones | Opción B — lista de tareas |
|---|---|---|
| Trabajo de Manuel | ~5 minutos, sin tocar SQL | 1-2 horas repartidas en días |
| Idas y venidas | ninguna | una por cada paso |
| Cuándo usarla | por defecto | solo si no quiere dar ese acceso |

---

### ✅ Opción A — recomendada

🚨 **El orden importa: la transferencia del repo va LA ÚLTIMA.** Transferir el repositorio de GitHub
rompe la conexión git de su proyecto de Vercel, así que **le tumba el despliegue en ese momento**. Eso
choca de frente con «no desactives nada hasta que confirme». Así que el repo se pide **al final**, ya
verificado el traspaso; mientras tanto, acceso de lectura y basta.

**Mensaje:**

Hola Manuel:

Vamos a llevar el CRM de la correduría a mi propia infraestructura, para integrarlo con el resto de mis
negocios. Para que no te lleve tiempo, lo más práctico es que me des acceso y lo hago yo:

1. **Supabase** — invítame a tu organización (*Organization → Team → Invite*) con rol
   **Administrator**, a `alberto.suarez.gutierrez@gmail.com`. Con eso saco yo la copia de la base de
   datos sin pedirte nada más. Lo revocas cuando acabemos.
   *(Si en esa organización tienes proyectos de otros clientes, no me invites: dime y lo hacemos de
   otra forma — no necesito ver nada tuyo que no sea esto.)*
2. **GitHub** — añádeme como colaborador con permiso de lectura, para copiarme el código.
3. **Vercel** — invítame a tu equipo, para ver las variables de entorno y la configuración del dominio
   sin que tengas que copiármelas a mano. *(Si tu cuenta es del plan gratuito y no te deja invitar,
   dímelo y me pasas los nombres de las variables; los valores por gestor de contraseñas.)*

Y tres cosas más:

4. **No borres ni desactives nada** — Supabase, Vercel ni el repo — hasta que yo te confirme que está
   todo verificado funcionando en mi lado. Te aviso expresamente.
5. **Al final del todo**, cuando ya te haya confirmado que funciona, transfiéreme el repositorio
   (*Settings → Transfer ownership*). Lo dejo archivado por si algún día hace falta consultar el
   historial. Lo dejo para el final a propósito, porque al transferirlo se te desconecta el despliegue
   de Vercel.
6. **Protección de datos.** Son datos personales de clientes reales, así que necesitamos dejar por
   escrito el contrato de encargado de tratamiento, la fecha de entrega y el borrado posterior de tu
   copia. Te paso el documento.

Si algo de esto no te encaja, dímelo y lo hacemos al revés: me pasas tú las copias y yo te voy pidiendo
lo que falte.

Gracias,
Alberto

**Qué desbloquea cada acceso (lo hace Claude, no Manuel):**

| Acceso | Lo que pasamos a poder hacer solos |
|---|---|
| Supabase Administrator | Crear el rol de lectura · `alter schema public rename to seguros` · lanzar backup · `pg_dump` · ver Edge Functions y sus secrets · listar buckets · comprobar si usa `auth.users` · ver `cron.job`, RLS, funciones y triggers |
| GitHub lectura | El código completo sin depender de un ZIP suelto ni de que él lo prepare |
| Vercel (miembro de equipo) | Leer los **valores** de las variables de entorno, la config del dominio y qué integraciones externas hay cableadas de verdad |
| GitHub transferencia (al final) | El historial, archivado fuera de `central` |

Con eso, **la Fase 1 entera y el inventario dejan de necesitar a Manuel.**

### ⚠️ Tres motivos legítimos por los que puede no poder — y qué hacer

No son excusas; son límites reales. Conviene anticiparlos para no quedarse bloqueado esperando:

| Si… | Por qué | Alternativa |
|---|---|---|
| Su organización de Supabase tiene **proyectos de otros clientes** | Invitar a Alberto como Administrator se los expondría. Es una razón profesional para negarse, no cabezonería | Que mueva **solo este proyecto** a una organización nueva vacía (*Project → Settings → General → Transfer*) y ahí sí invite; o que se quede en la opción B (cadena de lectura) |
| Su **Vercel es plan gratuito** (Hobby) | Las cuentas personales de Vercel no admiten miembros de equipo; invitar exige plan de pago | Que copie la lista de nombres de las variables, y los valores por gestor de contraseñas. Es lo único de la opción B que no se puede evitar |
| El repo está en **una organización de GitHub** suya, o lo quiere para su portfolio | Transferir un repo de una organización necesita permisos de la organización, y puede que no quiera desprenderse de él | Lectura y ya: se copia el árbol de trabajo (que es lo único que entra en `central`) y se renuncia al historial. Se pierde el «museo», no el traspaso |

Regla general: **ninguna de las tres es bloqueante.** Si falla una, se sustituye por su fila de la
opción B y el traspaso sigue.

---

### 🅱️ Opción B — si prefiere no dar ese acceso

Entonces sí hay que pedirle cosas concretas. Es el mismo traspaso, más lento:

1. **Invitación de solo lectura a su organización de Supabase** (lo mínimo, para poder inspeccionar el
   esquema sin contraseñas por mensaje).
2. **Cadena de conexión de lectura** para el volcado (*Settings → Database → Connection string*, modo
   Direct, puerto 5432). Que no dé la de `postgres`; que cree un rol:
   ```sql
   create role traspaso_lectura login password '<una contraseña larga>';
   grant usage on schema public to traspaso_lectura;
   grant select on all tables in schema public to traspaso_lectura;
   grant select on all sequences in schema public to traspaso_lectura;
   ```
   Que la mande por gestor de contraseñas, **no por correo ni WhatsApp**.
3. **Renombrar el schema** justo antes del volcado definitivo, tras lanzar backup desde el panel:
   ```sql
   alter schema public rename to seguros;
   create schema public;
   ```
   Si no quiere tocarlo, lo resolvemos por nuestro lado (Fase 2, plan B).
4. **El código**: acceso de lectura al repo, o un ZIP del árbol de la rama desplegada. **No hace falta
   el historial** para el traspaso; si además quiere cedérselo, la transferencia del repo se pide **al
   final**, nunca ahora (le tumbaría el despliegue de Vercel).
5. **Inventario por escrito de lo que no viaja en un `pg_dump`** — esto es lo caro de su tiempo, y es
   justo lo que la opción A nos deja averiguar solos:
   - **Edge Functions** desplegadas (cuáles, su código, qué *secrets* usan).
   - **Buckets de Storage**: nombres, si son públicos, tamaño aproximado.
   - **Autenticación**: ¿Supabase Auth (`auth.users`) o tabla propia? ¿Cuántos usuarios reales?
     ¿Login con Google / magic link?
   - **Tareas programadas** (`pg_cron`) y **webhooks** configurados.
   - **Integraciones externas**: qué proveedor, qué endpoints, qué credencial y con qué nombre de
     variable de entorno.
   - **Variables de entorno de Vercel**: lista de nombres aquí, **valores por canal aparte**.
   - Dominio propio, si lo hay, y dónde está registrado.
6. **No borrar nada** hasta confirmación, y **contrato de encargado de tratamiento** (igual que en A:
   estos dos puntos no son negociables en ninguna de las dos opciones).

---

### 📝 Mensaje pendiente para Manuel — BORRADOR, SIN ENVIAR (26/08/2026)

Tercera versión, ya sabiendo que **es su hermano, que todo está a nombre de Alberto y que el objetivo
es que deje de pagar**. Se le pide poco y se le quita un gasto. **No se manda hasta que Alberto dé el
visto bueno a este envío concreto** (regla del repo sobre comunicaciones a terceros):

> Manuel, ya estoy dentro de la base de datos y he visto todo. Te escribo para pedirte poco y para que
> dejes de pagar el Vercel.
>
> **Los datos no me hacen falta que me los pases**: los leo yo directamente de Supabase. No montes
> ninguna API ni ningún conector, sería trabajo tuyo para algo que ya funciona.
>
> **La intranet tampoco**: esa la rehago yo.
>
> Lo único que necesito son **dos carpetas del código**: el ingestor de EIAC/CIMA y el cliente de
> Codeoscopic. Comprímelas y mándamelas (o el repo entero comprimido, me da igual). Con eso:
>
> - **la lista de nombres de tus variables de entorno** y **la de tus tareas programadas** — los
>   valores de las contraseñas mándalos por gestor de contraseñas, no por WhatsApp;
> - y dime **cómo se descargan los ficheros de las compañías**: ¿SFTP, portal, API de TIREA?
>
> Luego lo despliego en mi equipo de Vercel, que ya es Pro y no me cuesta más por meter un proyecto:
> **en cuanto esté funcionando, cancelas tu Pro y te quitas ese gasto.**
>
> Dos cosas importantes antes:
>
> 1. **No apagues nada todavía, y avísame antes de hacerlo.** He visto que CIMA descargó ficheros ayer
>    mismo: tu despliegue está alimentando la correduría todos los días. Lo cortamos con fecha y hora,
>    los dos delante.
> 2. Cuando cortemos hay que **cambiar las URLs que tienen apuntadas Codeoscopic y WhatsApp/Meta en sus
>    paneles**, que ahora van a tu despliegue. Eso no viaja en el código; lo hacemos ese día.
>
> Y una curiosidad para saber por dónde ando: **la emisión de Codeoscopic, ¿llegó a probarse?** En la
> base solo veo cotizaciones, ninguna póliza emitida por ahí.

## Fase 1 — Inventario y medición (antes de tocar nada)

Con el acceso a su organización (opción A o B), a través del conector de Supabase, desde una sesión
de Claude:

```sql
-- Tamaño real por tabla (los ~200 MB son una estimación sin verificar)
select relname, pg_size_pretty(pg_total_relation_size(c.oid)) as tamano, n_live_tup
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_stat_user_tables s on s.relid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc;
```

Además: extensiones instaladas, políticas RLS, funciones, triggers, `cron.job`, y si hay filas en
`auth.users`.

**Lo que decide esta fase:**
- **Dato vivo vs. grasa** (logs, auditorías, colas, snapshots). De ahí sale el veredicto free vs. Pro
  (25 $/mes) que Alberto dejó abierto. Recordatorio del 19/08: el límite que aprieta de verdad **no es
  el disco, es el egress**.
- **Autenticación.** Si su CRM usa Supabase Auth, hay bifurcación: `central` **no la usa en ninguna
  vertical** — todas autentican contra la tabla `cuentas` con cookie propia + `jose`
  (`apps/mariscos/lib/auth.ts`). Con pocos usuarios reales lo sano es re-plataformar al patrón de la
  casa; con muchos, se migra `auth.users` (las contraseñas sobreviven, las sesiones abiertas no).
  **Es una decisión de Alberto, no se elige sobre la marcha.**

Salida: el inventario se escribe **en este mismo documento**, en una sección nueva al final.

---

## Fase 2 — Migración de la base de datos

Preparación en `central`, como `postgres` (Supabase MCP `apply_migration`):

```sql
create schema if not exists seguros;

-- Rol propio, mínimo privilegio. Molde: apps/almacen/prisma/sql/2026-07-15_almacen_schema.sql
create role prisma_seguros login password '<...>' bypassrls;
grant usage on schema seguros to prisma_seguros;
grant select, insert, update, delete on all tables in schema seguros to prisma_seguros;
grant usage, select on all sequences in schema seguros to prisma_seguros;
alter default privileges in schema seguros
  grant select, insert, update, delete on tables to prisma_seguros;
-- SIN create, y SIN grants sobre `public`.
-- Si sus funciones usan pg_trgm/uuid-ossp: grant usage on schema extensions to prisma_seguros;
```

🚨 **NUNCA conectar la app como `postgres`** (incidente 26/06: resetear esa contraseña tumba a todas
las apps a la vez).

Volcado y restauración, en tubería desde el contenedor de la sesión:

```bash
pg_dump --no-owner --no-acl --schema=seguros \
  "postgresql://traspaso_lectura:<pass>@db.<ref-manuel>.supabase.co:5432/postgres" \
| psql "postgresql://postgres:<pass>@db.wswbehlcuxqxyinousql.supabase.co:5432/postgres"
```

- **Plan B si Manuel no renombra el schema:** volcar su `public`, restaurarlo en un Postgres intermedio
  efímero, `alter schema public rename to seguros;` allí, y re-volcar `-n seguros`.
  🚨 **No usar `sed` sobre `public.` en el dump**: 200 MB de datos reales contienen esa cadena y se
  corrompen filas en silencio.
- **Podar la grasa ANTES de restaurar**, no después: el disco ya estará ocupado y `VACUUM FULL` en
  Supabase no sale gratis.
- Pasada previa con `--section=pre-data` para ver errores de dependencias sin mover 200 MB.
- **El dump NO se commitea nunca.** Son datos personales de clientes.
- **RLS:** Supabase auto-activa RLS en tablas nuevas. `prisma_seguros` tiene `BYPASSRLS`, así que la app
  funciona; cualquier acceso REST/anon verá **0 filas** hasta que existan políticas. Si el código de
  Manuel usa `supabase-js` con la clave `anon`, esto le afecta de lleno.
- **Verificación: contar filas por tabla en origen y destino, la lista completa.** Que el comando no dé
  error no significa que haya migrado todo.

---

## Fase 3 — El código como vertical `apps/asegura`

Molde vivo: `apps/mariscos` (PR #1055). Ficheros obligatorios dentro de `apps/asegura/`:

- `package.json` — deps `@central/*` con **`workspace:*`**, nunca `file:`.
- `vercel.json` — 🚨 **el `ignoreCommand` es obligatorio desde el primer commit.** Sin él, como todos
  los proyectos Vercel cuelgan del MISMO repo, cada push reconstruye TODAS las apps (incidente de
  ~600 US$/mes, PR #904):
  ```json
  {
    "ignoreCommand": "node ../../scripts/vercel-ignore-build.mjs apps/asegura",
    "buildCommand": "prisma generate && next build",
    "installCommand": "npx --yes pnpm@10.33.0 install --no-frozen-lockfile",
    "framework": "nextjs"
  }
  ```
- `next.config.ts` — `transpilePackages` **exactamente igual** a las deps `@central/*` del
  `package.json`, más `outputFileTracingRoot: path.join(__dirname,'..','..')`.
- `tsconfig.json` (`extends ../../tsconfig.base.json`) · `eslint.config.mjs` (sobre
  `../../eslint.config.base.mjs`) · `middleware.ts` con gate de sesión.
- `prisma/schema.prisma` con `schemas = ["seguros","public"]`. Se puede generar con `prisma db pull`
  contra la BD ya migrada en vez de escribirlo a mano.
- `lib/{db,auth,session}.ts` — patrón de `apps/mariscos/lib/`.
  🚨 Secreto de sesión (`ASEGURA_SESSION_SECRET`) **sin fallback a literal**: usar la guarda multilínea
  de `apps/mariscos/lib/auth.ts`, que es la única forma que no dispara `test/regression-secrets.test.ts`.
- `CLAUDE.md` propio — lo exige el guardián `appsSinClaudeMd` (`scripts/auditar-estructura.mjs:397`).

**Importación del código de Manuel:**
- Copia del árbol de trabajo, **sin historia git** — igual que `apps/housesevillana` el 12/08/2026,
  cuya historia contenía una `service_role` de Supabase.
- Antes de commitear, escaneo de secretos sobre lo importado (`eyJ`, `sb_secret_`, `service_role`,
  `sk-`, IBANs). Lo que aparezca **se rota**, no basta con borrarlo del fichero.
- Si usa `supabase-js` con `service_role`, se migra a Prisma con `prisma_seguros` (patrón de la casa).

**Módulo compartido:** si aparece lógica de dominio pura y portable (primas, comisiones, estados de
póliza, vencimientos), baja a `packages/module-seguros` y la app la consume por adaptador, igual que
`apps/ialimp/lib/adapters/crm.ts` implementa el puerto de `packages/module-crm`.

**Registros fuera de `apps/asegura/`** (si falta alguno, la app queda a medias en el sistema — a
`mariscos` todavía le faltan cuatro):

| Fichero | Qué añadir |
|---|---|
| `.github/workflows/tests.yml` (~l.56) | `asegura` en la matriz de `typecheck` |
| `CLAUDE.md` (raíz) | bullet en la lista de verticales |
| `MATRIZ.md` | árbol ASCII (~l.34) **y** tabla de verticales (~l.50) |
| `docs/ESTRUCTURA.md` | fila en la tabla de apps |
| `docs/FUENTES-DE-VERDAD.md` | `apps/asegura/CLAUDE.md` → `apps/asegura/**` |
| `apps/plataforma/lib/estructura.ts` | entrada en el array `VERTICALES` |
| `.claude/skills/central-maestro/SKILL.md` | fila de enrutado + mención en el bloque de BD/roles |
| `.claude/skills/asegura-maestro/SKILL.md` | skill router de la vertical (nueva) |
| `docs/CONTEXTO-SESIONES.md` | entrada de la sesión |
| — | regenerar con `pnpm auditar` |

`pnpm-workspace.yaml`, `.vercelignore` y `scripts/vercel-ignore-build.mjs` **no se tocan**.

---

## Fase 4 — Vercel y proveedores externos

1. Proyecto nuevo en `pisos-turisticos-projects`, **Root Directory `apps/asegura`**, install
   `npx --yes pnpm@10.33.0 install --no-frozen-lockfile`.
2. Envs: `DATABASE_URL` / `DIRECT_URL` por el pooler con el rol propio
   (`prisma_seguros.wswbehlcuxqxyinousql@aws-0-eu-west-1.pooler.supabase.com`, 6543 pooled
   `?pgbouncer=true` / 5432 directa), `ASEGURA_SESSION_SECRET`, y una por integración externa.
3. **Rotar todas las credenciales de proveedores.** Han vivido en la cuenta y el historial de Manuel;
   el traspaso es el momento natural de cambiarlas. Donde el proveedor permita cuenta propia, dar de
   alta la de Alberto en vez de heredar la de Manuel.
4. Lo que sea idéntico a otras verticales va como **Shared Environment Variable de equipo**, no
   duplicado en el proyecto.
5. **Edge Functions**: redesplegar en `central` con sus secrets — no viajan en el `pg_dump`. Igual con
   `pg_cron` y `pg_net` (ambas extensiones ya están).
6. **Storage**: copiar buckets aparte y recrear políticas.
7. Dominio: apuntarlo cuando el despliegue esté verde.

---

## Verificación (antes de dar el traspaso por hecho)

1. **Datos**: recuento de filas por tabla origen vs. `seguros.*`, lista completa. Checksums de las
   tablas críticas (clientes, pólizas).
2. **Conexión real de la app**: `psql` con la cadena de `prisma_seguros` sobre el pooler y
   `select count(*)` en tres tablas. Tiene que funcionar **sin** ser `postgres`.
3. **Repo**: `pnpm test` (guardianes de secretos, scope `@central/*`, estructura generada,
   `vercel-ignore-build`), `pnpm auditar:check`, y el `typecheck` de la matriz para `asegura`.
4. **Build**: preview de Vercel en verde desde `apps/asegura`, y comprobar que un commit que solo toca
   `apps/asegura/` **no** dispara builds de las otras apps.
5. **Funcional**: login, alta de póliza y **una llamada real a cada integración externa** con las
   credenciales rotadas. Una integración que no se ha probado no está migrada, está sin comprobar.
6. **Comparación lado a lado**: la app de Manuel todavía viva junto a la nueva, misma consulta en
   ambas, mismo resultado. **Solo entonces** se le da luz verde para borrar.

---

## Orden de ejecución

```
0. Mensaje a Manuel                 → ✅ enviado 20/08/2026    [esperando su respuesta]
1. Inventario + medición            → sección nueva en este doc + decisión free/Pro
2. Schema `seguros` + rol + volcado → datos dentro de `central`
3. apps/asegura + registros + skill → PR draft
4. Proyecto Vercel + envs rotadas   → preview verde
5. Verificación end-to-end          → luz verde a Manuel
6. Transferencia del repo + archivo → lo ÚLTIMO (le corta el despliegue)
```

**Lo que bloquea hoy es la respuesta de Manuel**, no el mensaje. Lo único que se puede adelantar sin
él es el inventario del repo por Claude Chrome (`docs/ASEGURA-PROMPT-CHROME.md`) y el contrato de
encargado de tratamiento (`docs/CONTRATO-ENCARGADO-TRATAMIENTO-MANUEL.md`).

Las fases 1 y 3 pueden solaparse en cuanto haya acceso. La 2 necesita el volcado definitivo; la 4
necesita la 2 y la 3. **La 6 va después de la 5, siempre**: mientras el traspaso no esté verificado,
su sistema tiene que seguir en pie para la comparación lado a lado.

---

## Riesgos y cobertura

| Riesgo | Cobertura |
|---|---|
| Secretos en el código o la historia de Manuel | Import sin historia + escaneo + **rotación** de lo encontrado |
| Superar el free de Supabase (500 MB) | Medir en Fase 1 y podar antes de restaurar; si no cuadra, Pro |
| Egress, el límite que aprieta de verdad | Vigilar tras el corte; no depende del disco |
| La app escribiendo en `public` por error | `prisma_seguros` sin `CREATE` y sin grants sobre `public` |
| RLS auto-activada dejando pantallas a 0 filas | `BYPASSRLS` en el rol + comprobar cualquier acceso REST/anon |
| Datos personales de clientes (posible art. 9 RGPD) | Contrato de encargado de tratamiento; el dump nunca se commitea |
| Manuel borra su proyecto antes de tiempo | Punto 5 explícito en el mensaje |
| Reconstrucción de las ~10 apps en cada push | `ignoreCommand` desde el primer commit |
