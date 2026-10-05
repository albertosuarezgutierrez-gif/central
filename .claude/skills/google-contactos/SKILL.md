---
name: google-contactos
description: >
  Sincronización de cartera ↔ Google Contacts (agenda del móvil/WhatsApp). Úsala ANTES de tocar
  el CRM de contactos, si Alberto dice que no le sale un nombre de cliente al llamar/WhatsApp,
  hay duplicados en la agenda, la cola de revisión de Google está atascada, o el cron
  `google-contactos` falla. Router: el detalle vive en docs/GOOGLE-CONTACTOS-ASEGURA.md.
---

# Google Contacts (router)

**Lee primero `docs/GOOGLE-CONTACTOS-ASEGURA.md`** (flujo, reglas de sincronización, diagnóstico,
landmines, estado). Después, según lo que toques:

- Lógica pura (transformación de datos) → `packages/module-seguros/src/google-contactos.ts` y
  `telefono-e164.ts`
- App (autenticación OAuth, endpoints) → `apps/asegura/lib/google-*.ts`
- Rutas API → `apps/asegura/app/api/google-contactos/{conectar,callback}`,
  `app/api/cron/google-contactos`, `app/api/operador/google-contactos/*`
- Pantalla de revisión (`/correduria`) → `GoogleContactosRevision.tsx` de `apps/plataforma`
- Migración schema → `apps/asegura/prisma/sql/2026-10-05b_google_contactos.sql`

## 🚨 No romper

1. **Gmail personal sin DPA.** Decisión cerrada por Alberto el 05/10/2026; revierte la nota de
   `vcard.ts` del 23/09. El CRM funciona sin validación GDPR explícita en Google.
2. **Alcance cerrado:** solo selección de `apps/asegura/lib/contactos-movil.ts` (cartera viva +
   leads), tope Google 25.000 contactos.
3. **El CRM manda.** Cambios en Google van a la cola `seguros.google_contactos_revision`;
   revisión y activación manual. No se usan conectores de Claude.
4. **Reconectar la MISMA cuenta no revoca el token.** Revoke mata el grant entero. Reconexión =
   nuevo token sin limpiar el viejo.
5. **El CRM solo gestiona su entrada (teléfono/correo/organización).** El resto de Google se
   conserva. Nunca borrar en Google salvo origen `creado`.
6. **Retirada masiva bloqueada:** >50 contactos o >10% del total. Ahí se para y se avisa.
7. **Si la clave PII no abre la cartera no se escribe nada.** Falla silenciosa de encriptación =
   modo lectura.
8. **Google OAuth app en «Producción» sin verificar.** Proyecto `grupo-asegura-contactos`,
   redirect `https://central-asegura.vercel.app/api/google-contactos/callback`, env
   `GOOGLE_CONTACTOS_{CLIENT_ID,CLIENT_SECRET,REDIRECT_URI,STATE_SECRET}`.
9. **Primera sincronización:** conectar → simular → revisar → activar (nunca directo).
10. **Diagnóstico rápido:** `GET /api/operador/google-contactos` da estado; `invalid_grant` →
    reconectar; `503 sin_muestra` → revisar `PII_ENCRYPTION_KEY`; `500` por tope 25.000
    contactos.
