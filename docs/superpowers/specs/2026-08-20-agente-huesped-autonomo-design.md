# Agente de huéspedes autónomo — leer la guía real y aprender de lo que ya se contestó

> Fecha: 20/08/2026 · Vertical: SIVRA (código en `apps/plataforma/lib/sivra/agente-huesped/`)
> Decisión de Alberto: el agente debe resolver solo; cuando no sepa algo, lo pregunta, se le enseña y lo aprende.

## 1. Problema

El agente responde a los huéspedes **sin ninguna fuente de información de la vivienda**. La `ficha`
que se le pasa sale de la API normal de Smoobu (dirección, horas, aforo, amenities) y la `guia` es
siempre `null`: `mensajes_guia_cache` tiene **0 filas** para todos los pisos desde que existe.
`guia.ts` intentaba descargar el `guest-app-url` como HTML, pero la guest app de Smoobu es una SPA
de React: devuelve 2.848 bytes sin texto útil, se descarta por el umbral de 400 caracteres y se
trata como "sin guía".

Consecuencia medida en producción:

- **20/08/2026, Dúplex Center, reserva 152291091 (Samy).** El huésped escribe «Where is the address
  exactly? I am in plaza villasis now i dont find». El agente redacta dos rutas a pie **distintas y
  ambas inventadas** (una por Calle San Vicente, a 1 km; otra por Calle Trajano, con un «edificio
  blanco con puerta negra» que no existe en ninguna fuente) y le escribe al huésped el marcador
  literal `[lien d'accès]`. Alberto acaba contestando a mano: «Entre en el enlace enviado 4 veces,
  tiene toda la información». La respuesta correcta llevaba meses escrita en la guía: la sección
  `KEYS - DUPLEX` avisa de que **es zona restringida y no se debe usar Google Maps ni GPS**, e
  incluye vídeo explicativo.
- **06/08/2026, Luxury Busto (Daniela).** El agente **auto-envió** «you'll be able to access the
  apartment yourself using the secure keybox or digital access instructions». Se lo inventó.
- **24/06/2026, Busto Reform (Patrycja).** «we use a buzzer/wire…». Inventado también.

Además, lo que Alberto le enseña **no se queda**: `mensajes_aprendizaje` tiene 25 filas, 20 de ellas
cortesías («de nada», «gracias a ti»). El único hecho real enseñado —*las llaves se dejan en la mesa
alta de la cocina*, 20/07/2026— se guardó como respuesta entera de la categoría `checkout` y, como
solo se inyectan **las 8 últimas filas del piso**, ya está sepultado bajo los «gracias».

## 2. Objetivo y criterios de éxito

El agente resuelve solo las preguntas cuya respuesta existe en la guía o en la ficha de la reserva.
Cuando no existe, **no improvisa**: escala diciendo qué le falta, Alberto se lo enseña y ese hecho
queda disponible para siempre.

Se considera conseguido cuando:

1. Ninguna respuesta enviada contiene datos de acceso, rutas o servicios que no estén en una fuente.
2. Una pregunta cubierta por la guía (llaves, wifi, normas, basura, azotea) se contesta **sin pasar
   por Telegram**.
3. Una pregunta no cubierta llega a Telegram **nombrando el hueco**, y la respuesta de Alberto queda
   guardada como hecho del piso, no como una cortesía más.
4. El agente nunca afirma «no hay guía» cuando lo que pasa es que no pudo leerla.

## 3. Hallazgo técnico: la guest app tiene API JSON

Verificado en vivo el 20/08/2026 contra la reserva 152291091. El `guest-app-url` que Smoobu manda al
huésped tiene la forma `https://guest.smoobu.com/?t={token}&b={bookingId}`. El bundle de la SPA
(`/static/js/main.*.js`) fija `baseURL = https://login.smoobu.com/api-guest` y manda el token como
parámetro (`axios.defaults.params = { token }`). De ahí salen dos endpoints, **sin API key y sin
navegador**:

| Endpoint | Devuelve |
|---|---|
| `GET /api-guest/bookings/{bookingId}?token={token}` | Ficha de la reserva: dirección postal completa, `checkIn`/`checkOut` reales, lat/lng, canal, `onlineCheckInUrl`, huésped, adultos/niños |
| `GET /api-guest/bookings/{bookingId}/contents?token={token}` | La guía en secciones: `[{ id, title, content (HTML), displayTimePeriods, icon, active }]` |

Para el Dúplex son 10 secciones (13 KB): `KEYS - DUPLEX` (2.705 caracteres, con la calle, el aviso de
zona restringida y el vídeo), `WIFI (DUPLEX)`, `RULES`, `PARKING`, `AZOTEA / ROOFTOP`,
`CHECK-IN OBLIGATORIO`, `LEAVE THE BAGS`, `WHERE TO DISPOSE OF THE GARBAGE?`, `MEJORES BARES`,
`¿QUÉ HACER EN SEVILLA?`.

`displayTimePeriods` es un conjunto de marcas de cuándo la propia guest app enseña la sección
(`[2,4]` = antes de llegar y durante la estancia; `[2,4,8]` = también después del check-out).

## 4. Arquitectura: tres capas con precedencia explícita

De más fuerte a más débil:

1. **Overrides de negocio** — `parking.ts`, `equipaje.ts`, `llegada.ts`, `horarios.ts`. Son política
   de Alberto y **ganan siempre**, aunque la guía diga lo contrario.
2. **Guía de la guest app** — las secciones vigentes de la reserva.
3. **Ficha de la reserva** — dirección, horas, aforo, amenities.

La precedencia es necesaria porque hoy ya hay un conflicto real: la guía y la plantilla «Booking
Confirmation» **prometen un aparcamiento** («Plaza San Juan de la Palma nº 5, 20 €/día, consultar
disponibilidad») que según Alberto **ya no existe**. El override de `parking.ts` (parking ocupado +
parkings públicos cercanos) sigue siendo la verdad.

**Detector de conflictos:** cuando la guía traiga una sección de un tema que pisamos con un override,
se avisa **una vez** por Telegram (con el id de sección para poder editarla en Smoobu) en lugar de
resolverlo en silencio. Este aviso es la pieza que habría cazado el conflicto del parking meses
antes de que un huésped lo notara.

## 5. Componentes

| Archivo | Cambio |
|---|---|
| `guia.ts` | Deja de bajar HTML. Extrae `t`/`b` del `guest-app-url`, llama a los dos endpoints y devuelve **secciones estructuradas**, no un churro de texto. |
| `guia-secciones.ts` (nuevo, puro) | Clasifica cada sección (`acceso` / `normal`), decide vigencia por `displayTimePeriods` + ventana de 7 días, y renderiza a texto para el prompt. |
| `contexto.ts` | Consume las secciones; añade `guiaCargada: boolean` para distinguir «no hay» de «no se pudo leer». |
| `hilo.ts` | Deduplica automáticos, conserva enlaces y prioriza mensajes del huésped. |
| `decidir.ts` | Nueva regla de autonomía y bloque de guía en el prompt. |
| `hechos.ts` (nuevo) | Hechos permanentes por piso, separados de los ejemplos de estilo. |
| `historico.ts` (nuevo) | Minería de conversaciones pasadas (§9). |
| `mensajes_guia_cache` | Pasa a guardar las secciones en JSON. TTL 24 h + refresco a la orden. |

## 6. Reglas de revelación

**Ventana de 7 días para todo lo que sea acceso.** Política de Alberto: las claves se dan una semana
antes de la llegada, con recordatorios, porque un huésped puede reservar y cancelar después. Las
secciones clasificadas como `acceso` (llaves, códigos, caja de llaves, PIN, vídeo de entrada) solo
se revelan **desde 7 días antes de la llegada hasta el check-out**.

Fuera de esa ventana el agente **no se calla ni improvisa**: responde lo que ya promete la plantilla
de confirmación de Smoobu —«una semana antes de su llegada le enviaremos toda la información para
recoger las llaves»—, que es una fuente real y por tanto auto-enviable.

El resto de secciones siguen el criterio de `displayTimePeriods` de Smoobu, sin ventana propia.

La clasificación `acceso`/`normal` vive en un **helper puro y testeado**, por título y contenido, y
**ante la duda clasifica como `acceso`** (no revelar). Nunca incrustada en el prompt ni en el JSX.

No entran al prompt: el campo `notice` de Booking, el precio, el depósito, ni el teléfono o email del
huésped. No hacen falta para responder y son datos personales.

## 7. Autonomía

Sustituye a la graduación por categorías (`graduacion.ts`, hoy con `checkin` como única categoría
graduada):

- La respuesta **se apoya en la guía o en la ficha** → se envía sola.
- **No está en ninguna fuente** → no improvisa: propone por Telegram **nombrando el hueco** («no sé
  dónde se deja la basura en Luxury Busto»), y la respuesta de Alberto se guarda como hecho del piso.
- Guardas que se mantienen intactas: no se auto-envía nada con `needs_human`, sentimiento negativo,
  dato inventado o materia sensible (dinero, quejas, cambios de reserva).
- **Si la guía no se pudo leer, no se auto-envía nada.** `guiaCargada = false` significa «no lo sé
  todavía», nunca «no está en la guía», y la autonomía se apoya justo en esa distinción.

## 8. Aprendizaje que no se cae

`mensajes_aprendizaje` se parte en dos usos:

- **Hechos del piso** — permanentes, **todos** al prompt, con su fuente y su fecha. Son afirmaciones
  sobre la vivienda («las llaves se dejan en la mesa alta de la cocina»).
- **Ejemplos de estilo** — cortesías y tono, que siguen limitados a las últimas N por piso.

Cuando Alberto corrige o enseña por Telegram, se decide en cuál de los dos cajones cae en vez de
meterlo todo en el mismo montón. Un hecho puede además proponerse para subirlo a la guía de Smoobu,
para que deje de vivir solo en nuestra base de datos.

## 9. Aprender del histórico

Hay **159 reservas en lo que va de 2026**, cada una con su hilo, y en esos hilos están las respuestas
que Alberto ha dado a mano durante meses. Una pasada de minería recorre los hilos cerrados, empareja
pregunta del huésped → respuesta del anfitrión y propone hechos por piso.

Reglas de la pasada:

- Solo mensajes atribuidos al **host** que no salieran del propio agente (`mensajes_log`).
- Descarta cortesías y saludos: interesan afirmaciones sobre la vivienda.
- **Los hechos extraídos no entran directos**: se proponen a Alberto en lotes por Telegram y él
  confirma. Un hecho falso aprendido del histórico se propagaría a todos los huéspedes futuros.
- Es un proceso que se lanza a mano, no un cron: se corre una vez para sembrar y luego cuando
  interese.

## 10. Errores y degradación

- Fallo de red o token caducado → `guiaCargada = false`, se usa la caché anterior si existe y **se
  escala** en vez de afirmar ausencias.
- La caché guarda `fetched_at`; una guía vieja se sigue usando, pero el aviso de fallo se registra.
- Un `catch` que devuelva `[]` **no autoriza** a decir «no hay esa sección» aguas abajo.

## 11. Arreglos del hilo (mismo PR)

- Leer `htmlMessage` para **conservar los enlaces**: hoy `contexto.ts` lee `message`, que trae los
  «AQUÍ» pelados, y por eso el agente escribió `[lien d'accès]` teniendo el enlace en el hilo.
- **Deduplicar los automáticos de Smoobu**: cada aviso sale por duplicado (8 de los 25 mensajes del
  hilo de Samy) y ocupa las 15 ranuras de contexto.
- Subir la ventana del hilo y priorizar mensajes del huésped sobre los automáticos.
- Cazar el caso «Ok je suis ici», que hoy se quedó sin respuesta.

## 12. Pruebas

- Helpers puros con `node --test`: parseo de `t`/`b` del `guest-app-url`, clasificación
  `acceso`/`normal`, ventana de 7 días, vigencia por `displayTimePeriods`, precedencia de capas,
  dedup del hilo.
- **Un test contra la respuesta real capturada de `/contents`**, no solo contra fixtures escritos por
  nosotros: los fixtures se escriben con la misma suposición equivocada que el código.
- Caso de regresión explícito: reserva del Dúplex + pregunta por la dirección debe producir el aviso
  de zona restringida, nunca una ruta a pie inventada.

## 13. Fuera de alcance

- **Vender y cobrar el parking** (fase 2, pedido por Alberto el 20/08/2026).
- Corregir la sección `PARKING` (id 270749) y la plantilla «Booking Confirmation» en Smoobu: es
  edición en Smoobu, no código, y la hace Alberto.
- Cualquier escritura en la guest app: aquí solo se lee.

## 14. Riesgos

- **La guía contiene claves reales.** Se mitiga con la ventana de 7 días, el filtro por vigencia y
  que el hilo es por definición el de esa reserva. No se cachea nada fuera de nuestra BD.
- **Más autonomía = errores que salen sin revisar.** Se mitiga con la regla de que solo se auto-envía
  lo que se apoya en una fuente, y con que un fallo de lectura bloquea el auto-envío.
- **El histórico puede enseñar cosas caducadas.** Por eso los hechos minados se confirman antes de
  entrar.

## 15. Orden de implementación

Alberto pidió ir viendo resultados, así que se entrega por trozos verificables, no de golpe:

1. **Leer la guía** (§3, §5, §10) + arreglos del hilo (§11). Sin tocar todavía la autonomía: el
   agente sigue proponiendo por Telegram, pero ya con la guía delante. Aquí se ve enseguida si los
   borradores dejan de inventar.
2. **Reglas de revelación** (§6) y **detector de conflictos** (§4).
3. **Autonomía** (§7). Es el paso que deja de pedir permiso, y va después de comprobar en el paso 1
   que los borradores son fiables.
4. **Hechos permanentes** (§8).
5. **Minería del histórico** (§9), ya con los hechos funcionando.
