# Coordinador patrimonial — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Base patrimonial en BD + vista `/patrimonio` + skills de los agentes `radar-espana` (quincenal) y `patrimonio-cfo` (mensual) con sus altas en los registros.

**Architecture:** Tablas nuevas `patrimonio_activos` / `patrimonio_valoraciones` / `patrimonio_recomendaciones` en la Supabase compartida (raw SQL, REVOKE anon/authenticated, por `cuenta_id`); lectura vía `lib/patrimonio.ts` (prisma `$queryRaw`) con la lógica de titulares en helper puro testeado; página server-side en el grupo `(usuario)` de plataforma; los agentes son SKILL.md siguiendo el patrón de agente programado (dos carriles, bitácora, preflight alerta). Spec: `docs/superpowers/specs/2026-08-22-patrimonio-cfo-design.md`.

**Tech Stack:** Next.js 15 (plataforma), Prisma raw SQL, `node --test` para los helpers puros, Supabase MCP para aplicar la migración.

---

### Task 1: Migración SQL + seed

**Files:**
- Create: `apps/plataforma/prisma/sql/2026-08-22_patrimonio.sql`

- [ ] **Step 1: Escribir la migración** — 3 tablas (`patrimonio_activos`, `patrimonio_valoraciones`, `patrimonio_recomendaciones`), índices por `cuenta_id`, REVOKE anon/authenticated (tablas + secuencias). Columnas NULL-ables a propósito (NULL = «no se sabe»). El SQL completo vive en el fichero de la migración (fuente única, no se duplica aquí).
- [ ] **Step 2: Aplicar por Supabase MCP** (`apply_migration`, proyecto `wswbehlcuxqxyinousql`).
- [ ] **Step 3: Seed** — resolver el `cuenta_id` real de Alberto en `cuentas` (excluir seed-demo), insertar 5 inmuebles (4 pisos con `property_id` de `properties` + Monte Carmelo 68). Dúplex completo desde `docs/FISCAL-venta-duplex-villasis.md`; Socorro con valor de compra 360.000€ fuente `alberto` (orientativo); Bustos = `tenencia='alquilado'`. Valoración inicial del Dúplex: 320.000€ enfoque `vut` fuente `alberto` (plan de venta) — el radar escribirá las suyas.
- [ ] **Step 4: Verificar** — `SELECT` de control: 5 activos, ≥2 valoraciones, ningún NULL colapsado a 0.
- [ ] **Step 5: Commit** del `.sql`.

### Task 2: Helper puro + lib de datos + tests

**Files:**
- Create: `apps/plataforma/lib/patrimonio-resumen.ts` (PURO, sin `@/` ni prisma)
- Create: `apps/plataforma/lib/patrimonio-resumen.test.ts`
- Create: `apps/plataforma/lib/patrimonio.ts` (acceso BD)

- [ ] **Step 1: Test del helper puro primero** (`node --test`): `resumenPatrimonio(activos, liquidez, broker)` devuelve `{ neto, parcial, faltan[] }` — con una valoración NULL el activo cuenta como «pendiente» (no 0) y `parcial=true` con su motivo en `faltan`; hipoteca `capital_pendiente` NULL ⇒ pasivo desconocido declarado; activo `tenencia='alquilado'` no suma valor (no es propiedad). Estados por activo: `estadoActivo()` → `'valorado' | 'pendiente_valoracion' | 'no_aplica'`.
- [ ] **Step 2: Ejecutar el test y verlo fallar** (`node --test apps/plataforma/lib/patrimonio-resumen.test.ts`).
- [ ] **Step 3: Implementar `patrimonio-resumen.ts`** hasta verde.
- [ ] **Step 4: `lib/patrimonio.ts`**: `getActivos(cuentaId)` (activos + valoración vigente por enfoque vía `DISTINCT ON`), `getIntake(cuentaId)` (lista de NULLs importantes → preguntas), `getPatrimonio(cuentaId)` (compone con `getSaldoConsolidado` de `lib/banca.ts` y `getBrokerSaldos` de `lib/broker.ts` + el helper puro).
- [ ] **Step 5: Commit.**

### Task 3: Página `/patrimonio` + sidebar

**Files:**
- Create: `apps/plataforma/app/(usuario)/patrimonio/page.tsx` (server component)
- Modify: `apps/plataforma/app/(usuario)/UserSidebar.tsx` (entrada «🏛️ Patrimonio» en Mi negocio)

- [ ] **Step 1: Página** — cabecera con neto (`eur()`) + aviso «parcial» SIEMPRE que falten datos; tabla de activos responsive (cards apiladas en móvil) con tri-estado por celda; bloque «❓ Datos que faltan» (intake); bloque valoraciones con fuente y fecha. Sin client JS (lectura pura), tokens `var(--*)`.
- [ ] **Step 2: Sidebar** — enlace tras Finanzas.
- [ ] **Step 3: Verificar** — `npx tsc --noEmit` en apps/plataforma y `node --test` de los libs tocados.
- [ ] **Step 4: Commit.**

### Task 4: Skills de los agentes + docs de estado

**Files:**
- Create: `.claude/skills/radar-espana/SKILL.md`
- Create: `.claude/skills/patrimonio-cfo/SKILL.md`
- Create: `docs/RADAR-ESPANA.md` (estado inicial + termómetro vacío con «sin medir»)
- Create: `docs/PATRIMONIO-CFO.md` (estado + hueco del primer informe)

- [ ] **Step 1: `radar-espana`** — pasos: leer estado → coyuntura (WebSearch/WebFetch, citar URLs) → termómetro por zona (señales medibles; «sin datos» explícito) → valoración dual por inmueble (mercado_zonas × m² + comparables + histórico `incomes`; INSERT en `patrimonio_valoraciones` con `fuente='agente:<método>'`, NUNCA pisar filas) → riesgo VUT → dos carriles + bitácora + preflight alerta. Description ≤350 chars.
- [ ] **Step 2: `patrimonio-cfo`** — pasos: recopilar (BD + bitácora + RADAR-ESPANA + docs) → foto neto → coste de oportunidad por activo → escenarios con impuestos (plantilla Dúplex; puente subastas si hay recompra) → intake/preguntas → memoria de decisiones (`patrimonio_recomendaciones`) → alertas de ventana (720 a 50k€…) → informe Telegram + doc. Calibración: objetivo mixto, riesgo dinámico con salvaguarda Socorro. Nunca ejecuta ni comunica a terceros.
- [ ] **Step 3: Commit.**

### Task 5: Registros + drift del catálogo

**Files:**
- Modify: `docs/RUTINAS-PROGRAMADAS.md` (2 entradas nuevas, triggers pendientes de crear por Alberto)
- Modify: `docs/SKILLS.md`
- Modify: `docs/AGENTES-MAPA.md`
- Modify: `apps/plataforma/lib/agentes-catalogo.ts` (2 entradas `pendiente-trigger`; añadir `mercado-booking` activo; corregir `trading-analista`→activo, `buscador-ia`→activo)

- [ ] **Step 1: Editar los 4 ficheros.**
- [ ] **Step 2: Verificar** que ningún test del catálogo se rompe (`node --test apps/plataforma/lib/*.test.ts` los que existan).
- [ ] **Step 3: Commit.**

### Task 6: Memoria + push + PR draft

- [ ] **Step 1:** Entrada nueva arriba en `docs/CONTEXTO-SESIONES.md` (≤8 líneas).
- [ ] **Step 2:** `git push -u origin claude/financial-coordinator-agent-8j8typ` (retry backoff si red).
- [ ] **Step 3:** PR **draft** + `subscribe_pr_activity`.

## Verificación end-to-end
- SQL aplicado: SELECT de control con los 5 activos y tri-estado intacto.
- `node --test` verde en los helpers nuevos; `npx tsc --noEmit` de plataforma sin errores nuevos.
- La página compila (tsc) — el render real se verá en el preview de Vercel del PR.
- Las skills pasan la checklist del patrón (description ≤350, dos carriles, bitácora, alerta).
