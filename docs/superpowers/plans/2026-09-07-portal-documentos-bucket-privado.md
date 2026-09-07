# Guardar el PDF de la póliza en un bucket privado — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el PDF que sube un cliente en `/boveda` se conserve en un bucket privado de la Supabase compartida, y que solo lo pueda descargar quien tiene derecho a verlo.

**Architecture:** el fichero se sube desde la ruta que ya lo recibe (`app/api/polizas/route.ts`), se guarda en el bucket `polizas-portal` con una ruta derivada de la identidad, y se sirve SIEMPRE por una ruta del servidor que resuelve la sesión — nunca por URL pública ni firmada que viaje al cliente.

**Tech Stack:** `@central/core-storage` (ampliado), Supabase Storage REST, Prisma, Next.js App Router.

---

## Por qué existe este plan

Alberto, 07/09/2026, tras subir un PDF y ver «No hemos podido leer el documento»: «se debería crear enlace para que esas pólizas se suban a mi Drive, tengo mucha capacidad ahí».

Dos hallazgos que cambian el planteamiento:

1. **El error que vio NO es de almacenamiento.** `apps/asegura-portal/lib/extraer-poliza.ts:277` devuelve «no he leído nada» en cuanto falta `OPENROUTER_API_KEY`. Eso se arregla en el panel de Vercel, no aquí.
2. **Hoy el PDF no se guarda en ningún sitio.** `PortalPolizaDeclarada` solo tiene `documentoNombre` (el NOMBRE del fichero, `schema.prisma:193`). No hay columna de bytes ni bucket: el PDF se lee, se extraen los campos y se descarta. Cuando la pantalla dice «la póliza está guardada» se refiere a la ficha.

Y por qué **no** Drive: son documentos de terceros. Como correduría, Alberto es responsable del tratamiento; su Drive personal sería un encargado sin contrato del art. 28 RGPD, no tiene aislamiento por cliente (aquí lo impone el código contra `prisma_asegura_portal`, que es NOBYPASSRLS) y un enlace compartido está a un clic de que un cliente vea la póliza de otro. La capacidad no es el problema: [Suposición] un PDF de póliza son 200 KB–2 MB.

---

## 🚨 La decisión de seguridad, resuelta antes de empezar

Escribir en un bucket privado necesita credencial. Las dos opciones y por qué se elige la segunda:

- **`SUPABASE_SERVICE_ROLE_KEY` en el portal** — sencillo y **descartado**. El portal es a propósito la app con MENOS privilegio del monorepo (rol sin BYPASSRLS, GRANT por columnas). Meterle una service_role tira ese diseño abajo: esa clave puede leer y escribir CUALQUIER tabla de la Supabase compartida, incluida la cartera entera de `seguros`.
- **✅ Política de Storage acotada por prefijo, con la `anonKey`** — el bucket es privado, y una policy permite `INSERT` al rol `anon` solo bajo `declaradas/`. La lectura **no** se abre a nadie: se sirve por una ruta del servidor que firma el objeto en el momento y con caducidad corta.

Consecuencia buscada: si la `anonKey` del portal se filtrara, lo peor que se podría hacer es escribir basura bajo `declaradas/` — no leer las pólizas de nadie.

---

## File Structure

| Fichero | Responsabilidad |
|---|---|
| `packages/core-storage/src/subir.ts` (crear) | `subirObjeto()` y `borrarObjeto()` por REST. Puro I/O, sin lógica de negocio. |
| `packages/core-storage/src/subir.test.ts` (crear) | Cepos del contrato: no lanza, devuelve `null`, no compone rutas con `..`. |
| `packages/core-storage/src/index.ts` (modificar) | Exportar lo nuevo. |
| `apps/asegura-portal/lib/documento-poliza.ts` (crear) | La RUTA del objeto y qué mime se aceptan. Puro y testeado: es lo que impide que la ruta de un cliente apunte a la carpeta de otro. |
| `apps/asegura-portal/lib/documento-poliza.test.ts` (crear) | Cepos de la ruta y del mime. |
| `apps/asegura-portal/prisma/schema.prisma` (modificar) | `documentoRuta`, `documentoMime`, `documentoBytes` en `PortalPolizaDeclarada`. |
| `apps/asegura-portal/prisma/sql/2026-09-XX-documento.sql` (crear) | `ALTER TABLE` + **`GRANT` por columna** + creación del bucket + policy. |
| `apps/asegura-portal/app/api/polizas/route.ts` (modificar) | Subir tras extraer; guardar la ruta. |
| `apps/asegura-portal/app/api/polizas/[id]/documento/route.ts` (crear) | Servir el documento comprobando la sesión. |
| `apps/asegura-portal/app/(portal)/boveda/FilaDeclarada.tsx` (modificar) | Enlace «Ver el documento» solo cuando `documentoRuta` no es null. |

---

### Task 1: subir y borrar objetos en `@central/core-storage`

**Files:**
- Create: `packages/core-storage/src/subir.ts`
- Create: `packages/core-storage/src/subir.test.ts`
- Modify: `packages/core-storage/src/index.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { rutaSegura } from './subir.ts'

test('🚨 una ruta con .. no sale del prefijo', () => {
  // Sin esto, un nombre de fichero manipulado escribe en la carpeta de otro
  // cliente y el bucket privado deja de aislar nada.
  assert.equal(rutaSegura('declaradas/abc', '../otro/x.pdf'), null)
  assert.equal(rutaSegura('declaradas/abc', 'a/../../x.pdf'), null)
})

test('la ruta buena se compone', () => {
  assert.equal(rutaSegura('declaradas/abc', 'poliza.pdf'), 'declaradas/abc/poliza.pdf')
})
```

- [ ] **Step 2: Ejecutarlo y verlo fallar**

Run: `cd packages/core-storage && node --test src/subir.test.ts`
Expected: FAIL — `Cannot find module './subir.ts'`

- [ ] **Step 3: Implementar**

```ts
/** Compone la ruta dentro del bucket, o `null` si intenta salirse del prefijo. */
export function rutaSegura(prefijo: string, nombre: string): string | null {
  if (nombre.includes('..') || nombre.startsWith('/')) return null
  const limpio = nombre.replace(/[^\w.\- ]+/g, '_').trim()
  if (!limpio) return null
  return `${prefijo}/${limpio}`
}

/** Sube un objeto. Devuelve la ruta guardada o `null`. NO lanza. */
export async function subirObjeto(
  config: SupabaseStorageConfig,
  bucket: string,
  ruta: string,
  cuerpo: ArrayBuffer | Uint8Array,
  mime: string,
): Promise<string | null> {
  try {
    const r = await fetch(`${config.url}/storage/v1/object/${bucket}/${ruta}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.anonKey}`,
        'Content-Type': mime,
        'x-upsert': 'false',
      },
      body: cuerpo as BodyInit,
    })
    if (!r.ok) {
      console.error('subirObjeto', r.status, await r.text())
      return null
    }
    return ruta
  } catch (e: any) {
    console.error('subirObjeto', e?.message)
    return null
  }
}
```

- [ ] **Step 4: Verlo pasar y exportarlo**

Run: `node --test src/subir.test.ts` → PASS. Añadir a `index.ts`:
`export { rutaSegura, subirObjeto } from './subir'`

- [ ] **Step 5: Commit**

```bash
git add packages/core-storage
git commit -m "feat(core-storage): subir objetos a un bucket privado, con la ruta acotada"
```

---

### Task 2: la ruta del documento, pura y con cepo

**Files:**
- Create: `apps/asegura-portal/lib/documento-poliza.ts`
- Create: `apps/asegura-portal/lib/documento-poliza.test.ts`

- [ ] **Step 1: Test primero**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { prefijoDeIdentidad, mimeAceptado } from './documento-poliza.ts'

test('🚨 el prefijo lleva la identidad, no el nombre', () => {
  // Si el prefijo saliera del nombre del cliente, dos homónimos compartirían
  // carpeta. Es la regla global «agrupar por IDENTIDAD, nunca por la etiqueta».
  const id = '3f1b0e2a-0000-4000-8000-000000000001'
  assert.equal(prefijoDeIdentidad(id), `declaradas/${id}`)
})

test('🚨 solo PDF e imagen', () => {
  assert.equal(mimeAceptado('application/pdf'), true)
  assert.equal(mimeAceptado('image/jpeg'), true)
  assert.equal(mimeAceptado('text/html'), false, 'un HTML servido de vuelta es un XSS')
  assert.equal(mimeAceptado('image/svg+xml'), false, 'un SVG lleva script dentro')
})
```

- [ ] **Step 2: Verlo fallar** → `node --test lib/documento-poliza.test.ts`
- [ ] **Step 3: Implementar** con esos dos exports y nada más.
- [ ] **Step 4: Verlo pasar.**
- [ ] **Step 5: Commit.**

---

### Task 3: la BD — columnas, GRANT y bucket

**Files:**
- Modify: `apps/asegura-portal/prisma/schema.prisma`
- Create: `apps/asegura-portal/prisma/sql/2026-09-XX-documento.sql`

🚨 **El GRANT va ANTES de declarar la columna en Prisma.** El `CLAUDE.md` de esta app lo documenta con un incidente: el rol tiene SELECT **por columnas**, y declarar una sin conceder revienta **TODAS** las lecturas del modelo con `42501`, no solo la de esa columna.

- [ ] **Step 1: El SQL, en este orden**

```sql
-- 1. Columnas
alter table seguros.portal_polizas_declaradas
  add column if not exists documento_ruta  text,
  add column if not exists documento_mime  text,
  add column if not exists documento_bytes integer;

-- 2. 🚨 GRANT por columna ANTES de tocar Prisma
grant select (documento_ruta, documento_mime, documento_bytes)
  on seguros.portal_polizas_declaradas to prisma_asegura_portal;
grant update (documento_ruta, documento_mime, documento_bytes)
  on seguros.portal_polizas_declaradas to prisma_asegura_portal;

-- 3. Bucket PRIVADO
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('polizas-portal', 'polizas-portal', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- 4. Escritura acotada por prefijo; NINGUNA policy de lectura (se firma en servidor)
create policy "portal sube bajo declaradas/" on storage.objects
  for insert to anon
  with check (bucket_id = 'polizas-portal' and (storage.foldername(name))[1] = 'declaradas');
```

- [ ] **Step 2: Aplicarlo primero en PREVIEW**, comprobar que `/boveda` sigue leyendo, y solo después en producción.
- [ ] **Step 3: Declarar las columnas en `schema.prisma`** con su comentario de tres estados: `null` = «no se guardó documento» (una póliza añadida a mano no tiene), que NO es «se perdió».
- [ ] **Step 4: `prisma generate` + typecheck.**
- [ ] **Step 5: Commit.**

---

### Task 4: guardar al subir

**Files:**
- Modify: `apps/asegura-portal/app/api/polizas/route.ts` (línea ~96, donde ya se escribe `documentoNombre`)

- [ ] **Step 1:** tras la extracción, subir con `subirObjeto`. **Si la subida falla, la póliza se guarda igual** y `documentoRuta` queda a `null`: perder el documento no puede perder la ficha.
- [ ] **Step 2:** guardar `documentoRuta`, `documentoMime`, `documentoBytes`.
- [ ] **Step 3:** typecheck + tests.
- [ ] **Step 4: Commit.**

---

### Task 5: servirlo solo a quien puede verlo

**Files:**
- Create: `apps/asegura-portal/app/api/polizas/[id]/documento/route.ts`

🚨 **La comprobación es por sesión, no por el id de la URL.** El `id` viene de fuera: se busca la declarada `where { id, identidadId: identidad.id }`. Si no aparece, **404** — nunca 403: un 403 confirma que ese id existe y convierte la ruta en un oráculo.

- [ ] **Step 1: Test del cepo** (lee el fuente): que la consulta lleve `identidadId` y que la respuesta de «no es tuya» sea 404.
- [ ] **Step 2:** implementar: resolver sesión → buscar → `signStorageObject` con `expiresIn: 60` → `redirect`.
- [ ] **Step 3:** `Content-Disposition: attachment` y el mime guardado, **no** el que diga el navegador.
- [ ] **Step 4: Commit.**

---

### Task 6: el enlace en la bóveda

**Files:**
- Modify: `apps/asegura-portal/app/(portal)/boveda/FilaDeclarada.tsx`

- [ ] **Step 1:** enlace «Ver el documento» **solo** si `documentoRuta !== null`.
- [ ] **Step 2:** cuando es `null` en una póliza que SÍ vino de un PDF (`documentoNombre !== null`), decirlo: «el documento no se guardó». Los tres estados otra vez — callarlo sería hacer pasar «se perdió» por «la añadiste a mano».
- [ ] **Step 3:** responsive ≥320 px y `pnpm test` en verde.
- [ ] **Step 4: Commit y PR.**

---

## Lo que este plan NO hace

- **No migra hacia atrás.** Las pólizas ya subidas no tienen documento y no lo van a tener: el PDF no se guardó nunca. `documentoRuta` a `null` con `documentoNombre` relleno es exactamente ese caso, y la pantalla lo dice.
- **No borra.** El art. 17 se atiende hoy por `TusDatos`; añadir el borrado del objeto al flujo de supresión es un plan aparte y hay que escribirlo antes de que haya volumen.
