-- Modelo 145 con vigencia (05/11/2026, fase N1 de nóminas). Aditiva e idempotente. NO aplicada a la BD real desde el código.
-- Una fila = una comunicación de situación familiar del empleado al pagador, válida desde `vigente_desde` hasta
-- `vigente_hasta` (NULL = abierta). Histórico: se cierra la anterior y se inserta otra; NUNCA se edita ni se borra una fila
-- ya usada en una nómina (regularizaciones y certificados dependen de ella). Sin fila vigente = «sin 145» → el IRPF aplica la
-- regla de ausencia (@central/module-nominas `calcularTipoIrpf`), no una situación inventada.
-- Datos de categoría especial RGPD art. 9 (discapacidad, familia): lectura solo desde /admin del responsable de ESA empresa
-- (rrhh_app tiene BYPASSRLS: el aislamiento por empresa_id es del código) y sin enviarlos a la IA.
-- Pendiente N1: firma con core-firma (`firma_documento_id` queda NULL hasta entonces; el cálculo NO la exige todavía).
-- El shape de `datos` es el tipo `SituacionFamiliar` de @central/module-nominas (sin vigencias, que son columnas).
CREATE TABLE IF NOT EXISTS rrhh.situacion_familiar (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  uuid        NOT NULL REFERENCES rrhh.empresas(id) ON DELETE CASCADE,
  empleado_id                 uuid        NOT NULL REFERENCES rrhh.empleados(id) ON DELETE CASCADE,
  vigente_desde               date        NOT NULL,
  vigente_hasta               date,
  situacion                   smallint    NOT NULL CHECK (situacion IN (1, 2, 3)),
  fecha_nacimiento_contribuyente date     NOT NULL,
  discapacidad                text        NOT NULL DEFAULT 'ninguna' CHECK (discapacidad IN ('ninguna', '33', '65')),
  necesita_asistencia         boolean     NOT NULL DEFAULT false,
  -- descendientes / ascendientes del modelo 145: [{fechaNacimiento, discapacidad, necesitaAsistencia, porEntero, ...}]
  datos                       jsonb       NOT NULL DEFAULT '{"descendientes":[],"ascendientes":[]}',
  -- céntimos enteros (NUNCA euros float): pensión compensatoria al cónyuge y anualidades por alimentos, anuales
  pension_compensatoria_cent  bigint      NOT NULL DEFAULT 0 CHECK (pension_compensatoria_cent >= 0),
  anualidades_alimentos_cent  bigint      NOT NULL DEFAULT 0 CHECK (anualidades_alimentos_cent >= 0),
  hipoteca_vivienda_anterior_2013 boolean NOT NULL DEFAULT false,
  firma_documento_id          uuid,
  comunicada_at               timestamptz NOT NULL DEFAULT now(),
  creada_por                  text,
  creada_at                   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT situacion_familiar_vigencia_ck CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  CONSTRAINT situacion_familiar_unica_ck UNIQUE (empleado_id, vigente_desde)
);
CREATE INDEX IF NOT EXISTS idx_situacion_familiar_empleado ON rrhh.situacion_familiar (empresa_id, empleado_id, vigente_desde DESC);
-- A lo sumo UNA comunicación abierta por empleado (los solapes entre cerradas los valida `validarHistorial` en el código).
CREATE UNIQUE INDEX IF NOT EXISTS uq_situacion_familiar_abierta ON rrhh.situacion_familiar (empleado_id) WHERE vigente_hasta IS NULL;
ALTER TABLE rrhh.situacion_familiar ENABLE ROW LEVEL SECURITY;
-- Sin DELETE: el histórico no se borra (se cierra con vigente_hasta). UPDATE solo para cerrar vigencia / enlazar la firma.
GRANT SELECT, INSERT, UPDATE ON rrhh.situacion_familiar TO rrhh_app;
