# 🧠 Memoria de sesiones — central (repo GitHub: ia.rest → renombrar)

> Contexto persistente entre sesiones de Claude Code. El entorno cloud es
> **efímero** (el contenedor se borra al acabar), así que lo único que sobrevive
> es lo commiteado aquí. Este archivo es el "estado vivo" del proyecto entre sesiones.
>
> **Cómo se mantiene:** al terminar cada sesión, Claude añade una entrada nueva
> arriba del todo y actualiza el estado si algo cambió. Un hook `Stop`
> (`.claude/hooks/persist-memoria.sh`) commitea y empuja este archivo automáticamente.
>
> **🚨 Regla de tamaño (ahorro de contexto):** cada entrada, **máximo ~8 líneas**:
> qué se hizo, decisiones, pendientes y nº de PR. El detalle ya vive en el PR y en
> el código — NO re-narrarlo aquí. Fecha SIEMPRE en la primera línea `(dd/mm/aaaa)`.
>
> **🔄 Rotación mensual:** aquí vive SOLO el mes corriente. Los meses cerrados se
> archivan en `docs/memoria/AAAA-MM.md` con `node scripts/rotar-memoria.mjs`
> (idempotente; lo dispara `/auditoria-diaria` a primeros de mes). La historia no
> se pierde: se lee de `docs/memoria/` solo cuando hace falta.
>
> **📌 «Estado vivo» (bloque al final):** SOLO pendientes y decisiones abiertas, en
> sub-bullets de 1-3 líneas — no es un segundo diario: el relato de cada sesión va en su
> entrada fechada y el detalle en el PR. Al cerrar un pendiente, borra su bullet; al
> actualizar el bloque, re-fecha su cabecera (si su fecha queda en un mes cerrado, la
> rotación se lo lleva al archivo).
>
> **Formato de cabecera de entrada:** `- **… (dd/mm/aaaa).**` o `### … (dd/mm/aaaa)` —
> son los ÚNICOS que `rotar-memoria.mjs` reconoce como entrada; una cabecera `## ` se
> funde con la entrada anterior y se archiva mal.
>
> Para arquitectura/módulos completos → skill `ia-rest-maestro`. Esto es solo el
> registro de qué se hizo y qué queda.

---

### 💶 (01/09/2026) Comisiones de la correduría: spec del control devengo → liquidación → cobro → renta
- Alberto: «controlar que me pagan lo que me deben y que está ingresado en cuenta», y que el borrador
  del IRPF cuadre. Medido: **hoy el borrador no se cuadra, se COPIA** (hilo Asecon IRPF 2025: «ingresos
  los que aparece en el borrador»). Retención implícita 14,75% → **15% de IRPF, modelo 190**.
- 🚨 **`apps/plataforma/lib/cima.ts` sobra:** SOAP nunca validado (404), parser adivinado y mapa de
  compañías con códigos numéricos cuando los reales son `C0109`/`C0468`/`C0058`/`C0613`. La BD de Manuel
  YA trae `cuenta_efectivo`/`liquidaciones`/`poliza_recibos` parseadas por el JAR de TIREA, con
  **comisión, retención y remesa separadas** (Allianz feb/26: 95,03 − 14,26 = 80,77 exacto).
- El PDF «Cuenta Agente» de Allianz es legible (**EBCDIC dentro del PDF, `cp500`**) y cuadra al céntimo
  con CIMA. Revela **558,88€ parados** por no haber dado la cuenta bancaria. Mapfre devenga 3.614,65€ en
  recibos cobrados y **cero liquidaciones**. Del banco, el **85% de 2026 sin identificar compañía**.
- Spec en `docs/superpowers/specs/2026-09-01-comisiones-renta-control-design.md` (**PR #1947**), con
  `agente-correduria`, `perfil-fiscal` y `apps/asegura/CLAUDE.md` actualizados: comisión tiene TRES
  estados (devengado→liquidado→cobrado) y la cobertura de CIMA es DESIGUAL por compañía. Pendiente:
  plan de implementación, y 5 gestiones con compañías (Allianz cuenta, Generali/Reale/Mapfre CIMA,
  Occident saldos) que **no se envían sin autorización**.

### 🧭 (01/09/2026) asegura-portal: plan TDD de la Fase 1 (entrar + aportar póliza)

- **#1946**: plan de 12 tareas para `apps/asegura-portal` — módulo puro (niveles de acceso, procedencia
  en TRES estados, código de un solo uso), 6 tablas `portal_*`, sesión propia y bóveda con subida de póliza.

- **El canal de OTP es un PUERTO, no una llamada a WhatsApp**: la WABA de Grupo Asegura no existe todavía;
  en Fase 1 se enchufan email y consola y WhatsApp entra añadiendo un fichero.
- 🚨 **Lección de método:** las firmas de `aiComplete`, `openrouterVision` y `createMailTransporter` que
  parecían obvias eran las TRES falsas (`aiComplete` devuelve `string`; `openrouterVision` toma 5 args e
  `ImageInput` es `{data,mediaType}`; `createMailTransporter()` **no recibe credenciales**, las lee del
  entorno y devuelve `Transporter | null`). Comprobarlas contra `packages/*` antes de escribirlas.
- 🐛 **Bug destapado en `scripts/rotar-memoria.mjs`** (no tocado en este PR): la heurística «la fecha real
  es la ÚLTIMA de la cabecera» archiva en agosto la entrada `### 🔴 (01/09/2026) GH_PAT_TRIGGER … desde el
  31/08`. En las cabeceras `### `, la fecha entre paréntesis manda sobre la del texto.

- **Pendiente de Alberto:** elegir modo de ejecución del plan, y la infra (proyecto Vercel `asegura-portal`,
  rol `prisma_asegura_portal` SIN BYPASSRLS con contraseña, envs, WABA).

### 🗄️ (01/09/2026) asegura: estructura del volcado CREADA en `seguros` + el runbook mentía con las FKs
- Alberto: «la copia de la BD, mejor tener todo nosotros». Hecho el 50%: **estructura aplicada y
  verificada en central** (`seguros`): 42 enums, 52 tablas, 721 columnas, 265 índices, 67 constraints
  y 353 NOT NULL — **coincidencia EXACTA con el origen** en los cinco recuentos.
- 🚨 **`docs/TRASPASO-CORREDURIA.md` decía «cero claves foráneas». Hay 131.** Se destapó comparando
  constraints origen (198) vs destino (67). Y la conclusión que sacaba («no hay orden de carga que
  respetar») era al revés. Corregido en el doc. Las FKs van en fichero aparte y **se crean DESPUÉS de
  los datos**: no hay orden topológico posible (hay autorreferencias) y así sirven de verificación.
- DDL **generado desde los catálogos del origen**, no escrito a mano. Tres ficheros en
  `apps/asegura/prisma/sql/2026-09-01_seguros_volcado_{ddl,datos,fks}.sql`.
- Copia de datos: por **`dblink`** (ya instalado en central), server-side. `pg_dump` local es 16.13 y
  el origen 17.6 → se niega. **Bloqueado a falta de UNA cosa:** secreto `asegura_origen_url` en el
  Vault de Supabase de central (lo pone Alberto; nunca por chat). El script lo lee dentro del bloque.
- ⚠️ Sigue vigente: Manuel NO borra hasta verificar **descifrar Y buscar** sobre nuestra copia.

### 🛡️ (01/09/2026) asegura: dos specs (portal + agente de venta) y la cartera NO era lo que decíamos
- Brainstorming con Alberto → specs `2026-09-01-asegura-portal-clientes-empresas-design.md` y
  `2026-09-01-asegura-agente-venta-design.md`. PR #1941.
- 🚨 **Medido: la cartera viva son ~80 clientes / 109 pólizas, no 32.600/28.843.** El resto es volcado
  histórico (`import_ref` `intranet:` 26.117 con vto. 2013-2018 y `asegura_app:` 2.612, CERO con vto.
  futuro). Regla de Alberto: **CIMA (`import_ref IS NULL`) = cliente; el resto, lead** (32.520).
  **Cifra ya corregida** en `CLAUDE.md`, `apps/asegura/CLAUDE.md` y `docs/TRASPASO-CORREDURIA.md`.
- Portal: app nueva `apps/asegura-portal` (rol propio SIN BYPASSRLS) + `@central/module-seguros-portal`;
  schema `seguros`; WhatsApp con **WABA nueva** (`wa_opt_in`=0 en las 32.600). Eje: **«aporta tus seguros»**,
  que sirve a leads y clientes a la vez. El móvil identifica un **HOGAR** (740 números compartidos, 630 con
  el mismo apellido → familias): nunca se resuelve solo. El papel en la póliza PROPONE acceso, no lo concede.
- Agente: de **VENTA**, prepara fichas en frío sin contactar a nadie. Dos corpus con autoridad distinta —
  el contrato dice qué cubre, la **LCS/LDS** qué derechos hay (del texto consolidado del BOE, nunca de
  memoria del modelo). Sin fine-tuning. Techo real: solo **5.613** fichas son contactables.
- Regla que evita un desastre: **las pólizas del volcado histórico NO generan recordatorios** (serían
  28.729 avisos de «se te venció» sobre pólizas de 2013-2018). `recordatorios` del CRM origen no sirve:
  su `poliza_id` es NOT NULL.

### 🚗 (01/09/2026) Renovaciones: columna «Qué asegura» (matrícula, dirección, tipo de RC)
- Alberto, sobre la tabla de renovaciones de `/correduria`: «necesito otra columna con datos — auto
  matrícula marca modelo, hogar dirección, RC de qué tipo… y siempre informa al agente».
- Helper puro nuevo **`@central/module-seguros/objeto`** (`objetoAsegurado`, 17 tests) con **cuatro**
  salidas: `conocido` · `no_informado` (la compañía no lo manda) · `cifrado` (la dirección de hogar
  viene `v1:…`, AES-256-GCM; la clave sigue en el Vercel de Manuel) · `sin_objeto` (vida/salud/decesos
  son seguros de PERSONAS: ausencia definitiva, no «pendiente»). Ninguno se pinta como hueco vacío.
- Medido en la cartera real: `matricula`/`marca`/`modelo` en claro; **`datos_especificos.vehiculo` NO
  es una descripción, contiene la matrícula**; una RC se identifica por sus modalidades
  (`poliza_coberturas`), no por `datos_especificos`. Las 16 pólizas de la ventana salen `conocido`.
- Cableado de punta a punta: `apps/asegura/lib/cartera.ts` (+ intento de descifrado) → puerto
  `/api/operador/vencimientos` → `interpretarObjeto` en plataforma (campo opcional: una versión vieja
  del puerto da `null` = «aún no llega», distinto de «no informado») → columna en `/correduria` y línea
  del Telegram de renovaciones. Skill `agente-correduria` actualizada (SKILL §2 + sector §5).

- **#1938 MERGEADO** (`1ba3c254`, 12 requeridos verdes). El CI volvió a no arrancar en draft: ni abrir
  el PR ni des-draftearlo dispararon nada; lo desatascó **mergear `main` en la rama** (paso 2 del orden
  de `CLAUDE.md`), 5ª medición de esa sección — anotada ahí con la secuencia completa. 🔀 Y el PR de
  seguimiento #1940, abierto IGUAL (MCP, draft, misma identidad), **sí disparó al instante**: el draft
  no es la causa. Sigue sin explicación; lo accionable es el orden, no el diagnóstico.

### 📅 (01/09/2026) mercado-booking: objetivo jul/ago-2027 cumplido — falta quitar la prioridad del prompt
- Pasada acotada (`?desde=2027-07-01&hasta=2027-08-31&max=24`) de la skill `mercado-booking`: 238 comps
  reales en 24 ventanas (3 fechas × 4 pisos por mes) + 4/4 escaparate propio. **El objetivo (≥3
  comparables en ≥3 fechas/piso en jul y ago 2027) ya estaba cumplido desde ayer (31/08)** — esta
  pasada repitió trabajo porque el párrafo "PRIORIDAD TEMPORAL" seguía en el prompt de la rutina.

- **Pendiente para Alberto:** borrar ese párrafo del prompt programado de `mercado-booking` (esta
  sesión no tiene acceso al store del trigger para editarlo ella misma). Detalle en
  `docs/AGENTES-BITACORA.md` (entrada 01/09/2026).

### 🔔 (01/09/2026) Panel «Avisos Telegram» (`/telegram`): catálogo + interruptor por aviso
- Alberto: «las notificaciones de Telegram son muchas… un panel que las resuma y que pueda activarlas
  o desactivarlas». Hecho en `apps/plataforma`: **76 avisos PROACTIVOS catalogados** (`lib/telegram/catalogo.ts`),
  interruptor por aviso y por categoría, y contadores REALES de lo que llega (bitácora, 30 días).
- Los ~57 emisores pasan ahora por `tgAviso`/`tgAvisoBotones`/`tgAvisoAlerta` (`lib/telegram/avisos.ts`).
  **Fail-open**: si la BD no responde, el aviso SALE — un fallo de red no puede volverse silencio.
- Guardián `lib/telegram/catalogo.test.ts`: falla si un id emitido no está catalogado (aviso que no se
  puede callar) o si uno catalogado no lo emite nadie (interruptor que no hace nada). Ni tsc ni build lo cazan.
- Fuera del catálogo a propósito: las RESPUESTAS del bot a un mensaje/botón de Alberto (contable,
  borradores de huéspedes, clasificar movimiento). Silenciarlas rompería la conversación, no quitaría ruido.
- El triaje de correo tiene un interruptor **por categoría** (`avisoDeCategoriaCorreo`). Ya silenciado
  `correo.huespedes` a petición suya (📬 Huésped de Smoobu «Nueva reserva»); los borradores del agente siguen.
- La bitácora nace vacía: el panel dice «aún no se ha medido», nunca «0 avisos». Migración
  `2026-09-01_telegram_avisos.sql` **aplicada**. Purga a 90 días desde el cron `agentes-latido`.

- **#1924 MERGEADO** (`ff136ac0`, 12 requeridos verdes). El CI cazó un `make_interval(days => ${n})`
  sin `::int` (Prisma manda int8 → 42883 SOLO en runtime): guardián `regression-sql-fecha-parametro`.
  ⚠️ Ese guardián enumera con `git ls-files`, así que **no ve ficheros sin `git add`** — la suite
  local daba verde con el bug delante. Haz `git add` antes de dar por buena una suite con archivos nuevos.
- Documentado en `apps/plataforma/CLAUDE.md` (§Panel Avisos Telegram), skills `plataforma-maestro`
  (punto 12) y `correo-triaje`, y `docs/FUENTES-DE-VERDAD.md`.

### 🔴 (01/09/2026) `GH_PAT_TRIGGER` caducado: la radiografía del repo lleva desde el 31/08 sin actualizarse
- El workflow «Auditoría de estructura» falla en TODOS los pushes a `main` desde el 31/08 ~13:25 UTC:
  `gh` responde `HTTP 401: Bad credentials`. El `git push` sí cuela —`actions/checkout` deja un
  `http.extraheader` con el GITHUB_TOKEN que pisa el PAT de la URL—, así que **la rama se sube y el PR
  nunca se abre**: el fallo es mudo salvo por el correo de Actions.
- Efectos medidos: `estructura.generated.json` congelado en `6a4d53c4d` (#1887, 31/08 08:43) y **123 ramas
  `claude/auditoria-radiografia-*` huérfanas** en el remoto (el `gh pr close --delete-branch` tampoco corre).
- 🔴 **Para Alberto: renovar el secret `GH_PAT_TRIGGER`** — un agente no puede. Mientras tanto la radiografía
  se regenera a mano (va en este PR) y las ramas huérfanas siguen ahí, pendientes de barrido.

### 🔌 (01/09/2026) Fly.io: el adapter CIMA se transfirió… y Manuel lo devolvió a su organización
- 08:16 UTC `fly apps move asegura-app-cima-adapter --org grupo-asegura` → OK (48 s). 08:32 UTC Manuel lo
  devolvió a `manuel-suarez-678` (119 s): aceptar la invitación de miembro le bastó para sacarlo. `grupo-asegura`
  quedó vacía. **No es un problema técnico, es una conversación con Manuel** — no se vuelve a mover sin su OK.
- La app no se cayó (`/health` 200 tras ambos moves) y **los ficheros no se pierden en `/tmp`**: los logs de Fly
  cuadran al minuto con `cima_ficheros` (27/08 08:15, 28/08 15:32, 30/08 11:34).
- ❌ Corrección: el fichero CIMA **no** entra «a diario entre 11:35 y 11:42 UTC» (se afirmó y era falso). El horario
  es irregular y el 01/09 (00:00–08:35 UTC) no entró ninguna tanda. Pendiente real: traer el disparador a
  `CRON_JOBS` de plataforma —hoy lo llama infra de Manuel—, que quita la dependencia sin mover infraestructura.

### ✅ (01/09/2026) V4 Flash CONFIRMADO en producción con tráfico real — serie cerrada al 100%
- Sonda diaria 07:00:48 UTC: `plataforma·sonda·openrouter·deepseek/deepseek-v4-flash·ok` →
  no hay override `OPENROUTER_MODEL` en Vercel; el default nuevo sirve en producción.
- Además tráfico de negocio real: `extraer-factura` procesó facturas con el V4 Flash a las
  06:34-06:35, y el Director escala por tarea con normalidad (gemini-flash / gpt-5.6-luna /
  sonnet-4.5). Cabo único de la verificación del 31/08: CERRADO. Nada pendiente de la serie.

### 💶 (01/09/2026) Pasada mensual `fiscal-novedades`: sin cambios en deducciones, 1 aviso a cliente
- Deducciones IRPF (mínimos, maternidad, FN estatal/andaluza) contrastadas contra BOE/BOJA/AEAT: **sin
  cambios**, PGE 2027 aún sin publicar. Radar de ayudas: ayuda Junta Andalucía 600€/hijo<3 tras 3er hijo
  detectada y descartada (renta de Alberto muy por encima del tope 6× IPREM). 1ª pasada por cliente:
  Joaquín Jaén avisado por Telegram del plan de choque hostelería (RD 638/2026, hasta 11.000€, plazo
  30/09/2026, **CNAE sin confirmar** — pendiente de que Alberto/Joaquín lo verifiquen); Sique Brilla sin
  novedad. Detalle en `docs/FISCAL-AYUDAS.md` y `docs/AGENTES-BITACORA.md`.

### 🛡️ (01/09/2026) Nace el agente de la correduría (`agente-correduria`) — decisión de Alberto
- Alberto quiere un agente que lleve Grupo ASegura «casi al 100%» y responda a clientes. Se montó por
  fases: **Fase 0** (aprender sector + informar, activa ya) → emisión Avant2 → cliente-facing (esta
  última SOLO con diseño de canal + OK explícito). Skill `agente-correduria` (router + `references/sector.md`
  acumulativo) + rutina semanal martes 05:30 UTC (§21 de `RUTINAS-PROGRAMADAS.md`).
- 🔴 Pendiente de Alberto: añadir `ALERTA_TOKEN` al prompt de la rutina en la UI (sin él, informe solo en bitácora).
- Decisión previa de la sesión: credenciales Codeoscopic se piden a **Manuel** (env vars de su Vercel),
  NO a Codeoscopic; el borrador de Gmail a Juan Fernández queda muerto sin enviar. #1918 mergeado.

- **Vencimientos ya funcionando** (mismo PR #1919): `@central/module-seguros/vencimientos` (puro, LCS
  art. 22: <1 mes = se prorroga sí o sí) + puerto `/api/operador/vencimientos` en asegura + tabla en
  plataforma `/correduria`. Real: **5 vencen en 30 días, 7 en 60, 13 en 90** (3.899,05€ de prima
  conocida, 4 sin informar). ⚠️ Contar por fecha SIN filtrar estado colaba canceladas (daba 6/8).
- Cartera viva = **59 pólizas `situacion='EV'`** (37 auto/13 hogar/8 RC/1 moto); el resto es histórico.
  Ingesta CIMA = cron diario ~11:40 UTC **fuera de nuestro alcance**: en ese Supabase NO hay pg_cron ni
  Edge Functions, así que todo lo alimenta el Vercel de Manuel — y ese Vercel **no se ve desde aquí**
  (el conector solo alcanza el team «Pisos turisticos», donde ni `asegura` ni `central-asegura` están).
- 💡 **Idea de Alberto guardada: «Agente IA Defensa cartera»** (`references/defensa-cartera.md`
  + su diagrama). Recibo de PRECARTERA → agente nocturno → retarificar → comparar nueva producción
  vs cartera → pantalla de desviación de recibos → respuesta al cliente. NO implementado; depende
  de (a) saber qué estado de `poliza_recibos` es la precartera, (b) la API de Avant2 —y **cada
  cotización cuesta 0,50€**, así que necesita presupuesto—, y (c) Fase 3 para lo del cliente.
- 🚨 **Método — cómo NO verificar un deploy de Vercel (01/09/2026, me costó 3 falsos negativos):** se
  dio por hecho que plataforma «no había desplegado» porque el identificador `dpl_…` incrustado en el
  HTML de `/login` no cambiaba. **`/login` es una página PRERENDERIZADA (ISR)**: su HTML lo sirve el CDN
  y ese `dpl_` puede seguir siendo el del build anterior con el deployment nuevo ya en producción (el
  panel mostraba los dos commits en **Production · Ready**). La comprobación que SÍ vale desde aquí:
  pedir una **ruta de API nueva** y ver si responde **401/200 en vez de 404** — eso prueba que el código
  está sirviendo (`/api/cron/correduria-renovaciones` → 401). Y el conector de Vercel **no puede leer
  deployments (403) ni env vars (no existe la herramienta)**: para eso hace falta el panel.

- **Migrar la cartera al schema `seguros`: NO todavía** — copiar 32.600 filas es trivial, pero sin mover
  la ingesta EIAC/CIMA la copia envejece al día siguiente y quedan dos carteras. Orden: vencimientos ya
  (hecho) → pedir a Manuel cómo se alimenta → migrar + repuntar ingesta. Al mover, ojo: las 86 RLS por
  `auth.uid()` no viajan (nuestros roles llevan BYPASSRLS) → el aislamiento pasa a ser del código.

### 🧾 (01/09/2026) Codeoscopic = LA fuente de tarificación y EMISIÓN de pólizas nuevas (dictado por Alberto)
- La web «ASegura» es de ALBERTO (Manuel la desarrolló); EIAC no le preocupa. Codeoscopic es el motor
  de venta: sin él la plataforma no tarifica ni emite.
- Del Gmail de Alberto (verificado): cuenta **Avant2 Sales Manager** propia y operativa desde 09/06
  (alta «SOLO ASM», formación hecha); compañías vivas: Reale (26/05, multirramo) y Fidelidade (hogar,
  14/07); claves entregadas de Mapfre/Allianz(PA342521)/Occident(M00171). Contrato Workspace 20/05 y
  DPA art. 28 remitido el 25/05 (el «contrato de encargado» de la lista ya existe con Codeoscopic).
- La integración API de la web quedó EN SANDBOX (03/06: Quote→preemisión→Submit→webhook Basic Auth sin
  cerrar; correo de manuel@loor.es a juan.fernandez@codeoscopic.com) → por eso el flag de emisión sigue
  apagado. **Borrador creado en Gmail** (no enviado) a Juan Fernández: renovar sandbox + pendientes +
  prueba de idempotencia del attempt_id. Pendiente: quién es manuel@loor.es; inventario BD cuando
  reconecte el conector Supabase_asegura.
- ⚠️ Higiene: en mayo viajaron por email claves de portales de compañías en texto plano (Mapfre,
  Occident) — rotarlas con calma.

### ✅ (01/09/2026) CARTERA EN VIVO FUNCIONANDO — rotación hecha; cron `postgres` de Manuel roto desde el reset
- Números reales en plataforma→Correduría: 50 en vigor · 995 sin fecha · 27.793 históricas · 2.742
  clientes · 29.858 leads · 7 siniestros (el 1.194 de la víspera era lectura vieja: la BD ingesta a diario).
- Contraseña de `central_asegura` ROTADA (04:39, del gestor de Alberto); snippet con clave en claro
  borrado; env recreada en Vercel; pooler registra `Connection authenticated`. Exposición de la clave
  débil (20:51→04:39): cero autenticaciones del rol en lo auditable — matiz: `log_connections` OFF,
  solo audita el pooler.
- 🚨 Un job con `postgres.js` (IPs Vercel fra1) falla como `postgres` cada ~5 min desde 31/08 ~08:00
  (antes autenticaba): es del CRM de Manuel — nada nuestro usa esa BD salvo apps/asegura (verificado
  por código). Probable daño colateral del reset de la database password durante el montaje. NO tocar
  su Vercel; avisar a Manuel (borrador, regla de comunicaciones).
- `central-asegura` servía desde us-east-1 contra BD eu-central-1 → `regions: ["fra1"]` en su vercel.json.

### 🔑 (01/09/2026) La cartera en vivo: era la CONTRASEÑA — y un valor del chat acabó de contraseña
- Logs del pooler (MCP Supabase_asegura, nuevo conector): `password authentication failed for user
  "central_asegura"` → el fallo era la contraseña del `ASEGURA_DATABASE_URL` pegado en Vercel
  (host/usuario correctos; el blindaje pgbouncer de #1905 quedó descartado como causa).
- 🚨 Incidente: al guiar el arreglo por Claude Chrome, la HUELLA de verificación (md5 del verificador
  SCRAM) publicada en el chat se usó como contraseña del rol. Lección: **jamás publicar un valor con
  pinta de credencial sin marcarlo como NO-USAR**; los secretos los genera el gestor de Alberto y no
  pasan por ningún chat. Exposición revisada en logs: solo fallos de auth, ninguna huella de acceso
  (matiz: log_connections apagado). Rotación en curso con marcador `<<CLAVE>>` que rellena Alberto.
- Aparte: algo con `postgres.js` desde `63.180.181.94` intenta entrar como `postgres` cada 5 min y
  falla — no es nuestro (nosotros: Prisma + central_asegura). Preguntar a Manuel en el traspaso.
- Además: 🛡️ Correduría entra por fin en el menú de plataforma (PR #1907, guardián incluido) —
  «no me sale correduría»: /correduria nunca estuvo en NAV_NEGOCIO.
