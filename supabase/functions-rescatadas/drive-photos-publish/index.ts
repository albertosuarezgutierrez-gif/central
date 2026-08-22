// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// 🔑 SECRETO SUSTITUIDO: llevaba el PAT `ghp_97Ct…` en claro → Deno.env.get('GITHUB_TOKEN').
// 📌 Parche de una tarde con la landing en `roi-intranet`: baja 4 fotos de Drive por la API
//    de miniaturas (`thumbnail?id=…&sz=w2000`, sin autenticar — la carpeta es pública) y las
//    commitea a la rama `feat/landing-public-seo` junto con dos ediciones de texto a
//    `page.tsx`/`layout.tsx` hechas por búsqueda-y-reemplazo de bloques EXACTOS.
//    Eso la hace de un solo uso: en cuanto el fichero destino cambia una coma, el
//    `if (!pageContent.includes(oldHero)) throw` la deja muerta. Candidata a borrar.
// ⚠️ `verify_jwt=false`: cualquiera con la URL dispara el commit. No acepta parámetros,
//    así que el daño está acotado a repetir ESE commit, pero sigue sin deber estar abierta.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OWNER = "albertosuarezgutierrez-gif";
const REPO = "roi-intranet";
const FEATURE_BRANCH = "feat/landing-public-seo";
const TOKEN = Deno.env.get("GITHUB_TOKEN")!;

const PHOTOS: { driveId: string; path: string }[] = [
  { driveId: "1oAiLqJlHLGc6iqIFtiXqZqTandNKewRf", path: "public/images/house/patio.jpg" },
  { driveId: "1rDXs-fjAmmDQFTfZ7fTutPZvosAV2GMo", path: "public/images/house/salon.jpg" },
  { driveId: "11KXrpvDr9wfO3W7ds0TSzMj1W7ixnQVQ", path: "public/images/house/dormitorio.jpg" },
  { driveId: "1nSzkddZhv8ul5HMXpVsfJZfL8XJZMuzd", path: "public/images/house/cocina.jpg" },
];

async function gh(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`GH ${method} ${path}: ${res.status} - ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function fetchDriveThumb(id: string, sz = "w2000"): Promise<Uint8Array> {
  const url = `https://drive.google.com/thumbnail?id=${id}&sz=${sz}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; HouseSevillanaBot/1.0)",
      "Accept": "image/jpeg,image/*",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`drive thumb ${id}: HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  if (ab.byteLength < 1000) throw new Error(`drive thumb ${id}: too small (${ab.byteLength} bytes), likely an HTML error page`);
  return new Uint8Array(ab);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

Deno.serve(async () => {
  try {
    // 1. Fetch images from Drive and create blobs in GitHub
    const blobs: { path: string; sha: string; bytes: number }[] = [];
    for (const photo of PHOTOS) {
      const bytes = await fetchDriveThumb(photo.driveId, "w2000");
      const b64 = bytesToBase64(bytes);
      const blob = await gh("/git/blobs", "POST", { content: b64, encoding: "base64" });
      blobs.push({ path: photo.path, sha: blob.sha, bytes: bytes.length });
    }

    // 2. Get HEAD commit of the feature branch
    const ref = await gh(`/git/refs/heads/${FEATURE_BRANCH}`);
    const headSha: string = ref.object.sha;
    const headCommit = await gh(`/git/commits/${headSha}`);
    const baseTreeSha: string = headCommit.tree.sha;

    // 3. Read current page.tsx and layout.tsx from the branch
    const pageResp = await gh(`/contents/app/%5Blocale%5D/page.tsx?ref=${FEATURE_BRANCH}`);
    const layoutResp = await gh(`/contents/app/%5Blocale%5D/layout.tsx?ref=${FEATURE_BRANCH}`);
    const decode = (b64: string) => {
      const bin = atob(b64.replace(/\n/g, ""));
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new TextDecoder("utf-8").decode(arr);
    };
    let pageContent = decode(pageResp.content);
    let layoutContent = decode(layoutResp.content);

    // 4a. Replace the hero placeholder in page.tsx
    const oldHero = `<div className="aspect-[4/3] rounded-2xl bg-neutral-200 overflow-hidden">
            {/* Sustituye por <Image> de next/image cuando tengas las fotos en /public/images */}
            <div className="w-full h-full flex items-center justify-center text-neutral-500 text-sm">
              [Foto principal del patio o exterior]
            </div>
          </div>`;
    const newHero = `<div className="aspect-[4/3] rounded-2xl overflow-hidden bg-neutral-100">
            <img
              src="/images/house/patio.jpg"
              alt={t("meta.ogAlt")}
              className="w-full h-full object-cover"
              loading="eager"
              fetchPriority="high"
            />
          </div>`;
    if (!pageContent.includes(oldHero)) {
      throw new Error("page.tsx: hero placeholder block not found");
    }
    pageContent = pageContent.replace(oldHero, newHero);

    // 4b. Update OG image URL in page.tsx (LodgingBusiness JSON-LD)
    pageContent = pageContent.replaceAll(
      "https://housesevillana.vercel.app/og/house-sevillana-1200x630.jpg",
      "https://housesevillana.vercel.app/images/house/patio.jpg"
    );

    // 4c. Update OG image URL in layout.tsx (metadata.openGraph.images and twitter.images)
    layoutContent = layoutContent.replaceAll(
      "/og/house-sevillana-1200x630.jpg",
      "/images/house/patio.jpg"
    );

    // 5. Build tree: image blobs by sha + modified text files by content
    const treeItems: any[] = [
      ...blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
      { path: "app/[locale]/page.tsx", mode: "100644", type: "blob", content: pageContent },
      { path: "app/[locale]/layout.tsx", mode: "100644", type: "blob", content: layoutContent },
    ];
    const newTree = await gh("/git/trees", "POST", { base_tree: baseTreeSha, tree: treeItems });
    const newCommit = await gh("/git/commits", "POST", {
      message: "feat(landing): add 4 house photos from Drive and wire them up\n\n- public/images/house/{patio,salon,dormitorio,cocina}.jpg fetched via Drive thumbnail API at w=2000 (~300-800KB each, JPEG)\n- replaces hero placeholder with patio.jpg (eager + fetchPriority=high)\n- updates OG image URL in metadata and JSON-LD to use patio.jpg (provisional, until a 1200x630 OG specific is generated)",
      tree: newTree.sha,
      parents: [headSha],
    });
    await gh(`/git/refs/heads/${FEATURE_BRANCH}`, "PATCH", { sha: newCommit.sha });

    return new Response(JSON.stringify({
      success: true,
      branch: FEATURE_BRANCH,
      commitSha: newCommit.sha,
      photos: blobs.map((b) => ({ path: b.path, sha: b.sha, kb: Math.round(b.bytes / 1024) })),
      heroReplaced: true,
      ogUrlUpdated: true,
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const err = e as Error;
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
