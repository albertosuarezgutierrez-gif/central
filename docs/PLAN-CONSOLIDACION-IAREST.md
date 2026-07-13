# Plan — Consolidar ia-rest en la BD compartida (un solo proyecto Supabase)

> Objetivo (decisión de Alberto, 13/07/2026): fundir la BD standalone de ia-rest
> (`efncqyvhniaxsirhdxaa`, "ia-rest") dentro del schema `iarest` de la BD compartida
> (`wswbehlcuxqxyinousql`, "Ingresos Y gastos Smoobu") → **un solo proyecto**. Aprovechamos
> la ventana **sin clientes serios** (solo datos propios: correuría + pisos; Pilar en rrhh y
> Vanessa en ialimp arrancando). Es un "cambio que rompe" → se hace ahora (regla CLAUDE.md).

## Diagnóstico (verificado 13/07 vía MCP, solo lectura)

| | Standalone `public` (vivo) | Compartida schema `iarest` (destino) |
|---|---|---|
| Tablas base | 239 | 252 (superset estructural) |
| comandas / items | 142 / 223 | 0 / 0 |
| facturas_verifactu | **6** | 0 |
| pagos | 6 | 0 |
| productos | 101 | 0 |
| restaurantes | 2 | 2 (semilla vieja) |
| **alerta_log** | **219.106 filas = 182 MB** | — |
| Tamaño BD | 372 MB | (parte de los 87 MB de la compartida) |

**Conclusiones:**
- El 90% del peso del standalone es la tabla de LOGS `alerta_log` (182 MB). Los datos reales
  (pedidos, facturas, productos) son < 1.000 filas en total.
- El destino (`iarest`) tiene la estructura completa y está **operativamente vacío** → no hay
  datos divergentes que reconciliar; solo restos de semilla a truncar.
- Las funciones `SECURITY DEFINER` (RPC `siguiente_numero_factura`, `registrar_cobro_caja`…) YA
  existen en el schema `iarest` (se les hizo REVOKE en la auditoría) → la app tendrá sus RPC.

## Quick win independiente (alivio de billing HOY, sin migrar)
Podar `alerta_log` deja el standalone en ~190 MB y la org bajo el límite FREE:
1. **Exportar** `alerta_log` completa a Google Drive (backup; en FREE no hay backup gestionado).
2. Conservar solo lo reciente y borrar el resto, p.ej.:
   `DELETE FROM public.alerta_log WHERE created_at < now() - interval '14 days';`
   (ajustar la ventana; verificar antes el nombre de la columna de fecha).
3. `VACUUM (FULL, ANALYZE) public.alerta_log;` para que el espacio se libere de verdad.
Rollback: reimportar el export desde Drive.

## Migración completa (unificación) — pasos

### Fase 0 · Backup (SIEMPRE primero — FREE no tiene backup gestionado)
- `pg_dump` completo del standalone (schema+datos) → fichero en Drive. Si no hay shell con
  credenciales, export por tabla vía MCP (JSON/CSV) para las tablas con datos reales, y
  `alerta_log` aparte (se archiva, no se migra).

### Fase 1 · Verificar paridad estructural del destino
- Confirmar que **cada tabla del `public` standalone existe en `iarest`** con columnas
  compatibles (el destino tiene 252 vs 239 → superset probable, pero verificar que no falte
  ninguna que tenga datos). Cazar deltas de columnas/tipos.
- Confirmar que las secuencias, PKs, uniques y FKs existen en `iarest`.
- Confirmar versiones de las funciones RPC (que no sean stale respecto al standalone).

### Fase 2 · Cargar los datos reales (volumen pequeño)
- **Congelar escrituras** en el standalone (ventana de mantenimiento; sin clientes, es corto).
- Truncar los restos de semilla en `iarest` (leads/materiales/restaurantes viejos).
- Copiar tabla por tabla **en orden de FK** (padres antes que hijos) desde `public` → `iarest`.
  Volumen pequeño → INSERTs generados. **NO** migrar `alerta_log` (archivada en Drive).
  - Orden crítico VeriFactu: `restaurantes` → `metodos_pago` → `mesas`/`personal`/`turnos` →
    `comandas` → `comanda_items` → `facturas_verifactu` → `pagos`. Preservar EXACTO
    `created_at`, `numero_factura`, `hash_sha256`, `huella` (cadena fiscal inmutable).
- Resetear las secuencias al MAX(id) de cada tabla tras la carga.

### Fase 3 · Repuntar la app ia-rest al proyecto compartido
- Envs Vercel de `apps/ia-rest`: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` → los del proyecto compartido.
- **Apuntar al schema `iarest`**: el cliente de ia-rest hace `from('comandas')` (sin cualificar
  → iría a `public`). Hay que fijar el schema: `createClient(url, key, { db: { schema: 'iarest' } })`
  en `apps/ia-rest/src/lib/supabase.ts` (server y browser), o `search_path=iarest` en el rol.
  ⚠️ Esta es la parte de CÓDIGO más delicada — revisar TODAS las llamadas `.from()/.rpc()`.
- `DATABASE_URL`/Prisma si aplica → schema `iarest`.

### Fase 4 · Edge Functions
- Portar las Edge Functions del standalone (`ig-video-gen` v1, `eventos-entorno` v13) al
  proyecto compartido y re-desplegar; actualizar cualquier URL/secret que las invoque.

### Fase 5 · Verificación (antes de dar por buena)
- Login de ia-rest, abrir mesa, ver carta, **cerrar una comanda de PRUEBA** (nunca una real)
  y comprobar que numera VeriFactu correlativo sin romper la huella.
- Contrastar recuentos migrados vs origen (comandas, facturas, pagos, productos).
- Smoke test de las Edge Functions.

### Fase 6 · Cutover y baja del standalone
- Cambiar DNS/envs definitivos, monitorizar 24-48h.
- Solo cuando todo esté verde y con el export en Drive a salvo: **pausar** el proyecto
  standalone (no borrar de inmediato; dejar como red durante unas semanas) → la org queda con
  **un solo proyecto** → de vuelta a FREE (o Pro si se decide, pero ya sin el peso doble).

## Qué puedo hacer yo vs. qué necesita a Alberto/operador
- **Yo (vía MCP, con tu OK y export previo):** verificación estructural, truncar semilla,
  generar y aplicar los INSERTs de las tablas pequeñas al schema `iarest`, resetear secuencias,
  recuentos de verificación, y los cambios de CÓDIGO (schema `iarest` en el cliente) por PR.
- **Alberto/operador (panel):** el export a Drive (si no hay shell), cambiar los ENVs de Vercel,
  portar/re-desplegar Edge Functions, pausar el proyecto standalone.

## Rollback global
Mientras el standalone siga pausado (no borrado) y el export en Drive intacto: revertir los
ENVs de Vercel al standalone lo devuelve como estaba. No borrar el standalone hasta 2-4 semanas
de verde continuado.
