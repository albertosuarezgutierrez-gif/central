/**
 * ROI Intranet — Google Apps Script (Drive)
 * Web App para subir, listar, leer y archivar facturas en Google Drive.
 *
 * SETUP:
 * 1. script.google.com → Nuevo proyecto → pega este código
 * 2. Edita ROOT_FOLDER_ID con el ID de tu carpeta de facturas en Drive
 * 3. Implementar → Nueva implementación → Web app
 *    - Ejecutar como: Yo (tu cuenta Google)
 *    - Acceso: Cualquier persona (Anyone)
 * 4. Copia la URL → Vercel env (sivra): DRIVE_SCRIPT_URL=<url>
 *
 * API (POST JSON con campo "action"):
 *  - upload  { fileBase64|base64Data, fileName, mimeType, fecha? } → { ok, fileId, url, carpeta, nombre }
 *  - list    {}                                       → { ok, files:[{id,nombre,mime}] }  (PDFs en RAÍZ, sin archivar)
 *  - get     { fileId }                               → { ok, fileBase64, mimeType, nombre }
 *  - archive { fileId, fecha }                        → { ok, carpeta }  (mueve a AÑO/MES)
 */

// ── CONFIGURACIÓN ──────────────────────────────────────────────────────────────
// Carpeta "ALBERTO 2026 PERSONAL (SEGUROS)" de Drive (ya es del año 2026, con
// subcarpetas por mes en MAYÚSCULAS: ENERO, FEBRERO… → se respeta esa estructura).
const ROOT_FOLDER_ID = "1pyW0_QNOCYuD_0az13sP7MpDyhhNVXt7";
const SUBFOLDER_BY_YEAR = false;  // la carpeta raíz ya es la del año
const SUBFOLDER_BY_MONTH = true;  // archiva en ENERO/FEBRERO/… como ya las tienes

const MONTH_NAMES = [
  "ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO",
  "JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"
];

function json_(obj) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  output.setContent(JSON.stringify(obj));
  return output;
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || "upload";
    if (action === "upload")  return doUpload_(data);
    if (action === "list")    return doList_();
    if (action === "get")     return doGet_(data);
    if (action === "archive") return doArchive_(data);
    return json_({ ok: false, error: "acción desconocida: " + action });
  } catch (err) {
    return json_({ ok: false, error: err.toString() });
  }
}

function doGet(e) {
  return json_({ ok: true, status: "ROI Drive Script activo" });
}

// ── UPLOAD ──────────────────────────────────────────────────────────────────────
function doUpload_(data) {
  const fileBase64 = data.fileBase64 || data.base64Data;
  const { fileName, mimeType, fecha } = data;
  if (!fileBase64 || !fileName) return json_({ ok: false, error: "Faltan campos: fileBase64 o fileName" });

  const targetFolder = carpetaDestino_(fecha);
  const bytes = Utilities.base64Decode(fileBase64);
  const blob = Utilities.newBlob(bytes, mimeType || "application/pdf", fileName);
  const file = targetFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return json_({ ok: true, fileId: file.getId(), url: file.getUrl(), carpeta: targetFolder.getName(), nombre: file.getName() });
}

// ── LIST (PDFs en la raíz, aún sin archivar por año/mes) ─────────────────────────
function doList_() {
  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const it = root.getFiles();
  const files = [];
  while (it.hasNext()) {
    const f = it.next();
    const mime = f.getMimeType();
    if (mime === "application/pdf" || mime.indexOf("image/") === 0) {
      files.push({ id: f.getId(), nombre: f.getName(), mime: mime });
    }
  }
  return json_({ ok: true, files: files });
}

// ── GET (contenido en base64) ────────────────────────────────────────────────────
function doGet_(data) {
  if (!data.fileId) return json_({ ok: false, error: "Falta fileId" });
  const file = DriveApp.getFileById(data.fileId);
  const blob = file.getBlob();
  return json_({
    ok: true,
    fileBase64: Utilities.base64Encode(blob.getBytes()),
    mimeType: blob.getContentType(),
    nombre: file.getName(),
  });
}

// ── ARCHIVE (mover a AÑO/MES) ────────────────────────────────────────────────────
function doArchive_(data) {
  if (!data.fileId) return json_({ ok: false, error: "Falta fileId" });
  const file = DriveApp.getFileById(data.fileId);
  const target = carpetaDestino_(data.fecha || new Date().toISOString());
  file.moveTo(target);
  return json_({ ok: true, carpeta: target.getName() });
}

// ── HELPERS ──────────────────────────────────────────────────────────────────────
function carpetaDestino_(fecha) {
  let target = DriveApp.getFolderById(ROOT_FOLDER_ID);
  if (fecha) {
    const d = new Date(fecha);
    if (!isNaN(d.getTime())) {
      if (SUBFOLDER_BY_YEAR)  target = getOrCreateSubfolder_(target, d.getFullYear().toString());
      if (SUBFOLDER_BY_MONTH) target = getOrCreateSubfolder_(target, MONTH_NAMES[d.getMonth()]);
    }
  }
  return target;
}

function getOrCreateSubfolder_(parent, name) {
  const existing = parent.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return parent.createFolder(name);
}
