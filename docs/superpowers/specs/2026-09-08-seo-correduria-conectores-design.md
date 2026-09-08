# SEO de la correduría: conectores + cron semanal — diseño

> Dictado por Alberto, 08/09/2026: «lo que quiero es controlar las visitas y sobre todo para el
> agente de SEO… porque tendrá que analizar competencia e ir posicionando la web, ¿no?». Y después:
> «lo que veas mejor, haz lo que tú puedas y lo que yo tenga que hacer pásame prompt para Claude
> Chrome». Este documento es lo que se decidió con esa delegación; lo que solo puede hacer Alberto
> (paneles) está en §7.

## 1. El problema, medido

- La skill `seo-asegura` **corre a mano**. La rutina semanal está «pendiente de crear» desde mayo
  (`docs/SKILLS.md`, `docs/ASEGURA-MARKETING-PLAN.md:284`). Un canal que se toca cuando alguien se
  acuerda no produce nada — la propia skill dice que su mayor riesgo es el abandono.
- Sus fuentes de datos **las pega una persona**. Search Console está verificada desde el 17/05/2026
  y con sitemap enviado el 05/09, pero «no hay conector: los datos existen y hay que pegarlos a
  mano» (`SKILL.md:87`). La única lectura que existe es manual, de junio a septiembre: **350
  impresiones, 0 clics, posición media 47,1**. La web es invisible en Google.
- El estudio de competencia (`docs/ASEGURA-COMPETENCIA-POSICIONAMIENTO.md`) se escribió **sin
  salida a internet**: cero SERP reales, todo `[Suposición]`.
- PostHog SÍ mide en `grupoasegura.es` (verificado en paneles el 08/09/2026: Cookiebot + PostHog EU,
  proyecto 266897, visitas reales), pero **nadie lo lee desde el código**: no hay ninguna llamada
  server-side a su API en el repo. Y `docs/ASEGURA-SEO-REDES-IDEAS.md:381-384` aún dice «Not live»
  — es falso desde el 05/09 y esta sesión lo repitió sin medirlo (PR #2618).

Lo que Alberto llama «controlar las visitas» hoy sería mirar un cero durante meses. Lo que mueve
la aguja es **contenido guiado por posiciones reales**, y para eso el agente necesita los datos
sin que nadie se los pegue.

## 2. Lo que se construye

Un **cron semanal en `apps/plataforma`** (`/api/cron/seo-correduria`, lunes 08:30 UTC) que lee
tres fuentes, guarda una foto semanal en BD y manda un resumen por Telegram con **una** acción
propuesta. La skill `seo-asegura` pasa a leer esa foto en vez de pedir datos a mano.

| Fuente | Qué contesta | Cómo se lee | Requiere de Alberto |
|---|---|---|---|
| **Google Search Console** (`sc-domain:grupoasegura.es`) | por qué consultas aparece la web, impresiones, clics, posición — **la única fuente sin sesgo** | API `searchAnalytics/query`, cuenta de servicio de Google (JWT RS256 → access token) | crear la cuenta de servicio y darle acceso a la propiedad (§7) |
| **Serper** (Google en vivo) | quién ocupa el top-10 de cada consulta objetivo, y si estamos | `POST google.serper.dev/search`, `gl: es`, `hl: es` — el mismo patrón que `apps/plataforma/app/api/sivra/mercado/search/route.ts` | recargar créditos (la cuenta se quedó a cero el 24/08/2026) |
| **PostHog EU** (proyecto 266897) | visitas medidas, páginas, origen | API HogQL `POST eu.posthog.com/api/projects/{id}/query` con Personal API key | crear la Personal API key de solo lectura (§7) |

Por qué en plataforma y no en `asegura-web` ni en `asegura`: `asegura-web` no tiene BD **a
propósito** (`CLAUDE.md`), `asegura` es la trastienda de la cartera, y plataforma ya tiene el
dispatcher de crons, el registro de secretos, `tgAviso` y Serper. «Una pantalla nueva de la
correduría se monta en plataforma» — y un cron, igual.

## 3. Tri-estado por fuente, nunca ceros

Cada fuente devuelve uno de tres estados y el informe los dice tal cual:

- `no_configurado` — falta el secreto (p. ej. «GSC: sin conectar — falta `GSC_SA_CLIENT_EMAIL`»).
- `error` — el secreto está pero la llamada falló (créditos de Serper agotados, token rechazado…),
  con el mensaje.
- `ok` — con los datos.

Un `error` o un `no_configurado` **no se pinta como «0 impresiones» ni como «no hay
competidores»**: es la regla «dato que NO hay ≠ dato que NO se ha mirado» de `CLAUDE.md`. Y
PostHog, aunque esté `ok`, se etiqueta siempre como «visitas medidas sobre quien consintió», que
es lo que ya manda la skill.

## 4. Datos

Tabla nueva en plataforma, **una fila por fuente y semana**:

```
seo_correduria_semana
  id          uuid pk
  semana      date          -- lunes de la semana ISO en que corrió
  fuente      text          -- 'gsc' | 'serp' | 'posthog'
  estado      text          -- 'ok' | 'error' | 'no_configurado'
  detalle     text null     -- mensaje de error, si lo hay
  datos       jsonb null    -- la foto (forma por fuente, abajo)
  creado_en   timestamptz
  unique (semana, fuente)
```

Forma de `datos`:

- `gsc`: `{ desde, hasta, total: { clics, impresiones, ctr, posicion }, consultas: [{ consulta,
  clics, impresiones, posicion }], paginas: [{ pagina, clics, impresiones, posicion }] }`. Ventana:
  los 7 días que acaban **3 días antes** de hoy (GSC publica con retraso), y se guarda también la
  ventana anterior para el delta.
- `serp`: `{ consultas: [{ consulta, top: [{ posicion, dominio, url, titulo }], propia: posicion |
  null }] }` — `propia` es dónde aparece `grupoasegura.es`; `null` = no está en el top-10, que NO es
  lo mismo que «posición 0».
- `posthog`: `{ dias: 7, visitantes, paginas_vistas, top_paginas: [{ ruta, vistas }],
  origenes: [{ dominio, sesiones }] }`.

Migración `apps/plataforma/prisma/sql/2026-09-08_seo_correduria_semana.sql`, idempotente, con los
GRANT al rol `prisma_plataforma`. **Se aplica como `postgres` por el Supabase MCP y solo con el
OK de Alberto para esta migración** (regla del repo). Hasta entonces el cron falla ruidosamente
al insertar y el latido lo refleja; no se finge que corrió.

## 5. El informe semanal (Telegram, `tgAviso('correduria.seo-semana', …)`)

Corto, en este orden:

1. **GSC**: clics / impresiones / posición media, con el delta contra la semana anterior; las 5
   consultas con más impresiones y su posición.
2. **SERP**: por cada consulta objetivo, nuestra posición (o «fuera del top-10») y los 3 dominios
   que ocupan el podio; qué cambió respecto a la semana pasada.
3. **Visitas medidas** (PostHog): visitantes, páginas vistas, top 3 páginas, top 3 orígenes.
4. **Una acción propuesta**, elegida por una regla pura y testeada, no por un LLM:
   1. si alguna fuente está `error`/`no_configurado` → la acción es arreglar esa fuente (nada de
      contenido a ciegas);
   2. si hay una consulta con impresiones y posición entre 8 y 30 cuya página objetivo existe → «mejora
      esa página» (es la de mayor retorno: ya aparece, no llega a la primera página);
   3. si hay una consulta objetivo sin página que la cubra → «escribe esa página»;
   4. si no, «enlazado interno hacia la página del ramo prioritario (hogar)».

El agente **propone**; publica Alberto. Nada de este cron escribe en `apps/asegura-web`.

## 6. Piezas de código

Todo en `apps/plataforma`, sin dependencias nuevas (`jose` ya está; la clave privada se carga con
`node:crypto` como en `lib/enablebanking.ts`).

| Fichero | Qué es |
|---|---|
| `lib/seo-correduria/consultas.ts` | las consultas objetivo (las 14 de `references/keywords.md` de la skill) con la página que las cubre. **Un test compara esta lista con la tabla del `keywords.md`**: si divergen, el cron vigila unas consultas y la skill otras, y nadie se entera. |
| `lib/seo-correduria/google-sa.ts` | `tokenCuentaServicio({ clientEmail, privateKey, scope }, fetch)` — JWT RS256 firmado con la clave de la cuenta de servicio, canjeado en `oauth2.googleapis.com/token`. Carga tolerante de la clave (PEM en una línea, `\n` escapados) porque `/operador/secretos` es un input de una línea. |
| `lib/seo-correduria/gsc.ts` | `leerGsc(token, ventana, fetch)` + `resumirGsc(actual, anterior)` (pura). |
| `lib/seo-correduria/serp.ts` | `consultarSerp(key, consulta, fetch)` → top-10 + `posicionPropia(top, 'grupoasegura.es')` (pura). |
| `lib/seo-correduria/posthog.ts` | `leerPosthog({ apiKey, projectId, host }, fetch)` con tres consultas HogQL. |
| `lib/seo-correduria/informe.ts` | `redactarInforme(semana, resultados)` y `accionPropuesta(resultados)` — puras, testeadas, son las que deciden qué se dice. |
| `app/api/cron/seo-correduria/route.ts` | orquesta: lee envs, llama a las tres fuentes en paralelo, guarda las tres filas, `registrarLatido('seo_correduria', ok, detalle)`, `tgAviso`. `GET` y `POST`, `isCronAuthorized`, `maxDuration = 60`. |

Altas en ficheros compartidos (los toca solo la sesión principal):

- `lib/cron-dispatch.ts`: `{ path: '/api/cron/seo-correduria', schedule: '30 8 * * 1' }`.
- `lib/monitoring/latidos.ts`: agente `seo_correduria`, `maxHoras: 192`, `vigiladoDesde: '2026-09-08'`;
  y su sonda en `PROBES` de `app/api/cron/agentes-latido/route.ts` (el guardián exige las dos en el
  mismo PR).
- `lib/telegram/catalogo.ts`: aviso `correduria.seo-semana` (categoría `correduria`, no crítico,
  «Lunes 08:30 UTC»).
- `lib/secrets-registry.ts`: `GSC_SA_CLIENT_EMAIL`, `GSC_SA_PRIVATE_KEY`, `POSTHOG_PERSONAL_API_KEY`
  (editables, proyecto plataforma). `SERPER_API_KEY` ya existe.
- `prisma/schema.prisma`: modelo `SeoCorreduriaSemana`.

Fuera de plataforma:

- `.claude/skills/seo-asegura/SKILL.md`, paso 1: las tres fuentes se leen de `seo_correduria_semana`
  (Supabase MCP, `execute_sql`) — desaparece el «pegar a mano».
- `docs/ASEGURA-SEO-REDES-IDEAS.md`: corregir el «Not live» de PostHog y cerrar el «conector de
  Search Console del lado del agente» de §J con el PR.

## 7. Lo que solo puede hacer Alberto (Claude en Chrome)

1. **Google Cloud**: proyecto (cualquiera de la cuenta), activar «Google Search Console API»,
   crear una cuenta de servicio, generar clave JSON. En **Search Console** → propiedad
   `sc-domain:grupoasegura.es` → Usuarios → añadir el `client_email` de la cuenta de servicio con
   permiso «Restringido» (solo lectura). Pegar en `/operador/secretos` de plataforma:
   `GSC_SA_CLIENT_EMAIL` (el `client_email`) y `GSC_SA_PRIVATE_KEY` (el valor de `private_key`
   del JSON, tal cual, con sus `\n`).
2. **PostHog EU** → Settings → Personal API keys → crear una con alcance **solo lectura** sobre el
   proyecto 266897 (`query:read`). Pegar como `POSTHOG_PERSONAL_API_KEY`.
3. **Serper** → comprobar créditos; recargar si sigue a cero. 14 consultas/semana ≈ 60/mes.
4. Decir «OK» a aplicar la migración de §4.

Con solo 1 y 2 el cron ya informa; sin 3 el bloque SERP sale «error: créditos», que es lo
correcto.

## 8. Lo que NO se hace (a propósito)

- No se activa Vercel Web Analytics (no está confirmado que funcione sin consentimiento).
- No se escribe nada en `apps/asegura-web` desde el cron: el agente propone, Alberto publica.
- No se mete un LLM en el cron: el informe y la acción salen de reglas puras y testeadas. La
  redacción de contenido sigue siendo de la skill, en sesión.
- No se tocan `housesevillana` ni `ia-rest` (siguen cargando GA4 sin banner; es otro asunto,
  pendiente de Alberto — pregunta (2) del 07/09).

## 9. Verificación

- Tests `node --test` de cada módulo puro, **vistos en rojo** rompiendo lo que protegen: el test de
  `consultas.ts` contra `keywords.md`; `accionPropuesta` con una fuente en `error`; `posicionPropia`
  con el dominio ausente (debe ser `null`, no 0); `resumirGsc` con la ventana anterior vacía (delta
  «sin comparar», no +100 %).
- Guardianes existentes: `lib/cron-dispatch.test.ts`, `lib/monitoring/latidos.test.ts`,
  `test/regression-telegram-avisos.test.ts`.
- `pnpm exec prisma generate && pnpm exec tsc --noEmit -p tsconfig.json` en `apps/plataforma`.
- Smoke real del endpoint solo cuando Alberto haya puesto los secretos: `curl` con el Bearer del
  cron, y mirar que en Telegram el informe trae las tres fuentes en `ok`.
