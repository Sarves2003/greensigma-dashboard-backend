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

export interface Portfolio {
  userId: string;
  createdAt: Date;
  borkrageType?: string;
  isInvested: boolean;
  fromBacktest?: boolean;
  investmentCapital?: number;
  stockDetails?: Record<string, unknown>;
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
