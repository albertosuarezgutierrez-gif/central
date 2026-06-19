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
| **MCPs** | Supabase + Vercel (lectura). **GitHub es nativo** al vincular el repo — no es un conector aparte; ya cubre lectura + abrir el PR. |
| **Qué hace** | Reconcilia `CONTEXTO-SESIONES.md` + skills-maestro + `CLAUDE.md` + `docs/SKILLS.md` contra el código real + checks baratos (lockfile, estructura, drift). SALTA typecheck/tests pesados. |
| **Resultado** | PR draft `claude/auditoria-diaria-<fecha>`, o **nada** si no hubo cambios. |

Es la **red de seguridad** del guardián de cierre (`.claude/hooks/persist-memoria.sh`):
caza lo que las sesiones del día no anotaron a mano.

### 2. Auditoría semanal profunda — *activa*
| | |
|---|---|
| **Cuándo** | Semanal (domingos, ~**04:00 CEST**) |
| **Prompt** | `Ejecuta /auditoria-diaria --profunda` |
| **MCPs** | Supabase + Vercel. **GitHub nativo** (al vincular el repo, no es un conector aparte). |
| **Qué hace** | `auditoria-central` ENTERA: typecheck de las 4 apps + tests + seguridad multi-tenant + infra por MCP + coherencia de docs. |
| **Resultado** | PR draft con informe `docs/AUDITORIA-<YYYY-MM>.md` por severidad + acciones manuales. |

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
- Las rutinas abren **PR draft**; sin cambios → sin PR (frugal con el ruido).
- No ejecutan cortes de infra ni migraciones en producción: los dejan como acción manual.
- Estado de cada rutina ("activa"/"pendiente") refleja lo configurado en la UI — mantenlo
  al día cuando crees o quites un trigger.
