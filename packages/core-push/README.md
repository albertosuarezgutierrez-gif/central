# @iarest/core-push

Núcleo de **Web Push** compartido de la casa de marcas. Envoltura **pura e
identity-agnostic** sobre [`web-push`](https://www.npmjs.com/package/web-push):
configura las claves VAPID, envía **una** notificación y reporta si la
suscripción está muerta (404/410) para que el llamante la borre.

No contiene BD, ni estado de inquilino, ni la forma del payload de negocio: el
**scope** (qué suscripciones), el **payload** y el **borrado** de las muertas los
pone cada vertical.

```ts
import { sendWebPush } from '@iarest/core-push'

const res = await sendWebPush(
  { publicKey, privateKey, subject: 'mailto:hola@ialimp.com' },
  { endpoint, keys: { p256dh, auth } },
  { title: 'Nueva limpieza', body: 'Piso Galindo · 11:00' },
)
if (res.gone) await borrarSuscripcion(endpoint) // 404/410 = endpoint muerto
```

Es el **primer núcleo con dependencia npm propia** (`web-push`); funciona porque
pnpm workspaces symlinkea las deps de cada paquete (el enfoque `file:` deps no
las resolvía en el build de Vercel). Consumido por `apps/ialimp` y `apps/ia-rest`.
