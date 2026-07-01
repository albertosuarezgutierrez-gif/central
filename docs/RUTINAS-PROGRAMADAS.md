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
| **Cuándo** | Semanal, **lunes ~06:00 CEST** |
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

### 8. RRHH compliance calendar — *activa*
| | |
|---|---|
| **Cuándo** | Mensual, **día 1 ~08:00 CEST** (1h después de fiscal-novedades) |
| **Prompt** | `Ejecuta la skill rrhh-compliance-calendar` |
| **MCPs** | Ninguno |
| **Qué hace** | Lee `docs/ROADMAP-rrhh.md`, filtra ítems 🔴 obligatorios no completados y genera un informe de plazos legales (RD 8/2019 fichaje, RGPD art.28, canal denuncias, etc.). Mantiene visibilidad sobre obligaciones con riesgo de multa. |
| **Verificar** | El chat muestra el informe de compliance con la lista de ítems 🔴 pendientes. |

---

## Resumen de cadencias

| Día/hora | Rutina |
|---|---|
| Diaria 04:00 | Auditoría nocturna ligera |
| Diaria 08:00 | Facturas correo |
| Lunes 06:00 | Pricing agente SIVRA |
| Miércoles 09:00 | Guardián PSD2 |
| Viernes 17:00 | ialimp client health |
| Domingo 04:00 | Auditoría semanal profunda |
| Día 1 del mes 07:00 | Vigilante fiscal IRPF |
| Día 1 del mes 08:00 | RRHH compliance calendar |

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
