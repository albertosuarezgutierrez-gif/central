# Captación desde el portal: huecos por ramo y consentimiento comercial — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el portal detecte qué ramos le faltan a cada cliente y le invite —una sola vez por hueco, y solo con su consentimiento— a traer las pólizas que tiene con otras compañías, para que Alberto vea el lead con su fecha de vencimiento.

**Architecture:** un módulo puro calcula los huecos; una casilla de consentimiento (`comercial`) decide si se puede empujar; la invitación se pinta donde el cliente ya está trabajando, no al entrar; el lead que le llega a Alberto es la póliza declarada que el cliente sube, con su compañía y su vencimiento.

**Tech Stack:** `@central/module-seguros-portal`, `consentimiento.ts` (ya existe), Prisma, Next.js App Router.

---

## Por qué existe, y lo que hay que tener claro antes

Alberto, 07/09/2026: «me gustaría ir viendo la forma automática de ventas… cliente que tiene auto y al entrar intranet ver la forma que le saquemos datos de sus otros seguros».

Tres cosas medidas o verificadas que condicionan el diseño:

1. **El conducto ya existe y hoy está roto por una env.** El cliente sube el PDF de su seguro de otra compañía y una IA lo lee (`SubirPoliza` → `portal_polizas_declaradas`). Eso ES «sacarle los datos», y es la forma que no molesta porque el cliente lo hace para tenerlo todo junto. Sin `OPENROUTER_API_KEY` devuelve «no hemos podido leer el documento» (`lib/extraer-poliza.ts:277`). **Este plan no vale de nada hasta que esa clave esté puesta.**

2. **Es un cambio de finalidad, y ya hay sitio para él.** Los datos del portal se recogen para ejecutar el contrato; usarlos para vender otro ramo es otra finalidad (art. 6.4 RGPD). `packages/module-seguros-portal/src/consentimiento.ts` **ya contempla el tipo `comercial`**, y su cabecera dice que existe en la BD y no se escribe «porque no hay pantalla que lo pida». Este plan es esa pantalla.

3. **El copy tiene un límite duro.** `apps/asegura-web/lib/ramos.test.ts` prohíbe prometer ahorros o superlativos de precio: hacerlo convierte la web en asesoramiento y arrastra análisis objetivo e IPID (RDL 3/2020). **Ese cepo no cubre el portal**, así que este plan trae el suyo.

**Discrepancia sobre el planteamiento, y se mantiene:** el disparo NO es «al entrar». Un cliente que abre el portal para mirar un recibo y recibe un empujón de venta aprende a no abrirlo. Se pinta cuando ya está añadiendo o mirando una póliza, y como máximo una vez por hueco.

---

## File Structure

| Fichero | Responsabilidad |
|---|---|
| `packages/module-seguros-portal/src/huecos.ts` (crear) | Qué ramos faltan y cuál se sugiere primero. Puro. |
| `packages/module-seguros-portal/src/huecos.test.ts` (crear) | Cepos: nunca sugiere un ramo que ya tiene; nunca sugiere sin consentimiento; el orden es estable. |
| `packages/module-seguros-portal/src/index.ts` (modificar) | Exportar. |
| `apps/asegura-portal/prisma/schema.prisma` (modificar) | `portal_sugerencias`: qué hueco se enseñó, cuándo y qué contestó. |
| `apps/asegura-portal/prisma/sql/2026-09-XX-sugerencias.sql` (crear) | Tabla + **GRANT por columna** para `prisma_asegura_portal`. |
| `apps/asegura-portal/app/(portal)/boveda/Sugerencia.tsx` (crear) | La invitación, en primera persona del cliente. |
| `apps/asegura-portal/app/(portal)/ajustes/Comercial.tsx` (crear) | La casilla del consentimiento, con su texto y su retirada. |
| `apps/asegura-portal/app/api/consentimiento/comercial/route.ts` (crear) | Registrar dar y retirar. |
| `test/regression-portal-captacion.test.ts` (crear) | Los cepos transversales: copy sin promesas de precio, y nada de sugerencias sin consentimiento. |

---

### Task 1: el motor de huecos, puro

**Files:**
- Create: `packages/module-seguros-portal/src/huecos.ts`
- Create: `packages/module-seguros-portal/src/huecos.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { huecosDeRamo, PARES_HABITUALES } from './huecos.ts'

test('🚨 nunca sugiere un ramo que ya tiene', () => {
  // Sugerirle un hogar a quien ya tiene hogar no es un fallo estético: le dice
  // que no sabemos qué tiene contratado, en la pantalla que existe justo para
  // que lo vea.
  const h = huecosDeRamo(['auto', 'hogar'], { consiente: true })
  assert.ok(!h.includes('auto'))
  assert.ok(!h.includes('hogar'))
})

test('🚨 SIN consentimiento no hay ningún hueco', () => {
  // La lista vacía no es «no le falta nada»: es «no se le puede sugerir». Que
  // la puerta esté aquí y no en el JSX es lo que impide que una pantalla nueva
  // se la salte sin enterarse.
  assert.deepEqual(huecosDeRamo(['auto'], { consiente: false }), [])
})

test('sin ninguna póliza tampoco se sugiere', () => {
  // No sabemos nada de esa persona; empezar por vender es empezar mal.
  assert.deepEqual(huecosDeRamo([], { consiente: true }), [])
})

test('el orden es estable y sale de los pares habituales', () => {
  const h = huecosDeRamo(['auto'], { consiente: true })
  assert.equal(h[0], PARES_HABITUALES.auto[0])
  assert.deepEqual(h, huecosDeRamo(['auto'], { consiente: true }), 'no puede variar entre visitas')
})
```

- [ ] **Step 2: Verlo fallar**

Run: `cd packages/module-seguros-portal && node --test src/huecos.test.ts`
Expected: FAIL — `Cannot find module './huecos.ts'`

- [ ] **Step 3: Implementar**

```ts
import { RAMOS_POLIZA, type RamoPoliza } from './poliza-leida.ts'

/** Qué acompaña a qué, por frecuencia real, no por margen. */
export const PARES_HABITUALES: Partial<Record<RamoPoliza, RamoPoliza[]>> = {
  auto: ['hogar', 'vida'],
  moto: ['auto', 'hogar'],
  hogar: ['vida', 'decesos'],
  comercio: ['responsabilidad_civil'],
  comunidades: ['responsabilidad_civil'],
}

export function huecosDeRamo(
  tiene: readonly RamoPoliza[],
  opts: { consiente: boolean },
): RamoPoliza[] {
  if (!opts.consiente) return []
  if (tiene.length === 0) return []
  const suyos = new Set(tiene)
  const out: RamoPoliza[] = []
  for (const r of tiene) {
    for (const sug of PARES_HABITUALES[r] ?? []) {
      if (!suyos.has(sug) && !out.includes(sug)) out.push(sug)
    }
  }
  return out
}
```

- [ ] **Step 4: Verlo pasar** y romper cada aserción a propósito para ver el rojo.
- [ ] **Step 5: Commit.**

---

### Task 2: la casilla del consentimiento

**Files:**
- Create: `apps/asegura-portal/app/(portal)/ajustes/Comercial.tsx`
- Create: `apps/asegura-portal/app/api/consentimiento/comercial/route.ts`

- [ ] **Step 1:** usar `necesitaRegistro` y los tipos de `consentimiento.ts` que ya existen; **no** inventar tabla nueva.
- [ ] **Step 2:** el texto dice **qué** se va a hacer («te avisaremos si vemos que te falta algún seguro»), **quién** (Grupo ASegura) y **cómo se retira** — en la misma pantalla, no en un enlace legal.
- [ ] **Step 3:** retirar tiene que **apagar**, no solo dejar de registrar: la próxima visita ya no ve sugerencias. Cepo para esto.
- [ ] **Step 4:** Commit.

---

### Task 3: la tabla de sugerencias enseñadas

**Files:**
- Modify: `apps/asegura-portal/prisma/schema.prisma`
- Create: `apps/asegura-portal/prisma/sql/2026-09-XX-sugerencias.sql`

🚨 **GRANT por columna ANTES de declararla en Prisma** — el `CLAUDE.md` de la app documenta que declarar sin conceder rompe TODAS las lecturas del modelo con `42501`.

- [ ] **Step 1:** tabla `portal_sugerencias(id, identidad_id, ramo, mostrada_en, respuesta)` con `respuesta` en tres estados: `null` = no ha contestado · `añadida` · `descartada`. `unique(identidad_id, ramo)`: **una vez por hueco**.
- [ ] **Step 2:** aplicar en preview, comprobar `/boveda`, después producción.
- [ ] **Step 3:** Commit.

---

### Task 4: la invitación, donde el cliente ya está

**Files:**
- Create: `apps/asegura-portal/app/(portal)/boveda/Sugerencia.tsx`
- Modify: `apps/asegura-portal/app/(portal)/boveda/page.tsx`

- [ ] **Step 1:** se pinta **debajo de la lista**, junto a «Añade una póliza» — no arriba, no al entrar, no como modal.
- [ ] **Step 2:** el texto es del cliente, no de la venta: «tienes 2 seguros aquí. ¿Añades los que llevas con otra compañía y lo ves todo junto?». **Prohibido**: «ahorra», «el mejor precio», «te sale más barato».
- [ ] **Step 3:** «Ahora no» escribe `descartada` y no vuelve.
- [ ] **Step 4:** responsive ≥320 px, medido sobre el scroller.
- [ ] **Step 5:** Commit.

---

### Task 5: el cepo transversal del copy

**Files:**
- Create: `test/regression-portal-captacion.test.ts`

- [ ] **Step 1:** leer el fuente de `Sugerencia.tsx` y prohibir la misma lista de `apps/asegura-web/lib/ramos.test.ts` (ahorro, superlativos de precio). Aquí el riesgo es mayor que en la web: allí lo lee un desconocido, aquí un cliente con contrato.
- [ ] **Step 2:** comprobar que `page.tsx` no pinta `Sugerencia` sin pasar por `huecosDeRamo` — que la puerta del consentimiento no se pueda rodear.
- [ ] **Step 3:** verlos ROJOS rompiendo cada cosa.
- [ ] **Step 4:** Commit y PR.

---

## Lo que este plan NO hace, a propósito

- **No retarifica.** Avant2/Codeoscopic cuesta 0,50 € por consulta y no es idempotente: ningún botón del cliente ni ningún cron puede dispararlo. El lead llega a Alberto y él decide si tarifica.
- **No manda correos.** La sugerencia vive en la pantalla. Un correo comercial es otra decisión y otro consentimiento.
- **No promete nada sobre precio.** Ni aquí ni en el aviso: eso es asesoramiento y arrastra análisis objetivo e IPID.
- **No toca `apps/asegura`.** El panel del corredor ve estos leads en `plataforma` → `/correduria`, que es donde Alberto trabaja.
