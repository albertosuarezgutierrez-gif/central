# Auditoría de calidad de la ingesta CIMA/EIAC → `seguros` (04/11/2026)

Solo lectura (código + agregados SQL del proyecto `wswbehlcuxqxyinousql`, sin datos personales).
«En vigor» = `sqlCarteraEnVigor()` de `packages/module-seguros/src/cartera-viva.ts` replicada en SQL:
101 pólizas con `eiac_xml_hash` en vigor (Mapfre 26, Generali 13, Allianz 14, Occident 45, Reale 3).

⚠️ La ingesta en producción sigue en el CRM (repo `asegura`). Las líneas citadas son de la copia
`packages/module-cima` (fase 2 de la migración); el arreglo va en AMBOS lados hasta el corte.

## Prioridad por impacto en clientes en vigor

| # | Hallazgo | En vigor | Arreglo | Datos |
|---|---|---|---|---|
| 1 | `ClaseVehiculo` `MO` es **Monovolumen**, no moto | 1 (coche tarificado como moto) | S | UPDATE seguro (1 fila) + mapper |
| 2 | `MT` (Motocicleta) leído como auto | 0 hoy (6 corregidas a las 21:04 durante la auditoría); 5 canceladas/vencidas siguen `auto` | S (en curso) | UPDATE seguro de las 5 |
| 3 | Póliza fusionada (`merged_into_poliza_id`) sigue contando como cartera en vigor | 1 (doble) | M | código, no datos |
| 4 | Siniestro con último paso `CE` en su historia y `estado='abierto'` | 2 | S (verificar CRM) | UPDATE seguro (2 filas) |
| 5 | Allianz no manda prima en la póliza | 14 de 14 | S/M | no hace falta UPDATE |
| 6 | `usoVehiculo = 'NI'` (valor de cajón) en todo Generali | 6 | S | propuesta |
| 7 | `FraccionPago` sin traducir → `fraccionamiento` NULL | 3 | S | re-ingesta o rescate |
| 8 | Tarificador: filtros `estado='activa'` y datos de CIMA sin usar | — | M | código |
| 9 | Duplicados de póliza | 0 en vigor | — | nada (ya fusionado) |

---

## 1. `MO` = Monovolumen, no moto (el mismo patrón que MT, pero al revés) — ALTO

- **Norma**: Documentos Estándar V07.1 §13.3.16 `claves_clasevehiculo` (copiada en
  `packages/module-seguros/src/claves-eiac.ts:80-107`): **MO = Monovolumen**, **MT = Motocicleta**,
  CI = Ciclomotor, QD = Quad, MC = Motocarro, AU = Autobús. La *categoría* (§13.3.4
  `claves_categoriavehiculo`) sí usa **MO = Motocicletas** (CA camiones · MO motos · TU turismos).
- **Causa**: el mapper confunde las dos tablas. `eiac-pol-mapper.ts:16` documenta «AU/MO/CA»
  (eso es la categoría, no la clase) y `classifyTipoSeguro` (`eiac-pol-mapper.ts:743` y `:766`,
  ya con el arreglo del otro agente) trata `MO` de *ClaseVehiculo* como moto. El comentario nuevo
  dice «MO = estándar» y «MT = lo que manda Allianz»: **las dos cosas son falsas** — MT lo mandan
  también Mapfre, Occident y Reale, y MO estándar es monovolumen.
  Hermano: `packages/module-seguros/src/sincro-cima.ts:294` (`CLASES_MOTO = MO, MT, CI` aplicado a
  `categoriaVehiculo` **y** `claseVehiculo` en `:311`): un monovolumen `tipo='auto'` dejaría de
  compararse con el carné B. Hoy 0 filas afectadas por este hermano.
- **Medido**: 1 póliza Occident en vigor `tipo='moto'` con `claseVehiculo='MO'`,
  `categoriaVehiculo='TU'`, 8 plazas → un monovolumen. Retarificarla abre el ramo moto.
- **Arreglo (S)**: decidir por **`CategoriaVehiculo` primero** (`MO` → moto; `TU`/`CA` → auto) y
  solo si falta, por `ClaseVehiculo ∈ {MT, CI}` (Reale no manda categoría: su moto entra por MT).
  **Sacar `MO` de las clases de moto.** QD/MC: decisión de negocio (hoy no llega ninguna por CIMA).
  Cepo: test con `ClaseVehiculo=MO, CategoriaVehiculo=TU` → `auto`, verlo en rojo con el código actual.
  ⚠️ Esto toca el mismo archivo que el otro agente: coordinar, no pisar.
- **Datos**: UPDATE seguro (1 fila), **después** de desplegar el mapper (si no, la próxima POL lo revierte):
  `update seguros.polizas set tipo='auto' where eiac_xml_hash is not null and tipo='moto' and datos_especificos->>'claseVehiculo'='MO' and coalesce(datos_especificos->>'categoriaVehiculo','')='TU'`.
  Revisar después si tiene oportunidades abiertas con `tipo='moto'` (la oportunidad hereda el ramo).
- **Si me equivoco**: si alguna compañía usara `MO` de clase para motos, se volverían `auto`. La
  categoría `MO` las seguiría salvando (todas las motos medidas la traen, salvo Reale con MT).

## 2. `MT` leído como auto — el caso que disparó la auditoría

- Al empezar: 6 en vigor `tipo='auto'` con `claseVehiculo='MT'` (Allianz 4, Mapfre 1, Reale 1).
  **Durante la auditoría (04/11 21:04) alguien las pasó a `moto`**: al cierre quedan 0 en vigor.
  La sesión principal debe confirmar que fue su agente y que hay rastro (no hay lote en un log).
- Quedan **5 canceladas/vencidas** `auto` con `MT`/categoría `MO` (Allianz 2, Mapfre 3). No son
  clientes, pero son LEADS de recaptación: una retarificación de ex-cliente saldría por auto.
  UPDATE seguro con la misma regla del punto 1 (categoría `MO` → moto).

## 3. Fusionadas que siguen contando como cartera en vigor — MEDIO

- **Causa**: `esCarteraEnVigor`, `WHERE_CARTERA_EN_VIGOR` y `sqlCarteraEnVigor`
  (`cartera-viva.ts:108-133`) no miran `merged_into_poliza_id`. Muchos llamadores lo añaden a mano,
  pero no todos: sin el filtro, p. ej. `apps/asegura-portal/lib/vencimientos.ts`,
  `apps/plataforma/lib/tarificador-compania-poliza.ts`, `apps/asegura/lib/tarificador-compania-actual.ts`,
  `apps/asegura/lib/tarificador-hogar-poliza.ts`, `apps/asegura/lib/whatsapp/salientes.ts`,
  `apps/plataforma/lib/correduria/hogar-cartera.ts` (hay que leer cada uno: alguno filtra por id).
- **Medido**: 1 fila Allianz auto (emitida por nosotros, `import_ref` NULL) fusionada en una CIMA
  activa del mismo cliente, y las dos cuentan → póliza doble en recuentos/avisos de vencimiento.
- **Arreglo (M)**: meter `merged_into_poliza_id is null` en el helper (las tres formas) y correr los
  tests de cartera; es cambio de semántica en ~60 llamadores, por eso M. No hace falta tocar datos.

## 4. Siniestros: estado que contradice su propia historia — MEDIO

- **Enlace**: limpio. 109 siniestros CIMA, 0 sin póliza, 0 con póliza de otra compañía, 0 con cliente
  distinto del de su póliza, 0 duplicados por (nº siniestro + DGS), 0 colgados de una fusionada.
  2 pares (Generali 1, Occident 1) en la misma póliza y fecha con distinto nº: lo normal en un
  siniestro con dos expedientes; no lo trato como duplicado sin mirar el detalle.
- **Medido**: 2 siniestros (Allianz 1, Occident 1) con `situaciones_cima` = [AP, CE] (el CE es el
  más reciente por fecha) y `estado='abierto'`, ambos tocados el 28/09 (día de rescates).
- **Causa**: `estado` se pisa con lo del fichero que entra (`db/persist-siniestro.ts:235`) mientras la
  historia se fusiona (`:258`). Un fichero viejo procesado después (rescate) vuelve el estado atrás.
  La copia de central ya tiene el modo «relleno» por nombre de fichero (`:200-215`); hay que comprobar
  que el CRM lo tiene, y aun así es más robusto derivar `estado` de la historia fusionada (último
  paso por fecha). Arreglo S.
- **Datos**: UPDATE seguro: `estado='cerrado'` donde el último paso por fecha de `situaciones_cima`
  es `CE` y `estado='abierto'` (2 filas). Ojo con `RA` (reabierto) posterior: la consulta debe mirar
  el ÚLTIMO, no «hay un CE».
- **A vigilar**: Allianz tiene 17 ficheros SIN confirmados y solo 4 siniestros en BD (Mapfre: 11 → 69).
  `cima_siniestro_sin_poliza_review` de Allianz: 4 (hasta 24/06) y de Occident: 22 (hasta 13/09).
  La skill dice que el reintento sin ceros de Allianz «aún no» está en siniestros; central sí lo tiene
  (`siniestro-matching.ts:112`). No he podido comprobar si los 17 ficheros traían más siniestros que
  los 4: hace falta mirar el crudo (`cima_cuarentena_crudo`, cifrado). **No afirmo que se hayan perdido.**
- Estados: Mapfre 69/69 cerrados (todos con historia CE: coherente). Ningún abierto de más de 2 años.

## 5. Prima y vencimiento contra recibos — BAJO para datos, MEDIO para el tarificador

- Vencimiento: 0 en vigor con vencimiento pasado que un recibo cobrado corrija; 1 Occident en vigor
  con vencimiento pasado y sin recibo que pruebe la renovación (mirar a mano); 2 con recibo de la
  renovación emitido más allá del vencimiento de la póliza (lo normal antes del POL de renovación).
- Prima: 0 discrepancias >10 % entre prima anual de póliza y recibo anual; 0 `primaAnualDudosa`.
  **Allianz: 14 de 14 en vigor sin prima en la póliza**, las 14 recuperables por `primaConRecibos`
  (`packages/module-seguros/src/vencimientos.ts:240`). Quien lea `prima_bruta` a pelo (comparativa de
  «precio actual» en retarificación) ve «sin prima». Arreglo: que esos lectores usen `primaConRecibos`
  (S/M según cuántos sean). No escribir la del recibo en la póliza: perdería el tercer estado.

## 6. Valores de cajón

- `usoVehiculo='NI'` en las 6 de Generali (`eiac-pol-mapper.ts:1616` usa `str`, no `strUtil`, que ya
  trata `NI` como relleno en `:1077`). La norma no tiene tabla de uso (remite a RGV), así que `NI` puede
  ser «no informado» u «otro»: **propuesta**, no hecho. Si se decide que es «no se sabe», anularlo en el
  mapper y `datos_especificos - 'usoVehiculo'` en esas 6.
- `aseguradora`: sin cajón (las 166 con hash tienen nombre de compañía por DGS). El fallback a
  `DescripcionRamo` (`:2511`) sigue siendo un cajón latente para un DGS nuevo fuera del catálogo.
- `tipo='otros'`: 2 Occident ramo 251 (embarcaciones), coherente con el diseño.
- `fraccionamiento` NULL en 3 en vigor (4 en total): `classifyFraccionPago` (`:425-441`) no traduce
  `UN` aunque `FRACCIONES_POR_ANIO` (`:2364`) sí lo conoce. Sin el código crudo guardado no sé si es
  UN u otro: guardar el crudo y traducir UN → arreglo S; datos por rescate del crudo.
- Clasificación ramo↔tipo del resto: coherente en vigor (hogar 2151, comunidades 2161, comercio 2171,
  RC 282, accidentes 211, decesos 2141, vida 111). Sin cruces hogar/comunidad/comercio ni vida/decesos.

## 7. Campos que una compañía no manda (no es lo mismo que «no se lee»)

Medido en `cima_cobertura_campos` (`veces_visto`) y en las fichas en vigor:
- Cilindrada: Generali y Occident **no la mandan** (0 apariciones). No es fallo del lector.
- Fecha de matriculación: Reale no la manda. Categoría de vehículo: Reale no la manda (por eso el
  punto 1 necesita el respaldo de `ClaseVehiculo=MT`).
- `TipoPermiso` del conductor: solo Occident (4 de 11). El tarificador ya declara B explícito en moto
  y lo cruza con la cilindrada (`oportunidad-riesgo.ts:1087`), correcto.
- Hogar Mapfre: no manda superficie ni antigüedad (0 rutas): 3 de 4 en vigor solo retarificables por
  Catastro/gemela. CP del riesgo: lo traen todos.
- Hojas que llegan y no se leen (decisión previa, no hallazgo): sexo, estado civil, idioma del conductor.

## 8. Impacto en el tarificador (bots y Avant2)

1. Ramo equivocado: la oportunidad hereda `polizas.tipo`; con el punto 1, un coche se cotiza como moto
   (y antes del arreglo, 6 motos como coche). Es el error de más impacto: el bot corre el formulario
   del ramo que no es, o se para.
2. `estado::text = 'activa'` en `apps/asegura/lib/tarificacion-lead.ts:152` y `:175` y en
   `tarificador-vehiculo-referencia-bd.ts:47`: una póliza `en_renovacion`/`recibo_devuelto` no sirve de
   «póliza actual» (compañía anterior, años asegurado, nº para SINCO) aunque esté en vigor. Propuesta:
   `POLIZA_ESTADOS_VIGENTES`. Hoy las 101 CIMA en vigor están `activa`, así que el impacto es nulo
   AHORA y aparece con la primera renovación marcada.
3. Datos de CIMA que no localicé en el armado del riesgo: fecha de matriculación real (está en 43 de 47
   vehículos en vigor) frente a la «estimada por la matrícula» (`tarificacion-lead-puro.ts:557`), uso
   (`:564` fija `particular` y carné B en auto, también en las 4 furgonetas/comerciales FU/CV), y
   `baseSiete`. De la póliza solo se lee marca/modelo/versión. **No lo he recorrido entero**: verificar
   con `rastreador-codigo` antes de darlo por hecho.

## 9. Pólizas duplicadas

- 0 grupos con dos pólizas en vigor por (nº normalizado sin ceros + DGS), ni por matrícula (misma o
  distinta compañía). 119 filas ya fusionadas (`poliza_merge_log`: lotes de julio a 04/10, incluidos
  `allianz-c0109-cero-inicial`, `mapfre-carga-2026-previa` y `doble-import-intranet`).
- Restan 9 grupos nº+DGS (23 filas, 0 en vigor, 7 de ellos con clientes distintos: volcado histórico)
  y 18 gemelas volcado-sin-DGS ↔ CIMA (74 filas, como mucho 1 en vigor por grupo): son las «gemelas»
  que usa `retarificable.ts` a propósito. No proponer fusión ciega: la trampa conocida es que dar DGS a
  una gemela vuelve ambiguo el emparejamiento de recibos (skill `cima-ingesta`).
- Sufijos de versión de Mapfre: 10 pares de 9 vs 10 cifras con prefijo común, todos de clientes y ramos
  distintos → coincidencia, no la misma póliza.
- Único efecto de duplicado vivo hoy: el punto 3 (1 póliza contada dos veces).

## Cómo verificar cada arreglo

- 1/2: `select tipo, datos_especificos->>'claseVehiculo', datos_especificos->>'categoriaVehiculo', count(*)` en
  vigor → ninguna `moto` con categoría `TU` y ninguna `auto` con categoría `MO`.
- 3: recuento de cartera en vigor baja exactamente 1; test de `cartera-viva` con una fusionada activa.
- 4: 0 siniestros cuyo último paso de `situaciones_cima` contradiga `estado`.
