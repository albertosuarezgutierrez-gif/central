// ia.rest · TEST-RUNNER v2 — usa estados reales del schema
// Ejecuta 10 tests del pipeline y guarda resultado en transcripciones
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const R_ID   = "50eda9f7-d19b-4078-b404-e323c8ee8089";
const CAM_ID = "7352a4aa-0195-470e-aebc-1e7e6e76002e";
const MESA_ID = "8fe32435-e01a-4293-8277-c0be6ee92789";

async function call(slug: string, body: unknown, key: string): Promise<{ok:boolean;ms:number;data:unknown;httpStatus:number}> {
  const base = Deno.env.get("SUPABASE_URL") + "/functions/v1";
  const t = Date.now();
  try {
    const r = await fetch(`${base}/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}`, "apikey": key },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    return { ok: r.status < 300, ms: Date.now()-t, data, httpStatus: r.status };
  } catch(e) {
    return { ok: false, ms: Date.now()-t, data: { error: String(e) }, httpStatus: 0 };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { db: { schema: 'iarest' } });
  const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const inicio = Date.now();
  const R: Record<string,unknown>[] = [];

  // T1 – BRAIN: comanda
  const b1 = await call("brain-parse", { restaurante_id: R_ID, texto: "marchar dos cañas y una ración de croquetas para la mesa uno" }, KEY);
  const d1 = b1.data as any;
  R.push({ test:"T01_BRAIN_comanda", ok:b1.ok && d1?.intent==="comanda", ms:b1.ms, http:b1.httpStatus, intent:d1?.intent, confianza:d1?.confianza, items:d1?.items?.length, mesa:d1?.mesa_nombre, quip:d1?.quip, error:d1?.error });

  // T2 – BRAIN: cobro
  const b2 = await call("brain-parse", { restaurante_id: R_ID, texto: "cuenta mesa uno tarjeta separada en dos" }, KEY);
  const d2 = b2.data as any;
  R.push({ test:"T02_BRAIN_cobro", ok:b2.ok && d2?.intent==="cobro", ms:b2.ms, http:b2.httpStatus, intent:d2?.intent, metodo:d2?.metodo_pago, personas:d2?.personas_cobro, error:d2?.error });

  // T3 – BRAIN: 86
  const b3 = await call("brain-parse", { restaurante_id: R_ID, texto: "86 las croquetas se acabaron" }, KEY);
  const d3 = b3.data as any;
  R.push({ test:"T03_BRAIN_86", ok:b3.ok && d3?.intent==="86", ms:b3.ms, http:b3.httpStatus, intent:d3?.intent, items:d3?.items?.length, error:d3?.error });

  // T4 – BRAIN: alergia
  const b4 = await call("brain-parse", { restaurante_id: R_ID, texto: "ojo la mesa uno es alérgica al gluten sin rebozado" }, KEY);
  const d4 = b4.data as any;
  R.push({ test:"T04_BRAIN_alergia", ok:b4.ok && d4?.intent==="alergia", ms:b4.ms, http:b4.httpStatus, intent:d4?.intent, alergenos:d4?.alergen, error:d4?.error });

  // T5 – COURIER: crear comanda real
  const brainOk = d1?.ok && d1?.intent==="comanda";
  let comanda_id_test: string | null = null;
  if (brainOk) {
    const c5 = await call("courier-route", { restaurante_id:R_ID, camarero_id:CAM_ID, brain_output:{...d1, mesa_id:MESA_ID, requiere_confirmacion:false} }, KEY);
    const d5 = c5.data as any;
    comanda_id_test = d5?.comanda_id ?? null;
    R.push({ test:"T05_COURIER_comanda", ok:c5.ok && !!d5?.comanda_id, ms:c5.ms, http:c5.httpStatus, comanda_id:d5?.comanda_id, print_job:d5?.print_job_id, quip:d5?.quip, error:d5?.error });
  } else {
    R.push({ test:"T05_COURIER_comanda", ok:false, error:"Saltado: T01 no pasó" });
  }

  // T6 – COURIER: 86
  const c6 = await call("courier-route", { restaurante_id:R_ID, camarero_id:CAM_ID, brain_output:{...d3, requiere_confirmacion:false} }, KEY);
  const d6 = c6.data as any;
  R.push({ test:"T06_COURIER_86", ok:c6.ok && d6?.accion==="86_procesado", ms:c6.ms, http:c6.httpStatus, accion:d6?.accion, items:d6?.items, error:d6?.error });

  // T7 – VOX: confirmación con quip
  const v7 = await call("vox-confirm", { restaurante_id:R_ID, camarero_id:CAM_ID, intent:"comanda", mesa_nombre:"Mesa 1", items:[{producto_nombre:"Cañas",cantidad:2,modificadores:[]}], quip:"marchando, las cañas bien frías como siempre" }, KEY);
  const d7 = v7.data as any;
  R.push({ test:"T07_VOX_con_quip", ok:v7.ok && !!d7?.texto, ms:v7.ms, http:v7.httpStatus, texto:d7?.texto, tiene_audio:!!d7?.audio_base64, error:d7?.error_tts });

  // T8 – VOX: sin quip (genera texto automático)
  const v8 = await call("vox-confirm", { restaurante_id:R_ID, camarero_id:CAM_ID, intent:"86", items:[{producto_nombre:"Croquetas de jamón",cantidad:1,modificadores:[]}] }, KEY);
  const d8 = v8.data as any;
  R.push({ test:"T08_VOX_sin_quip", ok:v8.ok && !!d8?.texto, ms:v8.ms, http:v8.httpStatus, texto:d8?.texto, tiene_audio:!!d8?.audio_base64, error:d8?.error_tts });

  // T9 – MENU-STOCKOUT: consultar
  const m9 = await call("menu-stockout", { restaurante_id:R_ID, accion:"consultar_86" }, KEY);
  const d9 = m9.data as any;
  R.push({ test:"T09_MENU_consultar", ok:m9.ok && d9?.ok, ms:m9.ms, http:m9.httpStatus, count_agotados:d9?.count, error:d9?.error });

  // T10 – VERIFACTU: generar factura sobre comanda creada en T5
  if (comanda_id_test) {
    // Primero cobrar la comanda
    await supabase.from("comandas").update({ estado_cobro:"cobrado", total_cobrado:12.50, estado:"entregada" }).eq("id", comanda_id_test);
    const vf = await call("verifactu-sign", { restaurante_id:R_ID, comanda_id:comanda_id_test, importe_total:12.50 }, KEY);
    const dvf = vf.data as any;
    R.push({ test:"T10_VERIFACTU", ok:vf.ok && !!dvf?.numero_serie, ms:vf.ms, http:vf.httpStatus, numero_serie:dvf?.numero_serie, tiene_qr:!!dvf?.qr_url, huella_len:dvf?.huella?.length, comanda_id:comanda_id_test, error:dvf?.error });
  } else {
    // Crear comanda explícita de prueba
    const { data: newCmd } = await supabase.from("comandas").insert({ restaurante_id:R_ID, camarero_id:CAM_ID, mesa_id:MESA_ID, estado:"entregada", tipo:"comanda", estado_cobro:"cobrado", total_cobrado:9.80 }).select("id").single();
    const vf = await call("verifactu-sign", { restaurante_id:R_ID, comanda_id:newCmd?.id, importe_total:9.80 }, KEY);
    const dvf = vf.data as any;
    R.push({ test:"T10_VERIFACTU", ok:vf.ok && !!dvf?.numero_serie, ms:vf.ms, http:vf.httpStatus, numero_serie:dvf?.numero_serie, tiene_qr:!!dvf?.qr_url, huella_len:dvf?.huella?.length, error:dvf?.error });
  }

  const total_ms = Date.now()-inicio;
  const passed = R.filter(r => r.ok).length;
  const failed = R.filter(r => !r.ok).length;

  // Guardar en BD para leer via SQL
  await supabase.from("transcripciones").insert({
    restaurante_id: R_ID, camarero_id: CAM_ID,
    texto_original: `[TEST-RUNNER-v2] ${passed}/${R.length} PASS en ${total_ms}ms`,
    brain_output: { report:R, total_ms, passed, failed, run_at: new Date().toISOString() },
    estado: "completada", idioma: "test",
  });

  return new Response(JSON.stringify({ ok:true, passed, failed, total:R.length, total_ms, report:R }, null, 2),
    { status:200, headers:{ ...corsHeaders, "Content-Type":"application/json" } });
});
