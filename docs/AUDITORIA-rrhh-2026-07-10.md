# Auditoría RRHH — 2026-07-10

> Disparada por Alberto tras el bug «la ficha de empleado no guardaba nada» (PR #816).
> Foco: la vertical **RRHH** (`apps/rrhh`), con especial atención a la **clase de bug**
> que causó ese fallo (parámetro `text` de Prisma asignado a columna no-text sin cast →
> `ERROR 42804`, que tumba TODO el statement **aunque el valor sea NULL**).
> Alcance: `apps/rrhh` + schema `rrhh` de la BD compartida. Solo lectura de infra salvo los
> arreglos de bajo riesgo aplicados en el acto.

## Resumen ejecutivo
- **6 bugs de la misma clase en total** (1 ya arreglado en #816 + **5 nuevos** arreglados en esta
  auditoría). Todos son endpoints que escriben a columnas `date`/`numeric`/`integer`/`boolean`/`bigint`
  con parámetro `text` sin castear.
- Resto de la salud: **typecheck ✅, 38/38 tests ✅, multi-tenant ✅, secretos ✅**.
- Sin hallazgos de seguridad reales en advisors (los de RRHH son by-design).

## 🔴/🟡 Hallazgos — casts `text→no-text` faltantes (ARREGLADOS en esta pasada)

| Sev | Fichero:línea | Columna(s) : tipo | Cuándo falla | Fix aplicado |
|-----|---------------|-------------------|--------------|--------------|
| 🔴 | `app/api/admin/obras/[id]/route.ts:15-18` | `lat`/`lng` numeric, `radio_m` int, `activa` bool | **Cualquier PATCH parcial** (p.ej. togglear solo `activa`) → los demás campos van `null` text → 42804 → falla TODO el update. Gemelo exacto del bug de la ficha. | `::numeric` / `::int` / `::boolean` en cada `COALESCE` |
| 🟡 | `app/api/admin/obras/route.ts:23` | `lat`/`lng` numeric | Crear obra sin coordenadas (permitido, solo `nombre` obligatorio) → `null` text → 42804 | `${lat ?? null}::numeric`, `${lng ?? null}::numeric` |
| 🟡 | `lib/fichajes.ts:42` y `:50` | `lat_entrada`/`lng_entrada`/`lat_salida`/`lng_salida` numeric | Fichar sin GPS (permiso denegado) → `lat`/`lng` = `null` text → 42804 → **el empleado no puede fichar** | `${lat}::numeric`, `${lng}::numeric` en INSERT y UPDATE |
| 🟡 | `lib/empresa-documental.ts:36` | `anio`/`mes` integer | Subir doc de empresa sin mes/año (cif, escritura…) → `null` text → 42804 | `${anio ?? null}::int`, `${mes ?? null}::int` |
| 🟡 | `lib/documental.ts:44` | `tamano` bigint | `validarSubida` deja `tamano=null` si el llamante lo omite (contrato del módulo) → `null` text → 42804 | `${v.tamano}::bigint` |

Verificación: reproducido contra la BD real (`DO`/transacción revertida) — sin cast falla con
`42804 COALESCE types text and numeric cannot be matched`; con cast pasa. `tsc --noEmit` OK.

## ✅ Comprobado y limpio
- **Typecheck** (`tsc --noEmit`, gate real de CI; la app lleva `ignoreBuildErrors`): 0 errores.
- **Tests** (`vitest run`): 38/38.
- **Multi-tenant** (lo más crítico — BD compartida): todo `UPDATE`/`DELETE` va con `empresa_id`
  en el `WHERE` o precedido de guarda tenant-scoped (`exigeEmpleado`/`SELECT` con `empresa_id`).
  Sin fugas cross-tenant. El cron de nóminas itera todas las empresas a propósito (protegido por
  `CRON_SECRET`).
- **Secretos**: sin fallback explotable. `CRON_SECRET || ''` en `api/cron/nominas` falla en
  cerrado (`if (!secret)` → 401). El resto de SQL raw ya casteaba `::uuid`/`::date`/`::timestamptz`
  correctamente (~29 statements limpios).
- **Inyección SQL**: el único `SET ${campo}` (chat) usa `Prisma.raw` con valor hardcodeado.
- **Advisors seguridad**: los hits de `rrhh` son `rls_enabled_no_policy` (INFO) — by-design (rol
  `rrhh_app` con `BYPASSRLS`, aislamiento por `empresa_id` en la app). El ERROR `security_definer_view`
  NO es del schema `rrhh`.

## 🟡 Recomendaciones (no bloqueantes)
1. **Test de regresión de la ficha**: el endpoint que tuvo el bug crítico (`empleados/[id]` PATCH)
   no tiene test. Añadir uno que ejercite el guardado con fechas vacías/null para blindar la clase
   de bug `text→date`. Idealmente un test genérico que cace COALESCE/assign a columna no-text sin cast.
2. **Advisors rendimiento** (irrelevante con 1 cliente piloto; hacer antes de escalar):
   - FKs sin índice: `rrhh.fichajes`, `rrhh.mensajes`, `rrhh.nominas`, `rrhh.usuario_empresas`,
     `rrhh.usuarios_rrhh`.
   - 3 índices sin uso: `rrhh.contratos_laborales`, `rrhh.empleados`, `rrhh.incidencias_mes`.

## Checklist de acciones manuales de Alberto
- Ninguna acción de infra requerida por esta auditoría (los fixes son de código, van por PR).
- Tras mergear: `central-rrhh` redesplega solo. Verificar en producción: (a) editar una obra
  togglando `activa`, (b) fichar sin GPS, (c) subir un doc de empresa sin mes/año.
