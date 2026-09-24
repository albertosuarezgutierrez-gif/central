# Que vean su cartera — antes de repartir accesos del portal

**Fecha:** 05/09/2026 · **Estado:** diseño aprobado por Alberto, pendiente de plan
**Apps:** `apps/asegura-portal` (cliente) · `apps/asegura` (puerto) · `apps/plataforma` (pantalla de Alberto)
**Entrega 1 de 4** — ver §7 para el reparto completo.

---

## 1. Por qué existe esto

Alberto va a dar acceso al portal a **toda su cartera**. Medido contra la BD el 05/09/2026,
aplicando la regla real de `elegirFicha()` y no un recuento crudo:

| | |
|---|---|
| Titulares con póliza viva | **80** |
| Entran y **ven su cartera** | **46** |
| Entran y ven el portal **vacío** — no hay ningún correo suyo en la BD | **29** |
| Entran y ven el portal **vacío** — su correo es AMBIGUO (dos fichas lo declaran propio) | **5** |

**34 de 80 entran y no ven nada.** Y desde el código los tres desenlaces se ven igual: no falla
nada, no hay error, no hay log. Es el modo de fallo que este repo persigue —«se ve todo bien y
está mal»— aplicado justo al primer minuto de un cliente en el producto.

El coste de no arreglarlo antes de repartir: **34 llamadas** de gente convencida de que ha perdido
sus seguros, y el estreno del portal asociado a que no funciona.

### Qué se midió, para poder repetirlo

La regla que decide es `elegirFicha()` (`apps/asegura-portal/lib/vinculo-elegir.ts`): agrupa
candidatos por ficha, el email **principal** (`clientes.email_lookup_hash`) gana al de contacto
(`cliente_emails`), y solo hay `ambiguo` cuando **dos fichas declaran el mismo correo como suyo**.
La medición replica esa regla en SQL: por cada hash, cuántas fichas vivas lo tienen como principal
y cuántas en total; luego, por cada titular, si alguno de sus correos le da la victoria a él.

🚨 Un recuento ingenuo de «correos que aparecen en más de una ficha» da **256** en toda la BD y
**5** titulares vivos afectados; da la casualidad de que coincide con el número final, pero es otra
pregunta. Si se vuelve a medir, hay que aplicar el desempate: sin él, cualquier correo usado como
contacto en la ficha de un familiar contaría como ambiguo y la cifra se dispara.

---

## 2. Lo que NO hay que construir

Esto es la mitad del valor de este documento. Tres de las cuatro cosas que parecían trabajo **ya
están hechas**:

| Parecía que faltaba | Ya existe | Dónde |
|---|---|---|
| Una pantalla para ver a quién le falta contacto | **Sí, y mira CUATRO sitios** (ficha · su propio dato colgado de la póliza · otra persona de la póliza · `cliente_relaciones` en las dos direcciones), con 6 estados y textos que ya explican la consecuencia | `apps/asegura/lib/clientes-sin-canal.ts` → `/api/operador/sin-canal` → proxy → `apps/plataforma/.../correduria/SinCanal.tsx` |
| Poder añadirle un correo a un cliente | **Sí**, con detección de duplicados, `forzar` para el caso matrimonio, espejo a la columna principal y fila en `historial_interno` | `POST /api/operador/cliente/contactos` → `anadirContacto()` de `apps/asegura/lib/cartera-edicion.ts`; pantalla en `/correduria/cliente/[id]` pestaña «Contactos» |
| Recalcular el índice ciego al añadir un correo | **Sí**, en cada escritura (`cifrado()` → `computeEmailLookupHash`), no solo en la ingesta | `apps/asegura/lib/cartera-edicion.ts` |
| Que `/boveda` distinga «sin ficha» de «ficha sin pólizas» | **Sí**, dos textos distintos | `apps/asegura-portal/app/(portal)/boveda/page.tsx` |

**Consecuencia:** añadirle hoy el correo a uno de los 29 ya hace que se vincule la próxima vez que
entre. El mecanismo funciona. Lo que falta es **saber a quién le pasa** y **que el portal lo diga
cuando pasa**.

---

## 3. El hueco real, en una frase

> La pantalla de Alberto sabe si a un cliente **se le puede escribir**. No sabe si ese cliente
> **puede entrar al portal y ver su cartera**. Son preguntas distintas y hoy solo se responde una.

Ejemplos que lo demuestran, los dos reales en esta cartera:

- Un cliente con teléfono y sin correo sale hoy como **«Solo teléfono»** — cierto, y no dice que en
  el portal verá una pantalla vacía.
- Un cliente cuyo correo lo declara también otra ficha sale hoy como **«Localizable»** —
  perfectamente cierto para escribirle, y sin embargo **no se vinculará nunca**.

`contactoEfectivo()` no tiene ningún concepto de unicidad, y no debe tenerlo: responde de dónde
sale el contacto. La vinculabilidad es una pregunta nueva.

---

## 4. Diseño

Tres cambios. Ninguno crea tablas.

### 4.1 · Subir `elegirFicha()` al paquete compartido

**Problema:** la regla que decide si un correo identifica a una ficha vive en
`apps/asegura-portal/lib/vinculo-elegir.ts`. `apps/asegura` la necesita ahora para responder «¿este
cliente podrá entrar?», y **ya declara `@central/module-seguros-portal` como dependencia**.

**Qué se hace:** mover el fichero (y su `.test.ts`) a
`packages/module-seguros-portal/src/vinculo-ficha.ts`, exportarlo por el barril, y que
`lib/vinculo-elegir.ts` del portal desaparezca — `lib/vinculo.ts` importa del paquete.

**Por qué no se copia:** dos copias de este desempate acaban dando respuestas distintas a la misma
pregunta desde dos pantallas, sin que falle nada. Es literalmente el fallo que la propia cabecera
de ese fichero documenta como «cómo llegó a producción».

⚠️ El movimiento es mecánico salvo un detalle: el test vive hoy junto al fichero y corre con
`node --test` desde el portal. Al mudarse pasa a correr con los del paquete, que es donde debe
estar.

### 4.2 · La pantalla de Alberto responde la pregunta nueva

**Dónde:** `clientesSinCanal()` en `apps/asegura/lib/clientes-sin-canal.ts`, su puerto y la
pantalla `SinCanal.tsx`.

**Qué se añade:** por cada cliente, un campo nuevo `portal` con **tres estados y un cuarto para el
«no se ha mirado»**:

| Estado | Significa | Qué tiene que hacer Alberto |
|---|---|---|
| `puede_entrar` | Al entrar con su correo verá su cartera | nada |
| `sin_correo` | No hay ningún correo suyo en la BD | pedirle el correo y añadirlo en su ficha |
| `ambiguo` | Su correo lo declara como propio **otra ficha** | decidir de quién es ese correo; no se funden fichas solas |
| `null` | asegura no lo informó | **no es 0 y no es «puede»**: es «no se ha podido mirar» |

⚠️ **El SQL de hoy NO lee los hashes** — comprobado: cero apariciones de `email_lookup_hash` en
`clientes-sin-canal.ts`. Mira `cliente_emails` y `cliente_telefonos` para saber si HAY contacto,
no para saber si ese contacto es único. Así que hay que **añadirlos a la consulta**: por cada
ficha viva sus hashes de correo y de dónde vienen (columna principal vs. `cliente_emails`), que es
justo lo que `elegirFicha()` recibe como `Candidato`. El estado se **deriva** en el helper puro,
con test, sobre esos candidatos.

⚠️ **Y cuidado con el `LIMITE = 2000` de esa consulta**: si trunca, hoy todos los recuentos pasan
a `null` en bloque. El estado nuevo tiene que respetar lo mismo — un `puede_entrar` calculado
sobre una lista truncada es una afirmación sobre datos que no se han mirado.

🚨 **El hash NO cruza el puerto.** Es un dato derivado de un dato personal; por el puerto viaja
solo el estado (`puede_entrar` | `sin_correo` | `ambiguo` | `null`). Misma regla que el DNI, que ya
sale enmascarado y como etiqueta opaca.

**En la pantalla:** una segunda cifra junto al titular actual —«N clientes no verán su cartera al
entrar»— y el estado en cada fila. Se apoya en el mecanismo de contador al padre que ya usan las
secciones de `/correduria`, con sus tres desenlaces (`{n}` · `n+` · `!`) y ninguno es 0.

### 4.3 · El portal dice la verdad cuando sale vacío

**Dónde:** `apps/asegura-portal/app/(portal)/boveda/page.tsx` y `app/Entrada.tsx`.

**El fallo de hoy:** un cliente `ambiguo` ve un aviso de **2,5 segundos** en la pantalla de entrada
—«Hay varias fichas con este email…»— y después, en la bóveda, el mismo texto genérico que un
desconocido: *«No hemos encontrado ninguna póliza a nombre de este email»*. Que es **falso**: sí se
han encontrado, y por eso precisamente no se le enseña ninguna.

**Qué se hace:** que el estado del vínculo sobreviva al salto a `/boveda` y la bóveda tenga **tres
textos** donde hoy tiene uno:

1. **Sin ficha** (hoy, se queda igual): «No hemos encontrado ninguna póliza a nombre de este
   email. Si eres cliente con otro email, escríbenos…»
2. **Ambiguo** (nuevo): decirle que su correo aparece en más de una ficha, que **lo estamos
   revisando** y que no ha perdido nada. Nunca «no encontramos pólizas».
3. **No se ha podido comprobar** (`sin_clave` / `error`, nuevo en la bóveda): que es un problema
   nuestro y se reintenta al volver a entrar. Hoy esto solo se dice en la entrada, y el que llega
   directo a `/boveda` con sesión viva no lo ve nunca.

⚠️ **Cómo viaja el estado, y qué NO vale.** No puede ir en la URL (`?vinculo=ambiguo`): sería un
parámetro que cualquiera se escribe y una pantalla que miente a quien la manipula. Va **derivado en
el servidor** en la misma lectura de cartera, como un estado más de `CarteraPortal` — que ya
distingue `vinculada` de «vinculada sin pólizas».

---

## 5. Lo que se descarta, y por qué

- **Fusionar automáticamente las fichas con correo ambiguo.** Dos NIF distintos no se funden jamás,
  y aquí ni siquiera hay NIF en la mayoría de los casos. Se le presenta a Alberto y decide él.
- **Vincular por teléfono a los 29 sin correo.** Un móvil identifica un HOGAR: 740 números
  compartidos por 1.599 fichas. Ya está descartado en `vincularIdentidad()` a propósito y no se
  toca.
- **Dejar entrar sin vincular «a ver qué pasa».** Es lo que pasa hoy y es el problema.
- **Un backfill de `email_lookup_hash`.** No hace falta: el hash se recalcula en cada escritura de
  contacto. El que no tiene correo no tiene hash porque no tiene correo.

---

## 6. Verificación

Nada de esto se da por bueno sin verlo:

1. **Los cepos existentes de `test/regression-clientes-sin-canal.test.ts` siguen verdes.** Son 10
   familias y varias son de la doctrina de `null` — el campo nuevo entra en ellas: `portal`
   ausente ⇒ `null`, jamás `puede_entrar`.
2. **Cepos nuevos**, con su mutación vista morder:
   - `elegirFicha()` importado del paquete en las DOS apps; ningún fichero suelto lo redefine.
   - El hash no aparece en la respuesta del puerto ni en la pantalla.
   - La bóveda tiene los tres textos, y el de «ambiguo» no contiene «no hemos encontrado».
3. **Contraste contra la BD real**: el recuento del puerto tiene que dar **46 / 29 / 5** sobre la
   cartera de hoy. Si da otra cosa, la derivación no replica `elegirFicha()` y no se sigue.
4. `pnpm test`, typecheck de las tres apps con `prisma generate` de cada una, lint y build.

---

## 7. Qué queda fuera (y en qué orden viene)

| Entrega | Qué | Bloqueo conocido |
|---|---|---|
| **1 · esta** | Que vean su cartera | — |
| **2** | Encender el aviso de vencimiento + panel de configuración con **ese único interruptor**. Nace la tabla de preferencias | `ASEGURA_AVISOS_ACTIVOS`, `CRON_SECRET`, `ASEGURA_MAIL_FROM` y proveedor de correo en Vercel; y contar en modo ensayo que salen ≤110 antes de encender |
| **3** | Eventos nuevos: **anulación** (`situacion='AN'`, observable) y **«tu compañía ha emitido un recibo»** | Ninguno detecta un CAMBIO hoy: `updated_at` no sirve (cada pull de CIMA reescribe la fila), hay que guardar el estado anterior |
| **4** | Más información: **coberturas completas** (1.425 cargadas, hoy se enseñan 4), **detalle económico**, **estado de gestiones** | — |

🚫 **«Avisar antes de que llegue el recibo» no entra en ninguna entrega.** No hay dato: de los 183
recibos de la cartera viva, **cero** tienen emisión futura y no existe columna de fecha de cargo
prevista. CIMA manda el recibo cuando ya está emitido. Lo entregable es «ya te lo han emitido»,
que es un hecho; una fecha estimada pintada como dato es exactamente lo que este repo prohíbe.

🚫 **«Tus documentos» tampoco.** La tabla `documentos` existe y está bien pensada —incluye
`visible_por_cliente`— pero tiene **0 filas**, igual que `poliza_documentos`. No es un problema de
código: no hay nada que servir hasta que se decida quién sube esos PDFs.

---

## 8. Riesgo que este trabajo NO cubre

Los 29 sin correo **no se arreglan con código**: hace falta que alguien les pida la dirección. Este
trabajo hace que Alberto sepa exactamente quiénes son y que el portal no les mienta mientras tanto.
Repartir accesos antes de haber recogido esos correos sigue siendo una decisión suya, ahora
informada.
