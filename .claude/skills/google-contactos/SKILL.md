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
- Pantalla (plataforma `/correduria/google-contactos`, menú «…» → «Google Contactos»): `GoogleContactosConexion.tsx`
  (estado + Conectar/Reconectar/Desconectar), `GoogleContactosSimulacion.tsx`, `GoogleContactosRevision.tsx`; en Clientes
  solo `AvisoGoogleContactos.tsx`. Conectar = ticket de un solo uso (`apps/asegura/lib/google-oauth-ticket.ts`, POST
  `/api/operador/google-contactos/ticket`, migración `2026-10-05c`); el callback vuelve a esa vista sin sesión de asegura.
- Selección (cartera + leads + compañías 🔵, nota/URL/⏰/cumpleaños) → `apps/asegura/lib/contactos-google.ts`
- Migración schema → `apps/asegura/prisma/sql/2026-10-05b_google_contactos.sql`

## Adopción y campos extra (05/10/2026)
- **Adopción:** fuera de la etiqueta, mismo E.164 (cualquiera de sus teléfonos) + mismo nombre (sin «· AS …» ni
  emojis) o sufijo del .vcf → se adopta (origen `adoptado`, entra en la etiqueta, nunca se borra). Mismo teléfono y
  otro nombre, o varios contactos → cola, sin crear. Tests: `google-contactos-adopcion.test.ts`.
- **🔵 compañías** (`compania:<uuid>`), **⏰** (vence en ≤30 días), **nota** (solo el bloque `— Grupo ASegura —`;
  editarlo en Google no va a cola), **URL** de la ficha, **cumpleaños** (`fecha_nacimiento` descifrada; sin ella no
  se toca). Tests: `google-contactos-extras.test.ts`.

## Unificar, mote, estados y «Ordenar agenda» (05/10/2026, migración `2026-10-05d`)
- **Unificar** (cola, solo `duplicado_ambiguo` con `motivo` inequívoco: `nombre_distinto`/`mismo_email`/`mismo_nombre`):
  vínculo pendiente (`hash_enviado='pendiente:unificar'`, origen `adoptado`) + **mote** = su nombre de agenda limpio
  (`limpiarMote`); «Unificar con nombre del CRM» sin mote. Antes de crear, mismo correo/nombre fuera de la etiqueta → cola.
- **Mote** (`seguros.cliente_mote`, AISLADO; guardián `test/regression-mote-aislado.test.ts`): contacto «🟢 mote», nota «Ficha: …».
- **Estados**: 🚨 siniestro abierto > 💶 recibo devuelto > ⏰ (máx. 2 emojis); ⚪ ex-cliente solo si ya tenía vínculo.
  Tests: `google-contactos-{unificar,estados,ordenar}.test.ts`. «Ordenar agenda»: `GET …/google-contactos/ordenar` (solo lectura).

## Un número, un contacto y «Añadir a la ficha» (05/10/2026, migración `2026-10-05e`)
- Teléfono compartido → UN contacto (la persona; titular elegido en la cola o `tipo_persona`), las demás fichas como
  organization «también» + nota. Nunca fusiona fichas ni borra en Google (la secundaria sobrante se desvincula limpia).
- Dato del contacto que la ficha NO tiene → cola «Añadir a la ficha» (`anadirContacto`). Detalle en el doc.

## 🚨 No romper

1. **Gmail personal sin DPA.** Decisión cerrada por Alberto el 05/10/2026; revierte la nota de
   `vcard.ts` del 23/09. El CRM funciona sin validación GDPR explícita en Google.
2. **Alcance cerrado:** solo selección de `apps/asegura/lib/contactos-movil.ts` (cartera viva +
   leads), tope Google 25.000 contactos.
3. **El CRM manda.** Cambios en Google van a la cola `seguros.google_contactos_revision`;
   revisión y activación manual. No se usan conectores de Claude.
4. **Reconectar la MISMA cuenta no revoca el token.** Revoke mata el grant entero. Reconexión =
   nuevo token sin limpiar el viejo.
5. **El CRM solo gestiona su entrada (teléfono/correo/organización/URL, el BLOQUE de la nota y el
   cumpleaños si lo sabe).** El resto de Google se conserva. Nunca borrar en Google salvo origen `creado`.
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
