# Ficha de cliente de la correduría — diseño (01/09/2026)

> **Maqueta visual:** https://claude.ai/code/artifact/22b57a16-739c-4e45-bd9d-9e494275aeda
> («Ficha en tres segundos», 8 secciones, con las tres densidades de pantalla).
> Encargo de Alberto: *«un cliente me llama o escribe… en una visual tengo que ver quién es, si
> tiene relación con otros clientes y qué seguro tiene con nosotros, y presupuestos o pólizas»*.
> Ampliado después: *«esquemático, y accesos directos a la información más amplia»*, *«responsive»*
> y *«hay que subir documentos del cliente, de la póliza y del siniestro»*.

Este documento es el **diseño**, no la implementación. La cartera sigue en el Supabase de Manuel
(`uijsgeocgdaxkhvwtjqs`); todo lo medido aquí sale de ahí el 01/09/2026, restringido a la
**cartera VIVA** = `polizas.import_ref IS NULL` → **109 pólizas / 80 clientes**. Las otras 28.729
pólizas son volcado histórico y no cuentan (ver `apps/asegura/CLAUDE.md`).

---

## 1. El problema de la ficha actual

Abre por **Cabecera**: Comercial, Fuente, Clave de acceso, NIF, «Responde a», Saludo. Es el
formulario de alta. Todo lo que hace falta en una llamada —pólizas, relaciones, lo ofrecido— está
detrás de un clic y repartido en **siete pestañas más** (Contactos · Documentos · Oportunidades ·
Pólizas · Siniestros · Gestiones · Vencimientos).

El momento que la ficha tiene que servir es **el teléfono sonando**: antes de decir «dígame» hay
que saber *quién es, qué tiene contigo y si te debe algo*.

## 2. Orden de la ficha (sin pestañas)

| Zona | Contenido | Por qué ahí |
|---|---|---|
| **0 · pegajosa** | Nombre (con `Dña.` como prefijo tipográfico, no como campo), chip cliente/lead, una línea de estado, **banda roja de deuda**, y 4 acciones de 44 px: Llamar · WhatsApp · Email · copiar NIF | Es lo único que se lee antes de saludar. La deuda va aquí y no en una pestaña: evita prometer un servicio a quien tiene un impago abierto |
| **1 · Tiene contratado** | Una tarjeta por póliza, **titulada por el objeto asegurado** (`Renault Clio · 4521 JKL`), no por el número. Debajo, filas esquemáticas: Recibos · Qué cubre · Siniestros · Comisión · Documentos | Cuando el mismo tomador tiene tres coches, el número de póliza no identifica nada |
| **2 · Su gente** | Chips de personas con punto de color (cliente / lead / fuera de cartera) y un 👁 azul separado para `puede_ver_polizas` | El ojo es un **permiso**, no un parentesco. Se distingue a propósito |
| **2 · Le he ofrecido** | Estado dicho como verbo («Pendiente de su respuesta», «La rechazó»), nunca «oportunidad» ni «cotización» | Jerga fuera |
| **3 · Hueco de cartera** | Lo que le falta a él **y a su red** («su hijo tiene 2 pólizas fuera») | Es la venta más fácil que existe |
| **3 · Última vez que hablamos** | Timeline de gestiones | |
| **3 · Ficha completa al N%** | Barra + qué falta, como tarea | |
| **Fondo, plegado** | Comercial, Fuente, Clave de acceso | Es mantenimiento, no información |

### Reglas de pintado que NO son negociables

- **Trama gris diagonal = «no se sabe»** (clase `.tramado`). Reservada a lo que la compañía no ha
  mandado. **26 pólizas de auto vivas no traen prima** (`prima_anual` al 76,1%): pintar «0,00€» o
  sumarlas como cero convierte un «no lo sé» en una cifra falsa. Regla global de `CLAUDE.md`.
- **Cualquier total lleva detrás sobre cuántas se calcula.** La prima conocida es de 83 de 109.
- **`otro` y demás valores de cajón se tratan como ausencia**, no como dato.

## 3. La ficha es un índice, no un expediente

Tres profundidades y ninguna más:

- **Nivel 0 · la ficha** — cada bloque, ≤3 líneas y un contador **con estado**. Ligera, se carga
  entera, funciona con mala cobertura. Ningún bloque se abre solo salvo el que tiene alerta.
- **Nivel 1 · la lista** — todo lo de ese bloque, con su filtro. Se abre **encima**, no reemplaza
  la ficha. Carga bajo demanda.
- **Nivel 2 · el dato** — un recibo, una póliza, con sus acciones.

Dos reglas de navegación:

1. **El contador ya es la respuesta.** «Recibos 6 · 1 ⚠» en rojo. No se entra si el contador está
   en calma. Un contador sin estado obliga a abrir para descubrir que no pasaba nada.
2. **Nunca se vuelve atrás para ir de lado.** Del detalle de una póliza se salta a sus recibos, su
   siniestro y su coche sin regresar a la ficha. La Zona 0 sigue pegada en **todas** las
   subpantallas.

### Cada dato es un botón

| Dato | A dónde lleva |
|---|---|
| Matrícula | Todas las pólizas de ese coche (4.506 filas de matrícula en claro) |
| NIF | Copia al portapapeles **y** busca duplicados (603 posibles en la base) |
| Compañía | Tu cartera con ella, su comisión y **si su ingesta va atascada** |
| Ramo | Quién más lo tiene y quién no — el hueco visto del otro lado |
| Persona de «Su gente» | Su ficha, o la pantalla de convertirla en cliente |
| Banda roja | El recibo devuelto, con reclamar y la plantilla de WhatsApp |
| Contador de siniestros | El parte **y el enlace a la intranet de la compañía** (el tramitador no viaja por CIMA) |
| Barra de ficha completa | La lista de lo que falta, como tareas |

## 4. Tres tamaños, tres comportamientos

- **Móvil (320–520 px):** una columna, lo secundario plegado, chips de familia en scroll
  horizontal, zonas pulsables de 44 px. Se usa con una mano y el móvil en la oreja.
- **Tablet (520–1000 px):** dos columnas. Mismo orden de prioridad; lo plegado ya cabe abierto.
  Nada cambia de sitio, solo deja de estar escondido.
- **Escritorio (1000 px +):** **maestro-detalle** — ficha fija a la izquierda, el nivel 1 abre a la
  derecha. Ahí no hay «atrás» porque nunca se sale de la ficha.
- **Cuarta vista, que no es pantalla:** modo **una hoja** para imprimir o mandarle al cliente su
  resumen. Es la que más se pide y la que nunca se diseña.

## 5. Qué hay detrás de cada puerta (medido)

### Puertas con contenido real — se ponen ya

| Puerta | Medida |
|---|---|
| **Recibos** | 182 en **89 de las 109** pólizas (20 sin ninguno; media 2,04; máx 10). `situacion`: cobrado 103 · anulado 54 · pendiente 24 · devuelto 1 → **21 pólizas con algún pendiente**. Prima, comisión bruta y vencimiento al 100% |
| **Qué cubre** | `poliza_coberturas` 1.418 filas, **las 109 pólizas tienen las suyas** (media 13, máx 59). `descripcion` 100%, `capital_asegurado` 73,2%, **`franquicia` 0%**. La puerta más rica y hoy invisible |
| **Historial de la póliza** | No hay tabla de suplementos, pero **62 de los 182 recibos son clase `SU`**: cada suplemento dejó su recibo. El historial se pinta con ellos |
| **Siniestros** | 67, **todos de cartera viva** (30 clientes, 37 pólizas): 60 cerrados, 7 abiertos. `tipo`/`fecha_hora`/`referencia` 100%, `comentario` 95,5% |
| **Comisión de la póliza** | Sale del recibo, que lleva `poliza_id`: **`comision_bruta` al 100%**. `comision_liquida` solo 15,9% |
| **Intervinientes** | 95 en 81 pólizas. **Van dentro de la póliza**, no en «Su gente» |

### Puertas que hoy se abren a nada — dicen «pendiente», nunca «no hay»

| Puerta | Medida |
|---|---|
| **Documentos** | **Cero en todo el sistema** (ver §6) |
| **Notas internas** | `historial_interno` vacía y `clientes.notas` a 0 en los 80. **No hay dónde apuntar lo que te cuentan por teléfono** |
| **WhatsApp / mensajería** | 0 conversaciones y 0 mensajes de cartera viva; tablas de envío vacías; `wa_opt_in` false en los 80. El botón abre WhatsApp y **no promete un historial que no existe** |
| **Gestiones** | Las 694 son casi todas de leads históricos: **de cartera viva hay 23, en 22 clientes** (22 llamadas, 1 tarea). Ninguna ligada a siniestro, ninguna con `fecha_aviso` |
| **Lo que le ofreciste** | 24 cotizaciones (17 de clientes vivos), estados solo `pendiente` 22 / `rechazada` 2. **`mejor_oferta`, la prima y la compañía están al 0%**: se puede decir qué le pediste y cuándo, no por cuánto. Prometer una comparativa sería inventarla |
| **Dirección del hogar** | De 19 pólizas de hogar **solo 2** llevan la dirección del riesgo. Las 11 viviendas de `bienes_asegurables` cuelgan del cliente y **no tienen `poliza_id`**: no se pueden casar sin adivinar |

### Contacto: no hace falta un «ver todos»

`cliente_direcciones` **no existe** (la dirección vive en columnas de `clientes`, 62/80).
`cliente_telefonos` 16 filas/16 clientes y `cliente_emails` 15/15 → **0 clientes con más de uno**.
⚠️ Las columnas planas van muy por encima: `clientes.telefono` **55/80** y `clientes.email`
**40/80**. El contacto real está en la columna, no en la tabla multivalor.

## 6. Documentos — hay que poder subirlos en tres sitios y solo uno tiene tabla

| Nivel | Estado |
|---|---|
| **Del cliente** (DNI, carnet, justificante de IBAN) | 🔴 **`cliente_documentos` NO EXISTE.** Y `poliza_documentos.poliza_id` es `NOT NULL`, así que un DNI habría que colgarlo de una póliza cualquiera; a un **lead sin póliza** no se le puede adjuntar nada |
| **De la póliza** | ✅ `poliza_documentos` — `blob_pathname`, MIME, tamaño, `uploaded_by_usuario_id` y **`visible_por_cliente`** (el interruptor del portal, ya previsto). **0 filas** |
| **Del siniestro** (parte amistoso, fotos, factura del taller, peritaje) | 🔴 **`siniestro_documentos` NO EXISTE.** Y es donde más papel se mueve: 7 siniestros abiertos y, sin tramitador ni reserva en la base, **las fotos serían lo único que tendrías** |
| **Del objeto** | ✅ `bien_documentos`, la mejor pensada: tipo cerrado `ficha_tecnica` · `permiso_circulacion` · `titulo_propiedad` · `planos` · `foto` · `seguro_anterior` · `factura_compra` · `otro`. Correcto: **el permiso de circulación es del coche, no de la póliza** — si cambia de compañía, sigue valiendo. 🚨 Pero `bienes_asegurables` **no tiene `poliza_id`**: esos papeles no se ven desde la póliza de ese coche |

Cero filas en las cuatro. `polizas.documento_url` al 0%. **`storage.objects` = 0 ficheros.**
Lo único parecido son los 128 XML de `cima_ficheros` (24 apuntan a póliza viva): sirven como «ver
el origen», no como documentación del cliente.

### Cómo debe comportarse la subida

- **El móvil es el escáner**: cámara con recorte, no selector de ficheros. Lo que entra llega por
  WhatsApp en foto; si subirlo cuesta más que reenviarlo, se queda en el móvil.
- **Un botón, tres destinos**: hereda el sitio donde estás. Nunca preguntar «¿dónde lo guardo?».
- **Pedido ≠ no recibido**: falta el estado «le pedí el permiso el 14/08 y no ha llegado». Sin él,
  «0 documentos» no distingue no habérselo pedido de que no lo mande. Es la regla de la casa
  aplicada al archivo.
- **Lo que caduca, avisa**: DNI e ITV sí, permiso de circulación no. Un documento con caducidad es
  un aviso futuro, no un archivo muerto.
- **Checklist por ramo**: auto pide permiso + ficha técnica + carnet; hogar, escritura o contrato;
  RC, el alta de actividad. La ficha ya sabe qué tiene contratado.
- **`visible_por_cliente` se decide al subir**, con el interruptor a la vista. Un peritaje interno
  y su póliza no se enseñan igual.
- **Son PII de verdad**: blob privado con URL firmada y caducada, quién lo subió, política de
  borrado. Y `otro` es un valor de cajón: si todo acaba ahí, esto es una carpeta de descargas.

## 7. Trece ideas que la ficha puede dar con lo que ya hay

1. **Buscar por matrícula** — 4.506 en claro. «Me han dado un golpe con el 4521 JKL» → ficha, sin saber el nombre.
2. **Modo llamada entrante** — busca también entre los 4.744 leads con teléfono.
3. **Oposición a prórroga, no «vence»** — el contador cuenta los días **para actuar**, no los que faltan para perderla.
4. **Huecos de cartera** — **72 de 80 clientes tienen un solo ramo** y **57 tienen el coche pero no el hogar**: a la prima media de hogar de la cartera, ~17.000€ ya dentro de la agenda.
5. **El hueco por la red** — «su hijo tiene 2 pólizas fuera».
6. **Nota de voz al colgar** — dos toques y queda como gestión con fecha de aviso.
7. **Últimos cinco vistos** — cuando llaman dos veces seguidas, o el marido después de la mujer.
8. **Buscar entra al dato, no a la ficha** — un nº de recibo abre el recibo; una matrícula, la póliza.
9. **Una ficha, una URL** — ficha, póliza y recibo direccionables; de ahí sale gratis el modo una hoja.
10. **La acción vive en su bloque** — reclamar en Recibos, duplicado en la póliza. Cero menús de tres puntos.
11. **Se acuerda de cómo lo dejaste** — si en los clientes con deuda siempre abres Recibos, que abra Recibos.
12. **El archivo se llena solo** — la póliza en PDF llega por CIMA; hoy el XML se parsea y se tira. Guardarlo y enlazarlo convierte «0 documentos» en un archivo que crece sin que nadie haga nada.
13. **Ficha de empresa, no de persona** — 108 relaciones de tipo empresa en la base. Ahí «Su gente» son socios y administrador, y el hueco es RC, flota o convenio.

## 8. Lo que la ficha nunca dirá

- **«Sin relaciones»** — solo 17 de los 80 clientes tienen relaciones registradas (**65 en total**,
  de las 1.710 de la base). Dirá «ninguna registrada» e invitará a añadirla.
  🚨 **902 de esas 1.710 no son relaciones**: «Ocasional–Tomador» (491), «Propietario–Tomador»
  (208) y «Tomador–Contacto» (203) son roles de póliza. Por eso la pestaña de hoy no sirve: **la
  familia va en «Su gente» y los roles dentro de su póliza**. Los tipos humanos reales son cónyuge
  168, padre/madre 111, hijo/a 111, empresa 108, amigo/a 91, hermano/a 58…
- **«Siniestro en trámite»** — `gravedad`, `reserva_importe`, `indemnizacion_importe`, tramitador y
  perito (nombre/teléfono/email) están **al 0%**. Dirá «sin noticias desde el 01/07» y mandará a la
  intranet de la compañía.
- **«Total: 27.879,26€»** a secas — es la prima **conocida**, sobre 83 de 109.
- **«Sin teléfono»** — 23 de 80 no tienen forma de contacto guardada; es una tarea, no un hueco
  silencioso.
- **«3.676 presupuestos»** — están los 3.676 en estado `competencia`, sin una excepción, y
  **ninguno cuelga de un cliente vivo**: son pólizas de la competencia del volcado histórico.
  Pintarlos como presupuestos sería mentir.

## 9. Lo que hay que decidir antes de construir

- **Crear `cliente_documentos` y `siniestro_documentos`**, y añadir `poliza_id` a
  `bienes_asegurables` (o una tabla puente) para que los papeles del coche se vean desde su póliza.
- **Dónde vive el archivo**: hoy Vercel Blob privado en el lado de Manuel. Con el traspaso hay que
  decidir si se mantiene o pasa a Supabase Storage.
- **Un sitio para las notas** (`historial_interno` existe y está vacía): es lo primero que se
  necesita al colgar el teléfono.
- **El estado «documento pedido»**: sin él la ficha no puede distinguir las dos ausencias.
