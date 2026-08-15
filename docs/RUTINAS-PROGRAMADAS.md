# Rutinas programadas — `central`

> Sesiones de Claude Code que corren **solas** en la nube ("cowork") disparadas por un
> trigger. Los triggers se crean en **`claude.ai/code → Rutinas`** (UI), **no** en el repo:
> este doc es la fuente única de qué hay configurado, cuándo y con qué.
>
> El contenedor es efímero: una rutina NO puede leer las conversaciones de otras sesiones.
> Reconcilia lo que quedó **commiteado** (memoria/skills/docs) contra el código e infra reales.

## Cómo llega el texto a `main` (léelo antes de tocar una rutina)
La suposición original era que una rutina puede **empujar texto directo a `main`** (el "carril 1").
En la práctica **no puede**: corre bajo el harness de tareas de GitHub, que le asigna una rama y le
prohíbe tocar `main`. Del 04 al 07/08/2026 eso dejó **cinco PRs de rutinas muertos en conflicto**
(#1252, #1254, #1277, #1279, #1286) y hubo que rescatar su texto a mano.

Desde el 07/08/2026 el repo cierra el círculo solo con
**`.github/workflows/rutinas-automerge.yml`**:

| | |
|---|---|
| **Qué mergea** | PRs de rama `claude/*`, del dueño del repo, cuyo diff toca **SOLO ficheros de registro**: `docs/CONTEXTO-SESIONES.md`, `docs/AGENTES-BITACORA.md`, `docs/AUTO-APLICADOS.md`, `docs/AUDITORIA-*.md`, `docs/memoria/*.md`. |
| **Qué NO mergea (a propósito)** | Todo lo que **le dice a un agente qué hacer**: `.claude/**`, `CLAUDE.md`, `AGENTS.md`, `docs/SKILLS.md`, `docs/FUENTES-DE-VERDAD.md`, este mismo fichero. Y por supuesto código, infra y workflows. Un agente que se reescribe las instrucciones sin que nadie mire es justo el fallo que no queremos: eso sigue siendo carril 2. |
| **Condiciones** | CI **entera en verde** (y al menos un check — "sin checks" no es "checks OK"), sin conflicto, y el último commit con **≥20 min** de antigüedad (para no comerse el push del hook `Stop` de la sesión que aún está viva). |
| **Cuándo corre** | Al terminar la CI de un PR, al abrirse/actualizarse un PR, y **cada hora** como red de seguridad (los eventos se pierden a veces y los conflictos aparecen después). |
| **Si hay conflicto** | **Lo resuelve el bot** cuando es una **inserción pura** (cada rama añadió su entrada arriba: se conservan LAS DOS, primero la que ya estaba en `main`). Si alguien **editó** texto que ya existía, no toca nada y deja **un** comentario — ahí sí hace falta mano humana. La guarda es la sección base de `merge.conflictStyle=diff3`: base vacía = nadie pisa a nadie. Lógica en `scripts/resolver-conflicto-registro.mjs` (puro + 14 tests). |
| **Cómo pararlo** | Etiqueta `no-automerge` en el PR (puntual), o deshabilitar el workflow en Actions (del todo). |

**Consecuencia para quien escribe una rutina:** separa siempre en **dos PRs** cuando toques ambas
cosas. El de registro se mergea solo y no envejece; el que cambia comportamiento espera a Alberto.

## Cómo se crea un trigger (1 vez, manual de Alberto)
1. Entra en `claude.ai/code` → **Rutinas** → **Nueva rutina**.
2. Repo: `central`. Rama: la que prefieras (la rutina abre su propio PR draft).
3. Define horario, prompt y MCPs según la tabla de abajo.
4. **Adjunta SOLO los conectores que la rutina usa de verdad — y ninguno más.** El propio formulario
   avisa de que la rutina usará **todas** las herramientas de los conectores adjuntos, **incluidas las
   de escritura, sin pedir permiso en cada ejecución**. Y los conectores vienen **heredados en bloque**:
   al montar `mercado-booking` (08/08/2026) el formulario traía **16 adjuntos** de serie — entre ellos
   Interactive Brokers, Gmail, Resend y Vercel — para una rutina que lo único que hace es escribir
   comparables de mercado. Eso es dar a un agente desatendido la capacidad de operar en el bróker,
   mandar correo y tocar infraestructura para una tarea que no lo necesita. Es el mismo principio por
   el que las rutinas llevan `ALERTA_TOKEN` y no `CRON_SECRET`: **el mínimo alcance que le permita
   hacer su trabajo**. La columna "MCPs / envs" de cada ficha lista lo NECESARIO; lo que no esté ahí,
   se quita.
   ⚠️ Dos cosas que NO son conectores y por eso no hay que adjuntar: **GitHub** (es nativo al vincular
   el repo) y las llamadas HTTP a plataforma (`/api/...` con Bearer, van por red normal).
5. Guarda. A partir de ahí corre sola; revisa el PR draft que deje.

---

## Rutinas

### 1. Auditoría nocturna ligera — *activa*
| | |
|---|---|
| **Cuándo** | Diaria, ~**04:00 CEST** |
| **Prompt** | `Ejecuta /auditoria-diaria` |
| **MCPs / envs** | Supabase + Vercel (lectura). **GitHub es nativo** al vincular el repo — ya cubre lectura + abrir el PR + push a `main`. Para el aviso, `PLATAFORMA_URL` + `ALERTA_TOKEN` en la env de la rutina (**NUNCA** `TELEGRAM_BOT_TOKEN`/`CHAT_ID` directos — ver "Arquitectura de notificaciones Telegram" abajo; si faltan, el aviso se omite). |
| **Qué hace** | Reconcilia `CONTEXTO-SESIONES.md` + skills-maestro + `CLAUDE.md` + `docs/SKILLS.md` contra el código real + checks baratos (lockfile, estructura, drift) + **heartbeat de crons/agentes** (paso 2-bis: `agente_latidos` como fuente preferida + filas frescas en BD para lo no instrumentado + reconciliación de cobertura contra `CRON_JOBS`/`AGENTES_VIGILADOS`/este doc) + **backlog de PRs de rutinas y salud del automerge** (paso 2-ter: PRs de registro atascados, conflictos, drafts olvidados, workflow `rutinas-automerge` vivo). SALTA typecheck/tests pesados. |
| **Resultado (dos carriles)** | **Carril 1:** los arreglos de **texto** (memoria/skills/docs/manuales) se **auto-aplican a `main`** (sin PR) y se anotan en `docs/AUTO-APLICADOS.md`. Si el entorno no deja empujar a `main` → PR propio SOLO con ficheros de registro, que **se mergea solo** (ver "Cómo llega el texto a `main`" abajo). **Carril 2:** lo "raro" (código, infra, crons mudos, gran radio) → **PR draft** `claude/auditoria-diaria-<fecha>` + **aviso Telegram** con botón-URL al PR. **Sin nada** → sin push, sin PR, sin aviso. |

Es la **red de seguridad** del guardián de cierre (`.claude/hooks/persist-memoria.sh`):
caza lo que las sesiones del día no anotaron a mano.

### 2. Auditoría semanal profunda — *activa*
| | |
|---|---|
| **Cuándo** | Semanal (domingos, ~**04:00 CEST**) |
| **Prompt** | `Ejecuta /auditoria-diaria --profunda` |
| **MCPs / envs** | Supabase + Vercel. **GitHub nativo**. `PLATAFORMA_URL` + `ALERTA_TOKEN` para el aviso y el **heartbeat semanal** (**NUNCA** `TELEGRAM_BOT_TOKEN`/`CHAT_ID` directos — ver "Arquitectura de notificaciones Telegram" abajo). |
| **Qué hace** | `auditoria-central` ENTERA: typecheck de las 8 apps + tests + seguridad multi-tenant + `pnpm audit` + infra por MCP (incl. `ignoreCommand` en los 8 `vercel.json`) + coherencia de docs. |
| **Resultado** | Igual que la ligera (carril 1 a `main` + carril 2 PR draft con informe `docs/AUDITORIA-<YYYY-MM>.md` + aviso Telegram). Además, **heartbeat semanal**: manda SIEMPRE un Telegram corto de "sigo viva" aunque no haya hallazgos, para confirmar que la rutina no se ha muerto en silencio. |

### 3. Facturas correo — *activa*
| | |
|---|---|
| **Cuándo** | Diaria, **08:00 CEST** |
| **Prompt** | `Ejecuta la skill facturas-correo` |
| **MCPs** | Gmail + Drive + Supabase |
| **Qué hace** | Revisa Gmail, clasifica facturas (personal vs deducible), archiva en Drive y concilia con movimientos bancarios de plataforma. |

### 4. Pricing agente (SIVRA) — *activa*
| | |
|---|---|
| **Cuándo** | Semanal, **lunes 07:00 CEST** (verificado en la UI el 13/07/2026) |
| **Prompt** | `Ejecuta la skill pricing-agente` |
| **MCPs** | Booking.com + Expedia + lastminute.com + Supabase |
| **Qué hace** | Consulta Booking/Expedia/lastminute por zona → compara con tarifas actuales → propone ajustes → escribe en `pricing_decisiones` + `pricing_aprendizaje`. Alimenta el motor determinista (`apply-auto` 3×/día) con datos de mercado reales para fechas lejanas que Serper no alcanza. |
| **Primer ciclo** | Arrancar con `dryRun: true` (la skill lo impone). Revisar el PR draft con propuestas antes de pasar a `dryRun: false` en el segundo ciclo. Solo `busto_reform` tiene `apply_enabled=true`. |
| **Verificar** | `SELECT * FROM pricing_decisiones WHERE source='agente' ORDER BY created_at DESC LIMIT 20` + filas en `pricing_aprendizaje` |

### 5. Vigilante de novedades fiscales (IRPF) — *activa*
| | |
|---|---|
| **Cuándo** | Mensual, **día 1 ~07:00 CEST** (+ ejecución manual antes de la campaña de renta, abril) |
| **Prompt** | `Ejecuta la skill fiscal-novedades` |
| **MCPs** | Supabase. **GitHub nativo** (abre el PR). WebFetch + WebSearch son herramientas nativas de Claude, no MCPs externos. |
| **Qué hace** | Contrasta `IMPORTES_POR_ANIO` de `/finanzas` con BOE (estatal) + BOJA (Andalucía). Si una deducción/mínimo cambia: actualiza la constante por PR draft e inserta en `fiscal_novedades` (`beneficia = nuevo > anterior`) → la app avisa en pantalla. Sin cambios → sin PR. |
| **Verificar** | Si el chat dice "sin cambios; revisado contra BOE a fecha X" → funciona. Si hay cambio → PR draft `claude/fiscal-novedades-<fecha>`. |

### 6. Guardián PSD2 / Enable Banking — *activa*
| | |
|---|---|
| **Cuándo** | Semanal, **miércoles ~09:00 CEST** |
| **Prompt** | `Ejecuta la skill psd2-health-check` (ver nota env vars abajo) |
| **MCPs** | Supabase |
| **Qué hace** | Verifica que `movimientos_bancarios` tiene datos frescos (<48h). Si el cron Vercel `psd2-sync` lleva >48h sin importar datos, o hay una caída >50% en volumen mensual, alerta por Telegram y anota en `CONTEXTO-SESIONES.md`. Sin anomalías → sin ruido. |
| **Verificar** | El chat de la sesión muestra `✅ OK` o `🚨 ANOMALÍA`. Comprobar que la fecha de último movimiento es reciente. |

### 7. ialimp client health (Sique Brilla) — *activa*
| | |
|---|---|
| **Cuándo** | Semanal, **viernes ~17:00 CEST** |
| **Prompt** | `Ejecuta la skill ialimp-client-health` (ver nota env vars abajo) |
| **MCPs** | Supabase |
| **Qué hace** | Revisa el estado operativo de Sique Brilla: frescura del PMS sync (iCal/Smoobu), programaciones sin asignar, impagos activos. Genera un resumen de cierre de semana. Solo lectura — no modifica datos. |
| **Verificar** | El chat muestra un resumen `📋 Sique Brilla — semana {FECHA}` con ✅/⚠️ por área. |

> ⚠️ **Incidente 10/07/2026 — "la skill ialimp-client-health no existe en este entorno" → RESUELTO y RE-DIAGNOSTICADO (13/07/2026).**
> Esta rutina fardó el 10/07 a las 17:06 y falló: esa sesión arrancó en un `/home/user` **sin el repo
> `central` clonado**, así que no vio la skill (que vive en `.claude/skills/` del repo). Se documentó una causa
> raíz ("a 7 triggers les falta el repo como *fuente*") que la **verificación en la UI del 13/07/2026
> demostró incorrecta**: al abrir cada rutina en `claude.ai/code → Rutinas`, **las 7 ya tienen
> `albertosuarezgutierrez-gif/central` adjunto como repositorio**. No faltaba en ninguna.
> **Estado real confirmado (verificación de solo lectura + run manual, 13/07/2026):**
> - Una **ejecución manual** de `ialimp-client-health` el 13/07 11:36 **completó correctamente**: encontró y
>   ejecutó la skill, el entorno **sí tenía el repo clonado** (git activo; la propia pasada commiteó su bitácora
>   y abrió el PR draft #870), y el chequeo salió en verde (Sique Brilla: PMS sync sano, sin limpiazas urgentes
>   sin asignar, sin impagos). **Ya funciona.**
> - Los fallos en rojo del **8/07** de `psd2-health-check` y de "Agente de prospección comercial" **no eran de
>   config**: eran **"Límite de uso alcanzado"** (límite semanal de la cuenta, reset 11/07 07:00 UTC). Transitorio,
>   ya pasado.
> - Los runs antiguos de `ialimp` que arrancaron "sin repo" no se explican por un trigger sin fuente (la tenía):
>   o el repo se adjuntó/propagó después, o hubo un desfase puntual *adjuntado ≠ clonado* en la plataforma. No es
>   accionable desde el doc; si `ialimp` volviera a fallar con "sin repo" pese a figurar adjunto, ES un bug de
>   plataforma a escalar.
> - **Deriva pendiente (no bloqueante):** las queries SQL de la skill `ialimp-client-health` están **desfasadas
>   respecto al esquema real** (`reservas`/`facturas`/`programaciones.estado` ya no existen; los equivalentes reales
>   son `cleaning_sessions`/`pms_connections`/`facturas_clientes`). La pasada completó inspeccionando el esquema en
>   vivo y lo dejó anotado en `docs/AGENTES-BITACORA.md` para que **`agentes-entrenador`** actualice la skill.


### 8. RRHH compliance calendar — *activa*
| | |
|---|---|
| **Cuándo** | Mensual, **día 1 ~08:00 CEST** (1h después de fiscal-novedades) |
| **Prompt** | `Ejecuta la skill rrhh-compliance-calendar` |
| **MCPs** | Ninguno |
| **Qué hace** | Lee `docs/ROADMAP-rrhh.md`, filtra ítems 🔴 obligatorios no completados y genera un informe de plazos legales (RD 8/2019 fichaje, RGPD art.28, canal denuncias, etc.). Mantiene visibilidad sobre obligaciones con riesgo de multa. |
| **Verificar** | El chat muestra el informe de compliance con la lista de ítems 🔴 pendientes. |

### 8-bis. Mercado real por fecha (SIVRA / Booking) — *ACTIVA desde el 08/08/2026*
> Creada a mano por Alberto («SIVRA mercado booking (diario)») tras dos meses de latido en «sin
> ninguna señal registrada» — que era el diagnóstico correcto: no existía. **No se pudo crear por
> API**: el parámetro de conectores no está disponible para esta organización, y sin el conector de
> Booking la rutina no puede medir nada. Primera pasada real ese mismo día, disparada a mano:
> **120 comps en 12 ventanas, todas con respuesta del conector, 0 fallos**, latido `ok=true`.
>
> 🚨 **Al crearla, el formulario traía 16 conectores heredados** (Interactive Brokers, Gmail, Resend,
> Vercel…) para una rutina que solo escribe comparables. Se dejó **solo Booking.com** — ver el paso 4
> de "Cómo se crea un trigger".

| | |
|---|---|
| **Cuándo** | Diaria, **05:30 CEST** (03:30 UTC — media hora después del barrido de las 03:00 UTC, para que la cobertura del día ya esté escrita cuando se pide el plan) |
| **Prompt** | `Ejecuta la skill mercado-booking` |
| **MCPs / envs** | **Booking.com y NADA MÁS** (obligatorio; el formulario trae 16 conectores heredados — quitar los otros 15, ver paso 4 de "Cómo se crea un trigger"). GitHub va nativo por el repo; las 3 llamadas a plataforma son HTTPS con Bearer, no necesitan conector. · `PLATAFORMA_URL` + `ALERTA_TOKEN` en la env de la rutina (**NUNCA** `CRON_SECRET`). Sin esas dos envs no puede ni pedir el plan ni escribir: el latido saldría en rojo. |
| **Qué hace** | Pide a `GET /api/sivra/mercado/plan?max=12` las ventanas (fecha × aforo) con el corpus fiable más viejo, las mide con el conector de Booking (`number_of_adults` = aforo real del piso), y escribe los comparables en `market_rates` por `POST /api/sivra/mercado/ingest` con **`fuente:"booking_mcp"`**. Cierra con `POST /api/internal/latido` (`sivra_mercado_booking`). |
| **Por qué existe** | Es la **única** fuente que distingue temporada. El barrido por búsqueda web da precios de anuncio SIN fecha: medido el 06/08/2026 para el Dúplex el 4-sep, Serper decía p50 **171€** y el mercado real era **129€** (−33%), con los mismos comps repitiendo precio en agosto, noviembre y marzo. Ver `docs/superpowers/specs/2026-08-06-mercado-booking-design.md`. |
| **Verificar** | `SELECT checkin_date, guests, count(*) FROM market_rates WHERE fuente='booking_mcp' AND search_date >= CURRENT_DATE - 1 GROUP BY 1,2` + fila `sivra_mercado_booking` en `agente_latidos` con `ok=true`. |
| **Qué se vio en la 1ª pasada (08/08/2026)** | La temporada que Serper NUNCA pudo ver, medida sobre una fecha por mes: **House (12p)** 474€ sep · **856€ oct** · 604€ nov · 424€ dic · 368€ ene; **Luxury (5p)** 196/282/206/174; **Busto (2p)** 110/174/156/106/104. Octubre es el pico en los cuatro aforos. Para comparar: el corpus Serper le ponía a House **260€** — con precios de apartamento de 4 plazas. Cobertura tras la 1ª: 17 de 120 ventanas (12 de la rutina + 5 medidas a mano esa mañana). |
| **El motor ya lo usa (08/08/2026, misma tarde)** | Con 19 ventanas más medidas a mano (190 comps), **ago-2026→ene-2027 tiene ≥3 fechas SIN evento por mes en los 4 pisos**, que es lo que exige `MIN_FECHAS_MES` — el bucket mensual está vivo y con él se activó `apply_enabled` en Dúplex y House. 🚨 **Al elegir qué fecha medir, cuenta las fechas que ve el MOTOR, no las que hay en la tabla**: el bucket excluye las fechas de evento del calendario del repo **y** de `pricing_eventos_auto`, así que un mes con 6 fechas medidas puede tener 1 elegible (le pasó a septiembre: la Feria/Bienal se come del 9 al 30). De feb a jul-2027 aún no hay bucket: esos meses caen al ancla global + prior estacional, que es el fallback de diseño. |
| **🪞 Nuestro propio anuncio NO es comparable (14/08/2026)** | Booking devuelve nuestros pisos entre los resultados de la búsqueda («HOUSE SEVILLANA 6 habitaciones» en la ventana de aforo 12): escribirlo ancla el mercado al precio que el propio motor acaba de poner, y **`fuente='booking_mcp'` no protege** porque el precio es real y de la fecha correcta — lo que falla es de QUIÉN es. Raíl en `lib/sivra/mercado-propios.ts` (lista **curada**, no heurística) aplicado en `/api/sivra/mercado/ingest`, que devuelve `propios[]` en lugar de descartar en silencio; el parte del latido lo declara vía `detalleIngesta`. ⚠️ Un falso positivo aquí es peor que el fallo original: descartaría un comparable legítimo (hay competencia real en Calle Bustos Tavera, donde están dos de nuestros pisos) y adelgazaría el corpus de la fecha justo por debajo del umbral que descongela un evento. Se añade una entrada cuando se VE el anuncio propio en una respuesta real. Corpus histórico verificado limpio. |
| **Pendiente (fase 2)** | Cuando haya ≥3 fechas por mes con `fuente='booking_mcp'` **en todo el horizonte de 365 días** (hoy solo ago→ene): retirar `mercado/sweep` de `CRON_JOBS`, neutralizar las filas `serper` de fechas lejanas y quitar su latido. **No antes**: en feb→jul el bucket todavía lo sostiene Serper. |

### 8-ter. Vigilancia diaria pricing SIVRA — *TEMPORAL, activa desde el 09/08/2026*
> Pedida por Alberto el 09/08/2026 tras poner los 4 pisos bajo el motor propio (PriceLabs de baja,
> last-minute activado): «haz seguimiento que todo vaya ok varios días hasta que confirme que todo
> ok — septiembre empieza temporada». **Se BORRA cuando Alberto confirme** (`delete_trigger`).

| | |
|---|---|
| **Cuándo** | Diaria, 09:00 UTC (tras el guardián de las 07:30 y la pasada de las 08:30) |
| **Trigger** | `trig_01Eagedr3hBNtpf1oEgDHj5R` — self-bind a la sesión del 09/08 (hereda sus conectores, Supabase incluido; el parámetro `connectors` de la API no está disponible en esta organización) |
| **Qué hace** | Verifica las últimas 24h: 3 pasadas `apply-auto` escritas en los 4 pisos · ningún precio bajo `min_price` ni fuera del raíl ±20% vs REF24 · PriceLabs sigue mudo en Dúplex/House · last-minute solo dentro de la antelación mediana y sin perforar suelos · alertas del guardián 07:30 · reservas nuevas no bajo el p50 fiable de su fecha |
| **Si todo bien** | Una línea corta de confirmación a Alberto; si algo grave, pausa el motor (`pricing_config.paused=true`) y avisa con detalle |

### 9. Vigía GitHub/OSS — *pendiente de trigger*
| | |
|---|---|
| **Cuándo** | Mensual, **día 15 ~07:00 CEST** |
| **Prompt** | `Ejecuta la skill github-vigia` (+ `PLATAFORMA_URL`/`ALERTA_TOKEN` en instrucciones para el aviso, como psd2) |
| **MCPs / envs** | Ninguno externo — WebFetch + WebSearch (nativas) para repos externos (el MCP de GitHub va scopeado a `central`) y Bash para `pnpm outdated`/`audit`. `PLATAFORMA_URL` + `ALERTA_TOKEN` para el aviso Telegram (si faltan, se omite). |
| **Qué hace** | Tres patas: (1) releases de la lista curada en `docs/VIGIA-OSS.md` (VROOM, OSRM, openrouteservice, Leaflet, Traccar, web-push…), (2) descubrimiento de herramientas nuevas por vertical juzgadas contra los pendientes reales, (3) npm outdated + CVEs filtrados a producción. Vigila hacia FUERA (la auditoría vigila hacia dentro). |
| **Resultado** | Actualiza `docs/VIGIA-OSS.md` (versiones vistas + bitácora). Algo que merece ojo → **Telegram**; bump pequeño y seguro → **PR draft** `claude/github-vigia-<fecha>`. Sin novedades → sin ruido. |

### 11. Buscador de IA (LLMs gratis) — *pendiente de trigger*
| | |
|---|---|
| **Cuándo** | Semanal, **lunes ~07:00 CEST** (después del pricing-agente de las 06:00) |
| **Prompt** | `Ejecuta la skill buscador-ia` (+ `PLATAFORMA_URL`/`ALERTA_TOKEN` en instrucciones para el aviso, como psd2/github-vigia) |
| **MCPs / envs** | Ninguno externo — WebFetch + WebSearch (nativas) para los catálogos de proveedores. `PLATAFORMA_URL` + `ALERTA_TOKEN` para el aviso Telegram (si faltan, se omite). Opcional: si el prompt incluye `NVIDIA_API_KEY`/`GROQ_API_KEY`, el Paso 3 (mini-eval) puede probar candidatos en vivo; si no, evalúa solo por model card. |
| **Qué hace** | Tres patas: (1) **deprecación** — comprueba que los modelos cableados en `packages/core-ai/src/client.ts` (NIM `llama-3.3-70b`, Groq, Gemini `2.0-flash`, Kimi) siguen vivos en su catálogo; (2) **descubrimiento** de gratis nuevos que meter en la cadena; (3) **mini-eval** de candidatos con 2 prompts fijos. Nació por el `meta/llama-3.1-405b-instruct` que NVIDIA retiró y dejó "IA no disponible" a un huésped (06/07/2026). |
| **Resultado** | Actualiza `docs/BUSCADOR-IA.md` (modelos vivos/deprecados + candidatos + bitácora). Modelo cableado muerto/deprecado o gratis nuevo mejor → **Telegram**; swap seguro (id muerto→vigente) o plumbing de proveedor nuevo → **PR draft** `claude/buscador-ia-<fecha>`. Sin novedades → sin ruido. |

### 10. Agentes-entrenador (mejora de prompts) — *activa*
| | |
|---|---|
| **Cuándo** | Semanal, **domingo ~07:30 CEST** (tras la auditoría profunda de las 04:00; los agentes de la semana ya corrieron) |
| **Prompt** | `Ejecuta la skill agentes-entrenador` + al final `PLATAFORMA_URL`/`ALERTA_TOKEN` (mismo workaround que las rutinas 6, 7 y 9) |
| **MCPs / envs** | Supabase (solo lectura). **GitHub nativo** (leer PRs de la semana + abrir los PR draft). `PLATAFORMA_URL` + `ALERTA_TOKEN` para el aviso Telegram (si faltan, se omite). |
| **Qué hace** | Mejora los prompts de los agentes programados por RENDIMIENTO: lee `docs/AGENTES-BITACORA.md` (auto-informes), `docs/FEEDBACK-AGENTES.md` (feedback de Alberto), PRs/commits de la semana y BD (`pricing_aprendizaje`, `fiscal_novedades`); diagnostica por agente y revisa calidad transversal entre skills. La frescura factual es de `/auditoria-diaria` — no se pisan. |
| **Resultado** | Cambios de **comportamiento** → **PR draft por skill** (`claude/entrenador-<skill>-<fecha>`, con evidencia→diagnóstico→cambio en el cuerpo) + **UN Telegram** con los links. Solo lo factual trivial (máx. 5) directo a `main` con línea en `docs/AUTO-APLICADOS.md`. **Nunca se auto-modifica** (a su propia skill, siempre PR). Sin evidencia → pasada silenciosa (solo poda de bitácora). |

### 13. Agente de prospección comercial — ialimp + ia-rest — *activa*
| | |
|---|---|
| **Cuándo** | L-V, **11:00 CEST** (`0 9 * * 1-5` UTC) |
| **Prompt** | Vive en la config del trigger (`claude.ai/code → Rutinas`), **no** en una skill del repo — por eso esta rutina tardó en tener ficha. Flujo: busca en Gmail (enviados + borradores) para no duplicar contactos, **envía** los emails de captación de ia-rest, **crea borradores** (sin enviar) para ialimp, y manda un resumen por Telegram. |
| **MCPs / envs** | **Gmail** (conector claude.ai — buscar histórico, enviar, crear borradores). Para el aviso: `PLATAFORMA_URL` + `ALERTA_TOKEN` en las Instrucciones de la rutina (**NUNCA** `TELEGRAM_BOT_TOKEN`/`CHAT_ID` directos — ver "Arquitectura de notificaciones Telegram"; si faltan, el resumen se omite). |
| **Qué hace** | Prospección comercial diaria de las dos verticales SaaS: ia-rest (Voice POS hostelería) en modo **envío directo**; ialimp (limpiezas) en modo **borrador para revisión**. La deduplicación se hace contra el propio Gmail (enviados/borradores), por lo que el conector Gmail es un **requisito duro**. |
| **Verificar** | El chat muestra el resumen de contactados/borradores; en Gmail aparecen los enviados de ia-rest y los borradores de ialimp del día. |

> ⚠️ **Incidente 22/07/2026 — run abortado por "faltan dos piezas de infraestructura" → RE-DIAGNOSTICADO.**
> Un run reportó dos bloqueos: (1) conector Gmail deshabilitado (`enabledInChat: false`) y (2) `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` sin definir. Verificación del 22/07 en sesión:
> - **(1) Gmail — dependiente de sesión.** `ListConnectors` dio `connected: true`, `enabledInChat: true` (Gmail SÍ disponible en la sesión del 22/07). El flag `enabledInChat` es **por-sesión**: si en el entorno de la rutina el conector no aparece adjunto/activado, hay que activarlo en la config de la rutina (mismo patrón que "adjuntar el repo").
> - **(2) Telegram — diagnóstico ERRÓNEO.** El monorepo NO usa `TELEGRAM_BOT_TOKEN`/`CHAT_ID` en las rutinas Claude (viven solo en Vercel plataforma). El resumen debe salir por `/api/internal/alerta` con `ALERTA_TOKEN` — que esta rutina **aún no lleva** en sus Instrucciones. **Pendiente:** añadir `PLATAFORMA_URL` + `ALERTA_TOKEN` como las rutinas 6/7/9 (ver "Pendientes manuales de Alberto", ítem 11).

---

### 10. Triaje de correo — *activa (CRON DE VERCEL, no rutina Claude)*
| | |
|---|---|
| **Cuándo** | `apps/plataforma` `vercel.json`: `correo-triaje` cada 10 min, `correo-digest` 20:30, `correo-resumen-semanal` lunes 09:00 |
| **Prompt** | *N/A* — no es una sesión Claude; corre como código (`lib/correo/triaje.ts`). La skill `correo-triaje` es solo el router de contexto para entenderlo/extenderlo. |
| **MCPs / envs** | Ninguno de rutina. Usa envs de Vercel plataforma: `GMAIL_USER`/`GMAIL_APP_PASSWORD` (IMAP), `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, `NVIDIA_API_KEY`, `CRON_SECRET`. Opcional `TRIAJE_DRY_RUN=true` (modo sombra). |
| **Qué hace** | Lee lo nuevo del Gmail, clasifica (reglas → OTP → IA) y actúa: ruido→`Triaje/Ruido`+archivar, contabilidad→`Triaje/Contabilidad` (buzón puente de `facturas-correo`), personal/huéspedes/leads→aviso Telegram, phishing→marcar con cautela. Huéspedes se delegan al agente SIVRA. |
| **Resultado** | Filas en `correo_triaje` (BD compartida), avisos inmediatos + digest diario + resumen semanal por Telegram. `/auditoria-diaria` vigila la frescura de `correo_triaje` y reconcilia `lib/correo/rutas.ts`. |

---

### 12. Monitorización — watchdog trading + latidos de agentes — *activa (CRONS DE VERCEL, no rutina Claude)*
| | |
|---|---|
| **Cuándo** | `apps/plataforma` `vercel.json`: `trading-watchdog` `30 6 * * 2-6` (mar-sáb 08:30 CEST), `agentes-latido` `45 7 * * *` (diario 09:45 CEST) |
| **Prompt** | *N/A* — no son sesiones Claude; corren como código (`app/api/cron/{trading-watchdog,agentes-latido}/route.ts`). |
| **MCPs / envs** | Ninguno de rutina. Auth `CRON_SECRET`; avisan por `tgSend` (bot único del monorepo). |
| **Qué hace** | `trading-watchdog` comprueba **3 tramos** de la pasada nocturna de trading: `broker_saldos` (NAV), `trading_tesis` (parte de `/analizar`) y **`/puntuar`** (stops + walk-forward, latido `trading_puntuar` — añadido PR #1291 tras un caso real donde NAV y tesis quedaron frescos pero `/puntuar` nunca se llamó y el watchdog de 2 tramos lo habría dado por bueno). Desde el 08/08/2026 (PR #1322) el propio watchdog **deja su huella** en `agente_latidos.trading_watchdog` (antes, si él mismo dejaba de correr, su silencio se leía como «los tres tramos frescos»; vigilado por `agentes-latido` con 80h de umbral). `agentes-latido` (`lib/monitoring/latidos.ts`, registro `AGENTES_VIGILADOS`) comprueba, por cada agente vigilado, una huella FIABLE en BD que SOLO se refresca cuando ese agente corre — hoy vigila **pricing** (`pricing_decisiones.ciclo_at` por piso — **cambiado desde `market_rates prop_%`** el 08/08/2026, PR #1318: esa huella dejó de ser exclusiva de la Rutina semanal cuando el barrido Serper diario y `mercado-booking` empezaron a escribir en el mismo namespace, y salía verde con la Rutina muerta; 192h), **trading_watchdog** (80h, ver arriba), **correo-triaje** (`correo_cursor.updated_at`, 6h), **facturas-scan**, **ialimp_pms**, **sivra_eventos**, **sivra_mercado_sweep**, **sivra_mercado_booking** y **sivra_pricing_guard** (30h los diarios). Nace de que el agente de pricing dejó de correr en silencio y una reserva entró un 40% bajo mercado sin que nadie se enterara. ⚠️ **Un latido mide FRESCURA, no CORRECCIÓN**, y confundirlo sale caro: el 01/08/2026 `market_rates` estaba fresquísima y aun así el ancla de House venía de comps de otro aforo — eso no lo caza un latido, lo caza el centinela #9 del guardián de precios. Al añadir un vigilante, pregúntate cuál de las dos cosas estás midiendo. |
| **Resultado** | Sin anomalías → sin ruido. Huella vieja/inexistente → Telegram con el motivo y la acción sugerida. **No duplica** con el heartbeat de `/auditoria-diaria` (paso 2-bis): coordina umbrales para no avisar dos veces por lo mismo — para añadir un agente nuevo al monitor, una fila en `AGENTES_VIGILADOS` + su probe SQL en el route. |

### 14. Seguimiento quincenal — laboratorio de inversión — *activa desde el 11/08/2026*
| | |
|---|---|
| **Cuándo** | Días **1 y 15** de cada mes, 08:00 UTC (~10:00 CEST). Trigger `trig_01FJtQFiEMVGnEj9vpdBYA3f` (sesión nueva por disparo, notificación push). Además, **one-shot** `trig_014V3ytMp9JZPwnbkEPxZRWu` el **16/11/2026** (hito: la cohorte 2026-07-18 cumple los ~4 meses del Tramo 2; push+email). |
| **Prompt** | Autocontenido en el trigger (creado por MCP desde sesión, 11/08/2026 — pedido de Alberto «ir poniendo recordatorios para ir haciendo seguimientos»). |
| **MCPs / envs** | Supabase (lectura) **si la sesión disparada lo trae**; el trigger creado por MCP **no almacena conectores** (limitación de la org), así que el prompt lleva **plan B**: leer el hero de la vista de invitado `/invitado/trading` con el token de `trading_acceso_token` (solo abre esa vista, rotable en BD — si se rota, actualizar el prompt del trigger con `update_trigger`). Para la vía completa con Supabase, recrearla desde la UI de Rutinas de claude.ai. |
| **Qué hace** | SOLO LECTURA: informe quincenal del forward paper (mediana vs SPY y tendencia, tramo alcanzable de la 🪜 escalera con cobertura, cohetes, anomalías de datos) comparado con el seguimiento anterior + veredicto honesto sobre dinero real. NO ejecuta la pasada diaria (esa es del agente `trading-analista`) ni duplica el digest del lunes (ese es el cron semanal de Vercel): esto es la revisión con perspectiva para Alberto. |
| **Resultado** | Notificación push con el resumen. Solo con cambio material (tramo, mediana cruza al SPY, cobertura <80%, datos envenenados) → entrada «📈 Seguimiento laboratorio» en memoria + PR draft. |

---

## Resumen de cadencias

> ⚠️ El **triaje de correo** NO es una rutina de Claude Code: son 3 crons de Vercel en
> `apps/plataforma` (ver punto 10). Las de abajo sí son rutinas Claude (sesión efímera).

| Día/hora | Rutina |
|---|---|
| Diaria 04:00 | Auditoría nocturna ligera |
| Días 1 y 15, ~10:00 | Seguimiento quincenal del laboratorio de inversión |
| Diaria 08:00 | Facturas correo |
| Lunes 06:00 | Pricing agente SIVRA |
| Miércoles 09:00 | Guardián PSD2 |
| Viernes 17:00 | ialimp client health |
| L-V 11:00 | Agente de prospección comercial (ialimp + ia-rest) |
| Domingo 04:00 | Auditoría semanal profunda |
| Domingo 07:30 | Agentes-entrenador (mejora de prompts) |
| Lunes 07:00 | Buscador de IA |
| Día 1 del mes 07:00 | Vigilante fiscal IRPF |
| Día 1 del mes 08:00 | RRHH compliance calendar |
| Día 15 del mes 07:00 | Vigía GitHub/OSS |
| Diaria 09:45 | Latidos de agentes (cron Vercel) |
| Mar-sáb 08:30 | Watchdog trading (cron Vercel) |

---

## Arquitectura de notificaciones Telegram

**El token de Telegram vive UNA SOLA VEZ en Vercel plataforma** (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`).
Las rutinas de Claude Code NO necesitan esas credenciales. En su lugar llaman al endpoint interno:

```
POST {PLATAFORMA_URL}/api/internal/alerta
Authorization: Bearer {ALERTA_TOKEN}
Content-Type: application/json
{ "text": "..." }
```

**Envs que necesita cada rutina que envía alertas:**
- `PLATAFORMA_URL` = `https://plataforma-ten-flame.vercel.app`
- `ALERTA_TOKEN` = token **DEDICADO** que SOLO abre `/api/internal/alerta` (crear en Vercel plataforma).
  ⚠️ **NO uses `CRON_SECRET` aquí:** es la llave maestra de todos los crons (aplica precios, etc.) y no debe
  vivir en un prompt. El endpoint acepta `CRON_SECRET` solo por compatibilidad transitoria.

### ⚠️ Workaround — la UI de Rutinas no tiene sección de env vars (jul 2026)

La UI de `claude.ai/code → Rutinas` no expone un campo de variables de entorno.
La solución es **incluir los valores directamente en el campo "Instrucciones" de cada rutina** que necesita enviar alertas.
Por eso el secreto que se ponga aquí queda **en texto plano** en la config de la rutina → precisamente por eso se
usa el token estrecho `ALERTA_TOKEN` (si se filtra, solo permite mandar un Telegram), no la llave maestra.

Edita el prompt de las rutinas que avisan (6 psd2, 7 ialimp-client-health, 9 github-vigia, 11 buscador-ia…) añadiendo al final:

```
Variables de sesión:
PLATAFORMA_URL=https://plataforma-ten-flame.vercel.app
ALERTA_TOKEN=<pegar el valor de ALERTA_TOKEN>
```

Claude lee el contexto del prompt y usa esos valores cuando llama al endpoint `/api/internal/alerta`.
Si en el futuro la UI añade env vars nativas, mover allí y limpiar el prompt.

Así si el bot cambia, solo se actualiza en Vercel plataforma — ninguna rutina hay que tocar.

---

## Notas
- **Auditoría — dos carriles de entrega:** los arreglos de **texto** (memoria/skills/docs/
  manuales) se **auto-aplican a `main`** (con guardarraíl: solo cambios acotados; lo grande va
  a revisión) y se anotan en `docs/AUTO-APLICADOS.md`. Lo **arriesgado** (código/infra/gran
  radio/crons mudos) → **PR draft + aviso Telegram** con link al PR. Sin nada → sin ruido.
- Las demás rutinas (facturas, fiscal-novedades, pricing) abren **PR draft** cuando hay cambios; sin cambios → sin PR.
- Ninguna ejecuta cortes de infra ni migraciones en producción: los dejan como acción manual.
- Estado de cada rutina ("activa"/"pendiente") refleja lo configurado en la UI — mantenlo
  al día cuando crees o quites un trigger.

## Pendientes manuales de Alberto
1. ~~Crear los 5 triggers pendientes~~ ✅ Hecho (01/07/2026) — rutinas 4-8 activas.
2. ~~Confirmar MCP Booking.com~~ ✅ Confirmado — Booking.com está disponible y configurado en pricing-agente.
3. **Añadir `ALERTA_TOKEN` al campo "Instrucciones"** de las rutinas 6 (psd2-health-check) y 7 (ialimp-client-health) para habilitar alertas Telegram (ver sección workaround arriba). `PLATAFORMA_URL` también si no está en el prompt. **NO usar `TELEGRAM_BOT_TOKEN`** (vive en Vercel plataforma) **ni `CRON_SECRET`** (llave maestra — ver pendiente #9; usa el token estrecho `ALERTA_TOKEN`).
4. **Primer ciclo de pricing-agente** (próximo lunes): revisar el PR draft con propuestas antes de aprobar. La skill impone `dryRun: true` en el primer ciclo automáticamente.
5. **Crear el trigger de la rutina 9 (github-vigia)**: mensual día 15 ~07:00, prompt `Ejecuta la skill github-vigia` + al final `PLATAFORMA_URL`/`ALERTA_TOKEN` (token estrecho, NO `CRON_SECRET` — ver pendiente #9). Al crearlo, cambiar su estado a *activa* en este doc.
6. ~~Crear el trigger de la rutina 10 (agentes-entrenador)~~ ✅ Hecho (03/07/2026) — rutina 10 activa.
7. **Crear el trigger de la rutina 11 (buscador-ia)**: semanal lunes ~07:00, prompt `Ejecuta la skill buscador-ia` + al final `PLATAFORMA_URL`/`ALERTA_TOKEN` (token estrecho, NO `CRON_SECRET` — ver pendiente #9). Opcional: añadir `NVIDIA_API_KEY`/`GROQ_API_KEY` al prompt si quieres que el mini-eval pruebe candidatos en vivo. Al crearlo, cambiar su estado a *activa* en este doc.
8. ~~Adjuntar el repo `central` a 7 rutinas que corren SIN repo~~ ✅ **NO APLICA — verificado 13/07/2026:
   las 7 rutinas YA tienen `central` adjunto** (comprobado abriendo cada una en la UI). El diagnóstico "les
   falta el repo" era erróneo; los fallos reales eran el límite de uso semanal del 8/07 (transitorio) y, en
   `ialimp`, un run antiguo sin repo ya resuelto (run manual del 13/07 OK). Ver el incidente re-diagnosticado
   bajo la rutina 7. **Pendiente real que queda:** actualizar las queries SQL desfasadas de la skill
   `ialimp-client-health` (tarea de `agentes-entrenador`).
9. 🔴 **Seguridad — el `CRON_SECRET` estaba en texto plano en prompts de rutinas (buscador-ia y, por el
   workaround, psd2/ialimp).** `CRON_SECRET` es la **llave MAESTRA** de todos los crons y llamadas
   servidor→servidor (incluye aplicar/deshacer precios de sivra) — ver `lib/secrets-registry.ts`. Tenerla en
   claro en la config de una rutina expone esa llave a cualquiera que vea el prompt.
   **Lado de código (HECHO en esta rama):** se añadió `ALERTA_TOKEN`, un token DEDICADO de bajo privilegio que
   **solo** abre `/api/internal/alerta` (el aviso Telegram). El endpoint y el middleware lo aceptan (y siguen
   aceptando `CRON_SECRET` por compat), y las skills ya piden `ALERTA_TOKEN` en vez de la llave maestra.
   **Lado de Alberto (PENDIENTE, manual):**
   - a) Crear la env `ALERTA_TOKEN` (valor nuevo, aleatorio) en el proyecto Vercel `plataforma`.
   - b) En cada rutina que avisa por Telegram (buscador-ia, psd2-health-check, ialimp-client-health y las que
     apliquen), **cambiar en el prompt** `CRON_SECRET=<maestra>` por `ALERTA_TOKEN=<nuevo>` (dejar `PLATAFORMA_URL`).
   - c) Una vez ninguna rutina lleve ya `CRON_SECRET` en el prompt, **rotar `CRON_SECRET`** (env de equipo Vercel
     + GitHub Actions secrets) para matar la copia que estuvo expuesta.
   - d) Revisar el aviso de que los conectores pueden ejecutar **operaciones de escritura sin pedir permiso**.
11. 🟡 **Rutina 13 (Agente de prospección comercial — ialimp + ia-rest) — desbloquear los 2 falsos "bloqueos de infra"** (re-diagnóstico 22/07/2026, ver incidente bajo la rutina 13):
    - a) **Telegram:** añadir al final del campo "Instrucciones" de la rutina, igual que las rutinas 6/7/9:
      `PLATAFORMA_URL=https://plataforma-ten-flame.vercel.app` y `ALERTA_TOKEN=<el mismo valor que ya funciona en la rutina de auditoría diaria>`. **NO** `TELEGRAM_BOT_TOKEN`/`CHAT_ID` (no van en rutinas Claude) **ni** `CRON_SECRET` (llave maestra — ver ítem 9). Como las rutinas 1/2 de auditoría ya alcanzan `/api/internal/alerta` sin 403, la env `ALERTA_TOKEN` ya existe en Vercel plataforma: solo hay que reusar su valor.
    - b) **Gmail:** verificar que el conector **Gmail** figura adjunto/activado en la config de la rutina (el flag `enabledInChat` es por-sesión). Es requisito duro: sin Gmail no hay deduplicación contra enviados/borradores.
    Ambas acciones son en la UI `claude.ai/code → Rutinas` (Alberto, p.ej. vía Claude Chrome). No requieren tocar código.
10. ✅ **RESUELTO (20/07/2026) — Rutinas 1 y 2 (`/auditoria-diaria` ligera + profunda) YA tienen
    `ALERTA_TOKEN`/`PLATAFORMA_URL`.** Detectado el 17/07/2026 (ninguna de las dos envs presente); esta
    misma pasada del 20/07 verificó ambas presentes en el entorno de la rutina y la red alcanzando
    `plataforma-ten-flame.vercel.app` sin el 403 (mismo arreglo que desbloqueó `trading-analista` el
    19/07 — comparten el entorno "Default"). El aviso Telegram de esta pasada ya no se omite por falta de env.

---

## Verificación de repo/fuentes de las rutinas (UI, 13/07/2026)

> ⚠️ **Corrección.** La versión anterior de esta sección (auditoría del 10/07 vía `list_triggers`) afirmaba que
> a 7 rutinas les faltaba el repo como *fuente*. **La verificación de solo lectura en la UI del 13/07/2026
> (abriendo cada rutina en `claude.ai/code → Rutinas`) demostró que es FALSO: las 7 ya tienen `central`
> adjunto.** Se conserva la tabla corregida abajo. Causa real de los fallos que se veían: límite de uso
> semanal (8/07) y un run antiguo de `ialimp` sin repo, ya resuelto (ver incidente bajo la rutina 7).

> 🔎 **Observación discrepante (misma fecha, por la noche — Alberto vía Claude Chrome):** al abrir esas 6
> rutinas en **modo edición**, el selector de repositorio mostraba "Seleccionar un repositorio" (vacío), así
> que se les adjuntó `central` explícitamente y se guardó (sin tocar prompt/horario/conectores). Las dos
> lecturas de UI se contradicen (¿vista de detalle vs modal de edición?) y no es resoluble desde el doc;
> lo que importa: **desde la noche del 13/07 las rutinas tienen `central` adjuntado y GUARDADO
> explícitamente**, y el duplicado **"pricing-agente"** (que sí carecía de repo y fardaba con "la skill no
> existe") quedó **ELIMINADO** esa misma mañana — solo queda "Agente de pricing (sivra)", lunes 07:00 CEST.
> Si alguna rutina volviera a arrancar "sin repo" pese a figurar adjunto, es un bug de plataforma a escalar.

| Rutina (trigger) | Repo `central` adjunto | Estado real (13/07/2026) |
|---|---|---|
| Auditoría diaria / semanal profunda | ✅ sí | OK |
| Revisar facturas correo | ✅ sí | OK |
| Agente de pricing (sivra) | ✅ sí | OK (últimos runs ✓, hoy 07:08) · lunes 07:00 CEST |
| agentes-entrenador | ✅ sí | OK |
| **ialimp-client-health** | ✅ **sí (re-adjuntado y guardado 13/07 noche)** | **OK** — run manual 13/07 11:36 completó en verde · viernes 17:00 CEST |
| **psd2-health-check** | ✅ **sí (re-adjuntado y guardado 13/07 noche)** | Fallos del 8/07 = **límite de uso semanal** (reset 11/07 07:00 UTC), transitorio · miércoles 09:00 CEST |
| **fiscal-novedades** | ✅ **sí (re-adjuntado y guardado 13/07 noche)** | Aún sin ejecuciones (mensual día 1, 09:00, cron `0 7 1 * *` UTC) |
| **rrhh-compliance-calendar** | ✅ **sí (re-adjuntado y guardado 13/07 noche)** | Aún sin ejecuciones (mensual día 1, 10:00, cron `0 8 1 * *` UTC); sin conectores |
| **buscador-ia** | ✅ **sí (re-adjuntado y guardado 13/07 noche)** | OK (run hoy 07:07 + manual 07:37); 18 conectores activos · lunes 07:00 CEST |
| **Agente de prospección comercial — ialimp + ia-rest** | ✅ **sí (re-adjuntado y guardado 13/07 noche)** | OK; los 4 fallos del 8/07 = mismo límite de uso semanal · L-V 11:00 CEST |
| ~~**pricing-agente**~~ (duplicado) | — | ✅ **ELIMINADO 13/07/2026** por Alberto vía Claude Chrome (fardaba con "la skill no existe") |

Notas de deriva detectadas de paso:
- ~~🔴 **Seguridad:** el prompt de **buscador-ia** lleva el `CRON_SECRET` como literal en texto plano~~
  → 🟢 **RESUELTO (verificado 27/07/2026)** leyendo el prompt real del trigger por la API de Routines:
  hoy solo trae `PLATAFORMA_URL` y `ALERTA_TOKEN` (el token estrecho, que es lo correcto). El pendiente #9
  queda cerrado en su parte de `CRON_SECRET`.
  ⚠️ **Pero ese `ALERTA_TOKEN` va INCRUSTADO EN EL PROMPT**, no en las variables del entorno como el resto
  de rutinas. Consecuencia práctica: cuando se rote el token, `buscador-ia` **no se arregla tocando su
  entorno** — hay que editar su prompt. Detalle y huella de verificación en `docs/AVISOS-AGENTES.md`.
- **buscador-ia YA tiene trigger** (lunes `0 5 * * 1`) aunque este doc lo daba por "pendiente" — estado corregido.
- ~~**"Agente de prospección comercial — ialimp + ia-rest"** (L-V `0 9 * * 1-5`) sigue sin ficha propia en este doc.~~ ✅ **Ficha creada (22/07/2026) — ver rutina 13 arriba**, con el re-diagnóstico del incidente "faltan dos piezas de infraestructura".
- ~~Posible **pricing duplicado**~~: existían `pricing-agente` y `Agente de pricing (sivra)`. **Resuelto
  13/07/2026**: el duplicado se eliminó (Alberto vía Claude Chrome). Solo queda "Agente de pricing (sivra)",
  lunes 07:00 CEST.
- **Lección para futuros triggers:** adjuntar SIEMPRE el repo `central` como fuente al crearlos — pero, verificado
  esto, el patrón de fallo "la skill no existe" en las rutinas de este doc **no** venía de ahí.

---

## trading-analista (IBKR, paper) — trigger CREADO y corriendo de punta a punta (actualizado 20/07/2026)

Agente de inversión asistida (Fase 1 técnica cerrada, Fase B por SELECCIÓN en marcha — SOLO paper
trading, cero ejecución real). Skill: `.claude/skills/trading-analista/SKILL.md`. Compone el paquete
puro `@central/module-trading` + los endpoints `apps/plataforma/app/api/trading/**` (creció mucho más
allá de `analizar`/`puntuar`: `factores`, `gurus`, `fundamentales`, `insiders`, `seleccion`,
`validar-oos`, `paper`, `saldo`, `descubrir`, `screener`, `fmp`).

- **Cadencia propuesta:** diaria ~22:15 hora Sevilla (tras cierre del mercado US). Cron sugerido `15 20 * * 1-5` (UTC; ajustar a CE(S)T).
- **Disparo:** trigger Claude web (ya EXISTE y corre — no es solo una propuesta). **Requiere** el MCP de
  **Interactive Brokers ENCENDIDO en la sesión** del agente (FMP opcional).
- **Envs:** `PLATAFORMA_URL` + **`ALERTA_TOKEN`** (token dedicado de bajo privilegio; los endpoints
  `/api/trading/*` lo aceptan vía `isRoutineAuthorized`). Se usa en vez de `CRON_SECRET` **a propósito**:
  el campo de variables del entorno de la rutina de Claude Code es texto plano visible, así que NO se mete
  ahí el secreto maestro — solo el token de bajo privilegio (si se filtra: empujar un saldo o disparar una
  pasada paper, nunca dinero real). `CRON_SECRET` sigue valiendo por compat. Por env, NUNCA literal en el prompt.
- **Prerrequisitos — YA CUMPLIDOS (verificado 19/07 vía Supabase MCP):** (1) `trading_fase1.sql` aplicada
  (tablas `trading_*`/`broker_saldos` existen y tienen datos); (2) watchlist sembrada (`trading_watchlist`,
  13 filas); (3) dry-run manual hecho repetidas veces en sesión (verificaciones en vivo del 18/07).
- **✅ RESUELTO (19/07/2026) — ambos bloqueadores de infra.** (a) egress 403 en el túnel CONNECT hacia
  `plataforma-ten-flame.vercel.app` → arreglado en el entorno "Default" de la rutina (Network access
  Trusted → Custom, dominio en Allowed domains). (b) `ALERTA_TOKEN` desincronizado entre el entorno de la
  rutina y el proyecto Vercel `plataforma` → rotado (mismo valor en ambos) + redeploy de plataforma.
  ⚠️ **Ese arreglo (b) valió SOLO para el entorno "Default"** — hay un entorno de Claude Code POR RUTINA y
  nadie recorrió los demás: `agentes-entrenador` (26/07) y `buscador-ia` (27/07) siguieron dando 401 contra
  el mismo despliegue en el que la rutina de pricing sí avisaba. Protocolo completo de resincronización y
  degradación en **`docs/AVISOS-AGENTES.md`**.
  **Verificado end-to-end:** `POST /api/trading/saldo` → 200, `broker_saldos.actualizado_en` refrescado
  (19/07 14:08 UTC, NAV €33.658,82); la pasada nocturna de trading corrió completa por primera vez.
  Detalle en `docs/CONTEXTO-SESIONES.md` (entrada 19/07/2026, "RESUELTO el bloqueo de red+auth").
- **Estado:** el 20/07/2026 esta misma auditoría verificó `PLATAFORMA_URL`/`ALERTA_TOKEN` presentes y la
  red alcanzando `plataforma-ten-flame.vercel.app` (sin 403) también en el entorno de `/auditoria-diaria`
  (comparte el mismo arreglo). Con la pasada de punta a punta confirmada, `lib/agentes-catalogo.ts` pasa
  de `pendiente-trigger` a `activo` (carril 2, PR draft — es código).
- **🩹 Incidente 14/08/2026 — el trigger disparó pero la sesión murió sin arrancar (pasada perdida):**
  `last_fired_at` 20:15:38Z y CERO huella (ni saldo, ni Telegram, ni bitácora). No fue la config: entorno
  activo, mismas credenciales, y otras rutinas corrieron bien esa madrugada — fallo transitorio de
  arranque del lado de la plataforma de Claude. El watchdog lo cazó a las 06:30 y la pasada se recuperó
  a mano la mañana del sábado con los cierres del viernes (`fecha`/`hoy` = 2026-08-14; procedimiento
  completo en la skill, `references/infra-forward-radar.md` → «Recuperar una pasada que NO llegó a
  arrancar»). Verificado después: 3 huellas frescas, `trading_pasadas[14/08]=1`, 48 tesis puntuadas.
  **Limitación descubierta:** las Rutinas creadas desde la UI de claude.ai NO se pueden disparar ni
  editar por MCP (`fire_trigger`/`update_trigger` las rechazan: «created via http_api»), y las creadas
  por MCP no almacenan conectores en esta org → **el reintento automático solo puede montarlo Alberto
  desde la UI de Rutinas** editando ESTA rutina (sigue siendo UNA sola):
  1. Programación → cron `15 20,23 * * 1-5` (dispara a las 20:15 y a las 23:15 UTC).
  2. Añadir al PRINCIPIO del prompt el PASO 0 de huella: comprobar por Supabase
     `broker_saldos.actualizado_en` (< 6 h) Y `trading_pasadas` de hoy con `analizar >= 1` → si ambas,
     TERMINAR EN SILENCIO (la de las 20:15 ya corrió); si no hay huella, ejecutar la pasada completa y
     decir en el Telegram que es el reintento; si Supabase no responde a las 23:15, avisar y NO ejecutar
     a ciegas (riesgo de doble pasada).
  **PENDIENTE de Alberto (propuesto 15/08/2026).** El anti-duplicado de datos ya existe de serie
  (`trading_pasadas` cuenta y avisa a la 2ª pasada; únicos por `(simbolo,fecha,estrategia)`), así que el
  coste de un fallo del PASO 0 es un aviso, no datos corruptos.
