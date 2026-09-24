# Borrador — correo a Codeoscopic sobre el coste del ReRate y del Submit

> 🚨 **SIN ENVIAR.** Lo manda Alberto, no un agente (regla de comunicaciones salientes de
> `CLAUDE.md`: nada sale a un tercero sin su OK para ESE envío concreto).
> Destinatario: Juan Manuel Fernández (Codeoscopic / Avant2), que ya contestó el 21/09/2026.

## Por qué se pregunta

Medido el 21/09/2026 leyendo el código: **el embudo de pago y el cupo diario solo cuentan las
tarificaciones**. Ni `/oferta` (ReRate) ni `/emitir` (Submit) pasan por `cotizar()`, así que no
escriben en `seguros.codeoscopic_consumo` y **el tope no los ve**. Los tratamos como facturables
únicamente porque el CRM anterior lo hacía; el portal del fabricante no documenta el coste de
ninguna de las dos.

Esto deja de ser teórico ahora: Alberto ha decidido (21/09/2026) que cuando el cliente acepte un
presupuesto desde su intranet, **el precio se reconfirme con la compañía**. O sea, una llamada de
ReRate que dispara el CLIENTE, no el corredor. Sin saber si factura, no se puede ni poner el tope
ni decidir qué se le permite al cliente.

## Texto propuesto

> Asunto: Consulta de facturación — ReRate y Submit en la API de Integra
>
> Hola Juan Manuel:
>
> Una consulta de facturación, para poder configurar bien nuestros topes de consumo.
>
> Sabemos que cada tarificación (la creación de un proyecto con sus cotizaciones) tiene su coste por
> consulta. Lo que no tenemos claro es qué pasa con las dos llamadas posteriores:
>
> 1. **La reconfirmación de una oferta** (el ReRate sobre una cotización ya existente): ¿se factura
>    como una consulta nueva, o va incluida en el proyecto que ya se pagó?
> 2. **La emisión** (el Submit de la oferta): ¿tiene coste propio?
>
> Y, si alguna de las dos factura: ¿cuenta contra el mismo cupo que las tarificaciones, o va por
> otro concepto en la factura?
>
> Lo preguntamos porque estamos montando un flujo en el que el cliente final confirma su presupuesto
> desde su área privada, y esa confirmación dispararía una reconfirmación de precio. Antes de
> abrirlo queremos tener el control de gasto bien puesto y no llevarnos una sorpresa en la factura.
>
> Gracias,
> Alberto Suárez — Grupo ASegura

## Qué se hace con la respuesta

- **Si facturan:** se cuentan en `codeoscopic_consumo` con su motivo propio (`rerate`, `submit`), el
  importe en variable de entorno, y el tope pasa a verlas. Es el PR del §5.2 de la spec.
- **Si NO facturan:** se anota aquí y en `apps/asegura/CLAUDE.md`, y el contador puede seguir
  contando solo tarificaciones sin que eso sea un agujero. Igualmente hay que registrar las
  llamadas, porque el gate de idempotencia de la aceptación del cliente lo necesita.
- **Si no contesta:** se asume que facturan (la duda sobre el dinero se resuelve hacia «esto
  cuesta») y se verifica contra la primera factura en la que aparezca una emisión.
