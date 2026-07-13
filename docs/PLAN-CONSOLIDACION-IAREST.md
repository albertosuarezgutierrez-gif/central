# Plan — Consolidar ia-rest en la BD compartida (un solo proyecto Supabase)

> ⚠️ **CORRECCIÓN (13/07/2026): este documento tenía un supuesto ERRÓNEO y queda SUPEDITADO
> al runbook autoritativo `docs/RUNBOOK-migracion-bd-iarest.md`.** Al investigar (Alberto pidió
> "investigar primero por qué hay dos") se confirmó vía docs del repo + MCP que:
> 1. La migración **estructural YA se hizo el 10/06/2026** (PR #117/#110, por dblink): schema
>    `iarest` con 215 tablas/47 vistas/121 funciones/32 triggers/428 policies + 43 Edge Functions
>    ya portadas al compartido y código listo (`SB_OPTS`). **Es un "split-brain a medio hacer",
>    no una migración por empezar.**
> 2. El `iarest` compartido **NO está vacío ni es semilla**: aloja el subsistema Instagram/Reels
>    (`ig-video-gen`, `instagram_borradores`) y una **DEMO/pilot deliberada de Catering Joaquín
>    Jaén** (creada 25/06, `personal`=14, módulos cocina). Documentado en `ia-rest-maestro` §2.
> 3. El diseño original **NUNCA contempló migrar datos** (`--schema-only`; los datos del standalone
>    se consideraban demo desechable). Por tanto **NO se hace la "carga/merge de datos" que este
>    documento describía en Fase 2** — sería erróneo (pisaría el pilot de JJ con datos de Saboga).
> 4. El corte está **bloqueado SOLO por pasos manuales de Alberto**: re-meter los secrets de las
>    Edge Functions en el compartido + flip de envs de Vercel (`NEXT_PUBLIC_SUPABASE_*` +
>    `NEXT_PUBLIC_SUPABASE_SCHEMA=iarest`). Ver "CORTE FINAL" del RUNBOOK.
> 5. **Matiz fiscal:** el standalone tiene 6 `facturas_verifactu` + 142 `comandas` (cadena fiscal,
>    congelada 31/05). Aunque no se migren, el proyecto viejo **NO se borra**: se deja pausado como
>    archivo fiscal (retención legal VeriFactu).
>
> Lo verificado hoy que SÍ sigue siendo válido: paridad estructural del schema (122/122 tablas con
> datos del standalone existen en `iarest`, destino superset) y que el código de la app ya respeta
> el flag de schema. El resto de este documento (framing de "copia limpia a schema vacío") es el
> supuesto erróneo — seguir el RUNBOOK.

> Objetivo (decisión de Alberto, 13/07/2026): fundir la BD standalone de ia-rest
> (`efncqyvhniaxsirhdxaa`, "ia-rest") dentro del schema `iarest` de la BD compartida
> (`wswbehlcuxqxyinousql`, "Ingresos Y gastos Smoobu") → **un solo proyecto**. Aprovechamos
> la ventana **sin clientes serios** (solo datos propios: correuría + pisos; Pilar en rrhh y
> Vanessa en ialimp arrancando). Es un "cambio que rompe" → se hace ahora (regla CLAUDE.md).

## Estado (13/07/2026)
- ✅ **Quick-win ejecutado:** `alerta_log` podada (219.106→16.381 filas, −174 MB). BD ia-rest
  **372→198 MB**, bajo el límite FREE de 500 MB/proyecto. Cron de retención diario montado
  (`/api/cron/purga-alerta-log`, 14 días) para que no vuelva a crecer.
- ✅ **Billing aclarado:** la org es plan **`free` ($0)** — Supabase NO cobra por tener 2
  proyectos; el problema era la cuota agregada de la org (los 2 sumaban contra el mismo techo).
  → **La urgencia ya no existe:** con la poda estamos estables y gratis; la consolidación es
  ahora una mejora "para la larga", no una emergencia.

### Fase 1 — Paridad estructural: ✅ VERIFICADA (13/07, MCP solo lectura)
- **122 tablas con datos** en el `public` standalone. **Todas** existen en el schema `iarest`
  del destino. Comparación por hash de columnas (script): **0 tablas faltan**.
- Solo **2 tablas con drift**, y en ambas el destino es **superconjunto** (columnas extra que
  se rellenan NULL/default): `personal` (+`cocina_rol`,`partidas`) y `restaurantes`
  (+`modo`,`preaviso_activo`,`preaviso_auto_min`). **Ninguna columna del origen falta en
  destino** → la carga es copia limpia columna-a-columna, sin pérdida.

### Fase 3 — Código de la app: ✅ YA HECHO (no requiere PR nuevo)
- `apps/ia-rest/src/lib/supabase.ts` ya expone `SB_SCHEMA`/`SB_OPTS` dirigidos por
  `NEXT_PUBLIC_SUPABASE_SCHEMA` (default `public`). **Corte atómico y reversible por env.**
- Verificados los 5 `createClient` sueltos de rutas Next.js (`asesoria/*`, `asn/*`): **todos
  pasan `SB_OPTS`** → toda la app respeta el flag. Nada más que tocar en el código de la app.

### ⚠️ Fase 4 — Edge Functions: ALCANCE MUCHO MAYOR de lo previsto
- El plan asumía **2** funciones (`ig-video-gen`, `eventos-entorno`). La realidad (MCP
  `list_edge_functions`): **~48 Edge Functions ACTIVAS** en el standalone.
- Muchas en la **ruta crítica fiscal/pagos**: `enviar-verifactu`, `verifactu-sign`,
  `webhook-stripe`, `cobro-stripe`, `stripe-checkout`, `webhook-monei`, `cobro-monei`;
  toda la familia `qr-*` (session/order/cobro/split/call-waiter/connect/assistant),
  `auth-*` (pin-validate/register/verify-sms/recuperar-pin), `kds-token-validate`,
  `brain`/`brain-parse`/`ear-transcribe`/`vox-confirm` (voz), `courier-route`, `push-send`,
  `menu-stockout`, `check-elaboraciones`, `contact-lead`, `owner-panel`, monitores/crons.
- Cada una que accede a BD vía `supabase-js` con la URL del proyecto usa PostgREST → hoy
  resuelve `public`. Al portarlas al proyecto compartido resolverían el `public` COMPARTIDO
  (equivocado) salvo que se les fije `{ db: { schema: 'iarest' } }` y se redespliegue.
- **Implicación:** la Fase 4 no es "portar 2 funciones", es **portar+re-schema ~48**, varias
  fiscales. Eso convierte el cutover en un proyecto sustancial y sensible, no un PR mecánico.

- ⏳ **Pendiente / decisión:** con la urgencia de billing ya resuelta y el alcance real de
  Edge Functions (~48, fiscales incluidas), conviene decidir el **ritmo**: (a) seguir ahora
  con la ventana coordinada asumiendo el trabajo de las ~48 funciones, o (b) hacer la carga de
  datos + flip de app cuando toque pero **manteniendo las Edge Functions críticas fiscales en
  su sitio** hasta portarlas una a una con calma. La Fase 2 (carga destructiva) NO se ejecuta
  sin OK explícito + freeze + export previo.

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
