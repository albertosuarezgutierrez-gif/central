# Edge Functions rescatadas del panel de Supabase

> **Qué es esto.** El proyecto Supabase `wswbehlcuxqxyinousql` sirve **67** Edge Functions.
> El monorepo solo versionaba **45** (`apps/ia-rest/supabase/functions/`). Las **22** restantes
> se ejecutaban en producción **sin código fuente en ningún repositorio**: solo existían en los
> servidores de Supabase. Sin historia, sin revisión, sin vuelta atrás.
>
> Esta carpeta las rescata: **las 22, completas**. Se bajaron con `get_edge_function` del MCP de
> Supabase el 20/08/2026.

## 🔴 Hallazgo 1: credenciales en claro

Seis de las 22 llevaban una credencial **incrustada en el código fuente**, no en variable de
entorno. **Tres** Personal Access Tokens de GitHub distintos, más una contraseña personal:

| Credencial | Funciones que la llevan | A qué da acceso |
|---|---|---|
| PAT `ghp_97Ct…` | `add-smoobu-booking`, `merge-landing-to-main`, `upload-landing`, `upload-photo-github`, `push-clean-page`, `deploy-agente`, `drive-photos-publish` | repo `albertosuarezgutierrez-gif/roi-intranet` |
| PAT `ghp_5MfB…` | `github-commit` | repo `albertosuarezgutierrez-gif/roi-intranet` |
| PAT `ghp_hft2…` | `push-route-ga4` | repo `albertosuarezgutierrez-gif/house-sevillana-landing` |
| **Email + contraseña de Alberto** | `trigger-deploy` | login en `housesevillana.vercel.app` |
| Deploy hook de Vercel (proyecto `sivra`) | `trigger-redeploy` | dispara despliegues a producción sin autenticar |
| Anon key legacy de Supabase (dentro de un blob base64) | `push-route-ga4` | ver nota en su cabecera: la copia del blob está **corrupta** y no autentica |

**En los ficheros de esta carpeta esos valores están SUSTITUIDOS** por `Deno.env.get(...)`.
El repo `central` es **público**: volcar las fuentes tal cual habría publicado los tres tokens y
la contraseña, que es exactamente el incidente de la `service_role` de `house-sevillana-landing`
repetido.

⚠️ **La sustitución es solo en el repo. La función DESPLEGADA sigue con el secreto incrustado**
hasta que se redespliegue. Sustituir aquí **no revoca nada**. Acciones manuales de Alberto:

1. Revocar los **tres** PAT en GitHub → Settings → Developer settings → Personal access tokens.
2. **Cambiar la contraseña** que iba en claro en `trigger-deploy`.
3. Regenerar el deploy hook en Vercel → `sivra` → Settings → Git → Deploy Hooks.
4. Crear el secreto `GITHUB_TOKEN` en los secretos de Edge Functions antes de redesplegar nada.

## 🚨 Hallazgo 2: seis endpoints SIN AUTENTICAR que hacen daño

Más grave que la fuga, porque no se arregla revocando nada. **19 de las 22 tienen
`verify_jwt = false`** (solo `junta-pdf-texto`, `rehost-catalogo` y `trigger-redeploy`
exigen clave, y la última está desactivada). En seis de ellas eso significa que
*cualquiera que conozca la URL* provoca un efecto real:

| Función | Qué puede hacer un desconocido |
|---|---|
| `trigger-deploy` | Llamarla y **recibir en la respuesta las cookies de sesión de Alberto** en `housesevillana.vercel.app` (`cookies: allCookies`). Se autentica sola con la contraseña incrustada y devuelve el resultado a quien pregunte. |
| `upload-landing` | **Commitear CUALQUIER fichero a `main` de `roi-intranet`** — acepta `path` y `content` del cuerpo. Sin login, sin traza de autoría. |
| `sync-smoobu` | Disparar la sincronización que **borra filas de `incomes`** (ver aviso abajo) y quemar cuota de la API de Smoobu. |
| `upload-photo-github` | Escribir ficheros en `public/fotos/` de `roi-intranet`. `filename` sin sanear. |
| `drive-upload-factura` | Meter filas en la tabla `gastos` y ficheros en el Drive de Alberto. |
| `inject-ga4` | Borrar y reinsertar las filas de `_deploy_assets` (el contenido de una landing). |

`trigger-deploy`, `upload-landing` y `upload-photo-github` no tienen arreglo que las haga
aceptables tal cual: **borrar**. Las otras tres sostienen (o sostuvieron) un flujo real, así que
la decisión es cerrarlas con auth o retirarlas.

## ☠️ Hallazgo 3: `sync-smoobu` puede vaciar `incomes` sin que falle nada

Es la única de las 22 que corre **sola y a diario** (cron `pg_cron` jobid 1, 05:00), y su
algoritmo es: pedir a Smoobu las reservas, y **borrar de `incomes` toda fila cuyo
`reservationId` no aparezca en la respuesta**. El guardián solo cubre el fallo ruidoso:

```ts
if (!resp.ok) return new Response(... 500)        // ✅ un error HTTP aborta
const bookings = data.bookings || []
if (bookings.length === 0) break                  // ⚠️ un 200 VACÍO no aborta: sale del bucle
...
if (!smoobuIds.has(resId)) { await supabase.from('incomes').delete()... }   // ☠️ borra TODO
```

Si Smoobu responde **200 con la lista vacía** —clave degradada, cambio de API, límite de
peticiones, mantenimiento— `smoobuIds` queda vacío y el paso 3 **borra todos los ingresos** del
rango (−365/+730 días). Y el resultado saldría `success: true`, con `deleted: N`. Es literalmente
el caso que prohíbe la regla de CLAUDE.md: *«un `catch` que devuelve `[]` no autoriza a afirmar
que no hay nada»*, aquí en su versión cara — no afirma, **borra**.

Arreglo mínimo cuando se decida dónde vive esta función: no borrar nada si la primera página
vuelve vacía, y exigir que el borrado no supere un porcentaje del total antes de ejecutarse.

## Cómo se verificó

`gitleaks 8.21.2` sobre el repo entero antes de cada commit. Es la comprobación que importa: la
sustitución a mano no vale como garantía, y una fuga nueva en un repo público no tiene deshacer.

## Las 22, una a una

`JWT` = tiene `verify_jwt` activo (exige clave para llamarla).

| Función | JWT | Secreto sustituido | Qué es |
|---|:--:|---|---|
| `sync-smoobu` | ❌ | — | ☠️ **VIVA**: cron `pg_cron` jobid 1, diario 05:00. Lee la `service_role` legacy y **borra filas de `incomes`** (ingresos de SIVRA). Ver hallazgo 3 |
| `boe-doc` | ❌ | — | 🟢 **VIVA**: puente Fase 3 subastas de `apps/plataforma` para leer adjuntos del BOE. Solo lee, host en lista blanca |
| `junta-pdf-texto` | ✅ | — | 🟢 **VIVA**: igual que `boe-doc` para las fichas PDF de la Junta. **La única bien cerrada del lote** |
| `ficha-fotocasa` | ❌ | — | 🟢 **VIVA**: proxy de fichas de Fotocasa (bloquea el egress de Vercel, no el de Supabase) |
| `zona-fotocasa` | ❌ | — | 🟢 **VIVA**: referencia €/m² por zona para valorar lotes de subasta |
| `rehost-catalogo` | ✅ | — | Migración por lotes de las fotos del catálogo de Joaquín Jaén al bucket `catalogo`. Borrar si `remaining = 0` |
| `drive-upload-factura` | ❌ | — | 🚨 Sube facturas a Drive + inserta en `gastos`. **Escritura sin autenticar**; decidir si sigue viva |
| `upload-landing` | ❌ | PAT `ghp_97Ct…` | 🚨🚨 **Escritura arbitraria sin autenticar** a `main` de `roi-intranet`. Borrado prioritario |
| `upload-photo-github` | ❌ | PAT `ghp_97Ct…` | 🚨 Segundo endpoint de escritura sin autenticar (a `public/fotos/`) |
| `inject-ga4` | ❌ | — | 🚨 Borra y reinserta las filas de `_deploy_assets` para meter GA4 en la landing. Sin autenticar |
| `push-route-ga4` | ❌ | PAT `ghp_hft2…` + anon key | 🔑 Dos credenciales. Commitea el `app/route.ts` de `house-sevillana-landing` |
| `trigger-deploy` | ❌ | **email + contraseña** | 🔑🔑🚨 Se logueaba con las credenciales personales de Alberto en claro **y devuelve las cookies de sesión a quien la llame** |
| `trigger-redeploy` | ✅ | deploy hook de `sivra` | Desactivada (devuelve `disabled`). Lo único que hacía era filtrar el hook |
| `github-commit` | ❌ | PAT `ghp_5MfB…` | Commitea a `roi-intranet` lo que haya en la tabla `_deploy_queue` |
| `deploy-dashboard` | ❌ | — | Recibe el token de GitHub **por query string** (`?t=`) → queda en logs e historial |
| `deploy-agente` | ❌ | PAT `ghp_97Ct…` | Parche de una tarde: sube `route.ts` + `page.tsx` del «agente» a `roi-intranet` |
| `push-clean-page` | ❌ | PAT `ghp_97Ct…` | Parche de una tarde: sobrescribe un `page.tsx` con un blob de ~11 KB |
| `add-smoobu-booking` | ❌ | PAT `ghp_97Ct…` | Un solo uso: inyectó el motor de Smoobu en `roi-intranet` |
| `merge-landing-to-main` | ❌ | PAT `ghp_97Ct…` | Un solo uso: restauró un `middleware.ts` |
| `drive-photos-publish` | ❌ | PAT `ghp_97Ct…` | Un solo uso: subió 4 fotos de Drive a una rama. Muere en cuanto el destino cambia una coma |
| `drive-folder-list` | ❌ | — | Sonda: lista los ficheros de una carpeta pública de Drive. Paso previo de la anterior |
| `import_csv` | ❌ | — | **Cascarón vacío**: devuelve `{ok:true, msg:"placeholder"}` sin hacer nada. Ojo, se pone verde solo |

Tres funciones NO son copia literal (`push-clean-page`, `deploy-agente`, `push-route-ga4`):
llevaban ficheros enteros incrustados en base64 y ese blob se elidió. En las dos primeras por
tamaño (~11 y ~16 KB de ruido); en `push-route-ga4` porque el blob contenía una credencial.
Cada cabecera lo dice. El original íntegro sigue en el panel mientras la función exista.

## Qué NO es esta carpeta

**No es el sitio definitivo de este código.** Es un salvavidas: saca las fuentes de un único
punto de fallo. La decisión de a qué app va cada una está pendiente y no todas son de `ia-rest`
—`sync-smoobu` y `add-smoobu-booking` son de SIVRA; `boe-doc`, `junta-pdf-texto`,
`ficha-fotocasa` y `zona-fotocasa` son de subastas en `apps/plataforma`; `rehost-catalogo` es de
`apps/almacen`—. La mayoría son parches de una tarde que se quedaron desplegados: para esas lo
que toca es **borrarlas del panel**, no colocarlas.

Nada de esta carpeta se despliega ni se construye: no hay `vercel.json` ni entra en ningún build.
