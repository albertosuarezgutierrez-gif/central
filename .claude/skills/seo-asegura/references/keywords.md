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

## 1. Local + ramo — comercial, competencia media

| Consulta | Página que la cubre | Estado |
|---|---|---|
| correduría de seguros Sevilla | `/` | cubierta (title + H1 + description) |
| seguro de hogar Sevilla | `/seguros/hogar` | cubierta — **ramo prioritario** |
| seguro de comunidad de propietarios Sevilla | `/seguros/comunidades` | cubierta |
| seguro de local comercial Sevilla | `/seguros/comercio` | cubierta |
| seguro de coche Sevilla | `/seguros/auto` | cubierta |
| seguro de vida / salud Sevilla | `/seguros/vida-y-salud` | cubierta |
| seguro de responsabilidad civil Sevilla | `/seguros/responsabilidad-civil` | cubierta, **pero la página no está en el NAV** |
| seguro de flota Sevilla | — | **sin página**. Es el nicho «empresas y flota», el que más interesa |

**Señal local pendiente:** ninguna página menciona barrios, distritos ni municipios de la
provincia. La señal se agota en la palabra «Sevilla».

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

`grupoasegura`, `grupo asegura sevilla`, `alberto suárez seguros`.

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
