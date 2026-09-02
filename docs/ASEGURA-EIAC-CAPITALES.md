# EIAC: dónde viene el capital asegurado (y qué estamos tirando)

> Ficha de trabajo sobre el estándar **EIAC V07.1** (TIREA, *Documentos Estándar*,
> código `209_IAC_ESP_DOC`, versión 05, 03/06/2026). Alberto pasó el PDF el
> 02/09/2026. **El documento está clasificado como interno por TIREA y su
> redistribución está restringida, así que aquí NO se copia: se citan los
> apartados y se describe con nuestras palabras lo que necesitamos.** El PDF
> original no está en el repo — pídeselo a Alberto si hace falta el detalle.

## Lo que resuelve

Antes de leerlo estábamos deduciendo el capital de hogar por el **nombre de la
garantía**, porque ninguna póliza de la cartera traía una fila que dijera «esto
es el continente». El estándar demuestra que esa deducción sobra: **EIAC manda el
capital ya etiquetado.**

### §13.99 `tipo_capital`

Cada póliza lleva una lista `Capital` (`n_tipo_capital`, cardinalidad
`1..unbounded`) y **cada entrada tiene cuatro campos**:

| campo | tipo | card. | qué es |
|---|---|---|---|
| `Bien` | `claves_bien` | **1..1** | **de qué es el capital** |
| `ModalidadValoracion` | `claves_modalidadvaloracion` | 1..1 | cómo se valora el bien |
| `Importe` | `_t_num2dec` | 1..1 | el importe contratado |
| `Descripcion` | `xs:string` | 0..1 | obligatoria **solo** si `Bien` = `OTROS` |

### §13.3.72 `claves_bien`

`CONTINENTE` · `CONTENIDO` · `CA` (capital de alquiler, por impago) ·
`RC` · `RCC` (RC contaminación) · `MERCADERIAS` ·
`OVJ` (objetos de valor y joyas — **explícitamente NO incluidos en continente**) ·
`OTROS`.

## 🚨 Lo que estamos tirando

Contrastado contra `seguros.poliza_coberturas` el 02/09/2026:

| campo EIAC | columna nuestra | ¿se guarda? |
|---|---|---|
| `ModalidadValoracion` | `modalidad_valoracion` | ✅ (llega `VP` en las 19 de hogar) |
| `Importe` | `capital_asegurado` | ✅ |
| `Descripcion` | `descripcion_capital` | ✅ (vacía, y es coherente: solo es obligatoria si `Bien`=`OTROS`) |
| **`Bien`** | — | ❌ **no existe la columna** |

No hay tabla `bienes` en el schema `seguros` (las referencias `bien_id` de
`bien_documentos` y `portal_poliza_declarada` no apuntan a una tabla de este
schema). O sea: **la ingesta guarda tres de los cuatro campos y descarta justo el
que dice de qué es el capital.** Los importes son buenos; lo que se pierde es la
etiqueta.

Esto encaja con lo que ya sabíamos del pipeline: 43 de 128 ficheros entraron con
`0/N` objetos persistidos entre junio y agosto. **Que un dato no esté en la BD no
prueba que CIMA no lo mande** — y aquí el estándar demuestra que lo manda.

## Qué hacer

1. **El arreglo de verdad:** una columna para `Bien` en `poliza_coberturas` (o una
   tabla `poliza_capitales` que respete la forma de `tipo_capital`, que es una
   lista propia de la póliza y no una propiedad de cada garantía), y que la
   ingesta la escriba. Toca el adaptador de Manuel o el port aparcado de
   `cima-pull` (ver `docs/ASEGURA-CIMA-INGESTA-INVENTARIO.md`). **No está hecho.**
2. **La muleta que sí está hecha:** `packages/module-seguros/src/garantias.ts`
   reconstruye continente y contenido por **corroboración** — el importe que
   repiten ≥3 garantías del mismo lado es la suma asegurada; el que lleva una sola
   es un sublímite. Recupera 5 de las 19 pólizas de hogar con los datos de hoy, y
   **se borra el día que llegue `Bien`**: leer la etiqueta siempre será mejor que
   deducirla.

## Otros sitios del estándar que nos tocan

- `claves_modalidadvaloracion` — hoy llega `VP` en todas las de hogar; no se ha
  mapeado a nada nuestro todavía.
- Los códigos de causa de siniestro de auto (§ de `claves` de siniestros, serie
  `13xx`: *Colisión - Vehículos - Dos*, *Daños Propios - Robo*, *Colisión - Daños
  por colisión vehículo con continente*…). Sin usar por ahora, pero es donde
  habrá que mirar cuando se pinten los siniestros por causa.
