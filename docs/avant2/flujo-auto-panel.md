# Avant2 · flujo de cotización de AUTO en el panel (capturas de Alberto, 04/11/2026)

Fuente: Drive `AVANT2/AUTO` (11 PDF impresos del navegador: `1`–`4`, `allianz`, `generali`, `mapfre`, `occident`, `Reale`,
`preemitir`, `preemitir reale`). No hay ninguna captura «permitir» (permisos/consentimientos): lo que hay es «preemitir».
Datos del cliente omitidos a propósito. Cruce con `openapi-2026-11-04.yaml`, `AVANT2-CONFIGURACION.md`, `CODEOSCOPIC-API-PORTAL.md`.
Rutas del panel: `[subdominio].avant2.es/production/{nºpresupuesto}/auto/quotation/{risk|persons|insurance|products}`,
`…/auto/quotes` (ofertas) y `…/auto/preissuance/new/persons?priceIds={id}` (preemisión).

## (a) Flujo paso a paso
Cabecera fija: Nº presupuesto · Código oportunidad · Fecha de creación · Fecha de cierre (N/D) · «Cliente: [tomador]».
Pasos grandes: **1 Datos del Riesgo → 2 Presupuestos → 3 Pre-emisión → 4 Emisión**. El paso 1 tiene 4 pestañas.

1. **Vehículo** (`quotation/risk`): `* Matrícula` (texto) · `* Fecha de primera matriculación` (fecha) · `* Fecha de compra`
   (fecha) · `* Vehículo` (radio: «Modificar datos a partir de la matrícula» / «Modificar manualmente») → ficha «Datos del
   vehículo» (solo lectura: Marca, Modelo, Versión, Clase, Fecha de lanzamiento, Nº de puertas, Combustible, Cilindrada,
   Potencia) · `* Código postal` (texto + desplegable de población) · `* Tipo de garaje` (botones: Vía pública / Garaje
   individual / Garaje colectivo) · `* Kilómetros anuales` (número, «Debe ser múltiplo de mil») · `* Remolque ligero
   (< 750 kg)` (interruptor) · `Accesorios` (interruptor). Botón **Continuar**.
2. **Personas** (`persons`): bloque plegable «Conductor habitual» con chips `Tomador ×` `Propietario ×` (roles que asume);
   interruptores `Tomador` y `Propietario` (si NO coinciden se abren sus bloques) · `* Identificación` (desplegable DNI… +
   texto) · `* Nombre` (nombre + 2 apellidos) · `* Teléfono principal` · `* Fecha nacimiento` · `* Fecha de carnet` ·
   `* Zona de expedición` (desplegable: España…) · `* Estado civil` (desplegable) · `* Género` (Hombre/Mujer). Bloque
   plegable «Conductor ocasional». Botones Atrás / Continuar.
3. **Seguro** (`insurance`): «Datos complementarios» `* Fecha de efecto` (fecha; «Recomendamos seleccionar la fecha
   definitiva») · «Seguro anterior»: `* Tiene o ha tenido algún seguro` (interruptor) · `* Compañía` (desplegable de
   compañías DGS) · `* Matrícula asegurada` · `* Número de póliza` · `* Total de años asegurado` · `* Años en compañía
   anterior` · `* Años sin siniestros` (números).
4. **Productos** (`products`): columna derecha con una tarjeta por **config** (código de conexión + logo): Allianz
   `[código de conexión]`, Generali `[código de conexión]`, Mapfre `[código de conexión]`, Occident `[código de conexión]`, Reale `[código de conexión]`. Sin seleccionar: «Seleccione compañías
   para evaluar precios, descuentos y productos complementarios». Al pulsar una tarjeta se abre SU formulario (tabla b).
   Botón **Obtener precios**.
5. **Presupuestos / Ofertas** (`auto/quotes`): «Mostrar filtros» · «Ordenar por: Precio» · «Selección: Imprimir · Comparar ·
   IA Coverize» · pestañas por categoría con precio mínimo (**Todos / Terceros / Terceros Ampliado / Otros**, «desde X €»).
   Cada fila: logo + estrellas (valoración) + enlace «Cond. general» (PDF) + (i) + prima + «Config.: {código}» + nombre de
   modalidad + descripción + iconos (PDF, comparar, Coverize) + botón **Pre-emitir**. En la captura: Reale da 3 modalidades
   («Terceros Reale · Básico», «Terceros Reale · Con lunas», «Terceros Ampliado Reale · Con lunas, robo e incendio»);
   Allianz, Generali, Mapfre y Occident salen **«NO CONTRATABLE · Completada sin precios · Sin observaciones»**.
6. **Pre-emisión** (`preissuance/new/persons?priceIds=…`): mismas pestañas; en Personas, «Datos de fases anteriores»
   (solo lectura, todo lo del paso 2) y «Datos de pre-emisión» con lo que la compañía pide de más (tabla c). Continuar.
7. **Emisión**: no hay capturas.

## (b) Configuración por compañía (formulario de Productos, valor visto)
| Compañía (config) | Descuentos / comisión | Garantías y coberturas opcionales | Datos adicionales del riesgo |
|---|---|---|---|
| Allianz `[código de conexión]` | Descuento comercial % (CAP) **25** · Descuento comercial % (venta cruzada) **25** · Tipo de comisión sobre la prima **A** (desplegable) | Accidentes conductor **30.000** · Asistencia en Viaje **Estándar** · `*` Vehículo de sustitución Sí/**No** · `*` Aviso y gestión de multas de tráfico Sí/**No** | `*` Autorización expresa para menores de 25 años Sí/**No** · ¿Acabas de comprar el vehículo? («No, ya lo tenía y quiero cambiar…») · ¿Qué uso haces del vehículo? («Ocasional (fines de semana, va…») |
| Generali `[código de conexión]` | Descuento comercial % **0.00** | Accidentes corporales del conductor, Ampliar defensa jurídica y reclamación de daños, Asistencia en viaje, Vehículo de sustitución: **Valores por defecto** · Retirada de carnet **Sin contratar** · `*` Ampliación RC plus (valor no visible) · `*` Ampliación de daños del vehículo **No** · `*` Ampliación accidentes corporales **No** · `*` Colisión con animales **No** · Coberturas: `*` Reparación lunas en taller concertado **Sí** | Tipo de uso **Calcular automáticamente** · Código Flota (texto vacío) |
| Mapfre `[código de conexión]` | — (no hay bloque de descuentos) | — | `*` Vehículo Km 0 Sí/**No** · Tipo de uso **Particular** · Tipo de Garaje **Parking público descubierto** · Ámbito de circulación del Vehículo **Estándar** |
| Occident `[código de conexión]` | Descuento comercial **30** · Colectivo **Ninguno** (desplegable) | Incendio y robo, Incluir pérdida total en modalidades Combi, Servicio de gestoría, Accidentes ocupantes, Vehículo de sustitución, Asistencia en viaje, Recuperación de puntos, Servicio de alerta de multas de tráfico: todas **«Según configuración de la modalidad»** | Tipo de adquisición del vehículo («Seleccione un tipo») · `*` ¿Vehículo rematriculado? · ¿Leasing o renting? · `*` ¿Conductores < 25 años en la familia? **No** · `*` ¿Dispositivo antirrobo? **No** · Recinto de circulación **Sin recinto** · Nº de vehículos de la familia **1** · Uso del vehículo **Particular** |
| Reale `[código de conexión]` | Campaña comercial (desplegable; «- campañas no disponibles -») | Asistencia en viaje **SIN vehículo de sustitución** · Reclamación de multas **Excluida** · Retirada de carnet **Excluida - 0 €** · Capital de Accidentes **18.000** · `*` Limpieza (300 €) **No** · `*` Equipaje **No** · Agrupación de coberturas **Global** · `*` Daños por colisión animal **No** | Puntos carnet conductor habitual **12** · `*` El vehículo dispone de alarma **No** · Detector **Detector no instalado** · Uso del vehículo **Calcular automáticamente** |

Notas: franquicias y forma/frecuencia de pago NO aparecen en ninguna captura. La comisión de la correduría (`brokerFee`)
tampoco se ve; lo único de comisión es el «Tipo de comisión sobre la prima» de Allianz (comisión de COMPAÑÍA).
«Modalidad» solo aparece como resultado (paso 5) y como referencia en Occident («según configuración de la modalidad»).

## (c) Preemisión por compañía
| Compañía | Qué pide antes de emitir |
|---|---|
| Reale (config [código de conexión]) | En Personas → Conductor habitual (que es también tomador y propietario): **`* Código postal` + «Seleccione una población»** en «Datos de pre-emisión». Es el CP de la PERSONA (domicilio); el del paso 1 era el de circulación del vehículo. |
| Allianz, Generali, Mapfre, Occident | Sin capturas: no dieron precio («NO CONTRATABLE»), así que no se llegó a su preemisión. |

## (d) Campo de la pantalla → equivalente en la API
| Pantalla | API |
|---|---|
| Matrícula · F. primera matriculación · F. compra | `POST /insurances` `risk` (`CarRisk_V1`): `registrationPlate`, `registrationDate`, `purchaseDate` (gratis: `GET /car/registration-date?plate=`) |
| Vehículo (matrícula / manual) y ficha | `risk.vehicle` (`Car_V1`); catálogo gratis `/car/brands/…/vehicles`; por matrícula `GET /vehicles` (factura) |
| Código postal + población (paso 1) | `risk.circulationAddress` (`PostalCodeAndTown_V1 {postalCode, town}`) |
| Tipo de garaje | `risk.garageType` (`GET /car/garage-types`, p. ej. `CommunalParking` = Garaje colectivo) |
| Kilómetros anuales · Remolque ligero | `risk.kilometersPerYear` · `risk.lightTrailer` |
| Accesorios | `risk.installedAccessories[]` / `installedOptions[]` (`GET /car/vehicles/{code}/options`) |
| Conductor habitual (identificación, nombre, teléfono, nacimiento, estado civil, género) | `risk.primaryDriver` (`CarMainDriver_V1`): `identificationDocument`, `name/surname/surname2`, `phones[]`, `birthDate`, `maritalStatus`, `gender` |
| Fecha de carnet · Zona de expedición | `primaryDriver.drivingLicenses[]` (`DrivingLicense_V1 {type, date, issuingZone}`; `GET /car/driving-license-issuing-zones`) |
| Interruptores/chips Tomador y Propietario | `holder` (raíz) y `risk.owner`; qué roles puede asumir la misma persona: `GET /car/person-roles` (`compatibleRoles`) |
| Conductor ocasional | `risk.secondaryDriver` (`CarSecondaryDriver_V1`) |
| Fecha de efecto | `effectiveDate` (raíz de `POST /insurances`) |
| Seguro anterior (tiene, compañía, matrícula, póliza, años asegurado / en compañía / sin siniestros) | `risk.previouslyInsured` + `risk.previousInsurance` (`MotorPreviousInsurance_V1`: `previousCompany`, `registrationPlate`, `policyNumber`, `totalYearsInsured`, `yearsInPreviousCompany`, `yearsWithoutAccidents`; `lastFiveYearsAccidents` no sale en pantalla). Lista: `GET /car/insurance-companies` |
| Tarjetas de compañía (código) | `products[].config.id`; el código visible es `configs[].name` de `GET /insurance-lines/Car/products` |
| Descuentos (comercial %, CAP, venta cruzada, colectivo, campaña) | Opciones del producto: `products[].options` (`QuoteOptions_V1`); valores/listas solo vía formulario (`POST /product-form-requests`, etapa `QUOTATION`). Sin endpoint propio |
| Tipo de comisión sobre la prima (Allianz) | Opción del producto (`products[].options`). NO es `brokerFee` (esa es la comisión de la correduría: `configs[].brokerFee`, `PATCH …/quotes/{id}`) |
| Garantías/coberturas opcionales y datos adicionales del riesgo de cada compañía (tabla b) | `products[].options` (por compañía, ids propios del vendor); al leer la oferta, `formattedOptions` de `GET /insurances/{id}/offers/{offerId}` |
| «Valores por defecto» / «Según configuración de la modalidad» | Default de la `config` fijado en el panel; por API solo se pisa petición a petición |
| Ofertas: categorías Terceros / Terceros Ampliado / Otros, nombre y descripción de modalidad, estrellas | `ProductModality` (`category.name`, `name`, `description`, `customDescription1/2`, `rating`) en `mainQuotes[]` |
| «NO CONTRATABLE · Completada sin precios» | Quote sin precio; motivo en `errors` / acciones (`ReRateAction`) |
| Cond. general (PDF) | Sin campo identificado en este cruce (probablemente un `Link`/documento de la quote: por confirmar) |
| Imprimir · Comparar · IA Coverize · Ordenar/filtros | Solo panel (no hay equivalente en la spec) |
| Pre-emitir → CP de la persona (Reale) | Campo de persona `primaryDriver.addresses[]` exigido por producto: `GET /car/person-roles` → `requiredForRatingProducts`; se completa re-tarificando `POST /insurances/{id}/offers` (etapa `PREISSUANCE` del formulario sobre la quote) |
| Emisión | `GET /insurances/{id}/policy-application-fields` + `POST /insurances/{id}/policy-applications` |

## (e) Dudas para Alberto
1. ¿Los descuentos 25/25 (Allianz) y 30 (Occident) son los pactados y fijados en el panel por defecto, o los tecleaste en esta cotización?
2. Allianz «Tipo de comisión sobre la prima = A»: ¿qué significan A/B/C…? ¿Cambia comisión de compañía y prima a la vez?
3. Allianz: ¿qué diferencia hay entre «Descuento comercial (CAP)» y «(venta cruzada)»? ¿Se suman?
4. ¿Por qué Allianz, Generali, Mapfre y Occident salen «NO CONTRATABLE · Completada sin precios»? ¿Lo sabes por el (i)? ¿Edad del vehículo, uso «Ocasional», «Tipo de adquisición» vacío en Occident?
5. Mapfre propone «Parking público descubierto» aunque en el riesgo pusiste «Garaje colectivo»: ¿es un default de la config de Mapfre o un mapeo automático mal hecho?
6. Reale «campañas no disponibles»: ¿tienes campañas pactadas con Reale que deberían salir?
7. El Nº de presupuesto cambia entre Productos y Ofertas (misma oportunidad): ¿cada «Obtener precios» crea un presupuesto nuevo (y en API, un `POST /insurances` cobrado)?
8. La preemisión de Reale pide el CP de la persona: ¿debería coincidir con el de circulación del paso 1, o es su domicilio fiscal?
9. Faltan capturas de: preemisión de otra compañía, paso 4 Emisión, forma/frecuencia de pago, franquicias, comisión de la correduría (`brokerFee`) y la pantalla de «opciones por defecto» de cada config. ¿Las puedes sacar?
10. ¿«Permitir» se refería a estas capturas de «preemitir», o falta una carpeta de permisos/consentimientos?

## (f) Respuestas de Alberto (04/11/2026)
1. Los descuentos de la captura (Allianz 25/25, Occident 30) se pusieron para PROBAR si así da precio; no son necesariamente los fijados por defecto.
2. Allianz: descuento MÁXIMO en CAP y en venta cruzada, porque a menudo no se sabe si el cliente tiene otro seguro en Allianz.
3. «No contratable · sin precios»: Alberto no sabe la causa; cree que son errores que devuelve Avant2 (ver motivos guardados en BD por compañía).
4. Cada «Obtener precios» conecta con las compañías (nuevo presupuesto) y Avant2 lo confirma por correo → por API, cada vez = `POST /insurances` facturado.
5. «Permitir» = «preemitir».
6. Las pantallas que faltan (preemisión de otras compañías, emisión, pago, franquicias, opciones por defecto) se capturan navegando la web de Avant2 SIN pulsar «Obtener precios» ni «Emitir».

## (g) Motivos de «sin precio» de Avant2 guardados en BD (05/10–15/10/2026, auto, 20 fallos en 7 tarificaciones)
- Política de suscripción (no se corrige): Mapfre «riesgo no contratable por normas de suscripción» (5), Occident «riesgo no contratable» (4), Reale «malus» (1) y «vehículo no disponible» (1), Allianz «vehículo no permitido» (1).
- Datos corregibles: póliza anterior (Occident exige 5 caracteres; Allianz rechaza `previousInsurancePolicy`), Mapfre «equivalencia del código» del vehículo.
- Generali «Código 2115» en los 7 intentos: error genérico de envío de Avant2 → revisar la conexión de Generali en el panel / consultar a Codeoscopic (el bot de Generali auto tampoco da precio).
