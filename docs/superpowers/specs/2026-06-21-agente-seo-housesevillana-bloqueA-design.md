# Agente SEO de housesevillana.es — paridad con ia-rest (Bloque A)

> Estado: diseño aprobado (2026-06-21). Pendiente plan de implementación.
> Vertical: `apps/sivra`. Web objetivo: landing **estática** `housesevillana.es`
> (repo aparte `house-sevillana-landing`, fichero `app/route.ts`, editado por GitHub API).

## 1. Objetivo

Subir el agente SEO de housesevillana.es (`/api/seo-refresh`, ya autónomo por cron
semanal tras PR #419) al nivel del agente de ia-rest **en lo que permite una landing
estática**: misma **red de seguridad** (kill switch + snapshot/revert) y schema, sin
depender de configuración externa.

**Diferencia arquitectónica clave (no es opcional entenderla):** housesevillana es una
landing estática de **un solo fichero** en un repo externo. NO aplica el modelo de
ia-rest de "cambios como datos en BD + `generateMetadata` + bloques + artículos por
ruta". Aquí el agente solo puede editar title/description/OG (+ JSON-LD) de ese fichero
vía commit. La "paridad" se traduce en: **seguridad + reversibilidad + schema**, no en
estructura de datos.

**Fuera de alcance (Bloque B, fase posterior):** conectar Google Search Console + GA4
de housesevillana.es para optimizar con datos reales de rendimiento. Requiere OAuth de
Alberto (mismo trabajo que la Fase 0 de ialimp; se compartirá la fontanería GSC/GA4).
Hoy el análisis seguirá basándose en competencia (`aiSearch` → Gemini/Google).

## 2. Estado de partida (lo que ya existe)

- `apps/sivra/app/api/seo-refresh/route.ts`: lee la landing (GitHub), analiza con
  `aiSearch` (pasarela central / Gemini, fallback NIM), reescribe title/desc/OG,
  commitea, y registra en `SeoProposal`. Cron semanal (lunes 10:00) + auth
  `Bearer CRON_SECRET` o sesión. (Hardening de la lectura ya hecho en #419.)
- Modelo Prisma `SeoProposal` (`seo_proposals`): `title, description, ogDescription,
  schemaDescription?, topCompetitors?, analysis, currentTitle, currentDescription,
  token, status (PENDING|APPLIED|REJECTED), createdAt, appliedAt`.
- `app/(dashboard)/seo/page.tsx`: historial + botón "Actualizar SEO ahora".
- **Bloqueante de despliegue (ya documentado):** falta `GITHUB_TOKEN` en el Vercel de
  sivra con acceso al repo de la landing. Sin él, el endpoint devuelve error claro.

## 3. Cambios (Bloque A)

### 3.1 Kill switch
- Env `SEO_AGENT_ENABLED` (sivra). El **cron autónomo** (llamada con `Bearer
  CRON_SECRET`) solo actúa si `=== 'true'`; en caso contrario responde
  `{ ok:false, msg:'SEO_AGENT_ENABLED != true' }` sin tocar nada.
- El **botón manual** (con sesión `auth()`) funciona siempre, ignorando el switch
  (es una acción humana deliberada). El switch frena solo lo automático.

### 3.2 Snapshot completo + revertir
- **Migración aditiva** (`seo_proposals`): añadir `currentOgDescription String?` para
  capturar el OG anterior (hoy solo se guardan title/desc previos). Añadir valor
  `REVERTED` al enum `SeoStatus`.
- `seo-refresh` ya extrae el OG actual (`extractSeoParams` devuelve `ogDescription`);
  basta **persistirlo** en la nueva columna `currentOgDescription` al crear la propuesta.
- **Endpoint `/api/seo-revert`** (POST `{ id }`, solo sesión `auth()`):
  1. Lee la landing actual (reusa `fetchLanding` ya endurecido).
  2. Re-aplica los valores **anteriores** de esa propuesta (`currentTitle`,
     `currentDescription`, `currentOgDescription`) con `applySeoReplacements`.
  3. Commitea (reusa `pushToGitHub`).
  4. Marca la propuesta como `REVERTED`.
  - Errores claros (faltan datos de "antes", fallo de GitHub, etc.).
- **UI** (`/seo`): botón "Revertir" en cada entrada con `status === 'APPLIED'`; al
  pulsarlo, POST a `/api/seo-revert` y refresco del historial. Indicador del estado
  `REVERTED`.

### 3.3 JSON-LD / schema (mejor esfuerzo, conservador)
- El análisis (`runSeoAnalysis`) pasa a devolver además un objeto `schema` (JSON-LD
  tipo `VacationRental`/`LodgingBusiness` para House Sevillana).
- En `applySeoReplacements`: **solo si la landing ya contiene un bloque
  `<script type="application/ld+json">…</script>`**, se reemplaza su contenido por el
  nuevo JSON-LD. **Si no existe, NO se inserta** (la landing es un string con comillas
  escapadas en un repo no visible desde aquí → insertar es frágil): en ese caso se
  guarda el JSON-LD en `SeoProposal.schemaDescription` y se sigue, sin arriesgar la
  landing. Decisión consciente de no romper producción.

### 3.4 Análisis más rico (menor)
- Ampliar el prompt de `runSeoAnalysis` con 1-2 consultas de competencia adicionales y
  pedir explícitamente `top_competitors` con motivo de ranking (ya en el esquema JSON).

## 4. Componentes y límites

| Unidad | Qué hace | Cambia |
|---|---|---|
| `app/api/seo-refresh/route.ts` | + kill switch en path cron, + captura OG actual, + schema en análisis y replace condicional | Modificar |
| `app/api/seo-revert/route.ts` | Revierte una propuesta (re-commit del "antes") | Crear |
| `prisma/schema.prisma` | `currentOgDescription String?`, enum `REVERTED` | Modificar |
| migración SQL (`seo_proposals`) | columna nueva + valor de enum | Aplicar (Supabase) |
| `app/(dashboard)/seo/page.tsx` | botón Revertir + estado REVERTED | Modificar |

## 5. Variables de entorno
- Reutiliza: `GITHUB_TOKEN` (pendiente de poner en Vercel sivra), `CRON_SECRET`,
  `NVIDIA_API_KEY`/pasarela (ya configuradas).
- **Nueva:** `SEO_AGENT_ENABLED` (kill switch). Sin ella o `!= 'true'`, el cron no actúa.

## 6. Criterios de éxito
- Con `SEO_AGENT_ENABLED != 'true'`, el cron sale sin commitear; el botón manual sí actúa.
- Tras una actualización, "Revertir" deja la landing con el title/desc/OG previos y la
  propuesta queda `REVERTED`.
- El agente nunca rompe la landing por culpa del JSON-LD (solo reemplaza si ya existe).
- `tsc --noEmit` + `next build` de sivra en verde; migración aplicada y verificada.

## 7. Riesgos
- **Landing no inspeccionable** desde este repo (repo externo) → el JSON-LD se hace
  conservador (solo-reemplazo). El revert depende de que `applySeoReplacements` case
  los mismos patrones que la escritura (mismos regex; cubierto al reusar las funciones).
- **DB compartida** con ialimp: el cambio en `seo_proposals` es **aditivo** (columna
  nullable + valor de enum) → seguro para ambas apps. Validar que `seo_proposals` no la
  usa ialimp (es tabla del schema de sivra/Prisma).
- Sin `GITHUB_TOKEN` configurado, todo el flujo (incl. revert) devuelve error claro.
