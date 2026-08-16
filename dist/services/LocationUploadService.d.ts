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
export declare class LocationUploadService {
    parseFile(buffer: Buffer, filename: string): Promise<ParsedFile>;
    saveMapped(parsed: ParsedFile, mapping: ColumnMapping): Promise<{
        saved: number;
        skipped: number;
    }>;
    getUploadCount(): Promise<number>;
}
//# sourceMappingURL=LocationUploadService.d.ts.map