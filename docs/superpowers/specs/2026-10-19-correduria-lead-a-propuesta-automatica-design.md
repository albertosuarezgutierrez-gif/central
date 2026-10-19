# Lead → datos → tarificación → propuesta → seguimiento, gobernado desde Telegram

> Spec (19/10/2026). Solo diseño: nada de código ni SQL aplicado. Parte de la rama
> `claude/email-lead-telegram-notification-gey28n` (PR #4837). **No pisa** el PR #4759
> (`docs/superpowers/specs/2026-10-15-correduria-consultas-companias-design.md`, consultas a compañías por
> correo): F5 lo CONSUME para el recordatorio «compañía sin respuesta», no lo rediseña.

## 0. Objetivo y principios

Alberto quiere que el ciclo de un lead de `hola@grupoasegura.es` sea casi automático y que él lo gobierne
**solo desde Telegram**, con el patrón del agente de huéspedes: llega una propuesta de acción → ✅ / ✏️ / 🚫 →
el sistema ejecuta.

1. **Telegram es la única pantalla.** Todo paso que pida una decisión llega como mensaje con botones; la
   intranet (`/correduria/oportunidad/[id]`) queda como respaldo y enlace «ver ficha», nunca como requisito.
2. **Nada sale al cliente sin botón** (regla del repo: «nunca mensaje a terceros sin OK explícito para ESE
   envío»). El botón ✅ ES ese OK. «Soltar a automático» (F5) es por TIPO de mensaje, con historial, y
   reversible con un botón.
3. **Dato que no hay ≠ dato no mirado.** Cada campo del contrato tiene tres estados: `null` = no se sabe
   (pendiente de preguntar o de leer), `'no_aplica'`/`[]` = revisado y no existe, valor = dato. Un fallo de
   IA, de BD o de IMAP NUNCA marca un campo como «no lo tiene»: deja `null` y lo dice en Telegram.
4. **Tope de gasto en dos capas, la más estricta manda.** Ya existe el tope mensual en euros de Avant2
   (`codeoscopic/tope-euros.ts`: aviso 60 €, bloqueo 70 €, «Autorizar +30 €» con `cas_tope`). Se añade un tope
   **diario** de tarificaciones automáticas (20/día ≈ 10 €, env `ASEGURA_TARIF_AUTO_TOPE_DIARIO`, mismo patrón
   que `presentacion-app-seleccion.ts`: inválido → 20, máximo duro 100). Lo que pasa del tope se queda en cola
   y se avisa; nunca se descarta.
5. **Una sola fuente por cosa.** Qué datos hacen falta = los validadores de los cotizadores, no una lista a mano.

## 1. Contrato de datos por ramo (fuente única)

### 1.1 De dónde sale (medido en el código)

| Cotizador | Fuente de «qué falta» | Validación de forma |
|---|---|---|
| Codeoscopic/Avant2 (auto, moto, hogar, vida, salud, decesos; 0,50 € por `POST /insurances`) | `revisarDatos<Ramo>()` en `apps/asegura/lib/codeoscopic/peticion-*.ts` → `Reparo[]` (`campo` + `motivo` legible). Persona común: `revisarPersona()` (`persona.ts`). | DNI/NIE con letra módulo 23 (`documentoEspanolInvalido`), `apellido2` obligatorio con DNI, `nacionalidad` ISO-3 con NIE/pasaporte, teléfono `^[6-9]\d{8}$`, fechas `aaaa-mm-dd`, matrícula (`reparosMatricula` + `module-seguros/matricula.ts`), CNO-11 en vida. |
| Bots RPA (`module-tarificacion`: Allianz comunidades/auto/moto/hogar, Mapfre auto/moto/hogar, Generali auto) | `faltanParaTarificar(compania, ramo, formulario)` de `obligatorios.ts`, que **ya declara** ser la fuente del «cuestionario al cliente — fase 2». `null` = no hay declaración (≠ «no falta nada»). | El validador del ramo (`validarFormularioAuto/Hogar`, `validarRiesgoComunidad`). |

**Hueco H1:** la petición de datos de PR #4837 (`DATOS_POR_RAMO` en `lead-correduria.ts`) es una TERCERA
lista escrita a mano: se desincroniza en cuanto un validador exija algo nuevo. Se sustituye por
`contratoDatos(ramo)` en `module-seguros` (puro), que compone: campos «del cliente» de `revisarDatos<Ramo>`
**∪** `faltanParaTarificar` de cada compañía RPA activa para ese ramo. Cepo: un test que, para un riesgo
vacío, compruebe que todo `campo` devuelto por los validadores tiene entrada en el contrato (rompe si alguien
añade un obligatorio sin pregunta).

### 1.2 Campo del contrato

`{ clave, etiqueta, pregunta (cómo se le pide al cliente), origen: 'cliente'|'catalogo'|'derivado',
obligatorio: 'siempre'|'para_emitir'|'condicional', valida(v) → motivo|null, sensible?: 'documento'|'salud' }`

- `origen: 'catalogo'` = el cliente NO lo da tal cual (ids del vendor: `codigoVehiculo` Base7, `garaje`,
  `estadoCivil`, `municipioId`, `tipoViaId`, `material`, `calidad`…). Al cliente se le pregunta en lenguaje
  normal y el sistema lo traduce con los catálogos de `catalogos.ts`; si la traducción no es única → pregunta
  a Alberto en Telegram con opciones (nunca se elige a ciegas).
- `origen: 'derivado'` = se rellena sin preguntar: fecha de matriculación estimada por la matrícula
  (`fechaMatriculacionEstimada`, y `/{ramo}/registration-date?plate=` del vendor), m²/año por catastro
  (`core-catastro`), CP→municipio. Lo derivado se marca como tal y se enseña a Alberto antes de tarificar.

### 1.3 Tabla por ramo (lo que se le pide al CLIENTE; el resto es catálogo/derivado)

| Ramo | Obligatorios (cliente) | Condicionales / para emitir | Opcionales |
|---|---|---|---|
| Común persona | DNI/NIE (letra válida), nombre, apellido1, apellido2 (con DNI), fecha nacimiento, sexo, estado civil, móvil 9 cifras | nacionalidad (NIE/pasaporte) · email, tipo y nº de vía (para emitir) | dirección completa |
| Auto | matrícula, marca/modelo/versión (→ Base7), fecha de carné, km/año, dónde duerme (→ garaje), CP de circulación, fecha de efecto | propietario y conductor habitual si ≠ tomador (sus datos de persona + carné); conductor ocasional | fecha de compra, remolque, seguro anterior (compañía, nº póliza, años asegurado, años sin siniestros, siniestros 5 años) |
| Moto | lo de auto + experiencia (esta moto / otra moto) y cilindrada | `motoAnteriorCodigo` si «otra moto»; carné B si el de moto no es B | igual que auto |
| Hogar | dirección completa (vía, nº, piso, puerta, CP), m², año construcción, habitaciones, tipo de vivienda, uso, régimen (propietario/inquilino), propietario = tomador | capitales continente/contenido (si no, se proponen y se dicen como supuesto) · Allianz/Mapfre: `hogar.conMadera` | ref. catastral, reforma, alarma, puerta blindada, joyas/objetos de valor, perros peligrosos |
| Vida | capital, fecha efecto | asegurado si ≠ tomador | duración, profesión (CNO-11), fumador |
| Salud | fecha efecto, asegurados (nombre, apellidos, nacimiento, sexo) | — | modalidad, capital. **Preexistencias = categoría especial RGPD: no se piden por correo** |
| Decesos | fecha efecto, asegurados | — | capital |
| Comunidades (RPA) | CP del edificio, m², año, plantas, nº edificios, viviendas+locales, capital continente, fechas efecto/término | — | póliza a reemplazar |
| Comercio / RC / otros | **sin cotizador automático** (`riesgo-unificado` §a): el contrato pide lo de `formulario-comercio/rc.ts` y la oportunidad pasa a «se cotiza fuera» (PR #4759) | | |

### 1.4 Estados del expediente de datos (por oportunidad)

`sin_pedir → pedida → incompleta (faltan N) → lista_para_tarificar → tarificando → tarificada | fallo`.
`lista_para_tarificar` ⇔ `revisarDatos<Ramo>(datos)` devuelve `[]` **y** el contrato no tiene ningún campo en
`null`. Es la ÚNICA puerta a F3; la entrada a los bots es `riesgoParaEncolar` con `faltanParaTarificar = []`.
Los datos viven en `info_riesgo.<claveDatosDeRamo()>` (lo que ya usa la pantalla de riesgo), no en una copia.

## 2. Fases (cada una entregable y verificable por Alberto)

### F1 — Petición de datos aprobada por Telegram y enviada EN EL HILO
- Al entrar el lead (PR #4837), en vez de la plantilla «para copiar», llega un borrador con botones (§3.1).
- ✅ envía la petición **como respuesta en el hilo** del correo del cliente, desde `hola@grupoasegura.es`.
- **Hueco H2 (el importante): hoy NO se puede responder en el hilo.** Lo que hay:
  - Entrada: plataforma lee el buzón `GMAIL_USER` por IMAP y ya guarda `In-Reply-To/References`
    (`imap.ts` `referenciasDe`) y casa respuestas con `correo_triaje.gmail_message_id` (`lead-correduria-hilo.ts`).
  - Salida a clientes: `enviarCorreoSeguido()` de `apps/asegura/lib/correo-envio.ts` (Resend API, remitente
    `remitenteCorreo()` = `hola@grupoasegura.es`, SMTP de respaldo). `CorreoCliente` **no admite cabeceras**:
    sin `In-Reply-To`/`References`, el cliente lo ve como correo nuevo.
  - `core-email` solo da transportes; no hay «send-as» de Gmail configurado en el código.
- **Cambio mínimo:** `CorreoCliente.enRespuestaA?: { messageId: string; references: string[] }` → cabeceras
  `In-Reply-To` + `References` (Resend acepta `headers`; nodemailer `inReplyTo`/`references`) y asunto `Re: …`.
  Con eso la respuesta del cliente lleva el Message-ID del lead en `References` y `esRespuestaDeLeadBD` ya la
  casa sin más cambios. El envío va por el **puerto de asegura** (es quien manda a clientes y registra en
  `registrarEnvioCorreo`), no por un transporte nuevo en plataforma.
- Límite conocido: lo enviado por Resend **no aparece en «Enviados» de Gmail**, así que en el Gmail de Alberto
  el hilo se ve cojo. Solución barata: `bcc` a `hola@` (el triaje lo reconoce por remitente propio y lo ignora).
  Alternativa (decisión de Alberto): SMTP de Gmail con alias «Enviar como hola@» verificado — más fiel en
  Gmail, pero depende de una contraseña de aplicación y de un ajuste manual en la cuenta.
- **Hueco H3:** el hilo se casa con «algún lead», no con SU oportunidad (la respuesta busca ficha por el
  `from`). Hace falta `correduria_hilo` (§5) que ate Message-ID ↔ oportunidad(es).
- Verificación: Alberto manda un lead de prueba desde otro correo → recibe el borrador → ✅ → la respuesta llega
  en el mismo hilo en el correo de prueba; contesta → Telegram dice «respuesta de <lead> en su hilo».

### F2 — Lectura de la respuesta y repregunta solo de lo que falta
- Respuesta casada → IA extrae `{clave: valor}` SOLO de claves del contrato → cada valor pasa su `valida()`;
  lo que no valida queda `null` con motivo (nunca se corrige a ojo: una letra de DNI que no cuadra se repregunta).
- Se escribe en `info_riesgo` por el puerto con actor `agente:triaje-correo` y `COALESCE` (un dato nuevo
  vacío no pisa uno viejo bueno; un valor de cajón `'otro'` se anula antes).
- Telegram: resumen «recibidos 9 · inválidos 1 · faltan 3» + borrador de repregunta con SOLO lo que falta (§3.2).
- **Adjuntos (foto de DNI, ficha técnica, póliza anterior):** son dato sensible. Hoy `imap.ts` descarta
  adjuntos salvo PDFs de aseguradoras (`REMITENTES_CON_PDF`). Se amplía SOLO para hilos casados de lead: el
  binario va cifrado (`module-seguros-pii` AES-256-GCM, **fail-closed**: sin `PII_ENCRYPTION_KEY` no se
  guarda, en desarrollo incluido) al almacén de documentos de asegura (`model Documento`), ligado a la ficha.
  Nunca se reenvía a Telegram (solo «📎 foto DNI recibida»), nunca queda en `/tmp` ni en logs. Leer la imagen
  con IA (OCR) es **decisión de Alberto** (proveedor y encargo de tratamiento); por defecto NO: se pide que
  escriba el DNI y la foto solo se archiva.
- Verificación: respuesta de prueba con un DNI de letra mala → Telegram lo marca inválido y la repregunta lo pide.

### F3 — Tarificación automática al completar
- Al pasar a `lista_para_tarificar`: Telegram «Listo para tarificar» con los supuestos derivados a la vista.
  En F3a el botón 💶 **Tarificar** es obligatorio; en F3b (tras 2 semanas sin errores) se dispara solo, dentro
  del tope.
- Ejecuta lo que ya existe: CDS por el mismo camino que `cas_tarif` («Pedir precio (0,50€)», botón de un solo
  uso, idempotencia) y los bots RPA por `riesgoParaEncolar`.
- Tope diario: contador por día Madrid en `correduria_tarif_auto_uso`; al llegar a 20 → cola + aviso con botón
  «+10 hoy». El tope mensual en euros sigue mandando por encima.
- Un 400 del vendor (`interprete-400.ts`) vuelve al contrato como campo inválido → repregunta (F2), no reintento.

### F4 — Comparativa → borrador de propuesta → botón Enviar
- Con ≥1 precio: Telegram con la comparativa (compañía · prima · franquicia · coberturas clave) y la
  recomendación; botones elegir/enviar (§3.4).
- El envío REUTILIZA `envio-presupuesto.ts` (`prepararAviso` / `ejecutarAviso`, portal con código, aceptación
  firmada), ahora en el hilo (`enRespuestaA`).
- IDD: antes de proponer, el cuestionario `necesidades-idd.ts` (`preguntasNecesidades(ramo)`) — lo que se
  dedujo de las respuestas (`deducirNecesidades`) se enseña a Alberto; lo no respondido NO se inventa y bloquea
  el envío. La información previa del mediador va SIEMPRE con `pieLegalLeadCorreo()`/`MEDIADOR` (DGSFP,
  independencia, remuneración, reclamaciones). Sin necesidades completas el botón Enviar no aparece.

### F5 — Seguimiento y «soltar a automático»
- Recordatorios (cron existente del triaje, cada ~10 min, ventana 9-20 h Madrid): cliente sin contestar a una
  petición 48 h → borrador de recordatorio; 2º a los 5 días; después «¿cerrar como perdida?». Propuesta sin
  aceptar 72 h → recordatorio. Compañía sin respuesta → lee el estado de las consultas del PR #4759.
- Soltar a automático por tipo (`peticion_datos`, `repregunta`, `recordatorio_cliente`, `propuesta`): se puede
  activar solo si los últimos N=20 envíos de ese tipo salieron con ✅ **sin editar**. Con el modo puesto, el
  sistema envía y avisa «enviado solo» con botón «⏸ volver a manual». `propuesta` nunca pasa a automático en
  esta spec.

## 3. Mensajes de Telegram (prefijo propio `clp`, libre hoy)

`parseCallback` parte por el primer `_`, así que el prefijo no lleva `_`. `callback_data` ≤ 64 bytes: se usa el
id corto del pendiente (`bigint`), nunca el UUID de la oportunidad ni datos personales. Todo `clp_*` exige que
pulse la persona autorizada (`cb.from.id === TELEGRAM_CHAT_ID`, como `cas`), y es de un solo uso (estado en BD).

**3.1 F1 — petición**
```
📨 Lead · Juan P. · Auto (hola@)
«Quiero precio para mi coche…»
Propongo responderle EN SU HILO pidiéndole 11 datos (borrador abajo).
```
`[✅ Enviar clp_env:<p>] [✏️ Editar clp_edt:<p>] [🚫 No responder clp_no:<p>] [🙋 Lo llevo yo clp_mio:<p>]`
✏️ abre `force_reply` (como `hsp_edit`); el texto respondido sustituye al borrador y vuelve con ✅.

**3.2 F2 — respuesta leída**
```
📥 Juan P. ha contestado · Auto
✅ 9 datos · ❌ DNI (letra no cuadra) · ⏳ faltan: km/año, dónde duerme
📎 foto del DNI archivada (cifrada)
```
`[✅ Repreguntar lo que falta clp_rep:<p>] [✏️ Editar clp_edt:<p>] [📋 Ver datos clp_ver:<p>]`

**3.3 F3 — listo para tarificar**
```
🧮 Listo para tarificar · Auto · Juan P.
Supuestos: matriculación 03/2019 (por matrícula) · km 10.000 (dicho por el cliente)
Hoy: 7/20 tarificaciones · mes: 31,50€/70,00€
```
`[💶 Tarificar (0,50€) clp_tar:<p>] [✏️ Corregir un dato clp_edt:<p>] [⏸ Esperar clp_no:<p>]`
Tope: `⛔ Tope diario (20) alcanzado: 3 en cola` · `[➕ 10 más hoy clp_top:<aaaammdd>]`

**3.4 F4 — propuesta**
```
📊 Juan P. · Auto · 4 precios
1. Allianz 412,30€ · TR franquicia 300€
2. Mapfre 398,00€ · TR sin franquicia ← recomendada (necesidad: «quiere todo riesgo»)
IDD: necesidades 6/6 ✓ · información previa ✓
```
`[📤 Enviar recomendada clp_pro:<p>:2] [🔀 Elegir otra clp_eli:<p>] [✏️ Editar texto clp_edt:<p>] [🚫 No enviar clp_no:<p>]`

**3.5 F5 — seguimiento y modo**
`⏰ Juan P. no contesta desde hace 48 h a la petición de datos` · `[✅ Recordar clp_env:<p>] [🗑 Cerrar perdida clp_per:<p>]`
`🔓 «repregunta»: 20 envíos seguidos sin editar` · `[Pasar a automático clp_aut:repregunta] [Seguir manual clp_no:<p>]`

## 4. Riesgos y qué NO se automatiza

| Riesgo | Mitigación |
|---|---|
| La IA lee mal un dato y se tarifica con él (0,50€ perdidos o precio falso) | `valida()` por campo; derivados y supuestos SIEMPRE a la vista en 3.3; F3a con botón. |
| Mandar a otra persona (hilo casado con el lead equivocado) | `correduria_hilo` ata Message-ID↔oportunidad; si una respuesta casa con 0 o >1 hilos, no se lee: aviso a Alberto. |
| Doble envío por reintento del webhook de Telegram | pendiente de un solo uso (`estado` con `UPDATE … WHERE estado='pendiente' RETURNING`). |
| Datos sensibles en Telegram/logs | Telegram solo ve nombre de pila, ramo y conteos; nunca DNI completo, foto ni salud. |
| Coste desbocado | tope diario + tope mensual existente; cola, nunca descarte. |
| Fallo de IMAP/IA tomado por «el cliente no contestó» | el recordatorio de 48 h solo cuenta si la última lectura del buzón fue OK; si no, «no se ha podido mirar». |

**No se automatiza:** emitir (sigue `cas_emitir` con su candado), preexistencias y datos de salud por correo,
elegir un valor de catálogo ambiguo, enviar la propuesta sin botón, contactar con compañías (eso es #4759, con
su propio OK), comercio/RC/otros sin cotizador, y nada por WhatsApp (sigue siendo enlace que manda Alberto).

## 5. SQL / tablas que harían falta (sin aplicar; schema `seguros` salvo indicación)

1. `seguros.correduria_hilo` — `id bigserial`, `correduria_id`, `oportunidad_id`, `cliente_id`,
   `message_id_raiz text`, `message_ids text[]` (los nuestros y los suyos), `email_cliente_ciego` (índice ciego,
   no el email en claro), `estado_datos` (§1.4), `ultimo_contacto_cliente_at`, `ultima_peticion_at`. Único
   `(correduria_id, message_id_raiz, oportunidad_id)`. RLS por `correduria_id` como el resto del schema.
2. `seguros.correduria_pendiente_tg` (análogo a `mensajes_pendientes_tg` de huéspedes) — `id bigserial` (el
   `<p>` del callback), `hilo_id`, `tipo` (`peticion_datos|repregunta|recordatorio_cliente|tarificar|propuesta`),
   `borrador text`, `tg_message_id bigint`, `esperando_edit bool`, `estado` (`pendiente|enviado|descartado|
   caducado`), `editado bool`, `decidido_por`, `decidido_at`, `created_at`.
3. `seguros.correduria_auto_config` — `tipo PK`, `auto bool default false`, `activado_por`, `activado_at`
   (gemela de `mensajes_auto_config`).
4. `seguros.correduria_tarif_auto_uso` — `dia date PK` (Madrid), `usadas int`, `tope_extra int default 0`.
5. Adjuntos: sin tabla nueva si `Documento` admite `origen='correo_lead'` y contenido cifrado; si no, columna
   `origen` y `cifrado bool` en esa tabla.
6. `info_riesgo`: sin cambio de forma; el estado por campo (`null`/`no_aplica`/valor + `fuente`
   `cliente|derivado|alberto`) va dentro de la clave del ramo, en un sub-objeto `_procedencia`.

Orden de PRs sugerido: (a) `contratoDatos` + cepo y sustituir `DATOS_POR_RAMO`; (b) `enRespuestaA` en
`correo-envio.ts` + tablas 1-2 + F1; (c) F2 sin adjuntos; (d) adjuntos cifrados; (e) F3 con tope; (f) F4; (g) F5.
