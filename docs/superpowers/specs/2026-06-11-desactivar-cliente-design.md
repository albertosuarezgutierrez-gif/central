# Desactivar cliente (baja reversible que conserva el histórico) — IALIMP

**Fecha:** 2026-06-11 · **App:** `apps/ialimp` · **Rama:** `claude/client-deletion-logic-x5r7zj`

## Problema
Vanessa (y cualquier empresa del SaaS) necesita poder dar de baja a un cliente con el
que ya no trabaja, **sin perder el histórico** (facturas, chat, limpiezas hechas, pisos).
No es un borrado: es una **desactivación reversible**. En España las facturas hay que
conservarlas 4-6 años (Hacienda/VeriFactu), así que el borrado físico queda descartado.

## Concepto
El cliente pasa a estado **inactivo** (`clientes.activo = false`) y desaparece de todo lo
**operativo** (lista activa de selectores, agenda futura, sync de calendarios, acceso al
portal), pero su **historial queda intacto y consultable**. Reversible con **Reactivar**.

## Estado de partida (ya existente)
- `clientes.activo boolean NOT NULL DEFAULT true` **ya existe** en BD.
- El **login del portal del propietario ya rechaza** clientes con `activo = false`
  (`app/api/propietario/auth/login`).
- `ClientesClient.tsx` ya pinta el badge "inactivo" y tiene un `toggleActivo` a medio
  cablear que llama a un `DELETE` inexistente y a un `PATCH {activo:true}` que el backend
  ignora. **El backend nunca se completó** → desactivar/reactivar hoy no funcionan.

## Diseño

### 1. Migración (`add_cliente_desactivacion.sql`)
Añade columnas de auditoría a `clientes` (la columna `activo` ya existe):
- `desactivado_at timestamptz`
- `desactivado_por uuid` (usuario que la dio de baja; nullable)
- `desactivado_motivo text`

### 2. Endpoints nuevos (scope `empresa_id`)
- **`GET /api/admin/clientes/[id]/desactivar`** — *preview* para el modal de confirmación.
  Devuelve `{ num_propiedades, sesiones_futuras, facturas_pendientes, importe_pendiente }`.
  No modifica nada.
- **`POST /api/admin/clientes/[id]/desactivar`** — body `{ motivo? }`. En una transacción:
  1. `UPDATE clientes SET activo=false, desactivado_at=now(), desactivado_por=<usuario>,
     desactivado_motivo=<motivo>`.
  2. **Cancela limpiezas futuras**: `DELETE FROM cleaning_sessions WHERE cliente_id=…
     AND session_date >= CURRENT_DATE AND completed_at IS NULL`. Las completadas se quedan.
  3. **Corta el acceso del portal**: rota `session_jti` a un valor nuevo (expulsa la sesión
     viva). El login ya rechaza inactivos. **Nunca a NULL** (la regla de gracia lo
     re-permitiría).
  4. Devuelve resumen `{ sesiones_canceladas, facturas_conservadas }`.
  *(No toca `facturas_clientes` ni `chat_hilos`/`chat_mensajes`.)*
- **`POST /api/admin/clientes/[id]/reactivar`** — `UPDATE … SET activo=true,
  desactivado_at=NULL, desactivado_por=NULL, desactivado_motivo=NULL`. Las limpiezas
  futuras se re-sincronizan solas del iCal en la siguiente pasada del cron.

### 3. Parar la regeneración (clave) — `app/api/pms/sync`
Las queries de sync (iCal y Smoobu) excluyen propiedades de clientes inactivos:
`AND (cliente_id IS NULL OR cliente_id IN (SELECT id FROM clientes WHERE activo = true))`.
Sin esto, el cron (cada 10 min) recrearía las limpiezas canceladas.

### 4. Excluir de lo operativo — `GET /api/admin/clientes`
Filtra `AND c.activo = true` por **defecto**; acepta `?incluir_inactivos=1` para incluirlos.
Así los selectores que lo consumen (Nueva limpieza/agenda, informes, facturas, negocio) ya
no muestran inactivos. La **página de gestión de clientes** usa su propia query SSR
(`app/admin/clientes/page.tsx`, ya ordena `activo DESC`) → sigue mostrando todos para poder
reactivar. La contabilidad histórica no cambia (las facturas emitidas siguen contando).

### 5. UI — `ClientesClient.tsx`
- **Filtro Activos / Inactivos** (chips, lado cliente) con su contador.
- **Modal de confirmación** al desactivar con **resumen de impacto**
  (`GET …/desactivar`): nº de limpiezas futuras que se cancelan, facturas que se conservan,
  aviso de **impagos** si hay facturas pendientes de cobro (estado `emitida`/`vencida`), y
  campo opcional **motivo**. Botón Reactivar en clientes inactivos.

## Fuera de alcance
Borrado físico real (RGPD "derecho al olvido") como acción separada e irreversible — se
documenta como evolución futura, no se construye ahora.

## Verificación
- Build `npm run build` OK en `apps/ialimp`.
- Migración aplicada en Supabase (`wswbehlcuxqxyinousql`) y commiteada.
- Prueba: desactivar un cliente de prueba → desaparece de selectores, limpiezas futuras
  canceladas, no reaparecen tras el cron, login del portal rechazado; reactivar lo restaura.
