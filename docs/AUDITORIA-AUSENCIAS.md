# 🕳️ Auditoría: afirmar ausencias no comprobadas (30/07/2026)

> **Regla que audita:** «Dato que NO hay ≠ dato que NO se ha mirado» (`CLAUDE.md` raíz).
> Un `NULL`/`[]`/`0` que significa «todavía no se sabe» y se pinta como «no hay»
> convierte un hueco de datos en una afirmación falsa — y son justo las
> afirmaciones sobre las que se decide.

**Origen:** Alberto detectó que la ficha de la subasta `SUB-JA-2026-263723` decía «sin documentos
adjuntos» mientras el BOE publicaba su edicto Y su certificación de cargas (PR #1180). El barrido
posterior buscó el mismo patrón en todo el monorepo. Esto es el inventario resultante.

**Cómo leerlo:** ✅ arreglado en el PR #1180 · ⬜ pendiente. Dentro de cada bloque, por gravedad.

---

## 🔴 Gravedad alta — seguridad, operativa en producción o dinero

| Estado | Dónde | Qué afirma en falso |
|---|---|---|
| ✅ | `apps/ialimp/app/l/page.tsx` | Un 500 o un corte de red pintaba **«Sin limpiezas este día · ¡Descansa!»**. El `catch {}` estaba vacío y `!r.ok` ni se comprobaba. No solo informaba mal: **ordenaba no trabajar**, con el piso sin limpiar. Ahora hay estado de error explícito y botón de reintentar. |
| ✅ | `apps/plataforma/lib/subastas/documentos.ts` | Si la ficha del BOE respondía 200 pero no era la ficha (WAF, error, mantenimiento), se grababa `documentos='[]'` + `notas_edicto=''` y **la cola no volvía a mirarla nunca**. Guard nuevo `fichaLegible()` (puro, testeado): si no es la ficha, lanza y la fila se queda en «sin revisar». |
| ✅ | `packages/module-subastas/src/analisis.ts` | `notas_edicto=''` («procesado sin hallazgos») ponía el semáforo 🟢 **habiendo leído cero caracteres** (todos los adjuntos escaneados, o ficha sin adjuntos). Ese semáforo viaja por Telegram y decide si se puja. Ahora el análisis recibe el listado de adjuntos y exige que se haya leído alguno. |
| ✅ | `apps/plataforma/lib/banca.ts` (`getSaldoConsolidado`) | Una cuenta cuyo saldo el banco no devolvió sumaba **0 €**. Ese total va al email de aviso de tesorería afirmando «Saldo actual del grupo: X» → alarma falsa o dinero escondido. Ahora se cuentan aparte (`sinSaldo`) y el email avisa de que la cifra es un mínimo. |
| ✅ | `apps/plataforma/lib/banca.ts` (`enviarResumenTarjeta`) | Si fallaba la consulta de dudosos, el Telegram del extracto decía **«✅ todos clasificados»** — y es el único aviso que se recibe. Además contaba como «clasificados» los cargos con `destino` NULL. |
| ✅ | `apps/transporte` (semáforo documental) | Un vehículo **sin ITV ni seguro registrados** no genera alerta de caducidad → «Sin caducidades próximas. **Todo en regla ✅**». El camión con la ITV sin dar de alta era precisamente el que salía verde. Nueva `vehiculosSinDocumentar()` (pura, testeada). |
| ⬜ | `apps/ialimp/app/api/admin/ia/briefing/route.ts` | «Sin sesiones programadas hoy» / «Equipo completo» / «Stock OK» sobre tablas que **solo** puebla el sync del PMS. El prompt además pide al LLM `Si todo va bien, dilo con confianza`. `Stock OK` tiene un fallo extra: `stock_actual <= stock_minimo` con `stock_actual` NULL es NULL en SQL → el producto nunca inventariado no entra y cuenta como suficiente. |
| ⬜ | `apps/ialimp` — `ultimo_sync` vs `last_sync_at` | `app/api/pms/sync` escribe `last_sync_at`, pero el dashboard lee **`ultimo_sync`** (que por tanto está siempre NULL): la fecha de última sincronización **nunca se muestra** y solo queda el chip verde «● Activo». `sync_error IS NULL` no es «fue bien», es «no consta error» — incluye «lleva tres semanas muerto». **Este es el que hace indetectables los dos anteriores.** |
| ⬜ | `apps/plataforma/lib/agente-facturas/pagos.ts` | `catch { return 0 }` en el escaneo IMAP: app-password rotada o etiqueta renombrada = «0 facturas nuevas». Aguas abajo el chat afirma **«No tienes facturas de proveedor pendientes 🎉»** y el resumen semanal calla. `lib/monitoring/latidos.ts` excluye a propósito esta tabla de los latidos → el agente se queda **sin ningún heartbeat**. |
| ⬜ | `apps/plataforma/lib/psd2.ts` | Un 401/429/timeout de Enable Banking da `[]` movimientos **y aun así actualiza `ultimo_sync = now()`**: la marca de frescura miente. Ese 0 alimenta saldo, P&L, cuadre OTA, correduría y cuadre de tarjetas. |

## 🟠 Gravedad media — decisiones de negocio

| Estado | Dónde | Qué afirma en falso |
|---|---|---|
| ✅ | `apps/sivra/lib/pilot-track.ts` | Sin p50 de mercado concluía **«NO estamos caros»** (se autodelataba imprimiendo `(huésped ?€ ≤ mercado)`) → no se baja el precio y el piso sigue vacío porque sí estaba caro. Ahora dice que no se puede saber. |
| ✅ | `apps/plataforma/app/api/subastas/route.ts` | El filtro «sin 🔴 problema» usaba `semaforo IS DISTINCT FROM 'rojo'`, que es TRUE para NULL → colaba las subastas **nunca analizadas** entre las comprobadas limpias. |
| ✅ | `apps/rrhh/lib/solicitudes.ts` | `parseDiasVacaciones(...) ?? 30` **inventaba una condición de convenio** y se la enseñaba al trabajador como su saldo. Si su convenio da 22 días laborables, el portal le prometía 30 naturales. Ahora `null` + aviso «convenio sin cargar». |
| ⬜ | `apps/plataforma/app/(usuario)/finanzas/GastosTab.tsx` y `banca/NegociosResumen.tsx` | **«❗ N deducibles sin justificante»** incluye todo lo que el cron diario de Gmail aún no ha mirado. Todo gasto recién importado nace acusado, y el KPI da aspecto auditado a una ausencia no comprobada. |
| ⬜ | `apps/plataforma/app/api/banca/conciliar/route.ts` | `catch` → `{ok:true, conciliados:0, pendientes:0}`. «Todo conciliado» y «se cayó la consulta» son indistinguibles para el cliente. |
| ⬜ | `apps/plataforma/app/api/cron/health-check/route.ts` (Check correduría) | Exige **dos** condiciones para alarmar; si el sync de BBVA no trajo nada, ambas son 0 y emite `✅ Correduría: 0,00€ cobrado`. Es exactamente el incidente que motivó el check, presentado como verde. |
| ⬜ | `apps/plataforma/lib/adapters/ialimp.ts` | `catch { return [] }` → el panel afirma «sin clientes» ante un statement-timeout (ya pasó una vez, está documentado en el propio fichero). El adaptador de ia-rest sí es honesto en el mismo punto. Encadenado: `lib/notificaciones.ts` no avisa a nadie y nadie se entera. |
| ⬜ | `apps/ialimp/app/admin/page.tsx` y `apps/sivra/app/admin/limpiadoras/page.tsx` | **«Sin limpiezas programadas hoy 🎉»** sobre `d.sessions || []`. El emoji convierte un fallo de infraestructura en una felicitación. |
| ⬜ | `apps/plataforma/lib/finanzas.ts` (IVA soportado) | `cuota_iva IS NOT NULL` descarta en silencio las facturas cuyo IVA el OCR no extrajo, y el trimestre sale `0 €` en el export a la gestoría. No distingue «sin IVA soportado» de «sin facturas ingeridas». |
| ⬜ | `apps/plataforma/lib/trading/universo.ts` | `capex ?? 0`, `deudaLp ?? 0`, `caja ?? 0` **inflan** FCF yield y earnings yield justo en las empresas con estados incompletos, que son las que menos deberían puntuar. |

## 🟡 Gravedad baja — molesto, no decide

| Estado | Dónde | Qué afirma en falso |
|---|---|---|
| ⬜ | `apps/almacen/lib/publico.ts` | `LEFT JOIN` + `COALESCE(SUM(disponible),0)` → material **nunca inventariado** se muestra al cliente como **«Sin stock»** en el catálogo público, que promete «disponibilidad real». |
| ⬜ | `apps/rrhh/app/api/cron/alerta-jornada-maxima/route.ts` | `SUM(horas_totales)` descarta los NULL en silencio → un fichaje cerrado sin horas calculadas hace que no se alcance el `HAVING` y **no salte la alerta** de jornada máxima. El cron reporta «alertas: 0» por un dato no calculado, no por cumplimiento. |
| ⬜ | `apps/plataforma/app/(usuario)/banca/BancaClient.tsx` | `conciliado ?? false` → **«Sin conciliar»** (afirmación cerrada) donde lo honesto es «pendiente de conciliar». |
| ⬜ | `apps/plataforma/app/(usuario)/concursos/page.tsx` | `lotes: num(obj.lotes) ?? 0` (extracción por IA del pliego) → **«Sin lotes»**. La ficha ya sabe decir `'—'` para lo desconocido en los campos de al lado. |
| ⬜ | `apps/plataforma/app/(usuario)/sivra/pricing-auto/page.tsx` | `resultados?.total_extra_eur ?? 0` pintado en **verde de éxito**: «+0€ · 0 noches» es el veredicto sobre si merece la pena tener el agente encendido, dicho con un dato que no se pudo leer. |
| ⬜ | `apps/plataforma/lib/contable/proactivo.ts` | Los tres contadores colapsan error → 0. Si fallan todos, silencio total, que en un agente proactivo se lee como «no tengo nada que decirte». |
| ⬜ | `apps/plataforma/app/admin/MapaArquitectura.tsx` | `depsModulos[id] || []` → «Ninguno — módulo independiente (puro)» para un package que simplemente **no está indexado**. |

## 🧱 Deuda de esquema — el NULL ni siquiera es representable

Columnas `NOT NULL DEFAULT false/0` en las que «no lo hemos mirado» y «no hay» son literalmente el
mismo valor. Cambiarlas exige migración + backfill, por eso van aparte:

| Estado | Columna | Por qué importa |
|---|---|---|
| ⬜ | `subastas.arrendamiento_inscrito` | Un inquilino inscrito destruye el flip. Hoy `false` significa a la vez «no hay» y «no lo hemos leído». |
| ⬜ | `mercado_comparables.bajadas` | `0` = «nunca ha bajado» ≡ «solo se ha visto una vez». |
| ⬜ | `movimientos_bancarios.requiere_revision` | Ya documentado como landmine (PR #906); no puede expresar «no evaluado». |
| ⬜ | `trading_tesis.operada` | No puede expresar «pendiente de comprobar». |
| ⬜ | `ai_usos.tokens` / `.coste_eur` | No distinguen «llamada sin coste» de «coste no medido». |

---

## Patrones de referencia (copiar de aquí, no reinventar)

Estos sitios del propio repo ya lo hacen bien y sirven de plantilla:

- **`apps/plataforma/lib/subastas/resumen-docs.ts`** — separa explícitamente `null` (sin revisar) de
  `[]` (revisado, no hay), con un flag para las fuentes que nunca traerán el dato. Puro y testeado.
- **`apps/plataforma/lib/empresas-senales.ts`** — un guard `!= null` por señal: si no hay dato, la
  señal simplemente no se emite. Nada se aplana.
- **`apps/plataforma/lib/subastas/tesoreria.ts`** — `AND saldo_actual IS NOT NULL` en vez de sumar
  ceros, más un flag `desactualizado` explícito.
- **`packages/module-subastas/src/tesoreria.ts`** — los compromisos que no se pueden calcular salen
  en `incompletos[]` en vez de contarse como 0.
- **`apps/plataforma/lib/monitoring/latidos.ts`** y **`lib/agentes-salud.ts`** — sin telemetría
  devuelven alerta / `gris`, nunca verde.
- **`apps/sivra/lib/pilot-track.ts`** (guard de `windowNights`) — «Datos insuficientes: NO
  afirmamos nada» como veredicto de primera clase.
