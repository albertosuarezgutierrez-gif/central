# SEO y redes de Grupo ASegura — banco de ideas

> Backlog vivo del canal propio de la correduría: la web pública `grupoasegura.es`
> (`apps/asegura-web`) y las redes que aún no existen. Alberto, 05/09/2026: *«en breve crearemos
> rutina para ir mejorando el SEO de la web… y también atacaremos a las redes sociales»*.
>
> **Qué es esto:** lo que cada idea cuesta, lo que la bloquea y qué evidencia la sostiene.
> **Qué NO es:** un plan. La estrategia está en `docs/ASEGURA-MARKETING-PLAN.md` (fases 3 y 4).
> El agente que lo ejecuta es la skill **`seo-asegura`**.
> Al cerrar una idea se marca aquí con su PR. **Nada se borra sin cerrarse.**

## Reglas que no se negocian (cualquier idea que las rompa, se rediseña)

1. **Ningún texto promete precio.** Ni «ahorra», ni «el más barato», ni «garantizamos». Convierte
   la web en **asesoramiento** y arrastra análisis objetivo + IPID (RDL 3/2020). Lo vigila
   `apps/asegura-web/lib/ramos.test.ts`.
2. **Nada se publica sin el OK de Alberto para ESE contenido concreto.** Ni un post, ni una
   respuesta a una reseña, ni un correo. Regla global de `CLAUDE.md`. El agente deja borradores.
3. **Nunca se tarifica para captar.** Avant2 son 0,50 €/consulta y no es idempotente.
4. **Cero PII en el contenido público.** Un testimonio lo pide Alberto y con permiso escrito.
5. **`HORARIO` sigue ausente a propósito.** Publicar un horario inventado hace que alguien llame
   y no le cojan. No se rellena «para completar el JSON-LD».
   ✅ **El teléfono ya NO está ausente** (05/09/2026): vive en `MEDIADOR.identidad.telefono` con
   `telefonoLegible()` y `whatsappUrl()`. Se lee de ahí, nunca se teclea.
6. **Un dato que no se ha mirado no se afirma.** PostHog solo mide a quien acepta el banner: sus
   cifras no son «el tráfico», son «el tráfico que consintió». Cero medido ≠ cero.

---

## 🚨 Lo primero, porque no es marketing: el libro de comisiones puede estar mintiendo

**M. Mapfre no lleva 5 meses sin traer recibos: NUNCA ha entrado por el cron.** *(medido en BD el
05/09/2026)*

El plan (§Fase 0.5) decía «falta la ingesta de Mapfre desde el 02/04/2026». La consulta a
`seguros.poliza_recibos` agrupando por entidad y **fecha de ingesta** dice otra cosa:

| Entidad | Recibos | Primera ingesta | Última ingesta |
|---|---|---|---|
| **C0058 Mapfre** | 153 | 2026-06-24 | **2026-06-24** ← una sola fecha |
| C0109 Allianz | 10 | 2026-06-24 | 2026-08-24 |
| C0468 Occident | 20 | 2026-06-24 | 2026-08-24 |
| C0613 Reale | 1 | 2026-08-02 | 2026-08-02 |

Los 153 recibos de Mapfre tienen **una única fecha de creación**, la del volcado inicial. Allianz y
Occident sí han recibido ingestas posteriores. O sea: no es que CIMA dejara de traer Mapfre — es
que **Mapfre solo entró en la migración y el cron nunca ha traído uno suyo**. Su último
`fecha_situacion` es del 29/03/2026.

**Por qué está en un documento de marketing:** Mapfre es el **64 % de la cartera**. La decisión de
que el ramo prioritario sea hogar sale de comisiones por ramo, y esas comisiones salen de recibos.
Si falta el 64 %, la comparación hogar-vs-auto puede estar sesgada. **Esto se mira antes que
cualquier campaña**, y le toca a `agente-correduria`, no a esta skill.

---

> ⚠️ **Este backlog se midió sobre el árbol del 05/09/2026 a las ~15:00, y esa misma tarde entró en
> `main` un rediseño de `apps/asegura-web`.** Lo revalidado tras el merge está marcado abajo. Antes
> de trabajar una idea, **compruébala contra el código de hoy**: un backlog que describe una app que
> ya cambió es justo la clase de dato que este repo no se permite.

## ✅ A. Imagen para compartir (Open Graph) — 🔴 la más barata con más impacto

> ✅ **CERRADO el 07/09/2026 (PR de esta sesión).** `apps/asegura-web/app/opengraph-image.tsx`
> genera la tarjeta 1200×630 con `next/og`, leyendo marca y clave DGSFP de `MARCA_ASEGURA` y
> `MEDIADOR` (nada quemado en un PNG). Next la aplica a TODAS las páginas que no declaren la
> suya, y el `layout` añade `twitter: { card: "summary_large_image" }` para que X no la recorte
> a cuadrado. Verificado en `next build`: `/opengraph-image` sale prerrenderizada.

<details><summary>Diagnóstico original (se conserva: explica POR QUÉ se hizo)</summary>


**Hoy no existe ninguna.** Cero ficheros `opengraph-image*`, cero `openGraph.images`, cero bloque
`twitter` en toda la app. `public/` tiene un único activo: `brand/marca-asegura.svg`.

**Consecuencia:** cada enlace que alguien pegue en WhatsApp, LinkedIn o Facebook sale como **una
tarjeta de texto plano, sin imagen**. En una compra de confianza, eso es una diferencia de clic
enorme, y es el canal que Alberto va a usar primero (mandar el enlace a conocidos y clientes).

**Además, la home —la página más compartida— no tiene `openGraph` propio** (`app/page.tsx:9-14`):
hereda el del layout, que no lleva ni título ni descripción propios de OG.

**Qué haría:** `opengraph-image.tsx` generado por `next/og` a partir de `MARCA_ASEGURA` (los
colores ya están medidos del CSS real) y del logo que ya existe, más una variante por ramo. Sin
dependencias nuevas.
**Coste:** una tarde. **Bloqueo:** ninguno. **Necesita:** nada. Se puede hacer ya.

</details>

## 🚫 B. La página de más intención de compra no dice dónde está — REVERTIDA

> 🚫 **CERRADA AL REVÉS, y la decisión NO es mía: el ámbito es NACIONAL (PR #2464, 07/09/2026).**
> Esta idea pedía meter «en Sevilla» en el `title` y el `h1` de `/cambiar-de-correduria` y de
> `/quienes-somos`. Se hizo esa misma mañana… y a las pocas horas hubo que deshacerlo: en paralelo
> entró en `main` la decisión contraria y mejor razonada — **«Sevilla» en un encabezado no acota la
> palabra clave, acota la OFERTA**, y quien entra desde otra provincia lee en el primer renglón que
> no es cliente. Un corredor inscrito en la DGSFP media en todo el territorio.
>
> Lo que queda vigente de esta idea: **la señal local sí importa, pero sale del NAP y del perfil de
> Google Business, no de repetir la ciudad en cada `h1`.** El `areaServed` del JSON-LD es ahora
> `Country: España` y el domicilio postal sigue en Sevilla, que es como se declara un negocio con
> oficina local y ámbito nacional.
>
> 🚨 Y hay cepo: `ACOTA_AMBITO` (`lib/ramos.test.ts`) **prohíbe** «en Sevilla», «Sevilla y su
> provincia» y «en Andalucía» en `RAMOS` y en todo el fuente de `app/` y `components/`. Si esta
> idea vuelve a proponerse, el test la para. No la reabras sin hablarlo con Alberto.

<details><summary>Diagnóstico original (se conserva: explica POR QUÉ se hizo)</summary>


`/cambiar-de-correduria` es, por diseño, la conversión más barata del sitio: convierte un lead en
cliente **sin tarificar** (0 € de Avant2) y sin competir por precio.

Su `title` (`page.tsx:22`) y su `h1` (`:109`) **no llevan «Sevilla»**, que son los dos sitios que
más pesan.

⚠️ **Corregido el 05/09/2026, unas horas después de medirlo:** aquí ponía «cero señales locales» y
«no la menciona ni una vez», y eso **ya es falso** — el rediseño de la web que entró en `main` esa
misma tarde metió «Sevilla» en la `description` (`:24`). Sigue faltando en title y h1, que es lo
que hay que arreglar; el cuerpo ya no está mudo.
`/quienes-somos` tiene el mismo hueco en su H1 (`:146`), aunque su title sí la lleva.

**Coste:** una hora. **Bloqueo:** ninguno. **Ojo:** cambiar un H1 es cambiar copy → pasa por
`lib/ramos.test.ts`.

</details>

## ✅ C. Las páginas de ramo son callejones sin salida — 🟠

> ✅ **CERRADO el 07/09/2026.** Cada página de ramo cierra con un bloque «Otros seguros que
> llevamos» que enlaza a las cinco hermanas (objetivo táctil de 44 px) y a
> `/cambiar-de-correduria`. `responsabilidad-civil` entra en `NAV` —o sea, en el pie— y
> **se queda fuera de la cabecera a propósito**: sería la sexta entrada y devolvería el
> desbordamiento medido el 05/09. Lo vigila `lib/enlazado.test.ts`, que falla si un ramo se
> queda sin enlaces o si la cabecera vuelve a crecer.

<details><summary>Diagnóstico original (se conserva: explica POR QUÉ se hizo)</summary>


Medido: las 6 páginas de ramo **no enlazan entre sí, ni a `/cambiar-de-correduria`, ni a
`/quienes-somos`**. Su único enlace es la miga hacia `/`. Y el pie (`layout.tsx:175-181`) reparte
todo su peso a las 4 legales + quiénes somos: **cero enlaces del footer a ramos**.

Peor: **`responsabilidad-civil` no está en el `NAV`** (`sitio.ts:73-80`). Su único enlace de todo
el sitio es una tarjeta de la home.

**Qué haría:** bloque «ver también» con 2-3 ramos vecinos + un enlace a `/cambiar-de-correduria` al
final de cada ramo (que es exactamente donde está la intención), y meter RC en el NAV o aceptar
explícitamente que es una página secundaria.
**Coste:** una tarde. **Bloqueo:** ninguno.

</details>

## D. Canibalización con `apps/plataforma/seguros` — 🟡 mitigada, falta LA decisión

> 🟡 **07/09/2026: la sangría está tapada, la decisión no.** `apps/plataforma/app/seguros/page.tsx`
> exporta ya `robots: { index: false, follow: true }`, así que deja de competir por «correduría de
> seguros Sevilla» contra `grupoasegura.es`. **La página sigue viva y su formulario sigue entrando**
> por el mismo endpoint: quien tenga el enlace la usa igual. No se puso `canonical` además del
> noindex a propósito (son señales contradictorias y Google desaconseja combinarlas).
>
> ❓ **Lo que sigue siendo de Alberto:** ¿se retira del todo (301 hacia `grupoasegura.es`, o
> borrarla) o se queda como está? Medido esta sesión: la página son **198 líneas**, **no la enlaza
> nadie** en todo el monorepo, y hace lo mismo que la web nueva con seis páginas de ramo menos.
> Mientras no se decida, el noindex la deja inofensiva.

`apps/plataforma/app/seguros/page.tsx` **existe, es pública** (middleware la lista en `PUBLIC`,
`middleware.ts:59`), **es indexable** (exporta `metadata` sin `robots`, y plataforma **no tiene
`robots.ts` ni `sitemap.ts`**), tiene H1 «Correduría de seguros» y **manda los leads al mismo
endpoint** que la web nueva (`/api/publico/correduria/lead`).

Dos webs distintas compitiendo por la misma consulta, y la vieja vive bajo
`plataforma-ten-flame.vercel.app`.

**La trampa:** no hay bloque `redirects()` en **ningún** `next.config.*` del monorepo. El 301 hay
que escribirlo desde cero, y hay que decidir si la página muere o queda como redirección
permanente. Y además `public/mockup-correduria.html` **se sirve público y es rastreable**.

**Coste:** pequeño. **Bloqueo:** decidir si `/seguros` de plataforma se retira del todo. **Riesgo
si se deja:** el que ya hay, dilución.

## ✅ E. Sitemap que declara frescura falsa — 🟠

> ✅ **CERRADO el 07/09/2026.** Fuera el `new Date()`. Las cuatro legales fechan con
> `FECHA_TEXTOS_WEB` (`@central/module-seguros`), que es el día real en que se tocaron los
> textos públicos; la portada y los ramos **omiten** `lastModified` porque no hay fuente de
> esa fecha, y ausente es la verdad (regla NULL≠0). Las legales se quedan en el sitemap con
> prioridad 0,3: sacarlas no gana nada y perderían el único sitio donde se declaran.

<details><summary>Diagnóstico original (se conserva: explica POR QUÉ se hizo)</summary>


`app/sitemap.ts:10` hace `const ahora = new Date()` y se lo pone a las 13 URLs. Es decir: **cada
regeneración dice que todo cambió hoy**, lo que equivale a no dar señal ninguna. Y las **4 páginas
legales ocupan el 31 % del sitemap** sin tener intención de búsqueda.

**Qué haría:** `lastModified` real (fecha del último commit del fichero, o una constante por página
que se sube a mano) y sacar las legales o dejarlas con prioridad mínima.
**Coste:** pequeño. **Bloqueo:** ninguno.

</details>

## F. Huecos de JSON-LD — 🟠

`lib/seo.ts` ya emite `InsuranceAgency` bien construido (con `areaServed`, `identifier` DGSFP y
`knowsAbout`), más `BreadcrumbList` y `FAQPage` en las 7 páginas comerciales. Lo que falta:

- **`Service` por ramo** — nada liga cada ramo con el `provider` y su zona. Es el hueco más claro.
- **`logo`/`image`** — la ficha no declara ninguna, teniendo `brand/marca-asegura.svg`.
- **`geo`** — hay dirección postal completa y ninguna coordenada. Sin justificar.
- **`sameAs`** — cero perfiles enlazados. Es **la señal con la que Google casa la ficha con el
  Google Business Profile**, así que esta queda bloqueada por la idea I.
- **`WebSite`** (y con él `SearchAction`).

✅ **El bug de NAP que había aquí YA ESTÁ ARREGLADO** (05/09/2026, en `main`). Decía que
`seo.ts:45` tecleaba `'San Juan de La Palma, 28'` a mano mientras `MEDIADOR.identidad.domicilio`
decía otra cosa. Ahora `streetAddress` se deriva de `MEDIADOR` y el propio fichero explica por qué.
Se deja escrito porque el motivo sigue valiendo: una dirección que no coincide entre el JSON-LD y
el pie es lo que rompe la correspondencia con el Business Profile.
**Coste:** el bug, minutos. El resto, una tarde. **Bloqueo:** `sameAs` y `geo` esperan al GBP.

## ✅ G. `/legal/cookies` sin canonical — 🟢 minutos

> ✅ **CERRADO** — ya lo llevaba (`page.tsx:20`), lo metió el rediseño del 05/09. Este banco lo
> daba por abierto porque se midió sobre el árbol de esa mañana.

<details><summary>Diagnóstico original (se conserva: explica POR QUÉ se hizo)</summary>


`app/legal/cookies/page.tsx:12-14` es **la única página del sitio sin `alternates.canonical`** (las
otras tres legales sí lo llevan). En un sitio que vivió en dos dominios el mismo día, no es un
detalle de estilo.

</details>

## H. Los bots de IA pasan por omisión, no por decisión — 🟢 decisión, no código

`app/robots.ts` permite todo salvo `/api/`. No hay ninguna regla para `GPTBot`, `ClaudeBot`,
`PerplexityBot`, `CCBot` ni `Google-Extended`.

**No propongo bloquearlos.** Para una correduría local, aparecer en la respuesta de un asistente
cuando alguien pregunta «cómo cambio de correduría en Sevilla» es tráfico cualificado gratis. Pero
que sea **una decisión escrita** y no un descuido. **Decide Alberto.**

## ✅ I. Google Business Profile — ya existía, y con dos incumplimientos dentro

> ✅ **CERRADO el 07/09/2026 (comprobado en el panel, no supuesto).** La ficha **ya existía y estaba
> verificada**: en Maps, 381 visualizaciones, categoría «Agencia de seguros». Este banco la daba por
> «hay que crearla» — falso. Lo que sí había eran dos incumplimientos:
> · el **nombre** era `Grupo ASegura · Corredor de seguros`, o sea keyword stuffing. Google lo
>   prohíbe expresamente y es motivo típico de suspensión; en una cuenta que ya arrastra **4 fichas
>   suspendidas** eso no es teórico. Corregido al nombre a secas, que además es lo que publica la
>   web (NAP exacto).
> · el **sitio web** apuntaba a `http://`. Corregido a `https://`.
>
> 🚨 **Y una autorreseña bloqueada**: había una reseña del propio titular en estado «No publicado»
> con el aviso «No podemos publicar este contenido». No es un fallo temporal — Google prohíbe que el
> titular reseñe su propio negocio. Se retira.
>
> 📉 **Lo que sigue abierto es lo de siempre: 381 visualizaciones y UNA reseña**, de hace 7 años y de
> dos palabras. La petición de reseña a los ~80 clientes vivos sigue pendiente **y la manda Alberto**,
> no un agente.
>
> ⚠️ La dirección de la ficha (`Calle San Juan de la Palma, 28`) y la del repo (`San Juan de La
> Palma, nº 28`) difieren en el artículo y una mayúscula. **No se toca ninguna de las dos**: Google
> normaliza direcciones, y la del repo es el domicilio profesional que se declara por obligación
> legal (art. 19 Ley 16/2018), no un campo de estilo.

<details><summary>Diagnóstico original (se conserva: explica POR QUÉ se miró)</summary>


Lo que sale cuando alguien busca «correduría de seguros Sevilla» desde el móvil. No es código.

**Bloqueo:** verificación (código o postal al domicilio) — **la hace Alberto**.
**Y va pegado:** un GBP con **cero reseñas no convierte**. La petición de reseña a los ~80 clientes
actuales es el activo local nº1 y **la manda Alberto**, nunca el agente (regla 2). Desbloquea
además el `sameAs` de la idea F.

</details>

## ✅ J. Google Search Console — ya estaba conectada desde mayo

> ✅ **CERRADO el 07/09/2026.** La propiedad de tipo Dominio `sc-domain:grupoasegura.es` **estaba
> verificada desde el 17/05/2026** y el sitemap enviado desde el 05/09, en estado Correcto con sus
> URL. O sea: **hay cuatro meses de datos** y este banco los daba por inexistentes.
>
> 📊 **Primera lectura real (3 meses, 06/06–05/09/2026): 350 impresiones, 0 clics, posición media
> 47,1.** Las consultas son genéricas del sector (la palabra «grupo» con «asegurador», «seguros» o
> «aseguranza» detrás: 176 impresiones la primera, en posición 62), no de marca. La única de marca de
> verdad —el nombre bien escrito— está en **posición 3,0 con 4 impresiones**. Lectura honesta: **no
> hay tráfico que perder, hay tráfico que construir**, y eso respalda el cambio de ámbito a nacional
> del PR #2464, porque la señal local que supuestamente se sacrificaba no existía.
>
> ⏸️ **Lo que sigue sin existir es un conector de Search Console del lado del agente.** Los datos
> están, pero hay que pegarlos a mano. El problema ya no es «medir a ciegas», es «los datos no llegan
> al que decide»: distinto problema y distinto arreglo.

<details><summary>Diagnóstico original (se conserva: explica POR QUÉ se miró)</summary>


**No conectada.** Es la única fuente sin sesgo de por qué consultas entra la web y en qué posición.
PostHog no la sustituye: solo ve a quien acepta el banner.

**Mientras no exista, la posición y las impresiones se declaran «pendiente», nunca 0.**
**Bloqueo:** verificación del dominio por Alberto (registro TXT en IONOS, que es donde está el DNS).
**Nota:** ya hay un TXT pendiente en esa zona por otro motivo (el DMARC, ver §Pendientes) — se
pueden hacer en la misma sentada.

</details>

## K. Contenido de intención de problema — 🟠 el trabajo de fondo (Fase 4)

Donde está el dinero y casi no hay competencia. No «seguro de coche barato»: esa SERP no se gana.

- «me han subido el seguro del coche en la renovación»
- «preaviso de un mes para cancelar el seguro» (art. 22 LCS)
- «cómo cambiar de correduría sin cambiar de seguro»
- «qué cubre de verdad mi seguro de hogar»
- «seguro de comunidad de propietarios Sevilla» · «seguro de local comercial Sevilla» ·
  «seguro de flota Sevilla»

**Ritmo:** un artículo por ciclo, no cinco a medias.
⚠️ **Lección del agente SEO de ia-rest, que no aplicó ni un cambio en toda su vida:** su umbral de
30 impresiones era inalcanzable sin tráfico. **No automatizar el SEO antes de tener tráfico** — al
principio la rutina propone y Alberto decide, no al revés.

## L. Canibalización interna de las FAQ — 🟢 menor

La última pregunta de los 6 ramos es prácticamente la misma («¿cobráis algo?») con la misma
respuesta (`ramos.ts:116, 169, 222, 275, 383` + `cambiar-de-correduria:76`). Seis respuestas casi
idénticas repartidas en siete URLs. Se diferencian o se centralizan en una.

## M. Redes sociales — 🟠 no hay perfiles, y no se crean solos

Por orden de retorno para una correduría local:

1. **Google Business Profile** (idea I). No es una red social, es *la* pieza local.
2. **LinkedIn, con el perfil de Alberto, no una página de empresa.** El nicho que más interesa es
   **empresas y flota**, y ahí la relación es de persona a persona. El contenido es el mismo de la
   idea K, en corto.
3. **Instagram/Facebook solo si hay quien alimente el calendario.** Una cuenta muerta resta.

**Regla propia de redes:** un post publicado **no se edita como una página**. Si promete precio, ya
está publicado. Por eso los borradores pasan por el mismo cepo del copy antes de proponerlos.
**Bloqueo:** crear cuentas y publicar es de Alberto. El agente prepara y espera.

## N. B2B del propio grupo — CAC 0 € 🟠 (no es SEO, pero compite por el mismo tiempo)

Joaquín Jaén (catering/almacén), Mariscos González, Sique Brilla, los restaurantes de ia.rest, la
flota de transporte, los pisos de SIVRA. Todos necesitan RC, multirriesgo de local, flota, convenio
o accidentes. **Relación ya abierta, coste de captación cero**, y encima son quienes pueden dar las
**primeras reseñas** que hacen falta para la idea I.
**Bloqueo:** son conversaciones de Alberto. Aquí solo se prepara el material.

---

## ✅ Cerrado (no volver a abrirlo)

- **`info@` → `hola@` en la web pública.** El plan (§0.2) y `apps/asegura-portal/CLAUDE.md:952` lo
  dan como incumplimiento abierto. **En `apps/asegura-web` ya está hecho:** grep de
  `info@|hola@|@grupoasegura` sobre toda la app da **cero coincidencias literales** — la web nunca
  teclea una dirección, siempre la compone desde `MEDIADOR.identidad.email`
  (`mediador.ts:99` = `hola@grupoasegura.es`), y `mediador.test.ts:96` **prohíbe** que `info@`
  reaparezca. Los documentos que lo dan por vivo se refieren al **repo `asegura` antiguo**, no a
  esta app. *(medido 05/09/2026)*
- **Analítica con consentimiento.** PostHog EU detrás de Cookiebot, fail-closed. PR #2385 + #2380.
- **Las 6 páginas de ramo tienen contenido real**, ~700-900 palabras únicas cada una, H1 propio y
  jerarquía correcta. No es una plantilla rellenada: no hace falta reescribirlas.

## Pendientes que no son de esta skill pero bloquean cosas de aquí

- **DNS de `clientes.grupoasegura.es`** → registro **A** a `216.150.1.1` (nunca CNAME: esa zona
  tiene MX de IONOS que un CNAME mataría).
- **DMARC** en `p=none` y sin `rua`: hoy es decorativo. Mismo panel que el TXT de la idea J.
- ~~**Caducidad del consentimiento en Cookiebot**: 12 meses; se quería 395 días.~~ ❌ **No es posible,
  y deja de ser una decisión pendiente (comprobado 07/09/2026).** El desplegable de Cookiebot solo
  ofrece meses enteros de 0 a 12: **12 meses es el máximo de la herramienta**, no una preferencia que
  nadie haya cambiado. Se queda en 12.
- 🚨 **NUEVO — Cookiebot dice «Not live» en el dominio (07/09/2026).** Está dado de alta en el grupo
  del CBID, pero el escaneo del 05/09 encontró **1 sola cookie** y el estado del banner es «Not
  live»: Cookiebot no se detecta en la web. [Probable] falta `NEXT_PUBLIC_COOKIEBOT_ID` en el
  proyecto Vercel `asegura-web`, y sin esa variable la app **no monta el banner y, por diseño
  (`lib/analitica.ts`), no mide nada**. El fail-closed funciona; el problema es que es SILENCIOSO.
  Pendiente de confirmar en el HTML vivo.
- ⏳ **Cookiebot en Premium Trial, 12 días restantes** (a 07/09/2026), y el trial solo admite 1
  dominio. Cuando caduque, mirar qué pasa con el banner.
- ❌ **Google Analytics NO se añade** (decidido 07/09/2026). Ya hay medición —PostHog EU detrás de
  Cookiebot— y con 0 clics en tres meses GA4 diría exactamente lo mismo. Además duplicaría la
  superficie legal: PostHog está en la UE a propósito, y GA4 arrastra transferencia internacional.
  Lo que falta no es una segunda herramienta: es que la que hay deje de estar «Not live».
- **Redespliegue de `asegura`** (el CRM de Manuel): su build vivo sigue mandando `distinctId` a
  PostHog sin comprobar consentimiento, aunque las envs ya se borraron.
