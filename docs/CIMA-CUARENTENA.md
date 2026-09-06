# La cuarentena de CIMA — por qué se llena y qué la vacía (06/09/2026)

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
