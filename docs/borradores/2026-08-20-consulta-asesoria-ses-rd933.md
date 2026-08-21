# BORRADOR — consulta a la asesoría sobre el RD 933/2021 (SES.HOSPEDAJES)

> ⚠️ **NO ENVIADO.** Redactado el 20/08/2026 por la regla permanente del monorepo: ninguna
> comunicación a terceros sale sin autorización de Alberto para ese envío concreto. Revísalo,
> ajústalo y mándalo tú.
>
> Contexto para quien lo lea desde el repo: son las tres preguntas que bloquean el diseño de
> `docs/superpowers/specs/2026-08-20-ses-hospedajes-conectividad-design.md`. Ninguna se puede
> cerrar leyendo el BOE — las tres caen fuera de lo que el RD dice literalmente.

**Asunto:** RD 933/2021 — tres dudas antes de automatizar el parte de viajeros

---

Hola:

Estamos automatizando la comunicación de viajeros a SES.HOSPEDAJES para los pisos turísticos, y
al leer el RD 933/2021 me han quedado tres dudas que prefiero consultaros antes de dar por buena
la implementación. He mirado el texto consolidado en el BOE y ninguna de las tres se resuelve
ahí, por eso os pregunto.

**1. ¿Vale la firma electrónica del viajero?**

El artículo 4.2 exige que el parte de entrada lo firme toda persona mayor de catorce años,
«conforme al sistema y modelo que se establezca», y la disposición adicional segunda remite a
«los sistemas y procedimientos que se establezcan por el Ministerio del Interior». El RD no
menciona en ningún punto la firma electrónica, digital ni manuscrita.

Nuestro plan es un check-in online en el que el huésped firma en la pantalla del móvil antes de
llegar, y guardar esa firma con fecha, IP y un hash de los datos firmados. ¿Es suficiente, o hay
alguna norma de desarrollo que exija otra cosa? Si hace falta firma manuscrita en papel, el
diseño cambia bastante y prefiero saberlo ahora.

**2. ¿Nos aplica la comunicación de la RESERVA, y no solo la del check-in?**

El artículo 6.3 fija dos momentos distintos para comunicar en 24 horas:

> a) Al realizar la reserva o la formalización del contrato o, en su caso, su anulación.
> b) Al inicio de los servicios contratados.

Nosotros teníamos previsto cubrir solo (b), la entrada del huésped. La duda es si (a) nos obliga
también a nosotros —comunicando cada reserva y cada cancelación— o si esa obligación recae en las
plataformas de intermediación (Booking, Airbnb) por ser quienes formalizan la reserva. Si nos
aplica, el sistema tiene que reaccionar además a las altas y cancelaciones del canal, que es un
alcance distinto.

**3. ¿Hasta dónde llegan los datos de pago del anexo I?**

El anexo I.A.4.d pide, entre los datos de la transacción, «identificación del medio de pago: tipo
de tarjeta y número, IBAN cuenta bancaria...», titular y fecha de caducidad.

Almacenar números de tarjeta nos metería en obligaciones de PCI-DSS que hoy no tenemos, y en la
práctica muchas reservas se cobran a través de la plataforma y nosotros nunca vemos la tarjeta.
¿Qué se considera cumplimiento suficiente aquí? ¿Basta con el tipo de pago (efectivo, tarjeta,
transferencia) y la fecha, sin identificar el instrumento concreto?

---

Sobre el régimen sancionador ya me he aclarado y no hace falta que lo comentéis salvo que veáis
algo raro: el artículo 8 remite a la LO 4/2015, y por su artículo 39.1 comunicar fuera de plazo
es leve (100 a 600 €) mientras que no comunicar o no llevar el registro es grave (601 a
30.000 €). Lo digo porque es justo lo que nos ha llevado a diseñar el sistema para que prefiera
siempre enviar tarde antes que no enviar.

Gracias,
Alberto
