# Adaptador ia-rest del Organizador de Trabajo — Implementation Plan

> Enchufa el paquete puro `@central/module-organizador-trabajo` a la cocina de ia.rest.
> El paquete ya está en `main` (64 tests, lógica pura). Este plan añade la capa con BD/UI.

**Goal:** Que un cocinero entre a su perfil en ia.rest y vea su trabajo del día **repartido y cronometrado**, con avisos encadenados entre partidas (frío→caliente), partes de trabajo (estimado vs real) y los avisos de FEFO/rentabilidad. La lógica la pone el módulo puro; este plan solo aporta **tablas, rutas y UI** (los puertos del módulo ↔ filas de BD).

**Architecture:** ia-rest (Next.js, Root Directory `apps/ia-rest`, Supabase compartida). El adaptador NORMALIZA filas de BD a los tipos del puerto (`Tarea`, `Trabajador`, `EstadoCarga`…) y llama a las funciones puras. Nada de lógica de negocio nueva en la app: solo I/O + mapeo.

**⚠️ Riesgo (regla de la matriz):** ia.rest está EN PRODUCCIÓN (`iarest.es`). Las migraciones van a la Supabase compartida → **aplicar por rama de Supabase + revisión antes de merge**. Cada tabla con RLS por `local_id`/tenant como el resto de ia-rest. NO tocar tablas vivas (comandas, facturas); estas son nuevas.

---

## File / DB Structure

**BD (migraciones Supabase, schema de ia-rest):**
- `tareas_operativas` — la cola de trabajo: elaboración/operativa, partida, duración estimada, prioridad, `vence_at`, `requiere_rol`, `estado`, `depende_de` (array), `local_id`.
- `partes_trabajo` — un parte por tarea ejecutada: `trabajador_id`, `tarea_id`, minutos_estimados, minutos_reales, desviación.
- (Reusar) `usuarios`/`empleados` de ia-rest como `Trabajador` (rol, disponible=fichado).
- Señal de carga `EstadoCarga` = nº de comandas abiertas (ya existe la tabla de comandas) → vista o query.

**App (`apps/ia-rest/src`):**
- `lib/organizador/adapter.ts` — mapea filas ↔ puertos del módulo y expone funciones de alto nivel (`trabajoDelDia(localId, trabajadorId)`, `cerrarTarea(...)`).
- `app/api/cocina/tareas/route.ts` — GET reparto del día (llama `asignarTrabajo`/`siguienteTarea`), POST cerrar tarea (genera `ParteTrabajo`, dispara `avisosAlCompletar`).
- `app/cocina/page.tsx` — UI de cocinero: su lista del día, cronómetro, botón "hecho", avisos de partida.

---

## Task 0: Migración de tablas (rama Supabase)

- [ ] **Step 1:** Crear `tareas_operativas` y `partes_trabajo` vía `apply_migration` en una **rama** de Supabase (no en prod). Columnas según los puertos del módulo. RLS por `local_id`.
- [ ] **Step 2:** `list_tables` para confirmar que no chocan con tablas vivas. `get_advisors` (security) tras crear.
- [ ] **Step 3:** Generar tipos: `generate_typescript_types` → `apps/ia-rest/src/types/db-organizador.ts`.
- [ ] **Step 4:** Revisión humana de la migración antes de merge a la BD de producción. ⚠️ gate manual.

## Task 1: Adapter puro↔BD (`lib/organizador/adapter.ts`)

- [ ] Mapear `tareas_operativas` → `Tarea` (incl. `depende_de`, `partida`).
- [ ] Mapear `usuarios` fichados → `Trabajador`.
- [ ] `EstadoCarga` desde el conteo de comandas abiertas del local.
- [ ] Test del adapter con filas de ejemplo (sin BD: funciones puras de mapeo).

## Task 2: API de cocina (`app/api/cocina/tareas/route.ts`)

- [ ] GET: lee tareas+trabajadores+carga del local → `asignarTrabajo` / `planificarPorCaducidad` → devuelve el reparto del día.
- [ ] POST cerrar: marca tarea hecha, `construirParte(tarea, trabajador, minutosReales)`, persiste el parte, calcula `avisosAlCompletar` y los emite.
- [ ] Auth por sesión + `local_id` del usuario (patrón existente de ia-rest).

## Task 3: UI del cocinero (`app/cocina/page.tsx`)

- [ ] Lista del día ya repartida (del GET), agrupada por partida (`agruparPorPartida`).
- [ ] Cronómetro por tarea; al pulsar "hecho" → POST con minutos reales.
- [ ] Banner de avisos encadenados ("Lista para empezar: …") cuando el POST devuelve avisos.
- [ ] (Fase 2) entrada por voz: "croquetas terminadas" → cierra tarea (reusa el stack de voz de ia.rest).

## Task 4: Productividad y previsión (panel jefa)

- [ ] Vista que agrega `resumirPartes` (estimado vs real por persona/partida).
- [ ] `personalPorDia` desde los eventos cerrados → previsión de personal a semana vista.
- [ ] Avisos: `proximosACaducar` (FEFO/manipulador) y `rentabilidadEvento` (boda no rentable).

---

## Fuera de este plan (hitos posteriores)
- **Foto = datos** (OCR de etiqueta → lote/alérgenos/caducidad) — módulo/infra OCR aparte.
- **Mensajería interna** (sustituto WhatsApp) — módulo de chat aparte.
- **Dossier APPCC** (expediente sanitario para imprimir) — generador de documentos aparte.

## Notas de verificación (a confirmar al ejecutar)
- Nombre real de la tabla de usuarios/empleados y de comandas en la Supabase de ia-rest.
- Convención de RLS/tenant vigente (`local_id` vs otra) — mirar una migración reciente de ia-rest.
- `next build` con deps reales (no solo `tsc`) antes de declarar verde.
