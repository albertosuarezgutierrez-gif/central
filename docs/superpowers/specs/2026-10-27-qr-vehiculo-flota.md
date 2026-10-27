# QR por vehículo (empresa o particular): lectura pública acotada y escritura de personas autorizadas — diseño

> Fecha: 27/10/2026 · Estado: **propuesta para Alberto** (las preguntas del §8 llevan el default que se asume).
> App: `apps/asegura-portal`. Base: «Hoja de la nevera» (`app/hoja/[token]/page.tsx`, `lib/hojas.ts`,
> `lib/enlace-hoja.ts`, `packages/module-seguros-portal/src/hoja-qr.ts`) y «Flota de empresa» (`lib/flota.ts`,
> `src/flota.ts`, `portal_bien` con dueño XOR: `identidad_id` | `cliente_id` + `matricula`). Reglas: aislamiento por CÓDIGO
> (rol sin BYPASSRLS), 404 nunca 403 hacia fuera del dueño, tres estados (`null` = «no se sabe»).

## 0. Petición y decisiones cerradas

Un cliente, **empresa o particular**, quiere un QR pegado en la guantera (o bajo el asiento de la moto) de cada vehículo: quien lo
escanea ve ITV, seguro y recordatorios, y puede AÑADIR cosas (neumáticos, un recordatorio propio). El **dueño del vehículo** decide
qué se ve, con pocos interruptores, **no por ramo**, y autoriza a otras personas: en la empresa, conductores y empleados; en el
particular, la pareja o el hijo que conduce. La empresa con flota es el **caso piloto (Global2)**, no el único: el diseño sirve a los
dos desde la F1. Decidido por Alberto y que esta spec NO reabre:

1. QR por **vehículo** (`portal_bien`, `tipo='vehiculo'`, coche o moto), no por póliza. Mismo mecanismo de token que la hoja.
2. Lectura en dos niveles: público (interruptores) e identificado (todo lo del vehículo).
3. Escritura solo identificado, por persona autorizada por el dueño, con el código de 6 dígitos existente.
4. Fases: F1 QR + lectura pública + etiqueta (empresa y particular); F2 personas autorizadas + escritura; F3 (fuera de alcance) partes/fotos.

## 1. Hallazgos que condicionan el diseño (verificados leyendo el código)

- **La hoja va por selección de pólizas y su dueño es una IDENTIDAD** (`portal_hoja_qr.identidad_id NOT NULL`): no se reutiliza la
  tabla, sí el **patrón y las funciones puras**.
- **`portal_bien` ya admite los dos dueños**: `identidad_id` XOR `cliente_id` (CHECK `portal_bien_un_dueno`,
  `prisma/sql/2026-10-05_portal_flota_empresa.sql`). Pero el CHECK `portal_bien_empresa_vehiculo` y el índice único
  `(cliente_id, matricula)` solo cubren la empresa; para persona no hay formato ni unicidad de matrícula.
- **Hoy el particular NO tiene «ficha de vehículo».** Solo la flota crea `portal_bien` `vehiculo` (`lib/flota.ts`,
  `guardarMatriculacion`). El particular ve coches y motos como PÓLIZAS en `/boveda` (`FilaPoliza`/`FilaDeclarada`/`PolizaVista`;
  matrícula y `fechaMatriculacion` viven en `PortalPolizaDeclarada` y en la cartera) y el aviso de ITV de la campana los lee de ahí
  (`lib/vehiculos-aviso.ts`). Sin `portal_bien` no hay a qué colgar el QR: se **crea bajo demanda** (§3.5).
- **Los recordatorios son por identidad** (`portal_obligacion.identidad_id` NOT NULL, FK en cascada): un aviso que debe ver todo el
  que escanea el coche no puede colgar de quien lo creó. Hace falta tabla propia por vehículo.
- **El jefe de flota** es `portal_autorizacion` alcance `flota` (fuera de `ALCANCES` a propósito; ficha entera, título, doble
  aceptación). Solo existe en empresa. **`accesosFlota(identidadId)`** (`lib/flota.ts`) da empresa → papel (dueño | jefe) y exige
  sesión = `identidadId`: es la frontera de la empresa; la del particular es `portal_bien.identidad_id = sesión`.
- **ITV**: `itvDeVehiculo`/`proximaItv` es un CÁLCULO desde `fecha_matriculacion` (`primera` vs `ciclo_estimado`); sin ella →
  «no lo sabemos». El semáforo público hereda esa honestidad.

## 2. Modelo de datos (SQL esbozado, SIN ejecutar; aplicar en el mismo paso que el despliegue que lo usa)

Archivo propuesto: `prisma/sql/2026-10-XX_portal_vehiculo_qr.sql`. Toda tabla `portal_*`: `REVOKE ALL … FROM crm_seguros` y GRANT
mínimo al rol del portal (sin DELETE: anular y dar de baja son UPDATE). **Patrón de dueño** en las tablas 2-3: `dueno_identidad_id`
(persona) XOR `cliente_id` (empresa), como `portal_bien_un_dueno`; ambas se **copian de `portal_bien` en el servidor**, nunca del cuerpo.

```sql
-- 0. Completar portal_bien para el particular (aditivo; mismo patrón que el índice de la empresa)
alter table seguros.portal_bien add constraint portal_bien_persona_vehiculo check (
  identidad_id is null or tipo <> 'vehiculo' or matricula is null or matricula ~ '^[A-Z0-9]{4,}$');
create unique index idx_portal_bien_persona_matricula on seguros.portal_bien (identidad_id, matricula)
  where identidad_id is not null and tipo = 'vehiculo' and matricula is not null;
-- 1. El QR del vehículo (una fila por etiqueta impresa). Sirve igual para bien de persona o de empresa.
create table seguros.portal_vehiculo_qr (
  id uuid primary key default gen_random_uuid(),
  bien_id uuid not null references seguros.portal_bien(id) on delete cascade,  -- §3.6: la supresión de una persona arrastra su QR
  token_hash text not null unique,                             -- hashCanal(token), 64 hex
  creado_por_identidad_id uuid references seguros.portal_identidad(id) on delete set null,
  creado_en timestamptz not null default now(), ultimo_uso_en timestamptz,
  anulado_en timestamptz, anulado_por_identidad_id uuid references seguros.portal_identidad(id) on delete set null
);
create index on seguros.portal_vehiculo_qr (bien_id, creado_en);
-- 2. Qué ve el PÚBLICO. Una fila por DUEÑO (defecto) y, opcional, una por vehículo (excepción).
create table seguros.portal_vehiculo_publico (
  id uuid primary key default gen_random_uuid(),
  dueno_identidad_id uuid references seguros.portal_identidad(id) on delete cascade,  -- particular
  cliente_id uuid references seguros.clientes(id),                                    -- empresa
  bien_id uuid references seguros.portal_bien(id) on delete cascade,                  -- NULL = defecto del dueño
  datos_carretera boolean not null default true,
  estado_al_dia   boolean not null default true,
  recordatorios_pendientes boolean not null default false,
  actualizado_por_identidad_id uuid references seguros.portal_identidad(id) on delete set null,
  actualizado_en timestamptz not null default now(),
  constraint portal_vehiculo_publico_un_dueno check (num_nonnulls(dueno_identidad_id, cliente_id) = 1)
);
create unique index on seguros.portal_vehiculo_publico (dueno_identidad_id) where bien_id is null and dueno_identidad_id is not null;
create unique index on seguros.portal_vehiculo_publico (cliente_id)         where bien_id is null and cliente_id is not null;
create unique index on seguros.portal_vehiculo_publico (bien_id)            where bien_id is not null;
-- 3. Quién (persona autorizada) puede abrir y escribir. NO es portal_autorizacion (§3.1).
create table seguros.portal_vehiculo_acceso (
  id uuid primary key default gen_random_uuid(),
  dueno_identidad_id uuid references seguros.portal_identidad(id) on delete cascade,  -- particular que concede
  cliente_id uuid references seguros.clientes(id),                                    -- empresa que concede
  identidad_id uuid not null references seguros.portal_identidad(id) on delete cascade,  -- la persona autorizada
  bien_id uuid references seguros.portal_bien(id) on delete cascade,  -- NULL = todos los vehículos del dueño (incluye futuros)
  concedido_por_identidad_id uuid references seguros.portal_identidad(id) on delete set null,
  concedido_en timestamptz not null default now(),
  aceptado_en timestamptz,                   -- la persona acepta al entrar con su código
  baja_en timestamptz, baja_por_identidad_id uuid references seguros.portal_identidad(id) on delete set null,
  constraint portal_vehiculo_acceso_un_dueno check (num_nonnulls(dueno_identidad_id, cliente_id) = 1),
  constraint portal_vehiculo_acceso_no_a_si_mismo check (dueno_identidad_id is distinct from identidad_id)
);
create unique index on seguros.portal_vehiculo_acceso
  (identidad_id, coalesce(dueno_identidad_id, cliente_id), coalesce(bien_id, '00000000-0000-0000-0000-000000000000'))
  where baja_en is null;
-- 4. Recordatorios y hechos DEL VEHÍCULO (autor y fecha obligatorios). Sin columna de dueño: es el del bien.
create table seguros.portal_vehiculo_nota (
  id uuid primary key default gen_random_uuid(),
  bien_id uuid not null references seguros.portal_bien(id) on delete cascade,
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

`schema.prisma`: primero el `GRANT`, luego el modelo (si no, 42501). Las FKs de `bien_id` en cascada son deliberadas: el rol ya tiene
DELETE sobre `portal_bien` y, sin cascada, **suprimir a una persona (RGPD) quedaría bloqueado por su propio QR** (test §7-9).

## 3. Decisiones de diseño

### 3.1 Acceso de la persona autorizada: tabla propia, NO alcance nuevo de `portal_autorizacion`
Se descarta un alcance `vehiculo` porque: (a) `portal_autorizacion.poliza_id` ancla en PÓLIZA (FK compuesta a `polizas(cliente_id, id)`);
acotar a vehículo exigiría `bien_id` y reescribir los lectores; (b) `flota` exige título de representación y ficha entera: un
conductor no representa a la sociedad ni una pareja «autoriza» sobre la cartera; (c) mezclarlos arriesga que un lector viejo lo
trate como acceso a la bóveda; (d) la baja inmediata y por vehículo es el caso de uso. Se **reutiliza** el criterio de alcance
(`NULL` = todo, también futuro, y la pantalla lo dice) y el doble paso (concede el dueño, acepta la persona).
**Quién crea el QR y concede = el dueño del bien**: la identidad dueña (`portal_bien.identidad_id`) en un particular; el dueño o
el jefe de flota (`accesosFlota()` → papel) en una empresa. La persona autorizada nunca concede. **Alcance por defecto:
vehículos concretos**; «todos mis vehículos / toda la flota» es explícito, con aviso. Necesita identidad del portal (canal con
código de 6 dígitos): un menor sin móvil ni correo no entra (§8-6).

### 3.2 Lo público no tiene sesión: la allow-list es de SALIDA
La página pública recibe un objeto `VistaPublicaVehiculo` construido por una función **pura** que solo copia campos de una
allow-list (nunca «quita» campos de un objeto grande). Los interruptores solo ACTIVAN trozos de la allow-list; ningún
interruptor puede hacer salir algo fuera de ella. Mal configurado o corrupto → se aplica el defecto. Resolución: fila del
vehículo → defecto del dueño (identidad o empresa) → defecto del código.

| Interruptor | Defecto | Contenido público |
|---|---|---|
| Datos para carretera | ON | compañía, nº de póliza, teléfono de asistencia (`canal-compania.ts`, catálogo único), «qué hacer en un accidente»; matrícula |
| Estado al día | ON | semáforo ITV y seguro: `al_dia` / `vence_pronto` / `vencido` / `no_sabemos`. **Sin fechas exactas** |
| Recordatorios pendientes | OFF | solo `tipo` + «pendiente»/«vencido», sin título libre ni nombres |

**Nunca públicos** (`CAMPOS_PROHIBIDOS_EN_VEHICULO_PUBLICO`, módulo puro): prima, recibos, DNI/NIF, dirección, documentos, fechas
exactas, autor de las notas, km y **nombre/datos del titular**. En un bien de **particular el nombre nunca sale**, sin interruptor;
en uno de empresa solo la razón social y solo si la ficha es persona jurídica (un autónomo es persona física → nunca). Cepo §7.

### 3.3 Tipos nuevos y hechos van en su tabla, no en `portal_obligacion`
`portal_vehiculo_nota` es del VEHÍCULO (§1). Sus tipos no entran en `TIPOS_RECORDATORIO_PROPIO` (lo importa el cron de
vencimientos de `apps/asegura`). Avisos push/correo de las notas: **fuera de F2** (§8-5).

### 3.4 Sesión de la persona autorizada: una vez por móvil
Escaneo → `/v/<token>` sin sesión ve lo público + «Entrar para ver más». Con la cookie `asegura_portal_session` (30 días) y acceso
vigente (o siendo el dueño), el mismo escaneo abre la vista identificada. Sin cookie válida o con baja → lo público (nunca un 403).
La baja se comprueba **en cada petición**.

### 3.5 Una sola función de permiso, dos casos de dueño
`lib/vehiculo-acceso.ts` exporta **`puedeGestionarVehiculo(identidadId, bienId)`**: comprueba que la sesión es la de `identidadId`
(como `accesosFlota`), carga el bien **dentro de lo que la identidad puede ver** y resuelve: `bien.identidad_id === identidadId` →
`dueno_particular`; `bien.cliente_id` ∈ `accesosFlota(identidadId)` con papel dueño/jefe → `dueno` | `jefe_flota` (+ `empresaId`);
si no, `null` (la ruta responde 404). Devuelve el ámbito de dueño (`{identidad}` | `{cliente}`) que las rutas copian a las filas
nuevas. **`accesoAVehiculo`** (F2) = `puedeGestionarVehiculo` OR acceso vigente en `portal_vehiculo_acceso` (`gestiona` | `escribe`).
**Ficha bajo demanda**: `asegurarVehiculoDePoliza(identidadId, polizaRef)` crea (idempotente por `(identidad_id, matricula)`) el
`portal_bien` desde una póliza PROPIA de auto/moto, con matrícula normalizada y `fecha_matriculacion` si constan. Sin matrícula →
`sin_matricula` (no se inventa); nunca desde una póliza ajena ni un id del cuerpo.

### 3.6 Supresión y vehículo vendido
Suprimir una identidad borra en cascada sus bienes y con ellos QR, interruptores, accesos y notas. En empresa, la baja del jefe
no toca las notas (histórico con autor y fecha). Vehículo vendido → bien en baja → su QR da 404.

## 4. Qué se reutiliza y qué es nuevo

**Reutiliza**: `hashCanal`, `BYTES_TOKEN_HOJA`, `normalizarTokenHoja`, `qrcode` + estilos `@media print`, `accesosFlota`/`flotaDeEmpresa`,
`itvDeVehiculo`/`proximaItv`, `canalDeCompania`, `normalizarMatricula`, login por código. **Adapta**: `enlaceDeHoja` → `enlaceDeVehiculo`
(`/v/<token>`, https o `null` + 503 sin escribir fila). **Nuevo**: `portal_vehiculo_*` (§2), `src/vehiculo-publico.ts` (allow-list pura),
`src/vehiculo-acceso.ts` (reglas puras), `lib/vehiculo-acceso.ts`, `lib/vehiculo-qr.ts`, `lib/vehiculo-nota.ts`, rutas y pantallas (§5-6).

## 5. Rutas (neutras: no cuelgan de `/api/flota`)

- **Pública** `GET /v/[token]`: `force-dynamic`, `noindex`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`. Única consulta
  sin identidad (`vehiculoPorToken`, normaliza el token antes de la BD). Anulado, inexistente o bien en baja → **404 idéntico**.
- **Dueño** (por `puedeGestionarVehiculo`): `POST /api/vehiculos/ficha` (particular: `asegurarVehiculoDePoliza`),
  `POST /api/vehiculos/[bienId]/qr` (crea; token UNA vez), `DELETE …/qr/[id]` (anula = UPDATE), `PUT …/publico` (excepción del
  vehículo), `PUT /api/vehiculos/publico-defecto` (`{ ambito: 'persona' }` | `{ ambito: 'empresa', empresaId }`, buscada dentro de
  `accesosFlota`), `POST /api/vehiculos/acceso` (canal + `bienIds|todos`), `POST /api/vehiculos/acceso/[id]/baja`.
- **Persona autorizada** (`accesoAVehiculo`, en cada llamada): `GET /api/vehiculos/[bienId]`, `POST …/notas`,
  `POST …/notas/[id]/cerrar`.
- Identidad siempre de la cookie; `bienId` y `empresaId` se **buscan dentro** de lo que la identidad puede ver, nunca se consulta por
  el id de la URL ni se acepta dueño del cuerpo. `/api/flota/vehiculo` (alta de vehículo de empresa) no cambia.

## 6. Pantallas (todas ≥320 px; botones ≥44 px; modales 95 vw)

- **Componente común `QrVehiculo.tsx`** (crear, estado, anular, reimprimir, interruptores, personas autorizadas), montado en:
  - **Particular**: ficha de su póliza de auto/moto en `/boveda` (`PolizaVista`/`FilaDeclarada`), bloque «QR del vehículo»: lo más
    parecido a «ficha del vehículo» hoy (§1). Al pulsar crea el bien bajo demanda (§3.5); sin matrícula en la póliza, la pide
    (y la matriculación, para la ITV) antes de generar. «Personas autorizadas»: pareja, hijo.
  - **Empresa**: `/flota`, ficha del vehículo (`FlotaEmpresa.tsx`), más impresión en lote por empresa.
- **Etiqueta (F1)**: «reimprimir» = token nuevo + el viejo queda anulado («el papel pegado deja de valer»). Impresión: QR grande,
  matrícula, marca Grupo ASegura, ningún dato.
- **Público (F1)**: una columna: matrícula; «Datos para carretera» (teléfono de asistencia como `tel:` grande); «Estado al día»
  (semáforo con texto, no solo color); «Entrar para ver más». Sin nombre de titular si es particular.
- **Interruptores (F1)**: 3 casillas con el texto de lo que revelan + vista previa «así lo ve quien escanee». Defecto del dueño
  (ficha de empresa, o «Mis vehículos») + excepción por vehículo.
- **Personas autorizadas (F2)**: lista con vehículos asignados, «Dar de baja» con confirmación; alta por correo/móvil.
- **Vehículo identificado (F2)**: ITV con fecha y fiabilidad, seguro, notas por fecha con autor, botón fijo «Añadir»
  (recordatorio / hecho: neumáticos, revisión, kilometraje, otro). Listas largas: ~50 + «Ver más».

## 7. Guardianes y tests exigidos (todos vistos en rojo antes de darlos por buenos)

1. `vehiculo-publico`: vista con TODOS los interruptores a `true` y entrada llena de campos prohibidos (prima, NIF, dirección,
   fechas exactas, autor, **nombre del titular**) → ninguno sale, ni en el HTML, aunque el interruptor esté "mal" (no booleano,
   fila ausente, columna extra). Bien de persona o de empresa física (autónomo): nunca nombre; solo jurídica.
2. Token anulado → 404; inexistente → 404 con el MISMO cuerpo y tiempo; mal formado → 404 sin tocar BD.
3. Persona con `baja_en` → 404 en `/api/vehiculos/*` (y la página vuelve a lo público) sin reimprimir.
4. Aislamiento, **dos mundos**: particular A con `bienId` de B → 404; empleado de A con bien de B → 404; particular con bien de
   empresa y a la inversa → 404; dueño/`empresaId` del cuerpo se ignora.
5. `null` = «no se sabe»: sin `fecha_matriculacion` la ITV es `no_sabemos`, nunca `al_dia`; póliza no encontrada ≠ «sin seguro»;
   sin teléfono → «pídenoslo», no un número inventado.
6. `test/regression-portal-aislamiento.test.ts`: `vehiculoPorToken` en EXENTOS como decisión explícita (única sin identidad);
   `regression-portal-sin-crm`; GRANTs sin DELETE para las 4 tablas.
7. Toda ruta de `/api/vehiculos/*` pasa por `puedeGestionarVehiculo` o `accesoAVehiculo` (test que recorre los `route.ts`).
8. Autor y fecha no nulos en `portal_vehiculo_nota` (CHECK probado mordiendo); la baja del autor no borra su nota.
9. CHECK `un_dueno` de `publico` y `acceso` mordido (0 y 2 dueños); suprimir una identidad con QR no falla (cascada);
   `asegurarVehiculoDePoliza` idempotente y rechaza póliza ajena o sin matrícula.

## 8. Riesgos y preguntas abiertas

**Riesgos**: (1) QR fotografiable: lo público es lo que ya ve quien lea la matrícula + datos de siniestro; «recordatorios» OFF por
defecto. (2) Teléfono de asistencia: del catálogo único (`telefonos-companias.ts`); si no consta, nada. (3) Móvil perdido: sesión de
30 días, baja inmediata en servidor. (4) Notas libres: 120 caracteres, nunca públicas. (5) Reimprimir sin acceso a la guantera:
aviso claro. (6) Mismo coche en dos portales (pareja): dos `portal_bien`, dos QR, sin fusión; aceptable en F1.

**Preguntas** (default asumido entre paréntesis):
1. ¿Cuántos vehículos tiene Global2 (piloto)? (<50, para respetar el pliegue de `/flota`).
2. ¿Las personas autorizadas tienen correo o solo móvil? (código por el canal que haya).
3. ¿Quién es el jefe de flota en Global2 y ya aceptó? (sin él, solo el dueño concede).
4. ¿«Datos para carretera» lleva nombre del titular? (particular nunca; empresa solo razón social jurídica).
5. ¿Las notas con fecha avisan por push/correo? (no en F2).
6. ¿Un hijo menor sin canal propio puede autorizarse? (no; con el QR sin sesión ve lo público).
7. ¿Una baja de persona borra sus notas? (no: quedan con autor y fecha).
8. ¿Etiqueta: papel, pegatina o PVC? (A6, QR ≥ 3 cm; moto: pegatina pequeña resistente al agua).

## 9. Fases

- **F1 (empresa y particular desde el principio)**: SQL §2 tablas 0-2, `/v/[token]`, `lib/vehiculo-acceso.ts`
  (`puedeGestionarVehiculo`, `asegurarVehiculoDePoliza`), rutas del dueño, `QrVehiculo.tsx` en `/flota` y en la ficha de póliza de
  `/boveda`, etiqueta + impresión en lote, guardianes 1, 2, 4 (parte dueño), 5, 6, 7, 9. Sin personas autorizadas.
- **F2**: tablas 3-4, personas autorizadas, vista identificada, notas, `accesoAVehiculo`, guardianes 3, 4 (resto), 7, 8.
- **F3 (fuera de alcance)**: partes de accidente con fotos desde el QR, avisos por push/correo de las notas, cierre de ITV
  con foto de la tarjeta.
