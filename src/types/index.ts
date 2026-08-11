export interface User {
  _id: string;
  name: string;
  email?: string;
  mobile?: string;
  whatsappNumber?: string;
  state?: string;
  district?: string;
  type: 'Webinar' | 'Free' | 'Tribe';
  referalCode?: string;
  referalType?: string;
  createdOn: Date;
}

export interface LoginLog {
  userId: string;
  loginTime: Date;
  status: 'SUCCESS' | 'FAILURE';
  channel: 'EMAIL' | 'WHATSAPP';
}

export interface StockScore {
  userId: string;
  savedDate: Date;
}

export interface BacktestResult {
  userId: string;
  savedDate: Date;
  status: 'Success' | 'Failed' | 'InProgress';
}

export interface ETFScore {
  userId: string;
  requestedAt: Date;
}

export interface ETFBacktest {
  userId: string;
  savedDate: Date;
  status: 'Success' | 'Failed' | 'InProgress';
}

export interface BrokerDetails {
  userId: string;
  borkrageType: 'kite' | 'zebu' | 'paper_trade';
  apiKey?: string;
  apiSecret?: string;
  createdAt: Date;
  accessTokenIssuedAt?: Date;
}

export interface StockHolding {
  exchange: string;
  tradingsymbol: string;
  quantity: number;
  price: number;
  averagePrice?: number;
  transaction_type?: string;
  order_type?: string;
  product?: string;
}

export interface Portfolio {
  userId: string;
  createdAt: Date;
  updatedAt?: Date;
  borkrageType?: string;
  isInvested: boolean;
  fromBacktest?: boolean;
  investmentCapital?: number;
  portfolioName?: string;
  stockDetails?: StockHolding[];
}

export interface StockListItem {
  tradingsymbol: string;
  instrument_token?: number;
  company_name?: string;
  industry?: string;
  last_price: number;
  timestamp?: Date;
}

export interface RealizedReturnEntry {
  tradingsymbol: string;
  quantity: number;
  buyPrice: number;
  closePrice: number;
  returns: number;
  timestamp: Date;
}

export interface RealizedReturnsDoc {
  portfolioId: unknown;
  realizedReturns: RealizedReturnEntry[];
}

export interface IntradayScore {
  userId: string;
  savedDate: Date;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface FilterOptions {
  dateRange: DateRange;
  userType?: string;
  referralCode?: string;
  state?: string;
  district?: string;
  brokerTypes?: string[];
}

export interface KPIResponse {
  value: number;
  trend?: number;
  label: string;
}

export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface UserJourney {
  userId: string;
  userName: string;
  events: Activity[];
}

export interface Activity {
  type: string;
  timestamp: Date;
  details?: Record<string, unknown>;
}

export interface CohortData {
  cohortDate: string;
  retention: Record<string, number>;
}

export interface DashboardUser {
  _id?: unknown;
  name: string;
  email: string;
  passwordHash: string;
  role: import('../config/permissions').Role;
  permissionOverrides?: {
    grant?: string[];
    revoke?: string[];
  };
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
  lastLoginAt?: Date;
}

export interface RolePermissionDoc {
  _id?: unknown;
  role: import('../config/permissions').Role;
  permissions: string[];
  updatedAt?: Date;
}
