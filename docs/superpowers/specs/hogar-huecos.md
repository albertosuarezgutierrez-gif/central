# Hogar: huecos entre el riesgo y el cotizador (10/10/2026)

> Fase HOGAR de `2026-10-10-riesgo-unificado-todos-los-ramos-design.md`. Comparado contra el código: `DatosHogar` +
> `DatosPersona` (`apps/asegura/lib/codeoscopic/peticion-hogar.ts`, `persona.ts`), la ficha `resumen-hogar.ts` y
> `ESPEC_VIVIENDA` (`packages/module-seguros/src/datos-vivienda-riesgo.ts`). BD leída el 10/10: 692 oportunidades de
> hogar, **0** con `info_riesgo.datosVivienda` guardado (todo lo que se ve es precarga de póliza o vacío), y el SQL de
> figuras multi **sin aplicar** (el check de `oportunidad_figura.rol` no tiene `asegurado`).

## 1. Lo que pide el cotizador de hogar y el riesgo aún NO tiene

| Campo del cotizador | Dónde vive hoy | Nota |
|---|---|---|
| `fechaEfecto` | Condición de la cotización (embebido: se toca en «Pedir precio») | Correcto que no esté en el riesgo. |
| `dni`, `nombre`, apellidos, `fechaNacimiento`, `sexo`, `estadoCivil`, `telefono`, `email`, domicilio del tomador | Ficha del tomador («Intervinientes» → Editar datos) | No es del riesgo. `estadoCivil` que falte se teclea en el embebido (como moto/auto). |
| `referenciaExterna` | No se pide en ninguna pantalla | Opcional del vendor. |
| Catálogos «supuestos» (`tipoVivienda`, `uso`, `ocupacion`, `ubicacion`, `material`, `calidad`, `alarma`, `puertasSecundarias`, `asentamiento`, tipo de vía) | Caben en `datosVivienda`, pero hoy casi siempre vacíos | Si faltan, asegura pone el defecto de la pantalla y lo marca SUPUESTO; el precio sale como `estimado`. Se rellenan en «Datos de la vivienda». |
| `propietarioEsTomador` | `datosVivienda.propietarioEsTomador` | Sin dato asegura SUPONE «sí». Desde esta fase, si «Intervinientes» tiene un propietario que no es el tomador se manda `false` (`propietarioEsTomadorDeRiesgo`) y una contradicción bloquea el pago. |

La vivienda (dirección troceada, m², año, reforma, habitaciones, protecciones, capitales, joyas, objetos, perros) está
**completa** en `datosVivienda`: no hace falta columna nueva ni SQL.

## 2. Lo que el riesgo tiene y el cotizador de hogar NO lleva

| Dato del riesgo | Por qué no viaja | Consecuencia |
|---|---|---|
| **Propietario distinto del tomador** (figura `propietario`, nueva en hogar) | `risk.owner` solo se manda como «el mismo que el holder» | El precio se da sin ese dueño; el embebido lo AVISA («no viaja; se recoge al emitir»). Para emitir con un dueño distinto hará falta el esquema `owner` del vendor (pendiente). |
| **Asegurado distinto del tomador** (figura `asegurado`, fase 2) | La petición de hogar no tiene `insured` | Igual: aviso, no bloqueo. Escribirlo depende de aplicar `2026-10-10_figuras_multi.sql` (hoy la pantalla dice «pendiente de migración»). |
| Acreedor hipotecario | No existe en ninguno de los dos | Lo pide el diseño (texto/entidad, no ficha). Sin campo aún; se recoge al emitir. |
| Historial: seguro anterior, años asegurado / en la compañía, siniestros | `DatosHogar` no tiene campos de historial | Se ve en el bloque «Historial», pero el precio de hogar no lo usa. Siniestros de la póliza enlazada en el historial: pendiente (diseño, fase 3). |
| `direccion` (texto libre), `municipio`, `provincia` (nombres) | El vendor usa calle troceada + `town.id` | Solo sirven para buscar en el Catastro y para leer. |
| `confirmadoAt` | Sello interno | No cambia el precio (la huella del cotizador lo ignora). |

## 3. Riesgos que quedan abiertos

- Primera cotización de hogar EMBEBIDA real: con OK de Alberto (0,50€); hasta entonces solo se ha probado con tests.
- Si el vendor exigiera `owner` cuando el tomador es inquilino, responderá 400 (gratis) y la ficha lo traduce.
