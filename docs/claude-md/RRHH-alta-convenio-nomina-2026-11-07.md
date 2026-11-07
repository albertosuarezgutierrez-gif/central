# RRHH: detalle íntegro (movido de apps/rrhh/CLAUDE.md por el tope de 24 KB)

## Alta de trabajadores, seguro de convenio y nómina explicable (07/11/2026)
- Alta: asistente de 3 pasos `/admin/empleados/nuevo` e importación Excel/CSV `/admin/empleados/importar` (enlazados desde el listado).
  Reglas PURAS en `lib/alta-empleado.ts` (+ validadores DNI/NIE, NAF, IBAN en `lib/alta-empleado-validadores.ts`; los mensajes nunca repiten el dato).
  Escritura ÚNICA `darDeAltaLote` (`lib/alta-empleado-repo.ts`): una transacción, cerrojo por empresa, duplicados por DNI/NAF/email
  mirados otra vez dentro. También la usa `POST /api/admin/empleados` (alta rápida: `validarAltaRapida`; DNI opcional = null,
  «no se sabe», no se compara por DNI; si choca → 409).
- Importación SOLO CSV (UTF-8, «;» o «,»; `leerCsvSubido`): un .xlsx/.xls/.ods subido se rechaza (422, «guarda tu Excel como CSV»)
  porque `xlsx@0.18.5` tiene CVE-2023-30533 (contaminación de prototipo en la instancia caliente, común a todas las empresas).
  `xlsx` sigue solo para ESCRIBIR los informes. Volverá la lectura con xlsx ≥0.20.3. Jornada/IRPF: «15%» se respeta; una
  fracción sin «%» (jornada ≤ 1, IRPF entre 0 y 1) es ambigua y da error de fila (`porcentajeDeHoja`).
- Lead a la correduría: timeout/5xx/2xx sin `ok` = `incierto` («puede que ya se enviara»), nunca se reenvía solo; un `enviando`
  de > 2 min (o `cerrarLead` fallido) pasa a `incierto`; reintento manual solo tras 24 h (o el operador pone la fila en `error`).
  El resumen del lead no lleva NIF (en un autónomo es su DNI).
- Seguro obligatorio por convenio: `/admin/nominas/convenio/seguro`, reglas `lib/seguro-convenio.ts` (tres estados: NULL no se sabe ≠
  `no_cubierto` ≠ `cubierto`). El lead a la correduría (`lib/lead-correduria.ts` → `POST /api/publico/correduria/lead` de plataforma)
  sale SOLO con botón + casilla de consentimiento. 🚨 Migración `0036_convenio_seguro_obligatorio.sql` PENDIENTE de aplicar
  (antes de desplegar). La siguiente libre es la 0037.
- Nómina explicable: `lib/nomina-explicacion.ts` (`explicarNomina`, avisos si falta desglose/tablas) en la pantalla y en el PDF:
  al confirmar (`/api/admin/nominas/[nominaId]/confirmar`) el PDF lleva el anexo «Cómo se ha calculado tu nómina».
