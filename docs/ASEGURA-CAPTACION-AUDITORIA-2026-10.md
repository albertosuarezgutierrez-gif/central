# Grupo ASegura · Auditoría de captación nacional (17/10/2026)

> Etiquetas: **Hecho** (visto en código/BD/fuente con fecha), **Hipótesis** (plausible, sin medir),
> **Recomendación** (propuesta). Sin datos personales: solo cifras agregadas.
> Plan origen: `/root/.claude/plans/dime-que-opinas-tender-reef.md`. Código auditado en `f6fd046`.

## 1. Resumen ejecutivo

- **El cuello de botella es el TRÁFICO, no la conversión** [Hecho]. En 12 meses hay 2 leads web (sep y oct 2026),
  0 con póliza viva; 54 sesiones/28 d en la web. Optimizar el formulario o la IA antes de tener visitas no mueve nada.
- **RGPD antes de captar más** [Hecho]: no hay purga de prospectos web a 12 meses (la web lo promete), los documentos de
  no clientes por `/datos` no tienen retención, el consentimiento del lead solo se valida como `true` (sin fecha, texto ni
  versión) y no hay atribución. Ampliar captación sin esto amplía el pasivo.
- **El prompt original asumía Symfony/PHP en Fly, que no existe** [Hecho]: ni un `.php` ni `composer.json`
  (`docs/TARIFICADOR-OPTIMIZACION-AUDITORIA.md:24`). Es Next.js/TS + Prisma + Supabase; Fly solo aloja el RPA y el adaptador CIMA.
- **Promesa pública incoherente** [Hecho]: la home dice «El documento no se guarda, solo sus datos»
  (`apps/asegura-web/app/page.tsx:454`) pero el portal archiva el fichero (`apps/asegura-portal/app/api/polizas/route.ts:134`,
  `guardarDocumentoPropio`). Hay que alinear texto y comportamiento antes de empujar tráfico a esa sección.
- **Ventaja competitiva real y libre** [Hecho, 8 competidores revisados por búsqueda]: ninguno ofrece «sube tu PDF →
  diagnóstico de coberturas». Ya existe base técnica (extractor, catálogo de garantías, portal con alta por correo).
- **Mayor ROI probable: retener antes que captar** [Hipótesis]: revisión anual a cartera viva reutiliza avisos de
  vencimiento y extractor; coste de adquisición cero y sin depender del tráfico.
- **SEO técnico mayormente sano; arreglos baratos concretos** [Hecho en código]: H1 de la home sin ramo/correduría,
  autor declarado en JSON-LD pero no visible, fuentes por `<link>` externo, 5 títulos largos, `og:url` heredado.
  Search Console da 403 a la automatización: sin él no hay datos de consultas ni 404.
- **Fase 1 es de gasto casi nulo en IA y alto en riesgo evitado**: RGPD + atribución + SEO barato. La subida pública con IA
  (fase 3) y la tarificación (fase 4) se posponen hasta que haya tráfico que las justifique.

## 2. Arquitectura real

[Hecho]
- `apps/asegura-web` (Next.js, Vercel, `grupoasegura.es`): web pública, **sin BD a propósito**. El lead sale por
  `app/api/lead` y se reenvía a plataforma con `x-forwarded-for`.
- `apps/plataforma` `/correduria`: pantalla de Alberto; `app/api/publico/correduria/lead/route.ts` crea `cliente` con
  `segmento='prospecto'` + aviso Telegram (`apps/asegura/lib/cartera-edicion.ts:1005`).
- `apps/asegura` (trastienda): schema `seguros`, `/api/operador/*`, Codeoscopic (tope 70 €/mes, `lib/codeoscopic/tope-euros.ts`),
  extracción (`lib/documentos/extraer-poliza.ts`, `extraer-oferta.ts`).
- `apps/asegura-portal` (`clientes.grupoasegura.es`): portal del cliente, rol sin BYPASSRLS; alta con código por correo,
  `/api/polizas` (subida + lectura IA), `/datos/[token]` (subida de documentos tras un lead de auto/moto).
- `packages/module-seguros`: `solicitud-datos.ts`, `catalogo-garantias.ts`, `vencimientos.ts`, `cartera-viva.ts`.
- Fly: `services/tarificador-rpa` (Playwright; emisión bloqueada) y el adaptador Java de CIMA.
- Analítica: PostHog + GA4 tras banner propio (`components/Analitica.tsx`, `lib/medir.ts`), 8 eventos, solo `lead_enviado` es conversión.

Contradicción resuelta (promesa «Sube tu póliza y la revisamos»): ver sección 7.2. Ambos agentes tenían razón:
la promesa existe en asegura-web, pero el fichero se sube en **asegura-portal**, no en asegura-web.

## 3. Inventario funcional

| Capacidad | Estado | Evidencia |
|---|---|---|
| Web SEO (15 ramos, 16 artículos, sitemap ~44 URL, JSON-LD) | Existe | `app/*`, `lib/ramos.ts`, `lib/articulos.ts`, `lib/seo.ts` |
| robots.txt | Existe; permite todo salvo `/api/` | `app/robots.ts:6-13` |
| Landing «Revisa tu póliza» dedicada | No existe (hay sección `#subir` en la home y `/gestor-de-seguros`) | `app/page.tsx:432` |
| Subida de póliza por no cliente | Existe en el **portal** (cuenta por correo) y en `/datos/[token]` (10 MB, 6 docs, 14 días, 20 subidas/IP) | `asegura-portal/app/api/polizas/route.ts`, `solicitud-datos.ts` |
| Extracción IA de pólizas | Existe; 2 pasadas, `null` si no consta, 20k caracteres, **sin cita de página** | `asegura-portal/lib/extraer-poliza.ts:412` |
| Extracción con cita `[[Página N]]` | Solo para ofertas | `extraer-oferta.ts:46,74` |
| Modelo de garantías `si/no/no_consta` | Existe | `catalogo-garantias.ts:70`, `coberturas-taxonomia.ts` |
| Tarificación (Codeoscopic + RPA) | Existe, con topes y emisión bloqueada | `tope-euros.ts`, `services/tarificador-rpa/` |
| Avisos de vencimiento | Existe (crons asegura y plataforma) | `vencimientos.ts` |
| Lead → CRM | Existe | ver sección 2 |
| Atribución (UTM, landing, referrer, gclid) | **No existe**; fuente siempre `'web'` | `components/Formulario.tsx:41-51` |
| Prueba de consentimiento | **No existe** (solo `true`) | `plataforma/lib/leads-web.ts:118`; `lead/route.ts:53-61` |
| Purga de prospectos a 12 meses | **No existe** | `legal/privacidad/page.tsx:500-502` |
| Retención de documentos de no clientes | **No existe** | `solicitud-datos.ts:350` |
| Medición de tiempo de primer contacto | Parcial: solo derivable de `historial_interno` | embudo, sección 4 |

## 4. Embudo real (BD central, schema `seguros`, solo SELECT, 17/10/2026)

[Hecho]
- Leads `fuente='web'`: **2** en total (sep 2026: 1, oct 2026: 1); los 12 meses anteriores, 0. Por tipo: auto 1, sin oportunidad 1.
- Con póliza viva en vigor (`esCarteraEnVigor` replicada): **0 de 2**.
- Mediana de alta a primera entrada posterior en historial: ~120,8 h (n=2). Muy por encima del objetivo < 1 h laborable.
- `solicitud_datos`: 3 emitidos, 0 con documentos subidos, 0 completados.
- `documentos`: 112 totales; 26 sin `cliente_id`; **49 de clientes sin póliza viva**, el más antiguo 29/09/2026.
- Prospectos web con más de 12 meses sin póliza: 0 (BD creada en abr-2026): la purga aún no incumple en la práctica,
  pero sí la ausencia de mecanismo.
- Otras fuentes: `venta_directa` 455 leads, `recomendacion` 3, sin fuente 22.

Lectura:
- **Conclusión [Hecho]:** con n=2 no hay tasa de conversión que optimizar; el problema es volumen de visitas.
- **Hipótesis:** el tráfico orgánico es bajo porque la home no apunta a consultas (ver 5) y el dominio es joven (DNS repuesto 12/09).
- **Recomendación:** no invertir en IA de subida pública hasta superar, p. ej., 30-50 leads/mes o tener tráfico cualificado.

## 5. SEO técnico (de `seo-tecnico.md`; lectura de código, NO medición en vivo)

Limitación [Hecho]: el proxy de la sesión rechaza `grupoasegura.es` (403) y WebFetch no resuelve DNS. Todo es lo que Next
**genera**, no lo que Vercel **sirve**.

### 5.1 Confirmado en código
- Canonical absoluto y autorreferente en todas las páginas indexables; `SITIO_URL` por defecto prod (`lib/sitio.ts:121`).
- Sitemap generado de RAMOS/ARTICULOS; ninguna URL huérfana (pie en todas las páginas).
- Sin títulos ni descripciones duplicados (0 en ramos y artículos).
- Un solo `<h1>` por página (18 `page.tsx`).
- JSON-LD coherente: InsuranceAgency + WebSite (layout); Service + FAQPage + BreadcrumbList (ramos); Article (blog).
- `/aviso/*` y vCards con noindex; `/api/` bloqueado.
- Desventajas baratas de corregir (candidatas Fase 1):
  - **H1 de la home** «Sube tus seguros. Y contrólalos.» (`app/page.tsx:231-235`) sin «correduría» ni ramo; posición media
    ~49 según comentarios del repo.
  - **Autor invisible**: el JSON-LD de artículos declara `author` (`lib/seo.ts:235`) pero la página no lo muestra
    (`app/blog/[slug]/page.tsx:72-76`); falta `image` en Article. Señal E-E-A-T débil en contenido YMYL.
  - **Fuentes** por `<link>` externo bloqueante (`app/layout.tsx:38-39,115`): migrar a `next/font/google` (autoalojado).
  - **Títulos largos** (>60 con sufijo): `calculadora-bonificacion-hipoteca/page.tsx:17` (84), `seguro-hipoteca-banco-obligatorio/page.tsx:14`
    (76), 3 artículos de blog (62-64). Descripciones >160 en 7 páginas.
  - **og:url heredado** de la home en /blog, /quienes-somos y legales (`app/layout.tsx:84`); `og:type 'article'` en ramos
    (`app/seguros/[ramo]/page.tsx:39`) debería ser `website`.
  - Home sin enlace en el cuerpo a artículos o /blog (artículos a profundidad 2).
  - Media: `host:` en robots (inocuo); `<h4>` sin h2/h3 en el pie; FAQPage sin rich result (solo gobierno/sanidad).
- Redirecciones del sitio antiguo: solo `/mejoramos-tu-seguro` (`next.config.ts:20-30`); el resto devuelve 404 [Hecho].

### 5.2 Requiere Search Console / medición externa
1. Códigos HTTP reales de las ~44 URL y procesado de `/sitemap.xml`.
2. 404 de URLs antiguas con impresiones (sin informe GSC no se sabe cuáles).
3. www→apex (308) y http→https: están en el panel Vercel, no en código; sin verificar en vivo.
4. Canibalización [Hipótesis a validar]: baja (carta + 3 artículos), siniestro (4 URL), hipoteca (2), RC (3), salud (2).
5. Canónica elegida por Google distinta de la declarada.
6. Core Web Vitals de campo: con 54 sesiones/28 d probablemente no hay datos CrUX; usar PageSpeed de laboratorio.
7. **El cron `seo_correduria` recibe 403 de GSC** (`sc-domain:grupoasegura.es`, `docs/CONTEXTO-SESIONES.md:121`).

## 6. Competencia (WebSearch 17/10/2026; no se pudieron abrir las webs: móvil y CTA NO verificados)

| Operador | Registro / dato | Enfoque (según búsqueda) | Sube PDF → diagnóstico |
|---|---|---|---|
| Rastreator | J3257 | Comparador, formulario largo | No |
| Acierto | J3208 | Comparador por matrícula; eKomi 9,6 vs Trustpilot 2,5/5 (188 reseñas) | No |
| Kelisto | J-3607 | Contenido y rankings | No |
| Selectra | Agencia vinculada AJ0260 | Guías que acaban en teléfono | No |
| CHECK24 | n/d | Solo coche | No |
| Coverfy | n/d | Agrega pólizas; actividad dudosa desde 2018 | Agrega, sin diagnóstico verificado |
| Life5 | n/d | Solo vida | No |
| Barón Seguros | J-59 | «Revisamos tu póliza gratis» en guía de hogar | Revisión manual, no automática |

[Hecho: fuente WebSearch; Hipótesis: que "No" signifique ausencia real, pues no se abrieron las webs.]

Oportunidades [Recomendación]:
1. **Subir PDF → diagnóstico** frente a formularios largos (diferencial claro).
2. **Aviso de vencimiento + carta de no renovación** (ya hay `carta-baja-seguro` y avisos).
3. **Confianza visible**: clave DGSFP en todas las páginas y reseñas honestas con fuente (la brecha eKomi/Trustpilot de Acierto muestra que importa).
4. **Ramos poco cubiertos por comparadores**: comunidades, RC profesional, decesos, vida hipoteca.
5. **Duplicidades y huecos** de cobertura entre pólizas (la revisión anual lo puede hacer).

## 7. Seguridad y RGPD

### 7.1 Hallazgos verificados (`verificador-esceptico`, todo CONFIRMADO en código; BD y pg_cron NO mirados)
- **A. Sin purga de prospectos web a 12 meses** aunque `legal/privacidad/page.tsx:500-502` lo promete.
- **B. Documentos de no clientes por `/datos`** (`solicitud-datos.ts:350` → `guardarDocumento`, `subido_por='cliente'`) sin retención.
  El único `delete` es `tarificador-purga.ts` (~143), solo capturas de fallo del agente. En BD: 49 documentos de clientes sin póliza viva.
- **C. Consentimiento del lead** solo se valida `true` (`plataforma/lib/leads-web.ts:118`); no se envía ni se guarda
  fecha, texto ni versión (`lead/route.ts:53-61`). `consent_logs` y `lead_consent_at` solo existen en DDL legado.
- **D. Sin atribución**: ni UTM, landing, referrer ni gclid (`Formulario.tsx:41-51`).
- **E.** [Hecho, plan] La privacidad de la web dice que no trata subidas ni lectura con IA (`privacidad/page.tsx:5`) mientras el lead
  de auto acaba en `/datos`, que sí las hace. Incoherencia pública.
- **F.** [Hecho, plan] Las fotos van enteras a OpenRouter (proveedor que puede procesar fuera del EEE; el portal lo avisa, la web no).
  Salud y vida en una landing pública serían datos de categoría especial (art. 9 RGPD): EIPD y, probablemente, limitar ramos.

### 7.2 Promesa «Sube tu póliza y la revisamos» (contradicción entre agentes)
[Hecho, grep en `apps/asegura-web` + lectura del portal]
- **Dónde está la promesa:** `app/page.tsx:143` (tarjeta del hero, `href: '#subir'`), `lib/sitio.ts:216` (cabecera, «Sube tu póliza»),
  sección `#subir` `app/page.tsx:432` («Súbela y la leemos por ti»), `lib/articulos.ts:503` («Gratis y sin ser cliente», botón «Guardar mis pólizas»),
  `lib/gestor.ts:56,120,130` y `/gestor-de-seguros`.
- **A dónde lleva el CTA:** a `PORTAL_URL` = `https://clientes.grupoasegura.es` (`lib/sitio.ts:55`), p. ej.
  `app/page.tsx:466` («Crear mi área con mi correo»; origen medido `home_cta`) y `app/gestor-de-seguros/page.tsx:91,198`.
  **asegura-web no tiene ningún input de fichero**: el agente que no lo encontró tenía razón sobre ese sitio.
- **Qué puede hacer un no cliente:** sí puede. El propio comentario de `app/page.tsx` (~líneas 438-446) y `asegura-portal/app/api/acceso/*`
  indican que `/api/acceso/solicitar` no consulta la cartera y `verificar` crea la identidad; luego `POST /api/polizas`
  (multipart `documento`) lee el PDF con IA. Por eso la promesa de «subir sin ser cliente» **es cierta, pero exige crear
  cuenta con correo + código**, no es un «arrastra y suelta» en la web [Hecho en código; no probado en vivo].
- **Hallazgo (promete algo que no es cierto):** `app/page.tsx:454` «El documento no se guarda, solo sus datos», con comentario
  en la sección (~l.425-430) «el fichero NO se persiste». Pero `asegura-portal/app/api/polizas/route.ts:134` llama a
  `guardarDocumentoPropio(...)` (`lib/documento-portal.ts:31`), que archiva el fichero en asegura. Si el archivado funciona,
  la afirmación es falsa; si el puente falla, la póliza se guarda igual (l.128-131). **Riesgo RGPD/transparencia** [Hecho en código;
  que el archivado esté activo en producción es Hipótesis: no se miró la BD ni el env].
- **Hallazgo menor:** el hero promete «Un PDF o una foto, sin teclear» (`page.tsx:146`) y la tarjeta enlaza a `#subir`, que a su vez
  pide crear cuenta: fricción de un paso más que el copy no anuncia en la tarjeta.

### 7.3 Medidas existentes y a reforzar
- [Hecho] Subida por token: 10 MB, 6 documentos, enlace de 14 días, 20 subidas por IP; Codeoscopic con tope 70 €/mes.
- [Recomendación] Interruptor de gasto de OpenRouter para cualquier subida pública (diario y mensual, bloqueante, aviso Telegram),
  tipo MIME por bytes (no por extensión), rechazar PDFs cifrados o con JavaScript, Turnstile además del límite por IP,
  y nunca datos de póliza a PostHog/GA4.

## 8. Repos de referencia

| Repo | Licencia | Veredicto |
|---|---|---|
| `extend-hq/ui` | MIT | **Copiar**: visor PDF con citas por bounding box y componente de subida. Comprobar coste de Tailwind en asegura-web. |
| `shadcnstore/shadcn-dashboard-landing-template` | MIT (Tailwind v4 + Base UI) | Solo inspiración |
| `elleskay/insurance-dashboard` | n/d | 404, descartado |
| `lucasdengcn/ai-insurance-demo` | MIT (1 estrella) | Solo inspiración de flujo; no copiar código |

## 9. Plan priorizado (reordenado por el dato de tráfico)

### Fase 1 · RGPD + atribución + SEO barato (ya; poco código, riesgo evitado alto)
1. **Retención**: cron de purga de prospectos web a 12 meses y de documentos de `/datos` sin póliza (plazo: decisión de Alberto,
   recomendado 30 días). Cepo visto en rojo.
2. **Consentimiento**: guardar versión del texto, fecha, IP truncada y finalidad; separar «tratar mi solicitud» de «comunicaciones comerciales».
3. **Coherencia legal**: alinear privacidad de la web con el flujo real y corregir `app/page.tsx:454` (o cambiar el comportamiento del portal).
4. **Atribución**: `utm_*`, landing, referrer y `gclid` en cookie first-party → `api/lead` → plataforma → columnas o `historial_interno`
   (localizar el modelo con `correduria-crm`).
5. **SEO barato**: H1 de la home con ramo/correduría, autor visible + `image` en Article, `next/font`, recortar 5 títulos y 7 descripciones,
   `og:url` por página y `og:type` correcto, enlazar /blog desde el cuerpo de la home.
6. **Medición**: eventos de embudo (inicio_subida, subida_ok, solicitud_revision) sin datos de póliza; medir tiempo hasta primer contacto
   y añadir recordatorio si nadie contesta (hoy ~120,8 h).
7. Corregir `.claude/skills/agente-correduria/SKILL.md:49` («Fly de Manuel»), contradice a `cima-ingesta` [Hecho, plan].

### Fase 2 · Retener + contenido (sin depender de tráfico)
1. **Revisión anual a cartera viva** (`esCarteraEnVigor()`): reutilizar avisos de vencimiento + extractor + catálogo. Retención y venta cruzada a coste cero.
2. Landing `/revisar-mi-poliza` y 6-8 guías citables (qué revisar antes de renovar, franquicia vs sublímite…) con autor visible y fecha de revisión;
   foco en ramos poco cubiertos (comunidades, RC profesional, decesos, vida hipoteca).
3. Clave DGSFP visible y reseñas reales de Google Business (nunca en schema sin fuente).
4. Medición mensual con el tracker de OpenSEO (créditos: decisión).

### Fase 3 · Subida pública con IA (solo si hay tráfico; ver umbral en sección 4)
- Reutilizar `/datos/[token]` + `extraerPoliza` + `CATALOGO_GARANTIAS`; token tras dejar correo o teléfono.
- Excluir salud y vida al principio. Interruptor de gasto, bytes del fichero, Turnstile.
- Cita de página `[[Página N]]` (patrón de `extraer-oferta.ts`) y visor de `extend-hq/ui`; juego de 15-20 pólizas sintéticas con métricas de exactitud.

### Fase 4 · Tarificación (última)
- Codeoscopic / RPA **siempre con revisión humana previa** y con los topes actuales; oferta con el extractor de ofertas;
  registrar resultado comercial y motivo de pérdida. WhatsApp como canal de subida [Hipótesis] solo tras medir.

## 10. Decisiones de Alberto

1. **Search Console**: dar acceso al cron `seo_correduria` sobre `sc-domain:grupoasegura.es` (hoy 403) y exportar el informe de 404.
2. **Comprobación externa de redirecciones**: ejecutar fuera de esta sesión `curl -I` de `http://`, `www.` y las ~44 URL del sitemap (el proxy bloquea el dominio).
3. **Créditos OpenSEO** para la base de visibilidad en IA (~20 consultas) y el tracker mensual.
4. **Plazo de retención** de documentos de no clientes (recomendado: 30 días sin póliza) y confirmar 12 meses para prospectos web.
5. **Excluir salud y vida** de la subida pública al principio (recomendado: sí).
6. **Asesoría legal** (DPO o abogado) para el texto de consentimiento y la EIPD; no la cierra un agente.
7. **Texto de la home sobre «el documento no se guarda»**: ¿corregir el texto (el portal archiva) o cambiar el comportamiento?
8. Umbral de tráfico a partir del cual abrir la Fase 3.
9. Qué mirar en BD/pg_cron aún no revisado (jobs de purga existentes fuera del repo).
