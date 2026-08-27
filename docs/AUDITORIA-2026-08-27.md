# Auditoría con contexto — monorepo `central` (27/08/2026)

**Rango:** HEAD `c75a8aa5` (tras mergear #1798 y #1799).
**Modo:** completo — install, radiografía, typecheck de las **11** apps, build real de
`apps/plataforma`, tests + guardianes, `pnpm audit`, advisors de Supabase, docs.
**Estado final:** 🟡 Una pasada sana con **un hallazgo 🔴 de seguridad multi-tenant** que NO se
toca aquí (gran radio) y 5 arreglos de bajo riesgo aplicados.

| Bloque | Estado |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ En sync |
| Radiografía (`mapa-funciones.generated.json`) | 🟡 Desfasada por deriva de líneas de #1798 → **regenerada** |
| Guardianes (`pnpm test:guardia`) | ✅ 75/75 |
| Tests (`pnpm test`, packages + apps) | ✅ Verde (incl. 53 de vitest y las suites por app) |
| Scope viejo `@iarest/*` | ✅ 0 (solo su propio test de regresión) |
| `ignoreCommand` en las 11 apps | ✅ 11/11 (ialimp sin `--sin-previews`, a propósito) |
| `transpilePackages` vs deps | 🟡 1 hueco en `plataforma` → **arreglado** |
| Typecheck 11/11 apps | 🟡 5 errores en `housesevillana` → **arreglados** (0 en las otras 10) |
| Build real de `apps/plataforma` | ✅ Verde antes y después del cambio |
| `pnpm audit --prod` | 🟡 5 vulns → **4** tras override de `nanoid` |
| Advisors Supabase (seguridad) | 🔴 **39 funciones `SECURITY DEFINER` mutables de `iarest` ejecutables por `anon` sin comprobar autorización** |
| Docs (`MATRIZ.md`) | 🟡 `apps/housesevillana` ausente + recuentos viejos → **arreglado** |

---

## 🔴 H1 — `iarest`: 39 RPC `SECURITY DEFINER` que mutan y las puede llamar `anon`

**Qué es.** En el schema `iarest` hay **39 funciones `SECURITY DEFINER`, volátiles (escriben),
expuestas como RPC y con `EXECUTE` concedido a `anon`, cuyo cuerpo no contiene ninguna
comprobación de autorización** (`is_super_admin`, `RAISE EXCEPTION`, `auth.uid`, ni lectura de
`current_setting`). Al ser `SECURITY DEFINER` corren con los privilegios del creador, así que la
RLS de las tablas que tocan **no las frena**.

Ejemplos con impacto claro:

| Función | Qué hace sin preguntar quién llama |
|---|---|
| `iarest.activar_plan(restaurante_id, …)` | Pone `plan_status='active'` y `max_camareros/mesas/secciones = 999` en **cualquier** restaurante |
| `iarest.cancelar_plan(...)` | El inverso |
| `iarest.registrar_cobro_caja(...)` | Escribe cobros |
| `iarest.onboarding_restaurante(...)` / `sembrar_restaurante_nuevo(...)` | Siembran estructura en cualquier restaurante |
| `iarest.rpc_modificar_comanda_item(...)` | Modifica comandas |
| `iarest.purge_old_*` (5) | Borran logs de auditoría/seguridad |

Contraejemplo que demuestra que el patrón correcto SÍ existe en el repo:
`iarest.super_get_all_restaurantes()` empieza con `IF NOT is_super_admin() THEN RAISE EXCEPTION
'No autorizado'`. Es exactamente la guarda que a estas 39 les falta.

**Alcanzabilidad — lo que está comprobado y lo que no.**
- ✅ Comprobado en `pg_proc`: las 39 tienen `prosecdef`, son volátiles, no son funciones de
  trigger y `has_function_privilege('anon', oid, 'EXECUTE')` = `true`.
- ✅ Comprobado en el código: los clientes de navegador de ia-rest se construyen con la **anon
  key** y `db.schema = NEXT_PUBLIC_SUPABASE_SCHEMA` (= `iarest` en la BD unificada;
  `apps/ia-rest/src/lib/supabase.ts:11-14`). Para que la app funcione, PostgREST tiene que
  exponer el schema `iarest` a `anon` — y la anon key viaja en el bundle del navegador, o sea
  que es pública por diseño.
- ❌ **NO comprobado con una llamada HTTP real.** Se intentó una sonda de solo lectura contra
  una RPC ya protegida (`super_get_all_restaurantes`, que responde «No autorizado») y el
  sandbox bloqueó el `curl`. **No se ha ejecutado ninguna función que escriba**, ni se hará sin
  permiso. Queda como el único paso que falta para pasar de «alcanzable según la configuración»
  a «alcanzable, medido».

**Radio de daño HOY: prácticamente nulo, y por eso es el momento.** En `iarest`: 2 restaurantes,
**0 con plan activo**, **0 comandas**, 14 camareros — datos de demo, sin tráfico real. Aplica
literal el principio de `CLAUDE.md`: «los cambios que ROMPEN se hacen AHORA (sin clientes)».

**Acción manual de Alberto (NO ejecutada aquí — gran radio).** Dos caminos:

1. **Revocar en bloque y re-conceder lo que la app use de verdad** (recomendado):
   ```sql
   -- 1. inventario de lo que se revoca (guardar la salida ANTES)
   SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='iarest' AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
   -- 2. revocar
   REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA iarest FROM anon;
   -- 3. re-conceder UNA a UNA las que el navegador llama de verdad
   --    (login_pin, validate_pin_with_rate_limit, set_tenant_context, … tras revisarlas)
   ```
   **Rollback:** `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA iarest TO anon;` deja el estado
   exactamente como está hoy.
   **Riesgo:** si alguna pantalla llamaba a una RPC no re-concedida, deja de funcionar — con 0
   comandas y 0 planes activos el coste de descubrirlo es bajo.

2. **Añadir la guarda dentro de cada función** (`IF NOT … THEN RAISE EXCEPTION`), como
   `super_get_all_restaurantes`. Más fino, pero son 39 funciones y hay que decidir el criterio
   de autorización de cada una.

Lo sensato es (1) primero, que es reversible en una línea, y (2) después para las que se
re-conceden.

### Resto de advisors (482 en total)
- **321 `rls_enabled_no_policy` (INFO)** — tablas con RLS y sin políticas = deniegan por defecto
  a `anon`/`authenticated`. Es la postura buscada (las apps entran con roles `BYPASSRLS`). No es
  hallazgo.
- **2 `extension_in_public` (WARN)** — `pg_net` y `vector` en `public`. Conocido, sin acción.
- **1 `function_search_path_mutable` (WARN)** — `public.pricing_factor_aforo`. Menor: fijarle
  `SET search_path` cuando se toque esa función.
- **0 `rls_policy_always_true`, 0 `security_definer_view`.** ✅

---

## Arreglado en esta auditoría (bajo riesgo, verificado)

1. **`apps/plataforma/next.config.ts`** — `@central/module-ses` estaba en `dependencies` pero
   NO en `transpilePackages`, siendo la única de las 11 apps con un hueco así.
   ⚠️ **Medido, no supuesto:** el build **ya funcionaba sin él** (pnpm symlinkea el package a
   `packages/module-ses`, fuera de `node_modules` real, y Next lo compila como código del
   proyecto). Se construyó `apps/plataforma` entera antes y después: verde las dos veces, con
   `/api/sivra/ses/probar` y `/api/cron/ses-latido` compiladas. O sea que **no era un 🔴**: se
   corrige por coherencia, no porque rompiera.
2. **`apps/housesevillana/tsconfig.json`** — 5 errores `TS5097`: sus tests importan con extensión
   `.ts` explícita (convención de `node --test` del repo) y al tsconfig le faltaba
   `allowImportingTsExtensions`. Añadido → 0 errores. Es lo que ya hacen `ialimp` y `rrhh`.
3. **`package.json` (raíz)** — override `nanoid: '>=3.3.18 <4'`. Resolvía a `3.3.16` (vulnerable,
   GHSA high) vía `next>postcss>nanoid`. Ahora `3.3.18`; `pnpm audit --prod` baja de 5 a 4.
4. **`MATRIZ.md`** — ver H2.
5. **`docs/mapa-funciones.generated.json`** — regenerada (deriva de líneas de #1798).

---

## 🟡 H2 — `MATRIZ.md` no tenía `apps/housesevillana`

La landing lleva **en el monorepo desde el 12/08/2026** y no aparecía ni en el árbol ni en la
tabla de verticales. Es la misma clase de invisibilidad que `CLAUDE.md` documenta como causa de
haber afirmado por error que «no había web» (PR #1387→#1388): entonces estaba fuera del repo,
ahora estaba dentro pero fuera del mapa. Añadida en los dos sitios.

De paso: el recuento decía «38 packages (26 `module-*`)» y son **40 (28 `module-*`)**; y el
encabezado «Verticales (las 3 son hermanas)» venía de cuando había 3 — ahora hay 11.

## 🟡 H3 — 3 packages sin ningún consumidor

`@central/module-agenda`, `@central/module-encargo`, `@central/module-revenue`: nadie los declara
en `dependencies` ni los importa. `module-encargo` sí está *citado* en comentarios de
`module-transporte` y `module-alquiler` como el agregado genérico previsto. Parecen adelantados a
su vertical. **No se toca nada** — queda anotado para decidir si se consumen o se retiran.

## 🟡 H4 — 4 vulnerabilidades que se dejan a propósito

| Paquete | Sev. | Vía | Por qué no se toca |
|---|---|---|---|
| `xlsx` ×2 | high | `ialimp>xlsx` | Sin parche en npm. ialimp **solo escribe** xlsx, nunca parsea → no explotable. Ya documentado. |
| `deepmerge-ts` 7.1.5 | high | `plataforma>mailparser>html-to-text` | Requiere v8 (major). `html-to-text` lo usa para fusionar **opciones**, no el correo entrante → no alcanzable por el atacante. Forzar el major arriesga el triaje de correo. |
| `file-type` 16.5.4 | moderate | `ialimp>jimp>…` | El parche es la v21 (salto de 5 majors, ESM-only); `jimp` lo pinnea. Un override rompería jimp. |

## 🟡 H5 — `housesevillana` no estaba en la matriz de typecheck del CI

La causa raíz de H-arreglo-2: la app entró en el monorepo el **12/08/2026** y nunca se añadió a la
matriz de `tests.yml`, así que **nadie la typechequeaba**. Sus 5 errores `TS5097` llevaban 15 días
ahí. Se ha añadido a la matriz (ya en verde en local) y se ha anotado en `CLAUDE.md` que dar de alta
una app incluye meterla en la matriz, igual que el `ignoreCommand`.

De paso: la matriz tiene ahora **11 apps** (entró `asegura` el 26/08), mientras la tabla de
`CLAUDE.md` lista **9** como requeridos. Los dos nuevos corren, pero **no consta** que el ruleset los
exija — no se puede leer el ruleset desde aquí, así que se documenta como lo que es y no se afirma.

## 🔵 Observaciones (sin acción)

- **El job `Build` del CI solo construye `apps/ia-rest`** (`ci.yml`, `working-directory:
  apps/ia-rest`). Las otras 10 apps no las construye nadie salvo Vercel, y desde `--sin-previews`
  solo al llegar a `main`. El typecheck de `tests.yml` sí las cubre, pero **typecheck ≠ build**:
  un fallo de bundling (webpack, WASM, `transpilePackages`) solo aparecería en producción. Por eso
  esta auditoría construyó `plataforma` a mano.
- **Vercel:** `list_projects` devolvió 5 proyectos, pero el comentario del bot en el PR #1799
  enumera 9 (falta paginación en la herramienta, no faltan proyectos). Sin proyecto Vercel:
  `mariscos` y `asegura` — ambos ya declarados como pendientes en `CLAUDE.md`.
- **Supabase:** `list_projects` devuelve **solo** `central` (`wswbehlcuxqxyinousql`). El viejo
  `efncqyvhniaxsirhdxaa` sigue borrado. ✅
- La propia skill `auditoria-central` dice «8 verticales» y lista 8; hay **11**. Conviene
  actualizarla en su siguiente pasada.
