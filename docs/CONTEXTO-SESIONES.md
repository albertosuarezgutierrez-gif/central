# 🧠 Memoria de sesiones — central (repo GitHub: ia.rest → renombrar)

> Contexto persistente entre sesiones de Claude Code. El entorno cloud es
> **efímero** (el contenedor se borra al acabar), así que lo único que sobrevive
> es lo commiteado aquí. Este archivo es el "estado vivo" del proyecto entre sesiones.
>
> **Cómo se mantiene:** al terminar cada sesión, Claude añade una entrada nueva
> arriba del todo y actualiza el estado si algo cambió. Un hook `Stop`
> (`.claude/hooks/persist-memoria.sh`) commitea y empuja este archivo automáticamente.
>
> **🚨 Regla de tamaño (ahorro de contexto):** cada entrada, **máximo ~8 líneas**:
> qué se hizo, decisiones, pendientes y nº de PR. El detalle ya vive en el PR y en
> el código — NO re-narrarlo aquí. Fecha SIEMPRE en la primera línea `(dd/mm/aaaa)`.

## (03/11/2026) Fiscal · estudios de pisos y correduría (docs/fiscal/2026-11-*.md)
- Pisos: calificación capital inmobiliario OK; Bustos capital mobiliario OK. ⚠️ RDL 29/2026: alquiler ≤30 noches pasa de exento a IVA 10% desde 01/12/2026 SI se convalida (votación prevista 12/11). Mobiliario >300€ (TV 1.749€) debería amortizarse al 10%, no gasto íntegro: decidir con asesoría. Supremo anuló el NRA (19/05/2026); sigue VFT andaluz.
- Correduría: Alberto dice SIN retenciones y sin 130 (contradice la skill `perfil-fiscal`: 15% y modelo 190). Riesgos: 130 sin presentar, IVA de Anthropic/Vercel/Supabase sin autoliquidar (inversión del sujeto pasivo, 303/309 + ROI/349), gasolina y seguro del coche sin prueba de afectación (STS 1872/2024), Asisa ≤500€/persona. Motor deduce el TOTAL con IVA (correcto: actividades exentas).
- Fuentes oficiales (BOE/AEAT) no accesibles desde la sesión: todo a validar con Asecon.

## (03/11/2026) Fiscal · doble conteo P&L pisos + auditoría contable
- `lib/sivra/pl-mensual.ts`: los cargos de tarjeta con `factura_ref='(sivra:)gasto:<uuid>'` cuyo gasto existe ya no suman (helper `cargos-ya-facturados.ts` + test). 8 pares enlazados en BD (TV 1.749€, Amazon 247,92€ y 6 de Socorro); rollback en scratchpad. El conciliador que debe escribir el enlace al casar es `lib/conciliacion.ts` (`sivra:gasto:`).
- Póliza 061145138 (659,43€) descartada: era de un cliente (Rafael), no gasto. Correduría: 0 supermercados reales; 3 Asisa mal etiquetados → `seguro_salud`; 14 sin subcategoría clasificados; APROMES 72€ = cuota de la correduría; gasolina 300€ se queda en correduría por decisión de Alberto (riesgo: confirmar con asesoría).
- Auditoría: cuentas paradas (Pilar ···0302 desde 28/09, Kutxabank Pilar y N26 desde jul, BBVA ···2620 jun); ~770 movimientos con destino sin confirmar; 186 gastos sin Drive; 97 sin negocio; 19 con `titular_pendiente`; agosto con muy pocas reservas (¿faltan datos?); retenciones/pagos fraccionados null en el panel; Pilar: el motor proyecta sus ingresos desde un único mes (mayo, posible prestación exenta).

## (03/11/2026) Fiscal · carpeta Drive «Amazon deducible» revisada
- 13 facturas (304,01€), 12 emitidas a **Punto y Coma Gestión (B90446683)**. Por decisión de Alberto, 5 consumibles registrados como gasto de **Socorro** (33,37€: cafetera, fundas, pilas, Abenula) con `titular_pendiente='receptor_no_titular'`, conciliados con su cargo y renombrados en Drive; el motor fiscal los cuenta. El resto (bebé/personal) sigue `personal`.
- «Fregasuelos» = Roborock QV 35A, pedido 171-3879962-4037146 (01/08, 247,92€): confirmado por Alberto, registrado en Socorro (`menaje`, conciliado, mov. `213db534…`), SIN factura (solo confirmación de pedido; `factura_ref` NULL). Se envió a Costa Ballena (Rota), pero Alberto confirma (03/11) que está en Socorro: se queda como gasto del piso.
- Pendiente Alberto: descargar las facturas Amazon a su NIF (28823484E) y cambiar los datos de facturación.
## (03/11/2026) Fiscal · tarjeta Kutxabank 0300 importada + catastro Socorro cerrado
- Tarjeta Kutxabank 4662…0300 es de CRÉDITO: 246 movimientos nuevos (01/04–03/11), liquidaciones mensuales = `traspaso_interno`; Amazon → personal; ~50 sin clasificar. El aviso Telegram ya pide su extracto si se para (`fiscal-alertas.ts`).
- Valor catastral Socorro 150.549,25€ el piso entero (#5417): renta 2025 y motor correctos. Fly.io 6,68€ → correduría (factura a nombre de Manuel: pedirla a su NIF).
- Pendiente: `lib/sivra/pl-mensual.ts:139-168` cuenta dos veces gastos con factura en `gastos` Y cargo de tarjeta con piso (p.ej. TV 1.749€): falta enlace gasto↔movimiento. Extractos de Pilar, póliza 061145138, acciones antes del 31/12, asesoría.
## (03/11/2026) PR #5412 MERGEADO · facturas de plataforma: «✅ Pagar» hace pago REAL
- «✅ Pagar» de la alerta 🧾 lanza pago real (PIS Enable Banking o SEPA), no marca pagada. Ahora no se ofrece si la factura ya casa con un cargo (fail-closed). Sin pago para Si Que Brilla (se paga a mano; alerta de verificación: limpiezas por piso × LIMPIEZA_TARIFAS vs salidas, lavandería por huésped-noche ±15 %, sin histórico → «sin referencia»). Tarjeta (Fly/Vercel: débito Kutxabank en cuenta corriente, detectado por concepto): casa al importar extracto o PSD2, ±8 % divisa con cambio aproximado; aviso «sin cargo» solo lunes.
- Un cargo cierra una sola factura (`conciliar-par.ts` marca el movimiento `factura_ref='fp:<id>'`); doble pulsación bloqueada con estado `pago_iniciando`.
- BD: factura SQB 2025/444 (1.889,06€) conciliada con transferencia del 02/11; movimiento pasado a `turistico_pisos`. Octubre SQB: 1 limpieza menos en Dúplex y 2 menos en Luxury que salidas (posible paso a noviembre).
- Pendiente: probar en vivo que `tgEditMessage` quita botones del 🧾 anterior; histórico de lavandería solo 3 meses (la banda saltará a menudo).

## (02/11/2026) Auditoría lote 2 (rama `claude/auditoria-lote2`, PR por abrir)
- Hecho: vista de corredor con `usadoEn` atómico; `/api/acceso/solicitar` valida email; asegura-portal sin `devFallback`; bajas campana/recaptacion GET=botón, POST=ejecuta; ruta `subastas/fase3-debug` retirada; helper `secretoCoincide`/`autorizacionBearerValida` (core-identity, apto edge) en 10 crons plataforma, 5 rrhh, transporte, sivra y middleware (`?secret=` se mantiene, ahora en tiempo constante).
- Cepos: asegura-aislamiento reescrito (SQL sobre `seguros` con correduria_id o `correduriaUnica()`); nuevo rrhh `empresa_id`. Hook Stop timeout 30; `persist-memoria.sh` no empuja en main. ialimp `fetchSeguro` (SSRF); ia-rest `renderMd` escapa.
- Pendiente: identidad compartida `IDENTIDAD_CORREDOR_ID` (BD); tabla `subastas_debug_token` y `lib/subastas/portal-sesion.ts` sin uso; sivra `expenses/fijos/generar` y transporte `?key=`; comparaciones en asegura*/ialimp; `nombreEmpleado` sin filtro empresa en rrhh `notificar.ts`. Detalle: `docs/AUDITORIA-2026-11.md` §3.

## (02/11/2026) PR #5396 MERGEADO · `@central/module-cima` fase 2 (lógica pura)
- Port literal del CRM (`packages/module-cima`): parsers/mappers POL/REC/SIN/CEF, matching, cobertura, pipeline `runCimaPull` con deps inyectadas, `pull-puro.ts`; 751 tests, equivalencia golden con el CRM. Aún nada lo importa: la ingesta en producción sigue en el CRM.
- Siguiente: fase 3 capa BD Drizzle + persist/pull/candado; fase 4 sombra (replay 235 crudos en rama Supabase); fase 5 corte con interruptor `CIMA_ESCRITOR`.
- Ojo: `field-encryption` sin `PII_ENCRYPTION_KEY` fuera de production guarda EN CLARO (heredado del CRM).

## (02/11/2026) #5385 MERGEADO · arranca la unificación de la ingesta CIMA en central
- Auditoría completa mergeada (#5385). CRM `asegura` (app.grupoasegura.com): sin uso humano (Alberto: «Manuel no usa nada»); solo vive la ingesta CIMA.
- Decisión: NO mover el CRM entero; portar solo la ingesta (capa BD con Drizzle tal cual) y apagar el resto. Spec validada: `docs/superpowers/specs/2026-11-02-unificar-ingesta-cima.md` (+ `-fase0.md`).
- Riesgos clave: hoy ya hay 2 escritores (Actions del CRM + respaldo de plataforma) sin candado → fase 1 = candado en BD; confirmar a TIREA es irreversible; sombra = reprocesar los 235 crudos en rama Supabase.
- En curso: candado de ingesta (CRM + central) y bug enum `portal_bien_tipo` (Prisma ≠ BD, «mascota» rompe la lectura).

## (02/11/2026) Auditoría completa (12 agentes) + arreglos — docs/AUDITORIA-2026-11.md
- 🔴 cerrados: 11 server actions de /correduria sin guarda (cotización 0,50€); ia-rest con sesión forjable (x-ia-session, super/impersonate, seleccionar-restaurante); sivra/ialimp rutas sin auth; crons «Bearer undefined»; BD: `iarest.ejecutar_qa_patron` = SQL libre como postgres con la clave anon → REVOKE en 73 SECURITY DEFINER (migración APLICADA `migrations/20261102_auditoria.sql`, rollback al lado).
- Tope Codeoscopic con advisory lock; Next 15.5.28/16.4.4 (0 critical); ialimp solo cron `pms/sync` (ahora con Bearer); module-agenda borrado.
- Memoria rotada (rotar-memoria no veía `## (fecha)`): sept/oct a docs/memoria. 10 rutinas muertas borradas, 11 PRs draft cerrados.
- Proyecto Vercel `asegura` NO se borra: sirve app.grupoasegura.com (CRM de Manuel).
- Pendiente: checklist manual de Alberto en el informe (rotar ALERTA_TOKEN de 7 prompts, 5 rutinas http_api, edge functions sin auth: tg-send/test-runner/push-send/cobro-*).

## (02/11/2026) Ingresos 2026 pisos: neto real fijado · PENDIENTE cuadre Smoobu
- `incomes.amount_net_bank` (PR #5370, aplicado): si no es NULL el trigger NO recalcula comisión. Fijado en 151 Booking (Σ 82.413,08€, casando abonos banco con salidas: Duplex→BBVA …1175, resto→Kutxa …0855) + 2 Airbnb (990,37 / 524,60). Para corregir una fila: escribir `amount_net_bank`, no `amount`.
- Gastos: +30 gastos de cargos sin gasto (2.963,33€, `revisado=false`), PriceLabs a USD, 2 comisiones Booking descartadas. `expenses` obsoleta (todo está en `gastos`).
- PENDIENTE (siguiente sesión, requiere secreto `SMOOBU_API_KEY` en el entorno): cuadrar API Smoobu vs `incomes` 2026 (altas/bajas, canceladas, precio bruto vs `amount_gross`, fechas/piso) por mes y piso. Solo lectura.
- PENDIENTE Alberto: Expedia 3.398,50€ sin cobro (may–oct); CSV pagos Booking (15 reservas factor anómalo, 12 sin cobro, 36 abonos huérfanos); extractos tarjeta Kutxa …0300 (ago–oct, PSD2), N26 y BBVA …2620 (jul–oct), Pilar (cuenta jul–oct, tarjeta …0302 oct, Cajasur); Sique: 3 salidas oct sin facturar.

## (02/11/2026) Control 2026 pisos: expenses retirada · métrica «Gastos mes» sivra
- PR #5354 mergeado (lavandería redondeada). BD: 2025/421 → pagada (27/10); 2025/444 insertada en `limpieza_facturas`.
- `expenses` (34 filas, congelada 27/04) está 100 % en `gastos`; duplicados AFV NO borrados (inútil). `lib/adapters/sivra.ts` pasa a leer `gastos` (daba 0€ desde mayo) + guardián (visto en rojo).
- Hallazgo: luz/agua ene–abr con piso ROTADO entre tablas (Luxury/Duplex/Bustos); en auditoría `jefe-contabilidad` (scratchpad/anual/contabilidad). Sique 2026: 202 facturadas vs 204 salidas.

## (01/11/2026) Factura Sique Brilla octubre · cuadre por correo: lavandería redondeada
- La factura nº 2025/444 (octubre, 1.889,06€) llegó y el triaje la procesó, pero NO se guardó: lavandería venía «285 ud × 1,70 = 485,21» (kg redondeados) y `comprobarAritmetica` la marcaba.
- Arreglo en `lib/sivra/factura-cuadre.ts`: en lavandería se acepta si `round(total/precio) === unidades`; limpieza sigue estricta. Fixture octubre + brazo desviado (cepo visto en rojo).
- Cuadre real de octubre: Luxury 7 facturados vs 9 salidas, Duplex 8 vs 9, Socorro 6=6, Bustos 7=7 (faltan 3 cambios por facturar). Pendiente: tras mergear, reprocesar el correo para guardar la fila; Alberto revisa la discrepancia con Sique Brilla.

## (01/11/2026) Tarificador RPA · vehículo de referencia y presupuestos (#5321, #5326, #5332, #5337)
- Vehículo de referencia compartido por oportunidad: humano > Mapfre (matrícula) > póliza > Allianz; elección por similitud; si es supuesto → estimado. `presupuesto-rpa` se dispara con cualquier cierre (#5321).
- Generali 0.2.56 (elección a nivel modelo), 0.2.57 (procedencia por ramo: Mapfre→AUTOMOVILES), 0.2.58 (Historial Siniestral).
- Hogar en /probar desde póliza en vigor con supuestos (propietario, sin madera, UD→adosada) y número de calle ficha/Catastro/S-N. Adaptador Mapfre hogar listo pero APAGADO (`MAPFRE_HOGAR_ACTIVO=true` en el worker para la 1ª prueba).
- Decisión de Alberto: «coger el más similar, hay que dar precio y guardar presupuesto, ya iremos afinando»; regla «siniestralidad más favorable». El presupuesto NUNCA muestra «No figura»: hay que descargar el proyecto de la compañía con garantías (agente en curso para Mapfre auto).
- Presupuesto AS-26-0042 en borrador (Allianz+Mapfre auto), NO enviado.
- Pendiente: precio Generali, precio Allianz hogar, garantías Mapfre, fallo MEDIO en revisión (requiere_humano cuenta como cerrado → borrador prematuro), `probar` no vincula oportunidad en auto.

## (01/11/2026) Agente huésped: «ready before 15?» → compuerta de horarios · PR #5334 MERGEADO (`7d7c971`)
- Caso Elisa/Luxury Busto: la pregunta no traía verbo de llegada, quedó `general` y el juez LLM escaló con un falso «no está en la guía» (no ve el bloque EARLY CHECK-IN de Smoobu).
- `cambio-horario.ts`: nueva `RE_DISPONIBLE_ANTES` (EN/ES/IT, exige before/antes/prima) → `tipo:'entrada'`. Tests +2 (vistos en rojo).
- Pendiente: borrar `mensajes_guia_gaps` id 79 (hueco falso; el MCP pide confirmación que no llega desde el móvil: borrarlo a mano). Opcional: pasar la línea EARLY CHECK-IN al juez.

## (01/11/2026) Blog asegura-web · PR #5328 MERGEADO (mora art. 20 LCS)
- «No se pudo publicar» = `Tests (packages + guardián)` aún corriendo, no rojo. Graphify marcó error jurídico real.
- Corregido en `claude/blog-asegura` (`cae7a0c`): intereses de mora desde la FECHA DEL SINIESTRO (no día 41), mora también si no paga en 3 meses, sin contradicción «automática/reclamar». Cuerpo del PR actualizado (plataforma lee el artículo de ahí: `blog-pr.ts`).
- #5336: agente del blog blindado — síntesis lcs-18/20 exacta + cepo errorDeMora() (reparo `razonamiento`).
- #5328 MERGEADO (squash `8ea7844`) con CI verde, por orden de Alberto.
