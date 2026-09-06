# Estudio de competencia y posicionamiento — Grupo ASegura

> Redactado el **06/09/2026** a petición de Alberto («hay mucha competencia con el tema de las
> compañías»). Complementa a `docs/ASEGURA-MARKETING-PLAN.md`, que es el plan de acción: **esto es
> el porqué**, aquello es el qué. La cartera y las compañías las gobierna `agente-correduria`.
>
> **Regla de lectura.** Cada afirmación lleva su nivel de confianza:
> **[Medido]** sale de una consulta a la BD que se cita · **[Sector]** es conocimiento del mercado
> asegurador español, no medido aquí · **[Suposición]** es un razonamiento que hay que comprobar.
>
> 🚫 **Lo que este estudio NO puede hacer, y hay que decirlo antes que nada:** desde el contenedor
> de la sesión **no hay salida a internet** (política de red del entorno). No se ha podido mirar ni
> una SERP de Google, ni un volumen de búsqueda, ni un CPC, ni la web de un competidor. Todo lo que
> aquí se dice sobre *qué hace la competencia* es **[Sector]** o **[Suposición]**, nunca medido. Lo
> único medido es **tu propia cartera**. Un estudio de competencia que se inventa las cifras del
> rival es peor que no tenerlo.

---

## 0. La respuesta corta, que es incómoda

**No tienes un problema de competencia. Tienes un problema de tamaño y de foco.**

Con **80 clientes y 110 pólizas** [Medido], la pregunta «cómo compito con las compañías» está mal
planteada: tú no compites con Mapfre ni con los comparadores, porque no juegas en su tablero. Ellos
compran tráfico nacional a millones de impresiones. Tú necesitas **unas decenas de pólizas** para
mover tu cuenta de resultados de verdad.

Y ahí está el hallazgo que ordena todo lo demás:

> **57 de tus 80 clientes tienen el coche contigo y NO tienen el hogar.** [Medido]
> 65 de 80 tienen **una sola póliza**. 72 de 80 son de **un solo ramo**. Ratio: **1,38 pólizas por
> cliente**, cuando una correduría sana pasa de 2.

Esos 57 ya te conocen, ya te dieron sus datos, ya te pagan una póliza y **no te cuestan un euro de
captación**. Cualquier campaña que hagas hacia fuera compite —en coste por póliza— contra ese
grupo, y pierde por goleada. El estudio de competencia, hecho de verdad, dice que **tu competidor
más caro de batir eres tú mismo no llamando a esos 57**.

---

## 1. Tu posición real, medida

### 1.1 Cartera viva por ramo

Fuente: `seguros.polizas` con `esCarteraViva()` (`import_ref IS NULL OR eiac_xml_hash IS NOT NULL`),
consultado el 06/09/2026.

| Ramo | Pólizas | Clientes | Prima media | Comisión media/año¹ |
|---|---|---|---|---|
| **Auto** | 81 | 62 | 340,00€ | 40,87€ |
| **Hogar** | 19 | 16 | 308,71€ | **68,74€** |
| **Responsabilidad civil** | 9 | 9 | 319,30€ | 52,15€ |
| **Moto** | 1 | 1 | 607,88€ | sin medición |
| **Total** | **110** | **80** | — | 48,37€ |

¹ De `docs/ASEGURA-MARKETING-PLAN.md` §1.2(c), medido sobre `seguros.poliza_recibos`. **Con los
huecos que ese documento declara** (hogar descansa en 8 recibos, auto está infravalorado porque a
Mapfre le faltan meses). Es una hipótesis razonada, no una conclusión cerrada.

**Lectura:** el 74 % de tus pólizas están en el ramo que **peor** te paga y que **más** competido
está. Es la posición exactamente opuesta a la que querrías.

### 1.2 Concentración por compañía — el riesgo que nadie mira

| Entidad | Pólizas vivas | Con vencimiento ya pasado | Última actualización |
|---|---|---|---|
| **C0058 Mapfre** | **64 (58 %)** | **38** | 15/07/2026 |
| C0109 Allianz | 26 | 15 | 02/09/2026 |
| C0468 Occident | 19 | 2 | 24/08/2026 |
| C0613 Reale | 1 | 0 | 25/08/2026 |

[Medido] **El 58 % de tu cartera está en una sola compañía.** Eso no es un problema de marketing,
es un riesgo de negocio: una revisión de condiciones de Mapfre te toca más de la mitad del libro de
golpe, y no tienes con qué compensar.

🚨 **Y hay un dato que invalida cualquier campaña de vencimientos hecha hoy:** 55 de tus 110
pólizas figuran **con la fecha de vencimiento ya pasada**, y 38 de ellas son de Mapfre, cuya ficha
no se actualiza desde el 15/07. El plan de marketing ya documenta que **Mapfre nunca ha entrado por
el cron de CIMA**. Así que ese «ya vencida» **no significa que la póliza esté muerta: significa que
no lo sabemos**. Es el `NULL` disfrazado de dato que persigue todo el repo.

**Consecuencia práctica:** llamar a esos clientes con la lista actual te expone a decirle «se te
vence» a alguien que renovó en abril. Eso quema la confianza que es justo tu única ventaja.

### 1.3 Lo que sí puedes trabajar mañana

| Ventana | Pólizas |
|---|---|
| Vencen en 90 días | **17** (14 auto · 2 RC · 1 hogar) |
| Vencen en 180 días | 27 |

[Medido] Diecisiete conversaciones con fecha. No es glamuroso, pero es más de lo que te va a traer
el SEO en seis meses.

---

## 2. Contra quién compites de verdad, ramo por ramo

Todo este apartado es **[Sector]**: estructura conocida del mercado español, no medida en esta
sesión. **Verifícalo con una búsqueda tuya antes de decidir nada gordo.**

### 2.1 Auto — no se puede ganar, y no hay que intentarlo

Quién ocupa el terreno:

- **Comparadores** (Rastreator, Acierto, Kelisto, Seguros.es). Su modelo es comprar tráfico caro y
  revender el lead. Presupuesto de marketing de ocho cifras.
- **Aseguradoras directas** (Línea Directa, Verti, Balumba, Génesis). Venden sin intermediario y
  compiten en precio porque no pagan comisión.
- **Los propios agentes exclusivos** de cada compañía, con marca nacional detrás.

Por qué no entras: **[Sector]** en auto la decisión es de precio y la búsqueda es «seguro coche
barato». Con **40,87€ de comisión por póliza y año** [Medido], un solo clic de Ads en esa consulta
—**[Suposición]** de varios euros— te obliga a convertir a tasas que nadie convierte. Y aunque
ganaras el lead, el cliente se va al año siguiente por 20€.

**Decisión: auto se mantiene y se renueva, no se capta.** Es el ramo que ya tienes y el que abre la
puerta a la segunda póliza — que es donde está el dinero.

### 2.2 Hogar — aquí sí, y por dos razones

- Te renta **68,74€ por póliza y año** frente a 40,87€ [Medido]: **casi el doble con prima
  parecida**.
- **[Sector]** la permanencia media en hogar es muy superior a la de auto: quien contrata el hogar
  con su corredor tiende a quedarse. Es cartera que se acumula en vez de rotar.
- **[Sector]** la búsqueda de hogar es menos «de precio» y más «de duda»: qué cubre el continente,
  qué pasa con una fuga, si el seguro del banco vale. Ahí un corredor tiene algo que decir y un
  comparador no.

Contra quién: los mismos comparadores, pero **mucho menos agresivos**, y las oficinas bancarias
—que colocan el hogar atado a la hipoteca—. **[Sector]** ese es tu mejor argumento comercial legal:
el cliente **no está obligado** a contratar el seguro de hogar con el banco que le da la hipoteca
(Ley 5/2019 de contratos de crédito inmobiliario, art. 17). Verifica el artículo antes de
publicarlo, pero el argumento es real y es el que más pólizas de hogar mueve en una correduría.

### 2.3 Comunidades de propietarios — el hueco de verdad

**[Suposición], y es la apuesta que más me creo de todo el documento.**

- Decide **un administrador de fincas o un presidente**, no un particular a las 23:00 en el móvil.
- **No hay comparador** que venda comunidades: no es un producto de formulario.
- La competencia es **local y personal**: quien conoce al administrador se lleva el edificio.
- Una comunidad son **muchas pólizas de un solo interlocutor**, y detrás vienen los vecinos.

Tienes **9 pólizas de RC a 52,15€** [Medido], que es el vecindario de este producto. Y estás en el
casco de Sevilla, que es todo edificios en comunidad.

**Esto no se gana con SEO. Se gana visitando administradores de fincas.** Es la acción con más
retorno de todo el documento y no tiene nada que ver con la web.

### 2.4 Comercio y pyme — segundo hueco

**[Sector]** el comerciante de barrio no compara en internet: pregunta o le entra un comercial.
Prima superior a la de particulares y **casi nunca es una sola póliza** (local + RC + a veces
flota + a veces salud de empleados). Mismo mecanismo que comunidades: territorio y cara.

### 2.5 Salud y decesos — el dato histórico dice que hubo negocio

Del volcado histórico: **salud 4.470 pólizas · decesos 773** [Medido, plan §1.2]. Eso dice que
**hubo mercado ahí en su día**. No dice a qué comisión —`polizas` no tiene columna de comisión y de
28.733 históricas solo 1 tiene recibo—, así que es una pista, no un plan.

**[Sector]** salud tiene una particularidad que le va bien a una correduría pequeña: comisión
recurrente alta y una permanencia larga. Merece una medición propia antes de invertir nada.

---

## 3. Qué significa esto para la web (y para los textos que no te gustan)

Tu hero dice hoy:

> **«Tu seguro, mirado por quien no trabaja para la aseguradora.»**
> *Somos correduría, no compañía: comparamos entre varias aseguradoras tu hogar, tu comunidad, tu
> comercio, tu coche o tu salud, y te explicamos qué cubre cada opción antes de que firmes.*

Qué falla, a la luz de lo anterior:

1. **Explica lo que ERES, no lo que le PASA al que lee.** «Correduría, no compañía» es una
   distinción que le importa al sector, no al visitante. El que llega tiene un problema concreto
   —le ha subido el recibo, no entiende qué cubre, le vence en tres semanas— y el titular no lo
   nombra.
2. **Lista cinco ramos a la vez**, así que no prioriza ninguno. Si hogar es el ramo elegido, la
   portada tiene que inclinarse hacia hogar y comunidades, no repartirse en cinco.
3. **«No trabaja para la aseguradora» es una negación.** Define por oposición al rival en lugar de
   por lo que tú aportas.
4. Lo que sí está bien y hay que conservar: **no promete precio**. Eso no es timidez, es la ley
   (RDL 3/2020) y lo vigila `lib/ramos.test.ts`. Cualquier reescritura mantiene esa línea.

**Tres direcciones posibles** (no las escribo en la web hasta que elijas una):

| Ángulo | H1 posible | A quién habla |
|---|---|---|
| **Duda concreta** | «¿Sabes qué cubre tu seguro de hogar? Nosotros lo leemos contigo.» | Al que ya tiene póliza y desconfía |
| **Persona con nombre** | «Un corredor en Sevilla, con nombre y clave DGSFP, que te coge el teléfono.» | Al que está harto del call center |
| **Momento** | «¿Te vence el seguro? Antes de firmar la renovación, que lo vea alguien de tu parte.» | Al que tiene el aviso encima |

**[Suposición]** el tercero es el que más convierte, porque llega en el momento en que la persona
tiene que decidir algo. Pero esto se decide mirándote a ti: es tu voz, no la mía.

---

## 4. Plan de actuación, por retorno decreciente

| # | Acción | Por qué está aquí | Quién |
|---|---|---|---|
| 1 | **Arreglar la ingesta de Mapfre** | 58 % de la cartera con datos de julio. Sin esto, ni campañas de vencimiento ni saber qué ramo renta | Alberto + `agente-correduria` |
| 2 | **Llamar a los 57 de auto-sin-hogar** | El canal más barato que existe: ya son clientes. A 68,74€/póliza | Alberto |
| 3 | **Las 17 que vencen en 90 días** | Conversaciones con fecha, esta semana | Alberto |
| 4 | **Visitar administradores de fincas de Sevilla** | El hueco real. Sin comparador enfrente | Alberto |
| 5 | **Google Business Profile + reseñas de los 80** | Gratis, y es lo que sale al buscar «correduría Sevilla» | Alberto |
| 6 | **301 de `/seguros` de plataforma → `grupoasegura.es`** | Hoy compites contigo mismo por tus propias consultas | Claude |
| 7 | **Reescribir el hero + página de hogar** | Cuando 1-6 estén en marcha y sepamos hacia dónde inclinar | Claude |
| 8 | **Ads** | Con 48,37€ de comisión media, cualquier CAC de dos dígitos altos se come el primer año y el segundo. **No, todavía** | — |

**Lo que este orden dice, y no gusta:** de las ocho acciones, **cinco las tienes que hacer tú y
ninguna es de software**. La web ya está hecha; lo que falta es cartera y territorio.

---

## 5. Lo que hay que medir para cerrar este estudio

1. **La SERP real** de «seguro de hogar Sevilla», «seguro comunidad propietarios Sevilla» y
   «correduría de seguros Sevilla». Una búsqueda tuya de dos minutos vale más que todo el §2.
2. **Google Search Console**, sin el cual no sabemos por qué consultas se entra.
3. **Comisión real de hogar** con muestra suficiente (hoy son 8 recibos).
4. **Salud y decesos**: si la comisión acompaña al volumen histórico, cambia el ramo prioritario.
5. **Cuántas de las 55 «vencidas» lo están de verdad**, una vez Mapfre entre.

---

## Bitácora

- **06/09/2026** — Documento creado. Mediciones nuevas de esta sesión: reparto de multi-póliza
  (57 auto-sin-hogar, 1,38 pólizas/cliente), concentración por entidad (Mapfre 58 %) y ventana de
  vencimientos (17 a 90 días). Las cifras de comisión se reutilizan del plan de marketing, no se
  recalculan.
