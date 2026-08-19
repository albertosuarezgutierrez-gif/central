import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── MODO TEST FORZADO hasta salida a mercado ───────────────────────────────
// Cuando quieras activar LIVE: cambia IS_TEST_MODE a false
// O mejor: pon STRIPE_MODE=live en Supabase secrets
const STRIPE_MODE = Deno.env.get("STRIPE_MODE") ?? "test";
const IS_TEST = STRIPE_MODE.toLowerCase() !== "live";

console.log(`[stripe-checkout v16] STRIPE_MODE='${STRIPE_MODE}' IS_TEST=${IS_TEST}`);

function getStripeConfig() {
  const secretKey = IS_TEST
    ? Deno.env.get("STRIPE_SECRET_KEY_TEST")!
    : Deno.env.get("STRIPE_SECRET_KEY")!;

  if (!secretKey) throw new Error(`Falta la clave Stripe para modo ${STRIPE_MODE}`);
  if (IS_TEST && !secretKey.startsWith("sk_test_")) throw new Error("STRIPE_SECRET_KEY_TEST no es una clave test válida");
  if (!IS_TEST && !secretKey.startsWith("sk_live_")) throw new Error("STRIPE_SECRET_KEY no es una clave live válida");

  return {
    secretKey,
    priceBase:    IS_TEST ? Deno.env.get("STRIPE_PRICE_BASE_TEST")!    : Deno.env.get("STRIPE_PRICE_BASE")!,
    priceExtra20: IS_TEST ? Deno.env.get("STRIPE_PRICE_EXTRA_20_TEST")! : Deno.env.get("STRIPE_PRICE_EXTRA_20")!,
    priceExtra15: IS_TEST ? Deno.env.get("STRIPE_PRICE_EXTRA_15_TEST")! : Deno.env.get("STRIPE_PRICE_EXTRA_15")!,
  };
}

function buildLineItems(numUsuarios: number, cfg: ReturnType<typeof getStripeConfig>) {
  const items: { price: string; quantity: number }[] = [];
  items.push({ price: cfg.priceBase, quantity: 1 });
  if (numUsuarios <= 1) return items;
  if (numUsuarios <= 6) {
    items.push({ price: cfg.priceExtra20, quantity: numUsuarios - 1 });
  } else {
    items.push({ price: cfg.priceExtra20, quantity: 5 });
    items.push({ price: cfg.priceExtra15, quantity: numUsuarios - 6 });
  }
  return items;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No autorizado");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, db: { schema: 'iarest' } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Usuario no autenticado");

    const { num_usuarios = 1, restaurante_id = "", nombre_restaurante = "" } = await req.json();
    const nU = Math.max(1, Math.floor(Number(num_usuarios)));
    const cfg = getStripeConfig();
    const lineItems = buildLineItems(nU, cfg);

    console.log(`[stripe-checkout] user=${user.id} nU=${nU} mode=${IS_TEST?'test':'live'} priceBase=${cfg.priceBase}`);

    const stripe = new Stripe(cfg.secretKey, { apiVersion: "2023-10-16" });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: 'iarest' } }
    );

    const { data: perfil } = await supabaseAdmin
      .from("perfiles")
      .select("stripe_customer_id, nombre, email")
      .eq("id", user.id)
      .single();

    let stripeCustomerId = perfil?.stripe_customer_id;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email!,
        name: perfil?.nombre || nombre_restaurante || user.email,
        metadata: { supabase_user_id: user.id, restaurante_id, stripe_mode: IS_TEST ? "test" : "live" },
      });
      stripeCustomerId = customer.id;
      await supabaseAdmin.from("perfiles").update({ stripe_customer_id: stripeCustomerId }).eq("id", user.id);
    }

    const appUrl = Deno.env.get("APP_URL") ?? "https://ia-rest.vercel.app";

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: lineItems,
      subscription_data: {
        trial_period_days: 14,
        metadata: { supabase_user_id: user.id, restaurante_id, num_usuarios: String(nU) },
      },
      success_url: `${appUrl}/login?checkout=success&r=${restaurante_id}`,
      cancel_url:  `${appUrl}/registro?checkout=cancelled`,
      billing_address_collection: "auto",
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      locale: "es",
      metadata: { supabase_user_id: user.id, restaurante_id, num_usuarios: String(nU), stripe_mode: IS_TEST ? "test" : "live" },
      custom_text: {
        submit: {
          message: IS_TEST
            ? "MODO TEST — Usa la tarjeta 4242 4242 4242 4242 · fecha 12/30 · CVC 123. Sin cargos reales."
            : "Activas tu suscripción con 14 días de prueba gratis. Sin cargos hasta que finalice el trial.",
        },
      },
    });

    return new Response(
      JSON.stringify({ success: true, checkout_url: session.url, session_id: session.id, stripe_mode: IS_TEST ? "test" : "live" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (err) {
    console.error(`[stripe-checkout] ERROR: ${err.message}`);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
