# Mapa de consultas — Grupo ASegura

Qué buscamos ganar y qué página lo cubre. **Se amplía cada ciclo con lo que diga Google Search
Console** — hasta que GSC esté conectada, las columnas de posición e impresiones se quedan en
«pendiente», que NO es cero.

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
| seguro de responsabilidad civil | `/seguros/responsabilidad-civil` | cubierta, **pero la página no está en el NAV** |
| seguro de flota | — | **sin página**. Es el nicho «empresas y flota», el que más interesa |

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
| cómo cambiar de correduría sin cambiar de seguro | `/cambiar-de-correduria` | cubierta, **pero sin «Sevilla» en title ni H1** |
| preaviso de un mes para cancelar el seguro (art. 22 LCS) | — | **sin página** |
| me han subido el seguro del coche en la renovación | — | **sin página** |
| qué cubre de verdad mi seguro de hogar | parcialmente `/seguros/hogar` | merece página propia |
| qué es un corredor de seguros y en qué se diferencia de un agente | `/quienes-somos` | parcial |
| cómo reclamar un siniestro que me han denegado | — | **sin página** |

## 3. Marca — hay que vigilarla, no ganarla

`grupoasegura`, `Grupo ASegura Sevilla`, `alberto suárez seguros`.

> Las consultas se escriben aquí **con la marca bien escrita**, aunque quien busca teclee de otra
> forma: Google no distingue mayúsculas, y `test/regression-nombre-comercial-asegura.test.ts` sí.

🚨 **Convive con el CRM en `app.grupoasegura.com`**, que es otra web del mismo negocio. Y hasta
que se retire, `apps/plataforma/app/seguros` compite por «correduría de seguros» desde
`plataforma-ten-flame.vercel.app`. Antes de dar por perdida o ganada una consulta de marca, mira
**cuál de los tres dominios** está posicionando.

## 4. Lo que NO perseguimos, y por qué

- **«seguro barato», «el más barato», comparativas de precio.** El copy no puede prometer precio
  sin convertirse en asesoramiento (análisis objetivo + IPID). Lo bloquea `lib/ramos.test.ts`.
- **Consultas nacionales genéricas.** Somos una correduría local; el ámbito declarado en el JSON-LD
  es Sevilla + Andalucía.
- **Nombres de compañías como reclamo** («seguro Mapfre barato»). Además de la trampa del precio,
  usar su marca en el copy es un problema de permisos: sin permiso, texto y nunca el logo.
