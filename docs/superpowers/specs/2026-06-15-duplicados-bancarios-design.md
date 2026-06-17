# Spec — Resolución de cargos duplicados (`apps/plataforma`)

Fecha: 2026-06-15 · Estado: en diseño · Rama: `claude/pensive-turing-pk1www`

## Problema
El dashboard de `plataforma` ya **detecta** posibles cargos duplicados (`getAlertas` en
`lib/banca.ts`), pero el detector es **ingenuo y no accionable**:

- **Heurística única:** marca como duplicado cualquier par con *mismo importe + misma
  contraparte/concepto en ±4 días* (gasto, últimos 60 días). Nada más.
- **Falsos positivos:** un micro-gasto recurrente legítimo (p. ej. "COMPRA EN HORNO NUEVA
  FLORIDA, -3 €" dos días seguidos) se marca como cobro doble. La alerta cría lobos.
- **Sin acción:** el banner solo cuenta y lista hasta 3. No se puede confirmar "es un cobro
  doble real" ni descartar "es normal, no me avises más", así que el mismo aviso vuelve siempre.

Objetivo: que lo sospechoso **siga apareciendo**, pero que el dueño pueda **resolverlo** y que
la decisión **persista** (no vuelva a salir, sobrevive a reimportar el extracto).

## Decisiones
- **Persistencia por columna en `movimientos_bancarios`** (no tabla aparte): encaja con el
  patrón vigente (`requiere_revision`, `conciliado`, `destino` son columnas en esa misma tabla)
  y sobrevive a reimportar porque el `dedupe_hash` evita reinsertar la fila. Aditiva y nullable.
- **Aditivo y multi-tenant:** todo scopeado por `cuenta_id`, sin tocar lo existente salvo
  reaprovechar la query de detección.
- **IA gratis** (solo Fase 2): se reutiliza `@central/core-ai` (NVIDIA NIM gratis → Claude
  Haiku fallback), ya declarado como dependencia de `apps/plataforma`.
- **Una sola fuente de verdad de detección:** `getAlertas` (banner) y la página de resolución
  leen la MISMA función, para que nunca se contradigan.

## Modelo de datos
Migración aditiva (`apps/plataforma/prisma/sql/2026-06-15_banca_duplicados.sql`):

```sql
ALTER TABLE movimientos_bancarios
  ADD COLUMN IF NOT EXISTS duplicado_estado text;  -- NULL | 'ignorado' | 'confirmado'
```

- `NULL` → sospechoso sin resolver (elegible para el detector).
- `ignorado` → el dueño dijo "es normal" → excluido de la detección.
- `confirmado` → el dueño dijo "es un cobro doble real" → fuera de pendientes, queda registrado.

Índice parcial opcional para el filtro de pendientes (solo si el `EXPLAIN` lo pide; el volumen
es pequeño):
```sql
CREATE INDEX IF NOT EXISTS idx_mov_dup_pendiente
  ON movimientos_bancarios (cuenta_bancaria_id, fecha_operacion)
  WHERE duplicado_estado IS NULL AND importe < 0;
```

---

# Fase 1 — Detección fiable + resolución (núcleo)

Incluye las ideas **1 (confianza + umbral)**, **2 (excluir ya conciliados)** y
**3 (deshacer / ver resueltos)** acordadas.

## Componentes

### `lib/banca.ts` — detección
Extraer del SQL que hoy vive en `getAlertas` una función dedicada:

```ts
export type DupMovimiento = { id: string; fecha: string | null; concepto: string; importe: number; conciliado: boolean }
export type DupGrupo = {
  clave: string                 // firma estable del grupo (importe|contraparte normalizada)
  confianza: 'alta' | 'baja'    // alta = recibo/transferencia mismo día; baja = compra física
  importe: number
  movimientos: DupMovimiento[]   // los 2+ movimientos sospechosos del grupo
}
export async function getDuplicadosSospechosos(cuentaId: string): Promise<DupGrupo[]>
```

Reglas de la query (scoped por `cuenta_id`):
- Par con **mismo importe** + **misma contraparte/concepto** en **±4 días**, gasto
  (`importe < 0`), últimos 60 días — igual que hoy.
- **Solo `duplicado_estado IS NULL`** (idea base: lo resuelto desaparece).
- **Idea 2 — excluir ya conciliados:** si ambos movimientos del par tienen
  `conciliado = true` y `factura_ref` **distinto**, no es duplicado (son dos gastos
  legítimos casados a facturas diferentes) → fuera.
- **Idea 1 — confianza + umbral:**
  - `confianza = 'alta'` si el par es **mismo día** (`fecha_operacion` igual) y el concepto
    sugiere recibo/transferencia/domiciliación (heurística de palabras clave:
    `RECIBO|TRANSFERENCIA|ADEUDO|DOMICIL|PAGO`); si no, `'baja'`.
  - Umbral `DUP_UMBRAL_BANNER` (env, por defecto **5 €**): los grupos con `abs(importe) <
    umbral` y `confianza = 'baja'` **no cuentan para el banner** (matar el ruido del horno),
    pero **sí aparecen** en la página si el dueño quiere verlos.

`getAlertas` pasa a llamar a `getDuplicadosSospechosos` y contar solo los grupos que superan el
umbral del banner. `duplicadosDetalle` se deriva de ahí (sin SQL duplicado).

### `app/api/banca/duplicados/route.ts` — resolver
`POST` (sesión + zod, mismo patrón que `/api/banca/revisar`):
- Body: `{ ids: string[], estado: 'ignorado' | 'confirmado' | null }` (`null` = deshacer).
- `UPDATE movimientos_bancarios SET duplicado_estado = $estado WHERE id = ANY($ids)` **AND** el
  movimiento pertenece a una cuenta bancaria de la sesión (join scoped por `cuenta_id`).
- Devuelve `{ ok: true, actualizados: n }`.

### UI — `app/(usuario)/banca/` (`BancaClient.tsx`)
Nuevo componente **`DuplicadosBandeja`** (patrón calcado de `RevisarBandeja`), anclado en
`#duplicados`:
- Por cada `DupGrupo`: tarjeta con los **dos movimientos lado a lado** (fecha · concepto ·
  importe) y un *badge* de confianza (`alta`/`baja`).
- Dos botones por grupo:
  - **"Es normal"** → `POST { ids:[...], estado:'ignorado' }`.
  - **"Es un cobro doble"** → `POST { ids:[...], estado:'confirmado' }`.
- Removido optimista + `router.refresh()`.
- **Idea 3 — plegable "Ya resueltos (N)":** lista los `ignorado`/`confirmado` recientes con un
  botón **"Reactivar"** → `POST { ids:[...], estado:null }`. Requiere
  `getDuplicadosResueltos(cuentaId)` en `lib/banca.ts`.

La página server-side (`banca/page.tsx`) carga `getDuplicadosSospechosos` +
`getDuplicadosResueltos` y los pasa al cliente, junto a la lista de sociedades ya existente.

### Banner del dashboard (`app/(usuario)/dashboard/page.tsx`)
El contador de duplicados de `AlertasBanner` se vuelve **enlace a `/banca#duplicados`**. Sigue
saliendo solo si hay grupos pendientes por encima del umbral del banner.

## Verificación (Fase 1)
- `lib/norma43` ya tiene `node --test`; para la detección, prueba con `execute_sql`
  (Supabase MCP) sobre datos reales:
  1. Insertar un par sospechoso (mismo importe/contraparte, ±2 días) → aparece en la bandeja.
  2. `POST estado:'ignorado'` → desaparece de pendientes y el banner baja.
  3. Reimportar el mismo extracto → sigue resuelto (no reaparece).
  4. Un par de 3 € en comercio físico → NO dispara el banner (umbral), pero se ve en la página.
  5. Par con ambos conciliados a facturas distintas → no aparece.
- `npm run build` / typecheck de `apps/plataforma`.

---

# Fase 2 — Borrador de reclamación con IA (idea 4)

Al **confirmar** un cobro doble, ofrecer generar un texto listo para reclamar al comercio o al
banco.
- `lib/banca.ts` o `lib/reclamacion.ts`: `redactarReclamacion(grupo)` usando `@central/core-ai`
  (degrada limpio si la IA no está disponible: plantilla estática).
- API `POST /api/banca/duplicados/reclamacion` → devuelve `{ asunto, cuerpo }`.
- UI: tras "Es un cobro doble", botón **"Redactar reclamación"** que muestra el texto en un
  modal (copiar al portapapeles; opcional enviar por `@central/core-email`).
- Verificación: generar para un par confirmado → texto coherente con importe/fecha/comercio;
  sin `*_API_KEY` → cae a plantilla.

# Fase 3 — Auto-detección de recurrentes (idea 5)

Aprender qué contrapartes son recurrentes para **degradar su confianza automáticamente** (que
el dueño no tenga ni que ignorarlas).
- `lib/banca.ts`: detectar contrapartes con **≥ N cargos/mes** sostenidos (p. ej. el horno, el
  parking) → marca de "recurrente conocido".
- Un par cuya contraparte es recurrente nace con `confianza = 'baja'` y por debajo del umbral
  del banner, aunque supere el importe.
- Opcional: persistir la lista de recurrentes confirmados en una tabla `contrapartes_recurrentes`
  (`cuenta_id, contraparte_normalizada, marcado_at`) para no recalcular.
- Verificación: una contraparte con 12 cargos en 60 días deja de disparar el banner.

---

## Roadmap
**F1** núcleo (detección fiable + resolución + deshacer) → **F2** reclamación IA → **F3**
auto-recurrentes. F1 es independiente y entregable sola; F2 y F3 son aditivas sobre el mismo
modelo de datos.

## Qué NO se toca
- La heurística base de ±4 días / 60 días se mantiene (solo se le añade confianza y umbral).
- El parser Norma 43, el import, la categorización IA y la conciliación banco↔facturas no
  cambian; F1 solo **lee** `conciliado`/`factura_ref` para el filtro de la idea 2.
- Sin credenciales en repo; multi-tenant por `cuenta_id` en todas las queries.
