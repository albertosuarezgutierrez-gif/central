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
