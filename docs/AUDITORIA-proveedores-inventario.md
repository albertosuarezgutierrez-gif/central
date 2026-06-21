# AUDITORÍA — Proveedores e Inventario (¿por qué están "separados"?)

> Disparador: en el panel de Estructura aparecen `module-proveedores`, `module-inventario`,
> etc. como módulos sueltos, y en "Funciones" cada vertical los tiene a su manera. La duda:
> *"¿no debería estar todo unido?"*. Esta es la respuesta auditada contra el código real.
> Fecha: 2026-06-11.

## TL;DR

- **Que `proveedores` e `inventario` sean DOS módulos está bien y es intencional.** Son dos
  dominios distintos (comisiones de proveedor vs. stock de artículos) y ya se "cosen" por
  donde toca: el **Encargo** (`parent`/`parentType`). **No hay que fusionarlos en un paquete.**
- **La desunión REAL es otra y sí es deuda:** solo `ia-rest` consume los módulos compartidos.
  `ialimp` y `sivra` **reimplementan** proveedores y stock a mano, con sus propias tablas y su
  lógica copiada en cada `route.ts`. Eso es **lógica duplicada**, no arquitectura limpia.
- **El panel te lo ocultaba.** El detector de gaps solo marcaba capacidades *ausentes* en una
  vertical; una capacidad *presente en todas pero con módulo compartido en una sola* salía "en
  verde". Se ha añadido un detector de **reimplementaciones** que ya lo destapa.

---

## 1. Qué hay realmente

### 1.1 Los módulos de dominio (correctamente separados)

| Módulo | Qué modela | Estados | Ficheros |
|---|---|---|---|
| `module-proveedores` | Catálogo de proveedores + servicios subcontratados a un Encargo, con **comisiones** | `pendiente → confirmado → pagado → cobrada` | `packages/module-proveedores/src/{types,comisiones}.ts` |
| `module-inventario` | Catálogo de **artículos con stock** + asignación de unidades a un Encargo | `reservado → entregado → devuelto → cerrado` | `packages/module-inventario/src/{types,stock}.ts` |

Ambos son **TS puro, agnósticos de BD y de vertical** (patrón Ports & Adapters: cada vertical
aporta su adaptador). Comparten la misma costura `parent: { parentId, parentType }`
(`evento` | `porte` | `alquiler` | `cita_clinica` | …). Es decir: **no están desconectados** —
se relacionan a través del Encargo, sin acoplarse entre sí. Esto cumple la regla de la matriz
(`CLAUDE.md`): *módulos portables, sin acoplarse a una vertical*.

**Veredicto:** separar proveedores de inventario es correcto. Unirlos en un solo paquete
mezclaría dos dominios y rompería la portabilidad. **No se toca.**

### 1.2 Cómo lo usa cada vertical (aquí está el problema)

| Vertical | Proveedores | Inventario / stock | ¿Usa el módulo compartido? |
|---|---|---|---|
| **ia-rest** | tabla `proveedores_evento` (+asignaciones), adaptador `src/lib/proveedores-evento.ts` | tabla `inventario_menaje` (+asignaciones), adaptador `src/lib/inventario-menaje.ts` | ✅ **Sí** (`@iarest/module-proveedores` + `@iarest/module-inventario`) |
| **ialimp** | tabla `proveedores` (BD compartida), `app/api/admin/proveedores/route.ts` | tabla `productos`, `app/api/admin/productos/route.ts`, UI `admin/materiales` | ❌ **No** — lógica inline a medida |
| **sivra** | tabla `proveedores`, `app/api/admin/limpiadoras/proveedores/route.ts` | tabla `productos`, `app/api/admin/limpiadoras/productos/route.ts` | ❌ **No** — lógica inline a medida |

Resultado: **tres implementaciones distintas** de "proveedores + stock". ia-rest pasa por el
módulo; ialimp y sivra copian la lógica. Cuando cambie una regla (p. ej. cálculo de comisión o
de disponibilidad), hay que tocarla en varios sitios.

> Nota de BD: ia-rest vive en su **propio** proyecto Supabase (`efncqyvhniaxsirhdxaa`);
> ialimp+sivra comparten `wswbehlcuxqxyinousql`. Por eso la duplicación no es "gratis" de
> unificar a nivel de datos, pero **la lógica de dominio sí** podría compartirse vía los módulos.

---

## 2. El punto ciego del panel (corregido)

### 2.1 Qué fallaba

`scripts/auditar-estructura.mjs` calculaba dos tipos de gap:

- `modulosInfrautilizados` — módulo declarado en `package.json` pero sin `import`.
- `oportunidadesPortar` — capacidad presente en unas verticales y ausente en otras.

Ninguno cruzaba **"capacidad presente"** con **"¿la respalda el módulo compartido?"**. Además
**no existía** una capacidad `proveedores` en el catálogo (solo `almacen-stock`), así que la
duplicación de proveedores era **literalmente invisible** en el panel.

### 2.2 Qué se ha cambiado

1. **Nueva capacidad `proveedores`** (`Proveedores / compras`) en el catálogo.
2. **Enlace `modulo`** en cada capacidad con módulo de respaldo: `almacen-stock → module-inventario`,
   `proveedores → module-proveedores`, `crm-leads → module-crm`, `contabilidad → module-contabilidad`,
   `feedback → module-feedback`, `concursos → module-concursos`.
3. **Nuevo detector `gaps.reimplementaciones`**: capacidad presente en una vertical pero cuyo
   módulo de respaldo NO está `usado` → lógica duplicada. Sale como KPI y bloque "♻️
   Reimplementaciones" en la pestaña Estructura del god-panel.

### 2.3 Qué destapa ahora (radiografía 2026-06-11)

| Capacidad | Módulo que debería respaldarla | Con módulo | A mano (duplicada) |
|---|---|---|---|
| Almacén / stock | `module-inventario` | ia-rest | **ialimp, sivra** |
| Proveedores / compras | `module-proveedores` | ia-rest | **ialimp, sivra** |
| CRM / leads / cotizador | `module-crm` | ia-rest | **ialimp** |

(Contabilidad, feedback y concursos salen limpios: donde están presentes, usan su módulo.)

---

## 3. Recomendación

- **No fusionar** `module-proveedores` + `module-inventario`. Son dominios distintos ya cosidos
  por el Encargo.
- **Sí unificar el uso**: portar `ialimp` y `sivra` a `module-proveedores` / `module-inventario`
  (y de paso `module-crm` en ialimp) para matar la lógica duplicada. Es el trabajo grande
  (toca BD y APIs); ya estaba anticipado en `docs/ESTRUCTURA.md` §6-7. Planificar aparte.
- **Mientras tanto**, el panel ya dice la verdad: el contador de **Reimplementaciones** es la
  métrica a bajar.

## 4. Ficheros tocados en esta auditoría

- `scripts/auditar-estructura.mjs` — capacidad `proveedores`, enlaces `modulo`, detector
  `reimplementaciones`.
- `apps/plataforma/lib/estructura.ts` — tipos `CapacidadRadiografia.modulo`, `gaps.reimplementaciones`,
  `resumen.reimplementaciones`.
- `apps/plataforma/lib/estructura.generated.json` — regenerado (`npm run auditar`).
- `apps/plataforma/app/admin/page.tsx` — KPI + bloque "♻️ Reimplementaciones".
- `docs/AUDITORIA-proveedores-inventario.md` — este documento.
