# Patrimonio en el portal del cliente (asegura-portal) — diseño

> Fecha: 22/10/2026 · Estado: **aprobado el módulo por Alberto; esta spec fija el alcance y los defaults** (las
> preguntas abiertas del final llevan el default que se asume hasta que Alberto diga otra cosa).
> Plan: `docs/superpowers/plans/2026-10-22-asegura-portal-patrimonio-fase-1.md`.
> Lógica pura: `packages/module-patrimonio` (paso 1, hecho). App: `apps/asegura-portal/app/(portal)/patrimonio`.

## 1. Por qué

Propietarios con varios inmuebles y sociedades llevan hoy su patrimonio en Excel (Grupo Elca: comunidades,
gastos fijos y variables) o de memoria (Antonio Lozano: administra varias sociedades con inmuebles alquilados).
Darles gratis una herramienta para llevarlo **dentro del portal de Grupo ASegura** hace dos cosas:

1. **Fideliza**: el cliente entra al portal cada mes, no una vez al año al renovar.
2. **Capta seguros con datos, no con llamadas**: cada inmueble sin póliza conocida, cada continente por debajo del
   valor de reconstrucción, cada contrato sin seguro del inquilino y cada comunidad sin póliza es una oportunidad
   que el propio cliente ve, con su cifra, en su pantalla.

Pilotos: **Antonio Lozano** (varias sociedades, larga estancia) y **Grupo Elca** (patrimonial, Excel). Volumen
desconocido (ver §9).

## 2. Alcance

### Fase 1 (esta spec)
- **Titulares**: persona o sociedad. Una identidad del portal gestiona varios titulares (sus fichas, las empresas
  de las que es Dueño, y las que le autoricen con nivel Gestión/Total).
- **Inmuebles**: alta con **CP primero** → provincia → municipio → calle del callejero del Catastro → número
  (regla de la casa; referencia `BuscadorDireccionCp.tsx` + `core-catastro`/`core-direccion`), referencia catastral,
  superficie y año del Catastro, uso, alias, suministros (CUPS / nº de contrato de agua).
- **Inquilinos**: persona o sociedad + email. **Sin cuenta del portal**: acceden por enlace + código de un solo uso.
- **Contratos de larga estancia** (LAU, no turístico): renta, inicio/fin, cláusula de actualización por índice,
  fianza y su depósito, seguro exigido al inquilino.
- **Gastos fijos**: plantillas recurrentes (comunidad, IBI, hipoteca, gestoría…) con día del mes y generador.
- **Gastos variables**: factura subida → IA lee → propuesta de inmueble + categoría → **el cliente confirma**.
- **Comunidad** como entidad: cuota periódica y **derramas** (en N cuotas).
- **Documentos** por inmueble, contrato e inquilino (`module-documental`, owner opaco `tipo+id`).
- **Calendario de obligaciones**: ITE/IEE, certificado energético, gas, ascensor, boletín, fin de contrato, depósito
  y devolución de fianza, recibo anual del seguro del inquilino, actualización de renta.
- **Rentabilidad** por inmueble y periodo: renta devengada − gastos confirmados − seguros.
- **Alerta de infraseguro**: capital de continente vs valor de reconstrucción estimado con los m² del Catastro.
- **Avería/siniestro del inquilino por enlace**: el inquilino comunica una avería; si es siniestro, el propietario
  lo convierte en parte (el circuito de parte existente).

### Fase 2 (fuera)
Liquidaciones a propietarios/socios, cobro de rentas (domiciliación, conciliación bancaria), impagos y su gestión,
modelo 115/180 y ayudas a la renta. **Fase 1 no tiene cobros**: la renta es DEVENGADA y la pantalla lo dice («según
contrato, no lo cobrado»).

### No se hace
- Alquiler turístico (eso es sivra/plataforma).
- Asesoramiento fiscal (las cifras son de gestión, no la declaración; el texto lo dice).
- Ningún envío al inquilino ni a terceros sin que el propietario lo pulse (ver §6).

## 3. Arquitectura

```
packages/module-patrimonio   (PURO: tipos, gastos fijos, imputación, contrato, actualización renta, calendario, rentabilidad)
  ├─ usa @central/module-contabilidad  (generarFechasRecurrente, calcularRentabilidad — Apunte con entidad_id=inmueble)
  └─ (pasos posteriores) infraseguro → capitalContinenteSugerido/avisoInfraseguro de @central/module-tarificacion
packages/module-documental   (expedientes por owner opaco: 'inmueble'|'contrato'|'inquilino')
packages/core-catastro / core-direccion  (alta del inmueble)
packages/core-identity       (requireSecret; código de un solo uso del inquilino)
packages/core-firma          (firma SIMPLE del contrato / acuses, sin TSA)
apps/asegura-portal
  ├─ lib/patrimonio/*.ts     (adaptadores BD → tipos puros; TODA lectura parte de accesosPatrimonio(identidadId))
  ├─ app/(portal)/patrimonio/…  (pantallas)
  └─ app/inquilino/[token]/…    (página pública del inquilino: enlace + código)
apps/asegura (trastienda)    (el ENVÍO de correos al inquilino vive aquí, como el resto: el portal no tiene emails en claro)
```

- **Dinero en céntimos enteros** en el paquete (`Centimos`). `module-contabilidad` trabaja en euros con `round2`;
  `calcularRentabilidad` recibe céntimos como `base_imponible` (solo suma/resta). En BD, `bigint` de céntimos.
- **Fechas** de calendario como `YYYY-MM-DD` (`date` en BD), aritmética UTC; `hoy` siempre inyectado.
- Cambio colateral del paso 1: `module-contabilidad` importa sus módulos con extensión `.ts` (como
  `module-seguros-portal`) para poder ejecutarse con `node --test`; sus consumidores extienden `tsconfig.base.json`
  (`allowImportingTsExtensions`) — verificado con `tsc` de sivra.
- Hallazgo (no se toca en este alcance): `generarFechasRecurrente` usa `setMonth` nativo: desde un día 31 desborda
  (31/01 + 1 mes = 03/03) y depende del huso. `module-patrimonio` lo esquiva alimentándolo con el día 1 a mediodía
  UTC y poniendo el día del cargo después. ialimp/sivra lo usan tal cual: **propuesta** de arreglo aparte.

## 4. Modelo de datos (schema `seguros`, tablas `portal_patrimonio_*`)

Todas: `id uuid default gen_random_uuid()`, `creado_en/actualizado_en timestamptz`, `creado_por_identidad_id uuid`.
Todas con `REVOKE ALL … FROM crm_seguros` (guardián `test/regression-portal-sin-crm.test.ts`) y `GRANT` por columnas
al rol `prisma_asegura_portal` (SIN BYPASSRLS): **primero el GRANT, luego el schema Prisma**. DDL en el MISMO paso que
el despliegue que la usa. Rol sin `DELETE` salvo donde se diga: se archiva (`archivado_en`).

| Tabla | Columnas clave | Notas |
|---|---|---|
| `portal_patrimonio_titular` | `cliente_id uuid NOT NULL` (ficha de cartera), `correduria_id`, `tipo` CHECK persona/sociedad, `deduce_iva boolean NULL`, `alta_por_identidad_id` | UNIQUE (`cliente_id`). El nombre y NIF NO se copian: se leen de la ficha (`clientes`, columnas ya concedidas; el NIF entero no — ver §7). |
| `portal_patrimonio_inmueble` | `titular_id` FK, `alias`, `uso` CHECK, `referencia_catastral char(20) NULL`, `cp`, `municipio_ine`, `via`, `numero`, `resto`, `direccion_normalizada`, `superficie_m2 numeric NULL`, `anio_construccion int NULL`, `en_comunidad boolean NULL`, `suministros text[]`, `valor_reconstruccion_estimado_cent bigint NULL` + `_fuente`, `archivado_en` | UNIQUE (`titular_id`,`referencia_catastral`) parcial `WHERE referencia_catastral IS NOT NULL AND archivado_en IS NULL`. |
| `portal_patrimonio_comunidad` | `nombre`, `nif_comunidad NULL`, `administrador_nombre/email NULL`, `cp`, `direccion_normalizada` | Una comunidad la comparten varios inmuebles (incluso de titulares distintos que no se ven entre sí: la fila no expone a los demás). |
| `portal_patrimonio_inmueble_comunidad` | `inmueble_id`, `comunidad_id`, `coeficiente numeric NULL` | Puente. |
| `portal_patrimonio_inquilino` | `titular_id` (de quién es la ficha del inquilino), `tipo` CHECK, `nombre`, `nif_cifrado NULL`, `email_hash`, `email_cifrado`, `telefono_cifrado NULL` | PII **cifrada** con la clave del puerto (el portal no descifra: §7). |
| `portal_patrimonio_contrato` | `inmueble_id`, `inicio date`, `fin date NULL`, `terminado_en date NULL`, `renta_mensual_cent bigint`, `clausula` CHECK ninguna/indice, `indice` CHECK IPC/IRAV/otro NULL, `fianza_cent bigint NULL`, `fianza_depositada_en date NULL`, `fianza_organismo NULL`, `fianza_devuelta_en date NULL`, `seguro_inquilino_exigido boolean`, `seguro_inquilino_vence date NULL` | CHECK `clausula='indice' ⇔ indice IS NOT NULL`. |
| `portal_patrimonio_contrato_inquilino` | `contrato_id`, `inquilino_id`, `papel` CHECK titular/avalista | Puente. |
| `portal_patrimonio_renta_actualizacion` | `contrato_id`, `desde date`, `renta_mensual_cent`, `indice`, `pct_aplicado numeric`, `periodo`, `topado`, `notificada_en NULL` | APPEND-ONLY (sin UPDATE/DELETE al rol). |
| `portal_patrimonio_plantilla_gasto` | `titular_id`, `inmueble_id NULL`, `comunidad_id NULL`, `concepto`, `categoria` CHECK, `periodicidad` CHECK, `dia_mes smallint CHECK 1..31`, `inicio`, `fin NULL`, `importe_cent NULL`, `proveedor NULL`, `activo` | `importe_cent NULL` = variable (no 0). |
| `portal_patrimonio_gasto` | `titular_id`, `inmueble_id NULL`, `fecha`, `categoria NULL`, `concepto`, `base_cent NULL`, `total_cent NULL`, `estado` CHECK propuesto/confirmado/descartado, `origen` CHECK plantilla/factura/manual/derrama, `clave NULL`, `documento_id NULL`, `propuesta jsonb NULL` (motivos + confianza de la IA), `confirmado_en`, `confirmado_por_identidad_id` | UNIQUE (`titular_id`,`clave`) parcial `WHERE clave IS NOT NULL`: el generador es idempotente. CHECK `estado<>'confirmado' OR (base_cent IS NOT NULL OR total_cent IS NOT NULL)`. |
| `portal_patrimonio_derrama` | `comunidad_id`, `inmueble_id`, `concepto`, `total_cent`, `cuotas`, `primera date` | Genera gastos `origen='derrama'`, clave `<derrama>:<n>`. |
| `portal_patrimonio_obligacion` | `inmueble_id`, `tipo` CHECK, `aplica boolean NULL`, `ultima date NULL`, `vence date NULL`, `periodicidad_meses NULL`, `avisada_en NULL` | Las de contrato NO se guardan: se calculan. |
| `portal_patrimonio_enlace_inquilino` | `contrato_id`, `inquilino_id`, `token_hash`, `creado_en`, `anulado_en NULL`, `ultimo_uso_en NULL` | Token HASHEADO; anular no borra. |
| `portal_patrimonio_aviso_inquilino` | `contrato_id`, `inquilino_id`, `tipo` CHECK averia/siniestro/consulta, `texto`, `fotos` (documentos), `estado` CHECK recibido/visto/convertido_en_parte/cerrado, `parte_id NULL` | El rol del portal INSERTA desde la página pública. |

**Seguros por inmueble**: ninguna columna nueva en `polizas`. El enlace inmueble↔póliza es
`portal_patrimonio_inmueble_poliza (inmueble_id, poliza_id NULL, poliza_declarada_id NULL)` con CHECK
`num_nonnulls(...)=1`; la póliza tiene que estar en la cartera que la identidad VE (`carteraDeIdentidad`). La
sugerencia automática (misma referencia catastral/dirección que `describirBien().ubicacion`) se PROPONE, no se escribe.

### Aislamiento (lo da el CÓDIGO)
- Toda lectura parte de `accesosPatrimonio(identidadId)` (`lib/patrimonio/accesos.ts`, a imagen de
  `accesosFlota()`): devuelve `{titularId → nivel}` con tres fuentes, **fail-closed**:
  1. fichas vinculadas a la identidad (`portal_vinculo`) → `total`;
  2. empresas de las que es Dueño (`empresasDeFichas()`) → `total`;
  3. `portal_autorizacion` aceptada y no revocada con alcance **`patrimonio_gestion`** o **`patrimonio_total`**
     (como `flota`: **NO entran en `ALCANCES`**, los lectores viejos los ignoran y no abren la bóveda). Solo los
     concede el titular (o el Dueño de la sociedad), doble aceptación, sociedad exige `titulo_representacion`.
- El `id` de la URL (inmueble, contrato, gasto) se busca DENTRO de lo autorizado: **404 nunca 403**.
- Cepo nuevo `test/regression-portal-patrimonio-aislamiento.test.ts` (lee el fuente: ningún `prisma.portalPatrimonio*`
  sin pasar por `accesosPatrimonio`), y las rutas nuevas entran en el guardián de aislamiento existente.

| Acción | Gestión | Total |
|---|---|---|
| Ver inmuebles, contratos, gastos, calendario, rentabilidad | ✓ | ✓ |
| Subir/confirmar facturas, crear plantillas, documentos | ✓ | ✓ |
| Alta/baja de inmueble, contrato, inquilino; enlace del inquilino | — | ✓ |
| Ver NIF/IBAN/teléfono del inquilino | — | ✓ |
| Autorizar a un tercero | — (nadie reautoriza a un cuarto) | — (solo el titular/Dueño) |

## 5. Flujos

1. **Alta de inmueble**: CP → municipio → calle (callejero Catastro) → número → el Catastro devuelve la(s)
   referencia(s); el cliente elige la suya; se precargan m², año y uso (`precalificarHogar`). Con m² se calcula el
   valor de reconstrucción ESTIMADO (`capitalContinenteSugerido`), con la etiqueta «estimación».
2. **Gasto fijo**: plantilla → `generarOcurrencias` + `pendientesDeMaterializar` (cron diario del portal, idempotente
   por clave) → gastos `propuesto` con importe fijo; el cliente los confirma en bloque. Importe `null` → espera
   la factura.
3. **Gasto variable**: subir factura (10 MB, PDF/imagen) → extractor (patrón de `agente-facturas/extraer.ts` +
   `core-ai`) → `proponerImputacion` → pantalla con motivos y confianza → `confirmarImputacion` (valida contra lo
   gestionado). Factura a nombre de otro NIF → se avisa, no se imputa sola. `fuente:'none'` = «no hemos podido
   leerla», nunca un gasto de 0 €.
4. **Comunidad**: cuota = plantilla `COMUNIDAD`; derrama → `cuotasDerrama` (suma exacta).
5. **Contrato**: alta con renta, fechas, cláusula, fianza, seguro exigido; adjuntar el PDF (documental). Actualización:
   `calcularActualizacionRenta` con el índice que trae el adaptador (tabla de índices mantenida a mano en `apps/asegura`
   con fuente y fecha, como el catálogo de teléfonos) y el **tope legal como parámetro**; propone, el propietario
   la aplica y la notifica.
6. **Calendario**: `calendarioPatrimonio` → «Pendiente de ti» y campana (fuente nueva `patrimonio`, con su `sinComprobar`).
   Push con el circuito existente. Sin fecha → «dinos cuándo fue la última».
7. **Rentabilidad**: `rentabilidadPorInmueble` por año/trimestre/mes; los avisos se traducen a frases
   (`sin_seguro_conocido` → «No nos consta seguro de este inmueble» + botón «Pedir precio»).
8. **Infraseguro**: capital de continente de la póliza enlazada vs valor estimado; `< 80 %` → aviso con la regla
   proporcional (art. 30 LCS) en lenguaje llano. En propiedad horizontal el continente suele estar en la póliza de la
   comunidad: si el inmueble es de comunidad y no hay póliza de comunidad enlazada, «no lo sabemos», no infraseguro.
9. **Inquilino por enlace**: el propietario pulsa «Invitar al inquilino» → apps/asegura manda el correo (borrador
   hasta OK en piloto) con enlace; el enlace dice QUÉ contrato, el código al correo dice QUIÉN (patrón de
   invitaciones). El inquilino ve: datos mínimos del contrato (inmueble por alias/dirección, fechas), sube el recibo
   de su seguro y comunica averías. No ve rentas de otros, ni gastos, ni rentabilidad.

## 6. Riesgos y cómo se cierran

- **RGPD — encargo de tratamiento**: los datos de los inquilinos son del PROPIETARIO (responsable); Grupo ASegura
  los trata por su cuenta (**encargado**, art. 28 RGPD). Hace falta un **contrato de encargo** aceptado en el alta
  del módulo (sellado en `portal_consentimiento`, tipo nuevo `encargo_patrimonio`, versión de texto), una cláusula
  de información que el propietario da al inquilino, y supresión/portabilidad por inmueble. Nueva actividad en el
  RAT. Los textos legales suben `VERSION_TEXTOS_LEGALES`.
- **El inquilino NO es un lead**: sus datos se tratan por encargo del propietario y **no pueden usarse para captación**
  de Grupo ASegura sin su consentimiento propio y separado (casilla no premarcada en su página, art. 21 LSSI).
  Guardián: ninguna consulta de leads/CRM lee `portal_patrimonio_inquilino` (tabla con `REVOKE` a `crm_seguros`).
- **Firma SIMPLE sin TSA**: `core-firma` da firma electrónica simple (evidencias: hash, IP, fecha, código OTP). Sirve
  para acuses y anexos; **no** sustituye a una firma avanzada/cualificada. La pantalla no la llama «firma del
  contrato» con valor reforzado. Sin sellado de tiempo cualificado (TSA): se dice.
- **Límites legales a la actualización de renta**: cambian por ley (topes 2022-2024, IRAV desde 2025, zonas
  tensionadas). Por eso el índice y el tope son PARÁMETROS y la propuesta lleva `periodo`, `indice` y `topado`.
  Sin cláusula no se actualiza. Texto: «Esto es un cálculo: confirma con tu asesor si hay límites en tu zona».
- **Prórroga LAU**: el fin pactado no es el fin real (art. 9/10). El contrato pasado su `fin` sigue vigente y el
  calendario avisa con 150 días (preaviso de 4 meses + margen).
- **Fianza por CCAA**: plazo de depósito parametrizable (`plazoDepositoFianzaDias`, def. 30); organismo en texto.
- **Coste de IA**: cada factura es una llamada; tope por identidad y día (como `/api/polizas`). Gratis al principio
  → medir el gasto por piloto antes de abrirlo.
- **Aislamiento**: sin RLS; cepo propio + 404. Las comunidades compartidas no revelan a los demás vecinos.
- **Comunicaciones salientes**: nada sale al inquilino ni a la comunidad sin que el propietario lo pulse, y en el
  piloto, además, con OK de Alberto por envío (regla de la casa).

## 7. PII
- El portal no tiene `PII_ENCRYPTION_KEY`: el NIF/email/teléfono del inquilino se cifran y se leen por el PUENTE
  de `apps/asegura` (como «Mis datos»), y la búsqueda por email usa índice ciego (`computeEmailLookupHash`).
- El NIF del titular se compara por índice ciego/enmascarado; el portal nunca pinta un DNI de persona salvo nivel Total.

## 8. Qué se mide (para decidir Fase 2)
Inmuebles dados de alta por piloto, facturas subidas/confirmadas, % de propuestas aceptadas sin corregir, avisos
`sin_seguro_conocido` e infraseguro convertidos en presupuesto.

## 9. Preguntas abiertas a Alberto (con el default asumido)

| # | Pregunta | Default que asumo |
|---|---|---|
| 1 | ¿Gratis solo para quien tiene póliza con nosotros? | **Sí**: el titular tiene que ser ficha con póliza EN VIGOR (`esCarteraEnVigor`). Un titular sin póliza puede verlo en modo «prueba» limitado (1 inmueble). |
| 2 | ¿El inquilino tiene cuenta? | **No**: enlace + código de un solo uso. |
| 3 | ¿Remitente de los avisos al inquilino? | **En nombre del propietario «vía Grupo ASegura»** (From técnico del portal, `Reply-To` del propietario si lo da). |
| 4 | ¿Quién gestiona? | **El titular, o un tercero autorizado con nivel Gestión o Total** (`patrimonio_gestion`/`patrimonio_total`). |
| 5 | Volumen de los pilotos (inmuebles, contratos, facturas/mes) | **Desconocido**: el diseño pagina a 50 + «Ver más» y no asume < 100 inmuebles. Pedir el Excel de Grupo Elca para dimensionar e importar. |
| 6 | ¿Importamos el Excel de Grupo Elca? | Sí, como paso propio del plan, con revisión del cliente (filas `propuesto`). |
| 7 | ¿Quién mantiene la tabla de índices IPC/IRAV? | Alberto/agente, a mano con fuente y fecha (como el catálogo de teléfonos). |
