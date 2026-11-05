# Auditoría Avant2/Codeoscopic: gasto, datos previos y consultas gratis (05/11/2026)

Solo lectura de código y BD (proyecto `central`, schema `seguros`). No se ha llamado a la API real. Sin datos personales.

## Veredicto
**Hoy no se paga en balde de forma sistemática.** Toda llamada que cobra pasa por un embudo con libro, tope y un solo
intento. En BD, los 37 `POST /insurances` cobrados tienen precio, ninguno con fecha de efecto pasada y ninguna reserva
abierta. Quedan **cuatro agujeros pequeños de gasto** (abajo, de MEDIA a BAJA) y **una guarda que falta**: los productos
PILOTO o DESCATALOGADO no se filtran antes de pagar. Hoy esa guarda no cuesta euros, pero es la que pidió Alberto.

## Cifras de BD
| Mes | `POST /insurances` cobrados (0,50 €) | Gasto | Descartados con prueba (gratis) | ReRate apuntados | Otros |
|---|---|---|---|---|---|
| 2026-09 | 28 (auto 22, moto 5, hogar 1) | 14,00 € | 5 | 0 cobrados, 6 descartados | 1 submit y 1 recommend-limits a 0 € («sin confirmar») |
| 2026-10 | 9 (auto 7, moto 2) | 4,50 € | 1 | 4 a 0,50 € = 2,00 € (sin confirmar que se cobren) | — |
| 2026-11 | 0 | 0,00 € | 0 | 0 | — |

- Septiembre: el libro dice 28, igual que la factura de Codeoscopic (28). Cuadra.
- **Cotizaciones cobradas que acabaron sin ningún precio: 0 de 37.** Las 37 tienen su tarificación y su `projectId`.
- **Fallos guardados** (desde el 05/10, 22 en 7 tarificaciones de auto):
  - Generali «Código 2115»: 7 de 7.
  - Mapfre «no contratable / equivalencia»: 6.
  - Occident «no contratable»: 4, y «póliza de 5 caracteres»: 1.
  - Allianz: 2. Reale: 2.
  - En todos los casos dieron precio otras compañías. Un fallo no cuesta más: se cobra por cada POST, no por compañía.
- **Duplicados del mismo riesgo en menos de 24 h con cuerpo IDÉNTICO: 5 cobros de más (2,50 €), todos anteriores a la guarda del 08/10.**
  - 3 se repitieron en menos de 15 minutos. Hoy la guarda los pararía.
  - 2 se repitieron a las ~6 h y a las ~20 h. Hoy se volverían a cobrar.
  - Los demás pares en 24 h tienen cuerpos distintos (otra fecha de efecto u otros datos): son recotizaciones legítimas.

## A) ¿Se paga en balde? Caminos que pueden cobrar
**Bien (comprobado):**
- `POST /insurances` solo sale de `cotizar()` (`apps/asegura/lib/codeoscopic/cotizar.ts:385`), y en este orden:
  1. Simulación.
  2. Interruptor.
  3. Libro (si no se puede leer, no se cotiza).
  4. Tope diario y mensual, y tope en euros (60/70 €).
  5. Reserva con `pg_advisory_xact_lock` por huella y por correduría (`consumo.ts:208-268`).
  6. **Un solo intento.** Solo se repite tras un 401, que no cobra (`cliente.ts:204`).
- Un timeout, un 5xx o un corte de red dejan la reserva en `reservado` y cuenta como gastada. No se reintenta solo.
- Re-tarificar (`emitir.ts:268`), Submit (`emitir-envio.ts:299`) y `recommend-limits` (`limites-hogar.ts:57`) pasan por `conLibroDeEmision`, con candado y tope en euros.
- `GET /vehicles?registrationPlate=`: **no lo llama nadie.** `catalogos.ts` usa `/car|motorcycle/brands/…/vehicles?engine=`, que es gratis.
- No hay ningún cron, webhook ni workflow de GitHub que cotice. `tarificador-relanzar.yml` solo hace `catalogo_avant2`, que es GET gratis con lista cerrada.
- Dos pulsaciones seguidas con el mismo cuerpo en menos de 15 minutos dan **409, o reutilizan la copia sin cobrar.**
- Fecha de efecto caducada o a más de 90 días: se corta gratis en `revisarDatosAuto/Moto/Hogar` (`peticion-auto.ts:289`).

**Hallazgos:**
| # | Gravedad | Dónde | Qué pasa | Riesgo € | Arreglo |
|---|---|---|---|---|---|
| 1 | MEDIA | `huella.ts:9` (`VENTANA_DUPLICADO_MIN = 15`) | Un cuerpo idéntico repetido pasados 15 minutos se vuelve a cobrar. Ya ha pasado 2 veces (ver «Cifras de BD»). | 0,50 € por repetición (histórico: 1,00 €) | **S**: reutilizar la copia hasta 24 h si el cuerpo es idéntico y la fecha de efecto sigue siendo válida. `forzar` sigue disponible. |
| 2 | MEDIA | `cotizar.ts:389-392` | Tras un 200 ya cobrado, puede lanzar `leerCotizacion` (sin `projectId`) o `cerrarFacturable` (fallo de BD). Entonces cae en el `catch` y no guarda la respuesta. El usuario ve «error del vendor» y, pasados 15 minutos, el reintento cobra otra vez. | 0,50 € por incidente (probabilidad baja) | **S**: separar el `try` de la llamada del de lo posterior. Guardar el crudo antes de interpretarlo (cuarentena). Si `cerrarFacturable` falla, seguir con `anotar`. |
| 3 | MEDIA | `peticion-auto.ts:463-472` (no manda `products`) y ninguna lectura de `seguros.codeoscopic_catalogo` antes de pagar | Avant2 cotiza todos los productos activos del ramo, y nada corta antes si son PILOTO o DESCATALOGADO. Ver «Datos del catálogo» bajo la tabla. | 0 € directo (se cobra por POST). 0,50 € si un ramo se queda sin ningún producto vivo y la cotización sale sin precios. | **Panel (Alberto):** desactivar «PILOTO - Generali Autos 2025» y decidir qué hacer con Mapfre. **S:** guarda previa que lea la última instantánea, corte si el ramo no tiene ningún producto vivo y avise si la instantánea tiene más de 7 días. **Pregunta a Codeoscopic:** ¿`products[]` restringe qué productos se cotizan? |
| 4 | MEDIA | `app/api/operador/codeoscopic/oferta/route.ts:384` + `libro-emision.ts` | El ReRate no tiene guarda contra el doble clic. `conLibroDeEmision` no tiene huella, así que dos «Pre-emitir» seguidos son dos ReRates. | 0,50 € por ReRate según el libro (el cobro real está sin confirmar) | **S**: huella o candado por tarificación + precio + 15 min, como en `cotizar()`. |
| 5 | BAJA | `app/api/cartera/polizas/[polizaId]/retarificar/route.ts:62`, `app/api/cartera/cliente/[clienteId]/hogar-nuevo/route.ts:108` | Cotizan sin `confirmado: true`. El guardián (`test/regression-asegura-gasto-codeoscopic.test.ts:331`) solo lo exige a `recommend-limits`. Tienen sesión y cookie `SameSite=Lax`, así que no hay riesgo CSRF. | Bajo | **S**: exigir `confirmado` y extender el guardián a toda ruta que llame a `cotizar(`. |
| 6 | BAJA | `gasto-emision.ts` (coste de submit y límites en env = 0) | Si el Submit o `recommend-limits` facturan, el tope en euros no los cuenta. | ~0,50 € por llamada, sin contar | Pedir confirmación escrita a Codeoscopic y poner el coste real en la env. |
| 7 | BAJA | `retarificar-cartera.ts` (`prepararMoto`, `prepararAuto`) | No se comprueba que `codigoVehiculo` sea del catálogo del ramo, que fue el caso moto/auto de ayer (CIMA, `MO` = monovolumen). Lo normal es un 400 gratis. Solo costaría si el vendor diera un 200 sin precios (0 casos). | Bajo | **S**: validar el código contra el catálogo GET del ramo, que es gratis y está en caché. |

Datos del catálogo para el hallazgo 3 (instantánea del 04/11):
- Auto tiene 6 productos. Dos llevan marca de estado:
  - «PILOTO - Generali Autos 2025»: **0 precios en 29 cotizaciones de auto**, con el error 2115 siempre.
  - «DESCATALOGADO - Mapfre Autos»: es de donde salen **todos** los precios de Mapfre (14 cotizaciones).
- «Mapfre Autos 2026» no ha dado nunca precio.
- Ningún producto tiene `favorite: true`.

## B) Datos completos antes de pagar
Comparado con lo que la spec marca obligatorio (`CarRisk_V1`, `MotorcycleRisk_V1`, `HomeRisk_V1`, `MotorPreviousInsurance_V1`, `HomeAddress_V1`, `DrivingLicense_V1`) y con lo que Avant2 ha rechazado.

**Auto**
- Se revisa gratis:
  - El vehículo (`codigoVehiculo`), el garaje, la matrícula y las fechas de matriculación y de efecto.
  - Los km, el CP y el `municipioCirculacionId` del catálogo.
  - La persona: DNI con letra, nombre, apellidos, nacimiento, sexo, estado civil, teléfono y fecha de carné.
  - El historial: compañía, póliza anterior (al menos 5 caracteres; viajan los 5 últimos), años (sin ceros contradictorios) y siniestros cuando hace falta.
- `lightTrailer` y `previouslyInsured` van a `false` por defecto.
- Para emitir se exigen también el email, `tipoVia` y el número.

**Moto**
- Lo mismo que auto, más `garaje`, `experienciaConduccion` y `motoAnteriorCodigo` (si tiene experiencia en otra moto).
- Antes de pagar se cruzan el carné y la versión, y se comprueba que el ramo tarifica (`/insurance-lines`).

**Hogar**
- CP de 5 cifras, `municipioId`, `tipoViaId`, nombre y número de la vía, m², año y habitaciones.
- Los 9 catálogos: tipo de vivienda, uso, ocupación, ubicación, material, calidad, alarma, puertas secundarias y asentamiento.
- Los 4 de sí/no.
- Algún capital y la fecha de efecto.

**Lo que puede viajar sin estar confirmado (no es gasto, es exactitud):**
- `peticion-hogar.ts:323-326`: joyas, objetos de valor y perros peligrosos viajan como `?? 0`.
  - Desde la cartera se marcan como supuesto (`desde-cartera-hogar.ts:273-274`).
  - Pero el constructor pone 0 aunque no venga el supuesto.
  - Propuesta: exigir el valor o el supuesto explícito.
- `peticion-auto.ts:425`: `purchaseDate` toma la fecha de matriculación si no hay otra, sin marcarlo como supuesto (mal en un coche de segunda mano).
- El CP de residencia no se exige antes de cotizar, y Reale lo pide en la preemisión (`docs/avant2/flujo-auto-panel.md` §c). Es un ReRate más.
- **No se ha encontrado ningún obligatorio de la spec que pueda llegar vacío al POST.**

## C) Consulta de datos previa
- **Catálogo gratis: funciona.**
  - `seguros.codeoscopic_catalogo` ya existe, con 1 instantánea del 04/11: 23 productos y 72 filas de ramo.
  - La instantánea solo hace GET de la lista cerrada (`catalogo-companias.ts`, doble barrera con `esEndpointGratis`).
  - `docs/AVANT2-CONFIGURACION.md` dice todavía «SQL NO aplicado»: está desactualizado.
  - Nadie lee la instantánea antes de cotizar (hallazgo 3).
- **Catastro: funciona.**
  - Plataforma busca por dirección antes de pedir precio (`apps/plataforma/lib/correduria-hogar.ts:89`, `inmueblesPorDireccion`).
  - La ruta de asegura exige la referencia de 20 caracteres (`hogar-nuevo/route.ts:22`) y no cotiza si el Catastro falla (503) o no encuentra nada (404).
- **Vehículo por matrícula con el bot: no está conectado.**
  - `POST /api/operador/tarificador/vehiculo` existe, detrás de `TARIFICADOR_RPA_ACTIVO` y `TARIFICADOR_VEHICULO_ACTIVO`, apagado por defecto. Pero plataforma no lo llama desde ningún sitio.
  - Hoy el vehículo se elige por la cascada gratis marca → modelo → versión.
  - El `GET /vehicles` de pago no se usa: no hay gasto.
  - Conectarlo es un **M**: botón «buscar por matrícula» en la pantalla de auto nuevo, con sondeo del trabajo.

## Cómo se verifica cada arreglo
- **1:** test de `decidirDuplicado` con una fila facturable de hace 6 h y copia. Tiene que dar `reutilizar`; hoy da `llamar`.
- **2:** test de `cotizar()` con `peticion` doblada que devuelve un 200 sin `projectId`. Tiene que quedar la copia en cuarentena y no `vendor` a secas.
- **3:** consulta de la última instantánea con 0 productos vivos en `Car`. Tiene que cortar con 409 y `gastado: '0,00€'`.
- **4:** dos ReRates simultáneos con el mismo `tarificacionId` y precio. El segundo tiene que dar 409.
- **5:** el guardián en rojo si una ruta que llama a `cotizar(` no contiene `cuerpo.confirmado !== true`.
- Si un arreglo se equivoca: el 1 podría reutilizar un precio caducado (por eso se condiciona a que la fecha de efecto siga siendo válida). El 3 podría bloquear un ramo con la instantánea vieja (por eso solo corta si hay 0 productos vivos, y si no, avisa).
