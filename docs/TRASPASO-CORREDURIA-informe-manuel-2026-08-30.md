# Traspaso de ASegura — estado a 30 de agosto de 2026

> 📥 **Informe de Manuel Suárez, recibido el 30/08/2026 y archivado VERBATIM** (solo se añade esta
> nota). Es EL documento de referencia del traspaso del lado de Manuel: datos medidos contra
> producción ese día. El análisis y las decisiones de nuestro lado viven en
> `docs/TRASPASO-CORREDURIA.md`. No contiene ningún valor de secreto, solo nombres.

**Para:** Alberto Suárez Gutiérrez (corredor CS-F/0170)
**De:** Manuel Suárez
**Datos verificados contra producción el:** 2026-08-30

---

## 0. Cómo leer este documento

Separo tres registros y no los mezclo:

- **Medido** — lo he contado contra la base de datos de producción el 30-ago. Lleva el número.
- **Del repo** — leído en el código o en la configuración. No ejecutado.
- **Sin verificar** — lo digo y digo que no lo he comprobado.

Los números de cartera se mueven solos: CIMA descarga a diario. Si lees esto una semana más tarde, vuelve a contar.

---

## 1. Qué recibes

No son tres sistemas, son **cinco**. Los dos últimos son los que se olvidan y los que dejan la plataforma muerta si faltan.

| # | Sistema | Identificador | Qué es |
|---|---------|---------------|--------|
| 1 | **Vercel** — proyecto `asegura` | `prj_4jVSN6zMo9J8COcrCjgOKWSbNFl8` | La aplicación entera: web pública, cotizador, portal de cliente, intranet y API. Una sola app Next.js, sin monorepo. Región `fra1`. Dominio `app.grupoasegura.com`. Hoy en el equipo `team_AESXTkcq0wR7lxeogEzIkSx9`. |
| 2 | **Supabase** | `uijsgeocgdaxkhvwtjqs` (Frankfurt) | PostgreSQL 17.6. 52 tablas en `public`. Es la base de datos **y** el sistema de cuentas (Supabase Auth). |
| 3 | **GitHub** — `manuelsuarez/asegura` | — | El código de la app. Ya eres colaborador con permiso de escritura. |
| 4 | **Fly.io** — `asegura-app-cima-adapter` **+ su repo** `manuelsuarez/asegura-app-cima-adapter` | región `cdg` | El servicio Java que habla SOAP con TIREA. **Sin esto no entra ni una póliza de CIMA.** Invitación al repo emitida el 26-ago; caduca sobre el 2-sep. |
| 5 | **`CRON_SECRET`** en GitHub Actions | — | **No viaja con el repo.** Si no se repone al cambiar el dueño, los crons de CIMA se quedan mudos sin dar error visible. |

**Satélites** que hay que tocar aparte: Vercel Blob (~4 ficheros hoy), el panel de Codeoscopic y el de Meta/WhatsApp (URLs de webhook), y el registrador/DNS de `grupoasegura.com` y `grupoasegura.es`.

**No se transfiere** el proyecto Vercel `manuelsuarez` (`prj_CsDMGWuY7rwe4dM20uV4puQjke8J`): es personal de Manuel, no tiene nada que ver con ASegura.

---

## 2. Qué está vivo y qué está apagado

Probablemente lo más útil de todo el documento.

| Función | Estado | Cómo lo sé |
|---|---|---|
| Intranet / CRM (clientes, pólizas, oportunidades, siniestros) | **En uso** | Medido: hay datos y movimiento |
| Ingesta CIMA/TIREA (descarga diaria de ficheros EIAC) | **Viva — ha corrido hoy** | Medido: hay ficheros descargados el 30-ago |
| Cotizador de Auto vía Codeoscopic | **Cotizar: sí, en producción. Emitir: no.** | 1 proyecto, 15 precios reales |
| Portal de cliente | Vivo, pero con **2** clientes dados de alta | Medido |
| **Emisión iniciada por corredor** | **Nunca activada** | Flag `BROKER_INITIATED_EMISSION_ENABLED` |
| Ofertas automáticas / Auto-Submit | Apagado | Tablas vacías |
| Bot de WhatsApp | Apagado | Tablas vacías |

Los interruptores son variables de entorno en Vercel. El código los lee así (`del repo`, **no he mirado los valores en el panel**): `BROKER_INITIATED_EMISSION_ENABLED`, `BROKER_SUBMIT_ENABLED`, `AUTO_SUBMIT_ENABLED`, `NON_AUTO_EMISSION_ENABLED`, `OFERTAS_AUTOMATICAS_ENABLED`, `IBAN_TRANSMISSION_ENABLED`, `SELF_SIGNUP_ENABLED`, `WHATSAPP_AI_BOT_ENABLED`, `CIMA_INGESTA_ENABLED` (+ `_REC_`, `_SIN_`, `_CEF_`).

`CIMA_INGESTA_ENABLED` está en `true`: si no lo estuviera, el endpoint devolvería `feature_disabled` y no habría descargas de hoy.

---

## 3. La cartera — medido el 30-ago

**Personas: 32.600 fichas.** De ellas 2.742 marcadas como `cliente` y 29.858 como `lead`.

**Pólizas: 28.843.** Por estado:

| Estado | Nº | De ellas, sin vencer a día de hoy |
|---|---|---|
| `vencida` | 25.892 | 0 |
| `activa` | 1.235 | **50** |
| `en_renovacion` | 830 | 0 |
| `fin_riesgo` | 707 | 0 |
| `competencia` | 88 | 0 |
| `cancelada` | 42 | 5 |
| resto (`recibo_devuelto`, `anula_al_vencimiento`, `cambio_clave`) | 49 | 0 |

> **Trampa de lectura, importante.** El enum de estado **no tiene el valor "vigente"**. Y `activa` no significa "en vigor hoy": de las 1.235 en `activa`, solo **50** tienen fecha de vencimiento en el futuro. Las 25.892 `vencida` son el archivo histórico de 2018 que se importó, no cartera viva. Si vas a construir un cuadro de mando, define "vigente" tú y no te fíes de la etiqueta.

Otros: 3.676 oportunidades · 1.614 bienes asegurables · 67 siniestros · 24 cotizaciones · **110** pólizas con identificador de entidad de CIMA (`id_poliza_entidad`).

---

## 4. Lo que corre solo, sin que nadie lo toque

**GitHub Actions** (horas en UTC):

| Workflow | Horario | Para qué |
|---|---|---|
| `cima-pull` | **5:30 y 11:30 diario** | El importante: descarga los ficheros EIAC |
| `cima-health-alert` | 10:00 diario | Avisa si el pull no trajo nada |
| `codeoscopic-polling` | cada 30 min | Reconcilia cotizaciones; dormido con la emisión apagada |
| `codeoscopic-webhook-health` | 6:00 diario | Salud del webhook |
| `pre-launch-checklist` · `e2e-smoke` | 6:00 diario | Comprobaciones |
| `security-ci` | lunes 6:00 | Auditoría de dependencias |

**Vercel crons**: `/api/crons/overdue-digest` (7:00 L-V) y `/api/crons/vencimientos-detector` (6:00 diario). Estos **sí** viajan con el proyecto.

**Cómo funciona la cadena de CIMA:** GitHub Actions llama a `https://app.grupoasegura.com/api/crons/cima-pull` con cabecera `Bearer CRON_SECRET` → la app llama al adaptador Java en Fly → el adaptador habla SOAP (WSE v2.17) con TIREA. Tres eslabones; si se rompe cualquiera, deja de entrar cartera y **no salta ningún error visible en la app**.

### Estado de la ingesta por compañía (medido el 30-ago)

| Compañía | Confirmados | Pólizas | Última descarga | En `review` |
|---|---|---|---|---|
| C0058 Mapfre | 14 ficheros | 132 | **23-jun** | — |
| C0109 Allianz | 35 ficheros | 34 | 24-ago | 3 |
| C0468 Occident | 34 ficheros | 20 | 24-ago | **39** |
| C0613 Reale | 3 ficheros | 2 | 25-ago | — |

**Dos cosas que ya no van finas y que heredas:**

1. **Mapfre (C0058) no descarga nada desde el 23-junio.** Dos meses parada. No lo he investigado; no sé si es un problema nuestro, de credenciales o de que no haya movimiento.
2. **Occident (C0468) tiene 39 ficheros atascados en estado `review` y 0 pólizas persistidas de ellos.** El último se bajó hoy mismo. Confirmados no sube desde el 24-ago, y el montón crece (eran 36 el 26-ago). Es el residuo que ya veníamos arrastrando, pero está creciendo, no drenando.

---

## 5. Datos personales — la parte que no se puede romper

### Las dos claves

No es una clave, son **dos**, y las dos son irreversibles:

- **`PII_ENCRYPTION_KEY`** — cifra los valores. **Si se pierde, los datos quedan ilegibles para siempre.**
- **`PII_LOOKUP_KEY`** — el índice ciego, lo que permite buscar a alguien por email o DNI sin descifrar la base entera.

Sobre los hashes del índice ciego hay **índices únicos** (email y DNI). Cambiar `PII_LOOKUP_KEY` no es solo "se rompe la búsqueda": obliga a recalcular los hashes de `clientes`, `cliente_emails`, `cliente_telefonos` y `poliza_intervinientes`, y hasta entonces la deduplicación de las importaciones deja de funcionar. *(Del repo.)*

**Ninguno de los dos rota ninguna clave hasta haber verificado la cartera al otro lado.**

### Cómo está montado

Cifrado: **sin librería externa**, `node:crypto` de la propia biblioteca estándar de Node. AES-256-GCM, formato `v1:iv:cipher:tag` en base64, IV aleatorio de 12 bytes, clave de 64 caracteres hex. Fichero `src/lib/crypto/field-encryption.ts`. Es **no determinístico**: dos cifrados del mismo valor salen distintos, así que sobre el texto cifrado no se pueden hacer igualdades.

Por eso existe el índice ciego: **HMAC-SHA256** en hex, con la clave separada, en `src/lib/clientes/blind-index.ts`. Razonado en el **ADR-016**. Se calcula sobre tres campos, cada uno con su normalización:

| Campo | Normalización antes de hashear | Columnas |
|---|---|---|
| Email | minúsculas + sin espacios | `clientes.email_lookup_hash`, `cliente_emails.email_lookup_hash` |
| Teléfono | solo dígitos | `clientes.telefono_lookup_hash`, `cliente_telefonos.telefono_lookup_hash` |
| DNI / NIE / CIF | mayúsculas, sin puntos ni guiones, **sin validar la letra** | `clientes.dni_lookup_hash`, `poliza_intervinientes.nif_lookup_hash` |

### Qué está cifrado — contado el 30-ago, columna por columna

| Columna | Con valor | Cifradas | En claro |
|---|---|---|---|
| `clientes.dni` | 19.696 | 19.696 | 0 |
| `clientes.fecha_nacimiento` | 24.242 | 24.242 | 0 |
| `clientes.telefono` | 5.378 | 5.378 | 0 |
| `clientes.email` | 4.920 | 4.920 | 0 |
| `clientes.direccion` | 1.954 | 1.954 | 0 |
| `cliente_telefonos.telefono` | 4.794 | 4.794 | 0 |
| `cliente_emails.email` | 4.393 | 4.393 | 0 |
| `cliente_carnets_conducir.fecha_carnet` | 2.164 | 2.164 | 0 |
| `poliza_intervinientes` (nif/email/tel/f.nac/f.carnet) | 95/21/29/93/22 | idem | 0 |
| `poliza_recibos.iban` | 118 | 118 | 0 |
| `polizas.datos_especificos → direccion` (JSON) | 172 | 172 | 0 |
| `bienes_asegurables.datos → direccion` (JSON) | 169 | 169 | 0 |
| `siniestros.lugar_direccion` | 6 | 6 | 0 |

**Cero filas en claro.** Lo que **no** está cifrado, a propósito: `usuarios.email` (17 filas — es el espejo de Supabase Auth y tiene que estar en claro para el magic link), los datos de la correduría, y ciudad / provincia / código postal, que son Tier-2. La matrícula del bien tampoco: está razonado en el **ADR-025**.

### RLS y aislamiento — lee esto antes de conectarte con BYPASSRLS

RLS está activada en **las 52 tablas** de `public`, con **86 políticas**. Pero por el **ADR-013** eso es un backstop **solo para el cliente de Supabase desde el navegador**. Los server actions, los route handlers y los crons van con Drizzle contra `DATABASE_URL`, que **ya bypassea RLS hoy**. La defensa real es de capa de aplicación: sesión validada + política de propiedad + `WHERE` explícito por `correduria_id` y `cliente_id`.

O sea: conectarte con un rol BYPASSRLS **no te pone en un sitio raro, te pone donde ya está la aplicación**.

Y en la práctica: **hay una sola correduría**. Medido: `corredurias` tiene 1 fila, y `clientes` y `polizas` tienen un único `correduria_id`, cero nulos. La columna existe en 38 tablas por diseño de futuro, pero hoy no hay un segundo inquilino al que fugarse.

Lo que **sí** te va a morder con BYPASSRLS son los **triggers append-only**, que no son RLS y saltan igual: `consent_logs`, `lds_consent`, `mediator_audit_log`, `cliente_merge_log`, `poliza_merge_log` y las tablas `*_documentos` rechazan UPDATE y DELETE a nivel de trigger. Además `clientes` y `polizas` tienen FORCE RLS.

### Cuentas de usuario

Están en **Supabase Auth**, no en una tabla normal. Medido el 30-ago:

- **9** cuentas en `auth.users`, todas con inicio de sesión alguna vez.
- **17** filas en `public.usuarios`, de las que solo **9** casan con una cuenta viva.
- **8 filas huérfanas**, marcadas como activas, sin cuenta detrás: no pueden entrar. **Conviene mirarlas antes del corte**, o después parecerá que las rompió el traspaso.
- Al revés no pasa: toda cuenta de Auth tiene su fila.
- 2 usuarios con rol `admin`. Solo 2 clientes tienen acceso al portal.

> **Aviso técnico serio:** **no existe ninguna clave foránea de `public` a `auth`** (verificado). El enlace es la columna `usuarios.auth_user_id`, un uuid a pelo. Si en algún momento se recrean las cuentas con identificadores nuevos, `usuarios.auth_user_id` (17 filas) y `clientes.usuario_id` (2 filas) dejan de casar y **Postgres no da ningún error**: se queda roto en silencio. Esta es la razón principal para **transferir el proyecto de Supabase en vez de copiar los datos**.

---

## 6. Lo irreversible — no hagas esto

1. **No rotar las claves PII** hasta haber verificado la cartera al otro lado.
2. **No redesplegar el adaptador de Fly a ciegas.** Sus secretos de TIREA se pusieron con `flyctl secrets set` y no se pueden recuperar. Se transfiere la app, no se re-crea.
3. **No dar por bueno el `CRON_SECRET`** solo porque el secreto esté puesto. Al cambiar el dueño del repo, Actions puede quedar deshabilitado y los horarios sin re-armar.
4. **No tocar el DNS ni los MX de `grupoasegura.es`.** Solo sirve el `info@`; si se caen, nadie se entera hasta que un cliente escriba y rebote.
5. **No dejar copias del volcado por ahí.** Son datos de 32.600 personas.
6. **No encender la emisión sin probar antes la idempotencia** (ver frentes abiertos).

---

## 7. Secuencia de corte

Acordada el 26-ago. El corte, **fuera de las franjas de 5:30 y 11:30 y justo después de un pull correcto**, para tener medio día de margen antes de la siguiente descarga.

0. Copia de seguridad previa (volcado + lista de ficheros de Blob + lista de variables de entorno). **Local durante la ventana, se borra después.**
1. Manuel acepta la invitación al equipo de Vercel.
2. Transferir el proyecto Vercel `asegura` → re-verificar el dominio y que responde.
3. Transferir el proyecto de Supabase.
4. Resolver Vercel Blob (re-apuntar el token o mover los ~4 ficheros a mano).
5. Fly: meter a Manuel en la organización y transferir la app. **Sin redesplegar.**
6. GitHub: transferir los **dos** repos al final; re-conectar Git en Vercel y **reponer `CRON_SECRET`** en Actions.
7. Repuntar los paneles de Codeoscopic y Meta. Si `app.grupoasegura.com` se mueve limpio las URLs no cambian; el riesgo es la ventana de re-verificación del dominio.
8. Verificar antes de retirar a Manuel y cancelar nada.

### Los tres gates de verificación

- **(a)** Tras transferir, **descifrar un registro real**. No vale con ver que la variable aparece en el panel.
- **(b)** Ver **una ejecución real del cron en su franja trayendo filas nuevas**. No vale con que el secreto esté puesto.
- **(c)** Un pull completo de CIMA **y** una cotización de punta a punta en Codeoscopic, antes de la retirada.

---

## 8. Frentes abiertos que heredas

| Frente | Estado |
|---|---|
| **Emisión** | Nunca probada en producción. Cotizar sí, emitir no. |
| **Idempotencia de Codeoscopic** | Nuestro lado está cableado (candado `submit_in_flight_at` + identificador propio `submit_attempt_id`). **Codeoscopic no deduplica por nuestro identificador**, así que un reintento tras una respuesta perdida podría crear un duplicado en su lado. Con la emisión apagada da igual; antes de encenderla hay que probarlo en serio. |
| **Mapfre parada / Occident en `review`** | Ver §4. |
| **Drain de facturable de TIREA** | Pendiente desde el 12-ago (`cima-pull` con `reconcile=true`). Nunca se dio el OK. |
| **8 filas huérfanas en `usuarios`** | Ver §5. |
| **~723 fichas de cliente duplicadas por DNI** | *Sin verificar hoy* — viene de una incidencia anterior. Confírmalo antes de fiarte del número. |
| **Vercel Blob** | Puede no viajar con el proyecto (el almacén va atado a la cuenta). Son ~4 ficheros. |
| **Contrato Codeoscopic** | Firmado, 0,50 € por operación facturable. **Sin DPA.** |

---

## 9. Dónde estás en lo legal

- **Tú ya eres el responsable del tratamiento** — consta así en el registro de actividades de tratamiento. Esto no es una cesión de datos a un tercero: es el responsable llevándose lo suyo a su propia infraestructura.
- Manuel ha venido actuando como encargado. Al terminar el encargo le toca **borrar sus copias** (art. 28.3.g RGPD), incluida la del paso 0 de la secuencia de corte. Conviene dejarlo por escrito el mismo día del corte.
- **DPO:** tú mismo, auto-designado. Firmado el 13-jun-2026 y notificado a la AEPD el 15-jun-2026 (registro REGAGE26e00056270250). Hay un **conflicto de independencia documentado** (art. 38.6: el responsable siendo su propio DPO) asumido como riesgo y pendiente de dictamen de abogado.
- Pendientes anteriores cuyo estado **no he verificado hoy**: sign-off de LDS C1, RIPD, y los DPA de proveedores.

---

## 10. Dónde está cada cosa

Todo lo de abajo está en el repo `manuelsuarez/asegura`, donde ya tienes acceso.

- **Esquema de la base de datos:** `src/db/schema.ts` (declarado) y `src/db/rls-policies.sql` (las 86 políticas).
- **Cifrado:** `src/lib/crypto/field-encryption.ts` · **Índice ciego:** `src/lib/clientes/blind-index.ts`
- **CIMA:** `src/lib/integrations/cima/` · handler del cron en `src/app/api/crons/cima-pull/route.ts` · workflow en `.github/workflows/cima-pull.yml`
- **Runbook del adaptador:** `docs/runbooks/cima-adapter-fly-deploy.md`
- **Decisiones de arquitectura** (`docs/decisions/`), las que te van a hacer falta:

| ADR | De qué va |
|---|---|
| **ADR-007** | CIMA/EIAC como canal primario y el adaptador Java |
| **ADR-009** | Por qué el adaptador corre en Fly.io |
| **ADR-013** | **RLS como backstop; la defensa real es de capa de aplicación** |
| **ADR-016** | **El índice ciego HMAC** |
| **ADR-025** | Qué se cifra dentro de los campos JSON |
| **ADR-019** | Frontera de opt-out entre inquilinos |
| **ADR-011 / ADR-012** | Modelo de negocio y marca |

> **Ojo al comparar:** el repo te da el esquema **declarado**. Una parte del DDL se aplicó como SQL directo, así que el esquema **real** puede diferir. Si vas a comparar, compara contra un volcado de la base, no contra el repo.
