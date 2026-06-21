# Concursos — Buscador de pliegos · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un buscador on-demand de licitaciones por sector en ialimp: un cron ingiere PLACSP a un corpus compartido y el usuario busca con filtros (CPV, texto, en plazo, provincia, presupuesto) y orden.

**Architecture:** Se amplía el parser PURO `parsearAtomPlacsp` (`apps/ialimp/lib/concursos-radar.ts`) con provincia/estado/fin_presentacion/tipo_contrato (TDD). Tabla-corpus `concursos_licitaciones` (no por empresa) que un cron rellena por upsert. Endpoint de búsqueda con SQL componible (`Prisma.sql`) + full-text de Postgres. UI con "guardar búsqueda como alerta" que reutiliza los criterios del radar.

**Tech Stack:** Next.js + Prisma/Supabase (Postgres FTS); `fast-xml-parser` (ya instalado); `node --test`. Scope de paquetes: **`@central/*`** (el monorepo renombró `@iarest/`→`@central/`).

**Spec:** `docs/superpowers/specs/2026-06-11-concursos-buscador-pliegos-design.md`

---

## File Structure

- Modify: `apps/ialimp/lib/concursos-radar.ts` — ampliar `AnuncioPlacsp` + `parsearAtomPlacsp`.
- Modify: `apps/ialimp/lib/concursos-radar.test.ts` — tests de los campos nuevos.
- Modify: `apps/ialimp/lib/__fixtures__/placsp-sample.atom.xml` — añadir campos al fixture.
- Create: `apps/ialimp/prisma/migrations/add_concursos_licitaciones.sql`.
- Create: `apps/ialimp/app/api/cron/concursos-ingesta/route.ts`.
- Modify: `apps/ialimp/vercel.json` — cron de ingesta.
- Create: `apps/ialimp/app/api/admin/concursos/radar/buscar/route.ts`.
- Modify: `apps/ialimp/app/admin/concursos/page.tsx` — sección "🔎 Buscar concursos".

---

## Task 1: Ampliar el parser con provincia/estado/fin_presentacion/tipo_contrato (TDD)

**Files:**
- Modify: `apps/ialimp/lib/__fixtures__/placsp-sample.atom.xml`
- Modify: `apps/ialimp/lib/concursos-radar.test.ts`
- Modify: `apps/ialimp/lib/concursos-radar.ts`

- [ ] **Step 1: Ampliar el fixture**

En `apps/ialimp/lib/__fixtures__/placsp-sample.atom.xml`, dentro del **primer** `<cac-place-ext:ContractFolderStatus>` (el de la licitación 11111), añade el código de estado y el proceso de licitación (junto a los nodos existentes), y dentro de su `<cac:ProcurementProject>` añade el lugar de ejecución. Es decir, el primer entry debe quedar así (reemplaza el bloque `ContractFolderStatus` de la licitación 11111 por este, conservando lo que ya tenía y añadiendo `ContractFolderStatusCode`, `TenderingProcess` y `RealizedLocation`):

```xml
    <cac-place-ext:ContractFolderStatus>
      <cbc:ContractFolderID>11111/2026</cbc:ContractFolderID>
      <cbc:ContractFolderStatusCode>PUB</cbc:ContractFolderStatusCode>
      <cac-place-ext:LocatedContractingParty>
        <cac:Party><cac:PartyName><cbc:Name>Ayuntamiento de Avilés</cbc:Name></cac:PartyName></cac:Party>
      </cac-place-ext:LocatedContractingParty>
      <cac:ProcurementProject>
        <cbc:Name>Servicio de limpieza de colegios públicos</cbc:Name>
        <cbc:TypeCode>2</cbc:TypeCode>
        <cac:BudgetAmount><cbc:TotalAmount currencyID="EUR">120000.00</cbc:TotalAmount></cac:BudgetAmount>
        <cac:RequiredCommodityClassification><cbc:ItemClassificationCode>90910000</cbc:ItemClassificationCode></cac:RequiredCommodityClassification>
        <cac:RealizedLocation><cac:Address><cbc:CountrySubentity>Asturias</cbc:CountrySubentity></cac:Address></cac:RealizedLocation>
      </cac:ProcurementProject>
      <cac:TenderingProcess>
        <cac:TenderSubmissionDeadlinePeriod><cbc:EndDate>2026-07-15</cbc:EndDate></cac:TenderSubmissionDeadlinePeriod>
      </cac:TenderingProcess>
    </cac-place-ext:ContractFolderStatus>
```

(El segundo entry, la licitación 22222, se deja **sin** `TenderingProcess` para probar la tolerancia a la ausencia de fecha.)

- [ ] **Step 2: Escribir el test que falla**

En `apps/ialimp/lib/concursos-radar.test.ts`, dentro del test existente `'parsearAtomPlacsp: extrae los anuncios con sus campos'`, añade tras las aserciones de `limpieza` ya existentes:

```ts
  assert.equal(limpieza.estado, 'PUB')
  assert.equal(limpieza.provincia, 'Asturias')
  assert.equal(limpieza.tipo_contrato, '2')
  assert.equal(limpieza.fin_presentacion, '2026-07-15')
```

Y tras las de `obra`:

```ts
  assert.equal(obra.fin_presentacion, undefined) // sin TenderingProcess
```

- [ ] **Step 3: Ejecutar y verificar que falla**

Run: `cd /home/user/central/apps/ialimp && node --test lib/concursos-radar.test.ts`
Expected: FAIL — las nuevas aserciones (`limpieza.estado` etc.) fallan (undefined).

- [ ] **Step 4: Implementar**

En `apps/ialimp/lib/concursos-radar.ts`:

1. Amplía la interfaz `AnuncioPlacsp` añadiendo campos (junto a `expediente`/`atom_id`):

```ts
  estado?: string          // ContractFolderStatusCode (PUB, EV, RES, ADJ...)
  provincia?: string       // lugar de ejecución (CountrySubentity)
  tipo_contrato?: string   // TypeCode CODICE
  fin_presentacion?: string // ISO 'YYYY-MM-DD' (fin de presentación de ofertas)
```

2. Dentro de `parsearAtomPlacsp`, en el bucle `for (const e of entries)`, tras calcular `presupuesto` y antes del `out.push({...})`, añade:

```ts
    const estado = texto(cfs?.ContractFolderStatusCode)
    const provincia = texto(pp?.RealizedLocation?.Address?.CountrySubentity)
    const tipo_contrato = texto(pp?.TypeCode)
    const fin_presentacion = texto(cfs?.TenderingProcess?.TenderSubmissionDeadlinePeriod?.EndDate)
```

3. Añade esos cuatro campos al objeto del `out.push({...})`:

```ts
      estado,
      provincia,
      tipo_contrato,
      fin_presentacion,
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `cd /home/user/central/apps/ialimp && node --test lib/concursos-radar.test.ts`
Expected: PASS (los 4 tests del fichero, incluido el ampliado).

- [ ] **Step 6: Commit**

```bash
cd /home/user/central
git config user.email noreply@anthropic.com && git config user.name Claude
git add apps/ialimp/lib/concursos-radar.ts apps/ialimp/lib/concursos-radar.test.ts apps/ialimp/lib/__fixtures__/placsp-sample.atom.xml
git commit -m "feat(ialimp): parser PLACSP extrae provincia/estado/fin_presentacion/tipo (buscador)"
```

---

## Task 2: Migración del corpus

**Files:**
- Create: `apps/ialimp/prisma/migrations/add_concursos_licitaciones.sql`

- [ ] **Step 1: Crear la migración**

Crea `apps/ialimp/prisma/migrations/add_concursos_licitaciones.sql`:

```sql
-- Buscador de pliegos: corpus compartido de licitaciones (no por empresa).
create table if not exists concursos_licitaciones (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  titulo text not null,
  objeto text,
  cpv text[] not null default '{}',
  presupuesto numeric,
  organo text,
  provincia text,
  tipo_contrato text,
  estado text,
  fin_presentacion date,
  url text,
  fuente text not null default 'placsp',
  fts tsvector,
  actualizado_en timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_lic_fin on concursos_licitaciones (fin_presentacion);
create index if not exists idx_lic_cpv on concursos_licitaciones using gin (cpv);
create index if not exists idx_lic_fts on concursos_licitaciones using gin (fts);
```

- [ ] **Step 2: Commit**

```bash
cd /home/user/central
git add apps/ialimp/prisma/migrations/add_concursos_licitaciones.sql
git commit -m "feat(ialimp): migración del corpus de licitaciones (buscador)"
```

---

## Task 3: Cron de ingesta al corpus

**Files:**
- Create: `apps/ialimp/app/api/cron/concursos-ingesta/route.ts`
- Modify: `apps/ialimp/vercel.json`

- [ ] **Step 1: Implementar el cron**

Crea `apps/ialimp/app/api/cron/concursos-ingesta/route.ts` (reutiliza el parser y la descarga ATOM como el cron de radar; ver `app/api/cron/concursos-radar/route.ts` para el patrón de `descargarAtom`):

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { parsearAtomPlacsp, dedupeKey } from '@/lib/concursos-radar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const FEED_URL = process.env.PLACSP_FEED_URL
  || 'https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom'
const MAX_PAGINAS = 3

async function descargarAtom(): Promise<string> {
  let url: string | null = FEED_URL
  const partes: string[] = []
  for (let i = 0; i < MAX_PAGINAS && url; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'ialimp-buscador/1.0' }, cache: 'no-store' })
    if (!res.ok) break
    const xml = await res.text()
    partes.push(xml)
    const m = xml.match(/<link[^>]+rel=["']next["'][^>]+href=["']([^"']+)["']/i)
    url = m ? m[1] : null
  }
  return partes.join('\n')
}

export async function GET() {
  let xml = ''
  try { xml = await descargarAtom() }
  catch (e: any) { return NextResponse.json({ ok: false, error: 'fetch ATOM: ' + (e?.message || e) }, { status: 200 }) }
  const anuncios = parsearAtomPlacsp(xml)

  let upserts = 0
  for (const a of anuncios) {
    const k = dedupeKey(a)
    if (!k) continue
    const objeto = a.objeto ?? a.titulo
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO concursos_licitaciones
        (dedupe_key, titulo, objeto, cpv, presupuesto, organo, provincia, tipo_contrato, estado, fin_presentacion, url, fuente, fts, actualizado_en)
      VALUES (
        ${k}, ${a.titulo}, ${objeto}, ${a.cpv ?? []}::text[], ${a.presupuesto ?? null}, ${a.organo ?? null},
        ${a.provincia ?? null}, ${a.tipo_contrato ?? null}, ${a.estado ?? null}, ${a.fin_presentacion ?? null}::date,
        ${a.url ?? null}, 'placsp', to_tsvector('spanish', ${a.titulo + ' ' + objeto}), now()
      )
      ON CONFLICT (dedupe_key) DO UPDATE SET
        titulo = EXCLUDED.titulo, objeto = EXCLUDED.objeto, cpv = EXCLUDED.cpv, presupuesto = EXCLUDED.presupuesto,
        organo = EXCLUDED.organo, provincia = EXCLUDED.provincia, tipo_contrato = EXCLUDED.tipo_contrato,
        estado = EXCLUDED.estado, fin_presentacion = EXCLUDED.fin_presentacion, url = EXCLUDED.url,
        fts = EXCLUDED.fts, actualizado_en = now()
    `)
    upserts++
  }
  return NextResponse.json({ ok: true, ingeridos: upserts })
}
```

- [ ] **Step 2: Añadir el cron a `vercel.json`**

En `apps/ialimp/vercel.json`, dentro del array `"crons"`, añade (cada 6 h, desfasado del de radar):

```json
    {
      "path": "/api/cron/concursos-ingesta",
      "schedule": "30 */6 * * *"
    }
```

- [ ] **Step 3: Build + JSON válido**

Run: `cd /home/user/central/apps/ialimp && npm run build && node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'));console.log('json ok')"`
Expected: `✓ Compiled successfully` (puede abortar luego en "Collecting page data" por `JWT_SECRET` — env, no código); `json ok`.

- [ ] **Step 4: Commit**

```bash
cd /home/user/central
git add apps/ialimp/app/api/cron/concursos-ingesta/route.ts apps/ialimp/vercel.json
git commit -m "feat(ialimp): cron de ingesta de licitaciones al corpus (buscador)"
```

---

## Task 4: Endpoint de búsqueda

**Files:**
- Create: `apps/ialimp/app/api/admin/concursos/radar/buscar/route.ts`

- [ ] **Step 1: Implementar**

Crea `apps/ialimp/app/api/admin/concursos/radar/buscar/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Buscador del corpus de licitaciones. El corpus es común; exige sesión.

export async function GET(req: Request) {
  try { await requireEmpresaId() }
  catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  const sp = new URL(req.url).searchParams
  const cpvList = (sp.get('cpv') || '').split(',').map(s => s.trim()).filter(Boolean)
  const q = (sp.get('q') || '').trim()
  const enPlazo = sp.get('en_plazo') !== '0' // por defecto sí
  const provincia = (sp.get('provincia') || '').trim()
  const min = sp.get('presupuesto_min') ? Number(sp.get('presupuesto_min')) : null
  const max = sp.get('presupuesto_max') ? Number(sp.get('presupuesto_max')) : null
  const orden = sp.get('orden') || 'relevancia'
  const page = Math.max(1, Number(sp.get('page') || '1'))
  const porPagina = 30
  const offset = (page - 1) * porPagina

  const conds: Prisma.Sql[] = []
  if (enPlazo) conds.push(Prisma.sql`fin_presentacion >= current_date`)
  if (cpvList.length) {
    const likes = cpvList.map(p => Prisma.sql`c LIKE ${p + '%'}`)
    conds.push(Prisma.sql`EXISTS (SELECT 1 FROM unnest(cpv) AS c WHERE ${Prisma.join(likes, ' OR ')})`)
  }
  if (q) conds.push(Prisma.sql`fts @@ plainto_tsquery('spanish', ${q})`)
  if (provincia) conds.push(Prisma.sql`provincia ILIKE ${'%' + provincia + '%'}`)
  if (min !== null && Number.isFinite(min)) conds.push(Prisma.sql`presupuesto >= ${min}`)
  if (max !== null && Number.isFinite(max)) conds.push(Prisma.sql`presupuesto <= ${max}`)
  const where = conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty

  const order =
    orden === 'cierre' ? Prisma.sql`ORDER BY fin_presentacion ASC NULLS LAST`
    : orden === 'presupuesto' ? Prisma.sql`ORDER BY presupuesto DESC NULLS LAST`
    : q ? Prisma.sql`ORDER BY ts_rank(fts, plainto_tsquery('spanish', ${q})) DESC, created_at DESC`
    : Prisma.sql`ORDER BY created_at DESC`

  const resultados = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, titulo, objeto, cpv, presupuesto, organo, provincia, tipo_contrato, estado, fin_presentacion, url
    FROM concursos_licitaciones
    ${where}
    ${order}
    LIMIT ${porPagina} OFFSET ${offset}
  `)
  const totalRows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT count(*)::int AS n FROM concursos_licitaciones ${where}
  `)
  return NextResponse.json({ resultados, total: totalRows[0]?.n ?? 0, page })
}
```

- [ ] **Step 2: Build**

Run: `cd /home/user/central/apps/ialimp && npm run build`
Expected: `✓ Compiled successfully` (aborta luego por `JWT_SECRET` — env, no código). Pega la línea de Compiled.

- [ ] **Step 3: Commit**

```bash
cd /home/user/central
git add apps/ialimp/app/api/admin/concursos/radar/buscar/route.ts
git commit -m "feat(ialimp): endpoint de búsqueda de licitaciones (buscador)"
```

---

## Task 5: UI — sección "🔎 Buscar concursos" + guardar como alerta

**Files:**
- Modify: `apps/ialimp/app/admin/concursos/page.tsx`

- [ ] **Step 1: Releer la página**

Run: `sed -n '1,60p' apps/ialimp/app/admin/concursos/page.tsx` y localiza `const C`, `FONT`, `RadarPanel` y dónde se montan los paneles, para imitar el estilo.

- [ ] **Step 2: Añadir el componente `BuscadorPanel`**

Añade en `apps/ialimp/app/admin/concursos/page.tsx` un componente `BuscadorPanel` y móntalo junto al `RadarPanel` (p. ej. justo después). Usa `C` y `FONT` existentes:

```tsx
function BuscadorPanel() {
  const [f, setF] = useState<any>({ q:'', cpv:'', provincia:'', presupuesto_min:'', presupuesto_max:'', en_plazo:true, orden:'relevancia' });
  const [res, setRes] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [hecha, setHecha] = useState(false);

  const buscar = async () => {
    setCargando(true);
    const p = new URLSearchParams();
    if (f.q) p.set('q', f.q);
    if (f.cpv) p.set('cpv', f.cpv);
    if (f.provincia) p.set('provincia', f.provincia);
    if (f.presupuesto_min) p.set('presupuesto_min', f.presupuesto_min);
    if (f.presupuesto_max) p.set('presupuesto_max', f.presupuesto_max);
    p.set('en_plazo', f.en_plazo ? '1' : '0');
    p.set('orden', f.orden);
    const r = await fetch('/api/admin/concursos/radar/buscar?' + p.toString()).then(r=>r.json()).catch(()=>null);
    setRes(r?.resultados ?? []); setTotal(r?.total ?? 0); setHecha(true); setCargando(false);
  };

  const guardarComoAlerta = async () => {
    await fetch('/api/admin/concursos/radar/criterios', {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        activo: true,
        cpv: f.cpv ? f.cpv.split(',').map((s:string)=>s.trim()).filter(Boolean) : [],
        palabras_clave: f.q ? f.q.split(/\s+/).filter(Boolean) : [],
        presupuesto_min: f.presupuesto_min || null, presupuesto_max: f.presupuesto_max || null,
      }),
    });
    alert('Búsqueda guardada como alerta del radar ✅');
  };

  const dias = (iso:string) => { if(!iso) return null; const d=Math.ceil((new Date(iso).getTime()-Date.now())/86400000); return d; };

  return (
    <div style={{ border:`1px solid ${C.border}`, borderRadius:12, padding:14, marginBottom:14 }}>
      <strong style={{ fontSize:15 }}>🔎 Buscar concursos</strong>
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:8, margin:'10px 0' }}>
        <input placeholder="Buscar por texto (objeto)…" value={f.q} onChange={e=>setF({...f,q:e.target.value})} onKeyDown={e=>{ if(e.key==='Enter') buscar(); }} />
        <input placeholder="CPV (coma, por prefijo)" value={f.cpv} onChange={e=>setF({...f,cpv:e.target.value})} />
        <input placeholder="Provincia" value={f.provincia} onChange={e=>setF({...f,provincia:e.target.value})} />
        <div style={{ display:'flex', gap:6 }}>
          <input placeholder="€ mín" value={f.presupuesto_min} onChange={e=>setF({...f,presupuesto_min:e.target.value})} style={{ width:'50%' }} />
          <input placeholder="€ máx" value={f.presupuesto_max} onChange={e=>setF({...f,presupuesto_max:e.target.value})} style={{ width:'50%' }} />
        </div>
      </div>
      <div style={{ display:'flex', gap:14, alignItems:'center', flexWrap:'wrap', fontSize:13 }}>
        <label style={{ display:'flex', gap:6, alignItems:'center' }}><input type="checkbox" checked={f.en_plazo} onChange={e=>setF({...f,en_plazo:e.target.checked})} /> Solo en plazo</label>
        <label style={{ display:'flex', gap:6, alignItems:'center' }}>Orden:
          <select value={f.orden} onChange={e=>setF({...f,orden:e.target.value})}>
            <option value="relevancia">Relevancia</option>
            <option value="cierre">Cierran antes</option>
            <option value="presupuesto">Mayor presupuesto</option>
          </select>
        </label>
        <button onClick={buscar} disabled={cargando} style={{ background:C.indigo, color:'#fff', border:0, borderRadius:8, padding:'8px 14px', fontFamily:FONT, fontWeight:800, fontSize:13, cursor:'pointer' }}>{cargando?'Buscando…':'Buscar'}</button>
        {hecha && <button onClick={guardarComoAlerta} style={{ background:'transparent', border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 12px', fontSize:13, cursor:'pointer' }}>🔔 Guardar como alerta</button>}
      </div>

      {hecha && <div style={{ fontSize:12, color:C.muted, marginTop:10 }}>{total} resultado{total===1?'':'s'}</div>}
      <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:8 }}>
        {res.map(a => { const d = dias(a.fin_presentacion); return (
          <div key={a.id} style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
              <strong style={{ fontSize:14 }}>{a.titulo}</strong>
              {d!==null && <span style={{ fontSize:12, color: d<=3?'#b91c1c':C.muted, fontWeight:700 }}>{d<0?'cerrado':`${d} d`}</span>}
            </div>
            <div style={{ fontSize:12, color:C.muted }}>{a.organo}{a.provincia?` · ${a.provincia}`:''}{a.presupuesto?` · ${Number(a.presupuesto).toLocaleString('es-ES')} €`:''}</div>
            <div style={{ fontSize:12, marginTop:4 }}>{(a.cpv||[]).slice(0,4).join(' · ')}</div>
            {a.url && <a href={a.url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:C.indigo }}>Ver anuncio ↗</a>}
          </div>
        ); })}
      </div>
    </div>
  );
}
```

Monta `<BuscadorPanel />` en el render (junto a `<RadarPanel />`). Asegúrate de que `useState` está importado (ya lo estará).

- [ ] **Step 3: Build + tests del módulo**

Run: `cd /home/user/central/apps/ialimp && npm run build && cd ../../packages/module-concursos && npm test`
Expected: ialimp `✓ Compiled successfully` (aborta luego por `JWT_SECRET` — env); módulo 79/79 verde.

- [ ] **Step 4: Commit**

```bash
cd /home/user/central
git add apps/ialimp/app/admin/concursos/page.tsx
git commit -m "feat(ialimp): UI del buscador de concursos + guardar como alerta (buscador)"
```

---

## Task 6: Docs, memoria y PR

**Files:**
- Modify: `docs/CONTEXTO-SESIONES.md`
- Modify: `apps/ialimp/CLAUDE.md`

- [ ] **Step 1: Entrada en CONTEXTO-SESIONES**

Añade arriba en "Estado actual" una entrada **Concursos — Buscador de pliegos**: parser PLACSP ampliado (provincia/estado/fin_presentacion/tipo, TDD), corpus `concursos_licitaciones` (migración), cron `/api/cron/concursos-ingesta` (cada 6 h, upsert), endpoint `radar/buscar` (CPV/texto FTS/en plazo/provincia/presupuesto + orden) y UI "🔎 Buscar concursos" con "guardar como alerta". **Pendiente de Alberto:** aplicar `add_concursos_licitaciones.sql`. Fase 2: BOE como fuente y unificar el radar sobre el corpus.

- [ ] **Step 2: Nota en `apps/ialimp/CLAUDE.md`**

Bajo el bloque de Concursos, añade una línea de **Buscador**: corpus compartido `concursos_licitaciones` alimentado por cron de ingesta (PLACSP), buscador con FTS de Postgres y filtros (CPV/texto/en plazo/provincia/presupuesto), "guardar búsqueda como alerta" reusa los criterios del radar. Migración nueva: `add_concursos_licitaciones.sql`.

- [ ] **Step 3: Commit, push y PR (borrador)**

```bash
cd /home/user/central
git config user.email noreply@anthropic.com && git config user.name Claude
git add docs/CONTEXTO-SESIONES.md apps/ialimp/CLAUDE.md
git commit -m "docs: registro de sesión del buscador de pliegos (concursos)"
git push -u origin claude/concursos-buscador-pliegos
```

Luego crea un PR en **draft** de `claude/concursos-buscador-pliegos` → `main` titulado "Buscador de pliegos: licitaciones por sector (concursos)" con el resumen y el pendiente de Alberto (1 migración). Usa la herramienta de GitHub MCP.

---

## Notas de cierre

- **Testeable (`node --test`):** la ampliación de `parsearAtomPlacsp` (4 campos nuevos). El resto (corpus, cron, buscador, UI) se valida con build + preview.
- **Scope de paquetes `@central/*`** (renombrado desde `@iarest/`). El módulo `@central/module-concursos` no se toca.
- **Pendiente de Alberto:** aplicar `add_concursos_licitaciones.sql` en Supabase. Hasta entonces el buscador devolverá error al consultar (tabla inexistente) — igual que el resto de migraciones manuales.
- **Datos al arrancar:** el buscador estará vacío hasta que el cron de ingesta corra al menos una vez (o se invoque manualmente `/api/cron/concursos-ingesta`).
