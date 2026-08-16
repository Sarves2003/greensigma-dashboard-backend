import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { getDatabase } from '../config/database';

function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw || '').toString().replace(/\D/g, '');
  return digits.slice(-10);
}

function normalizeEmail(raw: string | null | undefined): string {
  return (raw || '').toString().trim().toLowerCase();
}

export interface ParsedFile {
  headers: string[];
  rows: string[][];
}

export interface ColumnMapping {
  name: number;
  mobile: number;
  email: number;
  location: number;
}

export class LocationUploadService {
  // Column names in the source file are unpredictable ("Mobile" vs "Phone" vs "WhatsApp Number",
  // etc.), so parsing only extracts raw headers + rows here — the caller (Owner, via the frontend)
  // maps which column is which before anything gets saved.
  async parseFile(buffer: Buffer, filename: string): Promise<ParsedFile> {
    const isExcel = /\.(xlsx|xls)$/i.test(filename);

    if (isExcel) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      const sheet = workbook.worksheets[0];
      if (!sheet) return { headers: [], rows: [] };

      const rows: string[][] = [];
      sheet.eachRow((row) => {
        const values = (row.values as any[]).slice(1); // ExcelJS pads index 0
        rows.push(values.map((v) => (v === null || v === undefined ? '' : String(v.text ?? v).trim())));
      });

      const headers = rows.shift() || [];
      return { headers, rows };
    }

    const text = buffer.toString('utf-8');
    const records: string[][] = parse(text, { skip_empty_lines: true, relax_column_count: true });
    const headers = records.shift() || [];
    return { headers, rows: records };
  }

  // Upserts by phone (falling back to email if a row has no usable phone), so re-uploading an
  // updated list overwrites stale entries instead of accumulating duplicates.
  async saveMapped(parsed: ParsedFile, mapping: ColumnMapping): Promise<{ saved: number; skipped: number }> {
    const db = getDatabase();
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
      await collection.updateOne(
        filter,
        {
          $set: {
            name: rawName.toString().trim(),
            phone: phone || null,
            email: email || null,
            location,
            uploadedAt: new Date(),
          },
        },
        { upsert: true }
      );
      saved++;
    }

    return { saved, skipped };
  }

  async getUploadCount(): Promise<number> {
    const db = getDatabase();
    return db.collection('location_uploads').countDocuments();
  }
}
