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

## 🚨 Lo que NO se toca ni se hace

1. **Confirmar un fichero a TIREA lo saca de la cola PARA SIEMPRE.** `POST
   /wse/confirmar-descarga` no es un ack idempotente: consume. Por eso el
   `confirm` va **siempre después del commit** y por eso existe la copia
   preventiva del crudo — si se confirma y luego se pierde, la compañía **no lo
   reenvía**. Cualquier cambio que adelante un `confirm` es un cambio de alto
   riesgo.
2. **El adaptador Java NO se reescribe, y su CÓDIGO no vive en ningún repo nuestro.**
   La app `asegura-app-cima-adapter` corre en la organización **`grupo-asegura` de
   Alberto** (medido en el panel de Fly el 21/09/2026; esta línea decía «en la cuenta
   de Fly de Manuel» y era falso). El repo del código SÍ sigue siendo privado de
   Manuel, con acceso de lectura para Alberto. Usa WS-Security
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

## ⏸️ El cabo suelto que sigue abierto

**El `reconcile` no está en la ejecución programada.** Vacía la cuarentena
reprocesando los `review` contra la cartera actual, es idempotente, y sale de un
input de `workflow_dispatch`: en los cron llega vacío. O sea, **la cuarentena
solo se vacía si alguien se acuerda de pulsarlo**. El parche (tres líneas, y por
qué NO vale un `||` de la expresión de GitHub) está escrito en
`docs/CIMA-CUARENTENA.md` y **sin aplicar**: vive en el repo `asegura`.

## Quién manda qué, de verdad (medido el 16/09/2026)

Ficheros entrados en 90 días, por compañía. **Un total de cartera o de comisiones
sin decir qué compañías faltan es una cifra falsa.**

| Compañía | DGS | POL | REC | SIN | CEF | Último fichero |
|---|---|---|---|---|---|---|
| Occident | C0468 | 16 | 39 | 26 | 5 | **16/09** (a diario) |
| Allianz | C0109 | 5 | 8 | 13 | 3 | 03/09 (CEF) |
| Mapfre | C0058 | 6 | 6 | 2 | — | **23/06** |
| Reale | C0613 | 2 | 1 | — | — | 25/08 |
| Generali | C0072 | 1 | — | — | — | **14/09** |

🚨 **Generali SÍ vuelca por CIMA desde el 14/09/2026.** Las skills la daban por fuera de la pasarela
(cierto el 01/09, falso desde entonces): trajo su primer POL con pólizas reales de
cartera. Ese fichero es además el **único hasta hoy con avisos
de validación** (12 leves) — el resto de la serie va a 0/0/0.

🚨 **Mapfre lleva desde el 23/06 sin mandar NADA, y es la compañía más grande de la
cartera** (64 pólizas vivas). Comprobado contra el export del portal de CIMA: en la
ventana 02/09–16/09 CIMA **no generó ni un fichero de Mapfre**, así que el silencio
es **aguas arriba, no de nuestra tubería**. Eso es una llamada a Mapfre, no un bug.

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

## 🪤 Las tres trampas de método que ya han costado una tarde

- **Un contraste que responde lo mismo a todo no está midiendo nada.** El campo 2
  del nombre del fichero **no es el número de póliza**: contrastar contra esa
  columna dijo «la póliza NO existe» de todo, confirmados incluidos.
- **La causa obvia suele ser la falsa.** `normalizePolizaNumber` parecía el
  sospechoso del atasco de la cuarentena; se midió y **quitar la puntuación no
  desatascaba ni una sola clave**. Iba camino de reportarse como causa.
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
- Negocio y ciclo semanal → skill **`agente-correduria`**.
- Pantallas y escrituras del CRM → skill **`correduria-crm`**.
- Infra y traspaso → `apps/asegura/CLAUDE.md` + `docs/TRASPASO-CORREDURIA.md`.
