# Rutinas programadas — `central`

> Sesiones de Claude Code que corren **solas** en la nube ("cowork") disparadas por un
> trigger. Los triggers se crean en **`claude.ai/code → Rutinas`** (UI), **no** en el repo:
> este doc es la fuente única de qué hay configurado, cuándo y con qué.
>
> El contenedor es efímero: una rutina NO puede leer las conversaciones de otras sesiones.
> Reconcilia lo que quedó **commiteado** (memoria/skills/docs) contra el código e infra reales.

## Cómo se crea un trigger (1 vez, manual de Alberto)
1. Entra en `claude.ai/code` → **Rutinas** → **Nueva rutina**.
2. Repo: `central`. Rama: la que prefieras (la rutina abre su propio PR draft).
3. Define horario, prompt y MCPs según la tabla de abajo.
4. Guarda. A partir de ahí corre sola; revisa el PR draft que deje.

---

## Rutinas

### 1. Auditoría nocturna ligera — *activa*
| | |
|---|---|
| **Cuándo** | Diaria, ~**04:00 CEST** |
| **Prompt** | `Ejecuta /auditoria-diaria` |
| **MCPs / envs** | Supabase + Vercel (lectura). **GitHub es nativo** al vincular el repo — ya cubre lectura + abrir el PR + push a `main`. Para el aviso, `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` en la env de la rutina (si faltan, el aviso se omite). |
| **Qué hace** | Reconcilia `CONTEXTO-SESIONES.md` + skills-maestro + `CLAUDE.md` + `docs/SKILLS.md` contra el código real + checks baratos (lockfile, estructura, drift) + **heartbeat de crons** (paso 2-bis: detecta crons mudos por falta de filas frescas en BD). SALTA typecheck/tests pesados. |
| **Resultado (dos carriles)** | **Carril 1:** los arreglos de **texto** (memoria/skills/docs/manuales) se **auto-aplican a `main`** (sin PR) y se anotan en `docs/AUTO-APLICADOS.md`. **Carril 2:** lo "raro" (código, infra, crons mudos, gran radio) → **PR draft** `claude/auditoria-diaria-<fecha>` + **aviso Telegram** con botón-URL al PR. **Sin nada** → sin push, sin PR, sin aviso. |

Es la **red de seguridad** del guardián de cierre (`.claude/hooks/persist-memoria.sh`):
caza lo que las sesiones del día no anotaron a mano.

### 2. Auditoría semanal profunda — *activa*
| | |
|---|---|
| **Cuándo** | Semanal (domingos, ~**04:00 CEST**) |
| **Prompt** | `Ejecuta /auditoria-diaria --profunda` |
| **MCPs / envs** | Supabase + Vercel. **GitHub nativo**. `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` para el aviso y el **heartbeat semanal**. |
| **Qué hace** | `auditoria-central` ENTERA: typecheck de las 4 apps + tests + seguridad multi-tenant + infra por MCP + coherencia de docs. |
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

> ⚠️ **Incidente 10/07/2026 — "la skill ialimp-client-health no existe en este entorno" (causa raíz confirmada).**
> Esta rutina fardó el 10/07 a las 17:06 y falló: la sesión arrancó en un `/home/user` **sin el repo
> `central` clonado**, así que no vio la skill (que vive en `.claude/skills/` del repo). El diagnóstico
> inicial ("apunta al proyecto equivocado") era **incorrecto**: al inspeccionar los triggers reales
> (`list_triggers`), la rutina apunta al **mismo entorno y repo `central` que las que sí funcionan**. La
> diferencia real: su trigger **NO lleva el repositorio adjunto como *fuente*** — su `session_context`
> solo tiene `allowed_tools`, sin el campo `sources: [git_repository central]` que sí tienen
> `facturas-correo`, `auditoría` o `pricing (sivra)`. Sin fuente git, la sesión no clona el repo y
> **ninguna skill del repo está disponible** (por eso el commit de la skill a `main` no lo arregla). **Fix:**
> en `claude.ai/code → Rutinas`, editar el trigger y **seleccionar Repo = `central`** (adjuntar la fuente
> git). **Afecta a 7 rutinas** creadas sin repo adjunto — ver "Rutinas con el repo SIN adjuntar" abajo.


### 8. RRHH compliance calendar — *activa*
| | |
|---|---|
| **Cuándo** | Mensual, **día 1 ~08:00 CEST** (1h después de fiscal-novedades) |
| **Prompt** | `Ejecuta la skill rrhh-compliance-calendar` |
| **MCPs** | Ninguno |
| **Qué hace** | Lee `docs/ROADMAP-rrhh.md`, filtra ítems 🔴 obligatorios no completados y genera un informe de plazos legales (RD 8/2019 fichaje, RGPD art.28, canal denuncias, etc.). Mantiene visibilidad sobre obligaciones con riesgo de multa. |
| **Verificar** | El chat muestra el informe de compliance con la lista de ítems 🔴 pendientes. |

### 9. Vigía GitHub/OSS — *pendiente de trigger*
| | |
|---|---|
| **Cuándo** | Mensual, **día 15 ~07:00 CEST** |
| **Prompt** | `Ejecuta la skill github-vigia` (+ `PLATAFORMA_URL`/`CRON_SECRET` en instrucciones para el aviso, como psd2) |
| **MCPs / envs** | Ninguno externo — WebFetch + WebSearch (nativas) para repos externos (el MCP de GitHub va scopeado a `central`) y Bash para `pnpm outdated`/`audit`. `PLATAFORMA_URL` + `CRON_SECRET` para el aviso Telegram (si faltan, se omite). |
| **Qué hace** | Tres patas: (1) releases de la lista curada en `docs/VIGIA-OSS.md` (VROOM, OSRM, openrouteservice, Leaflet, Traccar, web-push…), (2) descubrimiento de herramientas nuevas por vertical juzgadas contra los pendientes reales, (3) npm outdated + CVEs filtrados a producción. Vigila hacia FUERA (la auditoría vigila hacia dentro). |
| **Resultado** | Actualiza `docs/VIGIA-OSS.md` (versiones vistas + bitácora). Algo que merece ojo → **Telegram**; bump pequeño y seguro → **PR draft** `claude/github-vigia-<fecha>`. Sin novedades → sin ruido. |

### 11. Buscador de IA (LLMs gratis) — *pendiente de trigger*
| | |
|---|---|
| **Cuándo** | Semanal, **lunes ~07:00 CEST** (después del pricing-agente de las 06:00) |
| **Prompt** | `Ejecuta la skill buscador-ia` (+ `PLATAFORMA_URL`/`CRON_SECRET` en instrucciones para el aviso, como psd2/github-vigia) |
| **MCPs / envs** | Ninguno externo — WebFetch + WebSearch (nativas) para los catálogos de proveedores. `PLATAFORMA_URL` + `CRON_SECRET` para el aviso Telegram (si faltan, se omite). Opcional: si el prompt incluye `NVIDIA_API_KEY`/`GROQ_API_KEY`, el Paso 3 (mini-eval) puede probar candidatos en vivo; si no, evalúa solo por model card. |
| **Qué hace** | Tres patas: (1) **deprecación** — comprueba que los modelos cableados en `packages/core-ai/src/client.ts` (NIM `llama-3.3-70b`, Groq, Gemini `2.0-flash`, Kimi) siguen vivos en su catálogo; (2) **descubrimiento** de gratis nuevos que meter en la cadena; (3) **mini-eval** de candidatos con 2 prompts fijos. Nació por el `meta/llama-3.1-405b-instruct` que NVIDIA retiró y dejó "IA no disponible" a un huésped (06/07/2026). |
| **Resultado** | Actualiza `docs/BUSCADOR-IA.md` (modelos vivos/deprecados + candidatos + bitácora). Modelo cableado muerto/deprecado o gratis nuevo mejor → **Telegram**; swap seguro (id muerto→vigente) o plumbing de proveedor nuevo → **PR draft** `claude/buscador-ia-<fecha>`. Sin novedades → sin ruido. |

### 10. Agentes-entrenador (mejora de prompts) — *activa*
| | |
|---|---|
| **Cuándo** | Semanal, **domingo ~07:30 CEST** (tras la auditoría profunda de las 04:00; los agentes de la semana ya corrieron) |
| **Prompt** | `Ejecuta la skill agentes-entrenador` + al final `PLATAFORMA_URL`/`CRON_SECRET` (mismo workaround que las rutinas 6, 7 y 9) |
| **MCPs / envs** | Supabase (solo lectura). **GitHub nativo** (leer PRs de la semana + abrir los PR draft). `PLATAFORMA_URL` + `CRON_SECRET` para el aviso Telegram (si faltan, se omite). |
| **Qué hace** | Mejora los prompts de los agentes programados por RENDIMIENTO: lee `docs/AGENTES-BITACORA.md` (auto-informes), `docs/FEEDBACK-AGENTES.md` (feedback de Alberto), PRs/commits de la semana y BD (`pricing_aprendizaje`, `fiscal_novedades`); diagnostica por agente y revisa calidad transversal entre skills. La frescura factual es de `/auditoria-diaria` — no se pisan. |
| **Resultado** | Cambios de **comportamiento** → **PR draft por skill** (`claude/entrenador-<skill>-<fecha>`, con evidencia→diagnóstico→cambio en el cuerpo) + **UN Telegram** con los links. Solo lo factual trivial (máx. 5) directo a `main` con línea en `docs/AUTO-APLICADOS.md`. **Nunca se auto-modifica** (a su propia skill, siempre PR). Sin evidencia → pasada silenciosa (solo poda de bitácora). |

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

## Resumen de cadencias

> ⚠️ El **triaje de correo** NO es una rutina de Claude Code: son 3 crons de Vercel en
> `apps/plataforma` (ver punto 10). Las de abajo sí son rutinas Claude (sesión efímera).

| Día/hora | Rutina |
|---|---|
| Diaria 04:00 | Auditoría nocturna ligera |
| Diaria 08:00 | Facturas correo |
| Lunes 06:00 | Pricing agente SIVRA |
| Miércoles 09:00 | Guardián PSD2 |
| Viernes 17:00 | ialimp client health |
| Domingo 04:00 | Auditoría semanal profunda |
| Domingo 07:30 | Agentes-entrenador (mejora de prompts) |
| Lunes 07:00 | Buscador de IA |
| Día 1 del mes 07:00 | Vigilante fiscal IRPF |
| Día 1 del mes 08:00 | RRHH compliance calendar |
| Día 15 del mes 07:00 | Vigía GitHub/OSS |

---

## Arquitectura de notificaciones Telegram

**El token de Telegram vive UNA SOLA VEZ en Vercel plataforma** (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`).
Las rutinas de Claude Code NO necesitan esas credenciales. En su lugar llaman al endpoint interno:

```
POST {PLATAFORMA_URL}/api/internal/alerta
Authorization: Bearer {CRON_SECRET}
Content-Type: application/json
{ "text": "..." }
```

**Envs que necesita cada rutina que envía alertas:**
- `PLATAFORMA_URL` = `https://plataforma-ten-flame.vercel.app`
- `CRON_SECRET` = el mismo secret que usan los crons de Vercel (ya existe en el proyecto plataforma)

### ⚠️ Workaround — la UI de Rutinas no tiene sección de env vars (jul 2026)

La UI de `claude.ai/code → Rutinas` no expone un campo de variables de entorno.
La solución es **incluir los valores directamente en el campo "Instrucciones" de cada rutina** que necesita enviar alertas.

Edita el prompt de las rutinas 6 (psd2) y 7 (ialimp-client-health) añadiendo al final:

```
Variables de sesión:
PLATAFORMA_URL=https://plataforma-ten-flame.vercel.app
CRON_SECRET=<pegar el valor del secret>
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
3. **Añadir `CRON_SECRET` al campo "Instrucciones"** de las rutinas 6 (psd2-health-check) y 7 (ialimp-client-health) para habilitar alertas Telegram (ver sección workaround arriba). `PLATAFORMA_URL` también si no está en el prompt. **NO usar `TELEGRAM_BOT_TOKEN`** — el token vive en Vercel plataforma.
4. **Primer ciclo de pricing-agente** (próximo lunes): revisar el PR draft con propuestas antes de aprobar. La skill impone `dryRun: true` en el primer ciclo automáticamente.
5. **Crear el trigger de la rutina 9 (github-vigia)**: mensual día 15 ~07:00, prompt `Ejecuta la skill github-vigia` + al final `PLATAFORMA_URL`/`CRON_SECRET` (mismo workaround que las rutinas 6 y 7). Al crearlo, cambiar su estado a *activa* en este doc.
6. ~~Crear el trigger de la rutina 10 (agentes-entrenador)~~ ✅ Hecho (03/07/2026) — rutina 10 activa.
7. **Crear el trigger de la rutina 11 (buscador-ia)**: semanal lunes ~07:00, prompt `Ejecuta la skill buscador-ia` + al final `PLATAFORMA_URL`/`CRON_SECRET` (mismo workaround que las rutinas 6, 7 y 9). Opcional: añadir `NVIDIA_API_KEY`/`GROQ_API_KEY` al prompt si quieres que el mini-eval pruebe candidatos en vivo. Al crearlo, cambiar su estado a *activa* en este doc.
8. 🔴 **Adjuntar el repo `central` a 7 rutinas que corren SIN repo** (causa del fallo del 10/07 — ver el
   incidente bajo la rutina 7 y la tabla "Rutinas con el repo SIN adjuntar" abajo). En
   `claude.ai/code → Rutinas`, edita cada una y **selecciona Repo = `central`**. Sin eso arrancan en un
   `/home/user` vacío y no encuentran su skill. Prioriza `ialimp-client-health` y `psd2-health-check` (ya
   están fardando y fallando en silencio). Tras editar cada una, dispara una ejecución manual para confirmar.

---

## Rutinas con el repo SIN adjuntar (auditoría de triggers, 10/07/2026 — ✅ RESUELTO 13/07/2026)

Inspección de los triggers reales (`list_triggers`). **Todas apuntan al mismo entorno**
(`env_01HffTNZV1WPeqvjfxJYoPMs`); lo que fallaba es que a 7 les faltaba el **repositorio como fuente**
(`session_context.sources`). Sin fuente git la sesión no clona el repo y no ve `.claude/skills/` →
"la skill no existe". **Saneado el 13/07/2026** (Alberto vía Claude Chrome): el duplicado de pricing se
ELIMINÓ y a las otras 6 se les ADJUNTÓ `albertosuarezgutierrez-gif/central` (sin tocar prompt/horario/
conectores). Estado final verificado en la UI:

| Rutina (trigger) | Repo adjunto | Programación (verificada 13/07) |
|---|---|---|
| Auditoría diaria / semanal profunda | ✅ sí | OK |
| Revisar facturas correo | ✅ sí | OK |
| Agente de pricing (sivra) | ✅ sí | lunes 07:00 CEST |
| agentes-entrenador | ✅ sí | OK |
| ialimp-client-health | ✅ **adjuntado 13/07** | viernes 17:00 CEST |
| psd2-health-check | ✅ **adjuntado 13/07** | miércoles 09:00 CEST |
| ~~**pricing-agente**~~ (duplicado de "Agente de pricing (sivra)") | — | ✅ **ELIMINADO 13/07/2026** (Alberto vía Claude Chrome; se verificó antes que NO tenía repo y la buena sí). Solo queda "Agente de pricing (sivra)", lunes 07:00 CEST. |
| fiscal-novedades | ✅ **adjuntado 13/07** | día 1 del mes, 09:00 (cron `0 7 1 * *` UTC) |
| rrhh-compliance-calendar | ✅ **adjuntado 13/07** | día 1 del mes, 10:00 (cron `0 8 1 * *` UTC) |
| buscador-ia | ✅ **adjuntado 13/07** | lunes 07:00 CEST |
| Agente de prospección comercial — ialimp + ia-rest | ✅ **adjuntado 13/07** | L-V 11:00 CEST (sigue SIN documentar en este doc) |

Notas de deriva detectadas de paso:
- **buscador-ia YA tiene trigger** (lunes `0 5 * * 1`) aunque este doc lo marcaba "pendiente" — corregir su estado.
  Además su `CRON_SECRET` en el prompt es aún el literal `<PEGA_AQUÍ_EL_VALOR>` (placeholder sin rellenar).
- **"Agente de prospección comercial — ialimp + ia-rest"** (L-V `0 9 * * 1-5`) no está documentada aquí.
- ~~Posible **pricing duplicado**~~: existían `pricing-agente` (sin repo) y `Agente de pricing (sivra)` (con
  repo). **Resuelto 13/07/2026**: el duplicado sin repo se eliminó (fardaba con "la skill no existe" — sin
  fuente git la sesión no clona el repo y no ve `.claude/skills/`). Lección para futuros triggers: adjuntar
  SIEMPRE el repo `central` como fuente al crearlos.
