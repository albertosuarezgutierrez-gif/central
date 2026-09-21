# PostHog de la correduría — la alerta de CIMA miente y hay dos sondas CIEGAS (21/09/2026)

> **Titular:** la alerta «CIMA pull heartbeat — cron no completó en 25h» que llega al correo de
> Alberto es **falsa**: la ingesta de CIMA funciona. Lo que está roto es la telemetría. Y de paso se
> destapa algo peor que el ruido: **dos alertas de seguridad llevan 3 semanas ciegas** y nadie se
> había enterado, porque miran una tabla que dejó de recibir filas el 31/08.

## 1. Lo medido (21/09/2026, 09:30 UTC)

| Qué | Dónde se midió | Resultado |
|---|---|---|
| ¿Corre el cron? | `seguros.operational_events` (central) | **55** `cima_pull_completed` en 15 días; último **20/09 14:47 UTC** |
| ¿Entran ficheros? | `seguros.cima_ficheros` | Occident POL+REC el **20/09**; Reale REC el 18/09; Generali POL el 14/09 |
| ¿GitHub Actions? | runs de `cima-pull.yml` | 4 runs el 20/09, **todos `success`** |
| ¿Qué ve PostHog? | `events` del proyecto 167360 | **0 eventos de CUALQUIER tipo desde el 05/09/2026 16:06** (Madrid) |
| ¿Es cuota? | billing del proyecto | No: **80 eventos de 1.000.000** en el periodo, plan free |
| ¿Y el data warehouse? | `postgres.operational_events` | Última fila **31/08/2026**. La sync corre a diario y sale «Completed» |

O sea: la ingesta está sana, la BD lo sabe, y **PostHog no se ha enterado de nada desde el 05/09**.

## 2. Por qué no lo arregló el PR asegura#834 (17/09)

Aquel PR (`drainAnalytics`, drenar la telemetría antes de que muera la función del cron) partía de un
diagnóstico que hoy no se sostiene: decía que `cima_pull_completed` dejó de llegar **el 13/09**. El
último evento real en PostHog es del **05/09**, y **cayeron TODOS los eventos a la vez** —
`magic_link_clicked` y `auth_signin_method` incluidos, que no salen de ningún cron. Un fallo de flush
en un cron no puede apagar los eventos de la web. La causa es común a toda la app, no del cron.

**Causa CONFIRMADA (21/09/2026, medida en el panel de Vercel):** el proyecto Vercel `asegura`
**no tiene ninguna variable de PostHog**. Ni `NEXT_PUBLIC_POSTHOG_KEY` ni `NEXT_PUBLIC_POSTHOG_HOST`,
ni en las del proyecto ni en las compartidas del equipo, en ningún entorno: buscar «POSTHOG» da «No
Results Found». No están mal puestas — no existen.

Y son exactamente las dos que el código exige: `src/lib/analytics/posthog-server.ts` construye el
cliente solo si `key` **y** `host` están presentes, y si falta cualquiera devuelve `null`, con lo que
`captureServer` es un **noop silencioso** — sin excepción, sin log, sin nada que se vea.
`posthog-browser.ts` hace la misma comprobación. Con eso, la app deja de mandar telemetría sin que
nada falle, que es justo lo que se midió: cero eventos de cualquier tipo desde el 05/09.

⚠️ **Lo que sigue sin saberse: cuándo y por qué desaparecieron.** Vercel no guarda historial de
variables borradas, así que el panel dice qué hay hoy, no qué hubo. Lo que sí encaja es la fecha: el
05/09 hubo una tanda de deployments a producción tocando dominio y crons (asegura#817, #818 y su
revert #819, este último en producción sobre las 16:07 CEST). **Es coincidencia temporal, no una
causa probada.**

🔧 **El arreglo, y el detalle que lo hace fallar si se salta:** `NEXT_PUBLIC_*` se **inlinea en el
build**, no se lee en runtime. Añadir las dos variables NO revive la telemetría por sí solo: hace
falta un **redeploy que reconstruya** (sin reutilizar la caché de build). Valores: la key es el
`api_token` público del proyecto PostHog 167360 —la de ingesta, la que va en el cliente, no un
secreto— y el host es `https://eu.i.posthog.com` (EU por residencia de datos, RGPD).

## 3. Lo que de verdad asusta: dos alertas VERDES porque no miran nada

La fuente Postgres del data warehouse de PostHog apunta a
**`posthog_readonly.uijsgeocgdaxkhvwtjqs`** — el Supabase **VIEJO de Manuel**, la foto congelada que
dejó de recibir escrituras con el traspaso a central (02/09/2026). La sync sigue corriendo cada
noche y reporta «Completed» sobre una tabla que ya no crece: `postgres_operational_events` se quedó
en **3.679 filas, última del 31/08**.

Encima de esa tabla viven dos alertas de Manuel, las dos en `Not firing` con `last_value: 0`:

- **[A1] Auth sign-in failures > 30/h** (`auth_sign_in_failure`)
- **[A14] Webhook signature failures > 5/h** (`webhook_signature_invalid`)

No están tranquilas: **están ciegas**. Y se leen mal con facilidad: el panel de esa
fuente dice «Completed», «incremental cada 6 h» y «último sync hoy», que es exactamente el aspecto de
una tubería sana. Al revisarla el 21/09 se dio por buena por eso mismo. Lo que delata el fallo no es
el estado del sync, sino la ÚLTIMA FILA de la tabla. Es exactamente el fallo que `CLAUDE.md` marca como el más
caro — «un check que se pone verde porque la consulta no devolvió nada». Un ataque de fuerza bruta o
una firma de webhook falsificada desde el 31/08 no habría disparado nada.

## 4. Qué hacer (propuesta, decide Alberto)

1. **No silenciar el heartbeat.** Arreglar la fuente. Silenciarlo le quita a Manuel la única
   vigilancia que le queda de la ingesta. Si el ruido diario molesta mientras tanto, el gesto
   correcto es un **snooze de 48 h**, no `enabled: false`.
2. **Repuntar la fuente del warehouse al Supabase de central** (`wswbehlcuxqxyinousql`, schema
   `seguros`) con un rol readonly propio. Eso devuelve la vista a A1 y A14 de una vez, y es el
   arreglo de fondo.
3. **Y entonces repuntar el propio heartbeat de CIMA al warehouse** (HogQL sobre
   `seguros.operational_events`) en vez de al evento de API. La BD ya es la fuente de verdad del
   cron; el evento de PostHog es un eslabón *fire-and-forget* de más, y es justo el que se ha roto
   dos veces. Con eso, este falso positivo no puede repetirse.
4. **Restaurar las envs de PostHog en Vercel** (con redeploy) si se quiere recuperar la telemetría de
   producto (la de la web y el auth). Es independiente de los puntos 2-3.

Los puntos 1-3 se tocan en la cuenta de PostHog y el 4 en Vercel: **nada de esto es código de este
repo**, y el 2 toca una credencial de BD, así que no se hace sin OK explícito.

## 5. Cabo suelto menor, para vigilar

`cima-health-alert` (el vigilante de la ingesta, diario ~13:54 UTC) **falló el 20/09** con
`curl: (22) ... error: 401` contra `https://app.grupoasegura.com/api/internal/cima/quarantine`.
Es **1 fallo de 92 runs** y el anterior (19/09) salió verde, así que hoy no es una avería declarada:
puede ser un deployment en vuelo. Pero un 401 significa que la ruta existe y **rechaza la
credencial** (`INTERNAL_API_SECRET` / `VERCEL_PROTECTION_BYPASS_SECRET`), que es el patrón de
«rotación sin actualizar al consumidor» ya conocido en esta casa. **Si vuelve a fallar hoy, es
avería** — y con él cae el único aviso automático de que la ingesta se ha parado.

---

## Prompt para Claude en Chrome (SOLO LECTURA)

```
Trabaja en modo SOLO LECTURA. No cambies ninguna configuración, no borres, no despliegues, no
rotes claves y NUNCA copies aquí el VALOR de un secreto o de una variable de entorno: solo su
NOMBRE, si existe o no, en qué entornos está y la fecha de última edición. Ya estoy logueado en
Vercel y en PostHog.

Contexto: la alerta «CIMA pull heartbeat — cron no completó en 25h» del proyecto PostHog «Grupo
ASegura App» lleva días disparándose, pero la ingesta de CIMA está SANA (verificado en la base de
datos y en GitHub Actions). El problema es que PostHog no recibe NINGÚN evento desde el
05/09/2026. Quiero saber por qué.

TAREA 1 — Vercel (proyecto `asegura`, el que sirve app.grupoasegura.com)
1. Abre https://vercel.com → equipo «Pisos turisticos» → proyecto `asegura` → Settings →
   Environment Variables.
2. Busca `POSTHOG`. Dime exactamente:
   - ¿Existe `NEXT_PUBLIC_POSTHOG_KEY`? ¿Y `NEXT_PUBLIC_POSTHOG_HOST`?
   - Para cada una que exista: ¿en qué entornos está marcada (Production / Preview / Development)?
     ¿qué fecha de última edición muestra? ¿quién la editó?
   - Si alguna NO aparece, dilo explícitamente («no existe»), no lo des por supuesto.
3. Ve a la pestaña Deployments del mismo proyecto y dime la fecha y hora del deployment que está
   ahora mismo en Production, y si hubo algún deployment el 05/09/2026.

TAREA 2 — PostHog, fuente de datos
1. Abre https://eu.posthog.com/project/167360/data-management/sources
2. Abre la fuente Postgres y dime: el host, el usuario, la fecha del último sync, y el estado y
   `last_synced_at` del schema `operational_events`.
3. Sin cambiar nada: dime si en la interfaz existe la opción de editar la conexión (host/usuario/
   contraseña) de esa fuente, o si habría que crear una fuente nueva.

TAREA 3 — PostHog, las tres alertas
1. Abre https://eu.posthog.com/project/167360/alerts
2. Para «CIMA pull heartbeat — cron no completó en 25h», «[A1] Auth sign-in failures > 30/h» y
   «[A14] Webhook signature failures > 5/h», dime: estado actual, último valor, última notificación
   y a quién notifica.
3. Dime si la interfaz ofrece un botón de «snooze» en la alerta del heartbeat y qué duraciones
   permite. NO la snoozees: solo dime si se puede y cómo.

Cuando termines, dame un resumen corto con los hallazgos de las tres tareas, y di explícitamente
qué NO pudiste comprobar y por qué.
```

---

## Resultado de la pasada por navegador (21/09/2026)

- **Vercel:** ninguna variable `POSTHOG` en el proyecto `asegura`, ni propia ni compartida, en
  ningún entorno. Deployment vivo en producción: el de asegura#844, de hace ~22 h.
- **PostHog, fuente Postgres:** host `aws-1-eu-central-1.pooler.supabase.com`, usuario
  `posthog_readonly.uijsgeocgdaxkhvwtjqs` (el Supabase VIEJO), último sync del día, schema
  `operational_events` «Completed», 3.679 filas. **La conexión SÍ se puede editar in situ**
  (pestaña Configuration del source): no hace falta crear una fuente nueva para repuntarla a central.
- **Alertas:** el heartbeat de CIMA en `Firing` (última notificación de esa misma mañana); A1 y A14
  en `Not firing` con valor 0. Las tres notifican a Alberto por email y al Slack `#asegura-alerts`.
- **Snooze:** existe, con 30 min / 1 h / 4 h / 24 h / fecha a medida. **El máximo predefinido son 24
  h**, así que silenciar no es una solución que aguante: a lo sumo compra un día.
