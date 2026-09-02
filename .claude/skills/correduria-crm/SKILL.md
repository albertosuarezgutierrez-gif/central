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
documentos, retención, retarificar, historial visible, estado derivado, guardián de duplicadas,
siniestros desde la ficha, «por qué ha subido la prima»). Falta: emisión en central + conciliación
CIMA (spec hecha, pendiente de OK), leads por canal, portal leyendo la cartera (sus tablas no
existen en la BD). Tabla completa en el documento (§4) y orden en §9.

9. **Siniestros: dos orígenes, dos reglas.** En uno de CIMA el estado lo fija la compañía (CIMA lo
   reescribe en cada pull) y se anota lo que CIMA no manda; en uno nuestro, la referencia de la
   compañía va TAMBIÉN a `id_siniestro_entidad` para que el pull case y no duplique.
10. **La prima por anualidad se DERIVA de los recibos por aniversario, no por año natural**, y
    `sin_datos` (CIMA no manda la anualidad anterior, o el ciclo está incompleto) es la respuesta
    para la mayoría de las vivas: nunca se pinta como «no ha subido».
