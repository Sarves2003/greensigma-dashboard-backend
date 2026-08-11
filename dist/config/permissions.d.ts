export type PermissionType = 'tab' | 'card';
export interface PermissionDef {
    key: string;
    label: string;
    type: PermissionType;
    tabKey?: string;
}
export declare const ROLES: readonly ["owner", "super_admin", "manager", "product_manager", "sales_team"];
export type Role = (typeof ROLES)[number];
export declare const ROLE_LABELS: Record<Role, string>;
export declare const ROLE_RANK: Record<Role, number>;
export declare const PERMISSIONS: PermissionDef[];
export declare const PERMISSION_KEYS: string[];
export declare const TAB_KEYS: string[];
export declare function isValidPermissionKey(key: string): boolean;
export declare const ROUTE_PERMISSION_MAP: Record<string, string>;
export declare const DEFAULT_ROLE_PERMISSIONS: Record<Role, string[]>;
//# sourceMappingURL=permissions.d.ts.map