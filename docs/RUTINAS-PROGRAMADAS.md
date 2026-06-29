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

### 4. Pricing agente (SIVRA) — *opcional, pendiente*
| | |
|---|---|
| **Cuándo** | A definir (recurrente) |
| **Prompt** | `Ejecuta la skill pricing-agente` |
| **MCPs** | Booking + Tripadvisor + Trivago (+ Supabase) |
| **Qué hace** | Estudia el mercado y aplica precios por los raíles del Paso 4. El motor in-app sigue solo sin esta rutina (plan B). |

### 5. Vigilante de novedades fiscales (IRPF) — *pendiente de trigger*
| | |
|---|---|
| **Cuándo** | ~**Mensual** (y antes de la campaña de renta, abril) |
| **Prompt** | `Ejecuta la skill fiscal-novedades` |
| **MCPs** | WebFetch/WebSearch (BOE/BOJA/AEAT) + Supabase. **GitHub nativo** (abre el PR). |
| **Qué hace** | Contrasta `IMPORTES_POR_ANIO` de `/finanzas` con BOE (estatal) + BOJA (Andalucía). Si una deducción/mínimo cambia: actualiza la constante por PR draft e inserta en `fiscal_novedades` (`beneficia` = subió) → la app avisa en pantalla. Sin cambios → sin PR. |

---

## Notas
- **Auditoría — dos carriles de entrega:** los arreglos de **texto** (memoria/skills/docs/
  manuales) se **auto-aplican a `main`** (con guardarraíl: solo cambios acotados; lo grande va
  a revisión) y se anotan en `docs/AUTO-APLICADOS.md`. Lo **arriesgado** (código/infra/gran
  radio/crons mudos) → **PR draft + aviso Telegram** con link al PR. Sin nada → sin ruido.
- Las demás rutinas (facturas, fiscal-novedades, pricing) abren **PR draft**; sin cambios → sin PR.
- Ninguna ejecuta cortes de infra ni migraciones en producción: los dejan como acción manual.
- Estado de cada rutina ("activa"/"pendiente") refleja lo configurado en la UI — mantenlo
  al día cuando crees o quites un trigger.
- **Acción manual pendiente de Alberto:** añadir `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` a la
  env de la rutina de auditoría (en `claude.ai/code → Rutinas`) para que el aviso/heartbeat
  funcionen. Sin ellos la auditoría sigue corriendo, pero no avisa por Telegram.
