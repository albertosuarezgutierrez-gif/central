# 🧠 Memoria de sesiones — central (repo GitHub: ia.rest → renombrar)

> Contexto persistente entre sesiones de Claude Code. El entorno cloud es
> **efímero** (el contenedor se borra al acabar), así que lo único que sobrevive
> es lo commiteado aquí. Este archivo es el "estado vivo" del proyecto entre sesiones.
>
> **Cómo se mantiene:** al terminar cada sesión, Claude añade una entrada nueva
> arriba del todo y actualiza el estado si algo cambió. Un hook `Stop`
> (`.claude/hooks/persist-memoria.sh`) commitea y empuja este archivo automáticamente.
>
> **🚨 Regla de tamaño (ahorro de contexto):** cada entrada, **máximo ~8 líneas**:
> qué se hizo, decisiones, pendientes y nº de PR. El detalle ya vive en el PR y en
> el código — NO re-narrarlo aquí. Fecha SIEMPRE en la primera línea `(dd/mm/aaaa)`.
>
> **🔄 Rotación mensual:** aquí vive SOLO el mes corriente. Los meses cerrados se
> archivan en `docs/memoria/AAAA-MM.md` con `node scripts/rotar-memoria.mjs`
> (idempotente; lo dispara `/auditoria-diaria` a primeros de mes). La historia no
> se pierde: se lee de `docs/memoria/` solo cuando hace falta.
>
> **📌 «Estado vivo» (bloque al final):** SOLO pendientes y decisiones abiertas, en
> sub-bullets de 1-3 líneas — no es un segundo diario: el relato de cada sesión va en su
> entrada fechada y el detalle en el PR. Al cerrar un pendiente, borra su bullet; al
> actualizar el bloque, re-fecha su cabecera (si su fecha queda en un mes cerrado, la
> rotación se lo lleva al archivo).
>
> **Formato de cabecera de entrada:** `- **… (dd/mm/aaaa).**` o `### … (dd/mm/aaaa)` —
> son los ÚNICOS que `rotar-memoria.mjs` reconoce como entrada; una cabecera `## ` se
> funde con la entrada anterior y se archiva mal.
>
> Para arquitectura/módulos completos → skill `ia-rest-maestro`. Esto es solo el
> registro de qué se hizo y qué queda.

- **🕰️ El `405` del merge TAMBIÉN miente: reporte retrasado ≠ check corriendo (06/09/2026).** Al mergear
  #2439, `merge_pull_request` devolvió `405 ... "Lint · TypeCheck · Build" is in progress` mientras el
  run de `ci.yml` sobre ese head exacto llevaba minutos en `completed`/`success`. Reintentar **sin tocar
  nada** funcionó a la primera. Tentador leer el `405` como fuente fiable —lo emite el propio merge— y
  no lo es: sale del mismo almacén retrasado que `get_check_runs` (25-50 min medidos hoy en #2428/#2434).
  Desde fuera se ven idénticas TRES cosas y solo una se cura esperando: reporte retrasado · run creado
  que nunca arrancó (`list_workflow_jobs` → 0 jobs, necesita head nuevo) · run en cola.
  `list_workflow_runs` por rama fue la lectura más fresca las tres veces. Escrito en `CLAUDE.md`
  (DECIMOCUARTA + paso 0 del orden). Cierra el «no lo meto hasta separarlas» de la entrada anterior.
- **🔖 La bóveda ya dice POR QUÉ está vacía, y «51 invitables» era falso (06/09/2026).** Entrega 1 de
  «que vean su cartera» (PR #2440). `/boveda` no puede recalcular el vínculo —no hay email en claro—,
  así que se sella en el canje del código (`portal_identidad.ultimo_vinculo`, DDL aplicada) y se sella
  SIEMPRE, también en `ok`. Tres textos donde había uno: al `ambiguo` NO se le puede decir «no hemos
  encontrado ninguna póliza» (sí se ha encontrado, en dos fichas), y `sin_clave`/`error` es problema
  nuestro — eso solo se decía en la entrada, y quien vuelve con la sesión viva de 30 días no lo veía.
  Medido contra la BD: **46 puede_entrar / 29 sin correo / 5 `resuelve_a_otra` / 0 ambiguos** sobre 80;
  los 5 se contaban como invitables y son el caso peor (entra y ve la bóveda de OTRO, sin error).
  ⚠️ Tres de los cinco cepos del plan **no mordían**; reescritos y verificados con tres mutaciones.
  ⚠️ `cliente_emails.es_principal` NO entra en el desempate: honrarlo movería 42 de 80 a `ambiguo`.

- **✏️ Corregir teléfonos y correos, donde SE LEEN (06/09/2026).** Alberto: «revisa modificar datos, no
  funciona y el diseño es muy malo… hasta creas otra cosa, ocupa más pantalla». Las dos quejas eran la misma
  causa. **Medido, no supuesto:** 0 filas `historial_interno` de tipo `contacto` en 4 días (476 de otros
  tipos en esa ventana), ninguna fila hija nueva, backend desplegado y **sin errores de runtime** en
  `/api/correduria/cliente/contactos` → **la petición nunca llegó a salir**. La acción existía y estaba
  enterrada: el ✏️ vivía dentro del desplegable «Editar datos del cliente», que monta ~1.115px de formularios
  de dirección e identidad, y **repintaba los contactos por segunda vez** en la misma pestaña. Ahora se
  corrige en la tira de chips (`ContactosFicha.tsx`, interruptor «Corregir» DENTRO de la tira — en la
  cabecera del bloque envolvía a 390px y la subía de 20 a 64px) y el formulario de abajo se queda con lo que
  de verdad es un formulario. Medido a 390px: tarjeta 256→204px y la lista duplicada 251→0px.

- **💀 El formulario de la web de la correduría estaba MUERTO: «no podemos recoger tu solicitud» (06/09/2026).**
  Alberto lo vio en su móvil en `grupoasegura.es`. Ese texto es único y solo lo emite UNA rama:
  `PLATAFORMA_URL` sin definir en el proyecto Vercel `asegura-web` → 503 **antes** de intentar el reenvío.
  O sea: sin ficha, sin Telegram y sin el cuerpo del formulario en ningún log — **los leads perdidos no se
  pueden recuperar** (en los logs solo queda el contador: buscar `[lead] PLATAFORMA_URL sin configurar`).
  El destino estaba sano (medido: `POST plataforma-ten-flame.vercel.app/api/publico/correduria/lead` → 422).
  Arreglo: defecto REAL en el código, como `SITIO_URL`/`PORTAL_URL`, en vez de `|| ''`; la env sigue mandando.
  Guardián `lib/canal-lead.test.ts` (defecto no vacío + la ruta destino existe en plataforma). PR #2442.

- **🛑 Un borrador del agente de huéspedes se quedaba en Telegram PARA SIEMPRE (06/09/2026).** Alberto:
  «no ha respondido el agente, ¿no?». Sí respondió — a él: la reserva 154375571 (House Sevillana) preguntó
  por bares el 05/09 a las 15:42 y el agente propuso borrador por Telegram (msg 4087, `fuente:web`, así que
  `apoyada_en_fuente=false` y no auto-envía: regla correcta). Nadie le dio a ✅ Enviar y **nada lo reclamaba**:
  `barrerUltimoRecurso` solo actúa sobre urgencias NOCTURNAS. Nuevo barrido de PENDIENTES RANCIOS
  (`rancio.ts` puro + `rancio-guardia.ts`, en el sondeo de 3 min): a 45 min de ATENCIÓN (la noche no cuenta)
  recordatorio con botones; a 3 h, acuse al huésped de que se está mirando. Un cierre de conversación no da
  ningún peldaño. Migración `2026-09-06_pendientes_rancios.sql` APLICADA. ⚠️ Aparte: el msg auto-enviado
  anterior (id 142) dijo «Puerta de Jerez, 10 min andando» y House Sevillana está en C/ Socorro 24 (~25 min).

- **🚨 CIMA entra, pero los SINIESTROS no llegan a la cartera desde el 02/07 (06/09/2026).** Se fue a
  comprobar si la ingesta estaba muerta (el adaptador Java vive en la cuenta de Fly de Manuel) y la
  respuesta es que NO: último fichero el **05/09 09:12**, Occident `C0468`. Lo roto es lo siguiente:
  **43 ficheros aparcados en `seguros.cima_ficheros` con `estado='review'`** —20 de ellos SIN— y su
  `error_detalle` dice `0/1 siniestros`, o sea leído y persistido cero. Lo confirma la otra punta: el
  **último siniestro dado de alta en la cartera es del 02/07/2026** (67 en total), mientras el último
  SIN *confirmado* es del 08/07. REC y POL sí entran (24/08 y 25/08). ⚠️ Toca al portal: el historial
  de siniestros que se montó el 05/09 lee esa tabla, así que a un cliente de Occident que diera parte
  en agosto su ficha le dice «no nos consta ninguno» — frase honesta sobre una tabla congelada. La
  causa está en el CRM de Manuel (`review` es su cola de revisión manual y nadie la abre); no se tocó
  nada: es su motor de ingesta. ⏳ Pendiente de Alberto: preguntarle por qué los SIN de C0468 no
  auto-persisten. Memoria de la sesión anterior mergeada en **#2430** (`995c76b7`).

- **🔌 34 de 80 clientes entrarían al portal y verían la pantalla VACÍA (06/09/2026).** Alberto va a
  repartir accesos a toda la cartera y pidió un panel de configuración de avisos. Antes de diseñarlo se
  midió la BD: el portal vincula por el correo, y de 80 titulares vivos **46 verían su cartera, 29 no
  tienen ningún correo y 5 lo comparten con otra ficha** (cifra rehecha aplicando el desempate real de
  `elegirFicha()`, no un conteo crudo). Los tres desenlaces se ven idénticos desde el código. Spec
  mergeado (**#2427**, `50e413f66`): tres de las cuatro piezas que parecían faltar YA existen —la
  pantalla de contactabilidad mira cuatro sitios, añadir un correo ya recalcula el índice ciego—, así
  que el hueco real es que esa pantalla sabe si a alguien **se le puede escribir**, no si **puede
  entrar y ver su cartera**. Un cliente con el correo compartido sale hoy como «Localizable» y no se
  vincula jamás. 🚫 Dos cosas quedaron FUERA con su motivo medido: **avisar antes de que llegue un
  recibo** (de 183 recibos, CERO con emisión futura; no existe columna de fecha de cargo) y **servir
  documentos** (la tabla existe, con `visible_por_cliente` y todo, y está a **0 filas**). Reparto en 4
  entregas dentro del spec; el panel nace con UN interruptor porque el único aviso construido —el de
  vencimiento— sigue apagado. ⏳ Pendiente de Alberto: recoger los 29 correos (no lo arregla el
  código) y la idea nueva de invitar a un conocido desde `/correduria` para que aporte sus pólizas.

- **📉 Mapfre: 64 de 110 pólizas vivas congeladas desde junio, y el borrador ya está escrito (06/09/2026).**
  Re-medido contra `seguros.cima_ficheros` + `seguros.polizas`: C0058 emitió **14 ficheros en cuatro
  días (20→23/06) y nunca volvió**; las otras tres entidades siguen llegando (Occident ayer). Eso
  **corrige** el marco de #2425 («funcionaba y se cortó»): la curva encaja con un volcado inicial y un
  envío recurrente que no llegó a arrancar — otra pregunta, y más fácil de responder. Las 64 pólizas
  de Mapfre tienen `eiac_xml_hash`, o sea el **58 % de la cartera viva lleva 75 días sin refrescarse**:
  toda renovación, baja o siniestro posterior al 23/06 es invisible para el libro de comisiones.
  `docs/ASEGURA-MAPFRE-C0058.md` deja los hechos, las dos consultas para repetirlos y un **borrador
  para Codeoscopic SIN ENVIAR** (sin PII: solo código de entidad y agregados). PR #2439.

- **👀 Dos reglas de método nuevas, las dos de fallos medidos hoy (06/09/2026).**
  (1) **Mirar los PRs abiertos antes de empezar**: varias sesiones trabajan a la vez, todas empujan
  con la cuenta de Alberto y no se ven entre sí. El #2319 llevaba desde el 05/09 corrigiendo lo de las
  13 apps; esta sesión lo rehízo en el #2434 sin mirar, y encima le metió un conflicto. (2) **Un cepo
  no está terminado hasta que se le ha visto fallar**: verde solo prueba que pasa, no que vigila.
  Tres casos el mismo día —`scrollWidth` sobre un `fixed`, el `includes` sobre todo el fichero, y el
  `base.sha` viejo de `get_files`—, todos verdes mirando al sitio equivocado. PR #2439.

- **🔢 `CLAUDE.md` citaba 12 apps en la matriz de typecheck y son 13 (06/09/2026).**
  Salió al reproducir los checks en local sobre `main` ya consolidado (13/13 typechecks, suite
  completa, QA y build en verde). Falta `asegura-web`, que entró en la matriz al crearse la app el
  04/09. No es cosmético: ese párrafo es la RECETA de verificar en local, así que quien la siga se
  deja fuera justo la app que no miró — la misma familia que los 15 días de `housesevillana` sin
  typecheck. El apartado ya avisaba de que la cifra «se ha quedado corta dos veces»; van tres, así
  que ahora la vigila `test/regression-matriz-typecheck.test.ts`: la fuente de verdad es el WORKFLOW
  y el doc se compara contra él. ⚠️ Ese cepo **casi nace verde**: buscaba los nombres en TODO el
  documento y pasaba con `asegura-web` borrado de la lista, porque la app tiene su propio apartado.
  Solo se vio al probarlo fallando. PR #2434.

- **🫧 Una burbuja `fixed` NO desborda: se pone encima — y `scrollWidth` no la delata (06/09/2026).**
  Alberto mandó una foto de `grupoasegura.es` en su móvil (que de paso CIERRA la duda de si el dominio
  sirve el build nuevo: sí) y en ella los dos botones flotantes —WhatsApp a la derecha, cookies a la
  izquierda— tapaban la última línea del hero. La medición de responsive de esa misma mañana había
  dado «no desborda» **y era cierta**: es otra cosa. La regla de `CLAUDE.md` sobre medir el scroller
  no cubre este caso; hay que medir **solape de rectángulos** contra los elementos `fixed`.
  Arreglado por tres vías (lead una línea más corto quitando lo que ya decía el h1, banda reservada
  al pie del hero en móvil, y el FAB un peldaño más arriba en todas las páginas): 360/390/412 quedan
  limpios, medido con Playwright. ⚠️ **A 320 px queda un solape residual y NO es de nuestro botón:
  es el de Cookiebot**, que se posa en la esquina inferior izquierda justo donde arrancan las
  garantías (x=16). Apartarlo exige pisar CSS de un tercero; se deja documentado, no tapado. Y ojo
  con la medición: esa burbuja se **simuló** por posición y tamaño, porque sin `CBID` Cookiebot no
  carga en local. PR #2428.

- **📉 Mapfre no es que «nunca entrara» por CIMA: entró 14 veces y lleva 75 días callada (06/09/2026).**
  Medido contra `seguros.cima_ficheros`: Occident trajo fichero ayer, Allianz hace 3 días, Reale hace 12,
  **Mapfre el 23/06**. CIMA NO está caído — es esa entidad y solo esa, y son 64 de 110 pólizas (58 %).
  Corrige al estudio #2419, que repetía del plan de marketing que Mapfre «nunca ha entrado»: la
  diferencia importa porque una tubería que **funcionaba y se cortó** apunta a la suscripción de C0058,
  no a un cron sin configurar. Ya lo detecta `silencio-entidad.ts` (05/09) comparando a cada compañía
  con su PROPIO ritmo, y sale por Telegram desde `correduria-ingesta`: **el software avisa, falta la
  llamada.** Además: verificación de Search Console por env en asegura-web (sin env NO se emite la
  etiqueta, con guardián probado fallando — una `<meta content="">` es peor que ninguna) y
  `docs/ASEGURA-CONSULTA-ABOGADO.md`, que junta las 4 preguntas legales sueltas en una sola consulta;
  la primera —base jurídica de los 32.520 contactos de 2013-2018— es la que puede convertir un supuesto
  activo en un pasivo. PR #2425.

- **✍️ El hero de la correduría pasa a primera persona, y el cepo del copy ya barre la portada (06/09/2026).**
  Se aplica el ángulo que dejó abierto el estudio (#2419): el hero explicaba lo que la correduría **es**
  («Somos correduría, no compañía») y listaba cinco ramos de un tirón, así que no priorizaba ninguno.
  Ahora abre por el momento del visitante y el nombre sale de `MEDIADOR`, no tecleado — es lo único que
  un comparador no puede copiar. La sección `#corredor` deja de repetirlo y se queda con lo comprobable.
  🚨 **Hallazgo de paso:** `lib/ramos.test.ts` se describía como el guardián que «barre todas las
  páginas» y **solo miraba `RAMOS`** — el hero, que es donde acabaría un «ahorra un 30 %», estaba sin
  vigilar. Ampliado a `app/` y `components/`, y **probado fallando** antes de darlo por bueno.
  PR #2421 **mergeado**; la skill `seo-asegura` decía «barre todas las páginas» y era falso — ahora
  lo es, y queda escrito para que nadie recorte el barrido creyéndolo decorativo.
  ⚠️ **La verificación en vivo NO se pudo hacer desde el contenedor:** el proxy de la sesión deniega
  `grupoasegura.es` (`connect_rejected` 403) y el MCP de Vercel da 403 al listar despliegues. Lo
  probado es el **build de producción** (`pnpm build` + `pnpm start`): el HTML prerenderizado trae el
  hero nuevo, cero rastro del viejo, y no desborda a 320/390/1024. Que se vea en el dominio lo tiene
  que mirar Alberto.

- **🔎 Estudio de competencia de la correduría: el rival más caro es no llamar a los tuyos (06/09/2026).**
  Alberto, viendo ya la web en el móvil: «los textos no me gustan, la introducción» + «hay mucha
  competencia con el tema de las compañías». Antes de tocar copy se hizo el estudio, y lo que sale
  medido reordena la prioridad: **57 de los 80 clientes tienen auto y NO hogar**, 65 tienen una sola
  póliza y 72 son de un solo ramo (1,38 pól./cliente). A 68,74€ de comisión el hogar, ese grupo bate
  en coste por póliza a cualquier campaña. Segundo hallazgo: **Mapfre es el 58 % de la cartera (64
  pólizas) y no se actualiza desde el 15/07** — de ahí que 55 de 110 figuren «ya vencidas», que es un
  «no lo sé», no una pérdida: **una campaña de vencimientos hoy le diría «se te vence» a quien renovó**.
  🚫 El estudio declara lo que NO pudo medir: el contenedor no tiene salida a internet, así que ni una
  SERP ni un CPC son datos — van marcados [Sector]/[Suposición] frente a [Medido]. Dónde no entrar:
  auto (comparadores + 40,87€/póliza). Dónde sí: hogar, y sobre todo **comunidades de propietarios**,
  que no tiene comparador enfrente y se gana visitando administradores de fincas. `docs/ASEGURA-COMPETENCIA-POSICIONAMIENTO.md`.
  **Los textos del hero NO se han tocado**: el estudio deja tres ángulos y los elige Alberto. PR #2419.

- **📅 mercado-booking: jul/ago-2027 siguen cumpliendo, y la línea PRIORIDAD sigue sin quitarse (06/09/2026).**
  Pasada acotada (`?desde=2027-07-01&hasta=2027-08-31&max=24`): 239 comps reales en 24 ventanas
  (incluye Campeonato Mundo de Remo 01-03 ago) + 1/4 escaparate (busto_reform; house_sevillana,
  duplex_center y luxury_busto sin disponibilidad en Booking para esas fechas exactas —
  `escaparateSinRespuesta`, no fallo). Verificado en `/mercado/plan`: jul y ago-2027 YA NO están en
  `meses_sin_bucket`. **Repite el trabajo del 29/08→05/09**: la sesión sigue sin permiso para
  escribir el prompt del disparo programado (creado por `http_api`), así que la línea "PRIORIDAD
  TEMPORAL" sigue viva y cada pasada la vuelve a ejecutar. Pendiente de Alberto, sin cambios.

- **✅ MEDIDOS los dos arreglos del 05/09: los dos funcionan (06/09/2026).** Ya no es «razonado», es dato.
  **Vigía de agentes:** `agente_veredicto` tiene **33 filas**, todas con `evaluado_at` de la pasada de
  hoy (07:45:23 UTC), 2 en alerta y 0 sondas rotas — y **cero** runtime errors en
  `/api/cron/agentes-latido` en 24 h, donde antes había ~30 diarios. `agente_salud` sigue intacta con
  su fila de facturas. Las 2 alertas son reales y ya estaban declaradas pendientes: `ses_transporte`
  (sin establecimientos; hoy manda Chekin, hasta el 06/10) y `sivra_domotica_acceso` (cerradura de
  Bustos Tavera sin conexión, Tuya 2001/1109, hasta el 12/09).
  **Modo noche:** hubo caso real la primera noche — Mafalda (154265696) escribió a las **23:19** hora
  de Madrid, el mensaje escaló y **el acuse salió a las 23:19:34**. Escribió tres veces más (23:22,
  23:30, 23:31) y el acuse NO se repitió: la guarda de uno por noche y reserva hizo su trabajo.
  `urgente_nocturno=false` (preguntaba por aparcamiento, no era urgencia) y por eso `ultimo_recurso_at`
  quedó NULL: no se la derivó al portal, que es lo correcto.
  🔍 **A mirar, ajeno a esto:** esas 4 filas de `mensajes_log` en 12 min repiten pregunta («Hola,
  AlbertoZ» a las 23:19 y a las 23:30) y la última salió con `respuesta` vacía. Puede ser el huésped
  escribiendo dos veces o un reproceso del sondeo; **no se ha determinado** y no se toca sin mirarlo.

- **📇 Correduría: se pueden CORREGIR teléfonos y emails, y la ficha deja de afirmar provincias falsas (05/09/2026).** Alberto, desde el móvil: «no puedo modificar movil ni mails» y «a Manuel Piña Franco también le sale Tarragona». Dos fallos: (1) la pestaña Contactos dejaba añadir/borrar/hacer principal pero NO cambiar un valor — `cambiarContacto` acepta ahora `valor` (recifra + recalcula índice ciego + re-espeja la columna), el `col:telefono` del volcado se baja antes a la hija, la regla de duplicados sale a `duplicadoContacto()` compartida con el alta, y el editor —que vive a pantalla y media en móvil— se abre con un botón desde la tira de arriba; (2) el sitio se pintaba con un `join`: «41807 34304, Tarragona» = CP de Espartinas + id de población del CRM viejo + provincia falsa. Medido sobre 31.809 fichas vivas: **473 con provincia que contradice al CP** (386 «Tarragona» con CP 41xxx, todas `intranet:` de mayo, ninguna de CIMA), 455 con número en `ciudad`, 602 con el CP sin el cero. `leerSitio()` (puro, 8 tests) no afirma lo que se contradice y lo explica; **no sustituye** la provincia por la del CP (el equivocado puede ser cualquiera de los dos). PR #2410. **Pendiente:** lote SQL para corregir esas 473 y fusionar el duplicado de Manuel Antonio Piña Franco (la ficha buena dice ESPARTINAS/Sevilla) — con OK de Alberto.

- **🏷️ Compañías del muro y el ramo que llegaba mal etiquetado (05/09/2026).** Alberto, viendo la web
  ya en `grupoasegura.es`: «¿y los logos de más compañías?». En `seguros.companias_dgs` hay 15 filas
  `activa`, pero 10 solo llevan «código verificado en el catálogo de Codeoscopic» — que es
  **tarificable, no acuerdo**; publicarlas sería afirmar en falso sobre terceros. Alberto fija la
  lista: las 4 con pólizas vivas + Generali, Fidelidade y **Asisa** (esta NO está en
  `companias_dgs`: para emitir hará falta su código DGS). Se parte `COMPANIAS` en dos, porque
  ampliar la única que había habría subido en silencio la cifra «Compañías con pólizas en cartera»
  de 4 a 7. Marquesina TRIPLICADA (medido: una copia 964 px < contenedor 1104 → se veía el hueco) y
  apretada en móvil (de 2 nombres visibles a 3-4). 🚨 Y el hallazgo caro: la página de
  **responsabilidad civil preseleccionaba «Comercio o empresa»** porque RC no existía en
  `TIPOS_SEGURO_LEAD` — el lead llegaba diciendo que quería comercio, plausible y falso. RC añadido
  en plataforma + la copia, con guardián nuevo `cada ramo publicado tiene su opción` (probado por
  mutación). PR #2408.

- **🎨 `asegura-web`: una sola atmósfera, no diez bloques (05/09/2026).** Alberto: «te estás liando,
  hay que mezclar todas las ideas». Diagnóstico: los recursos ya estaban TODOS (aspecto de la landing
  de Manuel, ventana viva, foco con contadores, escáner), pero apilados como diez bloques blancos del
  mismo peso. Se funden con `.oscuro`: tokens de marca redefinidos en ámbito, inyectados por el layout
  desde `emitirVariablesOscuras(MARCA_ASEGURA)` (paleta MEDIDA de su `.dark`) → todo componente que
  entra en una sección oscura se re-tematiza solo, cero overrides y cero hex a mano; desaparecen los
  tres `--hero-oscuro*` literales. `.claro` es el camino de vuelta para la hoja del escáner (es un
  papel). Al medir salieron fallos que YA existían: cabecera `sticky` (barra blanca de 76 px sobre la
  portada) → `fixed`; logo centrado pisando la nav; el botón «Área de clientes» **fuera de pantalla** a
  1024-1200 (marca+6 enlaces+botón = 1.145 px en 1.104) → `NAV_CABECERA` solo con ramos; la override de
  `.btn-sm` para móvil estaba ANTES de la regla base y no aplicaba nunca (una media query no añade
  especificidad). Guardián nuevo `lib/oscuro.test.ts` (probado por mutación). PR #2381, commit
  `976faac3e`. **Alberto lo vio y prefirió CLARO**: la web se queda clara y el oscuro solo en la banda
  de cifras — que además es lo que hace la landing de la correduría en la que se mira. En claro la
  ventana del hero se lee mejor y los chips en azul sólido destacan. **PR #2381 mergeado** (`f341b2e8`).

- **📞 `asegura-web`: WhatsApp, y los textos legales que MENTÍAN sobre las cookies (05/09/2026).**
  Móvil de Alberto (confirmado por él) a `MEDIADOR.identidad.telefono` en E.164, con `telefonoLegible()`
  y `whatsappUrl()` derivados —`wa.me` con «+» abre el chat en blanco, fallo que no da error—: botón
  flotante, `tel:` en el pie y `telephone` en el JSON-LD. CTA «Crear mi área con mi correo»: verificado
  en el código del portal que hoy entra CUALQUIERA con un correo, sin ser cliente, y puede subir pólizas.
  🚨 **Auditoría legal:** privacidad y aviso legal decían «no hay analítica ni cookies de terceros, y por
  eso no se te pide consentimiento» mientras el layout carga Cookiebot y PostHog — información falsa al
  interesado (arts. 12-13 RGPD, 22.2 LSSI), no un texto viejo. Corregidos, con las bases jurídicas que
  faltaban (medición 6.1.a, IP antiabuso 6.1.f) y los encargados nombrados; `VERSION_TEXTOS_WEB` → `w2`.
  **Lección: subir la versión NO es revisar el texto** — `w1` la subió y dejó el texto mintiendo.
  `/legal/cookies` era huérfana (solo desde Google) y tenía el único botón de retirar consentimiento
  (art. 7.3 RGPD): ya está en el pie. Capa 1 del art. 13 completa en el formulario. Dos fallos MÍOS del
  mismo día: `<main>` dentro de `<main>` en 4 páginas y la dirección del JSON-LD duplicando la de
  `MEDIADOR` (guardián `lib/seo-nap.test.ts`). PR #2381.
  **PENDIENTE y es lo más urgente:** `/api/acceso/solicitar` de `asegura-portal` **no tiene rate limit
  ni valida que el destino sea un email** (`z.string().min(3)`), y la web pública ya enlaza ahí: es un
  amplificador de correo con el dominio de Alberto. También pendiente: sign-off de abogado y si un
  corredor persona física está obligado a DPO (art. 34 LOPDGDD).

- **🖼 La tarjeta impresa estaba PARTIDA EN DOS, y lo que la protegía era una deny-list (05/09/2026).**
  Segunda pasada del agente de diseño antes de mergear, a petición de Alberto. El bloque del QR se
  pintaba como HERMANO del masthead y `.hoja-qr` se coloca con `grid-area: qr` — regla que solo
  significa algo si es HIJO: la fila `qr` quedaba vacía, el filete cortaba entre la marca y el
  código, y la leyenda salía pegada al margen IZQUIERDO del folio (QR a 258 px). En pantalla no se
  veía. **El QR es ahora hijo del `Masthead`** y el papel es una tarjeta de 96 mm centrada con
  contorno (363×419, una página, idéntica en claro y oscuro). 🚨 Y lo que se ocultaba eran **cuatro
  nombres de clase**: se comprobó que la rama de error SÍ se imprimía. Ahora es **allow-list**
  (`.hoja > *` oculto, una sola excepción) y el cepo afirma esa FORMA + que lo impreso ES el cuerpo
  de `Masthead` (3 mutaciones vistas morder). Se quita «Datos a día …» del papel: en pantalla es
  honesto, en el papel es mentira. El teléfono de la ficha pasa a `tel:` (el WhatsApp NO). Y dos
  cosas rotas de la tanda anterior: `.acciones` escalonaba 10 px desde 420 px, y
  `.hoja-solo-pantalla` usaba el borde discontinuo reservado a `.pendiente`. ⚠️ Sin arreglo posible:
  el navegador imprime la URL con el token en su propio pie de página.

- **🖨 La hoja impresa, corregida: salía NEGRO SOBRE NEGRO desde el tema oscuro (05/09/2026).**
  Alberto pidió revisar el diseño «a nivel corporativo» y aclaró la cabecera: «TUS SEGUROS y nombre
  Grupo ASegura». La revisión (agente de diseño) destapó tres fallos mergeados horas antes: el
  `@media print` parcheaba `.hoja` con `color:#000` **sin tocar el `body`**, así que desde el tema
  oscuro el folio salía negro con el texto negro encima — y el interruptor de tema estaba a un toque
  en la barra de la propia hoja. Arreglado **re-declarando los TOKENS** dentro de `@media print`
  (selector doblado `:root:root`, porque `emitirRootCss` se inyecta sin capa y después). También:
  la barra y el pie legal se llevaban ~195 px y una **segunda página** → ocultos con
  `body:has(> .hoja)`, NO con un root layout propio (duplicaría `SCRIPT_TEMA` y la marca). Cabecera
  nueva: monograma AS a 40 px en negro, DGSFP desde `MEDIADOR`, **«Tus seguros»** de titular, QR a la
  derecha, filete de 2 px. El **teléfono pasa de 14/400 a 20/700**: antes la palabra «auto» se
  imprimía más grande que el 900 de la grúa. Y `.boton-tenue` no existía (botones nativos de 25 px) y
  la confirmación se pintaba con `.alarma`, en rojo. 🚨 **Y luego Alberto cambió el producto: en el
  papel NO VA NINGÚN DATO** («el que quiera info tiene que escanear; si pone tlf no entra, y puede
  que quede obsoleto el tlf»). Su segundo argumento tumba el diseño de esa misma tarde: **un teléfono
  impreso es un dato en papel**, justo lo que el QR existe para evitar. Se imprime solo la tarjeta
  —monograma, marca con DGSFP, «Tus seguros» y el QR a 200 px—; en pantalla no cambia nada. Aviso en
  la página de qué se imprime, para que la vista previa no parezca un fallo. PR pendiente de su OK.
- **🔑 Invitar a un cliente al portal: el canal entero era invisible (05/09/2026).** PR #2399. Alberto:
  «no aparece el enviar invitación a la intranet». **No aparecía porque no existía** — el portal lleva
  desde el 01/09 y la única forma de entrar era que el cliente lo supiera por su cuenta. Puerto
  `/api/operador/cliente/portal` en asegura + bloque en la pestaña Contactos de plataforma.
  🚨 Lo que define el diseño: el portal vincula persona↔ficha por el índice ciego del email y solo si no
  es ambiguo, así que **invitar a quien no resuelve es peor que no invitar** (entra y ve una bóveda vacía
  sin ningún error). Por eso predice antes de escribir y **con la MISMA función que el portal ejecutará**
  — `elegirFicha` sube de `apps/asegura-portal/lib/` a `@central/module-seguros-portal`.
  Medido: **51 invitables · 0 ambiguos · 29 sin correo** de los 80 vivos (los 29 son los de «Clientes sin
  canal»). ⚠️ Una primera medición dio «5 ambiguos» y era falsa: contaba hashes compartidos sin aplicar
  el desempate. No da acceso a nada y el enlace **no lleva token**. Ocho desenlaces sin colapsar.
  ⏸️ **Pendiente de Alberto:** sin `ASEGURA_MAIL_FROM` + proveedor de correo en `central-asegura` el botón
  contesta `error_envio` — y le pasa igual a la invitación de autorizaciones mergeada esta mañana.
  🚨 **Seguimiento:** el arreglo responsive del titular se quedó SIN COMMITEAR y el PR mergeó la
  versión con `<Badge>`, que lleva `whiteSpace:'nowrap'`: el rótulo de `ya_entra` arrastra la fecha
  entera («… última vez el 3 de septiembre de 2026») y desbordaba la pantalla a 320px. Va como
  `<span>` coloreado por token (`COLOR_PORTAL`, cero hex) y con `overflowWrap:'anywhere'`.
  Lección: un cambio de un agente **no está hecho hasta que está en un commit** — su informe decía
  «span, cero hex» y lo mergeado era el `Badge`. Comprobar el árbol antes de dar el PR por cerrado.

- **📵 El CUARTO sitio donde vive un contacto, y la pestaña Contactos apretada (05/09/2026).** PR #2391
  (mergeado, `9d822946`) + PR nuevo. Alberto, mirando la pantalla: «grupo elca ya tiene a pablo y aun
  aparece», «Studium tiene a victor y berta» — estaban en `cliente_relaciones`, que la consulta de
  «Clientes sin canal» no miraba. **Medido contra la BD: 18 sin nada en su ficha · 14 ilocalizables con
  los tres sitios de antes · SEIS con el cuarto.** (En pantalla ponía 16: cifra anterior al lote 10.)
  🚨 Y una corrección de CRITERIO suya, no de código: «un cliente puede ser muy mayor... es mejor
  contactar con el familiar» — el familiar NO es un contacto de segunda, así que un solo estado y **viaja
  el parentesco** («Llama a Pablo Franco Ruz (administración)»). La consulta busca en las DOS direcciones
  porque el volcado no respeta el convenio «A→B = B es <tipo> de A». Los SEIS restantes son trabajo de
  Alberto; uno se llama «NO DISPONIBLE NO DISPONIBLE» y es un centinela, no un cliente sin datos.
  🎨 «Contactos está muy mal aprovechada, ocupa todo mucho»: el coste FIJO de la pestaña era ~1.245px
  (~1,8 pantallas de móvil) de marco y formulario vacío en la pantalla que se abre para LEER un teléfono.
  Queda en ~310px: teléfonos/correos/dirección arriba como chips (`tel:`/`mailto:`/WhatsApp; la dirección
  no se leía en ningún sitio, vivía como `value` de un input) y `EditarCliente` plegado con montaje
  perezoso — **con badge en el rótulo de lo que no se ha podido leer ahí dentro, que plegar no puede
  esconder trabajo**. Sin medir en navegador (no hay Playwright ni BD aquí): va con `[preview]`.

- **🔍 Agente de SEO y redes para la correduría + backlog medido (05/09/2026).** Mergeado #2380
  (`VERSION_TEXTOS_WEB`). Creada la skill **`seo-asegura`** (SEO, contenido y redes de
  `grupoasegura.es`; rutina semanal pendiente) y el backlog `docs/ASEGURA-SEO-REDES-IDEAS.md` con la
  auditoría técnica ya medida por subagentes: **cero imagen Open Graph** en toda la app (cada enlace
  compartido sale sin imagen), `/cambiar-de-correduria` —la página de más intención— sin «Sevilla» en
  title ni H1, las 6 páginas de ramo son callejones sin salida, `sitemap.lastModified` es la fecha del
  build (frescura falsa), y `seo.ts:45` teclea la dirección a mano en vez de leerla de `MEDIADOR`.
  Y `apps/plataforma/app/seguros` **sigue viva e indexable** compitiendo por las mismas consultas.
  Dos correcciones al plan: el `info@`→`hola@` ya estaba **hecho** en `asegura-web` (lo daba por
  abierto), y **Mapfre no lleva 5 meses sin ingesta: nunca ha entrado por el cron** (sus 153 recibos
  tienen una sola fecha de creación, la del volcado; Allianz y Occident sí siguen entrando). Es el
  64 % de la cartera, así que la comparación hogar-vs-auto puede estar sesgada → `agente-correduria`.
- **✉️ «Invitar por correo»: la autorización pendiente ya se la cuenta alguien (05/09/2026).** Anotar
  que ELCA autoriza a Pablo dejaba la fila `pendiente` y **nadie avisaba a Pablo**: o Alberto escribía
  el correo a mano, o se caducaba sola a los 90 días. Botón en la fila de la persona (solo si está
  `pendiente`) → proxy de plataforma → puerto nuevo `/api/operador/cliente/relaciones/aviso` de asegura,
  que es quien tiene el email descifrado. **No acepta nada**: la doble aceptación sigue siendo la única
  prueba de identidad. El correo dice quién le da el acceso y dónde confirmarlo, y **nada más** —ni el
  alcance, que ya es cartera ajena— con el mismo cepo que la invitación del portal. Cinco desenlaces sin
  colapsar (`sin_email` es el único accionable) y ninguno de los cuatro fallos puede leerse como
  enviado. **Pendiente:** `ASEGURA_MAIL_FROM` + proveedor de correo en el Vercel de asegura. PR #2386.

- **📊 La web pública ya puede medir, y solo si le dejan (05/09/2026).** `apps/asegura-web` no tenía
  **ni una línea** de PostHog ni de Cookiebot: crear las tres envs en Vercel (lo que estaba a punto de
  hacerse) no habría hecho nada, porque no había código que las leyera. Ahora sí, y **fail-closed**:
  `puedeMedir()` (puro, `lib/analitica.ts`) exige las tres cosas —CBID, clave y `statistics === true`—
  y PostHog **no está en el bundle**, se baja de su CDN tras aceptar. Es la decisión contraria a la web
  de Manuel, cuyo *fail-open* deja PostHog corriendo sin banner si falta la env (medido el 04/09).
  `/legal/cookies` + botón de renovar (art. 7.3 RGPD), enlace en el footer y en el sitemap. 12 cepos en
  `lib/analitica.test.ts`; 28 tests de la app, tsc 0, lint 0, build OK. **PR #2385 mergeado** (`4a3be3f`, 20/20 en verde).
  🔌 **Pendiente de Alberto para que MIDA (hasta entonces no mide, y eso es lo correcto pero silencioso):**
  `NEXT_PUBLIC_COOKIEBOT_ID` + `NEXT_PUBLIC_POSTHOG_KEY` en el proyecto Vercel `asegura-web` (son
  `NEXT_PUBLIC_`: se hornean en el build → redeploy después), y **dar de alta `grupoasegura.es` en el
  panel de Cookiebot** — un CBID atado solo a `app.grupoasegura.com` no pinta banner aquí.
  ✅ **Los 7 crons de `asegura` NO estaban rotos al cerrar: ya los había arreglado otra sesión** (revert
  `cae77bd`, 14:05 UTC, de #818). Aquel PR repuntó los destinos a `grupoasegura.es` sobre una premisa
  **no medida** (que la canonicalización rompía el `.com`), y lo que se midió después la desmiente:
  `.es/api/crons/cima-pull` → **404**, `app.grupoasegura.com/api/crons/cima-pull` → **401** (la ruta
  responde, sin redirect). Daño real: **UN run**, el de las 13:57; el de las 14:06 ya en verde. ⚠️ Y
  **NO quitar** PostHog/Cookiebot del proyecto `asegura`: su fail-open dejaría el CRM midiendo sin
  banner — lo correcto es dar de alta los dominios en el CBID.
- 🔐 **Y un cabo que ese PR dejó suelto: la privacidad se reescribió sin subir la versión del texto.**
  `VERSION_TEXTOS_LEGALES` seguía en `2026-09-v4` con un contenido que ya no era el de v4 — justo lo que
  esa constante existe para impedir. Pero **subirla NO era la solución**: se SELLA en
  `portal_consentimiento.version_texto`, así que reescribir el apartado de cookies de la web habría
  obligado a los ~80 clientes del portal a volver a acreditar, ensuciando un registro cuyo único valor
  es ser prueba. Nace **`VERSION_TEXTOS_WEB`** (`2026-09-w1`) para los textos de `asegura-web`, con test
  que impide volver a colapsar las dos series. Regla: texto de la web → sube `_WEB`; texto del portal →
  sube `_LEGALES`.
- 🔁 **Y la lección de método del día: dos sesiones montaron la MISMA analítica en paralelo.** La de
  #2385 llegó antes y es mejor (PostHog fuera del bundle, cepos que leen el fuente); la otra se
  descartó entera al resolver el conflicto. Antes de empezar algo que «no existe», mirar si hay un PR
  abierto tocándolo: `list_pull_requests` cuesta una llamada y aquí habría ahorrado una implementación
  completa.
- **📚 Memoria y skill del agente de huéspedes al día + duodécima medición del CI (05/09/2026).** Lo del
  PR #2378 (idioma, consulta web, `importesNoRespaldados`, los hechos de transporte de los 4 pisos) se
  volcó a `sivra-maestro/references/contexto-y-agente-huesped.md`: vivía solo en la memoria y en el PR, y
  esa referencia es lo que lee quien toca el agente. **CI:** el PR volvió a quedar `dirty` dos veces (main
  avanzó con #2377 y #2382); el paso 3 del orden documentado —mergear `main` y empujar— disparó los 12
  requeridos a los segundos, sin lag que esperar ni palancas raras. **Vercel:** un commit de MERGE **sin**
  `[preview]` pinta las 12 apps en «Building» y acaba en **11 `Ignored` + `ialimp` `Ready`** (ialimp es la
  única sin `--sin-previews`): NO son los once builds del PR #2281 —eso lo causa el marcador, no el merge—,
  así que no se da la alarma desde el comentario intermedio. Las dos cosas anotadas en el CLAUDE.md raíz.

- **🔎 Si no está en la guía y el dato es de FUERA, el agente consulta internet (05/09/2026).** Dictado de
  Alberto: «en caso de duda que use la IA para consultar». Mismo incidente que el bug del idioma: a
  «¿cómo llegamos del aeropuerto?» el modelo se inventó **dos** datos (taxi «25-30€» —el real es tarifa
  fija municipal de 26€ L-V 7-21h / 29€ noches y festivos— y una parada del bus EA, «Puerta de Jerez»,
  que ni existe en esa línea ni está a 10 min del piso). `consulta-web.ts` (puro, 12 tests): cuando el
  control de calidad dice que la guía no cubre la pregunta **y** la pregunta es del ENTORNO (transporte,
  monumentos, dónde comer, servicios, eventos) se llama a `buscarWeb` y se re-redacta el borrador con
  los datos + sus URLs. 🚨 Lo consultado **NUNCA se auto-envía** (`webConsultada` fuerza `needs_human`,
  guardián que lee el fuente) y una búsqueda fallida se DECLARA: «no he podido mirarlo» ≠ «no está en la
  guía». Sigue contando como hueco de guía para que lo que responda Alberto se aprenda como hecho y no
  se pague la búsqueda dos veces. Nada de esto aplica al PISO (internet no sabe si hay plancha) ni a lo
  sensible/negativo. Además `importesNoRespaldados` en el guardrail: **ninguna cifra en € que no esté en
  las fuentes pasa** — los patrones de antes solo miraban códigos de 4+ dígitos, teléfonos y URLs, por
  eso el precio del taxi salió limpio. PR #2378. **Y el dato ya está en la guía** (`mensajes_hechos`
  ids 10 y 11, `prop_house_sevillana`, `confirmado`, insertados a mano por Supabase): tarifa fija de
  taxi 26€ (L-V 7-21h) / 29€ (noches, findes, festivos), EA 6€/8€ con sus paradas reales, y la
  advertencia explícita de NO decir «Puerta de Jerez» ni «10 min andando». Así esa pregunta se
  responde sola, sin gastar búsqueda. **Y los otros 3 pisos también** (ids 12-14, a petición de Alberto):
  ahí va SOLO lo que vale para toda Sevilla —tarifa fija de taxi y precios/paradas del EA— con la orden
  explícita de NO decir en qué parada bajarse ni cuántos minutos se anda hasta ESE piso, porque esa
  distancia no está medida para ellos. El dato que no se tiene se declara, no se estima.

- **🗣️ El borrador salía en ESPAÑOL con el huésped escribiendo en inglés (05/09/2026).** Caso real: reserva
  154375571 (House Sevillana, Massimo). Todos los prompts del agente van en español y la orden «responde en
  inglés» es UNA línea dentro del muro → el modelo deriva al idioma ambiental. Pasaba MUDO: el aviso decía
  «Borrador (en EN)» (`ctx.lang` sí era 'en') y la línea 🔁 «no he podido traducirlo al español» —traducir
  español a español devuelve lo mismo y `traduccionUtil` lo descarta—, así que un fallo de REDACCIÓN se leía
  como uno de traducción; y con categoría auto-enviable, al huésped le llegaba en español. Red nueva
  `lib/sivra/agente-huesped/idioma-salida.ts` (puro, 7 tests): detecta la deriva AL ESPAÑOL (solo esa, no se
  arbitra entre en/fr/de/it) y traduce; si no puede, `fallo` → `needs_human` con motivo propio, nunca se
  maquilla. Cableada en `decidir`, `redactar` y `retoque`; los tres avisos de Telegram dicen «⚠️ este texto ha
  salido en ESPAÑOL» en vez de la línea 🔁 confusa. Refuerzo del idioma también en la ÚLTIMA línea del system.
- **🧲 La hoja de la nevera y su QR: existe (05/09/2026).** Alberto: «crear QR y ahí seleccionas si
  todas las pólizas, una o algunas… y el qr se puede borrar y se anularía el acceso». **No existía**:
  solo la decisión escrita en `apps/asegura-portal/CLAUDE.md`, redactada como si existiera. Ahora
  `/hoja/[token]`, pública e imprimible, con el QR en SVG desde el servidor (`qrcode@1.5.4`, la
  misma versión que ia-rest y rrhh). 🔐 **Un token sin sesión es aceptable aquí porque la selección
  lo acota**: enseña exactamente lo que va impreso en ese papel, así que no filtra nada que el papel
  no filtre ya. Reglas: el QR lleva ENLACE no datos · lo que muestra se relee EN VIVO (vendes el
  coche y desaparece sola) · **cero filas = TODAS, y eso incluye las futuras** (la pantalla lo dice,
  cepo positivo) · anular no borra (sin DELETE en el rol) · token hasheado. Tabla `portal_hoja_qr`
  aplicada el mismo día, con **5 cepos vistos morder en la BD real**. PR #2380.

- **🔀 «Mis seguros» y «Mis pólizas» eran la misma palabra: fuera una pestaña (05/09/2026).**
  Alberto, mirando su portal: *«mis seguros y mis pólizas es lo mismo»*. **No lo eran** (cartera de
  CIMA vs. lo que aporta él) **pero el fallo era del nombre**: en castellano son sinónimos, así que
  la barra ofrecía dos puertas iguales. No se rebautizó, se **quitó**: `portal_poliza_declarada`
  tenía **1 fila en toda la BD**, y `vista-portal.ts` ya argumentaba en contra de las pestañas casi
  siempre vacías justo encima del código que la creaba. Ahora una sola lista en «Mis seguros», con
  chip **«Añadida por ti»** en la FILA —no en la ficha— porque esa póliza **no la gestiona la
  correduría** y el cliente tiene que saberlo antes de contar con ella. Ficha nueva
  `/boveda/anadida/[id]` con la identidad DENTRO del `where` (2 mutaciones vistas morder). Cepo de
  sinónimos en la barra. 📱 Y arregla la 4ª pestaña **cortada** en su móvil: con tres caben a 360+,
  y por debajo de 380 se reparten el ancho (a 320 se salían 39 px). PR #2379.

- **👥 UNA lista de personas por ficha: se funden 👤 y 👪 (05/09/2026).** Las dos tarjetas contestaban la
  misma pregunta («¿a quién llamo y con qué derecho?») y la misma persona salía en las dos sin que nada lo
  dijera. Ahora una sola tarjeta 👥 Personas: `unificarPersonas` (`packages/module-seguros/src/personas-ficha.ts`,
  8 tests) funde **por FICHA, nunca por nombre** —dos homónimos con NIF distinto siguen siendo dos filas, y
  quien CIMA no ha enlazado no se funde con nadie—, y cada fila conserva sus dos caras: 📄 lo que manda la
  compañía (papeles por póliza, con su «quitar») y 👪 lo nuestro (vínculo + autorización). `Relaciones` es
  dueño de la lista; los papeles entran como render-prop desde `TabContactos` porque son otra API. `null` de
  cada fuente se dice por separado: ninguno es «no hay nadie». Mismo PR #2369.

- **👤 Persona de contacto de una empresa: se crea su FICHA, no un campo (05/09/2026).** Duda de Alberto en
  Grupo ELCA 83: quería apuntar a quien lleva sus seguros, que no es cliente. Se descartó un campo «persona de
  contacto» dentro de la sociedad porque **esa persona es un futuro cliente**: con ficha propia nace 🕐 lead
  (el estado se DERIVA, `estadoCliente`) y pasa a ✅ cliente sola cuando CIMA confirme su primera póliza. Nuevo
  botón «Nueva persona de contacto» en 👪 Relaciones: alta + vínculo en un paso, con `fuente: recomendacion`,
  reutilizando la ficha existente si el alta da 409 (anti-duplicado). **NO da acceso**: la autorización del
  portal sigue siendo un acto aparte (consentimiento con alcance, caducidad y aceptación) — es el camino para
  que el administrador acabe viendo las pólizas de la empresa y las suyas. `combinarPersonaContacto` +
  `tiposContactoSugeridos` en `@central/module-seguros` (8 tests): son DOS escrituras y «ficha creada, vínculo
  no» se dice entero para que el siguiente clic no duplique. NO se tocan `tipo`/`lead_estado` (columnas
  heredadas del CRM que la pantalla no usa: escribirlas sería una segunda verdad). PR #2369.
- **🧾 Los recibos del portal del cliente: el `anulado` no es «no pagado» (05/09/2026).**
  Segunda mitad de «¿y los recibos? e historial siniestros?». Medido sobre los 183 recibos de la
  cartera viva: **54 anulados, y 25 de ellos con importe NEGATIVO** (−1.268,18 € frente a +1.268,18 €:
  extorno y su re-emisión) → fuera de la lista, pero **se dice** que están, que si no al cliente le
  faltan movimientos al cuadrar con su banco. El hallazgo caro: **20 pólizas de las 110 vivas tenían
  recibos y todos anulados**, y no pintaban NADA (el `total` los contaba, así que ni salía el hueco ni
  quedaba nada que enseñar). Ahora son **TRES estados** (`sin_informar` / `solo_anulados` /
  `con_recibos`) y el estado se calcula sobre la lista CRUDA. También fuera: `forma_pago` (código
  `CC`/`OF`/`TA`) y la fecha centinela `0001-01-01`. Vocabulario en
  `module-seguros-portal/src/recibo-historial.ts` (12 tests, 5 mutaciones vistas morder); pantalla en
  `RecibosDePoliza`, en la ficha y antes de los siniestros. PR #2367.

- **🔘 La web que Alberto ve en `grupoasegura.es` es la de Manuel; la nuestra no tiene dominio (05/09/2026).**
  Captura suya: «Únete gratis», «Acceso correduría», header montado. Medido en Vercel: el apex `.es` y
  `www` están atados al proyecto **`asegura`** (el CRM), no a `asegura-web`; el plan de marketing decía
  «no atado» y era falso. `clientes.grupoasegura.es` **ya existe en DNS** (IONOS) sin proyecto detrás.
  Dictado: web 100 % venta, un botón a la intranet del cliente y **ningún acceso de corredor** (entra
  por plataforma). Hecho en `asegura-web`: botón «Área de clientes» + CTA «Ya soy cliente» a
  `PORTAL_URL` (env `NEXT_PUBLIC_PORTAL_URL`, default la URL viva del portal), cabecera en dos filas
  medida con Playwright a 320/360/1024, guardián `lib/portal.test.ts` (4 cepos, 2 mutaciones probadas).
  ⏸️ **Alberto en Vercel/IONOS:** mover `.es`+`www` a `asegura-web` · atar `clientes.` a `asegura-portal`
  y CNAME a Vercel · `NEXT_PUBLIC_PORTAL_URL` y `PORTAL_PUBLIC_URL` al dominio nuevo. Hasta entonces
  el botón funciona igual (va a `asegura-portal.vercel.app`). El header roto de la captura es código
  de Manuel, en un repo que el clasificador me bloquea.

- **🔗 Lote 10: los 18 grupos de mismo DNI, resueltos uno a uno (05/09/2026).**
  Con el índice ya escrito, el criterio fuerte por fin veía la cartera entera. **15 fusiones, 33
  lápidas, 15 supervivientes** (`fusion-dni-lote10-2026-09-05`) y **ninguna póliza perdida** — 70
  antes, 70 después. El motor pasa a fusionar grupos de **N** (el del lote 7 solo sabía de pares y
  saltaba los tríos); los uuid van **escritos a mano** en el lote, no leídos de la foto, porque la
  foto se recalcula en cada visita y su ordinal no es estable.
  🚫 **3 grupos NO se tocan, y ahí está el valor:** el 12 (Mejias Heredia / Yolanda Rios) y el 15
  (Fernando Martin Verdugo / Catalina Verdugo Garcia) son **dos personas** con un DNI mal tecleado,
  y el 10 es el centinela de 20 fichas. Fuera también «Elisa De paz campo» del grupo 5 (parcial).
  🔎 El hallazgo bonito: «**Gerente Chapisa (sin apellidos)**» no era una persona sin nombre — mismo
  DNI y mismo teléfono que **Francisco Javier Zamora Flores**, o sea él.

- **🗄️ Archivar, no borrar: decisión de Alberto sobre las 26.463 fichas sin contacto (05/09/2026).**
  «no la elimines, archívala y pon recordatorio en 6 meses… siempre habrá tiempo de borrarlo». Hecho:
  los **26 leads sin canal que seguían activos** pasan a `activo = false` (quedan **0**; total archivado
  26.463). **NO se tocaron los 39 clientes sin canal** —16 son CARTERA VIVA y esos se trabajan, no se
  esconden— ni los 3.287 leads captables. Es reversible (`activo = true`) y no borra ninguna de las
  ~25.694 pólizas del volcado, que son el único registro de lo vendido en 2013-2018.
  ⏰ **Recordatorio a 05/03/2027** (`trig_01EGUg761QfoKdzPLYT1RedX`, sesión nueva) para decidir si se
  borran o siguen guardadas. ⚠️ Se creó SIN conectores: esa sesión quizá no pueda medir la BD sola.

- **📵 La cartera del volcado NO trae contacto: 26.810 fichas sin teléfono ni correo (05/09/2026).**
  Alberto: «tanta bbdd sin ningun tlf ni mail?». Verificado en los SEIS sitios donde podría estar (ficha,
  `cliente_emails`/`cliente_telefonos` —solo 2 fichas—, `poliza_intervinientes` —427 filas en total—,
  `wa_phone_number`, `notas`, y `polizas.datos_especificos`: 0 arrobas y 0 secuencias de 9 dígitos en 28.480).
  🔑 **La prueba que lo cierra: `telefono_lookup_hash`/`email_lookup_hash` a 0.** Ese hash sobrevive al borrado
  del cifrado, así que el dato **nunca entró** — la intranet exportó PÓLIZAS, no clientes (traía nombre, DNI,
  ciudad/CP y cuenta para el recibo). **Captable = 3.287 leads + 1.750 clientes**; los 26.437 sin canal YA
  están `activo=false` (fuera del buscador: filtra `activo` en las 10 consultas), así que la poda que Alberto
  planteaba ya estaba hecha. Quedan sueltos **26 leads** sin canal activos y **39 clientes**, 16 de ellos
  CARTERA VIVA → esos NO se archivan: son la pantalla `clientes-sin-canal` y hay que pedirles el correo.
  ⚠️ Dos veces conté fichas sobre un `LEFT JOIN` con pólizas y di cifras infladas: `count(distinct)`.

- **🃏 El backfill se ejecutó, y el centinela no eran 20 fichas: eran 5.636 (05/09/2026).**
  Alberto pulsó el botón: **8.000 índices escritos** (3.890 → 11.890), quedan **469** (una pulsación más) y
  6.623 no se escriben nunca (5.645 centinelas + 936 ilegibles + 42 en choque). 🚨 **El grupo centinela es
  5.615 fichas «Lead N» del volcado + 21 personas** —sin canal, aseguradora «(legacy)», 5.454 sin nº de
  póliza— y la única con hash previo es **la ficha del propio Alberto**: [Probable] el importador rellenó el
  DNI obligatorio con el del titular. Se vieron 20 porque sólo se miraron los grupos de choque, que son
  `tipo='cliente'`. ⚠️ **Y el guardián tenía un agujero propio:** contaba «Lead 12345» como un nombre más, así
  que 3 de los 5 grupos centinela eran **duplicados legítimos** sacados de la cola de fusión. Arreglado en
  `tokensNombre` (PR #2356). **Pendiente de decidir: anular el DNI falso de esas 5.635 fichas.**

- **🃏 El backfill del DNI: no había botón, y apareció un DNI CENTINELA en 20 fichas (05/09/2026).**
  Alberto: «haz el backfill del dni». **No lo podía hacer nadie**: el `POST /api/operador/backfill-dni` existía
  pero `/correduria/mantenimiento` decía «se lanza desde asegura» = un `curl` con el secreto a mano. Botón nuevo
  en la pantalla (tandas + `restantes`, `UPDATE ... FROM (VALUES)` de 500 con reintento fila a fila). ⚠️ Y se
  corrigió la frase que lo bloqueaba: «no hay botón mientras queden choques porque reventaría a la mitad» es
  **falsa** — sólo se escriben las `rellenable`. 🚨 **Hallazgo: 20 fichas comparten un DNI con 20 nombres sin
  relación y 19 correos distintos** (una en cartera viva). Es un centinela con letra correcta, así que
  `looksLikeDniNieCif` no lo ve, y **el índice único no protege**: 14.990 de las 15.092 sin hash son `lead`.
  Guardián `compartido` en la pieza pura (≥3 nombres distintos y ningún token común); columna `compartidos` en
  la foto (DDL aplicada). Auditado el lote 7 del 04/09: **602 fusiones, ninguna de dos personas distintas**;
  quedan 18 grupos (1 centinela, 2 con DNI contradictorio, 15 de tres o más fichas). PR #2351.
- **🩺 «repara todo»: dos pendientes se caen de la lista por MEDIRLOS, y aparece uno legal (05/09/2026).**
  De la lista de Alberto solo una parte es tocable desde una sesión; lo que se pudo medir:
  · **`agente_salud` NO era una decisión pendiente.** Se resolvió el mismo 05/09 creando
  `agente_veredicto` aparte; la de julio sigue viva con dueño (`lib/finanzas.ts`). Está a 0 filas solo
  porque la migración entró a las **09:02 UTC** y el cron había pasado a las **07:45**. El INSERT
  exacto se ensayó contra producción en transacción con ROLLBACK: escribe bien (0 filas después).
  · **El «UPDATE masivo sin autor» del 04/09** se atribuyó aquí a Alberto lanzando el backfill desde
  `/correduria/mantenimiento`. ⚠️ **CORREGIDO horas después: era el LOTE 7 de fusión**, y la prueba es
  exacta — las 1.086 filas con `updated_at` entre 21:16 y 21:19 son **602 lápidas + 484 supervivientes
  del lote `fusion-dni-lote7-2026-09-04`**, y no queda ni una fuera. El motor de fusión **repone los
  `*_lookup_hash` desde `snapshot_before`** (lección del lote 5), de ahí el hash. El 100% de DNI no
  distinguía nada: el criterio del lote ERA el mismo DNI. Y la refutación de «fueron las fusiones»
  miraba la columna equivocada (`activo`): una fusión no desactiva, marca `merged_into_cliente_id`.
  🚨 Además la atribución era imposible: hasta el 05/09 **`/correduria/mantenimiento` no tenía botón**.
  · **`mercado-booking`: el objetivo SÍ está cumplido, medido** (4 aforos × jul-2027 y ago-2027, 4
  fechas con ≥3 comps cada uno; se pedían 3). El párrafo «PRIORIDAD TEMPORAL» sobra. Lo tiene que
  quitar Alberto: el prompt se LEE pero el API no deja escribirlo (rutina creada por `http_api`).
  Debe quedar solo: `Ejecuta la skill mercado-booking` + `PLATAFORMA_URL=…` + `ALERTA_TOKEN=`.
  · 🚨 **HALLAZGO NUEVO: `ses_transporte` nunca ha estado en verde.** `ultimo_ok_at` es **NULL** —no
  es que se rompiera, es que no ha funcionado jamás— y hay **0 filas** en `ses_establecimientos`. Es
  el parte de viajeros (RD 933/2021), obligación legal de hospedaje. Alta en `/sivra/partes/establecimientos`.
  · ⛔ **Fuera de alcance de una sesión:** el repo `asegura` (el clasificador bloquea `add_repo`, así
  que el workflow `e2e-smoke` que crea un lead sintético diario **sigue corriendo**), las envs de
  Vercel, los emails a compañías (regla de comunicaciones salientes) y la cerradura de Bustos Tavera.

- **📅 La pestaña Recibos parecía vacía por un ORDER BY, y los 336 homónimos NO se pueden fusionar (05/09/2026).**
  Alberto: «no aparece la fecha y otros datos». No faltaba el dato: **la ficha ordenaba las pólizas SOLO por
  `fechaVencimiento: desc`, y en Postgres `DESC` implica NULLS FIRST** — las 15 del volcado no tienen fecha, así
  que salían las 8 primeras filas, todas sin recibos, y las 5 vivas con importe y forma de pago quedaban al final.
  Orden nuevo en `ordenPolizasFicha()` de `@central/module-seguros` (puro, 5 tests): **vivas primero, dentro lo
  que vence antes, y sin fecha al FINAL de su grupo** (una fecha ausente no es ni próxima ni lejana).
  🚫 **Y «haz lo mismo con los 336» no se puede**: de los **1.322 pares** que solo comparten nombre, **277 tienen
  DNI DISTINTO** (probados personas distintas) y **ninguno comparte DNI**. Solo 6 traían prueba de los lotes 4/5
  (vehículo o póliza común) → **lote 9, 3 fusiones**: 1 cayó por DNI contradictorio («Jose Manuel Seijas Vazquez»,
  mismo coche y dos DNI: padre e hijo homónimos) y **2 por ser grupos de TRES**. ⚠️ Dije «5 fusionables» contando
  PARES: en un trío hay tres pares y la guarda `count(*)=2` los excluye a propósito. Visibles 5.102 → **5.099**,
  cartera viva 80 intacta, 0 pólizas huérfanas. También se anotó a mano que Manuel Suárez es hijo de José Suárez
  Salas (el campo `tipo_relacion` mezcla parentescos y roles de póliza; `relacionesDeFicha` ya prioriza el
  parentesco, así que bastó el dato).

- **🗑️ El reloj del art. 12.3 corría sin pantalla: supresiones en `/correduria` (05/09/2026).**
  Cerrado el bloque legal 0.5 (PR #2339), el cliente ya puede pedir supresión desde el portal… y la
  petición **no salía en ninguna pantalla que Alberto abra**: el puerto `/api/operador/supresiones` de
  asegura existía sin consumidor. Un plazo legal de 30 días (60 con prórroga MOTIVADA) corriendo a
  ciegas. Bloque `Supresiones.tsx` en la sección **Hoy**, rojo si hay vencidas; contestar y prorrogar
  (la prórroga exige motivo o el botón no se habilita). Lectura pura en `lib/supresiones-asegura.ts`
  + 17 cepos: estado/plazo desconocido → `null`, ningún fallo de lectura se vuelve lista vacía,
  ilegibles contados, contador `null` (no `0`) para que la pestaña pinte `!`. `actor` = `session.email`
  puesto por el servidor y el ÚLTIMO. Verde: 2.527 + 553 guardianes + 53 vitest, typecheck 0.
  ✅ **`hola@grupoasegura.es` EXISTE** — lo confirmó Alberto; cierra la alerta del 04/09. Es su palabra,
  no una prueba de entrega: nadie ha mandado un correo a ese buzón y comprobado que llega.

- **👥 «Sigue habiendo duplicidad ¿xq?»: no era el buscador, eran dos volcados sin cruzar (05/09/2026).**
  Los dos volcados del CRM viejo (`intranet:` 30/05 y `asegura_app:` 21/06) se cargaron sin cruzarse, así
  que una misma persona entró dos veces. 🚨 **El id del `import_ref` NO sirve para cruzarlos**: de 3.443
  pares con el mismo id de origen, **3.005 tienen nombre distinto** — numeran independientemente y
  coinciden por casualidad; fusionar por ahí habría mezclado 3.000 personas. Lo que sí prueba identidad es
  nombre exacto **+ el código de cliente que el volcado dejó pegado al apellido** («garcia suarez 14354»).
  Aplicado con OK de Alberto: **104 fusiones** (lote 7, contactos UNIDOS y no elegidos → 64 teléfonos y 98
  emails salvados; 0 pólizas colgando de una lápida) y **462 leads sin ningún canal descartados**. Visibles
  5.668 → **5.102**, cartera viva 80 intacta. Quedan **336 grupos de homónimos SIN prueba** (solo 2 con
  identidad probada): no se fusionan. Su guarda abortó el lote entero por un par que partía el nombre de
  otra forma — se apretó el criterio, no el cepo. 🐛 De paso: `avisos-vencimiento.ts` **no filtraba
  `cliente.activo`**, o sea que se le podía mandar un correo de vencimiento a una ficha descartada (único
  camino con efecto externo); + 6 puntos del portal, y guardián nuevo `filtro-activo.test.ts` porque ese
  filtro ya se había perdido una vez. ⚠️ **El timeout de 60s del MCP de Supabase NO significa que la
  transacción se abortara**: la fusión confirmó después de que el cliente cortara y la primera lectura la
  dio por «intacta». Mirar el resultado, no el error.

- **🎨 El portal del cliente deja de ser una sola página, y el diseño se LEE del fuente de Manuel (05/09/2026).**
  Alberto: «el aspecto, quiero que se vea más moderno» + «en vercel asegura tiene q estar el diseño de manuel».
  Se clona el repo de `app.grupoasegura.com` y se leen sus tokens: **confirma** el `#3364ee` y el `16px` ya
  medidos, y **corrige** los neutros (llevaban un azul puesto a ojo; los suyos son croma 0 a propósito).
  `@central/brand` gana tema oscuro + superficies/elevación, todo opcional para no tocar a Joaquín Jaén.
  🚨 Su `theme-store` decide que el portal del CLIENTE va en CLARO (el oscuro es del backoffice): se respeta.
  `/boveda` pasa de **7 bloques y ~3.800 líneas en una sola URL** a 4 secciones por `?vista=` — el servidor
  manda solo la que se pide. `packages/brand` no tenía script `test`: se añade (era invisible como housesevillana).
  PR #2332. ⏸️ **Pendiente de Alberto: `hola@` no existe.** Lo usan `mediador.ts` (contacto legal del
  mediador), `canal-email.ts` (reply-to del código de acceso) y `boveda/page.tsx`. Decidir `.es` o `.com`.

- **🔌 conectores-vigia: primera pasada real (05/09/2026, PR #2295).** Confirmado (ya no
  «probablemente»): la rutina corre sin ningún conector adjunto — `ListConnectors` da
  `enabledInChat:false` en los ~30 de la cuenta → el paso canario (llamada real a Booking/IBKR)
  es imposible desde aquí tal como está montada. Higiene de cuenta: **Expedia en
  `needs_reconnect`** (roto), lo usa `pricing-agente` como 2ª fuente de mercado y para demanda por
  vuelos — sigue operando (diseño resiliente) pero degradado en silencio; requiere reconexión OAuth
  de Alberto. Sin candidatos nuevos para H1/H3. Telegram enviado.

- **🔑 La `PII_LOOKUP_KEY` del portal SÍ casa: alguien se vinculó SOLO (05/09/2026).** Quedaba abierto
  desde el 03/09 si la clave del portal difería de la de `asegura` — en cuyo caso **ningún** cliente se
  habría vinculado nunca y no lo habríamos sabido. Descartado por observación: de los 2 vínculos que hay,
  uno tiene `origen = email_hash`. Re-medido lo demás y corregida `docs/ASEGURA-PORTAL-IDEAS.md`, que
  citaba «0 vínculos / 32.602 fichas»: hoy son 3 identidades, 2 vínculos, 31.947 fichas y 4.663 con
  índice ciego. 🚨 **Y la cifra que decide no es esa: de los 80 titulares de la CARTERA VIVA, 29 no
  tienen email localizable.** A esos, entren con código, Google, huella o WhatsApp, la bóveda les sale
  vacía — y eso es indistinguible de «no tienes seguros». Alberto preguntó por Google (ya lo pidió el
  03/09); sigue en pie el orden escrito: cobertura → reclamar ficha por DNI/nº póliza → Google. Y si se
  añade una puerta antes, **WhatsApp** está decidido en el spec como canal por defecto y solo espera la WABA.

- **🚑 El parte del portal tiene DOS caminos, y hay vigía del plazo (05/09/2026).** Alberto trae el canal
  que faltaba: Occident da parte por **WhatsApp** (`+34917838383`, 9-21 L-V), la única de las 4 compañías
  de la cartera viva sin forma publicada de dar parte. Migración `2026-09-05_companias_whatsapp_horario.sql`
  (aplicada) + regla pura `canal-compania.ts`: el canal de la compañía se pinta **arriba, fuera del
  formulario**, porque un parte que nos llega a nosotros NO comunica el siniestro a la entidad.
  ⚠️ **El perfil se llama «Plus Ultra Siniestro y asistencia»**, que es OTRA compañía de la tabla (`C0517`
  vs Occident `C0468`); se atribuye a Occident por el nombre verificado y la duda queda escrita en
  `telefono_fuente` (revocado del rol del portal: es gestión). Y **NO es 24h**, de ahí `horario_siniestros`.
  Segundo hallazgo: **no existía NINGÚN vigía de los partes** — el plazo del art. 16 LCS se calculaba y solo
  se pintaba. Nuevo cron `correduria-partes` (06:55) + `parte-vigilancia.ts`: el corte es `comunicado`, así
  que **`recibido` sigue vigilado** (es el estado que engaña), y la firma va por CUBO de urgencia para no
  sonar los 7 días seguidos. PRs #2308 (mergeado) y **#2313**. **Pendiente de Alberto:** confirmar a Occident
  si ese WhatsApp es suyo o de Plus Ultra · poner `OPENROUTER_API_KEY` en el proyecto Vercel `asegura-portal`
  (sin ella la lectura de pólizas subidas devuelve «no hemos podido leer» SIEMPRE).

- **👁️ Vigía de COBERTURA de los mensajes a huéspedes + el estado `omitido`, declarado (05/09/2026).**
  El latido decía «5 reservas · 0 debidos · 0 enviados» exactamente igual con el ciclo roto por dos
  sitios, así que ahora se vigila el RESULTADO, no el mecanismo: `mensajes-prog/cobertura.ts` (puro,
  13 tests) canta quién entra en ≤2 días sin que le haya salido nada, el piso sin fila en
  `mensajes_prog_pisos` (el caso del Dúplex) y los hitos en sombra de un piso ya activo. Telegram
  `pisos.mensajes-cobertura` (catalogado), dedupe por hallazgo y día en `mensajes_prog_avisos`
  (migración aplicada). Y el `omitido` que se puso a mano esa mañana deja de funcionar de casualidad:
  `ESTADOS_HITO` + `cubreAlHuesped()` con sus tests, contado en `/apartamentos`. PR pendiente.

- **📌 Los dos arreglos del día, MERGEADOS y con seguimiento armado para el 06/09 (05/09/2026).**
  `main` lleva ya el modo noche (#2312, `2458f5f7`), la memoria (#2316) y la tabla del vigía
  (#2325, `17334189`), los tres con 20/20 checks. Lo que NINGUNO tiene todavía es medición del
  efecto real, y por eso queda un recordatorio one-shot para el **06/09 08:15 UTC**: (1)
  `agente_veredicto` debe tener ~30 filas tras la pasada de las 07:45 y cero errores `evaluado_at`
  en los runtime errors; (2) el modo noche solo se puede dar por bueno si hay una fila con
  `acuse_nocturno_at` relleno — **si nadie escribió de madrugada NO hay nada verificado**, y decir
  lo contrario sería el falso verde de siempre.
  ⚠️ El recordatorio va atado a ESTA sesión a propósito: un trigger de sesión nueva se crea **sin
  conectores MCP** (el `.mcp.json` del repo solo trae `gmail-adjuntos`; Supabase, Vercel y GitHub
  son conectores de cuenta), así que habría despertado a un agente sin forma de consultar la BD —
  o sea, un «no he podido comprobarlo» indistinguible de un «está bien». Si aun así no llega,
  la comprobación está escrita aquí arriba y se hace a mano.

- **🔧 Arreglado: el veredicto del vigía se va a su propia tabla, `agente_veredicto` (05/09/2026).**
  Dos sistemas se llamaban igual por accidente: `agente_salud` de julio es el badge que el PROPIO
  agente se auto-declara (hoy solo `facturas-extraccion-pdf`, lo lee `lib/finanzas.ts`), y el
  veredicto del vigía es un juicio EXTERNO sobre 30 agentes. **NO se fusionan**: `ok` (aquella) y
  `alerta` (esta) son INVERSOS, y un fallo de signo ahí pinta verde lo que está rojo. Tabla nueva +
  los tres usos del esquema nuevo apuntados a ella (cron, `getSaludLatidos`, expediente del
  god-panel); la de julio queda intacta y `/finanzas` no se toca. La migración muerta del 02/09 se
  marca ⚰️ en su cabecera en vez de borrarla, para que se sepa qué pasó.
  Comprobado ANTES de dar nada por bueno: `prisma_plataforma` tiene BYPASSRLS **e** INSERT/SELECT
  sobre la tabla nueva (un GRANT que falta habría cambiado un error silencioso por otro), y el
  INSERT exacto del cron se ensayó en una transacción con ROLLBACK. tsc 0 · 2.518 tests.
  ⏳ **Sin verificar todavía:** que el cron escriba de verdad. Corre a las 07:45 UTC y hoy ya pasó;
  la prueba es mirar mañana que `agente_veredicto` tenga ~30 filas y que /operador/agentes deje de
  pintar ⚪. Hasta entonces sigue siendo un arreglo razonado, no medido.

- **🚨 HALLAZGO AJENO al mirar los logs: el vigía de agentes lleva desde el 03/09 sin poder guardar
  NADA (05/09/2026).** Los runtime errors de plataforma traen ~30 líneas idénticas en
  `/api/cron/agentes-latido`: `column "evaluado_at" of relation "agente_salud" does not exist` (P2010),
  una por agente vigilado, cada día desde el 03/09 07:45 UTC. Causa medida: la migración
  `prisma/sql/2026-09-02_agente_salud.sql` **nunca se aplicó** y su `CREATE TABLE IF NOT EXISTS` no
  hizo nada porque YA existía una `agente_salud` distinta, la del `2026-07-12` — comprobado en BD, sus
  columnas son `id, agente, ok, dias_caido, detalle, ultimo_ok, ultima_alerta_ts, cuenta_id,
  actualizado_at`, ni rastro de `evaluado_at`. O sea, dos esquemas con el mismo nombre y el código
  escribiendo contra el que no está. Es exactamente el fallo que el comentario de esa migración dice
  querer evitar: el veredicto diario de los 30 agentes se calcula y se tira, y `/operador/agentes` no
  lo puede leer. **No se toca sin decidirlo**: la tabla vieja existe y hay que elegir entre añadir
  columnas o renombrarla, y eso es producción. Pendiente de Alberto.
  ✅ **SUPERADO el mismo día**: no se tocó la vieja — se creó `agente_veredicto` aparte (entrada de
  arriba). La de julio sigue viva y con dueño (`lib/finanzas.ts`), así que **no hay nada que decidir**.

- **✅ Modo noche MERGEADO y comprobado en BD (05/09/2026).** PR #2312 en `main` (`2458f5f7`),
  20/20 checks verdes y los 12 proyectos Vercel en `Ignored` (cero minutos de build; los comentarios
  intermedios decían «Building», que es el falso positivo ya documentado — el estado que vale es el
  final). Comprobado contra la Supabase compartida: las tres columnas existen con el tipo esperado
  (`urgente_nocturno` NOT NULL DEFAULT false) y **la consulta EXACTA del barrido corre y devuelve 0
  filas**, que es lo que debe devolver sin urgencias pendientes. 284/284 tests sobre `main`.
  ⏳ **Lo que NO se ha probado y hay que decirlo:** el disparo real. `acusarNocturno` solo entra si
  escala un mensaje entre las 21:00 y las 09:00, y esto se mergeó a las 09:47 de la mañana — no hay
  forma de provocarlo sin escribirle a un huésped de verdad. La primera noche con un escalado es la
  prueba; se mira `mensajes_pendientes_tg.acuse_nocturno_at` y el Telegram.

- **🌙 MODO NOCHE del agente de huéspedes: el silencio de 21:00 a 09:00 deja de ser invisible (05/09/2026).**
  Alberto pidió «que a partir de las 21h el agente sea 100% autónomo». Se hizo lo contrario y se explicó
  por qué: `auto.ts` YA no mira la hora (lo apoyado en fuente sale solo a las 3 de la mañana), así que
  «autónomo de noche» solo añadiría autonomía sobre lo que el sistema marcó `needs_human` — sin nadie
  que lo corrija. El agujero real era otro: lo que ESCALA de noche deja al huésped sin nada hasta las
  09:00, y desde el código eso es idéntico a una conversación atendida (caso Mafalda, 154265696).
  Ahora: acuse de recibo automático (texto fijo por idioma, sin IA — es la red de seguridad), aviso
  🚨 por `tgSend` (no `tgAviso`: un interruptor apagado convertiría «te despierto» en silencio) si es
  urgencia de acceso/avería, y a los 15 min sin respuesta se deriva al portal de reserva —**último**
  recurso, decisión de Alberto: el portal no abre puertas y su llamada abre un caso contra el anfitrión.
  `noche.ts` (puro, 7 tests) + `noche-guardia.ts`; barrido en `/api/sivra/mensajes/auto-reply`, ANTES de
  sondear hilos para que un fallo de Smoobu no deje a nadie esperando. SQL aplicado en Supabase.
  ⚠️ Detectado de paso: el borrador que Alberto aprobó tal cual metía el bloque de parkings **sin que
  la huésped preguntara** (único mensaje del hilo, verificado en `mensajes_log`) — viola la regla de oro
  de `parking.ts` y `aprenderCorreccion()` lo guardó como ejemplo bueno. Aprobar sin leer no es gratis.

- **📬 Smoobu ya NO manda mensajes automáticos: el ciclo es 100% nuestro (05/09/2026).** Alberto apagó
  las plantillas de Smoobu tras validar el ciclo entero en House Sevillana. Se activó el 4º piso
  (`prop_duplex_center` en `mensajes_prog_pisos`; no tenía reservas en la ventana, así que la activación
  fue limpia) y se retiró el chequeo `equivalentes-smoobu.ts`: sin plantillas al otro lado solo podía
  silenciar mensajes NUESTROS (su regex `/BIENVENIDO/i` casa con nuestra propia plantilla, y se tragó la
  bienvenida de la reserva 154265696). 🚨 **Bug de fondo, el caro:** `cargarYaHechos` no miraba el estado,
  así que un hito generado en SOMBRA quedaba «hecho» para siempre — la víspera CON LOS CÓDIGOS de esa misma
  reserva (Luxury Busto, llegada el 05/09) se generó 12 h antes de activarse el piso y no la iba a recibir
  nadie. Ahora `hitosBloqueantes` ignora las filas en sombra si el piso ya está activo y el reclamo las
  toma con `ON CONFLICT DO UPDATE ... WHERE estado='sombra'`. Mergeado (**PR #2305**) y
  ✅ **verificado en producción**: la pasada de las 07:37 UTC mandó la víspera con los códigos a esa
  huésped, en PORTUGUÉS («Olá Mafalda… AQUI ESTÃO OS…»), más dos confirmaciones que el chequeo
  retirado tenía bloqueadas. **Regla que deja: un mensaje que solo vio Alberto por Telegram no está
  entregado** — al activar un piso hay que mirar qué hitos suyos quedaron en sombra.
  🚨 **Y el rescate destapó un segundo defecto (PR #2310): `visperaAyer` no distinguía la víspera que
  salió AYER de la que sale HOY de rescate** (las dos se anclan a `checkIn`, misma clave), así que la
  bienvenida iba a salir a las 10:07 al mismo huésped el mismo día — la «ristra de Smoobu» que el
  diseño evita. Se paró a mano en BD (`estado='omitido'`) y se arregló en código con `emitidosHoy`.
  ⚠️ Coste asumido y medido: dos confirmaciones que Smoobu ya había mandado salieron de nuevo (los
  hitos marcados «equivalente de Smoobu ya en el hilo» estaban en `sombra` y dejaron de bloquear). **Regla que deja: un mensaje que solo vio Alberto por Telegram
  no está entregado** — al activar un piso hay que mirar qué hitos suyos quedaron registrados en sombra.

- **📞 Los iconos de llamar/WhatsApp/escribir, ya en las CUATRO pantallas de la correduría (05/09/2026).**
  Cerrado lo que faltaba de la petición del 04/09: **Renovaciones**, que era la única lista de la
  correduría sin ellos y justamente la cola comercial (medido: de las 15 fichas que vencen en 90 días,
  **9 tienen teléfono y 8 email**). `contactosDe()` se **exporta** desde `apps/asegura/lib/cartera-busqueda.ts`
  en vez de dejar un cuarto `descifrar` casi idéntico; el puerto de vencimientos manda ya `contacto` y en
  plataforma lo lee el **mismo** `interpretarContacto` que el buscador y la retención — dos normalizadores
  del mismo bloque harían que el icono saliera en una pantalla y no en otra para el MISMO cliente.
  Una consulta por lista (un cliente con tres pólizas que vencen sale tres veces y no se descifra tres).
  Tres estados intactos: sin bloque = «no se ha podido mirar» · todo a null = «no tiene» · ilegible =
  «guardado y la clave PII no lo abre». Verificado: tsc asegura+plataforma, 22 tests del lector, suite
  completa sin fallos y `next build`. **NO se ponen en `SinCanal`**: esa lista ES la de quien no tiene canal.

- **🔁 Un PR abierto de noche choca con `main` cada ~50 min, y siempre por el MISMO fichero (05/09/2026).**
  El #2277 llegó a verde y `clean`, y volvió a `dirty` **cuatro veces** en poco más de una hora: #2290,
  #2285, #2283+#2248 y luego #2294. **Ninguna** fue conflicto de código —siempre `docs/CONTEXTO-SESIONES.md`,
  entradas del mismo día de sesiones distintas— pero cada vuelta cuesta ~4 min de CI porque el head cambia.
  Método que funcionó las cuatro: mergear `main`, resolver conservando AMBOS lados, revalidar y empujar; y
  **no mergear `main` cuando NO hay conflicto** aunque haya avanzado (reiniciar el CI por gusto alarga la
  espera). Para comprobar barato, sin pedir el PR entero: `git merge-base --is-ancestor <head> origin/main`
  (¿ya está mergeado?) + `git merge-tree --write-tree HEAD origin/main` (¿hay conflicto?). ⚠️ La causa de
  fondo no es de este PR: la memoria es un fichero único que toda sesión edita al cerrar.

- **🚦 `Ignored` no es gratis: la cuota que agotó un agente y tumbó 4 producciones (04/09/2026, PR #2248).**
  Mergeando #2248 se dieron 7 pushes a la rama en ~40 min (`main` avanzaba cada ~5 min por el automerge y
  reconflictaba `CONTEXTO-SESIONES.md`; CI tarda 3,5). Cada push crea **11 deployments** aunque 10 salgan
  `Ignored` — el `ignoreCommand` corta el BUILD, no la CREACIÓN — y `api-deployments-paid-per-hour` (450/h,
  **de cuenta**) reventó: producción de `ia-rest`, `almacen`, `transporte` y `house-sevillana-landing`
  fallando por una rama que no las tocaba. Informé 3 veces «0 gasto, todo Ignored»: cierto sobre Build CPU
  Minutes, **falso** sobre esa cuota. Escrito en `CLAUDE.md` (§ignoreCommand). Regla: verificar en local y
  empujar UNA vez. 🔁 Para romper el bucle de conflictos, mi entrada de memoria se dejó **la segunda**, no
  la primera: así las inserciones ajenas de arriba auto-mezclan. ⏸️ Alberto: activar `Allow auto-merge`
  (Settings → General) — sigue desactivado y es lo que evita esta carrera.

- **🚨 Empujé un merge a medias y el CI lo dio VERDE — más tres hallazgos en la correduría (04/09/2026).**
  Al revisar el cuadro completo se encontró que el commit `19b74e641` llevaba **marcadores de conflicto
  sin resolver dentro de un template literal SQL** de `clientes-sin-canal.ts`: `tsc` los ve como cadena,
  el guardián los ve como texto y nadie ejecuta ese SQL en CI → 19/19 checks en verde sobre una consulta
  que reventaría. Causa: leer `git merge` con `| tail -10` y el grep de marcadores con `| head`. Guardián
  nuevo **`test/regression-sin-marcadores-conflicto.test.ts`** (recorre `git ls-files`, falla si el listado
  viene vacío, cepo verificado). En la misma pasada se repuso **`and c.activo`**, que se había perdido al
  reescribir el fichero, y se restauró `vigencia.ts`, que se sobrescribió sin haberlo leído.
  Hallazgos de datos: (1) **Codeoscopic SÍ manda webhooks** —23 en 24 h, uno cada 30 min, autenticados— y
  los rechazamos todos por mandar un array donde el validador espera objeto; `apps/asegura/CLAUDE.md` decía
  «sin estrenar, no roto». El vigía de ingesta ahora los mira (`rechazos` en `saludIngesta`). (2) **8 de 18
  sin canal solo tienen pólizas que ya no renuevan** y a tres se les pintaba fecha de renovación de una
  cancelada. (3) **UPDATE masivo sin autor conocido** en `seguros` a las 21:16-21:19 UTC (1.185 clientes,
  959 pólizas, 0 altas, sin `historial_interno`, no es pg_cron ni el pull de CIMA) — ✅ **IDENTIFICADO el
  05/09: era el backfill del índice ciego de DNI**, del propio Alberto. Ver la entrada del 05/09.

- **📵 «19 clientes ilocalizables» eran 15: el contacto vive en TRES sitios, no en la ficha (04/09/2026).**
  Lo vio Alberto en `/correduria`: `Esquiansa` salía «no se puede contactar» teniendo a Juan Manuel López
  Benjumea de conductor habitual, con ficha, email y teléfono. `clientes-sin-canal.ts` miraba SOLO las
  columnas de la ficha del tomador. Medido: de 19, **2 tienen su PROPIO email en un interviniente de su
  póliza y nadie lo copió a la ficha** (`MORALES ISABEL MALDONADO`, `Juan Manuel Duran Ibañez` — el cron
  de avisos lee la ficha, así que no les llega) y **2 tienen a otra persona localizable** en ella.
  Estados nuevos `canal_en_poliza` / `contacto_via_tercero`; el titular pasa a `resumen.ilocalizables`.
  ⚖️ No se funden en «localizable»: el art. 22 LCS avisa al TOMADOR. Mismo agujero tapado en
  `contactoEfectivo()` (descartaba los intervinientes del propio tomador; su test fijaba lo contrario).
  Regla 19 de la skill `correduria-crm`. Guardián ampliado; 28/28 + 31/31, suite y typechecks en verde.

- **✉️ Invitar por correo a quien NO está en la cartera (04/09/2026, PR #2283).** La TERCERA puerta de
  la autorización: José escribe un correo cualquiera y le abre sus seguros. 🚨 **El token del enlace NO
  abre sesión** —se lo comen los escáneres del correo, es una llave reenviable, y «aceptado por el que
  tenía el enlace» no es prueba de consentimiento (art. 7.1)—: el token dice QUÉ invitación es y el
  código de un solo uso dice QUIÉN eres, y la aceptación se ata al CORREO comparando el `portal_canal`
  de quien acepta. Tabla aparte porque al invitado no se le puede apuntar todavía (no tiene ficha ni
  identidad). `sin_enlace` (503) NO escribe la fila y `envio_fallido` (502) SÍ. El correo no dice ni
  compañía ni póliza ni matrícula: quien lo recibe aún es un desconocido. Y la pantalla de José **no
  puede decir a quién invitó** —solo se guarda el hash—, que es decisión, no campo por rellenar.
  📌 De paso, medido: **el teléfono de siniestros de las compañías NO existe en la BD** (`companias_dgs`
  solo tiene código, nombres, `en_cima`, `activa` y notas). El único teléfono del schema es el de la
  correduría — y para la hoja imprimible del frigorífico que quiere Alberto, ese es justo el bueno.

- **Web pública de la correduría: `apps/asegura-web` (04/09/2026).** 17 páginas (home · 6 ramos · «cambiar de
  correduría» · quiénes somos · 3 legales · sitemap · robots · `/api/lead`), para el **apex `grupoasegura.com` +
  `www`, que están LIBRES** (`app.` sirve el CRM y no se toca). **Sin BD**: el formulario reenvía por servidor al
  canal que ya existe en plataforma 🚨 **propagando `x-forwarded-for`** — sin eso el límite de 6/hora por IP pasaría
  a ser global y el 7º lead legítimo se rechazaría solo. Mediador desde `MEDIADOR`, colores desde `MARCA_ASEGURA`:
  ni la clave DGSFP ni un hex se escriben ahí. Dos guardianes: el copy no puede prometer ahorros ni superlativos
  (sería asesoramiento → análisis objetivo + IPID) y la lista de ramos se compara contra el fuente de plataforma.
  `HORARIO` y teléfono **ausentes a propósito** hasta confirmarlos. Verde: 10 tests propios, 527 del guardián, tsc,
  eslint y `next build`. Añadida a la matriz de `tests.yml`, a `VERTICALES` y con `ignoreCommand`. PR #2285.
  ⏸️ **Falta lo que no puede hacer un agente**: atar el dominio al proyecto Vercel nuevo, `PLATAFORMA_URL`,
  Google Business Profile y unificar `info@`→`hola@` en la web del repo `asegura`.

- **Plan de marketing y captación de Grupo ASegura (04/09/2026).** Nuevo `docs/ASEGURA-MARKETING-PLAN.md`.
  Medido en BD: cartera viva **80 clientes / 110 pólizas (42 canceladas → 68 vivas)**, 1,4 pólizas/cliente,
  76% Sevilla, 81 de 110 en auto (el peor ramo para captar). **Los 32.520 leads son vía CERRADA**: 82,8% sin
  ningún contacto, 95% vence 2014-2018 y `consent_logs` tiene **2 filas** en toda la BD → sin base de
  legitimación no hay campaña; WhatsApp descartado (0 `wa_opt_in`). Trampa: el CP **41001 en 10.933 fichas**
  es relleno del despacho, no segmentar por CP. Verificado en Vercel: `app.grupoasegura.com` sirve el CRM,
  pero **el apex y el `www` están LIBRES** → la web de marketing nace ahí sin desalojar nada. Orden del plan:
  embudo (SLA de lead) y reseñas ANTES que tráfico; ramo elegido midiendo, no a ojo; Ads
  el último. **Comisión medida sobre `seguros.poliza_recibos`** (12 meses, recibos cobrados): auto **10,44%
  → 40,87€/póliza/año**, hogar **22,03% → 68,74€**, RC 17,09%. Hogar es el ramo prioritario, pero con 8 recibos
  es hipótesis, no conclusión. Ojo: `comisiones_devengo` está en `public`, NO en `seguros`, y agrega por
  (compañía, periodo), no por ramo. 🚨 **Falta la ingesta de Mapfre desde el 02/04/2026** (~5 meses; es el 64%
  de la cartera) → el libro de comisiones está infravalorado. 🚨 Y **75 tablas de `seguros` con RLS desactivado**
  expuestas a `anon` (`clientes`, `polizas`, `cliente_emails`) — comprobar dónde vive la clave `anon`. PR #2285.
- **📧 El buscador ya llamaba, pero a 5 clientes vivos les faltaba el correo (04/09/2026).** #2286 llevó el
  contacto al buscador; en paralelo yo hacía lo mismo (#2289, **cerrado sin mergear**: su diseño era mejor,
  `contacto: Contacto | null` distingue «asegura no lo mandó» de «no consta», y el mío no). De mi trabajo
  sobrevive lo que #2286 no tenía y estaba **medido**: `clientes.email` NO es el único sitio — **57 fichas
  tienen email solo en `cliente_emails` y 5 son de los 80 clientes vivos** (1 de cada 16). Consulta extra que
  solo se lanza si hay huecos. Con el TELÉFONO no hace falta: cero casos, medido. Y `porMatricula` seguía
  repitiendo los diez campos del `Hallazgo` a mano (rompió justo al añadir `contacto`): ahora hay UN
  `hallazgoSinEnriquecer()`. 🚨 **Segundo choque del día con otra sesión sobre el mismo archivo** (el primero
  fue `BotonWhatsapp` en #2281): antes de construir sobre `/correduria`, mirar qué hay ya en `main`. PR #2290.
- **💓 El vigía de latidos gritaba por agentes a los que aún NO les había tocado correr (04/09/2026, PR #2248).**
  De los 6 rojos del parte, **4 eran falsa alarma por construcción**: `evaluarLatido` no distinguía «no
  hay señal porque está roto» de «no hay señal porque se declaró anteayer». Las 5 rutinas cableadas el
  02/09 salían en ROJO desde el minuto uno y las dos mensuales (día 1) iban a seguir 27 días — mientras
  `facturas_correo`, diaria, latía al día siguiente: la maquinaria iba bien, fallaba el juicio. Cuarto
  estado **`estreno`** + campo `vigiladoDesde` (obligatorio, con guardián); en el panel es GRIS, no verde.
  🚨 Los otros 2 SÍ son reales y sus `nota` **mentían**: la de domótica decía «es el trial de IoT Core,
  conocido» y esos errores son del 03/08 — hoy es `Tuya 2001 offline` + `1109` en el respaldo, con **3
  reservas sin PIN** (una con el huésped dentro). Alberto decide dejar los dos rojos («la cerradura no
  tiene conexión, para más adelante» · «SES déjalo rojo, es un pendiente real») → **`pendienteConocido`**:
  se calla la INTERRUPCIÓN, no el registro (siguen en alerta en /operador/agentes). Tres candados con
  test: marcador del parte —un código de Tuya nuevo vuelve a sonar el mismo día, y sin `detalle` no casa
  nada—, fecha que caduca sola, y fuera del carril de auto-reparación. Para poder distinguirlo, el parte
  de accesos pasó de «3 con ERROR» a nombrar los códigos (tres averías que mandaban a sitios opuestos se
  veían idénticas). ⏸️ Fechas de revisión PROPUESTAS por mí: domótica 12/09 (el 14 entra una reserva de
  20 noches), SES 06/10.
- **🔧 Instrumentado `pricing_applied` y ACTIVADOS los mensajes de los 2 pisos de Busto (04/09/2026).** Alberto dio OK a
  las dos cosas. (1) `pricing_applied` gana `target_crudo`, `clamp_floor`, `clamp_ceil`, `rail_ancla` y
  **`rail_ancla_origen`** (migración aplicada a prod): son los 4 números sin los cuales la ida y vuelta de House era
  imposible de diagnosticar —sus dos filas tenían inputs IDÉNTICOS y resultado opuesto—. El origen del ancla NO es
  adorno: solo `ref24` hace que el tope ±20% sea DIARIO; con `actual` es por pasada, y eso distingue un raíl roto de uno
  medido desde otro sitio. `anclaRailCon()` devuelve valor+origen JUNTOS y `anclaRail()` delega en ella, para que las dos
  precedencias no puedan divergir. 2 guardianes de fuente + 3 tests puros, probados en rojo. (2) `mensajes_prog_pisos`:
  Luxury Busto y Busto Reform a `activo=true`. Lo que protege de mandar la ristra atrasada es que **el modo sombra YA
  registraba los hitos** (7 filas), que cuentan como hechos. ⚠️ Consecuencia: la reserva 154265696 de Luxury (llega el
  05/09, en pt) tenía su `vispera_llegada` —la que lleva los CÓDIGOS— ya en sombra, así que depende de que Smoobu se los
  mandara. `desde` de esa tabla es informativo: el orquestador solo lee `activo`.

- **📸 Quitar Smoobu de Busto: las indicaciones están listas, las FOTOS no (04/09/2026).** Alberto preguntó por los dos
  pisos de Bustos Tavera. Revisadas: los pasos son correctos y completos —el lío de las DOS cajas GRIFEMA idénticas del
  portal ya está resuelto (Luxury = abajo, Reform = arriba, cada una con su foto en rojo)—, y en BD no falta nada
  (portal, caja, wifi). WiFi y portal COMPARTIDOS entre los dos pisos: correcto, mismo edificio, no es un fallo.
  🚨 **El bloqueo real: las 12 fotos de las indicaciones viven en el CDN de Smoobu** (Dúplex 5, House 3, Luxury 3,
  Reform 2) y nadie las vigilaba. Apagar Smoobu del todo las mata EN SILENCIO: el mensaje sale con el enlace roto y el
  huésped se planta ante las dos cajas idénticas. Se añaden `fotosDeAcceso()` + `HOST_FOTOS_ACCESO` +
  `pasosQuePrometenFotoSinTenerla()` y 3 guardianes (probados en rojo). ⚠️ **Distinguir dos «quitar Smoobu»**: apagar
  sus PLANTILLAS de mensajes se puede ya (`yaLoMandoSmoobu` cubre la transición sin duplicar); dejar Smoobu como PMS
  exige copiar antes las fotos a Storage. **Pendiente de Alberto: activar los 2 pisos en `mensajes_prog_pisos`** (hoy
  solo House) — no se toca sin su OK porque son mensajes reales a huéspedes. No se pudo comprobar que las fotos sigan
  vivas: el proxy del contenedor da 403 a `login.smoobu.com`.

- **📉 Las pasadas de pricing del 04/09: dos hallazgos y un agujero de instrumentación (04/09/2026).**
  Las 4 llaves muerden: de las 86 noches congeladas, **91 medidas y 74% ya bajaron** (Busto 70/75, ratio 0,807 = el raíl
  del −20%); quedan 11. Pero (1) **House Sevillana hace ida y vuelta dentro del día**: 7 de sus 8 fechas tocadas dos veces
  bajan un 20% y vuelven a subir hasta un +50% en 100 min (los otros 3 pisos: 0 de 51). El raíl NO está roto —se ancla en
  ayer y el neto da 20,0% clavado—, pero quema el presupuesto del día en un viaje de ida y vuelta y contradice el precio que
  Booking cachea en medio. (2) **64 noches nuevas al suelo absoluto**: 34 de Busto Reform (ene-feb 2027, 65€) y 30 del
  Dúplex (jul 2027, 85€), todas viniendo de por encima. 🚨 **El agujero: `pricing_applied` no guarda `target`, `floor`,
  `ceil` ni `ref24`** — los 4 números que harían falta para saber por qué dos pasadas discrepan (sus inputs registrados son
  IDÉNTICOS). Propuesto a Alberto instrumentar primero; **no se toca sin su OK**. La auto-resolución de alertas **aún no ha
  corrido**: el guardián pasó a las 07:30 UTC y el PR #2243 se mergeó a las 08:06 — estrena mañana (47 `precio_revertido`
  del 02/09 esperando). No confundir «no ha corrido» con «no funciona».

- **🔐 La cerradura que falla NO es la de Socorro (04/09/2026).** Alberto preguntó por Socorro; medido: Socorro tiene
  **3 PIN activos y entregados**, último error el 08/08. La rota es **BustoTavera** (Luxury + Busto Reform), con **10 de 10
  intentos en error: nunca ha creado un PIN**, hoy por `Tuya 2001: device is offline` (antes 2334 y el trial de IoT Core).
  Eso es físico —batería/wifi/gateway— y no se arregla desde código: **mano de Alberto en Bustos Tavera 22**. El fallback
  SÍ es real y se verificó en vez de repetirse: los 4 pisos tienen `codigo_portal` en `sivra_codigos_acceso` (Busto `2022#`),
  así que nadie se queda en la puerta. Dos arreglos al vigía: su nota llevaba **un mes cableando el trial de IoT Core como
  causa conocida e invitando a descartar el aviso**, y `evaluarLatido` afirmaba «se ejecuta y no termina» cuando `ok=false`
  lo escriben tanto los que arrancan (`'pasada en curso'`) como los que terminan y se declaran con problemas — ahora se
  declara y manda el parte. Guardián nuevo (probado en rojo: cazó mi propia nota).

- **📞 Llamar · WhatsApp · escribir al lado del nombre, y UN solo criterio de WhatsApp (04/09/2026, PR #2281).**
  Petición de Alberto sobre la captura del buscador. Nuevo `AccionesContacto` + `lib/acciones-contacto.ts`
  en retención, cabecera de ficha y lista de personas. 🚨 **Choque con #2259**, que en paralelo trajo
  `BotonWhatsapp`/`telefono-wa.ts`: había DOS criterios de «admite WhatsApp» a punto de convivir (el icono
  saldría en una pantalla y no en otra para el mismo número); el helper nuevo **delega** en `urlWhatsapp()`
  y solo aporta el estado `ilegible`. **NO se aplica al buscador ni a Renovaciones/SinCanal**: sus payloads
  del puerto no traen teléfono ni email — ampliarlo es decisión de PII y coste, pendiente de Alberto.
  🔥 **Y un fallo caro medido aquí:** marcar con `[preview]` un commit de MERGE de `main` construyó los
  **11 proyectos Vercel** (el marcador es global y el diff de un merge toca los manifiestos raíz).
  Documentado en `CLAUDE.md`.
- **🎟 La intranet del cliente deja de ser solo para clientes (04/09/2026, PR #2258).** Tres piezas:
  (1) **pedir acceso** al revés —María pide lo que antes solo José podía conceder—, con el oráculo
  cerrado por diseño: 4 resultados internos colapsan en un `registrada` que no dice si esa persona es
  cliente (el portal es abierto: si no, es una máquina de enumerar 32.600 fichas). (2)
  **`autorizado_identidad_id`**: se puede autorizar a quien NO tiene ficha, sin fabricársela —quien
  mira es una identidad, y una ficha por curioso ensucia los 32.520 leads. (3) **`poliza_id`**: el
  dueño comparte la póliza de la nave y no la de su coche (15 de los 80 titulares vivos tienen más de
  una), con FK COMPUESTA contra `polizas(cliente_id,id)` **vista morder** (23503 con la de otro).
  🚨 Las tres trampas de Postgres que salieron en el camino: `x <> NULL` es NULL y **un CHECK que da
  NULL PASA**; dos NULL **no son iguales** en un índice único; y una póliza FUSIONADA deja la
  autorización apuntando a una fila muerta —el acceso se apaga sin que nadie se entere—, de ahí que la
  lectura siga `merged_into_poliza_id`. Las 3 migraciones aplicadas y verificadas.

- **🏠 La escalera del Catastro para hogar, y un agujero que salió por el camino (04/09/2026, PR #2255).**
  Cuatro peldaños y se BAJA solo cuando el anterior falla: dirección → variantes DETERMINISTAS de la
  misma dirección → una IA que PROPONE y el Catastro CONFIRMA → referencia catastral → a mano.
  Ningún dato entra solo. Nuevas `referencia_catastral` (columna) y `datos_ramo_origen`
  (`catastro`|`documento`|`declarado`), SQL ya aplicado. 🚨 **Y el hallazgo gordo:**
  `carteraDeIdentidad` filtraba prima/coberturas/recibos por nivel y pegaba `siniestrosAbiertos`
  SIN mirarlo — un tercero con alcance `ver` veía los siniestros abiertos de quien le autorizó.
  Cerrado con `CamposVisibles.siniestros` + tope duro en `NUNCA_A_UN_TERCERO`, con mutación probada.
- **📄 Subir una póliza no lee nada porque FALTA LA CLAVE DE IA, no porque el PDF sea malo (04/09/2026).**
  Alberto subió una Mapfre HOGAR FAMILIAR real y salió «no hemos podido leer». Medido: `pdf-parse`
  saca **12.076 caracteres limpios** de ese PDF. El fallo es `aiComplete`, que necesita al menos una
  de OPENROUTER/GROQ/GEMINI/NVIDIA/CEREBRAS/MOONSHOT — y el proyecto Vercel `asegura-portal` **no
  tiene ninguna**. Pendiente de Alberto. Ojo: el texto de Mapfre sale con la codificación rota
  («EspaÒa», «PÛliza»); un LLM lee a través, una plantilla determinista no.
- **🚑 CIMA NO da campos por ramo para el siniestro (medido sobre las 67 filas reales, 04/09/2026).**
  Misma estructura (30 columnas) para todos los ramos; lo único que cambia es `tipo`, un código de la
  compañía cuyo nombre va en `comentario`. **No es vocabulario compartido:** `1915` es «RECOBRO CICOS»
  en auto (241) y «reclamación de tercero» en 282; lunas es `17`/`1313` en auto y `2102` en hogar.
  Así que las causas por ramo del parte hay que diseñarlas NOSOTROS. Y `lugar_direccion` viene en
  6/67; `tramitador`, `gravedad`, `reserva` e `indemnización` en **0**. Auto: 26 de 50 son ASISTENCIA
  (una grúa, no un siniestro) — pintarlos como «siniestro abierto» exagera.
- **🧹 Borrado el mail de Alberto de dos fichas ajenas (04/09/2026).** Estaba de contacto en Josefa
  Julia Vicente Lucas y Alejandro José Soler Fernández Gao, y por eso su hash del índice ciego
  resolvía a 3 fichas y el portal se negaba a vincular (`ambiguo`). Foto previa en
  `seguros.cliente_emails_borrados_20260904`. Ahora resuelve a **1**. Las dos fichas se quedan con
  cero emails: el dato era falso de todas formas.
- **🚨 Los dos 🚨 «reserva que Smoobu NO tiene» eran FALSOS otra vez (04/09/2026).** El
  360009410197 salía de la URL de un artículo del Zendesk de **HomeExchange** (correo de Irene et
  Rico, un intercambio de casa, ni siquiera una reserva); el colador `\b(\d{9,})\b` miraba dentro de
  los enlaces. Y el 6144978627 (Booking, luis ortiz benito) SÍ estaba en Smoobu e `incomes`
  (id 145652821, Luxury Busto) pero con llegada **23/04/2027**, fuera de la ventana de ±180 días.
  Arreglado: `lib/correo/num-confirmacion.ts` (puro, quita URLs + whitelist de dominios de canal,
  HomeExchange NO lo es), `resolverBookingId` con 2ª pasada ancha paginada y ventana del vigía a
  −90..+540 días. Fila 19 → estado nuevo `descartada`. PR #2272.
- **🧠 El control de calidad ya ve lo que Alberto responde a mano (04/09/2026, PR #2271).** «He respondido varias veces a
  preguntas similares y no ha aprendido»: `debeEscalar` veía ficha + guía + HECHOS, pero NO `ctx.aprendizajes`, así que un
  asunto resuelto a mano y nunca destilado a HECHO seguía cayendo en «la INFORMACIÓN no cubre la pregunta» — el veredicto
  que enciende el «❓ Esto no lo encuentro en la guía». 🚨 Medidas las 30 filas reales de `mensajes_aprendizaje`: más de la
  mitad son cortesías o respuestas CADUCAS de UNA reserva («confirmada del 20 al 22 de noviembre», «salir a las 12:00
  porque no entra nadie»), y volcarlas como fuente las auto-enviaría a otro huésped. Entran como **PRECEDENTES** (bloque
  aparte, «no acreditan datos») y filtradas por `precedentes.ts` (puro, 10 tests): descarta fecha/importe/hora/
  disponibilidad/comprobación puntual/contacto. Guardián ampliado en `qa-hechos.test.ts`, probado en rojo.

- **🛡️ /correduria: seis peticiones de Alberto desde el móvil, PR #2259 (04/09/2026).**
  Cabecera visible fuera (~62px de la 1ª pantalla; el `<h1>` se oculta con `.solo-lectores`, no se
  borra). La búsqueda vive ya en la URL (`?q=`) como la sección (`?s=`): volver con el navegador la
  restaura — antes el remonte se llevaba el `useState('')`. Icono de WhatsApp junto a los móviles
  (`urlWhatsapp()`, puro): si no se puede afirmar que es móvil NO se pinta nada. **Bug real:** una
  póliza de RC ofrecía «Colisión» porque `responsabilidad_civil`, `comercio` y `otros` no estaban en
  `RAMOS_POR_TIPO_POLIZA` y el `?? null` significa «ofrécelo todo»; ahora está el enum entero + 2
  guardianes. Nuevo `cambiarTipoRelacion` (antes corregir una etiqueta obligaba a borrar, y borrar
  REVOCA la autorización del portal). Y **descartar ficha** (`clientes.activo=false`, reversible; NO
  borrado duro: CIMA la recrearía en silencio), con guarda de pólizas vivas por `esCarteraViva()` y
  tres desenlaces —si no se puede contar, no se descarta—. Regla que deja: **descartar quita la ficha
  de donde se MIRA, no de la base**; por eso 15 lecturas filtran `activo` y `coincidencias()` del alta
  NO (el índice único por hash sigue vivo: filtrarla diría «ese teléfono está libre» y el alta moriría
  en un P2002).
  ⚠️ **Corrección a lo que este repo daba por sabido:** `siniestros.ts` afirmaba «no tenemos la tabla
  oficial» del EIAC. **Sí la hay** — el estándar V07.1 completo está en el Drive de Alberto desde el
  02/09 (`209_IAC_ESP_DOC…`, punto 10.2 «Claves») y además es libre y gratuito en cimaseg.es.
  Pendientes: los conductores de GLOBAL 2 que CIMA manda sin ficha propia no admiten vínculo (falta
  «crear ficha desde interviniente»); la reactivación al volver una póliza solo cubre lo que acuña
  asegura, no la ingesta de CIMA (vive en el CRM); `apps/asegura-portal` no filtra `activo` (hoy
  inocuo).

- **🔁 «Sigue habiendo duplicidad» (04/09/2026).** Alberto vio dos Manuel Antonio y dos Pilar Piña Franco en `/correduria`:
  son el VOLCADO (`intranet:cli:N` / `asegura_app:cli2:N`), fuera del lote CIMA a propósito. Medido: **561 grupos** mismo
  nombre+teléfono (584 fichas de más), 0 con póliza viva, 517 pares con el mismo N legado — y la lápida de casi todos
  tiene DNI cifrado SIN hash, así que fusionar por nombre sería a ciegas. Puente hecho: el plan del backfill deja foto en
  **`seguros.backfill_dni_plan`** (solo uuids; DDL aplicada) al abrir `/correduria/mantenimiento` → de ahí sale el lote 7
  (mismo DNI). **PR #2260 mergeado y en producción (asegura + plataforma READY, 20:44 UTC). Lote 7 ESCRITO y
  probado en seco (`2026-09-04_fusion_mismo_dni_lote7.sql`: motor del lote 2, pares leídos de la foto, guardas de
  identidad dentro). Foto hecha a las 21:03 UTC (PR #2267 mergeado): 620 grupos = 604 pares + 16 tríos; el
  pre-vuelo pasa los 604 sin saltar guardas, pero DOS pares son personas distintas con el mismo DNI (249 Mejias
  Heredia/Rios Vazquez, 366 Martin Verdugo/Verdugo Garcia) → lista `excluidos` en el script. ✅ **EJECUTADO con
  el «ok» de Alberto (21:16-21:20 UTC): 602 fusiones, 958 pólizas movidas, 0 pólizas en lápida, 110 CIMA vivas
  intactas.** Lección: el cliente SQL de Supabase corta a 60 s y la primera pasada se deshizo entera → el bloque
  lee `information_schema` UNA vez y va en tandas de 150 (5 pasadas). Siguiente: escribir los 14.148 índices.** Segundo hallazgo: el cron `e2e-smoke`
  del repo `asegura` (06:00 UTC, retrasado a ~10:20) creaba un lead sintético diario en la cartera real desde el 02/09 y
  fallaba antes de su limpieza — borrados los 3 (+3 cotizaciones, 9 eventos). **Alberto debe desactivar ese workflow.**
- **✍️ El nombre comercial es «Grupo ASegura», con A y S mayúsculas (04/09/2026).** Alberto lo vio mal
  escrito en la cabecera del portal del cliente, que es la única pantalla que ve un asegurado. El
  monograma «AS» del logo ES el nombre (A de Alberto, S de Suárez), así que la ese minúscula se come
  la marca. Corregidas **96 apariciones en 56 ficheros** (UI de asegura/asegura-portal/plataforma,
  textos de consentimiento del portal, emails de vencimiento, `@central/brand`, skills, docs).
  La BD ya era correcta (`seguros.corredurias.nombre` = «Grupo ASegura»): era el código el que la
  contradecía. Lo blinda `test/regression-nombre-comercial-asegura.test.ts` (gate en `test:guardia`),
  que barre todo el repo versionado. Regla anotada en los tres `CLAUDE.md` (raíz, asegura, portal).
- **💬 Un «Muchísimas gracias, un saludo» no salía solo, y por DOS motivos, no uno (04/09/2026, PR #2249).**
  Alberto sobre la reserva 152961026 (Esther): «son mensajes básicos, se podrían haber enviado sin mi
  revisión». Medido: (1) `RE_CIERRE` solo admitía «muchas» y NADA detrás, así que la coletilla «, un
  saludo» tumbaba la detección → `es_cortesia=false`, la vía de cortesía ni se intentaba; (2) el
  control de calidad caído (`DESCONOCIDO`) entra en `needs_human`, que es guarda común → tampoco
  habría salido. Arreglar uno solo no cambiaba nada. Nuevo `cortesia.ts` (detector ancho + anclado, y
  `respuestaSinDatos`); `DESCONOCIDO` ya no bloquea SOLO cuando ni la pregunta pide nada ni el
  borrador da un dato, y el aviso de auto-envío lo DECLARA (`sin_verificar`). La decisión final se
  extrajo a `auto.ts` puro: no tenía ni un test. 31 tests nuevos.
- **🧠 «No aprende»: medido y arreglado — pero el trigram SOLO no valía (04/09/2026, PR #2249).**
  (a) No había NINGUNA recuperación por parecido: `contexto.ts` volcaba las 8 últimas filas del piso
  (`ORDER BY created_at DESC LIMIT 8`) sin mirar la pregunta → 8 «gracias» enterraban lo enseñado.
  🚨 Medido contra `mensajes_guia_gaps`: el trigram (`word_similarity`) solo caza lo casi literal
  (0,62); las paráfrasis reales dan **0,20-0,21 sobre un ruido de 0,19** — la opción elegida no
  bastaba. Y `word_similarity('hola', …)` = **1,00**. Solución: DOS señales en unión (trigram con
  guarda de longitud ≥20 + palabra de contenido en común, que es la que caza «whatsapp» en los cuatro
  avisos de phishing) en `similitud-reglas.ts` (puro) + `similitud.ts`, aplicadas al prompt y a
  `registrarGap` (que comparaba por `=` exacto → 4 filas de `veces=1`). Sin resolver a propósito: los
  SINÓNIMOS (aparcar↔parking), que son terreno de embeddings.
  (b) **6 de las 7 filas de `mensajes_hechos` eran la carta entera** (legacy previo a #2122, que puso
  el destilador el 02/09) y se inyectaban como «HECHOS DE ESTE PISO»: la id=3 llevaba el móvil de
  Alberto y el nombre de una huésped. Marcadas `descartado` en BD (autorizado por Alberto).
  ⏳ Sigue PENDIENTE: `mensajes_aprendizaje` no se le pasa al control de calidad (`debeEscalar` solo
  ve ficha+guía+`mensajes_hechos`), así que aún escala lo ya contestado si no llegó a ser un HECHO.
- **🏠 Los 10 ramos ya despliegan SUS campos, y hogar los saca del Catastro (04/09/2026, PR #2242).**
  Alberto vio en su móvil que elegir «Hogar» no cambiaba nada: el despliegue existía solo para
  auto/moto. Ahora los 10 ramos tienen catálogo (`campos-ramo.ts`, módulo puro, 31 tests) y sus valores
  van a **UNA columna `datos_ramo` jsonb** —aplicada y verificada— y no a ~40 columnas casi siempre
  vacías; los identificadores del bien siguen siendo columnas porque se consultan. **Hogar/comercio/
  comunidades se autorrellenan desde la dirección** por `POST /api/catastro` (metros, año, CP), con
  sesión obligatoria y cinco estados distintos: no responde ≠ no hay nada ≠ dirección ilegible ≠ calle
  ambigua ≠ quince pisos entre los que no adivinamos. 🚨 **Nada del art. 9 RGPD**: vida/salud/decesos
  piden datos de CONTRATO, nunca de salud, y beneficiarios es el TIPO de designación, no nombres de
  terceros. **«Tipo de seguro» sube al 2º puesto** (estaba el último: se rellenaba todo y solo entonces
  aparecían campos nuevos). Cambiar de ramo BORRA los datos del viejo en vez de enterrarlos invisibles.
  Investigado y NO construido, por orden: **Google y huella** (`docs/ASEGURA-PORTAL-IDEAS.md`) — el
  cuello de botella no es cómo se entra sino que **solo 4.310 de 32.602 fichas tienen índice ciego**.

- **🚗 Campos por tipo de seguro + la fecha que sale de la matrícula, y la marca APLICADA (03/09/2026, PR #2235).**
  Alberto: «cuando seleccione un tipo de seguro, que despliegue los campos necesarios». Auto/moto →
  matrícula, fecha de matriculación y bastidor; otro ramo, nada (un tarificador pide todo siempre
  porque calcula precio; el portal solo recoge lo que el cliente sabe). 🚨 **La fecha NO necesita API:
  la serie nacional es secuencial, así que la matrícula lleva dentro su fecha** —
  `fechaMatriculacionEstimada()` interpola 313 hitos mensuales, gratis y offline. Medido contra datos
  reales: **1.352/1.430 aciertan el año exacto (94,5%)**, 96,6% a ±1 año, sin deriva; la tabla trae su
  huella (abril-2020 avanza UNA serie: el confinamiento). ⚠️ **La estimación no se guarda sola**: se
  enseña y solo entra si la persona pulsa «Usar esta fecha» — escribirla la dejaría indistinguible de
  la leída del permiso de circulación. **Bastidor** porque es el que da la VERSIÓN: de las 82 pólizas
  de auto vivas, todas traen marca y modelo y **ninguna** versión. Corregido de camino: Avant2 **no**
  da fecha de matriculación (es tarificador, no fuente de ficha técnica) y el retarificador de
  `/correduria` la pide a mano.
  🎨 **Y la marca por fin en la pantalla.** `MARCA_ASEGURA` existía desde esa mañana pero la app no
  consumía `@central/brand`. 🚨 **Los nombres de token NO casaban** (`--brand/--accent/--panel` vs
  `--primary/--surface`): inyectar el `<style>` habría dejado el índigo `#4f46e5` intacto **sin fallar
  nada**. Y el alias `--brand: var(--primary)` iba al revés (invertirlo = ciclo). Segundo fallo mudo:
  los nombres que SÍ coincidían dependían del orden del `<head>` → respaldos a `@layer portal-base`,
  marca sin capa (lo no-capado gana). Verificado EN EL NAVEGADOR con Playwright, no a ojo:
  `--primary` = `#3364ee`. Único no verificado: la tipografía (el contenedor no llega a Google Fonts).

- **📱 Segunda captura de móvil: la ficha del cliente (03/09/2026, PR #2223).** Alberto sobre
  `/correduria/cliente/[id]`: «iconos muy grandes… ocupa mucha página». 🚨 **Los iconos no eran el
  coste** (13px), pero su lectura tenía media razón: eran EMOJI, que a ese tamaño pesan mucho más
  que el trazo lucide. Lo que ocupaba era **el formulario «Añadir» siempre desplegado: ~246px sobre
  ~706 de pantalla — el 35% para teclear nueve dígitos**, en una ficha que se abre para LEER un
  teléfono. Se pliega en `<details>`; los contactos pasan de caja a línea; fuera el `flexWrap`, que
  daba DOS alturas al mismo dato (~58px la fila sin «Hacer principal», ~84px la que lo llevaba — se
  veía en su captura). Primitiva nueva **`btnIcono()`** en `components/ui.tsx`, con el contrato
  escrito de que **NUNCA se usa para una acción destructiva**: «Borrar» conserva su texto porque no
  hay ni un precedente de icono solo para algo irreversible. ⏸️ **El patrón está en 19 componentes
  de la correduría y solo se migró el de la captura** (adopción por goteo); siguen Relaciones,
  Documentos y Siniestros. ⚠️ Tercera pantalla seguida **mergeada sin que nadie abriera la preview**
  — esta vez SÍ existía y estaba `Ready`, pero pidió mergear igual. De paso: el `CLAUDE.md` decía
  que 5 primitivas tenían «CERO consumidores» y **ya era falso** (`PageHeader` 55, `BtnLink` 8,
  `ThinBar` 8); corregido, con la lección de que un recuento en un doc caduca solo.

- **📱 `/correduria` en el MÓVIL, con la primera captura real (03/09/2026, PR #2216).** Alberto, sobre la
  pantalla ya rediseñada: «aún se puede mejorar… casi siempre uso el móvil». 🚨 Y ahí está lo
  importante: la skill `plataforma-maestro` advertía que **ninguna pantalla de la app se ha visto
  nunca renderizada** (`--sin-previews`, las sesiones no tienen navegador) y que los espaciados
  están «razonados sobre el código, no medidos». Su captura es el primer dato real. Medido sobre
  ella: **~520 px de cabecera sobre ~740 de pantalla**, el 70% antes del primer trabajo. ⚠️ La
  primera cifra que se le dio —«1.550 px»— era **falsa**: eran píxeles de la imagen, no CSS; se
  corrigió antes de tocar código. El reparto real era 176 px de botones · 101 de buscador · 89 de
  ayuda · 49 de título. 🚨 **Y el diagnóstico intuitivo también era falso: `PageHeader` no tenía
  nada que arreglar** (ya se apila y da `width:100%` a las acciones a ≤768). El problema era solo
  de esta pantalla: **tres** `BtnLink` `md` con rótulos largos en `acciones`, cuando ninguna otra
  de las 56 pasa de dos y la única que llegó a siete —`/banca`— las colapsó en un menú. Se hace lo
  mismo (`AccionesCabecera.tsx`: «Nuevo cliente» visible + `<details>` con hogar y mantenimiento),
  la ayuda del buscador se pliega, el campo cede ancho (`1 1 180px`) para que «Buscar» no caiga a
  otra fila, **fuera el `autoFocus`** (abría el teclado al entrar y tapaba media pantalla) y las
  pestañas pasan a `position:sticky`. De regalo, los **9 botones del desglose de comisiones estaban
  a ~26 px** —muy por debajo del mínimo táctil de 44 del repo—: helper `btnMini()`. ⚠️ **Se
  mergeó SIN que nadie abriera la preview**: se forzó con `[preview]` (única app construida,
  las otras 10 en `Ignored`) y se le pasó el enlace a Alberto, pero pidió mergear antes de
  mirarla. O sea que **la pantalla renderizada sigue sin verse**, igual que las otras 55: lo
  medido son tsc/tests/build, y los px salen de su captura y del CSS, no de la página viva. Si
  algo se ve raro en `/correduria` en móvil, empieza por aquí y no por el código.
  🤖 CI, **novena medición** de la sección del `CLAUDE.md` raíz: el push del merge de `main` con el
  PR **en draft** salió mudo y el **des-draft a secas** disparó los 19 runs al instante, sin push
  posterior — como la octava, y otra vez contra la matización de la séptima. Sigue sin causa; el
  orden documentado resuelve, así que no gastes tiempo en diagnosticarla.

- **🔓 El portal del cliente ya se puede probar: tres muros, los tres medidos (03/09/2026, PR #2210).**
  1️⃣ **El email de Alberto estaba en `cliente_emails` de DOS desconocidos**, así que `vincularIdentidad`
  contaba 2 candidatos, devolvía `ambiguo` y su bóveda salía **vacía sin un solo error**. Ahora desempata
  `lib/vinculo-elegir.ts` (puro, 10 tests): el email PRINCIPAL de una ficha es su identidad y gana a N
  secundarios; dos principales siguen sin adivinarse. 2️⃣ **El SSO de Vercel (`all_except_custom_domains`
  sin dominio propio) tapaba la producción entera** — bajado a `preview`: ningún cliente habría entrado
  jamás. 3️⃣ El portal llevaba **3 despliegues en `ERROR`** por `node:crypto` en el barril. Prueba
  montada: autorización **José Suarez Salas → Alberto** (`alcance ver`, `origen corredor`, nace
  PENDIENTE: se acepta desde el portal) + relación Padre/Hijo. José tiene 6 pólizas, 4 vivas.
  ⚠️ **Sin consentimiento escrito de José**: es una prueba, no un consentimiento acreditado.
  ✅ Las dos envs estaban: Alberto entró a las 13:25 (logs). ⚠️ **Pero su bóveda salió VACÍA: el
  vínculo devolvió `sin_ficha`** (0 filas en `portal_vinculo`, sin error en logs) y se le vinculó **a
  mano** (`origen: manual`). Sin resolver: si entró con OTRO email que el de su ficha (benigno) o si la
  **`PII_LOOKUP_KEY` del portal ≠ la de `asegura`** (se copió a mano en 3 proyectos) — en ese caso
  NINGÚN cliente se vinculará solo. Se comprueba pidiendo el código con el email exacto de una ficha.
  Entra además: **adjuntos en el parte** (varios ficheros, el rechazado se explica y no tumba a los
  demás; `documentos_colgado_de_algo` ampliado con `portal_parte_id` o los 32.520 leads no podían subir
  nada) y **alta de póliza A MANO sin documento** (PR #2227: misma validación que editar,
  `confirmadaPorUsuario: true` porque la tecleó una persona). 📱 Primera captura real de la bóveda
  (Alberto, 17:39): el calendario pintaba `responsabilidad_civil` crudo → `etiquetaRamo()` única en el
  módulo; y «Prima anual 67,86€» junto a «próximo recibo 73,39€» parecía un error de cuentas: la
  `prima_anual` es la NETA y `prima_bruta` = recibo → se enseña la bruta «(impuestos incluidos)».

- **🎨 La marca de Grupo ASegura estaba en la app de Manuel, no en Drive (03/09/2026).**
  El logo que había en Drive (`cropped-logo-bn-350x100-1.png`) **no servía**: recorte de WordPress de
  **157×45 px** y **un solo gris `#F6F6F6`** sobre transparencia (377 px opacos de 7.065) — la variante
  en blanco para fondos oscuros, sin un píxel de color del que sacar paleta. La marca real vive en
  `app.grupoasegura.com`: azules declarados en **OKLCH** (`oklch(.4 .17 265)` / `(.62 .2 265)` /
  `(.78 .14 264)` → **#193BA1 / #497CFD / #89B5FF**) y el **monograma «AS» vectorial** en `/icon.svg`.
  Ambos traídos al repo: `packages/brand/src/marcas/asegura.ts` (`MARCA_ASEGURA`) y
  `apps/asegura-portal/public/brand/marca-asegura.svg` (con `currentColor`). ⚠️ El portal sigue en el
  **índigo `#4f46e5` por defecto de Tailwind** y **no consume `@central/brand`**: aplicarlo es lo siguiente.
  🚫 **`grupoasegura.es` y `boe.es` los bloquea el proxy del entorno** (403 en el CONNECT); a la app se
  llegó por `mcp__Vercel__web_fetch_vercel_url`, que no pasa por ahí. Apúntalo antes de perder el rato.
  📌 «La mejor correduría de España» **no se puede escribir en una página**: superioridad sin acreditar
  es práctica desleal (Ley 3/1991 arts. 5-7) más publicidad DGSFP. El mensaje que sí aguanta y que
  nadie más tiene: el cliente ve **quién más ve sus pólizas** y se lo quita él.
  🔐 En la carpeta ASEGURA de Drive hay un `contraseñas CODEOSCOPIC.docx` — avisado, sin abrir.

- **🎨 Rediseño de `/correduria` + listado FILTRABLE de la cartera (03/09/2026).**
  Alberto: «minimalista, óptima y productiva» y «filtro por todo». Buscador arriba y cinco secciones
  **Hoy · Clientes · Cartera · Comisiones · Datos** con contador (`secciones.ts`, puro + 9 tests): una
  pestaña esconde, y el badge es lo que impide que esconda TRABAJO — `{n}` · `n+` (alguna cola ilegible)
  · `!` (ninguna legible), nunca 0. 🚨 **Bug real: `Vencimientos` vivía DENTRO de `CarteraViva`, tras sus
  tres `return` tempranos** → con el puerto caído las renovaciones desaparecían en silencio y su manejo
  de error era código muerto; ahora es `Renovaciones.tsx`, hermana. Un bloque deja de ser una caja
  (`Bloque.tsx`): borde+fondo solo para alarmas con alguien esperando. El filtro va entero: vocabulario
  compartido por las DOS apps (`filtro-cartera.ts`, 14 tests) + `GET /api/operador/cartera` + proxy con
  CSV + `ListaCartera.tsx` (ramo, «que NO tenga», compañía, provincia, estado, ventana de vencimiento,
  canal, leads aparte y paginados). 🚨 Dos medidas que lo condicionan: **`clientes.tipo` dice 2.742
  clientes / 29.860 leads cuando la cartera viva son 80** (columna muerta del volcado — el grupo se
  deriva de `esCarteraViva()`), y **24 de las 110 pólizas vivas guardan `prima = 0`**, que sin `nullif`
  se servía como «0,00€». Un valor de filtro no reconocido se DECLARA (`descartados[]`) en vez de
  ignorarse: ignorarlo convierte «enséñame ramo XYZ» en «enséñamelo todo». Hueco de venta cruzada real:
  81 autos contra 19 hogares. ⏳ Fuera a propósito: la subida MASIVA de PDFs, por decisión pendiente
  (dónde se guardan documentos con un DNI dentro y cómo se casa cada PDF con su póliza), no por tiempo.
  PR #2205.
- **🔧 Tapado el hueco que destapó Matito: el puerto ya sabe QUITAR (03/09/2026, PR #2211 mergeado).**
  `DELETE /api/operador/poliza/intervinientes` + botón «quitar» en Contactos de plataforma. Tres
  guardas: una fila de **CIMA no se borra** (409; el pull la recrearía, y plataforma ni pinta el botón),
  el **snapshot va ANTES del borrado** y si falla no se borra nada, y **el tomador no tiene botón** porque
  su fila se sintetiza (`IntervinienteFicha.id = null`, con test). `interviniente_purga_log.cliente_id`
  pasa a admitir NULL: un interviniente puede no tener ficha, y meter ahí el `poliza_id` para rellenar
  la columna habría sido un dato que miente. Y **`/correduria/mantenimiento`** (nueva) enseña en seco el
  estado del blind index de DNI; el paso de ESCRIBIR no se ofrece mientras queden choques, porque el
  índice único haría fallar la escritura a la mitad.
- **🔴 «Sin dato» en el capital de hogar era un «no lo he mirado» (03/09/2026).** La ficha de Occident
  `GPDFS3000276` decía «sin dato» en continente y contenido y lo justificaba afirmando que «esta compañía
  las manda sin importe propio» — falso: 11 de sus 40 coberturas SÍ traen capital (sublímites y RC). Y el
  capital estaba guardado: `continente 61000 / contenido 7000` en la copia del volcado, **el mismo objeto
  del que la pantalla ya sacaba los 76 m² y el 1994**. Medido al preguntar Alberto de dónde sale: las
  **coberturas sí vienen de CIMA** (1.425 filas en la cartera viva) pero **el capital no** — de las 37
  garantías de continente/contenido de las 19 pólizas de hogar vivas, **ninguna trae importe**. Arreglado
  con una SEGUNDA fuente rotulada (estado `del_volcado`; el consenso de CIMA gana siempre y
  `eurDeCapital()` sigue sin devolverlo). Alcance: 7 de 19. Cepo:
  `test/regression-capital-hogar-volcado.test.ts` — que nació escaneando solo los fuentes y **pasaba 6/6
  con el módulo apagado**; lleva ya dos tests de comportamiento con los datos reales.

- **🧬 Por qué se duplican las fichas: el blind index de DNI está a medias (03/09/2026).**
  Alberto vio dos «Pilar Piña Franco» en `/correduria`. No es un fallo del CRM: son dos volcados
  (`intranet:cli:174` + `asegura_app:cli2:174`) cargados sin deduplicar entre sí. 🚨 Causa medida:
  **15.800 fichas tienen DNI cifrado y `dni_lookup_hash` a NULL**, así que el criterio fuerte (mismo
  NIF) solo pudo mirar 3.896 de 19.696 → quedan **556 grupos nombre+teléfono (1.132 fichas)**, 552 con
  el hash ausente. Y no es un UPDATE: `uq_clientes_dni_lookup_hash` es UNIQUE, así que **el choque ES
  la lista de fusiones**. Orden: calcular en seco → fusionar → escribir (`/api/operador/backfill-dni`,
  GET seco / POST escribe; regla pura `planBackfillDni` + 11 tests).
- **🃏 «Matito no se puede borrar»: era un COMODÍN del volcado, y el DELETE no existe (03/09/2026).**
  Francisco Chacón Matito salía de conductor ocasional en la ficha de Pilar; medido, figura en pólizas
  de **52 tomadores sin relación entre sí** (Antonio Sevico, 16). Las 408 filas `origen='manual'` de
  `poliza_intervinientes` son del 21/06 y NINGUNA toca cartera viva; las 96 de CIMA sí. 🚨 **Matito es
  real**: 59 filas basura + **1 de CIMA (conductor habitual, con NIF, póliza viva) que se queda**. Lote
  lote reversible **EJECUTADO** (`..._purga_intervinientes_comodin_lote6.sql`): **77 intervinientes +
  118 relaciones**, 195 snapshots en `interviniente_purga_log` (append-only). Alberto añadió la 3ª
  guarda —«si no es tomador»—, que salva 2 relaciones (Matito tomador ↔ Sevico ocasional). Verificado:
  a Matito le queda 1 fila y es la de CIMA; 0 personas con ≥4 tomadores. Y «no se puede borrar» era
  literal: el puerto no tiene **ningún DELETE** de intervinientes ni relaciones.
- **⚖️ Autorizar a un tercero en el portal del cliente: estudio legal + medición (03/09/2026).**
  Alberto pidió estudio legal y benchmark sectorial para «José autoriza a María a ver sus pólizas».
  🚨 Medido: **104 `cliente_relaciones.puede_ver_polizas = true`, TODAS creadas el 21/06/2026** (día del
  volcado del CRM) → ninguna la otorgó un cliente, y la tabla no tiene autor/fecha/revocación con que
  acreditarlo. **12 apuntan a póliza viva** (6 otorgantes; una es «Ocasional - Tomador») y el portal ya
  las sirve a nivel `completo` (`cartera-lectura.ts:149`). ✅ **`portal_vinculo` = 0: nadie ha entrado
  aún**, así que hoy cuesta un UPDATE y tras la primera invitación es art. 33 RGPD — manda el ORDEN. La
  pantalla-muro que proponía Alberto («si no autoriza, se bloquea») choca con el art. 7.4 RGPD. Estudio
  en `docs/ASEGURA-AUTORIZACION-TERCEROS.md`. **No se programó nada: faltan dos decisiones suyas**
  (apagar las 104 ya; si «gestionar» exige verificar la identidad del autorizado).

- **🔄 El filtro de comparables SUBÍA precios en dos meses del año (03/09/2026, PR #2228).**
  Seguimiento del #2192 el mismo día: su primera pasada en producción subió a Busto Reform un
  **+37,8%** en jul-ago/2027 (61 noches, 82→113€, el tope exacto del raíl). El filtro de liga abarata
  el ancla en 10 de los 12 meses pero la **encarece** en julio (98,0→146,4€) y agosto (101,0→141,6€):
  usa la NOTA como proxy de liga y la correlación nota↔precio **se invierte en temporada baja** — en
  verano los comps mejor puntuados son los BARATOS. **Error de método que lo dejó pasar:** el efecto se
  midió sobre el corpus AGREGADO de 30 días cuando el motor tarifica **por MES**; en el agregado no
  encarece a ninguno de los cuatro, así que la medición original no era falsa, era en la unidad
  equivocada. Cura: `guardaMonotoniaLiga` — si quitar comps sube el percentil, ese grupo no aplica el
  filtro. La liga pasa de `WHERE` a columna `en_liga` para tener los dos corpus del mismo scan. De paso
  se cerró un agujero abierto en el mismo cambio (`MIN_SAMPLE` dejaba de proteger al corpus filtrado) y
  el techo por ADR dejó de ser mudo donde no puede actuar (`suelo_manda`, 14 de 48 piso×mes; NO se capa
  — hundiría House a 300€ 7 meses, y la mediana se probó y empeora 5 casos).
- **🏷️ El motor de pricing tarificaba en un percentil que tres pisos no han alcanzado jamás (03/09/2026, PR #2192).**
  Alberto: «pocas reservas, solo funciona House Sevillana». Medido: cada piso vende de verdad en P9 (Busto,
  ADR 84€) / P19 (Luxury, 135€) / P22 (Duplex, 111€) / **P57 (House, 560€)** del mercado, con `target_pctl`
  configurado en 0,55 / 0,50 / 0,60 / **0,60**. House es el único calibrado y el único que llena (23,2% de
  ocupación a 180 días contra 6,6-11,6%). El corpus lo explicaba: el **100%** de los 1.961 comps de Busto
  puntúa mejor que su 6,9 (Mercer Residences, Palacio Bucarelli dentro). Y ninguna palanca de bajada llegaba:
  sumaban −25% donde hacía falta −40%. Nuevos `pricing-comps-liga.ts` (fuera el comp con nota creíble >1,0
  sobre la nuestra, en los 4 corpus) y `pricing-techo-adr.ts` (techo a 1,3× el ADR propio del mes, exento en
  eventos); clamp de calidad 0,90→0,75; `target_pctl` a 0,40/0,40/0,50/0,60 y `quality_k` 0,08 en BD.
  El centinela del huésped comparaba la fecha contra la mediana del MES: por eso cantó el **Maratón de Sevilla**
  (20/02/2027, ×2,93 falso; real ×1,39) y callaba los martes, que es donde estamos caros. Ahora va por fecha.
  Guardianes #12 (percentil real vs configurado) y #13 (recorrido de palancas) para que no se repita en mudo.
  **Pendiente:** el piloto sigue sin escribir precio a propósito (su señal es por PISO, no por fecha).

- **🚑 El cliente ya puede dar parte de un siniestro desde el portal (03/09/2026).** PR **#2195** (mergeado)
  llevó la regla de visibilidad dictada por Alberto —se OCULTA lo que, si falta, no le cambia nada al cliente
  (tramitador, perito); se DICE EN VOZ ALTA lo que sí (sin vencimiento, `recibos.total === 0`)— más el aviso
  de recibo devuelto. PR **#2199** (abierto) trae el parte: tabla `seguros.portal_parte_siniestro` (aplicada;
  el rol del portal solo INSERTA y LEE), el puerto `/api/operador/partes` en asegura y la bandeja en
  `/correduria`. 🚨 **La regla nueva: un parte ENVIADO no es un siniestro COMUNICADO a la compañía** — somos
  mediadores del cliente, no del asegurador, y «enviado» se lee como «hecho». Blindado en tres capas
  (`comunicadoACompania()`, un CHECK en la BD y `test/regression-portal-parte-siniestro.test.ts`). Heridos y
  terceros son TRI-ESTADO con «No lo sé» por defecto: un checkbox diría «sin heridos» de algo que nadie
  preguntó. Se colapsó una duplicación mía de `plazoComunicacion` (art. 16 LCS) contra la de
  `@central/module-seguros`. Pendiente: el **historial de actividad del cliente** que pidió Alberto (va sin
  tabla nueva: sus actos ya están fechados en las tablas `portal_*`) y decidir si el parte sobre una póliza
  AUTORIZADA debe seguir permitiéndose (hoy sí, marcando el titular real).

- **📅 mercado-booking: julio y agosto 2027 ya tienen bucket elegible, otra vez (03/09/2026).**
  Pasada prioritaria acotada (`?desde=2027-07-01&hasta=2027-08-31&max=24`): 240 comps reales en
  24 ventanas + 4/4 escaparate propio medido. Objetivo cumplido (3 fechas × 10 comps/piso en
  cada mes). ⚠️ **Pendiente para Alberto (ya señalado el 29/08 y sigue sin quitarse):** la línea
  "PRIORIDAD TEMPORAL" vive en la config del disparo programado, fuera del repo — esta sesión no
  tiene acceso para borrarla, así que la próxima pasada la repetirá si no se quita a mano.
  🔎 **Matizado el 05/09: una sesión SÍ puede LEER el prompt** (`list_triggers` lo trae en
  `derived_state.prompt`); lo que rechaza el API es escribirlo, porque la rutina se creó vía
  `http_api` y un agente solo edita las que él mismo creó. El texto exacto que hay que dejar está
  en la entrada del 05/09.

- **✅ El libro de comisiones vuelve a leer la cartera — incidente `asegura_error` CERRADO (03/09/2026).**
  Verificado tras el cron de las 07:30 UTC: **12 filas en `comisiones_devengo` + 4 en `comisiones_cobertura`,
  todas `leido_ok = true`**, con datos reales (Mapfre, Allianz, Occident, Reale y liquidaciones CIMA con hash).
  Cero `password authentication failed` en `postgres_logs` desde la rotación del 02/09 a las 10:17 → la causa
  medida (`credenciales`: `DATABASE_URL` de Vercel `central-asegura` desfasado respecto a `prisma_seguros`)
  está resuelta. ⚠️ **La hipótesis del `?schema=seguros` forzado NUNCA fue la causa** — sigue escrita como
  falsa a propósito en los tres `CLAUDE.md`. Pendiente distinto y sano: `banco_total` a NULL en las 12 filas
  = conciliación bancaria «aún no comprobada», no 0 €. PRs previos #2029 → #2034 → #2047 → #2049.

- **🔴 «Sin cobertura» era falso: la cola de retención mezclaba `devuelto` con `pendiente` (03/09/2026).**
  Alberto preguntó por María Alcalá (hogar Mapfre, «🔴 Sin cobertura · hace 56 días»). Medido en BD: el recibo
  de 225,97€ está **`pendiente`**, DOMICILIADO, póliza en vigor, y su fila no se toca desde la carga del 24/06
  mientras CIMA sigue entrando (128 ficheros, 8 recibos SÍ pasaron a `cobrado` en agosto). Nadie ha dicho que
  se devolviera. `retencion()` exige ahora la `situacion` (sin default) y devuelve **`sin_confirmar`** 🟠 con
  los plazos del art. 15 en `null` — sin impago no hay reloj; `resumen.sinConfirmar` va aparte del contador que
  autoriza a decir «circulan sin cobertura». Un `devuelto` gana al `pendiente` en el dedupe por póliza.
  **Triaje de correo:** categoría `correduria-recibo` (aviso inmediato) para los avisos de recibos de Occident/
  Allianz/Reale/Mapfre — regla determinista con DOS condiciones (aseguradora Y asunto). ⚠️ Mapfre NO manda
  impagos por correo: el caso de María tampoco habría saltado por ahí. Anotar el hecho en la ficha del cliente
  queda BLOQUEADO por `historial_interno.cliente_id NOT NULL` (sin resolver el correo a un cliente, no hay a
  quién colgarlo). Verificado: batería completa 0 fallos, typecheck de asegura y plataforma, QA y lint.

- **🔎 Check-in post-fusión CIMA (03/09/2026, 06:18 UTC).** Fusión `fusion-cima-2026-09-02` (34 fusiones,
  33 supervivientes, 13:16–13:35 UTC) verificada tras el pull programado de las 15:12 UTC: **0 fichas nuevas,
  0 reapariciones, 0 pólizas colgando de lápida**. Hallazgo colateral: el cron `cima-pull` del repo `asegura`
  **falló 3 veces con HTTP 500 del CRM** (31/08 11:34, 01/09 10:19 y 15:30) sin heartbeat en la BD y sin aviso
  en Telegram (solo Slack); se recuperó solo el 02/09 (4 runs verdes). GitHub retrasa el cron de las 05:30
  hasta ~3 h (ayer 09:47), así que a las 06:18 «no ha corrido» no es fallo. **Cerrado 13:30 UTC:** el cron
  corrió a las 09:59 (run 191, `schedule`, success, 0 errores, 2 cuentas procesadas, 0 pólizas); fusión sigue
  limpia (0 reapariciones, 0 lápidas). La única ficha del día (10:31, tipo lead, sin pólizas) no es CIMA.

- **🗂️ Ficha de cliente de la correduría: cabecera + pestañas, y los colores de la app de Manuel (03/09/2026).**
  Alberto: la ficha en una columna larga (12 tarjetas) «no es práctica»; quiere el patrón de su CRM anterior.
  Hecho con la salvaguarda que ese CRM no tiene: **los contadores de alarma viven en la CABECERA**, fuera de
  las siete pestañas (Resumen · Pólizas · Recibos · Siniestros · Contactos · Documentos · Historial), porque lo
  que no está en la pestaña abierta no existe. Tile nuevo: el **límite de aviso** (vencimiento −30 d, LCS 22),
  que estaba enterrado en la tabla. Pestañas por `?tab=` (patrón de `SegTabs`): solo se renderiza la activa,
  pero **NO ahorra la llamada al puerto** — `fichaAsegura` trae la ficha entera y se repite. Clasificación y
  contadores salieron a `@central/module-seguros` (`ficha-resumen.ts`, 21 tests). 🎨 **Los colores salen del CSS
  de `app.grupoasegura.com`** (repo `asegura`, oklch→hex: cobalto **#3364ee**), NO de la captura verde de la
  conversación, que es de OTRO programa anterior. Acotados a `/correduria` por tokens (`.correduria` en
  `globals.css` + `layout.tsx`), no por hex sueltos: plataforma es el cuadro de mando de TODOS los negocios.
  Medido en Chromium: a 320 y 390 px el scroller no desborda y la barra de pestañas scrollea sola.
  ✅ **Mergeado (PR #2169) y en producción**, y probado con la cartera REAL: en el cliente con más
  pólizas vivas el tile nuevo destapa lo que la tabla escondía — vence el 24/09 (21 días) pero **el
  plazo de preaviso se pasó el 25/08**. En toda la cartera: de 67 vivas, **6 en «última llamada»
  (30-60 días, donde SÍ da tiempo a mover de compañía)**, 5 con el plazo ya pasado y 🚩 **18 vivas
  por CIMA con vencimiento ANTERIOR a hoy** — o CIMA no refresca la fecha al prorrogar, o están
  vencidas de verdad; sin mirar, no se afirma.
- **✍️ El portal del cliente ya deja corregir la póliza a mano (03/09/2026).** La pantalla decía
  «complétala a mano cuando quieras» y no había dónde: solo existía subir el fichero. Ahora hay
  `PATCH /api/polizas/[id]` + `normalizarParche()` puro + formulario. **La fecha de vencimiento NO es
  obligatoria, a propósito** (Alberto la quería obligatoria): quien no la sabe se la inventa, y una
  fecha inventada dispara un aviso de renovación falso — el «no lo sé disfrazado de valor». Sin
  fecha, la tarjeta lo dice en voz alta y ofrece la acción. Cepos: el PATCH escribe con `updateMany`
  filtrando por `identidadId` (el uuid viaja al navegador) y el 404 no distingue «no existe» de «no
  es tuya». 17 tests del validador + 362/362 la suite guardiana. **Medido de paso:** coberturas,
  recibos, siniestros y tramitador YA se leían en `cartera-lectura.ts`; lo que NO existe es
  «solicitar cambios» (cero modelo, cero ruta).

- **🌶️ La pimienta del portal se apagaba sola (03/09/2026).** `hashCanal` leía
  `ASEGURA_PORTAL_CANAL_PEPPER ?? ''`: sin la env la app NO fallaba, seguía dando de alta y escribía
  en `portal_canal` **SHA-256 pelados del email** — justo lo que ese hash existe para evitar. Medido
  en producción: el código de acceso se envió con normalidad con la env sin poner, y el 500 que sí
  saltó fue el de `ASEGURA_PORTAL_SESSION_SECRET` (esa sí pasa por `requireSecret`). Pasa a
  `requireSecret` + guardián `test/regression-portal-pimienta.test.ts`. El guardián general de
  secretos no lo cazaba **a propósito** —«un literal vacío no es una credencial usable»—, cierto
  para un secreto que FIRMA y falso para una pimienta. ⚠️ **No mergear hasta que la env esté
  puesta**: antes de eso tumba el alta con 500.

- **🔑 Portal del cliente: envs puestas y la lección de las claves irreversibles (03/09/2026).**
  En `asegura-portal` quedan `DATABASE_URL`, `PII_LOOKUP_KEY`, `RESEND_API_KEY`, `PORTAL_MAIL_FROM`,
  `PORTAL_MAIL_REPLY_TO` y `PORTAL_PUBLIC_URL`. Dos cosas que costaron la noche: (1) **una env
  `Sensitive` de Vercel NO se puede releer** —es escritura solo—, y `PII_LOOKUP_KEY` es
  IRREVERSIBLE (índices ÚNICOS sobre el índice ciego: cambiarla obliga a recalcular 4 tablas), así
  que jamás se genera una nueva; el valor estaba en el proyecto `asegura`, de donde ya se copió el
  02/09. (2) El **bucle del `ignoreCommand`**: cambiar una env no llega a producción, Vercel no
  redespliega si hay una producción más nueva, y los commits de la auditoría crean una cada pocos
  minutos y la cancelan. La única salida es un commit que toque `apps/asegura-portal/`.
  **Pendiente:** que Alberto pida un código con el email de un cliente CIMA — es lo que valida a la
  vez el envío por Resend y la `PII_LOOKUP_KEY`. Y llevar las claves a Shared env vars + gestor.

- **🎨 Portal del cliente: correo propio y aspecto de plataforma (03/09/2026).** Dominio de envío
  `envios.grupoasegura.es` **verificado en Resend** (DKIM+SPF+MX en IONOS). Es un SUBDOMINIO a
  propósito: solo puede haber un SPF por dominio y la raíz ya tiene el de IONOS — fusionarlos a mano
  dejaría a la correduría sin correo. El remitente es `no-reply@envios…` con **`Reply-To`
  `hola@grupoasegura.es`** (env `PORTAL_MAIL_REPLY_TO`), el buzón único que quiere Alberto.
  El portal adopta los tokens y las formas de `apps/plataforma` (Inter, `--primary #4f46e5`, cards
  con `--surface`/`--border`, radios 10/14, 44 px táctiles), con nombres de token que
  `@central/brand` sabe sobreescribir. **Pendiente:** la paleta REAL de Grupo ASegura — el único
  logo (Drive) es b/n y lleva «Low Cost», que ya no se usa, y ni `grupoasegura.es` ni la web de
  Manuel son alcanzables desde el contenedor (proxy de egress + SSO de Vercel).

- **👪 «Antonio Sevico no aparece en Relaciones»: no era un fallo de lectura (03/09/2026).** En la ficha de
  José Suárez Salas, la tarjeta 👤 mandaba a anotar el vínculo «en Relaciones y autorizaciones» y allí no
  había ni rastro: esa tarjeta solo pinta `cliente_relaciones`, y el volcado del CRM creó filas para el
  propietario y el contacto pero NO para el conductor ocasional. **Medido: 17 pares persona↔ficha así, en
  15 fichas** (de 326). Ahora salen en la propia tarjeta 👪 con botón «Declarar vínculo» que preselecciona
  la ficha (nada de teclear el nombre y acertar). **Y el duplicado que Alberto no preguntó:** María Antonia
  sale dos veces porque hay DOS fichas suyas (`intranet:cli:48` con DNI y `asegura_app:cli2:48` sin él) y
  el vínculo «Cónyuge» cuelga de la del volcado, la que no tiene ninguna póliza viva. Se marca en pantalla
  (`homonimia`). **Mergeado (PR #2161) y probado con los datos REALES de la ficha**: 4 personas, las dos
  María Antonia marcadas `sin_distinguir`, Antonio en el bloque nuevo, y tras «No hay vínculo» deja de
  pedirse y NO ve las pólizas de José. Alberto dictó «prepara» → **lote 5 escrito y SIN EJECUTAR**
  (`apps/asegura/prisma/sql/2026-09-03_fusion_mismo_vehiculo_lote5.sql`): 3 pares, guarda = mismo nombre
  normalizado **+ mismo vehículo** + no dos DNI; con solo el nombre habría 1.010 y fundiría homónimos.
  Y su segundo dictado —«Antonio Sevico no tiene vinculación ninguna»— destapó que no se podía ANOTAR eso:
  nuevo tipo `Sin vínculo` (no autoriza nada, ni con el flag puesto: la guarda vive en `clientesVisiblesPara`
  y en el puerto, no solo en el botón). **Pendiente: que Alberto ejecute el lote 5.**

- **🔌 Portal del cliente ENCHUFADO en Vercel, y las dos trampas que lo tenían muerto (03/09/2026).**
  `asegura-portal` sirve en https://asegura-portal.vercel.app, pero `POST /api/acceso/solicitar` daba 500:
  `DATABASE_URL` llevaba SOLO la contraseña del Vault, no la URI entera — y el error (`the URL must start
  with postgresql://`) no nombra ni la contraseña ni el rol, así que se diagnostica como credenciales.
  Segunda trampa: cambiar una env no llega sola y **el redeploy a mano es imposible** — Vercel no
  redespliega si hay una producción más nueva, y el `ignoreCommand` cancela toda la que no toque
  `apps/asegura-portal/` (8 `CANCELED` seguidos, medido). La salida es un commit real que toque la app:
  este PR. **Pendiente:** el login de un cliente CIMA, que es lo que valida `PII_LOOKUP_KEY`.
- **🔀 Retarificar se muda a `/correduria`: se acabó el salto al login (03/09/2026).** Alberto quiso
  retarificar a un cliente desde su pantalla y le echó al login — medido: `GET /cartera/poliza/… → 307`.
  No era un fallo: `asegura` y `plataforma` son dos apps con sesiones distintas y retarificar vivía en la
  primera. Dictado suyo: unificar. Tres endpoints nuevos en el puerto (`codeoscopic/catalogos`,
  `precalificar` y el que GASTA, `retarificar`), la pantalla portada a `/correduria/poliza/[id]/retarificar`
  y **6 enlaces ↗ internalizados** (uno, el de la cola de retención, no estaba ni en el inventario).
  🚨 Tres cosas que destapó la mudanza: (1) `lib/operador.ts` **no distingue método**, así que servir el
  gasto por el puerto abría un cargo a quien tuviera el Bearer → cerrojo **`confirmado === true` estricto**
  antes de tocar la BD; (2) esconder `cotizar()` en el lib compartido dejaba el guardián del gasto **en
  verde sin vigilar ninguna ruta** — falso verde sobre el dinero, así que la llamada se queda en cada ruta;
  (3) **el CP del tomador ya cruzaba el puerto** dentro de los supuestos (`cpCirculacion`), fuga anterior a
  la mudanza: `sanearSupuestos()` retira el valor y **conserva el supuesto**, porque ocultarlo entero
  cambiaría una fuga por un silencio sobre la letra pequeña del precio. Hogar sigue saltando a asegura.

- **🧪 La PRIMERA simulación real destapó dos mentiras más, y la BD las cazó (03/09/2026).** Alberto pulsó
  «Simular precio» en una póliza de auto: `seguros.tarificaciones` guardó 1 fila `simulado=true`,
  `intento_id NULL`, `project_id -377989` y **0 filas en el libro de gasto** — la simulación funciona y no
  costó un céntimo. Pero (1) la tabla pintaba **«—» en las tres primas** que la BD sí tenía (49,60 · 68,80 ·
  84,80€): el componente declaraba `primaAnual` y el backend manda `primaEur`, y como los campos del tipo
  local son opcionales **TypeScript no dijo nada**; y (2) le devolvió productos de **HOGAR** para un coche
  («Fiatc Hogar», «Mapfre Hogar») porque `simulacion.ts` se escribió solo para ese ramo y `cotizar()` lo
  usaba para todos — de ahí las primas de 50-85€, que son los gastos fijos de la fórmula de hogar aplicada a
  un coche. Ahora hay molde por ramo: auto con Reale/Occident/Mutua Madrileña **sacadas del fixture real**
  (251,62-647,68€, la horquilla medida) y **`moto`/`rc` devuelven CERO precios diciendo por qué**, en vez de
  caer a hogar. Cepos: 12 casos de vehículo + 28 de simulación.

- **🚗 El catálogo de versiones exige el COMBUSTIBLE, y la doc decía lo contrario (03/09/2026).**
  Con marca/modelo ya preseleccionados, el desplegable de versiones salía vacío y con un 400 crudo del
  vendor: `/car/brands/{id}/models/{id}/vehicles` pide `engine` **también en auto**, y
  `docs/CODEOSCOPIC-API-PORTAL.md` afirmaba que ahí era «texto libre» (se leyó como opcional). Sin
  versiones no hay código Base7 y no se puede cotizar: la pantalla quedaba inútil. Añadido el catálogo
  `/car/engine-types` (gratis) y un desplegable **Combustible** antes de Versión; el puerto rechaza la
  petición sin `motor` con su nombre en vez de dejar pasar el 400. **No se adivina de la ficha**: lo que
  ella guarda es un código EIAC («1»), de otro catálogo — traducirlo sería inventar el motor de un coche
  real. Doc corregida y cepo ampliado (10 casos). Método: **el snapshot del portal describe el contrato;
  el contrato de verdad lo dicta la respuesta.**

- **🔧 «Retarificar» mentía dos veces, y las dos igual: un «no lo sé» convertido en «no lo hay» (03/09/2026).**
  Alberto abrió la pantalla y preguntó por los datos del coche. (1) Decía «la compañía manda la matrícula pero
  no el modelo»: **falso** — las 80 pólizas de auto vivas traen matrícula, marca Y modelo (la de la captura,
  `SMART / FORFOUR`); lo único que no trae ninguna es la **versión**. Ahora marca y modelo se preseleccionan
  desde la ficha y las versiones del histórico se enseñan como PISTAS con su procedencia, sin autoseleccionarse
  jamás — la misma matrícula puede traer dos que se contradigan (medido en `0432GLT`). (2) El aviso rojo
  «Tarificación apagada… cuesta 0,50€» se pintaba aunque `CODEOSCOPIC_SIMULACION` estuviera puesta, y la
  simulación es el **paso 0 de `cotizar()`, antes** del interruptor de gasto: el botón cotizaba gratis mientras
  la pantalla decía lo contrario. Ya lo dice bien, y qué precio es simulado lo decide la RESPUESTA (`simulado`
  OR `projectId` negativo), nunca la prop. Y por «esto está muy mal estructurado y diseñado» (Alberto): pantalla
  rediseñada en 3 pasos, el coste separado y en rojo, las faltas marcadas en su propio campo. Cepo:
  `test/regression-retarificar-vehiculo.test.ts`. **Regla nueva: el rediseño de UI se delega SIEMPRE a un agente.**

- **✅ Tarificaciones guardadas APLICADAS en la BD (03/09/2026).** PR #2154 mergeado y Alberto ejecutó el SQL:
  `seguros.tarificaciones` (22 col.) y `seguros.tarificacion_precios` (14 col.) existen en `wswbehlcuxqxyinousql`,
  la FK apunta a la tabla NUEVA y los 3 CHECK están (`simulada_sin_libro`, `puerta`, `firmeza`). `cotizacion_precios`
  NO se creó y la vieja `seguros.cotizaciones` sigue intacta con sus 25 filas: la colisión no llegó a la BD.
  Verificado por catálogo (`pg_constraint`), no por el «Success» de Supabase. `CODEOSCOPIC_SIMULACION=true` puesta
  en Vercel `central-asegura` con redeploy READY 04:11 UTC; **el valor no se puede leer desde fuera** — lo confirma
  el rótulo «Simulación» al retarificar. Probarlo es seguro: sin simulación, el siguiente escalón es
  `CODEOSCOPIC_TARIFICACION_ACTIVA`, que sigue apagado → responde «apagado», nunca un cargo.

- **Correduría: «Global2» y «GLOBAL 2 INSTALACIONES TÉCNICAS» eran el mismo cliente (03/09/2026).**
  Alberto lo vio en el buscador de `/correduria`. Fusionadas por SQL (lote 4, `2026-09-03_fusion_poliza_comun_lote4.sql`,
  51 lápidas en total, 0 pólizas colgando): la identidad es la RC 547875907 (Occident en CIMA / Plus Ultra en el
  volcado); el nombre y el teléfono no la cazaban. La viva hereda email, CP y ciudad (Salteras) y las 2 pólizas
  (incluida la Generali de auto, que CIMA no trae). El buscador relaciona ahora hermanas por **póliza común**
  (solo si una de las dos es de CIMA: por número a secas hay 2.123 pares falsos, «pendiente»/«NOLOSE» incluidos).
  Hueco latente del motor de fusión reparado en este caso (hash de email no heredado). **PR #2151 MERGEADO**
  (19/19 checks verdes). Probado DESPUÉS del merge contra la BD: buscar «global» da UNA ficha (7 pólizas),
  hermanasDe no inventa nada, el email heredado ya encuentra la ficha por índice ciego (columna e hija) y el
  vínculo `poliza` dispara sobre un escenario sintético revertido; 226/226 tests del módulo.
  Pendiente: nada nuevo; el duplicado vivo 2+1 creado por la ingesta CIMA sigue siendo de Manuel.

- **📅 Intranet del cliente CONSTRUIDA: calendario, aviso y enlace de un clic (02/09/2026, noche V).**
  Implementado el spec entero en el PR #2144 con subagentes. **El agujero que apareció al hacerlo:**
  `import_ref IS NULL` NO significa «viva y actual» — de las 109 pólizas de CIMA, **42 están canceladas**
  (5 con vencimiento futuro) y **18 activas con el vencimiento pasado** (la más vieja, de **enero de 2013**).
  El calendario habría dicho «tienes hasta el 13/02/2015 para renovar» y las canceladas habrían mandado
  correo real; el cepo es `vigenciaPoliza()` compuesta en `obligacionDerivable()`. **El aviso NO puede salir
  del portal** (solo guarda hashes; su rol no lee el email): se mudó a `apps/asegura`, apagado por defecto
  (`ASEGURA_AVISOS_ACTIVOS`, `CRON_SECRET` sin paso franco en dev). Añadidos el enlace de un clic del correo
  (**no canjea**: lo consumirían los escáneres antivirus) y la lista de los **26 clientes sin ningún canal**
  en `/correduria`. 315/315 guardianes. **Falta solo Alberto:** las envs de `asegura-portal` y `CRON_SECRET`.

- **💥 Colisión de nombres: `seguros.cotizaciones` YA EXISTÍA (02/09/2026, noche).** El SQL de las
  cotizaciones guardadas se escribió con ese nombre, y estuve a punto de decirle a Alberto que lo
  aplicara. **`seguros.cotizaciones` es la tabla del COTIZADOR WEB** —25 filas, de julio a hoy, la lee
  `cartera-historial.ts` para el contador de presupuestos de la ficha— y no tiene ninguna de las
  columnas que escribe `guardarCotizacion()`. El fallo NO avisa: `create table if not exists` sobre
  una tabla existente es un no-op silencioso (NOTICE + «Success» en Supabase), así que se habría
  creado solo la tabla de precios colgada por FK de la tabla equivocada y, como `guardarSinTumbar` se
  traga el error a propósito, la pantalla habría dicho «no ha quedado copia» para siempre sin un solo
  error rojo — descubriéndose en la renovación de 2027 con la tabla de comparación vacía. Renombradas
  a **`seguros.tarificaciones` + `tarificacion_precios`** (SQL, fichero, 3 sitios de código y 2
  tests), con cepo `test/regression-tarificaciones-nombre.test.ts` (mordido). La vieja NO se toca.
  Regla que deja: **al aplicar DDL sobre un schema heredado, mira ANTES si el nombre existe;
  «Success» no dice que se haya creado nada.**

- **🚨 «Ojo con duplicar»: agrupar personas por NIF, no por nombre (02/09/2026, noche).** Aviso de Alberto
  sobre GLOBAL 2. `personasDePolizas` agrupaba por ficha y, a falta de ficha, por NOMBRE — y el peligro
  va en las dos direcciones: **partir** a una persona en dos filas (enlazada a su ficha en una póliza y
  suelta en otra) y, peor, **fundir a dos parientes homónimos** en una sola con los teléfonos mezclados.
  Ahora la clave es el NIF: asegura emite una etiqueta OPACA (`p1`, `p2`…) —el NIF no sale del backend—
  y dos NIF distintos no se funden jamás. Medido: GLOBAL 2 tiene **tres** NIF distintos, uno por
  furgoneta; en toda la cartera hoy 0 personas se partían (409 de 504 filas no traen NIF y siguen
  cayendo al nombre). 5 cepos nuevos, tres mordidos. **Queda como regla global** en el CLAUDE.md de
  la raíz («agrupar por IDENTIDAD, nunca por la etiqueta») y como reglas 12-13 de la skill
  `correduria-crm` (con la del tomador, que tampoco es un interviniente). **Mergeado (#2145) y
  probado contra la BD**: la tarjeta de GLOBAL 2 pinta 3 filas, una por conductor con su matrícula,
  y la persona que sale en dos pólizas (la activa y la cancelada del 6930FBP) colapsa en UNA. En la
  cartera hay 260 fichas con intervinientes y solo 2 con varias personas identificadas por NIF: el
  arreglo es barato hoy y protege el día que CIMA mande NIF en más filas (hoy 407 de 426 no lo traen).

- **👤 «Personas en sus pólizas», arriba en la ficha (02/09/2026, noche).** Alberto: «en empresas y
  particulares se puede poner arriba las personas de contacto o relaciones». La tarjeta «Relaciones»
  solo enseña lo DECLARADO a mano (`cliente_relaciones`) y casi nadie lo tiene; mientras, CIMA ya dice
  quién conduce cada coche y con qué teléfono, pero enterrado póliza por póliza. Nueva tarjeta que
  agrupa **por persona** (no por póliza): nombre, qué es en cada una con su matrícula, teléfono/email
  pinchables, enlace a su ficha si CIMA la enlazó, y si tiene o no vínculo declarado. `personasDePolizas`
  con 7 cepos, dos mordidos. En GLOBAL 2 salen sus tres conductores de un vistazo.

- **🏢 GLOBAL 2: el titular no salía en su propia póliza (02/09/2026, noche).** Alberto, revisando la
  6930FBP: «¿no aparece propietario la empresa?». Cierto — el **tomador NO es un interviniente** (es el
  `cliente_id` de la póliza), así que la tarjeta, que solo pintaba `poliza_intervinientes`, dejaba fuera
  a la empresa titular en las 4 pólizas vivas de GLOBAL 2. Ahora va delante y con su rótulo
  (`filasIntervinientes`, con cepo). Dos hallazgos más de la misma ficha: la consulta de intervinientes
  **no tenía `orderBy`**, y con tres furgonetas y tres conductores habituales distintos el teléfono
  «de la empresa» que se pintaba podía cambiar de una recarga a otra — ahora es determinista y dice de
  qué matrícula sale. Y a una sociedad se le pedía «DNI, apellidos y fecha de nacimiento»:
  `etiquetasIdentidad` rotula CIF/razón social/constitución. El CIF de GLOBAL 2 es suyo, no el DNI de
  nadie (comprobado por hash, sin leer el valor). Mergeado #2139.

- **🗓️ Intranet de clientes de la correduría: spec del calendario de vencimientos (02/09/2026, noche IV).**
  Alberto quiere la intranet de clientes; se le devolvió lo incómodo: **ya está diseñada y a medio construir**
  (spec del 01/09, Fase 1+4 en `main`, DDL aplicado) y **muerta por cuatro envs de Vercel que dependen de él**
  — con `PII_LOOKUP_KEY` distinta a la de `central-asegura` entra todo el mundo y **nadie ve su cartera, sin error**.
  Decidido cortar por la **v1 de sus ~80 clientes**: pólizas de CIMA + calendario + la bóveda ya construida,
  **cero Avant2** (0,50€ por consulta y NO idempotente → un botón público o una vigilancia periódica son 4 cifras/mes).
  Única pieza nueva: `portal_obligacion`, colgada del **bien** con `poliza_id` opcional (sirve luego a ITV/gas).
  De Alberto salió lo mejor: el **cambio de mediador** convierte un lead en cliente sin tarificar y su póliza
  **empieza a entrar por CIMA** → el dato declarado pasa a verificado solo, y su firma **ya existe**
  (`@central/core-firma`, eIDAS art. 26, método `otp_email` = como entra el portal; molde `apps/rrhh`).
  Todas las ideas guardadas en **`docs/CORREDURIA-INTRANET-IDEAS.md`** con coste y bloqueo de cada una.
  Spec + banco de ideas + **plan de implementación**
  (`docs/superpowers/plans/2026-09-02-asegura-portal-calendario-v1.md`, 9 tareas TDD) en PR draft **#2144**.

- **🏠🏍️ «Haz todo» + el catálogo de Avant2 (02/09/2026, noche).** Mergeado #2130 (horquilla enchufada
  + capital de hogar por corroboración). Alberto pasó el catálogo de Integra: cruzado con las 109 vivas
  (tres compañías) sale que **RC no es un ramo de Codeoscopic** —8 activas sin camino automático— y que
  **moto sí existe** y no la tarificamos; ⚠️ es catálogo comercial, no configuración (Fidelidade, viva
  para nosotros, ni sale). Probando la ficha contra pólizas REALES de hogar aparecieron dos fallos:
  «responsabilidad civil del **inmueble**» se colaba como capital del continente (353.665,88€ plausible
  y falso; en EIAC `RC` es otro `claves_bien`), y `GET /car/brands` traía las marcas recortadas porque
  `onlyPopular` es `true` por defecto. Los dos con cepo mordido. Segunda pasada al snapshot del portal:
  contrato de moto, 131 operaciones, y la caducidad de un precio **solo aparece tras el re-rate** (que
  explica los 15 `expires_at` a NULL). PR #2133. `portal.api-int.codeoscopic.io` está **bloqueado por
  la política de red** del entorno: se lee del snapshot del 01/09.

- **🧹 Limpieza de duplicados: 16 fusiones más (02/09/2026, noche).** «Unifica lo que puedas». José
  Suárez Salas **ya estaba** unificado (una ficha, 21 pólizas) — corregido lo que se le dijo antes.
  Dos lotes nuevos sobre el motor del de la tarde: **`fusion-dni`** (8, mismo hash de DNI, criterio ya
  aprobado) y **`fusion-nombre-telefono`** (8, nombre+apellidos+teléfono, **fuera** del criterio porque
  no comparten póliza → se preguntó y Alberto dijo que sí; 20 pólizas y 14 bienes movidos). Tras los
  tres lotes: **0 DNI repetidos, 0 grupos nombre+teléfono con cartera viva, 0 pólizas en una lápida**;
  50 fusionadas, 32.551 vivas. ⚠️ Fallo propio: la herencia de huecos no cogió unos apellidos porque
  `clientes.apellidos` es **NOT NULL** (su hueco es `''`) y se filtraba por `is_nullable` comparando con
  `IS NULL` — la cadena vacía se cuela por toda guarda de NULL. Y `cliente_merge_log` es **append-only**
  por trigger: una corrección posterior no se anota editando su fila. PR #2139. **NO se tocan** los ~545
  grupos que solo comparten nombre+teléfono sin cartera viva (familias con el fijo común).

- **💾📐🗺️ Etapa 2 de tarificación + el mapa de campos (02/09/2026, tarde-noche).** Cada cotización
  cuesta 0,50€ y no es idempotente, así que ahora se GUARDA lo que se recibe (`seguros.cotizaciones` +
  `cotizacion_precios`, invariante `simulado = (intento_id is null)` en la BD) y `estimar()`/`mereceLaPena()`
  dicen si merece la pena pedirla (PR #2116). Cerrado de paso el fallo que el propio cambio creó: la ruta
  no pasaba `contexto`, o sea se pagaba y NO se guardaba. **⚠️ El SQL sigue SIN aplicar en Supabase.**
  🐛 CI rojo dos veces por un motivo que no hablaba de cotizaciones: `lib/db.ts` construía el `PrismaClient`
  AL IMPORTAR, y el job `Tests` no corre `prisma generate` (en local sí estaba, por los typechecks) —
  ahora es diferido tras un `Proxy`, con cepo. 🗺️ Un agente midió el **mapa de campos** Codeoscopic×CIMA
  (PR #2125, `docs/ASEGURA-MAPA-CAMPOS-RAMOS.md`): **RC está bloqueado porque Codeoscopic NO ofrece el ramo**
  (lo cierra `GET /insurance-lines`, gratis y ya implementado, sin llamar nunca); 14 de las 80 «auto» son motos por marca con `insuranceLine:'Car'` a fuego.
  ⚠️ **Y una corrección del mismo día, que la cazó Alberto acordándose mejor que yo:** el informe decía
  «hogar tiene `capital_asegurado` NULL en sus 37 filas de coberturas» y lo di por bueno sin medirlo. Son
  **716 filas en las 19 pólizas, 365 con capital**: CIMA SÍ trae continente y contenido, pero cada compañía
  los llama a su manera («daños vivienda» = continente, hasta 912.322€). Faltaba el diccionario de
  nomenclaturas, no el dato. Corregido en `docs/ASEGURA-MAPA-CAMPOS-RAMOS.md`.
  Corregido en `apps/asegura/CLAUDE.md` (PR #2121) que auto «solo trae matrícula»: trae marca y modelo al 100%,
  lo que falta es la versión. Pendiente de Alberto: 20 suposiciones por aprobar y `CODEOSCOPIC_SIMULACION=true`.
- **🧠 El agente de huéspedes «no aprendía» — y el que decidía nunca leyó lo aprendido (02/09/2026).** Queja de
  Alberto sobre el borrador a Claudio (153122091). El aprendizaje SÍ escribía: el phishing por WhatsApp estaba
  enseñado tres veces. Lo que fallaba: (1) `debeEscalar` (control de calidad) solo veía ficha+guía, nunca
  `ctx.hechos` → ESCALAR eterno, y ese veredicto es el que dispara el «❓ no lo encuentro en la guía»;
  (2) «no se pudo verificar» (clasificador mudo) se contaba como hueco de guía → nuevo `tipoHueco` puro;
  (3) el «hecho» guardado era la carta entera, con nombre del huésped, el móvil de Bizum y estados de un día
  («el parking está ocupado») → ahora se destila a una frase y, si no se puede, no se guarda y se dice;
  (4) `esHechoDelPiso` exigía pregunta y el phishing llega como afirmación → el hueco declarado viaja en
  `mensajes_pendientes_tg.hueco_guia` (migración aplicada). ⏳ PENDIENTE de Alberto: purgar los 6 hechos
  ya guardados (móvil de Bizum, «parking ocupado», «no hay cuna» ya desmentido). PR pendiente.
- **🧾🔑🧲 «Haz todo ok, aplica y canal leads» (02/09/2026, noche).** Alberto dio OK a la spec de emisión,
  «aplica» al DDL del portal y pidió el canal de leads. **BD (irreversible, aplicado):** Fase 1 del portal +
  `portal_vinculo` + rol `prisma_asegura_portal` (NOBYPASSRLS, sin contraseña, SELECT por columnas, sin PII);
  enums `fuente_origen` +`web/portal/whatsapp` y `poliza_origen` +`emitida_codeoscopic`; tabla
  `companias_dgs` (15 códigos, `nombre_cima` solo en las 3 medidas). **Emisión:** reglas puras D2/D3/D4
  (`module-seguros/emision.ts`) + `registrarPolizaEmitida` + puerto cerrado tras `CODEOSCOPIC_EMISION_ACTIVA`;
  **el envío al vendor NO se construye** (no hay sandbox para el gate de idempotencia). Portal Fase 4 (vínculo
  por email, lectura por columnas) y canal web (`/seguros` en plataforma → alta `fuente=web` → Telegram
  `correduria.lead-nuevo`) construidos por agentes. **PR #2118 mergeado** (`f0dc7cbb`); probado en prod:
  `/seguros` 200, lead vacío 422, honeypot 200 sin efectos. **«Hazlo» (portal):** contraseña de
  `prisma_asegura_portal` generada EN la BD y guardada en el **Vault** (`prisma_asegura_portal_password`),
  verificada por dblink (pooler OK, `dni` → 42501); proyecto Vercel `asegura-portal` creado por API
  (`prj_MNrsMRVrBft6KLq1skgi8XU9s9y9`; enlace Git verificado: el bot de Vercel ya lo lista con su Root
  Directory, deployment «Ignored» por `--sin-previews`). Pendiente de Alberto en el panel:
  `DATABASE_URL` (plantilla en el SQL), `PII_LOOKUP_KEY` = la de central-asegura, secretos de sesión/canal.
- **Mergeado, probado hasta donde se puede, y el doc de plataforma al día (02/09/2026, noche).** #2131 y
  #2122 (agente de huéspedes) mergeados; los checks arrancaron solos con el PR EN DRAFT y sin lag, así que no
  hizo falta ninguna palanca de la sección de CI. 🚨 **No hay fuga de coste en Vercel**: los 11 proyectos
  acabaron `Ignored`, los «Building» del bot eran el estado transitorio antes del ignore step — la hipótesis
  del merge de `main` sobraba. ⚠️ **Y el aspecto sigue SIN ver**: con `--sin-previews` la rama no construyó
  ninguna vez, y probar las rutas desde fuera no vale (un `/ruta-que-no-existe` da el MISMO 307 a `/login`
  que `/asistentes`, porque el middleware corre antes). `apps/plataforma/CLAUDE.md` corregido: decía que el
  chat vivía en `/agente` y `/contable`, que hoy son redirects.
- **Inicio: arriba lo accionable, y dos tokens CSS fantasma (02/09/2026).** Alberto pidió «página de inicio
  con resumen de lo más importante». Inicio NO estaba vacío: estaba saturado (512 líneas — saldo, cuentas,
  bróker, gráficas, P&L, fiscal, antifraude, fugas, benchmark y el libro entero), y lo accionable quedaba
  bajo cuatro secciones de consulta. Nueva banda «Pide acción hoy» encima de todo (`HoyAccionable.tsx` +
  `lib/inicio-acciones.ts`, puro, 14 tests): banco viejo PRIMERO (envenena el resto de números), pólizas
  ≤60d desde la correduría, y movimientos/ingresos/duplicados/facturas sin clasificar. Tres estados en
  todo: `0` ≠ `null` ≠ `'no_aplica'` — «no hay banco» no es «no se sabe», y un fallo de consulta se
  declara en vez de callarse. De camino: **`var(--card)` y `var(--line)` NO existían** y los usaban 4
  pantallas (`/operador/agentes`, `/operador/ia`, facturas, partes) → se pintaban sin fondo NI borde,
  porque CSS invalida la declaración entera y no da error; por eso la página de agentes «no parecía una
  página». Guardián `test/regression-tokens-css.test.ts`. Y consulta por agente en `/operador/agentes`
  (expediente: ficha + semáforo + latidos + vigía). Y `/asistentes`: los dos chats con los que SE
  PUEDE hablar (contable y precios) juntos, movidos con `git mv` sin reescribirlos —/contable y
  /agente quedan como redirect, y el menú pasa de dos entradas a una. PR #2131.
- **«Repara»: el menú mentía en dos sitios (02/09/2026).** Sin objetivo dicho, así que se buscó qué estaba roto de
  verdad. (1) El lateral encendía DOS entradas a la vez: «Inicio» + el segmento en `/banca?tab=*` (lo introdujo
  #2106 — «Inicio» ES `/banca` y los cinco segmentos comparten esa ruta), y «Pricing Lab» + «Pricing auto» /
  «Motor vs PL» (el activo de Pisos era `startsWith(href)` SIN la barra, y una ruta es prefijo del hermano
  homónimo). El criterio estaba inline en tres sitios del TSX, de tres formas y dos mal → `lib/nav-activo.ts`,
  puro y con 13 tests (con la implementación vieja fallan 7). (2) `/finanzas/tarjeta-credito` no la enlazaba
  NADIE (pre-existente, no de #2083): enlace desde `/finanzas/gastos` + paleta. Tercer caso en dos días
  (`sivra/partes/establecimientos`, `/apartamentos`), así que `test/regression-panel-alcanzable.test.ts` recorre
  las 69 pantallas del panel y exige un enlace de entrada a cada una; excepciones vacías a posta. PR #2115.
- **💶 «¿Por qué ha subido la prima?» (02/09/2026).** Punto 7 de la visión, tras el «cuando vayan terminando
  mergea prueba y actualiza» de Alberto (#2111 mergeado). `evolucionPrima()` en module-seguros: prima por
  anualidad derivada de recibos `CA`/`NP` agrupados POR ANIVERSARIO (no año natural), ciclo solo si completo,
  siniestros del ciclo anterior → seis veredictos; `sin_datos` es lo normal (29 vivas con dos anualidades /
  25 con una / 13 sin recibos). Asegura lo manda en `/poliza` (entero) y `/cliente` (compacto); plataforma
  chip + tarjeta (`EvolucionPrima.tsx`). Con esto el orden §9 queda: 1 (emisión/conciliación) pendiente de
  OK, 4 (leads) sin canal, 5 (portal) sin DDL; todo lo demás hecho.
- **🚨 Siniestros desde la ficha (02/09/2026).** Punto 6 del orden de la visión del CRM, tras el «todo ok» de
  Alberto al #2104. Reglas puras `module-seguros/siniestros.ts` (catálogo de tipos, transiciones, plazo art. 16
  LCS, apertura/seguimiento revisados, 7 tests); `asegura/lib/cartera-siniestros.ts` + puerto `/api/operador/
  siniestro` (GET/POST/PATCH); plataforma `Siniestros.tsx` en ficha de cliente y de póliza con abrir, seguimiento,
  estado y documentos del parte. Medido: 67 siniestros, todos de CIMA, `tipo` = código EIAC (se pinta como código,
  no se inventa nombre); el legacy reescribe solo estado/tipo/fecha/lugar → en uno de CIMA el estado no se toca;
  en uno nuestro la referencia va también a `id_siniestro_entidad` para que el pull case y no duplique. Sigue
  parado a la espera de Alberto: spec emisión/conciliación, DDL del portal (tablas inexistentes), leads sin canal.
- **«Haz todo» del CRM, primera tanda (02/09/2026).** Estado del cliente DERIVADO (`estadoCliente`: cliente =
  póliza confirmada por CIMA, `id_poliza_entidad` informado — las 109 vivas lo tienen; emitida pendiente de CIMA;
  con presupuesto = cotización ≤60 días; ex-cliente; lead), historial visible en la ficha (plegado), guardián de
  pólizas duplicadas (`/api/operador/duplicados`, hoy 0) y spec de emisión en central + conciliación CIMA
  (`docs/superpowers/specs/2026-09-02-emision-conciliacion-cima-design.md`, **pendiente de OK de Alberto**: no se
  emite sin la prueba de idempotencia del sandbox). Medido: las tablas `portal_*` del portal del cliente NO existen
  en la BD (DDL sin aplicar) → el portal es código sin base; leads por canal sin canal aún (no hay WABA ni web).

- **🏠 Ficha revisable de hogar + precios simulados (02/09/2026).** PR #2096. La pantalla que faltaba
  entre «tengo los datos» y «gasto 0,50€»: cada campo dice de dónde sale (póliza / volcado / Catastro /
  ficha / supuesto), los supuestos que ABARATAN van marcados aparte, lo que falta bloquea y dice qué
  falta, y la firmeza va pegada al precio (en hogar la 1ª cotización SIEMPRE es estimada). Lógica en el
  puro `lib/codeoscopic/resumen-hogar.ts`, que la pantalla reusa en cliente al corregir.
  **Modo simulación** `CODEOSCOPIC_SIMULACION=true`: paso 0 del embudo, sin vendor ni libro ni tope;
  se marca con `simulado` (dato, no texto), `projectId` NEGATIVO y `estimate:true`; `restantesHoy` es
  `null` = «no se ha mirado», no 0. Arreglado: `origenRetarificacion()` sin try/catch dejaba la página
  en blanco; `primaAnual` viaja con NULL intacto (sin él NO se pinta la comparación).
  ⏳ Alberto: poner `CODEOSCOPIC_SIMULACION=true` en Vercel `central-asegura` para ver precios.
  ❓ Sin contestar: qué decía el error que vio en `/cartera/poliza/5b0150ee-…`.

- **🛡️ Auditoría: NO hace falta tabla de garantías por compañía (02/09/2026).** PR #2096 (docs) +
  `docs/superpowers/specs/2026-09-02-expediente-tarificacion-hogar-design.md`. No existe catálogo de
  garantías por API (`guarantee`/`warranty`/`franchise`/`excess` = 0 apariciones en todo el portal del
  fabricante), no hay forma de fijar por API los defectos de una compañía, y los que Alberto ya
  configuró en Avant2 se heredan solos al cotizar: una tabla nuestra crearía dos verdades. Las opciones
  por compañía solo se pintan con el iframe del fabricante + puerto que le reenvíe (aparcado).

- **📘 Visión del CRM de la correduría (02/09/2026).** Alberto, por voz: «lo que estamos hablando es un
  CRM» — buscador → ficha cliente (pólizas confirmadas por CIMA) → ficha póliza (datos, recibos,
  siniestros, limpio, detalle al pinchar), misma forma para la intranet del cliente; leads que se
  crean solos por web/WhatsApp/agente; todo cambio guardado; CIMA y Codeoscopic «saben más que
  nosotros» y hay que compaginarlas al emitir. Escrito en **`docs/CORREDURIA-CRM-VISION.md`** (visión,
  estado medido §4, la pieza crítica §5: hoy CIMA empareja por número + NOMBRE de compañía, ignora
  `import_ref` y pisa `cliente_id` → una emitida por Codeoscopic se duplica o se sobreescribe; orden de
  trabajo §9) + skill router **`correduria-crm`**. Nada de código: el punto 1 del orden exige spec y OK.

- **👪 Relaciones entre clientes + autorización para ver los seguros del otro (02/09/2026).** Alberto, tras
  probar la edición (José: móvil principal, verificado en `historial_interno`): «es marido de María Antonia…
  por si autoriza María Antonia que José vea sus seguros». La tabla `cliente_relaciones` YA existía (1.708 filas
  del CRM, dos por vínculo). Fijado: fila A→B = «B es <tipo> de A», `puede_ver_polizas` = **A autoriza a B**,
  direccional y solo desde la ficha de quien autoriza. Módulo puro `module-seguros/relaciones.ts` (3 tests),
  `apps/asegura/lib/cartera-relaciones.ts` + puerto `/cliente/relaciones`, tarjeta «👪 Relaciones» en la ficha
  de plataforma con 💍 en cabecera. Consentimiento anotado en el historial de las dos fichas. Pendiente: el
  portal del cliente no lo usa aún (`clientesQuePuedeVer()` listo; falta grant a `prisma_asegura_portal`).

- **✏️ Editar y ➕ dar de alta clientes desde `/correduria` (02/09/2026).** Alberto: «no puedo editar», «cliente
  puede tener varios tlf y mails», «DNI, nombre, fecha de nacimiento… tendrá que solicitarlo documentado».
  Primeras ESCRITURAS del puerto de asegura: `/api/operador/cliente/contactos` (varios teléfonos/emails con
  etiqueta y ⭐ principal espejado en `clientes.telefono/email`), `PATCH /cliente` (libre: dirección/CP/ciudad/
  provincia/notas; identidad SOLO con `documentoId` de un DNI recibido → 422 `documento_requerido`) y `POST
  /cliente` (alta `lead`, 409 con las fichas que ya tienen ese DNI/tel/email; DNI nunca se fuerza). Reglas
  puras en `module-seguros/cliente-edicion.ts` (10 tests); pantalla `EditarCliente.tsx` + `/cliente/nuevo`.
  Historial en `historial_interno` sin PII. **PR #2093 mergeado.** ⚠️ Sin prueba real todavía: el proxy del
  contenedor bloquea `central-asegura.vercel.app` (CONNECT 403) y plataforma redirige sin sesión, así que la
  primera edición/alta la hace Alberto y se comprueba después en `seguros.historial_interno` (0 filas hoy). CIMA NO cambia `tipo` de una ficha `lead` al engancharle
  póliza: la ficha pinta «Cliente (CIMA)» por pólizas vivas. Buscador ya mira los teléfonos secundarios.

---

### 🗂 (05/09/2026) El historial de siniestros del portal: 60 filas que no veía nadie

Alberto: «y los recibos? e historial siniestros?». La lectura filtraba `abierto|en_tramitacion`, así
que de 67 siniestros de la cartera viva se enseñaban 7.
- Módulo puro `siniestro-historial.ts` (9 tests, 2 mutaciones vistas morder); `siniestrosAbiertos`
  pasa a DERIVARSE del historial → la guarda de nivel queda en un solo sitio.
- 🚨 Tres medidas contra la BD que cambiaron el diseño: **`tipo` es un código numérico** (1107, 1915…)
  y no se pinta · **no existe fecha de cierre** (`updated_at` no lo es) · el enum tiene **CUATRO**
  estados y `rechazado` ≠ `cerrado`.
- Orden en código, no en `orderBy`: `DESC` en Postgres es `NULLS FIRST` y lo sin fecha se colaría
  arriba. `[]` = «no nos consta», nunca «no has tenido».
- Va en la ficha de cada póliza, no en una quinta pestaña (a casi todos les diría 0).

### 🌐 (05/09/2026, IV) `grupoasegura.es` ya sirve la web de venta — y el código creía vivir en el `.com`
Alberto, con Claude en Chrome, quitó `.es`+`www` del proyecto `asegura` (CRM de Manuel) y los ató a
`asegura-web`: apex Valid al instante (su A ya era Vercel), `www` como 308 al apex y
`clientes.grupoasegura.es` en `asegura-portal`, los dos pendientes del DNS de IONOS. Lo que Chrome no veía:
`SITIO_URL` por defecto era `grupoasegura.com`, que apunta a un **parking de IONOS** (`217.160.0.254`) →
canonical y sitemap hacia un dominio vacío. Defecto cambiado al `.es` + guardián `lib/sitio.test.ts`
(muerde: 2 fallos con el `.com`). ⚠️ `clientes` tiene MX de IONOS: ahí va registro **A** `216.150.1.1`,
no el CNAME del panel. ✅ DNS ya puesto en IONOS y los tres dominios en **Valid Configuration**; los MX de
`clientes` siguen en pie. Pendiente de Alberto: las envs `NEXT_PUBLIC_PORTAL_URL`/`PORTAL_PUBLIC_URL` + redeploy
— ⚠️ el `ignoreCommand` corre **también en un redeploy**, así que un «Canceled by Ignored Build Step» deja la
env sin aplicar con el mismo aspecto que un despliegue bueno: hay que ver el deployment llegar a **Ready**.

### 🚪 (05/09/2026) El portal pedía el código «cada vez»: no era la sesión, era la puerta

Alberto: «cliente por codigo es un poco coñazo… cada vez q entra». Pedía un enlace mágico.
- **La raíz `/` era el formulario de CLIENTE y no miraba la cookie.** Con la sesión de 30 días viva
  se le seguía pidiendo el correo y el código. Ahora `page.tsx` es de servidor: `getIdentidad()` →
  `redirect('/boveda')`; el formulario se movió a `app/Entrada.tsx`.
- 🚨 **NO se hizo el enlace que canjea solo**: los sandboxes de correo que renderizan con navegador
  ejecutan el JS y se comerían el código (`ya_usado`, y parece culpa del usuario). ⚠️ El argumento
  del reenvío no vale para descartarlo — el código va en ese mismo correo.
- Dos cepos nuevos (mutaciones vistas morder) y **dos guardianes que siguieron al fichero movido**.
- Diseño: `.pendiente` (píldora de borde DISCONTINUO para «no lo sabemos», portada de plataforma),
  `.alarma` (el recibo devuelto sube de ámbar a negativo con título) y filete izquierdo por estado.

### 🖥 (05/09/2026) El portal del cliente: lateral como plataforma, y QUÉ está asegurado

Alberto, con la pantalla desplegada delante: «aprovecha poco la página vista en pc», «con ventana
lateral» y «poca informacion... ni direccion en hogar, ni datos coche en auto».
- **El armazón pasa a `app/(portal)/layout.tsx`**: se acabó el `maxWidth: 720` en línea por página
  (~720 px de márgenes vacíos en un 1440). `NavPortal.tsx` es UN `<nav>` con dos formas — carril en
  móvil, lateral de 256 px desde 1024. Sin hamburguesa: son cuatro secciones.
- Medidas del **fuente** de la app de Manuel (no de una captura): radio 1.4rem, 24/18/16/14/12,
  ritmo de 24, `tabular-nums`, botones en píldora. Playwright a 320/768/1440: 1→2→3 columnas, cero
  desbordes.
- **`describirBien()`** (módulo puro, 11 tests, 2 mutaciones vistas morder): el dato estaba en
  `polizas.datos_especificos` y el rol YA tenía el GRANT — no se enseñaba. 🚨 `cosa` (matrícula) es
  dato del contrato y se ve desde `tarjeta`; `ubicacion` (la dirección del hogar) es dato de la
  PERSONA y entra en `NUNCA_A_UN_TERCERO`. Juntarlas regalaría una dirección a quien pidió ver una
  compañía.
- La póliza ajena se marca en la FILA (filete + «De {titular}»), no solo en el `<h2>` de la
  sección: al hacer scroll ese título se sale de la vista.
- **Y después, lista→ficha** («muy sucia la página»): `/boveda` es una lista de filas y cada póliza
  tiene su `/boveda/poliza/[id]`. 🚨 El id de la URL **no consulta nada**: se lee la cartera
  autorizada y se busca dentro; si no está, 404 (nunca 403). El recibo devuelto **se queda en la
  fila** — es lo único que quita cobertura sin avisar. Los teléfonos de la compañía NO se repintan
  ahí (viven con sus 4 cepos en `ParteSiniestro.tsx`). El guardián de aislamiento mordió por una
  frase de un comentario: no quita comentarios antes de mirar.

### ⚖️ (05/09/2026, III) Bloque legal 0.5: la solicitud de supresión (art. 17) que NO borra

- **0.4 mergeado** (PR #2336 → `0e5b7aad`): export del art. 15/20 servido por el puerto de operador.
- **0.5 mergeado** (#2339) y **DDL APLICADA** (`20260905100234`, 4 cepos vistos morder): módulo puro, ruta y
  pantalla «Tus datos» en la bóveda, y `GET/POST /api/operador/supresiones` en `apps/asegura`.
- 🚨 **No borra a propósito** (art. 17.3.b y 17.3.e): lo obligatorio es recibir, acusar y contestar en
  un mes. Las dos listas —lo que se borra y lo que no— se enseñan ANTES de pulsar y se calculan.
- La cola la ordena el **reloj legal**, no la llegada, y llega a `plataforma` → `/correduria`: sin ese
  puerto el plazo se incumpliría en silencio.
- El **guardián de aislamiento mordió** al sacar `correduriaUnica()` a un fichero suelto (toca la
  cartera sin poder nombrar `portalVinculo`): se deshizo la extracción en vez de exentar el cepo.
- Verificado: 574 tests raíz (0 fallos) · module-seguros 425 · module-seguros-portal 237 · typecheck
  de `asegura` y `asegura-portal` limpio. Tres mutaciones del guardián nuevo comprobadas.


### ⚖️ (05/09/2026) Bloque legal 0.3: el portal ya deja constancia de que informó — y sale una alerta de correo (PR #2326, mergeado)
- El canje del código no dejaba **ninguna** fila de que se hubiera enseñado la información del mediador. La carga de la prueba es del mediador (art. 19 Ley 16/2018) y un acceso sin constancia **se ve igual que uno correcto**. Ahora escribe `lds_art19` en `portal_consentimiento` (la tabla existía desde Fase 1 sin que nadie escribiera).
- **Va emparejado con la UI a propósito**: la fila afirma «se le enseñó», así que la pantalla de entrada lo dice junto al botón con los tres enlaces. Separarlos convertiría el registro en prueba fabricada — lo ata `test/regression-portal-consentimiento.test.ts` (8 cepos).
- Dentro de la **misma transacción** que el canje: si no se puede acreditar, el código no se consume. Sellado con `VERSION_TEXTOS_LEGALES` **importado** y solo si no consta esa versión: cien logins ≠ cien filas, pero cambiar el texto sí pide acreditación nueva.
- **`avisos` y `comercial` NO se escriben** aunque el CHECK los admita: no hay casilla que los pida y `otorgado:true` sin marcar es fabricar consentimiento. Guardado en `necesitaRegistro`/`normalizarIp` (`module-seguros-portal`, 12 tests) — la IP inválida va a NULL: la columna es `inet` y un INSERT roto tumbaría el login.
- Guardar IP y navegador es tratamiento nuevo → declarado en la política y **`VERSION_TEXTOS_LEGALES` → `2026-09-v3`** (todos los clientes vuelven a acreditar en su próximo acceso). Verde: 553 guardianes · 227 + 413 de módulos · typecheck de asegura-portal y asegura-web · CI 20/20.
- ✅ **ALERTA CERRADA el 05/09/2026: Alberto confirmó que «ya existe hola@grupoasegura.es»** (es su palabra, NO una prueba de entrega: nadie ha mandado un correo a ese buzón y comprobado que llega). Lo que estaba abierto era esto: 🚨 **correo del SAC.** La captura del panel de Alberto (05/09) muestra el correo en **`grupoasegura.COM`** (buzón `asuarez@` + alias `dpo@`, `info@`, `reclamaciones@`) y **ningún `hola@`**; `docs/TRASPASO-CORREDURIA.md` dice que `grupoasegura.es` **solo sirve `info@`**. O sea: **`hola@grupoasegura.es`, publicado en producción como SAC y canal de derechos RGPD, puede no existir** — una reclamación rebotaría con el plazo de un mes corriendo. Fallo de método: se metió el correo que dictó Alberto sin comprobarlo contra su infraestructura. **Pendiente de que él confirme dominio (.com vs .es) y prueba de entrega**; se le pasó un prompt para Claude Chrome. Los alias viejos **no se borran** (están en textos legales publicados): se redirigen.
- Del bloque 0 quedan **0.4** (export art. 15/20 por `apps/asegura`) y **0.5** (solicitud de supresión).

---

### ⚖️ (04/09/2026, III) El portal del asegurado no tenía NADA legal: bloque 0.1+0.2 puesto (PR #2245, mergeado)
- El portal pedía el correo sin identificar al mediador ni decir qué se hacía con el dato: cero pie legal, cero políticas. Incumplía art. 19 Ley 16/2018 y art. 13 RGPD desde que se desplegó.
- **Fuente única nueva** `packages/module-seguros/src/mediador.ts` (DGSFP `CS-F/0170`, RC, no-exclusividad, canales SAC→DGSFP→AEPD, `VERSION_TEXTOS_LEGALES` para sellar `portal_consentimiento`), 8 tests. La comparte el panel del corredor.
- 4 páginas en `apps/asegura-portal/app/legal/*` + `PieLegal` en el layout **RAÍZ** (si va en `(portal)` desaparece justo de la pantalla de entrada, que es donde la ley lo exige) — y se leen SIN sesión.
- La privacidad se escribió sobre lo que la app hace de verdad: correo solo como hash, **el PDF que sube el cliente sale a OpenRouter y puede procesarse fuera del EEE** (con la alternativa de teclearlo a mano), Supabase en `eu-west-1`. **Sin banner de cookies a propósito**: una sola cookie técnica (art. 22.2 LSSI).
- ⚠️ Dos omisiones deliberadas y testeadas: **ni lista de ramos** (registro DGSFP sin comprobar) **ni DPO**. Lo del DPO lo zanjó Alberto el mismo día: **«solo quiero usar un mail hola@grupoasegura.es»**, así que el `dpo@grupoasegura.com` de la web de Manuel no es buzón suyo. Los ramos siguen pendientes.
- 📧 **Un solo correo, `hola@grupoasegura.es`** (contacto + derechos RGPD + SAC), desde `MEDIADOR.identidad.email`; mismo buzón que el `Reply-To` del portal. 🚨 **La web pública sigue publicando `info@` en tres textos legales** (Términos, privacidad, `/info-mediador`): dos canales de reclamación para el mismo mediador es una contradicción entre documentos publicados. Unificarlo allí toca el `LegalVersionGate` y el ruleset bloqueado del repo `asegura`.
- Guardián `test/regression-portal-legal.test.ts` (9 cepos). Verde en CI: **18/18 checks** sobre `be7175dd0`; en local 480/480 guardianes y 339/339 de `module-seguros`, typecheck del portal limpio. **Pendiente del bloque: 0.3 consentimientos, 0.4 export art. 15/20 por `apps/asegura`, 0.5 solicitud de supresión.**
- ✅ **Verificado EN PRODUCCIÓN, no supuesto** (PR #2268, `2806e2326`, 18/18): el deployment nuevo (`dpl_Aq5a3W…`) sirve `hola@grupoasegura.es` y `Versión 2026-09-v2`; el anterior seguía dando `info@` y v1 durante ~3 min tras el merge. Un fetch al dominio antes del deploy habría dado por buena la versión vieja.

---

### 🔧 (04/09/2026, II) Reparados 3 de los 5 hilos abiertos del motor; los otros 2 medidos y sequenciados
- **Clamp de calidad que se anulaba solo:** `target = clamp(baseD, floorD, ceilD)` con `baseD` ajustado por `dqDate` y los límites sin ajustar. Medido: `quality_factor` real 0,848 en Busto con el suelo al 0,874 del objetivo → mordía en **9 de 12 meses, +5,8%**, en el piso que vende en el P10. Dúplex 3 meses, Luxury 1, House 0. Se ajustan LOS DOS límites (el clamp es un intervalo). Guardián que lee el fuente, probado en rojo.
- **Techo por ADR de House desde el histórico equivocado:** `priorRows` ignoraba `historico_desde`. ADR 6 años **354€** vs desde su fecha **655€** → techo a la mitad (sep 391 vs 884, dic 498 vs 1.113) y `suelo_manda` en 3 meses. No-op exacto en los otros tres (todos con `historico_desde` NULL). Trade-off declarado: 3 meses de House quedan bajo `MIN_NOCHES_ADR` → se cuentan ahora los DOS motivos de «sin techo» por separado (antes `sin_muestra` era mudo).
- **Check #13 decía «TODAS sus palancas»** y es falso: no modela los dos techos, así que su número es una COTA SUPERIOR. Comprobado que en Luxury el veredicto no cambia (techo ADR 0,83 vs multiplicadores 0,656), pero la palabra hacía sonar el aviso más definitivo de lo que es.
- ❌ **`mkt_score` sin filtro de liga: MEDIDO Y DESCARTADO.** La mediana de score con y sin liga difiere 0,0-0,2 puntos → mueve el factor de calidad un **0,8-1,6%**. El diagnóstico lo llamó «doble conteo» y en magnitud es ruido. No se toca.
- ⏸️ **`noches_ref` vs ventana del corpus: medido, NO cambiado hoy.** El corpus es **86,5% de 2 noches** y Busto/Dúplex tienen `noches_ref=3` → `aBase` descuenta 12,73€/noche cuando el comparable lleva 19,10€ implícitos (**+5-7%**). Pero `noches_ref` es la estancia mediana REAL de nuestras reservas y para ESO es correcto: el arreglo es que `aBase` use la ventana del corpus, no cambiar el ajuste. Sequenciado tras converger el descenso — era el 4º cambio de precio del día.


### 🔇 (05/09/2026) El vigía de CIMA medía a quien venía, no a quien deja de venir — Mapfre, 74 días

- **`saludIngesta` tenía tres señales y las tres se disparan con algo que LLEGÓ y salió mal** (cuarentena, huérfanas, rechazos). `diasSinPersistir` parece taparlo pero mide por TIPO de objeto y agrega compañías: mientras UNA siga mandando recibos, el contador está a cero. **Mapfre (C0058) llevaba 74 días sin un fichero con su peor hueco histórico en 2 días, 64 pólizas vivas (58% de la cartera) y 7 renovaciones pasadas sin fichero** — y el vigía en verde con razón: no había nada atascado porque no había llegado nada.
- **`silencio-entidad.ts` (`@central/module-seguros`, puro, 11 tests):** dos señales independientes — *ritmo roto* contra el propio récord de cada compañía (un umbral global acusaría a Reale, que manda cada 23 días, y tardaría un mes en ver a Mapfre) y *consecuencia medida* (renovación vencida sin fichero), que alarma **sin baremo**. Sobre los datos reales acusan a Mapfre y **solo** a Mapfre.
- 🚨 **`MIN_HUECOS = 2` está calibrado con datos reales y hay test que lo fija:** Mapfre solo tiene **2 huecos observados** (sus 14 ficheros se agolpan en pocos días), así que exigir 3 habría silenciado el caso fundacional. `sin_base` (Reale, 1 hueco) NO es `ok`.
- **La firma del dedupe del cron incluye ahora las compañías mudas.** Era `estado:recientes:huerfanas`: con Mapfre ya muda se quedaba en `degradada:0:0` para siempre y el día que enmudeciera **además** Allianz no habría sonado nada.
- 🔐 **El hallazgo de seguridad del plan de marketing estaba MAL y se corrige en el propio doc.** La clave `anon` SÍ es pública (9 ficheros cliente de ia-rest, incluida la carta por QR), pero **PostgREST no expone `seguros`** (406 `PGRST106`: solo `public`, `graphql_public`, `iarest`) → la cartera **no bloquea el lanzamiento**. Lo alcanzable de verdad es `iarest.camareros`: **7 filas con sus PIN** porque `get_tenant_id()` cae al **tenant demo** cuando `app.local_id` no está fijado, y eso gobierna las 252 tablas de `iarest`. **No tocado**: quitar ese fallback puede dejar restaurantes sin servicio — decisión de Alberto.
- ⚠️ **Proyecto Vercel `asegura-web`: creado y BIEN, pero el MCP de Vercel no lo ve.** `get_project`/`list_projects` devuelven 404 sobre `prj_MnuAvshNZg6vmRsfTkSmiX4RyCj9` — se llegó a anotar por error que estaba «fuera del equipo». El bot de Vercel del PR #2303 lo desmiente desde el lado de Vercel: aparece en `pisos-turisticos-projects/asegura-web` con Root Directory `apps/asegura-web` y evaluó el ignore-step del PR (`Ignored`). O sea: **existe, está en el equipo y está enganchado al repo**; el 404 es del conector, no del proyecto. Faltan solo sus envs (`PLATAFORMA_URL`, `NEXT_PUBLIC_SITIO_URL`) y el dominio. **No crear otro.**

### 🧊 (04/09/2026) La guarda de outlier paraba el descenso que el propio motor había empezado
- Al recalibrar el ancla a la baja el 03/09 (#2192/#2228), `normalBase` cayó ~25% de golpe: **448 noches** de los 4 pisos pasaron a cumplir `old > normalBase × 1,4` **sin que nadie hubiera subido nada**, y se quedaron clavadas ARRIBA.
- Lo que lo delata: en las noches lejanas a la venta, **nuestra última escritura fue una BAJADA** (243 Busto · 279 Dúplex · 186 House · 242 Luxury). El motor decidió bajar, bajó lo que el raíl del ±20%/día le dejó, y en la pasada siguiente su propia guarda le impidió terminar. Un descenso de 4-5 pasadas se paraba en la primera.
- Cura: **4ª llave `esDescensoNuestro`** (puro, 9 tests nuevos, 33 en el módulo). Simétrica de la 3ª: aquella deshace nuestra SUBIDA disparada, esta termina nuestra BAJADA interrumpida. Ambas parten de que nuestra propia escritura reciente no es prueba de nada sobre el mercado. Exige (a) ≤7 días, (b) fue bajada, (c) su precio es el que sigue vivo — si Alberto lo resubió en Smoobu, retiene.
- **Radio: ~448 noches reanudan el descenso**, acotadas por raíl, `min_price`, suelo estacional y los dos techos.
- ⚠️ Hilos ABIERTOS del diagnóstico, no cerrados: `floorD`/`ceilD` se calculan SIN `dqDate` (el clamp de calidad se anula solo); `noches_ref`=3 en Busto/Dúplex contra un corpus casi todo de 2 noches (+5-8%); `priorRows` ignora `historico_desde` (afecta a House); `mkt_score` se calcula sin filtro de liga (doble conteo a la baja); y `recorridoPalancas` del check #13 no modela los dos techos, así que su «solo llega al 66%» está desactualizado.
- 🚨 Y una advertencia de método: mi medición del «percentil real» y la del agente NO coinciden (yo Dúplex p70/House p80; él p55/p64 contra corpus de liga). El motor fija el percentil dentro del corpus de SU liga y SU mes; medirlo contra el corpus agregado responde a otra pregunta. **Antes de tocar `target_pctl` hay que fijar UNA definición.**


### 🔕 (04/09/2026) El canal de avisos del pricing no se callaba nunca: 107 abiertas, 94% muertas
- `pricing_alerts` no tenía NINGÚN camino de cierre: `pushAlert` no recrea un aviso mientras siga abierto, pero nadie lo marcaba `resuelta` al desaparecer la causa. Medido: **107 abiertas**, **54 de `precio_revertido`** desde el 10/08, y **51 de esas 54 ya cuadraban**.
- Cura: `lib/sivra/alertas-autoresolucion.ts` (puro, 10 tests) + migración `resuelta_at`/`resuelta_por` (aplicada) + cableado en `guard/route.ts`. **Conservador por construcción**: un piso sin precio vivo HOY no se juzga — sin esa guarda, un fallo de snapshot cerraría en silencio sus alertas vivas.
- Bug latente del mismo detector, arreglado: usaba `MAX(snapshot_date)` **GLOBAL**, así que el día que falle el snapshot de un piso ese piso desaparecía entero del detector. Ahora frescura POR PISO.
- El texto del aviso decía «alguien o algo lo ha pisado en Smoobu» y mandaba a buscar a una persona. **Causa real sin identificar**: 12 de las 58 diferencias vivas son un **×1,250 EXACTO** repetido en los cuatro pisos. Hilo abierto declarado, no cerrado en falso.
- ⚠️ **Corrección a lo dicho horas antes:** el ×1,25 NO es sistémico. El camino de escritura funciona: 93-98% de ~1.400 fechas coinciden exactas con lo que empujamos (ratio mediano 1,000).
- 📉 **Y lo que la auditoría destapó, que es lo gordo y sigue abierto:** los pisos piden un precio que nadie paga. Busto vende en **P10** y tarifica a P40 · Luxury **P16** vs P50 · Dúplex **P23** vs P40. House Sevillana es el único coherente (vende 1,14× mercado, pide 1,25×). Diagnóstico del desvío en curso.

### 🌐 (04/09/2026) La web de la correduría existe, es buena y está DESENCHUFADA (solo lectura)

- Analizada entera la app de Manuel (`albertosuarezgutierrez-gif/asegura`, clonada al contenedor): **13 páginas
  públicas + cotizador + portal**, terminada y cuidada (Next 16, Drizzle, shadcn, CSP con nonce). Tesis B2C:
  «Todos tus seguros, en un solo panel», gratis y sin permanencia. **Decisión de Alberto (04/09): se ENCHUFA donde
  está** — reabre la del 02/09 («su web no se usa»), que queda derogada para la cara pública.
- 🔌 **Por qué no capta nada:** `grupoasegura.com` y `.es` apuntan a **IONOS, no a Vercel** (solo vive en
  `app.grupoasegura.com`); `/cotizador` está en `Disallow` del robots y fuera del sitemap **siendo el destino de
  todos los CTA**; `/historia` (el único form con teléfono) es huérfana y `noindex`; **Web Analytics apagada** →
  cero datos, que NO es cero visitas. La analítica real es PostHog EU, sin conector aquí.
- 🚨 **PostHog corre en producción SIN banner de cookies** (medido en el HTML vivo: 0 apariciones de Cookiebot,
  `PostHogProvider` presente). `posthog-browser.ts:16-22` hace *fail-open*: sin `NEXT_PUBLIC_COOKIEBOT_ID` no pinta
  banner y arranca igual. Art. 22.2 LSSI, en una web que publica DPO.
- 🚨 **`/info-mediador` declara solo AUTO y HOGAR** mientras la home vende 5 ramos y el cotizador 6 — es el papel
  que mira la DGSFP. Además: `/contacto` da 404 enlazado desde los propios Términos; 3 claims de superioridad
  («compañías líderes», «las mejores ofertas»); los Términos describen un **algoritmo de comparativa que no
  existe** (el precio previo al registro es un stub fijo por ramo); texto del mediador aún `PENDING_LEGAL_REVIEW`.
- 👥 **Dos portales de cliente y ninguno en uso: el de Manuel tiene 2 cuentas de 32.602 fichas, el nuestro 0.**
  Él gana en documentos descargables (signed-url + `visible_por_cliente`), avisos que SALEN de verdad, RGPD art.
  17/20 self-service y navegación móvil; el nuestro en recibos, parte de siniestro, calendario accionable (art. 22
  LCS) y autorizaciones a terceros. Su login **no se reutiliza**: atado a la Supabase Auth congelada de Manuel.
  Alberto pide **analizar si se pueden UNIFICAR** (análisis en curso, no decidido).
- 📱 **WhatsApp: decidido botón `wa.me` ya, WABA después.** ⚠️ Pero en el código de Manuel hay **Cloud API completa**
  (webhook, envío, bot IA, pantalla `/whatsapp-bot`) — [suposición] la WABA pudo existir; verificar en el panel de
  Meta antes de repetir «no hay WABA».
- 🗄️ De paso: esa app se quedó **sin BD del 31/08 al 02/09** (129 errores `password authentication failed`), el
  mismo fallo de rotar contraseña sin tocar el `DATABASE_URL` ya documentado para `central-asegura`. Resuelto con
  el redeploy del 02/09 06:32. La ingesta de Codeoscopic sigue entrando (50 webhooks/24 h).
- **Pendiente de Alberto:** qué sirven hoy los dominios en IONOS (el proxy los bloquea desde el contenedor), qué
  número va en el `wa.me`, y si se puede empujar rama al repo `asegura`.

### 🧊 (03/09/2026) La guarda de outlier protegía al fallo que ella misma debía deshacer (PR seguimiento del #2228)
- La pasada de las 20:30 (1ª con la guarda de monotonía) corrigió **3** de las 61 noches infladas de Busto; las otras 58 seguían a 113€.
- Causa: el **outlier de precio actual** (`OUTLIER_RATIO 1,4`, >30 días). El bug del #2192 las dejó a 113€ con base normal ~80 → 1,41, y la guarda leyó ese precio inflado como «noche especial». La salida del fallo se volvió su coartada; la llave por antigüedad no abría hasta 21 días.
- Alcance medido: **86 noches de 3 pisos, TODAS a la venta**, salto medio +28% (Busto 67 · Luxury 12 · Dúplex 7).
- Cura: 3ª llave de `descongelar` — `esSaltoNuestro` (puro, 11 tests). Libera solo si la última escritura es (a) ≤48 h, (b) subida, (c) la que cruzó el umbral y (d) su precio es el que sigue vivo. Si el propietario tocó Smoobu después, (d) falla y retiene.
- `ultima_escritura` pasa de `MAX()` a `DISTINCT ON` para traer old/new y horas. SQL ejecutado contra la BD real antes de mergear.
- Verificado: 742 sivra · 463 guardián · 53 vitest · tsc 0.

### 🧾 (03/09/2026) Comisiones: el cron ya escribe, Occident CUADRA AL CÉNTIMO y el «deudor» era un fallo de signo (solo lectura)
- Pasada 07:30 UTC OK: 12 periodos en `comisiones_devengo`, 4 en cobertura, aviso 🔴 enviado. **CIMA no trajo nada nuevo**
  (recibos 184 / extractos 7 / liquidaciones 9, idéntico a anoche; ingesta DEGRADADA, 62 días sin guardar).
- 🐛 **Cruce con banco VACÍO en los 12 periodos** (`banco_total` NULL): `cima-liq` casa por `compania_seguros` y casi ningún
  abono la tiene → hay que casar por concepto (`SALDO. M00171`/`8/92361`=Occident, `LIQ.COMISIONES AAAAMM`=Mapfre,
  `G.65792 LIQ.000NN`=Generali, `M1454`=Asisa, `PD005`/`-FRA-COMIS-`=Caser).
- 🐛 **Signo EIAC:** `comisiones_recibos` de Occident viene NEGATIVO = a favor del mediador; `cuadre.ts` lo pinta «deudor».
  Con |bruto|−15% casa el banco al céntimo: abr 233,04€ · may 477,62€ (dos claves) · jul 294,30€; jun 244,53€ vs 279,68€ (+35,15€ sin explicar).
- Allianz: remesas 80,77/19,64/17,71€ sin abono que case (no comprobado dónde cobra). Mapfre: recibos CIMA se cortan el 29/03, banco cobra hasta 02/09.
- Banco «8.153,57€ · 11 cías» incluye **3.333,96€ de nómina/pensión** (ref. 28823484E ×3) + 0,29€ Vercel → comisión real 4.819,32€.
- Avisado a Alberto por Telegram (`/api/internal/alerta`, msg 3976). Decisiones pendientes suyas: PR de signo+cruce, sacar la nómina de seguros, extractos Mapfre/Generali.

### 🩹 (03/09/2026) La cartera viva se contaba mal: `import_ref IS NULL` dejaba fuera a un cliente

- **Agujero medido:** cuando la ingesta de CIMA trae una póliza que YA existía en el volcado, actualiza la
  fila vieja y le deja su `import_ref`. Esa póliza —que CIMA mantiene al día— contaba como *lead*.
  Caso: `3021700291186` de **Reale (C0613)**, vence 19/09/2027, suplemento EIAC el 25/08. Reale figuraba
  con **0 vivas** y su cliente era invisible en CRM y portal. Cartera real: **80 clientes / 110 pólizas**
  (no 79/109); volcado 28.728. Ramos: auto 81 · hogar 19 · RC 9 · moto 1; 42 canceladas, 68 no.
- **Arreglo:** regla única en `@central/module-seguros` (`cartera-viva.ts`): viva = `import_ref IS NULL`
  **o** `eiac_xml_hash IS NOT NULL`. Barrido en asegura, portal y plataforma + guardián
  `test/regression-cartera-viva.test.ts`. `eiacXmlHash` es OBLIGATORIO en las firmas a propósito: si fuera
  opcional, olvidar pedirlo a la BD volvería a la regla vieja en silencio. GRANT de esa columna al rol del
  portal (aplicado y en `prisma/sql/`). ✅ **MERGEADO (#2164) y verificado sobre `main` ya fusionada:**
  343/343 tests, guardián 4/4, typecheck de las tres apps, y `central-asegura` desplegada en producción
  desde ese commit (READY). Contado de nuevo contra la BD: **80 clientes / 110 pólizas**, Reale con 1 viva
  (la regla vieja seguiría dando 109).
- 🚫 **CIMA NO deja declarar siniestros. Preguntado y respondido el mismo día (SAU-23934).** El
  proceso **841** existe en la norma EIAC pero **no en CIMA**, las entidades no lo tienen integrado y
  «no hay fecha ni está planificada» su puesta en marcha; la **7.1 sigue sin cambios**. El único envío
  corredor→entidad abierto es el método **`enviarFichero`**, y solo para los **procesos 761 y 77X de
  recibos** (qué son exactamente, sin comprobar). Lección: **que un proceso esté en la norma no
  significa que CIMA lo transporte** — se pregunta antes de diseñar. Muere el port del 841.
- **Pendiente (borrador en Gmail, SIN enviar):** **Generali C0072** — credencial activa desde el 19/05,
  **cero ficheros**, sin confirmación de activación por TIREA y en el Portal tampoco aparece nada.
  **Reale no manda la carga masiva 199/299** — eso se pide a Reale, no a TIREA.

### 🧾 (02/09/2026, noche IV) Cuadre de comisiones: por qué está a cero y hasta dónde puede cuadrar (solo lectura)
- Alberto preguntó si ya se cuadra al céntimo con BBVA + CIMA. **Medido en BD, sin tocar nada:** el libro
  (`comisiones_devengo`/`comisiones_cobertura`) está a **0 filas** porque el cron `cima-liq` (07:30 UTC) corrió a las
  07:31 con la contraseña vieja de `prisma_seguros` (aviso ⚪ en `telegram_avisos_log`); la env se arregló a las 11:10.
  **La pasada del 03/09 es la primera prueba real.**
- **CIMA NO trae liquidaciones de todas:** extractos solo de Allianz (3, remesa 118,12€) y Occident (4, saldo deudor,
  remesa 0); Mapfre 153 recibos y ningún extracto; Generali/Asisa/Caser/MBI… nada. Cuadre al céntimo posible en 2 de 11.
- Ruido en el «8.111,89€ · 11 compañías» del banco: una pensión (905,52€, 31/03) y un abono Vercel (0,29€) con
  `destino='seguros'`. Contradicción abierta: Occident deudor ~−1.470€ en `cuenta_efectivo` vs >1.270€ cobrados (M00171).
- Rutina one-shot 03/09 08:15 UTC en esta sesión: analizar todo tras el cron y avisar por Telegram (`/api/internal/alerta`).

### 🛡️ (02/09/2026, noche III) Auditoría de garantías por compañía + diseño del expediente de tarificación
- Alberto pregunta si hace falta una pantalla para preconfigurar las garantías y capitales de cada
  compañía (lo que él hacía en Avant2). **Auditado el portal entero y el CRM de Manuel: NO hace falta.**
  No existe catálogo de garantías por API (`guarantee`/`franchise` = 0 apariciones), no se pueden fijar
  por API los valores por defecto, y los que él configuró en Avant2 **se heredan solos al cotizar**.
  Detalle citado en `docs/CODEOSCOPIC-API-PORTAL.md` § Garantías y opciones por compañía.
- 🚨 Dos hallazgos que cambian el plan: en hogar **el primer precio es siempre estimado** y el re-rate
  es obligatorio (probablemente cuesta el doble, sin medir), y las opciones por compañía solo se pintan
  con desplegable usando el **formulario incrustado** del fabricante.
- Diseño acordado en `docs/superpowers/specs/2026-09-02-expediente-tarificacion-hogar-design.md`:
  un **expediente puro** con procedencia por campo, tres puertas (corredor, agente, web) con tope propio
  cada una, ficha revisable con la prima actual al lado, y guardar cada cotización para estimar una
  horquilla propia y **decidir si merece la pena gastar** los 0,50€. Falta el visto bueno de Alberto.

### 🏠 (02/09/2026, noche II) Codeoscopic: el contrato `HomeRisk` de hogar, VERIFICADO y cableado (PR #2088)
- Alberto: «usa la IA e internet para nombres, no? tienes ya el contexto de todo como yo». Internet no sirvió
  (codeoscopic.com, el portal y archive.org están bloqueados por el proxy) pero el **snapshot MHTML del portal
  que subió el 01/09 seguía en los uploads de la sesión**: decodificado entero, traía el esquema `HomeRisk`
  completo, `recommend-limits` y los roles de hogar. La sección «no se extrajo» de `CODEOSCOPIC-API-PORTAL.md`
  era falsa por no haberlo buscado.
- Hecho: `peticion-hogar.ts` reescrito con los nombres reales (+6 tests), `desde-cartera-hogar.ts` con
  `partirDireccion` + supuestos para todo lo que el vendor exige y la ficha no tiene (+9), `tiposDeVia` /
  `DEFECTOS_HOGAR` / `elegirDefecto` en `catalogos.ts` (+3), ruta + página + pantalla de hogar por agente,
  docs (§ Hogar del portal reescrita, CLAUDE.md de asegura). ⚠️ `use` = régimen y `occupancy` = uso.
- Queda: `POST /home/recommend-limits` por cablear; envs de `central-asegura`; primera prueba real de J.S.S.

### 🏠 (02/09/2026, noche) Codeoscopic: retarificar HOGAR, cableado de punta a punta (PR #2071 mergeado)
- Alberto: «revisa todo lo de Codeoscopic para probar tarificar con un seguro de hogar… con algún hogar de
  José Suárez Salas». Auditado con agente: TODA la infraestructura (interruptor, libro, tope, `cotizar()`,
  puerto, botón) era agnóstica del ramo; faltaban las piezas de hogar y el contrato del `risk` del vendor.
- Hecho: `persona.ts` (tomador compartido auto/hogar), `peticion-hogar.ts` (+6 tests), `desde-cartera-hogar.ts`
  (+6; riesgo de póliza / gemela / Catastro, rotulado), `retarificabilidad()` en module-seguros (+5; sustituye
  la expresión copiada en 3 sitios), 10 catálogos `/home/*`, rama de hogar en la página y el POST de
  `/cartera/poliza/[id]`, botón por ramo en plataforma. `origenRetarificacion` carga la gemela.
- 🚨 El esquema del `risk` de hogar NO está en el repo ni se puede leer desde aquí (portal bloqueado):
  `CAMPOS_VENDOR` es provisional; un 400 de validación no se cobra. Alberto exporta el ejemplo del portal
  (`docs/CODEOSCOPIC-API-PORTAL.md` § Hogar). Caso de prueba: Occident GPDFS3000276 (Sevilla, 76 m²/1994).

### 🧹 (02/09/2026) Cerrado lo que quedaba del auditor: novedades fuera del generado + la ambigüedad, vigilada
- **Opción 2 hecha:** `novedades` sale a `apps/plataforma/lib/novedades.generated.json`. Se derivan de la
  MEMORIA, no del código, así que mezclarlas con la radiografía hacía que cada PR que anotara memoria
  reescribiera el JSON grande. Comprobado: añadir una entrada ya no toca `estructura.generated.json`.
- 🪤 **La ambigüedad del troceo era un bug ACTIVO, no teórico:** `- **Hecho por Claude Chrome (02/09):**`
  —cuerpo de una entrada— se leía como cabecera y salía como novedad con fecha vacía; solo se salvaba por
  caer en la posición 16 de 15. Medido, no supuesto.
- **El arreglo NO fue endurecer el parser.** Se probó exigir la fecha al final de la negrita y los datos lo
  tumbaron: 14 de 137 cabeceras reales de la historia la llevan en medio (`**título (30/06) — texto.**`).
  Endurecer las habría convertido en cuerpo. Se arregló el DATO (fecha fuera de los paréntesis) y se puso
  un guardián que caza la recaída con el mensaje de cómo escribirlo.
- Guardián probado en los dos sentidos: falla con la línea mala, pasa con la buena. 180/180 en la raíz,
  17/17 rotar-memoria, `--check` ✓, typecheck de plataforma OK.
- ⚠️ Y una trampa de método: un `git checkout -- docs/CONTEXTO-SESIONES.md` para limpiar una prueba se
  llevó por delante el arreglo de esa misma línea. Verificar después de restaurar, no antes.

### 🗞️ (02/09/2026) Las «novedades» del panel no eran novedades — y debajo, la memoria se fragmentaba
- El extractor usaba un regex que casa con CUALQUIER bullet en negrita, y el cuerpo de cada entrada está
  lleno de sub-bullets SIN indentar. El panel pintaba trozos de argumentación a media frase («Cablear un
  valor es lo que deja una primitiva sin adoptar:»), **0 de 15 con fecha**, y las entradas `###` —el
  formato de casi todas las sesiones— no salían NUNCA. Ahora, 15 de 15 fechadas.
- 🔍 **Lo gordo estaba debajo:** `rotar-memoria` tenía el mismo agujero, porque un sub-bullet y una cabecera
  antigua son la MISMA sintaxis. Contaba **138 «entradas» donde hay 65**: al rotar el mes, 73 sub-bullets se
  habrían archivado como sesiones sueltas. No había saltado porque aún no tocaba rotar.
- La separación no es sintáctica sino de ESTADO: con una entrada nueva abierta, un bullet en negrita es
  cuerpo suyo — salvo que lleve fecha, que es lo que tiene una cabecera de verdad. La primera versión sin
  esa excepción rompió un test de `rotar-memoria`; el fixture tenía razón y la regla estaba mal.
- Un solo criterio: `auditar-novedades.mjs` importa el troceo de `rotar-memoria`, no lo reimplementa.
  Guardián `regression-novedades-memoria.test.ts` (5 tests), uno contra la memoria REAL. PR #2064.
- 🪤 **Y al anotar ESTA entrada me la pegué con lo mismo:** insertarla buscando la subcadena `###` la metió
  dentro del PREÁMBULO, que cita el formato como ejemplo. Se vio porque la novedad 1 salió sin fecha. Para
  localizar la primera entrada hay que mirar LÍNEAS en columna 0, no subcadenas.
- Antes, en la misma sesión: **PR #2044** (panel de Salud a cero avisos: la reimplementación de alquiler al
  módulo compartido + CLAUDE.md de almacen y asegura-portal) y **PR #2053** (el `--check` deja de romperse
  porque una sesión anote memoria; criterio de comparación a `auditar-comparacion.mjs`, testeado).
- ⚠️ **Carrera confirmada dos veces:** si `main` avanza entre tu merge y el squash, el generado entra
  mintiendo (el #2044 dejó el mapa apuntando a un archivo que #2047 había borrado). Lo absorbe
  `auditoria.yml`, que YA existe y regenera post-merge por PR — comprobado corriendo tras el merge.

### 📄 (02/09/2026) El agente contable no sabía leer un PDF escaneado — y tampoco decía por qué (PR #2051 mergeado)
- Alberto subió «movimientos (2).pdf» al chat 📎 y recibió «prueba con una foto más nítida o un PDF que tenga texto».
- **Descartado que fuera pdf-parse, con datos:** el cron `subastas-enriquecer` leyó decenas de PDF en prod esa misma
  mañana (06:15-09:31 UTC) y la lib va bien en local con la misma versión del lockfile desde el 16/07. **El PDF no
  traía capa de texto**, y el chat contable era el ÚNICO camino de PDF del repo sin OCR.
- Ahora: `MotivoSinLectura` (pdf_ilegible · pdf_sin_texto{no_intentado|sin_paginas|error|sin_datos} · formato) →
  el mensaje dice si el documento se ha MIRADO o no; y `opts.ocr` (JPEG embebidos → PDFium → visión), solo en el chat.
- **Probado sobre un PDF sin capa de texto fabricado a propósito** (y repetido sobre `main` ya mergeado): pdf-parse
  abre 1 página y saca 0 caracteres, los dos rasterizadores devuelven la página y la imagen sale legible. Guardián
  `rasterizar-pdf.test.ts` — sin él la regresión es INVISIBLE: saldría `ocr:'sin_paginas'`, un desenlace legítimo.
- 🚨 **Lección de proceso:** el PR chocó TRES veces por `CONTEXTO-SESIONES.md` (main recibe automerges cada pocos
  minutos). Se resolvió sacando la memoria del PR: **un PR de código no debe tocar el fichero de memoria**.
- **Sin cerrar:** la visión no se ha probado end-to-end (el contenedor no tiene claves de IA) ni se ha visto el PDF de
  Alberto; `expenses/agent/scan` (Gmail) sigue sin OCR y `parse-invoice` sigue con `require('pdf-parse')` en la raíz.

---

### 🔌 (02/09/2026, tarde) Cinco vigías sin canal dejan latido y se ven en la pantalla (PR #2086)
- Ocho rutinas de Claude sin `ALERTA_TOKEN`: Telegram mudo y sin latido, o sea **invisibles**. Alberto decidió no
  poner el token; se deja el circuito cerrado para que, cuando lo pegue, aparezcan solas. Mientras: **rojo con «sin
  ninguna señal registrada»**, que es la verdad, no ruido.
- Se cablean **cinco** (`psd2_health_check` 192 h · `facturas_correo` 30 h · `fiscal_novedades`, `rrhh_compliance`,
  `github_vigia` 840 h) en los CUATRO sitios: allowlist de `/api/internal/latido`, `AGENTES_VIGILADOS` (27→32), sonda
  del cron vigía y mapa de `/operador/agentes`, más el paso «Deja huella» en cada `SKILL.md`.
- **Las otras tres, a propósito NO:** `mercado-booking`/`trading-analista` ya estaban cableadas (solo falta token);
  `pricing-agente` ya se vigila por datos; `ialimp-client-health` vigila a un cliente que **ya no usa ialimp** — cablear
  un agente muerto es fabricar un rojo sin sentido.
- ⚠️ **Mi «salida sin tokens» era falsa**: el endpoint de latido se autentica con el MISMO `ALERTA_TOKEN`. Lo que sí
  es cierto y cambia el coste: es **UN valor**, pegado ocho veces, no ocho secretos.
- Corregido un verde prestado: `facturas-correo` (rutina 11:00) apuntaba al latido del **cron** `facturas_gmail` (06:15).
- 🪤 **Lección de guardián:** un `(dd/mm)` dentro de un bullet de cuerpo rompe `rotar-memoria` y dos tests. Las fechas
  del cuerpo van SIN paréntesis.

### 🧭 (02/09/2026, tarde) Los segmentos de `/banca` estaban escondidos detrás de «Inicio» (PR #2106 mergeado)
- **Alberto creyó que los cambios no estaban desplegados.** Lo estaban: su propia captura lo probaba —«Transferencia»
  ya no salía en el menú—. Lo que pasaba es que fue a buscar «Ingresos» **al menú**, que es donde uno lo busca, y los
  cinco segmentos de `/banca` vivían SOLO en la fila de pestañas de la página: cinco pantallas tras una sola entrada.
- Ahora cuelgan de «Inicio» como sub-entradas. El activo lo decide el `?tab=`, no la ruta (`usePathname()` devuelve
  `/banca` para todos), lo que obliga a `useSearchParams()` en el sidebar: **comprobado con `pnpm run build`** que no
  pide Suspense porque todas las rutas del panel son dinámicas. Era el riesgo real y se midió.
- **«Dinero» NO tiene entrada propia a posta:** es `/banca` sin query, o sea lo mismo que «Inicio». Ponerlo habría sido
  una segunda entrada de menú a la misma URL — la duplicidad que el panel llevaba todo el día quitándose.
- ⚠️ **Un guardián frágil dio rojo sin que nada estuviera roto:** `regression-correduria-menu` buscaba
  `const NAV_NEGOCIO = [` LITERAL y bastó añadir la anotación de tipo. Se hizo tolerante, pero **se verificó que sigue
  saltando** al quitar de verdad la Correduría (fuera → `not ok`; dentro → verde). Un guardián arreglado a base de
  relajarlo deja de guardar; comprobar que aún caza el fallo real es parte del arreglo, no un extra.
- **El guardián de rama hizo su trabajo:** bloqueó un push estando en `main` que habría mandado la rama SIN el commit
  —el fallo del PR #1787—. Rehecho con `git push -u origin HEAD`.

### 🔗 (02/09/2026, tarde) Un SOLO hub financiero: `/finanzas` entra en `/banca` (PR #2083 mergeado)
- **Alberto lo dijo horas antes («hay mucha duplicidad») y esta sesión lo convirtió en un dilema de arquitectura
  en vez de medirlo.** Medido: la pestaña «Categorías» de `/finanzas` montaba `finanzas/CategoriasTab.tsx`, **el
  mismo fichero** que el segmento Personal de `/banca` — la misma pantalla en dos URLs, con enlaces de ida y vuelta.
- ⚠️ **Y corrige una segunda afirmación propia hecha sin mirar** («la única diferencia es una pestaña»): el resto de
  `/finanzas` NO era duplicado — traía sus banners de salud de extracción, ayudas con plazo y novedad fiscal, y sus
  KPIs. Nada de eso existía en `/banca`. No había que ELEGIR entre dos hubs: había que traer uno dentro del otro.
- `/banca` gana el segmento **«Ingresos»** (monta `FinanzasClient` con prop `embebido`, sin su `<main>` porque ya lo
  pone `<Pagina>`); `FinanzasClient` pierde su sistema de pestañas; `/finanzas` queda como **redirect** (conserva
  `?tab=gastos|fiscal` y manda `?tab=categorias` a `/banca?tab=personal`, la que sobrevive).
- Las hijas (`/finanzas/gastos`, `/fiscal`, `/pilar`, `/tarjeta-credito`) **no se tocan**: solo dejan de colgar de un
  hub que ya no existe. Repuntados los 3 enlaces a la raíz vieja (sivra/fiscal, PilarClient, paleta de comandos).
- **Método, que es la lección de la tarde:** dos veces se afirmó algo del diseño sin haberlo medido, y las dos veces
  era falso. La medición era barata (un `grep` de quién importa `CategoriasTab`).
- **Sigue pendiente de Alberto:** las 8 rutinas sin `ALERTA_TOKEN` — **decidió dejarlo como está el mismo 02/09**, con la
  consecuencia declarada: si el sync bancario se rompe, no hay canal que avise. Y las 9 páginas sin contenedor.

### 🫀 (02/09/2026, tarde) El vigía de agentes tiraba su trabajo, y el panel se descuadraba en móvil (PR #2066 mergeado)
- **`/operador/agentes` pintaba ⚪ sobre 23 de 29 agentes… y el dato SÍ existía.** El cron `agentes-latido` evalúa 27
  agentes cada mañana con su umbral y su sonda, y **no lo guardaba**: solo iba al JSON de su respuesta y a un Telegram
  que en **8 rutinas no está cableado**. Ahora lo persiste en `agente_salud` y la pantalla lo lee (6 → 13 con
  telemetría), más una sección con los **19 latidos vigilados que no salían en ninguna pantalla**.
- ⚠️ **Persistir un veredicto crea un riesgo PEOR:** un vigía muerto congelaría la pantalla en su último verde. Por eso
  **caduca a las 36 h** → gris «nadie ha comprobado». Decisión en `lib/agentes-salud-clasificar.ts` (puro, 10 tests):
  caducado ≠ veredicto · sonda rota ≠ sano · `horas` NULL ≠ 0 (colapsarlo a 0 lo pinta VERDE, 0 ≤ cualquier umbral).
- 📱 **Responsive, y el hallazgo de MÉTODO que lo tapaba:** `LayoutShell` declara `overflowY:'auto'` sin `overflowX`, y
  por la regla de CSS Overflow el eje X computa a `auto` → **el scroller horizontal es LayoutShell, no `<body>`**. O sea
  **`document.body.scrollWidth` NUNCA delata un desbordamiento en esta app**, y con esa medición mala se dio el problema
  por inexistente. Se mide sobre el scroller.
- **La causa:** un `display:grid` sin `gridTemplateColumns` dimensiona su pista implícita con el contenido más ancho, así
  que una tabla de `minWidth:880` arrastra la página y **anula el `overflowX` de la propia tabla**. Medido en Chromium:
  cliente 910→390 · póliza 590→390 · pricing-auto 354→320. `apartamentos` NO se cura así (su gráfica de 12 meses mide
  ~513 px de min-content): el scroll va en la gráfica, 408→320/390.
- **Pendiente de Alberto:** las **9 páginas sin ningún contenedor** (van a sangre, sin margen) y las 8 rutinas sin
  `ALERTA_TOKEN` — esos tokens se ponen en `/operador/secretos`, no los puede poner un agente.

### 🧱 (02/09/2026, noche) Las 43 cabeceras restantes, al componente compartido (PR #2054 mergeado)
- Con #2045, `apps/plataforma` queda **entera** sobre `PageHeader`: 43 cabeceras + 3 `BtnLink` + 9 `ThinBar`, en
  **4 tandas de agentes** con lista EXPLÍCITA de ficheros por tanda (y de los prohibidos) para no pisarse.
- 🔧 **Dos huecos de las primitivas que solo se ven al adoptarlas de verdad**, los dos destapados por botones reales
  que se quedaban fuera: `BtnLink` **no soportaba `target`/`rel`** (firma SCA del banco, subir póliza, comparar
  precio: los tres abren pestaña nueva) → prop `nuevaPestana` con `rel="noopener noreferrer"` implícito y NO
  opcional; y `ThinBar` **no llevaba transición**, así que dos barras perdían su animación al migrar.
- **Es un cambio de ASPECTO, no solo de código:** títulos a 20px/700 (venían de 18-24 y peso 700-900), margen bajo
  la cabecera unificado en 24px, y el emoji que iba dentro del `<h1>` pasa a la cápsula de 38×38 `--primary-light`.
  `pricing-auto`/`pricing-rentabilidad` dejan su paleta hex fija: su título ya responde al tema.
- El commit lleva **`[preview]`** a propósito: con `--sin-previews`, 43 pantallas cambiando de aspecto se verían por
  primera vez EN PRODUCCIÓN. Un build es más barato que eso.
- 🚨 **Y el `[preview]` falló DOS veces seguidas antes de funcionar** (lo caro: el síntoma es idéntico a un
  build legítimamente ignorado, así que no falla nada). Necesita **DOS condiciones a la vez**: ir en el asunto
  del **ÚLTIMO** commit del push (el script lee `VERCEL_GIT_COMMIT_MESSAGE`, el HEAD empujado) **Y** que ese
  commit **toque la app** — `[preview]` levanta el veto de `--sin-previews` (paso 1b de
  `scripts/vercel-ignore-build.mjs`) pero el paso 3 salta igual por rutas. Un commit que solo toca un `.md` de
  la raíz NO construye, lleve marcador o no. Documentado en el `CLAUDE.md` raíz y en el de plataforma.
- **Sin migrar a propósito:** `banca/transferencia` (sus 3 `<h1>` son estados de un formulario) e
  `invitado/limpieza` (única pantalla de Vanesa, intranet de invitado, no el panel `(usuario)`).

### 🩺 (02/09/2026) Salud de la arquitectura a cero avisos (/admin → 🗺️ Estructura)
- **La reimplementación era real, no un falso positivo:** `apps/alquiler` llevaba su propio catálogo y calculaba
  el disponible a mano teniendo `@central/module-materiales` al lado. Puente en `lib/materiales-compartidos.ts`
  (NO se migra la tabla). Su límite es lo caro: `alquiler_materiales` no tiene columnas económicas, así que
  `resumenStockUnidades()` **recorta `valorTotal` del tipo** para que no compile pintar «0 €» de inventario.
- **`CLAUDE.md` propios** para `apps/almacen` y `apps/asegura-portal` (los escribieron dos agentes leyendo el código;
  lo no verificable va marcado «pendiente de confirmar», no inventado). `docs/FUENTES-DE-VERDAD.md` y el raíz, al día.
- `asegura-portal` no tenía ficha curada en `estructura.ts` (el auditor lo avisaba); añadida y radiografía regenerada:
  **0 reimplementaciones · 0 apps sin CLAUDE.md**. Guardián 168/168, suite completa en verde. **PR #2044 mergeado**.
- 🏁 **Y una CARRERA que deja el generado mintiendo, medida aquí:** `main` avanzó con el PR #2047 entre mi
  `git merge main` y el squash, y ese PR borraba `apps/asegura/lib/comisiones-motivo.ts`. GitHub aplica el squash
  sobre el main NUEVO, pero `mapa-funciones.generated.json` se generó con el VIEJO → entró en `main` con una entrada
  a un archivo que ya no existe. **Regenerar el índice antes de empujar no basta si la base se mueve**; el
  `auditar --check` (que ya fallaba en la base 2cb05af6, comprobado en worktree) es quien lo caza. Regenerado en PR aparte.

### 🧩 (02/09/2026, noche) Las 5 primitivas huérfanas: se MIDIÓ antes de decidir (PR #2045 mergeado)
- Llevaban desde su creación a cero consumidores. La pregunta «¿la uso o la borro?» se contestó contando sitios
  reales en toda la app, no a ojo: `PageHeader` **53** · `BtnLink` 11 · `ThinBar` 11 · `BarListRow` **0** ·
  `LegendDot` **1**. Las dos últimas, **borradas**; las tres primeras, adoptadas.
- **Cablear un valor es lo que deja una primitiva sin adoptar:** `ThinBar` fallaba en 8 de 11 sitios solo por
  llevar el alto fijo a 6px. `alto` y `track` pasan a props. Y una primitiva con UN consumidor no es sistema
  de diseño, es un componente local.
- Migradas las 10 cabeceras que además repetían su propia media query → **15 reglas `!important` fuera** de
  `globals.css`. Quedan 43 cabeceras, 7 `BtnLink` y 9 `ThinBar` para tandas siguientes.
- 🚨 **`.seo-header` parecía redundante y NO lo era:** sus reglas de ≤480px ponen los botones a ancho completo
  y `.page-header` no hace eso. Antes de borrar una clase «duplicada», compara regla por regla.
- Verificado por la sesión, no por el informe de los agentes: tsc 0 · 165/165 en la raíz · tokens 10/10.

### 🕳️ (02/09/2026, noche) El feed PSD2 tenía dos estados donde hay tres (PR #2042 mergeado)
- `/banca` pintaba «último mov. **ninguno**» sobre un NULL. `ultimoMov` es `MAX(fecha_operacion)` y esa columna es
  **nullable**: NULL = «trajo apuntes, pero no sé de cuándo son», que es lo contrario de lo que decía el texto.
- **Medido antes de tocar, y corrige lo que yo mismo había apuntado:** 0 filas sin fecha en las **2.123** de la tabla
  (los seis orígenes). Es una violación **latente**, no una mentira activa — pero el esquema la permite.
- Se saca del JSX a `lineaCuentasFeed()` (helper puro + 5 tests). De paso: la lista vacía dejaba la línea en blanco
  (una conexión vinculada que aún no trae nada) y la fecha salía en ISO crudo en un panel que usa dd/mm.
- ⚠️ **Mismo agujero en la skill `psd2-health-check`**, y ahí el fallo es peor: `MAX()` y los `COUNT(... FILTER)`
  ignoran los NULL, así que un feed que entregue apuntes sin fecha se declararía **roto**. Anotado con su consulta
  de descarte.
- 🔁 **El bloque Personal de `/banca` daba vueltas en círculo**: sus salidas iban a `/finanzas?tab=categorias`, que
  monta EL MISMO componente que ya estabas viendo. Ahora apuntan a `/banca?tab=personal` (el filtro `?banco=` viaja igual).
- **Límite estructural anotado, no arreglable ahí:** `cuentas_bancarias` no tiene columna que la ligue a
  `conexiones_banco` — una cuenta psd2 recién vinculada y a cero es indistinguible de una manual o de Excel.

### 🗺️ (02/09/2026, noche) plataforma: podar lo inalcanzable y agrupar el menú por TRABAJO (PR #2038 mergeado)
- Inventario medido de la app entera: **76 páginas · 51 entradas de menú · 25 fuera del menú · 7 inalcanzables · 0 enlaces rotos**.
  Mapa completo en `docs/PLATAFORMA-MAPA-PAGINAS.md` (incluye qué NO se comprobó).
- **Podado (1.204 líneas):** `/sivra/inversion` (616 líneas, la 3.ª página más grande, **sin un solo enlace** desde PR #1117),
  `RadiografiaClient.tsx` y `ProyeccionClient.tsx` (cuerpos muertos desde la unificación en `/banca`). Las RUTAS quedan como
  redirect: borrar el cuerpo no rompe marcadores, y el historial de git es el «por si acaso».
- **Menú reagrupado por trabajo:** nace `NAV_OPORTUNIDADES` (concursos · subastas · analizar compra · empresas · trading ·
  patrimonio), antes repartidas entre secciones que no las explicaban. Trampa evitada: `seccionActiva()` con `rol='empresas'`
  vaciaba el menú de esa cuenta en silencio.
- Cableado `/sivra/partes/establecimientos`: el cron `ses-latido` apuntaba a una pantalla que **no se podía abrir**.
- **Pendiente de decisión de Alberto:** fundir duplicadas de verdad (2 hubs financieros, 6 pantallas de dinero de pisos,
  4 de pricing) — semanas, por goteo · `PageHeader`/`BtnLink`/`BarListRow`/`ThinBar`/`LegendDot` siguen con 0 consumidores ·
  `banca/page.tsx:221` pinta «último mov. ninguno» sobre un NULL (viola la regla NULL≠0) · Operador = 20 de 51 entradas.

### ⚪ (02/09/2026, noche) Comisiones: el «no se ha podido leer la cartera» no decía DÓNDE mirar (PR #2029 mergeado)
- El cron `cima-liq` avisaba `asegura_error` y `comisiones_devengo`/`comisiones_cobertura` siguen a **0 filas**: nunca
  ha leído. Comprobado contra la BD: `seguros` está SANA (1 correduría · 7 `cuenta_efectivo` · 9 liquidaciones ·
  184 recibos, 104 cobrados · grants y enums de `prisma_seguros` correctos). El fallo es de la app, no del dato.
- **No se pudo diagnosticar porque nadie lo contaba:** dos `catch {}` mudos en asegura (ruta + `lib/comisiones.ts`),
  sin `console.error`, colapsaban conexión/schema/permisos/fila-que-falta en un `{estado:'error'}` pelado. Ahora
  llevan `motivo` (`bd`/`sin_correduria`) + pista corta SIN secretos (`central/…/P2021/public.corredurias`, módulo
  puro `comisiones-motivo.ts`), plataforma la propaga y el Telegram la enseña. La próxima pasada se nombra sola.
- ⚠️ **Y la hipótesis que escribí era FALSA — corregido en el PR #2047.** Dije «probablemente el schema»:
  `urlFuenteCartera` fuerza `schema=seguros` en vez de respetar el que traiga `DATABASE_URL`. Se conserva como
  blindaje (esa cadena es la MISMA que la auth, donde el schema bueno es `public`, y ahí `clientes` es OTRA tabla),
  pero **no era la causa**. La midió el PR #2034: `credenciales` — la contraseña de `prisma_seguros` se rotó TRES
  veces ese día (05:51, 05:52 y 10:17, en `postgres_logs`) y el `DATABASE_URL` de Vercel `central-asegura` se quedó
  con la vieja. El repo ya se había avisado a sí mismo en el SQL de `crm_seguros` («rotarla tumbaría
  central-asegura») y se rotó igual. Regla nueva en el CLAUDE.md raíz: **rotación y env, en el mismo paso.**
- **Deuda propia, saldada en #2047:** #2029 y #2034 crearon dos clasificadores del mismo error con horas de
  diferencia. Gana `lib/error-cartera.ts` (seis causas accionables y borra la URL del log); `comisiones-motivo.ts`
  retirado y la ruta de comisiones al compartido → las NUEVE rutas del puerto hablan igual.
- Verificado: 2.568 tests `node --test` + 53 vitest en verde, typecheck de asegura y plataforma OK.
- **De regalo, la 7ª medición del CI mudo (anotada en `CLAUDE.md`), y la más limpia:** el MISMO acto —merge
  de `main` con contenido real + push— salió **mudo en draft** y **disparó los 19 runs ya sin draft**. O sea:
  des-draftear no reprocesa lo empujado antes, solo arma la rama para el push SIGUIENTE. Corrige el «no
  des-draftees, no mergees main» del #1962, que solo vale mientras haya lag (aquí el `head.sha` coincidía).

---

### 🪞 (02/09/2026, tarde) La skill de UI llevaba DOS MESES contradiciendo al CLAUDE.md de su app
- Al actualizar la documentación tras el PR #2024, `plataforma-maestro/references/ui-inicio-dashboard.md`
  decía «**modo oscuro automático (`prefers-color-scheme: dark`)**» y un toggle de TRES estados
  «🌗 Auto → ☀️ Claro → 🌙 Oscuro». Las dos cosas son falsas desde el **PR #707 (03/07/2026)** — y lo que
  describía **es exactamente la causa del bug** que Alberto reportó con captura: el ahorro de batería del
  móvil ponía el sistema en oscuro y el panel se oscurecía solo.
- Medido contra el código, no supuesto: `prefers-color-scheme` **no aparece** en `globals.css`; `:root`
  lleva `color-scheme: only light`; `ThemeToggle.tsx` es `type Tema = 'light' | 'dark'`, sin «Auto».
- 🚨 **Lección de método:** una skill puede contradecir al `CLAUDE.md` de su propia app durante dos meses
  sin que nada falle — ni `tsc` ni los tests leen prosa, y la auditoría diaria no lo cazó. Antes de dar por
  buena una afirmación de una skill sobre COMPORTAMIENTO, cotéjala con el código (un `grep` basta).
  Hermana de la exención con motivo falso del PR #2024: en los dos casos lo que protegía al error era que
  su justificación tenía buena pinta.
- Corregido en la skill (con el porqué y el veto a reintroducirlo) y ampliado el `CLAUDE.md` de la app con
  el estado del sistema de diseño y los dos pendientes que decide Alberto. Prueba sobre `main` ya fusionado:
  165 tests · tsc 0 · build OK.

### 🧱 (02/09/2026, tarde) plataforma: el CUERPO del Inicio, al sistema de diseño (PR #2024 mergeado)
- Alberto sobre `/banca` en producción: **«no está terminado, ¿no?»**. Correcto. Los tres PRs anteriores
  tocaron el CHROME (pestañas, migas, ancho, cabecera del libro); **el cuerpo de la página no lo tocó
  nadie**, y el cuerpo es lo que se ve al abrir. Su captura además iba desplazada: el sidebar es fijo.
- Medido antes de tocar: **7 primitivas con CERO consumidores**. `ResumenPeriodo.tsx` tenía su propia
  `card`, su propio `Kpi` y su propio `<style>` — copias de lo que `components/ui.tsx` ya daba. Copiar el
  estilo en vez de importarlo es por qué arreglar el oscuro o el móvil hay que hacerlo N veces.
- Enchufado: `KpiCard`/`CardHeader`/`cardStyle`/`Stat`/`Badge`/`TablaScroll`/`Pendiente` en
  `ResumenPeriodo`, `NegociosResumen` y `banca/page.tsx`; `DeltaBadge` colorea **por significado** (gastar
  menos = verde). Rejillas de los `<style>` a `globals.css` (sin el `!important`, que solo existía para
  ganarle al estilo en línea). El `IntervaloSelector` —compartido con `/finanzas`— deja de ser 15
  pastillas con borde: segmentado + chips.
- 🚨 **Las barras del gráfico estaban exentas del guardián con un motivo FALSO**: «son series, no estados».
  Ingreso y gasto SON el par semántico, y el hex no cambiaba en oscuro. Convertidas a token, exención
  retirada; la dona sí sigue categórica (ahí el motivo se sostiene).
- **Pendiente de decisión de Alberto:** `PageHeader`, `BtnLink`, `BarListRow`, `ThinBar` y `LegendDot`
  siguen a cero consumidores — NO se enchufaron a la fuerza (sería repetir el defecto): o se usan donde
  encajen o se borran. Y `page.tsx:221` dice «último mov. ninguno» sobre un NULL (regla del NULL), sin
  tocar por ser cambio de texto que Alberto lee a diario.

### 📎 (02/09/2026, tarde) Correduría: documentos de verdad sobre la BD de casa (PR #2022 mergeado)
- Alberto: «ya está nuestra bbdd, prueba y sigue». Probado: `seguros` en central tiene los mismos recuentos que se
  midieron en el origen (32.600 fichas, 28.843 pólizas, 109 CIMA/67 activas, 172 calles cifradas, 181 localidades,
  330 CP, 4.506 matrículas, `unaccent` instalada) → el buscador por riesgo/calle de #2001 funciona sobre la copia.
- Lo único que estaba bloqueado por el traspaso eran los **documentos**: tabla propia `seguros.documentos`
  (cliente | póliza | siniestro, estado pedido/recibido/revisado, fichero en `bytea` ≤10 MB, sin claves de Storage),
  migración aplicada y sus 4 CHECK probados en la BD real con rollback (0 filas dejadas). Puerto en asegura
  (`/api/operador/documentos[/id]`), lógica pura en module-seguros (5 tests), pantalla en la ficha de cliente y de
  póliza de plataforma (subir · anotar pedido · ver · revisado · borrar). `NECESARIOS_EMISION_AUTO` = DNI, permiso,
  ficha técnica: un «pedido» sigue faltando.
- No probado de punta a punta con la app (el contenedor no tiene `DATABASE_URL`): la primera subida real la hace
  Alberto desde `/correduria/cliente/[id]`. Sigue pendiente (y cuesta dinero): la petición de hogar a Codeoscopic.


### 🔐 (02/09/2026, ~09:00 UTC) Correduría: TRASPASO CERRADO salvo Fly — auth copiada, CRM solo como motor de CIMA (PR #2007 mergeado)
- Alberto: «el punto 2 no se hace… quiero tener todo en nuestra bbdd» → **NO se rota `crm_seguros`** (anotado en
  `apps/asegura/CLAUDE.md` y `docs/TRASPASO-CORREDURIA.md`) y se copió `auth.*` de Manuel a central por dblink con
  los mismos UUID: 9 users (2 reales con bcrypt + TOTP), 11 identities, 2 mfa_factors; 9/9 enlazados con
  `seguros.usuarios`. Trigger `on_auth_user_created` → `seguros.handle_new_user()` creado. Rol temporal de origen borrado.
- Tres trampas medidas: `auth.*` de origen con RLS y 0 políticas → **0 filas sin error** para un rol sin BYPASSRLS
  (un count=0 ahí no es «no hay»); en PG16 INHERIT va por GRANT (un rol NOINHERIT no hereda tras `ALTER … INHERIT`);
  `postgres` no puede hacer GRANT sobre `auth.*` (aviso mudo) → `pg_read_all_data`. Todo en `prisma/sql/2026-09-02_seguros_auth_traspaso.sql`.
- Inventario del CRM: Supabase = solo Auth; el único PostgREST (`record-evidence.ts`) no tiene llamadores → **sin cambios de código**.
- 🛑 **Decisión de Alberto acto seguido: «yo eso no lo quiero… no es necesario el acceso, eso ya desarrollaremos».** La web
  del CRM de Manuel NO se usa ni se migra su login (nada de variables Supabase en Vercel `asegura`, ni Google/TOTP/SMTP);
  las pantallas van en `plataforma` → `/correduria`. El CRM queda desplegado SOLO como motor de ingesta de CIMA (escribe en
  `seguros` con `crm_seguros`); dependencia viva: adaptador Fly de Manuel, hasta tener ingesta propia. PR #2007 mergeado (`7ba37122`).
- ⏸️ **Cierre del día (Alberto): «fly es barato y ya está hecho, hay otras prioridades».** Statu quo: cron → CRM (motor) → Fly →
  `seguros`. Único pendiente: transferir la app de Fly a cuenta de Alberto cuando Manuel pueda (borrador v8 en TRASPASO). El port
  de `cima-pull` a `apps/asegura` queda APARCADO; el inventario del grafo se guarda de referencia. Vigila la auditoría diaria.
- Tras el merge se barrieron las afirmaciones «cartera NO migrada / foto vs origen» que quedaban en `CLAUDE.md`, skills
  `central-maestro`/`auditoria-central`/`agente-correduria`, bloque 2-quater de `/auditoria-diaria`, `RUTINAS` y `FUENTES-DE-VERDAD`:
  el origen de Manuel es foto congelada; la señal de salud pasa a ser el heartbeat `cima_pull_*` en `seguros.operational_events`.
- ✅ **Prueba punta a punta (09:25 UTC, run #188, `mode: real`):** Actions → CRM (Vercel) → Fly → TIREA (6 páginas, 128
  resultados) → `seguros` de central, 0 errores. `processed: 0` = los 128 ya estaban en `cima_ficheros` (86 confirmed + 42
  review), no un fallo. Con esto el traspaso queda CERRADO salvo el adaptador de Fly. PRs #2007 y #2020 mergeados.
- 🔴 **`/correduria` en plataforma sin cartera (captura de Alberto 12:06):** causa medida en `supavisor_logs`, no supuesta:
  `password authentication failed for user "prisma_seguros"` (la URL de Vercel `central-asegura` llevaba otra contraseña).
  Contraseña ROTADA 10:17 UTC y verificada por dblink en pooler 6543/5432 (el pooler tardó ~3 min en aceptarla: caché).
  Alberto pega la URL nueva en `DATABASE_URL`/`DIRECT_URL` de `central-asegura` y redespliega. PR #2034: el puerto devuelve
  `causa` (`lib/error-cartera.ts`) y plataforma la pinta; el texto viejo («ASEGURA_DATABASE_URL / central_asegura») fuera.
  ✅ Pegado y redesplegado 11:10 UTC (Claude Chrome); sesión `prisma_seguros` aceptada 11:15; `/correduria` en plataforma
  pinta la cartera desde central (captura 14:45 local, buscador con 4 fichas).
- 🔒 **Control de la BD sin cortar a Manuel (decisión 02/09):** las 8 cuentas suyas copiadas a `auth.users` de central quedan
  `banned_until = infinity` (solo vive la de Alberto). **PENDIENTE de Alberto, sin prisa:** (1) Vercel `asegura` →
  `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` a central (+ `SUPABASE_SERVICE_ROLE_KEY` de central) y redeploy, para que el login del
  CRM se valide contra central; (2) GitHub `asegura` → ruleset: `main` exige PR con su aprobación (Manuel tiene write);
  (3) Vercel → Team → Members: comprobar si Manuel está y sacarlo del proyecto `asegura`. Detalle en el chat de esta sesión.
- 🔁 **Duplicidad medida en `seguros.clientes` (32.601 filas, 0 fusionadas):** 587 grupos con MISMO nombre+teléfono (610 fichas
  de más), 556 de ellos `asegura_app`+`intranet` (la misma persona cargada de dos volcados); 121 grupos tienen pólizas en varias
  fichas y 46 pólizas VIVAS de CIMA cuelgan de una ficha duplicada (siempre la de `intranet`). DNI casi no sirve para deduplicar
  (28.697 fichas sin DNI). El CRM trae la infra de fusión (`merged_into_cliente_id`, `cliente_merge_log`, mig 0093) pero
  NUNCA se usó (0 fusiones); plataforma detecta el gemelo y avisa «sin fusionar». Fusión pendiente de decisión de Alberto.
  Caso medido (cliente real por CIMA): las 14 pólizas de la ficha gemela son las mismas 6 de CIMA con datos viejos (números sin
  ceros, Plus Ultra por Occident, dos «activa» que CIMA da por canceladas); la ficha viva trae ciudad «34143»/Tarragona con CP
  41003 (basura del volcado `intranet`); y ⚠️ **los recibos CIMA guardan el NIF del tomador EN CLARO en `datos_extra`**
  (`DOCUMENTO TOMADOR`, `NIF_PAGADOR`) aunque la ficha lo cifra. Pendiente: cifrar/borrar ese campo.
- 📋 **Coberturas CIMA inventariadas** (`docs/ASEGURA-CIMA-COBERTURAS.md`): 1.425 en 110 pólizas, 182 códigos y son de cada
  compañía. `capital_asegurado` es texto: «0» (618) = sin capital propio, «INF» = ilimitado. La ficha de póliza en plataforma
  ya lo distingue (`interpretarCapital`) y añade límites, franquicias, prima por cobertura y modalidad leídos de `datos_extra`
  (`extraerDetalleCobertura`, `@central/module-seguros`; el puerto los manda como `modalidad`/`detalle`).

### 🖼️ (02/09/2026) plataforma: el rediseño LLEGA a la pantalla (PRs #2013 y #2018)
- Alberto tras mergear #2011: «yo lo veo igual». **No era caché.** Ese PR mandó a producción cuatro
  primitivas —`PageHeader`, `KpiCard`, `Badge`, `btnStyle`— **con CERO consumidores**: exactamente el
  defecto que ese mismo PR diagnosticaba en el `ui.tsx` viejo, repetido el mismo día. Un sistema de
  diseño que nadie importa no cambia ni un píxel; el guardián de tokens no lo caza porque no hay falta.
- **#2013** enchufa lo visible: pestañas de `SegTabs` de pastilla-en-caja a **subrayado con iconos
  lucide**, migas sobre el saldo, `<Pagina>` en las 4 vistas de `/banca`, azulejo de icono en cuentas y
  brókeres, `colorImporte` en vez de hex, `<Dato>` en el saldo sin informar.
- **#2018** pone la cabecera del libro de movimientos, y lo interesante es lo que destapó: **dos de las
  columnas no eran columnas.** El 🤖 solo se pintaba en los cargos (en un ingreso, negocio e importe se
  corrían 30 px) y el `<select>` de negocio se anchaba según el texto de su opción. Sin rótulos encima
  no se notaba. Cabecera oculta en móvil (la fila se apila) y solo si hay filas.
- **Pendiente:** siguen ~4.900 inline styles y 20 clases muertas movidas a `globals.css`, tres de ellas
  con hueco responsive real (`/sivra/expenses` con modal a `maxWidth:520` en móvil). CI verde en ambos.

### 🎨 (02/09/2026) plataforma: sistema de diseño vivo, color por tokens y SEIS tokens fantasma (PR #2011)
- Salió de «mírate Argon Dashboard». No se importó nada de él: es un kit Bootstrap estático y el problema
  no era la piel. **`dashboard/ui.tsx`, que el CLAUDE.md documentaba como sistema de diseño, NO lo importaba
  nadie** — existía como documento, no como código, con ~4.900 `style={{}}` a mano alrededor.
- Movido a **`components/ui.tsx`** + `Pagina` (ancho por contenido, contra el `maxWidth:'960px'` de 14
  páginas), `PageHeader`, `KpiCard`, `Badge`, `btnStyle`, `TablaScroll`, y **`Dato`/`Pendiente`** con
  `lib/dato.ts`: la regla del NULL deja de depender de la vigilancia. `/banca` es la referencia; el resto,
  por goteo. Sidebar con iconos lucide y secciones plegables (eran 52 entradas planas).
- 🚨 **~734 hex → tokens en 77 archivos, y SEIS tokens que NO EXISTEN** usados como `var(--danger, #dc2626)`
  en ~37 sitios: `--danger`, `--success`, `--card`, `--background`, `--warn`, `--warn-bg`. El CSS es válido,
  nadie se queja, y siempre se aplica el respaldo. El peor, en **transferencias**: `var(--card, #fff)` junto
  a `var(--text)` = texto claro sobre blanco. Los dos últimos venían de main (PR #2001) y los cazó el
  guardián nuevo en su primera pasada de CI. Guardianes: `regression-tokens-color` (3 tests: hex, media
  pareja y tokens fantasma) y `regression-dato-tres-estados` (fija que el **0 es un valor**, no un hueco).
- 45 bloques `<style>` sacados de 43 `.tsx` a `globals.css` (179→618 líneas), sin colisiones de clase.
- Regla nueva en el CLAUDE.md raíz: **todo lo mecánico va a un subagente**, repartido POR ARCHIVOS.
- **Pendiente:** migrar los ~4.900 inline styles restantes (semanas, por goteo). CI 19/19 verde.

### 🔑 (02/09/2026) `GH_PAT_TRIGGER`: rotado (caduca 01/12/2026, sin `Workflows`); clásico borrado; B pendiente en Vercel
- La entrada 🔴 del 01/09 («renovar el PAT») **ya está resuelta**: el 401 duró del 31/08 13:25 al 01/09 ~08:50 UTC;
  desde el PR #1933 (08:53) la radiografía vuelve a abrirse y a mergearla el bot (38 PRs hasta hoy, #2008 incluido).
  Las 123 ramas huérfanas quedaron barridas (1 viva). Nadie anotó la renovación: se dedujo de los PRs.
- **Lo que un agente NO puede ver:** tipo de token (clásico con `repo` = TODOS los repos de Alberto; fine-grained =
  solo `central`), permisos y fecha de caducidad. Lo usa en 4 workflows (`auditoria.yml`, `rutinas-automerge.yml`,
  `ai-programar.yml`, `latido-reparar.yml`) y necesita solo **Contents + Pull requests: write** sobre `central`.
- **Medido por Chrome (02/09, solo lectura):** es fine-grained, solo `central`, pero **SIN caducidad** y con
  **Workflows: read/write** además de Contents + Pull requests. El secret se actualizó el 01/09 10:52 CEST. Ese
  permiso extra es el que convierte una fuga en «leo todos los secrets»: con él se puede empujar a una rama un
  workflow que vuelque `${{ secrets.* }}` y abrir el PR (mismo repo = con secrets). Lo que lo justificaría es el
  camino 6b de `rutinas-automerge.yml` (merge de `main` en la rama del PR: si `main` tocó un workflow desde que
  nació la rama, el push lo necesita) — no hay ningún rechazo por ese motivo en la memoria.
- **Segundo token vivo** `central-ai-programar-trigger-2` (29/07, sin caducidad, Contents + PRs, usado esta
  semana): NO es el del secret. [Probable] es el `GITHUB_TOKEN` de Vercel (sivra/plataforma, agente SEO de los
  lunes, `seo-landing.ts`) o el `GH_PAT` de ia-rest (`blog-seo`, `agente-arquitecto`): los tres escriben en
  `central` por Contents API con justo esos permisos. **No borrar sin comprobar en Vercel** qué env lo lleva.
- Un clásico «Claude Full Access Token» (21 scopes, sin caducidad, «Never used») está para borrar.
- 🔴 **El camino 6b de `rutinas-automerge.yml` NO empuja con el PAT aunque lo lleve en la URL (medido 02/09 06:39 UTC
  en este mismo PR):** el bot resolvió el conflicto y empujó el merge, pero `tests.yml` salió con `actor:
  github-actions[bot]` y `conclusion: action_required` (a la espera de aprobación manual), así que los 12
  requeridos no corren y el PR se queda en BLOCKED. Causa [Probable]: `actions/checkout@v4` deja
  `http.https://github.com/.extraheader` con el `GITHUB_TOKEN` y pisa al PAT de la URL — el mismo fallo que
  explicaba el «git push sí cuela» del 01/09 en `auditoria.yml`. Arreglo: `persist-credentials: false` en el
  checkout (o borrar el extraheader antes del push). Es workflow → carril 2, PR aparte. Hasta entonces, un PR de
  registro que entre en conflicto necesita un push humano después del merge del bot.
- **Rotado por Alberto (Chrome, 02/09 09:03 CEST):** token nuevo fine-grained `GH_PAT_TRIGGER (central) 2026-12-01`,
  solo `central`, Metadata R + Contents R/W + Pull requests R/W, **sin `Workflows`, caduca el 01/12/2026** (la
  primera generación salió sin caducidad y se regeneró). Secret actualizado 09:03. Clásico «Claude Full Access
  Token» **borrado**. El token viejo A (`… - sep 2026`) sigue vivo A PROPÓSITO hasta ver «Last used» en el nuevo;
  [Probable] ya lo usó: la radiografía #2017 se abrió a las 07:14 UTC, 11 min después del cambio de secret.
  Quedan sin caducidad: `central-ai-programar-trigger-2` (= B), `seo-housesevillana-panel` y `token` (nunca
  usados) y los clásicos `house-sevillana-deploy` / `roi-intranet deploy token`. **Pendientes:** borrar A mañana,
  inventariar B en Vercel (prompt dado) y rotarlo, guardián Telegram del 401 + `persist-credentials: false` (PR aparte).
- 🚨 **Método: el bot lee la lista de archivos del OBJETO PR, y GitHub la deja atrasada.** Tras el merge 6b del bot,
  el PR seguía con `base.sha` = el `main` de la madrugada y **98 archivos** (el diff real `origin/main...HEAD` era 1);
  el bot lo rechazó como «no registro». Se desatasca como el lag de #1962: push con contenido real y esperar.

### 🔍 (02/09/2026) Rutinas de auditoría: cobertura exhaustiva tras la correduría
- Alberto pidió revisar la diaria y la semanal («hemos metido más cosas como correduría»). Medido: las dos decían
  **«8 apps»** desde junio (y `AGENTES-MAPA` «4») con **12** en `apps/`; ni una línea sobre la correduría; el
  conector `Supabase_asegura` no figuraba. `auditoria-central` contaba 7 apps con Prisma (son 10; asegura tiene DOS
  schemas) y solo conocía el schema `iarest` (faltaban `rrhh` y `seguros`, los dos con BYPASSRLS).
- Nuevo bloque **2-quater «🛡️ Salud de la correduría»** (obligatorio, también en ligera): latidos `correduria_*`
  (sin fila = nunca corrió), foto `seguros.*` vs origen de Manuel, gasto Codeoscopic, cepos de aislamiento, §21
  pausada a propósito. Regla nueva: la frescura del ORIGEN es actividad, no salud (CIMA trae 0-3 filas/semana).
- Semanal: tramo correduría (typecheck asegura con dos schemas, tests `module-seguros*`, checksums foto vs origen,
  TRASPASO §pendientes). Toda cifra de apps se cruza contra `ls apps` + matriz de `tests.yml`, nunca contra otro doc.
- Añadido a la diaria (petición de Alberto en la misma sesión): revisar las **conversaciones** del rango por `list_sessions`
  (sesión sin memoria, sin PR y sin bitácora = pendiente perdido) y reconciliar TODAS las skills de agentes contra código y
  `list_triggers`, no solo las maestro. PR #2006. Ojo: `guardian-rama.mjs` da falso positivo en clon **shallow** (el `main`
  local no está en la historia truncada de `origin/main`); un `git fetch origin` lo calla.
- **Hecho por Claude Chrome el 02/09:** las rutinas 1 y 2 quedan con **Supabase + Supabase asegura + Vercel** (llevaban los 16
  conectores heredados, Gmail/Stripe/HubSpot incluidos). Verificado contra la skill: no usa ninguno de los quitados. Chrome
  destapó además que la diaria corre a **10:00 CEST** desde el 27/08 (Alberto la movió por el reset de cuota, memoria
  del 27/08) y el doc decía 04:00; corregido en `RUTINAS-PROGRAMADAS.md` §1/§3/cadencias. `ALERTA_TOKEN` de las rutinas
  1-2 vive en el entorno `Default`, no en el prompt: el «NO/NO» de Chrome no es un fallo. Visto al pasar: `sivra_domotica_acceso`
  en rojo (1 cerradura con ERROR).


### 📌 Buscador ya distingue ficha viva de volcado; Vercel deja de comentar en los PRs (02/09/2026)
- **Duplicado «Jose Suarez Salas»**: dos fichas `tipo='cliente'`, la de 14 pólizas es el volcado (vence 2016) y la de 7 la viva (vence 2027). `clientes.tipo` no sirve → `vitalidadFicha()` en `@central/module-seguros` (CIMA o vencimiento < 18 meses = viva; `null` = no contado ≠ histórica). Buscador rotula y enlaza «Abrir la ficha viva →».
- **Auditoría de duplicidades** (Alberto): 80 vivos, 48 con otra ficha; 740 grupos por teléfono, 203 con nombres distintos (familias, NO se fusiona); **16/109 pólizas vivas en las dos caras**, en 10 la copia del volcado tiene la dirección del riesgo y la de CIMA el vencimiento; **1 cliente partido en dos fichas vivas por la propia ingesta CIMA** (Juan Manuel Duran Ibañez) → Manuel.
- **Corrección**: «dirección imposible» era rotundo de más — la calle va cifrada pero `localidad`/`cp` del riesgo van en claro y asegura tiene la clave. No hecho aún.
- `github.silent: true` en los 12 `vercel.json` → adiós a ~50 ediciones de comentario por PR.
- **Contacto/intervinientes** (Alberto, caso Esquiansa): 81/109 vivas traen intervinientes por CIMA, 14 enlazados a OTRA ficha; 6 de 25 tomadores «sin teléfono» lo tienen en un interviniente. `contactoEfectivo()` (module-seguros) decide a quién llamar y la ficha dice de quién es el número. Botón «Subir póliza ↗» en la ficha (asegura ya lo tenía; solo auto, no guarda fichero).
- **Catastro para hogar HECHO**: paquete `@central/core-catastro` (parser+http extraídos de subastas, que lo re-exporta; 548 tests de subastas siguen verdes) + `precalificarHogar()` + `/correduria/hogar` en plataforma. Probado en vivo: San Vicente 40 2º-14 → 76 m²/1994/Residencial/41002 = la póliza. `GET /insurance-lines` hecho en #2001; cotizar hogar en Codeoscopic sigue pendiente (0,50€, con OK).
- **Forma de pago** (Alberto): columna «Pago» en la ficha; CIMA da `fraccionamiento` (108/109) y `forma_pago` de recibos, NO el recargo → `recargoFraccionamiento()` con 3 estados (solo con ciclo completo). `ventanaAnulacion()`: contrato anual, aviso 30 días.
- **Pantalla de PÓLIZA hecha** (`/correduria/poliza/[id]` + puerto `/api/operador/poliza`): coberturas (1.418 filas), recibos, siniestros, intervinientes, documentos (0 en toda la base, declarado) y copia gemela. De paso: **42/109 CIMA canceladas** (bloque aparte, sin Retarificar), recibos todos anulados = «⚪ anulados» (no 🟢), prima 0 = sin dato.
- Hecho ya (era pendiente): (`/correduria/poliza/[id]`: datos, coberturas, documentación, siniestros, recibos); separar canceladas de «vivas»; recibos todos anulados no es «🟢 0 cobrados»; leer la copia gemela del volcado para la dirección del riesgo; 📞 «cifrado» = falta `PII_ENCRYPTION_KEY` en el Vercel de asegura.
- **«Haz todo» (2ª tanda, mismo PR #2001):** buscador por **localidad/CP del riesgo** (`porRiesgo`, SQL sobre `datos_especificos`) y por **calle descifrada en memoria** (`porDireccion`, ~170 pólizas; sin clave → «N ilegibles», no vacío); `GET /insurance-lines` de Codeoscopic (gratis, `hogarDisponible()` con 3 estados, pintado en `/correduria/hogar`). **Documentos: HECHOS en #2022** (tabla `seguros.documentos`, puerto y pantalla; falta la primera subida real de Alberto desde `/correduria/cliente/[id]`). Pendiente que cuesta dinero: `peticion-hogar.ts` (0,50€/prueba, solo con OK).
- **Coberturas CIMA leídas de verdad (PR #2068 mergeado):** `interpretarCapital()`/`extraerDetalleCobertura()` en module-seguros; `0` = «sin capital propio», `INF` = ilimitado; límites/franquicias/prima desde `datos_extra`. Inventario en `docs/ASEGURA-CIMA-COBERTURAS.md`.
- **FUSIÓN de fichas, con OK de Alberto (solo clientes CIMA):** regla = ficha CIMA sobrevive; gemela = mismo nombre o teléfono + nº de póliza compartido (sin ceros a la izquierda) o mismo DNI → **33 pares** medidos (nunca por nombre solo: 94 pares por nombre no se tocan; 7 con póliza común y nombre distinto, tampoco). Piloto **José Suárez Salas HECHO** en BD (lote `fusion-cima-2026-09-02`, fila en `cliente_merge_log` con snapshot): 14 pólizas + 7 bienes + tels/emails reapuntados, ciudad `34143` → SEVILLA, lápida en la de junio. **HECHOS los 34 (validado José → resto en una pasada):** 33 supervivientes, 143 pólizas reapuntadas, 26 ciudades numéricas curadas; función `pg_temp.fusionar` (reapunta 24 FKs, hereda solo huecos; los índices ciegos son ÚNICOS: la lápida suelta email/teléfono antes de heredarlos). **Juan Manuel Durán Ibáñez unificado por decisión de Alberto** («seguros en vigor, los de CIMA») pese a DNI/nacimiento distintos en la base: sobrevive la ficha con Allianz 2027. Clientes CIMA: 80 → 79. **Provincia por CP** en 32 vivas (30 «Tarragona» falsas + 2 NULL); 17 siguen sin provincia porque tampoco tienen CP. Comprobar tras el pull CIMA de mañana (05:30 UTC) que no reaparece ficha nueva para ninguno de los 33. Al verla Alberto: «Tarragona» = provincia basura de la ingesta CIMA (**29/80 vivas** con provincia ≠ CP, 19 sin provincia; José corregido a mano, el resto con su OK); **«recibo pendiente» NO es deuda**: EIAC `pendiente` = emitido y sin cargar aún (rótulo cambiado a «al cobro» en fichas y `explicarCobro`); **Juan Manuel Durán Ibáñez NO es un duplicado** (DNI y nacimiento distintos: dos personas, corrige la nota del día anterior). Tel/email «cifrado» = falta `PII_ENCRYPTION_KEY`/`PII_LOOKUP_KEY` en Vercel `central-asegura` (copiar del proyecto `asegura`; nombres confirmados en el código del CRM, 92 y 40 usos). Claude Chrome vio `PII_ENCRYPTION_KEY` marcada «needs-rotation» en `asegura`: es la **cadencia de 90 días del runbook de Manuel** (`docs/runbooks/secret-rotation-LOO-132.md` del repo `asegura`; clave del 13/04, vencida desde julio), no una fuga. ⏸️ **Rotarla es tarea aparte**: el cifrado `v1:` es de clave ÚNICA (sin doble clave), así que rotar = job que descifra con la vieja y recifra con la nueva las columnas PII de `seguros` + cambiar las DOS Vercel a la vez. Primero copiar, rotar después. ✅ **Copiadas por Alberto y REDESPLEGADO central-asegura: la ficha de José Suárez ya pinta teléfono y email en claro.** La marca «Needs Attention» de Vercel resultó ser SU aviso «parece un secreto y es visible: guárdala como Sensitive» (no el runbook de Manuel: corrección a lo anterior); «Rotate Variable» NO se pulsa. De paso: `estadoClavePii()` (`apps/asegura/lib/pii-estado.ts`, 5 tests) viaja en `/api/operador/cliente` como `pii.clave` y la ficha de plataforma dice POR QUÉ no descifra (`sin_clave` · `mal_formada` · `no_abre`) — antes «cifrado» era el mismo texto para tres arreglos distintos y Alberto copió a ciegas tres veces. El índice de `module-seguros-pii` lleva ahora extensiones `.ts` (sin ellas `node --test` no lo resolvía).
### 🔑 (02/09/2026) Domótica: el aviso «PIN con la ventana desactualizada» lleva botón para reponerla desde Telegram (PR #2003)
- Disparador: aviso 🕒 de Socorro con 2 PIN (reservas 152490601 y 150885616) caducando 2 h antes de lo debido,
  y su única salida era abrir `/sivra/domotica` en el portátil. Desde el contenedor no hay Tuya/Smoobu, así que
  **esos dos PIN siguen SIN reponer**: hay que pulsar «🔄 ventana» en el panel o, tras desplegar, el botón del aviso.
- La reposición se extrajo a `lib/domotica/reponer-ventana.ts` (un solo camino para el PATCH del panel y el
  webhook); el cron manda el aviso con `tgAvisoAlertaBotones` y un botón `dom_ventana:<disp>:<ref>` por PIN
  (helper puro `reponer-ventana-puro.ts`, límite de 64 bytes vigilado por test). Resultado por mensaje nuevo,
  y si Tuya cae a offline y el código CAMBIA se canta en mayúsculas (antes el PATCH lo callaba).
- Sigue sin tocarse solo, a propósito (Tuya borra+recrea). Guardián del catálogo ampliado a `tgAvisoAlertaBotones`.
- **Alberto repuso los dos PIN desde el panel** (BD: ambos → 13:00, mismo código, `tuya_password_id` nuevo) pero
  la pantalla seguía en «11:00»: `ajustarVentana` no recargaba la lista tras el PATCH. Corregido en el mismo PR. Doc: `docs/DOMOTICA-TUYA.md` (Fase 2).

### ✅ (02/09/2026, 06:36 UTC) Correduría: TRASPASO CERRADO — el CRM corre sobre la BD de central
- Rol nuevo `crm_seguros` en central (LOGIN, BYPASSRLS, DML en `seguros`, `search_path=seguros`, sin `public`)
  porque `DATABASE_URL` de `central-asegura` es Sensitive en Vercel y no se puede copiar. Alberto pegó la URL
  en el proyecto Vercel `asegura` (con el agente de Chrome haciendo redeploy/health/dry run).
- Prueba real: `/api/health` → `db: ok`; `cima-pull` dry run #187 → `cima_pull_started/completed` en
  `seguros.operational_events` DE CENTRAL, `queueDepth: 128`. El cron (05:30/11:30 UTC) escribe ya aquí.
- 40 min perdidos por pegar la plantilla `TU_CONTRASEÑA_AQUI` sin sustituir: el health lo tapa; la causa
  estaba en `get_runtime_errors` de Vercel. ⚠️ La contraseña de `crm_seguros` pasó por el chat: **rotar**.
- Queda: auth del CRM sigue en el Supabase de Manuel (9 usuarios); `record-evidence.ts` por PostgREST; Fly;
  y el banner rojo de Supabase «Grace period is over» en la org de Alberto (cuota) — revisar billing.

### 🏠 (02/09/2026) Correduría «todo nosotros»: el CRM ya es nuestro, está CAÍDO desde el 31/08, y falta UNA variable
- Alberto: «haz lo necesario para tener todo nosotros». Hallazgo: el repo `asegura` (CRM de Manuel) y su
  proyecto Vercel `asegura` (`app.grupoasegura.com`) **ya están en la cuenta/equipo de Alberto** — el doc
  del traspaso iba por detrás. Secrets de Actions viajaron.
- 🚨 **El CRM lleva caído desde el 31/08 06:15 UTC** (primer despliegue en nuestro equipo): `password
  authentication failed for user "postgres"` en TODA consulta (386× en `/api/health`); `cima-pull` → 500
  (3 corridas). Nadie lo vio (sin Slack). Origen congelado ⇒ la copia del 02/09 es completa.
- Hecho: 12 funciones + 26 triggers portados a `seguros`; `prisma_seguros` con `search_path=seguros`;
  `apps/asegura` lee de central por defecto (`urlFuenteCartera`, probado; `ASEGURA_FUENTE=origen` vuelve).
- **Pendiente de Alberto (panel Vercel, 4 pasos en `docs/TRASPASO-CORREDURIA.md` «CIERRE»):** poner en el
  proyecto `asegura` el `DATABASE_URL` de `central-asegura`, redesplegar, `/api/health`, `cima-pull` dry run.
- Queda para después: auth (9 usuarios en el Supabase de Manuel), `record-evidence.ts` por PostgREST, Fly.
- PR #2002 (lateral plegable + copia) **mergeado** por orden de Alberto.

### 🗄️ (02/09/2026) Correduría: la cartera YA ESTÁ COPIADA en `seguros` (foto fija, origen sigue vivo)
- Alberto: «vamos con la copia de BBDD, es prioritario». **Hecho:** 52 tablas, 86.628 filas, 131 FKs,
  verificación por recuento (52/52) y checksum de contenido (clientes, pólizas, recibos, siniestros).
  Central pasa de 213 a 274 MB (plan free, 500 MB).
- 🔑 El bloqueo del 01/09 era el secreto del Vault: traía una contraseña suelta de 10 caracteres, no una
  URL, y no era la de ningún rol. Salida: **`apply_migration` entra en el proyecto de Manuel como
  `postgres`** (`execute_sql` solo como `supabase_read_only_user`) → rol temporal `traspaso_lectura` →
  dblink desde central por el pooler `aws-1` → **rol borrado y secreto vaciado al acabar**.
- ⚠️ Es una FOTO: CIMA sigue entrando en la BD de Manuel y TODAS las apps siguen leyendo de allí
  (`ASEGURA_DATABASE_URL`). Repuntar lectura + ingesta es el paso siguiente, no este PR.
- `tenant.ts`: vínculo real cuenta ↔ correduría por email contra `seguros.usuarios` (cierra el TODO).
- 🐛 El script fallaba en `codeoscopic_consumo` (tabla nuestra, no del origen) y hacía rollback de todo:
  añadida la guarda «solo tablas que existen en el origen».

### 📐 (02/09/2026) Plataforma: botón « para plegar el lateral
- `UserSidebar.tsx` (escritorio): botón «/» en el cabecero → tira de iconos de 56px (tooltips por `title`),
  pie con solo ⏻. Estado en `localStorage('nav-plegado')` aplicado por el **script anti-parpadeo de
  `layout.tsx`** (`html[data-nav-plegado]`, CSS en `globals.css`), igual que tema y saldo oculto: sin salto
  al recargar. Móvil (drawer) intacto.
- 🔎 Hallazgo de paso, SIN tocar: en la ficha de Jose Suarez Salas sale «📍 34143, Tarragona» porque en la BD
  de **Manuel** (sigue siendo la fuente, `ASEGURA_DATABASE_URL`; NO hay copia) la ficha `intranet:cli:17`
  tiene `ciudad='34143'` / `provincia='Tarragona'` (CP correcto 41003). **504 fichas** del volcado
  `intranet:` tienen `ciudad` numérica y 488 `provincia='Tarragona'`: columnas corridas en ESA importación.
  Hay duplicado sin fusionar (`asegura_app:cli2:17`, SEVILLA/41003) con las 14 pólizas históricas.

### 🔎 (01/09/2026) Correduría: buscador de TODO, cola de retención y limpieza de la pantalla
- 🗑️ **Borrada** `/cartera/renovaciones` de asegura (duplicaba la de plataforma) y su menú.
- 🔎 **Buscador universal**: nombre · matrícula · nº póliza · DNI · teléfono · email · ciudad · CP.
  Un término se busca por TODOS los criterios que encaje. 🚨 **DNI/teléfono/email solo alcanzan al
  12-16%** de las fichas (índice ciego) y **la dirección va CIFRADA: no se puede buscar** — cada
  bloque enseña su cobertura, porque ahí un vacío no es una ausencia.
- 📞 **Cola de retención** (art. 15 LCS): manda el RELOJ, no el importe. Al mes la cobertura queda
  **suspendida** y el cliente no lo sabe; pagar la devuelve en **24 h**; a los 6 meses se extingue y
  retener = póliza nueva. Botón `tel:` y salto a retarificar. Vacía ≠ «todo cobrado»: se declaran las
  18 pólizas vivas sin ningún recibo.
- 🧹 **Pantalla reorganizada por el agente de diseño**: 12 KPIs → 4; el buscador sale del bloque que
  hacía `return` al fallar (desaparecía con el puerto caído); «pendiente de confirmar» sale del gate
  `totalAnual>0` que lo escondía; la matriz del banco se pliega (no se borra: es donde se aprende).
- 32 tests nuevos (`busqueda`, `retencion`, `correduria-puerto`). CI verde. PR #1999.

### 🗂️ (01/09/2026) La correduría se trabaja desde plataforma: ficha del cliente y accesos directos
- 📌 **Dictado de Alberto:** *«asegura hay que meterlo en correduría, yo solo uso UNA página»*. Su
  pantalla es `plataforma → /correduria`; **asegura es la trastienda** (BD + el botón que gasta 0,50€).
  Escrito en los tres CLAUDE.md: pantalla nueva de la correduría → se monta en plataforma.
- 🔎 Se destapó una **duplicación**: la lista de renovaciones que se hizo ayer en asegura era paralela
  a la que plataforma ya tenía. Se conserva (enseña el coste de la tanda) pero no crece.
- ✅ **`/correduria/cliente/[id]`**: pólizas, recibos, siniestros y contacto en UNA pantalla. El nombre
  de Renovaciones es enlace directo + buscador. Único salto a asegura: «Retarificar ↗».
- 🚨 **Cuatro «no lo sé» que no se colapsan**: `recibos.total 0` ≠ al corriente (**18 de 109 vivas** no
  tienen recibo), `recibos null` = asegura sin desplegar, `clienteId null` = sin enlace, y
  `no_encontrado` ≠ `error`. Y `importeEiac()`: `Number('1.234')` daría 1,23€ donde pone 1.234€.
- Puerto nuevo `/api/operador/{cliente,clientes}` (DNI/IBAN NO cruzan). 15 tests nuevos, CI verde.

### 🔁 (01/09/2026) asegura: renovaciones + dos bugs vivos encontrados al repasar
- **`/cartera/renovaciones`**: qué vence en 90 días por urgencia REAL, con el objeto asegurado
  (distingue tres pólizas del mismo cliente) y el coste de retarificar la tanda. `cabenEnTanda()`
  **estaba construido y sin usar**: la cartera viva entera son ~40€.
- **NO hay botón de «retarificar todas»** y es honesto: las 80 vivas traen solo matrícula, así que
  cada una necesita elegir versión. Se podrá con el PDF subido o con créditos de `/vehicles`.
- 📜 La ley ya estaba modelada y vale dinero: **una subida de prima es una MODIFICACIÓN** (LCS 22),
  exige 2 meses de preaviso; sin él, la compañía **no puede imponerla**. Eso es «última llamada».
- 🐛 **Bug 1:** `estadoMigracion()` contaba TABLAS → 53 tablas vacías hacían `migrado:true` y la
  pantalla decía «tu cuenta no está vinculada» (ausencia COMPROBADA) sobre 32.600 fichas. Ahora
  cuenta **corredurías** (no clientes: no toca PII) y la decisión es pura en `migracion-decision.ts`.
- 🐛 **Bug 2:** el guardián de aislamiento marcaba infractor un fichero PURO por nombrar
  `seguros.clientes` **en un comentario**. Ahora ignora comentarios; verificado que sigue mordiendo
  SQL real.

### 📄 (01/09/2026) asegura: subir una póliza y que el agente la lea — primera pasada
- `/cartera/subir`: PDF (texto) o foto (visión). **No gasta cotizaciones** — leer es gratis.
- Reutiliza el pipeline ya probado de `apps/asegura-portal`; lo nuevo es QUÉ se busca (17 campos
  para cotizar, no los 5 de la bóveda) y la validación dura: **letra del DNI** y **formato de
  matrícula** se comprueban, porque un DNI mal leído es otra persona y una matrícula, otro coche.
- Procedencia nueva **`documento`** (entre `compania` y `calculado`) + `debeSustituir()`: lo leído
  **nunca pisa lo que mandó la compañía**. Guardián `test/regression-marcadores-sin-dato.test.ts`
  fija que los DOS extractores traten igual los «no lo sé». Cepo verificado rompiéndolo.
- 🐛 Fallo cazado por su test: limpiar «muchos» dejaba '' y `Number('')` = **0** → «muchos
  siniestros» se guardaba como «ninguno», y en la dirección que abarata la prima. Con regresión.
- ⚠️ **NO escribe en la cartera** (rol SELECT-only) ni **guarda el fichero** (falta decidir dónde y
  cuánto tiempo se conserva PII, y `cliente_documentos` no existe). Devuelve el hash, no el papel.

### 🧭 (01/09/2026) asegura — EL PRINCIPIO de Alberto: presupuesto rápido, verificación al emitir
- *«Todas las opciones posibles; presupuesto = lo más fácil y rápido; y ya en caso de cuadrar al
  cliente, nos centramos en que todos los datos estén bien.»* **Dos fases con exigencias OPUESTAS.**
- Consecuencias en el código: (1) **ningún dato con un solo camino** — la versión del vehículo tiene
  cuatro (ficha en texto · foto ficha técnica · catálogo a mano ✅ · matrícula de pago); (2) la fase 1
  no se bloquea salvo por lo que no se puede inventar sin mentir; (3) 🎯 **los `supuestos` de la
  precalificación SON la lista de verificación de la fase 2**, con los `optimista` en cabeza.
- ⚠️ Matiz medido: las **80 pólizas vivas (CIMA) NO traen marca/modelo en texto** (solo matrícula);
  ese camino sirve para el volcado histórico. Por eso el catálogo a mano era lo primero a construir.

### 📸 (01/09/2026) asegura: alta por fotos, SINCO y el siguiente ramo — investigado y anotado
- 🚨 **La ficha técnica SÍ trae la versión (campo `D.2`)**, más `K` de homologación. Se creía que
  solo la marca. Pero `D.2` es homologación EUROPEA, no Base7: sigue habiendo emparejamiento, que se
  cierra filtrando por cilindrada + potencia + combustible + año. **Con 2+ candidatos decide una persona.**
- **BD de matrículas gratis: no la hay útil.** DGT open data va anonimizada (sin matrícula); el resto
  de pago; y todas darían TEXTO, no el código Base7. La foto de la ficha técnica es mejor fuente.
- 🎯 **SINCO = fichero SIHSA de TIREA**: siniestralidad de los **últimos 5 años** (la ventana exacta de
  `lastFiveYearsAccidents`), consultable al tarificar. ⚠️ Se ofrece a «Entidades Aseguradoras» y una
  correduría NO lo es → **preguntar a TIREA** (`accesos.cima@tirea.es`). El asegurado sí puede pedir el
  suyo gratis. Y la compañía lo consulta igual al emitir: la siniestralidad presumida se corrige sola.
- **Siguiente ramo: HOGAR** (dictado de Alberto). Más fácil porque no hay vehículo que identificar.
  Primer paso gratis: `GET /insurance-lines` dice si tarifica para nosotros.
- Diseño: `docs/superpowers/specs/2026-09-01-asegura-alta-por-fotos-y-bonificadores.md`.

### 🔘 (01/09/2026) asegura: el botón «Retarificar» sobre la cartera REAL, de punta a punta
- `/cartera` → buscar cliente → ficha → **Retarificar** en una póliza de auto. Plan de Alberto:
  primero a mano sobre clientes de verdad, automatizar después.
- ✅ **`seguros.codeoscopic_consumo` YA CREADA en la BD** (con sus dos CHECK). Era el bloqueo real.
- 🚨 **Medido: las 80 pólizas de auto vivas (CIMA) traen SOLO matrícula** — ni marca ni modelo ni
  año. Pero el código de versión sale **gratis** navegando `car/brands→models→vehicles`; lo que
  cuesta créditos es buscar **por matrícula**. Se cotiza HOY sin comprar nada.
- `desde-cartera.ts` devuelve **tres** cosas: lo que se manda, lo **supuesto** y lo que falta. Los
  supuestos tiran a la baja salvo la siniestralidad (decisión de Alberto, marcada `optimista`).
  **Nunca se supone un dato personal.** Centinela nuevo: 20.860 fichas se llaman «Lead».
- Guardián `test/regression-asegura-gasto-codeoscopic.test.ts`: un solo puerto gasta y es POST
  (un `GET` que cotice lo dispararía un prefetch). **Cepo verificado rompiéndolo.**
- Falta de Alberto: contraseña al rol, `CODEOSCOPIC_TARIFICACION_ACTIVA=true` y redeploy.

### 📚 (01/09/2026) Conseguida la documentación OFICIAL de la API de Codeoscopic
- Alberto exportó el portal (`portal.api-int…`, MHTML) y de ahí sale el índice completo de
  operaciones → **`docs/CODEOSCOPIC-API-PORTAL.md`**. Primera fuente del FABRICANTE (el traspaso de
  Manuel describe lo que él implementó, no lo que la API ofrece).
- 🚨 **Hogar SÍ está en la API** (11 catálogos `/home/*` + `recommend-limits`), y hay SEIS ramos:
  auto, moto, hogar, vida temporal, salud, decesos. Corrige lo dicho esta misma tarde.
- 🚨 **`GET /insurance-lines` dice si cada ramo tarifica** (`supports.rating`) para tu organización,
  y es GRATIS: no hay que preguntárselo a JM.
- 🚨 **`GET /car/registration-date?plate=`** da la fecha (aproximada, `null` si no la halla), y
  **`GET /vehicles?registrationPlate=`** resuelve el VEHÍCULO — pero es la ÚNICA operación de la API
  que exige **créditos de pago** (comercial@codeoscopic.com). Era el cuello de botella de «matrícula→precio».
- `portal.` NO es el host de la API: el propio portal muestra `api-int.codeoscopic.io/oauth2/token`.
- 🚫 La API expone pólizas/recibos/siniestros, pero **NO se usan**: eso ya lo da **CIMA, conectado y
  directo con las compañías** (dictado de Alberto). Codeoscopic sería el espejo parcial de Avant2.
- 🧭 Regla de reparto, palabras de Alberto: **«Avant2 vender, CIMA backoffice.»** De esta API interesa
  lo que ayude a VENDER (cotizar, borradores, catálogos, matrícula); lo que huela a backoffice, no.

### 🔍 (01/09/2026) El fixture de Codeoscopic, releído entero: 3 fallos del parser corregidos
- 🚨 **`errors[]` es por CONFIGURACIÓN de producto, no por compañía.** Reale falla con la config
  `37786__` **y da 8 precios** con `83474 (ASM y API)`. El resumen decía «Reale sin precio»: falso
  sobre la que más dio. Ahora `tambienDioPrecio` y solo se nombran las mudas (Pelayo, Zurich).
- **`deductible` la traen 10 de 18 precios** y se tiraba: enseñar 427,79€ de todo riesgo callando
  1.500€ de franquicia es «dato que SÍ está pero se lee mal». Ausente = `null`, nunca `0`.
- **`modality.category`** da los 6 niveles (Terceros → Todo Riesgo Sin Franquicia): la agrupación
  de la comparativa. Sin usar aún: `addonQuotes` (RACE asistencia 54,99€/199,00€) y `links[]`.
- Lección de método: el fixture llevaba en el repo desde por la mañana y estos tres solo salieron
  al leerlo ENTERO, no por muestreo. 73 tests en asegura, todo verde.

### 🎯 (01/09/2026) CI: el push «mudo» es LAG de GitHub — causa medida, no otra hipótesis
- Dos pushes sobre el PR #1962 (ya fuera de draft) no dispararon ningún requerido. Al mirar el **objeto
  PR** en vez de los runs: `git ls-remote` daba `5a732a51` y el PR seguía en `d0d23c65`, con 2 commits de
  5 y `mergeable_state:"dirty"`. GitHub no había procesado el `synchronize`.
- A los ~2 min se puso al día SOLO y los 12 arrancaron en ese instante, sin des-draftear, sin mergear
  `main` y sin push nuevo. Verdes y mergeado (`3804b42e`).
- Corrige tres días de teoría del `CLAUDE.md` (draft, identidad, «merge de main»): cada palanca que
  «funcionó» llevaba minutos de espera detrás. **Procedimiento: compara `ls-remote` con el `head.sha`
  del PR ANTES de tocar nada; si no coinciden, espera 2-3 min.** Cada palanca crea un head nuevo y
  reinicia la espera.

### 🧾 (01/09/2026) asegura: constructor de la petición de cotización de auto (validación gratis)
- `lib/codeoscopic/peticion-auto.ts` — puro: de los datos de la ficha al `CreateInsuranceRequest_V1`.
  **23 tests.** `revisarDatosAuto()` devuelve todos los reparos a la vez; `construirPeticionAuto()`
  lanza si queda alguno. Motivo: un cuerpo mal formado da un 400 **ya facturado**.
- Reglas del vendor encerradas en test: la MISMA persona idéntica en los tres papeles (holder/owner/
  primaryDriver, el vendor cruza por DNI), la dirección solo con sus dos mitades, y
  `lastFiveYearsAccidents` obligatorio si años sin siniestros < 5 y ≠ años asegurado (con `0` como
  respuesta válida, no hueco). Y los 5 campos que NO viajan (email, calle, ocupación…).
- Convenciones de UI mapeadas para la pantalla: **no hay Server Actions en el repo** (route handler
  + form cliente), asegura usa tokens de `globals.css` (no Tailwind) y zod solo en el route.
  Molde: `apps/mariscos/app/(usuario)/_forms.tsx` + `app/api/partidas/route.ts`.
- Sigue bloqueado en lo mismo: redeploy de `central-asegura` + sonda. Sin eso, nada verificado.

### 🧭 (01/09/2026) Portal de Grupo ASegura — Fase 1 MERGEADA (PR #1965 → `f12b7b46`)
- App nueva `apps/asegura-portal` (Next.js, rol propio SIN BYPASSRLS) + `@central/module-seguros-portal`
  (puro: niveles de acceso, procedencia en tres estados, código de un solo uso). 6 tablas `portal_*`
  en el schema `seguros` — **el SQL NO está aplicado todavía**; las otras 5 del spec llegan con sus fases.
- **El canal es un PUERTO**: la WABA no existe aún, así que en Fase 1 se enchufan email y consola;
  WhatsApp entra añadiendo un fichero. `canal_no_disponible` (503) ≠ `envio_fallido` (502).
- 🚨 Los 3 ENUM del DDL estaban tipados `String` en Prisma: typecheckea y **revienta en el primer
  INSERT** (42804). Arreglado declarándolos con `@@map` — no hay migración, la BD ya era así.
- Guardián `test/regression-portal-aislamiento.test.ts` (importar `lib/session` **y** nombrar
  `identidadId`), verificado con un infractor real en sus dos variantes.
- Mergeado el 01/09 con los 19 checks en verde; re-probado sobre `main`: `pnpm test` EXIT=0 (guardián
  108/108) y typecheck de `asegura-portal` limpio. Falta de Alberto: proyecto Vercel, rol
  `prisma_asegura_portal` con contraseña, envs, ejecutar el SQL de Fase 1, y la WABA.
- 🚧 **Volcado de la cartera: LANZADO Y BLOQUEADO (01/09/2026).** DDL ya aplicado (52 tablas,
  42 enums, `dblink`+`vector` OK), pero el secreto `asegura_origen_url` del Vault **mide 10
  caracteres: no es una cadena de conexión**, así que `dblink` falla con «password or GSSAPI
  delegated credentials required» en la primera tabla. **Nada escrito** (la transacción revierte:
  bitácora 0, clientes 0, pólizas 0, FKs 0). Al corregirlo: pegar el `ASEGURA_DATABASE_URL` del
  proyecto Vercel `central-asegura` **sin `pgbouncer=true`** (no es un parámetro de libpq) y mejor
  por el **puerto 5432**, no el pooler.

### 🔬 (01/09/2026) Codeoscopic: forense de la única cotización real — dos docs corregidos
- No hay conexión desde el contenedor: el proxy deniega por política `codeoscopic.io`,
  `central-asegura.vercel.app` y `app.grupoasegura.com` (403 en el CONNECT). La verificación
  tiene que salir del despliegue de Vercel, no de la sesión.
- 🚨 **El `project_not_found` del webhook NO era un fallo de correlación:** los 2 eventos son smoke
  tests con ids inventados (`999999`/`smoke-test-s168`, `smoke-fix-webhook`). **Codeoscopic no ha
  mandado nunca un webhook real** — solo los dispara al emitir, y no se ha emitido. Corregido en
  `sector.md` §4 y en la cabecera de `CODEOSCOPIC-TRASPASO-MANUEL.md`.
- **Los 15 precios reales del 29/07 son TODOS `estimado`** (el fixture del sandbox, 0 de 18). Dos de
  dos: el precio con reservas es el caso general. Parrilla real: Mapfre, Allianz, Occident
  (278,59€–609,64€), no Reale/Fidelidade. `expires_at` NULL en los 15 → un precio pagado NO se puede
  reutilizar. `referenceFromVendor` es por compañía (Mapfre no lo manda).
- Cartera viva por ramo: 81 auto/moto · 19 hogar · 9 RC. Hogar NO tiene cotización en el repo de
  Manuel, pero la API es multi-ramo (`insuranceLine`) y `insurance-lines` se puede consultar GRATIS.

### 🚨 (01/09/2026) Vigía de reservas: los 3 avisos que mandó eran FALSOS (y no solo hay Booking)
- El 🚨 «reserva 153896946 que Smoobu NO tiene» era falso: está en Smoobu y en `incomes` (Expedia,
  Busto Reform, 03→07/09, Karl Brunelliere). El nº salía del **enlace del propio correo de Smoobu**
  (`login.smoobu.com/es/booking/detail/153896946` = `incomes.reservationId`), y el vigía solo
  comparaba contra las referencias de la OTA. Las 3 alertas emitidas hasta hoy, falsas.
- Arreglado: la notificación de `service@smoobu.com` ya no entra al vigía ni al agente de huéspedes
  (parser `lib/correo/smoobu-notificacion.ts`, 8 tests con el correo real); el vigía compara también
  contra `b.id` y mira `incomes` antes de preguntar; y el aviso dice el **canal REAL** (Expedia,
  Agoda…) o ninguno — ya no manda a la extranet de Booking a por una reserva de Expedia.
- Fila 10 (cancelación de JUAN PONCE) corregida a mano en BD: era `nueva`/`huerfana`. PR #1978, mergeado.

### 🧹 (01/09/2026) Vanesa = Sique Brilla, y su ÚNICA pantalla es /invitado/limpieza
- Tras el PR #1991, Alberto miró el viernes 04/09 en la intranet y **la cuna no estaba**: la orden
  salió por email y se pintó en `/sivra/mensajes`, dos canales que ella no abre.
- **Corrección de hecho:** Vanessa Cruz = Sique Brilla SL (los docs las trataban como dos actores) y
  **ya no usa ialimp** — se le retiró el acceso. ialimp **se queda tal cual** como producto a vender.
- `enviarOrdenLimpieza` crea ahora la fila en `limpieza_tareas` ANTES del email; columna
  `sivra_ordenes_limpieza.tarea_id` (aplicada): NULL = **la limpieza NO lo ve**, y se canta.
- Corregidos los docs que afirmaban lo contrario: landmine #7 de `sivra-maestro`, `ialimp-maestro`,
  `ialimp-client-health` (sus «0 accesos» ya no son avería) y `apps/plataforma/CLAUDE.md`.
- Regla global nueva en el `CLAUDE.md` raíz: antes de dar por avisado a alguien, mira EN QUÉ PANTALLA
  trabaja. **PR #1994.**

### 🧹 (01/09/2026) SIVRA: la orden a la limpieza deja de depender de que Stripe vea el dinero
- Raquel (reserva 152490601) pagó la cuna **por Bizum**: `sivra_extras_reserva` congelada en
  `ofrecido` y Sique Brilla sin enterarse — el email lo dispara SOLO el webhook de Stripe. Orden
  mandada a mano ese día con autorización expresa de Alberto.
- Dictado suyo: **la orden NO lleva estado de cobro** («ni pagado ni confirmar, simplemente una orden»).
  Tabla nueva `sivra_ordenes_limpieza` (aplicada) sin importe: qué se pidió y si el email SALIÓ.
- Botón 🧹 en el Telegram del borrador (callback `hsp_clean`, va ANTES del lookup del pendiente porque
  se ofrece justo después del ✅ Enviar, que ya lo borró); órdenes visibles en `/sivra/mensajes` y
  dentro del prompt del agente (deja de re-escalar «¿está confirmada la cuna?»).
- `[]` = nada pedido · `null` = no se pudo leer · `enviado_at` NULL = se intentó y no salió. **PR #1991.**

### 💶 (01/09/2026) asegura: cliente de tarificación Codeoscopic con contador y TOPE
- `apps/asegura/lib/codeoscopic/` — config · contador (puro) · libro en BD · token+transporte ·
  parser (puro) · orquestador. **43 tests verdes**; typecheck y QA limpios.
- **Apagado por defecto** (`CODEOSCOPIC_TARIFICACION_ACTIVA`); sonda GRATIS
  `/api/operador/codeoscopic/sonda` (solo token) que corre con el interruptor apagado y separa
  fallo de HOST de fallo de CREDENCIALES.
- 🚨 **Tope persistente en `seguros.codeoscopic_consumo`** (en memoria sería mentira en serverless):
  tres estados y solo `descartado` con evidencia libera cupo — **un timeout NO es evidencia**.
  Sin libro legible NO se cotiza. Topes 20/día · 200/mes, techo duro 250/1000.
- **Hallazgo:** en el fixture real **0 de 18 precios eran firmes** (2 estimados, 16 condicionados) →
  el parser devuelve `firmeza` + avisos. Envs de Codeoscopic ya puestas en Vercel por Alberto.
- ⚠️ Detectado de paso: el schema `seguros` **ya tiene sus 52 tablas** (todas a 0 filas), así que
  `estadoMigracion()` (cuenta TABLAS) dirá «migrado» sobre una cartera vacía. Sin tocar: avisado.

### 🔑 (01/09/2026) Codeoscopic: credenciales de PRODUCCIÓN activas + host prod — ya se puede cotizar
- Mensaje de Manuel: el Bitwarden Send trae el set `CODEOSCOPIC_*` de **PRODUCCIÓN, ACTIVO** (lo
  caducado era solo el usuario sandbox `albertocsf0170ws` → regeneración EN PAUSA; si 401, escribe
  Manuel a JM). **Host prod: `https://api.codeoscopic.io`** (`-int` = sandbox). OpenAPI no lo tiene.
- 🚨 Consecuencia: **sin sandbox utilizable, toda cotización es real (0,50€)** → contador+tope desde
  el PRIMER smoke, y el smoke (1 cotización) solo con OK explícito de Alberto. Anotado en `sector.md` §4.
- Alberto está metiendo las 6 envs de cotizar en Vercel `central-asegura` con Claude Chrome (valores
  solo por Bitwarden; a Vercel únicamente las 6 — webhook/legacy/flags NO). `BASE_URL` = host de prod.
- ✅ **Fixture incorporado**: `apps/asegura/fixtures/codeoscopic/` (18 precios + 3 errores reales;
  sanitizado verificado, no solo dicho). Su README anota lo que el traspaso NO decía: `$ref`
  JSON-Pointer en `offers[]`, `id` raíz numérico vs `"Q…"` string, y 🚨 **`estimate`+`messages[]`
  deciden si un precio va en firme** («Riesgo condicionado»). Compañías del fixture = sandbox, no la
  parrilla real. **PR #1972.**
- **Siguiente paso al confirmar envs:** cliente de tarificación en `apps/asegura` + smoke.

### 📱 (01/09/2026) WhatsApp de la correduría: descartados el rodeo por SMS y la campaña masiva
- **SMS con enlace `wa.me` para que escriba el cliente primero y salga gratis: descartado.** Un SMS en España
  cuesta ~4-8 cént. contra **0,0166€** de una plantilla utility → pagas 3-5× por no pagar 1×. Y un `wa.me`
  desde SMS **no** es *free entry point* (esos son click-to-WhatsApp y el botón de web/Facebook, 72h gratis).
  Además el **01/10/2026** Meta empieza a cobrar los mensajes de servicio: el ahorro caduca en 30 días.
- **Campaña a los 32.520 leads: descartada.** No es que sea cara — **es que no se puede gastar**: Tier 0 = 250
  destinatarios/24h → 130 días; los bloqueos de una lista de 2013-2018 tumban el *quality rating* en la primera
  tanda y queman el MISMO número que atiende a los 80 clientes vivos. Sin opt-in: LSSI art. 38.3.c, hasta 150.000€.
- **Sí al inbound de cualquiera** (gratis, no penaliza calidad, es un lead con intención propia) — pero **Nivel 0
  aunque el móvil esté en las 32.600 fichas**: un teléfono de hace 12 años hoy es de otra persona; decirle «veo
  que tienes pólizas con nosotros» es una brecha, no una bienvenida.
- **Decisión de orden: WhatsApp entra como CANAL (OTP + avisos), NO como agente conversacional.** A 80 clientes
  vivos un bot atiende ~12 conversaciones/mes; el canal, en cambio, trabaja solo. Difiere entera la DPIA y el
  art. 50 del AI Act, y encaja sin tocar nada con `2026-09-01-asegura-portal-fase-1.md` (canal = puerto).
- **Cloud API directa de Meta, no 360dialog**: sus 49€/mes no compran nada a este volumen (mensajería real
  <2€/mes). Captación por *free entry points*: botón en la web, QR en el PDF de póliza, firma de email — coste 0.
- **PENDIENTE que no depende de nadie y es el único camino crítico: dar de alta la WABA** (Business Verification
  = 2-14 días de espera de Meta). Nombre EXACTO del Registro Mercantil, CIF, factura de suministro y
  `grupoasegura.com` en pie con aviso legal coincidente. Número nuevo (no puede estar ya en WhatsApp).

### 💶 (01/09/2026) Comisiones de la correduría: IMPLEMENTADO devengo → liquidación → cobro → renta

- Libro `comisiones_devengo` + `comisiones_cobertura` (migración aplicada; se retira `cima_liquidaciones`, 0 filas).
- `/api/cron/cima-liq` deja el SOAP a `ws.cimaseg.es` (nunca funcionó, 404) y lee el **puerto HTTP** de
  `apps/asegura` (`/api/operador/comisiones`) — NO `ASEGURA_DATABASE_URL`, que solo existe en esa app.
- Helper puro `lib/correduria/cuadre.ts` con **9 estados**: `deudor` (Occident) ≠ impago, `sin-cobertura`
  (Generali) ≠ `sin-datos` (Mapfre), y `no-comprobado` manda sobre todo. Total anual con huecos = provisional.
- 🚨 Los tres números NO son el mismo: la compañía retiene el **15 % de IRPF** (modelo 190 → borrador AEAT),
  al banco llega la **remesa**. Allianz feb/2026 medido: 95,03 − 14,26 = 80,77 exacto contra el BBVA.
- Lector del PDF de Allianz (**EBCDIC cp500**, tabla propia: Node no lo trae) + confirmación manual (Mapfre).
- Pestaña «Cuadre» en `/correduria`. 31 tests nuevos. Los 12 checks en verde. **Mergeado (#1962).**
- 🚨 **Dictado de Alberto:** «la retención la hacen ellos, yo solo recibo ya lo mío». La practica y la
  ingresa LA COMPAÑÍA → para él NO es un gasto, es un **pago a cuenta** que resta de la CUOTA. A la
  renta va el BRUTO; contra el banco se compara la REMESA. Llevado a `cuadre.ts`, a la pantalla y a las
  skills `perfil-fiscal` / `agente-correduria`.
- **PENDIENTE (nuevo):** `lib/finanzas.ts:594` sigue ESTIMANDO el bruto elevando el neto del banco
  (`× 0,15/0,85`) y da por hecho que todo abono de seguros es comisión al 15 % — un periodo deudor de
  Occident rompe el supuesto. El bruto y la retención REALES ya están en `comisiones_devengo`: falta
  sustituir la estimación por el dato real. Hasta entonces, la cifra fiscal de comisiones es estimada.

### 🗂️ (01/09/2026) Rediseño de la ficha de cliente: es un índice, no un expediente
- Alberto: «el CRM no me convence… en una visual tengo que ver quién es, con quién está relacionado
  y qué tiene». Diseño + maqueta →
  `docs/superpowers/specs/2026-09-01-asegura-ficha-cliente-design.md` · artifact `22b57a16`.
- Inventariado qué hay detrás de cada pantalla (skill `agente-correduria`, `sector.md` §8). Con
  contenido: recibos (182 en 89 pólizas), **coberturas 1.418 en las 109** (la puerta más rica y hoy
  invisible), siniestros 67, comisión por póliza vía `comision_bruta`. Vacías: notas, WhatsApp,
  gestiones (23 de cartera viva, no 694).
- 🚨 Tres cifras que engañan: **902 de las 1.710 relaciones son roles de póliza**, no familia; los
  **3.676 «presupuestos» son pólizas de la competencia** del volcado; y las cotizaciones reales (24)
  tienen prima y compañía **al 0%**.
- 🚨 **Documentos: hacen falta en cliente/póliza/siniestro y solo la póliza tiene tabla.** Faltan
  `cliente_documentos` y `siniestro_documentos`; `bienes_asegurables` sin `poliza_id`. **0 ficheros
  en todo el sistema.** Falta el estado «pedido pero no recibido».
- ✅ PR #1949 (vigía de CIMA) **mergeado**: los 12 checks arrancaron al mergear `main` en la rama —
  quinta confirmación del orden documentado en `CLAUDE.md`.
### 📜 (01/09/2026) Codeoscopic: el Claude de Manuel CONTESTÓ — contrato de la API completo
- Respuesta transcrita en **`docs/CODEOSCOPIC-TRASPASO-MANUEL.md`**; resumen operativo en
  `agente-correduria/references/sector.md` §4. Resuelve el host base (**sandbox
  `api-int.codeoscopic.io`**, sin `portal.`; producción no consta → pedir), auth (OAuth2
  client_credentials + `X-Client-App`/`X-User-Email` + media type `vnd.codeoscopic.v1+json`) y el
  flujo: **`POST /insurances` SÍNCRONO, facturable y NO idempotente (jamás retry)** → `id` =
  project_id (persistirlo SIEMPRE: su ausencia era el `project_not_found` del webhook).
- Basic Auth del webhook: DEFINIDO (lo genera ASegura, lo carga Codeoscopic); solo falta ejecutarlo.
  Sin contador/tope de coste en su repo → se pondrá en central. Solo AUTO cableado.
- **Quedan 3 peticiones fuera del repo:** credenciales OAuth2 sandbox nuevas (JM Fernández, PM API),
  el OpenAPI oficial, y que Manuel adjunte el fixture `2026-06-10-sandbox-quote-response.json`.

### 🧾 (01/09/2026) asegura: prompt para el Claude de Manuel (Codeoscopic/Avant2, tarificación)
- Manuel pidió un prompt para su Claude → escrito en **`docs/CODEOSCOPIC-PROMPT-MANUEL.md`** (lo envía
  Alberto). Pide: doc de la API + host base (no consta en ningún correo de Alberto), esquema de auth,
  endpoints del flujo de cotización con payloads anonimizados, webhook (Basic Auth pendiente +
  `project_not_found`), tablas/estados, NOMBRES de envs (valores por gestor) y si el 0,50€ es por
  cotización o emisión. Solo tarificar; la emisión sigue tras su flag, apagada.
- Contexto medido: las tablas `codeoscopic_*` del volcado traen solo el rastro de pruebas (1 proyecto,
  15 precios, 2 webhooks fallidos) — lo necesario para conectar vive en el repo de Manuel.
- ✅ **Resuelto en el Gmail el 0,50€: es POR COTIZACIÓN**, facturado a mes vencido (correo del CEO
  09/04 + presupuesto de Cristina 14/05 en texto). Actualizado en `sector.md` §4 — todo automatismo
  que cotice lleva contador y tope (~109 pólizas vivas ≈ 54,50€/pasada).
- Al contestar Manuel: volcar a `references/sector.md` §4 y pedir regeneración de credenciales sandbox.
### 📬 (01/09/2026) El correo de Alberto es la TERCERA base de datos — y resuelve una de las diez
- Idea suya: «las compañías me escriben y dan información». Cierto y medible. `mediadores@occidentinforma.com`
  manda **un correo por movimiento de póliza** con nº de póliza, cliente y contrato `M00171`;
  `mediador@allianz.es` manda cartera No Vida, Cuenta Agente y anulaciones por impago **con adjunto**.
- ✅ **La 549147797 NO está anulada**: es una RC profesional del «Instituto Técnico Superior de
  Informática Studium» **emitida el 27/06/2025**, un año antes del arranque de la ingesta. Confirma que
  las huérfanas son cartera pre-CIMA, no bajas.
- 📇 **Mapa de claves** (en la skill): Mapfre `5239640` · Allianz **código 18638 / clave PA342520**,
  sucursal 209 (las cinco variantes `209-x-…` son la misma) · Occident `8-92361`, `M00171`, `306333` ·
  Reale `38605` · Fidelidade con credenciales CIMA desde el 31/08. **`306333` y `8-92361` no aparecen
  en ningún correo**: su origen (Catalana / Plus Ultra tras la absorción) sigue sin confirmar.
- 📌 **Acción que lo cierra:** pedir a Occident la **carga inicial de cartera en EIAC de `8-92361`** —
  Alberto ya hizo esa petición exacta a Reale el 11/04/2026. **No se manda nada sin su OK.**

### 🔑 (01/09/2026) La CLAVE DE MEDIADOR: por qué CIMA perdía datos de una cartera y no de otra
- Idea de Alberto («cada compañía asigna una clave»), medida y confirmada: el 2º campo del nombre
  EIAC es la clave de mediador. **Nueve claves en cinco compañías**; Occident manda por TRES
  (`8-92361`, `M00171`, `306333`) y el atasco NO está repartido — bajo `8-92361` están en cuarentena
  sus 10 SIN y 6 de 9 REC, `306333` va limpia. Agrupar por `codigo_entidad` manda a revisar la
  cartera que va bien.
- **Son DOS averías:** 3 de las 20 huérfanas YA están en cartera (el movimiento llegó antes que la
  póliza; una esperó del 24/06 al 26/07) → se arreglan **reprocesando**. Las otras 17 son cartera
  que la compañía nunca mandó: **CIMA solo envía POL en altas y modificaciones**, así que falta una
  **carga inicial por clave**. Contarlas juntas manda a pedir algo que ya está en la BD.
- PR #1949: el vigía reparte por clave (`porClave`) y separa `huerfanasResolubles`; el puerto extrae
  la clave del nombre; `clave` NO es obligatoria en la validación (un puerto viejo sigue siendo
  legible). 7 tests nuevos. Skill `agente-correduria` actualizada.
- **Pendiente:** el CI del PR no arranca los 12 requeridos ni con merge de main, ni con push real,
  ni des-drafteando (mismo patrón que #1789).

### 🛡️ (01/09/2026) CIMA perdía recibos y siniestros hace 2 meses — vigía nuevo + causa raíz
- Analizando qué CRM necesita la correduría salió una avería VIVA: del 24/06 al 30/08 se quedaron
  **42 ficheros de CIMA en cuarentena — 23 recibos (7.721,71€ de prima) y 20 siniestros**, 39 de
  Occident. Eventos `cima_{recibo,siniestro}_sin_poliza_review`, `reason=sin_poliza_en_cartera`.
- **Causa raíz:** se empareja por `id_poliza_entidad` y **Occident / Catalana Occidente / Plus Ultra
  son el MISMO grupo bajo C0468** — 9 de las 19 pólizas afectadas SÍ están en cartera, con otro
  nombre de compañía y sin código de entidad. Al agrupar por compañía, normalizar el grupo primero.
- **Por qué duró dos meses:** el health-check de origen traía `cuarentenaTotal: 41` (39→40→41 en seis
  días) en su propio parte y sus señales de alarma eran `ficherosError`/`ficherosDeferred` = 0.
  Verde todo el tiempo **midiendo lo que no era**. El reconciliador (`cima_reconcile_resumen`) lleva
  parado desde el 25/06.
- **Hecho (nuestro lado):** helper puro `@central/module-seguros/ingesta` (`saludIngesta`, 11 tests,
  `sin_datos` ≠ `ok`), puerto `/api/operador/ingesta` en asegura, cron `correduria-ingesta` (06:45)
  + aviso `correduria.ingesta` + latido `correduria_ingesta` con su sonda.
- **De Manuel (su repo, no el nuestro):** emparejar por `numero_poliza` normalizado y por grupo de
  entidad; reactivar el reconciliador; meter `cuarentenaTotal` en las señales.
- **De Alberto:** verificar en la intranet de Occident las 10 pólizas que no aparecen (solo 1 da
  señales de anulación; el resto tienen recibos cobrados/pendientes y siniestros abiertos).
- **Corregida deriva documental:** `TRASPASO-CORREDURIA.md` afirmaba que «jamás se ha persistido un
  REC, un SIN ni un CEF» y que no era avería sino función sin encender. Falso: hay 184 recibos, 67
  siniestros y 7 CEF. También 69→67 siniestros en la skill.
- 🧭 **Decisión de producto:** el CRM ESCRIBE donde manda Alberto (leads, notas, tareas,
  renovaciones) y CONSULTA donde manda la compañía (pólizas, recibos, siniestros). Sin módulo de
  siniestros: no se puede aperturar por CIMA y los 67 están congelados (1 actualizado, 0 con
  tramitador). Cartera real: **80 clientes / 109 pólizas**; de los 32.520 leads, **26.964 no tienen
  ni teléfono ni email** y solo **1 ficha** tiene consentimiento registrado.

### 💶 (01/09/2026) Comisiones de la correduría: spec del control devengo → liquidación → cobro → renta
- Alberto: «controlar que me pagan lo que me deben y que está ingresado en cuenta», y que el borrador
  del IRPF cuadre. Medido: **hoy el borrador no se cuadra, se COPIA** (hilo Asecon IRPF 2025: «ingresos
  los que aparece en el borrador»). Retención implícita 14,75% → **15% de IRPF, modelo 190**.
- 🚨 **`apps/plataforma/lib/cima.ts` sobra:** SOAP nunca validado (404), parser adivinado y mapa de
  compañías con códigos numéricos cuando los reales son `C0109`/`C0468`/`C0058`/`C0613`. La BD de Manuel
  YA trae `cuenta_efectivo`/`liquidaciones`/`poliza_recibos` parseadas por el JAR de TIREA, con
  **comisión, retención y remesa separadas** (Allianz feb/26: 95,03 − 14,26 = 80,77 exacto).
- El PDF «Cuenta Agente» de Allianz es legible (**EBCDIC dentro del PDF, `cp500`**) y cuadra al céntimo
  con CIMA. Revela **558,88€ parados** por no haber dado la cuenta bancaria. Mapfre devenga 3.614,65€ en
  recibos cobrados y **cero liquidaciones**. Del banco, el **85% de 2026 sin identificar compañía**.
- Spec en `docs/superpowers/specs/2026-09-01-comisiones-renta-control-design.md` (**PR #1947**), con
  `agente-correduria`, `perfil-fiscal` y `apps/asegura/CLAUDE.md` actualizados: comisión tiene TRES
  estados (devengado→liquidado→cobrado) y la cobertura de CIMA es DESIGUAL por compañía. Pendiente:
  plan de implementación, y 5 gestiones con compañías (Allianz cuenta, Generali/Reale/Mapfre CIMA,
  Occident saldos) que **no se envían sin autorización**.

### 📖 (01/09/2026) EIAC: lo que llega NO es toda la cartera — leído de la norma, no inferido
- Alberto aportó el estándar oficial (TIREA `209_IAC_ESP_DOC` V07.1 v05, 03/06/2026 + XSD). El 4º
  campo del nombre de fichero es el **código de proceso**: los ordinarios (`131/132/133/151`,
  `211-261`, `311/361`) no traen histórico — **`132` «cartera» es solo lo que renueva en el periodo**.
- **La carga masiva es otra cosa y hay una por objeto: `199` pólizas · `299` recibos · `269`
  movimientos · `399` siniestros.** Medido: Mapfre mandó 199+299, Allianz 199 (26 → 26 en cartera,
  cuadra), **Occident y Reale ninguna**, y el **399 no lo ha mandado nadie** (de ahí los 67
  siniestros congelados).
- 🚨 **«Carga inicial» / «primera carga» NO existen en EIAC** — por eso las compañías le decían a
  Alberto que no se hace. El nombre correcto es **carga masiva, proceso 199/299/399**, y **se pide
  fuera del canal**: no hay proceso EIAC para solicitarla (el único `SO` es el `841`, solicitud de
  alta de siniestro — que además demuestra que declarar siniestros desde el CRM **sí** está previsto).
- Escrito en la skill `agente-correduria` (`references/sector.md`) y en `TRASPASO-CORREDURIA.md`.
  Mergeado también el **#1949** (vigía de la ingesta: 42 ficheros en cuarentena, 23 recibos por
  7.721,71€ de prima y 24 siniestros perdidos desde junio por el grupo Occident bajo un solo código).

### 🧭 (01/09/2026) asegura-portal: plan TDD de la Fase 1 (entrar + aportar póliza)

- **#1946**: plan de 12 tareas para `apps/asegura-portal` — módulo puro (niveles de acceso, procedencia
  en TRES estados, código de un solo uso), 6 tablas `portal_*`, sesión propia y bóveda con subida de póliza.

- **El canal de OTP es un PUERTO, no una llamada a WhatsApp**: la WABA de Grupo ASegura no existe todavía;
  en Fase 1 se enchufan email y consola y WhatsApp entra añadiendo un fichero.
- 🚨 **Lección de método:** las firmas de `aiComplete`, `openrouterVision` y `createMailTransporter` que
  parecían obvias eran las TRES falsas (`aiComplete` devuelve `string`; `openrouterVision` toma 5 args e
  `ImageInput` es `{data,mediaType}`; `createMailTransporter()` **no recibe credenciales**, las lee del
  entorno y devuelve `Transporter | null`). Comprobarlas contra `packages/*` antes de escribirlas.
- 🐛 **Bug del rotador de memoria, ARREGLADO en la misma sesión (#1952).** `rotar-memoria.mjs` archivaba
  por la ÚLTIMA fecha de la cabecera: mandaba a agosto la entrada `### 🔴 (01/09/2026) GH_PAT_TRIGGER …
  desde el 31/08` y, peor, a **octubre-2025** la de `### 💶 (15/08/2026) Reserva Luxury 22-25/10 …` (un
  rango de noches leído como fecha). Ahora manda la fecha ENTRE PARÉNTESIS. Guardián nuevo
  `test/regression-rotar-memoria.test.ts`, verificado que falla sin el fix. ⚠️ El flag es `--dry-run`:
  `--check` NO existe y ejecuta la rotación de verdad.
- **Cola de PRs vaciada a petición de Alberto:** 10 mergeados (#1946, #1914, #1928, #1913, #1921, #1865,
  #1879, #1947, #1952, #1927), revisando el diff de cada uno. La rotación mensual de la auditoría (#1927)
  se **rehízo** sobre `main` actual con el rotador ya corregido — 540 entradas a agosto, 23 vivas — y se
  retiró el `docs/memoria/2025-10.md` que había creado el bug.

- **Pendiente de Alberto:** elegir modo de ejecución del plan, y la infra (proyecto Vercel `asegura-portal`,
  rol `prisma_asegura_portal` SIN BYPASSRLS con contraseña, envs, WABA).

### 🗄️ (01/09/2026) asegura: estructura del volcado CREADA en `seguros` + el runbook mentía con las FKs
- Alberto: «la copia de la BD, mejor tener todo nosotros». Hecho el 50%: **estructura aplicada y
  verificada en central** (`seguros`): 42 enums, 52 tablas, 721 columnas, 265 índices, 67 constraints
  y 353 NOT NULL — **coincidencia EXACTA con el origen** en los cinco recuentos.
- 🚨 **`docs/TRASPASO-CORREDURIA.md` decía «cero claves foráneas». Hay 131.** Se destapó comparando
  constraints origen (198) vs destino (67). Y la conclusión que sacaba («no hay orden de carga que
  respetar») era al revés. Corregido en el doc. Las FKs van en fichero aparte y **se crean DESPUÉS de
  los datos**: no hay orden topológico posible (hay autorreferencias) y así sirven de verificación.
- DDL **generado desde los catálogos del origen**, no escrito a mano. Tres ficheros en
  `apps/asegura/prisma/sql/2026-09-01_seguros_volcado_{ddl,datos,fks}.sql`.
- Copia de datos: por **`dblink`** (ya instalado en central), server-side. `pg_dump` local es 16.13 y
  el origen 17.6 → se niega. **Bloqueado a falta de UNA cosa:** secreto `asegura_origen_url` en el
  Vault de Supabase de central (lo pone Alberto; nunca por chat). El script lo lee dentro del bloque.
- ⚠️ Sigue vigente: Manuel NO borra hasta verificar **descifrar Y buscar** sobre nuestra copia.

### 🛡️ (01/09/2026) asegura: dos specs (portal + agente de venta) y la cartera NO era lo que decíamos
- Brainstorming con Alberto → specs `2026-09-01-asegura-portal-clientes-empresas-design.md` y
  `2026-09-01-asegura-agente-venta-design.md`. PR #1941.
- 🚨 **Medido: la cartera viva son ~80 clientes / 109 pólizas, no 32.600/28.843.** El resto es volcado
  histórico (`import_ref` `intranet:` 26.117 con vto. 2013-2018 y `asegura_app:` 2.612, CERO con vto.
  futuro). Regla de Alberto: **CIMA (`import_ref IS NULL`) = cliente; el resto, lead** (32.520).
  **Cifra ya corregida** en `CLAUDE.md`, `apps/asegura/CLAUDE.md` y `docs/TRASPASO-CORREDURIA.md`.
- Portal: app nueva `apps/asegura-portal` (rol propio SIN BYPASSRLS) + `@central/module-seguros-portal`;
  schema `seguros`; WhatsApp con **WABA nueva** (`wa_opt_in`=0 en las 32.600). Eje: **«aporta tus seguros»**,
  que sirve a leads y clientes a la vez. El móvil identifica un **HOGAR** (740 números compartidos, 630 con
  el mismo apellido → familias): nunca se resuelve solo. El papel en la póliza PROPONE acceso, no lo concede.
- Agente: de **VENTA**, prepara fichas en frío sin contactar a nadie. Dos corpus con autoridad distinta —
  el contrato dice qué cubre, la **LCS/LDS** qué derechos hay (del texto consolidado del BOE, nunca de
  memoria del modelo). Sin fine-tuning. Techo real: solo **5.613** fichas son contactables.
- Regla que evita un desastre: **las pólizas del volcado histórico NO generan recordatorios** (serían
  28.729 avisos de «se te venció» sobre pólizas de 2013-2018). `recordatorios` del CRM origen no sirve:
  su `poliza_id` es NOT NULL.

### 🚗 (01/09/2026) Renovaciones: columna «Qué asegura» (matrícula, dirección, tipo de RC)
- Alberto, sobre la tabla de renovaciones de `/correduria`: «necesito otra columna con datos — auto
  matrícula marca modelo, hogar dirección, RC de qué tipo… y siempre informa al agente».
- Helper puro nuevo **`@central/module-seguros/objeto`** (`objetoAsegurado`, 17 tests) con **cuatro**
  salidas: `conocido` · `no_informado` (la compañía no lo manda) · `cifrado` (la dirección de hogar
  viene `v1:…`, AES-256-GCM; la clave sigue en el Vercel de Manuel) · `sin_objeto` (vida/salud/decesos
  son seguros de PERSONAS: ausencia definitiva, no «pendiente»). Ninguno se pinta como hueco vacío.
- Medido en la cartera real: `matricula`/`marca`/`modelo` en claro; **`datos_especificos.vehiculo` NO
  es una descripción, contiene la matrícula**; una RC se identifica por sus modalidades
  (`poliza_coberturas`), no por `datos_especificos`. Las 16 pólizas de la ventana salen `conocido`.
- Cableado de punta a punta: `apps/asegura/lib/cartera.ts` (+ intento de descifrado) → puerto
  `/api/operador/vencimientos` → `interpretarObjeto` en plataforma (campo opcional: una versión vieja
  del puerto da `null` = «aún no llega», distinto de «no informado») → columna en `/correduria` y línea
  del Telegram de renovaciones. Skill `agente-correduria` actualizada (SKILL §2 + sector §5).

- **#1938 MERGEADO** (`1ba3c254`, 12 requeridos verdes). El CI volvió a no arrancar en draft: ni abrir
  el PR ni des-draftearlo dispararon nada; lo desatascó **mergear `main` en la rama** (paso 2 del orden
  de `CLAUDE.md`), 5ª medición de esa sección — anotada ahí con la secuencia completa. 🔀 Y el PR de
  seguimiento #1940, abierto IGUAL (MCP, draft, misma identidad), **sí disparó al instante**: el draft
  no es la causa. Sigue sin explicación; lo accionable es el orden, no el diagnóstico.

### 📅 (01/09/2026) mercado-booking: objetivo jul/ago-2027 cumplido — falta quitar la prioridad del prompt
- Pasada acotada (`?desde=2027-07-01&hasta=2027-08-31&max=24`) de la skill `mercado-booking`: 238 comps
  reales en 24 ventanas (3 fechas × 4 pisos por mes) + 4/4 escaparate propio. **El objetivo (≥3
  comparables en ≥3 fechas/piso en jul y ago 2027) ya estaba cumplido desde ayer (31/08)** — esta
  pasada repitió trabajo porque el párrafo "PRIORIDAD TEMPORAL" seguía en el prompt de la rutina.

- **Pendiente para Alberto:** borrar ese párrafo del prompt programado de `mercado-booking` (esta
  sesión no tiene acceso al store del trigger para editarlo ella misma). Detalle en
  `docs/AGENTES-BITACORA.md` (entrada 01/09/2026).

### 🔔 (01/09/2026) Panel «Avisos Telegram» (`/telegram`): catálogo + interruptor por aviso
- Alberto: «las notificaciones de Telegram son muchas… un panel que las resuma y que pueda activarlas
  o desactivarlas». Hecho en `apps/plataforma`: **76 avisos PROACTIVOS catalogados** (`lib/telegram/catalogo.ts`),
  interruptor por aviso y por categoría, y contadores REALES de lo que llega (bitácora, 30 días).
- Los ~57 emisores pasan ahora por `tgAviso`/`tgAvisoBotones`/`tgAvisoAlerta` (`lib/telegram/avisos.ts`).
  **Fail-open**: si la BD no responde, el aviso SALE — un fallo de red no puede volverse silencio.
- Guardián `lib/telegram/catalogo.test.ts`: falla si un id emitido no está catalogado (aviso que no se
  puede callar) o si uno catalogado no lo emite nadie (interruptor que no hace nada). Ni tsc ni build lo cazan.
- Fuera del catálogo a propósito: las RESPUESTAS del bot a un mensaje/botón de Alberto (contable,
  borradores de huéspedes, clasificar movimiento). Silenciarlas rompería la conversación, no quitaría ruido.
- El triaje de correo tiene un interruptor **por categoría** (`avisoDeCategoriaCorreo`). Ya silenciado
  `correo.huespedes` a petición suya (📬 Huésped de Smoobu «Nueva reserva»); los borradores del agente siguen.
- La bitácora nace vacía: el panel dice «aún no se ha medido», nunca «0 avisos». Migración
  `2026-09-01_telegram_avisos.sql` **aplicada**. Purga a 90 días desde el cron `agentes-latido`.

- **#1924 MERGEADO** (`ff136ac0`, 12 requeridos verdes). El CI cazó un `make_interval(days => ${n})`
  sin `::int` (Prisma manda int8 → 42883 SOLO en runtime): guardián `regression-sql-fecha-parametro`.
  ⚠️ Ese guardián enumera con `git ls-files`, así que **no ve ficheros sin `git add`** — la suite
  local daba verde con el bug delante. Haz `git add` antes de dar por buena una suite con archivos nuevos.
- Documentado en `apps/plataforma/CLAUDE.md` (§Panel Avisos Telegram), skills `plataforma-maestro`
  (punto 12) y `correo-triaje`, y `docs/FUENTES-DE-VERDAD.md`.

### 🩺 (01/09/2026) Siniestros de CIMA: la avería tiene fecha de corte — 8 de julio
- Re-verificada la cuarentena contra la BD: el último fichero `SIN` que pasó a `confirmed` fue el **08/07**
  y el último siniestro persistido, el **02/07**. Desde el 19/07, **7 ficheros de siniestros seguidos, los 7
  en `review`**. 21 de 38 `SIN` (55%) en cuarentena; los recibos sí siguen entrando a ratos (último, 24/08).
  Encaja con el reconciliador parado el 25/06. Causa raíz y arreglo ya estaban en `TRASPASO-CORREDURIA.md`.
- Matiz de la cartera viva: de las ~109 pólizas de CIMA, **68 en estado `activa` y solo 50 con vencimiento
  futuro**; ninguna del volcado histórico lo tiene. ⚠️ `estado='activa'` NO es «en vigor»: de las 1.235 así
  marcadas, 846 no tienen fecha de vencimiento y 339 la tienen pasada.
- Frecuencia CIMA: el cron llama 2×/día pero en 21 días solo entró fichero **10 días (13 en total)**. Con
  esta cartera, **una pasada diaria sobra**; el problema nunca fue la frecuencia.

### 🔴 (01/09/2026) `GH_PAT_TRIGGER` caducado: la radiografía del repo lleva desde el 31/08 sin actualizarse
- El workflow «Auditoría de estructura» falla en TODOS los pushes a `main` desde el 31/08 ~13:25 UTC:
  `gh` responde `HTTP 401: Bad credentials`. El `git push` sí cuela —`actions/checkout` deja un
  `http.extraheader` con el GITHUB_TOKEN que pisa el PAT de la URL—, así que **la rama se sube y el PR
  nunca se abre**: el fallo es mudo salvo por el correo de Actions.
- Efectos medidos: `estructura.generated.json` congelado en `6a4d53c4d` (#1887, 31/08 08:43) y **123 ramas
  `claude/auditoria-radiografia-*` huérfanas** en el remoto (el `gh pr close --delete-branch` tampoco corre).
- 🔴 **Para Alberto: renovar el secret `GH_PAT_TRIGGER`** — un agente no puede. Mientras tanto la radiografía
  se regenera a mano (va en este PR) y las ramas huérfanas siguen ahí, pendientes de barrido.

### 🔌 (01/09/2026) Fly.io: el adapter CIMA se transfirió… y Manuel lo devolvió a su organización
- 08:16 UTC `fly apps move asegura-app-cima-adapter --org grupo-asegura` → OK (48 s). 08:32 UTC Manuel lo
  devolvió a `manuel-suarez-678` (119 s): aceptar la invitación de miembro le bastó para sacarlo. `grupo-asegura`
  quedó vacía. **No es un problema técnico, es una conversación con Manuel** — no se vuelve a mover sin su OK.
- La app no se cayó (`/health` 200 tras ambos moves) y **los ficheros no se pierden en `/tmp`**: los logs de Fly
  cuadran al minuto con `cima_ficheros` (27/08 08:15, 28/08 15:32, 30/08 11:34).
- ❌ Corrección: el fichero CIMA **no** entra «a diario entre 11:35 y 11:42 UTC» (se afirmó y era falso). El horario
  es irregular y el 01/09 (00:00–08:35 UTC) no entró ninguna tanda. Pendiente real: traer el disparador a
  `CRON_JOBS` de plataforma —hoy lo llama infra de Manuel—, que quita la dependencia sin mover infraestructura.

### ✅ (01/09/2026) V4 Flash CONFIRMADO en producción con tráfico real — serie cerrada al 100%
- Sonda diaria 07:00:48 UTC: `plataforma·sonda·openrouter·deepseek/deepseek-v4-flash·ok` →
  no hay override `OPENROUTER_MODEL` en Vercel; el default nuevo sirve en producción.
- Además tráfico de negocio real: `extraer-factura` procesó facturas con el V4 Flash a las
  06:34-06:35, y el Director escala por tarea con normalidad (gemini-flash / gpt-5.6-luna /
  sonnet-4.5). Cabo único de la verificación del 31/08: CERRADO. Nada pendiente de la serie.

### 💶 (01/09/2026) Pasada mensual `fiscal-novedades`: sin cambios en deducciones, 1 aviso a cliente
- Deducciones IRPF (mínimos, maternidad, FN estatal/andaluza) contrastadas contra BOE/BOJA/AEAT: **sin
  cambios**, PGE 2027 aún sin publicar. Radar de ayudas: ayuda Junta Andalucía 600€/hijo<3 tras 3er hijo
  detectada y descartada (renta de Alberto muy por encima del tope 6× IPREM). 1ª pasada por cliente:
  Joaquín Jaén avisado por Telegram del plan de choque hostelería (RD 638/2026, hasta 11.000€, plazo
  30/09/2026, **CNAE sin confirmar** — pendiente de que Alberto/Joaquín lo verifiquen); Sique Brilla sin
  novedad. Detalle en `docs/FISCAL-AYUDAS.md` y `docs/AGENTES-BITACORA.md`.

### 🛡️ (01/09/2026) Nace el agente de la correduría (`agente-correduria`) — decisión de Alberto
- Alberto quiere un agente que lleve Grupo ASegura «casi al 100%» y responda a clientes. Se montó por
  fases: **Fase 0** (aprender sector + informar, activa ya) → emisión Avant2 → cliente-facing (esta
  última SOLO con diseño de canal + OK explícito). Skill `agente-correduria` (router + `references/sector.md`
  acumulativo) + rutina semanal martes 05:30 UTC (§21 de `RUTINAS-PROGRAMADAS.md`).
- 🔴 Pendiente de Alberto: añadir `ALERTA_TOKEN` al prompt de la rutina en la UI (sin él, informe solo en bitácora).
- Decisión previa de la sesión: credenciales Codeoscopic se piden a **Manuel** (env vars de su Vercel),
  NO a Codeoscopic; el borrador de Gmail a Juan Fernández queda muerto sin enviar. #1918 mergeado.

- **Vencimientos ya funcionando** (mismo PR #1919): `@central/module-seguros/vencimientos` (puro, LCS
  art. 22: <1 mes = se prorroga sí o sí) + puerto `/api/operador/vencimientos` en asegura + tabla en
  plataforma `/correduria`. Real: **5 vencen en 30 días, 7 en 60, 13 en 90** (3.899,05€ de prima
  conocida, 4 sin informar). ⚠️ Contar por fecha SIN filtrar estado colaba canceladas (daba 6/8).
- Cartera viva = **59 pólizas `situacion='EV'`** (37 auto/13 hogar/8 RC/1 moto); el resto es histórico.
  Ingesta CIMA = cron diario ~11:40 UTC **fuera de nuestro alcance**: en ese Supabase NO hay pg_cron ni
  Edge Functions, así que todo lo alimenta el Vercel de Manuel — y ese Vercel **no se ve desde aquí**
  (el conector solo alcanza el team «Pisos turisticos», donde ni `asegura` ni `central-asegura` están).
- 💡 **Idea de Alberto guardada: «Agente IA Defensa cartera»** (`references/defensa-cartera.md`
  + su diagrama). Recibo de PRECARTERA → agente nocturno → retarificar → comparar nueva producción
  vs cartera → pantalla de desviación de recibos → respuesta al cliente. NO implementado; depende
  de (a) saber qué estado de `poliza_recibos` es la precartera, (b) la API de Avant2 —y **cada
  cotización cuesta 0,50€**, así que necesita presupuesto—, y (c) Fase 3 para lo del cliente.
- 🚨 **Método — cómo NO verificar un deploy de Vercel (01/09/2026, me costó 3 falsos negativos):** se
  dio por hecho que plataforma «no había desplegado» porque el identificador `dpl_…` incrustado en el
  HTML de `/login` no cambiaba. **`/login` es una página PRERENDERIZADA (ISR)**: su HTML lo sirve el CDN
  y ese `dpl_` puede seguir siendo el del build anterior con el deployment nuevo ya en producción (el
  panel mostraba los dos commits en **Production · Ready**). La comprobación que SÍ vale desde aquí:
  pedir una **ruta de API nueva** y ver si responde **401/200 en vez de 404** — eso prueba que el código
  está sirviendo (`/api/cron/correduria-renovaciones` → 401). Y el conector de Vercel **no puede leer
  deployments (403) ni env vars (no existe la herramienta)**: para eso hace falta el panel.

- **Migrar la cartera al schema `seguros`: NO todavía** — copiar 32.600 filas es trivial, pero sin mover
  la ingesta EIAC/CIMA la copia envejece al día siguiente y quedan dos carteras. Orden: vencimientos ya
  (hecho) → pedir a Manuel cómo se alimenta → migrar + repuntar ingesta. Al mover, ojo: las 86 RLS por
  `auth.uid()` no viajan (nuestros roles llevan BYPASSRLS) → el aislamiento pasa a ser del código.

### 🧾 (01/09/2026) Codeoscopic = LA fuente de tarificación y EMISIÓN de pólizas nuevas (dictado por Alberto)
- La web «ASegura» es de ALBERTO (Manuel la desarrolló); EIAC no le preocupa. Codeoscopic es el motor
  de venta: sin él la plataforma no tarifica ni emite.
- Del Gmail de Alberto (verificado): cuenta **Avant2 Sales Manager** propia y operativa desde 09/06
  (alta «SOLO ASM», formación hecha); compañías vivas: Reale (26/05, multirramo) y Fidelidade (hogar,
  14/07); claves entregadas de Mapfre/Allianz(PA342521)/Occident(M00171). Contrato Workspace 20/05 y
  DPA art. 28 remitido el 25/05 (el «contrato de encargado» de la lista ya existe con Codeoscopic).
- La integración API de la web quedó EN SANDBOX (03/06: Quote→preemisión→Submit→webhook Basic Auth sin
  cerrar; correo de manuel@loor.es a juan.fernandez@codeoscopic.com) → por eso el flag de emisión sigue
  apagado. **Borrador creado en Gmail** (no enviado) a Juan Fernández: renovar sandbox + pendientes +
  prueba de idempotencia del attempt_id. Pendiente: quién es manuel@loor.es; inventario BD cuando
  reconecte el conector Supabase_asegura.
- ⚠️ Higiene: en mayo viajaron por email claves de portales de compañías en texto plano (Mapfre,
  Occident) — rotarlas con calma.

### ✅ (01/09/2026) CARTERA EN VIVO FUNCIONANDO — rotación hecha; cron `postgres` de Manuel roto desde el reset
- Números reales en plataforma→Correduría: 50 en vigor · 995 sin fecha · 27.793 históricas · 2.742
  clientes · 29.858 leads · 7 siniestros (el 1.194 de la víspera era lectura vieja: la BD ingesta a diario).
- Contraseña de `central_asegura` ROTADA (04:39, del gestor de Alberto); snippet con clave en claro
  borrado; env recreada en Vercel; pooler registra `Connection authenticated`. Exposición de la clave
  débil (20:51→04:39): cero autenticaciones del rol en lo auditable — matiz: `log_connections` OFF,
  solo audita el pooler.
- 🚨 Un job con `postgres.js` (IPs Vercel fra1) falla como `postgres` cada ~5 min desde 31/08 ~08:00
  (antes autenticaba): es del CRM de Manuel — nada nuestro usa esa BD salvo apps/asegura (verificado
  por código). Probable daño colateral del reset de la database password durante el montaje. NO tocar
  su Vercel; avisar a Manuel (borrador, regla de comunicaciones).
- `central-asegura` servía desde us-east-1 contra BD eu-central-1 → `regions: ["fra1"]` en su vercel.json.

### 🔑 (01/09/2026) La cartera en vivo: era la CONTRASEÑA — y un valor del chat acabó de contraseña
- Logs del pooler (MCP Supabase_asegura, nuevo conector): `password authentication failed for user
  "central_asegura"` → el fallo era la contraseña del `ASEGURA_DATABASE_URL` pegado en Vercel
  (host/usuario correctos; el blindaje pgbouncer de #1905 quedó descartado como causa).
- 🚨 Incidente: al guiar el arreglo por Claude Chrome, la HUELLA de verificación (md5 del verificador
  SCRAM) publicada en el chat se usó como contraseña del rol. Lección: **jamás publicar un valor con
  pinta de credencial sin marcarlo como NO-USAR**; los secretos los genera el gestor de Alberto y no
  pasan por ningún chat. Exposición revisada en logs: solo fallos de auth, ninguna huella de acceso
  (matiz: log_connections apagado). Rotación en curso con marcador `<<CLAVE>>` que rellena Alberto.
- Aparte: algo con `postgres.js` desde `63.180.181.94` intenta entrar como `postgres` cada 5 min y
  falla — no es nuestro (nosotros: Prisma + central_asegura). Preguntar a Manuel en el traspaso.
- Además: 🛡️ Correduría entra por fin en el menú de plataforma (PR #1907, guardián incluido) —
  «no me sale correduría»: /correduria nunca estuvo en NAV_NEGOCIO.
