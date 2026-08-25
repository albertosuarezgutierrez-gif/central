# Conectar directo con Booking y salir de Smoobu · estudio de viabilidad

> **Qué es esto:** un estudio de viabilidad con una recomendación, no un plan de implementación.
> La conclusión corta es que el proyecto tal y como se planteó (conectarnos a Booking por nuestra
> cuenta para ahorrarnos Smoobu) **no es viable hoy**, y que además persigue el dinero pequeño.
> Abajo está el orden por el que sí sale rentable, con los números reales.

> ## ✅ DECISIÓN 25/08/2026 (Alberto): descartado — Smoobu se queda como partner de conectividad
>
> Confirmado con las facturas del Gmail: la renovación 2026 se pagó **841,36€ + IVA =
> 1.018,05€** tras negociar (lista 1.407,60€+IVA; ofertas 945 → 860 → cobrado 841,36€, ticket
> 1659351), e incluye Booking, Airbnb, Expedia, Agoda y la integración de Chekin. Por ese
> precio, el desarrollo de conectividad propia no se justifica. El proyecto queda descartado;
> las condiciones de reapertura de §4.4 siguen en pie. Lo accionable que queda es §4.1
> (renovación feb-2027 pidiendo la baja real de las 3 unidades muertas) y §4.2 (reserva
> directa, donde está el dinero grande).

---

## 1. Los números primero

De las reservas con **entrada en 2026** registradas hasta el 25/08/2026 (`incomes`, 4 pisos):

| Portal | Reservas | Bruto | Neto | Comisión |
|---|---:|---:|---:|---:|
| **Booking** | 170 | 129.868€ | 104.258€ | **25.610€ (19,72%)** |
| Expedia | 11 | 4.633€ | 4.633€ | 0€ |
| Airbnb | 2 | 1.906€ | 1.906€ | 0€ |
| Directo | 3 | 1.693€ | 1.693€ | 0€ |
| Agoda | 1 | 479€ | 479€ | 0€ |

Booking es el **92,3%** del ingreso neto — la intuición de «más del 90%» es exacta.

Y aquí está lo importante:

> **La comisión de Booking en 2026 son 25.610€. La licencia de Smoobu son 1.018,05€.**
> La comisión es **25 veces** la cuota que queremos ahorrarnos.

Nota sobre las cifras de Expedia, Airbnb, Agoda y directo: salen con comisión 0€ porque en esas
filas `amount_gross` es igual a `amount`. Eso no significa que esos portales no cobren comisión —
significa que **no tenemos guardado su bruto**. Solo el dato de Booking es un dato; el resto es un
hueco. No se pueden usar para comparar canales sin arreglar eso antes.

---

## 2. ¿Se puede conectar uno directamente con Booking? Hoy, no

Para hablar con Booking por API hay que entrar en su **Connectivity Partner Programme**, que está
pensado para **proveedores de software** (channel managers y PMS), no para propietarios. Los
requisitos publicados incluyen cumplimiento PCI y PII, software en la nube o servidor central,
gestionar precio, disponibilidad, reservas y contenido, confirmar reservas en tiempo real, y
**aportar un número mínimo de propiedades que varía según el segmento y la región**.

Nosotros seríamos un proveedor que aporta **cuatro** propiedades. Ese es el problema de fondo, y
no lo arregla insistir.

Encima, **dos fuentes independientes dicen que las altas de nuevos proveedores están PAUSADAS**
hasta nuevo aviso, por una actualización de sus términos y condiciones.

🚨 **Esto último no lo he podido confirmar en la fuente oficial**: el proxy de salida de este
entorno bloquea `developers.booking.com`, `connectivity.booking.com` y `partner.booking.com`, así
que viene de comparativas de terceros, que pueden estar desactualizadas. **No lo demos por cierto
sin comprobarlo.** La comprobación es barata y la puede hacer Alberto: preguntar por la extranet
de Booking, o por el gestor de cuenta, si admiten altas de Connectivity Partner y con qué mínimo
de propiedades. Si la respuesta fuera que sí y sin mínimo —que sería una sorpresa—, este estudio
se reabre.

---

## 3. Y aunque se pudiera: Smoobu no es «el conector de Booking»

Es la fuente de reservas de todo el stack. **155 ficheros del monorepo lo tocan**, entre ellos
24 en `apps/plataforma/lib/sivra` y 22 en el agente de huéspedes. De Smoobu cuelgan:

- las reservas que alimentan `incomes` (ingresos, contabilidad, ADR, antelación de venta),
- el motor de pricing, que **escribe los precios en Smoobu** (es su única salida a los portales),
- el calendario de disponibilidad de `housesevillana.es`,
- el agente de mensajería con huéspedes,
- las limpiezas de ialimp,
- la sincronización del ~8% que no es Booking (Airbnb, Expedia, Agoda) y el motor de reserva directa.

Sustituir Smoobu no es cambiar de proveedor: es reescribir el sistema nervioso. Y conectarse solo
con Booking dejaría fuera todo lo demás, así que **harían falta las dos cosas**: ser Connectivity
Partner de Booking *y* seguir sincronizando el resto por algún sitio.

---

## 4. Lo que sí sale rentable, por orden de retorno

### 4.1 Ahora, sin tocar código: pagamos 7 unidades y tenemos 4 pisos

La factura dice «**7 unidades**, 1 año» por 1.018,05€ — unos 145€ por unidad y año. Con cuatro
pisos, **tres unidades de más son ~436€/año**. Puede haber una explicación (una unidad por
listado, algún piso duplicado, licencias de Chekin), pero hay que mirarlo en la cuenta de Smoobu
**antes de la renovación del 07/03/2027**. Es el euro más fácil de todo este documento.

### 4.2 Reserva directa: la palanca de verdad

Cada punto de cuota que le quites a Booking vale **~256€/año** (el 1% de 25.610€). Llevar un 10%
de las reservas a directo son **~2.560€/año**: dos veces y media la licencia de Smoobu, y sin
migrar nada. La infraestructura ya está construida y pagada — `housesevillana.es` con su agente
SEO, el calendario de disponibilidad, el motor de reservas y el WhatsApp de grupos.

Es además donde encaja lo que ya está en marcha: los datos del huésped que nos quedaremos al
salir de Chekin son exactamente la lista de reserva directa.

⚠️ Con una salvedad honesta: la landing hoy es solo la de House Sevillana. Los otros tres pisos no
tienen canal directo, y House es el piso que más factura pero también el de precio más alto y menos
noches. Antes de prometer un 10%, medir cuántas reservas directas trae hoy la landing.

### 4.3 Cambiar de channel manager (no de modelo)

Si el objetivo es la cuota, la vía realista no es Booking directo: es un channel manager más
barato. Las comparativas sitúan a Beds24 en el entorno de **16€/mes para 3-5 propiedades** frente
a los ~85€/mes de Smoobu, lo que daría un ahorro del orden de **500-800€/año**.

🚨 Precio **sin verificar de primera mano** (las comparativas se contradicen entre sí y ninguna es
la web del fabricante). Antes de mover nada, pedir presupuesto real para 4 pisos.

Y el coste no es la migración de datos: son los **155 ficheros**. Solo tiene sentido si se hace
una vez, bien, y con el motor de pricing y el agente de huéspedes migrados a la vez. Es un
proyecto de tamaño comparable al de salir de Chekin, para ahorrar la mitad.

### 4.4 Booking directo: aparcado, con condición de reapertura

Se reabre si se cumple alguna de estas dos:

1. Booking confirma que admite altas de Connectivity Partner sin mínimo de propiedades (§2).
2. Dejamos de ser cuatro pisos: si el motor de pricing se vende a otros propietarios, el volumen
   cambia la ecuación y ser Connectivity Partner pasa de capricho a modelo de negocio.

---

## 5. Recomendación

1. **Septiembre:** mirar las 7 unidades de Smoobu (§4.1) y preguntar a Booking por el programa de
   conectividad (§2). Las dos son un correo, y una de ellas devuelve ~436€/año.
2. **No** abrir el proyecto de sustituir Smoobu este año: la salida de Chekin ya ocupa la ventana
   hasta marzo y compite por las mismas manos.
3. **Poner el foco en la reserva directa (§4.2)**, que es donde están los 25.610€, no los 1.018€.

## Fuentes consultadas (§2)

- [About the Booking.com Connectivity APIs](https://developers.booking.com/connectivity/docs)
- [Connectivity Partner Programme — Booking.com for Partners](https://partner.booking.com/en-gb/help/channel-manager/partner-programme/how-find-right-channel-manager-or-property-management-system)
- [A guide to our Connectivity Partner Programme](https://connectivity.booking.com/s/blog/a-guide-to-our-connectivity-partner-programme-cpp-and-platforms-MC6ZVU2AQZJBFGDHBO72NWPUN6MY?language=en_US)
- [Booking.com Partnerships: APIs, Extranet, Pulse App (AltexSoft)](https://www.altexsoft.com/blog/booking-com-partnerships-apis-extranet-pulse-app/)
- [How to get and use Booking.com API (Elfsight)](https://elfsight.com/blog/how-to-get-and-use-booking-com-api-partnership-and-integration/)
- [Beds24 Pricing 2026 (comparatif channel manager)](https://comparatifchannelmanager.fr/en/beds24-pricing/)

Las tres primeras son las oficiales y **están bloqueadas por el proxy de salida de este entorno**:
no he podido leerlas, solo los resúmenes de búsqueda. Ábrelas tú antes de dar por firme nada de §2.
