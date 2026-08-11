# PLATAFORMA — finanzas personales y fiscal (Pilar, sidebar Finanzas, deducciones)

## Pilar autónoma — `/finanzas/pilar` (23/06/2026, PR #462)
- **Cuentas bancarias de Pilar:** se importan con `titular='conyuge'` (campo en `cuentas_bancarias`). El select "Titular de la cuenta" en `BancaClient.tsx` lo recoge y lo pasa a `lib/banca.ts::importarExtracto(titular)`.
- **Auto-clasificación:** `clasificarDestinoDetalle(banco, concepto, contraparte, importe, titular)` acepta `titular` como 5º parámetro. Para `titular='conyuge'`: TGSS/Seg.Social → `actividad_pilar` + `subcategoria='cuota_autonomos'`; abono → `actividad_pilar` + `cobro_cliente`; cargo → `actividad_pilar` + `gasto_profesional`. `lib/categorizar.ts` lee `cb.titular` y persiste `subcategoria` en BD.
- **BD:** `movimientos_bancarios.subcategoria TEXT` (nuevo). `fiscal_perfil` + 5 campos cónyuge autónoma: `conyuge_es_autonomo`, `conyuge_ingresos_brutos`, `conyuge_gastos_deducibles`, `conyuge_cuota_autonomos`, `conyuge_retenciones`. Migración: `prisma/sql/2026-06-23_pilar_autonoma.sql`.
- **`getResumenPilar(cuentaId, year, quarter)`** en `lib/finanzas.ts`: 4 queries paralelas — totales (cobros/gastos_prof/cuota_ss), clientes top, evolución mensual, recientes. Calcula concentración (>75% = alerta Hacienda), Modelo 130 por trimestre, badges de plazo (✅/🟡/⬜). Fechas M130: Q1→20 abr · Q2→20 jul · Q3→20 oct · Q4→30 ene.
- **`compararDeclaracion()`** en `lib/fiscal-deducciones.ts`: conjunta vs separada — cuota ambas, ahorro y recomendación. **⚠️ Firma corregida en PR #686 (02/07/2026):** recibe `retencionesTitular` (retenciones REALES — antes estimaba 15% de TODA la base e inventaba miles de € de pagos a cuenta) y `baseTitular` debe llegar **SIN** la reducción por conjunta (la función la aplica ella sola; pasarla ya reducida la duplicaba). El route pasa `fiscal.baseImponibleSinReduccion` + `correduria.retencionesEstimadas`.
- **`/finanzas/pilar`** (page.tsx + PilarClient.tsx): KPIs morado, evolución mensual, Modelo 130 por trimestre, tabla clientes con alerta concentración (banner naranja si >75%), movimientos recientes con badges subcategoría.
- **`/finanzas`:** card compacta "🟣 Actividad de Pilar" en el grid de accesos rápidos → enlace a `/finanzas/pilar`.
- **`/api/finanzas/perfil`:** GET/PUT incluye los 5 campos `conyuge_*`.

## Sidebar Finanzas — Gastos/Fiscal/Proyección (01/07/2026, PR #646)
`UserSidebar.tsx` (grupo *Mi negocio*) ya no enlaza `/finanzas`, `/finanzas/tarjeta-credito`,
`/correduria` ni `/apartamentos` — esas rutas **siguen existiendo y funcionando** (no se
borraron páginas), solo se quitaron del menú. En su lugar hay tres ítems nuevos:
- **`/finanzas/gastos`** (`GastosPageClient.tsx`): filtros trimestre/mes/rango libre desde–hasta,
  4 buckets de deducibilidad, reutiliza `GastosTab` extendido y `getGastosControl(desde?, hasta?)`.
  **Rendimiento (PR #666, 02/07/2026):** `GastosTab.tsx` es el patrón de referencia para listas
  largas — buckets cerrados por defecto con **montaje perezoso** (las filas NO se renderizan hasta
  abrir; un `<details>` cerrado igualmente montaba todo el DOM), paginación client-side de 50 filas
  + «Ver más» (+100), auto-apertura con filtros activos, y recargas tras una acción que mantienen la
  lista visible atenuada en vez del loader a pantalla completa. NO volver a `<details open>` ni a
  renderizar todos los movimientos del periodo de golpe.
- **`/finanzas/fiscal`** (`FiscalPageClient.tsx`): barra visual de tramos IRPF con cursor + alerta
  de proximidad al siguiente tramo, bloque **«🧾 Mi declaración»** (PR #686, 02/07/2026 — carga solo,
  sin botón): cards **📍 Hoy** y **🔮 Fin de año (estimación)**, cada una con filas 👤 Solo yo /
  🤝 Conjunta con Pilar (✓ mejor) + palanca de gasto (ahorro por 1.000 € deducibles al marginal,
  gasto para bajar de tramo antes del 31/12, aviso de que NO hay efecto acantilado entre tramos).
  `GET /api/finanzas/comparativa` devuelve `{hoy, finAnio, bases, palanca, mesesRestantes}` (contrato
  NUEVO del PR #686; la proyección sale de `lib/proyeccion-fiscal.ts::getProyeccionFiscal()`, helper
  extraído del route de proyección — reservas futuras sivra + patrones recurrentes). Además: desglose
  deducciones/retenciones y tabla trimestral. (El tracker Modelo 179 se ELIMINÓ el 03/07/2026, PR #698:
  el 179 lo presentan las plataformas intermediarias tipo Booking/Airbnb, no el propietario/cedente.)
- **🧭 Consejo breve «Qué haría yo» ARRIBA de «Mi declaración» (22/07/2026, PR #1072):** helper PURO y
  **DETERMINISTA sin IA** `lib/consejo-fiscal.ts::consejoFiscal(estado, hoy)` — cifras del propio
  `EstadoDeclaracion` (cero riesgo de alucinar importes; patrón "determinista primero"). Da un titular en
  llano (vas camino de pagar/que te devuelvan X en la modalidad recomendada) y, si sale a pagar y el
  ejercicio sigue abierto, una **PROVISIÓN de tesorería** = importe / meses hasta junio del año siguiente
  (`mesesHastaPagoRenta`) → "aparta ~Y€/mes y no te llevas el susto en la campaña". NO repite la palanca de
  tramo (ya la da la tarjeta verde). Componente presentacional compartido
  `app/(usuario)/finanzas/ConsejoFiscalBox.tsx` enchufado en las DOS puertas: `FiscalPageClient.tsx`
  (`/finanzas/fiscal`) y `banca/FiscalResumen.tsx` (segmento 🧾 Fiscal de `/banca`) → no se desincronizan.
  Umbral mínimo 300€ para sugerir provisión; sin cambios de BD/endpoints. 7 tests en `lib/consejo-fiscal.test.ts`.
- **`/finanzas/proyeccion`** (`ProyeccionClient.tsx`): KPIs base real/futura/proyectada,
  reservas futuras sivra (`incomes WHERE "checkIn" > hoy`) vía `GET /api/finanzas/proyeccion`,
  simulador "¿qué pasa si…?" client-side, alerta <8.000€ del siguiente tramo.
- **`CategoriasTab.tsx`** (dentro de `/finanzas`, PR #639-#642 mismo rango) ganó drill-down por
  comerciante (`getMerchantsForCategoria()` en `lib/finanzas.ts`, rutas
  `GET /api/finanzas/categorias/comerciantes` e `insights`), panel "✨ Análisis IA" on-demand y
  botón "🤖 Auto-clasificar" (`POST /api/finanzas/categorias/auto-tag`).
- **Categorización AUTOMÁTICA de gasto personal (06/07/2026, rama `claude/ia-categorization-issue-6a534b`):**
  fuente ÚNICA **`lib/subcategoria-barrido.ts`** (`barrerSubcategoriasPersonal`) — keyword primero (gratis)
  + IA de la pasarela GRATIS solo para lo ambiguo, y **rescata `otros_gasto`** (`subcategoria IS NULL OR
  ='otros_gasto'`). La usan la ingesta (`analizarMovimientos` reparte por keyword), el cron diario
  `categorizar-movimientos` (`0 7 * * *`) y el botón `auto-tag`. **`lib/categoria-ia.ts` (Anthropic de pago)
  ELIMINADO**; `normalizarContraparte`→`lib/normalizar-contraparte.ts`. Baja confianza → columna
  **`subcategoria_revisar`** (≠ `requiere_revision`, que es del destino) → panel "🔎 Por revisar" (`?revisar=1`).
  Taxonomía **🏠 Vivienda** (Montecarmelo): subcategorías `comunidad`/`ibi` + `GRUPO_VIVIENDA` en
  `lib/categorias-personales.ts`. Extras: panel "sin clasificar grandes" (`?orden=importe`), badge ±% mes vs
  media 6m, presupuestos con Telegram scoped por `cuenta_id` (`categoria_alertas.cuenta_id`, migración
  `2026-07-06_subcategoria_control.sql`, aviso proactivo desde el barrido). ⚠️ `subcategoria` es el eje de
  gasto PERSONAL (`destino='personal' AND importe<0`), distinto de `categoria`/PGC.
- **Reestructura "💸 En qué gasto" (07/07/2026):** la pestaña 📊 Categorías pasó a llamarse **"En qué gasto"**
  en el sidebar (icono 💸, tras Banca) y 🧾 Gastos → **"Deducciones"** (separa eje personal vs fiscal).
  Estructura: titular del mes (total + ±% vs media 6m) → **UNA** cola "🔎 Necesitan tu atención"
  (`?atencion=1`, fusiona los 3 paneles antiguos) → dona → categorías (grupo Vivienda) → comercios; insights/
  alertas al fondo; sin tabla de Ingresos. Drill-down de comercio filtra por subcategoría (`?categoria=`).
  Comercio derivado con **`lib/comercio.ts::comercioDe`** (quita prefijo "COMPRA EN…"; fusiona filas con/sin
  contraparte); `getMerchantsForCategoria` agrupa en JS por él; `movimientos`/`asignar` casan igual.
- **Formato de dinero (regla global):** todo importe en € usa **`lib/dinero.ts::eur`** → `2.162,49€` (español,
  € detrás, millar con punto también en 4 cifras). Pantalla + Telegram + email. Nada de `€${x.toFixed(2)}`.
- **Recurrentes conocidos ya revisados (07/07/2026) — NO re-preguntar:** el diccionario `lib/subcategoria-keywords.ts`
  ya cubre los recibos fijos de la vivienda Montecarmelo y otros recurrentes de Alberto. Mapeos confirmados:
  `MONTECARMELO`/`MONTE CARMELO` → **comunidad** (recibo comunidad ~110€/mes); `TOTAL GAS Y ELECT`/`TOTALENERGIES`
  → **suministros_piso**; `TEMU`/`SHEIN` → **ocio**; `TUSSAM`/`SEVICI` → **transporte**; `PRIMAPRIX` → **supermercado**.
  El **IBI** y tributos MUNICIPALES están en `ibi` (` IBI `, patronato/recaudación, tasa basura, `AYTO. SEVILLA`).
  Amazon lo escribe el banco como `AMZN Mktp` → `AMZN` va a **ocio** (no casaba con `AMAZON`).
  Al reclasificar histórico usar SQL **set-based** (WITH scope + ILIKE + `CASE`), NUNCA transcribir UUIDs a mano.
- **Categoría `impuestos` (IRPF/Hacienda estatal) — 07/07/2026:** los pagos de la RENTA (IRPF de junio +
  2º plazo de noviembre, ~20k) NO son consumo del día a día; tienen su propia subcategoría `impuestos`
  (🧾) DENTRO de personal (`destino='personal'`), para que se vean pero no inflen ninguna categoría de
  consumo. Keywords ESPECÍFICAS (`IMPUESTO DE HACIENDA`, `TRIBUT HACIENDA`, `AGENCIA TRIBUTARIA`, `AEAT`,
  ` IRPF `) — NO usar `HACIENDA`/`IMPUESTO` a secas (chocarían con IBI `IMPUESTO BIENES INMUEBLES` o con un
  local llamado 'Hacienda …'). Ojo: la **cuota de autónomos TGSS** es profesional (`destino` ≠ personal),
  NO va aquí. Los **Bizums** a personas se dejan sin categoría de consumo (agrupados como 'Bizum').
- **Bizums unificados:** `comercioDe` devuelve un único grupo **"Bizum"** para cualquier envío Bizum
  (`\bBIZUM\b`), en vez de partirlos por destinatario — así el total enviado por Bizum se ve de un vistazo.
  **Subcategoría propia `bizum` (18/07/2026):** además del agrupado por comercio, cada movimiento Bizum
  (gasto) lleva `subcategoria='bizum'` — regla PRIMERA prioridad en `lib/subcategoria-keywords.ts`
  (gana siempre, antes que cualquier keyword de otra categoría, porque el motivo libre del Bizum puede
  mencionar cualquier cosa: "ENVIO BIZUM padel" NO es deporte) + asignada ya en la ingesta por
  `lib/destino.ts`. Solo gasto (Bizum enviado); los recibidos siguen en `otros_ingreso`.
- **Keyword AUTORITATIVO + la IA gratis NO es de fiar (07/07/2026):** la pasarela IA gratis metía
  gasolineras/súper/tributos dentro de 'seguro' con confianza alta. Regla nueva: **la keyword manda**.
  `barrerSubcategoriasPersonal` barre ahora TODO el gasto personal (no solo NULL/otros_gasto) y el paso
  keyword **SOBREESCRIBE** la etiqueta cuando discrepa; la IA solo ve lo que la keyword no clasifica y
  nunca pisa una etiqueta ya puesta. El re-barrido histórico se hace por SQL generado DESDE el
  diccionario real (`reglasOrdenadas()` → CASE ILIKE con `translate()` para plegar acentos y bordes de
  espacio), NUNCA duplicando el diccionario a mano. Si Alberto recategoriza a mano algo que una keyword
  contradice, la vía correcta es **añadir/ajustar la keyword**. Prioridad de comercio específico sobre
  categoría genérica: `CIRCULO MERCANTIL` (club) va ANTES que `deporte` aunque el recibo diga 'GYM'.
- **`destino='personal'` en TODO el eje personal:** las queries de "En qué gasto" (cabecera, drill-down
  de movimientos Y `getMerchantsForCategoria` en `lib/finanzas.ts`) filtran `COALESCE(destino,'personal')
  ='personal'`. Sin ese filtro, costes profesionales que comparten subcategoría (cuota autónomos TGSS,
  tributos del negocio…) se colaban en el desglose personal y descuadraban el contador de la cabecera.

**`/finanzas` desmantelada a lo no-duplicado (02/07/2026, Fase 1 des-duplicación):** sus tabs
Gastos y Fiscal eran copias 1:1 de `/finanzas/gastos` y `/finanzas/fiscal` (byte a byte, por eso
un fix a una se quedaba corto de la otra) — **borradas**. `FinanzasClient` ya solo sirve **Ingresos**
y **Categorías** (contenido único); `?tab=gastos|fiscal` redirigen a las páginas nuevas; el KPI
"Base imponible est." de cabecera se quitó (vive en `/finanzas/fiscal`).

## Deducciones de cuota IRPF (01/07/2026, PR #647)
3 tipos de deducción de cuota (nivel 2 — reducen cuota directamente, no base imponible):
- **Mecenazgo** (`tipo='mecenazgo'`): Ley 49/2002 — 80% primeros €150 + 40% resto. Donativos a entidades certificadas.
- **Guardería** (`tipo='guarderia'`): Art. 81bis LIRPF — hasta €1.000 adicional para hijos <3 años en centro autorizado.
- **Deportiva Andalucía** (`tipo='deportiva_and'`): D.A. 1ª Ley 7/2021 — 15% sobre base máx. €100 = máx. €15.

**BD nuevas columnas** (migración `2026-07-01_deduccion_cuota.sql`):
- `movimientos_bancarios.deduccion_cuota_tipo TEXT` — tipo asignado al movimiento.
- `banca_destino_reglas.deduccion_cuota_tipo TEXT` — aprendizaje por comercio.
- `fiscal_perfil.gasto_deportivo_anual NUMERIC(10,2)` — acumulado año para el límite deportivo.

**`lib/categorizar.ts`**: `detectarDeduccionCuotaTipo(concepto, contraparte)` — heurística automática al ingestar movimientos.
**`lib/fiscal-deducciones.ts`**: `gastoDeportivoAnual` en `PerfilFiscal`; `deduccionDeportiva()`; tramo mecenazgo corregido (80%/€150, 40% resto; el límite real de Ley 49/2002, no el antiguo 35%).

**`GastosTab.tsx`**: badge verde por tipo de cuota, tracker de ahorro fiscal estimado vs límites, selector inline de tipo.

**API routes:**
- `POST /api/banca/deduccion-cuota` (`{id, tipo}`) — asigna tipo, aprende regla, sincroniza `fiscal_perfil`.
- `POST /api/finanzas/gastos/revisar-cuota-batch` — barre movimientos personales sin tipo, aplica reglas + heurística, sincroniza `fiscal_perfil`.
- `POST /api/cron/pre-renta` — cron 1 marzo 9:00 CEST (`0 9 1 3 *` en `vercel.json`) — informe deducciones año anterior + consejo IA → Telegram.

**Webhook Telegram**: prefijo `deduccion_` ANTES del bloque `mov_`. Handlers: `deduccion_mecenazgo:<id>`, `deduccion_guarderia:<id>`, `deduccion_deportiva:<id>`, `deduccion_ninguna:<id>` (todos aprenden regla + sincronizan `fiscal_perfil`).

