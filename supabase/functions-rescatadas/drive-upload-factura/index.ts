// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// ✅ Sin secretos en claro: la clave de la cuenta de servicio de Google y la service_role
//    ya venían del entorno. Copia FIEL del original, sin tocar una línea.
// ⚠️ PERO es la ÚNICA del rescate que NO es un parche de una tarde: sube facturas a Drive
//    (creando el árbol AAAA / MM - Mes AAAA) e inserta el gasto en la tabla `gastos`.
//    Y tiene `verify_jwt=false` → **tercer endpoint de escritura sin autenticar** del panel:
//    cualquiera con la URL mete filas en `gastos` y ficheros en el Drive de Alberto.
//    A diferencia de `upload-landing`/`upload-photo-github`, aquí NO basta con borrarla:
//    hay que decidir si el flujo sigue vivo y, si lo está, ponerla detrás de auth.
// ⚠️ El fallback `GASTOS_DRIVE_FOLDER_ID || '10fj31…'` NO es una credencial (el acceso a
//    Drive lo decide la ACL de la carpeta + la cuenta de servicio), pero sí revela dónde
//    escribe. Se conserva literal porque quitarlo cambiaría el comportamiento.
// ⚠️ El mensaje de error dice «no configurada en Vercel» — copiado de otra app; esta
//    función lee sus envs de los **secrets de Supabase**, no de Vercel.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Google Drive upload edge function
// Recibe: multipart/form-data con { file, fileName, fecha, propiedad, concepto, total, categoria, notas }
// Sube el archivo a Drive en la carpeta YYYY / MM - MesNombre YYYY
// Guarda el gasto en la tabla gastos

const FOLDER_ID = Deno.env.get('GASTOS_DRIVE_FOLDER_ID') || '10fj31nrvi4b4Q7X-PDKdxhkGunRPlWNo';
const SA_KEY_JSON = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY') || '';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// --- Google Auth JWT ---
async function getGoogleAccessToken(): Promise<string> {
  if (!SA_KEY_JSON) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY no configurada en Vercel');
  const sa = JSON.parse(SA_KEY_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const sigInput = `${header}.${payload}`;
  // Import RSA key
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
  const pkDer = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', pkDer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(sigInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  const jwt = `${sigInput}.${sigB64}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error(`Google token error: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token;
}

// --- Drive helpers ---
async function findFolder(token: string, parentId: string, name: string): Promise<string | null> {
  const q = encodeURIComponent(`'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(token: string, parentId: string, name: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const data = await res.json();
  if (!data.id) throw new Error(`Error creando carpeta ${name}: ${JSON.stringify(data)}`);
  return data.id;
}

async function getOrCreateFolder(token: string, parentId: string, name: string): Promise<string> {
  const existing = await findFolder(token, parentId, name);
  if (existing) return existing;
  return createFolder(token, parentId, name);
}

async function uploadFile(token: string, folderId: string, fileName: string, fileBytes: Uint8Array, mimeType: string): Promise<{ id: string; webViewLink: string }> {
  // Multipart upload
  const boundary = '-------boundary_drive_upload';
  const meta = JSON.stringify({ name: fileName, parents: [folderId] });
  const body = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  ];
  const enc = new TextEncoder();
  const part1 = enc.encode(body[0]);
  const part2 = enc.encode(body[1]);
  const end = enc.encode(`\r\n--${boundary}--`);
  const combined = new Uint8Array(part1.length + part2.length + fileBytes.length + end.length);
  combined.set(part1, 0);
  combined.set(part2, part1.length);
  combined.set(fileBytes, part1.length + part2.length);
  combined.set(end, part1.length + part2.length + fileBytes.length);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
    body: combined,
  });
  const data = await res.json();
  if (!data.id) throw new Error(`Error subiendo archivo: ${JSON.stringify(data)}`);
  return { id: data.id, webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view` };
}

// --- Main handler ---
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': '*' } });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const fecha = formData.get('fecha') as string; // YYYY-MM-DD
    const propiedad = formData.get('propiedad') as string || '';
    const concepto = formData.get('concepto') as string || '';
    const totalStr = formData.get('total') as string || '0';
    const categoria = formData.get('categoria') as string || 'OTRO';
    const notas = formData.get('notas') as string || '';
    const proveedor = formData.get('proveedor') as string || '';
    const numeroFactura = formData.get('numero_factura') as string || '';
    const baseImponible = formData.get('base_imponible') as string || '';
    const iva = formData.get('iva') as string || '';

    if (!fecha) throw new Error('Fecha obligatoria');

    const fechaDate = new Date(fecha);
    const year = fechaDate.getFullYear();
    const month = fechaDate.getMonth(); // 0-11
    const monthNum = String(month + 1).padStart(2, '0');
    const mesNombre = MESES[month];
    const yearFolderName = String(year);
    const monthFolderName = `${monthNum} - ${mesNombre} ${year}`;

    let driveFileId: string | null = null;
    let driveUrl: string | null = null;
    let driveFileName: string | null = null;
    let carpetaDrive: string | null = null;

    // Si hay archivo, subir a Drive
    if (file && file.size > 0) {
      const token = await getGoogleAccessToken();

      // Obtener/crear carpeta año
      const yearFolderId = await getOrCreateFolder(token, FOLDER_ID, yearFolderName);
      // Obtener/crear carpeta mes
      const monthFolderId = await getOrCreateFolder(token, yearFolderId, monthFolderName);

      // Nombre del archivo: YYYY-MM_Propiedad_Concepto_original.ext
      const ext = file.name.split('.').pop() || 'pdf';
      const propSafe = propiedad.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
      const conceptSafe = concepto.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ ]/g, '_').substring(0, 30);
      driveFileName = `${year}-${monthNum}_${propSafe}_${conceptSafe}.${ext}`;

      const fileBytes = new Uint8Array(await file.arrayBuffer());
      const mimeType = file.type || 'application/pdf';

      const uploaded = await uploadFile(token, monthFolderId, driveFileName, fileBytes, mimeType);
      driveFileId = uploaded.id;
      driveUrl = uploaded.webViewLink;
      carpetaDrive = monthFolderName;
    }

    // Guardar gasto en Supabase
    const gastoPayload: Record<string, unknown> = {
      fecha,
      propiedad,
      concepto,
      total: parseFloat(totalStr),
      categoria,
      notas: notas || null,
      proveedor: proveedor || null,
      numero_factura: numeroFactura || null,
      base_imponible: baseImponible ? parseFloat(baseImponible) : null,
      iva: iva ? parseFloat(iva) : null,
      drive_file_id: driveFileId,
      drive_file_name: driveFileName,
      drive_url: driveUrl,
      carpeta_drive: carpetaDrive,
    };

    const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/gastos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(gastoPayload),
    });

    const sbData = await sbRes.json();
    if (!sbRes.ok) throw new Error(`Supabase error: ${JSON.stringify(sbData)}`);

    return new Response(JSON.stringify({
      ok: true,
      gasto: sbData[0],
      drive: driveFileId ? { fileId: driveFileId, url: driveUrl, fileName: driveFileName, carpeta: carpetaDrive } : null,
    }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
