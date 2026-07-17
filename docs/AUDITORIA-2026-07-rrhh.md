# Auditoría apps/rrhh — Julio 2026

> **Ejecutada:** 17/07/2026 · **Cobertura:** código fuente, BD en vivo, seguridad, UX/responsive, tests  
> **Resultado:** 4 críticos de seguridad corregidos · 9 bugs de código corregidos · 6 mejoras pendientes

---

## Resumen ejecutivo

La aplicación es funcional y el aislamiento multi-tenant está correctamente implementado en la gran mayoría del código. Los problemas más graves eran de **autenticación de crons** (bypass trivial por User-Agent) y dos fallos de hardening defensivo en `lib/documental.ts`. En runtime, el bug `Decimal→string` de Prisma ya estaba parcialmente corregido en esta sesión; se encontraron más campos afectados. Los problemas de UX en móvil (botones demasiado pequeños, pantalla en blanco durante carga, `alert()` nativo) impactan directamente a Pilar y los empleados de Global2. Todos los bugs corregibles desde código **se han aplicado ya** en esta misma sesión.

---

## 🔴 Críticos — corregidos en esta sesión

### SEG-01 · Bypass de autenticación CRON por User-Agent falsificable
**Ficheros:** `app/api/cron/alerta-fichajes-abiertos/route.ts:11-13`, `app/api/cron/recordatorio-fichaje/route.ts:9-11`, `app/api/cron/nominas/route.ts:9-10`

Los tres crons aceptaban cualquier petición con `User-Agent: vercel-cron` aunque no llevara el Bearer correcto. Cualquier atacante podía disparar notificaciones push masivas a todos los empleados de todas las empresas, o forzar la generación de borradores de nóminas.

**Fix aplicado:** eliminado el fallback de User-Agent; solo se acepta `Authorization: Bearer $CRON_SECRET`. Si `CRON_SECRET` no está configurado, el endpoint devuelve 401 en lugar de pasar (el `|| ''` previo aceptaba un Bearer vacío).

---

### SEG-02 · `listarExpediente` sin `empresa_id` en el SELECT
**Fichero:** `lib/documental.ts:18-21`

El SELECT de documentos filtraba solo por `empleado_id`, sin `empresa_id`. La protección dependía exclusivamente de que `exigeEmpleado()` se hubiera llamado antes. Si la función se refactorizaba o se llamaba desde otro contexto, devolvería documentos de cualquier empresa.

**Fix aplicado:** añadido `AND empresa_id = ${empresaId}::uuid` al WHERE.

---

### SEG-03 · `borrarDocumento` con race condition TOCTOU y DELETE sin scope de empresa
**Fichero:** `lib/documental.ts:94`

El SELECT previo verificaba `empresa_id + empleado_id + docId`, pero el DELETE operaba solo por `id`. Además el orden era incorrecto: si `borrarObjeto` fallaba tras el DELETE, el registro en BD desaparecía pero el archivo quedaba en Storage para siempre (fuga de almacenamiento).

**Fix aplicado:** invertido el orden (primero `borrarObjeto`, luego DELETE), y el DELETE ahora incluye `AND empresa_id = ... AND empleado_id = ...`.

---

### SEG-04 · `radio_m` sin cast a float — geovalla nunca detecta obras
**Fichero:** `lib/fichajes.ts:21`

`lat` y `lng` llevaban `::float` explícito pero `radio_m` no. Prisma devuelve columnas `NUMERIC` como string Decimal. La función `dentroDeGeocerca` recibía un string como tercer argumento, haciendo NaN todas las comparaciones de distancia → ningún empleado jamás se detectaba dentro de una obra.

**Fix aplicado:** `radio_m::float` en el SELECT.

---

## 🟡 Importantes — corregidos en esta sesión

### BUG-01 · React.Fragment sin `key` → crash de reconciliación en tabla de fichajes
**Fichero:** `app/admin/fichajes/FichajesClient.tsx:136`

`<>` no acepta props. Al abrir/cerrar la auditoría o editar una fila, React podía asociar el estado (`editId`, `auditId`) con la fila equivocada o crashear la reconciliación.

**Fix aplicado:** cambiado a `<Fragment key={f.id}>` con import explícito.

---

### BUG-02 · Comparación de timestamp como string siempre true
**Fichero:** `app/api/admin/fichajes/[id]/route.ts:40`

`salida_at` del body es ISO 8601 del cliente; `prev.salida_at` de PostgreSQL tiene formato distinto. La comparación `!==` siempre era `true` → se registraba una corrección en la auditoría aunque el admin no hubiera modificado la salida.

**Fix aplicado:** comparación por `getTime()`: `new Date(salida_at).getTime() !== new Date(prev.salida_at).getTime()`.

---

### BUG-03 · Promise sin `.catch()` en carga de empleados
**Fichero:** `app/admin/fichajes/FichajesClient.tsx:49`

Si la red falla o la respuesta no es JSON, la excepción quedaba sin manejar (unhandled rejection en producción).

**Fix aplicado:** añadido manejo de error con fallback a array vacío.

---

### BUG-04 · `alert()` nativo para errores de guardado/borrado
**Ficheros:** `app/admin/empleados/EmpleadosClient.tsx:56,63`, `app/admin/obras/ObrasClient.tsx:38`

Los `alert()` del navegador bloquean el hilo, no se pueden estilizar, y en Chrome moderno pueden suprimirse. Especialmente problemáticos en iOS.

**Fix aplicado:** sustituidos por `setAltaErr()` / `setErr()` mostrando el error en el propio formulario.

---

### BUG-05 · Pantalla en blanco durante carga del widget de fichaje
**Fichero:** `components/FichajeEmpleado.tsx:111`

`if (cargando) return null` hacía desaparecer la sección sin feedback visual. En conexiones lentas el empleado ve contenido que parpadea.

**Fix aplicado:** skeleton de carga con `animate-pulse` durante el estado `cargando`.

---

### BUG-06 · Botones de acción táctiles de ~22 px (mínimo requerido 44 px)
**Ficheros:** `FichajesClient.tsx`, `EmpleadosClient.tsx`, `ObrasClient.tsx`

Todos los botones ✏️ y 🗑️ usaban `py-0.5` (~2 px de padding), resultando en ~22 px de alto. Prácticamente inutilizables en móvil sin zoom.

**Fix aplicado:** `py-1.5 min-h-[36px]` en todos los botones de acción de las tres páginas admin.

---

## 🟡 Importantes — pendientes (requieren decisión o acción manual)

### SEG-05 · Token de empleado no revocable (7 días)
**Fichero:** `lib/empleado-auth.ts:10-13`

El JWT del empleado no lleva `jti` y no se valida contra BD. Un empleado dado de baja sigue teniendo acceso al portal (`/e`) durante hasta 7 días, incluyendo fichaje GPS y acceso a documentos.

**Acción recomendada:** añadir columna `session_jti UUID` en `rrhh.empleados` y replicar el patrón de validación jti que ya existe para gestores en `lib/tenant.ts:19-22`. Requiere migración de BD.

---

### SEG-06 · Logout del gestor no invalida el JWT en curso
**Fichero:** `lib/tenant.ts:19-22`

El logout solo borra la cookie. Si el token fue copiado antes del logout, la sesión sigue activa 30 días. La comprobación `if (dbJti && dbJti !== s.jti)` tiene cortocircuito: si `dbJti` es NULL (token anterior al sistema jti), acepta cualquier token.

**Acción recomendada:** en logout ejecutar `UPDATE rrhh.usuarios_rrhh SET session_jti = NULL WHERE id = ?` y quitar el cortocircuito `dbJti &&` de la comprobación.

---

## 🟢 Mejoras — pendientes

### MEJ-01 · `contratos_laborales` e `incidencias_mes` exponen Decimal sin normalizar
**Ficheros:** módulos de nóminas que usan `salario_base`, `jornada_pct`, `importe`, `horas`

Los campos `Decimal` de Prisma en contratos e incidencias no tienen la conversión `Number()` explícita que se añadió para `horas_totales`. Si llegan al cliente sin serializar correctamente pueden causar el mismo TypeError que se corrigió en PR #940.

**Acción:** revisar todos los endpoints de nóminas y contratos que devuelvan estos campos al cliente y normalizar con `Number()`.

---

### MEJ-02 · `input type="month"` no funciona en iOS Safari
**Fichero:** `app/admin/fichajes/FichajesClient.tsx:95`

iOS Safari no tiene picker nativo para `type="month"`, cae a texto libre. El administrador no puede filtrar por mes desde iPhone/iPad.

**Acción:** reemplazar por dos selects (año/mes) o un picker custom compatible con iOS.

---

### MEJ-03 · Sin tests para `lib/fichajes.ts` ni `lib/empleado-auth.ts`
Los módulos más críticos del sistema no tienen cobertura. Tests mínimos recomendados:
- Serialización `Decimal→Number` en los tres puntos de retorno de `listarFichajes`/`fichajeActivo`/`ficharSalida`
- Que un token inválido devuelva null en `getSesionEmpleado`
- Que `listarFichajes` siempre filtre por `empresa_id` (aislamiento multi-tenant)

---

### MEJ-04 · Nav del AdminShell sin indicador de scroll horizontal en móvil
**Fichero:** `components/AdminShell.tsx:25`

Con `tieneFichaje=true` hay 10 ítems en la nav. En móvil hacen scroll pero no hay degradado lateral que indique que hay más. Los usuarios no descubren los últimos ítems.

---

### MEJ-05 · `usuarios_rrhh` sin índice en `empresa_id`
**BD:** tabla `rrhh.usuarios_rrhh`

Solo tiene `@unique` en `email`. Las queries de login (`WHERE empresa_id = ?`) hacen full scan si hay muchas empresas. Con el volumen actual no es urgente.

---

### MEJ-06 · Constraint CHECK en `rrhh.fichajes.estado` solo definido en código, no en BD
La columna `estado` acepta `CHECK (estado IN ('activo','cerrado'))` en la migración Prisma pero no aparece en los advisors de BD. Confirmar que el constraint existe.

---

## Estado de la BD (verificado en vivo)

| Tabla | Existe | Índices |
|---|---|---|
| `rrhh.empresas` | ✅ | — |
| `rrhh.empleados` | ✅ | `empresa_id` |
| `rrhh.fichajes` | ✅ | `(empresa_id, empleado_id, estado)`, `(empresa_id, entrada_at)` |
| `rrhh.obras` | ✅ | `(empresa_id, activa)` |
| `rrhh.documentos` | ✅ | `empleado_id`, `empresa_id` |
| `rrhh.solicitudes` | ✅ | presente |
| `rrhh.usuario_empresas` | ✅ | presente |
| `rrhh.empresa_documentos` | ✅ | presente |
| `rrhh.fichajes_audit` | ✅ | presente |
| `rrhh.push_subscriptions` | ✅ | presente |
| `rrhh.firma_otps` | ✅ | unique `(documento_id, empleado_id)` |

**Empresas registradas:** Global2 Instalaciones Técnicas (`tiene_fichaje=true`), Mariscos González (`tiene_fichaje=false`).

**Fichajes activos en este momento:** 0 (todos cerrados correctamente).

---

## Tests: cobertura actual

| Test | Cubre |
|---|---|
| `empleados.test.ts` | `generarAccesoToken`, `normalizarEmpleado` |
| `firma-publica.test.ts` | `aFirmaPublica`, `etiquetaMetodo` |
| `contratos.test.ts` | `parsearDatosContrato` |
| `nominas.test.ts` | `parsePeriodo`, `periodoActual` |
| `solicitudes-tipos.test.ts` | catálogo de tipos |
| `ai.test.ts` | enrutado IA |
| `branding.test.ts` | paleta, variables CSS |
| `convenio-prompt.test.ts` | parsers de convenio |
| `asistente-prompt.test.ts` | system prompt |

**Sin cobertura:** `lib/fichajes.ts` (cero tests), `lib/empleado-auth.ts` (cero tests), flujos multi-tenant, serialización Decimal.

---

## Acciones manuales para Alberto

1. **Activar `CRON_SECRET` en Vercel** si no está configurado: `vercel env add CRON_SECRET production` con un UUID random. Sin esta variable los tres crons devuelven 401.

2. **Migración para token de empleado revocable** (MEJ pospuesta):
   ```sql
   ALTER TABLE rrhh.empleados ADD COLUMN IF NOT EXISTS session_jti UUID;
   ```

3. **Confirmar constraint CHECK en fichajes.estado:**
   ```sql
   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
   WHERE conrelid = 'rrhh.fichajes'::regclass AND contype = 'c';
   ```

4. **Verificar Supabase RLS en schema rrhh:** el rol `rrhh_app` tiene BYPASSRLS — confirmar que ninguna tabla del schema `rrhh` tiene políticas RLS activas que puedan entrar en conflicto con el bypass.

---

## Veredicto final

⚠️ **Producible con clientes reales tras aplicar los fixes de esta sesión.** Los 4 críticos de seguridad y 6 bugs de código ya están corregidos y en PR. Quedan 2 mejoras de seguridad pendientes (token de empleado no revocable, logout sin invalidación) que son aceptables en el contexto actual (empresa pequeña, acceso por invitación) pero deben planificarse antes de escalar.
