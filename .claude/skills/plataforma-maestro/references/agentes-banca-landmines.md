# PLATAFORMA — agentes, banca/correduría y landmines

## Agente facturas proveedores (PRs #605+#606, 30/06/2026)
- **Flujo:** Gmail IMAP (carpeta `FACTURAS_PENDIENTES`) → OCR `aiVision` → upsert `facturas_proveedor` (dedupe por número) → Telegram botones `pago_aprobar/rechazar/aplazar` → Enable Banking PIS (`POST /v3/payments`, JWT RS256) o SEPA XML pain.001.001.03 → auto-conciliación con `v_movimientos_activos` (cruce proveedor+importe+fecha±3d).
- **Módulo puro `@central/module-pagos`** (`packages/module-pagos`): tipos `FacturaProveedor`/`EstadoFactura`/`PagoParams`, generador `generarSepaXml()`, `validarIban()`. Sin BD ni secretos.
- **`lib/agente-facturas/pagos.ts`**: `escanearNuevasFacturas(cuentaId)`, `aprobarPago(facturaId)`, `aplazarPago(facturaId,dias)`, `rechazarFactura(facturaId)`, `verificarPagosPendientes()`, `conciliarConBanco(cuentaId)`, `pagarTodo(cuentaId)`, `resumenSemanal(cuentaId)`, `alertarFacturasAusentes(cuentaId)`.
- **`lib/enablebanking.ts`**: `iniciarPago()`, `estadoPago()`, `disponiblePis()`. Flag `EB_PIS_ENABLED=true` activa PIS (off por defecto).
- **Telegram** (prefijo `pago_`): `aprobar:<id>`, `rechazar:<id>`, `aplazar:<id>`, `pagartodo:<cuentaId>`, `revisarunauna:<cuentaId>`, `vincular:<facturaId>:<propertyId>:<checkOut>`, `novinc:<facturaId>`. Manejados en `app/api/sivra/mensajes/telegram-webhook/route.ts`.
- **Vínculo factura↔reserva**: tras scan, si hay checkout en `incomes` ±2d de la fecha factura → Telegram "¿Asociar con estancia X?" → guarda `reserva_id='propertyId:checkOut'` en la fila.
- **IVA soportado**: `lib/finanzas.ts::getResumenFinanciero` suma `cuota_iva` de `facturas_proveedor WHERE estado='pagada'` al `ivaSoportado` de cada trimestre.
- **Crons** en `vercel.json`: `facturas-scan` `15 6 * * *` + `facturas-resumen-semanal` `15 9 * * 1`.
- **API routes**: `POST /api/banca/pago/{aprobar,rechazar,aplazar}`, `GET /api/banca/pago/callback` (exento en `middleware.ts`), `GET|PUT /api/banca/pago/presupuesto`.
- **Fase 3 backlog** (no implementada): foto ticket (`photo` en webhook Telegram), aplazar con email (`core-email`, col `email_proveedor`), scoring proveedores (vista `v_scoring_proveedores`), pago fraccionado (>€500).
- **Envs pendientes (Alberto):** `EB_PIS_ENABLED=true`, `EB_DEBTOR_IBAN=<IBAN Kutxabank>`.

## Agente de gastos SIVRA — bandeja `/expenses/pendientes` y reglas aprendidas
**Vive en `apps/plataforma/lib/agente-facturas/*`** (la copia bajo `apps/sivra` es legado MUERTO: el cron
lo despacha `lib/cron-dispatch.ts` → `/api/sivra/expenses/agent/scan`, ruta de plataforma). Flujo por
factura: extraer → **huella** (`fingerprint.ts`) → **regla** (`gastos_reglas`) → `evaluar()` decide
`auto` (se imputa a `gastos` con `revisado=true`) o `bandeja` (`revisado=false` + `motivo_revision`).
Confirmar en la bandeja (`PATCH /api/expenses/pendientes/[id]`) llama a `reforzarRegla`.

- 🚨 **La huella es el NIF, no el nombre (26/08/2026).** `fingerprint()` usa `normalizaNif(nif_proveedor)`
  y **solo cae al nombre si no hay NIF**. Consecuencia contraintuitiva: un proveedor con AÑOS de histórico
  puede salir como **«Proveedor nuevo, sin regla aprendida»** para siempre si las filas viejas se
  importaron a mano sin NIF ni `fingerprint` (`proveedor:'Importado'`). Pasó con **DIGI** (NIF A84919760):
  ene/feb-2026 imputados a mano, y desde julio la bandeja lo marcaba «nuevo» cada mes. **Antes de tocar el
  motor de reglas por un «no aprende», mira si las filas del histórico tienen `fingerprint` y `nif_proveedor`
  — casi siempre el fallo está ahí, no en `evaluar()`.**
- **Una confirmación NO basta: `MIN_VISTAS = 2`.** La regla nace con `vistas=1` y sigue mandando a la
  bandeja («Regla aún sin historial confirmado»). Solo auto-imputa con `vistas>=2` Y el total dentro de
  `[importe_min, importe_max]` (por defecto ±10% del esperado).
- 🚨 **Archivar en Drive ≠ imputar (26/08/2026).** Se encontraron 4 facturas de DIGI (mar–jun 2026) con el
  cargo cobrado en el banco y **sin fila en `gastos`**; el PDF venía adjunto al aviso del proveedor y el de
  abril llevaba desde el 28/04 archivado en Drive. El agente archivó y no imputó, sin dejar rastro en
  `agente_log`. **El archivo en Drive no es prueba de que el gasto esté contabilizado**: para saber si falta
  algo, cruza `movimientos_bancarios` contra `gastos` por proveedor+importe, no mires Drive.
- **El aviso de Telegram cuenta las de ESA pasada, no la bandeja entera** (`avisaBandeja(items)` recibe los
  pendientes del escaneo). Un «🧾 1 factura en la bandeja de revisión» puede convivir con ~30 acumuladas:
  para el estado real, `SELECT … FROM gastos WHERE revisado=false AND origen IS NOT NULL`.
- **Etiqueta `prop_multi_apartamentos` = «Gastos compartidos», y el P&L por piso la EXCLUYE**
  (`lib/sivra/pl-mensual.ts`). Un gasto ahí es deducible pero no aterriza en ningún piso; el reparto por
  piso se hace sobre el MOVIMIENTO bancario (`movimiento_reparto`), no sobre la fila de `gastos`.
  ⚠️ `GET /api/finanzas/gastos/reparto-sugerido` reparte entre **TODOS** los pisos por huéspedes-mes: vale
  para lavandería/limpieza (consumo que escala con huéspedes), **no** para una cuota fija que no todos los
  pisos usan — el Dúplex tiene su propio internet (regla `internet:prop_duplex_center`, 20,90€) y una
  sugerencia automática le cargaría parte de la factura de DIGI.

## Módulo banca y finanzas (18/06/2026)
- **`lib/destino.ts`** (puro, testeable `node --test`): clasifica el destino de un movimiento. En ABONOS recibidos (Norma 43), la contraparte es el TITULAR propio → clasificar por CONCEPTO, NO por nombre (de lo contrario, las comisiones de seguros quedan como 'traspaso_interno' y desaparecen del P&L). En CARGOS, el nombre sí identifica traspasos internos. `lib/categorizar.ts` reexporta.
  - **ABONOS de BBVA (23/06/2026):** los que casan comisión (`RE_COMISIONES`/`RE_SEGUROS`/`RE_LIQUID_SEGUROS` = saldo agente/remsaldo/saldo cuenta/pago saldo cta/PD005) → `seguros`; `RECIBIDO:` (Bizum particular) → `personal`; **Booking del Dúplex se reconoce por el marcador fiable `LIQ. OP. Nº`** (lo trae el feed PSD2) → `turistico_duplex`. Lo que **no casa nada** ya NO cae a Dúplex por descarte: va a `personal` + **`requiere_revision`** (`clasificarDestinoDetalle` → `{destino,revisar}`). **Cerrado "capturar el ordenante":** BBVA NUNCA lo da (ni Excel ni PSD2, que pone el titular en `debtor.name`); el discriminante es `LIQ. OP.`. Excel↔PSD2 se solapaban → depurado el doble conteo (22 cobros, 8.459€; `prisma/sql/2026-06-23_dedupe_booking_psd2_xls.sql`). El cuadre `/cuadre-booking` cuenta por `destino`, no por el concepto.
- **Correduría `/correduria`** (`app/(usuario)/correduria/`; **ya no está en el sidebar** desde el
  01/07/2026 — accesible solo por URL directa, ver sección "Sidebar Finanzas" más abajo): matriz comisiones por compañía×mes desde `movimientos_bancarios` con `destino='seguros'`. **La correduría es SIEMPRE BBVA** — `lib/destino.ts` solo asigna `seguros` en BBVA; un recibo de aseguradora en Kutxa/otros es seguro PROPIO (coche/hogar) → `personal` (o `turistico_pisos` si es de un piso). No clasificar `seguros` fuera de BBVA. `lib/correduria.ts` (puro): `detectarCompania`, `motivoSeguros`, `claveReferencia`, `COMPANIAS_CONOCIDAS`. Importe formato `1.543€`; celdas clicables → desglose (`/api/correduria/detalle`) con confirmar/reclasificar.
  - **Aprendizaje (clave de referencia → …):** dos tablas en BD compartida. `correduria_reglas (cuenta_id,clave,compania)`: al asignar compañía en el desglose se aprende por código (M1454→Asisa, M00171/8-92361→Occident, PD005→Caser) y se aplica a todos los iguales. `banca_destino_reglas (cuenta_id,clave,destino)`: al sacar de seguros ("No es de seguros") se aprende el negocio (p.ej. DNI de la pensión→personal). `lib/categorizar.ts` consulta `banca_destino_reglas` al ingestar; matriz/detalle consultan `correduria_reglas`. Override por movimiento: columna `movimientos_bancarios.compania_seguros`.
  - **🚨 LANDMINE — reglas aprendidas NUNCA con clave genérica (12/07/2026, PR #840):** `banca_destino_reglas` se aplica por **SUBSTRING** y con **prioridad sobre `destino.ts`**. Una regla-trampa `"TRANSF"→turistico_pisos` (substring de "TRANSFERENCIA RECIBIDA") secuestró TODAS las transferencias entrantes de BBVA → la correduría cobró **0€ en silencio** (el agente contable lee `destino='seguros'` y tampoco las veía). Guardia obligatoria **`lib/correduria.ts::claveReglaValida()`** en todos los puntos de aprendizaje + como filtro al aplicar (`categorizar.ts`). Borrar reglas malas desde el panel «🧠 Reglas aprendidas» de `/banca` (`/api/banca/reglas`). `RE_LIQUID_SEGUROS` (destino.ts) debe conocer los mismos códigos de agente que `detectarCompania` (M00171/M1454/8-92361/`SALDO. <cód>`). Saneo: `prisma/sql/2026-07-12_limpiar_reglas_destino.sql`.
  - **Ver TODOS los movimientos (PR #840):** `/banca` = libro completo. `listarMovimientosLedger()` + `GET /api/banca/movimientos` (paginado servidor: cuenta/fechas/signo/texto), `MovimientosTabla` con «Ver más» + reclasificar el negocio EN LÍNEA por fila. Bandeja «🔎 Ingresos por revisar» (`listarIngresosPorRevisar`) para abonos con negocio sin confirmar (la revisión de gastos es solo `importe<0`). Health-check Check 10 vigila la correduría muda. **🚨 Invariante `requiere_revision` (PR #906, 15/07/2026):** ese flag es del DESTINO (no de categoría/subcategoría); confirmar destino DEBE limpiarlo y toda bandeja «por revisar» DEBE filtrar `destino_confirmado=false` — si no, un cargo ya confirmado sale como zombie (pasó con CORTEFIEL). Detalle+landmine en `apps/plataforma/CLAUDE.md`.
  - **`/banca` = cuadro financiero unificado + extras IA GRATIS (13-14/07/2026, PRs #882/#886-894/#900):** period-driven (`?year/quarter/desde/hasta`, default mes en curso) con `ResumenPeriodo.tsx` (reusa `getResumenFinanciero`), gráficas Recharts y P&L de pisos (`getPLMensual`). Paneles bajo demanda, todos con la regla "la IA solo sugiere/narra, los importes SIEMPRE salen de `lib/banca.ts`/`lib/finanzas.ts`": 🧾 Cazador de deducciones (`lib/cazador-deducciones.ts`), 💬 Mini-chat (embebe `/api/contable/chat`), 🤖 Sugerir por fila (`/api/finanzas/gastos/sugerir`), 📈 Benchmark entre pisos (`/api/banca/benchmark-pisos`), ✂️ Fugas en recurrentes (`/api/banca/fugas`), 🚨 Antifraude — **reglas DETERMINISTAS sin IA** (`/api/banca/antifraude`, reusa `lib/vigilantes-tarjeta.ts`), 📤 Cierre de mes narrado (`lib/resumen-mensual.ts`, cron día 1 08:00 `/api/cron/resumen-mensual`), 🛒 Tickets de súper F5a — OCR con IA de visión (`lib/tickets.ts`, `POST/GET /api/banca/ticket`, `TicketsSuper.tsx`; **⚠️ tabla `tickets_compra`/`tickets_lineas` aún sin aplicar por Supabase MCP** — el endpoint degrada mientras tanto). Pendiente: desviación explicada, aviso fiscal proactivo, foto de factura en banca, F5b comparador de precios de tickets. **`/finanzas/radiografia` ahora REDIRIGE a `/banca`** (14/07/2026, #900 — Banca es la puerta única; el componente `RadiografiaClient.tsx` no se borró, sigue reversible) y `periodoLabel`/`Periodo` viven en `app/(usuario)/finanzas/periodo.ts` (SIN `'use client'`) — no importar funciones de un módulo `'use client'` desde un server component.
  - **⚠️ LANDMINE — widgets resumen en el dashboard:** NO hacer GROUP BY sobre `compania_seguros` directamente en SQL. La compañía se resuelve en 3 pasos JS: `compania_seguros || reglas.get(claveReferencia(concepto)) || detectarCompania(...)`. Un GROUP BY en SQL solo ve el campo manual → todas las compañías detectadas por nombre/código caen en "Otras" y desaparecen del widget. La función `getResumenCorreduria` en `dashboard/page.tsx` aplica esta cadena sobre filas raw (PR #480, jun-2026).
- **`/sivra/facturas-control`** (sidebar Mis pisos → 🗂️ Facturas): estado mensual por proveedor recurrente (✅/⏳/❌). API `GET/POST /api/sivra/facturas-control`. Alerta `facturasFaltantes` en `lib/banca.ts::getAlertas` → banner dashboard.

## Landmines (no romper — detalle en CLAUDE.md)
- **🚨 INGRESO turístico POR PISO = tabla `incomes` (INGLÉS), NO el banco (11/07/2026):** el ingreso real por
  piso/reserva vive en **`incomes`** (`propertyId, date≈check-in, amount` NETO, `amount_gross`, `portal`, `nights`);
  gastos por piso en `expenses`/`gastos`. Enlace **`negocios.ref_ext` (`prop_*`) = `incomes.propertyId`**. Reutiliza
  **`lib/financiero.ts::getResumenSivra(anio, propertyId)`** — es lo que pinta el dashboard por negocio (cuadra
  al céntimo). El **banco (`movimientos_bancarios`) agrega todos los pisos en `destino='turistico_pisos'`** (el
  Dúplex además `turistico_duplex` solo en gastos) → **inútil para "ingreso del piso X"**. El agente contable
  hoy lee el banco → por eso "ingresos del Dúplex" daba 0; para responder por piso hay que leer `incomes`.
  **TRAMPA:** `propiedades`(español)/`propietario_ingresos`/`negocios "[seed-demo]"` son DEMO, no la contabilidad
  real. **Incidente:** se buscó por nombres en español, no salió `incomes` (inglés), se creó una tabla duplicada
  (`ingresos_negocio_mensual`, ya borrada). Antes de tocar ingresos: cargar `sivra-maestro` y buscar en inglés Y español.
- **🔐 Roles de BD — DEUDA DE SEGURIDAD (26/06/2026):** La BD compartida `wswbehlcuxqxyinousql` tiene 4
  roles de acceso: `prisma_sivra` (sivra), `rrhh_app` (rrhh), y **`postgres` (ialimp + plataforma + transporte
  — SUPERUSUARIO, deuda temporal tras resetear la contraseña al desplegar transporte)**. Hay 3 roles preparados
  DB-side sin contraseña: `prisma_ialimp`, `prisma_plataforma`, `prisma_transporte`. **PENDIENTE (Alberto):**
  asignar contraseña a los 3 y apuntar `DATABASE_URL`/`DIRECT_URL` de cada app a su rol propio + redeploy.
  Después rotar `postgres` y `prisma_sivra`. Hasta que se haga, las 3 apps se saltan RLS (no hay riesgo práctico
  ya que los handlers tienen scope de `cuenta_id`, pero es deuda).
- **`middleware.ts` deja pasar los crons por `CRON_SECRET`** (Bearer o `?secret=`) ANTES del gate de
  cookie de sesión. **Es lo que permite que corran los crons `/api/sivra/*`** (snapshot, apply-auto,
  updates/sync, mercado, guard, limpiadoras, mensajes…): el cron de Vercel llega sin cookie, y sin esa
  excepción se redirige **307 → /login** y el handler nunca se ejecuta (así estuvieron **5 días mudos**
  en jun-2026, #429). NO quitar esa excepción ni meter rutas de cron tras el gate sin el secreto. Los
  handlers ya revalidan (`isCronAuthorized` o `secretOk || getSession()`), así que no abre datos.
  Heartbeat de vigilancia: paso 2-bis de `/auditoria-diaria`.
- **ia-rest vive en la BD compartida** (schema `iarest`, cierre 19/08/2026), pero plataforma lo sigue
  leyendo por el **puerto HTTP** (aislamiento entre apps). NO acoples Prisma/SQL directo sobre `iarest.*`.
- **Adaptadores por vertical** (`lib/adapters/*`, contrato `VerticalAdapter`): ialimp+sivra → BD directa (SQL raw);
  iarest → puerto HTTP. **No se fusiona nada.**
- Sin `OPERADOR_SHARED_SECRET` correcto, el panel no ve los clientes de ia-rest (ialimp+sivra sí).
- 🏠 Mis propiedades: "Resumen" lee `properties` (sivra Smoobu), **NO** `propiedades` (multi-tenant limpiadoras).
- **Dashboard widgets vs páginas completas:** los widgets del dashboard usan funciones `getResumen*` en `dashboard/page.tsx` (Server Components). Estas funciones DEBEN replicar EXACTAMENTE la lógica de detección de las páginas/APIs correspondientes. No simplificar con SQL puro si la página aplica lógica JS post-query (p.ej. correduría aplica cadena manual→regla→auto en JS). Si el API route y el widget producen números distintos, el widget está mal.
- **Dedupe PSD2 = por CONTENIDO, NO por entry_reference (#524, 25/06/2026):** `lib/psd2.ts::hashMov` deduplica con `dedupe_hash` = `cuenta_bancaria_id|fecha|importe(2dec)|upper(trim(concepto))`. **NUNCA volver a usar el `entry_reference`/`accountUid` de Enable Banking como clave:** el banco (BBVA/Kutxa) los ROTA entre sesiones → el mismo movimiento reaparece con otro hash y burla el `ON CONFLICT (cuenta_bancaria_id, dedupe_hash)` (así se duplicaron cuota PTMO, recibos de tarjeta, etc.). El hash JS debe coincidir BYTE A BYTE con el backfill SQL (`prisma/sql/2026-06-25_psd2_dedupe_contenido.sql`); si tocas uno, toca el otro y re-backfillea. Matiz aceptado: dos movimientos idénticos el mismo día se colapsan en uno.
- **🚨 PSD2 cuenta fantasma — IBAN=UUID (30/06/2026, fix en PR #613):** En `lib/psd2.ts::sincronizarSesion()` el fallback `detalle?.iban || accountUid` usaba el UUID opaco de Enable Banking como IBAN cuando `getDetalleCuenta` fallaba. Ese UUID se insertaba como `cuentas_bancarias.iban`, creando una fila fantasma que **nunca colisionaba** con el IBAN real en `ON CONFLICT (sociedad_id, iban)` → doble `cuenta_bancaria_id` → el `dedupe_hash` (que incluye `cuenta_bancaria_id` como prefijo) generaba hashes distintos para los mismos movimientos → 75 duplicados en BD (mayo–jun 2026). **FIX aplicado:** guard `if (!/^[A-Z]{2}[0-9]{2}/.test(iban)) continue` antes del INSERT en `psd2.ts` — se salta la cuenta si el IBAN no tiene formato real; el siguiente sync lo creará con el IBAN correcto. **⚠️ LANDMINE permanente:** el `dedupe_hash` incluye `cuenta_bancaria_id` → NO detecta duplicados cross-cuenta (mismo movimiento importado bajo dos `cuenta_bancaria_id` distintos da hashes distintos y ambos entran). Si una cuenta se migra/duplica, hacer `UPDATE SET duplicado_estado='ignorado'` en la cuenta fantasma como limpieza manual.
- **🚨 Cuota RETA (TGSS) con `destino='personal'` en vez de `seguros` — zombies `destino_confirmado` (18/07/2026):**
  `lib/destino.ts` ya clasifica una cuota TGSS de Alberto en BBVA como `destino='seguros'` (deducible,
  Art. 30.2.1ª LIRPF), pero **4 movimientos** de 2026 (marzo-junio, 1.314,95€) tenían `destino='personal'`
  con `destino_confirmado=true` — quedaron fijados así ANTES de que existiera esa regla (o por un error
  manual) y nunca se volvieron a re-analizar: el flag `confirmado` los saca del camino de clasificación
  automática Y de la bandeja «por revisar», así que un backfill de datos es la única forma de arreglarlos
  (mismo patrón que el LANDMINE `requiere_revision` del PR #906, pero aquí en el flag `destino_confirmado`).
  Backfill: `prisma/sql/2026-07-18_fix_cuota_autonomos_personal.sql`. **Auditoría recomendada tras cualquier
  cambio a `lib/destino.ts`:** buscar en `movimientos_bancarios` filas `destino_confirmado=true` cuyo
  concepto casaría hoy una regla distinta a la que tienen — esas filas NUNCA se corrigen solas.
  **Bonus del mismo hallazgo:** una fila tenía `subcategoria='seguro_salud'` (código reservado a pólizas
  de correduría) con `destino='personal'` — `seguro_salud`/`cuota_autonomos` NO están en
  `SUBCATEGORIAS_GASTO` de `lib/categorias-personales.ts` (son subcategorías de NEGOCIO que
  `clasificarDestinoDetalle` asigna junto a `destino='seguros'`/`'actividad_pilar'`), así que si aparecen
  bajo `destino='personal'` en «En qué gasto» salen con el icono genérico "•" — es señal de fuga, no de
  categoría legítima. Corregida a `otros_gasto` (gasto médico puntual con tarjeta, no una póliza).
- **🚨 Duplicados cross-cuenta tarjeta↔corriente (01/07/2026, PR #640):** Kutxabank exporta los cargos de tarjeta en DOS extractos: el de la **cuenta corriente** (`tipo='corriente'`) Y el **propio de la tarjeta** (`tipo='tarjeta'`). Al importar ambos Excels la misma compra entra bajo dos `cuenta_bancaria_id` distintos → gastos duplicados. Incidente: 47 cargos duplicados, **3.764€ inflados** (backfill `2026-07-01_dedupe_cross_cuenta.sql` — marcó `duplicado_estado='ignorado'` en los de la corriente). **FIX en código:** `importarExtracto` tiene un nuevo bloque anti-dedup cross-cuenta: si se importa `tipo='corriente'` y ya existe el mismo (fecha, importe) en una `tipo='tarjeta'` de la misma sociedad (o viceversa), el de la corriente se marca ignorado. `getDuplicadosSospechosos` añade UNION cross-cuenta con etiqueta de cuenta (`DupMovimiento.cuentaLabel`). **REGLA:** `tipo='tarjeta'` gana siempre sobre `tipo='corriente'`. Esto es DISTINTO al LANDMINE anterior (cross-origen psd2 vs xls, que opera DENTRO de la misma cuenta).

## 🚨 Extracto de tarjeta + agente contable — 6 trampas del 08/08/2026 (PRs #1295 y #1300)
Alberto: «el agente falla mucho». El log (`contable_log`) tenía el mismo PDF subido TRES veces con
«no distingo el importe», y dos facturas dadas por no pagadas. Ninguna de las dos cosas era lo que
parecía. Lo aprendido, por orden de lo que más cuesta volver a descubrir:

1. **El parser se validó contra un fixture escrito a mano, no contra un PDF real → llevaba meses
   devolviendo CERO.** Kutxabank ya no separa los campos en el texto extraído
   (`01/07/2026******2019750300COMPRA EN ZAPATERIA CERRAJERIA-8,00 €`) y `RE_LINEA` exigía `\s+`
   entre la fecha y el nº de tarjeta. `parseTarjetaPdfTexto` → `[]` → `esExtractoTarjeta` false → el
   chat lo mandaba al lector de FACTURAS y respondía «no distingo el importe». La suposición
   equivocada estaba en el código **y en el test**, así que la suite en verde no significaba nada.
   **Regla: el fixture de un parser de documento externo se copia de un documento real.**
2. **Con un importe PEGADO a otros dígitos, delimita primero el otro campo.** Leer el importe antes
   de recortar el PAN hace que el grupo de millar se trague hasta 3 dígitos del número de tarjeta:
   `******20196503021.355,24 €` → **21.355,24€** en vez de 1.355,24€ (tarjeta …0302, la de Pilar; con
   la …0300 NO se ve porque sus dígitos finales son ceros y se pierden al parsear). Hoy los dígitos
   enmascarados se delimitan primero por dos vías deterministas —una línea de cargo (tras el PAN viene
   una letra) o el PAN de la cabecera— y **si ninguna resuelve, la línea NO se importa**: un importe
   verosímil e inventado no lo caza nadie aguas abajo.
3. **El mismo extracto en PDF y en Excel tiene que dar el MISMO `dedupe_hash`.** El Excel trae la
   columna «fecha valor», distinta de la de operación en **63 de las 109** compras del fichero real, y
   el hash la incluye → subir los dos ficheros (justo lo que uno hace cuando el PDF no se lee) metía
   esas 63 compras por segunda vez (~1.990€ fantasma). `lib/extracto-tarjeta-excel.ts::comoExtractoTarjeta`
   normaliza `fechaValor`/`saldo` a la forma del PDF; hay test que fija la invariante. El Excel tampoco
   trae el nº de tarjeta en cabecera: sale del concepto de la liquidación (`PAGO RECIBO <16 dígitos>`),
   y si hay 0 o >1 se devuelve `null` y se PREGUNTA en vez de adivinar la cuenta.
4. **El cuadre solo se afirma cuando el extracto lo permite.** En el PDF real el `PAGO RECIBO` **abre**
   el mes (el 01/07 se paga junio) y las compras del fichero son posteriores, así que contrastarlos daba
   «⚠️ el desglose NO cuadra, ¿faltan páginas?» en TODOS los extractos. `CuadreTarjeta.verificable` es
   false si la liquidación va antes de la primera compra o si no hay ni una compra.
5. **Cobertura del extracto: «no encuentro el cargo» ≠ «mi extracto no llega a esa fecha».**
   Kutxabank va 1-3 días por detrás POR DISEÑO (la conexión PSD2 está sana), así que una factura de
   anteayer no se puede contrastar todavía. `CruceDoc` (documentos-tipos.ts) tiene cinco desenlaces
   —match · ya_conciliado · fuera_de_ventana ±60d · **sin_cobertura** · sin_match— y el mensaje dice
   hasta qué fecha llega cada banco. Casos reales: 780,10€ del 03/08 negados el 05/08 (el cargo entró
   en BD el 06/08) y la factura 47/2026 del 06/08 con Kutxabank llegando al 05/08.
6. **Subir el `maxDuration` solo mueve la pared.** Con 60 s la ruta del chat importó los 109
   movimientos, los categorizó y archivó el PDF en Drive… y murió justo ANTES de contestar: en pantalla
   «Sin respuesta.» sobre un extracto que sí había entrado (mismo patrón que `facturas-scan`, 31/07).
   Ahora 300 s **+ presupuesto** (`lib/contable/presupuesto-extracto.ts`, puro): los pasos opcionales
   (Telegram → vigilantes → Drive → Gmail) se sueltan de abajo arriba si no caben, se reserva tiempo
   para responder y **se dice cuál faltó**. El cliente tampoco llama ya «Sin respuesta.» a un 504: avisa
   de que el documento puede haber entrado y manda a mirarlo en `/banca` (reimportar no duplica).

## 🚨 Los VIGILANTES de la tarjeta: un aviso que sale de comparar strings (14/08/2026, PR #1413)
Alberto, con la captura de la «🔎 Revisión de la tarjeta» delante: *«¿por qué no lo reconoce el agente
contable con IA?»*. **Lo primero que hay que saber al leer una queja sobre ese mensaje: NO lo escribe
ninguna IA.** Es `vigilantesTarjeta()` (`lib/contable/extracto-tarjeta.ts`) sobre las reglas puras de
`lib/vigilantes-tarjeta.ts`; la IA solo entra en el chat y en las dudosas de Telegram. Los tres bloques
del mensaje afirmaban cosas que su comparación no sostenía:

1. **«Cargos que no reconozco» comparaba el RÓTULO LITERAL** contra el histórico de ESA tarjeta, así que
   «MERCADONA COLMENA SEVILLA: 187,67€» salía como comercio nuevo con decenas de compras previas en
   Mercadona (otra sucursal = otra cadena de texto), y lo pagado con otra cuenta tampoco contaba.
   **Identidad ≠ etiqueta:** `lib/comercio.ts::comercioDe` da la etiqueta que se PINTA («DIA SEVILLA
   2260»); el módulo nuevo **`lib/comercio-canonico.ts`** (`claveComercio`/`cadenaDe`/`mismoComercio`,
   puro y testeado) da la IDENTIDAD con la que se COMPARA («DIA»): quita nº de tienda/terminal, forma
   jurídica y ciudad, y mapea las cadenas. ⚠️ En `CADENAS` solo van MARCAS reales — meter genéricos de
   sector ('BAR', 'FARMACIA') fundiría comercios independientes distintos, que es el error simétrico y
   PEOR (taparía un cargo que de verdad no se reconoce). Para clasificar por sector está
   `lib/subcategoria-keywords.ts`, que es otro problema.
2. **El histórico es el de la CUENTA, no el de la tarjeta** (24 meses sobre `v_movimientos_activos`).
   Y si la lectura falla o toca el techo de filas (`VIG_HIST_MAX`), **no se emite el aviso y se dice por
   qué**: un histórico truncado o ilegible no autoriza a llamar nuevo a nada.
3. **«Posible cobro doble» necesita el MISMO DÍA.** Agrupar mismo comercio + mismo importe en todo el mes
   marcaba 2×40,00€ de gasolina (repostar dos veces) y 2×0,99€ en el súper (dos compras). Ahora exige
   misma fecha y ≥`DOBLE_MIN_EUR` (10€).
4. **«Subida de precio» solo tiene sentido en recurrentes de importe ESTABLE.** Comparaba el último
   importe contra el de hoy en cualquier comercio: «DIA subió de 3,25€ a 7,52€», «restaurante 33€ → 87€».
   `baseRecurrente()` devuelve precio de referencia solo con ≥3 cargos, en ≥3 meses distintos y todos
   ±10% de la mediana; sin base, el vigilante se calla.
5. Mismo criterio en **`POST /api/banca/antifraude`** (comparte los helpers) y su UI: sin movimientos
   anteriores al periodo no se afirma «comercio nuevo», se declara el hueco en `nota` — que ahora
   CONVIVE con los avisos en vez de ocultarlos.

**Regla que deja el caso, aplicable a cualquier vigilante nuevo: solo habla cuando la señal DISTINGUE el
aviso del comportamiento normal.** El ruido no es un aviso conservador: entrena a ignorar el mensaje
entero, y el día que haya un cargo raro de verdad pasará desapercibido entre la paja.

## 🚨 El cajón por DESCARTE de BBVA: `RE_TITULAR` solo mira `contraparte` (27/08/2026, PR #1798)
En `lib/destino.ts`, **todo CARGO de BBVA que no case el Dúplex cae a `destino='seguros'` + `revisar`**.
Eso convierte el cajón de sastre en una afirmación cara: se cuenta como **gasto deducible de la
correduría** hasta que alguien lo revise. Y lo que salva a un traspaso entre cuentas propias de ese
cajón es `RE_TITULAR`, que **solo se evalúa contra `contraparte`** — a propósito (en los ABONOS el banco
rotula la contraparte con el TITULAR, así que mirar el concepto reventaría la detección de comisiones).

Consecuencia contraintuitiva: **si el beneficiario real NO es una persona, el nombre del titular viaja
en el CONCEPTO y nadie lo mira.** Caso fundacional: el traspaso de 1.000€ a la cuenta de valores de
Interactive Brokers («ORDENES PAGO EMITIDAS EN MONEDA LOCAL // TRANSFERENCIA REALIZADA // U9007431 /
Alberto Suarez Gutierrez», contraparte `Interactive broker`) salía como 🛡️ Seguros. Fix: `RE_BROKER`
(`INTERACTIVE BROKER(S)` / `IBKR` / la cuenta IBKR `U`+7-8 dígitos, que es como lo rotulan los extractos
Excel viejos), evaluado ANTES del reparto abono/cargo para cubrir también la retirada de vuelta.

- **Antes de ampliar `destino.ts` con una clave nueva, cuéntala contra el libro entero** (no solo contra
  BBVA ni contra fixtures): `WHERE concepto||' '||contraparte ~* '<patrón>'`. Aquí dio 3 filas, las 3
  de IBKR — por eso la regla no podía secuestrar nada. Es el mismo control que faltó en el incidente
  de la clave genérica `"TRANSF"`, y el test anti-secuestro (comisiones + `LIQ. OP. Nº`) lo fija.
- **Backfill obligatorio de lo ya ingestado:** una fila con `destino_confirmado=true` NO se re-clasifica
  sola nunca (mismo patrón que la cuota RETA de 2026-07-18). La regla arregla el futuro, el SQL el pasado.
- **Suelto conocido en ese cajón:** `FINANCIALDATASETS.AI` (API del radar de trading) sigue cayendo a
  `seguros` + revisar. Si se decide que es herramienta profesional, va a `RE_SOFTWARE`, no a mano.

## 🚨 IONOS: un proveedor que llevaba 3 años sin contabilizarse (29/08/2026)
Alberto, ante el aviso de la bandeja: *«ionos es proveedor de dominio web, deducible a correduría;
tiene que haber bastantes cargos, a ver si están contabilizados bien»*. No lo estaban, y el fallo
era de **tres capas a la vez**. Sirve como plantilla para auditar cualquier proveedor recurrente:

1. **El negocio estaba cableado mal en `lib/destino.ts`.** IONOS vivía en `RE_PISOS` desde el
   principio, seguramente porque ahí está alojado el dominio `housesevillana.es`. Pero IONOS es
   infraestructura de desarrollo (dominios, DNS, correo, VPS+Plesk, SSL) que sirve además a ialimp
   (`smtp.ionos.es`) y a la correduría → su sitio es `RE_SOFTWARE`, como Vercel/Anthropic. Los 12
   cargos en BD salían repartidos entre `turistico_pisos` (9) y `seguros` (3 reclasificados a mano
   en junio): **el mismo proveedor contado en dos negocios distintos**, y ninguna de las dos
   reclasificaciones manuales creó regla.
   - ⚠️ `RE_SOFTWARE` **solo aplica en BBVA** (invariante «correduría = siempre BBVA») y IONOS se
     cobra **por PayPal contra la TARJETA de Kutxabank**, así que mover la clave de regex NO basta:
     lo que lo lleva a la correduría fuera de BBVA es la regla aprendida `IONOS → seguros` de
     `banca_destino_reglas`, exactamente el mismo camino que ya usaba `VERCEL` (que se paga desde
     N26). **Antes de dar por arreglado un proveedor, mira POR QUÉ CUENTA se cobra**, no solo qué
     regex casa.
2. **La huella la partía un NIF mal leído.** En 2 de las 5 facturas que el agente sí leyó, el
   extractor guardó como `nif_proveedor` el NIF del CLIENTE (el de Alberto) en vez del de IONOS —
   variante del caso DIGI. `receptor.ts::nifProveedorEsNuestro` ya lo detecta desde el 26/08, pero
   las filas viejas seguían partidas. Saneadas en `prisma/sql/2026-08-29_ionos_correduria.sql`.
3. **Y lo más caro: el agente de correo no existía cuando llegaron casi todas las facturas.** En
   Gmail hay **55 facturas de IONOS desde marzo de 2023** (1.111,70 €); en `gastos` había **6**, y
   solo UNA imputada (la de abr-2026, metida a mano). El extracto de tarjeta solo cubre
   dic-2025→jul-2026, así que el resto **no estaba ni en el banco ni en gastos**: no había ningún
   hueco visible que delatara la falta. **«El agente no avisó» no es «no hay nada»: el agente solo
   mira el correo NUEVO.** Para auditar un proveedor, la fuente completa es el buzón, no la bandeja.
   Backfill completo en `prisma/sql/2026-08-29_ionos_backfill_historico.sql`.

🚨 **Y la trampa de buscarlas: el ASUNTO del proveedor cambia con los años.** Hasta ago-2023 IONOS
titulaba «**Su** factura N **del** DD/MM/AAAA de su contrato C» y desde sep-2023 «**Tu** factura N
**con fecha de** DD/MM/AAAA». Un `subject:"Tu factura"` devuelve 46 y parece la lista completa —
faltan 9, las más antiguas. **Al barrer el buzón de un proveedor, busca por REMITENTE y comprueba
la fecha de la más antigua contra cuándo se dio de alta el servicio**; si el corpus empieza justo
donde cambió una plantilla de correo, el corte es tuyo, no suyo.

⚠️ **`base_imponible`/`iva` del backfill son DERIVADOS, no leídos.** El correo de IONOS solo
publica el importe total; el desglose sale de `round(total/1,21)` y así queda marcado en
`raw_extraction.iva_derivado`. Se validó contra las 5 facturas que sí pasaron por OCR (coinciden al
céntimo), pero si algún día hace falta el IVA soportado exacto para un 303, el dato bueno está en
los PDF adjuntos, no aquí.

**La limitación estructural que esto destapó (resuelta, pero conviene entenderla):** IONOS factura
por CONTRATO —cuatro vivos bajo el mismo cliente: Servidor Virtual Cloud M mensual, SSL Ilimitado
anual, y dos Domain Pack— con importes de **1,82 € a 145,20 €**. `evaluar()` valida contra
`[importe_min, importe_max]`, que por defecto es **±10 % del esperado**, así que por muchas veces
que se confirme en la bandeja **volvería a caer en ella cada mes**: un proveedor multi-contrato no
encaja en «una huella, un importe». La regla se sembró a mano con banda **1–200 €**;
`reforzarRegla` solo ENSANCHA (LEAST/GREATEST), nunca estrecha. Al dar de alta un proveedor así,
la banda es parte del alta.

## 🚨 Un agregado que no filtra `revisado` convierte la BANDEJA en contabilidad (29/08/2026)
`getResumenSivra(anio)` sumaba `SELECT SUM(total) FROM gastos WHERE año = X`, a secas. La bandeja
existe para NO afirmar lo que aún no se ha revisado, y ese `SUM` lo afirmaba igual: en 2026 daba
**3.372.460,28 €** de gasto de los pisos contra **13.755,66 €** reales. Dentro había 3.300.000 € +
33.000 € de la reserva del edificio de C/ San Luis 9 (dos documentos del MISMO contrato leídos como
dos facturas) y el Modelo 200 de 2025 TRIPLICADO — las tres sin revisar, dos de ellas sin proveedor
ni concepto, que es justo por lo que `existeDuplicado` no las cazó: deduplica por nº de factura o
por huella+importe, y no tenían ninguna de las dos.

- **Segundo agujero en la misma consulta:** sin `propertyId` tampoco filtraba la propiedad, así que
  metía la correduría (`propiedad` NULL: IONOS, Vercel, Anthropic…) y lo personal en un total cuyo
  INGRESO sale de `incomes`, que es solo pisos. Numerador y denominador de universos distintos.
- **Regla:** al sumar una tabla que tiene cola de revisión, el filtro de estado va en la consulta,
  no en la cabeza de quien la lee. Y comprueba que numerador y denominador hablan del mismo negocio.
- Filtro único en **`lib/sivra/gasto-de-pisos.ts`** (`esGastoDePisos`/`sqlGastoDePisos`, puro) con
  **guardián que lee el FUENTE** de `financiero.ts` y exige el filtro en las DOS ramas — ni `tsc`
  ni el build miran dentro de un `Prisma.sql`. `prop_multi_apartamentos` SÍ cuenta aquí (es gasto
  compartido de los pisos); solo el P&L POR piso lo excluye, porque ahí hace falta saber de cuál es.
- **Y el hermano documental:** la factura de Ariste venía a nombre de «SAN LUIS 9 CB»
  (E26584144), que no es ninguno de los titulares. Hoy `procesar.ts` la marcaría `ajena` por
  `evaluaReceptor` — la fila es residuo anterior al estreno de `receptor.ts` (31/07/2026), no un
  fallo vivo. Antes de dar por rota una guarda, mira la fecha de la fila contra la del módulo.

## 🚨 La bandeja de revisión NO tenía pantalla: un enlace a un 404 durante meses (29/08/2026)
Alberto: *«¿dónde reviso gastos? ¿la IA no las clasifica con todo el contexto que tiene?»*. Las dos
respuestas eran peores de lo que parecía.

1. **La pantalla no existía.** `avisos.ts` enlaza `/expenses/pendientes` desde el día uno y esa ruta
   **nunca se construyó**. Tampoco el endpoint `PATCH /api/expenses/pendientes/[id]` que esta misma
   referencia daba por vivo (no había ni carpeta `app/api/expenses`) — **la documentación describía
   una API inexistente**. Y `/api/sivra/expenses`, la única pantalla de gastos, las ESCONDE a
   propósito (`NOT (revisado = false AND origen IS NOT NULL)`). Un enlace roto en una plantilla de
   texto no lo caza `tsc` ni el build: hoy lo vigila `lib/agente-facturas/avisos-enlace.test.ts`,
   que ata enlace + página + endpoints + entrada de sidebar (probado en rojo).
2. **La IA no decide, y por eso «todo el contexto» no servía de nada.** La IA solo LEE el PDF; quien
   decide auto-imputar o mandar a la bandeja es `evaluar()` — reglas puras: ¿hay regla para la huella?
   ¿`vistas >= 2`? ¿el importe cae en la banda? Y **la regla solo nace al CONFIRMAR**. Sin pantalla no
   se confirma → no nace la regla → todo sale «Proveedor nuevo, sin regla aprendida». **19 de 21**
   pendientes con ese motivo exacto, **35.938,20 €** parados: Sique Brilla, la lavandería, Booking,
   Allianz, Vercel, Anthropic, PriceLabs, Asecon… ninguno remotamente dudoso.

**La regla que deja: un aviso que manda a una pantalla es una promesa, y hay que probar que la
pantalla existe.** Aquí el bucle entero (leer → decidir → aprender) estaba construido menos el último
eslabón, y sin él los otros tres no servían de nada.

- La pantalla nueva precarga con **`sugerencia-pendiente.ts`** (PURO): propone piso/categoría desde el
  histórico ya revisado del MISMO proveedor. 🚨 **Nunca inventa** — sin base deja el campo vacío, y un
  EMPATE tampoco se desempata. Un desplegable preseleccionado a ojo se confirma sin mirar, y la regla
  que nace de esa confirmación ya imputa SOLA a partir de la segunda vez: el error se propagaría.
- Descartar **BORRA** la fila, no la marca revisada: revisada la contaría como gasto.
- Pendiente ofrecido y no hecho: que la IA proponga con el contexto (histórico + movimiento bancario
  que casa). Hoy la propuesta es determinista y gratis.

## Frontera multi-tenant
Scope `cuenta_id` siempre. BD compartida con sivra/ialimp: cambios transversales de BD → `auditoria-central`.
