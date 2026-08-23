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

### 🔎 (23/08/2026) Auditoría profunda semanal: 3 crons mudos reales + reconciliación de docs stale
Pasada `--profunda` (22 commits desde el 21/08). **Técnico:** typecheck 9 apps + tests (0 fallos) +
seguridad multi-tenant + advisors Supabase todo limpio; hallazgos menores: `pdfjs-dist` desactualizado
en `apps/ialimp` (CVE, procesa PDFs de nómina — priorizar bump a ≥6.2.108) y `ia-rest`/`transporte`/
`central-rrhh` con 20/20 últimos deploys Vercel CANCELED (probable cadencia de pushes, verificar que
producción sirve `main`). **Heartbeat 🔴:** `psd2-sync` 68h mudo (umbral 54h) y la rutina de sesión
`sivra_mercado_booking` sin correr desde el viernes (46,5h) — arrastra a `sivra_canal` (4 pisos sin
ajustar) y `sivra_mercado_sweep` (70 fallos Serper 400). Causa probable común: el trigger de Rutinas
no disparó en fin de semana — a revisar por Alberto. **PRs:** #1594 en conflicto de inserción pura
(fácil), #1514 limpio esperando revisión (3 días). **Carril 1 aplicado:** `docs/VIGIA-CONECTORES.md`
y `docs/HUECOS-ABIERTOS.md` (H2 screener ya cerrado, Alberto recargó saldo el 21/08) al día; fila de
Patrimonio añadida a `plataforma-maestro`. Informe completo en `docs/AUDITORIA-2026-08.md` y PR draft.
**REPARADO en la misma sesión («repara»):** sweep = crédito Serper AGOTADO (degradó a mitad de pasada
con la key viva; recargar en serper.dev, único arreglo) + los `throw` de Serper ya incluyen el body;
psd2 = falsa alarma (cron 200 hoy 06:00, banco sin operaciones; ⚠️ consent BBVA caduca el 11/09);
mercado-booking se recuperó sola (238 comps hoy); PR #1594 desatascado (merge `7563289f`, 7/7 tests);
`pdfjs-dist` parcheado a 6.2.108 (GHSA-hq66-cqwq-w95j; tests 22/22, audit limpio); Vercel CANCELED =
`ignoreCommand` por diseño — `iarest.es` y `central-rrhh` sirven el build del swap NIM, verificado.

### 📈 (22/08/2026) Alpha Vantage: el barrido de splits dice que el FIFO está limpio (por poco)
Conector nuevo → cubre lo que IBKR no da (su `get_price_snapshot` tiene el enum CERRADO). Dos módulos
puros nuevos en `@central/module-trading` (173 tests verdes): **`splits.ts`** (reexpresa lo anterior a
un desdoblamiento en títulos de hoy; `null` = «sin consultar» ≠ «sin splits») y **`divisa.ts`**
(cambio del DÍA de cada operación por `FX_DAILY`; **nunca mira hacia delante**, y devuelve `null`
antes que inventar un cambio). **Barrido de los 18 símbolos con recorrido >30 días:** un único split
dentro de la ventana del libro, **NFLX 10:1 del 17/11/2025**, y la posición estaba **plana al
cruzarlo** (03/11 → 17/12) ⇒ el FIFO no está roto. Caduca: rebarrer al abrir símbolo nuevo.
✅ **Backfill de `tipo_cambio` hecho: 568/568, 0 pendientes** (las 110 fechas del libro son todas
sesión, ningún retroceso). Con eso el libro ya habla en euros: realizado **−1.620,94€** (2025) y
**−16.053,40€** (2026) = **−17.674,34€**; comisiones 451,01€. `tc_fuente`/`tc_fecha` guardan que es
CIERRE diario, no el cambio intradía de cada orden — aproximación declarada, no exacta.
**Mergeado en PR #1579** (173 tests del módulo + 35 del guardián en verde, 17 checks). De paso, respuesta a
«¿nos sirve OpenBB?»: **no** — AGPLv3 (copiarlo obligaría a publicar nuestro SaaS), Python y sin dataset propio;
sí queda `dgunning/edgartools` (MIT) como REFERENCIA de normalización XBRL, ambos anotados en `docs/VIGIA-OSS.md`
para que el vigía mensual los siga. **Pendiente de Alberto:** enmendar (o no) la escalera de tramos —la cuenta
está al 98,6% en VWCE y el poder de compra no cubre el Tramo 1— y el coste de adquisición de BRZE/NKE, que hay
que sacar de los extractos porque IBKR ya no sirve esas compras.
### 🧠 (22/08/2026) Health-check: sonda IA muerta (`z-ai/glm-5.2` 410) → swap a `meta/llama-3.1-70b-instruct`
### 💼 (22/08/2026) Nace el coordinador patrimonial: base de activos + /patrimonio + 2 agentes (PR #1591)
Alberto pidió un «CFO personal» que exprima el rendimiento de lo que ya tiene (objetivo mixto,
riesgo DINÁMICO con salvaguarda Socorro; jugada de referencia: vender Dúplex en el tope → fondo →
recomprar en bajada). Diseño con 10 ampliaciones aprobadas en `specs/2026-08-22-patrimonio-cfo-design.md`.
Hecho: tablas `patrimonio_activos/valoraciones/recomendaciones` (aplicadas + seed 5 inmuebles;
NULL = «no se sabe»), página `/patrimonio` (neto MÍNIMO declarado + intake), skills `radar-espana`
(quincenal, valoración viva y DUAL vivienda/VUT) y `patrimonio-cfo` (mensual día 2). De paso: catálogo
de agentes des-desfasado (mercado-booking añadida, trading-analista→activo). **Pendiente de Alberto:**
crear los 2 triggers (fichas 16-17 de RUTINAS-PROGRAMADAS) y contestar el intake de `/patrimonio`.

### 🔑 (20/08/2026) Rescatadas las 22 Edge Functions fantasma — y lo que había dentro (PR #1517)
- El panel sirve 67 Edge Functions y el repo versionaba 45. Las 22 huérfanas ya están en
  `supabase/functions-rescatadas/` con **secretos sustituidos** y `gitleaks` como gate previo a cada commit.
- Dentro había **3 PAT de GitHub distintos** (`ghp_97Ct…`, `ghp_5MfB…`, `ghp_hft2…`) y **el email+contraseña
  de Alberto en claro** (`trigger-deploy`). Sustituir en el repo NO revoca: quedan pendientes para Alberto.
- Peor que la fuga: **19 de 22 con `verify_jwt=false`**, seis con efecto real. `upload-landing` commitea
  cualquier fichero a `main` de `roi-intranet` sin login; `trigger-deploy` **devuelve las cookies de sesión**.
- ☠️ `sync-smoobu` (cron diario) **borra `incomes`** si Smoobu contesta 200 con lista vacía: aborta el error
  HTTP pero no el vacío. Ver hallazgo 3 del README del rescate.
- ✅ NO borrar `boe-doc`, `junta-pdf-texto`, `ficha-fotocasa`, `zona-fotocasa`: sostienen subastas Fase 3.
- Método: el rescate literal habría **republicado** los secretos en un repo público. Sustituir → gitleaks → commit.

### 🛑 (20/08/2026) `Cloude` NO es un repo vacío — la entrada del 19/08 se quedó mirando `main`
- Corrige lo escrito abajo («`Cloude`: 1 commit, README placeholder»): eso es solo su `main`. Alberto
  reportó 2 PRs **en borrador** con el proyecto **NIVELA** (~10.000 líneas: scaffold Next.js 15 PWA +
  Supabase, dominio obra/partida/albarán/fichaje, panel CAE, set de marca). Vive SOLO en ramas y PRs.
- **NO borrar `Cloude`**: borrarlo se lleva NIVELA entero. Inventario verificado desde el navegador y
  volcado a **`docs/NIVELA-inventario.md`** (el repo es privado y fuera del scope MCP: sin esa ficha
  habría que re-inventariarlo cada vez). El PR #2 es superconjunto del #1 y ambos salen de una rama
  base que NO es `main`.
- **La banda naranja de Supabase era un aviso legal, no una alarma.** Medido en Organization → Usage:
  ninguna métrica pasa del **35%** (Database Size), overage 0; `pg_database_size` por MCP da 154,72 MB
  (30,9%). El cartel es la Fair Use Policy desde el 10/07 y es condicional y permanente. Corregido en
  `docs/ROTACION-SERVICE-ROLE.md`, que lo daba por «más urgente que la rotación». **Un cartel
  condicional no es un dato de consumo: medir antes de declarar una urgencia.**
- Vercel: marcar `SUPABASE_SERVICE_ROLE_KEY` como Sensitive **expulsa Development** (la doc dice
  prod+preview), y el tipo **Secret** («Secreto» en el panel traducido) NO es lo mismo — vacía el valor.
  Se hará en el paso 2 de la rotación, que ya sustituye el valor; hacerlo antes es tocarla dos veces.
- Método: **mirar `main` no es mirar el repo.** Antes de dar un repo por muerto, contar ramas y PRs.
- `house-sevillana-landing` sí queda confirmado como cáscara muerta, ahora también desde el código: el
  cron SEO (`apps/sivra/vercel.json`, lunes 10:00 UTC) escribe en `central` (`seo-landing.ts:5`), y no
  queda ninguna referencia viva al repo suelto. Su último commit (10/08) es el lunes previo a la migración.
- `GH_PAT_TRIGGER` vivo y en uso real: `auditoria.yml` (aborta si falta), `rutinas-automerge.yml` y
  `ai-programar.yml`. Prueba empírica: el PR #1511 de la radiografía se abrió y mergeó hoy por esa vía.
- Suite completa en verde antes de tocar nada: `pnpm test` exit 0 — **2.494** `node --test` + **107** vitest, 0 fallos.

### 🛑 (20/08/2026) El «cero tráfico legacy» que casi tumba el monitor de salud
- Auditoría de logs (24 h, todo lo que retiene el plan Free): 0 peticiones con JWT legacy → se concluyó que
  las apps ya estaban migradas y que pulsar «Disable JWT-based API keys» era gratis. **Falso.**
- Contraejemplo medido: `cron.job` **jobid 28** (`monitor-health`, `*/5`) lleva un **JWT legacy incrustado**
  en `Authorization: Bearer`, 288 ejecuciones/día, respuestas 200. `pg_net` sale de DENTRO de la BD, así que
  no aparece en `edge_logs`: *no estaba en la tabla* se leyó como *no existe*.
- Y `cron.job_run_details` daba `succeeded` 250/250 — pero en `net.http_post` eso significa **«encolado»**,
  no 200. El estado real está en `net._http_response`. El check que engaña era el del propio monitor.
- **Regla:** para desactivar las legacy, censo por CÓDIGO y CONFIGURACIÓN (grep, `cron.job`, envs, funciones
  no versionadas), nunca por tráfico observado. La retención de logs en Free son ~24 h; un cron mensual no sale.
- Inventario Vercel de los 10 proyectos cerrado (era un hueco del doc). 🔴 **`plataforma`, `almacen`,
  `alquiler` y `transporte` NO usan la API de Supabase**: entran por `DATABASE_URL` (Prisma directo), que la
  rotación de claves NO cubre. Y el panel tiene **67 Edge Functions** frente a las 45 del repo: 22 sin versionar.
- Todo en `docs/ROTACION-SERVICE-ROLE.md`; PR #1517.

### 🛑 (22/08/2026) El canal ya se cura solo — y al comprobarlo, House llevaba 5 días con el ×1,20 (PR #1586)
- **Verificado el trabajo del 20/08:** `sivra_canal` en verde y el ×1,20 SUPUESTO caído en 3 de 4
  pisos, con valores que confirman la hipótesis: markup ~0,95–1,04 **+ cuota fija por estancia**
  (22,30€ Busto Reform · 39,90€ Dúplex), no un ×1,20 plano. `agente_reparaciones` vacía = correcto
  (a las 08:00 el canal ya estaba verde), pero el reparador **sigue sin probarse end-to-end**.
- **El cuarto piso destapó el fallo:** House Sevillana seguía en 1,20 desde el 17/08 pese a ser el
  que MÁS mediciones tiene (7 de su aforo 12). Dos `continue` mudos en `cambiosDe` lo evaporaban del
  parte («4 pisos · 3 ajustados») y, peor, el marcado de ventanas iba por `estado === 'medido'` en
  vez de por «se ajustó» → **quemaba su muestra en cada pasada sin corregirse**, y se quedó a cero.
- Arreglo: `repartirCambios` (3 cubos: cambios · frenados · sinCambio) y `ventanasAConsumir` en
  `lib/sivra/pricing-canal.ts`, puros y testeados — 6 tests nuevos, **verificados por reintroducción
  del bug** (tumban 29, 33 y 34). El latido antepone `🛑 N SIN corregir (piso: motivo)`.
- La lección, hermana de «NULL ≠ 0» pero sobre ACCIONES: **un «no lo he hecho» no puede presentarse
  como un «no hacía falta»**. Y un flag de consumo que se marca de más agota la muestra que hace
  falta para reintentar: el freno se vuelve permanente por agotamiento, sin que nadie lo vea.

### 🧠 (22/08/2026) Health-check: sonda IA muerta (`z-ai/glm-5.2` 410) → swap a `meta/llama-3.1-70b-instruct` — MERGEADO (PR #1583)
Skill `buscador-ia` disparada por el health-check diario (no la pasada semanal). Confirmado con
`/v1/models` real (harness temporal + `pg_net`, WebFetch a NVIDIA/Supabase bloqueado por el proxy)
que GLM-5.2 murió 3 días antes de su EOL anunciado. Swap en todo el radio (core-ai, plataforma,
rrhh, ia-rest) + 4 edge functions redesplegadas. **Mergeado a `main`** (squash, commit `5e6bbed`);
CI verde + 9 previews Vercel Ready antes del merge. **Verificado EN VIVO otra vez tras el merge**
contra la API real de NVIDIA: `meta/llama-3.1-70b-instruct` responde 200 OK (sin 410). Detalle en
`docs/BUSCADOR-IA.md`. Pendiente sin tocar (no es de código): Alberto tiene que subir el PDF de
movimientos de la tarjeta ****0302 de julio (629,86€ liquidados 01/08) para poder conciliarlo.

### 🎯 (21/08/2026) El calibrado ya corre, pero medía la desviación en UN punto — y House se libraba
- Segunda pasada del cron de canal: **corre y en verde** (latido `sivra_canal` ok, 07:45). Ajustó
  3 de 4 pisos (Busto 0,995/22,3 · Duplex 0,949/39,9 · Luxury 1,0428/0, todos con paso acotado).
- 🚨 **House NO se ajustó, y en silencio** (seguía en ×1,20/0 del 17/08). Su ajuste era bueno
  —1,032 + 318€/estancia, R² 0,9985, 7 ventanas— pero `desviacionCanal` compara vigente vs medido
  **en un solo precio** (la mediana), y con cuota fija las dos rectas SE CRUZAN. La mediana de House
  (881€/noche) caía justo en el cruce: sesgo −4,6% → «ok» → `continue` sin pasar ni por `frenados`.
  En sus extremos reales el error era **−23,5% a 465€/noche y +9,5% a 2.743€**. Es el markup escalar
  disfrazado, dentro del módulo que existe para no volver a caer en él.
- **Arreglado midiendo el RANGO, no un punto** (`guestMin`/`guestMax`): el peor sesgo del rango
  decide, el de la referencia se conserva con su significado. House pasa a `desviado`.
- **Y el raíl tenía el mismo agujero:** `pasoCanal` acotaba el salto por su efecto EN LA MEDIANA, así
  que la corrección de House habría entrado entera (−4,6% ahí) siendo un −23,5% en las fechas baratas
  — saltándose de facto el tope del ±15%. Ahora acota por el peor extremo: entra troceada.
- Método: reproducido contra el módulo real con las 7 ventanas de producción antes de tocar nada, no
  a ojo. Los 9 errores de `tsc` del árbol eran previos (deps sin instalar), verificado con `git stash`.
- Verificado: 1.465 tests + 33 del guardián · tsc 0 · build OK. PR #1582.


### 🪞 (21/08/2026) El calendario de earnings ya estaba cerrado: el doc de huecos pedía lo que ya teníamos
Al implementar la Fase 3 apareció `apps/plataforma/lib/trading/earnings-yahoo.ts`: cierra la fecha de
earnings desde el **05/08**, diez días ANTES de que `TRADING-FUENTES-PAGO.md` (15/08) la declarara «el
único hueco con coste directo en dinero real». Y mejor: da `confirmada` y corre server-side. Integrar
`EARNINGS_CALENDAR` se CANCELA (redundante, peor, gasta cuota). De Alpha Vantage sobrevive solo
`LISTING_STATUS` (sesgo de supervivencia, sin equivalente propio) — **pendiente de integrar por HTTP**.
Sí entra `estadoEarnings()`: distingue «no lo sé» de «no hay riesgo», que `earningsInminente` colapsaba.
Corregidos los 3 docs que arrastraban la afirmación. Lección: **un doc de huecos envejece pidiendo lo
que ya tienes, y nadie lo nota porque pedir de más no rompe nada visible.** PR #1581.

### 🔌 (21/08/2026) Vigía de conectores MCP: diseño firmado + Alpha Vantage verificado a mano
Alberto preguntó si hay conectores de bolsa que añadir y si cabe un agente que los revise. Del registro
solo Alpha Vantage cierra huecos reales; **conectado y probado con llamadas de verdad**:
`EARNINGS_CALENDAR` ✅ gratis (ISRG 20/10/2026) y `LISTING_STATUS` ✅ gratis (8.491 deslistadas), pero
`TIME_SERIES_DAILY_ADJUSTED` es **premium** — el 3er fallback de precios ajustados NO se cierra.
Diseñado `conectores-vigia` (mensual día 5, criterio huecos+integraciones, B+C, canario sobre los
conectores en uso) en `docs/superpowers/specs/2026-08-21-conectores-vigia-design.md`.
**Hallazgo colateral:** el automerge NO reconocía `VIGIA-OSS.md`/`BUSCADOR-IA.md`/`FISCAL-AYUDAS.md`
como registro → los PRs de esas 3 rutinas esperaban ojo humano para nada; **arreglado y anclado** con un
guardián que ejecuta la función bash REAL extraída del YAML. **MERGEADO (PR #1581).** Falta solo crear
el trigger de la rutina 16 en `claude.ai → Rutinas` (día 5, 04:00 CEST) — eso es de Alberto.

### 📮 (21/08/2026) SES.HOSPEDAJES: transporte validado contra el servicio REAL y mergeado (PR #1555)
Operación `C` contra `hospedajes.ses.mir.es` → **200 `codigo 0 / Ok`**: TLS con cadena FNMT (raíz
pública, sí está en el almacén), credenciales de servicio web, arrendador habilitado y **ZIP aceptado**
(era gzip: habría fallado TODO con `10111`). `pre-ses` devuelve **502 a todo** → no hay sandbox: el
ensayo es dry-run contra producción. Credenciales **por piso** en `ses_establecimientos` (AES-256-GCM,
`SES_CRYPTO_KEY`), pantalla `/sivra/partes/establecimientos` y latido diario 07:15 que recorre TODOS
los activos. 🚨 **Chekin es hoy el emisor real en los 4 pisos** — nada nuestro envía hasta apagarlo,
y se sustituye en fases como PriceLabs. 🚨 Tabla nueva en `public` nace abierta a `anon`: la migración
hace `REVOKE`. **Pendiente de Alberto:** `SES_CRYPTO_KEY` en Vercel, rotar las contraseñas del portal
SES y dar de alta los cuatro pisos.

### 🧾 (21/08/2026) Cuadre de la cuenta: el VWCE cuadra al céntimo y el 10/08 costó 1.113,87 USD
Reconciliado el libro contra IBKR. **Cuadra exacto:** VWCE 188×169,36€ + 15,92€ de comisión =
**31.855,60€**, y el precio medio de IBKR (169,44467979×188) da **31.855,60€**. El 17/08 la cuenta pasó
a euros (`EUR BUY 32.105,69 @ 1,15912` = **37.214,35 USD → 32.105,69€**) y con eso compró el ETF; caja
implícita 250,09€ contra los 410,46€ que declara IBKR → **160,37€ sin explicar** (¿resto en dólares?, no
lo afirmo). **La caída de NAV:** el **10/08, −1.113,87 USD en un solo día** (9 ops, todas intradía, todas
por STOP: SPCX −855,10, PLTR −258,77) — el patrón de la autopsia repetido 5 días DESPUÉS de firmar el
preregistro — más **−670,16€ de latente** en el VWCE. Quedan ~240€ sin cuadrar y **no se pueden cerrar**:
`tipo_cambio` NULL en 568/569. **Todo netea a cero salvo** VWCE (+188), BRZE (−1000) y NKE (−190).
Las 5 conversiones de divisa están tipadas `CASH` y las vistas filtran `tipo_activo='STK'` agrupando por
divisa: la guarda ya estaba. El único número falso de la sesión lo generé yo con una consulta ad-hoc que
sumaba EUR con USD («flujo neto 2.801,85»); la vista no lo habría hecho.

### 🚨 (21/08/2026) La cuenta está al 98,6% en VWCE: la escalera de tramos hoy NO es financiable
Al preguntar Alberto si adelantaría la inversión real, miré la cuenta en vez de dar por buena la cifra
del preregistro. **NAV 31.531,10€, efectivo 410,46€, posiciones 31.106,48€** — todo en **UNA** posición:
`VWCE` (188 part. del Vanguard FTSE All-World, precio medio 169,44€, latente **−670,16€**). El
preregistro firmado el 05/08 dice «cash de referencia ~33.400€» y sobre eso monta la escalera; ese cash
**ya no existe**. Con 407,63€ de poder de compra **no cabe ni el Tramo 1 (1.000€)**: financiarlo sería
**vender índice para comprar agente**, decisión distinta a la firmada. Anotado en el preregistro como
comprobación de estado, **sin tocar ningún requisito ni la fecha del Tramo 3**. Pendiente de Alberto:
si enmienda la escalera sobre el capital real o la deja congelada de hecho. Sin mirar: por qué el NAV
bajó de ~33.400€ a 31.531€ (¿retiradas? ¿pérdidas?) — no lo afirmo hasta verlo.

### 🔍 (21/08/2026) La segunda opinión: lo que el screener no vale, lo vale contrastar la cifra
Pregunta de Alberto: ¿no da IBKR estos datos? **No** — el conector solo expone precio, volumen,
volatilidad y rendimientos; ni flujo de caja ni ROIC ni márgenes (su plataforma sí los tiene, el MCP no).
Y el uso que SÍ paga los 20 $ no es descubrir nombres, es **contrastar la cifra de una idea antes de la
orden**: pedida la ficha de ORCL a la fuente de pago da **−5,79% de FCF yield = −23.690 M$** contra los
**−23.700 M$ reales**, cuando nuestro parser de EDGAR llegó a decir **+3,49%** (PR #1189). Habría cazado
el fallo fundacional el primer día. Nuevo `contraste.ts` (12 tests): compara las dos fichas y **NO elige
ganador** — signo opuesto = la cifra no se canta; misma dirección pero lejos = orientativo; falta el dato
= «sin contrastar», que no es «bien». Paso `5-ter` en la pasada. Presupuesto: 0,02 $/consulta, 1-2 al día
(solo las ideas que acaban en propuesta) → las ~995 restantes duran años; barrer el ranking las funde.
La fuente de pago también miente (dio `gross_margin: 1` en ORCL): es contraste, no sustituto.

### 🔎 (21/08/2026) Screener de pago recargado: sirve, pero llega con TRES trampas y una cuarta al lado
Alberto puso los 20 $ (1.000 peticiones) y `Datos_financieros` ya responde. La primera consulta real
destapó lo que había que tapar antes de usarlo: (1) **ordena por ABECEDARIO y sin paginación** —
`limit:25` devolvió ABCB, ABEV, ACIW, ACN…, o sea los 25 primeros por la A, no los 25 mejores (máx 100
→ hay que trocear por sector); (2) **ROIC de 668% en ASAN y 345% en ATAT**, capital invertido ≈ 0: un
«no lo sé disfrazado de valor» que **cruza el gate `roic ≥ 0,10`** justo al revés de lo que se busca;
(3) **solo devuelve los campos por los que filtras**. Y de propina, `get_institutional_holdings` trae
el `value_usd` **×1.000** en algunos declarantes (BCV: 23.063 acciones = 2.295 M$). Nuevo módulo puro
`screenerMercado.ts` (traduce a `MetricasFactor`, ANULA el ROIC increíble en vez de recortarlo, anula
yields fuera de USD, marca `truncada`), 11 tests, + skill. Corre en la sesión Claude, no en Vercel.

### 💸 (21/08/2026) Los insiders y los 13F NO hay que comprarlos: ya estaban montados y gratis
Alberto preguntó el precio de las fuentes de datos y la respuesta correcta es **0 €**. El MCP
`Datos_financieros` (financialdatasets.ai) está conectado pero devuelve `Your current balance is $0.00`
—sin saldo, no roto— y lo que vendería ya lo cubren piezas propias en Vercel: **Form 4 →
`/api/trading/insiders`**, **13F → `/api/trading/gurus`** (Dataroma) y **fundamentales →
`/api/trading/fundamentales`** (SEC XBRL, gratis). Lo de pago solo añadiría comodidad y `screen_stocks`.
Anotado en la skill `trading-analista` (`seleccion-y-senales.md`) con el matiz de la regla de la casa:
ese error significa «fuente sin saldo», **nunca «no hay datos de insiders»**. Queda pendiente de decidir
si se recargan los 20 $ solo por el screener; hoy no hace falta para operar.


### 🔧 (21/08/2026) Auditoría ligera: PR #1514 desatascado, heartbeat 12+13/25 ✅
Pasada rutinaria sin hallazgos de memoria/skills (`docs/SKILLS.md` y `FUENTES-DE-VERDAD.md` al
día). Único hallazgo: **PR #1514** (carril 2 del 20/08, monitor de `paper_tracker`) llevaba ~24h en
conflicto — el PR #1505 (libro de trading) añadió una entrada hermana al mismo array en
`latidos.ts`/`agentes-latido/route.ts`. Conflicto de inserción pura: fusionado `main`, conservadas
ambas entradas, `latidos.test.ts` 9/9 verde, empujado a la rama existente (sin PR nuevo). Heartbeat,
backlog de PRs y `rutinas-automerge.yml` sin más hallazgos. `sivra_canal`: su próxima pasada (07:45
UTC) aún no ha corrido desde el fix del PR #1529/#1530; a revisar mañana, no es hallazgo hoy.

### 👋 (20/08/2026) La respuesta auto-enviada a Pilar: dos incoherencias que el prompt no cubría
(1) Cerraba con «que tengas un buen viaje» a una huésped **en plena estancia** («eso sería si
hubiera escrito el día de su salida»); (2) abría con «¡claro que sí!» y dos líneas después negaba
la consigna y la mandaba a taquillas de fuera («no tiene lógica»). Nada del CIERRE ni de la
COHERENCIA apertura↔respuesta estaba en el system prompt. Nuevos módulos puros `cierre.ts` (poda
la fórmula si va aislada; si va entretejida con contenido real, escala) y `coherencia.ts` (NO poda:
reescribir una apertura recoloca el mensaje entero, eso lo hace Alberto). 15 tests, PR #1568.
Regla que queda: **el modelo obedece el prompt o el mensaje pasa por una persona, nunca sale a medias**.
(3) Y faltaba la POLÍTICA de fondo, que Alberto dictó al ver el caso: no hay consigna, pero el día de
salida, **si no entra nadie ese día, se quedan hasta las 12:00 sin coste** (maletas dentro incluidas);
más tarde tiene coste de la empresa de limpieza y el agente lo ofrece SIN precio y escala. Nuevo
`salida.ts` (ficha + prompt tri-estado) y la consigna de pago pasa a ser el plan B. Lo confirma el
histórico de Smoobu (26/07, a Manuel: «puedes salir a las 12:00, no entra nadie después de ti»).
(4) Entrenamiento con los huecos REALES (`mensajes_guia_gaps` + histórico): llaves al salir (Dúplex
= mesa alta de la cocina; resto = donde se cogieron), equipaje ANTES de entrar con la noche anterior
ocupada = consigna, tareas al marcharse (aire/luces, ventanas, basura, avisar) y **auto-envío solo de
la ventana de las 12:00 con ocupación verificada** — nombrar una hora posterior es dinero y escala.
Mergeado el 21/08 con CI en verde; la skill `sivra-maestro` (referencia del agente huésped) ya lleva
`salida.ts`, `cierre.ts` y `coherencia.ts`, y el matiz de que el late check-out ya NO escala siempre.

### 📒 (20/08/2026) Libro completo (569 ops) y la AUTOPSIA: la pérdida es el INTRADÍA, no los valores
Mergeado el **#1505** y verificado en prod (401 sin token, 0 grants a `anon`, tests verdes). **Rescatadas
las 114 ejecuciones de jul–sep/2025 que IBKR iba a dejar de servir** (el libro va ahora de 07/07/2025 a
17/08/2026); cuadre: 22 de 25 símbolos netean 0 exacto — los 3 restantes son una posición que cruzó a Q4 y
dos ventas cuyas compras son anteriores a lo que IBKR sirve (**BRZE y NKE se quedan sin coste de
adquisición: FIFO incompleto ahí**). **Autopsia sobre el libro entero:** vender el MISMO día que compra →
**−24.278,53 USD en 68 días**; vender otro día → **+3.811,08 USD en 74**. Los STOP de 2025+2026 (248 ventas)
suman **−26.538,64 USD** y las 29 a mercado/límite **+6.071,19 USD**. Comisiones 542,14 USD y 8,3 M USD de
volumen sobre ~33.400€: la rotación es el coste invisible. `riesgo-hueco` YA enganchado a `/analizar`
(`stopViable` por idea) + paso 5-bis de la skill para que se cante. **Sigue pendiente:** `tipo_cambio` NULL
en 568/569 filas y las acciones corporativas.


### 🛡️ (20/08/2026) Correduría: había DOS planes para lo mismo con dos nombres — fundidos en uno
Dos sesiones del mismo día planificaron el traspaso del CRM de Manuel sin verse: `docs/TRASPASO-CORREDURIA.md`
(vertical `apps/seguros`, #1532) y `docs/ASEGURA-MIGRACION.md` (vertical `apps/asegura`, #1489). Ambos
mergeados → la siguiente sesión habría leído el que le tocara y hecho lo contrario que la anterior.
**Unificado en `docs/TRASPASO-CORREDURIA.md`** (doc único; el otro absorbido y borrado) con enrutado
coherente en `central-maestro` y `FUENTES-DE-VERDAD.md`. **Nombre bueno: `apps/asegura`** (la marca) —
schema y rol siguen siendo `seguros`/`prisma_seguros` (el dominio, y además ya aplicados en la BD).
🚨 **La lección: un doc duplicado no da error, da instrucciones contradictorias.** Antes de escribir un
plan nuevo, grep del dominio en `docs/` — el coste de no hacerlo lo paga la sesión siguiente.
Contrato de encargado (RGPD art. 28.3): responsable decidido = **Alberto persona física**, «Grupo ASegura»,
fuero Sevilla. **NIF y domicilio a propósito en blanco** — un identificador legal no se escribe de memoria.


### 🧭 (20/08/2026) El índice que usa `code-map` llevaba horas desfasado en `main` — y eso no se ve
`pnpm auditar:check` estaba en ROJO sobre `main`: #1536/#1550/#1551 son posteriores a la última
regeneración (#1547) y ninguno rehizo la radiografía. Lo destapé verificando el PR del traspaso, y
antes de tocar nada comprobé **en un worktree sobre `origin/main`** que el fallo era de `main` y no
del PR — si no, lo habría "arreglado" dentro de un PR de docs y el hallazgo se habría enterrado.
🚨 **Un índice desfasado no falla ruidosamente: manda a la línea equivocada**, que para `code-map` es
peor que no tener índice (acota mal y encima con confianza). El gate en rojo es la única señal, así
que dejarlo pasar «porque es un fichero generado» normaliza el rojo y lo vuelve invisible.
🚨 **PERO regenerarlo DESDE UN PR es una carrera que se pierde, y la perdí:** el PR #1559 generó el
fichero sobre `c5d7af05` y, mientras esperaba CI, se mergeó **#1560** (que añade `pideCaptcha`) → mi
snapshot **llegó ya desfasado** y `main` siguió en rojo tras mergearlo. No es un descuido: en un repo
con este tráfico, el índice solo es correcto si se regenera **SOBRE `main`, después del último
merge** — que es justo lo que hace la rutina de auditoría (`chore(auditoría): regenerar radiografía
[skip vercel]`, ver #1547 y #1554). **Lección: no persigas este gate desde un PR.** Si está rojo,
la pregunta correcta no es «lo regenero yo» sino «¿está corriendo la rutina que lo mantiene?».
(La comparación IGNORA `sha` y `generadoEn` a propósito —`stableMapa`, línea 443— así que un rojo
siempre es deriva REAL de firmas, nunca churn de cabecera.)
**Hueco aparte que destapó el script y NO se toca**: faltan `almacen`, `housesevillana` y `mariscos`
en el array `VERTICALES` de `apps/plataforma/lib/estructura.ts` — exige decidir `sector`/`desc` de
cada una, es criterio de Alberto.


### 🗝️ (20/08/2026) El agente de huéspedes NO tenía ni un dato del piso: la guest app de Smoobu SÍ se puede leer
- Alberto, del hilo del Dúplex con Samy: «¿tiene acceso a todos los mensajes? ¿puede entrar en la url?».
  Diagnóstico: `mensajes_guia_cache` con **0 filas desde que existe** — `guia.ts` bajaba el HTML del
  `guest-app-url`, que es una SPA (2,8 KB sin texto) → el agente respondía **sin ninguna fuente** y
  rellenaba inventando (a Daniela le AUTO-ENVIÓ «secure keybox»; a Samy dos rutas a pie contradictorias
  y un `[lien d'accès]` literal, teniendo el enlace en el hilo).
- **La guest app tiene API JSON abierta con el token del propio enlace:** `login.smoobu.com/api-guest/
  bookings/{id}?token=` y `.../contents?token=`. El Dúplex son 10 secciones: KEYS (avisa de zona
  restringida, «no uses GPS», con vídeo), WIFI, RULES, PARKING, azotea, basura…
- Entrega 1 hecha (spec + plan en `docs/superpowers/`): guía real filtrada por vigencia + **ventana de
  7 días para las claves** (política de Alberto: se dan una semana antes, porque se reserva y se cancela);
  `htmlMessage` para no perder los enlaces; dedup de los automáticos (Smoobu los manda dobles: 8 de 25);
  y la fecha venía en `createdAt`, no `created_at` → el `ts` de TODO el historial estaba vacío.
- **Precedencia:** la sección PARKING de la guía se excluye — Alberto confirma que **no hay plaza** pese a
  que la guía Y el email de confirmación se la prometen al huésped (arreglar eso en Smoobu es de Alberto).
- **Entregas 2-5 también hechas** (mismo PR): detector de conflictos guía↔override (avisa 1 vez por
  piso+sección, tabla `mensajes_conflictos_guia`); **autonomía por FUENTE** — se auto-envía si la
  respuesta se apoya en guía/ficha/hechos, y eso SUSTITUYE a la graduación por categorías (borrada
  `graduacion.ts`); el clasificador de calidad pasa a TRES estados (su `catch` devolvía «no escales»
  = auto-enviar cuando se cae); **hechos permanentes** (`mensajes_hechos`) separados de los ejemplos
  de estilo, y el borrador que escala por falta de info dice de qué hueco se trata; y **minado del
  histórico** (`/api/sivra/mensajes/minar-historico`, manual) que propone hechos por Telegram con
  botones ✅/❌ — nada entra sin que Alberto lo confirme.
- **Mergeado y VIVO** (PR #1542, 20/08 14:53). Primera pasada del cron con el código nuevo, 4 minutos
  después: `mensajes_guia_cache` pasó de 0 filas a las guías reales de Dúplex (10 secciones) y Socorro 24
  (9), con 3 secciones de acceso detectadas en cada una, y el detector de conflictos disparó sus dos
  avisos de PARKING (uno por piso). Las cuatro guest apps responden 200 (comprobado antes de mergear).
- **`?dry=1`** (PR #1546): con la autonomía nueva, el disparo manual le manda el mensaje DE VERDAD al
  huésped, así que probar costaba un mensaje a un cliente. El simulacro recorre el pipeline y devuelve
  qué saldría y si se enviaría solo, sin enviar, sin proponer y sin escribir.
- Pendiente: **vender/cobrar el parking** (fase 2, pedido por Alberto).

### 💶 (20/08/2026) Dúplex: plan precio→reforma→venta, y el motor de precios tiene una copia RETIRADA que engaña
- Del estudio fiscal salió una tercera opción que no estaba sobre la mesa: **antes de reformar (25-40k€) o
  vender, tocar el precio** — gratis y reversible. Plan con criterios numéricos escritos ANTES de medir en
  `docs/DUPLEX-plan-precio-reforma-venta.md` (fases A precio → B baño abajo → C 2º dormitorio → D vender).
- **🪤 Landmine caro:** acusé al motor de pricing de dos fallos leyendo `apps/sivra/lib/pricing-engine.ts`.
  **Esa copia está RETIRADA** (su ruta da 410 desde el 18/07/2026); el motor vivo es
  `apps/plataforma/app/api/sivra/pricing/apply` y es mucho más fino. Uno de los «fallos» ya estaba resuelto
  desde el 09/08 (`pricing-demanda.ts` gatea el descuento fuera de la ventana de venta). Anotado en la skill
  `pricing-agente`. **Antes de acusar a un motor, comprueba qué copia corre.**
- **Aplicado en prod con OK de Alberto:** `target_pctl` 0,50→0,60 en `prop_duplex_center` (Fase 1). Pendiente
  de su decisión `max_change_pct` 0,20→0,08. La ocupación de la competencia **no** se puede usar hoy
  (`market_rates` no guarda disponibilidad) — haría falta panel fijo de comps.
- **Rutina nueva** (día 1 de cada mes, `trig_01QLVxzPS1PXAJPuWhApcAFV`): mide el mes cerrado y aplica el
  criterio de la fase. Ficha en `docs/RUTINAS-PROGRAMADAS.md` §15. PR #1538.


### 🏠 (20/08/2026) Estudio fiscal de la venta del dúplex de Villasís por 320.000€
- Alberto sube la escritura del dúplex (Pj Villasís 1, 1º C) y pregunta cuánto pagaría vendiéndolo por
  320.000€. **Es una DONACIÓN de su madre del 21/05/2024 por 174.650,90€** (= valor de referencia), con
  bonificación 99% del ISD andaluz → valor de adquisición = ese, no lo que pagó ella en 2004.
- Números: ganancia ~145.000€ (sin agencia) → **IRPF ~32.300€ + plusvalía ~970€**; con agencia al 3%,
  ~30.600€. Neto entre 271.000€ y 286.000€. Estudio completo en `docs/FISCAL-venta-duplex-villasis.md`.
- **Plusvalía: método objetivo (~970€) vs real (~24.900€)** — hay que pedirlo expresamente.
- **Palanca grande:** pérdidas realizadas de IBKR (−6.642 USD en 2025, −18.746 USD en 2026) compensan al
  100% la ganancia → ~3.700€ menos. ⚠️ Son P&L del bróker en USD SIN tipo de cambio: hace falta el
  informe fiscal en euros antes de contar con ello. El año de venta (2026 vs 2027) importa por esto.
- **Alcance cerrado:** Alberto confirma que es **un solo piso / una sola finca** (2/18031).
- **Cruzado con la declaración 2025** (hilo Asecon + registro en Drive): Villasís estuvo **240 días
  arrendado**, ingresos declarados 18.606,47€ (neto Booking) y gastos 3.052,26€ → renta ~15.554€/año
  (4,86% sobre 320.000€). Dos preguntas abiertas para Asecon: base de la amortización (valor ISD, no
  catastral — STS 15/09/2021) y si entraron las limpiezas (~1.800€/año). Rectificables 2024-25 si
  fallan. Validación final: Asecon.

### 🛑 (20/08/2026) El login automático del Portal NO es viable: 2FA y después CAPTCHA — PRs #1548→#1560
- Se construyó entero (login, lectura del código por IMAP, segundo POST) y se probó contra producción. El
  Portal cerró la puerta en dos escalones: **2FA** en la única vía automatizable (usuario+contraseña), y
  después **CAPTCHA** tras la ráfaga de intentos. **No se resuelve el captcha**: automatizar el acceso
  propio es una cosa y saltarse un «demuéstrame que eres una persona» es otra; además el escalón siguiente
  es el bloqueo de la cuenta. `captcha` y `rechazada` no se reintentan y avisan por Telegram.
- El lector sigue en ANÓNIMO, honesto: con muro dice «identifícate», no «no hay documentos».
- **Lo que sí sirve:** Alberto entró a mano con Claude Chrome y bajó **18 documentos de las 9 fichas en dos
  minutos**. Solo Barbate (265289) no publica certificación de cargas. **PENDIENTE: el buzón de Drive** para
  que el lector procese esos PDFs — ese es el camino, no el login.
- 🚨 Dos bugs propios de método: (1) el detector buscaba «Cerrar sesión» y el Portal dice **«Desconectar»**,
  con el fixture escrito con la misma suposición que el código → suite en verde sobre un detector muerto;
  (2) el margen de frescura del OTP (30 s) era **más ancho que la distancia entre intentos** (11 s) y se
  tragaba el código anterior. Un margen de tolerancia es una puerta: se mide contra la frecuencia real.

### 🔓 (20/08/2026) El cron ya se identifica en el Portal del BOE — y el muro cambia de significado
- Alberto: «ya tengo usuario en el BOE con mi firma digital». Comprobado en `/acceso.php`: de las tres vías
  (certificado · **usuario+contraseña** · Cl@ve) solo la segunda sirve a un proceso; `POST /id/login.php`
  sin CSRF ni captcha. **La firma digital NO entra en repo ni en Vercel.** Envs: `BOE_PORTAL_USUARIO`,
  `BOE_PORTAL_PASSWORD` — sin ellas todo sigue en anónimo igual que antes.
- 🚨 El Portal **bloquea cuentas** («…o está bloqueado»): un rechazo se cachea y NUNCA se reintenta; solo el
  fallo de red es reintentable. `interpretarLogin` exige el éxito POSITIVO (fixture del error REAL).
- Columna `documentos_sesion` + estado `ocultas_pese_a_sesion`: el mismo muro significa «identifícate»
  (gratis) o «pide la certificación al Registro» (tasa) según con qué ojos se miró. Ante `null`, el barato.
- Las 9 fichas con muro se releen en la primera pasada con sesión (validado contra la BD). 503 tests módulo,
  1372 plataforma, tsc+build limpios. **Pendiente de Alberto:** poner las dos envs en Vercel y probar con
  `fase3-debug?accion=portal` (devuelve solo el veredicto, nunca la contraseña).


### 🛡️ (20/08/2026) Traspaso del CRM de correduría de Manuel Suárez — runbook, BLOQUEADO en Fase 0
Manuel desarrolló el CRM en SU Supabase y SU Vercel; el negocio es de Alberto y hay que traérselo.
Plan cerrado en `docs/TRASPASO-CORREDURIA.md`. Decisiones: BD → **schema `seguros` en `central`**
(no un proyecto aparte: principio de BD única de `MATRIZ.md`) con rol `prisma_seguros`; código →
vertical **`apps/seguros`** ⚠️ *(nombre SUPERADO el mismo día: la vertical es `apps/asegura` — ver entrada de arriba)* (molde `apps/mariscos`, `ignoreCommand` desde el primer commit); free vs.
Pro se decide **midiendo el dump**, no con la estimación de ~200 MB (hoy `central` va por ~180/500).
**No** se transfiere su proyecto Supabase ni se monta MCP/API a medida: para inspeccionar, Manuel
invita a Alberto a SU organización (el conector de Supabase ya lo ve); para copiar, `pg_dump | psql`
(un MCP perdería índices, secuencias, constraints y triggers). **GitHub va aparte:** el código entra
sin historia git y su repo original se TRANSFIERE a Alberto y se archiva como museo.
La petición a Manuel se plantea en dos opciones — **A (recomendada): tres accesos, ~5 min de su
tiempo**, todo lo demás lo hace Claude; B: lista de tareas, si no quiere dar ese acceso.
🚨 **La transferencia del repo va LA ÚLTIMA**: rompe la conexión git de su Vercel y le tumba el
despliegue, que debe seguir vivo para la comparación lado a lado. Anticipados tres límites reales
(org de Supabase con otros clientes · Vercel Hobby no admite miembros · repo en organización ajena),
ninguno bloqueante: cada uno cae a su fila de la opción B.
No confundir con `/correduria` de plataforma, que es la contabilidad de comisiones y NO se toca:
esa ambigüedad queda enrutada en la skill `central-maestro` (+ fila en `docs/FUENTES-DE-VERDAD.md`),
con el aviso de que «no está en el repo» ≠ «no existe» (lección de la landing de House Sevillana).
**Mensaje ENVIADO por WhatsApp el 20/08/2026**, así que la Fase 0 ya no bloquea: se espera respuesta.
Lo siguiente que le debemos es el documento que le promete el punto 6 — borrador del contrato de
encargado de tratamiento en `docs/CONTRATO-ENCARGADO-TRATAMIENTO-MANUEL.md`, **sin firmar y sin
enviar**: falta decidir **quién firma como responsable** (¿ASegura S.L. o Alberto persona física? —
depende de a nombre de quién esté la cartera, no verificado) y que lo revise la asesoría. Ojo: firmarlo
ahora NO legaliza retroactivamente el periodo en que Manuel ya tuvo los datos; documenta la relación y,
sobre todo, fija entrega + borrado acreditado. Las categorías de datos del contrato se cierran con el
inventario de la Fase 1, no antes.
### 🔨 (20/08/2026) Las subastas ya cuentan CÓMO ACABARON, y el techo de puja se contrasta con remates reales — PR #1536
- **TRES sesiones distintas fueron al mismo sitio el mismo día**: esta, #1537 (pujas `ver=5` + avisos
  sobre el radar) y #1540/#1548 (login e identificación en el Portal con 2FA). Cada vez que `main`
  se adelantó, este PR se **reconcilió sobre él** en vez de imponer lo suyo.
- Lo que se tiró por duplicado: el `pujasDeFicha` de `ficha-boe.ts` (manda `pujas.ts`), las columnas
  `hay_pujas`/`pujas_secretas`/`pujas_at` (manda `pujas_estado`), y la `PORTAL_SUBASTAS_COOKIE`
  (manda el login real de #1540/#1548; ahora `sesionPortalAbierta()` aprovecha la sesión si ya está
  abierta y NO abre ninguna: cada login manda un SMS y el Portal bloquea cuentas).
- Lección de método: dos agentes sobre el mismo tema el mismo día no cuestan el trabajo repetido,
  cuestan **dos columnas que dicen lo mismo** y se desincronizan — y entonces se decide una puja
  mirando la que se quedó vieja. Al reconciliar, manda lo que ya está en `main`.
- Lo que aporta este PR encima: **`subastas_pujas_obs`** (serie temporal; el Portal solo publica el
  estado de HOY, así que «cuándo entró la primera puja» solo se responde con histórico propio),
  **`avisarDesenlaces`** (el remate se capturaba en silencio desde julio: ahora se cuenta por Telegram
  con el remate contra el tipo EN EUROS y si nuestro techo habría ganado), y **`remate.ts`**
  (`remateEsperado`/`revisarTecho`) que convierte la calibración en euros por fila.
- El caso que lo justifica: Dos Hermanas, tipo 739.210,43€ y «techo» calculado de **887.052,43€**
  sobre la mediana del municipio. Ahora sale como `techo_fiable=false`, no como recomendación.
- Muestra real: mediana del **64% del tipo**, ninguna desierta; Sevilla capital a 2x y 4x.
- Cantabria no estaba en `subastas_criterios` pese a los avisos de Alberto: añadida.
- Verificado antes de mergear: plataforma 1.404 · module-subastas 527 · guardias 33 · vitest 53 ·
  resto de packages sin fallos · `tsc` limpio. Ficha del agente puesta al día en `agentes-catalogo.ts`.

### 🔔 (20/08/2026) El aviso de cierre de subastas no había sonado NUNCA — y las pujas se leían de la pestaña equivocada
- Alberto: «que el agente me avise el día antes con cómo van las pujas». Auditoría: 19 filas en el radar,
  18 avisadas, **0 seguidas** — y TODO el cron `subastas-cierre` colgaba de `subastas_seguidas`, que exige
  pulsar «👀 Seguir». Nunca se disparó (`mejor_puja_at` sin estrenar en las 26 filas).
- `mejorPujaViva` leía la pestaña GENERAL, donde solo están la puja MÍNIMA y los tramos → nunca encontró nada.
  La pestaña `ver=5` sí lo dice: medido en las 13 vivas, **5 sin pujas · 5 con puja de importe oculto · 3
  secretas**. El importe solo se publica al CONCLUIR (y ahí sí: 8 remates reales, mediana **0,64× el tipo** —
  pero **Sevilla va a 1,42×**, con un 165.000€ → 669.900€ verificado a mano).
- Hecho: `pujasDeFicha` (4 estados, `desconocido` nunca es «sin pujas») + `pujas_estado` + avisos sobre el
  RADAR con **dos ventanas**: «prepara el depósito» a 5 días (el cuello de botella es el dinero: el Portal
  llega a pedir el 20%) y «últimas 24 h». Con ratio de remate de SU provincia y suelo del art. 670.
- **Probar antes de mergear cazó DOS bugs que `tsc` y `next build` dan por buenos:** tres columnas que el
  cron lee y faltaban en `COLS_SUBASTA` (filas `$queryRaw` = `any` → aviso MUDO con el dato en la BD; ahora
  lo vigila `cols-subasta.test.ts`) y un `SELECT DISTINCT … ORDER BY` fuera del SELECT (**42P10**, el vigía
  moría en cada pasada). Regla: **el SQL de un cron nuevo se ejecuta contra la BD real antes de mergear.**
- Pendiente: llevar el estado de pujas a la ficha de `/subastas`; registrar el MOTIVO del descarte.

### ⚖️ (20/08/2026) «Cargas no publicadas» con la certificación colgada: el Portal las esconde tras el login
- Alberto, sobre SUB-JA-2026-262097: «si vienen!! ¿por qué sigue pasando esto?». El BOE publica
  «SUBASTA LOCAL COMERCIAL» y «CERTIFICACIÓN DE CARGAS», y la ficha decía 🟠 «no publicadas».
- **Raíz:** el bloque «Información complementaria» solo se enseña con SESIÓN INICIADA en unas subastas.
  El cron entra anónimo, `enlacesDocumentos` devuelve `[]` (y `fichaLegible` pasa: la ficha ES la ficha),
  y ese `[]` se grababa como «revisada, el BOE no adjunta nada» + `lector_version` → nunca se reintenta.
  Medido a mano: **8 de las 13 vivas** decían eso y **las 8 tenían muro; ninguna carecía de documentos**.
- Fix: `muroDocumental()` (puro) + columna `subastas.documentos_muro` + estado `ocultas_tras_login`
  («entra con tu usuario», no «ve al Registro»). De paso, `/api/subastas/radar` devolvía el anuncio PELADO:
  marcar «visto» borraba la documentación de la tarjeta.
- **PENDIENTE (decisión de Alberto):** (a) ¿dar credenciales del Portal al cron para leer tras el login?
  (b) SUB-JA-2026-262310 tiene la certificación descargada y sin cuadro: es un escaneo CCITT/JBIG2 con OCR
  basura (553k chars) → `pareceEscaneado` la da por texto bueno y `localizarJpegs` no ve páginas (solo JPEG).
  Rescatarla pide rasterizador de PDF, no un ajuste de umbral.

### 🔧 (20/08/2026) Del latido rojo al MERGE sin humano en medio — reparación automática de agentes
- Pregunta de Alberto tras el fallo del canal: «¿no hay un agente que revise y repare?». Había quien
  DETECTA (`agentes-latido`, `/auditoria-diaria`) y nadie que REPARE. Dictado: **«lo más automático
  posible y solo avisarme en caso de no resolverse por si tengo que intervenir»**.
- Flujo: 07:45 latido → 08:00 `latido-reparar.yml` reclama UNO → `scripts/ai-programar.mjs` → **gate**
  → mergea solo · o PR draft + Telegram. A las 24 h el **propio latido** dicta el veredicto.
- **Dos reglas del disparador:** solo dispara lo que tiene forma de EXCEPCIÓN (`reparable.ts`, puro y
  testeado; un IMAP caído no se arregla en el repo), y al orquestador se le manda la **EVIDENCIA**
  cruda, nunca la narración del aviso — la de `sivra_canal` mandaba al fichero equivocado.
- **El gate es una PRUEBA, no CI:** exige un test que falle sobre `main` y pase con el parche, y lo
  ejecuta en su propio run. Motivo doble: un `tsc` verde bendice cualquier cosa, y el estado de checks
  **miente** aquí (el #1529 salió ✅ con `tests.yml`/`ci.yml` sin ejecutarse nunca).
- Frenos: 1 firma = 1 intento · 3/agente en 30 días · carril acotado (nada de `.claude/**`, workflows
  ni `.sql`). Tabla `agente_reparaciones` **ya aplicada**. Éxito = silencio. Spec en `docs/superpowers/specs/`.
- 🔀 **Choque con #1530, que arregló el MISMO `date - bigint` a la vez.** Me quedo con su versión del
  código y su guardián; de lo mío sobreviven los **dos sitios que #1530 no tocó** —`lib/ia-cache.ts`
  (la caché semántica NO guardaba nada) y el mailing de ialimp (pasos ≥2 nunca encolados)— y una
  regla que a su guardián le faltaba: **`make_interval(days|hours => bigint)` TAMPOCO existe**; solo
  `secs` lo acepta (es `double precision`). Su cabecera lo recomendaba como cura y no lo es.
- **Cierre (mismo día):** corregida la `nota` de `sivra_canal` en `latidos.ts` —afirmaba que un rojo
  ahí venía «de aguas arriba» y era falso; ahora manda leer el detalle y ordena qué mirar. `/auditoria-diaria`
  consulta `agente_reparaciones` antes de abrir carril 2 (no duplicar parche sobre un intento vivo) y el
  reparador queda registrado en `docs/SKILLS.md` para el `agentes-entrenador`, avisando de que su
  comportamiento es CÓDIGO TESTEADO, no un prompt, y de que su silencio no prueba que corriera.
- 🔑 **Ese «pendiente de Alberto» se cerró solo, y el intento de cerrarlo destapó algo que hay que
  recordar: el `ALERTA_TOKEN` de Vercel está marcado Sensitive** — escritura sin lectura, no lo
  devuelve ni el dashboard ni la API, así que **su valor no se puede recuperar de ningún sitio**. Y
  rotarlo para copiarlo a GitHub habría desincronizado de golpe TODAS las Rutinas de claude.ai/code,
  que lo llevan escrito en el prompt (es la avería del 19/07/2026 del agente de trading, y la
  variable de Vercel lleva justo esa fecha). Salida: `latido-reparar.yml` pide
  `secrets.ALERTA_TOKEN || secrets.CRON_SECRET` — los dos endpoints usan `isRoutineAuthorized`, que
  acepta ambos, y `CRON_SECRET` ya estaba en los secrets del repo. **No contradice el token estrecho:**
  este existe porque las Rutinas corren con las variables a la vista; los secrets de Actions no.

### 🧨 (20/08/2026) `date - bigint`: el calibrado del canal murió en su primera pasada real — y tapaba un suelo apagado
- **El cron `/api/sivra/pricing/canal` reventó entero** (42883, `operator does not exist: date - bigint`)
  en `CURRENT_DATE - ${VENTANA_DIAS}`: Prisma manda un número de JS como **int8** y Postgres no tiene
  `date - bigint`. Compila, pasa `tsc`, pasa `next build`, pasa los 1.342 tests — porque **nada de eso
  ejecuta la consulta**. `pricing_settings` siguió con el ×1,20/0/2 que ese cron existe para corregir.
- El **latido `sivra_canal` hizo su trabajo**: rojo, con el error literal. El vigía es lo único que
  separó «no ha corrido» de «corrió y murió».
- 🚨 **Lo caro apareció al buscar el patrón:** la MISMA construcción en el suelo de PriceLabs de
  `pricing/apply` (`captured_at >= CURRENT_DATE - ${PL_REF_MAX_AGE_DAYS}`, desde el 16/08), pero ahí
  la tapaba un `.catch(() => [])`. Resultado: **el suelo del 85% llevaba días INERTE y su tripwire del
  70% tampoco podía saltar** — «no he podido leer la referencia» servido como «no hay referencia», el
  landmine del CLAUDE.md raíz en su forma más cara. 708 filas de referencia vigentes sin usar; medidas
  107 fechas de House y 81 del Dúplex por debajo del suelo (p. ej. Dúplex 24/10: 148€ contra 220€ de PL).
- Arreglado: `::int` en ambas, el `catch` del PL ahora **declara** (`pl_degradado`, `ok:false`, Telegram)
  en vez de degradar en silencio, y guardián nuevo `test/regression-sql-fecha-parametro.test.ts` que
  falla si alguien vuelve a restar un parámetro sin castear (verificado: caza el bug original).
- Lección de método: **una consulta que ningún test ejecuta no está probada por tenerlo todo en verde.**
  Las dos consultas arregladas se probaron contra la BD real con parámetro bigint antes de dar el fix
  por bueno. (Y ojo: un backtick dentro de un `Prisma.sql` cierra el template — casi se cuela.)
- Bien: la rutina de Booking SÍ midió sola 6 ventanas nuevas de escaparate (22 en total). PR #1530.

### ✅ (20/08/2026) El calendario de House Sevillana, EN VIVO — tras romperse TRES veces por caché
- **Confirmado por Alberto en pantalla.** Verificado además que las fechas son las buenas: las 34
  noches ocupadas del endpoint coinciden **una a una** con el snapshot del cron (sin desfase de día,
  el fallo clásico de husos); rango hoy→+12 meses, sin duplicados, sin fechas pasadas.
- **Tercera capa, la que sobrevivió a los dos arreglos:** `s-maxage` **NO** significa «cachea solo
  el CDN». Sin `max-age`, el navegador no tiene vida útil declarada y el `stale-while-revalidate`
  le deja servirse **su propia copia rota** hasta una hora. Con el endpoint ya impecable (12/12), la
  web seguía rota y desde el servidor era invisible. Fix #1523: `max-age=0, must-revalidate` (fuera
  el SWR: no se puede pedir solo para el CDN) + `cache:'no-store'` en el `fetch` del widget.
- **La lección de método, la misma las tres veces:** tomar «no he podido observar el fallo» por «no
  hay fallo». Cada arreglo era correcto y cada verificación era real; lo que faltaba era un camino
  que la comprobación nunca ejercitaba. Escrito en `verification-before-completion`.
- Aparte: la web estuvo caída un rato con `ERR_SSL_PROTOCOL_ERROR` en `www` (dominio principal).
  Se recuperó sola; **no se llegó a diagnosticar** — si repite, hay que mirar el certificado en
  Vercel → Domains, no el código.

### 🚧 (20/08/2026) El calendario salía «no hemos podido consultar»: se arregló DOS veces — #1519 y #1521
- Mergeado #1500, el endpoint daba **200 impecable por curl** y estaba roto en el navegador: la
  respuesta se cachea en el CDN (`s-maxage=600`) y sus cabeceras dependían del `Origin`, así que
  **la primera petición decidió las de todas durante 10 min** — y la primera fue mi propio `curl`
  SIN `Origin`, que dejó cacheada una copia sin `Access-Control-Allow-Origin`.
- **#1519 (`Vary: Origin` siempre) NO funcionó**, y solo se supo por verificar en producción:
  **el CDN de Vercel no cachea por `Origin`** y encima borra ese `vary`. Medido: **12 de 12**
  peticiones desde housesevillana.es recibían la copia dejada por un curl con `Origin` ajeno.
- **#1521 es el arreglo bueno: `Access-Control-Allow-Origin: *` fijo**, lista blanca retirada
  (el endpoint no lee sesión, no hay nada que proteger). Una respuesta cacheada no puede depender
  del `Origin`. Helper `lib/sivra/cors-publico.ts` sin argumentos + test que vigila la ruta.
- **Dos lecciones a la skill `verification-before-completion`:** un 200 por curl a pelo no prueba
  CORS; y **con caché delante, UNA petición no es una medición** (repetir y mirar `x-vercel-cache`).
- **Y AUN ASÍ seguía roto en el navegador de Alberto (captura), con el endpoint ya correcto.**
  Tercera capa, la que no se ve desde el servidor: la cabecera era `s-maxage=600,
  stale-while-revalidate=3600` **sin `max-age`**. Para una caché PRIVADA eso no fija vida útil
  (heurística = 0 sin validador) y el `stale-while-revalidate` **autoriza al navegador a servir su
  propia copia vieja hasta una hora** — la copia rota de antes del arreglo. Fix (#1525):
  `public, max-age=0, must-revalidate, s-maxage=600` (se renuncia al SWR: no se puede pedir solo
  para el CDN) + `cache:'no-store'` en el `fetch` del widget, que solo toca la caché del navegador.
  Regla: **`s-maxage` sin `max-age` no es «cachea solo el CDN»**; el navegador también guarda.
- **Verificado en producción tras mergear #1521** (20/08, 07:40 UTC): se envenenó la caché a propósito
  con `Origin: https://competencia.com` y aun así **12/12** peticiones desde housesevillana.es
  recibieron `access-control-allow-origin: *` (todas `HIT`, o sea de la copia envenenada). Igual sin
  `Origin`, y el preflight `OPTIONS` da 204 con la cabecera. Cuerpo: `fuente:smoobu`, 34 noches
  ocupadas, 0 sin dato. ⚠️ La landing en sí **no se pudo mirar desde el contenedor** (el proxy bloquea
  `housesevillana.es` y los previews `*.vercel.app`) — falta el Ctrl+F5 de Alberto para cerrarlo.

### 🐾 (20/08/2026) Tres decisiones de Alberto sobre la landing, y el calendario a producción
- **Mascotas: NO se admiten.** La ficha de Booking **2039943** publica «Admite mascotas» y la landing dice
  que no (FAQ + JSON-LD). Comprobado con el conector; la web está BIEN y no se toca — el error está en
  Booking y lo corrige Alberto en la extranet (prompt listo en `docs/PROMPT-CHROME-landing-calendario.md`).
- **«Bercell» se queda fuera** del pie, definitivamente. Y el PR #1500 (calendario + pie) **se mergea**.
- De paso, esa ficha confirma contra fuente real: dirección **Socorro 24**, nota **8,6/51 reseñas** (la web
  ya lo dice) y que el ID de House Sevillana es 2039943, no el 4771238 que le atribuye la skill de SEO.
- Lo que queda del calendario es de navegador (deep link `dd/mm/yyyy`, 320 px, minutos a pie): va como
  prompts para Claude Chrome en `docs/PROMPT-CHROME-landing-calendario.md`, no como lista de deseos.

### 🔍 (20/08/2026) Auditoría diaria (ligera) — heartbeat 22/22 ✅, sin drift, un vigilante nuevo
- Rango: 45 commits desde la pasada del 19/08 05:15 UTC, casi todo el cierre de la saga
  `auditoria.yml`/`rutinas-automerge.yml` + sesión IBKR + fixes de housesevillana. Sin huecos en
  memoria (el guardián ya lo había anotado todo), `docs/SKILLS.md` al día, sin contradicción fiscal.
- `rutinas-automerge.yml` confirmado sano: última pasada 01:55 UTC en verde, cada hora sin huecos —
  la saga del 19/08 (PRs #1501→#1511) quedó resuelta de verdad.
- **Hallazgo (carril 2, PR aparte):** el cron semanal `paper-tracker` (alta 18/08, PR #1476) ya
  escribía su latido pero nadie lo vigilaba — añadido a `AGENTES_VIGILADOS`/`PROBES`.
- Informe completo en `docs/AUDITORIA-2026-08.md` (actualización 2026-08-20).

### 🛡️ (19/08/2026) Grupo Asegura — plan para traer la correduría al monorepo
- Nuevo `docs/ASEGURA-MIGRACION.md`. El desarrollo externo es el repo **`manuelsuarez/asegura`**
  (invitación de colaborador del 12/08 en el Gmail, **sin aceptar**); Claude NO puede leerlo desde
  esta sesión (app instalada solo en `albertosuarezgutierrez-gif`, `add_repo` cross-owner bloqueado).
- **Decisión: NO se crea proyecto Supabase nuevo** aunque el 2º free cueste 0 €/mes — los free se
  pausan a los 7 días de inactividad y las cuotas son por organización. Va como schema **`seguros`**
  en `central` + rol `prisma_seguros`, app `apps/asegura`, marca por `@central/brand`.
- Bloqueantes de Alberto: **transferir** el repo a su cuenta (es un Next.js hecho con Claude Code:
  787 commits, 258 ramas, e2e, tickets Linear LOO-xxx, desplegado en `asegura.vercel.app`; el Vercel
  y el Supabase también son de Manuel).
- **Hecho sin depender de él:** schema `seguros` + rol `prisma_seguros` creados en `central` (inerte,
  sin password; SELECT en cuentas/sociedades/negocios) — `apps/asegura/prisma/sql/2026-08-19_asegura_bootstrap.sql`.
  Y `docs/ASEGURA-PROMPT-CHROME.md` para inventariar el repo con Claude Chrome. PR #1489.
### 🛤️ (19/08/2026) El raíl aguanta en vivo — vigilancia diaria de precios BORRADA
- Verificado sobre la pasada real de las 20:31 UTC. El arreglo (#1497, `1f5a4d0`) estaba en producción
  desde las **20:13:18 UTC**, 18 min antes (deploy de `a6ef85ab`, del que `1f5a4d0` es ancestro).
- **0 fugas del raíl en las 351 fechas escritas hoy, en los 4 pisos.** Las 17 que ayer se pasaron son
  justo las 17 que hoy se reescribieron, y todas frenaron en el tope: Busto Reform 18/09 se quedó en
  312→250 (ayer siguió a 200, −35,9%) y las 16 de House de 2027 en −20,0%.
- La peor bajada del día es **−20,23%** (Luxury 22/08, 173→138) y **no es fuga**: `ROUND(173×0,8)=138`,
  o sea el motor clavó su propio suelo y el exceso es redondeo a euros. Las 3 mayores bajadas caen
  exactamente en `ROUND(ancla×0,8)`. La mayor subida (+82,4%, Luxury 28-30/12) es el salto de evento
  de Nochevieja: todo lo posterior al clamp solo SUBE, por diseño.
- Con eso se cumple el «todo ok» condicionado de Alberto → **borrada `trig_01Eagedr3hBNtpf1oEgDHj5R`**
  («Vigilancia diaria pricing SIVRA», diaria 09:00 UTC desde el 09/08). Siguen vivos el guardián de
  las 07:30 con alertas a Telegram, la auditoría diaria y el agente de pricing semanal.

### 📅 (19/08/2026) Calendario de disponibilidad en la landing de House
- Alberto lo pidió: que el huésped vea de un vistazo qué noches hay. Como la landing es HTML plano en
  rutas `edge` **sin BD ni secretos**, el dato viene de un endpoint público NUEVO en plataforma
  (`/api/publico/disponibilidad`, en la lista `PUBLIC` del middleware): Smoobu en vivo con caché de
  10 min, respaldo `rate_snapshots` de ≤2 días con su fecha real, y **503 si no hay ninguno de los dos**.
- **La regla que gobierna todo:** un `ocupadas: []` de consuelo se pintaría como calendario entero libre.
  Helper puro `lib/sivra/disponibilidad-publica.ts` (8 tests): `available` ausente/null/raro → `sinDato`,
  jamás libre. En el widget, **toda celda nace en `sindato`** y un fallo de red va al estado `error`.
- Cuatro estados distinguibles SIN color (macizo/rayado/contorno punteado/plano). Vive en
  `app/calendario.ts` para no darle superficie al agente SEO de los lunes — y por eso el guardián i18n
  pasa a leer también ese fichero (si no, sus 16 claves quedaban fuera de la red: el fallo de #1487).
- Spec + apéndice con markup y CSS: `docs/superpowers/specs/2026-08-19-calendario-disponibilidad-design.md`.
- **🚨 Lección de CI (misma sesión):** el PR pasó ~1h30 sin que corriera NINGÚN check y se llegó a culpar
  al token de la GitHub App. Falso: el PR estaba en **conflicto** con `main` (#1499→#1503 movieron el
  archivo de memoria). **Con el PR en conflicto GitHub no puede construir la ref de merge y los workflows
  `pull_request` ni se disparan** — ni con pushes nuevos ni cerrando y reabriendo el PR. Al mergear `main`
  en la rama arrancaron los 15 checks en el acto, todos en verde. Antes de diagnosticar «la CI no corre»,
  mira `mergeable_state` (`dirty` = esto).
- **Sin verificar:** el enlace profundo al motor con fecha (`arrivalDate=dd/mm/yyyy`, NO ISO como su API).
  Evidencia de dos repos públicos con cuentas Smoobu distintas; el proxy bloquea `*.smoobu.com`. Degrada
  a abrir el motor sin fecha, así que el riesgo es nulo. **Falta que Alberto pegue la URL en un navegador.**

### ©️ (19/08/2026) El pie de la landing decía «© 2025 · Bercell»
- Dos fallos en la misma línea de `apps/housesevillana/app/route.ts`. **El año quemado**: en agosto de 2026
  la portada firmaba «© 2025», que a un huésped le lee como web abandonada. No se ha puesto 2026 (vuelve a
  caducar) ni `new Date().getFullYear()` (el HTML es una const de módulo y Next puede prerenderizar la ruta:
  quedaría clavado en el año del build) — **se ha quitado el año**: un copyright no lo necesita y así no hay
  número que envejezca. Guardián nuevo `app/pie.test.ts` sobre las 4 páginas.
- **«Bercell»**: aparecía UNA sola vez en todo el monorepo, sin rastro (entró con la importación sin historia
  del 12/08). Sin poder verificar qué es, se ha quitado en vez de inventar un sustituto — la identidad legal ya
  la lleva la línea de al lado (`VFT/SE/01179`). **Si es un nombre comercial real, Alberto lo dice y vuelve.**
- De paso: esa línea no estaba en los diccionarios, así que `/en` y `/it` la servían en castellano. Añadida a los dos.

### 🛑 (19/08/2026) IBKR: no era la selección, eran los stops — libro de operaciones en Supabase
- Alberto preguntó por VWCE («no para de bajar»): −594,96€, el **3,7%** de los −16.172,49€ que perdió operando
  en 2026. Sacado de IBKR por MCP; informe visual en artifact (no en repo: dato financiero personal).
- **Hallazgo:** la selección era buena, el stop era el problema. CRWV **subió 42,1%** entre su primera y última
  operación y perdió 6.369$ en 33 movimientos; SNDK +7,9% → −4.853$; RBLX +6,1% → −2.689$. Mediana de distancia
  del stop: **1,30%** (25 de 95 a menos del 1%). Confirmado en los DOS periodos: órdenes STOP −28.710$, órdenes
  a mercado **+4.487$**. Siete posiciones abiertas y cerradas el mismo día: −3.982$.
- **Regla 2 meses (art. 33.5.f LIRPF): no bloquea nada.** 23 valores cerrados del todo, ninguna recompra en los
  2 meses siguientes a su última venta. La pérdida de 2026 es compensable íntegra (4 años de arrastre).
- **Nuevo en BD:** `trading_operaciones` (libro inmutable de ejecuciones, idempotente por `(broker, trade_id)`)
  + vistas `v_trading_resumen_anual` y `v_trading_salidas`. Cargadas **455 operaciones** (oct/2025–ago/2026),
  checksums verificados contra el origen. `tipo_cambio` a NULL a propósito = «aún no consultado», nunca 1.
- **Decisión (Alberto):** el agente inversor se construye **solo para él**; expandir a terceros, más adelante.
  Motor fiscal en Supabase; los PDF del broker, en Drive. NADA de recomendar productos (sería asesoramiento CNMV).
- ⏳ **Pendiente y CADUCA:** IBKR solo sirve ~4 trimestres atrás por esta vía. Falta cargar **jul–sep/2025**
  (108 ops) y rellenar `tipo_cambio` por fecha (449 filas USD). Sin eso no hay cifra en euros defendible.
- ❓ Sin comprobar si la cuenta IBKR es real o paper: las herramientas del MCP no lo distinguen.

### 🔒 (19/08/2026) `main` NO tenía ninguna protección — ahora sí, y rompe a dos bots
- Tras el fallo de #1487 (tests rojos, mergeado igual) se miró el gate: **no había gate**. Ni branch
  protection clásica ni rulesets. El check «Ready to merge» de `ci.yml` solo hace `needs: check`
  (Lint·TypeCheck·Build) y **nunca ha mirado los tests** (viven en otro workflow, `needs:` no cruza
  workflows): era decorativo. Nada bloqueaba nada.
- Alberto creó el ruleset **«main - CI obligatorio»** (`/settings/rules/21056649`, activo, `refs/heads/main`):
  12 checks required (`Tests (packages + guardián)`, `Lint · TypeCheck · Build`, `Análisis estático`,
  y los 9 `Typecheck · <app>`), `strict_required_status_checks_policy:false` (deliberado: `main` recibe
  commits del bot cada pocos minutos y exigir «up to date» metería en bucle de re-merge). Sin required:
  «Ready to merge» ni los `Vercel – *` (salen `Ignored` según el filtro de builds). Omisión VACÍA.
- 🔴 **Efecto lateral: el ruleset bloquea los pushes directos a `main`, y hay DOS escritores automáticos
  que van directos.** (1) `auditoria.yml` empuja como `github-actions[bot]`, que no se puede poner en la
  lista de omisión. (2) El agente SEO (`apps/sivra/lib/seo-landing.ts`) hace `PUT /contents/…` **sin
  `branch`** → escribe en la rama por defecto. Ese segundo falla EN SILENCIO: la landing deja de
  optimizarse los lunes y no lo delata nada. Las rutinas normales ya acaban en PR draft, no les afecta.
- Y un TERCERO que no se vio de primeras: el propio `rutinas-automerge.yml`, en su camino de
  conflicto, empujaba el merge resuelto a `main`. Fallaba «bien» (reintenta), pero el motivo que
  imprimía era falso («main se movió») → PRs de registro con conflicto atascados para siempre.
- **Decisión de Alberto: por PR y definitivo — nada escribe en `main` salvo el merge de un PR verde.**
  (1) `auditoria.yml` abre PR en `claude/auditoria-radiografia`; su commit lleva `[skip vercel]` y NO
  `[skip ci]`, porque `[skip ci]` lo honra Actions y dejaría el PR sin checks (y el automerge, con
  razón, no mergea a ciegas). (2) El agente SEO (`pushToGitHub`, gemelo en sivra y plataforma) resetea
  `claude/seo-landing` a `main`, escribe con `branch` y abre PR. (3) El automerge acepta ahora esos
  ficheros y, en conflicto, empuja a la RAMA DEL PR con `GH_PAT_TRIGGER` — no con `GITHUB_TOKEN`,
  cuyos pushes no disparan CI y dejarían el PR sin checks del sha nuevo.
- 🪤 **Cuarta pieza, descubierta EN VIVO al vigilar el propio PR #1501: un PR puede nacer con CERO checks.**
  Empujar la rama y abrir el PR con un token de GitHub App/Actions no dispara los workflows `pull_request`
  → PR sin checks → el automerge (con razón) no lo mergea, y el ruleset tampoco deja mergearlo a mano:
  **atascado para siempre**. Le pasó a #1501 (14 checks aparecieron solo al empujar un commit más). Así
  que `auditoria.yml` empuja y abre el PR con `GH_PAT_TRIGGER`, y si falta el secret **no abre PR**: falla
  con aviso, mejor que un PR zombi. El agente SEO no sufre esto (usa su PAT fine-grained propio).
- 🔁 **Y la misma trampa, otra vez, en `main`: el merge de #1501 (`a6ef85ab`) no disparó NI UN
  workflow.** Un push a `main` hecho con el token de una GitHub App (el merge de un PR desde una
  sesión de Claude Code) no dispara nada, así que la auditoría no se regeneró y el código nuevo se
  quedó SIN estrenar. No es un fallo del arreglo — es que no llegó a correr. Por eso `auditoria.yml`
  gana `workflow_dispatch`: se puede lanzar desde la API con ese mismo token, y así ni la radiografía
  depende de que el último push lo hiciera un humano ni hay que esperar a uno para probar el workflow.
- ✅ **Probado en vivo: `workflow_dispatch` → rama → PR #1504 → 14 checks.** `GH_PAT_TRIGGER` existe
  y funciona. Pero el PR **no se mergeó**, y el porqué destapó dos fallos más (PR #1506):
- 🔴 **«Los checks que veo están verdes» ≠ «han pasado los checks required».** El automerge vio
  `10/10 en verde` e intentó mergear; GitHub: «the base branch policy prohibits the merge». **Es la
  regla del NULL un escalón más abajo:** el paso 5 miraba los checks que HAY, no los que FALTAN, y
  lo que falta no deja hueco. Arreglo: preguntar `mergeStateStatus`, que es la respuesta de GitHub
  a «¿lo dejarías mergear?».
- 🔴 **Y un merge rechazado MATABA la pasada entera.** Con `set -e`, el `gh pr merge` fallido tiraba
  el job: los PRs siguientes del bucle ni se miraban y el workflow salía rojo cada hora. Ahora se
  anota, se avisa y se sigue.
- ⚠️ **CORRECCIÓN de lo que dijo el #1506:** culpé del sha sin checks a una CARRERA de dos pasadas
  de la auditoría. **Era falso.** Re-lancé una sola pasada y volvió a pasar: **un force-push desde
  dentro de Actions a una rama que YA tiene PR abierto no dispara los workflows `pull_request`** —
  ni con el PAT en la URL. Dos de dos. Crear la rama y abrir el PR sí los dispara (14 checks). Por
  eso `auditoria.yml` estrena rama en cada pasada (`…-<run_id>`) y cierra la anterior: el PR nace
  siempre por `opened`, que es el camino que funciona. (`cancel-in-progress: true` se queda, pero
  por higiene, no porque arreglara esto.)
- 🪤 **Y el arreglo de rama-por-pasada falló a la primera, por un detalle de `gh`:**
  `gh pr close --delete-branch` borra también la rama **LOCAL** si es la que está activa. Se hacía
  `checkout -B "$RAMA"` (nombre viejo), se commiteaba, y al cerrar el PR anterior `gh` se llevaba
  por delante ese commit y dejaba el HEAD en `main` → el push subió `main` y `gh pr create` murió
  con «No commits between main and …». Arreglo: la rama local se llama YA `…-<run_id>` desde el
  principio, más un cinturón que aborta si el HEAD acaba siendo `main` (sin él, el síntoma parecía
  un `gh pr create` roto y no la pérdida del commit).
- ✅✅ **PROBADO DE PUNTA A PUNTA (23:42).** `workflow_dispatch` → rama `…-<run_id>` con commit propio
  → PR #1511 → **15 checks** → **`rutinas-automerge.yml` lo mergeó solo** (`b04de8de` en `main`,
  merged_by `github-actions[bot]`). La radiografía vuelve a aterrizar sola con el ruleset puesto.
  Costó CUATRO intentos (#1501, #1503, #1507, #1509) y cada uno destapó un fallo distinto y real.
- ℹ️ **El cron del automerge NO va al minuto :23 aunque el fichero diga `'23 * * * *'`**: las pasadas
  programadas reales caen sobre el **:46**. Al depurar, mirar los runs, no el cron.
- 🧹 Dos cabos sueltos menores: (1) la rama `claude/auditoria-radiografia-32307817350` quedó huérfana
  del run fallido — el bucle de limpieza cierra PRs, no borra ramas sin PR; (2) dos pasadas seguidas
  encadenan dos PRs (la segunda cierra el de la primera): funciona, pero mete ruido.
- ⚠️ Lo que NO se ha podido probar aquí: los workflows solo se ejecutan en GitHub. Las tres piezas se
  verifican solas en su primera pasada real — auditoría al próximo push a `main`, SEO el lunes. Si el
  PR del SEO se queda abierto sin mergear, mirar si `GH_PAT_TRIGGER` sigue vivo. Revertir todo =
  ruleset a «Desactivado».

### 🌍 (19/08/2026) `main` llegó ROJA: tocar el español de la landing sin el diccionario
- Al mergear PR #1490 saltó `Tests (packages + guardián)`. **No era mío:** reproducido sobre `origin/main`
  → `apps/housesevillana` 45/47, mismas 2 pruebas i18n. Lo rompió **PR #1487** al reescribir el copy español
  de `app/route.ts` (quitó el «hasta un 22%») **sin tocar `app/en|it/traducciones.ts`**: 7 claves huérfanas
  por idioma, justo la mina documentada en `apps/housesevillana/CLAUDE.md` (el `/en` y el `/it` se DERIVAN
  del HTML español por cadenas exactas). En vivo: esos párrafos se servían en castellano a ingleses e italianos.
- 🔴 **El gate no lo paró:** en #1487 el job de tests salió `failure` y aun así el check «Ready to merge»
  dio `success` y se mergeó. Los tests NO están en la puerta de merge — arreglarlo es un pendiente propio.
- Arreglado aquí: 7 claves nuevas por idioma con el copy nuevo traducido. Y el delator
  `'Sin comisiones de Booking'` del test ya no existía en el HTML (guarda muerta que pasaba en vacío) →
  sustituido por `'no hay comisi&oacute;n de Booking'`, verificado presente en el español.

### 📉 (19/08/2026) El aviso de Supabase NO es tuyo, pero el egress SÍ tiene mala pinta
- Recon del panel: **ninguna métrica al 100%**. La banda naranja es política fija (el período de gracia
  acabó el 10/07 y aplica Fair Use), no un límite superado. Ciclo 15/08→15/09: egress 0,599 GB de 5 GB
  (12% con 4 días), BD 166 MB de 500, EF 8.046 de 500.000, MAU 0.
- 🔴 Lo que sí importa: **spend cap activo y SIN método de pago** → si el egress llegara a 5 GB no hay
  factura, hay **corte** (402/read-only) de las 10 apps. Proyección al cierre ~4,3 GB (86%) — y esa
  proyección es de ANTES de recrear ayer los 25 crons de ia-rest (~1.500 ejecuciones/día nuevas).
- El **90-94% del egress es Shared Pooler** (Prisma), no PostgREST. Escalón el 08/08: de ~35 a ~130 MB/día
  y no baja; PostgREST clavado en 17,5 MB/día todo el escalón (o sea, no es tráfico de usuarios).
- ❌ Hipótesis descartada MIDIENDO antes de escribir el fix: `getTesoreria` lee todo el histórico sin
  filtro de fecha, pero `movimientos_bancarios` son **2.100 filas / ~97 kB** — acotarlo no ahorra nada.
- Medido: los 3 roles Prisma juntos devuelven **~37.500 filas/día** (~10 MB), un orden de magnitud por
  debajo de los 125 MB/día facturados. Luego el egress del pooler **no lo hacen los resultados**: apunta a
  overhead de conexión (4,5 M llamadas en 115 días). Sin confirmar: hace falta el gráfico de conexiones.
- **DECISIÓN de Alberto (19/08): no se paga Supabase hasta tener cliente; se retoma si hace falta.** Contexto
  para cuando toque: el trasvase de la **correduría de Manuel Suárez (~200 MB)** deja la BD en ~366 MB de 500
  (73%). Hay 57 MB de grasa recuperable sin tocar negocio — `trading_backtest` 30 MB/1.029 filas (blobs JSON)
  y `rate_snapshots` 27 MB/87.685 filas —; podándolas la correduría entraría al ~60%. El límite que aprieta
  NO es el disco sino el egress, y ese trasvase ES el cliente que activa la regla de pagar.

### 🔑 (19/08/2026) Repos sueltos: nada que unir — y la `service_role` filtrada sigue viva
- `house-sevillana-landing` ya está dentro (`apps/housesevillana`, 12/08). VERIFICADO en Vercel: el proyecto
  apunta a `central` con Root `apps/housesevillana` y el último deployment de prod sale del commit del
  agente SEO (`79db75e`, hoy) → el repo suelto es cáscara muerta. `Cloude`: 1 commit, README placeholder.
  🛑 **CORREGIDO el 20/08 (ver entrada arriba): eso era solo su `main`. `Cloude` tiene 2 PRs draft con
  el proyecto NIVELA — NO borrarlo.**
- El landing lo borra Alberto a mano (destructivo). Borrar quita la exposición pero **NO invalida la clave**.
- Nuevo `docs/ROTACION-SERVICE-ROLE.md`: inventario + plan. El proyecto ya tiene claves nuevas
  (`sb_publishable_…` conviviendo con la `anon` legacy) → camino limpio sin tocar el JWT secret.
- 🔴 Recon del panel: **las legacy NO se desactivan por separado** — un solo botón «Disable JWT-based API
  keys» mata `service_role` Y `anon` a la vez. Así que la rotación arrastra también los 27 ficheros que
  leen `ANON_KEY`, no solo la cara service_role (2 envs Vercel: ia-rest y central-rrhh + 43 de 45 EFs).
  `ialimp` NO tiene la variable: su `storage-limpiadora.ts` lleva roto desde el 12/08, no rotando.
- `sb_secret_…` y `sb_publishable_…` (`default`) YA existen → no hay que tocar el JWT secret. Pendiente: 2
  PRs (43 EFs + 27 clientes), cron `monitor-health` a cabecera `apikey`, y pulsar el botón. Hasta ahí la
  clave filtrada sigue viva.
- 🟠 Aparte: el panel avisa «período de gracia finalizado» en plan **Free** sobre la BD compartida de todas
  las verticales. Comprobado por MCP: org en `free`, proyecto `ACTIVE_HEALTHY`, BD 151 MB de 500 → la cuota
  que se agota NO es almacenamiento (será egress/MAU/compute, invisible por MCP). Mirar Organization → Usage.
- 🧪 En vez de migrar las 43 EFs a ciegas: **piloto en `ia-training-dashboard`** (solo lee, PIN,
  `verify_jwt=false`). La doc de Supabase se contradice sobre si `supabase-js` con `sb_secret_…` sigue
  hablando con PostgREST (manda la clave también en `Bearer`), y eso decide el enfoque de las otras 42.
  Se prueba abriendo `?pin=9999&api=1` tras desplegarla. Sin `config.toml` en el repo: el `verify_jwt` de
  cada función se toca a mano en el panel, no viaja en el PR.
- **MERGEADO a `main` (PR #1490)** tras suite completa en verde: `pnpm test` exit 0, **2.479 tests de
  `node --test` + 107 de vitest, 0 fallos** (incluye el guardián 32/32). Conflicto con `main` resuelto
  conservando las entradas de memoria de ambos lados. `docs/ROTACION-SERVICE-ROLE.md` registrado en
  FUENTES-DE-VERDAD como **pendiente abierto**, para que la auditoría lo vigile hasta que la clave muera,
  y el aviso (clave viva + las dos trampas: botón único de desactivación y `apikey` ≠ `Bearer`) va también
  en la skill `central-maestro`, que es lo que se lee ANTES de tocar la BD compartida.
### 🔑 (19/08/2026) El 403 del panel SEO era el REPO, no el permiso — y dos «verdes» que mentían — PR #1494
- `/api/seo-refresh` daba «Resource not accessible by personal access token»: el PAT tenía
  `Contents: R/W` pero en «Repository access» solo estaba `house-sevillana-landing`, no `central`
  (donde vive la landing desde el 12/08). Arreglado por Alberto; PAT rotado, caduca el 19/08/2027.
- Sonda `sondearEscritura()` + botón «🔑 Probar acceso a GitHub» en `/sivra/seo`: PUT con sha
  imposible → 409 = puede escribir. **Un GET no valida NADA** en repo público (200 con cualquier
  token); por eso el panel decía «ok» con un token que no podía commitear. Tres estados, nunca verde por defecto.
- Mismo patrón en `redeployProjectProduction`: daba «✅ redesplegado» con el deploy en `BUILDING`, y
  metía `withLatestCommit` (reconstruía OTRO commit). Ahora `clasificarEstadoRedeploy` + «sin confirmar».
- El rojo de `main` por las claves i18n huérfanas lo arregló otra sesión en paralelo (#1495); mi PR
  #1496 se quedó en duplicado. **Dos sesiones sobre el mismo repo: mirar `origin/main` antes de arreglar.**

### 🧪 (19/08/2026) Las guardas i18n de House pasaban EN VACÍO
- Al reescribir el copy desapareció «Sin comisiones de Booking», que era uno de los *delatores*
  de `traducciones.test.ts`. Un delator que ya no está en el HTML no puede sobrevivir a
  `traducir()`: la aserción pasaba sin mirar nada. Otra sesión lo cambió por una frase viva
  (PR #1490) — pero eso se vuelve a pudrir al siguiente cambio de copy.
- Arreglo de fondo: cada recorrido comprueba ahora que **encontró algo** (delatores vivos en el
  HTML; ≥10 anclas y ≥5 ids en `anclas.test.ts`). `enlaces.test.ts` ya lo hacía y sirvió de patrón.
  Verificado por mutación: cambiar un delator por una frase inexistente pone el test rojo.
- Es la regla de «dato que no hay ≠ dato que no se ha mirado» aplicada a los tests. 50/50 y
  32/32 en las guardas raíz. Anotado en `apps/housesevillana/CLAUDE.md`.

### 📸 (19/08/2026) La portada de House era una escalera (y el alt decía «fachada»)
- Lo vio Alberto, no el repaso de diseño: **ninguna sesión puede ver las fotos** de la landing
  (Drive/`lh3.googleusercontent.com` bloqueados por egress; el conector de Drive lista pero
  `read_file_content` da vacío para JPEG). Rendericé con marcadores de color y di el repaso por
  bueno igualmente — ese fue el fallo.
- Portada → **salón** (elección de Alberto sobre las 115 fotos de la carpeta de Drive), encuadre
  centrado, y `alt` que dice la verdad. La galería pierde el salón (ya está arriba): queda patio
  grande + dormitorio, cocina y escalera, rejilla a 4.
- ⚠️ Pendiente: Alberto quiere **una foto de Sevilla**; no hay ninguna en Drive y no se genera ni
  se licencia stock sin su OK.
### 🔢 (19/08/2026) La nota de House era vieja — y la skill de SEO tiene la ficha de OTRO piso
- Nota real por el conector de Booking: **8,6/10 con 51 reseñas**. La landing decía 8,1 con +47
  (dato de hace meses) y el bloque borrado hoy decía 9,2/4,9 (inventado). Aplicado en hero y barra
  de confianza + claves i18n. **Nada lo refresca solo:** al tocar la landing, contrástalo.
- **Origen del lío de la dirección:** `seo-house-sevillana` tiene el **ID de Booking `4771238`, que
  es Busto Reform** (el de House es `2039943`), y con él arrastra Bustos Tavera 22 y sus coordenadas.
  Parche exacto (7 sitios + teléfono sin rellenar) en `docs/PARCHE-skill-seo-house-sevillana.md`.
  Las de House: **37.395904, -5.987431**.
- ⚠️ **Booking anuncia «Admite mascotas» y la web dice que NO.** Decisión de Alberto; no toqué ninguna.
- Los minutos a pie siguen sin medir: el egress bloquea Nominatim, OSRM y demás APIs de mapas.
### 🎨 (19/08/2026) Repaso de diseño de la landing de House Sevillana
- **Dos secciones colgaban POR DEBAJO del `<footer>`** con estilos inline ajenos a la paleta:
  unas reseñas duplicadas (y contradictorias: 9,2/10 + 4,9/5 frente al 8,1/10 del resto) y la
  barra de enlaces SEO en grises #1a1a1a/#2d2d2d. Reseñas duplicadas fuera; enlaces reescritos
  como bloque «Sigue leyendo» con los tokens de la casa, ya ANTES del pie.
- Emojis → SVG de trazo (un emoji lo pinta el SO: ni se tiñe ni se ve igual en cada móvil).
  Hero con overlay de 3 capas (se ve la casa) y zoom lento; FAQ a dos columnas en escritorio
  (media pantalla estaba vacía); la tarjeta de datos ya NO se oculta en móvil; `prefers-reduced-motion`.
- **Dirección resuelta (Alberto, 19/08):** House es **Calle Socorro 24, 41003, barrio de San Julián**
  (Casco Antiguo) — la landing lo tenía BIEN. `Bustos Tavera 22` son OTROS dos pisos (Luxury Busto /
  Busto Reform). Quien lo confunde es la skill `seo-house-sevillana` (ficha, keywords y los DOS JSON-LD
  con `streetAddress`): vive fuera del repo, la corrige Alberto. Fijado en el CLAUDE.md raíz.
- `/barrio` reencuadrada (decide Alberto): mantiene la keyword «Macarena» pero sitúa la casa en San
  Julián, «la puerta de la Macarena». Fuera los minutos que salían de suponer la casa DENTRO del
  barrio (la Basílica no está a 5 min); solo quedan los que ya declara la portada.
- **Nuevo `apps/housesevillana/CLAUDE.md`** (no tenía): dirección, la trampa de i18n (EN/IT se
  DERIVAN del HTML español por cadenas exactas → tocar un texto rompe su traducción), el agente SEO
  que reescribe el fichero los lunes, y el sistema de tokens/iconos. Fila en FUENTES-DE-VERDAD.
- **Punto ciego cerrado:** las skills SINCRONIZADAS (`/root/.claude/skills/synced/`) no están en git
  y NADIE las reconciliaba — por eso el error de dirección llevaba ahí desde siempre. `/auditoria-diaria`
  contrasta ahora sus datos duros y avisa por Telegram (no se pueden auto-aplicar); listadas en `docs/SKILLS.md`.
- Mergeado a `main` (PR #1491, 47/47 + guardián 32/32). ⚠️ Sin resolver: la nota real (8,1 vs 9,2/4,9),
  los minutos a Basílica/Muralla/Mercado/Alameda desde Socorro 24, y corregir la skill sincronizada.
### 📋 (19/08/2026) Inventario de ofertas Booking — House hecho, 3 pendientes
- Nuevo `docs/BOOKING-OFERTAS-INVENTARIO.md`: inventario extranet por piso (Claude Chrome, solo
  lectura) previo a decidir la Fase 3. House: Basic Deal 12% (⚠️ activada 18/08, origen por
  confirmar) + Genius 15% + móvil 10% + 3 tarifas país −10% (solo No reembolsable) → peor caso
  −39,4%. Preliminar: quitar tarifas país, mantener el resto; Genius nivel 3 NUNCA.
- Dúplex (parcial, faltan Genius y planes): solo 2 ofertas (móvil 10% — 80 reservas/38.319,10€ en 12m —
  y una «estándar 8%» que en realidad descuenta 12%), SIN tarifas país → apilamiento −20,8% conocido.
  Booking sugiere ahí UK rate (0% vs 9% zona) y last-minute deal (ya lo hace el motor, no duplicar).
- Luxury (parcial): 2 ofertas (móvil 10% — 121 reservas/42.644,51€ — y «estándar 8%» que aquí SÍ es 8%;
  el mismo nombre descuenta distinto en cada piso). Apilamiento −17,2%. 🆕 Booking dice que el viajero
  UK paga 161€ vs nuestros 126€ (~1,3×) → **da la vuelta a la idea de quitar las tarifas país**: el −10%
  compra un segmento que paga 30% más. Pendiente de comprobar con datos propios antes de tocar nada.
- 🚩 La antelación de los avisos de Booking NO cuadra con `incomes` (Luxury 81d vs 23d real, Dúplex 53
  vs 16). Causa no confirmada (¿canceladas?, `reservas_canceladas` vacía hasta 12/08). No crear
  last-minute deal por ese aviso: el motor ya usa la antelación real.
- Busto Reform: igual que Luxury (móvil 10% con 69 reservas/23.343,14€ + «estándar 8%»), −17,2%.
  🚨 Su panel muestra un ratio ROTO (2^63) por dividir entre cero: «Tú 0€ / 0 noches» de UK no es un
  valor, es que NO tiene reservas UK. Los «Datos clave» de la extranet valen como pista, no como cifra.
- **Veredicto FINAL: no tocar nada.** (a) La Fase 3 del estudio ya estaba hecha — los 4 pisos tienen
  su oferta de escaparate (8-12%) desde el 16-18/08. (b) La móvil es la palanca del negocio: 340
  reservas y 218.794,79€ en 12m entre los 4. (c) EEA country rate de House trae 7.094,51€ reales →
  se queda; UK/US llevan 0 reservas en 6 meses pero **no suben el apilamiento**, así que quitarlas no
  da euros. (d) Genius nivel 3 (20%) nunca.
- 🔧 **Dos errores propios corregidos en el doc:** la tabla de apilamiento comparaba House (con su
  Genius y plan conocidos) contra los otros 3 (sin ellos) → los 4 están en la misma banda, no había
  piso «desmadrado»; y las tarifas país NO aumentan el descuento máximo (Booking aplica solo la mayor
  de cada categoría y la móvil ya la ocupa), así que mi «quitarlas para recuperar margen» era falso.
- Pendiente sin bloquear: Genius/planes de Dúplex, Luxury y Busto. 3ª métrica del panel descartada
  (antelación de House: 84d dice Booking vs 42d real).

### 🔧 (19/08/2026) El canal directo YA está bien de precio — y dos correcciones mías
- El «descuento de larga estancia» del motor de Smoobu **no es de larga estancia**: 20% desde 2
  noches / 30% desde 7 / 40% desde 30, iguales en las 4 propiedades, sobre base (no sobre limpieza).
  Y **la estancia mínima del calendario son 2 noches** → es un **−20% permanente al canal directo**.
- Con la comisión de Booking **medida** (19,72%, `amount/amount_gross` sobre 1.322 reservas) y el
  ratio pagado/base de Booking en estancias de 2-6 noches (**0,976**, n=16): el huésped paga **~18%
  menos** reservando directo y a Alberto le queda **lo mismo** (0,788 vs 0,784). Nada que tocar.
- **Dos errores míos corregidos el mismo día:** (1) dije que la web era ~12% más cara — supuse
  1,00 × base sin medirlo; (2) dije ~9% más barata y comisión ~17% — venía de n=7 (0,88) frente a
  n=16 (0,976). Un n=7 es intuición, no medición, y la regla del «dato no mirado» aplica al lado propio.
- `DIRECT20` creado y **borrado** el mismo día (id 166126): sobraba. `FRIENDS` (id 1140) intacto.
- Pendiente, decisión de Alberto: copy de la landing con número («~18% menos») o sin él.
### 🏷️ (19/08/2026) Tres centinelas del canal — y el primero destapa que ESTAMOS CAROS
- **Validación FUERA de muestra** (`validarCanal`): el R² del ajuste es circular (mide la recta
  contra las ventanas que la produjeron). Ahora `pricing_escaparate.usada_en_ajuste_at` marca lo
  consumido y la pasada siguiente juzga la recta VIGENTE contra las ventanas nuevas. Probado con
  las 16 reales: los parámetros viejos (×1,20) salen `desviado` (sesgo +8,4%) y los medidos `ok`.
- **Centinela del precio al HUÉSPED** (`pricing-precio-huesped.ts`): el motor razona en BASE y con
  cuota fija eso ya no describe lo que se paga. En House, 597€/estancia son 299€/noche que el motor
  no ve: puede estar en su `min_price` y listar un 78% sobre mercado. Añade `baseDondeLaCuotaMandaya`
  (House: 331€; por debajo, bajar la base ya no abarata la noche).
- 🚨 **Lo que ha encontrado al estrenarlo:** el precio al huésped está muy por encima de la mediana
  de SU mercado. **Busto Reform ×2,18** (mes a mes: 1,4-3,0×; ocupación 90d **11%**) y **House ×1,88**
  (ocupación 25%). Duplex 1,06× y Luxury 1,10×, sanos. Descartado que sea artefacto: comps al mismo
  aforo (`pricing_factor_aforo(2,2)=1`), 30-270 comps/mes, y Busto NI SIQUIERA tiene suelo PL.
  **Decisión pendiente de Alberto: por qué el motor no baja Busto y hasta dónde bajarlo.**
- **Canal por PORTAL** + cobertura contada en euros: la recta es de Booking, que es el 92-99% del
  bruto de los cuatro (Airbnb 1,0% House / 2,1% Luxury). El hueco queda declarado, no supuesto.
- ❌ **`position_factor` de House NO se sube a 1,23.** El «6/6 reservas sobre el p50» era sesgo de
  supervivencia: la ocupación realizada de House es la más baja de los cuatro (47% a 12 meses) y ya
  lista al 1,88× del mercado. Subir sería ir en la dirección contraria a lo que dicen los datos.
- PR #1484.

### 🗄️ (19/08/2026) Unificación Supabase CERRADA — un solo proyecto, ya renombrado a «central»
- Alberto pidió unir los 2 proyectos Supabase. Hallazgo: el flip de junio SÍ se hizo (viejo congelado
  desde jun, compartida con escrituras vivas — la nota "split-brain 12/07" estaba desfasada), pero el
  cierre quedó a medias: 5 EFs desplegadas al proyecto VIEJO tras el corte (qr-assistant daba 404 en
  prod), los 25 crons sin recrear, y Realtime del KDS sin publication (solo preavisos).
- Cerrado: 5 EFs redesplegadas + 45 fuentes versionadas, 25 crons recreados (migr. 20260819), Realtime
  +9 tablas, ~1.390 filas valiosas copiadas por pg_net (leads/CRM/training/stripe_events), crons del
  viejo apagados (0), refs de repo/skills/MATRIZ corregidas. PR draft de la rama claude/unificar-supabase-*.
- CERRADO 100%: proyecto viejo PAUSADO, webhook Stripe repuntado (conector MCP), proyecto renombrado a
  «central» (Claude Chrome), y monitor-health-cron reescrito con la ANON key (verify_jwt acepta cualquier
  JWT válido) → app.service_role_key ya no hace falta en ningún sitio. MONEI: DESCARTADO — Alberto decide quedarse solo con Stripe para cobros (19/08); su webhook da igual.
- REMATE: PR #1483 mergeado a main y proyecto viejo `efncqyvhniaxsirhdxaa` BORRADO del todo por Alberto
  (19/08, verificado con list_projects: solo queda `central`). Sus 27 archivos demo de Storage y el
  histórico demo de mayo se fueron con él, asumido. Ya NO existe "el proyecto viejo": todo es `central`.

### 📐 (19/08/2026) El canal NO es un markup: es una recta — y ahora se mide y se corrige SOLO
- Medido el escaparate real de los CUATRO pisos con el conector (16 ventanas): el canal multiplica por
  **menos de 1** (~0,9) y **suma una cuota fija por estancia** (limpieza: 597€ en House). Un «markup»
  escalar no existe — el mismo piso medía ×1,33 a 2 noches y ×1,18 a 3 sin cambiar nada. Modelo afín
  `escaparate = m × base + F` en `lib/sivra/pricing-canal.ts`; el motor lo invierte por noche.
- El ×1,20 supuesto desplazaba TODAS las fechas: a 1.500€/noche pedía 1.250€ de base (correcto ~1.333)
  y al precio típico de House pedía 568€ cuando tocan 425€. Cableado en apply/engine/ancla/premio/
  pilot-track (`fijoNoche` OBLIGATORIO) y quitadas las guardas `markup >= 1`, que tiraban lo medido.
- **Ya no espera a nadie:** `/api/sivra/pricing/canal` (cron 07:45) ajusta y REESCRIBE `channel_markup`
  + `cuota_fija` + `noches_ref`, acotado a ±15% de efecto/pasada, con interruptor `canal_auto` y latido
  `sivra_canal`. Y el plan (`/mercado/plan`) pide ya las ventanas propias eligiendo las que dan
  RECORRIDO de precio (sin él, m y F son indistinguibles) → la rutina de Booking las mide sola.
- `ANUNCIOS_PROPIOS` solo tenía House; añadidos los 4 nombres de portal. ⚠️ **Corrijo lo que dije
  al mergear:** afirmé que Busto/Luxury/Dúplex «llevaban entrando como comparables de sí mismos» y
  al verificarlo contra `market_rates` **no había ni una fila** (2.746 comps, 833 nombres, ninguno
  propio). El riesgo era real y ahora está tapado, pero NO se materializó. Lo afirmé sin mirar.
- 🔗 **Encaja con el hallazgo de Smoobu de hoy (entrada siguiente), no lo contradice:** ese +20% por
  canal vive DENTRO de Smoobu, así que ya está incluido en lo que mide el conector. Y ojo a las
  unidades: `0,92 efectivo/base` es lo que COBRAMOS (tras comisión); esta recta es lo que PAGA el
  huésped. Son dos ratios distintos y no se pueden comparar entre sí.
- PR #1478 (draft). **Nada de esto corre hasta que se mergee y despliegue.**

### 🚨 (19/08/2026) El +20% de Booking YA EXISTÍA en Smoobu — Fase 2 (channel_markup) CANCELADA
- Claude Chrome verificó Smoobu (Precios→Ajustes): el ajuste por canal es ÚNICO por portal (no por
  alojamiento) y **Booking.com ya estaba a +20,00%** (resto de canales 0%) — probablemente de la era
  PriceLabs. Push forzado con «Sobrescribir precios» (no «Guardar»). El rótulo «Sobrescritos por
  PriceLabs» de Smoobu es etiqueta legacy: PL de baja 09/08, 604/604 escrituras probadas del motor.
- **Consecuencia: NO aplicar `channel_markup=1.20`** — la mediana 0,92 efectivo/base medida el 09/08
  YA incluía ese escaparate (el huésped paga ~0,77 del precio MOSTRADO en Booking); cambiar el motor
  ahora bajaría los precios reales ~17%. El escaparate del estudio ya está puesto; condición cumplida.
- Fase 3 en pausa: inventariar ofertas activas en la extranet ANTES de añadir ninguna (con ~23% de
  descuentos ya apilados, añadir un 10-15% probablemente sobra). IDs extranet: House 2039943 ·
  Dúplex 2888928 · Luxury 4340072 · Busto 4771238.

### 🩺 (19/08/2026) psd2-health-check — feed sano, sin anomalías
- Preflight canal alerta OK (200). Frescura `movimientos_bancarios WHERE origen='psd2'`: último
  movimiento 17/08 (2 días, dentro de umbral 48h); mov_30d=63 vs mov_30d_prev=71 (caída ~11%,
  bajo el umbral del 50%). Estado ✅ OK — sin aviso Telegram. PR #1481 (draft, solo
  `docs/AGENTES-BITACORA.md`). Sin pendientes.

### 🔍 (19/08/2026) Auditoría diaria (ligera) — todo sano, sin carril 2
- Rango: 12 commits desde la última auditoría (2026-08-18), todos ya autodocumentados por PR
  (curva de trading, compra VWCE, verificación PSD2, mercado-booking). Heartbeat de 24 huellas
  (12 latidos `agente_latidos` + 12 tablas de dominio) **24/24 ✅**, sin crons mudos. Backlog de
  PRs de rutinas: 1 abierto (#1478, draft de código, <24h) — fuera del alcance del automerge,
  sin envejecer; `rutinas-automerge.yml` vivo (run hace <1h, success).
- Integridad estructural sin hallazgos (lockfile, guardián 32/32, `ignoreCommand` en las 10 apps,
  `transpilePackages` sin huecos). Sin drift nuevo en skills/docs (32 skills, sin contradicciones
  de reglas permanentes). Único arreglo: `docs/AUTO-APLICADOS.md` tenía 2 entradas del 18/08 mal
  insertadas en medio del párrafo de intro — reordenadas.
- «Estado vivo» sigue al día desde el 18/08, sin pendientes nuevos que anotar. Sin manuales que
  tocar (la única UI nueva del rango, la curva de `/trading`, es de plataforma).

### 🎄 (18/08/2026) La Navidad de House no la tarificaba NADIE — y `price_ours` volvió a engañar
- Reserva 21-25/12 a 892€/noche (84% de la base). Al mirarla leí `rate_snapshots.price_ours`, que es la
  fórmula sombra LEGACY: dije 334-462€ cuando el precio real era 860-1.247€. **Corregido en el esquema**
  (COMMENT en las dos columnas + vista `v_precio_vivo`): el aviso solo vivía en un comentario de TS.
- Hallazgo: del 17/12 al 05/01 el motor NO ha escrito NUNCA (ni un dry-run). Los precios están congelados
  desde el 10/08 (última curva de PriceLabs) y solo los sostiene la guarda de outlier, que deja de
  proteger a 30 días vista — y el suelo PL caduca el 08/12.
- Causas: (a) el barrido muestreaba SOLO la 1ª quincena (4º martes ahora) y la cola de eventos iba por
  cercanía, así que Navidad nunca se medía (reserva de alto valor en `planDeVentanas`); (b) 27-30/12 no
  tenían factor pese a ser el bloque más caro tras Nochevieja (medido: ×1,40 y ×1,85 vs diciembre normal);
  (c) `channel_markup` 1,20 supuesto contra 1,10 medido en el escaparate real → nueva tabla
  `pricing_escaparate` + `/api/sivra/pricing/markup` (avisa, no aplica solo); (d) `incomes` no guardaba
  el aforo (ya sí: `adults`/`children`).
- Sembrados 30 comps reales de Navidad (fuente `manual`) y las mediciones del escaparate. PR draft.
- **Pendiente de tu decisión:** House vende a **1,23× la mediana de su bucket** (6/6 reservas por encima)
  y el motor apunta al p50 con `position_factor` 1,00 → apunta corto por diseño.

### 📈 (18/08/2026) Gráfico de evolución de la cartera REAL — antes no había pasado que dibujar
- Alberto pidió ver la evolución del núcleo. Hallazgo: NO existía histórico — `trading_cartera_real` es
  una foto que se REEMPLAZA cada pasada y `broker_saldos` una fila que se pisa; un gráfico habría tenido
  un punto. Primero hay que grabar la serie.
- Nueva tabla `trading_cartera_real_track` (aplicada): un punto por día y DIVISA (nunca se suman),
  la escribe `POST /api/trading/cartera` (best-effort, devuelve `track`/`trackError`). Curva SVG
  server-rendered en `/trading`: valor de mercado vs línea discontinua de lo invertido.
- Honestidad de datos: <2 puntos → se dice que la curva arranca mañana; puntos parciales o sin valor se
  DECLARAN y el área no se sombrea si falta algún coste; fallo de lectura ≠ «aún no hay puntos».
- Verificado: 1.254 tests ✅, tsc 0, next build OK. Módulo puro `lib/trading/cartera-track.ts` (8 tests).

### 📧 (18/08/2026) facturas-correo — hueco nuevo: Vercel/Anthropic sin archivar desde abril
- Pasada normal sin novedades de Gmail (Vía B sana, sin backlog, Paso 4.0 limpio). Al investigar
  por qué Vercel/Anthropic no salían nunca en `facturas_drive`, encontré que llevan desde **abril**
  con cargos en banco (auto-clasificados `seguros`) sin factura archivada — invisible al Paso 4.0
  porque mira el caso contrario (factura sin cargo). Archivé y concilié los 2 de agosto; quedan
  **11 cargos abril-junio (~1.013€)** sin PDF a mano (rotado de `_buzon_pdf`) — detalle en
  `docs/AGENTES-BITACORA.md`. Pendiente: decidir si backfill dedicado o se deja así.
- Detalle completo, incluido el fallo propio (sobreescribí un `factura_ref` existente sin leerlo
  antes), en `docs/AGENTES-BITACORA.md` (entrada 18/08 facturas-correo).

### 🔍 (18/08/2026) Auditoría diaria (ligera) — todo sano, sin carril 2
- Rango: 39 commits desde la última auditoría (2026-08-16), casi todos ya autodocumentados por PR
  (disciplina de memoria excelente estos días). Heartbeat de 23 huellas (12 latidos `agente_latidos`
  + 11 tablas de dominio) **23/23 ✅**, sin crons mudos. Backlog de PRs de rutinas: **0 abiertos**
  (los 3 del 16/08 ya mergeados) — nada que vigilar del automerge hoy.
- Integridad estructural: lockfile presente, `ignoreCommand` correcto en los 10 `apps/*/vercel.json`.
  `docs/SKILLS.md` reconciliado contra las 32 skills de `.claude/skills/` (sin huérfanos ni
  faltantes). `apps/almacen` sigue sin `CLAUDE.md`/fila en `FUENTES-DE-VERDAD.md` — ya declarado
  correctamente como pendiente en `MATRIZ.md`, no es drift nuevo.
- Reconciliado el bloque «Estado vivo» (fecha 16/08→18/08): 2 pendientes cerrados con su desenlace
  real — pricing Booking (Genius/NR/oferta ya ejecutados en extranet + `channel_markup=1.20`
  verificado) y el PASO 0 del trigger de trading (estrenado 17/08: repesca salvó la pasada, disparo
  primario sigue fallando 2/2 — a vigilar, no bloqueante). Sin manuales de usuario que tocar (ningún
  cambio del rango es feature visible en `apps/ia-rest`).

### 🔴 (19/08/2026) El panel de secretos cantaba «✅ redeploy lanzado» mientras el build moría
- Salió rotando el `GITHUB_TOKEN` (ver entrada siguiente): el panel dijo OK, pero el redeploy de
  plataforma acabó en **CANCELED** y el valor nuevo NO llegó a runtime — Alberto tuvo que redesplegar
  los dos proyectos a mano. Es el landmine que el PR #1236 daba por cerrado, reaparecido por otra vía.
- **DOS causas que se suman.** (1) El sondeo salía con `break` al ver **BUILDING** y devolvía `ok:true`;
  pero el Ignored Build Step corre DENTRO del build, así que BUILDING es el estado ANTERIOR a la
  cancelación: se declaraba éxito en la antesala del fallo. (2) El redeploy iba con
  `withLatestCommit:true`, o sea pedía el ÚLTIMO commit de `main` — casi siempre el de la auditoría con
  `[skip ci]`, que `vercel-ignore-build.mjs` salta SIEMPRE por asunto. Pedía justo lo que el filtro
  tiene orden de cancelar.
- **Fix:** sin `withLatestCommit` (se redespliega el commit del último deployment que SÍ construyó, que
  por construcción ya pasó el filtro) y el sondeo solo termina en READY / CANCELED / ERROR; si se agota
  el presupuesto con el build en marcha devuelve **`sinConfirmar`**, que el panel pinta 🟠 y NO verde.
  `clasificarEstadoRedeploy` puro + 5 tests. Lección: no des por bueno el estado que precede al fallo.

### ✅ (19/08/2026) SEO housesevillana RESUELTO — al PAT le faltaba el REPO, no el permiso
- El 403 del cron del 17/08 se cerró hoy. Diagnóstico con evidencia, no suposición: `secrets_audit` decía que
  la única escritura de `GITHUB_TOKEN` fue el **03/08** (antes de unificar la landing el 12/08) y la API que
  `central` es **público** (`private:false`) — de ahí que el GET colara y solo fallara el PUT.
- La causa fina: el PAT `seo-housesevillana-panel` YA tenía `Contents: Read and write`; lo que le faltaba era
  tener `albertosuarezgutierrez-gif/central` en *Repository access* (solo listaba el repo externo viejo).
  Alberto lo editó sin regenerar → mismo valor, sin re-pegar en `/operador/secretos` ni redesplegar.
  **Verificado de punta a punta:** commit `79db75e` `chore(seo): actualización automática [2026-08-19]`.
- Repo (PR #1488): botón **🔑 Probar acceso a GitHub** en `/sivra/seo` + `sondearEscritura`/`clasificarSondeo`
  en los DOS `seo-landing.ts` (PUT con sha imposible: 403 = sin permiso, 409 = puede escribir; nunca escribe)
  y rutas `/api/sivra/seo-token-check` (plataforma) y `/api/seo-token-check` (sivra — el token del cron del
  lunes, que tiene su propia copia). 3 estados, solo el 409 se pinta verde. Corregida la nota estale de
  `SECRETS_REGISTRY` que aún citaba el repo viejo.
- **Sondeo estrenado en verde (18:47):** ✅ HTTP 409 en producción, sin escribir nada (el último commit de
  la landing siguió siendo el refresh de las 18:33). Confirma en vivo la premisa sobre la que se construyó,
  que hasta entonces era solo documentación de GitHub: **el permiso se valida ANTES que el sha**.
- **PAT rotado y saneado esa misma tarde:** ahora cubre SOLO `central` y **caduca el 19/08/2027**
  (poner caducidad obliga a regenerar: no hay campo editable en un fine-grained ya creado). Vive solo en
  los envs de Vercel de sivra y plataforma. Verificado con el sondeo tras la rotación: ✅ 409.

### 📈 (17/08/2026) Estreno del doble disparo de trading: la repesca SALVÓ la pasada — el disparo de las 20:15 murió OTRA VEZ
- Check-in nocturno: el disparo de las 20:15Z no dejó NI UNA huella (2º fallo igual que el 14/08). La
  repesca de las 23:15Z hizo lo diseñado: PASO 0 no vio huella → pasada COMPLETA (saldo 23:16, latidos
  analizar 23:36 / puntuar 23:37, `trading_pasadas` 17/08 con `analizar=1` — sin duplicado).
- Conclusión: la red de seguridad funciona, pero el disparo primario ha fallado 2 de 2 lunes/viernes —
  ya no parece transitorio. Avisado Alberto: si se repite, abrir ticket a soporte de claude.ai (la Rutina
  es de la UI, no editable por MCP). Cron semanal paper-tracker (10:00Z, 1º con digest #1424): verde.

### 🔑 (17/08/2026) SEO housesevillana: push 403 — el PAT quedó atrás en la unificación de la landing
- El cron `/api/seo-refresh` (lunes 10:00 UTC, primero tras unificar la landing el 12/08) falló al
  commitear: `403 Resource not accessible by personal access token`. Causa: los `seo-landing.ts`
  apuntan ya a `central`, pero `GITHUB_TOKEN` es el PAT del 03/08 scoped SOLO al antiguo repo externo
  `house-sevillana-landing`. El GET no delató nada porque `central` es público; solo el PUT falla.
- **PENDIENTE de Alberto (ops):** crear/re-scope del PAT con `contents:write` sobre
  `albertosuarezgutierrez-gif/central` y guardarlo en `/operador/secretos` (write-through sivra+plataforma).
- Repo: pista de diagnóstico en el 403 de ambos `pushToGitHub` + corregida la nota estale de
  `apps/sivra/CLAUDE.md` que aún citaba el repo externo. **PR #1470 MERGEADO** (tests seo-landing 8/8,
  previews sivra+plataforma OK); landmine añadido a la skill `sivra-maestro`. El cron seguirá en 403
  hasta que se rote el PAT — verificación real: botón manual de `/sivra/seo` o el cron del lunes 24/08.

### 💳 (17/08/2026) Check 7 cuadre tarjetas: falso 🔴 tras cada liquidación, arreglado
- Alberto: «los movimientos de 2.013,37€ los he pasado varias veces, ¿lo vuelvo a subir?». No: el
  desglose de julio de la ****0300 SÍ estaba (94 compras). El check exigía el espejo `PAGO RECIBO`
  del mismo día, que ABRE el extracto del mes SIGUIENTE (landmine PR #1300) → 🔴 durante ~un mes
  aunque el desglose estuviera. Y pedía «el extracto de agosto» cuando lo que faltaría es JULIO.
- Fix: sin espejo, valen las compras del mes del CICLO en la cuenta `TARJETA-KUTXA-<últ.4>`;
  veredicto 3 estados en `lib/cuadre-tarjetas.ts` (puro+tests; sin PAN = «no puedo comprobarlo»).
  SQL validado contra BD real (0300 → ✅, 0302 → 🔴 julio). La ****0302 de Pilar sigue faltando.

### 🧊 (17/08/2026) Cohorte 3 DOBLE congelada (H5) + primer contraste forward vs retrovisor
- PR #1460 **MERGEADO y verificado en prod**: cohorte 3 DOBLE en `COHORTES_PAPER` según H5 —
  `2026-08-17.v1` (combinada sp500, 25 valores, con `simbolosBase`) + `2026-08-17.factores.v1`
  (factores-solo: SNDK/BKNG/MU/WDC/NLY/STX/CMCSA/MOH/VICR/UMBF). `/seleccion` sp500 sirve
  `simbolosFactores` (verificado = cesta congelada) y `/paper` mide 4 cohortes (las 2 nuevas a 0d,
  `resultado null` correcto). Skill `trading-analista` + pre-registro (H5 ejecutada) actualizados.
- Contraste forward (~28d) vs retrovisor: NI confirma NI desmiente — alpha mediano −1,65 pp (cohortes)
  / −2,22 pp (radar, 0/1 ventanas), zona de ruido declarada a 28d; nada del pre-registro evaluable
  hasta ~91d (~oct). Doc: `docs/TRADING-FORWARD-VS-RETROVISOR-2026-08.md`.

### 💼 (17/08/2026) Cartera REAL de IBKR en el panel /trading — la compra de VWCE no aparecía
- Alberto compró 188×VWCE (~31.840€, ETF núcleo) y el panel solo pintaba paper. Nuevas tablas
  `trading_cartera_real(+_sync)` (aplicadas + sembradas con la foto de hoy), endpoint
  `POST /api/trading/cartera` (mismo auth/resolución de cuenta que `/saldo`) y sección
  «💼 Cartera real» en `/trading` (solo con sesión; el invitado NO la ve). Totales POR divisa,
  NULL nunca 0, sync-marker separa «sin leer» de «sin posiciones».
- La pasada diaria gana el paso 1c (skill `trading-analista`): empuja `get_account_positions`
  al endpoint cada noche — SOLO con lectura buena; fallo de lectura ≠ cartera vacía. PR #1468.

### 📸 (17/08/2026) Stories de Instagram salían recortadas — lienzo 9:16 real en ig-img
- Alberto mandó pantallazo: la Story auto de ia.rest se veía fatal (el «2» y el texto cortados,
  casi todo negro). Causa: `ig_aprobar` republicaba como Story la MISMA imagen cuadrada 1080×1080
  del feed, e Instagram la escala a pantalla completa 9:16 recortando los laterales.
- Fix: `/api/ig-img` acepta `story=1` → lienzo 1080×1920 con el arte cuadrado centrado sobre el
  fondo de su propia plantilla (bandas del mismo color → se ve nativo). El callback de Telegram
  publica la Story (y el fallback manual por foto) con `&story=1`. Verificado con render local
  (stat editorial, pregunta, brutalist) y en prod tras el merge. `next build` verde. PR #1467
  mergeado; skill `ia-rest-maestro` (tabla de agentes) actualizada con el detalle de la Story.

### ✅ (17/08/2026) Kutxabank PSD2 RESUELTO — era la VENTANA de 89 días (+2 fixes de camino)
- Causa raíz: Kutxabank rechaza `/transactions` con ventana de 89 días («Account not found /
  AccountNotAccessibleException», error engañoso) incluso recién firmado el SCA. Fallback 89d→30d→7d
  en `getMovimientosConVentana` (PR #1462) → feed vivo, último mov = HOY. Aviso ℹ️ informativo
  («importado solo desde X») que NO pone el semáforo en rojo (PR siguiente, tests 11/11).
- De camino: (a) el retiro `estado='sustituida'` del PR #1459 reventaba contra el CHECK de
  `conexiones_banco` → migración `conexiones_banco_estado_sustituida` aplicada (por eso fallaron los
  4 re-vínculos de la mañana, en silencio); (b) el callback ya loguea cada desenlace (PR #1461);
  (c) nuevo `POST /api/banca/psd2/sync` + botón «🔄 Sincronizar ahora» en el panel PSD2 de /banca
  (reintentar sin quemar SCA). OJO: el botón está en el segmento 💶 Dinero del Inicio (no en Negocios).
- ✔ Verificado 18/08 06:25 (post-cron): pasada de las 06:01 LIMPIA en ambas conexiones (`ultimo_avisos=[]`
  — hoy Kutxa ni siquiera rechazó la ventana de 89d; el fallback queda de red de seguridad), último mov
  Kutxa 17/08, semáforo verde. Caso cerrado.

### 🏦 (17/08/2026) Kutxabank PSD2: el re-vínculo del 16/08 NO funcionó — diagnóstico + fixes
- Alberto vinculó 2 veces el 16/08 (07:46 y 08:30); hoy las 3 conexiones Kutxa `vinculada` fallaban:
  las 2 viejas con `authentication failure`, la nueva (08:30) con `Account not found` en `/transactions`
  DESDE EL MINUTO CERO (el callback del 16/08 no importó nada — no es caducidad por tiempo). Último mov 10/08.
- Saneado en prod: conexiones 14/06 y 16/08-07:46 → `caducada` (solo queda viva la de las 08:30).
- Fixes (este PR): el callback retira las conexiones anteriores del mismo banco al vincular
  (`estado='sustituida'` — fin de los zombis); el sync lee el `status` de la sesión de Enable Banking
  y avisa si no está `AUTHORIZED` (diagnóstico de raíz que hoy faltaba).
- **Pendiente Alberto: mergear el PR y re-vincular Kutxabank UNA vez en `/banca`** (el callback
  sincroniza al momento y rellenará el hueco 11/08→hoy; ventana 89 días). Tras vincular, mirar
  `conexiones_banco.ultimo_avisos` — con el fix dirá el estado real de la sesión si vuelve a fallar.

### 🧮 (17/08/2026) Fix doble conteo en el P&L por piso (`getPLMensual`)
- La query «gastos de tarjeta» sumaba CUALQUIER movimiento con `propiedad_id`+confirmado — cogía
  también los recibos de la corriente Kutxa (luz/agua/IBI de House, que llevan `propiedad_id` para lo
  fiscal) y ya entran por factura en `gastos` → doble conteo. Ahora exige `cuentas_bancarias.tipo='tarjeta'`.
- Efecto medido (junio, House): 420,31€ → 123,45€ en «otros» (solo la compra real de tarjeta).
  OK de Alberto tras explicárselo. Suite 1232/0, tsc 0.

### 🏦 (17/08/2026) Gastos fijos de House (Socorro) dados de alta desde banca real
- Alberto: «los gastos de Socorro están en la cuenta de Kutxa» → derivados de `movimientos_bancarios`
  y dados de alta en `gastos_fijos` (2 filas, `origen='manual'`): IBI 40,49€/mes (2 plazos ~242,93€;
  2º plazo nov ESTIMADO, confirmar al cobrarse) + seguro Occident 49,45€/mes (593,45€/año, 16/01).
- Suministros NO van en fijos (ya entran por factura en `gastos`; duplicarían). Skill pricing-agente
  actualizada en el PR #1457. El recibo Ayto. 130,93€ (16/04) era de MONTE CARMELO (confirmado por
  Alberto) → reclasificado en banca a `personal`+`ibi` (estaba como gasto de House, deducible en falso).
- ⚠️ Hallazgo aparte SIN tocar: `getPLMensual` (query «tarjeta») suma CUALQUIER movimiento con
  `propiedad_id`+confirmado, no solo tarjeta → los recibos Kutxa de House (luz/agua/IBI) pueden
  contar DOBLE contra sus facturas de `gastos` en el P&L por piso. Decidir fix con Alberto.

### ✅ (17/08/2026) PR #1449 (ciclo Booking +20%) MERGEADO + sincronía de skills/docs con el 1.20
- #1449 mergeado (inventario + Fases 1-3 ejecutadas y verificadas). Post-merge: actualizados la
  skill `pricing-agente` (estado-y-protocolo), el comentario del markup en `pricing/apply/route.ts`
  y `pricing-automatico.md` — la nota del 09/08 («channel_markup=1.0») quedaba como trampa: una
  sesión podía «corregir» el 1.20 de vuelta. **Regla: el markup del motor es el ESPEJO del ajuste
  real del canal Booking en Smoobu (hoy +20% ↔ 1.20); si cambia uno, cambia el otro, Smoobu primero.**
- BD verificada post-merge: `channel_markup=1.20` y `enabled=true` en los 4. Vigilancia del PR
  retirada. Quedan las rutinas: medición Fase 4 (30/08) y renovación oferta 8% (01/11/2028).

### 🏷️ (17/08/2026) Revisión post-ciclo pricing: los 2 accionables del 17/08, resueltos
- Las 3 fechas `no_disponible` de House (12-sep, 10-oct, 17-abr-2027) SÍ tienen reserva real con
  income (Booking: 1.344€ / 2.044,74€ / 3.318,47€ brutos — la de Feria a ~1.659€/noche). No hay
  bloqueo manual ni sync roto: el chequeo del ciclo las dio por «sin income» en falso. Nada que tocar.
- La muestra ruidosa del 29-ago NO es puntual: 364 filas / 36 fechas de House con comps a <12€/plaza
  (44-104€ para 12 personas = precio de habitación), **todas `fuente='serper'`** (sweep, desde 04/08).
  **Filtro de plausibilidad €/plaza APLICADO con OK de Alberto** (`pricing-comps-plausibles.ts`, umbral
  12€/plaza, comps sin aforo no se juzgan): apply (3 consultas) + guard (#4/#5/#7/#8/#9) + recommend/
  pilot-track/settings. Efecto medido: +14/+38€ en p50 de fechas contaminadas, 0€ en las limpias.
- Reservas Dúplex del 16/08 verificadas OK: 3-5 oct y 16-18 oct a 137-140€/noche bruto con listado
  en mercado (p50 fiable 171/184,5€); el descuento es el canal (~0,78-0,80), no infraprecio.
- 2ª tanda («haz todo», OK de Alberto): rutina `mercado-booking` sube de 12→24 ventanas/pasada
  (plan de 464; objetivo: 3 fechas/mes fiables para retirar Serper). Suelo estacional de House
  verificado con la serie 2024+ → NO está plano en la práctica (FLOOR_SEASONAL ya modula: abr 390€
  vs peor venta real 428€); pendiente cerrado, aprendizaje en `pricing_aprendizaje` id 74. El «ADR
  agosto 62€» era artefacto de reservas DIRECTO/OTRO a 0-200€ (huecos de amigos) — al analizar House
  excluirlas. `gastos_fijos` de House sigue a 0 filas: hace falta que Alberto pase IBI/seguro/
  suministros (no se inventan). FLOOR_SEASONAL nov ×1,00→×1,10 APLICADO («lo q veas mejor» de
  Alberto): suave a propósito — House 330€ de suelo nov, justo sobre su peor venta real (~263-310€
  de listado), sin cerrar la puerta al mercado flojo; el pricing lo sigue decidiendo el mercado.

### 🔴 (17/08/2026) Swap NIM verificado en vivo: 70B→GLM-5.2 · contable→deepseek-v4-flash (PRs #1454+fix)
- NIM retira el 3.3-70b el **25/08/2026**. 1ª elección (Maverick, PR #1454 mergeado) resultó **410 Gone
  en el API** (EOL 27/07 con la ficha web aún viva) — cazado al probar con la key real vía harness en
  una edge function de ia-rest + `pg_net`. **La ficha de build.nvidia.com NO prueba que el modelo viva.**
- Final, todo probado con llamadas reales: default NIM **`z-ai/glm-5.2`** (mini-eval A/B 2/2) y
  `CONTABLE_MODEL` **`deepseek-ai/deepseek-v4-flash-0731`** (el `deepseek-v3` YA NO existe en `/v1/models`
  — cerrado el "sin confirmar" del 27/07). Radio completo re-swapeado; 4 edge functions redesplegadas
  (Supabase MCP) y `nim-sentiment` probado end-to-end. Ids OpenRouter `meta-llama/*` NO tocados.
- Detalle y regla nueva del Paso 1 (id vivo = está en `/v1/models` o responde) en `docs/BUSCADOR-IA.md`.

### 🧾 (17/08/2026) facturas-correo — hueco real en `facturas_drive` (SiQueBrilla julio) + autocrítica
- Paso 4.0 sin `sin_revisar` y sin candidatos Gmail nuevos, pero la raíz de `FACTURAS Apartamentos/2026`
  seguía teniendo ~30 PDFs sueltos: al investigar, casi todos ya estaban cubiertos por avisos previos en
  `_DUPLICADOS_BORRAR` (Endesa Bustos/Dúplex, EMASESA Reform ×9, Castuera, Leroy, Dimitri/CREATE) — no
  eran backlog nuevo. El hueco real: la factura SiQueBrilla de julio (780,10€) SÍ estaba archivada en
  Drive y conciliada en banco desde el 03/08, pero sin fila en `facturas_drive` → invisible para
  `v_facturas_sin_cargo` (esa vista solo detecta filas existentes sin `movimiento_id`, no filas
  ausentes). Fila insertada.
- **Autocrítica:** antes de verificar bien, copié 2 duplicados nuevos (SiQueBrilla + Leroy) sin
  comprobar que ya existían archivados — avisos de borrado añadidos a la papelera para los dos.
- Etiqueta `Facturas/Extraccion-fallida` retirada de un hilo que era un mensaje de huésped de Booking
  (falso positivo, no factura). `agente_salud` actualizado (Vía B: dias_caido=3, sin backlog real).
- Papelera `_DUPLICADOS_BORRAR` acumula ~22 avisos sin que Alberto los haya vaciado — mencionado en el
  resumen, no bloqueante.

### 📊 (17/08/2026) Ciclo semanal de pricing — los 4 pisos, comps por conector real
- Ciclo completo del agente de pricing (skill `pricing-agente`): medido el ciclo anterior (10/08) contra
  incomes/rate_snapshots (ventas confirmadas de busto SS/Feria a precio decidido, 4 ventas nuevas en
  luxury/duplex en octubre), sembrado mercado en las 4 propiedades (12 ventanas: 1 finde/mes ~10 meses +
  Semana Santa + Feria, vía Booking/Trivago/Tripadvisor MCP) y aplicado en dry-run (48 decisiones,
  circuit-breaker sano en los 4 pisos).
- **Comps escritos hoy: busto=406 · duplex=263 · luxury=322 · house=186** (ninguno a 0).
- Pendiente sin cerrar (no bloqueante): 3 fechas de House quedaron `no_disponible` sin income que lo
  confirme — mismo patrón ya visto con busto/Feria (posible bloqueo manual o reserva aún sin sincronizar).
  Detalle en `pricing_aprendizaje` (`ALL`/`ciclo_17_08_2026`).

### 📈 (16/08/2026) Fases 1+2 del +20% Booking EJECUTADAS (Smoobu + motor)
- **Fase 1 (Claude Chrome, `docs/BOOKING-FASE1-SMOOBU-2026-08-16.md`):** `priceDifference` del canal
  Booking en Smoobu 0% → **+20%** (campo ÚNICO por canal, cubre los 4 pisos; resto de portales a 0%),
  push forzado con «Sobrescribir precios» (guardar NO basta). Hallazgo: el rótulo «Sobrescritos por
  PriceLabs» de Smoobu es LEGACY — PriceLabs está de baja desde el 09/08, los precios los escribe el motor.
- **Fase 2 (BD):** `pricing_settings.channel_markup` 1.0 → **1.20** en los 4 pisos. El motor re-basa en
  el siguiente `apply-auto` (08:30/14:30/20:30 UTC); hasta entonces Booking muestra ~+20% (lado seguro).
- **17/08 ✅ Verificación A5 hecha:** los 4 pisos cuadran `extranet = techo(base×1,20)` (24.08:
  113/125/126/360€); web directa confirmada al 100%. **Paso B (ocupación) DESCARTADO definitivo:**
  Smoobu no modela ocupación (precio plano por noche) y PriceLabs está de baja — no hay palanca.
  👀 Para Alberto: Reform publica Standard Rate «×2» (¿capacidad real?), House «Configurar»/×11.
  Medición Fase 4 programada 30/08 (`trig_01DHwh…`).

### ✂️ (16/08/2026) Cambios EJECUTADOS en la extranet de Booking (Fase 3 del estudio)
- Vía Claude Chrome → `docs/BOOKING-CAMBIOS-2026-08-16.md`: **Genius dinámico → No** en
  Luxury/Reform/Dúplex (tramos fijos 10/15/20 intactos); **NR de Luxury −15% → −10%**;
  **Oferta estándar 8%** en los 3 (16/08/2026–**31/12/2028**, ⏰ renovar; no permite «sin fin»).
  House Sevillana: cero cambios. Apilado máx. −37%→−33,8% s/ standard; suelo no-Genius 0%→−8%.
- **Parado a propósito:** precios por ocupación de Luxury — el Standard Rate es XML de Smoobu
  (sobrescrito) y la extranet solo acepta €-fijos por fecha → hacerlo en **Smoobu** (pendiente).
- Siguientes fases: +20% Smoobu = **solo UI de Smoobu, no hay conector ni API para el ajuste por
  canal** (Alberto o Claude Chrome) → SOLO DESPUÉS `channel_markup=1.20` (Claude; el orden es
  crítico, ver estudio). Rutinas programadas: medición Fase 4 el 30/08 (`trig_01DHwh6a38D4…`,
  incluye mirar volumen/conversión, no solo la mediana) y renovación de la oferta el 01/11/2028
  (`trig_01SDP3vfKHxZ…`).

### 🏷️ (16/08/2026) Inventario de descuentos Booking — el −29% explicado
- Pasada de solo-lectura por la extranet (Claude Chrome) → `docs/BOOKING-DESCUENTOS-INVENTARIO.md`
  (copia también en Drive). El −29% de Luxury Busto = **Genius dinámico ~21,5% × móvil 10%**
  (reserva 6509021916 verificada: 430€ vs 609€ de calendario).
- Hallazgos clave: Genius dinámico 0-30% ACTIVO en 3 de 4 pisos (House Sevillana en «No» → su
  exposición máx. es −23,5% vs −37/−46,5% del resto); Luxury Busto con NR a −15% (resto −10%);
  país+móvil no se acumulan (misma categoría); sin campañas activas; Luxury sin precios por ocupación.
- Alimenta la Fase 3 del estudio de posicionamiento (PR #1448): decidir dinámico sí/no ANTES del +20%.

### 💓 (16/08/2026) Sonda del verificador de eventos + guarda de regresión (PR #1447)
- El parte «Sin poder comprobar» decía la verdad: `sivra_eventos_verificar` se declaró en
  `AGENTES_VIGILADOS` (12/08) sin su sonda en `PROBES` del cron `agentes-latido` — el agente SÍ
  late (verificado en BD: hoy 05:30, «3 previstos revisados · 3 confirmados»), el vigía no tenía
  query para leerlo. Fix: sonda gemela de `sivra_eventos`; la sonda exacta probada contra la BD real.
- **Guarda nueva en `latidos.test.ts`**: todo id de `AGENTES_VIGILADOS` debe tener clave en `PROBES`
  (verificada en rojo contra el estado pre-fix). tsc 0 · 1227 tests · build OK.
- Docs al día: regla en `apps/plataforma/CLAUDE.md` (§Latidos) y `docs/RUTINAS-PROGRAMADAS.md` §12
  (lista de vigilados completada con `sivra_eventos_verificar` y `subastas_mercado`).

### ⏳ (16/08/2026) Estudio posicionamiento Booking — SÍ al +20% por portal, con condición
- `docs/ESTUDIO-BOOKING-POSICIONAMIENTO.md`: Booking ordena por conversión×precio FINAL; subir la base
  +20% solo funciona devuelto en descuentos visibles (1,20×0,76≈0,91 vs 0,92 medido en las 20 reservas).
  Paridad muerta en la UE (DMA) → legal poner la web directa más barata que Booking.
- Plan 5 fases. 🚨 ORDEN CRÍTICO: Smoobu +20% SOLO canal Booking (Alberto, forzar push de precios)
  ANTES de `pricing_settings.channel_markup=1.20` (Claude). Pendiente del OK de Alberto para ejecutar.
- **Convención (petición de Alberto): todo estudio/informe se archiva TAMBIÉN en Drive
  `CENTRAL/02·CONTABILIDAD/informes`** (`1l2OLodxPuL07tKykZKtBV382w6yRMQQA`, ver `DRIVE-ESTRUCTURA.md`).

### ✅ (16/08/2026) Backlog de PRs resuelto («resuelve todo» de Alberto) + migración v_facturas_sin_cargo aplicada
- Mergeados los 3 PRs abiertos: #1436 (auditoría ligera), #1437 (auditoría profunda, con bump
  `next` 15.5.21 en housesevillana) y #1441 (agentes-entrenador). Conflictos de registro de
  #1437/#1441 resueltos conservando ambos lados (bitácora: poda del entrenador + entrada nueva
  de psd2-health-check que entró después del corte).
- **Aplicada en producción** la migración propuesta por #1437 (`revoke_anon_v_facturas_sin_cargo`):
  `REVOKE ALL FROM anon, authenticated` + `security_invoker=true`. Verificado: vista viva (8 filas),
  solo roles privilegiados con grant.
- PSD2, con el aviso del vigilante nuevo (06:02): **BBVA recuperado** (entró 1 mov, Bizum 30€);
  **Kutxabank ****0855 falla solo la PAGINACIÓN de `/transactions`** (página 1 responde — sesión viva;
  la 2ª con `continuation_key` revienta, patrón de consentimiento degradado sin SCA reciente, del 14/06).
  Queda en manos de Alberto re-vincular Kutxabank en `/banca`. Fix en este PR: el error de
  `enablebanking.ts::api()` pone `HTTP <status>: <motivo>` PRIMERO y la ruta sin query al final — el
  recorte de 160 chars de los avisos se comía el código HTTP. Pendiente de decisión: skill
  `mariscos-maestro` (recomendación de #1436).

### 🎓 (16/08/2026) agentes-entrenador: pasada semanal — falsa alarma de facturas-correo diagnosticada
- Rango 09/08→16/08, 27 entradas de bitácora procesadas y podadas. Backlog de PRs abiertos sano (3,
  todos del propio 16/08). Sin pendientes en `FEEDBACK-AGENTES.md`.
- **Hallazgo:** el "fallo" que `facturas-correo` venía anotando 5 pasadas seguidas (12→16/08 —
  `search_threads label:Facturas/Extraccion-fallida` vacío pese a `list_labels` marcando
  `messagesTotal:1`) era una falsa alarma: verificado en vivo con el MCP de Gmail que la búsqueda
  real (ID, nombre con/sin comillas, `in:anywhere`/`includeTrash`) da 0 hilos de forma consistente —
  el contador de `list_labels` está desincronizado en esa etiqueta de uso raro. Añadida caveat
  aditiva en `.claude/skills/facturas-correo/SKILL.md` para que no se repita.
- mercado-booking y pricing-agente: sus únicas dudas/fallos del rango ya estaban resueltos en
  código/skill antes de esta pasada, sin acción nueva. Detalle completo en la entrada de esta
  pasada en `docs/AGENTES-BITACORA.md`.

### ⚠️ (16/08/2026) Alerta PSD2 sync — 6 días sin movimientos con la sesión VIVA
- Último mov `origen='psd2'`: 10/08 (histórico: nunca >1 día de hueco desde 20/07). Cron OK (200 diario).
- Clave: el SALDO de BBVA …1175 se actualizó el 15/08 → la sesión Enable Banking responde, pero
  `/transactions` viene vacío/fallando — invisible porque `lib/psd2.ts` lo tragaba con `catch(() => [])`.
- Causa probable: consentimiento degradado (SCA 14/06, `valid_until` ~11/09 — no caducidad formal). BBVA …2620
  además muerta desde 27/06 (ya no está en la sesión). Acción de Alberto: re-vincular ambos bancos en /banca.
- Fix (rama `claude/psd2-sync-no-movements-yw0gig`): `sincronizarSesion/Todas` devuelven `avisos` (fallo de
  /transactions, ventana 89d vacía en cuenta conocida, drift de saldo con 0 transacciones) + Telegram del cron.
- La pasada de mañana 06:00 dirá el motivo exacto en el Telegram/logs. Telegram enviado hoy con el diagnóstico.
- 2ª tanda (orden de Alberto, «que no vuelva a pasar + panel»): semáforo del feed PSD2 en /banca
  (`lib/psd2-semaforo.ts` puro+testeado, 🟢≤2d·🟠3-5d/caducidad≤10d·🔴≥6d/avisos/caducado), avisos del
  sync persistidos en `conexiones_banco.ultimo_avisos` (migración aplicada) y aviso previo de caducidad
  del consentimiento (creado+89d) — deja de depender de que alguien mire el Telegram.

### 📈 (15/08/2026) Agente inversor → copiloto con confirmación humana (decisión de Alberto)
- Pregunta origen: ¿comprar ya en IBKR? NO — forward −4,38% con 21/120 días del Tramo 2. Decisión:
  núcleo-satélite (ETF global = grueso, intocable; satélite 10-20% sigue en paper hasta validar).
- Ampliado `trading-analista`: nuevo `references/copiloto-ordenes.md` — `create_order_instruction`
  crea BORRADORES que Alberto confirma en IBKR (el MCP no puede ejecutar), solo a petición suya;
  la Rutina nocturna jamás crea instrucciones. Bloque 💼 Cartera real en la pasada + alertas con email.
- ⛔ Rotación núcleo→satélite prohibida (timing = el patrón del −33,9% + regla fiscal 2 meses).
- **Mergeado (16/08, PR #1435, orden de Alberto) y verificado en vivo:** los 3 tools del bloque 💼
  responden — NAV 32.335,37€, 0 posiciones (100% liquidez), 1 alerta activa preexistente (STX ≥865).
- **16/08: PRIMERA orden real vía copiloto.** VWCE (Vanguard FTSE All-World Acc, IBIS2): 188 part.
  LIMIT 169,80€ GTC (~31.922€, cierre vie. 168,88€). Claude preparó la instrucción → Alberto la envió
  en la app → orden viva `PENDING_NEW` (se ejecuta lunes en apertura Xetra). El núcleo NO se toca.
- **EJECUTADA (lunes 17/08; verificada 18/08 contra IBKR):** 188 part. a precio medio **169,44€**
  = 31.855,60€ invertidos, liquidez restante 410,46€. Alerta «VWCE −15%» (≤143,50€, email) creada.
- Pendiente: DCA 100% automático lo configura Alberto (orden permanente banco + «Recurring
  Investment» en IBKR; el agente solo audita); reservas directas Booking → conversación aparte.

### 👁️ (15/08/2026) Registro de accesos/actividad de ialimp + historial en el god-panel de plataforma
- Alberto preguntó por el último acceso de Vanessa: no existía rastro (el login de empresa solo tenía el
  flag `sesion_activa`, sin fecha). Decisión: historial completo (logins + páginas + acciones) en SU panel.
- Tabla compartida `registro_actividad` (aplicada; ialimp escribe, `prisma_plataforma` lee) + columna
  `empresas.ultimo_acceso`. Captura: 4 logins + middleware de ialimp fire-and-forget → `/api/interno/actividad`
  (Bearer CRON_SECRET). Superadmin excluido; purga 90 días; regla NULL declarada en la UI (tabla nace vacía).
- Plataforma: `/operador/actividad` (último acceso por persona + historial filtrable 50+Ver más).
- Spec en `docs/superpowers/specs/2026-08-15-registro-actividad-design.md`. Builds ialimp+plataforma OK.

### 💶 (15/08/2026) Reserva Luxury 22-25/10 a 430€: el canal Booking se comió el 29,4% del listado
- Alberto preguntó si la reserva (Christophe, 3 noches, 5 adultos, 430€ brutos) «es ok» → **no del todo**:
  el listado vivo en Smoobu ERA 203€/noche (snapshots 13-15/08, aplicado por el motor el 12/08) = 609€;
  el bruto 430€ da ratio **0,706** — descuentos de canal apilados (Genius+móvil), en el suelo del rango
  medido 0,66-1,08 (mediana 0,92). Neto Smoobu 345,20€ (115€/noche): rentable (coste 29,70€, suelo 72€)
  pero bajo el p25 de mercado de su fecha (165,75€ a 4 plazas). El motor tarificó bien; muerde el canal.
- Revisión completa OK: apply diario en los 4 pisos, sweep+booking_mcp de hoy, guard 07:30, eventos
  verificándose, latidos verdes, Telegram 200. Octubre sigue flojo (Busto 7/31 · Dúplex 0/31 · House 6/31
  · Luxury 6/31+3 de hoy). Alertas `evento_sin_respaldo` 29/08+13/09 (×2,2) obsoletas tras #1416.
- **Pendiente (Alberto, extranet):** revisar nivel Genius y descuento móvil activos — es la fuga que queda.

### 📧 (15/08/2026) Ayudas conciliación: radar fiscal completo + regla de comunicaciones (PR #1432)
- Alberto pidió que el asesor fiscal viera la convocatoria de la Consejería de Empleo: Línea 4 (autónomos
  con hijos <3 años que contraten personal, 6.000–7.200 €) y Línea 5 (riesgo embarazo / descanso por
  nacimiento). **Plazo de solicitud: hasta el 15/09/2026** (telemática, Oficina Virtual de Empleo).
- Enviado email a Marta Albarrán (malbarran@aseconconsultores.com, cc Pilar) pidiendo revisar si Alberto
  o Pilar pueden acogerse y tramitarla. **Pendiente: respuesta de Asecon antes del 15/09.**
- **🚨 Regla dictada por Alberto a raíz de ese envío (ya en CLAUDE.md):** NUNCA enviar comunicaciones a
  terceros sin su autorización explícita para ese envío — por defecto, borrador o texto para que decida él.
- Resolución: NO se solicita (la L4 exige contratar 12 meses y no hay contratación prevista); Marta avisada
  por Alberto. `fiscal-novedades` ampliado con radar mensual de convocatorias de ayudas + aviso Telegram
  (Paso 5; estado en `docs/FISCAL-AYUDAS.md`) para que la próxima no llegue por prensa.
- Ampliación (mismo día): Paso 5 suma bonificaciones SS (checklist anual) + radar por cliente; banner 💶 en
  `/finanzas` con cuenta atrás (tabla `fiscal_ayudas`, aplicada y sembrada; `AyudaBanner` + descartar).
- Radar por cliente TERMINADO: perfiles en BD (`ayudas_perfiles`, con `ref_ext` → cuenta/empresa de su app;
  Joaquín apunta a la cuenta DEMO del almacén hasta sembrar la real) + banner 💶 en `apps/almacen` (panel)
  y `apps/ialimp` (dashboard empresa, manual actualizado). GRANTs de solo lectura a `prisma_ialimp`/`prisma_almacen`.
  OJO: `next build` de ialimp falla en este contenedor por envs (preexistente, falla igual sin los cambios).
  **Pendiente:** borrador Gmail a Marta sobre la cuota RETA de Pilar (serie rara 72→118→32€, ¿bonificación
  art. 38 LETA aplicada?) — lo envía Alberto si quiere.

### 🧯 (15/08/2026) La curva «PL» congelada era el PROPIO motor: suelo contaminado reteniendo agosto a 2-5× mercado
- Alberto vio en Smoobu 359/234/414/554€ para la noche del 15/08 (mercado fiable de la fecha: 77/99/113/320€).
  Causa: la congelación del #1416 re-etiquetó `captured_at` SIN restaurar precios → `pricing_pl_referencia`
  guardaba el sawtooth del motor (capturas 11-14/08) y el suelo 85% lo blindaba hasta ago-2027.
- Reconstruida (SQL `2026-08-15_pl_referencia_reconstruida.sql`, aplicada ~06:20 UTC; PR #1427): Busto/Luxury
  FUERA (motor vivo desde 10/06 y 13/07 — nunca hubo PL genuino en la tabla); Dúplex/House con la foto real del
  snapshot 08/08 07:00 (caduca 06/12/2026). Sevilla-Rayo duplicado 15+16/08 → fila del 16 descartada (partido: sáb 15).
  Es la reconstrucción que la entrada ✅ de abajo encontró «sin anotar»: la anotación viajaba en la rama draft.
- Guarda nueva en apply: con ancla fiable de la fecha, el suelo PL se acota a ×1,2 el ancla
  (`lib/sivra/pricing-suelo-pl.ts`, puro+test). Una referencia estática ya no puede desmentir al mercado medido.
- Verificado post-fix (pasada 08:31): los 4 pisos bajaron el raíl completo sin re-anclarse (15/08:
  359→287 · 234→187 · 414→331 · 554→443; 275 escrituras, toda la curva despinzada).

### 🐛 (15/08/2026) Pasada de trading duplicada: el PASO 0 del trigger no ve una recuperación con `fecha` backdateada
- El trigger de las 20:15/23:15 disparó otra vez a las ~08:14 UTC. PASO 0 comprobó `trading_pasadas WHERE
  fecha=CURRENT_DATE` (2026-08-15) → NULL → concluí «no ha corrido hoy» y ejecuté la pasada completa.
- **Pero SÍ había corrido**: la sesión de la entrada anterior recuperó el viernes 14/08 usando `fecha='2026-08-14'`
  a propósito (evitar etiqueta corrida) — invisible para un check que mira `CURRENT_DATE`. Mi pasada (NAV→saldo,
  22 símbolos, /analizar, /puntuar) corrió igual con `fecha='2026-08-15'` pero **con los MISMOS cierres del
  viernes** (el mercado seguía cerrado) → 88 tesis nuevas duplicando información ya analizada, un día desplazada.
- **Sin daño operativo**: 0 compras paper nuevas (la barrera "posición ya abierta" protegió), 0 vetados/huérfanas.
  `ETIQUETA_TOL` ya tolera el desfase sin anular tesis. El coste real es ruido en `trading_estrategia_stats`.
- **Pendiente:** el PASO 0 del prompt del trigger debería comprobar la HUELLA real (última vela usada / último
  precio_ref), no solo `fecha=CURRENT_DATE` — una recuperación backdateada lo esquiva. No lo he tocado (vive en
  la config del trigger, fuera de este repo).

### ✅ (15/08/2026) Verificación final PR #1416 — todo OK; el suelo PL quedó RESTAURADO a la curva genuina
- Seguimiento cerrado: 9/9 partidos a domicilio siguen descartados (los 3 «vs Sevilla/Betis» vivos son derbis, locales), guardián 07:30 con 0 alertas nuevas, latidos sivra_* en verde, sin recaptura tras las pasadas 20:30/14:30 con código nuevo.
- Incidencia menor (14/08 ~15:00): la pasada de las 08:31 corrió con código viejo minutos antes del deploy (READY 08:54) y recapturó una última vez; re-congelada en el momento.
- **Estado REAL de `pricing_pl_referencia` (difiere del PR):** alguien —sin anotarlo en memoria ni commits— la restauró a la curva GENUINA: solo Dúplex+House, 732 filas, `captured_at='2026-08-08'` (verificado: 732/732 cuadran con `rate_snapshots` del 08/08, último día limpio) → caduca ~06/12/2026. Semánticamente mejor que la congelación del PR (que re-fechaba precios ya contaminados). Busto/Luxury fuera: su «PL» ya era espejo del motor.
- Si fuiste tú (otra sesión): anota tus escrituras de BD en memoria — esta reconstrucción se descubrió por sorpresa en la verificación.

### 🐕 (15/08/2026) Pasada de trading del 14/08 perdida: recuperada a mano + reintento pendiente de la UI
- El trigger disparó (20:15:38Z) pero la sesión murió SIN arrancar — fallo transitorio de la plataforma
  (entorno activo, otras rutinas corrieron bien). Watchdog avisó 06:30; Alberto: «¿solución para esto?».
- Recuperada la mañana del sábado con `fecha`/`hoy`=**2026-08-14** (cierres del viernes, evita la etiqueta
  corrida): NAV 32.335,37€ → saldo, 22 símbolos por subagentes (velas a fichero, anti-barajado), /analizar
  (0 vetados, sin compras nuevas) y /puntuar (48 tesis, 0 cerradas, diferido limpio). 3 huellas verificadas.
- **Limitación:** `fire_trigger`/`update_trigger` rechazan rutinas creadas en la UI, y los triggers MCP no
  llevan conectores → el reintento solo podía aplicarse en la UI. **✅ Alberto lo aplicó el mismo día**
  (Claude Chrome): cron `15 20,23 * * 1-5` + PASO 0 de huella, verificado por MCP (prompt y 4 conectores
  OK). Estreno real el lunes 17/08 (check-in nocturno armado). Receta en `docs/RUTINAS-PROGRAMADAS.md`.

### 🔧 (15/08/2026) Los 3 runtime errors diarios de plataforma NO eran «normales» — 2 fixes
- Al verificar producción tras mergear #1424, Alberto preguntó por los 3 errores de la última hora. Ninguno era del PR, pero dos eran bugs reales sonando a diario desde julio/agosto:
- **BORME 404 en festivos = error 500** (y su eco en cron-dispatch): el BOE no publica domingos/festivos; `descargarSumario` ahora devuelve `null` en 404 → `ingestaDia` responde `sinPublicacion: true` con 200. Ausencia legítima declarada, no disfrazada de avería. Otros HTTP siguen lanzando.
- **`titulares.ts` roto desde el 05/08**: `WHERE cuenta_id = ${cuentaId}` sin `::uuid` → 42883 y lista de titulares vacía en silencio (el catch degradaba). Cast añadido (patrón psd2/adapters); verificado contra la BD real (2 sociedades de la cuenta).
- Verificado: tsc 0 · 53/53 tests · build OK. Mismo día: #1424 mergeado y producción comprobada al 100% (render real de /trading vía invitado, orden nuevo + euros en hero con FX vivo).
- **📦 «Cartera paper» vuelve a /trading CON rentabilidad** (Alberto: «¿solo hay comprada ORCL? no indica la rentabilidad»): 8 posiciones abiertas en BD pero invisibles — la lista de ideas filtraba las 40 tesis recientes y las compras viejas desaparecían (consulta propia de compras ahora), y las posiciones no se pintaban desde que se retiró la «Cartera simulada» sin P&L (04/08). Sección nueva con precio actual (Stooq→Yahoo, «—» declarado si no hay) + rentabilidad por posición + total; explica los vetos «posición ya abierta».

### 📈 (15/08/2026) Trading: regla de APAGADO firmada + correlación de cestas + veredicto fuentes de pago
- Revisión a raíz de unos prompts de inversión de Twitter (descartados: 3 contradicen H9/intradía/cruces ya refutados).
- **🛑 Regla de apagado firmada en el pre-registro:** más vieja ≥365d + ≥3 cestas y <2/3 batiendo por mediana → capital a ETF y escalera cerrada. `evaluarApagado` (`puerta-fase2.ts`, 5 tests) + línea 🛑 en el digest semanal.
- **Correlación media por cohorte** en el digest (contexto, nunca filtro; reutiliza `concentracion.ts`) — la mediana no ve una cesta que es una sola apuesta. Anotada en el pre-registro junto a la re-declaración de «sin dividendos, ambos brazos».
- **`docs/TRADING-FUENTES-PAGO.md`:** las fuentes de pago NO acortan el camino a operar en real (el reloj es el forward, no los datos); único gasto que protege dinero real = calendario de earnings + datos IBKR, y solo al abrir Tramo 1. Decisión APLAZADA se mantiene.
- FX EUR/USD y caveat de dividendos ya estaban cubiertos (cartera-estudio) — verificado antes de tocar nada.
- **Pasada de claridad en `/trading`** (Alberto: «no está clara del todo» + «el orden también»): glosario plegado, tooltips, estrategias legibles, subtítulos-pregunta, línea 🛑 en la escalera; **reorden** hero→glosario→ideas→forward→analiza→radar→cohetes→watchlist (la tabla de 550 al final, lo que hizo el agente arriba) y **cifra en euros en el hero** (curvaEnEuros + FX real, no se pinta sin FX). Sin tocar lógica del modelo.

### 🧾 (15/08/2026) facturas-correo (trigger diario) — Vía B recuperada, nada pendiente nuevo
- Vía B (Apps Script) volvió a copiar el 14/08 tras 3 días parada → `agente_salud` a `ok=true`.
  2 pedidos Amazon (lima pies, microondas) entregados a Cádiz → `personal`, sin archivar.
  Sin candidatos nuevos más, backlog `PDF-pendiente`/`Revisar`/`v_facturas_sin_cargo.sin_revisar`
  a 0. Detalle completo en `docs/AGENTES-BITACORA.md` (entrada de hoy).

### 🧊 (15/08/2026) Cierre del bucle de eventos — congelar→medir→mercado manda, verificado en producción
- Ciclo completo confirmado con datos reales (PRs #1386 verificador, #1409 guarda 🧊, #1414 ventanas por fecha):
  0 bajadas ciegas en noches de evento confirmado desde el 14/08; el apply de las 14:30 descongeló solo
  las fechas ya medidas y las llevó al mercado real en horas (Busto 09-09 163→130€ con p50 135€; Luxury
  08-16 241→193€; Dúplex 09-09 165→149€).
- Booking prioriza congeladas por fecha: 14/08 midió 08-16 + 09-09/10; 15/08 midió 09-11/12/14 (110 comps,
  1 ventana `not_found` declarada honestamente en el latido). p50 reales anclando (09-11 aforo12 = 593€).
- Hilo de eventos CERRADO: sin check-ins pendientes; el circuito verificar→congelar→medir→repreciar es autónomo.

### 🏷️ (14/08/2026) Guardián de precios: PriceLabs desconectado + 2 landmines del motor y del calendario
- Cierre del episodio 10-14/08: Alberto desconectó PriceLabs (las 7 reversiones eran suyas); verificado 0 reversiones el 11 y el 14/08.
- **Landmine 1 — suelo PL autorreferente:** `pricing/apply` re-capturaba `pricing_pl_referencia` a diario desde `rate_snapshots` (que lee SMOOBU, no PL) → tras la desconexión el «suelo PriceLabs» capturaba los precios del propio motor y NUNCA caducaba. Upsert eliminado; tabla congelada a `captured_at='2026-08-10'` (migración `2026-08-14_pl_referencia_congelada.sql`, aplicada) → suelo inerte el 08/12/2026 como diseñado. Regla: una referencia EXTERNA no se recaptura de un espejo que escribes tú.
- **Landmine 2 — partidos a domicilio como eventos:** el websearch tenía 9 jornadas fuera de casa confirmadas (Athletic-Sevilla en Bilbao ×2,2…) subiendo precios en Sevilla. Descartadas en BD + guarda determinista `esPartidoFueraDeSevilla` (el club sevillano DETRÁS del «vs» = visitante; finales exentas) en ambas pasadas + el upsert ya no resucita `descartado`.
- Factores de liga re-derivados a la curva plana (×1,35) en BD; finales/Mundial de Remo restaurados (×2,2/×1,55).
- Octubre verificado: ninguna fecha vendiéndose barata; los precios altos del puente son el suelo PL diseñado (caduca 08/12).
- Post-merge: skill `pricing-agente` sincronizada (estado-y-protocolo + ciclo) con los dos fixes; seguimiento programado (14/08 ~17:05 pasada del motor, 15/08 ~09:55 veredicto final).

### 🧊 (14/08/2026) Pasada de mercado a mano para descongelar las noches de evento
- Alberto preguntó por qué el aviso de «236 noches congeladas» no se mide al instante. **No es un
  fallo:** el cron de Vercel no puede llamar a un MCP, así que quien mide Booking es una SESIÓN
  (rutina `mercado-booking`, ~12 ventanas/pasada de un plan de 472). El motor congela y avisa, pero
  no puede medir.
- Disparada una pasada a mano sobre las rondas de EVENTO (15/08→31/10): **119 comps en 12/12
  ventanas**, 0 sin respuesta. Medianas aforo 12: 16-ago 265€ · 9-sep 346€ · **10-sep 506€**.
- Quedan **120 de 132** ventanas candidatas sin medir (tope `max=12`): las congeladas de sep-oct
  se descongelarán en las siguientes pasadas diarias. Parte en PR #1417 (mergeado).
- **Verificado end-to-end:** las 3 fechas × 4 pisos tienen 9-10 comps fiables y el umbral de
  `decidirEventoACiegas` es 3 → `congelar=false` en las 12. (No se pudo probar la SALIDA de
  `pricing/apply`: exige `CRON_SECRET`, que la rutina no lleva a propósito.)
- 🪞 **Landmine nueva — nuestro propio anuncio salía como comparable.** Booking devuelve «HOUSE
  SEVILLANA 6 habitaciones» en la búsqueda de aforo 12; escribirlo ancla el mercado al precio que el
  motor acaba de poner (bucle silencioso: el precio es real y de la fecha, lo que falla es de QUIÉN
  es, así que `fuente='booking_mcp'` no protege). Lo descarté a mano y se ha convertido en raíl:
  `lib/sivra/mercado-propios.ts` (lista CURADA, no heurística) + filtro en `/mercado/ingest`, que
  devuelve `propios[]` en vez de callarse. Corpus histórico limpio (verificado: los «Bustos Tavera»
  del corpus son competencia real de la calle, no nuestros).

### 💸 (14/08/2026) El `ignoreCommand` reconstruía las ~10 apps por cualquier cambio en `packages/`
- Lo destapó Claude in Chrome al verificar el despliegue de la landing: dos commits de subastas
  construyeron en `house-sevillana-landing`. **No era un fallo del filtro** — su regla decía
  «tocar `packages/` ⇒ construir», sin mirar quién consume qué. Pero `apps/housesevillana` no
  declara **ni un** `@central/*` (solo Next y React), así que eran builds regalados.
- Medido: 6 de 92 commits de 30 días tocan `packages/` y **ninguno** tocó la landing. Un commit de
  `module-subastas` construía 10 apps cuando solo `plataforma` lo consume. Familia del incidente de
  los ~600 US$ (PR #904), en pequeño.
- Ahora se resuelve el **cierre transitivo** de deps `@central/*` por app. Verificado con el cwd real
  de Vercel sobre `068255b`: plataforma construye, housesevillana/sivra/transporte saltan. **Fail-open
  intacto** (SHA inexistente y commit sin padre → construir; paquete sin `package.json` legible →
  construir). Red: `test/vercel-ignore-build.test.ts`.
- Confirmado en vivo por Chrome: `/barrio` y `/que-ver` sirven `/#reserva` (`#reservar` ×0) y el botón
  baja al motor. Root Directory correcto; «Ignored Build Step: Overridden» es lo esperado (gana el
  `vercel.json`). **Pendiente:** el salto al `#reserva` tarda unos segundos (carga del widget de Smoobu).

### 🔎 (14/08/2026) «¿Por qué el agente contable no reconoce Mercadona?» — los vigilantes de la tarjeta eran 3 comparaciones de strings
- La «🔎 Revisión de la tarjeta» del extracto **no llama a ninguna IA**: son reglas puras. «No reconozco
  MERCADONA COLMENA SEVILLA» solo significaba *ese rótulo literal no está en el histórico de ESA tarjeta*.
- Nuevo módulo puro **`lib/comercio-canonico.ts`** (identidad ≠ etiqueta): sucursal/terminal/forma jurídica/
  ciudad fuera + lista de cadenas → «MERCADONA COLMENA» = «MERCADONA». El histórico pasa a ser el de **toda
  la cuenta** (24 meses, `v_movimientos_activos`), no el de la tarjeta.
- Los otros dos bloques eran ruido puro: «cobro doble» ahora exige **mismo día** y ≥10€ (2×40€ de gasolina en
  el mes es rutina); «subida de precio» solo en **recurrentes de importe estable** (`baseRecurrente`: ≥3 cargos,
  ≥3 meses, ±10%) — DIA 3,25€→7,52€ o un restaurante 33€→87€ ya no se comparan.
- Histórico truncado/ilegible → se **dice** y no se afirma «comercio nuevo». Mismo criterio en `/api/banca/antifraude`.
- **Regla nueva para cualquier vigilante: solo habla si la señal DISTINGUE el aviso del comportamiento
  normal.** El ruido no es prudencia: entrena a ignorar el mensaje entero. Landmine completo en la skill
  `plataforma-maestro` (`agentes-banca-landmines.md`).
- Verificado: tsc 0 · 1193 tests `node --test` (14 nuevos) · `next build` OK. **PR #1413 MERGEADO** (15 checks verdes).

### 🐛 (13/08/2026) El #1406 mergeado NO leía ni un correo de Surus — lo cazó el E2E, no los tests
- Alberto pidió «mergea y prueba que todo vaya 100%». Mergeado (#1406, `0d054fa`, producción READY) y,
  al probarlo con un **correo de forma realista**, la ingesta devolvía `null` siempre. Arreglo en **#1408**.
- Tres defectos en cadena: (a) `htmlATexto` metía los saltos de línea y los borraba acto seguido al
  decodificar (`decodificarHtml` acaba en `\s+→' '`) → todo en UNA línea y el lector por línea ciego;
  (b) el lector columnar emparejaba por DISTANCIA EN CARACTERES → en una tabla HTML habría leído
  **120.000€ donde pone 30.000€** (el error de 90.000€ por la puerta de atrás; ahora manda el ÍNDICE de
  celda y sin misma forma devuelve `null`); (c) `valorTrasEtiqueta` cortaba por longitud → una línea
  indentada daba «ida: 30.000 €». Y `tituloDe` cortaba en la 1ª fila de tabla, dejando sin ficha
  cualquier aviso que abra con la tabla de precios.
- **Por qué ningún test lo vio:** `htmlATexto`/`urlsDeLote` son PURAS pero vivían en el archivo de la app
  (importa Prisma + IMAP) → `node --test` no las alcanzaba. Movidas a `@central/module-subastas` con sus
  regresiones. **Lección: un helper puro que vive donde no se puede testear acaba sin testear.**
- El camino del PDF (de donde salen los 42.799€ del lote de Santillana) nunca estuvo afectado, y el
  diseño defensivo aguantó: `null` → `correosSinLeer`, nunca una fila inventada.

### 🏛️ (13/08/2026) Surus in situ = 6ª fuente de subastas + la comisión del portal entra al coste
- Alberto se dio de alta en **surusin.com** (portal privado de liquidaciones: viviendas y coches) para
  recibir avisos por correo. Añadido como `fuente='surus'`: parser puro `module-subastas/surus.ts`
  validado contra la ficha REAL del lote de Santillana (fixture copiado del PDF, no tecleado) + ingesta
  IMAP `lib/subastas/surus.ts` colgada del cron `subastas-ingesta`. 474 tests verdes.
- **`calcularCoste` gana `comisionCompra`**: los portales privados cobran al COMPRADOR (Surus, 5% + 400€
  + IVA) y no se descuenta del remate. Se aplica **por FUENTE** (igual que el ITP por provincia), así que
  ninguna pantalla puede olvidarla. Las fuentes oficiales siguen a 0. Bonus: el depósito PUBLICADO ahora
  manda sobre el 5% derivado (Surus pide el 25%).
- ⚠️ **Honesto y pendiente:** el correo de alerta de Surus **no se ha visto todavía** (alta del mismo día).
  El adaptador reutiliza el vocabulario de etiquetas de sus fichas y CUENTA los correos ilegibles en
  `correosSinLeer` — nunca los da por «no había subastas». Contrastar contra el primer aviso real.
- **Coches fuera de alcance**: `subastas` es `es_inmueble` de punta a punta (Catastro, m², ITP, flip).
  Sus lotes de vehículos NO se ingieren; hacerlo pide diseño propio, no un flag.

### 🔢 (13/08/2026) Re-verificado el veredicto de inversión: 7 cifras publicadas estaban mal
- Mergeados **#1399** (botón Reservar de /barrio y /que-ver no llevaba al motor + táctil 44px) y
  **#1397** (cancelaciones de Smoobu). Verificado sobre `main`: 47/47 y 11/11 tests, las 20 anclas
  apuntan a `id`s vivos, `reservas_canceladas` existe en producción con RLS y 0 filas (se llena en
  la 1ª pasada del cron). **Producción no se puede comprobar desde el contenedor** (egress bloqueado).
- Al retomar el plan de intradía resultó estar **ya hecho** (`docs/INVERSION-VEREDICTO-2026-08.md`).
  Pero al re-derivar sus cifras desde IBKR/Supabase, **7 estaban mal y 3 se contradecían con sus
  propias tablas**: esperanza −172→**−162 $**, Kelly −47,6→**−44,7%**, «39% intradía»→**61%**,
  SPY +11,4→**+13,3%** (y en USD contra un TWR en euros), *day trades* del PDT, subastas y la tabla
  del backtest. **El veredicto no cambia** — el intradía sigue siendo el peor tramo con n=106.
- Lo importante: el **+1,16% a >10 días** que citaba el skill son **7 round-trips con mediana
  NEGATIVA**. Se ha quitado de la regla del agente. Y el `0.000000` de `valor`/`catalizador` en
  `trading_estrategia_stats` es un **centinela «sin calcular»**, no un cero medido.
- Pendiente: mirar quién escribe `trading_estrategia_stats.retorno_medio` (los dos ceros).

### ✅ (13/08/2026) El rescate de tesis huérfanas, confirmado en producción
- PR #1403 mergeado (`4598c03`) y **verificado en la pasada de las 20:52 UTC**: las 16 tesis del 18/07
  (CEG/ISRG/SYM/UEC) se puntuaron con `precio_fuente='contraste'`, `ventana_dias=10` y el cierre real del
  28/07 al céntimo — 259,82 · 361,80 · 42,34 · 9,44 (contrastado contra IBKR antes de escribir el código).
- El latido lo canta: «40 tesis puntuadas · 16 tesis huérfana(s) puntuada(s) con el cierre de su
  vencimiento (2ª fuente)». `n` por estrategia 116 → **130**; momentum 0,2414 → 0,2385 de hit-rate. 0 anuladas.
- El freno de la etiqueta corrida (#1382) volvió a actuar: SNDK del 06/08 apartado, no anulado.
- Método: el ancla NO puede pedir la fecha exacta de la tesis (las 16 son de un SÁBADO y sus refs son el
  cierre del viernes). Y ojo con el `[skip ci]` del bot 18 s tras un merge: no pude fechar el build desde
  el contenedor; lo cerró el despliegue de #1405, que por estar `main` por delante ya llevaba el arreglo.

### 📒 (12/08/2026) Sesgo de supervivencia: 16 tesis vencidas que no se puntuaban NUNCA
- Verificada la pasada del 12/08: 0 anuladas y el freno de #1382 actuando de verdad — apartó 4 `precio_ref`
  del 06/08 como fecha corrida (MSFT/NVO/SNDK/WDC, contrastados uno a uno contra IBKR: los cuatro son el
  cierre exacto del 05/08). Sin él, 16 tesis sanas anuladas en su primer día vivo.
- Al revisarlo salió un agujero mayor: `/puntuar` solo puntúa con el precio de la pasada, así que las tesis
  de un símbolo que sale del universo se quedan en `resultado: null` para siempre y sin contar (16 del
  18/07 — CEG/ISRG/SYM/UEC). Fix: `juzgarHuerfana` las puntúa con el cierre de su vencimiento (2ª fuente),
  con ancla contra `precio_ref` (splits/ticker reciclado) y margen de ventana; lo que no se puede, se canta.
- ⚠️ El ancla NO puede pedir la fecha exacta: las 16 son de un SÁBADO y sus refs son el cierre del viernes.


### 📱 (12/08/2026) La portada de House Sevillana suspendía el mínimo táctil de 44px (PR #1399)
- Claude in Chrome **no puede medir 320px** (su gestor de ventanas fuerza ~1536px de ancho mínimo), así que
  lo medí con Playwright sobre la app en local: **18 elementos por debajo de 44px** en la portada (marca del
  nav 27px, hamburguesa 27px, los 11 enlaces del pie 16px, los 4 SEO del final 40px). `/parking` limpia.
- **No era una regresión:** `git log` sobre `app/route.ts` da un solo commit, el de la importación (#1390).
  `/parking` se escribió en el monorepo con la regla delante; la portada entró tal cual del repo suelto.
- Arreglo acotado a `max-width:768px` salvo los SEO (su altura no depende del ancho). El teléfono de
  «o llámanos al …» va DENTRO de una frase: se amplía con padding + margen negativo, no estirándolo.
- Medido antes/después en las **6 rutas** (3 idiomas × 2 páginas): 18 → **0**, sin scroll horizontal.
- ⚠️ El CSS vive en un template literal de JS: una comilla invertida en un comentario rompe el build (me pasó).
- **2ª pasada, el hallazgo de verdad:** el sitemap declara **8** rutas y yo había medido 6. Al medir
  `/barrio` y `/que-ver` salió que su botón **«Reservar» apuntaba a `/#reservar`** y el ancla del motor
  en la portada es **`id="reserva"`** — no existe ningún `id="reservar"`. El botón llevaba a la portada
  y ahí te dejaba, sin bajar nunca al motor: no da error, no sale en logs, y en escritorio no se nota.
  Mismo patrón que los seis botones al dominio muerto (destino a mano en varias páginas). Ahí la red fue
  una constante; un ancla no puede serlo, así que la red es **`app/anclas.test.ts`** (todo `href="#x"`
  con su id en la página, todo `href="/#x"` con su id en la portada). **Verificado que el test sirve**
  reintroduciendo el fallo: 46 pasan, 1 falla. 6/8 → **8/8** rutas limpias a 320px.
### 🔒 (12/08/2026) `housesevillana` no arrancaba build: faltaba en `pnpm-lock.yaml` (PR #1398)
- El PR #1390 (import de la landing al monorepo) añadió `apps/housesevillana/package.json` sin
  regenerar el lockfile compartido. No se notó porque hasta esta sesión ningún proyecto Vercel
  tenía esa carpeta como Root Directory. `ERR_PNPM_OUTDATED_LOCKFILE` al primer intento real.
- `pnpm install --lockfile-only`: solo añade el bloque nuevo de `apps/housesevillana`, sin mover
  versiones de las demás 8 apps.
### 📉 (12/08/2026) Las cancelaciones ya se registran: el sync las veía y las tiraba (PR #1397)
- Corrige la entrada 🕳️ de más abajo. NO era que el concepto no existiera: `smoobu-sync.ts` pide
  `showCancellation=1` **a propósito** y hace `DELETE FROM incomes` al ver una — correcto para el
  ingreso, pero era lo ÚNICO que pasaba, así que el hecho moría con la fila y solo quedaba un número
  en el texto del latido. 67 cancelaciones / 269 noches (may-nov) invisibles por diseño, no por hueco.
- Tabla nueva **`reservas_canceladas`** (migración aplicada y verificada). Se escribe ANTES del DELETE
  y también cuando la reserva nunca llegó a `incomes` (antes caían en `skipped` y desaparecían).
- Nombres deliberados: **`cancelacion_vista_at`** = cuándo la vimos, NO cuándo canceló el huésped (el
  listado no publica esa fecha; el payload íntegro queda en `datos`). `nights`/`amount_gross` admiten
  NULL — sin fechas no se escribe 0, que se leería como «cero noches perdidas».
- ⚠️ **Nace vacía**: lo anterior está borrado. «0 cancelaciones» en un periodo viejo = «no se sabe».
  El backfill (Smoobu con `modifiedFrom` atrás) es una pasada aparte y consciente, no el cron diario.

### 💸 (12/08/2026) El cotizador de IA de ialimp no ha generado NUNCA una propuesta (PR #1394)
- 8 leads, **0 con `propuesta_url` o `propuesta_ia_at`**; el bucket `propuestas-leads` tiene **0 objetos**.
  Tres fallos encadenados, todos mudos: (1) el disparo desde `/api/leads` iba sin `Bearer CRON_SECRET` →
  401 del middleware, y `fetch` no rechaza ante un 401 así que el `.catch()` no veía nada; (2) la subida a
  Storage usaba la anon key contra un bucket **privado**, sin mirar `r.ok`; (3) la URL guardada era la ruta
  **pública** de ese bucket privado → rota igualmente. El lead quedaba `propuesta_enviada` con un enlace muerto.
- Arreglado: auth por sesión (el `empresa_id` venía del **body**, sin comparar con la sesión = frontera
  multi-tenant que dependía de que un uuid no se filtrase), Storage fuera (se sirve de `leads.propuesta_html`
  por `GET /api/admin/leads/[id]/propuesta`) y los dos `UPDATE leads` scopeados por empresa.
- **Corrige el aviso del PR #1392:** añadir `SUPABASE_SERVICE_ROLE_KEY` a ialimp **no** eleva privilegios de
  RLS — esa clave solo se usaba para subir a Storage, nunca contra Postgres. Y tras este PR ni eso.

### 🔑 (12/08/2026) El expediente de RR.HH. de ialimp NO puede escribir en Storage (PR #1392)
- El proyecto Vercel `ialimp` **no tiene `SUPABASE_SERVICE_ROLE_KEY`** por ninguna vía: ni propia, ni
  compartida enlazada, ni del equipo. Pero `lib/storage-limpiadora.ts` la usaba con `process.env.X!` →
  cabecera `Bearer undefined` → **401** al subir/borrar documento del expediente y al generar la nómina PDF.
- **0 errores de runtime en 7 días. Eso no era que funcionara: era que nadie lo había usado.** Se cobraría
  la primera vez que Vanessa generase una nómina.
- Salió de cruzar el inventario de la clave en Vercel (hecho para poder rotarla) contra los consumidores
  reales del código. Un solo nombre de variable en todo el monorepo, así que el mapa está completo:
  `ia-rest` ✅ (en TODOS los entornos, Development incluido — acotarlo al rotar) · `central-rrhh` ✅ ·
  **`ialimp` ❌ pese a usarla** · `plataforma` ❌ correcto (solo la nombra `secrets-registry.ts`, que es doc).
- El PR NO añade la clave (es de Alberto): cambia `!` por `requireSecret` para que el error **diga qué falta**.
- ~~⚠️ Al añadirla, `agente-cotizador` empezará a saltarse RLS~~ → **falso, comprobado el mismo día** (ver la
  entrada 💸 de arriba): esa clave nunca tocó Postgres, solo la cabecera de una subida a Storage. RLS es
  seguridad de fila en Postgres; ahí no había ninguna que saltarse.

### 🔒 (12/08/2026) Cero tablas sin RLS en `public` — eran las 2 de trading (PR #1395)
- `trading_cohetes_rebalanceo` y `trading_cohetes_track` eran las **últimas** de `public` con RLS
  desactivado (las otras 296 ya lo tenían). Aplicado por migración `rls_trading_cohetes`; verificado
  después: 0 tablas sin RLS y las filas (3 y 12) se siguen leyendo.
- **No cerraba una fuga**: `anon`/`authenticated` no tenían ningún privilegio, y los cinco roles que sí
  (app_user, postgres, prisma_plataforma, prisma_sivra, service_role) llevan **BYPASSRLS** → nada
  operativo cambia. Lo que fija es el suelo: un GRANT futuro a anon ya no las deja abiertas.
- Lo importante es la otra mitad: el `.sql` del repo hacía `DISABLE ROW LEVEL SECURITY` **explícito**,
  así que reejecutarlo habría deshecho la migración sin que nadie lo notase. Corregido en el fichero.

### 🕳️ (12/08/2026) Las cancelaciones NO EXISTEN en nuestra BD — el cuadro de mando es ciego a ellas
- Smoobu dice **269 noches canceladas contra 241 reservadas** (may-nov 2026, 67 cancelaciones). Se cancela
  más de lo que se consume y **ningún panel nuestro lo puede ver**.
- Comprobado columna a columna: `incomes` (13 col.) **no tiene estado ni flag de cancelación** — solo
  guarda el ingreso de lo que sí entró. `cleaning_sessions` tampoco. Es decir: no es que el dato esté a
  NULL, es que **el concepto no existe en el esquema**. Ninguna consulta puede responder «¿cuánto se
  cancela?» porque no hay dónde mirar.
- **La buena noticia: la puerta ya está abierta.** `pms_connections` tiene una conexión **Smoobu API viva**
  («Alberto Suarez — Smoobu», `pms_tipo='smoobu_api'`, `activa=true`, `sync_error` NULL, último sync
  12/08 12:11) con los CUATRO `apartment_id`: 352007 House Sevillana · 352928 Duplex Center · 352943
  Luxury Busto · 352418 Busto Reform. Hoy solo se usa para programar limpiezas.
- Siguiente paso natural: traer las reservas CON su estado por esa misma conexión y darles tabla propia.
  Sin eso, cualquier medida sobre el canal directo mide solo la mitad del embudo.
- ⚠️ Al mirar esto salió otra cosa: **`trading_cohetes_rebalanceo` y `trading_cohetes_track` tienen RLS
  DESACTIVADO** — expuestas a la clave `anon`, que es pública por diseño. Ver aviso al final.

### 🔗 (12/08/2026) Los SEIS botones de reserva de la landing iban a un dominio INEXISTENTE (PR #1390)
- `reservas.house-sevillana.com` **no tiene registro DNS**, ni su padre `house-sevillana.com`. Comprobado
  por dos vías (resolución del sistema y fetch → `ENOTFOUND`, distinto del «bloqueado por proxy» que da
  un dominio vivo). Ahí apuntaban hero, enlaces internos, `/barrio`, `/que-ver` y los dos de `/parking`.
- El botón principal de una web cuyo único objetivo es la reserva directa daba error de DNS. **Falla en el
  PRIMER paso, no en el último**, y explica el dato de GA4 mejor que ninguna hipótesis de diseño: 109
  sesiones en 12 meses y **1 clic saliente en todo el año**.
- Ahora la URL vive en `apps/housesevillana/app/reservas.ts`. Lo que arregla el fondo no es el valor: es que
  haya **un solo sitio donde equivocarse** — copiado seis veces no se revisa nunca, porque mirar uno no dice
  nada de los otros cinco. `app/enlaces.test.ts` lo blinda (verificado que muerde).
- Destino nuevo: `booking.smoobu.com/yourothercity?apartmentId=352007` — **enlace profundo**, entra directo
  a House Sevillana y sigue bloqueada en ella al cambiar fechas. Sin el id abre el portal multi-propiedad
  con las 4 casas. Validado con prueba real de huésped (solo tarjeta, Stripe live, sin sandbox).
- Por qué `reservas.house-sevillana.com` nunca existió: el campo «External link» de Smoobu **no aloja
  nada**, solo redirige enlaces a una URL propia YA montada. Nadie publicó la página con el iframe — así
  que aquello no fue un enlace que se rompiera, fue **un enlace que nunca llegó a funcionar**.
- ✅ Arreglado antes por Alberto en Smoobu: el método de pago por defecto era **PayPal en sandbox** (no
  cobraba). Ahora Stripe único y preseleccionado, verificado hasta la pantalla de pago.

### 🅿️ (12/08/2026) Landing housesevillana: `/parking` en 3 idiomas + auditoría de Chrome (PR #1390)
- Nueva `/parking` (es/en/it) — la búsqueda de más intención y menos competencia; la URL del anuncio de
  Booking ya es `house-sevillana-parking`. Dato clave y contraintuitivo: **la ZBE de Sevilla es SOLO la Isla
  de la Cartuja**; el casco histórico tiene otro régimen. Lo no comprobado (precio de la plaza, medidas,
  matrícula) se remite a Alberto en vez de rellenarse a ojo, y queda anotado en `app/parking/contenido.ts`.
- Dos fallos de i18n corregidos: `description`/`og:description` de la portada **nunca se tradujeron**
  (`/en` servía castellano a Google con el 72% del tráfico en inglés), y el `<title>` era clave de
  diccionario — el agente SEO reescribe esa frase cada lunes, así que el primer lunes la portada inglesa
  habría pasado a anunciarse en español sin error ni aviso. Ahora van por `Variante.meta`, por etiqueta.
- 🔴 **PENDIENTE URGENTE DE ALBERTO — el motor de reservas no cobra por defecto:** en Smoobu, PayPal está en
  **sandbox** Y es el **método por defecto**. Cambiar el default a Stripe (live, sí cobra) y desactivar PayPal.
- Auditoría de Chrome: Search Console verificado y sitemap enviado (**3 URLs → confirma que lo desplegado
  sigue siendo el repo viejo**; reenviar tras crear el proyecto Vercel). Smoobu: quedarse en Pre-paid, Flex
  sale **el doble** con el 0,9%. GBP: 1 reseña vs 50 de Booking (link `g.page/r/CX403tjxZhLaEBM/review`),
  web en `http://`, sin logo ni horario, posible **ficha duplicada**.
- ⚠️ Dato sin explicar y más gordo que la landing: **269 noches canceladas contra 241 reservadas** (may-nov).

### 🚨 (12/08/2026) CREDENCIAL EXPUESTA: `service_role` de Supabase en repo público — ROTAR
- Al traer `house-sevillana-landing` al monorepo, **gitleaks tumbó el PR**: 12 hallazgos en sus 64 commits.
- **El grave: una `service_role` del proyecto de PRODUCCIÓN `wswbehlcuxqxyinousql`**, commit `7c53e19`
  del **06/05/2026**, emitida el 15/04/2026 y **vigente hasta 2036**, en un repo **PÚBLICO** (`central`
  también lo es). Se salta el RLS → lectura/escritura total sobre la BD compartida de TODAS las verticales.
- Los otros 11 son claves `anon` (públicas por diseño, sin riesgo). En la historia hay versiones con el
  `ref` alterado a mano: alguien lo vio e intentó taparlo editando — **editar no borra la historia de git**.
- ⚠️ **PENDIENTE DE ALBERTO: rotar en Supabase.** Orden obligatorio: inventariar dónde se usa
  (env vars de los 8 proyectos Vercel + secrets de Actions) → rotar → actualizar → redesplegar. Rotar antes
  del inventario tumba producción. Revisar además logs de Supabase por si hubo uso ajeno en estos 3 meses.
- La landing se importó **SIN historia** (PR #1390) para no replicarla; silenciar gitleaks se descartó.

### 🗄️ (12/08/2026) Supabase ia-rest: 290 MB → 60 MB (eran logs, no datos)
- Alberto pregunta la capacidad usada. Compartida (`wswbeh…`) 137 MB, sana. Silo ia-rest (`efncqy…`) **290 MB**,
  de los que 252 MB eran infraestructura: `net._http_response` 123 MB con **368 filas vivas** (bloat puro,
  pg_net purga pero no devuelve el disco), `cron.job_run_details` 98 MB/158k filas desde el 04/05 (pg_cron
  **no purga por defecto** y nadie le puso retención) y `alerta_log` 31 MB/51.559 filas.
- **Bucle de alertas encontrado:** el 100% de `alerta_log` es del "Restaurante Demo" — 1.170/día EXACTAS,
  0 leídas, 0 actuadas. 3 comandas demo con items abiertas desde el 21 y 27/05 mantenían B1/S2/T5 en `activa`
  77 días; `limpiar-mesas-fantasma` solo cerraba comandas SIN items → nunca las tocaba.
- Hecho: VACUUM FULL de las 3 tablas + purga (7d cron, 30d alertas) → **60 MB**; migración
  `20260812_retencion_logs_y_mesas_fantasma.sql` con crons de retención diarios y corte de comandas >24 h.
  Verificado: 0 comandas vivas, 0 mesas ocupadas. **Ojo:** el silo NO tiene alerta de tamaño de disco. PR #1391.

### 🏠 (12/08/2026) CORRECCIÓN: la web de housesevillana SÍ existe — el fallo era la atribución
- Alberto desmonta el plan del PR #1387: «punto 4, para eso hicimos la web de housesevillana.es». Tenía razón.
- La landing **vive en OTRO repo** (`albertosuarezgutierrez-gif/house-sevillana-landing`, `app/route.ts`, edge);
  el puente es `apps/sivra/lib/seo-landing.ts:5` y el agente SEO la reescribe sola (último: 10/08/2026). Tiene
  motor propio (`reservas.house-sevillana.com`), WhatsApp de grupos, teléfono. Todo el copy es **grupos grandes**
  (6 dorm, 12 personas) → el «punto 4» que yo iba a proponer ya estaba ejecutado.
- **«DIRECTO = 0 €» era la etiqueta, no el negocio:** el directo de 2026 está como `portal='OTRO'` con
  **comisión 0,00%**, incl. **1.383,24 € por 2 noches** (≈691 €/noche, perfil de grupo). Fase 0 reescrita:
  arreglar atribución + **sacar el motor del pie de página** (hoy es el 3er botón a 13 px, junto a «Qué ver en Sevilla»).
- Causa del error, para no repetirla: se comprobó `apps/sivra` y se afirmó una ausencia **global**. Comprobar
  donde el dato viviría si existiera; si no aparece, escribir «no lo he encontrado», nunca «no existe».

### ⚽ (13/08/2026) Una jornada de liga ya no entra a x2.2 — democión por NOMBRE (PR #1405)
- Caso real (12/08, lo cazó el centinela #7): el websearch metió 'Sevilla FC vs Atlético de Madrid'
  (29-ago) y 'Sevilla FC vs Valencia CF' (13-sep) a factor x2.2 (nivel de final) porque el 'tipo' de
  la IA no traía palabra clave y el aforo caía en la curva general. Mercado real 0,82-0,85x su mes;
  Busto se infló a 235€ con mercado ~98-115€. Corregido a mano ese día (factor 1.15).
- `esPartidoLigaRegular(nombre)` en `eventos-impacto.ts`: el NOMBRE solo puede DEMOTAR a la curva
  plana un evento sin tipo reconocido ('otro'); nunca una final/eliminatoria (lista de exclusión) ni
  promociona/pisa un tipo ya reconocible. De regalo: Ticketmaster mandaba 'deportes' (plural) sin
  casar el regex. 6 tests nuevos (14/14).

### 🧊 (14/08/2026) Fix: el colapso por bloques dejaba noches congeladas SIN MEDIR nunca
- Verificación 100% de la primera pasada real del #1409: la prioridad de cola FUNCIONÓ (Booking midió
  primero los eventos confirmados vírgenes 20-sep y 11-oct)… y eso destapó el hueco: el plan colapsa
  un bloque contiguo en UNA ventana (la de mayor factor), pero la congelación es POR FECHA — medido el
  20-sep (Barcelona), el bloque dejó de estar virgen y el 18/19-sep (Bienal) quedaban congelados para
  siempre sin comps propios.
- Fix: `ventanasDeConfirmadosPorFecha` (puro) — el plan de BOOKING añade una ventana por cada fecha
  confirmada ≥1,15 sin colapsar (solo candidatas; el tope 12/pasada acota el coste). El sweep de
  Serper mantiene el colapso (paga por búsqueda y su corpus no descongela). Ensayado con datos reales:
  la próxima pasada dedica 12/12 huecos a noches congeladas (16-ago, 09/10-sep…).

### 🧊 (13/08/2026) Guarda «evento a ciegas»: una noche de evento confirmado sin mercado fiable NO baja
- Primera pasada real del verificador: 6 noches de la Bienal confirmadas solas (0,072€, 0 fallos, 0
  descartes indebidos)… y el motor las siguió bajando −20%/día hacia el ancla global — esas fechas
  tienen 0 comps fiables y el «no sé nada de esta noche» moría en `evaluado:false` sin oyente.
- **Decisión DELEGADA a Fable 5 por Alberto** («que el analice todo y tome la decisión»): congelar la
  bajada (subir sí) mientras la fecha no tenga ≥3 comps fiables; descongelado automático al medirse.
  Dato que decidió: la única noche de evento de sept. medida (26-sep) da p50 264€ vs ~104€ el mes.
- `decidirEventoACiegas` (centinela #5, puro) + guarda en `apply` (solo confirmados; generaliza la de
  Karol G a factor ≥1,15 y por FECHA) + cola de Booking prioriza evento confirmado sin medir + aviso
  🧊 agrupado con dedupe 7d (tabla `pricing_avisos`, migración aplicada). NO se bajó el umbral de
  `evento_sin_respaldo` (ruido). Los `descartado` ya no gastan ventanas del plan de barrido.

### 🔍 (12/08/2026) Los eventos PREVISTOS se verifican y deciden SOLOS (PR #1386)
- Alberto, ante el aviso 🔮 con 3 fechas de Mangafest: «esto tiene q ser automático, yo no sé de esta
  información». **Retirado ese Telegram**; decide el cron nuevo `/api/sivra/eventos/verificar` (05:30 UTC).
- Tres señales independientes (`lib/sivra/eventos-verificacion.ts`, puro, 23 tests): fila ya confirmada
  de la misma fecha con nombre parecido · búsqueda dirigida (confirma ≥0,8; desmentido → descarta) ·
  mercado real de esa noche (+25% sobre la línea del mes). **Caducidad a 21 días.**
- 🚨 Con la búsqueda caída NO se decide nada (solo cuentan las verificaciones ÚTILES) y el latido nuevo
  `sivra_eventos_verificar` se pone en rojo. Migración `2026-08-12_eventos_verificacion.sql` **aplicada**.
- Decisiones de Alberto: verificar y decidir solo (incl. auto-confirmar) · Telegram solo para pelotazos
  (factor ≥1,4) y para el latido. `decidido_por='alberto'` bloquea al cron. Diseño en `docs/superpowers/specs/`.

### 💸 (12/08/2026) Veredicto: intradía NO, y la mejor inversión no está en bolsa — `docs/INVERSION-VEREDICTO-2026-08.md`
- Alberto pregunta si meter toda la cuenta a intradía al 0,5-1% diario, y luego por cruces de medias.
  **No, con sus propios datos:** 227 ejecuciones reales 2026 → −34,0% YTD, acierto 17,2%, PF 0,28,
  esperanza −172 $/op (Kelly negativo). Retorno monótono por horizonte: **−1,88% a <1 día vs +1,16% a >10 días**.
- Cruces de medias ya medidos: `momentum` (EMA12/26+MACD) es la PEOR del torneo (hit 24,1%, ret −0,63%).
  Backtest propio SPY 30 min/77 sesiones: ninguna variante bate comprar-y-no-tocar (+8,43%).
- **Hallazgo grande:** comisión Booking = 19,72% real (`amount_gross−amount`), **120.635 € en 5 años**;
  en 2026 (22.504 €) supera la pérdida bursátil (16.698 €). DIRECTO en 2026 = 0 € con `apps/sivra` y la
  skill SEO ya construidas. Booking = 92% de facturación (riesgo de canal: Airbnb 42.460 €→1.219 €).
- Regla dura añadida a la skill `trading-analista`. Decisión de no operar en real SIGUE vigente. PR draft #1387.
- **Plan de reservas directas** (`docs/PLAN-RESERVAS-DIRECTAS.md`). Palanca clave: Booking renunció a la
  paridad de precios en el EEE el 02/12/2024 (DMA art. 5(3)) → **legal ser −10% en web propia**.
  Meta año 1: 20% directo ≈ 5.000 €. ⚠️ **Diagnóstico inicial CORREGIDO el mismo día — ver entrada 🏠.**

### 📧 (12/08/2026) facturas-correo — pasada diaria sin novedades
- Vía B sana (`dias_caido=0`), backlog `PDF-pendiente`/`Revisar` vacío, 0 candidatos Gmail y 0
  subidas manuales nuevas.
- Paso 4.0: única fila `sin_revisar` (Endesa-Dúplex marzo, 69,21€) ya estaba conciliada de antes
  (mismo `factura_ref`) — solo faltaba el FK `movimiento_id`, backfilleado en Supabase.
- PR draft #1383 (solo bitácora) abierto y en seguimiento (`subscribe_pr_activity`).
- Pendiente sin resolver: `search_threads label:Facturas/Extraccion-fallida` (Label_16, 1 mensaje
  según `list_labels`) devuelve vacío — posible lag del índice del conector Gmail, revisar a mano.

### 🏷️ (12/08/2026) El contraste diferido casi anula tesis BUENAS: el ref con la fecha corrida
- Mergeado **#1370** (contraste diferido, opción (a)). La pasada del 11/08 —primera con #1363 en prod—
  salió perfecta: **22 símbolos** (13 la víspera), **0 vetados**, 0 anulados, 4 huellas + 2 latidos,
  1 sola pasada. El arreglo del veto falso funciona en real.
- Al probarlo contra IBKR apareció un fallo del propio #1370: una pasada que corre ANTES del cierre
  guarda bajo la fecha de hoy el **cierre de AYER**. El repaso manual del 06/08 (09:34 UTC) dejó MSFT
  en `precio_ref` 487,46 con cierre real 499,86 → **−2,48%, por encima del umbral: habría anulado esas
  tesis**. Y 487,46 es al céntimo el cierre del 05/08 (CVX igual, pero su desvío se quedó en −1,49% y
  no llegó a saltar: no se vio antes por suerte del mercado, no porque no estuviera).
- Arreglo (**PR #1382**): `ETIQUETA_TOL` — si el ref se parece al cierre de la sesión ANTERIOR mucho más
  que al de la suya, es la etiqueta corrida, no un precio malo: no se juzga ni se anula, y se canta.
  Un precio envenenado no se parece a ninguno de los dos, así que sigue cayendo. 50/50 tests.
- Skill `trading-analista`: sección nueva **«cuándo se corre y por qué importa la hora»** (repasos a mano,
  SIEMPRE después del cierre americano).

### ⏰ (11/08/2026) Recordatorios de seguimiento del laboratorio de inversión (decisión: seguir en paper)
- Alberto, tras el informe de la auditoría: **seguimos en paper** («ok seguimos entonces») + recordatorios.
- Trigger **quincenal** `trig_01FJtQFiEMVGnEj9vpdBYA3f` (días 1 y 15, 08:00 UTC, sesión nueva + push):
  informe del forward vs SPY, escalera con cobertura, cohetes y veredicto sobre dinero real. Solo escribe
  en memoria/PR si hay cambio material. **One-shot** `trig_014V3ytMp9JZPwnbkEPxZRWu` el 16/11/2026
  (hito ~4 meses de la cohorte 18/07 → evaluar Tramo 2; push+email).
- ⚠️ Limitación: los triggers por MCP no almacenan conectores en esta org → el prompt lleva plan B
  (leer el hero de `/invitado/trading` con el token de `trading_acceso_token`; si se rota el token,
  `update_trigger`). Documentado como rutina 14 en `docs/RUTINAS-PROGRAMADAS.md`.

### 🛡️ (11/08/2026) Auditoría completa del laboratorio de inversión + guardián de datos en TODOS los caminos
- Origen: Alberto vio a RDY nº 1 (score 6,03) — EY 682% (ADR en rupias, familia ORCL #1189). **#1373**: la página
  puntuaba la caché CRUDA (el guardián `calidad-datos.ts` solo lo aplicaban cron y analisis-simbolo) →
  `neutralizarUniverso()` + backfill BD (RDY/BMNR/VRSN). Verificado en prod: nº 1 ahora SNDK, RDY score null.
- **#1374**: mismo agujero en `/api/trading/seleccion` (¡la ruta que congela cohortes!), caza-cohetes y `/factores`.
- Auditoría (agente + SQL): 🔴 PENDIENTE GORDO — el walk-forward que alimenta la 🪜 escalera mide con ventanas
  DESALINEADAS (series truncadas de Stooq → retorno de otra ventana; riesgo cesta vs bench en longitudes distintas)
  y sin declarar cobertura. 🟡 momentum sin ventana declarada ni guarda de costuras; Piotroski NULL→0 regala puntos;
  cohetes sin precio se congelan a precio de entrada; `/analizar` se cree el nav del body; Dataroma caído = «sin gurús».
- Track real (23 días): cesta mediana +0,24% vs SPY +4,20% (baten 3/8) · cohetes −2,6% (alpha −7,2%) · torneo hit 26-28%
  ret ~0 (n=460) · Tramo 1. Sin señal de ventaja aún — la decisión de no operar en real sigue vigente.
- **El 🔴 gordo ARREGLADO en la misma sesión:** nuevo `module-trading/medicionAlineada.ts` (series FECHADAS,
  misma ventana cesta/bench, cobertura declarada — serie truncada de Stooq → `sinDatos`, nunca un retorno de
  otra ventana); `paper-tracker` migrado y la escalera gana gate `cobertura ≥ 80%` (enmienda de
  operacionalización, `COBERTURA_MIN_ESCALERA`). Quedan 🟡: momentum/costuras, Piotroski NULL→0, cohetes
  a precio de entrada, nav de `/analizar` sin contrastar, Dataroma caído = «sin gurús».

### 🔁 (11/08/2026) FK real facturas↔banco y el barrido del backlog como paso OBLIGATORIO
- Cierre del hilo de la factura 47/2026 (#1372). El fallo de fondo no era de dato sino de método: la pasada
  solo miraba el correo nuevo, así que su «sin novedades» era cierto sobre la bandeja y falso sobre la
  contabilidad — 11 facturas archivadas llevaban desde enero sin cargo casado.
- **Causa estructural:** `facturas_drive` y `movimientos_bancarios` no tenían relación; el único puente era
  `factura_ref`, texto libre con 4 formatos. **FK APLICADA** (Alberto: «tira con la FK»):
  `facturas_drive.movimiento_id` + `sin_cargo_motivo` (migración `2026-08-11_facturas_drive_movimiento_fk.sql`).
  **Tres estados**: casada · `revisada_sin_cargo` (con motivo) · `sin_revisar` — un NULL ya no es «no hay».
- Backfill 2026 de las 38: **29 casadas** (25 automáticas + 4 a mano), **8 revisadas sin cargo** (Pepephone
  ene–jun y Giraldillo mayo `sin_cargo_localizado`, CREATE junio `duplicada`), **1 sin revisar a propósito**
  (Endesa Dúplex marzo: su cargo se separa 9,70€ y no 5,78€ del patrón → que alguien abra el PDF).
- Nuevo **Paso 4.0** en la skill: toda pasada abre `v_facturas_sin_cargo` ANTES de conciliar lo del día, y
  al conciliar escribe la FK (o el motivo). PR #1376. Pendiente de Alberto: Pepephone (¿cuenta de la SL?) y
  si el Giraldillo de mayo está sin pagar.

### 🧾 (11/08/2026) Conciliada la factura 47/2026 de Jaime Salas (electricidad Socorro 24)
- Alberto preguntó por el cargo `TRANSF. 2100 FACTURA 472026 REPARACIN ELECTRICIDAD` −278,30€ (Kutxa, 07/08),
  que salía ❌ en `/finanzas`. La factura SÍ estaba archivada desde el 07/08 (Drive `1BNr2lF0…`, fila en
  `facturas_drive`, proveedor `jaime-salas-electricidad`); lo que faltaba era la conciliación bancaria.
- Causa: la pasada del 07/08 archivó la factura ANTES de que el cargo entrara por PSD2 (feed iba por el 06/08),
  y al importarse después cayó con `destino='personal'` por defecto — nadie volvió a recogerlo.
- Movimiento `1b1204d7` actualizado: `turistico_pisos` · `prop_house_sevillana` · `conciliado=true` ·
  `destino_confirmado=true` · `factura_ref` al PDF de Drive. Deducible al 100% (gasto corriente).
- **Barrido del mismo fallo en todo 2026** (Alberto: «mira si hay más facturas sin conciliar»): 10 más
  casadas — 8 recibos EMASESA (ene/mar/may, los 3 pisos, con `propiedad_id`; los de mar y may traen el
  nº de factura en el propio concepto), CREATE ventilador Socorro 123,45€ e IONOS 1,82€.
- **PriceLabs resuelto por Alberto (11/08): «es por el cambio».** Factura SIEMPRE 64,96 USD el día 8 de
  cada mes (feb–jul) y el banco carga el euro del día — 54,99 · 55,91 · 55,59 · 55,38 · 56,38 · 56,98€.
  La diferencia es solo FX, no un descuadre. Conciliado el cargo de junio (56,38€) con su PDF; feb, mar,
  abr, may y jul siguen sin PDF archivado (hay que bajarlos del portal). El deducible es el EURO cargado.
- Quedan 4 avisos SIN tocar (necesitan a Alberto): Pepephone ene–jun (6 PDF archivados y **ningún**
  cargo suyo en las cuentas de Alberto → probablemente se carga en la cuenta de la SL); lavandería
  Giraldillo mayo 504,57€ sin cargo (paga el mes vencido; el de abril sí está); Endesa Dúplex 24/07
  87,42€ con cargo pero sin PDF archivado; fila duplicada en `facturas_drive` del ticket CREATE
  (`create-socorro` + `create_ventilador`, mismo importe y fecha, distinto fileId — el banco solo tiene
  UN cargo).

### 📈 (11/08/2026) /trading rediseñado: hero con las 2 respuestas (empresas + rentabilidad)
- Petición de Alberto: la página daba mucha info; lo que importa es qué empresas interesan y cómo va la cartera.
- Hero doble arriba (💡 señales 📈 + top ranking + compras del agente · 📊 mediana vs SPY + curva + tramo escalera);
  onboarding condensado a 1 línea; forward paper, cartera cohetes y caza-cohetes PLEGADOS.
- Nuevo `DetallePerezoso.tsx` (details con montaje perezoso — la cartera de estudio ya no paga fetch+Recharts si nadie la abre).
- Honestidad de datos: banner «datos parciales» si falla una query (antes un fallo de BD pintaba el 🌱 vacío),
  alpha/IPO null ya no salen como ⚠️/0€, celda de señal «no calculado» fuera del top-20; fixes móvil 320px + hex→tokens.
- **PR #1368 MERGEADO y verificado en producción** (hero servido, 0 errores runtime; revisión previa con
  agente de diseño). Follow-up: 401 de `/api/trading/cartera-estudio` al invitado ya no se pinta como «fuente caída».

### 🔀 (11/08/2026) Rescatados los 2 PRs con semanas en conflicto: #755 y #1055 MERGEADOS
- Orden de Alberto tras el FYI de la auditoría. Conflicto en ambos = memoria (sus entradas de julio
  chocaban con la rotación mensual) + radiografía generada; las entradas se archivaron en
  `docs/memoria/2026-07.md` (05/07 CSV con su caveat; 21/07 mariscos) y se regeneró la radiografía.
- **#755** banca: importar extractos CSV (tests 6/6; ⚠️ caveat: re-importar el export completo sin IBAN duplica el ledger).
- **#1055** NUEVA vertical `apps/mariscos` + `@central/module-pesca` (Fase 1 trazabilidad/etiquetado, 8/8 tests, build OK).
  **Pendiente para darla por viva:** proyecto Vercel (Root `apps/mariscos`), ejecutar su SQL en Supabase
  (preview→prod), sembrar cuenta real de Mariscos González; Fase 2 báscula/etiquetadora.

### ⚖️ (11/08/2026) Contraste diferido: la 2ª fuente juzga AYER, que es lo que sí ha publicado
- Mergeado **#1363** (el contraste del mismo día dejaba de vetar precios buenos) y desplegado en prod.
  Efecto colateral asumido: a las 20:30 UTC la fuente casi nunca tiene el cierre del día → contraste inerte.
- Alberto elige la **opción (a)**: comparar el cierre que la fuente SÍ publica de la sesión D contra
  nuestro `precio_ref` de D. Siempre disponible, cero falsos vetos; el remedio cambia — en vez de vetar
  el precio de hoy, **anula la tesis de ayer** (y su resultado) antes de recalcular el walk-forward.
- `juzgarDiferido` (puro, 9 tests) con dos frenos: un **split** desplaza TODAS las sesiones por el mismo
  factor → no se anula; si discrepa en **>½ de los símbolos** (≥4 con dato) la sospechosa es la FUENTE y
  tampoco se anula nada. El mínimo de 4 salió de un fallo real: sin él el interruptor se disparaba con un
  solo símbolo y la guardia quedaba muda justo en el caso que existe para cazar.

### 🔧 (10/08/2026) Pricing: el reparto mes/global del factor de demanda deja de perderse (#1361)
- `factorDemandaFecha` decidía por fecha si la demanda se mueve con la ocupación DEL MES o la anual,
  pero esa decisión solo viajaba en la respuesta HTTP del cron (nadie la guarda) — y su `.catch(() => [])`
  hacía que un fallo de la consulta cayera TODO a factor global sin un solo error en el log.
- Fix: `pricing_applied.demanda_fuente`/`demanda_gateada` por fecha (filas viejas a NULL a propósito) +
  aviso Telegram si la ocupación mensual es ilegible. `ok` no pasa a false (degradación, no fallo).
  Migración `2026-08-10_pricing_applied_demanda.sql` aplicada antes que el código. Detalle en skill
  `pricing-agente` (`estado-y-protocolo.md`).

### 🛡️ (10/08/2026) La 2ª fuente vetaba precios BUENOS: el contraste comparaba contra la sesión anterior
- La pasada del lunes 10/08 corrió **entera y por primera vez con las 4 huellas + el latido
  `trading_analizar`** (20:33 UTC). Pero vetó 8 de 21 símbolos en `/analizar` y descartó 5 precios
  en `/puntuar` — **ninguno estaba mal**.
- Causa: la pasada corre a las 20:33 UTC, media hora tras el cierre de Wall Street; Stooq/Yahoo aún
  publicaban el cierre del **viernes 07/08** (verificado contra IBKR) y `DIAS_CONTRASTE_MAX = 5` lo
  aceptaba *como si fuera el de hoy*. Cada «divergencia» era el hueco viernes→lunes de esa acción.
- Arreglo (**PR #1363**): el contraste **solo acepta el cierre de la MISMA sesión** (`juzgarPuntos`,
  puro y testeado con los datos reales del 10/08); si la fuente va por detrás → `desfasados`, que no
  veta y se canta en el latido. Consecuencia asumida: **el contraste queda inerte casi todas las
  noches** a esta hora — visible, no silencioso. Pendiente de decisión de Alberto: contraste diferido
  (comparar el cierre publicado contra nuestro `precio_ref` de ESA fecha) o cron aparte unas horas después.

### 💸 (10/08/2026) Decisión: Alberto deja de operar en real hasta aviso del agente
- Dos operaciones manuales reales en IBKR hoy con stops demasiado pegados: SPCX (270 acc.
  a 134,25 $, stop −2,35% saltó en 1 h, −855,10 $; luego recuperó POR ENCIMA de la entrada)
  y PLTR (200 acc. a 178,04 $, stop −0,72% saltó en 46 min, −258,77 $). Total −1.113,87 $.
  Confirmación en vivo de H9: el stop convierte el bache temporal en pérdida cerrada.
- **Decisión (sesión de solo charla, anotada a mano):** no operar más en real por impulso;
  esperar los avisos del agente `trading-analista`. OJO: el agente sigue en Fase 1 (paper) —
  sus ideas por Telegram son simuladas y la puerta a Fase 2 sigue cerrada (decisión de Alberto).
- Alberto pide **aviso explícito cuando el forward justifique plantear Fase 2** (hoy lejos:
  hit rate 26-29%, retorno medio ~0 sobre n=103 en `trading_estrategia_stats` al 08/08).

### ✅ (10/08/2026) Confirmación final: motor 100% operativo y probado tras la baja de PriceLabs
- **Prueba reina:** snapshot Smoobu 10/08 = últimas escrituras del motor del 09/08 **al euro en
  604/604 fechas** (129/205/103/167 por piso). PL mudo post-pausa (0 divergencias 14:30↔20:30).
- Alertas «precio_revertido» del guard 07:31 = restos PRE-pausa (últ. escritura 08/08, PL las pisó
  antes de las 15:00 del 09/08); la pasada 08:30 de hoy ya re-escribió las 7 → se autolimpian.
- Pasada 08:30 sana: 455 escrituras, 0 bajo suelo, 0 bajadas fuera del raíl (106 subidas sobre-raíl
  = suelos/eventos/ancla, legales por diseño). Previstos v2 verificado en vivo (House 25-nov 467 =
  base×1,25 ASEICA). 1ª reserva House bajo el motor: 11-13/09, 672€/noche ≈ 1,4× p50 fiable.
- **Vigilancia diaria 09:00 UTC** (`trig_01Eagedr...`) sigue hasta el OK de Alberto; PR #1345 mergeado.

### 💶 (10/08/2026) Pricing sivra — ciclo semanal completo (4 pisos)
- Ciclo semanal del agente de pricing: los 4 pisos (no solo los ya en vivo). Mercado real Booking
  (aforo real) para may/jun/jul-27 (estaban con 1 sola fecha, rancios) — 120 comps nuevos, ninguno a 0.
  Propuestas dry-run aplicadas por los raíles en los 4 pisos; circuit-breaker sano.
- Hallazgo: el bucket MENSUAL de junio-27 queda inflado por Karol G (11-13 jun) — el finde normal
  (25-27 jun) vale 126€ real, no los 339€ del mes. Usar siempre fecha exacta, no el mes, en junio.
- Pendiente: confirmar con Alberto si la venta de Busto-Feria (17-abr-27) a 103€ es real (sin fila en
  `incomes`) o un bloqueo/desfase; revisar 3 fechas de Luxury marcadas "no_disponible" pese a libres.
- Detalle en `pricing_aprendizaje` y `pricing_decisiones` (fuente=`agente_ciclo_10_08_2026`).

---

### ⏳ (09/08/2026) Last-minute encendido · sin techo de precio (decisión) · barrido PL de baja
- **Decisión de Alberto (2 palancas):** (1) **SIN techo** — `max_price` queda NULL a propósito
  («no tope! final copa rey hay q aprovechar»; el raíl permite bajar a tiempo). NO re-proponer.
  (2) **Last-minute ON**: `lastminute_k=0.5` en los 4 pisos, con su condición «que ganemos dinero,
  si no prefiero no vender» — cubierta porque el descuento va ANTES de min_price/suelo estacional/raíl
  y las noches de evento no se rebajan. De paso `seasonal_floor_k` 0→1 en Dúplex/House (venían del
  dry-run). SQL registro: `prisma/sql/2026-08-09_lastminute_activado.sql` (aplicado ~16:00 UTC).
- **Barrido «PriceLabs de baja»** en memoria/skills/facturas-control/UI → PR #1345 (draft).

### 🌊 (09/08/2026) Lente costa norte en mercado: preferencia por viviendas de playa Asturias/Cantabria
- **Preferencia de Alberto** (con una casona en Colunga, 235.000€/257 m²/~914€/m²): «da preferencia a
  casas como estas, cerca de playa en el norte». Nueva lente PURA `costa-norte.ts` en `module-subastas`
  (litoral asturiano+cántabro, matching por palabra completa — «Isla»/«Salinas» fuera por Isla Cristina)
  + `lenteCostaNorte`: viviendas sin señales de obra AUNQUE no lleguen a chollo (en el norte casi nunca
  hay mediana de zona; referencia null SE DICE, no se calla). `lentesMercado()` en plataforma: sección 🌊
  en el Telegram del cron `subastas-mercado` y en /subastas; chollos de esas zonas etiquetados 🌊 y primero.
- **MERGEADO** (#1346 + fix #1347) y probado contra el corpus real (741 comps, 99 en zona norte — las
  alertas ya cubren Gijón/Villaviciosa/Llanes): lente 93 viviendas, 15 chollos 🌊, 0 falsos positivos del
  sur. El fix #1347: un descuento de derribo (>50%) saca de la lente (la derruida de Llanes salía 1ª con
  −73% y título limpio — la doctrina del peaje de obra aplica también aquí). Prod desplegado y verificado.
- **Refinada por Alberto y MERGEADA (#1349):** solo CASAS (pisos fuera), tope 230.000€, +Islantilla
  como zona preferente; orden rebajadas→particular→descuento (ordenan, NO filtran — exigir rebaja
  escondería el recién publicado mal preciado). `dedupeRelistados`: Idealista re-publica con ref nuevo
  (piso de Ceares duplicado en la UI, verificado en BD) — colapso por (portal,título,precio,m²) al corpus
  entero. Corpus real: 11 casas ≤230k (Villaviciosa −49%, 6 adosados Islantilla), 43 re-listados fuera.
- **3ª ronda (#1351, mergeado):** (a) la preferencia llega a SUBASTAS — vivienda en zona 🌊 suena SIEMPRE
  en `subastas-avisos` con cabecera «🌊 TU PREFERENCIA» aunque el filtro rentable/limpia la silenciara
  (honestidad: el aviso dice si va sin verificar); (b) **Matalascañas** entra como zona preferente tras
  medirla en vivo (Fotocasa: 216 anuncios vs 133 Islantilla, mediana 2.857 vs 3.308 €/m²); (c) pestaña
  **🔥 Oportunidades** default de /subastas (diseño del agente Plan): bloque 🌊 fijo + lista única
  portal+subastas por atractivo, tarjeta compacta de subasta, filtros casas/rebajados/particular/fuente.
- **4ª ronda (#1353, mergeado y READY en prod):** Alberto creó la alerta de Idealista en Matalascañas SIN
  límite de precio (casas/adosados) → `ZONAS_SIN_TOPE = ['Matalascañas']` en la lente (el tope 230k sigue
  en el resto); copy de Telegram y /subastas lo dicen. Las SUBASTAS ya iban sin tope (el aviso forzado 🌊
  nunca filtró por precio). Decisión de estrategia: Asturias = chollo puro con gestora (~20-25% comisión);
  Huelva = uso mixto autogestionado — el radar vigila ambas. Skill `plataforma-maestro` actualizada.
- **5ª ronda — rediseño de 🔥 Oportunidades** («veo muy destartalada la página y poco clara», agente de
  diseño): UNA tarjeta `TarjetaOportunidad` para chollos/preferentes/subastas (precio 20px primero, chips
  homogéneos `ChipUI` con tokens --positive/--warning/--info, evidencia €/m² siempre visible, resto plegado
  en «Más datos»); cabecera con contador real + explicación en `<details>`; 🌊 en caja --info-bg colapsada
  a 5 con «Ver todas (N)»; filtros en fila scrollable (320px OK). Solo presentación, lógica intacta.
- **Repaso 12/08 EJECUTADO — todo sano:** corpus fresco (844, último hoy 05:50) y avisos vivos (93
  chollo_avisado_at en 7d, último hoy 06:21; Islantilla/Ribadesella avisados hoy); crons subastas al día
  (ingesta 06:00 · enriquecer 06:16 · radar 06:30); 0 errores runtime en rutas subastas (48h). Matalascañas
  sigue en 2 comparables PERO la alerta de Idealista SÍ llega (digest diario: «Viviendas en Matalascañas,
  Almonte — Nada nuevo por aquí hoy») — no hay chalets nuevos publicados, no es fallo. 0 subastas vigentes
  en zona 🌊 ahora mismo (el aviso forzado no ha tenido con qué dispararse; camino fijado por tests).
- Ojo: la lente solo ve las alertas guardadas — para vigilar más norte, crear alertas de Idealista en
  esas zonas. Galicia/Euskadi pendientes (patrón Cádiz).

### 🎯 (09/08/2026) Los 4 pisos bajo el motor · PriceLabs de baja · previstos v2 · fix verificado en vivo
- **Decisión de Alberto:** «el agente coge las riendas de los 4 apartamentos». Los 4 con
  `apply_enabled=true` + `channel_markup=1.0` (SQL aplicado tras deploy del PR #1337, mergeado).
  Pasada real 14:30 verificada: 4 pisos escritos, anclas al euro de lo predicho (House 4-sep 421€,
  Dúplex 13-nov 149€…), raíl ±20% respetado vs ancla diaria; 0 alertas nuevas.
- **PriceLabs:** Alberto pausó Dúplex/House en PL ~15:00 UTC (medido: 1.140/1.653 escrituras suyas
  sin motor esa semana; Busto/Luxury ya limpios). Curva PL persistida como suelo (120 días).
  Vigilancia: test de silencio de PL tras pasada 20:30 + snapshot y guard mañana (triggers armados).
- **Previstos v2 (idea de Alberto, riesgo asimétrico):** evento `previsto` LEJANO (≥60d) sube precio
  ponderado por confianza (×0,5); cerca se retira solo; confirmado = factor pleno. Tests 1.081 verdes.

### ✅ (09/08/2026) Pasada diaria de trading completada — 2 PRs mergeados en caliente para arreglar `date - bigint`
### 🔀 (09/08/2026) Backlog de PRs revisado y drenado: 3 mergeados, 1 superado, 2 a decisión
- Revisión "que no sea antiguo lo pendiente": mergeados #1304 (informe auditoría 08/08), #1329
  (auditoría profunda 09/08 + landmines subastas en CLAUDE.md + watchdog 3 tramos en RUTINAS) y
  #1333 (entrenador: fix `fecha`→`fecha_operacion` en `psd2-health-check` + poda bitácora),
  resolviendo sus conflictos de inserción contra el vivo podado. #1340 (::int trading) ya estaba en main.
- **#1323 (demanda por mes) SUPERADO a medias:** main ya tiene OTRO `pricing-demanda.ts` (gateo por
  antelación, 09/08) con API distinta; lo que #1323 añade de más (ocupación POR MES + boost
  `mes-anticipado`) hay que rehacerlo sobre el código nuevo — no mergear tal cual (ver Estado vivo).
- #1055 (mariscos) y #755 (CSV banca) siguen a decisión de Alberto. Verificado post-merge: CI verde
  ×3, rotación 17/17 + dry-run limpio, 0 marcadores de conflicto, vivo en 17 KB.

### 🔴 (09/08/2026) Pasada diaria de trading BLOQUEADA desde el despliegue de la guardia de precios — fix en PR draft
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

### 🛡️ (09/08/2026) Auditoría PROFUNDA semanal — todo verde, PR #1329
Pasada completa `auditoria-central` (no solo la ligera): typecheck 0 errores en las **8 apps**, tests
sin fallos, sin secretos con fallback literal, Supabase advisors 0 ERROR, heartbeat de crons/agentes
limpio, automerge de rutinas sano. Único hallazgo: 21 vulns de `pnpm audit`, ninguna explotable
(documentado). Reconciliados 2 docs desactualizados que #1328 (ligera, mismo día) no cubrió:
`apps/plataforma/CLAUDE.md` (subastas sin los PRs #1324/#1325/#1327) y `docs/RUTINAS-PROGRAMADAS.md`
(watchdog de trading descrito con 2 tramos en vez de 3, huella de pricing desactualizada). Informe
completo `docs/AUDITORIA-2026-08.md`.

### 🤖 (09/08/2026) agentes-entrenador — pasada semanal (29/07→09/08): backlog sano, un fix trivial
- Backlog de PRs `claude/*` abiertos: **5** (bajando desde 73→31 del barrido de Alberto de 29/07) —
  sin crecimiento, sin necesidad de escalar. `FEEDBACK-AGENTES.md` sin pendientes.
- Único fix: `psd2-health-check/SKILL.md` usaba la columna `fecha` (no existe; real
  `fecha_operacion`, confirmado contra Supabase) — señalado el 05/08, corregido ahora.
- Resto de fallos del rango (tope real de mercado-booking, sonda pricing en verde falso) ya
  resueltos por PRs de sus propias sesiones (#1314, #1318) antes de esta pasada.
- 🔇→✅ Canal Telegram mudo (401, `ALERTA_TOKEN` desincronizado) — a petición de Alberto, resuelto en la
  misma sesión SIN tocar Vercel: registrado el token que ya lleva esta rutina en `rutina_tokens`
  (3ª vía de `docs/AVISOS-AGENTES.md`). Verificado end-to-end (200 + Telegram real recibido). Ningún
  tool de Vercel MCP expone env vars — la sincronización byte-a-byte en Vercel sigue sin ser algo que
  una sesión pueda ejecutar.

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
- **VERIFICADO en producción (10/08/2026, 2ª pasada — la 1ª fue el bootstrap):** 34 correos leídos
  (23 idealista + 11 fotocasa, «desde uid N») frente a 300, **55s** frente a 284s, y **cero cortes por
  presupuesto** — fichas de anunciante y zonas se enriquecen enteras por primera vez desde el 05/08.

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
## 🟡 (21/08/2026) El Telegram del PSD2 contradecía al panel — PR #1575
- Alberto: «me dice esto y en mi panel pone q todo ok». **Mentía el Telegram**, no el panel:
  Kutxabank ****0855 con último mov. del 20/08 (34 en 30d) y el sync de hoy 06:00 limpio; el único
  aviso era la nota ℹ️ de la ventana de 89 días rechazada (el feed va con ventana corta, no roto).
- El corte «ℹ️ = informativo» se puso en `psd2-semaforo.ts` el 17/08 y NUNCA llegó al cron, que
  gritaba «el banco no está entregando movimientos» con `if (avisos.length)`. Ahora usa el MISMO
  `partirAvisos()`; una nota sola se cuenta UNA vez (dedupe por `claveAviso`, que neutraliza la
  fecha ISO: la ventana corta se corre sola cada día y el texto crudo repetiría el aviso a diario).
- Otra mitad: `/banca` solo pintaba `detalles` si el nivel ≠ 'ok' → la nota era INVISIBLE en verde.
  Sale a campo propio `EstadoFeed.notas` y se pinta también en 🟢.
- Verificado contra los avisos REALES de `conexiones_banco`: hoy y mañana (fecha corrida) → silencio;
  con un aviso de fallo → alarma; primera aparición de la nota → un aviso ℹ️ sin alarma. Panel: verde
  con la nota visible. Landmine en `apps/plataforma/CLAUDE.md` y aviso en la skill `psd2-health-check`
  (un `ℹ️` NO es anomalía; el corte canónico es `partirAvisos()`).
- Anotado sin tocar: `getEstadoFeedPsd2` mide frescura por MAX entre cuentas (BBVA a 4 días queda
  tapada). Por cuenta daría falsos positivos: la BBVA tiene huecos reales de hasta 10 días.

## 💓 SES: latido del transporte antes que el conector (20/08/2026)

Chekin es hoy el emisor real de los partes en los 4 pisos → el proyecto es **sustituirlo**, no
evitar la multa. Y `pre-ses` da 502 a todo: **no hay sandbox**, así que se empieza por vigilar.
Nuevo `packages/module-ses` (ZIP+base64 —**no gzip**, era el bug del 10111—, sobre SOAP, envío y
clasificación de respuesta) + cron `/api/cron/ses-latido` (07:15, operación `C`, SOLO LECTURA) que
deja huella en `agente_latidos.ses_transporte`. El veredicto separa «SES caído» (esperar) de
«credenciales/alta» (portal): un aviso que no distingue se deja de leer. Urgencia real: la hoja de
`*.ses.mir.es` **caduca el 03/09/2026**. Envs pendientes en Vercel: `SES_USUARIO`, `SES_PASSWORD`,
`SES_ARRENDADOR`. PR #1555.

## 🔒 (20/08/2026) SES.HOSPEDAJES: el TLS de *.mir.es NO valida con CA pública — PR #1550 (merged)

Probada la conexión REAL a los dos endpoints de SES (desde una Edge Function de Supabase, porque el
contenedor tiene `*.mir.es` bloqueado por el proxy): **`invalid peer certificate: UnknownIssuer`**,
y se repite cargando el bundle Mozilla entero (121 CAs). CertSpotter da **cero emisiones** en
Certificate Transparency para `hospedajes.ses.mir.es` → SES usa una CA de la Administración, no
pública. Por eso la implementación de referencia en Python usaba `verify=False`. 🚨 El conector
versionará el PEM en `packages/module-ses` + `NODE_EXTRA_CA_CERTS`; NUNCA desactivar la verificación.
Las credenciales SIGUEN sin validar: el fallo es anterior a la autenticación. Función `ses-probar` inerte.
🚨 Además, el RD obliga a MÁS que comunicar: firma del parte por cada mayor de **14** años (digital vale)
y conservar el registro **3 años**. Spec §4.6 y §4.7. ⚠️ Lo legal está en fuentes secundarias: el proxy
bloquea boe.es — falta contrastarlo con el BOE o la asesoría antes de implementar.


## 🛂 (20/08/2026) SES.HOSPEDAJES: diseño de la conectividad (parte de viajeros) — PR #1550 (draft)

Fase de arranque del RD 933/2021 (comunicar viajeros al Ministerio en <24h; multas 100 €–30.000 €).
Solo diseño, aún sin código: `docs/superpowers/specs/2026-08-20-ses-hospedajes-conectividad-design.md`.
Protocolo verificado: SOAP a `hospedajes(.pre)-ses.mir.es/hospedajes-web/ws/v1/comunicacion`, Basic auth,
`<solicitud>` = XML `altaParteHospedaje` en **gzip+base64**. Decisiones de Alberto: conector PROPIO (no
Smoobu/Chekin), check-in web con OCR por IA **con confirmación humana**, y **solo nuestros 4 pisos** de
momento (el resto de ideas —venta a terceros, uso comercial de los datos, RH, vehículos— en §9 del spec).
🚨 Desde el contenedor NO se alcanza `*.mir.es` (proxy): toda prueba contra SES es desde Vercel.
Pendiente: que Alberto revise el spec → plan de implementación. Códigos/credenciales NUNCA al repo.


## 💹 (09/08/2026) La palanca de DEMANDA ya mira el MES, no el año — PR #1323 (draft, rehecho sobre #1337)
- #1337 (mergeado el 09/08) quitó el castigo a las fechas sin abrir, pero el `occ` de `pricing/apply`
  seguía siendo UNA ocupación anual por piso: el mes que se LLENA no podía subir el precio.
- #1323 se rehízo encima: consulta nueva de ocupación por piso+mes y `factorDemandaFecha`
  (`pricing-demanda.ts`) decide las dos cosas a la vez. Módulo único, +8 tests (1.075 verdes).
- 🚨 Trampa medida ANTES de darlo por bueno: usar el mes sin poder juzgar su ventana es PEOR que el bug
  — con muestra de antelación <10 (House jun/jul-2027) el 0% de un mes sin abrir hundía al suelo 0,92.
  Regla: la ocupación del mes solo se usa si la ventana es JUZGABLE; si no, factor global de siempre.
- Efecto real medido: 41 de 1.460 noches. House sept **+4,1%** (30 fechas); 11 fechas de agosto bajan
  ≤1,4%. Mucho menor que el +7,6% que se midió antes de #1337: aquel ya se llevó casi todo.
- Pendientes ya declarados: buckets feb→jul-2027, 23-oct/27-nov sin catalogar, `seasonal_floor_k` 0 vs 1.

### 🧱 (08/08/2026) Bandeja «cargos duplicados» de /banca responsive en móvil — PR #1319
- Captura de Alberto: en móvil las filas desbordaban (chips `flexShrink:0` + importe fuera de pantalla).
- Fix CSS-only en `BancaClient.tsx::DuplicadosBandeja`: media query ≤768px, concepto a ancho completo,
  fecha+chips+importe con wrap, botonera con wrap y botones ≥44px (`#duplicados`). Igual en «Ya resueltos».
- Mismo patrón que la bandeja «Gastos por revisar» del mismo archivo.
- Verificado 320/360px con Playwright (0px overflow). OJO: `next build` en el contenedor falla en
  page data de `/api/admin/clientes/[vertical]/[id]` YA en main (envs ausentes), no es del cambio.


- **📌 Estado vivo — pendientes y decisiones abiertas (actualizado 23/08/2026).** Detalle en
  `docs/memoria/2026-08.md` y en los PRs citados.
  - **🔴 Nuevo (23/08, auditoría diaria): 3 rutinas Claude programadas sin rastro el 22/08** —
    `auditoria-diaria`, `mercado-booking` y `facturas-correo` no dejaron commit ese día (sí lo hicieron
    el 21/08 y el 23/08); los crons de Vercel sí corrieron con normalidad y otras sesiones (health-check
    IA→`buscador-ia`, patrimonio-cfo, fix `sivra_canal`) sí se dispararon. Efecto medido: `market_rates
    booking_mcp` lleva desde el 21/08 03:40 sin fila nueva (46h). Revisar en claude.ai la configuración
    de los 3 triggers (¿deshabilitado, hora movida, fallo del scheduler?) — no hay causa visible desde el repo.
  - **`ses_transporte` sin ninguna pasada OK todavía:** `detalle` dice «no hay ningún establecimiento
    dado de alta en /sivra/partes/establecimientos» — no es la avería del Ministerio ni de credenciales
    que ya describe la nota del latido, es que falta dar de alta el primer establecimiento. Acción de
    Alberto, no de código.
  - **PR #1594 (draft, sin mergear) — fix real de producción:** un piso (House Sevillana) se quedó sin
    tarifar el 22/08 porque el motor elegía el `MAX(search_date)` de `market_rates` sin filtrar por
    comparables plausibles, y una pasada de barrido barato (Serper) con solo 1 comp útil sombreaba a la
    pasada rica del día anterior (93 comps). Corrige seleccionando la última pasada con ≥5 comparables
    creíbles. Pendiente de revisión/merge de Alberto.
  - **Ayudas/subvenciones (15/08, #1432):** pendiente respuesta de Asecon (Marta Albarrán) sobre la
    convocatoria de conciliación antes del **15/09/2026** (plazo de solicitud). Pendiente además un
    borrador (sin enviar, a decisión de Alberto) sobre la cuota RETA de Pilar (serie 72→118→32€,
    ¿bonificación art. 38 LETA aplicada?).
  - **Pricing SIVRA — canal Booking (resuelto 16-17/08):** revisado el nivel Genius/descuento móvil
    tras la reserva Luxury mordida 29,4% (15/08) — Genius dinámico → No en 3 pisos, NR Luxury
    −15%→−10%, oferta estándar 8% hasta 31/12/2028 (Fase 3, `docs/BOOKING-CAMBIOS-2026-08-16.md`);
    Smoobu +20% canal Booking + motor `channel_markup=1.20` verificados en los 4 pisos (Fases 1-2,
    PR #1449). Medición Fase 4 programada 30/08.
  - **Pricing SIVRA (motor vivo en los 4 pisos, resuelto desde el 09-10/08):** #1323 (ocupación
    POR MES) rehecho y mergeado sobre `pricing-demanda.ts`, `channel_markup_sin_recargo.sql`
    aplicado, last-minute encendido (`lastminute_k=0,5`) y reparto mes/global ya se persiste en
    `pricing_applied` (#1361, 10/08). Sigue abierto: el bucket mensual mezcla Serper+Booking sin
    filtrar `fuente` (propuesta: preferencia condicional + `bucket_fuente`, informe
    `docs/AUDITORIA-2026-08-precios-dinamicos.md`). feb→jul-2027 sin bucket (fallback de diseño;
    la rutina Booking lo va rellenando). A vigilar: 23-oct y 27-nov muy por encima de su mes sin
    evento catalogado.
  - **Mercado SIVRA:** `sivra_mercado_sweep` con latido rojo A PROPÓSITO hasta que la Rutina Booking
    consolide (Serper no distingue fecha). Incidente sin diagnosticar: 2º disparo de `mercado-booking`
    el mismo día sin huella del 1º (08/08, `docs/AGENTES-BITACORA.md`). Tope real ≈10-12 ventanas por
    pasada (las respuestas del conector no caben en contexto).
  - **Trading (solo paper):** auditoría del laboratorio 11/08 — el 🔴 gordo (walk-forward de la
    escalera desalineado entre cesta y bench) YA ARREGLADO en la misma sesión (`medicionAlineada.ts`,
    gate `COBERTURA_MIN_ESCALERA=0,8`, PR #1377). Quedan 🟡: momentum sin ventana declarada ni guarda
    de costuras, Piotroski NULL→0 regala puntos, cohetes sin precio se congelan al de entrada, nav de
    `/analizar` sin contrastar, Dataroma caído = «sin gurús». Contraste DIFERIDO (la 2ª fuente juzga el
    cierre de AYER en vez del de hoy) mergeado (#1370, 12/08). Rescate de tesis huérfanas (símbolo
    fuera del universo → se puntúa con el cierre de su vencimiento) mergeado y **verificado en
    producción** (#1403/12/08, contrastado 13/08: 16 tesis del 18/07 puntuadas al céntimo). Veredicto
    de inversión (`docs/INVERSION-VEREDICTO-2026-08.md`) re-verificado 13/08: 7 cifras publicadas
    estaban mal, corregidas; el veredicto (intradía NO) no cambia. H9 (stop −10%/trailing −15%) sigue
    sin decisión de Alberto. Decisión vigente (10/08): no operar más en real por impulso, esperar
    aviso explícito del agente cuando el forward justifique Fase 2 (hoy lejos: hit rate 26-29%, alpha
    ≈0 sobre n grande). FMP sin créditos y redundante (Yahoo cubre); NO recargar. Solo el DCF sigue
    sin fuente. Pendiente (13/08): averiguar quién escribe `trading_estrategia_stats.retorno_medio`
    (dos filas en `0.000000` — centinela «sin calcular», no cero medido). **PASO 0 del trigger
    aplicado y estrenado 17/08 (#1471):** el disparo primario de las 20:15Z volvió a morir sin
    huella (2º fallo seguido, igual que el 14/08) pero la repesca de las 23:15Z hizo su trabajo
    (PASO 0 no vio huella → pasada completa, sin duplicado). Ya no parece transitorio: si el
    disparo primario vuelve a fallar, Alberto abre ticket a soporte de claude.ai (la Rutina es de
    la UI, no editable por MCP).
    **📒 Libro de operaciones (20-21/08, #1505 y #1570 mergeados):** 569 ejecuciones (07/07/2025→17/08/2026),
    sincronizador y vigía vivos, endpoint cerrado. El volcado que caducaba YA ESTÁ (114 ops de jul–sep/2025)
    y `riesgo-hueco` ya viaja en `/analizar` (`stopViable`). Abiertos: (a) `tipo_cambio` NULL en 568/569
    filas → sin cifra en euros para la asesoría; (b) sin acciones corporativas (el primer split con
    posición abierta romperá el FIFO); (c) **BRZE y NKE tienen ventas sin compra en el libro** (anteriores
    a lo que IBKR sirve) → su coste de adquisición hay que sacarlo de los extractos, no del bróker;
    (d) **CERRADO 21/08 — fuentes:** insiders, 13F y fundamentales NO se pagan (Form 4 por
    `/api/trading/insiders`, Dataroma por `/api/trading/gurus`, SEC XBRL por `/api/trading/fundamentales`).
    Lo único que faltaba era el SCREENER, y **Alberto recargó los 20 $ (1.000 peticiones) el 21/08**: ya
    responde y está saneado por `screenerMercado.ts`. Cuenta las peticiones — el saldo es finito.
    Pendiente de decidir: si el screener entra como pilar fijo de la pasada diaria o se usa a demanda.
  - **Subastas:** lente 🌊 (costa norte + Matalascañas sin tope) MERGEADA y en prod (#1346/#1349/
    #1351/#1353); pestaña 🔥 Oportunidades rediseñada (#1358 — una tarjeta, chips homogéneos,
    €/m² siempre visible). 🟡 el dispatcher marca timeout en `subastas-mercado` si desborda 280 s
    (2×/7d, el job acaba). **Surus (6ª fuente, 13/08, #1406/#1408):** portal privado de liquidaciones
    con comisión al COMPRADOR (`comisionCompra` en `calcularCoste`, por fuente). El primer bug real
    (ingesta IMAP no leía nada por saltos de línea/columna) ya arreglado y con regresión — pero el
    correo de alerta de Surus **aún no se ha visto en producción** (alta del mismo día): pendiente
    contrastar el parser contra el primer aviso real que le llegue a Alberto.
  - **SIVRA — agente de huéspedes (20/08/2026, PR #1542 draft).** Entrega 1 hecha: lee la guía REAL
    del piso por la API de la guest app de Smoobu (`login.smoobu.com/api-guest/bookings/{id}[/contents]?token=`,
    el token sale del `guest-app-url`). Pendientes: (a) entregas 2-5 — detector de conflictos
    guía↔override, autonomía «si está en la guía contesta solo», hechos permanentes separados de las
    cortesías, y minería de los 159 hilos de 2026 para aprender de lo ya contestado; (b) **parking:
    que el agente lo VENDA y lo COBRE** (fase 2, pedido por Alberto) — hoy el código pisa a propósito
    la sección PARKING de la guía y responde «ocupado» + parkings públicos; la guía ofrece el de Plaza
    San Juan de la Palma a 20 €/día **previa reserva y según disponibilidad**, así que NO es una promesa
    en falso; (c) **mandar nosotros los datos de viajeros a la Hospedería de la Junta de Andalucía** —
    hoy va por un tercero (Chekin: el `onlineCheckInUrl` de cada reserva apunta a `guest.chekin.com`);
    (d) **en marzo vence Smoobu** → decidir si compensa seguir o darlo de baja.
  - **Facturas/banca sin conciliar:** Roborock −247,92€ (House) sin aparecer en banco; Booking Dúplex
    587,23€ vence 16/08; Socorro 24 julio sin factura de comisión; Endesa Dúplex 24/07 87,42€ con
    cargo pero sin PDF archivado; fila duplicada CREATE (`create-socorro` + `create_ventilador`,
    mismo importe/fecha, distinto fileId — el banco solo tiene un cargo). PriceLabs: la diferencia es
    SOLO el cambio USD→EUR (confirmado por Alberto 11/08), junio ya conciliado; feb/mar/abr/may/jul
    sin PDF archivado (bajar del portal). Pepephone ene-jun (6 PDF, **ningún** cargo en las cuentas de
    Alberto — probable cuenta de la SL) y lavandería Giraldillo mayo 504,57€ (paga el mes vencido)
    marcados `revisada_sin_cargo`, a la espera de que Alberto confirme. Casos abiertos sin respuesta:
    Bernardi −466,70€ (House) y Valantin −84,61€ (Busto). Desde #1376 hay FK real
    `facturas_drive.movimiento_id` + `sin_cargo_motivo` (3 estados: casada · revisada-sin-cargo ·
    sin-revisar) y el Paso 4.0 abre `v_facturas_sin_cargo` en cada pasada, antes de conciliar lo del
    día. El cron `facturas-scan` sigue archivando TODO en `ALBERTO 2026 PERSONAL (SEGUROS)/<mes>` —
    revisar su resolución de carpeta algún día.
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
