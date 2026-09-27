# Directorio de contactos por compañía: de UNO a VARIOS

**Fecha:** 13/09/2026
**Pide:** Alberto — "mapfre x ejemplo hay más contacto, occident Rodriguez Lopez, Francisco que es
persona contacto para temas comerciales. Crear lista de contactos por compañías no?"

## Contexto

`seguros.companias_dgs` (tabla mantenida por la skill `agente-correduria`, minada del correo de
Alberto) guarda hoy **un solo contacto** por compañía: `contacto_nombre`, `contacto_cargo`,
`contacto_email`, `contacto_telefono`. La pantalla `/correduria/companias` (y el bloque
`Companias.tsx` en la pestaña Datos) ya pintan ese contacto único, con botones de WhatsApp/mail
(PR #2895).

En la práctica una compañía tiene varias personas de contacto según el motivo (comercial,
siniestros, administración…) — el caso que lo destapa es Occident: además del contacto ya cargado,
Francisco Rodríguez López es el contacto **comercial**. El modelo de un-solo-contacto no tiene
sitio para el segundo sin pisar al primero.

## Qué se construye

### 1. Tabla nueva `seguros.compania_contactos`

Sustituye a las 4 columnas planas de `companias_dgs`. Varias filas por compañía.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `compania_codigo_dgs` | text, FK → `companias_dgs.codigo_dgs` | |
| `nombre` | text | |
| `cargo` | text NULL | literal de la firma del correo ("Gestor de cartera", "Responsable comercial"…) |
| `area` | enum NULL | `comercial` \| `siniestros` \| `administracion` \| `tecnico` \| `general`. **Lista cerrada**, no texto libre — el minado de Gmail tiene que clasificar en una de estas, nunca inventar una etiqueta nueva. `NULL` = no se ha podido clasificar (no es lo mismo que "general": ver estados abajo). |
| `email` | text NULL | |
| `telefono` | text NULL | |
| `notas` | text NULL | |
| `orden` | int, default 0 | para fijar cuál sale primero dentro de la misma compañía (el migrado desde el contacto único nace en `orden=0`) |
| `activo` | bool, default true | baja lógica; nunca se borra una fila (igual que el resto de tablas de `seguros`) |
| `ultimo_contacto_en` | timestamptz NULL | se actualiza cada vez que Alberto pulsa el botón de WhatsApp o mail sobre ese contacto. `NULL` = nunca se le ha escrito desde aquí, no "hace mucho" |
| `creado_en` / `actualizado_en` | timestamptz | |

Índice en `(compania_codigo_dgs, activo)`.

### 2. Migración de datos

Un script de una sola pasada: por cada fila de `companias_dgs` con `contacto_nombre IS NOT NULL`,
inserta una fila en `compania_contactos` (`orden=0`, `area=NULL` — el área no estaba capturada
antes, así que no se inventa una). Verificado el recuento antes/después (nº de contactos migrados
= nº de compañías con contacto en `companias_dgs`). Tras la migración, se **retiran** las 4 columnas
viejas de `companias_dgs` (ya no tienen consumidor).

### 3. Puerto (`apps/asegura`)

`GET /api/operador/companias` cambia su contrato: cada compañía devuelve `contactos: Contacto[]`
(ordenados por `orden`) en vez de los 4 campos planos. `Contacto` lleva los mismos campos de la
tabla (sin `id` interno si no hace falta exponerlo — sí hace falta, para el futuro "marcar
contactado" desde plataforma).

Companías sin ningún contacto activo → `contactos: []` (se ha mirado, no hay), nunca `null` salvo
que la consulta entera falle (ahí sigue el patrón `estado:'error'` existente).

### 4. Plataforma

- `lib/companias-asegura.ts`: `Compania.contactos: Contacto[]` en vez de los 4 campos planos.
  `interpretarCompanias` valida el array igual que valida hoy la lista de compañías (defensivo,
  cada contacto se descarta individualmente si no trae `nombre`, nunca tumba la respuesta entera).
- `Companias.tsx` (bloque de la pestaña Datos): cada fila de compañía pasa a listar sus contactos
  (nombre + cargo/área + botones WhatsApp/mail), no una sola línea.
- `/correduria/companias` (página dedicada): cada tarjeta de compañía lista sus contactos.
- **Resaltado contextual**: cuando el bloque de compañías se muestre en un sitio que ya sabe el
  motivo (p. ej. una ficha de póliza con un siniestro abierto — no construido en este PR, pero el
  campo `area` deja la puerta lista), el contacto de esa `area` se destaca sobre el resto. Fuera de
  ese contexto (el directorio general), se listan todos por `orden`.
- **Marcar contactado**: los botones de WhatsApp/mail, al pulsarse, hacen un `POST` best-effort
  que actualiza `ultimo_contacto_en` del contacto (no bloquea el envío si falla).

### 5. El contacto de Occident (Francisco Rodríguez López)

No se teclea a mano. Una vez la tabla existe, se dispara la skill `agente-correduria` (o una pasada
puntual de minado con el mismo criterio) contra el Gmail de Alberto para localizar su firma, extraer
cargo/email/teléfono y clasificarlo como `area='comercial'`. Es un paso posterior a este PR (no
bloquea el modelo/UI), y sigue el mismo patrón ya usado para los contactos existentes.

## Lo que NO se construye ahora (a propósito)

- Aviso automático de "contacto sin uso reciente" — se deja la columna `ultimo_contacto_en` lista,
  pero el aviso en sí (Telegram, banner…) es una iteración futura.
- El resaltado contextual desde la ficha de póliza/siniestro — el campo `area` lo habilita, pero
  cablear ESE consumo es trabajo aparte (toca `poliza/[id]`/`siniestro`, fuera del alcance de "el
  directorio pase de 1 a N contactos").
- Multi-teléfono/multi-email por contacto (como sí existe para clientes) — un contacto de compañía
  no tiene el mismo problema de "varios números familiares"; si aparece el caso real, se añade
  entonces.

## Aislamiento — por qué esta tabla NO pasa por `lib/tenant`

`companias_dgs` (y por tanto `compania_contactos`) es una tabla de **REFERENCIA compartida**, igual
que hoy: el contacto de una aseguradora no es dato de un cliente ni de una correduría concreta, así
que no lleva `correduria_id` y no pasa por `lib/tenant`. El guardián
`test/regression-asegura-aislamiento.test.ts` solo exige la puerta `lib/tenant` cuando un fichero
escribe **SQL crudo** citando `seguros.<tabla>` (regex `SQL_SEGUROS`); el acceso aquí es vía Prisma
(`prismaAsegura().companiaContacto.findMany(...)`), así que no dispara ese cepo — igual que no lo
dispara hoy `route.ts` de `/api/operador/companias`. Se deja constancia explícita para que nadie, al
ver el guardián, dé por hecho que falta envolverlo.

## Verificación

- Migración aplicada y verificada por recuento (Supabase MCP).
- `tsc --noEmit` en `apps/asegura` y `apps/plataforma`.
- Prueba manual: el directorio pinta ≥2 contactos en al menos una compañía tras la migración +
  minado (Occident con 2, una vez corra el minado).
