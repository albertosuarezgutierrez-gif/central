-- «Documentos internos» (04/11/2026). Pilar (RRHH) sube documentos al expediente que el EMPLEADO NO VE
-- (amonestaciones, evaluaciones, notas internas) y decide por documento qué ve y qué no.
-- Aditiva e idempotente; por defecto TRUE = todo lo existente sigue viéndose igual.
-- 🚨 Aplicar ANTES de desplegar el código: el listado del empleado, avisos y firma leen `visible_empleado`.
--
-- Reglas (en código, `lib/visibilidad-documento.ts`): un documento con firma (pendiente/firmado) debe ser visible;
-- las nóminas se ven siempre; oculto = no se lista, no se descarga (sin URL firmada), no se avisa, no se cuenta.
-- Sin GRANT nuevo: es una columna de una tabla que `rrhh_app` ya lee y escribe (como 0026).
ALTER TABLE rrhh.documentos
  ADD COLUMN IF NOT EXISTS visible_empleado boolean NOT NULL DEFAULT true;
