---
name: cima-ingesta
description: >
  La ingesta de CIMA/EIAC/TIREA de Grupo ASegura de punta a punta: la cadena
  (Actions → CRM → adaptador Java en Fly → TIREA), la cuarentena, la caja negra
  del webhook de Codeoscopic, la cobertura de campos y el cuadro de la pantalla.
  Úsala SIEMPRE que la ingesta se quede muda, aparezcan ficheros en `review`,
  Manuel mande una captura de alerta, o antes de tocar cualquier cosa de la
  cadena. Router: los tres inventarios viven en docs/.
---

# La ingesta de CIMA (router + manual de diagnóstico)

**Qué es CIMA:** la pasarela sectorial (TIREA) por la que las compañías dejan a la
correduría ficheros **EIAC** en XML — pólizas (POL), siniestros (SIN), recibos (REC)
y cuentas/comisiones (CEF). Es la fuente de la que sale la cartera viva: por eso la
regla de Alberto «lo que entra por CIMA es cliente actual; el resto son leads».

## 📁 Antes de desarrollar NADA de CIMA: la carpeta «CIMA» de Google Drive

Regla de Alberto (24/09/2026): **todo desarrollo de CIMA empieza en la carpeta «CIMA» de Drive**
(id `1DoHnkMj2gYepUKR3A3SmkBE4JIE9iwM1`). Ahí están:
- **La norma**: `209_IAC_ESP_DOC_NORMAS-USO-V07-1_V03-1.pdf` (normas de uso EIAC V07.1: p. ej. §6.1.3,
  los bloques de historial traen solo lo NUEVO del periodo → se fusionan, no se sustituyen). Los
  Documentos Estándar V07.1 y el Diccionario de datos V06 están en Drive fuera de esa carpeta
  (`209_IAC_ESP_DOC_DOCS-ESTANDAR-EIAC-V07-1_V05`, `209_IAC_ESP_DOC_DICCIONARIO_DATOS_V06`): las claves
  oficiales (situación, acción, figura, posición…) salen de ahí, **nunca se adivinan**.
- **Copia de lo recibido**: zips por trimestre del Portal CIMA (`28-03-26a26-06-26.zip`,
  `26-06-26a24-09-26.zip`; POL, REC, SIN, CEF). Sirven para validar el lector contra ficheros REALES
  (no fixtures escritos a mano) y para reprocesar con `cima-rescate-lote` cuando el lector aprende un campo.

⚠️ **Reprocesar SIN viejos después de uno más nuevo RETROCEDE el siniestro**: `persist-siniestro` pisa
los campos mutables (estado, fecha, tipo, lugar, daños) sin mirar la fecha del fichero. El lote va en
orden (fecha del dato, luego 311 < 361 < 399) y, si la BD tiene SIN posteriores al último zip
(`cima_ficheros`), esos siniestros se restauran a mano al terminar.

🚫 **Los siniestros van SOLO de la compañía a nosotros.** TIREA (accesos.cima@tirea.es, 03/09/2026):
el proceso **841 «alta de nuevos siniestros» (mediador → entidad) NO está disponible por CIMA**, las
compañías no lo tienen integrado y **no hay fecha planificada**. Lo único que un corredor puede enviar
hoy son los procesos **761 y 77X de recibos**, por el método `enviarFichero`. O sea: un parte se abre
por teléfono/web/correo de la compañía (o el cliente llama); nosotros nos enteramos por el SIN que
llega después. No se diseña nada que «mande el siniestro a la compañía por CIMA».

## 🚨 Lo que NO se toca ni se hace

1. **Confirmar un fichero a TIREA lo saca de la cola PARA SIEMPRE.** `POST
   /wse/confirmar-descarga` no es un ack idempotente: consume. Por eso el
   `confirm` va **siempre después del commit** y por eso existe la copia
   preventiva del crudo — si se confirma y luego se pierde, la compañía **no lo
   reenvía**. Cualquier cambio que adelante un `confirm` es un cambio de alto
   riesgo.
2. **El adaptador Java NO se reescribe, pero YA es entero de Alberto.**
   La app `asegura-app-cima-adapter` corre en la organización **`grupo-asegura` de
   Alberto** (medido en el panel de Fly el 21/09/2026; esta línea decía «en la cuenta
   de Fly de Manuel» y era falso), y **el repo del código también es suyo desde el
   21/09/2026**: `albertosuarezgutierrez-gif/asegura-app-cima-adapter` (verificado por
   la API). Lo único que sigue fuera son los secrets de TIREA de PRODUCCIÓN. Usa WS-Security
   atípico (AES-256-GCM derivado del password) que `node-soap` no soporta, y un
   **JDK 8 sidecar** porque Xerces en 17 rompe validando las respuestas SOAP.
3. **El port a `apps/asegura` está APARCADO a propósito** (decisión de Alberto,
   02/09/2026: «fly es barato y ya está hecho»). El inventario existe para no
   tener que releer el repo el día que toque, no como plan pendiente.
4. **Nada sale a una compañía ni a Codeoscopic sin OK explícito de Alberto para
   ESE envío.** Vale también para «solo preguntar una duda a soporte».
5. **El emparejador no inventa la FK.** Resuelve por `numero_poliza` normalizado
   + `codigo_entidad_dgs` y exige **exactamente un** candidato: 0 → cuarentena,
   ≥2 → cuarentena. Colgar un siniestro de la póliza equivocada es peor que no
   colgarlo. No lo «arregles» relajándolo.

## 🛟 Si CIMA enmudece, mira primero el PRESUPUESTO de Actions (23/09/2026)

El 22/09 **todos** los workflows del repo `asegura` fallaron en 3-4 s con `runner_id: 0` y sin logs: no
era código, era el presupuesto de GitHub Actions de la cuenta (0 $, «Stop usage», sin tarjeta) agotado
por `central`. Ese síntoma —fallo instantáneo sin máquina— se diagnostica en Billing, no en el código.
- Desde ese día hay **respaldo**: `apps/plataforma` → `/api/cron/cima-pull-respaldo` (09:00 UTC = 11:00 Madrid, solo si Actions no corrió + franjas FIJAS 14:00 y 18:30 UTC = 16:00 y 20:30 Madrid, recomendación de CIMA del 25/09)
  dispara el pull SOLO si la franja de Actions no completó (`decidirRespaldoPull`, >3 h; sin dato NO
  dispara). Se enciende con `ASEGURA_CRM_CRON_SECRET` en Vercel plataforma; sin ella, si CIMA está parado, lo avisa por Telegram (`correduria.cima-respaldo`).
- El vigía `correduria_ingesta` ya incluye el cron en su firma (`firmaAvisoIngesta`): antes vio las 37 h
  de parada y calló porque la firma no cambió.

## ✅ El `reconcile` YA está programado (medido 23/09/2026)

`cima-pull.yml` del repo `asegura` lo corre solo a las **06:00 UTC** (LOO-990,
`IS_RECONCILE_SCHEDULE`). Esta sección decía que seguía «sin aplicar» y era falso.
🚨 **Pero el reconcile solo re-saca ficheros SIN confirmar.** Un fichero con
objetos en cuarentena que ya se confirmó a TIREA (`estado='confirmed'`,
`error_detalle='review_parcial_*'`) no vuelve por esa vía: sale del crudo
(`cima_cuarentena_crudo`, guarda el JSON de TODO fichero 30 días, **solo desde el
17/09/2026**) con `cima-reprocesar-cuarentena.yml`, o —si es anterior— bajando
el XML del Portal CIMA y metiéndolo por `POST /api/internal/cima/ingerir-manual`.
Caso: 36 recibos de Occident del 15/09 (dos REC 299) atascados por pólizas
duplicadas que se fusionaron el 17/09; su crudo no existe. **Rescatados el 24/09**
(39/39 en `poliza_recibos`) con `cima-rescate-manual.yml` del repo `asegura`
(asegura#850): `workflow_dispatch` con el zip en base64 (≤ ~48 KB de zip); para
zips más grandes, rama temporal con el zip cifrado (openssl aes-256-cbc -pbkdf2) y
la clave como input. Tras usarlo: **borrar el run entero y la rama** (los inputs
llevan datos personales; borrar solo los logs no basta).

### 📁 Archivo de CIMA en Drive (24/09/2026)
Carpeta **`asegura/CIMA`** del Drive de Alberto (id `1DoHnkMj2gYepUKR3A3SmkBE4JIE9iwM1`):
las descargas del Portal CIMA («Ficheros recibidos», zip de zips EIAC por rango de
fechas) van **ahí**, y es la copia larga — la nuestra (`cima_cuarentena_crudo`) dura
30 días. Primer contraste completo (24/09): 154 ficheros 28/03–24/09, **153 ya en
`cima_ficheros`** (el que falta, `28823484E_…_ORIGINAL`, no es EIAC). Para leer
un zip grande de Drive, que lo descargue un agente: el harness guarda la salida en
disco y se decodifica con python, sin copiar el base64 a mano.
✅ **Mapfre (C0058) activó el envío diario el 25/09/2026** (lo configuró CIMA en el portal de mediadores
de Mapfre, ticket SAU-24238). Hasta entonces sus 14 ficheros eran solo la carga inicial, todos generados el
26/05 entre 19:30:25 y 19:30:28 (el «23/06» de la BD es cuando NOSOTROS los cargamos). Primeros diarios:
REC 261 + SIN 311 el 25/09 a las 18:31 UTC, código mediador 5239640, ambos auto y casados sin cuarentena.
**POL y el resto de ramos aún no han llegado**: si siguen sin llegar, reclamarlo en ese mismo ticket.
**Antes de reprocesar un `sin_poliza_en_cartera`, busca duplicados vivos**
(mismo número normalizado + DGS, `merged_into_poliza_id IS NULL`): el 23/09 quedaban
3 parejas que solo diferían en la puntuación (`HR G`/`HR-G`, `/ 045981539`).

## Quién manda qué, de verdad (medido el 16/09/2026)

Ficheros entrados en 90 días, por compañía. **Un total de cartera o de comisiones
sin decir qué compañías faltan es una cifra falsa.**

| Compañía | DGS | POL | REC | SIN | CEF | Último fichero |
|---|---|---|---|---|---|---|
| Occident | C0468 | 16 | 39 | 26 | 5 | **16/09** (a diario) |
| Allianz | C0109 | 5 | 8 | 13 | 3 | 03/09 (CEF) |
| Mapfre | C0058 | 6 | 6 | 2 | — | **25/09** (1.º diario; antes 23/06) |
| Reale | C0613 | 2 | 1 | — | — | 25/08 |
| Generali | C0072 | 1 | — | — | — | **14/09** |

🚨 **Generali SÍ vuelca por CIMA desde el 14/09/2026.** Las skills la daban por fuera de la pasarela
(cierto el 01/09, falso desde entonces): trajo su primer POL con pólizas reales de
cartera. Ese fichero es además el **único hasta hoy con avisos
de validación** (12 leves) — el resto de la serie va a 0/0/0.

**Mapfre estuvo del 23/06 al 25/09 sin mandar NADA, y es la compañía más grande de la
cartera** (64 pólizas vivas). El silencio era **aguas arriba** (CIMA no generaba ficheros
suyos: el envío diario no estaba configurado en el portal de mediadores de Mapfre), no de
nuestra tubería. Lección: si una compañía enmudece, lo primero es preguntar a CIMA si la
compañía tiene activado el envío automático, antes de buscar el fallo en el código.

## Diagnóstico: la ingesta está muda, ¿dónde miro?

En este orden, y **sin saltarse el paso 0**:

0. **¿Cuándo se desplegó lo que estás midiendo?** Una tabla de observabilidad
   vacía justo después de su PR no está rota: **todavía no ha podido medir**.
   Compara la fecha del merge con el `created_at` del último fichero PROCESADO.
   Ocurrió el 16/09/2026: `cima_cobertura_campos` y `cima_cuarentena_crudo` a 0
   con el último fichero de las 10:10 UTC y el PR desplegado a las 12:19 — iba
   camino de reportarse como avería.
1. **¿Late el cron?** Los heartbeats `cima_pull_*` en `seguros.operational_events`
   (`event_name`, `occurred_at` — **no** `event_type`/`created_at`). `cima_pull_started`
   sin su `completed` = la función muere a mitad.
2. **¿Llegan ficheros?** `seguros.cima_ficheros` por `codigo_entidad` y
   `tipo_objeto`. Si no llega nada de una compañía, el problema está aguas arriba.
3. **¿Contra qué lo contrastas?** El **export del portal de CIMA**
   («Ficheros recibidos», xlsx que baja Alberto) es la única lista INDEPENDIENTE:
   emisor, proceso, código interno, nombre del fichero y si está «Descargado WS».
   Cruzarlo contra `cima_ficheros` dice si se perdió algo entre CIMA y la BD.
4. **¿Entran pero no casan?** `estado='review'` = cuarentena. El **`error_detalle`
   es un contador, no un diagnóstico**: el motivo real está en `operational_events`
   (`cima_siniestro_sin_poliza_review`, `cima_recibo_sin_poliza_review`, con su
   `reason`).
5. **¿Se está perdiendo dato en silencio?** `cima_cobertura_campos`: rutas EIAC
   vistas contra rutas leídas por el mapper. Un campo que nadie lee viaja en un
   fichero que va perfectamente bien — no hay error que lo delate.
6. **¿Y el webhook de Codeoscopic?** `codeoscopic_cuarentena_crudo` (la caja
   negra). Guarda la FORMA del cuerpo rechazado, no el cuerpo en claro.

## 🪤 Las trampas de método que ya han costado una tarde

- **Un contraste que responde lo mismo a todo no está midiendo nada.** El campo 2
  del nombre del fichero **no es el número de póliza**: contrastar contra esa
  columna dijo «la póliza NO existe» de todo, confirmados incluidos.
- **La causa obvia suele ser la falsa.** `normalizePolizaNumber` parecía el
  sospechoso del atasco de la cuarentena; se midió y **quitar la puntuación no
  desatascaba ni una sola clave**. Iba camino de reportarse como causa.
- 🚨 **`sin_poliza_en_cartera` NO significa que la póliza no esté** (medido 21/09/2026).
  `matchReciboPoliza()` devuelve `null` con 0 candidatos, con ≥2 y con clave incompleta, y
  `persist-recibo.ts` escribe la MISMA etiqueta para los tres. Los 40 recibos de Occident
  atascados reclamaban 6 pólizas que están las 6 — **cada una DOS veces**, una del volcado y
  otra creada por CIMA días antes. Antes de concluir que una póliza no existe, cuenta cuántas
  filas tienen ese número con ese DGS. Detalle y alcance (19 números) en `docs/CIMA-CUARENTENA.md`.
- ⏳ **Una guarda anti-ambigüedad mide una FOTO; el peligro es dinámico.** El relleno de Plus
  Ultra del 06/09 dejó «0 filas en grupo ambiguo» y era cierto: dejó de serlo el 15/09, cuando
  CIMA creó sus propias filas con esos números. Si una migración depende de que no haya
  homónimos, el cepo tiene que seguir comprobándolo DESPUÉS.
- **Rellenar un campo para «arreglar» emparejamientos puede ROMPER los que
  funcionan.** Al dar `codigo_entidad_dgs='C0468'` a las pólizas «Plus Ultra»,
  11 pasaban de 1 candidato a 2 → ambiguo → cuarentena. La guarda no es «es Plus
  Ultra» sino **«su número la identifica sola»**: 216 rellenadas, 26 fuera.

## Lo que la pantalla enseña (y lo que NO alarma a propósito)

`/correduria` de plataforma pinta cuatro señales de la ingesta, y **solo cuando
hay algo que mirar** (regla de Alberto: el panel enseña errores). Lógica pura en
`packages/module-seguros/src/ingesta.ts`, pantalla en
`apps/plataforma/lib/correduria/ingesta-pantalla.ts`.

- **Cron mudo se lee ANTES que todo lo demás** (`HORAS_PULL_MUDO = 26`): si el
  cron no ha corrido, las demás señales salen a cero porque no ha entrado nada,
  no porque vaya bien.
- **La purga inminente es la única señal con fecha límite** (`DIAS_AVISO_PURGA`):
  cuando pase el TTL esa es la última copia y CIMA **no la reenvía**. Las demás
  esperan; esta caduca.
- **La cobertura de campos NO alarma nunca, y es deliberado.** El EIAC trae
  cientos de campos y siempre habrá alguno que no leamos: si encendiera el rojo
  estaría encendido para siempre, que es como muere una alarma. Se informa como
  hueco.
- **`undefined` no es `null`.** «El llamante no pide la señal» y «la pidió y
  falló» son cosas distintas; se normaliza en la frontera HTTP, que es donde el
  tipo miente (`esSalud` tolera campos nuevos, así que una `apps/asegura` vieja
  los manda como `undefined`).

## 📦 La caja negra del webhook de Codeoscopic

Guarda el cuerpo de lo que se rechaza (`invalid_json` / `invalid_payload`) para
poder saber **qué** nos están mandando, porque el contador de «138 inválidos en 7
días» del panel del vendor no dice ni una palabra de la forma.

- **El cuerpo se guarda CIFRADO** y la `forma` (lista de rutas, sin valores) en
  claro. 🚨 `encryptField` **devuelve el texto plano si no hay clave**: hay una
  comprobación explícita que guarda `''` en vez de PII sin cifrar. No la quites.
- El hash es del cuerpo **completo**, nunca del prefijo truncado; repeticiones
  suben `veces` en vez de crear fila. TTL 30 días.
- `GET /api/internal/codeoscopic/quarantine` expone forma y contadores, **jamás
  un cuerpo**.

**Primera captura real (16/09/2026, 15:47 UTC, 3 min después de desplegarse):**
`invalid_payload`, `<root>:invalid_type`, **raíz = `array` de 2 elementos**, rutas
`insurance.id`, `insurance.policyApplication.id`, `insurance.externalId`. O sea:
el vendor manda un **array** donde nuestro esquema espera un **objeto**. Es una
deriva de contrato, no un secreto mal configurado. ⚠️ **Con una sola muestra no se
cambia el esquema**: deja que la caja negra acumule unos días (el `veces` y la
estabilidad de la forma son la evidencia) antes de tocar el parser.

## Índice — dónde está el detalle

- **`docs/ASEGURA-CIMA-INGESTA-INVENTARIO.md`** — la cadena completa, el contrato
  con el adaptador, qué es puro y qué toca BD, las envs, las tablas que escribe y
  el orden barato si algún día se hace el port.
- **`docs/CIMA-CUARENTENA.md`** — por qué se llena la cuarentena, el caso Plus
  Ultra medido, el modo `reconcile` y el parche del workflow **sin aplicar**.
- **`docs/ASEGURA-CIMA-COBERTURAS.md`** — qué coberturas manda cada compañía, la
  semántica de `capital_asegurado` (`0` ≠ sin cobertura, `INF` = ilimitado, NULL =
  no informado) y la consulta para regenerar el catálogo.
- **`docs/CIMA-CAMPOS.md`** — TODOS los campos que trae CIMA (POL/REC/SIN/CEF) y qué
  compañía manda cada uno, sacado de los XML reales. Regla de Alberto (24/09/2026): CIMA
  trae casi todo el PDF de la póliza, así que un campo que está ahí y no se lee es un dato
  tirado. **Copia de TODO lo de CIMA en Google Drive, carpeta «CIMA»** (zips del Portal
  CIMA): es lo que permite reprocesar con `cima-rescate-lote` (repo `asegura`) cuando el
  lector aprende un campo, porque TIREA no reentrega lo confirmado.
- Negocio y ciclo semanal → skill **`agente-correduria`**.
- Pantallas y escrituras del CRM → skill **`correduria-crm`**.
- Infra y traspaso → `apps/asegura/CLAUDE.md` + `docs/TRASPASO-CORREDURIA.md`.
