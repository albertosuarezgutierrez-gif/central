# 🧾 Prompt para el Claude de Manuel — traspaso de la integración Codeoscopic/Avant2 (tarificación)

> **Contexto (01/09/2026):** Manuel pidió un prompt para pasárselo a SU Claude (el que tiene acceso a su
> repo del CRM) y que le saque todo lo necesario para que `central` pueda conectarse a la API de
> Codeoscopic (Avant2) y tarificar. Lo que ya sabemos de nuestro lado está en la skill
> `agente-correduria` (`references/sector.md` §4) y en `docs/TRASPASO-CORREDURIA.md`. Lo que NO
> tenemos y este prompt va a buscar: la documentación de la API (host base incluido), los contratos de
> endpoints, el detalle del webhook y los nombres de las envs.
>
> **Este texto se lo envía Alberto a Manuel** (regla de comunicaciones salientes: lo manda él).
> Cuando llegue la respuesta, contrastarla contra `references/sector.md` §4 y actualizar allí.

---

## El prompt (copiar desde aquí hasta el final)

```
Hola. Soy el asistente de Alberto Suárez (Grupo ASegura, corredor CS-F/0170). Este repo
que tienes delante lo desarrolló Manuel e incluye una integración con Codeoscopic /
Avant2 Sales Manager (multitarificador de seguros; contrato Workspace + API REST a
nombre de Alberto). Estamos traspasando la correduría a la infraestructura de Alberto y
necesito reconstruir en su lado la parte de TARIFICACIÓN (cotizar; la emisión NO, está
tras un flag que nunca se activó y así se queda por ahora).

Sé que la cotización llegó a funcionar de verdad: el 29/07/2026 una cotización de auto
devolvió 15 precios de Mapfre, Allianz y Occident, y el webhook recibió eventos (aunque
con processing_error='project_not_found'). O sea que todo lo necesario está en este
repo. Léelo del código real, no de memoria, y genera UN único documento markdown de
traspaso con exactamente estas secciones:

1. DOCUMENTACIÓN Y HOSTS
   - Dónde está la documentación de la API de Avant2 (PDF en el repo, link, wiki…).
     Si es un fichero, di su ruta para que Manuel lo adjunte.
   - Host base de la API REST en sandbox y en producción (sabemos que la web es
     app-int.avant2.es / albertosuarezgutierrez.avant2.es, pero el host de la API no
     nos consta en ningún sitio). Versión de la API si está pineada.

2. AUTENTICACIÓN
   - Esquema exacto (Basic, token, API key, usuario WS…), en qué cabecera/campo viaja,
     y qué credenciales hacen falta (nos consta un usuario de sandbox
     `albertocsf0170ws`, caducado desde jun/2026).
   - Quién emite/regenera esas credenciales (¿soporte@codeoscopic.com? ¿el PM de la
     API, Juan Manuel Fernández?) y si hay algún ticket o hilo referenciado en el
     código o en comentarios.

3. FLUJO DE TARIFICACIÓN, ENDPOINT A ENDPOINT
   - La secuencia completa implementada: crear proyecto/cotización → obtener precios
     (¿polling? ¿webhook?) → preemisión → submit. Para cada paso: método HTTP, ruta,
     y un payload de ejemplo REAL sacado del código o de fixtures — pero ANONIMIZADO
     (sin nombres, DNIs, matrículas ni datos personales reales; sustitúyelos por
     valores de ejemplo).
   - Cómo se leen los precios de la respuesta (sabemos que el formato trae id,
     premium, product, estimate, termMonths, downPayment, paymentMethod,
     referenceFromVendor).
   - Ficheros/módulos concretos donde vive el cliente HTTP y este flujo (rutas dentro
     del repo).

4. FORMULARIOS DE PRODUCTO
   - Qué campos exige una cotización por ramo (auto al menos; hogar si está), si los
     formularios se descargan de la API (tabla codeoscopic_product_forms) o están
     cableados, y de dónde salen los catálogos (marcas/modelos de vehículo, etc.).

5. WEBHOOK
   - Ruta del receptor en la app y qué URL quedó registrada en Codeoscopic.
   - El Basic Auth del webhook: quedó SIN definir en abril/2026 (¿lo genera el
     cliente o lo define Codeoscopic en su panel?). Di qué hay implementado y qué
     quedó pendiente.
   - Por qué los eventos acaban en processing_error='project_not_found': cómo se
     correlaciona (o se debería correlacionar) el project_id de Codeoscopic con la
     fila local.

6. MÁQUINA DE ESTADOS Y TABLAS
   - El ciclo cotizacion → preemision → emitida | rechazada | riesgo_condicionado |
     vencida | error: qué paso escribe en cada tabla codeoscopic_* y qué lanza las
     transiciones.
   - La idempotencia: para qué sirven submit_attempt_id y submit_in_flight_at y hasta
     dónde llega (nos consta que Codeoscopic NO deduplica por attempt_id).
   - El flag de emisión: su nombre exacto y dónde se lee.

7. VARIABLES DE ENTORNO
   - NOMBRES de todas las envs relacionadas con Codeoscopic (URL base, credenciales,
     secretos del webhook, el flag…), con una línea de qué es cada una.
   - ⚠️ NUNCA pegues los VALORES en el documento: los valores se pasan aparte por
     gestor de contraseñas.

8. PENDIENTES Y COSTE
   - Lo que quedó abierto para llegar a producción, tal y como conste en el código,
     TODOs o docs del repo (nos constan tres: regenerar credenciales de sandbox,
     definir el Basic Auth del webhook, y el smoke end-to-end Quote → preemisión →
     Submit → webhook).
   - El coste ya lo tenemos confirmado (0,50€ POR COTIZACIÓN, facturación a mes
     vencido). Lo que necesito saber del código: si lleva algún CONTADOR o TOPE de
     cotizaciones (para no tarificar en masa sin control) y dónde vive. Si no hay
     nada, dilo — lo pondremos nosotros.

Reglas del documento:
- Todo leído del repo real, con rutas de fichero citadas. Si algo no está en el repo,
  escribe «no está en el repo» — no lo rellenes con conocimiento general de Avant2.
- Cero secretos (solo nombres de variables) y cero datos personales (ejemplos
  anonimizados).
- Un solo markdown, listo para enviar.
```

---

## Qué hacer cuando Manuel conteste

1. Volcar lo aprendido a `.claude/skills/agente-correduria/references/sector.md` §4 (por PR).
2. Con el host base + esquema de auth: pedir a Codeoscopic la regeneración de credenciales de
   sandbox (borrador para Alberto; lo envía él).
3. Confirmar el coste 0,50€ en el contrato C00 **antes** de construir ningún automatismo que
   tarifique (regla ya anotada en sector.md).
