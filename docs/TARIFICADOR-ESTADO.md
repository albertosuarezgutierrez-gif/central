# Tarificador Grupo ASegura: estado vivo

Actualizado: 07/11/2026

**Regla:** TARIFICAR no es EMITIR. Tarificar (obtener precio) pueden hacerlo el bot RPA o Avant2; emitir lo confirma siempre Alberto. Ningún canal emite sin su OK.

## 1. Decisión de canal (04/11/2026, PROVISIONAL)

- **Bot RPA** en la intranet de la compañía, para las compañías principales. Controla descuento y comisión con los mismos campos que se rellenan a mano.
- **Avant2** como comparador de apoyo, con la configuración que ya tenga en su panel. La configuración por compañía (preemisión, descuentos, opciones) vive en el panel de Avant2 y NO es legible por API. Cada alta de riesgo por API cuesta 0,50 €.
- Un único modelo de datos del riesgo alimenta ambos canales.

## 1b. Coste y estado de compañías en Avant2 (07/11/2026)

- **Coste según contrato** (Codeoscopic, «Contrato Workspace 2025.v2», 20/05/2026, cláusula séptima): «Api Rest modelo 3, importe de cotizaciones, 0.50 euros+IVA/cotiz». El contrato fija precio solo por cotización y NO menciona ReRate, pre-emisión ni emisión (ni como cobrables ni como gratuitas). Alberto lo confirma («solo por tarificar») y Codeoscopic también (02/10 y 06/11): desde el 07/11 ReRate/Submit cuentan 0 € en el libro (los topes de número siguen).
- **Pelayo** en Avant2: conectado, pero devuelve «Riesgo no asegurable» en perfiles fuera de su nicho. No es error: es selección de riesgo (Pelayo es barata para riesgos específicos).
- **Mapfre** en Avant2: producto 2026 VERIFICADO con la cotización real del 06/11 (auto, 11 precios). Generali: código 2115 (producto en piloto → ticket a Soporte).
- **Criterio de afinaciones del panel (Alberto, 07/11/2026):** los campos que DECLARAN el riesgo (alarma, domótica, prefabricada, animales, baños, póliza de comunidad…) van en su valor veraz por defecto (No / 0), nunca «Sí» para abaratar: un riesgo mal declarado deja el siniestro sin cubrir. El máximo solo en lo comercial (descuentos/comisión; el ReRate ya pide 50 y baja si la compañía lo rechaza). Lo que cambie por cliente sale de SUS datos, no de la afinación.
- **Qué devuelve la API:** al cotizar no mandamos esas opciones (aplica la afinación del panel). El GET gratis `…/offers/{oferta}/coverages` devuelve `formattedOptions` = etiqueta + valor aplicados (se guardan en `tarificacion_precios.opciones`), pero SIN el id del campo. Para mandar el valor real de un cliente hay que ponerlo en el ReRate (gratis) con el id del campo, que solo sale del formulario de Avant2 (como se hizo con los descuentos de Allianz/Generali el 03/10). Mapfre hogar aún no se ha cotizado por Avant2 (solo bots): pendiente ver sus campos en la primera cotización real.

## 2. Compañía × ramo × canal

| Compañía | Ramo | Avant2 (estado) | Bot (estado) | Bloqueo / siguiente paso |
|---|---|---|---|---|
| Allianz | Auto | ok hasta 15/10 | ok (23) | Ver nota 1 |
| Allianz | Hogar | 1 prueba (07/09) | ok (2) | Ninguno abierto |
| Allianz | Moto | no consta | ok | Ninguno abierto |
| Allianz | Patinete | no consta | en construcción | Flag ALLIANZ_PATINETE_ACTIVO=false: falta regla de avance, pantalla de precio y diálogo de municipio |
| Mapfre | Auto | ok hasta 15/10 | ok (69 en 60 días) | Variantes BASICar sin precio: tras el proyecto no hay selector visible; falta pilotaje (0.8.61 diagnostica) |
| Mapfre | Hogar | sin probar | ok (flag por entorno) | Activar el flag en el entorno |
| Reale | Auto | ok hasta 15/10 | sin bot | Decidir si se construye |
| Occident / Catalana | Auto y moto | ok hasta 15/10 | no consta | Ver nota 1 |
| Occident / Catalana | Hogar | no consta | desactivado | Exploraciones fallidas |
| Generali | Auto | error «Código 2115» | sin éxito | Falta grabación manual de Alberto |
| Generali | Moto | ok | no consta | Ninguno abierto |
| Fidelidade | Hogar | 1 prueba | solo exploración | Dirección del riesgo sin selector estable |
| Pelayo | Auto | en catálogo, sin probar en la cuenta | PILOTAJE: login, tomador (= mediador, datos solo en memoria), selección DNI y entrada al wizard y SSO resueltos (0.3.41–0.3.45) | Llamadas internas del wizard cortadas por el guard; en curso 0.3.47. TOPE DURO: nunca pasar de «Precio final» (pasos 5–7 = emisión) |
| AXA, Liberty, Zurich, Helvetia | Auto y hogar | en catálogo, sin probar | sin bot | Ninguno abierto |
| Mutua, Santa Lucía, Caser, Plus Ultra | Auto y hogar | sin cobertura conocida | sin cobertura | Ninguno abierto |

**Nota 1:** Avant2 no está averiado: desde el 15/10 no se le pide (política «bot primero» del 10/10; Avant2 solo con el botón 💶 de Telegram + confirmación de 0,50 €, #4873). Última petición 15/10: Allianz, Mapfre, Reale y Occident con precio; Generali error 2115.

## 3. Abierto ahora (04/11/2026)

- **Avant2:** spec y overview en `docs/avant2/`; qué se lee/fija por API y checklist del panel en `docs/AVANT2-CONFIGURACION.md`.
- **a)** Resuelto: Avant2 auto parado por diseño (bot primero), no por fallo. Para ver qué compañías tiene activas la cuenta: `GET /api/operador/codeoscopic/companias` (gratis, requiere secreto de operador).
- **b)** Consulta GET /insurance-vendors (gratis) para saber qué compañías tiene activas la cuenta.
- **c)** PR #5534: permisos de navegación en BD (0.3.46). Migración 2026-11-04d NO aplicada.
- **d)** 0.3.47: en pilotaje, abortar y registrar sin cerrar sesión, para descubrir todos los endpoints de una vez.
- **e)** Plan tras Pelayo: plantilla de alta de compañía; re-tarificación en lote de la cartera viva; vigilante nocturno de portales; caché de precios de 24 h; comprobador de coherencia antes de Telegram; panel de estado del bot en /correduria.

## 4. Pendiente de Alberto

- Compañías principales por volumen, en auto y en hogar.
- Variables SUPABASE_SERVICE_ROLE_KEY y NEXT_PUBLIC_SUPABASE_URL en Vercel, proyecto central-asegura (capturas del pilotaje).
- Grabación de Generali auto.

## 5. Cómo pilotar

- Workflow tarificador-relanzar.yml con accion=pilotar y entrada=compania:presupuestos:ramo.
- Comandos en seguros.tarificador_pilotaje_pasos: pulsar, rellenar, seleccionar, inspeccionar, esperar, volver, fin. Los datos personales van con el comando «dato» y una clave del catálogo, nunca en claro.
- Topes: 60 comandos / 30 min / 10 min sin comando.

## Ideas añadidas al plan (04/11/2026, Alberto: «añade todas»)
1. **Plantilla de alta de compañía** — tras el primer precio de Pelayo: recorrido común + ficha por compañía (dominios, pasos, pantalla de precio, inicio de emisión) + permisos en BD. Objetivo: compañía nueva en 1–2 pilotajes.
2. **Comparativa por nivel de cobertura** — HECHO (07/11: niveles + bot vs Avant2 en el aviso). agrupar ofertas (bot y Avant2) en terceros / terceros ampliado / todo riesgo con las coberturas guardadas y dar la más barata de cada nivel (hoy «la más barata» compara coberturas distintas).
3. **Corregir datos que hacen fallar** — HECHO (póliza anterior corregida el 04/10; equivalencia Mapfre 0.8.9/0.8.55 y, el 07/11, IA/memoria también para Mapfre con código sintético). Los fallos que quedan en Avant2 son de suscripción de la compañía.
4. **Matrícula por bot como primer paso de todo lead de coche** — modo `vehiculo` (0.3.48) rellena la ficha gratis antes de tarificar (activar tras probar con una matrícula real).
   - **Enganchado (07/11/2026), apagado:** paso `vehiculo_leads` del barrido (`tarificador-cola`, 5 min) encola UNA consulta por lead de coche abierto con matrícula y ficha sin marca/modelo/código/confirmar (marca `info_riesgo.vehiculoConsulta`) y rellena marca/modelo/versión/1ª matriculación sin confirmar. Encender: `TARIFICADOR_RPA_ACTIVO=1` + `TARIFICADOR_VEHICULO_ACTIVO=1` en central-asegura y redeploy. Probar antes con UNA matrícula real: `POST /api/operador/tarificador/vehiculo {matricula}` (Bearer operador) y leer `GET …/vehiculo/<trabajoId>`; BD hoy: 0 trabajos `vehiculo`, caché vacía, SQL 2026-11-04e aplicado, integración Allianz auto `rpa_autorizada`.
5. **Alarma de compañía sin precio** — HECHO (PR #5538; apagada con `TARIFICADOR_ALARMA_ACTIVA`, encender en Vercel central-asegura). Telegram si una compañía lleva 3 días sin precio o encadena errores (datos del panel de estado).
6. **Re-tarificación de cartera en vigor a 45 días del vencimiento** — bot primero; Avant2 solo con el botón 💶.
Pendiente de Alberto: capturas del panel de Avant2 (prompt de Claude en Chrome), URLs de los pasos de Pelayo, compañías principales por volumen, consulta del código 2115 de Generali a Codeoscopic.

## Decisión (04/11/2026, Alberto): comisiones fuera de Avant2
Avant2 se usa SOLO para tarificar y emitir. La comisión (de compañía y de correduría) no se toma de Avant2 (`brokerFee` no se usa ni se completa): sale de los movimientos de banco de Alberto y de CIMA.

## Decisión (05/11/2026, Alberto): renovación de Avant2
En una RENOVACIÓN solo se cotiza en Avant2 con la fecha confirmada y dentro de la ventana de 30 días (la oferta vale 15-30 días según compañía; correo Codeoscopic 06/11/2026); efecto = `fecha_efecto_actual` si es futura (anualidad nueva ya emitida), si no el vencimiento exacto; se emite con esa misma fecha (otra obliga a ReRate = otro cargo de 0,50 €).
Implementado en `apps/asegura/lib/codeoscopic/efecto-renovacion.ts` (corte gratis 422 en `prepararRetarificacion`: sin fecha, pasada, >30 días o sospechosa: efecto→vencimiento >400 días); una fecha forzada por el operador se permite y queda en el libro (`-efecto-forzado`). Guardián `test/regression-asegura-renovacion-efecto.test.ts`.
