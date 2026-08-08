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
> **MCPs que necesita:** Supabase + Vercel + github (todo lectura, salvo abrir el PR).
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
>   (lockfile, radiografía de estructura, drift skills↔código). SALTA typecheck de las 4
>   apps y tests pesados. Rápida y de bajo ruido. Es la red de seguridad del guardián de
>   cierre (`persist-memoria.sh`): caza lo que las sesiones no anotaron a mano.
> - **Profunda (`/auditoria-diaria --profunda`, semanal):** corre `auditoria-central`
>   ENTERA (typecheck de las 4 apps + tests + seguridad multi-tenant + infra por MCP).

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

## Pasos (crea un TodoWrite por bloque)

1. **Encuadre.** Lee `MATRIZ.md` y las entradas de arriba de `docs/CONTEXTO-SESIONES.md`.
   Saca el rango de cambios: `git log --since="<fecha última auditoría>" --stat` (o las
   últimas ~48h si no hay referencia). Si NO hay commits nuevos desde la última
   auditoría → salta a la **decisión de cierre** (paso 6): probablemente solo toque el
   heartbeat semanal, si aplica.

2. **Auditoría según cadencia.**
   - **Modo ligero (por defecto):** invoca **`auditoria-central`** pero recorre solo los
     bloques baratos (integridad estructural: lockfile + radiografía + `transpilePackages`;
     coherencia de docs; deps/código muerto rápidos). SALTA typecheck de las 4 apps y los
     tests pesados — esos son de la pasada semanal.
   - **Modo profundo (`--profunda` en el prompt):** recorre `auditoria-central` ENTERA
     (integridad, typecheck de las 4 apps, tests, seguridad multi-tenant, deps, infra real
     por MCP, coherencia de docs).
   Distingue error real de ruido de entorno; no infles conteos.

2-bis. **Heartbeat de crons** (barato, corre SIEMPRE — también en modo ligero).
   Los crons pueden dejar de escribir en silencio (p. ej. jun-2026: el middleware de
   plataforma redirigía los crons `/api/sivra/*` a `/login` y estuvieron 5 días mudos sin
   que saltara ninguna alarma). Este check vigila el **síntoma** (no hay filas frescas),
   así que caza cualquier causa (middleware, clave Smoobu, bug en handler, caída Vercel…).
   Corre por Supabase MCP (lectura) sobre `wswbehlcuxqxyinousql`:

   ```sql
   WITH h(cron, tabla, ultimo, max_horas) AS (
     SELECT 'rates/snapshot',            'rate_snapshots',         max(created_at),     36 FROM rate_snapshots
     UNION ALL SELECT 'pricing/apply-auto',       'pricing_applied',        max(applied_at),     36 FROM pricing_applied
     UNION ALL SELECT 'updates/sync',             'incomes',                max("createdAt"),    36 FROM incomes
     UNION ALL SELECT 'mercado/cron in-app',      'market_rates normal',    max(created_at),     36 FROM market_rates WHERE scenario='normal'
     UNION ALL SELECT 'pricing/pilot-track',      'pricing_pilot_tracking', max(created_at),     36 FROM pricing_pilot_tracking
     UNION ALL SELECT 'limpiadoras/auto-sessions','cleaning_sessions',      max(created_at),     36 FROM cleaning_sessions
     UNION ALL SELECT 'concursos-ingesta',        'concursos_licitaciones', max(actualizado_en), 12 FROM concursos_licitaciones
     -- psd2: la huella es «hay movimientos NUEVOS», no «el cron corrió» — un finde sin cargos la
     -- deja quieta >30h con el cron vivo (falsa alarma 02/08/2026: cron 200 a las 06:01 y ⛔ igual).
     -- 54h cubre el finde; el guardián dedicado (psd2-health-check, <48h) sigue siendo el fino.
     UNION ALL SELECT 'psd2-sync',                'movimientos_bancarios',  max(created_at),     54 FROM movimientos_bancarios
     UNION ALL SELECT 'correo-triaje',            'correo_cursor',          max(updated_at),      2 FROM correo_cursor
     -- AGENTES (sesiones Claude programadas) + crons de trading. Umbrales por cadencia real:
     -- diario→~30h, cada-6h→12h, SEMANAL→~192h (8 días). OJO: la huella tiene que ser la del
     -- AGENTE, no una que otro proceso mantenga fresca (ver nota del pricing abajo).
     UNION ALL SELECT 'AGENTE pricing (estudio mercado)', 'market_rates prop_*',    max(created_at),     192 FROM market_rates WHERE scenario LIKE 'prop_%'
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

   - Cualquier fila **⛔ MUDO** es hallazgo 🔴 y **caso estrella del carril 2**: investiga la
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
   - Si todo ✅, una línea verde en el informe y sigue.

3. **Informe.** Crea/actualiza `docs/AUDITORIA-<YYYY-MM>.md` con hallazgos por
   severidad (🔴/🟡/🟢), cada uno con `ruta:línea` + acción, y el checklist de acciones
   manuales de Alberto (Supabase/Vercel) con orden seguro y rollback. El informe va en el
   PR draft del **carril 2** (no a `main`).

4. **Reconciliación de memoria y skills** (el núcleo, **carril 1**):
   - `docs/CONTEXTO-SESIONES.md`: añade entrada(s) de lo hecho en el rango que no esté
     anotado; mueve a "hecho" los pendientes ya resueltos; corrige el "Estado actual".
   - **Rotación mensual de la memoria (ahorro de contexto):** si el archivo vivo contiene
     entradas de un mes YA CERRADO, ejecuta `node scripts/rotar-memoria.mjs` (idempotente;
     las archiva en `docs/memoria/AAAA-MM.md`). Además, si ves entradas nuevas que violan
     la regla de tamaño (~8 líneas máx), resúmelas en el archivo vivo (carril 1).
   - Skills-maestro (`central-maestro`, `ia-rest-maestro`, `sivra-maestro`,
     `ialimp-maestro`, `plataforma-maestro`) y los `apps/*/CLAUDE.md`: corrige cualquier
     afirmación que el código contradiga (rutas, envs, tablas, reglas, estado). Si una
     skill y el código discrepan, **manda el código**.
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
