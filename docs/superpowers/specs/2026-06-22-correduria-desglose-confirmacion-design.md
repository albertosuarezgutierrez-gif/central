# Correduría — formato de importe + desglose clicable con confirmación

**Fecha:** 2026-06-22
**Vertical:** `apps/plataforma` · página `/correduria`
**Rama:** `claude/brokerage-amount-breakdown-cl3tqb`

## Problema

La página `/correduria` muestra una matriz de comisiones por compañía aseguradora y mes,
calculada desde `movimientos_bancarios` con `destino = 'seguros'`. Dos pegas detectadas por
el dueño (Alberto):

1. **Formato del importe:** sale `€3581` (símbolo delante y, en el runtime de Vercel, sin
   punto de miles). Lo correcto en español es **`3.581€`** (importe primero, símbolo detrás,
   con separador de miles).
2. **La fila "Otras" no es fiable.** Agrupa todo movimiento cuyo concepto no casa con una
   aseguradora conocida (`detectarCompania()` en `app/api/correduria/route.ts`). Además, en
   BBVA el `destino='seguros'` se asigna **por descarte** (`lib/destino.ts`: "lo que no es del
   Dúplex → correduría"). Por tanto "Otras" puede contener cosas que **no** son de una
   compañía de seguros. El dueño necesita **pinchar un importe, ver de qué movimientos sale, y
   confirmar (o sacar) cada uno**.

## Hallazgo de infraestructura (reutilización)

- Columna `movimientos_bancarios.destino_confirmado` (boolean) **ya existe**
  (migración `prisma/sql/2026-06-22_mov_destino_confirmado.sql`).
- Endpoint `POST /api/banca/confirmar` **ya existe** y marca `destino_confirmado` validando
  pertenencia a la cuenta. Se reutiliza para la acción "✓ Es de seguros".
- **No se necesita migración de BD.** Las columnas `destino` y `destino_confirmado` existen.

## Alcance (decidido con el dueño)

- Pinchar **cualquier celda con importe** (compañía×mes, total de fila, total de mes).
- En el desglose: **ver y reclasificar** (confirmar que sí es seguros, o sacarlo a otro destino).
- Extras aprobados: **1** (porqué de cada clasificación), **2** (auto-confirmar fiables),
  **3** (KPI pendiente + filtro), **4** (renombrar "Otras").
- **Fuera (YAGNI):** reasignar un movimiento de "Otras" a una compañía concreta; y aprender de
  las correcciones para futuros meses (posible mejora posterior).

## Diseño

### Parte A — Formato `1.543€`

En `app/(usuario)/correduria/CorreduriaClient.tsx`:

- Reemplazar el helper `fmt()` (que depende de `toLocaleString('es-ES')`, cuyo agrupado de
  miles **se cae si el runtime no trae ICU completo**) por un formateador **manual**
  determinista que inserta el punto de miles e **invierte el orden**: `1543` → `1.543€`.
- Aplicar el nuevo formato en **todos** los importes: KPIs ("Total cobrado", "Mejor mes"),
  celdas de la matriz, fila de totales y total anual.

```
function eur(n: number): string {
  const s = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${s}€`
}
```

### Parte B — Lógica compartida de clasificación

Hoy `detectarCompania()` vive embebida en `app/api/correduria/route.ts`. Para que el endpoint
de detalle agrupe **exactamente igual** que la matriz (sin desajustes), se extrae a un módulo:

- **Nuevo `lib/correduria.ts`** (puro, sin red ni BD):
  - `detectarCompania(concepto, conceptoNorm, contraparte): string` (movida desde el route).
  - `motivoSeguros(banco, concepto, contraparte, importe): 'nombre' | 'descarte' | null`
    — reutiliza las regex de `lib/destino.ts` (`RE_SEGUROS` / `RE_COMISIONES` ⇒ `'nombre'`;
    en BBVA por el fallback de descarte ⇒ `'descarte'`). Sirve para el extra #1 y el #2.
- `lib/destino.ts` exporta sus regex (`RE_SEGUROS`, `RE_COMISIONES`) para que `correduria.ts`
  las consuma sin duplicarlas.
- `app/api/correduria/route.ts` pasa a importar `detectarCompania` desde `lib/correduria.ts`
  (sin cambio de comportamiento).

### Parte C — Endpoint de detalle

**Nuevo `GET /api/correduria/detalle?año=&compania=&mes=`** (scoped por `cuenta_id`):

- `compania` obligatorio; `mes` opcional (`YYYY-MM`). Si no hay `mes`, devuelve todo el año
  (caso "total de fila"). Para el caso "total de mes" se llama con `compania=__TOTAL__`.
- Selecciona los `movimientos_bancarios` con `destino='seguros'`, `importe>0`, no ignorados,
  del año (y mes si procede), reaplica `detectarCompania()` y filtra a la compañía pedida
  (o todas, si `__TOTAL__`).
- Devuelve por movimiento: `id, fecha, concepto, contraparte, importe, banco,
  destino_confirmado, motivo` (`'nombre'|'descarte'`).

### Parte D — Endpoint de reclasificación

**Nuevo `POST /api/banca/destino` `{ id, destino }`** (scoped por `cuenta_id`):

- Valida `destino` contra la unión `Destino` de `lib/destino.ts`
  (`turistico_pisos | turistico_duplex | seguros | traspaso_interno | personal`).
- Verifica pertenencia a la cuenta (igual que `/api/banca/confirmar`) y hace
  `UPDATE movimientos_bancarios SET destino = ... WHERE id = ...`.
- Al cambiar a un destino ≠ `seguros`, el movimiento **desaparece de la correduría** (la
  query de la matriz filtra `destino='seguros'`).

### Parte E — UI del desglose (modal)

En `CorreduriaClient.tsx`:

- Cada celda con importe (compañía×mes, total fila, total mes) se vuelve `button`/clicable y
  abre un **modal** que llama a `/api/correduria/detalle` y lista los movimientos:
  fecha · concepto · contraparte · **importe (`1.543€`)** · etiqueta de motivo.
- **Etiqueta de motivo (extra #1):** `✅ por nombre (MAPFRE)` vs
  `⚠️ por descarte (BBVA)`. Los `⚠️` se resaltan: son los sospechosos.
- Acciones por movimiento:
  - **✓ Es de seguros** → `POST /api/banca/confirmar { id, confirmado: true }`. Queda con check.
  - **No es de seguros ▾** → desplegable con los otros destinos (Personal / Pisos turísticos /
    Dúplex / Traspaso interno) → `POST /api/banca/destino { id, destino }`. Sale de la matriz.
- Al cerrar el modal tras cualquier cambio, **refrescar la matriz** (re-fetch de
  `/api/correduria`).

### Extra #2 — Auto-confirmar fiables (sin migración)

- El estado de confirmación que se muestra = `destino_confirmado || motivo === 'nombre'`.
  Es decir, los que casaron **por nombre** de aseguradora se consideran confirmados de oficio
  (no requieren acción), y el trabajo manual se reduce a los `⚠️ por descarte` y a "Otras".
- No se escribe `destino_confirmado` automáticamente (evita backfill y no toca la semántica
  que `/finanzas` ya da a esa columna). La confirmación manual sí lo persiste para los de
  descarte.

### Extra #3 — KPI "Pendiente de confirmar" + filtro

- Nuevo KPI: **`Pendiente de confirmar: N.NNN€`** = suma de importes con
  `motivo==='descarte' && !destino_confirmado`. (El endpoint de la matriz `/api/correduria`
  añade, por movimiento agregado, los contadores/sumas necesarios, o un campo `pendiente`.)
- Botón **"Ver solo lo pendiente"** que abre el modal de detalle filtrado a esos movimientos
  (compañía `__PENDIENTE__`), para hacer la pasada y dejarlo a cero.

### Extra #4 — Renombrar "Otras"

- En la UI, la fila/categoría `'Otras'` se muestra como **"Sin identificar (revisar)"**.
  El valor interno sigue siendo `'Otras'` (no se toca el agrupador), solo la etiqueta visible.

## Ficheros afectados

| Fichero | Cambio |
|---|---|
| `lib/destino.ts` | Exportar `RE_SEGUROS`, `RE_COMISIONES`. |
| `lib/correduria.ts` | **Nuevo.** `detectarCompania()` + `motivoSeguros()`. |
| `app/api/correduria/route.ts` | Importar `detectarCompania` del nuevo módulo; añadir datos de "pendiente". |
| `app/api/correduria/detalle/route.ts` | **Nuevo.** Detalle de movimientos por celda. |
| `app/api/banca/destino/route.ts` | **Nuevo.** Reclasificar `destino` de un movimiento. |
| `app/(usuario)/correduria/CorreduriaClient.tsx` | Formato `1.543€`, celdas clicables, modal de desglose, KPI pendiente, etiquetas. |

## Pruebas

- `lib/correduria.test.ts` (`node --test`): `detectarCompania` (casos conocidos + "Otras") y
  `motivoSeguros` (`nombre` con MAPFRE/GENERALI; `descarte` en BBVA sin nombre).
- Verificación manual del formato (`1543 → 1.543€`, `0 → —`).
- Verificación de scope multi-tenant en los endpoints nuevos (rechaza id de otra cuenta).

## No-objetivos

- Reasignar movimiento de "Otras" a una compañía concreta.
- Aprendizaje/persistencia de reglas a partir de las correcciones (mejora futura).
- Migraciones de BD (no hacen falta).
