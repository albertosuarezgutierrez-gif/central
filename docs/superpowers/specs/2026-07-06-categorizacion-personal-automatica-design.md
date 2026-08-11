# Categorización automática de gasto personal

> Fecha: 2026-07-06 · Vertical: `apps/plataforma` · Rama: `claude/ia-categorization-issue-6a534b`

## Problema

En la pestaña **📊 Categorías** (`/finanzas`, `CategoriasTab.tsx`) demasiados gastos personales se
acumulan en el cajón **"Otros gasto"** (`subcategoria = 'otros_gasto'`) en vez de repartirse en
categorías con sentido (supermercado, bares, vivienda…). Alberto quiere controlar su **gasto
personal** y poder responder "¿cuánto gasté en super / bares / vivienda este mes/año?".

Causas encontradas en el código:

1. **La ingesta no reparte subcategoría.** `analizarMovimientos` (`lib/categorizar.ts`) fija
   `categoria`/`destino` pero **no** `subcategoria` para gasto personal → los movimientos entran
   como `subcategoria = NULL`. El clasificador determinista por keywords
   (`clasificarPorKeywords`, `lib/subcategoria-keywords.ts`) **no está enganchado a la ingesta**.
2. **Los `otros_gasto` ambiguos nunca llegan a la IA.** En `auto-tag/route.ts` el paso de keywords
   recorre los `otros_gasto`, pero si no casan ninguna clave solo se manda a la IA lo que era `NULL`
   (`if (r.es_null) pendientes.push(r)`). Un `otros_gasto` sin match se queda ahí **para siempre**.
3. **El botón «🤖 Auto-clasificar» está escondido.** Solo se renderiza dentro del panel
   *"N sin categoría"* (`SinCategoriaPanel`), que aparece únicamente si `sinCategoria > 0` (cuenta solo
   los `NULL`). Si todo está ya en `otros_gasto`, no hay panel ni botón.
4. **Dos clasificadores de subcategoría redundantes y divergentes:** `lib/categoria-ia.ts`
   (`categorizarMovimiento`/`categorizarLoteSinSubcategoria`) usa **Anthropic de pago** y solo toca
   `NULL`; `auto-tag/route.ts` usa la pasarela **gratis** (`aiComplete`, cadena NIM→Groq→Gemini→Kimi).
5. **Falta taxonomía de "vivienda".** No existen categorías para comunidad de propietarios ni IBI, así
   que los gastos de la vivienda personal (Montecarmelo) caen en "Otros gasto".

## Objetivo

Que el gasto **personal** se categorice **automáticamente** (sin pulsar botones), repartiéndose en
categorías útiles, y que "Otros gasto" quede como un residuo pequeño y real. Alberto solo corrige lo
que la IA falle (los desplegables que ya existen y aprenden regla).

Alcance del eje: **solo `destino='personal'` y `importe < 0`** (gasto personal de consumo). Los
negocios (turístico, seguros, actividad de Pilar) NO entran aquí. La "vivienda personal" es un único
inmueble: **Montecarmelo** (los pisos turísticos son negocio, `destino='turistico_*'`).

## Diseño

### 1. Un solo clasificador de subcategoría (el gratis)

Se unifica la clasificación de subcategoría personal en **una** función compartida, que usa la
pasarela gratis y el diccionario de keywords:

```
barrerSubcategoriasPersonal(cuentaId?: string, opts?) : Promise<{ tagged: number }>
```

- Vive en un módulo de librería (p. ej. `lib/subcategoria-barrido.ts`), reutilizable por la ingesta,
  el cron diario y la ruta `auto-tag` (que pasa a ser un wrapper fino sobre ella).
- Lógica: **keyword primero** (`clasificarPorKeywords`, instantáneo, gratis) → aprende regla en
  `banca_destino_reglas` → los genuinamente ambiguos van a la IA en lotes con `aiComplete`
  (`@central/core-ai`, con `timeoutMs` y presupuesto de tiempo, éxito parcial).
- **Coge `subcategoria IS NULL OR = 'otros_gasto'`** (rescata el cajón), con
  `destino='personal' AND importe < 0 AND duplicado_estado <> 'ignorado'`, scoped por `cuenta_id`.
- **Manda a la IA también los `otros_gasto` que no casan keyword** (arregla la causa 2).

Se **retira la vía Anthropic de pago** (`categoria-ia.ts`) de este flujo: el cron
`categorizar-movimientos` deja de llamar a `categorizarLoteSinSubcategoria` y pasa a
`barrerSubcategoriasPersonal`. `categoria-ia.ts` se conserva solo si algún otro consumidor lo usa;
si queda sin consumidores, se elimina (`normalizarContraparte` se mueve a un módulo puro reutilizable).

### 2. La ingesta reparte por keywords

En `analizarMovimientos` (`lib/categorizar.ts`), tras resolver `destino`: si `destino='personal'` y
`importe < 0` y la subcategoría no viene ya fijada, asignar `clasificarPorKeywords(...)` (instantáneo,
gratis) dentro del mismo `UPDATE` que ya escribe `categoria`/`destino`. Así la mayoría de gastos
entran ya repartidos; solo los ambiguos quedan `NULL` a la espera del barrido con IA.

### 3. Barrido diario que rescata «Otros gasto»

El cron diario existente (tras el sync bancario) ejecuta `barrerSubcategoriasPersonal` sobre **todas**
las cuentas. Opciones de enganche (a decidir en el plan):

- Reutilizar el cron **`categorizar-movimientos`** (ya programado) repuntándolo a la nueva función; o
- Añadir la llamada tras `categorizarPendientesTodas` en **`psd2-sync`**.

Preferencia: **repuntar `categorizar-movimientos`** (es el cron cuyo cometido ya era la subcategoría),
manteniendo una sola pasada diaria. Presupuesto de tiempo bajo `maxDuration` para no morir con 504.

### 4. Botón `auto-tag` con la misma lógica

`auto-tag/route.ts` pasa a ser un wrapper de `barrerSubcategoriasPersonal(session.id)` → hereda el
rescate de `otros_gasto`. No se añade UI nueva (el usuario eligió automático), pero el botón existente
queda coherente y útil para forzar un repaso. El gating del panel no cambia en este PR.

### 5. Taxonomía "Vivienda" (Montecarmelo)

En `lib/categorias-personales.ts` (fuente única):

- Añadir a `SUBCATEGORIAS_GASTO`: **`comunidad`** y **`ibi`**.
- `EMOJI`: `comunidad: '🏘️'`, `ibi: '🏛️'` (o similar).
- `DESCRIPCION_GASTO`: comunidad = "cuota de comunidad de propietarios / administrador de fincas";
  ibi = "IBI y tributos municipales de la vivienda (contribución, tasas de basura…)".

En `lib/subcategoria-keywords.ts`, añadir reglas (MAYÚSCULAS, sin acentos), ordenadas por
especificidad:

- `comunidad`: `CDAD. DE PROP`, `CDAD DE PROP`, `COMUNIDAD DE PROP`, `COMUNIDAD PROP`, `C.P. `,
  `MANCOMUNIDAD`, `ADMIN. FINCAS`, `ADMINISTRACION DE FINCAS`, `ADMON FINCAS`.
- `ibi`: `IBI`, `IMPUESTO BIENES INMUEBLES`, `CONTRIBUCION URBANA`, `RECAUDACION MUNICIPAL`,
  `PATRONATO RECAUDACION`, `TASA BASURA`, `TASA DE BASURA`. (Cuidado: `IBI` como fragmento suelto
  puede colisionar — usar con límites de palabra vía el envoltorio de espacios ya existente.)
- Ampliar el diccionario general con más comercios españoles frecuentes para vaciar "Otros gasto".

En `CategoriasTab.tsx`, agrupar visualmente `hipoteca` + `comunidad` + `ibi` + `suministros_piso` bajo
un encabezado **🏠 Vivienda** en la tabla de gastos (total del grupo + desglose por fila). El resto de
categorías se muestran igual que hoy. La dona puede seguir por subcategoría o colapsar el grupo
Vivienda (decisión menor en el plan).

## Extras incluidos (A–D)

Todos aprobados para este trabajo. Se implementarán por fases (ver el plan) para poder revisar por
partes; el núcleo (secciones 1–5) va primero.

### A. Cola de revisión en vez de agujero negro

Cuando la IA no está segura de la subcategoría, **no** la tira a `otros_gasto` en silencio: escribe su
mejor apuesta y la **marca para revisar**, de modo que aparezca en un panel de confirmación.

- **Señal propia, NO reutilizar `requiere_revision`.** Esa columna gobierna la confianza del *destino*
  (negocio) y alimenta la bandeja "Por revisar" de `GastosTab` y el agente Telegram de tarjeta.
  Mezclar ahí la duda de *subcategoría* contaminaría esas superficies. Se añade columna dedicada:
  **`movimientos_bancarios.subcategoria_revisar BOOLEAN DEFAULT false`** (migración
  `prisma/sql/2026-07-06_subcategoria_revisar.sql`).
- `barrerSubcategoriasPersonal`: la IA devuelve subcategoría + confianza; si `confianza < 0.85` (o cae
  al fallback), escribe la subcategoría y pone `subcategoria_revisar = true`. Las clasificaciones por
  keyword (alta confianza) van con `subcategoria_revisar = false`.
- **Panel "🔎 Por revisar"** en `CategoriasTab.tsx`: lista los movimientos personales con
  `subcategoria_revisar = true`, con el desplegable de categoría por fila (reutiliza `MovList`).
  Confirmar quita la marca (`subcategoria_revisar = false`) y aprende regla. Endpoint:
  extender `GET /api/finanzas/categorias/movimientos` con `?revisar=1`, o ruta hermana.

### B. Priorizar los "Sin identificar" grandes

Panel compacto en `CategoriasTab.tsx` con los **N gastos personales sin clasificar de mayor importe**
(`subcategoria IS NULL OR = 'otros_gasto'`, `destino='personal'`, `importe < 0`, orden `ABS(importe)
DESC`, límite ~10), con su desplegable de categoría. Da el máximo control con el mínimo esfuerzo (los
€4903 en 4 movimientos de la captura). Endpoint: reutiliza `GET .../movimientos` con orden por importe.

### C. Comparativa mensual por categoría

Junto a cada categoría de gasto, un badge **±%** del mes en curso frente a la **media de los meses
anteriores** (media móvil ~6 meses, misma categoría). Señal simple de control ("este mes en super vas
un 20% por encima de tu media"). Cálculo en el endpoint de categorías (`GET /api/finanzas/categorias`)
o uno hermano; sin datos nuevos. La comparativa se muestra solo en el preset "Mes actual".

### D. Presupuesto por categoría con aviso Telegram

Rematar las alertas existentes (`categoria_alertas`, `comprobarAlertas`):

- **Filtrar por `cuenta_id`** en `categoria_alertas`/`comprobarAlertas` (hoy no lo hacen — deuda anotada
  en `CLAUDE.md`; inocuo con un usuario, pero se cierra aquí ya que tocamos el código).
- Aviso **proactivo por Telegram** al superar el límite mensual de una categoría: cron que llama a
  `comprobarAlertas` por cuenta y envía por `/api/internal/alerta` (`CRON_SECRET`) — o se engancha al
  barrido diario. Deduplicar el aviso (una vez por categoría/mes) con una marca de "ya avisado".

## Qué NO se toca

- El eje `categoria`/PGC (contable) ni `categoria-ia.ts` como taxonomía PGC.
- La detección de `destino` (negocio) ni los invariantes de negocio (turístico/seguros/Pilar).
- La UI de corrección: los desplegables que reasignan y aprenden regla siguen igual.
- El gating del `SinCategoriaPanel` (fuera de alcance de este PR).

## Riesgos / consideraciones

- **Filtro por destino como aislante:** las keywords de `comunidad`/`ibi` son genéricas, pero el
  barrido solo corre sobre `destino='personal'`, así que no contaminan pisos turísticos.
- **Idempotencia:** el barrido solo escribe cuando el valor cambia (sin no-ops), como ya hace
  `auto-tag`. Aprende regla solo en descubrimientos nuevos.
- **Presupuesto de IA:** mantener `IA_TIMEOUT_MS`, `PRESUPUESTO_MS`, `CHUNK` y `maxDuration=60` del
  `auto-tag` actual para no provocar 504 en Vercel.
- **Reglas aprendidas mandan:** `analizarMovimientos` ya aplica `banca_destino_reglas` con prioridad;
  el keyword de ingesta no debe pisar una subcategoría ya fijada por regla del dueño.
- **Migración de datos:** el núcleo (secciones 1–5) no requiere DDL (las columnas
  `subcategoria`/`banca_destino_reglas` ya existen). El extra **A** añade una columna
  (`subcategoria_revisar`); **D** puede requerir una marca de "ya avisado" (columna en
  `categoria_alertas` o tabla puente). El primer barrido reclasificará el histórico `otros_gasto`.

## Pruebas

- `node --test` sobre `subcategoria-keywords`: nuevas claves `comunidad`/`ibi` casan los conceptos
  reales (CDAD. DE PROP. MONTE CARMELO, IBI, etc.) y no producen falsos positivos evidentes.
- `node --test` sobre `categorias-personales`: `comunidad`/`ibi` son subcategorías válidas de gasto.
- Verificación funcional: importar/simular movimientos personales y comprobar que se reparten;
  que un `otros_gasto` ambiguo llega a la IA en el barrido; que la pestaña muestra el grupo Vivienda.
- Extras: (A) baja confianza → `subcategoria_revisar=true` y aparece en el panel "Por revisar";
  confirmar lo quita y aprende regla. (B) el panel lista los sin clasificar ordenados por importe.
  (C) el badge ±% compara mes actual vs media móvil. (D) superar el límite de una categoría dispara
  un aviso Telegram (y no lo repite el mismo mes).
