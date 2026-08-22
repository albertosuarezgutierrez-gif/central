// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// 🔑 SECRETO SUSTITUIDO: el original traía, en un comentario y en el propio cuerpo de
//    la respuesta, el ID de un **deploy hook de Vercel** del proyecto `sivra`
//    (`prj_dWkYfE657GykDXQbB9GUDdCkpQAv`). Un deploy hook es una URL-secreto: quien la
//    conoce dispara despliegues a producción sin autenticarse. Aquí va redactado.
//    ⚠️ La función DESPLEGADA sigue devolviendo el ID en claro a quien la llame — y aunque
//    tiene verify_jwt=true, el ID lleva expuesto en el panel desde el 08/05/2026.
//    Regenerar el hook en Vercel → sivra → Settings → Git → Deploy Hooks.
// 📌 La función está DESACTIVADA (devuelve 'disabled'). Candidata a borrarse del panel:
//    no hace nada y lo único que aporta es filtrar el hook.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

// Deploy ahora via webhook GitHub→Vercel automático.
// Si hace falta un trigger manual, usar el deploy hook desde el panel de Vercel,
// no desde aquí:  POST https://api.vercel.com/v1/integrations/deploy/<PROJECT_ID>/<HOOK_ID>
Deno.serve(() => new Response(
  JSON.stringify({ status: 'disabled', message: 'Usar webhook GitHub→Vercel.' }),
  { headers: { 'Content-Type': 'application/json' } },
))
