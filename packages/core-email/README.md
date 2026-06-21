# @iarest/core-email

Núcleo de **email saliente** compartido de la casa de marcas. Construye el
`Transporter` de [`nodemailer`](https://nodemailer.com/) desde variables de
entorno, con **timeouts de serverless** (para no colgar la función de Vercel). El
`from`/`to`/`html` y el envío en sí los pone cada vertical.

- `createMailTransporter()` — multi-proveedor por preferencia: **Resend**
  (`RESEND_API_KEY`) → **SMTP** genérico (`SMTP_USER`/`SMTP_PASSWORD`, IONOS por
  defecto) → **Gmail** (`GMAIL_USER`/`GMAIL_APP_PASSWORD`). `null` si no hay credenciales.
- `gmailTransporter()` — Gmail explícito (para verticales que SOLO usan Gmail).
- `MAIL_TIMEOUTS` — los timeouts compartidos.

```ts
import { createMailTransporter } from '@iarest/core-email'

const t = createMailTransporter()
if (!t) return // sin proveedor → no enviado
await t.sendMail({ from: `"Empresa" <hola@ialimp.es>`, to, subject, html })
```

Consumido por `apps/ialimp` (`lib/mailer.ts`, multi-proveedor) y `apps/sivra`
(rutas de alertas/resumen, Gmail explícito). Depende de `nodemailer` (resuelta por
pnpm en el propio paquete).
