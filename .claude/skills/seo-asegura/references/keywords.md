# Mapa de consultas — Grupo ASegura

Qué buscamos ganar y qué página lo cubre. **Se amplía cada ciclo con lo que diga Google Search
Console** (conectada desde el 08/09/2026: las posiciones reales están en `seo_correduria_semana`,
no aquí — esta tabla es el MAPA, no la medición).

🚨 **Las tablas §1 y §2 son el espejo de `CONSULTAS` en
`apps/plataforma/lib/seo-correduria/consultas.ts`**, que es lo que el cron lanza a Serper cada
lunes. Las compara `consultas.test.ts` (igualdad de conjuntos sobre la primera celda de cada fila):
añadir o cambiar una consulta aquí sin tocar allí —o al revés— pone ese test en rojo, que es lo que
impide que la skill vigile unas consultas y el cron otras.

## Regla de selección

**Intención de problema antes que volumen.** Una consulta que busca alguien con el problema encima
convierte; una consulta genérica de precio la ganan los comparadores con presupuesto de Ads. No
persigas «seguro de coche barato»: esa SERP no se gana y además nos obligaría a hablar de precio,
que es justo lo que el copy no puede hacer (RDL 3/2020).

---

## 1. Ramo — comercial, competencia media-alta

🚨 **Esta tabla decía «… Sevilla» en las ocho filas hasta el 07/09/2026.** Se vende en toda
España (dictado de Alberto), así que el copy de las páginas ya no acota la provincia y estas
consultas se persiguen sin modificador geográfico. La señal local sigue viva por la dirección
publicada y el perfil de Google Business, no por la palabra en el h1.

| Consulta | Página que la cubre | Estado |
|---|---|---|
| correduría de seguros | `/` | cubierta (title + H1 + description) |
| seguro de hogar | `/seguros/hogar` | cubierta — **ramo prioritario** |
| seguro de comunidad de propietarios | `/seguros/comunidades` | cubierta |
| seguro de local comercial | `/seguros/comercio` | cubierta |
| seguro de coche | `/seguros/auto` | cubierta |
| seguro de vida / salud | `/seguros/vida-y-salud` | cubierta |
| seguro de responsabilidad civil | `/seguros/responsabilidad-civil` | cubierta y **ya enlazada** (pie + las 5 páginas de ramo hermanas, 07/09/2026). Fuera de la cabecera a propósito: sería la sexta entrada y desborda |
| seguro de flota | `/seguros/flota` | ✅ **cubierta desde el 07/09/2026**. Es el nicho «empresas y flota». Enlazada desde el pie y desde comercio, NO desde la cabecera (cabe medido: 6 entradas desbordan) |

⚠️ **El precio de este cambio, dicho como es:** sin el modificador geográfico estas consultas se
disputan con comparadores nacionales y con las propias aseguradoras, así que la posición esperable
baja. La contrapartida es que ya no se rechaza en el primer renglón a quien busca desde fuera de
Sevilla, que es lo que se vende. **Medirlo cuando GSC esté conectada** — hasta entonces, ni el
antes ni el después están medidos.

**Modificación local, si algún día interesa:** con página propia por zona, nunca metiendo la
ciudad en los encabezados de la página nacional.

## 2. Intención de problema — donde está el dinero y casi no hay competencia

| Consulta | Página | Estado |
|---|---|---|
| cómo cambiar de correduría sin cambiar de seguro | `/cambiar-de-correduria` | cubierta, y con «Sevilla» en title y H1 desde el 07/09/2026 |
| preaviso de un mes para cancelar el seguro (art. 22 LCS) | — | **sin página** |
| me han subido el seguro del coche en la renovación | — | **sin página** |
| qué cubre de verdad mi seguro de hogar | parcialmente `/seguros/hogar` | merece página propia |
| qué es un corredor de seguros y en qué se diferencia de un agente | `/quienes-somos` | parcial |
| cómo reclamar un siniestro que me han denegado | — | **sin página** |

## 3. Marca — hay que vigilarla, no ganarla

`grupoasegura`, `Grupo ASegura Sevilla`, `alberto suárez seguros`.

> Las consultas se escriben aquí **con la marca bien escrita**, aunque quien busca teclee de otra
> forma: Google no distingue mayúsculas, y `test/regression-nombre-comercial-asegura.test.ts` sí.

🚨 **Convive con el CRM en `app.grupoasegura.com`**, que es otra web del mismo negocio. Antes de
dar por perdida o ganada una consulta de marca, mira **cuál de los dominios** está posicionando.

✅ `apps/plataforma/app/seguros` ya **no compite**: desde el 07/09/2026 exporta
`robots: { index: false, follow: true }`. La página sigue viva y su formulario sigue entrando por
el mismo endpoint, pero sale del índice. Si Google todavía la enseña, es que aún no ha recrawleado:
se comprueba en Search Console cuando exista, no se vuelve a tocar el código.

## 4. Lo que NO perseguimos, y por qué

- **«seguro barato», «el más barato», comparativas de precio.** El copy no puede prometer precio
  sin convertirse en asesoramiento (análisis objetivo + IPID). Lo bloquea `lib/ramos.test.ts`.
- **Consultas genéricas de PRECIO a nivel nacional** («seguro de hogar barato»). El ámbito SÍ es
  nacional desde el 07/09/2026 (`areaServed` = país; esta línea decía «somos una correduría local»
  y contradecía el §1), pero una SERP genérica de precio la ganan los comparadores con Ads.
- **Nombres de compañías como reclamo** («seguro Mapfre barato»). Además de la trampa del precio,
  usar su marca en el copy es un problema de permisos: sin permiso, texto y nunca el logo.
