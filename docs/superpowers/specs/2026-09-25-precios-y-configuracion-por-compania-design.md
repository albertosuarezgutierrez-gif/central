# Precios, coberturas y configuración por compañía (diseño, 25/09/2026)

Referencia: capturas de Avant2 de Alberto (Reale, proyecto 40842815). Flujo de Avant2:
**Datos del riesgo → Presupuestos → Preemisión → Emisión**, con una barra lateral de compañías
(Allianz, Liberty, Mapfre, Occident, Reale) y, por compañía, su formulario: *Cobro* (fraccionamiento,
forma de pago), *Descuentos* (campaña, % comercial), *Datos adicionales del riesgo* (puntos del carnet,
alarma, detector, uso) y *Coberturas* (asistencia en viaje, multas, retirada de carnet, capital de
accidentes, limpieza, equipaje, agrupación). Ese formulario es la **Product Form Library** del
vendor: la misma que ya embebe `ProductFormWidget.tsx`.

## Qué pintamos hoy (mapa del 25/09/2026)
- **Seis copias de la tabla de precios.** Solo la de retarificar auto agrupa por nivel, ordena, filtra
  y enseña logo y avisos legibles en móvil. Hogar y los cinco `*-nuevo` van en orden del vendor y
  los avisos solo en `title=` (invisibles en móvil).
- **Coberturas: no se pintan en ninguna parte del comparador.** El parser solo saca el nivel
  (`categoria`) y la franquicia. Tampoco se enseñan fraccionamiento, entrada, forma de pago ni el
  enlace a la IPID, aunque llegan en cada precio.
- **La configuración por compañía llega tarde:** el widget solo aparece DENTRO del panel de emisión,
  después de pulsar ✓, y el panel se abre debajo de todas las tablas, lejos de la fila.
- Cada precio arrastra `quoteCrudo` entero hasta el navegador (payload grande).
- ✅ Corregido hoy: el ReRate cogía el PRIMER precio de la compañía y nivel; ahora desempata por
  producto y prima (Reale llegó a dar 8 del mismo nivel).

## Propuesta (por orden)
1. **Un solo componente de precios** para los seis sitios, con tarjetas en móvil en vez de tabla
   con `min-width`. Cada tarjeta: compañía + producto, prima anual y **entrada/fraccionamiento**,
   franquicia, firmeza, «válido hasta», diferencia con lo que paga hoy.
2. **Coberturas por fila**, plegadas: las opciones de producto que ya vienen en la cotización
   (asistencia, lunas, vehículo de sustitución, accidentes…) + enlace «Ficha (IPID)» (`links[]`).
3. **«Ajustar» por compañía ANTES de emitir**, como Avant2: abre el formulario de esa compañía
   (el mismo widget) junto a su fila, y al guardar re-confirma SOLO esa compañía con las opciones
   elegidas. El panel de emisión se abre pegado a la fila, no al final.
4. Dejar de mandar `quoteCrudo` al navegador salvo para la fila abierta.

## Lo que hay que confirmar en la documentación de la API antes de programar 2 y 3
- En qué campo de cada cotización vienen las **coberturas/garantías** incluidas (¿`product.options`
  con valores?, ¿`coverages[]`?) y si traen importes o capitales.
- Si `links[]` de la cotización es la **IPID** o una ficha comercial.
- Si el ReRate con opciones distintas (paso 3) **cuesta** (hoy anotado a 0€ «sin confirmar») — si
  cuesta, «Ajustar» se limita a la compañía que se va a emitir.
