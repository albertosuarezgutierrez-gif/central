# 🗺️ Mapa de campos para cotizar — auto, hogar y RC (02/09/2026)

> **Qué es esto:** el inventario, campo a campo, de lo que Codeoscopic/Avant2 exige para cotizar y de
> si ese dato existe hoy en el schema `seguros` de la Supabase compartida (`wswbehlcuxqxyinousql`).
> **Todo lo que dice «cobertura» está MEDIDO con SQL sobre la cartera VIVA** (`polizas.import_ref IS NULL`),
> no supuesto. Lo que no se ha podido comprobar se dice como «no comprobado» y no se rellena.
>
> **Fuentes del lado vendor:** `apps/asegura/lib/codeoscopic/{peticion-auto,peticion-hogar,persona,
> desde-cartera,desde-cartera-hogar,catalogos}.ts` y `docs/CODEOSCOPIC-API-PORTAL.md` (snapshot del
> portal del fabricante, 01/09/2026) + `docs/CODEOSCOPIC-TRASPASO-MANUEL.md`.
>
> 🚨 **No se ha lanzado ninguna cotización real.** Este documento se ha hecho leyendo código y BD.

## 0. El denominador, medido

```sql
select tipo, count(*) from seguros.polizas where import_ref is null group by 1;
```

| ramo (`polizas.tipo`) | pólizas vivas | `ramo_dgs` | pólizas totales (viva + volcado) |
|---|---:|---|---:|
| `auto` | **80** | 241 | 17.377 |
| `hogar` | **19** | 2151 | 5.661 |
| `responsabilidad_civil` | **9** | 282 | 81 |
| `moto` | **1** | 241 | 167 |
| **TOTAL VIVAS** | **109** | | 28.843 |

Detrás de esas 109 pólizas hay **79 clientes distintos** (73 personas físicas, 6 jurídicas).

🚨 **Dos avisos sobre el denominador, los dos medidos hoy y los dos con consecuencias de dinero:**

1. **`tipo='auto'` incluye motos.** 14 de las 80 pólizas «auto» vivas llevan en
   `datos_especificos->>'marca'` una marca que **solo fabrica motos** (Yamaha, Kawasaki,
   Piaggio-Vespa, Ducati, KTM…). Y `ramo_dgs` no desempata: **241 es el mismo código para auto y para
   moto**. Cotizar esas con `insuranceLine: { id: 'Car' }` —que es lo que hace hoy
   `construirPeticionAuto()`, con el id escrito a fuego— es pedir precio del ramo equivocado, y se
   paga igual.
2. **Marca y modelo SÍ vienen** — las 81 (auto+moto) los traen no vacíos, el 100%. Sigue siendo
   cierto que **no traen el código de versión Base7**, que es lo único que sirve para cotizar; pero
   marca y modelo acortan la navegación del catálogo de tres clics a uno. (`apps/asegura/CLAUDE.md`
   afirmaba lo contrario —«matrícula y NADA más»— hasta que **se corrigió el 02/09/2026 en el PR
   #2121**, con la misma medición; si vuelves a leerlo ahí, ya está bien.)

### Cómo leer la columna «cobertura real medida»

- **`NULL` no es `0`.** Una columna que existe y está vacía en toda la cartera se marca como
  **«la columna existe, nadie la ha rellenado»**, que no es lo mismo que «el dato no existe».
- **PII cifrada.** `clientes.dni`, `.telefono`, `.fecha_nacimiento` y `.direccion` van cifradas con
  prefijo `v1:` (medido: **el 100% de los valores no nulos lleva ese prefijo, ninguno en claro**).
  «Está» significa que hay un criptograma. Que se pueda ABRIR depende de `PII_ENCRYPTION_KEY` en el
  Vercel de `central-asegura`, y **eso no se ha comprobado desde aquí** — lo diagnostica
  `apps/asegura/lib/pii-estado.ts` en runtime. Un dato cifrado que no abre es «no lo sé», no un hueco.

---

## 1. AUTO — denominador 80 pólizas vivas

Contrato: `construirPeticionAuto()` (`lib/codeoscopic/peticion-auto.ts`), verificado contra el builder
de Manuel. La MISMA persona viaja tres veces (`holder`, `risk.owner`, `risk.primaryDriver`) y tiene
que ser idéntica en las tres.

### 1.1 La persona (× 3)

| campo (vendor) | ¿oblig.? | ¿lo trae CIMA? (tabla.columna) | cobertura real medida | qué hacer si no está |
|---|---|---|---|---|
| `identificationDocument.id` | **Sí** | `seguros.clientes.dni` (cifrado `v1:`) | **80/80 · 100%** (criptograma presente; legibilidad **no comprobada**) | (b) **preguntar** si la clave no abre. Nunca se supone un DNI |
| `identificationDocument.type.id` | **Sí** | no existe: está **cableado a `'Dni'`** en `persona.ts` | n/a | (c) **SUPUESTO `'Dni'`** ⚠️ **falso para 6 de los 79 clientes vivos, que son personas jurídicas** (CIF). Necesita OK |
| `name` | **Sí** | `clientes.nombre` | **80/80 · 100%** (ninguno es centinela «Lead» en la cartera viva) | (b) preguntar |
| `surname` | **Sí** | `clientes.apellidos` (se trocea con `partirApellidos`) | **78/80 · 97,5%** | (b) preguntar los 2 |
| `surname2` | No | ídem, última palabra del troceo | — | (a) derivado del troceo; con 3+ palabras el corte no es fiable |
| `birthDate` | **Sí** | `clientes.fecha_nacimiento` (cifrado) | **67/80 · 83,8%** | (b) **preguntar los 13**. No se supone jamás |
| `gender.id` | **Sí** | derivado de `clientes.saludo` (`'1'`→Male, `'2'`→Female) | **68/80 · 85,0%** con saludo traducible (71/81 tienen algún saludo: el `'3'` **no se traduce**) | (a) derivado de `saludo`; los que no, (b) **preguntar** |
| `maritalStatus.id` | **Sí** | `clientes.estado_civil` — **texto libre** («Casado», «Soltero»…), no el id del vendor | **20/80 · 25,0%** | (a) derivable solo si `emparejar()` casa EXACTO con `/marital-statuses`; el resto **(b) preguntar**. 🔴 **es el segundo peor obligatorio de auto** |
| `phones[0].number` | **Sí** | `clientes.telefono` (cifrado). `seguros.cliente_telefonos` **no añade ni uno** | **58/80 · 72,5%** | (b) **preguntar los 22**. ⚠️ El vendor exige móvil `^[67]\d{8}`; al ir cifrado **no se puede validar el patrón por SQL: no comprobado** cuántos de los 58 son móviles |
| `drivingLicenses[0].date` | **Sí (auto)** | `seguros.cliente_carnets_conducir.fecha_carnet` · y `seguros.poliza_intervinientes.fecha_carnet` | **60/80 · 75,0%** por la primera; **65/80 · 81,3%** uniendo las dos | (b) **preguntar los 15** |
| `drivingLicenses[0].type.id` / `.issuingZone.id` | **Sí** | cableados a `'B'` / `'Spain'` | n/a | (c) **SUPUESTO** defendible: es el carnet de coche español por defecto |
| `addresses[0].postalCode` | Condicional (si va municipio) | `clientes.codigo_postal` | **64/80 · 80,0%** | (b) preguntar; si falta, la dirección entera **no viaja** (el vendor la rechaza a medias) |
| `addresses[0].town.id` | Condicional | **no existe** ninguna columna con el id del vendor | **0/80 · 0%** | (a) **DERIVAR gratis** de `GET /towns?postalCode=`. ⚠️ Un CP puede dar varios municipios: **lo elige la pantalla**, no el código |

### 1.2 El vehículo (`risk`)

| campo (vendor) | ¿oblig.? | ¿lo trae CIMA? | cobertura real medida | qué hacer si no está |
|---|---|---|---|---|
| `vehicle.code` (Base7 de la **versión**) | **Sí** | **NO EXISTE** en ninguna tabla de `seguros` | **0/80 · 0%** | (b) **elegirlo a mano** navegando `/car/brands → models → vehicles` (**gratis**). `marca` y `modelo` (80/80, 100%) acortan la búsqueda pero **no dan el código**. Buscar por matrícula (`GET /vehicles`) es la única operación de pago de la API |
| `registrationPlate` | **Sí** | `polizas.datos_especificos->>'matricula'` | **80/80 · 100%** | — |
| `registrationDate` | **Sí** | **NO EXISTE** como fecha. `bienes_asegurables.datos->>'year'` da **solo el año** | **0/80** exacta · **44/81 · 54,3%** solo año (casando el bien por matrícula: 47/81 casan) | (a) **DERIVAR gratis**: `GET /car/registration-date?plate=`. ⚠️ Es **aproximada** (el fabricante lo advierte) y puede venir `null` = «no la encuentro», no «no tiene» |
| `purchaseDate` | **Sí** | no existe | **0/80 · 0%** | (c) **SUPUESTO = `registrationDate`**. Defendible: es lo cierto salvo coche de segunda mano. Ya lo hace el constructor |
| `kilometersPerYear` | **Sí** | `bienes_asegurables.datos->>'km'` **existe como clave pero solo en 1 fila de 1.444, y en 0 de la cartera viva** | **0/80 · 0%** — la columna existe, nadie la ha rellenado | (c) **SUPUESTO 15.000 km/año** (`KM_ANUALES_POR_DEFECTO`). Necesita OK |
| `circulationAddress.postalCode` | **Sí** | no existe el CP de **circulación**; se usa el del tomador (`clientes.codigo_postal`) | **64/80 · 80,0%** (como supuesto declarado) | (c) **SUPUESTO: el coche duerme donde vive el tomador**. Ya se declara como supuesto en pantalla |
| `circulationAddress.town.id` | **Sí** | no existe | **0/80** | (a) derivar del CP (catálogo gratis) |
| `garageType.id` | **Sí** | **NO EXISTE** | **0/80 · 0%** | (c) **SUPUESTO**: hoy `elegirDefecto()` coge «la primera del catálogo» si no hay preferido. ⚠️ **No hay un id preferido fijado para garaje** (a diferencia de hogar, que sí tiene `DEFECTOS_HOGAR`): eso hace que el supuesto dependa del orden que devuelva el vendor. Necesita OK sobre CUÁL es el conservador |
| `lightTrailer` | No (se manda siempre) | no existe | **0/80** | (c) **SUPUESTO `false`**. Conservador y barato de justificar |

### 1.3 Historial y cotización

Al retarificar, **la póliza que tenemos ES la anterior**. Eso no es un supuesto: es el motivo del botón.

| campo (vendor) | ¿oblig.? | ¿lo trae CIMA? | cobertura real medida | qué hacer si no está |
|---|---|---|---|---|
| `previouslyInsured` | **Sí** | se pone `true` porque hay póliza | 80/80 | — |
| `previousInsurance.policyNumber` | **Sí** (si el anterior) | `polizas.numero_poliza` | **80/80 · 100%** | — |
| `previousInsurance.previousCompany.code` | **Sí** | `polizas.codigo_entidad_dgs` (lo trae EIAC) | **80/80 · 100%** | — |
| `previousInsurance.totalYearsInsured` | **Sí** | derivado de `polizas.fecha_efecto_inicial` | **80/80 · 100%** | (a) **DERIVAR**: años entre `fecha_efecto_inicial` y hoy. Si diera 0, se supone 1 (a la baja: encarece) |
| `previousInsurance.yearsInPreviousCompany` | **Sí** | no existe por separado | **0/80** | (c) **SUPUESTO = `totalYearsInsured`**. Tira a caro, no a barato |
| `previousInsurance.yearsWithoutAccidents` | **Sí** | derivado de `seguros.siniestros` | **28/80 · 35,0%** de las pólizas tienen ≥1 siniestro registrado | (c) **SUPUESTO OPTIMISTA: no hubo siniestros** (decisión de Alberto, 01/09/2026). 🚨 Cero filas en `siniestros` **no prueba** que no los haya |
| `previousInsurance.lastFiveYearsAccidents` | Condicional | `count(siniestros)` | ídem | (a) derivado. Solo hace falta si `yearsWithoutAccidents < 5` **y** ≠ `totalYearsInsured` — la regla que más 400 (ya pagados) provoca |
| `effectiveDate` | **Sí** | derivado de `polizas.fecha_vencimiento` | **80/80 · 100%** | (a) **DERIVAR**: día siguiente al vencimiento; si venció, mañana |
| `insuranceLine.id` | **Sí** | cableado a `'Car'` | n/a | (c) **SUPUESTO** ⚠️ **falso en 14/80** (marca exclusivamente de moto). Necesita OK y, probablemente, un ramo `Motorcycle` |
| `externalId` | No | nuestra referencia | — | opcional, para casar la cotización con el cliente |

---

## 2. HOGAR — denominador 19 pólizas vivas

Contrato `HomeRisk` **verificado** contra el portal del fabricante (02/09/2026) y transcrito en
`CAMPOS_VENDOR` de `lib/codeoscopic/peticion-hogar.ts`. Es **mucho más de lo que guarda ninguna ficha**.

**Tres procedencias posibles del riesgo**, y la pantalla tiene que decir cuál:
1. **la póliza viva** (`polizas.datos_especificos`) — casi vacía;
2. **su gemela** del volcado de junio/2026 (misma `numero_poliza`, `import_ref` no nulo) — tecleada a mano;
3. **`seguros.bienes_asegurables`** (`tipo='vivienda'`, 170 filas) — la ficha de bienes del CRM;
   ➕ el **Catastro** (`@central/core-catastro`, gratis) para m² y año a partir de la dirección.

🚨 **`bienes_asegurables` NO tiene columna que la ligue a una póliza** (sus 7 columnas son
`id, cliente_id, tipo, nombre, datos, created_at, updated_at`). Y **9 de los 19 clientes de hogar
tienen más de una vivienda en esa tabla**. Por eso todas las coberturas de la columna «bien» de abajo
son un **TECHO, no una atribución**: sin una regla de emparejamiento (por dirección o CP) no se sabe
cuál de sus viviendas asegura esa póliza. En auto no pasa: ahí se casa por matrícula (47/81 casan).

### 2.1 La persona (`holder`, y `risk.owner` si es el dueño)

Mismos campos que en auto **menos el carnet** (hogar no lo manda). Cero personas jurídicas.

| campo (vendor) | ¿oblig.? | ¿lo trae CIMA? | cobertura real medida | qué hacer si no está |
|---|---|---|---|---|
| `identificationDocument.id` | **Sí** | `clientes.dni` (cifrado) | **19/19 · 100%** | (b) preguntar si no abre |
| `name` / `surname` | **Sí** | `clientes.nombre` / `.apellidos` | **19/19 · 100%** las dos | — |
| `birthDate` | **Sí** | `clientes.fecha_nacimiento` (cifrado) | **18/19 · 94,7%** | (b) preguntar 1 |
| `gender.id` | **Sí** | derivado de `clientes.saludo` | **19/19 · 100%** traducible | (a) derivado |
| `maritalStatus.id` | **Sí** | `clientes.estado_civil` (texto libre) | **8/19 · 42,1%** | (b) **preguntar 11** |
| `phones[0].number` | **Sí** | `clientes.telefono` (cifrado) | **17/19 · 89,5%** | (b) preguntar 2 |
| `addresses[0].postalCode` + `town.id` | Condicional | `clientes.codigo_postal` + catálogo | **19/19 · 100%** el CP; el `town.id` **0/19** | (a) derivar el municipio del CP, gratis |

### 2.2 Dónde está la vivienda

| campo (vendor) | ¿oblig.? | ¿lo trae CIMA? | cobertura real medida | qué hacer si no está |
|---|---|---|---|---|
| `address.postalCode` | **Sí** | `polizas.datos_especificos->>'cp'` · gemela · `bienes_asegurables.datos->>'codigoPostal'` | póliza **2/19 · 10,5%** · gemela **12/19 · 63,2%** · bien **15/19 · 78,9%** → **unión 15/19 · 78,9%** (techo) | (c) **SUPUESTO: el CP del tomador** (19/19 lo tienen), declarado en pantalla |
| `address.town.id` | **Sí** | no existe | **0/19** | (a) derivar del CP, gratis |
| `address.roadType.id` | **Sí** | no existe como campo; se **trocea** de la dirección (`partirDireccion`) | dirección: póliza 2 · gemela 10 · bien 14 → **unión 15/19 · 78,9%** | (a) derivar del troceo; (c) **SUPUESTO `'Calle'`** (`DEFECTO_TIPO_VIA`) si no se reconoce |
| `address.roadName` | **Sí** | ídem | ídem **15/19 · 78,9%** (techo) | (b) **preguntar los 4**; el troceo es best-effort y hay que revisarlo |
| `address.roadNumber` | **Sí** | ídem | ídem (y el troceo puede no encontrar número) | (b) preguntar. **Nunca se inventa un número** |
| `address.floor` / `.door` | No | troceo | — | opcional |
| `address.cadastralReference` | No | no existe | **0/19** | (a) derivable del Catastro por dirección |

### 2.3 Cómo es la vivienda

| campo (vendor) | ¿oblig.? | ¿lo trae CIMA? | cobertura real medida | qué hacer si no está |
|---|---|---|---|---|
| `floorArea` (m² construidos) | **Sí** | póliza · gemela · `bienes.datos->>'m2'` | póliza **1/19** · gemela **8/19 · 42,1%** · bien **11/19 · 57,9%** → **unión 11/19 · 57,9%** (techo) | (a) **DERIVAR del Catastro** (gratis, si hay dirección). ⚠️ El Catastro da la **construida**; si la compañía pide la útil, es menor |
| `yearBuilt` | **Sí** | ídem (`yearConstruccion` en el bien) | póliza **1/19** · gemela **8/19 · 42,1%** · bien **12/19 · 63,2%** → **unión 12/19 · 63,2%** | (a) **DERIVAR del Catastro** |
| `rooms` (dormitorios, ≥1) | **Sí** | **NINGUNA tabla lo guarda** | **0/19 · 0%** | (c) **SUPUESTO: estimado por m²** (`habitacionesPorSuperficie`, tramos españoles). Necesita OK |
| `lastReformYear` | Si hubo reforma | no existe | **0/19** | (b) preguntar. Lagun Aro lo exige y lo dice **después** de cobrar |
| `buildingType.id` | **Sí** | `bienes.datos->>'tipoVivienda'` **existe como clave, en 1 fila de 170 y en 0 de la cartera viva** | **0/19 · 0%** — la columna existe, nadie la ha rellenado | (c) **SUPUESTO `MiddleFloor`** (ejemplo del portal), solo si el catálogo vivo lo trae |
| `use.id` (**régimen**: propietario/inquilino) | **Sí** | no existe | **0/19** | (c) **SUPUESTO `Owner`** |
| `occupancy.id` (**uso**: habitual/2ª residencia) | **Sí** | no existe | **0/19** | (c) **SUPUESTO `MainResidence`** — marcado **optimista**: habitual es más barato que segunda residencia |
| `location.id` | **Sí** | no existe | **0/19** | (c) **SUPUESTO `CityCentre`** — **optimista** |
| `materials.id` | **Sí** | no existe | **0/19** | (c) **SUPUESTO `NonCombustible`** |
| `buildQuality.id` | **Sí** | no existe | **0/19** | (c) **SUPUESTO `Normal`** — **optimista** |
| `alarm.id` | **Sí** | `bienes.datos->>'alarmaConectada'`/`'alarmaSinConectar'` (1 fila de 170; **0 de la viva**) | **0/19 · 0%** | (c) **SUPUESTO `NoAlarm`** (conservador: encarece) |
| `secondaryDoorsType.id` | **Sí** | no existe | **0/19** | (c) **SUPUESTO `NonReinforcedOtherDoor`** |
| `settlementType.id` | **Sí** | no existe | **0/19** | (c) **SUPUESTO `ReplacementValue`** |
| `securityMainDoor` | **Sí** | `bienes.datos->>'puertaBlindada'` (1 fila de 170; **0 de la viva**) | **0/19 · 0%** | (c) **SUPUESTO `false`** (conservador: si la hay, el precio baja) |
| `securityWindows` | **Sí** | `bienes.datos->>'rejas'` (ídem) | **0/19 · 0%** | (c) **SUPUESTO `false`** |
| `gatedCommunity` | **Sí** | no existe | **0/19** | (c) **SUPUESTO `false`** |
| `securityGuard` | No | no existe | **0/19** | solo se manda si se dice |
| `owner` | Rol obligatorio (min 1) | la misma persona que `holder` | — | (c) **SUPUESTO: el tomador es el dueño** |

### 2.4 Capitales — el punto más flojo del ramo

| campo (vendor) | ¿oblig.? | ¿lo trae CIMA? | cobertura real medida | qué hacer si no está |
|---|---|---|---|---|
| `buildingsLimit` (continente) | **Al menos uno de los dos** | gemela `datos_especificos->>'continente'` · y **`seguros.poliza_coberturas`** | gemela **7/19 · 36,8%** | ver abajo |
| `contentsLimit` (contenido) | ídem | ídem | gemela **7/19 · 36,8%** | ver abajo |

🚨 **El hallazgo del ramo, y no está cableado:** las 19 pólizas de hogar vivas **sí tienen** filas en
`seguros.poliza_coberturas`, y **10 de las 19 tienen una línea cuya descripción es continente y otra
contenido**. Pero:

```sql
-- 37 filas de continente/contenido sobre hogar vivo:
capital_asegurado IS NOT NULL      → 0
descripcion_capital IS NOT NULL    → 0
modalidad_valoracion IS NOT NULL   → 0
datos_extra <> '{}'                → 0
```

⚠️ **CORREGIDO el 02/09/2026 — la conclusión de arriba era FALSA, y el fallo es el que este repo
tiene documentado como el más caro: el dato SÍ estaba, con otro nombre.** Las 37 filas vacías son las
que se llaman **literalmente** «continente»/«contenido», y esas compañías no rellenan el capital. Pero
las otras lo llaman distinto **y sí lo traen**:

```
-- hogar vivo, capital que parsea como número (medido 02/09/2026):
daños vivienda              9/9 filas   →  hasta 912.322 €   (= continente)
daños mobiliario            9/9 filas   →  hasta 117.081 €   (= contenido)
incendio y ot.daños vivienda   9/9      →  mismo capital
incendio y ot.daños mobiliario 9/9      →  mismo capital
```

Y el volumen real de coberturas de hogar no son 37 filas sino **716, en las 19 pólizas, 365 con
capital** y las 716 con descripción. Filtrar por el nombre exacto de la garantía dejó fuera el 95% de
la tabla.

**O sea: CIMA SÍ trae continente y contenido.** Lo que faltaba no era el dato, era el **diccionario de
nomenclaturas**: cada compañía nombra la misma garantía a su manera y nadie las había reducido a un
campo canónico.

**Qué hacer, en este orden:** (a) **mapear descripción de garantía → campo canónico**
(`continente`/`contenido`), que es barato y desbloquea 9 de 19 hogares hoy mismo; (b) para las que aun
así no lo traigan, preguntárselo al corredor/cliente o cablear `POST /home/recommend-limits` (gratis
según el portal). ⚠️ Ojo con el `0`: hay capitales a cero, y **cero es un dato («revisado, es cero»),
no un hueco** — colapsar el hueco a 0 da un precio inventado.

📌 **Lección de método, que es el motivo de que esto se escriba aquí:** la primera pasada midió
`descripcion IN ('continente','contenido')` y concluyó «nadie lo ha rellenado». La consulta era
correcta y la conclusión falsa. Antes de declarar que una columna está vacía, **mira cómo se llama el
dato en cada fuente**, no solo si hay filas con el nombre que tú esperabas.

| campo | ¿oblig.? | ¿CIMA? | cobertura | qué hacer |
|---|---|---|---|---|
| `jewelsInSafeBoxLimit` | **Sí** (0…100.000) | no existe | **0/19** | (c) **SUPUESTO 0** — **optimista** |
| `jewelsOutSafeBoxLimit` | **Sí** | no existe | **0/19** | (c) **SUPUESTO 0** — **optimista** |
| `highValueItemsLimit` | **Sí** | no existe | **0/19** | (c) **SUPUESTO 0** — **optimista** |
| `numberOfDangerousDogs` | **Sí** | no existe | **0/19** | (c) **SUPUESTO 0** — **optimista** |
| `effectiveDate` | **Sí** | `polizas.fecha_vencimiento` | **19/19 · 100%** | (a) derivar: día siguiente |
| `insuranceLine.id` | **Sí** | **NUNCA se escribe a mano**: sale de `GET /insurance-lines` | n/a | (a) derivar del catálogo, gratis. `hogarDisponible()` tiene **tres** estados: disponible / ausente / desconocido |

⚠️ **Y en hogar el primer precio es SIEMPRE estimado.** En el ejemplo del portal todas las
cotizaciones traen `"estimate": true` y un `ReRate` **requerido**. El re-rate es facturable y no
idempotente: **un precio firme de hogar probablemente cuesta 1,00€, no 0,50€**. Sin medir todavía.

---

## 3. RESPONSABILIDAD CIVIL — no hay tabla de campos que dar, y esa es la respuesta

🚨 **Codeoscopic/Avant2 no ofrece RC en su API v1, según la única documentación del fabricante que
tenemos.** El portal (snapshot 01/09/2026, `docs/CODEOSCOPIC-API-PORTAL.md`) lista **seis** ramos con
catálogos propios:

`auto (/car/*)` · `moto (/motorcycle/*)` · `hogar (/home/*)` · `vida temporal (/term-life/*)` ·
`salud (/health/*)` · `decesos (/burial/*)`

**RC no está.** Y no está en el repo tampoco: `apps/asegura/lib/codeoscopic/` no tiene `peticion-rc.ts`
ni ningún tipo de petición de RC. **Por tanto no existe una lista de campos del vendor que mapear, y
no me la invento.**

**Lo que NO se ha comprobado, y es lo que lo cerraría:** `GET /insurance-lines` es **gratis** y
devuelve los ramos habilitados **para nuestra organización**, que puede no coincidir con el catálogo
público del portal. `lineasDeSeguro()` ya está implementado en `catalogos.ts` y `/correduria/hogar` lo
pinta — pero **no consta en ninguna tabla ni documento la respuesta real de esa llamada**, así que
aquí se dice «no comprobado», no «no existe».

### 3.1 Lo que SÍ hay en casa para RC (medido)

Las 9 pólizas de RC vivas, para saber de qué se parte el día que haya con qué cotizar:

| dato | tabla.columna | cobertura real medida (sobre 9) |
|---|---|---|
| tomador es persona **jurídica** | `clientes.tipo_persona` | **4/9 · 44,4%** |
| NIF/CIF | `clientes.dni` (cifrado) | **9/9 · 100%** |
| nombre | `clientes.nombre` | **9/9 · 100%** |
| apellidos | `clientes.apellidos` | **6/9 · 66,7%** (lógico: 4 son empresas) |
| fecha de nacimiento | `clientes.fecha_nacimiento` | **5/9 · 55,6%** |
| sexo derivable | `clientes.saludo` | **4/9 · 44,4%** |
| estado civil | `clientes.estado_civil` | **2/9 · 22,2%** |
| teléfono | `clientes.telefono` | **4/9 · 44,4%** |
| código postal | `clientes.codigo_postal` | **8/9 · 88,9%** |
| dirección | `clientes.direccion` (cifrada) | **7/9 · 77,8%** |
| **actividad / sector** | `clientes.sector` | **3/9 · 33,3%** |
| **ocupación** | `clientes.ocupacion` | **1/9 · 11,1%** |
| datos del riesgo | `polizas.datos_especificos` | **0/9 · 0%** — vacío en las nueve |
| prima anual actual | `polizas.prima_anual` | **9/9 · 100%** |
| capital asegurado | `poliza_coberturas.capital_asegurado` | **6/9 · 66,7%** tienen alguna línea con capital |

### 3.2 Y RC no es UN ramo: son varios

Las coberturas de esas 9 pólizas (agregado, sin datos de nadie) son heterogéneas: *RC Explotación*,
*RC Patronal*, *RC Profesional*, *RC Cruzada*, *Subsidiaria de subcontratistas*, *Locales arrendados*,
*Post-trabajos*, *Inmobiliaria*, *Accidentes de trabajo*, y también *RC caballos* y *RC perros*.

Eso importa para el mapa de campos: **una RC de explotación de una empresa y una RC de perros de un
particular no comparten ni el tomador ni el riesgo**. La primera necesita CNAE/actividad, facturación,
número de empleados y capital asegurado; la segunda, raza y número de animales. **Ninguno de esos
campos existe hoy en el schema `seguros`.** Lo más cercano es `clientes.sector` (33,3%) y
`clientes.ocupacion` (11,1%), que además son texto libre.

### 3.3 Lo único accionable hoy para RC

`POST /insurance-drafts` — **todos los campos son opcionales salvo `insuranceLine`** — crea un
BORRADOR que se remata a mano en el asistente de Avant2, y **no cuesta los 0,50€**. Es la vía natural
para «tengo cuatro datos de una RC, que lo termine una persona». Pero **sigue necesitando un
`insuranceLine.id` de RC**, que es justo lo que no consta que exista.

---

## 4. 🔴 Bloqueantes, ordenados por dolor

Obligatorios que **ni tenemos ni podemos derivar** — o sea, los que paran una cotización.

### RC — bloqueado entero (dolor 10/10)

1. **No hay contrato de campos del vendor.** Codeoscopic no documenta RC. **Antes de diseñar nada:
   llamar a `GET /insurance-lines` (gratis) y guardar la respuesta.** Si RC no está, la conversación
   es comercial con Codeoscopic, no técnica.
2. Aunque estuviera: **no existe en `seguros` ni actividad/CNAE, ni facturación, ni nº de empleados,
   ni capital pretendido**. Todo sería formulario nuevo.

### Hogar — se puede cotizar, pero con 17 campos supuestos (dolor 7/10)

3. **`buildingsLimit` / `contentsLimit`** — solo **36,8%** por la gemela, y la fuente CIMA
   (`poliza_coberturas.capital_asegurado`) está **vacía en las 37 filas** de continente/contenido.
   Sin capital no hay precio que valga. → preguntar, o cablear `POST /home/recommend-limits`.
4. **`address.roadName` + `roadNumber` + `roadType`** — techo **78,9%**, y con troceo best-effort que
   hay que revisar a mano. El vendor exige los tres.
5. **`floorArea` (57,9%) y `yearBuilt` (63,2%)** — el Catastro los cierra **si hay dirección**, o sea
   que dependen del bloqueante 4.
6. **`maritalStatus`** — **42,1%**.
7. **Los 17 campos al 0%** (`rooms`, los 9 catálogos, las 3 protecciones, los 4 límites de
   joyas/objetos/perros): no bloquean porque hay supuesto para todos, pero **el precio que sale es un
   precio sobre supuestos**, y cuatro de esos supuestos son **optimistas** (abaratan): `occupancy`,
   `location`, `buildQuality` y los cuatro límites a 0.
8. **La atribución bien↔póliza**: 9 de 19 clientes tienen varias viviendas y **no hay columna que las
   ligue a una póliza**. Usar `bienes_asegurables` sin regla de emparejamiento es cotizar la casa
   equivocada.

### Auto — el ramo más listo, con dos huecos duros (dolor 5/10)

9. **`vehicle.code`** — **0%**, y no se deriva: hay que elegir marca→modelo→versión a mano (gratis).
   Es el único paso manual inevitable de auto.
10. **`maritalStatus`** — **25,0%**: 60 de 80 hay que preguntarlas. Es el peor porcentaje de auto.
11. **`phones[0].number`** — **72,5%**, y **no se puede validar el patrón de móvil** por estar cifrado.
    Un fijo colado ahí es un 400 pagado.
12. **`drivingLicenses[0].date`** — **75,0%** (81,3% uniendo intervinientes).
13. **`birthDate` (83,8%) y `gender` (85,0%)** — no se suponen nunca: son datos de una persona real.
14. **El ramo equivocado en 14/80** (marca de moto con `insuranceLine: 'Car'` a fuego).
15. **6/80 son personas jurídicas** con `identificationDocument.type` cableado a `'Dni'`.

---

## 5. ⚠️ Suposiciones que necesitan el OK de Alberto

Estas son las que convierten un «no lo sé» en un valor que viaja al vendor y sale en un precio.
Ordenadas por cuánto pueden mover la prima.

### Ya aprobadas (se recogen para que consten)

| # | supuesto | quién lo aprobó |
|---|---|---|
| A1 | **Se presume que NO ha habido siniestros** (`yearsWithoutAccidents = totalYearsInsured`) | Alberto, 01/09/2026. Va marcado optimista |

### Pendientes de aprobar — AUTO

| # | supuesto | valor de hoy | por qué es defendible | riesgo si es falso |
|---|---|---|---|---|
| A2 | **Kilómetros al año** | **15.000** | media española declarada habitual | si conduce menos, paga de más; si más, la prima real sube |
| A3 | **Tipo de garaje** | **la primera opción del catálogo** | ⚠️ **no hay id preferido fijado**: depende del orden del vendor | puede abaratar sin saberlo. **Hay que fijar cuál es el conservador** |
| A4 | **Fecha de compra = fecha de matriculación** | sí | cierto salvo segunda mano | menor |
| A5 | **Años en la compañía = años asegurado** | sí | tira a caro, nunca a barato | ninguno (conservador) |
| A6 | **El coche duerme donde vive el tomador** (CP de circulación) | CP del cliente | es lo normal | el CP mueve mucho la prima de auto |
| A7 | **Tipo de documento = `'Dni'` siempre** | sí | 73 de 79 clientes son físicas | **falso en 6/79** (jurídicas: CIF) |
| A8 | **`insuranceLine = 'Car'` para todo lo de `tipo='auto'`** | sí | es lo que hay cableado | **falso en 14/80** (marcas de moto) |
| A9 | **Carnet tipo B expedido en España** | sí | es el caso normal | menor |

### Pendientes de aprobar — HOGAR

| # | supuesto | valor de hoy | riesgo si es falso |
|---|---|---|---|
| H1 | **Habitaciones estimadas por m²** | tramos 1→5 | mueve la prima; y si no hay m², no hay ni estimación |
| H2 | **Régimen = propietario (`Owner`) y el tomador es el dueño** | sí | un inquilino no asegura continente |
| H3 | **Uso = vivienda habitual (`MainResidence`)** | sí | **optimista**: una segunda residencia es más cara |
| H4 | **Ubicación = núcleo urbano (`CityCentre`)** | sí | **optimista** |
| H5 | **Calidad de construcción = `Normal`** | sí | **optimista** |
| H6 | **Materiales = `NonCombustible`, puertas secundarias = `NonReinforcedOtherDoor`, liquidación = `ReplacementValue`** | ejemplos del portal | mueven la prima; son los del ejemplo del fabricante, no una medición |
| H7 | **Sin alarma, sin puerta blindada, sin ventanas seguras, sin urbanización cerrada** | `NoAlarm` / `false` ×3 | **conservador** (encarece). Si las hay, el precio real BAJA |
| H8 | **Joyas dentro y fuera de caja = 0, objetos de valor = 0, perros peligrosos = 0** | 0 ×4 | **optimista los cuatro**: si los hay, el precio real SUBE |
| H9 | **El CP del riesgo = el CP del tomador** cuando falta | sí | asegura la casa equivocada si tiene varias |
| H10 | **Tipo de vía = `Calle`** cuando el troceo no lo reconoce | sí | menor |
| H11 | **`bienes_asegurables` como fuente del riesgo** | 🚫 **no cableado hoy** | **9/19 clientes tienen varias viviendas y no hay columna que las ligue a la póliza.** No usarlo sin una regla de emparejamiento por dirección/CP |

### Transversales

| # | supuesto | pendiente |
|---|---|---|
| T1 | **Fecha de efecto = día siguiente al vencimiento** (o mañana si ya venció) | es lo que quiere el cliente al renovar; menor |
| T2 | **Un precio de hogar firme cuesta el doble** (`ReRate` obligatorio) | **sin medir**. Se mide en la primera cotización real de hogar |

---

## 6. Lo que NO se ha comprobado (dicho como tal)

- **Si `PII_ENCRYPTION_KEY` abre los datos cifrados** de `central-asegura`. Todas las coberturas de
  DNI/teléfono/nacimiento/dirección de este documento cuentan **criptogramas presentes**, no datos
  legibles. Lo diagnostica `lib/pii-estado.ts` en runtime, con cuatro causas distintas.
- **Si `GET /insurance-lines` devuelve RC** (ni si devuelve hogar) para nuestra organización. La
  llamada es gratis y está implementada; **no consta su respuesta en ninguna parte**.
- **Cuántos de los 58 teléfonos de auto son móviles `^[67]\d{8}`**: van cifrados, no se puede
  comprobar por SQL.
- **Si las 14 pólizas con marca de moto son motos de verdad.** Se ha medido la marca, no el vehículo;
  `ramo_dgs` (241) no desempata porque cubre auto y moto.
- **El precio de los créditos de `GET /vehicles`** (matrícula→versión). Lo tiene que preguntar Alberto
  a `comercial@codeoscopic.com`.
