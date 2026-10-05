# Google Contacts ↔ CRM (Grupo ASegura) — alta y operación

El CRM es la fuente de verdad. Cron horario `/api/cron/google-contactos` (apps/asegura) empuja al grupo
**«Grupo ASegura»** la misma selección que el .vcf del móvil (clientes en vigor + leads de Vencimientos, sin fusionadas).
Solo se tocan contactos de ese grupo. Lo editado en Google sobre un campo gestionado se vuelve a pisar y queda en
`seguros.google_contactos_revision`; un contacto nuevo en el grupo es una propuesta de lead, nunca un alta.
Lógica: `packages/module-seguros/src/google-contactos.ts`. SQL: `apps/asegura/prisma/sql/2026-10-05b_google_contactos.sql` (gate DDL).

## Google Cloud Console (una vez, con el Gmail de Alberto)
1. console.cloud.google.com → proyecto nuevo (p. ej. «asegura-contactos»). Sin facturación: People API es gratis.
2. APIs y servicios → Biblioteca → **People API** → Habilitar.
3. Pantalla de consentimiento OAuth → tipo **Externo** → nombre de la app, correo de soporte, dominio autorizado del
   despliegue de asegura. Scopes: `.../auth/contacts` (sensible), `openid`, `email`. Usuarios de prueba: el Gmail.
4. **Publicar la app → «En producción»** (sin verificar). Con la app en «Prueba» el refresh token caduca a los 7 días.
   Sin verificar Google enseña «Google no ha verificado esta app» → Avanzado → Ir a la app (límite 100 usuarios: sobra).
5. Credenciales → Crear ID de cliente OAuth → **Aplicación web** → URI de redirección autorizado:
   `https://<dominio de asegura>/api/google-contactos/callback` (exacto, el mismo valor que `GOOGLE_CONTACTOS_REDIRECT_URI`).

## Variables de entorno (proyecto Vercel de apps/asegura; luego Redeploy)
- `GOOGLE_CONTACTOS_CLIENT_ID`, `GOOGLE_CONTACTOS_CLIENT_SECRET` — del paso 5.
- `GOOGLE_CONTACTOS_REDIRECT_URI` — la URI del paso 5.
- `GOOGLE_CONTACTOS_STATE_SECRET` — aleatorio largo (firma el `state` anti-CSRF del OAuth).
- Ya existentes y obligatorias: `PII_ENCRYPTION_KEY` (cifra el refresh token en BD), `PII_LOOKUP_KEY`, `CRON_SECRET`,
  `ASEGURA_OPERADOR_SECRET`. El refresh token NUNCA va en una env.

## Uso
- Conectar: abrir en el navegador, con sesión de asegura, `https://<asegura>/api/google-contactos/conectar`.
- Estado: `GET /api/operador/google-contactos`. Desconectar: `POST /api/operador/google-contactos/desconectar`
  `{ "borrarContactos": true|false }` (revoca en Google y borra el token; con `true` borra solo los contactos que CREÓ el CRM; los vinculados por teléfono/id eran de Alberto y se quedan).
- ¿Quién llama?: `GET /api/operador/llamada?tel=600112233` (índice ciego, solo lectura).
- Cola de revisión: plataforma → /correduria → Clientes («Google Contacts: revisión»), puerto
  `GET|POST /api/operador/google-contactos/revision` (50 por página por cursor; acciones `aceptar_lead`, `descartar`,
  `mantener_crm`). Ninguna toca el vínculo ni Google: «Mantener CRM» sobre un sacado del grupo NO lo recrea.
- Teléfono/correo ausente en el CRM (p. ej. lead con baja de WhatsApp) NO vacía el de Google: se conserva.

## Límites
- **Google admite 25.000 contactos por cuenta (incluidos los personales).** Si la sincronización los superaría, se
  aborta con error y no escribe nada. Escrituras por lotes de 200, máx. 25 lotes por hora (la primera carga puede
  tardar varias horas); 429/5xx con backoff; syncToken caducado (7 días sin uso) → resync completo.
- Si la clave PII no abre la cartera, el cron responde `pii_no_descifra` y no toca Google (si no, borraría teléfonos).
