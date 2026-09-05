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
5. **`HORARIO` y el teléfono siguen ausentes a propósito.** Publicar un horario inventado hace que
   alguien llame y no le cojan. No se rellenan «para completar el JSON-LD».
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

## A. Imagen para compartir (Open Graph) — 🔴 la más barata con más impacto

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

## B. La página de más intención de compra no dice dónde está — 🔴

`/cambiar-de-correduria` es, por diseño, la conversión más barata del sitio: convierte un lead en
cliente **sin tarificar** (0 € de Avant2) y sin competir por precio.

Y es **la única página comercial con cero señales locales**: su `title` (`page.tsx:22`) y su `h1`
(`:109`) no llevan «Sevilla», y el cuerpo entero (pasos + FAQ) **no la menciona ni una vez**.
`/quienes-somos` tiene el mismo hueco en su H1 (`:146`), aunque su title sí la lleva.

**Coste:** una hora. **Bloqueo:** ninguno. **Ojo:** cambiar un H1 es cambiar copy → pasa por
`lib/ramos.test.ts`.

## C. Las páginas de ramo son callejones sin salida — 🟠

Medido: las 6 páginas de ramo **no enlazan entre sí, ni a `/cambiar-de-correduria`, ni a
`/quienes-somos`**. Su único enlace es la miga hacia `/`. Y el pie (`layout.tsx:175-181`) reparte
todo su peso a las 4 legales + quiénes somos: **cero enlaces del footer a ramos**.

Peor: **`responsabilidad-civil` no está en el `NAV`** (`sitio.ts:73-80`). Su único enlace de todo
el sitio es una tarjeta de la home.

**Qué haría:** bloque «ver también» con 2-3 ramos vecinos + un enlace a `/cambiar-de-correduria` al
final de cada ramo (que es exactamente donde está la intención), y meter RC en el NAV o aceptar
explícitamente que es una página secundaria.
**Coste:** una tarde. **Bloqueo:** ninguno.

## D. Canibalización con `apps/plataforma/seguros` — 🟠 y tiene trampa

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

## E. Sitemap que declara frescura falsa — 🟠

`app/sitemap.ts:10` hace `const ahora = new Date()` y se lo pone a las 13 URLs. Es decir: **cada
regeneración dice que todo cambió hoy**, lo que equivale a no dar señal ninguna. Y las **4 páginas
legales ocupan el 31 % del sitemap** sin tener intención de búsqueda.

**Qué haría:** `lastModified` real (fecha del último commit del fichero, o una constante por página
que se sube a mano) y sacar las legales o dejarlas con prioridad mínima.
**Coste:** pequeño. **Bloqueo:** ninguno.

## F. Huecos de JSON-LD — 🟠

`lib/seo.ts` ya emite `InsuranceAgency` bien construido (con `areaServed`, `identifier` DGSFP y
`knowsAbout`), más `BreadcrumbList` y `FAQPage` en las 7 páginas comerciales. Lo que falta:

- **`Service` por ramo** — nada liga cada ramo con el `provider` y su zona. Es el hueco más claro.
- **`logo`/`image`** — la ficha no declara ninguna, teniendo `brand/marca-asegura.svg`.
- **`geo`** — hay dirección postal completa y ninguna coordenada. Sin justificar.
- **`sameAs`** — cero perfiles enlazados. Es **la señal con la que Google casa la ficha con el
  Google Business Profile**, así que esta queda bloqueada por la idea I.
- **`WebSite`** (y con él `SearchAction`).

🐛 **Y un bug de NAP:** `seo.ts:45` teclea a mano `'San Juan de La Palma, 28'` mientras la fuente
única `MEDIADOR.identidad.domicilio` dice `'San Juan de La Palma, nº 28, 41003 Sevilla'`. El propio
fichero declara en su cabecera que la dirección viene de `MEDIADOR`, y es **el único campo que no
lo cumple**. Una dirección que no coincide entre el JSON-LD y el pie es exactamente lo que rompe la
correspondencia con el Business Profile.
**Coste:** el bug, minutos. El resto, una tarde. **Bloqueo:** `sameAs` y `geo` esperan al GBP.

## G. `/legal/cookies` sin canonical — 🟢 minutos

`app/legal/cookies/page.tsx:12-14` es **la única página del sitio sin `alternates.canonical`** (las
otras tres legales sí lo llevan). En un sitio que vivió en dos dominios el mismo día, no es un
detalle de estilo.

## H. Los bots de IA pasan por omisión, no por decisión — 🟢 decisión, no código

`app/robots.ts` permite todo salvo `/api/`. No hay ninguna regla para `GPTBot`, `ClaudeBot`,
`PerplexityBot`, `CCBot` ni `Google-Extended`.

**No propongo bloquearlos.** Para una correduría local, aparecer en la respuesta de un asistente
cuando alguien pregunta «cómo cambio de correduría en Sevilla» es tráfico cualificado gratis. Pero
que sea **una decisión escrita** y no un descuido. **Decide Alberto.**

## I. Google Business Profile — 🔴 la de más retorno por hora de todo el plan, y gratis

Lo que sale cuando alguien busca «correduría de seguros Sevilla» desde el móvil. No es código.

**Bloqueo:** verificación (código o postal al domicilio) — **la hace Alberto**.
**Y va pegado:** un GBP con **cero reseñas no convierte**. La petición de reseña a los ~80 clientes
actuales es el activo local nº1 y **la manda Alberto**, nunca el agente (regla 2). Desbloquea
además el `sameAs` de la idea F.

## J. Google Search Console — 🔴 sin esto, el SEO se hace a ciegas

**No conectada.** Es la única fuente sin sesgo de por qué consultas entra la web y en qué posición.
PostHog no la sustituye: solo ve a quien acepta el banner.

**Mientras no exista, la posición y las impresiones se declaran «pendiente», nunca 0.**
**Bloqueo:** verificación del dominio por Alberto (registro TXT en IONOS, que es donde está el DNS).
**Nota:** ya hay un TXT pendiente en esa zona por otro motivo (el DMARC, ver §Pendientes) — se
pueden hacer en la misma sentada.

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
- **Caducidad del consentimiento en Cookiebot**: 12 meses; se quería 395 días. Sin decidir.
- **Redespliegue de `asegura`** (el CRM de Manuel): su build vivo sigue mandando `distinctId` a
  PostHog sin comprobar consentimiento, aunque las envs ya se borraron.
