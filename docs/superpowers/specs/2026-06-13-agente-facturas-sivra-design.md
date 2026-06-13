# Agente de facturas de SIVRA — Diseño

> Fecha: 2026-06-13 · Vertical: `apps/sivra` · Estado: aprobado para planificar

## 1. Objetivo

Un **agente diario** que pone al día y mantiene la contabilidad de gastos de los pisos
turísticos sin trabajo manual de Alberto:

1. Revisa **el correo (Gmail)** y la **carpeta de Google Drive** buscando facturas.
2. **Archiva** cada PDF en Drive (subcarpetas por año/mes) si no está ya.
3. **Imputa** la factura como gasto en SIVRA (tabla `gastos`), extrayendo los datos con la IA
   que ya existe (proveedor, NIF, fecha, base, **IVA**, **IRPF**, total, nº factura).
4. **Aprende** los gastos recurrentes (suelen ser los mismos cada mes) para automatizarlos.
5. **Modo mixto:** lo que tiene claro lo imputa solo; lo nuevo/dudoso va a una **bandeja de
   revisión** y **avisa por Telegram**.
6. Separa lo que **no es de los pisos** con un valor **"Personal"** en el desplegable de propiedad.

## 2. Contexto existente que se reutiliza (no se reinventa)

| Pieza | Dónde | Uso en el agente |
|---|---|---|
| Tabla `gastos` (SQL crudo) | Supabase `wswbehlcuxqxyinousql` | Destino de los gastos imputados |
| CRUD gastos | `app/api/expenses/route.ts` | Lógica de inserción + subida a Drive |
| Extracción IA factura | `lib/ai-client.ts` (`aiExtractInvoice`) | Leer PDF/imagen → JSON |
| Parse invoice endpoint | `app/api/expenses/parse-invoice/route.ts` | Pipeline de extracción |
| Subida a Drive | `scripts/drive-upload.gs` + `DRIVE_SCRIPT_URL` | Archivar PDFs (se amplía con listar/leer) |
| Credenciales Gmail | `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Leer correo por IMAP |
| Crons + auth | `vercel.json` + `lib/cron-auth.ts` (`CRON_SECRET`) | Disparo diario protegido |
| UI gastos | `app/(dashboard)/expenses/page.tsx` | Base para la bandeja de revisión |
| Telegram (patrón) | `apps/ia-rest/src/lib/telegram.ts` | Se porta a sivra para avisos |

## 3. Decisiones tomadas (Q&A con Alberto)

- **Control:** modo **mixto + aprendizaje**. Lo recurrente conocido se imputa solo; lo nuevo/dudoso
  a bandeja. Aplica **también al backfill** inicial.
- **No-pisos:** valor **"Personal"** en el desplegable de propiedad. Registrado y filtrable, pero
  **fuera de los totales/ROI de cada piso**. (Alberto es autónomo, lo lleva todo junto pero quiere
  controlarlo aparte.)
- **Alquileres SÍ son de los pisos:** Bajo Derecha → **Luxury Busto**, Bajo izquierda → **Busto
  Reform**, categoría **ALQUILER**. Cuentan dentro del piso (no son "Personal").
- **Detección de email:** la más completa (híbrida) — ver §6.
- **Drive:** la más completa — escanear la carpeta + archivar por año/mes — ver §7.
- **Avisos:** **Telegram** cuando algo cae en la bandeja (+ email de respaldo). Email también cuando
  llega un correo que parece gasto pero **sin** factura adjunta.
- **Backfill 2026:** repasar **todo el año**, comprobar Drive + contabilidad, generar lo que falte,
  en **modo mixto** (claras dentro, dudosas a bandeja). Alquileres: **mismo importe todo 2026**
  (Luxury 309,38 / Busto Reform 259,16), de enero a hoy.

## 4. Arquitectura

Cron diario nuevo en sivra: **`GET /api/expenses/agent/scan`** (protegido con `CRON_SECRET` vía
`isCronAuthorized`). Orquesta módulos pequeños y testeables:

```
/api/expenses/agent/scan   (cron, orquestador)
  ├─ lib/agente-facturas/gmail.ts      → IMAP: lista candidatos del día/rango
  ├─ lib/agente-facturas/drive.ts      → lista/lee/archiva en Drive (vía drive-upload.gs)
  ├─ lib/agente-facturas/extraer.ts    → envuelve aiExtractInvoice (IVA + IRPF)
  ├─ lib/agente-facturas/reglas.ts     → match contra gastos_reglas + confianza
  ├─ lib/agente-facturas/imputar.ts    → inserta en gastos | gastos_pendientes (dedup)
  ├─ lib/agente-facturas/anomalias.ts  → duplicados, cambios de importe, recurrentes que faltan
  └─ lib/agente-facturas/avisos.ts     → Telegram + email
```

Endpoints de apoyo:
- `POST /api/expenses/pendientes/[id]/aprobar` — mueve un pendiente a `gastos` (y refuerza la regla).
- `POST /api/expenses/pendientes/[id]/descartar`.
- `GET  /api/expenses/agent/backfill` — backfill 2026 (idempotente; reutiliza el mismo pipeline).

Cada unidad tiene un propósito único, interfaz clara y se puede probar aislada.

## 5. Modelo de datos (cambios en Supabase — DB COMPARTIDA, ver §15)

Todos los cambios son **aditivos** (columnas nullable + tablas nuevas) → no rompen `ialimp`.

**`gastos` — columnas nuevas (nullable):**
- `irpf` numeric — importe de retención de IRPF.
- `irpf_porcentaje` numeric — % de retención (p.ej. 19).
- `origen` text — `'manual' | 'agente-email' | 'agente-drive' | 'backfill'` (trazabilidad).
- `fingerprint` text — huella de dedup/recurrencia (ver §9).

**`gastos_pendientes` (tabla nueva)** — bandeja de revisión. Mismas columnas que `gastos` +
`confianza` (0–1), `motivo_revision` text, `drive_url`, `email_uid`, `created_at`. Al aprobar, se
inserta en `gastos` y se borra de aquí.

**`gastos_reglas` (tabla nueva)** — memoria del agente. `fingerprint` (PK lógica), `proveedor`,
`nif_proveedor`, `propiedad`, `categoria`, `iva_porcentaje`, `irpf_porcentaje`, `importe_esperado`,
`importe_min`/`importe_max` (banda tolerada), `periodicidad` (`mensual|trimestral|...`), `vistas`
(nº de veces confirmada), `ultima_fecha`, `activa` bool.

**`agente_log` (tabla nueva)** — auditoría: qué procesó el agente, decisión (auto/bandeja/descartado),
confianza, timestamp. (Idea "registro de auditoría", §14.)

Constantes de UI (`expenses/page.tsx`):
- `CATEGORIAS` += **`'ALQUILER'`**.
- `PROPS` += `{ id: 'prop_personal', name: 'Personal' }`.
- Los totales/ROI por piso **excluyen** `prop_personal`.

## 6. Detección de email (híbrida — "lo más completo")

Lectura por **IMAP** con `GMAIL_USER`/`GMAIL_APP_PASSWORD` (las credenciales actuales solo envían;
hace falta leer → nueva dep IMAP, p.ej. `imapflow`).

1. **Candidatos:** correos con **PDF/imagen adjunta** *o* de **remitentes/keywords de factura**
   ("factura", "recibo", "adeudo", "invoice"…) dentro del rango (día a día; todo el año en backfill).
2. **Confirmación IA:** la extracción decide si el adjunto es realmente una factura (descarta firmas,
   logos, newsletters).
3. **Trazabilidad:** cada correo procesado se marca con **etiqueta Gmail "Facturas/Procesada"**
   (vía IMAP) → no se reprocesa y queda visible en tu bandeja.
4. **Correo "gasto sin factura":** si un correo **parece un gasto** (keywords) pero **no trae
   adjunto** → no se imputa; se **avisa** (email + Telegram) para que reclames la factura.

## 7. Detección y archivado en Drive ("lo más completo")

Se amplía `scripts/drive-upload.gs` con acciones `list` (PDFs de la carpeta raíz, sin archivar aún)
y `get` (descargar contenido para extraer). Flujo:

1. Lista PDFs nuevos de la carpeta que pasó Alberto.
2. Por cada uno: extrae con IA → decide auto/bandeja.
3. **Archiva** moviéndolo a subcarpeta `AÑO/MES` dentro de la misma carpeta (idempotente).
4. Guarda `drive_url` + `carpeta_drive` + `drive_file_name` en el gasto.

Para facturas **de email**: si no están ya en Drive, se **suben** (flujo actual `DRIVE_SCRIPT_URL`)
y luego se archivan igual.

## 8. Extracción IA (IVA + IRPF)

Se extiende el prompt/parsing de `aiExtractInvoice` para capturar **retención de IRPF** (los recibos
de alquiler de Kutxabank la traen: base + IVA − IRPF = importe domiciliado). Campos objetivo:
`fecha, proveedor, nif_proveedor, numero_factura, concepto, base_imponible, iva_porcentaje, iva,
irpf_porcentaje, irpf, total, categoria, propiedad`.

Ejemplo real (validación): *Bajo Derecha BUSTOS TAVERA 22* → base 303,31 · IVA 21% 63,70 ·
IRPF 19% −57,63 · total domiciliado 309,38 → propiedad **Luxury Busto**, categoría **ALQUILER**.

## 9. Aprendizaje / reglas recurrentes (`gastos_reglas`)

**Fingerprint** = normalización de identidad del gasto, en orden de preferencia:
`id. acreedor`/IBAN > `nif_proveedor` > proveedor normalizado (+ keyword de concepto/dirección para
distinguir pisos, p.ej. "BAJO DERECHA" vs "BAJO IZQUIERDA").

- Al **aprobar/corregir** un pendiente, se **crea o refuerza** la regla (propiedad, categoría, IVA,
  IRPF, banda de importe). `vistas++`.
- En la siguiente factura que haga match con una **regla estable** (`vistas ≥ 2`, configurable, y
  dentro de banda de importe) → **se imputa sola** (alta confianza).
- **Regla precargada (seed):** alquiler Kutxabank → "BAJO DERECHA"→Luxury Busto, "BAJO IZQUIERDA"→
  Busto Reform, categoría ALQUILER, IVA 21%, IRPF 19%.

## 10. Modo mixto por confianza

Score de confianza por factura. Va **directo a `gastos`** si: hay regla estable + importe dentro de
banda + todos los campos fiscales presentes + no es duplicado/anomalía. En cualquier otro caso →
`gastos_pendientes` con `motivo_revision` + **aviso Telegram**.

## 11. Backfill 2026 (modo arranque)

`GET /api/expenses/agent/backfill` (idempotente, se puede relanzar):

1. Recorre **todos los emails de 2026** + **todos los PDFs de la carpeta de Drive**.
2. Por cada factura: ¿está en Drive? si no, la sube/archiva. ¿está en `gastos`? (dedup por
   fingerprint + nº factura + fecha/importe) si no, la procesa en **modo mixto** (claras dentro,
   dudosas a bandeja).
3. **Alquileres** (no llegan por email): verifica que estén contabilizados de **enero a hoy** para
   los 2 pisos; los que falten los genera con el importe fijo de 2026 (Luxury 309,38 / Busto Reform
   259,16). Al ser recurrentes con regla seed → entran como "claras".
4. Resumen final por Telegram + email (nº imputadas, nº a bandeja, alquileres creados).

## 12. Bandeja de revisión (UI)

Nueva página **`/expenses/pendientes`**: lista de `gastos_pendientes` con PDF embebido + datos
extraídos editables + `confianza` + `motivo_revision`. Acciones: **Aprobar** (→ `gastos` + refuerza
regla), **Corregir y aprobar**, **Descartar**. Botón **"Aprobar todo"** para el backfill.

## 13. Notificaciones

- **Telegram** (se porta `tgAlert`/`tgAlertButtons` a `apps/sivra/lib/telegram.ts`): aviso cuando
  algo entra en la bandeja, con **botones inline "Aprobar/Descartar"** (vía el webhook de Telegram,
  opcional en v1; mínimo: aviso + enlace a la bandeja). Requiere `TELEGRAM_BOT_TOKEN` +
  `TELEGRAM_CHAT_ID` en el Vercel de **sivra** (hoy solo están en ia-rest).
- **Email** (nodemailer/Gmail ya existente): respaldo del aviso de bandeja + aviso "gasto sin
  factura adjunta" + resumen del backfill.

## 14. Ideas adicionales — TODAS dentro (decisión de Alberto)

- 🔔 **Recurrente que no llega:** si una regla mensual no aparece un mes → aviso ("falta el alquiler
  de Luxury Busto de junio"). (`anomalias.ts`)
- ⚠️ **Anomalías y duplicados:** cambio de importe fuera de banda o factura repetida → a bandeja en
  vez de imputar a ciegas.
- 🧾 **Resumen trimestral IVA/IRPF:** con IVA e IRPF separados, resumen de IVA soportado e IRPF
  retenido (modelo 115 para alquileres) para el gestor.
- 📒 **Registro de auditoría:** `agente_log` + vista de "qué hizo el agente solo y con qué confianza".
- 📤 **Exportar a CSV/Excel** filtrado (para el gestor).
- 🏦 **Cuadre con el banco:** cruce de lo imputado contra lo realmente cobrado. **Sin integración
  bancaria en vivo** → vía subida de extracto (CSV) del banco; se cruza por importe/fecha.

## 15. Avisos / landmines (no romper)

- **DB COMPARTIDA con `ialimp`** (`wswbehlcuxqxyinousql`). Cambios **solo aditivos** (columnas
  nullable + tablas nuevas). **NO** tocar RLS, `security_invoker`, buckets ni GRANTs. Verificar
  contra Supabase real (la mayoría de tablas no están en Prisma).
- **Dos tablas de propiedades:** `gastos.propiedad` es **texto** con IDs `prop_*` (no FK). "Personal"
  = `prop_personal`. No confundir con `properties`/`propiedades`.
- **Idempotencia:** scan y backfill deben poder relanzarse sin duplicar (etiqueta Gmail + fingerprint
  + dedup en Drive).
- **Secretos:** solo nombres de variable; valores en Vercel env.

## 16. Verificación

- `npx tsc --noEmit` + `npx next build` en `apps/sivra` (el build de Vercel, no solo `tsc`).
- SQL validado contra Supabase real (no solo Prisma).
- Pruebas unitarias de `reglas.ts` (fingerprint + banda) y `extraer.ts` (parseo IVA/IRPF con los 2
  recibos de Kutxabank como fixtures).
- Backfill primero en **dry-run** (cuenta y muestra, no escribe) para revisar antes de imputar.

## 17. Fuera de alcance (por ahora)

- Integración bancaria en vivo (PSD2/open banking) — solo cuadre por CSV.
- Multi-usuario / otras verticales — esto es de sivra (pisos de Alberto).
- OCR propio — se usa la visión IA existente (NVIDIA NIM).
