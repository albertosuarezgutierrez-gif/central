# CLAUDE.md — apps/asegura (Grupo Asegura, correduría de seguros)

> Vertical de la **correduría de seguros** de Alberto (nombre comercial **Grupo Asegura**).
> Lee antes `docs/TRASPASO-CORREDURIA.md`: esta app es el DESTINO de un traspaso en curso,
> no un desarrollo desde cero.

## Estado (26/08/2026): esqueleto vivo, cartera SIN migrar

Lo que hay aquí es el **armazón** —auth, layout, manifiestos, gate de build— para que el
día del corte solo haya que verter el modelo y las pantallas. **La cartera real (32.600
clientes, 28.843 pólizas) sigue en el Supabase de Manuel Suárez** (`uijsgeocgdaxkhvwtjqs`),
alimentándose a diario por CIMA/EIAC.

🚨 **Schema `seguros` vacío ≠ la correduría no tiene datos.** Es la trampa que esta app
tiene que evitar por diseño: el dashboard **no pinta KPIs a 0** mientras no haya migración
—diría «no tienes clientes» sobre una cartera viva—. Dice «pendiente» y dónde mirar
mientras tanto. El estado sale de `lib/estado-migracion.ts`, un helper puro con **tres**
salidas (`error` / `no migrado` / `migrado`), nunca dos.

## Arquitectura

- **BD:** compartida `wswbehlcuxqxyinousql`, schema **propio `seguros`** (patrón iarest/rrhh,
  no prefijo de tablas en `public`). Rol **`prisma_seguros`** — existe, `BYPASSRLS`, y hoy
  **sin contraseña** (inerte). Cimientos en `prisma/sql/2026-08-19_asegura_bootstrap.sql`.
  Prisma usa `multiSchema` porque `cuentas` vive en `public` y el resto en `seguros`.
- **Auth:** cookie propia `asegura_session` + `jose` contra `public.cuentas`, como el resto
  de la casa (`apps/mariscos` es el molde). Secreto `ASEGURA_SESSION_SECRET`, **sin fallback
  a literal en producción** (lo obliga `test/regression-secrets.test.ts`).
  ⚠️ **Consecuencia deliberada:** el CRM de Manuel apoya su aislamiento en **86 políticas RLS
  que se resuelven TODAS por `auth.uid()` de Supabase Auth**. Al re-plataformar la auth esas
  políticas se quedan sin sujeto y, con `prisma_seguros` en BYPASSRLS, **el efecto no es
  “no se ve nada” sino “se ve todo sin que falle nada”**. El aislamiento pasa a ser
  responsabilidad del CÓDIGO de esta app: la regla a reproducir es **«un cliente solo ve lo
  suyo»** (hoy son 2 fichas de 32.600), no el andamiaje multi-tenant.
- **🛡️ Ámbito de correduría (27/08/2026) — la puerta ÚNICA a los datos de `seguros`.**
  `lib/tenant-ambito.ts` es lógica **pura, sin BD** (probable sin Prisma ni red) y `lib/tenant.ts`
  el envoltorio. **Tres estados, nunca dos:**
  - `pendiente` → el schema está vacío: **no se sabe** a qué correduría pertenece la cuenta,
    porque la tabla que lo dice aún no existe. **No es** «no tiene ninguna».
  - `sin-asignar` → migrado y sin vínculo. Esto **sí** es una ausencia comprobada.
  - `ok` → hay `correduriaId` y **toda** consulta filtra por él.

  `migrado: false` devuelve `pendiente` **aunque venga un `correduriaId`**: antes del volcado ese
  valor no es fiable. Los valores de cajón (`''`, `'otro'`, `'desconocido'`, `'N/A'`,
  `'sin asignar'`) se tratan como **ausencia** — la lección de `subastas.tipo_bien`.
  `exigirCorreduriaId()` **lanza**; no existe rama «devuelve algo por si acaso», porque un id
  inventado no da error: da los datos de otro.

  🚨 **Al añadir modelos de `seguros`: toda consulta pasa por aquí.** Lo vigila
  `test/regression-asegura-aislamiento.test.ts` (en `pnpm test:guardia`), que falla si un fichero
  de esta app toca `seguros.*` sin importar `lib/tenant`. El cepo está **verificado**: se probó con
  un fichero infractor y saltó.

  ⚠️ Esto protege lo que escribamos nosotros; **no adivina lo que trae el dump**. Sigue abierta la
  pregunta a Manuel de si el CRM de origen filtraba por `correduria_id` en el código o lo delegaba
  todo en RLS — de eso depende que esa columna venga con datos fiables.
- **Vercel:** proyecto propio, Root Directory `apps/asegura`. `vercel.json` lleva su
  **`ignoreCommand` obligatorio** con `--sin-previews`.
- **Dinero:** `lib/dinero.ts` → `eur()`, formato español `2.162,49€`. `null` devuelve `—`,
  nunca `0,00€`.

## Envs
`DATABASE_URL`, `DIRECT_URL` (rol `prisma_seguros`), `ASEGURA_SESSION_SECRET`.
Las de las integraciones (CIMA/EIAC, Codeoscopic, WhatsApp) llegan con la transferencia del
proyecto de Vercel de Manuel — **no se piden por mensaje**.

## 🔗 La cadena de CIMA: cinco sistemas, no uno (confirmado por Manuel, 26/08/2026)

La descarga de las compañías **no es un cron nuestro ni un SFTP**. Es una cadena, y cada eslabón la corta:

```
GitHub Actions (cron 5:30 y 11:30)
  → HTTPS + Bearer CRON_SECRET
    → app.grupoasegura.com/api/crons/cima-pull   (esta app, Next.js en Vercel)
      → asegura-app-cima-adapter.fly.dev         (Fly.io, Java/Spring Boot)
        → JAR oficial de TIREA · SOAP WSE v2.17
          → Mapfre C0058 · Allianz C0109 · Generali C0072 · Occident C0468 · Reale C0613
```

- **El adaptador de Fly NO vive en este monorepo** (es Java) y no debe intentar meterse: es un servicio
  aparte con su propio repo. Las **credenciales de TIREA son secrets de Fly**, no envs de Vercel.
- 🚨 **`CRON_SECRET` no viaja al transferir el repo.** Si falta, el cron dispara, el endpoint responde 401
  y **CIMA deja de traer datos sin que nada falle a la vista**. Es el fallo más caro y más silencioso:
  la app sigue en pie y solo se nota porque «hoy no ha entrado nada».
- 🔴 **Hay DOS claves de datos personales en las env vars, y fallan distinto** (confirmado por Manuel):
  - **Cifrado de valores** (IBAN, DNI…): si se pierde, los datos quedan **ilegibles para siempre**.
    Falla ruidoso — se nota.
  - **Índice ciego** (buscar por email/DNI sin descifrar): si cambia, los datos siguen legibles pero
    **dejan de encontrarse**. 🚨 **Falla en SILENCIO**: la búsqueda no da error, devuelve vacío, y la
    pantalla dice «no existe ese cliente» sobre uno que está ahí. Es la regla «dato que NO hay ≠ dato
    que NO se ha mirado» metida en la capa de búsqueda, donde no hay NULL que la delate.

  Por eso la verificación son **dos** pruebas, no una: **descifrar** un registro real **y buscar** un
  cliente conocido por email y por DNI. Rotar el índice ciego obliga a **recalcular los 32.600**, y
  mientras dura ese recálculo las búsquedas mienten.
- **Ficheros en Vercel Blob** (privado, URLs firmadas; hoy ~4). Los EIAC de CIMA **no se guardan como
  fichero**: se parsean a tablas.
- **Codeoscopic:** el código de emisión existe pero está **tras un flag que nunca se activó** — por eso
  sus tablas están vacías. No es un bug; es una función sin estrenar.
  ⚠️ **Condición para encender ese flag algún día:** el envío es idempotente por dentro
  (`submit_in_flight_at` es un candado, `submit_attempt_id` una UUID para reconciliar) pero **NO de
  punta a punta**: Codeoscopic no deduplica por nuestro `attempt_id`, así que un reintento tras una
  respuesta perdida puede crear un duplicado en su lado. Antes de activarlo hay que probarlo en serio:
  **mandar el mismo `attempt_id` dos veces y ver si ellos deduplican.**

## Lo que falta y de quién depende
- **De Manuel:** transferir sus proyectos de Vercel y Supabase y el repo; decir cómo se
  descargan los ficheros de las compañías, si usa Vercel Blob y qué dominios tiene.
- **De Alberto:** poner contraseña al rol, fijar la fecha de corte, y decidir si se formaliza
  el contrato de encargado de tratamiento.
- **Del corte:** cambiar a mano las URLs registradas en los paneles de **Codeoscopic** y
  **Meta/WhatsApp**. Eso no viaja en ninguna transferencia.
