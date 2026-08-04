---
name: plataforma-maestro
description: >
  Router de contexto de la vertical PLATAFORMA (cuadro de mando consolidado de la casa de
  marcas + god-panel /admin; jerarquía Cuenta → Sociedad → Negocio). USAR SIEMPRE que Alberto
  pida cualquier cosa de plataforma: dashboard, banca/finanzas, god-panel, adaptadores por
  vertical, o el puerto HTTP a ia-rest. Sin secretos: solo nombres de variable.
---

# PLATAFORMA — router de contexto

`apps/plataforma` es el cuadro de mando consolidado de la casa de marcas (jerarquía
**Cuenta → Sociedad → Negocio**) + el **god-panel `/admin`** del operador (Alberto).
Fuente de verdad: `apps/plataforma/CLAUDE.md`. BD Supabase compartida `wswbehlcuxqxyinousql`
(con sivra+ialimp). Stack: Next 15 · Prisma · JWT · sin Tailwind (CSS vars).
Antes de tocar nada: lee `apps/plataforma/CLAUDE.md` y el archivo de references/ que toque.

## 🚨 No romper / crítico
1. **Toda query scopeada por `cuenta_id`.** God-panel se auto-protege en handlers (`getAdmin`).
2. **ia-rest vive en OTRA BD** (`iarest.*` del compartido es un clon vacío): NUNCA leerlo por
   Prisma — solo por **puerto HTTP** (`${IAREST_URL}/api/operador/*`, Bearer `OPERADOR_SHARED_SECRET`).
3. **Ingreso turístico POR PISO = tabla `incomes` (INGLÉS), NO el banco.** `movimientos_bancarios`
   agrega todos los pisos en `destino='turistico_pisos'` → inútil por piso. `negocios.ref_ext = incomes.propertyId`.
4. **`middleware.ts` deja pasar los crons por `CRON_SECRET` ANTES del gate de cookie.** NO quitar
   esa excepción (sin ella los crons redirigen 307→/login y quedan mudos — pasó 5 días, #429).
5. **`banca_destino_reglas` se aplica por SUBSTRING con prioridad sobre `destino.ts`:** nunca
   aprender claves genéricas (una regla `"TRANSF"` dejó la correduría a 0€ en silencio).
   Guardia obligatoria `lib/correduria.ts::claveReglaValida()` en todo punto de aprendizaje.
6. **Dedupe PSD2 por CONTENIDO (`dedupe_hash`), NUNCA por `entry_reference`/`accountUid`**
   (el banco los rota → duplicados). El hash JS debe coincidir BYTE A BYTE con el backfill SQL.
7. **La IA solo sugiere/narra; los importes SIEMPRE salen de `lib/banca.ts`/`lib/finanzas.ts`**
   (patrón "determinista primero"; la IA gratis NO es de fiar y la keyword manda).
8. **Correduría = SIEMPRE BBVA.** No clasificar `destino='seguros'` fuera de BBVA.
9. **Tema UI: CLARO por defecto, oscuro SOLO a mano.** NO reintroducir modo "auto"
   (`prefers-color-scheme`) ni hex fijos mezclados con `var(--text)`.
10. **DOS tablas de facturas independientes:** `facturas_drive` (panel `/sivra/facturas-control`)
    vs `facturas_proveedor` (agente Gmail→pago). No confundirlas ni cruzar escrituras.
11. **Cron nuevo = fila en `lib/cron-dispatch.ts::CRON_JOBS`, NUNCA en `vercel.json`** (dispatcher
    único `/api/cron/dispatch` cada minuto; Vercel Pro tope 40 crons y hay ~60 jobs, 30/07/2026).

## ÍNDICE de references/
**Lee SOLO el archivo de references/ que necesite la tarea; no los cargues todos.**

- **`references/mapa-gate-infra.md`** — Gate obligatorio antes de tocar nada · tabla "Dónde vive
  cada cosa" (tema UI, concursos, personas, pasarela IA central, secretos, CIMA, P&L pisos,
  import tarjeta PDF, agentes Telegram/contable/pago-facturas, triaje correo, domótica, flota,
  empresas, director de código, trading, subastas…) · Infra (BD, envs, roles).
  → Léelo para ubicar dónde vive cualquier feature o al empezar una tarea nueva.
- **`references/finanzas-fiscal.md`** — Pilar autónoma (`/finanzas/pilar`, Modelo 130) · sidebar
  Finanzas (gastos/fiscal/proyección, categorización personal, keywords, Bizum, `eur()`) ·
  deducciones de cuota IRPF (mecenazgo/guardería/deportiva).
  → Léelo para tocar `/finanzas/*`, categorización de gasto personal o fiscalidad IRPF.
- **`references/ui-inicio-dashboard.md`** — Inicio único `/banca` fusionado (SegTabs
  Dinero/Negocios/Fiscal/Personal) · antiguo `/dashboard` (solo redirige) · sistema de diseño
  "paquete moderno" (`dashboard/ui.tsx`, tokens, modo oscuro).
  → Léelo para tocar la home, navegación, o estilos/tema de plataforma.
- **`references/agentes-banca-landmines.md`** — Agente facturas proveedores (Gmail→OCR→PIS/SEPA) ·
  módulo banca (`lib/destino.ts`, correduría, reglas aprendidas, `/banca` libro completo) ·
  **Landmines completos** (incomes vs banco, roles BD, dedupes PSD2/cross-cuenta, zombies
  `destino_confirmado`) · frontera multi-tenant.
  → Léelo SIEMPRE antes de tocar banca, clasificación de movimientos o importaciones.
