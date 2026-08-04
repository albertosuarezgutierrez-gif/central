# Almacén — Fase 1: Multi-almacén + libro de movimientos — Diseño

**Fecha:** 2026-07-16
**Vertical:** `apps/almacen` (cliente Joaquín Jaén — catering/eventos)
**Módulo de dominio:** `@central/module-materiales` (funciones puras de stock/ledger, ya existentes)

## Objetivo

Convertir el almacén de un **maestro de materiales** (lo que hay hoy) en un **control operativo multi-almacén**: varios almacenes (central + haciendas), stock **por almacén**, traspasos de material entre almacenes con estado "en tránsito", libro de movimientos con historial por material, y valor del stock por almacén. Todo operado por la **oficina** (el login actual); los empleados y sus tareas llegan en fases posteriores.

Esta es la **Fase 1** de un roadmap mayor (ver "Fuera de alcance").

## Contexto / estado actual

- `apps/almacen`: Next.js 15 App Router. Auth por tabla `cuentas` (email + `password_hash`, cookie `almacen_session`). Rol BD `prisma_almacen`. BD compartida `wswbehlcuxqxyinousql`.
- Modelos hoy: `Cuenta`, `Negocio`, `AlmacenFamilia`, `AlmacenMaterial`.
- `almacen_materiales` guarda stock como **número suelto** (`cantidad_total`, `cantidad_disponible`) a nivel de cuenta, **sin almacén**.
- Tenant DEMO `0de50000-0000-4000-a000-000000000001` con 227 materiales reales (catálogo Joaquín Jaén) + 21 familias, fotos en Storage (bucket `catalogo`).
- `@central/module-materiales` ya expone funciones puras: `stockActualDesdeLedger`, `stockPorEspacio`, `disponibilidadEnFecha`, `valorStock`, `resumenStock`, `resumenContable`, `alertasStockMinimo`, `ajusteInventario`, `costeDanos`, `expandirKit`, y los tipos `Espacio`, `Movimiento`, `AsignacionMaterial`, etc.

## Decisión de arquitectura: ledger + snapshot por almacén

El stock pasa a ser **por (material, almacén)**. Patrón elegido (híbrido, estándar):

- **`almacen_movimientos`** = fuente de verdad **histórica**. Cada cambio (entrada, salida, traspaso, ajuste, rotura) escribe una fila. De aquí sale gratis el "historial por material".
- **`almacen_stock`** = **foto rápida** por (material, almacén): `disponible` + `en_transito`. Se actualiza en la **misma transacción** que el movimiento. Motivo: las listas deben volar (regla de rendimiento del monorepo — nada de recalcular sumando miles de movimientos en cada carga).
- **`almacen_materiales`** sigue siendo el maestro/catálogo. Sus contadores globales pasan a ser **derivados** (suma de `almacen_stock` sobre todos los almacenes). Se mantienen las columnas por compatibilidad de lectura pero la verdad operativa es `almacen_stock`.

Alternativas descartadas:
- **Solo snapshot (sin ledger):** perderíamos el historial y la auditoría (justo lo que Alberto pide con "registro de todo"). Descartada.
- **Solo ledger derivado (sin snapshot):** listas lentas con cientos de materiales × varios almacenes. Descartada por rendimiento.

La matemática la valida y deriva el módulo puro `@central/module-materiales` (no se reimplementa en la app).

## Modelo de datos nuevo

### `almacen_espacios` (almacenes)
| campo | tipo | notas |
|---|---|---|
| id | uuid PK | |
| cuenta_id | uuid | tenant |
| nombre | text | "Central", "Hacienda El Rocío" |
| tipo | text | `central` \| `hacienda` \| `otro` (default `otro`) |
| direccion | text? | calle, población, provincia, CP (texto libre Fase 1) |
| persona_contacto | text? | responsable del almacén |
| telefono | text? | |
| email | text? | |
| notas | text? | acceso, horario… |
| activo | bool | default true |
| created_at | timestamptz | |

### `almacen_movimientos` (libro / ledger)
| campo | tipo | notas |
|---|---|---|
| id | uuid PK | |
| cuenta_id | uuid | |
| material_id | uuid | FK material |
| tipo | text | `entrada` \| `salida` \| `devolucion` \| `rotura` \| `ajuste` \| `transferencia` |
| cantidad | int | > 0 en todos los tipos salvo `ajuste`, que admite negativo (corrección a la baja cuando el conteo físico < sistema) |
| espacio_origen_id | uuid? | según tipo |
| espacio_destino_id | uuid? | según tipo |
| transferencia_id | uuid? | agrupa los movimientos de un traspaso |
| motivo | text? | **obligatorio en `ajuste` y `rotura`** (validado en API) |
| realizado_por | text? | identidad de quien lo hizo (Fase 1: la oficina) |
| fecha | timestamptz | default now |
| created_at | timestamptz | |

Semántica sobre `almacen_stock` (coherente con `stockActualDesdeLedger` del módulo):
- `entrada`: destino.disponible += n
- `salida`: origen.disponible -= n
- `devolucion`: destino.disponible += n
- `rotura`: origen.disponible -= n (y baja del total efectivo)
- `ajuste`: destino.disponible += n (n con signo: positivo sube, negativo baja; nunca deja `disponible` < 0)
- `transferencia`: gestionada por el flujo de `almacen_transferencias` (en tránsito)

### `almacen_stock` (foto por material+almacén)
| campo | tipo | notas |
|---|---|---|
| id | uuid PK | |
| cuenta_id | uuid | |
| material_id | uuid | |
| espacio_id | uuid | |
| disponible | int | default 0, ≥ 0 |
| en_transito | int | default 0, ≥ 0 (cajas que salieron de aquí y aún no se confirmaron en destino) |
| updated_at | timestamptz | |

Único por (material_id, espacio_id). `en_transito` se contabiliza en el **origen** mientras el traspaso está pendiente (las cajas ya no están disponibles en origen, pero tampoco en destino).

### `almacen_transferencias` (traspasos)
| campo | tipo | notas |
|---|---|---|
| id | uuid PK | |
| cuenta_id | uuid | |
| espacio_origen_id | uuid | |
| espacio_destino_id | uuid | |
| estado | text | `pendiente` \| `recibida` \| `parcial` \| `cancelada` |
| creado_por | text? | |
| notas | text? | |
| created_at | timestamptz | |
| recibida_at | timestamptz? | |

(Una transferencia mueve **un material y una cantidad** en Fase 1 — simple. Multi-línea se puede añadir después sin romper el modelo.)

### `almacen_comentarios` (hilo de registro)
| campo | tipo | notas |
|---|---|---|
| id | uuid PK | |
| cuenta_id | uuid | |
| entidad_tipo | text | `espacio` \| `material` \| `transferencia` \| (futuro: `evento`) |
| entidad_id | uuid | |
| autor | text | quién escribe (Fase 1: la oficina; Fase 3: empleado) |
| texto | text | |
| foto_url | text? | opcional, en Storage (bucket `catalogo` u otro) |
| created_at | timestamptz | |

## Flujos de negocio

### Traspaso con "en tránsito"
1. **Crear traspaso** (oficina): material, cantidad, origen, destino. Validar `origen.disponible >= cantidad`.
   - Transacción: `origen.disponible -= n`, `origen.en_transito += n`; crear `almacen_transferencias` (estado `pendiente`); crear movimiento `salida` (origen, transferencia_id).
2. **Confirmar recepción** (en destino): cantidad recibida OK (y opcionalmente rotas en tránsito).
   - Transacción: `origen.en_transito -= n`; `destino.disponible += recibidas`; si hay rotas → movimiento `rotura` + motivo; crear movimiento `entrada`/`transferencia` (destino, transferencia_id); estado → `recibida` (o `parcial` si recibidas < enviadas).
3. **Cancelar** (antes de confirmar): devuelve `en_transito` a `disponible` en origen; estado `cancelada`.

Invariante: en ningún momento las cajas están "disponibles" en dos sitios; mientras viajan, viven en `en_transito` del origen.

### Ajuste de inventario (Fase 1, manual)
La oficina corrige el `disponible` de un material en un almacén a un valor contado. Genera movimiento `ajuste` con la diferencia y **motivo obligatorio**. (El conteo por empleados es Fase 3; aquí es un ajuste manual de oficina.) Usa `ajusteInventario` del módulo para calcular la diferencia.

### Rotura
Baja permanente de N unidades en un almacén. Movimiento `rotura` + **motivo obligatorio**. Coste = `costeDanos(n, material.coste_reposicion)` (del módulo) para el resumen contable.

### Alta de stock (entrada)
Recepción de compra o alta inicial: movimiento `entrada` a un almacén → `disponible += n`.

## Migración (asiento de apertura)

1. Crear `almacen_espacios` "Central" (tipo `central`) para el tenant DEMO.
2. Para cada material con `cantidad_disponible > 0`: crear fila `almacen_stock` (material, Central, disponible = cantidad_disponible actual) + movimiento `entrada` (motivo "Asiento de apertura Fase 1") en Central.
3. A partir de aquí, los contadores globales de `almacen_materiales` se leen como Σ `almacen_stock`.

Sin pérdida de datos: el stock actual queda íntegro en "Central".

## Pantallas (corporativas + responsive: 320 px / tablet / PC)

Marca Joaquín Jaén ya montada (`globals.css`: oro `--accent:#a5864f`, serif, logo). Se respetan las reglas globales del monorepo: **responsive** (nav → drawer en móvil; tablas → scroll horizontal o cards apiladas; modales 95 vw; táctil ≥44 px), **rendimiento** (secciones cerradas con montaje perezoso, paginación client 50 + «Ver más»), **dinero** en formato español `2.162,49€` vía `eur()`.

1. **Panel / inicio** — KPIs: valor total del inventario y **por almacén**, nº materiales bajo mínimo, **traspasos pendientes de confirmar**. Accesos rápidos.
2. **Almacenes** (`/almacenes`) — tarjetas por almacén (nombre, tipo, dirección, contacto). Crear/editar (ficha completa). Al entrar (`/almacenes/[id]`): ficha + stock de ese almacén + hilo de comentarios.
3. **Materiales** (`/materiales`, ampliar la existente) — añadir columna/desglose de **stock por almacén**. Ficha de material (`/materiales/[id]`): datos + stock por almacén + **Historial** (su libro de movimientos) + acciones **Mover** (traspaso) / **Ajustar** / **Rotura** / **Entrada** + comentarios.
4. **Transferencias** (`/transferencias`) — crear traspaso; lista de **pendientes** con botón "Confirmar recepción" (parcial + rotura). Historial de traspasos.
5. **Movimientos** (`/movimientos`) — feed global filtrable (por almacén, material, tipo, fecha). Auditoría.

## Componentes / dónde vive cada cosa

- **Dominio puro**: `@central/module-materiales` (reutilizar; añadir solo helpers puros nuevos si hace falta para el "en tránsito", con sus tests).
- **App**: rutas API (`/api/espacios`, `/api/movimientos`, `/api/transferencias`, `/api/comentarios`) + páginas server components + tablas client (buscador + paginación, patrón de `materiales-table.tsx`).
- **Prisma**: nuevos modelos en `apps/almacen/prisma/schema.prisma`; SQL de migración en `apps/almacen/prisma/sql/`.
- **Escrituras**: cada operación stock+movimiento en **una transacción Prisma** (`$transaction`).

## Errores y validaciones

- No permitir salida/traspaso/rotura de más de `disponible`.
- Confirmar recepción solo hasta lo que sigue `en_transito`.
- `motivo` obligatorio en `ajuste` y `rotura` (400 si falta).
- Cantidades enteras > 0.
- Todo scopeado a `cuenta_id` de la sesión (aislamiento multi-tenant).

## Tests

- **Unitarios (módulo puro)**: transiciones de "en tránsito" (crear/confirmar/parcial/cancelar), asiento de apertura, `ajusteInventario`, `costeDanos`, `valorStock` por almacén. En `packages/module-materiales/test/`.
- **Guardia**: mantener verde `pnpm test:guardia` (secretos) y typecheck.
- **Verificación funcional**: tras desplegar, ejercer el flujo real en el preview (crear almacén → traspasar → confirmar → ver historial + valor por almacén).

## Fuera de alcance (fases siguientes, documentadas)

- **Fase 2 — Eventos y alquileres:** atar salidas/devoluciones a un evento/alquiler (fecha, cliente, lugar); disponibilidad por fecha; roturas imputadas al evento; hoja de carga/packing list (enlaza con transporte); plantillas tipo "kit".
- **Fase 3 — Empleados e inventario:** la oficina crea empleados (usuario/contraseña, owner, tareas); inventario físico por empleado (conteo ciego, foto de incidencia) → genera ajustes; acceso móvil.
- **Fase 4 — Web pública:** catálogo público con disponibilidad real; eventos con prioridad que bloquean stock; auto-previsión de material por nº de personas (usando `@central/core-ai`, modelos gratis de OpenRouter) y descuento automático de cajas.
- **Transversal:** avisos por Telegram (`core-telegram`): stock mínimo, traspaso pendiente, evento sin material.
