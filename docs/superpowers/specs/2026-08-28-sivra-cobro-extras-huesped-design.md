# SIVRA — cobro de extras al huésped (cuna + trona) y aviso a la limpieza

**Fecha:** 28/08/2026 · **Decisiones de:** Alberto · **Vertical:** SIVRA (gestión en `apps/plataforma`)

## Problema

El agente de huéspedes ya responde bien a la solicitud de cuna y da el precio (20€), pero ahí se acaba:
no hay forma de cobrarlo ni de que nadie monte la cuna. Todo lo que pasa después del «sí» es manual y,
por tanto, se olvida.

## Hallazgo que condiciona el diseño

La documentación del agente (`.claude/skills/sivra-maestro/references/contexto-y-agente-huesped.md`)
dice que la **graduación por categorías** tiene una allowlist y que «quejas/dinero/cambios NUNCA se
auto-envían». **Eso ya no es cierto en el código** (verificado el 28/08/2026):

- `graduacion.ts` **no existe**. Desde el 20/08/2026 (`orquestador.ts`) el criterio de auto-envío es
  `autoCortesia || autoApoyada`, donde `autoApoyada` = la respuesta está `apoyada_en_fuente`.
- `sensibilidad.ts` tiene regex de queja, avería, cancelación, reembolso y emergencia — **ninguna de
  dinero, precio, pagar o cobrar**.

Conclusión: los 20€ de la cuna no pasaron por ningún filtro de dinero; salieron porque el precio vive
en la guía del piso o en `mensajes_hechos`. **El precio suelto en una fuente de texto libre es el
problema a resolver antes que el cobro**: hoy nada impide que la guía diga 20€ y el agente cobre otra
cosa, o al revés. Actualizar la doc del agente es parte de este trabajo.

## Decisiones tomadas (Alberto, 28/08/2026)

| Decisión | Elegido |
|---|---|
| Pasarela | **Stripe propio** (no el enlace de Smoobu): lo importante no es cobrar, es *saber* que ha pagado — sin webhook, «pagado» sería un NULL disfrazado y el aviso a limpieza seguiría siendo manual |
| Entidad que cobra | **Alberto persona física** (los pisos), payout a **Kutxa ****0855** para los cuatro; la imputación por piso va por metadata |
| Catálogo | Un solo extra el día 1 — **cuna + trona juntas, 20€ por estancia, igual en los 4 pisos** — pero **el catálogo vive en BD y es extensible** |
| IVA | **Sin IVA** (dictado por Alberto) |
| Logística | La cuna y la trona **son nuestras y ya están en el piso/trastero**: el aviso es «móntala», no «consíguela» |
| Envío del enlace | **Automático** si el precio ya salió con el ✅ de Alberto en ese hilo y el huésped acepta |
| Aviso a limpieza | **Email automático**, `hola@ialimp.es` → `limpiezascruzz@gmail.com` (**buzón de Sique Brilla**, confirmado por Alberto el 28/08/2026), `Reply-To` y copia a `alberto.suarez.gutierrez@gmail.com` |
| Impago | Recordatorio a las 24h; 48h antes de la entrada, aviso a Alberto y caducidad. **Sin pago no se monta** |

### Por qué NO se manda desde el Gmail personal de Alberto
Lo preguntó explícitamente. Resend (y cualquier pasarela) exige verificar el dominio por DNS y el DNS
de `gmail.com` no es suyo; forzarlo lo mandaría a spam o lo rechazaría el DMARC de Google. El
`Reply-To` resuelve el fondo del asunto: Sique Brilla contesta y la respuesta cae en su Gmail.

### Por qué `hola@ialimp.es` y no un dominio de los pisos
En Resend solo está verificado `iarest.es`. Plataforma **ya manda** por SMTP de IONOS con
`MAIL_FROM=hola@ialimp.es` (`apps/plataforma/lib/mailer.ts` sobre `@central/core-email`), así que es
cero alta y automático desde el día 1. Verificar `housesevillana.es` queda como mejora posterior, no
como requisito.

## Arquitectura

Todo en **`apps/plataforma`** (la gestión interna de SIVRA vive ahí; `apps/sivra` es solo la web
pública). Piezas nuevas, cada una con una responsabilidad y testeable por separado:

### 1. `sivra_extras_catalogo` (tabla)

`codigo` (`cuna_trona`) · `nombre_es/en/fr/de/it` · `precio_cents` (2000) · `unidad` (`estancia`) ·
`iva_pct` (0) · `activo` · `property_ids` (`NULL` = todos) · `instruccion_limpieza` · `avisa_limpieza`.

Añadir un extra mañana = insertar una fila, sin tocar código. 🚨 La migración lleva su `REVOKE`: una
tabla nueva en `public` nace abierta a `anon`/`authenticated` en esta BD compartida (patrón:
`prisma/sql/2026-08-20_ses_establecimientos.sql`).

### 2. `sivra_extras_reserva` (tabla)

`booking_id` · `property_id` · `codigo` · `precio_cents` (copiado al ofertar: el catálogo puede
cambiar después) · `estado` · `stripe_payment_link_id` · `stripe_payment_intent_id` · `ofrecido_at` ·
`enlace_enviado_at` · `pagado_at` · `recordatorio_at` · `aviso_limpieza_at` · `aviso_limpieza_error`.

Estados: `ofrecido → enlace_enviado → pagado → caducado | cancelado | reembolsado`.

**Tres estados, no dos** (regla global de CLAUDE.md): `aviso_limpieza_at` a `NULL` significa «no se
ha avisado todavía», jamás «no hacía falta avisar». La UI y los avisos distinguen las tres cosas.

### 3. `lib/sivra/agente-huesped/extras.ts` (puro, testeado)

- `detectarExtra(texto): string | null` — cuna/cot/crib/culla/Kinderbett/berceau, trona/high chair/
  seggiolone/Hochstuhl/chaise haute, en los 5 idiomas que soporta el agente.
- `esAceptacion(texto): boolean` — «ok», «sí», «perfecto», «yes please», «va bene», «d'accord»…
  Conservador: ante duda, `false` → va a Telegram.
- `precioDeCatalogo(codigo, propertyId)` — **única fuente del importe**.

**El importe no lo dice nunca la IA.** Guardrail: si el borrador contiene una cifra en euros que no
coincide con el catálogo, escala a Alberto en vez de enviarse.

### 4. Guarda de consistencia guía ↔ catálogo

Test que falla si la guía del piso o un `mensajes_hechos` confirmado menciona un precio de cuna
distinto al del catálogo. Sin esto vuelve el problema de partida: dos precios que se separan solos.

### 5. Enlace de pago (`lib/sivra/extras-stripe.ts`)

Sobre `@central/core-payments` (ya trae el SDK de Stripe y fija la versión de API de la casa).
Payment Link por reserva con `metadata { booking_id, property_id, codigo }` y caducidad.

Envs nuevas en el proyecto Vercel `plataforma`: `STRIPE_SECRET_KEY_SIVRA` (API externa → puede caer a
`|| ''`) y `STRIPE_WEBHOOK_SECRET_SIVRA` (**firma → `requireSecret()` de `@central/core-identity`**,
nunca literal de respaldo; lo vigila `test/regression-secrets.test.ts`).

### 6. Envío automático del enlace, acotado por código

Lo pidió Alberto y **contradice la regla escrita de que el dinero nunca se auto-envía**, así que se
ata de forma determinista, no por criterio del modelo. Sale solo si se cumple TODO:

1. Existe fila en `sivra_extras_reserva` con `estado='ofrecido'` para esa reserva y ese extra.
   Esa fila la crea **el propio botón ✅ de Telegram**: al enviar un borrador cuya pregunta pasa
   `detectarExtra`, el flujo de `mensajes_pendientes_tg` inserta el `ofrecido`. No hay otra vía de
   crearla, así que «lo aprobó Alberto» es un hecho de la BD, no una inferencia sobre el hilo.
2. El mensaje del huésped pasa `esAceptacion` limpiamente.
3. El importe sale del catálogo.

Cualquier otra cosa — regatea, pide dos cunas, pregunta si puede pagar en efectivo, cambia de idea —
va a Telegram. Alberto recibe copia de lo enviado, igual que con el auto-envío de hoy.

### 7. Webhook de Stripe (`/api/sivra/extras/webhook`)

`checkout.session.completed` → `estado='pagado'`, idempotente por `payment_intent`. Dispara dos
cosas: el email a la limpieza y el aviso a Alberto por Telegram.

### 8. Aviso a la limpieza (`lib/sivra/extras-aviso-limpieza.ts`)

Automático al confirmarse el pago. `from: hola@ialimp.es` · `to: limpiezascruzz@gmail.com` ·
`Reply-To` y copia a `alberto.suarez.gutierrez@gmail.com`.

Asunto: `House Sevillana · 12/09 · montar cuna y trona`.
Cuerpo: piso y dirección, fecha de entrada, fecha de salida (para recogerla), qué montar, y que ya
está pagado.

Idempotente por `aviso_limpieza_at`. **Si el envío falla se guarda el error y salta un aviso por
Telegram**: un `catch` mudo que dejara el extra pagado y a nadie avisado es exactamente el fallo que
CLAUDE.md marca como el más caro.

### 9. Impago (cron en `apps/plataforma`)

- 24h sin pagar → recordatorio suave al huésped (mismo raíl `enviarAlHuesped`).
- 48h antes de la entrada sin pagar → `estado='caducado'` + Telegram a Alberto.
- Sin pago no sale el email: la cuna no se monta.

### 10. Cancelación y reembolso

Reserva cancelada con el extra pagado → Telegram a Alberto con el enlace del reembolso en Stripe.
**No se reembolsa solo.**

### 11. Contabilidad

**⚠️ CAMBIO SOBRE EL DISEÑO INICIAL, decidido al implementar.** La spec decía «el ingreso entra en
`incomes` marcado como extra». **No se hace, y es a propósito:** `lib/sivra/pl-mensual.ts` cuenta las
filas de `incomes` con `COUNT(*) AS reservas`, así que una fila por extra inflaría el número de reservas
del piso y con él el ADR — exactamente el efecto que la spec quería evitar. El registro contable de los
extras vive en `sivra_extras_reserva` (una fila por extra, con importe y fecha de cobro) y se consulta
con el helper `totalExtrasPagados(anio, propertyId)`. Cada euro sigue identificado uno a uno; lo que no
se hace es meterlo en una tabla cuyo recuento significa otra cosa.

**Pendiente declarado:** pintar esa cifra como línea propia en el panel de finanzas. No entra en este PR
para no ensanchar el diff a la UI financiera; el helper y sus datos ya están.

**Tratamiento fiscal (dictado por Alberto, 28/08/2026, decisión cerrada):** los extras **suman en
contabilidad pero no se declaran en renta**, y van **sin IVA**. Anotado en la skill `perfil-fiscal` para
que los agentes fiscales lo respeten. Se le planteó que «sin IVA» y «no tributa en IRPF» son preguntas
distintas y que conviniera pasarlo por Asecon; lo descartó (importes pequeños, cobro a cuenta personal).
El diseño **no cablea la exclusión en ningún sitio**: el IVA es un campo del catálogo y el ingreso va
etiquetado en `incomes`, así que el criterio se revierte editando una fila y los importes están
identificados uno a uno.

## Qué NO entra (YAGNI)

- Late check-out de pago, lavandería extra: el catálogo los soporta, pero no se dan de alta ahora.
- Tarea en ialimp / WhatsApp a la limpieza: descartado a favor del email.
- Inventario de cunas entre pisos: son nuestras y están fijas en cada piso.
- Verificar `housesevillana.es` como remitente: mejora posterior.
- Reembolso automático.

## Riesgos y flecos abiertos

- **Fiscal**: sin IVA y fuera de la renta por decisión cerrada de Alberto, **sin pasar por Asecon** (se
  propuso y lo descartó). El diseño lo soporta como dato editable (campo `iva_pct` + etiqueta en
  `incomes`), nunca como exclusión cableada: si el criterio cambia, los importes ya están identificados
  uno a uno y se corrige sin tocar código.
- **Booking/Airbnb**: cobrar un extra fuera del canal está permitido para servicios no incluidos en la
  reserva, pero es un cambio de práctica que conviene tener presente.
- **Alta de Stripe**: hace falta cuenta y KYC de persona física con payout a Kutxa ****0855 antes de
  que nada de esto cobre de verdad. Es trabajo de Alberto, no de código.
- **Doc del agente desactualizada**: `contexto-y-agente-huesped.md` describe una graduación por
  categorías que ya no existe. Se corrige en este mismo trabajo.
