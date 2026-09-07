# Agente de captación dentr del portal del cliente (asegura-portal) — diseño

> Dictado por Alberto, 07/09/2026, en varias vueltas de conversación. Objetivo: que la propia
> intranet del cliente (`apps/asegura-portal`) haga el trabajo de captación y venta cruzada que hoy
> haría un comercial, sin caer en asesoramiento no regulado (RDL 3/2020) y sin depender de WhatsApp
> (no hay WABA de Grupo ASegura todavía).
>
> Este documento consolida la conversación; no sustituye al banco de ideas
> (`docs/CORREDURIA-INTRANET-IDEAS.md`), que sigue siendo la referencia de ideas sueltas — este spec
> es la versión comprometida de las ideas B, C, D, H y (parcialmente) G y F de ese documento.

## La tesis

El portal ya existe para que el cliente "mire sus pólizas". La idea de Alberto es que, además, el
propio portal **pregunte, recuerde y compare** — sin que Alberto tenga que escribir a nadie a mano y
sin que un sistema automático decida por el cliente. El límite que sostiene todo el diseño:

> **La IA lee y pregunta. Nunca opina, nunca recomienda, nunca decide por el cliente.**

Esto no es una precaución de estilo: es la misma línea que ya está escrita en
`docs/CORREDURIA-INTRANET-IDEAS.md` (regla 5) — *"un aviso de «tengo mejor oferta para ti» es
asesoramiento, no información"* — y en todo el portal existente (la IA de `extraer-poliza.ts` solo
extrae campos, nunca opina sobre ellos).

## Las cinco piezas

### 1. El cuestionario de huecos ("agente con guion fijo, no chat libre")

Al entrar en la bóveda, por cada ramo del catálogo (`auto, moto, hogar, vida, salud, decesos,
responsabilidad_civil, comercio, comunidades`) que el cliente NO tiene en su cartera con Grupo
ASegura, se le pregunta si lo tiene en otro sitio.

- **Tri-estado, nunca binario**: Sí / No / No lo sé. Un "no preguntado" no puede colapsar en "no
  tiene" (misma regla que el resto de la casa).
- **Los mensajes del agente son SIEMPRE de una plantilla fija**, revisada una vez y no generada en
  vivo por un LLM. Se siente conversacional (una pregunta cada vez, tono cercano) pero no es un chat
  libre.
- La IA solo interviene para **entender la respuesta libre del cliente** cuando no pulsa un botón
  (p. ej. escribe "el del coche ya lo tengo con vosotros, pero la moto no sé"), nunca para redactar
  contenido nuevo sobre seguros.
- Aplica a **cualquiera que entre al portal**, no solo a los 80 clientes vivos — es la misma tesis
  del producto: sirve también a los ~32.500 leads.

**Dato nuevo:** tabla `seguros.portal_pregunta_ramo` (identidad_id, ramo, respuesta
`si|no|no_se`, respondida_en). **Append-only** (como el resto del portal): una respuesta nueva no
borra la anterior, por si el cliente cambia de opinión.

### 2. Subir la póliza y leerla (ya existe, se reutiliza)

Si responde "sí, la tengo en otro sitio", se le ofrece subir el documento. Reutiliza el flujo YA
construido: `POST /api/polizas` → `extraerPoliza()` → se guarda como `declarado` en la bóveda,
alimentando el calendario de vencimientos que ya existe. **No hace falta ninguna pieza nueva aquí.**

### 3. Resumen de garantías (pieza nueva)

Alberto pidió que, al subir la póliza, la IA haga además un resumen en lenguaje llano de qué cubre y
qué excluye — no solo los campos estructurados que ya extrae hoy.

- Tercera pasada de IA (o ampliación de la 2ª de `extraer-poliza.ts`) sobre el mismo texto/imagen ya
  leído. Nunca una llamada nueva al Catastro ni a Avant2.
- **Solo hechos del documento**: coberturas, exclusiones, capitales/límites si constan. **Prohibido**
  cualquier juicio de valor ("cubierto de sobra", "mejor que la media", "te conviene ampliar") — cepo
  de frases prohibidas desde el día uno, mismo patrón que ya usan `ramos.test.ts` (asegura-web) y los
  guardianes de frases del portal (parte de siniestro, canal-compañía).
- Lleva siempre el aviso que ya usa el resto del portal para lo leído por IA: "esto lo hemos leído
  nosotros del documento, verifica las condiciones — no es un documento contractual".
- Se enseña también en `/correduria` cuando esa póliza es candidata de la pieza 5 (cambio de
  mediador): Alberto no tiene que abrir el PDF para saber qué tiene el cliente.

### 4. Recordatorios a la carta (pieza nueva)

Si el cliente no tiene la póliza a mano, el agente ofrece recordárselo cuando él diga ("mañana",
"el jueves a las 5", "cuando tú me digas").

- Tabla nueva `seguros.portal_recordatorio` (identidad_id, tipo, cuando, canal, estado
  `pendiente|enviado|cancelado`).
- La IA se usa **solo para convertir la fecha/hora en lenguaje natural a un timestamp** — la misma
  clase de tarea (extracción factual) que ya hace en todo el portal, nunca para redactar el
  contenido del aviso.
- Un cron dispara el envío en su momento — mismo patrón que `avisos-vencimiento` de `apps/asegura` —
  con un enlace directo a "sube tu póliza aquí".
- **Canal: hoy solo email** (el puerto `lib/canal.ts` ya existe). WhatsApp se añade el día que haya
  WABA de Grupo ASegura, sin tocar el resto — es un puerto, no un `if`.
- **Consentimiento resuelto por diseño**: como lo pide el propio cliente dentro de una sesión suya,
  es un aviso de servicio (él lo solicitó), no marketing — no necesita el opt-in de campaña
  (`portal_consentimiento.comercial`) que sí haría falta para escribir en frío.

### 5. Cambio de mediador (idea H del banco de ideas, sin cambios)

Si el cliente confirma que tiene una póliza con otra compañía, la vía más barata es nombrar a Grupo
ASegura mediador de ESA póliza: carta pre-rellenada (con lo leído en la pieza 2) + firma electrónica
(`core-firma`, eIDAS, mismo `otp_email` que ya usa el portal para entrar). Cliente sin tarificar y
sin gastar un euro; la póliza empieza a entrar por CIMA.

### 6. Comparación transparente (pieza nueva, la más sensible — necesita presupuesto real)

Alberto quiere que, además de leer la póliza ajena, el agente la compare con un presupuesto de Grupo
ASegura. **Esto es información, no asesoramiento, SOLO si se construye así:**

- Tabla de comparación **generada automáticamente**, campo a campo: coberturas, capitales,
  franquicias, precio — lo leído de la póliza ajena (pieza 2) contra el presupuesto real.
- **Cero texto de conclusión.** Nada de "mejor", "te conviene", "recomendado", ni un resaltado visual
  que insinúe cuál ganar. Cepo de frases prohibidas + cepo positivo (que exista una columna por cada
  lado, sin un tercer bloque de "veredicto").
- **El presupuesto tiene que ser REAL**, no una horquilla orientativa: viene de Avant2 (idea G del
  banco de ideas), 0,50 € por consulta, **nunca automático ni en lote** — se dispara una vez, cuando
  el cliente lo pide explícitamente después de ver el resumen de su póliza actual.
- **Va siempre con el IPID** del producto ofertado adjunto, antes de cualquier contratación —
  requisito del art. 42 LDSC independientemente de si hay asesoramiento o no.
- Termina en un único botón: **"¿dudas? te llamamos"** → lead humano, mismo flujo que en el resto del
  diseño. El sistema no cierra la venta solo.

⚠️ **Esta pieza depende de tener un presupuesto real conectado** (Avant2 vía Codeoscopic, ya
parcialmente construido para retarificar en el panel del corredor — `lib/codeoscopic/*`). Es la
pieza de mayor alcance y mayor coste de las seis.

## Fase 2 — aprobadas por Alberto, sin detallar todavía

Cuatro ideas más, todas compatibles con la línea roja de este spec (la IA lee y pregunta, nunca
opina) y todas reutilizando infraestructura ya existente. Se dejan aquí para no perderlas; entran en
plan de implementación cuando se prioricen.

7. **Enganchar la pregunta al aviso de vencimiento ya existente**, en vez de esperar solo a que el
   cliente entre por su cuenta. El cron `avisos-vencimiento` de `apps/asegura` (hoy apagado) manda un
   email cuando SU PÓLIZA con Grupo ASegura está por vencer — mismo consentimiento de servicio ya
   resuelto. En ese mismo correo, una línea añadida: "¿tienes algún otro seguro que quieras que te
   vigilemos?", con enlace al cuestionario de la pieza 1. Coste marginal ~0: reutiliza el cron y la
   plantilla que ya existen.
8. **Contador factual de cobertura en la bóveda**: "2 de 6 ramos con nosotros, 1 aportado, 3 sin
   dato". Es la misma información que ya produce el cuestionario de la pieza 1, solo que visible de
   un vistazo permanente en vez de solo en el momento de preguntar. Sin ranking ni frase de
   conclusión — un contador, no un juicio.
9. **El resumen de garantías (pieza 3) como PDF descargable**, no solo texto en pantalla. El
   contenido ya existe una vez construida la pieza 3; esto es solo darle una salida que el cliente se
   pueda llevar (a otra correduría, a su pareja, a donde quiera). Refuerza la transparencia sin atarla
   a que compre nada.
10. **Actividad del cliente como señal de prioridad para Alberto, nunca para el cliente.** Si alguien
    entra varias veces a mirar una póliza que aportó, es una señal de interés barata de capturar.
    Extiende el mecanismo que ya existe para las autorizaciones a terceros (`registrarUso` en
    `lib/autorizaciones.ts`) a las pólizas propias. Sale solo en `/correduria`, nunca en el portal del
    cliente — no le dice nada a él, solo ordena a quién llama Alberto primero.
11. **Cerrar relaciones cuando el titular de la póliza aportada NO es el cliente.** Si al leer el
    documento (pieza 2) el tomador extraído no coincide con el nombre de la identidad que lo sube
    (el hogar a nombre de su mujer, el coche con un conductor habitual que no es él), preguntarle —
    mismo guion fijo tri-estado— qué relación tiene con esa persona (pareja, hijo/a, padre/madre,
    hermano/a, empresa propia, otro/no lo sé). Ataca un problema ya medido en la cartera:
    `poliza_intervinientes` está al 1,7% y el 81% de los intervinientes no trae NIF, así que hoy la
    correduría no sabe quién más hay detrás de sus 110 pólizas.
    ⚠️ **Lo que declara el cliente es una PROPUESTA, no una relación operativa**: no se escribe
    directamente en `cliente_relaciones` (eso es autoridad del corredor, escrita desde
    `apps/asegura` con `prisma_seguros`), sino que se guarda como sugerencia pendiente y se enseña en
    `/correduria` para que Alberto la confirme — mismo patrón que toda la pieza 6 y que
    `portal_peticion_acceso` (el cliente propone, el corredor decide). Y por la regla de identidad de
    la casa (NIF, nunca nombre): esto NO sustituye a `poliza_intervinientes`, solo abre la puerta a que
    Alberto la complete con el NIF cuando confirme.
12. **Invitar al tercero declarado en la pieza 11.** Si la relación es un familiar (pareja, hijo/a,
    padre/madre, hermano/a), ofrecer invitarlo al portal reutilizando el sistema de invitaciones YA
    construido (`portal_invitacion` — token hasheado, código de un solo uso, nunca clic directo que
    canjea solo). Cierra el círculo: declaras con quién tienes relación → esa persona entra también →
    sus propios seguros se convierten en otro lead. Cero infraestructura nueva.
13. **El vencimiento como ventana para el cambio de mediador (pieza 5).** Cuando una póliza ajena
    leída esté cerca de vencer, es cuando cambiar de mediador tiene menos fricción con la compañía
    actual — priorizar la propuesta de cambio de mediador en esa ventana, con el mismo dato de
    vencimiento que ya extrae `extraer-poliza.ts`.

## Reglas que no se negocian

1. **La IA nunca genera contenido dirigido al cliente sobre seguros.** Solo hace dos cosas: extraer
   datos de documentos, y entender intención (qué ramo, qué fecha) en lenguaje libre. Todo lo demás
   que el cliente lee es plantilla fija.
2. **Ningún ranking ni recomendación automática.** Comparar es enseñar hechos lado a lado; decidir
   es del cliente.
3. **Ninguna tarificación automática ni en lote.** Avant2 se dispara una vez, a petición explícita.
4. **Ningún canal nuevo sin su base legal resuelta.** El recordatorio por email vale porque lo pide
   el propio cliente en su sesión; escribir en frío a leads fríos NO entra en este diseño.
5. **Todo lo que la IA extrae lleva su procedencia** (`declarado`, nunca `verificado`) y su aviso de
   revisión — mismo patrón que ya usa el resto del portal.

## Qué NO se construye en esta fase

- Chat libre de IA hablando de seguros con el cliente.
- WhatsApp como canal (no hay WABA de Grupo ASegura).
- Horquilla de precio orientativa sin presupuesto real (idea F del banco de ideas) — se descarta a
  favor del presupuesto real de la pieza 6, que es más honesto y ya estaba semi-construido.
- Cualquier automatización de la campaña de WhatsApp a clientes de confianza (eso quedó aparte, como
  envío manual de Alberto, sin relación con este diseño).

## Modelo de datos nuevo

| Tabla | Para qué |
|---|---|
| `seguros.portal_pregunta_ramo` | Qué se ha preguntado y qué contestó, por ramo (pieza 1) |
| `seguros.portal_recordatorio` | Recordatorios programados por el cliente (pieza 4) |

Las piezas 2, 3 y 5 no necesitan tabla nueva (reutilizan `portal_poliza_declarada` y el flujo de
`core-firma` respectivamente); la pieza 6 depende del presupuesto real y su propio cupo
(`seguros.codeoscopic_consumo`, ya existente).

## Bloqueos conocidos

- El portal sigue sin desplegar del todo (envs pendientes de Alberto, ver `apps/asegura-portal/CLAUDE.md`).
- La pieza 6 (comparación) necesita medir que el flujo de Avant2 para HOGAR/AUTO desde fuera de una
  póliza propia funciona igual que el de retarificación del panel del corredor — no está verificado.
- Ninguna pieza requiere WABA; todas funcionan con el canal email ya existente.

## Preguntas cerradas en esta conversación (para no reabrirlas)

- ¿Chat libre o guion fijo con NLU acotada? → **Guion fijo.**
- ¿La comparación es un ranking o una tabla de hechos? → **Tabla de hechos, sin ranking.**
- ¿El presupuesto de la comparación es real o una horquilla? → **Real (Avant2), a petición explícita.**
- ¿A quién aplica el cuestionario de huecos? → **A cualquiera con sesión en el portal, cliente o lead.**
- ¿Cómo se muestra en la bóveda que una póliza aportada está a nombre de otra persona (pieza 11)?
  → **Chip inline en la propia fila** ("De Pilar Piña Franco · tu mujer"), nunca un pop-up ni un
  panel lateral. Es el mismo patrón que ya usa `FilaPoliza.tsx`/`FilaDeclarada.tsx` para "De
  {titular}" y "Añadida por ti": un dato que puede cambiar lo que el cliente hace no puede vivir
  detrás de un clic. Comparativa visual de las tres opciones, aprobada por Alberto:
  https://claude.ai/code/artifact/95013a06-784e-451a-a6c6-64db3160a2a6
