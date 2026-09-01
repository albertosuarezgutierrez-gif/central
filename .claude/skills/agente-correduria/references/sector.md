# El sector — manual del agente de la correduría

> Acumulativo: cada ciclo el agente añade lo estructural que aprenda (por PR). Fecha cada
> adición. Lo coyuntural (titulares de la semana) va al informe de Telegram, NO aquí.

## 1. Marco regulatorio español (lo mínimo que un corredor no puede ignorar)
- **RD-ley 3/2020** transpone la **IDD** (Directiva de Distribución de Seguros): regula la
  distribución, la información precontractual y la formación. Deroga la vieja Ley 26/2006.
- **LCS — Ley 50/1980 de Contrato de Seguro**: el contrato en sí. Art. 22 (prórroga y
  oposición): el TOMADOR puede oponerse a la prórroga con **1 mes** de preaviso; el
  ASEGURADOR necesita **2 meses**. De ahí sale la ventana comercial de renovaciones.
- **DGSFP** (Dirección General de Seguros y Fondos de Pensiones): registro administrativo
  de mediadores. **Alberto = corredor de seguros, clave `CS-F/0170`** (persona física).
- Obligaciones del corredor: **análisis objetivo** (comparar un número suficiente de
  contratos del mercado — es lo que lo distingue del agente), información precontractual
  documentada, **seguro de RC profesional**, capacidad financiera, formación continua,
  y RGPD reforzado (salud en vida/decesos = categoría especial art. 9).
- Figuras de mediación: **corredor** (independiente, análisis objetivo, cobra comisión de
  la compañía y/u honorarios) vs **agente exclusivo** (una compañía) vs **agente
  vinculado** (varias, sin independencia). ASegura es correduría → corredor.

## 2. Operativa de una correduría (el día a día que el agente debe dominar)
- **Ciclo de una póliza:** tarificación → emisión → recibo (prima) → cartera →
  renovación/anulación. **Siniestro** = el momento de la verdad con el cliente.
- **Nueva producción vs cartera:** comisión de nueva producción (primer año) y comisión
  de cartera (renovaciones). El valor de una correduría ES su cartera: ingreso recurrente
  con tasa de caída (churn) baja si se trabaja la renovación.
- **Vencimientos = la máquina comercial:** 60-90 días antes del vencimiento se revisa la
  póliza, se retarifica en el multitarificador y se retiene o mejora. Una correduría que
  no trabaja vencimientos pierde cartera en silencio.
- **Recibos:** la compañía gira el recibo; la comisión llega por liquidación (CIMA/TIREA
  la estandariza). Impago de recibo → suspensión de cobertura (LCS art. 15) → aviso al
  cliente ANTES de que pase.

## 3. Estándares e infraestructura del sector
- **EIAC**: formato estándar de intercambio compañía↔mediador (ficheros de cartera,
  recibos, siniestros). Las compañías lo publican a diario; se descarga cuando se quiera
  (no es un stream: una pausa no pierde datos).
- **CIMA / TIREA**: plataforma de intercambio (liquidaciones, comisiones). La matriz de
  comisiones COBRADAS de plataforma `/correduria` sale de ahí (vía movimientos BBVA).
- **Multitarificadores**: el corredor tarifica N compañías de una vez. El de la casa es
  **Avant2 Sales Manager (Codeoscopic)** — ver §4.

## 4. Codeoscopic / Avant2 — LA fuente de tarificación y emisión
- Contrato **Workspace + API REST** firmado el **20/05/2026 a nombre de Alberto** (Grupo
  ASegura). Manuel (hermano) fue solo el integrador; sin relación contractual con
  Codeoscopic (dicho por su DPD, 22/05/2026).
- Panel Avant2 operativo a nombre de Alberto (alta abril/2026; recuperación de contraseña
  → su Gmail).
- **Compañías VIVAS en PRODUCCIÓN** (resumen de soporte del 09/06/2026 + alta posterior):
  **Allianz** (autos, motos, hogar, vida-riesgo) · **Mapfre** (autos, motos, hogar) ·
  **Reale** (autos, motos, hogar, comercios, comunidades, decesos, vida-riesgo) ·
  **Occident/Catalana** (auto, moto, hogar, comunidades, comercios) · **Fidelidade** (hogar,
  desde 14/07/2026). Pendiente: **Reale VIDA-RIESGO** devuelve «mediador no está activo» — hay
  que pedir a Reale que habilite al mediador para Avant2.
- 🔑 **Las claves de las compañías NO se generan en el panel**: el corredor se las pide a cada
  compañía y las manda a `soporte@codeoscopic.com`, que las configura. Por eso viajaron en claro
  por email (mayo-junio/2026, tickets 267334) — **pendientes de rotar**.
- **Entornos:** sandbox/integración `https://app-int.avant2.es` · producción, tenant propio
  `https://albertosuarezgutierrez.avant2.es`. ⚠️ **El host base de la API REST no consta en
  ningún correo de Alberto**: hay que sacarlo de la documentación, que la tiene Manuel.
- **Coste: 0,50€ — pero NO está claro por QUÉ se cobra, y no es un detalle menor.** El correo del
  CEO Ángel Blesa (09/04/2026) dice literal «se cobra **por cotización**», con ejemplo: recotizar
  el mismo coche añadiendo un conductor son «2 cotizaciones independientes». **Alberto lo recuerda
  como por EMISIÓN** (01/09/2026), y puede tener razón: ese correo es anterior al presupuesto del
  14/05 y al contrato C00 firmado el 20/05, que es el que manda. Los dos documentos que lo
  resolverían son PDF adjuntos y no se han podido leer. **Antes de construir cualquier automatismo
  que tarifique, confirmarlo en el contrato**: por cotización, una pasada sobre la cartera entera
  cuesta dinero y necesita tope; por emisión, tarificar es gratis. No lo des por sabido.

### 🚦 Dónde se paró EXACTAMENTE la API (03/06/2026) y qué falta
Reconstruido el 01/09/2026 desde el Gmail de Alberto y la BD. La plataforma web funciona; lo
congelado es la API REST, en un correo de Manuel a Juan Manuel Fernández (PM de la API) que
**nunca tuvo respuesta**. Tres puntos, ninguno resuelto:
1. **Credenciales de sandbox CADUCADAS** — usuario `albertocsf0170ws`, enviadas el 30/04/2026 por
   Bitwarden Send con TTL de 7 días. Se pidió regenerarlas el 03/06 y no llegaron.
2. **Basic Auth del webhook SIN DEFINIR** — pregunta abierta desde el 30/04: ¿las genera ASegura
   o las define Codeoscopic en su panel? Es literalmente «el último ítem para cerrar el receptor
   de webhooks de cara a producción».
3. **Smoke end-to-end sin correr** (Quote → preemisión → Submit → webhook).

- **Pero el flujo llegó a funcionar de verdad.** Medido en la BD: el **29/07/2026** una cotización
  de auto devolvió **15 precios reales de Mapfre, Allianz y Occident** (278,59€ a 609,64€), con el
  formato de la API (`id, premium, product, estimate, termMonths, downPayment, paymentMethod,
  referenceFromVendor`). Y el **21/05** hubo una **emisión real en sandbox** (nº 360447, avisada por
  correo). O sea: tarificar SÍ; emitir, nunca se cerró.
- **El webhook recibe y no correlaciona:** 2 eventos en `codeoscopic_webhook_events`
  (26/05 `emision_ok`, 24/06 `otro`), **los dos con `processing_error='project_not_found'`**. El
  canal de vuelta está abierto; lo que falta es casar el `project_id` de Codeoscopic con la fila.
- **Máquina de estados ya modelada por Manuel:** `cotizacion → preemision → emitida | rechazada |
  riesgo_condicionado | vencida | error`, con `submit_attempt_id` (idempotencia) y polling.
  Tablas `codeoscopic_projects/offers/prices/documents/participants/product_forms/webhook_events`.
- **DPA art. 28 RGPD: decisión abierta.** El DPD de Codeoscopic se niega a firmarlo con el
  integrador (no hay relación contractual con él) y solo remite su política de privacidad. Manuel
  lo consideraba requisito previo a producción.
- ⚠️ **La documentación de la API NO está en el Gmail de Alberto** (se mandó a Manuel). Sin ella no
  hay host base ni contratos de endpoints: es lo primero que hay que conseguir.
- Manuales de la PLATAFORMA (no de la API) sí están: ticket 267332 del 25/05/2026, más
  `academy.codeoscopic.com` y el KB `codeoscopicavant2.zohodesk.com`.

## 5. El negocio real de ASegura (estado 01/09/2026)
- Cartera en el Supabase de ASEGURA (leída en vivo por plataforma): **50 pólizas en
  vigor · 995 sin fecha · 27.793 históricas · 2.742 clientes · 29.858 leads · 7
  siniestros**. ⚠️ «Sin fecha» = enriquecimiento pendiente, no «no vencen».
- El CRM lo desarrolló Manuel (favor de hermano, arranque del proyecto) pero **el negocio
  y la web son de Alberto**. El CRM aún no está operativo (nadie lo usa a diario) → el
  traspaso a `apps/asegura` va sin ventana, paso a paso (`docs/TRASPASO-CORREDURIA.md`).
- Ingesta diaria EIAC de las compañías → entra en ese Supabase (cron de Manuel).
- **Inventario de la BD (01/09/2026, `public` del Supabase de ASEGURA).** Núcleo: `clientes`
  32.600 · `polizas` 28.843 · `cliente_telefonos` 4.794 · `cliente_emails` 4.017 ·
  `oportunidades` 3.676 · `bienes_asegurables` 1.614 · `poliza_coberturas` 1.425 ·
  `gestiones` 694 · `poliza_recibos` 186 · `cima_ficheros` 128 · `siniestros` 69 ·
  `liquidaciones` 9. Codeoscopic dejó tablas propias (`codeoscopic_offers`/`prices` 15,
  `projects` 1, `webhook_events` 2; `documents`/`product_forms`/`participants` vacías) →
  la integración llegó a funcionar en pruebas, no en producción.
- 🤖 **Manuel dejó montado el andamiaje de un BOT conversacional, TODO a 0 filas:**
  `whatsapp_kb_chunks`, `whatsapp_outbound_messages`, `channel_inbound_messages`,
  `bot_turn_traces`, `bot_eval_runs`, `bot_eval_scores`. Es exactamente la Fase 3 de este
  agente: cuando llegue, **mirar primero ese esquema** en vez de inventar uno.
- **Frescura (01/09/2026):** `cima_ficheros` último 30/08 → la ingesta CIMA sigue viva.
  `polizas`/`clientes` sin altas desde el **24/08**; `oportunidades` desde jun/2026. No
  confundir «no hay altas» con «la ingesta está rota»: son cosas distintas y hay que mirar
  cuál de las dos es antes de afirmar nada.
- **Vencimientos (01/09/2026, con la regla de vigencia de `@central/module-seguros`): 5 en 30 días,
  7 en 60, 13 en 90**, con **3.899,05€** de prima conocida a 90 días y **4 pólizas sin prima
  informada** (Allianz no la manda por EIAC). ⚠️ Un primer conteo dio «6 y 8» porque contaba por
  `fecha_vencimiento` a secas, sin filtrar el estado: colaba pólizas **canceladas (`situacion='AN'`)**
  con vencimiento futuro. La fecha sola no dice que una póliza esté viva.
- **La cartera VIVA son las 59 pólizas con `situacion='EV'`** (37 auto · 13 hogar · 8 RC · 1 moto;
  Mapfre y Allianz). Las 25.892 `vencida` (2013→2018) y las 830 `en_renovacion` (2023-24) son
  histórico heredado. Ramos DGS observados en la cartera: **241** en auto/moto, **2151** en hogar,
  **282** en RC — el campo semántico fiable es `polizas.tipo`, no `ramo_dgs`.
- **Ventana comercial (LCS art. 22), ya implementada:** a más de un mes del vencimiento el tomador
  puede oponerse a la prórroga y la póliza se puede mover; a menos de un mes se prorroga sí o sí.
  Helper puro `@central/module-seguros/vencimientos` (`urgenciaRenovacion`, `fechaLimiteOposicion`,
  `primaEnRiesgo`), consumido por el puerto `/api/operador/vencimientos` de asegura y pintado en
  plataforma `/correduria`.
- **🔑 EL OBJETO ASEGURADO: dónde vive y qué se puede leer (01/09/2026).** «Auto · Mapfre ·
  431,85€» no identifica una póliza: el mismo tomador puede tener tres coches. El dato del bien
  vive en **`polizas.datos_especificos`** (JSON libre que escribe la ingesta EIAC, distinto por
  ramo) y, para lo que no tiene bien, en **`poliza_coberturas.descripcion`**. Medido sobre la
  cartera entera:
  - **auto/moto** → `matricula` (4.506 filas, **EN CLARO**), `marca`/`modelo` (~1.420 cada uno),
    `version`, `anio`, `combustible`, `tipoVehiculo`. ⚠️ **La clave `vehiculo` (2.781 filas) NO es
    una descripción: contiene la MATRÍCULA.** Pintarla como modelo es inventarse el dato.
  - **hogar** → `localidad` (181) y `cp` (330) en claro, `metrosCuadrados`, `anioConstruccion`,
    `continente`/`contenido`. La **`direccion` (172) viene CIFRADA** (`v1:iv:cipher:tag`,
    AES-256-GCM, clave `PII_ENCRYPTION_KEY` que hoy vive en el Vercel de Manuel). Sin esa env se
    dice **«cifrado»**, que NO es «sin dato»: el dato existe y aparecerá solo el día que la clave
    llegue con el traspaso (`descifrarDireccion` en `apps/asegura/lib/cartera.ts` ya lo intenta).
  - **RC (81) y comercio (110)** → `datos_especificos` NO trae nada útil; lo que identifica una RC
    son sus **modalidades** (`poliza_coberturas`: «Básica», «Locativa», «Accidentes de trabajo»).
    Solo 9 de las 81 RC tienen coberturas cargadas. Comercio sí trae `actividad` (28).
  - **vida / salud / decesos / accidentes** → no hay bien: son seguros de PERSONAS. Ausencia
    **definitiva**, no «pendiente» — prometer una pasada futura que traiga el dato sería mentir.
  - `_estado_legacy_pre_loo695` es ruido de una migración del CRM, no un dato.
  Helper puro **`@central/module-seguros/objeto`** (`objetoAsegurado`) con **cuatro** salidas
  (`conocido` · `no_informado` · `cifrado` · `sin_objeto`); lo consumen el puerto
  `/api/operador/vencimientos` de asegura, la columna **«Qué asegura»** de plataforma `/correduria`
  y el aviso de renovaciones por Telegram. **Al informar a Alberto de una renovación, di SIEMPRE
  qué asegura** — sin eso el aviso no sirve para llamar. Y sigue vigente la regla de PII: en
  informes y chats, agregados; la matrícula solo si Alberto pregunta por un caso concreto.

## 6. Novedades 2026 y argumentario de renovación (investigado 01/09/2026)
> ⚠️ Verificado contra fuentes secundarias del sector (INESE, UNESPA, ICEA, DGSFP): el proxy de la
> sesión bloquea `boe.es` y `dgsfp.mineco.gob.es`, así que **antes de citarle una norma a un cliente
> o a una compañía, hay que leer el texto oficial**. Lo marcado «no confirmado» NO se afirma.

- **⚡ Oportunidad comercial directa: seguro obligatorio de RC para VMP/patinetes** (RD 52/2026, BOE
  30/01/2026) + registro en la DGT con etiqueta. Encaja con una cartera de auto/hogar y es venta
  cruzada sobre clientes que ya están. ⚠️ Las fuentes discrepan en la fecha efectiva (02/01 por la
  Ley 5/2025 vs 30/01 por el RD): comprobar antes de usarlo en una campaña.
- **Ley 10/2025 de servicios de atención a la clientela** — adaptación hasta el **28/12/2026**.
  Atención gratuita, 95% de llamadas en <3 min y **derecho a hablar con una persona: el servicio no
  puede basarse solo en bots**. 🚨 **Esto condiciona la Fase 3 de este agente**: un bot que atienda
  clientes necesita escape a persona por diseño, no como añadido. ⚠️ No confirmado si el ámbito
  subjetivo alcanza a una correduría pequeña — leer el artículo de ámbito antes de dar nada por hecho.
- **Baremo de autos**: reforma con efectos 01/01/2026 (Ley 5/2025, amplía «hecho de la circulación»)
  y actualización **+2,9%** para 2026. Sube la siniestralidad de autos y RC.
- **Prioridades de supervisión DGSFP 2026-2028**, por primera vez con apartado propio de mediación:
  diseño de producto, **relación coste/valor**, calidad del asesoramiento. Endurece el enfoque de conducta.
- **Revisión de la IDD (paquete RIS)**: aplicación estimada ~julio 2029. Estructural para el modelo de
  correduría (prohibiría retener comisiones a quien asesore de forma independiente). Radar, no acción.

**Argumentario de renovación (con datos, no impresiones):**
- La subida no la decide la compañía, la decide el coste del siniestro: **recambio +9%**, coste de
  reparación **+3,3%** (contra IPC 2,2%), baremo **+2,9%**. Traducir la subida a causa verificable.
- **Cartera vs nueva producción, canal corredor 2T 2026** (Asegurómetro): auto cartera 470€ (+4,7%)
  frente a nueva producción 441€ (**−2,2%**). Existe precio de captación → **re-tarificar en otra
  compañía antes que perder al cliente**. Hogar: mercado ~319€ (+6%), canal corredor 329€ (+3,9%).
- **Hogar: el argumento no es el precio, es el INFRASEGURO.** Con la inflación de construcción, un
  capital desactualizado activa la regla proporcional en el siniestro.
- **🔑 La palanca legal más útil (LCS art. 22.3 + criterio DGSFP): una subida de prima es una
  MODIFICACIÓN del contrato, no una prórroga**, así que el asegurador debe comunicarla con **2 meses**
  de antelación. Sin ese preaviso no puede imponerla: el contrato se prorroga en los términos
  anteriores. Implementado en `comunicacionEnPlazo` — y devuelve `null` cuando no consta la fecha de
  comunicación, porque afirmar que una subida es inoponible sin tenerla mandaría al cliente a discutir
  con la compañía con un argumento falso.
- **STS 141/2020**: si el ASEGURADOR se opuso a la prórroga por el art. 22, NO aplica el mes de gracia
  del art. 15.2 — no hay cobertura adicional tras el vencimiento.
- ⚠️ Titular de prensa de 24/02/2026 («prohíben subir la póliza del coche sin avisar con dos meses»):
  **no es una ley nueva**, es el art. 22.3 de siempre. No citarlo como cambio normativo.

**No confirmado (pendiente de fuente primaria):** la tabla de códigos de ramo EIAC la custodia TIREA y
no está publicada, así que **241 / 2151 / 282 no están verificados** — y muchas compañías usan códigos
propios además del estándar. Por eso el campo semántico que se usa es `polizas.tipo`, no `ramo_dgs`.

## 7. El activo dormido
- Los **29.858 leads** son el activo comercial dormido: nadie los trabaja hoy. RGPD manda:
  verificar base de legitimación antes de cualquier campaña (fase 3, con OK de Alberto).
