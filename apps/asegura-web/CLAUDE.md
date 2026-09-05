# CLAUDE.md — apps/asegura-web (web pública de marketing de Grupo ASegura)

> ✍️ **El nombre comercial se escribe «Grupo ASegura», con A y S mayúsculas** (dictado por Alberto,
> 04/09/2026). El monograma «AS» del logo es el nombre: A de Alberto, S de Suárez.

> **Tercera app de la correduría, y la única que ve alguien que AÚN NO es cliente:** `apps/asegura`
> es el panel del CORREDOR (Alberto la trabaja de verdad desde `apps/plataforma` → `/correduria`),
> `apps/asegura-portal` la ve el ASEGURADO, y esta la ve un visitante que llega buscando seguro.

## Qué es (nacida 04-05/09/2026)

Web de marketing destinada al **apex `grupoasegura.com` + `www`**, que estaban LIBRES.
`app.grupoasegura.com` sirve el CRM de Manuel y **no se toca**. Plan y diagnóstico completos en
`docs/ASEGURA-MARKETING-PLAN.md`.

## 🚨 NO tiene base de datos, a propósito

Sin Prisma, sin rol de BD propio, sin secreto de sesión. Es una app de solo lectura de contenido +
un formulario. El lead sale por `POST /api/lead` (`app/api/lead/route.ts`), que **reenvía desde el
servidor** al canal que ya existe: `/api/publico/correduria/lead` de plataforma → puerto de
`apps/asegura` → Telegram. Propaga `x-forwarded-for` con la IP real del visitante **a propósito**:
si no, el límite de 6 leads/hora por IP de plataforma pasaría a ser GLOBAL (compartido por todos los
visitantes detrás del mismo servidor) y el séptimo lead legítimo de la hora se rechazaría solo.

## De dónde saca sus datos — nunca a mano

- **Mediador** (razón social, DGSFP, dirección del anuncio legal): de `MEDIADOR` en
  `@central/module-seguros`. Ni la clave DGSFP se escribe en esta app.
- **Colores/tipografía**: de `MARCA_ASEGURA` en `@central/brand`. Ni un hex se escribe aquí.
- `HORARIO` y el teléfono de contacto están **ausentes a propósito** mientras Alberto no los
  confirme — no inventar un horario ni un número para "que se vea completo".

## Los dos guardianes propios

- **`lib/ramos.test.ts`** — el copy no puede prometer ahorros ni superlativos de precio. Prometerlo
  convertiría el texto en asesoramiento y arrastraría obligaciones de análisis objetivo + IPID
  (RDL 3/2020). Si un cambio de copy tienta a decir "el más barato" o "ahorra X€", el test debe
  seguir en rojo hasta que se reformule.
- **`lib/contrato-lead.test.ts`** — lee el fuente de plataforma y compara la lista de ramos que
  ofrece el formulario contra la que plataforma acepta. Si divergen, el visitante elige un ramo que
  plataforma rechaza con 422 y **el lead se pierde en silencio** (sin error visible para nadie).

## Infra

`vercel.json` con `ignoreCommand` a `scripts/vercel-ignore-build.mjs apps/asegura-web
--sin-previews` (como el resto de apps salvo ialimp) y `regions: ["fra1"]`. Está en la matriz de
`.github/workflows/tests.yml` (`Typecheck · asegura-web`) desde su alta el 05/09/2026.

Para el resto de la correduría (cartera, ingesta CIMA, portal del cliente) ver `apps/asegura/CLAUDE.md`
y `apps/asegura-portal/CLAUDE.md`. Para el análisis de mercado/canal que motivó esta app, `docs/ASEGURA-MARKETING-PLAN.md`.
