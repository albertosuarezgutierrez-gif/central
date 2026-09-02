---
name: correduria-crm
description: >
  El CRM de la correduría (Grupo Asegura) en /correduria de plataforma: ficha de cliente,
  póliza, leads, relaciones, portal del cliente y la conciliación Codeoscopic↔CIMA. Úsala
  ANTES de tocar cualquier pantalla o escritura de la cartera, o si Alberto habla de
  clientes, pólizas, leads, presupuestos, siniestros o del portal. Router: el detalle vive en
  docs/CORREDURIA-CRM-VISION.md.
---

# CRM de la correduría (router)

**Lee primero `docs/CORREDURIA-CRM-VISION.md`** (visión dictada por Alberto el 02/09/2026, estado
real medido, orden de trabajo). Después, según lo que toques:

- Puerto y trastienda → `apps/asegura/CLAUDE.md` («El puerto que sirve la pantalla», «Codeoscopic»).
- Pantallas → `apps/plataforma/CLAUDE.md` («La correduría se trabaja DESDE AQUÍ»).
- Sector y agente semanal → skill `agente-correduria`.

## 🚨 No romper

1. **Dos caras, dos apps.** Corredor en `apps/plataforma` (`/correduria`); cliente en
   `apps/asegura-portal` (rol sin BYPASSRLS, secreto propio). Nunca una pantalla compartida con permisos.
2. **«Cliente» = póliza viva de CIMA** (`import_ref IS NULL`). Lo emitido por nosotros es «pendiente
   de confirmación» hasta que CIMA lo trae. El estado del cliente se DERIVA, no se guarda.
3. **Toda escritura** va por `/api/operador/*` de asegura con `correduriaId` explícito y deja fila en
   `historial_interno`. Reglas puras en `@central/module-seguros` con test.
4. **Identidad solo documentada** (DNI recibido en la ficha); contacto y dirección libres; el DNI
   entero no cruza el puerto (enmascarado).
5. **Autorización para ver seguros ajenos es direccional** y se da desde la ficha de quien autoriza.
6. **Emisión y conciliación CIMA: spec + OK de Alberto antes de código.** Hoy CIMA empareja por
   número + nombre de compañía y pisa; una emitida sin marcar se duplica o se sobreescribe.
7. **Nada sale al cliente** (email/WhatsApp) sin OK explícito. Borradores.
8. `null` ≠ `[]` en recibos, documentos, contactos, relaciones: la pantalla lo dice, no lo colapsa.

## Estado en una línea (02/09/2026)

Lectura y cuidado de la cartera: hecho (buscador, ficha cliente/póliza, edición, relaciones,
documentos, retención, retarificar). Falta: emisión en central + conciliación CIMA, historial
visible, estado «con presupuesto», leads por canal, portal leyendo la cartera, siniestros desde la
ficha, «por qué sube la prima». Tabla completa en el documento (§4) y orden en §9.
