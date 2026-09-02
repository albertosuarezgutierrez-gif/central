---
description: Auditoría diaria del monorepo central — reconcilia memoria + skills + docs con el estado REAL del repo (código/infra). Auto-aplica los arreglos de texto a `main` y avisa por Telegram (con link al PR draft) lo que requiere tu ojo.
---

# Auditoría diaria — `central`

> Pensado para ejecutarse desde un **trigger programado** de Claude Code en web (lo corre
> una sesión-nube autónoma, "cowork"), o a mano con `/auditoria-diaria`. Su trabajo NO es
> "releer conversaciones" (no persisten: el contenedor es efímero), sino detectar y
> corregir el **drift** entre lo que afirman la memoria/skills/docs y lo que de verdad
> hace el código y la infra.
>
> **MCPs que necesita:** Supabase + Vercel + github (todo lectura, salvo abrir el PR) + **`Supabase_asegura`**
> (solo lectura; es el ORIGEN de la cartera de la correduría, el Supabase de Manuel — lo usa el bloque
> 2-quater. Si no está adjunto, ese bloque dice «no he podido mirar el origen», nunca «coincide»).
>
> **Para el aviso por Telegram** necesita `PLATAFORMA_URL` + `ALERTA_TOKEN` en la env de la
> rutina (ver "Arquitectura de notificaciones Telegram" en `docs/RUTINAS-PROGRAMADAS.md`).
> **NUNCA** `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` directos: esa llave vive UNA sola vez en
> Vercel plataforma; una rutina de Claude Code con el bot token maestro en su prompt en claro
> lo expondría sin necesidad (por eso existe `ALERTA_TOKEN`, de bajo privilegio — solo abre
> `/api/internal/alerta`). Si `ALERTA_TOKEN` no está, el aviso degrada con gracia (no se
> manda) y el resto sigue igual.
>
> **Dos cadencias (ver `docs/RUTINAS-PROGRAMADAS.md`):**
> - **Ligera (por defecto, diaria):** reconcilia memoria/skills/docs + checks baratos
>   (lockfile, radiografía de estructura, drift skills↔código). SALTA typecheck de las 12
>   apps y tests pesados. Rápida y de bajo ruido. Es la red de seguridad del guardián de
>   cierre (`persist-memoria.sh`): caza lo que las sesiones no anotaron a mano.
> - **Profunda (`/auditoria-diaria --profunda`, semanal):** corre `auditoria-central`
>   ENTERA (typecheck de las 12 apps + tests + seguridad multi-tenant + infra por MCP).
>
> ⚠️ **«Las 12 apps» no es una cifra para copiar: es `ls apps` cruzado con la matriz de
> `.github/workflows/tests.yml`.** Este doc decía «8» desde junio mientras nacían mariscos, asegura,
> asegura-portal y housesevillana — y nadie las typechequeaba en la pasada semanal. Si `ls apps` y la
> matriz difieren, es hallazgo 🔴 (una app fuera de la matriz no la mira nadie: `housesevillana`
> vivió 15 días con 5 errores TS por eso).

## Dos carriles de entrega (lo que cambió — léelo antes de tocar nada)
El problema histórico no era de alcance sino de **entrega**: todo se quedaba en un PR draft
que, sin mergear, dejaba la info vieja viva. Ahora la entrega va por riesgo:

- **Carril 1 — AUTO-APLICAR (texto, bajo riesgo):** memoria, skills-maestro, `CLAUDE.md`,
  `docs/SKILLS.md`, `docs/CONTEXTO-SESIONES.md`, manuales de usuario. Se **commitean y
  empujan directos a `main`**, sin PR, sin aprobar nada (mismo patrón que el hook
  `persist-memoria.sh`). Cada cambio auto-aplicado se anota en `docs/AUTO-APLICADOS.md`.

  **🚧 Si el entorno NO te deja empujar a `main`** (es lo normal bajo el harness de tareas de
  GitHub, que te asigna una rama): NO abandones el carril 1 ni lo metas en el PR del carril 2
  a lo bruto. Haz esto:
  1. **Separa el carril 1 en su PROPIO PR**, cuyo diff toque **solo** ficheros de registro:
     `docs/CONTEXTO-SESIONES.md`, `docs/AGENTES-BITACORA.md`, `docs/AUTO-APLICADOS.md`,
     `docs/AUDITORIA-<YYYY-MM>.md`, `docs/memoria/*.md`. Ese PR **se mergea solo** en cuanto
     la CI esté verde — lo hace `.github/workflows/rutinas-automerge.yml`. No hace falta que
     Alberto lo toque, y así no envejece hasta el conflicto.
  2. **Lo que cambia el COMPORTAMIENTO de alguien** (`.claude/**`, `CLAUDE.md`, `AGENTS.md`,
     `docs/SKILLS.md`, `docs/FUENTES-DE-VERDAD.md`, `docs/RUTINAS-PROGRAMADAS.md`) **NO** entra
     en ese PR aunque sea "solo texto": el auto-merge lo bloquea a propósito (un agente que se
     reescribe las instrucciones sin que nadie mire es justo lo que no queremos). Va al PR del
     carril 2, con su aviso.
  3. Si tu PR de registro entra en conflicto igualmente, el workflow intenta traerte `main` a
     la rama solo; si no puede, te deja UN comentario y ahí ya hace falta mano humana.

  Historia de por qué existe este apartado: 04-07/08/2026, cinco PRs de rutinas (#1252, #1254,
  #1277, #1279, #1286) murieron en conflicto por confiar en un push a `main` que el entorno
  nunca permitió. Ver `docs/AUDITORIA-2026-08.md`.
- **Carril 2 — REVISIÓN (lo "raro"):** código, infra, migraciones, cambios de gran radio,
  hallazgos ambiguos y **crons mudos**. Van a **PR draft** + **aviso por Telegram** (con
  botón-URL al PR) para que Alberto lo lleve a una conversación y lo estudie. Nunca a `main`.

**Guardarraíl del carril 1 (idea B):** solo auto-aplica si el cambio es **de texto** y
**acotado** (un doc/skill, edición localizada). Si una reconciliación es **grande o
estructural** (reescribe medio doc, mueve secciones, cambia el sentido de una regla), NO la
empujes a `main`: trátala como carril 2 (PR draft + aviso) para que un humano la vea. Ante la
duda, carril 2.

## Por qué existe
El hook `Stop` (`persist-memoria.sh`) ya persiste `CONTEXTO-SESIONES.md` por sesión,
pero solo si esa sesión lo tocó. Esta auditoría es la **red de seguridad**: caza lo que
las sesiones del día se dejaron sin anotar, los pendientes ya resueltos que siguen
marcados, y las skills-maestro / `CLAUDE.md` que el código ya contradice.

## Fuentes de verdad (lo único que persiste)
- `git log` desde la última auditoría (mira la fecha del último `docs/AUDITORIA-*.md`
  y de la entrada superior de `docs/CONTEXTO-SESIONES.md`).
- El código real de `packages/*` y `apps/*`, `MATRIZ.md`, los `CLAUDE.md`/`AGENTS.md`.
- Infra por MCP (Supabase/Vercel), solo lectura.
- **`docs/FUENTES-DE-VERDAD.md`** (manifiesto, idea F): mapea cada doc/skill → los paths de
  código que describe. Úsalo para saber **exactamente** qué doc releer cuando un path cambia,
  en vez de adivinar. Si tocas un doc/skill o ves que el mapa está incompleto, actualízalo.
- **`docs/HUECOS-ABIERTOS.md`**: catálogo de «esto nos falta», con la fuente de cada hueco. Lo
  consume `conectores-vigia`. Lo mantiene esta auditoría (carril 1) — ver el paso de frescura.

## Pasos (crea un TodoWrite por bloque)

1. **Encuadre.** Lee `MATRIZ.md` y las entradas de arriba de `docs/CONTEXTO-SESIONES.md`.
   Saca el rango de cambios: `git log --since="<fecha última auditoría>" --stat` (o las
   últimas ~48h si no hay referencia). Si NO hay commits nuevos desde la última
   auditoría → salta a la **decisión de cierre** (paso 6): probablemente solo toque el
   heartbeat semanal, si aplica.

2. **Auditoría según cadencia.**
   - **Modo ligero (por defecto):** invoca **`auditoria-central`** pero recorre solo los
     bloques baratos (integridad estructural: lockfile + radiografía + `transpilePackages`;
     coherencia de docs; deps/código muerto rápidos). SALTA typecheck de las 12 apps y los
     tests pesados — esos son de la pasada semanal.
   - **Modo profundo (`--profunda` en el prompt):** recorre `auditoria-central` ENTERA
     (integridad, typecheck de las 12 apps, tests, seguridad multi-tenant, deps, infra real
     por MCP, coherencia de docs). **Tramo de la correduría en la profunda (02/09/2026):**
     typecheck de `apps/asegura` con sus DOS schemas (`prisma generate && prisma generate
     --schema prisma/asegura.prisma`; con uno solo sale `TS2307` falso), tests de
     `packages/module-seguros{,-pii,-portal}` (el cifrado y el índice ciego: si se rompen, los
     clientes dejan de ENCONTRARSE sin ningún error), la foto `seguros.*` vs el origen con
     checksums (bloque 2-quater c), y `docs/TRASPASO-CORREDURIA.md` §pendientes contra el código
     (¿sigue leyendo del origen? ¿sigue sin firmar el contrato de encargado?).
   Distingue error real de ruido de entorno; no infles conteos.

2-bis. **Heartbeat de crons y agentes** (barato, corre SIEMPRE — también en modo ligero).
   Los crons pueden dejar de escribir en silencio (p. ej. jun-2026: el middleware de
   plataforma redirigía los crons `/api/sivra/*` a `/login` y estuvieron 5 días mudos sin
   que saltara ninguna alarma). Este check vigila el **síntoma** (no hay huella fresca),
   así que caza cualquier causa (middleware, clave Smoobu, bug en handler, caída Vercel…).
   Corre por Supabase MCP (lectura) sobre `wswbehlcuxqxyinousql`, en dos consultas:

   **a) Latidos de pasada buena (`agente_latidos`) — la fuente PREFERIDA.** Cada agente/cron
   instrumentado escribe su fila al completar una pasada buena (`agente, ultimo_at,
   ultimo_ok_at, ok, detalle`), así que la huella mide SALUD, no actividad de negocio:

   ```sql
   SELECT agente, ok, ultimo_at, ultimo_ok_at, detalle,
          round(extract(epoch FROM now()-ultimo_ok_at)/3600, 1) AS horas_sin_ok
   FROM agente_latidos ORDER BY ultimo_ok_at ASC NULLS FIRST;
   ```

   Cruza cada fila con su cadencia real (diario→~30h, cada-10min→6h, semanal→~192h; la lista
   canónica de vigilados con umbral y nota de diagnóstico vive en `AGENTES_VIGILADOS` de
   `apps/plataforma/lib/monitoring/latidos.ts` — léela, no la dupliques aquí). `ok=false` o
   `ultimo_ok_at` más viejo que la cadencia → ⛔. **Lee siempre `detalle`** antes de
   diagnosticar: distingue «no pudo mirar» de «miró y no había» (regla NULL≠0 de `CLAUDE.md`).

   **b) Filas frescas en tablas de dominio — SOLO para lo que aún no escribe latido:**

   ```sql
   WITH h(cron, tabla, ultimo, max_horas) AS (
     SELECT 'rates/snapshot',            'rate_snapshots',         max(created_at),     36 FROM rate_snapshots
     UNION ALL SELECT 'pricing/apply-auto',       'pricing_applied',        max(applied_at),     36 FROM pricing_applied
     UNION ALL SELECT 'pricing/pilot-track',      'pricing_pilot_tracking', max(created_at),     36 FROM pricing_pilot_tracking
     UNION ALL SELECT 'concursos-ingesta',        'concursos_licitaciones', max(actualizado_en), 12 FROM concursos_licitaciones
     -- psd2: la huella es «hay movimientos NUEVOS», no «el cron corrió» — un finde sin cargos la
     -- deja quieta >30h con el cron vivo (falsa alarma 02/08/2026: cron 200 a las 06:01 y ⛔ igual).
     -- 54h cubre el finde; el guardián dedicado (psd2-health-check, <48h) sigue siendo el fino.
     UNION ALL SELECT 'psd2-sync',                'movimientos_bancarios',  max(created_at),     54 FROM movimientos_bancarios
     UNION ALL SELECT 'correo-triaje',            'correo_cursor',          max(updated_at),      2 FROM correo_cursor
     -- AGENTES (sesiones Claude programadas) + crons de trading. Umbrales por cadencia real:
     -- diario→~30h, cada-6h→12h, SEMANAL→~192h (8 días). OJO: la huella tiene que ser la del
     -- AGENTE, no una que otro proceso mantenga fresca (ver nota del pricing abajo).
     -- pricing: la huella NO puede ser `market_rates prop_*` — desde el 06/08/2026 escriben ahí a
     -- diario el barrido Serper y la rutina de Booking, así que salía verde con la Rutina semanal
     -- parada (la avería del 21/07, reaparecida). `pricing_decisiones` solo la escribe la Rutina.
     UNION ALL SELECT 'AGENTE pricing (ciclo semanal)',   'pricing_decisiones',     max(ciclo_at),       192 FROM pricing_decisiones
     UNION ALL SELECT 'AGENTE mercado-booking (diario)',  'market_rates booking_mcp',max(created_at),     30 FROM market_rates WHERE fuente='booking_mcp'
     UNION ALL SELECT 'trading forward-paper (sem)',      'trading_paper_track',    max(created_at),     192 FROM trading_paper_track
     UNION ALL SELECT 'ia-director-refresh (sem)',        'ia_director_aprendizaje',max(creada_at),      192 FROM ia_director_aprendizaje
     UNION ALL SELECT 'trading-universo (6h)',            'trading_universo',       max(actualizado_en),  12 FROM trading_universo
     UNION ALL SELECT 'trading-ranking (sem L)',          'trading_ranking',        max(created_at),     192 FROM trading_ranking
   )
   SELECT cron, tabla, ultimo,
          round(extract(epoch FROM now()-ultimo)/3600, 1) AS horas,
          CASE WHEN ultimo IS NULL OR now()-ultimo > (max_horas||' hours')::interval
               THEN '⛔ MUDO' ELSE '✅' END AS estado
   FROM h ORDER BY estado DESC, horas DESC;
   ```

   - 🚨 **Huella de ACTIVIDAD ≠ huella de SALUD.** Una tabla que solo recibe filas cuando hay
     actividad de negocio (reservas nuevas, cargos, limpiezas) NO sirve de heartbeat: en
     temporada baja da ⛔ con el cron perfectamente vivo. `updates/sync` (incomes),
     `mercado in-app` (market_rates normal) y `limpiadoras/auto-sessions` (cleaning_sessions)
     dieron ese falso positivo en CADA pasada del 02/07 al 07/08/2026 y hubo que re-verificarlos
     a mano por logs cada día — por eso ya NO están en la consulta b): los dos primeros tienen
     latido (`smoobu_sync`, `sivra_mercado_sweep`, consulta a) y `auto-sessions` queda como
     **huella condicionada**: solo se investiga si otra señal apunta a fallo (p. ej. `ialimp_pms`
     en rojo), nunca ⛔ por sí sola. Si detectas otra huella así, sácala de b) igual: o se
     instrumenta con latido (propuesta carril 2) o no es un heartbeat.
   - **Reconciliación de cobertura (nuevo, cada pasada):** compara esta lista de huellas contra
     (1) los crons reales de `apps/plataforma/lib/cron-dispatch.ts` (`CRON_JOBS`) y los
     `vercel.json` de las apps, (2) `AGENTES_VIGILADOS` de `latidos.ts`, y (3) las rutinas
     *activas* de `docs/RUTINAS-PROGRAMADAS.md`. Un cron/agente nuevo sin huella en ningún
     vigilante = hallazgo 🟡 carril 2 (propón la fila de latido o de esta lista en el PR).
     Los agentes nacen más rápido que este doc — sin este diff, cada agente nuevo nace sin vigilar.
   - Cualquier fila **⛔** es hallazgo 🔴 y **caso estrella del carril 2**: investiga la
     causa (mira el middleware/auth de la app dueña del endpoint, la env del secreto y los
     logs de runtime por Vercel MCP), métela en el PR draft con la acción concreta y
     **SIEMPRE dispara Telegram** (un cron mudo es justo lo que Alberto tiene que ver). Si un
     cron es semanal/mensual, ajusta su umbral en vez de marcarlo (los diarios son los críticos).
   - 🚨 **LECCIÓN — elige la huella del AGENTE, no una que otro proceso mantenga viva
     (21/07/2026):** el agente de pricing (sesión Claude SEMANAL con conectores de viaje) estuvo
     **16 días parado** y este heartbeat **no lo cazó** porque miraba `market_rates` genérico —
     que el cron diario in-app rellena con `scenario='normal'` (Serper) cada día → siempre en
     verde. La huella REAL del agente es `market_rates scenario LIKE 'prop_%'` (mercado por piso,
     que SOLO escribe el agente con conectores) y sus decisiones `pricing_decisiones.ciclo_at`.
     Regla general: antes de fiarte de una huella, confirma que **solo** el agente vigilado la
     refresca; si la comparte con otro proceso, el heartbeat miente.
   - **No dupliques con los vigías dedicados:** la pasada nocturna de trading (NAV `broker_saldos`
     + tesis `trading_tesis`) ya la cubre el cron **`/api/cron/trading-watchdog`** (mar-sáb), y el
     cron **`/api/cron/agentes-latido`** (diario, `lib/monitoring/latidos.ts`) es el gemelo
     DETERMINISTA de este heartbeat para pricing+correo. Este bloque es el carril CON CONTEXTO
     (razona la causa y abre PR); si añades una huella aquí que ya vigile un cron dedicado, no
     hace falta el segundo aviso — coordina umbrales para no avisar por duplicado.

   - 🔧 **Antes de abrir un hallazgo de carril 2 por un agente en rojo, mira si YA se está
     reparando solo** (20/08/2026). Desde el workflow `latido-reparar.yml` hay un reparador
     automático que reclama UN agente al día, escribe el parche y lo mergea si pasa su gate de
     prueba (ver `apps/plataforma/CLAUDE.md` §«Del latido rojo al merge»). Consulta:

     ```sql
     SELECT agente, firma, estado, pr_numero, intento_at, merged_at, veredicto
     FROM agente_reparaciones WHERE intento_at >= now() - interval '7 days'
     ORDER BY intento_at DESC;
     ```

     - `estado='intentando'` o `'mergeada'` con `veredicto IS NULL` → **hay un intento vivo**:
       menciónalo en el informe con su PR y **NO abras un PR de carril 2 por ese agente** (dos
       parches a la vez sobre el mismo fallo se pisan). El veredicto lo dicta el latido a las 24 h.
     - `estado='rendida'` o `veredicto='sigue_roja'` → el automático ya se rindió y Alberto ya
       tiene su Telegram: **eso SÍ es tuyo**, y es prioritario (nadie más lo va a mirar).
     - `estado='pr_abierto'` → hay un PR draft sin mergear esperando ojo humano; enlázalo en el
       informe en vez de duplicar el trabajo.
     - 🚨 Una consulta que falle aquí (tabla ausente, permiso) es «no lo sé», no «no hay
       reparación en curso»: dilo así y, ante la duda, no abras el PR duplicado.
   - Si todo ✅, una línea verde en el informe y sigue.

2-ter. **Backlog de PRs de rutinas + salud del automerge** (barato, corre SIEMPRE).
   El canal de entrega también se muere en silencio: del 04 al 07/08/2026 cinco PRs de
   rutinas (#1252, #1254, #1277, #1279, #1286) envejecieron hasta el conflicto sin que nadie
   avisara, y el 29/07 un barrido manual cerró trabajo real sin mergear. El workflow
   `.github/workflows/rutinas-automerge.yml` cierra el círculo — pero nadie vigila al
   vigilante. Por GitHub MCP (lectura):
   1. Lista los PRs abiertos de ramas `claude/*`. Por cada uno:
      - **Solo ficheros de registro** (los que el automerge acepta) y >24h sin mergear →
        el automerge NO lo está cogiendo: mira por qué (¿CI roja? ¿cero checks? ¿etiqueta
        `no-automerge`? ¿workflow deshabilitado en Actions?) y repórtalo como 🔴.
      - **`mergeable_state: dirty`** (conflicto) → 🟡 con el archivo en conflicto y si es
        inserción pura (el bot debería resolverla) o edición real (mano humana).
      - Draft de carril 2 con **>7 días** sin actividad → línea en el informe para que
        Alberto decida mergear o cerrar (un PR draft olvidado es información que envejece;
        cerrarlo sin mirar pierde trabajo — lección del 29/07).
   2. Comprueba que `rutinas-automerge.yml` tiene ejecuciones recientes (`actions_list`):
      corre cada hora — sin runs en las últimas ~3h con PRs de registro abiertos = el
      vigilante está muerto → 🔴 + Telegram.
   Sin nada raro → una línea verde y sigue.

2-quater. **🛡️ SALUD DE LA CORREDURÍA — bloque OBLIGATORIO en TODAS las pasadas** (nuevo
   02/09/2026, petición de Alberto: las rutinas tienen que cubrir TODO lo que se ha metido, y la
   correduría es lo que más creció sin que esta auditoría la mirase — ni una línea hasta hoy).

   🚨 **Por qué no basta con el heartbeat.** La correduría tiene tres fallos que un latido verde
   no desmiente: (1) la ingesta de CIMA estuvo **dos meses** (24/06→30/08/2026) sin procesar 42
   ficheros —23 recibos por 7.721,71€ de prima— con el health-check del CRM de origen en verde
   (medía `ficherosError`, que valía cero; lo perdido estaba en `cuarentenaTotal`); (2) desde el
   02/09/2026 la cartera vive en DOS sitios —el origen de Manuel (`uijsgeocgdaxkhvwtjqs`, que sigue
   recibiendo CIMA) y la FOTO en `seguros.*` de central— y **divergen cada día**; (3) `apps/asegura`
   es la única app del monorepo que gasta dinero real (0,50€ por tarificación en Codeoscopic).

   **a) Latidos (consulta a) del 2-bis).** `correduria_renovaciones` (06:30) y `correduria_ingesta`
   (06:45) están en `AGENTES_VIGILADOS` (30 h). **Sin fila = nunca corrió**, no «ok» (el vigía de
   ingesta nació el 01/09/2026 por la tarde; su primera fila posible es del 02/09). Lee el
   `detalle`: «no se ha podido comprobar» / «puerto sin configurar» es que faltó la LECTURA
   (`ASEGURA_OPERADOR_SECRET` distinto entre plataforma y asegura, o la BD de asegura caída) y NO
   dice que la ingesta o las renovaciones vayan bien. `cima-liq` (07:30, libro de comisiones,
   escribe `comisiones_*`) **no deja latido**: huella CONDICIONADA — solo se investiga si el latido
   de ingesta va en rojo o si `/correduria` pinta el cuadre vacío; proponer su latido es carril 2.

   **b) Lo que NO es una huella: la frescura del origen.** La cartera viva son ~109 pólizas y CIMA
   trae **0-3 pólizas/recibos por SEMANA**, con huecos de dos-tres semanas medidos (03/08→17/08/2026
   sin nada; el 02/09 la última póliza era del 24/08). `max(created_at)` de `polizas` o
   `poliza_recibos` en el origen es huella de ACTIVIDAD, no de salud — la misma trampa que
   `updates/sync` en temporada baja: **no la marques ⛔ por vieja.** La señal de salud es la del
   vigía (ficheros en cuarentena / pólizas huérfanas), no la fecha.

   **c) Foto vs origen** (MCP `Supabase_asegura` para el origen, `Supabase` para central; en la
   ligera solo recuentos, en la profunda también los checksums del método de
   `apps/asegura/prisma/sql/2026-09-01_seguros_volcado_datos.sql`):

   ```sql
   -- ORIGEN (Supabase_asegura)
   SELECT count(*) FILTER (WHERE import_ref IS NULL) AS vivas, count(*) AS total,
          max(created_at) AS ultima FROM polizas;
   SELECT count(*) AS recibos, max(created_at) AS ultimo FROM poliza_recibos;
   -- CENTRAL (schema seguros)
   SELECT count(*) AS total, max(created_at) AS ultima FROM seguros.polizas;
   SELECT count(*) AS recibos, max(created_at) AS ultimo FROM seguros.poliza_recibos;
   SELECT count(*) AS tablas, max(copiado_at) AS ultima_copia FROM seguros._volcado_control;
   ```

   Que difieran es **lo esperado** (la foto es del 02/09/2026): lo que se reporta es CUÁNTO
   (filas que el origen tiene y la foto no) y desde cuándo. Mientras el código lea del origen
   (`ASEGURA_DATABASE_URL`, `apps/asegura/lib/asegura-db.ts`, `prisma/asegura.prisma`) la
   divergencia no rompe nada. El día que un PR apunte `asegura.prisma` a `seguros.*` **sin
   re-copia previa**, la pantalla de Alberto (`/correduria` en plataforma) pasa a mentir con datos
   de semanas → ese PR es hallazgo 🔴 aunque compile. Regla NULL≠0: si la consulta al origen
   falla (conector no adjunto, permiso), es «no he podido mirar», nunca «coinciden».

   **d) Dinero** (schema `seguros` de central):

   ```sql
   SELECT count(*) AS cotizaciones_7d, coalesce(sum(coste_cents), 0) AS cents,
          count(*) FILTER (WHERE estado = 'descartado') AS descartadas
   FROM seguros.codeoscopic_consumo WHERE creado_at > now() - interval '7 days';
   ```

   El flag `CODEOSCOPIC_TARIFICACION_ACTIVA` **no se puede leer desde aquí** (env de Vercel): la
   señal es la fila. Cualquier cotización sin una decisión de Alberto anotada en la memoria es 🔴
   Telegram. Una cotización sin desenlace (`cerrado_at IS NULL` >150 s) cuenta como gastada por
   diseño — no la «limpies». El cepo de código es `test/regression-asegura-gasto-codeoscopic.test.ts`.

   **e) Aislamiento** — comprobar que los cepos siguen en `pnpm test:guardia`, no re-derivarlos:
   `regression-asegura-aislamiento` (toda consulta a `seguros.*` pasa por `lib/tenant`, porque
   `prisma_seguros` es BYPASSRLS y las 86 RLS del origen ya no tienen sujeto: el fallo sería «se ve
   todo sin que falle nada»), `regression-portal-aislamiento` (asegura-portal: rol propio SIN
   BYPASSRLS, un asegurado solo ve lo suyo), `regression-asegura-operador-publico` +
   `regression-correduria-puerto` (el puerto `/api/operador/*` exige Bearer y plataforma lo consume
   solo por `lib/correduria-puerto.ts`). Un PR del rango que toque `seguros.*`, `lib/tenant*` o el
   puerto sin tocar su cepo = 🟡 carril 2.

   **f) La rutina §21 (`agente-correduria`, martes) está PAUSADA a propósito** (decisión de
   Alberto, 01/09/2026): no la reportes como muda ni propongas reactivarla. Sí es hallazgo que
   aparezca una entrada suya en `docs/AGENTES-BITACORA.md` estando pausada (correría sin que él
   lo pidiera).

   Cualquier 🔴 de este bloque → **Telegram inmediato** y el detalle al PR del carril 2. **No se
   salta en modo ligero.**

2bis. **💰 SALUD DEL PRECIO — bloque OBLIGATORIO en TODAS las pasadas** (nuevo 27/08/2026,
   petición expresa de Alberto: *«nos jugamos mucho dinero»*).

   🚨 **Por qué es un bloque aparte y no una fila más del heartbeat.** El heartbeat responde
   «¿el motor se movió?». Esa no es la pregunta cara. La cara es **«¿lo que escribió está
   SANO?»**, y hasta hoy no la hacía nadie: el motor puede correr sus tres pasadas, escribir
   500 noches, dejar `agente_latidos.ok = true` y aun así haber desplomado un piso o llevar
   días con `apply_enabled = false`. Es la misma familia que el PR #1787 de `CLAUDE.md`:
   **verde no dice que el diff sea el tuyo** — aquí, un latido verde no dice que el precio
   sea el correcto.

   Corre esta consulta (probada contra la BD el 27/08/2026) y pasa el resultado por
   `saludPricing()` de `apps/plataforma/lib/sivra/pricing-salud.ts` — el veredicto y los
   umbrales viven ahí, testeados; **no los redefinas aquí**.

   ```sql
   WITH a AS (
     SELECT property_id, rate_date, new_price, applied_at,
            (applied_at AT TIME ZONE 'UTC')::date AS dia
     FROM pricing_applied WHERE dry_run = false AND applied_at > now() - interval '7 days'
   ),
   anc AS (  -- ancla = ref24 (último precio de un día ANTERIOR), NO el old_price de la fila
     SELECT a.*, (SELECT p.new_price FROM a p WHERE p.property_id = a.property_id
                  AND p.rate_date = a.rate_date AND p.dia < a.dia
                  ORDER BY p.applied_at DESC LIMIT 1) AS ref24
     FROM a
   ),
   mkt AS (  -- fechas con mercado medido suficiente: alimentan el premio de mercado (≥3 comps)
     SELECT checkin_date FROM market_rates
     WHERE fuente = 'booking_mcp' AND COALESCE(corpus_clonado, false) = false AND price_night > 0
     GROUP BY checkin_date, scenario HAVING count(*) >= 3
   ),
   dir AS (
     SELECT property_id, rate_date, applied_at, new_price,
            sign(new_price - lag(new_price) OVER (PARTITION BY property_id, rate_date
                                                  ORDER BY applied_at)) AS s
     FROM a
   ),
   osc AS (
     SELECT property_id, rate_date,
            count(*) FILTER (WHERE s <> 0 AND s <> lag_s AND lag_s <> 0) AS cambios
     FROM (SELECT *, lag(s) OVER (PARTITION BY property_id, rate_date
                                  ORDER BY applied_at) AS lag_s FROM dir) q
     GROUP BY 1, 2
   ),
   ult AS (SELECT max(applied_at) AS t FROM pricing_applied WHERE dry_run = false)
   SELECT
     (SELECT round(EXTRACT(EPOCH FROM (now() - t)) / 3600, 1) FROM ult) AS horas_desde_ultima_pasada,
     (SELECT count(*) FROM pricing_applied WHERE dry_run = false
        AND applied_at >= (SELECT t FROM ult) - interval '20 minutes')  AS noches_ultima_pasada,
     (SELECT count(*) FROM anc
        WHERE ref24 IS NOT NULL AND new_price < ref24 * 0.80 - 1)       AS rail_baja_roto,
     (SELECT count(*) FROM anc
        WHERE ref24 IS NOT NULL AND new_price > ref24 * 1.20 + 1
          AND NOT EXISTS (SELECT 1 FROM pricing_eventos_auto e WHERE e.rate_date = anc.rate_date)
          AND NOT EXISTS (SELECT 1 FROM mkt WHERE mkt.checkin_date = anc.rate_date))
                                                                        AS rail_alza_sin_justificar,
     (SELECT count(*) FROM a JOIN pricing_settings s USING (property_id)
        WHERE s.min_price IS NOT NULL AND a.new_price < s.min_price)    AS bajo_minimo,
     (SELECT count(*) FROM osc WHERE cambios >= 3)                      AS oscilantes;
   ```

   Y las palancas, que se apagan en silencio:

   ```sql
   SELECT property_id, enabled, apply_enabled, antelacion_k, min_price, max_price,
          max_change_pct, updated_at
   FROM pricing_settings ORDER BY property_id;
   ```

   **Cómo leer cada número (esto es lo que evita las falsas alarmas):**

   | Señal | Umbral | Por qué |
   |---|---|---|
   | `rail_baja_roto` | **> 0 = 🔴 Telegram YA** | A la baja el raíl **no tiene ninguna salida legítima**. Es un desplome, y la noche vendida barata no se recupera. Medido sobre 10 días: 0 de ~4.200. |
   | `bajo_minimo` | **> 0 = 🔴** | El suelo es lo último que se aplica; saltárselo es vender bajo coste. |
   | `horas_desde_ultima_pasada` | **> 10 = 🔴** | Tres pasadas diarias (08:30/14:30/20:30 UTC): con 10 h ya se saltó una. |
   | `enabled` / `apply_enabled` en `false` | **🔴** | El motor apagado NO rompe nada visible: crons y latido siguen verdes y los precios se quedan quietos. Solo se ve en la factura. |
   | `min_price` NULL | **🔴** | Sin suelo no hay nada que impida malvender. |
   | `antelacion_k` ≠ 0 | **🟠** | Se apagó el 27/08/2026. Reencenderla exige las **tres** condiciones de `docs/POSICION-MERCADO-lejano.md`. |
   | `rail_alza_sin_justificar` | **> 0 = 🟠** | Ver la trampa de abajo. |
   | `oscilantes` | **> 0 = 🟠** | Ciclo límite: el motor no converge y cada vuelta publica un precio distinto. |
   | `noches_ultima_pasada` = 0 | **🟠** | Regla NULL≠0: indistinguible de una pasada abortada. Lee el `detalle` del latido. |

   🚨 **LA TRAMPA DEL RAÍL — no la olvides o abrirás hallazgos falsos a diario.**
   1. **El ancla NO es `old_price`.** Es `ref24`, el último precio que aplicó el motor **el día
      anterior** (`lib/sivra/pricing-ancla-rail.ts`), para que tres pasadas no compongan ±20%
      tres veces. Midiéndolo contra `old_price` salían **112 «fuera de raíl»** el 27/08 que eran
      redondeos a euro y anclas distintas: cero de ellos era un fallo.
   2. **Al alza hay DOS vías legítimas de saltarse el raíl**, y las dos son deliberadas:
      el **salto de evento** (calendario `EVENTS` + tabla `pricing_eventos_auto`) y el **premio
      de mercado por fecha** (`premioMercadoFecha`, cuando el mercado medido de ese día va
      ≥1,5× su base). El segundo existe justo para lo contrario de lo que parece: es el hueco
      por el que **Karol G y la Feria se vendieron BARATAS**. Descontando solo eventos quedaban
      23 «sospechosas»; descontando también el premio, **4**. La consulta de arriba ya descuenta
      las dos — si la simplificas, la alarma se vuelve ruido y se acaba ignorando.
   3. **La asimetría es la señal.** Al alza puede romperse; a la baja **nunca**. Si algún día
      ves `rail_baja_roto > 0`, no lo razones: avisa.

   Cualquier 🔴 de este bloque → **Telegram inmediato** aunque no haya nada más que reportar,
   y el detalle al PR del carril 2. Este bloque **no se salta en modo ligero**.

3. **Informe.** Crea/actualiza `docs/AUDITORIA-<YYYY-MM>.md` con hallazgos por
   severidad (🔴/🟡/🟢), cada uno con `ruta:línea` + acción, y el checklist de acciones
   manuales de Alberto (Supabase/Vercel) con orden seguro y rollback. El informe va en el
   PR draft del **carril 2** (no a `main`).

4. **Reconciliación de memoria y skills** (el núcleo, **carril 1**):
   - **Las CONVERSACIONES del rango, no solo los commits** (petición de Alberto, 02/09/2026:
     *«revisa las conversaciones por si hay algo pendiente por hacer; actualiza skill, memoria,
     agentes, todo»*). El límite conocido de este doc —una sesión de solo charla no deja commit y
     el guardián no la ve— se ataca desde la lista de sesiones, que SÍ persiste fuera del
     contenedor: `list_sessions` (MCP Claude Code Remote, `mine: true`, últimas ~48 h) y
     `get_session` para el título/estado de cada una. Por cada sesión del rango comprueba que
     tiene **al menos una** de estas huellas: entrada en `docs/CONTEXTO-SESIONES.md`, PR (abierto
     o mergeado) de su rama `claude/*`, o línea en `docs/AGENTES-BITACORA.md` si era una rutina.
     Una sesión **sin ninguna** es una decisión o un pendiente que se perdió: anótala en la memoria
     con su título y fecha como «pendiente de confirmar con Alberto» (carril 1) — no inventes lo
     que se habló. Las sesiones con PR abierto **sin mergear** son pendientes reales: lístalas con
     su nº en el informe (cruza con 2-ter). ⚠️ Sin acceso al transcript, la señal es
     título + PR + memoria; si la herramienta no está adjunta, dilo («no he podido listar
     sesiones»), no «no hay pendientes».
   - `docs/CONTEXTO-SESIONES.md`: añade entrada(s) de lo hecho en el rango que no esté
     anotado; mueve a "hecho" los pendientes ya resueltos; corrige el "Estado actual". El bloque
     **«Estado vivo»** se comprueba bullet a bullet contra el CÓDIGO (¿sigue abierto?), igual que
     `HUECOS-ABIERTOS.md`: un pendiente ya cerrado que sigue listado envejece hacia el lado malo.
   - **Rotación mensual de la memoria (ahorro de contexto):** si el archivo vivo contiene
     entradas de un mes YA CERRADO, ejecuta `node scripts/rotar-memoria.mjs` (idempotente;
     las archiva en `docs/memoria/AAAA-MM.md`). Además, si ves entradas nuevas que violan
     la regla de tamaño (~8 líneas máx), resúmelas en el archivo vivo (carril 1).
   - Skills-maestro (**los 7**: `central-maestro`, `ia-rest-maestro`, `sivra-maestro`,
     `ialimp-maestro`, `plataforma-maestro`, `transporte-maestro`, `alquiler-maestro` — la
     lista real es `ls -d .claude/skills/*-maestro`, no esta línea), la skill de dominio
     `agente-correduria` (su `references/sector.md` acumula hechos del sector: contrástalos como
     datos duros) y los **`apps/*/CLAUDE.md` de las 12 apps** (ia-rest tiene además `AGENTS.md`;
     **`almacen` y `asegura-portal` NO tienen `CLAUDE.md`** — su contexto vive en `CLAUDE.md` raíz
     y en `docs/superpowers/specs/2026-09-01-asegura-portal-clientes-empresas-design.md`; no lo
     repitas como hallazgo cada noche, pero sí si un PR del rango les cambia el comportamiento y
     nadie lo anota en ningún sitio): corrige cualquier afirmación que el código contradiga
     (rutas, envs, tablas, reglas, estado). Si una skill y el código discrepan, **manda el código**.
     ⚠️ En `apps/asegura/CLAUDE.md` y `docs/TRASPASO-CORREDURIA.md` el dato que más envejece es
     **de dónde LEE el código** (origen de Manuel vs `seguros.*`): compáralo contra
     `apps/asegura/lib/asegura-db.ts` y `prisma/asegura.prisma`, no contra el doc.
   - **TODAS las skills de agentes, no solo las maestro** (la lista es `docs/SKILLS.md`
     §«Agentes programados» cruzada con `ls .claude/skills`): por cada una, sus **datos duros**
     (tablas, rutas de API, envs por nombre, umbrales, cadencia, estado del trigger) contra el
     código y contra `list_triggers` (id, cron, `enabled`, `last_run`). Una skill que dice
     «rutina activa» con el trigger deshabilitado —o al revés— es hallazgo carril 1 en el doc y
     carril 2 si el trigger es lo que está mal. Lo que NO tocas aquí es el COMPORTAMIENTO del
     agente (reglas, criterios): eso es del `agentes-entrenador` semanal, que se apoya en
     rendimiento; tú solo la frescura factual. Si detectas un patrón de rendimiento, déjaselo
     como hallazgo en `docs/FEEDBACK-AGENTES.md`, no lo arregles tú.
   - **Reglas DICTADAS por Alberto (fiscal/negocio) — check de contradicciones:** estas
     reglas NO las decide el código; su fuente canónica es la skill del dominio
     (`perfil-fiscal` para las fiscales). Si la MISMA regla aparece distinta en la memoria
     u otra skill/doc, es hallazgo 🔴 del carril 1: alinea todas las copias con lo que
     Alberto dictó MÁS RECIENTEMENTE (busca la fecha en `CONTEXTO-SESIONES.md`). Caso real
     (02/07/2026): `perfil-fiscal` decía «mobiliario/obras → a amortizar» mientras la
     memoria (30/06) tenía la regla permanente «amortizable = NUNCA sin orden de Alberto»;
     la contradicción hizo marcar `amortizable` un IKEA por error. Grep sugerido:
     `grep -rn "amortiza\|deducible\|regla permanente" .claude/skills docs/CONTEXTO-SESIONES.md`.
   - `docs/SKILLS.md` (índice vivo): verifica que lista las skills y comandos REALES de
     `.claude/skills/` y `.claude/commands/`; añade los que falten, quita los que ya no
     existan, y corrige las descripciones de "cuándo usar" que estén desactualizadas.
   - **Skills SINCRONIZADAS** (`/root/.claude/skills/synced/`, si existe la carpeta en la
     sesión): vienen de la cuenta de Claude, **no están en git y nadie las reconcilia**, así
     que su drift no caduca nunca — es un punto ciego, no un olvido puntual. Caso fundacional
     (19/08/2026): `seo-house-sevillana` llevaba desde su creación diciendo que House Sevillana
     está en **Calle Bustos Tavera 22**, que es la dirección de OTROS DOS pisos del grupo
     (Luxury Busto y Busto Reform); el dato bueno es **Calle Socorro 24, barrio de San
     Julián**, y está en `apps/housesevillana/CLAUDE.md` y en la propia landing. Lo caro no era
     la ficha: eran sus **dos JSON-LD con `streetAddress`**, que si se publican le dan a Google
     una dirección falsa para el negocio y encima la de dos competidores propios en la misma
     búsqueda local. Qué hacer: contrasta los DATOS DUROS de cada skill sincronizada
     (direcciones, licencias, teléfonos, precios, capacidades) contra el código y los
     `CLAUDE.md` de la app que describen.
   - **El remedio de una skill sincronizada con datos malos es TRAERLA AL REPO, no repetir el
     aviso.** Avisar por Telegram no arregla nada —`seo-house-sevillana` se detectó tres
     pasadas seguidas (19, 25 y 26/08/2026) sin que cambiara ni una línea, porque el arreglo
     dependía de que Alberto lo hiciera a mano en su cuenta—. Una skill copiada a
     `.claude/skills/<nombre>/` **tiene precedencia sobre la copia sincronizada del mismo
     nombre**, así que copiarla, corregirla y commitearla la deja arreglada de verdad, la
     vuelve auditable y permite blindarla con un test (patrón:
     `test/regression-house-sevillana-direccion.test.ts`). Como toca comportamiento de una
     skill, va por **PR draft + Telegram**, no auto-aplicado. Solo cuando eso no sea posible
     (la skill es de terceros y no se quiere versionar) se cae al aviso repetido, y entonces
     con fichero, línea y valor correcto exactos.
   - **Tabla de rutas del triaje de correo** (`apps/plataforma/lib/correo/rutas.ts`, fuente única):
     Alberto crea agentes/skills continuamente. Comprueba que toda skill/agente que reciba trabajo
     POR CORREO tiene su categoría en `RUTAS[]`. Señales de drift: una skill nueva en `.claude/skills/`
     cuyo dominio produce correos (facturas, huéspedes, leads, un vertical nuevo) sin categoría propia
     en `rutas.ts`, o una categoría en `rutas.ts` cuya skill destino ya no existe. Como `rutas.ts` es
     **código**, esto es **carril 2**: abre PR draft con la fila propuesta (categoría + etiqueta
     `Triaje/*` + acción + aviso) y **avisa por Telegram** con el link. La parte de doc (`docs/SKILLS.md`,
     este mapeo) es carril 1. No inventes categorías: si dudas, proponla en el PR para que Alberto decida.
   - **Frescura (idea D):** apóyate en `docs/FUENTES-DE-VERDAD.md`. Por cada doc/skill cuyo
     path de código mapeado **cambió en el rango**, reverifícalo (es candidato a stale).
     Estampa/actualiza el sello `<!-- verificado: YYYY-MM-DD -->` al pie del doc tras
     reconciliarlo. Un doc con sello muy viejo cuyo código cambió = revisar sí o sí.
   - **Catálogo de huecos (`docs/HUECOS-ABIERTOS.md`) — carril 1.** Es lo que cruza
     `conectores-vigia` contra el registro de conectores, así que si envejece, ese agente calla
     por la razón equivocada: no porque no haya nada, sino porque no sabe lo que falta. Dos
     direcciones, y la segunda es la que muerde:
     1. **Huecos nuevos:** si en el rango aparece un `TODO`/comentario/doc declarando que falta
        una fuente de datos o una capacidad externa, añádelo con su fuente citada.
     2. **Huecos ya CERRADOS que siguen listados como vivos.** Por cada hueco vivo, comprueba en
        el **CÓDIGO** que sigue abierto — no en el doc que lo declaró. Si hay una pieza propia que
        ya lo cubre, muévelo a «cerrados» diciendo con qué.

     El caso fundacional es del 21/08/2026 y es el motivo de que este paso exista:
     `TRADING-FUENTES-PAGO.md` (15/08) declaraba la fecha de earnings como «el único hueco con
     coste directo en dinero real» cuando `apps/plataforma/lib/trading/earnings-yahoo.ts` la
     cerraba desde el **05/08** — diez días antes de que se escribiera el doc. Se estuvo a punto
     de integrar un conector redundante y peor por creerle al doc.

     **Un catálogo de huecos envejece hacia el lado peligroso: sigue pidiendo lo que ya tienes, y
     nadie lo nota porque pedir de más no rompe nada visible.** Por eso se comprueba contra el
     código, no contra el doc.
   - **Manuales de usuario final** (que el código nuevo casi nunca actualiza — punto ciego
     histórico). Procedimiento concreto, no "echar un vistazo":
     1. Del `git log` del rango, lista las features VISIBLES para el usuario (rutas nuevas en
        `apps/*/src/app/**`, botones/toggles en componentes, endpoints que cambian el flujo de
        un rol). Ignora cambios internos (libs, tipos, crons sin UI).
     2. Por cada feature visible, comprueba que aparece (por palabra clave) en:
        - `apps/ia-rest/src/components/help/help-prompts.ts` — en el `ROLE_PROMPTS` del/los
          rol(es) afectado(s) (camarero `/edge`, cocina `/kds`, owner `/owner`, etc.).
        - `apps/ia-rest/public/manual.html` (y `public/manuales.html` si aplica).
        Si falta, **parchéala** (es texto, riesgo bajo → carril 1): añade 1-3 líneas en el rol
        correcto, en el mismo tono que las entradas vecinas.
     3. Los **PDF** de `public/manuals/*.pdf` son binarios generados aparte: NO los toques.
        Deja/actualiza el texto listo para pegar en `docs/manuals-texto-<feature>.md` y anótalo
        como acción manual de Alberto en el informe.
     4. En el cuerpo del PR (o en el aviso) di explícitamente qué manuales tocaste y cuáles
        quedan pendientes (los PDF). Si todo estaba documentado, dilo y no toques nada.

5. **Arreglos en el acto, por carril:**
   - **Texto** (memoria/skills/docs/manuales, acotado): **carril 1** → directo a `main` (paso 6).
   - **Código de bajo riesgo** (típicos de `auditoria-central`): **carril 2** → al PR draft,
     no a `main`.
   - **Gran radio / migraciones / cortes de env:** NO se tocan; hallazgo + acción manual en
     el informe (carril 2).
   Aplica el **guardarraíl B**: si dudas de si un cambio de texto es "acotado", trátalo como
   carril 2.

6. **Entrega — dos carriles + frugalidad.** En este orden:
   1. **Carril 1 (auto-aplicar):** commitea TODAS las reconciliaciones de texto y haz
      `git push` directo a **`main`** (con `-u origin main` y reintentos con backoff si hay
      fallo de red). Anota cada cambio en `docs/AUTO-APLICADOS.md` (fecha · archivo · qué ·
      por qué · SHA), también en el mismo commit.
      **Si el push a `main` te lo rechaza el entorno**, aplica el plan B del apartado "Dos
      carriles" de arriba: PR propio SOLO con ficheros de registro (se auto-mergea), y lo que
      cambie comportamiento al PR del carril 2.
   2. **Carril 2 (revisión):** si hay fixes de código de bajo riesgo, crons mudos o hallazgos
      que requieren tu ojo, crea rama `claude/auditoria-diaria-<YYYY-MM-DD>` **desde el `main`
      ya actualizado**, commitea ahí SOLO esos cambios + el informe `docs/AUDITORIA-<YYYY-MM>.md`
      y abre **PR draft** (cuerpo = resumen ejecutivo por severidad + acciones manuales).
   3. **Aviso Telegram (idea A):** si el carril 2 produjo PR (o hay 🔴/🟡 / cron mudo), manda
      el aviso llamando al endpoint interno (NUNCA la Bot API directa — ver nota de arriba),
      con botones-URL si aplica: **[📋 Ver PR draft](url)** y, si aplica, **[📄 Informe](url)**.
      Cuerpo: severidades + 1 línea por hallazgo "raro". Así lo abres y arrancas la
      conversación desde el PR. (Si no hay `PLATAFORMA_URL`/`ALERTA_TOKEN`, omite.)
      Comando de referencia:
      ```bash
      curl -s -X POST "${PLATAFORMA_URL}/api/internal/alerta" \
        -H "Authorization: Bearer ${ALERTA_TOKEN}" -H "Content-Type: application/json" \
        -d '{"text":"<resumen HTML, incluye el link al PR>"}'
      ```
   4. **Frugalidad:** si NO hubo nada que auto-aplicar (carril 1 vacío) Y nada "raro" (carril
      2 vacío) → no push, no PR, no Telegram. Excepción: el heartbeat semanal de abajo.

## Heartbeat semanal — vigila al vigilante (idea C)
El problema de "crons mudos" le aplica a la propia auditoría: si la rutina deja de correr,
nadie se entera. En la pasada **profunda (`--profunda`, domingos)**, manda **siempre** un
Telegram corto de "sigo viva" aunque no haya nada que reportar (p. ej.
`✅ Auditoría semanal OK · sin hallazgos · <fecha>`), para confirmar que el trigger vive.
En las pasadas ligeras diarias NO se manda heartbeat (solo se avisa si hay carril 2), para
no hacer ruido.

## Reglas
- **Carril 1 solo texto acotado** (guardarraíl B). Lo grande/estructural o cualquier código
  → carril 2 (PR draft + aviso). Ante la duda, carril 2.
- Nunca ejecutes cortes de envs ni migraciones en producción: documéntalo como acción
  manual de Alberto con rollback (carril 2).
- No "arregles" `ignoreBuildErrors` (decisión deliberada de las apps).
- Frugal con el ruido: sin cambios → sin push, sin PR, sin Telegram (salvo heartbeat semanal).

## Fase 2 (anotada, NO implementar aquí)
- **E · Shift-left:** un check ligero que en cada PR detecte si toca código cuya doc asociada
  (vía `docs/FUENTES-DE-VERDAD.md`) no se actualizó, y lo comente. Evita que la info nazca vieja.
- **H · Trigger por evento:** disparar la auditoría también **tras cada merge a `main`**, no
  solo a las 04:00, para actualizar la doc al ritmo del cambio.

## Canal de aviso — protocolo común

**Preflight AL ARRANCAR** (no al final, cuando ya tengas algo que contar):
`GET {PLATAFORMA_URL}/api/internal/alerta` con `Authorization: Bearer {ALERTA_TOKEN}`.

- `200` → el canal está vivo, sigue con tu pasada.
- `401` → el canal está **mudo** (el token de ESTE entorno no coincide con el de Vercel `plataforma`;
  hay un entorno por rutina y se desincronizan de uno en uno). El cuerpo trae `causa` y `remedio`.
  Entonces, según `docs/AVISOS-AGENTES.md`: avisa por el **push nativo** de la sesión empezando por
  `🔇 SIN TELEGRAM (401):` y deja el aviso **entero** en `docs/AGENTES-BITACORA.md` (`fallos:`).

Nunca te inventes el token, nunca uses `CRON_SECRET` en el prompt, y **nunca falles en silencio**.
