# @iarest/core-storage

Núcleo de **Storage** compartido de la casa de marcas. Firma objetos de un
bucket **privado** del Storage de Supabase vía su API REST (`/storage/v1/object/sign`)
con la **anon key** (basta si tiene policy SELECT; sin `service_role`, sin
`@supabase/supabase-js`). Es **puro** (`fetch`) e identity-agnostic: el bucket, el
path y la política de fallback los pone cada vertical.

```ts
import { storageObjectPath, signStorageObject, publicStorageUrl } from '@iarest/core-storage'

const cfg = { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! }
const path = storageObjectPath(publicOrRawUrl, 'cleaning-photos')
const signed = path ? await signStorageObject(cfg, 'cleaning-photos', path) : null
// si signed === null → fallback a publicStorageUrl(cfg, 'cleaning-photos', path)
```

Consumido por `apps/ialimp` (`lib/cleaning-photos.ts` → `/api/l/photo`, IA de fotos)
y `apps/sivra` (`/api/limpiadoras/photo`), que firmaban el mismo bucket
`cleaning-photos` con código idéntico.
