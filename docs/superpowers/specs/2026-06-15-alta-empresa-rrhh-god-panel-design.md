# Alta de empresa iarrhh desde el god-panel de plataforma — Diseño

> Spec de diseño. Fecha: 2026-06-15. Apps: `apps/rrhh` (puerto operador) + `apps/plataforma` (UI operador).
> Aprobado por Alberto: modelo **operador-only** (sin alta pública), unificado en el god-panel.

## Objetivo

Que el operador (Alberto, superadmin) dé de alta una **empresa cliente de iarrhh** con su
**usuario responsable** desde el panel de operador de plataforma (`/operador/clientes`). Ese
responsable luego entra en iarrhh y crea a sus propios empleados. No hay página de registro
pública.

## Arquitectura: puerto HTTP (patrón ia-rest)

Plataforma **no escribe** en el schema `rrhh` de la BD compartida (acoplaría roles de BD entre
apps y rompería la segmentación). Se replica el patrón ya usado con ia-rest:

```
[plataforma god-panel]  --HTTP Bearer RRHH_OPERADOR_SECRET-->  [rrhh /api/operador/empresas]  --SQL-->  schema rrhh
```

- **rrhh** posee la escritura en su propio schema; expone un puerto de operador.
- **plataforma** consume ese puerto vía un adaptador nuevo `lib/adapters/rrhh.ts`, igual que
  `iarest.ts`.

### Secreto compartido
`RRHH_OPERADOR_SECRET` es un secreto **propio de iarrhh**, distinto del `OPERADOR_SHARED_SECRET`
que usa el puerto de ia-rest (no se reutiliza, para no acoplar ambas integraciones). Su **valor**
se fija en el proyecto Vercel `central-rrhh` y en `plataforma`. Plataforma añade además
`RRHH_URL` (URL de producción de central-rrhh).

## Parte A — Puerto de operador en `apps/rrhh`

### Autenticación
Helper `lib/operador.ts`: `function operadorAutorizado(req): boolean` — comprueba
`Authorization: Bearer <RRHH_OPERADOR_SECRET>` contra `process.env.RRHH_OPERADOR_SECRET`.
Si la env no está definida, devuelve `false` (puerto cerrado por defecto).

### Endpoint `app/api/operador/empresas/route.ts`
- **GET** → lista de empresas: `SELECT e.id, e.nombre, e.creada_at, COUNT(emp.id) AS num_empleados
  FROM rrhh.empresas e LEFT JOIN rrhh.empleados emp ON emp.empresa_id = e.id GROUP BY e.id`.
  Responde `{ empresas: [{ id, nombre, creada_at, num_empleados, responsable_email }] }`
  (el email del primer/único responsable se obtiene con un join o subconsulta a `usuarios_rrhh`).
- **POST** `{ empresa, color?, responsable_nombre, responsable_email, password }` → crea en una
  transacción `rrhh.empresas` (nombre, marca_color) + `rrhh.usuarios_rrhh`
  (empresa_id, email en minúsculas, pass_hash bcrypt vía `hashPassword`, nombre). Valida campos
  no vacíos y `password.length >= 8`. Email duplicado (constraint unique) → 409 con mensaje claro.
  Responde `{ id, responsable_email }`.
- Sin Bearer válido → 401. Reutiliza el `prisma` existente (rol `rrhh_app`, BYPASSRLS).

### Env nueva en rrhh
`RRHH_OPERADOR_SECRET` (en el proyecto Vercel `central-rrhh`).

## Parte B — Adaptador + UI en `apps/plataforma`

### `lib/adapters/types.ts`
- Añadir `'rrhh'` al tipo `Vertical`.
- Extender `NuevoCliente` con campos opcionales para rrhh:
  `responsableNombre?: string` y `color?: string` (el `nombre` del contrato = nombre de empresa;
  `email`/`password` = credenciales del responsable).

### `lib/adapters/rrhh.ts` (nuevo, espejo de `iarest.ts`)
- `base()` = `process.env.RRHH_URL`, `secret()` = `process.env.RRHH_OPERADOR_SECRET`.
- `port(path, init)` idéntico al de iarest (Bearer, timeout 8s, cache no-store).
- `vertical: 'rrhh'`, `etiqueta: 'RR.HH. (iarrhh)'`, `puedeCrear: true`.
- `listar()`: GET `/api/operador/empresas` → mapea a `ClienteSaaS` con
  `puedeBloquear: false` (las empresas rrhh no tienen estado activo/bloqueado en el modelo) y
  métricas `[{ Empleados: N }, { Responsable: email }]`. Degrada a un `info(...)` si falta config
  o el puerto no responde (igual que iarest).
- `crear({ nombre, email, password, responsableNombre, color })`: POST `/api/operador/empresas`
  con `{ empresa: nombre, color, responsable_nombre: responsableNombre, responsable_email: email,
  password }`. Devuelve `{ id }`.
- `ficha(id)`: detalle a partir de `listar()` (alta + nº empleados + responsable).
- `setActivo()`: devuelve `false` (no soportado; `puedeBloquear` es false, así que la UI no lo
  ofrece).

### `lib/adapters/index.ts`
- Importar y registrar `rrhh: rrhhAdapter` en `ADAPTERS`.

### `app/api/admin/clientes/route.ts`
- En el POST, pasar también `responsableNombre: body.responsableNombre` y `color: body.color`
  a `adapter.crear({...})` (una línea; el resto del flujo ya existe).

### `app/(usuario)/operador/clientes/ClientesClient.tsx`
- Añadir `'rrhh'` al tipo local `Cliente['vertical']` y a `VERT`
  (`rrhh: { label: 'RR.HH. · iarrhh', icon: '👥' }`).
- Añadir `'rrhh'` a la lista `verticales` (para que se pinte su sección) y a `nuevo` (estado del
  formulario) los campos `responsableNombre` y `color`.
- En el modal "Nuevo cliente": añadir la opción `<option value="rrhh">RR.HH. · iarrhh</option>`
  y, cuando `nuevo.vertical === 'rrhh'`, mostrar campos: **Nombre** (ya existe, = empresa),
  **Responsable (nombre)**, **Email del responsable**, **Contraseña inicial** (minLength 8),
  **Color de marca** (opcional). Tras crear con éxito, mostrar email + contraseña para
  entregárselos al cliente (un aviso simple en el modal/post-creación).
- KPI "Verticales": pasa de `'3'` a `'4'`.

### Envs nuevas en plataforma
`RRHH_URL` (URL producción de central-rrhh) + `RRHH_OPERADOR_SECRET` (mismo valor que en rrhh).

## Qué NO toca

- Login de responsables de iarrhh, portal del empleado, ni ninguna lógica existente de rrhh.
- Jerarquía Cuenta→Sociedad→Negocio ni los adaptadores ialimp/sivra/iarest de plataforma.
- Auth del god-panel (`getAdmin`/`plataforma_admin`) — se reutiliza tal cual.

## Verificación

- **rrhh build:** `cd apps/rrhh && npm run build` verde (con envs dummy para la recolección de
  datos, como en el rediseño).
- **plataforma build:** según su gestor (`pnpm`); compila sin errores de tipos (el `Vertical`
  ampliado es exhaustivo en `ADAPTERS`).
- **Funcional (producción):** desde `/operador/clientes`, crear empresa rrhh de prueba →
  comprobar que aparece en la sección RR.HH. con su nº de empleados → entrar en iarrhh
  `/login` con las credenciales creadas → llega a `/admin/empleados`.
- **Sin Bearer:** `curl` a `/api/operador/empresas` sin el secreto → 401.

## Seguridad / riesgos

- `RRHH_OPERADOR_SECRET` solo en envs, nunca en repo. El puerto se cierra si la env falta.
- Email único global en `usuarios_rrhh` evita duplicados; el POST devuelve 409 legible.
- La contraseña inicial la fija el operador y se muestra una vez para entregársela al cliente
  (el cliente puede cambiarla más adelante — fuera de alcance de este spec).
- Timeout de 8s en el puerto: si rrhh no responde, el panel degrada la sección sin colgarse.
