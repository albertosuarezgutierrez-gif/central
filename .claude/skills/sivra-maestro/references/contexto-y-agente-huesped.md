# SIVRA — router de contexto

> Esto es un **índice/puente**, no una copia. La fuente de verdad es
> `apps/sivra/CLAUDE.md` y los docs apuntados abajo. Si algo de aquí contradice
> al código o a `CLAUDE.md`, manda el código: corrige este router en el mismo commit.

> **⚠️ ESTADO (21/06/2026): la gestión INTERNA de sivra se consolidó (casi del todo) en `apps/plataforma`.**
> Finanzas, mensajería, limpiadoras, agente IA, el motor de pricing y **los crons de negocio** viven ya en
> **plataforma** (`/sivra/*`, `/api/sivra/*`; `apps/plataforma/vercel.json`). `apps/sivra/vercel.json`
> solo conserva **1 cron** (`/api/seo-refresh` semanal). **Para cualquier feature/fix interno → trabaja en `apps/plataforma`, NO aquí.**
> **Excepción (consolidación parcial):** `/api/pricing/aplicar-propuesta` y `/api/pricing/pisos-zona`
> —el raíl que usa el **agente de pricing** (skill `pricing-agente`)— **siguen SOLO en sivra**
> (`housesevillana.vercel.app`); no se portaron. Razón extra para no apagar sivra.
>
> **🚫 `apps/sivra` NO se borra (decisión de Alberto).** Se mantiene SOLO como **web pública de reserva
> directa de House Sevillana** (`housesevillana.es`/`.vercel.app`: landing multidioma `app/[locale]`, SEO
> `sitemap.ts`/`robots.ts`/schema), que **no está replicada en plataforma**. La "Fase 2 destructiva"
> (redirigir dominio, borrar app/proyecto Vercel/env `SIVRA_URL`) queda **CANCELADA**. Detalle en
> `apps/sivra/CLAUDE.md` y `docs/CONTEXTO-SESIONES.md`.
>
> **Limpiadoras reales = ialimp (Sique Brilla).** Verificado contra la BD (21/06/2026): las 16 limpiadoras
> y las 36 sesiones/90d son 100% de Sique Brilla SL. El `app/limpiadoras/` de sivra no tiene usuarias reales.

## Antes de tocar nada (gate obligatorio)
1. Lee `apps/sivra/CLAUDE.md` — reglas para no romper (se carga solo si trabajas en el dir).
2. Identifica el objetivo y en qué módulo cae (finanzas / pricing / limpiadoras / mensajería / IA).
3. Comprueba la **frontera de BD compartida** (abajo) antes de cualquier cambio de BD/RLS/buckets.
4. Si tocas SQL: verifica contra Supabase real, **no solo `tsc`** (la mayoría de tablas no están en Prisma).

## Dónde vive cada cosa
| Tema | Fuente |
|---|---|
| Reglas y gotchas del repo | `apps/sivra/CLAUDE.md` |
| Pricing dinámico (producto a vender) | `apps/sivra/docs/pricing-automatico.md` |
| Contabilidad — separación de cuentas (BBVA vs Kutxa, 3 pisos vs personal) | `apps/sivra/docs/contabilidad.md` |
| Seguridad de BD (qué se aplicó / qué se revirtió) | `apps/sivra/docs/auditoria-seguridad.md` |
| Estado vivo del proyecto | `docs/CONTEXTO-SESIONES.md` (entradas de arriba) |
| Estructura del monorepo | `MATRIZ.md` |

## Mapeo de IDs Booking.com ↔ propertyId Smoobu (CERRADO por Alberto, 26/08/2026)
| ID Booking.com | Anuncio en la extranet | propertyId Smoobu | Banco |
|---|---|---|---|
| 2888928 | Dúplex Center | `prop_duplex_center` | BBVA ****1175 |
| 4340072 | Luxury Busto Patio privado Centro | `prop_luxury_busto` | Kutxa ****0855 |
| 4771238 | Busto Reform Apartamento Centro Sevilla | `prop_busto_reform` | Kutxa ****0855 |
| 2039943 | HOUSE SEVILLANA 6 habitaciones | `prop_house_sevillana` | Kutxa ****0855 |

🚨 **`4340072` NO es Socorro.** Es *Luxury Busto*, y el «Socorro» que ponía aquí venía del NOMBRE
que sale en la factura, no del anuncio. El de House Sevillana (Socorro 24) es **`2039943`**, el que
acaba en **43**; el que acaba en **72** es Luxury. Coincide con `docs/BOOKING-DESCUENTOS-INVENTARIO.md`
y `docs/BOOKING-OFERTAS-INVENTARIO.md`, que ya lo tenían bien. Hay **cuatro** anuncios y **cuatro**
pisos: no falta ningún `prop_socorro_24`.

`PISOS_TURISTICOS` en `conciliacion-booking.ts` lista 3 propertyId a propósito (los de Kutxa; el
Dúplex va por BBVA y se concilia aparte) — no es un hueco. El `establishmentId` del PDF **solo se usa
como huella** (`booking:<id>`, `lib/agente-facturas/booking.ts`): ninguna comisión se imputa a un piso
a partir de él, así que este mapeo es para leerlo tú, no lo consume el código.
Las facturas de comisión de Booking llegan a primeros de mes para el mes anterior;
el agente de monitorización (`trig_012T62U4LsM27GP8VKnBFifG`, 3x/día) las detecta automáticamente en Drive.

## Agente de mensajería con huéspedes (Fase 1 — propone, Alberto aprueba)
Vive en **`apps/plataforma/lib/sivra/agente-huesped/*`** (NO en sivra). Responde mensajes de huéspedes de
Smoobu (Booking/Airbnb/directo, todos por igual). **Flujo:** sondeo `GET /api/sivra/mensajes/auto-reply`
(cron) + webhook en tiempo real (`/api/sivra/mensajes/webhook`) → `procesarMensajeHuesped` → `contexto.ts`
(ficha oficial de Smoobu) → `decidir.ts` → **propone por Telegram** con botones; Alberto da ✅ Enviar /
✏️ Modificar / 🔧 Retocar / "✅ Aprobar y a partir de ahora solas" (graduación). Aprende de OK/correcciones.
- **✏️ Modificar vs 🔧 Retocar (25/06/2026, PR #514):** *Modificar* (`hsp_edit`) reescribe el mensaje ENTERO
  (escribes el texto final). *Retocar* (`hsp_tune`) aplica una INSTRUCCIÓN corta sobre el borrador existente
  ("añade que la cafetera es italiana") vía `retoque.ts` (`aplicarRetoque`, IA sobre el borrador que ya está
  en el idioma del huésped → resultado en su idioma sin traducir aparte). El agente **aprende el par
  pregunta→respuesta** (`mensajes_pendientes_tg.pregunta` + `esperando_retoque`); el aprendizaje Q→A vale
  también para Modificar/aprobación (antes guardaba `pregunta=''`).
  - **Bucle de re-borrador (26/06/2026, PR pendiente):** Modificar y Retocar **YA NO envían directo**.
    Tras aplicar el cambio, el agente **re-propone** el texto FINAL (`reproponerBorrador` en `telegram-msg.ts`:
    en el idioma del huésped + `🔁` español para verificar) con botones ✅/✏️/🔧 y mantiene el pendiente;
    **solo el botón ✅ Enviar manda al huésped**. Así Alberto ve SIEMPRE lo que sale (incluida la traducción
    de su respuesta es→idioma del huésped) y puede **encadenar varias vueltas**. Decisión de Alberto.
- **Contexto del hilo (`decidir.ts` + `hilo.ts` — 26/06/2026):** antes de redactar, el agente
  recibe el **hilo de la conversación** (`hiloComoMensajes`: últimos 15 mensajes, ambos lados, huésped=user /
  anfitrión=assistant) como mensajes previos a `aiComplete`, además de ficha+guía+aprendizajes. Regla:
  "continúa la conversación, NO repitas lo ya dicho". Mejora también el auto-envío (mismo motor).
- **🔑 Respuesta en TEXTO PLANO, no JSON (`decidir.ts` — 26/06/2026, PR #547):** el agente genera el mensaje al
  huésped como texto plano (con el hilo como contexto → las reglas SIEMPRE se aplican) y deriva el escalado
  / sentimiento / `requiere_respuesta` APARTE, de REGLAS (`esSensible`, regex, `esCierre`) + un clasificador
  de **UNA palabra** (`ESCALAR/OK`, `debeEscalar`). **Por qué:** antes pedía un único JSON
  `{reply,confidence,needs_human,…}`; cuando el modelo gratis (Llama 3.3 70B) fallaba al emitir JSON (pasaba
  hasta con un "Hola"), caía a un fallback que IGNORABA todo el system prompt y soltaba texto crudo →
  borradores genéricos, sin contexto y sin reglas ("IA sin JSON — revisa el borrador"). Como TODAS las reglas
  (incl. el contexto del hilo de #535) vivían dentro del contrato JSON, un fallo de formato las anulaba → de
  ahí el "sigue sin tener contexto" de Alberto. Sin JSON ese fallo ya no puede vaciar el contexto. El
  guardrail anti-invención (`contieneDatoInventado`) sigue corriendo sobre el texto generado.
- **Modelo del agente (`decidir.ts` — 06/07/2026):** por defecto usa el modelo por defecto de la pasarela
  (`meta/llama-3.1-70b-instruct` desde el 22/08/2026 — `z-ai/glm-5.2` murió por EOL real el 21/08/2026;
  verificado en vivo con el prompt de huésped —, con su cadena NIM→Groq→Cerebras→Gemini→Kimi). **`AGENTE_HUESPED_MODEL` está VACÍO por
  defecto** (antes `meta/llama-3.1-405b-instruct`, que NVIDIA RETIRÓ de NIM → `HTTP 404` en CADA mensaje;
  enmascarado por el reintento con el modelo por defecto, hasta el día que ese también cayó → "IA no
  disponible" a un huésped). Si se quiere un modelo más capaz, poner en `AGENTE_HUESPED_MODEL` un id
  **verificado vivo en NIM**: si está puesto se intenta primero y es ADITIVO (si falla, reintenta con el
  por defecto; nunca deja sin respuesta).
- **Estilo de respuesta (`decidir.ts`, system prompt — 24/06/2026):** **REGLA DE ORO**: responde EXACTAMENTE
  a lo que el huésped dice y a nada más. NO añadir info no pedida (horarios entrada/salida, normas, parking,
  wifi…) salvo que pregunte o sea necesaria. Longitud **adaptada al mensaje**: agradecimiento/comentario
  positivo → 1-2 frases cálidas; pregunta real → el detalle necesario. Tono de persona real, no folleto.
  (Antes forzaba "4-6 frases" en TODA respuesta → rellenaba con horarios; lo detectó Alberto en el borrador
  a Patrycja. PR #505.)
- **Fase temporal (`decidir.ts` — 30/06/2026, PR #607):** el system prompt detecta en qué fase está la
  reserva comparando la fecha de hoy (hora Madrid) con `checkIn`/`checkOut`:
  - **Pre-llegada** (`hoy < checkIn`): "el huésped AÚN NO HA LLEGADO — oriéntale sobre acceso/hora de entrada".
  - **En-estancia** (`checkIn ≤ hoy ≤ checkOut`): "el huésped ya está dentro — NO repetir horarios salvo que pregunte".
  - **Post-estancia** (`hoy > checkOut`): "el huésped ya hizo CHECK-OUT — si agradece o se despide, responde
    con calidez agradeciendo que eligió el apartamento; NO menciones horarios ni info operativa".
  Antes estaba hardcodeado "ya está dentro" para TODAS las reservas → generaba borradores inapropiados
  (p.ej. "¡Disfruta tu estancia!" para un huésped que ya se había ido 2 días antes).
- **`horarios.ts` (fuente de verdad de horas):** Smoobu graba la hora de check-in POR RESERVA y queda
  desfasada → override por piso: **todos 15:00 salvo Busto Reform 13:00; salida 11:00**. Fallback a Smoobu
  si el piso no está en la tabla. Mantener esta tabla cuando cambien horarios.
- **Llegada tardía (`llegada.ts` — 06/08/2026):** la entrada es AUTÓNOMA → **no hay hora LÍMITE**: a partir
  de la hora oficial se puede llegar a cualquier hora, madrugada incluida. Lo que sí se avisa es que la
  **atención al huésped es 09:00–21:00** (`HORARIO_ATENCION`): quien llegue fuera de ese horario debe tener
  resueltas y a mano sus instrucciones de acceso antes de las 21:00. `bloqueLlegada()` va en la **`ficha`**
  (guardrail-safe, como parking/equipaje) y `esLlegadaFueraDeHorario()` (detector puro: horas del texto +
  marcadores nocturnos) activa un bloque extra del prompt en pre-llegada/día-llegada. **Por qué existe:** a
  Daniela (Luxury Busto) el agente le AUTO-ENVIÓ que «no podemos atender llegadas entre la 1:00 y las 2:00»
  y que se buscara un hotel la primera noche — se lo inventó porque la política de llegadas tardías no
  estaba en ninguna fuente y dedujo una hora de cierre inexistente a partir de la de entrada.
- **Early check-in (`disponibilidad.ts`):** es **GRATIS** pero SOLO si la **noche anterior está libre**
  (`nocheAnteriorLibre`; ojo a una reserva que sale el MISMO día → víspera ocupada). `contexto.ts` lo
  consulta en Smoobu (`earlyCheckinPosible`) y `decidir.ts` lo inyecta **SOLO en fase pre-llegada**
  (en-estancia y post-estancia lo omite). **Nunca se ofrece de pago.**
- **Late check-out (`disponibilidad.ts`/`decidir.ts` — 19/07/2026, PR #1015):** dejó de ser un "lo
  consulto y te digo" a ciegas — función espejo **`entradaMismoDiaLibre`** (¿entra otro huésped el
  MISMO día de la salida? si entra, hace falta turnover: limpieza + la siguiente entrada), consultada
  en Smoobu igual que el early check-in (`lateCheckoutPosible`/`lateCheckoutChequeado` en `contexto.ts`).
  **Escalaba SIEMPRE hasta el 20/08/2026** (`esSolicitudLateCheckout` de `reglas.ts` forzaba
  `needs_human=true`); desde el PR #1568 el agente auto-envía **solo la ventana gratuita** —ver la
  viñeta de `salida.ts`—: `escalaSalida = esSolicitudLateCheckout && !dentroDeLaVentana`, donde
  `dentroDeLaVentana` exige ocupación YA verificada (`lateCheckoutChequeado && lateCheckoutPosible`)
  **y** que el huésped no nombre una hora posterior a las 12:00 (`pideMasAllaDeLaVentana`). Todo lo
  demás sigue pasando por Alberto. Si toca declinar, el borrador sugiere la consigna de equipaje
  (`bloqueEquipaje`, ya en la ficha) como alternativa.
- **Matiz "firme solo el mismo día" (19/07/2026, PR #1015):** tanto early check-in como late check-out
  solo confirman EN FIRME si hoy es el día del hecho (llegada/salida respectivamente). Preguntado con
  antelación y sin conflicto detectado, el borrador matiza "en principio sí, se confirma ese mismo
  día" — una reserva de última hora puede ocupar el hueco entre la respuesta y el día en cuestión.
  Motivado por un caso real (Luxury Busto, huésped preguntó 5 días antes de la salida; el borrador
  antiguo decía "voy a consultarlo con el anfitrión" sin resolver nada). Detalle completo: spec
  `docs/superpowers/specs/2026-07-19-late-checkout-early-checkin-antelacion-design.md`.
- **Parking (`parking.ts` — 25/06/2026, PR #527):** los pisos NO tienen plaza propia disponible ("nuestro
  parking está ocupado"). Cuando el huésped pregunta por aparcamiento, el agente se disculpa y recomienda 4
  parkings públicos cercanos del centro con teléfono+web: **José Laguillo/AUSSA, Escuelas Pías, Imagen,
  Plaza de la Concordia/SABA**. La constante `PARKINGS_CERCANOS`+`bloqueParking()` se inyecta en la **`ficha`**
  (`contexto.ts`), NO solo en el prompt: así el guardrail anti-invención (`contieneDatoInventado`, valida
  teléfonos/URLs contra las fuentes) NO escala a humano. `parking` ya está en la allowlist de graduación →
  auto-enviable. Si cambian los parkings/teléfonos, edita `parking.ts`.
- **Equipaje/consigna (`equipaje.ts` — 26/06/2026, PR #538 + por-zona):** MISMO patrón que el parking. El piso
  NO tiene servicio de consigna/guardado de maletas; cuando preguntan dónde dejar/guardar las maletas, el agente
  se disculpa y recomienda consignas cercanas. **`bloqueEquipaje(propertyId)` es POR ZONA:** redes para todos
  (`CONSIGNAS_RED`: Radical Storage, Bounce, LOCK & enjoy!) **+ punto/s físico/s 24/7 de la zona del piso, el más
  cercano primero** (`CONSIGNA_POR_ZONA` ahora es `Consigna[]` por zona / `zonaDePiso`): zona **busto** (House
  Sevillana=C/ Socorro 24, Busto Reform y Luxury Busto=C/ Bustos Tavera, todos 41003) → *Lock & Explore – Castellar*
  (C/ Castellar 60A, el MÁS CERCANO) y, como alternativa, *Locker in the City – Alfalfa*; zona **duplex** (Dúplex
  Center=Pasaje Villasís 1 = Pasaje Francisco Molina 4, dos accesos del mismo piso; zona La Campana / C. Martín Villa) → *Locker in the City – Plaza del Duque*. Los 4 son
  41003 (junto a Encarnación/Las Setas), a minutos entre sí. Inyectado en la **`ficha`** (`contexto.ts`, pasa `propertyId`),
  guardrail-safe. Categoría `equipaje` en `reglas.ts::detectCategory` **ANTES que checkout** (porque "dejar las
  maletas" contiene "dejar" = patrón de checkout) y en la allowlist de graduación.
  **Desde el 20/08/2026 la consigna es el PLAN B, no la primera respuesta:** si preguntan por las maletas
  el DÍA DE SALIDA y el piso queda libre, la respuesta buena es que se queden hasta las 12:00 (ver `salida.ts`);
  `equipaje.ts` se consulta después de mirar la salida.
- **Salida y maletas el último día (`salida.ts` — 20/08/2026, PR #1568):** política dictada por Alberto.
  Consigna como servicio NO hay, **pero el día de salida, si ese día no entra nadie, pueden quedarse en el
  apartamento hasta las `SALIDA_FLEX_HASTA` = 12:00 SIN COSTE**, equipaje dentro incluido. Más tarde también
  se puede, pero hay que reorganizar a la empresa de limpieza y **tiene coste según la hora**: el agente lo
  OFRECE, **nunca da un precio** y lo consulta con Alberto (hay un test que vigila que ningún bloque lleve
  importes). `bloqueSalida()` va a la **ficha** (fuente de verdad + guardrail-safe, como parking/equipaje) e
  incluye además **llaves al salir** (`llavesAlSalir`: Dúplex → dentro, en la mesa alta de la cocina; el resto
  → donde se recogieron) y **tareas al marcharse** (`TAREAS_AL_SALIR`: aire y luces, ventanas, basura, avisar
  por mensaje — y nada más). `bloqueSalidaTardia()` va al prompt con los **tres estados de siempre**
  (verificado y libre / verificado y ocupado / sin verificar). **Antes de ENTRAR es distinto:** con la noche
  anterior ocupada no se puede dejar el equipaje dentro → consigna hasta la hora de entrada. Lo confirma el
  histórico de Smoobu (26/07/2026, a Manuel: «puedes salir a las 12:00, no entra nadie después de ti»).
- **Cierre coherente con la fase (`cierre.ts` — 20/08/2026, PR #1568):** a Pilar, **en plena estancia**, el
  agente le auto-envió una respuesta correcta cerrada con «¡Que tengas un buen viaje!». `bloqueCierre(fase,
  esDiaSalida)` fija la regla en el prompt (viaje solo si viene o se va; despedida final solo el día de salida
  o después; en mitad de la estancia, que disfrute de Sevilla) y `revisarCierre()` es la red determinista sobre
  el borrador: **si la fórmula va aislada en su frase se poda** y el mensaje sale igual; si va entretejida con
  contenido real NO se reescribe y el mensaje pasa por Alberto (`cierreFueraDeFase` → `needs_human`).
- **Coherencia apertura↔respuesta (`coherencia.ts` — 20/08/2026, PR #1568):** el mismo mensaje abría con
  «¡claro que sí!» y dos líneas después negaba la consigna y la mandaba a taquillas de fuera; la primera línea
  es lo único que se ve en la notificación del móvil. `REGLA_COHERENCIA` va en el prompt (se empieza por lo que
  hay de verdad, sin concesión delante) y `revisarCoherencia(reply)` caza el patrón y **escala**: aquí **no se
  poda**, porque reescribir la apertura recoloca el mensaje entero — eso lo hace Alberto.
- **Idioma:** al huésped se le responde SIEMPRE en su idioma; a Alberto (Telegram) se le traduce al español
  con línea **🔁** (pregunta + borrador). Si Alberto **modifica**, escribe en español y se traduce al idioma
  del huésped antes de enviar (`mensajes_pendientes_tg.idioma`). **(29/08/2026, pedido por Alberto):** la 🔁
  del mensaje del huésped se decide por el TEXTO (`necesitaTraduccionPregunta` en `reglas.ts`, no solo por
  `ctx.lang`, que hereda el idioma de la reserva si el mensaje no da señal), aplica también a la copia
  informativa de auto-envíos (`avisarAutoEnviado`), y un fallo de traducción con idioma ≠ es se DECLARA
  («no he podido traducirlo al español») en vez de omitir la línea en silencio.
- **Idempotencia:** `claveDedup` + `claimMensaje` (atómico) → no reprocesa/duplica entre sondeo y webhook.
- **🚨 La «graduación por categorías» YA NO EXISTE (verificado en el código el 28/08/2026).** Este
  apartado decía que había una allowlist en `graduacion.ts` y que «quejas/dinero/cambios NUNCA se
  auto-envían». **Las dos cosas eran falsas:** `graduacion.ts` no existe —desde el 20/08/2026 el
  criterio de `orquestador.ts` es `autoCortesia || autoApoyada`, donde `autoApoyada` = la respuesta
  está `apoyada_en_fuente`— y `sensibilidad.ts` tiene regex de queja, avería, cancelación, reembolso
  y emergencia pero **ninguna de dinero, precio, pagar o cobrar**. Por eso los 20€ de la cuna salían
  del texto libre de la guía sin pasar por ningún filtro de dinero. Lo que hay HOY sobre dinero:
  - **El precio de un extra sale del catálogo `sivra_extras_catalogo`, nunca de la IA.** Guardrail en
    `orquestador.ts` (`importeSospechoso` de `extras.ts`): un borrador con una cifra en euros que no
    esté en el catálogo del piso pasa a `needs_human` y va a Telegram.
  - **Guardrail del PAGO (29/08/2026, dictado por Alberto — caso Raquel):** coordinar un cobro (cómo
    pagar, método, datos bancarios) **NUNCA sale solo**, ni con el importe del catálogo ni apoyado en
    fuente. `hablaDePago()` de `extras.ts` (5 idiomas: pagar/cobrar, Bizum, transferencia, IBAN,
    efectivo…) se aplica en `orquestador.ts` a la PREGUNTA y al BORRADOR → `needs_human`. El agente
    llegó a auto-enviar «transferencia bancaria o Bizum. Te envío los datos por mensaje privado» —
    métodos y promesa inventados (el único cobro real es el enlace de Stripe). El único camino que
    habla de pago sin Alberto sigue siendo `cobro-auto.ts` (paso 1-bis, corta antes del borrador).
  - **Enlace de pago automático, y ATADO POR CÓDIGO** (`lib/sivra/extras/cobro-auto.ts`, decisión de
    Alberto del 28/08/2026, que a sabiendas rompe la regla vieja). Exige las tres a la vez: fila
    `ofrecido` en `sivra_extras_reserva` —creada SOLO por el botón ✅ de Telegram sobre un borrador
    que cotiza el precio del catálogo—, `esAceptacion(mensaje)` limpia, e importe del catálogo.
    Regatear, pedir dos cunas o preguntar por pagar en efectivo NO son aceptaciones y siguen yendo a
    Telegram. Alberto recibe copia de todo lo que sale.
  - **Pago → aviso a la limpieza.** Webhook `/api/sivra/extras/webhook` (idempotente por
    `payment_intent`) → email a Sique Brilla (`limpiezascruzz@gmail.com`) desde `hola@ialimp.es` con
    Reply-To al Gmail de Alberto. Si el email falla se guarda el motivo y salta Telegram: un extra
    cobrado con la cuna sin montar y nadie enterado es el fallo caro de este repo.
  - **Impago:** cron `sivra-extras-impago` (07:00 UTC) — recordatorio a las 24 h, caducidad a 48 h de
    la entrada. Sin fecha de entrada legible NO se caduca nunca (`decidirImpago`, testeado).
  - **🧹 ORDEN A LA LIMPIEZA, SIN COBRO DE POR MEDIO (01/09/2026, PR #1991).** Todo lo de arriba
    cuelga de Stripe, así que **un extra pagado FUERA de ese raíl no avisa a nadie**: el 01/09 Raquel
    (reserva 152490601) pagó la cuna por **Bizum**, la fila se quedó congelada en `ofrecido` —el cron
    de impago solo mira `enlace_enviado`, así que ni se recuerda ni se caduca ni suena— y Sique
    Brilla no se enteró. Dictado de Alberto ese día: **la orden NO lleva estado de cobro** («no quede
    fija, pagado ni confirmar ni nada, sino simplemente como una orden, colocar cuna, y ya está»).
    - Botón **🧹 Mandar orden** en Telegram (`hsp_clean:<booking>:<codigo>` / `hsp_noclean`), ofrecido
      tras el ✅ Enviar de un mensaje que hable de un extra del catálogo con `avisa_limpieza`.
      🚨 Se resuelve **ANTES de buscar el borrador pendiente** en el webhook: para cuando se ofrece,
      el ✅ ya ha borrado esa fila. No se repite si la orden ya salió (`ordenYaEnviada`).
    - `lib/sivra/extras/orden-texto.ts` (PURO, testeado) compone el email: **sin importe y sin la
      palabra «pagado»** — hay un test que lo fija. El hermano `aviso-limpieza.ts` sí lo dice porque
      lo dispara el webhook, que HA visto el cobro; esta ruta no ha visto ninguno.
      `orden-limpieza.ts` envía (mismo destino/copia) y registra en **`sivra_ordenes_limpieza`**.
    - **Tres estados:** sin fila / `[]` = no se ha pedido nada · `null` = **no se ha podido leer** ·
      `enviado_at` NULL + `error` = se intentó y NO salió (manda sobre las enviadas en el titular, y
      salta Telegram). Si `construirContexto` falla al pulsar el botón NO se manda una orden a
      medias: se dice y la manda Alberto a mano.
    - Las órdenes ENVIADAS viajan al `Contexto` (`ordenesLimpieza`) y al prompt de `decidir.ts`, y se
      pintan como chip en la ficha de `/sivra/mensajes`. Antes de esto el agente no sabía que había
      una cuna encargada y volvía a escalar «¿está confirmado lo de la cuna?» como si fuera nuevo.
    - **Lo que NO existe (decisión suya, no un olvido):** un raíl para que el cobro por Bizum conste
      en algún sitio. Esos 20€ no dejan rastro en `sivra_extras_reserva` ni en ningún ingreso.
- **Auto-envío de CORTESÍA de fin de estancia (26/07/2026, rama `claude/automatic-guest-message-q6wzol`):**
  las **despedidas / agradecimientos / cierres puros** ("ya hemos dejado el Dúplex", "gracias por todo",
  "everything was perfect"…) se auto-envían **sin depender del contador de graduación por categoría** — son
  respuestas "siempre iguales" y de riesgo mínimo. Piezas: `reglas.ts::esDespedida()` (detector puro
  ES/EN/FR/DE/IT, más amplio que `esCierre`), `decidir.ts` expone `Decision.es_cortesia = esCierre ||
  esDespedida`, y el orquestador hace `puedeAuto = autoCortesia || autoGraduado`. **Guardas comunes** (valen
  para AMBAS vías): `!needs_human && reply && sentimiento!=='negativo'` → nada sensible/negativo/con dato
  inventado/escalado por la IA se auto-envía (se sigue proponiendo). Decisión de Alberto. Antes un cierre puro
  (`requiere_respuesta=false`) se PROPONÍA siempre; ahora entra por la vía de cortesía.
- **maxDuration = 300** en `auto-reply` y `webhook` (decisión + 2 traducciones en `Promise.all`; con 60s daba 504).
- Sin asunto fijo (`enviarAlHuesped` no manda "Re: tu estancia"). Detalle vivo en `docs/CONTEXTO-SESIONES.md`.

## Mensajes PROGRAMADOS a huéspedes (31/08/2026 — sustituto de los automáticos de Smoobu)
Ciclo de reserva NUESTRO (confirmación → acceso a 7 días → víspera con códigos → bienvenida →
estancia → víspera de salida → post-salida), cron `/api/sivra/mensajes/programados` cada 30 min
(`CRON_JOBS`). Interruptor por piso en `mensajes_prog_pisos` (fila ausente/`activo=false` = MODO
SOMBRA → todo va a Telegram, nada al huésped).
🚨 **Desde el 05/09/2026 los CUATRO pisos están activos y las plantillas de Smoobu están APAGADAS**
(decisión de Alberto tras validar el ciclo entero en House Sevillana): este cron es el ÚNICO que
habla con el huésped en los hitos del ciclo. Consecuencias, las dos medidas ese día:
- El chequeo «¿ya lo mandó Smoobu?» (`equivalentes-smoobu.ts`) **se retiró**. Era andamio de la
  transición y, sin plantillas al otro lado, solo podía silenciar mensajes NUESTROS: su regex
  `/BIENVENIDO/i` casa con nuestra propia plantilla («¡Bienvenido/a, …»), y de hecho se tragó la
  bienvenida de la reserva 154265696. Además costaba una llamada a la API de Smoobu por reserva y pasada.
- 🚨 **Una fila en `sombra` YA NO bloquea el envío real** (`hitosBloqueantes` en `decidir.ts`, y el
  reclamo del orquestador la reclama con `ON CONFLICT DO UPDATE ... WHERE estado='sombra'`). Antes
  `cargarYaHechos` no miraba el estado, así que un hito generado mientras el piso validaba quedaba
  «hecho» para siempre y el huésped no lo recibía nunca. **Caso fundacional (05/09/2026):** la
  víspera CON LOS CÓDIGOS de la reserva 154265696 (Luxury Busto, llegada ese mismo día) se generó en
  sombra a las 09:37 del 04/09 y el piso se activó a las 21:34 — 12 horas después. En sombra sigue
  bloqueando, o Telegram repetiría el mismo borrador en cada pasada.
- Fuente única de acceso: **`lib/sivra/acceso.ts`** (dirección, pasos, fotos, mapas; Dúplex: llaves
  FUERA, en Javier Lasso de la Vega 7). **Los códigos NO están en el repo**: tabla
  `sivra_codigos_acceso` (BD, rotable; NULL = se declara, no se inventa).
  🚨 **En el Dúplex las fotos van DENTRO del paso que ilustran, no amontonadas al final** (recogida
  de llaves y apartamento son DOS sitios distintos, y una foto suelta confunde más que ayuda), y el
  texto explica lo que enseña cada una — incluidos los rótulos pintados sobre el Street View
  («ENTRADA EN CASO DE ESTAR CERRADA», «LLAVES»). Las 5 se verificaron mirándolas el 31/08/2026 y dos
  estaban en el paso equivocado. **Al tocar una foto de instrucciones, ábrela**: el nombre del
  fichero del CDN de Smoobu no dice qué hay dentro.
- Plantillas deterministas (`lib/sivra/mensajes-prog/plantillas.ts`), texto plano primero (sirve
  offline y lo puede leer el operador del portal); códigos en DOS tiempos (proceso a 7 días,
  códigos en víspera); cada mensaje termina con la pregunta de su fase (la respuesta la absorbe el
  agente normal). Traducción por IA con guarda `conservaDatos` (un código mutado → sale en español).
- Dedupe: `mensajes_programados` UNIQUE (booking, tipo, fecha_objetivo); reintentos si Smoobu cae.
  Latido `sivra_mensajes_prog`. Plan/diseño: `docs/superpowers/plans/2026-08-31-mensajes-programados-huespedes.md`.
- PENDIENTE: **la parte de CUNA de «avisar a Sique Brilla» está HECHA** (PR #1991, ver el bloque
  🧹 de arriba: botón en Telegram + `sivra_ordenes_limpieza`); siguen sin cubrir **horas/late
  checkout** y el aviso por la **intranet** de Vanesa (hoy solo email). Rotación de código tras
  cancelación expuesta → tarea a Vanesa; vigía SLA de pendientes.
