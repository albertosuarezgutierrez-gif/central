# Proyección fiscal completa con IA

**Fecha:** 2026-07-02  
**Alcance:** `apps/plataforma` — `/finanzas/proyeccion`

## Problema

La proyección fiscal actual solo añade hacia el futuro las reservas de Smoobu (ingresos de pisos confirmados). Ignora:

1. **Ingresos recurrentes futuros** no cubiertos por Smoobu: comisiones de correduría (`seguros`), que llegan mensualmente del banco.
2. **Gastos deducibles futuros**: alquiler Luxury Busto, alquiler Busto Reform, y cualquier otro gasto fijo deducible aún no registrado en banco porque corresponde a meses futuros.

Resultado: el margen al tramo del 45% aparece artificialmente pequeño (ej. 538 €) cuando en realidad, restando 6 meses de alquileres de pisos y sumando 6 meses de correduría esperada, el margen real puede ser varios miles de euros mayor o menor.

## Fórmula objetivo

```
baseProyectada =
  baseReal                             (movimientos bancarios acumulados hasta hoy)
  + reservasFuturasSmoobu              (ya existe — ingresos pisos confirmados Smoobu)
  + ingresosRecurrentesProyectados     (correduría × meses restantes)  ← NUEVO
  - gastosDeduciblesProyectados        (alquileres pisos, etc × meses restantes)  ← NUEVO
```

`mesesRestantes` = meses completos desde el mes siguiente al actual hasta diciembre inclusive.

## Solución: agente de detección de patrones recurrentes

### Paso 1 — SQL de detección

Sobre `movimientos_bancarios` de los **últimos 3 meses completos** (excluyendo el mes en curso para evitar parciales), con `destino IN ('seguros', 'turistico_pisos', 'turistico_duplex')`:

- Agrupar por `(concepto_normalizado, destino, signo)` donde `signo = SIGN(importe)`.
- Filtrar grupos que aparecen en **≥ 2 de los 3 meses**.
- Calcular `importe_medio_mensual` = media de los meses en que aparece.
- Excluir `duplicado_estado = 'ignorado'` y `amortizable = true`.

Resultado: lista de candidatos con concepto, destino, signo (ingreso/gasto), e importe medio.

### Paso 2 — Enriquecimiento con IA

Una sola llamada a `aiComplete` con todos los candidatos. El prompt incluye:
- El concepto bancario crudo (feo, abreviado).
- El destino ya clasificado.
- El importe medio.

La IA devuelve para cada candidato:
- `etiqueta`: nombre legible ("Alquiler Luxury Busto", "Comisiones Generali", "Cuota TGSS Pilar").
- `proyectable`: `true`/`false` — descarta ítems que parezcan puntuales a pesar de repetirse 2 meses (ej. una factura atrasada pagada en 2 plazos).
- `tipo`: `'ingreso'` | `'gasto'` (confirmación del signo).

La deductibilidad **no la decide la IA**: se deriva del `destino` bancario ya clasificado (`seguros`/`turistico_*` = deducible, `personal` = no).

### Paso 3 — Proyección

```
mesesRestantes = meses completos desde mes_actual+1 hasta diciembre
ingresosProyectados  = SUM(patron.importe_medio * mesesRestantes WHERE tipo='ingreso' AND proyectable)
gastosProyectados    = SUM(patron.importe_medio * mesesRestantes WHERE tipo='gasto'  AND proyectable)
```

Ambos son totalmente deducibles (por la naturaleza de los destinos filtrados en el SQL).

## Ficheros

### Nuevo: `apps/plataforma/lib/gastos-recurrentes.ts`

Funciones exportadas:

```typescript
export type PatronRecurrente = {
  concepto: string          // concepto bancario crudo
  etiqueta: string          // nombre legible (IA)
  destino: string           // destino bancario
  tipo: 'ingreso' | 'gasto'
  importeMedioMensual: number
  mesesDetectado: number    // 2 o 3 (de los últimos 3)
  proyectable: boolean      // confirmado por IA
}

export async function detectarPatronesRecurrentes(
  cuentaId: string,
  year: number
): Promise<{
  patrones: PatronRecurrente[]
  ingresosProyectados: number
  gastosProyectados: number
  mesesRestantes: number
}>
```

Internamente:
1. Calcula `mesesRestantes` a partir de `new Date()`.
2. Hace la query SQL de detección sobre los 3 meses anteriores al mes en curso.
3. Llama `aiComplete` para enriquecer.
4. Calcula totales proyectados.

### Modificado: `app/api/finanzas/proyeccion/route.ts`

Añadir llamada a `detectarPatronesRecurrentes`. Nuevos campos en respuesta:
- `patrones: PatronRecurrente[]`
- `ingresosRecurrentesProyectados: number`
- `gastosDeduciblesProyectados: number`
- `mesesRestantes: number`

Nueva fórmula:
```typescript
const baseProyectada = baseReal + ingresosFuturos + ingresosRecurrentesProyectados - gastosDeduciblesProyectados
```

### Modificado: `app/(usuario)/finanzas/proyeccion/ProyeccionClient.tsx`

- KPI "Base proyectada a cierre" usa la nueva base corregida.
- Nueva tarjeta "🔄 Patrones detectados" con dos sublistas:
  - Ingresos recurrentes proyectados (verde).
  - Gastos deducibles proyectados (rojo).
  - Por cada ítem: etiqueta, importe/mes, × meses restantes = total.
- La advertencia de tramo (`margenHastaProximoTramo < 8000`) se recalcula sobre la base corregida.

## Lo que NO incluye

- Gastos `personal` (no deducibles, no afectan base imponible).
- Actividad de Pilar — tiene su módulo propio.
- Ingresos futuros de pisos — los cubre Smoobu.
- Sin nueva tabla en BD — todo es cálculo en tiempo de petición.

## Edge cases

- **Primer mes del año (enero):** no hay 3 meses anteriores del año en curso → usar diciembre–noviembre del año anterior del mismo `year-1`. Aceptable para proyección.
- **Diciembre:** `mesesRestantes = 0` → `ingresosProyectados = 0`, `gastosProyectados = 0`. La proyección es 100% el real acumulado.
- **IA falla:** si `aiComplete` lanza, la función devuelve los patrones SQL sin etiqueta de IA (`etiqueta = concepto`) y `proyectable = true` para todos (safe default — mejor sobreestimar que ignorar).
- **Sin patrones detectados:** respuesta vacía, la base proyectada queda igual que antes (compatibilidad hacia atrás).
