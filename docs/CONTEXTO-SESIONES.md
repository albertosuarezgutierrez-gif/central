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

### ✅ (09/08/2026) Pasada diaria de trading completada — 2 PRs mergeados en caliente para arreglar `date - bigint`
- Rutina `trading-analista`: NAV IBKR (33.328,17€) empujado a `/banca` OK; watchlist + histórico de 16
  símbolos bajado sin incidencias. `POST /api/trading/analizar` devolvía **500 en cada intento** (payload
  completo y mínimo de prueba) → causa raíz: `lib/trading/precios-guardia`, query hace
  `fecha - DIAS_REFERENCIA_MAX` sin castear la constante, Prisma la manda `bigint`, Postgres no define
  `date - bigint`. Rota desde que se desplegó esa guardia (post-incidente CVX 03/08) — toda pasada de
  análisis desde entonces había fallado en silencio.
- Fix de una línea (`::int`), verificado byte a byte contra Supabase. **PR #1340 mergeado a petición de
  Alberto** ("mergea"); tras el redeploy se encontró el MISMO bug sin corregir en `/puntuar` (copia literal
  de la query, no cubierta por #1340) → **PR #1341**, mismo fix, mergeado también.
- Pasada completada tras los dos redeploys: 14/16 símbolos analizados (SNDK/WDC vetados por la guardia de
  suplantación), 2 compras paper nuevas (NVO 90u@47,26€, PLTR 17u@172,01€), 24 tesis puntuadas walk-forward,
  0 stops. Resumen enviado por Telegram.
- **Fase 2 (dinero real):** Alberto preguntó por adelantar el plazo — recordado que ya existe
  `docs/TRADING-HIPOTESIS-PREREGISTRO.md` § «Plan de despliegue de capital REAL» (firmada 05/08): la
  escalera la suben las SEÑALES, no el calendario (`lib/trading/puerta-fase2.ts`). Estado real hoy:
  cohortes paper en 14-16 de los 120 días que exige el Tramo 2 (~12%). Verificado que el cron semanal
  `paper-tracker` (lunes 10:00 UTC) NO está roto — el dato del 03/08 es el último lunes, no un fallo.
- **Watchlist ampliada** (`trading_watchlist`, capa C): +**ORCL** (a petición expresa, con caveat: la
  tesis de rebote en EMA100 mensual que la motivaba ya fue REFUTADA por H8 y tuvo un incidente de datos
  serio el 31/07); +**BKNG**/+**APP** (únicos `guru:true` del top-20 del radar factorial 03/08 no
  presentes en la watchlist); +**SQM**/+**CHT** (mejor calidad restante del top-20, sector diverso —
  litio/materiales y telecom, sin solapar con lo ya cableado). `trading_cantera` (pipeline de
  descubrimiento IBKR-temas+FMP) sigue vacía — no se ha ejecutado ese flujo, es un mecanismo distinto
  del radar factorial usado aquí.
- **Decisión explícita: NO maximizar la watchlist.** Alberto preguntó por meter "el máximo posible" de
  símbolos; se explicó y se decidió NO hacerlo — más símbolos no acelera Fase 2 (gate por antigüedad de
  cohorte, tabla `trading_paper_track`, no por nº de tickers de la watchlist diaria), y sí infla el
  fetch secuencial de IBKR (techo 300s en `/analizar`) y arriesga meter ruido/correlación en las
  estadísticas de `trading_estrategia_stats`. Watchlist final: **21 símbolos** (3 índices, 10 capa B,
  8 capa C). Alberto delegó la decisión final ("lo dejo en tu decisión").

### 🧹 (09/08/2026) «Estado actual» podado: el vivo baja de 121 KB a ~15 KB por sesión
- La sección acumulaba 42 bloques (1.212 de 1.329 líneas, ~30k tokens de peaje en CADA
  sesión) porque la rotación mensual no la tocaba. Contenido ÍNTEGRO movido a
  `docs/memoria/2026-08.md`; queda solo el bloque «Estado vivo» (pendientes/decisiones).
- Reglas nuevas en la cabecera: qué admite «Estado vivo» y formato de cabecera de entrada
  (las entradas `## ` del 08-09/08 se convirtieron a `### ` — `rotar-memoria.mjs` no
  reconoce `## ` como entrada y las habría archivado fundidas con la anterior).
- Verificado: tests de `rotar-memoria` + `--dry-run` sobre el archivo nuevo. El dry-run cazó
  además un título con «16-18/10» al final que la rotación habría archivado en 2025-10 (la
  fecha de la cabecera es la ÚLTIMA que aparece) — reescrito «16-18 de octubre».

### 🔧 (09/08/2026) Reparadas las 3 causas de la venta bajo mercado del finde (motor pricing)
- **El `channel_markup` 1,16 NO existe en el escaparate** (20 reservas: bruto/listado 0,66-1,08,
  mediana 0,92; la del 06/11 a factor 1,004 exacto). La «confirmación» del 01/08 usó el importe
  corrupto pre-fix de la doble comisión. Guardas `>= 1` (con `> 1`, un 1.0 se ignoraba) en
  apply/settings/pricing-engine + `prisma/sql/2026-08-09_channel_markup_sin_recargo.sql` →
  **aplicar SOLO tras desplegar el código**.
- **Ancla suave por fecha** (`pricing-ancla-fecha.ts`): finde con mediana fiable (≥5 comps) ya no se
  tarifica al bucket del mes. **Demanda gateada por antelación** (`pricing-demanda.ts`): sin descuento
  por ocupación en fechas fuera de la ventana de venta. Detalle: adenda 09/08 en
  `docs/AUDITORIA-2026-08-precios-dinamicos.md`. tsc 0 · 1.067 tests · build OK.

### 🔎 (09/08/2026) Auditoría subastas 100% + captura de resultados por fin validada con la 1ª real
- Auditoría completa del módulo: 6 crons 200 hoy · corpus 41 vigentes sano (0 sin valor/docs/semáforo,
  18/18 con puja_minima) · barrido umbrales/coste/ITP sobre las 41 filas → 0 excepciones · 447+1054 tests.
- Hallazgo 🔴 (arreglado, PR): `capturarResultados` NUNCA capturó nada — la ficha concluida real
  (SUB-JA-2026-264154, El Puerto) publica el estado como BANNER, no como par, y el desenlace vive en el
  **certificado de cierre** (PDF público). Nuevos `resultadoDeBanner`/`parsearCertificadoCierre` (fixtures
  reales) + fetch del certificado en el cron; `con_pujas` calibra como adjudicada. E2E: las 2 concluidas
  reales resuelven con su puja máxima oficial (170.627,72€ / 161.712,72€).
- 🟡 sin tocar: dispatcher marca timeout en subastas-mercado si desborda 280s (2 veces/7d, el job acaba).

### ⚖️ (09/08/2026) Seguimiento subastas: backfill puja_minima + fix starvation de la cola
- Check-in post PRs #1324/#1327: parser OK (las 2 fichas releídas hoy → `puja_minima=0`), pero la cola
  del cron `subastas-enriquecer` (LIMIT 12/día) la monopolizaban re-pasadas NO-OP de la Junta (23 filas
  ya geocodificadas que solo refrescaban `enriquecida_at`) → las fichas del BOE se releían cada 3-4 días.
- Backfill manual con el parser real del módulo: 16 fichas vivas → `puja_minima=0` (18/18 al día).
- Fix (PR draft): la cola solo coge fuentes sin ficha si les queda trabajo real; `max` default 12→24;
  `REFRESCO_HORAS` 24→23 (el umbral exacto de 24 h hacía saltar un día sí/uno no por segundos).
- Verificado: cierre 09:00 → 200; sin errores runtime nuevos; Cancienes al ITP 8% asturiano = 95.112€.

### 💶 (09/08/2026) Verificación reserva Luxury 16-18 de octubre: 3ª venta bajo el p50 de fecha exacta
- Reserva Booking (Genius, 5p): 341,74€/2 noches = 170,87€/noche efectivo; lista 194€ (el motor
  bajó 208→194 el 08/08 14:30, reserva entró el 09/08 08:36). p50 real de esas fechas (comps 5p,
  barrido 09/08): 275€ (vie) / 258,50€ (sáb) → −27% en lista, −36% efectivo, bajo el p25.
- Causa: hueco conocido finde-sin-evento — ratio fecha/mes 1,1 < umbral 1,5 del premio de mercado
  → tarifica por bucket octubre (p50 250€) + descuento de demanda (ocupación ~12%). Mismo patrón
  que 06/11 (−43%) y 18/09 (−40%). Margen sano (coste 29,70€/noche); no ruinosa, sí barata.
- Sin cambios de código; el guardián debería avisar `reserva_bajo_mercado` en su cron. Pendiente
  (ya apuntado en skill): bajada last-minute real + revisar si el premio 1,5× deja escapar findes.
- Vía B sana (`dias_caido=1`), sin backlog en `PDF-pendiente`/`Revisar`/`Extraccion-fallida`, 0
  candidatos nuevos en Gmail ni subidas manuales.
- Cerrado 1 pendiente de días atrás: recibo Anthropic/Claude Max (180€, 05/08) archivado en Drive
  y conciliado contra el cargo bancario del 07/08.
- Sigue pendiente: Roborock Amazon -247,92€ aún sin aparecer en `movimientos_bancarios`. Detalle
  completo en `docs/AGENTES-BITACORA.md`.

### 🏛️ (08/08/2026) Subastas 3ª tanda: coste autoexplicativo, ITP valenciano al 9% y presupuesto del vigía — PR #1327
- «Coste real estimado: 806.015,16€» se leía como valoración de mercado (pregunta de Alberto sobre
  SUB-JA-2026-264062): es el coste puerta abierta simulando el remate al 100% de la salida — el
  titular y el aviso de Telegram lo dicen ahora explícitamente («…si rematas a la salida»).
- ITP Comunidad Valenciana corregido: 10%→**9%** (Ley 5/2025), tabla de tipos por CCAA re-verificada
  contra fuentes vigentes. `subastas-cierre` gana presupuesto de tiempo (mismo patrón que #1281/#1296).
- Rediseño de la ficha de subasta con la información de las tandas anteriores (ITP, umbrales, simulador).

### 📬 (08/08/2026) Subastas: cursor incremental por UID — la ingesta dejaba de releer 300 correos/día — PR #1296
- El cron diario pedía «últimos 30 días, hasta 150 correos/portal» siempre — como el corpus de
  Idealista/Fotocasa es acumulativo, relía ~300 correos para encontrar los pocos nuevos y se comía el
  presupuesto de tiempo (latido 07/08: «cortado tras 0 fichas»). Ahora cada portal guarda hasta qué UID
  leyó (`subastas_correo_cursor`, tabla propia — NO `correo_cursor`, que es el latido del triaje de correo).
- `lib/subastas/correo-incremental.ts` (puro, testeado): filtro `>lastUid` en cliente (RFC 3501),
  `uidvalidity` distinto → vuelve a ventana por fecha, cursor solo se confirma tras ingerir (at-least-once).
  BOE (`leerAlertas`) queda intacto, sin cursor. 826 tests, tsc 0, build OK.

### 🧮 (08/08/2026) Subastas 2ª tanda: ITP por CCAA, puja en vivo, vivienda habitual y simulador
- **ITP por CCAA** (`module-subastas/src/impuestos.ts`): `calcularCoste` deja de aplicar el 7% andaluz a
  todo — la provincia elige el tipo general de su CCAA (Asturias 8%: Cancienes pasa de 94.248€ a 95.112€),
  con aviso del tipo aplicado y de las escalas progresivas. `params.tipoItp` explícito sigue mandando.
- **Vigía de pujas en vivo** en `subastas-cierre`: `mejorPujaViva()` (1 llamada/ficha, seguidas a ≤3 días)
  → `subastas.mejor_puja(_at)` (migración `2026-08-08_subastas_mejor_puja.sql`, aplicada) + Telegram 🔥 una
  sola vez si superan tu techo (`sobrepuja_avisada_at`). NULL nunca pisa un valor visto.
- **Vivienda habitual** (ya se extraía del edicto): `viviendaHabitualDeNotas` (round-trip testeado) afina la
  nota del art. 671 en umbrales/ficha. **Simulador «¿y si pujo X?»** en la ficha (módulo puro + financiación
  de criterios; banda de aprobación, admisibilidad, tramos). Tests 443 módulo + 1045 app, tsc 0, build OK.

### ⚖️ (08/08/2026) Subastas: deuda, puja mínima y umbrales LEC 670 en la ficha
- Pregunta de Alberto («¿se puja por la deuda? ¿el 70%?»): la «salida» YA es el valor de puja (tipo del
  BOE, no mercado); el 70% legal es del VALOR DE SUBASTA, no de la deuda (LEC 670). SUB-JA-* = judicial.
- 3 huecos arreglados: `cantidad_reclamada` era campo muerto (ahora en ficha), `puja_minima` sin consumidor
  (la puja máxima marca inadmisible/sin aprobación automática), y «Sin puja mínima» → centinela `0`
  (≠ NULL no publicada; COALESCE-safe, backfill solo vía relectura 24h del cron).
- Nuevo `module-subastas/src/umbrales.ts` (`umbralesPuja`/`estadoPujaMinima`) + `escenariosCoste` (70% del
  tipo + mediana provincial real). Score/coste siguen conservadores al 100% (decisión de Alberto).
- Telegram avisos con línea de umbrales+deuda. Migración documental `2026-08-08_puja_minima_centinela.sql`.

### 🧱 (08/08/2026) Bandeja «cargos duplicados» de /banca responsive en móvil — PR #1319
- Captura de Alberto: en móvil las filas desbordaban (chips `flexShrink:0` + importe fuera de pantalla).
- Fix CSS-only en `BancaClient.tsx::DuplicadosBandeja`: media query ≤768px, concepto a ancho completo,
  fecha+chips+importe con wrap, botonera con wrap y botones ≥44px (`#duplicados`). Igual en «Ya resueltos».
- Mismo patrón que la bandeja «Gastos por revisar» del mismo archivo.
- Verificado 320/360px con Playwright (0px overflow). OJO: `next build` en el contenedor falla en
  page data de `/api/admin/clientes/[vertical]/[id]` YA en main (envs ausentes), no es del cambio.


- **📌 Estado vivo — pendientes y decisiones abiertas (actualizado 09/08/2026).** Detalle en
  `docs/memoria/2026-08.md` y en los PRs citados.
  - **Pricing SIVRA (motor vivo en los 4 pisos):** aplicar `prisma/sql/2026-08-09_channel_markup_sin_recargo.sql`
    SOLO tras desplegar el código del 09/08. Decisión de Alberto pendiente: el bucket mensual mezcla
    Serper+Booking sin filtrar `fuente` (propuesta: preferencia condicional + `bucket_fuente`,
    informe `docs/AUDITORIA-2026-08-precios-dinamicos.md`). Hueco finde-sin-evento parcheado con
    ancla por fecha (09/08) tras 3 ventas bajo p50; pendiente bajada last-minute real. El motor usa
    UNA ocupación por piso para 365 días (`occ` en `apply/route.ts`): palanca de demanda ciega a la
    estacionalidad. feb→jul-2027 sin bucket (fallback de diseño; la rutina Booking rellena).
    A vigilar: 23-oct y 27-nov muy por encima de su mes sin evento catalogado.
  - **Mercado SIVRA:** `sivra_mercado_sweep` con latido rojo A PROPÓSITO hasta que la Rutina Booking
    consolide (Serper no distingue fecha). Incidente sin diagnosticar: 2º disparo de `mercado-booking`
    el mismo día sin huella del 1º (08/08, `docs/AGENTES-BITACORA.md`). Tope real ≈10-12 ventanas por
    pasada (las respuestas del conector no caben en contexto).
  - **Trading (solo paper):** H8 rechazada y retrovisor de 15 años cerrado; decisión de Alberto
    pendiente sobre H9 (stop −10%/trailing −15% recortan el peor decil a costa de media). PR pendiente:
    umbral 10% de la guardia de suplantación. Pendiente: foto completa a Alberto con propuesta de
    tramo 1 de la escalera (1.000€→techo 6.000€, firmada) y decisión sobre auto-recuperación de
    `/puntuar`. FMP sin créditos y redundante (Yahoo cubre); NO recargar. Solo el DCF sigue sin fuente.
  - **Subastas:** corpus 41 vigentes sano, 0 con margen ≥25% (resultado honesto). 🟡 el dispatcher
    marca timeout en `subastas-mercado` si desborda 280 s (2×/7d, el job acaba).
  - **Facturas/banca sin conciliar:** Roborock −247,92€ (House) sin aparecer en banco; transferencia
    Jaime Salas 278,30€ (Socorro 24); PriceLabs 49,97 USD sin factura real; Booking Dúplex 587,23€
    vence 16/08; Socorro 24 julio sin factura de comisión. Casos abiertos sin respuesta: Bernardi
    −466,70€ (House) y Valantin −84,61€ (Busto). El cron `facturas-scan` archiva TODO en
    `ALBERTO 2026 PERSONAL (SEGUROS)/<mes>` — revisar su resolución de carpeta algún día.
  - **Infra/entorno:** el proxy de egress del contenedor da 403 al CONNECT contra `*.vercel.app` y
    `script.google.com` → el raíl HTTP de plataforma no sirve desde sesiones (usar SQL o `pg_net`
    desde Supabase) hasta abrir la allowlist de red del environment. NIM tier gratis degradado
    (p50 ~25 s); pendiente suplente de `meta/llama-3.3-70b-instruct` (`buscador-ia`). Gemini apagado
    por defecto (gates `GEMINI_TEXTO`/`GEMINI_WEBSEARCH`). Pendiente en Vercel (fuera del repo):
    `SEO_AGENT_ENABLED=true` + bajar `SEO_MIN_IMPR` a 3-5 (ia-rest); PAT de Alberto sin
    `contents:write` sobre `house-sevillana-landing`; confirmar `CONTABLE_MODEL` con `NVIDIA_API_KEY`.
    Trial Tuya IoT Core caduca ~04/02/2027 (recordatorio one-shot creado para el 04/01/2027).
  - **Deuda de doc:** los datos vivos del CRM de ia-rest están en la BD COMPARTIDA (schema `iarest`);
    su AGENTS.md aún dice silo.
