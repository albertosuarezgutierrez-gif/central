# Módulo de contabilidad multi-empresa (agnóstico de sector)

Fecha: 04/11/2026 · Estado: PROPUESTA para decisión de Alberto · Retoma el Hito 1 de `docs/PLAN-plataforma-modular.md` §9.3.

Leyenda de certeza: **[Seguro]** norma o hecho confirmado por varias fuentes o por el código · **[Probable]** conocimiento
previo no re-verificado contra texto oficial · **[Suposición]** hipótesis nuestra a validar.
Límite de esta redacción: el contenedor no accede a AEAT ni BOE; **ninguna cifra legal se ha verificado contra texto oficial**
(requisitos y fuentes en `scratchpad/contabilidad-requisitos.md`, resumidos abajo). Un asesor fiscal debe validar antes de codificar.

## 1. Contexto y principio rector

**Principio (pedido explícito de Alberto):** la contabilidad es un **módulo-herramienta agnóstico de sector**, como RRHH.
Grupo ASegura la **regala** a clientes de cualquier sector a cambio de que aseguren con nosotros. Consecuencias de diseño:

1. **Núcleo en `packages/*` sin una sola palabra de taller, hostelería o limpieza.** Un guardián de test lo vigila (ver F0).
2. **Cada vertical se enchufa por un PUERTO de «hechos contables»** (venta, cobro, compra, pago, nómina, movimiento bancario) y
   unas **reglas de asiento configurables por empresa y sector** (plantillas sectoriales: taller, hostelería, limpieza, alquiler…).
   La vertical no sabe de cuentas del PGC; el núcleo no sabe de órdenes de trabajo.
3. **App propia `apps/contabilidad`**, multi-empresa, schema `contabilidad`, rol de BD propio con RLS forzado por empresa (patrón taller).
4. **Un cliente sin ninguna vertical nuestra también puede usarla**: alta manual de facturas y gastos, banco por Norma 43/PSD2.
5. Alta de empresa por el operador desde plataforma `/operador/clientes` (patrón `apps/rrhh`); marca del cliente + «con Grupo ASegura».

Por qué ahora: el taller (F2 de `2026-11-04-taller-global2.md`) necesita facturas VeriFactu, cobros y margen; si cada vertical hace
su propia factura y su propio libro, repetimos el error que el Hito 1 quería evitar. Hay semillas útiles pero dispersas (§2).

## 2. Punto de partida (inventario verificado por otro agente)

| Pieza | Dónde | Estado / acción |
|---|---|---|
| Cálculo sobre `Apunte[]` (IVA trimestral, PyG, tesorería, caja) | `packages/module-contabilidad` | Sirve, pero usa **float**; migrar a céntimos enteros |
| Motor PGC + asientos + export A3/Sage/Holded | `apps/ia-rest/src/lib/contabilidad.ts` | Es la **semilla** del motor de doble partida; extraer a package |
| Huella y QR VeriFactu | `packages/core-fiscal` | **Probablemente NO conforme** (TipoFactura F2 fijo; importe total en CuotaTotal). Rehacer contra XSD |
| XML/envío AEAT | `apps/ia-rest/src/lib/verifactu.ts` | Sin firma ni envío real |
| Numeración sin huecos (`FOR UPDATE`) | `apps/plataforma/lib/sivra/facturas/*` | Patrón a **copiar** |
| Justificantes de cobro | `packages/core-receipts` | Reutilizable |
| Ingesta de facturas de proveedor (Gmail/OCR) | `apps/plataforma/lib/agente-facturas/*` | Maduro pero acoplado a plataforma |
| Banco PSD2 / Norma 43 / conciliación | `lib/psd2.ts`, `lib/norma43.ts` (puro) | Maduro; extraer lo puro |
| Nóminas | `packages/module-nominas` | Da `NominaDesglose` (cuotaPatronal, costeTotalEmpresa) **sin asiento** |
| Presupuesto taller | `packages/module-taller` | Céntimos enteros, IVA por línea; sin tabla de facturas/cobros |
| Duplicados | `round2` ×3, SEPA ×2 | Unificar en el núcleo |

**Decisión técnica [Seguro, propuesta]:** todo importe en **céntimos enteros** (`bigint`/`int`), tipos de IVA en puntos básicos.
Prohibido `float` en el núcleo; guardián que busca `Number(` sobre importes y `toFixed` en el núcleo `partida` de `packages/module-contabilidad`.

## 3. Riesgos y obligaciones legales

> Todo lo de esta sección es **base de diseño, no asesoramiento**. Requiere validación del asesor fiscal y comprobar BOE/AEAT.

**3.1 VeriFactu (RD 1007/2023, Orden HAC/1177/2024).**
- Quien **produce y comercializa** el software de facturación es el **fabricante**: nosotros, aunque lo regalemos. [Seguro]
- El fabricante debe emitir una **declaración responsable** (art. 13 RD 1007/2023) de que el sistema cumple, visible en el propio
  software y en su documentación. [Seguro]
- Sanción por producir/comercializar software no conforme: **50.000 EUR por ejercicio** (art. 201 bis LGT). [Seguro, fuente secundaria]
- Requisitos técnicos: registro de alta y de anulación por factura; huella SHA-256 encadenada con el registro anterior; QR y leyenda
  en la factura; XML según XSD de AEAT; inalterabilidad y registro de eventos. Modalidad VERI*FACTU = envío automático a AEAT;
  modalidad no verificable = conservación con firma y registro de eventos. [Probable en el detalle; Seguro en lo general]
- **Fechas inciertas.** RDL 15/2025 (BOE 03/12/2025): **01/01/2027 sociedades (IS)**, **01/07/2027 autónomos y resto**. [Seguro]
  Nota informativa de Hacienda (05/10/2026) anuncia aplazar a **octubre 2028** modificando el RD; a mediados de octubre **no estaba
  en el BOE** (un blog dice lo contrario y contradice al resto). [Probable] **Hasta que haya norma publicada, planificamos para 2027.**
  Acción: Alberto/asesor comprueba el BOE antes de fijar el roadmap definitivo. Diseñamos para cumplir igualmente.
- Fuera de alcance: haciendas forales (TicketBAI/BATUZ) y Canarias. [Probable] Se declara en la ficha del producto.

**3.2 Factura electrónica B2B (Ley 18/2022; RD 238/2026 de 25/03/2026).** [Seguro el reglamento] Independiente de VeriFactu.
Formatos admitidos: UBL, CII, EDIFACT y Facturae conformes a EN 16931; la solución pública de AEAT usa UBL. Plazos: 12 meses desde la
orden ministerial de la solución pública para >8 M EUR, 24 meses para el resto. La Orden HAC/1028/2026 (BOE 05/10/2026) sitúa grandes
~oct-2027 y resto ~oct-2028. [Suposición: fecha exacta sin verificar]. Diseño: **modelo interno de factura mapeable a EN 16931** y
exportadores UBL/Facturae como adaptadores; el registro VeriFactu es aparte del formato B2B.

**3.3 Contabilidad mercantil.** [Probable] PGC pymes (RD 1514/2007 y 1515/2007, modificados por RD 602/2016 y 1/2021); Diario e
Inventarios y Cuentas Anuales obligatorios (Mayor en la práctica); asientos con numeración correlativa; conservación 6 años;
legalización telemática en el Registro Mercantil en 4 meses desde el cierre (30/04 para año natural) [Seguro]; formulación en 3 meses,
aprobación en 6, depósito dentro del mes siguiente.

**3.4 Impuestos (taller S.L. y autónomo).** [Probable, plazos a confirmar en sede AEAT] 303, 390, 111, 115, 190, 180, 347, 349 (si
compras UE), 130/131 (autónomo), 200 y 202 (sociedad). SII solo >6.010.121,04 EUR (un taller pyme no entra; voluntario) [Seguro].
Libros registro de IVA obligatorios (art. 62 RIVA). Tipos del IS (25 % general; reducidos) [Suposición: a validar].

**3.5 Sector taller.** RD 1457/1986 (mod. RD 455/2010 y RD 542/2020) [Seguro]: presupuesto previo, factura desglosada
(mano de obra / piezas), garantía 3 meses o 2.000 km. REBU solo si el taller compra-vende vehículos de ocasión [Probable].
Vehículo del cliente en depósito **no es existencia** (cuenta de orden) [Probable].

**3.6 Riesgos propios.**
- **Responsabilidad de producto:** regalar el software no nos exime de la sanción de §3.1. Mitigación: F1 conforme **antes** de
  cualquier cliente real; declaración responsable firmada; cláusula de uso y limitación de responsabilidad (revisión jurídica).
- **RGPD:** somos encargados de tratamiento de los datos contables del cliente; contrato de encargo por empresa. [Probable]
- **Atribución de gestor:** un gestor ve N empresas; cada acceso queda auditado.
- **Mezcla con la correduría:** el módulo no puede condicionar el servicio (ni dar a ASegura datos contables) sin consentimiento propio.
  [Suposición] El «a cambio de asegurar» es comercial, no técnico: sin bloqueos por no contratar.

## 4. Arquitectura

### 4.1 Paquetes (`packages/*`, TS puro, scope `@central/*`)
- **`module-contabilidad`** (existente, se amplía; decisión 04/11/2026: no crear paquetes nuevos sin necesidad): submódulo `partida` con doble partida,
  plan de cuentas PGC pymes, asientos inmutables (contraasiento), puerto de hechos + reglas, libros (diario, mayor, sumas y saldos, balance, PyG).
  Céntimos enteros. Sin BD: repositorio por interfaz. Los informes actuales (IVA, PyG, tesorería, caja) siguen y pasan a leer del libro;
  adaptador `Apunte[] → hechos` para no romper ialimp/sivra/ia-rest (Hito 1.2-1.4). Plantillas sectoriales (`taller`, `hosteleria`, `limpieza`,
  `alquiler`, `generico`) como DATOS dentro del mismo paquete: plan de cuentas sugerido + reglas por tipo de hecho.
- **`core-fiscal`** (existente, se amplía): VeriFactu completo (registros de alta/anulación, huella encadenada conforme, QR, XML, transporte
  inyectable; firma, cola de envío y registro de eventos después), movido desde `apps/ia-rest/src/lib/verifactu.ts`. **Mayor riesgo legal** →
  `agente-architect` + asesor.
- **Facturación** (series sin huecos, rectificativas, mapeo EN 16931, UBL/Facturae): empieza en `core-fiscal`; se separa a paquete propio
  solo si crece.
- Se **extraen y reutilizan**: `core-receipts`; Norma 43/PSD2 (puro) a `core-banca`; OCR/ingesta de proveedor a `module-proveedores` o `core-ingesta-facturas`.
  `module-nominas` publica hechos de nómina; no conoce cuentas.

### 4.2 Puerto de «hechos contables»
Un **hecho** es un evento económico normalizado, **idempotente** y sin cuentas: el vertical dice QUÉ pasó, el núcleo decide CÓMO se asienta.

```
HechoContable {
  empresaId, origen: { app, tipo, id }   // clave de idempotencia: (empresaId, app, tipo, id, version)
  tipo: 'venta'|'cobro'|'compra'|'pago'|'nomina'|'movimiento_bancario'|'ajuste'
  fecha, tercero?: { nif, nombre }, moneda: 'EUR'
  lineas: [{ concepto, baseCent, tipoIvaBp, retencionBp?, categoria (etiqueta del sector, p. ej. 'mano_obra'|'recambio'), centroCoste? }]
  totalCent, medioPago?, documentoRef? (factura/ticket), meta?
}
```
- Transporte: `POST /api/hechos` en `apps/contabilidad` con Bearer por vertical (`requireSecret`) y/o función de paquete para las apps
  que comparten BD. Resultado: `asentado | pendiente_de_regla | rechazado(motivo)`. Nunca se pierde un hecho: sin regla va a la
  bandeja «por clasificar» del gestor.
- Una venta de un vertical **crea la factura** si el vertical no la emite él mismo; si la emite (taller en F1) el hecho referencia la factura ya registrada.

### 4.3 Reglas de asiento
- Tabla `reglas_asiento`: (empresa, sector) → condiciones (`tipo`, `categoria`, `tipoIvaBp`, `tercero`) → plantilla de apunte (cuenta, Debe/Haber, importe = base|cuota|total|retención).
- Resolución por precedencia: regla de la empresa > plantilla del sector > genérica. Todo cambio de regla versionado y auditado; **no reescribe asientos pasados**.
- Ejemplos taller: `venta/mano_obra` → 705 (base) + 477 (cuota) contra 430; `venta/recambio` → 700; `compra/recambio` → 600 + 472 contra 400; `cobro` → 570/572 contra 430. Hostelería: ventas a 700 con propinas y caja; limpieza: 705 con retenciones.
- Un test de **paridad**: la misma batería de hechos produce asientos cuadrados (Debe = Haber) con cada plantilla sectorial.
- **CNAE → plantilla (05/11/2026, pedido de Alberto):** `empresas.cnae` (CNAE-2009, 4 dígitos, NULL = no se sabe) y `plantillaSugeridaPorCnae()` (dato puro en `module-contabilidad`: 4520/4531/4532 → taller · 5610/5621/5629/5630 → hostelería · 8121/8122/8129 → limpieza · 6820/7711/7712/7721/7729/7732/7739 → alquiler · resto, inválido o ausente → genérica). La app **SUGIERE**; el dueño o el gestor **confirma o cambia** en Ajustes → Actividad (y puede **añadir cuentas de otra plantilla** sin quitar nada). El alta del operador acepta `cnae` (con CNAE y sin sector, la plantilla es la sugerida). El CNAE además **acota los ejes de rentabilidad** que se ofrecen y **prioriza los tipos de aviso** de la actividad (nunca descarta ninguno).

### 4.4 App `apps/contabilidad`
- Next.js como las demás; entrada en la matriz de `tests.yml` (**15.ª app**, con su `Typecheck · contabilidad`), `vercel.json` con `ignoreCommand` y `--sin-previews`, proyecto Vercel propio (Root Directory `apps/contabilidad`).
- Pantallas: panel de empresa (IVA/tesorería/resultado), facturas (emitidas/recibidas), cobros/pagos, banco y conciliación, libro diario/mayor/sumas y saldos, impuestos, cierre, ajustes (reglas, series, plan de cuentas), bandeja «por clasificar».
- Responsive ≥320 px; dinero con formato español (`2.162,49€`); direcciones con la regla CP → Catastro.

### 4.5 BD, roles y aislamiento
- Schema **`contabilidad`**, rol **`prisma_contabilidad`** sin `BYPASSRLS`; **RLS forzado por `empresa_id`** vía `set_config('app.empresa_id', …)` por transacción (patrón taller). Un gestor con N empresas abre una transacción por empresa; nunca una consulta cruzada.
- Rotación de contraseña del rol y `DATABASE_URL` de Vercel en un solo paso (regla del CLAUDE.md).
- Tablas contables **append-only** (REVOKE UPDATE/DELETE al rol + trigger que lo impide); correcciones = asiento de ajuste o factura rectificativa.
- SQL numerado a mano, preview → producción tras OK de Alberto.

### 4.6 Roles y accesos
- **`dueno`**: todo en su empresa, incluidos ajustes y cierre.
- **`gestor`** (asesoría): vive en una tabla `gestorias`; relación `gestoria_empresas` (N). Ve y asienta en sus empresas; el dueño puede revocar. Acceso auditado.
- **`empleado_admin`** (opcional): factura y registra gastos, sin cierre ni ajustes. [Suposición]
- Login: correo + código de 6 dígitos como RRHH (`core-identity`); selector de empresa siempre revalidado contra `usuario_empresas`.

### 4.7 Alta por el operador y marca
- Patrón `apps/rrhh`: plataforma `/operador/clientes` llama a `POST /api/operador/empresas` (Bearer `CONTABILIDAD_OPERADOR_SECRET` vía `requireSecret`, **sin fallback literal**). Parámetros: razón social, NIF, régimen (sociedad/autónomo), sector, ejercicio, dueño, gestoría opcional, logo y `color_primario`.
- El alta siembra: plan de cuentas (PGC pymes), plantilla sectorial, serie de facturación, ejercicio abierto, rol de dueño. Idempotente por NIF.
- **Marca intermedia** (como RRHH): logo, nombre y color de la EMPRESA mandan en cabecera y documentos (color oscurecido hasta AA 4,5:1); «con Grupo ASegura» como línea pequeña. Base `emitirRootCss(MARCA_ASEGURA)` de `@central/brand`; alta de marca con la skill `marca-cliente`. Facturas PDF con la marca del emisor.

## 5. Modelo de datos mínimo (schema `contabilidad`; todas con `empresa_id` y RLS salvo indicación)

- **`empresas`**: id, NIF, razón social, forma (`sociedad|autonomo`), sector, régimen IVA, moneda, marca (logo, color), estado.
- **`gestorias`**, **`gestoria_empresas`**, **`usuarios_empresa`** (rol), **`auditoria`** (quién, qué, cuándo, antes/después).
- **`ejercicios`**: empresa, año, apertura, cierre, estado (`abierto|en_cierre|cerrado`); fecha cerrada = nada se asienta dentro.
- **`plan_cuentas`**: código, nombre, grupo, tipo, activa; semilla PGC pymes, editable por empresa; no se borra una cuenta con apuntes.
- **`asientos`** (inmutables): número correlativo por empresa y ejercicio, fecha, descripción, origen (`hecho_id|manual|cierre|apertura`), `reversa_de`, hash del contenido.
- **`apuntes`**: asiento, cuenta, Debe, Haber (céntimos), **contrapartida** (cuenta/tercero), tercero, centro de coste, documento. Restricción: suma Debe = suma Haber por asiento.
- **`terceros`**: NIF, nombre, tipo (cliente/proveedor/empleado/acreedor), dirección validada, cuenta auxiliar (430xxx/400xxx).
- **`series`**: empresa, código, prefijo, contador, tipo (`ordinaria|rectificativa|simplificada`). El contador se incrementa con `SELECT … FOR UPDATE` en la misma transacción que la factura (patrón sivra).
- **`facturas_emitidas`**: serie, número, fecha, tercero, líneas (copia congelada), totales, desglose de IVA, retención, estado (`borrador|emitida|anulada|rectificada`), `rectifica_a`, `hecho_origen`, enlace a asiento, PDF. Inmutable tras emitir.
- **`facturas_recibidas`**: proveedor, nº del proveedor, fechas (emisión/contable), líneas, IVA soportado deducible, origen (`manual|gmail|ocr|vertical`), estado, enlace a documento (`core-storage`) y asiento.
- **`cobros`** y **`pagos`**: factura, importe, medio, fecha, justificante (`core-receipts`), cuenta bancaria; parcial admitido; aviso en efectivo por encima del límite legal [Probable: validar el límite vigente].
- **`cuentas_bancarias`**, **`movimientos_bancarios`** (Norma 43/PSD2), **`conciliaciones`** (movimiento ↔ cobro/pago/asiento).
- **`registros_verifactu`**: factura, tipo (`alta|anulacion`), huella, huella_anterior, XML, `fecha_hora_huso`, estado de envío (`pendiente|enviado|aceptado|rechazado`), CSV de respuesta AEAT, reintentos; **un registro por factura y por anulación; cadena por (empresa, sistema)**. Y **`eventos_sistema`** (registro de eventos).
- **`activos`**: inmovilizado (cuenta, fecha, valor, vida útil, método, amortización acumulada, baja).
- **`reglas_asiento`**, **`plantillas_sector`** (global, sin RLS, solo lectura), **`hechos`** (recibidos, con clave de idempotencia y resultado).
- **`modelos_aeat`**: modelo, periodo, casillas calculadas, estado (`borrador|presentado`), justificante.
- **`existencias`**/stock: valoración por precio medio ponderado (F3); el stock operativo sigue en `module-materiales`.

## 6. Fases

Cada fase tiene criterio de **hecho** y **guardianes** (regla del repo: un cepo no está terminado hasta verlo FALLAR).
Todo dato legal se valida con el asesor antes de cerrar la fase correspondiente.

**F0 — Bases.** Núcleo `partida` en `module-contabilidad` y VeriFactu conforme en `core-fiscal` (tipos, céntimos, doble partida, plan PGC), schema `contabilidad` + rol + RLS, `apps/contabilidad` vacía en la matriz, alta de operador, marca, auth.
*Hecho:* el operador da de alta una empresa de prueba y el dueño entra con su marca y ve un plan de cuentas.
*Guardianes:* (1) el núcleo no menciona taller/hostelería/limpieza/OT (grep en `packages/core-*` y `module-contabilidad`); (2) cero `float` en importes; (3) RLS: empresa A no lee B, con rol real y consulta cruzada; (4) `requireSecret` sin literal; (5) la matriz de `tests.yml` incluye `contabilidad` (`regression-matriz-typecheck`); (6) asiento descuadrado rechazado.

**F1 — Facturación + VeriFactu (primer consumidor: el taller).** Series, factura emitida inmutable, rectificativa y anulación, PDF con QR y leyenda, registro de alta/anulación encadenado, XML contra XSD, firma, envío (o conservación) según modalidad, registro de eventos; cobros. Decisión 04/11/2026: cada vertical emite y guarda SUS facturas en su schema (el taller: `taller.facturas` + `registros_verifactu`, SQL 0009) con `core-fiscal`, y envía `HechoContable` (venta/cobro) al puerto de contabilidad; la contabilidad no emite facturas de las verticales.
*Hecho:* una OT real del taller se factura, se registra su huella, se valida el XML contra el XSD oficial y (en entorno de **pruebas AEAT**) se acepta; la declaración responsable está redactada y revisada por el asesor.
*Guardianes:* numeración sin huecos con concurrencia (dos emisiones simultáneas); huella: vectores de prueba oficiales de la especificación AEAT (si no están, no se cierra la fase); cadena rota → fallo; factura emitida no se puede UPDATE/DELETE; anular = nuevo registro; el total no entra en `CuotaTotal`; `TipoFactura` correcto (completa vs simplificada); fecha de emisión no retrocede respecto a la última del registro. **Esta fase NO se activa con clientes reales sin visto bueno del asesor.**

**F2 — Doble partida.** Hechos → reglas → asientos; plantillas `taller` y `generico`; asientos manuales; diario, mayor, sumas y saldos; extracción del motor de ia-rest; adaptador desde `Apunte[]`.
*Hecho:* el mismo mes del taller muestra ventas, cobros y compras en diario y balance de sumas y saldos que cuadra.
*Guardianes:* Debe = Haber en todo asiento; idempotencia (el mismo hecho dos veces = un asiento); hecho sin regla → bandeja, no se pierde; asiento inmutable (corregir = reversa); paridad de resultados con `module-contabilidad` actual sobre un caso de ialimp (comportamiento idéntico, Hito 1.2); periodo cerrado rechaza asientos.

**F3 — Compras, banco y stock.** Facturas recibidas (manual, Gmail/OCR reutilizando `agente-facturas`), pagos, Norma 43/PSD2 y conciliación, nóminas como hecho (asiento 640/642/476/4751/465 desde `NominaDesglose`), existencias por PMP.
**Estado 05/11/2026 (parcial, SQL `0003_compras_banco.sql` SIN aplicar):** hecho = CNAE → plantilla sugerida; compras manuales (NIF validado con `core-fiscal`, líneas por IVA, retención IRPF → 4751/410, categoría y retención recordadas por proveedor, duplicado por (NIF, nº normalizado), adjunto = solo referencia) y pagos con medio (570/572); banco por Norma 43 y CSV con mapeo (`packages/core-banca`, copia de `apps/plataforma/lib/norma43.ts` con importes en céntimos — **pendiente deduplicar plataforma contra el paquete**), `movimientos_banco` con dedupe por huella, conciliación propuesta (importe exacto + ventana, ambigua → sin propuesta, reglas por concepto) que la persona confirma y genera el asiento de cobro/pago. **Solo interfaz, sin conectar:** ingesta por correo/OCR (`FuenteFacturasRecibidas`) y PSD2 (`PuertoPsd2`). **Pendiente de F3:** nóminas como hecho, existencias por PMP, OCR de facturas, deshacer una conciliación (contraasiento), pagos parciales contra varios movimientos.
*Hecho:* factura de proveedor del taller (la del pedido recibido) llega por OCR, se asienta, se concilia con el cargo bancario.
*Guardianes:* duplicado de factura (mismo proveedor+número+fecha) rechazado; conciliación nunca asigna un movimiento a dos facturas; nómina: el asiento cuadra con `costeTotalEmpresa`; consumo de stock al valor PMP, no negativo; ingesta idempotente por Message-ID.

**F4 — Impuestos.** Libros registro de IVA, 303, 390, 111, 115, 190, 180, 347, 349; 130/131 para autónomos. Primero **cálculo y borrador exportable**; presentación telemática (certificado/apoderamiento) como paso aparte.
*Hecho:* un trimestre real cuadra con el 303 que presenta hoy el asesor, casilla a casilla.
*Guardianes:* los totales del 303 ≡ libros de IVA ≡ mayor 472/477; fechas límite calculadas con reloj inyectado (nunca fecha fija); 347 aplica umbral 3.005,06 EUR por tercero y año natural [Probable: validar]; un test por casilla con casos aprobados por el asesor.

**F5 — Cierre, amortizaciones y cuentas anuales.** Cuadro de amortización, periodificaciones, regularización, cierre y apertura, balance/PyG abreviados, memoria, 200 y 202, libros para legalizar, depósito (fichero XBRL).
*Hecho:* ejercicio 2026 de una empresa piloto cerrado y reabierto con saldos de apertura iguales a los de cierre.
*Guardianes:* tras el cierre las cuentas 6/7 quedan a cero y el resultado va a 129; apertura ≡ cierre; ejercicio cerrado inmutable; balance cuadra (Activo = Pasivo + PN); amortización no supera el valor.

**F6 — Producto vendible (regalable).** Portal de la gestoría (multi-empresa, bandeja de pendientes, comentarios), export A3/Sage/Holded, UBL EN 16931 y Facturae, declaración responsable publicada, onboarding guiado (importar plan, saldos iniciales, terceros), plantillas `hosteleria`, `limpieza`, `alquiler`, e integración con ia-rest, ialimp, sivra y rrhh.
*Hecho:* una empresa externa sin vertical nuestra se da de alta, factura y concilia sola; una gestoría lleva 3 empresas.
*Guardianes:* la gestoría A no ve empresas de B; revocar acceso corta de inmediato; UBL validado contra el esquema/schematron; export A3 importable (muestra real); alta idempotente por NIF.

## 7. Orden y dependencias
F0 → F1 (bloquea el F2 del taller) → F2 → F3 → F4 → F5 → F6. F1 y F2 pueden solaparse si no pisan archivos. Con Prisma compartido, la
verificación final (`prisma generate` + `tsc`) la hace UN agente. Cada fase: PR draft, `code-review` antes de sacarlo de draft;
F1 y todo lo que toque emisión, RLS o migraciones, `agente-architect`.

## 7bis. Además

1. **Puente con seguros (objetivo de negocio).** Señales contables (facturación, inmovilizado, flota, plantilla, morosidad) generan
   **oportunidades de póliza**, que llegan como lead a `/correduria` (puerto `/api/operador/leads` de `apps/asegura`, origen `contabilidad`)
   **SOLO con consentimiento explícito y separado** del cliente (RGPD art. 6.1.a), casilla propia sin marcar, y **uso no condicionado**
   (art. 7.4): el servicio no depende de marcarla. Sin consentimiento vigente la señal ni se calcula fuera de la empresa; retirar el consentimiento lo corta y deja traza. [Probable]
2. **RGPD.** Grupo ASegura es **encargado del tratamiento** (el cliente es responsable): contrato de encargo (art. 28) aceptado en el alta.
   Conservación 6 años (Código de Comercio art. 30) y 4 (LGT) con archivado/borrado programado al vencer; auditoría inmutable; copias de seguridad cifradas con restauración probada. [Probable]
3. **Salida y portabilidad.** Export completo en cualquier momento: diario, mayor, facturas (PDF + datos), XML VeriFactu, banco y documentos; para la gestoría o si el cliente se va.
4. **Coste de regalarlo.** Por cliente: infraestructura + OCR/IA + soporte. El plan gratuito tiene límites (facturas/mes, páginas OCR, usuarios) fijados con el coste medido en F3. Si el cliente **deja de asegurar**: pasa a **solo lectura + export**, nunca borrado inmediato (plazo de gracia largo y aviso); contrato de cesión de uso que lo recoja. [Suposición: condiciones a decidir]
5. **Responsabilidad.** No somos gestoría ni asesoría: aviso legal visible; el software prepara, el cliente o su gestor presenta. Contratar **RC profesional y ciber** que cubra el software (incluye el riesgo del art. 201 bis LGT, a confirmar con la aseguradora).
6. **Valor diario para el dueño.** Calendario fiscal con avisos push (fechas calculadas con reloj inyectado), previsión de tesorería, margen por operación (en taller, por OT), impagados con recordatorio **en borrador: nunca se envía sin OK**.
7. **Agente contable conversacional:** ver `docs/superpowers/specs/2026-07-03-agente-contabilidad-conversacional-design.md`; consume el libro por el puerto de lectura, propone asientos como borrador y no asienta sin confirmación.
8. **Fuera de alcance explícito:** regímenes forales (TicketBAI/Navarra), SII, multimoneda y consolidación de grupos.

## 7ter. Informes, gráficas y avisos (pedido de Alberto, 04/11/2026: «lo más completo posible, muy visual»)

Se construye en paralelo a F2-F4, no al final. Mismo lenguaje visual que plataforma `/finanzas` (tarjetas, `IntervaloSelector`,
gráficas, plegado perezoso ~50 + «Ver más») y marca intermedia (logo del cliente + «con Grupo ASegura»). Todo ≥320 px, dinero `2.162,49€`.
- **Panel del dueño (inicio):** KPI del periodo con comparación vs periodo anterior y mismo periodo del año pasado: ventas, gastos, margen,
  resultado, caja disponible, cobros pendientes, pagos pendientes, IVA a ingresar estimado. Semáforo honesto: `null` = «sin datos», nunca 0.
- **Evolución:** series mensuales/trimestrales/anuales de ventas, gastos por categoría, margen, tesorería (real + previsión a 90 días con
  cobros/pagos conocidos y recurrentes) y endeudamiento. Elegir intervalo y comparar ejercicios.
- **Rentabilidad por eje configurable por sector** (dato, no código): en taller por OT, cliente, tipo de trabajo, mecánico (horas baremo vs
  reales), recambio/proveedor; en hostelería por mesa/franja/producto; en limpieza por cliente/servicio. El núcleo solo conoce «dimensiones».
- **Informes estándar descargables (PDF/Excel/CSV):** diario, mayor, sumas y saldos, balance, PyG, libros registro de IVA, aging de clientes y
  proveedores, inventario de inmovilizado, borradores de modelos AEAT. Catálogo declarativo como `apps/rrhh/lib/informes/catalogo.ts`.
- **Avisos (push en la app + correo; en Telegram solo a Alberto/gestor):** vencimientos de modelos AEAT (calendario fiscal con 10/5/1 días),
  facturas impagadas a N días, descuadre de caja/banco, caída de margen o de ventas vs media, factura VeriFactu no registrada/rechazada,
  ejercicio sin cerrar, saldo previsto negativo. Nada sale a un tercero sin OK (impagados = borrador).
- **Puente seguros en el panel:** tarjeta «Protege tu negocio» solo si hay consentimiento, con la señal que la motiva.
- **Guardianes:** cada KPI tiene test con su fórmula y su estado «sin datos»; snapshot visual a 375/1280 px sin scroll horizontal.

## 8. Decisiones abiertas para Alberto

1. **Fecha real de VeriFactu:** ¿planificamos para 01/01/2027 (norma publicada) o esperamos al BOE del aplazamiento? Propuesta: construir F1 igual y activarlo cuando el asesor lo confirme.
2. **Asesor fiscal/jurídico:** ¿quién valida huella, declaración responsable y plazos? Sin él, F1 no sale a clientes reales.
3. **Envío a AEAT:** ¿modalidad VERI*FACTU (envío automático) o no verificable (conservación firmada)? Propuesta: VERI*FACTU por defecto (menos custodia para nosotros); exige certificado o apoderamiento del cliente.
4. **Certificados:** ¿firma con certificado de cada empresa (custodia delicada) o apoderamiento a Grupo ASegura? [Suposición] Aún sin investigar.
5. **Condiciones del «regalo»:** ¿gratis siempre, o ligado a tener al menos una póliza activa? ¿Qué pasa al perder la póliza (solo lectura + export, nunca borrar datos)? Aspecto comercial y RGPD.
6. **Responsabilidad:** cláusulas de uso y limitación; ¿seguro de RC/ciber propio del software?
7. **Alcance inicial de sectores:** taller primero (propuesto); ¿luego hostelería (ia-rest) o limpieza (ialimp)?
8. **Compatibilidad con las contabilidades existentes** de ialimp/sivra/ia-rest: ¿migramos sus datos al nuevo módulo o convivimos tras el adaptador?
9. **¿Hacemos nosotros el depósito de cuentas y la legalización (F5), o solo exportamos?** Es obligación del cliente; presentar por él añade responsabilidad.
10. **Foral y Canarias:** ¿se excluyen expresamente en el producto? (propuesto: sí).
11. **Factura electrónica B2B:** ¿UBL (solución pública AEAT) como único formato en F6, y Facturae solo para administración pública?
12. **Nombre y dominio:** ¿`contabilidad.grupoasegura.es` o marca por empresa?
