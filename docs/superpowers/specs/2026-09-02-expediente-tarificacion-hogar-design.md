# Expediente de tarificación (hogar) — diseño

> **Fecha:** 02/09/2026 · **Ramo piloto:** hogar · **Apps:** `apps/asegura` (ahora),
> `apps/plataforma` (pantalla de Alberto), web pública y agente (después).
>
> Nace de la conversación del 02/09/2026 con Alberto, después de auditar la API del
> fabricante y el CRM de Manuel. La auditoría de la API vive en
> `docs/CODEOSCOPIC-API-PORTAL.md` (§ Garantías y opciones por compañía); aquí solo se
> citan sus conclusiones.

## 1. El problema

Hoy retarificar una póliza de hogar es rellenar un formulario largo y pulsar un botón que
cuesta 0,50€. Alberto quiere tres cosas que ese formulario no da:

1. **Una ficha revisable antes de pagar**, con todo relleno, que se pueda enseñar y
   corregir. La ve él, y más adelante el propio cliente.
2. **Que el precio no dependa solo de él.** El mismo camino lo tienen que poder recorrer un
   agente automático y un lead que entra por la web.
3. **No gastar a ciegas.** Guardar lo que se cotiza para estimar por nuestra cuenta antes de
   pagar, y para no volver a pagar por enseñar lo mismo.

## 2. Alcance

**Entra:** el expediente común, la ficha revisable, el auto-relleno, el guardado de
cotizaciones, la estimación propia, los topes por puerta y las opciones por compañía en la
ficha de la póliza.

**No entra, y se dice para que no se cuele:** los suplementos y modificaciones de póliza
viva (Alberto los aparca a propósito); los ramos distintos de hogar; y **una tabla propia de
garantías por compañía**, que la auditoría demuestra que sobra (§ 6).

## 3. La pieza central: el expediente

Un expediente es *todo lo que hace falta para pedir un precio de un ramo, más la memoria de
de dónde salió cada dato*. Es **puro**: no sabe de React, ni de base de datos, ni de quién lo
rellena. Es lo que permite que las tres puertas compartan reglas.

```
Expediente = {
  ramo,
  puerta,            // corredor | agente | web
  persona,           // tomador: nunca se supone nada de aquí
  riesgo,            // lo que se asegura
  opcionesCompania,  // lo que cada compañía añade de su cosecha (§ 6)
  procedencias,      // por campo: de dónde salió el valor
  supuestos,         // lo que se ha rellenado sin saberlo, y si abarata el precio
  faltan,            // lo que impide pedir precio
}
```

**Procedencia por campo, no por expediente.** Cada valor lleva pegado de dónde vino: `poliza`
(CIMA), `volcado` (la copia de junio/2026), `catastro`, `defecto` (valor por defecto de la
pantalla), `corredor` o `cliente`. Eso es lo que deja decir en pantalla si un dato merece
confianza, y es la diferencia entre un dato y una suposición con forma de dato.

**Tres estados siempre.** Un campo puede tener valor, estar a `null` porque nadie lo sabe, o
estar supuesto. Nunca se colapsa «no lo sé» en un cero o en un «no». En las protecciones
(puerta blindada, ventanas, urbanización cerrada) eso significa un tercer estado explícito:
sí, no, o **no lo sé**. Al vendor hay que mandarle un sí o un no porque los exige, así que se
manda el conservador y **se declara como supuesto**, en vez de fingir que se preguntó.

Funciones puras, todas con tests:

- `armarExpediente(entrada, resueltos, hoy, catastro?)` — la entrada es distinta por puerta;
  la salida es siempre la misma. Generaliza el `precalificarHogarCartera` que ya existe.
- `resumen(expediente, catalogos)` — convierte el expediente en **filas listas para pintar**:
  grupo, etiqueta, valor legible, procedencia, editable, tipo de control y opciones. Esta es
  la pieza que reutilizan las tres pantallas.
- `listoParaCotizar(expediente)` — sí o no, con el porqué.

## 4. Las tres puertas

| Puerta | Quién rellena | De dónde salen los datos | Qué puede gastar |
|---|---|---|---|
| Corredor | Alberto | cartera + gemela + Catastro + su teclado | el tope de la casa |
| Agente | automático | cartera de renovaciones + Catastro | solo renovaciones, con tope propio |
| Web | el interesado | lo que teclea + Catastro por dirección | tope diario bajo, solo orientativo |

**El tope deja de ser uno.** Hoy el gasto lo dispara un dedo de Alberto y el tope de la casa
basta. Con tres puertas hace falta un tope por puerta, guardado junto al libro de consumo que
ya existe. La regla de fondo: **el agente solo gasta donde el gasto se justifica solo**, que es
renovar una póliza que ya paga una prima conocida.

**La web cuenta menos.** El mismo expediente, pero un desconocido no ve la ficha interna, ni
los supuestos que hablan de su póliza anterior, ni de dónde hemos sacado sus metros. El
`resumen()` recibe el nivel de detalle como parámetro; no se hacen dos pantallas distintas.

**Un lead que no compra no se tira.** Queda como oportunidad con lo que rellenó y con el
precio que se le dio, para retomarlo por teléfono. Y lo que Alberto corrija a mano vuelve a la
ficha del cliente: cada tarificación deja la cartera mejor que como la encontró.

## 5. La ficha revisable

Deja de ser un formulario y pasa a ser una ficha en modo lectura, con lápiz por fila.

- Agrupada en **dónde está**, **cómo es**, **protecciones**, **capitales** y **el tomador**.
- Cada fila enseña su procedencia. Los supuestos llevan distintivo, y los que **abaratan** el
  precio se marcan aparte: es la letra pequeña de lo que se va a cobrar.
- Arriba, en rojo, lo que falta para poder pedir precio.
- **Al lado, lo que paga hoy.** Las diecinueve pólizas de hogar vivas tienen su prima anual
  guardada, así que la comparación sale gratis. Un precio suelto no dice nada; junto al actual,
  vende.
- Abajo el botón, con su precio dentro y apagado mientras falte algo.
- Los supuestos, además, se leen en lenguaje de venta: «esto puede bajar si tienes alarma».
  Le da al cliente un motivo para contestar.

## 6. Las opciones por compañía

Lo que la auditoría de la API dejó probado, y que manda sobre este apartado:

- La cotización **no devuelve garantías ni capitales por garantía**. Solo prima, modalidad y de
  quién es. Las palabras garantía y franquicia no aparecen en toda la documentación.
- Las opciones de cada compañía **se pueden leer** de una oferta ya cotizada, con su etiqueta y
  su valor formateado, y **se pueden cambiar** volviendo a tarificar.
- **No hay catálogo por API** que diga qué valores admite cada campo. La única vía documentada
  para pintar un desplegable de verdad es el formulario que el fabricante sirve para incrustar.
- **Los valores por defecto ya se configuran en Avant2** y se heredan al cotizar por API. No
  existe operación para fijarlos desde fuera.

**Decisión: no se construye una tabla de garantías por compañía.** Duplicaría una configuración
que ya existe, que manda sobre la nuestra y que Alberto ya sabe tocar. Lo que sí se guarda es
**qué configuración de producto se usó en cada precio**, para saber siempre bajo qué acuerdo
salió.

**En la ficha de la póliza** se enseñan las opciones que devolvió cada compañía, con su etiqueta
y su valor. Para modificarlas se abre el formulario del fabricante dentro de la página, y al
cerrarlo se vuelve a tarificar. Eso exige un puerto propio que le reenvíe las peticiones, porque
ese formulario no puede llevar nuestras credenciales. Va en tercer lugar del plan.

**Aviso que la pantalla tiene que saber dar:** hay compañías que rechazan la cotización pidiendo
un dato que no sabíamos que querían. El caso documentado es una que exige los años de la última
reforma. Llega después, no se puede anticipar, y se enseña como lo que es: lo que pide esa
compañía, no un fallo nuestro.

## 7. Auto-relleno

- **Catastro, automático.** Es gratis y ya se usa en `/correduria/hogar`. Con la dirección de la
  ficha se sacan metros, año y referencia catastral cuando la ficha no los trae. Todo lo que
  venga de ahí queda marcado con su procedencia, incluida la advertencia de que la superficie
  catastral es construida.
- **Capitales recomendados, detrás de un botón que avisa.** El fabricante ofrece una operación
  que devuelve continente y contenido recomendados, desglosados por compañía y marcando la
  preferida. El portal no dice que cueste créditos, **pero tampoco dice que sea gratis**, y puede
  tardar más de un minuto. Hasta medirlo, no se llama sola.
- **Nada personal se supone jamás.** Ni DNI, ni nombre, ni fecha de nacimiento, ni teléfono. Si
  no están, faltan.
- **Los capitales no se inventan.** Un continente inventado da un precio inventado.

## 8. Guardar la cotización, y estimar por nuestra cuenta

Hoy se apunta lo que se gasta pero no lo que se recibe: los precios viven en la pestaña del
navegador. Recargar es tirar 0,50€.

**Se guarda, por cotización:** el expediente entero tal como se mandó, la respuesta de cada
compañía con su prima y su configuración de producto, la fecha, y quién la disparó. Con eso se
le puede reenseñar el precio al cliente mañana sin volver a pagar, y comparar la renovación del
año que viene con esta.

**La estimación propia, en dos capas:**

1. **Hoy, gratis:** las primas reales de las pólizas de hogar de la cartera, con su superficie,
   año y capitales. Diecinueve casos, prima media 308,71€. Da una horquilla burda pero real.
2. **Según se cotice:** cada cotización pagada añade un caso con el precio de cada compañía.
   Con volumen, deja de ser una horquilla de cartera y pasa a ser tarifa observada por compañía.

**Para qué sirve de verdad:** no tanto para enseñar un precio como para **decidir si merece la
pena pedirlo**. Si el cliente paga 250€ y la horquilla dice de 240€ a 320€, no hay negocio y no
se gasta. Si dice de 150€ a 200€, se gasta. Aplicado a la tanda de la cartera, convierte un gasto
a ciegas en uno dirigido.

**Tres cautelas, no negociables:**

- La estimación **nunca se llama precio**. Se enseña como horquilla, diciendo en cuántos casos se
  basa y de cuándo son. Tres casos de hace un año valen poco, y eso se ve.
- **Todo va fechado y pierde peso con el tiempo.** Las tarifas cambian.
- **En la web jamás se enseña una estimación nuestra como oferta de una compañía.** Si el cliente
  ve 180€ y luego le dicen 260€, se ha perdido al cliente. Se dice que es orientativa y que el
  precio bueno se pide con un clic.

## 9. Lo que ya sabemos que va a doler

- **En hogar, el primer precio es siempre estimado.** En el ejemplo del fabricante, todas las
  cotizaciones de hogar traen la acción de volver a tarificar como obligatoria. Un precio firme
  exige una segunda llamada. En el código de Manuel esa segunda llamada está tratada como
  facturable, así que **un precio firme de hogar probablemente cuesta el doble**. Hay que medirlo
  en la primera cotización real antes de lanzar la tanda de diecinueve.
- **Un fallo de base de datos hoy tumba la ficha entera**, porque la lectura no está protegida.
  Entra en el plan: que diga qué pasa en vez de morir en silencio.
- **Un 400 de validación no se cobra**, y su mensaje dice qué falta. Se sigue enseñando entero.

## 10. Pruebas

- Puras y con tests: `armarExpediente`, `resumen`, `listoParaCotizar`, el troceo de la dirección,
  la horquilla de estimación y los topes por puerta.
- Un guardián que impida que la web o el agente gasten por encima de su tope.
- Un guardián que impida enseñar una estimación propia sin su etiqueta de orientativa.
- Los guardianes de gasto que ya existen siguen valiendo: nadie llama al vendor fuera del embudo
  único, y ninguna consulta de catálogo cuesta dinero.

## 11. Orden de construcción

1. El expediente y el resumen (puros, con tests) y la ficha revisable en asegura.
2. Guardar la cotización y la horquilla de estimación sobre la cartera.
3. La entrada de venta: oportunidad desde lead, con su tope.
4. Las opciones por compañía en la ficha, con el formulario del fabricante.
5. La web pública, con el detalle recortado y su tope diario.

Los suplementos quedan fuera, para cuando Alberto los pida.

**El plan de implementación que sale de esta especificación cubre solo los puntos 1 y 2.** Los
tres siguientes son proyectos con su propio diseño: la entrada de venta toca el modelo de
oportunidades, el formulario del fabricante mete un `iframe` de terceros en nuestra página, y la
web pública abre una puerta a desconocidos. Cada uno vuelve a pasar por aquí antes de escribirse.
