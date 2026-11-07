# docs/cima — documentación del estándar EIAC V07.1 (CIMA / TIREA) para consulta con Grep

Objetivo: que la ingesta CIMA y cualquier riesgo/póliza nuevo de nuestro sistema usen **exactamente los mismos campos y claves que CIMA**, sin depender de Drive. Es documentación de estándar (sin datos de clientes).
Cargada de Google Drive el 07/11/2026. **Fuente de verdad de campos y claves = estos ficheros** (si Drive y esto difieren, gana lo más reciente de TIREA: actualizar aquí).

## Documentos en Drive (nombre exacto, versión, fecha)

| Documento (nombre en Drive) | Versión / fecha | Uso aquí |
|---|---|---|
| `209_IAC_ESP_DOC_DOCS-ESTANDAR-EIAC-V07-1_V05 (1).pdf` (id `1AiqQMmF2fkOHf71iRAf-RHnIF3R6QYEo`) | «Documentos Estándar V07.1», código 209_IAC_ESP_DOC, **documento versión 05, 03/06/2026**, 93 págs. (TIREA) | Principal. Se lee íntegro (93/93 págs.) descargando el PDF real y extrayendo texto con `pdftotext -layout`. |
| `TiposEIAC-V07-1_V06.xsd` (carpeta Drive `CIMA`, id `1UM_NB3G2XzS_ZrDresh813V_IsmyiNKe`) | Cabecera: `TIREA V07-1_V06 2026-09-04T09:07`. Namespace `http://www.tirea.es/EIAC/ProcesosEIAC` | Esquema oficial: nombres, tipos, longitudes y ocurrencias exactos de `eiac-estructura.md`. |
| `ProcesosEIAC-V07-1_V06.xsd` (id `17DUMju-B5tl-l-_TQzGER7KAqiuWu1Al`) | V07-1_V06 (2 KB) | Elemento raíz (cabecera + objetos). No transcrito (descrito en §6 del PDF: `tipo_cabecera`, `tipo_objeto`). |
| `209_IAC_ESP_DOC_NORMAS-USO-V07-1_V03-1.pdf` (id `1PgBcopy33s2bpYzTt1_L9MHxYYm1PiQV`) | «Normas de uso EIAC V07.1», **versión 03, 05/08/2025**, 40 págs. | Reglas de uso, obligatoriedad condicionada, ramo-riesgo -> `eiac-normas-uso.md`. |
| `2026-11-05_CCORREDOR@mapfre.com_EIAC_V07.1_CIMA.pdf` (id `1Yq23XGKrW0UoT8vMqKSkw6wJfKSTQQt2`) | Presentación CIMA «Nueva versión del estándar EIAC V07.1», noviembre 2026, 11 págs. (solo imágenes) | Solo calendario (ver abajo); no es especificación. |
| `EIAC_Ejemplo_*_V07-1_V06.xml` (9: `mensaje`, `polizas`, `pol-colectiva`, `recibos`, `siniestro-dec`, `siniestro-mov-pagos`, `liquidaciones`, `ctaefectivo`) | V07-1_V06 | **No copiados** (ejemplos de ficheros; se pueden releer en Drive, carpeta `CIMA`). |
| `209_IAC_ESP_DOC_DICC-DATOS-V07-1_V01.pdf` (id `1Y1g4lAaqjdIHeb7gMCweoXBixyp9PGag`) | Diccionario de datos V01 | **HUECO**: en Drive es un fichero de texto de 90 bytes que solo contiene la URL `https://www.cimaseg.es/wp-content/uploads/2026/09/209_IAC_ESP_DOC_DICC-DATOS-V07-1_V01.pdf`; el proxy del entorno bloquea cimaseg.es (403). Pendiente: subir el PDF real a Drive. |
| `26-06-26a24-09-26.zip`, `28-03-26a26-06-26.zip` (carpeta `CIMA`) | — | **No usados ni copiados**: contienen ficheros reales de tráfico CIMA de la correduría (datos de clientes), no documentación. |
| `Arquitectura ERP CRM Correduria Seguros - CIMA y Conciliacion Financiera` (Doc), `tirea` / `tirea.docx` | 22/09/2026 | Notas internas, no son del estándar. No transcritos. |

Versión usada: **EIAC V07.1** (`claves_version` = `7.1`). No hay versiones posteriores en Drive; la V05 del PDF (03/06/2026) añade al histórico «claves forma pago: MC – Mediador por cuenta bancaria». El XSD es la revisión V06 (04/09/2026): los códigos de las 90 tablas `claves_*` coinciden **exactamente** con los del PDF (verificado por script; único matiz: en `claves_tipologiasiniestro` los grupos 10-21 son filas de cabecera en el PDF y códigos válidos en el XSD).

Calendario CIMA (presentación 11/2026): implantación V07.1 **desde el 16/11/2026** (primera fase de la V07: mensajes y cuenta de efectivo, de forma progresiva); **2027** convivencia V06 + V07.1 (CIMA convierte según proceso); resto de la V07 con fechas por confirmar.

## Ficheros de docs/cima/

| Fichero | Contenido | Tamaño aprox. |
|---|---|---|
| `eiac-estructura.md` | 189 tipos complejos / 815 campos: `Tipo.Elemento`, tipo de dato, formato/longitud, min/max (obligatoriedad del esquema), grupo (sequence/choice), tabla de claves con su §, descripción. Más índice por objeto (Póliza, Recibo, Siniestro, Liquidación, Cuenta de efectivo, Mensaje, riesgos) y tipos simples (`_char_N`, `_t_*`). Incluye Tomador/Asegurado (`tipo_persona`), `tipo_conductor`, `tipo_riesgoautos`, `tipo_riesgohogar`, recibos, siniestros, coberturas (`tipo_cobertura`), capitales (`tipo_capital`)... | 150 KB |
| `eiac-claves.md` | Claves comunes (procesos, ramo, anulación, cargo, comisión, forma de pago, fracción, situación, persona, colectivas, liquidación, etc.). Cada tabla con su §. | 19 KB |
| `eiac-claves-auto.md` | `claves_categoriavehiculo`, `claves_clasevehiculo`, `claves_combustible`, `claves_conductor`, `claves_permiso`. | 7 KB |
| `eiac-claves-hogar.md` | `claves_claseinmueble`, `claves_usoinmueble`, `claves_zona`, `claves_comunidad`, `claves_obra`, `claves_bien`. | 2 KB |
| `eiac-claves-siniestros.md` | Tipología de siniestro (182 filas), acciones, situaciones, convenios, expedientes, figuras, autoridades, mensajes (ámbito/título/documento/clase), devolución. | 14 KB |
| `eiac-tablas.md` | §7.2 lista de procesos (código -> objeto/origen/destino/clase/transacción), §10.1 formatos, §10.3 ramo, provincia, país (ISO alpha-3), RGV-Servicio (uso de vehículo), §11 control de cambios V07.1 sobre V06. | 37 KB |
| `eiac-normas-uso.md` | Normas de uso V03 (texto del PDF): obligatoriedad condicionada, ramo-riesgo, recibos, suplementos, colectivas, liquidación. | 95 KB |

**Nº de tablas de claves transcritas: 90** (todas las `claves_*` del §10.2, de `claves_codigoproceso` a `claves_clasemensaje`), repartidas: comunes 61, auto 5, hogar 6, siniestros 18.

## Cómo buscar

```bash
grep -n 'claves_claseinmueble' docs/cima/*.md            # tabla de claves + qué campos la usan
grep -n '^## claves_formapago' -A 12 docs/cima/eiac-claves.md
grep -n '^| tipo_riesgohogar\.' docs/cima/eiac-estructura.md   # campos de un tipo
grep -n '^| tipo_[a-z]*\.Matricula ' docs/cima/eiac-estructura.md
grep -n '^### tipo_vehiculo' -A 30 docs/cima/eiac-estructura.md
grep -n 'IdPolizaUnico\|ModalidadRamo' docs/cima/*.md
grep -n 'Obligatoriedad condicionada' -A 40 docs/cima/eiac-normas-uso.md
```

## Convenciones y avisos de fidelidad

- Nombres, tipos y longitudes: tal cual en el XSD oficial; 813 de los 815 campos se localizan por nombre idéntico en el PDF (los 2 restantes difieren solo en un acento del PDF: `DatosLiquidación`, `DescripciónFranquicia`; manda el XSD).
- **§ citados = los del PDF**: su numeración interna (`13.x`, `13.3.x`) no coincide con el índice del propio PDF (que usa 8, 9, 10.2…). Se cita como figura en la columna «Clave»/«Elemento» del PDF. Huecos de numeración del PDF (p. ej. `13.3.27`, `13.3.38`) son del original.
- Obligatoriedad: en `eiac-estructura.md` = `minOccurs` del esquema. Las obligatoriedades *condicionadas* (p. ej. `ModalidadRamo` obligatoria si póliza no colectiva y ramo Autos/Hogar/Comunidades/Asistencia sanitaria) están en la Descripción y en `eiac-normas-uso.md`.
- `claves_*`: lista cerrada; el valor `NI` = «Ninguno de los anteriores» (Normas de uso §6.4.5).
- Tablas con descripciones que en el PDF envuelven varias líneas (`claves_cargo`, `claves_permiso`, `claves_importeliquidacion`, `claves_modalidadvaloracion`, `claves_causarelacion`, tipologías colectivas, `claves_distribucionpago`) se transcribieron en orden de lectura del PDF.
- `eiac-tablas.md` y `eiac-normas-uso.md` son texto del PDF en columnas (pdftotext -layout): tras un salto de página las columnas pueden quedar con otra sangría, el contenido es el original.
- Sin PII: no se copió ningún ejemplo con datos personales (los XML de ejemplo y los zips con tráfico real no se trajeron).

## Huecos / páginas no legibles

- Ninguna página del PDF principal (93/93) ni de Normas de uso (40/40) quedó sin leer. Los esquemas gráficos del PDF (conectividad CIMA §4.4, flujo del siniestro en Normas de uso §6.1.4) son imágenes y no se transcriben.
- La herramienta de lectura de Drive truncaba el PDF en la pág. 80 de 93; se resolvió descargando el binario y extrayendo texto localmente.
- **Diccionario de datos V07.1 (V01): no disponible** (ver tabla). Cuando esté en Drive, añadirlo como `docs/cima/eiac-diccionario-datos.md`.
- Presentación CIMA de 11/2026: solo imágenes; se transcribió únicamente el calendario.
