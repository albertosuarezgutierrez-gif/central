# La cuarentena de CIMA — por qué se llena y qué la vacía (06/09/2026)

> 🔌 **Router: skill `cima-ingesta`** — la cadena entera, el diagnóstico de «la ingesta está muda» y qué no se toca.

> Investigación pedida por Alberto («míralo») tras detectarse que el último siniestro de la
> cartera era del **02/07/2026** mientras la ingesta seguía viva. Lo que sigue está **medido**
> contra la Supabase compartida y contra el código del CRM (`albertosuarezgutierrez-gif/asegura`),
> no deducido.

## Lo primero: dos cosas que se habían dicho aquí y son FALSAS

1. **`review` no es una cola de revisión manual.** Es una cuarentena automática, y las 43 filas
   que había tenían todas `error_detalle` escrito y `poliza_id` a NULL.
2. **«POL y REC sí entran» era falso para Occident.** De sus recibos, **17 confirmados y 18 en
   cuarentena** — casi la mitad no entraba.

Y una corrección de fechas: **no empezó el 02/07.** Occident tiene 2 ficheros de siniestros
confirmados, los dos del **23/06**, y 19 en cuarentena desde el 23/06 hasta el 05/09. Nunca
funcionó para Occident; el 02/07 es sólo el último siniestro que entró, y era de Allianz.

## La causa

`error_detalle` guarda un **contador** («0/1 siniestros»), no un diagnóstico. El motivo real vive
en `seguros.operational_events`: `cima_siniestro_sin_poliza_review` (25) y
`cima_recibo_sin_poliza_review` (23), los dos con `reason = sin_poliza_en_cartera`.

El emparejador del CRM (`src/lib/integrations/cima/siniestro-matching.ts`) resuelve la póliza por

    numero_poliza normalizado  +  codigo_entidad_dgs = <la entidad que lo manda>

y exige **exactamente un** candidato: 0 → cuarentena, ≥2 → cuarentena. Nunca inventa la FK, que es
lo correcto — colgar un siniestro de la póliza equivocada es peor que no colgarlo.

Las 20 pólizas distintas que reclamaban los ficheros atascados se repartían así:

| | Claves | Diagnóstico | Se arregla en |
|---|---|---|---|
| **4** | la póliza está y casaba ya | nadie reprocesaba la cuarentena | el cron |
| **6** | están, pero como «Plus Ultra» con `codigo_entidad_dgs` a NULL | `NULL = 'C0468'` es falso: inalcanzables | la cartera |
| **10** | no existen con ese número en ninguna compañía | Occident manda actividad de pólizas que no tenemos | una llamada |

### Dos causas que PARECÍAN buenas y no lo eran

- **No es la allowlist de compañías** (`CIMA_INGESTA_CODIGOS_ENTIDAD`, fail-closed): cero eventos
  `cima_entidad_no_autorizada`.
- **No es la puntuación.** `normalizePolizaNumber` devuelve `lower` —el original en minúsculas, con
  sus barras y puntos— y sólo usa la versión sin signos para medir longitud, así que parecía el
  sospechoso obvio. Se midió: **quitar la puntuación no desatascaría ni una sola clave.** Iba camino
  de reportarse como causa.

Y un tercer falso positivo, del lado del método: el campo 2 del nombre del fichero **no es el número
de póliza** (en Occident son 6-7 caracteres y sus pólizas tienen 8-13). El primer contraste se hizo
contra esa columna y dijo «la póliza NO existe» de **todo, confirmados incluidos** — un contraste que
responde lo mismo a todo no está midiendo nada.

## Lo que se hizo (06/09/2026)

### 1. Plus Ultra ES Occident: 216 pólizas se hicieron NOMBRABLES

`apps/asegura/prisma/sql/2026-09-06_plus_ultra_codigo_dgs.sql`, **aplicada**. Las 242 filas del
volcado cuya `aseguradora` dice «Plus Ultra» tenían `codigo_entidad_dgs` a NULL (242 de 242);
Occident absorbió la marca y CIMA manda lo suyo como **C0468**.

🚨 **Rellenarlas las 242 habría ROTO lo que funciona, y se midió antes de escribir:** 11 comparten
número normalizado con una póliza **viva** de Occident (pasarían de 1 candidato a 2 → «ambiguo» →
cuarentena: se mandaría al agujero lo que hoy entra bien) y 7 números se repiten entre ellas. Por eso
la guarda no es «es Plus Ultra» sino **«su número la identifica sola»**. Resultado: **216 rellenadas,
26 fuera a propósito**, y comprobado después: **0 filas tocadas quedan en un grupo ambiguo**.

⚠️ El recuento posterior encontró **1** número ambiguo entre las C0468 — es la palabra literal
`pendiente`, el centinela disfrazado de dato, en tres filas «Catalana Occidente» que **ya llevaban el
código antes**. No lo introdujo este cambio, y el `normalizePolizaNumber` del CRM descarta los
placeholders, así que nunca es clave de emparejamiento.

**Vuelta atrás** (no hace falta tabla de lápidas: las pólizas que Occident manda por CIMA llevan
`aseguradora` = 'Occident', 19 de 19, nunca 'Plus Ultra'):

```sql
update seguros.polizas set codigo_entidad_dgs = null
where lower(btrim(aseguradora)) = 'plus ultra' and codigo_entidad_dgs = 'C0468';
```

Esto **no resucita ninguna póliza**: las 242 siguen siendo volcado histórico y `esCarteraViva()` las
deja fuera igual. Sólo las hace nombrables.

### 2. Se drenó la cuarentena con el modo `reconcile`

Existe y es bueno: `?reconcile=1` en `/api/crons/cima-pull` reprocesa los `review` sin confirmar
contra la cartera ACTUAL, y es idempotente («un fichero que sigue sin matchear vuelve a review, sin
daño»). Se lanzó primero **en seco** (`dryRun=1&reconcile=1` → `processed:10, persisted:4, errors:0`)
y luego de verdad. Cada corrida procesa un lote de **10**.

## 🚨 Lo que queda ABIERTO, y es lo importante

**El `reconcile` NO está en la ejecución programada.** Sale de `github.event.inputs.reconcile`, un
input de `workflow_dispatch`: en los cron de las 05:30 y 11:30 llega vacío. O sea, **la cuarentena
sólo se vacía si una persona se acuerda de pulsarlo** — había corrido 3 veces desde junio. Por eso
4 pólizas llevaban meses atascadas teniendo ya su fila en la cartera.

Mientras eso no cambie, **esto se vuelve a llenar solo**. El parche es de tres líneas y hace que la
segunda pasada del día reconcilie:

```yaml
# en `on.workflow_dispatch` no cambia nada; en el step «Resolve target», env:
  SCHEDULE: ${{ github.event.schedule }}

# y en el script, donde hoy pone `if [ "$RECONCILE" = "true" ]; then ... fi`:
  if [ "$RECONCILE" = "true" ] || [ "$SCHEDULE" = "30 11 * * *" ]; then
    PARAMS="${PARAMS:+$PARAMS&}reconcile=1"
  fi
```

⚠️ **La comparación va en el shell y NO con `||` en la expresión de GitHub.** `inputs.reconcile` es
la **cadena** `"false"` cuando el dispatch lo desmarca, y una cadena no vacía es *truthy* ahí: un
`a || b` daría reconcile SIEMPRE que se dispare a mano. Es el tipo de coerción que no falla, sólo
hace lo que no querías.

Se deja **sin aplicar**: vive en `albertosuarezgutierrez-gif/asegura`, que es el motor de ingesta y
no el repo de esta sesión.

## Los 10 que ningún código arregla

Diez pólizas por las que Occident manda siniestros y recibos y que **no existen con ese número en
ninguna compañía de la cartera**. Eso no es un bug: o son de otra correduría, o nunca se cargaron.
Es una llamada a Occident, y hasta que se haga esos ficheros volverán a cuarentena en cada
reconcile — que es lo correcto: mejor visibles ahí que colgados de la póliza de otro.

## 📏 El residuo, medido fichero a fichero (20/09/2026)

> 🚨 **Corrección del mismo día, y es la importante: la tabla que había aquí decía que quedaban
> «2 pólizas en riesgo» que solo se recuperaban pidiéndoselas a Occident y a Generali. Es FALSO.
> Las dos entraron solas el 17/09, dos días antes de que esto se escribiera.** El fallo de método
> está abajo, con la medición que lo destapa.

Auditoría de la correduría. Aquí se habían publicado tres cifras mías falsas; se corrigen con la
medición, no con una estimación mejor:

- «**1 póliza perdida**» → falso, se quedaba corto.
- «**46 objetos en 6 ficheros, ~37 irrecuperables**» → falso, se pasaba de largo. Ese 46 salía de
  contar OBJETOS de los ficheros y compararlos con FILAS de cuarentena, que guarda **el fichero**,
  no cada objeto: peras con manzanas.
- «**2 pólizas en riesgo, purga 17/10, solo se rescatan pidiéndolas a la compañía**» → falso, y del
  tipo caro: iba a hacer que Alberto llamara a dos compañías a pedir algo que ya tenía en casa.

**El arreglo hacia delante YA ESTÁ**, y no en este repo: `promoverCrudoAIncidencia()` del
`ingest-pipeline.ts` del CRM (LOO-826) asciende la copia cruda a incidencia con TTL de 90 días
**antes** de confirmar el fichero a TIREA, en los cuatro caminos (SIN, REC, CEF, POL) y tanto en la
rama de «0 persistidos» como en la de `anyReview || anyError`. No está envuelto en `try` a propósito:
si la promoción falla es preferible NO confirmar —el fichero se queda en la cola de TIREA y se
reintenta— que confirmarlo y perder los registros en review.

### 🪤 El fallo de método: leer el PRIMER intento y llamarlo «el estado»

La tabla anterior se construyó con los eventos `cima_fichero_persistido_parcial` del 14 y del 15/09,
que dicen `polizasReview: 1` en los dos ficheros. Son ciertos **y son del primer intento**. El
`reconcile` volvió a pasarlos el **17/09 a las 11:56-11:57 UTC** y en esa segunda vuelta entraron
enteros, sin emitir un solo `cima_fichero_review`. Nunca se miró más allá de la primera pasada, y un
evento de ingesta no es un estado: es lo que pasó **ese día**. El estado vive en la fila
(`seguros.cima_ficheros`) y, en última instancia, en `seguros.polizas`.

Las dos que se daban por perdidas, leídas de la tabla de pólizas, no del log:

| Compañía | Nº de póliza | Cliente | Ramo | Vencimiento | Alta |
|---|---|---|---|---|---|
| **Occident** (C0468) | `8-5.874.010-V` | Jose Enrique | 251 · embarcaciones | 29/05/2027 | 17/09/2026 |
| **Generali** (C0072) | `6E-G-475000053` | Monte carmelo 68 | 2161 · comunidades | 02/11/2027 | 17/09/2026 |

Las dos `activa` / `EV`, `import_ref` a NULL y con `eiac_xml_hash`: cartera viva **y en vigor**, no
leads. Y las dos son justo el objeto que su fichero había dejado en review — `RiesgoEmbarcaciones`
en el de Occident y `RiesgoComunidades` en el de Generali, ramos que el mapper no clasificaba.
`seguros.cima_ficheros` lo confirma por el otro lado: los dos ficheros en `confirmed`, con
`polizas_persisted` = `polizas_count` (7/7 y 14/14).

**Cómo se comprueba esto en un minuto, y el orden importa** — la fila primero, el log después:

```sql
-- 1) ¿queda algún fichero sin confirmar, o con menos pólizas guardadas que traía?
select nombre_fichero, codigo_entidad, estado, polizas_count, polizas_persisted, created_at::date
from seguros.cima_ficheros
where estado <> 'confirmed' or coalesce(polizas_persisted,0) < coalesce(polizas_count,0)
order by created_at desc;

-- 2) solo entonces, el log de ESE fichero, y hasta el ÚLTIMO evento (no el primero)
select occurred_at, event_name, payload
from seguros.operational_events
where payload::text ilike '%<nombre_fichero>%' order by occurred_at;
```

### El residuo de verdad, sobre los 147 ficheros (05/06 → 20/09/2026)

| | Qué es | Recuperable |
|---|---|---|
| **1 póliza** | `C0468_M00171_POL_132` (Occident, 20/06), 3 objetos / 2 persistidas, en review por `tipo_seguro_no_clasificable`. **Nunca se reprocesó** y su crudo ya se purgó | no por código |
| **3 siniestros** | `C0109_209-A-0018638-0000_SIN` (Allianz, abril), los tres `0/1 siniestros` = `sin_poliza_en_cartera` | son de los 10 de abajo |

No hay ningún otro fichero con déficit ni sin confirmar.

**De la póliza que falta no tenemos el número**: vivía en el XML y el crudo ya no está. Lo que sí
consta es el envío — Occident, mediador `M00171`, **20/06/2026**, tres pólizas — y las **dos** que sí
entraron, `BIDS024032` y `548820576`. Con eso se identifica la tercera en la intranet de la compañía
sin pedirle nada a nadie.

⚠️ **Lo que esta medición NO cubre: los recibos.** `cima_ficheros` solo lleva contadores de
`polizas_*`, así que sobre los ficheros `REC` no dice ni que falte ni que no falte nada — y la tabla
anterior afirmaba «≈40 recibos sin rastro» apoyándose en ella. Eso queda **sin medir**, que no es lo
mismo que medido a cero.

🔍 **Y la hipótesis que había aquí —«dos ficheros POL del mismo día acabaron distinto, luego hay un
camino que confirma por `xml_hash` sin volver a mapear»— se cae con esto:** acabaron igual, solo que
uno tardó dos días más. Se retira.

Lectura de solo lectura del estado agregado (espejo JSON del panel `/salud-cima`, cero writes salvo
`?record_run=1`): `GET https://app.grupoasegura.com/api/internal/cima/quarantine` con cabecera
`x-internal-secret`. Mira `crudoCuarentena.purgaInminente` y `cuarentenaPorRecuperabilidad`: ahí es
donde esto se ve venir antes de que el TTL lo borre.

---

## 🚨 El residuo de HOY son RECIBOS, y la causa es una póliza DUPLICADA (21/09/2026)

> Medido contra la Supabase compartida y contra el código del CRM ya clonado, no deducido.
> **Corrige por escrito tres afirmaciones de esta misma sesión** (una de ellas ya mergeada en el
> cuerpo del PR #3270): dijo que los 4 ficheros del aviso eran «3 SIN de Allianz + 1 POL» y que su
> única copia era el crudo con purga el 17/10. **Las dos cosas son falsas.**

### Quiénes son los 4 de verdad

La señal `residuoParcial` del vigilante está definida en
`src/lib/integrations/cima/health-snapshot.ts` del CRM y exige
`estado IN ('confirmed','persisted')` **y** (`polizas_persisted < polizas_count` **o**
`error_detalle LIKE 'errores_parciales%' / 'review_parcial%'`). Corriendo esa misma condición:

| Fichero | Tipo | Entidad | Qué falta |
|---|---|---|---|
| `C0468_M00171_REC_299_1_20260915…` | REC | Occident | `review_parcial_recibos` — **29** recibos a cuarentena |
| `C0468_8-92361_REC_299_1_20260915…` | REC | Occident | `review_parcial_recibos` — **10** recibos a cuarentena |
| `C0468_M00171_REC_261_1_20260712…` | REC | Occident | `review_parcial_recibos` — **1** recibo a cuarentena |
| `C0468_M00171_POL_132_1_20260620…` | POL | Occident | 2 de 3 pólizas |

Los **4 son de Occident** y **tres son RECIBOS**: exactamente el hueco que el apartado anterior
dejaba declarado como «sin medir, que no es lo mismo que medido a cero». Son **40 recibos**.

Los 3 SIN de Allianz que se habían señalado **no están en esta señal** (su `estado` es `review`, que
es la *cuarentena*, otra cosa) y además **ya no les falta nada**: su siniestro `660560623` de la
póliza `031698897` lo entregó entero el fichero del 30/04 el 24/06 a las 14:16:27 —
`cima_siniestro_persisted`— tres horas después de que la póliza naciera (10:12:14). Sus filas en
`review` son la foto del PRIMER intento, que es justo el fallo de método que este documento ya
describe un apartado más arriba. **Ninguno de los 4 tiene fila en `cima_cuarentena_crudo`** (0 por
`xml_hash` y 0 por `nombre_fichero`): las 10 filas del crudo son todas de septiembre y están sanas,
así que **la purga del 17/10 no tiene nada que ver con este residuo**.

### La causa de los 40 recibos: `sin_poliza_en_cartera` MIENTE

`matchReciboPoliza()` (`recibo-matching.ts`) devuelve `null` en tres casos distintos —0 candidatos,
≥2 candidatos y clave incompleta— y `persist-recibo.ts` escribe **el mismo** `reason:
"sin_poliza_en_cartera"` para los tres. O sea: la etiqueta afirma «esa póliza no está en la cartera»
cuando lo que ha pasado puede ser **que esté DOS VECES**. Es el centinela disfrazado de dato que
`CLAUDE.md` marca como el peor caso: un «no he sabido decidir» vestido de hecho — y es el que llevó a
concluir en este mismo documento que 10 pólizas de Occident «no existen» y que eso «es una llamada a
la compañía».

**Las 6 pólizas que reclaman los recibos rechazados existen las 6, y las 6 por duplicado**, las dos
filas con `codigo_entidad_dgs = 'C0468'`: una del volcado histórico del 21/06 y otra creada por CIMA
el 15/09 o el 17/09, con minutos de diferencia respecto al recibo que luego no supo cuál elegir
(`548325602` nació a las 10:17:28 y sus recibos se rechazaron entre las 10:17:46 y las 10:18:16).

### El alcance, que es mayor que los 40 recibos

Colisiones `numero_poliza` + `codigo_entidad_dgs` con **una fila de CIMA y otra del volcado** — cada
una es una póliza a la que ni un siniestro, ni un recibo ni un movimiento CEF podrá colgarse jamás,
y siempre en silencio:

| Compañía | DGS | Números afectados |
|---|---|---|
| Occident | C0468 | **10** (`548271155`, `548325602`, `8-6.226.669-V`, `BIDP019061`, `BIDP023227`, `BIDP036783`, `BIDQ020971`, `BIDS018699`, `BIDT001398`, `GPAEA0200043`) |
| Mapfre | C0058 | **8** |
| Allianz | C0109 | **1** |

Son **19**. Que las de Occident sean exactamente **10** y que este documento tenga más arriba una
tabla de «**10** que ningún código arregla» es una coincidencia que pide comprobarse antes de volver
a llamar a nadie — no se da aquí por demostrado que sean las mismas, pero es la primera hipótesis.

🪤 **Y la lección de método, que es la que vale para la próxima migración:** el relleno de Plus Ultra
del 06/09 midió la ambigüedad **ese día** («0 filas tocadas quedan en un grupo ambiguo») y era
verdad. Dejó de serlo el **15/09**, cuando CIMA creó sus propias filas con esos mismos números. La
guarda comprobaba una foto; el peligro es dinámico. **Una migración que depende de que no haya
homónimos necesita un cepo que lo siga comprobando después, no una comprobación en el momento de
aplicarla.**

### Las dos salidas, y por qué no se ha tocado nada

La salida es de **código**, no de datos, y vive en el repo de la ingesta (que es donde están los
tests del emparejador):

1. **Separar las etiquetas** en `persist-recibo.ts` / `persist-siniestro.ts`:
   `poliza_ambigua` ≠ `sin_poliza_en_cartera`. Es lo barato y lo que evita que la próxima
   investigación vuelva a empezar llamando a la compañía equivocada.
2. **Romper el empate por origen** en `recibo-matching.ts` / `siniestro-matching.ts`: con ≥2
   candidatos, si **exactamente uno** es cartera viva (`esCarteraViva()`), ese gana. No relaja el
   emparejador —sigue exigiendo un único ganador— y cubre también las colisiones futuras. Cambia
   dónde se cuelga un recibo: alto riesgo, PR propio con tests, y OK de Alberto.

🪤 **Y lo que NO se hace, aprendido el mismo día:** la primera versión de esto era un `UPDATE` que
vaciaba `codigo_entidad_dgs` en la fila histórica de cada par. La revisión le encontró **seis**
defectos, y el peor era la premisa: usaba `import_ref IS NOT NULL` como «es del volcado», cuando
`CLAUDE.md` ya documenta que **una póliza que CIMA mantiene al día conserva su `import_ref`** (la
`3021700291186` de Reale). Esa fila habría perdido su DGS y se habría quedado muda para siempre —
el arreglo causando exactamente el daño que venía a reparar. El criterio bueno es `esCarteraViva()`
= `import_ref IS NULL OR eiac_xml_hash IS NOT NULL`.

Queda en el repo solo la consulta de diagnóstico, **sin un solo `UPDATE`**:
`apps/asegura/prisma/sql/2026-09-21_polizas_dgs_colision_DIAGNOSTICO.sql`. Replica la clave EXACTA
del emparejador (minúsculas con puntuación, `JUNK_POLIZA_NUMBERS`, longitud ≥5, placeholders fuera)
y agrupa por correduría, porque una clave «parecida» cuenta colisiones que el emparejador no ve y se
calla las que sí. Su veredicto por grupo: **19 rescatables, 10 sin fila de CIMA, 0 con dos vivas.**

### ✅ Cerrado el 25/09/2026

- **Datos:** ya no quedan colisiones rescatables. Las 19 duplicadas están fusionadas (`merged_into_poliza_id`) y hoy quedan 10 grupos, los 10 de «SIN CIMA» (volcado contra volcado), a los que no se cuelga nada. Los **52 recibos y 16 siniestros** que pasaron por `*_sin_poliza_review` están todos en `poliza_recibos` / `siniestros`, así que **no hace falta reprocesar**. Medido contra la BD.
- **Código (asegura#854):** la salida (b) está hecha. Con ≥2 candidatas gana la ÚNICA de cartera viva, y así lo hacen recibos, siniestros, el núcleo de Occident y el índice CEF. La salida (a) también: la cuarentena distingue `poliza_ambigua` / `sin_poliza_en_cartera` / `clave_incompleta`. Con esto, la próxima vez que CIMA cree una fila junto a una del volcado ya no se va a cuarentena.
