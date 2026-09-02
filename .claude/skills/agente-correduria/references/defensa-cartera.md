# Defensa de cartera — el agente que pelea la renovación (idea de Alberto, 01/09/2026)

![Flujo](./defensa-cartera-flujo.jpg)

> Idea de producto de Alberto, guardada tal cual la dibujó. **No está implementada**: esto es
> el destino, no el estado. Lo que sí existe hoy está marcado ✅ abajo.

## El flujo

```
Recibo de precartera
        ↓
🤖 Agente IA «Defensa cartera»  (analiza recibos · servicio NOCTURNO)
        ↓ cumple reglas
   Tarificar riesgo
        ↓
   Analizar primas: NUEVA PRODUCCIÓN vs CARTERA
        ├──→ Pantalla «desviación de recibos»
        └──→ (configuración de avisos) → Generar respuesta al cliente
```

## Por qué esto es lo correcto para una correduría

La renovación no se pelea con el vencimiento: se pelea con **el recibo de precartera**, que es
cuando la compañía te enseña la prima del año que viene ANTES de girarla. Ahí es cuando todavía
se puede hacer algo. El agente convierte ese aviso en tres cosas: saber cuánto sube, saber si el
mercado da algo mejor, y tener la respuesta al cliente escrita antes de que llame él.

La comparación **nueva producción vs cartera** es la palanca medida del sector (Asegurómetro
2T 2026: auto en cartera 470€ **+4,7%** frente a nueva producción 441€ **−2,2%**). El precio de
captación existe: si tu compañía sube y otra capta más barato, la póliza se mueve en vez de
perderse. Eso es exactamente lo que hace este flujo.

## Qué hay ya construido ✅

- **Vencimientos con la ventana legal** (`@central/module-seguros/vencimientos`): urgencia por el
  preaviso de UN MES del tomador y fecha límite de oposición (LCS art. 22).
- **Preaviso de DOS MESES del asegurador** (`comunicacionEnPlazo`): si la compañía no comunicó la
  subida a tiempo, no puede imponerla. Es el argumento más fuerte del flujo y ya está codificado.
- **Puerto de lectura de la cartera** y **aviso automático** por Telegram (cron diario 06:30).
- **Prima que la compañía no informa = `null`**, nunca 0 €.
- **El calendario del CLIENTE (02/09/2026)**: `seguros.portal_obligacion` + el aviso por correo. La
  fecha que se le enseña es la **accionable** (vencimiento − 30 días del art. 22), no la del
  vencimiento, y solo generan obligación las pólizas de CIMA (`import_ref IS NULL`). El envío vive en
  `apps/asegura` porque el portal solo guarda hashes y **no tiene destinatario al que escribir**, y
  va **apagado** (`ASEGURA_AVISOS_ACTIVOS`). Ojo a la frontera: eso es un aviso **informativo**, no
  es todavía la «respuesta al cliente» de este flujo (punto 4).

## Qué falta, por orden de dependencia

1. **La fuente «recibo de precartera».** Hoy `poliza_recibos` tiene `situacion` (cobrado ·
   pendiente · devuelto · anulado) y `clase_recibo` (CA · SU · NP). Hay que confirmar **cuál de
   esos estados es la precartera** contra un fichero EIAC real antes de construir nada encima:
   equivocarse aquí es avisar de recibos que ya están cobrados.
2. **Tarificar riesgo** → depende de la API de Avant2 (Codeoscopic). El host base ya está cerrado;
   lo que sigue bloqueado son las credenciales de sandbox (no hay sandbox utilizable, así que toda
   cotización es REAL y facturable).
   🚨 **CUÁNDO SE COBRA: resuelto el 01/09/2026 — se cobra POR COTIZACIÓN, 0,50€.** Dos fuentes
   escritas y coherentes (correo del CEO Ángel Blesa del 09/04/2026 y presupuesto de Cristina
   Ferreiro del 14/05/2026, en el texto del correo); el recuerdo de Alberto («por emisión») queda
   descartado. Detalle en `sector.md` §4. **Consecuencia para ESTE flujo, que es la que manda:** la
   pasada nocturna sobre la cartera tiene coste real —retarificar las 109 vivas ronda los 54,50€ por
   pasada— y además la llamada **NO es idempotente**: un reintento crea otro proyecto y otro cargo.
   Por eso el bucle se diseña con **contador y tope en BD** (`seguros.codeoscopic_consumo`, ya
   construido), **una sola tentativa por riesgo**, y **la vigilancia periódica mira la FECHA, que es
   gratis** — nunca tarifica sola. Vigilar mensualmente a 4.000 leads serían 2.000€/mes.
3. **Pantalla de desviación de recibos**: prima nueva vs prima anterior vs mediana de mercado.
   El helper del titular va PURO y testeado, como el resto.
4. **Generar respuesta al cliente** → es **Fase 3** y no se activa sin diseño de canal + OK
   explícito de Alberto. Que ya exista un canal de correo (el del portal y el de los avisos) **no lo
   adelanta**: un aviso de vencimiento es información; «tengo mejor oferta para ti» es
   **asesoramiento** y arrastra análisis objetivo e IPID. Y **WhatsApp sigue sin existir** (no hay
   WABA): es un puerto sin adaptador, y `503 canal_no_disponible` no es `502 envio_fallido`.
   🚨 Además la **Ley 10/2025 de atención a la clientela** (adaptación hasta
   el 28/12/2026) prohíbe que el servicio se base solo en bots: el escape a persona se diseña
   desde el principio, no se añade después. El andamiaje de bot que dejó Manuel en la BD
   (`whatsapp_kb_chunks`, `channel_inbound_messages`, `bot_turn_traces`…, todo a 0 filas) es el
   sitio donde mirar antes de inventar un esquema nuevo.

## Reglas que no se negocian en este flujo

- **Nada sale al cliente sin que Alberto lo apruebe.** El agente redacta; envía él.
- Una subida detectada **no se afirma como inoponible** sin la fecha de comunicación de la
  compañía: `comunicacionEnPlazo` devuelve `null` cuando no consta, y ese `null` se pinta.
- «No he podido tarificar» y «no hay nada mejor en el mercado» son cosas distintas y la pantalla
  tiene que poder decir las dos.
