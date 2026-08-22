// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// 🔑 SECRETO SUSTITUIDO: el original llevaba un PAT de GitHub (`ghp_…`) en claro,
//    en GITHUB_TOKEN. Reemplazado por Deno.env.get('GITHUB_TOKEN').
// 📌 Función de un solo uso: inyecta el motor de reservas de Smoobu en el
//    `app/[locale]/page.tsx` del repo `roi-intranet`, por la API de contenidos.
//    Escribe código fuente de OTRO repo desde una Edge Function. Candidata a borrarse.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")!;
const REPO = 'albertosuarezgutierrez-gif/roi-intranet';

async function getFile(path: string) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  return r.ok ? await r.json() : null;
}

async function putFile(path: string, content: string, sha: string, message: string) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({ message, content: btoa(unescape(encodeURIComponent(content))), sha, branch: 'main' })
  });
  const j = await r.json();
  return { status: r.status, sha: j?.content?.sha?.slice(0,8), msg: j?.commit?.message || j?.message };
}

Deno.serve(async (_req: Request) => {
  try {
    // 1. Get current page file
    const f = await getFile('app/[locale]/page.tsx');
    if (!f) return new Response(JSON.stringify({ error: 'File not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    const current = decodeURIComponent(escape(atob(f.content.replace(/\n/g, ''))));

    // 2. Replace the directBooking section to add Smoobu booking motor
    // Current section has a black card with a link to /contacto
    // We replace the section content to include the Smoobu iframe
    const oldSection = `<section id="reservar" className="mx-auto max-w-6xl px-4 py-16 md:py-20">`;

    if (!current.includes(oldSection)) {
      return new Response(JSON.stringify({
        error: 'Section not found',
        hint: 'Check section id',
        preview: current.slice(current.indexOf('reservar') - 100, current.indexOf('reservar') + 200)
      }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }

    // Find and replace the directBooking section with Smoobu motor
    const newContent = current.replace(
      // Match from the reservar section start to end of its closing div structure
      /<section id="reservar" className="mx-auto max-w-6xl px-4 py-16 md:py-20">.*?<\/section>/s,
      `<section id="reservar" className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="rounded-3xl bg-neutral-900 text-white p-8 md:p-12 mb-12">
          <h2 className="text-2xl md:text-3xl font-semibold">{t('directBooking.title')}</h2>
          <p className="mt-4 max-w-3xl text-neutral-300 leading-relaxed">{t('directBooking.body')}</p>
        </div>
        {/* Smoobu Booking Motor */}
        <SmoobuBooking />
      </section>`
    );

    // Check if SmoobuBooking component exists in the file
    const needsComponent = !current.includes('SmoobuBooking');

    // Add SmoobuBooking component before the main component if needed
    let finalContent = newContent;
    if (needsComponent) {
      // Add component definition after imports section
      const smoobuComponent = `
function SmoobuBooking() {
  return (
    <div className="rounded-2xl overflow-hidden border border-neutral-200 bg-white">
      <div
        id="apartmentIframe352007"
        className="min-h-[600px] w-full"
        dangerouslySetInnerHTML={{
          __html: \`
            <script type="text/javascript" src="https://login.smoobu.com/js/Settings/BookingToolIframe.js"><\/script>
            <script type="text/javascript">
              document.addEventListener('DOMContentLoaded', function() {
                if (typeof BookingToolIframe !== 'undefined') {
                  BookingToolIframe.initialize({
                    url: 'https://login.smoobu.com/es/booking-tool/iframe/103685/352007',
                    baseUrl: 'https://login.smoobu.com',
                    target: '#apartmentIframe352007'
                  });
                }
              });
            <\/script>
          \`
        }}
      />
    </div>
  );
}
`;
      // Insert before the default export
      finalContent = newContent.replace('export default function', smoobuComponent + 'export default function');
    }

    const result = await putFile(
      'app/[locale]/page.tsx',
      finalContent,
      f.sha,
      'feat(landing): add Smoobu booking motor to #reservar section'
    );

    return new Response(JSON.stringify({ ok: result.status === 200 || result.status === 201, ...result, changed: needsComponent ? 'added SmoobuBooking + section' : 'updated section only' }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch(e: any) {
    return new Response(JSON.stringify({ error: e.message, stack: e.stack?.slice(0,300) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
