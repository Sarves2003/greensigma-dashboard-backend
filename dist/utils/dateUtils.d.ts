export declare function convertUTCToIST(utcDate: Date): Date;
export declare function getDateRange(period: string): {
    startDate: Date;
    endDate: Date;
};
export declare function getCustomDateRange(startDate: string, endDate: string): {
    startDate: Date;
    endDate: Date;
};
export declare function formatDateIST(date: Date): string;
export declare function formatDateTimeIST(date: Date): string;
export declare function getHourOfDay(date: Date): number;
export declare function getDayOfWeek(date: Date): string;
export declare function getDateOnlyIST(date: Date): Date;
export declare function isSameDay(date1: Date, date2: Date): boolean;
export declare function isAfterDate(date: string): (dt: Date) => boolean;
export declare function isBeforeDate(date: string): (dt: Date) => boolean;
//# sourceMappingURL=dateUtils.d.ts.map