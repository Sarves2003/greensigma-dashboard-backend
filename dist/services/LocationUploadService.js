"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationUploadService = void 0;
const exceljs_1 = __importDefault(require("exceljs"));
const sync_1 = require("csv-parse/sync");
const database_1 = require("../config/database");
function normalizePhone(raw) {
    const digits = (raw || '').toString().replace(/\D/g, '');
    return digits.slice(-10);
}
function normalizeEmail(raw) {
    return (raw || '').toString().trim().toLowerCase();
}
class LocationUploadService {
    // Column names in the source file are unpredictable ("Mobile" vs "Phone" vs "WhatsApp Number",
    // etc.), so parsing only extracts raw headers + rows here — the caller (Owner, via the frontend)
    // maps which column is which before anything gets saved.
    async parseFile(buffer, filename) {
        const isExcel = /\.(xlsx|xls)$/i.test(filename);
        if (isExcel) {
            const workbook = new exceljs_1.default.Workbook();
            await workbook.xlsx.load(buffer);
            const sheet = workbook.worksheets[0];
            if (!sheet)
                return { headers: [], rows: [] };
            const rows = [];
            sheet.eachRow((row) => {
                const values = row.values.slice(1); // ExcelJS pads index 0
                rows.push(values.map((v) => (v === null || v === undefined ? '' : String(v.text ?? v).trim())));
            });
            const headers = rows.shift() || [];
            return { headers, rows };
        }
        const text = buffer.toString('utf-8');
        const records = (0, sync_1.parse)(text, { skip_empty_lines: true, relax_column_count: true });
        const headers = records.shift() || [];
        return { headers, rows: records };
    }
    // Upserts by phone (falling back to email if a row has no usable phone), so re-uploading an
    // updated list overwrites stale entries instead of accumulating duplicates.
    async saveMapped(parsed, mapping) {
        const db = (0, database_1.getDatabase)();
        const collection = db.collection('location_uploads');
        let saved = 0;
        let skipped = 0;
        for (const row of parsed.rows) {
            const rawName = row[mapping.name] || '';
            const rawMobile = row[mapping.mobile] || '';
            const rawEmail = row[mapping.email] || '';
            const rawLocation = row[mapping.location] || '';
            const phone = normalizePhone(rawMobile);
            const email = normalizeEmail(rawEmail);
            const location = rawLocation.toString().trim();
            if (!location || (!phone && !email)) {
                skipped++;
                continue;
            }
            const filter = phone ? { phone } : { email };
            await collection.updateOne(filter, {
                $set: {
                    name: rawName.toString().trim(),
                    phone: phone || null,
                    email: email || null,
                    location,
                    uploadedAt: new Date(),
                },
            }, { upsert: true });
            saved++;
        }
        return { saved, skipped };
    }
    async getUploadCount() {
        const db = (0, database_1.getDatabase)();
        return db.collection('location_uploads').countDocuments();
    }
}
exports.LocationUploadService = LocationUploadService;
//# sourceMappingURL=LocationUploadService.js.map