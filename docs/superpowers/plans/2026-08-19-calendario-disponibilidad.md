# Calendario de disponibilidad de House Sevillana — plan de implementación

> **Para agentes:** implementar tarea a tarea. Los pasos llevan `- [ ]` para ir marcando.

**Objetivo:** que en `housesevillana.es` se vean de un vistazo las noches libres, sin salir de la
página, sin que un fallo de red pueda pintar una noche ocupada como libre.

**Arquitectura:** la landing (HTML plano en rutas `edge`, sin BD ni secretos) pide por `fetch` a un
endpoint público nuevo de `apps/plataforma`, que consulta Smoobu en vivo con caché de 10 min y cae a
`rate_snapshots` si Smoobu falla. La clasificación de noches vive en un helper puro testeado.

**Stack:** Next 15 App Router · rutas `edge` en la landing, `nodejs` en el endpoint · Prisma
`$queryRaw` · tests con `node --test`.

**Diseño:** `docs/superpowers/specs/2026-08-19-calendario-disponibilidad-design.md`. El markup y el
CSS completos están en su apéndice — **cópialos de ahí literalmente**, no los reescribas.

---

### Tarea 1: helper puro `disponibilidad-publica.ts`

**Ficheros:**
- Crear: `apps/plataforma/lib/sivra/disponibilidad-publica.ts`
- Test: `apps/plataforma/lib/sivra/disponibilidad-publica.test.ts`

- [ ] **Paso 1: escribir el test que falla**

El test que da sentido a la pieza es el tercero: `available` ausente NO puede caer en «libre».

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { noches, clasificar } from './disponibilidad-publica.ts'

test('noches() devuelve el rango [desde, hasta) sin saltos ni repeticiones', () => {
  assert.deepEqual(noches('2026-08-30', '2026-09-02'), ['2026-08-30', '2026-08-31', '2026-09-01'])
})

test('noches() cruza un 29 de febrero bisiesto', () => {
  assert.deepEqual(noches('2028-02-28', '2028-03-01'), ['2028-02-28', '2028-02-29'])
})

test('available 0 es ocupada y available 1 es libre', () => {
  const r = clasificar({ '2026-09-01': { available: 0 }, '2026-09-02': { available: 1 } },
    ['2026-09-01', '2026-09-02'])
  assert.deepEqual(r, { ocupadas: ['2026-09-01'], sinDato: [] })
})

test('sin dato NO es libre: ausente, undefined y null van a sinDato', () => {
  // El fallo que esto previene: colapsar "no lo sé" a "libre" y decirle al huésped que
  // una noche está disponible cuando lo único cierto es que Smoobu no la devolvió.
  const r = clasificar(
    { '2026-09-02': undefined, '2026-09-03': {}, '2026-09-04': { available: null } },
    ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'],
  )
  assert.deepEqual(r.ocupadas, [])
  assert.deepEqual(r.sinDato, ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'])
})

test('un available que no es 0 ni 1 se trata como sin dato, no como libre', () => {
  const r = clasificar({ '2026-09-01': { available: 7 as unknown as number } }, ['2026-09-01'])
  assert.deepEqual(r.sinDato, ['2026-09-01'])
})
```

- [ ] **Paso 2: comprobar que falla**

Ejecutar: `cd apps/plataforma && node --test lib/sivra/disponibilidad-publica.test.ts`
Esperado: FAIL, no se resuelve el módulo.

- [ ] **Paso 3: implementar**

```ts
// apps/plataforma/lib/sivra/disponibilidad-publica.ts
//
// Clasificación de noches para el calendario público de la landing.
//
// La razón de que esto sea un módulo aparte y testeado: la respuesta de Smoobu tiene TRES
// estados, no dos. `available: 1` es libre, `available: 0` es ocupada, y una fecha que no
// viene —o que viene sin el campo— es «no lo sé». Colapsar ese tercer caso a «libre» le
// diría al huésped que puede reservar una noche sobre la que no tenemos ni un dato.

/** Noches del rango [desde, hasta), en orden, como 'AAAA-MM-DD'. */
export function noches(desde: string, hasta: string): string[] {
  const out: string[] = []
  const fin = new Date(hasta + 'T00:00:00Z')
  for (const d = new Date(desde + 'T00:00:00Z'); d < fin; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/** Reparte las noches en ocupadas / sin dato. Lo que no cae en ninguna es libre. */
export function clasificar(
  rates: Record<string, { available?: number | null } | undefined>,
  fechas: string[],
): { ocupadas: string[]; sinDato: string[] } {
  const ocupadas: string[] = []
  const sinDato: string[] = []
  for (const f of fechas) {
    const a = rates[f]?.available
    if (a === 0) ocupadas.push(f)
    else if (a !== 1) sinDato.push(f) // null, undefined y cualquier otro valor
  }
  return { ocupadas, sinDato }
}
```

- [ ] **Paso 4: comprobar que pasa**

Ejecutar: `cd apps/plataforma && node --test lib/sivra/disponibilidad-publica.test.ts`
Esperado: 5 tests en verde.

- [ ] **Paso 5: commit**

```bash
git add apps/plataforma/lib/sivra/disponibilidad-publica.ts apps/plataforma/lib/sivra/disponibilidad-publica.test.ts
git commit -m "feat(sivra): helper puro de disponibilidad con los tres estados"
```

---

### Tarea 2: endpoint público

**Ficheros:**
- Crear: `apps/plataforma/app/api/publico/disponibilidad/route.ts`
- Modificar: `apps/plataforma/middleware.ts` (lista `PUBLIC`)

- [ ] **Paso 1: añadir `/api/publico` a la lista `PUBLIC` del middleware**, con comentario en el
  estilo de los que ya hay, diciendo qué expone y por qué es seguro.

- [ ] **Paso 2: escribir el handler.** Contrato, degradación y CORS exactos en la spec, sección
  «Pieza 1». Los tres puntos que no se pueden negociar:
  - Smoobu vivo → `fuente: 'smoobu'`; si falla → `rate_snapshots` de hoy o ayer,
    `fuente: 'snapshot'`; si tampoco → **503**, jamás `ocupadas: []`.
  - `slug` desconocido → 400, nunca un listado de las propiedades.
  - `Access-Control-Allow-Origin` = el origen literal si pasa el permitidor; nada de `*`.

- [ ] **Paso 3: `pnpm --filter plataforma exec tsc --noEmit`** (o el typecheck del CI).

- [ ] **Paso 4: commit**

```bash
git add apps/plataforma/app/api/publico apps/plataforma/middleware.ts
git commit -m "feat(sivra): endpoint publico de disponibilidad, con 503 en vez de mentir"
```

---

### Tarea 3: widget en la landing

**Ficheros:**
- Crear: `apps/housesevillana/app/calendario.ts`
- Modificar: `apps/housesevillana/app/route.ts` (interpolar encima de `#reserva`)
- Modificar: `apps/housesevillana/app/reservas.ts` (nota del formato `dd/mm/yyyy`)

- [ ] **Paso 1: crear `calendario.ts`** con `CALENDARIO_HTML`, `CALENDARIO_PLANTILLAS`,
  `CALENDARIO_CSS` y `CALENDARIO_JS`, copiando markup y CSS **literalmente** del apéndice de la
  spec. **Ni una comilla invertida dentro de las cadenas** — usa comillas simples para el
  contenido y backticks solo para delimitar las constantes.

- [ ] **Paso 2: interpolar en `route.ts`**: `${CALENDARIO_CSS}` dentro del `<style>`,
  `${CALENDARIO_HTML}` justo antes de `<div class="book-sec" id="reserva">`,
  `${CALENDARIO_PLANTILLAS}` y `${CALENDARIO_JS}` al final del `<body>`.

- [ ] **Paso 3: comprobar que el build no se rompe**

Ejecutar: `cd apps/housesevillana && npx tsc --noEmit -p tsconfig.json`
Esperado: sin errores. Una backtick suelta se manifiesta aquí como error de sintaxis.

- [ ] **Paso 4: commit**

---

### Tarea 4: i18n y el guardián ampliado

**Ficheros:**
- Modificar: `apps/housesevillana/app/i18n/traducciones.test.ts` (leer también `calendario.ts`)
- Modificar: `apps/housesevillana/app/en/traducciones.ts`, `apps/housesevillana/app/it/traducciones.ts`

- [ ] **Paso 1: ampliar el guardián.** Hoy lee `route.ts` como texto crudo; las cadenas del
  calendario viven en otro fichero y quedarían fuera de la red — el fallo exacto de PR #1487. La
  portada pasa a validarse contra `route.ts + calendario.ts` concatenados.

- [ ] **Paso 2: dar de alta las claves nuevas** en EN e IT (lista completa al final de la spec).

- [ ] **Paso 3: ejecutar la suite entera de la landing**

Ejecutar: `cd apps/housesevillana && node --test app/*.test.ts app/i18n/*.test.ts`
Esperado: todo en verde, incluida la prueba «toda clave del diccionario existe de verdad en el
HTML español».

- [ ] **Paso 4: commit y push, y abrir PR draft.**

---

## Verificación final

- [ ] `cd apps/housesevillana && node --test app/*.test.ts app/i18n/*.test.ts` — verde.
- [ ] `cd apps/plataforma && node --test lib/sivra/disponibilidad-publica.test.ts` — verde.
- [ ] Los 16 check runs del PR en `success` — **check runs, no commit statuses** (el fallo de #1487).
- [ ] A ojo en la preview: 320 px, el camino de error (endpoint caído → mensaje, **no** rejilla
      verde) y las tres lenguas.
