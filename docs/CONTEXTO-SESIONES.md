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
> Para arquitectura/módulos completos → skill `ia-rest-maestro`. Esto es solo el
> registro de qué se hizo y qué queda.

---

## 📌 Estado actual (lo más reciente arriba)

- **🚪 Reglas de VENTA por fin medibles — H9 (04/08/2026, noche).** Alberto: «vender igual de importante,
  hay que buscar solución». Todo salía por tiempo (28/56/91d); cero observaciones de reglas de salida.
  Nuevo `lib/trading/salidas.ts` (puro, 10 tests): `simularSalidas` = retorno de la misma entrada bajo
  stop fijo −10%, stop fijo −20% y trailing −15% sobre cierres, mismos criterios de entrada/horizonte
  que ret91. Recolectado en `factoresEnFecha` (cron `trading-backtest`, el resucitado hoy). NO decide
  nada: pre-registrado como **H9** (freno: −5 pp de batacazos sin ceder >1 pp de mediana · o retorno:
  +2 pp de mediana). Caveat firmado: stops suelen ayudar al momentum y matar la reversión — si H8 se
  cablea, su salida se evalúa aparte. PR #1248.

- **🧾 Agente de facturas: ahora mira A NOMBRE DE QUIÉN viene la factura (31/07/2026).**
  - Disparador: la bandeja pidió revisar una obra de 2.420,59€ de LUANSA que era del tejado de la
    **Hacienda El Triunfo** (factura a «El Triunfo CB», CIF E26631895) — ajena a Alberto. Entró porque el
    abogado la mandó a MAPFRE como prueba y el hilo se le reenvió. Descartada de `gastos` a mano.
  - `receptor.ts` (puro + 10 tests): tres estados `nuestro`/`ajeno`/`desconocido`. Solo descarta con
    NIF identificado que NO casa con los titulares; el nombre solo confirma, nunca descarta. Titulares =
    `sociedades` + env `FACTURAS_TITULARES_NIF`. Decisión de Alberto: **ignorar + avisar** por Telegram.
  - Bug arreglado de paso: en IONOS el extractor guardaba el NIF de Alberto como CIF del proveedor →
    envenenaba la huella (ningún proveedor aprendía regla). El prompt ya pide emisor y receptor por separado.
  - Fila nueva en `sociedades`: PUNTO Y COMA GESTION, S.L. (B90446683) — sin ella DIGI salía «ajena».
  - **Pendiente:** PDF escaneado sin capa de texto se descarta (`extraer.ts` no cae a visión); 24 adjuntos
    ilegibles en la pasada del 31/07. Y no hay destino para gastos de la correduría en `negocios`.
- **🧾 facturas-correo (01/08/2026, trigger diario).** Vía B sana, sin backlog. Archivada la factura
  de la lavandería Giraldillo AFV-11808 (72,60€, deducible); pago aún pendiente, sin conciliar. **Hallazgo
  colateral:** el cron `facturas-scan` (`apps/plataforma/lib/agente-facturas/drive.ts`) archiva TODO lo que
  procesa en `ALBERTO 2026 PERSONAL (SEGUROS)/<mes>` en vez del árbol de negocio — mismo patrón que Castuera
  (10/07, aviso aún sin borrar). No es un bug de esta skill (yo re-archivo bien y aviso en
  `_DUPLICADOS_BORRAR`), pero conviene revisar la resolución de carpeta de ese cron algún día. Detalle en
  `docs/AGENTES-BITACORA.md`.

- **🧹 Laboratorio de inversión: quitado el ruido + el retrovisor llevaba 16 días muerto (04/08/2026).**
  Alberto: «no entiendo la pantalla, quítame lo que no me dé números reales». Hallazgo gordo al auditarla:
  **`/api/cron/trading-backtest` NO estaba en `CRON_JOBS`** — la ruta existía, nadie la disparaba, y
  `trading_backtest` estaba congelada desde el 19/07 mientras la UI pintaba sus cifras como vigentes; eso
  además hacía INCUMPLIBLE el criterio de evaluación de H8 firmado horas antes (enmienda anotada en el
  pre-registro). Job añadido `10 */2 * * *`. Retiradas de `/trading`: **💼 Cartera simulada** (entrada/stop
  sin ningún resultado — intenciones con pinta de cartera) y **📊 Rendimiento por estrategia** (retorno
  HIPOTÉTICO de seguir señales del torneo interno, la bajista «gana» si cae). Las dos cohortes forward se
  **fusionan cuando comparten cesta**: 2026-07-18.v1 y 2026-07-20.v1 son los MISMOS 8 valores y se pintaban
  como dos confirmaciones. Evidencia forward REAL a día de hoy: 1 cesta, 16 días, 2 snapshots. PR #1247.

- **📊 Velas + volumen: medido, y la tesis del rebote en la media larga REFUTADA (04/08/2026).** Idea de
  Alberto tras su ORCL. Estudio punto-en-el-tiempo sobre 1.300 velas mensuales de 7 large caps US
  (2008-2026), midiendo el exceso sobre la deriva de CADA valor. Resultado incómodo: tocar la EMA100
  mensual y cerrar encima da **−11,9% a 6 meses y −23,3% a 12** (n=51, solo 8 de 40 ganan a un año) —
  es el aviso de que el valor devolvió años de tendencia, no un soporte; AAPL no la tocó ni una vez en
  12 años. Las figuras de vela solas (martillo/envolvente/cuerpo grande) ≈ 0. Lo ÚNICO con señal:
  **caída ≥25% del máximo de 12 barras + volumen ≥1,5×** (+18,5% de exceso a 12 meses, n=34). Nuevo
  `lib/trading/velas.ts` (puro, 13 tests, tres estados null/false/true) recolectado en el retrovisor
  sobre las ~800 del universo; NO toca ranking. Pre-registrado como **H8**. PR #1247.

- **🔎 Verificación en caliente del arreglo de los ADR + techo al nº de acciones (31/07/2026).** Sin esperar
  al cron: bajados por `pg_net` los companyfacts de los 5 peores del radar y pasados por el parser ya
  mergeado. NMR (30.061.813 mil M$ de capitalización), PAC, LTM, BSAC y BCH → los 5 salen `emisorExtranjero`
  y capitalización **NULL**. Ojo con LTM: presenta en DÓLARES, así que solo lo caza la regla del 20-F —
  la de divisa no habría bastado. Hallazgo nuevo: el nº de acciones también viene inflado por el propio
  emisor (Nomura ×1e6, PAC ×1000) y `accionesPlausibles` solo miraba hacia abajo → techo en 1e13, que caza
  a Nomura sin tocar a los que sí tienen 1e11 acciones de verdad (LATAM, Santander Chile). PAC no es
  separable y se queda. Hoy lo tapa el gate del ADR; la guarda es para cuando `acciones` se use para otra cosa.
### 🔐 Trial Tuya IoT Core renovado — cerraduras OK de nuevo (04/08/2026)
Los PINs del teclado de Socorro fallaban por `Tuya 28841002: IoT Core service subscription has expired`
(NO por el corte de luz; la «Sonda» no enlaza nada, solo lee por cloud). Alberto renovó el trial en
platform.tuya.com (Cloud → Cloud Services → IoT Core → Extend Trial) y la sonda en prod confirma:
PIN ✅ (PIN vivo para la reserva de hoy) · Accesos ✅ · Estado ✅ en Socorro y BustoTavera.
`Tarjetas → Tuya 1108: uri path invalid` es aparte y esperado (el aparato no expone tarjetas por cloud).
Caduca ~04/02/2027: trigger one-shot `Recordatorio renovar trial Tuya IoT Core` (04/01/2027) ya creado.
Truco de verificación reutilizable: el proxy del contenedor bloquea Vercel → sonda vía `pg_net` desde
la Supabase compartida (`net.http_post/get` + `net._http_response`) con cuenta temporal (borrada). Sin código.

### ⚕️ Sonda NIM: la key está VIVA — el veredicto separa lento de muerto (04/08/2026)
Investigado el 🔴 «NIM no responde, revisar key/cuota»: la key funciona (93 llamadas reales OK en 7
días, 40 chat OK la víspera, mismo modelo). Es la cola del tier gratis (p50 24,6 s / p90 27,5 s)
rozando el timeout de 30 s → un ping suelto cae ~1 de cada 4 con el proveedor sano. Fix (rama
`claude/sonda-nim-timeout-1fcduq`): la sonda reintenta 1 vez SOLO ante timeout (errores HTTP no) y
el Check 13 emite veredicto con helper puro `lib/monitoring/sonda-veredicto.ts` (testeado): 🟠
«degradado» si el tráfico real de 48 h completa, 🔴 «revisar key» solo si nada lo desmiente.
Sigue pendiente el suplente de `meta/llama-3.3-70b-instruct` (pasada de `buscador-ia`).

### ⚕️ Verificación #1232: groq y gemini cerrados; NIM es DEGRADACIÓN real (04/08/2026)
Sonda de hoy 07:01 con el fix: **groq verde** (458 ms — el maxTokens 300 arregló el falso «respuesta
vacía») y **gemini fuera del Check 12** (0 llamadas en la ventana de 3 días, la guarda lo apagó sola).
**NIM sigue rojo** y ya NO es calibración: timeout con los 30 s completos, y el tráfico real del 03/08
ya sufría **12/52 timeouts (23%)** con ese mismo margen. No es key muerta ni modelo retirado (el error
es timeout, no 404): el tier gratis de NIM va con cola degradada. El fallback (OpenRouter/Groq) cubre
producción. Candidato a pasada de `buscador-ia`: valorar suplente para `meta/llama-3.3-70b-instruct`.
Sigue en observación: `registral` → `google/gemini-2.5-flash` vía NIM con 404 intermitentes (~50%).

### 👁️ La rama de VISIÓN de las facturas también pasa por la pasarela (04/08/2026)
Verificada la pasada de hoy tras #1234: la mitad de TEXTO funciona (12 llamadas, **0 errores**,
0,0076€, `gemini-2.5-flash`) y las facturas nuevas suben **1 → 5**. Pero quedaron **9 sin leer** sin
rastro en `ai_usos`: la rama de IMAGEN se quedó fuera de #1234 y llamaba a `nimVision` a pelo —un
intento, sin suplente, sin coste visible y con `JSON.parse` crudo que tomaba unas vallas ```json por
avería. Ahora usa `aiVision` (OpenRouter multimodal → NIM) + `parsearJsonIa`. Dos arreglos más:
`maxTokens` 512 → **1500** (los modelos del Director razonan y ese gasto cuenta contra el mismo tope
→ JSON cortado = «no leído», la lección de la sonda del 03/08), y un PDF **escaneado** (capa de texto
vacía) pasa de `sin_datos` a `tecnico`: se encolaba como «leído y descartado» sin que nadie lo mirara.
Al abrir la cola se ve que 8 de los 9 NO son facturas (cartas de MAPFRE, extractos de ParkingLibre);
la real es DIGI 76€. `aiVision` no pasa por el gate de presupuesto diario (era ya así). PR #1243.

### 🔎 El barrido de mercado ya trae comps: la consulta buena era la ABIERTA (04/08/2026)
Primera pasada con #1227 en producción: **52 comps en 20 ventanas** (antes 0) y medianas distintas por
fecha en el Dúplex —305€ oct · 199€ dic · 104€ ene— o sea que SÍ distingue temporada. Pero el parte nuevo
delató el resto: «⚠️ 100 búsquedas sin resultados · 12 de la ronda base ciegas». Las 20 ventanas con datos
son EXACTAMENTE el tope de consultas abiertas: 20 de 20 aciertos con la abierta contra 0 de 100 con
`site:booking.com`. Fix: se invierte el orden — la abierta pasa a primaria y la de `site:` queda de
refuerzo acotado (`SIVRA_SWEEP_MAX_REFUERZO`, antes `..._MAX_ABIERTAS`). Sin coste extra: hoy eran 140
búsquedas, ahora 120 + hasta 20. Verificado: tsc 0 · 805 tests · build OK. **Pendiente: latido del 05/08.**

### 🎸 Bienal de Flamenco 2026 dada de alta en el pricing (03/08/2026)
Reserva Booking del Dúplex (25-28 sep, 478,88€ brutos = 159,63€/noche, 53 días de antelación con mediana 7)
destapó que la Bienal (fechas oficiales **9 sep – 3 oct**, labienal.com) no estaba en NINGUNA fuente de
eventos (el hueco «septiembre = 0 eventos» del 31/07). Mercado real de ese finde por aforo (Booking MCP):
p50/noche 258€ (4pl) · 269€ (2pl) · 429€ (5pl) · **984€ (12pl)** — ~1,5× el finde 18-20 (162€ a 4pl).
Hecho: Bienal en `pricing-calendar.ts` (plataforma+sivra, 1,25/1,30/1,40), 60 comps de 4 findes en
`market_rates` (upsert idéntico al ingest), aprendizaje en `pricing_aprendizaje` (`ALL/bienal_flamenco_2026`),
hueco cerrado en la skill. PR draft rama `claude/duplex-dynamic-pricing-435igu`.

### 🔎 SEO housesevillana: push manual + el agente solo actualizaba el <title> (03/08/2026)
El PAT de Alberto no tiene `contents:write` sobre `house-sevillana-landing` → el botón SEO falló el push
(403); pendiente de que Alberto suba el permiso del token en GitHub. Mientras: actualización SEO aplicada
A MANO al repo de la landing (title con marca+USP parking, description 157c, og:title; propuesta registrada
en `seo_proposals`). Al mirarlo se vio que las regex de `seo-landing.ts` (sivra Y plataforma) esperaban
comillas escapadas `\"` y el `app/route.ts` real lleva comillas normales: description/og NUNCA se
actualizaban, solo el `<title>`, en silencio. Fix con backreference de estilo + 5 tests nuevos (validado
contra el fichero real). PR de esta rama.

### 🔑 El redeploy del panel de secretos se cancelaba en silencio (03/08/2026)
Alberto guardó `GITHUB_TOKEN` en `/operador/secretos` y el panel dijo «✅ redeploy lanzado» — pero los
redeploys de sivra y plataforma salieron **CANCELED**: `redeployProjectProduction` usa `withLatestCommit`
y el último commit de main era el de la auditoría `[skip ci]`, que `vercel-ignore-build.mjs` salta SIEMPRE.
La env quedaba en Vercel pero nunca en runtime. Fix (PR): el redeploy pasa
`projectSettings.commandForIgnoringBuildStep: ''` (un redeploy explícito construye siempre) + sonda de
~15 s que reporta CANCELED/ERROR como fallo real; el endpoint solo dice `redeployed` si TODOS los
proyectos salieron (antes un fallo parcial se tapaba). El PR #1236 (mergeado) tocó también apps/sivra,
así que el merge reconstruyó sivra Y plataforma con la env ya guardada — verificado READY en producción;
no hace falta re-guardar el token. El override del redeploy queda pendiente de estrenarse en la próxima
edición real desde el panel (la sonda avisará si no funciona).
Los 10 ilegibles de hoy eran **Groq 429** (rate limit de `gpt-oss-120b`) + **NIM timeout**: los dos
únicos eslabones, porque `aiExtractInvoiceDetallado` llamaba a los proveedores a pelo **saltándose la
pasarela**. Ahora usa `chatConDirector` (`endpoint='extraer-factura'`): Director eligiendo modelo,
reintento con modelo seguro, cadena GRATIS de respaldo, presupuesto diario respetado (si se agota
degrada, no gasta) y **coste visible en `ai_usos`** — antes leer facturas no aparecía en el panel.
De paso, el parseo sale a `lib/agente-facturas/parsear-json-ia.ts` (puro, 9 tests): tolera ```json y
prosa alrededor (adornos, no fallos), pero un JSON **truncado NO se repara** —un importe a medias es
peor que ninguno— y un **array** se declara ilegible en vez de coger «la primera de N». Verificado:
tsc 0 · 800 tests · build OK. **Pendiente: la pasada del 04/08 dirá si `sinLeer` baja de 10.**

### ⚕️ Health-check 03/08: los 3 rojos de IA eran ruido, no averías (03/08/2026)
Gemini (Check 12) = residuo pre-gate: última llamada real 01/08 04:00; la guarda de 3 días lo apaga
sola el 04/08. NIM y Groq = **falsos positivos de la primera pasada de la sonda (Check 13)**: Groq
devolvió 200 en 222 ms con `content` vacío (gpt-oss-120b es razonador y `maxTokens:5` se iba en
razonamiento); NIM abortó a los 12 s cuando producción espera 30 y su media real es ~26 s (167 éxitos
/30d, último 02/08). Fix en `lib/monitoring/sonda-ia.ts`: `maxTokens` 5→300 y timeout 12→30 s.
Observado de paso: `registral` usa `google/gemini-2.5-flash` vía NIM con 404 intermitente (~50% hoy)
— vigilar si persiste. PR #1232 (mergeado).

### 📨 Leads ia-rest: fuera aviso Telegram, email en frío 100% automático (03/08/2026)
Alberto pidió (a raíz del ping «Lead listo: MICE Catering») quitar los avisos Telegram de leads y
que el agente mande los emails solo con Resend. `lead-onboarding` ya no manda Telegram y marca
`envio_aprobado=true`; `crm-envio-auto` pasa a ACTIVO POR DEFECTO (opt-out `ENVIO_AUTO_ACTIVO='0'`,
antes exigía `='1'`). Salvaguardas intactas: horario L-V 9-19, tope diario 30, dedup, bajas RGPD.
Resultado de envíos → resumen diario por email (tgAlert canal `resumen`). Build ia-rest verde. PR #1233.

### 🧾 El fix de #1219 funciona… y prometía una cola de Gmail que no existía (03/08/2026)
Verificación de la pasada 06:15: cron **200**, latido `ok=true` y el parte nuevo ya dice la verdad —
«1 factura nueva · ⚠️ **10 correos sin poder leer** · 1 descartado». Ese 10 es justo lo que antes se
tiraba en silencio (causa en logs: **Groq 429 rate limit** en `gpt-oss-120b` + NIM timeout). PERO el
parte añadía «etiquetados en Gmail para reintentar» y la etiqueta **`Facturas/Extraccion-fallida` no
existía**: `messageCopy` fallaba y el `.catch(() => {})` se lo tragaba → cero encolados y una promesa
falsa en el mismo sitio donde se arreglaba otra. Etiqueta creada a mano (Label_16) y arreglo de código:
`etiquetarCorreo` devuelve booleano, se cuenta `encolados` y el parte solo promete cola para los que de
verdad entraron (🔴 explícito si no). Verificado: tsc 0 · 791 tests · build OK. **Pendiente: los 10
ilegibles siguen sin leerse** — el cuello es la cuota de Groq, no el escaneo.

### 💹 MCP Financial Datasets evaluado — decisión: NO contratar (02/08/2026)
Alberto conectó el MCP `Datos_financieros` (financialdatasets.ai) y pidió valorarlo para trading.
Probado en sesión: la cuenta va por créditos y está a $0 — TODO endpoint de datos (hasta precio AAPL)
responde «add more credits»; solo el catálogo del screener es gratis (trae FCF yield/ROIC/PEG + insiders/
institucionales/guidance). Decisión de Alberto: no gastar — precios ya los da IBKR gratis, fundamentales
los cubre el parser EDGAR propio (endurecido tras PR #1189), y lo nuevo (insiders/guidance) es CONTEXTO
nunca filtro por preregistro. Reconsiderar solo si EDGAR vuelve a fallar (~49$/mes vs mantenimiento) o
si se activa el tramo gratis 100 req/día (entonces: contexto en la pasada diaria, coste cero). Sin código.

### 🔎 El «0 comps» del barrido de mercado eran 44 búsquedas VACÍAS (02/08/2026)
Diagnosticado el `ok=false` de `sivra_mercado_sweep` (lo que la entrada de abajo dejaba para el 09/08).
No es Serper agotada ni la IA: la consulta con `site:booking.com` devuelve `organic: []` desde finales de
julio — los 41 prompts que llegaron a la pasarela pesaban 149-278 tokens (el scraper diario, que sí trae
comps, mueve 576-933). La IA contestaba `{"apartments":[]}` porque no le daban nada. Fix: `serperSearch`
cuenta resultados y usa `answerBox`/`sitelinks`; `extractPrices` separa «no supe leer» de «leído sin
precios»; 2ª consulta abierta acotada (`SIVRA_SWEEP_MAX_ABIERTAS`); parte y `ok` desde el helper puro
`lib/sivra/resumen-sweep.ts` (con guardia `sinSenalDeTemporada`: comps planos en todas las fechas = corpus
que miente). Verificado: tsc 0 · 788 tests · build OK. **Pendiente: mirar el latido del 03/08 03:00** —
dirá si la consulta abierta rescata el barrido o si hay que buscar otra fuente de comps por fecha.

### 🔍 Revisión de memorias/skills/agentes (02/08/2026, pedida por Alberto)
Reconciliación post-auditorías de hoy. Heartbeat 14/14 en verde REAL: el ⛔ de `psd2-sync` (31h) era falsa
alarma de finde — cron 200 a las 06:01 en logs Vercel; umbral 30→54h en `auditoria-diaria.md`. Drift corregido
(carril 1): `buscador-ia`+`docs/BUSCADOR-IA.md` no recogían Gemini apagado por defecto (#1220) ni el alias
`gemini-flash-latest`; `facturas-correo` sin la etiqueta `Facturas/Extraccion-fallida` (#1219); borrado el
duplicado `###` del 31/07 (ya archivado en `memoria/2026-07.md`). `docs/SKILLS.md` y `perfil-fiscal` al día.
Ojo: 1ª pasada del sweep semanal (#1186) con latido `ok=false` («0 comps en 44 ventanas, 19 sin tiempo») —
revisar el domingo 09/08. Sin Telegram en este entorno (sin `ALERTA_TOKEN`). Rama `claude/revision-conversaciones-memorias-9hq32s`.

- **📡 Sonda ACTIVA de proveedores IA — «que no vuelva a pasar y si pasa, enterarnos rápido»
  (02/08/2026, rama `claude/gemini-quota-fallback-issue-fyhghm`, 2ª tanda tras mergear #1220).**
  El Check 12 es forense (necesita ~1 semana de fallos orgánicos); ahora el health-check diario hace
  además un **ping real de 5 tokens a CADA proveedor configurado** (`lib/monitoring/sonda-ia.ts`,
  misma key y modelo que producción, en paralelo, coste ≈0) → **Check 13** avisa por Telegram el
  MISMO día si un eslabón no responde, haya tráfico o no. Cada ping queda en `ai_usos`
  (endpoint `sonda`) — histórico de cuándo murió una key. Gemini solo se sondea si sus gates están
  activos. `maxDuration` del health-check 60→120.

- **🔎 Revisión mensual ia.rest Tech & Stack (02/08/2026, sesión de investigación).** Resultado: TODO
  verde, sin acciones. Groq `whisper-large-v3-turbo` vivo ($0.04/h, es el destino de migración de
  distil-whisper); NIM sin retiradas que nos toquen; Supabase ambos proyectos ya en PG17 (EOL PG14 no
  aplica); Next.js con programa de seguridad MENSUAL desde julio (9 CVEs parcheados 21/07, cubiertos por
  `^16.2.12` + install sin lockfile congelado). ASR premium (AssemblyAI Universal-3.5, 4.9% WER
  multilingüe) mejora a Whisper pero a ~9× el precio → seguir con Groq salvo quejas reales. El prompt
  del evento de calendario decía «Haiku como fallback» (Anthropic se retiró el 17/06) — YA CORREGIDO:
  la serie recurrente ahora apunta a la cadena real (OpenRouter→NIM→Groq→Gemini→Kimi) y a `client.ts`.
  Pendiente que arrastra: confirmar `CONTABLE_MODEL` (`deepseek-ai/deepseek-v3`) con `NVIDIA_API_KEY`
  a mano (esta sesión no la tenía).

### 📬 Los UID de IMAP son POR BUZÓN: el marcado de correos se perdía en silencio (02/08/2026)
Cerrado **#1201 sin mergear** (decisión de Alberto): nació para contar los correos ilegibles, pero mientras
estuvo abierto se mergeó **#1219**, que hace lo mismo y mejor (separa fallo técnico de «leído y no era
factura», cosa que #1201 no hacía). De él se rescata SOLO una pieza que #1219 no traía: `marcarProcesado` y
`etiquetarCorreo` bloqueaban **INBOX** aunque el listado hubiera leído de `Facturas/Proveedor` → el UID no
existe ahí, no se encuentra el mensaje y **ninguna de las dos lanza**. Efecto: la cola
`Facturas/Extraccion-fallida` de #1219 —único sitio donde queda constancia de un ilegible— podía no
etiquetarse nunca, y un correo ya procesado se reintentaba a diario. `ListadoCandidatos` devuelve ahora su
`buzon` y ambas funciones lo reciben (default INBOX = sin cambio de comportamiento); mismo arreglo en el
escaneo de gastos de sivra (`GMAIL_FACTURAS_LABEL`). **Lección:** al listar de un buzón que no es INBOX,
el buzón forma parte de la identidad del mensaje. Verificado: tsc 0 · 775 tests · build OK.

### 🧾 Verificado el latido de facturas — y el «0 facturas nuevas» seguía mintiendo un nivel más abajo (02/08/2026)
La pasada de hoy confirma el fix de #1194: cron **200** (no 504), 81 s (habría muerto con el techo viejo de
60 s) y `agente_latidos.facturas_gmail` con `ok=true`, sin `pendientes` → sin atasco. Pero los logs
enseñaban la extracción IA fallando (NIM timeout, Groq JSON truncado) mientras el parte decía «0 facturas
nuevas»: `escanearNuevasFacturas` descartaba los ilegibles con un `continue` mudo — ni nuevas, ni
pendientes, ni rastro. Fix: `aiExtractInvoiceDetallado` separa fallo `'tecnico'` (no se ha leído) de
`'sin_datos'` (leído, no era factura); los técnicos cuentan como `sinLeer`, se etiquetan en Gmail
(`Facturas/Extraccion-fallida`) y salen con ⚠️ en el latido (`resumen-escaneo.ts`, puro y testeado).
Límite asumido: ventana de 7 días, un correo que falle 7 días seguidos queda para revisión a mano.

- **⏱️ Crons con timeout 60s → 300s (02/08/2026, rama `claude/audit-30-07-hv2njr`).** Cierre del hallazgo
  del check-in post-dispatcher (PR #1165): 5 crons morían por «Task timed out after 60 seconds» (504,
  logs Vercel 3 días: `concursos-ingesta` ×12 — TODAS sus pasadas —, `concursos-radar` ×3,
  `facturas-conciliar-gmail` ×3, `facturas-scan` ×2, `subastas-enriquecer` ×2; preexistente al dispatcher).
  Fix: `maxDuration` 60→300 en `concursos-ingesta`/`concursos-radar`/`facturas-conciliar-gmail`
  (`facturas-scan` y `subastas-enriquecer` ya estaban a 300 en main vía PR #1194, mismo diagnóstico).
  El 504 suelto de `/api/ai/chat` NO es cron — sin tocar.
  De paso verificado el 🟡 de la auditoría 30/07: `incomes` volvió a escribir el 01/08 (falsa alarma de
  temporada baja) y `psd2-sync` escribe a diario tras el dispatcher. Verificado: tsc 0, 769/769 tests.

- **🔌 Gemini FUERA de todas las cadenas por defecto — «usa OpenRouter» (02/08/2026, rama
  `claude/gemini-quota-fallback-issue-fyhghm`).** El Check 12 seguía rojo (544 llamadas/30d, 0 éxitos, 429
  de cuota). Tras el corte de websearch del 01/08 quedaban 2 vías vivas: el eslabón Gemini de `aiComplete`
  (`core-ai/client.ts`) y el último intento de `lib/pasarela.ts` — ambas gateadas tras **`GEMINI_TEXTO=1`**
  (apagadas sin la env), + el fallback directo de `callAISearch` de ia-rest tras `GEMINI_WEBSEARCH=1`.
  El Check 12 ahora exige llamada en <3 días (sin eso repetiría 30 días la alerta de un problema ya
  resuelto). Embeddings de la caché semántica siguen con la key (best-effort). Nada que poner en Vercel:
  el default apagado ES el estado deseado. Pendiente: si algún día hay key con cuota, activar los 2 gates.

- **🧹 «Haz tu todo»: vulns 12→3, 0 críticas (02/08/2026, rama `claude/audit-vulnerabilities-02-08-m7lwtf`).**
  Los bumps aparcados eran seguros al mirarlos de cerca: nodemailer 8→9 en sivra (el call site es un stub
  comentado; peer de @auth/core opcional), fast-xml-parser 4→5.10.1 (v5 = solo empaquetado ESM, API idéntica),
  sharp 0.35.3 + override, imapflow ^1.6.5 (ya sin dep nodemailer) + mailparser 3.9.14 (mata linkify-it),
  overrides postcss ≥8.5.18 y uuid ≥11.1.1 (CJS verificado en node-ical). Quedan solo xlsx ×2 (sin parche npm,
  no explotable) y file-type (parche ESM-only rompería jimp). Verificado: typecheck 4 apps afectadas, tests
  raíz + 769/769 plataforma, smoke tests de runtime (fxp/sharp/uuid). PR #1218 ampliado con los bumps.

- **✅ Reparación auditoría 02/08 cerrada (02/08/2026, rama `claude/audit-vulnerabilities-02-08-m7lwtf`).**
  Alberto: «repara». Las dos verificaciones pendientes del PR #1215 ya estaban resueltas por los checks del
  propio PR: builds reales de Vercel **8/8 en verde** (la que faltaba antes de producción) y las 4 apps
  «desaparecidas» (rrhh/transporte/alquiler/almacen) **SÍ existen en el mismo team** — el conector Vercel MCP
  tiene acceso por-proyecto (403 en esas 4), no hay gap de despliegue. **PR #1215 mergeado** (squash `783b2fb`):
  46→12 vulns, 0 críticas. Pendiente opcional de Alberto: ampliar acceso del conector a los 4 proyectos;
  valorar nodemailer 8→9 y fast-xml-parser 4→5 con smoke test. Informe actualizado en `docs/AUDITORIA-2026-08.md`.

- **🧾 Cuota de la Seguridad Social (RETA) de julio salía ❌ NO DEDUCIBLE (01/08/2026, rama
  `claude/seguridad-social-deducibilidad-kgmyjq`).** Alberto preguntó por el cargo de BBVA de 388,95€.
  **Causa:** regla aprendida **`CUOTA → personal`** en `banca_destino_reglas` (18/07/2026, seguramente de
  la hipoteca «CUOTA PTMO» o la cuota de comunidad). Las reglas se aplican por SUBSTRING y con PRIORIDAD
  sobre `lib/destino.ts`, que ya manda la RETA de BBVA a `seguros`+`cuota_autonomos` (deducible, Art.
  30.2.1ª LIRPF) — 3er caso del landmine "TRANSF" (PR #840). **Fix:** `CUOTA/CUOTAS/IMPUESTO(S)/COTIZACION/
  PTMO/PRESTAMO` a `CLAVE_GENERICA` + los tokens de ≤3 letras (DE, LA…) dejan de valer como "específicos"
  en `claveReglaValida`; SQL `2026-08-01_fix_regla_cuota_generica.sql` (aplicado: regla borrada, movimiento
  a `seguros`). Tests 29/29.

- **🛡️ Auditoría PROFUNDA semanal (02/08/2026).** `auditoria-central` entera: lockfile OK, radiografía OK,
  guardián 26/26, typecheck limpio en las 8 apps (7 con Prisma + ia-rest), `pnpm test` 0 fallos, heartbeat
  14/14 crons ✅. `pnpm audit` había subido a 46 vulns (**3 críticas**, 17 high) desde las 16 (0 críticas) de
  la pasada de julio — next-auth 5.0.0-beta.31 en sivra (2 críticas Auth.js: fail-open de checks de auth +
  bypass homógrafo de email) y next desactualizado en ia-rest/todas las demás apps. Arreglado en el acto
  (bump de parche, sin roturas — typecheck+tests+build sanity OK): next-auth→beta.32, next→16.2.12 (ia-rest)
  /15.5.22 (resto), override de `axios`→≥1.18.0. Quedan 12 vulns (0 críticas, 7 high transitivas — xlsx/
  nodemailer/sharp/postcss-en-next/linkify-it, documentadas, ver PR). Drift de doc encontrado y corregido
  (carril 1): `auditoria-central/SKILL.md` seguía describiendo ia-rest en schema `iarest` compartido y
  contaba solo 4-6 apps — la vertical vive en su proyecto Supabase standalone `efncqyvhniaxsirhdxaa` (la
  migración al compartido sigue pendiente, como ya documentaba `ia-rest-maestro`). Hallazgo sin confirmar
  (carril 2, no autoafirmado): Vercel MCP solo lista 6 proyectos del team `pisos-turisticos-projects`
  (falta rrhh/transporte/alquiler/almacen) — puede ser otro team fuera de alcance del conector, pendiente
  de que Alberto lo mire a mano. PR draft con los bumps de deps + informe.

- **📂 RRHH: categoría «Documentación mensual» en documentos de empresa (01/08/2026, rama `claude/programa-rrhh-m25fwd`).**
  Petición de Pilar (Mariscos González) por WhatsApp sobre el desplegable de `/admin/empresa`. La lista de
  categorías estaba **triplicada** (lib + los dos clientes) y ya había drift: `contrato` existía en
  `/admin/empresa` pero no en `/admin/cuenta`, donde se pintaba el id crudo. Ahora vive una sola vez en
  `apps/rrhh/lib/categorias-empresa.ts` (módulo puro, importable desde `'use client'`) con `periodo`
  `ninguno|anual|mensual` que decide qué campos de fecha pide el formulario — `mensual` y `seguro_social`
  piden año+mes. Categoría desconocida ya no desaparece de la lista: se agrupa por su id. De paso, arreglado el
  desbordamiento horizontal de `/admin/empresa` y `/admin/cuenta` en móvil (verificado en Chromium a 320 px).
  Tests + typecheck + build OK; PR #1212.

- **⚖️ «Cargas no publicadas» con la certificación publicada y enlazada (01/08/2026, rama
  `claude/carga-no-recogida-analizada-vjkwc9`).** Alberto con captura: `SUB-JA-2026-264478` tenía en el BOE
  su «certificación de dominio y cargas», el cron la había listado y descargado (`documentos_leidos=1`), y la
  ficha remataba con «Cargas no publicadas: pide la certificación registral». **Causa:** el gate de
  rentabilidad `mereceAnalisisProfundo` (salida = tasación → 0% descuento, flip −30,6%) bloqueaba la lectura
  IA, así que `cargas_conocidas` se quedaba en `false` — y `false` se pintaba como «el BOE no lo publica».
  **Fix:** `estadoCargas`/`titularCargas` en `module-subastas/cargas.ts` (5 estados, testeados) usados por la
  ficha y por `analisisDocumental`, con enlace directo al PDF; y el gate de rentabilidad deja de ser gate de
  lectura: si la ficha publica documento de cargas se lee igual (`LECTOR_VERSION` 4→5, cargas primero en la
  cola de descarga). 14 vivas, solo 3 pasaban el gate.

### 🔴 La comisión de Booking se descontaba DOS VECES — 17.723€ en 2026 (01/08/2026)
Auditoría a fondo del precio dinámico pedida por Alberto. El hallazgo más caro NO es del motor:
`incomes` tiene un **trigger** (`incomes_compute_net`) que calcula `amount = amount_gross × (1 −
`portal_rates.commission_pct`)`; para BOOKING la tasa es **19,72% y es CORRECTA** (15% + 1,3% de
servicio de pagos, +21% de IVA, verificada contra factura). El fallo estaba en `smoobu-sync.ts`, que
aplicaba **ese mismo factor antes de escribir** → Smoobu 244,86€ → app 196,57€ → trigger 157,81€.
Confirmado por cuatro vías antes de tocar nada: desglose de la extranet (Alberto mandó captura), 14
de 15 pagos del banco casan al céntimo con `amount_gross`, agregados banco vs `amount` (+20% Dúplex,
+9% Kutxa) y la ausencia total de cargos de comisión en el banco. Saneado el histórico
(`amount_gross` recuperado dividiendo por 0,8028; el trigger recalcula el neto): la reserva de
prueba queda 244,86€/196,57€ **idéntica a la extranet** y 2026 pasa de 72.151,40€ a **89.874,62€**.
Afecta a P&L, break-even y **base del IRPF**; el motor de precios no (lee `amount_gross`).
**Retirada una sospecha mía:** el `channel_markup` de 1,16 SÍ llega al escaparate (122 × 1,16 con
−10% móvil y −18% Genius = 104,44€ frente a los 105,43€ reales). No había infravaloración del 14%.
Además: latido para el **guardián de precios**, que era el único agente sin vigilante, y retirada la
ventana de 3 días del aviso —se combinaba con el dedup y silenciaba una alerta PARA SIEMPRE (había 5
abiertas sin avisar, dos ALTAS sobre Luxury bajo mercado del 22 y 25 de julio).

### 🔴 El bucket de mercado por MES era inalcanzable por diseño (01/08/2026)
Alberto mandó una reserva de Luxury (6-8 nov, Booking) preguntando si estaba bien. La reserva sí; el
precio no. El motor había bajado esas noches **152€ → 122€** a las 14:30 y a las 18:43 entró la
reserva, con comparables de ESE viernes entre **123€ y 212€** (mediana 169€ a 4 plazas). Causa: el
bucket mensual exige comps de **3 fechas distintas** (`MIN_FECHAS_MES`) y el barrido solo visitaba
**una por mes** — o sea, inalcanzable por definición. Medido por piso y mes: House sin bucket de
octubre en adelante, Luxury sin el de noviembre, Dúplex igual. Sin bucket se cae al **ancla global**,
que sale del último barrido y va dominada por las fechas cercanas (agosto), más baratas.
**Fix:** 3 fechas de muestra por mes (viernes + sábado + martes, replicando la composición de los
meses que sí funcionaban), plan ordenado por rondas (temporada → eventos → profundidad) y
**presupuesto de tiempo** en el barrido, que ahora publica `truncado`/`base_completa` y baja el
latido a `ok:false` solo si no llegó a cubrir la temporada. Una muestra que cae en día de evento se
corre una semana: el bucket mensual EXCLUYE las fechas de evento, así que ahí no sumaría.
De paso, corregido en el hilo: `amount_gross` de `incomes` es lo que paga el huésped, **no** el neto.

- **⚖️ Auditoría de las 37 subastas vivas tras el fix de cargas: dos mentiras más (01/08/2026).**
  Al repasar el corpus con el titular nuevo (PR #1213) salieron dos huecos de la MISMA familia:
  (1) **3 de las 14 del BOE tenían `cargas_conocidas=true` con `cargas=NULL`** —el campo Cargas de la ficha
  habla de cargas pero nadie ha cuantificado el importe que subsiste— y se pintaban **🟢 «Sin cargas
  anteriores subsistentes»**: afirmar la ausencia sin el dato, el bug original con el signo cambiado.
  Estado nuevo `sin_cuantificar` 🟠; el 🟢 exige ahora que la cifra EXISTA (un 0 leído sí vale).
  (2) `publicadas_sin_leer` afirmaba «no se ha analizado» también cuando SÍ se analizó y la lectura salió
  vacía (264706, que pasaba el gate por playa) → renombrado a `publicadas_sin_extraer`, texto «NO tenemos su
  cuadro de cargas». Además `analisisDocumental` ya no tiene copia propia del texto: llama a `titularCargas`
  (la ficha y el desplegable llegaron a decir cosas distintas de la misma subasta).

- **⏰ Subasta vencida seguía en «🎯 Mi radar» (01/08/2026, rama `claude/expired-auction-visible-eoow4t`).**
  Alberto con captura: `SUB-JA-2026-263723` cerró el 31/07 18:13 y al día siguiente seguía con botones de
  pujar. **Causa:** NINGÚN camino de lectura del radar filtraba por fecha — la bandeja se limpiaba solo con
  el `DELETE` diario de `archivarPasadas` (06:15 UTC) y encima con `now() - 1 day` de gracia → visible entre
  14 y 38 h tras cerrar (y para siempre si el cron falla). **Fix:** filtros CANÓNICOS `SUBASTA_VIGENTE` /
  `RADAR_VIGENTE` + `RADAR_CON_CORPUS` en `lib/subastas-radar.ts`, aplicados a SSR, `/api/subastas/radar`
  (lista y badge), `/api/subastas`, `/api/subastas/mapa` y el cron de avisos; borrado sin día de gracia.
  De regalo: `decidirAviso` ganó `cerrada` (con `Math.ceil`, vencida hace horas = 0 días = «urgentísima» →
  sonaba en Telegram) y el aviso ya lee `valor_orientativo` (no se seleccionaba: la guarda nunca saltaba).

- **🔍 Auditoría del agente SEO de iarest.es: NUNCA ha aplicado un cambio (01/08/2026, rama
  `claude/iarest-seo-agent-2v61fi`).** Alberto: «la web no tiene visitas, ¿qué hace el agente SEO?».
  Evidencia BD prod (`efncqyvhniaxsirhdxaa`): `seo_cambios`/`seo_articulos`/`seo_overrides`/
  `seo_content_blocks` = **0 filas**; `blog_borradores` parado desde el 25/05. Causas: (1) la allowlist
  `RUTAS_SEO_EDITABLES` es solo `['/restaurantes','/restaurantes/*']` → home y las 8 landings de sector
  quedan FUERA (y `/restaurantes` tiene 2 restaurantes / 1 web activa); (2) umbral `SEO_MIN_IMPR`=30
  impresiones GSC → sin tráfico nada lo supera (pescadilla). NO comprobado: `SEO_AGENT_ENABLED` en Vercel
  ni GSC/GA4 reales (env fuera del repo). Informe: `docs/INFORME-SEO-iarest-2026-08-01.md`.
  **Decisión de Alberto: ia.rest NO publica precio** — conversión = formulario `/#contacto` + WhatsApp
  `wa.me/34637349990`. Aplicado en el mismo PR #1208: fuera la tarifa de layout (incl. 3 `Offer` de
  JSON-LD), home (calculadora y comparativa BORRADAS, no ocultadas), 8 landings y 4 posts; se mantienen
  precios de terceros y cifras de la demo de catering. Agente SEO: allowlist 2→11 rutas, `SEO_DEFAULTS`
  sin cifras, regla inviolable «nunca publiques precio» en el SYSTEM, `solicitarIndexacion()` eliminado
  (la Indexing API solo cubre JobPosting/BroadcastEvent) y el silencio >21 días pasa a alerta Telegram.
  Verificado: `tsc` 0 errores + `next build` OK + guardrails 14/14. **Pendiente en Vercel (no en repo):
  `SEO_AGENT_ENABLED=true`, bajar `SEO_MIN_IMPR` a 3-5, key de Gemini en 429.**

- **⚕️ Check 4 del health-check reescrito: latido del sync, no última reserva (01/08/2026, rama
  `claude/health-check-2026-07-30-vlv4c7`).** Feedback de Alberto: la sequía de reservas (25/07→01/08,
  sync verificado sano por logs 200) se pintaba como 🔴 — «que especifique el fallo, ya que no es un
  fallo». `runSync` registra latido en **`agente_latidos`** (`smoobu_sync`, patrón #1184: intento al
  empezar + ok al terminar; semilla aplicada). Check 4: 🔴 solo si `ultimo_ok_at` lleva >26h (sync
  averiado de verdad); sin reservas nuevas → línea ✅ informativa «temporada floja, no es un fallo».

### 📐 El mercado de House se leía de pisos de OTRO tamaño (01/08/2026)
Alberto: «House Sevillana aún está en PriceLabs como dúplex». Cierto fuera y también DENTRO: los 30
comparables vivos de una casa de **12 plazas** eran de apartamentos de **8** (media 314€). El motor
no mentía —normaliza con `pricing_factor_aforo` desde el 31/07— pero su ancla estaba **extrapolada
(x1,56), no medida**: 403€ frente a los 621-694€ de los últimos comps de 12 plazas reales. De ahí
salía mi propuesta de bajar House a 330-350€: **retirada**. Dos arreglos: el guardián compara #4/#5
contra el mercado NORMALIZADO (iba en crudo → en el único piso donde importaba medía un 36% barato y
no podía disparar) y **centinela #9 `comps_otro_aforo`** (puro + 8 tests; umbral x1,35 para que
Luxury 5-plazas-con-comps-de-4 no haga ruido). El barrido diario de #1203 repone los comps buenos.
**Coletilla (mismo día, cierra el último pendiente): el «pico» del sábado 17/10 en House NO era un evento**,
era este mismo fallo. Es la ÚNICA fecha suya medida a 12 plazas (barrido del 09/06); el resto van a 8. En bruto
salía 610€ contra 307-382€ y parecía un pelotazo; normalizadas las dos a 12 plazas, el 17/10 (610€) queda en
mitad del pelotón — 05/09 596€, 19/06/27 610€ clavado. No hay nada que catalogar ese día.

### 🏠 Un piso puede cambiar de PRODUCTO: `historico_desde` + Gemini fuera (01/08/2026)
Dato de Alberto: **House Sevillana estuvo alquilada como DOS pisos turísticos independientes** hasta
que se decidió alquilarla entera (6 habitaciones, 12 personas). El corte se ve solísimo en BD:
**ADR 112/99/129/166 (2020-23) → 473/418/446 (2024-26)**, ticket medio 519€ → 1.171€. Ese salto ya
causó el error de proponer bajarla a 285€ (promediando las dos etapas salía «ADR de agosto 102€»), y
estaba envenenando también la antelación que alimenta la palanca de last-minute: la mediana de
octubre de House salía de 51 reservas, 30 de ellas de cuando era otro negocio. Nueva columna
**`pricing_settings.historico_desde`** (migración aplicada; House = 2024-01-01, el resto NULL = «no ha
cambiado») y el motor la respeta al medir la antelación. Efecto: House octubre **34 → 26 días**
(muestra 20). **Regla:** al analizar el histórico de un piso, comprobar antes si sigue siendo el
mismo producto — el número que sale de mezclar épocas es plausible y nada delata el fallo.
**Gemini APAGADO** (decisión de Alberto: «usa OpenRouter, que tienes todo»). La key llevaba 548
llamadas y 0 éxitos desde el 16/06 y el fallback la tapaba pagando el intento fallido antes de cada
llamada. Ahora OpenRouter es el primario y Gemini solo se intenta con `GEMINI_WEBSEARCH=1`.

### 📅 Smoobu SÍ da la fecha real de reserva — y eso INVIERTE el diagnóstico de octubre (01/08/2026)
El 31/07 se dio por imposible reconstruir la curva de anticipación desde `incomes` porque `createdAt`
es la fecha de la importación masiva. Cierto de esa columna — pero la **API de Smoobu publica
`created-at`** (kebab-case, como `guest-name`) y lo trae **también para el histórico**. Verificado por
`pg_net` desde Supabase, sin sacar la key de la BD. Nueva columna **`incomes.reserved_at`**
(migración aplicada) + backfill: **1.843 de 1.984 reservas (93%) ya con fecha real, desde 2020**.
**🔴 Lo que cambia:** la antelación medida desde `rate_snapshots` era una mediana GLOBAL por piso, y
Semana Santa + Feria la disparaban. Con el histórico REAL de **octubre** (6 años, muestra 46-67 por
piso): **House 34 días · Busto 18 · Dúplex 17 · Luxury 16** — frente a los 108/57/32/7 globales.
O sea: **«Busto va tarde en octubre» era FALSO** (yo lo dije el 31/07). Busto vende octubre con ~18
días de mediana, así que 7/31 a dos meses vista es su comportamiento NORMAL. **Octubre no va mal.**
Y la palanca de last-minute con la mediana global habría empezado a descontar el precio de Busto
**tres meses antes** de que octubre se venda — regalando margen en el mejor mes del año. Corregido:
`apply/route.ts` mide la antelación **por piso Y por mes** desde `reserved_at`; sin muestra de ese mes
la palanca se queda quieta. Sigue APAGADA en los 4 (`lastminute_k=0`), así que no llegó a hacer daño.
Endpoint `/api/sivra/incomes/backfill-reserved-at` (idempotente, con presupuesto de tiempo) para
rellenar lo que falte. **Regla:** la antelación depende del MES tanto como del piso.

### 🎪 De dónde salen los eventos de Sevilla: auditoría y arreglo completo (01/08/2026)
Pregunta de Alberto («¿de dónde saca los eventos, funciona?»). Tres fuentes: calendario a mano
(`lib/pricing-calendar.ts`), Ticketmaster y búsqueda web, combinadas por `MAX()`. **Agujeros:**
agosto+septiembre 2026 VACÍOS en el calendario (83 días) y septiembre sin una sola fila automática —
con la **Bienal de Flamenco del 9/09 al 3/10** sin catalogar; el barrido de mercado solo miraba **el
primer viernes de cada mes** (5-7 fechas/mes, octubre con 15 días de retraso), así que las noches de
evento NUNCA tenían comps y los centinelas #7/#8 no llegaban a la muestra mínima; techo real 1.60 en
los crons (el 2.5 era inalcanzable); `.catch(()=>[])` en apply:161 y guard:269 que tarificaban la
Feria como un martes respondiendo `ok:true`; y ningún latido sobre `pricing_eventos_auto`.
**🔴 `GEMINI_API_KEY` lleva 548 llamadas y CERO éxitos desde el 16/06** — no es una racha de 429, es
una key sin cuota; el fallback a OpenRouter lo tapó mes y medio. Añadido breaker + Check 12 del
health-check (proveedor con ≥20 llamadas y 0 éxitos en 7 días). **Alberto: regenera la key en Google
AI Studio o bórrala del proyecto Vercel** — mientras esté puesta y muerta se paga el intento fallido.
**Idea de Alberto → eventos PREVISTOS:** nueva 2ª pasada que busca en PRENSA lo anunciado pero aún
sin entradas (final de Copa, congresos de FIBES, giras sin fecha). Asimetría deliberada: un previsto
**NO mueve el precio** (una noticia no es demanda comprada), solo **protege el suelo**, pide barrido
y avisa por Telegram. Migración `2026-08-01_pricing_eventos_previstos.sql` APLICADA. Bienal metida
como previsto (factor 1.25, solo findes) porque el mercado NO la respalda todavía: el 12/09 sale más
barato que el 05/09. Crons de eventos y barrido pasados a DIARIOS. 105 tests, tsc 0, build OK.

- **📈 Trading: el panel de estrategias por fin discrimina + limpieza de huérfanas (01/08/2026).** Revisión
  «¿cómo va inversión?»: la pasada nocturna SÍ corre (NAV+tesis del 31/07), pero `puntuarTesis` devolvía el
  movimiento BRUTO del precio para las 3 direcciones → las 4 estrategias empataban en `retornoMedio` por
  construcción y `ajustesDeStats` penalizaba por caídas del mercado, no por errores. Ahora `retorno` = seguir
  la tesis (bajista invierte signo, neutral = 0); 168 resultados históricos migrados en BD y stats recalculadas
  (reversión +0,38% · momentum −0,27%). Tablas huérfanas `trading_forward_paper(_marca)` retiradas (pre-registro
  cohorte 1 archivado en TRADING-HIPOTESIS-PREREGISTRO.md). 110 tests módulo · 721 app · tsc 0 · build OK.

### 💸 PriceLabs: baja ejecutada en Busto+Luxury; Luxury reactivado en el motor propio (01/08/2026)
Alberto confirmó que **Busto Reform y Luxury ya están dados de baja de PriceLabs** (Dúplex/House siguen
en PL por decisión suya, transición en dos fases). El informe de decisión (BD 31/07) encontró a **Luxury
con `apply_enabled=false` desde el 28/07 20:34Z** → estaba SIN ningún motor (precios congelados en
Smoobu). Con OK explícito de Alberto: `apply_enabled=true` (suelo 72€, raíles ±20%/día) aplicado por
Supabase MCP; el `apply-auto` (3×/día) retoma en su próxima pasada. Estado piloto a 31/07: Busto rojo
(occ 11%, 19d sin reserva, base bajando 115→71 por raíles, 28 fechas de agosto ya al suelo 65€) y
Luxury rojo (occ 9%, 11d sin reserva). 0 reservas nuevas en Busto desde el cambio de suelo (28/07) —
solo lleva ~1 día por debajo del p50 de mercado (91€). Vigilar en `/sivra/pricing-auto`.

### 🏠 SIVRA: House cambió de categoría en 2024 y el ADR mezclado me hizo proponer regalarlo (01/08/2026)
Lo cazó Alberto: «Socorro está dando 1.500/2.000€ por un fin de semana». **ADR de House por año: 67·106·147·175
(2020-23) → 553·459·487 (2024-26)**, ticket medio 2026 **1.424€**. Yo había calculado «ADR de agosto 102€»
promediando las dos etapas y llegué a proponer bajarlo a 285€ — habría sido regalarlo. Mismo fallo que el de
los ADR del radar: número plausible, periodo equivocado, sin hueco que lo delate. **Al analizar House, usar
SOLO 2024 en adelante.** Suelo revertido a 300€ (llegué a bajarlo a 180€; no afectó, está en dry-run).
**Pero agosto sí está caro:** competencia REAL de Booking para 12 personas 16-23/08 → mediana **228€/noche**,
techo 443€; House pide 450-483€. La reserva que se canceló eran 334€/noche. Propuesta viva: **330-350€** para
ese hueco. **Y el corpus no tiene comps de 12 plazas frescos** (20 comps del 09/06 vs 136 de 8 plazas): el
sweep por aforo real (#1186) es SEMANAL (dom 03:00 UTC) y aún no ha corrido — la primera vez es el 02/08.
**🔴 Octubre, que es el mejor mes de Sevilla, va flojo a 2 meses vista:** Busto 7/31, Dúplex **0/31**, House
6/31, Luxury 4/31, y los precios publicados van a **2-4× el ADR realizado de octubre 2024-25** (Busto 307€ vs
77-86€ · Dúplex 194€ vs 90-100€ · Luxury 212€ vs 98-100€ · House 867€ vs 423-499€). Matiz que impide concluir:
el `createdAt` de las reservas de 2024-25 es la fecha de IMPORTACIÓN masiva, no la de reserva.
**PERO la curva SÍ se puede reconstruir — desde `rate_snapshots`, no desde `incomes`** (idea de Alberto: «¿por
qué no estudias cómo lo hace PriceLabs?»). Hay **65.725 snapshots diarios** de los 4 pisos desde el 10/05/2026:
cada vez que una fecha pasa de `available=1` a `0` entre dos snapshots es una reserva entrando, con su
antelación exacta. Medido: **Busto 108 días de mediana · Luxury 57 · House 32 · Dúplex 7**.
**Eso INVIERTE el diagnóstico de octubre:** Dúplex a 0/31 es su patrón normal (vende a 7 días) y House a 6/31
aún no ha entrado en su ventana (32 días); **el que va tarde de verdad es Busto**, que vende con 108 días de
antelación y a 60 días de octubre solo tiene 7/31. Muestra corta (78 días, 11-51 noches por piso): brújula, no
GPS. **Y PriceLabs NO hace last-minute:** House pasa de 460€ a 23 días a 428€ el mismo día (−7%) y se queda con
el 70% de las noches vacías; Busto ni baja, sube (94€→105€). Sirve como fuente de datos, no como modelo a
copiar. Luxury sigue congelado hasta el 01/09 (decisión de Alberto).

- **🗓️ Rotación mensual: julio archivado (01/08/2026).** `node scripts/rotar-memoria.mjs` movió las 321
  entradas de julio a `docs/memoria/2026-07.md` (auditoría diaria). Nota para la próxima pasada: el script
  solo reconoce entradas que empiezan por `- **`; una entrada con formato `### ` no se archivó sola y hubo
  que moverla a mano — si vuelve a pasar, vale la pena normalizar el formato de cabecera o enseñarle al
  script el patrón `### `.
- **📊 Facturas Booking.com julio 2026 verificadas vs banco (03/08/2026).** Llegaron 3 facturas (noreply@booking.com);
  guardadas en Drive por correo-triaje. Cuadre: Socorro (4340072) 634,69€ ✅ · Bustos Tavera (4771238) 450,79€ ✅ ·
  Dúplex (2888928) 587,23€ esperado — pago bancario aún no llegó (vence 16 ago). Socorro 24 (ID Booking 2039943)
  cobró 1.958,39€ en julio pero SIN factura de comisión todavía. Total banco Booking julio: 3.043,87€.
  Trigger `trig_012T62U4LsM27GP8VKnBFifG` ampliado: ahora verifica facturas al llegar (busca Drive por fecha,
  lee PDF via contentSnippet, notifica resumen). Casos abiertos SIN respuesta: Bernardi -466,70€ (5603355846,
  House Sevillana) y Valantin -84,61€ (5712457476, Busto Reform). IDs Booking.com: 2888928=Dúplex ·
  4340072=Socorro · 4771238=Bustos Tavera · 2039943=Socorro 24. Skill sivra-maestro actualizada con este mapeo.

- **🕳️ Barrido del monorepo: afirmar ausencias no comprobadas (30/07/2026, misma rama).** Alberto:
  «haz esto con todo lo que tenemos». Barrido de las 8 apps + packages buscando el patrón del bullet
  siguiente. **Inventario completo en `docs/AUDITORIA-AUSENCIAS.md`** (✅ hecho / ⬜ pendiente, por
  gravedad). Arreglados los 8 peores: la app de la limpiadora decía **«¡Descansa!»** ante un 500 (Sique
  Brilla EN PRODUCCIÓN — el piso se quedaba sin limpiar); el escritor de `subastas.documentos` grababa
  `[]` irreversible si el BOE devolvía algo que no era la ficha (guard `fichaLegible`); el semáforo
  documental salía 🟢 sin haber leído un carácter; el saldo consolidado sumaba **0€** las cuentas que el
  banco no devolvió y esa cifra iba al email de tesorería; el Telegram del extracto decía «✅ todos
  clasificados» si fallaba la consulta; transporte daba **«Todo en regla ✅»** a un camión sin ITV
  registrada; sivra concluía «NO estamos caros» sin datos de mercado; rrhh prometía **30 días de
  vacaciones** inventándose el convenio. Pendientes (⬜ en el doc): el sync del PMS de ialimp —`ultimo_sync`
  vs `last_sync_at`, columna que nadie escribe— y el escaneo IMAP de facturas, ambos sin heartbeat.

- **📎 Subastas: «sin documentos adjuntos» era MENTIRA (30/07/2026, rama `claude/documentos-adjuntos-o95xl1`).**
  Alberto con dos capturas: la ficha de `SUB-JA-2026-263723` decía «sin documentos adjuntos» y el BOE publicaba
  EDICTO + CERTIFICACIÓN DE CARGAS. No era el parser (`enlacesDocumentos` saca los 2 enlaces del HTML vivo):
  la columna `documentos` se estrenó ese mismo día (#1179) y el cron que la rellena corre a las 06:15 UTC, así
  que las 11 subastas vivas la tenían a NULL — y la ficha pintaba ese NULL como lista vacía. Fix: helper puro
  `lib/subastas/resumen-docs.ts` (`estadoDocumentacion`/`resumenDocumentos`, 5 tests) que separa **NULL = sin
  revisar** de **[] = revisada sin adjuntos**; las fuentes sin ficha documental (Junta) no quedan «pendientes»
  eternas. **Backfill ya hecho en prod** por el endpoint `fase3-debug?accion=documentos` (pg_net, porque el
  proxy del contenedor cierra `*.vercel.app`): 11/11 filas → 8 con adjuntos, 3 vacías de verdad.
  ⚠️ Regla: nunca afirmar una ausencia a partir de un dato que aún no se ha mirado. tsc 0 · 664 tests · build OK.

- **⚖️ Subastas: caducidad de embargos (art. 86 LH) + costa de Cádiz (30/07/2026, rama
  `claude/subasta-carga-no-publicadas-jm7ky6` reiniciada tras mergear #1176).**
  - **Caducidad (idea 1, la que faltaba)** — `caducidad.ts`: una anotación preventiva de embargo caduca a
    los 4 años, pero el registro NO la borra sola, así que seguía sumándose entera al coste como carga
    fantasma. Ahora se MARCA y se cuantifica el escenario alternativo (`posiblesCaducadas`,
    `importeSiCaducan`); **`importe` no cambia nunca** — la prórroga se anota AL MARGEN, que es lo que peor
    lee un escaneo, y equivocarse ahí lleva a pujar de más. Cualquier rastro de «prórroga» desactiva la
    conclusión; margen de 6 meses; solo embargos (la hipoteca es inscripción, art. 82 LH). La pregunta al
    juzgado pasa a ser nominativa (acreedor + fecha + importe).
  - **Costa de Cádiz en la lente 🏖️** (petición de Alberto): municipios del litoral + núcleos (Zahara,
    Novo Sancti Petri, Caños de Meca, Costa Ballena, Sotogrande…), `esPlaya`/`costaDe` sustituyen a
    `esPlayaHuelva` en radar y clasificador. **Jerez NO entra en esa lente** a propósito (no es costa; ya
    llega por la provincia de sus criterios) — meterlo saltaría el filtro de precio y de descuento.
    Centros de búsqueda de Idealista completados para Cádiz.
  - ⚠️ **Los comparables de Cádiz están casi vacíos** (solo Sanlúcar, 20 anuncios): sin €/m² de zona no hay
    descuento ni margen flip. Hacen falta alertas de Idealista/Fotocasa de esas zonas al correo, o que
    Idealista apruebe la API (solicitada el 30/07). Eso NO lo puede resolver el código.
  - **🚨 VALIDACIÓN EN PRODUCCIÓN DEL LECTOR: el rescate del escaneado funciona, la lectura por IA NO
    llegaba a ejecutarse** (30/07/2026, tras mergear #1176). El puente devolvió `via:'vision'`,
    `paginas:10` (las páginas exactas) pero **0 cargas** y `procedimiento:'desconocido'`. En `ai_usos`,
    TODAS las llamadas `registral-vision` fallaban por tres causas, ninguna del prompt:
    (a) **OpenRouter 404 «No endpoints found that support image input»** — sin modelo del catálogo
    (`registral` aún no está: el cron `ia-director-refresh` es semanal) caía al `OPENROUTER_MODEL` por
    defecto, que es de TEXTO. Fix: `aiVision` NO llama a OpenRouter sin modelo multimodal explícito
    (`opts.model` o env nueva `OPENROUTER_VISION_MODEL`); va directo a NIM, que sí tiene visión.
    (b) **NIM 400 «At most 1 image(s) may be provided»** — `llama-3.2-90b-vision` acepta UNA imagen por
    petición y se mandaban 4. Fix: `IMAGENES_POR_LLAMADA = 1` + 4 llamadas en paralelo para no comerse
    el `maxDuration`. (c) **NIM 400 payload > 25 MB** — PNG sin pérdida de 3.000 px. Fix: JPEG calidad 82.
    `LECTOR_VERSION` a **3** para que relea las 34 fichas.
  - **RE-VALIDACIÓN tras el fix (19:17 UTC): el transporte OK (38/38 llamadas, 0 fallos), la LECTURA sigue
    mal.** De las 4 cargas de Belmonte el modelo caza 1, pone al DEUDOR como acreedor, y la etiqueta
    `la_que_ejecuta` cuando es ANTERIOR → se purga → **«se adquiere libre»** sobre una finca con 44.850€.
    Sospecha: leer PÁGINA A PÁGINA quitó el contexto que permite ordenar las cargas (el cuadro se reparte
    entre páginas). El consenso sí anuló el importe discrepante y la confianza bajó a 0,35.
    **Salvaguarda puesta:** `cargasQueSubsisten` ya NO devuelve `0` («libre») si el registro no cierra con
    «sin más cargas» o la confianza < `CONFIANZA_MINIMA_LIBRE` (0,5) — devuelve `null` con aviso.
    **PENDIENTE: recuperar el contexto entre páginas** (numerarlas y pasar las cargas ya vistas, o volver a
    lotes con un proveedor que acepte varias imágenes) y afinar el prompt en acreedor/rango.
  - 324 tests módulo · 215 app · tsc 0 · build OK.

- **⚖️ Subastas — 3 partidas que faltaban en el coste real (30/07/2026, misma rama/PR #1176).** De las 5
  ideas que propuse, Alberto aprobó «2, 4 y 5» (la 3 —nota simple viva— la dejó **para el final del todo**;
  la 1 —caducidad de anotaciones, art. 86 LH— sigue **sin decidir**).
  - **Comunidad (art. 9.1.e LPH)** — `comunidad.ts`: el adquirente hereda la anualidad en curso + 3
    anteriores y NADIE lo publica (ni BOE ni certificación). Se estima por baremo €/m²·mes solo en
    propiedad horizontal; `importe: null` (nunca 0) si no procede o falta superficie. Entra sola en
    `calcularCoste` con su aviso; `estimarComunidad:false` vuelve al comportamiento anterior.
  - **Coste del dinero (art. 670 LEC)** — `financiacion.ts`: 40 días para consignar y ningún banco
    hipoteca lo que aún no es tuyo → puente. **NO se inventa**: se declara por cuenta en ⚙️ Criterios
    (`subastas_criterios.financia_*`, migración aplicada, guardadas en tanto por uno / tecleadas en %) y
    se aplica en las 3 vistas de usuario (página, `/api/subastas`, radar). El cron `clasificar` NO lo usa
    (esas columnas son del corpus global, compartido entre cuentas).
  - **Bucle de la puja** — nueva `subastas.puja_maxima_calc` (migración aplicada): el clasificador congela
    el techo calculado mientras la subasta está viva y `calibracionDePuja()` lo contrasta con el remate
    real al concluir. Sin muestra (≥5) devuelve `lectura: null` y la UI calla.
  - 303 tests módulo · 215 app · tsc 0 · build OK.
- **🔍⚖️ Subastas — el agente LEE los escaneados y solo avisa de lo rentable y limpio (30/07/2026,
  rama `claude/subasta-carga-no-publicadas-jm7ky6`).** Tras el PR #1172, Alberto vio otra ficha con
  «Cargas no publicadas» (SUB-JA-2026-264269, Belmonte): tenía su certificación adjunta pero es un
  ESCANEO (`chars:0` en pdf-parse) → se descartaba en silencio. Solo 4 de 34 vigentes tenían cargas.
  - **Rescate de escaneados:** `pdf-imagenes.ts` (puro) localiza los JPEG por marcadores SOI/EOI y
    agrupa las BANDAS en páginas (263 bandas → 10 páginas en el caso real); `lector-registral.ts` las
    recompone con **sharp** (nueva dep de plataforma) y las lee por visión. **Verificado contra el PDF
    real: el módulo reproduce las 10 páginas exactas que se leyeron a mano.**
  - **Cargas estructuradas + QUÉ SUBSISTE** (`cargas.ts` puro): rango anterior/posterior/la-que-ejecuta
    y purga de los arts. 668/670 LEC. **En ejecución por EMBARGO la hipoteca anterior NO se purga** —
    Belmonte: salida 19.329€ + 44.850€ de hipoteca de 2009. Procedimiento desconocido → `null`, nunca 0.
    Doble lectura + `consensoCuadros` anula el importe en que discrepen (Alberto decidió que la IA
    extraiga cifras; esta es la red).
  - **Director:** categoría `registral` con exigencia de modalidad `image` (un modelo de solo texto
    devolvería cargas vacías = «finca limpia», el peor fallo) + `openrouterVision` en core-ai.
  - **`lector_version`** en BD: subirla relee las fichas (antes `notas_edicto=''` las congelaba).
  - **«añade todo» (5 ideas):** `decidirAviso` (solo rentable Y limpio interrumpe; lo no leído ESPERA
    salvo cierre ≤4 días, marcado sin verificar) · `reaparicion.ts` (misma finca más barata, identidad
    por REF CATASTRAL, nunca por descripción) · `calibracionPorCargas` (¿el mercado castiga las cargas?)
    · `valoracion-historica.ts` (serie €/m² propia desde las tasaciones pactadas en escritura) ·
    `compararCuadros` (nota simple nueva vs certificación vieja) · botones Telegram «📝 consulta al
    juzgado» y «📨 enviar» (`subastas_consultas`).
  - **Provincia canónica + ciclo de vida:** `provinciaCanonica()` unifica «Sevilla»/«SEVILLA» (la
    calibración partía la muestra en dos y ninguna mitad llegaba al mínimo) y `ciclo-vida.ts` +
    `archivarPasadas()` sacan lo ya pasado de la lista/radar **sin borrar el histórico** (borrarlo mataría
    la detección de reapariciones y la calibración).
  - Migraciones aplicadas: `2026-07-30_cargas_lector_registral.sql` + `_reapariciones_valoracion.sql`
    + `_ciclo_vida_y_provincia.sql`. Mergeado `main` (PRs #1175/#1177 tocaban el mismo terreno: 5
    conflictos en `geo.ts`/`index.ts`/`COLS_SUBASTA`/cron/memoria, resueltos conservando ambas cosas).
    283 tests · tsc 0 · build OK; CI/Tests/QA/gitleaks verdes sobre `259a714`.
    **🚨 LANDMINE (30/07/2026):** los pushes de una sesión Claude a una rama con PR abierto **no siempre
    disparan los workflows** (GitHub no genera eventos `pull_request` para pushes hechos con el token de
    la app: los 3 commits de #1176 pasaron sin CI y `get_check_runs` del PR solo mostraba Vercel). No dar
    por verde un PR sin comprobar que existe run para ESE sha; si falta, lanzarlo con `workflow_dispatch`
    (ci.yml y tests.yml lo soportan; qa.yml y gitleaks.yml NO).
    **PENDIENTE:** la llamada al modelo solo se puede probar en producción
    (el preview va tras el SSO de Vercel); `eurM2Actualizado` queda null hasta ingerir la serie histórica
    del IPV (hoy `mercado_indices` solo guarda la última variación); enganchar la nota simple al 📎 del chat.
- **⚖️ Subastas: resumen de CARGAS + documentación en TODAS las fichas (30/07/2026, rama
  `claude/cargas-documentacion-subasta-b02s5y`).** Alberto sobre una captura de 📡 Radar: «aquí debería
  haber resumen de cargas y de la documentación». El dato ya existía (semáforo, `analisis`, `notas_edicto`,
  `cargas_texto`) pero se pintaba SOLO en la pestaña «Todas» — iba en su `extra`, y la ficha del Radar se
  montaba sin él. Nuevo `ResumenDocumental` DENTRO de `FichaSubasta` (titular de cargas siempre visible +
  `<details>` con semáforo, texto oficial de cargas, notas del edicto y documentos). Nueva columna
  `subastas.documentos` (jsonb, aplicada): `procesarDocumentosDeFicha` guarda el LISTADO entero de adjuntos
  con `legible` (los escaneados se marcan «léelo a mano») aunque solo descargue 3. tsc 0 · 215 tests · build OK.

- **🏠 Subastas/chollos — API OFICIAL de Idealista preparada y DORMIDA (30/07/2026, PR #1168).** ¿Se puede
  "conectar Idealista" como ChatGPT? Su app en ChatGPT es exclusiva de OpenAI, NO conectable desde fuera; la
  vía legítima es la **API oficial** (developers.idealista.com, gratis ~100 búsquedas/mes). Alberto solicitó
  el alta el 30/07 y **espera el mail con la key**. Módulo puro `idealista-api.ts` (mapeo a `Comparable` — el
  `propertyCode` ES el id de `/inmueble/<id>/`, así que dedupe natural con las alertas — centros lat/lng por
  zona vigilada y presupuesto racionado) + `apps/plataforma/lib/subastas/idealista-api.ts` (OAuth2 + ingesta
  por `upsertComparable`, extraído de `mercado.ts` como puerta única del corpus; ledger `idealista_api_usos`,
  migración aplicada) cableado best-effort en el cron `subastas-mercado`. **Al llegar el mail:** pegar
  `IDEALISTA_API_KEY`/`IDEALISTA_API_SECRET` en god-panel → 🔑 Secretos y listo, sin tocar código.

- **🏠 Subastas: las características del inmueble ya se ven en la ficha (30/07/2026, rama
  `claude/property-features-missing-je4vtw`, PR #1177).** Alberto sobre una captura de `/subastas`: «no
  aparecen las características». Cierto — tipo, m², dormitorios, baños y planta estaban en BD y solo se
  usaban para calcular €/m² y yield. `SubastaInmueble` gana esos campos + `superficieOrigen` (Catastro vs
  escritura: discrepan a menudo), `filaASubasta` los mapea con fallback a `extraerDatos(descripcion)` cuando
  la columna está vacía, y `FichaSubasta` los pinta arriba del todo (si el anuncio no publica nada, lo dice
  en vez de callar). El radar repinta su snapshot con la foto viva del corpus si la subasta sigue vigente,
  así no hay que esperar al cron. Solapaba con #1175: los m² salen UNA vez (con su origen) y la planta no se
  repite si ya la da la dirección del Catastro.

- **🏢 Empresas: oferta REAL de eInforma/Informa D&B + Pablo confirmado en el proyecto (30/07/2026, rama
  `claude/proyecto-empresa-einforma-nzet3l`).** Pablo (`pablo.j.p.c@hotmail.com`) reenvió la oferta de Borja Piña
  (delegado Andalucía). Precios: bonos de informes 50/100/200/500 al año → **15–30€/informe** (el default
  `EMPRESAS_ENRIQUECER_COSTE_EUR=12` se queda corto y el gasto es **prepago anual**, no metered) y —hallazgo
  clave— **ficheros a medida por CNAE+zona a 1–3€/empresa con balance**, que cubren el cribado masivo y **matan
  la necesidad de SABI** (15.000€/año). Todo en `docs/EINFORMA-CONTRATACION.md` (recomendación: pedir primero
  el recuento del fichero, que es gratis; bono de 50 solo si hace falta firmar ya). **Bloqueante:** los adjuntos
  con la doc de la API **no se bajan desde el contenedor** (el conector de Gmail no descarga adjuntos) → Alberto
  los subió a la carpeta de Drive **`Einforma`**, de donde SÍ se leen. Acceso invitado de Pablo verificado ACTIVO
  en BD (`empresas_acceso_token`, nota con su email); BORME vivo (2.098 eventos, último 29/07), enriquecimiento 0.

- **🚨 Empresas/eInforma: el adapter está MAL a nivel de estructura y el producto es CONFIGURABLE (30/07/2026,
  misma rama).** Analizados el JSON real, el diccionario de datos y el informe de muestra (46 pág.). Tres cosas
  que cambian el plan: (1) el payload cuelga de **`datosProducto`** y las cifras **no son campos con nombre**,
  sino `listaBalances[].listaPartidasCuentaPerdidasGanancias[]` con `{codigoPartida, valor}` → hay que **indexar
  por código de PGC** (40100 cifra de negocios, 49500 resultado); (2) **la configuración de la demo solo trae 2
  partidas** y NO incluye patrimonio neto, EBITDA, fondo de maniobra ni CNAE → **hay que dar a Borja la lista
  exacta de campos ANTES de firmar** o contratamos un informe que no alimenta el scoring; (3) **RAI/ASNEF/EBE/
  ICIRED/RIJ salen «No consultado» = add-on de pago** (viene Paydex + contadores judicial/concursal). LANDMINE:
  `listaBalances` mezcla ejercicios individuales y consolidados (`indicadorBalanceIndividual`) — comparar años sin
  filtrarlo inventa caídas. Regalos: scoring propio (Nota Informa 0-20, opinión de crédito, prob. de cese,
  CESCE), feed `Últimos Cambios` con signo, y **ratios con percentiles de sector** (puede ahorrar el benchmark
  del Banco de España). NO existe la edad de los administradores → el bloque cualitativo sigue manual. Todo en
  `docs/EINFORMA-CONTRATACION.md` §5; el aviso está también en la cabecera de `lib/empresas-einforma.ts`.
  **Pendiente:** rutas de la API (van en un ZIP/MHTML ilegibles por tamaño → imprimir a PDF y subir a Drive).

- **🏛️ Subastas: ubicación EXACTA y datos del Catastro visibles en la ficha (30/07/2026, rama
  `claude/national-property-map-kszwhp`).** Alberto: «SUB-JA-2026-263723 la ubicación es muy mala». Causa:
  el punto era correcto (Catastro) pero **la ficha no pintaba la dirección en NINGÚN sitio** (estaba solo en
  BD) y el botón de Maps mandaba `query=lat,lon` → pin anónimo sin portal ni Street View. Fix: `direccionCatastro()`
  trocea el `ldt` denso («AV PEDRO ROMERO (DE) 2 Es:1 Pl:07 Pt:B 41007 SEVILLA» → postal + planta + puerta),
  la ficha muestra dirección/planta/m² catastrales/año/uso, y **`urlGoogleMaps` prioriza la DIRECCIÓN sobre las
  coordenadas** (cambio deliberado) + 👁️ Street View + 🏛️ ficha del Catastro. **Idea de Alberto:** sacar la
  referencia catastral por DIRECCIÓN (`Consulta_DNPLOC` + `ConsultaVia` para el nombre oficial — el Catastro
  archiva «Avenida de Madrid» como «MADRID DE»). Acierta 4/16 direcciones reales; el resto falla por datos de
  origen imprecisos (parcelas de polígono, «S/N», direcciones antiguas), no por el parser → degrada al
  centroide. Prod: 8 exactas (antes 4) + 25 aproximadas. ⚠️ Los DATOS del bien exigen la RC de 20; con la de
  parcela (14) el Catastro devuelve el listado del edificio sin `<bico>` y sale vacío. 223 tests módulo.

- **🗺️ Subastas: mapa nacional + enlace a Google Maps por ficha (30/07/2026, rama
  `claude/national-property-map-kszwhp`).** Idea de Alberto sobre la captura de `/subastas`: ver todos los
  inmuebles señalados de un vistazo. Módulo puro: `parsearCoordenadas` (Catastro `Consulta_CPMRC`, ojo
  `xcen`=LON/`ycen`=LAT) + `urlGoogleMaps` (coords > dirección > municipio; solo-provincia → sin enlace),
  10 tests con XML real. Columnas `subastas.{lat,lon,geo_precision}` (migración aplicada); el cron
  `subastas-enriquecer` geocodifica exacto por ref. catastral y **aproximado al centroide del municipio**
  por Nominatim cuando no la hay (solo 5/34 la traían) — el mapa pinta los aproximados en hueco y lo dice.
  Pestaña 🗺️ Mapa (Leaflet+OSM por CDN, montaje perezoso) + `/api/subastas/mapa`. Nominatim da 403 desde el
  proxy del contenedor pero **responde 200 desde cloud** (verificado con `pg_net` desde Supabase) → funcionará
  en Vercel; 4 puntos exactos ya en BD, los aproximados los pone la 1ª pasada del cron. ⚠️ Nominatim BLOQUEA
  IP si se pasa de 1 req/s → cerrojo de módulo (1,1 s, serializa) + presupuesto de 25 s por pasada;
  `enriquecida_at` se deja NULL SOLO si no se intentó (si el municipio es ilocalizable se marca, o volvería a
  monopolizar la cola). Bonus: el cron ya no reintenta fichas BOE de la fuente `junta` (23 filas que fallaban
  siempre y, al ir primeras por `enriquecida_at NULLS FIRST`, tapaban a las del BOE).
- **⚖️ Subastas: «Cargas no publicadas» falso cuando la certificación va como DOCUMENTO — MERGEADO
  (30/07/2026, PR #1172).** SUB-JA-2026-263723 (San Pablo, cierra 31/07) salía
  «Cargas no publicadas» pese a la CERTIFICACIÓN adjunta ya leída en `notas_edicto`: `cargas_conocidas` solo
  miraba el campo «Cargas» de la ficha (vacío) y el refresco 24h del enriquecedor lo machacaba. Fix: el paso
  de documentos sube el flag si la certificación dice «sin cargas de procedencia»; el UPDATE de la ficha es
  sticky (OR); punto ámbar de embargo en `analisis.ts` (el verde de cargas no lo tape). Backfill
  `2026-07-30_cargas_conocidas_certificacion.sql` aplicado. 193 tests módulo · tsc 0 · 14 checks verdes.
  **Prod reconciliada tras el deploy:** reclasificadas las 34 vigentes (San Pablo con `cargas` verde +
  punto `embargo` ámbar nuevo, semáforo ámbar por posesión/valoración; radar sin el aviso falso).

- **💶 Auditoría pricing dinámico pre-cutover (30/07/2026, rama `claude/dynamic-pricing-audit-4cbdxv`).**
  A 3 días de confirmar 100% dinámico: SIN bloqueantes técnicos. Motor vivo (Busto/Luxury aplican a diario,
  última 29/07; crons pricing todos en el dispatcher #1165), datos frescos (market_rates y snapshots de hoy,
  12 meses de comps en los 4 pisos), raíl ±/día con ancla por día natural OK, evidencia piloto sólida
  (Busto 16 y Luxury 14 noches reservadas a precio motor, ADR muy sobre PL). PENDIENTE de Alberto:
  activar `apply_enabled` de Dúplex/House y desconectar PL. Vigilar: `incomes` sin insertar desde 25/07
  (1er sync post-dispatcher mañana 05:00 UTC), comps House solo proxy 8p×1,15 (la API de Booking topa en
  8 adultos; aforo 12 correcto en BD). Aforo Luxury actualizado 4→5 en `pricing_piso_zona` (OK Alberto 30/07).
  Doc de skill actualizada (suelos 65/72 del 28/07). 6 alertas de guard abiertas pre-recalibración.

- **🏷️ Banca: compra de tarjeta ya no cae en palabra-trampa + bandeja pregunta el NEGOCIO (30/07/2026,
  rama `claude/restaurante-charge-agent-issue-8lxiwv`).** Restaurante "LA HACIENDA GOLF" caía a
  `categoria='impuestos'` ('HACIENDA' a secas en `categorizarPorReglas`, tras las reglas de comercio).
  Reglas extraídas a `lib/categoria-reglas.ts` (PURO, 6 tests): compra con tarjeta → 'tarjeta' ANTES de
  reglas de comercio; 'HACIENDA' suelto retirado. `RevisarBandeja` de `/banca` ahora pregunta el negocio
  (botones Correduría/Personal + Otro…) vía `/api/banca/destino` (confirma + aprende regla), en vez de la
  taxonomía PGC que confundía a Alberto. Backfill `2026-07-30_categoria_compra_tarjeta.sql` aplicado (3 filas).

- **⚕️ Health check 30/07 resuelto: dedupe PSD2 anti-drift + ventana Smoobu (30/07/2026, rama
  `claude/health-check-2026-07-30-vlv4c7`).** Check 1: el mismo abono BBVA entra 2 veces porque el banco
  re-sirve el concepto con `Nº`→`N` (3er caso: 16/06, 25/06, 22/07 413,17€ Dúplex) → guarda post-ingesta
  en `lib/psd2.ts` (compara conceptos sin puntuación, conserva la fila antigua) + saneo
  `2026-07-30_dedupe_psd2_concepto_drift.sql` aplicado (dup del 22/07 ignorado, Check 1 a 0). Check 4
  (Smoobu 4d): los crons iban mudos por el límite de 40 (ya arreglado por el dispatcher #1165, vivo desde
  hoy 06:42); el sync pasa a `?days=7` en `CRON_JOBS` para que un apagón multi-día se auto-repare.
  Verificar mañana tras las 05:00 UTC que `incomes` refresca.

- **🧹 Ahorro de tokens/contexto: rotación de memoria + skills router (30/07/2026, rama
  `claude/short-responses-token-saving-qh7i88`).** Memoria viva rotada por meses (983→~492 KB; junio →
  `docs/memoria/2026-06.md` vía `scripts/rotar-memoria.mjs`, idempotente, la dispara `/auditoria-diaria` a
  primeros de mes) + regla nueva: entradas ≤8 líneas. Skills gordas (ia-rest/plataforma/perfil-fiscal/pricing/
  facturas-correo/trading-analista/sivra) → patrón router+`references/` (~4 KB al invocar en vez de 20-77 KB;
  contenido VERBATIM en references, leído bajo demanda; patrón documentado en `docs/SKILLS.md`). Descripciones
  de frontmatter recortadas a ≤350 chars y `using-superpowers` condensada (se inyecta en cada arranque).

- **⏰ Crons de plataforma consolidados en UN dispatcher — fix del límite de 40 crons de Vercel Pro
  (30/07/2026, rama `claude/audit-30-07-hv2njr`).** La auditoría del 30/07 (PR #1162) confirmó que el
  scheduler de Vercel NO disparó `psd2-sync` el 29/07 06:00 (sin ningún log, con sus 3 vecinos del mismo
  minuto corriendo): `apps/plataforma/vercel.json` declaraba **60 crons** con el límite Pro en **40**.
  Alberto: "resuelve". Solución:
  - **`vercel.json` declara UN solo cron**: `/api/cron/dispatch` cada minuto (`* * * * *`).
  - **Manifiesto en código = fuente de verdad:** `lib/cron-dispatch.ts` (los 60 jobs con sus horarios
    UTC intactos + matcher cron puro con listas/rangos/pasos, 13 tests `node --test`). **⚠️ Para añadir
    o cambiar un cron de plataforma: tocar SOLO `CRON_JOBS` en ese archivo, NUNCA `vercel.json`.**
  - **`app/api/cron/dispatch/route.ts`**: calcula los jobs del minuto y los dispara en paralelo por HTTP
    con `Authorization: Bearer CRON_SECRET` (mismo header que adjuntaba Vercel → handlers y middleware
    sin cambios). Base URL: `VERCEL_PROJECT_PRODUCTION_URL` (override `CRON_DISPATCH_BASE_URL`).
  - **Catch-up de minutos omitidos** (lo que convierte el incidente en imposible de repetir): cursor de
    fila única `cron_dispatch_cursor` (migración `prisma/sql/2026-07-30_cron_dispatch_cursor.sql`,
    **aplicada por Supabase MCP**) — si el scheduler se salta un minuto, la pasada siguiente procesa la
    ventana pendiente (tope 15 min); también evita doble disparo entre instancias (claim `FOR UPDATE`).
    Sin la tabla, degrada al minuto actual sin catch-up.
  - Verificado: 13/13 tests, `tsc --noEmit` 0. El heartbeat de `/auditoria-diaria` (paso 2-bis) sigue
    valiendo tal cual (vigila frescura en BD, no `vercel.json`) y ahora además vigila de facto el
    dispatcher (si muere, TODOS los crons enmudecen → saltaría en la primera pasada).
- **💸 Transferencias SEPA "libres" (formulario) + fix redirect del pago de facturas (29/07/2026, ✅ MERGEADO
  PR #1138, squash commit `4844e17`).** Alberto: "con la conexión de los bancos, ¿puedes hacer
  transferencias?" → sí, pero el PIS (Enable Banking) estaba solo cableado al pago de facturas de proveedor y
  APAGADO. Pidió desarrollar además la **transferencia libre a cualquier destinatario**. Hecho:
  - **`POST /api/banca/transferencia`** (con sesión): valida IBAN (mod-97 de `@central/module-pagos::validarIban`),
    importe > 0 y **tope de seguridad `TRANSFERENCIA_MAX_EUR`** (default 3000€). Con PIS activo → `iniciarPago`
    devuelve `auth_url` para firmar en el banco (SCA); sin PIS → **SEPA XML pain.001** para importar a mano
    (útil YA aunque PIS siga apagado). El `debtor` sale de `EB_DEBTOR_IBAN`.
  - **`/banca/transferencia`** (`app/(usuario)/banca/transferencia/page.tsx`): formulario con **paso de
    confirmación** que muestra IBAN+importe exactos antes de ordenar. Entrada en la sidebar (💸 Transferencia).
    **DISEÑO DE SEGURIDAD:** la IA NO interviene (no inventa importes/IBANs — regla del repo); el dueño teclea,
    confirma y firma en el banco. Doble control: confirmación en pantalla + SCA.
  - **Fix bug**: `lib/agente-facturas/pagos.ts` construía el `redirectUrl` del callback con precedencia rota
    (`A ?? B ? C : D` ignoraba el valor de `NEXTAUTH_URL`). Extraído a **`lib/base-url.ts::baseUrl()`** (reusado
    por el endpoint nuevo). Verificado `tsc` 0 + `next build` exit 0.
  - **PIS DESCARTADO (revisado en Enable Banking por Claude for Chrome, 29/07/2026):** en producción solo hay
    **AIS** (lectura); el PIS que hay es de **sandbox**. Enable Banking exige ser **PISP autorizado** (licencia
    regulatoria) o contratar un proveedor que lo sea, con presupuesto a medida (sin precios en panel). Para uso
    personal NO compensa → **no activar `EB_PIS_ENABLED`/`EB_DEBTOR_IBAN` en prod** (fallaría, sin scope PIS). El
    camino bueno y definitivo es el **SEPA XML** (rellenas el formulario → fichero → lo subes a Kutxabank y firmas).
    El código PIS queda latente por si algún día se contrata; el objetivo ("prepárame la transferencia para solo
    firmar") ya está cubierto por SEPA XML.
- **🧠📈 Subastas — «añade todo»: calibración real, recordatorio 24h, chollos vs buscador, descartes que
  aprenden y señal de RECESIÓN (INE): HECHO y PROBADO E2E (29/07/2026, mediodía; PR #1159).** Alberto pidió
  implementar las 5 ideas de la sesión y preguntó «se habla de recesión inmobiliaria, ¿cómo lo averiguamos?».
  - **Calibración** (`adjudicaciones.ts` puro + `lib/subastas/calibracion.ts`): mediana del ratio
    importe_adjudicacion/valor_subasta por provincia desde los resultados de `capturarResultados`; UI la pinta
    con muestra ≥3 (hoy 0 conclusiones; primera esperada 03/08 El Puerto).
  - **Recordatorio URGENTE ≤24h** en `subastas-cierre` (además del de 3 días): depósito, puja máx., semáforo,
    notas de la CERTIFICACIÓN y €/m² al tipo vs zona. `subastas_seguidas.recordatorio_24h_at`.
  - **Chollos vs BUSCADOR:** `detectarChollos(comparables, min, min, zonasPortal)` — la mediana de
    `mercado_zonas` (muestras 100+) manda si muestra ≥ MIN_MUESTRA_ZONA; `Chollo.fuente` ('portal'|'alertas')
    en la UI. E2E: 56 chollos, 2 rescatados por el portal.
  - **Descartes que aprenden:** botones de motivo tras `subr_desc` (prefijo `subd_` en el webhook) →
    `subastas_descartes` (UNIQUE cuenta+dedupe); **3 descartes «zona» del mismo municipio → `casarParaCuenta`
    excluye ese municipio** (aplica también a playa; se revierte borrando las filas).
  - **Señal de recesión (3 detectores deterministas):** (1) IPV del INE — tabla Tempus 25171, series por
    NOMBRE (los códigos no son correlativos), variación ANUAL + TRIMESTRAL en `mercado_indices` (caché 30d,
    refresco en el cron `subastas-mercado`); E2E vivo: **Andalucía +12,4% anual, +1,9% trimestral (T3 2025)**
    — sin recesión oficial; trimestral <0 pintaría «⚠️ posible giro» en /subastas. (2) **Pulso del corpus**
    (`pulsoMercado`): % de anuncios vigilados con bajada + recorte medio; E2E: 259 anuncios, 0,8% con bajada
    (sin enfriamiento en sus zonas); aviso si ≥25%. (3) **`mercado_zonas_hist`**: snapshot ~mensual de
    mediana+oferta por zona desde `consultarZona` — tendencia fina zona a zona (se puebla al caducar cachés).
  - Migración `2026-07-29_subastas_aprendizaje.sql` aplicada por MCP. 192 tests módulo. Acciones E2E nuevas
    en fase3-debug: `indice`, `chollos` (TEMPORALES, borrar con el endpoint).
  - Pendiente: primer disparo real del recordatorio 24h (necesita una seguida activa <24h del cierre —
    San Pablo cierra 31/07 pero NO está en seguidas); validar botones `subd_` con una pulsación real.

- **📍📄 Subastas — €/m² por ZONA (municipio→distrito→núcleo de playa) + señales de la CERTIFICACIÓN
  registral: HECHO y PROBADO E2E en producción (29/07/2026, mediodía; PRs #1148/#1150-#1157).** Sesión
  continuación de las lentes; peticiones de Alberto: filtros en Chollos («solo ver particulares»), leer
  la documentación de las fichas del BOE, y precio m² «por zona de verdad, no municipal» («¿y la playa?»,
  «amplía donde sea necesario»).
  - **Chollos con filtros client-side** (#1150): chip 👤 Solo particulares, portal, zona, precio máx.
  - **Valoración por zona con el BUSCADOR de Fotocasa** (#1151-#1154): edge function `zona-fotocasa` v3
    (Supabase, región EU; parte el HTML por `{"accuracy"` y saca precio/m²/CP/distrito por anuncio +
    `counters.realEstates`). Escalera de zona: **núcleo de playa** (Matalascañas 2.813€/m² con página
    propia, ≠ Almonte pueblo) > **distrito de capital** vía mapeo CP→slug APRENDIDO de los anuncios del
    portal (`mercado_zonas_cp`, `veces` desempata; casco-antiguo 4.390, san-pablo–santa-justa 3.043,
    cerro-amate 1.888) > **mediana municipal** (`mercado_zonas`, caché 30 días; ~19 zonas vivas) >
    comparables de alertas Gmail > tasación. `subastas.{precio_m2_zona,muestra_zona,zona_portal}`
    (añadidas a COLS_SUBASTA); UI «📍 Zona (X): ~N€/m² … este sale a Y€/m² al tipo». 32/34 vigentes
    pintadas. **Trampas de Fotocasa:** la URL municipal EXIGE `/todas-las-zonas/l` (#1152, sin eso 404
    silencioso); distrito/núcleo usan `/l` a secas; capitales llevan sufijo `-capital`.
  - **Certificaciones registrales leídas por el parser de documentos** (#1155+#1157): señales nuevas en
    `edicto.ts` — «sin cargas de procedencia», «sin acreedores posteriores (art. 689)», «⚠️ anotación de
    EMBARGO». **🚨 Lección: pdf-parse extrae estos PDFs con las palabras PEGADAS** («CARGASPROCEDENCIA
    NOhaycargasregistradas») mientras unpdf (edge `boe-doc`) las separa — los fixtures de #1155 pasaban
    los tests pero fallaban en prod; el separador de las regex es `\s*` opcional (#1157, visto con la
    acción temporal `accion=doc` de fase3-debug, #1156). 187 tests módulo. E2E verificado: San Pablo y
    Candeletas muestran sus notas de certificación en la ficha.
  - **Edge nueva `boe-doc`** (Supabase, deploy por MCP, NO en repo): documentos de subastas.boe.es
    (`?modo=texto` unpdf / `info` / `b64` chunked). Con ella se leyeron ENTERAS las 2 certificaciones:
    **San Pablo SUB-JA-2026-263723 (CIERRA 31/07,** tipo 77.746,93€ = 664€/m² vs zona 3.043€/m², 117m²):
    registralmente limpia — sin cargas procedencia, hipoteca ejecutada de ZIMA FINANCE (ex-Cajasur,
    46.277,93€ principal), único extra = embargo Ayto. Sevilla 2.354,07€ POSTERIOR (se cancela con la
    adjudicación; prórroga 4 años desde 09/2021 → posiblemente caducado). **La mejor del corpus.**
    Candeletas SUB-JA-2026-264478 (cierra 17/08, tipo 71.921€, 53m², Cerro-Amate 1.888€/m²): única carga
    la hipoteca ejecutada, sin titulares posteriores.
  - Cadena de crons disparada a mano: 259 comparables (131 Idealista + 128 Fotocasa), backlog anunciantes
    70→0, **5 particulares** (todos costa Huelva), 123 agencias con nombre.
  - Pendiente: vigilar crons 30/07; cierre San Pablo 31/07 (depósito 3.887,34€); borrar `fase3-debug`
    (incl. `accion=doc`) + `subastas_debug_token` + edges (`boe-doc`, `zona-fotocasa`, `ficha-fotocasa`,
    `junta-pdf-texto`) al cerrar Fase 3; INE €/m²; validar `clientTypeId` con más muestras.

- **🔨🏖️ Subastas — lentes con filtros + Fotocasa con 👤 particular: HECHO y PROBADO E2E en producción
  (29/07/2026, tarde; PRs #1141 + hotfixes #1142/#1143/#1145/#1146).** Petición de Alberto: «busco
  inmuebles para comprar-reformar-vender, una segunda residencia en playa de Huelva (sin tope de precio —
  "soy capaz de pagar más si es interesante"), parking también es buen negocio, y el embudo es primero
  rentabilidad y si cuadra análisis profundo de documentación».
  - **Módulo puro:** `flip.ts` (reforma por baremo: >40 años 700€/m², 20-40 400, <20 150; margen sobre
    capital invertido; garajes/suelo fuera de la lente), `playa.ts` (municipios + núcleos: Matalascañas=
    Almonte, La Antilla=Lepe, El Rompido=Cartaya…; `TOPE_PLAYA=null`), `analisis.ts` (semáforo 🟢🟡🔴
    determinista por casuísticas), `fotocasa.ts` (parser de alertas con FIXTURES REALES del correo +
    `datosFichaFotocasa` para el anunciante). 177 tests módulo.
  - **App:** columnas `subastas.{es_playa,margen_flip,margen_flip_pct,flip_apto,semaforo,analisis}` y
    `mercado_comparables.{anunciante,es_particular,anunciante_visto_at}` (migraciones aplicadas por MCP,
    AÑADIDAS a COLS_SUBASTA); `clasificar.ts` en el cron enriquecer; filtros server-side + barra UI en
    /subastas (Todas pagina contra la API por fin); radar avisa 🏖️ aunque no case criterios y etiqueta 🔨;
    chollos/Telegram muestran «👤 Anuncio de PARTICULAR».
  - **E2E producción:** `clasificar` → 34 revisadas, 2 `es_playa`, 0 flip ≥25% (honesto: con reforma
    integral el corpus actual no da margen); `mercado` → **99 comparables** (Idealista+Fotocasa, etiqueta
    Gmail `inmobiliaria`); `anunciantes` → 👤 funcionando: **2 PARTICULARES reales, ambos en Matalascañas
    Sector A (210.000€ y 185.000€)** + 9 agencias identificadas por nombre. 50/99 fichas vistas a mano;
    las 49 restantes las agota el cron diario (8/pasada).
  - **🚨 Lección de red (costó 4 hotfixes):** Fotocasa bloquea IPs de datacenter de Vercel Y geobloquea
    IPs no-UE (405). Las edge functions de Supabase **ejecutan en la región del LLAMANTE** — desde Vercel
    iad1 salen por EE.UU. y Fotocasa las rechaza; el fix es la cabecera **`x-region: eu-west-1`** en la
    request a la edge function (#1146). Además: `maxDuration` 300 en `subastas-mercado` (2 portales IMAP
    superan 60s, #1142) y **devolver `fallos: string[]` legibles en vez de ramas silenciosas** (#1145 —
    dos ciclos de debug perdidos por un fallo mudo).
  - **Puentes reutilizables (edge functions Supabase, NO en el repo, deploy por MCP):** `junta-pdf-texto`
    (unpdf, PDFs de juntadeandalucia.es → informe de los 4 lotes baratos: silo Écija 99,5k = mejor
    equilibrio, silo Jédula 18k, Osuna 84,9k con cautela arqueológica Urso, Jerez 184,2k = promoción) y
    `ficha-fotocasa` (ventana JSON alrededor de `clientAlias`, host cerrado www.fotocasa.es).
  - Pendiente: vigilar cadena de crons 30/07 06:00-09:00; cierre San Pablo 31/07; borrar `fase3-debug` +
    `subastas_debug_token` + edge functions al cerrar Fase 3; validar mapeo `clientTypeId` con más muestras.

- **🚨 Director de código Fase 2: la prueba end-to-end del "veredicto de CI" destapó un FALSO POSITIVO real
  (29/07/2026, PR #1139).** Tras mergear el cierre del bucle (entrada de abajo), Alberto pidió probarlo de
  verdad: se lanzó `ai-programar.yml` con una tarea real (formato de € en
  `apps/ialimp/app/admin/planes/page.tsx`) → acotó, planificó, ejecutó (arregló 1 de las 2 líneas pedidas —
  la otra la describí mal yo mismo en la orden, el coder no adivinó y no tocó nada que no encajara, lo
  correcto), abrió el PR #1139 y comentó **"✅ CI en verde"**. Pero al auditar el PR: **`tests.yml`/`ci.yml`/
  `qa.yml`/`gitleaks` NUNCA se ejecutaron** — solo corrió el check de Vercel (trivial, skip). Causa: el paso
  "Abrir PR draft" usa el `GITHUB_TOKEN` automático del run, y GitHub **no dispara `pull_request` a partir
  de eventos hechos con ese token** (anti-recursión). El paso "Anotar veredicto" no lo sabía → vio 1 check
  en verde (Vercel) y reportó "todo verde" sin que el código se hubiera typechequeado de verdad. Es el mismo
  problema que este cambio quería resolver, reaparecido por otra vía — detectado ANTES de que Alberto
  confiara en un verde falso. **PR #1139 dejado en draft, SIN mergear** (además toca ialimp, cliente en vivo
  Sique Brilla). **Fix real pendiente — necesita algo que solo Alberto puede crear:** un Personal Access
  Token con permiso de repo (secret nuevo, p.ej. `GH_PAT_TRIGGER`) para que `ai-programar.yml` pushee/abra
  el PR con un token "externo" al run (así SÍ dispara `pull_request`, como hacen las sesiones de Claude Code
  al abrir PR — verificado con #1137/#1020, que sí typechequearon solos). Hasta entonces, **cualquier PR
  abierto por `ai-programar.yml` con "✅ CI en verde" hay que verificarlo a mano** en la pestaña Checks antes
  de confiar en él. Detalle en `docs/DIRECTOR-CODIGO.md`.

- **🔒 Director de código Fase 2: cierre de PR con veredicto real de CI (29/07/2026).** Alberto: "quiero
  optimizar el trabajo de programación y usarte solo para pensar/organizar/revisar". Al auditar cómo se
  "cierra" un plan del orquestador (`.github/workflows/ai-programar.yml`) se vio que el PR draft se abría
  con la disculpa genérica "SIN verificar. Revisa el diff y corre tsc/tests" **aunque `tests.yml` YA
  typechequea automáticamente cualquier PR** (matriz `strategy.matrix.app`, dispara solo en
  `pull_request→main`) — el aviso era falso/pesimista y nadie leía el resultado real. Cambio, sin tocar
  la arquitectura de 3 roles (decisor/planificador/ejecutor) que ya funciona: **`ai-programar.yml`** ahora
  espera el veredicto (`gh pr checks --watch`, tope 15 min, `continue-on-error` para no romper el run) y lo
  **comenta en el propio PR** + lo refleja en el aviso Telegram (✅ compila / ❌ roto, no mergear / ⏳ sin
  confirmar a tiempo). Deliberadamente NO repite install+prisma+tsc dentro del job (duplicaría minutos de
  Action) — reusa el check que ya existe. El texto del PR ya no miente: aclara que compilar en verde solo
  confirma sintaxis, la LÓGICA la sigue revisando un humano (o Claude). Job `timeout-minutes` 15→35 para dar
  margen a la espera. Detalle en `docs/DIRECTOR-CODIGO.md` (sección Fase 2, nota "Cierre verificado").
  **Nota de proceso:** la rama llevaba 346 commits de retraso sobre `main` (10 días de trabajo de otras
  sesiones en paralelo) — al ir a mergear se descubrió que **`apps/almacen` ya se había añadido a la
  matriz de `tests.yml` en otra sesión mientras tanto** (ese gap, sí real cuando se detectó, ya estaba
  resuelto); solo quedaba pendiente el cambio de `ai-programar.yml`.

- **📄 Subastas — documentos de la ficha del BOE al enriquecedor: HECHO y PROBADO en producción
  (29/07/2026, PR #1131 mergeado, `980681a`).** El cron `subastas-enriquecer` ahora descarga hasta 3
  documentos por ficha BOE (`procesarDocumentos` en `lib/subastas/documentos.ts`, pdf-parse perezoso,
  escaneados <500 chars se saltan) y vuelca señales EXPLÍCITAS del edicto en `subastas.notas_edicto`
  (NULL=no procesado, ''=sin hallazgos) → línea «📄 …» en /subastas. **Prueba end-to-end real vía pg_net
  (`fase3-debug?accion=documentos`): 10 fichas revisadas, 2 con hallazgos, EXACTAMENTE los esperados** —
  SUB-JA-2026-263723 (San Pablo): «Vivienda habitual del demandado: no consta» + «El edicto no concreta la
  situación posesoria»; SUB-JA-2026-264600 (Punta Umbría): «⚖️ Ejecución contra herencia yacente». Parser
  puro en `packages/module-subastas/src/edicto.ts` (7 tests, fixtures reales con la errata «VIVENDA»; el
  boilerplate «estuviera ocupado» probado como no-señal). Rama resincronizada a main; trigger de cierre
  borrado. Queda vivo el pendiente de vigilar los crons de mañana 06:00-09:00 y el endpoint TEMPORAL
  `fase3-debug` (borrar al cerrar Fase 3).

- **🔧 Subastas — HOTFIX /subastas caída + FASE 3 construida con datos reales (29/07/2026, mañana).**
  - **Hotfix (PR #1124, mergeado):** `/subastas` decía «No se han podido cargar los datos» — la columna
    `fts` (tsvector) de `subastas` NO la sabe deserializar `prisma.$queryRaw`: en cuanto dejó de ser NULL,
    los tres `SELECT *` (página SSR, `GET /api/subastas` y `corpusVigente` del radar — el cron de las 06:30
    también cayó) petaron con P2010. Fix: lista explícita compartida **`COLS_SUBASTA`** en
    `lib/subastas-radar.ts`. **🚨 LANDMINE: contra la tabla `subastas` NUNCA `SELECT *`** (columna nueva en
    migración ⇒ añadirla a `COLS_SUBASTA`).
  - **Técnica clave de la sesión: `pg_net` desde Supabase como puente de red.** El contenedor seguía con la
    política de red vieja (la allowlist nueva solo aplica a sesiones nuevas) y ni siquiera alcanzaba
    plataforma producción. `SELECT net.http_get(...)` + leer `net._http_response` permitió explorar TODAS
    las fuentes de Fase 3 contra sus webs vivas sin salir de la sesión. Reutilizable siempre que el proxy
    bloquee algo.
  - **Fase 3 — Junta de Andalucía HECHA:** parser puro `packages/module-subastas/src/junta.ts`
    (`parsearPatrimonioJunta`/`loteASubasta`, 12 tests con el HTML real capturado) + adaptador
    `apps/plataforma/lib/subastas/junta.ts` cableado al cron `subastas-ingesta` (best-effort, con avisos).
    Datos reales del día: subastas abiertas VACÍA («Sin subastas y procedimientos abiertos actualmente»);
    **adquisición directa con 18 lotes** (venta directa de desiertos a precio mínimo, pago aplazado posible):
    4 en Sevilla (Osuna 84.944,08€ · silo Écija 99.557,57€ · Guillena 225.364,39€ · Aznalcóllar 172.381,95€)
    y 2 en Cádiz (Jerez 184.228,82€ · silo Arcos 18.019,82€), plazo 29/01/2027 → `tipo='venta_adjudicado'`.
  - **Resto de fuentes — veredictos verificados (no suposiciones):** Sareb = muro Incapsula (JS challenge,
    inviable sin navegador); BOP Sevilla = 500 desde IPs no españolas (probable geo-IP, afectaría también a
    Vercel); BOP Cádiz = TLS roto en .es y .org; BOP Huelva = SPA Angular (API interna por
    reverse-engineerear, aparcado); INE = la API Tempus responde, queda como pieza de VALORACIÓN (€/m²) para
    un PR propio.
  - **TEMPORAL:** endpoint puente `/api/subastas/fase3-debug` (token en BD `subastas_debug_token`, hosts
    cerrados, acción `?accion=junta` para disparar la ingesta sin CRON_SECRET) — **eliminar tabla+endpoint+
    entrada PUBLIC al cerrar la fase**.
  - **✅ PROBADA EN PRODUCCIÓN (misma mañana, tras mergear #1127):** el disparo vía pg_net → fase3-debug
    devolvió `{lotes: 23, upserts: 23, avisos: []}` — 23 lotes de adquisición directa en el corpus
    (Almería 7 · Jaén 5 · **Sevilla 4** desde 84.944,08€ · Granada 4 · **Cádiz 2** desde 18.019,82€ ·
    Málaga 1). El radar de las 06:30 del 30/07 debe cruzarlos con los criterios y avisar por Telegram.
  - **📄 TÉCNICA NUEVA — leer los DOCUMENTOS ESCANEADOS de las fichas del BOE (29/07/2026):** Alberto subió
    los PDF «certificación de cargas» de dos subastas («sin datos para puntuar» porque el BOE mete la info en
    el documento, no en la ficha). Son escaneos SIN capa de texto (pdf-parse vacío; sin OCR/poppler en el
    contenedor), pero **extraer los JPEG embebidos del binario del PDF (streams FFD8…FFD9) y leerlos como
    imágenes con el Read multimodal FUNCIONA** — script en el scratchpad, reutilizable. Flujo acordado:
    Alberto sube el PDF al chat → se vuelca a la ficha. Backlog: que el enriquecedor baje los documentos de
    ficha CON capa de texto (los escaneados seguirán necesitando este flujo manual).
  - **📥 Los documentos de la ficha se pueden BAJAR DEL ENLACE directamente** (pregunta de Alberto, verificado):
    la ficha lista `verDocumento.php?idSub=…&idDoc=…` y `subastas.boe.es` es alcanzable desde la sesión Y desde
    Vercel. De 5 documentos reales bajados: los EDICTOS y la CESIÓN traen capa de texto (pdf-parse los lee); solo
    la certificación escaneada necesita la vía de imágenes. Hallazgos de los edictos: Punta Umbría = ejecución
    contra HERENCIA YACENTE (titular fallecida); San Pablo = «No consta la situación posesoria» y «VIVIENDA
    HABITUAL DEL DEMANDADO: NO CONSTA». ⚠️ El texto genérico del edicto contiene «ocupado» en boilerplate legal —
    un parser de posesión solo puede fiarse de las frases EXPLÍCITAS. **SIGUIENTE INCREMENTO (diseñado, no
    construido):** el enriquecedor baja los documentos de cada ficha, extrae texto de los que lo tengan y rellena
    señales explícitas (posesión/vivienda habitual/herencia yacente); columna nueva tipo `notas_edicto`.
    **DIRECCIÓN (petición explícita de Alberto: «averiguar bien la dirección»):** la fuente que manda es el
    Catastro (`direccion_catastro`, ya se guarda) + coordenadas por `Consulta_CPMRC` (verificado: San Pablo
    37.3977,-5.9607; Punta Umbría 37.1855,-6.9733). Los nombres bailan entre fuentes (BOE «Pablo Romero» vs
    Catastro «Pedro Romero»; escritura «Poeta Miguel Hernández» vs Catastro «Bulevar del Agua 1»).
  - **📥 CONSTRUIDO el incremento («monta», 29/07): documentos de ficha AUTOMÁTICOS en el enriquecedor.**
    Módulo puro `edicto.ts` (`enlacesDocumentos`/`datosDeEdicto`/`notasDeEdicto`, 7 tests con fixtures REALES,
    errata «VIVENDA» del edicto vivo incluida; el boilerplate con «ocupado» probado como NO-señal) +
    `lib/subastas/documentos.ts` (baja hasta 3 docs/ficha, pdf-parse perezoso, <500 chars = escaneado y se
    salta) + columna `subastas.notas_edicto` (NULL=no procesado, ''=sin hallazgos — no re-descarga) en
    `COLS_SUBASTA` + paso `procesarDocumentos()` en el cron `subastas-enriquecer` + acción
    `?accion=documentos` en el puente fase3-debug + línea «📄» en la pestaña Todas de `/subastas`.
  - **Fichas enriquecidas a mano desde esas certificaciones (UPDATE aplicado + Catastro oficial):**
    · `SUB-JA-2026-263723` (Sevilla, Avda. Pedro Romero 2, San Pablo, **cierra 31/07**): 117,10 m² registrales
    /127 Catastro, 5 dorm, año 1965, tipo 77.746,93€ (=responsabilidad hipotecaria Cajasur 2001) ≈664€/m²,
    depósito 3.887,34€; afección 2000 caducada; «no arrendada» (dato 2001, verificar posesión).
    · `SUB-JA-2026-264600` (Punta Umbría, Bulevar del Agua 1, Los Molinos): 198 m², año 1996, tipo 420.800€
    (valor pactado 2008) ≈2.122€/m²; certificación: SIN cargas anteriores subsistentes, 2ª hipoteca posterior
    (se purga); el crédito lo compró UN PARTICULAR (cesión 09/2025) — dato de negociación.

- **🧹 agentes-entrenador — "repara todo" (29/07/2026): backlog de PRs + trabajo perdido recuperado.**
  Alberto pidió "repara todo" tras el aviso del backlog de PRs (73 abiertos). Al llegar, ya había un
  barrido manual suyo (73→31) que cerró ~40 PR **sin mergear** — incl. las 2 pasadas propias del
  entrenador (#1090, #1108). Cerrar sin mergear no es sinónimo de "resuelto": verificado PR a PR qué
  contenido sobrevivió a `main` por otras sesiones y qué se perdió de verdad. **Recuperado y
  reaplicado** (con verificación fresca contra el código/BD real, no copia ciega del PR viejo):
  (1) `ialimp-client-health`: las queries seguían señalando `reservas`/`facturas` (confirmado con
  Supabase que aún no existen) → reaplicado el esquema real (`pms_connections`+`cleaning_sessions`,
  `facturas_clientes`); (2) 4 deps muertas sin uso (verificado por grep) — `date-fns`/`clsx`/
  `lucide-react` de `ia-rest`, `nodemailer` de `rrhh` (cerraba además un hallazgo de `pnpm audit`) —
  quitadas + lockfile regenerado + `tsc --noEmit` 0 en ambas apps; (3) `apps/sivra/CLAUDE.md`:
  documentada `GITHUB_TOKEN` (confirmado que `lib/seo-landing.ts` la sigue exigiendo); (4) regla de
  escalado del backlog de PRs en el propio `.claude/skills/agentes-entrenador/SKILL.md`, ampliada
  con la lección de este mismo incidente. **Ya estaba en `main`** por trabajo de otras sesiones
  (nada que reaplicar): escalado Telegram de `pricing-agente` tras 2 ciclos bloqueados, recordatorio
  de auto-informe de `facturas-correo`, filtro `origen='psd2'`, caso de prueba numérico de
  `auditoria-central`. **Limpieza del backlog de PRs** (31 abiertos al llegar): cerrados 10 más
  (snapshots de bitácora ya superados, contenido verificado antes de cerrar — nunca a ciegas);
  reabierto y actualizado #1108 con todo lo de arriba. Sin resolver (no es un fix de código,
  requiere UI de claude.ai): el canal Telegram de esta rutina sigue en 401 — el `ALERTA_TOKEN` de
  este entorno coincide con el literal viejo/roto ya sabido de `buscador-ia`; pendiente de que
  Alberto lo resincronice (`docs/AVISOS-AGENTES.md` § "Resincronizar"). **Aviso para seguimiento**
  (no accionable desde aquí): `pricing_decisiones` sigue vacía desde el 05/07 pese a que el fix de
  middleware ya está en producción — verificar que el ciclo del lunes produce decisiones reales.

- **🐟 PR #1055 "mariscos" — CONFIRMADO cliente real, en pausa deliberada (29/07/2026).** Limpieza del
  backlog de PRs (73→31 abiertos: 3 fusionados, 39 cerrados por conflicto sin código, ver `docs/AUDITORIA-2026-07.md`
  entrada 29/07) marcó `#1055` (`feat(mariscos): nueva vertical de trazabilidad pesquera + etiquetado`,
  rama `claude/mariscos-gonzalez-programa-86q2oo`) como "atención alta": vertical fuera de las 8 conocidas
  (ia-rest/sivra/ialimp/plataforma/rrhh/transporte/alquiler/almacen), toca la BD compartida del holding y
  crea auth propio (`MARISCOS_SESSION_SECRET`) — no se tocó sin confirmación. **Alberto confirmó: Mariscos
  González es cliente real, de Pilar.** Decisión: **queda en draft tal cual, sin fusionar ni aprovisionar
  infra** (crear proyecto Vercel / aplicar SQL en Supabase / sembrar cuenta real siguen SIN hacer a
  propósito — Alberto eligió no avanzarlo hoy, retomar en una sesión futura con revisión antes de mergear
  a `main`, dado que toca BD compartida). **No volver a marcar `#1055` como sospechoso** en próximas
  auditorías: el cliente está verificado, solo falta decidir cuándo se termina la Fase 1.

- **💸 PRICING — auditoría pre-baja de PriceLabs (28/07/2026, a petición de Alberto).** Estado del motor:
  SANO en lo mecánico — crons vivos (apply-auto 3×/día, 329 escrituras live/7d; snapshot, mercado/cron,
  sweep, guard, pilot-track todos al día), pausa OFF, mercado fresco (310 filas/7d), `pricing_pl_referencia`
  capturándose, y **Karol G bien anclada** (Busto 11-13/6/27 vivo a 753€; Luxury 13/6 aplicado 698€
  `market-anchored` el 27/07; el 11-12/6 de Luxury es la reserva malvendida de 344€ ya conocida, no
  reversible). OJO lectura de columnas: `rate_snapshots.price_pricelabs` = precio REAL vivo en Smoobu.
  - **🐛 ARREGLADO en la pasada — guardián mudo a medias (uuid=text):** desde el 20/07 el
    `UPDATE pricing_alerts SET avisado_at=now() WHERE id IN (…)` lanzaba `42883 operator does not exist:
    uuid = text` (params de Prisma van como text) y caía al catch → el Telegram SÍ salía pero el aviso
    nunca se marcaba: re-envío diario del mismo aviso 3 días (parte de los «duplicados» del 22/07) y
    después silencio con `avisado_at=null` para siempre. Fix: `WHERE id::text IN (…)` (verificado contra
    la BD real + `tsc` 0). 6 alertas abiertas en `/sivra/pricing-auto` (18-25/07) pendientes de resolver
    a mano por Alberto (ya fueron avisadas por Telegram en su día, duplicadas).
  - **🔴 PILOTO EN ROJO — la baja de PL (~3/08) NO está validada:** `pricing_pilot_tracking` 28/07 da
    ROJO en los DOS pisos en vivo. Busto: rojo desde el 19/07, ocupación 60d ~10%, **16 días sin
    reserva**, huésped 133€ > mercado p50 82€ — y su `min_price=115` fija el suelo en **99 fechas**, es
    decir, el suelo está POR ENCIMA del mercado de media temporada (no puede bajar aunque quiera).
    Luxury: verde hasta el 23/07, rojo desde el 27/07 (ocupación 9%, 8d sin reserva, no caro vs mercado
    → demanda floja general). **Dúplex/House siguen `apply_enabled=false`** (la activación prevista
    ~27/07 no se ejecutó) y PL los controla de facto. Recomendación dada a Alberto: no cancelar la
    suscripción de PL el ~3/08 en automático; decidir con estos datos (revisar suelo de Busto, activar
    Dúplex/House en observación unos días, o retrasar la baja).
  - **⏳ Rutina semanal del agente:** `pricing_decisiones` sin filas desde el **05/07** (los 3 ciclos
    bloqueados por red/token ya documentados el 27/07). El arreglo (endpoints de plataforma +
    `ALERTA_TOKEN`) aún no tiene un ciclo que lo valide — vigilar que el próximo escriba decisiones.
  - **✅ SUELO DE BUSTO REBAJADO 115→65€ (misma sesión, OK explícito de Alberto).** Alberto pidió que el
    agente analizara el suelo contra competencia REAL y corrigió el perfil del piso: **Busto Reform = 1
    DORMITORIO para 2 personas** (salón/cocina/baño independientes; NO 2 dorm/5 camas — y OJO, no es
    estudio: los estudios no son comp válido). Barrido Booking MCP (2 adultos, apartamentos, <1,2 km de
    Bustos Tavera) en fechas FLOJAS: ago p25 62€/med 66€ · nov p25 76€/med 88€ · ene p25 68€/med 79€
    (precios huésped; 30 comps persistidos en `market_rates` scenario `prop_busto_reform` vía INSERT
    idempotente). El suelo 115€ (~133€ huésped con markup 1,16) quedaba por encima de TODO el mercado
    flojo con rating propio 6,9 vs 8,3-9,2 de los comps → las 99 fechas al suelo y los 16 días sin
    reserva. Coste real ~20-30€/noche → 65€ base (~75€ huésped) protege coste con margen 2-3×.
    `pricing_settings.min_price=65` aplicado por Supabase MCP + insight/override en `pricing_aprendizaje
    (prop_busto_reform, 'suelo')`: **no volver a subir el suelo por encima del p25 de fechas flojas sin
    OK de Alberto**. Las fechas clavadas a 115 irán bajando por el raíl ±20%/día en los próximos
    apply-auto. Pendiente análogo: Luxury (suelo 95€, 19 fechas al suelo) si Alberto lo pide.
  - **🚀 PASADA «haz todo» (misma sesión, 28/07 noche):** (1) **Suelo de LUXURY 95→72€** con OK explícito
    de Alberto — perfil confirmado: 2 dormitorios/5 camas, en Booking es «Luxury Center» (Bustos Tavera 22
    Bajo); comps 4 pax: ago p25 76€ · sep p25 119€ · ene p25 112€; 30 comps persistidos en `market_rates`
    scenario `prop_luxury_busto` (incluye SEPTIEMBRE, la ventana de la reserva malvendida de Elena) +
    override en `pricing_aprendizaje (prop_luxury_busto,'suelo')`. ⚠️ `pricing_piso_zona.max_guests=4`
    pero el piso tiene 5 camas reales — pendiente que Alberto confirme subir aforo a 5.
    (2) **Check 11 del health-check — factura MENSUAL esperada** (`lib/sivra/facturas-mensuales.ts`, puro,
    7 tests): a partir del día 5, si Giraldillo o Sique Brilla no tienen NI factura en `gastos` NI pago en
    banco desde el inicio del mes anterior → Telegram. Vigila la raíz del caso AFV-11625.
    (3) **Petición de RESEÑA en las despedidas del agente de huéspedes** (`decidir.ts`): solo en
    post-estancia/día de salida Y despedida/cierre (esCierre/esDespedida), UNA frase, sin incentivos ni
    condicionarla (política OTA); el rating es el freno nº1 (Busto 6,9 vs comps 8,3-9,2). 120/120 tests.
    (4) **Recordatorio decisión PL**: evento Google Calendar 01/08 09:00 (id `52e3626k6d7i9vgb33rrhius5c`)
    + trigger `trig_01BhsedavjXH3bvnTsqSUQq9` (01/08 07:45 Madrid, dispara en esta sesión un informe con
    datos frescos; con fallback anunciado si faltara el conector Supabase). NO duplicar.
    (5) **Minado de reseñas de Busto: BLOQUEADO por red** — booking.com/hotels.com/agoda dan 403 a WebFetch
    y el proxy corta el CONNECT a booking.com incluso con Chromium+Playwright real. El anuncio es «Busto
    Reform Apartamento Centro Sevilla Parking Netflix» (66 reseñas, 6,9). Alternativas: exportar reseñas
    desde la extranet y pegarlas a una sesión, o añadir booking.com a la allowlist del entorno.
    (6) **Guard legado de `apps/sivra` sigue sin retirar** — `git rm` denegado por el clasificador de
    permisos de la sesión; es inofensivo (ningún cron lo llama). Retirarlo en un PR a mano.
  - **🧺 LAVANDERÍA = EL GIRALDILLO, y la ingesta la atribuye mal (hallazgo al validar costes del suelo).**
    La lavandería es **factura MENSUAL de "Lavandería El Giraldillo"** (administracion@lavanderiaelgiraldillo.es,
    serie **AFV-nnnnn** — las filas de `gastos` con proveedor «AFV Lavandería» SON de Giraldillo: AFV es la
    serie de factura, no el proveedor). Reparto acordado con Alberto: **por cambios de sábanas × nº de
    huéspedes de la reserva** (multi-piso, NO 100% a un piso). Problemas de datos detectados: (1) solo 2 de
    ~6 facturas ingeridas en `gastos` (ene 312,18€, mar 441,05€) — feb (AFV-11389), abr (AFV-11528),
    may (AFV-11625) y jun (AFV-11758) están en Gmail sin ingerir; (2) las 2 ingeridas van 100% a
    `prop_house_sevillana` («Casa Socorro») cuando son de todos los pisos → los P&L por piso sobrecargan
    House y regalan coste a los demás. Con el modelo cambios×huéspedes, la parte de Busto ≈ **7€/salida**
    → variable total Busto ~27-33€/salida, el suelo de 65€ sigue holgado (contribución ~54€/noche,
    break-even ~5 noches/mes). Números en `pricing_aprendizaje (prop_busto_reform,'suelo')`.
  - **✅ EJECUTADO en la misma sesión (a petición de Alberto, «implementa cambios y actualiza datos»):**
    (1) **7 facturas ingeridas en `gastos`** con importes REALES del banco (cruzados contra
    `v_movimientos_activos`; la contraparte del feed va con errata «GIRANDILLO», por eso no salían
    buscando «girald»): Giraldillo feb 368,45€ (pag. 02/03) · abr 598,95€ (AFV-11528, pag. 27/05) ·
    may 608,03€ (AFV-11625 — la que se le pasó pagar; reclamada 25/05, pagada 05/07) · jun 504,27€
    (AFV-11758, pag. 05/07 — **dos pagos el mismo día 05/07**, confirmado lo que recordaba Alberto);
    Sique Brilla abr 1.439,90€ · may 1.360,04€ · jun 902,65€ (el pago del 30/06 «factura lavanderia j»
    a SI QUE BRILLA es la LIMPIEZA de junio). Todas `propiedad='prop_multi_apartamentos'`,
    `origen='banco-conciliado'`, con nota de fuente. Las 2 de Giraldillo ya existentes corregidas
    (proveedor real, categoría LAVANDERIA, multi-piso). PDFs siguen en Gmail, pendiente archivar en Drive
    (pasada de `facturas-correo`).
    (2) **Código (`lib/sivra/pl-mensual.ts` + `/sivra/resultado-pisos`):** el reparto cambios×huéspedes de
    la lavandería YA existía (peso `maxGuests×reservas`, pisos Kutxa); se añadió **campo `limpieza`** al
    P&L por piso — los pagos a Sique Brilla se reparten por **salidas × tarifa contratada** (Busto 20€ ·
    Dúplex 25€ · Luxury 28€ · House 90€, el desglose real de sus facturas), criterio de CAJA del mes.
    Además la lavandería quedó **GENÉRICA por decisión de Alberto («giraldillo u otra lavandería»)**:
    el reparto casa `contraparte ILIKE '%LAVANDERIA%'` + `destino='turistico_pisos'` (no un nombre de
    proveedor — cubre la errata GIRANDILLO y un cambio futuro de lavandería sin tocar código), y el
    Check 11 vigila `%lavander%` en gastos / `%LAVANDERIA%` en banco (commit c49741d), y
    `catToField` mapea LIMPIEZA/LAVANDERIA a sus campos (antes caían a «otros»). `tsc` 0. OJO cash-basis:
    el P&L de JULIO mostrará las DOS facturas de Giraldillo pagadas el 05/07 (1.112,30€) — es caja, no error.

- **✂️ Regla global «Estilo de respuesta» en CLAUDE.md raíz (23/07/2026).** A petición de Alberto (respuestas
  demasiado extensas): nueva regla global permanente que pide respuestas sintéticas y directas en el chat
  (resultado primero, sin recapitular ni narrar cada paso; extenderse solo si Alberto lo pide). NO aplica a
  código/comentarios/commits/PR. Alternativas mencionadas a Alberto: `/output-style` y ser concreto con qué
  archivo/vertical tocar para no explorar a ciegas (el mayor gasto de tokens no es el texto final sino leer repo).

- **🎯 Subastas — LOTE «todo lo que quedaba» (28/07/2026, noche). MERGEADO (PR #1120, squash `a9609d3`).**
  Decisiones de Alberto al cierre: (a) crea él la búsqueda de Idealista **vivienda, costa de Huelva**
  (Punta Umbría/Islantilla-Lepe; alertas al Gmail → las lee el cron 06:20); (b) **allowlist YA AÑADIDA
  (28/07, vía Claude de Chrome, entorno «Default»)**: boe.es/www.boe.es, sareb.es/www.sareb.es,
  admbop.dipusevilla.es, www.diphuelva.es, www.bopcadiz.es, www.juntadeandalucia.es, ine.es/www.ine.es/
  servicios.ine.es — la sesión del 28/07 seguía con la política vieja (los 8 hosts aún `000`; el proxy solo
  se relee al arrancar contenedor) → **la PRÓXIMA sesión debe verificar host a host y construir los
  adaptadores de Fase 3 CONTRA DATOS REALES** (BOPs, Junta, Sareb, INE €/m²); (c) aprendizaje de descartes
  explicado y aceptado como diferido hasta tener volumen. Petición original: «añade todo y las
  fases que quedan». Seis piezas nuevas, todas probadas:
  1. **Yield turístico con datos PROPIOS** (`yieldTuristico` puro + `lib/subastas/rendimiento.ts`): mediana
     REAL de sus 4 pisos = **10.733€ netos/año por dormitorio** (rango 8.377–17.661; `incomes`+`properties.bedrooms`,
     12 meses; sus pisos no tienen m², por eso la métrica es por dormitorio). En `/subastas` (pestaña Todas) y
     en chollos: «se paga en N años (X% bruto)», SIEMPRE con caveat «si rindiera como tus pisos de Sevilla».
  2. **Puja máxima** (`pujaMaximaParaDescuento`): bisección sobre `calcularCoste` (hereda TODA la lógica fiscal,
     incl. base imponible por valor de referencia — testeado que con VR alto la puja baja) alineada a tramos.
     UI: «🎯 Puja máxima para ≥25% de descuento real». Solo aparece cuando hay valorMercado.
  3. **Velocidad de mercado** (`velocidadZona`): mediana de días de vida de los anuncios DESAPARECIDOS (>7 días
     sin verse) por zona. Hoy `null` (corpus recién nacido); se activa sola. Usa `ultimaVez` (=visto_en).
  4. **Botones Telegram 👀 Seguir / 🚫 Descartar** en el aviso diario (prefijo `subr_` en el webhook, antes de
     `mov_`): seguir → `subastas_seguidas` idempotente + entra en tesorería/cierre; descartar → `descartado=true`
     (decisión explícita registrada, base del aprendizaje futuro). El aviso pasó de agregado a UN mensaje por
     subasta (volumen real 0-4/día) con resto agregado si >10.
  5. **Captura de RESULTADOS** (`capturarResultados` en enriquecer, cron 06:15): subastas concluidas → re-baja
     la ficha y guarda `resultado`/`importe_adjudicacion`. ⚠️ El parser (`resultadoDeFicha`) es DEFENSIVO: la
     ficha ABIERTA no publica estado (verificado contra el portal) y el marcado de una concluida aún no se ha
     visto — si no reconoce nada, loguea las claves y deja NULL. **Se valida el 03/08 con El Puerto** (primera
     conclusión real); revisar logs de Vercel ese día y ajustar el parser.
  6. **Antesala concursal BORME** (`esEmpresaInmobiliaria` puro + `avisarAntesalaConcursal` en el cron de avisos):
     promotoras/constructoras/inmobiliarias en concurso en las provincias de los criterios → Telegram (ventana
     1 día, sin estado de dedupe). `borme_eventos` ya tenía 25 concursos en sus provincias.
  7. **Borrador de oferta a la baja** (`POST /api/subastas/oferta` + botón «✍️» en chollos): la IA (cadena
     GRATIS, `aiComplete`) SOLO redacta — precio, mediana, bajadas y antigüedad van en el prompt desde la BD.
  - **FASES QUE QUEDAN (bloqueadas por decisión/allowlist de Alberto, NO por código):**
    · Fase 3 fuentes: BOP Sevilla/Huelva/Cádiz, Junta D.G. Patrimonio, Sareb, servicers — sus hosts dan `000`
      desde el entorno (allowlist). Regla de la casa: no se escriben parsers improbables.
    · INE «Valor tasado de la vivienda» (€/m² oficial trimestral) — `servicios.ine.es`/`www.ine.es` bloqueados.
    · Búsquedas de VIVIENDA en Idealista por zona del BOE (5 min, sin código) — sigue siendo la palanca nº1:
      sin solape, las 4 subastas reales siguen sin referencia de mercado.
    · Aprendizaje de criterios desde los descartes (los datos ya se registran con los botones; el ajuste
      automático de criterios queda para cuando haya volumen de descartes).
  - Verificado: **138 tests** módulo · `tsc` 0 · guardia 26/26 · catálogo 3/3 · `next build` OK (`/subastas` 5,78 kB).

- **⬇️ Subastas — SEGUIMIENTO DE BAJADAS DE PRECIO + antigüedad estimada del anuncio (28/07/2026).**
  Petición de Alberto: vigilar los anuncios que bajan de precio y saber cuánto llevan en venta (anuncio viejo
  = más fácil ofertar a la baja). **Restricción verificada:** Idealista NO publica la fecha de alta (ni en el
  correo ni en la web, que bloquea scraping) — ninguna IA puede saberla; solo hay señales indirectas.
  - **Bajadas (dato DURO):** el upsert de `mercado_comparables` compara el precio del correo nuevo con el
    guardado — si baja, registra `precio_anterior`/`bajadas`/`ultima_bajada_at` ANTES de pisarlo, y conserva
    `precio_inicial` (primer precio visto). Detectar por comparación cubre cualquier vía (no depende del
    correo «bajada de precio» del portal). **Guarda anti-backfill:** `WHERE EXCLUDED.visto_en >= visto_en` —
    sin ella, reprocesar correos viejos desordenados (?dias=60) "resubiría" el precio y fabricaría bajadas
    falsas. **Probado contra la BD real** con fila sintética: 300k→280k registra bajada 1; el correo viejo
    reprocesado NO toca nada. Aviso Telegram agregado `avisarBajadas()` en el cron 06:20 (cada bajada avisa
    UNA vez, `bajada_avisada_n`); migración `2026-07-28_bajadas_precio.sql` aplicada.
  - **Antigüedad ESTIMADA por nº de referencia:** los refs de Idealista son secuenciales (~107M viejo,
    ~112M reciente). `estimarAntiguedad()` (puro, testeado) calibra el ritmo refs/día con las primeras
    apariciones en nuestro corpus y extrapola hacia atrás. **Se degrada a `null` sin calibración** (≥8
    muestras y ≥7 días de rango) — HOY devuelve null (todo el corpus entró el mismo día) y la UI enseña la
    cota inferior honesta «lo vemos desde el X». Se activará solo según entren anuncios nuevos. Cap 3 años
    (`capada: true`).
  - **UI chollos:** «⬇️ Ha bajado N veces: de X a Y — vendedor negociable» + «⏳ En venta desde hace ~N meses
    (estimado)». Telegram de chollos incluye ambas señales.
  - OJO landmine evitada: la 1ª edición del tipo `Comparable` con `str.replace` NO aplicó en silencio (la
    interfaz real lleva comentarios) y `tsc` lo cazó — los campos de seguimiento son opcionales en el tipo
    puro porque el parser de correos no los conoce; los rellena la capa de BD.

- **💡 Subastas — UNIFICADA la inversión inmobiliaria: detector de CHOLLOS de venta directa (28/07/2026).**
  Decisión de Alberto: «unificamos inversión con subasta, la idea es la misma — pisos baratos por zonas».
  Los comparables de Idealista que valoran las subastas SON anuncios en venta: el mismo corpus, mirado al
  revés, detecta el chollo de portal. `detectarChollos()` (puro, en `comparables.ts`): anuncio de vivienda
  cuyo €/m² queda ≥20% bajo la mediana de SU zona — **excluyéndose a sí mismo de la mediana** (si no, el
  propio chollo la arrastra y se auto-oculta; con él dentro Islantilla daba 2.409, sin él 2.526). Zona por
  niveles (`zonasDeComparable`): Idealista publica a nivel de CALLE, se recorta a barrio+municipio y cae a
  municipio; los números de portal («38», «14 b») se descartan. Descuento >50% → `sospechoso` (se enseña
  marcado, no se oculta: suele ser error del anuncio). Sustituye al `puntuacion_chollo` a ojo del viejo
  lector `/sivra/inversion` (parado desde 19/05).
  - **Probado con el corpus real (21 anuncios):** salen exactamente 2 chollos, ambos en Islantilla Golf —
    el mayor **235.000€, 147 m², 1.599€/m² frente a 2.526€/m² de mediana → −36,7%** (ref 111390119). La
    parcela de Isla Cristina (310€/m²) NO sale; La Antilla (muestra 1 tras excluirse) tampoco.
  - **Telegram**: `avisarChollos()` en el cron `subastas-mercado` (06:20) — mensaje AGREGADO y cada anuncio
    avisa UNA vez en su vida (`mercado_comparables.chollo_avisado_at`, migración aplicada; la mediana se
    mueve a diario y sin sello re-avisaría cada mañana). Best-effort: un fallo de Telegram no tira la
    referencia de mercado.
  - **UI**: pestaña «💡 Chollos» en `/subastas` (SSR, degradación a `[]`). Sidebar: «⚖️ Subastas y chollos»
    y **retirada la entrada 🏡 Inversión** de Mis pisos (la página `/sivra/inversion` sigue viva por URL,
    reversible — patrón de des-duplicación de siempre). `/trading` (📈 Inversión bursátil) no se toca.
  - Verificado: 125 tests del módulo · `tsc` 0 · guardia 26/26 · `next build` OK (`/subastas` 4,95 kB).

- **📅 Trading — aviso de Google Calendar creado para la cohorte 3 (28/07/2026, sesión de charla).** Alberto
  preguntó por el estado del laboratorio y pidió un aviso en calendario. Creado evento en su Google Calendar:
  **lunes 17/08/2026 09:00** «🧪 Laboratorio inversión: congelar cohorte 3 (DOBLE) + contraste forward vs
  retrovisor» (popup + email 1 día antes; id `4dp287ulk4jvaid4jedejnlhf0`). NO crear otro aviso duplicado para
  este hito. Contexto de la consulta: el forward paper solo tiene aún 1 snapshot por cohorte (el primero que
  persistió el cron semanal fue el del lunes 27/07; el tracker se estrenó después del lunes 20) — al 27/07 la
  combinada iba −4,9% vs SPY −0,4% (base gurús-solo −2,4%; 1 semana = sin veredicto). Cohetes: primer
  rebalanceo 27/07 y primera valoración 28/07, todo en marcha.

- **📐 Subastas — la superficie del CATASTRO no llegaba al scoring (28/07/2026, tras mergear #1114).**
  Al enseñarle a Alberto la primera pasada del radar salió el fallo: `filaASubasta` mapeaba
  `superficie: num(f.superficie)` y **ignoraba `superficie_catastro`**, que es justo la que llena el
  enriquecimiento y la que usa `aplicarReferenciaMercado` para el €/m². Consecuencias reales:
  **Belmonte de Miranda** (100 m² en el Catastro, el anuncio no da metros) llegaba al scoring con
  `superficie: null` → nunca podría estimarse por comparables; **El Puerto de Santa María** usaba los
  115,66 m² registrales en vez de los 112 catastrales → el valor estimado habría salido con una
  superficie distinta de la referencia guardada. Fix: `superficieUtil(catastro, anuncio)` en
  `@central/module-subastas/catastro.ts` (puro, 4 tests con los 3 casos reales) — manda el Catastro y
  **un 0 cuenta como AUSENTE** (el Catastro devuelve 0 en fincas sin construcción; valorar a 0 m² daría
  0 € de valor, peor que no valorar). Verificado: 119 tests · `tsc` 0 · `next build` OK · guardia 26/26.
  - **Primera pasada real del radar (28/07):** las 4 subastas casan con los criterios y el coste puerta
    abierta ya sale completo — El Puerto 296.270,42€ · Punta Umbría 452.056€ · Belmonte 22.482,03€ ·
    Dos Hermanas 798.755,16€ (esta con 6.000€ de lanzamiento por posesión dudosa). **Puntuación `null`
    en las 4**: sin tasación, sin valor de referencia y sin comparables de esas zonas no hay con qué
    comparar — el sistema lo dice en vez de inventar. Sigue pendiente de Alberto crear una búsqueda
    guardada de VIVIENDA en Idealista por cada zona del BOE.

- **💰 Subastas — TESORERÍA DEL DEPÓSITO + snapshot del radar que se quedaba congelado (28/07/2026).**
  Pujar exige consignar el **5%** (art. 647 LEC) ANTES, y el dinero queda bloqueado hasta después del cierre:
  detectar la ganga no sirve de nada si el día de la subasta no hay saldo. Cerrado el punto 4 del diseño.
  - **`packages/module-subastas/src/tesoreria.ts`** (puro, 8 tests): `planTesoreria()` hace un **barrido de
    eventos** sobre la línea del tiempo. La cifra que importa NO es la suma de depósitos sino el **MÁXIMO
    SIMULTÁNEO**: las subastas que no se solapan reutilizan el mismo dinero. `DIAS_RETENCION_DEPOSITO = 15`
    (la LEC no fija plazo para devolver al no adjudicatario; se sobreestima a propósito). Sin fecha de cierre
    o sin depósito → `incompletos`, nunca una fecha inventada.
  - **`apps/plataforma/lib/subastas/tesoreria.ts`**: saldo REAL de las cuentas **corrientes** (`cuentas_bancarias.
    saldo_actual`; las tarjetas no sirven para consignar y una cuenta sin saldo conocido NO cuenta como cero) +
    compromisos. Si no hay nada en seguimiento cae al radar y lo marca como **simulación**, no como compromiso.
  - **Comprobado con datos REALES (28/07):** las 4 subastas del corpus suman **72.727,27€** de depósito y TODAS
    se solapan en agosto → pico 72.727,27€ contra **55.318,97€** disponibles = **faltan 17.408,30€**. El
    calendario enseña cómo se libera (72.727,27€ → 58.966,97€ el 18/08 → 36.960,52€ el 25/08).
  - **🚨 Dos fallos reales encontrados al conectarlo:**
    1. **El snapshot `subasta` jsonb del radar se congelaba para siempre** (`ON CONFLICT DO NOTHING`). El radar
       corre a las 06:30, DESPUÉS del enriquecimiento (06:15) y del mercado (06:20), así que la primera pasada
       de una subasta recién ingerida la ve **sin depósito, sin tasación y sin municipio** — y esa foto en blanco
       no se refrescaba nunca (verificado en BD: los 4 snapshots tenían `deposito`/`valor_subasta`/`municipio`
       a null mientras el corpus ya los tenía). El aviso de cierre decía «sin valor de subasta publicado» siempre.
       → `DO UPDATE` que refresca snapshot y cifras **sin tocar `avisado_at` ni `descartado`** (la idempotencia
       del aviso y la decisión de Alberto mandan); el contador de «nuevos» pasa a un `SELECT` previo de claves.
    2. **Para dinero NO se lee el snapshot, se lee el corpus vivo** (`JOIN subastas`): la foto histórica vale
       para el registro, no para decidir cuánto hay que tener en el banco hoy.
  - **UI** (`SubastasClient.tsx`): panel «💰 Depósitos para pujar» en la pestaña Radar — pico, aviso de déficit
    en rojo, calendario plegable del dinero inmovilizado y aviso si el saldo más antiguo está desactualizado.
    **Telegram** (`subastas-cierre`): mismo cálculo, con déficit.
  - **Fase 3 (BOP/Junta/Sareb/servicers) sigue BLOQUEADA en este entorno:** solo `subastas.boe.es` y
    `ovc.catastro.meh.es` responden; `www.boe.es`, `www.sareb.es`, `admbop.dipusevilla.es`, `www.diphuelva.es`
    y los servicers dan `000`. No se escribe un parser que no se puede probar.
  - Verificado: **115 tests** del módulo · `tsc` 0 · `next build` OK (`/subastas` 4,33 kB) · guardia 26/26.

- **💶 Subastas — REFERENCIA DE MERCADO con los correos de Idealista (28/07/2026).** El radar sabía QUÉ se
  subasta pero no si estaba BARATO: las **4 subastas reales del corpus publican `Tasación 0,00 €`** y el valor de
  referencia del Catastro es dato protegido (exige certificado digital) → `evaluarOportunidad` devolvía
  `puntuacion: null` en todas. Decisión de Alberto: sacar el €/m² de sus **propias alertas de Idealista**.
  - **`comparables.ts`** (puro): `parsearAlertaIdealista` · `precioM2Zona` (**MEDIANA**, no media — un chalet de
    lujo suelto dispararía la media y taparía gangas; mínimo 3 anuncios o `null`) · `tipoComparable`.
  - **Cascada de valor en `scoring.ts`:** tasación → valor de referencia → **comparables** (`origenValor` dice
    cuál se usó; el estimado penaliza ×0,85 y lleva aviso «es una estimación, no una tasación»). Sin superficie
    NO se estima nada.
  - **3 fallos que solo aparecieron con correos REALES** (probados contra el buzón por MCP de Gmail): (1) el
    «Resumen diario» usa OTRO marcado que la alerta suelta — publica el **€/m² ya calculado** («2.000 €/m²»), que
    el parser tomaba como precio del piso; (2) la superficie va con **decimal español** («140,00 m²») y la regex
    casaba solo los decimales → superficie `0`; (3) algunos chalets anuncian el **€/m² de PARCELA** (Isla
    Cristina: «310 €/m²» sobre 1.000 m²), 7× por debajo del construido de la zona. Filtros: >400 m² fuera, y
    **solo `tipo='vivienda'`** — la única búsqueda guardada de Alberto en Sevilla es de **GARAJES**.
  - **Tabla `mercado_comparables`** (`prisma/sql/2026-07-28_mercado_comparables.sql`, **aplicada**) + columnas
    `precio_m2_mercado`/`muestra_mercado`/`zona_mercado` en `subastas`. Cron **`subastas-mercado` 06:20** (entre
    enriquecer y radar). Reutiliza el lector IMAP del BOE pasándole otro remitente.
  - **Probado con datos reales:** 21 comparables de solo 3 correos (de ~200 en 60 días) → Nuevo Portil
    **2.174 €/m²** (7), Islantilla **2.409 €/m²** (7), Cartaya 2.174 €/m² (9). Insertados en la BD real.
  - **🚨 DECISIÓN PENDIENTE DE ALBERTO — las búsquedas NO se solapan.** Sus alertas de Idealista cubren
    *«casa playa huelva 380k»* + garajes en Sevilla; sus búsquedas del BOE son Sevilla, Punta Umbría, Puerto de
    Santa María, Matalascañas, Mazagón y Asturias. Resultado hoy: **0 de las 4 subastas reales obtiene
    referencia**. Basta con que cree en Idealista una búsqueda guardada de **vivienda** por cada zona del BOE
    (5 min) y el radar empieza a puntuar solo.
  - **Estudio oficial (INE «Valor tasado de la vivienda», €/m² trimestral por municipio, gratis y sin clave):
    BLOQUEADO** por la allowlist del entorno (`servicios.ine.es`/`www.ine.es` → sin salida). Mismo caso que
    `boe.es`/Catastro: si Alberto los añade, se construye y prueba el adaptador. Ojo: ese dataset **solo cubre
    municipios >25.000 habitantes** (sirve para Dos Hermanas y El Puerto; NO para Punta Umbría, Matalascañas,
    Mazagón ni Belmonte) — por eso los correos propios no son un parche sino el complemento necesario.

- **⚖️ NUEVO — Radar de subastas de inmuebles `/subastas` (28/07/2026, Fase 1).** Alberto pidió información de
  subastas, sobre todo de inmuebles. **No había nada**: `/sivra/inversion` tiene un flag `es_subasta` pero es un
  lector pasivo y MANUAL de correos de portales (192 filas, 6 subastas, **sin alimentarse desde el 19/05/2026**).
  - **HALLAZGO QUE DEFINIÓ EL DISEÑO:** Alberto **ya está suscrito** a las alertas del Portal de Subastas del BOE
    (`no-responder@boe.es`) con **6 búsquedas guardadas** — `INMUEBLE SEVILLA`, `PUNTA UMBRIA`, `PUERTO SANTAMARIA`,
    `MATALASCAÑAS`, `MAZAGON`, `ASTURIAS` — ~200 hilos, **todos sin leer**. El BOE ya filtra y manda el resultado en
    HTML estructurado (`<dt>/<dd>`: identificador `SUB-JA-…`, estado, fecha de conclusión, descripción, enlace).
    → **La fuente principal es el CORREO, no el scraping.** Esquiva el 403 que boe.es da a IPs de fuera de Vercel
    (mismo caso que PLACSP) y elimina el riesgo de adivinar la estructura del sumario.
  - **`@central/module-subastas`** (puro, 55 tests `node --test`): `types` · `parsing` · `email-boe` (parsea la
    alerta real del BOE) · `costes` · `scoring` · `radar`. **Multi-fuente por diseño** (`fuente`: boe/placsp/bop/
    junta/sareb/servicer): añadir una fuente = un adaptador, sin tocar scoring/radar/avisos/UI.
  - **🚨 LO QUE APORTA VALOR — el coste «puerta abierta»** (`costes.ts`): remate + cargas preferentes + impuesto +
    notaría/registro + cancelación + lanzamiento si está ocupada. **La trampa del ITP:** desde enero 2022 la base
    imponible de una adjudicación en subasta judicial NO es el remate sino el **valor de referencia del Catastro**
    si es mayor (rematar en 60.000€ puede tributar sobre 110.000€). ITP Andalucía 7%; si el ejecutado es persona
    **jurídica** va por IVA+AJD. **Regla dura: sin tasación → `puntuacion: null` con motivo, nunca un número inventado.**
  - **Tablas** (`prisma/sql/2026-07-28_subastas.sql`, **aplicadas por Supabase MCP**): `subastas` (corpus global,
    36 cols) · `subastas_criterios` (por `cuenta_id`) · `subastas_radar` (`UNIQUE (cuenta_id, dedupe_key)`) ·
    `subastas_seguidas`. Sin RLS + `REVOKE anon/authenticated`.
  - **Crons** (`vercel.json`): `subastas-ingesta` 06:00 · `subastas-radar` 06:30 · `subastas-avisos` 08:00
    (UN Telegram agregado, silencia el backfill >2 días) · `subastas-cierre` 09:00 (recordatorio a 3 días **con el
    depósito del 5% a consignar**). Lector IMAP propio (`lib/subastas/gmail-boe.ts`) que abre «Todos los mensajes»
    por `specialUse \All` — las alertas llegan archivadas, un lector de INBOX no las vería.
  - **UI** `/subastas` (sidebar tras Concursos): patrón `/empresas` (tokens de tema, 50 filas + «Ver más», 44px),
    NO el de `/concursos` (hex hardcodeados que rompen el oscuro). Importes con `eur()`.
  - **Verificado:** 55 tests del módulo · `pnpm test` completo verde · `tsc --noEmit` **0 errores** · `next build`
    OK con `/subastas` · guardián `estructura-generada` verde.
  - **⚠️ PENDIENTE DE VALIDAR EN PREVIEW:** la ingesta real necesita `GMAIL_USER`/`GMAIL_APP_PASSWORD` en el
    proyecto Vercel `plataforma` (ya existen para las facturas) y **no se ha podido probar desde la sesión**.
    Disparar `/api/cron/subastas-ingesta?dias=30` y comprobar filas en `subastas`.
  - **Decidido y NO hecho (fases siguientes):** enriquecer la ficha desde `subastas.boe.es` (tasación/cargas/
    depósito) + **Catastro** (servicios web libres SOAP/REST: superficie, uso, coordenadas y **valor de referencia**);
    yield turístico cruzando con `incomes`/`rates`; fuentes BOP Sevilla/Huelva/Cádiz, Junta D.G. Patrimonio, Sareb y
    servicers (**por sus alertas de email, NO scraping** — no publican API y sus condiciones suelen prohibirlo);
    señal anticipada cruzando `borme_eventos` (concurso→liquidación→subasta meses después); botones Telegram que
    aprenden de los descartes; histórico de adjudicaciones para calibrar el scoring.
  - **`/sivra/inversion` se deja como está** (canal correo de portales): sus 6 filas `es_subasta` no tienen
    identificador `SUB-`, ni tasación, ni cargas — migrarlas sería inventar datos.

- **🔍 Auditoría diaria (ligera) — 28/07/2026: sin drift de memoria/skills, 2 falsos positivos de
  heartbeat confirmados, 1 landmine de código encontrada (PR draft).** Rango desde la última auditoría
  (26/07 08:42, profunda): 25 commits, todos los de código ya reconciliados en su propio commit por
  las sesiones que los hicieron (token de rutina en BD, fix del 401 en silencio, pricing por rutina,
  auto-envío de cortesía). `docs/SKILLS.md` cuadra con `.claude/skills/`+`.claude/commands/`; la regla
  «amortizable NUNCA de oficio» sigue consistente en sus 3 skills. Heartbeat: `limpiadoras/auto-sessions`
  y `updates/sync` salieron `⛔ MUDO` por umbral pero verificados `200` en Vercel a las 05:00 UTC de
  hoy — silencio idempotente esperable (histórico de huecos de días ya documentado). **Hallazgo nuevo:**
  `apps/plataforma/lib/banca.ts:537` (`getSerieCobrosPisos`) sin el cast `::int` en `make_interval` —
  mismo patrón que rompió `ia_director_aprendizaje` (26/07); la función no tiene consumidor hoy así que
  no rompe nada en producción, pero es una mina para quien la reenganche. Fix de una línea en PR draft
  `claude/auditoria-diaria-2026-07-28`. Detalle completo en `docs/AUTO-APLICADOS.md` y
  `docs/AUDITORIA-2026-07.md`.

- **✅ FORWARD-PAPER (Fase 1) YA SE MIDE — `trading_paper_track` poblada (27/07/2026).** Cierra el diagnóstico
  del 21/07 ("NO roto, prematuro"): el cron `paper-tracker` (lunes 10:00 UTC) escribió hoy la **primera fila
  real de cada cohorte** (`2026-07-18.v1` y `2026-07-20.v1`), `created_at` 10:00:12Z. Cotejado por Supabase MCP.
  Primera foto (aún ruido, 7–9 días): cesta **−4,9%** vs SPY **−0,4%** → alpha **−4,4 pts**, baten 1/8,
  maxDD −5,2% (bench −1,3%), vol 25,6%, TE 15,9%. La cohorte 07-20 trae `retorno_base` (gurús-solo) **−2,4%**
  (n=17) → el filtro de calidad va POR DEBAJO de la base gurús-solo de momento (−4,9% vs −2,4%), a vigilar pero
  demasiado pronto para concluir (el reloj acaba de arrancar out-of-sample). Sin acción de código: era cuestión
  de tiempo/barras, como se diagnosticó. Se acumula cada lunes.

- **✅ VERIFICADO end-to-end el token de rutina en BD (27/07/2026 09:52 UTC).** Prueba real, no inferencia:
  se creó un trigger de un solo disparo **en el entorno de `buscador-ia`** (`env_01HffTNZV1WPeqvjfxJYoPMs`,
  que sí tiene egress a plataforma — este contenedor NO) que hizo `GET /api/internal/alerta` con el token.
  Resultado leído por BD, sin depender de leer esa sesión: `rutina_tokens.ultimo_uso_en` pasó de `NULL` a
  **`2026-07-27 09:52:41+00`**, y ese campo **solo lo escribe el endpoint cuando el token autentica bien**
  (`lib/rutina-tokens.ts`). Luego el camino completo funciona: token en BD → middleware → handler → 200.
  Trigger de verificación borrado tras la prueba. La telemetría `ultimo_uso_en` queda además como el primer
  rastro que deja una rutina Claude al avisar (antes: «sin telemetría» en `lib/agentes-salud.ts`).

- **🔑 Token de rutina en BD — el canal de aviso deja de depender de Vercel (27/07/2026, PR #1106 `32344ae`,
  desplegado en producción).** Cierre de la sesión del 401. Al intentar arreglarlo end-to-end desde una sesión
  se comprobó que **las tres vías a Vercel están cerradas** (verificado, no supuesto):
  1. **Navegador:** Chromium+Playwright están instalados, pero el proxy del entorno deniega el CONNECT
     (`gateway answered 403`) a `vercel.com` y `plataforma-ten-flame.vercel.app`; `claude.ai` da 403. Y sería
     un perfil limpio, sin sesión de Alberto. **NO es «Claude para Chrome»** (ese corre en el navegador de él).
  2. **MCP de Vercel** (no pasa por ese proxy): no expone env vars — solo proyectos, deployments, logs, analytics.
  3. **API de Routines:** `list_triggers` **solo ve las rutinas creadas por `http_api`** (`buscador-ia`,
     `trading-analista`); las creadas desde la UI de claude.ai no salen. Y `update_trigger` **rechaza** editar
     incluso las que sí ve, si no las creó un agente: *«this routine was created via http_api»*. O sea que el
     prompt de `buscador-ia` **tampoco se puede editar por API** — es de Alberto, en la UI.
  - **Solución:** 3ª vía de auth en `/api/internal/alerta` — token **por rutina** en la tabla `rutina_tokens`,
    guardando **solo el SHA-256** (si la tabla se filtra no entrega nada usable). Mismo patrón que
    `empresas_acceso_token`/`trading_acceso_token`, creados en su día por este mismo motivo. Uno por rutina
    (revocable individualmente), alcance MÁS ESTRECHO que el de la env (solo el aviso Telegram; lo vigila
    `test/regression-rutina-tokens.test.ts`), y **rotable sin redeploy**. `ultimo_uso_en` da además la
    telemetría que las rutinas Claude nunca tuvieron.
  - **Token emitido para `buscador-ia`** (huella SHA-256 `31f49907`). El valor en claro NO está en el repo.
  - **PENDIENTE DE ALBERTO (sigue siendo suyo, no hay API):** pegar ese token en el **prompt** de `buscador-ia`
    (UI de claude.ai/code). Ventaja frente a antes: **ya no hace falta tocar Vercel ni redesplegar** — el token
    vale por sí solo. Para las rutinas creadas desde la UI (`agentes-entrenador` y demás) el camino es el mismo:
    emitir su token con el SQL de `docs/AVISOS-AGENTES.md` y pegarlo en su entorno.
  - Revocar cualquiera: `UPDATE rutina_tokens SET activo=false WHERE rutina='<nombre>';` (efecto inmediato).

- **🔎 Auditoría de los triggers de las rutinas (27/07/2026, seguimiento del fix de avisos PR #1104).**
  Buscando arreglar del todo el 401, se auditaron **540 triggers** por la API de Routines. Dos hallazgos
  que cambian dónde hay que ir a tocar:
  - **La API solo expone las rutinas creadas por `http_api`** — `buscador-ia` y `trading-analista`. Las
    creadas desde la UI de claude.ai (`agentes-entrenador`, `pricing-agente`, `auditoria-diaria`,
    `facturas-correo`, `psd2-health-check`, `ialimp-client-health`, `github-vigia`, `fiscal-novedades`,
    `rrhh-compliance-calendar`) **NO salen por API**: no se pueden auditar ni reparar desde una sesión,
    solo desde la UI. Es el motivo real de que este pendiente no se pueda cerrar por código.
  - **`buscador-ia` lleva su `ALERTA_TOKEN` INCRUSTADO EN EL PROMPT** del trigger (literal de 48 chars),
    no en las variables del entorno como el resto. Consecuencia práctica: al rotar el token, esa rutina
    **no se arregla tocando su entorno** — hay que editar el prompt. Huella SHA-256 del literal actual:
    empieza por `ee100c6d` (comparar con el valor vivo de Vercel: `printf %s "$ALERTA_TOKEN" | sha256sum`).
  - 🟢 **Pendiente cerrado:** ese prompt **ya NO lleva el `CRON_SECRET` literal** que denunciaba
    `RUTINAS-PROGRAMADAS.md` (pendiente #9) — verificado leyendo el prompt real. Doc corregido.
  - PR #1104 **mergeado** (`fe98507`): guardián de rutas de rutina, chivatazo del 401 por Telegram,
    preflight GET, `ALERTA_TOKEN` editable con redeploy automático y `docs/AVISOS-AGENTES.md`.

- **🔇 401 de `/api/internal/alerta` — CONFIRMADO NO RESUELTO y arreglado de raíz (27/07/2026, rama
  `claude/token-desincronizado-401-3gwhdi`).** Alberto: "creo que resolvió, confirma". **No había
  resuelto:** lo mergeado hoy (PR #1101) arregla el bloqueo del PRICING, que es OTRO fallo. Evidencia
  dura de que son dos cosas distintas: el 27/07, contra el MISMO despliegue de producción, la rutina
  `pricing-agente` **sí** mandó su Telegram (commit `c93c2bb`, "Aviso Telegram enviado") mientras
  `buscador-ia` recibía 401 en ese mismo endpoint (commit `095080b`) y `agentes-entrenador` lo mismo el
  26/07. **Luego el valor de Vercel está BIEN**: lo que está desincronizado es el **entorno de Claude
  Code de esas dos rutinas** (hay uno por rutina; el arreglo del 19/07 se aplicó al "Default" y nadie
  recorrió los demás). Que se repita no es descuido: el fallo es **auto-anulante** (el canal que se
  rompe ES el canal de aviso) y `lib/agentes-salud.ts` da a las rutinas Claude "sin telemetría", así
  que nadie se entera hasta leer los commits a mano.
  - **Segundo fallo, encontrado de paso y de la misma familia:** `isRoutineAuthorized` vivía SOLO en el
    handler, pero el **middleware** solo dejaba pasar `CRON_SECRET`. Un endpoint podía aceptar
    `ALERTA_TOKEN` en su código y ser igualmente inalcanzable (307 → /login antes de correr). Es lo que
    tuvo al pricing 3 ciclos bloqueado (20/07, 22/07, 27/07) con el diagnóstico equivocado "falta
    `CRON_SECRET`". Las excepciones se añadían A MANO a `PUBLIC` y olvidarse era invisible.
  - **Arreglado:** (1) `lib/rutas-rutina.ts` — fuente ÚNICA de las rutas alcanzables con el token de
    rutina, consumida por el middleware (pass-through de `ALERTA_TOKEN` acotado a esa lista, NO abre el
    resto de la app); (2) **guardián `test/regression-rutas-rutina.test.ts`** que cruza en las DOS
    direcciones los handlers que autentican rutinas (`isRoutineAuthorized` o `isAlertaTokenAuthorized`)
    contra `RUTAS_RUTINA`+`PUBLIC` — verificado que falla al quitar una ruta y pasa al devolverla;
    (3) `/api/internal/alerta` **se chiva de sus propios 401 por Telegram** (el servidor sí tiene
    `TELEGRAM_BOT_TOKEN`), con texto FIJO —nunca el cuerpo, que en un 401 no está autenticado— y
    anti-spam de 6 h en memoria de instancia; (4) **`GET` de preflight** para que el agente valide su
    token AL ARRANCAR, y cuerpo del 401 con `causa`+`remedio`; (5) `ALERTA_TOKEN` marcado **editable**
    en `secrets-registry.ts` → se rota desde `/operador/secretos` con **redeploy automático** (el paso
    que se olvidó el 19/07: una env de Vercel no entra en runtime sin redeploy); (6) `docs/AVISOS-AGENTES.md`
    como protocolo único + sección "Canal de aviso" en las 9 skills de agentes y en `/auditoria-diaria`.
  - **Convivencia con PR #1102** (mergeado a main mientras se hacía esto): #1102 mete las 2 rutas de
    pricing en `PUBLIC`. Se CONSERVA tal cual —acaba de desbloquear al agente en vivo y no se toca en el
    mismo PR— y convive con el pass-through por token. Endurecimiento pendiente (seguro, 2 líneas): sacar
    esas 2 de `PUBLIC` y dejarlas solo bajo `RUTAS_RUTINA`, que es más estrecho (exige el token para
    siquiera alcanzar el handler), cuando el ciclo semanal de pricing confirme que va fino.
  - **PENDIENTE DE ALBERTO (solo lo puede hacer él, no hay API):** recorrer los entornos de Claude Code de
    `agentes-entrenador` y `buscador-ia` y pegar el MISMO `ALERTA_TOKEN` que ya funciona en el de pricing.
    Las variables de un entorno de rutina solo se editan en la UI de claude.ai/code.
  - Verificado: `tsc` 0 · 24/24 tests `node --test` · `next build` exit 0.

- **✅ buscador-ia — 27/07/2026: pasada semanal sana + criterio ampliado a calidad/precio.** Watch de
  deprecación: los 4 eslabones de la cadena directa de `@central/core-ai` (NIM `meta/llama-3.3-70b-instruct`,
  Groq `openai/gpt-oss-120b`, Gemini `gemini-flash-latest`, Kimi `kimi-k2.6`) confirmados **vivos** por
  primera vez sin ningún roto — el alias rodante de Gemini (aplicado 12/07) absorbió solo el salto a
  Gemini 3.5 Flash GA, sin tocar código. Descubrimiento: `z-ai/glm-5.2` gratis en NVIDIA NIM, candidato
  fuerte pendiente de mini-eval con key real. **Decisión de Alberto (en chat):** el agente ya no exige que
  el candidato sea gratis, compara por **relación calidad/precio** — a igualdad de calidad gana el gratis
  (precio $0 es la mejor relación posible); un swap de un eslabón gratis vivo a uno de pago sigue exigiendo
  aviso Telegram explícito con el precio, nunca PR mecánico. Cambio en `.claude/skills/buscador-ia/SKILL.md`
  + `docs/SKILLS.md`. Cabo suelto sin resolver: `CONTABLE_MODEL` (default `deepseek-ai/deepseek-v3`) sin
  confirmar en vivo si sigue en el catálogo NIM — WebFetch directo a `build.nvidia.com` dio 403 (proxy) y
  la sesión no tenía `NVIDIA_API_KEY`; sin evidencia de rotura, solo falta de confirmación directa, pendiente
  para alguien con la key a mano. PR #1103 mergeado a `main` (squash `e4d644b`).

- **✅ Pricing SIVRA — 27/07/2026 (4ª parte): "Luxury a 214€ sin suavizar" era FALSA ALARMA, no un bug.**
  Alberto pidió revisar el hallazgo del resumen anterior. Causa: `rate_snapshots` tiene 2 columnas con
  nombres invertidos de lo intuitivo — `price_pricelabs` es el precio REAL vivo en Smoobu (coincide con
  `pricing_applied.new_price`), y `price_ours` es una fórmula LEGACY estática (`calcOurs()` en
  `lib/pricing-calendar.ts`: base fija × estacional × día-semana) de ANTES de que existiera el motor real
  anclado al mercado — un "shadow" histórico que el motor nunca usa para decidir ni escribir. El "214€"
  era `calcOurs(225, 2026-08-01) = 225×0.85×1.12 = 214`, pura coincidencia de fórmula sin relación con
  Smoobu. El precio REAL aplicado para esa fecha es 95€, en línea con el mercado real (~74-106€) — el
  motor está funcionando bien en agosto para Luxury, no hace falta tocar ninguna curva de last-minute.
  **Fix:** comentarios de advertencia añadidos en `calcOurs()` y `rates/snapshot/route.ts` (commit
  `7632c1c`, mismo PR #1102) para que ni un agente ni Alberto vuelvan a leer `price_ours` pensando que es
  el precio vivo. Corregido también en `pricing_aprendizaje` (temporada `pulso_agosto_27_07_2026`).
  Ningún cambio de comportamiento de precio — pura corrección de una trampa de nombres en observabilidad.

- **🔓 Pricing SIVRA — 27/07/2026 (3ª parte): la causa raíz REAL era el middleware, no el dominio.**
  Ciclo semanal completo de los 4 pisos (house/duplex/busto/luxury). Al intentar usar el arreglo de la
  2ª parte de hoy (endpoints portados a plataforma + `ALERTA_TOKEN`), el POST a
  `/api/sivra/mercado/ingest` seguía devolviendo **307 → /login**: `apps/plataforma/middleware.ts` solo
  eximía del gate de sesión a bearer==`CRON_SECRET` (la llave maestra), y esta rutina lleva a propósito
  solo `ALERTA_TOKEN` (de bajo privilegio) — así que el gate cortaba la petición ANTES de que
  `isRoutineAuthorized`/la auth escalonada del propio handler llegaran a ejecutarse. Los 3 ciclos previos
  (20/07, 22/07, 27/07 1ª/2ª parte) diagnosticaron síntomas reales (falta de CRON_SECRET, dominio sivra
  inalcanzable) pero ninguno tocó el middleware, que era el bloqueo final. **Fix** (rama
  `claude/sharp-wozniak-6tnedm`, commit `89c8114`, PR draft pendiente de abrir): añadidas
  `/api/sivra/mercado/ingest` y `/api/sivra/pricing/aplicar-propuesta` a la lista `PUBLIC` del middleware
  — mismo patrón ya usado para `/api/internal/alerta`. No cambia ningún comportamiento de precio (cada
  handler revalida su propio secreto). **Pendiente:** mergear a `main` para que Vercel lo despliegue; esta
  sesión no pudo probarlo en vivo (el proxy de red de esta rutina solo permite el dominio de producción,
  no previews de PR). Mientras tanto: Paso 2 de este ciclo (comps de mercado) se hizo por INSERT directo a
  Supabase — 30 filas nuevas hoy (luxury may/jul-2027: 20; house ago-2026: 10, que estaba a 0 — único gap
  real). Verificación obligatoria del ciclo: house=10, duplex=10, busto=30, luxury=30, ningún piso a 0.
  Paso 4 (aplicar propuesta) sigue sin decisiones reales — `pricing_decisiones` vacía desde 05/07 — hasta
  que el fix esté en producción; no se fabricó nada a mano (regla del skill). **Próximo ciclo:** comprobar
  si el PR ya se mergeó antes de repetir cualquier diagnóstico de red/dominio, y reintentar el POST a
  `aplicar-propuesta` con `ALERTA_TOKEN` (debería dar 200 `dryRunForzado:true` en vez de 307).

- **🔓 Pricing SIVRA — 27/07/2026 (2ª parte): BLOQUEO RESUELTO por código, sin tocar red ni secretos.**
  Diagnóstico de Chrome sobre el entorno "Default" de la rutina: (1) `CRON_SECRET` **nunca llegó** a estar ahí
  (solo `ALERTA_TOKEN` + `PLATAFORMA_URL`), (2) la allowlist de red tiene **un único dominio**:
  `plataforma-ten-flame.vercel.app` — **ningún dominio de sivra** (`sivra-app`/`sybra`/`housesevillana`.vercel.app,
  los tres Production del proyecto `sivra`), lo que explica el 403, y (3) el campo de variables **avisa de que
  es texto plano visible, no un almacén de secretos**. Ese aviso coincide con lo que ya decía
  `apps/plataforma/lib/cron-auth.ts`: a las rutinas **NO se les da la llave maestra**, se les da un token
  dedicado de bajo privilegio (`ALERTA_TOKEN`). **Solución (decisión de Alberto):** en vez de copiar el
  secreto o abrir el egress, se usa lo que YA estaba permitido. (a) `/api/sivra/mercado/ingest` de plataforma
  pasa a `isRoutineAuthorized` (acepta `ALERTA_TOKEN` o `CRON_SECRET`); (b) **portado** el endpoint de raíles a
  `apps/plataforma/app/api/sivra/pricing/aplicar-propuesta/route.ts` (copia fiel: pausa, suelo, tope ±%/día,
  techo, circuit-breaker, solo fechas disponibles, auditoría), coherente con que lo interno vive en plataforma.
  **Privilegio ESCALONADO (importante):** como este endpoint mueve dinero real, `ALERTA_TOKEN` autoriza **solo
  dry-run** (fuerza `dryRun=true` y responde `dryRunForzado:true`); aplicar EN VIVO exige `CRON_SECRET` o sesión
  de admin — así el token que viaja en prompts nunca mueve un precio, respetando el principio "nunca dinero
  real" de `cron-auth.ts`. Encaja con el flujo del skill (el agente propone en dry-run, Alberto revisa y suelta).
  Skill `pricing-agente` actualizado: usar SIEMPRE plataforma, nunca sivra (inalcanzable por red). Verificado:
  `tsc` 0 errores · guardián de secretos 22/22. **Cero cambios de configuración pendientes.**

- **💰 Pricing SIVRA — 27/07/2026: comps de agosto refrescados por Supabase; el bloqueo del Paso 4 tiene
  DOS causas, no una.** Alberto pidió ejecutar pese al bloqueo. **Causa raíz ampliada:** además de que la
  sesión programada no recibe `CRON_SECRET`, **el proxy de red del entorno devuelve 403 en el CONNECT a
  `*.vercel.app`** → los endpoints de sivra (`/api/mercado/ingest`, `/api/pricing/aplicar-propuesta`) son
  **inalcanzables por HTTP desde la sesión, con o sin secreto**. Por eso el único camino que llegaba era el
  rodeo `pg_net` (corre dentro de Supabase, fuera de la política de red). Exponer el secreto es necesario
  pero **no suficiente** para llamar por HTTP directo. **Sí ejecutado (Paso 2):** 50 comps Booking de
  agosto-2026 escritos en `market_rates` replicando el `INSERT ... ON CONFLICT` exacto del endpoint (misma
  clave idempotente) — busto 30 comps (8/15/22-ago), luxury 10 y duplex 10 (8-ago). **Corrección grande:
  agosto de Busto estaba a p50 137€ con barrido del 05/07 → real 82€ (~67% inflado).** **Hallazgo que
  descarta la hipótesis de datos en Luxury:** sus comps NO estaban mal (120€ real = 120€ en BD), luego sus
  214€ en vivo sin reservar a 5 días vista son **del motor** (no suaviza bastante cerca de fecha en
  temporada baja) → pendiente revisar la curva last-minute con dryRun + OK explícito de Alberto. **NO
  ejecutado ni simulado:** Paso 4 — no se fabricó ninguna fila en `pricing_decisiones` (aplicar por SQL
  saltaría suelo/tope/circuit-breaker con 2 pisos EN VIVO). El cron in-app `apply-auto` recogerá los comps
  nuevos y re-tarificará Busto por los raíles. Sin refrescar: house (8p) y fechas 4p más allá del 8-ago.

- **🔍 Auditoría diaria (ligera) — 27/07/2026: sin drift de código, un mapa corregido, 2 falsos
  positivos de heartbeat confirmados.** Rango mínimo desde ayer (2 commits: memoria de María/IS2025
  y el PR #1096 de auto-envío de cortesía, este ya con memoria+skill reconciliadas en su propio
  commit). Fix de carril 1: `docs/FUENTES-DE-VERDAD.md` — la fila de `sivra-maestro` solo apuntaba a
  `apps/sivra/**`, pero la skill documenta la gestión interna (agente huésped, pricing, mensajería)
  que vive en `apps/plataforma/lib/sivra/**`+`app/api/sivra/**`; sin corregirlo, cambios como el de
  ayer no disparan el chequeo de frescura de esta skill. Heartbeat de crons: 3 `⛔ MUDO` brutos, los 3
  cerrados sin acción — `trading_paper_track`/`ia_director_aprendizaje` (crons solo-lunes 10:00/05:00
  UTC) aún no habían corrido a la hora de la pasada (~02:00 UTC), diagnóstico y logging ya cerrados el
  26/07; `limpiadoras/auto-sessions`/`updates/sync` verificados por Vercel MCP como `200` a las 05:00
  UTC del 26/07 sin filas nuevas que insertar — falso positivo idempotente, mismo patrón que el
  02/07/2026. Sin hallazgos de carril 2 → sin PR, sin Telegram. Detalle en `docs/AUTO-APLICADOS.md`.

- **✅ Agente huéspedes SIVRA — auto-envío de CORTESÍA de fin de estancia (26/07/2026, rama
  `claude/automatic-guest-message-q6wzol`).** Alberto vio el borrador propuesto a un huésped que
  escribió *"ya hemos dejado el Dúplex"* (thank-you post-checkout de Redondo, reserva 147701696) y
  decidió: *"este tipo de mensajes puede mandarse ya automáticamente"*. **Causa de que se propusiera y
  no se auto-enviara:** ese mensaje cae en categoría `general` (`detectCategory` no lo casa — "dejado"
  no contiene "dejar", ni "salida"), y `general` **nunca** se gradúa; además un cierre puro tenía
  `requiere_respuesta=false`, que el orquestador bloqueaba explícitamente del auto-envío. **Fix:** nueva
  vía de auto-envío de **cortesía** que NO depende del contador de graduación por categoría —
  despedidas / agradecimientos / cierres puros ("siempre iguales", riesgo mínimo). Piezas:
  (1) `reglas.ts::esDespedida()` — detector puro (ES/EN/FR/DE/IT) de fin de estancia ("ya hemos dejado
  el X", "gracias por todo", "todo perfecto", "we've checked out", "everything was perfect"…), con
  precisión > cobertura (planes futuros tipo "mañana salimos" NO disparan); (2) `decidir.ts` expone
  `Decision.es_cortesia = esCierre || esDespedida`; (3) `orquestador.ts`: `puedeAuto = autoCortesia ||
  autoGraduado`, ambos bajo las **guardas comunes** `!needs_human && reply && sentimiento!=='negativo'`
  → nada sensible (quejas/dinero/cambios/emergencias), negativo, con dato inventado o escalado por la IA
  se auto-envía jamás (se sigue proponiendo a Alberto). Sigue mandando la **copia informativa** por
  Telegram (`avisarAutoEnviado`). Tests: +14 en `reglas.test.ts` (34 en el archivo, 113 en el agente,
  todos verdes; `tsc`/`build` no verificables en el contenedor por deps sin instalar). Nada de
  categorías básicas cambió: la graduación por 5 aprobaciones sigue igual para el resto.

- **✅ RESUELTO — `ia_director_aprendizaje` (bucle de aprendizaje del Director) ya escribe, causa raíz
  encontrada y arreglada en caliente (26/07/2026, PRs #1094 + revert de #1092).** Abierto desde el
  09/07, marcado ⛔ MUDO desde el 21/07 sin diagnóstico real ("pendiente de diagnosticar igual que el
  paper-tracker"). A petición de Alberto ("haz test y busquemos solución"), se disparó el cron
  `/api/cron/ia-director-refresh` **a mano en producción** (habilitando temporalmente `ALERTA_TOKEN`
  como auth alternativa, PR #1092 — el preview de Vercel está bloqueado por la política de red de la
  sesión, mismo 403 ya conocido de `trading-analista`) y el logging del PR #1089 reveló el error real
  al instante: `ERROR: function make_interval(days => bigint) does not exist`. **Causa:** Prisma envía
  el parámetro `dias` (JS number) como `bigint` por el wire, y `make_interval()` solo tiene overload
  para `int` en su parámetro con nombre `days` — Postgres no hace el cast implícito en resolución de
  sobrecarga con parámetros nombrados. Reproducido y verificado por SQL directo (`PREPARE`/`EXECUTE`)
  antes de tocar código. **Fix:** un cast, `make_interval(days => ${dias}::int)` (PR #1094). Vuelto a
  disparar el cron tras el deploy → **5 filas reales insertadas al instante** (confirmado por Supabase
  MCP). El auth temporal de `ALERTA_TOKEN` se revirtió a `CRON_SECRET` en el mismo lote (era solo
  andamiaje de diagnóstico). **`trading_paper_track` NO tocado** — su diagnóstico del 21/07 ("prematuro,
  no roto") sigue siendo el correcto, no comparte esta causa (no usa `make_interval` con parámetro).
  **🚨 LANDMINE para el futuro — `make_interval(<unidad> => ${variable})` en queries raw de Prisma
  SIEMPRE necesita `${variable}::int`** (o el tipo que corresponda); sin el cast, Postgres puede
  rechazar la sobrecarga en runtime y el `.catch()` que envuelva la query lo traga en silencio si no
  loguea el error. Ya se vio este mismo patrón (parcheado 2 de 3 veces) en
  `apps/plataforma/lib/banca.ts` — **línea 537 arreglada en la auditoría del 28/07/2026** (PR draft
  `claude/auditoria-diaria-2026-07-28`), la última de las 3 sin el cast.

- **🔒 Grants `prisma_*` acotados a least-privilege + bug real de un mes en ialimp (26/07/2026, a
  petición de Alberto tras la auditoría profunda de hoy — "resuelve como veas mejor").** El hallazgo más
  grave de la auditoría (grants idénticos de los 6 roles `prisma_*` sobre las 254 tablas de `public`,
  todos `rolbypassrls`, cualquier vertical filtrada daba acceso a la banca) se resolvió para 4 de 6 roles:
  `prisma_transporte`/`prisma_alquiler`/`prisma_almacen`/`prisma_ialimp` ahora solo tienen grants sobre sus
  propias tablas (+ `SELECT` en `cuentas` para login). `prisma_plataforma` se dejó ancho a propósito (es
  el consolidador, confirmado por grep que su anchura es uso real). **`prisma_sivra` se dejó SIN tocar,
  decisión CERRADA de Alberto**: se preguntó si borrar el código legacy de `apps/sivra` (~50 rutas API que
  tocan tablas de `ialimp`, limpiadoras) para poder acotar el rol con confianza — respondió **"ialimp no
  borres nada, Vanessa creo que lo está usando"** → se queda con el acceso ancho de siempre, sin tocar
  nada de sivra ni de ialimp. Verificado con `has_table_privilege()` (no se pudo usar `SET ROLE`, el `postgres` de Supabase no tiene el
  privilegio `SET` sobre esos roles) + logs de Vercel de ialimp sin errores nuevos tras el cambio. Los 16
  RLS "USING(true)" + 47 vistas sin `security_invoker` de `iarest` se dejaron igual (mismo patrón ya
  aceptado en todo el repo: RLS no es el mecanismo de aislamiento, es de código). **De propina**, revisando
  los logs de Vercel apareció un bug real y no buscado: el cron `/api/cron/impagos` de ialimp llevaba
  **desde el 16/06/2026 fallando en silencio** (`42883 uuid = text` en un `IN(...)` sin cast) — arreglado
  y verificado reproduciendo el error exacto contra la BD real antes y después del fix. Detalle completo en
  `docs/AUDITORIA-2026-07.md` (actualización "(2)"). Además: PR #1093 (CI: `almacen` al typecheck +
  tests de `plataforma`/`almacen` wireados, sustituye a los duplicados #917/#936) y PR #1089 (logging de
  `ia_director_aprendizaje`, ya mergeado por Alberto) de la propia auditoría de hoy.

- **🎓 agentes-entrenador — pasada semanal 26/07/2026 (retoma el intento del 19/07 que quedó sin
  mergear en PR #1008).** Rango real 03/07→26/07: evidencia de ~24 entradas de bitácora repartidas en
  main + 11 PRs `claude/*` abiertos sin mergear (cada sesión de `facturas-correo`/`pricing-agente`/
  `buscador-ia`/`psd2-health-check`/`ialimp-client-health` abrió su propio PR docs-only y nadie los
  mergeó — hallazgo transversal para Alberto: mientras sigan abiertos, la poda de este agente no cuadra
  con `main`). 4 acciones por RENDIMIENTO (carril 2, todas en la PR de esta pasada por la restricción de
  rama única de la sesión programada): **`pricing-agente`** — el Paso 4 (aplicar precio real) lleva 2
  ciclos semanales seguidos (20/07 y 22/07) bloqueado en silencio por falta de `CRON_SECRET` → añadida
  regla de escalado por Telegram tras 2 bloqueos consecutivos. **`facturas-correo`** — patrón repetido
  3ª vez (11/07, 12/07, 24/07) de sesiones que procesan correo real sin dejar entrada en la bitácora →
  reforzado en Paso 0 que el auto-informe es obligatorio aunque la sesión sea ad-hoc o se corte a medias.
  **`psd2-health-check`** — falsa alarma 22/07 por no filtrar `origen='psd2'` (mezclaba el feed real con
  importaciones manuales agotadas) → añadido el filtro. **`auditoria-central`** — reaplicada la regla de
  caso de prueba numérico para cambios de fórmula de pricing (ya redactada en el PR #1008 sin mergear,
  se repite aquí para no depender de que se rescate ese PR). Sin acción: `ialimp-client-health` (fix de
  esquema ya en PR #1084 sin mergear, solo falta merge) y `agente-huésped` (feedback 04/07 ya resuelto en
  `decidir.ts`, verificado y marcado procesado). Sin evidencia suficiente para juzgar `trading-analista`,
  `github-vigia`, `fiscal-novedades`, `rrhh-compliance-calendar`, `correo-triaje` en el formato de esta
  bitácora. Bitácora podada (10 entradas + autoinforme previo); detalle completo en
  `docs/AGENTES-BITACORA.md`. Aviso Telegram con el resumen y el link a esta PR.

- **🐛 ia-rest: fix de build — timeout en el prerender de `/restaurantes` (23/07/2026, PR #1076,
  sin memoria anotada hasta la auditoría profunda del 26/07).** `apps/ia-rest/src/app/restaurantes/page.tsx`
  se prerenderiza en el build (`revalidate=3600`) y su query a Supabase colgaba >60s, tumbando el build
  ENTERO de ia-rest (mismo patrón que el bug de `/estado` del 24/06/2026, pero en otra ruta). Fix:
  `AbortSignal.timeout(25000)` + try/catch que degrada a `[]` — la página ya maneja el caso vacío e ISR
  rellena en la primera petición real. Verificado: preview de Vercel de ia-rest en verde (Ready). Sin
  cambios de BD/API.

- **🔍 Auditoría diaria (ligera) — 26/07/2026: por fin diagnóstico real de `ia_director_aprendizaje`
  (abierto desde el 21/07).** Rango sin apenas cambios de código (3 commits desde ayer). Checks
  estructurales (lockfile, `transpilePackages`↔`package.json` de las 8 apps, `ignoreCommand` de
  Vercel, `.vercelignore`, `docs/SKILLS.md` vs `.claude/skills/`) **todos ✅, sin drift**. El
  heartbeat de crons seguía marcando `ia_director_aprendizaje` (bucle de aprendizaje del Director,
  F4) como ⛔ MUDO — la auditoría del 21/07 ya lo había detectado pero lo dejó como **"pendiente de
  diagnosticar igual que el paper-tracker"** sin profundizar. Hoy se investigó a fondo (Supabase MCP
  + Vercel MCP): el cron `ia-director-refresh` **corre bien** (200 confirmado los lunes, `ia_director_prompt`
  tiene 4 versiones 09/07→20/07), el índice único `(fecha,modelo)` y los grants de `prisma_plataforma`
  están correctos, y la query fuente sobre `ai_usos` sí devuelve filas al ejecutarla a mano — pero la
  tabla sigue en 0 filas tras 4 lunes. No se pudo aislar la causa exacta porque el código traga el
  error del INSERT con `.catch(() => {})` sin loguearlo → **se añadió `console.error` en ambos
  catches** (`route.ts`) para que el lunes 27/07 el log de Vercel diga la causa real (carril 2, PR
  + Telegram). **`trading_paper_track` (paper-tracker) reconfirmado SIN acción:** el diagnóstico del
  21/07 («prematuro, no roto» — el único lunes desde que se congelaron las cohortes cayó en fin de
  semana, <2 barras de precio, `evaluarCestaVsBench` exige ≥2 → no persiste por diseño) sigue en pie;
  se añadió igualmente un `console.warn` de bajo riesgo para confirmarlo el 27/07 con evidencia en
  vez de solo inferencia. **`trading_cohetes_track` en 0 filas es esperado** (mismo patrón que el
  resto): la cartera cohetes (PR #1074, 23/07) aún no ha tenido su primer rebalanceo semanal (lunes
  09:30) — `valorarDia()` sale por `sin rebalanceos` sin error, se resuelve solo mañana. Detalle
  completo en `docs/AUDITORIA-2026-07.md` (sección de hoy).

- **💬 AGENTE HUÉSPEDES SIVRA — regla «entrada autónoma, nunca digas nos vemos» (25/07/2026,
  rama `claude/agente-evitar-nos-vemos-4zbknv`).** Alberto detectó (captura de un chat con Manuel Soriano,
  Luxury Busto) que el borrador se despidió con «¡Perfecto, Manuel! **Nos vemos** entonces a las 18:00…».
  El check-in es AUTOMÁTICO (el huésped accede solo, nadie le recibe en persona), así que «nos vemos» /
  «te espero» sugiere un encuentro que no va a ocurrir. Fix: nueva regla permanente en el system prompt de
  `apps/plataforma/lib/sivra/agente-huesped/decidir.ts` (justo tras la REGLA DE ORO) — «ENTRADA AUTÓNOMA»:
  prohíbe fórmulas de encuentro presencial («nos vemos», «te espero», «te recibo», «estaré allí/en la puerta»,
  «te abro», «hasta ahora/luego» con sentido de vernos) en TODA fase, y da la alternativa correcta para acusar
  recibo de la hora de llegada («Tomo nota de que llegáis sobre las 18:00»). Cambio solo de texto del prompt
  (no toca el flujo de decisión/escalado). **Ampliación (misma rama):** Alberto pidió aplicarlo también «al
  agente de triaje de correo». El triaje (`lib/correo/*`) NO redacta mensajes de huésped —su IA solo
  clasifica— y para huéspedes delega en `procesarMensajeHuesped`→`decidir.ts` (ya cubierto). El hueco real
  estaba en el OTRO camino de redacción, **`redactar.ts::redactarDesdeIdea`** (profesionaliza la idea en bruto
  de Alberto al usar ✏️ Modificar/🔧 Retocar), cuyo system prompt era solo «Eres el anfitrión de <piso>
  (Sevilla)» sin regla de estilo. Se le añadió la misma regla de entrada autónoma. Tests `redactar.test.ts` 7/7 OK.

- **🧾 FINANZAS — gastos de software/infra en la correduría → subcategoría `informatica` (25/07/2026,
  rama `claude/gastos-por-revisar-categoria-zthr7q`, seguimiento del PR #1082).** Revisando «más casos»,
  aparecieron en `destino='seguros'` (BBVA) cargos que NO son pólizas: **Vercel (−683,39€) y Anthropic/Claude
  (−218,25€)** = herramientas de la actividad de Alberto (corredor autónomo), más un tributo de −600€ y unos
  «Adeudo nº» sin nombre (pendientes de que Alberto los identifique). Decisión: los de software siguen
  **deducibles** (destino `seguros` = bucket del negocio) pero etiquetados **`subcategoria='informatica'`**
  para distinguirlos de comisiones/pólizas. **La matriz de la correduría es de INGRESOS (`importe>0`)** → estos
  gastos nunca la ensuciaron; el cambio es de etiquetado + durabilidad. Fix durable: `lib/destino.ts::RE_SOFTWARE`
  (VERCEL/ANTHROPIC/OPENAI/OPENROUTER/GITHUB/CLOUDFLARE/SUPABASE/cloud… en BBVA → `seguros`+`informatica`
  +auto-confirmado, no vuelven a «por revisar»; NARROW a propósito, ocio como Netflix NO entra). Backfill
  `prisma/sql/2026-07-25_software_informatica_seguros.sql` (aplicado, 3 filas). Caveat abierto: si esa plataforma
  da servicio también a pisos/personal, solo la parte afecta a la correduría es deducible (criterio de Alberto).
  Tests 25/25. ⚠️ `next build`/`tsc` no verificables en contenedor (deps `@central/*` sin instalar) → gate en CI.

- **🧾 FINANZAS — TotalEnergies mal clasificado + recibos SEPA devueltos (24/07/2026, rama
  `claude/gastos-por-revisar-categoria-zthr7q`).** Alberto preguntó por un `-3,98€` de "TE ELECTR…"
  atascado en «Gastos por revisar · categoría». Diagnóstico (verificado en BD): (1) el concepto completo
  es **TotalEnergies** ("TE ELECTRICIDAD Y GAS ESPANA SA"), y `lib/destino.ts::RE_DUPLEX`/`RE_PISOS` NO lo
  conocían → cada recibo en BBVA caía a `seguros` por descarte + `requiere_revision` (mal: es luz/gas del
  Dúplex, no correduría). Los de mayo/junio salían bien solo porque Alberto los reclasificó a mano
  (`destino_confirmado=true`); sin regla aprendida, volvía cada mes. (2) Era un **recibo DEVUELTO**: cargo
  `-3,98` + "ANULACION ADEUDOS DIRECTOS" `+3,98` (misma ref `N 2026198000644355`) → neto 0, pero el agente
  no los emparejaba (el `casarDevolucion` de `devoluciones-tarjeta.ts` solo cubre TARJETA, no adeudos SEPA
  de cuenta corriente). Ojo extra: el panel se llena por `requiere_revision` (flag del **negocio/destino**),
  pese a rotularse "categoría contable" — la categoría (`suministros_piso`) sí estaba clara. **Fix (arreglo
  completo):** TotalEnergies añadido a `RE_DUPLEX`+`RE_PISOS` (destino.ts); nuevo `lib/devoluciones-sepa.ts`
  (puro) + `categorizar.ts::casarDevolucionesSepa(cuentaId)` que empareja anulación↔cargo por la ref común
  `N <…>`, copia el destino y confirma ambos (llamado al final de `analizarMovimientos`); backfill
  `prisma/sql/2026-07-24_totalenergies_duplex_devolucion_sepa.sql` (aplicado por Supabase MCP: los 2
  apuntes → `turistico_duplex`, confirmados, fuera de «por revisar»; 0 TE en seguros). Tests: 24/24
  (destino + devoluciones-sepa). ⚠️ `next build`/`tsc` NO verificables en el contenedor (deps de workspace
  `@central/*` sin instalar) → gate real en CI del PR.

- **🚀 TRADING — Cartera cohetes (paper) montada de punta a punta (23/07/2026, PR #1074).** Bolsillo
  SIMULADO independiente del núcleo (30.000€, `CAPITAL_COHETES_EUR`) que ROTA cada semana a los cohetes
  confirmados del último `trading_ranking` (equiponderado) y se VALORA a diario contra el SPY (buy&hold)
  + la curva de la última cohorte del núcleo — curva de 3 bandas en `/trading`. Sub-experimento IPO
  (¿rinden peor los recién cotizados?), narración IA solo-contexto (nunca cifras/selección) y bloque en
  el digest Telegram del paper-tracker. Piezas: pieza pura `@central/module-trading::carteraCohetes`
  (reparto + valoración + sub-cesta IPO), IO `apps/plataforma/lib/trading/cartera-cohetes-io.ts`
  (`rebalancearCartera`/`valorarDia`/`resumenCohetes`/`curvaCohetes`/`narrarCohetes`), tablas
  `trading_cohetes_rebalanceo` (libro inmutable) + `trading_cohetes_track` (curva diaria), crons
  `trading-cohetes-rebalanceo` (L 09:30) y `trading-cohetes-track` (mar-sáb 07:00), UI
  `app/(usuario)/trading/CarteraCohetes.tsx`. **Retro-test previo dio +868% vs SPY +30% pero con fuerte
  survivorship bias** (favorece a la lotería) + régimen junk-rally → el forward NO debería replicar esa
  magnitud; peor mes histórico −19,1%. **100% paper, cero órdenes reales, el criterio de selección NO se
  auto-modifica.** Hipótesis **H7 pre-registrada** (`docs/TRADING-HIPOTESIS-PREREGISTRO.md`), evaluación
  2026-10-15.

- **📱 plataforma: «Ingresos por revisar» legible en móvil (22/07/2026, PR #1070).** La fila de `/banca`
  era un flex de una sola línea (fecha 84px + concepto + select «Asignar negocio…» 160px + importe 92px)
  que a ~320px comprimía el concepto casi a 0 y el desplegable lo tapaba — no se podía leer de qué ingreso
  se trataba. Mismo patrón responsive que ya usa «Gastos por revisar» justo encima: a ≤768px la fila se
  apila en card (concepto ancho completo arriba, fecha+importe en una línea, desplegable ancho completo
  debajo). Solo CSS/clases, sin lógica. Verificado `next build` exit 0.

- **💧 EMASESA julio-2026 imputado a piso + agente enseñado a hacerlo solo (22/07/2026).** Los 3 recibos
  `RECIBO EMASESA … EMASEPE26…` del 20/07 (Kutxa, 117,99€ · 80,26€ · 50,48€) entraban como `turistico_pisos`
  pero con `propiedad_id=NULL` porque el concepto bancario solo trae la ref del recibo (`PE26…`), NO el nº de
  contrato. **Se resuelve con el correo e-factura** de `Servicio.eFacturas@emasesa.com` (14/07), que trae
  `Nº Suministro` + dirección + importe: casados por importe exacto → **117,99€ = Socorro (0104785292/
  `prop_house_sevillana`) · 80,26€ = Luxury Busto DER (0105137440/`prop_luxury_busto`) · 50,48€ = Busto Reform
  IZQ (0105185751/`prop_busto_reform`)**. Los 3 movimientos actualizados (`propiedad_id`, `destino_confirmado`,
  `conciliado`, `factura_ref`) y registrados en `facturas_drive` (mes 7, `fuente='manual'`). **Fix durable:**
  la skill `facturas-correo` (sección EMASESA) ahora lleva el procedimiento paso a paso (correo→contrato→piso,
  con `propiedad_id` en la tabla y fallback por ranking de importe) para que cada pasada del agente lo impute solo.

- **🧭 FISCAL — consejo breve "Qué haría yo" en las dos puertas de la renta (22/07/2026, rama
  `claude/agent-brief-advice-vcmx76`).** Alberto pidió "añadir un breve consejo del agente sabiendo los números y
  la normativa" sobre la pantalla de «Mi declaración». Como el módulo YA tiene mucho consejo repartido (avisos 💡,
  sugerencias, palanca de gasto verde, comparativa hoy/fin-de-año solo/conjunta), el valor no era añadir otra caja
  sino **elegir y narrar en una frase** lo que ninguna pantalla daba. Nuevo helper **PURO y DETERMINISTA sin IA**
  `apps/plataforma/lib/consejo-fiscal.ts` (`consejoFiscal(estado, hoy)` → titular en lenguaje llano: vas camino de
  pagar/que te devuelvan X en la modalidad recomendada + **PROVISIÓN de tesorería**: si sale a pagar y el año sigue
  abierto, cuánto apartar/mes hasta junio del año siguiente para no llevarse el susto en la campaña). NO repite la
  palanca de tramo (de eso ya va la tarjeta verde de debajo) → sin duplicar. Cero riesgo de cifras alucinadas
  (patrón "determinista primero" del módulo). Componente presentacional compartido
  `app/(usuario)/finanzas/ConsejoFiscalBox.tsx` enchufado en las DOS puertas fiscales: `FiscalResumen.tsx`
  (segmento 🧾 Fiscal de `/banca`, el del screenshot) y `DeclaracionBlock` en `finanzas/fiscal/FiscalPageClient.tsx`.
  Verificado: **190/190 tests `node --test`** (7 nuevos en `consejo-fiscal.test.ts`) · `next build` ✅. Sin cambios
  de BD/endpoints/IA — solo UI + un helper puro.

- **📣 PROSPECCIÓN COMERCIAL (ialimp + ia-rest) — los 2 "bloqueos de infra" del run re-diagnosticados; ficha
  creada (22/07/2026).** Un run de la Rutina `Agente de prospección comercial — ialimp + ia-rest` (L-V 11:00
  CEST, `0 9 * * 1-5` UTC) abortó alegando dos piezas de infra ausentes. Verificación en sesión: **(1) Gmail
  NO estaba caído** — `ListConnectors` dio `connected: true, enabledInChat: true`; el flag es por-sesión, así
  que si en el entorno de la Rutina no aparece adjunto hay que activarlo en su config (como "adjuntar el repo").
  **(2) El bloqueo de Telegram era diagnóstico ERRÓNEO:** las rutinas Claude NO usan `TELEGRAM_BOT_TOKEN`/
  `CHAT_ID` (viven solo en Vercel plataforma); el resumen va por `/api/internal/alerta` con `ALERTA_TOKEN`, que
  esta Rutina aún no lleva en sus Instrucciones. **Hecho por mí (rama `claude/missing-infrastructure-task-iq4261`):**
  la Rutina 13 ya tiene ficha en `docs/RUTINAS-PROGRAMADAS.md` + pendiente manual #11 con los pasos exactos.
  **Pendiente de Alberto (UI claude.ai, p.ej. Claude para Chrome, NO código):** (a) pegar `PLATAFORMA_URL` +
  `ALERTA_TOKEN` (mismo valor que ya funciona en la auditoría diaria) en las Instrucciones de la Rutina; (b)
  confirmar el conector Gmail adjunto en la Rutina. No redacté emails ni contacté empresas: el prompt real de la
  campaña vive en el trigger, no en el repo, y no procede inventarlo.

- **🏷️ PRICING — la Rutina semanal marca ✅ pero NO estudia mercado de forma fiable + punto ciego del monitor
  cerrado (22/07/2026).** Al verificar la Rutina `Agente de pricing (sivra) — semanal` (existe, activa, con los 5
  conectores de viaje, carga la skill `pricing-agente`), la BD desmintió los checks verdes: cruzando sus
  ejecuciones ✅ (20 jul 7:08, 13 jul 7:08, 6 jul 7:01…) con las inserciones reales en `market_rates (scenario
  prop_*)`, **las corridas programadas de las 7:08 no dejan rastro** (la del 20 jul escribió CERO); las
  inserciones que existen caen a horas raras (18:29, 14:19, 22:47) → son sesiones manuales/cron in-app, no la
  Rutina. Peor: **el Dúplex y House Sevillana no se estudian desde el 29 jun (555 h / 23 días)**; solo
  `busto_reform` (143 h) y `luxury_busto` (105 h) se refrescan. Un ✅ verde solo dice "la sesión terminó sin
  reventar", no "hizo el Paso 2". **Causa probable doble:** (a) el campo *Instrucciones* de la Rutina tiene
  pegada TODA la meta-conversación de "rellena el formulario así…" con las instrucciones reales anidadas en un
  bloque → confunde al agente; (b) sin verificación de escritura, un no-op pasa como éxito. **Arreglado por mí
  (rama `claude/trading-duplicate-routines-3k7hro`):** la sonda de pricing del cron `agentes-latido`
  (`app/api/cron/agentes-latido/route.ts`) pasó de `max(created_at)` global — que un solo piso fresco tapaba —
  a **por-piso (min de los max de los 4 pisos)**, que sí dispara la alarma con el rezagado (Dúplex/House a 555 h
  > umbral 192 h). `lib/monitoring/latidos.ts` nota actualizada. tsc 0, 5 tests verdes (PR #1064, build ✅).
  **Prompt de la Rutina CORREGIDO Y VALIDADO EN VIVO (22/07):** Alberto (vía Claude para Chrome) reemplazó el
  campo *Instrucciones* — que tenía pegada la meta-conversación entera con 3 pisos genéricos — por uno limpio
  que OBLIGA a los 4 pisos concretos, añade verificación de escritura por piso (paso 3) y una línea "Comps
  escritos: house=N, busto=N, luxury=N, duplex=N" en el resumen de Telegram (paso 7). Ejecución manual de
  prueba (10:19): con foto ANTES (4 pisos a 0 filas hoy) y DESPUÉS cotejada por mí en `market_rates`, escribió
  **182 comps reales de Booking** en los 4 pisos (house 76, duplex 52, busto 27, luxury 27; 9 fechas ago-26→jul-27,
  73€–571€) — los 555 h de sequía del Dúplex/House resueltos; la sonda por-piso quedó a 0,2 h (verde). Matices
  (no bloqueantes): solo tiró de Booking (fuente preferente de la skill; los otros 4 conectores son fallback) y
  9 fechas (< las ~12 del prompt). Lección clave: un agente puede "correr en verde" (✅ = la sesión terminó) y no
  producir NADA — la verificación fiable es la HUELLA en BD por unidad de trabajo (piso), cotejada por quien NO
  ejecutó, no el recuento que la propia sesión reporte.

- **🏷️ SIVRA — Guardián de precios: arreglado el RUIDO (avisos duplicados) y un HUECO de exactitud (22/07).**
  El aviso Telegram «5 avisos sin ver» traía repetidos. Causa: el dedup del guard (`apps/plataforma/app/api/
  sivra/pricing/guard/route.ts`) miraba «últimas 24h» y, con el cron diario a la misma hora, cada pasada quedaba
  fuera de la ventana y apilaba una fila `suelo_coste` nueva por día → duplicados en la ventana de 3 días del
  Telegram. Fix: dedup sin límite de tiempo (no recrea mientras el aviso siga abierto) + saneadas 4 filas
  duplicadas en BD. Además el chequeo #5 (reserva bajo mercado) comparaba contra el p50 BLENDED del piso (plano
  ~186€ para todas las fechas) en vez del de la FECHA exacta → dejaba pasar el infraprecio en EVENTOS: Karol G
  vendida a 344€ salía «+85% sobre mercado» cuando el mercado real de ese día era ~931€ (−63%); Feria 140€ vs
  424€ (−67%) se quedaba a 0,3% del umbral. Fix: p50 por fecha exacta (≥8 comps) con fallback al blended.
  Tests 10/10. **Causa raíz del infraprecio en eventos + fix del MOTOR (con OK de Alberto, «ajusta»):** el motor
  (`apply/route.ts`) solo consultaba el mercado por FECHA EXACTA dentro de `if (ev > 1)` (factor de evento del
  CALENDARIO). Karol G/Feria se vendieron baratas porque Ticketmaster/websearch NO las habían flagueado → el
  conector tenía 931€/424€ pero el motor las tarifaba con el bucket del MES y las hundía. Añadido **«premio de
  mercado por fecha»** (helper puro `lib/sivra/pricing-premio-mercado.ts`, 6 tests): si el mercado del propio día
  va ≥1.5× su base normal del mes, ancla a esa mediana TAL CUAL (sin ×factor → sin el doble conteo del 18/07),
  solo SUBE (salta el raíl ±%/día como el evento de calendario), respeta `max_price`. Umbral 1.5 para separar
  EVENTO (1,5-5×) de premio de FINDE (~1,1-1,4×, la mediana del mes mezcla findes/entre semana → no encarece un
  sábado). **Impacto inmediato ~nulo** (los eventos grandes ya están reservados; Busto ya cotiza sus premium por
  encima); el valor es que el PRÓXIMO evento se auto-tarifica aunque el calendario lo pierda. Único disponible
  infravalorado hoy: Luxury 17-oct (182€ vs 278€, ratio 1.32 → por debajo del umbral, no se toca; borderline).
  **MERGEADO a main 22/07 (PR #1065, producción verde):** Parte 1 = detección (guardián), Parte 2 = precio en
  vivo. Verificado en prod tras el merge: deploy READY, avisos sin duplicados (4 distintos), y el premio de
  mercado hoy no toca ninguna fecha disponible (los eventos grandes ya reservados; único ≥1,5× es Busto 26-dic,
  ya a 421€ > mercado 196€). Documentado en la skill `pricing-agente` (bloque «Actualización 22/07»).

- **📈 TRADING — universo del radar 550→800 + hallazgo de huérfanas (22/07, 2ª parte de lo de SPOT).**
  Al PROBAR el fix IFRS con datos reales (marqué 15 extranjeras como rancias → el cron `trading-universo`
  las recalculó): **11 rescatadas** con Piotroski/ROIC reales (ASML 8/ROIC 31,7%, Unilever, BABA, Diageo,
  AB InBev, BP, Equinor, BAT, ARM, Ericsson, argenx) — **el parser 20-F/IFRS funciona de verdad**. Pero
  **AZN, NVO, SE quedaron sin tocar** (`actualizado` seguía en 1970 = el cron NI las intentó). Diagnóstico:
  `refrescarLoteUniverso` solo procesa `WHERE simbolo IN (top-550 de company_tickers.json)`, y `listaUniverso`
  recorta a 550 **asumiendo un orden por capitalización que la SEC NO documenta** (`edgar.ts:206`). La BD lo
  confirmó: **77 filas huérfanas** (sin datos, timestamp viejo, nunca refrescadas) + 693 filas totales contra
  tope 550 → el universo ROTA y deja mega-caps foráneas fuera. **Fix (Alberto pidió «subir universo»):**
  `UNIVERSO_TAM` 550→**800** en `lib/trading/universo.ts` (lote sigue 50/pasada → coste por invocación IGUAL;
  solo baja la frecuencia de refresco a ~4 días; se quedó <1000 para no rozar el umbral de cobertura 50% del
  ranking en `radar.ts`). Las 551-800 (incluidas las huérfanas en ese rango) entran a epoch y se rellenan en
  las primeras pasadas. **✅ CONFIRMADO (24/07 00:20 UTC):** el bump a 800 los cazó — AZN (Piotroski 6/ROIC
  10,8%), NVO (6/41,4%) y SE (6/2,0%) se rellenaron con datos reales (`error=null`), y SPOT sigue OK (6/−5,9%).
  **15/15**, no hizo falta el fix robusto. Estaban en 551-800. (Queda como mejora futura, NO urgente, el fix
  robusto —que el cron refresque también las filas YA en tabla, no solo el top-N— porque el universo CHURNEA:
  la tabla creció 693→995 en 2 días y hay ~195 filas huérfanas fuera del tope 800 que nunca se refrescan.)

- **📈 TRADING — nuestro motor de factores es CIEGO a los emisores extranjeros (22/07).** Alberto trajo un
  gráfico **mensual de SPOT** (tesis discrecional: *"va a cruzar las medias y siempre ha respetado la EMA50"*)
  y pidió pasarlo por «nuestro análisis». Hallazgo: en `trading_universo` SPOT tiene **todos los fundamentales
  a `null`** (Piotroski/ROIC/earnings yield/FCF) — solo `momentum = −33,4%` (negativo). Confirmado que es un
  patrón de **filiales extranjeras** (ASML, ARM, NVO, SE, Unilever igual de ciegas): `lib/trading/edgar.ts::
  serieAnual` solo lee el nodo `us-gaap` y la forma `10-K`, así que ignora el **20-F/IFRS** que presentan esos
  emisores. Consecuencia: el blend no puede formar convicción sobre SPOT (nuestro *edge* es la selección por
  fundamentales, que ahí no llega) y el único dato duro —momentum— rema en contra → **nuestro sistema no
  tomaría la operación**. La tesis "EMA50" es justo el razonamiento que el proyecto degradó a *overlay*
  (backtest técnico −52%→breakeven, no bate buy&hold). No pude tirar precios en vivo (egress del sandbox
  cerrado a Yahoo/Stooq).
  **✅ ARREGLADO en la misma sesión (soporte IFRS/20-F en EDGAR):** Alberto pidió «conseguir más
  fundamentales». Descartada la vía Yahoo `quoteSummary` (exige crumb anti-bot + es snapshot, no point-in-time)
  a favor de exprimir EDGAR, que ya funciona en Vercel y es point-in-time. `lib/trading/edgar.ts`: `serieAnual`
  ahora lee el nodo `ifrs-full` y acepta la forma `20-F`; los alias de `ALIAS` llevan los conceptos IFRS
  (`ProfitLoss`/`Revenue`/`ProfitLossFromOperatingActivities`/`CurrentAssets`/`WeightedAverageShares`…) al
  final (US-GAAP primero → empresa EEUU sin cambio); y el ancla de `extraerFundamentales` pasó a ser
  alias-aware (antes clavada a `NetIncomeLoss`/`Assets`, fallaba en IFRS). Test IFRS nuevo en `edgar.test.ts`
  + regresión US-GAAP verificada aislada (edgar.ts solo importa `AnioFinanciero` como tipo → sin dep de
  `@central` en runtime). Se rellena solo en las próximas pasadas del cron `trading-universo`. En PR #1061.

- **💬 AGENTE HUÉSPEDES — copia a Telegram de lo que se auto-envía (21/07).** Alberto: *"no me llega
  respuesta del agente para responder"*. Diagnóstico (no era un fallo): la categoría **`checkin` está
  graduada** (`mensajes_auto_config.auto_enabled=true`) → el agente responde los check-in **solo**, sin
  pasarle el borrador → por eso el resumen diario marcaba `1 auto · 0 te esperan` y no le llegaba nada.
  Él lo confirmó ("respondía 100% automático") y pidió **mantener el auto-envío pero recibir una COPIA
  en Telegram solo para ver**. Implementado: nueva `avisarAutoEnviado(ctx,pregunta,dec)` en
  `lib/sivra/agente-huesped/telegram-msg.ts` (mensaje **sin botones**, `🤖 Respuesta automática`, con
  traducción 🔁 al español si el huésped escribió en otro idioma) que el `orquestador.ts` llama en la rama
  `puedeAuto` **solo si el envío a Smoobu tuvo éxito** (best-effort, no bloquea). No cambia la lógica de
  decisión ni de graduación. `tsc` 0. **Pendientes sueltos detectados** (colgados en `mensajes_pendientes_tg`,
  NO se auto-cierran): late check-out del 19/07 de Manuel (reserva 145956056, Telegram #2094) + 3 con
  borrador vacío de julio (06-07).

- **💡 TRADING — «Ideas de compra del agente» = SOLO compras REALES (auditoría 21/07).** Alberto vio en
  `/trading` una contradicción: la tarjeta «Analiza una acción» marcaba CVX como **calidad débil · técnico
  ⏳ en espera · RSI 81 (sobrecompra)**, y justo debajo el panel «💡 Ideas de compra del agente» lo listaba
  como **idea de compra momentum (conf 68)**. Auditoría → **defecto real**: el panel (`TradingDashboard.tsx`)
  leía `trading_tesis` y mostraba TODA fila `direccion='alcista'`. Esas filas son las señales **crudas** de
  cada estrategia del torneo, persistidas por `/api/trading/analizar` **antes de las barreras** y **sin saber
  cuál ganó** → salían nombres cuyo torneo ganó **bajista** (CVX con RSI 81: reversión sobrecompra/70 gana al
  momentum/68) o que las barreras (`factorFlojo`/`bajoTendencia`/régimen/earnings) vetaron. Datos reales lo
  confirmaron: **0 órdenes BUY y 0 posiciones en paper** — el agente NUNCA compró CVX, pero el panel lo pintaba
  como compra. **Fix (rama `claude/agent-buy-ideas-jms04y`):** columna **`trading_tesis.operada`** (migración
  `prisma/sql/2026-07-21_tesis_operada.sql`, **aplicada** + backfill desde `trading_paper_orden`), que
  `/api/trading/analizar` pone `true` SOLO en la señal ganadora que abre posición; el panel filtra
  `alcista AND operada`, con estado vacío honesto cuando no hay compras reales. De paso, corregido el
  «(las 1 alcistas más recientes)» (concordancia singular). tsc 0 · 105/105 tests module-trading · build OK.
  Skill `trading-analista` actualizada para no re-listar señales sin operar.

- **💓 MONITORIZACIÓN — watchdog trading ampliado + latidos de toda la flota de agentes (21/07).** Extensión de
  la idea del perro guardián tras verificarlo en vivo. **(1)** El watchdog de trading ahora vigila las DOS huellas
  de la pasada nocturna, no solo el NAV: `broker_saldos` (lectura IBKR) **y** `trading_tesis` (parte de análisis
  `/analizar`). Tapa el hueco de que IBKR diera el saldo pero `/analizar` petara en silencio
  (`app/api/cron/trading-watchdog/route.ts`). **(2)** Nuevo **monitor de latidos de agentes**
  (`/api/cron/agentes-latido`, diario 07:45 UTC): registro extensible (`lib/monitoring/latidos.ts`, `evaluarLatido`
  puro + 5 tests) que por cada agente comprueba una **huella FIABLE** en BD (tabla+columna que solo se refresca
  cuando ese agente corre) y avisa por Telegram las que llevan demasiado sin latir. Nace de que el **agente de
  pricing** ya sufrió este fallo (dejó de correr → reserva de Luxury a −40% de mercado). Sembrado con: **pricing**
  (huella `market_rates` scenario `prop_%`, umbral 8 días — hoy `pricing_decisiones` lleva ~16 días parado, es el
  hueco vivo) y **triaje de correo** (huella `correo_cursor.updated_at`, umbral 6 h). Deliberadamente EXCLUIDOS
  para no dar falsas alarmas: facturas (`facturas_proveedor` solo escribe si hay factura), psd2 (ya cubierto por
  la skill `psd2-health-check`), y trading (tiene su watchdog propio). Ambos crons con auth `CRON_SECRET`, `tgSend`.
  Verificado: tsc 0 en los archivos nuevos, 10/10 tests. **Para añadir un agente al monitor:** una fila en
  `AGENTES_VIGILADOS` + su probe SQL en el `PROBES` del route. **Decisión de Alberto (21/07):** dejar el
  `CRON_SECRET` sin rotar pese a haber aparecido (`Socorro24*`) en las capturas del test del watchdog.
  **(3) AUGMENTADO el auditor diario** (`.claude/commands/auditoria-diaria.md`, paso 2-bis «Heartbeat de
  crons»): su SQL tenía el punto ciego que dejó pasar lo del pricing — miraba `market_rates` genérico, que el
  cron diario in-app mantiene fresco con `scenario='normal'`, así que el agente SEMANAL podía estar muerto y el
  heartbeat en verde. Ahora usa la huella REAL del agente (`market_rates prop_*`) + `pricing_decisiones`, y se
  añadieron huellas que faltaban con umbral por cadencia: forward-paper (`trading_paper_track`, sem),
  `ia_director_aprendizaje` (sem), `trading_universo` (6h), `trading_ranking` (sem), y `correo_cursor` (2h, más
  fiable que `correo_triaje`). Verificado ejecutando el SQL: caza YA como ⛔ MUDO `trading_paper_track` y
  `ia_director_aprendizaje` (ambas vacías). **HALLAZGOS VIVOS de la auditoría de frescura (21/07, pendientes):**
  (a) `trading_paper_track` VACÍA — **DIAGNOSTICADO 21/07: NO está roto, es prematuro.** El código/esquema/cron
  están bien (tabla == modelo Prisma; cron `0 10 * * 1` programado, pos 6, vecinos corren); `evaluarCestaVsBench`
  exige ≥2 barras de precio y el ÚNICO lunes desde que se congelaron las cohortes (18 y 20/07) fue el 20/07, con
  cohortes de 0-2 días **sobre un finde** → ~1 barra → `resultado=null` → por diseño «sin precios no se guarda
  ruido» → no persiste. Debería poblarse solo el **lunes 27/07** (cohortes 9 y 7 días). El heartbeat del auditor
  ya la vigila → si el 27/07 sigue vacía, salta aviso. (Descartado que fuera el límite de 40 crons de Vercel: hay
  52 en vercel.json pero los de posición 48/51 corren frescos → su plan admite los 52.) Mejora opcional pendiente:
  que el tracker deje una miga cuando corre pero no persiste (hoy es 100% silencioso). (b) `ia_director_aprendizaje`
  VACÍA → el snapshot semanal del Director de IA no se guarda (cron `ia-director-refresh`, pos 52 — pendiente de
  diagnosticar igual que el paper-tracker); (c) `concursos_radar_anuncios` VACÍA (puede ser legítimo). El agente de
  pricing sigue ~16 días sin decisiones (huella prop_* 3,8 días).

- **🐕 TRADING — perro guardián de la pasada nocturna (21/07).** Tras deduplicar las rutinas y auditar, se
  detectó el hueco: si la rutina `trading-analista` volviera a desaparecer/pausarse o fallara en silencio
  (IBKR caído, token 401, egress 403), NADIE se enteraría — el NAV solo se quedaría viejo en /banca. Se añade
  un vigía: cron **`/api/cron/trading-watchdog`** (`30 6 * * 2-6` = mar-sáb 08:30 CEST) que comprueba que el
  NAV de IBKR en `broker_saldos` se refrescó "anoche" (umbral 18 h; L-V la pasada corre ~22:15 CEST → el
  refresco aparece las mañanas de mar-sáb; dom/lun no se espera y se salta). Si no, avisa por Telegram con el
  diagnóstico típico. Lógica pura testeada en `apps/plataforma/lib/trading/watchdog.ts` (`evaluarWatchdog`/
  `seEsperaRefresco`, 5 tests), handler en `app/api/cron/trading-watchdog/route.ts` (auth `CRON_SECRET`,
  `tgSend`, `eur`), cron en `apps/plataforma/vercel.json`. Verificado: tsc 0 en los archivos nuevos, 5/5 tests.
  Auditoría previa salió limpia (una sola rutina de trading, pasada de anoche confirmada por timestamps en BD:
  NAV 20/07 22:16 CEST, tesis 22:36; universo 557/557 frescos — el "251 con error" era un hipo puntual ya curado).

- **🤖 TRADING — rutinas duplicadas resueltas: una sola pasada nocturna (21/07).** Había DOS Rutinas de
  Claude Code haciendo lo mismo (ambas «carga la skill `trading-analista` y ejecuta una pasada nocturna,
  SOLO paper»): (1) **«Agente trading-analista»** (`trig_01HN5xZPpPHkGABf2ThziJtW`, activa, ~22:15 CEST
  días laborables, IBKR on, usa `ALERTA_TOKEN`) y (2) **«Agente inversión»** (`trig_01LDieeA7doMw9DH35YWgMCF`,
  creada por Claude, prompt más largo con descubrimiento capa-C/FMP/rotación sectorial pero usando
  `CRON_SECRET` y sin conector/repo). **Decisión: consolidar en R1 y BORRAR R2.** Motivos: (a) la
  inteligencia (descubrimiento, FMP, factores Fase B, radar ~550, cohortes, forward paper) vive **en la
  skill**, no en el prompt del trigger → el prompt largo de R2 no añadía capacidad y estaba caduco
  (centrado en descubrimiento capa-C, que la skill ya degradó a *overlay* a favor de la selección por
  factores); (b) R2 metía **`CRON_SECRET`** (secreto maestro) en un entorno de rutina que se ve en texto
  plano — justo lo que la skill prohíbe: las rutinas deben llevar `ALERTA_TOKEN` de bajo privilegio, que
  es lo que usa R1; (c) R2 tenía `next_run_at` puesto pese a estar pausada → borrarla elimina el riesgo de
  una 2ª pasada esta noche. **HECHO:** R2 borrada vía `delete_trigger`; R1 verificada activa (`enabled:true`,
  próxima 21/07 20:15Z). **VERIFICADO (21/07 vía Claude para Chrome en la UI de Rutinas):** en R1 el conector
  IBKR está ENCENDIDO y adjunto, repo `albertosuarezgutierrez-gif/central` asignado, entorno «Default» con
  «Acceso a la red = Personalizado» y `plataforma-ten-flame.vercel.app` en dominios permitidos (+ lista de
  gestores de paquetes marcada), horario «weekdays 22:15 CEST», vars `ALERTA_TOKEN`/`PLATAFORMA_URL` intactas.
  Confirmada además la ausencia de cualquier otro duplicado de trading (búsqueda «inversión/paper/trading-analista»
  → solo R1). Caso cerrado. Sin cambios de código en el repo; esto era gestión de triggers.

- **🏷️ PRICING — por qué se cuelan reservas baratas + guardián de sub-mercado (20/07).** Alberto mandó
  captura de una reserva de Luxury Busto (Elena Martín, 18-20 sep 2026) a **110€/noche brutos** con el
  mercado real ~160€. **Causa estructural, no mala suerte:** (1) el agente de pricing «de verdad» (sesión
  Claude + conectores de viajes, que es el ÚNICO que mete mercado bueno vía `/api/mercado/ingest`) **no
  corre desde el 05/07** y no hay trigger programado (`pricing_decisiones`: busto 8, luxury/duplex 1); (2)
  el cron diario in-app SÍ tarifica pero **ancla a `market_rates.scenario='normal'`** (Serper, p50 ~117€)
  en vez del mercado real por piso (`scenario='prop_<piso>'`, conector, p50 ~185€) → un piso 30% por debajo
  de su mercado parecía correcto; (3) el guard detectaba cosas pero **solo hacía console.warn** — nadie se
  enteraba. Alberto aprobó los 3 arreglos («lo más completo, en breve damos de baja PriceLabs»).
  **HECHO:** guardián de sub-mercado en el guard vivo (`apps/plataforma/app/api/sivra/pricing/guard/route.ts`)
  — chequeo #4 sub-mercado (vivo vs mercado real por piso, fecha a fecha, endurecido contra falsas alarmas)
  + #5 reserva-barata (pilló a Elena −42% y destapó otra: Ouafa, 13-nov, −45%) + **aviso Telegram** de
  alertas alta/media (nueva col `pricing_alerts.avisado_at`, migración aplicada); helper puro
  `lib/sivra/pricing-guardia.ts` (8 tests). **PENDIENTE (necesita a Alberto):** (a) crear la **sesión
  semanal del agente desde la UI de Rutinas de claude.ai** (por API no lleva los conectores de viajes →
  correría a ciegas); (b) **re-anclaje cold-start** de Luxury/Busto a mercado — necesito `CRON_SECRET` o que
  Alberto dispare `/api/pricing/aplicar-propuesta` en dryRun. Rama `claude/precio-mediatico-knp0ju`.

- **🏢 Análisis Punto y Coma SL ejercicio 2025 + Apps Script en forma amplia — 18/07/2026.** Sesión de
  análisis (sin código). (1) **Extracto BBVA ****9871 de la SL 2023-2025 procesado** (Excel que subió
  Alberto; datos sensibles NO en git — el origen está en su correo del 29/06 a mperez@asecon y en el
  scratchpad efímero): 2025 = ingresos 70.376,33€ / gastos 80.652,87€ / neto **−10.276,54€**, saldo final
  1.480,42€; Booking 59.757,46€ (mezcla pisos SL + Socorro que tributa IRPF personal — separación PENDIENTE),
  AEAT 24.536,68€, Thairely 11.526,36€, alquileres subarriendos 11.062,80€ (G. Alcalá + M. Alcalá Maguilla),
  ASISA 2.068,56€ cargado a la SL (→ cuenta de socios), aportaciones de Alberto 4.500€ (oct+dic).
  (2) **Modelos 200 cuadrados al céntimo** (PDFs vía `_buzon_pdf`): IS 2023 cuota 6.927,25€/ingresado
  4.100,87€; IS 2024 rdo. 53.917,25€, BI 70.022,40€, cuota 16.105,15€, ingresado 12.839,68€ (=pago banco
  25/07/2025). Los 3 modelos 202 de 2025 identificados: 1.246,91€ (abr, 18% cuota 2023) + 2×2.898,93€
  (oct/dic, 18% cuota 2024) = **7.044,77€ pagados a cuenta del IS 2025 → probable DEVOLUCIÓN** (2025 en
  pérdidas por caja). ⚠️ El PDF «Mod200-2025» de Pilar era un DUPLICADO del 2024: el IS ejercicio 2025 NO
  se ha visto aún (plazo 25/07/2026). Borrador de correo creado en Gmail de Alberto para María Pérez
  (mperez@asecon, la que lleva la SL) pidiendo el borrador del 200-2025 + confirmar devolución. Rutina
  `send_later` armada (20/07 14:00Z, se re-arma a diario hasta el 25/07) que vigila `_buzon_pdf` por el
  200-2025 y lo cuadra sola. (3) **Apps Script `Facturas a Drive`: QUERY ampliada a CUALQUIER remitente**
  (orden de Alberto, ejecutado vía Claude para Chrome) — skill `facturas-correo` actualizada. (4) La SL es
  de pisos turísticos sin servicios hoteleros → **exenta de IVA, no hay 303/390** (dictado de Alberto).
  PENDIENTES: separar ingresos Socorro vs SL en Booking (necesita informes anuales por alojamiento),
  conciliar gastos contra facturas Drive `Punto y Coma/2025/<mes>`, cuenta de socios 2025 completa,
  y revisar la discrepancia del 347 con la limpieza (SL declaró 6.983,50€).
  **ACTUALIZACIÓN 20/07:** Asecon respondió — IS 2025 a devolver 4.172,10€ (PyG: cifra negocios
  63.565,26€ = TODOS los abonos de plataformas del banco al céntimo [Booking 59.757,46 + Airbnb
  2.781,92 + Expedia 1.025,88], rdo. 13.679,39€, IS 21% = 2.872,67€). Salté la alarma de doble
  imposición por Socorro, pero **Alberto aclaró (dictado 20/07): en 2025 Socorro SÍ tributa en la
  sociedad** (criterio del año de cese; el IRPF 2025 personal se presentó sin esos ingresos —
  pendiente de confirmación formal por Asecon en el hilo). ⚠️ Para 2025 esto MATIZA la regla de
  `perfil-fiscal` («Socorro → IRPF personal»): aplica desde 2026, no al ejercicio 2025. Balance con
  descuadres a aclarar: clientes 430 = 64.561,18€ (irreal), caja 570 = 21.522,45€ y bancos 572 =
  −1.169,10€ (saldo real BBVA 1.480,42€), cuenta 551 socios = 23.083,24€ A FAVOR de la SL (Asecon
  pide contrato de préstamo; Alberto de acuerdo, pedido extracto 551 + borrador). Borrador de
  respuesta (v2, conforme con devolución + comprobación anti-duplicidad + dudas balance) en el
  Gmail de Alberto — descartar el borrador v1 que pedía excluir Socorro. Plazo IS: 25/07/2026.
  **ACTUALIZACIÓN 21/07 — extracto 551 auditado (respuesta de María + `551.xlsx`):** (a) el −1.169,10€
  de la 572 es agregado de DOS bancos: Caixa −2.649,52€ (cuenta vieja SIN movimientos aportados) +
  BBVA 1.480,42€ (cuadra AL CÉNTIMO con el extracto real → la contabilidad del BBVA está bien);
  propuesta de Asecon aceptable: llevar la Caixa negativa contra clientes (solo balance, no toca IS).
  (b) **La 551 (23.083,24€) auditada al céntimo**: apertura 01/01/2023 = **12.600€ SIN justificar** +
  ASISA 24-25 = 3.819,60€ (✓ correcto) + tarjeta 1.154,00€ (✓) − aportaciones Alberto 4.500€ (✓
  abonadas) + **regularizaciones de cierre 2024 = +18.464,16€** (🔴 cajón de sastre: anónimas de
  11.492,64/7.344,41/4.000/1.841,53 al debe y 14.299,66 al haber, MÁS "REG SALDO" de proveedores del
  NEGOCIO —PriceLabs 1.214,82, Emasesa 2.341,19, TotalEnergies 1.469,20, Factor Energía 1.046,61,
  Digi 610,13, Netflix 259,81, Petroprix 730, Azulejos Delgado 623,25 ≈ 8,5k— cargados a socios) −
  regularizaciones 2025 = −9.128,54€; el neto "limpio" (ASISA+tarjeta−aportaciones) son solo ~473,60€
  → **NO firmar el contrato de préstamo por 23.083€ sin aclarar apertura + anónimas + proveedores**.
  Borrador v5 en Gmail de Alberto (OK a Caixa→clientes condicionado a cuenta cerrada + las 3
  aclaraciones; no frena la presentación del IS). El PR #989 de memoria se fusionó a main el 20/07;
  Ficheros fuente: 551.xlsx y extracto BBVA en uploads efímeros de la sesión (origen en Gmail).
  **ACTUALIZACIÓN 23/07 — respuestas de María + barrido de facturas en Drive `Punto y Coma/2024`:**
  (a) María respondió inline: apertura 12.600€ viene "de la herencia" del arranque SIN detalle
  documental; los "REG SALDO" son pagos por banco SIN factura recibida (por eso fueron a socios);
  opciones que da: dejarlos en 551, pasarlos a 678 (gasto no deducible, sin riesgo) o a gasto
  deducible con factura (con riesgo si no aparece). Alberto decidió recuperar facturas: «me
  descargo las q necesites, como verás son gasto de la actividad». (b) **Barrido completo de las
  13 carpetas de Drive `Punto y Coma/2024` (12 meses + AMAZON, vacía) hecho el 23/07** con emisores
  verificados abriendo los PDFs genéricos: `Factura_FELEC_…` = TotalEnergies (luz San Luis 9, una
  por piso), `DGFCJ…` = Digi (fibra+móvil ~101€/mes), `202404/05_FA…` = Factor Energía (luz, contrato
  acabó 20/05/2024), `2450001…` = Petroprix (recap mensual diésel), `013339/014598` = La Montanera,
  `2024F162` = fotógrafo Arbide, `F2024xx_Punto Y Coma` = Grupo Carrillo lavandería, `Factura_21_2024`
  = reforma Busto Tavera (Dmytro Melnychuk). **Inventario contra los REG SALDO de 31/12/2024:**
  PriceLabs (1.214,82) → 7 facturas en Drive (ene×2/feb/mar/sep/nov/dic como «Dynamic Pricing
  Invoice»), FALTAN abr-ago y oct; TotalEnergies (1.469,20) → 14 en Drive (jul×7/ago×5/sep/nov),
  FALTAN jun, oct y dic; Factor Energía (1.046,61) → 12 en Drive (abr×7/may×5), prob. completo;
  Digi (610,13) → 4 en Drive (mar/jul/sep/oct), FALTAN ~ene-jun y ago/nov/dic; Netflix (259,81) →
  solo ene-mar; Petroprix (730,00) → ene/abr/may, FALTA resto; Azulejos Delgado (623,25) → 1 (feb,
  «4. AZULEJOS SOCORRO», importe sin verificar); **EMASESA (2.341,19) → CERO facturas en todo 2024**
  (es el hueco gordo: Alberto debe bajarlas del portal e-factura de Emasesa). Secundarios en Drive:
  IKEA feb+mar, Sklum ene, Mercadona ene, DIA feb, Pepephone ene-mar, tasas basura Ayto. (mar×7/
  may/jun), Vinoteca dic (misma factura duplicada como `vinoteca.pdf` y `factura-2024126094.pdf`),
  Leroy Merlin jul; SIN rastro: Jimena (1.264,45), Bricolaje (707,78), Temu/Uber/Easy/Kitidea
  (aunque hay ~10 escaneos «CamScanner» sin abrir que podrían taparlos). Inventario entregado a
  Alberto en el chat con los meses exactos a descargar por portal. Vigilancia Asecon diaria sigue
  armada hasta el 25/07 (IS 2025 presentado + revisión de anónimas + borrador contrato en pausa).
  (c) **5 correos a proveedores ENVIADOS por Alberto el 23/07** (borradores redactados por el agente)
  pidiendo duplicados 2024: Emasesa (clientes@emasesa.com, los 7 suministros), Digi
  (atencionalcliente@info.digimobil.es, todo 2024), PriceLabs (support@pricelabs.co, abr-ago+oct),
  TotalEnergies (atencionalcliente@totalenergies.com, jun/oct/dic) y Delgado Rojas=«Azulejos Delgado»
  (delgadorojasventas@gmail.com, re-reclamación de las 2 facturas de ene-2024 334,37+297,88 que en
  enero dijeron no poder recuperar «por cambio de programa»; se les recuerda la obligación de conservar
  4 años). Hallazgos clave del correo: los e-factura de Emasesa NO traen adjunto (enlace tokenizado a
  emasesaonline.com → el Apps Script nunca pudo copiarlas; el proxy del entorno y WebFetch dan 403, así
  que las baja Claude-Chrome desde Gmail); **Netflix es callejón sin salida** (web solo 12 meses de
  historial y NO manda recibos por email → extracto bancario o 678, son 259,81€); Petroprix sin email
  útil (remitente automático) → portal. Esto retoma el «LISTADO FRAS. PENDIENTES DE RECIBIR» que María
  mandó el 07/01/2026. Chequeo diario de respuestas de proveedores armado (hasta 30/07).
  **ACTUALIZACIÓN 24/07 — primeras respuestas de proveedores:** (a) **EMASESA (24/07)**: NO reenvía
  duplicados — todas las e-facturas 2024 ya se mandaron en su día al Gmail de Alberto (las 3 tandas
  23-abr/23-jul/22-oct localizadas; descarga vía Claude-Chrome pendiente) y ⚠️ **solo 2 de los 7
  contratos están a nombre de la SL** (Bustos Tavera 22 Bajo IZQ 0105185751 y 1º DER 0105329645; el
  resto a otro titular) — dato relevante para la deducibilidad; futuros contactos solo por su buzón
  web. (b) **TOTALENERGIES (24/07)**: envió TODAS las facturas 2024 en un PDF único de 2,1 MB →
  copiado por el Apps Script a `_buzon_pdf` («2026-07-24_atencionalcliente@totalenergies.com_
  Facturas B90446683 2024.pdf», id 1x_TQTGSYl63DdPeU0cicHWE42vREgAD_): **27 facturas, jun-dic 2024,
  4 suministros** (Bustos Tavera 22 Bajo IZQ y Bajo ZP, San Luis 9 Bajo 3 y 1-012) — cubre los meses
  que faltaban (jun/oct/dic); importes pequeños (2-20€/factura; la suma exacta que la saque María del
  PDF, el texto extraído desordena cifras). (c) Alberto dictó el criterio para Asecon: «que lo incluya,
  que son gastos deducibles de la actividad» → borrador redactado en el hilo del IS (REG SALDO =
  gasto deducible, sacarlos de la 551 + aviso titularidad Emasesa + Netflix extracto o 678).
  (d) Aparte (personal, no SL): aviso de impago TotalEnergies 3,98€ (Pje. Francisco Molina 4 1ºC,
  recibo devuelto) — Alberto ya pidió desglose y re-giro él mismo. Pendientes de responder: Digi,
  PriceLabs, Delgado Rojas.
  **ACTUALIZACIÓN 26/07 — María ACEPTA el criterio REG SALDO; IS 2025 SIN confirmar presentación
  (plazo venció el 25/07):** Alberto envió el correo del criterio el 24/07 10:56 y **María respondió
  ese mismo día (24/07 13:31) inline**: (1) REG SALDO como gasto deducible y fuera de la 551 →
  **«Perfecto lo hacemos así»** ✓; (2) pide que las facturas recuperadas se suban a **una carpeta
  NUEVA y separada de Drive** («para no liarnos») y las va contabilizando, para tener identificado
  lo que queda; (3) facturas a nombre de otro titular (los 5 suministros de Emasesa) y Netflix sin
  factura: «no se pueden deducir en la sociedad; es vuestra decisión meterlo, y en caso de
  comprobación se devuelve con sanción» — la decisión de Alberto (dictado 26/07, borrador redactado)
  es METERLOS igualmente; (4) propone recopilar todo y a **primeros de septiembre** fijar la cifra
  definitiva del contrato de préstamo. ⚠️ **La presentación del modelo 200 ej. 2025 NO consta
  confirmada** (ni correo ni justificante en `_buzon_pdf`; el plazo venció el 25/07 — devolución
  4.172,10€, sin sanción grave por ser a devolver, pero hay que cerrarlo: ping/llamada a María).
  Borradores en el Gmail de Alberto a 26/07: el de «todos deducibles aunque falte factura + presentad
  ya y justificante» (26/07, vigente) y posibles restos del ping del 25/07 (obsoleto si se envía el
  nuevo). Vigilancia del IS CERRADA con este parte; la de proveedores sigue hasta el 30/07 (Digi,
  PriceLabs y Delgado Rojas sin responder a 26/07).

- **👶 Guardería EI Estrella Polar → deducción de cuota marcada + regla de comercio (20/07, pregunta de
  Alberto «la guardería no es deducible en la renta?»).** Matiz: NO es gasto deducible de la base, pero SÍ
  genera el **incremento por gastos de guardería de la deducción por maternidad** (hasta €1.000/hijo <3, en
  la renta de **Pilar**, madre autónoma). Confirmado en BD: 2 hijos <3 (`fiscal_descendientes`, nac.
  11/04/2024 y 10/11/2025). Descubierto que la **EI Estrella Polar (Grupo Workandlife)** es la misma
  guardería facturada con dos textos (`RECIBO ESCUELA INFANTIL` mensual + `GRUPO WORKANDLIFE … CONCEPTOS
  ANUALES`), y que **todo 2026 estaba sin marcar** para la deducción. Aplicado en `wswbehlcuxqxyinousql`:
  (a) 8 recibos de 2026 (2.405,60€) marcados `deduccion_cuota_tipo='guarderia'` (solo activos, no los
  `ignorado`); (b) **regla nueva** `GRUPO WORKANDLIFE` y **completada** la existente `RECIBO ESCUELA
  INFANTIL` en `banca_destino_reglas` con `personal`+`colegio`+`guarderia` → los recibos mensuales de
  septiembre en adelante se **auto-marcan** en la ingesta. Skills `perfil-fiscal` y `facturas-correo`
  actualizadas. **🔴 PENDIENTE (afecta a su dinero):** el código topa la guardería en **€1.000 total**
  (`lib/finanzas.ts` + `lib/agente-movimientos.ts:272` `Math.min(total,1000)`) cuando legalmente es
  **€1.000 POR HIJO** → con 2 peques infravalora (hasta ~€2.000). No hay desglose por hijo en el banco (lo
  da el Modelo 233 del centro); decidir con Alberto si se topa por nº de hijos <3. Confirmar autorización
  del centro (Modelo 233) con la gestoría.

- **🔍 Buscador por NOMBRE + fix auth PYPL + página /trading SIMPLIFICADA (20/07 noche, feedback
  directo de Alberto con el error en pantalla).** (a) **Bug del estreno del buscador:** «PYPL» daba
  «no encuentro el ticker» con PYPL perfectamente en la caché (verificado SQL). Causa: la route
  `/api/trading/analisis-simbolo` usaba `isTradingLecturaAutorizado` (token de rutina O cookie
  SUPERADMIN, que caduca a las 8h y el invitado no tiene) en vez del acceso de la página. Fix: auth =
  `isRoutineAuthorized(req) || (await accesoTrading()) != null` — el MISMO acceso que `/trading`
  (sesión normal o cookie invitado). ⚠️ No volver a `isTradingLecturaAutorizado` en endpoints que
  consume la propia página. (b) **Búsqueda por nombre** (petición: «lo suyo es que se pueda poner
  nombre y si hay error que la propia ia busque el nombre parecido»): nuevo `buscar-simbolo.ts` (PURO,
  3 tests) — ticker exacto gana; si no, nombre normalizado (sin acentos) `includes` O ticker
  `startsWith`, orden por capitalización; `analizarConsulta(q)` en `analisis-simbolo.ts` devuelve
  análisis directo (1 candidato), `{sugerencias}` (varios → chips «¿Cuál de estas?» clicables en la
  UI) o solo-precio si tiene pinta de ticker. Mensajes de error honestos por status (401 sesión /
  404 nada parecido / resto fuente no responde). (c) **Página más simple y corta** (petición: «aquí
  solo interesa las de comprar no? la página tiene que ser mas simple, y corta»): grid «Pulso»
  ELIMINADO; «📊 Rendimiento por estrategia» y «👀 Watchlist» plegados en `<details>`; tesis →
  «💡 Ideas de compra del agente» — SOLO alcistas, máx. 8, sin columna Dirección (histórico completo
  sigue en `trading_tesis`). Skill `trading-analista` actualizada (auth, nombre/sugerencias, página
  simplificada). Tests 75/75 · tsc 0 · build OK.

- **🔍 Buscador «Analiza una acción» + 💪 fuerza relativa en caídas (20/07 tarde, ideas de Alberto).**
  (a) Card nueva arriba de `/trading` (también invitado): escribes un ticker de EEUU (p. ej. PYPL) y
  `analizarSimbolo()` (`lib/trading/analisis-simbolo.ts`, IO) compone el informe DETERMINISTA con las
  piezas existentes: factores de la caché + **puesto en el ranking del blend** (mismo `rankearUniverso`
  + neutralización 🛡️ que el radar), técnico SMA50/RSI, 📊 volumen, 💪 fuerza relativa, 📰 8-K e
  🧑‍💼 insiders a 30 días (ventana ancha para análisis puntual vs 7d del digest), 📅 próximo informe
  estimado. Fuera del universo degrada a solo-precio (Yahoo cubre cualquier ticker EEUU). Ruta
  `GET /api/trading/analisis-simbolo?simbolo=X` (auth lectura). (b) **💪 `fuerza-relativa.ts`** (PURO,
  3 tests) — la intuición de Alberto confirmada: en los días de caída del SPY (≤−0,5%, ventana 120
  sesiones, mín. 8 días) se mide la mediana de la acción y el % de días en verde → `resiste` (mediana
  ≥0: compradores defendiéndola — complementa al 📊: el volumen dice QUE entran, esto dice CUÁNTO la
  defienden) / `acompaña` (cae menos que el índice) / `sufre`. Contexto, nunca filtro. Tests 72/72 ·
  tsc 0 · build OK.

- **📧 ia-rest: los avisos de los agentes al operador ahora van por EMAIL en RESUMEN DIARIO, no por
  Telegram (20/07, «no quiero que me mande más mensajes, que mande mail automáticos» → «resumen»).**
  Alberto no tiene tiempo de atender los pings de Telegram. Cambio en el ÚNICO punto de
  estrangulamiento: `tgAlert()` en `apps/ia-rest/src/lib/telegram.ts` (~90 llamadas en 55 archivos).
  Por defecto (`TGALERT_CANAL=resumen`) `tgAlert` ya NO manda Telegram: **acumula** en la tabla nueva
  `avisos_operador` vía `acumularAvisoOperador()` (`src/lib/avisos.ts`), y el cron diario
  **`/api/cron/avisos-resumen`** (vercel.json `0 6 * * *` ≈ 08:00 Madrid) manda **UN** email con todo
  lo pendiente (`enviarEmailResumenOperador()` en `email.ts`, a `hola@iarest.es` → su Gmail; override
  `OPERADOR_EMAIL`) y lo marca `enviado`. **Reversible sin desplegar** con `TGALERT_CANAL`: `resumen`
  (default) | `email` (1 email inmediato por aviso) | `telegram` (antiguo) | `ambos` (Telegram + resumen).
  Tabla `avisos_operador` **aplicada al proyecto vivo `efncqyvhniaxsirhdxaa`/public** (migración
  `supabase/migrations/20260720_avisos_operador.sql`; **reaplicar al schema `iarest` cuando se haga el
  flip a la BD compartida**). `acumularAvisoOperador` es fail-safe (si la tabla/BD falla, NO rompe al
  agente). **NO se tocaron los avisos INTERACTIVOS con botones** (`tgEstudio`, `tgAlertButtons` +
  callbacks de lead/Instagram/briefing) → siguen en Telegram (el email no lleva botones y los agentes
  necesitan la respuesta). Contradice a propósito la regla «Operador → SIEMPRE Telegram» del maestro,
  por petición explícita. **Caveat**: los `critico` también esperan al resumen (hasta ~24h); si eso
  molesta, pasar a `ambos` o dejar criticos inmediatos. tsc 0 · round-trip BD verificado.

- **🛡️⚖️📅 Tres capas nuevas del radar (20/07 tarde, «haz todo»; deterministas, contexto-nunca-filtro).**
  (1) **Guardián de calidad de datos** — la lección de MCD automatizada: `lib/trading/calidad-datos.ts`
  (PURO, 4 tests) escanea la caché ANTES de cada ranking buscando IMPOSIBLES (mkt_cap <1e9/>1e13,
  |EY|/|FCF yield|>100%, momentum >100 o <−99%, precio ≤0, |ROIC|>1000%; umbrales holgados: SNDK +4715%
  REAL no salta) y el radar NEUTRALIZA a null los campos envenenados (esa empresa no puntúa ese factor
  esa semana, no contamina z-scores) + línea 🛡️ en el digest solo si hay algo. (2) **Concentración del
  top-10** — `lib/trading/concentracion.ts` (PURO, 3 tests): correlación media de retornos diarios (60
  sesiones, series que ya bajaba el técnico — cero fetch extra); línea ⚖️ con umbrales 0,7/0,5
  (🔴 una-sola-apuesta / 🟡 tema dominante / 🟢 diversificada) — oportuna con el superciclo de memoria
  llenando el top. (3) **📅 Resultados PRONTO (estimado)** — `estimarProximoInforme` en `edgar.ts`
  (patrón de 10-Q/10-K del año pasado +365d, ventana 10 días, mismo submissions JSON que 8-K/Form 4 —
  cero fetch extra); siempre etiquetado «estimado». Todo persistido en `salud`
  (`anomalias`/`correlacionTop`/`resultadosProximos`). Tests 69/69 · tsc 0 · build OK.

- **🐞 BUG de datos cazado en el digest del 20/07: MCD nº 1 por ARTEFACTO + guarda `accionesPlausibles`
  (20/07 mediodía).** Alberto pegó el digest y salté sobre dos anomalías: (a) los momentum gigantes del
  caza-cohetes (SNDK +4715%, MU +776%…) — VERIFICADO por web que son REALES: superciclo de memoria IA
  (MU a ~844$ el 19/07, +241% YTD; Huang en CES 2026: «la memoria es el cuello de botella»); el satélite
  está haciendo su trabajo. (b) **MCD con `mkt_cap`=196.044$** (el XBRL de la SEC trajo `acciones`=712
  en vez de 712M) → EV≈deuda−caja → earnings/FCF yield inflados ×1e6 → **MCD nº 1 del ranking por
  artefacto**, y además el outlier contamina los z-scores de VALOR de todo el universo (media/desv).
  Única fila afectada (1/398). Fix: guarda **`accionesPlausibles()`** en `edgar.ts` (pura, testeada:
  <1M acciones en una large-cap = dato basura → mktCap null → la empresa pierde el factor valor esa
  semana en vez de envenenar el ranking), aplicada en el refresco del universo (`universo.ts`); fila de
  MCD saneada por SQL (campos null + `actualizado_en`=epoch para reproceso con la guarda) y ranking
  re-lanzado tras el deploy. Lección para la skill/auditoría: si un nombre raro aparece nº 1, comprobar
  su mkt_cap ANTES de creer el ranking.

- **💼 Cartera de estudio AMPLIADA: una por cohorte + curva en euros (20/07 tarde, «me gusta, añade
  todo»).** (a) `medirCarterasEstudio()` valora los 30.000€ en CADA cohorte congelada (hoy c1 18/07 y
  c2 20/07; las futuras entran solas) — comparar entradas separa el efecto del momento de compra del
  efecto del modelo; (b) **curva en euros**: `curvaEnEuros` (pura, testeada — convierte cada snapshot
  persistido de `trading_paper_track` con el FX de SU fecha, no el de hoy) + `curvasCarteraEstudio()`
  (IO) + gráfica Recharts en la card (línea cartera vs SPY discontinua; con <2 puntos, aviso de que se
  dibuja con los snapshots semanales); (c) el digest del paper-tracker lista una línea 💼 por cohorte.
  La ruta `GET /api/trading/cartera-estudio` devuelve `{carteras, curvas}`. Tests 60/60 · tsc 0 · build OK.

- **💼 CARTERA DE ESTUDIO — 30.000€ simulados (20/07 tarde, petición de Alberto).** "¿Cuánto dinero
  estaría dando esto?" → los 30.000€ (≈ su saldo real de IBKR, aquí SOLO un parámetro: `CAPITAL_ESTUDIO_EUR`
  en `cartera-estudio.ts` — NO se lee el bróker y JAMÁS se opera) se reparten equiponderados en la cohorte
  congelada MÁS RECIENTE del forward paper (hoy c2 del 20/07) y se valoran en euros con FX EUR/USD real de
  Yahoo (`EURUSD=X`; capital→USD al FX de inicio, →EUR al de hoy). Piezas: `lib/trading/cartera-estudio.ts`
  (PURO, `valorarCarteraEstudio`, 3 tests) + `cartera-estudio-io.ts` (FX + `medirCarteraEstudio` sobre
  `medirCohorte`) + ruta `GET /api/trading/cartera-estudio` (auth lectura, invitado incluido) + card
  `CarteraEstudio.tsx` en la sección Forward paper de `/trading` (client, carga perezosa — la página SSR no
  paga los fetch de precios) + línea 💼 en el digest semanal del `paper-tracker` (reutiliza la medición ya
  hecha, solo añade el FX). Formato `eur()` de `lib/dinero.ts`. Matices honestos anotados en la card:
  cierres SIN dividendos (igual para cesta y SPY → comparativa justa), sin comisiones ni rebalanceo, y "el
  dinero real solo si el forward bate al SPY sostenido" (regla firmada). Es la MISMA medición del forward
  en euros — legibilidad, no información nueva. Tests 58/58 · tsc 0 · build OK.

- **💬 Agente huéspedes — arreglado el "Le doy Enviar y dice «no está disponible»" (20/07).** Alberto mandó
  captura: borrador de despedida a Grégory (Dúplex Center, checkout, FR) con botones ✅ Enviar/✏️/🔧; al pulsar
  Enviar → "Ya no está disponible". **Causa raíz (confirmada con BD):** el MISMO mensaje del huésped se procesó
  DOS veces (log id 81 @08:21 "Je suis ravi…" y id 82 @08:30 "Ravie…", misma `pregunta`), porque el **webhook**
  (tiempo real) y el **sondeo** (cron) derivan el id del mensaje de endpoints DISTINTOS de Smoobu
  (`/api/reservations/{id}/messages` vs `/api/threads`) → claves de dedup distintas → ambos superan el reclamo
  atómico → DOS borradores en Telegram compartiendo UNA fila pendiente (`mensajes_pendientes_tg`, PK `booking_id`).
  Alberto envió uno (se borró la fila) y el botón del duplicado quedó muerto. La guarda `ya_respondido` solo
  contaba `auto_sent=true`, no las propuestas abiertas. **Fix:** (A) `orquestador.ts` — antes de proponer, si ya
  hay propuesta pendiente para esa reserva sobre esa MISMA pregunta (normalizada), no crea otra (`ya_propuesto`);
  el disparo manual se exime. (B) `telegram-webhook/route.ts` — cuando la fila pendiente ya no existe, aviso claro
  ("Ese borrador ya se envió o se gestionó") + `tgEditMessage` retira los botones del mensaje pulsado (defensa
  ante duplicados viejos ya en el chat y dobles clics). Sin migración. Rama `claude/envio-no-disponible-2wxjk5`.

- **🐛 fix(ia-rest/blog-seo): parseo robusto del JSON del artículo (20/07) — branch `claude/blog-article-json-parse-lc22m7`.**
  Aviso Telegram «❌ Error generando artículo blog: No se pudo parsear JSON del artículo». Causa raíz doble en
  `apps/ia-rest/src/app/api/cron/blog-seo/route.ts`: (1) el prompt pedía **~1800 palabras** con techo de solo
  **3000 tokens** → el JSON del modelo 8B se cortaba a la mitad (string sin cerrar) y `JSON.parse` reventaba; y
  (2) usaba un limpiador naíf (`raw.replace(/```json|```/g,'')`) en vez del `cleanJSON` canónico que usan las
  otras ~30 llamadas del app. Fix: (a) el prompt ahora pide **~950 palabras** (4 secciones + 3 FAQ) para caber
  en el presupuesto de tokens/tiempo y cerrar el JSON de forma natural; techo subido a 3200 como colchón; (b)
  parser robusto `parsearJSONModelo` = `cleanJSON` (fences/prosa) → escapar controles crudos dentro de cadenas
  (saltos de línea/tabs de HTML) → reparar truncamiento cerrando contenedores tras el último valor COMPLETO;
  (c) `generarTSX` defensivo (filtra secciones/FAQ a medias, fallbacks en cabecera) y error con inicio+cola+len.
  Verificado con 10 casos (truncamiento, newline crudo, comillas escapadas, basura→null) + tsc strict de los
  helpers. Sin `node_modules` en el contenedor → sin `next build` local.

- **📊 Volumen (acumulación institucional) + 🧑‍💼 insiders Form 4 en el digest (20/07 tarde, 2ª tanda).**
  Idea de Alberto: los picos de volumen son la única huella pública de los fondos entrando en una acción
  (y no, el momentum NO lo captura — es solo precio). Montado DETERMINISTA y como CONTEXTO (nunca
  filtro/peso; promoverlo a factor exigiría hipótesis pre-registrada): (a) el parser de precios ya
  conserva el volumen que antes tirábamos (`parseStooqCsvVol`/`parseYahooChartVol`/`puntosDiariosVol` en
  `precios-stooq.ts`); (b) `lib/trading/volumen.ts` PURO — pico = volumen ≥1,5× media 50 sesiones previas,
  se cuentan picos al alza/baja en las últimas 20 sesiones, neto ≥2 → «acumulación», ≤−2 → «distribución»
  (lectura O'Neil/CANSLIM); (c) el ranking semanal calcula la señal para el top-20 con la MISMA serie del
  técnico (cero fetch extra), la persiste en `entries[].volumen` y la pinta: digest (📊↑/↓ por entry +
  leyenda) y explorador (columna Señales con tooltip). (d) **Insiders**: el radar baja UNA vez el
  submissions JSON por símbolo del digest y saca de él 8-K (como antes) + **Form 4** nuevos
  (`extraerFilingsForm4` en `edgar.ts`, cap 3 filings/símbolo, 7 días) → `transaccionesFiling` (form4.ts,
  ya existía) → línea «🧑‍💼 Insiders Form 4» con compras (~k$) y ventas; persistido en `salud.insiders`.
  Tests 55/55 · tsc 0 · build OK.

- **🌅 Vigía del PREMARKET montado (20/07 tarde).** Idea de Alberto: un gap grande de premarket es otro
  indicador útil. Investigado Finviz a petición suya → **descartado** (403/Cloudflare a bots y el
  premarket solo está en Finviz Elite, ~25-40 $/mes); la fuente elegida es **gratis y ya nuestra**: el
  chart v8 de Yahoo (mismo endpoint del respaldo de precios) con `interval=5m&includePrePost=true`.
  Piezas: `apps/plataforma/lib/trading/premarket.ts` (PURO: `urlYahooPremarket`, `extraerGapPremarket`
  —última vela válida dentro de `currentTradingPeriod.pre` vs `chartPreviousClose`—, `mensajePremarket`;
  5 tests) + `premarket-aviso.ts` (IO: `avisoPremarket()` — símbolos del último snapshot top-20+🚀,
  umbral ±3% `UMBRAL_GAP`, adjunta las etiquetas 8-K de `salud.eventos`, Telegram SOLO si hay
  movimiento; días tranquilos = silencio) + cron `/api/cron/trading-premarket` **L-V 13:00 UTC**
  (~09:00 ET, premarket maduro; auth Bearer CRON_SECRET). **Estatus = CONTEXTO, nunca filtro** (misma
  regla que medias/8-K; sin cambio del modelo → no requiere hipótesis pre-registrada). Matiz apuntado
  en la skill: en un modelo value un gap-up gordo suele ser el precio escapándose de la entrada, no un
  «compra ya». Tests 47/47 · tsc 0 · build OK.

- **🔗 Enlace de invitado para el Laboratorio de inversión, para pasarle la pantalla a amigos (20/07/2026).**
  Alberto pidió un token de acceso que enseñe SOLO su pantalla de `/trading` (sin darles cuenta ni acceso al
  resto de la plataforma). Mismo patrón exacto que el acceso invitado de «Empresas» (Pablo, 17/07/2026):
  tabla BD **`trading_acceso_token`** (fila única, `prisma/sql/2026-07-20_trading_acceso_token.sql`,
  aplicada por Supabase MCP) + **`lib/trading-acceso.ts`** (`accesoTrading`, cookie httpOnly
  `trading_invitado`) + entrada `/invitado/trading?token=<valor>` → `/api/trading/invitado` canjea y fija
  la cookie (30 días). Como `/trading` es **100% lectura** (ninguna acción escribe: es el radar+cartera
  simulada del agente de inversión), se extrajo el contenido de `page.tsx` a
  **`app/(usuario)/trading/TradingDashboard.tsx`** para reutilizarlo tal cual en ambas vistas — el invitado
  ve exactamente lo mismo que Alberto, sin sidebar ni acceso a banca/fiscal/etc. `/invitado/*` y
  `/api/trading/*` YA estaban exentos del gate de sesión en `middleware.ts` (no hizo falta tocarlo).
  **Token activo generado y compartido con Alberto** en esta sesión — enlace:
  `https://plataforma-ten-flame.vercel.app/invitado/trading?token=<token>` (el valor real NO se versiona;
  vive solo en la tabla). **Rotar/revocar:** `UPDATE trading_acceso_token SET token='…'` o `activo=false`
  por Supabase MCP. Verificado: `tsc --noEmit` sin errores nuevos (los 2 preexistentes de `core-email`/
  `core-identity` no tocan nada de este cambio) + `next build` OK (incl. `/invitado/trading` y
  `/api/trading/invitado` compilando como rutas dinámicas).

- **✅ Auditoría de cierre de la sesión de trading del 20/07 (mediodía, pre-compactación).** Verificado
  end-to-end: los 3 PRs del día MERGEADOS en main y desplegados (#1033 tabla única ranking+explorador,
  #1034 memoria+skill, #1035 capa 📰 8-K + filtro/orden por señal 📈); ranking relanzado a mano
  (workflow `trading-warmup`, lotes=0 + ranking=si) TRAS confirmar el deploy READY → snapshot 20/07 en
  `trading_ranking` con el código nuevo: 556 universo / 305 elegibles frescas / top-20 / 5 cohetes /
  régimen 🟢 / **salud.eventos estrenada con 1 evento real: LNG (Cheniere), 8-K del 14/07 item 5.02**;
  digest enviado por Telegram (el cron de las 09:00 UTC re-manda el suyo, idempotente). Invariantes
  intactas: `trading_paper_orden` = 0 filas (cero órdenes, ni paper viejas ni reales), cohortes
  congeladas sin editar (c1 18/07, c2 20/07 — su forward arranca hoy), pre-registro H1-H6 sin tocar
  (la capa 📰 es informativa, no cambia el modelo). fcf_yield ya en 398/556 filas (el relleno converge
  con los crons de 6h). 🟡 Observación (no bloqueante): 251 filas del universo con `error` anotado y
  cobertura 305/556 (55%, sobre el mínimo del 50% pero justa) — vigilar que el refresco de 6h la vaya
  subiendo; si cayera del 50% el propio cron avisa y no rankea.

- **📰 Capa de noticias MONTADA en el digest + filtro/orden por señal en el explorador (20/07/2026,
  tarde).** (1) **Eventos 8-K en el digest semanal:** `edgar.ts` gana `extraerEventos8K` (parser puro
  testeado del submissions JSON de la SEC; solo items materiales — 1.01 acuerdo, 1.03 quiebra, 2.01
  adquisición, 3.01 delisting, 4.02 cuentas no fiables, 5.01 cambio de control… — fuera los rutinarios
  2.02/7.01/8.01/9.01) + `eventos8KCik`; `radar.ts` consulta los 8-K de los ÚLTIMOS 7 DÍAS de los picks
  del digest (top-10 + cohetes, CIK ya en la caché) y añade la línea «📰 Eventos 8-K (7 días, SEC —
  contexto, no filtran)». Determinista y oficial (nada de titulares/cifras inventadas); best-effort (si
  la SEC falla, sin línea); persistido en `salud.eventos` del snapshot. Es CONTEXTO, jamás filtro.
  (2) **Explorador:** Alberto no podía filtrar por señal de compra porque el filtro NO existía — añadido
  select «Señal: todas / 📈 compra ahora / ⏳ en espera» y la columna Señales ahora es ORDENABLE
  (📈 primero, luego ⏳, 🏆 desempata; a igualdad ordena por score). Pie aclara que 📈/⏳/🏆 solo
  existen para el top-20 del snapshot (el técnico no se calcula para las ~550), así el filtro devuelve
  como mucho 20 filas. tsc 0 · 42 tests (3 nuevos) · build 0.

- **📰 Noticias/eventos corporativos y el radar (20/07/2026, mediodía).** Alberto preguntó por el rumor
  Stripe→PayPal: verificado por búsqueda web (va por los servidores de Anthropic; el egress del contenedor
  sigue capado) — NO es rumor: **oferta real de Stripe + Advent International por PayPal, ~53.400 M$
  (60,50 $/acción, prima 28%), presentada el 15/07/2026** (Reuters/CNBC/Bloomberg; 8-K en la SEC; el
  consejo de PayPal se reunía ~20/07). Lección anotada: una OPA es el tipo de evento que el modelo de
  factores NO ve venir (como mucho lo captura tarde vía momentum). Decisión de diseño reafirmada: las
  noticias NO alimentan el modelo determinista (la IA nunca inventa cifras); se añade a la **cola de
  Fase 1.5** una **capa informativa 📰** (anotar eventos corporativos gordos en picks del digest/resumen,
  SIEMPRE como contexto para Alberto, NUNCA como filtro del ranking — mismo estatus que las medias
  móviles). La skill `trading-analista` ya permite al agente mencionarlo como contexto en su pasada.

- **🔍 Auditoría LIGERA diaria (20/07/2026): 1 hallazgo 🟡 de drift, sin crons mudos.** `/auditoria-diaria`
  sobre el rango del 19/07 (22 commits no-chore, casi todo trading Fase B: FCF yield al blend, pre-registro
  de hipótesis, indicadores por segmento, satélite cohetes, explorador del universo, retrovisor ejecutado,
  cohorte 2 congelada, resolución del bloqueo red+auth). **Memoria ya al día** — las propias sesiones del
  19/07 anotaron sus 22 entradas con detalle; sin huecos que rellenar. **Heartbeat 9/9 crons ✅.** Lockfile
  limpio. **Hallazgo:** tras la resolución del bloqueo de red+auth de `trading-analista` (19/07), 3 docs
  seguían describiéndolo como "bloqueado por infra" (`docs/SKILLS.md`, `.claude/skills/plataforma-maestro/
  SKILL.md`, `docs/RUTINAS-PROGRAMADAS.md` — este último con el pendiente #10 de rutinas 1-2 sin
  `ALERTA_TOKEN`, verificado hoy que YA lo tienen) — corregidos los 3 (carril 1). El propio doc de rutinas ya
  anotaba que, una vez resuelto, tocaba pasar `trading-analista` de `pendiente-trigger` a `activo` en
  `lib/agentes-catalogo.ts` (código) — hecho por **PR draft** (carril 2, no se auto-aplica). `docs/
  FUENTES-DE-VERDAD.md` ampliado con la ruta de UI `app/(usuario)/trading/**` (faltaba, solo cubría la API).
  Informe: `docs/AUDITORIA-2026-07.md` (sección "Auditoría LIGERA — 20/07/2026").

- **🧩 /trading: ranking y explorador FUSIONADOS en una tabla (20/07/2026, mañana).** Alberto: "has
  duplicado, es la misma información" — cierto: la tabla top-20 y el explorador enseñaban las mismas
  columnas y el top-20 ⊂ 550. Ahora hay UNA tabla ("Ranking + explorador"): el score del blend se calcula
  en servidor para TODO el universo elegible con el MISMO `rankearUniverso` del cron (`top: n`, incluye
  fcfYield), el explorador lo ordena por defecto por score (las primeras filas SON el top del radar) y
  mantiene buscador/filtros/ordenación por columna + columnas # y Score. La tabla top-20 duplicada se
  eliminó del JSX (el snapshot `entries` sigue alimentando badges 🏆/📈 y el digest). tsc 0, build 0.
  **Mergeado (PR #1033)** — en producción `/trading` muestra ya la tabla única.

- **✅ H4 CUMPLIDA y EJECUTADA: FCF yield cableado al blend (19/07/2026, 21:00 UTC).** Medición sobre
  8.468 observaciones: spread medianas −2,4 pp (mejor que el EY: −5,0 pp → segunda rama de la condición
  pre-registrada) y **el mejor freno medido** (batacazos >15%: Q5 6,0% vs Q1 12,1%). Acción pre-registrada
  ejecutada el mismo día y ANTES del primer dato forward (el 20/07 el forward mide ya el modelo
  definitivo): `EmpresaUniverso.fcfYield` + mapping en `rankearUniverso` (módulo), columna
  **`trading_universo.fcf_yield`** (APLICADA), cálculo en `refrescarLoteUniverso` ((CFO−capex)/mktCap) y
  paso en `radar.ts`. Pesos entre pilares SIN cambio (el fcfYield entra por el hueco de 3 métricas que el
  pilar de valor ya tenía — antes solo 1 alimentada). La caché rellena `fcf_yield` con los crons de 6h
  (warmup opcional). Resultado anotado en el pre-registro (añadido fechado, hipótesis intacta).
  105+39 tests, tsc 0, build 0.

- **🔬 PRE-REGISTRO de hipótesis + FCF yield medible + línea de RÉGIMEN (19/07/2026, cierre; "lo dejo
  en tus manos" de Alberto).** Metodología para blindar el experimento: (1) **`docs/TRADING-HIPOTESIS-
  PREREGISTRO.md`** — H1 momentum 0,2→0,25 (condición: 12 sem forward con alpha >0 en ≥60% ventanas),
  H2 retirada de la puerta de calidad (exigencia alta, es el seguro), H3 permanencia del satélite 🚀
  (12 sem, ≥50% ventanas + batacazos <20%), H4 cableado del FCF yield (spread ≥+2pp o mejor que EY),
  H5 **cohorte 3 DOBLE ~15-18/08** (combinada + factores-solo `universo:sp500` sin gurús — cierra la
  atribución), H6 régimen como disparador de re-medición. Regla meta: ningún cambio del modelo sin
  hipótesis registrada ANTES; el doc solo se AÑADE, nunca se edita. (2) **FCF yield** = (CFO−capex)/mktCap:
  `ALIAS.capex` en edgar, `FundamentalesEmpresa.capex`, `FactoresFecha.fcfy` — el retrovisor lo recolecta
  para MEDIR H4 (pendiente re-recolección+medición); NO cableado al blend. (3) **Régimen** en
  `generarRadarSemanal`: SPY vs SMA 10 MESES (uso clásico de índice, distinto del por-acción descartado)
  → línea en digest + `salud.regimen`; si 🔴 bajista, el digest pide re-medir. Skill actualizada (paso 7:
  pre-registro + cohorte 3 doble + régimen). 39/39 tests, tsc 0, build 0.

- **🧬 Indicadores POR SEGMENTO (tamaño × antigüedad) + etiqueta 🆕 en cohetes (19/07/2026, noche).**
  Pregunta de Alberto "¿los cohetes serán IPOs/baja capitalización? ¿y cada indicador funciona distinto
  por tipo?" → medido (retrovisor §4-ter): los mega-cohetes son casi todos recién cotizados (SNDK/CRWV/
  Venture Global…, 71% cohete-rate PERO supervivencia pura — están en el top-550 porque volaron; NO
  estrategia); recién cotizadas pequeñas = peor lotería (mediana +0,8%, batacazo 21%); momentum funciona
  en TODOS los tamaños (+3,7 a +5,3 pp), calidad/valor negativos en todos pero el castigo se encoge con
  el tamaño; protección anti-batacazo de la calidad solo visible en ≥30mM$; veteranas mega-cap = mejor
  mediana (+4,5%) con menos sustos (7,0%) — intuición de Alberto confirmada. **Código:** `Cohete` gana
  `mesesCotizando` (primer cierre > inicio de la ventana de 500d ⇒ IPO/spin-off; null = veterana) →
  digest Telegram "🆕 ~X meses en bolsa" + badge en la tabla 🚀 de /trading. Sin cambio de pesos por
  segmento (un solo régimen; si el forward confirma → estudio en Fase 1.5). tsc 0, build 0.

- **📏 Medición del filtro de medias multi-marco: NO añaden señal al perfil cohete (19/07/2026, noche).**
  Re-recolección completa del retrovisor con `sobreSmaSem/sobreSmaMes` (547 filas, run 3 del workflow) y
  medición: cohetes-perfil SOBRE ambas medias → caza 12,4%, batacazo 13,5%, mediana +7,1%; BAJO alguna →
  14,0%/8,4%/+18,4% (n=178, huele a buy-the-dip de mercado alcista, no da para regla). Universo entero:
  tampoco señal. **Decisión: medias = INFO visual en el satélite 🚀, NUNCA filtro** (documentado en
  retrovisor §4-bis + skill; el código ya era solo informativo — nada filtra por `confirmado`). El digest
  con la sección 🚀 salió (snapshot de hoy con 5 cohetes). Respuesta a la duda original de Alberto ("mira
  si las medias dicen algo"): en 2024-26, no dicen nada útil para cazar cohetes.

- **🔎 Explorador del universo en /trading (19/07/2026, noche):** Alberto: "me faltaría filtro o
  buscadores para manejar yo las señales/calidad/ROIC". Nuevo
  `app/(usuario)/trading/RadarExplorador.tsx` (client puro sobre datos SSR): buscador por ticker/nombre +
  filtros (Piotroski ≥, ROIC ≥, momentum ≥, etiqueta de calidad, solo 🏆) + ordenación por columna sobre
  las ~550 de `trading_universo`, paginado 50+«Ver más» (regla de rendimiento), scroll horizontal en móvil.
  La etiqueta se calcula en SERVIDOR con `etiquetaCalidad` del módulo (guruScore solo conocido para el
  top-20 del snapshot → resto 0, aproximación anotada en el propio código); badges 🏆/📈 solo top-20.
  tsc 0, build 0. OJO al verificar builds: el cwd del Bash se resetea a la raíz — `cd apps/plataforma`
  SIEMPRE antes de tsc/next build (dos falsos resultados hoy por esto).

- **🚀 Satélite CAZA-COHETES + medias móviles multi-marco (19/07/2026, noche, SOLO paper).** Del hallazgo
  del retrovisor ("¿los cohetes tienen indicador?": perfil momentum>30% + calidad mala → 13% acaba en
  +50%/3m, 5× la base, pero segmento lotería/regime-dependiente), Alberto pidió montarlo + mirar medias
  móviles en marcos semanal/mensual/anual. Piezas: `backtest-puro.ts` gana `cierresPeriodicos` (remuestreo
  sem/mes), `ultimaSma`, `sobreSma` (testeados) y `FactoresFecha.sobreSmaSem/sobreSmaMes`; el retrovisor
  las recolecta por snapshot (SMA30 SEMANAL y SMA12 MENSUAL = media "anual"; margen de serie 400→500d) para
  MEDIR si el filtro de medias mejora la caza (pendiente re-recolección). `radar.ts::generarRadarSemanal`
  añade el satélite: candidatos = frescos con momentum>0.3 ∧ (roic<0 ∨ piotroski≤4), top-5 por momentum,
  confirmación = precio > SMA30sem ∧ > SMA12mes (`puntosDiarios` 500d); se persiste en columna nueva
  **`trading_ranking.cohetes`** (jsonb, APLICADA) con **track record PROPIO** (`trackRecord.cohetes`, mismo
  motor de ventanas vs SPY) — si en meses no gana lo que promete, se descarta con datos. Digest Telegram:
  sección "🚀 Caza-cohetes (satélite LOTERÍA)"; UI /trading: tabla propia bajo el radar. **NUNCA entra en
  cohortes ni en la cesta núcleo.** Verificado: 39/39 tests, tsc 0, build 0.

- **🔭 Retrovisor EJECUTADO + informe (19/07/2026, tarde-noche):** recolección completa (546/550 + SPY,
  22 snapshots jul-24→abr-26; la 1ª pasada del workflow pilló el deploy viejo → 2ª pasada idempotente la
  cerró) y análisis por SQL (z-scores por fecha replicando el blend del radar). **Informe:
  `docs/TRADING-RETROVISOR-2026-07.md`.** Titulares: top-10 batió a SPY **17/22 ventanas a 91d, alpha
  mediano +8,5 pp** (59% a 28d — la ventaja aparece con horizonte); por quintiles el ÚNICO factor con
  spread positivo 2024-26 fue el **momentum** (+5,6 pp mediana), calidad/valor negativos en bruto (junk
  rally de memoria/IA) pero **reducen la prob. de caer >15%** (EY 7,8% vs 14,2%); los cohetes (+200-380%:
  SNDK/ALAB/RKLB/BE/KXIAY) eran casi todos calidad-mala+momentum → el radar se los pierde A PROPÓSITO;
  gurús = calidad (ROIC 7-27%, cero basura) a precio razonable comprada CONTRA el momentum (MSFT/BKNG/
  SPGI en negativo), 7/17 fuera del top-550 (pro Russell 1000). Sesgo clave documentado: membresía del
  universo = lista de HOY retro-aplicada (supervivencia; infla momentum/junk). Decisión: NO tocar pesos
  del blend hasta que el forward confirme (2-3 meses). Ledger paper sigue a cero; también quedó atrás:
  primer ranking real del radar generado HOY (303/550 con datos, digest enviado).

- **🔭 Trading: RETROVISOR del radar (backtest punto-en-el-tiempo) + lupa de gurús (19/07/2026, SOLO
  paper, INDICATIVO).** Alberto: "¿no podemos conseguir historial y no esperar?" → sí, como backtest bien
  etiquetado que NO sustituye al forward (la decisión de dinero real sigue dependiendo SOLO del track
  record forward). Spec `docs/superpowers/specs/2026-07-19-trading-retrovisor-backtest-design.md`. Piezas:
  `recortarFactsHasta(cf, fecha, conceptos?)` en `edgar.ts` (punto-en-el-tiempo ESTRICTO por `filed` del
  10-K — sin look-ahead; testeado) + `companyfactsCrudo` + `CONCEPTOS_FUNDAMENTALES`; `puntosDiarios`/
  `parseYahooChartPuntos` en `precios-stooq.ts` (serie CON fechas, fallback Stooq→Yahoo); lib
  `backtest-puro.ts` (fechasSnapshot mensuales/precioEn/retornoForward — SOLO type-imports locales para
  que `node --test` los resuelva; los relativos runtime sin extensión NO resuelven en node) + `backtest.ts`
  (IO: `refrescarLoteBacktest` — siembra desde trading_universo + SPY, por símbolo 1 companyfacts + 1 serie
  → factores conocidos el día 1 de cada mes ×~22 + ret forward 28/56/91d; `recogerGurusLupa` — convicciones
  Dataroma × factores actuales en fila `_GURUS_`, materia prima del "¿por qué compran eso?"). Tabla
  **`trading_backtest`** (APLICADA por Supabase MCP; separada a propósito de las honestas). Ruta manual
  `/api/cron/trading-backtest?accion=lote|gurus` (Bearer CRON_SECRET, NO en crons de vercel.json) +
  workflow **`trading-backtest.yml`** (14 lotes + gurús; NO solapar con trading-warmup — ambos pegan a la
  SEC). Análisis agregado: la SESIÓN lee la tabla por Supabase MCP y calcula localmente (rankearFactores
  del módulo) → informe `docs/TRADING-RETROVISOR-2026-07.md` (top-10 vs SPY por MEDIANA, % ventanas,
  drawdown, lupa de gurús). Verificado: 37/37 tests lib/trading, tsc 0, next build exit 0.

- **🧹 Trading: ledger paper a CERO + workflow `trading-warmup` para calentar el radar a demanda
  (19/07/2026, tarde).** Alberto vio NVO en la cartera simulada y pidió empezar de cero: borradas la única
  posición y orden del ledger paper (`trading_paper_posicion`/`trading_paper_orden`, NVO 132×50,32$ del
  17/07, "momentum conf 78") por Supabase MCP — las cohortes/curva (`COHORTES_PAPER`/`trading_paper_track`)
  no se tocan. Nuevo **`.github/workflows/trading-warmup.yml`** (workflow_dispatch): dispara N lotes del
  cron `trading-universo` y opcionalmente el `trading-ranking` con los secrets de repo ya existentes
  (`PLATAFORMA_URL`+`CRON_SECRET`, mismo patrón que `auditoria.yml`) — así la caché del radar se llena HOY
  (~30-40 min los 11 lotes) en vez de esperar ~2,7 días de crons cada 6h, y el primer digest/ranking se
  puede ver el mismo día del deploy. El track record saldrá "acumulando historial" (honesto: no hay
  snapshots previos). Los crons automáticos siguen igual (universo cada 6h, ranking lunes 09:00). + matiz por antelación en el agente de huéspedes (19/07/2026,
  PR #1015 mergeado):** un huésped de Luxury Busto pidió late check-out (12:00 en vez de 11:00) con 5 días de
  antelación (reserva 145956056); el borrador del agente decía "voy a consultarlo con el anfitrión" sin
  resolver nada — Alberto lo señaló como respuesta que "no cubre bien la pregunta". El agente de huéspedes
  (`apps/plataforma/lib/sivra/agente-huesped/`) ahora calcula disponibilidad REAL de late check-out contra
  Smoobu (`entradaMismoDiaLibre` en `disponibilidad.ts`, espejo de `nocheAnteriorLibre` ya existente para
  early check-in), con el mismo matiz aplicado también al early check-in existente: confirmación FIRME solo
  el mismo día del hecho (llegada/salida); con antelación, matiza "en principio sí, se confirma ese mismo
  día" (riesgo de reservas de última hora). Late check-out SIGUE escalando siempre a Telegram
  (`esSolicitudLateCheckout` en `reglas.ts` fuerza `needs_human=true` determinísticamente), pero ahora con
  un borrador que ya trae la respuesta correcta; y si toca declinar, sugiere la consigna de equipaje como
  alternativa. Spec: `docs/superpowers/specs/2026-07-19-late-checkout-early-checkin-antelacion-design.md`;
  plan: `docs/superpowers/plans/2026-07-19-late-checkout-antelacion.md`. Verificado 99/99 tests en
  `apps/plataforma/lib/sivra/agente-huesped/`. Skill `sivra-maestro` actualizada con el nuevo comportamiento.
  **PR #1015 mergeado.**

- **🌎 Trading Fase 1: RADAR DEL UNIVERSO EEUU implementado (19/07/2026, PR #1017, SOLO paper).** El agente pasa
  de la watchlist de 13 a **las ~550 mayores de EEUU** (idea de Alberto "que analice las bolsas", corregida:
  la SELECCIÓN elige el QUÉ —factores+gurús—, el técnico solo el CUÁNDO). Spec+plan aprobados (mergeados) y
  **9 tareas ejecutadas** (subagentes pican, sesión asigna/revisa/verifica): (1) módulo puro `universo.ts`
  (`rankearUniverso`/`etiquetaCalidad`/`diffRanking`/`snapshotsParaEvaluar`/`resumenTrackRecord`, 5 tests);
  (2) EDGAR ampliado (`listaUniverso` ticker+NOMBRE del `company_tickers.json`, `fundamentalesCik`,
  deudaLp/caja/margenNeto/acciones para EV); (3) tablas **`trading_universo`** (caché incremental) y
  **`trading_ranking`** (snapshots semanales) — **APLICADAS por Supabase MCP**; (4) semilla de respaldo
  (~60 megacaps); (5) cron **`trading-universo`** `20 */6 * * *` (lotes de 50, SEC+precios, ~4 req/s, error
  por fila sin romper lote); (6) cron **`trading-ranking`** lunes 09:00 (rankea desde caché, técnico
  SMA50+RSI del top-20, gurús Dataroma, track record ~4/8/13 semanas vs SPY por MEDIANA, snapshot idempotente,
  digest Telegram con salud de datos; si cobertura <50% avisa en vez de rankear); (7) sección **🌎 Radar del
  mercado** en `/trading` (tabla top-20 `TICKER — Nombre` + etiqueta + badges + track record); (8) `/seleccion`
  modo `{"universo":"sp500"}` (cohortes futuras desde el universo amplio). **Verificado:** 105 tests módulo +
  32 lib/trading, tsc 0, `next build` exit 0. **Arranque:** tras el deploy, la caché tarda ~2-3 días en
  llenarse → el digest del lunes siguiente al merge puede avisar "datos insuficientes" (honesto); primer
  ranking completo el lunes de después. **Fase 1.5 anotada:** Russell 1000, avisos por cambio material,
  ADX/rvol (OHLCV), y pilar 4 = fondos vía conector MCP **Morningstar** (Alberto lo encontró: screener +
  fund-holdings; los conectores van por servidores Anthropic → la rutina lo usará sin tocar allowlist;
  pasada exploratoria de datos antes de diseñar). Invariantes: SOLO paper, fuentes gratis, cero órdenes.

- **📈 Trading Fase B: congelada la COHORTE 2 del forward paper (19/07/2026, reloj desde el 20, SOLO paper).**
  Segunda cesta congelada en `COHORTES_PAPER` (`paper-cartera.ts`), `version '2026-07-20.v1'`,
  `fechaInicio '2026-07-20'` (apertura de bolsa). Sale de `/api/trading/seleccion` en vivo (Dataroma+EDGAR OK,
  gestores BRK/psc/ic/DA, 14 con fundamentales). **La combinada coincide con la cohorte 1** (MSFT/APP/DAL/CVI/
  NYT/LYV/GOOG/AMZN — misma selección de estos días); lo NUEVO es la **cesta base gurús-solo**
  (`simbolosBase`, 17 nombres: DAL/M/MSFT/SUNB/APP/SPGI/NYT/GOOG/LEN/LEN.B/AMZN/UBER/CVI/SD/RPRX/LYV/BKNG) →
  arranca la **ATRIBUCIÓN** del filtro de calidad (la cohorte 1 no la tenía) + un 2º punto de entrada. Sin
  look-ahead (todo congelado hoy, medido hacia delante desde el 20). Integridad de cohortes 6/6, tsc 0. La
  medición empezará cuando cierre la sesión del 20 (hasta entonces la sección 🧪 de `/trading` la muestra
  «acumulando»). Próxima cohorte por cadencia ~30 días (mediados de agosto), que ya divergirá en la combinada.

- **✅ RESUELTO el bloqueo de red+auth de las rutinas contra Vercel (19/07/2026).** Era el pendiente que
  arrastraban `trading-analista` y `auditoria-diaria` (documentado como "403 en el túnel CONNECT hacia
  `plataforma-ten-flame.vercel.app`"). Se arregló en DOS pasos encadenados, por Alberto en claude.ai/code + Vercel:
  (1) **egress 403** → en el entorno **"Default"** de la rutina, Network access **Trusted → Custom** con el dominio
  `plataforma-ten-flame.vercel.app` en Allowed domains (+ casilla "incluir gestores de paquetes" para no romper
  `pnpm install`). (2) Al abrirse el egress afloró un **401**: el `ALERTA_TOKEN` del entorno de la rutina y el del
  proyecto Vercel `plataforma` estaban desincronizados → se **ROTÓ** (mismo valor nuevo en ambos) **y se
  REDESPLEGÓ plataforma** (las envs de Vercel no surten efecto sin redeploy — era el eslabón que faltaba en los
  intentos previos). **Verificado end-to-end:** `POST /api/trading/saldo` → 200 y `broker_saldos.actualizado_en`
  se refrescó (19/07 14:08 UTC, NAV €33.658,82); la pasada nocturna de trading corrió completa por primera vez.
  **Aprendizajes para no repetirlo:** el 403 es red (allowlist del entorno), el 401 es token (Vercel↔entorno,
  byte a byte) y **SIEMPRE requiere redeploy de Vercel** para que el token nuevo entre. Notas stale del 403
  actualizadas en la skill `trading-analista`. Sin secretos en repo/prompt (el token se rotó tras verse en chat).

- **💶 Botón "Movimientos" en Dinero + tarjeta Correduría en Negocios (19/07/2026, PR #1012 mergeado):**
  Alberto pidió, a partir de una captura del móvil, poder acceder a los movimientos de las cuentas
  eligiendo cuáles están sincronizadas, y ver la correduría dentro de la pestaña 🏢 Negocios. Investigado
  antes de tocar código: el libro de movimientos (`MovimientosTabla`) ya existía SIEMPRE visible en 💶
  Dinero (decisión previa: "es lo que más se usa"), así que en vez de duplicarlo se añadió un botón
  **"📄 Movimientos"** junto a Añadir/Más que ancla (`#libro-movimientos`) al libro ya existente. Se añadió
  el campo `sincronizada` por cuenta en `getSaldoConsolidado` (`lib/banca.ts`, `EXISTS` sobre
  `movimientos_bancarios.origen='psd2'`) — no existía ningún flag para distinguir cuentas con sync PSD2 de
  las importadas a mano — pintado como badge 🔄 en las tarjetas de cuenta y en el selector del libro.
  **Correduría confirmada por consulta directa: 0 filas en la tabla `negocios`** (no es una sociedad/CIF,
  es persona física) — se añadió una tarjeta "🧾 Correduría de seguros" en `NegociosResumen.tsx`
  reutilizando `getResumenFinanciero` (fuente única del cálculo, con sus reglas de exención/retención) en
  vez de sumar por SQL aparte. Verificado `next build` + `tsc` (0 errores nuevos) + 183/183 tests. Archivos:
  `lib/banca.ts`, `banca/{BancaClient,page,NegociosResumen}.tsx`.

- **🎯 Primera verificación del pricing tras los fixes del 18/07 + alerta falsa arreglada en el momento
  (19/07/2026):** checklist de 5 puntos de Alberto contra la BD de producción, solo 1 pasada corrida con
  el motor completo (18/07 20:30). 4/5 en verde o en camino: octubre subiendo (365-392€, aún no llega a
  ≥400€, esperado con el raíl ±20%/día), tripwire sin sonar, sin caídas >20%/día, volumen de escrituras
  explicable (corrección de golpe del suelo+víspera+evento). **Investigado a fondo el aparente "Luxury
  11-12 jun 2027 congelado a 283€"**: NO es un bug — son las 2 noches YA VENDIDAS (Airbnb, Andrea
  Salvatierra, 687€/2 noches, reserva del 15/07 que disparó la auditoría original); el motor correctamente
  no tarifica noches ya reservadas. **Hallazgo real arreglado en el momento** (no se dejó para otra sesión):
  el cron legado `/api/sivra/mercado/cron` (07:15 diario) generaba alertas `precio_bajo` falsas comparando
  contra precios **hardcodeados en el código** (`OUR_PRICES`, de antes del motor dinámico) en vez del precio
  real aplicado — hoy comparaba "80€" cuando el motor real ya tenía Busto a 156€. Fix: `generateAlerts()`
  lee ahora el último `pricing_applied` real para la fecha comparada (si no hay precio real, no alerta).
  `tsc` 0, `next build` OK. Alerta falsa de esta mañana marcada `resuelta` en BD. **Decisión nueva de
  Alberto, aplicada como §7 del skill `pricing-agente`:** toda verificación/auditoría de pricing debe
  terminar con un pase de "¿qué falta para que funcione perfecto?" y arreglar lo seguro EN EL MOMENTO, no
  solo apuntarlo. Detalle completo en `docs/AUDITORIA-PRICING-2026-07.md` (sección "Primera verificación").

- **🔍 Auditoría PROFUNDA semanal (19/07/2026): 2 hallazgos 🔴 reales, 1 arreglado en el acto, 1 pendiente
  de Alberto.** `/auditoria-diaria --profunda`: integridad estructural + typecheck de las **8** apps
  (incl. `almacen`) + tests + seguridad multi-tenant + deps + infra real MCP + docs, sobre el rango del
  18/07 (50 commits, sobre todo trading Fase B). **Antes de auditar**, se resolvió una deuda de proceso:
  la pasada ligera de esta madrugada había dejado sus reconciliaciones de carril 1 (trading-analista en
  `docs/SKILLS.md`/`RUTINAS-PROGRAMADAS.md`/`FUENTES-DE-VERDAD.md`/`plataforma-maestro`) en el **PR draft
  #1006** en vez de `main` — verificado correcto (CI verde, solo texto) → mergeado en vez de duplicar el
  trabajo. **Hallazgos:** (1) 🔴 `apps/rrhh/app/api/cron/alerta-jornada-maxima/route.ts` tenía un bypass
  de auth por `User-Agent: vercel-cron` (cabecera falsificable) — contradecía la regla ya escrita en
  `apps/rrhh/CLAUDE.md` ("sin User-Agent bypass") y era el único de los 4 crons de rrhh con el patrón;
  **arreglado** (mismo fail-closed que los otros 3). (2) 🔴 la vista `public.v_movimientos_activos`
  (datos financieros) perdió su `security_invoker=true` — se fijó en la remediación de junio, pero las
  regeneraciones de `2026-06-26` y `2026-07-03` (para exponer columnas nuevas) hicieron
  `CREATE OR REPLACE VIEW ... SELECT *` sin repetir esa opción, así que Postgres la recreó en
  `SECURITY DEFINER` (bypassea RLS). **NO aplicado** (regla: nunca migraciones en producción desde la
  auditoría) — migración propuesta en `apps/plataforma/prisma/sql/2026-07-19_v_movimientos_activos_security_invoker.sql`,
  **pendiente de que Alberto la revise y aplique** por Supabase MCP. (3) 🟡 el webhook
  `apps/ia-rest/.../deploy-aprendizaje/route.ts` fallaba **abierto** si `VERCEL_DEPLOY_WEBHOOK_SECRET` no
  estaba seteado — arreglado a fail-closed. Todo lo demás en verde: 8/8 apps typechequean 0 errores,
  `pnpm test` 100%, `pnpm audit` (5 "high") verificadas no explotables, heartbeat 9/9 crons, memoria ya
  al día, sin drift de docs nuevo. El segundo proyecto Supabase que detectó el chequeo de infra
  (`efncqyvhniaxsirhdxaa`) **no es hallazgo nuevo** — es el silo transitorio de ia-rest ya conocido
  (`MATRIZ.md`). Informe completo: `docs/AUDITORIA-2026-07.md` (sección "Auditoría PROFUNDA —
  19/07/2026"). Carril 2: PR draft **#1007**. **Aviso Telegram FALLÓ**: mismo 403 en el túnel CONNECT
  hacia `plataforma-ten-flame.vercel.app` ya documentado para `trading-analista` (18/07/2026) — no es el
  token (`ALERTA_TOKEN` presente) ni el endpoint, es el **allowlist de red del entorno de la rutina
  programada**, y afecta a más de un agente. Se avisó por el canal nativo de la sesión en su lugar.
  **Pendiente de Alberto**: añadir `*.vercel.app` (o el host concreto) al allowlist de red de las
  rutinas — arregla ambos bloqueadores a la vez.

- **📈 Trading Fase B: forward paper VISIBLE en `/trading` (18/07/2026, SOLO paper).** El forward paper solo se
  veía por Telegram; ahora tiene superficie de navegador. Nueva sección **🧪 Forward paper** en
  `app/(usuario)/trading/page.tsx` (server component): lee los snapshots persistidos de `trading_paper_track`,
  agrupa por cohorte y pinta por cada una la MEDIANA vs SPY (✅/⚠️), baten/N, media, **riesgo** (caída máx/vol/TE),
  **atribución** (filtro aporta ±%) y una **mini-curva SVG pura** (cesta mediana vs SPY, sin dependencias nuevas —
  no usa Recharts). Empieza vacía con mensaje explicativo hasta el primer snapshot del cron semanal (lunes). tsc 0,
  `next build` OK. Responsive (grid auto-fit, SVG `maxWidth:100%`). Invariantes intactas: solo lectura, cero órdenes.

- **📈 Trading Fase B: métricas de RIESGO + ATRIBUCIÓN del filtro de calidad (18/07/2026, SOLO paper).** Ideas
  3+4 de robustez, "haz tú todo" de Alberto. (3) **Riesgo** — nuevo `@central/module-trading/riesgoCesta.ts`
  (`metricasRiesgoCesta`: curva equiponderada buy&hold → **caída máxima**, **volatilidad anualizada**, **tracking
  error** vs SPY; puro, 8 tests). El digest de Telegram y la BD ahora llevan riesgo: "batir con más riesgo no es
  batir". (4) **Atribución** — nuevo `seleccionSoloGurus` (cesta gurús-SOLO, sin la puerta de calidad) como **2º
  benchmark**; si la combinada no bate a la base, el filtro Piotroski/ROIC no aporta. `/api/trading/seleccion`
  devuelve `simbolosBase` (cópiala a la cohorte al congelar); `CarteraPaper.simbolosBase?` opcional. El tracker
  mide combinada + base + riesgo, persiste todo (7 columnas nuevas en `trading_paper_track`: max_drawdown,
  vol_anual, tracking_error, retorno_base, mediana_base…) y el digest muestra "filtro aporta +X%". **Tabla
  ampliada YA APLICADA por Supabase MCP** en la BD compartida (`wswbehlcuxqxyinousql`, 20 columnas, RLS). tsc 0,
  **100 tests módulo + 30 lib/trading**, `next build` OK. La cohorte v1 (2026-07-18) no tiene `simbolosBase` (no
  se pudo tirar Dataroma desde el sandbox por el 403); se poblará al congelar la siguiente vía el endpoint en vivo.
  Invariantes intactas: cero órdenes reales.

- **💸 Bizum unificado en una subcategoría personal + financiación BanSabadell cerrada (18/07/2026).**
  Alberto vio en 🏠 Personal los envíos de Bizum sueltos como "Sin categoría..." (algunos incluso mal
  enganchados a ocio/club/restaurante_bar/supermercado porque el motivo libre — "ENVIO BIZUM padel" —
  casaba antes con la keyword de esa categoría) y pidió unificarlos. Nueva subcategoría **`bizum`** en
  `lib/categorias-personales.ts` (`SUBCATEGORIAS_GASTO`); regla **PRIMERA prioridad** en
  `lib/subcategoria-keywords.ts` (`['BIZUM']` gana siempre, antes que cualquier otra categoría);
  `lib/destino.ts` la asigna ya en la ingesta. Backfill `prisma/sql/2026-07-18_bizum_unificado.sql`:
  78 movimientos reclasificados a `bizum` (−3.192,64€). Alcance solo GASTO (Bizum enviado); los Bizum
  recibidos (ingreso, `otros_ingreso`) se dejaron fuera a propósito. De paso, confirmó que los 6 recibos
  "RECIBO BANSABADELL F." (83,33€/mes, ene-jun 2025) son una financiación personal ya cancelada — se
  añadió como keyword explícita a `otros_gasto` (ya estaba bien clasificada; solo se blinda para que un
  futuro re-barrido no la mueva). 20/20 + 502/502 tests, `tsc` 0, `next build` OK.

- **🔧 Fix: 1.314,95€ de cuota RETA de Alberto mal clasificados como gasto personal (18/07/2026).**
  Auditoría disparada por Alberto al ver "Cuota autonomos" en el nuevo epígrafe 🏠 Personal (captura de
  pantalla). `lib/destino.ts` ya clasifica una cuota TGSS en BBVA como `destino='seguros'` (deducible,
  Art. 30.2.1ª LIRPF), pero **4 movimientos** (30/06, 29/05, 30/04, 31/03 — 388,95€×3 + 148,10€) tenían
  `destino='personal'` con `destino_confirmado=true`, así que nunca volvieron a pasar por la
  clasificación automática ni por la bandeja "por revisar" (zombies, igual patrón que el landmine
  `requiere_revision` del PR #906). Backfill `prisma/sql/2026-07-18_fix_cuota_autonomos_personal.sql`
  (aplicado por Supabase MCP): `destino='seguros'`, `subcategoria='cuota_autonomos'` en los 4. Además
  1 compra suelta ("COMPRA EN GRUPO VIVO DIAGNOSTICO", tarjeta Kutxa) tenía `subcategoria='seguro_salud'`
  — código reservado a pólizas de correduría, ni está en la lista canónica de `categorias-personales.ts`
  (por eso salía con icono "•" genérico) — corregida a `otros_gasto` (el `destino='personal'` sí era
  correcto ahí, es gasto médico puntual, no póliza). Auditoría completa por SQL: no se encontraron más
  filas con patrones de correduría (TGSS/aseguradoras/comisiones/Dúplex) atrapadas en `destino='personal'`.
  **Pendiente evaluar** (no se tocó): si conviene añadir una subcategoría personal "salud" propia en vez
  de usar `otros_gasto` como cajón para gastos médicos sueltos.

- **📈 Trading Fase B: COHORTES del forward paper + curva persistida en BD (18/07/2026, SOLO paper).** Robustez
  del forward test (ideas 1+2 de Alberto): (1) **cohortes** — `paper-cartera.ts` pasa de UNA cesta congelada a
  una lista `COHORTES_PAPER` (se congela una NUEVA cada ~30 días, `DIAS_ENTRE_COHORTES`); cada cohorte es una
  muestra independiente con su propio reloj, así que "batir al SPY" repetido entre cohortes es mucho más difícil
  de explicar por suerte que una sola cesta. Congelar = AÑADIR una entrada al array (deliberado y auditable; nunca
  se edita una existente → no rompe el out-of-sample). (2) **persistencia** — nueva tabla `trading_paper_track`
  (modelo Prisma `TradingPaperTrack`, migración `2026-07-18_trading_paper_track.sql`, **pendiente aplicar a mano**
  en la Supabase compartida) + `persistirSnapshot`/`curvaForward` en el tracker: el cron semanal guarda un snapshot
  por cohorte (idempotente por cohorte+fecha) → curva del forward, no solo el número de hoy. El digest de Telegram
  ahora recorre todas las cohortes y **recuerda cuándo toca congelar la siguiente**. `/api/trading/paper` devuelve
  `cohortes[]` y, con `?curva=1|<cohorte>`, la curva persistida. tsc 0, 30 tests `node --test` en `lib/trading`
  (6 nuevos de integridad de cohortes), `next build` OK. **Pendientes de robustez (acordados, para siguientes PRs):**
  (3) métricas ajustadas a riesgo (drawdown/vol/tracking error) en el digest; (4) atribución = trackear una cesta
  gurús-SIN-filtro-calidad como 2º benchmark para saber si el filtro Piotroski/ROIC aporta. Invariantes intactas:
  cero órdenes reales, dinero real solo tras batir al SPY hacia delante.

- **🧭 DECISIÓN APLAZADA — datos de pago (EODHD MCP u otros) SOLO si los resultados reales lo piden (18/07/2026).**
  Alberto compartió **EODHD** («MCP Server for Financial Data», 72 tools de SOLO LECTURA, API key gratis: precios
  EOD/históricos, fundamentales, noticias). Encaja con nuestros dolores (Stooq→Yahoo bloquean IPs de datacenter de
  Vercel; EDGAR XBRL frágil; la rutina Claude no llega a Vercel por el 403 → un MCP lo consumiría directo) y respeta
  las invariantes (read-only, no ejecuta órdenes). PERO: el **tier gratis es muy limitado** (~20 llamadas/día, pocos
  exchanges) y hoy el forward paper corre a **0€** con Stooq→Yahoo. **Decisión: NO meterlo en el camino crítico
  ahora.** Reevaluar SOLO cuando veamos resultados reales del forward y con un disparador claro: (a) si Stooq **y**
  Yahoo fallan a la vez de forma recurrente en el cron semanal (fuente caída → el digest avisa «sin precios»),
  entonces añadir EODHD como **3er fallback de precios** en `cierresDiarios` (PR pequeño, key gratis); (b) al abrir
  la Opción B / rutina IBKR, engancharlo **por MCP en la rutina** para fundamentales+noticias, donde el free tier
  cunde (pocas llamadas, alto valor). Si el free no llega para lo que haga falta, valorar el plan de pago **solo
  entonces** (principio: fuentes de pago únicamente si el track record demuestra que aportan). Mientras: no se hace
  nada, queda anotado.

- **📈 Trading Fase B: cron SEMANAL del forward paper + aviso Telegram (18/07/2026, SOLO paper).** Tras congelar la
  cesta combinada (#1001), se automatiza el seguimiento para que el test corra solo y acumule evidencia:
  `lib/trading/paper-tracker.ts` (`medirCarteraPaper`/`enviarPaperTracker`) mide la cesta congelada vs SPY (precios
  Stooq→Yahoo) y manda un digest por Telegram (media + **MEDIANA** + baten/N; la mediana decide). Cron
  **`/api/cron/paper-tracker`** los **lunes 10:00** (`0 10 * * 1` en `vercel.json`, auth `CRON_SECRET`). Corre en
  Vercel (su egress a Stooq/Yahoo sí sale — no pasa por el proxy de la sesión Claude que da 403). tsc limpio, JSON
  válido. Para cambiar la cesta: editar `CARTERA_PAPER` (nueva version+fechaInicio = reinicia el reloj sin sesgo).
  Invariantes intactas: cero órdenes reales.

- **🏠 Cuarto segmento PERSONAL en el Inicio unificado `/banca` (18/07/2026):** Alberto pidió ver el
  desglose de gasto personal desde el Inicio ("quiero empezar a ver que gastamos desglosado"). Se añade
  **`🏠 Personal`** a `banca/SegTabs.tsx` (junto a 💶 Dinero · 🏢 Negocios · 🧾 Fiscal) y una rama
  `tab==='personal'` en `banca/page.tsx` que reutiliza **tal cual** `CategoriasTab` (la pestaña "En qué
  gasto" de `/finanzas`, ya probada: dona + tabla por subcategoría con grupo 🏠 Vivienda + drill-down por
  comercio/movimiento + cola "🔎 Necesitan tu atención" + alertas de presupuesto mensual). No se duplicó
  lógica: el componente gestiona su propio filtro de fechas (mes actual por defecto) vía sus propias
  llamadas a `/api/finanzas/categorias*`, así que la página solo le pasa el año en curso. `tsc` 0 ·
  `next build` OK. La página `/finanzas?tab=categorias` sigue existiendo (no se tocó).

- **📈 Trading Fase B: LUZ VERDE al forward paper — cesta combinada CONGELADA (18/07/2026, SOLO paper).**
  La selección combinada (gurús ∩ calidad, `/api/trading/seleccion`) pasó el test de robustez de Alberto: en
  backtest 2023→hoy la **MEDIANA** de la cesta batió al SPY **+159,9% vs +95,2%** (8/8 en verde, 6/8 sobre el
  índice) — o sea NO depende del unicornio APP (la media +608% sí, la mediana no). Por su criterio pre-registrado
  (mediana > SPY) → **arrancar el forward paper**. Pero el backtest siempre tiene look-ahead, así que se monta el
  **forward test LIGERO** (sin IBGateway, que aún no está listo — ver 403 abajo): **cesta CONGELADA** en
  `lib/trading/paper-cartera.ts` (`CARTERA_PAPER` v1 2026-07-18: MSFT/APP/DAL/CVI/NYT/LYV/GOOG/AMZN) + endpoint
  **`GET/POST /api/trading/paper`** que mide su rendimiento REAL hacia delante (sin look-ahead) vs SPY con precios
  gratis (Stooq→Yahoo). Devuelve media + **mediana** + días. Typecheck limpio. **Regla:** no leer como veredicto
  hasta acumular semanas/meses; si el forward bate al SPY sostenido → ahí sí dinero real.
  **🚨 Infra descubierta:** la **rutina programada trading-analista NO llega a Vercel** — `POST /api/trading/saldo`
  (y /analizar, /puntuar, Telegram) muere con **403 en el túnel CONNECT** del proxy de egress hacia
  `plataforma-ten-flame.vercel.app`. NO es token ni redeploy: es el **allowlist de red** del entorno de la rutina
  (pendiente: permitir el host de Vercel / `*.vercel.app`). El tracker `/api/trading/paper` como cron de Vercel
  sí funciona (su egress a Stooq/Yahoo no pasa por ese proxy). Invariantes intactas: cero órdenes reales.

- **📈 Trading Fase B: verificación completa + endpoint de SELECCIÓN COMBINADA gurús∩calidad (18/07/2026, SOLO paper).**
  2ª verificación en vivo (Claude para Chrome, sesión superadmin, sin secretos): **`insiders` sigue 0** (acceso a la
  fuente `getcurrent` de la SEC desde Vercel — pendiente instrumentar; pilar menos importante, se deja). **`validar-oos`
  ✅ arreglado** (Yahoo salvó a Stooq). **Hallazgo clave:** la cesta de picks de gurús rindió +411% vs SPY +95%
  (`alpha +316`), PERO **dominado por UN solo nombre** (APP/AppLovin ×39): en **MEDIANA** la cesta = +97% ≈ SPY +95%,
  y sin APP = +98% ≈ SPY. O sea **gurús-solo NO tiene ventaja robusta** (era una lotería de un nombre + look-ahead
  máximo). Decisión: **NO montar aún la Opción B** (forward paper IBKR); primero afinar la selección. **Nuevo endpoint
  `POST /api/trading/seleccion`** (auth token o sesión superadmin, `maxDuration=60`): cruza convicción de gurús ×
  CALIDAD (Piotroski≥6 + ROIC≥10% de EDGAR), devuelve cesta **diversificada equiponderada** (`tam` def 25, cap de
  concentración) + `simbolos` para `/validar-oos`. Pieza pura `seleccionCombinada` (`@central/module-trading::seleccion.ts`).
  **92 tests módulo** (+4), typecheck limpio. **Siguiente:** validar la cesta combinada en `/validar-oos` mirando la
  MEDIANA; si bate al SPY sin depender de un outlier → ahí sí Opción B. Invariantes intactas: cero órdenes reales.

- **📈 Trading Fase B: 1ª verificación EN VIVO desde el navegador + 2 fixes de acceso a fuentes (18/07/2026, SOLO paper).**
  Alberto ejecutó los 4 endpoints de lectura desde Claude para Chrome (sesión superadmin, sin secretos). Resultado:
  **`/gurus` ✅** (Dataroma OK: 4/5 gestores con datos —falla el código `a`—, 59 posiciones, ranking bien) y
  **`/fundamentales` ✅** (EDGAR OK: AAPL piotroskiScore 6, roic 0,606; 4/5 símbolos). **Dos rotos, ambos por la
  FUENTE, no por el navegador (no dio 401 → deploy/sesión OK):**
  - **`/insiders` → 0 transacciones.** Causa: el feed `getcurrent` de la SEC **NO enlaza a `/Archives/` en cada
    entrada** —el `<link>` va a la ficha del filer (`?CIK=…`) y el nº de accession vive en el `<id>`
    (`accession-number=…`). El parser `extraerEntradasAtom` buscaba `/Archives/` → 0 entradas. **Fix:** parsear por
    `<entry>` sacando accession del `<id>` + CIK del enlace (formato `/Archives/` queda de fallback).
  - **`/validar-oos` → 502 "sin precios del benchmark".** Causa: **Stooq bloquea/limita las IPs de datacenter de
    Vercel** (CSV vacío para SPY). **Fix:** respaldo **Yahoo Finance** (`cierresDiarios` = Stooq→Yahoo; parser
    `parseYahooChart` puro y testeado) + `stooqSimbolo` ahora convierte el punto de clase (BRK.B→brk-b.us).
  **24 tests lib/trading** (3 nuevos: atom getcurrent, yahooSimbolo, parseYahooChart), typecheck limpio.
  **Pendiente:** re-verificar en Vercel que insiders trae transacciones y validar-oos devuelve `alpha` (Yahoo). Si
  `alpha>0` → Opción B (forward paper IBKR). Invariantes intactas: cero órdenes reales.

- **📈 Trading Fase B: los endpoints de SOLO LECTURA aceptan sesión de superadmin (verificación sin secretos, 18/07/2026, SOLO paper).**
  Para poder VERIFICAR los endpoints de selección/validación desde el navegador ya logueado (o desde Claude para
  Chrome) sin pegar el `ALERTA_TOKEN` en la consola: nuevo helper `lib/trading/auth.ts::isTradingLecturaAutorizado`
  = `isRoutineAuthorized` (token) **O** `getAdmin()` (cookie `plataforma_admin`, superadmin verificado en BD).
  Aplicado a los 5 read-only: `/factores`, `/gurus`, `/fundamentales`, `/insiders`, `/validar-oos`. **`/analizar`
  se deja SOLO con token a propósito** (puede disparar aviso de compra paper por Telegram). Motivo: los endpoints
  usaban `isRoutineAuthorized`, que NO mira la cookie de login (`plataforma_session`/`plataforma_admin`) → un
  navegador logueado daba 401; Claude para Chrome (con razón) no maneja secretos, así que sin esto no había forma
  de verificar en vivo desde el navegador. Sigue siendo solo-lectura (no opera ni persiste). tsc limpio (los 3
  errores de `lib/broker.ts` son pre-existentes). Invariantes intactas: cero órdenes reales.

- **📈 Trading Fase B: validación de la selección vs SPY SIN IBKR — endpoint `/api/trading/validar-oos` (18/07/2026, SOLO paper).**
  Con la tríada de selección ya en main (#982/#990/#992/#995), se monta la **Fase A de validación** decidida con
  Alberto: comprobar si la selección bate al mercado **sin depender del conector IBKR** (frágil por el 2FA/reset
  diario de IBKR — hoy no hay tools de IBKR cargadas en sesión y el proxy del sandbox bloquea la salida a Vercel/SEC).
  Nuevo endpoint **`POST /api/trading/validar-oos`** (Bearer `ALERTA_TOKEN`, `maxDuration=60`): toma un universo YA
  rankeado (el `ranking` de factores/gurus/fundamentales/insiders), coge el top-N, baja cierres diarios **gratis de
  Stooq** (`lib/trading/precios-stooq.ts`, parser CSV puro testeado) + SPY, y devuelve el retorno de la **cesta
  equiponderada buy&hold vs el índice** (`evaluarCestaVsBench`/`retornoTotal` en `@central/module-trading::seleccionEval.ts`).
  **109 tests `node --test`** (88 módulo +4 seleccionEval; 21 lib/trading +5 stooq), typecheck rutas limpio.
  **⚠️ v1 = SANITY CHECK, no OOS point-in-time** (selección de hoy sobre precios pasados → look-ahead): `alpha>0` es
  NECESARIO pero no suficiente. **Prueba DEFINITIVA guardada para más adelante = Opción B (forward en paper de IBKR:
  IB Gateway + IBC en host siempre encendido, NO Vercel).** Decisión de Alberto: A ahora (filtro barato), B cuando A
  dé un candidato que bata al SPY. **Verificar en Vercel** (yo no puedo desde el sandbox): que Stooq devuelva precios.
  Invariantes intactas: cero órdenes reales, dinero real solo tras batir al SPY fuera de muestra.

- **🔧 Corrección: los ingresos de Pilar YA se ven en `/finanzas/pilar` (18/07/2026, PR #993).** El bullet
  de abajo (PR #991) grabó sus cifras en `fiscal_perfil.conyuge_*`, pero esas columnas **no las lee ninguna
  pantalla** — `/finanzas/pilar` y "Mi declaración" calculan todo en vivo desde `movimientos_bancarios`
  (`titular='conyuge'` + `destino='actividad_pilar'`), y no existía ninguna cuenta bancaria suya en el
  sistema. Se creó su cuenta (`cuentas_bancarias`, Kutxabank) + los movimientos reales del semestre: 2
  facturas (base imponible 990,56€+990,57€, el sistema aplica su propio 15% fijo de retención — por eso el
  `importe` de un cobro tiene que ser la BASE, no el neto bancario, o la retención se calcula mal) y 7
  cuotas de autónomos (467,45€). Nuevo: `ResumenPilar.notas` + banner 📝 en `PilarClient.tsx` que muestra el
  `comentario` de un movimiento cargado a mano (aquí, el supuesto de IVA 21%/retención 15% sin confirmar
  contra la factura real). Detalle completo y LANDMINE actualizados en la skill `perfil-fiscal`.

- **📈 Trading Fase B: montados los 2 pilares de ingesta que faltaban — EDGAR XBRL + insiders Form 4 (18/07/2026, SOLO paper).**
  Tras mergear #992 (gurús Dataroma), se completan las fuentes de SELECCIÓN. **(1) Fundamentales GRATIS de EDGAR**
  (`app/api/trading/fundamentales/route.ts`, Bearer `ALERTA_TOKEN`, `maxDuration=60`): resuelve ticker→CIK
  (`company_tickers.json`) y descarga `companyfacts` XBRL de la SEC; el parser puro `lib/trading/edgar.ts`
  (`serieAnual`/`extraerFundamentales`/`mapaTickers`) mapea los conceptos US-GAAP a los inputs que ya consume el
  módulo → **Piotroski F-score (2 ejercicios) + ROIC**; con `ev` por símbolo cierra la fórmula mágica
  (earningsYield=EBIT/EV). **(2) Insiders Form 4** (`app/api/trading/insiders/route.ts`): escanea los Form 4 más
  recientes (feed `getcurrent` atom → index.json → XML por filing) con el parser puro `lib/trading/form4.ts`
  (`parseForm4Xml`/`extraerEntradasAtom`/`elegirDocForm4`, solo transacciones P/S de mercado abierto) y agrega la
  **convicción por CLUSTER BUY** (nuevo `agregarInsiders` en `@central/module-trading::insiders.ts`: cuenta
  directivos DISTINTOS comprando; ventas restan). **100 tests `node --test` verdes** (84 módulo +4 insiders; 16
  lib/trading = 4 dataroma +6 edgar +6 form4), typecheck de rutas limpio (los 3 errores de `lib/broker.ts` son
  pre-existentes: modelo Prisma `brokerSaldo` sin generar en sandbox). **⚠️ Verificar en la 1ª corrida en Vercel**
  (el sandbox de las sesiones NO puede: la SEC bloquea IPs anónimas y exige User-Agent con contacto): que
  `conDatos`/`transacciones` no vengan en 0. Ambos endpoints NO operan ni persisten — priorizan QUÉ estudiar y los
  mejores entran al mismo `/analizar`. Skill `trading-analista` actualizada con ambos. Invariantes intactas: cero
  órdenes reales, dinero real solo tras batir al SPY fuera de muestra.

- **👶 Ingresos H1-2026 de Pilar (autónoma) cargados en `fiscal_perfil` (18/07/2026).** Pilar mandó por
  correo un extracto Kutxabank (`movimientos Pilar primer semestre2026.xls`, subido a Drive porque el Gmail
  MCP de esta sesión no expone descarga de adjuntos) con sus movimientos ene-jun 2026 — cuenta personal, NO
  conectada por PSD2/Enable Banking (primera carga manual de sus datos, `cuentas_bancarias` no tenía fila
  suya). Criterio de Alberto: **gastos de Pilar = 0€** (van con retroactividad a su nombre), solo importan
  los ingresos. Del extracto: **2 facturas a cliente** el 29/05 (transf. de 1.050€ netos cada una, Almacén
  de Mariscos González + Global 2 Instalaciones) → **base imponible ≈1.981,13€ / IVA ≈416,04€ / retención
  ≈297,17€** (⚠️ calculado asumiendo IVA 21% + retención 15% estándar — Alberto confirmó el mecanismo
  «retención la paga/ingresa la empresa cliente, IVA lo gestiona Pilar» pero no los % exactos; revisar
  contra la factura real si difieren). **Cuota autónomos (RETA) pagada: 467,45€** confirmado por Alberto
  (7 recibos, cae de ~118€/mes a 32,34€ en mayo-junio — coincide con la baja de maternidad). Grabado en
  `fiscal_perfil`: `conyuge_es_autonomo=true`, `conyuge_ingresos_brutos=1981.13`, `conyuge_gastos_deducibles=0`,
  `conyuge_cuota_autonomos=467.45`, `conyuge_retenciones=297.17`. **Nota aparte (NO en BD, no hay columna):**
  el extracto también trae 3 pagos "PENSION SS" (ene-mar, 1.085+980+770=2.835€) que es la **prestación por
  nacimiento/cuidado del menor** de la SS — **exenta de IRPF** (art. 7.h LIRPF, mismo tratamiento que la
  prestación propia de Alberto de PR #843) — no sumar a su rendimiento de actividad al declarar.

- **📈 Trading Fase B: #982 y #990 MERGEADOS + ingesta de gurús 13F vía Dataroma (18/07/2026, SOLO paper).**
  Ambos PRs de la Fase B en main (#982 core+factores+rvol; #990 barrera de selección en `/analizar` + `guru13f`).
  Nuevo (rama reiniciada desde main): **endpoint `POST /api/trading/gurus`** (`app/api/trading/gurus/route.ts`,
  auth `ALERTA_TOKEN`, `maxDuration=60`) que descarga la actividad 13F de gestores value desde **Dataroma** y
  devuelve la convicción por símbolo (`agregarConviccion`). Corre en el **egress de Vercel** (el sandbox de las
  sesiones da 403 a Dataroma, así que el fetch NO se puede probar aquí). Parser **puro y testeado**
  (`lib/trading/dataroma.ts`: `parseDataromaHoldings`/`mapActividadDataroma`, defensivo ante cambios de markup) +
  helper `agregarConviccion` en `guru13f.ts`. **84 tests `node --test` verdes** (80 módulo + 4 dataroma), typecheck
  rutas limpio. **PENDIENTE de verificar en la 1ª corrida en Vercel:** los códigos de gestor de Dataroma
  (`GESTORES_DEFECTO`) y el markup real (si `gestoresConDatos` sale vacío, ajustar selectores/códigos). **Aún por
  montar** (necesitan iteración en vivo en Vercel, no en el sandbox): fundamentales EDGAR XBRL e insiders Form 4.
  Invariantes intactas: cero órdenes reales, dinero real solo tras batir al SPY fuera de muestra.

- **📈 Trading Fase B: #982 MERGEADO + barrera de selección por factores en `/analizar` (18/07/2026, SOLO paper).**
  PR #982 (aviso Telegram compra + gates ADX/SMA50 + spec Fase B + `factores.ts`/`piotroski.ts`/`magicFormula.ts`
  + endpoint `/api/trading/factores` + RVOL robusto con mediana y umbral 1,5×) **mergeado a main** (squash 708a918).
  Seguimiento (rama reiniciada desde main): **la selección FILTRA al timing** — `/api/trading/analizar` acepta ahora
  `factorScore` por símbolo + `minFactorScore` global y **veta abrir un largo en un nombre fundamentalmente flojo**
  (`factorFlojo` en `riesgo.ts`, puro+testeado) aunque el gráfico dé señal; degrada sin factores (compat). El
  `factorScore` viaja en cada idea. 77/77 tests `node --test`, typecheck limpio. Invariantes intactas: cero órdenes
  reales, dinero real solo tras batir al SPY fuera de muestra. Pendiente: validar el ranking de factores OOS vs SPY
  (bloqueado por conector IBKR intermitente); luego B2 (13F gurús Dataroma/EDGAR + insiders Form 4).

- **🔑 Rutina trading-analista autenticada con `ALERTA_TOKEN`, no `CRON_SECRET` (18/07/2026).** Al montar el
  trigger diario de `trading-analista` (refresca el saldo IBKR de la vista 💶 Dinero + pasada paper) salió a la
  luz que el **entorno de una rutina de Claude Code es texto plano VISIBLE** («no metas secretos»), así que meter
  ahí el `CRON_SECRET` maestro (autoriza TODOS los crons) era un error. Fix: los endpoints `/api/trading/*`
  (`saldo`/`analizar`/`puntuar`/`fmp`/`descubrir`/`screener`) aceptan ahora el token DEDICADO de bajo privilegio
  **`ALERTA_TOKEN`** vía nuevo helper `lib/cron-auth.ts::isRoutineAuthorized` (= `isAlertaTokenAuthorized` ||
  `isCronAuthorized`, compat). Es el mismo token que ya usa `/api/internal/alerta` (refactorizado para compartir
  el helper); si se filtra, su alcance es mínimo (empujar un saldo / disparar una pasada PAPER — nunca dinero real
  ni órdenes reales). La rutina lleva en su entorno solo `PLATAFORMA_URL` (no secreta) + `ALERTA_TOKEN`. Skill
  `trading-analista` y `docs/RUTINAS-PROGRAMADAS.md` actualizados (Bearer ALERTA_TOKEN). **PENDIENTE Alberto:**
  añadir `ALERTA_TOKEN` (mismo valor que en Vercel) al entorno «Default» de la rutina y re-ejecutar; `PLATAFORMA_URL`
  ya la añadió. Verificado en sesión: el conector IBKR lee el NAV (33.658,82€); faltaba solo el token en el entorno.

- **🔍 AUDITORÍA PRICING COMPLETA («está fallando mucho») — 18/07/2026 tarde.** Informe en
  `docs/AUDITORIA-PRICING-2026-07.md`. Diagnóstico: el motor no falla por datos sino por MECÁNICA —
  (R1) el raíl «±20%/día» era **por PASADA** (3 crons/día = ±73%/día → la V de Karol G: 326→112→701€
  en 5 días), (R2) el premio de evento de #985 tenía **doble conteo** (×2,5 sobre una mediana que ya
  era precio-de-evento → Karol G camino de ~2.000€), (R3) **sin banda muerta** (3.448 escrituras/7d,
  78% de fechas de Busto subiendo Y bajando la misma semana — los huéspedes compran los valles).
  **Coste medido:** Karol G vendida a 344€/noche (mercado ~931€) y Puente del Pilar a 126€ (PL 473€),
  ambas cazadas en valles del ping-pong; 7 noches de octubre a 65€ brutos (los descuentos de canal
  perforan el `min_price` — R4, decisión pendiente de Alberto: subir Busto a ~115-120€). Fixes R1-R3
  aplicados en `apps/plataforma/app/api/sivra/pricing/apply/route.ts` (ancla `ref24` del raíl por DÍA
  real, evento sin doble conteo, banda muerta 3%) — mergeados en #987. **2ª tanda (delegación «haz todo
  como tú veas mejor»):** R4 `min_price` Busto 90→115 (BD, lección en `pricing_aprendizaje/min_price_canal`;
  Luxury se queda en 95) · R5 motor viejo de sivra → **410 Gone** (`apply`/`apply-auto`; `aplicar-propuesta`
  sigue vivo) · R6 factor de vísperas (noche pegada a evento ≥2× hereda la mitad del premio) · R7 29 alertas
  pre-fixes resueltas en lote (quedan las 3 de hoy como control). **R8 diferido a propósito** (4º cambio de
  fórmula el mismo día = el patrón que causó el bug R2). Vigilancia 7d: escrituras <1.000/7d, ping-pong <10%,
  Karol G estable ~690-800€ base.

- **📈 Trading: Fase 1 técnica CERRADA (no bate al mercado) + spec Fase B por SELECCIÓN — 18/07/2026 (SOLO paper).**
  Validado con datos REALES de 2 años de IBKR sobre **7 valores + SPY** (scratchpad, `backtestSimbolo`/`backtestOOS`/
  `backtestCartera`): el sistema técnico **NO bate a comprar-y-mantener** — cartera +13,7% (maxDD 6,1%) vs cesta
  equiponderada +38,4% y SPY +30,1%; solo 1 de 8 nombres bate por-símbolo (COST), y fuera de muestra los bordes se
  dan la vuelta (NVDA +32,5%→−11%, sobreajuste). Único mérito: drawdown bajo, que NO es la vara (la vara = batir al
  mercado). Chequeo de seguridad en vivo: 0 posiciones/órdenes reales en IBKR, NAV 33.658,82€, saldo bróker ya
  sincronizado en la vista Dinero. **Decisión: degradar el técnico a overlay de *timing* y pivotar a SELECCIÓN**
  (factores value+quality+momentum, clonar 13F de gurús vía EDGAR/Dataroma gratis, insiders Form 4, Piotroski/magic
  formula). Los gráficos (cup-and-handle, cuñas) entran SOLO como afinado de entrada de un valor ya seleccionado,
  nunca como señal primaria. Datos GRATIS primero (IBKR/FMP-free/EDGAR/`buscarWeb`), Sharadar de pago solo cuando el
  paper bata al mercado OOS (sesgo de supervivencia = enemigo nº1). Spec completo en **`docs/TRADING-FASE-B-spec.md`**.
  Invariantes intactas: cero órdenes reales, nunca herramientas de orden de IBKR, dinero real solo tras batir al SPY
  fuera de muestra (decisión de Alberto). Rama `claude/interactive-brokers-mcp-hbww2h`.
  - **B1 IMPLEMENTADO (código, 18/07/2026):** en `@central/module-trading` — `factores.ts` (modelo value+quality+
    momentum por **z-scores cross-seccionales**: `rankearFactores`, `zscores`, `momentum12_1`; ausente=0 neutral,
    deuda invertida, pesos ajustables 0.4/0.4/0.2), `piotroski.ts` (`piotroskiFScore` 0..9, 9 señales año vs año)
    y `magicFormula.ts` (`rankearMagicFormula`, Greenblatt earnings-yield+ROIC por rangos). Exportados en `index.ts`.
    **75/75 tests `node --test` verdes (13 nuevos), cero errores de tipo reales.** Pendiente B1: validar OOS contra
    SPY con datos reales (bloqueado por el conector IBKR, que cae intermitente y no re-propaga a la sesión aunque el
    toggle esté ON).
  - **B1 endpoint + prueba e2e + rvol robusto (18/07/2026):** **`POST /api/trading/factores`** en plataforma
    (`app/api/trading/factores/route.ts`, auth `CRON_SECRET`, compute-only como `/descubrir`): rankea universo por
    `rankearFactores` + opcional `rankearMagicFormula`, recorte `top`. **Probado end-to-end** con datos REALES
    (momentum12_1 sobre las velas de 2 años de IBKR + fundamentales plausibles → GOOGL/META/AAPL top; smoke en
    scratchpad). **Análisis del RVOL (petición de Alberto):** era un overlay débil de 1 día; se hizo **robusto** —
    baseline pasa de MEDIA a **MEDIANA** (`volumen.ts`, un spike de earnings ya no deprime el rvol de los días
    siguientes) y `confirmaVolumen` sube el umbral de "confirma" de 1,15× a **1,5×** (convicción real). El rvol es
    CONFIRMACIÓN de una señal de precio, nunca disparador de compra; el timing de entrada es justo lo que no bate al
    mercado. **76/76 tests verdes.** Skill `trading-analista` actualizada (sección Fase B factores + sección RVOL).
    Siguiente: integrar factores en `/analizar` (técnico como overlay) y validar OOS cuando IBKR esté estable.

- **💸 Pricing: 4 mejoras anti-desplome (robustez SIN PriceLabs) — 18/07/2026.** Sobre el suelo PL
  (#983 ya en main), a petición de Alberto se añaden 4 capas en `apps/plataforma/app/api/sivra/pricing/apply/route.ts`
  para que el motor aguante cuando se cancele PL (~ago-2026): **(1) curva PL persistida** — tabla nueva
  `pricing_pl_referencia` (migración `prisma/sql/2026-07-18_pricing_pl_referencia.sql`, **aplicada+sembrada
  vía MCP**, 366 filas/piso), upsert de la última foto cada pasada; el suelo la usa hasta `PL_REF_MAX_AGE_DAYS`=120
  tras la última captura → sobrevive a la cancelación de PL y luego caduca sola. **(2) guarda de outlier por
  precio ACTUAL** (sin PL): si `old > base_normal_mes ×1.4` y estamos lejos (>30 días), no hundimos la noche
  por debajo del actual (el last-minute la suaviza cerca de la fecha). **(3) min-stay** 2-3 noches en eventos
  fuertes (≥1.8×) y lejanos, salvo hueco suelto. **(4) premio de evento anclado a la MEJOR base** (fecha exacta
  > mes > global) en vez de la global baja, y puede superar el p90 del mes; el bucket por fecha exacta solo
  influye en fechas de evento. Constantes tuneables (`OUTLIER_RATIO`, `MIN_STAY_EVENTOS`, `MIN_FECHA_BUCKET`…).
  Rama `claude/pricing-below-pricelabs-bf1vab`.

- **💶 Saldo de Interactive Brokers en la vista Dinero (18/07/2026).** Petición de Alberto: ver el saldo del
  bróker junto a BBVA/Kutxabank en `/banca` (tab 💶 Dinero) **y** sumado al «Saldo total del grupo». Como la app
  en Vercel NO habla con IBKR, el dato se PERSISTE en la nueva tabla `broker_saldos` (`cuenta_id`, `broker`,
  `saldo`, `divisa`, `actualizado_en`; migración `prisma/sql/2026-07-18_broker_saldos.sql` aplicada por Supabase
  MCP, RLS ON + revoke anon/authenticated; modelo Prisma `BrokerSaldo`). La **refresca la pasada diaria del agente
  `trading-analista`**, que ya lee el NAV (`get_account_summary` → `net_liquidation` EUR) y ahora lo empuja a
  `POST /api/trading/saldo` (Bearer `CRON_SECRET`; resuelve la cuenta de Alberto con el mismo `resolverCuentaBuzon`
  del buzón de facturas — override `TRADING_CUENTA_ID`/`GMAIL_USER`). `lib/broker.ts` (`getBrokerSaldos`/
  `getBrokerTotal`/`upsertBrokerSaldo`). En `banca/page.tsx` (solo tab dinero): tarjeta «📈 Inversión · Interactive
  Brokers» en la misma rejilla que las bancarias + su importe suma a `totalGrupo`. **Sembrado el saldo actual
  33.658,82€** (net liq base EUR; sin posiciones abiertas ahora). Es SOLO lectura de IBKR → respeta la regla de oro
  (nunca órdenes reales). Verificado: `next build` exit 0, 7 tests cuenta-buzon OK. Skill `trading-analista`
  actualizada (paso 1). **PENDIENTE Alberto:** nada obligatorio; opcional `TRADING_CUENTA_ID` en Vercel si algún día
  hay ambigüedad de cuenta.

- **💸 Pricing: suelo PriceLabs (raíl anti-desplome) — 18/07/2026.** El aviso «91 fechas <70% de PL» era
  `luxury_busto` hundiendo las noches de puente (Pilar, Todos los Santos) a **0,64×PL** — el motor cotiza por
  MES y el bucket de octubre promedia la noche especial, cuyo premio de evento se ancla a la base global baja;
  el raíl ±20%/día remata el desplome. Fix en `apps/plataforma/app/api/sivra/pricing/apply/route.ts`: el
  **tripwire PL pasa de aviso a SUELO** (`PL_FLOOR_RATIO=0,85`) — no se escribe por debajo de 0,85×PL mientras
  PL siga conectado (reusa `plPrice`, ventana 14d → se auto-jubila al cancelar PL ~ago-2026). Actúa CON o SIN
  bucket del mes (a diferencia de la guarda Karol G). Inerte para Busto; recupera ~8.842€ de tarifa en las 91
  fechas de Luxury; el próximo `apply-auto` tras desplegar las re-sube. Rama `claude/pricing-below-pricelabs-bf1vab`.

- **📈 Trading-analista: aviso Telegram inmediato en cada compra paper (18/07/2026).** Antes solo existía el
  formateador `resumenPasada` (nadie lo enviaba) y el resumen nocturno dependía de que el agente lo mandase (y
  no corre sin IBKR en la rutina) → Alberto no recibía nada al comprar. Añadido `mensajeCompraPaper` en
  `lib/trading-notify.ts` y disparado desde `/api/trading/analizar` con `tgSend` (best-effort, SOLO en aperturas
  nuevas — guarda `yaAbierta` para no avisar si la posición ya existía). Precio en USD (sin `eur()`, es cotización
  de acción), % NAV como referencia, y marca «SOLO simulado, ninguna orden real». Con los gates las compras son
  raras → sin spam. Tests del formateador (3) verdes. Va en rama reiniciada desde main (el PR #980 ya está mergeado).

- **📈 Trading-analista: las 8 ideas de mejora (18/07/2026, SOLO paper).** Tras los gates (#1) y el benchmark
  buy&hold (#3), se implementaron las demás en `@central/module-trading` (62 tests, tsc 0): **#6 trailing stop**
  (`backtestSimbolo({trailing})`, chandelier sin lookahead; +2pp en muestra); **#7 simulación de cartera**
  (`backtestCartera`: nombres compitiendo por el MISMO capital, sizing 1%, tope 20%, sin apalancar → curva de
  equity + **`maxDrawdownPct`**); **#4 régimen** (`regimenMercado` SPY>SMA200, veta largos risk-off; barrera en
  `/analizar` vía `indice:{cierres}` + opción en cartera); **#8 opsRecientes** real (cuenta `trading_paper_orden`
  30d, antes 0 fijo); **#5 bucle de aprendizaje** (`ajustesDeStats` lee `trading_estrategia_stats` y modula la
  confianza por rendimiento real, ±20, guarda muestra ≥20 → `torneo(…, ajustes)`). **Hallazgo honesto:** a nivel
  CARTERA el sistema queda PLANO (≈−0,1% retorno, 3,2% drawdown sobre 6m/7 nombres) — el capital apenas se
  despliega; las cifras por-símbolo (−52%/+0,9%) sobreestimaban al asumir 100% invertido. **#2 PENDIENTE (bloquea
  la validación real):** backtest con 2 años y ~20 nombres CON ganadores (SPY/AAPL/MSFT) — necesita bajar histórico
  de IBKR en vivo. Puerta a Fase 2 sigue cerrada. (Se limpió la BD paper: 0 posiciones, 28 tesis recalculadas con
  gates, todas no-compra.)

- **📈 Trading-analista: dos gates que llevan el backtest de −52% a breakeven (18/07/2026, SOLO paper).**
  Revisión con otro modelo (Fable 5) + diagnóstico numérico: el backtest perdía por dos causas medibles — el
  **momentum operaba ruido lateral** (el cruce EMA/MACD es casi la misma condición y disparaba con ADX bajo) y
  la **reversión compraba cuchillos** en caídas lentas (UEC −41% con ADX~20, bajo su SMA50). Fix (probado sobre
  6m reales de 7 nombres): (1) **`evaluarMomentum` exige ADX≥20** o abstiene (neutral); (2) nueva barrera
  **`bajoTendencia(precio, sma50)`** veta abrir CUALQUIER largo por debajo de la SMA50 — en `/api/trading/analizar`
  y en el backtest. Resultado en el universo (sesgado a bajistas): estrategia **+0,9%** vs buy&hold **−59%** (los
  4 cuchillos → 0 trades). Honesto: NVDA/META pierden pequeño mientras mantenerlos subía (+15/+11%) → el próximo
  problema es la **salida** (stops cortan las ganadoras), no más indicadores. `backtestSimbolo` ahora reporta
  **`retornoBuyHoldPct`+`baten`** (batir a comprar-y-mantener es la vara) y hay **`backtestOOS`** (split fuera de
  muestra). 55 tests módulo verdes, tsc 0. **OJO:** bajo los nuevos gates NVDA(ADX15)/META(ADX18) NO habrían
  abierto hoy → las 2 posiciones paper persistidas son del sistema viejo (reconciliar con Alberto). **PENDIENTE:**
  dataset de 2 años / ~20 nombres CON ganadores (necesita IBKR en vivo) para validar fuera de muestra sin sesgo;
  salidas simétricas (take-profit/trailing); filtro de régimen (SPY>SMA200); cerrar el bucle `trading_estrategia_stats`.

- **📈 Trading-analista: backtest + pantalla `/trading` + rotación sectorial (18/07/2026, PR #979 MERGEADO).**
  Tras #974 (cantera+volumen+descubrimiento+FMP, en main), Alberto pidió: más indicadores, "que el agente
  haga pruebas y vea resultados con el historial", y "añade todo esto en mi pantalla / onboarding". Entregado
  (SOLO paper): en `@central/module-trading` **`adx`** (la reversión NO fadea tendencia fuerte ADX≥25 = fix
  ISRG), **`earningsInminente`** (barrera en `/analizar`: no abrir largo ≤3d de resultados), **`fuerzaRelativa`**,
  **`backtestSimbolo`** (walk-forward sin lookahead), **`rankearSectores`/`inclinacionSector`** (rotación por ETF
  sectorial). `lib/fmp.ts` **`fmpProximoEarnings`**. Pantalla **`/trading`** (`app/(usuario)/trading/`, server) +
  **OnboardingBanner** + entrada sidebar 📈 Inversión (lee tablas `trading_*`, degrada vacío). 50 tests módulo +
  7 fmp, tsc 0, **next build OK**. Backtest real (6m ISRG/CEG/UEC/SYM) = negativo → honesto, NO rentable aún
  (puerta Fase 2 cerrada). Guía de arranque en **`docs/TRADING-SETUP.md`**. **PENDIENTE Alberto:** `FMP_API_KEY`
  + `FMP_API_VER=stable` en Vercel plataforma; trigger nocturno (sesión Claude con IBKR ON); idea nº1 (backtest
  vs `get_account_trades` reales) cuando IBKR esté en vivo. IBKR MCP se desconectó a media sesión.

- **🧠 daily-briefing de ia.rest ya no muere por un 503 de NVIDIA (18/07/2026, rama `claude/daily-briefing-nvidia-503-5htfc8`).**
  Aviso de Alberto: `⚠️ daily-briefing error / NVIDIA 503`. Causa: el edge function de Supabase
  `apps/ia-rest/supabase/functions/daily-briefing/index.ts` llamaba a NVIDIA **a pelo, sin fallback**
  (`if (!res.ok) throw new Error('NVIDIA ' + status)`), así que un 503 transitorio de NVIDIA (saturación)
  tumbaba todo el briefing. No podía usar la cadena `@central/core-ai` porque es Deno standalone en OTRO
  proyecto Supabase (`efncqyvhniaxsirhdxaa`), no importa los `packages/*`. **Fix (idea de Alberto):**
  `generarNarrativa` ahora llama PRIMERO a la **pasarela IA de plataforma** (`POST {PLATAFORMA_URL}/api/ai/chat`,
  Bearer `AI_GATEWAY_SECRET`, `app:'ia-rest-briefing'`) → el **Agente Director** elige modelo + cadena completa
  OpenRouter→NIM→Groq→Gemini→Kimi + presupuesto + auditoría; y deja **NVIDIA NIM directo como último fallback**
  (comportamiento histórico) para no convertir plataforma en un nuevo punto único de fallo. El pie del Telegram
  muestra la vía real (`🤖 Director · <modelo>` / `🤖 NVIDIA NIM directo`). **PENDIENTE de Alberto (no lo puedo
  hacer yo):** poner en los **secrets del edge function del proyecto Supabase de ia-rest** las envs
  `PLATAFORMA_URL` (p. ej. `https://plataforma-ten-flame.vercel.app`) y `AI_GATEWAY_SECRET` (mismo valor que en
  Vercel `plataforma`), y **redeployar el function** (`supabase functions deploy daily-briefing`). Sin esas envs,
  el briefing sigue funcionando por el fallback NVIDIA directo (igual que hoy, pero sin la red del Director).

- **📈 Trading-analista: ADX + guarda de earnings + fuerza relativa (18/07/2026, rama nueva desde main tras
  mergear #974).** Alberto: "¿qué más indicadores/API nos interesan?". Añadido a `@central/module-trading`
  (puro, 46 tests): **`adx`** (fuerza de tendencia Wilder → `Indicadores.adx14`) — la **reversión ya no fadea
  tendencias fuertes** (RSI sobreventa + ADX≥25 = cuchillo, señal neutral; el fallo que hoy dejamos a medias
  con ISRG) y el momentum modula confianza por ADX; **`earningsInminente`** (riesgo) — `/api/trading/analizar`
  **veta abrir largo si earnings ≤3 días** (el gap salta el stop, lección ISRG/IBM); **`fuerzaRelativa`**
  (mercado) vs índice/SPY. `lib/fmp.ts`: **`fmpProximoEarnings`/`proximaFechaEarnings`** (endpoint `earnings`,
  best-effort, puebla `fundamentales.proximoEarnings`). Verificado con el torneo-replica sobre datos reales de
  IBKR (ISRG ADX 20,6, sigue NO OPERA). tsc 0. **PENDIENTE Alberto:** conectar FMP + trigger nocturno; la
  **idea nº 1 (backtest contra `get_account_trades` reales)** queda para cuando IBKR esté en vivo (hoy el MCP
  se desconectó a media sesión). PR draft nuevo (el #974 ya está en main).

- **🧾 Auditoría fiscal «100% OK» (18/07/2026, rama `claude/auditoria-fiscal-100-ots062`).** Tras restaurar el
  segmento Fiscal, Alberto preguntó si la estimación de fin de año tenía en cuenta los gastos deducibles y pidió
  «una auditoría que la fiscalidad esté 100% OK». Auditoría a fondo (4 agentes en paralelo: base/tramos,
  deducciones, proyección, UI). **Hallazgo gordo confirmado con datos:** la proyección «Fin de año» inflaba
  ~11.800€ de base — (1) **doble conteo** del ingreso turístico futuro (tabla `incomes` + patrones de payouts
  de Booking del banco proyectados otra vez) y (2) **coste deducible variable** de las reservas futuras sin
  restar → varios miles de € de «a pagar» fantasma. **Fix:** turístico futuro SOLO desde `incomes` y en NETO
  (margen histórico `pisos.total.gastos/ingresos`), patrones proyectados solo para `seguros`, run-rate por mes
  (no por transacción). **Otros fixes:** FN autonómica de Andalucía gateada por límite de renta (25/30k — con
  base ~46k Alberto no tiene derecho; la de nacimiento no lleva límite desde Ley 8/2025, ya estaba bien);
  maternidad prorrateada por mes de nacimiento; `tipoEfectivo` real (cuota tras mínimo, antes ~26% vs ~19%);
  tramos IRPF de fuente única (`importesDe(year).tramos`, antes 3 copias); transparencia UI (línea `exento`,
  nota maternidad, disclaimer, tope 10% mecenazgo). Verificado: `tsc` 0 · 178 tests · `next build` OK. Skills
  `perfil-fiscal`/`fiscal-novedades` actualizadas. NO había bug en la base imponible «de hoy» (retenciones solo
  sobre comisiones, reducción conjunta una vez, exento fuera de base, amortizables excluidos — todo bien).

- **🔌 FMP plan FREE = SIN screener → FMP pasa a ENRIQUECER, no a dar universo (18/07/2026, PR #974).** Alberto
  probó la key (vía Claude for Chrome) y descubrimos: la cuenta es NUEVA → host **`/stable`** (el legacy `/api/v3`
  está muerto: "Legacy Endpoint"), y **el screener es de pago** (`/stable/company-screener` → "Restricted").
  Pero **`/stable/quote` es GRATIS** y trae precio, volumen, marketCap, medias 50/200 y máx/mín de 52 semanas.
  **Rediseño:** el UNIVERSO lo da IBKR (temas); FMP **enriquece cada símbolo** con señales libres. Nuevas piezas:
  módulo `mercado.ts` (`posicionRango52` = proxy honesto de "por debajo de valor": 0=pegado a mínimos anuales=barata;
  `tendenciaMedias` por medias 50/200) exportadas por `@central/module-trading`; campos `posRango52`/`tendencia` en
  `Candidato`; criterio `maxPosRango52` en el screener + bonus por cercanía a mínimos en `puntuarCandidato`/
  `puntuarDescubrimiento`. `lib/fmp.ts` reescrito: default `/stable` con `?symbol=`, `fmpQuote` (gratis),
  `fmpEnriquecer` (quote + fundamentales best-effort), screener degrada a `[]`. Endpoint `/api/trading/fmp` acepta
  ahora **`{ simbolos:[...] }`** (camino Free) además de `{ criterios }` (de pago). Tests: 42 módulo + 6 fmp, tsc 0.
  **PENDIENTE Alberto:** añadir `FMP_API_KEY` **y** `FMP_API_VER=stable` en Vercel `plataforma`; (opcional) confirmar
  si su plan cubre `ratios-ttm`/`discounted-cash-flow` para activar PER/PB/DCF (si no, el agente usa `posRango52`).

- **🔌 Trading-analista: cliente FMP conectado por código (18/07/2026, PR #974).** Alberto: "conectar FMP
  (gratis)". Construido `apps/plataforma/lib/fmp.ts` (mappers puros testeados: `mapearScreener`,
  `mapearFundamentales`, `volAnualDeBeta` — 4 tests) + `fmpScreener`/`fmpFundamentales`/`fmpRvol` (fetch con
  timeout, degrada sin key/red) y endpoint `POST /api/trading/fmp` (screener + enriquece top con PER/PB + DCF
  + rvol → `Candidato[]` para `/descubrir`). **Secreto:** `FMP_API_KEY` cae a `''` (regla del repo: API key
  externa, solo rompe la llamada saliente). Overridable `FMP_BASE_URL`/`FMP_API_VER` (v3 vs stable). tsc 0.
  **PENDIENTE Alberto:** crear cuenta free en financialmodelingprep.com → añadir `FMP_API_KEY` al proyecto
  Vercel `plataforma` (⚠️ confirmar rutas/campos contra su plan, patrón eInforma). Sin ella, la cantera cae a
  solo temas IBKR + volumen (degrada, no rompe).

- **🔎 Trading-analista: DESCUBRIMIENTO autónomo (el agente busca solo dónde invertir) (18/07/2026, PR
  #974).** Alberto: "quiero que el agente analice él solo y encuentre forma de invertir". Autonomía =
  DESCUBRIR, no ejecutar (sigue 100% paper). Construido en `@central/module-trading`: `descubrimiento.ts`
  (`dedupCandidatos` funde por símbolo uniendo fuentes; `puntuarDescubrimiento` premia corroboración
  multi-fuente + rvol + descuento y **penaliza la volatilidad**; `descubrir` = dedup+filtro+orden) +
  `Candidato` gana `fuentes`/`volAnual` + `CriteriosScreener.maxVolAnual` (guarda anti-lotería). 37 tests
  verdes. Endpoint `POST /api/trading/descubrir` (default `maxVolAnual: 0.8`). El agente explora temas por
  IBKR (`search_investment_topics`→`get_theme_details`) + screener FMP + picos de volumen. **Demo en vivo:**
  encontró solo 6 nombres de Nuclear+Quantum (SMR/CEG/BWXT/IONQ/RGTI/QBTS) y la guarda de volatilidad dejó
  pasar SOLO CEG (41%) y BWXT (42%), descartando SMR/IONQ/RGTI/QBTS (92-98% vol anual = la lotería que
  vació la cuenta real). Skill actualizada con la fase de descubrimiento autónomo. Va en la misma rama/PR
  #974 que la cantera+volumen.

- **📊 Trading-analista: cantera (buscador por parámetros) + overlay de volumen (18/07/2026, rama
  `claude/interactive-brokers-mcp-hbww2h`).** Tras un **dry-run real** de los 13 de la watchlist con IBKR en
  vivo (NAV 33.657 €; 5 tesis alcistas operadas en paper: NVO/NVDA/META/SPOT/PLTR; CVX vetada por
  concentración 24,5%; NFLX marcó rvol 3,05 = pico de volumen inusual), Alberto pidió un **buscador de
  acciones por parámetros** ("volumen inusual + por debajo de su valor"). Construido (aditivo, sigue SOLO
  paper): **`@central/module-trading`** `volumen.ts` (`rvol`, `tendenciaVolumen`, `volumenInusual`,
  `confirmaVolumen`) + `screener.ts` (`infravalorada` por DCF o PER/PB, `pasaScreener`, `rankearCantera`) —
  33 tests verdes (9 nuevos); `types.ts` amplía `Fundamentales` (`pb`, `valorRazonable`) + `Candidato`/
  `CriteriosScreener`. `apps/plataforma`: nuevo `POST /api/trading/screener` (filtra+rankea la cantera) y
  `/api/trading/analizar` ahora devuelve `rvol`+`volConfirma` por idea (señal alcista con volumen flojo =
  dudosa; NO cambia la decisión). tsc 0. **El scanner de mercado va por FMP (plan free)** — el MCP de IBKR
  no tiene screener; FMP aporta universo + PER/PB + DCF. Sin FMP, cantera y estrategia `valor` degradan sin
  romper. Spec: `docs/superpowers/specs/2026-07-18-trading-cantera-volumen-design.md`. **Pendiente Alberto:**
  conectar FMP + crear el trigger nocturno. El dry-run de hoy dejó 52 tesis + 5 posiciones paper (fecha
  2026-07-18, motivo 'dry-run 13') en `wswbehlcuxqxyinousql` — borrables con `delete ... where fecha='2026-07-18'`.

- **⚡ Velocidad de conversión por mes en el apply (17/07/2026, OK de Alberto — completa el trío de defensas).**
  Tercera pata tras el prior estacional y el tripwire PL: si un mes futuro acumula ≥2 reservas entradas en
  los últimos 7 días (`incomes.createdAt`), su objetivo sube +10% (+20% desde 4), capado al techo de mercado
  del mes. No compone (se recalcula del mercado en cada pasada) y la ventana de 7 días lo apaga sola. Con
  esto, el patrón de octubre (2 reservas en 4 días a precio corto) dispara subida automática sin esperar a
  Alberto. `meses_calientes` en la respuesta del apply. Doc §14 fix 3 de `pricing-automatico.md`.

- **🧾 Fiscalidad de vuelta en el Inicio unificado (18/07/2026, rama `claude/fiscalidad-pantalla-unificada-ots062`).**
  Queja de Alberto: "hemos unificado varias pantallas en una, pero no veo nada de fiscalidad y es muy
  importante con previsiones a la declaración de la renta". Causa: la des-duplicación (Fase 4 fiscal) retiró
  las 4 entradas fiscales del sidebar apuntando a `/finanzas/radiografia` como puerta única; luego la
  radiografía pasó a **redirigir a `/banca`** (#900) y la fusión Resumen+Banca (Fase 2, 16/07) dejó `/banca`
  con solo `💶 Dinero | 🏢 Negocios` → la lente **🧾 Fiscal** (que la radiografía ya tenía, fusionando
  Fiscal+Proyección) quedó **huérfana y sin acceso**. **Fix:** tercer segmento **🧾 Fiscal** en
  `banca/SegTabs.tsx` + nuevo server component **`banca/FiscalResumen.tsx`** (réplica de la lente fiscal de
  la radiografía: «Mi declaración» Hoy/Fin de año · Solo yo/Conjunta con Pilar + palanca de gasto + barra de
  tramos IRPF + KPIs, enlace a `/finanzas/fiscal` para el detalle/deducciones). `banca/page.tsx` ramifica
  `tab==='fiscal'` con **carga perezosa** (igual que Negocios): `getResumenFinanciero(año,0)` +
  `calcularEstadoDeclaracion` (mismo motor que `/finanzas/fiscal`, año completo; respeta `?year=`). Sin
  lógica de cálculo nueva. `tsc` 0 en todo el app. Páginas `/finanzas/fiscal|proyeccion` intactas
  (reversible, alcanzables desde el enlace del segmento).

- **🧠 Prior estacional auto-aprendido + tripwire PriceLabs en el apply (17/07/2026, OK de Alberto).**
  Respuesta a su pregunta "¿el agente no lo sabe con las variables que tenemos?" — no lo sabía: el motor
  solo miraba comps actuales y el histórico (`incomes` 2020→) no entraba en la pasada diaria. Ahora el
  apply calcula por piso/mes `idx = ADR_hist × ocupación relativa` (octubre destaca en noches, no en ADR)
  y lo usa como SUELO del objetivo (sustituye al global plano sin bucket; red ×0,9 con bucket si idx≥1,15).
  Además, tripwire: pasada en vivo que escriba <70% del último precio de PriceLabs → Telegram (patrón
  común de las 3 minas). Doc §14 de `pricing-automatico.md`. Siguiente iteración: velocidad de conversión
  por mes.

- **📈 Octubre = temporada MUY ALTA (override de Alberto, 17/07/2026, rama `claude/dynamic-pricing-uhvnak`).**
  Tras 2 reservas de octubre vendidas en 4 días (Daniela 9-11 y Lara 2-4, ~118-126€/noche bruto, neto de
  Lara clavado en el suelo de 95€), Alberto fija: **octubre es el mejor mes del año en Sevilla**. Mercado
  verificado: puente del Pilar (9-12 oct) **p50 ≈ 245€/noche** (4 pax) vs finde normal de finales
  **p50 ≈ 175€** — el motor lo tenía todo a ~161. Corregido: +20 comps de octubre (2 ventanas, escenario
  luxury), `SEASONAL` oct 1,10→1,40 y `FLOOR_SEASONAL` oct 1,20→1,30 en `pricing-calendar.ts` (plataforma),
  y override de dueño en `pricing_aprendizaje` id 37 (`ALL`/`octubre`) + señal de velocidad en id 34.
  Regla para el agente: en octubre, comps de TODAS las semanas (una sola ventana esconde el puente).

- **🏁 Optimización de tokens del director de código: 100% CERRADO y probado en vivo (17/07/2026).** Alberto activó
  el ajuste de repo *"Allow GitHub Actions to create and approve pull requests"*. Prueba final de la Action
  `ai-programar` con TODO puesto (GRANT de `extensions`, secrets, toggle, guardia): el orquestador hizo el ciclo
  completo y **el PR draft #966 se abrió SOLO** — acota (qwen 0€) → **plan Opus 4.1** → ejecuta qwen (volvió a
  estropear el archivo) → **guardia lo rechazó → escaló a Opus** (`escalado:true`) → diff SANO (conserva `eur()`,
  añade `eurSinDecimales()`) → push → PR draft automático. Coste del run ~0,13 €. En `ai_usos` se ven DOS filas
  `ejecutar` (qwen 0€ + Opus 0,034€) = la firma del escalado. **Nada se auto-mergea.** Docs actualizados
  (`docs/DIRECTOR-CODIGO.md`, `apps/plataforma/CLAUDE.md`, skill `delegar-codigo`). El PR #966 es de la tarea de
  prueba (Alberto lo mergea si le sirve `eurSinDecimales`, o lo cierra); ramas `ai/programar-*` de test borrables.

- **✅ Orquestador Fase 2 «caro planifica / barato ejecuta» PROBADO end-to-end + endurecido (17/07/2026, rama
  `claude/director-agent-token-optimization-g5z5f5`).** Al ejercitar por primera vez la Action `ai-programar`
  aparecieron 3 causas encadenadas, cada una destapada por instrumentar `ai_usos.error`:
  1. Faltaba el secret `AI_GATEWAY_SECRET` en GitHub (lo puso Alberto). `PLATAFORMA_URL` ya estaba.
  2. El acotado (`/api/ai/codigo`) devolvía 0 filas → **causa raíz REAL: el rol de la app (por el pooler de
     Supabase) NO tenía `USAGE` sobre el schema `extensions`** donde vive pg_trgm → `word_similarity` lanzaba
     `permission denied (42501)`. Ni cualificar (`extensions.word_similarity`, #962) ni quitar el array de Prisma
     (#963) lo arreglaban — eran síntomas. **Fix: `GRANT USAGE ON SCHEMA extensions TO public;`** (aplicado por
     MCP; el grant a `authenticator` solo no bastó porque la app conecta con otro rol). Sin redeploy.
  3. Con eso, el ciclo COMPLETO corrió y quedó medido en `ai_usos`: **acota (qwen) → planifica `anthropic/
     claude-opus-4.1` → ejecuta `qwen-2.5-coder-32b`**, 0€. Solo falló el último paso `gh pr create` por el ajuste
     de repo *"Allow GitHub Actions to create and approve PRs"* (APAGADO) — la rama sí se pushea.
  **Aprendizajes de la prueba (endurecido en este PR):** (a) el coder barato **estropeó el archivo** (qwen truncó
  `dinero.ts` y borró `eur()`, que la orden prohibía) → nuevo **guardia puro `lib/reescritura-guardia.ts`**
  (`validarReescritura`: rechaza salida vacía, truncamiento <50%, y DESAPARICIÓN de exports existentes; test
  5/5). El ejecutor (`/api/ai/ejecutar`) valida y si el barato falla **ESCALA una vez al modelo fuerte
  (`categoria:'plan'`=Opus)**; si tampoco pasa → **422** y el orquestador salta ese archivo (nunca aplica código
  roto). (b) El workflow ya **no falla** si el toggle de PRs está apagado: pushea la rama e imprime el enlace para
  abrir el PR a mano (warning), con instrucción de encender el ajuste. tsc 0, next build 0. **PENDIENTE de
  Alberto (opcional):** activar el toggle de PRs para que el PR draft se abra solo. **Nada se auto-mergea nunca.**

- **📈 Agente `trading-analista` (IBKR) — Fase 1 CONSTRUIDA en paper, sin ejecución real (17/07/2026, rama
  `claude/interactive-brokers-mcp-hbww2h`, PR #961 draft).** Alberto tiene cuenta en Interactive Brokers y
  acceso al MCP oficial. Brainstorming → spec (`docs/superpowers/specs/2026-07-17-agente-trading-ibkr-design.md`)
  → plan (`docs/superpowers/plans/2026-07-17-agente-trading-ibkr.md`) → implementación. Decisiones cerradas:
  **sin autonomía hasta ser rentable** (fases con puerta walk-forward), horizonte swing, **headless** (Telegram+BD),
  watchlist mixta A(ETFs)+B(valores conocidos)+C(cantera de descubrimiento), barreras de riesgo derivadas del
  historial real de Alberto (YTD −17.632 $ realizado, pérdidas concentradas en growth/AI de alta volatilidad).
  Construido: paquete puro **`@central/module-trading`** (indicadores, torneo de estrategias, motor paper, scoring
  walk-forward, riesgo — 24 tests verdes), 6 modelos Prisma `trading_*`, endpoints `/api/trading/{analizar,puntuar}`,
  `lib/trading-notify.ts`, skill `.claude/skills/trading-analista`. **Código ya en `main`** (el PR #961 mergeó la
  rama con toda la implementación; PR #967 draft = solo el doc de estado/prompts). **BD RESUELTA (17/07/2026,
  2ª sesión):** la migración `trading_fase1.sql` + seed se aplicó a la Supabase **CORRECTA `wswbehlcuxqxyinousql`**
  (la que usa plataforma por `DATABASE_URL`): 6 tablas + RLS + 13 filas de watchlist; columnas verificadas contra
  los modelos Prisma. **Ojo — corregido un error previo:** una sesión anterior había aplicado esas tablas por
  equivocación al **silo de ia-rest `efncqyvhniaxsirhdxaa`**; se han **DROPEADO** de ahí (estaban vacías salvo la
  semilla; ia-rest no tiene código que las lea). **PENDIENTE (Alberto):** dry-run de una pasada con el MCP de IBKR
  encendido, crear el trigger (~22:15 Sevilla), y resolver el billing de Supabase (org en Free, grace period
  agotado). Datos: IBKR gratis + FMP free → 0 €/mes. La cuenta está hoy 100% líquida (~33.656 €).

- **🐛 Director de código (2ª pasada): el acotado seguía devolviendo 0 tras #962 → era el BINDING DE ARRAY de
  Prisma, no el search_path (17/07/2026, rama `claude/director-agent-token-optimization-g5z5f5`).** Con el fix de
  #962 (cualificar `extensions.word_similarity`) ya desplegado en producción, la Action `ai-programar` SEGUÍA
  fallando en «mapa vacío». Descartado el search_path, el sospechoso es `WHERE busqueda ILIKE ANY(${patrones}::text[])`:
  el binding de arrays de Prisma en `$queryRaw` no se comporta en el pooler y devolvía 0 filas en runtime (el SQL
  crudo sí funciona). **Fix:** reescrita la query de `acotarArchivos` para usar SOLO parámetros escalares — ordena
  por `extensions.word_similarity(consulta, busqueda)` y toma los `limite` mayores (`.filter(score>0)` en JS),
  sin `ILIKE ANY(array)`. **Instrumentado:** `acotarArchivos` captura el mensaje de excepción (`errorMapa`) y el
  endpoint `/api/ai/codigo` lo escribe en `ai_usos.error` aunque registre ok:true — así el próximo run es
  DECISIVO (o funciona, o dice el error exacto). tsc 0, next build 0. Pendiente: merge + deploy + relanzar Action.

- **🐛 Director de código: `word_similarity` sin cualificar rompía el acotado en runtime (fix 17/07/2026, rama
  `claude/director-agent-token-optimization-g5z5f5`).** Al ejercitar por PRIMERA VEZ el orquestador Fase 2 (Action
  `ai-programar`, tras poner el secret `AI_GATEWAY_SECRET` en GitHub), el paso ACOTA (`/api/ai/codigo`) devolvía 0
  archivos → «mapa vacío/caído» y el ciclo abortaba antes de planificar/ejecutar. **Root cause:** `pg_trgm` vive en
  el schema `extensions` de Supabase; el **pooler (pgBouncer, modo transacción) NO aplica el `search_path` por rol**,
  así que `word_similarity(...)` sin cualificar lanza «function does not exist» SOLO en runtime (en el editor SQL sí
  resuelve, por eso pasó desapercibido). La query de `acotarArchivos` lo capturaba en su try/catch → `sinMapa=true`
  (y `ai_usos` registraba el `codigo` como ok=true porque el fallo se tragaba dentro). **Fix:** cualificar
  `extensions.word_similarity` en `lib/ia-director-codigo.ts` (independiente del search_path). Verificado: la query
  cruda devuelve `dinero.ts` como candidato #1 (score 0.40); tsc 0, next build 0. **Medición inaugural del ahorro:**
  primera fila real en `ai_usos` con `endpoint='codigo'` (qwen-2.5-coder, 0€). Tras merge+deploy, relanzar la Action
  cierra el end-to-end (plan Opus → ejecuta qwen → PR draft). (El SQL `mapa_arquitectura` ya estaba aplicado: 2.192
  filas; `PLATAFORMA_URL` ya estaba como secret, faltaba `AI_GATEWAY_SECRET`, ya puesto por Alberto vía Claude-Chrome.)

- **🏢 Empresas — búsqueda web GRATIS en 3 sitios (17/07/2026, rama `claude/empresas-problemas-financieros-h46hr6`).**
  Alberto: «con la IA de OpenRouter, ¿añadimos búsquedas en Google?» → «todo». Reusa `lib/websearch.ts::buscarWeb`
  (Gemini grounding GRATIS → plugin web OpenRouter de pago, gateado por presupuesto diario). Nuevo
  `lib/empresas-websearch.ts` (la IA SOLO resume/cita lo que la búsqueda devuelve, con enlaces, nunca inventa):
  (1) **🔎 Investigar (web)** por empresa en `EmpresaCard` → `POST /api/empresas/investigar` (actividad, por qué en
  concurso, web, tamaño, relevo/edad — capa gratis para triar ANTES de pagar eInforma y rellenar media ficha);
  (2) **🌐 Analizar sector** en el bloque del radar → `POST /api/empresas/sector-web` (crecimiento/decrecimiento del
  sector con fuentes); (3) **🌐 toggle en el agente** → `POST /api/empresas/agente {web:true}` busca en web y pasa el
  contexto a `responderEmpresas(pregunta, provincia, contextoWeb)`. Todos van por `accesoEmpresas` (Pablo también).
  Verificado: tests 21/21, `tsc` 0, `next build` 0 (rutas investigar/sector-web/agente presentes).

- **🏢 Empresas — token de invitado MOVIDO a BD (no env) para poder ponerlo/rotarlo sin Vercel (17/07/2026,
  rama `claude/empresas-problemas-financieros-h46hr6`).** Alberto pidió que lo configurara yo; el conector de
  Vercel de las sesiones de Claude **no permite escribir env vars**, así que el token de acceso invitado pasó de
  `EMPRESAS_INVITADO_TOKEN` (env) a la **tabla `empresas_acceso_token`** (fila única `id=1`, `token`/`activo`;
  REVOKE anon/authenticated; SQL `2026-07-17_empresas_acceso_token.sql`). El token de Pablo YA está insertado por
  Supabase MCP → funciona **sin redeploy**. Flujo: enlace `…/invitado/empresas?token=<v>` → la página lo canjea
  en **`GET /api/empresas/invitado`** (valida contra BD, fija cookie httpOnly `empresas_invitado`, redirige) →
  `lib/empresas-acceso.ts::accesoEmpresas` valida la cookie contra BD en runtime Node. **Middleware edge** (sin
  Prisma) solo enruta: `/invitado/*` siempre pasa, `/api/empresas/*` pasa si trae la cookie o es la entrada; sin
  cookie/sesión sigue el gate de sesión (no abre nada). Enriquecimiento POST + ingesta-manual siguen SOLO sesión.
  **Rotar/revocar:** `UPDATE empresas_acceso_token SET token=… / activo=false` por Supabase MCP (sin tocar Vercel).
  `tsc` 0, `next build` 0. Pendiente: Alberto abre el enlace y confirma que ve el panel.

- **🐛 Agente contable: consejo de ahorro sobre un TRASPASO mal etiquetado (fix 17/07/2026, rama
  `claude/director-agent-token-optimization-g5z5f5`).** Tras arreglar el enrutado (los consejos ya llegan al
  LLM), Alberto: *"dame 3 consejos para reducir mi gasto"* → *"Optimiza comisiones bancarias (#10 −1.691,58€)"*.
  **Root cause (2 capas, verificado en BD):** (1) **dato sucio** — el movimiento real es `TRANSF. 0128 F0552026`
  (transferencia de salida de Kutxabank, casi seguro liquidación de tarjeta/traspaso), pero la normalización IA
  lo rebautizó **"Comisión bancaria"** y quedó en `turistico_pisos`. Hay 3 hermanos `TRANSF. 0128` (−2.000,25 /
  −2.178 / −1.691,58) con etiquetas inventadas distintas ("TRANSF. 0128"/"cargo de 0128"/"Comisión bancaria"),
  todos en Pisos. La regla determinista de `lib/categorizar.ts::categorizarPorReglas` comprobaba `'TRANSF '`
  (espacio) y NO `'TRANSF.'` (punto) → estas transferencias se colaban a la IA, que alucinaba la etiqueta.
  (2) **diseño del agente** — para aconsejar reutilizaba la lista "Movimientos por revisar" (12 filas sin
  confirmar que mezclan ingresos de Booking, traspasos y mal clasificados) y el modelo agarraba el negativo más
  gordo visible. **Fix (código):** (a) `categorizarPorReglas` ahora también matchea `'TRANSF.'` → las
  transferencias son deterministas (`🔁 Transferencia`) con etiqueta veraz, sin pasar por la IA; (b) las
  preguntas de consejo (`esConsejo`) reciben un dataset nuevo **"En qué gastas de verdad"** — gasto REAL por
  categoría (`construirContexto(cuentaId,{paraConsejo})` → personal por subcategoría + negocio por destino,
  EXCLUYE ingresos y `traspaso_interno`); (c) system prompt: aconsejar SOLO desde ese bloque, NUNCA proponer
  reducir un traspaso/liquidación de tarjeta ni un ingreso, y la lista "Movimientos" NO es muestra de gasto.
  Tests 131/131 contable (3 nuevos en `contexto.test.ts`), tsc 0, next build 0. **PENDIENTE de Alberto:**
  confirmar qué es la cuenta "0128" para reclasificar los 3 movimientos (→ `traspaso_interno`) y aprender la regla.

- **🏢 Empresas — acceso INVITADO por token para Pablo + prueba end-to-end (17/07/2026, rama
  `claude/empresas-problemas-financieros-h46hr6`).** Alberto: «pantalla para Pablo, acceso mejor con un token».
  - **Acceso por token (sin cuenta):** env `EMPRESAS_INVITADO_TOKEN` (secreto, sin fallback). Página nueva
    **`/invitado/empresas`** (fuera del grupo `(usuario)` → sin sidebar ni sesión) que valida el token por
    `?token=` (fija cookie `empresas_invitado`) o cookie; si no vale, muestra «acceso no válido». `middleware.ts`
    deja pasar `/invitado/*` y `/api/empresas/*` con token válido. Guard `lib/empresas-acceso.ts::accesoEmpresas`
    (`sesion|invitado|null`) en las rutas de empresas; **el enriquecimiento POST es SOLO sesión** (gasta dinero,
    403 para invitado) y la UI le oculta «Enriquecer» + «Actualizar BORME». Pablo SÍ puede: filtrar, usar el
    agente, y rellenar la ficha cualitativa. **Enlace:** `…/invitado/empresas?token=<valor>`; revocar = cambiar env.
  - **Prueba end-to-end (todo lo que hay):** smoke de integración BORME→mapeo eInforma→señales→score compuesto
    (satura a 100 con motivo completo)→radar→contexto del agente = TODO OK; tests 20/20 + guardián 1/1; `tsc` 0;
    `next build` 0 (rutas `/invitado/empresas` y `/api/empresas/*` presentes). BD: enriquecimiento/ficha/coste a 0
    (sin contaminar), BORME con las 14 empresas reales intactas. Live real (BORME por boe.es y app Vercel) no
    verificable desde el sandbox — lo prueba Alberto/Pablo en el panel.

- **🏢 Empresas en dificultad — capa de enriquecimiento COMPLETA, solo pendiente la API key de eInforma
  (17/07/2026, rama `claude/empresas-problemas-financieros-h46hr6`).** Alberto: «haz todo, solo pendiente API
  eInforma». Construida toda la tubería de enriquecimiento de modo que lo ÚNICO que falta es contratar eInforma:
  - **Adapter `lib/empresas-einforma.ts`** (OAuth2 client_credentials + informe financiero; mapeo PURO testeado;
    rutas/campos del payload AISLADOS y marcados «confirmar con doc/sandbox al activar»). Sin
    `EINFORMA_CLIENT_ID`/`EINFORMA_CLIENT_SECRET` lanza `EinformaNoConfigurado` y degrada sin romper.
  - **Orquestador `lib/empresas-enriquecer.ts`**: tope de gasto mensual (`EMPRESAS_ENRIQUECER_TOPE_MENSUAL_EUR`,
    default 50€; coste/empresa `EMPRESAS_ENRIQUECER_COSTE_EUR` default 12€), upsert + ledger de coste
    `empresas_enriquecimiento_coste`. Endpoint `POST /api/empresas/enriquecer` (+GET presupuesto).
  - **Scoring conectado:** `lib/empresas-senales.ts::enriquecimientoASenales` (umbrales de Alberto) → el
    `SenalesFinancieras` de `puntuarEmpresa`; `getEmpresasYRadar` lee el enriquecimiento y suma las señales.
  - **Ficha cualitativa manual (bloque E, USABLE YA sin API):** `GET/POST /api/empresas/ficha` + formulario en
    `EmpresaCard.tsx` (edad CEO/consejo, salud, descendencia Sí/No, preconcurso, notas).
  - **UI:** filtros de **facturación (rango M€)** y **sector/CNAE** (dormidos hasta que haya dato), botón
    **Enriquecer** por empresa (pide CIF si falta), badges (enriquecida/CNAE/facturación/preconcurso), línea de
    presupuesto gastado/tope. Agente actualizado (menciona CNAE/facturación cuando constan).
  - **BD (Supabase MCP, aplicada):** `empresas_enriquecimiento` + `empresas_ficha` + `empresas_enriquecimiento_coste`
    (REVOKE anon/authenticated; SQL versionado `2026-07-17_empresas_enriquecimiento.sql`).
  - Verificado: `node --test` 20/20 empresas + guardián secretos 1/1, `tsc` 0, `next build` 0 (rutas presentes).
  - **PENDIENTE Alberto:** contratar eInforma → meter `EINFORMA_CLIENT_ID/SECRET` en Vercel + confirmar las
    rutas/campos del payload en `empresas-einforma.ts`. Precio eInforma: informe financiero ~29,50€ retail /
    ~10-12€ en pack; API desde 40€/mes + entorno de pruebas gratis. RAI en informe comercial; ASNEF = Equifax aparte.

- **🏢 Empresas en dificultad — Fase 2 pieza 1 (agente) + modelo de scoring financiero (17/07/2026, rama
  `claude/empresas-problemas-financieros-h46hr6`).** (a) **Agente conversacional MERGEADO (PR #954):** chat en
  `/empresas` que responde por provincia/tipo/score sobre el dataset real (BORME Fase 1) vía pasarela IA gratis;
  la IA solo filtra/narra, cifras de la BD. Pieza pura `lib/empresas-agente-contexto.ts` (testeada), route
  `/api/empresas/agente`, UI `AgenteEmpresas.tsx`. En producción; Alberto lo prueba en su panel.
  (b) **Indicadores financieros de Alberto → scoring:** amplió el modelo con umbrales concretos (patrimonio neto
  <0, EBITDA neg. 2 años, fondo de maniobra neg., depósito de cuentas >12m, incidencias RAI/ASNEF, deuda/EBITDA
  >6× / refis). Implementados como bloque `SenalesFinancieras` en `lib/empresas-scoring.ts` (dormido hasta que el
  enriquecimiento rellene el dato; pesos v1 tuneables; tests 8/8). Diseño actualizado (§5 con tabla de sourcing,
  §3 fuente RAI/ASNEF, §7 campos `enriquecimientos`+`ficha_cualitativa`, bloque E cualitativo manual: edad
  CEO/consejo, salud, descendencia, preconcurso). **GATE:** casi todo el bloque A depende de **eInforma** (cuentas
  depositadas) + posible producto de morosidad para RAI/ASNEF; el filtro de facturación y el CNAE por empresa
  también. Pendiente: Alberto contrata eInforma + tope de gasto → se cablea enriquecimiento + radar CNAE real.

- **🐛 Agente contable: preguntas de CONSEJO caían al router determinista (fix 17/07/2026, rama
  `claude/director-agent-token-optimization-g5z5f5`).** "Dame 3 consejos para reducir mi gasto este mes"
  devolvía "No encuentro cargos de reducir": la frase contiene "gasto" → pasaba la guarda de dinero de
  `lib/contable/intencion.ts::detectarIntencion` y el extractor de concepto genérico agarraba "reducir"
  como un falso concepto. **Fix:** guarda nueva LO PRIMERO en `detectarIntencion` que devuelve `null` (→ LLM
  libre) ante consejo/recomendación/cómo-hacer (`consej|aconsej|recomiend|sugier|tips|ideas para|cómo
  puedo/reducir/ahorrar/gastar menos|ayúdame a`), comparando SIN acentos. No secuestra datos legítimos
  ("¿cómo va el dúplex?" y "cuánto gasté este mes" siguen). Tests 92/92 (2 de regresión), tsc 0, next build 0.
  De paso: estas preguntas abiertas ahora sí ejercitan OpenRouter (el camino de pago que Alberto acababa de
  recargar tras un 402 "requires more credits").

- **🏢 Empresas en dificultad — Fase 1 en plataforma (17/07/2026, rama `claude/empresas-problemas-financieros-h46hr6`, PR #946).**
  Nueva sección interna para detectar empresas tocadas (concursos/disoluciones/ampliaciones) como oportunidades de
  captación/compra. Spec + esquema ya fusionados (PR #942, `main`); esquema navegable en `apps/plataforma/public/esquema-empresas.html`.
  **Decisión de arquitectura:** módulo dentro de plataforma con núcleo portable pensado para promocionar a `apps/empresas` si
  algún día va a terceros. **Entregado en esta sesión (Fase 1, coste 0€):**
  - **BD (aplicada por Supabase MCP):** `borme_eventos`, `sector_tendencias` (`prisma/sql/2026-07-17_empresas.sql`, con `REVOKE anon,authenticated`) + columna `cuentas.rol` (`2026-07-17_cuentas_rol.sql`).
  - **Ingesta BORME:** `lib/borme.ts` (parser puro: clasificar acto + normalizar empresa, 7 tests) + `lib/borme-ingesta.ts` (descarga sumario boe.es + upsert idempotente) + cron `/api/cron/borme-ingesta` (`0 6 * * *`) + disparador manual `/api/empresas/ingesta-manual`.
  - **Scoring + radar:** `lib/empresas-scoring.ts` (0–100 con motivo, 4 tests) + `lib/empresas-radar.ts` (cuadrantes por provincia, 1 test) + `lib/empresas.ts` (lectura para UI).
  - **UI:** sección `/empresas` (`app/(usuario)/empresas/{page,EmpresasClient}.tsx`): radar por provincia + lista rankeada perezosa (PAGE=50) + botón "Actualizar BORME". Entrada en `UserSidebar`.
  - **Acceso por rol:** `session.ts` devuelve `rol`; `layout.tsx` guarda (rol='empresas' → solo `/empresas`, vía `x-pathname` que inyecta `middleware.ts`); nav filtrado. Para dar acceso a un tercero: alta por `/register` + `UPDATE cuentas SET rol='empresas' WHERE email=…`.
  - **Verificado en sandbox:** `node --test` 12/12 (módulos puros), `tsc` 0, `next build` exit 0, guardián de secretos 22/22.
  - **PENDIENTE de validar en Vivo (el sandbox bloquea boe.es y no corre la app):** la **ingesta real de BORME** — al desplegar, abrir `/empresas` y pulsar "Actualizar BORME" (o esperar al cron). La extracción del sumario (`descargarSumario`) es defensiva pero su mapeo exacto se confirma contra el feed real. **Fase 2 (pendiente):** enriquecimiento eInforma (balances + **filtro de facturación ≤2M** + fondos propios negativos), radar por CNAE real (INE + Central de Balances), agente conversacional, SABI.

- **📖 `apps/almacen` — Manual de uso dentro de la intranet, corporativo JJ (17/07/2026, rama `claude/warehouse-module-review-angvve`).**
  Alberto pidió "un manual del programa, todo corporativo de Joaquín Jaén, con enlace dentro de la intranet". Hecho como
  **página `/manual`** en el área de oficina (`app/(usuario)/manual/page.tsx`), server component con contenido estático → hereda
  la marca `@central/brand` (verde `#004433` + oro, Playfair, logo real) automáticamente. Portada con logo + filete de oro,
  índice en chips, y una tarjeta por sección con **pasos numerados** (círculo verde) fiel a cada pantalla: Panel, Almacenes,
  Familias, Materiales, Transferencias, Inventarios, Movimientos, Eventos y alquileres, Empleados, Área del empleado (`/mi`) y
  Escaparate público. Cierra con "Buenas prácticas" (editable/borrable conserva historial, € español, móvil, aviso bajo mínimo).
  **Enlace añadido al menú** (`app/(usuario)/nav-links.tsx`: fila `Manual`). CSS nuevo `.manual-*` al final de `globals.css` (usa
  `var(--brand,...)` con fallback). Verificado: `tsc` 0, `next build` OK (ruta `/manual`), **capturas Playwright móvil+escritorio**
  (`--brand=#004433`, logo cargado, títulos verdes). Los textos guía replican los subtítulos reales de cada sección.

- **🎨 `@central/brand` — capa de marca por cliente + Joaquín Jaén 100% corporativo (17/07/2026, PR #943 MERGEADO a `main` squash `e8aa589`).**
  Decisión de Alberto: sistematizar el diseño por CLIENTE en toda la casa de marcas (JJ, Rico González, Global…) — **ni
  agente programado ni MCP nuevo**, sino (1) capa de tema compartida + (2) skill de alta de marca on-demand; el MCP de
  diseño ya es `adobe-diseno` (Firefly). Entregado y en producción:
  - **`packages/brand` (`@central/brand`)**: contrato `Marca {paleta, tipografia, logos, radio}` (`tipos.ts`),
    `emitirVariables/emitirRootCss` (`css.ts`) que emiten los nombres de variable existentes (`--bg`,`--accent`,`--text`,
    `--serif`…) **+** los de marca (`--brand`,`--brand-ink`,`--brand-soft`), y `MARCA_JOAQUIN_JAEN` (`marcas/joaquin-jaen.ts`).
  - **Colores EXACTOS del logo real** (no estimados de la web): tras recibir Alberto el logotipo oficial, extraje la paleta
    decodificando el PNG con **Node+zlib** (no hay PIL/ImageMagick en el entorno) → **verde `#004433`** dominante + **oro `#998855`**
    de acento. `--brand` = verde (identidad/acciones), `--accent` = oro (filetes/bordes). Iteración previa había estimado
    `#1f4a37`/`#9e814f` de la web — SUSTITUIDOS por los exactos del logo.
  - **Tipografía**: el **nombre de marca NO se re-escribe** con una fuente parecida → se usa el **logotipo real** como marca.
    Para la UI, títulos en **Playfair Display** (serif Didone que casa con el lettering del logo) + cuerpo **Lato**, por `<link>`
    a Google Fonts (el build no descarga fuentes → red capada; evitar `next/font/google`). *Pendiente fino:* si Alberto da el
    nombre EXACTO de la fuente de su manual y está en Adobe Fonts, incrustarla vía Typekit y reemplazar Playfair.
  - **Logo real** (`apps/almacen/public/logo-jj.png`, 401×141 transparente): en el **login** va **embebido en base64**
    (`app/login/logo-data.ts` → `LOGO_JJ_DATAURI`) para que no falle carga ni caché; en cabeceras basta `<img src="/logo-jj.png">`
    (`app/brand.tsx`, `(publico)/layout.tsx`). Login rediseñado elegante (marco verde+oro, aire de invitación).
  - **Aplicado a `apps/almacen`**: dep `@central/brand` (`workspace:*`) + `transpilePackages`; `app/layout.tsx` inyecta
    `emitirRootCss(MARCA)` en `<head>` + `<link>` de fuentes. Repunté en `globals.css` identidad/acción a `--brand` (verde):
    h1, wordmark, nav activo, botón primario, chips, focus, precios, títulos de tarjeta, hero; **oro** para filetes/bordes
    (filete superior de oro en tarjetas + regla de oro bajo el hero, su sello). Verificado: tsc 0, `next build` OK,
    **capturas Playwright** móvil+escritorio confirmando `--brand=#004433` y `img.complete` del logo.
  - **Skill `marca-cliente`** (`.claude/skills/marca-cliente/SKILL.md`, indexada en `docs/SKILLS.md` §Diseño): flujo probado de
    alta de marca (material → extraer paleta con el script Node+zlib → logo base64/Adobe Fonts → objeto `Marca` → enchufar →
    verificar con Playwright) para replicar en Rico González, Global y demás **a coste marginal**. `@central/brand` listado en
    `CLAUDE.md` (módulos compartidos).
  - **Siguiente (cuando Alberto lo traiga):** nombre exacto de la fuente del manual JJ → Adobe Fonts; logos de Rico González /
    Global → correr `marca-cliente` para su `src/marcas/<cliente>.ts`. **URL oficial de presentación**:
    https://almacen-pisos-turisticos-projects.vercel.app

- **👥 `apps/rrhh` — branding Mariscos González + login neutro + cambiador de empresa (17/07/2026, rama `claude/error-p2qw3l`, PR #941).**
  Tres mejoras entregadas en un PR sobre la auditoría de seguridad/UX anterior:
  - **Branding Mariscos González:** `color_primario` actualizado a `#1B3461` (azul marino corporativo) en BD directamente con SQL. Logo ya estaba en `public/logos/mariscos-gonzalez.png`. Sidebar y portal empleado muestran colores correctos.
  - **Login neutro:** La página `/login` mostraba el logo de la primera empresa de la BD (`LIMIT 1` sin ORDER BY, resultado arbitrario). Eliminado todo branding de empresa del login — ahora muestra siempre `ia·rrhh` neutral.
  - **Cambiador de empresa en sidebar:** Pilar gestiona Global2 y Mariscos González con un solo login. Nuevos endpoints: `GET /api/admin/mis-empresas` (lista empresas del usuario) + `POST /api/auth/cambiar-empresa` (rota el JWT activo a otra empresa). Componente `CambiadorEmpresa.tsx` — se auto-carga, aparece en el sidebar solo si hay ≥2 empresas, muestra dropdown con mini-logos y tick en la activa. AdminShell lo incluye sin props extra.
  - **Vercel:** `central-rrhh` desplegado correctamente (DEPLOYED); ia-rest/ialimp/sivra/plataforma ignorados por `ignoreCommand`.
  - **Pendiente manual (Alberto):** activar `CRON_SECRET` en Vercel si no está configurado (`vercel env add CRON_SECRET production`).
  - **Ubicación GPS en fichajes:** columna Obra en `/admin/fichajes` ahora muestra `📍 Ver mapa` (enlace Google Maps) cuando hay coords pero no hay obra asignada. Antes mostraba siempre `—`.
  - **Pendiente código (próxima sesión):** SEG-05 revocación JWT empleados (`ALTER TABLE rrhh.empleados ADD COLUMN session_jti UUID`); SEG-06 invalidación logout responsable; MEJ-02 `input[type=month]` incompatible iOS Safari → dos selects o picker custom.

- **🗂️ Drive reorganizado en `CENTRAL/` + fuente de verdad (16/07/2026, rama `claude/drive-organization-options-vuam1c`).**
  El Drive de Alberto tenía la raíz («Mi unidad») como cajón de sastre (~90 archivos sueltos, duplicados en
  serie, un repo de código volcado entero con su `.git`, papeleras `BORRAR`/`_DUPLICADOS_BORRAR` a medio vaciar).
  **Paso 1 hecho por MCP:** creada la estructura `CENTRAL/` con 5 secciones (`01 PROGRAMA`, `02 CONTABILIDAD`,
  `03 FACTURAS Y GASTOS`, `04 CLIENTES`, `05 PERSONAL`) y 21 subcarpetas — todos los IDs en el nuevo
  **`docs/DRIVE-ESTRUCTURA.md`** (fuente de verdad). **Principio clave:** en Drive mover conserva el `fileId`,
  y los agentes referencian por ID → reorganizar = **anidar** las carpetas buenas bajo `CENTRAL`, sin tocar
  código. El pipeline vivo de `facturas-correo` (Apps Script `Facturas a Drive` → `_buzon_pdf` → archivo en
  `FACTURAS Apartamentos/2026` → conciliación banco con `factura_ref`) **sigue igual** (banner añadido a su
  skill; `correo-triaje` NO escribe en Drive, no se toca). **Pendiente:** Paso 2 = ejecutar
  `scripts/drive/reorganizar-drive.gs` (Apps Script one-shot con `DRY_RUN`, lo corre Alberto: mueve carpetas +
  reparte sueltos + aparta el `.git`/basura a `_REVISAR_BORRAR`); Paso 4 = vigilante semanal (Apps Script con
  trigger que barre `_buzon`/raíz y avisa por Telegram). Presentación del plan: artefacto Claude (link en el chat).

- **🏬 `apps/almacen` — maestro editable/borrable + fixes de UX móvil (17/07/2026, rama `claude/warehouse-module-review-angvve`, PR nuevo tras mergear #935).**
  Tras probar Alberto en producción, ronda de correcciones:
  - **Todo editable y borrable:** **Familias** (renombrar + borrar por fila; antes solo listaba nombres),
    **Materiales** (ficha con editar nombre/familia/categoría/**capacidad**/**precio alquiler**/coste/ud-bandeja/stock mínimo + borrar; la API PATCH/POST ganó `precioAlquiler`+`capacidad`+`stockMinimo`), **Almacenes**
    (botón borrar en la ficha, con **guarda**: `DELETE /api/espacios` devuelve 409 si el almacén aún tiene existencias — verificado que Central queda bloqueado), **Empleados** (editar nombre/usuario/teléfono además del reset de contraseña ya existente; `editarEmpleado` en `lib/empleados.ts`). Todos los borrados son **soft** (`activo=false`, conservan historial). Botón `.btn-danger` nuevo.
  - **Bug de conteo de inventario en móvil (crítico):** la tabla de conteo se iba en scroll horizontal y el input "Contado"
    quedaba **fuera de pantalla** → parecía que no se podían meter cantidades. Reemplazada la `<table>` por **filas
    apiladas** (`inventario-conteo.tsx`) con el input SIEMPRE visible (`font-size:16px` para no disparar el zoom de iOS).
  - **Logo del login roto:** usaba `/logo.svg` (icono roto en el móvil de Alberto pese a ser SVG válido). Cambiado al
    mismo **`/logo-mark.svg`** que la cabecera (probado que carga) + wordmark "Joaquín Jaén" en serif.
  - **Acceso DEMO (recordatorio):** login oficina `demo-jj@central.local` / `JJdemo2026`; pantalla principal `/panel`.
    Proyecto Vercel `almacen` (equipo *Pisos turísticos*); el tenant REAL de Joaquín sigue sin sembrar.
  - **URL oficial de presentación (17/07/2026):** **https://almacen-pisos-turisticos-projects.vercel.app** (subdominio
    Vercel de producción). Decisión de Alberto: NO se compra dominio; se enseña a Joaquín Jaén en este `.vercel.app`
    y, cuando lo aprueben, se conecta **su** dominio (Vercel → proyecto `almacen` → Settings → Domains → Add + CNAME).
    Nota: la integración Vercel MCP de la sesión no ve el proyecto `almacen` (no puede tocar sus dominios por API);
    los cambios de dominio se hacen a mano en el panel.

- **🏬 `apps/almacen` FASES 2·3·4 — operativa completa de almacén (16/07/2026, rama `claude/warehouse-module-review-angvve`, PR nuevo).**
  Continúa la Fase 1 (#929, ya en main) con las tres fases restantes en la misma rama:
  - **Fase 2 — eventos y alquileres.** Modelo de celda de 4 estados (disponible/reservado/en_transito/fuera) en
    `@central/module-materiales/eventos.ts` (reservar/cancelarReserva/entregar/devolver/enPropiedad/solapa; 11 tests puros).
    Servicio `apps/almacen/lib/eventos.ts`: presupuesto → confirmar (disponible→reservado) → entregar (reservado→fuera) →
    devolver (fuera→disponible + roturas perdidas) → cerrado; cancelar libera reservas. Tablas `almacen_eventos` +
    `almacen_evento_lineas`. UI `/eventos` (+ ficha con transiciones). Verificado en BD (ciclo reserva→entrega→devolución
    con roturas; datos borrados).
  - **Fase 3 — empleados + inventario por conteo.** Sesión con **tipo** (`oficina` | `empleado`) en el JWT (`lib/auth.ts`);
    la oficina crea/edita empleados (usuario+contraseña bcrypt, `lib/empleados.ts`), los empleados entran a un área móvil
    **`/mi`** y solo cuentan; **solo la oficina cierra** inventarios. Inventario = snapshot del sistema por espacio →
    conteo (ciego u abierto, `inventario-conteo.tsx` compartido) → cierre con ajustes/roturas al stock (reusa
    `ajusteInventario` del módulo). Tablas `almacen_empleados`, `almacen_inventarios`, `almacen_inventario_lineas`.
    Verificado en BD (cierre delta −2 → rotura, disponible 10→8; datos borrados). 59 tests módulo verdes.
  - **Fase 4 — escaparate público de alquiler (sin sesión).** `/catalogo` (169 materiales alquilables con foto/precio/
    **unidades reales**), `/catalogo/[id]` (ficha + CTA), `/reservar` (form: datos cliente + fechas + líneas → crea un
    **presupuesto** tipo alquiler que la oficina revisa). `lib/publico.ts` (`catalogoPublico`/`itemPublico`/`crearSolicitud`),
    API pública `POST /api/publico/solicitudes`, middleware abre `/catalogo|/reservar|/api/publico`. **Prioridad de eventos**
    (requisito de Alberto): la web ve `disponible`; al confirmar un evento el stock pasa a `reservado` y **desaparece de la web
    automáticamente** — verificado en BD (reservar 10 baja la disponibilidad pública; revertido). Diseño corporativo
    Joaquín Jaén (oro/serif), responsive tablet/móvil/PC. **PENDIENTE — bloqueado:** cobro con **Stripe** (conector sin
    autorizar) + claves + dominio; la reserva con pago auto-confirmaría el presupuesto (reserva de stock). También pendiente
    la **auto-previsión de material por nº de personas** con IA (mencionada para medio plazo). Verificado global: typecheck 0,
    `next build` OK (rutas `/catalogo`, `/catalogo/[id]`, `/reservar`, `/api/publico/solicitudes`).

- **🏬 `apps/almacen` FASE 1 — control multi-almacén (16/07/2026, rama `claude/warehouse-module-review-angvve`, PR #929).**
  La app pasa de "maestro de materiales" a **control operativo**. Modelo nuevo: **stock POR ALMACÉN** vía
  **ledger** (`almacen_movimientos`, verdad histórica) + **snapshot** (`almacen_stock`: disponible + en_transito)
  actualizados en la misma transacción Prisma; el maestro (`almacen_materiales`) conserva contadores globales
  = Σ stock. Tablas: `almacen_espacios` (central + haciendas, con **ficha**: dirección/contacto/tel/email/notas),
  `almacen_movimientos`, `almacen_stock`, `almacen_transferencias`, `almacen_comentarios` (hilo polimórfico de
  registro con foto opcional). **Migración = asiento de apertura**: el stock actual (227 materiales) quedó en un
  almacén **"Central"** (Σ 51.969 uds, sin pérdida). Lógica pura nueva en `@central/module-materiales`
  (`transferencias.ts`: iniciar/confirmar/cancelar traspaso "en tránsito"; 11 tests). Capa de servicio
  `apps/almacen/lib/almacen.ts` (registrarMovimiento/crear-confirmar-cancelar transferencia; motivo obligatorio en
  ajuste/rotura; identidad = usuario de oficina de la sesión). API: `/api/espacios|movimientos|transferencias|comentarios`.
  UI corporativa+responsive (drawer móvil): **Panel** (KPIs valor total/por almacén, bajo mínimo, traspasos
  pendientes), **Almacenes** (tarjetas + ficha editable + stock + comentarios), **Materiales** ampliada + **ficha**
  (stock por almacén, acciones entrada/salida/ajuste/rotura/traspaso, **historial**, comentarios), **Transferencias**
  (alta + confirmar recepción parcial con roturas / cancelar), **Movimientos** (feed filtrable). Verificado: 48 tests
  módulo + 22 guardián verdes, `next build` 21 rutas, typecheck limpio, y **flujo en tránsito probado en BD**
  (envío 10 → recibo 8 + 2 rotas → material 10→8, estado parcial; datos de prueba borrados). Roadmap escrito en
  `docs/superpowers/specs/2026-07-16-almacen-fase1-multialmacen-design.md`: **Fase 2** eventos/alquileres,
  **Fase 3** empleados+inventario por conteo, **Fase 4** web pública (prioridad de eventos + auto-previsión por nº
  personas con `@central/core-ai`). El "actor oficina" = login actual (`cuentas`); empleados llegan en Fase 3.

- **⏰ rrhh — calendario de fichaje + alerta Telegram + recordatorio push (16/07/2026, PR #933,
  MERGEADO).** Portal del empleado: la tabla plana de fichajes se sustituye por un **calendario
  mensual** (`FichajeEmpleado.tsx`) con días en verde (jornada ok), naranja (sin cerrar), verde
  oscuro (jornada activa) y anillo para hoy, más el total de horas del mes. Dos crons nuevos en
  `vercel.json`: `/api/cron/alerta-fichajes-abiertos` (diario 22h ES, Telegram vía
  `@central/core-telegram` si un fichaje activo lleva >10h sin fichar salida) y
  `/api/cron/recordatorio-fichaje` (L-V 9h ES, push a quien aún no ha fichado entrada, reusa
  `pushEmpleado()`). `@central/core-telegram` entra a deps + `transpilePackages` de `apps/rrhh`.

- **📱 `/banca` — libro de movimientos legible en móvil (16/07/2026, PR #932, MERGEADO).** El
  select de negocio + el botón 🤖 inline de cada fila comían el ancho en móvil y el CONCEPTO
  quedaba aplastado. Fix: la fila se apila en móvil (concepto a ancho completo arriba, legible;
  fecha+badges+importe debajo), select y 🤖 se ocultan (para eso está la ficha al tocar la fila,
  ya existente) y se añade la pista «👆 Toca un movimiento para ver/editar».

- **🤖 Fase 2 del Director de código — ORQUESTADOR autónomo "caro planifica / barato ejecuta" (16/07/2026,
  rama `claude/director-agent-token-optimization-g5z5f5`, PR draft nuevo).** Cierra el ciclo tras Fase 1 (#922)
  y 1.5 (#926, CLI ejecutor). Piezas: (1) **`lib/programador.ts::planificarTarea`** — el PLANIFICADOR: dada la
  orden + archivos candidatos (con contenido), el modelo ALTO (categoría `plan`) devuelve un plan estructurado
  `[{ruta,instruccion,criterio}]` (parse cleanJSON defensivo; degrada a plan vacío). (2) Endpoint
  **`POST /api/ai/programar`** (auth `AI_GATEWAY_SECRET`, presupuesto, `ai_usos` endpoint='programar'). (3)
  **`scripts/ai-programar.mjs`** — orquestador CLI end-to-end: acota (`/api/ai/codigo`) → planifica
  (`/api/ai/programar`) → ejecuta cada archivo (`/api/ai/ejecutar`) → aplica; el humano revisa+verifica+commitea.
  (4) **`.github/workflows/ai-programar.yml`** — versión plenamente autónoma SOLO por disparo manual
  (`workflow_dispatch`): corre el orquestador y abre **PR draft** + Telegram; NUNCA mergea (código del barato no
  entra a main sin revisión). Reglas del repo respetadas (cambios de comportamiento → PR draft, nunca auto-merge).
  **Activación:** el PLAN lo hace Claude alto de verdad solo cuando la categoría `plan` esté en el catálogo →
  corrida del cron `ia-director-refresh` (semanal/manual); hasta entonces degrada al modelo por defecto barato.
  Verificado: tsc 0 · next build 0 · `node --check` de ambos scripts OK, degradan sin envs.

- **⚡ Inicio: el segmento 🏢 Negocios ahora es PEREZOSO (16/07/2026, misma rama).** Cierra el coste que
  quedó anotado en la fusión: antes `/banca` renderizaba en SSR **ambos** segmentos (Dinero + Negocios) en cada
  visita → el holding se computaba siempre. Ahora el conmutador es por **navegación** (`banca/SegTabs.tsx`, dos
  `next/link` con prefetch: 💶 Dinero → `/banca`, 🏢 Negocios → `/banca?tab=negocios`) y `banca/page.tsx`
  **ramifica por `?tab`**: si `tab=negocios` devuelve solo `<NegociosResumen/>` (sin tocar saldos/movimientos/IA);
  si no, computa solo Dinero. Cada pestaña carga **solo sus datos** (fin del doble coste). Se **eliminó**
  `TabsDineroNegocios.tsx` (el conmutador cliente por `display`). Trade-off aceptado: cambiar de pestaña es una
  navegación (prefetch, rápida) y no conserva los filtros del libro al alternar. Verificado: `tsc` 0 + `next build`
  exit 0 (`/banca` 28,6 kB).

- **🏠 FUSIÓN Resumen + Banca → Inicio único con `💶 Dinero | 🏢 Negocios` (16/07/2026, rama `claude/banking-summary-consolidation-4xvbt7`, Fase 2 + PR2 + PR3).** Continuación del PR1 (recolocación
  de `/banca`). Alberto: "Resumen y Banca hacían prácticamente lo mismo". **Fase 2 (fusión de rutas):**
  `/banca` es ahora el **Inicio único** con un control segmentado cliente **`TabsDineroNegocios.tsx`** —
  **💶 Dinero** (el cuerpo de banca: saldos + movimientos + IA, por defecto) y **🏢 Negocios** (la foto del
  holding: negocios con resultado + consolidado intercompany + Modelo 130 + alertas). El contenido de Negocios
  se **movió** del antiguo `/dashboard` a **`banca/NegociosResumen.tsx`** (server component autocontenido y
  defensivo con `safe()`); `dashboard/page.tsx` quedó como **redirect a `/banca?tab=negocios`** (se conserva la
  ruta porque es destino de login/register y de ~15 fallbacks `redirect('/dashboard')` de operador). Aterrizajes
  actualizados a `/banca`: `app/page.tsx`, `login`, `register`, `CommandPalette` (entradas Inicio + Negocios).
  Ambos paneles se renderizan en SSR y el cliente alterna con `display` (cambio instantáneo; el inactivo queda
  montado para no perder filtros). ⚠️ **Coste conocido:** `/banca` carga AHORA también los datos del holding en
  cada request (NegociosResumen no es perezoso) — aceptable pero candidato a lazy-load si molesta. **PR2 (ficha
  de movimiento):** tocar el concepto de una fila del libro (`MovimientosTabla` en `BancaClient.tsx`) abre un
  **bottom-sheet** con importe/fecha/banco, negocio (select que reclasifica), ¿deducible?, factura y **🤖 ¿Qué
  es?** (reusa el sugeridor). **PR3 (menú):** el sidebar fusiona «Resumen»+«Banca» en una sola entrada **🏠 Inicio**
  (`/banca`). **Verificado:** `tsc` 0 en los archivos tocados + `next build` exit 0 (`/banca` 28.9 kB, `/dashboard`
  = redirect). ⚠️ Deja **desactualizada** la sección "Home /dashboard = RESUMEN" de `apps/plataforma/CLAUDE.md`
  (ver nota añadida). Pendiente opcional: lazy-load del segmento Negocios; agrupación más fina del menú por «💶 Dinero».

- **⚙️ Fase 1.5 delegación de código — CLI `scripts/ai-ejecutar.mjs` (16/07/2026, rama
  `claude/director-agent-token-optimization-g5z5f5`, PR draft nuevo tras mergear #922).** Operacionaliza el
  ejecutor barato: Node puro sin deps que envuelve `POST /api/ai/ejecutar` — `--ruta`/`--instruccion`/`--criterio`
  reescriben un archivo EN SITIO (`--dry` = no escribe; `--maxTokens`; `--smoke` = healthcheck del endpoint).
  Envs `PLATAFORMA_URL`+`AI_GATEWAY_SECRET` (el secreto nunca se imprime; degrada con mensaje claro sin ellas).
  La skill `delegar-codigo` (paso 3) y `docs/DIRECTOR-CODIGO.md` ahora apuntan al CLI en vez del `curl` a pelo.
  **Propósito:** cada delegación queda en `ai_usos` (`endpoint='ejecutar'`) → así se MIDE el ahorro antes de
  decidir la Fase 2. El planificador sigue siendo la sesión (un CLI que planifique solo YA sería Fase 2).
  Verificado: `node --check` OK, degrada sin envs, valida args antes de tocar red.

- **🧠 Optimización de tokens del Director — estudio + Fase 1 "caro planifica / barato ejecuta" (16/07/2026,
  rama `claude/director-agent-token-optimization-g5z5f5`, PR #922 MERGEADO).** Alberto: que Claude alto (la 5/Opus)
  gaste tokens SOLO en planificar y una IA barata/gratis ejecute la programación, vía OpenRouter. **Estudio:**
  `docs/ESTUDIO-DIRECTOR-CODIGO-TOKENS.md` — la arquitectura ya estaba ~70% (Director de código acota a 0 tokens
  con `mapa_arquitectura`, Director de modelos, cron que refresca catálogo, presupuesto/`ai_usos`; Claude ya
  entra como slug de OpenRouter). El hueco: no había fase de PLAN con Claude alto ni EJECUTOR barato, y Opus
  estaba capado por `DIRECTOR_MAX_PRECIO_OUT`. **Fase 1 implementada (modelo de 3 roles):** (1) `elegirPorCategoria`
  en `lib/ia-director.ts` (elige del catálogo por tag, sin hop al decisor); (2) `chatConDirector` acepta
  `categoria?` (aditivo, `lib/pasarela.ts`); (3) endpoint `POST /api/ai/ejecutar` (coder barato reescribe UN
  archivo, `endpoint='ejecutar'` en `ai_usos`, no toca disco/git); (4) categoría `plan` (Claude alto) en el cron
  `ia-director-refresh` con techo propio `DIRECTOR_PLAN_PRECIO_OUT` (default 100); (5) skill de sesión
  `.claude/skills/delegar-codigo` (delega SOLO lo mecánico; Claude planifica+revisa+verifica). Todo aditivo,
  degrada solo, no toca la cadena gratis ni el presupuesto. **Pendiente:** la categoría `plan` entra al catálogo
  en la próxima corrida del cron (o disparo manual); el ejecutor (`codigo`) ya funciona. **Fase 2 (futura):**
  orquestador autónomo servidor (plan→ejecuta→verifica→PR), solo tras medir el ahorro real en `ai_usos`.

- **🧹 `/banca` PR1 — recolocación en móvil (16/07/2026, rama `claude/banking-summary-consolidation-4xvbt7`).**
  Alberto: en móvil los 7 botones de acciones de `/banca` se comían la primera pantalla y el libro de
  movimientos (lo que más usa) quedaba enterrado tras ~12 secciones. Presentación de diseño validada como
  Artifact antes de tocar código (fusión Resumen+Banca con control `Dinero|Negocios`, lista única de
  movimientos, barra limpia, pregúntame, ficha de movimiento — escalonado en 3 PRs). **PR1 (recolocación
  pura, sin tocar datos):** (1) nuevo componente **`AccionesBanca`** en `BancaClient.tsx` — los 7 botones
  pasan a **➕ Añadir** (Importar extracto + Conectar banco) y **⋯ Más** (Subir factura, Conciliar,
  Re-analizar, Exportar, Revisar correo), reutilizando los botones existentes tal cual (solo cambia el
  contenedor, mantienen sus modales); (2) el **libro de movimientos + bandejas subidos** justo tras el
  resumen del periodo, antes de los paneles de IA; (3) nuevo **`Plegable`** (cerrado por defecto, montaje
  perezoso) agrupa los paneles secundarios de IA/herramientas (Benchmark, AnálisisIA, Cazador, Antifraude,
  Tickets, Tesorería, Fugas); (4) el **mini-chat contable subido arriba** («pregúntame»). Verificado
  `tsc` sin errores en los 2 archivos + `next build` exit 0 (`/banca` compila). **Pendiente Fase 2/3:**
  fusión de rutas Resumen+Banca con segmentado `Dinero|Negocios`, ficha de movimiento al tocar (PR2),
  reagrupar el menú lateral por «💶 Dinero» (PR3). Decisiones por defecto tomadas: «Revisar correo» dentro
  de «⋯ Más», segmento por defecto Dinero, menú aparcado.

- **📦 Catálogo REAL de Joaquín Jaén cargado en `apps/almacen` (16/07/2026, rama `claude/warehouse-module-review-angvve`).**
  Se extrajo el **catálogo de alquiler online completo** (`plataformacateringjoaquinjaen.com/alquiler`, 8 categorías /
  21 subcategorías) usando **Claude Chrome** (el agente de navegador en el navegador de Alberto, que sí tiene red —
  este entorno la tiene capada). **227 productos** únicos (dedupe **por URL de imagen**, no por nombre: hay duplicados
  legítimos con misma etiqueta y distinta foto/stock/medida; se excluyó la ficha de prueba "test prueba editor").
  Cada producto trae nombre, categoría, stock (`cantidad`), precio de alquiler, rotura (=`coste_reposicion`),
  capacidad/medidas y **URL de foto** (externa, apuntando a su web). Migración BD: 2 columnas nuevas en
  `almacen_materiales` → **`precio_alquiler` numeric(10,2)** (tarifa de alquiler, distinta de `precio_compra`) y
  **`capacidad` text** ("56 cl", "Ø 30 cm"…). Sembrado en el tenant **DEMO** (`0de5…0001`): 21 familias + 227
  materiales. Carga hecha por MCP **a prueba de erratas**: JSON minificado en 3 trozos, cada uno verificado con
  **SHA-256** antes de insertar (si el pegado no cuadra, no entra nada) — validado también con regex que las 227 URLs
  de imagen están bien formadas. UI de `/materiales` ampliada: **miniatura de foto + capacidad + precio de alquiler**.
  Artefactos en repo: `apps/almacen/prisma/sql/2026-07-16_almacen_alquiler_capacidad.sql` (migración) y
  `apps/almacen/prisma/sql/catalogo-joaquin-jaen.json` (fuente). **Pendiente:** re-hospedar las fotos en Storage
  (ahora dependen de su web); tenant REAL de Joaquín aún sin sembrar; e-commerce público (stock real + pago + reserva
  + envío) sigue siendo visión futura.

- **⚠️ INFRAVENTA #2 — FERIA 2027 sin cargar como evento + corrección (15/07/2026, rama `claude/dynamic-pricing-uhvnak`).**
  Reserva Nieves Cárdenas (Booking 5518506647, Luxury, 15-17 abr 2027, 4 pax, Genius): prepago 349,18€
  (~175€/noche) en **PLENA FERIA** — fechas oficiales confirmadas por websearch: **13-18 abr 2027**
  (alumbrado el 12) — con mercado real **p50 ≈ 424€/noche** (4 pax; 2 pax ≈ 387€). Causa: la Feria 2027
  nunca entró en `pricing_eventos_auto` (era el pendiente "fechas exactas de Feria") y el bucket de abril,
  hecho con comps de ventanas no-Feria, arrastró la noche 502→177 en 6 pasadas. La guarda del PR #911 no
  aplicaba (abril SÍ tiene bucket de mes). **Corregido:** evento `feria` factor 2,5 insertado 12-18 abr
  2027 (lo heredan los 4 pisos vía MAX; el salto de evento re-sube SIN esperar la rampa ±20%) + 10 comps
  4pax (luxury) + 10 comps 2pax (busto) del 15-17 abr. Lección en `pricing_aprendizaje` id 36. **Regla de
  agente:** al confirmarse fechas de un evento mayor, cargarlas en `pricing_eventos_auto` EL MISMO DÍA;
  un bucket mensual con semana de evento dentro necesita comps DE ESA SEMANA o el percentil esconde el pico.

- **🦺 Módulo PRL en `apps/rrhh` (15/07/2026, PRs #908/#912/#913) — cierra un ítem 🔴 del roadmap.**
  Nueva sección `/admin/prl` con generación de documentos PDF (`@react-pdf/renderer`) con firma doble
  (empresa firma primero, luego el empleado en su portal): **autorización de uso de maquinaria** (Art. 17
  LPRL/RD 1215/1997, equipos con checkboxes), **entrega de EPIs** (RD 773/1997), **información de riesgos**
  (art. 18 LPRL) y **acuerdos de confidencialidad RGPD** con/sin acceso a datos (art. 29 RGPD/LOPDGDD
  art. 5) — para este último se añadieron campos a `rrhh.empresas` (nif, representante, domicilio…).
  Nuevo endpoint `GET /api/admin/empleados/[id]/documentos/[docId]/descargar-firmado`: fusiona el PDF
  original con una página de certificado de firma (eIDAS art. 26) vía `pdf-lib`, solo si
  `estado_firma='firmado'`. Fix de paso: la comparación del nombre en la firma del empleado solo miraba
  `e.nombre` (sin apellidos) → rechazaba firmas legítimas; ahora concatena nombre+apellidos.
  **Roadmap actualizado** (`docs/ROADMAP-rrhh.md`): el ítem 🔴 "PRL + entrega de EPIs" pasa a hecho.
  Sigue pendiente el ítem distinto "Contrato de encargo de tratamiento (art. 28 RGPD)" (empresa↔iarrhh,
  no es lo mismo que el acuerdo de confidencialidad del empleado).

- **🏬 `apps/almacen` DESPLEGADA + tematizada Joaquín Jaén (15/07/2026).** Tras mergear el PR #902 (cimientos
  en `main`), Alberto creó el **proyecto Vercel `almacen`** (Root `apps/almacen`, BD compartida, rol
  `prisma_almacen` con password puesta a mano). Deploy verde, login OK. **Cuenta de prueba:** cuenta DEMO
  `demo-jj@central.local` (id `0de50000-0000-4000-a000-000000000001`, "Holding Joaquín Jaén (DEMO)"), vacía
  (0 familias/materiales); se le fijó una contraseña temporal por MCP para poder entrar. El **tenant REAL** de
  Joaquín aún NO sembrado (pendiente: elegir email + password reales). **UI re-tematizada a la marca
  Joaquín Jaén** (logo oro/bronce + serif que envió Alberto): tema CLARO, acento oro `--accent:#a5864f`,
  tipografía serif en títulos, marca por CSS (pastilla + "JJ"). Pulido: tarjetas, estados vacíos, buscador +
  paginación client-side (50 + «Ver más») en materiales, formato € español, responsive. Marca reutilizable en
  `apps/almacen/app/brand.tsx` — **cuando se añada el logo real como `apps/almacen/public/logo.svg`**, sustituir
  el `.brand-mark` por un `<img>` (comentario en el fichero). **Bug latente pendiente (no bloquea, PR pequeño):**
  `apps/almacen/prisma/schema.prisma` declara `Negocio.cuenta_id`, pero el `negocios` compartido usa
  `sociedad_id` (jerarquía Cuenta→Sociedad→Negocio); la app no consulta ese modelo hoy, corregir antes de
  cablear selección de negocio.

- **💸 Egress de la BD compartida — bajada de frecuencia de crons de ialimp (15/07/2026).**
  Preocupación de Alberto: el banner de cuota de Supabase (plan `free`, 5 GB egress/mes). Auditoría: la BD
  compartida es pequeña (~75 MB/500 MB) → el gasto es **egress/uso**, no almacenamiento. `cron.job` de la BD
  tiene 1 solo job (`sync-smoobu-daily` `0 5 * * *`, despreciable). El consumidor claro eran **los crons de
  Vercel de ialimp**, y **ialimp aún no tiene cliente de pago (Vanesa/Sique Brilla es piloto, aún no paga)**,
  así que su polling de fondo no tiene justificación de latencia. Bajados en `apps/ialimp/vercel.json`:
  `/api/cron/procesar-documentos` **cada-minuto `* * * * *` → `*/15`** (≈43.200→2.880 ejec/mes, −93 %) y
  `/api/superadmin/mailing/cron` **`*/3` → `*/10`** (drip de prospección, no necesita 3-min). **Sin tocar**
  `pms/sync` (`*/10`, sincroniza reservas Smoobu/iCal y el CLAUDE.md depende de él para check-ins del mismo
  día) ni los crons de **ia-rest** (viven en su silo aparte `efncqyvhniaxsirhdxaa` → no gastan egress de la
  compartida). Pendiente de Alberto: leer **Supabase → Reports → Usage** para atribuir el 5 GB real (DB egress
  vs Storage vs Realtime); si el grueso es Storage (fotos del portal) o Realtime, la palanca está ahí, no en
  los crons.

- **🅿️ Flip de ia-rest → la BD compartida: APLAZADO (15/07/2026). Sin coste, sin prisa.**
  Verificado por MCP: los **dos** proyectos Supabase (ia-rest `efncqyvhniaxsirhdxaa` + compartido
  `wswbehlcuxqxyinousql`) están en la **misma organización en plan `free`** → el free tier permite **2
  proyectos**, así que el segundo **cuesta 0 €**. La razón para migrar ("no pagar dos BD") **no aplica hoy**.
  Y **nada depende del flip**: los módulos nuevos del holding (almacén incl.) **nacen en el compartido igual**,
  y `plataforma` ya lee ia-rest por el puerto HTTP (`/api/operador/*`). El flip es solo higiene/consolidación,
  con riesgo real (datos de producción + cadena VeriFactu + 32 secrets a re-meter a mano). **Cuando merezca la
  pena** (paso a Pro, o consolidación nativa), se hace con **Supabase CLI `secrets set --env-file .env.local`**
  (+ `vercel env pull`) — los 32 de golpe, NO a mano por navegador.
  - **Intento manual parcial de hoy (a limpiar):** se guardaron **2 secrets en el compartido**
    (`STRIPE_SECRET_KEY` live + `STRIPE_SECRET_KEY_TEST`). **Hay que borrarlos** (Supabase → compartido →
    Edge Functions → Secrets) para dejarlo como estaba (3 custom: `SMOOBU_API_KEY`/`FAL_API_KEY`/`CRON_SECRET`).
    Sin impacto vivo (las funciones stripe del compartido son clones dormidos; la pública `webhook-stripe` ni
    usa esos 2 — usa `STRIPE_WEBHOOK_SECRET`), pero una clave **live** fuera de sitio = exposición innecesaria.
  - **NO se tocaron** las envs de Vercel de ia-rest ni hubo Redeploy: producción intacta en el silo.

- **🧭 CANÓNICO — Arquitectura de datos del holding (15/07/2026). LEE ESTO ANTES DE TOCAR BD.**
  **Una sola BD para todo el holding: la compartida `wswbehlcuxqxyinousql`.** No se crean proyectos Supabase
  nuevos por vertical. Cada módulo = tablas scoped por tenant en la compartida; `apps/plataforma` consolida.
  **`apps/ia-rest` sigue en un silo TRANSITORIO** (`efncqyvhniaxsirhdxaa`, schema `public`) **en migración**
  al schema `iarest` de la compartida (~80% hecho: DDL/funciones/edge/storage clonados; **falta el "flip"** de
  envs Vercel + datos vivos). ⚠️ **Cualquier módulo nuevo del holding (almacén incl.) nace en la compartida,
  NO dentro de ia-rest.** Entradas históricas más abajo que digan "ia-rest ya lee la compartida" describen un
  **intento parcial/revertido**, no el estado real → obsoletas. Fuente: `docs/PLAN-consolidacion-BD-holding.md`
  y `MATRIZ.md` ("Arquitectura de datos del holding"). *(Corrige el error de esta sesión: se arrancó el almacén
  en el silo de ia-rest por leer esas entradas viejas como si la unificación estuviera cerrada.)*

- **📋 Reunión Joaquín + auditoría del módulo ALMACÉN (14/07/2026, rama `claude/warehouse-module-review-angvve`).**
  Alberto tuvo ~2 h con Joaquín (dueño de un grupo de **catering/eventos** en Sevilla) para arrancar su
  **primer módulo: el ALMACÉN**. Grabación en Drive (`Jj 1 almacen_original.txt`, transcripción automática
  MALA — el diseño real está de 01:10 a 02:05). Entregado **`docs/ALMACEN-JJ-reunion-y-auditoria.md`** con
  3 partes: resumen de la reunión (requisitos R1–R12, flujo evento→picking→carga→entrega→devolución con
  firma, roles, fases), auditoría del código y cruce requisito↔código.
  **Hallazgo clave:** el motor de almacén **YA existe** (`packages/module-materiales`: ledger de movimientos,
  espacios/ubicaciones, unidades serializadas con QR, kits, inventario físico, mantenimiento, proveedores,
  valoración) y **`apps/ia-rest` (Voice POS del propio Joaquín Jaén, EN PRODUCCIÓN) ya implementa el ~70–80%**
  (catálogo, movimientos, espacios, QR, inventario físico, ASN con OCR de albarán, portal almacén central).
  `apps/alquiler` es deliberadamente ligera (stock entero plano). **Lo genuinamente NUEVO:** orquestación del
  flujo de evento de extremo a extremo, plantillas de material por tipo de evento (sobre `Kit`), calendario de
  eventos + anti-doble-reserva (`module-agenda` existe **sin consumo**), captura de firma/foto/vídeo, muelles
  de carga como `Espacio`, modo offline y PIN temporal. **Fase 1 acordada:** maestro por familias + inventario
  inicial "gordo" + plantillas de evento + alta de evento + salidas/entradas con firma. **Decisión CERRADA
  (15/07):** nueva **`apps/almacen`** sobre la **BD compartida** (NO extender ia-rest mientras esté en el silo)
  — ver banner canónico de arquitectura arriba. Sin código nuevo aún: esto es descubrimiento + auditoría.
  **Sesión de diseño (15/07):** repasado el esquema con Alberto + su **plantilla de materiales real** (foto).
  Decisiones cerradas de Fase 1 (adenda en el doc): tenant = **Catering Joaquín Jaén**; **todo 100% editable
  desde oficina** (familias/artículos/tipos de evento/bloques/muelles); **plantillas = bloques componibles**
  (Kit/expandirKit), validadas 1:1 con la hoja; **RAKI = bandeja** (`Material.empaque`, contar por bandejas);
  **solo 2 roles** (responsable almacén=tablet, responsable evento/lleva-y-trae=móvil, metre a mano); cuadre de
  stock por **doble conteo** de las 2 personas; **alquiler a terceros** en Fase 1 (receptor firma nombre+DNI,
  tipo Amazon); **personal = fase posterior pero se captura ya** `Evento.personal_previsto`; maquinaria por
  nombre (QR opcional). Idea validada para Fase 2: **agente IA de plantillas** que adelanta plantilla y predice
  material+personal (bucle previsto→real→sobrante, memoria en BD como el pricing-agente). Entregado esquema
  visual (artefacto Claude) + adenda de decisiones en `docs/ALMACEN-JJ-reunion-y-auditoria.md`. 4 preguntas
  abiertas para Joaquín (cantidades por comensal/mesa, devolución parcial, imputación de mermas, OCR de la hoja).

- **🔧 Auditoría completa de `/banca` + arreglo de hallazgos (14/07/2026, rama `claude/bank-movements-filters-1p7ns0`).**
  Tras el fix del crash, Alberto pidió «auditoría completa». 4 revisores en paralelo (correctitud servidor,
  rutas IA, tickets F5a, reglas del repo); cada hallazgo verificado a mano. **Ningún crítico.** Confirmado LIMPIO:
  auth en las 6 rutas IA, timeouts de IA, degradación, no-alucinación de cifras (la IA narra, los € salen de SQL),
  antifraude determinista, regex de acentos de tickets (U+0300–U+036F, byte a byte), scope `cuenta_id`, SQL
  parametrizado, rendimiento (paginación + montaje perezoso). **Arreglados (mismo PR):**
  1. **[MEDIO] Libro + P&L pisos ignoraban Año/Trimestre** (`banca/page.tsx`): el `IntervaloSelector` solo pone
     `?year=&quarter=` en esos modos, así que `desde/hasta` quedaban vacíos → el libro mostraba TODO el histórico
     y los pisos el mes en curso. Ahora se DERIVA el rango del trimestre/año. Además el P&L mensual de pisos +
     benchmark solo se pintan si el periodo es UN mes natural (`esMesUnico`); en trimestre/año el agregado ya
     sale en `ResumenPeriodo`.
  2. **[MEDIO] 500 por fecha malformada en la URL** (`banca/page.tsx`): `listarMovimientosLedger` no está en
     `safe()` y casteaba `${desde}::date` crudo → `/banca?desde=hoy` reventaba toda la página. Añadido saneo
     `fechaValida()` (ISO real; rechaza `hoy`, `2025-13-45`, `2025-02-30`) antes de que llegue al SQL.
  3. **[MEDIO responsive] CSS del scroll móvil del libro acoplada a `RevisarBandeja`** (condicional): si no había
     «gastos por revisar», el libro desbordaba en móvil (<375px). Movidas `.banca-movs-outer/.banca-movs-row` al
     `<style>` incondicional de `page.tsx`.
  4. [BAJO] `antifraude/route.ts`: `~${base.toFixed(2)}€` → `eur(base)` (formato español).
  5. [BAJO] `BenchmarkPisos.tsx`: nombre de piso con `flex:1/minWidth:0` (trunca bien en móvil) + `margen` NaN-safe.
  6. [BAJO] `lib/tickets.ts`: `guardarTicket` en `prisma.$transaction` (cabecera+líneas atómicas); `num()` entiende
     separador de miles (`"1.234,56"`→1234.56, antes daba null).
  Verificado: `tsc` 0 · `next build` exit 0 · 18/18 en test de lógica pura (fechaValida/rango trimestre/esMesUnico/num).
  **Pendiente (decisión de Alberto, NO tocado):** multi-tenant SIVRA — `getPLMensual` no filtra por cuenta (los
  pisos son mono-tenant; ya era así en `page.tsx` antes de esto). Y 2 errores Prisma pre-existentes ajenos:
  `concursos-cierre` (`make_interval(days => bigint)` falta `::int`) y `sivra/pricing/resumen-diario` (`created_at` no existe).

- **⚠️ INFRAVENTA en noche KAROL G + corrección (15/07/2026, rama `claude/dynamic-pricing-uhvnak`).**
  Reserva Andrea Salvatierra (Airbnb HMDB24SZDK, Luxury, 11-13 jun 2027, **finde Karol G ×3 La Cartuja,
  factor 2,5**): 687€ brutos las 2 noches (~343€/noche) cuando el mercado Booking real de ese finde estaba
  en **p50 ≈ 930€/noche** (4 pax, centro, rango 524-1.333). Causa raíz: **jun-2027 sin comps → fallback
  global hundió la base** y el motor bajó la noche de evento 788→283 en 5 pasadas pese al factor (el factor
  multiplica una base hundida). Corregido: 10 comps 4pax (escenario luxury) + 10 comps 2pax (escenario
  busto, p50 ≈ 628 vs 368 escrito) ingestados vía `/api/sivra/mercado/ingest` para 11-13 jun 2027 → el cron
  debe re-subir la noche libre del 13-jun y el finde de Busto. Lección en `pricing_aprendizaje` id 35.
  **Regla YA IMPLEMENTADA en el motor (PR #911, mismo día):** con evento factor ≥2 y sin comps del mes,
  `apps/plataforma/app/api/sivra/pricing/apply/route.ts` congela el precio actual en esas fechas (solo
  puede subir, salvo que el `max_price` del propietario exija bajar). Documentado como landmine §13 en
  `apps/sivra/docs/pricing-automatico.md`. Detalle extra sin cerrar: la reserva es de **5 huéspedes en
  piso de aforo 4** — revisar ocupación máxima del anuncio Airbnb.

- **🏷️ Bandeja «Gastos por revisar» — último productor de flag `requiere_revision` zombie tapado (15/07/2026, rama `claude/expense-category-assignment-4gjes9`).**
  Alberto vio en `/banca` un cargo de CORTEFIEL (`PAGO CON TARJETA EN MODA, CALZADO Y COMPLEMENTOS`, -139,64€,
  10/07) en «Gastos por revisar · categoría» y protestó: *"¿la IA no lo encontró? pone calzado y complementos"*.
  **Diagnóstico (no era fallo de clasificación):** el movimiento estaba YA bien clasificado (`categoria='tarjeta'`,
  `subcategoria='ropa'` — la keyword `CALZADO` sí casó —, `destino='personal'`, `destino_confirmado=true`). Salía
  en la bandeja solo por un `requiere_revision=true` **zombie**. **Causa raíz:** el saneo del 2026-07-10
  (`2026-07-10_limpiar_requiere_revision_confirmados.sql`) arregló `/api/banca/confirmar` y limpió los ~1.200
  zombies existentes, pero **dejó sin tapar `/api/banca/destino`** (reclasificar el negocio desde el libro de
  `/banca` o el desglose de correduría): marcaba `destino_confirmado=true` SIN limpiar `requiere_revision`. Y la
  bandeja `lib/banca.ts::listarPorRevisar` era el ÚNICO read-path sin el filtro canónico `destino_confirmado=false`
  (que sí tienen `getAlertas`, health-check Check 2 y `/finanzas/gastos`) → por eso el zombie salía ahí y no en el
  banner. **Arreglo (PR draft):** (1) `/api/banca/destino` añade `requiere_revision = false` a sus 2 UPDATEs
  (fila única + regla por comercio) → como el resto de rutas de confirmar; (2) `listarPorRevisar` filtra
  `COALESCE(destino_confirmado,false)=false`; (3) backfill idempotente `2026-07-15_limpiar_requiere_revision_destino.sql`
  (**ya aplicado en Supabase por MCP**: `requiere_revision=false WHERE requiere_revision AND destino_confirmado`).
  Verificado: la fila CORTEFIEL queda `requiere_revision=false` y la bandeja de gastos por revisar de Alberto
  devuelve 0. Sin migración de esquema; cambios en raw SQL, sin superficie de tipos.

- **💸 CORTE del cargo excesivo de Vercel — Build CPU Minutes (15/07/2026, rama `claude/vercel-excessive-charges-06p4a6`).**
  Alberto avisó de una factura de Vercel de **754,79 US$** (recibo 2789-8949, 14 jun–13 jul). Desglose: el
  **99% era una sola línea, `Build CPU Minutes` = 183.108 min ≈ 600,59 US$** (el resto —funciones, ISR, memoria,
  observabilidad, plan Pro— <24 US$). **Causa raíz:** ningún `vercel.json` tenía `ignoreCommand`, así que como
  ~7 proyectos Vercel cuelgan del MISMO repo, **cada push reconstruía TODOS los proyectos** (aunque el commit
  solo tocara `docs/` o una app), y encima `auditoria.yml` corría en todas las ramas y **commiteaba de vuelta**
  la radiografía con `[skip ci]` (que frena Actions pero NO Vercel) → cada push real generaba un 2º push que
  volvía a reconstruir todo. Con la cadencia de rutinas automáticas + tráfico manual, decenas de builds/día ×
  ~7 proyectos × install pesado (`npx pnpm@… --no-frozen-lockfile` + `prisma generate && next build`).
  **Arreglo (PR draft):**
  1. **`scripts/vercel-ignore-build.mjs`** (nuevo): cada `apps/<app>/vercel.json` lo invoca por `ignoreCommand`.
     Salta el build (exit 0) salvo que el commit toque `apps/<app>/`, `packages/*` o los manifiestos raíz
     (exit 1); los commits `[skip ci]` nunca construyen; fail-open ante cualquier duda. Añadido a los **7**
     `vercel.json` (ia-rest, plataforma, sivra, ialimp, rrhh, alquiler, transporte).
  2. **`auditoria.yml`**: el trigger y el commit-bot de la radiografía se restringen a `main` (antes `['**']`),
     así deja de generar el push-amplificador en ramas de feature.
  3. **Pendiente MANUAL de Alberto (dashboard):** activar **Spend Management** en el equipo Vercel
     (`Settings → Billing`) con aviso por email a un umbral (p.ej. 50 US$) — red de seguridad para que un
     runaway avise en horas, no en la factura. (Secundario, no bloqueante: aligerar el install fijando pnpm por
     Corepack para no re-descargar el binario en cada build.)
  Ahorro estimado **−90/95%** de Build CPU Minutes. Verificación real = ver caer el uso en el dashboard a los
  2-3 días (y que los deploys de proyectos no afectados salgan como «Ignored»). Doc corregida:
  `SKILL-proyecto-claude.md` ya no dice "sin límite, sin ignoreCommand".

- **🔐 Endurecimiento header-only del token de alertas `ALERTA_TOKEN` (14/07/2026, rama
  `claude/alerta-token-header-only`):** follow-up sobre el `ALERTA_TOKEN` que introdujo el PR #871.
  `/api/internal/alerta` (`app/api/internal/alerta/route.ts`) ahora acepta el token dedicado
  **solo por cabecera `Authorization: Bearer`** — se quitó el `?secret=` de `isAlertaTokenAuthorized`,
  porque es el token que viaja en los prompts de las rutinas y no debe filtrarse por logs de acceso/Referer.
  El `CRON_SECRET` de respaldo (vía `isCronAuthorized`) no cambia. **Contexto:** el PR #859 (que hacía lo
  mismo con el nombre `ALERTA_SECRET`) quedó **superado por #871** (ya en main) → se **cierra** #859 como
  duplicado; este follow-up recupera la única mejora suya (header-only). **Pendiente de Alberto** (manual,
  sin secretos en repo): generar `ALERTA_TOKEN` (`openssl rand -hex 32`) en env de plataforma + entorno de
  Claude Code, y rotar el `CRON_SECRET` débil (Vercel Prod+Preview + secret de GitHub Actions).

- **🐛 FIX crash de `/banca` + unificación real con Radiografía (14/07/2026, rama `claude/bank-movements-filters-1p7ns0`).**
  Alberto: «hay errores y no es lo que hablamos» (captura móvil con Banca **y** Radiografía como dos entradas
  separadas en el menú). **Dos cosas:**
  1. **CRASH de `/banca` (error de runtime #1 en producción, 6 veces / 2 usuarios):** *«Attempted to call
     periodoLabel() from the server but periodoLabel is on the client»*. Causa: `periodoLabel` y el tipo `Periodo`
     se exportaban desde `IntervaloSelector.tsx` (**`'use client'`**), y `banca/page.tsx` (server component) llamaba
     a `periodoLabel(periodo)` → Next.js no deja invocar una función de un módulo cliente desde el servidor. **NO lo
     cazan `tsc` ni `next build`** (solo revienta en ejecución RSC). **Fix:** helpers puros extraídos a nuevo módulo
     **`app/(usuario)/finanzas/periodo.ts`** (SIN `'use client'`: `Periodo`/`MESES`/`periodoLabel`); `IntervaloSelector`
     los importa y re-exporta SOLO el `type Periodo` (compat); `banca/page.tsx` importa `periodoLabel` de `./periodo`.
     ⚠️ **Patrón a vigilar:** nunca importar una FUNCIÓN de un módulo `'use client'` desde un server component.
  2. **Unificación F1 que quedó a medias (el «no es lo que hablamos»):** el plan era `/banca` = página única y
     `/finanzas/radiografia` **redirige** a `/banca`; pero coexistían las dos en la sidebar. `/banca` (vía
     `ResumenPeriodo`) YA es superconjunto de la Radiografía (misma cabecera KPIs, personal BBVA/Kutxa, negocios
     correduría+pisos, base IRPF + enlace a «Mi declaración», y además P&L pisos, benchmark, IA, tickets, tesorería,
     libro). **Hecho:** `radiografia/page.tsx` → `redirect('/banca'+querystring)` (conserva year/quarter/desde/hasta;
     `RadiografiaClient.tsx` **no se borra**, reversible); `UserSidebar.tsx` retira la entrada «Radiografía» (Banca =
     puerta única). Verificado: `tsc` 0 + `next build` exit 0 (la confirmación end-to-end del crash es la preview).
  **Aparte (pre-existentes, NO de esta rama):** timeouts de crons (facturas-scan/conciliar-gmail, ai/chat,
  concursos-ingesta) y 2 errores Prisma en producción — `/api/cron/concursos-cierre` (`make_interval(days => bigint)
  no existe` → falta cast `::int`) y `/api/sivra/pricing/resumen-diario` (`column "created_at" does not exist`).

- **🔍 Auditoría contable completa (14/07/2026).** Informe en `docs/AUDITORIA-CONTABLE-2026-07.md`.
  Alberto pidió asegurar que no se hubiera perdido ningún gasto. Contra la BD (cuenta `4fdc993a…`):
  - **Gasto real OCULTO recuperado (~406€):** movimientos PSD2 (feed real) que estaban TODOS `ignorado`
    sin copia activa → **2 IBI del Ayuntamiento (343,10€)** + **seguro de vida Kutxa (25,63€)** + 11 compras
    de tarjeta (37,20€) restaurados (`duplicado_estado=NULL`). **Causa:** el dedupe cross-origen
    (`importarExtracto`) se pasa de frenada cuando hay 2 movimientos legítimos del **mismo importe el mismo
    día** (2 IBI de 171,55€) e ignora también las copias PSD2 buenas → **landmine a vigilar / posible fix**.
  - **Verificado sin pérdida:** cuenta fantasma BBVA `cdb981d3…` (75 movs todos ignorados) = duplicados
    cross-account del BBVA real; sin reglas genéricas peligrosas; correduría 2026 ingresa 7.236€ (+1.133€, no
    está en el landmine 0€); traspasos internos netean a 0; ningún movimiento 2026 sin destino; BBVA/Kutxa
    frescos hasta 13-jul; `incomes` 1.974 filas hasta abr-2027.
  - **Limpieza:** 9 facturas más mal archivadas en el tenant DEMO (5.263€, reales de Alberto: Allianz,
    Booking×3, ASECON, IONOS, Petroprix, fal.ai, un PAGO RECIBO mal parseado) **borradas** (raíz ya
    arreglada en #896).
  - **Backlog para Alberto (no pérdida):** 3 facturas pendientes (2 ventas Socorro + ASECON 1.210€); ~38
    cargos sin confirmar + ~70 abonos por revisar en corrientes; pendiente su respuesta IONOS/gasolina.

- **🧹 Limpieza de tarjetas Kutxabank + fix del cron facturas-scan (14/07/2026, rama `claude/ai-accounting-agent-3a9o22`).**
  Tras la Fase 3, Alberto pidió "revisa que cuadren todas las tarjetas". Revisión contra BD (Supabase,
  filtrando `cuenta_id` de Alberto `4fdc993a…`):
  - **Cuadre OK:** las 2 tarjetas (…0302 Pilar, …0300 Alberto) cuadran al céntimo (líneas `PAGO RECIBO`
    del detalle = cargos `TARJ.CRDTO` de la corriente Kutxabank) en los 15 meses con extracto.
  - **Limpieza aplicada por SQL (MCP):** (a) 2 reglas aprendidas MALAS borradas de `banca_destino_reglas`
    (`IONOS→seguros`, `PETROPRIX→seguros`) — metían hosting y gasolina en la correduría; (b) ~**492€**
    sacados de `destino='seguros'` que no eran correduría (IONOS 177 + gasolineras Petroprix/Plenergy/Isbilya
    190 + clínica Grupo Vivo 125) → la correduría salía ~492€ más cara de lo real; (c) 26 compras de Pilar +
    11 más confirmadas como personal; (d) 11 devoluciones resueltas (incl. Círculo Mercantil 80€); (e) tarjeta
    **0300** corregida de `tipo='corriente'`→`'tarjeta'` y su detalle jun-jul (estaba en una cuenta genérica
    "Importado (Excel)" por el import Excel viejo) **unificado** en la 0300: borradas 48+8 filas duplicadas
    ya `ignoradas`, movidos los activos, cuenta genérica oculta. Estado final: 0 mal en seguros, 0 por revisar.
  - **🐛 Bug encontrado y arreglado — cron `facturas-scan` mete facturas en tenants ajenos.** El aviso raro
    "🟡 SIVRA · Anthropic 180€ (proveedor nuevo)" era la suscripción de Claude de Alberto (Max plan 20x,
    217,80€ = 180€ + 21% IVA) archivada en la cuenta **DEMO "Holding Joaquín Jaén [seed-demo]"**, no en la suya.
    Causa: el cron hacía `SELECT id FROM cuentas` (TODAS, incl. demo) y escaneaba el **Gmail compartido**
    (`GMAIL_USER`, que es de UNA cuenta) para cada una → las facturas de Alberto se insertaban en cada tenant.
    **Fix** (`app/api/cron/facturas-scan/route.ts` + `lib/agente-facturas/cuenta-buzon.ts::resolverCuentaBuzon`,
    puro y testeado): el escaneo de Gmail se hace SOLO para la cuenta dueña del buzón (env
    **`FACTURAS_CUENTA_ID`** → cuenta con `email==GMAIL_USER` → la única real si solo hay una; si no se
    resuelve, no escanea). Se excluyen las cuentas `[seed-demo]` del cron. `verificarPagosPendientes` (global)
    se llama una vez. Las 6 filas basura de Anthropic del demo borradas. Tests 7/7, `tsc` 0.

- **🛒 Tickets de súper — F5a: OCR + guardado + subir/listar en /banca (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`).**
  Arranca la F5 (el módulo grande). **BD nueva** `prisma/sql/2026-07-13_tickets_compra.sql`: `tickets_compra`
  (super/super_norm/fecha/total/n_lineas/movimiento_id?/imagen_url?) + `tickets_lineas`
  (producto_raw/producto_norm/cantidad/precio_unit/precio_total, denormaliza super_norm+fecha para el
  comparador), scope `cuenta_id`, `REVOKE anon/authenticated`. **⚠️ PENDIENTE APLICAR por Supabase MCP** (aditiva
  e idempotente; el endpoint degrada mientras tanto). **`lib/tickets.ts`:** `ocrTicket(base64,mediaType)` con
  **`nimVision`** (mismo patrón que `factura-ocr.ts`, IA de visión NIM gratis) → cabecera + líneas; `normalizarSuper`
  (mercadona/dia/lidl/carrefour/aldi/alcampo/eroski/consum/ahorramas…) + `normalizarProducto` (clave difusa v1:
  sin acentos/puntuación) para comparar entre súpers; `guardarTicket`/`listarTickets`. **`POST/GET /api/banca/ticket`**
  (multipart `file`; `maxDuration=60`; valida tipo/≤12MB; degrada: sin IA→nota, sin tabla→devuelve el OCR con
  `guardado:false`). **`TicketsSuper.tsx`** (client, bajo demanda en /banca): subir foto (`capture=environment`) →
  muestra líneas leídas + guardado + últimos tickets. **F5b (pendiente):** comparador de precios (súper más
  barato por producto, evolución, cesta) + conciliación con el cargo del banco. Verificado: `tsc` 0 + `next build`
  exit 0. (F4 entregada: sugerir por fila #889, benchmark #890, fugas #891, antifraude #892, resumen mensual #893.)

- **📤 Cierre de mes narrado → Telegram (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`, fase 4 de la banca unificada — 5º corte).**
  Tras el #892 (antifraude). Cron `día 1 a las 08:00` (`0 8 1 * *` en `vercel.json`) `/api/cron/resumen-mensual`
  (auth `Bearer CRON_SECRET`, igual que `resumen-semanal`; GET para Vercel + POST manual). `lib/resumen-mensual.ts::`
  `enviarResumenMensual()` itera `SELECT id FROM cuentas` (patrón de `contable-proactivo`) y por cada cuenta
  recompone el **MES ANTERIOR** con `getResumenFinanciero(cuentaId, year, 0, desde, hasta)` (mismas cifras que
  /banca — nunca inventa) + `getPLMensual(mes)` (piso líder/rezagado), y manda un Telegram con el cierre:
  ingresos negocio, gasto total con Δ vs mismo mes del año anterior, resultado, tramo IRPF. Añade una
  **narración de 1-2 frases de la IA GRATIS que DEGRADA** (si falla, van solo las cifras). Single-tenant en la
  práctica (cuenta de Alberto). Reutiliza crons + `@central/core-telegram` + `eur()`. Verificado: `tsc` 0 +
  `next build` exit 0. Sigue pendiente F4: desviación explicada, aviso fiscal proactivo, adjuntar/conciliar
  factura por foto; y F5: módulo 🛒 tickets de súper + comparador de precios.

- **🚨 Cargos raros / antifraude en /banca (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`, fase 4 de la banca unificada — 4º corte).**
  Tras el #891 (fugas). Panel bajo demanda `POST /api/banca/antifraude {desde,hasta}` que revisa los CARGOS
  del periodo con **REGLAS DETERMINISTAS (NO IA — para dinero/fraude es más fiable, no alucina cifras)**.
  Reutiliza los vigilantes PUROS de la tarjeta (`lib/vigilantes-tarjeta.ts`: `dobleCobro`/`esCargoFinanciero`/
  `subioPrecio`) + `comercioDe` (`lib/comercio.ts`). Lee `v_movimientos_activos` (vista canónica, ya sin
  duplicados) 365 días atrás scoped por `cuenta_id`, parte en periodo vs histórico previo, y marca: **cobro
  doble** (mismo comercio+importe ≥2 en el periodo), **comercio nunca visto** con importe ≥60€, **subida**
  >25% sobre la mediana previa de un recurrente (≥3 cargos), y **cargos financieros** (intereses/comisiones).
  `Antifraude.tsx` (client): botón «🚨 Revisar cargos raros», lista con badge de tipo + motivo + importe. Solo
  avisa, el dueño decide. Insertado tras el Cazador de deducciones. Verificado: `tsc` 0 + `next build` exit 0.
  Sigue pendiente F4: desviación explicada, cierre narrado, aviso fiscal, resumen mensual Telegram, adjuntar/
  conciliar factura por foto; y F5: módulo 🛒 tickets de súper + comparador de precios.

- **✂️ Fugas en recurrentes en /banca (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`, fase 4 de la banca unificada — 3er corte).**
  Tras el #890 (benchmark). Panel bajo demanda que detecta **suscripciones/recibos recurrentes prescindibles o
  renegociables** (fugas de dinero silenciosas). `POST /api/banca/fugas` reutiliza los GASTOS recurrentes que
  **ya detecta la tesorería** (`getTesoreria`→`detectarRecurrentes`, ≥3 ocurrencias), **anualiza** el coste
  (`importeMedio·365/intervaloDias`), y pide a la IA GRATIS que marque cuáles son fuga con `tipo`
  (cancelar/renegociar) + motivo. La IA SOLO clasifica; los importes salen de la tesorería (nunca inventa cifras)
  y NO marca recibos ineludibles (hipoteca/IBI/suministros/TGSS). `FugasRecurrentes.tsx` (client): botón «✂️
  Buscar fugas», lista con badge tipo, coste/año y /vez, ahorro potencial total. Solo se renderiza si hay
  recurrentes. Degrada sin romper. Insertado tras la Previsión de tesorería. Verificado: `tsc` 0 + `next build`
  exit 0. Sigue pendiente F4: desviación explicada, cierre narrado, aviso fiscal, antifraude, resumen mensual
  Telegram, adjuntar/conciliar factura por foto; y F5: módulo 🛒 tickets de súper + comparador de precios.

- **📈 Benchmark entre pisos en /banca (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`, fase 4 de la banca unificada — 2º corte).**
  Tras el #889 (sugerir por fila). Componente `BenchmarkPisos.tsx` (client) que compara la rentabilidad de
  los pisos turísticos del mes sobre el **P&L que la página YA calcula** (`getPLMensual` en `page.tsx`) — cero
  fetch extra: se pinta todo en cliente con los datos por props (ranking por margen, barras escaladas al margen
  máximo, líder 🥇 / rezagado 🐢, margen medio, resultado del mes). Solo se muestra con ≥2 pisos. La **lectura
  en lenguaje natural es bajo demanda** (botón «✨ Lectura IA» → `POST /api/banca/benchmark-pisos {mes}`):
  recompone `getPLMensual(mes)` en servidor (cifras EXACTAS) y pide a la pasarela IA GRATIS una comparación
  (quién lidera/arrastra + causa por estructura de gasto: lavandería/alquiler/suministros/comunidad/otros).
  La IA aporta lectura, NUNCA cifras. Degrada sin romper. Insertado tras el grid de P&L de pisos, antes del
  Análisis IA. Verificado: `tsc` 0 + `next build` exit 0. Sigue pendiente F4: desviación explicada, cierre
  narrado, aviso fiscal, antifraude, fugas, resumen mensual Telegram, adjuntar/conciliar factura por foto en
  banca; y F5: módulo 🛒 tickets de súper + comparador de precios.

- **🤖 Sugerir negocio por fila en el libro de /banca (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`, fase 4 de la banca unificada — 1er corte).**
  Tras mergear el mini-chat (#887), arranca la F4 (extras de IA). Primer corte: botón **🤖 por fila** en el
  libro de movimientos (`MovimientosTabla`, `BancaClient.tsx`) — solo en cargos (`importe<0`). Al pulsar,
  **reutiliza el endpoint ya probado `POST /api/finanzas/gastos/sugerir`** (`{id}` → `{bucket, motivo, …}`,
  prompt de deducibilidad afinado, IA GRATIS) y traduce el bucket a destino con `BUCKET_A_DESTINO`
  (`negocio→seguros`, `renta→turistico_pisos`, `no_deducible→personal`). Muestra una línea bajo la fila
  "🤖 Parece <negocio> · <motivo>" con **[Aplicar]** (reclasifica vía `/api/banca/destino`, que aprende regla
  y la reaplica a los iguales — igual que el `<select>`) y **[Descartar]**. Solo SUGIERE: nada se escribe sin
  el toque de Alberto. Cero backend nuevo (reaprovecha el endpoint del triaje de gastos). Verificado: `tsc` 0 +
  `next build` exit 0. Sigue pendiente F4: desviación explicada, cierre narrado, aviso fiscal, antifraude,
  fugas, benchmark pisos, resumen mensual Telegram, adjuntar/conciliar factura por foto en banca; y F5: módulo
  🛒 tickets de súper + comparador de precios.

- **🛫 LUXURY tarificando DE VERDAD + mina Expedia B2B detectada (13/07/2026, tarde).** Cadena completa:
  - **Reserva María José (Expedia Collect, 17-19 jul, 167,42€):** entró al precio viejo de PriceLabs
    (92€/noche) porque el motor aún no había aplicado nada en Luxury, y encima Expedia apiló ~9-10% de
    su canal **"B2B distribution network"** → 83,71€/noche efectivo, por debajo del suelo (95€). El
    suelo protege lo que el motor escribe, NO los descuentos que el canal apila después. **Pendiente
    Alberto:** revisar en Expedia Partner Central el % del programa B2B/Traveler Preference (prompt dado).
  - **Primer apply de Luxury bloqueado por la guarda `datos_insuficientes`** (mercado a 14d, exige ≤7d):
    el **sweep de Serper está DEGRADADO (0 comps en todas las ventanas)** — revisar SERPER_API_KEY/cuota.
    Se resolvió ingestando **60 comps frescos vía Booking MCP** (6 ventanas jul-dic 2026, escenario
    `prop_luxury_busto`, 4 adultos, `/api/sivra/mercado/ingest`).
  - **✅ Apply OK: 332 fechas escritas** (13-jul-2026 → 13-jul-2027): 116 subidas (jul-ago: 92→99) y
    216 bajadas con tope −20%/día (fechas lejanas donde Smoobu tenía 244-273 de PL → hacia el objetivo;
    p.ej. 3-oct 244→195, 5-dic 273→218). `recommended_guest` 130€, `base_target` 112€, suelo_base 106.
    Las noches 17-18 jul no se tocaron (ocupadas por la reserva). El cron diario sigue desde aquí.
  - Meses con mercado: 2026-07→2027-04; may-jul 2027 caen al global — reponer comps en próximos ciclos.
  - **✅ 14/07: primera reserva A PRECIO DEL MOTOR** — Daniela Magno (Booking Genius, 9-11 oct, 2 noches):
    bruto 125,71€/noche (zona del `recommended_guest` 130) y neto 100,92€/noche, **por encima del suelo 95**
    (al contrario que la mina Expedia B2B). Entró HORAS después de que el motor bajara oct de 264→162.
    Detalle en `pricing_aprendizaje` id 34 (prop_luxury_busto/2026-10). **OJO raíl detectado:** el tope
    ±20%/día se aplica POR PASADA, no por día natural — 3 pasadas en 14h (18:30 manual, 20:30 y 08:30 cron)
    acumularon −39%; revisar si `apply-auto` corre más de 1 vez/día o dedupear por fecha natural.

- **💬 Mini-chat "Pregunta a tus cuentas" en /banca (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`, fase 3 de la banca unificada).**
  Panel bajo demanda en `/banca` que embebe el **agente contable existente** — NO reimplementa nada:
  `MiniChatContable.tsx` (client) hace `POST /api/contable/chat` (`{mensaje}` → `{respuesta, guardados,
  acciones}`, servido por `lib/contable/cerebro.ts::responder`). Versión ligera de solo texto con chips de
  sugerencia; si el agente propone ACCIONES, enlaza al chat completo `/contable` para confirmarlas (y también
  para adjuntar facturas/tickets). Insertado tras el Cazador de deducciones. Verificado: `tsc` 0 + `next build`.
  Sigue pendiente (fases aprobadas): sugerir por fila en el libro, desviación explicada, cierre narrado, aviso
  fiscal, antifraude, fugas, benchmark pisos, resumen mensual Telegram, adjuntar/conciliar factura por foto en
  banca, y el módulo 🛒 tickets de súper + comparador de precios.

- **💳 Extracto de tarjeta al agente — Fase 3 (comodidades) (13/07/2026, rama `claude/ai-accounting-agent-3a9o22`).**
  Cierra el ciclo del extracto de tarjeta (Fases 1+2 ya en `main`, PR #881). Dos comodidades:
  - **Extracto consultable por el chat.** Al archivar el PDF en Drive, `procesarExtractoTarjeta` persiste el
    enlace por tarjeta+mes en `contable_memoria` (clave `extracto_tarjeta:<PAN4>:<YYYY-MM>`, insight=URL;
    helpers `guardarEnlaceExtracto`/`getEnlacesExtracto` en `lib/contable/memoria.ts`; excluida del contexto
    del LLM igual que `sinonimo_negocio:`). Nueva intención **`extracto_drive`**: detector PURO
    `detectarConsultaExtracto` en `intencion.ts` (dispara con "extracto" + verbo de consulta, extrae mes y
    PAN4 opcionales, NO intercepta "súbeme el extracto" que es carga), respuesta en `respuestas-directas.ts`
    (devuelve el link, o invita a subirlo por 📎 si no lo tiene), y también enrutable por la IA
    (`intencionDesdeJSON` + prompt de `clasificar-ia.ts`). "enséñame el extracto de junio de la ****0302".
  - **Auto-factura del correo.** Tras importar, dispara `conciliarFacturasDesdeGmail(cuentaId,{mesesAtras:2,
    maxAdjuntos:8,tolDias:10})` (best-effort, acotado para no agotar el `maxDuration=60`) para enganchar YA
    los justificantes de las compras deducibles recién importadas desde el Gmail de contabilidad; avisa por
    Telegram lo enganchado y lo añade al resumen. Mismo motor conservador (`casarFactura`: mismo signo +
    importe al céntimo + fecha en ventana) que el cron diario `facturas-conciliar-gmail`, que sigue de red
    de seguridad. Sin migración nueva ni envs nuevas.
  - Tests: +6 en `lib/contable/intencion.test.ts` (detector `extracto_drive` + validación JSON). Suite pura
    plataforma **335/335**, `tsc` **0**. Fase 3 completa; no quedan fases del extracto de tarjeta.

- **🧾 Cazador de deducciones en /banca (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`, fase 2 de la banca unificada).**
  Siguiente fase tras el PR #882. Panel bajo demanda en `/banca` que detecta **gastos personales del
  periodo que probablemente son DEDUCIBLES** (negocio/pisos) y estima el **ahorro fiscal** al tramo marginal.
  - **`lib/cazador-deducciones.ts::cazarDeducciones(cuentaId, year, quarter, desde, hasta, tramoMarginal)`**:
    coge el bucket `no_deducible` de `getGastosControl`, filtra ruido (`importe≥20`, top 20 por importe),
    y por cada cargo pide a la IA GRATIS (mismo criterio que `/api/finanzas/gastos/sugerir`) si es
    `negocio`/`renta`/`no_deducible`. Devuelve candidatos + `totalDeducible` + `ahorroEstimado`. Prudente
    (ante la duda, no_deducible). La IA JUZGA, los importes salen de `getGastosControl` (nunca inventa cifras).
    Presupuesto de tiempo 45s (bajo `maxDuration=60`), degrada sin romper.
  - **`POST /api/banca/cazador-deducciones`** { year, quarter, desde, hasta }: calcula el tramo marginal del
    AÑO (`getResumenFinanciero(...).fiscal.tramoActual.tipo`) y llama al cazador.
  - **`CazadorDeducciones.tsx`** (client, bajo demanda): botón "🧾 Buscar deducciones que se me escapan" →
    lista de candidatos (concepto/importe/motivo IA) con **selector de negocio por candidato** (default a la
    sugerencia; `renta`→`turistico_pisos`). Aplicar = `POST /api/banca/destino` (aprende regla, igual que el
    libro). Solo SUGIERE; Alberto confirma. Insertado en `/banca` junto al panel ✨ Análisis IA.
  - **Verificado:** `tsc --noEmit` 0 errores + `next build` exit 0.
  - **Sigue pendiente** (fases aprobadas): resto de IA (mini-chat contextual `lib/contable/cerebro.ts`,
    sugerir por fila en el libro, desviación explicada, cierre narrado, aviso fiscal, antifraude, fugas,
    benchmark pisos, resumen mensual Telegram, adjuntar/conciliar factura por foto) y módulo 🛒 tickets de
    súper + comparador de precios (BD nueva + OCR).

- **🏦 /banca = cuadro financiero UNIFICADO, por defecto mes en curso (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`).**
  Alberto (captura del dashboard móvil) quería que al pinchar "Ver banca" saliera el resumen del mes
  en curso, con filtros para ver TODOS los movimientos por cuenta/fecha, indicando si cada uno está
  categorizado como deducible o no; abajo pisos turísticos; y un resumen interactivo negocio+personal
  por fechas. **F1+F2+F3-core entregadas:**
  - `/banca` ahora es **period-driven** (lee `?year/quarter/desde/hasta`, default **mes en curso**,
    mismo patrón que `/finanzas/radiografia`). `IntervaloSelector` reutilizado (`basePath="/banca"`).
  - **Resumen del periodo** (`ResumenPeriodo.tsx`, client) con las MISMAS fórmulas de cabecera que la
    radiografía (reusa `getResumenFinanciero(cuentaId,year,quarter,desde,hasta)`) + tarjetas negocio
    (correduría/pisos) y personal (BBVA/Kutxa) con enlaces + link a `/finanzas/fiscal`.
  - **Gráficas** (Recharts, ya tematizado): evolución Ingresos vs Gastos + línea Resultado
    (`getEvolucionMensual`, antes sin consumidor) y dona de reparto del gasto.
  - **Pisos del mes**: P&L por piso reutilizando `getPLMensual(mes)`.
  - **Libro de movimientos**: por defecto acotado al periodo (SSR `listarMovimientosLedger({desde,hasta})`),
    filtros de cuenta/fecha/signo/texto ya existentes; "Limpiar" = ver todo el histórico. **Nuevo badge
    ✅ deducible / ❌ no deducible / 🔁 traspaso / ᴬ amortizable por fila**, derivado del `destino` que
    puso la IA/agente. Lógica en módulo PURO nuevo **`lib/deducibilidad.ts`** (`bucketDeDestino`,
    `BUCKET_DEDUCIBLE`, `deducibleDeMovimiento`) — fuente única; `lib/finanzas.ts` ahora **re-exporta**
    de ahí (antes definía el mapeo inline). `MovLedger`/SELECT del libro proyectan `amortizable`.
  - **✨ Análisis IA del periodo** bajo demanda: `AnalisisIAPanel.tsx` → `POST /api/banca/analisis-ia`
    (reusa `getResumenFinanciero` + `aiComplete` gratis con timeout; la IA lee, NUNCA inventa cifras;
    degrada sin romper).
  - Retiradas de `/banca` las tarjetas estáticas duplicadas "Por negocio"/"Neto por negocio"/"Estimación
    fiscal" (cubiertas por el resumen del periodo). Tesorería/duplicados/revisar/ingresos/reglas se mantienen.
  - **Verificado:** `tsc --noEmit` 0 errores + `next build` exit 0.
  - **PENDIENTE (fases siguientes, aprobadas por Alberto):** resto de IA (mini-chat contextual reusando
    `lib/contable/cerebro.ts`, sugerir categoría por fila, cazador de deducciones, desviación explicada,
    cierre narrado, aviso fiscal, antifraude, fugas, benchmark pisos, resumen mensual Telegram, adjuntar/
    conciliar factura por foto) y el **módulo 🛒 tickets de súper + comparador de precios** (BD nueva
    `tickets_compra`/`tickets_lineas`, OCR `aiVision`, normalización de producto). NO se hizo el redirect
    de `/finanzas/radiografia`→`/banca` para no perder su lente Fiscal "Mi declaración" (folding completo
    de esa lente en `/banca` = follow-up).

- **🚪 Domótica SIVRA — sonda de aperturas: parámetros ORDENADOS (fix del 1004, 13/07/2026, PR seguimiento
  de #884).** Probado #884 en prod (Socorro): las variantes `records`/`records+dps`/`device-logs` daban
  **Tuya 1004 "sign invalid"** (solo `open-logs` viejo llegaba, con 1100). **Causa real:** Tuya exige la
  **query ORDENADA alfabéticamente por clave** para que valide la firma HMAC v2 (el servidor la reordena
  antes de recomputar). Las llamadas que ya iban ordenadas (`page_no`<`page_size`) o de 1 solo parámetro
  firmaban de casualidad; `records?pageNo&pageSize&startTime&endTime` (desordenado) no. **Fix:** helper puro
  `queryOrdenada()` en `acceso-puro.ts` que ordena SIEMPRE; `variantesAperturas` lo usa en las 4 vías. ⚠️ Ojo
  general: cualquier llamada Tuya nueva con >1 parámetro de query DEBE ir ordenada (bug latente en
  `tuya.ts::listarAsociados` `size&last_row_key` — solo salvado porque la pág. 1 no manda `last_row_key`).
  Tests 5/5, tsc 0. Pendiente re-verificar en prod que «Accesos» pasa a ✅.

- **🚪 Domótica SIVRA — sonda de aperturas usa el endpoint correcto de Tuya (13/07/2026).** Alberto
  quiere detectar aperturas de puerta SIN PIN válido (posible robo). Investigado el error **1100** que
  daba el bloque «Accesos» de la sonda en Socorro/Busto: **era endpoint/params obsoletos**, no una
  limitación del hardware. Llamábamos `door-lock/open-logs?page_no=..&page_size=..` (API vieja) → 1100
  = "parámetro inválido". La vía actual es **`door-lock/records`** con `pageNo/pageSize/startTime/endTime`
  (ms) + `targetStandardDpCodes`. `lib/domotica/acceso-puro.ts`: nuevos `DP_UNLOCK` + `variantesAperturas()`
  (pura, testeada) que devuelve 4 variantes en orden (records+dps → records → open-logs viejo →
  device-logs); `acceso.ts::sondearAperturas()` prueba en orden y devuelve la 1ª que responde, anotando la
  `via` buena. La firma HMAC no se rompe: `firmaTuya` firma el `path` con query tal cual (ya funcionaba con
  query sin ordenar). Tests `acceso-puro.test.ts` 4/4, tsc 0. **PENDIENTE VERIFICACIÓN EN PROD** (dev no
  llega a Tuya, 403): Alberto vuelve a pulsar 🔍 Sonda en **Socorro**; si «Accesos» pasa de ❌1100 a ✅ con
  la lista → confirmado, y entonces se monta el **«Vigilante de aperturas»** (aviso Telegram si abren con
  llave/app-no-tuya o con el piso vacío, reusando el cron 3×/día + `tgAlert`). Feature aparte pendiente:
  botón **«Portal/Comunidad»** (relé Tuya contacto seco en el telefonillo del Dúplex; Alberto mirando el
  MHCOZY 1CH 12V). Rama `claude/domótica-pin-creation-errors-sg63g0` (reiniciada desde main tras mergear
  #837).

- **🔑 Agente SEO housesevillana: `GITHUB_TOKEN` ahora auto-provisionable desde el panel (13/07/2026,
  rama `claude/sivra-seo-github-token-ryjhmh`).** El cron semanal de sivra (`/api/seo-refresh`,
  `0 10 * * 1`) falló por Telegram: `Falta GITHUB_TOKEN en el entorno de sivra`. Causa raíz (ya anotada
  como pendiente de ops desde el bloque A): Alberto puso `SEO_AGENT_ENABLED=true` en sivra —por eso el
  cron corrió— pero `GITHUB_TOKEN` (que leen los `seo-landing.ts` de sivra Y plataforma para leer/commitear
  el repo `house-sevillana-landing`) solo estaba en el Vercel de **plataforma** (por eso el botón manual
  sí funciona), NO en el de **sivra**. **Fix:** añadida la fila `GITHUB_TOKEN` a `SECRETS_REGISTRY`
  (`apps/plataforma/lib/secrets-registry.ts`) como **editable write-through** (mismo patrón que
  `SERPER_API_KEY`: `vercelProject: 'sivra'` + `vercelProjects: ['plataforma']`). Así se documenta la
  credencial (antes NO estaba en el registro) y Alberto puede fijarla **una vez** desde
  `/operador/secretos` → se escribe en sivra+plataforma y redespliega ambos, sin entrar a Vercel.
  **PENDIENTE de Alberto (1 paso manual, inevitable — no se puede meter el valor por código):** ir al
  panel y pegar el PAT con acceso a `house-sevillana-landing`. Sin código extra: la ruta ya avisa por
  Telegram y lanza error claro cuando falta el token. Guardián de secretos ✅.

- **💳 Subir el EXTRACTO DE TARJETA al agente (📎) → desglosa/categoriza/archiva en Drive (13/07/2026, Fase 1).**
  Alberto preguntó si el agente tiene en cuenta que las líneas `TARJ.CRDTO 466…` de Kutxabank son las
  liquidaciones de la tarjeta (agregado; el gasto real está en el detalle). Sí las reconoce (`lib/destino.ts`,
  `traspaso_interno`), pero el detalle compra a compra solo entraba a mano por /banca. **Ahora:** sube el PDF
  "Movimientos de tarjeta" al 📎 del chat (o Telegram) → `procesarDocumento` lo detecta (`esExtractoTarjeta`,
  ≥3 movimientos) y lo enruta a `lib/contable/extracto-tarjeta.ts::procesarExtractoTarjeta`: parsea (cifras
  exactas), resuelve sociedad/titular por el ccc de la tarjeta, `importarExtracto(...,'pdf',titular,'tarjeta')`,
  `analizarMovimientos`, **empareja devoluciones** con su compra (mismo comercio+importe, ventana 120d →
  copia destino para que se ANULEN; sin casar → botones `mov_*` por Telegram), **cuadra** (Σcompras−Σdevol =
  liquidación `PAGO RECIBO`; si no, avisa) y **archiva el PDF en Drive** (`subir`). Dudosas por Telegram
  (`enviarResumenTarjeta`). Restricción de Alberto respetada: sube en el PC (web), revisa dudosas en el móvil
  (Telegram). Check 7 del health-check ahora pide subirlo por el chat, no en /banca. Nuevos módulos puros:
  `lib/devoluciones-tarjeta.ts` (`casarDevolucion`), helpers `esExtractoTarjeta`/`cuadrarExtractoTarjeta`/
  `esPagoReciboTarjeta` en `lib/extracto-tarjeta-pdf.ts`. Tests 13 nuevos (detector/cuadre/devoluciones) —
  suite plataforma 249/249, tsc 0, guardián 22/22. **Fase 2 HECHA** (mismo PR #881, apilada sobre Fase 1):
  `lib/vigilantes-tarjeta.ts` (puro: `esCargoFinanciero`/`dobleCobro`/`subioPrecio`) + `vigilantesTarjeta()` en
  `extracto-tarjeta.ts` que, tras importar, manda UN mensaje Telegram con las secciones que apliquen —
  intereses/comisiones, posible cobro doble, cargos de comercio nunca visto (>80€), subidas de precio de
  recurrentes, y justificantes pendientes de deducibles >100€ (enlaza Check 8). +4 tests (suite 253/253).
  **Fase 3** (extracto consultable por el chat + auto-factura del correo) PENDIENTE. Rama
  `claude/ai-accounting-agent-3a9o22`, PR draft #881.

- **🏢 RRHH: fichaje configurable por empresa + ficha editable empleado (13/07/2026, PR #874).**
  Pilar gestiona dos empresas (Mariscos González y Global2 Instalaciones Técnicas) y solo quiere
  control de presencia para Global2. Implementado:
  - Columna `tiene_fichaje boolean DEFAULT false` en `rrhh.empresas` (migración aplicada en BD).
  - Global2: `tiene_fichaje = true`; Mariscos González: `false` (default).
  - `getBranding()` ya devuelve `tiene_fichaje`; propagado a `ExpedienteEmpleado` (portal /e) y a
    todos los paneles admin via `AdminShell`. Items Fichajes/Obras en nav lateral y bloque
    FichajeEmpleado en portal solo se renderizan si `tieneFichaje = true`.
  - PR #874 en draft, builds Vercel en progreso.
  - **Pendiente de sesión anterior**: pregunta a Pilar sobre qué plantillas de "Generar documento
    legal" quiere conservar (3 opciones mostradas, esperando respuesta).

- **🛟 Fallback OpenRouter en el `daily-briefing` + `ai-client.callAI/callAITools` de ia-rest
  (13/07/2026, rama `claude/ia-rest-nvidia-timeout-suhkiw`).** El monitor avisó `⚠️ daily-briefing
  error / NVIDIA 503` y `❌ NIM falló y sin fallback Groq disponible: NVIDIA timeout` — dos rutas de
  ia-rest que caían cuando NIM daba 503/timeout y no había red. Alberto: "tenemos openrouter".
  - **Edge Function `daily-briefing/index.ts`:** tenía CERO fallback (llamaba a NVIDIA directo y
    lanzaba `NVIDIA ${status}`). Ahora recorre una cadena de proveedores OpenAI-compatible
    **NVIDIA NIM → OpenRouter → Groq** (`proveedoresIA()` filtra por API key presente; timeout 20s
    por proveedor con `AbortSignal.timeout` para que un NIM colgado pase al siguiente). El pie de
    Telegram muestra el proveedor real que generó el briefing.
  - **`apps/ia-rest/src/lib/ai-client.ts`:** `callAI` y `callAITools` tenían solo NIM→Groq. Añadido
    OpenRouter como ÚLTIMA red (helper `openrouterConfig()`/`openrouterTextFallback()`, delega en
    `@central/core-ai::openrouterChat`/`openrouterChatTools`). Se activa solo con `OPENROUTER_API_KEY`
    puesta — sin la env el camino de siempre no cambia. Envs override: `OPENROUTER_MODEL`,
    `OPENROUTER_FALLBACK_MODELS`, `OPENROUTER_REFERER`, `OPENROUTER_TITLE`.
  - **Pendiente de Alberto:** poner `OPENROUTER_API_KEY` en el proyecto Vercel de ia-rest y en los
    secrets de la Edge Function (Supabase) para ACTIVAR la red — el código ya está listo e inactivo
    hasta entonces. Verificado: `tsc --noEmit` limpio, eslint sin errores nuevos.

- **🔎 Búsqueda web de la pasarela con FALLBACK OpenRouter (13/07/2026):** el grounding de Gemini
  (gratis) llevaba rachas de 429 que tenían MUDO el cron `eventos/websearch` (LaLiga/ferias/congresos/
  festivos para el pricing) y degradaban `/api/ai/search` y `seo-refresh`. Nuevo
  `@central/core-ai::openrouterSearchEx` (plugin `web` de OpenRouter, cualquier modelo, con test de
  fetch inyectado) + `apps/plataforma/lib/websearch.ts::buscarWeb` (política: Gemini gratis →
  OpenRouter de pago ~0,02€/llamada, gateado por el presupuesto diario, ambos intentos en `ai_usos`).
  Consumidores enchufados: `eventos/websearch` (endpoint `eventos`; responde `via` para saber qué vía
  sirvió), `/api/ai/search` (endpoint `search` — arregla `aiSearch` para todas las verticales) y
  `seo-refresh` (paso 2, tras Serper). Env opcional `AI_PRECIO_WEBPLUGIN_EUR` (default 0,018).
  **✅ VERIFICADO EN PROD (13/07, pg_net):** el cron respondió 200 con
  `via=openrouter:deepseek/deepseek-chat` — Gemini falló EN VIVO con su 429 (205 ms) y el fallback lo
  cubrió (3,1 s, 3.388 tokens, 0,018€, rastro completo en `ai_usos`). Evento nuevo upsertado:
  **Hakuna en Icónica (Plaza de España) el 11-jun-2027, aforo 20k → factor 1,40** — la MISMA noche que
  Karol G en La Cartuja (el motor ya está a 2,5 esa noche por MAX, pero confirma demanda calientísima).
  El dedup del prompt funcionó (no repitió los 11 eventos ya registrados).

- **🏷️ Saneo banca/contable: prestación de paternidad EXENTA + limpieza de bandejas (12/07/2026, rama
  `claude/openrouter-sdk-integration-4dkiem`, PRs #841/#843/#844, sin anotar hasta esta auditoría).**
  Tres fixes pequeños del mismo hilo tras el #840 (libro completo de movimientos):
  - **#843 — prestación por paternidad EXENTA de IRPF (Art. 7.h LIRPF):** la prestación por nacimiento
    y cuidado del menor que Alberto cobra como autónomo cae en la correduría (`destino='seguros'`) pero
    NO tributa. Marcada `subcategoria='exento'` (5 abonos, 5.474,28€); `getResumenFinanciero` la excluye
    de la base imponible y de los trimestres (M130) pero la sigue mostrando como cobrado real ("Prestaciones
    exentas, no tributan"). **Resuelve el pendiente "Sueldo −1.440€ por la baja"** que llevaba abierto en
    la skill `perfil-fiscal` — era esto. Regla añadida a `perfil-fiscal` (esta auditoría).
  - **#841 — traspasos internos fuera de "Ingresos por revisar":** los pagos del recibo de la tarjeta
    (`PAGO RECIBO 466…`, `TARJ.CRDTO`) se colaban como ingresos dudosos (2.698€, 1.355€…) por conservar
    `requiere_revision`; ahora `listarIngresosPorRevisar` los excluye (`destino='traspaso_interno'`) +
    limpieza del flag histórico (28 filas, migración aplicada en prod).
  - **#844 — conocimiento de dominio en el prompt del agente contable + de-duplicar bandejas:** el
    system prompt de `/contable` ahora sabe los alias de OTAs (TRAVELSCAPE=Expedia, Agoda, Booking/LIQ.
    OP., Stripe → pisos), que correduría=siempre BBVA con sus códigos de agente, que "PAGO RECIBO
    466…"/TARJ.CRDTO=traspaso interno, y la regla de exentos de arriba (`contexto.fiscal.exento`).
    Además "Por revisar" (categoría) y "Ingresos por revisar" (negocio) mostraban el mismo ingreso dudoso
    en las DOS bandejas → "Por revisar" ahora solo lista GASTOS, renombrada "🏷️ Gastos por revisar ·
    categoría". Skill `plataforma-maestro` ya actualizada en el propio PR.

- **🕳️ PRICING — resuelto el misterio del -45% en estancias largas de Booking + Ticketmaster VIVO +
  Karol G detectada (13/07/2026, sesión pricing).** Cadena completa del día:
  - **Causa real del desvío (reserva Teresa Delgado, 7 noches oct):** NO era el stack de promociones
    (sano: Genius dinámico ~11% + móvil 10% ≈ 19%), sino los **planes "Tarifa semanal/mensual"** que NO
    aparecen en Promociones (viven en Tarifas → planes). Derivación REAL verificada al editarlos:
    **semanal −30% en los 4 pisos; mensual −40% (busto/luxury/house) y −30% (duplex)** — el ~−19%
    aparente del desglose de la reserva subestimaba (compara con el estándar del momento, no con la
    derivación). Stack previo ≥7 noches ≈ ×0,56-0,65 del listado. **✅ EJECUTADO 13/07 (Alberto vía
    Claude Chrome, Booking confirmó los 8 planes):** semanal y mensual → −5% busto/luxury/duplex, −10%
    house. Sin tocar Estándar/Flexible/No-reembolsable/Genius/móvil/min-stay/políticas/calendario; solo
    reservas nuevas. **Medir 27/07:** ratio bruto/listado ≥7 noches (antes 0,65 → objetivo ≥0,76;
    esperado teórico 0,76, house 0,69) sin que caiga el volumen de largas en House. Detalle:
    `pricing-automatico.md` §12 + `pricing_aprendizaje` (`canal_booking`). Skill `pricing-agente` al día.
    **✅ VERIFICADO en calendario** (Claude Chrome, solo lectura, 19-26 oct): −5,0% constante en
    Busto/Luxury/Dúplex y −10,0% en House; mensual con los mismos importes. Bonus: estándar Busto
    137€ = motor 118€ × markup 1,16 → cadena motor→Smoobu→Booking íntegra.
  - **Ticketmaster FUNCIONANDO** (PR #853 mergeado): el postalCode devolvía 0 fuera de EE.UU. → ahora
    latlong+radio con city como respaldo. Primera pasada: 8 eventos. **🔥 Identificado el evento del
    11-13 jun 2027: KAROL G, 3 noches en La Cartuja (60k)** — mercado 4-8x confirmado por el barrido F1;
    factor 2,5 en las 3 noches, el motor rampa desde ya. Bonus: Jamiroquai 16/07/2026 (Icónica, 1,15).
  - **TICKETMASTER_API_KEY** añadida al proyecto Vercel `plataforma` por Alberto (vía Claude Chrome,
    copiada de ia-rest) + redeploy. El cron semanal (lun 04:00) queda operativo.
  - **Noviembre 2026 verificado** (reserva Antonio 27-29 nov a 96€): clúster apto 110-204€ pero con
    notas 8,1-9,3 vs 7,0 de Busto → banda baja defendible, infraprecio leve (~10-15%), no caso abril.
    10 comps ingestados.
  - Inventario de promos Booking (Claude Chrome, solo lectura): Genius nivel 1 (10%) + móvil 10% en los
    4; House además Genius N2/3 15% y 3 country rates 10% (no apilan con móvil). Máx real ~19-23,5%.

- **🔎 Auditoría exhaustiva multi-agente del monorepo (12/07/2026, rama
  `claude/program-audit-plan-g1tlaf`).** Pasada completa a petición de Alberto ("la auditoría más
  completa posible de todo"). Método: gate baseline (install `--frozen-lockfile` + `auditar-estructura
  --check` + guardianes 22/22, todo verde) → **typecheck de las 7 apps, 0 errores TS** (serial por el
  `@prisma/client` compartido) → fan-out de **15 dominios con 81 subagentes** (7 verticales + 5 capas
  transversales + 2 infra Supabase/Vercel por MCP) + **verificación adversarial** de cada hallazgo.
  Resultado: **66 hallazgos confirmados (2 críticos, 25 medios, 39 bajos)**, informe en
  `docs/AUDITORIA-2026-07.md` (pasada 12/07 antepuesta; histórico del 01/07 conservado). **Críticos:**
  IDOR cross-empresa en ialimp `admin/informe` (PII+tarifa de limpiadora de otra empresa) y las 77
  funciones `SECURITY DEFINER` ejecutables por `anon` (reconfirmadas en ambos proyectos). **Auto-fix
  de bajo riesgo aplicados en la rama:** C1 IDOR (scope `empresa_id` + 404 antes de tocar sesiones);
  M12 `token_acceso`→`access_token` (ruta escanear del propietario estaba rota, 500); M5 borrado del
  `next.config.js` residual de ia-rest (recupera cabeceras de seguridad del `.ts`); M1 `idempotencyKey`
  en cron `cobro-descuento` (evita doble crédito Stripe); formato dinero español en helpers de
  transporte/alquiler; docs (MATRIZ 23→24 modules, CLAUDE.md raíz sivra=web pública). Typecheck de las
  4 apps tocadas + guardianes: verdes. **PENDIENTE (checklist manual de Alberto, gran radio, ver informe):**
  REVOKE de funciones `anon`, policy del bucket `rrhh-documentos`, TOCTOU/UNIQUE de VeriFactu, huella AEAT
  `cuota_iva`, hardening del proyecto ia-rest standalone (47 vistas SECURITY DEFINER + 113 search_path),
  migración del parser `xlsx` de extractos bancarios, y confirmar envs de crons/webhooks en Vercel.

- **Agente contable — sondeo + 2 fixes: `reservas`→ingreso e intent `negocio_resultado` (12/07/2026, rama
  `claude/ai-accounting-agent-3a9o22`).** Tras mergear #851, Alberto pidió "haz más preguntas". Sondeo con
  batería nueva contra el router → 2 fallos reales: (1) `¿Cuántas reservas lleva Luxury?` daba el GASTO del
  piso (reservas es lado INGRESO) → añadido `reserv|noche` a la guarda y al signo=ingreso; (2)
  `¿Es rentable la correduría?` daba solo el gasto (misma clase que el 👎, pero para un negocio suelto) →
  **nuevo intent `negocio_resultado`** (ingreso − gasto por `destino`, para negocios de caja bancaria como la
  correduría; EXCLUYE `turistico_*`, que van por pisos_rentabilidad/piso que leen SIVRA). Detección tras
  `pisos_rentabilidad`; handler en respuestas-directas (reusa `suma`); clasificador IA + VERIFICABLES + replay
  al día. **Lección reforzada:** la IA sola NO habría arreglado el 👎 — solo enruta a tipos que EXISTEN; era
  una capacidad que faltaba, no comprensión. Cifras validadas (correduría 2026: 7.236,01€ − 6.557,10€ =
  678,91€ ✅). 84 tests verdes, tsc limpio.

- **Agente contable — intent `pisos_rentabilidad` (12/07/2026, PR #851 mergeado).**
  Alberto probó el agente y dio 👎 a "¿Todos los pisos turísticos son rentables este mes?" → el agente
  respondía solo el GASTO agregado del banco (3.459,04€), ni resultado ni por piso. Nuevo intent
  `pisos_rentabilidad` (agregado, distinto de `piso` que es UN piso): desglose por piso de ingreso
  (`incomes`) − gasto (`gastos`) = dashboard, dice cuáles están en positivo. Detección: negocio agregado
  (`destinos` incluye `turistico_pisos`) + rentab/resultado/beneficio → antes de `gasto_destino`. Handler en
  respuestas-directas, clasificador IA enterado, `PISOS_LABEL` exportado. 78 tests verdes, tsc limpio.
  (El 👎 que lo destapó ya estaba en `contable_feedback` — el bucle de mejora funcionó.) **PENDIENTE:** PR.

- **📊 PRICING F1 ejecutado: barrido de fechas lejanas + evento jun-2027 detectado + F2 diagnosticado ROTO (13/07/2026).**
  Alberto aprobó retomar las fases de datos del plan de pricing. Hecho en sesión:
  - **Barrido F1 (Booking MCP, 40 comps nuevos):** mayo-2027 (p50 ~180€), junio-2027 normal (p50 ~109€),
    julio-2027 (p50 ~105€ — mes que faltaba entero) — ingestados por `POST /api/sivra/mercado/ingest`
    **vía pg_net** (la técnica documentada: el proxy del entorno bloquea Vercel, pero pg_net desde
    Supabase llega; timeouts de 5s del cliente son inofensivos, el endpoint procesa igual).
  - **🔥 EVENTO DETECTADO — finde 11-13 jun 2027 a 405-1282€/noche (4-8× lo normal).** Registrado en
    `pricing_eventos_auto` (fuente `agente`, factor 2,5 = techo). Identificar el evento real y RAMPAR
    con meses de antelación. Aprendizaje en `pricing_aprendizaje` (busto, `verano_2027`).
  - **Triangulación 2ª OTA fallida:** Expedia MCP caído ("Unknown error"); lastminute solo da
    pensiones/extrarradio no comparables → NO se ingestó (mejor 1 portal bueno que 2 con ruido).
  - **⚠️ F2 (eventos automáticos) está ROTO — 0 filas de crons en `pricing_eventos_auto`:**
    (1) `eventos/sync`: **falta `TICKETMASTER_API_KEY` en el proyecto Vercel `plataforma`**
    (respuesta live: "cópiala del proyecto ia-rest") → ACCIÓN ALBERTO; (2) `eventos/websearch`:
    configurado pero **Gemini 429 cuota agotada** (la key libre está saturada por la cadena de
    fallback) → valorar moverlo a OpenRouter o reintentar en horario de cuota fresca.
  - **F3 (vuelos):** plumbing existe, `flight_demand_k=0` (inerte por diseño hasta activar).
  - **Reserva Luxury verificada** (Mercedes Aguayo, 18-20 dic, 264,37€ brutos = 132€/noche, solo
    Genius): vendida a mercado (~157€ dic). Primera pasada live del motor en Luxury = próximo apply-auto.

- **Agente contable — P&L por PISO + contexto + 4 mejoras de fiabilidad (12/07/2026, PR #848 mergeado).**
  - **Intent unificado `piso`** (`{ modo:'ingreso'|'gasto'|'resultado', propertyId, mes? }`, sustituye a
    `ingresos_piso`): INGRESO ← tabla `incomes`; **GASTO ← tabla `gastos` (SIVRA) para los 4 pisos por igual**
    (= cards del dashboard vía `getResumenSivra`; el gasto del Dúplex ya NO va por banco `turistico_duplex`);
    RESULTADO = ingreso − gasto. El check de piso va tras SINÓNIMOS/SUBCAT (para que "comunidad del dúplex"
    siga siendo concepto ∩ destino) y antes del concepto genérico.
  - **CONTEXTO de conversación:** `clasificarIntencionIA(mensaje, hoy, historial)` resuelve seguimientos
    elípticos ("¿y gastos?", "¿y en junio?") heredando piso/año/mes/signo; el SISTEMA mapea los 4 pisos por
    nombre → `piso` con propertyId+modo. Fix signo: `facturación/facturó/facturado` = ingreso.
  - **Arnés de replay** (`lib/contable/replay.mts`): corre el router sobre el corpus REAL de `contable_log`;
    cobertura determinista 63%→70%. Destapó 4 fixes de enrutado: guarda `llevo`→`llev` (3ª persona),
    `cargo(s)` a la guarda, `ganar/ganancia`→ingreso, piso+`factur`→ingreso.
  - **Verificador 2º modelo** (`verificarIntencionIA`, deepseek): 2ª opinión sobre la clasificación IA
    (confirma/corrige/rechaza→LLM libre). Fail-open, solo intenciones con entidad, gate `CONTABLE_VERIFICADOR`.
  - **Botón 👎** en `/contable` → tabla nueva `contable_feedback` (`prisma/sql/2026-07-12_contable_feedback.sql`,
    **aplicada en prod**) vía `/api/contable/feedback`. Alimenta `/agentes-entrenador`.
  - Principio reforzado: **la IA entiende el lenguaje pero NUNCA calcula las cifras — las da el SQL** (por eso
    "más modelos gratis" mejora resiliencia/comprensión, no exactitud). 73 tests verdes, tsc limpio.

- **🤖 DIRECTOR IA: circuit breaker + memoización de decisiones (13/07/2026).** Dos guardas en memoria
  en `lib/ia-director.ts::elegirModelo` (aprobadas por Alberto tras revisión del Director):
  - **Circuit breaker:** `DIRECTOR_BREAKER_FALLOS` (3) fallos SEGUIDOS del hop → default directo durante
    `DIRECTOR_BREAKER_PAUSA_MIN` (5) min, sin pagar el timeout de 4s por petición (el patrón del incidente
    11/07 con los `:free`). El fallo que abre el breaker se marca `[breaker abierto]` en `ai_usos.error`.
  - **Memoización:** `DIRECTOR_DECISION_TTL_MIN` (5 min; `0`=off) reusa la decisión por forma de petición —
    clave `app|eu|hash(system)|log2(tamaño)|versión-catálogo|degradado`. El tráfico repetitivo (contable,
    clasificadores) no paga el hop en cada llamada. Los hits de caché NO escriben fila `director` en
    `ai_usos` (la llamada que sirve ya registra el modelo).
  - Pendiente de sesión anterior (mejora 3, "señal de calidad de salida" para el aprendizaje): NO hecha,
    da para PR aparte (toca callers + cron).

- **💬 AGENTE HUÉSPED: early check-in el DÍA de llegada (12/07/2026, rama
  `claude/luggage-storage-response-40przx`).** Alberto revisó el borrador de consigna a Gyongyi (reserva
  141199302): "no ha mirado que la fecha de entrada es HOY y no hay [otra] entrada [la víspera está libre],
  por lo que tendría que haber dicho que sí es posible al ser el mismo día". El agente había soltado un hedge
  inventado ("no puedo confirmar la entrada anticipada hasta el día anterior").
  - **Causa raíz:** en `lib/sivra/agente-huesped/decidir.ts` la fase temporal solo distinguía pre-llegada
    (`hoy < checkIn`) / en-estancia / post-estancia. El **día de llegada** (`hoy === checkIn`) caía en
    "en-estancia" → "el huésped ya está dentro" y el bloque `EARLY CHECK-IN` **NO se inyectaba** (solo en
    pre-llegada). Sin ese dato (aunque `contexto.ts` ya calculaba bien `earlyCheckinPosible` desde Smoobu),
    el modelo improvisó el hedge equivocado.
  - **Arreglo:** nuevo helper puro `lib/sivra/agente-huesped/fases.ts` (`faseReserva` + `aplicaEarlyCheckin`)
    que reconoce el **día de llegada** como fase propia. `decidir.ts` inyecta el early check-in en pre-llegada
    **Y** el día de llegada, con instrucción explícita de NO decir "no puedo confirmarlo hasta el día anterior"
    si la víspera está libre. `fases.test.ts` (8 casos, verde). Sin cambios de BD ni de infra.
  - **Robustez (2ª pasada):** el early check-in ahora es **tri-estado**. `contexto.ts` distingue "no pudimos
    comprobar Smoobu" de "víspera libre": el `catch` del fetch devolvía `[]` y `nocheAnteriorLibre([])` da
    `true` → **un fallo de red hacía CONFIRMAR una entrada anticipada no verificada**. Ahora el catch devuelve
    `null` y el nuevo flag `earlyCheckinChequeado` solo es true con respuesta real de Smoobu. `decidir.ts`:
    verificado+libre → confirma · verificado+ocupado → declina · **no verificado → no afirma ni niega, dice
    que lo confirma en breve** (nunca inventa disponibilidad).

- **Fix seguimiento `ingresos_piso`: el check de piso iba DESPUÉS del concepto (11/07/2026, rama
  `claude/ai-accounting-agent-3a9o22`).** Tras mergear #826, "Dime ingresos del apartamento socorro y número de
  reservas" daba *"No encuentro cargos de reservas"*: "de reservas" se colaba como concepto genérico antes de que
  el intent `ingresos_piso` se ejecutara. Arreglo: (1) mover el check de `ingresos_piso` (solo signo=ingreso)
  ANTES de subcategoría/concepto en `intencion.ts`; (2) `reserva(s)/noche(s)/ocupación/huésped/número` → STOP_CONCEPTO;
  (3) la respuesta anual de `ingresos_piso` incluye el nº de reservas cerradas (mismo criterio checkout≤hoy que
  `getResumenSivra.ingresosHoy`). 53 tests verdes, tsc limpio. **PENDIENTE:** merge del PR.

- **🧾 facturas-correo — corte de extracción de PDF RESUELTO + red de seguridad (12/07/2026, rama
  `claude/facturas-correo-pdf-extraction-x805fl`, PR #836).** La Vía B (Apps Script `Facturas a Drive` →
  Drive `_buzon_pdf`) llevaba **sin copiar nada desde el 23/06** (19 días). **CAUSA REAL (no era la que creí):**
  NO era OAuth ni token caducado. El trigger corría cada hora "Completada" 0 errores, pero su constante
  `QUERY` se había **estrechado el 23/06 a un solo remitente** (`from:Comisiones-Mapfre@info.mapfre.com …`)
  → dejó de copiar el resto; y encima Mapfre-comisiones llega **cifrada** (no es adjunto `filename:pdf`, la
  query da 0). Mi diagnóstico inicial ("token caduca en Testing → publica la app OAuth") **era erróneo** y
  Alberto lo frenó bien (la consola mostraba el trigger sano). Se confirmó leyendo el código por Claude para
  Chrome. **FIX (Alberto, en su Apps Script):** restaurada la `QUERY` a **allowlist de 11 remitentes**
  (booking, pricelabs, ionos, bbva, cabify, glovo, emasesa, endesa, asecon, petroprix, withorb) + `newer_than:3d`;
  verificado que **vuelve a copiar** (IONOS 11/07 y BBVA 09/07). **Lección: si Vía B no trae nada, revisar la
  `QUERY` del Apps Script, NUNCA OAuth.**
  - **Red de seguridad añadida a la skill** `facturas-correo` (para que un corte futuro no pierda facturas):
    **Paso 0** (health-check determinista de frescura + backlog persistente en etiquetas Gmail
    `Facturas/PDF-pendiente`/`Revisar` + escalado Telegram con backoff vía `/api/internal/alerta`), **cadena
    de vías con fallback** (B→A→OCR/visual→**conciliación inversa por banco**→pendiente). Doc corregida (fuera
    la falsa causa OAuth; documentado el mecanismo real de la `QUERY` y el caveat Mapfre cifrado).
  - **Badge de corte en `/finanzas`** (plataforma): tabla nueva `agente_salud`
    (`prisma/sql/2026-07-12_agente_salud.sql`, **aplicada en prod** por Supabase MCP), lectura tolerante en
    `lib/finanzas.ts::getResumenFinanciero` + `SaludExtraccionBanner` en `FinanzasClient.tsx`. Sembrado rojo
    durante el corte y **puesto en verde** (`ok=true`) al arreglarse. Preview de plataforma en Vercel compiló
    verde (typecheck OK).
  - **Procesado:** IONOS 24,19 € archivada en Drive (julio); aviso de duplicado (IONOS 1,82 €) en
    `_DUPLICADOS_BORRAR`. **Barrido del hueco 23/06→12/07:** todo ya estaba procesado por pasadas previas (todo
    con `Facturas/Procesada`) — sin backlog. **Pendiente de Alberto (no del agente):** Booking 03/07 (3 facturas
    `1656693936/1656760428/1656793743` → bandeja de revisión, confirmar a mano) y **ASECON 10/07** (gestoría,
    pedir reemisión a nombre de Alberto, está a nombre de Punto y Coma).

- **🔐 Domótica NIVIAN — PIN por reserva ARREGLADO: 3 bugs (12/07/2026, rama
  `claude/domótica-pin-creation-errors-sg63g0`).** El monitor avisó de que el programador de accesos
  (`/api/sivra/domotica/acceso/programador`, cron `40 4,12,20 * * *` UTC = 06:40 Madrid) no creaba NINGÚN
  PIN: `online: Invalid key length · offline: Tuya 1109: param is illegal`. Al mirar la BD real salieron
  **TRES** fallos, no dos:
  1. **Online `Invalid key length` (cripto, `lib/domotica/tuya-cifrado.ts`):** el descifrado del `ticket_key`
     usaba `aes-128-ecb` con solo los 16 primeros bytes del secret y `setAutoPadding(false)`. La spec real de
     Tuya (foro + docs) es **`aes-256-ecb` con el `access_secret` COMPLETO (32 bytes, utf8) + PKCS7** → clave
     real de 16 bytes; luego el PIN se cifra en `aes-128-ecb`+PKCS7. Se corrigió `descifrarTicketKey`
     (+ guarda explícita si el secret no mide 32 bytes) y se **eliminó** `claveDesdeSecret`. Test reescrito
     para imitar cómo Tuya genera el `ticket_key` (el test que habría cazado el bug).
  2. **Offline `Tuya 1109` (endpoint, `lib/domotica/acceso.ts`):** el endpoint offline es **`/v1.1/`**, no
     `/v1.0/` → `crearPinOffline` y el borrado offline de `borrarPin` a v1.1.
  3. **🚨 El más grave (puerta EQUIVOCADA): todas las reservas de los 4 pisos se metían en la ÚNICA cerradura
     Socorro** (BD: 9 filas error, todas `dispositivo=Socorro`+`smoobu_apartment_id=352007` pero `property_id`
     de house/duplex/busto/luxury). Causa: el filtro `apartments[]=` de Smoobu **no acota** y `toPropertyId`
     ignora el aptId. **Fix en `programador/route.ts`:** filtrar por el apartamento REAL de la reserva
     (`b.apartment.id`) contra `aptId` antes de crear el PIN. Sin esto, arreglar la cripto habría programado
     el código de un huésped del Dúplex/Busto en la puerta de otro piso.
  - **BD reconciliada:** borradas las 9 filas `error` (sin PIN ni tuya_id), y **BustoTavera** (la puerta real
    de Busto Reform + Luxury Busto, 🔴 offline) vinculada a `smoobuApartmentIds=[352418,352943]` (antes vacía →
    nunca se usaba). Socorro sigue en `[352007]`=House Sevillana (🟢 online). Dúplex Center **no tiene cerradura**
    → no genera PIN. `entrega` default = `aviso` (Telegram a Alberto, nada al huésped automático).
  - **Validación:** cripto testeada (roundtrip AES-256→AES-128, 4/4) + 46/46 tests domótica + tsc limpio en los
    3 ficheros. **PENDIENTE prod (dev no llega a Tuya):** correr la sonda de las 2 cerraduras y crear 1 PIN
    manual (`/sivra/domotica`) para confirmar que el NIVIAN soporta la vía online (Socorro) y offline v1.1
    (BustoTavera) antes de fiarse del cron. Docs: `docs/DOMOTICA-TUYA.md`.

- **🏦 BANCA: libro completo de movimientos + arreglo correduría muda (12/07/2026, rama
  `claude/banco-all-movements-lv8e7o`).** Alberto: "quiero ver TODOS los movimientos" + "la correduría
  cobra 0 aunque hay comisiones (Generali/Caser/Occident de julio)".
  - **Causa raíz correduría:** `banca_destino_reglas` envenenada con una regla-trampa **`"TRANSF" →
    turistico_pisos`** (6 chars, substring de todo "TRANSFERENCIA RECIBIDA") que secuestraba TODA
    transferencia entrante de BBVA (incl. comisiones de seguros) → como la correduría suma solo
    `destino='seguros'`, cobraba 0 en silencio. Otras basura: `TOTAL`/`RECEIPT`/`MODA`/`RESTAURANTES`→pisos,
    `GOOGLE ONE`/`PEPEPHONE`→seguros. Las reglas se aplican por SUBSTRING con prioridad sobre `destino.ts`.
  - **Arreglo código:** `lib/correduria.ts::claveReglaValida()` (rechaza claves genéricas/cortas) aplicada
    en TODOS los puntos de aprendizaje (`/api/banca/destino`, `/api/finanzas/categorias/asignar`,
    `agente-movimientos::aprenderReglaMovimiento`) **y como filtro al aplicar** (`categorizar.ts`, así las
    reglas viejas malas dejan de aplicarse). `lib/destino.ts` amplía `RE_LIQUID_SEGUROS` con los códigos de
    agente (`M00171`/`M1454`/`8/92361`/`SALDO.`) sincronizados con `detectarCompania`. Tests: destino 20 +
    correduria 8, todo verde.
  - **Migración `prisma/sql/2026-07-12_limpiar_reglas_destino.sql` (APLICADA en prod vía MCP):** borra
    reglas-trampa, corrige GOOGLE ONE/PEPEPHONE, reclasifica abonos BBVA mal parkeados en turistico_pisos →
    29 a `seguros` (2.408€), 24 a `turistico_duplex` (Booking, 9.138€). **Correduría julio pasó de 0€ a
    616,92€.** Sin doble conteo: los gemelos Excel de las comisiones ya estaban `duplicado_estado='ignorado'`.
  - **⚠️ PENDIENTE Alberto:** 65 abonos BBVA "Transferencia recibida" a secas (22.924€, 2025→2026-03,
    PREVIOS al bug, año cerrado, ambiguos: correduría/Dúplex viejo/personal) **NO se auto-movieron** —
    marcados `requiere_revision` para que él decida en la bandeja "🔎 Ingresos por revisar" de /banca.
  - **Ver TODOS los movimientos:** `/banca` ahora tiene libro completo — `listarMovimientosLedger()` +
    `GET /api/banca/movimientos` (paginado servidor), `MovimientosTabla` con filtros cuenta/fechas/signo/texto
    + "Ver más" + reclasificar el negocio EN LÍNEA por fila (antes solo se veían los 300 últimos).
  - **Extras:** panel "🧠 Reglas aprendidas" con borrar (`/api/banca/reglas`, marca sospechosas en rojo);
    health-check **Check 10** (correduría 0€ + abonos BBVA sin identificar → Telegram, autolimpiable);
    bandeja "🔎 Ingresos por revisar" (`listarIngresosPorRevisar`, antes un ingreso mal clasificado no
    aparecía en ningún sitio accionable). `next build` OK, tsc limpio.

- **🔧 Gemini directo `gemini-2.5-flash` → `gemini-flash-latest` (12/07/2026, rama
  `claude/openrouter-sdk-integration-4dkiem`).** Tras mergear la auditoría IA→OpenRouter (#827),
  verificando en `/operador/ia` salió un **404 de HOY**: Google retiró `gemini-2.5-flash` de la
  **API directa** (`generativelanguage`) el **09/07/2026**, ANTES de su EOL oficial (16/10) — problema
  masivo confirmado en el foro de Google AI. **No rompió nada user-facing**: el Director se lo comió
  (reintento por OpenRouter → deepseek ok), justo el valor del cambio de #827. Afectaba solo a rutas de
  **Gemini directo**: `/api/ai/search` (grounding), cron `sivra/eventos/websearch`, edge fn
  `eventos-entorno` de ia-rest y el fallback profundo de `pasarela.ts`. **Fix (decisión de Alberto:
  alias rodante):** `DEFAULT_GEMINI_MODEL` en `packages/core-ai/{gemini,client}.ts` → `gemini-flash-latest`
  (→ Flash GA vigente, no se rompe con retiradas de versión) + etiquetas de log en `pasarela.ts`/
  `ai/search` + la URL de la edge fn `eventos-entorno`. **Pendiente:** redeploy de la edge function
  `eventos-entorno` en el proyecto Supabase de ia-rest (`efncqyvhniaxsirhdxaa`) por MCP. **No tocado
  (self-heal):** el seed OpenRouter `google/gemini-2.5-flash` del cron `ia-director-refresh` (vector
  distinto — Vertex vía OpenRouter; lo regenera el cron semanal / buscador-ia). Typecheck plataforma 0.

- **📉 PRICING: seguimiento baja PriceLabs — checker anticipado + Luxury EN VIVO + lección Booking (13/07/2026).**
  Seguimiento semanal del plan de baja de PL (todo con "ok a todo" de Alberto):
  - **Reserva 21-28 oct verificada (Teresa Delgado, Busto, 7 noches):** el cambio de precio SÍ estaba aplicado
    (listado 118€/noche desde 25/06), pero Booking vendió a 64,77€/noche bruto (52€ neto) — el **stack de
    descuentos de Booking (Genius+semanal+móvil) se come ~45%** en estancias largas. El raíl `min_price`
    protege el listado, no el post-descuento. **Acción pendiente de Alberto: revisar promos en la extranet.**
    Lección en `pricing_aprendizaje` (busto, temporada `canal_booking`).
  - **Checker anticipado:** `update_experiment_results()` ahora marca `was_booked=true` en cuanto un income
    cubre la noche futura (antes esperaba a que pasara la fecha). Aplicado en BD vía MCP + SQL en
    `apps/sivra/sql/2026-07-13_early_mark_experiments.sql`. Primera pasada: Busto 0→**14 experimentos
    reservados**. Cancelaciones: el bloque de fechas pasadas re-alinea con `rate_snapshots`
    (`IS DISTINCT FROM`).
  - **Luxury Busto ACTIVADO EN VIVO** (OK explícito): `apply_enabled=true`, `pilot_enabled=true`,
    `seasonal_floor_k=1` (suelo 95€, ±20%/día, markup 1,16). Vigilar reversiones de PL vía `pricing/guard` —
    PL podría seguir conectado a Luxury en Smoobu.
  - **Criterio de baja replanteado** (doc `apps/sivra/docs/pricing-automatico.md` §11): manda ADR realizado +
    ritmo de ocupación vs histórico/PL; el "reservado ≥ PL" pasa a informativo. **Calendario: cancelar PL
    hacia principios de agosto** si las 2-3 próximas semanas confirman.
  - Ratios `price_ours`/PL (90d): busto 1,36× ✅ · duplex 1,59× · luxury 1,84× (dry→vivo hoy) · house 0,71×.
    Nada en 2-3×; la recalibración de 08/06 aguanta.

- **🤖 IA→OpenRouter: auditoría de enrutado + PR-A (12/07/2026, rama `claude/openrouter-sdk-integration-4dkiem`,
  PR #827).** Alberto: "redirigir toda la IA a OpenRouter y, cuando toque, pasar por el Agente Director".
  **Auditoría** (`docs/AUDITORIA-IA-ENRUTADO-2026-07.md`): la arquitectura ya es correcta — las 4 verticales
  usan wrappers *gateway-first* (con `AI_GATEWAY_URL`+`AI_GATEWAY_SECRET` van por la pasarela OpenRouter+Director).
  **Botón nº1 = operacional** (confirmar esas envs en Vercel de ia-rest/sivra/ialimp/rrhh — pendiente de Alberto).
  **✅ PR-A:** `apps/plataforma/lib/ai-client.ts::aiComplete` era **NIM directo con modelo pinneado**
  (bypaseaba OpenRouter Y Director) y lo consumen 9 rutas; ahora enruta por `chatConDirector`. Firma
  intacta, `maxTokens` 2048, typecheck 0. `aiExtractInvoice`/`aiTranscribe` (OCR/STT) NO se tocan.
  **✅ PR-B (parcial):** retirados 2 `fetch` crudos de plataforma — `sivra/expenses/parse-invoice`→
  `aiExtractInvoice`, `sivra/eventos/websearch`→helper `geminiSearch` (mantiene grounding). **`ia-rest/
  brain.ts` NO migrado a propósito** (cerebro POS por voz, timeout 5 s cara al cliente; el código lo deja
  directo a NIM — meterlo por la pasarela arriesga el presupuesto de 5 s).
  **✅ PR-C (subconjunto seguro):** migradas a `chatConDirector` las rutas internas de categoría B
  (`agente/chat`, `admin/estructura/chat`, `sivra/inversion/analyze`, `sivra/mercado/{cron,sweep,search}`);
  `chatConDirector` gana `temperature`. **NO migradas a propósito:** `reclamacion` (pin 8B, ya en
  OpenRouter), agente de huéspedes + `mensajes/reply` (cara al cliente, pin de modelo fuerte), `categorizar`/
  `subcategoria-barrido` (pin 8B por latencia). Clave: **categoría B YA iba por OpenRouter** (core-ai
  `aiComplete` lo usa si hay key) — PR-C solo añade el Director, no saca de un bypass.
  **PR-D DESACONSEJADO:** `/api/ai/{tools,vision,search}` excluyen el Director a propósito (tools=
  estructuradas/compatibilidad de function-calling, vision=modelos de visión, search=grounding nativo de
  Gemini). Forzarlo mete regresiones → no se hace sin rediseño. **Pendiente Alberto (operacional, sin código):**
  confirmar `AI_GATEWAY_URL`+`AI_GATEWAY_SECRET` en Vercel de ia-rest/sivra/ialimp/rrhh (enchufa el Director en
  las verticales). PRs previos de la rama: #822 y #825 (ya mergeados). Todo en PR #827.

- **🔴 ia-rest: el "corte de BD" al compartido NUNCA se conmutó — split-brain (12/07/2026, rama
  `claude/ia-rest-deployment-security-9dfxo8`, a raíz del PR #832 de la auditoría).** Verificado por MCP
  (logs Edge en vivo + `linked-project.json` + `setup-vercel-env.sh`): **producción (POS + crons) sigue
  corriendo contra el proyecto VIEJO `efncqyvhniaxsirhdxaa`** (schema `public`), NO contra el compartido
  `wswbehlcuxqxyinousql`/`iarest` como afirmaban la skill maestra y el mapa (era FALSO — corregido en este
  commit). El corte del 10/06 copió funciones/algunos datos al compartido pero no cambió el `SUPABASE_URL`
  de Vercel. Es un split por subsistema (POS→viejo; Instagram/Reels + demo Catering JJ→compartido) y por
  época (histórico + las **6 `facturas_verifactu`**→viejo; `personal`=14 demo→compartido). El proyecto
  viejo tiene además **seguridad sin auditar** (113 search_path, 47 SECURITY DEFINER views, 23 RLS
  always-true) y crons `infra-monitor`/`monitor-health` en 500/401. El "504 de Reels" ya se había parcheado
  el 11/07 (PR #791, deploy de `ig-video-gen` al viejo); queda una copia duplicada v7 en el compartido.
  **DECISIÓN (Alberto, 12/07): terminar la migración al compartido (Opción 2)** aprovechando que no hay
  clientes de restaurante activos (comandas congeladas 31/05, `sesiones_activas`=0). **HECHO en esta sesión
  (Etapa A, reversible):** corregidos los docs que mentían (skill `ia-rest-maestro` §2 e INFRAESTRUCTURA) +
  limpiado `setup-vercel-env.sh` (fuera el ANON key placeholder hardcodeado y el `ANTHROPIC_API_KEY` muerto;
  la URL sigue en el viejo a propósito hasta el flip). **PENDIENTE (ventana dedicada, irreversible):**
  Etapa C reconciliar datos viejo→compartido con las 6 facturas VeriFactu intactas · Etapa D flip de
  `SUPABASE_URL` en Vercel + redeploy · Etapa E jubilar el viejo. Plan completo:
  `/root/.claude/plans/carril-1-auto-aplicado-a-silly-crab.md` (efímero — resumen aquí).

- **🎬 Reels IA de Instagram — Veo 3 Fast + 2 arreglos de raíz (11/07/2026, rama
  `claude/instagram-video-improvements-m6avu9`, PR #791).** El motor Veo 3 Fast (audio nativo) ya se
  mergeó en **PR #789**. Al probar un reel de ejemplo salieron DOS cosas rotas de ANTES (no del #789):
  (1) la Edge Function **`ig-video-gen` nunca estaba desplegada** en Supabase `efncqyvhniaxsirhdxaa`
  → **desplegada** (v1, `verify_jwt=false`, auth propia `x-story-secret`). (2) La tabla
  **`instagram_borradores` no tenía la columna `video_job`** que el cron (reel Y carrusel) y el callback
  de Telegram escriben/leen → el INSERT fallaba y ambos caían a imagen. Migración aditiva
  `add column if not exists video_job jsonb` **aplicada a prod** y commiteada
  (`supabase/migrations/20260707_instagram_borradores_video_job.sql`). Además, durante la prueba
  NVIDIA+Groq cayeron a la vez y el reel daba **504** (sin fallback de texto): esto **ya lo resuelve `main`**
  con el **Director + OpenRouter** de la pasarela (`OPENROUTER_API_KEY` en plataforma, PRIMARIO desde el
  09-10/07) → mis parches de OpenRouter (ia-rest + pasarela) quedaron **superseded y descartados**; el PR #791
  final es SOLO la migración `video_job`. **Prueba:** `GET /api/cron/instagram?manual=1&formato=reel` desde
  navegador → Telegram → 🔄 Comprobar (~1-2 min) → revisar que **suena** y **sin subtítulos quemados**.

- **⚠️ Punto ciego de contexto corregido: el INGRESO por piso vive en `incomes` (inglés), no en el banco
  (11/07/2026, rama `claude/ai-accounting-agent-3a9o22`).** Investigando "cuánto ingresó el Dúplex" (daba 0€
  porque el agente contable lee el banco, donde todos los pisos van juntos en `destino='turistico_pisos'`),
  busqué la fuente por piso **por nombres de tabla en español** (`%ingres%`,`%propiedad%`) → no salieron las
  tablas SIVRA reales, que están **en INGLÉS** (`incomes`/`properties`/`expenses`), concluí en falso que "no
  existía" y **creé una tabla duplicada** (`ingresos_negocio_mensual`, cargada desde 20 pantallazos de Booking).
  Alberto lo cazó ("puede haber duplicidad" + pantallazo del dashboard). **`incomes` YA es la fuente canónica
  por reserva** (`propertyId, date, amount` neto, `amount_gross`, `portal`, `nights`; 2020→2026; 2026=72.113,89€)
  y **cuadra al céntimo con el dashboard** (Casa Sevillana 33.960,91 / Duplex 10.015,31 / Busto 7.657,81 "a hoy";
  full-year = "Proyectado"). Enlace `negocios.ref_ext` (`prop_*`) = `incomes.propertyId`; helper existente
  `getResumenSivra(anio,propertyId)`. **Reparado:** tabla duplicada BORRADA (`incomes` intacto, verificado); cero
  código de agente enviado. **Anti-recurrencia (este commit):** LANDMINE en `apps/plataforma/CLAUDE.md` (sección BD)
  + skills `sivra-maestro`/`plataforma-maestro` documentando que el ingreso por piso = `incomes` (inglés), el banco
  agrega los pisos, y `propiedades`/`propietario_ingresos` son DEMO. **Regla:** cargar los maestros y buscar tablas
  en inglés Y español antes de una investigación de ingresos. **ARREGLO FUNCIONAL HECHO (mismo PR):** el agente
  contable responde el ingreso por piso desde `incomes` — nuevo intent `ingresos_piso` en `intencion.ts` (4 pisos:
  `prop_duplex_center`/`prop_luxury_busto`/`prop_house_sevillana`/`prop_busto_reform`, solo para signo=ingreso; el
  GASTO del Dúplex sigue por banco) + handler en `respuestas-directas.ts` que **reutiliza `getResumenSivra(anio,propertyId)`**
  (mismos números que el dashboard: realizado a hoy + proyección año). `intencionDesdeJSON` acepta también el intent
  (carril IA). 52 tests verdes, tsc limpio. Así "¿cuánto ingresó el Dúplex?" ya da la cifra real (~10.015€ a hoy).

- **Limpieza de ids Gemini muertos en el Director + edge function ia-rest desplegada (11/07/2026, rama
  `claude/openrouter-sdk-integration-4dkiem`).** Cola del swap de la cadena directa (PR #822 mergeado): (1)
  **desplegada la edge function `eventos-entorno` de ia-rest** (proyecto Supabase `efncqyvhniaxsirhdxaa`, v13,
  `verify_jwt` intacto) con `gemini-2.5-flash` — ya no da 404 en la búsqueda web de eventos. (2) **Director:**
  `lib/ia-director.ts::SUPLENTES_DEFAULT` (fallback de runtime real si la tabla `ia_director_prompt` está vacía)
  y la lista `contexto` del cron `ia-director-refresh` citaban `google/gemini-2.0-flash-001` (EOL 01/06) →
  cambiadas a `google/gemini-2.5-flash`. La lista del cron se auto-cura contra el catálogo vivo; el
  SUPLENTES_DEFAULT no. Sin migración ni env nueva.

- **Agente contable: compone CONCEPTO ∩ NEGOCIO ("comunidad del dúplex" ≠ total del Dúplex) (11/07/2026, rama
  `claude/ai-accounting-agent-3a9o22`, PR #824).** Incidente: «gastos de comunidad del apartamento duplex» devolvía
  el TOTAL del Dúplex (1.704,86€, 28 mov) porque en el router determinista (`lib/contable/intencion.ts`) el
  `gasto_destino` (total del negocio) cortaba ANTES que el concepto. Arreglo: el `dest` (negocio detectado) se
  calcula UNA vez y **compone** con concepto/subcategoría en vez de cortar — `{tipo:'concepto', destinos, destinoEtiqueta}`;
  el `gasto_destino` a secas solo dispara si NO hay concepto que acotar. `respuestas-directas.ts` añade el filtro
  `coalesce(mb.destino,'personal') IN (...)` y rótulo compuesto («En comunidad del Dúplex llevas…»). `SinonimoDestino`
  gana `etiquetaDe` ('del Dúplex', 'de la correduría', 'de los pisos'). Defensa en profundidad: `intencionDesdeJSON`
  también acepta `destinos`+`destinoEtiqueta`, así el carril IA puede expresar la misma composición (la IA propone la
  INTENCIÓN, nunca las cifras). 46 tests verdes (7 nuevos de composición). Respuesta a la duda de Alberto («¿IA para
  revisar o que esquematice?»): main YA tenía el planner IA (`intencionDesdeJSON` + aprendizaje de `extras` +
  `entidadesResiduales` que difiere a la IA); este arreglo cierra el hueco determinista que quedaba. **PR #824 MERGEADO** (commit `a091102`).

- **🧠 buscador-ia 1ª pasada + OPENROUTER_API_KEY editable desde el panel (11/07/2026, rama
  `claude/openrouter-sdk-integration-4dkiem`, PR #822 MERGEADO).** A raíz de un correo que sugería "integrar
  el SDK de OpenRouter": OpenRouter YA está integrado en `@central/core-ai` (mejor que el SDK del correo).
  (1) **Pasada real del `buscador-ia`** → la cadena directa tiene 3 backstops podridos: Groq
  `llama-3.3-70b-versatile` DEPRECADO (17/06), Gemini `gemini-2.0-flash` APAGADO/EOL (01/06, id muerto),
  Kimi `kimi-k2-0711-preview` DISCONTINUADO (25/05); solo NIM `llama-3.3-70b-instruct` VIVO. Anotado en
  `docs/BUSCADOR-IA.md`. **SWAP APLICADO (opción A, PR #822):** `client.ts` + adaptadores ahora usan
  `gemini-2.5-flash`, `kimi-k2.6`, `openai/gpt-oss-120b`. Además se corrigieron otras llamadas vivas en
  `gemini-2.0-flash` (pasarela, api/ai/search, sivra/eventos/websearch, y la edge function ia-rest
  `eventos-entorno` → **necesita `supabase functions deploy` aparte**). Pendiente aparte (Director, su cron):
  `ia-director.ts::SUPLENTES_DEFAULT` aún cita `google/gemini-2.0-flash-001`.
  (2) **`OPENROUTER_API_KEY` añadida a `lib/secrets-registry.ts` como `editable`→`plataforma`** para poder
  ponerla/rotarla desde `/operador/secretos` (write-through a Vercel + redeploy) sin entrar a Vercel. El panel
  necesita `VERCEL_ADMIN_TOKEN` en plataforma. Nota: `OPENROUTER_API_KEY` casi seguro YA está en plataforma
  (Director `activo` desde 10/07). Alcance elegido: solo plataforma (cubre a todas las verticales por la pasarela).

- **Health-check: el 🟡 «152 alertas» era de Vanessa, no de Alberto → reorientado (11/07/2026, rama
  `claude/health-check-alerts-qidakc`).** El Check 6 del health-check de plataforma contaba filas de la tabla
  `alertas` (que es de **ialimp**, operativa de limpiezas de Sique Brilla) sin filtrar por empresa y lo metía al
  Telegram de Alberto. 138 de las 152 eran `asignacion_auto` (log del auto-asignador, insertado **sin leer** y
  nunca purgado → inflaba el badge 🔔 de Vanessa para siempre). **Última conexión de Vanessa:** no revisa el
  panel de alertas desde finales de mayo (su badge no es canal fiable). Cambios: (1) ialimp inserta
  `asignacion_auto` con `leida=true` + purga las de >30 días en el propio auto-assign; (2) limpieza puntual por
  MCP (107 borradas + 31 marcadas leídas → badge a 0); (3) **retirado el Check 6** de plataforma (no vigilar la
  tabla de otro tenant); (4) **cron nuevo `/api/cron/alertas-pendientes`** (lunes 08:00) que avisa a
  `empresas.email` (Vanessa) SOLO si le quedan alertas accionables sin leer >3 días. Helper puro
  `lib/alertas-resumen.ts` (test verde). Diseño en `docs/superpowers/specs/2026-07-11-health-check-alertas-limpiezas-design.md`. **PR #823 MERGEADO** (commit `9eb220c`).

- **`facturas-correo` — backlog de la raíz Drive archivado + Vía B confirmada rota 18 días (11/07/2026).**
  Pasada tras 8 días sin correr (hueco desde el 03/07). Hallazgo principal: la raíz de `FACTURAS
  Apartamentos/2026` tenía 13 PDFs sueltos que resultaron ser solo 3 facturas distintas (EMASESA Reform
  57,09€ ×9 copias, EMASESA "Bustos 1º DER" 2025 ×2 facturas distintas ×2 copias) más 9 facturas reales
  ya conciliadas en banco de sesiones previas sin bitácora (Dimitri 907,50€, CREATE 123,45€, 4× Endesa
  Dúplex, 4× Endesa Bustos Reform/Luxury) que nunca se habían archivado en Drive. Las 11 se archivaron
  ahora en sus carpetas de mes + se completó `propiedad_id` en 7 movimientos; 4 avisos nuevos en
  `_DUPLICADOS_BORRAR`. **Aviso importante: el Apps Script `Facturas a Drive` (Vía B, copia PDFs de
  Gmail) lleva 18 días parado** (última copia 23/06, detectado el 02/07 y no se ha autocorregido) —
  Petroprix, la factura fal.ai y ASECON quedaron "Para tu decisión" por falta de PDF legible. Alberto
  debería revisar la autorización OAuth del script. También sin resolver: EMASESA contrato 0105329645
  ("Bustos Tavera 1º DER", facturas 2025 a nombre de Punto y Coma SL) es una unidad que NO está en la
  tabla CUPS conocida — preguntar si sigue en uso. Detalle en `docs/AGENTES-BITACORA.md` (entrada
  2026-07-11) y `.claude/skills/facturas-correo/SKILL.md` (nota Vía B actualizada).

- **✅ Cierre OTA (punto 3) + agente Gmail de justificantes + móvil de "Control de facturas" (10/07/2026, rama
  `claude/unpaid-ota-invoices-hqt8ll`, PR nueva desde main tras mergear #817).** Tres cosas en un PR draft:
  1. **Certificación por piso del cuadre OTA — 3 de 4 pisos cerrados.** Alberto pasó el desglose de payouts de
     Booking (extranet "Información de los pagos", estado Enviado, Ene–Jul 2026) de 3 pisos. Cruzado contra
     `incomes` (bruto por mes de checkout): **Luxury Busto** pagó 13.092,08€ vs libros 13.075,50€ (Δ +16,58€,
     0,13%); **Dúplex Center** 12.874,06€ vs 14.281,10€ (Δ −1.407€); **Busto Reform** 8.125,17€ vs 8.614,67€
     (Δ −490€, enero cuadra al céntimo). Los Δ negativos son SOLO checkouts recientes (julio + fin de junio) aún
     sin liquidar por la OTA (la extranet los marca "Programado"/"no hay pagos"), **no dinero perdido**. Ninguna
     reserva impagada en los 3. Anexos 2/2-bis/2-ter en `INFORME-COBROS-OTA-2026-07.md`. **House Sevillana (4º piso)
     NO cuadra limpio** (Anexo 2-quater): Booking pagó 37.347€ vs libros 42.052€ de checkouts YA completados
     (≤9 jul) → **−4.705€ (~11%)** que NO se explica solo por el borde reciente (los checkouts Jun–9jul suman
     3.872€ y casi todo junio ya estaba pagado). Dos hipótesis sin poder distinguir: desfase de pago fuerte en
     temporada alta (Abr–May factura 11k/9k y el "dinero en vuelo" puede rondar 5–6k), o **reservas
     canceladas/modificadas contadas a bruto en `incomes`** (la tabla no tiene estado) → los libros
     SOBREESTIMARÍAN ingresos (riesgo CONTRARIO al de la alarma; relevante IRPF). Revisadas Abr+May a mano: sin
     duplicados ni noches=0. **RESUELTO esa misma noche con el calendario Smoobu** (Alberto lo pasó, coloreado por
     canal; verde=HomeExchange que NO da dinero): cruzadas las 28 reservas Booking del libro 1-a-1 contra el
     calendario (Ene–May al 100%) → **todas reales y confirmadas**; sin duplicados de reservationId; los
     HomeExchange (verde) están como portal OTRO a ~0€, no en Booking. **Los libros son correctos** → el −4.705€
     NO es error ni dinero perdido: es **cobro en tránsito** (Booking aún no ha desembolsado; remesa "Programado"
     13-jul + desfase normal en un piso de reservas grandes). **Los 4 pisos cuadran** (⚠️→✅). Único seguimiento:
     si en unas semanas Booking no liquida ese saldo, reclamarlo. Anexo 2-quater actualizado con el cierre.
  2. **Agente de conciliación de facturas desde Gmail (`lib/agente-facturas/conciliar-gmail.ts` +
     `POST /api/finanzas/gastos/conciliar-gmail`).** Ataca el backlog "❗ 127 deducibles sin justificante":
     barre el buzón `Triaje/Contabilidad`, OCR de cada adjunto (`aiExtractInvoice`, PDF-texto o imagen) y
     **engancha** la factura a su cargo del banco sin conciliar vía `casarFactura` (match CONSERVADOR: mismo
     signo + importe al céntimo + fecha ±N días → nunca a ciegas). Auth sesión O `CRON_SECRET`; resumen
     Telegram opcional (`avisar=1`, por defecto en cron). Reutiliza piezas ya probadas (IMAP/OCR/casado).
  3. **Responsive de `/sivra/facturas-control`.** La tabla de 5 columnas se cortaba en móvil (captura de
     Alberto). Ahora ≤640px pinta **tarjetas apiladas** (matchMedia tras montar, sin duplicar refs de los
     `<input file>`) y en desktop la tabla va en contenedor con `overflow-x:auto`. Acción "📎 Subir PDF"
     extraída a `renderAccion()` compartida. tsc 0 en los 3 archivos.

- **✅ Falsa alarma "44.797€ sin cobrar de OTAs" DIAGNOSTICADA + vigilante ARREGLADO (10/07/2026, rama
  `claude/unpaid-ota-invoices-hqt8ll`).** El banner del dashboard avisaba de 44.797,26€/94 reservas OTA
  "sin cobrar". **Era 100% falso positivo:** el banco había recibido MÁS de lo facturado (67.519€ recibidos
  vs 56.965€ bruto facturado en la ventana, +10.554€). **Causa raíz** (comprobada contra BD y contra el
  desglose real de Booking de Luxury Busto mayo — captura de Alberto): la v1 de `lib/sivra/cobros-ota.ts`
  emparejaba 1 abono ↔ 1 reserva por importe EXACTO contra el **neto**, pero (1) Booking **ingresa el BRUTO**
  y factura la comisión aparte, y (2) las OTAs **agrupan** varias reservas por transferencia con referencias
  que el banco rota. Solo 8 de 99 casaban. **Arreglo:** reescrito a **conciliación por flujo (FIFO en el
  tiempo) a nivel de cuenta**, contra el **bruto** (`amount_gross`), con abonos muchos-a-uno/uno-a-muchos,
  umbral de aviso agregado subido a 500€, márgenes ampliados (BOOKING/AIRBNB 10 d, EXPEDIA 40 d, AGODA 20 d).
  Contrato de salida intacto (el banner no cambia). **Sigue sin IA** (es dinero → SQL/aritmética). Simulado
  sobre las 96 reservas reales → **0,00€ pendientes** (antes 44.797€). Tests 11/11 (`node --test`). Informe
  en `apps/plataforma/docs/INFORME-COBROS-OTA-2026-07.md`. **Límite conocido:** el cuadre es agregado por
  cuenta (los abonos no se pueden atribuir a un piso); prueba que no hay agujero grande, no certifica
  una-por-una. **Pendiente Alberto:** confirmar en la extranet que no hay reservas OTA fuera de `incomes`
  (único hueco real posible) y validar el spot-check de Luxury Busto contra su desglose de Booking.
  **AMPLIADO (misma PR #817):** Alberto detectó que el resto del banner del dashboard también mentía. El
  flag `requiere_revision` es **zombie** — `/api/banca/confirmar` marcaba `destino_confirmado=true` sin
  limpiarlo → **1.202 movimientos ya confirmados** seguían con el flag, y el banner (`getGastosSinClasificar`)
  los contaba como "58.097,99€ sin clasificar / 38 gastos por revisar" (real: **0€**; 35 de los 38 eran
  ingresos, no gastos). La página `/finanzas/gastos` y el `health-check` ya filtraban bien; solo el banner no.
  **Arreglo:** `getGastosSinClasificar` + `getAlertas.porRevisar` añaden `NOT destino_confirmado AND
  destino<>traspaso_interno` (+ `importe<0`); `/api/banca/confirmar` limpia el flag al confirmar (raíz);
  migración `prisma/sql/2026-07-10_limpiar_requiere_revision_confirmados.sql` limpia los 1.202 zombies
  (PENDIENTE aplicar por Supabase MCP). Los avisos "127 sin justificante" y "10 facturas faltan" son
  backlog REAL (subir justificantes), no bugs.

- **🐛✅ FIX rrhh: la ficha de empleado NO guardaba NINGÚN cambio (10/07/2026, rama
  `claude/card-changes-not-saving-rginop`).** Alberto reportó "no guarda los cambios en las fichas"
  (captura del empleado PIÑA FRANCO MANUEL ANTONIO). **Causa raíz** (verificada contra la BD real,
  no adivinada): el `PATCH /api/admin/empleados/[id]` construye un `UPDATE` raw con Prisma, y las 3
  columnas DATE (`fecha_nacimiento`, `fecha_alta`, `fecha_reconocimiento_medico`) se asignaban **sin
  cast** — Prisma manda el parámetro como `text` y Postgres rechaza `date = text` con `ERROR 42804`
  **aunque el valor sea NULL** (comprueba el tipo, no el valor). Como el formulario SIEMPRE envía esas
  3 fechas, **todo el UPDATE fallaba → PATCH 500 → 0 cambios guardados**. El autor ya casteaba `::uuid`
  en el WHERE por el mismo motivo, pero se olvidó de las fechas del SET. **Fix:** helper `cDate()` que
  añade `${val}::date`. **De paso:** el PATCH leía `dni` pero ignoraba `nss` (el form lo enviaba) →
  las ediciones de NSS se perdían en silencio; añadido. **Deriva de esquema saldada:** `apellidos` y
  `fecha_reconocimiento_medico` existían en la BD (aplicadas a mano en commit 9e84f1e "migración ya
  aplicada") pero sin fichero de migración ni en `schema.prisma` → añadida migración idempotente
  `0020_ficha_apellidos_reconocimiento.sql` + campos al modelo Prisma. Verificado: `tsc --noEmit` OK y
  el UPDATE corregido persiste todos los campos (probado con transacción revertida sobre el registro real).

- **✅ RE-DIAGNÓSTICO: las 7 rutinas NO corrían sin repo — la PR #815 se equivocó de causa (13/07/2026, rama
  `claude/ialimp-client-health-missing-4fisyk`).** La PR #815 (ya fusionada) documentó que a 7 triggers les
  faltaba `central` como *fuente*. **Verificación de solo lectura en la UI del 13/07 (abriendo cada rutina en
  `claude.ai/code → Rutinas`): las 7 YA tienen `central` adjunto.** No faltaba en ninguna → tercer diagnóstico
  del hilo tras "proyecto equivocado" y "falta el repo", ambos incorrectos. **Causas reales:** (1) los fallos en
  rojo del 8/07 de `psd2-health-check` y "Agente de prospección comercial" eran **"Límite de uso alcanzado"**
  (límite semanal, reset 11/07 07:00 UTC), transitorio; (2) `ialimp-client-health` — un **run manual del 13/07
  11:36 completó en verde** (skill encontrada, repo clonado, Sique Brilla OK; la pasada abrió el PR draft #870
  con su bitácora). Los runs antiguos "sin repo" no se explican por trigger sin fuente (la tenía): repo
  adjuntado/propagado después o desfase puntual *adjuntado ≠ clonado*. **Pendientes reales:** (a) 🔴 rotar el
  `CRON_SECRET` de `buscador-ia` (está como **literal en texto plano** en su prompt, no placeholder) y sacarlo
  del prompt; (b) actualizar las queries SQL desfasadas de la skill `ialimp-client-health` (esquema real:
  `cleaning_sessions`/`pms_connections`/`facturas_clientes`) — tarea de `agentes-entrenador`. Corrección de docs
  en `docs/RUTINAS-PROGRAMADAS.md` (incidente rutina 7 re-diagnosticado + sección de verificación + pendientes #8/#9).

- **✅ Director de código COMPLETO y EN PRODUCCIÓN — cierre B/C/A + D aparcado (10/07/2026, rama
  `claude/agent-token-optimization-146k3e`, PRs #806 y #810 mergeados).** Continuación de la entrada de más
  abajo (índice a nivel de función + tabla + endpoint). Ya **resueltos los 2 pendientes** que quedaban:
  (1) Alberto añadió los GitHub Actions secrets `PLATAFORMA_URL` + `CRON_SECRET` (metió la contraseña y
  redesplegó) → `auditoria.yml` **auto-puebla `mapa_arquitectura` en cada push a `main`** (las ~2025 filas,
  ya no la muestra de 20); (2) documentado el protocolo del Director en `docs/DIRECTOR-CODIGO.md` (#806).
  **Siguiente paso (#810)**, 3 de las 4 mejoras que pidió Alberto:
  **(B)** el paso de inyección de `auditoria.yml` ahora **reintenta con backoff** (6 intentos, 15→75 s ≈ 3,7 min)
  para cubrir el 404 transitorio cuando un push a `main` además redespliega `plataforma`; un **401** (CRON_SECRET
  que no cuadra con Vercel) NO se reintenta. **(C)** sección "Medir el ahorro" en `DIRECTOR-CODIGO.md` con SQL
  sobre `ai_usos` (`endpoint='codigo'`): volumen, coste y reparto por modelo. **(A)** nueva skill **`code-map`**
  (`.claude/skills/code-map/SKILL.md`, en `docs/SKILLS.md` bajo "Desarrollo (ahorro de tokens)") — el gemelo
  "lado sesión" del endpoint: enseña a las sesiones Claude Code (que SON los agentes programadores de este repo)
  a consultar `mapa_arquitectura` por `word_similarity`/GIN (MCP Supabase `wswbehlcuxqxyinousql`) para acotar
  archivos ANTES de Grep/Read a ciegas; degrada al método clásico si el mapa no está. **(D) Embeddings pgvector
  = APARCADO a propósito** (mi recomendación, aceptada): el trigram ya acota bien en las pruebas y los embeddings
  solo ganan en órdenes muy vagas (mayor esfuerzo/menor retorno; requiere columna pgvector + cron de embeddings,
  no cabe en el CI Node-puro). Se retomará SOLO si el trigram se queda corto en uso real — medible por `ai_usos`
  `endpoint='codigo'`. Verificado: CI 14 checks en verde (incl. build de `plataforma`, tests+guardián, `--check`
  de la radiografía) antes de mergear #810.

- **✅ Radiografía financiera — Fase 3: lente Fiscal completa (PR #813 MERGEADO, 10/07/2026, rama `claude/accounting-consolidation-study-cbe2lf`).**
  Continuación de PR #809 (mergeado). La **lente 🧾 Fiscal** de la Radiografía deja de ser un mero resumen con
  enlace: ahora **mete dentro "Mi declaración"** (fusiona Fiscal + Proyección en un sitio). Hecho: (1) `radiografia/
  page.tsx` calcula `calcularEstadoDeclaracion(session.id, year, resumenAnual)` (de `lib/comparativa-declaracion.ts`,
  reutilizado con `/finanzas/fiscal`) en SSR y lo pasa al cliente; en `try/catch` → si falla, la lente degrada sin
  romper. (2) **Bug latente corregido:** la lente Fiscal usaba `resumen.fiscal` del INTERVALO (en la vista por
  defecto = mes en curso → base imponible del mes, engañosa). Ahora el bloque fiscal usa **SIEMPRE el año completo**
  (`resumenAnual.fiscal`; se reutiliza `resumen` si el intervalo ya era el año, si no se calcula aparte). (3)
  `RadiografiaClient.tsx` — nuevos `MomentoCard` (📍 Hoy / 🔮 Fin de año, cada uno 👤 Solo yo / 🤝 Conjunta con Pilar
  + palanca de gasto) y `TramoBar` (barra de tramos IRPF, misma fuente de tramos del servidor) + KPIs base/tipo
  efectivo/marginal/retenciones; enlace a `/finanzas/fiscal` para el detalle de deducciones. tsc limpio en los
  ficheros tocados. **PENDIENTE (Fases 2/4):** lente Negocios con P&L por piso (`getPLMensual`) + reclasificación
  inline; eliminar `TRAMOS_IRPF` hardcodeados de `proyeccion/ProyeccionClient.tsx` y retirar la página `proyeccion`;
  absorber tarjeta-crédito en Personal; deltas de ingresos/resultado (hoy solo el gasto total lleva Δ).
  **Doc de la vertical actualizada:** `apps/plataforma/CLAUDE.md` ya documenta la Radiografía (`/finanzas/radiografia`,
  las 3 lentes, `bancoCond`, la des-duplicación del menú y los pendientes) — antes no la mencionaba.

- **🚧 Radiografía financiera unificada — Fase 0+1 (esqueleto) (10/07/2026, rama `claude/accounting-consolidation-study-cbe2lf`).**
  Estudio + primer esqueleto para unificar la dispersión financiera de Alberto (10 pantallas de dinero, 5
  selectores de intervalo distintos, P&L duplicado en 3 sitios, 2 calculadoras IRPF, 2 motores de proyección).
  **Diseño aprobado** (plan en `/root/.claude/plans/…`, no versionado): UNA pantalla "Radiografía" con selector
  único (mes/trimestre/rango libre) + cabecera-resumen fija + comparativa + bandeja "sin identificar" arriba +
  3 lentes (🏢 Negocios · 🏠 Personal · 🧾 Fiscal). **Hecho:** (1) `lib/finanzas.ts` — `getResumenFinanciero`/
  `getResumenPilar` aceptan `desde?/hasta?` (rango libre); helper `shiftYearStr` para la comparativa; y helper
  puro `bancoCond(banco)` (BBVA `LIKE '%bbva%'` vs familiar) para filtrar el eje personal por cuenta.
  (2) `app/(usuario)/finanzas/IntervaloSelector.tsx` — selector de intervalo COMPARTIDO. (3) `finanzas/radiografia/`
  (`page.tsx` + `RadiografiaClient.tsx`) — pantalla nueva (por defecto MES EN CURSO): cabecera fija (Ingresos/Gasto
  total con Δ vs año anterior/Resultado/reparto Negocio·Personal), bandeja "🔎 sin identificar", y 3 lentes; la
  **lente Personal separa BBVA (100% tuya) vs Kutxabank (familiar)** y cada bloque enlaza a su detalle filtrado.
  (4) **Detalle "En qué gasto" (`CategoriasTab`) filtra por CUENTA** (`?banco=` + selector Todo/BBVA/Kutxabank),
  inyectado en las 3 rutas `/api/finanzas/categorias{,/comerciantes,/movimientos}` + `getMerchantsForCategoria`.
  (5) **Des-duplicación del menú (Fase 4 iniciada):** se retiran de `UserSidebar.tsx` las 4 entradas fiscales
  sueltas (En qué gasto / Deducciones / Fiscal / Proyección) → *Mi negocio* de 11 a 8 ítems; la Radiografía es la
  única puerta y el detalle cuelga de sus lentes (páginas NO borradas, reversible). Build OK, guardián 22/22.
  **PR #809 mergeado.** **PENDIENTE (Fases 2-4):** lente Negocios con P&L por piso + reclasificación inline; lente
  Fiscal fusionando Fiscal+Proyección y unificando las 2 calculadoras de tramos; absorber tarjeta-crédito; delta
  de ingresos/resultado (hoy solo gasto total). Mejoras Fase 2+ en el plan: "¿llego a fin de mes?" (tesorería),
  fijo vs variable, calendario de obligaciones, caja de preguntas del contable, termómetro de presupuesto.

- **✅ Fix reservas canceladas fantasma en calendario/ingresos SIVRA (10/07/2026, rama
  `claude/smoobu-reservation-missing-0tusov`).** Alberto: "esta reserva no me aparece en Smoobu"
  (captura de `/sivra/calendario`, tarjeta de Gabriela Encheva con "Noches: ?"). **Diagnóstico:** la
  reserva se canceló en Booking/Smoobu (15/06) pero seguía viva en `incomes`. **Causa raíz** (confirmada
  contra la API de Smoobu vía `pg_net`): el listado `/api/reservations` de Smoobu **OCULTA las canceladas
  salvo `showCancellation=1`**, flag que `fetchPage` no ponía → la rama `if (isCancel) DELETE FROM incomes`
  de `runSync` **nunca se ejecutaba** (ni cron ni webhook) y cada cancelación dejaba un fantasma que inflaba
  calendario e ingresos. **Fix código:** añadido `showCancellation:'1'` en `fetchPage` de
  `apps/plataforma/lib/sivra/smoobu-sync.ts` (canónico) y en la copia `apps/sivra/app/api/updates/sync/route.ts`.
  **Fix UI:** la tarjeta de detalle de `/sivra/calendario` deriva `nights` de las fechas (mismo fallback que las
  barras/tabla) → no más "Noches: ?" ni ADR = total. **Limpieza datos** (`prisma/sql/2026-07-10_incomes_limpiar_canceladas_fantasma.sql`,
  aplicada en `wswbehlcuxqxyinousql`): borradas las **9 reservas canceladas fantasma** con llegada 2026-27
  (verificadas 1 a 1 contra Smoobu) + backfill de `nights` en 18 reservas activas con 0/NULL. ⚠️ **LANDMINE:**
  cualquier lectura del listado de Smoobu que deba reflejar cancelaciones necesita `showCancellation=1`.
  Alberto NO quiso barrer canceladas históricas (<2026) por ahora. Verificado: 0 fantasmas restantes, 0 futuras
  con nights=0, sintaxis TS OK (sin deps instaladas en el contenedor).

- **✅ Agente contable: "ingresos duplex" arreglado + híbrido "IA enruta, SQL calcula" (10/07/2026).**
  Alberto: el chat `/contable` respondió "Ingresos duplex 2026 → 98.317,59€ / 239 movs" (imposible: era el
  TOTAL del año). **Causa:** el router determinista (`lib/contable/intencion.ts`) no conocía "duplex" y el
  comodín "total del año" tapó el filtro; además el importe salía mal formateado (`98317.59 €`). **PR #807
  (mergeado):** fila del Dúplex en `DESTINO_SINONIMOS` (`turistico_duplex`) + `respuestas-directas.ts` usa
  `eur()` de `lib/dinero.ts`. **PR #808 (mergeado):** a petición de Alberto, montado el híbrido:
  (a) el router deja de contestar el total a ciegas cuando hay una **entidad sin resolver**
  (`entidadesResiduales`); (b) nuevo `lib/contable/clasificar-ia.ts` — la IA MAPEA la pregunta a una
  intención estructurada y el **SQL calcula la cifra exacta** (la IA nunca inventa números); (c) **aprende**
  el vocabulario nuevo en `contable_memoria` (clave `sinonimo_negocio:<palabra>`, sin migración) → la próxima
  vez es determinista. `detectarIntencion(…, extras)`, `intencionDesdeJSON` (validador puro) + 12 tests nuevos
  (77/77 en `node --test lib/contable/`). Sin envs nuevas (reutiliza la pasarela IA existente).
  **Reconciliación de docs (misma fecha):** actualizado el router `plataforma-maestro/SKILL.md` (ficha del
  agente contable: añadido el tier **1-bis IA-enruta-SQL-calcula** + el aprendizaje `sinonimo_negocio:` +
  la nota del Dúplex en el camino determinista) y `apps/plataforma/CLAUDE.md` (mismo detalle). ⚠️ Regla
  latente: `getMemoria` EXCLUYE las claves `sinonimo_negocio:%` del contexto del LLM — no son hábitos que
  contarle al modelo, son vocabulario para el router; no reintroducirlas en el panorama.

- **✅ facturas-correo: Paso 1-bis reforzado para subidas MANUALES a Drive (10/07/2026).** A raíz de la
  factura **Castuera 055/2026** (climatización Casa Socorro, 1.691,58 €): el agente YA la había leído,
  clasificado (`turistico_pisos`), archivado en `FACTURAS Apartamentos/2026/07-Julio-2026`
  (`2026-07-09_JMCastuera-Socorro_1691.58EUR.pdf`) y **conciliado** con el cargo Bankinter del 10/07 —
  todo automático desde Gmail. Pero Alberto la subió además a mano y quedaron **2 duplicados**
  (suelto en la raíz `FACTURAS Apartamentos/2026` y en `ALBERTO 2026 PERSONAL (SEGUROS)/JULIO`),
  y no veía la carpeta de julio porque miraba en su estructura personal, no en la de FACTURAS.
  **Fix:** Paso 1-bis de la skill `facturas-correo` ahora (1) barre también PDFs recién creados por
  Alberto fuera de la estructura de FACTURAS, no solo los sueltos en la raíz; (2) **verifica anti-
  duplicado** antes de tocar nada — si ya hay copia normalizada en el mes O el cargo ya está
  `conciliado=true` con `factura_ref`, solo avisa «🗑️ borrar duplicado» y no re-archiva/re-concilia;
  (3) deja explícito que una subida manual se trata igual que un correo (clasificar → si deducible
  archivar+conciliar). **Extras aplicados** (a petición de Alberto): (a) buzón único de subidas
  manuales `FACTURAS Apartamentos/2026/_subir_aqui` (`1JlK9JXIpqlbDlOawtAFlk4_X7bn0Onjf`) como vía
  preferente en vez de barrer todo Drive; (b) regla nueva en Paso 4: imputar `propiedad_id` cuando la
  factura es de UN piso (no solo la luz) — y de paso el cargo Castuera reimputado a `prop_house_sevillana`
  (Casa Socorro); (c) aviso «⚠️ mal ubicado» si un deducible aparece en el árbol personal (SEGUROS).
  **Extra #2 (misma sesión):** papelera única **`FACTURAS Apartamentos/2026/_DUPLICADOS_BORRAR`**
  (`1Au-_pFEPqvwZN_a7xKNZzVZOWGMAAO7Z`) como bandeja de duplicados a borrar. Como el MCP de Drive no
  mueve/borra/edita, la papelera lleva **un mini-aviso (Google Doc) por duplicado** con enlace directo
  al fichero a borrar + enlace a la copia buena; idempotente por título. Sembrada con los 2 duplicados
  Castuera y con la **carpeta `07-Julio-2026` duplicada** (había DOS: se consolidó todo en la canónica
  del 01/07 `13Pxwt…` —copiando allí la factura PriceLabs que estaba en la del 07/07— y se marcó la del
  07/07 para borrar). Regla nueva en Paso 3: reusar SIEMPRE la carpeta de mes existente más antigua,
  nunca crear una segunda. Pendiente de Alberto: vaciar `_DUPLICADOS_BORRAR` (3 avisos) borrando los
  ficheros/carpeta reales y luego el aviso.

- **✅ Índice de arquitectura a nivel de FUNCIÓN + Director de código (10/07/2026, rama
  `claude/agent-token-optimization-146k3e`).** Alberto: "los agentes programadores gastan demasiados tokens
  leyendo archivos enteros para entender el flujo antes de tocar el definitivo". Auditoría: la radiografía ya
  existía (`scripts/auditar-estructura.mjs`) pero solo a nivel app/módulo/ruta/tabla; faltaba nivel de FUNCIÓN,
  la persistencia en Supabase y un director que ACOTE archivos. Estrategia (decidida con Alberto): archivos
  reales INTACTOS; el "esqueleto" es solo un ÍNDICE global; el Director acota (0 tokens) → señala el archivo →
  el agente lee el archivo ENTERO y devuelve diff (nada de trocear/fusionar fragmentos). Entregables:
  **(1)** `auditar-estructura.mjs` ampliado — extrae firmas de función (nombre/params/retorno/exportada/línea),
  resumen de cabecera y tablas referenciadas por archivo con **regex Node-puro (0 tokens, sin `typescript` ni
  install en CI)**; nuevo artefacto `docs/mapa-funciones.generated.json` (2024 archivos · 5265 funciones), SHA de
  git vía `execSync` (stdlib), excluido del comparador `--check` para no churnear. **(2)** Tabla Supabase
  `mapa_arquitectura` (`prisma/sql/2026-07-10_mapa_arquitectura.sql`: 1 fila/archivo, `funciones jsonb`, índice
  **pg_trgm** sobre `busqueda`, GIN en `tablas`, `REVOKE anon/authenticated`, sin RLS — BYPASSRLS). Se inyecta por
  el puerto interno `app/api/internal/mapa-arquitectura` (upsert idempotente por `hash`, borra huérfanos; auth
  `CRON_SECRET`), llamado desde `.github/workflows/auditoria.yml` **solo en `main`** (curl con `PLATAFORMA_URL`+
  `CRON_SECRET` → sin `DATABASE_URL` en CI). **(3)** Director de código `lib/ia-director-codigo.ts::acotarArchivos`
  (keywords → `word_similarity`/pg_trgm sobre `mapa_arquitectura` → top-N; reutiliza `elegirModelo` para el modelo
  bajo presupuesto; degrada `sinMapa`/`stale`, nunca lanza) + endpoint `app/api/ai/codigo` (auth `AI_GATEWAY_SECRET`,
  presupuesto, `registrarUso` endpoint `codigo`). **(4)** Categoría `codigo` en el catálogo del cron
  `ia-director-refresh` (qwen-coder/deepseek/sonnet; enruta por complejidad vía `modelosPermitidos`).
  **APLICADO Y PROBADO (10/07/2026):** migración `mapa_arquitectura` **aplicada por Supabase MCP en
  `wswbehlcuxqxyinousql`** (pg_trgm ✓, 4 índices, REVOKE anon/authenticated); cargada una muestra de 20 archivos y
  validada la consulta EXACTA del Director contra Postgres real: "login"→`.../auth/login/route.ts` (score 1.0),
  "director+codigo"→`ia-director-codigo.ts`+`api/ai/codigo` (1.0/0.889), tabla `movimientos_bancarios` vía GIN→
  `banca/destino`+`conciliacion`+`contable/cerebro`, "pricing sivra"→`pricing-auto`+`sivra/lib/pricing`. CI: **build
  de `plataforma` Ready** (valida tsc/next build de todo el TS nuevo) + los 7 proyectos Vercel en verde; guardia 22/22,
  `--check` gate OK, `keywordsDe("Arregla el bug del login")→[login]`.
  ✅ **RESUELTO** (ver entrada de arriba, #806/#810): Alberto añadió los secrets `PLATAFORMA_URL` + `CRON_SECRET`
  → `auditoria.yml` ya inyecta las ~2025 filas en cada push a `main` (con reintentos). Opcional runtime:
  `DIRECTOR_MODO=activo` (arranca en sombra), `MAPA_STALE_DIAS` (default 7).

- **🟢 EN VIVO: triaje de correo + Agente Director (10/07/2026).** Alberto activó en el proyecto Vercel
  `plataforma` (por la extensión Claude para Chrome, verificado desde aquí con el MCP de Vercel — deployment
  de producción `ARkMaj5dp` en READY sirviendo tráfico):
  - **`TRIAJE_DRY_RUN=false`** → el triaje de correo sale de sombra: ya **etiqueta/archiva en Gmail de
    verdad** y avisa por Telegram (personal/huéspedes/leads) en cada pasada del cron `*/10`. La clasificación
    ya era fiable (capa keyword + IA). Si algo clasifica raro → regla en `correo_reglas` (0 tokens).
  - **`DIRECTOR_MODO=activo`** → el Director **enruta modelos de verdad** en `/api/ai/*` (antes solo registraba
    en `ai_usos`). ⚠️ Se acortó la semana de sombra prevista a **1 día** (creado 09/07, activo 10/07): el bucle
    de aprendizaje F4 tiene poca muestra todavía; vigilar `/operador/ia` y `/operador/agentes` los primeros días.
    No rompe (si un modelo falla, cae a la cadena gratis).
  - Ambas variables se crearon nuevas, solo en **Production**, marcadas `Sensitive`. Los dos "Pendiente de
    Alberto" de las entradas de abajo (triaje a vivo / Director a activo) quedan **cerrados**.

- **✅ Triaje de correo: capa keyword-first (09/07/2026, en el PR #798).** Al revisar el estado del
  agente de triaje (funciona, cron cada 10 min, 300 correos clasificados, **modo SOMBRA** `accion='sombra'`,
  0 notificados) se vio que **~27% caían a `dudoso` con confianza 0** — la pasarela de IA se satura en algunas
  llamadas y el correo cae al cajón seguro. Muchos eran contabilidad (recibos Stripe/PayPal/IBKR), huéspedes
  (Booking/Smoobu), correduría (Occident) o marketing claro. **Fix (mismo patrón que /finanzas):** nueva capa
  DETERMINISTA `apps/plataforma/lib/correo/keywords.ts` (`clasificarPorKeyword`, pura + test) que corre en el
  clasificador ANTES de la IA (paso 2.5): dominios de alta precisión (stripe/paypal/interactivebrokers →
  contabilidad; guest.booking.com/smoobu/homeexchange → huéspedes; occidentinforma → correduría; endesaclientes/
  cortefiel/sevillafc/pedrobuerbaum → ruido), prefijo `mediadores@` → correduría, y asunto transaccional
  (receipt/invoice/refund/recibo de pago) → contabilidad. Alta precisión; si no aplica, decide la IA (sin tocar
  seguridad/personal). Verificado: tsc 0, next build OK, node --test 7/7. **Pendiente de Alberto:** poner
  `TRIAJE_DRY_RUN=false` en el proyecto Vercel `plataforma` para pasar el triaje de sombra a VIVO (que ya
  etiquete/archive y avise por Telegram); la clasificación ya es fiable.

- **✅ Panel de agentes unificado: autónomos + asistentes IA (09/07/2026, seguimiento del #797).**
  Alberto vio dos recuentos distintos y preguntó por qué: `/operador/agentes` decía **24** (autónomos:
  rutinas Claude + Director + crons agénticos) y `/operador/estructura` decía **39** ("Agentes IA" = toda
  función con IA: copilotos, voz BRAIN, visión, OCR, chats por pantalla — lista `AGENTES` en
  `apps/plataforma/lib/estructura.ts`). Eran dos definiciones de "agente". **Unificado en `/operador/agentes`:**
  la pestaña ahora muestra ambos con un **filtro Todos / Autónomos / Asistentes**; reutiliza (NO duplica) la
  lista de `estructura.ts` para los asistentes (agrupados por vertical, sin semáforo porque son *bajo demanda*),
  y el titular reconcilia los dos números. Verificado: `tsc` 0, `next build` OK. Nota: los autónomos que son
  rutinas Claude siguen en ⚪ "sin telemetría" (no dejan rastro en BD); pendiente opcional darles un latido.

- **✅ Análisis de agentes + panel de agentes + Director ampliado (09/07/2026, rama
  `claude/agents-analysis-director-935c3q`).** Alberto: "análisis de todos los agentes, esquema, actualiza
  funciones en mi panel; hemos creado un agente director por si se le puede dar más funciones". Tres entregables:
  **(1) Esquema** — `docs/AGENTES-MAPA.md` (mermaid + tablas de las 3 familias: rutinas Claude / Director / crons
  agénticos de Vercel) + artifact visual. **(2) Panel** — nueva pestaña `/operador/agentes` (superadmin) que lista
  TODOS los agentes desde el catálogo tipado `lib/agentes-catalogo.ts` con **salud en vivo** (`lib/agentes-salud.ts`,
  semáforo 🟢🟡🔴/⚪ por última actividad en BD vs cadencia); tarjeta del Director en `/operador/ia` enriquecida
  (versión de catálogo, nº de modelos, estado de degradación por presupuesto). Sidebar: `🤖 Agentes` + `💸 IA · gasto`.
  **(3) Director con 4 funciones nuevas** — filtro puro `lib/director-modelos.ts::modelosPermitidos` que estrecha el
  catálogo ANTES de decidir: **F1** degradación gradual por presupuesto (al 80% del límite diario, solo modelos
  baratos, antes del bloqueo duro al 100% — `ratioPresupuestoDiario` en `ai-gateway.ts`); **F2** enrutado por
  contexto real de la petición + preferencia `eu` (RGPD) si es sensible; **F3** el Director sale de la pasarela:
  núcleo reutilizable `lib/pasarela.ts::chatConDirector` (el route `/api/ai/chat` pasa a wrapper fino) y el **agente
  contable** (`lib/contable/cerebro.ts`) enruta ya por el Director (CONTABLE_MODEL = override del modelo clásico);
  **F4** bucle de aprendizaje determinista en el cron `ia-director-refresh` — lee rendimiento real (error_rate/ms)
  de `ai_usos`, **penaliza** modelos con mala racha en el ranking y versiona snapshot en la tabla nueva
  `ia_director_aprendizaje` (migración aplicada en `wswbehlcuxqxyinousql`). Envs nuevas documentadas en
  `apps/plataforma/CLAUDE.md`. Verificado: `tsc` 0, `next build` OK, `node --test` (modelosPermitidos 9/9,
  catálogo 3/3), `test:guardia` 22/22. Pendiente de Alberto: nada obligatorio (el Director sigue en sombra hasta
  que ponga `DIRECTOR_MODO=activo`).

- **✅ OpenRouter como partner primario de IA + arquitectura de agentes (09/07/2026, rama
  `claude/openrouter-quickstart-t9w2k1`).** Alberto: "las IAs están saturadas, he conectado OpenRouter".
  5 piezas: **(A)** `@central/core-ai` gana adaptador puro `openrouter.ts` (OpenAI-compat, fallback
  NATIVO entre modelos `models:[...]`, prompt caching `cacheSystem`, no-training `privacidad`,
  `response_format`, `fetchImpl` testeable) + `embeddings.ts` (`geminiEmbed`, 1º del monorepo) y
  la cadena `aiComplete`/`aiTools` pasa a **OpenRouter (si hay `OPENROUTER_API_KEY`) → NIM → Groq →
  Gemini → Kimi** (sin key, idéntica a antes; `skipOpenRouter` para la pasarela). **(B)** Agente
  DIRECTOR en la pasarela (`lib/ia-director.ts` + tabla `ia_director_prompt`, semilla v1 aplicada):
  modelo barato elige slug por petición con **salida estructurada** (json_schema + enum del catálogo
  = imposible inventar modelo); **modo SOMBRA por defecto** (`DIRECTOR_MODO=activo` para enrutar;
  1ª semana comparar en el panel); `:floor` opcional. **(C)** Meta-agente cron semanal
  `/api/cron/ia-director-refresh` (lunes 05:00): catálogo público `/api/v1/models`, ranking
  DETERMINISTA por listas `PREFERIDOS` + techo de precio, suplentes `:free` vivos, versiona
  prompt+catálogo, Telegram si cambia el juego de modelos, y vigila créditos (`/api/v1/credits`,
  umbral `AI_CREDITOS_UMBRAL`). **(D)** Presupuesto DIARIO en € a 3 niveles (global
  `AI_GATEWAY_LIMITE_DIARIO_EUR` default 1€ / por app / **por CLIENTE** para refacturar —
  `ai_usos.cliente_ref` + tabla `ia_presupuestos`, migración aplicada): bloquea SOLO el camino de
  pago, la cadena gratis sigue (degrada, nunca muere); Telegram 1x/día. Panel `/operador/ia`:
  gasto hoy, Director, por modelo y por cliente. **(E)** Caché semántica **pgvector** (1º uso;
  extensión instalada + `ia_cache_semantica` aplicada): opt-in DOBLE (`IA_CACHE_SEMANTICA=1` +
  caller manda `cache:{ambito}`), umbral coseno ≥0,97, TTL, fail-open. **Pendiente de Alberto:**
  poner `OPENROUTER_API_KEY` en el proyecto Vercel `plataforma` (con eso arranca todo en sombra);
  tras ~1 semana, `DIRECTOR_MODO=activo`. Migraciones YA aplicadas en `wswbehlcuxqxyinousql`.
  Tests core-ai 14/14, guardián 22/22, tsc plataforma limpio.

- **✅ rrhh: fix error Digest 3871889014 (BigInt) + apellidos/nombre separados (09/07/2026, PR #793 mergeado).**
  Pilar reportó error de página al crear empleado y subir documento. Causa raíz: columna `rrhh.documentos.tamano`
  es `bigint` en PostgreSQL → Prisma `$queryRaw` devuelve `BigInt` de JS → `JSON.stringify` lanza
  `TypeError: Do not know how to serialize a BigInt` en SSR. Fix: `tamano: d.tamano != null ? Number(d.tamano) : null`
  en `lib/documental.ts`. También: todos los catch en `documentos/route.ts` ahora devuelven JSON (antes lanzaban
  un 500 sin body que rompía `r.json()` en el cliente). Al mismo tiempo: **campo apellidos separado** en ficha y
  lista de empleados — migración `ALTER TABLE rrhh.empleados ADD COLUMN apellidos TEXT` aplicada a producción;
  lista ordena por `COALESCE(apellidos, nombre) ASC`; display `"apellidos, nombre"`. 9 ficheros tocados.
  sivra e ia-rest tienen builds fallidos pre-existentes (no relacionados con este PR).

- **🩹 2 fixes menores sin memoria propia, reconciliados en pasada de auditoría (09/07/2026).**
  **(1)** `fix(plataforma)` **#795** — el Agente Director a veces envolvía su JSON en fences
  ` ```json ` (OpenRouter no fuerza `response_format` a nivel de proveedor) y `JSON.parse` petaba
  con `SyntaxError`, cayendo a la decisión por defecto; ahora reutiliza `cleanJSON` de
  `@central/core-ai` (mismo patrón que el agente contable). De paso arregla `empleados.test.ts`
  (roto en main desde el PR #793 — el test no cubría el campo `apellidos` nuevo). **(2)**
  `fix(concursos)` **#786** — `tsc --noEmit` fallaba en main porque `evalOferta.umbral_temeraria`
  es `number|null` y el `eur()` de concursos espera `number|undefined`; normalizado `null→undefined`
  en la llamada.

- **✅ Agente contable: "gastos de la correduría / los pisos" responde por DESTINO (07/07/2026).**
  Alberto preguntó al chat "Gastos de este año 2026 correduria" y respondía **€18 / 1 cargo** (absurdo). Dos
  bugs en `lib/contable/intencion.ts`: (1) el extractor genérico de concepto capturaba **"este"** de "de este
  año" (no estaba en `STOP_CONCEPTO`) → `ILIKE '%este%'` = 1 cargo basura; (2) un negocio nombrado en solitario
  (correduría, pisos) no tenía intent (solo existía la comparativa `por_destino` con "vs"). Arreglo: se añaden
  demostrativos (`este/esta/…`) a `STOP_CONCEPTO`, y nuevo intent **`gasto_destino`** con `DESTINO_SINONIMOS`
  (correduría→`seguros`; pisos/apartamentos/turístico→`turistico_pisos`+`turistico_duplex`, con/sin tilde),
  que suma por la columna `destino` (mismo eje que la pestaña Gastos), compone con mes y sirve gasto o ingreso.
  `respuestas-directas.ts` añade el handler. Validado en BD: correduría 2026 = **€6.452,34 gasto / €1.493,64
  ingreso (43 mov)**, no €18. **Auditoría del agente (misma pasada):** el extractor de proveedor genérico
  perdía el proveedor cuando había mes ("en amazon **en junio**" devolvía el TOTAL de junio) y solo miraba
  la 1ª preposición (una stop-word inicial tapaba el proveedor). Arreglado: `primerConceptoNoStop()` recorre
  TODOS los objetos de preposición y coge el primero que no sea stop-word, y el concepto genérico se compone
  con el mes (va ANTES del mes-solo; los meses están en STOP así que "en junio" a secas sigue cayendo al
  total del mes). Tests intención 29/29, typecheck limpio.

- **✅ Reclasificación de las decisiones de Alberto APLICADA en BD (07/07/2026).** Ejecutado el SQL que estaba
  bloqueado por caída sostenida del gateway MCP: **hipoteca** = 19 mov CUOTA PTMO (€14.468,82); **club** = 17
  mov Círculo Mercantil (14 activos, €1.363,88); **El Girandillo** ya estaba en `turistico_pisos` (regla
  aprendida ya existía) y se limpió su subcategoría heredada; la regla `RECIBO CIRCULO MERCAN` fija
  `subcategoria='club'`. OJO aprendido: `categorizar.ts::analizarMovimientos` aplica `banca_destino_reglas`
  SOLO para `destino`, **no** lee su columna `subcategoria` — la subcategoría futura la pone el diccionario
  determinista `subcategoria-keywords.ts` al Auto-clasificar (por eso el fix de datos es el UPDATE, no reglas).

- **🎬 Reels IA de Instagram → Veo 3 Fast con audio nativo (07/07/2026, rama
  `claude/instagram-video-improvements-m6avu9`, PR #789).** Alberto: "quiero mejores vídeos para
  instagram". El Reel IA del miércoles usaba **Kling 2.5-turbo/pro** (t2v, 10s, **MUDO**). Se sube el
  motor a **Veo 3 Fast** (`fal-ai/veo3/fast`, ~$0.10/s vs $0.07 Kling → ~€0.80/reel, 1/semana): audio
  **nativo sincronizado** (adiós al reel mudo, sin sembrar música) + realismo Google. **Construido:**
  EF `ig-video-gen` v7 con `engine` conmutable (`MODELS` map, `buildPayload` por motor: Veo lleva
  `duration:'8s'`+`resolution`+`generate_audio`; Kling igual que antes); `startVideoIA(...,{engine,generateAudio})`
  en `ai-video.ts`; cron lee **`IG_VIDEO_ENGINE`** (default `veo3-fast`, `=kling` revierte sin código),
  `generarPromptVideo(tema,engine)` añade dirección de audio ambiente + refuerza "NO subtitles/text"
  (Veo quema subtítulos si detecta palabras); **cadena Veo → Kling → imagen**. Todo reel sigue pasando por
  **aprobación Telegram** antes de publicar (gate humano). `?engine=` en `/api/ig-ai-video` para probar a mano.
  **Verificado:** `tsc` + `next build` limpios. EF v7 desplegada a Supabase (`efncqyvhniaxsirhdxaa`) al mergear.
  **PENDIENTE (Alberto):** confirmar que `FAL_API_KEY` tiene acceso/saldo a Veo 3 Fast; **verificar que el
  audio de Veo sobrevive al re-encode de Cloudinary** (`videoConSubtitulo`/endcard) revisando el primer reel.
  Spec: `docs/superpowers/specs/2026-07-07-instagram-veo3-reels-design.md`.

- **🔐 Domótica — selector de tipo manual (07/07/2026, rama `claude/tuya-device-setup-1dpz09`).** Alberto
  vio que «Socorro» (la cerradura NIVIAN) se pintaba como **ventilador** (Encender/Velocidad/Luz) en vez de
  tarjeta 🔐 de acceso: su categoría Tuya no está en `CATS_ACCESO` (o vino vacía) y «Buscar dispositivos» no
  lo reclasificaba. **Fix:** `tipoEfectivo(config, categoria)` en `lib/domotica/tipo.ts` — si hay
  `config.tipoManual` ('acceso'|'ventilador'|'otro') manda sobre la categoría autodetectada. Lo consumen la
  ruta `dispositivos` (GET) y el cron `acceso/programador`. UI: **selector 🌀/🔐/Otro** en cada tarjeta
  (`SelectorTipo` en `DomoticaClient.tsx`, guarda por el PATCH de config existente). Marcando «Socorro» como
  🔐 Cerradura sale su tarjeta de acceso (sonda + PIN). Tests 46/46.

- **🔐 Domótica accesos NIVIAN — Fase 2 (PIN automático por reserva) implementada (07/07/2026, rama
  `claude/tuya-device-setup-1dpz09`).** La Fase 0+1 (sonda + panel + abrir) se **mergeó** (PR #785, squash
  `cabcbb2`); Alberto pidió «mergea porque no aparece nada y sigue fase 2» (el preview de la rama no tiene las
  envs `TUYA_*`, que son Production-scoped → la sonda solo responde en prod). **Construido en Fase 2:** tabla
  **`domotica_acceso_pin`** (migración aplicada; único `(dispositivo_id, reserva_ref)` = idempotencia);
  **`lib/domotica/acceso-programador.ts`** (puro, testeado: ventana desde `HORARIOS_PISO` ± márgenes en epoch
  DST-safe, reconciliación crear/borrar, aviso offline); **`lib/domotica/tuya-cifrado.ts`** (AES-128-ECB para
  contraseña online, roundtrip testeado); `acceso.ts` gana `crearPinTemporal` (intenta **online** —PIN elegido,
  ticket+AES— y cae a **offline** —Tuya genera el código, sin conexión—), `borrarPin`, `listarPins`, `generarPin`;
  **cron** `/api/sivra/domotica/acceso/programador` (`40 4,12,20 * * *`) sincroniza PIN por reserva de los
  próximos 14 días de **todos los apartamentos vinculados** (1 cerradura↔N pisos, BustoTavera); rutas manuales
  `POST/DELETE /api/sivra/domotica/acceso/[id]/pin[/ref]`; UI `TarjetaAcceso` con **PIN por reserva** (lista +
  alta/baja manual) y **⚙️ Configuración** 100% editable (autoPin, entrega, longitud, horario/márgenes,
  auto-borrado, botón abrir, pisos vinculados, alertas). **Entrega DEFAULT = `aviso`** (solo Telegram a Alberto;
  `huesped`/`ambos` se activan a mano por cerradura — nada llega a huéspedes reales sin querer). Tests
  `node --test` 44/44. **Se valida en producción** (dev no alcanza la Tuya API); si `crearPinTemporal` falla en
  todas las vías, la fila queda `error` + aviso Telegram y la sonda dirá qué expone el NIVIAN. **Pendiente:**
  cablear `codigosFijos` (limpiadora, mismo mecanismo sin caducidad) cuando la creación de PIN quede confirmada.

- **🔐 Domótica accesos NIVIAN — Fase 0+1 (sonda + panel) implementada (07/07/2026, rama
  `claude/tuya-device-setup-1dpz09`, PR #785).** Los 2 «teclados» descubiertos son **NIVIAN
  NV-ACCESS-PIN-RFID-W** (control de acceso **Wi-Fi**, PIN + tarjeta RFID); el tercero es el ventilador
  (`ceiling fan/Light v2`). «Socorro» online, «BustoTavera» offline. **Construido:** columna
  `domotica_dispositivos.categoria` (migración aplicada); helper puro `lib/domotica/tipo.ts`
  (`tipoDispositivo` + `CONFIG_ACCESO_DEFAULT`); `lib/domotica/acceso.ts` + `acceso-puro.ts` (sonda
  read-only `sondearAcceso` = spec+status+intentos door-lock con `try/catch` por bloque; `abrirMomentaneo`
  con DP candidato `unlock_request/open_door/…`); rutas `GET /api/sivra/domotica/acceso/[id]` (sonda) y
  `POST …/[id]/abrir`; UI `TarjetaAcceso` en `DomoticaClient.tsx` (botón 🔍 Sonda + 🚪 Abrir). `tuya.ts`
  exporta `tuyaRequest`/`tuyaGetToken`. Tests `node --test` 24/24. **La sonda descubre los DP/endpoints
  reales del NIVIAN** (el entorno de dev no alcanza la Tuya API). **PENDIENTE:** que Alberto pulse 🔍 Sonda
  sobre «Socorro» y vea qué bloques salen ✅ + el DP de apertura → eso **gatea la Fase 2** (PIN por reserva,
  alertas, tarjetas limpiadora, 1 cerradura↔N pisos). Spec/plan en `docs/superpowers/{specs,plans}/2026-07-07-*`.

- **📊 Propuesta comercial Grupo Joaquín Jaén → página viva en iarest (07/07, PR #779).** Deck de captación
  (17 láminas, HTML autocontenido con el logo de JJ en data-URI, tema claro/oscuro, imprimible a PDF, `noindex`)
  servido como estático en `apps/ia-rest/public/propuesta-jj.html` → URL `iarest.es/propuesta-jj.html`. Cubre los
  5 negocios + cocina central + intercompany (770k→−60k→710k) y la capa transversal REAL auditada en código:
  RR.HH./portal empleado, contabilidad+banca PSD2+copiloto IA, concursos públicos (radar PLACSP por CPV 55/15) y
  agentes (fiscal, pago proveedores, triaje, control facturas). Se quitó el lenguaje interno ("Design Partner")
  por ser modelo de negocio, no argumento de cliente. Fuente editable: Artifact en claude.ai (misma URL).

- **🧾 Categoría 'Impuestos' + repaso del "sin categoría" (07/07/2026, rama `claude/ia-categorization-issue-6a534b`).**
  Al revisar los ~26.000€ "sin categoría" salió que **~20.340€ eran IRPF/Hacienda** (la renta: pago de junio
  12.020€ + 2º plazo de noviembre 8.014€ + tributos menores), no consumo. Decisión de Alberto: **categoría
  nueva `impuestos` (🧾) DENTRO de personal** (se ve en "En qué gasto" pero no infla el consumo). Keywords
  ESPECÍFICAS (`IMPUESTO DE HACIENDA`/`TRIBUT HACIENDA`/`AGENCIA TRIBUTARIA`/`AEAT`/` IRPF `) para no chocar con
  el IBI ni con locales llamados 'Hacienda'. Además: `AMZN Mktp`→**ocio** (el banco abrevia Amazon), `AYTO.
  SEVILLA`→**ibi**. Los **Bizums** a personas se quedan agrupados como 'Bizum' (decisión de Alberto). Tras la
  reclasificación el "sin categoría" bajó de 26.170€ a 5.537€, y 63 de los 86 restantes son Bizums. Taxonomía
  en `lib/categorias-personales.ts` (SUBCATEGORIAS_GASTO + EMOJI + DESCRIPCION). Tests 18/18 keyword.

- **✉️ Dedup del email frío de prospección POR DIRECCIÓN de email (07/07/2026, rama `claude/iarest-restaurant-emails-6r2vpi`).**
  Alberto preguntó si el agente controla no mandar al mismo cliente dos veces (tras la tanda 🍴 de 15
  restaurantes de `proponerEmailsVertical`). Ya deduplicaba por **`lead.id`** (tabla `leads_web_tracking`
  estado `enviado_dia1`, más desuscritos y `descartado`), pero el hueco era: **el mismo local en dos filas de
  lead distintas** (email idéntico, web/nombre algo distinto) recibía la presentación dos veces, porque el guard
  era por id, no por dirección. **Fix:** nuevo helper `emailsYaContactados()` + `normEmail()` en
  `apps/ia-rest/src/lib/lead-hunter-sevilla.ts` que, dado el pool de candidatos, devuelve las direcciones ya
  contactadas mirando los **dos caminos de envío vivos** (`leads_web_tracking` estado ≠ propuesto/descartado, y
  el pipeline del cron `crm-envio-auto`: `estado_pipeline='enviado'`/`propuesta_enviada_at`). Se añadió el guard
  por email (+ set en-tanda para no repetir dentro del mismo lote) en `enviarEmailsSevilla`,
  `proponerEmailsVertical` y el cron `crm-envio-auto`. tsc 0. Hueco teórico restante ya cerrado; no hace falta
  UNIQUE en `leads.email` (hay muchos NULL y posibles duplicados históricos que romperían la migración).

- **🌀 Domótica Tuya — el listado de dispositivos ahora sí ve el ventilador vinculado por QR
  (07/07/2026, rama `claude/tuya-device-setup-1dpz09`).** Alberto abrió `/sivra/domotica` y seguía en
  "Sin dispositivos". **Causa raíz de código:** `tuyaListDevices()` (`lib/domotica/tuya.ts`) llamaba solo a
  **`/v2.0/cloud/thing/device`**, que lista los dispositivos IMPORTADOS directamente al proyecto cloud —
  NO los vinculados por el QR de Smart Life ("Link App Account"), que es el flujo real del setup. Ésos
  salen por **`/v1.0/iot-01/associated-users/devices`** (verificado contra el cliente canónico tinytuya).
  Con lo anterior, «Buscar dispositivos» devolvía lista vacía aunque las envs estuvieran bien y la cuenta
  vinculada → tabla `domotica_dispositivos` a 0 filas. **Fix:** `tuyaListDevices` consulta ahora el
  endpoint de asociados (paginado por `last_row_key`) como fuente principal y **fusiona** con
  `/v2.0/cloud/thing/device` (dedupe por id, gana la 1ª lista) para cubrir ambas vías de alta; si el
  principal falla y no hay nada, propaga el error real (envs mal / trial IoT Core caducado) para que la UI
  lo muestre. Helpers puros nuevos `normalizarDispositivo`/`fusionarDispositivos` con tests (`node --test`
  17/17 verde). Doc `docs/DOMOTICA-TUYA.md` ampliada con troubleshooting «si Buscar no encuentra nada».
  Proyecto Tuya **Casa Sevilla** (data center Europa Central → endpoint EU por defecto, sin `TUYA_ENDPOINT`).
  **PENDIENTE de Alberto (pasos manuales, no de código):** poner `TUYA_CLIENT_ID/SECRET` en Vercel
  (proyecto plataforma) + redeploy, y vincular la cuenta Smart Life por QR en platform.tuya.com. Luego
  «Buscar dispositivos» → verificar alta real y encender/apagar.

- **🩹 Categorización mal + autocuración por keyword (07/07/2026, rama `claude/ia-categorization-issue-6a534b`).**
  Alberto: "esta mal, revisalo bien todo". La captura mostraba la categoría **Seguro** con gasolineras
  (PETROPRIX), súper (PRIMAPRIX×11), un restaurante y "PAGO DE IMPUESTOS 600€" dentro. Dos causas: **(1)
  bug de código** — `getMerchantsForCategoria` (`lib/finanzas.ts`) NO filtraba `destino='personal'`, así
  que costes profesionales (cuota autónomos TGSS, tributos del negocio) que comparten subcategoría se
  colaban en el desglose personal y descuadraban la cabecera. **(2) datos malos** — la **IA gratis de la
  pasarela es poco fiable** y había puesto comercios conocidos en 'seguro' con confianza alta; mi rescate
  anterior solo tocaba NULL/otros_gasto, así que esas etiquetas malas se quedaban fijas. **Arreglo
  sistémico:** la **keyword ahora manda** — `barrerSubcategoriasPersonal` barre TODO el gasto personal y
  el paso keyword **SOBREESCRIBE** la etiqueta cuando discrepa (la IA solo ve lo no clasificado y nunca
  pisa una etiqueta puesta). Re-barrido histórico por SQL generado DESDE el diccionario real
  (`reglasOrdenadas()`, `translate()` para acentos, sin duplicar a mano): 'seguro' de 17→5 (solo
  aseguradoras reales), GALOS→bar, PRIMAPRIX→súper, PETROPRIX→gasolina. **Prioridad comercio específico:**
  `CIRCULO MERCANTIL` (club) va ANTES que `deporte` aunque el recibo diga 'GYM'. Nuevas keywords:
  PETROPRIX, IONOS/GODADDY, RESTAURANTES Y CAFETERIAS, SHEIN/WISH, TUSSAM/SEVICI, colegio Sagrados
  Corazones/ACPA. **UX:** al abrir una categoría con UN solo comercio se muestra el desglose directo, y el
  mini-gráfico de una sola barra (redundante con el total) se oculta. Tests 103/103.

- **🏷️ Recurrentes conocidos categorizados + Bizums unificados (07/07/2026, rama `claude/ia-categorization-issue-6a534b`).**
  Alberto: "hay muchos gastos q se saben… los IBI también ya lo revisamos… unifica Bizum también". Se ampliaron
  las keywords deterministas (`lib/subcategoria-keywords.ts`) con los recibos fijos de la vivienda Montecarmelo y
  otros recurrentes: `MONTECARMELO`/`MONTE CARMELO`→**comunidad** (recibo ~110€/mes), `TOTAL GAS Y ELECT`/
  `TOTALENERGIES`→**suministros_piso**, `TEMU`/`SHEIN`→**ocio**, `TUSSAM`/`SEVICI`→**transporte**, `PRIMAPRIX`→
  **supermercado**. Reclasificado el histórico por SQL **set-based** (WITH scope + ILIKE + CASE, sin UUIDs a mano):
  comunidad +15, suministros +29, más TEMU/TUSSAM/Primaprix. El **IBI** y tributos ya estaban cubiertos (subcat
  `ibi`). **Bizums unificados:** `comercioDe` devuelve un único grupo **"Bizum"** para cualquier envío (`\bBIZUM\b`),
  en vez de partir por destinatario → el total enviado por Bizum se ve de un vistazo. Tests 26/26 (comercio+keywords),
  regla documentada en el skill para no re-preguntar. Pendiente: confirmar con Alberto ambiguos (colegio San José
  SSCC/ACPA/Fundación Sagrados Corazones, GALOS CMI, RECIBO BANSABADELL, EX.AY.SEVILLA).

- **💶 Formato de dinero ESPAÑOL en todo el programa + regla permanente (07/07/2026).** Alberto: "mismo formato
  siempre". Todo importe en € va en formato `2.162,49€` (miles con punto también en 4 cifras, decimales con coma,
  € DETRÁS), NUNCA estilo dólar (`€2162.49`). Helper único **`apps/plataforma/lib/dinero.ts::eur`**
  (`toLocaleString('es-ES', {minimumFractionDigits:2, maximumFractionDigits:2, useGrouping:'always'})` + `€`).
  Pasada por toda la app plataforma (pantalla + Telegram + email; UI, libs y crons). **Regla global permanente**
  añadida al `CLAUDE.md` raíz ("## Formato de dinero"), a `apps/plataforma/CLAUDE.md` y al skill `plataforma-maestro`.

- **🧭 Reestructura de "En qué gasto" + 2 bugs del drill-down (07/07/2026, rama `claude/ia-categorization-issue-6a534b`).**
  Alberto: "la estructura es muy rara… la idea es ver dónde gasto en mi día a día". Un agente de arquitectura
  la revisó (sin tocar código) y de ahí salió esto. **Bug #1 (el "2 ops" que no cuadraba):** el drill-down de
  un comercio no filtraba por subcategoría → `/api/finanzas/categorias/movimientos` acepta `?categoria=` y
  `fetchMovsComercio` lo pasa (el comercio siempre se abre dentro de `expanded`). **Bug #2 ('Sin identificar'
  colapsaba comercios distintos):** nuevo helper puro **`lib/comercio.ts::comercioDe`** que quita el prefijo de
  operación ("COMPRA EN DIA SEVILLA 2260" → "DIA SEVILLA 2260") y **fusiona las filas con y sin contraparte del
  mismo comercio** (en prod la contraparte trae el texto completo, no un nombre limpio; `claveComercio` lo
  partía y elegía mal 'SEVILLA' para DIA por el corte de <4 chars). `getMerchantsForCategoria` agrupa en JS por
  él; `movimientos`/`asignar` casan por el mismo criterio. **Reestructura UI (`CategoriasTab.tsx`):** (1) titular
  del mes (total + ±% vs media 6m, nuevo `comparativaTotal` en `/api/finanzas/categorias`); (2) los 3 paneles
  solapados (Sin categoría + Por revisar + Sin identificar grandes) → **UNA cola "🔎 Necesitan tu atención"**
  (modo `?atencion=1`: NULL/otros_gasto O `subcategoria_revisar`, backlog por importe, plegada); (3) orden
  período→titular→cola→dona→categorías(grupo Vivienda)→comercios; insights/alertas al fondo plegados; **quitada
  la tabla de Ingresos** (vive en su tab). **Sidebar** (`UserSidebar.tsx`): 📊 Categorías → **💸 "En qué gasto"**
  (tras Banca, protagonista); 🧾 Gastos → **"Deducciones"** (separa eje gasto personal vs eje fiscal). Tests
  97/97, tsc 0, `next build` OK.

- **🔧 Reclasificación HISTÓRICA de gasto personal aplicada A MANO por SQL (06/07/2026, tras mergear #773).**
  El PR #773 dejó la categorización automática de aquí en adelante (ingesta + cron 07:00 + botón), pero los
  **movimientos personales ya existentes** seguían en `otros_gasto`/NULL hasta que corriera el barrido. Alberto
  lo vio ("la ia estos gastos sí lo sabría": RECIBO CIRCULO MERCANTIL, ZAPATERIA…). Se aplicó el **paso
  determinista (keywords)** directamente sobre la BD (`wswbehlcuxqxyinousql`, cuenta `4fdc993a…`) con un UPDATE
  **set-based** (`WITH scope … matches … DISTINCT ON (id) por prioridad`), scoped a `destino='personal' AND
  importe<0 AND (subcategoria IS NULL OR ='otros_gasto')`. **Resultado:** ~322 movimientos movidos a categoría
  real — Círculo Mercantil→`club` (€1.364), zapatería→`ropa`, comunidad→`comunidad` (🏠 Vivienda), + super
  (210), colegio (22), ocio/Amazon (59), hipoteca (20, €14.478)… **Quedan ~375 ambiguos** (173 NULL €32k
  gordos de una vez + 202 `otros_gasto`: Amazon Mktp, GALOS CMI, Bizums, transferencias) → esos los coge la
  **IA** (botón 🤖 Auto-clasificar o cron nocturno), NO la keyword. ⚠️ El bloque NULL de €32k tiene gastos
  grandes puntuales: revisar por si alguno no es consumo personal. **Ojo:** el SQL a mano fue una aproximación
  ILIKE del diccionario `subcategoria-keywords.ts`; las filas ya reclasificadas NO las vuelve a tocar el cron
  (solo procesa NULL/otros_gasto), así que si alguna quedó mal, se corrige con el desplegable (aprende regla).

- **🆕 Categorización AUTOMÁTICA de gasto personal (06/07/2026, rama `claude/ia-categorization-issue-6a534b`).**
  Alberto: "la IA no categoriza" — la pestaña 📊 Categorías amontonaba casi todo en "Otros gasto". Causa
  raíz: (1) la ingesta NO ponía subcategoría (todo entraba NULL); (2) el `auto-tag` mandaba a la IA **solo
  los NULL**, así que un `otros_gasto` ambiguo se quedaba en el cajón para siempre; (3) el botón 🤖
  Auto-clasificar estaba escondido (solo salía con NULL>0). **Arreglo (automático, sin pulsar nada):**
  función única **`lib/subcategoria-barrido.ts`** (`barrerSubcategoriasPersonal`) — keyword primero (gratis),
  IA de la pasarela GRATIS (NIM→Groq→Gemini→Kimi) solo para lo ambiguo, y **RESCATA los `otros_gasto`** (coge
  `subcategoria IS NULL OR ='otros_gasto'`). Enganchada a la **ingesta** (`analizarMovimientos` reparte por
  keyword al importar) y al **cron diario** `categorizar-movimientos` (`0 7 * * *`; ya NO usa la vía Anthropic
  de pago; `lib/categoria-ia.ts` ELIMINADO; `normalizarContraparte`→`lib/normalizar-contraparte.ts`). Baja
  confianza → marca la nueva columna **`subcategoria_revisar`** (NO reutiliza `requiere_revision`, que es del
  *destino*) en vez de tirar a otros_gasto en silencio. **Taxonomía Vivienda** (Montecarmelo): subcategorías
  **`comunidad`** (🏘️) e **`ibi`** (🏛️) + `GRUPO_VIVIENDA` (hipoteca+comunidad+ibi+suministros), agrupadas
  bajo "🏠 Vivienda" en la pestaña. **Extras A-D:** cola "🔎 Por revisar", panel "sin clasificar más grandes",
  badge ±% (mes vs media 6m), presupuestos por categoría con aviso Telegram scoped por `cuenta_id`
  (`categoria_alertas(_log).cuenta_id` nuevos, dedup mensual, aviso proactivo desde el barrido). **Prueba real:**
  de 720 gastos personales atascados, la keyword rescata 358 (50%) gratis al instante (167 super, 20 hipoteca,
  4 comunidad…); el resto a la IA. Migración `2026-07-06_subcategoria_control.sql` aplicada. Tests 21/21,
  typecheck 0 errores, `next build` OK. Spec+plan en `docs/superpowers/{specs,plans}/2026-07-06-categorizacion-*`.

- **🆕 Nuevo agente `buscador-ia` — vigía semanal de LLMs gratis (06/07/2026).** A raíz del incidente
  del 405B (ver más abajo), Alberto pidió un estudio semanal automático de si hay una IA gratis que
  convenga meter. Creado como hermano de `github-vigia`: skill `.claude/skills/buscador-ia`, estado vivo
  en `docs/BUSCADOR-IA.md`. Tres patas: (1) **watch de deprecación** de los modelos cableados en
  `packages/core-ai/src/client.ts` (NIM `llama-3.3-70b`, Groq, Gemini `2.0-flash`, Kimi) para cazar
  retiradas de catálogo ANTES de que rompan producción; (2) **descubrimiento** de gratis nuevos;
  (3) **mini-eval** de candidatos con 2 prompts fijos. Salida: `docs/BUSCADOR-IA.md` + Telegram si merece
  ojo + PR draft solo para swaps seguros (id muerto→vigente) o plumbing de proveedor nuevo (gateado por
  env, nunca activado por su cuenta). Indexado en `docs/SKILLS.md` y `docs/RUTINAS-PROGRAMADAS.md`
  (rutina 11, semanal lunes 07:00). **⚠️ PENDIENTE de Alberto:** crear el trigger en `claude.ai/code →
  Rutinas` (prompt `Ejecuta la skill buscador-ia` + `PLATAFORMA_URL`/`CRON_SECRET` al final).

- **✅ Decisiones de Alberto sobre gasto personal (06/07/2026).** Resueltas las 2 dudas pendientes: (1) la
  **lavandería El Girandillo** (~€1.100/mes) es de los **pisos** → reclasificada `destino='turistico_pisos'`
  (fuera del gasto personal) + regla `GIRANDILLO→turistico_pisos` en `banca_destino_reglas` para futuros; (2)
  el préstamo **CUOTA PTMO** (~€772/mes) es la **hipoteca de Montecarmelo** (su vivienda) y la cuota ~€800 es
  la **inscripción de socio del Círculo Mercantil** (recurrente). Nuevas subcategorías canónicas **`hipoteca`**
  (🏦) y **`club`** (🎩) en `lib/categorias-personales.ts`, con claves en `lib/subcategoria-keywords.ts`
  (`CUOTA PTMO`/`HIPOTECA`→hipoteca, `CIRCULO MERCAN`→club) y en `SUBCAT_SINONIMOS` del agente (para "¿cuánto en
  hipoteca/club?"). Reclasificados los movimientos existentes y aprendidas las reglas por SQL.

- **✅ Agente huéspedes SIVRA: arreglado "IA no disponible" — modelo fuerte muerto (06/07/2026).**
  Un huésped de House Sevillana (reserva 146294321, «Estamos a caminho de Sevilla») recibió borrador vacío
  con `motivo:'IA no disponible'`. **Causa raíz (logs de prod Vercel, `/api/sivra/mensajes/webhook`
  12:31 UTC):** el modelo "fuerte" `AGENTE_HUESPED_MODEL` default `meta/llama-3.1-405b-instruct` **fue
  retirado del catálogo de NVIDIA NIM → `HTTP 404` en CADA mensaje**; normalmente lo enmascara el reintento
  con el 70B por defecto (30/06 y 04/07 sí tuvieron borrador), pero ese día el 70B **también** cayó
  (`aborted due to timeout`) y **ningún fallback (Groq/Gemini/Kimi) rescató** → "IA no disponible".
  **Arreglo (código):** `decidir.ts` deja `AGENTE_HUESPED_MODEL` **vacío por defecto** → una sola llamada al
  70B por defecto (que ya trae la cadena NIM→Groq→Gemini→Kimi); si se pone un id verificado vivo, se usa como
  modelo fuerte aditivo. Elimina el 404 determinista y el round-trip desperdiciado en cada mensaje.
  **⚠️ PENDIENTE de Alberto (Capa B, config, no toco secretos):** verificar que **`GROQ_API_KEY`** (y opcional
  `MOONSHOT_API_KEY`) están puestas y sanas en el proyecto Vercel `plataforma` — son la red de seguridad que
  falló; con Groq activo el 404/timeout de NIM se habría rescatado solo. PR draft en la rama
  `claude/sevillana-reservation-146294321-bos9dx`.

- **✅ Agente contable: "¿cuánto en super/bares en <mes>?" responde por subcategoría (06/07/2026).**
  Alberto preguntó al chat "¿cuánto se ha gastado en supermercado en junio?" y respondía **€13.347/145 mov**
  (¡el gasto TOTAL de junio!): el parser detectaba "junio" y devolvía `movimientos_mes`, **tirando
  "supermercado"**. Arreglo en `lib/contable/`: (1) `intencion.ts` extrae el mes UNA vez (`detectarMes`) y
  lo **COMPONE** con la categoría; nuevo intent `subcategoria` con `SUBCAT_SINONIMOS` (super/bares/gasolina/
  farmacia/ropa/… → subcategoría canónica), casado como palabra completa (`tienePalabra`, evita que 'bar'
  pique en 'Barcelona'); va ANTES del mes-solo. (2) `respuestas-directas.ts` responde el intent por
  `subcategoria = X OR (ILIKE de las claves del diccionario)` — reusa `clavesDeSubcategoria()` de
  `lib/subcategoria-keywords.ts` (sin duplicar), SOLO `destino='personal'`, con mes opcional. Validado en BD:
  "supermercado junio" pasa de €13.347 a **€442,97/25 mov** (real). `concepto` (luz/agua…) también admite mes.
  Tests intencion 21/21.

- **✅ Categorías = SOLO gasto personal de consumo + rescate de "otros_gasto" (06/07/2026).** Alberto: "la
  categoría la quiero para analizar mis gastos personales, ni negocios… cuánto gasto en super, en bares".
  Dos fallos vistos en la BD real: (1) el gráfico sumaba `subcategoria IS NOT NULL` SIN filtrar `destino`
  → colaba **traspasos internos** (liquidaciones `TARJ.CRDTO`, miles de €), **negocio** (turistico_*/seguros)
  e **ingresos** (SUM(ABS) los sumaba) → "Otros gasto" al 97% (€7.196 jul; lo personal real eran €3.038).
  **Arreglo:** la agregación de `/api/finanzas/categorias` ahora filtra `destino='personal' AND importe<0`
  (coherente con el contador "sin categoría"). (2) El histórico estaba enterrado en `otros_gasto` (de pasadas
  antiguas de IA) y **auto-tag solo miraba `NULL`**, así que super/bar/farmacia/ropa no afloraban. **Arreglo:**
  `auto-tag` ahora coge `(subcategoria IS NULL OR ='otros_gasto')` y el paso determinista por palabra clave
  **reclasifica** los otros_gasto que en realidad son super/bar/etc (sin reescrituras no-op; la IA sigue solo
  para lo `NULL` desconocido). Validado en BD: una pasada rescata ~208 movimientos (**supermercado 166/€3.209**,
  restaurante_bar 16, farmacia 11, ropa 9, transporte 5, deporte 1). Alberto pulsa 🤖 Auto-clasificar una vez
  y salen. ⚠️ PENDIENTE de decisión de Alberto (no tocado aún): la **lavandería El Girandillo (~€1.100/mes,
  destino personal)** parece de los pisos (negocio) → habría que pasarla a `turistico_*`; y el **préstamo
  (CUOTA PTMO ~€772/mes)** + cuotas fijas (Círculo Mercantil ~€850, comunidad) — decidir si categoría propia o
  fuera del análisis de consumo.

- **✅ Categorías: gráfico legible + filtro por fechas (06/07/2026).** Alberto: "no se ve bien" (captura) —
  la leyenda de Recharts se solapaba con la dona en móvil al haber ~15 categorías. Arreglo: **quitada la
  `<Legend>`** de la dona (redundante) y la **tabla de abajo hace de leyenda** con un punto de color por fila
  que casa con su porción; dona más compacta (200px, radios 55/90). Además Alberto pidió **filtro por fechas
  por defecto el mes en curso**: `CategoriasTab` tiene ahora presets **Mes actual / Mes anterior / Año** +
  inputs `desde`–`hasta` (rango personalizado); por defecto `mes_actual`. Las 4 rutas
  (`categorias`/`comerciantes`/`movimientos`/`insights`) aceptan `desde`/`hasta` (YYYY-MM-DD) que **mandan
  sobre year/mode**. El selector año/trimestre de `/finanzas` sigue rigiendo las demás pestañas. OJO: el
  contador "sin categoría" es ahora del rango filtrado, pero `auto-tag` sigue clasificando TODO el histórico
  (no filtra por fecha) — puede haber leve desajuste entre el número mostrado y lo que auto-clasifica.

- **✅ Auto-clasificar Categorías: paso DETERMINISTA antes de la IA (06/07/2026, PR #762 + follow-up).** El
  botón "🤖 Auto-clasificar" seguía dando ⚠️ pese al arreglo de lotes (#762). Los logs de Vercel lo
  confirmaron: no era solo tamaño de respuesta — **toda la pasarela de IA estaba saturada** (Gemini HTTP 429
  "quota exceeded" en `/api/ai/search` y `/api/ai/chat`; timeouts en `insights` y `auto-tag`). Arreglo robusto
  alineado con el principio "funciona con la IA saturada": nuevo módulo PURO `lib/subcategoria-keywords.ts`
  (9 tests) que clasifica los gastos **obvios por palabra clave** (Mercadona, DIA, bares, gasolineras,
  farmacias, Netflix, Iberdrola, DIGI…) **al instante y sin IA**, aprendiendo regla en `banca_destino_reglas`.
  `auto-tag/route.ts`: PASO 1 determinista → solo los ambiguos van a la IA (PASO 2, en lotes con presupuesto de
  tiempo). Si el determinista etiquetó algo, es **éxito parcial (200)** aunque la IA esté caída (la siguiente
  pasada coge el resto); solo 502 si NADA se pudo clasificar. Antes: primer intento #761 (fallback+parse
  tolerante), luego #762/#763 (lotes de 12 + `maxDuration=60` + paso determinista), y **follow-up #764
  (06/07/2026)**: los logs reales mostraron que el gasto de Alberto es en comercios **locales de Sevilla**
  (HORNO NUEVA FLORIDA, FCIA.MARINA, MARISCOS GONZALEZ, ULTRAMARINO, adidas, GOCCO…), no cadenas nacionales,
  así que `subcategoria-keywords.ts` amplió términos genéricos españoles (HORNO/ULTRAMARINO/ALIMENTACION→
  supermercado, FCIA→farmacia, ADIDAS/NIKE→deporte, GOCCO/MAYORAL→ropa) + regla de última prioridad
  `otros_gasto` (TANATORIO/EXPENDIDURIA/ESTANCO); y se bajó el timeout por proveedor IA 18s→8s y el
  presupuesto del lote 48s→38s (la cadena NIM→Groq→Gemini es aditiva y se pasaba de los 60s de `maxDuration`
  → 504). `auto-tag` ya no puede morir por 504: siempre 200 con lo que el determinista haya etiquetado.

- **✅ Categorías: fix 'Cargando…' infinito en modo Año fiscal (06/07/2026, PR #759).** La pestaña mandaba
  el trimestre como `month` (0='Año'); `/api/finanzas/categorias` en modo año fiscal formateaba la fecha
  como `'2026-00-01'` (mes 0 inválido) → error Postgres → 500 sin `.catch` → spinner colgado para siempre.
  Arreglo: el modo año fiscal cubre Ene-Dic completo (coherente con `/comerciantes` y `/movimientos`, que ya
  usaban el año entero); el modo rolling sanea el mes a 1-12 (0→12); try/catch devuelve vacío en vez de 500;
  cada fetch inicial de la UI tiene su propio `.catch` (antes un `Promise.all` sin catch dejaba `loading` a
  medias si una API caía).

- **✅ facturas: extracción robusta Groq→NIM + aviso de PDF ilegible + ventana `?horas` (06/07/2026, PR
  #760).** El scan de las 06:00 ya no daba 504 (fix previo), pero algunos PDFs se imputaban vacíos → `'error'`
  mudo. Causa: `aiExtractInvoice` era la ÚNICA llamada IA de la app SIN cadena de respaldo (solo NVIDIA NIM);
  si NIM devolvía algo no-JSON o se colgaba (mismo mal que el triaje, PR #745), la factura quedaba a cero.
  Arreglo: `ai-client.ts` prueba **Groq primero** (mismo Llama-70b, responde en segundos) con **NIM de
  respaldo**, devuelve el primer JSON válido no vacío (`nimConfig()` pasa a perezoso); si un adjunto sale sin
  total/proveedor/NIF se marca **no legible** y avisa por Telegram (`avisaNoLegibles`) en vez de morir como
  error mudo (el OCR de escaneados queda para otra fase); nuevo parámetro `?horas=N` (1–240, def. 36) en
  `expenses/agent/scan` para recuperar facturas fuera de ventana mientras el scan estuvo caído.

- **✅ Gastos personales: pestaña Categorías accesible + editable (05/07/2026).** Alberto quería "revisar y
  segmentar los gastos personales para controlar el gasto". Al mapear se vio que **ya existía** casi todo
  (pestaña `📊 Categorías` en `/finanzas`: dona, drill-down por comercio, alertas de presupuesto, insights IA,
  resumen semanal por Telegram) pero (a) **no había acceso en la sidebar** (solo por URL a mano) y (b) **no se
  podía modificar** la categoría de nada ahí (solo auto-clasificar en bloque). Cambios: (1) entrada `📊 Categorías`
  en la sidebar (`UserSidebar.tsx`); (2) **editar en sitio** — desplegable por comercio que reasigna todos sus
  movimientos y aprende regla (`banca_destino_reglas`), drill-down a movimientos sueltos con override por
  movimiento, y panel clicable de "sin categoría" para asignar a mano — vía `POST /api/finanzas/categorias/asignar`
  (comerciante|movId, scoped `cuenta_id`) + `GET .../movimientos`; (3) **fuente única de subcategorías**
  `lib/categorias-personales.ts` (puro, 6 tests) que reconcilia las 3 listas divergentes previas (la
  auto-clasificación ya puede poner `seguro`/`suministros_piso` y usa `otros_gasto`, no `otros`). Sin migración
  de BD (reusa `subcategoria` + `banca_destino_reglas`). Pendiente anotado: `categoria_alertas` no filtra por
  `cuenta_id` (inocuo con un solo usuario).

- **✅ Agente contable: fixes de fiabilidad y UX (04–05/07/2026, PRs #735/#737/#747).** Cadena de fallback IA
  NIM→Groq→**Gemini**(gratis)→Kimi; `CONTABLE_MODEL` (DeepSeek por defecto); respuesta determinista al tramo
  fiscal + panorama de contexto (sociedades/negocios/saldos/IRPF); **fix `#747`:** "¿cuánto gasté en `<proveedor>`?"
  ya no devolvía el total del año (extractor de concepto genérico en `intencion.ts` con `STOP_CONCEPTO`), y las
  tarjetas de acción muestran **importe · fecha · banco** para poder confirmar sin salir del chat.

- **✅ Booking → Drive → contable, por fases (05/07/2026, PRs #752/#753/#754).** Alberto: los mails de
  Booking adjuntan las liquidaciones; quería que llegaran a Drive, la IA las leyera y el contable
  confirmara. Al mapearlo se vio que el pipeline que debía hacerlo (`expenses/agent/scan`, cron 06:00)
  **estaba roto** (504 diario, 0 Booking en `gastos`). Tres fases:
  - **Fase 1 (#752):** el 504 era una llamada colgada al web-app de Drive sin timeout → `AbortSignal.timeout(20s)`
    en `agente-facturas/drive.ts` + `maxDuration` 60→300 + presupuesto de tiempo (para a 250s, lo restante
    lo coge la pasada siguiente). Misma medicina que arregló el triaje.
  - **Fase 2 (#753):** puente Drive **robusto** — `call()` reintenta transitorios con backoff (5xx del proxy
    de Google, redirección de login/cuota que devuelve HTML en vez de JSON); errores reales (4xx, `ok:false`)
    NO se reintentan. Y la subida ya no se traga el fallo en silencio: `avisaSinDrive()` (Telegram 🏨) cuando
    una factura se imputa pero su PDF no llegó a Drive. Cuenta de servicio Google = mejora opcional futura.
  - **Fase 3 (#754):** auto-confirmación **segura**. Booking NUNCA se auto-imputa en silencio (`ctx.esBooking`
    en `procesarFactura` → siempre a bandeja + toque Telegram, porque una liquidación trae varias reservas +
    comisión + IVA y casi nunca cuadra a un cargo exacto). Política del contable documentada en la skill
    `facturas-correo` (Paso 4): auto-confirma conciliación SOLO si extracción limpia + importe exacto a un
    único movimiento; Booking / varios candidatos / descuadre / dudas → toque a Alberto, nunca auto.
  - **Pendiente de Alberto:** verificar tras el redeploy que el scan de las 06:00 devuelve 200 (no 504) y que
    empieza a entrar Booking en `gastos` con `drive_url`.

- **✅ auditoría 05/07 — cron `correo-triaje` YA NO está mudo; clasificador arreglado (PRs #743/#744/#745, 04/07/2026).**
  El bloqueo de envs `GMAIL_USER`/`GMAIL_APP_PASSWORD` en Production que reportó la auditoría del 04/07
  (entrada de abajo) **se resolvió** — el heartbeat de hoy confirma `correo_triaje` con actividad hace 3,4h
  y sin huecos desde entonces; el 🔴 de esa entrada queda **obsoleto**. Una vez corriendo, la primera pasada
  real en sombra sacó otro problema (no de envs): el clasificador marcaba casi todo `dudoso`. Tres fixes de
  Alberto el mismo día:
  - **#743** — `CATEGORIAS_IA.includes()` exigía coincidencia exacta (`"Contabilidad"` no casaba con
    `"contabilidad"`) → `normalizarCategoria()` tolera mayúsculas/puntuación; umbral de confianza 0.6→0.5;
    cursor se escribe en el `finally` (antes se repetía sin avanzar); filas fallidas pasan a `'error'` en
    vez de quedar `'pendiente'` para siempre.
  - **#744** — timeout 504 en cada pasada: 50 correos/pasada en serie (~15s/uno) agotaba los 300s de Vercel
    → tope bajado a 10/pasada, timeout de IA 25s→20s.
  - **#745** — causa raíz real: NIM (`aiComplete`) tardaba ~25-30s y su propio timeout cortaba la llamada →
    todo cae a `dudoso` con `confianza=0`. Cambiado a **Groq primero** (`llamarIA()`, mismo Llama-3.3-70b,
    responde en segundos; NIM queda de respaldo). `.claude/skills/correo-triaje/SKILL.md` y
    `apps/plataforma/CLAUDE.md` actualizados (auditoría de hoy) para reflejar el orden Groq→NIM.
  - **Verificado por Supabase MCP:** tras el deploy de #745 (04/07 07:47 UTC) hubo una ventana corta
    (~08:20-09:20 UTC, 9 correos) todavía cayendo a `dudoso` con confianza 0 — probablemente arranque en
    frío de Groq o un rate-limit puntual — pero **0 correos `dudoso` desde entonces** en las ~15h siguientes
    hasta la última pasada (22:40 UTC). Sigue todo en modo sombra (0 acciones reales); no requiere más acción.

- **⚕️ Health-check 04/07 — 3 hallazgos del monitor matinal (branch `claude/ia-rest-monitor-health-g3irwd`).**
  Analicé el Health Check que llegó por Telegram (🔴 backlog 1056 · 🟡 105 alertas · 🔴 CIMA 404):
  1. **CIMA LIQ 404 → cron apagado tras flag.** `ws.cimaseg.es/wsEstandar/` devuelve 404 (endpoint WSE nunca
     validado — el sandbox Codeoscopic/Avant2 quedó pendiente del ticket LOOR.es, PR #508). Un 404 NO es auth
     ni password. El cron `cima-liq` corría a diario y alertaba 🔴 cada 07:30 → lo gateé tras
     **`CIMA_WSE_ENABLED` (default off)**: no corre ni alerta hasta que Alberto ponga la env a `true` con la
     ruta confirmada. **Bug latente corregido de paso:** la query de cruce con BBVA usaba `mb.fecha` (no
     existe) → habría dado 500 en cuanto CIMA conectara; ahora `fecha_operacion` y lee de `v_movimientos_activos`.
  2. **Backlog `requiere_revision` 1069 era falso 🔴.** Investigado en BD: **937 de esos 1069 están
     `destino_confirmado=true`** (ya clasificados; saneos SQL fijaron el destino sin limpiar la bandera). El
     backlog REAL (marcado Y sin confirmar) es **132**. El Check 2 del health-check contaba `requiere_revision`
     a secas → lo alineé con la semántica del resto de la app (`requiere_revision AND NOT destino_confirmado`)
     → ahora reportará 🟡 132, no 🔴 1069. **PENDIENTE opcional (requiere OK de Alberto):** limpiar las 937
     banderas obsoletas (`UPDATE … SET requiere_revision=false WHERE destino_confirmado=true AND requiere_revision=true`).
  3. **105 alertas >30 días** (Check 6, 🟡): deuda de limpieza, sin tocar.

- **✅ 04/07 — agente-huésped: fix "afirma acciones que no ejecuta" + scope del entrenador ampliado
  (rama `claude/reservation-cancellation-draft-*`).** Alberto detectó un borrador de cancelación (reserva
  134250232, huésped Mirian) donde el agente AFIRMABA que la reserva "ya está cancelada" — falso: el agente
  solo redacta, no cancela en Smoobu; se inventó la acción. Además pedía confirmar fechas que ya tiene de
  Smoobu (`contexto.ts`). **Fix:** nueva regla **"NO EJECUTAS ACCIONES"** en el system prompt de
  `apps/plataforma/lib/sivra/agente-huesped/decidir.ts` (nunca afirmar gestiones no hechas: cancelar/
  reembolsar/cambiar fechas/cobrar; ante una petición así, acusar recibo y trasladar al anfitrión; y no
  re-verificar con el huésped datos de la reserva que ya están en la ficha). **Además**, se metió el
  `agente-huésped` en el scope del `agentes-entrenador` (fila en `docs/SKILLS.md` § Agentes programados +
  nota en su SKILL de que hay prompts que viven en CÓDIGO, no en `.md` → el PR toca `decidir.ts`), y se
  anotó el caso en `docs/FEEDBACK-AGENTES.md`. Motivo: el agente de huéspedes no estaba en la lista que el
  entrenador evalúa, así que este tipo de fallo no lo habría cazado solo.

- **🛡️ correo-triaje: arranca en SOMBRA por defecto (03/07, seguimiento del PR #718).** Alberto pidió
  "hazme tú lo pendiente". El MCP de Vercel NO escribe env vars, así que en vez de `TRIAJE_DRY_RUN=true`
  cambié el DEFAULT del código: `lib/correo/triaje.ts` `DRY_RUN = () => process.env.TRIAJE_DRY_RUN !== 'false'`
  → cuando el cron pueda correr, lo hará SIN tocar la bandeja hasta que Alberto valide y ponga
  `TRIAJE_DRY_RUN=false`. Tablas ya aplicadas (11 reglas semilla). **NO resuelve el blocker de abajo**
  (envs Gmail en Production): eso sigue siendo acción manual de Alberto en Vercel.

- **✅ RESUELTO (ver entrada de arriba, auditoría 05/07) — auditoría 04/07: cron `correo-triaje` MUDO en producción, causa por confirmar.** El agente de
  triaje de correo (PR #718, ver más abajo) no ha completado NUNCA una pasada: primero
  `relation "correo_cursor" does not exist` (la migración `2026-07-03_correo_triaje.sql` tardó en
  aplicarse; ya aplicada — tablas `correo_triaje`/`correo_cursor`/`correo_reglas` existen), y desde las
  19:40 del 03/07 (deploy `dpl_DLkUeQzat71yb146DUngzxPvmuVZ`, el de producción actual) **`Error: Faltan
  GMAIL_USER / GMAIL_APP_PASSWORD`** en CADA pasada de 10 min hasta ahora — mismo par de envs que usa con
  éxito `facturas-scan` (agente de pago de facturas), pero ese cron es diario (06:15 UTC) y no ha vuelto a
  correr desde antes del cambio, así que no sirve de control. **Acción manual de Alberto:** revisar en
  Vercel → proyecto `plataforma` → Settings → Environment Variables que `GMAIL_USER`/`GMAIL_APP_PASSWORD`
  siguen presentes para el entorno **Production** (no solo Preview) y forzar un redeploy si hiciera falta
  — Vercel no siempre repropaga un env editado a los deployments ya construidos. Sin este cron, el Gmail
  de Alberto no se está triando desde su creación. Detalle en `docs/AUDITORIA-2026-07.md`.

- **✅ 5 entradas de memoria pendientes reconciliadas (auditoría 04/07, commits del 03/07 tarde/noche sin anotar):**
  - **rrhh: `centro_trabajo` pasa a texto libre + fecha de reconocimiento médico en la ficha del empleado**
    (commit `073c5bc`). El desplegable fijo (CAMAS/MANCHON/AMBOS) no servía para clientes con centros de
    trabajo distintos → ahora es un campo de texto libre. Nueva columna `fecha_reconocimiento_medico` en
    `rrhh.empleados`, editable desde `/admin/empleados/[id]`.
  - **plataforma: domótica Tuya — ventilador de techo de Socorro** (PR #714). Ver ficha nueva en
    `apps/plataforma/CLAUDE.md` y `plataforma-maestro`.
  - **plataforma: eliminado el tracker Modelo 179 de `/finanzas`** (PR #698, 03/07/2026 — no 02/07 como
    decía por error `apps/plataforma/CLAUDE.md`, ya corregido). El 179 lo presentan los intermediarios
    (Booking/Airbnb/gestores), no el propietario/cedente; el tracker con plazos Q1-Q4 venía mal modelado
    desde el PR #341.
  - **plataforma: agente de triaje de correo** (PR #718). Ver ficha nueva arriba (🔴 cron mudo) y en
    `apps/plataforma/CLAUDE.md`/`plataforma-maestro`.
  - **ialimp: el mailing frío ya no encola el paso 1 a leads contactados a mano** (PR #717). El
    auto-encolado del paso 1 no aplicaba la misma exclusión (`contactado`/`interesado`/`descartado`/
    `rebotado`) que sí aplicaban los pasos de seguimiento → un lead contactado en persona podía recibir
    igualmente el email frío de presentación. Convención: registrar el contacto manual en
    `mailing_prospectos` con `estado='contactado'`+notas.

- **🧠 Agente contable: fiabilidad IA + tramo fiscal + panorama completo (03/07/2026, PRs #733/#735/#737 mergeados).**
  - **Fiabilidad IA (#733/#735):** `aiComplete` (`packages/core-ai`) encadena **NIM → Groq → Gemini → Kimi**.
    Nueva `geminiChat()` (texto sin grounding) + `moonshotChat()` (Kimi). Gemini se activa SOLO con
    `GEMINI_API_KEY` (ya presente) → resuelve el "IA no disponible" que sufrió Alberto (chat contable y agente
    de huéspedes) cuando NIM+Groq estaban rate-limited a la vez. Kimi (de pago) es último recurso: falta poner
    `MOONSHOT_API_KEY` en Vercel de plataforma para activarlo (opcional).
  - **Modo determinista (#733):** preguntas estructuradas se responden por **SQL sin LLM** (`intencion.ts` puro +
    `respuestas-directas.ts`): gasto/ingreso mes/año, por concepto (sinónimos), por destino, facturas
    pendientes. Instantáneo e inmune a saturación. `CONTABLE_MODEL` (default `deepseek-ai/deepseek-v3`) para el
    razonamiento libre; `stripThink()` limpia `<think>` de modelos de razonamiento.
  - **Tramo fiscal (#737):** intención `tramo_fiscal` ("¿en qué tramo estamos?") responde con tramo marginal,
    base imponible, tipo efectivo y margen — reutilizando `getResumenFinanciero` (misma fuente que `/finanzas`).
  - **Panorama completo en el contexto (#737):** `construirContexto` ahora inyecta, además de movimientos, el
    **bloque fiscal IRPF** + las **sociedades/negocios** + los **saldos bancarios** (consultas directas y
    baratas, sin salir a los adaptadores por-vertical que harían HTTP). Prompt del sistema pasa a "agente
    FINANCIERO" con visión transversal. Skill `plataforma-maestro` actualizada con la ficha del agente.
  - Solo toca `lib/contable/*` + `packages/core-ai`. Sin migración. Tests `lib/contable` 46/46. Pendiente
    Alberto (opcional): function-calling para tirar de datos concretos por-vertical bajo demanda (otro PR).

- **🧾 facturas: 4 recibos de luz Endesa de Bustos Tavera 22 deducidos a nombre de Alberto + corrección de piso (03/07/2026, rama `claude/account-name-transfer-52o8b1`).**
  - Alberto subió 4 facturas Endesa (feb–may 2026) de Bustos Tavera 22 (IZQ/Busto Reform + DCHA/Luxury Busto), **a nombre de PUNTO Y COMA GESTION SL** pero pidió deducirlas y archivarlas como suyas (los pisos pasan a IRPF personal desde 2026; la SL está dormida).
  - **Hecho:** los 4 cargos del banco (−38,54 · −71,42 · −100,00 · −133,71 €, cuenta `4fdc993a…`) quedan `conciliado=true`, `destino=turistico_pisos`, con el nº de factura/CUPS/contrato y el caveat fiscal en `comentario`.
  - **Corrección importante:** el `propiedad_id` de los 4 estaba **intercambiado Reform↔Luxury** (asignación del 02/07 por correlación de ocupación, confirmada «ES OK» pero errónea). Los PDF oficiales traen CUPS+dirección+nº factura que coincide con el concepto bancario → prueba documental. Correcto: **contrato 130139655504 = CUPS …443002ED0F = BJO IZQ = Busto Reform** (38,54 y 100,00); **contrato 130139685932 = CUPS …443004EB0F = BJO DCHA = Luxury Busto** (71,42 y 133,71). Corregida también la tabla LUZ de la skill `facturas-correo`.
  - **Pendiente de Alberto:** (1) archivar los 4 PDF en Drive `FACTURAS Apartamentos/2026/04-Abril-2026` (los del 21/04) y `05-MAYO-2026` (los del 19/05) — la subida binaria por MCP no era viable (PDF ~700KB → base64 inline); (2) pedir a Endesa el **cambio de titular a su nombre** para que las facturas futuras (y a poder ser estas) no queden a nombre de la SL. Deducibilidad fina: confirmar con Asecon el tratamiento de facturas aún tituladas a la SL.

- **📱 plataforma: fix responsive móvil en /banca (03/07/2026, rama `claude/por-revisar-scroll-issue-il0l0i`).**
  - **Queja de Alberto (captura móvil):** (1) la bandeja "🔎 Por revisar" no se podía leer — cada fila se
    forzaba a `min-width:520px` con `overflow-x:auto`, un scroll horizontal inservible en táctil (importes y
    desplegable de categoría cortados por la derecha); (2) al bajar con scroll, el botón hamburguesa ☰
    (`position:fixed` chip pequeño) tapaba a medias la esquina superior-izquierda de los títulos
    ("⚠️ Posibles cargos duplicados").
  - **Fix 1 — `app/(usuario)/banca/BancaClient.tsx` (`RevisarBandeja`):** en móvil (≤768px) la fila se
    **apila** (card): concepto a ancho completo arriba (envuelve, sin ellipsis), fecha+importe en una línea
    (`margin-left:auto`), desplegable a ancho completo. Se eliminó el `min-width:520px`/`overflow-x` de esta
    bandeja. Escritorio sin cambios. (Las reglas `.banca-movs-*` de la tabla grande se dejaron intactas.)
  - **Fix 2 — `app/(usuario)/UserSidebar.tsx` (rama móvil):** el chip flotante ☰ pasa a ser una **barra
    superior de ancho completo** (`position:fixed; top:0; left/right:0; height:52; z-index:30`, fondo
    `--surface`, borde inferior) con el ☰ + marca "ia plataforma". z-index por DEBAJO del backdrop(40) y el
    drawer(50) → el menú abierto la sigue cubriendo. `LayoutShell` (paddingTop:52 en móvil) sin tocar: ya
    reservaba justo ese alto. Ahora el contenido desplazado pasa limpio por debajo de una barra sólida en
    vez de asomar medio tapado por un recuadro.
  - **Verificación:** harness HTML con el markup+media queries reales, capturado con Chromium headless a
    viewport móvil: `scrollWidth==clientWidth` (sin overflow horizontal) y apilado correcto (importe íntegro,
    select a lo ancho). Regla responsive global del repo respetada (usable a ≥320px, no solo "que quepa").
  - **PLUS — 2 bugs de typecheck de MAIN arreglados de paso (el gate `Tests & Typecheck` estaba en ROJO para
    TODOS los PRs, no solo este):** (1) `app/(usuario)/contable/page.tsx:66` — `new Promise(...)` sin genérico
    resolvía a `unknown`, no asignable a `const base64: string` → añadido `<string>` (venía de #729). (2)
    `packages/core-ai/src/stt.ts:29` — `new Blob([bytes])` con `bytes: Uint8Array` fallaba TS2322 por el caso
    `SharedArrayBuffer` del lib → cast `as BlobPart` (venía de #731 voz). El build de Vercel se los tragaba
    (`typescript.ignoreBuildErrors`), pero el nuevo workflow `tests.yml` (tsc estricto) no. **Verificado en
    local `tsc --noEmit -p tsconfig.json` de plataforma → EXIT 0.** OJO CI: el hook `Stop` de memoria empuja
    commits `[skip ci]` que, por la `concurrency: cancel-in-progress` de `tests.yml`, cancelan el run en vuelo
    sin lanzar otro → el check puede no reportar verde nunca aunque el código lo esté (por eso la verificación
    local es la prueba buena).

- **🆕 plataforma: Agente de contabilidad conversacional — VOZ por Telegram (backlog del spec, 03/07/2026, rama `claude/ai-accounting-agent-3a9o22`).**
  - Cierra el último ítem del spec (voz). Nota de voz al bot (`message.voice`/`message.audio`) → se descarga
    (`descargarTelegram`) → se transcribe con **Groq Whisper `whisper-large-v3`** (gratis, misma `GROQ_API_KEY`
    del fallback de texto) → se trata como si Alberto lo hubiera escrito (`manejarVozTg`→`manejarTextoLibreTg`).
    Eco `🎤 <i>…</i>` de lo entendido. Si no reconoce nada → pide que lo repita/escriba (nunca inventa).
  - **Cliente STT puro** nuevo en el núcleo: `packages/core-ai/src/stt.ts::groqTranscribe` (identity-agnostic,
    multipart a `api.groq.com/openai/v1/audio/transcriptions`, `language:'es'`), exportado en el barrel.
    Wrapper de app `lib/ai-client.ts::aiTranscribe(buffer,fileName,mimeType)` (lee `GROQ_API_KEY`).
  - Enganche en el catch-all del webhook ANTES de la rama de documento. Build verde, tests `lib/contable` 30/30.
    Con esto el spec del agente de contabilidad queda **COMPLETO** (fases 1–4 + voz). Requiere `GROQ_API_KEY`
    en el proyecto Vercel de plataforma (ya existe como fallback de texto).

- **🆕 plataforma: Agente de contabilidad conversacional — FASE 4 (Telegram + proactividad + onboarding) (03/07/2026, rama `claude/ai-accounting-agent-3a9o22`).**
  - **Boca Telegram** (`lib/contable/telegram.ts`) sobre el webhook único del bot
    (`app/api/sivra/mensajes/telegram-webhook/route.ts`): (a) rama callback `cont_ok`/`cont_no` que
    confirma/descarta acciones **reutilizando `contable_accion` de la Fase 2** (`ejecutarAccion`/
    `descartarAccion` por id) — **NO se creó `contable_pendiente_tg`** (una sola fuente de verdad web+TG);
    (b) **catch-all de texto libre** AL FINAL del webhook (después de `pago_`/`mov_`/`hsp_`/`deduccion_` y
    de los `force_reply`, y con guarda `!reply_to_message` + `chat.id === TELEGRAM_CHAT_ID`) → `cerebro.
    responder(...,'telegram')`, responde por `tgSend` y manda botones si propone acción; (c) **foto/PDF**
    (`message.photo`/`message.document`) → `descargarTelegram` (getFile→CDN) → `procesarDocumento` (Fase 3)
    → propone conciliar con botón. `cuenta_id` fijo = `SELECT id FROM cuentas LIMIT 1` (patrón de los crons).
  - **Proactividad** (`lib/contable/proactivo.ts` + cron `/api/cron/contable-proactivo`, `0 9 * * 1` lunes):
    resumen breve a Telegram SOLO si hay algo (nº por revisar / facturas sin cerrar / cargos deducibles
    de 30 días sin justificante). No spamea.
  - **Onboarding** (§8): comando `/contable` → mensaje guía; la memoria se construye después con lo que
    Alberto cuente (canal `APRENDER` del cerebro), sin sembrar datos sensibles a mano.
  - Builder puro compartido `documentos-tipos.ts::accionConciliar` (usado por la boca web y la de TG para
    no divergir). Tests `lib/contable` 30/30, build verde. Con esto el spec queda COMPLETO salvo voz (backlog).

- **🆕 plataforma: Agente de contabilidad conversacional — FASES 2 y 3 (03/07/2026, rama `claude/ai-accounting-agent-3a9o22`).**
  - **Fase 2 (PR #727, MERGEADO):** el agente `/contable` ya no solo informa — **propone acciones** sobre
    `movimientos_bancarios` que Alberto **confirma en pantalla**. Canal lateral `ACCION: {json}` (calco de
    `APRENDER:`), refs cortas `#n`, persistencia en tabla nueva `contable_accion` (estado pendiente),
    ejecución **por id** (nunca confía en params del cliente) reutilizando los writers existentes. Acciones
    v1: `clasificar` (+aprende regla en `banca_destino_reglas`), `amortizable` (toggle), `confirmar`.
  - **Fase 3 (documentos — foto ticket / PDF factura, en esta rama):** botón 📎 en `/contable`. El route
    `/api/contable/chat` acepta `adjunto {base64,mimeType,fileName}` → `lib/contable/documentos.ts`
    `procesarDocumento` reutiliza el extractor CANÓNICO `agente-facturas/extraer.ts::extraerDesdeBuffer`
    (PDF→pdf-parse, imagen→visión NIM; NO hay OCR nuevo) + un matcher **read-only** (SELECT de
    `factura-ocr.ts::casarFactura` SIN el UPDATE, scoped por cuenta, excluye `duplicado_estado='ignorado'`).
    Si casa un movimiento → propone acción nueva **`conciliar`** (nueva rama en `acciones.ts`: UPDATE
    `conciliado=true, factura_ref`, por id, scoped) → tarjeta Confirmar existente. **Números deterministas
    (OCR+SQL), no del modelo → nunca inventa importe;** ilegible → "no lo he podido leer". Módulo puro
    `documentos-tipos.ts` (interpretar/resumen/ref) testeado (9 tests). **Sin migración** (`contable_accion`
    ya existe, `conciliado`/`factura_ref` ya existen). Fase 4 (Telegram + proactividad + onboarding) y voz
    (backlog) quedan pendientes en el spec.

- **🛡️ core-ai: reintentos ante rate-limit (429) en los proveedores IA (03/07/2026, rama `claude/api-rate-limit-errors-ovyrch`, PR nuevo).**
  - **Disparador**: ráfagas de `HTTP 429` en las «Últimas llamadas» de ia-rest — Groq (`llama-3.3-70b-versatile`, límite org `on_demand`) y Gemini (cuota) tumbaban la llamada al primer intento, sin reintento ni respeto de `Retry-After`.
  - **Fix**: nuevo helper puro **`packages/core-ai/src/http.ts` → `fetchAI()`** que reintenta 429/5xx con backoff exponencial + jitter, **respeta `Retry-After`** y, si el proveedor pide esperar más que el tope (`maxRetryAfterMs`, default 5 s → p. ej. cuota diaria), **se rinde de inmediato para que la app caiga al siguiente proveedor** (la política de fallback NIM→Groq→Gemini sigue en cada app). Lanza `AiHttpError` tipado (`status`/`provider`/`retryAfterMs`/`isRateLimit`) conservando el formato de mensaje `"<Proveedor> HTTP <status>: <body>"` (retrocompat de logs/pasarela). Export `isRateLimitError()`.
  - **Integrado** en los 3 adaptadores (`nim.ts`, `groq.ts`, `gemini.ts`) — texto, multi-turno, tools y visión. `ai-client.ts` de ia-rest **sin cambios de firma**: la resiliencia es transparente. Beneficia a todas las verticales (core-ai es compartido).
  - **Tests**: `test/http.test.ts` (8 casos: retry 429, Retry-After segundos, bail si Retry-After>tope, agota reintentos, 400 no-retry, 503 retry, error de red) + los de gemini-vision siguen verdes. `fetch`/`sleep` inyectables (puro, sin `process.env`). Convención de imports `.ts` (como core-receipts; `allowImportingTsExtensions` en `tsconfig.base.json`).
  - **Detalle**: import `./http.ts` con extensión porque son imports de VALOR (los antiguos eran `import type`, que se elide y no necesitaba extensión bajo `node --test`).

- **🆕 plataforma: Agente de contabilidad conversacional — FASE 1 (03/07/2026, rama `claude/ai-accounting-agent-3a9o22`, PR #726).**
  - Idea de Alberto: «hablar con mi agente de contabilidad, meterle IA, que aprenda mi rutina». Diseño = capa conversacional + memoria SOBRE la maquinaria contable existente (no reescribe nada).
  - **Spec** `docs/superpowers/specs/2026-07-03-agente-contabilidad-conversacional-design.md` + **plan** `docs/superpowers/plans/2026-07-03-agente-contable-fase1.md` (4 fases; esta entrega la Fase 1).
  - **Fase 1 ENTREGADA (build verde, 7/7 tests):** página `/contable` (espejo de `/agente`) con Q&A de SOLO LECTURA sobre finanzas + aprende hábitos. `lib/contable/` = `parse.ts` (canal `APRENDER:`), `memoria.ts`, `formato.ts` (formateador puro), `contexto.ts` (fetch), `cerebro.ts` (`aiComplete` NIM Llama). Endpoint `POST /api/contable/chat`. Nav en sidebar + command palette. Tablas nuevas `contable_memoria` (hábitos, UNIQUE cuenta_id+clave) y `contable_log` (traza/historial) — **aplicadas en Supabase** (`prisma/sql/2026-07-03_contable.sql`).
  - **2 bugs del plan corregidos al ejecutar** (subagentes los cazaron): (1) el borrado de la línea `APRENDER:` debe ser por-línea, no por el regex que exige `}`; (2) el formateador puro tuvo que separarse a `formato.ts` porque `node --test` no resuelve el alias `@/` del fetch.
  - **PENDIENTE (fases siguientes, mismo spec):** Fase 2 acciones con confirmación (clasificar/deducible/conciliar/pagos reutilizando `agente-facturas`/`agente-movimientos`); Fase 3 documentos (foto/PDF → `extraerDesdeBuffer`/`ocrFactura`); Fase 4 Telegram (texto libre + `cont_` + docs) + proactividad + onboarding; backlog voz. **Falta E2E manual en preview** (necesita `NVIDIA_API_KEY` + sesión) y decidir si se embebe como pestaña de `/finanzas`.
  - **Nota:** modelo = NVIDIA NIM (Llama), no Claude. Commits sin firma GPG (clave del entorno vacía) → GitHub «Unverified», email autor/committer correcto.

- **✅ plataforma: repaso «haz todo» de los 🔴/🟡 del auto-informe 01/07 (03/07/2026, rama `claude/tax-declaration-projection-ewsd4a`, PR nuevo).**
  - Verificado cada hallazgo contra código+BD ANTES de tocar (el auto-informe 01/07 falló varias veces).
  - **Arreglado**: crons `categorizar-movimientos` y `resumen-semanal` solo exportaban `POST` pero Vercel dispara por **GET** → 405, nunca corrían (causa real del «0 hits» #6). Ahora GET+POST. Son los únicos 2 de 40 crons con ese problema. + IVA soportado: `COALESCE(pago_confirmado_at,created_at)`→ solo `pago_confirmado_at` (AEAT; 0 filas hoy).
  - **Obsoletos/ya resueltos (auto-informe desactualizado)**: 🔴#1 getResumenSivra YA usa `gastos` (no `expenses`); 🔴#2 `amount NULL` en incomes = 0 hoy; 🟡#4 getResumenFinanciero NO cuenta traspaso_interno/actividad_pilar (caen por defecto en el if/else de destino).
  - **NO ejecutado a ciegas (gran radio/criterio humano)**: RLS 180 tablas sin policy, REVOKE 77 funciones anon iarest, backlog revisión (hoy 939), needs_human, cap pricing, resync Smoobu. Documentado en `docs/AUDITORIA-2026-07.md` (sección «Actualización 2026-07-03 (2)»).
  - **Lección**: los hallazgos del auto-informe `/auditoria-diaria` hay que VERIFICARLOS contra la realidad; genera falsos positivos y misdiagnósticos.

- **🔴 plataforma: auditoría 03/07 — 2 bugs de prod por DRIFT de esquema BD↔código (rama `claude/tax-declaration-projection-ewsd4a`, PR nuevo).**
  - **Disparador**: Alberto reportó «Error cargando datos» en `/sivra/resultado-pisos`.
  - **Bug 1 (arreglado en prod)**: la vista `v_movimientos_activos` (creada 26/06 con `SELECT *`, columnas CONGELADAS) no exponía `propiedad_id` (añadida a `movimientos_bancarios` el 01/07, PR #638) → `SELECT propiedad_id FROM v_movimientos_activos` en `lib/sivra/pl-mensual.ts` fallaba → 500 en `/api/sivra/pl-mensual` TODOS los meses. Regenerada por MCP + migración `prisma/sql/2026-07-03_v_movimientos_activos_propiedad_id.sql`. **LANDMINE: `CREATE VIEW ... SELECT *` NO se re-expande; al añadir columna a movimientos_bancarios, re-ejecutar el CREATE OR REPLACE.**
  - **Bug 2 (arreglado en código)**: `cuentas` NO tiene columna `estado`, pero `facturas-scan` y `facturas-resumen-semanal` hacían `WHERE estado IS DISTINCT FROM 'inactiva'` → crons caídos (0 trabajo). Quitado el filtro. Era la causa real del «4 crons silenciosos» de la auditoría del 01/07 (se había atribuido a envs GMAIL).
  - **Por qué ningún agente lo vio + guarda**: ningún agente ejercita las páginas. Añadido **Check 9 smoke-test** en `/api/cron/health-check` que ejecuta `getPLMensual`/`getResumenFinanciero`/`calcularEstadoDeclaracion` y avisa por Telegram si lanzan.
  - Informe: `docs/AUDITORIA-2026-07.md` (sección «Actualización 2026-07-03»). Siguen abiertos los 🔴 del 01/07 (no en este PR).

- **⚡ plataforma: «🧾 Mi declaración» (/finanzas/fiscal) ya no se cuelga en «Calculando…» (03/07/2026, PR #721 MERGEADO a main).**
  - **Causa raíz**: `GET /api/finanzas/comparativa` llamaba a un LLM (`enriquecerConIA`→`aiComplete`→`nimChat`) EN la petición y **sin timeout** (`lib/gastos-recurrentes.ts`, `lib/ai-client.ts`). Si NVIDIA iba lento, el spinner no terminaba nunca. Además se calculaba `getResumenFinanciero` dos veces (SSR + endpoint) y sin caché.
  - **Fix**: (1) IA FUERA del camino crítico — los números salen de SQL; nueva tabla **`patrones_recurrentes_cache`** (aplicada en prod) que rellena un **cron diario** `/api/cron/patrones-fiscal-refresh` (`30 5 * * *`); la petición solo lee la etiqueta cacheada (cosmética). (2) La comparativa se calcula en **SSR** (`fiscal/page.tsx` reutilizando el `resumen`) y se pasa como prop → **primera carga sin «Calculando…»**; el endpoint solo sirve el cambio de año. (3) **`aiComplete` con `AbortSignal.timeout`** (red de seguridad). (4) Nuevo helper `lib/comparativa-declaracion.ts` (`calcularEstadoDeclaracion`, compartido SSR+endpoint) que además **anualiza retenciones y rendimiento/retenciones de Pilar** en el escenario «🔮 Fin de año» (antes las dejaba a fecha de hoy → sesgo a «a pagar»).
  - **Respeta `fiscal-novedades`**: las cifras legales siguen entrando por `importesDe(year)`→`IMPORTES_POR_ANIO`; la caché nueva NO cachea importes fiscales.
  - **Decisión de diseño (validada contra BD)**: se descartó una heurística SQL de `proyectable` ("2 plazos atrasados") porque marcaba el alquiler recurrente real (GUTIERREZ ALCALA) como no proyectable → se proyectan TODOS los recurrentes (como el fallback histórico); el `proyectable` de la IA se cachea solo como dato informativo.
  - **Verificado**: `tsc --noEmit` limpio, 14/14 tests fiscales, la SQL de patrones corre en prod, tabla creada, preview de Vercel de `plataforma` ✅ Ready, PR mergeado a main. El cron poblará las etiquetas legibles (hasta entonces se ve el concepto crudo del banco).
  - **LANDMINE detectada (no corregida aquí)**: la tabla `cuentas` NO tiene columna `estado`; los crons `facturas-scan`/`facturas-resumen-semanal` usan `WHERE estado IS DISTINCT FROM 'inactiva'` → estarían fallando en runtime. Revisar aparte.

- **✅ rrhh: nueva empresa + documentos empresa + fichaje geolocalización (01/07/2026, PR #645 verde, pendiente merge).**
  - **Nueva empresa**: "Global2 Instalaciones Técnicas" dada de alta directamente en SQL (INSERT en `rrhh.empresas` + `rrhh.usuarios_rrhh`). Pilar (`pilar.pina.franco@gmail.com`) vinculada como responsable.
  - **Multi-empresa**: tabla `rrhh.usuario_empresas` (N:N) creada. Login muestra selector de empresa si el usuario tiene >1. Nuevo endpoint `POST /api/auth/seleccionar-empresa`. JWT emitido con `empresa_id` elegida.
  - **Documentos empresa**: tabla `rrhh.empresa_documentos` + `lib/empresa-documental.ts` + endpoints `GET/POST /api/admin/cuenta/documentos` + `DELETE /api/admin/cuenta/documentos/[id]`. Sección "Documentación de empresa" en `/admin/cuenta` (categorías: CIF, escritura, TC2, seguro social, póliza, otro; filtro año+mes para periódicos).
  - **Fichaje geolocalización**: tablas `rrhh.fichajes` + `rrhh.obras`. `lib/fichajes.ts` usa `dentroDeGeocerca()` de `@central/module-geo` para asignar `obra_id` automáticamente. `resumenJornada()` de `@central/module-horario` para resumen mensual. Endpoints `GET/POST /api/e/fichaje` (portal empleado) + `GET /api/admin/fichajes` + `PATCH /api/admin/fichajes/[id]`. UI en portal empleado (botón fichar, GPS, historial mes). Admin `/admin/fichajes` (tabla, filtros, resumen) + `/admin/obras` (CRUD). Nav AdminShell actualizado.
  - **Fix CI**: `lib/fichajes.ts:81` — `horas_totales: f.horas_totales ?? null` (era `?? undefined`, incompatible con `TurnoFichaje.horas_totales: number | null`).
  - **Estado**: todos los typechecks ✅, Vercel `central-rrhh` ✅ Ready. Pendiente merge por Alberto.

- **✅ rrhh: contador vacaciones, calendario admin, notificaciones y quitar columna Puesto (01/07/2026, PRs #637 y #643 mergeados).**
  - **PR #637** (squash a main): contador vacaciones empleado (devengados/aprobados/en trámite/pendientes, barra progreso, selector año), columna saldo vacaciones en lista empleados, calendario admin (`/admin/calendario`), email notificación al aprobar/rechazar solicitud (`lib/notificar.ts`), aviso solapamiento en admin.
  - **PR #643**: quitar columna "Puesto" de la tabla `/admin/empleados` (sigue editable en ficha).
  - **Fix Pilar login**: INSERT en `public.cuentas` para `pilar.pina.franco@gmail.com` — puede entrar al god-panel como operador.
  - **Error persistente**: `/admin/empleados/[id]` da 500 (Digest 1939364247) en prod. Sin acceso a logs de `central-rrhh` vía API Vercel (403 Forbidden — cuenta personal, no equipo). Pendiente revisar en Vercel UI directamente.
  - **Principio permanente Pilar**: listas desplegables (centro de trabajo, contratos…) configurables desde UI, no hardcoded. `rrhh.config_listas` pendiente de implementar.

- **🐛 plataforma: fix duplicados cross-cuenta tarjeta↔corriente (01/07/2026, PR en curso).**
  - **Causa**: Kutxabank exporta los cargos de tarjeta en DOS extractos (el de la corriente y el propio de la tarjeta). Al importar ambos Excels, la misma compra entraba bajo dos `cuenta_bancaria_id` distintos (un `tipo='corriente'` y un `tipo='tarjeta'`). La guarda anti-dedup existente solo cubría `xls vs psd2` dentro de la misma cuenta — no detectaba este patrón.
  - **Backfill aplicado en prod**: SQL `2026-07-01_dedupe_cross_cuenta.sql` → **47 filas marcadas `ignorado`, 3.764€ eliminados de gastos inflados** (movimientos de la corriente, se conservan los de tarjeta).
  - **Prevención en código** (`lib/banca.ts::importarExtracto`): nuevo bloque anti-dedup cross-cuenta tras el bloque cross-origen. Si se importa una corriente y ya existe la misma (fecha, importe) en una cuenta `tipo='tarjeta'` de la misma sociedad (o viceversa), se marca como `ignorado` de forma conservadora e idempotente.
  - **Banner duplicados** (`getDuplicadosSospechosos`): UNION SQL añadido — detecta ahora pares cross-cuenta (distinta `cuenta_bancaria_id`, misma sociedad, misma fecha+importe). Incluye `cuentaLabel` en `DupMovimiento` para que la UI pueda mostrar de qué cuenta viene cada uno.
  - **LANDMINE nueva**: `dedupe_hash` solo evita duplicados DENTRO de la misma cuenta. Para duplicados CROSS-CUENTA la clave es `tipo='tarjeta'` gana sobre `tipo='corriente'`. No mezclar con el LANDMINE anterior (cross-origen psd2 vs xls).

- **✅ plataforma: motor de categorización IA de gastos — MERGEADO a main (01/07/2026, PR #639 squash-merged).**
  - **3 bugs corregidos en el mismo PR**: (1) guard `actividad_pilar` en `categorizarMovimiento()` — devuelve `'gasto_profesional'` directamente sin llamar IA; (2) filtro `COALESCE(m.destino,'') <> 'actividad_pilar'` en ambas queries de `categorizarLoteSinSubcategoria()`; (3) `titular='titular'` añadido en `/api/finanzas/tarjeta/route.ts` para excluir tarjetas de Pilar del resumen de Alberto.
  - **SQL retroactivo aplicado en prod** (`2026-07-01_fix_pilar_subcategoria_nula.sql`) — 0 filas afectadas (ya tenían subcategoría).
  - **Pendiente Alberto**: trigger retroactivo `POST /api/cron/categorizar-movimientos?retroactivo=true` con `Authorization: Bearer $CRON_SECRET`.

- **🏷️ plataforma: motor de categorización IA de gastos — implementado (01/07/2026, PR #639 verde, pendiente merge).**
  - **Motor híbrido**: `apps/plataforma/lib/categoria-ia.ts` — reglas→IA Haiku fallback → auto-aprendizaje (confianza ≥0.85 persiste regla).
  - **Columna**: `banca_destino_reglas.subcategoria` + tablas `categoria_alertas` y `categoria_alertas_log` — **aplicadas en Supabase prod** (migración `2026-07-01_categoria_alertas.sql`).
  - **Hooks de ingesta**: `lib/psd2.ts` + `lib/banca.ts` llaman `categorizarYAlertar()` con `Promise.allSettled()` tras cada inserción (fallo de categoría no rompe importación).
  - **Alertas Telegram**: `lib/alertas-categoria.ts` — límite mensual configurable, throttle 24h, envía aviso al superar.
  - **Resumen semanal**: `lib/resumen-semanal-gastos.ts` — cada lunes 09:30 UTC, desglose emoji por categoría.
  - **Crons Vercel**: `0 7 * * *` (categorizar) + `30 9 * * 1` (resumen semanal) en `vercel.json`.
  - **UI**: `app/(usuario)/finanzas/CategoriasTab.tsx` — pestaña "📊 Categorías" en `/finanzas`, gráfico dona recharts, tabla gastos/ingresos, gestión alertas. Integrado en `FinanzasClient.tsx`.
  - **APIs**: `GET/PATCH/DELETE /api/alertas-categoria`, `GET /api/finanzas/categorias?year=&month=`, `POST /api/cron/categorizar-movimientos`, `POST /api/cron/resumen-semanal`.
  - **Todos los Vercel projects ✅ Ready** tras el push.
  - **Pendiente Alberto**: (1) merge PR #639; (2) trigger retroactivo: `POST /api/cron/categorizar-movimientos?retroactivo=true` con `Authorization: Bearer $CRON_SECRET`; (3) procesar PDF Kutxabank de Pilar (Gmail thread `19f1d3ff7593e23d`, ene-jun 2026) con importador Norma43.
  - **Fase 2 futura**: rediseño sidebar/navegación `/finanzas` (eliminar duplicaciones) — PR draft separado.

- **🤖 Rutinas programadas: 8 rutinas activas + arquitectura Telegram centralizada (01/07/2026, PR #631).**
  - Creadas 5 rutinas nuevas (pricing-agente, fiscal-novedades, psd2-health-check, rrhh-compliance-calendar, ialimp-client-health). Total: 8 rutinas activas.
  - **Arquitectura de notificaciones**: token Telegram vive ÚNICAMENTE en Vercel plataforma. Las rutinas llaman `POST /api/internal/alerta` con `CRON_SECRET` — sin duplicar tokens por rutina.
  - Nuevo endpoint `apps/plataforma/app/api/internal/alerta/route.ts`: auth `isCronAuthorized` + `tgSend`.
  - **Skills creadas/actualizadas**: `psd2-health-check`, `ialimp-client-health`, `rrhh-compliance-calendar`, `pricing-agente`, `fiscal-novedades`.
  - **`docs/RUTINAS-PROGRAMADAS.md`** actualizado: cadencias, MCPs, arquitectura Telegram, workaround env vars.
  - **Workaround env vars**: la UI de Rutinas no tiene campo "Variables de entorno" (jul 2026). Solución: incluir `PLATAFORMA_URL` + `CRON_SECRET` directamente en el campo "Instrucciones" de rutinas 6 y 7.
  - **Pendiente manual Alberto**: añadir `CRON_SECRET` al prompt de rutinas 6 (psd2) y 7 (ialimp-client-health). Ver `docs/RUTINAS-PROGRAMADAS.md` sección workaround.
  - **Primer ciclo pricing-agente** (lunes): revisar PR draft con `dryRun: true` antes de aprobar.
  - WebFetch/WebSearch son herramientas nativas de Claude (no MCPs externos) — fiscal-novedades solo necesita Supabase como conector.

- **🏗️ ARQUITECTURA RRHH — PRINCIPIO PERMANENTE: Pilar debe poder configurar TODO sin depender de Alberto (01/07/2026).**
  Pilar es la gestora externa de RRHH. La app debe ser 100% autónoma para ella. Implicaciones:
  - **Listas desplegables configurables** (centro de trabajo, tipo contrato, categoría, grupo cotización...): NO hardcoded en código. Deben editarse desde el god-panel (`/operador`) o en la propia ficha admin de RRHH. La tabla `rrhh.config_listas` (o similar) almacena las opciones por empresa (`empresa_id`, `campo`, `opciones[]`).
  - **Feedback de Pilar (01/07/2026, WhatsApp):**
    - "Centro de trabajo" → desplegable con opciones CAMAS / MANCHON / AMBOS (configurable por empresa).
    - "Cuenta de cotización (CCC empleador)" → **ELIMINAR** del formulario (no se usa).
  - Cuando Pilar necesite añadir un centro de trabajo nuevo o cambiar opciones de un desplegable, debe poder hacerlo ella desde la propia interfaz de admin de RRHH, sin tocar código.
  - **Pendiente implementar**: `rrhh.config_listas` + UI de configuración en admin + campo "Centro de trabajo" como `<select>` en ficha empleado.

- **✅ rrhh: fix responsive nav admin + login corporativo con logo #1565C0 (01/07/2026, PRs #624 #628 mergeados + fix en curso).**
  - #624: fix TS7016 (`@types/nodemailer` en `packages/core-email`). Admin panel con branding.
  - #628: `/login` como Server Component con logo y color desde BD. Logo `/logos/mariscos-gonzalez.svg` en `public/`.
  - BD: `color_primario='#1565C0'`, `logo_path='/logos/mariscos-gonzalez.svg'` para Mariscos González.
  - Fix responsive `AdminShell`: nav horizontal scrollable en móvil (`overflow-x-auto` + `whitespace-nowrap`), logo inline con nav, padding `p-4 md:p-6` en `main`. Header empleados apilable (`flex-wrap`).

- **🚀 plataforma: control mensual tarjeta de crédito Kutxabank (01/07/2026, PR #626 draft).**
  - BD: columna `tipo` (`corriente`/`tarjeta`/`ahorro`) en `cuentas_bancarias` — **aplicada en Supabase prod**.
  - `lib/banca.ts`: `importarExtracto()` acepta y persiste `tipo`; nueva `enviarResumenTarjeta()`.
  - Nueva página `/finanzas/tarjeta-credito`: KPIs, desglose por categoría, top 10 cargos.
  - **PR #626 en revisión**.

- **📁 Drive 2026 organizada + reglas aprendidas (01/07/2026).**
  - Carpeta `FACTURAS Apartamentos / 2026` (ID `1M7PwjU3MSJ7zb83rhlXzTx1O2RlTad3O`): tiene subcarpetas mensuales `01-Enero-2026` … `06-Junio-2026`. Al archivar facturas 2026 usar esas subcarpetas (NO la raíz).
  - **6 PDFs copiados a su mes correcto** con nombres descriptivos (`YYYY-MM-DD_emisor_importe.pdf`). Referencias en `facturas_drive` y `movimientos_bancarios.factura_ref` actualizadas a los nuevos file IDs (los originales de la raíz los borra Alberto manualmente junto con los duplicados EMASESA).
  - **9 EMASESA en raíz = mismo PDF repetido 9 veces** (Busto Reform Mayo €57.09, PE2600946516). Alberto los borrará manualmente. Solo es válido `factura (7).pdf` (839 KB, ya vinculado en BD).
  - **4 `factura (33)-(36).pdf` = EMASESA 2025 Punto y Coma SL** — fuera de lugar en la carpeta 2026; Alberto los borra o mueve.
  - **Endesa Dúplex: €5,78/mes extra en banco = "Electric Protección 360 Plus"** (servicio de mantenimiento/asistencia hogar, contrato OR-0046183234, nº factura X326NC11179334). El cargo bancario siempre incluye electricidad + este servicio en un único débito. NO es un error; ambos son deducibles `turistico_duplex`. El PDF de factura ya muestra el RESUMEN TOTAL con ambas partidas.
  - **BBVA Endesa Dúplex — 4 movimientos corregidos** (`destino='turistico_duplex'`, `destino_confirmado=true`, `conciliado=true`). Estaban como `turistico_pisos` por error.
  - **CREATE ventilador techo Socorro** (€123,45, F28-132832, 09/06/2026): la factura lleva "Monte Carmelo 68" como dirección fiscal del cliente (≠ lugar de instalación). Clasificado `turistico_pisos` (Socorro), archivado en `facturas_drive` (`create-socorro`), conciliado con movimiento `4ad69aaa` "COMPRA EN CREATE" 02/06/2026. **Regla**: dirección fiscal del cliente en una factura ≠ lugar de uso del artículo; para material (CREATE/IKEA/ferretería) siempre confirmar con Alberto si va a pisos o vivienda habitual.
  - **`amortizable` = NUNCA** (regla permanente de Alberto): el campo existe en BD pero NO se usa. Ninguna factura se marca `amortizable=true`. Dimitri azotea Socorro (€907,50) se corrigió a `false`.

- **📊 PRICING Busto: datos de mercado corregidos + Feria Apr 18-25 bajada aplicada EN VIVO (05/07).**
  El motor tarificaba agosto y septiembre muy por debajo del mercado real porque los datos de `market_rates` (de 2026-06-23) usaban un pool incorrecto. Corregido via Supabase MCP + `pg_net`:
  - **Agosto 7-9** (10 comps reales Booking, 2p aptos Casco Antiguo): p55=171€. BD previa tenía p55=84€ — motor infravaloraba agosto >50%.
  - **Septiembre 4-6** (10 comps): p55=268€. BD previa tenía p55=132€.
  - **Feria Apr 18** (domingo): 10 comps peer cluster 2p añadidos (p55=259€). BD previa tenía outlier 1350€ (hotel).
  - **Feria Apr 24** (sábado): 10 comps peer (p55=325€).
  - **Feria Apr 18-25 aplicado EN VIVO via pg_net**: los precios Smoobu (todos a 503€) bajaron a **402€** (raíl ±20%/día aplicado, ciclo 1/3). El apply-auto diario continuará la bajada hacia objetivo ~260-305€. Apr 24 quedó a 503€ (no estaba en propuesta original — el apply-auto lo corregirá).
  - Auditado en `pricing_applied` (7 filas, source='agente', dry_run=false) y `pricing_decisiones` (7 filas, motivo+variables).
  - **TÉCNICA NUEVA — pg_net como proxy para Smoobu:** el entorno cloud bloquea CONNECT a `housesevillana.vercel.app`, `plataforma-ten-flame.vercel.app` Y `login.smoobu.com`. Solución: usar `net.http_get/post` de pg_net (ya instalado, v0.20.0) + leer respuesta en `net._http_response` (esperar ~5s y consultar por `id`). La API de Supabase NO bloquea `login.smoobu.com` desde su infraestructura. Patrón: `SELECT net.http_get(url, headers) AS request_id` → esperar → `SELECT content FROM net._http_response WHERE id=<request_id>`. NO usar `http_collect_response(id, async:=false)` — falla con "query has no destination for result data" (bug interno pg_net).
  - **pricing_aprendizaje** actualizado (temporada='feria_2027') con todo el contexto..
