# Landing ialimp.es

Código fuente de la landing pública **ialimp.es** (proyecto Vercel `ialimp-landing`).
Es una web estática (HTML/CSS, sin framework). Hasta ahora se subía por CLI sin estar en
git; este directorio es la fuente de verdad versionada.

## Contenido
- `index.html` — landing principal (incluye el formulario de contacto).
- `api/contacto.js` — función serverless del formulario (Vercel la despliega automáticamente).
- `package.json` — declara `nodemailer` (única dependencia, la usa la función para enviar por SMTP). No hay paso de build.
- `aviso-legal.html` — aviso legal (LSSI art. 10).
- `privacidad.html` — política de privacidad (RGPD).
- `cookies.html` — política de cookies.
- `fetch-fonts.sh` — descarga Nunito (woff2) a `fonts/` para auto-alojar la tipografía.
- `fonts/` — tipografías auto-alojadas (los `.woff2` se generan con el script; no van en git).

## Formulario de contacto
La landing **no da acceso a la app**; el único CTA es el formulario de contacto (nombre, email
y teléfono obligatorios + aceptación de la política de privacidad). Al enviarlo, `api/contacto.js`
manda un aviso por email a `alberto.suarez.gutierrez@gmail.com` (remitente `hola@ialimp.es`,
`reply_to` = email del visitante). Lleva honeypot anti-spam y validación en cliente y servidor.

**Proveedor de envío** (mismo orden que la app en `lib/mailer.ts`):
1. **Resend** — si está `RESEND_API_KEY` (HTTP). Requiere el dominio `ialimp.es` **verificado en Resend** (DNS).
2. **IONOS / SMTP** — si están `SMTP_USER` + `SMTP_PASSWORD` (buzón `hola@ialimp.es`). Host/puerto por
   defecto `smtp.ionos.es:465` (override con `SMTP_HOST` / `SMTP_PORT`). **No** requiere verificar DNS.

> **Requisito (una vez):** añadir en el proyecto Vercel `ialimp-landing`
> (Settings → Environment Variables → Production) **uno** de los dos juegos de variables:
> `RESEND_API_KEY`, **o** `SMTP_USER` + `SMTP_PASSWORD` (IONOS). Sin ninguno, el formulario no
> puede enviar y muestra el fallback «escríbenos a hola@ialimp.es».

## Cumplimiento
- La web **no instala cookies de seguimiento ni analítica** → no requiere banner de consentimiento.
- La tipografía se sirve **auto-alojada** (sin Google Fonts) → no se transfieren datos a terceros.
- El formulario exige aceptar la política de privacidad; el email se envía con el proveedor de
  correo (IONOS o Resend) como encargado del tratamiento (recogido en `privacidad.html`).
- Incluye aviso legal, política de privacidad y política de cookies, enlazados en el footer.

## Desplegar a ialimp.es

### Automático (GitHub Actions) — recomendado
El workflow `.github/workflows/deploy-landing.yml` despliega esta carpeta al proyecto
Vercel `ialimp-landing` en cada push a `main` que toque `landing/ialimp-es/` (o a mano
desde la pestaña **Actions → Deploy landing → Run workflow**).

Requisito (una vez): añadir el secreto **`VERCEL_TOKEN`** en
GitHub → Settings → Secrets and variables → Actions. El token se crea en
Vercel → Account Settings → Tokens. (Los IDs de equipo/proyecto ya van fijos en el workflow.)

### Manual (tu terminal)
1. Generar las fuentes (una vez, con red):
   ```bash
   bash fetch-fonts.sh
   ```
2. Desplegar a producción en el proyecto Vercel `ialimp-landing` (desde esta carpeta):
   ```bash
   npx vercel deploy --prod
   ```
   (Vincula este directorio al proyecto `ialimp-landing` la primera vez con `npx vercel link`.)
