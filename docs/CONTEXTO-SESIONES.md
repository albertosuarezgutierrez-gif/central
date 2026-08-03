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

### ⚕️ Health-check 03/08: los 3 rojos de IA eran ruido, no averías (03/08/2026)
Gemini (Check 12) = residuo pre-gate: última llamada real 01/08 04:00; la guarda de 3 días lo apaga
sola el 04/08. NIM y Groq = **falsos positivos de la primera pasada de la sonda (Check 13)**: Groq
devolvió 200 en 222 ms con `content` vacío (gpt-oss-120b es razonador y `maxTokens:5` se iba en
razonamiento); NIM abortó a los 12 s cuando producción espera 30 y su media real es ~26 s (167 éxitos
/30d, último 02/08). Fix en `lib/monitoring/sonda-ia.ts`: `maxTokens` 5→300 y timeout 12→30 s.
Observado de paso: `registral` usa `google/gemini-2.5-flash` vía NIM con 404 intermitente (~50% hoy)
— vigilar si persiste. PR #1232 (mergeado).

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
