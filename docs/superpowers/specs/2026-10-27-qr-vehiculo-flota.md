# QR por vehículo de flota: lectura pública acotada y escritura de empleados — diseño

> Fecha: 27/10/2026 · Estado: **propuesta para Alberto** (las preguntas del §8 llevan el default que se asume).
> App: `apps/asegura-portal`. Base: «Hoja de la nevera» (`app/hoja/[token]/page.tsx`, `lib/hojas.ts`,
> `lib/enlace-hoja.ts`, `packages/module-seguros-portal/src/hoja-qr.ts`) y «Flota de empresa» (`lib/flota.ts`,
> `src/flota.ts`, `portal_bien` con `cliente_id` + `matricula`). Reglas: aislamiento por CÓDIGO (rol sin BYPASSRLS),
> 404 nunca 403 hacia fuera de la empresa, tres estados (`null` = «no se sabe»).

## 0. Petición y decisiones cerradas

Una empresa cliente quiere un QR pegado en la guantera de cada vehículo: el empleado lo escanea y ve ITV, seguro y
recordatorios, y puede AÑADIR cosas (cambio de neumáticos, un recordatorio propio). La empresa decide qué se ve, pero
con pocos interruptores, **no por ramo**. Decidido por Alberto y que esta spec NO reabre:

1. QR por **vehículo** (`portal_bien`), no por póliza. Mismo mecanismo de token que la hoja.
2. Lectura en dos niveles: público (interruptores) e identificado (todo lo del vehículo).
3. Escritura solo identificado, por persona autorizada por la empresa, con el código de 6 dígitos existente.
4. Fases: F1 QR + lectura pública + etiqueta; F2 empleados + escritura; F3 (fuera de alcance) partes/fotos.

## 1. Hallazgos que condicionan el diseño (verificados leyendo el código)

- **La hoja va por selección de pólizas y su dueño es una IDENTIDAD** (`portal_hoja_qr.identidad_id NOT NULL`,
  `portal_hoja_qr_poliza`). Un vehículo de empresa cuelga de una FICHA (`portal_bien.cliente_id`, `identidad_id` NULL,
  CHECK `portal_bien_un_dueno`). No se puede reutilizar la tabla: se reutiliza el **patrón y las funciones puras**.
- **Los recordatorios son por identidad.** `portal_obligacion.identidad_id` es NOT NULL y `crearRecordatorio(identidadId, …)`
  filtra por ella. Un recordatorio que debe ver TODO el que escanea el coche no puede colgar de quien lo creó (si esa
  persona se da de baja, o se borra, el aviso desaparece — la FK es `onDelete: Cascade`). Hace falta tabla propia por vehículo.
- **`TIPOS_RECORDATORIO_PROPIO`** (`recordatorio-libre.ts`) = `itv, carnet, mantenimiento, revision_gas, libre`; el cron de
  vencimientos de `apps/asegura` lo importa para no duplicar avisos. Los tipos nuevos de vehículo NO entran ahí (§3.3).
- **El jefe de flota** es `portal_autorizacion` alcance `flota`, fuera de `ALCANCES` a propósito; exige ficha entera
  (`poliza_id` NULL), título de representación y doble aceptación. Es representación de la sociedad, no «un empleado con acceso».
- **Invitaciones** (`lib/invitaciones.ts`) solo conceden `ver`/`ver_economico`/`ninguno` sobre la cartera de quien invita: no
  sirven tal cual para dar acceso a un vehículo.
- **ITV**: `itvDeVehiculo`/`proximaItv` es un CÁLCULO desde `fecha_matriculacion` (`primera` vs `ciclo_estimado`); sin
  matriculación → «no lo sabemos». El semáforo público hereda esa honestidad.
- El portal no tiene hoy ninguna página pública con datos de vehículo; la de la hoja es la única referencia (`noindex`,
  token hasheado con `hashCanal`, `registrarUso`/`sellarUso`).

## 2. Modelo de datos (SQL esbozado, SIN ejecutar; aplicar en el mismo paso que el despliegue que lo usa)

Archivo propuesto: `prisma/sql/2026-10-XX_portal_vehiculo_qr.sql`. Toda tabla `portal_*`:
`REVOKE ALL … FROM crm_seguros` y GRANT mínimo al rol del portal (sin DELETE: anular y dar de baja son UPDATE).

```sql
-- 1. El QR del vehículo (una fila por etiqueta impresa)
create table seguros.portal_vehiculo_qr (
  id uuid primary key default gen_random_uuid(),
  bien_id uuid not null references seguros.portal_bien(id),   -- sin CASCADE: el rol no borra vehículos
  token_hash text not null unique,                             -- hashCanal(token), 64 hex
  creado_por_identidad_id uuid references seguros.portal_identidad(id) on delete set null,
  creado_en timestamptz not null default now(),
  anulado_en timestamptz, anulado_por_identidad_id uuid references seguros.portal_identidad(id) on delete set null,
  ultimo_uso_en timestamptz
);
create index on seguros.portal_vehiculo_qr (bien_id, creado_en);

-- 2. Qué ve el PÚBLICO. Una fila por empresa (defecto) y, opcional, una por vehículo (excepción).
create table seguros.portal_vehiculo_publico (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null,                  -- empresa
  bien_id uuid references seguros.portal_bien(id),   -- NULL = defecto de la empresa
  datos_carretera boolean not null default true,
  estado_al_dia   boolean not null default true,
  recordatorios_pendientes boolean not null default false,
  actualizado_por_identidad_id uuid references seguros.portal_identidad(id) on delete set null,
  actualizado_en timestamptz not null default now()
);
create unique index on seguros.portal_vehiculo_publico (cliente_id) where bien_id is null;
create unique index on seguros.portal_vehiculo_publico (bien_id) where bien_id is not null;

-- 3. Quién (empleado) puede abrir y escribir. NO es portal_autorizacion (§3.1).
create table seguros.portal_vehiculo_acceso (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null,                  -- empresa que concede
  identidad_id uuid not null references seguros.portal_identidad(id) on delete cascade,
  bien_id uuid references seguros.portal_bien(id),   -- NULL = toda la flota (incluye futuros)
  concedido_por_identidad_id uuid references seguros.portal_identidad(id) on delete set null,
  concedido_en timestamptz not null default now(),
  aceptado_en timestamptz,                   -- el empleado acepta al entrar con su código
  baja_en timestamptz, baja_por_identidad_id uuid references seguros.portal_identidad(id) on delete set null
);
create unique index on seguros.portal_vehiculo_acceso (identidad_id, cliente_id, coalesce(bien_id, '00000000-0000-0000-0000-000000000000'))
  where baja_en is null;

-- 4. Recordatorios y hechos DEL VEHÍCULO (visibles a todo autorizado; autor y fecha obligatorios)
create table seguros.portal_vehiculo_nota (
  id uuid primary key default gen_random_uuid(),
  bien_id uuid not null references seguros.portal_bien(id),
  clase text not null check (clase in ('recordatorio','hecho')),
  tipo text not null check (tipo in ('neumaticos','revision','kilometraje','otro')),
  titulo text not null check (char_length(titulo) between 1 and 120),
  fecha_evento date,                         -- recordatorio: cuándo toca; hecho: cuándo ocurrió
  km integer check (km is null or km between 0 and 3000000),
  cerrado_en timestamptz, cerrado_por_identidad_id uuid references seguros.portal_identidad(id) on delete set null,
  autor_identidad_id uuid references seguros.portal_identidad(id) on delete set null,
  autor_nombre text not null,                -- copia del nombre al escribir: sobrevive a la baja/borrado del autor
  creado_en timestamptz not null default now(),
  check ((clase = 'recordatorio' and fecha_evento is not null) or clase = 'hecho')
);
create index on seguros.portal_vehiculo_nota (bien_id, creado_en desc);
```

`schema.prisma`: primero el `GRANT`, luego el modelo (si no, 42501). `cliente_id` de las tablas 2 y 3 se **copia** de
`portal_bien.cliente_id` en el servidor, nunca viene del cuerpo.

## 3. Decisiones de diseño

### 3.1 Acceso del empleado: tabla propia, NO alcance nuevo de `portal_autorizacion`
Se descarta `flota_empleado`/`vehiculo` como alcance porque: (a) `portal_autorizacion.poliza_id` ancla en PÓLIZA y su FK
compuesta apunta a `polizas(cliente_id, id)`; un acotado a vehículo exigiría una columna `bien_id` y reescribir los lectores;
(b) el alcance `flota` exige título de representación y ficha entera — un conductor no representa a la sociedad;
(c) mezclar un conductor en esa tabla arriesga que algún lector viejo lo trate como acceso a la bóveda de la empresa
(el motivo por el que `flota` ya está fuera de `ALCANCES`); (d) la baja inmediata y por vehículo es el caso de uso, no la
«revisión anual» de una autorización. Se **reutiliza** el criterio de alcance (`NULL` = todo, también futuro, y la
pantalla lo dice) y el doble paso (concede la empresa, acepta el empleado).
**Quién concede**: dueño y jefe de flota (`accesosFlota()` → papel). El empleado nunca concede a un tercero.
**Alcance por defecto al invitar: vehículos concretos**; «toda la flota» es una opción explícita con aviso.

### 3.2 Lo público no tiene sesión: la allow-list es de SALIDA
La página pública recibe un objeto `VistaPublicaVehiculo` construido por una función **pura** que solo copia campos de una
allow-list (nunca «quita» campos de un objeto grande). Los interruptores solo ACTIVAN trozos de la allow-list; ningún
interruptor puede hacer salir algo fuera de ella. Mal configurado o corrupto en BD → se aplica el defecto.

| Interruptor | Defecto | Contenido público |
|---|---|---|
| Datos para carretera | ON | compañía, nº de póliza, teléfono de asistencia (`canal-compania.ts`, catálogo único), «qué hacer en un accidente»; matrícula |
| Estado al día | ON | semáforo ITV y seguro: `al_dia` / `vence_pronto` / `vencido` / `no_sabemos`. **Sin fechas exactas** |
| Recordatorios pendientes | OFF | solo `tipo` + «pendiente»/«vencido», sin título libre ni nombres |

**Nunca públicos** (lista cerrada en el módulo puro, `CAMPOS_PROHIBIDOS_EN_VEHICULO_PUBLICO`): prima, recibos, DNI/NIF,
dirección, datos del titular persona física, documentos, fechas exactas, autor de las notas, km. El nombre de la empresa
solo si es persona jurídica. Cepo en §7.

### 3.3 Tipos nuevos y hechos van en su tabla, no en `portal_obligacion`
`portal_vehiculo_nota` es del VEHÍCULO (§1). Los tipos `neumaticos/revision/kilometraje/otro` no tocan
`TIPOS_RECORDATORIO_PROPIO`, así el cron de vencimientos no los confunde con avisos de póliza. Avisos (push/correo) de
estas notas: **fuera de F2**; se muestran en pantalla y en el calendario de la empresa solo si se pide (§8-5).

### 3.4 Sesión del empleado: una vez por móvil
Escaneo → `/v/<token>` sin sesión ve lo público + botón «Entrar para ver más». Con la cookie `asegura_portal_session`
(30 días) y acceso vigente, el mismo escaneo abre la vista identificada. Sin cookie válida o con baja → vuelve a lo público
(nunca un 403 que revele que el vehículo existe). La baja se comprueba **en cada petición** (no se cachea en la cookie).

## 4. Qué se reutiliza y qué es nuevo

| Reutiliza tal cual | Se adapta | Nuevo |
|---|---|---|
| `hashCanal` para el token; `BYTES_TOKEN_HOJA`; `normalizarTokenHoja` | `enlaceDeHoja` → `enlaceDeVehiculo` (ruta `/v/<token>`, https o `null` + 503 sin escribir fila) | `portal_vehiculo_*` (§2) |
| `qrcode` + estilos `@media print` / allow-list `.hoja > *` | Etiqueta imprimible (más pequeña, A6/pegatina) | `src/vehiculo-publico.ts` (allow-list pura) |
| `accesosFlota`, `flotaDeEmpresa`, `vehiculosDeEmpresa` (cruce matrícula↔póliza) | `registrarUso` por escaneo | `src/vehiculo-acceso.ts` (reglas puras de acceso) |
| `itvDeVehiculo`/`proximaItv`; `canalDeCompania` | `puertaDeSesion('flota', …)` | `lib/vehiculo-qr.ts`, `lib/vehiculo-nota.ts` |
| Login por código, invitación (canal, hash) | Texto de consentimiento del empleado | Pantallas y rutas del §5 |

## 5. Rutas

- **Pública** `GET /v/[token]` (`app/v/[token]/page.tsx`): `force-dynamic`, `noindex`, `Referrer-Policy: no-referrer`,
  `Cache-Control: no-store`. Única consulta sin identidad (`vehiculoPorToken`, normaliza el token antes de la BD). Anulado,
  inexistente o vehículo dado de baja → **404 idéntico**.
- **Empresa** (dueño/jefe, `accesosFlota`): `POST /api/flota/vehiculo/[bienId]/qr` (crea; devuelve token UNA vez),
  `DELETE …/qr/[id]` (anula = UPDATE), `PUT …/publico` (interruptores, por vehículo o `bienId=null` para el defecto),
  `POST /api/flota/acceso` (concede a empleado: canal + `bienIds|todos`), `POST /api/flota/acceso/[id]/baja`.
- **Empleado** (acceso vigente comprobado en cada llamada): `GET /api/vehiculo/[bienId]`,
  `POST /api/vehiculo/[bienId]/notas`, `POST /api/vehiculo/[bienId]/notas/[id]/cerrar`.
- Todas leen la identidad de la cookie; `bienId` y `empresaId` se **buscan dentro** de lo que la identidad puede ver
  (patrón `flotaDeEmpresa`), nunca se consulta por el id de la URL.

## 6. Pantallas (todas ≥320 px; botones ≥44 px; modales 95 vw)

- **Etiqueta (F1)**: en `/flota`, ficha del vehículo → «QR del vehículo»: crear, ver estado, anular, «reimprimir» (= token
  nuevo + el viejo queda anulado, aviso: «el papel pegado deja de valer»). Vista de impresión: QR grande, matrícula, marca
  Grupo ASegura, sin ningún dato. Impresión en lote por empresa (una página por vehículo).
- **Público (F1)**: una columna, tarjetas apiladas: matrícula; «Datos para carretera» (teléfono de asistencia como `tel:`
  grande); «Estado al día» (semáforo con texto, no solo color); «Entrar para ver más».
- **Interruptores (F1)**: en la ficha de empresa, 3 casillas con el texto de lo que revelan + vista previa «así lo ve quien
  escanee». Defecto de empresa + excepción por vehículo.
- **Equipo (F2)**: lista de empleados con vehículos asignados, «Dar de baja» con confirmación; alta por correo/móvil.
- **Vehículo identificado (F2)**: ITV con fecha y fiabilidad (`primera`/`ciclo_estimado`), seguro (compañía, vencimiento),
  notas ordenadas por fecha con autor, botón fijo «Añadir» (recordatorio / hecho), tipos neumáticos, revisión/aceite,
  kilometraje, otro. Listas largas: ~50 + «Ver más».

## 7. Guardianes y tests exigidos (todos vistos en rojo antes de darlos por buenos)

1. `vehiculo-publico`: construir la vista con TODOS los interruptores a `true` y con un objeto de entrada lleno de campos
   prohibidos (prima, NIF, dirección, fechas exactas, autor) → ninguno aparece en la salida ni en el HTML renderizado,
   aunque el interruptor esté "mal" (valor no booleano, fila ausente, columna extra).
2. Token anulado → 404; token inexistente → 404 con el MISMO cuerpo y tiempo; token mal formado → 404 sin tocar BD.
3. Empleado con `baja_en` → 403 en `/api/vehiculo/*` (y la página vuelve a lo público) **sin reimprimir**.
4. Aislamiento: empleado de la empresa A pidiendo `bienId` de B → 404 (no 403, no oráculo); misma prueba con id de otro
   `cliente_id` en el cuerpo (se ignora).
5. `null` = «no se sabe»: sin `fecha_matriculacion` el semáforo ITV es `no_sabemos`, nunca `al_dia`; póliza no encontrada
   ≠ «sin seguro»; sin dato de teléfono → «pídenoslo», no un número inventado.
6. Cepo de aislamiento: `test/regression-portal-aislamiento.test.ts` → `vehiculoPorToken` se añade a EXENTOS como decisión
   explícita (única sin identidad). `regression-portal-sin-crm` y GRANTs sin DELETE para las 4 tablas.
7. Cepo de rutas: toda ruta nueva de empleado pasa por una única función `accesoAVehiculo(identidadId, bienId)`.
8. Autor y fecha no nulos en `portal_vehiculo_nota` (CHECK probado mordiendo); la baja del autor no borra su nota.

## 8. Riesgos y preguntas abiertas

**Riesgos**: (1) QR fotografiable: lo público es lo mismo que ya ve cualquiera que lea la matrícula del coche + datos de
siniestro; por eso el defecto de «recordatorios» es OFF. (2) Teléfono de asistencia: sale del catálogo único
(`telefonos-companias.ts`); si la compañía no consta, no se muestra nada. (3) Móvil compartido/perdido: la sesión dura 30 días
→ la baja es inmediata en servidor, y el empleado puede cerrar sesión desde el vehículo. (4) Matrícula cambia / vehículo
vendido: el QR sigue apuntando a `portal_bien`; al pasar el bien a baja, el QR da 404. (5) Notas libres: texto con
datos personales; se limita a 120 caracteres y no es público nunca. (6) Reimprimir sin acceso a la guantera: aviso claro.

**Preguntas** (default asumido entre paréntesis):
1. ¿Qué empresa es el piloto y cuántos vehículos? (flota pequeña, <50, para respetar el pliegue de `/flota`).
2. ¿Los empleados tienen correo corporativo o solo móvil? (código por el canal que haya; el canal es un puerto).
3. ¿Quién es el jefe de flota hoy en esa empresa, ya aceptó su nombramiento? (sin él, solo el dueño concede).
4. ¿«Datos para carretera» debe llevar el nombre de la empresa? (sí, solo si es jurídica).
5. ¿Las notas con fecha deben avisar por push/correo? (no en F2; solo pantalla).
6. ¿Una baja de empleado también borra sus notas? (no: quedan con autor y fecha como histórico de la empresa).
7. ¿Etiqueta física: papel, pegatina o PVC? (A6 con QR ≥ 3 cm; el enlace corto `/v/<64 hex>` ya es el más corto posible).

## 9. Fases

- **F1**: tablas 1-2, `/v/[token]`, interruptores, etiqueta + impresión en lote, guardianes 1, 2, 5, 6. Sin empleados.
- **F2**: tablas 3-4, equipo, vista identificada, notas, guardianes 3, 4, 7, 8.
- **F3 (fuera de alcance)**: partes de accidente con fotos desde el QR, avisos por push/correo de las notas, cierre de ITV
  con foto de la tarjeta.
