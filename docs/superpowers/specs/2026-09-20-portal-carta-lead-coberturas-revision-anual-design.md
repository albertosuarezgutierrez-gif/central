# Portal → correduría: seis ideas tras el gestor de pólizas (20/09/2026)

Continuación del gestor de pólizas como imán de leads (PR #3104). Alberto: «Haz todas en el orden
que veas mejor». Cinco se implementan aquí; la sexta queda bloqueada a propósito.

## 1. Embudo PostHog en `asegura-web` (`lib/medir.ts`)

Tres eventos con lista CERRADA (`EVENTOS`): `calculadora_calculo` (primera vez que la calculadora
de vencimientos tiene un resultado con fecha, una por visita), `cta_portal_click` (cualquier botón
al portal, con `origen`: cabecera, calculadora, home_cliente, home_cta, gestor_arriba, gestor_abajo,
blog_cta) y `lead_enviado` (el formulario respondió ok, con `ramo`). `medir()` lee `window.posthog`
y sin él no hace NADA: ni cola ni `localStorage` — es el mismo fail-closed que `puedeMedir()`. Nunca
viajan datos personales. `<EnlaceMedido>` envuelve el `<a>`. Cepos en `lib/medir.test.ts`.

## 2. La carta de no renovación como señal de lead

Columnas `carta_generada_en` / `carta_enviada_en` en `portal_poliza_declarada`. `AccionesCarta`
manda `POST /api/polizas/[id]/carta` (`generada` al primer copiar/imprimir/abrir correo; `enviada` /
`enviada_deshacer` con la casilla «Ya la he enviado»). `updateMany` filtrado por `identidadId`; el
corredor en vista de solo lectura recibe 403. El módulo (`lead-declarada.ts`) añade `senalCarta`
(`ninguna|generada|enviada`): **enviada = urgente siempre** (ventana pasada o no) y la lista se
ordena enviada > generada > resto. `apps/asegura` lo lee; plataforma pinta el badge.

## 3. Coberturas leídas del PDF → solapamientos con las declaradas

`coberturas jsonb` en `portal_poliza_declarada`. El extractor pide `"coberturas": string[]|null`
(solo las contratadas) y `normalizarCoberturasLeidas()` (`lib/coberturas-leidas.ts`) limpia:
`null` = no leído, `[]` = leído y ninguna — no se confunden. La bóveda mete las declaradas en
`detectarSolapamientos()` junto a las de cartera; `Solapamientos` enlaza cada una a su ficha real.

## 4. Revisión anual (cron mensual, APAGADO por defecto)

`tocaRevisionAnual()` (`packages/module-seguros-portal/src/revision-anual.ts`, puro): consentimiento
comercial afirmativo y vigente para `VERSION_TEXTO_COMERCIAL` (null NO es sí), ≥330 días desde la
última (`revision_anual_enviada_en` en `portal_identidad`), y ≥1 vencimiento en 90 días (cartera viva
en vigor + declaradas). `apps/asegura/app/api/cron/revision-anual` (`0 9 1 * *`) cuenta y no manda
sin `ASEGURA_REVISION_ANUAL_ACTIVA=1`. El texto (`texto-revision-anual.ts`) no promete ahorro ni
precio y dice cómo dejar de recibirlo. **Encenderlo es decisión de Alberto** tras ver el ensayo.

## 5. Guías de siniestro por ramo

Tres artículos nuevos en `lib/articulos.ts` (coche, fuga de agua en el hogar, autorización en
salud), con CTA a `/siniestro`. Sin citar el art. 16 LCS por número (no está en `NORMAS_CITABLES`).

## 6. Serie de emails por compañía — BLOQUEADA

No se monta hasta que Alberto verifique los canales de aviso (qué compañías y por dónde). Sin eso
sería un mailing sin destinatario confirmado.

## Migración

`apps/asegura-portal/prisma/sql/2026-09-20_portal_carta_coberturas_revision.sql`, aplicada a
`wswbehlcuxqxyinousql` antes de declarar las columnas en los dos schemas de Prisma.
