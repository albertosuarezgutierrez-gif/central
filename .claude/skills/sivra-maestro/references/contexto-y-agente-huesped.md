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
  del huésped antes de enviar (`mensajes_pendientes_tg.idioma`).
- **Idempotencia:** `claveDedup` + `claimMensaje` (atómico) → no reprocesa/duplica entre sondeo y webhook.
- **Graduación:** solo categorías básicas (`graduacion.ts` allowlist: wifi/acceso/checkin/checkout/parking/
  normas/contacto/faq); quejas/dinero/cambios NUNCA se auto-envían.
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
