// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// 🔑🔑 SECRETO SUSTITUIDO — EL PEOR DE TODOS: el original llevaba el EMAIL y la
//    CONTRASEÑA de Alberto en claro, para hacer login en housesevillana.vercel.app
//    y llamar a /api/deploy. Reemplazados por Deno.env.get(). La contraseña hay que
//    CAMBIARLA, no solo sacarla de aquí: lleva en claro desde el 27/04/2026 y
//    cualquiera con acceso al panel de Supabase la ha podido leer.
// 📌 Además el patrón es malo de raíz: automatizar un despliegue haciendo login como
//    un humano con su contraseña. Si esto hace falta, va con un token de despliegue.
//    Candidata a borrarse del panel: `trigger-redeploy` hace lo mismo mejor.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (_req: Request) => {
  const APP_URL = 'https://housesevillana.vercel.app';
  const EMAIL = Deno.env.get("DEPLOY_USER_EMAIL")!;
  const PASSWORD = Deno.env.get("DEPLOY_USER_PASSWORD")!;

  try {
    // Step 1: Get CSRF token
    const csrfRes = await fetch(`${APP_URL}/api/auth/csrf`);
    const csrfData = await csrfRes.json();
    const csrfToken = csrfData.csrfToken;
    const csrfCookie = csrfRes.headers.get('set-cookie') || '';

    // Step 2: Authenticate with credentials
    const authRes = await fetch(`${APP_URL}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': csrfCookie,
      },
      body: new URLSearchParams({
        csrfToken,
        email: EMAIL,
        password: PASSWORD,
        callbackUrl: `${APP_URL}/api/deploy`,
        json: 'true',
      }).toString(),
      redirect: 'manual',
    });

    // Collect all cookies
    const allCookies: string[] = [];
    if (csrfCookie) allCookies.push(csrfCookie.split(';')[0]);
    const authCookies = authRes.headers.getSetCookie ? authRes.headers.getSetCookie() : [];
    for (const c of authCookies) {
      allCookies.push(c.split(';')[0]);
    }
    // Also check auth redirect location for session token in cookie
    const location = authRes.headers.get('location') || '';
    const authStatus = authRes.status;

    // Step 3: Follow redirect to get session token
    let sessionCookie = allCookies.join('; ');

    // Try fetching /api/auth/session to confirm we have a session
    const sessionRes = await fetch(`${APP_URL}/api/auth/session`, {
      headers: { 'Cookie': sessionCookie },
    });
    const sessionData = await sessionRes.json();
    const sessionCookies = sessionRes.headers.getSetCookie ? sessionRes.headers.getSetCookie() : [];
    for (const c of sessionCookies) {
      allCookies.push(c.split(';')[0]);
    }
    sessionCookie = allCookies.join('; ');

    // Step 4: Call /api/deploy
    const deployRes = await fetch(`${APP_URL}/api/deploy`, {
      method: 'POST',
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/json',
      },
    });
    const deployText = await deployRes.text();

    return new Response(JSON.stringify({
      success: true,
      authStatus,
      authLocation: location,
      session: sessionData,
      deployStatus: deployRes.status,
      deployBody: deployText.slice(0, 500),
      cookies: allCookies,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
