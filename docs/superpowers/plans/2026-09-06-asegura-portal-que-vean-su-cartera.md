# Que vean su cartera — Plan de implementación (entrega 1 de 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Alberto sepa, de un vistazo y sobre la cartera entera, quién NO verá sus pólizas al entrar al portal, y que el portal deje de decirle a esa gente «no hemos encontrado ninguna póliza a tu nombre» cuando sí las hay.

**Architecture:** Tres capas, ninguna nueva. (1) Una regla PURA en `@central/module-seguros-portal` que, dada la lista de fichas que casan con un correo, dice si ese correo lleva a ESTA ficha — extraída de la que ya usa `apps/asegura/lib/invitacion-portal.ts` para no tener dos. (2) `apps/asegura` la aplica en LOTE dentro de `clientesSinCanal()` y publica el estado por el puerto que ya existe; el hash NUNCA cruza. (3) El portal persiste el resultado del último intento de vínculo en una columna nueva de `portal_identidad` y `/boveda` lo lee para tener tres textos donde hoy tiene uno.

**Tech Stack:** TypeScript, Next.js 15 (App Router), Prisma 5 multiSchema, Postgres (Supabase compartida, schema `seguros`), `node --test` para los cepos.

---

## Contexto medido — léelo antes de tocar nada

Medido contra la BD real el **06/09/2026** (80 titulares con póliza viva):

| Estado | Titulares |
|---|---|
| Entra y ve su cartera | **46** (45 por su correo principal + 1 por uno de contacto) |
| `sin_email` — no hay ningún correo suyo | **29** |
| `resuelve_a_otra` — su correo es de OTRA ficha | **5** |
| `ambiguo` — dos fichas lo declaran suyo | **0** |

🚨 **El spec dice «5 ambiguos» y es FALSO.** Son 5 `resuelve_a_otra`. La SQL del spec agrupaba «tiene correo pero no le identifica» en un solo saco, y eso tapa dos diagnósticos con arreglos distintos: resolver un duplicado no es lo mismo que conseguirle su dirección. `invitacion-portal.ts` ya los distinguía. **La cifra de aceptación de este plan es 46 / 29 / 5 / 0**, con esas cuatro etiquetas.

⚠️ **Cabo suelto, no resuelto y no hace falta resolverlo para entregar:** la cabecera de `apps/asegura/lib/invitacion-portal.ts` dice «51 invitables» el 05/09 y hoy salen 46. No se ha reproducido su 51. Puede ser que el dato se moviera, o que `estadoEmailDeFicha()` lea alguna fuente de correo sin hash escrito. **No copies ese 51 a ningún sitio** y, si al final del plan te sigue saliendo 46, actualiza esa cabecera con la cifra medida y la fecha.

### Lo que YA existe y NO hay que construir

| Parecía trabajo | Ya está | Dónde |
|---|---|---|
| Subir `elegirFicha()` al paquete compartido (§4.1 del spec) | **Hecho el 05/09** | `packages/module-seguros-portal/src/vinculo-elegir.ts`, exportado por el barril (`src/index.ts:220-221`) |
| Predecir si un cliente podrá entrar | **Hecho, con 7 estados** (mejores que los 4 del spec) | `estadoPortalDeFicha()` en `apps/asegura/lib/invitacion-portal.ts` |
| Pantalla de contactabilidad con 4 fuentes y doctrina de `null` | **Hecha** | `clientes-sin-canal.ts` → `/api/operador/sin-canal` → `correduria-puerto.ts` → `SinCanal.tsx` |
| Recalcular el índice ciego al añadir un correo | **Hecho en cada escritura** | `apps/asegura/lib/cartera-edicion.ts` |

**El hueco real que queda:** `estadoPortalDeFicha()` responde por UNA ficha, desde la pantalla de esa ficha. Para saber quiénes son los 34 hay que abrir 80 fichas de una en una. Y el portal, cuando la bóveda sale vacía, dice lo mismo a un desconocido que a un cliente cuyo correo sí encontramos.

### Desviación deliberada del spec

El spec pide que `apps/asegura-portal/lib/vinculo-elegir.ts` **desaparezca**. **No se borra.** Es un shim de 15 líneas que re-exporta del paquete, o sea hay UNA sola implementación y cero riesgo de divergencia — que es lo que el spec quería evitar. Borrarlo obliga a tocar 4 ficheros (`lib/vinculo.ts`, `lib/invitaciones.ts`, `lib/peticiones.ts`, `lib/vinculo.test.ts`) sin ganar nada. Lo que **sí** se arregla es que su cepo viva en la app: una regla pura del paquete cuyo único test corre desde otra app no está cubierta por la suite del paquete (Tarea 1).

---

## Estructura de ficheros

**Crear**
- `packages/module-seguros-portal/src/vinculo-elegir.test.ts` — el cepo de `elegirFicha`, mudado desde la app, más los casos nuevos de `prediccionDeVinculo`.
- `apps/asegura-portal/prisma/sql/2026-09-06_portal_identidad_ultimo_vinculo.sql` — la columna donde sobrevive el resultado del vínculo.
- `test/regression-portal-vinculo-visible.test.ts` — cepos nuevos de esta entrega.

**Modificar**
- `packages/module-seguros-portal/src/vinculo-elegir.ts` — añade `prediccionDeVinculo()` (pura).
- `packages/module-seguros-portal/src/index.ts` — la exporta.
- `apps/asegura/lib/invitacion-portal.ts` — usa la función del paquete en vez de su lógica inline.
- `apps/asegura/lib/clientes-sin-canal.ts` — trae los hashes, deriva `portal` por fila y `noVenSuCartera` en el resumen.
- `apps/plataforma/lib/correduria-puerto.ts` — tipo + interpretación tri-estado del campo nuevo.
- `apps/plataforma/app/(usuario)/correduria/SinCanal.tsx` — segunda cifra en el titular y estado por fila.
- `apps/asegura-portal/prisma/schema.prisma` — la columna nueva.
- `apps/asegura-portal/lib/vinculo.ts` — sella el resultado en esa columna.
- `apps/asegura-portal/lib/cartera-lectura.ts` — `CarteraPortal.vinculo`.
- `apps/asegura-portal/app/(portal)/boveda/page.tsx` — tres textos donde hay uno.

**Borrar**
- `apps/asegura-portal/lib/vinculo.test.ts` — se muda al paquete (Tarea 1).

---

### Task 1: El cepo de `elegirFicha` se muda al paquete

**Files:**
- Create: `packages/module-seguros-portal/src/vinculo-elegir.test.ts`
- Delete: `apps/asegura-portal/lib/vinculo.test.ts`

- [ ] **Step 1: Comprobar dónde corre hoy ese test**

```bash
cd /home/user/central
grep -rn "vinculo.test" package.json apps/asegura-portal/package.json packages/module-seguros-portal/package.json
```

Esperado: el test del paquete se recoge por patrón (`src/*.test.ts`), y el de la app por el suyo. Anota cuál es el patrón del paquete: el fichero nuevo tiene que casar con él.

- [ ] **Step 2: Mover el fichero con git, sin editarlo**

```bash
cd /home/user/central
git mv apps/asegura-portal/lib/vinculo.test.ts packages/module-seguros-portal/src/vinculo-elegir.test.ts
```

- [ ] **Step 3: Arreglar el import y el comentario que ya no es cierto**

En `packages/module-seguros-portal/src/vinculo-elegir.test.ts`, sustituir el bloque de las líneas 24-28 (el comentario más el `import`) por:

```ts
// Se importa el fichero PURO. Vivía en `apps/asegura-portal/lib/vinculo.test.ts`
// y se mudó aquí el 06/09/2026: la regla subió al paquete el 05/09 y su único
// cepo se quedó en la app, así que la suite del paquete NO la cubría. Una regla
// compartida cuyo test corre desde una sola de las apps que la usan es una regla
// que se rompe para la otra sin que falle nada.
import { elegirFicha, type Candidato } from './vinculo-elegir.ts'
```

- [ ] **Step 4: Correr los tests del paquete y ver los 10 casos**

```bash
cd /home/user/central
npx --yes pnpm@10.33.0 --filter @central/module-seguros-portal test
```

Esperado: PASS, y entre los nombres aparecen `una sola ficha por su email principal vincula` y `DOS fichas declaran el mismo email como SUYO: eso no se adivina nunca → ambiguo`.

- [ ] **Step 5: Comprobar que no queda nadie apuntando al fichero borrado**

```bash
cd /home/user/central
grep -rn "lib/vinculo.test" apps/ packages/ test/ --include=*.ts --include=*.tsx --include=*.json | grep -v node_modules
```

Esperado: sin resultados.

- [ ] **Step 6: Commit**

```bash
cd /home/user/central
git add packages/module-seguros-portal/src/vinculo-elegir.test.ts apps/asegura-portal/lib/vinculo.test.ts
git commit -m "test(module-seguros-portal): el cepo de elegirFicha se muda al paquete

La regla subió al paquete el 05/09 y su unico cepo se quedo en
apps/asegura-portal, asi que la suite del paquete no la cubria. Una regla
compartida cuyo test corre desde una sola de las apps que la usan es una
regla que se rompe para la otra sin que falle nada."
```

---

### Task 2: `prediccionDeVinculo()` — la regla pura, extraída de donde ya vivía

**Files:**
- Modify: `packages/module-seguros-portal/src/vinculo-elegir.ts`
- Modify: `packages/module-seguros-portal/src/index.ts:220-221`
- Test: `packages/module-seguros-portal/src/vinculo-elegir.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `packages/module-seguros-portal/src/vinculo-elegir.test.ts`:

```ts
// ─── prediccionDeVinculo ────────────────────────────────────────────────────
// La pregunta de la pantalla del corredor: «¿este correo llevará a ESTA ficha?».
// Es `elegirFicha` más la comparación con el dueño, y está aquí y no en
// `apps/asegura` porque la contestan ya DOS sitios (la ficha del cliente y la
// lista de contactabilidad) y una segunda copia divergiría en silencio: una
// diría «invitable» y la otra «ambiguo» sobre el mismo cliente, las dos con 200.
import { prediccionDeVinculo } from './vinculo-elegir.ts'

test('prediccion: el correo es suyo y de nadie más → invitable', () => {
  assert.equal(prediccionDeVinculo([principal('c-alberto')], 'c-alberto'), 'invitable')
})

test('prediccion: dos fichas lo declaran suyo → ambiguo, y NO «resuelve a otra»', () => {
  // Son dos arreglos distintos: aquí hay un duplicado que resolver; en
  // `resuelve_a_otra` lo que falta es la direccion propia de este cliente.
  assert.equal(prediccionDeVinculo([principal('c-uno'), principal('c-dos')], 'c-uno'), 'ambiguo')
})

test('prediccion: el correo es principal de OTRA ficha → resuelve_a_otra', () => {
  assert.equal(prediccionDeVinculo([principal('c-otro')], 'c-alberto'), 'resuelve_a_otra')
})

test('🚨 prediccion: sin ninguna ficha que case, NO es invitable', () => {
  // `sin_ficha` con un correo que sale de la propia ficha significa que su hash
  // no esta escrito: el portal no la encontraria. Para el cliente el efecto es
  // el mismo que resolver a otra —entra y no ve nada—, y lo que NO puede pasar
  // es que salga «invitable», que es una promesa.
  assert.equal(prediccionDeVinculo([], 'c-alberto'), 'resuelve_a_otra')
})

test('prediccion: gana el principal aunque haya secundarios ajenos (caso real 03/09)', () => {
  const candidatos = [principal('c-alberto'), secundario('c-tercero-1'), secundario('c-tercero-2')]
  assert.equal(prediccionDeVinculo(candidatos, 'c-alberto'), 'invitable')
  // Y para los terceros, ese mismo correo NO les identifica.
  assert.equal(prediccionDeVinculo(candidatos, 'c-tercero-1'), 'resuelve_a_otra')
})
```

- [ ] **Step 2: Correr y ver que falla**

```bash
cd /home/user/central
npx --yes pnpm@10.33.0 --filter @central/module-seguros-portal test
```

Esperado: FAIL con `The requested module './vinculo-elegir.ts' does not provide an export named 'prediccionDeVinculo'`.

- [ ] **Step 3: Implementarla**

Añadir al final de `packages/module-seguros-portal/src/vinculo-elegir.ts`:

```ts
/** Lo que le pasaría a ESTA ficha si alguien entrase al portal con ese correo. */
export type PrediccionVinculo = 'invitable' | 'ambiguo' | 'resuelve_a_otra'

/**
 * ¿Ese correo llevaría al portal a la ficha `clienteId`?
 *
 * Es `elegirFicha` más la comparación con el dueño, y vive aquí porque la
 * preguntan DOS pantallas del corredor: la ficha de un cliente
 * (`estadoPortalDeFicha`) y la lista de contactabilidad (`clientesSinCanal`).
 * Con una copia en cada sitio, las dos devolverían 200 y se separarían en
 * silencio: una diría «invitable» y la otra «ambiguo» del mismo cliente.
 *
 * 🚨 Los tres resultados NO se colapsan en «no se puede invitar», porque cada
 * uno se arregla en un sitio distinto: `ambiguo` es un duplicado que resolver,
 * `resuelve_a_otra` es que a este cliente le falta SU dirección, e `invitable`
 * no pide nada. Y `sin_ficha` cae en `resuelve_a_otra` a propósito: con un
 * correo que sale de la propia ficha significa que su hash no está escrito, o
 * sea que el portal no la encontraría — el efecto para el cliente es el mismo
 * y lo que no puede salir nunca es «invitable», que es una promesa.
 */
export function prediccionDeVinculo(
  candidatos: readonly Candidato[],
  clienteId: string,
): PrediccionVinculo {
  const elegida = elegirFicha(candidatos)
  if (elegida.estado === 'ambiguo') return 'ambiguo'
  if (elegida.estado === 'sin_ficha') return 'resuelve_a_otra'
  return elegida.clienteId === clienteId ? 'invitable' : 'resuelve_a_otra'
}
```

- [ ] **Step 4: Exportarla por el barril**

En `packages/module-seguros-portal/src/index.ts`, sustituir las líneas 220-221 por:

```ts
export { elegirFicha, prediccionDeVinculo } from './vinculo-elegir.ts'
export type { Candidato, FichaElegida, PrediccionVinculo } from './vinculo-elegir.ts'
```

- [ ] **Step 5: Correr y ver que pasa**

```bash
cd /home/user/central
npx --yes pnpm@10.33.0 --filter @central/module-seguros-portal test
```

Esperado: PASS, 15 tests (los 10 de `elegirFicha` + los 5 nuevos).

- [ ] **Step 6: Commit**

```bash
cd /home/user/central
git add packages/module-seguros-portal/src/vinculo-elegir.ts packages/module-seguros-portal/src/index.ts packages/module-seguros-portal/src/vinculo-elegir.test.ts
git commit -m "feat(module-seguros-portal): prediccionDeVinculo, la regla que dos pantallas preguntan

Extrae de invitacion-portal.ts la pregunta «este correo lleva a ESTA
ficha». La preguntan ya dos sitios del panel del corredor; con una copia
en cada uno se separarian en silencio, las dos devolviendo 200."
```

---

### Task 3: `invitacion-portal.ts` usa la del paquete (sin cambiar comportamiento)

**Files:**
- Modify: `apps/asegura/lib/invitacion-portal.ts`

- [ ] **Step 1: Cambiar el import**

Sustituir la línea de import del paquete por:

```ts
import { prediccionDeVinculo, type Candidato } from '@central/module-seguros-portal'
```

(`elegirFicha` deja de usarse en este fichero.)

- [ ] **Step 2: Sustituir el final de `prediccionVinculo()`**

Reemplazar las cuatro últimas líneas del cuerpo de `prediccionVinculo` (desde `const elegida = elegirFicha(candidatos)` hasta el `return` final) por:

```ts
  // La decisión vive en `@central/module-seguros-portal` y la comparte con la
  // lista de contactabilidad: dos copias de esta regla darían dos respuestas
  // distintas sobre el mismo cliente sin que fallara nada.
  return prediccionDeVinculo(candidatos, clienteId)
```

- [ ] **Step 3: Comprobar que ya no queda lógica duplicada**

```bash
cd /home/user/central
grep -n "elegirFicha" apps/asegura/lib/invitacion-portal.ts
```

Esperado: sin resultados.

- [ ] **Step 4: Typecheck de asegura**

```bash
cd /home/user/central/apps/asegura
npx --yes pnpm@10.33.0 exec prisma generate && npx --yes pnpm@10.33.0 exec prisma generate --schema prisma/asegura.prisma && npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json
```

Esperado: sin errores. (Los DOS `prisma generate` son obligatorios en esta app: sin el segundo sale `TS2307: Cannot find module './generated/asegura-client'` en local con el CI en verde.)

- [ ] **Step 5: Commit**

```bash
cd /home/user/central
git add apps/asegura/lib/invitacion-portal.ts
git commit -m "refactor(asegura): la prediccion del vinculo sale del paquete compartido

Mismo comportamiento: la logica que estaba inline es ahora
prediccionDeVinculo de @central/module-seguros-portal, para que la lista
de contactabilidad pregunte exactamente lo mismo que la ficha."
```

---

### Task 4: `clientesSinCanal()` responde también «¿verá su cartera?»

**Files:**
- Modify: `apps/asegura/lib/clientes-sin-canal.ts`

- [ ] **Step 1: Añadir el tipo del estado y el campo a la fila**

Después de la union `EstadoCanal` (sobre la línea 137), añadir:

```ts
/**
 * ¿Este cliente verá su cartera al entrar al portal? Es una pregunta DISTINTA
 * de `EstadoCanal`, que responde si se le puede escribir.
 *
 * 🚨 Los dos ejemplos que obligaron a separarlas, los dos reales en esta
 * cartera: alguien con teléfono y sin correo sale «Solo teléfono» —cierto— y
 * verá una bóveda vacía; y alguien cuyo correo es el principal de OTRA ficha
 * sale «Localizable» —perfectamente cierto para escribirle— y no se vinculará
 * jamás. `contactoEfectivo()` no tiene ningún concepto de unicidad y no debe
 * tenerlo: dice de dónde sale el contacto, no a quién identifica.
 *
 * `null` no está en esta union: se representa fuera, en el campo, y significa
 * «no se ha podido mirar» (lista truncada o consulta caída). Nunca «puede».
 */
export type EstadoPortalCliente = 'puede_entrar' | 'sin_email' | 'ambiguo' | 'resuelve_a_otra'
```

Y dentro de `ClienteCanal`, justo antes de `estado: EstadoCanal`:

```ts
  /**
   * Si entrará y verá su cartera. `null` = **no se ha podido comprobar**
   * (lista truncada, o la consulta de hashes falló): jamás se colapsa a
   * `puede_entrar`, que sería prometer que la invitación va a funcionar sin
   * haberlo mirado.
   */
  portal: EstadoPortalCliente | null
```

- [ ] **Step 2: Añadir el recuento al resumen**

Dentro de `ClientesSinCanal['resumen']`, después de `ilocalizablesSinRenovacion`:

```ts
    /**
     * 🚨 La segunda cifra de la pantalla: cuántos entrarían al portal y NO
     * verían sus pólizas. `null` = no comprobado. Se cuenta sobre TODOS los
     * clientes vivos, no sobre `filas`: alguien con email y teléfono es
     * `con_ambos` y hoy no sale en la lista, y aun así su correo puede llevar
     * a otra ficha.
     */
    noVenSuCartera: number | null
```

- [ ] **Step 3: Añadir los hashes a la consulta**

En el `select` final de la SQL (después de `b.tiene_telefono,`), añadir:

```sql
      coalesce(hs.email_hashes, '[]'::jsonb) as email_hashes,
```

Y antes de `order by b.nombre`, añadir este `left join lateral`:

```sql
    -- Los hashes del índice ciego de ESTE cliente, con su procedencia. Es lo
    -- único que hace falta para saber si su correo le identifica; el correo en
    -- claro no se lee aquí y NO sale de esta función.
    left join lateral (
      select jsonb_agg(jsonb_build_object('hash', z.h, 'principal', z.principal)) as email_hashes
      from (
        select b_h.h, bool_or(b_h.principal) as principal
        from (
          select c2.email_lookup_hash as h, true as principal
          from clientes c2 where c2.id = b.id and c2.email_lookup_hash is not null
          union all
          select e.email_lookup_hash, false
          from cliente_emails e where e.cliente_id = b.id and e.email_lookup_hash is not null
        ) b_h
        group by b_h.h
      ) z
    ) hs on true
```

Añadir a `FilaSql`, después de `tiene_telefono: boolean`:

```ts
  email_hashes: unknown
```

- [ ] **Step 4: Escribir la derivación en lote**

Añadir estas dos funciones al fichero, antes de `clientesSinCanal`:

```ts
/** Los hashes que trae una fila, ya deduplicados por la SQL. */
function hashesDeFila(v: unknown): { hash: string; principal: boolean }[] {
  if (!Array.isArray(v)) return []
  const out: { hash: string; principal: boolean }[] = []
  for (const x of v) {
    if (typeof x !== 'object' || x === null) continue
    const o = x as Record<string, unknown>
    if (typeof o.hash === 'string' && o.hash !== '' && typeof o.principal === 'boolean') {
      out.push({ hash: o.hash, principal: o.principal })
    }
  }
  return out
}

/**
 * De todos los correos conocidos de un cliente, ¿alguno le lleva a SU ficha?
 *
 * 🚨 Lectura OPTIMISTA a propósito: basta con que UNO le identifique. Es la
 * pregunta de esta pantalla —«¿hay forma de que este cliente entre y vea lo
 * suyo?»— y por eso puede diferir de `estadoPortalDeFicha()`, que evalúa la
 * ÚNICA dirección a la que escribiríamos. Por eso cada fila enlaza a su ficha:
 * la respuesta por dirección concreta vive allí, no aquí. Colapsar las dos
 * preguntas en una haría que la lista prometiera lo que el botón de invitar no
 * puede cumplir.
 *
 * El orden de los desenlaces importa: `ambiguo` gana a `resuelve_a_otra` porque
 * es el que Alberto puede arreglar sin llamar a nadie.
 */
function estadoPortalDeCliente(
  clienteId: string,
  hashes: readonly { hash: string; principal: boolean }[],
  porHash: Map<string, Candidato[]>,
): EstadoPortalCliente {
  if (hashes.length === 0) return 'sin_email'
  let hayAmbiguo = false
  for (const h of hashes) {
    const p = prediccionDeVinculo(porHash.get(h.hash) ?? [], clienteId)
    if (p === 'invitable') return 'puede_entrar'
    if (p === 'ambiguo') hayAmbiguo = true
  }
  return hayAmbiguo ? 'ambiguo' : 'resuelve_a_otra'
}
```

Y añadir arriba el import:

```ts
import { prediccionDeVinculo, type Candidato } from '@central/module-seguros-portal'
```

- [ ] **Step 5: Cablearlo en `clientesSinCanal()`**

Después de calcular `leidas` (línea ~525) y antes de construir `todos`, insertar:

```ts
  // Quién MÁS reclama esos hashes. Va en UNA consulta para toda la lista: por
  // cliente serían 80 idas y vueltas para responder una pregunta que se
  // contesta con un solo barrido.
  //
  // ⚠️ Se busca en TODA la base, no solo en esta correduría, por lo mismo que
  // lo hace el portal: si el mismo correo vive en otra ficha, el empate existe
  // igual y no verlo sería predecir mejor de lo que la realidad va a ser.
  const hashesPorFila = new Map(leidas.map((f) => [f.cliente_id, hashesDeFila(f.email_hashes)]))
  const todosLosHashes = [...new Set([...hashesPorFila.values()].flat().map((h) => h.hash))]

  let porHash: Map<string, Candidato[]> | null = new Map()
  if (todosLosHashes.length > 0) {
    try {
      const duenos = await db.$queryRaw<{ hash: string; cliente_id: string; principal: boolean }[]>`
        select h as hash, cliente_id::text as cliente_id, bool_or(principal) as principal
        from (
          select c.email_lookup_hash as h, c.id as cliente_id, true as principal
          from clientes c
          where c.email_lookup_hash = any(${todosLosHashes}) and c.merged_into_cliente_id is null
          union all
          select e.email_lookup_hash, e.cliente_id, false
          from cliente_emails e
          join clientes c2 on c2.id = e.cliente_id and c2.merged_into_cliente_id is null
          where e.email_lookup_hash = any(${todosLosHashes})
        ) t
        group by h, cliente_id`
      const acc = new Map<string, Candidato[]>()
      for (const d of duenos) {
        const lista = acc.get(d.hash) ?? []
        lista.push({ clienteId: d.cliente_id, correduriaId, principal: d.principal })
        acc.set(d.hash, lista)
      }
      porHash = acc
    } catch (e) {
      // `null` = no se ha podido mirar. Con un Map vacío, TODOS saldrían
      // `resuelve_a_otra`: una alarma inventada sobre datos que no se leyeron.
      console.error('[sin-canal] no se pudieron leer los duenos de los hashes:', e instanceof Error ? e.message : e)
      porHash = null
    }
  }
```

Dentro del `map` que construye cada `ClienteCanal`, añadir el campo:

```ts
    // Truncada la lista, el estado del portal tampoco se afirma: se calcularía
    // sobre un universo de fichas incompleto y podría decir «puede entrar» de
    // alguien cuyo homónimo se quedó fuera del corte.
    portal: truncado || porHash === null
      ? null
      : estadoPortalDeCliente(f.cliente_id, hashesPorFila.get(f.cliente_id) ?? [], porHash),
```

- [ ] **Step 6: Contar el resumen y ensanchar `filas`**

En la rama NO truncada del `resumen`, añadir:

```ts
        noVenSuCartera: todos.filter((c) => c.portal !== null && c.portal !== 'puede_entrar').length,
```

En la rama truncada y en el `vacio` de `!aseguraConfigurada()`, añadir `noVenSuCartera: null`.

Y cambiar el `return` final:

```ts
  return {
    // 🚨 La lista ya no es solo «le falta un canal»: también entra quien NO
    // verá su cartera aunque tenga correo Y teléfono. Sin esto, el titular
    // diría «5 no verán sus pólizas» y abajo no habría ni una fila que abrir.
    filas: ordenarPorUrgencia(
      todos.filter((c) => c.estado !== 'con_ambos' || (c.portal !== null && c.portal !== 'puede_entrar')),
    ),
    resumen,
    truncado,
  }
```

- [ ] **Step 7: Typecheck**

```bash
cd /home/user/central/apps/asegura
npx --yes pnpm@10.33.0 exec prisma generate && npx --yes pnpm@10.33.0 exec prisma generate --schema prisma/asegura.prisma && npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json
```

Esperado: sin errores.

- [ ] **Step 8: Comprobar que el hash NO sale de la función**

```bash
cd /home/user/central
grep -n "email_hashes\|emailHashes\|hash" apps/asegura/lib/clientes-sin-canal.ts | grep -v "^.*://" | grep -i "return\|ClienteCanal\|filas.push"
```

Esperado: sin resultados — el hash se usa dentro y no viaja en ningún tipo de salida.

- [ ] **Step 9: Commit**

```bash
cd /home/user/central
git add apps/asegura/lib/clientes-sin-canal.ts
git commit -m "feat(asegura): la lista de contactabilidad dice quien NO vera su cartera

La pantalla sabia si a un cliente se le puede escribir; no sabia si podra
entrar al portal y ver sus polizas. Son preguntas distintas: alguien con
correo y telefono sale «Localizable» y, si ese correo es el principal de
otra ficha, no se vinculara jamas.

El estado se deriva con prediccionDeVinculo del paquete —la misma que usa
la ficha del cliente— sobre una consulta en lote de los hashes. El hash no
sale de la funcion. Lista truncada o consulta caida ⇒ null, nunca
«puede_entrar»."
```

---

### Task 5: El puerto lleva el estado (y NUNCA el hash)

**Files:**
- Modify: `apps/plataforma/lib/correduria-puerto.ts:505-728`
- Test: `test/regression-clientes-sin-canal.test.ts`

- [ ] **Step 1: Escribir los cepos que fallan**

Añadir al final de `test/regression-clientes-sin-canal.test.ts`:

```ts
test('🚨 el estado del portal ausente es null, JAMAS «puede_entrar»', () => {
  const r = interpretarSinCanal(200, {
    estado: 'ok',
    filas: [{ clienteId: 'c1', nombre: 'Jose Suarez Salas' }],
    resumen: {},
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.filas[0].portal, null, 'un asegura sin desplegar no dice que el cliente entra')
  assert.equal(r.resumen.noVenSuCartera, null)
})

test('🚨 un estado de portal desconocido no se cuela como bueno', () => {
  const r = interpretarSinCanal(200, {
    estado: 'ok',
    filas: [{ clienteId: 'c1', nombre: 'X', portal: 'lo_que_sea' }],
    resumen: {},
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.filas[0].portal, null)
})

test('los cuatro estados del portal viajan tal cual', () => {
  for (const e of ['puede_entrar', 'sin_email', 'ambiguo', 'resuelve_a_otra']) {
    const r = interpretarSinCanal(200, {
      estado: 'ok',
      filas: [{ clienteId: 'c1', nombre: 'X', portal: e }],
      resumen: {},
    })
    assert.equal(r.estado, 'ok')
    if (r.estado !== 'ok') return
    assert.equal(r.filas[0].portal, e)
  }
})

test('🚨 el hash del indice ciego NO cruza el puerto ni se pinta', () => {
  // Es un dato derivado de un dato personal. Por el puerto viaja el ESTADO.
  const SIN_CANAL_ASEGURA = readFileSync(`${RAIZ}apps/asegura/lib/clientes-sin-canal.ts`, 'utf8')
  assert.doesNotMatch(PUERTO, /lookup_hash|lookupHash/, 'el puerto no conoce hashes')
  assert.doesNotMatch(PANTALLA, /lookup_hash|lookupHash/, 'la pantalla no conoce hashes')
  // Y en asegura el hash se usa, pero no se declara en el tipo de salida.
  const tipoFila = SIN_CANAL_ASEGURA.slice(
    SIN_CANAL_ASEGURA.indexOf('export type ClienteCanal'),
    SIN_CANAL_ASEGURA.indexOf('export type ClientesSinCanal'),
  )
  assert.doesNotMatch(tipoFila, /hash/i, 'ClienteCanal no puede llevar ningun hash')
})

test('🚨 «no ven su cartera» se cuenta sobre TODOS, no sobre las filas visibles', () => {
  // Alguien con correo Y telefono es `con_ambos` y no salia en la lista; su
  // correo puede llevar igualmente a otra ficha. Contarlo solo sobre `filas`
  // daria una cifra mas baja que la realidad, que es la mentira tranquilizadora.
  const SIN_CANAL_ASEGURA = readFileSync(`${RAIZ}apps/asegura/lib/clientes-sin-canal.ts`, 'utf8')
  assert.match(SIN_CANAL_ASEGURA, /noVenSuCartera:\s*todos\.filter/)
  assert.doesNotMatch(SIN_CANAL_ASEGURA, /noVenSuCartera:\s*filas\.filter/)
})
```

- [ ] **Step 2: Correr y ver que falla**

```bash
cd /home/user/central
node --test test/regression-clientes-sin-canal.test.ts
```

Esperado: FAIL, 5 tests nuevos en rojo (`portal` no existe en el tipo).

- [ ] **Step 3: Añadir el tipo y la lectura en el puerto**

En `apps/plataforma/lib/correduria-puerto.ts`, después de la union `EstadoCanal` (línea ~512):

```ts
/**
 * Si el cliente verá su cartera al entrar al portal. Distinto de `EstadoCanal`,
 * que dice si se le puede escribir: un «Localizable» cuyo correo es el
 * principal de otra ficha no se vincula jamás.
 */
export type EstadoPortalCliente = 'puede_entrar' | 'sin_email' | 'ambiguo' | 'resuelve_a_otra'

const ESTADOS_PORTAL: readonly string[] = ['puede_entrar', 'sin_email', 'ambiguo', 'resuelve_a_otra']

/**
 * 🚨 Un valor que no reconocemos es `null` («no comprobado»), no un estado por
 * defecto. Un asegura más nuevo que esta pantalla mandaría una etiqueta que
 * aquí no existe, y elegir la optimista diría que el cliente entra sin que
 * nadie lo haya mirado.
 */
function estadoPortal(v: unknown): EstadoPortalCliente | null {
  return typeof v === 'string' && ESTADOS_PORTAL.includes(v) ? (v as EstadoPortalCliente) : null
}
```

En `ClienteCanal`, antes de `estado: EstadoCanal`:

```ts
  /** `null` = asegura no lo informó o no se pudo comprobar. NO es «puede entrar». */
  portal: EstadoPortalCliente | null
```

En el resumen del tipo `SinCanal`, después de `ilocalizablesSinRenovacion`:

```ts
        /** Cuántos entrarían y no verían sus pólizas. `null` = no comprobado. */
        noVenSuCartera: number | null
```

- [ ] **Step 4: Cablear en `interpretarSinCanal()`**

En el `filas.push({...})`, añadir antes de `estado: derivarEstadoCanal(...)`:

```ts
      portal: estadoPortal(o.portal),
```

En el `resumen` del return, después de `ilocalizablesSinRenovacion`:

```ts
      noVenSuCartera: entero(res.noVenSuCartera),
```

- [ ] **Step 5: Correr y ver que pasa**

```bash
cd /home/user/central
node --test test/regression-clientes-sin-canal.test.ts
```

Esperado: PASS, 41 tests (los 36 de antes + 5).

- [ ] **Step 6: Ver morder el cepo (mutación)**

Cambiar temporalmente `estadoPortal` para que devuelva `'puede_entrar'` ante lo desconocido:

```ts
  return typeof v === 'string' && ESTADOS_PORTAL.includes(v) ? (v as EstadoPortalCliente) : 'puede_entrar'
```

```bash
cd /home/user/central
node --test test/regression-clientes-sin-canal.test.ts 2>&1 | grep -E "^# (pass|fail)"
```

Esperado: `# fail 2` (los dos primeros cepos nuevos). **Deshacer la mutación** y volver a correr: `# fail 0`.

- [ ] **Step 7: Commit**

```bash
cd /home/user/central
git add apps/plataforma/lib/correduria-puerto.ts test/regression-clientes-sin-canal.test.ts
git commit -m "feat(plataforma): el puerto trae si el cliente vera su cartera

Solo el ESTADO: el hash del indice ciego es un dato derivado de un dato
personal y no cruza, igual que el DNI. Un valor desconocido cae a null, no
al optimista: un asegura mas nuevo que esta pantalla diria que el cliente
entra sin que nadie lo haya mirado.

Cinco cepos, dos vistos morder."
```

---

### Task 6: La pantalla lo dice — segunda cifra y estado por fila

**Files:**
- Modify: `apps/plataforma/app/(usuario)/correduria/SinCanal.tsx`
- Test: `test/regression-clientes-sin-canal.test.ts`

- [ ] **Step 1: Escribir los cepos que fallan**

Añadir a `test/regression-clientes-sin-canal.test.ts`:

```ts
test('🚨 la pantalla dice cuantos NO veran su cartera, y no lo confunde con «sin canal»', () => {
  assert.match(PANTALLA, /noVenSuCartera/)
  assert.match(PANTALLA, /no ver/i)
  // Y no lo rellena con un cero cuando no se ha medido.
  assert.doesNotMatch(PANTALLA, /noVenSuCartera\s*\?\?\s*0/)
  assert.doesNotMatch(PANTALLA, /noVenSuCartera\s*\|\|\s*0/)
})

test('🚨 la pantalla distingue los cuatro estados del portal, sin colapsarlos', () => {
  for (const e of ['puede_entrar', 'sin_email', 'ambiguo', 'resuelve_a_otra']) {
    assert.match(PANTALLA, new RegExp(e), `falta el estado ${e} en la UI`)
  }
  // «Ambiguo» y «resuelve a otra» se arreglan de forma distinta: uno resolviendo
  // un duplicado y el otro pidiendole su direccion. Un texto comun los mezcla.
  assert.match(PANTALLA, /duplicad/i)
})
```

- [ ] **Step 2: Correr y ver que falla**

```bash
cd /home/user/central
node --test test/regression-clientes-sin-canal.test.ts 2>&1 | grep -E "^# (pass|fail)"
```

Esperado: `# fail 2`.

- [ ] **Step 3: Añadir el vocabulario de la UI**

Después del `const ESTILO` (línea ~109) de `SinCanal.tsx`:

```tsx
/**
 * Qué se le dice a Alberto de cada estado del portal. Son cuatro textos y no
 * uno porque cada uno se arregla en un sitio distinto; «no verá su cartera» a
 * secas le dejaría sin saber si tiene que llamar al cliente o resolver una
 * ficha duplicada.
 */
const PORTAL: Record<EstadoPortalCliente, { label: string; tono: Tono; que: string }> = {
  puede_entrar: { label: 'Verá su cartera', tono: 'neutral', que: '' },
  sin_email: {
    label: 'No verá su cartera',
    tono: 'negativo',
    que: 'No hay ningún correo suyo en la base, así que el portal no puede saber qué ficha es la suya: entraría y vería la bóveda vacía. Pídeselo y apúntalo en su ficha.',
  },
  ambiguo: {
    label: 'No verá su cartera',
    tono: 'negativo',
    que: 'Ese correo está declarado como suyo en MÁS DE UNA ficha, así que el portal no sabría cuál enseñarle. Es una ficha duplicada: resuélvela y se arregla solo.',
  },
  resuelve_a_otra: {
    label: 'No verá su cartera',
    tono: 'negativo',
    que: 'El único correo que consta suyo es en realidad el de OTRA persona, así que le llevaría a la ficha de ella. No es un duplicado: a este cliente le falta su propia dirección.',
  },
}
```

Y el import del tipo, junto a los que ya vienen de `@/lib/correduria-puerto`:

```tsx
import type { EstadoPortalCliente } from '@/lib/correduria-puerto'
```

- [ ] **Step 4: Añadir el bloque al titular**

Justo después del bloque `{rescatables !== null && rescatables > 0 && (...)}`, insertar:

```tsx
      {resumen.noVenSuCartera !== null && resumen.noVenSuCartera > 0 && (
        <div style={{ border: '1px solid var(--negative)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13, lineHeight: 1.5 }}>
          <Badge tono="negativo">Portal</Badge>{' '}
          <strong>{resumen.noVenSuCartera} no verán su cartera</strong> si les das acceso hoy: entran,
          teclean su código y la bóveda sale vacía, sin ningún error. Es una pregunta distinta de si
          se les puede escribir — abajo, en cada fila, pone por qué y qué lo arregla.
        </div>
      )}
      {resumen.noVenSuCartera === null && (
        <p style={{ ...pMuted, marginBottom: 10 }}>
          No se ha podido comprobar quién verá su cartera al entrar al portal.{' '}
          <strong>No significa que la vean todos.</strong>
        </p>
      )}
```

- [ ] **Step 5: Añadir el estado a cada fila**

Dentro de `Fila`, después del `<Badge tono={e.tono}>{e.label}</Badge>`:

```tsx
        {f.portal !== null && f.portal !== 'puede_entrar' && (
          <Badge tono={PORTAL[f.portal].tono}>{PORTAL[f.portal].label}</Badge>
        )}
```

Y después de `{e.que && <div ...>{e.que}</div>}`:

```tsx
      {/* El «por qué» del portal va aparte del de la contactabilidad: son dos
          diagnósticos distintos y mezclarlos en un párrafo hace que Alberto
          arregle uno creyendo que ha arreglado los dos. */}
      {f.portal !== null && PORTAL[f.portal].que && (
        <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>{PORTAL[f.portal].que}</div>
      )}
      {f.portal === null && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          <span title="asegura no ha informado si este cliente veria su cartera: no es que no la vea, es que no se ha podido mirar">
            portal sin comprobar
          </span>
        </div>
      )}
```

- [ ] **Step 6: Correr los cepos y el typecheck**

```bash
cd /home/user/central
node --test test/regression-clientes-sin-canal.test.ts 2>&1 | grep -E "^# (pass|fail)"
cd apps/plataforma && npx --yes pnpm@10.33.0 exec prisma generate && npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json
```

Esperado: `# fail 0`, y typecheck sin errores.

- [ ] **Step 7: Medir el responsive antes de darlo por hecho**

```bash
cd /home/user/central/apps/plataforma
npx --yes pnpm@10.33.0 run build && npx --yes pnpm@10.33.0 run start &
```

Con Playwright (chromium en `/opt/pw-browsers/chromium`), abrir `/correduria` → pestaña «Datos» a 320, 390 y 1024 px. 🚨 **No midas `document.body.scrollWidth`**: en plataforma el scroller horizontal es `LayoutShell`, no `<body>`, y el body devuelve el ancho del viewport mientras el contenido desborda. Mide sobre el scroller:

```js
const sc = document.querySelector('[data-layout-shell]') ?? document.scrollingElement
sc.scrollWidth > sc.clientWidth
```

Esperado: `false` en los tres anchos, y las dos insignias de una fila caben sin partir el nombre.

- [ ] **Step 8: Commit**

```bash
cd /home/user/central
git add apps/plataforma/app/\(usuario\)/correduria/SinCanal.tsx test/regression-clientes-sin-canal.test.ts
git commit -m "feat(plataforma): la pantalla dice quien NO vera su cartera, y por que

Segunda cifra en el titular y una insignia por fila, con los tres motivos
separados: sin correo, ficha duplicada, y el correo es de otra persona.
Cada uno se arregla en un sitio distinto, asi que un texto comun haria
arreglar uno creyendo que se arreglaron los tres. null se dice, no se
rellena con un cero."
```

---

### Task 7: El portal RECUERDA cómo salió el vínculo

**Files:**
- Create: `apps/asegura-portal/prisma/sql/2026-09-06_portal_identidad_ultimo_vinculo.sql`
- Modify: `apps/asegura-portal/prisma/schema.prisma:80-96`
- Modify: `apps/asegura-portal/lib/vinculo.ts`

**Por qué hace falta esto y no se puede derivar:** en `/boveda` no existe el correo en claro — el portal guarda `portal_canal.valor_hash`, un SHA-256 con pimienta PROPIA que no sirve para el índice ciego, y un hash no se revierte. Así que la bóveda no puede recalcular el vínculo: **el resultado hay que sellarlo en el momento en que sí se sabe**, que es el canje del código.

🚨 **La DDL se aplica en el MISMO paso que el despliegue que la usa** (lección de `portal_supresion`, 05/09/2026: el código llegó a producción con la tabla sin crear y `/boveda` entera habría reventado). No mergees la Tarea 8 sin haber ejecutado este SQL.

- [ ] **Step 1: Escribir el SQL**

`apps/asegura-portal/prisma/sql/2026-09-06_portal_identidad_ultimo_vinculo.sql`:

```sql
-- Cómo salió el ÚLTIMO intento de vincular esta identidad con una ficha de la
-- cartera. Se sella en el canje del código, que es el único momento en que el
-- portal tiene el correo en claro: `portal_canal` solo guarda un hash con
-- pimienta propia, que no sirve para el índice ciego y no se revierte.
--
-- 🚨 Sin esto, /boveda no puede distinguir «no eres cliente» de «tu correo está
-- en dos fichas y lo estamos revisando», y le dice a los dos que no hemos
-- encontrado ninguna póliza a su nombre — que para el segundo es FALSO: sí se
-- han encontrado, y por eso precisamente no se le enseña ninguna.
--
-- Es una COLUMNA y no una tabla a propósito: solo interesa el último intento.
-- El histórico de quién intentó entrar y cómo salió no es un dato que ninguna
-- pantalla pida, y guardarlo sería acumular rastro de gente por si acaso.
alter table seguros.portal_identidad
  add column if not exists ultimo_vinculo text,
  add column if not exists ultimo_vinculo_en timestamptz;

-- El vocabulario es el de `EstadoVinculo` de lib/vinculo.ts. Un valor fuera de
-- la lista es un error de programación, no un estado nuevo: que lo pare la BD.
alter table seguros.portal_identidad
  drop constraint if exists portal_identidad_ultimo_vinculo_valido;
alter table seguros.portal_identidad
  add constraint portal_identidad_ultimo_vinculo_valido check (
    ultimo_vinculo is null
    or ultimo_vinculo in ('ok', 'ya_vinculada', 'sin_ficha', 'ambiguo', 'sin_clave', 'error')
  );

-- Y el sello sin fecha no vale: un estado sin cuándo se midió no se puede
-- envejecer, y la bóveda tendría que decidir si fiarse de él a ciegas.
alter table seguros.portal_identidad
  drop constraint if exists portal_identidad_ultimo_vinculo_con_fecha;
alter table seguros.portal_identidad
  add constraint portal_identidad_ultimo_vinculo_con_fecha check (
    (ultimo_vinculo is null) = (ultimo_vinculo_en is null)
  );

grant select (id, nombre, creada_en, ultimo_acceso_en, ultimo_vinculo, ultimo_vinculo_en)
  on seguros.portal_identidad to prisma_asegura_portal;
grant update (ultimo_acceso_en, ultimo_vinculo, ultimo_vinculo_en)
  on seguros.portal_identidad to prisma_asegura_portal;
```

- [ ] **Step 2: Aplicarlo contra la BD y VER MORDER los dos CHECK**

Con el MCP de Supabase (proyecto `wswbehlcuxqxyinousql`), aplicar el fichero. Después, dentro de una transacción con ROLLBACK, comprobar que los cepos muerden — un CHECK que nadie ha visto morder es una suposición:

```sql
begin;
-- 1) valor fuera del vocabulario ⇒ 23514
update seguros.portal_identidad set ultimo_vinculo = 'lo_que_sea', ultimo_vinculo_en = now()
where id = (select id from seguros.portal_identidad limit 1);
rollback;

begin;
-- 2) estado sin fecha ⇒ 23514
update seguros.portal_identidad set ultimo_vinculo = 'ambiguo'
where id = (select id from seguros.portal_identidad limit 1);
rollback;

begin;
-- 3) el bueno entra
update seguros.portal_identidad set ultimo_vinculo = 'ambiguo', ultimo_vinculo_en = now()
where id = (select id from seguros.portal_identidad limit 1);
rollback;
```

Esperado: los dos primeros `23514`, el tercero `UPDATE 1`. **Anota los tres resultados en el mensaje del commit.**

⚠️ Si `portal_identidad` está a 0 filas, los `update` afectan a 0 y no prueban nada: inserta una identidad de prueba dentro de la misma transacción antes del `update`, y hazle `rollback` igual.

- [ ] **Step 3: Añadir las columnas al schema de Prisma**

En `apps/asegura-portal/prisma/schema.prisma`, dentro de `model PortalIdentidad`, después de `ultimoAccesoEn`:

```prisma
  ultimoVinculo   String?   @map("ultimo_vinculo")
  ultimoVinculoEn DateTime? @map("ultimo_vinculo_en") @db.Timestamptz(6)
```

🚨 **Primero el GRANT, después el schema, en ese orden.** El rol tiene `SELECT` por columnas: declarar en el modelo una columna sin conceder hace que **todas** las lecturas de `PortalIdentidad` revienten con `permission denied for column` (42501), no solo esa. El Step 2 ya concedió.

- [ ] **Step 4: Regenerar Prisma y typechequear**

```bash
cd /home/user/central/apps/asegura-portal
npx --yes pnpm@10.33.0 exec prisma generate && npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json
```

Esperado: sin errores. (Si sale `Property 'portalIdentidad' does not exist`, es que otro `prisma generate` de otra app pisó el cliente compartido: vuelve a generar desde aquí antes de diagnosticar nada.)

- [ ] **Step 5: Sellar el resultado en `vincularIdentidad()`**

En `apps/asegura-portal/lib/vinculo.ts`, envolver el retorno para que todo camino selle. Sustituir la firma y el cuerpo de `vincularIdentidad` por una que delegue:

```ts
export async function vincularIdentidad(
  identidadId: string,
  destino: string,
  tipo: 'email' | 'whatsapp' = 'email',
): Promise<ResultadoVinculo> {
  const r = await intentarVinculo(identidadId, destino, tipo)
  await sellarVinculo(identidadId, r.estado)
  return r
}

/**
 * Deja constancia de cómo salió el intento. Best-effort a propósito: el vínculo
 * ya está hecho (o no), y un sello caído no puede deshacerlo ni convertirlo en
 * un fallo de login. Lo único que se pierde es que /boveda diga el motivo.
 *
 * 🚨 Se sella SIEMPRE, también en `ok`. Un sello que solo se escribiera en los
 * casos malos dejaría a quien se vinculó bien con el estado viejo de un intento
 * anterior, y la bóveda le explicaría un problema que ya no tiene.
 */
async function sellarVinculo(identidadId: string, estado: EstadoVinculo): Promise<void> {
  try {
    await prisma.portalIdentidad.update({
      where: { id: identidadId },
      data: { ultimoVinculo: estado, ultimoVinculoEn: new Date() },
    })
  } catch (e) {
    console.error('[vinculo] no se pudo sellar el estado:', e instanceof Error ? e.message : e)
  }
}
```

Y renombrar la función original a `async function intentarVinculo(...)` con la misma firma y cuerpo, **sin tocar su lógica**.

- [ ] **Step 6: Comprobar que el guardián de aislamiento sigue verde**

```bash
cd /home/user/central
node --test test/regression-portal-aislamiento.test.ts 2>&1 | grep -E "^# (pass|fail)"
```

Esperado: `# fail 0`. `lib/vinculo.ts` ya está en `EXENTOS` y en `CARTERA_SIN_SESION`, así que la escritura nueva no abre ninguna puerta: sigue escribiendo solo la identidad que le pasa el canje.

- [ ] **Step 7: Commit**

```bash
cd /home/user/central
git add apps/asegura-portal/prisma/sql/2026-09-06_portal_identidad_ultimo_vinculo.sql apps/asegura-portal/prisma/schema.prisma apps/asegura-portal/lib/vinculo.ts
git commit -m "feat(asegura-portal): el vinculo deja constancia de como salio

/boveda no puede recalcularlo: alli no existe el correo en claro, y
portal_canal solo guarda un hash con pimienta propia que no sirve para el
indice ciego. Asi que el resultado se sella en el canje del codigo, que es
el unico momento en que se sabe.

DDL aplicada en el mismo paso, con los dos CHECK vistos morder (23514 con
un estado fuera del vocabulario, 23514 con estado sin fecha, y entra el
bueno). Grant primero, schema despues: una columna declarada sin conceder
revienta la lectura ENTERA del modelo, no solo esa columna."
```

---

### Task 8: `/boveda` tiene tres textos donde tenía uno

**Files:**
- Modify: `apps/asegura-portal/lib/cartera-lectura.ts:183-208, 224-280, 613`
- Modify: `apps/asegura-portal/app/(portal)/boveda/page.tsx:186-201`
- Create: `test/regression-portal-vinculo-visible.test.ts`

- [ ] **Step 1: Escribir el cepo que falla**

`test/regression-portal-vinculo-visible.test.ts`:

```ts
// Cepo de los TRES textos de la bóveda vacía.
//
// ─── Qué protege ────────────────────────────────────────────────────────────
// Hasta el 06/09/2026 la bóveda decía lo mismo a un desconocido y a un cliente
// cuyo correo aparece en dos fichas: «No hemos encontrado ninguna póliza a
// nombre de este email». Para el segundo es FALSO —sí se han encontrado, y por
// eso precisamente no se le enseña ninguna— y le deja creyendo que ha perdido
// sus seguros. El aviso de 2,5 s de la pantalla de entrada no lo tapa: quien
// vuelve con la sesión viva (30 días) va directo a /boveda y no lo ve nunca.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const RAIZ = new URL('..', import.meta.url).pathname
const BOVEDA = readFileSync(`${RAIZ}apps/asegura-portal/app/(portal)/boveda/page.tsx`, 'utf8')
const LECTURA = readFileSync(`${RAIZ}apps/asegura-portal/lib/cartera-lectura.ts`, 'utf8')
const VINCULO = readFileSync(`${RAIZ}apps/asegura-portal/lib/vinculo.ts`, 'utf8')

/** Sin comentarios: el texto que explica el fallo contiene la frase prohibida. */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const BOVEDA_CODIGO = sinComentarios(BOVEDA)

test('🚨 la boveda distingue el vinculo ambiguo, y NO le dice que no hay nada', () => {
  assert.match(BOVEDA_CODIGO, /ambiguo/, 'la bóveda no contempla el estado ambiguo')
  // El texto del ambiguo no puede contener la frase del desconocido.
  const trozo = BOVEDA_CODIGO.slice(BOVEDA_CODIGO.indexOf('ambiguo'))
  const hasta = trozo.slice(0, 600)
  assert.doesNotMatch(hasta, /No hemos encontrado ninguna p[oó]liza/)
})

test('🚨 la boveda dice cuando NO se ha podido comprobar', () => {
  // Hoy esto solo se decía en la entrada, y quien llega con sesión viva no pasa
  // por ahí: para él, un fallo de clave se veía igual que «no eres cliente».
  assert.match(BOVEDA_CODIGO, /sin_clave|no se ha podido comprobar/i)
})

test('🚨 el estado del vinculo se DERIVA en el servidor, no llega por la URL', () => {
  // Un `?vinculo=ambiguo` sería una pantalla que miente a quien la manipula.
  assert.doesNotMatch(BOVEDA_CODIGO, /searchParams[^\n]*vinculo/)
  assert.match(LECTURA, /vinculo/, 'CarteraPortal tiene que llevar el estado')
})

test('🚨 el vinculo se sella SIEMPRE, tambien cuando sale bien', () => {
  // Un sello que solo se escribiera en los casos malos dejaría a quien ya se
  // vinculó con el estado viejo, y la bóveda le explicaría un problema resuelto.
  const codigo = sinComentarios(VINCULO)
  assert.match(codigo, /sellarVinculo\(identidadId,\s*r\.estado\)/)
})

test('🚨 un vinculo desconocido NO se lee como «sin ficha»', () => {
  // La columna admite seis valores y la BD los vigila, pero un despliegue viejo
  // podría dejar cualquier cosa: lo que no se reconoce es «no se sabe».
  const codigo = sinComentarios(LECTURA)
  assert.doesNotMatch(codigo, /ultimoVinculo\s*\?\?\s*'sin_ficha'/)
})
```

- [ ] **Step 2: Correr y ver que falla**

```bash
cd /home/user/central
node --test test/regression-portal-vinculo-visible.test.ts 2>&1 | grep -E "^# (pass|fail)"
```

Esperado: `# fail 5`.

- [ ] **Step 3: Llevar el estado a `CarteraPortal`**

En `apps/asegura-portal/lib/cartera-lectura.ts`, antes del tipo `CarteraPortal`:

```ts
/**
 * Cómo salió el último intento de vincular esta identidad con una ficha, leído
 * de `portal_identidad.ultimo_vinculo`.
 *
 * 🚨 `null` = **no consta** (nunca se intentó, o el sello falló), y NO es
 * `sin_ficha`. Son la misma pantalla vacía y dos frases distintas: una dice
 * «no eres cliente» y la otra no puede decir nada.
 */
export type VinculoPortal = 'ok' | 'ya_vinculada' | 'sin_ficha' | 'ambiguo' | 'sin_clave' | 'error'

const VINCULOS: readonly string[] = ['ok', 'ya_vinculada', 'sin_ficha', 'ambiguo', 'sin_clave', 'error']

function leerVinculo(v: string | null): VinculoPortal | null {
  return v !== null && VINCULOS.includes(v) ? (v as VinculoPortal) : null
}
```

En `CarteraPortal`, después de `vinculada: boolean`:

```ts
  /**
   * El resultado del último intento de vínculo. Lo usa la bóveda para no
   * decirle «no hemos encontrado ninguna póliza» a alguien cuyo correo SÍ
   * encontramos en dos fichas. `null` = no consta.
   */
  vinculo: VinculoPortal | null
```

En `SIN_VINCULO`, añadir `vinculo: null` — **y ojo**: ese objeto es una constante compartida, así que el valor real se rellena en el `return` de abajo, no aquí.

- [ ] **Step 4: Leerlo en `carteraDeIdentidad()`**

Al principio de `carteraDeIdentidad`, junto a la consulta de vínculos:

```ts
  const identidad = await prisma.portalIdentidad.findUnique({
    where: { id: identidadId },
    select: { ultimoVinculo: true },
  })
  const vinculo = leerVinculo(identidad?.ultimoVinculo ?? null)
```

Cambiar el corte de la línea ~275:

```ts
  if (vinculos.length === 0 && filasAutorizacion.length === 0) return { ...SIN_VINCULO, vinculo }
```

Y en el objeto del `return` final, junto a `vinculada: vinculos.length > 0`:

```ts
    vinculo,
```

- [ ] **Step 5: Los tres textos en `/boveda`**

Sustituir el bloque de las líneas 186-201 de `app/(portal)/boveda/page.tsx` por:

```tsx
      <section className="seccion" aria-labelledby="cartera-titulo">
        <h2 id="cartera-titulo">Tus seguros</h2>
        {!cartera.vinculada ? (
          cartera.vinculo === 'ambiguo' ? (
            // 🚨 A este NO se le puede decir «no hemos encontrado ninguna
            // póliza»: sí se han encontrado, y es justo por eso por lo que no se
            // le enseña ninguna. Decirle lo contrario es mandarle a pensar que
            // ha perdido sus seguros.
            <p className="pendiente" style={{ margin: 0 }}>
              Tu email aparece en más de una ficha de {correduria}, así que todavía no podemos saber
              cuáles de las pólizas son tuyas. Lo está revisando el corredor y no has perdido nada:
              vuelve a entrar en unos días y aquí estarán.
            </p>
          ) : cartera.vinculo === 'sin_clave' || cartera.vinculo === 'error' ? (
            // Esto solo se decía en la pantalla de entrada, y quien vuelve con
            // la sesión viva (30 días) va directo aquí y no lo veía nunca: un
            // problema NUESTRO se le enseñaba como «no eres cliente».
            <p className="pendiente" style={{ margin: 0 }}>
              No hemos podido comprobar tu cartera ahora mismo. Es un problema nuestro, no tuyo: lo
              reintentamos la próxima vez que entres.
            </p>
          ) : (
            // Sin vínculo ≠ sin pólizas: no hay ficha con este email. No se
            // inventan teléfonos ni emails de la correduría: solo `nombre` es legible.
            <p className="suave" style={{ margin: 0 }}>
              No hemos encontrado ninguna póliza a nombre de este email. Si eres cliente con otro email,
              escríbenos por tu canal habitual con {correduria} y lo vinculamos.
            </p>
          )
        ) : propiasVacia ? (
          <p className="suave" style={{ margin: 0 }}>
            Tu ficha está en {correduria}, pero no tiene pólizas vivas ahora mismo.
          </p>
        ) : (
          cartera.propias.map((t) => <Titular key={t.clienteId} titular={t} propia />)
        )}
```

📌 Los dos textos nuevos llevan `.pendiente` (píldora de borde discontinuo) y no `.suave`: en este portal el discontinuo significa «esto se rellenará», que es exactamente lo que pasa en los dos casos. El tercero se queda en `.suave` porque para un desconocido no hay nada pendiente.

- [ ] **Step 6: Correr los cepos y ver morder uno**

```bash
cd /home/user/central
node --test test/regression-portal-vinculo-visible.test.ts 2>&1 | grep -E "^# (pass|fail)"
```

Esperado: `# fail 0`.

Mutación: cambiar en `/boveda` el texto del `ambiguo` por el del desconocido y volver a correr.

Esperado: `# fail 1`. **Deshacer** y volver a `# fail 0`.

- [ ] **Step 7: Typecheck de las dos apps del portal**

```bash
cd /home/user/central/apps/asegura-portal
npx --yes pnpm@10.33.0 exec prisma generate && npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json
```

Esperado: sin errores.

- [ ] **Step 8: Commit**

```bash
cd /home/user/central
git add apps/asegura-portal/lib/cartera-lectura.ts "apps/asegura-portal/app/(portal)/boveda/page.tsx" test/regression-portal-vinculo-visible.test.ts
git commit -m "feat(asegura-portal): la boveda vacia dice la verdad, con tres textos

Hasta hoy le decia lo mismo a un desconocido y a un cliente cuyo correo
esta en dos fichas: «no hemos encontrado ninguna poliza a nombre de este
email». Para el segundo es falso —si se han encontrado, y por eso
precisamente no se le enseña ninguna— y le deja creyendo que ha perdido
sus seguros. El aviso de 2,5 s de la entrada no lo tapa: quien vuelve con
la sesion viva va directo a /boveda.

El estado se DERIVA en el servidor desde portal_identidad, no llega por la
URL: un ?vinculo=ambiguo seria una pantalla que miente a quien la
manipula. Cinco cepos, uno visto morder."
```

---

### Task 9: Verificación de la entrega

- [ ] **Step 1: Contrastar contra la BD real**

Con el MCP de Supabase, correr la consulta de aceptación y comparar con lo que devuelve el puerto:

```sql
with vivas as (
  select distinct p.cliente_id from seguros.polizas p
  where p.merged_into_poliza_id is null and (p.import_ref is null or p.eiac_xml_hash is not null)
),
titulares as (
  select c.id from seguros.clientes c join vivas v on v.cliente_id = c.id
  where c.merged_into_cliente_id is null and c.activo
),
cand as (
  select c.id as cliente_id, c.email_lookup_hash as h, true as principal
  from seguros.clientes c where c.merged_into_cliente_id is null and c.email_lookup_hash is not null
  union all
  select ce.cliente_id, ce.email_lookup_hash, false
  from seguros.cliente_emails ce join seguros.clientes c2 on c2.id = ce.cliente_id
  where c2.merged_into_cliente_id is null and ce.email_lookup_hash is not null
),
dedup as (select h, cliente_id, bool_or(principal) as es_principal from cand group by h, cliente_id),
resuelve as (
  select h, count(*) filter (where es_principal) as n_principal, count(*) as n_fichas,
         (array_agg(cliente_id) filter (where es_principal))[1] as gana
  from dedup group by h
),
mios as (select t.id, d.h from titulares t left join dedup d on d.cliente_id = t.id),
clasif as (
  select m.id,
    max(case
      when m.h is null then 0
      when r.n_principal = 1 and r.gana = m.id then 3
      when r.n_principal > 1 then 2
      when r.n_principal = 0 and r.n_fichas = 1 then 3
      when r.n_principal = 0 and r.n_fichas > 1 then 2
      else 1 end) as mejor
  from mios m left join resuelve r on r.h = m.h group by m.id
)
select
  count(*) filter (where mejor = 3) as puede_entrar,
  count(*) filter (where mejor = 0) as sin_email,
  count(*) filter (where mejor = 2) as ambiguo,
  count(*) filter (where mejor = 1) as resuelve_a_otra
from clasif;
```

Esperado hoy: **46 / 29 / 0 / 5**. Si el puerto da otra cosa, la derivación no replica `prediccionDeVinculo()` y **no se sigue**: se arregla antes de mergear.

- [ ] **Step 2: La suite entera**

```bash
cd /home/user/central
npx --yes pnpm@10.33.0 install --no-frozen-lockfile
npx --yes pnpm@10.33.0 test 2>&1 | grep -oE "# fail [0-9]+" | awk '{s+=$3} END {print "fallos totales:", s}'
```

Esperado: `fallos totales: 0`.

- [ ] **Step 3: Typecheck de las tres apps tocadas**

```bash
cd /home/user/central/apps/asegura && npx --yes pnpm@10.33.0 exec prisma generate && npx --yes pnpm@10.33.0 exec prisma generate --schema prisma/asegura.prisma && npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json
cd /home/user/central/apps/asegura-portal && npx --yes pnpm@10.33.0 exec prisma generate && npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json
cd /home/user/central/apps/plataforma && npx --yes pnpm@10.33.0 exec prisma generate && npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json
```

⚠️ **Uno detrás de otro y en este orden, no en paralelo.** El cliente por defecto de Prisma es UNO para todo el monorepo: generar otra app pisa el anterior y deja typechecks en rojo con errores que parecen de código en ficheros que nadie ha tocado.

- [ ] **Step 4: QA y lint (desde `apps/ia-rest`, que es donde el workflow los corre)**

```bash
cd /home/user/central/apps/ia-rest
npx --yes pnpm@10.33.0 exec tsx scripts/qa-check.ts
npx --yes pnpm@10.33.0 run lint
npx --yes pnpm@10.33.0 run build
```

Esperado: QA «sin problemas», lint 0 errores (los *warnings* no bloquean), build OK.

- [ ] **Step 5: Actualizar la documentación en el MISMO PR**

- `apps/asegura-portal/CLAUDE.md`: sección nueva con la columna `ultimo_vinculo`, los tres textos de la bóveda y sus cepos. Añadir el SQL nuevo a la cuenta de `prisma/sql/` (⚠️ **cuenta los ficheros, no cites el número de memoria**: esa frase ya se ha quedado corta dos veces).
- `apps/asegura/CLAUDE.md`: que `clientesSinCanal()` responde ahora dos preguntas, y cuál es cuál.
- `docs/superpowers/specs/2026-09-05-...-design.md`: corregir «5 ambiguos» → «5 resuelve_a_otra», y anotar que §4.1 ya estaba hecho al escribir el plan.
- `apps/asegura/lib/invitacion-portal.ts`: si la medición del Step 1 sigue dando 46, actualizar el «51 invitables» de su cabecera con la cifra y la fecha.
- `docs/CONTEXTO-SESIONES.md`: entrada nueva arriba, máx ~8 líneas.

- [ ] **Step 6: Abrir el PR en draft y llevarlo a verde**

Empujar UNA vez (cada push a una rama de PR crea 11 deployments y hay un tope de 450/h de cuenta), abrir el PR en draft y seguir el orden documentado si los checks no arrancan: (1) `git ls-remote` vs `head.sha` → si difieren, esperar 2-3 min sin tocar nada; (2) sacar de draft **y empujar algo con contenido real después**; (3) mergear `main`. Nunca commit vacío, ni cerrar y reabrir, ni tocar el ruleset.

---

## Lo que este plan NO cubre, dicho en voz alta

- **Los 29 sin correo no se arreglan con código.** Hace falta que alguien les pida la dirección. Esto hace que Alberto sepa exactamente quiénes son y que el portal no les mienta mientras tanto.
- **Los 5 `resuelve_a_otra` tampoco.** Son fichas donde el único correo conocido es de otra persona; el arreglo es de datos, y decidir de quién es cada correo es suyo, no del código. **No se funden fichas automáticamente**: dos identidades distintas no se funden jamás.
- **La divergencia entre la lista y la ficha es deliberada** y está documentada en el código: la lista pregunta «¿hay ALGÚN correo suyo que le identifique?» y la ficha «¿el correo al que escribiríamos le identifica?». Por eso cada fila enlaza a su ficha.
- **Entregas 2-4** (aviso de vencimiento y panel de configuración · anulación y recibo emitido · coberturas completas, detalle económico y estado de gestiones) siguen fuera, con sus bloqueos anotados en el §7 del spec.
