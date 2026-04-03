export type TransactionType = 'expense' | 'income';
export type PaymentMethod = 'upi' | 'cash' | 'card' | 'bank_transfer';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

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
}

export interface Asset {
  id: string;
  name: string;
  type: 'liquid' | 'gold' | 'silver' | 'stock';
  quantity: number; // For liquid, this is the amount. For others, it's weight or units.
  symbol?: string; // For stocks
}

export interface AssetPrice {
  gold: number; // per gram
  silver: number; // per gram
  stocks: Record<string, number>;
}
