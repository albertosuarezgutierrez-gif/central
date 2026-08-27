# 🛡️ Traspaso del CRM de correduría (Manuel Suárez) → `central`

> **Estado: PLAN TÉCNICO CERRADO POR AMBAS PARTES (26/08/2026). Ejecución EN MARCHA, paso a paso.**
> 🔁 **No hay cita:** Alberto le pide a Manuel **una cosa cada vez** y él responde cuando puede. Ver
> «CAMBIO DE MODO», abajo — manda sobre el guion de la ventana 13:00–15:00, que queda de alternativa.
> ⚪ **Y NO hay ningún paso con reloj** (corregido por Alberto el 26/08): el CRM aún no está operativo
> y **los ficheros de EIAC se piden cuando se quiera**, así que una pausa del cron no deja sin servicio
> a nadie ni pierde datos. Lo único irreversible siguen siendo **las claves y los secrets de TIREA**.
> Paso 1 en curso: las copias de seguridad.
> 🔑 Y son **DOS claves**, no una: la de cifrado (si se pierde, los IBANs quedan ilegibles — falla
> ruidoso) y la del **índice ciego** (si cambia, los clientes **dejan de encontrarse** aunque estén
> ahí — **falla en silencio**, y una búsqueda vacía se lee como «no existe»). Se respaldan las dos y
> se verifican con **dos** pruebas: descifrar Y buscar. Ver «CIERRE TÉCNICO», abajo.
>
> **Estado previo: el traspaso son 5 sistemas, no 3.**
> A los tres conocidos (Vercel, Supabase, GitHub) se suman **Fly.io** (el adaptador Java que habla con
> TIREA: sin él NO entra ninguna póliza de las compañías) y el **`CRON_SECRET` de GitHub Actions**, que
> **no viaja al transferir el repo** y cuya pérdida corta CIMA **en silencio**. Y hay un punto
> irreversible: **la clave de cifrado de datos personales** — si se pierde, los IBANs quedan ilegibles
> para siempre. Ver «RESPUESTA DE MANUEL» y el runbook del corte, abajo: mandan sobre el resto del doc.
>
> **Estado anterior: FASE 1 COMPLETADA (26/08/2026).** Manuel dio acceso a su Supabase y el inventario está
> hecho y medido — ver «FASE 1 CERRADA» abajo. Faltan el **código** (repo, bloqueado) y el **Vercel**
> (sin invitación). **Nada se ha migrado todavía**, y antes de migrar hay que firmar el contrato de
> encargado de tratamiento: son 32.600 clientes reales.
> Ningún dato se ha migrado todavía. Lo hecho en `central`: los cimientos de BD (ver «Hecho ya») y,
> desde el **26/08/2026, el ESQUELETO de `apps/asegura`** — auth propia, layout, manifiestos, gate de
> build y `lib/estado-migracion.ts`. Se montó a propósito **antes** de la respuesta de Manuel: el día
> del corte solo habrá que verter el modelo y las pantallas. Ver `apps/asegura/CLAUDE.md`. Este documento es el runbook del traspaso y **la ÚNICA fuente de verdad** mientras dure.
> Cuando el traspaso se cierre, esto se sustituye por `apps/asegura/CLAUDE.md` y una entrada en
> `docs/CONTEXTO-SESIONES.md`.
>
> 🔗 **Documento único (20/08/2026).** Hasta hoy había **dos planes en paralelo** para lo mismo, escritos
> por dos sesiones distintas que no se vieron: este (`docs/TRASPASO-CORREDURIA.md`, vertical `apps/seguros`)
> y `docs/ASEGURA-MIGRACION.md` (vertical `apps/asegura`). Se han **fundido en este**, que absorbe todo lo
> que el otro tenía y el otro se ha borrado. Si encuentras una referencia suelta a `apps/seguros`, es de
> antes de la fusión: el nombre bueno es **`apps/asegura`**.

## 📍 Estado de los tres accesos (comprobado el 26/08/2026, no supuesto)

| Acceso | Estado real | Qué falta |
|---|---|---|
| **Supabase** | ✅ **RESUELTO.** Manuel invitó a Alberto a su organización (`qdrmgpvqhcmhmpcrvtan`) el 26/08/2026 y el conector **lee el proyecto `uijsgeocgdaxkhvwtjqs` sin problema**. La Fase 1 está hecha | ✅ Nada. ~~Reconectar el conector marcando la organización~~ — **era innecesario**: `list_projects` no enumera proyectos de otras organizaciones, pero el acceso por `project_id` funciona igual |
| **GitHub** | ⚠️ Invitación del **12/08/2026** a `manuelsuarez/asegura`, sin confirmar que esté aceptada | 🔴 **Claude no puede leer ese repo desde esta sesión, pase lo que pase**: `add_repo` → *cross-tier adds are not supported* (esta sesión ya tiene fuentes de `albertosuarezgutierrez-gif`). Haría falta una sesión NUEVA con `manuelsuarez/asegura` como fuente inicial, y eso exige que la app de Claude esté instalada en la cuenta de Manuel. Mientras tanto, el rodeo sigue siendo `docs/ASEGURA-PROMPT-CHROME.md` (Claude Chrome) o un ZIP del árbol de trabajo |
| **Vercel** | 🔴 Sin invitación: `list_teams` solo devuelve `pisos-turisticos-projects` | Pedírsela a Manuel (o, si su cuenta es Hobby, la lista de **nombres** de variables por aquí y los **valores** por gestor de contraseñas) |

> **Regla de esta tabla:** «no lo veo» ≠ «no existe». Que un proyecto no salga en `list_projects` no
> dice nada del CRM de Manuel; dice que este conector todavía no tiene permiso para mirarlo.

**Nada se ha copiado todavía.** La Fase 1 (inventario y medición) no puede empezar hasta que el
proyecto de `LOOR` sea visible desde el conector.

## ✅ FASE 1 CERRADA — inventario real del Supabase de Manuel (26/08/2026)

> **Cómo se entró, y la corrección que importa:** el conector de Supabase de Claude **sí puede leer el
> proyecto de Manuel**, por referencia directa. Lo que NO hace es *enumerarlo*: `list_projects` solo
> lista los proyectos de la organización propia, y de ahí salió la conclusión equivocada de que hacía
> falta reautorizar el OAuth por organización. **No hacía falta nada: solo el `project_id`.**
> Lección de método: *«no aparece en el listado» ≠ «no tengo acceso»* — antes de pedirle a nadie que
> toque permisos, prueba el acceso directo.

**Proyecto: `uijsgeocgdaxkhvwtjqs`** · `ASEGURA-prod-eu` · AWS `eu-central-1` · Postgres 17.6 ·
compute NANO · plan free · `ACTIVE_HEALTHY` · creado el 20/04/2026 · organización
`qdrmgpvqhcmhmpcrvtan` (el panel la muestra como `PISO`, el correo de invitación la llamaba `LOOR`).

### 🚨 Esto NO es un prototipo: es una correduría con cartera real

| Tabla | Filas | Tabla | Filas |
|---|---:|---|---:|
| `clientes` | **32.600** | `bienes_asegurables` | 1.614 |
| `polizas` | **28.843** | `poliza_coberturas` | 1.425 |
| `cliente_telefonos` | 4.794 | `gestiones` | 694 |
| `cliente_emails` | 4.017 | `poliza_intervinientes` | 504 |
| `oportunidades` | 3.676 | `poliza_recibos` | 186 |
| `operational_events` | 3.518 | `cima_ficheros` | 125 |
| `cliente_carnets_conducir` | **2.189** | `siniestros` | 69 |
| `cliente_relaciones` | 1.710 | `usuarios` | 17 |

**52 tablas en `public`.** Y con eso, el punto 6 del mensaje a Manuel deja de ser papeleo: hay
**32.600 clientes reales** con teléfonos, correos, **carnets de conducir** y relaciones familiares.
El **contrato de encargado de tratamiento (`docs/CONTRATO-ENCARGADO-TRATAMIENTO-MANUEL.md`) pasa a ser
lo más urgente del traspaso**, por delante de cualquier decisión técnica.

### Veredicto free vs. Pro: **FREE**, y ahora medido

- BD total del proyecto: **92 MB** (el panel dice 112 MB: incluye WAL y overhead).
- Las dos tablas gordas son `clientes` (38 MB) y `polizas` (22 MB); el resto no llega a 3 MB cada una.
- El schema `public` a trasladar ronda los **~75 MB**. Sobre los ~180 MB que ocupa `central` hoy,
  quedaría en **~255 MB de 500 MB**. Cabe holgado. **La estimación de ~200 MB era casi triple de la real.**
- Egress 36 MB de 5 GB. No hay presión por ningún lado.

### Lo que NO hay (y por tanto no hay que migrar)

| | |
|---|---|
| **Edge Functions** | **Ninguna** |
| **Buckets de Storage** | **0**, y **0 objetos** |
| **`pg_cron`** | **No instalada** → cero tareas programadas en la BD |
| **Triggers** | **0** |
| **Vistas / vistas materializadas** | **0 / 0** |
| **Secuencias** | **0** (todo son UUID, no hay contadores que resincronizar) |
| **Secretos en Vault** | **0** |

Extensiones realmente instaladas: `pgcrypto`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements`,
`plpgsql` y **`vector` 0.8.0 (pgvector) en `public`** — esta última la usa `whatsapp_kb_chunks`, así
que **hay que asegurarse de que `vector` está disponible en `central` antes de restaurar**.

### 🚩 Los tres asuntos que decide Alberto, no la sesión

1. **RLS: 86 políticas, y RLS activo en las 52 tablas.** El aislamiento multi-tenant del CRM
   (`correduria_id`) vive **en las políticas RLS**, no en el código. Pero `prisma_seguros` se creó con
   **`BYPASSRLS`** (como el resto de roles de la casa) → **al conectar la app, las 86 políticas dejan de
   aplicarse y nadie se entera: no falla, simplemente deja de aislar.** Es el patrón de fallo silencioso
   que más caro sale. Hay dos salidas y hay que elegir a conciencia: (a) `prisma_seguros` **sin**
   BYPASSRLS y se conservan las políticas, o (b) con BYPASSRLS y el aislamiento pasa al código de la app.
   Hoy la correduría es un solo tenant (`corredurias` = 1 fila), así que el riesgo es bajo *ahora* —
   pero la decisión se toma antes de restaurar, no después.
2. **Autenticación: `auth.users` = 9 usuarios, los 9 han entrado alguna vez.** Con nueve, la bifurcación
   se resuelve sola: **re-plataformar al patrón de la casa** (tabla propia + cookie + `jose`, como
   `apps/mariscos`) sale más barato que migrar `auth.users`. ⚠️ Ojo al descuadre: `public.usuarios`
   tiene **17** filas frente a 9 en `auth.users` — hay 8 usuarios lógicos sin cuenta de acceso, o
   bajas. Mirarlo antes de dar la lista por buena.
3. **Cero claves foráneas en 52 tablas.** La integridad referencial está en el código, no en la BD.
   Para el volcado es buena noticia (no hay orden de carga que respetar); como herencia, es deuda que
   conviene conocer antes de construir encima. **132 funciones en `public`** sí viajan en el dump, pero
   hay que revisarlas: si alguna usa `auth.uid()`, depende del Supabase Auth que estamos quitando.

### Lo que sigue sin saberse

- **Dónde viven los documentos.** Storage está vacío, pero existen `bien_documentos`,
  `poliza_documentos`, `solicitud_cambio_documentos` (4 filas) y `cima_ficheros` (125). Esta última
  guarda **metadatos** (`nombre_fichero`, `xml_hash`, `zip_entry_count`), no el binario. Así que
  «0 buckets» significa **«los ficheros no están en Supabase»**, no «no hay ficheros»: hay que
  averiguar a dónde apuntan antes de apagar nada de Manuel.
- **Los crons y las integraciones**, que viven en su Vercel (el comentario de una tabla menciona un
  «vencimientos-detector»). Sigue haciendo falta la invitación a Vercel, o al menos los nombres de las
  variables de entorno.
- **El código**: sigue bloqueado (`add_repo` cross-tier). Vía Chrome o ZIP.

### Rastro de su forma de trabajar (útil para leer el código)

Los comentarios de tabla citan tickets **`LOO-xxx`** (Linear) y normas españolas por su nombre:
`lds_consent` referencia la **Ley de Distribución de Seguros art. 19** y el **RDLeg 6/2004 art. 173**;
`cotizaciones_anonimas` describe un «flipped funnel» con TTL de 7 días. Hay integración con **CIMA/EIAC**
(el estándar de intercambio con aseguradoras), con **Codeoscopic** (7 tablas `codeoscopic_*`) y un canal
de **WhatsApp** con base de conocimiento vectorial. No es un CRM genérico: es software de correduría.

---

## 📬 RESPUESTA DE MANUEL (26/08/2026) — el traspaso no son 3 sistemas, son 5

Contestó a las cuatro preguntas. **Lo que da por escrito cambia el plan de arriba**, así que esta
sección manda sobre todo lo anterior en lo que se contradiga.

### 1. Cómo entra CIMA de verdad: una cadena de TRES saltos, no una descarga

No es SFTP ni portal. La cadena real, y cada eslabón puede romperla:

```
GitHub Actions (cron 5:30 y 11:30)
   └─ HTTPS + Bearer CRON_SECRET
      └─ app.grupoasegura.com/api/crons/cima-pull        (Vercel, Next.js)
         └─ asegura-app-cima-adapter.fly.dev             (Fly.io, Java/Spring Boot)
            └─ JAR oficial de TIREA · WSE v2.17 (SOAP)
               └─ TIREA  →  Mapfre C0058 · Allianz C0109 · Generali C0072
                            Occident C0468 · Reale C0613
```

**Las credenciales de TIREA viven como secrets de Fly.io** — no en Vercel ni en la base. El usuario de
homologación era `albertosuarez.testws`: **la cuenta TIREA es de Alberto**, no de Manuel.

### 🚨 Los DOS sistemas que no estaban en ningún inventario

| # | Sistema | Por qué es bloqueante |
|---|---|---|
| **4** | **Fly.io** — app `asegura-app-cima-adapter` + su repo propio | Es quien habla con TIREA. **Sin él no entra ni una póliza de las compañías.** No es Next.js ni cabe en el monorepo: es Java. Se queda como servicio aparte |
| **5** | **`CRON_SECRET`** en los secrets de **GitHub Actions** | **Los secrets NO viajan cuando cambia el dueño del repo.** Si no se vuelve a poner, el cron dispara y el endpoint responde 401: CIMA deja de traer datos **en silencio** |

El 5 es el más traicionero de todo el traspaso: no rompe nada visible. La web sigue en pie, la app
responde, nadie ve un error — simplemente dejan de entrar pólizas, recibos y siniestros. Y como la
única señal es «hoy no ha llegado nada», se puede tardar días en notarlo.

### 2, 3 y 4 — lo demás que preguntamos

- **Vercel: UN solo proyecto** (`asegura`). Web, intranet, portal de cliente y login son **la misma app
  Next.js** bajo `app.grupoasegura.com`. Cae la duda de «¿van juntas o separadas?».
- **Ficheros: Vercel Blob** (privado, URLs firmadas), **~4 ficheros**. La BD solo guarda la referencia.
  ⚠️ **El Blob va atado a la cuenta y puede NO viajar con el proyecto.** Con 4 ficheros da igual: se
  mueven a mano. Los **EIAC de CIMA no se guardan como archivo**, se parsean a tablas.
- **Dominios:** `grupoasegura.com` (el `app.` sirve toda la app) y `grupoasegura.es` (**solo para el
  correo `info@`**).
- **Codeoscopic:** confirmado, **nunca se emitió en producción**. Solo se probó cotizar (1 proyecto,
  15 precios). **El código de emisión existe pero está tras un flag que jamás se activó** — por eso las
  tablas están vacías. Coincide con lo que medimos: cero filas no probaba que no hubiera código.

---

## 🔴 Lo que hay que atar ANTES de fijar fecha (huecos de su plan, no objeciones)

Su secuencia (0-8) es correcta y el orden es sensato. Estos son los puntos donde, tal como está
escrita, el traspaso puede salir mal:

### 1. La clave de cifrado: es lo ÚNICO irreversible de todo el traspaso

Manuel avisa —bien— de que en las env vars hay una **clave de cifrado de datos personales**: si se
pierde o se rota, **los IBANs y demás datos cifrados quedan ilegibles para siempre**. Pero su paso Cero
dice «export de **la lista** de env vars».

🚨 **Una LISTA DE NOMBRES no restaura una clave.** Si la transferencia no arrastra ese valor, el backup
de nombres no sirve de nada y la cartera queda con campos muertos. Antes de tocar Vercel:

1. **El VALOR de esa clave, copiado a un gestor de contraseñas** (no a un fichero del repo, no a un
   mensaje). Es el único backup que importa.
2. Tras la transferencia, **verificación FUNCIONAL, no visual**: descifrar un registro conocido y
   comprobar que sale el dato correcto. «La variable aparece en el panel» no demuestra que su valor
   sea el mismo.
3. **No rotar esa clave** ni antes ni durante el corte. Después, y con la cartera ya verificada.

### 2. Los crons de GitHub Actions no vuelven solos

Además del `CRON_SECRET` que él ya señala: **un repositorio transferido puede quedarse con Actions
deshabilitado y los `schedule:` no re-armados**. Por eso la verificación no es «he puesto el secret»,
sino **ver una ejecución real del cron entrando en su franja** (5:30 u 11:30) y contar filas nuevas.

### 3. Ojo con redesplegar el adaptador en vez de transferirlo

Manuel ofrece dos vías para Fly: transferir, o que Alberto redespliegue desde el repo con sus secrets
de TIREA. **La segunda tiene una trampa**: el usuario que él nombra (`albertosuarez.testws`) es de
**homologación**. Si los secrets vivos de Fly son de PRODUCCIÓN y se redespliega desde cero sin ellos,
el adaptador levanta pero **no descarga nada de las compañías**.

→ **Preferir la transferencia de la app de Fly.** Y antes de decidir, preguntar qué credenciales hay
realmente en esos secrets (homologación o producción) y si las de producción están en manos de Alberto.

### 4. La franja horaria del corte sale sola de los crons

El cron corre a **5:30 y 11:30**. El corte se hace **fuera de esas franjas y justo DESPUÉS de un pull
correcto** — así, si algo se tuerce, hay medio día de margen antes de la siguiente descarga y no se
pierde ningún fichero de las compañías.

### 5. `grupoasegura.es` es correo, y el correo se rompe distinto

Ese dominio **solo sirve `info@`**. Tocar su DNS puede tumbar los **registros MX** sin que nadie lo
vea hasta que un cliente escriba y el correo rebote. Se anota aparte de la app: **no se toca su MX**, y
si hay que moverlo, se copian los MX ANTES.

### 6. Discrepancia menor sobre la idempotencia de Codeoscopic

Manuel dice que «el envío a Codeoscopic no es idempotente». En su esquema aparecen `submit_attempt_id`
y `submit_in_flight_at`, que son justo las columnas de un envío idempotente. Puede que el diseño esté y
la implementación no. **Riesgo real hoy: ninguno** —nunca se emitió, y el flag está apagado—, pero
conviene aclararlo antes de encender ese flag algún día.

### 7. El backup previo lleva datos de 32.600 personas

Su paso Cero (dump de Supabase) es correcto y necesario. Ese dump **no se commitea jamás** ni se sube a
ningún sitio compartido: son datos personales reales. Vive en local durante la ventana del corte y se
borra después.

---

---

---

## ✅ CIERRE TÉCNICO con Manuel (26/08/2026) — todo confirmado, y aparece una SEGUNDA clave

Segunda respuesta de Manuel. Acepta los cuatro puntos y aporta tres datos que **cambian el runbook**.

### 🔑 No es una clave de cifrado: son DOS, y fallan de forma distinta

| Clave | Para qué | Qué pasa si se pierde |
|---|---|---|
| **Cifrado de valores** | IBAN, DNI y demás campos cifrados | Los datos quedan **ilegibles para siempre**. Falla RUIDOSO: se ve que algo está roto |
| **Índice ciego** (*blind index*) | Buscar un cliente por email o DNI **sin descifrar** | 🚨 Los datos siguen ahí y legibles, pero **dejan de encontrarse**. Falla **SILENCIOSO** |

**El índice ciego es el peligroso de los dos**, y no por lo que rompe sino por cómo lo rompe. Si esa
clave cambia, buscar un cliente por su DNI **no da error: devuelve vacío**. Y una pantalla que recibe
cero resultados dice «no existe ese cliente» — sobre uno de los 32.600 que está ahí, entero y
perfectamente legible. Es exactamente la regla **«dato que NO hay ≠ dato que NO se ha mirado»**, pero
metida en la capa de búsqueda, donde no hay `NULL` que delate nada.

Consecuencias operativas:

- **Se respaldan las DOS**, no solo la de cifrado. Manuel ya ha dicho que guarda el valor de ambas.
- **La verificación post-transferencia son DOS pruebas, no una:** (a) descifrar un registro real y
  ver el dato correcto, y (b) **buscar por email y por DNI un cliente conocido y que aparezca**.
  Solo la primera dejaría pasar el fallo silencioso.
- **Ninguna de las dos se rota durante el traspaso.** Y ojo a futuro: rotar el índice ciego obliga a
  **recalcular el índice de los 32.600 clientes**; mientras dure ese recálculo, las búsquedas mienten.

### 🟢 Fly: mejor noticia de lo que pensábamos — son credenciales de PRODUCCIÓN y son de Alberto

Manuel lo verificó y corrigió su dato anterior. El adaptador **no apunta a homologación**:

| Dato | Valor |
|---|---|
| `WSE_ENDPOINT` | `https://ws.cimaseg.es/wsEstandar/` (**producción**) |
| Usuario | `cima.albertocsf0170ws` |
| Plataforma | `ALBERTOSUAREZ_6393` |
| Clave de mediador | **CS-F/0170 — de Alberto** |

El `albertosuarez.testws` que citó antes era el de homologación. **Los secrets vivos de Fly son de
producción y la cuenta TIREA es de Alberto** → se confirma la decisión: **se transfiere la app tal cual,
no se redespliega**. (Las contraseñas siguen donde están, en los secrets de Fly; aquí solo van
identificadores.)

### 🟡 Codeoscopic: la idempotencia no está a medias, es que no llega hasta el final

Aclarado, y su explicación es correcta:
- `submit_in_flight_at` = **candado** contra dos envíos simultáneos.
- `submit_attempt_id` = **UUID propia** para poder reconciliar después.
- **Lo que falta es del lado de ELLOS:** Codeoscopic no deduplica por nuestro `attempt_id`, así que un
  reintento tras una respuesta perdida **puede crear un duplicado en su sistema**.

O sea: idempotente por dentro, **no de punta a punta**. Con el flag apagado no afecta a nada. **Antes de
encenderlo algún día**, la prueba concreta es: mandar el **mismo `attempt_id` dos veces** y ver si ellos
deduplican. Anotado como condición para activar la emisión, no como bug de hoy.

### Lo demás, cerrado y de acuerdo

`CRON_SECRET` se valida con una **ejecución real del cron**, no con el secret puesto · corte **fuera de
5:30/11:30 y tras un pull correcto** · **`grupoasegura.es` no se toca** (solo sirve `info@`, los MX
quietos) · el **dump se queda en local** y se borra tras la ventana · **emisión de Codeoscopic: nunca
probada en producción**.

**Solo queda fijar día y hora.** El plan técnico está cerrado por ambas partes.

### 🔧 Cambios que esto mete en el runbook

- **Paso 0a:** respaldar **las dos** claves (cifrado + índice ciego), no una.
- **Paso 2:** la verificación pasa a ser doble — **descifrar** un registro **y buscar** por email/DNI.
- **Paso 5:** Fly se **transfiere** (decidido, no opcional): sus secrets son de producción.
- **Nuevo, para el futuro:** no encender el flag de emisión de Codeoscopic sin probar antes el
  doble envío con el mismo `attempt_id`.

### 📝 Respuesta a Manuel — v6 (26/08/2026) — **ENVIADA y ya respondida. Histórico: la versión vigente es la v7**

Contesta a su mensaje del 26/08. **Confirma su secuencia** (es buena) y le añade lo que le falta:
el VALOR de la clave de cifrado (no la lista), verificar el cron con una ejecución real, transferir
Fly en vez de redesplegar, y qué credenciales de TIREA hay en sus secrets. **No se manda hasta que
Alberto dé el visto bueno a este envío concreto.**

> Manuel, perfecto, con esto ya sé lo que hay. Tu secuencia me vale tal cual, solo le añado cuatro
> cosas y te pido que dos de ellas las hagas antes de que toquemos nada.
>
> **1. La clave de cifrado: pásala a un gestor de contraseñas ANTES de mover el proyecto.**
> Dices de exportar «la lista» de env vars, y ahí está el problema: una lista de nombres no me
> devuelve la clave si la transferencia no arrastra su valor. Y si esa clave se pierde, los IBANs y
> lo demás cifrado no hay quien los recupere. Es lo único de todo el traspaso que no tiene marcha
> atrás, así que quiero el **valor** guardado antes de empezar, y no la rotamos ni tú ni yo hasta
> que la cartera esté verificada al otro lado.
> Y cuando el proyecto ya esté en mi equipo, en vez de mirar que la variable aparezca en el panel,
> **desciframos un registro de verdad** y comprobamos que sale bien. Que la variable exista no
> demuestra que su valor sea el mismo.
>
> **2. Del CRON_SECRET: buen apunte, y le añado una vuelta.** Además de volver a ponerlo, al
> transferir un repo **Actions se puede quedar deshabilitado y los `schedule:` sin re-armar**. Así
> que no doy por bueno «ya está el secret»: lo damos por bueno cuando **veamos una ejecución real
> del cron en su franja trayendo filas nuevas**. Si no, esto falla de la peor manera posible —sin
> error, sin caída, simplemente dejan de entrar pólizas y nos enteramos días después.
>
> **3. Fly: prefiero transferir la app, no redesplegarla.** El usuario que me pasas
> (`albertosuarez.testws`) es de homologación. Si en tus secrets de Fly están las credenciales de
> **producción** y yo redespliego desde cero sin ellas, el adaptador arranca y no descarga nada de
> las compañías: parece que funciona y no funciona. Dime **qué credenciales hay realmente ahí**
> (homologación o producción) y, si puede ser, méteme en tu org de Fly y lo transferimos.
>
> **4. La hora del corte sale sola de tus crons.** Como corren a 5:30 y 11:30, lo hacemos **fuera
> de esas franjas y justo después de un pull correcto**. Así, si algo se tuerce, tenemos medio día
> de margen antes de la siguiente descarga y no perdemos ningún fichero de las compañías.
>
> Tres cosas menores:
>
> - **`grupoasegura.es`**: como solo sirve el `info@`, ojo con tocarle el DNS — si se caen los **MX**
>   no lo ve nadie hasta que un cliente escriba y le rebote. Lo tratamos aparte de la app.
> - **El dump del paso Cero**: son datos de 32.600 personas, así que no lo subimos a ningún sitio
>   compartido; se queda en local durante la ventana y se borra después.
> - **Curiosidad, sin prisa:** dices que el envío a Codeoscopic no es idempotente, pero en el
>   esquema veo `submit_attempt_id` y `submit_in_flight_at`, que es justo lo que se pone para que lo
>   sea. ¿Se quedó a medias? Hoy da igual porque el flag está apagado, pero mejor saberlo antes de
>   encenderlo algún día.
>
> Lo de la emisión me queda claro, y me vale: cotizar probado, emitir no. Mejor saberlo ahora.
>
> Con esto por mi parte podemos fijar día y hora. Dime cuándo te viene bien y lo montamos.

## 🗺️ Runbook del corte (secuencia de Manuel + lo que falta)

| # | Quién | Paso | Verificación que lo cierra |
|---|---|---|---|
| **0a** | Manuel | **Copiar el VALOR de las DOS claves a un gestor: la de cifrado Y la del índice ciego** | Alberto confirma que puede leer ambas |
| **0a-bis** | Manuel | **Copiar también el VALOR de los secrets de Fly (credenciales TIREA)** — `fly secrets list` solo muestra NOMBRES, nunca valores | Alberto confirma que puede leerlos. Si el movimiento entre orgs los perdiera, solo se recuperan pidiéndolos otra vez a TIREA |
| 0b | Manuel | Dump de Supabase + lista de Blob + export de env vars | Dump restaurable en local. **No se commitea** |
| 0c | Los dos | Elegir hora **fuera de 5:30/11:30**, justo tras un pull correcto | Último `cima_ficheros` del día ya cargado |
| 1 | Manuel | Acepta la invitación al equipo Vercel Pro | — |
| 2 | Manuel | **Transfer Project** del proyecto `asegura` | Dominio re-verificado + **descifrar un registro real** + **buscar un cliente conocido por email y por DNI** (el índice ciego falla en silencio) |
| 3 | Manuel | Supabase → Transfer project (mismo ref, conexiones intactas) | La app sigue leyendo |
| 4 | Los dos | Blob: re-apuntar token o mover los 4 ficheros | Los 4 se abren desde la app |
| 5 | Manuel | **Fly.io: TRANSFERIR la app del adaptador** (decidido: sus secrets son de producción) | `/health` del adaptador + un pull manual con datos |
| 6 | Manuel | GitHub: transferir los dos repos (app y adapter) | — |
| 7 | **Alberto** | Reconectar el Git en Vercel + **volver a poner `CRON_SECRET`** + **comprobar que Actions y sus `schedule:` están activos** | **Una ejecución REAL del cron en su franja, con filas nuevas** |
| 8 | Los dos | Repunte de Codeoscopic y Meta/WhatsApp (si el dominio se mueve limpio, no cambian) | — |
| 9 | Alberto | Pull completo de CIMA + una cotización de punta a punta | Ambos verdes **antes** de sacar a Manuel del equipo |
| 10 | Alberto | Quitar a Manuel del equipo → **Manuel cancela su Pro** | — |

**Nada se apaga hasta el 9.** Manuel ya lo ha dicho por escrito: no borra ni apaga nada.

---

## 🕐 GUION DEL CORTE, minuto a minuto — **PLAN ALTERNATIVO** (si algún día se hace todo de una sentada)

> El runbook de arriba dice **qué** pasos hay. Esto dice **cuándo, quién y qué se verifica antes de
> seguir**. Sale de la secuencia que propuso Manuel más los huecos que le encontramos. Cuando Alberto
> fije la fecha, esto se ejecuta tal cual.

### ⚠️ Lo que ese día NO se hace (y conviene tenerlo escrito para no improvisar)

El día del corte **solo cambia la PROPIEDAD de las cosas**, no su forma. Ese día **no** se fusiona la
base en `central`, **no** se toca RLS ni la autenticación, **no** se emite ninguna póliza por
Codeoscopic y **no** se despliega nada nuevo. La app sigue siendo la misma app, en la misma URL, con
la misma base — solo que las factura Alberto. Todo lo demás (verter el modelo al schema `seguros`,
re-plataformar la auth, las pantallas en `apps/asegura`) es **Fase 2, con calma y sin reloj**.

Mezclar las dos cosas el mismo día es la forma más fácil de convertir un traspaso reversible en una
migración irreversible.

### 🧰 T-7 a T-2 — preparación de Alberto, sin depender de Manuel

| # | Qué | Por qué |
|---|---|---|
| A1 | **Crear cuenta y organización en Fly.io** | Es el **único** de los 5 sistemas donde Alberto no tiene cuenta. Sin org de destino, la app del adaptador no se puede mover |
| A2 | Invitar a Manuel a **Vercel** (equipo `pisos-turisticos-projects`, plan **Pro** ✅) | Un *Transfer Project* solo puede apuntar a un equipo del que el emisor sea miembro |
| A3 | Invitar a Manuel a la **organización Supabase** (`fzagbwkkzfjlsvflkkvn`, plan **free**, hoy con 1 proyecto: `central`) | Igual: el traspaso va de organización a organización |
| A4 | Invitar a Manuel a la **org de Fly** recién creada | Para poder mover la app entre orgs |
| A5 | Abrir en el gestor de contraseñas una entrada **«Grupo Asegura»** con huecos para: clave de cifrado, clave de índice ciego, `CRON_SECRET`, secrets de TIREA/Fly, `wa_access_token` | Es el sitio donde aterrizan los valores. Ni WhatsApp ni email |
| A6 | **Comprobar que la org free acepta un 2º proyecto** y si el de Manuel es de pago | 🔴 Ver abajo. Se comprueba **el día antes**, no el mismo día |

**A6 en detalle — el único hueco que puede obligar a cambiar de plan sobre la marcha.** La
organización Supabase de Alberto está en **free** y tiene **un** proyecto (`central`). El traspaso
mete un segundo proyecto en esa organización. Si Supabase rechaza el destino —por el límite de
proyectos de free, o porque el proyecto de Manuel esté en un plan de pago que la org destino no
soporta— el corte no se cae: **plan B, restaurar el dump del paso 0b en `central`** ese mismo día.
Pero es una decisión que **no se improvisa a las 13:30**: se comprueba la víspera y, si hace falta,
se sube la org a Pro antes de empezar.

### 🌙 T-1 — Manuel hace copias, sin tocar producción

| # | Qué | Detalle |
|---|---|---|
| M1 | **Valor** de la clave de **cifrado** y **valor** de la clave del **índice ciego** | Al gestor. Son las dos únicas cosas verdaderamente irreversibles |
| M2 | **Valores de los secrets de Fly** (credenciales TIREA) | 🚨 Nuevo, y no estaba en el runbook: **`fly secrets list` NO muestra los valores**, solo los nombres. Si el movimiento entre orgs los perdiera, no hay de dónde recuperarlos: hay que volver a pedirlos a TIREA. Se apuntan **antes** |
| M3 | `CRON_SECRET` de GitHub Actions | No viaja en la transferencia del repo |
| M4 | Dump de la base + export de env vars + lista de los ~4 ficheros de Blob | El dump se queda **en local** y se borra al acabar: son datos de 32.600 personas. **Jamás se commitea** |

### ⏱️ T-0 — el corte

**Ventana propuesta: día laborable, 13:00–15:00.** Sale sola de los crons: justo después del pull de
las **11:30** (así el día ya está cargado) y a 16 horas del de las **5:30** del día siguiente, que es
la prueba que de verdad cierra el traspaso. ~2 horas, de las cuales trabajo efectivo ~1.

| Hora | Quién | Paso | 🚦 No se sigue hasta que… |
|---|---|---|---|
| 12:45 | Alberto | Comprobar que el pull de 11:30 entró | Hay un `cima_ficheros` de hoy |
| 13:00 | Manuel | Acepta las 3 invitaciones (Vercel, Supabase, Fly) | Aparece en los tres |
| 13:05 | Manuel | Vercel → **Transfer Project** | El proyecto sale en el equipo de Alberto |
| 13:15 | Alberto | Dominio y app | `app.grupoasegura.com` carga y se puede entrar |
| 13:20 | Manuel | Supabase → **Transfer project** | Mismo ref; la app sigue leyendo |
| 13:30 | Alberto | 🔑 **LAS DOS PRUEBAS** | **(1)** se **descifra** un IBAN real **y (2)** se **encuentra** un cliente conocido buscando por email **y** por DNI. Una sola no vale: el índice ciego falla en silencio |
| 13:40 | Manuel | Fly → mover la app del adaptador a la org de Alberto | La app aparece en su org |
| 13:45 | Alberto | `fly secrets list` + `/health` del adaptador | Están los nombres de los secrets **y** el health responde |
| 13:50 | Manuel | GitHub → transferir los dos repos (app y adapter) | — |
| 13:55 | Alberto | Aceptar la transferencia + **reconectar el Git en Vercel** | El proyecto vuelve a apuntar al repo |
| 14:00 | Alberto | **Volver a poner `CRON_SECRET`** + comprobar que Actions está habilitado y los `schedule:` vivos | Los workflows aparecen activos, no en gris |
| 14:10 | Alberto | 🔴 **Disparar el cron a mano** (`workflow_dispatch`) | Devuelve **filas nuevas**, no un 200 vacío. Un 200 sin datos es exactamente el fallo silencioso que buscamos |
| 14:25 | Los dos | Blob: re-apuntar el token o mover los ~4 ficheros | Los 4 se abren desde la app |
| 14:35 | Los dos | Codeoscopic y Meta/WhatsApp: repuntar URLs si el dominio se movió | — |
| 14:45 | Alberto | Una **cotización** de punta a punta en Codeoscopic | Verde. **Cotizar sí; emitir NO** (no es idempotente extremo a extremo: dos intentos = dos pólizas) |
| ~15:00 | — | 🚧 **PUERTA** | Nada se apaga si 13:30, 14:10 o 14:45 no están en verde |
| **D+1 5:30** | Alberto | **La prueba que cierra de verdad**: el cron **automático** | Entran filas **solo**, sin que nadie lo dispare |
| D+1 | Alberto | Sacar a Manuel del equipo → **Manuel cancela su Pro** | Fin de la duplicidad de pagos |

### 🔙 Marcha atrás

No hace falta ensayarla: **nada se borra ni se apaga durante el corte** —Manuel lo ha puesto por
escrito— así que si un paso falla, el estado anterior sigue entero y se reintenta otro día. El único
punto sin retorno de todo el traspaso son **las claves y los secrets de TIREA**, y por eso viven en
T-1, la víspera, y no en la ventana del corte.


---



---

## 🔁 CAMBIO DE MODO (26/08/2026): **sin cita, paso a paso** — manda esto sobre el guion de arriba

> **Decisión de Alberto:** no se fija día ni hora. Se le va pidiendo a Manuel **una cosa cada vez**,
> y él responde cuando puede. El guion de las 13:00–15:00 de arriba queda como **plan alternativo**
> por si algún día se hace todo de una sentada; **el modo vigente es este**.

**Por qué se puede hacer así, técnicamente.** Casi todos los pasos son *transferencias de propiedad
que no rompen nada*: Vercel se lleva los valores de las env vars y los dominios, Supabase conserva el
mismo `ref` (las cadenas de conexión no cambian) y mover la app de Fly entre organizaciones le
mantiene el nombre, así que `asegura-app-cima-adapter.fly.dev` sigue respondiendo. **Nadie se entera
de que la cosa ha cambiado de dueño.** Cada paso se puede hacer un martes y el siguiente el jueves.

### 🔴→⚪ CORRECCIÓN DE ALBERTO (26/08/2026): **no hay servicio que cortar. Se cae la urgencia entera**

> Palabras suyas: *«el programa aún no está operativo, no dejaría sin servicio y EIAC se puede
> consultar cuando queramos, no hay miedo de dejar sin servicio nada.»*

Dos hechos que este documento no tenía y que **invalidan** el andamiaje de urgencia que se montó sobre
la respuesta de Manuel:

1. **El CRM todavía no está en uso.** No hay usuarios dentro, así que ninguna transferencia —Vercel,
   Supabase, Fly— deja a nadie tirado aunque la app parpadee.
2. **Los ficheros de EIAC se pueden consultar y descargar cuando se quiera.** El cron es una
   *comodidad*, no la única ventana al dato: si deja de tirar tres días, los ficheros **siguen ahí** y
   entran en cuanto se relance el pull. Y el ingestor deduplica por hash, así que re-tirar es seguro.

**Qué deja de ser verdad, dicho sin rodeos:**

| Lo que decía este doc | Lo correcto |
|---|---|
| «Migración **en caliente**: el día que Manuel apague su Vercel, la correduría deja de recibir de sus compañías» | **No.** No hay servicio vivo y el dato no se pierde: se vuelve a pedir |
| «El corte necesita **fecha y hora acordadas**» | **No hace falta ninguna.** Paso a paso, al ritmo de Manuel |
| Ventana **13:00–15:00**, fuera de los pulls de 5:30/11:30 | **Irrelevante.** Cualquier hora vale |
| El repo va el último, **con Alberto delante**, porque el `CRON_SECRET` no viaja | El secreto **sigue sin viajar**, pero su pérdida ya no «para la correduría»: **pausa el pull**. Se repone cuando se pueda y se relanza. Deja de ser 🔴 y pasa a ser una casilla más de la lista |
| La prueba que cierra es el cron **automático** de las 5:30 del día siguiente | Sigue siendo **la buena** —demuestra que la cadena entera funciona sola— pero ya no es una cuenta atrás: si falla, se arregla al día siguiente y no ha pasado nada |

**Lo que NO cambia, y es lo único que de verdad importa:** las **dos claves de cifrado** y los
**secrets de Fly (TIREA)** siguen siendo irrecuperables. Que no haya prisa no las hace menos
irreversibles — al contrario: ahora **no hay ninguna excusa** para no tener las copias antes de tocar
nada. Y la verificación de Supabase sigue siendo **dos pruebas, no una** (descifrar Y buscar), porque
el índice ciego falla en silencio y eso no depende de que haya usuarios o no.

**Consecuencia práctica:** la tabla de 11 pasos de abajo se mantiene **en su orden**, porque el orden
sigue siendo el sensato (copias primero, invitaciones, transferencias, repo, verificación). Lo que se
borra es **el reloj**: ningún paso tiene ventana, ninguno exige a los dos a la vez, y ninguno urge.


### ⚪ El repositorio: lo que sí sigue siendo cierto, sin el drama

Transferir el repo **sí interrumpe el pull de CIMA**, y lo hace **sin avisar**: el workflow viaja, pero
el `CRON_SECRET` **no** (es un secret de GitHub Actions, no del repositorio). El cron se seguiría
disparando, la app le contestaría que no está autorizado y **no entraría nada sin que nada diera error**.

Lo que cambia tras la corrección de Alberto es la **consecuencia**, no el mecanismo: eso ya no deja a
la correduría sin recibir de sus compañías —**los ficheros siguen en EIAC y se piden cuando se
quiera**—, así que es una **pausa**, no una pérdida. Se repone el secreto cuando se pueda y se relanza
el pull; el ingestor deduplica por hash, o sea que re-tirar no duplica nada.

Sigue siendo el paso que **conviene** dejar para el final —es el único que requiere que Alberto haga
tres cosas seguidas (reconectar el Git en Vercel, reponer el secreto, comprobar que Actions sigue
habilitado)— pero **ya no hay que estar delante ni elegir la hora**.

### 🎯 REPLANTEAMIENTO (26/08/2026): pedirle **ACCESOS**, no tareas

> Decisión de Alberto: *«que él tenga menos trabajo, lo que podamos hacer nosotros mejor».*

La lista de cinco cosas del Mensaje 1 anterior le cargaba a Manuel un trabajo que **en su mayor parte
puede hacer Alberto solo**, si tiene acceso. Repartido de nuevo:

| Lo que se le pedía | ¿Puede hacerlo Alberto? | Cómo |
|---|---|---|
| Copiar el valor de **las dos claves** | ✅ **Sí** | Son variables de entorno del proyecto de Vercel: siendo miembro del equipo se leen y se exportan |
| **Export de env vars** y **lista de Blob** | ✅ **Sí** | Igual: desde el panel del equipo |
| **Dump** de la base | ✅ **Sí** | Con acceso a la organización de Supabase |
| **`CRON_SECRET`** | ✅ **Sí, y mejor** | 🔑 **No tiene por qué ser el mismo valor.** GitHub no enseña el valor de un secret a nadie, ni a su dueño. Alberto **genera uno nuevo** y lo pone en los dos sitios (secret de Actions + env var de la app) cuando sea suyo. Esto borra el punto entero de la lista de Manuel |
| **Secrets de Fly (TIREA)** | ❌ **No** | `fly secrets list` muestra nombres, nunca valores — tampoco a Manuel. Solo los tiene si los apuntó fuera. Se pide **como favor, no como requisito**: si no los tiene, se piden a TIREA el día que hagan falta |

**Trabajo real de Manuel, reducido a esto:**

1. **Cuatro invitaciones** (Vercel como owner, organización Supabase como owner, organización Fly, y
   colaborador en los dos repos). Cuatro clics.
2. **Aceptar** las dos invitaciones de vuelta a las cuentas de Alberto (destino de las transferencias).
3. **Transferir los dos repos** de GitHub — esto sí es suyo: un repo personal solo lo transfiere su dueño.
4. **Cancelar su Pro** al final.

⚠️ **A confirmar en el panel, no darlo por hecho:** si siendo *owner* de sus cuentas Alberto puede
**iniciar él mismo** el *Transfer Project* de Vercel y el *Transfer project* de Supabase. Si se puede,
a Manuel le quedan literalmente los repos y cancelar el Pro. Si no se puede, son **un clic cada una**
para él, que tampoco es nada. Se mira cuando esté dentro; no se le promete de antemano.


### 🪜 La secuencia, y qué cierra cada paso

| # | Quién | Qué pide / hace | ✅ Cerrado cuando… | Riesgo si se queda a medias |
|---|---|---|---|---|
| ~~1~~ | Manuel | ~~Cuatro invitaciones~~ → **Supabase ✅ y Fly ✅ ya hechas (26/08)**. **Vercel NO hace falta**: el traspaso va por código, sin invitación ni asiento | — | — |
| **1-bis** | **Manuel** | **Lo único que queda: colaborador en los dos repos de GitHub** | Llega el correo de invitación | Es gratis, y sin esto no se pueden transferir los repos |
| ~~1b~~ | — | ~~¿su Supabase es free o de pago?~~ **RESUELTO sin preguntar (26/08)**: organización **LOOR**, plan **free**, igual que la de Alberto | Comprobado por el conector | — |
| **1c** | Manuel | *Si los tiene apuntados*: los secrets de Fly (TIREA). **Favor, no requisito** | Alberto los guarda | Si no los tiene, se piden a TIREA el día que hagan falta |
| **2** | **Alberto** | **Todas las copias**, él solo — pero las dos claves ahora se leen **DESPUÉS** del traspaso (no entra en el Vercel de Manuel). Seguro porque él no borra nada | Puede descifrar y buscar con lo que tiene guardado | — |
| **3** | Alberto | Crear la **organización en Fly** e invitar a Manuel a **sus** cuentas (destino de las transferencias) | Enviadas | — |
| **4** | Manuel | Aceptar esas dos | Aparece en ellas | — |
| **5** | Los dos, **por código** | Manuel genera la solicitud de traspaso (código de 24 h) y se lo pasa; Alberto lo acepta en su equipo | El dominio carga y se entra | Ninguno: envs y dominio viajan. **Sin asientos ni invitaciones** |
| **6** | Alberto *(o Manuel, un clic)* | **Supabase → Transfer project** | 🔑 **LAS DOS PRUEBAS**: **descifrar** un IBAN real **y encontrar** un cliente por email **y** por DNI | Con una sola prueba, un índice ciego roto pasa desapercibido |
| **7** | Alberto | **Fly → mover la app** del adaptador a su org | `fly secrets list` muestra los nombres **y** `/health` responde | Bajo; el 1c lo cubre si lo tenemos |
| **8** | Alberto | **Blob**: re-apuntar el token o mover los ~4 ficheros | Los 4 se abren desde la app | — |
| **9** | **Manuel** | **GitHub: transferir los dos repos** — esto sí es suyo, un repo personal solo lo transfiere su dueño | Alberto los ve en su cuenta | — |
| **10** | Alberto | Reconectar el Git en Vercel + **generar un `CRON_SECRET` NUEVO** y ponerlo en Actions y en la app + comprobar que Actions sigue habilitado + **disparar el cron a mano** | Devuelve **filas nuevas**, no un 200 vacío | El pull se **pausa** en silencio si el secreto no cuadra. No se pierde nada: los ficheros siguen en EIAC |
| **11** | Alberto | Repunte de Codeoscopic/Meta + una **cotización** de punta a punta (**cotizar sí, emitir NO**) + ver el cron **automático** entrar solo | Ambos verdes | — |
| **12** | Los dos | Sacar a Manuel del equipo → **Manuel cancela su Pro** | Fin de la duplicidad | — |

**Nada se apaga hasta el 10.** Y como no hay cita ni servicio vivo, **nada obliga a seguir**: si un
paso se atasca, el anterior sigue en pie y no hay nadie esperando al otro lado.

### 📨 Mensajes por paso — **BORRADORES. Ninguno se envía sin que Alberto lo diga**

**Mensaje 1 — el que se manda ahora** (v2: pide **accesos**, no tareas; tono relajado y sin plazos):

```
Manuel, sin prisa ninguna. Lo vamos haciendo poco a poco, cuando tú puedas.

Y sobre todo, que no te comas trabajo: casi todo lo puedo hacer yo si tengo acceso, así
que en vez de pedirte tareas te pido invitaciones. Con esto ya me apaño solo:

 - Vercel: invítame a tu equipo, como owner si puede ser
 - Supabase: invítame a tu organización, igual
 - Fly: invítame a tu organización
 - GitHub: añádeme de colaborador en los dos repos, el de la app y el del adaptador

Con eso me saco yo las copias de seguridad —las claves de cifrado, las variables de
entorno, el dump de la base, la lista de ficheros— y voy dejándolo todo preparado sin
darte la lata.

Solo hay una cosa que no puedo sacar de ningún sitio: los secrets de Fly, los de TIREA.
`fly secrets list` enseña los nombres pero nunca los valores, ni a ti. Si los tienes
apuntados por ahí, pásamelos cuando te venga bien; y si no los tienes, tampoco pasa
nada, se los pedimos a TIREA el día que haga falta.

Del CRON_SECRET ni te preocupes: no hace falta que busques el tuyo, genero uno nuevo yo
y lo pongo en los dos sitios cuando toque.

Lo demás lo vamos viendo sobre la marcha. Al final tú solo tendrás que pasarme los dos
repos y cancelar el Pro, y ya está. Tranquilo con los tiempos: la app no la usa nadie
todavía y los ficheros de EIAC se pueden pedir cuando queramos, así que no hay nada que
se rompa por esperar. A tu ritmo.
```

> ~~Mensaje 1 v1~~ — pedía cinco cosas *hechas* (copiar claves, exportar envs, hacer el dump…).
> **Descartado sin enviar**: le cargaba a Manuel trabajo que Alberto puede hacer él con solo tener
> acceso. Ver «REPLANTEAMIENTO», arriba.

**Mensaje 2** — cuando el 1 esté cerrado y Alberto haya creado la org de Fly: avisar de las tres
invitaciones y pedir que las acepte.
**Mensaje 3** — pedir el *Transfer Project* de Vercel. **Mensaje 4** — el de Supabase. **Mensaje 5** —
mover la app de Fly. **Mensaje 6** — 🔴 acordar un rato de tarde para los repos, que es el único con
reloj. Se redactan cuando toque, no antes: cada uno depende de cómo haya ido el anterior.


### 📝 Mensaje para Manuel — v7 (26/08/2026) — **DESCARTADO sin enviar: proponía fijar día y hora, y Alberto decidió ir paso a paso.** El vigente es el «Mensaje 1» de «CAMBIO DE MODO», arriba

> Sustituye a la v6. Solo falta que Alberto ponga el día. Va sin RGPD por indicación suya.

```
Manuel, con lo que me contaste ya lo tengo todo claro. Te propongo cerrarlo así.

DÍA Y HORA: ¿te viene bien el [DÍA] de 13:00 a 15:00? Lo pongo ahí a propósito: después del
pull de las 11:30 (así el día ya está cargado) y bien lejos del de las 5:30. De trabajo real
es una hora; el resto es comprobar.

LA VÍSPERA, lo único que necesito de ti — y por el gestor de contraseñas que te comparto,
nada de WhatsApp ni correo:
 1) el valor de las dos claves, la de cifrado y la del índice ciego
 2) el valor de los secrets de Fly (los de TIREA). Esto lo pido por algo concreto:
    `fly secrets list` solo enseña los nombres, nunca los valores. Si al mover la app de
    organización se perdieran, no hay de dónde sacarlos: habría que volver a pedirlos a TIREA.
 3) el CRON_SECRET de Actions, que ese no viaja al transferir el repo
 4) el dump, el export de las env vars y la lista de los ficheros de Blob

Esta semana te llegan tres invitaciones: Vercel, Supabase y Fly (esta última la he creado yo,
que no tenía cuenta). Con que las aceptes el mismo día a las 13:00, vale.

Una pregunta suelta: tu proyecto de Supabase, ¿está en free o en algún plan de pago? Mi
organización está en free y quiero comprobar la víspera que acepta el traspaso. Si no lo
acepta no pasa nada: restauramos el dump y seguimos igual.

Y para que quede claro qué hacemos ese día: SOLO cambiamos de dueño las cosas. No tocamos la
base, ni la autenticación, ni desplegamos nada nuevo. Sigue siendo tu misma app, en la misma
URL, con la misma base — solo que la pago yo. Lo de integrarlo en mi monorepo lo hago yo
después, con calma y sin reloj.

No apagues nada ese día. La prueba que de verdad cierra esto es la mañana siguiente: que el
cron de las 5:30 entre solo y traiga pólizas. Cuando lo veamos, cancelas el Pro y ya está.

Gracias por dejarlo todo tan atado, de verdad.
```

## 🔄 CORRECCIÓN (26/08/2026): la intranet SÍ se queda, y cómo se unifican los Vercel

> **Alberto rectifica el alcance:** Manuel tiene **una intranet ya diseñada y una web pública**, y
> **quiere quedarse ambas** para seguir trabajando sobre ellas. **Queda sin efecto** lo escrito más
> abajo sobre «la intranet la rehacemos nosotros» y sobre pedirle solo dos carpetas: **se traspasa
> TODO**. Lo que no cambia: los datos ya se leen, así que sigue sin hacer falta API ni conector.

### La pregunta real: cómo mete Manuel su Vercel en el de Alberto

**Recomendada — que Manuel entre un rato en el equipo Pro de Alberto y despliegue él mismo.**

1. Alberto lo invita a `pisos-turisticos-projects` (*Settings → Members → Invite*).
2. **Manuel importa el proyecto ahí y mete él mismo las variables de entorno.**
3. Se verifica con el suyo todavía encendido.
4. Se apaga el suyo, **se le quita del equipo** y cancela su Pro.

> 🔑 **La ventaja que decide:** así **las credenciales no viajan por ningún canal**. No hay que
> pasarlas por WhatsApp ni por gestor de contraseñas: las escribe él directamente en el destino. Es la
> parte más delicada de todo el traspaso y esta vía la elimina de raíz.
>
> ⚠️ **Matiz de coste, para no repetir lo que este documento dijo mal:** meter un **proyecto** más en
> un equipo Pro no cuesta nada, pero meter a **Manuel como miembro** sí ocupa **un asiento** mientras
> esté dentro (Vercel Pro se factura por miembro). Es temporal y sale mucho más barato que el riesgo
> de pasear secretos.

**Alternativa — transferir el proyecto** (*Project Settings → Transfer*). Se lleva despliegues,
dominios y variables de golpe. **Pero deja el proyecto conectado a un repositorio que sigue siendo
suyo**, así que hay que reconectar el git igualmente. Solo compensa si además transfiere el repo.

**Lo que NO recomiendo:** que Manuel invite a Alberto a su cuenta. Si está en Hobby ni siquiera puede
—las cuentas personales Hobby no admiten miembros—, y aunque pudiera, no resuelve el pago: seguiría
siendo su cuenta y su factura.

### Y el repositorio, ¿dónde acaba?

El destino final es **`apps/asegura` dentro de `central`**, como manda la matriz. Pero eso no tiene que
bloquear el corte del gasto: se puede hacer en dos velocidades.

1. **Rápido (corta el gasto ya):** Manuel **transfiere el repo a la cuenta de GitHub de Alberto**,
   despliega en su equipo Pro apuntando a ese repo, y cancela lo suyo.
2. **Después, con calma:** el árbol de trabajo se integra en `central` como `apps/asegura` (con su
   `vercel.json`, su `ignoreCommand` y Root Directory), y el repo suelto queda archivado.

Esto **invierte el orden** que este documento defendía («la transferencia del repo, la última, porque
le tumba el despliegue»): esa cautela existía para no dejar sin servicio a un tercero. **Siendo su
hermano y con todo a nombre de Alberto, el despliegue va a moverse igualmente**, así que lo que hay que
proteger no es su despliegue: es que **CIMA no deje de descargar** — y eso se protege con la fecha
acordada, no retrasando la transferencia.

### 🚨 Su Vercel puede tener más que código: mirar antes de apagar

- **¿Un almacén de ficheros?** `codeoscopic_documents` tiene una columna **`blob_url`**. Hoy está a
  cero, pero si en algún momento se usó **Vercel Blob**, ese almacén vive **en su cuenta**, no en el
  código ni en la BD. **Y sigue sin saberse dónde están los ficheros de CIMA** (`cima_ficheros` solo
  guarda metadatos): mirar si están ahí.
- **Los crons**, que son los que mantienen viva la ingesta de CIMA y el detector de vencimientos.
- **Los dominios** asignados, y a nombre de quién está registrado cada uno.
- **¿Cuántos proyectos tiene?** Si la web pública y la intranet son dos proyectos separados, son dos
  traspasos, no uno. **No consta: hay que mirarlo en su panel.**

---

## 💸 Cómo se corta la duplicidad de pagos, y por qué NO hace falta API ni conector (26/08/2026)

> **Contexto que lo simplifica todo (dicho por Alberto, 26/08/2026): Manuel es su hermano y TODO está a
> nombre de Alberto** — los contratos, Codeoscopic incluido. **Queda cerrado el riesgo contractual** que
> este documento marcaba como «puede tumbarlo todo»: no hay que renegociar nada con Avant2, ni hay
> conflicto de intereses. Esto no es un traspaso entre proveedor y cliente: es mover de sitio algo que
> ya es suyo, y el objetivo declarado es **que Manuel deje de pagar duplicidades**.

### La pregunta: ¿API a medida, conector MCP, o acceso a su Vercel?

**Ninguna de las dos primeras.** Y el motivo es que resuelven un problema que ya está resuelto:

| Opción | Veredicto |
|---|---|
| **Que Manuel monte una API y nosotros «chupemos» los datos** | ❌ **Innecesario.** Ya tenemos **lectura completa** de su Supabase por el `project_id`. Los datos ya se leen hoy. Montar una API sería trabajo nuevo **para él** que replicaría peor lo que ya funciona: fila a fila, en JSON, y perdiendo tipos, índices y constraints |
| **Un conector MCP enchufado a su proyecto** | ❌ **Lo mismo, con más pasos.** Un MCP sirve para *mirar*, y para mirar ya estamos dentro. Y para *copiar*, la herramienta es `pg_dump`, que se lleva el esquema entero de una vez |
| **El código por ZIP** | ✅ **Lo más simple que existe.** Dos carpetas comprimidas por el canal que quiera. **15 minutos de su tiempo**, cero infraestructura nueva |
| **Acceso/transferencia de su Vercel** | ✅ **Lo que de verdad corta el gasto.** Ver abajo |

🚨 **La clave: lo que falta NO son datos, es código.** Los datos ya los tenemos. Cualquier solución
pensada para «traer los datos» —API, MCP, sincronización— está atacando el problema equivocado.

### El gasto duplicado: qué paga Manuel de verdad

- **Supabase: 0 €.** Su organización está en **plan FREE** (comprobado). La base de datos no le cuesta nada.
- **Vercel: sí paga.** Dice que le obligan a **Pro** (~20 $/mes). Es coherente: los términos de Vercel
  **no permiten uso comercial en el plan Hobby**, y esto es una correduría facturando. Además, Hobby no
  admite invitar miembros de equipo — que es justo por lo que la invitación nunca llegó.
- Quedan por confirmar: **dominio propio** y el coste de **WhatsApp Business API**, si lo hay.

**Así que la duplicidad es esencialmente el Vercel.** Y aquí está lo bueno: **Alberto YA tiene un equipo
Vercel en plan Pro** (`pisos-turisticos-projects`). Meter esta app ahí **no añade coste**: el Pro se
paga por miembro, no por proyecto. **En cuanto la app corra en el equipo de Alberto, Manuel cancela su
Pro y la duplicidad desaparece.**

### La ruta más corta, en orden

1. **Manuel comprime dos carpetas** (ingestor EIAC/CIMA + cliente Codeoscopic) y las manda. Y con ellas,
   **la lista de nombres de sus variables de entorno y de sus crons**. *(Si prefiere, el repo entero
   comprimido también vale: lo que no entra en `central` es su historia git.)*
2. **Los valores de los secretos, por gestor de contraseñas** — nunca por WhatsApp ni correo.
3. **Se despliega en el equipo Pro de Alberto**, apuntando ya al Supabase de `central`.
4. **Se verifica en paralelo** contra su sistema, todavía encendido.
5. **Se acuerda fecha y hora del corte**, se apaga el suyo y **Manuel cancela el Pro**.

> **Alternativa que ahorra el paso 3:** Vercel permite **transferir un proyecto** de una cuenta a otra.
> Si se transfiere el suyo al equipo de Alberto, se lleva configuración y variables de golpe. **Pero
> obliga a reconectar el repositorio de git**, así que solo compensa si además se mueve el repo. Con el
> ZIP se llega igual y sin sorpresas.

### 🚨 Lo que ningún ZIP trae: los terceros que apuntan a SU URL

Esto es lo que se olvida en todas las migraciones y revienta el día del corte. Hay proveedores externos
con **la dirección de su despliegue configurada en su propio panel**:

- **Codeoscopic** tiene registrada una URL de webhook suya (lo prueba `codeoscopic_webhook_events`).
- **Meta / WhatsApp Business** tiene registrado su webhook de mensajes entrantes
  (lo prueban `channel_inbound_messages` y las columnas `wa_*` de `corredurias`).
- **Lo que descargue los ficheros de CIMA** puede tener IP o credencial asociada a su lado.

**Cambiar esas URLs se hace en el panel de cada proveedor, no en el código.** Va en la lista del corte,
junto a la fecha — y es el motivo por el que el corte tiene que ser un momento acordado y no un apagón.

---

## 🔌 Las dos integraciones: qué está en la BD y qué NO (26/08/2026)

Alberto lo planteó bien: **la intranet da igual, se rehace**. Lo que no se rehace barato son las dos
conexiones. Esto es lo que se puede afirmar mirando su base de datos.

> **Dato de método:** de las **132 funciones** de `public`, ninguna implementa lógica de Codeoscopic
> ni de CIMA (solo dos guardas de inmutabilidad, `poliza_documentos_reject_update` y
> `poliza_merge_log_reject_modification`). **Toda la integración vive en el código, no en la BD.**
> La base de datos es el destino del dato, no el motor que lo trae.

### 🔴 CIMA / EIAC — está VIVA y alimentándose HOY

| | |
|---|---|
| Estándar | **EIAC 6.0** |
| Compañías conectadas | **4** |
| Ficheros procesados | 125 (86 en estado `confirmed`) |
| Tipos de objeto | **CEF** (certificado) · **POL** (póliza) · **REC** (recibo) · **SIN** (siniestro) |
| Lo que ha metido en la BD | **188 pólizas**, 184 recibos, 96 intervinientes, y **67 de los 67 siniestros** |
| **Último fichero descargado** | **25/08/2026 — ayer.** La última póliza creada es del 24/08 |

~~🚨 **Esto no es una migración de un sistema parado: es una migración EN CALIENTE.**~~
🔴 **CORREGIDO el 26/08/2026 por Alberto, y era el error de fondo de este documento.** Sí hay un
proceso corriendo en el Vercel de Manuel que descarga ficheros de las aseguradoras **todos los días** y
los vuelca aquí — eso es cierto y sigue siéndolo. Lo que era falso es la conclusión: **el CRM todavía
no está operativo** (nadie lo usa) y **los ficheros de EIAC se pueden consultar y descargar cuando se
quiera**. Así que apagar su despliegue **pausa** el pull, no corta el suministro, y lo pendiente entra
en cuanto se relance (el ingestor deduplica por hash). **No hacen falta fecha ni hora acordadas.**

Que un proceso corra a diario no significa que alguien dependa de él **hoy**: eso es lo que se dio por
supuesto sin preguntar. Lo que sí sigue en pie del párrafo original es el «no desactives nada» —por
prudencia, no por urgencia— y el valor del parser.

Los estados del ingestor (`pending | persisted | confirmed | review | review_salud | deferred | error`)
son la prueba de que **el parser está rodado**: `review_salud` y `deferred` no se diseñan de antemano,
salen de casos reales que fallaron. Rehacer eso desde cero es meses, no semanas.

### 🟡 Codeoscopic (multitarificador) — desarrollada, pero PARADA y sin emisión ejercitada

El esquema describe una integración seria: flujo `cotizacion → preemision → emitida / rechazada /
riesgo_condicionado / vencida / error`, **doble raíl de sincronización** (polling con
`polling_next_at`/`polling_attempts` **y** webhooks con `payload_hash` para deduplicar), control de
idempotencia en el envío (`submit_attempt_id`, `submit_in_flight_at`) y almacenamiento del
**`raw_payload`** de cada precio y cada webhook.

**Pero los datos dicen que no ha llegado a emitir:**

| Tabla | Filas | Qué significa |
|---|---:|---|
| `codeoscopic_projects` | 1 | y su estado es **`cotizacion`**, nunca `emitida` |
| `codeoscopic_prices` / `offers` | 15 / 15 | cotizar sí funciona |
| `codeoscopic_participants` | **0** | los intervinientes de emisión, sin estrenar |
| `codeoscopic_product_forms` | **0** | los formularios de preemisión/emisión, sin estrenar |
| `codeoscopic_documents` | **0** | ni pólizas, ni recibos, ni SEPA, ni IPID descargados |
| `codeoscopic_webhook_events` | 2 | uno de tipo `emision_ok` |
| **Último proyecto** | **29/07/2026** | lleva **casi un mes parada** |

⚠️ **Cero filas no prueba que el código no exista** — prueba que **no se ha ejercitado**. Puede estar
escrito y sin probar, o probado en un entorno de pruebas que no es este. Pero cambia la conversación:
antes de dar por hecho que «la emisión ya está», hay que verla funcionar. **La cotización sí está
demostrada; la emisión no.**

> 💡 **Lo que salva el día si el código no llegara:** guardan el `raw_payload` crudo de cada respuesta.
> Aunque no consiguiéramos una línea de su código, esos payloads **documentan el formato real de la API
> de Codeoscopic** mejor que cualquier manual. Eso ya está en nuestra copia.

### 🔑 Credenciales: parte están en la BD, no solo en Vercel

`corredurias` tiene columnas **`wa_access_token`, `wa_phone_number_id`, `wa_business_account_id`** —
credenciales de WhatsApp Business **dentro de la tabla**. Hoy están a NULL (0 filas con token), así que
el dump no arrastra nada, pero **hay que tratar esa columna como campo de secreto** en el traspaso y en
cualquier exportación futura. Y confirma que el inventario de credenciales no se agota en los envs de
Vercel: hay que mirar también dentro de la base.

### ➡️ Lo que esto cambia en la petición a Manuel

No hace falta el repositorio entero, ni la transferencia, ni pelearse por el historial. **Hacen falta
cuatro cosas concretas**, y son mucho más fáciles de conceder:

1. **La carpeta del cliente de Codeoscopic** — endpoints, autenticación, y el mapeo de formularios por
   producto/compañía. Y la respuesta a: *¿la emisión llegó a probarse?*
2. **La carpeta del ingestor EIAC/CIMA** — cómo se descargan los ficheros (¿SFTP, portal, API de
   TIREA?), el parser del ZIP/XML y las reglas de conciliación. **Es la pieza más valiosa del traspaso.**
3. **La lista de variables de entorno** (solo nombres aquí; los valores por gestor de contraseñas) y
   **la lista de crons** de su Vercel — ahí está el «vencimientos-detector» que dispara
   `ofertas_automaticas` a 30/15/7 días del vencimiento.
4. ~~**Una fecha y hora acordadas para el corte**, por lo de CIMA.~~ **Ya no hace falta** (26/08/2026): sin servicio vivo y con EIAC consultable a demanda, el traspaso va paso a paso.

### 🧾 Y lo que no es técnico y puede tumbarlo todo

- ~~**Codeoscopic/Avant2 es un contrato de licencia** y hay que saber a nombre de quién está.~~
  ✅ **RESUELTO (26/08/2026): está todo a nombre de Alberto**, Codeoscopic incluido. Manuel es su
  hermano y desarrolló el proyecto adelantándoselo; no hay tercero con quien negociar.
- **CIMA/TIREA va asociada a la clave de mediador**, que es de la correduría — es decir, de Alberto.
  Esa parte no tiene sorpresa contractual, pero hay que confirmar con qué credenciales se está
  descargando hoy.

---

## 🏷️ Cómo se llama cada cosa (y por qué no todo igual)

| Pieza | Nombre | Por qué |
|---|---|---|
| Vertical / carpeta / proyecto Vercel | **`apps/asegura`** | Es la **marca** del negocio, «Grupo Asegura». Y la carpeta ya existe con su SQL aplicado (PR #1489): renombrarla ahora sería churn sin ganancia |
| Schema de la BD | **`seguros`** | **Ya creado y aplicado** en `central`. Es el **dominio**, no la marca: si mañana la marca cambia, el schema no se toca |
| Rol de BD de la app | **`prisma_seguros`** | Ya creado (inerte, sin contraseña). Renombrar un rol vivo por estética no se hace |
| Módulo compartido, si aparece | **`packages/module-seguros`** | Los módulos van por dominio (`module-pesca`, `module-flota`), no por marca |
| Secreto de sesión | **`ASEGURA_SESSION_SECRET`** | Los envs van por app |

> **La confusión de fondo, dicha una vez:** «Asegura» es el **cliente/marca** y «seguros» es el
> **dominio**. Ambos nombres son correctos, cada uno en su capa. Lo que estaba mal era tener dos
> documentos usándolos como si fueran dos proyectos distintos.

## Qué es esto

Manuel Suárez desarrolló, en **su** cuenta de Supabase y **su** cuenta de Vercel, un CRM de correduría
de seguros prácticamente terminado, con integraciones ya hechas contra proveedores externos. El negocio
es de Alberto, así que el desarrollo tiene que cambiar de dueño: datos a la Supabase de Alberto,
despliegue a su equipo de Vercel, y código dentro del monorepo.

**Sí es posible y no exige que Manuel reescriba nada.** Son tres activos independientes, cada uno con
su vía.

| Activo | De dónde | A dónde | Mecanismo |
|---|---|---|---|
| Datos + esquema | Supabase de Manuel | `central` (`wswbehlcuxqxyinousql`) → schema **`seguros`** | `pg_dump` → `psql` en tubería directa (ver «¿MCP o API?») |
| Código | repo de Manuel | `apps/asegura` del monorepo | copia del árbol de trabajo, **sin historia git**; el repo original se transfiere y se archiva aparte |
| Despliegue | Vercel de Manuel | proyecto nuevo en `pisos-turisticos-projects` | Root Directory `apps/asegura` |
| Credenciales de proveedores | envs de Manuel | envs del proyecto Vercel nuevo | lista de nombres + **rotación** |

### Decisiones ya tomadas (20/08/2026)
1. **Schema `seguros` dentro de `central`**, no un proyecto Supabase aparte. Lo manda `MATRIZ.md`:
   una sola BD para todo el holding (dos proyectos = doble cobro y consolidación imposible).
2. **Vertical nueva `apps/asegura`** con su proyecto Vercel propio, patrón `apps/mariscos`.
3. **Free vs. Pro de Supabase se decide midiendo el dump real**, no con la estimación de los ~200 MB.
4. **NO se transfiere el proyecto Supabase de Manuel.** Sería un segundo proyecto (rompe el punto 1) y
   exigiría meterle como miembro de la organización que contiene TODOS los datos del holding. Se copia
   el contenido y él borra el suyo después.

> **Por qué un segundo proyecto Supabase no es «gratis» aunque el free permita dos.** Cuesta 0 €/mes,
> sí, pero: (a) **un proyecto free se pausa solo a los 7 días de poca actividad** —una correduría que
> se consulta a ratos se apaga sola, y recuperarla es manual, con ventana de 90 días—; (b) los límites
> del free (5 GB de egress, cuotas) son **por organización**, así que dos proyectos no dan el doble:
> se reparten y suman puntos de fallo; (c) sin joins contra `movimientos_bancarios` / `cuentas` /
> `negocios` la consolidación es imposible, y hay que duplicar roles, backups, migraciones y envs.
> **Cuándo sí tocaría proyecto aparte:** si la correduría se vendiera o se separara del grupo, o si un
> requisito legal obligara a aislar los datos. Hoy no es el caso.

### Punto de partida verificado (20/08/2026)
- Supabase: una sola organización (`fzagbwkkzfjlsvflkkvn`), **plan FREE**, un solo proyecto `central`.
  Uso ≈ **180 MB** de 500 (`public` 151 MB · `iarest` 22 MB · `rrhh` 1,5 MB). `cron` y `net` ya instaladas.
- Vercel: equipo `pisos-turisticos-projects` (`team_f4gPpt6dPuNcd5YyMt3q27uf`).
- En el repo, `apps/asegura/` existe pero **solo contiene su SQL de cimientos** — no hay app Next.js
  todavía, ni `package.json`, ni `CLAUDE.md` propio.

### ✅ Hecho ya en `central` (19/08/2026, PR #1489) — sin depender de Manuel
- **Schema `seguros` creado** y **rol `prisma_seguros`** (LOGIN + BYPASSRLS, **sin `CREATE`**), en
  `apps/asegura/prisma/sql/2026-08-19_asegura_bootstrap.sql`. Aplicado por MCP y verificado.
- El rol está **inerte a propósito: sin contraseña**. No puede conectarse hasta que Alberto ejecute
  `ALTER ROLE prisma_seguros WITH PASSWORD '…'`. Sobre `public` solo tiene **SELECT** de `cuentas`,
  `sociedades` y `negocios` (mínimo privilegio, lección de `prisma_almacen`).
- **Cero tablas.** Y eso es «sin inventariar», no «no hay»: el modelo de datos vive en el sistema de
  Manuel. La Fase 1 es la que lo cierra.

### 🚧 Frontera con lo que YA existe (no confundir, no duplicar)
`apps/plataforma` ya tiene `/correduria` + `lib/correduria.ts` + `app/api/correduria/*` + CIMA/TIREA.
Eso es la **contabilidad de las comisiones cobradas** de ASegura S.L. (CS-F/0170), derivada del banco
(`movimientos_bancarios`, `destino='seguros'`, siempre BBVA). **No se toca en este traspaso.**

Lo de Manuel es la **operativa**: clientes, pólizas, siniestros, vencimientos, integraciones con
aseguradoras. Conviven. Que plataforma consolide leyendo `seguros.*` (como ya hace con `rrhh.*`) o por
puerto HTTP es una **fase posterior**, fuera del alcance del PR de traspaso.

**Lo que esa fase posterior arregla, para no perderlo de vista:** hoy `/correduria` **adivina la
compañía por el concepto bancario** y arrastra una fila «Otras» poco fiable. Con la cartera real
cargada deja de adivinar: se cruza cada ingreso contra las pólizas. Es la ganancia concreta del
traspaso para lo que ya existe — pero se hace **después** de que los datos estén dentro y verificados,
no durante.

---

## 🔌 ¿Hace falta montar un MCP o una API para copiar los datos?

**No, y conviene no hacerlo.** Son dos necesidades distintas y cada una ya tiene su herramienta:

**Para MIRAR (inventario, Fase 1) → el MCP de Supabase que Alberto YA tiene.**
No hay que construir nada. El conector de Supabase de Claude lista *todos* los proyectos de la cuenta,
en cualquier organización. Así que basta con que **Manuel invite a Alberto a SU organización de
Supabase** (*Organization → Team → Invite*). En cuanto acepte, el proyecto de Manuel aparece en
`list_projects` y Claude puede hacer `list_tables`, `execute_sql`, `get_advisors`, ver migraciones y
funciones — sin que viaje ninguna contraseña por WhatsApp.

Con rol **Read-only** basta para *mirar*; con **Administrator** (opción A de abajo) además se hace todo
lo demás sin volver a molestarle. Esa es la única diferencia entre las dos opciones.

Es exactamente la dirección segura del favor: **Alberto entra en la organización de Manuel**, no al
revés. Meter a Manuel en la organización de Alberto le daría acceso a `central`, que contiene los datos
de TODO el holding. Y Manuel puede revocarlo con un clic cuando acabemos.

**Para COPIAR (Fase 2) → `pg_dump | psql`, no un MCP ni una API.**
Un conector o un endpoint a medida haría el traslado fila a fila y en JSON: tardaría muchísimo más y
—lo importante— **perdería lo que no son filas**: tipos, índices, claves foráneas, secuencias (los
contadores de los IDs), constraints, triggers, funciones y vistas. Habría que reconstruir todo eso a
mano y descubrir lo que falta en producción. `pg_dump` se lo lleva entero en un solo comando, que es
justo el trabajo que ya está resuelto.

**Una API de sincronización solo tendría sentido si los dos sistemas fueran a convivir** alimentándose
en paralelo durante un tiempo. No es el caso: esto es un corte único: se copia, se verifica, y el
sistema de Manuel se apaga.

Resumiendo: **invitación a su organización para inspeccionar + `pg_dump` para el traslado.** Cero
código nuevo de fontanería.

---

## 🧩 GitHub: el repo externo, y por qué NO se hace igual que Supabase y Vercel

### Estado real del acceso (comprobado, no supuesto)

| Cosa | Estado |
|---|---|
| El repo | **`manuelsuarez/asegura`** en GitHub. **787 commits, 258 ramas**, suite e2e, tickets de Linear (`LOO-xxx`), desplegado en `asegura.vercel.app`. No es un prototipo: es un proyecto con historia |
| Invitación a Alberto | Enviada el **12/08/2026** (correo de `noreply@github.com`) como colaborador. Sin confirmar que esté aceptada — el repo no aparece entre los accesibles (ver «Estado de los tres accesos», 26/08/2026) |
| Acceso de Claude a ese repo | **NO, y no se puede arreglar desde aquí.** La app de Claude solo está instalada en `albertosuarezgutierrez-gif`, y una sesión no admite añadir repos de otro dueño (`add_repo` → *cross-tier adds are not supported*) |

**El rodeo mientras siga bloqueado:** `docs/ASEGURA-PROMPT-CHROME.md` es un prompt listo para que
**Claude Chrome** saque el inventario del repo por el navegador —Alberto sí entra como colaborador— y
lo devuelva aquí. No sustituye al acceso real, pero desbloquea el inventario sin esperar a Manuel.

**Y un dato que falta y decide bastante:** **en qué plataforma se desarrolló** (Lovable / Bolt /
Base44 / Replit / Next.js a mano). Determina si el Supabase es de Manuel o es el que le da la
plataforma, y si el código exportado es directamente usable o hay que reescribir el andamiaje.

### Por qué el código no viaja como repo


Los otros dos activos se **copian**. El código **no se transfiere como repo**: entra como carpeta
`apps/asegura` dentro de `central`. Un repo suelto más sería justo lo contrario de la matriz — ya pasó
con `house-sevillana-landing`, que vivía fuera y por eso era invisible al leer el monorepo.

Y hay una regla dura: **se importa el árbol de trabajo, SIN la historia git.** Precedente del
12/08/2026: la historia de `house-sevillana-landing` contenía una `service_role` de Supabase. Un
`clone` + merge arrastraría toda la historia de Manuel, y **un secreto borrado de un fichero sigue
vivo en los commits antiguos**. Borrarlo después no arregla nada: una clave publicada está quemada
aunque luego borres el repo.

**Qué hacer con su repo original, entonces:** que **lo transfiera a la cuenta de GitHub de Alberto**
(*Settings → Transfer ownership*) y ahí se deja **privado y archivado** como museo consultable — fuera
de `central`, sin contaminar el monorepo.

🚨 **Pero AL FINAL, no al principio:** transferir el repo rompe la conexión git de su proyecto de
Vercel y le tumba el despliegue. Mientras el traspaso no esté verificado, su sistema tiene que seguir
en pie (es la comparación lado a lado de la verificación). Así que primero acceso de LECTURA, y la
transferencia como último paso. Si no quiere o no puede transferirlo (repo dentro de una organización
suya, por ejemplo), se pierde el museo, no el traspaso: a `central` solo entra el árbol de trabajo.

⚠️ Al transferirlo, los secretos de su historia pasan a la cuenta de Alberto. Da igual: se rotan
igualmente (Fase 4) y el repo queda privado y archivado.

**Revisar antes de archivar:** si su repo tiene GitHub Actions o *repository secrets*, no viajan a
`central` (que tiene su propio CI). Comprobar si algún workflow hace algo imprescindible — un deploy,
un cron, una sincronización — antes de darlo por muerto.

---

## 📩 Qué pedirle a Manuel

> ✅ **ENVIADO por WhatsApp el 20/08/2026** (lo envió Alberto). La Fase 0 deja de ser el bloqueo:
> ahora se espera respuesta de Manuel. El texto se conserva abajo tal cual se mandó, como referencia
> de qué se le pidió exactamente.
>
> 📄 **Falta entregarle el documento que le promete el punto 6**: el contrato de encargado de
> tratamiento. Borrador en **`docs/CONTRATO-ENCARGADO-TRATAMIENTO-MANUEL.md`** — pendiente de rellenar
> quién firma como responsable, de revisión por la asesoría, y del visto bueno de Alberto antes de
> enviarlo (regla del repo: ninguna comunicación a terceros sin autorización para ese envío concreto).

### Lo más fácil para Manuel: que dé ACCESO, no que haga TAREAS

Casi todo lo que hay que hacer puede hacerlo Alberto con Claude **si tiene acceso**. Convertir cada
paso en una tarea para Manuel es lo que alarga el traspaso semanas: hay que explicárselo, esperarle,
y si sale mal, repetir. Por eso la **opción A es la recomendada**: son **tres invitaciones y se acabó**.

| | Opción A — tres invitaciones | Opción B — lista de tareas |
|---|---|---|
| Trabajo de Manuel | ~5 minutos, sin tocar SQL | 1-2 horas repartidas en días |
| Idas y venidas | ninguna | una por cada paso |
| Cuándo usarla | por defecto | solo si no quiere dar ese acceso |

---

### ✅ Opción A — recomendada

🚨 **El orden importa: la transferencia del repo va LA ÚLTIMA.** Transferir el repositorio de GitHub
rompe la conexión git de su proyecto de Vercel, así que **le tumba el despliegue en ese momento**. Eso
choca de frente con «no desactives nada hasta que confirme». Así que el repo se pide **al final**, ya
verificado el traspaso; mientras tanto, acceso de lectura y basta.

**Mensaje:**

Hola Manuel:

Vamos a llevar el CRM de la correduría a mi propia infraestructura, para integrarlo con el resto de mis
negocios. Para que no te lleve tiempo, lo más práctico es que me des acceso y lo hago yo:

1. **Supabase** — invítame a tu organización (*Organization → Team → Invite*) con rol
   **Administrator**, a `alberto.suarez.gutierrez@gmail.com`. Con eso saco yo la copia de la base de
   datos sin pedirte nada más. Lo revocas cuando acabemos.
   *(Si en esa organización tienes proyectos de otros clientes, no me invites: dime y lo hacemos de
   otra forma — no necesito ver nada tuyo que no sea esto.)*
2. **GitHub** — añádeme como colaborador con permiso de lectura, para copiarme el código.
3. **Vercel** — invítame a tu equipo, para ver las variables de entorno y la configuración del dominio
   sin que tengas que copiármelas a mano. *(Si tu cuenta es del plan gratuito y no te deja invitar,
   dímelo y me pasas los nombres de las variables; los valores por gestor de contraseñas.)*

Y tres cosas más:

4. **No borres ni desactives nada** — Supabase, Vercel ni el repo — hasta que yo te confirme que está
   todo verificado funcionando en mi lado. Te aviso expresamente.
5. **Al final del todo**, cuando ya te haya confirmado que funciona, transfiéreme el repositorio
   (*Settings → Transfer ownership*). Lo dejo archivado por si algún día hace falta consultar el
   historial. Lo dejo para el final a propósito, porque al transferirlo se te desconecta el despliegue
   de Vercel.
6. **Protección de datos.** Son datos personales de clientes reales, así que necesitamos dejar por
   escrito el contrato de encargado de tratamiento, la fecha de entrega y el borrado posterior de tu
   copia. Te paso el documento.

Si algo de esto no te encaja, dímelo y lo hacemos al revés: me pasas tú las copias y yo te voy pidiendo
lo que falte.

Gracias,
Alberto

**Qué desbloquea cada acceso (lo hace Claude, no Manuel):**

| Acceso | Lo que pasamos a poder hacer solos |
|---|---|
| Supabase Administrator | Crear el rol de lectura · `alter schema public rename to seguros` · lanzar backup · `pg_dump` · ver Edge Functions y sus secrets · listar buckets · comprobar si usa `auth.users` · ver `cron.job`, RLS, funciones y triggers |
| GitHub lectura | El código completo sin depender de un ZIP suelto ni de que él lo prepare |
| Vercel (miembro de equipo) | Leer los **valores** de las variables de entorno, la config del dominio y qué integraciones externas hay cableadas de verdad |
| GitHub transferencia (al final) | El historial, archivado fuera de `central` |

Con eso, **la Fase 1 entera y el inventario dejan de necesitar a Manuel.**

### ⚠️ Tres motivos legítimos por los que puede no poder — y qué hacer

No son excusas; son límites reales. Conviene anticiparlos para no quedarse bloqueado esperando:

| Si… | Por qué | Alternativa |
|---|---|---|
| Su organización de Supabase tiene **proyectos de otros clientes** | Invitar a Alberto como Administrator se los expondría. Es una razón profesional para negarse, no cabezonería | Que mueva **solo este proyecto** a una organización nueva vacía (*Project → Settings → General → Transfer*) y ahí sí invite; o que se quede en la opción B (cadena de lectura) |
| Su **Vercel es plan gratuito** (Hobby) | Las cuentas personales de Vercel no admiten miembros de equipo; invitar exige plan de pago | Que copie la lista de nombres de las variables, y los valores por gestor de contraseñas. Es lo único de la opción B que no se puede evitar |
| El repo está en **una organización de GitHub** suya, o lo quiere para su portfolio | Transferir un repo de una organización necesita permisos de la organización, y puede que no quiera desprenderse de él | Lectura y ya: se copia el árbol de trabajo (que es lo único que entra en `central`) y se renuncia al historial. Se pierde el «museo», no el traspaso |

Regla general: **ninguna de las tres es bloqueante.** Si falla una, se sustituye por su fila de la
opción B y el traspaso sigue.

---

### 🅱️ Opción B — si prefiere no dar ese acceso

Entonces sí hay que pedirle cosas concretas. Es el mismo traspaso, más lento:

1. **Invitación de solo lectura a su organización de Supabase** (lo mínimo, para poder inspeccionar el
   esquema sin contraseñas por mensaje).
2. **Cadena de conexión de lectura** para el volcado (*Settings → Database → Connection string*, modo
   Direct, puerto 5432). Que no dé la de `postgres`; que cree un rol:
   ```sql
   create role traspaso_lectura login password '<una contraseña larga>';
   grant usage on schema public to traspaso_lectura;
   grant select on all tables in schema public to traspaso_lectura;
   grant select on all sequences in schema public to traspaso_lectura;
   ```
   Que la mande por gestor de contraseñas, **no por correo ni WhatsApp**.
3. **Renombrar el schema** justo antes del volcado definitivo, tras lanzar backup desde el panel:
   ```sql
   alter schema public rename to seguros;
   create schema public;
   ```
   Si no quiere tocarlo, lo resolvemos por nuestro lado (Fase 2, plan B).
4. **El código**: acceso de lectura al repo, o un ZIP del árbol de la rama desplegada. **No hace falta
   el historial** para el traspaso; si además quiere cedérselo, la transferencia del repo se pide **al
   final**, nunca ahora (le tumbaría el despliegue de Vercel).
5. **Inventario por escrito de lo que no viaja en un `pg_dump`** — esto es lo caro de su tiempo, y es
   justo lo que la opción A nos deja averiguar solos:
   - **Edge Functions** desplegadas (cuáles, su código, qué *secrets* usan).
   - **Buckets de Storage**: nombres, si son públicos, tamaño aproximado.
   - **Autenticación**: ¿Supabase Auth (`auth.users`) o tabla propia? ¿Cuántos usuarios reales?
     ¿Login con Google / magic link?
   - **Tareas programadas** (`pg_cron`) y **webhooks** configurados.
   - **Integraciones externas**: qué proveedor, qué endpoints, qué credencial y con qué nombre de
     variable de entorno.
   - **Variables de entorno de Vercel**: lista de nombres aquí, **valores por canal aparte**.
   - Dominio propio, si lo hay, y dónde está registrado.
6. **No borrar nada** hasta confirmación, y **contrato de encargado de tratamiento** (igual que en A:
   estos dos puntos no son negociables en ninguna de las dos opciones).

---

### 📝 Mensaje para Manuel — v5 (26/08/2026) — **ENVIADO y ya respondido. Histórico: la versión vigente es la v7**

Quinta versión. **Cambio de vía respecto a la v4:** en vez de que Manuel vuelva a desplegar el
proyecto en el equipo de Alberto, se usa la **transferencia nativa de proyecto de Vercel** y la
**transferencia de proyecto de Supabase**. Es lo de MENOS trabajo para él (dos o tres clics por
plataforma) y lo que MÁS trae: la transferencia de Vercel arrastra las **variables de entorno con sus
valores** y los **dominios**, así que ninguna credencial viaja por WhatsApp, correo ni gestor de
contraseñas. **No se manda hasta que Alberto dé el visto bueno a este envío concreto.**

> Manuel, ya tengo acceso a la base de datos y he estado mirándolo todo. Te escribo para organizar el
> traspaso y, sobre todo, para que dejes de pagar lo que estás pagando.
>
> **Los datos no me los tienes que pasar** y **no montes ninguna API ni ningún conector**: los leo yo
> directamente de Supabase, sería trabajo tuyo para algo que ya funciona.
>
> **Lo que sí quiero es todo lo demás, tal cual está**: la intranet, la web y las dos integraciones
> (Codeoscopic y CIMA). La intranet me gusta como la has dejado y quiero seguir trabajando sobre ella,
> no rehacerla.
>
> Lo he mirado y hay una forma que te lleva tres clics y no te obliga a pasarme ninguna contraseña:
> **transferirme los proyectos**, en vez de volver a montarlos.
>
> 1. Te llega una **invitación a mi equipo de Vercel** (ya lo tengo Pro, no me cuesta más). Acéptala.
> 2. En cada proyecto tuyo: **Settings → Transfer Project → mi equipo**. Eso se lleva el proyecto con
>    **sus variables de entorno y sus dominios**, así que no tienes que escribirme ninguna clave.
> 3. En Supabase, lo mismo: **Project Settings → General → Transfer project** a mi organización.
> 4. Y el repositorio: **Settings → Transfer ownership** a mi cuenta de GitHub. Este déjalo para
>    **después** de mover el proyecto de Vercel, porque al transferirlo se desconecta el Git y lo
>    tengo que reconectar yo.
> 5. Cuando esté todo movido y verificado, **te quito del equipo y cancelas tu Pro**.
>
> Si algún paso no te deja (a veces la transferencia falla si hay recursos atados a tu cuenta), me lo
> dices y lo hacemos por las bravas: me das acceso y lo despliego yo.
>
> Y necesito que me digas cuatro cosas que no están en el código:
>
> - **Cómo se descargan los ficheros de las compañías** (CIMA/EIAC): ¿SFTP, portal, API de TIREA? ¿con
>   qué credenciales y desde dónde se lanza?
> - **Qué proyectos tienes en Vercel** — ¿la web y la intranet van juntas o separadas?
> - **Si guardas ficheros en Vercel Blob** o en algún sitio parecido. En la base veo referencias a
>   documentos pero los ficheros no están en Supabase, y quiero saber dónde viven antes de tocar nada.
> - **Qué dominios tienes puestos** y dónde están registrados.
>
> Dos avisos importantes:
>
> - **No apagues ni borres nada, y avísame antes de hacerlo.** He visto que CIMA descargó ficheros ayer
>   mismo: tu despliegue está alimentando la correduría todos los días, y si se apaga dejamos de
>   recibir pólizas, recibos y siniestros de las compañías. Lo cortamos con fecha y hora, los dos
>   delante.
> - Ese día hay que **cambiar las URLs que tienen apuntadas Codeoscopic y WhatsApp/Meta en sus
>   paneles**, que ahora van a tu despliegue. Eso no viaja en ninguna transferencia.
>
> Y una duda: **la emisión de Codeoscopic, ¿llegó a probarse?** En la base solo veo cotizaciones,
> ninguna póliza emitida por ahí, y las tablas de emisión están vacías.

> 📄 **Pendiente de decisión de Alberto:** si se añade la frase del **contrato de encargado de
> tratamiento**. Que sea su hermano no cambia el RGPD —ha tenido en su infraestructura los datos de
> 32.600 clientes con teléfonos, correos y carnets—, pero es Alberto quien decide si lo formaliza.

### 🪜 Los pasos, en orden, y quién hace cada uno

| # | Quién | Paso | Por qué en este orden |
|---|---|---|---|
| 1 | **Alberto** | Invita a Manuel a su equipo de Vercel Pro (Settings → Members → Invite) | Vercel **solo deja transferir un proyecto a un equipo del que eres miembro**. Sin esto, el paso 2 no aparece |
| 2 | **Manuel** | Acepta la invitación | — |
| 3 | **Manuel** | En cada proyecto: Settings → Transfer Project → equipo de Alberto | Arrastra **env vars con sus valores** y dominios. Es el paso que evita que viaje ninguna credencial |
| 4 | **Manuel** | Supabase: Project Settings → General → Transfer project → organización de Alberto | Deja de ser suyo; migramos al schema `seguros` a nuestro ritmo, sin prisa |
| 5 | **Manuel** | GitHub: Settings → Transfer ownership | **Después del 3**: transferir el repo desconecta el Git del proyecto de Vercel |
| 6 | **Claude** | Reconectar el repo en el proyecto de Vercel ya transferido | Un clic, y vuelve a desplegar solo |
| 7 | **Claude** | Verificar que todo responde con lo de Manuel **todavía encendido** | Nunca se apaga nada sin comprobar antes |
| 8 | **Los dos** | Fecha y hora de corte. Cambiar las URLs en los paneles de **Codeoscopic** y **Meta/WhatsApp** | Es lo único que no viaja en ninguna transferencia |
| 9 | **Alberto** | Quitar a Manuel del equipo → Manuel **cancela su Pro** | El seat solo se ocupa mientras dure el traspaso |

**Si un paso falla** (Vercel a veces bloquea la transferencia si hay Blob u otros recursos atados a la
cuenta origen): se cae a la vía de la v4 —Manuel despliega él mismo en el equipo de Alberto y escribe
él las variables—. No es bloqueante.

---

## 🔍 Adelanto sin Manuel (26/08/2026): RLS y auth eran UNA decisión, no dos

Mientras llega su respuesta se cerraron las tres incógnitas que NO dependían de él. Todo medido,
solo lectura, cero escrituras.

### 1. `central` está preparada para recibir — y el margen es más justo de lo que decía el plan

| Comprobación en `wswbehlcuxqxyinousql` | Resultado |
|---|---|
| `pgvector` instalado | ✅ **sí** (lo exigen las funciones de `whatsapp_kb_chunks`) |
| Schema `seguros` | ✅ existe, **0 tablas** |
| Rol `prisma_seguros` | ✅ existe, `BYPASSRLS = true`, **sin contraseña** (inerte, como estaba documentado) |
| Tamaño actual de `central` | **204 MB** · 280 tablas en `public` |

🔴 **Corrección al veredicto de tamaño.** La sección de arriba estimaba que `central` quedaría en
**~255 MB de 500**; ese número usaba un tamaño de `central` desactualizado. Medido hoy: **204 MB + ~75 MB
del `public` de Manuel ≈ 279 MB**, con ~221 MB de margen. **El veredicto no cambia (free basta), pero el
colchón es la mitad de holgado de lo que parecía** — y `central` crece sola todos los días. Conviene
volver a medir justo antes de restaurar, no fiarse de este número dentro de un mes.

### 2. 🚨 Las 86 políticas RLS y la autenticación son **la misma decisión**

El plan las listaba como dos decisiones independientes. No lo son. De las 86 políticas de `public`:

- **67** filtran por `correduria_id`, **17** por `auth.uid()` — pero las 67 lo hacen a través de
  `get_user_correduria_id()`, y esa función es, literalmente:
  ```sql
  SELECT correduria_id FROM usuarios WHERE auth_user_id = auth.uid()
  ```
  Igual `get_user_role()`. **Las 86 acaban, sin excepción, en `auth.uid()` de Supabase Auth.**

**Consecuencia:** si se re-plataforma la auth al patrón de la casa (cookie propia + `jose` contra la
tabla de cuentas, como `apps/mariscos`), `auth.uid()` devuelve NULL → las dos funciones devuelven NULL
→ **ninguna política concede nada**. Y como `prisma_seguros` tiene `BYPASSRLS`, el efecto real no es
«no se ve nada»: es que **las políticas dejan de ejecutarse y se ve TODO, sin que falle nada**. Los dos
extremos, y ninguno avisa. No se puede migrar el schema y decidir la auth después.

### 3. Y lo que desactiva el drama: **hay UNA sola correduría, y el portal del cliente casi no existe**

| Medida | Valor |
|---|---|
| Corredurías distintas en `usuarios` | **1** |
| Filas en `public.usuarios` | 17 (15 `usuario`, 2 `admin`) |
| …con `auth_user_id` **vivo** en `auth.users` | **9** → **8 fichas apuntan a un usuario de Auth borrado** |
| …y sin embargo `activo = true` | **las 17** |
| Clientes con portal (`clientes.usuario_id` no nulo) | **2 de 32.600** |
| Usuarios de rol `usuario` que llegan a ver algo | **2** (los otros 13 pasan la política y no encuentran cliente) |
| Rol `corredor`, exigido por 45 políticas | **0 usuarios lo tienen** |
| Último login registrado | 12/08/2026 · 5 entradas en 90 días |

**El multi-tenant que sostienen las 86 políticas es futuro, no presente.** Lo único que protegen HOY es
que un cliente con portal no vea las pólizas de otro — y eso son **2 fichas**. Con 9 cuentas vivas, 2 de
ellas administradoras, **re-plataformar la auth es barato y la recomendación se sostiene sola**; lo que
hay que reproducir en el código de `central` no es el andamiaje multi-tenant, es la regla «un cliente
solo ve lo suyo».

⚠️ **Y un aviso que sale de aquí y no es del traspaso:** las 17 fichas dicen `activo = true`, pero 8 de
ellas no pueden entrar porque su usuario de Auth ya no existe. La pantalla de usuarios de esa intranet
está afirmando «activo» sobre gente que no puede acceder — el patrón exacto que prohíbe la regla
«dato que NO hay ≠ dato que NO se ha mirado». Al portarlo, `activo` debe cruzarse con la existencia
real de la credencial, no leerse solo.

**Qué queda pendiente de Manuel (sin cambios):** las cuatro preguntas del mensaje y las transferencias.
Nada de lo de aquí las adelanta ni las sustituye.

## Fase 1 — Inventario y medición (antes de tocar nada)

Con el acceso a su organización (opción A o B), a través del conector de Supabase, desde una sesión
de Claude:

```sql
-- Tamaño real por tabla (los ~200 MB son una estimación sin verificar)
select relname, pg_size_pretty(pg_total_relation_size(c.oid)) as tamano, n_live_tup
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_stat_user_tables s on s.relid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc;
```

Además: extensiones instaladas, políticas RLS, funciones, triggers, `cron.job`, y si hay filas en
`auth.users`.

**Lo que decide esta fase:**
- **Dato vivo vs. grasa** (logs, auditorías, colas, snapshots). De ahí sale el veredicto free vs. Pro
  (25 $/mes) que Alberto dejó abierto. Recordatorio del 19/08: el límite que aprieta de verdad **no es
  el disco, es el egress**.
- **Autenticación.** Si su CRM usa Supabase Auth, hay bifurcación: `central` **no la usa en ninguna
  vertical** — todas autentican contra la tabla `cuentas` con cookie propia + `jose`
  (`apps/mariscos/lib/auth.ts`). Con pocos usuarios reales lo sano es re-plataformar al patrón de la
  casa; con muchos, se migra `auth.users` (las contraseñas sobreviven, las sesiones abiertas no).
  **Es una decisión de Alberto, no se elige sobre la marcha.**

Salida: el inventario se escribe **en este mismo documento**, en una sección nueva al final.

---

## Fase 2 — Migración de la base de datos

Preparación en `central`, como `postgres` (Supabase MCP `apply_migration`):

```sql
create schema if not exists seguros;

-- Rol propio, mínimo privilegio. Molde: apps/almacen/prisma/sql/2026-07-15_almacen_schema.sql
create role prisma_seguros login password '<...>' bypassrls;
grant usage on schema seguros to prisma_seguros;
grant select, insert, update, delete on all tables in schema seguros to prisma_seguros;
grant usage, select on all sequences in schema seguros to prisma_seguros;
alter default privileges in schema seguros
  grant select, insert, update, delete on tables to prisma_seguros;
-- SIN create, y SIN grants sobre `public`.
-- Si sus funciones usan pg_trgm/uuid-ossp: grant usage on schema extensions to prisma_seguros;
```

🚨 **NUNCA conectar la app como `postgres`** (incidente 26/06: resetear esa contraseña tumba a todas
las apps a la vez).

Volcado y restauración, en tubería desde el contenedor de la sesión:

```bash
pg_dump --no-owner --no-acl --schema=seguros \
  "postgresql://traspaso_lectura:<pass>@db.<ref-manuel>.supabase.co:5432/postgres" \
| psql "postgresql://postgres:<pass>@db.wswbehlcuxqxyinousql.supabase.co:5432/postgres"
```

- **Plan B si Manuel no renombra el schema:** volcar su `public`, restaurarlo en un Postgres intermedio
  efímero, `alter schema public rename to seguros;` allí, y re-volcar `-n seguros`.
  🚨 **No usar `sed` sobre `public.` en el dump**: 200 MB de datos reales contienen esa cadena y se
  corrompen filas en silencio.
- **Podar la grasa ANTES de restaurar**, no después: el disco ya estará ocupado y `VACUUM FULL` en
  Supabase no sale gratis.
- Pasada previa con `--section=pre-data` para ver errores de dependencias sin mover 200 MB.
- **El dump NO se commitea nunca.** Son datos personales de clientes.
- **RLS:** Supabase auto-activa RLS en tablas nuevas. `prisma_seguros` tiene `BYPASSRLS`, así que la app
  funciona; cualquier acceso REST/anon verá **0 filas** hasta que existan políticas. Si el código de
  Manuel usa `supabase-js` con la clave `anon`, esto le afecta de lleno.
- **Verificación: contar filas por tabla en origen y destino, la lista completa.** Que el comando no dé
  error no significa que haya migrado todo.

---

## Fase 3 — El código como vertical `apps/asegura`

Molde vivo: `apps/mariscos` (PR #1055). Ficheros obligatorios dentro de `apps/asegura/`:

- `package.json` — deps `@central/*` con **`workspace:*`**, nunca `file:`.
- `vercel.json` — 🚨 **el `ignoreCommand` es obligatorio desde el primer commit.** Sin él, como todos
  los proyectos Vercel cuelgan del MISMO repo, cada push reconstruye TODAS las apps (incidente de
  ~600 US$/mes, PR #904):
  ```json
  {
    "ignoreCommand": "node ../../scripts/vercel-ignore-build.mjs apps/asegura",
    "buildCommand": "prisma generate && next build",
    "installCommand": "npx --yes pnpm@10.33.0 install --no-frozen-lockfile",
    "framework": "nextjs"
  }
  ```
- `next.config.ts` — `transpilePackages` **exactamente igual** a las deps `@central/*` del
  `package.json`, más `outputFileTracingRoot: path.join(__dirname,'..','..')`.
- `tsconfig.json` (`extends ../../tsconfig.base.json`) · `eslint.config.mjs` (sobre
  `../../eslint.config.base.mjs`) · `middleware.ts` con gate de sesión.
- `prisma/schema.prisma` con `schemas = ["seguros","public"]`. Se puede generar con `prisma db pull`
  contra la BD ya migrada en vez de escribirlo a mano.
- `lib/{db,auth,session}.ts` — patrón de `apps/mariscos/lib/`.
  🚨 Secreto de sesión (`ASEGURA_SESSION_SECRET`) **sin fallback a literal**: usar la guarda multilínea
  de `apps/mariscos/lib/auth.ts`, que es la única forma que no dispara `test/regression-secrets.test.ts`.
- `CLAUDE.md` propio — lo exige el guardián `appsSinClaudeMd` (`scripts/auditar-estructura.mjs:397`).

**Importación del código de Manuel:**
- Copia del árbol de trabajo, **sin historia git** — igual que `apps/housesevillana` el 12/08/2026,
  cuya historia contenía una `service_role` de Supabase.
- Antes de commitear, escaneo de secretos sobre lo importado (`eyJ`, `sb_secret_`, `service_role`,
  `sk-`, IBANs). Lo que aparezca **se rota**, no basta con borrarlo del fichero.
- Si usa `supabase-js` con `service_role`, se migra a Prisma con `prisma_seguros` (patrón de la casa).

**Módulo compartido:** si aparece lógica de dominio pura y portable (primas, comisiones, estados de
póliza, vencimientos), baja a `packages/module-seguros` y la app la consume por adaptador, igual que
`apps/ialimp/lib/adapters/crm.ts` implementa el puerto de `packages/module-crm`.

**Registros fuera de `apps/asegura/`** (si falta alguno, la app queda a medias en el sistema — a
`mariscos` todavía le faltan cuatro):

| Fichero | Qué añadir |
|---|---|
| `.github/workflows/tests.yml` (~l.56) | `asegura` en la matriz de `typecheck` |
| `CLAUDE.md` (raíz) | bullet en la lista de verticales |
| `MATRIZ.md` | árbol ASCII (~l.34) **y** tabla de verticales (~l.50) |
| `docs/ESTRUCTURA.md` | fila en la tabla de apps |
| `docs/FUENTES-DE-VERDAD.md` | `apps/asegura/CLAUDE.md` → `apps/asegura/**` |
| `apps/plataforma/lib/estructura.ts` | entrada en el array `VERTICALES` |
| `.claude/skills/central-maestro/SKILL.md` | fila de enrutado + mención en el bloque de BD/roles |
| `.claude/skills/asegura-maestro/SKILL.md` | skill router de la vertical (nueva) |
| `docs/CONTEXTO-SESIONES.md` | entrada de la sesión |
| — | regenerar con `pnpm auditar` |

`pnpm-workspace.yaml`, `.vercelignore` y `scripts/vercel-ignore-build.mjs` **no se tocan**.

---

## Fase 4 — Vercel y proveedores externos

1. Proyecto nuevo en `pisos-turisticos-projects`, **Root Directory `apps/asegura`**, install
   `npx --yes pnpm@10.33.0 install --no-frozen-lockfile`.
2. Envs: `DATABASE_URL` / `DIRECT_URL` por el pooler con el rol propio
   (`prisma_seguros.wswbehlcuxqxyinousql@aws-0-eu-west-1.pooler.supabase.com`, 6543 pooled
   `?pgbouncer=true` / 5432 directa), `ASEGURA_SESSION_SECRET`, y una por integración externa.
3. **Rotar todas las credenciales de proveedores.** Han vivido en la cuenta y el historial de Manuel;
   el traspaso es el momento natural de cambiarlas. Donde el proveedor permita cuenta propia, dar de
   alta la de Alberto en vez de heredar la de Manuel.
4. Lo que sea idéntico a otras verticales va como **Shared Environment Variable de equipo**, no
   duplicado en el proyecto.
5. **Edge Functions**: redesplegar en `central` con sus secrets — no viajan en el `pg_dump`. Igual con
   `pg_cron` y `pg_net` (ambas extensiones ya están).
6. **Storage**: copiar buckets aparte y recrear políticas.
7. Dominio: apuntarlo cuando el despliegue esté verde.

---

## Verificación (antes de dar el traspaso por hecho)

1. **Datos**: recuento de filas por tabla origen vs. `seguros.*`, lista completa. Checksums de las
   tablas críticas (clientes, pólizas).
2. **Conexión real de la app**: `psql` con la cadena de `prisma_seguros` sobre el pooler y
   `select count(*)` en tres tablas. Tiene que funcionar **sin** ser `postgres`.
3. **Repo**: `pnpm test` (guardianes de secretos, scope `@central/*`, estructura generada,
   `vercel-ignore-build`), `pnpm auditar:check`, y el `typecheck` de la matriz para `asegura`.
4. **Build**: preview de Vercel en verde desde `apps/asegura`, y comprobar que un commit que solo toca
   `apps/asegura/` **no** dispara builds de las otras apps.
5. **Funcional**: login, alta de póliza y **una llamada real a cada integración externa** con las
   credenciales rotadas. Una integración que no se ha probado no está migrada, está sin comprobar.
6. **Comparación lado a lado**: la app de Manuel todavía viva junto a la nueva, misma consulta en
   ambas, mismo resultado. **Solo entonces** se le da luz verde para borrar.

---

## Orden de ejecución

```
0. Mensaje a Manuel                 → ✅ enviado 20/08/2026    [esperando su respuesta]
1. Inventario + medición            → sección nueva en este doc + decisión free/Pro
2. Schema `seguros` + rol + volcado → datos dentro de `central`
3. apps/asegura + registros + skill → PR draft
4. Proyecto Vercel + envs rotadas   → preview verde
5. Verificación end-to-end          → luz verde a Manuel
6. Transferencia del repo + archivo → lo ÚLTIMO (le corta el despliegue)
```

**Lo que bloquea hoy es la respuesta de Manuel**, no el mensaje. Lo único que se puede adelantar sin
él es el inventario del repo por Claude Chrome (`docs/ASEGURA-PROMPT-CHROME.md`) y el contrato de
encargado de tratamiento (`docs/CONTRATO-ENCARGADO-TRATAMIENTO-MANUEL.md`).

Las fases 1 y 3 pueden solaparse en cuanto haya acceso. La 2 necesita el volcado definitivo; la 4
necesita la 2 y la 3. **La 6 va después de la 5, siempre**: mientras el traspaso no esté verificado,
su sistema tiene que seguir en pie para la comparación lado a lado.

---

## Riesgos y cobertura

| Riesgo | Cobertura |
|---|---|
| Secretos en el código o la historia de Manuel | Import sin historia + escaneo + **rotación** de lo encontrado |
| Superar el free de Supabase (500 MB) | Medir en Fase 1 y podar antes de restaurar; si no cuadra, Pro |
| Egress, el límite que aprieta de verdad | Vigilar tras el corte; no depende del disco |
| La app escribiendo en `public` por error | `prisma_seguros` sin `CREATE` y sin grants sobre `public` |
| RLS auto-activada dejando pantallas a 0 filas | `BYPASSRLS` en el rol + comprobar cualquier acceso REST/anon |
| Datos personales de clientes (posible art. 9 RGPD) | Contrato de encargado de tratamiento; el dump nunca se commitea |
| Manuel borra su proyecto antes de tiempo | Punto 5 explícito en el mensaje |
| Reconstrucción de las ~10 apps en cada push | `ignoreCommand` desde el primer commit |

---

## 🔑 Qué acceso a Supabase tenemos YA, y para qué NO sirve (26/08/2026)

Comprobado, no supuesto: el conector entra en el proyecto de Manuel
(`uijsgeocgdaxkhvwtjqs`, «ASEGURA-prod-eu», región `eu-central-1`) y `select current_user` devuelve
**`supabase_read_only_user`**. Es decir: **acceso de SOLO LECTURA**.

> ⚠️ **El volcado NO está hecho — no confundirlo con el inventario.** Lo que se hizo el 26/08 fueron
> **recuentos** (`count(*)` por tabla). **No se ha copiado ni un dato**: no existe ningún `.sql` ni
> `.dump` de la correduría, ni en disco ni en la historia del repo (comprobado). El dump sigue
> necesitando cadena de conexión y contraseña, que este acceso no da.

| Sirve para | NO sirve para |
|---|---|
| Todo el inventario y los recuentos (ya hecho) | **Transferir el proyecto**: eso es gestión de organización, no SQL. ⚠️ Lo que ya NO se sostiene es el «hace falta que Manuel invite a Alberto»: **ya está invitado y dentro** (org `PISO`). Queda por comprobar si desde ahí ya puede recibirse el traspaso o si hace falta que Manuel le suba el rol — **no darlo por sabido** |
| Comprobar el estado de CIMA día a día | **Hacer el dump**: `pg_dump` necesita la cadena de conexión y su contraseña, que el conector no da |
| Verificar después del traspaso que **se encuentra** un cliente por email/DNI (la prueba del índice ciego) | **Descifrar** un IBAN: eso lo hace la app con su clave, no una consulta SQL |
| Resolver dudas sin molestar a Manuel — como la de abajo | Escribir nada. Es de solo lectura, punto |

### ✅ Resuelto sin preguntar: su organización es **LOOR**, plan **FREE**

La pregunta «¿free o de pago?» del Mensaje 1 **ya no hace falta**: `get_organization` la contesta.
Ambas organizaciones —la suya (`LOOR`) y la de Alberto (`fzagbwkkzfjlsvflkkvn`)— están en **free**, así
que el traspaso va de free a free, que es el caso simple. Queda igualmente comprobar el día antes que
la organización de Alberto admite un **segundo** proyecto activo; si no, plan B es restaurar el dump.

### 📅 De paso: los huecos de CIMA son NORMALES, no una avería

Al mirarlo salió que el último fichero sigue siendo del **25/08** y hoy es 26. Antes de leer eso como
un fallo, se miró la serie: `21/08 · 22 · 23 · 24 · 25` seguidos, pero antes **19 y 20 en blanco**, y
un hueco de **06 al 15**. Las compañías no mandan todos los días. **Un día sin fichero no dice nada**;
lo que diría algo es una racha larga justo después de tocar el `CRON_SECRET`.


---

## 📬 ESTADO REAL DE LOS ACCESOS (26/08/2026, comprobado en el correo de Alberto)

> 📧 **La cuenta de Manuel para TODAS las invitaciones: `manuelsuarezz@gmail.com`** (con doble `z`).
> Dato de Alberto, 26/08/2026. Vale para Vercel, Supabase, Fly y GitHub.
>
> ⚠️ **`manuelsuarez` (una sola `z`) NO es una dirección de correo: es su USUARIO de Supabase.**
> Aparece así en el asunto de la invitación («manuelsuarez has invited you…») y en el cuerpo («This
> organization is owned by manuelsuarez»). Este documento llegó a citar ese asunto como si fuera
> evidencia de una dirección, y eso paró en seco una invitación de pago el 26/08/2026 — con razón.
> **Lección: un identificador de plataforma no es un correo.** Antes de dar acceso a algo que factura,
> la dirección se confirma contra el campo `To:`/`Members`, nunca contra un nombre para mostrar.

| Sistema | Estado | Evidencia |
|---|---|---|
| **Supabase** | ✅ **YA ACEPTADA Y DENTRO** — aparece en el panel como **`PISO`**, no como «LOOR» | `get_project("uijsgeocgdaxkhvwtjqs")` → `organization_id: qdrmgpvqhcmhmpcrvtan`, la organización de la invitación. Lectura viva confirmada: 32.600 clientes / 28.843 pólizas. El enlace del correo daba un muro de login porque **el token ya estaba consumido** |
| **Fly.io** | ✅ **Invitado y dentro** | `noreply@email.fly.io`, «Manuel Suárez wants you to join Manuel Suárez», hoy **13:29** + cuenta de Alberto creada a las 13:29-13:30 |
| **GitHub** | ❌ **No ha llegado nada** | Sin correo de invitación a colaborar, ni hoy ni en 7 días |
| **Vercel** | ❌ Sin invitación — Manuel dice que **«hay que pagar»** | — |

### 🔑 Vercel NO está bloqueado: la transferencia va **por código**, no por pertenencia

Se pidió mal, y luego se razonó mal dos veces seguidas. Queda la versión buena:

1. ~~«Manuel invita a Alberto a su equipo»~~ — solo servía para leer las env vars **antes** del
   traspaso. Y cuesta un asiento, de ahí su «hay que pagar».
2. ~~«Entonces al revés: Alberto invita a Manuel a SU equipo»~~ — **también falso**, y también
   costaría un asiento.
3. ⚠️ **«Va por código, no por pertenencia»** — cierto **de la API**, pero **NO de la pantalla**. La
   captura de Manuel (26/08, 15:36) lo zanja: su diálogo *Transfer Project To* solo lista **equipos a
   los que él pertenece**, y como no pertenece a ninguno, la única opción que le sale es *Create Team*.
   **Las dos vías existen y hay que elegir una:**

**Vía A — la del panel (la que él está usando):** requiere que Manuel sea miembro de un equipo de
Alberto. **No hay que crear ningún trial**: Alberto **ya tiene equipo**, `pisos-turisticos-projects`,
en plan **Pro**. Basta invitarle ahí y le aparecerá en el desplegable.
- ⚠️ **Mirar el coste en el propio diálogo de invitación antes de confirmar** — Vercel Pro factura por
  asiento y lo dice ahí. Hay roles distintos (existe `VIEWER`) y no todos ocupan asiento facturable,
  pero **eso lo dice la pantalla, no este documento**.
- 🔴 **Y sacarle del equipo en cuanto el traspaso esté hecho.** Si se queda, el asiento **sigue
  facturando mes tras mes sin que nadie avise** — el mismo goteo silencioso del incidente de los
  ~600 US$ en builds (PR #904).

**Vía B — la de la API (coste cero, si la A cobra):**
   - Manuel, en su equipo: `POST /projects/{idOrName}/transfer-request` → Vercel devuelve un
     **`code` válido 24 h**.
   - Alberto, en el suyo: `PUT /projects/transfer-request/{code}` con su `teamId`.

   **Ninguno de los dos entra en la cuenta del otro y no se añade ningún asiento a nadie.**
   (Fuente: docs de la REST API de Vercel, *create/accept project transfer request*.)

**Lo que esto cambia en el plan:** las **dos claves de cifrado** ya no se le piden a Manuel por
adelantado — Alberto las lee **él solo, después del traspaso**, porque los valores de las env vars
viajan con el proyecto. Y es seguro precisamente porque **Manuel no borra nada**: su proyecto sigue
en pie como copia viva hasta que él lo retire. Una cosa menos en la lista de Manuel.

**Lo único que sigue pendiente de él: la invitación de GitHub** (colaborador en los dos repos), que
es gratis y no ha llegado.

#### 🔎 Dos comprobaciones del 26/08/2026 que desmontan dos atajos

Ambas salieron de una revisión desde el navegador que **se negó a pulsar botones sobre premisas sin
verificar**. Las dos objeciones eran correctas; las dos premisas, mías.

> # 🟢 26/08/2026 — CIERRE: NO HABÍA NINGÚN PROBLEMA. La invitación ya estaba aceptada.
>
> Todo lo que sigue en esta sección se investigó **sobre un problema inexistente**. El hecho, ahora
> comprobado tres veces: `get_project("uijsgeocgdaxkhvwtjqs")` devuelve
> `organization_id: qdrmgpvqhcmhmpcrvtan`, **la misma organización** que el correo de invitación
> llamaba `LOOR` y que **el panel de Alberto muestra como `PISO`** — la que la revisión desde el
> navegador vio («PISO, plan gratuito, 1 proyecto») y descartó por suponerla suya. **Ese único
> proyecto es el CRM de Manuel.** Alberto ya era miembro; el enlace caía en un muro de login porque
> **el token ya estaba consumido**, no porque fallara nada.
>
> **La lección, y es la más cara del día:** este mismo documento ya decía, escrito esta mañana unas
> 1.500 líneas más arriba, *«organización `qdrmgpvqhcmhmpcrvtan` (el panel la muestra como `PISO`, el
> correo de invitación la llamaba `LOOR`)»*. **El dato que cerraba el caso estaba en el sitio donde se
> estaba escribiendo la investigación.** Se produjeron tres explicaciones nuevas, se mandó al navegador
> a buscar un nombre que el panel no muestra y se le pasó un enlace ya gastado. Antes de explicar por
> qué algo no aparece, **releer lo que ya se sabía de ese mismo algo**; y desconfiar en especial cuando
> un sistema tiene **dos nombres para la misma cosa** (aquí: `LOOR` en el correo y en la API, `PISO` en
> el panel), porque entonces «no lo encuentro» es casi siempre un problema de nombre, no de acceso.
>
> Lo que sigue queda como registro de las correcciones intermedias, que eran válidas cada una en su
> momento. **Ninguna acción pendiente sale de aquí:** no hay que aceptar nada, ni pedirle a Manuel
> nada de Supabase.

**1. ~~Una invitación de Supabase NO se ve en el panel.~~ — RETIRADO, era otra suposición mía.**
Se dijo que Supabase no lista invitaciones pendientes y que por eso el panel no mostraba nada. **No
puedo sostenerlo.** El contraargumento es mejor: si la invitación fuera válida y estuviera dirigida a
la cuenta con sesión abierta, el enlace mostraría una tarjeta *Join organization*; lo que muestra es
un **muro de «Sign in or create an account»** con la sesión de Alberto demostrablemente activa
(misma pestaña, mismo minuto, `/dashboard/organizations` cargando bien justo antes). **Ese muro es la
señal de fallo, no una peculiaridad de la interfaz.**

**2. ~~«Verificado por API: LOOR es free, luego aceptar no cuesta nada».~~ — El dato es cierto; la
conclusión que colgué de él, no.** `get_organization("qdrmgpvqhcmhmpcrvtan")` sí devuelve
`{"name":"LOOR","plan":"free"}` — **pero `list_projects` con ese mismo conector no devuelve ni un
solo proyecto de LOOR**, solo el de la organización de Alberto. Es decir: **el conector NO es miembro
de LOOR y aun así el endpoint contesta.** Ese endpoint responde sobre organizaciones ajenas, así que
prueba que LOOR existe y en qué plan está — **no** que la invitación siga viva, ni que Alberto tenga
acceso. Se presentó como si cerrara el asunto y no lo cerraba.

**3. El conector y el navegador NO están mirando la misma cuenta.** El conector de Supabase de la
sesión ve **una** organización de Alberto; su navegador ve **dos** (la suya y `PISO`). Mientras eso
siga así, **ninguna consulta por API sirve para dictaminar lo que Alberto ve en su sesión**: contesta
desde otra identidad. Es la trampa más fina de las tres, porque la API responde con seguridad y suena
a verificación.

**Hipótesis viva, NO comprobable desde aquí:** Gmail entrega igual `alberto.suarez.gutierrez@`,
`albertosuarezgutierrez@` (sin puntos) y `…+sufijo@`, pero **Supabase compara la cadena exacta**. Si
la invitación se emitió contra una variante, el correo llega y el token queda atado a una dirección
que la cuenta no reconoce — exactamente el síntoma observado. El conector de Gmail devuelve el
destinatario ya normalizado y no da acceso a las cabeceras crudas, así que **no se puede confirmar ni
descartar desde el repo**: lo resuelve Manuel leyendo el destinatario en su panel.

**Lo que hay que hacer, y por qué no es «insistir con el enlace»:** el enlace no distingue entre
«token consumido», «token emitido a otra dirección» y «invitación revocada» — las tres caen en el
mismo muro de login. La única fuente que las separa está **en el lado de Manuel**: LOOR → Settings →
Members, la dirección EXACTA de la invitación pendiente y su estado. Eso convierte tres hipótesis en
un hecho, y él la reenvía en el acto.

#### 🖥️ Vercel: por qué NO se invita a Manuel al equipo Pro (decisión del 26/08/2026)

La Vía A queda **descartada como primera opción**, con dos datos nuevos leídos en la pantalla real:

- **El formulario de invitación no dice lo que cuesta.** Ni precio, ni aviso de asiento, ni
  confirmación de cargo: pulsar *Invitar* añade el asiento **sin enseñar antes el importe**. El único
  precio visible en esa pantalla es el de un interruptor no relacionado (alta automática de
  colaboradores de repos privados, **$20/mes por usuario**, apagado).
- **`Viewer` —el único rol etiquetado «Gratis»— no sirve.** Es de solo lectura: no puede recibir ni
  ejecutar un traspaso de proyecto. Invitarle gratis como Viewer obligaría a subirlo a `Member` y
  pagar el asiento igual, habiendo perdido una vuelta.

El asiento de `Member` sale por **20 US$/mes** (encaja con la factura: crédito 20,00/20,00 + 4,57 de
on-demand = próxima 24,57 US$). Son 20 US$/mes recurrentes por **diez minutos** de traspaso, y el
riesgo real no es el primer mes: es **olvidarse de quitarlo** — el mismo goteo silencioso del
incidente de los ~600 US$ en builds (PR #904).

🚫 **La «ruta inversa» (que Manuel invite a Alberto a SU equipo) no existe.** Se propuso, y es un buen
reflejo, pero **Manuel no tiene equipo**: su diálogo *Transfer Project To* solo ofrecía *Create Team*,
que es lo que ocurre en una **cuenta Hobby personal**, y una Hobby **no tiene miembros que invitar**.
De ahí su «me pide crear un team y entonces pagar». No hay a dónde invitar a nadie.

✅ **Queda la Vía B (API)**, que es justo la que no necesita equipo, ni asiento, ni que ninguno de los
dos entre en la cuenta del otro. Y si fallara, **no se ha pagado nada por intentarlo** — el orden
correcto es probar lo gratuito antes que lo recurrente.

#### 📋 Vía B, escrita entera para copiar y pegar (26/08/2026)

Se deja preparada **antes** de saber lo que cuesta el asiento, para que el día que se elija no haya
que investigar nada. Es la vía que **menos trabajo le da a Manuel**: dos comandos, ninguno en la
cuenta del otro.

**Paso 1 — lo hace Manuel** (necesita un token suyo: Vercel → Account Settings → Tokens → *Create*,
scope = su cuenta personal; el token es **suyo y no se comparte con nadie**):

```bash
# Repetir para cada proyecto: "asegura" (app) y el del adaptador CIMA, si también está en Vercel.
curl -X POST "https://api.vercel.com/v1/projects/asegura/transfer-request" \
  -H "Authorization: Bearer $VERCEL_TOKEN_MANUEL"
```

Devuelve un JSON con un **`code`**. Ese código **caduca a las 24 h** y es lo único que Manuel pasa a
Alberto (no es un secreto permanente: solo autoriza ese traspaso concreto). Si caduca, se repite el
paso 1 y ya está.

**Paso 2 — lo hace Alberto**, con un token de SU cuenta y el `teamId` de su equipo
`pisos-turisticos-projects`:

```bash
curl -X PUT "https://api.vercel.com/v1/projects/transfer-request/<CODE>" \
  -H "Authorization: Bearer $VERCEL_TOKEN_ALBERTO" \
  -H "Content-Type: application/json" \
  -d '{"teamId":"team_f4gPpt6dPuNcd5YyMt3q27uf"}'
```

⚠️ **Lo que hay que comprobar después, no dar por hecho:** que las **env vars llegaron con valor** y
no vacías, y que el **dominio** sigue apuntando al proyecto. Se mira en el panel del proyecto ya bajo
`pisos-turisticos-projects` (Settings → Environment Variables / Domains). Si algo llegó vacío,
**avisar antes de tocar nada** — el proyecto de Manuel sigue en pie como copia viva.

🔴 **En cuanto el proyecto esté dentro, añadirle su `ignoreCommand`** como a todas las apps del
monorepo (`node ../../scripts/vercel-ignore-build.mjs apps/asegura`), o cada push al monorepo se
pondrá a construirlo. Es la regla de `CLAUDE.md` y es la que costó ~600 US$ una vez.


---

# 🟢 26/08/2026 (noche) — GITHUB CERRADO Y FLY LISTO. Solo queda cuadrar el rato

## Lo que respondió Manuel

> «En el de la app ya estabas desde hace tiempo. En el del adaptador de CIMA te acabo de mandar la
> invitación. Es `asegura-app-cima-adapter`, el sidecar Java que envuelve el JAR de TIREA; ese es el
> que hay que mover a tu Fly para que siga entrando la cartera. Con esto los repos quedan resueltos.
> Sigue pendiente que me metas en tu org de Fly y que fijemos día y hora del cutover.»

## Estado verificado esta noche

| Sistema | Estado | Cómo se comprobó |
|---|---|---|
| **GitHub — app** | ✅ Alberto ya era colaborador de antes | Manuel |
| **GitHub — adaptador CIMA** | ✅ **invitación aceptada** | Repo **privado** renderizando contenido en su móvil |
| **Supabase** | ⚠️ **DENTRO, no transferido** | Es miembro de la org (`PISO`). La propiedad del proyecto sigue siendo de Manuel |
| **Fly — org de Manuel** | ✅ dentro | 26/08 |
| **Fly — destino** | ✅ **ya existe: la org `Personal` de Alberto, slug `alberto-suarez-83`** (vacía, 0 apps, pago por uso, sin aviso de pago) | Panel, 27/08 |
| **Vercel** | ❌ pendiente — Vía B (API) el día del corte | — |
| **`CRON_SECRET`** | ❌ pendiente — **no viaja con la transferencia del repo** | — |

🔴 **CORREGIDO el 27/08 — la suposición estaba INVERTIDA.** Este documento llegó a decir que
Alberto «creó su organización de Fly e invitó a Manuel». **Es falso, y venía de darlo por bueno sin
mirar el panel.** Lo que hay:

- **`Personal`** (slug `alberto-suarez-83`): 1 miembro (solo Alberto), 0 apps. Nunca se invitó a nadie.
- **`Manuel Suárez`** (slug `manuel-suarez-678`): 2 miembros — Manuel como **administrador** y Alberto
  como **miembro normal**. Ninguno pendiente: los dos activos. **Ahí vive la app del adaptador**
  (2 máquinas, región CDG).

O sea: **la invitación fue en sentido contrario** — Manuel metió a Alberto en la suya. No hay
invitación pendiente que mandar ni nombre de org que comunicarle: **el acceso mutuo ya está resuelto**.
Y no hace falta crear ninguna organización: el destino de la transferencia puede ser `Personal`, que
ya existe y está limpia.

## 💳 Fly cuesta dinero, y por qué la tarjeta no era opcional

Fly **eliminó los planes Hobby/Launch/Scale en octubre de 2024** y va a **pago por uso puro**: sin
cuota fija, sin mínimo mensual, y **sin tier gratis útil** para cuentas nuevas. La tarjeta no la pide
para crear la organización — la pide **para que corra una app**, y recibir el adaptador transferido
es exactamente eso.

Orden de magnitud: una `shared-cpu-1x` de 512 MB ronda **3,19 US$/mes**. ⚠️ Ese número sale de la
documentación de Fly pero **puede ser de 2024-25**: su página de precios está bloqueada por el proxy
de egress, así que **no está leído de primera mano**. El dato bueno no está en ninguna página de
precios: **Manuel ya lo paga hoy**, y su factura dice la cifra real. Dos variables que solo él sabe:
cuánta RAM tiene puesta (es JVM, 512 MB se le puede quedar corto) y si la máquina se apaga sola entre
las pasadas de las 5:30 y 11:30 o está encendida 24 h.

## 🆕 Hay ADRs que pedir, y no estaban en la lista

La descripción del repo del adaptador cita **«Per ADR-007 + ADR-009»** y un ticket **`LOO-138`**.
Manuel lleva registros de decisiones de arquitectura en algún sitio que **no es el repo**. Eso es
documentación heredable y vale más que el código el día que haya que tocar la integración con TIREA:
explica *por qué* está montado así. **Pedírsela.**

(El prefijo `LOO-` probablemente explique el nombre «LOOR» de la organización de Supabase que costó
una tarde entera — sería su nomenclatura de tickets, no nada de Alberto. **Inferencia, no
comprobado.**)

## ⚙️ Límite de sesión que hay que saber ANTES del corte

Una sesión de Claude arrancada sobre `central` **no puede añadir el repo de Manuel**: devuelve
`cross-tier adds are not supported in v1` porque ya tiene fuentes de otro propietario. Para leer,
portar o revisar el adaptador hay que **abrir una sesión nueva con `manuelsuarez/asegura-app-cima-adapter`
como fuente inicial**. Descubrirlo el día del corte cuesta la tarde.

## 🗓️ Sobre «fijemos día y hora»

No es contradicción con lo establecido esta mañana, es un matiz: **no hace falta ventana de
mantenimiento** —el CRM no lo usa nadie y los ficheros EIAC se re-descargan— pero el movimiento de
Fly y la transferencia de Supabase **sí piden que estén los dos a la vez** un par de horas. Quedar
sí; reloj de mantenimiento no.

---

## 🔴 27/08/2026 — RIESGO VIVO: la facturación de la org de Fly de Manuel está VENCIDA

Encontrado al verificar el punto anterior. En el panel de Fly, la organización **`manuel-suarez-678`**
—la que aloja `asegura-app-cima-adaptador`— muestra:

- Banner rojo: *«El pago de su organización está vencido. Visite la página de facturación de su
  organización para obtener más detalles»*.
- Etiqueta **«Vencido»** en el selector de organizaciones.

**Por qué importa más que todo lo demás de este documento ahora mismo:** si Fly suspende las máquinas
por impago, **el adaptador se cae y deja de entrar la cartera de las compañías** — y falla en
silencio, que es el modo de fallo que este traspaso lleva semanas intentando evitar. No es un riesgo
del corte: es un riesgo de **hoy**, con el sistema todavía en manos de Manuel.

**No lo puede arreglar Alberto.** Es la organización de Manuel y él es solo miembro normal, no
administrador: la factura se paga con la tarjeta de Manuel. Lo único que puede hacer Alberto es
avisarle, y hacerlo pronto.

⚠️ **Sin comprobar:** cuántos días lleva vencida y si la suspensión es inminente. Que la app siga con
sus 2 máquinas desplegadas sugiere que aún no se ha suspendido, **pero es una inferencia, no un dato**:
está en la página de facturación de esa organización, que no se ha abierto.

### Lo que esto cambia en el plan

1. **Sube al primer puesto:** avisar a Manuel de la factura vencida, por delante de cuadrar la fecha.
2. **Refuerza el argumento de mover el adaptador pronto.** Mientras viva en una org con la
   facturación vencida, la entrada de la cartera depende de que otro pague a tiempo.
3. **Posible atajo a comprobar:** Alberto es miembro de las DOS organizaciones (`manuel-suarez-678` y
   `alberto-suarez-83`), así que quizá pueda mover la app él mismo sin esperar a Manuel.
   ⚠️ **No verificado:** mover una app entre orgs puede exigir rol de **administrador en la de origen**,
   y en la de Manuel él es miembro normal. Se comprueba antes de prometerlo.

### 💶 El coste real del adaptador, ya no estimado (factura de julio 2026)

Factura **RTAKOYRK-0003** de Fly.io a `manuelsuarezz@gmail.com`, periodo 1–31 de julio de 2026:

| Concepto | Importe |
|---|---|
| Pay-as-you-go Plan | 0,00 US$ |
| Machines Shared CPU 1x (cdg) | 2,28 US$ |
| **Machines Shared 1x: Additional RAM (cdg)** | **4,40 US$** |
| Bandwidth egress (arn + cdg) | 0,00 US$ |
| **TOTAL** | **6,68 US$** (5,96 €, a 1 USD = 0,8925 EUR) |

Esto **sustituye la estimación de ~3,19 US$/mes** que este documento marcaba como no verificada. El dato
bueno estaba donde se dijo que estaría: en la factura de Manuel.

**Lo caro es la RAM, no la CPU** — coherente con que sea una JVM. Y responde dos de las tres preguntas
que se le iban a hacer:

- **La máquina NO se apaga entre pasadas.** La cantidad facturada de CPU son **2.678.393 s** y un mes de
  31 días son 2.678.400 s: está encendida **24/7**, sin `auto_stop`.
- **RAM:** ~0,75 GB de RAM adicional (2.008.794,75 GB·s / 2.678.400 s). Probablemente **1 GB en total**
  contando la incluida. ⚠️ **Inferencia**, la factura no lo dice.

**Consecuencia para el traspaso:** asumir el adaptador cuesta **unos 6 US$ al mes**. La decisión de
moverlo no es económica.

### ✅ 27/08/2026 — Alberto PAGÓ la factura de julio

Liquidada la **RTAKOYRK-0003** (5,96 €) desde la página de pago pública, con tarjeta propia. Con eso
**el adaptador deja de estar en riesgo de suspensión por el impago de julio** y la cartera sigue
entrando mientras se organiza el traspaso.

⚠️ **Lo que esto NO resuelve, y hay que decirlo aunque el banner rojo desaparezca:** el medio de pago
de la organización `manuel-suarez-678` **sigue siendo el de Manuel**. La factura de agosto vencerá
igual. Esto compra un mes, no cierra nada. Y a Manuel **se le dice** — le aparece en su cuenta un
pago que él no hizo.

⚠️ **Pagar esta factura NO arregla el problema de fondo.** La página de pago es pública (Google Pay o
tarjeta, sin login), así que Alberto puede liquidarla — y con 5,96 € compra tiempo para hacer el
traspaso con calma. Pero el medio de pago de la organización sigue siendo el de Manuel: al mes
siguiente vuelve a vencer. Lo único que lo cierra es mover la app. Y si se paga, **se le dice**: le
aparecerá en su cuenta un pago que él no hizo.

---

# 🗺️ 27/08/2026 — PLAN POR FASES (decisión de Alberto: CIMA al final)

Alberto fija el orden: **CIMA se deja para lo último.** Su razón, en sus palabras: *«hay cosas más
interesantes que hace CIMA»* y el adaptador es *«un desarrollo un poco más avanzado o diferenciado»*.
Es una decisión correcta y además barata de sostener: el pull de CIMA sigue corriendo en el despliegue
de Manuel mientras tanto, y los ficheros de EIAC se re-descargan cuando se quiera.

El objetivo del troceado no es técnico, es de proceso: **que Manuel nos vaya pasando la información
fase por fase**, en trozos pequeños que pueda contestar en un rato, en vez de un volcado único que se
queda a medias.

## El negocio, dicho por Alberto (27/08/2026)

- **La correduría es suya.** No hay socio ni tercero. Clave de mediador **CS-F/0170**.
- **Se opera prácticamente todo online.** Los clientes son online.
- **La intranet que hizo Manuel tiene dos caras:** el **portal del cliente** (el asegurado ve lo suyo)
  y la **gestión interna** (Alberto trabaja su cartera). Las dos se aprovechan; no se rehacen.
- **La VENTA (cotizar y emitir) va por Codeoscopic**, el multitarificador.
- **El BACK OFFICE con las compañías —siniestros, recibos, comisiones— va por CIMA.** Esto es lo que
  se deja para el final.

Esa frontera **venta = Codeoscopic / back office = CIMA** es la que ordena las fases. No son dos
integraciones intercambiables: la primera es sincrónica y de cara al cliente, la segunda es un lote
nocturno que rellena la base.

## 🔴 Punto de partida, VERIFICADO hoy — la base de datos NO está volcada

Alberto dio por hecho que *«la Supabase ya está creada, toda la base de datos volcada»*. **La primera
mitad es cierta; la segunda no.** Consultado el Postgres compartido `wswbehlcuxqxyinousql` el
27/08/2026:

| Schema | Tablas |
|---|---:|
| `public` | 281 |
| `iarest` | 252 |
| `rrhh` | 17 |
| **`seguros`** | **0** |

El schema existe y el rol `prisma_seguros` está creado (e inerte, sin contraseña), pero **no hay ni una
tabla dentro**. Los 32.600 clientes y las 28.843 pólizas siguen íntegramente en el Supabase de Manuel.
Lo que está hecho son los cimientos vacíos de
`apps/asegura/prisma/sql/2026-08-19_asegura_bootstrap.sql`, nada más.

Esto no es un matiz: **la Fase 0 entera consiste en cerrar ese hueco**, y planificar por encima de él
daría un calendario falso.

## Las cinco fases

| Fase | Qué se consigue | Depende de Manuel | Se puede empezar |
|---|---|---|---|
| **0 · Cimientos** | El dump vive en el schema `seguros` y `apps/asegura` se conecta | 🔴 Sí, bloqueante | Ya |
| **1 · Cartera en lectura** | Alberto ve sus clientes, pólizas y vencimientos en `central` | 🟡 Poco | Al cerrar la 0 |
| **2 · Portal del cliente** | El asegurado entra y ve lo suyo | 🟡 Medio | Al cerrar la 1 |
| **3 · Venta (Codeoscopic)** | Cotizar y emitir desde `central` | 🔴 Sí | Al cerrar la 1 |
| **4 · Back office (CIMA)** | Siniestros, recibos y comisiones entrando solos | 🔴 Sí | **Al final** |

### Fase 0 — Cimientos

Cerrar el hueco de arriba. Tres cosas, en este orden:

1. **El dump con datos** al schema `seguros`. El dump **no se commitea nunca** — son datos personales
   reales de 32.600 personas. Vive en local durante la ventana y se borra.
2. **Contraseña al rol `prisma_seguros`** y `apps/asegura` conectando por él. Nunca como `postgres`.
3. **Las DOS claves** —la de cifrado y la del índice ciego— guardadas en el gestor de contraseñas.

🚨 **El riesgo de fondo de esta fase, y es el mayor de todo el traspaso:** las **86 políticas RLS** del
CRM de Manuel se resuelven por `auth.uid()` de Supabase Auth. Al conectar con un rol `BYPASSRLS`,
**esas políticas dejan de aplicar y el aislamiento pasa a ser responsabilidad del código**. El fallo no
sería un error: sería **ver datos que no tocan, sin que nada falle**. Antes de enseñar una sola
pantalla hay que saber si el código de Manuel ya filtra por `correduria_id` o si delegaba todo en RLS.
Es la pregunta M4 de la encuesta y es la más importante de la lista.

### Fase 1 — La cartera en lectura

Solo leer: clientes, pólizas, vencimientos. Es la fase que **da valor el primer día** (Alberto ve su
cartera en `central`) y a la vez es la prueba de que la Fase 0 salió bien:

- **Descifrar un registro real** y ver el dato correcto.
- **Buscar por email y por DNI** un cliente conocido y que aparezca.

Las dos, no solo la primera: descifrar bien pero con el índice ciego roto da un buscador que **miente
en silencio** — devuelve «no encontrado» para clientes que sí están.

### Fase 2 — El portal del cliente

Login del asegurado y sus pólizas, recibos y documentos. Depende de cómo entren hoy los clientes
(pregunta M9) y de los ~4 ficheros del Vercel Blob, que se mueven a mano.

### Fase 3 — La venta: Codeoscopic

Aquí está el matiz que ya medimos y que no hay que perder: **cotizar está demostrado** (1 proyecto, 15
precios, 15 ofertas) y **emitir NO** (`codeoscopic_participants`, `product_forms` y `documents` a cero
filas). Que el código exista no prueba que funcione. La Fase 3 se planifica asumiendo que **la emisión
hay que verla funcionar antes de darla por buena**, no como una función heredada.

Lo que salva esta fase aunque no llegara una línea de código de Manuel: guardan el **`raw_payload`
crudo** de cada respuesta, y eso documenta la API real de Codeoscopic mejor que cualquier manual.

### Fase 4 — El back office: CIMA

Ya está inventariada en este documento. **No se toca hasta cerrar la 3.** Mientras tanto sigue
corriendo en el despliegue de Manuel, y lo único que hay que vigilar es que la factura de Fly no
venza otra vez.

---

## 📋 ENCUESTA — lo que hace falta saber

Partida en tres: lo que **solo Manuel** puede contestar (ordenado por fase, para pedírselo a trozos),
lo que **solo Alberto** puede decidir, y lo que **no se pregunta porque se mira**.

### A · Para Manuel

**Fase 0 — cimientos** *(esto es lo único que bloquea hoy)*

| # | Pregunta | Por qué importa |
|---|---|---|
| **M1** | ¿Nos pasas tú el `pg_dump` con datos, o nos das una cadena de conexión de solo lectura y lo sacamos nosotros? | Define quién hace el trabajo y cuándo |
| **M2** | ¿Qué tablas **no** hay que volcar? (logs, colas, caché, `operational_events`) | 3.518 filas de eventos operativos no aportan nada y ensucian |
| **M3** | Las **dos claves**: la de cifrado y la del índice ciego. Nombres de variable aquí; **valores por gestor de contraseñas** | Sin ellas el dump es ruido cifrado |
| **M4** | 🚨 **El aislamiento entre corredurías, ¿está solo en las políticas RLS, o el código también filtra por `correduria_id` en cada consulta?** | Con `BYPASSRLS` las RLS no aplican. Si el código confiaba en ellas, se ve todo **sin que falle nada** |
| **M5** | ¿Qué columnas están cifradas, con qué librería, y sobre qué campos se calcula el índice ciego (¿email, DNI, teléfono?) | Para poder descifrar y para no romper el buscador |
| **M6** | ¿Los usuarios están en **Supabase Auth** (`auth.users`)? | Si sí, **no viajan en un dump del schema `public`**: las cuentas hay que recrearlas. Agujero clásico |

**Fase 1-2 — intranet y portal**

| # | Pregunta |
|---|---|
| **M7** | El repo de la app Next.js: ¿nos lo transfieres, o acceso de lectura y copiamos lo que sirva? (Alberto ya está dentro) |
| **M8** | ¿Hay más de una correduría en la base, o solo la de Alberto? ¿Qué representa exactamente `correduria_id`? |
| **M9** | ¿Cómo entra hoy un asegurado al portal: contraseña, enlace mágico, DNI + nº de póliza? ¿Lo usa alguien ya? |
| **M10** | Los ~4 ficheros del **Vercel Blob** — pásalos a mano; ¿hay algo más que no esté en la base? |
| **M11** | Las columnas `wa_access_token` / `wa_phone_number_id` de `corredurias` están a NULL. ¿WhatsApp Business llegó a usarse? ¿A nombre de quién está la cuenta de Meta? |

**Fase 3 — Codeoscopic**

| # | Pregunta |
|---|---|
| **M12** | La carpeta del cliente de Codeoscopic: endpoints, autenticación y el mapeo de formularios por producto/compañía |
| **M13** | **¿La emisión llegó a probarse alguna vez**, aunque fuera en sandbox? Los datos dicen que no |
| **M14** | ¿Las credenciales apuntan a sandbox o a producción? |

**Transversal — se pide ya, no depende de fase**

| # | Pregunta |
|---|---|
| **M15** | **La lista de crons** de tu Vercel (ahí está el detector de vencimientos a 30/15/7 días) |
| **M16** | **La lista de nombres** de variables de entorno (solo nombres) |
| **M17** | ¿Dónde viven **ADR-007 y ADR-009**? Los cita la descripción del repo del adaptador |

**Fase 4 — CIMA.** Ya inventariada. Solo queda lo de siempre: los **valores de los secrets de Fly**
(credenciales TIREA) *si los tiene apuntados* — favor, no requisito: si no los tiene, se piden a TIREA.

### B · Para Alberto (decisiones, no datos)

| # | Pregunta | Por qué cambia el plan |
|---|---|---|
| **A1** | ¿Vas a usar la gestión interna **solo tú**, o entrará alguien más? | Decide si hace falta modelo de permisos en la Fase 1 o basta con una cuenta |
| **A2** | ¿**Los clientes ya usan el portal hoy**, o está a estrenar? | Si no lo usa nadie, la Fase 2 no tiene migración de cuentas y se simplifica mucho |
| **A3** | `app.grupoasegura.com`, ¿se queda como está o pasa a un dominio de `central`? | Afecta a cookies, sesiones y al corte de la Fase 2 |
| **A4** | **¿Qué es lo primero que quieres VER funcionando?** | Es lo que ordena la Fase 1. Sin esto elijo yo, y probablemente mal |
| **A5** | 🔶 **Las comisiones ya existen en `apps/plataforma /correduria`** (matriz compañía×mes desde los movimientos de BBVA). ¿Eso se queda ahí, o se mueve a `apps/asegura` cuando llegue CIMA? | **Hay solape real.** CIMA traerá comisiones por otra vía. Dos fuentes para el mismo número es cómo se acaba discutiendo con el dato |
| **A6** | RGPD: 32.600 personas. ¿Hay registro de actividades de tratamiento? ¿Manuel figura como encargado del tratamiento? | El dump mueve datos personales de verdad. No es opcional |

### C · Lo que NO se pregunta — se mira

Para no gastar el tiempo de Manuel en cosas que salen solas:

- **La estructura de tablas, tipos y relaciones** → sale del propio dump.
- **Los 132 procedimientos de `public`** → viajan en el dump.
- **Qué hay hoy en `apps/asegura`** → auth propia (`asegura_session` + `jose` contra `public.cuentas`),
  layout, dashboard y los manifiestos. Nada de dominio.
- **El coste y la forma del adaptador de Fly** → medido: 6,68 US$/mes, 24/7, sin `auto_stop`.

---

## Lo único que hay que hacer ahora

**Mandarle a Manuel el bloque de Fase 0 (M1-M6) y nada más.** Seis preguntas que puede contestar en un
rato. Todo lo demás espera: pedirle las diecisiete de golpe es la forma más segura de no recibir
ninguna.

---

## 🔎 27/08/2026 — La propuesta del «team de Vercel con 14 días gratis», mirada de verdad

Manuel propone **crear un team de Vercel aprovechando los 14 días gratis**, darle acceso, y desde ahí
recoger toda la información. También dice que **Alberto ya tiene acceso a todo** (repos), y que **lo de
Fly se deja para más adelante, junto con CIMA** — esto último encaja con el plan por fases y se acepta
sin más.

Lo del team **no**. Tres razones, y la segunda es de seguridad.

### 1. La premisa es falsa: Alberto ya tiene Vercel Pro

Consultado por MCP el 27/08/2026:

| Team | Slug | Plan |
|---|---|---|
| `Pisos turisticos' projects` | `pisos-turisticos-projects` | **pro** |

No hacen falta 14 días de prueba de nada: **el Pro ya está pagado**. La prueba gratuita solo tendría
sentido si se partiera de cero, y no es el caso.

### 2. 🚨 Lo que NO se puede hacer: meter a Manuel en el team que ya existe

Ese team aloja **cinco proyectos**, todos colgando del mismo repo `central`:

`ia-rest` · `ialimp` · `central-rrhh` · **`plataforma`** · `transporte`

**`plataforma` es el cuadro de mando consolidado**: banca PSD2, movimientos bancarios, fiscal,
patrimonio, trading. Un miembro del team puede leer las **variables de entorno** de los proyectos —
que es justo donde viven las credenciales de Supabase, de la banca, del bot de Telegram y del resto.

Invitar a Manuel a ese team para pasarse los datos de la correduría **le daría, de paso, la vida
financiera entera de Alberto**. No es desconfianza hacia él: es que el permiso no se puede recortar a
mano en el sitio donde hace falta. El control por proyecto de Vercel (*access groups*) es un
**entitlement** aparte —la propia documentación del CLI dice literalmente «*Requires the access groups
entitlement*»— y **está sin confirmar si el plan Pro lo incluye**. No se apuesta la banca a una
suposición sobre un plan.

➡️ **Si se usa un team, tiene que ser uno NUEVO y separado, con el proyecto de asegura y nada más.**
Nunca el que ya existe.

### 3. Los 14 días reintroducen la fecha límite que Alberto acababa de quitar

Este es el argumento de fondo. El 26/08 se corrigió el error central del documento: **no hace falta
ventana ni fecha acordada**, porque el CRM no lo usa nadie y los ficheros de EIAC se re-descargan. El
traspaso va al ritmo de Manuel.

Un trial de 14 días **fabrica exactamente el plazo que se acaba de eliminar** — y encima uno que no
llega: las fases 0 a 3 no caben en dos semanas. Al día 15 el team decae y algo se rompe en silencio,
que es el modo de fallo más caro de todo este proyecto.

### ✅ Lo que sí resuelve el problema, gratis y sin reloj

La intención de Manuel es buena —un sitio común donde soltar las cosas— pero el mecanismo sobra,
porque **casi nada de lo que necesitamos vive solo en Vercel**:

| Qué necesitamos | ¿Está en Vercel? | Cómo se consigue de verdad |
|---|---|---|
| El código | ❌ Está en **GitHub** | Alberto ya tiene acceso a los dos repos |
| La lista de crons | ❌ Está en `vercel.json`, **en el repo** | Se lee, no se pide |
| **Los VALORES de las variables de entorno** | ✅ **Solo aquí** | `vercel env pull` → un fichero, por gestor de contraseñas |
| Los ~4 ficheros del Blob | ✅ | Se descargan a mano |
| Los logs de ejecución | ✅ | Solo hacen falta si hay que depurar algo |

**El único premio real del team son los valores de las variables de entorno.** Y eso se resuelve con
un comando:

```
vercel env pull .env.produccion --environment=production
```

Manuel lo ejecuta, y el fichero se entrega **por el gestor de contraseñas** — nunca por WhatsApp ni
por correo. Cero coste, cero plazo, cero acceso cruzado.

### Cuándo SÍ hará falta un team

Cuando se quiera **asumir el despliegue vivo**, no antes. Eso es Fase 4, junto con CIMA y con Fly — que
es justo donde Manuel propone dejarlo. Para entonces se sabrá exactamente qué proyecto se mueve y a
dónde, y se crea el team separado en ese momento, sin prisa y sin trial.

### 🟡 Observación de paso, sin conclusión

El team tiene **5 proyectos**, pero el monorepo tiene **11 apps con `vercel.json`** (`almacen`,
`alquiler`, `asegura`, `housesevillana`, `ia-rest`, `ialimp`, `mariscos`, `plataforma`, `rrhh`,
`sivra`, `transporte`). Faltan seis, **`sivra` entre ellas**, que sí está desplegada.

⚠️ **Esto no prueba que no existan**: pueden estar en la cuenta personal de Alberto (otro *scope*, que
esta consulta no ve) en vez de en el team. **No se ha mirado**, y no se afirma nada hasta mirarlo.
Anotado para revisar, porque si de verdad hay proyectos repartidos entre dos scopes, eso afecta a
dónde se crea el de la correduría.

### Y una que hay que verificar, no dar por buena

Manuel dice que **Alberto ya tiene acceso a todo**. La invitación al repo del adaptador está aceptada
(comprobado el 26/08). **Del resto no hay confirmación**, y desde esta sesión no se pueden leer repos
de la cuenta de Manuel. Antes de cerrar la Fase 0 hay que abrir cada repo y ver que carga.

### ✅ DECISIÓN DE ALBERTO (27/08/2026) — Manuel entra en el team y SE QUEDA

**Esta decisión manda sobre el análisis de arriba en todo lo que lo contradiga.** Quien lea esto más
adelante: la sección anterior recomendaba no meter a Manuel en el team existente. **Alberto lo ha
decidido dos veces, en sus palabras: «da igual q manuel lea todo».** No se re-abre.

| | |
|---|---|
| **Qué se hace** | Manuel entra como **miembro del team `pisos-turisticos-projects`** (plan Pro) y **se queda**, no se le saca al acabar |
| **Quién paga** | **Alberto.** Manuel está en Hobby, que no admite miembros — por eso la invitación solo puede ir en esta dirección |
| **Coste** | Un **asiento Pro recurrente mensual** mientras esté dentro. ⚠️ **No es un pago único** (Alberto lo había entendido así). El precio por asiento **no se ha verificado**: Vercel lo muestra antes de confirmar la invitación |
| **Descartado** | El trial de 14 días que proponía Manuel — innecesario (el Pro ya está pagado) y reintroducía una fecha límite |

**Por qué dejarlo dentro es lo correcto:** el traspaso son cinco fases repartidas en semanas —
cimientos, cartera, portal, Codeoscopic y CIMA— y a Manuel hay que preguntarle en todas. Meterlo y
sacarlo en cada una es fricción, y **cada re-alta vuelve a generar un cargo prorrateado**: sale igual
de caro y molesta más.

**El email:** hay que preguntarle **con cuál entra en Vercel**. El único que consta es
`manuelsuarezz@gmail.com`, que es el de **facturación de Fly** — puede no ser el mismo, y si no lo es
la invitación no llega y parecerá que «no funciona».

**Herramienta:** el conector MCP de Vercel **no expone la gestión de miembros** (lee proyectos y
despliega, nada más). La invitación la hace Alberto a mano en
`Settings → Members → Invite`, rol **Member**.

### 📋 Checklist de la primera sesión con Manuel dentro

1. **Envs del proyecto `asegura`: production Y preview.** Suelen diferir, y coger solo una es el fallo
   clásico. Los **valores** al gestor de contraseñas; aquí solo nombres.
2. **Los ~4 ficheros del Vercel Blob.**
3. **Las seis de Fase 0** (M1-M6): el dump, qué tablas no volcar, las dos claves, si el aislamiento está
   solo en RLS o el código filtra por `correduria_id`, qué columnas están cifradas y sobre qué campos va
   el índice ciego, y si los usuarios están en Supabase Auth.
4. **Dónde viven ADR-007 y ADR-009.**
5. **La lista de crons de su Vercel** — ahí está el detector de vencimientos a 30/15/7 días.

🚫 **Lo que NO se hace en esta sesión: transferir el proyecto.** Eso arrastra
`app.grupoasegura.com/api/crons/cima-pull`, o sea adelanta CIMA a hoy, y CIMA es Fase 4 por decisión
del propio Alberto. La transferencia va con Fly, al final.
