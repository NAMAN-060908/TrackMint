export type TransactionType = 'expense' | 'income';
export type PaymentMethod = 'upi' | 'cash' | 'card' | 'bank_transfer';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  recipient: string; // For income, this is the 'source'
  description: string;
  type: TransactionType;
  method: PaymentMethod;
  isRefundable: boolean;
  isRefunded: boolean;
  category: string;
  confidence?: ConfidenceLevel;
  isNew?: boolean;
  recurringId?: string; // Link to recurring template if generated from one
}

export interface RecurringTransaction {
  id: string;
  amount: number;
  recipient: string;
  description: string;
  type: TransactionType;
  method: PaymentMethod;
  category: string;
  frequency: RecurringFrequency;
  startDate: string;
  lastProcessedDate?: string;
  isActive: boolean;
}

export interface Asset {
  id: string;
  name: string;
  type: 'liquid' | 'gold' | 'silver' | 'stock' | 'receivable' | 'payable';
  quantity: number; // For liquid/receivable/payable, this is the amount. For others, weight/units.
  totalAmount?: number; // For receivables/payables: total value
  paidAmount?: number; // For receivables/payables: amount already settled
  symbol?: string; // For stocks
  dueDate?: string;
}

export interface AssetPrice {
  gold: number; // per gram
  silver: number; // per gram
  stocks: Record<string, number>;
}

export interface Budget {
  category: string;
  limit: number;
}

export interface FinancialGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  category: string;
}
