# Edge Functions rescatadas del panel de Supabase

> **Qué es esto.** El proyecto Supabase `wswbehlcuxqxyinousql` sirve **67** Edge Functions.
> El monorepo solo versionaba **45** (`apps/ia-rest/supabase/functions/`). Las **22** restantes
> se ejecutaban en producción **sin código fuente en ningún repositorio**: solo existían en los
> servidores de Supabase. Sin historia, sin revisión, sin vuelta atrás.
>
> Esta carpeta las rescata. Se bajaron con `get_edge_function` del MCP de Supabase el 20/08/2026.

## 🔴 Lo que apareció al abrirlas: credenciales en claro

Tres de las primeras que se miraron llevaban un **Personal Access Token de GitHub incrustado en
el código fuente**, no en una variable de entorno. Dos tokens distintos:

| Token (prefijo) | Funciones que lo llevan | Repo al que da acceso |
|---|---|---|
| `ghp_97Ct…` | `add-smoobu-booking`, `merge-landing-to-main` | `albertosuarezgutierrez-gif/roi-intranet` |
| `ghp_5MfB…` | `github-commit` | `albertosuarezgutierrez-gif/roi-intranet` |

**En los ficheros de esta carpeta esos valores están SUSTITUIDOS** por `Deno.env.get('GITHUB_TOKEN')`.
El repo `central` es **público**: volcar las fuentes tal cual habría publicado los tokens, que es
exactamente el incidente de la `service_role` de `house-sevillana-landing` repetido.

⚠️ **La sustitución es solo en el repo. La función DESPLEGADA sigue con el token incrustado**
hasta que se redespliegue. Sustituir aquí no revoca nada: **hay que revocar los dos tokens en
GitHub → Settings → Developer settings → Personal access tokens**, y crear el secreto
`GITHUB_TOKEN` en los secretos de Edge Functions antes de redesplegar.

Cada fichero rescatado lleva en cabecera qué se le tocó. **Ninguna otra línea se ha modificado.**

## Cómo se verificó

`gitleaks 8.21.2` sobre esta carpeta antes de commitear. Es la comprobación que importa: la
sustitución a mano no vale como garantía, y una fuga nueva en un repo público no tiene deshacer.

## Estado de cada función

| Función | Secreto sustituido | Notas |
|---|---|---|
| `sync-smoobu` | — | 🔴 **VIVA**: cron `pg_cron` jobid 1, diario 05:00. Lee la `service_role` legacy y **borra filas de `incomes`** (ingresos de SIVRA) |
| `github-commit` | PAT `ghp_5MfB…` | Commitea a `roi-intranet` lo que haya en la tabla `_deploy_queue` |
| `add-smoobu-booking` | PAT `ghp_97Ct…` | Un solo uso: inyectó el motor de Smoobu en `roi-intranet`. Candidata a borrar |
| `merge-landing-to-main` | PAT `ghp_97Ct…` | Un solo uso: restauró un `middleware.ts`. Candidata a borrar |

*(Las 18 restantes se añaden conforme se rescatan; esta tabla es el índice.)*

## Qué NO es esta carpeta

**No es el sitio definitivo de este código.** Es un salvavidas: saca las fuentes de un único
punto de fallo. La decisión de a qué app va cada una está pendiente y no todas son de `ia-rest`
—`sync-smoobu` y `add-smoobu-booking` son de SIVRA, `boe-doc` y `junta-pdf-texto` huelen a
subastas, `ficha-fotocasa`/`zona-fotocasa` a inmobiliario—. Varias son parches de una tarde que
se quedaron desplegados y lo que toca es borrarlas del panel, no colocarlas.

Nada de esta carpeta se despliega ni se construye: no hay `vercel.json` ni entra en ningún build.
