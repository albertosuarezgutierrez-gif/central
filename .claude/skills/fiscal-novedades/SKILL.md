---
name: fiscal-novedades
description: Agente PROGRAMADO (mensual + pre-renta) con DOS radares fiscales; (1) deducciones IRPF (BOE estatal, BOJA/AEAT Andalucía) contrastadas con IMPORTES_POR_ANIO de apps/plataforma/lib/fiscal-deducciones.ts — si cambian, PR draft + fila en fiscal_novedades; (2) convocatorias de AYUDAS/SUBVENCIONES (BOJA/Junta/estatales) que encajen con el perfil de Alberto y Pilar — si hay una nueva, aviso Telegram con plazo y requisitos, estado en docs/FISCAL-AYUDAS.md. Úsala si Alberto pide "revisa si han cambiado las deducciones" o "¿hay ayudas nuevas?".
---

# Vigilante de novedades fiscales — deducciones IRPF (Alberto)

Comprueba si los **importes de deducciones/mínimos** del IRPF han cambiado y mantiene
sincronizada la tabla `IMPORTES_POR_ANIO` del motor de `/finanzas`. Entorno **efímero**:
cada ejecución es una pasada completa e idempotente. Pensada para correr ~1×/mes (y antes de
la campaña de renta) por un trigger de Claude Code web, o a petición.

> ⚠️ Las deducciones cambian ~1 vez al año (Ley de Presupuestos / Ley IRPF en el **BOE**;
> autonómicas en el **BOJA**). No es un proceso 24/7: se despierta, compara y deja PR + aviso.

## Fuente de la verdad en el repo
`apps/plataforma/lib/fiscal-deducciones.ts` → `IMPORTES_POR_ANIO[<año>]`. Cada bloque trae
`fuente` y `revisado`. Los campos a vigilar (con su `clave` para `fiscal_novedades`):
`maternidadPorHijo`, `maternidadGuarderiaMax`, `familiaNumerosaGeneral`,
`familiaNumerosaEspecial`, `minimoContribuyente`, `minimoDescendiente[]`, `incrementoMenor3`,
y las andaluzas `andaluciaNacimiento`, `andaluciaFamiliaNumerosa*` **y sus límites de renta
`andaluciaFamiliaNumerosaLimiteIndividual/Conjunta`** (25.000/30.000 €; añadidos 18/07/2026 — la FN
autonómica se gatea por renta, la de nacimiento NO desde Ley 8/2025).

## Herramientas (MCP de la sesión)
- **WebFetch / WebSearch**: AEAT (`sede.agenciatributaria.gob.es`), **BOE** (`boe.es`,
  Disposiciones generales / Ley IRPF / Ley de Presupuestos) y **BOJA** / Junta de Andalucía
  para las autonómicas.
- **Supabase** (`wswbehlcuxqxyinousql`): `execute_sql` para insertar en `fiscal_novedades`.
- **GitHub** (nativo al vincular el repo): abrir el PR draft con la actualización del constante.

## Paso 1 — Leer los importes vigentes en el repo
Lee `IMPORTES_POR_ANIO` del año en curso (y crea el bloque del año siguiente si ya se ha
publicado). Anota cada valor y su `clave`.

## Paso 2 — Contrastar con la fuente oficial
Para cada campo, busca el **importe legal vigente** en AEAT/BOE (estatales) y BOJA (Andalucía).
Cita SIEMPRE la URL de la disposición. Si la fuente no es inequívoca, NO cambies el valor:
anótalo como duda en el cuerpo del PR.

## Paso 3 — Si hay cambios
1. **Actualiza la constante** en `apps/plataforma/lib/fiscal-deducciones.ts` (el valor + `fuente`
   + `revisado` = hoy). Ejecuta `node --test apps/plataforma/lib/fiscal-deducciones.test.ts`;
   ajusta el test si el caso de referencia cambió de cifra por la ley.
2. **Inserta la novedad** (una fila por campo cambiado):
   ```sql
   INSERT INTO fiscal_novedades (anio, clave, importe_anterior, importe_nuevo, beneficia, ambito, fuente_url)
   VALUES (<año>, '<clave>', <anterior>, <nuevo>, <nuevo > anterior>, '<estatal|andalucia>', '<url>');
   ```
   `beneficia = importe_nuevo > importe_anterior` (más deducción/mínimo = mejor para Alberto).
   La app muestra el banner verde en `/finanzas` solo para `beneficia = true AND NOT descartado`.
3. **Abre un PR draft** `claude/fiscal-novedades-<fecha>` con el diff del constante + el test, y
   en el cuerpo: tabla de cambios (campo, antes, después, fuente) y dudas si las hubo.

## Paso 4 — Si NO hay cambios
No abras PR ni insertes filas. Deja solo un resumen en el chat ("sin cambios; revisado contra
BOE/BOJA a fecha X"). Idempotente: re-ejecutar no duplica avisos.

## Paso 5 — Radar de convocatorias de ayudas/subvenciones (misma pasada mensual)
> Caso fundacional (15/08/2026): la Junta convocó en junio ayudas de conciliación para autónomos
> (hasta 7.200€, plazo 30/06→15/09) y nadie avisó — Alberto se enteró por prensa a mitad de plazo.
> Este radar existe para que eso no se repita.

1. **Busca convocatorias nuevas o con plazo abierto** (WebSearch + WebFetch; OJO: muchos dominios de
   prensa están bloqueados por el proxy — apóyate en la síntesis del buscador y cita las URLs):
   BOJA / Junta de Andalucía (Consejería de Empleo, portal de ayudas), BOE/estatales (SEPE, Seg. Social,
   Industria) y bonos tipo Kit Digital. Consultas tipo: "ayudas autónomos Andalucía <año>",
   "subvenciones familia numerosa Andalucía", "ayudas vivienda turística/rehabilitación Sevilla".
2. **Filtra por el perfil real** (skill `perfil-fiscal` + BD `fiscal_perfil`/`fiscal_descendientes`
   para edades de hijos — no las asumas): Alberto y Pilar autónomos con domicilio fiscal en Andalucía
   (Sevilla), familia numerosa general con hijos pequeños, pisos turísticos en IRPF personal,
   SL dormida (descarta ayudas que exijan sociedad ACTIVA). Descarta lo que exija condiciones que no
   se dan; si exige algo posible pero no seguro (p. ej. contratar personal), avisa igual marcándolo.
3. **Dedupe contra `docs/FISCAL-AYUDAS.md`** (estado): una tabla `| Convocatoria | Plazo | Encaje |
   Estado | Avisada |`. Si ya está listada, no re-avises; si cambió el plazo o se reabrió, actualiza
   la fila y avisa de nuevo. Añade SIEMPRE las nuevas (también las descartadas, con el porqué).
   **Re-aviso de cierre:** si una fila sigue «pendiente de decisión» y quedan ≤15 días de plazo,
   manda UN recordatorio (`⏳ PLAZO CIERRA — …`) y anótalo en la fila para no repetirlo.
4. **Aviso Telegram + banner en pantalla** si hay convocatoria nueva que encaje (o cambio de plazo
   relevante), por el canal común (preflight al arrancar, ver abajo):
   `💶 AYUDA NUEVA — <título>: hasta <importe>, plazo <fecha límite>. Encaje: <por qué aplica>. <URL oficial>`
   Y además INSERT en la tabla **`fiscal_ayudas`** (Supabase `wswbehlcuxqxyinousql`) para que salga el
   banner 💶 de `/finanzas` con cuenta atrás (`prisma/sql/2026-08-15_fiscal_ayudas.sql`):
   ```sql
   INSERT INTO fiscal_ayudas (titulo, organismo, cuantia_texto, encaje, url, plazo_fin, tenant)
   VALUES ('<título corto>', '<organismo>', 'hasta X€', '<por qué encaja>', '<url>', '<yyyy-mm-dd o NULL>', NULL);
   ```
   (`tenant` NULL = Alberto; las de clientes llevan su nombre y NO se pintan en `/finanzas`.
   `plazo_fin` NULL = «plazo por confirmar», el banner lo dice así — nunca lo inventes.)
   Sin novedades → sin Telegram y sin INSERT. Este radar NO abre PR salvo por el propio archivo de estado.
5. **Bonificaciones de Seguridad Social (checklist, en la pasada de enero y en la pre-renta):**
   no salen en convocatorias — son derechos que se aplican o se pierden en silencio. Contrasta la
   situación real (BD + `perfil-fiscal`) con al menos: tarifa plana/reducida de nueva alta,
   **bonificación 100% de cuota durante descanso por nacimiento/riesgo embarazo** (art. 38 LETA),
   bonificación por cuidado de menor de 12 años (ligada a contratación), y exención de cuota por
   pluriactividad. Si un recibo `cuota_autonomos` de `movimientos_bancarios` NO cuadra con la
   bonificación que tocaría (p. ej. cuota entera pagada durante una baja), avisa por Telegram y
   deja el detalle en la fila de `docs/FISCAL-AYUDAS.md` — puede haber devolución reclamable.
6. **Radar por cliente (casa de marcas):** tras el perfil propio, repite la búsqueda para los
   tenants con cliente real usando su sector/provincia (hoy: Joaquín Jaén — catering/eventos;
   Sique Brilla — limpiezas, cliente de ialimp; añade los que aparezcan en `docs/CONTEXTO-SESIONES.md`).
   Kit Digital y ayudas de digitalización/contratación sectoriales suelen ser lo relevante. El aviso
   va SIEMPRE a Alberto (mismo Telegram, prefijo `💼 AYUDA CLIENTE <nombre>`), nunca al cliente:
   Alberto decide si reenviarla. Estado en la sección «Clientes» de `docs/FISCAL-AYUDAS.md`.
7. **Nunca tramites ni contactes a nadie** (ni a la asesoría, ni a clientes): el radar informa a
   Alberto y decide él (regla global de comunicaciones salientes en el CLAUDE.md raíz).

## Canal de aviso — protocolo común
**Preflight AL ARRANCAR** (no al final): `GET {PLATAFORMA_URL}/api/internal/alerta` con
`Authorization: Bearer {ALERTA_TOKEN}`. `200` → canal vivo; enviar con
`POST {PLATAFORMA_URL}/api/internal/alerta` y body `{ "text": "..." }` (el token de Telegram vive en
Vercel plataforma, esta skill no lo necesita). `401` → canal mudo: según `docs/AVISOS-AGENTES.md`,
avisa por el push nativo de la sesión empezando por `🔇 SIN TELEGRAM (401):` y deja el aviso entero
en `docs/AGENTES-BITACORA.md` (`fallos:`). Nunca falles en silencio.

## Reglas
- **Orientativo**: el módulo no sustituye asesoría fiscal; el vigilante solo mantiene cifras.
- No inventes importes: sin fuente oficial clara, no se toca el valor.
- Multi-tenant: `fiscal_novedades` es global (normativa), no lleva `cuenta_id`.
- En el radar de ayudas, cuantías/plazos que no consigas verificar en fuente oficial se avisan
  como «según prensa, por confirmar» — mejor un aviso imperfecto a tiempo que ninguno.

## Auto-informe (obligatorio al terminar la pasada)

Antes de cerrar, añade UNA entrada arriba del todo de la sección "Entradas pendientes de
procesar" de `docs/AGENTES-BITACORA.md` (3-5 líneas máx.):

`- **YYYY-MM-DD · <nombre-de-esta-skill>** · hizo: …; dudas: …; fallos: …; PRs/commits: …`

- Sin dudas ni fallos → `dudas: —; fallos: —` (el "todo bien" también es señal).
- Commitea la entrada con el resto de tu trabajo (o en un commit propio a `main` si la
  pasada no tocó el repo). La consume el `agentes-entrenador` (semanal) para mejorar este
  prompt; si no queda escrita, esta pasada no existió para él.
