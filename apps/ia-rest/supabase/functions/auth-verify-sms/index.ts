import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { telefono, codigo, userId } = await req.json();
    if (!telefono || !codigo || !userId) throw new Error("Faltan parámetros: telefono, codigo, userId");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: 'iarest' } }
    );

    const telefonoLimpio = telefono.replace(/\s/g, "").startsWith("+34")
      ? telefono.replace(/\s/g, "")
      : `+34${telefono.replace(/\s/g, "")}`;

    const { data: verif, error: verifError } = await supabase
      .from("sms_verification")
      .select("*")
      .eq("telefono", telefonoLimpio)
      .eq("user_id", userId)
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (verifError || !verif) throw new Error("Código no encontrado. Solicita uno nuevo.");
    if (new Date(verif.expires_at) < new Date()) throw new Error("El código ha expirado. Solicita uno nuevo.");

    // Incrementar intentos
    await supabase.from("sms_verification")
      .update({ intentos: (verif.intentos || 0) + 1 })
      .eq("id", verif.id);

    if ((verif.intentos || 0) >= 5) throw new Error("Demasiados intentos. Solicita un nuevo código.");
    if (verif.codigo !== codigo.trim()) throw new Error("Código incorrecto.");

    // Marcar como usado
    await supabase.from("sms_verification")
      .update({ used: true, used_at: new Date().toISOString() })
      .eq("id", verif.id);

    // Confirmar teléfono en Auth
    await supabase.auth.admin.updateUserById(userId, {
      phone_confirm: true,
      user_metadata: {
        telefono_verificado: true,
        telefono_verificado_at: new Date().toISOString(),
      },
    });

    // Actualizar perfil
    await supabase.from("perfiles")
      .update({ telefono_verificado: true })
      .eq("id", userId);

    return new Response(
      JSON.stringify({ success: true, verified: true, nextStep: "onboarding" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
