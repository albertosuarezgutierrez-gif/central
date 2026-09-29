# Estudio de competencia y posicionamiento — Grupo ASegura

> Redactado el **06/09/2026** a petición de Alberto («hay mucha competencia con el tema de las
> compañías»). Complementa a `docs/ASEGURA-MARKETING-PLAN.md`, que es el plan de acción: **esto es
> el porqué**, aquello es el qué. La cartera y las compañías las gobierna `agente-correduria`.
>
> **Regla de lectura.** Cada afirmación lleva su nivel de confianza:
> **[Medido]** sale de una consulta a la BD que se cita · **[Sector]** es conocimiento del mercado
> asegurador español, no medido aquí · **[Suposición]** es un razonamiento que hay que comprobar.
>
> 🚫 **Lo que este estudio NO podía hacer al redactarse (06/09/2026), y por qué la nota de abajo lo
> corrige:** se dijo aquí que desde el contenedor de la sesión no había salida a internet y que todo
> el §2 era `[Sector]`/`[Suposición]`, nunca medido. **Era cierto para el `Bash` de la sesión, no
> para la herramienta de búsqueda web** — el 15/09/2026 se usó por primera vez y SÍ funciona. No es
> una SERP en vivo ni da posición/volumen/CPC (eso lo dará GSC cuando haya datos), pero sí lee webs
> reales de comparadores y corredurías: suficiente para contrastar «¿existe comparador de esto?»,
> que es la pregunta que más ha fallado en este documento (ver §2.6). Nueva etiqueta:
> **[Web 15/09]** = contrastado con búsqueda real esa fecha, con sus enlaces citados. Lo que sigue
> sin `[Web]` sigue siendo `[Sector]`/`[Suposición]` sin comprobar — no lo trates como medido.

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
no se actualiza desde el 15/07. Así que ese «ya vencida» **no significa que la póliza esté muerta:
significa que no lo sabemos**. Es el `NULL` disfrazado de dato que persigue todo el repo.

⚠️ **Corrección de este mismo documento (06/09/2026).** Arriba se dijo, citando el plan de
marketing, que «Mapfre nunca ha entrado por el cron de CIMA». **Es falso, y la diferencia cambia
el diagnóstico.** Medido contra `seguros.cima_ficheros`:

| Entidad | Ficheros CIMA | Último | Días callada |
|---|---:|---|---:|
| C0468 Occident | 75 | 05/09/2026 | 1 |
| C0109 Allianz | 39 | 03/09/2026 | 3 |
| C0613 Reale | 3 | 25/08/2026 | 12 |
| **C0058 Mapfre** | **14** | **23/06/2026** | **75** |

Mapfre **sí entró** —catorce veces— y **dejó de entrar**. Y CIMA no está caído: las otras tres
compañías siguen llegando con normalidad, una de ellas ayer. O sea, no es una tubería que nunca se
conectó (que se arreglaría configurándola): es una que **funcionaba y se cortó**, y eso apunta a
la suscripción de esa entidad, no al cron. La pregunta para Codeoscopic/Mapfre es por qué C0058
dejó de emitir el 23/06, no cómo darla de alta.

Lo detecta desde el 05/09 `packages/module-seguros/src/silencio-entidad.ts`, que compara a cada
compañía **con su propio ritmo** (30 días fijos no habrían dicho nada de Mapfre hasta el día 30, y
habrían acusado a Reale, cuyo ritmo normal son 23 días). Sale por Telegram desde el cron
`correduria-ingesta`. **El software ya avisa; lo que falta es la llamada.**

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

### 2.3 Comunidades de propietarios — el hueco es más estrecho de lo que aquí se dijo

🚨 **Corrección [Web 15/09]: «no hay comparador que venda comunidades» era falso.** Hay varios
(Segurfer, Seguros-Generales, MiPóliza, SegurosMarina…), alguno trabajando con 20-70 compañías y
prometiendo un 20-35 % de ahorro. No es un hueco vacío de competencia digital — lo que sigue siendo
cierto es lo de abajo, pero el argumento «nadie más lo vende» no vale.

- Decide **un administrador de fincas o un presidente**, no un particular a las 23:00 en el móvil
  — esto SÍ sigue siendo la razón real de por qué gana quien tiene la relación, no la web.
- La competencia es **local y personal**: quien conoce al administrador se lleva el edificio, aunque
  exista un comparador — el administrador no va a comparar él mismo 40 comunidades por internet.
- Una comunidad son **muchas pólizas de un solo interlocutor**, y detrás vienen los vecinos.
- 🆕 **[Web 15/09] El propio administrador de fincas es un cliente potencial aparte**: necesita SU
  PROPIO seguro de RC profesional (obligatorio si está colegiado) y cada vez más un **D&O** si
  administra una comunidad grande. Es la misma persona a la que hay que visitar para las
  comunidades, con un producto propio que venderle a él, no solo a través de él.

Tienes **9 pólizas de RC a 52,15€** [Medido], que es el vecindario de este producto. Y estás en el
casco de Sevilla, que es todo edificios en comunidad.

**Esto no se gana con SEO puro. Se gana visitando administradores de fincas** — pero una vez
visitados, una página de comunidades SÍ ayuda a que lo que encuentren de ti online no desentone
con la conversación que acabas de tener.

### 2.4 Comercio y pyme — segundo hueco

**[Sector]** el comerciante de barrio no compara en internet: pregunta o le entra un comercial.
Prima superior a la de particulares y **casi nunca es una sola póliza** (local + RC + a veces
flota + a veces salud de empleados). Mismo mecanismo que comunidades: territorio y cara.

🆕 **[Web 15/09] Dentro de «pyme» hay un producto concreto que los comparadores generalistas NO
tocan y que encaja con el resto de la cartera: el paquete de empresa.** Cuando una pyme tiene
empleados, suele necesitar TRES cosas a la vez, ninguna vendible por un comparador de precio:
- **Seguro de accidentes de convenio** — obligatorio si el convenio colectivo del sector lo exige
  (no todas las pymes lo saben, y no tenerlo lo paga el empresario de su bolsillo si hay un
  accidente). Venta consultiva pura: primero hay que MIRAR el convenio.
- **Ciberseguro pyme** — mercado en crecimiento (gasto en ciberseguridad España >5.000 M€ en 2026,
  incidentes +26 % interanual), y **ningún comparador generalista lo vende**: Rastreator/Acierto/
  Kelisto hacen coche-moto-hogar-salud-vida-decesos-viaje-mascotas-impago de alquiler, ninguno
  ciberseguro. Lo venden aseguradoras directas + corredores especializados — hueco real.
- **RC de comercio** (ya la tienes, §2.4 original).
Es el mismo argumento que §2.3 con administradores: **una pyme visitada compra el paquete, no una
póliza suelta**, y es justo la clase de venta que un comparador de precio no puede hacer porque
exige leer un convenio o explicar una cobertura, no comparar un número.

### 2.5 Salud y decesos — el dato histórico dice que hubo negocio

Del volcado histórico: **salud 4.470 pólizas · decesos 773** [Medido, plan §1.2]. Eso dice que
**hubo mercado ahí en su día**. No dice a qué comisión —`polizas` no tiene columna de comisión y de
28.733 históricas solo 1 tiene recibo—, así que es una pista, no un plan.

**[Sector]** salud tiene una particularidad que le va bien a una correduría pequeña: comisión
recurrente alta y una permanencia larga. Merece una medición propia antes de invertir nada.

### 2.6 🆕 El hueco que SÍ es de SEO puro: RC profesional de oficios — 15/09/2026

Alberto: *«hay que estar abierto a todo, hay que buscar el hueco que dejan las grandes».* Esto es
lo que salió de mirarlo de verdad, no de suponerlo.

**[Web 15/09] Confirmado: los grandes comparadores (Rastreator, Acierto, Kelisto) NO venden RC
profesional de oficios.** Su catálogo es coche/moto/hogar/salud/vida/decesos/viaje/mascotas/impago
de alquiler — ninguno cubre la RC que necesita un electricista, fontanero, instalador o reformista
autónomo. Quien SÍ lo vende hoy son webs de nicho pequeñas (miotroseguro.com, riesgoempresas.com,
unitseguros.com, polizamedica.es) — competencia real pero sin el presupuesto de Ads de un
comparador nacional. Es, de los ramos mirados hoy, **el único donde «los grandes no están» es
literalmente cierto**, no una suposición.

Por qué encaja con lo que ya tienes:
- **Los instaladores eléctricos, de gas, fontanería y climatización están OBLIGADOS por reglamento
  a tener aval de RC para sacar o renovar el carné profesional** [Web 15/09] — no es una venta de
  «por si acaso», es un requisito administrativo con fecha. Intención de problema de manual: busca
  quien lo necesita YA, no quien compara precio.
- Precio orientativo **150-200 €/año** para un electricista autónomo [Web 15/09] — prima parecida a
  tu RC actual (319,30 € de media, [Medido]) o algo menor, así que la comisión es del mismo orden.
  Es **deducible en IRPF/IVA** para el autónomo, un argumento de venta real y verificable (no de
  precio: de fiscalidad).
- **Decide UNA persona, rápido** (el propio autónomo), a diferencia de comunidades/pyme donde hay
  que convencer a un administrador o a un empresario con más pasos — esto sí se puede cerrar sin
  visita, con una página que responda «¿necesito esto para mi carné?».
- Ya tienes **9 pólizas de RC** [Medido] en cartera: es ampliar un ramo que conoces, no abrir uno
  nuevo desde cero.

**Adyacente, mismo mecanismo, mayor ticket, más lento de cerrar:**
- **Seguro decenal de construcción/reformas** [Web 15/09] — obligatorio por Ley 38/1999 para
  promotores/constructores antes de entregar obra. Hay corredurías especializadas (ASP, Montico,
  Gloval) pero ningún comparador generalista; venta B2B, exige relación con constructoras/
  reformistas, no solo contenido web.
- **D&O / RC de administradores y directivos** — mencionado en §2.3, mismo patrón: nicho servido por
  aseguradoras directas y algún corredor especializado, no por comparadores de precio.

**Descartado por ahora, y por qué [Web 15/09]:**
- **Seguro agrario (olivar, Andalucía)** — hueco real en teoría (encaja geográficamente), pero **ya
  está servido por corredores especializados asentados** (Anagán y similares) con conocimiento
  profundo de las subvenciones de la Junta y las líneas del Plan de Seguros Agrarios Combinados.
  Barrera de entrada alta para un negocio que hoy no tiene ni un cliente agrario. No perseguir salvo
  que aparezca un cliente real que lo pida.

**Recomendación de esta sesión:** de todo lo mirado hoy, **RC profesional de oficios es el único
nuevo ángulo con luz verde clara para SEO** (grandes ausentes de verdad, decisión rápida de una
persona, ticket ya conocido). El resto (pyme/ciberseguro, decenal, D&O) son huecos reales pero
**de visita y relación, como comunidades** — se preparan como contenido de apoyo, no como motor de
captación. Antes de escribir nada, **Alberto decide si electricista/fontanero/instalador son los
oficios correctos** o si hay otro colectivo (autónomos de la construcción en general, peluquerías,
academias…) que conoce mejor desde el trato diario con clientes.

### 2.7 🆕 Acierto.com por dentro, y el «comparador por garantías» — 29/09/2026

> Pedido por Alberto: «está muy bien hecha para SEO; ¿montamos un comparador donde el cliente elige
> la garantía y salen todas las compañías?». Nueva etiqueta **[OpenSEO 29/09]** = DataForSEO vía el
> MCP de OpenSEO (mercado España), estimaciones de tráfico, no GSC. `acierto.com` está BLOQUEADO al
> fetch desde la sesión: su web no se ha leído, solo su huella en Google.

**Quién es.** [Web 29/09] Lo compró el grupo alemán **Bauer Media** a finales de 2020, pero en
**diciembre de 2024 sus fundadores (Carlos y Mario Brüggemann) lo recompraron**
([Infobae](https://www.infobae.com/espana/agencias/2024/12/05/los-fundadores-del-comparador-aciertocom-compran-el-negocio-a-bauer-media/)).
Su LinkedIn aún dice Bauer: está desfasado. Es un **comparador-correduría online**, no una
correduría tradicional con comparador añadido.

**Huella SEO.** [OpenSEO 29/09] **~436.000 visitas orgánicas/mes estimadas, 17.151 keywords**. De las
60 que más tráfico le dan (sin su marca):

| Sección | % del tráfico de esas 60 |
|---|---|
| `/prestamos/` (Cofidis, Moneyman, ASNEF…) | **41 %** |
| `/seguros-coche/` (comparador + fichas de aseguradora) | 36 % |
| `/Rastreator/` (página sobre **el competidor**) | 10 % |
| Moto / hogar / vida | ~6 % (hogar **~1 %**) |

Lo que enseña, en tres patrones:
1. **Una «money page» por ramo** (`/seguros-coche/comparador/`), nº 1 para «comparador seguro coche»
   (40.500/mes). Inalcanzable para nosotros: es autoridad de dominio de 15 años, no técnica.
2. **Una ficha por marca ajena**: `/seguros-coche/aseguradoras/{axa,verti,prima,direct-seguros,
   linea-directa…}` y hasta `/Rastreator/`. Capta a quien busca el nombre de una compañía. **Este es
   el patrón copiable**: búsquedas de marca + intención («teléfono siniestros X», «cancelar seguro
   X», «opiniones X hogar») tienen poca competencia de contenido real y ya tenemos la semilla en
   `/telefonos-siniestros` (catálogo único `telefonos-companias.ts`).
3. **Casi la mitad de su tráfico no es seguros**, es crédito al consumo. Su negocio es vender
   leads/afiliación financiera; el seguro es una línea más. **Hogar le da ~1 %**: confirma §2.2, en
   hogar la SERP de comparadores está menos peleada.

**Y la correduría que Alberto tenía en mente NO está detrás de Acierto: está detrás de la OCU.**
[Web 29/09] **Proyectos y Seguros, Correduría de Seguros S.A.** (clave DGSFP **J0067**, Móstoles)
presta su herramienta de tarificación a **OCU Ediciones** por convenio: los comparadores de moto,
coche, hogar y salud de `ocu.org` son su motor
([términos OCU](https://www.ocu.org/fincas-y-casas/gestion/seguros-y-prestamos/terminos-legales)).
Su web propia es SEO **débil** [OpenSEO 29/09]: ~1.300 visitas/mes y 187 keywords, casi todo su
propia marca. O sea: **no crece por SEO, crece por prestar el comparador a quien ya tiene la
audiencia** (marca blanca B2B2C) y lo remata con call center. El `#calcula-seguro` de su web es el
mismo tarificador. Lección para nosotros: el canal realista no es ganar a Acierto en Google, es
poner nuestro cotizador dentro de audiencias ajenas (colegios profesionales, asociaciones de
comerciantes, administradores de fincas) — el «affinity» que el propio tarificador de Avant2
permite al instalarse en varias URLs.

**El comparador con precio.** [Web 29/09] Ya existe la pieza: Codeoscopic vende **tarificadores web
HTML de Avant2** para incrustar en la web de la correduría (auto, moto, hogar, comercio)
([SegurosNews](https://segurosnews.com/mediacion/codeoscopic-lanza-los-tarificadores-web-html-para-corredurias)).
No hay que construir un multitarificador. Pero **abrirlo al público tal cual está prohibido por la
regla 3 de `seo-asegura`**: cada cotización cuesta **0,50 €** y no es idempotente, así que un widget
abierto es una cartera abierta a bots y curiosos. Solo con lead primero (teléfono verificado) +
límite por IP/día + captcha, y con el coste medido contra la comisión media (48,37 €/año). Y
[Probable] publicar un ranking de precios convierte la web en canal de venta a distancia con IPID y
análisis objetivo exigibles (RDL 3/2020): **consulta con el cumplimiento antes de encenderlo**.

**El «desplegable de garantías» — la versión que SÍ recomiendo.** Comparar **coberturas, no precios**:
el usuario marca lo que quiere (p. ej. hogar: daños estéticos, rotura de vitrocerámica, robo fuera
de casa, RC ≥ 300.000 €) y ve qué productos de las compañías con las que trabajamos lo incluyen, con
el condicionado y su fecha de versión como fuente, y el CTA «te lo tarificamos nosotros». Ventajas:
**0 € por consulta**, no promete precio, es lo que un comparador de precio no enseña, y cada
combinación relevante puede ser **una página indexable** («seguro de hogar con daños estéticos»).
Riesgos: el dato es CARO de mantener (cada cambio de condicionado) y un «incluye» falso es
responsabilidad de la correduría → solo con fuente por celda y fecha, y tres estados (incluye / no
incluye / **sin revisar**), nunca un hueco pintado como «no cubre». Empezar por **un ramo (hogar) y
las 4-5 compañías reales de la cartera**, no por «todas».

### 2.8 🆕 Rastreator y el resto del tablero de comparadores — 29/09/2026

**Quién ocupa Google en «comparador de seguros»** [OpenSEO 29/09] (12 consultas de comparador y
«barato» de coche, moto, hogar, salud, vida, decesos, mascotas y comunidades; tráfico estimado que
cada dominio saca de ESAS consultas, no su tráfico total):

| Dominio | Qué es | Tráfico de esas consultas | Posición típica |
|---|---|---|---|
| **acierto.com** | Comparador-correduría (§2.7) | ~17.800 | nº 1 en comparador coche/moto/hogar |
| **rastreator.com** | Comparador-correduría, RVU (Reino Unido) | ~9.300 | nº 2-3 en todo; nº 4 en «seguro hogar barato» |
| qualitasauto.com | Aseguradora directa | ~7.000 | nº 1 en «seguro coche barato» |
| **kelisto.es** | Comparador multiproducto (seguros, finanzas, telco, energía) | ~5.300 | nº 2-3 en comparador genérico y coche |
| **seguros.check24.es** | Comparador alemán, correduría propia en España desde 2020 | ~3.900 | nº 3-4 en moto/hogar/coche |
| arpem.com | El comparador más veterano (2002) | ~2.300 | nº 4-5 — pero **en liquidación** según Füture: su hueco queda libre |
| caser, AXA, Línea Directa, Verti, Mutua, Terránea, El Corte Inglés | Aseguradoras y bancaseguros con su propio «calcula tu precio» | 200-1.900 c/u | 2-20 |
| doctori, segurojoven, polizamedica, selectra, cleverea, ocu.org, rankia | Nicho (salud, jóvenes), energía o contenido | <600 c/u | 5-50 |

**Rastreator en detalle.** [Web 29/09] Creado en 2009 por Admiral + Mapfre; en 2020-21 lo compró
**RVU** (grupo ZPG, dueño de Uswitch) por ~560 M€
([elEconomista](https://www.eleconomista.es/empresas-finanzas/noticias/10966863/12/20/Admiral-y-Mapfre-venden-su-participacion-en-Rastreator-y-otros-comparadores-del-grupo-por-unos-560-millones.html)).
Es **correduría** y compara también telefonía, préstamos, energía y viajes. [OpenSEO 29/09]
**~1.215.000 visitas orgánicas/mes estimadas y 29.885 keywords: casi 3 veces Acierto.** Mismo modelo
(multiproducto, money page por ramo, fichas de marca). El desglose por secciones no se pudo sacar:
**se agotaron los créditos de OpenSEO** a mitad del estudio.

**Lo que dice el tablero, y lo que NO dice:**
1. **Es un duopolio en coche/moto/hogar** (Rastreator + Acierto), con Kelisto y Check24 detrás y las
   aseguradoras directas pujando por su marca. Nada que hacer ahí por SEO, lo que confirma §2.1.
2. **En hogar compiten ya las aseguradoras con su marca** (Caser nº 2, El Corte Inglés nº 5,
   Verti nº 6, Mutua nº 3 en «comparador seguro hogar»). Hogar por palabra genérica tampoco se gana:
   hogar se gana por intención de problema (§2.2), no por «comparador».
3. De las 12 consultas, **en 6 (salud, vida, decesos, mascotas, comunidades y la variante de hogar
   «comparar») ningún dominio de la tabla salió posicionado**. Eso NO prueba que no haya comparador
   de esos ramos (§2.3 ya se equivocó con comunidades): puede ser volumen bajo o que el top-25 sean
   otros sitios. Es la pista a mirar en la próxima pasada, con créditos.
4. **Arpem cerrando** deja un dominio veterano con autoridad que desaparecerá del top-5 de
   «comparador seguros». No es un hueco para nosotros (no tenemos la autoridad para heredarlo), pero
   sí para Check24 y Kelisto.

### 2.9 🆕 «Sube tu póliza y te damos precio» — la idea de Alberto, y quién la tiene ya — 29/09/2026

- **No es inédita:** [poliza.ai](https://poliza.ai/) promete «sube tu póliza y en 30 segundos sabrás
  si pagas de más» (auto). Según Alberto (29/09), la lleva un corredor chileno (Nicolás Fernández,
  especialista en flotas, fundador de Rondapp). **[Probable] Hoy apunta a Chile, no a España**:
  no es competidor directo, pero demuestra que el modelo existe y que otro puede traerlo.
- **Nuestra ventaja no es la idea, es ser corredor con motor propio:** la lectura de pólizas ya
  existe (`apps/asegura/lib/documentos/extraer-poliza.ts`, auto/moto/hogar; y la del portal) y la
  petición a Avant2 también (`apps/asegura/lib/codeoscopic/`). Falta abrirlo al no-cliente.
- **Coste real = Avant2 (0,50 €/consulta), no la IA.** Por eso: teléfono verificado → lectura →
  2-3 datos que la póliza no trae (carné y siniestros en auto; m² y año en hogar) → precio.
  Fase 1 sin Avant2 (la ficha le llega a Alberto y él tarifica); Fase 2 automática con tope diario.
- Fuera de alcance al inicio: salud y vida (datos de salud, art. 9 RGPD). El copy no promete
  ahorro («te la revisamos», no «te la mejoramos»).

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
| 4 | **Visitar administradores de fincas de Sevilla** | El hueco de relación (no de ausencia de comparador — corregido §2.3, 15/09) | Alberto |
| 5 | **Google Business Profile + reseñas de los 80** | Gratis, y es lo que sale al buscar «correduría Sevilla» | Alberto |
| 6 | **301 de `/seguros` de plataforma → `grupoasegura.es`** | Hoy compites contigo mismo por tus propias consultas | Claude |
| 7 | **Reescribir el hero + página de hogar** | Cuando 1-6 estén en marcha y sepamos hacia dónde inclinar | Claude |
| 8 | ✅ **Página de RC profesional para fontaneros** (`/seguros/responsabilidad-civil-fontaneros`) | §2.6, 15/09 — el único hueco de SEO puro confirmado hoy: los grandes no lo venden, decide una persona, ticket ya conocido. Oficio elegido: ver nota abajo | Claude — **hecho, PR pendiente de mergear** |
| 9 | **Ads** | Con 48,37€ de comisión media, cualquier CAC de dos dígitos altos se come el primer año y el segundo. **No, todavía** | — |

**Lo que este orden dice, y no gusta:** de las nueve acciones, **cinco las tienes que hacer tú y
solo tres son de software** (la 9, Ads, no la lleva nadie: sigue aparcada). La web ya está hecha;
lo que falta es cartera y territorio.

🚨 **Por qué fontanero, y con qué confianza (15/09/2026):** Alberto delegó la elección («el oficio
que veas mejor, menos competencia») pidiendo antes si había un repo/conector que ayudara — **no lo
hay**: esto es investigación de mercado, no código, y la herramienta que daría la respuesta con
datos reales (volumen/CPC de Google Keyword Planner, SEMrush o Ahrefs) no está conectada a esta
sesión. Con `WebSearch` (SERP puntual, sin volumen) se comparó el número de sitios ESPECIALIZADOS
que ya compiten por la consulta en electricista (8), fontanero (6) y climatización/gas (7):
fontanero salió con menos, y comparte la misma obligación legal (REBT/RITE) que los otros dos —
manda a la persona a contratar rápido, sin depender de un comité. **[Suposición]**: la diferencia
de 6 contra 8 es una muestra de una sola búsqueda por oficio, no una medición de dificultad real;
si en unos meses (con Search Console dando datos) fontanero no acompaña, el mismo molde
(`lib/ramos.ts` de `apps/asegura-web`) sirve para electricista o climatización sin rehacer nada.

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

- **29/09/2026 (2ª pasada)** — §2.8 nuevo: Rastreator (RVU, ~1,2 M visitas/mes est.) y tablero de comparadores por SERP (Acierto, Rastreator, Kelisto, Check24, Arpem en liquidación, aseguradoras directas). Corregido §2.7: Acierto volvió a sus fundadores en dic/2024, ya no es de Bauer. Créditos de OpenSEO agotados a mitad: falta el desglose por secciones de Rastreator/Kelisto/Check24.
- **29/09/2026** — §2.7 nuevo: Acierto.com medido con OpenSEO (436k visitas/mes est., 41 % préstamos, hogar ~1 %; patrón copiable = fichas por compañía) y viabilidad del comparador: tarificador web de Avant2 existe pero cuesta 0,50 €/consulta; se recomienda comparador de GARANTÍAS sin precio, empezando por hogar. Proyectos y Seguros (J0067) resulta estar detrás de la OCU (tarificador en marca blanca), no de Acierto.
- **15/09/2026** — Alberto: «hay que estar abierto a todo, hay que buscar el hueco que dejan las
  grandes». Primera vez que esta sesión usa búsqueda web real (`WebSearch`, no el `Bash` sin
  salida de antes) → nueva etiqueta `[Web 15/09]`. Corrección: §2.3 «no hay comparador de
  comunidades» era falso (sí los hay). Confirmado: RC profesional de oficios (electricista,
  fontanero, instalador) es un hueco real de SEO — los comparadores grandes no lo venden, es
  obligatorio para el carné, decide una persona rápido (§2.6, nuevo). Mirado y descartado por
  ahora: seguro agrario/olivar (ya hay especialistas asentados). Adyacentes identificados para
  visita/relación (no SEO): ciberseguro pyme, seguro de accidentes de convenio, decenal de
  construcción, D&O de administradores. Acción nº 9 añadida al plan, pendiente de que Alberto
  valide el oficio antes de escribir contenido.
- **15/09/2026 (mismo día, 2ª pasada)** — Alberto delegó el oficio («el que veas mejor, menos
  competencia») y preguntó por un repo/conector: no existe ninguno para esto (es investigación de
  mercado, no código; sin Keyword Planner/SEMrush/Ahrefs conectados). Comparativa de SERP con
  `WebSearch` entre electricista/fontanero/climatización-gas → fontanero con menos sitios
  especialistas compitiendo (6 vs 8 y 7). Construida `/seguros/responsabilidad-civil-fontaneros`
  en `apps/asegura-web` (mismo molde `RAMOS`, sin ramo nuevo en BD), enlazada en el pie,
  formulario, sitemap, JSON-LD y mapa de consultas del cron SEO — todo verificado (105 tests +
  tsc en asegura-web, tests de `consultas.ts` en plataforma).
- **06/09/2026** — Documento creado. Mediciones nuevas de esta sesión: reparto de multi-póliza
  (57 auto-sin-hogar, 1,38 pólizas/cliente), concentración por entidad (Mapfre 58 %) y ventana de
  vencimientos (17 a 90 días). Las cifras de comisión se reutilizan del plan de marketing, no se
  recalculan.
