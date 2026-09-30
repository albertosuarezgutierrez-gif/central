# Borrador — correo a Codeoscopic: alta de cliente/lead, borrador de comercio y coste de ReRate/Submit

> 🚨 **SIN ENVIAR.** Lo manda Alberto, no un agente (regla de comunicaciones salientes de `CLAUDE.md`).
> Destinatario: Juan Manuel Fernández (Codeoscopic / Avant2), que ya contestó el 21/09/2026.
> 🔀 **Absorbe a `docs/BORRADOR-CODEOSCOPIC-COSTE-RERATE-SUBMIT.md`** (sus preguntas de coste van en el punto 3). No mandar los dos.

## Contexto (para Alberto, no va en el correo)

Queremos que al crear una oportunidad de COMERCIO (ramo que la API no tarifica: la spec solo trae
Car, Motorcycle, Home, TermLife, Health y Burial) el cliente/lead aparezca solo en Avant2, para tarificar
a mano sin reescribir el formulario. Hoy solo usamos `POST /insurances` (0,50 €).

**Qué hemos leído ya en su spec (MEDIDO en `docs/CODEOSCOPIC-API-PORTAL.md` y `docs/CODEOSCOPIC-API-REFERENCIA-2026-09.md`, snapshot del portal del 01/09/2026; el YAML no se ha podido re-descargar hoy: el proxy de la sesión bloquea `portal.api-int.codeoscopic.io`):**
- `Client` (16 operaciones): `GET|POST|PUT|DELETE /clients`, `/client-groups`, `/client-tags`, `/client-statuses`. Los `POST/PUT/DELETE` de clientes están marcados TBM. **Campos obligatorios de `POST /clients`: no los tenemos anotados.**
- `POST /insurance-drafts`: crea un borrador que se termina a mano en el asistente de Avant2; todos los campos opcionales salvo `insuranceLine`; `externalId` para buscarlo después; caduca a las 24 h. **No consta qué `insuranceLine` admite ni si devuelve una URL.**
- `ASM app` (2 operaciones): token SSO de app (caduca a 120 s) y borradores. Detalle de rutas no anotado. `POST /app-auth-tokens` da la cabecera `X-Client-App`.
- Comercio/PYME: **no documentado**. `GET /insurance-lines` (gratis) es la lista real de ramos de nuestra cuenta.

## Texto propuesto

> Asunto: Consulta — alta de clientes/leads y borradores por API (comercio) y costes
>
> Hola Juan Manuel:
>
> Tres consultas para dejar bien montada nuestra integración. Antes, lo que ya hemos leído en vuestro
> portal, para no preguntar lo documentado: sabemos que existen `/clients` (con POST/PUT/DELETE marcados
> como TBM), `POST /insurance-drafts` (solo `insuranceLine` obligatorio, caduca a las 24 h) y los
> endpoints de la sección «ASM app» (token SSO y borradores). Lo que no nos queda claro es lo siguiente.
>
> **1. Crear un cliente o lead sin tarificar.**
> a) ¿Se puede dar de alta un cliente (o lead) por API sin lanzar una cotización? ¿Con `POST /clients`,
> y exige la licencia Tesis Broker Manager (TBM)? Si sí, ¿cuáles son los campos mínimos obligatorios?
> b) ¿El `POST /insurances` ya da de alta al tomador como cliente en el CRM de Avant2, o solo crea el proyecto?
>
> **2. Borrador de un ramo que no tarificáis por API (comercio/multirriesgo).**
> Nos interesa el caso de comercio: no podemos tarificarlo por API, pero queremos que el corredor lo
> encuentre en Avant2 con los datos del cliente ya cargados. ¿Se puede crear por API un borrador de
> proyecto de comercio/multirriesgo, o de cualquier ramo sin tarificar? ¿Qué valor de `insuranceLine`
> habría que enviar, y aparece comercio en `GET /insurance-lines` para nuestra cuenta? Y ¿hay forma de
> abrirlo directamente en la web con los datos precargados (SSO desde la sección «ASM app»), o de
> obtener una URL del borrador?
>
> **3. Costes.** ¿Cuánto cuesta cada una de estas operaciones: crear cliente, crear borrador, obtener el
> token SSO? Y, para configurar nuestros topes de gasto, dos que ya teníamos pendientes:
> - La reconfirmación de una oferta (ReRate sobre una cotización existente): ¿se factura como consulta
>   nueva o va incluida en el proyecto ya pagado?
> - La emisión (Submit): ¿tiene coste propio? Y si alguna factura, ¿cuenta contra el mismo cupo que las
>   tarificaciones o va por otro concepto?
>
> Lo preguntamos porque vamos a automatizar estos pasos y queremos tener el control de gasto bien puesto
> antes de abrirlos.
>
> Gracias,
> Alberto Suárez — Grupo ASegura

## Qué se hace con la respuesta

- **Si hay alta de cliente/borrador gratis o barata y sin TBM:** al crear una oportunidad de comercio, `apps/asegura` llama al alta (no `POST /insurances`), guarda el id/`externalId` en la oportunidad y `/correduria` enseña el enlace. Cada llamada se cuenta en `codeoscopic_consumo`.
- **Si exige TBM:** se descarta; queda el flujo manual (o un borrador de un ramo soportado).
- **ReRate/Submit:** igual que en el borrador anterior. Si facturan, se cuentan con motivo propio (`rerate`, `submit`) y el tope los ve; si no contesta, se asume que facturan.
