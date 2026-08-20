# Rotación de la `service_role` expuesta — inventario y plan

> Credencial: `service_role` (legacy, JWT) del proyecto Supabase **`wswbehlcuxqxyinousql`** («central»),
> emitida el 15/04/2026, **vigente hasta 2036**, publicada en el repo PÚBLICO `house-sevillana-landing`
> (commit `7c53e19`, 06/05/2026) y detectada por gitleaks el 12/08/2026 al unificar la landing.
> Salta RLS → lectura/escritura total sobre la BD compartida de TODAS las verticales.
>
> **Borrar el repo NO invalida la clave.** Estuvo pública ~3 meses: hay que asumirla comprometida
> y revocarla. Este documento es el inventario previo a la rotación (rotar antes de inventariar
> tumba producción).

## 🔴 El hallazgo que define el trabajo (panel, 19/08/2026)

**Las claves legacy no se pueden desactivar por separado.** El panel (Settings → API Keys) no tiene
interruptor por clave: solo una tarjeta «Disable legacy API keys» con un botón único
**«Disable JWT-based API keys»**. Matar la `service_role` filtrada mata **también la `anon`** en el
mismo golpe.

Consecuencia: la rotación no es «cambiar una variable en 3 sitios». Hay que migrar **los dos**
públicos —backends a `sb_secret_…` y clientes a `sb_publishable_…`— antes de poder pulsar ese botón.
Hasta que se pulse, **la clave filtrada sigue siendo válida**.

Lo que ya está a favor (verificado): existen y están operativas una secret key `default`
(`sb_secret_…`) y una publishable `default` (`sb_publishable_…`), así que no hay que tocar el JWT
secret ni invalidar las sesiones de usuario.

## Inventario de consumidores (grep del monorepo + panel, 19/08/2026)

### Cara `service_role` → migrar a `sb_secret_…`

| Dónde | Cuántos | Nota |
|---|---|---|
| Vercel env `SUPABASE_SERVICE_ROLE_KEY` en **`ia-rest`** | 1 | All Environments, «Updated Jun 10», sin marcar Sensitive |
| Vercel env `SUPABASE_SERVICE_ROLE_KEY` en **`central-rrhh`** | 1 | Production + Preview, marcada Sensitive |
| Edge Functions de ia-rest con `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` | **43 de 45** | la inyecta Supabase; en el panel ya sale **DEPRECATED**, sustituta `SUPABASE_SECRET_KEYS` |
| GitHub Actions | 0 reales | `ci.yml` usa `ci_dummy_service_role_key` |

⚠️ **`ialimp` NO tiene la variable** (verificado en el panel: ni propias, ni compartidas, ni de equipo).
Su único consumidor es `apps/ialimp/lib/storage-limpiadora.ts`, que por eso usa `requireSecret()` desde
el 12/08 para fallar con un error legible. Ese módulo (documentos de la limpiadora / nómina PDF) **está
roto, no funcionando**: nada que rotar ahí, pero sí que arreglar algún día — es una decisión aparte.

### Cara `anon` → migrar a `sb_publishable_…` (arrastrada por el todo-o-nada)

| Dónde | Cuántos |
|---|---|
| Ficheros que leen `*ANON_KEY` | **27** (`ia-rest` 14, `ialimp` 10, `sivra` 2, `rrhh` 1) |
| Envs `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Vercel | al menos `ialimp` (All Environments); revisar el resto de proyectos |
| Cron `pg_net` `monitor-health` (`20260819_crons_bd_compartida.sql`) | 1 — manda la **anon legacy** como `Bearer` |

## Plan de rotación (orden obligatorio, sin downtime)

1. **Ya hecho:** existen `sb_secret_…` y `sb_publishable_…` (`default`). Nada que crear.
2. **Backends a secret key.** Vercel `ia-rest` y `central-rrhh`: sustituir el valor de
   `SUPABASE_SERVICE_ROLE_KEY` → redesplegar → verificar.
   **Aprovechar para crearla ya como Sensitive en `ia-rest`, no antes** (comprobado 20/08): en Vercel,
   Sensitive no es una casilla sino un **tipo** de variable, y la doc dice que las sensibles «solo están
   disponibles en producción y preview» — o sea que marcarla **expulsa Development**, hoy activo. Como
   este paso ya sustituye el valor, hacerlo aquí sale gratis; hacerlo antes es tocar la variable dos
   veces. ⚠️ No confundir el tipo **Sensitive** con el tipo **Secret** («Secreto» en el panel
   traducido): Secret vacía el valor y pide elegir un secreto ya existente de Vercel — no es lo que
   queremos, y elegirlo por error perdería el valor actual.
3. **Edge Functions (PR).** `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` →
   `JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default']`, en 43 funciones.
4. **Clientes a publishable key (PR).** Los 27 ficheros con `ANON_KEY` + los envs
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` de cada proyecto Vercel.
5. **Cron `monitor-health`:** pasar de `Authorization: Bearer <anon>` a cabecera `apikey`.
6. **Desactivar las legacy** con «Disable JWT-based API keys». **Esto es la rotación.** Es reversible
   (se pueden reactivar si aparece un consumidor olvidado).
7. **Revisar los logs de Supabase** por uso ajeno entre el 06/05 y la desactivación.

## 🧪 Piloto antes de tocar las 43 (19/08/2026)

La documentación de Supabase se contradice en el punto que MÁS importa aquí. La guía de migración
dice que en backend basta con `createClient(url, 'sb_secret_…')`, pero la página de claves añade que
una clave nueva en `Authorization: Bearer` «se reenvía a la base de datos y se rechaza porque no es
un JWT» — y `supabase-js` manda la clave en **las dos** cabeceras por defecto. No se puede decidir
desde la documentación si las 43 funciones seguirían hablando con PostgREST tras el cambio.

Por eso **NO** se migran las 43 a ciegas. Primero va una sola, `ia-training-dashboard`, elegida
porque solo lee, está detrás de un PIN y se abre en el navegador (o sea que ya tiene
`verify_jwt=false`): si la clave nueva no sirviera, se ve al abrirla y no se cae nada.

- **Cómo se prueba:** desplegar esa función y abrir `…/functions/v1/ia-training-dashboard?pin=9999&api=1`.
  Si devuelve el JSON de siempre, la clave nueva vale contra PostgREST y las otras 42 son mecánicas.
  Si devuelve `Invalid JWT` o 401, la migración necesita otro enfoque (SDK `@supabase/server`) y nos
  hemos enterado con una función tonta en vez de con la de facturar.
- El helper `claveSecreta()` **prefiere la nueva y cae a la legacy**, así que mientras convivan el
  cambio es reversible.

## ⚠️ Trampas conocidas antes de tocar código

- **Las claves nuevas NO son JWT.** Van en la cabecera `apikey`; en `Authorization: Bearer` el gateway
  intenta parsearlas como JWT y devuelve `Invalid JWT`. Esto afecta a los pasos 3, 4 y 5.
- **`verify_jwt`**: el check del gateway solo entiende las claves legacy, y la plataforma **no valida
  la cabecera `apikey`** por su cuenta: la función que pase a la clave nueva necesita `verify_jwt = false`
  y comprobar el `apikey` en su propio código. Este repo **no tiene `config.toml`**, así que ese ajuste
  vive en el panel por función y NO puede viajar en un PR: hay que tocarlo a mano al migrar cada una.
- **Realtime**: las conexiones públicas quedan limitadas a 24 h salvo que se eleven con auth de usuario.
  Ojo al **KDS de ia-rest**, que son pantallas abiertas días enteros.

## ✅ La banda naranja de Supabase era un aviso legal, no una alarma (medido 20/08/2026)

El 19/08 se escribió aquí que la banda naranja del dashboard («El período de gracia ha finalizado ·
Tus proyectos no podrán atender solicitudes cuando agotes tu cuota») era «más urgente que la
rotación». **Era falso, y el error es de método: se leyó un cartel en vez de medir.**

Medido en Organization → Usage, ciclo 15/08–15/09/2026 (5 días corridos): **ninguna métrica pasa del
35%**, y el overage del período es 0 en todas.

| Métrica | Uso | Límite Free | % |
|---|---|---|---|
| Database Size | 168,89 MB | 500 MB / proyecto | 35% |
| Egress | 0,676 GB | 5 GB | 14% |
| Storage Size | 0,063 GB | 1 GB | 6% |
| Invocaciones de Edge Functions | 8.978 | 500.000 | 2% |
| MAU (propios y de terceros) | 0 | 50.000 | 0% |
| Realtime (picos y mensajes) | 0 | 200 / 2.000.000 | 0% |

Contraste independiente por MCP el mismo día: `pg_database_size` da **154,72 MB (30,9%)**. La cifra
del panel es algo mayor porque incluye overhead que la consulta no ve; las dos dicen lo mismo.

El texto completo de la banda es condicional y **permanente**: «Tu período de gracia terminó el 10 jul
2026. Ahora aplica la Fair Use Policy. **Si** tu organización supera su cuota, tus proyectos pueden ser
restringidos y las peticiones responderán con 402». Es un aviso de estado de cuenta que lleva ahí
desde julio y seguirá ahí al 2% de consumo. `compute` y `branching` ni siquiera aparecen: no son
métricas facturables del plan Free.

**Consecuencia práctica:** no hay nada urgente aquí, y la rotación vuelve a ser la prioridad. Lo único
que sube solo con el tiempo es Database Size, cuyo límite es **por proyecto** — vigilarlo si `central`
crece rápido, pero 155 MB de 500 no es una urgencia. Si algún día aparece un **402 de verdad** en
producción, el origen será otro (proyecto pausado por inactividad, rate limit, o la propia app) y se
mira en los logs, no en esta banda.

> Lección, que es la regla de la casa aplicada a un panel: un cartel de advertencia **condicional** no
> es un dato de consumo. Antes de declarar una urgencia, medir la métrica.
