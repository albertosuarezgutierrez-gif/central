# 🎛️ Diseño — Panel único de control (god-panel del operador)

> **Estado: F1 IMPLEMENTADA** (login + listado unificado de las 3 verticales + bloquear/liberar
> + vista 360). Pedido por Alberto: un solo panel suyo que controla **todo el programa** (todas
> las verticales, clientes y módulos), unificando los superadmin sueltos de cada app.
> Regla de oro: diseño antes que código; no romper producción.
> Ruta: `apps/plataforma/app/admin`. Falta: F2 módulos por cliente, F3 crear, F5 unificación.
> **Envs Vercel a definir:** `OPERADOR_SHARED_SECRET` (mismo valor en proyectos `plataforma` e `ia-rest`).

## 1. Contexto y objetivo

Hoy el control está **fragmentado**: `/superadmin` en ialimp (ve solo empresas de limpieza,
casi de solo lectura) y `owner-panel` en ia-rest (otra isla, otra BD). Al unificar la casa de
marcas, el operador (Alberto) necesita **un único centro de mando** desde el que gobernar
**todos los clientes de todas las verticales**: ver, **bloquear/liberar, crear**, y
**encender/apagar módulos** por cliente, con vista 360 y KPIs del grupo.

**Dónde vive:** `apps/plataforma` (la matriz, nivel Cuenta→Sociedad→Negocio sobre las verticales).

## 2. Principio de datos (clave): control total SIN fusionar BD

El panel **agrega por adaptadores**, no por fusión física de Postgres:
- **BD compartida** (`wswbehlcuxqxyinousql`: ialimp + sivra + plataforma) → lectura directa.
- **ia-rest** (BD aparte `efncqyvhniaxsirhdxaa`) → por **puerto** (endpoint/Edge `owner-panel`).

Interfaz común `VerticalAdapter` (un fichero por vertical en `apps/plataforma/lib/adapters/`):
```ts
interface VerticalAdapter {
  vertical: 'ialimp' | 'sivra' | 'iarest'
  listClients(): Promise<ClienteSaaS[]>          // id, nombre, email, activa, métricas
  getClient360(id): Promise<Cliente360>          // detalle + actividad
  setActive(id, activa): Promise<void>           // bloquear/liberar
  createClient(input): Promise<{id}>             // alta
  getModulos(id): Promise<string[]>; setModulos(id, mods): Promise<void>
}
```
Patrón ya probado: `apps/plataforma/lib/financiero.ts` ya agrega ialimp+sivra y marca ia-rest
como "BD separada" → se generaliza a este puerto.

## 3. Identidad y seguridad

- **Rol superadmin** en plataforma (hoy no hay roles). Reutilizar la tabla **`superadmins`**
  que YA existe en la BD compartida (Alberto ya está, activo) → **una sola identidad de operador**.
- Login del panel valida contra `superadmins` (bcrypt) y emite `plataforma_session` con
  `rol:'superadmin'`. Reutiliza `apps/plataforma/lib/auth.ts` (JWT jose) + `session.ts`.
- `middleware.ts`: gatear `/admin/**` y `/api/admin/**` a `rol:'superadmin'`.
- **Frontera multi-tenant:** las consultas cross-cliente solo las puede hacer el superadmin;
  cada acción registra auditoría (quién/qué/cuándo). Sin secretos en repo.

## 4. Modelo de módulos por cliente (lo que hoy no existe)

Hoy los módulos son **por usuario** en ialimp (`usuarios_empresa.modulos`) y no existen en
sivra/ia-rest. Se añade el nivel **por cliente/empresa**:
- Tabla nueva **`tenant_modulos`** (BD compartida): `(vertical, ref_externa, modulo, activo)`.
- El operador enciende/apaga módulos por cliente desde el panel → cada vertical lo respeta en su
  middleware (empezando por ialimp, que ya tiene `MODULO_MAP`).
- Catálogo de módulos (unificado): `contabilidad, facturacion, rrhh, stock, clientes, agenda,
  concursos, pricing, …`.

## 5. Alcance v1 (lo que marcaste: 360 + módulos + crear + bloquear)

Pantalla `/admin` en plataforma (gateada a superadmin), con:
1. **Listado unificado de clientes** de ialimp + sivra (BD compartida) — nombre, vertical,
   estado, métricas. (ia-rest entra en F-siguiente por puerto.)
2. **Bloquear / liberar:** toggle `empresas.activa` (ya bloquea el login de ialimp; se extiende).
3. **Vista 360:** ficha por cliente (qué vertical/negocios usa, actividad, estado, módulos).
4. **Módulos por cliente:** matriz de toggles → `tenant_modulos` + gateo real en ialimp.
5. **Crear cliente:** alta de empresa (con owner inicial) desde el panel.

## 6. Fases

- **F1 — Cimiento:** auth superadmin en plataforma + shell `/admin` + listado (ialimp+sivra) +
  bloquear/liberar + vista 360. (Adaptadores de BD compartida.)
- **F2 — Módulos por cliente:** tabla `tenant_modulos` + matriz de toggles + gateo en ialimp.
- **F3 — Crear cliente** desde el panel (alta empresa + owner).
- **F4 — ia-rest por puerto:** adaptador `iarest` contra su Edge `owner-panel` → entra al control.
- **F5 — Unificación final:** retirar `/superadmin` de ialimp y `owner-panel` de ia-rest cuando el
  panel central los cubra (un solo sitio).

## 7. Ficheros (nuevos / a tocar) — todo en `apps/plataforma` salvo gateo de módulos

**Nuevos:** `lib/adapters/{tipos,ialimp,sivra,iarest}.ts`, `lib/superadmin-auth.ts`,
`app/admin/page.tsx` (+ subvistas), `app/api/admin/clientes/route.ts` + `[id]/route.ts`
(GET 360, PATCH activa/modulos, POST crear), migración `tenant_modulos` (BD compartida).
**A tocar:** `apps/plataforma/middleware.ts` (gate superadmin), `lib/auth.ts`/`session.ts` (rol).
**Gateo de módulos (F2):** `apps/ialimp/middleware.ts` lee `tenant_modulos` de la empresa.

**Reutiliza:** `apps/plataforma/lib/financiero.ts` (patrón de agregación), `superadmins` (identidad),
`empresas.activa` (bloqueo ya enforced en login ialimp), `MODULO_MAP` de ialimp.

## 8. Verificación

- Login superadmin en plataforma (preview) → ve clientes de ialimp+sivra.
- Bloquear una empresa de prueba → su login en ialimp devuelve 403 (ya implementado).
- Encender/apagar un módulo → la ruta correspondiente de ialimp respeta el gateo.
- Crear cliente → aparece en el listado y puede loguear.
- Previews verdes de las 4 apps + producción sin tocar a Vanessa.

## 9. Riesgos / guardarraíles

- Producción en vivo (Vanessa) → cambios aditivos, preview verde antes de merge, Instant Rollback.
- Frontera RGPD: cross-tenant solo superadmin; auditoría de acciones.
- ia-rest (BD aparte) NO se fusiona: se integra por puerto (F4).
