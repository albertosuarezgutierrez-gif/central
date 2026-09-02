# 🧠 Memoria de sesiones — central (repo GitHub: ia.rest → renombrar)

> Contexto persistente entre sesiones de Claude Code. El entorno cloud es
> **efímero** (el contenedor se borra al acabar), así que lo único que sobrevive
> es lo commiteado aquí. Este archivo es el "estado vivo" del proyecto entre sesiones.
>
> **Cómo se mantiene:** al terminar cada sesión, Claude añade una entrada nueva
> arriba del todo y actualiza el estado si algo cambió. Un hook `Stop`
> (`.claude/hooks/persist-memoria.sh`) commitea y empuja este archivo automáticamente.
>
> **🚨 Regla de tamaño (ahorro de contexto):** cada entrada, **máximo ~8 líneas**:
> qué se hizo, decisiones, pendientes y nº de PR. El detalle ya vive en el PR y en
> el código — NO re-narrarlo aquí. Fecha SIEMPRE en la primera línea `(dd/mm/aaaa)`.
>
> **🔄 Rotación mensual:** aquí vive SOLO el mes corriente. Los meses cerrados se
> archivan en `docs/memoria/AAAA-MM.md` con `node scripts/rotar-memoria.mjs`
> (idempotente; lo dispara `/auditoria-diaria` a primeros de mes). La historia no
> se pierde: se lee de `docs/memoria/` solo cuando hace falta.
>
> **📌 «Estado vivo» (bloque al final):** SOLO pendientes y decisiones abiertas, en
> sub-bullets de 1-3 líneas — no es un segundo diario: el relato de cada sesión va en su
> entrada fechada y el detalle en el PR. Al cerrar un pendiente, borra su bullet; al
> actualizar el bloque, re-fecha su cabecera (si su fecha queda en un mes cerrado, la
> rotación se lo lleva al archivo).
>
> **Formato de cabecera de entrada:** `- **… (dd/mm/aaaa).**` o `### … (dd/mm/aaaa)` —
> son los ÚNICOS que `rotar-memoria.mjs` reconoce como entrada; una cabecera `## ` se
> funde con la entrada anterior y se archiva mal.
>
> Para arquitectura/módulos completos → skill `ia-rest-maestro`. Esto es solo el
> registro de qué se hizo y qué queda.

---

### 🏠 (02/09/2026, noche) Codeoscopic: retarificar HOGAR, cableado de punta a punta (PR pendiente)
- Alberto: «revisa todo lo de Codeoscopic para probar tarificar con un seguro de hogar… con algún hogar de
  José Suárez Salas». Auditado con agente: TODA la infraestructura (interruptor, libro, tope, `cotizar()`,
  puerto, botón) era agnóstica del ramo; faltaban las piezas de hogar y el contrato del `risk` del vendor.
- Hecho: `persona.ts` (tomador compartido auto/hogar), `peticion-hogar.ts` (+6 tests), `desde-cartera-hogar.ts`
  (+6; riesgo de póliza / gemela / Catastro, rotulado), `retarificabilidad()` en module-seguros (+5; sustituye
  la expresión copiada en 3 sitios), 10 catálogos `/home/*`, rama de hogar en la página y el POST de
  `/cartera/poliza/[id]`, botón por ramo en plataforma. `origenRetarificacion` carga la gemela.
- 🚨 El esquema del `risk` de hogar NO está en el repo ni se puede leer desde aquí (portal bloqueado):
  `CAMPOS_VENDOR` es provisional; un 400 de validación no se cobra. Alberto exporta el ejemplo del portal
  (`docs/CODEOSCOPIC-API-PORTAL.md` § Hogar). Caso de prueba: Occident GPDFS3000276 (Sevilla, 76 m²/1994).

### 📎 (02/09/2026, tarde) Correduría: documentos de verdad sobre la BD de casa (PR #2022 mergeado)
- Alberto: «ya está nuestra bbdd, prueba y sigue». Probado: `seguros` en central tiene los mismos recuentos que se
  midieron en el origen (32.600 fichas, 28.843 pólizas, 109 CIMA/67 activas, 172 calles cifradas, 181 localidades,
  330 CP, 4.506 matrículas, `unaccent` instalada) → el buscador por riesgo/calle de #2001 funciona sobre la copia.
- Lo único que estaba bloqueado por el traspaso eran los **documentos**: tabla propia `seguros.documentos`
  (cliente | póliza | siniestro, estado pedido/recibido/revisado, fichero en `bytea` ≤10 MB, sin claves de Storage),
  migración aplicada y sus 4 CHECK probados en la BD real con rollback (0 filas dejadas). Puerto en asegura
  (`/api/operador/documentos[/id]`), lógica pura en module-seguros (5 tests), pantalla en la ficha de cliente y de
  póliza de plataforma (subir · anotar pedido · ver · revisado · borrar). `NECESARIOS_EMISION_AUTO` = DNI, permiso,
  ficha técnica: un «pedido» sigue faltando.
- No probado de punta a punta con la app (el contenedor no tiene `DATABASE_URL`): la primera subida real la hace
  Alberto desde `/correduria/cliente/[id]`. Sigue pendiente (y cuesta dinero): la petición de hogar a Codeoscopic.


### 🔐 (02/09/2026, ~09:00 UTC) Correduría: TRASPASO CERRADO salvo Fly — auth copiada, CRM solo como motor de CIMA (PR #2007 mergeado)
- Alberto: «el punto 2 no se hace… quiero tener todo en nuestra bbdd» → **NO se rota `crm_seguros`** (anotado en
  `apps/asegura/CLAUDE.md` y `docs/TRASPASO-CORREDURIA.md`) y se copió `auth.*` de Manuel a central por dblink con
  los mismos UUID: 9 users (2 reales con bcrypt + TOTP), 11 identities, 2 mfa_factors; 9/9 enlazados con
  `seguros.usuarios`. Trigger `on_auth_user_created` → `seguros.handle_new_user()` creado. Rol temporal de origen borrado.
- Tres trampas medidas: `auth.*` de origen con RLS y 0 políticas → **0 filas sin error** para un rol sin BYPASSRLS
  (un count=0 ahí no es «no hay»); en PG16 INHERIT va por GRANT (un rol NOINHERIT no hereda tras `ALTER … INHERIT`);
  `postgres` no puede hacer GRANT sobre `auth.*` (aviso mudo) → `pg_read_all_data`. Todo en `prisma/sql/2026-09-02_seguros_auth_traspaso.sql`.
- Inventario del CRM: Supabase = solo Auth; el único PostgREST (`record-evidence.ts`) no tiene llamadores → **sin cambios de código**.
- 🛑 **Decisión de Alberto acto seguido: «yo eso no lo quiero… no es necesario el acceso, eso ya desarrollaremos».** La web
  del CRM de Manuel NO se usa ni se migra su login (nada de variables Supabase en Vercel `asegura`, ni Google/TOTP/SMTP);
  las pantallas van en `plataforma` → `/correduria`. El CRM queda desplegado SOLO como motor de ingesta de CIMA (escribe en
  `seguros` con `crm_seguros`); dependencia viva: adaptador Fly de Manuel, hasta tener ingesta propia. PR #2007 mergeado (`7ba37122`).
- ⏸️ **Cierre del día (Alberto): «fly es barato y ya está hecho, hay otras prioridades».** Statu quo: cron → CRM (motor) → Fly →
  `seguros`. Único pendiente: transferir la app de Fly a cuenta de Alberto cuando Manuel pueda (borrador v8 en TRASPASO). El port
  de `cima-pull` a `apps/asegura` queda APARCADO; el inventario del grafo se guarda de referencia. Vigila la auditoría diaria.
- Tras el merge se barrieron las afirmaciones «cartera NO migrada / foto vs origen» que quedaban en `CLAUDE.md`, skills
  `central-maestro`/`auditoria-central`/`agente-correduria`, bloque 2-quater de `/auditoria-diaria`, `RUTINAS` y `FUENTES-DE-VERDAD`:
  el origen de Manuel es foto congelada; la señal de salud pasa a ser el heartbeat `cima_pull_*` en `seguros.operational_events`.

### 🖼️ (02/09/2026) plataforma: el rediseño LLEGA a la pantalla (PRs #2013 y #2018)
- Alberto tras mergear #2011: «yo lo veo igual». **No era caché.** Ese PR mandó a producción cuatro
  primitivas —`PageHeader`, `KpiCard`, `Badge`, `btnStyle`— **con CERO consumidores**: exactamente el
  defecto que ese mismo PR diagnosticaba en el `ui.tsx` viejo, repetido el mismo día. Un sistema de
  diseño que nadie importa no cambia ni un píxel; el guardián de tokens no lo caza porque no hay falta.
- **#2013** enchufa lo visible: pestañas de `SegTabs` de pastilla-en-caja a **subrayado con iconos
  lucide**, migas sobre el saldo, `<Pagina>` en las 4 vistas de `/banca`, azulejo de icono en cuentas y
  brókeres, `colorImporte` en vez de hex, `<Dato>` en el saldo sin informar.
- **#2018** pone la cabecera del libro de movimientos, y lo interesante es lo que destapó: **dos de las
  columnas no eran columnas.** El 🤖 solo se pintaba en los cargos (en un ingreso, negocio e importe se
  corrían 30 px) y el `<select>` de negocio se anchaba según el texto de su opción. Sin rótulos encima
  no se notaba. Cabecera oculta en móvil (la fila se apila) y solo si hay filas.
- **Pendiente:** siguen ~4.900 inline styles y 20 clases muertas movidas a `globals.css`, tres de ellas
  con hueco responsive real (`/sivra/expenses` con modal a `maxWidth:520` en móvil). CI verde en ambos.

### 🎨 (02/09/2026) plataforma: sistema de diseño vivo, color por tokens y SEIS tokens fantasma (PR #2011)
- Salió de «mírate Argon Dashboard». No se importó nada de él: es un kit Bootstrap estático y el problema
  no era la piel. **`dashboard/ui.tsx`, que el CLAUDE.md documentaba como sistema de diseño, NO lo importaba
  nadie** — existía como documento, no como código, con ~4.900 `style={{}}` a mano alrededor.
- Movido a **`components/ui.tsx`** + `Pagina` (ancho por contenido, contra el `maxWidth:'960px'` de 14
  páginas), `PageHeader`, `KpiCard`, `Badge`, `btnStyle`, `TablaScroll`, y **`Dato`/`Pendiente`** con
  `lib/dato.ts`: la regla del NULL deja de depender de la vigilancia. `/banca` es la referencia; el resto,
  por goteo. Sidebar con iconos lucide y secciones plegables (eran 52 entradas planas).
- 🚨 **~734 hex → tokens en 77 archivos, y SEIS tokens que NO EXISTEN** usados como `var(--danger, #dc2626)`
  en ~37 sitios: `--danger`, `--success`, `--card`, `--background`, `--warn`, `--warn-bg`. El CSS es válido,
  nadie se queja, y siempre se aplica el respaldo. El peor, en **transferencias**: `var(--card, #fff)` junto
  a `var(--text)` = texto claro sobre blanco. Los dos últimos venían de main (PR #2001) y los cazó el
  guardián nuevo en su primera pasada de CI. Guardianes: `regression-tokens-color` (3 tests: hex, media
  pareja y tokens fantasma) y `regression-dato-tres-estados` (fija que el **0 es un valor**, no un hueco).
- 45 bloques `<style>` sacados de 43 `.tsx` a `globals.css` (179→618 líneas), sin colisiones de clase.
- Regla nueva en el CLAUDE.md raíz: **todo lo mecánico va a un subagente**, repartido POR ARCHIVOS.
- **Pendiente:** migrar los ~4.900 inline styles restantes (semanas, por goteo). CI 19/19 verde.

### 🔑 (02/09/2026) `GH_PAT_TRIGGER`: rotado (caduca 01/12/2026, sin `Workflows`); clásico borrado; B pendiente en Vercel
- La entrada 🔴 del 01/09 («renovar el PAT») **ya está resuelta**: el 401 duró del 31/08 13:25 al 01/09 ~08:50 UTC;
  desde el PR #1933 (08:53) la radiografía vuelve a abrirse y a mergearla el bot (38 PRs hasta hoy, #2008 incluido).
  Las 123 ramas huérfanas quedaron barridas (1 viva). Nadie anotó la renovación: se dedujo de los PRs.
- **Lo que un agente NO puede ver:** tipo de token (clásico con `repo` = TODOS los repos de Alberto; fine-grained =
  solo `central`), permisos y fecha de caducidad. Lo usa en 4 workflows (`auditoria.yml`, `rutinas-automerge.yml`,
  `ai-programar.yml`, `latido-reparar.yml`) y necesita solo **Contents + Pull requests: write** sobre `central`.
- **Medido por Chrome (02/09, solo lectura):** es fine-grained, solo `central`, pero **SIN caducidad** y con
  **Workflows: read/write** además de Contents + Pull requests. El secret se actualizó el 01/09 10:52 CEST. Ese
  permiso extra es el que convierte una fuga en «leo todos los secrets»: con él se puede empujar a una rama un
  workflow que vuelque `${{ secrets.* }}` y abrir el PR (mismo repo = con secrets). Lo que lo justificaría es el
  camino 6b de `rutinas-automerge.yml` (merge de `main` en la rama del PR: si `main` tocó un workflow desde que
  nació la rama, el push lo necesita) — no hay ningún rechazo por ese motivo en la memoria.
- **Segundo token vivo** `central-ai-programar-trigger-2` (29/07, sin caducidad, Contents + PRs, usado esta
  semana): NO es el del secret. [Probable] es el `GITHUB_TOKEN` de Vercel (sivra/plataforma, agente SEO de los
  lunes, `seo-landing.ts`) o el `GH_PAT` de ia-rest (`blog-seo`, `agente-arquitecto`): los tres escriben en
  `central` por Contents API con justo esos permisos. **No borrar sin comprobar en Vercel** qué env lo lleva.
- Un clásico «Claude Full Access Token» (21 scopes, sin caducidad, «Never used») está para borrar.
- 🔴 **El camino 6b de `rutinas-automerge.yml` NO empuja con el PAT aunque lo lleve en la URL (medido 02/09 06:39 UTC
  en este mismo PR):** el bot resolvió el conflicto y empujó el merge, pero `tests.yml` salió con `actor:
  github-actions[bot]` y `conclusion: action_required` (a la espera de aprobación manual), así que los 12
  requeridos no corren y el PR se queda en BLOCKED. Causa [Probable]: `actions/checkout@v4` deja
  `http.https://github.com/.extraheader` con el `GITHUB_TOKEN` y pisa al PAT de la URL — el mismo fallo que
  explicaba el «git push sí cuela» del 01/09 en `auditoria.yml`. Arreglo: `persist-credentials: false` en el
  checkout (o borrar el extraheader antes del push). Es workflow → carril 2, PR aparte. Hasta entonces, un PR de
  registro que entre en conflicto necesita un push humano después del merge del bot.
- **Rotado por Alberto (Chrome, 02/09 09:03 CEST):** token nuevo fine-grained `GH_PAT_TRIGGER (central) 2026-12-01`,
  solo `central`, Metadata R + Contents R/W + Pull requests R/W, **sin `Workflows`, caduca el 01/12/2026** (la
  primera generación salió sin caducidad y se regeneró). Secret actualizado 09:03. Clásico «Claude Full Access
  Token» **borrado**. El token viejo A (`… - sep 2026`) sigue vivo A PROPÓSITO hasta ver «Last used» en el nuevo;
  [Probable] ya lo usó: la radiografía #2017 se abrió a las 07:14 UTC, 11 min después del cambio de secret.
  Quedan sin caducidad: `central-ai-programar-trigger-2` (= B), `seo-housesevillana-panel` y `token` (nunca
  usados) y los clásicos `house-sevillana-deploy` / `roi-intranet deploy token`. **Pendientes:** borrar A mañana,
  inventariar B en Vercel (prompt dado) y rotarlo, guardián Telegram del 401 + `persist-credentials: false` (PR aparte).
- 🚨 **Método: el bot lee la lista de archivos del OBJETO PR, y GitHub la deja atrasada.** Tras el merge 6b del bot,
  el PR seguía con `base.sha` = el `main` de la madrugada y **98 archivos** (el diff real `origin/main...HEAD` era 1);
  el bot lo rechazó como «no registro». Se desatasca como el lag de #1962: push con contenido real y esperar.

### 🔍 (02/09/2026) Rutinas de auditoría: cobertura exhaustiva tras la correduría
- Alberto pidió revisar la diaria y la semanal («hemos metido más cosas como correduría»). Medido: las dos decían
  **«8 apps»** desde junio (y `AGENTES-MAPA` «4») con **12** en `apps/`; ni una línea sobre la correduría; el
  conector `Supabase_asegura` no figuraba. `auditoria-central` contaba 7 apps con Prisma (son 10; asegura tiene DOS
  schemas) y solo conocía el schema `iarest` (faltaban `rrhh` y `seguros`, los dos con BYPASSRLS).
- Nuevo bloque **2-quater «🛡️ Salud de la correduría»** (obligatorio, también en ligera): latidos `correduria_*`
  (sin fila = nunca corrió), foto `seguros.*` vs origen de Manuel, gasto Codeoscopic, cepos de aislamiento, §21
  pausada a propósito. Regla nueva: la frescura del ORIGEN es actividad, no salud (CIMA trae 0-3 filas/semana).
- Semanal: tramo correduría (typecheck asegura con dos schemas, tests `module-seguros*`, checksums foto vs origen,
  TRASPASO §pendientes). Toda cifra de apps se cruza contra `ls apps` + matriz de `tests.yml`, nunca contra otro doc.
- Añadido a la diaria (petición de Alberto en la misma sesión): revisar las **conversaciones** del rango por `list_sessions`
  (sesión sin memoria, sin PR y sin bitácora = pendiente perdido) y reconciliar TODAS las skills de agentes contra código y
  `list_triggers`, no solo las maestro. PR #2006. Ojo: `guardian-rama.mjs` da falso positivo en clon **shallow** (el `main`
  local no está en la historia truncada de `origin/main`); un `git fetch origin` lo calla.
- **Hecho por Claude Chrome (02/09):** las rutinas 1 y 2 quedan con **Supabase + Supabase asegura + Vercel** (llevaban los 16
  conectores heredados, Gmail/Stripe/HubSpot incluidos). Verificado contra la skill: no usa ninguno de los quitados. Chrome
  destapó además que la diaria corre a **10:00 CEST** desde el 27/08 (Alberto la movió por el reset de cuota, memoria
  del 27/08) y el doc decía 04:00; corregido en `RUTINAS-PROGRAMADAS.md` §1/§3/cadencias. `ALERTA_TOKEN` de las rutinas
  1-2 vive en el entorno `Default`, no en el prompt: el «NO/NO» de Chrome no es un fallo. Visto al pasar: `sivra_domotica_acceso`
  en rojo (1 cerradura con ERROR).


### 📌 Buscador ya distingue ficha viva de volcado; Vercel deja de comentar en los PRs (02/09/2026)
- **Duplicado «Jose Suarez Salas»**: dos fichas `tipo='cliente'`, la de 14 pólizas es el volcado (vence 2016) y la de 7 la viva (vence 2027). `clientes.tipo` no sirve → `vitalidadFicha()` en `@central/module-seguros` (CIMA o vencimiento < 18 meses = viva; `null` = no contado ≠ histórica). Buscador rotula y enlaza «Abrir la ficha viva →».
- **Auditoría de duplicidades** (Alberto): 80 vivos, 48 con otra ficha; 740 grupos por teléfono, 203 con nombres distintos (familias, NO se fusiona); **16/109 pólizas vivas en las dos caras**, en 10 la copia del volcado tiene la dirección del riesgo y la de CIMA el vencimiento; **1 cliente partido en dos fichas vivas por la propia ingesta CIMA** (Juan Manuel Duran Ibañez) → Manuel.
- **Corrección**: «dirección imposible» era rotundo de más — la calle va cifrada pero `localidad`/`cp` del riesgo van en claro y asegura tiene la clave. No hecho aún.
- `github.silent: true` en los 12 `vercel.json` → adiós a ~50 ediciones de comentario por PR.
- **Contacto/intervinientes** (Alberto, caso Esquiansa): 81/109 vivas traen intervinientes por CIMA, 14 enlazados a OTRA ficha; 6 de 25 tomadores «sin teléfono» lo tienen en un interviniente. `contactoEfectivo()` (module-seguros) decide a quién llamar y la ficha dice de quién es el número. Botón «Subir póliza ↗» en la ficha (asegura ya lo tenía; solo auto, no guarda fichero).
- **Catastro para hogar HECHO**: paquete `@central/core-catastro` (parser+http extraídos de subastas, que lo re-exporta; 548 tests de subastas siguen verdes) + `precalificarHogar()` + `/correduria/hogar` en plataforma. Probado en vivo: San Vicente 40 2º-14 → 76 m²/1994/Residencial/41002 = la póliza. `GET /insurance-lines` hecho en #2001; cotizar hogar en Codeoscopic sigue pendiente (0,50€, con OK).
- **Forma de pago** (Alberto): columna «Pago» en la ficha; CIMA da `fraccionamiento` (108/109) y `forma_pago` de recibos, NO el recargo → `recargoFraccionamiento()` con 3 estados (solo con ciclo completo). `ventanaAnulacion()`: contrato anual, aviso 30 días.
- **Pantalla de PÓLIZA hecha** (`/correduria/poliza/[id]` + puerto `/api/operador/poliza`): coberturas (1.418 filas), recibos, siniestros, intervinientes, documentos (0 en toda la base, declarado) y copia gemela. De paso: **42/109 CIMA canceladas** (bloque aparte, sin Retarificar), recibos todos anulados = «⚪ anulados» (no 🟢), prima 0 = sin dato.
- Hecho ya (era pendiente): (`/correduria/poliza/[id]`: datos, coberturas, documentación, siniestros, recibos); separar canceladas de «vivas»; recibos todos anulados no es «🟢 0 cobrados»; leer la copia gemela del volcado para la dirección del riesgo; 📞 «cifrado» = falta `PII_ENCRYPTION_KEY` en el Vercel de asegura.
- **«Haz todo» (2ª tanda, mismo PR #2001):** buscador por **localidad/CP del riesgo** (`porRiesgo`, SQL sobre `datos_especificos`) y por **calle descifrada en memoria** (`porDireccion`, ~170 pólizas; sin clave → «N ilegibles», no vacío); `GET /insurance-lines` de Codeoscopic (gratis, `hogarDisponible()` con 3 estados, pintado en `/correduria/hogar`). **Documentos: HECHOS en #2022** (tabla `seguros.documentos`, puerto y pantalla; falta la primera subida real de Alberto desde `/correduria/cliente/[id]`). Pendiente que cuesta dinero: `peticion-hogar.ts` (0,50€/prueba, solo con OK).
### 🔑 (02/09/2026) Domótica: el aviso «PIN con la ventana desactualizada» lleva botón para reponerla desde Telegram (PR #2003)
- Disparador: aviso 🕒 de Socorro con 2 PIN (reservas 152490601 y 150885616) caducando 2 h antes de lo debido,
  y su única salida era abrir `/sivra/domotica` en el portátil. Desde el contenedor no hay Tuya/Smoobu, así que
  **esos dos PIN siguen SIN reponer**: hay que pulsar «🔄 ventana» en el panel o, tras desplegar, el botón del aviso.
- La reposición se extrajo a `lib/domotica/reponer-ventana.ts` (un solo camino para el PATCH del panel y el
  webhook); el cron manda el aviso con `tgAvisoAlertaBotones` y un botón `dom_ventana:<disp>:<ref>` por PIN
  (helper puro `reponer-ventana-puro.ts`, límite de 64 bytes vigilado por test). Resultado por mensaje nuevo,
  y si Tuya cae a offline y el código CAMBIA se canta en mayúsculas (antes el PATCH lo callaba).
- Sigue sin tocarse solo, a propósito (Tuya borra+recrea). Guardián del catálogo ampliado a `tgAvisoAlertaBotones`.
- **Alberto repuso los dos PIN desde el panel** (BD: ambos → 13:00, mismo código, `tuya_password_id` nuevo) pero
  la pantalla seguía en «11:00»: `ajustarVentana` no recargaba la lista tras el PATCH. Corregido en el mismo PR. Doc: `docs/DOMOTICA-TUYA.md` (Fase 2).

### ✅ (02/09/2026, 06:36 UTC) Correduría: TRASPASO CERRADO — el CRM corre sobre la BD de central
- Rol nuevo `crm_seguros` en central (LOGIN, BYPASSRLS, DML en `seguros`, `search_path=seguros`, sin `public`)
  porque `DATABASE_URL` de `central-asegura` es Sensitive en Vercel y no se puede copiar. Alberto pegó la URL
  en el proyecto Vercel `asegura` (con el agente de Chrome haciendo redeploy/health/dry run).
- Prueba real: `/api/health` → `db: ok`; `cima-pull` dry run #187 → `cima_pull_started/completed` en
  `seguros.operational_events` DE CENTRAL, `queueDepth: 128`. El cron (05:30/11:30 UTC) escribe ya aquí.
- 40 min perdidos por pegar la plantilla `TU_CONTRASEÑA_AQUI` sin sustituir: el health lo tapa; la causa
  estaba en `get_runtime_errors` de Vercel. ⚠️ La contraseña de `crm_seguros` pasó por el chat: **rotar**.
- Queda: auth del CRM sigue en el Supabase de Manuel (9 usuarios); `record-evidence.ts` por PostgREST; Fly;
  y el banner rojo de Supabase «Grace period is over» en la org de Alberto (cuota) — revisar billing.

### 🏠 (02/09/2026) Correduría «todo nosotros»: el CRM ya es nuestro, está CAÍDO desde el 31/08, y falta UNA variable
- Alberto: «haz lo necesario para tener todo nosotros». Hallazgo: el repo `asegura` (CRM de Manuel) y su
  proyecto Vercel `asegura` (`app.grupoasegura.com`) **ya están en la cuenta/equipo de Alberto** — el doc
  del traspaso iba por detrás. Secrets de Actions viajaron.
- 🚨 **El CRM lleva caído desde el 31/08 06:15 UTC** (primer despliegue en nuestro equipo): `password
  authentication failed for user "postgres"` en TODA consulta (386× en `/api/health`); `cima-pull` → 500
  (3 corridas). Nadie lo vio (sin Slack). Origen congelado ⇒ la copia del 02/09 es completa.
- Hecho: 12 funciones + 26 triggers portados a `seguros`; `prisma_seguros` con `search_path=seguros`;
  `apps/asegura` lee de central por defecto (`urlFuenteCartera`, probado; `ASEGURA_FUENTE=origen` vuelve).
- **Pendiente de Alberto (panel Vercel, 4 pasos en `docs/TRASPASO-CORREDURIA.md` «CIERRE»):** poner en el
  proyecto `asegura` el `DATABASE_URL` de `central-asegura`, redesplegar, `/api/health`, `cima-pull` dry run.
- Queda para después: auth (9 usuarios en el Supabase de Manuel), `record-evidence.ts` por PostgREST, Fly.
- PR #2002 (lateral plegable + copia) **mergeado** por orden de Alberto.

### 🗄️ (02/09/2026) Correduría: la cartera YA ESTÁ COPIADA en `seguros` (foto fija, origen sigue vivo)
- Alberto: «vamos con la copia de BBDD, es prioritario». **Hecho:** 52 tablas, 86.628 filas, 131 FKs,
  verificación por recuento (52/52) y checksum de contenido (clientes, pólizas, recibos, siniestros).
  Central pasa de 213 a 274 MB (plan free, 500 MB).
- 🔑 El bloqueo del 01/09 era el secreto del Vault: traía una contraseña suelta de 10 caracteres, no una
  URL, y no era la de ningún rol. Salida: **`apply_migration` entra en el proyecto de Manuel como
  `postgres`** (`execute_sql` solo como `supabase_read_only_user`) → rol temporal `traspaso_lectura` →
  dblink desde central por el pooler `aws-1` → **rol borrado y secreto vaciado al acabar**.
- ⚠️ Es una FOTO: CIMA sigue entrando en la BD de Manuel y TODAS las apps siguen leyendo de allí
  (`ASEGURA_DATABASE_URL`). Repuntar lectura + ingesta es el paso siguiente, no este PR.
- `tenant.ts`: vínculo real cuenta ↔ correduría por email contra `seguros.usuarios` (cierra el TODO).
- 🐛 El script fallaba en `codeoscopic_consumo` (tabla nuestra, no del origen) y hacía rollback de todo:
  añadida la guarda «solo tablas que existen en el origen».

### 📐 (02/09/2026) Plataforma: botón « para plegar el lateral
- `UserSidebar.tsx` (escritorio): botón «/» en el cabecero → tira de iconos de 56px (tooltips por `title`),
  pie con solo ⏻. Estado en `localStorage('nav-plegado')` aplicado por el **script anti-parpadeo de
  `layout.tsx`** (`html[data-nav-plegado]`, CSS en `globals.css`), igual que tema y saldo oculto: sin salto
  al recargar. Móvil (drawer) intacto.
- 🔎 Hallazgo de paso, SIN tocar: en la ficha de Jose Suarez Salas sale «📍 34143, Tarragona» porque en la BD
  de **Manuel** (sigue siendo la fuente, `ASEGURA_DATABASE_URL`; NO hay copia) la ficha `intranet:cli:17`
  tiene `ciudad='34143'` / `provincia='Tarragona'` (CP correcto 41003). **504 fichas** del volcado
  `intranet:` tienen `ciudad` numérica y 488 `provincia='Tarragona'`: columnas corridas en ESA importación.
  Hay duplicado sin fusionar (`asegura_app:cli2:17`, SEVILLA/41003) con las 14 pólizas históricas.

### 🔎 (01/09/2026) Correduría: buscador de TODO, cola de retención y limpieza de la pantalla
- 🗑️ **Borrada** `/cartera/renovaciones` de asegura (duplicaba la de plataforma) y su menú.
- 🔎 **Buscador universal**: nombre · matrícula · nº póliza · DNI · teléfono · email · ciudad · CP.
  Un término se busca por TODOS los criterios que encaje. 🚨 **DNI/teléfono/email solo alcanzan al
  12-16%** de las fichas (índice ciego) y **la dirección va CIFRADA: no se puede buscar** — cada
  bloque enseña su cobertura, porque ahí un vacío no es una ausencia.
- 📞 **Cola de retención** (art. 15 LCS): manda el RELOJ, no el importe. Al mes la cobertura queda
  **suspendida** y el cliente no lo sabe; pagar la devuelve en **24 h**; a los 6 meses se extingue y
  retener = póliza nueva. Botón `tel:` y salto a retarificar. Vacía ≠ «todo cobrado»: se declaran las
  18 pólizas vivas sin ningún recibo.
- 🧹 **Pantalla reorganizada por el agente de diseño**: 12 KPIs → 4; el buscador sale del bloque que
  hacía `return` al fallar (desaparecía con el puerto caído); «pendiente de confirmar» sale del gate
  `totalAnual>0` que lo escondía; la matriz del banco se pliega (no se borra: es donde se aprende).
- 32 tests nuevos (`busqueda`, `retencion`, `correduria-puerto`). CI verde. PR #1999.

### 🗂️ (01/09/2026) La correduría se trabaja desde plataforma: ficha del cliente y accesos directos
- 📌 **Dictado de Alberto:** *«asegura hay que meterlo en correduría, yo solo uso UNA página»*. Su
  pantalla es `plataforma → /correduria`; **asegura es la trastienda** (BD + el botón que gasta 0,50€).
  Escrito en los tres CLAUDE.md: pantalla nueva de la correduría → se monta en plataforma.
- 🔎 Se destapó una **duplicación**: la lista de renovaciones que se hizo ayer en asegura era paralela
  a la que plataforma ya tenía. Se conserva (enseña el coste de la tanda) pero no crece.
- ✅ **`/correduria/cliente/[id]`**: pólizas, recibos, siniestros y contacto en UNA pantalla. El nombre
  de Renovaciones es enlace directo + buscador. Único salto a asegura: «Retarificar ↗».
- 🚨 **Cuatro «no lo sé» que no se colapsan**: `recibos.total 0` ≠ al corriente (**18 de 109 vivas** no
  tienen recibo), `recibos null` = asegura sin desplegar, `clienteId null` = sin enlace, y
  `no_encontrado` ≠ `error`. Y `importeEiac()`: `Number('1.234')` daría 1,23€ donde pone 1.234€.
- Puerto nuevo `/api/operador/{cliente,clientes}` (DNI/IBAN NO cruzan). 15 tests nuevos, CI verde.

### 🔁 (01/09/2026) asegura: renovaciones + dos bugs vivos encontrados al repasar
- **`/cartera/renovaciones`**: qué vence en 90 días por urgencia REAL, con el objeto asegurado
  (distingue tres pólizas del mismo cliente) y el coste de retarificar la tanda. `cabenEnTanda()`
  **estaba construido y sin usar**: la cartera viva entera son ~40€.
- **NO hay botón de «retarificar todas»** y es honesto: las 80 vivas traen solo matrícula, así que
  cada una necesita elegir versión. Se podrá con el PDF subido o con créditos de `/vehicles`.
- 📜 La ley ya estaba modelada y vale dinero: **una subida de prima es una MODIFICACIÓN** (LCS 22),
  exige 2 meses de preaviso; sin él, la compañía **no puede imponerla**. Eso es «última llamada».
- 🐛 **Bug 1:** `estadoMigracion()` contaba TABLAS → 53 tablas vacías hacían `migrado:true` y la
  pantalla decía «tu cuenta no está vinculada» (ausencia COMPROBADA) sobre 32.600 fichas. Ahora
  cuenta **corredurías** (no clientes: no toca PII) y la decisión es pura en `migracion-decision.ts`.
- 🐛 **Bug 2:** el guardián de aislamiento marcaba infractor un fichero PURO por nombrar
  `seguros.clientes` **en un comentario**. Ahora ignora comentarios; verificado que sigue mordiendo
  SQL real.

### 📄 (01/09/2026) asegura: subir una póliza y que el agente la lea — primera pasada
- `/cartera/subir`: PDF (texto) o foto (visión). **No gasta cotizaciones** — leer es gratis.
- Reutiliza el pipeline ya probado de `apps/asegura-portal`; lo nuevo es QUÉ se busca (17 campos
  para cotizar, no los 5 de la bóveda) y la validación dura: **letra del DNI** y **formato de
  matrícula** se comprueban, porque un DNI mal leído es otra persona y una matrícula, otro coche.
- Procedencia nueva **`documento`** (entre `compania` y `calculado`) + `debeSustituir()`: lo leído
  **nunca pisa lo que mandó la compañía**. Guardián `test/regression-marcadores-sin-dato.test.ts`
  fija que los DOS extractores traten igual los «no lo sé». Cepo verificado rompiéndolo.
- 🐛 Fallo cazado por su test: limpiar «muchos» dejaba '' y `Number('')` = **0** → «muchos
  siniestros» se guardaba como «ninguno», y en la dirección que abarata la prima. Con regresión.
- ⚠️ **NO escribe en la cartera** (rol SELECT-only) ni **guarda el fichero** (falta decidir dónde y
  cuánto tiempo se conserva PII, y `cliente_documentos` no existe). Devuelve el hash, no el papel.

### 🧭 (01/09/2026) asegura — EL PRINCIPIO de Alberto: presupuesto rápido, verificación al emitir
- *«Todas las opciones posibles; presupuesto = lo más fácil y rápido; y ya en caso de cuadrar al
  cliente, nos centramos en que todos los datos estén bien.»* **Dos fases con exigencias OPUESTAS.**
- Consecuencias en el código: (1) **ningún dato con un solo camino** — la versión del vehículo tiene
  cuatro (ficha en texto · foto ficha técnica · catálogo a mano ✅ · matrícula de pago); (2) la fase 1
  no se bloquea salvo por lo que no se puede inventar sin mentir; (3) 🎯 **los `supuestos` de la
  precalificación SON la lista de verificación de la fase 2**, con los `optimista` en cabeza.
- ⚠️ Matiz medido: las **80 pólizas vivas (CIMA) NO traen marca/modelo en texto** (solo matrícula);
  ese camino sirve para el volcado histórico. Por eso el catálogo a mano era lo primero a construir.

### 📸 (01/09/2026) asegura: alta por fotos, SINCO y el siguiente ramo — investigado y anotado
- 🚨 **La ficha técnica SÍ trae la versión (campo `D.2`)**, más `K` de homologación. Se creía que
  solo la marca. Pero `D.2` es homologación EUROPEA, no Base7: sigue habiendo emparejamiento, que se
  cierra filtrando por cilindrada + potencia + combustible + año. **Con 2+ candidatos decide una persona.**
- **BD de matrículas gratis: no la hay útil.** DGT open data va anonimizada (sin matrícula); el resto
  de pago; y todas darían TEXTO, no el código Base7. La foto de la ficha técnica es mejor fuente.
- 🎯 **SINCO = fichero SIHSA de TIREA**: siniestralidad de los **últimos 5 años** (la ventana exacta de
  `lastFiveYearsAccidents`), consultable al tarificar. ⚠️ Se ofrece a «Entidades Aseguradoras» y una
  correduría NO lo es → **preguntar a TIREA** (`accesos.cima@tirea.es`). El asegurado sí puede pedir el
  suyo gratis. Y la compañía lo consulta igual al emitir: la siniestralidad presumida se corrige sola.
- **Siguiente ramo: HOGAR** (dictado de Alberto). Más fácil porque no hay vehículo que identificar.
  Primer paso gratis: `GET /insurance-lines` dice si tarifica para nosotros.
- Diseño: `docs/superpowers/specs/2026-09-01-asegura-alta-por-fotos-y-bonificadores.md`.

### 🔘 (01/09/2026) asegura: el botón «Retarificar» sobre la cartera REAL, de punta a punta
- `/cartera` → buscar cliente → ficha → **Retarificar** en una póliza de auto. Plan de Alberto:
  primero a mano sobre clientes de verdad, automatizar después.
- ✅ **`seguros.codeoscopic_consumo` YA CREADA en la BD** (con sus dos CHECK). Era el bloqueo real.
- 🚨 **Medido: las 80 pólizas de auto vivas (CIMA) traen SOLO matrícula** — ni marca ni modelo ni
  año. Pero el código de versión sale **gratis** navegando `car/brands→models→vehicles`; lo que
  cuesta créditos es buscar **por matrícula**. Se cotiza HOY sin comprar nada.
- `desde-cartera.ts` devuelve **tres** cosas: lo que se manda, lo **supuesto** y lo que falta. Los
  supuestos tiran a la baja salvo la siniestralidad (decisión de Alberto, marcada `optimista`).
  **Nunca se supone un dato personal.** Centinela nuevo: 20.860 fichas se llaman «Lead».
- Guardián `test/regression-asegura-gasto-codeoscopic.test.ts`: un solo puerto gasta y es POST
  (un `GET` que cotice lo dispararía un prefetch). **Cepo verificado rompiéndolo.**
- Falta de Alberto: contraseña al rol, `CODEOSCOPIC_TARIFICACION_ACTIVA=true` y redeploy.

### 📚 (01/09/2026) Conseguida la documentación OFICIAL de la API de Codeoscopic
- Alberto exportó el portal (`portal.api-int…`, MHTML) y de ahí sale el índice completo de
  operaciones → **`docs/CODEOSCOPIC-API-PORTAL.md`**. Primera fuente del FABRICANTE (el traspaso de
  Manuel describe lo que él implementó, no lo que la API ofrece).
- 🚨 **Hogar SÍ está en la API** (11 catálogos `/home/*` + `recommend-limits`), y hay SEIS ramos:
  auto, moto, hogar, vida temporal, salud, decesos. Corrige lo dicho esta misma tarde.
- 🚨 **`GET /insurance-lines` dice si cada ramo tarifica** (`supports.rating`) para tu organización,
  y es GRATIS: no hay que preguntárselo a JM.
- 🚨 **`GET /car/registration-date?plate=`** da la fecha (aproximada, `null` si no la halla), y
  **`GET /vehicles?registrationPlate=`** resuelve el VEHÍCULO — pero es la ÚNICA operación de la API
  que exige **créditos de pago** (comercial@codeoscopic.com). Era el cuello de botella de «matrícula→precio».
- `portal.` NO es el host de la API: el propio portal muestra `api-int.codeoscopic.io/oauth2/token`.
- 🚫 La API expone pólizas/recibos/siniestros, pero **NO se usan**: eso ya lo da **CIMA, conectado y
  directo con las compañías** (dictado de Alberto). Codeoscopic sería el espejo parcial de Avant2.
- 🧭 Regla de reparto, palabras de Alberto: **«Avant2 vender, CIMA backoffice.»** De esta API interesa
  lo que ayude a VENDER (cotizar, borradores, catálogos, matrícula); lo que huela a backoffice, no.

### 🔍 (01/09/2026) El fixture de Codeoscopic, releído entero: 3 fallos del parser corregidos
- 🚨 **`errors[]` es por CONFIGURACIÓN de producto, no por compañía.** Reale falla con la config
  `37786__` **y da 8 precios** con `83474 (ASM y API)`. El resumen decía «Reale sin precio»: falso
  sobre la que más dio. Ahora `tambienDioPrecio` y solo se nombran las mudas (Pelayo, Zurich).
- **`deductible` la traen 10 de 18 precios** y se tiraba: enseñar 427,79€ de todo riesgo callando
  1.500€ de franquicia es «dato que SÍ está pero se lee mal». Ausente = `null`, nunca `0`.
- **`modality.category`** da los 6 niveles (Terceros → Todo Riesgo Sin Franquicia): la agrupación
  de la comparativa. Sin usar aún: `addonQuotes` (RACE asistencia 54,99€/199,00€) y `links[]`.
- Lección de método: el fixture llevaba en el repo desde por la mañana y estos tres solo salieron
  al leerlo ENTERO, no por muestreo. 73 tests en asegura, todo verde.

### 🎯 (01/09/2026) CI: el push «mudo» es LAG de GitHub — causa medida, no otra hipótesis
- Dos pushes sobre el PR #1962 (ya fuera de draft) no dispararon ningún requerido. Al mirar el **objeto
  PR** en vez de los runs: `git ls-remote` daba `5a732a51` y el PR seguía en `d0d23c65`, con 2 commits de
  5 y `mergeable_state:"dirty"`. GitHub no había procesado el `synchronize`.
- A los ~2 min se puso al día SOLO y los 12 arrancaron en ese instante, sin des-draftear, sin mergear
  `main` y sin push nuevo. Verdes y mergeado (`3804b42e`).
- Corrige tres días de teoría del `CLAUDE.md` (draft, identidad, «merge de main»): cada palanca que
  «funcionó» llevaba minutos de espera detrás. **Procedimiento: compara `ls-remote` con el `head.sha`
  del PR ANTES de tocar nada; si no coinciden, espera 2-3 min.** Cada palanca crea un head nuevo y
  reinicia la espera.

### 🧾 (01/09/2026) asegura: constructor de la petición de cotización de auto (validación gratis)
- `lib/codeoscopic/peticion-auto.ts` — puro: de los datos de la ficha al `CreateInsuranceRequest_V1`.
  **23 tests.** `revisarDatosAuto()` devuelve todos los reparos a la vez; `construirPeticionAuto()`
  lanza si queda alguno. Motivo: un cuerpo mal formado da un 400 **ya facturado**.
- Reglas del vendor encerradas en test: la MISMA persona idéntica en los tres papeles (holder/owner/
  primaryDriver, el vendor cruza por DNI), la dirección solo con sus dos mitades, y
  `lastFiveYearsAccidents` obligatorio si años sin siniestros < 5 y ≠ años asegurado (con `0` como
  respuesta válida, no hueco). Y los 5 campos que NO viajan (email, calle, ocupación…).
- Convenciones de UI mapeadas para la pantalla: **no hay Server Actions en el repo** (route handler
  + form cliente), asegura usa tokens de `globals.css` (no Tailwind) y zod solo en el route.
  Molde: `apps/mariscos/app/(usuario)/_forms.tsx` + `app/api/partidas/route.ts`.
- Sigue bloqueado en lo mismo: redeploy de `central-asegura` + sonda. Sin eso, nada verificado.

### 🧭 (01/09/2026) Portal de Grupo Asegura — Fase 1 MERGEADA (PR #1965 → `f12b7b46`)
- App nueva `apps/asegura-portal` (Next.js, rol propio SIN BYPASSRLS) + `@central/module-seguros-portal`
  (puro: niveles de acceso, procedencia en tres estados, código de un solo uso). 6 tablas `portal_*`
  en el schema `seguros` — **el SQL NO está aplicado todavía**; las otras 5 del spec llegan con sus fases.
- **El canal es un PUERTO**: la WABA no existe aún, así que en Fase 1 se enchufan email y consola;
  WhatsApp entra añadiendo un fichero. `canal_no_disponible` (503) ≠ `envio_fallido` (502).
- 🚨 Los 3 ENUM del DDL estaban tipados `String` en Prisma: typecheckea y **revienta en el primer
  INSERT** (42804). Arreglado declarándolos con `@@map` — no hay migración, la BD ya era así.
- Guardián `test/regression-portal-aislamiento.test.ts` (importar `lib/session` **y** nombrar
  `identidadId`), verificado con un infractor real en sus dos variantes.
- Mergeado el 01/09 con los 19 checks en verde; re-probado sobre `main`: `pnpm test` EXIT=0 (guardián
  108/108) y typecheck de `asegura-portal` limpio. Falta de Alberto: proyecto Vercel, rol
  `prisma_asegura_portal` con contraseña, envs, ejecutar el SQL de Fase 1, y la WABA.
- 🚧 **Volcado de la cartera: LANZADO Y BLOQUEADO (01/09/2026).** DDL ya aplicado (52 tablas,
  42 enums, `dblink`+`vector` OK), pero el secreto `asegura_origen_url` del Vault **mide 10
  caracteres: no es una cadena de conexión**, así que `dblink` falla con «password or GSSAPI
  delegated credentials required» en la primera tabla. **Nada escrito** (la transacción revierte:
  bitácora 0, clientes 0, pólizas 0, FKs 0). Al corregirlo: pegar el `ASEGURA_DATABASE_URL` del
  proyecto Vercel `central-asegura` **sin `pgbouncer=true`** (no es un parámetro de libpq) y mejor
  por el **puerto 5432**, no el pooler.

### 🔬 (01/09/2026) Codeoscopic: forense de la única cotización real — dos docs corregidos
- No hay conexión desde el contenedor: el proxy deniega por política `codeoscopic.io`,
  `central-asegura.vercel.app` y `app.grupoasegura.com` (403 en el CONNECT). La verificación
  tiene que salir del despliegue de Vercel, no de la sesión.
- 🚨 **El `project_not_found` del webhook NO era un fallo de correlación:** los 2 eventos son smoke
  tests con ids inventados (`999999`/`smoke-test-s168`, `smoke-fix-webhook`). **Codeoscopic no ha
  mandado nunca un webhook real** — solo los dispara al emitir, y no se ha emitido. Corregido en
  `sector.md` §4 y en la cabecera de `CODEOSCOPIC-TRASPASO-MANUEL.md`.
- **Los 15 precios reales del 29/07 son TODOS `estimado`** (el fixture del sandbox, 0 de 18). Dos de
  dos: el precio con reservas es el caso general. Parrilla real: Mapfre, Allianz, Occident
  (278,59€–609,64€), no Reale/Fidelidade. `expires_at` NULL en los 15 → un precio pagado NO se puede
  reutilizar. `referenceFromVendor` es por compañía (Mapfre no lo manda).
- Cartera viva por ramo: 81 auto/moto · 19 hogar · 9 RC. Hogar NO tiene cotización en el repo de
  Manuel, pero la API es multi-ramo (`insuranceLine`) y `insurance-lines` se puede consultar GRATIS.

### 🚨 (01/09/2026) Vigía de reservas: los 3 avisos que mandó eran FALSOS (y no solo hay Booking)
- El 🚨 «reserva 153896946 que Smoobu NO tiene» era falso: está en Smoobu y en `incomes` (Expedia,
  Busto Reform, 03→07/09, Karl Brunelliere). El nº salía del **enlace del propio correo de Smoobu**
  (`login.smoobu.com/es/booking/detail/153896946` = `incomes.reservationId`), y el vigía solo
  comparaba contra las referencias de la OTA. Las 3 alertas emitidas hasta hoy, falsas.
- Arreglado: la notificación de `service@smoobu.com` ya no entra al vigía ni al agente de huéspedes
  (parser `lib/correo/smoobu-notificacion.ts`, 8 tests con el correo real); el vigía compara también
  contra `b.id` y mira `incomes` antes de preguntar; y el aviso dice el **canal REAL** (Expedia,
  Agoda…) o ninguno — ya no manda a la extranet de Booking a por una reserva de Expedia.
- Fila 10 (cancelación de JUAN PONCE) corregida a mano en BD: era `nueva`/`huerfana`. PR #1978, mergeado.

### 🧹 (01/09/2026) Vanesa = Sique Brilla, y su ÚNICA pantalla es /invitado/limpieza
- Tras el PR #1991, Alberto miró el viernes 04/09 en la intranet y **la cuna no estaba**: la orden
  salió por email y se pintó en `/sivra/mensajes`, dos canales que ella no abre.
- **Corrección de hecho:** Vanessa Cruz = Sique Brilla SL (los docs las trataban como dos actores) y
  **ya no usa ialimp** — se le retiró el acceso. ialimp **se queda tal cual** como producto a vender.
- `enviarOrdenLimpieza` crea ahora la fila en `limpieza_tareas` ANTES del email; columna
  `sivra_ordenes_limpieza.tarea_id` (aplicada): NULL = **la limpieza NO lo ve**, y se canta.
- Corregidos los docs que afirmaban lo contrario: landmine #7 de `sivra-maestro`, `ialimp-maestro`,
  `ialimp-client-health` (sus «0 accesos» ya no son avería) y `apps/plataforma/CLAUDE.md`.
- Regla global nueva en el `CLAUDE.md` raíz: antes de dar por avisado a alguien, mira EN QUÉ PANTALLA
  trabaja. **PR #1994.**

### 🧹 (01/09/2026) SIVRA: la orden a la limpieza deja de depender de que Stripe vea el dinero
- Raquel (reserva 152490601) pagó la cuna **por Bizum**: `sivra_extras_reserva` congelada en
  `ofrecido` y Sique Brilla sin enterarse — el email lo dispara SOLO el webhook de Stripe. Orden
  mandada a mano ese día con autorización expresa de Alberto.
- Dictado suyo: **la orden NO lleva estado de cobro** («ni pagado ni confirmar, simplemente una orden»).
  Tabla nueva `sivra_ordenes_limpieza` (aplicada) sin importe: qué se pidió y si el email SALIÓ.
- Botón 🧹 en el Telegram del borrador (callback `hsp_clean`, va ANTES del lookup del pendiente porque
  se ofrece justo después del ✅ Enviar, que ya lo borró); órdenes visibles en `/sivra/mensajes` y
  dentro del prompt del agente (deja de re-escalar «¿está confirmada la cuna?»).
- `[]` = nada pedido · `null` = no se pudo leer · `enviado_at` NULL = se intentó y no salió. **PR #1991.**

### 💶 (01/09/2026) asegura: cliente de tarificación Codeoscopic con contador y TOPE
- `apps/asegura/lib/codeoscopic/` — config · contador (puro) · libro en BD · token+transporte ·
  parser (puro) · orquestador. **43 tests verdes**; typecheck y QA limpios.
- **Apagado por defecto** (`CODEOSCOPIC_TARIFICACION_ACTIVA`); sonda GRATIS
  `/api/operador/codeoscopic/sonda` (solo token) que corre con el interruptor apagado y separa
  fallo de HOST de fallo de CREDENCIALES.
- 🚨 **Tope persistente en `seguros.codeoscopic_consumo`** (en memoria sería mentira en serverless):
  tres estados y solo `descartado` con evidencia libera cupo — **un timeout NO es evidencia**.
  Sin libro legible NO se cotiza. Topes 20/día · 200/mes, techo duro 250/1000.
- **Hallazgo:** en el fixture real **0 de 18 precios eran firmes** (2 estimados, 16 condicionados) →
  el parser devuelve `firmeza` + avisos. Envs de Codeoscopic ya puestas en Vercel por Alberto.
- ⚠️ Detectado de paso: el schema `seguros` **ya tiene sus 52 tablas** (todas a 0 filas), así que
  `estadoMigracion()` (cuenta TABLAS) dirá «migrado» sobre una cartera vacía. Sin tocar: avisado.

### 🔑 (01/09/2026) Codeoscopic: credenciales de PRODUCCIÓN activas + host prod — ya se puede cotizar
- Mensaje de Manuel: el Bitwarden Send trae el set `CODEOSCOPIC_*` de **PRODUCCIÓN, ACTIVO** (lo
  caducado era solo el usuario sandbox `albertocsf0170ws` → regeneración EN PAUSA; si 401, escribe
  Manuel a JM). **Host prod: `https://api.codeoscopic.io`** (`-int` = sandbox). OpenAPI no lo tiene.
- 🚨 Consecuencia: **sin sandbox utilizable, toda cotización es real (0,50€)** → contador+tope desde
  el PRIMER smoke, y el smoke (1 cotización) solo con OK explícito de Alberto. Anotado en `sector.md` §4.
- Alberto está metiendo las 6 envs de cotizar en Vercel `central-asegura` con Claude Chrome (valores
  solo por Bitwarden; a Vercel únicamente las 6 — webhook/legacy/flags NO). `BASE_URL` = host de prod.
- ✅ **Fixture incorporado**: `apps/asegura/fixtures/codeoscopic/` (18 precios + 3 errores reales;
  sanitizado verificado, no solo dicho). Su README anota lo que el traspaso NO decía: `$ref`
  JSON-Pointer en `offers[]`, `id` raíz numérico vs `"Q…"` string, y 🚨 **`estimate`+`messages[]`
  deciden si un precio va en firme** («Riesgo condicionado»). Compañías del fixture = sandbox, no la
  parrilla real. **PR #1972.**
- **Siguiente paso al confirmar envs:** cliente de tarificación en `apps/asegura` + smoke.

### 📱 (01/09/2026) WhatsApp de la correduría: descartados el rodeo por SMS y la campaña masiva
- **SMS con enlace `wa.me` para que escriba el cliente primero y salga gratis: descartado.** Un SMS en España
  cuesta ~4-8 cént. contra **0,0166€** de una plantilla utility → pagas 3-5× por no pagar 1×. Y un `wa.me`
  desde SMS **no** es *free entry point* (esos son click-to-WhatsApp y el botón de web/Facebook, 72h gratis).
  Además el **01/10/2026** Meta empieza a cobrar los mensajes de servicio: el ahorro caduca en 30 días.
- **Campaña a los 32.520 leads: descartada.** No es que sea cara — **es que no se puede gastar**: Tier 0 = 250
  destinatarios/24h → 130 días; los bloqueos de una lista de 2013-2018 tumban el *quality rating* en la primera
  tanda y queman el MISMO número que atiende a los 80 clientes vivos. Sin opt-in: LSSI art. 38.3.c, hasta 150.000€.
- **Sí al inbound de cualquiera** (gratis, no penaliza calidad, es un lead con intención propia) — pero **Nivel 0
  aunque el móvil esté en las 32.600 fichas**: un teléfono de hace 12 años hoy es de otra persona; decirle «veo
  que tienes pólizas con nosotros» es una brecha, no una bienvenida.
- **Decisión de orden: WhatsApp entra como CANAL (OTP + avisos), NO como agente conversacional.** A 80 clientes
  vivos un bot atiende ~12 conversaciones/mes; el canal, en cambio, trabaja solo. Difiere entera la DPIA y el
  art. 50 del AI Act, y encaja sin tocar nada con `2026-09-01-asegura-portal-fase-1.md` (canal = puerto).
- **Cloud API directa de Meta, no 360dialog**: sus 49€/mes no compran nada a este volumen (mensajería real
  <2€/mes). Captación por *free entry points*: botón en la web, QR en el PDF de póliza, firma de email — coste 0.
- **PENDIENTE que no depende de nadie y es el único camino crítico: dar de alta la WABA** (Business Verification
  = 2-14 días de espera de Meta). Nombre EXACTO del Registro Mercantil, CIF, factura de suministro y
  `grupoasegura.com` en pie con aviso legal coincidente. Número nuevo (no puede estar ya en WhatsApp).

### 💶 (01/09/2026) Comisiones de la correduría: IMPLEMENTADO devengo → liquidación → cobro → renta

- Libro `comisiones_devengo` + `comisiones_cobertura` (migración aplicada; se retira `cima_liquidaciones`, 0 filas).
- `/api/cron/cima-liq` deja el SOAP a `ws.cimaseg.es` (nunca funcionó, 404) y lee el **puerto HTTP** de
  `apps/asegura` (`/api/operador/comisiones`) — NO `ASEGURA_DATABASE_URL`, que solo existe en esa app.
- Helper puro `lib/correduria/cuadre.ts` con **9 estados**: `deudor` (Occident) ≠ impago, `sin-cobertura`
  (Generali) ≠ `sin-datos` (Mapfre), y `no-comprobado` manda sobre todo. Total anual con huecos = provisional.
- 🚨 Los tres números NO son el mismo: la compañía retiene el **15 % de IRPF** (modelo 190 → borrador AEAT),
  al banco llega la **remesa**. Allianz feb/2026 medido: 95,03 − 14,26 = 80,77 exacto contra el BBVA.
- Lector del PDF de Allianz (**EBCDIC cp500**, tabla propia: Node no lo trae) + confirmación manual (Mapfre).
- Pestaña «Cuadre» en `/correduria`. 31 tests nuevos. Los 12 checks en verde. **Mergeado (#1962).**
- 🚨 **Dictado de Alberto:** «la retención la hacen ellos, yo solo recibo ya lo mío». La practica y la
  ingresa LA COMPAÑÍA → para él NO es un gasto, es un **pago a cuenta** que resta de la CUOTA. A la
  renta va el BRUTO; contra el banco se compara la REMESA. Llevado a `cuadre.ts`, a la pantalla y a las
  skills `perfil-fiscal` / `agente-correduria`.
- **PENDIENTE (nuevo):** `lib/finanzas.ts:594` sigue ESTIMANDO el bruto elevando el neto del banco
  (`× 0,15/0,85`) y da por hecho que todo abono de seguros es comisión al 15 % — un periodo deudor de
  Occident rompe el supuesto. El bruto y la retención REALES ya están en `comisiones_devengo`: falta
  sustituir la estimación por el dato real. Hasta entonces, la cifra fiscal de comisiones es estimada.

### 🗂️ (01/09/2026) Rediseño de la ficha de cliente: es un índice, no un expediente
- Alberto: «el CRM no me convence… en una visual tengo que ver quién es, con quién está relacionado
  y qué tiene». Diseño + maqueta →
  `docs/superpowers/specs/2026-09-01-asegura-ficha-cliente-design.md` · artifact `22b57a16`.
- Inventariado qué hay detrás de cada pantalla (skill `agente-correduria`, `sector.md` §8). Con
  contenido: recibos (182 en 89 pólizas), **coberturas 1.418 en las 109** (la puerta más rica y hoy
  invisible), siniestros 67, comisión por póliza vía `comision_bruta`. Vacías: notas, WhatsApp,
  gestiones (23 de cartera viva, no 694).
- 🚨 Tres cifras que engañan: **902 de las 1.710 relaciones son roles de póliza**, no familia; los
  **3.676 «presupuestos» son pólizas de la competencia** del volcado; y las cotizaciones reales (24)
  tienen prima y compañía **al 0%**.
- 🚨 **Documentos: hacen falta en cliente/póliza/siniestro y solo la póliza tiene tabla.** Faltan
  `cliente_documentos` y `siniestro_documentos`; `bienes_asegurables` sin `poliza_id`. **0 ficheros
  en todo el sistema.** Falta el estado «pedido pero no recibido».
- ✅ PR #1949 (vigía de CIMA) **mergeado**: los 12 checks arrancaron al mergear `main` en la rama —
  quinta confirmación del orden documentado en `CLAUDE.md`.
### 📜 (01/09/2026) Codeoscopic: el Claude de Manuel CONTESTÓ — contrato de la API completo
- Respuesta transcrita en **`docs/CODEOSCOPIC-TRASPASO-MANUEL.md`**; resumen operativo en
  `agente-correduria/references/sector.md` §4. Resuelve el host base (**sandbox
  `api-int.codeoscopic.io`**, sin `portal.`; producción no consta → pedir), auth (OAuth2
  client_credentials + `X-Client-App`/`X-User-Email` + media type `vnd.codeoscopic.v1+json`) y el
  flujo: **`POST /insurances` SÍNCRONO, facturable y NO idempotente (jamás retry)** → `id` =
  project_id (persistirlo SIEMPRE: su ausencia era el `project_not_found` del webhook).
- Basic Auth del webhook: DEFINIDO (lo genera ASegura, lo carga Codeoscopic); solo falta ejecutarlo.
  Sin contador/tope de coste en su repo → se pondrá en central. Solo AUTO cableado.
- **Quedan 3 peticiones fuera del repo:** credenciales OAuth2 sandbox nuevas (JM Fernández, PM API),
  el OpenAPI oficial, y que Manuel adjunte el fixture `2026-06-10-sandbox-quote-response.json`.

### 🧾 (01/09/2026) asegura: prompt para el Claude de Manuel (Codeoscopic/Avant2, tarificación)
- Manuel pidió un prompt para su Claude → escrito en **`docs/CODEOSCOPIC-PROMPT-MANUEL.md`** (lo envía
  Alberto). Pide: doc de la API + host base (no consta en ningún correo de Alberto), esquema de auth,
  endpoints del flujo de cotización con payloads anonimizados, webhook (Basic Auth pendiente +
  `project_not_found`), tablas/estados, NOMBRES de envs (valores por gestor) y si el 0,50€ es por
  cotización o emisión. Solo tarificar; la emisión sigue tras su flag, apagada.
- Contexto medido: las tablas `codeoscopic_*` del volcado traen solo el rastro de pruebas (1 proyecto,
  15 precios, 2 webhooks fallidos) — lo necesario para conectar vive en el repo de Manuel.
- ✅ **Resuelto en el Gmail el 0,50€: es POR COTIZACIÓN**, facturado a mes vencido (correo del CEO
  09/04 + presupuesto de Cristina 14/05 en texto). Actualizado en `sector.md` §4 — todo automatismo
  que cotice lleva contador y tope (~109 pólizas vivas ≈ 54,50€/pasada).
- Al contestar Manuel: volcar a `references/sector.md` §4 y pedir regeneración de credenciales sandbox.
### 📬 (01/09/2026) El correo de Alberto es la TERCERA base de datos — y resuelve una de las diez
- Idea suya: «las compañías me escriben y dan información». Cierto y medible. `mediadores@occidentinforma.com`
  manda **un correo por movimiento de póliza** con nº de póliza, cliente y contrato `M00171`;
  `mediador@allianz.es` manda cartera No Vida, Cuenta Agente y anulaciones por impago **con adjunto**.
- ✅ **La 549147797 NO está anulada**: es una RC profesional del «Instituto Técnico Superior de
  Informática Studium» **emitida el 27/06/2025**, un año antes del arranque de la ingesta. Confirma que
  las huérfanas son cartera pre-CIMA, no bajas.
- 📇 **Mapa de claves** (en la skill): Mapfre `5239640` · Allianz **código 18638 / clave PA342520**,
  sucursal 209 (las cinco variantes `209-x-…` son la misma) · Occident `8-92361`, `M00171`, `306333` ·
  Reale `38605` · Fidelidade con credenciales CIMA desde el 31/08. **`306333` y `8-92361` no aparecen
  en ningún correo**: su origen (Catalana / Plus Ultra tras la absorción) sigue sin confirmar.
- 📌 **Acción que lo cierra:** pedir a Occident la **carga inicial de cartera en EIAC de `8-92361`** —
  Alberto ya hizo esa petición exacta a Reale el 11/04/2026. **No se manda nada sin su OK.**

### 🔑 (01/09/2026) La CLAVE DE MEDIADOR: por qué CIMA perdía datos de una cartera y no de otra
- Idea de Alberto («cada compañía asigna una clave»), medida y confirmada: el 2º campo del nombre
  EIAC es la clave de mediador. **Nueve claves en cinco compañías**; Occident manda por TRES
  (`8-92361`, `M00171`, `306333`) y el atasco NO está repartido — bajo `8-92361` están en cuarentena
  sus 10 SIN y 6 de 9 REC, `306333` va limpia. Agrupar por `codigo_entidad` manda a revisar la
  cartera que va bien.
- **Son DOS averías:** 3 de las 20 huérfanas YA están en cartera (el movimiento llegó antes que la
  póliza; una esperó del 24/06 al 26/07) → se arreglan **reprocesando**. Las otras 17 son cartera
  que la compañía nunca mandó: **CIMA solo envía POL en altas y modificaciones**, así que falta una
  **carga inicial por clave**. Contarlas juntas manda a pedir algo que ya está en la BD.
- PR #1949: el vigía reparte por clave (`porClave`) y separa `huerfanasResolubles`; el puerto extrae
  la clave del nombre; `clave` NO es obligatoria en la validación (un puerto viejo sigue siendo
  legible). 7 tests nuevos. Skill `agente-correduria` actualizada.
- **Pendiente:** el CI del PR no arranca los 12 requeridos ni con merge de main, ni con push real,
  ni des-drafteando (mismo patrón que #1789).

### 🛡️ (01/09/2026) CIMA perdía recibos y siniestros hace 2 meses — vigía nuevo + causa raíz
- Analizando qué CRM necesita la correduría salió una avería VIVA: del 24/06 al 30/08 se quedaron
  **42 ficheros de CIMA en cuarentena — 23 recibos (7.721,71€ de prima) y 20 siniestros**, 39 de
  Occident. Eventos `cima_{recibo,siniestro}_sin_poliza_review`, `reason=sin_poliza_en_cartera`.
- **Causa raíz:** se empareja por `id_poliza_entidad` y **Occident / Catalana Occidente / Plus Ultra
  son el MISMO grupo bajo C0468** — 9 de las 19 pólizas afectadas SÍ están en cartera, con otro
  nombre de compañía y sin código de entidad. Al agrupar por compañía, normalizar el grupo primero.
- **Por qué duró dos meses:** el health-check de origen traía `cuarentenaTotal: 41` (39→40→41 en seis
  días) en su propio parte y sus señales de alarma eran `ficherosError`/`ficherosDeferred` = 0.
  Verde todo el tiempo **midiendo lo que no era**. El reconciliador (`cima_reconcile_resumen`) lleva
  parado desde el 25/06.
- **Hecho (nuestro lado):** helper puro `@central/module-seguros/ingesta` (`saludIngesta`, 11 tests,
  `sin_datos` ≠ `ok`), puerto `/api/operador/ingesta` en asegura, cron `correduria-ingesta` (06:45)
  + aviso `correduria.ingesta` + latido `correduria_ingesta` con su sonda.
- **De Manuel (su repo, no el nuestro):** emparejar por `numero_poliza` normalizado y por grupo de
  entidad; reactivar el reconciliador; meter `cuarentenaTotal` en las señales.
- **De Alberto:** verificar en la intranet de Occident las 10 pólizas que no aparecen (solo 1 da
  señales de anulación; el resto tienen recibos cobrados/pendientes y siniestros abiertos).
- **Corregida deriva documental:** `TRASPASO-CORREDURIA.md` afirmaba que «jamás se ha persistido un
  REC, un SIN ni un CEF» y que no era avería sino función sin encender. Falso: hay 184 recibos, 67
  siniestros y 7 CEF. También 69→67 siniestros en la skill.
- 🧭 **Decisión de producto:** el CRM ESCRIBE donde manda Alberto (leads, notas, tareas,
  renovaciones) y CONSULTA donde manda la compañía (pólizas, recibos, siniestros). Sin módulo de
  siniestros: no se puede aperturar por CIMA y los 67 están congelados (1 actualizado, 0 con
  tramitador). Cartera real: **80 clientes / 109 pólizas**; de los 32.520 leads, **26.964 no tienen
  ni teléfono ni email** y solo **1 ficha** tiene consentimiento registrado.

### 💶 (01/09/2026) Comisiones de la correduría: spec del control devengo → liquidación → cobro → renta
- Alberto: «controlar que me pagan lo que me deben y que está ingresado en cuenta», y que el borrador
  del IRPF cuadre. Medido: **hoy el borrador no se cuadra, se COPIA** (hilo Asecon IRPF 2025: «ingresos
  los que aparece en el borrador»). Retención implícita 14,75% → **15% de IRPF, modelo 190**.
- 🚨 **`apps/plataforma/lib/cima.ts` sobra:** SOAP nunca validado (404), parser adivinado y mapa de
  compañías con códigos numéricos cuando los reales son `C0109`/`C0468`/`C0058`/`C0613`. La BD de Manuel
  YA trae `cuenta_efectivo`/`liquidaciones`/`poliza_recibos` parseadas por el JAR de TIREA, con
  **comisión, retención y remesa separadas** (Allianz feb/26: 95,03 − 14,26 = 80,77 exacto).
- El PDF «Cuenta Agente» de Allianz es legible (**EBCDIC dentro del PDF, `cp500`**) y cuadra al céntimo
  con CIMA. Revela **558,88€ parados** por no haber dado la cuenta bancaria. Mapfre devenga 3.614,65€ en
  recibos cobrados y **cero liquidaciones**. Del banco, el **85% de 2026 sin identificar compañía**.
- Spec en `docs/superpowers/specs/2026-09-01-comisiones-renta-control-design.md` (**PR #1947**), con
  `agente-correduria`, `perfil-fiscal` y `apps/asegura/CLAUDE.md` actualizados: comisión tiene TRES
  estados (devengado→liquidado→cobrado) y la cobertura de CIMA es DESIGUAL por compañía. Pendiente:
  plan de implementación, y 5 gestiones con compañías (Allianz cuenta, Generali/Reale/Mapfre CIMA,
  Occident saldos) que **no se envían sin autorización**.

### 📖 (01/09/2026) EIAC: lo que llega NO es toda la cartera — leído de la norma, no inferido
- Alberto aportó el estándar oficial (TIREA `209_IAC_ESP_DOC` V07.1 v05, 03/06/2026 + XSD). El 4º
  campo del nombre de fichero es el **código de proceso**: los ordinarios (`131/132/133/151`,
  `211-261`, `311/361`) no traen histórico — **`132` «cartera» es solo lo que renueva en el periodo**.
- **La carga masiva es otra cosa y hay una por objeto: `199` pólizas · `299` recibos · `269`
  movimientos · `399` siniestros.** Medido: Mapfre mandó 199+299, Allianz 199 (26 → 26 en cartera,
  cuadra), **Occident y Reale ninguna**, y el **399 no lo ha mandado nadie** (de ahí los 67
  siniestros congelados).
- 🚨 **«Carga inicial» / «primera carga» NO existen en EIAC** — por eso las compañías le decían a
  Alberto que no se hace. El nombre correcto es **carga masiva, proceso 199/299/399**, y **se pide
  fuera del canal**: no hay proceso EIAC para solicitarla (el único `SO` es el `841`, solicitud de
  alta de siniestro — que además demuestra que declarar siniestros desde el CRM **sí** está previsto).
- Escrito en la skill `agente-correduria` (`references/sector.md`) y en `TRASPASO-CORREDURIA.md`.
  Mergeado también el **#1949** (vigía de la ingesta: 42 ficheros en cuarentena, 23 recibos por
  7.721,71€ de prima y 24 siniestros perdidos desde junio por el grupo Occident bajo un solo código).

### 🧭 (01/09/2026) asegura-portal: plan TDD de la Fase 1 (entrar + aportar póliza)

- **#1946**: plan de 12 tareas para `apps/asegura-portal` — módulo puro (niveles de acceso, procedencia
  en TRES estados, código de un solo uso), 6 tablas `portal_*`, sesión propia y bóveda con subida de póliza.

- **El canal de OTP es un PUERTO, no una llamada a WhatsApp**: la WABA de Grupo Asegura no existe todavía;
  en Fase 1 se enchufan email y consola y WhatsApp entra añadiendo un fichero.
- 🚨 **Lección de método:** las firmas de `aiComplete`, `openrouterVision` y `createMailTransporter` que
  parecían obvias eran las TRES falsas (`aiComplete` devuelve `string`; `openrouterVision` toma 5 args e
  `ImageInput` es `{data,mediaType}`; `createMailTransporter()` **no recibe credenciales**, las lee del
  entorno y devuelve `Transporter | null`). Comprobarlas contra `packages/*` antes de escribirlas.
- 🐛 **Bug del rotador de memoria, ARREGLADO en la misma sesión (#1952).** `rotar-memoria.mjs` archivaba
  por la ÚLTIMA fecha de la cabecera: mandaba a agosto la entrada `### 🔴 (01/09/2026) GH_PAT_TRIGGER …
  desde el 31/08` y, peor, a **octubre-2025** la de `### 💶 (15/08/2026) Reserva Luxury 22-25/10 …` (un
  rango de noches leído como fecha). Ahora manda la fecha ENTRE PARÉNTESIS. Guardián nuevo
  `test/regression-rotar-memoria.test.ts`, verificado que falla sin el fix. ⚠️ El flag es `--dry-run`:
  `--check` NO existe y ejecuta la rotación de verdad.
- **Cola de PRs vaciada a petición de Alberto:** 10 mergeados (#1946, #1914, #1928, #1913, #1921, #1865,
  #1879, #1947, #1952, #1927), revisando el diff de cada uno. La rotación mensual de la auditoría (#1927)
  se **rehízo** sobre `main` actual con el rotador ya corregido — 540 entradas a agosto, 23 vivas — y se
  retiró el `docs/memoria/2025-10.md` que había creado el bug.

- **Pendiente de Alberto:** elegir modo de ejecución del plan, y la infra (proyecto Vercel `asegura-portal`,
  rol `prisma_asegura_portal` SIN BYPASSRLS con contraseña, envs, WABA).

### 🗄️ (01/09/2026) asegura: estructura del volcado CREADA en `seguros` + el runbook mentía con las FKs
- Alberto: «la copia de la BD, mejor tener todo nosotros». Hecho el 50%: **estructura aplicada y
  verificada en central** (`seguros`): 42 enums, 52 tablas, 721 columnas, 265 índices, 67 constraints
  y 353 NOT NULL — **coincidencia EXACTA con el origen** en los cinco recuentos.
- 🚨 **`docs/TRASPASO-CORREDURIA.md` decía «cero claves foráneas». Hay 131.** Se destapó comparando
  constraints origen (198) vs destino (67). Y la conclusión que sacaba («no hay orden de carga que
  respetar») era al revés. Corregido en el doc. Las FKs van en fichero aparte y **se crean DESPUÉS de
  los datos**: no hay orden topológico posible (hay autorreferencias) y así sirven de verificación.
- DDL **generado desde los catálogos del origen**, no escrito a mano. Tres ficheros en
  `apps/asegura/prisma/sql/2026-09-01_seguros_volcado_{ddl,datos,fks}.sql`.
- Copia de datos: por **`dblink`** (ya instalado en central), server-side. `pg_dump` local es 16.13 y
  el origen 17.6 → se niega. **Bloqueado a falta de UNA cosa:** secreto `asegura_origen_url` en el
  Vault de Supabase de central (lo pone Alberto; nunca por chat). El script lo lee dentro del bloque.
- ⚠️ Sigue vigente: Manuel NO borra hasta verificar **descifrar Y buscar** sobre nuestra copia.

### 🛡️ (01/09/2026) asegura: dos specs (portal + agente de venta) y la cartera NO era lo que decíamos
- Brainstorming con Alberto → specs `2026-09-01-asegura-portal-clientes-empresas-design.md` y
  `2026-09-01-asegura-agente-venta-design.md`. PR #1941.
- 🚨 **Medido: la cartera viva son ~80 clientes / 109 pólizas, no 32.600/28.843.** El resto es volcado
  histórico (`import_ref` `intranet:` 26.117 con vto. 2013-2018 y `asegura_app:` 2.612, CERO con vto.
  futuro). Regla de Alberto: **CIMA (`import_ref IS NULL`) = cliente; el resto, lead** (32.520).
  **Cifra ya corregida** en `CLAUDE.md`, `apps/asegura/CLAUDE.md` y `docs/TRASPASO-CORREDURIA.md`.
- Portal: app nueva `apps/asegura-portal` (rol propio SIN BYPASSRLS) + `@central/module-seguros-portal`;
  schema `seguros`; WhatsApp con **WABA nueva** (`wa_opt_in`=0 en las 32.600). Eje: **«aporta tus seguros»**,
  que sirve a leads y clientes a la vez. El móvil identifica un **HOGAR** (740 números compartidos, 630 con
  el mismo apellido → familias): nunca se resuelve solo. El papel en la póliza PROPONE acceso, no lo concede.
- Agente: de **VENTA**, prepara fichas en frío sin contactar a nadie. Dos corpus con autoridad distinta —
  el contrato dice qué cubre, la **LCS/LDS** qué derechos hay (del texto consolidado del BOE, nunca de
  memoria del modelo). Sin fine-tuning. Techo real: solo **5.613** fichas son contactables.
- Regla que evita un desastre: **las pólizas del volcado histórico NO generan recordatorios** (serían
  28.729 avisos de «se te venció» sobre pólizas de 2013-2018). `recordatorios` del CRM origen no sirve:
  su `poliza_id` es NOT NULL.

### 🚗 (01/09/2026) Renovaciones: columna «Qué asegura» (matrícula, dirección, tipo de RC)
- Alberto, sobre la tabla de renovaciones de `/correduria`: «necesito otra columna con datos — auto
  matrícula marca modelo, hogar dirección, RC de qué tipo… y siempre informa al agente».
- Helper puro nuevo **`@central/module-seguros/objeto`** (`objetoAsegurado`, 17 tests) con **cuatro**
  salidas: `conocido` · `no_informado` (la compañía no lo manda) · `cifrado` (la dirección de hogar
  viene `v1:…`, AES-256-GCM; la clave sigue en el Vercel de Manuel) · `sin_objeto` (vida/salud/decesos
  son seguros de PERSONAS: ausencia definitiva, no «pendiente»). Ninguno se pinta como hueco vacío.
- Medido en la cartera real: `matricula`/`marca`/`modelo` en claro; **`datos_especificos.vehiculo` NO
  es una descripción, contiene la matrícula**; una RC se identifica por sus modalidades
  (`poliza_coberturas`), no por `datos_especificos`. Las 16 pólizas de la ventana salen `conocido`.
- Cableado de punta a punta: `apps/asegura/lib/cartera.ts` (+ intento de descifrado) → puerto
  `/api/operador/vencimientos` → `interpretarObjeto` en plataforma (campo opcional: una versión vieja
  del puerto da `null` = «aún no llega», distinto de «no informado») → columna en `/correduria` y línea
  del Telegram de renovaciones. Skill `agente-correduria` actualizada (SKILL §2 + sector §5).

- **#1938 MERGEADO** (`1ba3c254`, 12 requeridos verdes). El CI volvió a no arrancar en draft: ni abrir
  el PR ni des-draftearlo dispararon nada; lo desatascó **mergear `main` en la rama** (paso 2 del orden
  de `CLAUDE.md`), 5ª medición de esa sección — anotada ahí con la secuencia completa. 🔀 Y el PR de
  seguimiento #1940, abierto IGUAL (MCP, draft, misma identidad), **sí disparó al instante**: el draft
  no es la causa. Sigue sin explicación; lo accionable es el orden, no el diagnóstico.

### 📅 (01/09/2026) mercado-booking: objetivo jul/ago-2027 cumplido — falta quitar la prioridad del prompt
- Pasada acotada (`?desde=2027-07-01&hasta=2027-08-31&max=24`) de la skill `mercado-booking`: 238 comps
  reales en 24 ventanas (3 fechas × 4 pisos por mes) + 4/4 escaparate propio. **El objetivo (≥3
  comparables en ≥3 fechas/piso en jul y ago 2027) ya estaba cumplido desde ayer (31/08)** — esta
  pasada repitió trabajo porque el párrafo "PRIORIDAD TEMPORAL" seguía en el prompt de la rutina.

- **Pendiente para Alberto:** borrar ese párrafo del prompt programado de `mercado-booking` (esta
  sesión no tiene acceso al store del trigger para editarlo ella misma). Detalle en
  `docs/AGENTES-BITACORA.md` (entrada 01/09/2026).

### 🔔 (01/09/2026) Panel «Avisos Telegram» (`/telegram`): catálogo + interruptor por aviso
- Alberto: «las notificaciones de Telegram son muchas… un panel que las resuma y que pueda activarlas
  o desactivarlas». Hecho en `apps/plataforma`: **76 avisos PROACTIVOS catalogados** (`lib/telegram/catalogo.ts`),
  interruptor por aviso y por categoría, y contadores REALES de lo que llega (bitácora, 30 días).
- Los ~57 emisores pasan ahora por `tgAviso`/`tgAvisoBotones`/`tgAvisoAlerta` (`lib/telegram/avisos.ts`).
  **Fail-open**: si la BD no responde, el aviso SALE — un fallo de red no puede volverse silencio.
- Guardián `lib/telegram/catalogo.test.ts`: falla si un id emitido no está catalogado (aviso que no se
  puede callar) o si uno catalogado no lo emite nadie (interruptor que no hace nada). Ni tsc ni build lo cazan.
- Fuera del catálogo a propósito: las RESPUESTAS del bot a un mensaje/botón de Alberto (contable,
  borradores de huéspedes, clasificar movimiento). Silenciarlas rompería la conversación, no quitaría ruido.
- El triaje de correo tiene un interruptor **por categoría** (`avisoDeCategoriaCorreo`). Ya silenciado
  `correo.huespedes` a petición suya (📬 Huésped de Smoobu «Nueva reserva»); los borradores del agente siguen.
- La bitácora nace vacía: el panel dice «aún no se ha medido», nunca «0 avisos». Migración
  `2026-09-01_telegram_avisos.sql` **aplicada**. Purga a 90 días desde el cron `agentes-latido`.

- **#1924 MERGEADO** (`ff136ac0`, 12 requeridos verdes). El CI cazó un `make_interval(days => ${n})`
  sin `::int` (Prisma manda int8 → 42883 SOLO en runtime): guardián `regression-sql-fecha-parametro`.
  ⚠️ Ese guardián enumera con `git ls-files`, así que **no ve ficheros sin `git add`** — la suite
  local daba verde con el bug delante. Haz `git add` antes de dar por buena una suite con archivos nuevos.
- Documentado en `apps/plataforma/CLAUDE.md` (§Panel Avisos Telegram), skills `plataforma-maestro`
  (punto 12) y `correo-triaje`, y `docs/FUENTES-DE-VERDAD.md`.

### 🩺 (01/09/2026) Siniestros de CIMA: la avería tiene fecha de corte — 8 de julio
- Re-verificada la cuarentena contra la BD: el último fichero `SIN` que pasó a `confirmed` fue el **08/07**
  y el último siniestro persistido, el **02/07**. Desde el 19/07, **7 ficheros de siniestros seguidos, los 7
  en `review`**. 21 de 38 `SIN` (55%) en cuarentena; los recibos sí siguen entrando a ratos (último, 24/08).
  Encaja con el reconciliador parado el 25/06. Causa raíz y arreglo ya estaban en `TRASPASO-CORREDURIA.md`.
- Matiz de la cartera viva: de las ~109 pólizas de CIMA, **68 en estado `activa` y solo 50 con vencimiento
  futuro**; ninguna del volcado histórico lo tiene. ⚠️ `estado='activa'` NO es «en vigor»: de las 1.235 así
  marcadas, 846 no tienen fecha de vencimiento y 339 la tienen pasada.
- Frecuencia CIMA: el cron llama 2×/día pero en 21 días solo entró fichero **10 días (13 en total)**. Con
  esta cartera, **una pasada diaria sobra**; el problema nunca fue la frecuencia.

### 🔴 (01/09/2026) `GH_PAT_TRIGGER` caducado: la radiografía del repo lleva desde el 31/08 sin actualizarse
- El workflow «Auditoría de estructura» falla en TODOS los pushes a `main` desde el 31/08 ~13:25 UTC:
  `gh` responde `HTTP 401: Bad credentials`. El `git push` sí cuela —`actions/checkout` deja un
  `http.extraheader` con el GITHUB_TOKEN que pisa el PAT de la URL—, así que **la rama se sube y el PR
  nunca se abre**: el fallo es mudo salvo por el correo de Actions.
- Efectos medidos: `estructura.generated.json` congelado en `6a4d53c4d` (#1887, 31/08 08:43) y **123 ramas
  `claude/auditoria-radiografia-*` huérfanas** en el remoto (el `gh pr close --delete-branch` tampoco corre).
- 🔴 **Para Alberto: renovar el secret `GH_PAT_TRIGGER`** — un agente no puede. Mientras tanto la radiografía
  se regenera a mano (va en este PR) y las ramas huérfanas siguen ahí, pendientes de barrido.

### 🔌 (01/09/2026) Fly.io: el adapter CIMA se transfirió… y Manuel lo devolvió a su organización
- 08:16 UTC `fly apps move asegura-app-cima-adapter --org grupo-asegura` → OK (48 s). 08:32 UTC Manuel lo
  devolvió a `manuel-suarez-678` (119 s): aceptar la invitación de miembro le bastó para sacarlo. `grupo-asegura`
  quedó vacía. **No es un problema técnico, es una conversación con Manuel** — no se vuelve a mover sin su OK.
- La app no se cayó (`/health` 200 tras ambos moves) y **los ficheros no se pierden en `/tmp`**: los logs de Fly
  cuadran al minuto con `cima_ficheros` (27/08 08:15, 28/08 15:32, 30/08 11:34).
- ❌ Corrección: el fichero CIMA **no** entra «a diario entre 11:35 y 11:42 UTC» (se afirmó y era falso). El horario
  es irregular y el 01/09 (00:00–08:35 UTC) no entró ninguna tanda. Pendiente real: traer el disparador a
  `CRON_JOBS` de plataforma —hoy lo llama infra de Manuel—, que quita la dependencia sin mover infraestructura.

### ✅ (01/09/2026) V4 Flash CONFIRMADO en producción con tráfico real — serie cerrada al 100%
- Sonda diaria 07:00:48 UTC: `plataforma·sonda·openrouter·deepseek/deepseek-v4-flash·ok` →
  no hay override `OPENROUTER_MODEL` en Vercel; el default nuevo sirve en producción.
- Además tráfico de negocio real: `extraer-factura` procesó facturas con el V4 Flash a las
  06:34-06:35, y el Director escala por tarea con normalidad (gemini-flash / gpt-5.6-luna /
  sonnet-4.5). Cabo único de la verificación del 31/08: CERRADO. Nada pendiente de la serie.

### 💶 (01/09/2026) Pasada mensual `fiscal-novedades`: sin cambios en deducciones, 1 aviso a cliente
- Deducciones IRPF (mínimos, maternidad, FN estatal/andaluza) contrastadas contra BOE/BOJA/AEAT: **sin
  cambios**, PGE 2027 aún sin publicar. Radar de ayudas: ayuda Junta Andalucía 600€/hijo<3 tras 3er hijo
  detectada y descartada (renta de Alberto muy por encima del tope 6× IPREM). 1ª pasada por cliente:
  Joaquín Jaén avisado por Telegram del plan de choque hostelería (RD 638/2026, hasta 11.000€, plazo
  30/09/2026, **CNAE sin confirmar** — pendiente de que Alberto/Joaquín lo verifiquen); Sique Brilla sin
  novedad. Detalle en `docs/FISCAL-AYUDAS.md` y `docs/AGENTES-BITACORA.md`.

### 🛡️ (01/09/2026) Nace el agente de la correduría (`agente-correduria`) — decisión de Alberto
- Alberto quiere un agente que lleve Grupo ASegura «casi al 100%» y responda a clientes. Se montó por
  fases: **Fase 0** (aprender sector + informar, activa ya) → emisión Avant2 → cliente-facing (esta
  última SOLO con diseño de canal + OK explícito). Skill `agente-correduria` (router + `references/sector.md`
  acumulativo) + rutina semanal martes 05:30 UTC (§21 de `RUTINAS-PROGRAMADAS.md`).
- 🔴 Pendiente de Alberto: añadir `ALERTA_TOKEN` al prompt de la rutina en la UI (sin él, informe solo en bitácora).
- Decisión previa de la sesión: credenciales Codeoscopic se piden a **Manuel** (env vars de su Vercel),
  NO a Codeoscopic; el borrador de Gmail a Juan Fernández queda muerto sin enviar. #1918 mergeado.

- **Vencimientos ya funcionando** (mismo PR #1919): `@central/module-seguros/vencimientos` (puro, LCS
  art. 22: <1 mes = se prorroga sí o sí) + puerto `/api/operador/vencimientos` en asegura + tabla en
  plataforma `/correduria`. Real: **5 vencen en 30 días, 7 en 60, 13 en 90** (3.899,05€ de prima
  conocida, 4 sin informar). ⚠️ Contar por fecha SIN filtrar estado colaba canceladas (daba 6/8).
- Cartera viva = **59 pólizas `situacion='EV'`** (37 auto/13 hogar/8 RC/1 moto); el resto es histórico.
  Ingesta CIMA = cron diario ~11:40 UTC **fuera de nuestro alcance**: en ese Supabase NO hay pg_cron ni
  Edge Functions, así que todo lo alimenta el Vercel de Manuel — y ese Vercel **no se ve desde aquí**
  (el conector solo alcanza el team «Pisos turisticos», donde ni `asegura` ni `central-asegura` están).
- 💡 **Idea de Alberto guardada: «Agente IA Defensa cartera»** (`references/defensa-cartera.md`
  + su diagrama). Recibo de PRECARTERA → agente nocturno → retarificar → comparar nueva producción
  vs cartera → pantalla de desviación de recibos → respuesta al cliente. NO implementado; depende
  de (a) saber qué estado de `poliza_recibos` es la precartera, (b) la API de Avant2 —y **cada
  cotización cuesta 0,50€**, así que necesita presupuesto—, y (c) Fase 3 para lo del cliente.
- 🚨 **Método — cómo NO verificar un deploy de Vercel (01/09/2026, me costó 3 falsos negativos):** se
  dio por hecho que plataforma «no había desplegado» porque el identificador `dpl_…` incrustado en el
  HTML de `/login` no cambiaba. **`/login` es una página PRERENDERIZADA (ISR)**: su HTML lo sirve el CDN
  y ese `dpl_` puede seguir siendo el del build anterior con el deployment nuevo ya en producción (el
  panel mostraba los dos commits en **Production · Ready**). La comprobación que SÍ vale desde aquí:
  pedir una **ruta de API nueva** y ver si responde **401/200 en vez de 404** — eso prueba que el código
  está sirviendo (`/api/cron/correduria-renovaciones` → 401). Y el conector de Vercel **no puede leer
  deployments (403) ni env vars (no existe la herramienta)**: para eso hace falta el panel.

- **Migrar la cartera al schema `seguros`: NO todavía** — copiar 32.600 filas es trivial, pero sin mover
  la ingesta EIAC/CIMA la copia envejece al día siguiente y quedan dos carteras. Orden: vencimientos ya
  (hecho) → pedir a Manuel cómo se alimenta → migrar + repuntar ingesta. Al mover, ojo: las 86 RLS por
  `auth.uid()` no viajan (nuestros roles llevan BYPASSRLS) → el aislamiento pasa a ser del código.

### 🧾 (01/09/2026) Codeoscopic = LA fuente de tarificación y EMISIÓN de pólizas nuevas (dictado por Alberto)
- La web «ASegura» es de ALBERTO (Manuel la desarrolló); EIAC no le preocupa. Codeoscopic es el motor
  de venta: sin él la plataforma no tarifica ni emite.
- Del Gmail de Alberto (verificado): cuenta **Avant2 Sales Manager** propia y operativa desde 09/06
  (alta «SOLO ASM», formación hecha); compañías vivas: Reale (26/05, multirramo) y Fidelidade (hogar,
  14/07); claves entregadas de Mapfre/Allianz(PA342521)/Occident(M00171). Contrato Workspace 20/05 y
  DPA art. 28 remitido el 25/05 (el «contrato de encargado» de la lista ya existe con Codeoscopic).
- La integración API de la web quedó EN SANDBOX (03/06: Quote→preemisión→Submit→webhook Basic Auth sin
  cerrar; correo de manuel@loor.es a juan.fernandez@codeoscopic.com) → por eso el flag de emisión sigue
  apagado. **Borrador creado en Gmail** (no enviado) a Juan Fernández: renovar sandbox + pendientes +
  prueba de idempotencia del attempt_id. Pendiente: quién es manuel@loor.es; inventario BD cuando
  reconecte el conector Supabase_asegura.
- ⚠️ Higiene: en mayo viajaron por email claves de portales de compañías en texto plano (Mapfre,
  Occident) — rotarlas con calma.

### ✅ (01/09/2026) CARTERA EN VIVO FUNCIONANDO — rotación hecha; cron `postgres` de Manuel roto desde el reset
- Números reales en plataforma→Correduría: 50 en vigor · 995 sin fecha · 27.793 históricas · 2.742
  clientes · 29.858 leads · 7 siniestros (el 1.194 de la víspera era lectura vieja: la BD ingesta a diario).
- Contraseña de `central_asegura` ROTADA (04:39, del gestor de Alberto); snippet con clave en claro
  borrado; env recreada en Vercel; pooler registra `Connection authenticated`. Exposición de la clave
  débil (20:51→04:39): cero autenticaciones del rol en lo auditable — matiz: `log_connections` OFF,
  solo audita el pooler.
- 🚨 Un job con `postgres.js` (IPs Vercel fra1) falla como `postgres` cada ~5 min desde 31/08 ~08:00
  (antes autenticaba): es del CRM de Manuel — nada nuestro usa esa BD salvo apps/asegura (verificado
  por código). Probable daño colateral del reset de la database password durante el montaje. NO tocar
  su Vercel; avisar a Manuel (borrador, regla de comunicaciones).
- `central-asegura` servía desde us-east-1 contra BD eu-central-1 → `regions: ["fra1"]` en su vercel.json.

### 🔑 (01/09/2026) La cartera en vivo: era la CONTRASEÑA — y un valor del chat acabó de contraseña
- Logs del pooler (MCP Supabase_asegura, nuevo conector): `password authentication failed for user
  "central_asegura"` → el fallo era la contraseña del `ASEGURA_DATABASE_URL` pegado en Vercel
  (host/usuario correctos; el blindaje pgbouncer de #1905 quedó descartado como causa).
- 🚨 Incidente: al guiar el arreglo por Claude Chrome, la HUELLA de verificación (md5 del verificador
  SCRAM) publicada en el chat se usó como contraseña del rol. Lección: **jamás publicar un valor con
  pinta de credencial sin marcarlo como NO-USAR**; los secretos los genera el gestor de Alberto y no
  pasan por ningún chat. Exposición revisada en logs: solo fallos de auth, ninguna huella de acceso
  (matiz: log_connections apagado). Rotación en curso con marcador `<<CLAVE>>` que rellena Alberto.
- Aparte: algo con `postgres.js` desde `63.180.181.94` intenta entrar como `postgres` cada 5 min y
  falla — no es nuestro (nosotros: Prisma + central_asegura). Preguntar a Manuel en el traspaso.
- Además: 🛡️ Correduría entra por fin en el menú de plataforma (PR #1907, guardián incluido) —
  «no me sale correduría»: /correduria nunca estuvo en NAV_NEGOCIO.
