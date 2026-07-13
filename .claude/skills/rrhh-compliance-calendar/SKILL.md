---
name: rrhh-compliance-calendar
description: Recordatorio mensual de obligaciones legales pendientes de implementar en la vertical RRHH (Portal del Empleado). Lee el roadmap, filtra los ítems 🔴 obligatorios no completados y genera un informe de plazos. Úsala el primer día de cada mes o cuando Alberto quiera un pulso del estado de compliance de RRHH.
---

# RRHH compliance calendar — recordatorio mensual

Pasada sobre el roadmap de RRHH para mantener visibilidad sobre las **obligaciones legales**
pendientes de implementar. Sesión efímera, solo lectura y generación de informe.

> Las obligaciones marcadas 🔴 en el roadmap tienen base legal (RD 8/2019 fichaje,
> RGPD art.28, canal denuncias, etc.). Una multa por incumplimiento puede superar el
> coste de implementación en un solo expediente. Este recordatorio mantiene presión.

## Paso 1 — Leer el roadmap

Lee `/home/user/central/docs/ROADMAP-rrhh.md` (o `apps/rrhh/docs/ROADMAP-rrhh.md` si no
existe en la raíz de docs).

## Paso 2 — Filtrar y clasificar

Extrae los ítems **no tachados** (sin `~~`) marcados con:
- 🔴 **Obligatorio** (legal / compliance): tienen prioridad máxima
- 🟠 **Monetización / retención**: siguiente nivel
- 🟡 **Operativa**: informativo

Para cada ítem 🔴, busca si hay una fecha límite conocida o referencia legal:

| Ítem | Base legal | Riesgo de no tener |
|---|---|---|
| Fichaje digital (control horario) | RD 8/2019 (LOPDGDD) | Multa ITSS hasta 6.250€/empresa |
| Canal denuncias | Ley 2/2023 (aplicable >50 trabajadores, examinable para grupos menores) | Posible obligación de adopción anticipada |
| RGPD art.28 — DPA con empresa cliente | RGPD + LOPDGDD | Nulidad de contratos / sanción AEPD |
| Modelo 145 digital | Reglamento IRPF | Retención incorrecta → responsabilidad fiscal |
| Aviso NIE caducidad | Obligación empleador (contratación extranjeros) | Riesgo contratación irregular |
| PRL básico | LPRL 31/1995 | Responsabilidad civil/penal si hay accidente |

## Paso 3 — Generar informe

Produce en el chat un resumen ejecutivo:

```
📅 RRHH Compliance — {MES} {AÑO}

🔴 OBLIGATORIOS PENDIENTES ({N} ítems):
  - [ítem]: base legal + riesgo + estado en el roadmap
  ...

🟠 MONETIZACIÓN PENDIENTE ({N} ítems):
  - [ítem]: qué aporta
  ...

Recomendación del mes: [el ítem 🔴 más urgente o de mayor riesgo]
```

## Paso 4 — Si hay ítems 🔴 de riesgo alto

Si hay ítems 🔴 sin fechas de implementación planificadas y el mes actual sugiere urgencia
(ej. abril = campaña IRPF → Modelo 145; septiembre = inspecciones de trabajo), añade
una nota explícita en el informe sugiriendo priorizarlos en el sprint del mes.

## Herramientas

- **Read** (filesystem): leer `docs/ROADMAP-rrhh.md`
- Sin Supabase ni GitHub: esta skill solo lee y genera informe
- **Telegram** (a través de plataforma, opcional): si hay ítems 🔴 urgentes:
  ```
  POST {PLATAFORMA_URL}/api/internal/alerta
  Authorization: Bearer {ALERTA_TOKEN}
  { "text": "📅 RRHH Compliance — {MES}: {N} obligaciones 🔴 pendientes. Ver el chat." }
  ```
  La rutina NO necesita `TELEGRAM_BOT_TOKEN` — el token vive en Vercel plataforma.

## Auto-informe (obligatorio al terminar la pasada)

Antes de cerrar, añade UNA entrada arriba del todo de la sección "Entradas pendientes de
procesar" de `docs/AGENTES-BITACORA.md` (3-5 líneas máx.):

`- **YYYY-MM-DD · <nombre-de-esta-skill>** · hizo: …; dudas: …; fallos: …; PRs/commits: …`

- Sin dudas ni fallos → `dudas: —; fallos: —` (el "todo bien" también es señal).
- Commitea la entrada con el resto de tu trabajo (o en un commit propio a `main` si la
  pasada no tocó el repo). La consume el `agentes-entrenador` (semanal) para mejorar este
  prompt; si no queda escrita, esta pasada no existió para él.
