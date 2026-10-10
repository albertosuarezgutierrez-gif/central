# Google Contacts ↔ CRM (Grupo ASegura) — alta y operación

El CRM es la fuente de verdad. Cron horario `/api/cron/google-contactos` (apps/asegura) empuja al grupo
**«Grupo ASegura»** la misma selección que el .vcf del móvil (clientes en vigor + leads de Vencimientos, sin fusionadas)
más los contactos de las COMPAÑÍAS (`compania_contactos` activos, 🔵). Selección: `apps/asegura/lib/contactos-google.ts`.
Solo se tocan contactos de ese grupo, salvo la ADOPCIÓN de lo ya volcado con el .vcf (abajo). Lo editado en Google sobre un campo gestionado se vuelve a pisar y queda en
`seguros.google_contactos_revision`; un contacto nuevo en el grupo es una propuesta de lead, nunca un alta.
Lógica: `packages/module-seguros/src/google-contactos.ts`. SQL: `apps/asegura/prisma/sql/2026-10-05b_google_contactos.sql` (gate DDL).

## Google Cloud Console (una vez, con el Gmail de Alberto)
1. console.cloud.google.com → proyecto nuevo (p. ej. «asegura-contactos»). Sin facturación: People API es gratis.
2. APIs y servicios → Biblioteca → **People API** → Habilitar.
3. Pantalla de consentimiento OAuth → tipo **Externo** → nombre de la app, correo de soporte, dominio autorizado del
   despliegue de asegura. Scopes: `.../auth/contacts` (sensible), `openid`, `email`. Usuarios de prueba: el Gmail.
4. **Publicar la app → «En producción»** (sin verificar). Con la app en «Prueba» el refresh token caduca a los 7 días.
   Sin verificar Google enseña «Google no ha verificado esta app» → Avanzado → Ir a la app (límite 100 usuarios: sobra).
5. Credenciales → Crear ID de cliente OAuth → **Aplicación web** → URI de redirección autorizado:
   `https://<dominio de asegura>/api/google-contactos/callback` (exacto, el mismo valor que `GOOGLE_CONTACTOS_REDIRECT_URI`).

## Variables de entorno (proyecto Vercel de apps/asegura; luego Redeploy)
- `GOOGLE_CONTACTOS_CLIENT_ID`, `GOOGLE_CONTACTOS_CLIENT_SECRET` — del paso 5.
- `GOOGLE_CONTACTOS_REDIRECT_URI` — la URI del paso 5.
- `GOOGLE_CONTACTOS_STATE_SECRET` — aleatorio largo (firma el `state` anti-CSRF del OAuth).
- `GOOGLE_CONTACTOS_CUENTAS_PERMITIDAS` (opcional) — emails de Google autorizados, separados por coma (sin distinguir mayúsculas); si está definida y la cuenta que consiente no está, no se guarda, se revoca su token y vuelve `motivo=cuenta_no_permitida`.
- Ya existentes y obligatorias: `PII_ENCRYPTION_KEY` (cifra el refresh token en BD), `PII_LOOKUP_KEY`, `CRON_SECRET`,
  `ASEGURA_OPERADOR_SECRET`. El refresh token NUNCA va en una env.

## Puesta en marcha: conectar → simular → revisar → activar
Alberto ya volcó clientes a su agenda a mano (.vcf de contactos-movil): están SIN nuestro id, FUERA de la etiqueta
«Grupo ASegura» y a veces duplicados. **Adopción** (05/10/2026): antes de crear, se busca en la agenda ENTERA por
CUALQUIER teléfono E.164 del contacto. Primero en la etiqueta (vínculo de siempre); si ahí no hay nadie, fuera:
- uno y solo uno, y su nombre (sin el sufijo «· AS …» del .vcf ni emojis, tildes o mayúsculas) coincide con el del
  CRM, o lleva ese sufijo → se ADOPTA: se escribe la entrada del CRM (conservando lo demás), se mete en la etiqueta y
  queda con origen `adoptado` (como `vinculado_*`: nunca se borra, ni al retirar ni al desconectar);
- mismo teléfono y OTRO nombre (probable contacto personal de Alberto) → NI se adopta NI se crea: cola
  (`duplicado_ambiguo`, nombre distinto);
- varios contactos con ese número, o un contacto cuyos teléfonos casan con dos fichas → cola, sin crear.
En modo delta no se adopta: se pide el listado completo. El cron **no escribe nada** (ni crea la etiqueta) hasta la
marca `sync_activada_en`: responde `200 { estado: 'pendiente_activar' }`.
1. **Conectar** (05/10/2026): plataforma → `/correduria` → menú «…» → **«Google Contactos»** (`/correduria/google-contactos`:
   tarjeta de estado + Conectar/Reconectar/Desconectar + simular/activar + cola). «Conectar Google» pide por el puerto un
   TICKET (`POST /api/operador/google-contactos/ticket`, auditado, solo `x-actor: humano:`): HMAC con
   `GOOGLE_CONTACTOS_STATE_SECRET` (dominio propio, distinto del `state`), correduría + cuenta + `jti`, 2 min, UN SOLO USO
   (`seguros.google_contactos_ticket_usado`, migración `2026-10-05c_google_contactos_ticket.sql`; sin ella `conectar?ticket=`
   falla cerrado con `ticket_bd`). El navegador va a `…/api/google-contactos/conectar?ticket=…` (misma pestaña); un ticket
   malo NO cae a la sesión. El callback ya no exige sesión de asegura (mandan `state` firmado + nonce de la cookie; si hay
   sesión, debe coincidir) y vuelve SIEMPRE a `PLATAFORMA_URL|URL_PLATAFORMA_DEFECTO` + `/correduria/google-contactos?google=ok|error&motivo=<código>`
   (solo el origen de la base, motivo de lista cerrada: sin open redirect). Sigue valiendo abrir `conectar` a mano con sesión de asegura.
2. **Simular** (plataforma → `/correduria/google-contactos` → «Google Contacts: simular y activar» → «Simular sincronización»;
   puerto `POST /api/operador/google-contactos/simular`, auditado). SOLO LECTURA: lee la agenda entera, no crea la
   etiqueta, no toca vínculos ni cola; solo apunta `simulada_en`. Informe (contadores + ≤50 ejemplos, nombre como
   quedará con su 🟢/🟡/🔵 y teléfono con solo los 3 últimos dígitos): se crearán · se vincularán (en la etiqueta) ·
   **se adoptarán** (fuera de la etiqueta) · conflictos de nombre (mismo teléfono, otro nombre → cola) · teléfonos
   ambiguos · teléfonos no E.164 · contactos leídos y si se pasaría del tope de 25.000.
   Lógica pura: `packages/module-seguros/src/google-contactos-simulacion.ts` (UN plan: el real de `planificarSync`).
3. **Revisar**: los conflictos de nombre y ambiguos (fuera de la etiqueta suelen ser contactos personales: irán a la
   cola, no se tocan); limpiar duplicados en Google si se quiere y volver a simular.
4. **Activar** («Activar sincronización»; `POST /api/operador/google-contactos/activar { actor }`, auditado). Exige
   haber simulado (409 `sin_simular`). Reconectar con OTRA cuenta de Google borra la marca (otra agenda, sin simular).

## Nombre en Google: 🟢 cliente · 🟡 lead · 🔵 compañía · ⏰ vence pronto
- El nombre EMPIEZA por el emoji de tipo (decisión de Alberto, 05/10/2026): «🟢 Juan Pérez García» = cliente con
  póliza en vigor, «🟡 María López» = lead. Va al principio del `givenName`; el apellido va limpio (sin el antiguo
  sufijo «· AS Cliente/Lead»). La organization «Grupo ASegura» lleva el tipo en texto (`Cliente`/`Lead`).
- Al leer se quita el emoji y se reconoce (`quitarPrefijo`): lo escrito se relee con el mismo hash, sin reescritura
  horaria (lección del fix 3a). El tipo cuenta solo si emoji y organization coinciden; si alguien borra el emoji a
  mano, se vuelve a poner (y queda en la cola como cambio en Google).
- Lead que pasa a cliente → UN update en la siguiente pasada (🟡 → 🟢), sin «cambio en Google» falso.
- Al vincular por teléfono, el emoji no cuenta para comparar nombres.
- 🔵 Contactos de compañía: «🔵 Mapfre · Siniestros (Laura)» (`nombreCompaniaContacto`: compañía · área (persona)),
  organization «Grupo ASegura»/`Compañía`. Clave `compania:<uuid>` (externalId y vínculo, columna
  `compania_contacto_id`). Mismas reglas de dedup/adopción; cuentan para el tope de 25.000. 🚨 `compania_contactos` es
  un catálogo GLOBAL (sin correduría): con una segunda correduría habría que acotarlo.
- ⏰ Cliente con alguna póliza en vigor que vence en ≤30 días (hoy y el día 30 incluidos; vencimiento NULL no cuenta):
  «🟢⏰ Juan Pérez». El parser lo reconoce: entra y sale con UN update, sin pasar por la cola.

## Nota, URL y cumpleaños
- **Nota** (`biographies`, singleton): el CRM gestiona SOLO el bloque entre `— Grupo ASegura —` y
  `— fin Grupo ASegura —` (al final de la nota). Cliente: pólizas en vigor (ramo · compañía, sin NIF, importes ni
  nº de póliza) y próximo vencimiento dd/mm/aaaa (`notaCliente`); lead: su póliza en otra compañía y cuándo vence
  (`notaLead`). Lo que Alberto escriba fuera del bloque se conserva. Cambios DENTRO del bloque hechos en Google no
  van a la cola: el CRM lo repone. Compañías: sin bloque (su nota no se toca).
- **URL** (`urls`, tipo «Grupo ASegura»): la ficha en plataforma `<PLATAFORMA_URL>/correduria/cliente/<id>`, delante
  de las de Alberto. Tampoco va a la cola.
- **Cumpleaños** (`birthdays`): `clientes.fecha_nacimiento` (CIFRADA, se descifra como el resto). Sin fecha en el CRM
  (o ilegible) no se toca la de Google. Si Google tenía otra, CRM gana y la de Google queda en la cola.
- Hash: cada campo nuevo entra en el hash, y lo que el CRM no sabe (`null`) ni se compara ni se pisa: solo se
  reescribe cuando cambia de verdad. El .vcf antiguo dejó su propia nota fuera del bloque: se conserva.
- El .vcf del móvil (`vcard.ts`) sigue con su «· AS Cliente/Lead»: no es este canal.

## Uso
- Estado: `GET /api/operador/google-contactos`. Desconectar: `POST /api/operador/google-contactos/desconectar`
  `{ "borrarContactos": true|false }` (revoca en Google y borra el token; con `true` borra solo los contactos que CREÓ el CRM; los vinculados por teléfono/id y los adoptados eran de Alberto y se quedan).
- ¿Quién llama?: `POST /api/operador/llamada` `{ "tel": "600112233" }` (índice ciego, solo lectura). POST y no GET:
  el teléfono en la URL quedaría en los logs de Vercel.
- Desconectar desde el panel: «Desconectar» en `/correduria/google-contactos`, con confirmación y casilla «borrar los creados
  por el CRM» DESMARCADA por defecto.
- Cola de revisión: plataforma → `/correduria/google-contactos` («Google Contacts: revisión»; en la pestaña Clientes solo
  queda un aviso si hay pendientes o la conexión está revocada), puerto
  `GET|POST /api/operador/google-contactos/revision` (50 por página por cursor; acciones `aceptar_lead`, `descartar`,
  `mantener_crm`, `unificar`, `unificar_nombre_crm`, `usar_como_mote`; lote `{ lote:'unificar', motivo }`). Salvo Unificar, ninguna toca el vínculo; ninguna toca Google: «Mantener CRM» sobre un sacado del grupo NO lo recrea.
- Teléfono de los contactos 🔵 de compañía: se mete en `/correduria/companias` («Añadir/Cambiar teléfono»; `PATCH
  /api/operador/companias/contacto/[id] { accion:'telefono' }`, validado y guardado en E.164 con `aE164`).
- Teléfono/correo ausente en el CRM (p. ej. lead con baja de WhatsApp) NO vacía el de Google: se conserva.
- El CRM gestiona solo SU entrada (primer teléfono/correo, la organization «Grupo ASegura», su URL, el bloque de la
  nota y el cumpleaños si lo sabe): otro teléfono, otro correo, otra URL, su texto de la nota o la empresa que Alberto
  añada en Google se conservan. Un contacto previo del grupo con el mismo teléfono pero OTRO
  nombre no se vincula ni se pisa: va a la cola como «Teléfono ambiguo».
- Reconectar la MISMA cuenta de Google no revoca el token anterior (`revoke` mata el grant entero, también el nuevo).

## Unificar, mote, estados y «Ordenar agenda» (05/10/2026)
- Migración `2026-10-05d_google_contactos_unificar.sql` (gate DDL, aplicar ANTES del despliegue): `revision.motivo`,
  `resolucion` + `unificar`/`unificar_nombre_crm`/`usar_como_mote`, tabla AISLADA `cliente_mote` (sin relación Prisma).
- «Unificar» (y «Unificar todos los de nombre distinto», 50 por pulsación) crea el vínculo pendiente y guarda como MOTE el
  nombre de su agenda; la pasada siguiente lo adopta como «🟢 <mote>» con «Ficha: <nombre>» en la nota. Mote editable en
  la ficha («Mote (solo en tu agenda)»). Sin mote, el nombre que tenía queda en la nota fuera del bloque.
- Antes de CREAR: fuera de la etiqueta, 1 contacto sin id con el mismo correo o nombre → cola (`mismo_email`/`mismo_nombre`);
  varios → `varios_candidatos` (sin Unificar). Estados: 🚨 siniestro abierto/en tramitación > 💶 recibo DEVUELTO de póliza
  en vigor (los `pendiente` no) > ⏰; ⚪ ex-cliente solo con vínculo previo (no se retira). Consulta caída = no se escribe.
- «Ordenar agenda» en la vista: duplicados por teléfono, sin nombre, no E.164, fichas con otro nombre, «parecen de trabajo».

## Un número, un contacto · enriquecer ficha (05/10/2026, migración `2026-10-05e`, gate DDL ANTES del despliegue)
- Fichas con el MISMO E.164 → UN contacto, el de la principal (elegida en la cola «Este número es de…», guardada por índice
  ciego en `google_contactos_titular_telefono`; si no, la única `tipo_persona='fisica'` frente a jurídicas). Las demás van como
  organizations `type='Grupo ASegura · también'` y «También: <ficha> (<estado>, <ramo · compañía>)» en la nota; emoji
  combinado (🟢 si alguna en vigor, alerta más urgente). Sin titular: cola y NO se crea nada para las fichas sin contacto.
  Las fichas del CRM NO se fusionan. Transición: la principal sin contacto HEREDA el de una secundaria; el de una secundaria
  sobrante se DESVINCULA sin borrarse (se reescribe sin emoji/org/id/URL/bloque, sale de la etiqueta; lo de Alberto se queda;
  si lo CREÓ el CRM también se le quitan nuestro teléfono/correo; >10 en una pasada → no se desvincula NINGUNO y se avisa).
  >3 fichas con el mismo número (centralita/gestoría): ni titular ni combinación, cada ficha como estaba + aviso informativo
  en la cola. La simulación cuenta números compartidos, combinados, cola y desvinculaciones. «Añadir a la ficha»: dato del contacto que la ficha NO tiene (BD vacía) → cola; aceptar usa
  `anadirContacto` y nunca pisa. Lógica: `agruparNumeros`/`personaSinGestion`; tests `google-contactos-numero.test.ts`.

## Límites
- **Google admite 25.000 contactos por cuenta (incluidos los personales).** Si la sincronización los superaría, se
  aborta con error y no escribe nada. Escrituras por lotes de 200, máx. 25 lotes por hora (la primera carga puede
  tardar varias horas); 429/5xx con backoff; syncToken caducado (7 días sin uso) → resync completo.
- Si la clave PII no abre la cartera, el cron responde `pii_no_descifra` y no toca Google (si no, borraría teléfonos).
