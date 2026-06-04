# Incidencia — Webhooks de Stripe fallando (401) · jun 2026

> Estado: **DIAGNOSTICADA. Falta aplicar el fix** (requiere acceso a secretos de
> Supabase y al dashboard de Stripe — no se puede hacer desde el contenedor).

## Resumen

Stripe avisó por email (4 jun 2026) de fallos de entrega de webhooks al endpoint:

```
https://efncqyvhniaxsirhdxaa.supabase.co/functions/v1/webhook-stripe
```

- **78 intentos fallidos** desde el **1 jun 2026 14:32:05 UTC**.
- Stripe **deja de reintentar el 10 jun 2026 14:32 UTC**. Tras esa hora, los
  eventos no entregados se pierden (hay que re-enviarlos a mano antes).

## Causa raíz (confirmada)

El log de la Edge Function muestra `POST | 401` en `webhook-stripe`. Como la
función tiene `verify_jwt: false`, el 401 lo devuelve **su propio código**, en la
verificación de firma `Stripe-Signature`:

```ts
function getWebhookSecret() {
  const mode = (Deno.env.get("STRIPE_MODE") ?? "test").toLowerCase();
  if (mode === "test") return Deno.env.get("STRIPE_WEBHOOK_SECRET_TEST") ?? "";
  return Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
}
...
if (webhookSecret && !verificarFirmaStripe(bodyText, signature, webhookSecret)) {
  return new Response('Unauthorized', { status: 401 })   // ← aquí
}
```

Como el 401 sólo salta cuando `webhookSecret` NO está vacío y la firma NO cuadra,
hay un secreto configurado pero **es el que no toca**: `STRIPE_MODE` no está en
`live`, así que la función valida los eventos con `STRIPE_WEBHOOK_SECRET_TEST`,
pero los eventos llegan firmados por el **endpoint LIVE**. Mismatch → 401.

### El bucle, de punta a punta

1. `cobro-stripe` cobra con `STRIPE_SECRET_KEY` (clave **live**) → el cargo tiene
   éxito → inserta en `pagos` con `estado: 'pendiente'` y
   `metadata_json.stripe_payment_intent_id`.
2. Stripe envía `payment_intent.succeeded` (evento **live**) a `webhook-stripe`.
3. `webhook-stripe` valida con el secreto **test** → firma no cuadra → **401**.
4. El `pagos` se queda en `pendiente` para siempre (nunca pasa a `completado`).

Evidencia: pago real `pi_3TdWrLK5xixGkeRI0AsMwctQ` = **10,00 € EUR `succeeded`**
(1 jun, ~14 s antes del primer fallo de webhook).

## Impacto

- El **dinero entra bien** (Stripe captura el cargo; los cobros no se ven afectados).
- Pero el sistema **no se entera**:
  - `payment_intent.succeeded` → `pagos` se queda en `pendiente` en vez de `completado`.
  - `checkout.session.completed` → **no se activa el plan** (`activar_plan`) de altas SaaS.
  - renovación / cancelación / impago de suscripción → **no se sincroniza** (`plan_status`).
- El 401 ocurre **antes** del `INSERT` en `stripe_events`, así que estos eventos
  **ni se registran en la BD** → si no se re-envían antes del 10 jun, se pierden.

## Fix

1. En **Supabase → Edge Functions → Secrets** (o por CLI), poner el modo y el
   secreto del endpoint **live** (copiar el signing secret `whsec_…` del endpoint
   en el dashboard de Stripe → Developers → Webhooks → ese endpoint):

   ```bash
   supabase secrets set STRIPE_MODE=live \
     STRIPE_WEBHOOK_SECRET=whsec_XXXXXXXXXXXXXXXXXXXXXXXX \
     --project-ref efncqyvhniaxsirhdxaa
   ```

   > Los secretos de Edge Functions NO se heredan de Vercel; viven en Supabase.
   > Verificar que `STRIPE_MODE` quede consistente con el resto del flujo (P1 del
   > MAESTRO: en Vercel también está sin definir → `test`).

2. (Opcional, no hace falta redeploy si sólo cambian secretos) Confirmar que la
   función recoge el nuevo secreto — el siguiente evento debe responder `200`.

3. **Recuperar los eventos perdidos**: en el dashboard de Stripe (Webhooks → el
   endpoint → eventos fallidos) usar **"Resend"** sobre los 78 eventos que sigan
   dentro de la ventana de retención. Como los `pagos` afectados siguen en
   `pendiente`, el re-envío los pondrá en `completado` correctamente.

## Verificación (evidencia, no afirmaciones)

- [ ] Próximo cobro real → log de `webhook-stripe` responde `200` (no `401`).
- [ ] La fila de `pagos` correspondiente pasa a `estado='completado'`.
- [ ] La tabla `stripe_events` registra el evento con `processed=true`.
- [ ] Stripe Dashboard: el endpoint deja de acumular fallos.

## Notas / mejoras sugeridas (no aplicadas)

- El diseño del selector de modo es frágil: si `STRIPE_MODE` se olvida, defaultea
  a `test` en silencio y rechaza todo lo live con 401 sin alerta. Convendría
  loggear/alertar (tgAlert) cuando llegan firmas que no validan, o derivar el modo
  del propio entorno en vez de un secreto suelto.
- La fuente de `webhook-stripe` no estaba en el repo (sólo desplegada). Se ha
  commiteado en `supabase/functions/webhook-stripe/index.ts` para que sobreviva al
  contenedor efímero. Otras funciones Stripe (`cobro-stripe`, `stripe-checkout`,
  `webhook-monei`, `cobro-monei`) tampoco están en el repo — pendiente commitearlas.
- Observado de paso en logs (fuera de esta incidencia): `infra-monitor-cron`
  devuelve `500` de forma constante y `monitor-health` `401` (por `verify_jwt: true`
  sin JWT). Revisar aparte.
