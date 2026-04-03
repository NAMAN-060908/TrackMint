/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Upload, Filter, Search, IndianRupee, Receipt, Wallet, ArrowUpRight, ArrowDownLeft, CheckCircle2, XCircle, Trash2, TrendingUp, Coins, BarChart3, Calendar, Tag, AlertCircle, CheckCircle, Info, Loader2, Repeat, Clock, ArrowRightLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, addDays, addWeeks, addMonths, addYears, isBefore, startOfDay } from 'date-fns';
import { useDropzone } from 'react-dropzone';
import { Transaction, TransactionType, PaymentMethod, Asset, AssetPrice, ConfidenceLevel, RecurringTransaction, RecurringFrequency, Budget, FinancialGoal } from './types';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { analyzeUPIScreenshot, fetchAssetPrices } from './services/geminiService';
import { cn } from './lib/utils';

const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Rent', 'Salary', 'Investment', 'Entertainment', 'Health', 'Other'];
const FREQUENCIES: RecurringFrequency[] = ['daily', 'weekly', 'monthly', 'yearly'];

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('transactions');
    return saved ? JSON.parse(saved) : [];
  });

  const [assets, setAssets] = useState<Asset[]>(() => {
    const saved = localStorage.getItem('assets');
    return saved ? JSON.parse(saved) : [
      { id: '1', name: 'Cash/Bank', type: 'liquid', quantity: 0 },
    ];
  });

  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>(() => {
    const saved = localStorage.getItem('recurringTransactions');
    return saved ? JSON.parse(saved) : [];
  });

  const [budgets, setBudgets] = useState<Budget[]>(() => {
    const saved = localStorage.getItem('budgets');
    return saved ? JSON.parse(saved) : [];
  });

  const [goals, setGoals] = useState<FinancialGoal[]>(() => {
    const saved = localStorage.getItem('goals');
    return saved ? JSON.parse(saved) : [];
  });

  const [assetPrices, setAssetPrices] = useState<AssetPrice>({
    gold: 7500,
    silver: 95,
    stocks: {}
  });
  
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [isManagingAssets, setIsManagingAssets] = useState(false);
  const [isManagingRecurring, setIsManagingRecurring] = useState(false);
  const [isManagingBudgets, setIsManagingBudgets] = useState(false);
  const [isManagingGoals, setIsManagingGoals] = useState(false);
  const [isViewingInsights, setIsViewingInsights] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'refundable' | 'refunded' | 'income' | 'expense'>('all');
  const [filterCategory, setFilterCategory] = useState('All');
  const [searchRecipient, setSearchRecipient] = useState('');

  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  // Toast management
  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = generateId();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // Clear "isNew" flag after 5 seconds
  useEffect(() => {
    const hasNew = transactions.some(t => t.isNew);
    if (!hasNew) return;

    const timer = setTimeout(() => {
      setTransactions(prev => prev.map(t => ({ ...t, isNew: false })));
    }, 5000);
    return () => clearTimeout(timer);
  }, [transactions]);

  // Persist to local storage
  useEffect(() => {
    localStorage.setItem('transactions', JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem('assets', JSON.stringify(assets));
  }, [assets]);

  useEffect(() => {
    localStorage.setItem('recurringTransactions', JSON.stringify(recurringTransactions));
  }, [recurringTransactions]);

  useEffect(() => {
    localStorage.setItem('budgets', JSON.stringify(budgets));
  }, [budgets]);

  useEffect(() => {
    localStorage.setItem('goals', JSON.stringify(goals));
  }, [goals]);

  // Process recurring transactions
  useEffect(() => {
    const processRecurring = () => {
      const today = startOfDay(new Date());
      const newTransactions: Transaction[] = [];
      const updatedRecurring = recurringTransactions.map(rt => {
        if (!rt.isActive) return rt;

        let nextDate = rt.lastProcessedDate 
          ? new Date(rt.lastProcessedDate) 
          : new Date(rt.startDate);
        
        // If it's the first time, check if startDate is today or in the past
        if (!rt.lastProcessedDate) {
          nextDate = startOfDay(nextDate);
        } else {
          // Calculate next occurrence
          if (rt.frequency === 'daily') nextDate = addDays(nextDate, 1);
          else if (rt.frequency === 'weekly') nextDate = addWeeks(nextDate, 1);
          else if (rt.frequency === 'monthly') nextDate = addMonths(nextDate, 1);
          else if (rt.frequency === 'yearly') nextDate = addYears(nextDate, 1);
        }

        let currentRt = { ...rt };
        while (isBefore(nextDate, today) || nextDate.getTime() === today.getTime()) {
          newTransactions.push({
            id: crypto.randomUUID(),
            amount: rt.amount,
            recipient: rt.recipient,
            date: nextDate.toISOString(),
            description: rt.description + " (Recurring)",
            type: rt.type,
            method: rt.method,
            isRefundable: false,
            isRefunded: false,
            category: rt.category,
            isNew: true,
            recurringId: rt.id
          });

          currentRt.lastProcessedDate = nextDate.toISOString();
          
          if (rt.frequency === 'daily') nextDate = addDays(nextDate, 1);
          else if (rt.frequency === 'weekly') nextDate = addWeeks(nextDate, 1);
          else if (rt.frequency === 'monthly') nextDate = addMonths(nextDate, 1);
          else if (rt.frequency === 'yearly') nextDate = addYears(nextDate, 1);
        }
        return currentRt;
      });

      if (newTransactions.length > 0) {
        setTransactions(prev => [...newTransactions, ...prev]);
        setRecurringTransactions(updatedRecurring);
        addToast(`Processed ${newTransactions.length} recurring transactions`);
      }
    };

    processRecurring();
    // Check every hour
    const interval = setInterval(processRecurring, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [recurringTransactions, addToast]);

  // Fetch asset prices on mount and every 5 minutes
  useEffect(() => {
    const updatePrices = async () => {
      const stockSymbols = assets.filter(a => a.type === 'stock').map(a => a.symbol || '');
      const prices = await fetchAssetPrices(stockSymbols);
      setAssetPrices(prices);
    };
    updatePrices();
    const interval = setInterval(updatePrices, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [assets]);

  const stats = useMemo(() => {
    const totalExpenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => acc + t.amount, 0);
    
    const totalIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((acc, t) => acc + t.amount, 0);

    const totalRefundable = transactions
      .filter(t => t.isRefundable && !t.isRefunded)
      .reduce((acc, t) => acc + t.amount, 0);

    const totalRefunded = transactions
      .filter(t => t.isRefundable && t.isRefunded)
      .reduce((acc, t) => acc + t.amount, 0);

    const totalReceivable = assets
      .filter(a => a.type === 'receivable')
      .reduce((acc, a) => acc + ((a.totalAmount || 0) - (a.paidAmount || 0)), 0);

    const totalPayable = assets
      .filter(a => a.type === 'payable')
      .reduce((acc, a) => acc + ((a.totalAmount || 0) - (a.paidAmount || 0)), 0);

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const monthlySpendingByCategory = transactions
      .filter(t => {
        const d = new Date(t.date);
        return t.type === 'expense' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

    const budgetStats = budgets.map(b => ({
      ...b,
      spent: monthlySpendingByCategory[b.category] || 0,
      percent: Math.min(100, ((monthlySpendingByCategory[b.category] || 0) / b.limit) * 100)
    }));

    // Chart Data: Category Breakdown (All time or current month)
    const categoryData = Object.entries(
      transactions
        .filter(t => t.type === 'expense')
        .reduce((acc, t) => {
          acc[t.category] = (acc[t.category] || 0) + t.amount;
          return acc;
        }, {} as Record<string, number>)
    ).map(([name, value]) => ({ name, value }));

    // Chart Data: Monthly Trend (Last 6 months)
    const monthlyTrend = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      const monthLabel = format(d, 'MMM');
      const month = d.getMonth();
      const year = d.getFullYear();
      
      const income = transactions
        .filter(t => {
          const td = new Date(t.date);
          return t.type === 'income' && td.getMonth() === month && td.getFullYear() === year;
        })
        .reduce((acc, t) => acc + t.amount, 0);

      const expense = transactions
        .filter(t => {
          const td = new Date(t.date);
          return t.type === 'expense' && td.getMonth() === month && td.getFullYear() === year;
        })
        .reduce((acc, t) => acc + t.amount, 0);

      return { name: monthLabel, income, expense };
    });

    const goalStats = goals.map(g => ({
      ...g,
      percent: Math.min(100, (g.currentAmount / g.targetAmount) * 100)
    }));

    const savings = totalIncome - totalExpenses;

    const assetValue = assets.reduce((acc, asset) => {
      if (asset.type === 'liquid') return acc + asset.quantity;
      if (asset.type === 'gold') return acc + (asset.quantity * assetPrices.gold);
      if (asset.type === 'silver') return acc + (asset.quantity * assetPrices.silver);
      if (asset.type === 'stock' && asset.symbol) return acc + (asset.quantity * (assetPrices.stocks[asset.symbol] || 0));
      if (asset.type === 'receivable') return acc + ((asset.totalAmount || 0) - (asset.paidAmount || 0));
      if (asset.type === 'payable') return acc - ((asset.totalAmount || 0) - (asset.paidAmount || 0));
      return acc;
    }, 0);

    return { totalExpenses, totalIncome, totalRefundable, totalRefunded, totalReceivable, totalPayable, savings, assetValue, budgetStats, categoryData, monthlyTrend, goalStats };
  }, [transactions, assets, assetPrices, budgets, goals]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchesSearch = t.recipient.toLowerCase().includes(searchRecipient.toLowerCase()) || 
                           t.description.toLowerCase().includes(searchRecipient.toLowerCase());
      
      const matchesCategory = filterCategory === 'All' || t.category === filterCategory;
      
      let matchesType = true;
      if (filterType === 'refundable') matchesType = t.isRefundable && !t.isRefunded;
      else if (filterType === 'refunded') matchesType = t.isRefundable && t.isRefunded;
      else if (filterType === 'income') matchesType = t.type === 'income';
      else if (filterType === 'expense') matchesType = t.type === 'expense';
      
      return matchesSearch && matchesCategory && matchesType;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, searchRecipient, filterType, filterCategory]);

  const handleAddTransaction = (newTx: Omit<Transaction, 'id'>) => {
    const transaction: Transaction = {
      ...newTx,
      id: generateId(),
      isNew: true,
    };
    setTransactions(prev => [transaction, ...prev]);
    setIsAddingManual(false);
    addToast('Transaction added successfully');
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
    addToast('Transaction deleted', 'info');
  };

  const toggleRefundable = (id: string) => {
    setTransactions(prev => prev.map(t => 
      t.id === id ? { ...t, isRefundable: !t.isRefundable, isRefunded: false } : t
    ));
    const tx = transactions.find(t => t.id === id);
    if (tx) {
      addToast(tx.isRefundable ? 'Marked as non-refundable' : 'Marked as refundable');
    }
  };

  const toggleRefundStatus = (id: string) => {
    setTransactions(prev => prev.map(t => 
      t.id === id ? { ...t, isRefunded: !t.isRefunded } : t
    ));
  };

  const handleAddAsset = (newAsset: Omit<Asset, 'id'>) => {
    setAssets(prev => [...prev, { ...newAsset, id: generateId() }]);
  };

  const handleUpdateAssetQuantity = (id: string, quantity: number) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, quantity } : a));
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    setIsUploading(true);
    try {
      const file = acceptedFiles[0];
      
      // Compress image before sending to Gemini
      const compressedBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            // Max dimensions for Gemini processing (1600px is usually enough for OCR)
            const MAX_DIM = 1600;
            if (width > height) {
              if (width > MAX_DIM) {
                height *= MAX_DIM / width;
                width = MAX_DIM;
              }
            } else {
              if (height > MAX_DIM) {
                width *= MAX_DIM / height;
                height = MAX_DIM;
              }
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            
            // Compress to JPEG with 0.7 quality
            resolve(canvas.toDataURL('image/jpeg', 0.7));
          };
          img.onerror = reject;
          img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const extracted = await analyzeUPIScreenshot(compressedBase64);
      
      const newTxs = extracted.map(tx => ({
        id: generateId(),
        amount: tx.amount || 0,
        recipient: tx.recipient || 'Unknown',
        date: tx.date || new Date().toISOString(),
        description: tx.description || 'Extracted from UPI screenshot',
        type: 'expense' as TransactionType,
        method: 'upi' as PaymentMethod,
        isRefundable: false,
        isRefunded: false,
        category: 'General',
        confidence: tx.confidence as ConfidenceLevel || 'medium',
      }));
      
      setPendingTransactions(newTxs);
      addToast(`${newTxs.length} transactions detected`, 'info');
    } catch (error: any) {
      console.error("Failed to process screenshot", error);
      const errorMessage = error?.message || "Unknown error";
      addToast(`Failed to process screenshot: ${errorMessage}`, "error");
    } finally {
      setIsUploading(false);
    }
  };

  const confirmTransactions = () => {
    const txsWithNewFlag = pendingTransactions.map(t => ({ ...t, isNew: true }));
    setTransactions(prev => [...txsWithNewFlag, ...prev]);
    addToast(`${pendingTransactions.length} transactions successfully added`);
    setPendingTransactions([]);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 'image/*': [] as string[] },
    multiple: false 
  } as any);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 py-3 md:py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-200">
                <IndianRupee className="text-white" size={20} />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  TrackMint
                </h1>
                <p className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest">Wealth Tracker</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <button 
                onClick={() => {
                  if (confirm("Are you sure you want to clear all data? This cannot be undone.")) {
                    localStorage.clear();
                    window.location.reload();
                  }
                }}
                className="flex-1 md:flex-none bg-red-50 text-red-600 px-2.5 py-1.5 rounded-lg font-medium flex items-center justify-center gap-1.5 hover:bg-red-100 transition-colors text-[10px]"
                title="Clear All Data"
              >
                <Trash2 size={12} />
                Reset
              </button>
              <button 
                onClick={() => setIsManagingRecurring(true)}
                className="flex-1 md:flex-none bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg font-medium flex items-center justify-center gap-1.5 hover:bg-slate-200 transition-colors text-[10px]"
              >
                <Repeat size={12} />
                Recurring
              </button>
              <button 
                onClick={() => setIsManagingBudgets(true)}
                className="flex-1 md:flex-none bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg font-medium flex items-center justify-center gap-1.5 hover:bg-slate-200 transition-colors text-[10px]"
              >
                <Filter size={12} />
                Budgets
              </button>
              <button 
                onClick={() => setIsManagingGoals(true)}
                className="flex-1 md:flex-none bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg font-medium flex items-center justify-center gap-1.5 hover:bg-slate-200 transition-colors text-[10px]"
              >
                <TrendingUp size={12} />
                Goals
              </button>
              <button 
                onClick={() => setIsViewingInsights(true)}
                className="flex-1 md:flex-none bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg font-medium flex items-center justify-center gap-1.5 hover:bg-slate-200 transition-colors text-[10px]"
              >
                <BarChart3 size={12} />
                Insights
              </button>
              <button 
                onClick={() => setIsManagingAssets(true)}
                className="flex-1 md:flex-none bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg font-medium flex items-center justify-center gap-1.5 hover:bg-slate-200 transition-colors text-[10px]"
              >
                <Wallet size={12} />
                Assets
              </button>
              <button 
                onClick={() => setIsAddingManual(true)}
                className="flex-[2] md:flex-none bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-medium flex items-center justify-center gap-1.5 hover:bg-indigo-700 transition-colors shadow-sm text-[10px]"
              >
                <Plus size={14} />
                Add
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mb-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-3 md:p-4 rounded-xl border border-slate-200 shadow-sm"
          >
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <TrendingUp size={14} className="text-green-600" />
              <span className="text-[10px] md:text-xs font-medium">Income</span>
            </div>
            <p className="text-base md:text-lg font-bold text-green-600">₹{stats.totalIncome.toLocaleString()}</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white p-3 md:p-4 rounded-xl border border-slate-200 shadow-sm"
          >
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <ArrowUpRight size={14} className="text-red-600" />
              <span className="text-[10px] md:text-xs font-medium">Expenses</span>
            </div>
            <p className="text-base md:text-lg font-bold text-red-600">₹{stats.totalExpenses.toLocaleString()}</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white p-3 md:p-4 rounded-xl border border-slate-200 shadow-sm"
          >
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Clock size={14} className="text-blue-600" />
              <span className="text-[10px] md:text-xs font-medium">Receivable</span>
            </div>
            <p className="text-base md:text-lg font-bold text-blue-600">₹{stats.totalReceivable.toLocaleString()}</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white p-3 md:p-4 rounded-xl border border-slate-200 shadow-sm"
          >
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Wallet size={14} className="text-indigo-600" />
              <span className="text-[10px] md:text-xs font-medium">Savings</span>
            </div>
            <p className="text-base md:text-lg font-bold text-indigo-600">₹{stats.savings.toLocaleString()}</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white p-3 md:p-4 rounded-xl border border-slate-200 shadow-sm col-span-2 lg:col-span-1"
          >
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Coins size={14} className="text-amber-600" />
              <span className="text-[10px] md:text-xs font-medium">Net Worth</span>
            </div>
            <p className="text-base md:text-lg font-bold text-amber-600">₹{Math.round(stats.assetValue).toLocaleString()}</p>
          </motion.div>
        </div>

        {/* Upload Area */}
        <div 
          {...getRootProps()} 
          className={cn(
            "mb-8 border-2 border-dashed rounded-2xl p-8 transition-all cursor-pointer flex flex-col items-center justify-center gap-4",
            isDragActive ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:border-indigo-400",
            isUploading && "opacity-50 pointer-events-none"
          )}
        >
          <input {...getInputProps()} />
          <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full">
            {isUploading ? (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              >
                <Upload size={32} />
              </motion.div>
            ) : (
              <Upload size={32} />
            )}
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold">
              {isUploading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="animate-spin" size={20} />
                  🔍 Scanning transactions...
                </span>
              ) : "Upload UPI Screenshot"}
            </p>
            <p className="text-slate-500 text-sm">
              Drag and drop or click to scan your transaction history
            </p>
          </div>
        </div>

        {/* Budget Progress */}
        {stats.budgetStats.length > 0 && (
          <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.budgetStats.map(budget => (
              <div key={budget.category} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold text-sm text-slate-700">{budget.category}</h3>
                  <span className={cn(
                    "text-xs font-bold",
                    budget.percent >= 100 ? "text-red-600" : budget.percent >= 80 ? "text-amber-600" : "text-indigo-600"
                  )}>
                    ₹{budget.spent.toLocaleString()} / ₹{budget.limit.toLocaleString()}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${budget.percent}%` }}
                    className={cn(
                      "h-full transition-all",
                      budget.percent >= 100 ? "bg-red-500" : budget.percent >= 80 ? "bg-amber-500" : "bg-indigo-500"
                    )}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1 font-medium">
                  {budget.percent >= 100 ? "Budget exceeded!" : `${Math.round(100 - budget.percent)}% remaining`}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Financial Goals */}
        {stats.goalStats.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <TrendingUp size={20} className="text-indigo-600" />
              Financial Goals
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {stats.goalStats.map(goal => (
                <div key={goal.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-slate-900">{goal.name}</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{goal.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-indigo-600">₹{goal.currentAmount.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-400">of ₹{goal.targetAmount.toLocaleString()}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold text-slate-500">
                      <span>Progress</span>
                      <span>{Math.round(goal.percent)}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${goal.percent}%` }}
                        className="h-full bg-indigo-600"
                      />
                    </div>
                  </div>
                  
                  {goal.deadline && (
                    <div className="mt-4 flex items-center gap-1.5 text-[10px] text-slate-500 font-medium">
                      <Clock size={12} />
                      Target: {format(new Date(goal.deadline), 'MMM dd, yyyy')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="space-y-4 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                placeholder="Search recipient or source..."
                value={searchRecipient}
                onChange={(e) => setSearchRecipient(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
              {(['all', 'income', 'expense', 'refundable', 'refunded'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={cn(
                    "px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-all text-sm",
                    filterType === type 
                      ? "bg-slate-900 text-white" 
                      : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
                  )}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={() => setFilterCategory('All')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all",
                filterCategory === 'All' ? "bg-indigo-100 text-indigo-700" : "bg-white border border-slate-200 text-slate-500"
              )}
            >
              All Categories
            </button>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all",
                  filterCategory === cat ? "bg-indigo-100 text-indigo-700" : "bg-white border border-slate-200 text-slate-500"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Transaction List */}
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filteredTransactions.map((tx) => (
              <motion.div
                layout
                key={tx.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ 
                  opacity: 1, 
                  scale: 1,
                  boxShadow: tx.isNew ? "0 0 20px rgba(79, 70, 229, 0.2)" : "0 1px 2px rgba(0,0,0,0.05)"
                }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={cn(
                  "bg-white p-4 rounded-xl border transition-all flex items-center justify-between group relative overflow-hidden",
                  tx.isNew ? "border-indigo-400 ring-1 ring-indigo-400" : "border-slate-200"
                )}
              >
                {tx.isNew && (
                  <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                )}
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className={cn(
                    "p-3 rounded-lg",
                    tx.type === 'expense' ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                  )}>
                    {tx.type === 'expense' ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-900 truncate">{tx.recipient}</h3>
                      {tx.confidence && (
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase",
                          tx.confidence === 'high' ? "bg-green-100 text-green-700" :
                          tx.confidence === 'medium' ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-700"
                        )}>
                          {tx.confidence}
                        </span>
                      )}
                      {tx.isNew && (
                        <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase">
                          New
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] md:text-xs text-slate-500 mt-0.5">
                      <span className="flex items-center gap-1"><Calendar size={12} />{format(new Date(tx.date), 'MMM dd, yyyy')}</span>
                      <span className="hidden sm:inline">•</span>
                      <span className="flex items-center gap-1"><Tag size={12} />{tx.category}</span>
                      {tx.recurringId && (
                        <>
                          <span className="hidden sm:inline">•</span>
                          <span className="flex items-center gap-1 text-indigo-600"><Repeat size={10} />Recurring</span>
                        </>
                      )}
                      <span className="hidden sm:inline">•</span>
                      <span className="uppercase">{(tx.method || 'cash').replace('_', ' ')}</span>
                      {tx.isRefundable && (
                        <>
                          <span className="hidden sm:inline">•</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded font-semibold",
                            tx.isRefunded ? "bg-green-100 text-green-700" : "bg-indigo-100 text-indigo-700"
                          )}>
                            {tx.isRefunded ? "Refunded" : "Refundable"}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <div className="text-left sm:text-right">
                    <p className={cn(
                      "text-base sm:text-lg font-bold",
                      tx.type === 'expense' ? "text-slate-900" : "text-green-600"
                    )}>
                      {tx.type === 'expense' ? '-' : '+'}₹{tx.amount.toLocaleString()}
                    </p>
                    <p className="text-[10px] sm:text-xs text-slate-400 truncate max-w-[150px]">{tx.description}</p>
                  </div>
                  
                  <div className="flex gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => toggleRefundable(tx.id)}
                      className={cn(
                        "p-2 rounded-lg transition-colors",
                        tx.isRefundable ? "text-indigo-600 bg-indigo-50" : "text-slate-400 hover:bg-slate-100"
                      )}
                      title={tx.isRefundable ? "Remove Refundable Mark" : "Mark as Refundable"}
                    >
                      <Receipt size={18} />
                    </button>
                    {tx.isRefundable && (
                      <button 
                        onClick={() => toggleRefundStatus(tx.id)}
                        className={cn(
                          "p-2 rounded-lg transition-colors",
                          tx.isRefunded ? "text-green-600 bg-green-50" : "text-slate-400 hover:bg-slate-100"
                        )}
                        title={tx.isRefunded ? "Mark as Pending" : "Mark as Refunded"}
                      >
                        <CheckCircle2 size={18} />
                      </button>
                    )}
                    <button 
                      onClick={() => handleDeleteTransaction(tx.id)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredTransactions.length === 0 && (
            <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 border-dashed">
              <Receipt className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="text-slate-500 font-medium">No transactions found</p>
              <p className="text-slate-400 text-sm">Try uploading a screenshot or adding manually</p>
            </div>
          )}
        </div>
      </main>

      {/* Manual Entry Modal */}
      <AnimatePresence>
        {isAddingManual && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingManual(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md max-h-[95vh] overflow-y-auto rounded-2xl shadow-2xl relative z-10 m-2"
            >
              <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-lg md:text-xl font-bold">Add Transaction</h2>
                <button onClick={() => setIsAddingManual(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle size={24} />
                </button>
              </div>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  handleAddTransaction({
                    amount: Number(formData.get('amount')),
                    recipient: formData.get('recipient') as string,
                    date: new Date(formData.get('date') as string).toISOString(),
                    description: formData.get('description') as string,
                    type: formData.get('type') as TransactionType,
                    method: formData.get('method') as PaymentMethod,
                    isRefundable: formData.get('isRefundable') === 'on',
                    isRefunded: false,
                    category: formData.get('category') as string,
                  });
                }}
                className="p-4 md:p-6 space-y-4"
              >
                <div className="flex p-1 bg-slate-100 rounded-lg">
                  <label className="flex-1 cursor-pointer">
                    <input type="radio" name="type" value="expense" defaultChecked className="sr-only peer" />
                    <div className="text-center py-2 rounded-md peer-checked:bg-white peer-checked:text-red-600 peer-checked:shadow-sm text-slate-500 font-bold transition-all">Expense</div>
                  </label>
                  <label className="flex-1 cursor-pointer">
                    <input type="radio" name="type" value="income" className="sr-only peer" />
                    <div className="text-center py-2 rounded-md peer-checked:bg-white peer-checked:text-green-600 peer-checked:shadow-sm text-slate-500 font-bold transition-all">Income</div>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Amount (₹)</label>
                    <input required name="amount" type="number" step="0.01" placeholder="0.00" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
                    <input required name="date" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Recipient / Source</label>
                  <input required name="recipient" type="text" placeholder="Who or where?" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Category</label>
                    <select name="category" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                      {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Method</label>
                    <select name="method" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                      <option value="cash">Cash</option>
                      <option value="upi">UPI</option>
                      <option value="card">Card</option>
                      <option value="bank_transfer">Bank Transfer</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
                  <input name="description" type="text" placeholder="Optional notes" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input name="isRefundable" type="checkbox" className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
                    <span className="text-sm font-semibold text-slate-700">Refundable Expense?</span>
                  </label>
                </div>

                <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 mt-4">
                  Save Transaction
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Asset Management Modal */}
      <AnimatePresence>
        {isManagingAssets && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsManagingAssets(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[95vh] m-2"
            >
              <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-lg md:text-xl font-bold">Asset Management</h2>
                <button onClick={() => setIsManagingAssets(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle size={24} />
                </button>
              </div>
              
              <div className="p-4 md:p-6 overflow-y-auto flex-1 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Add Asset Form */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <h3 className="font-bold mb-4 flex items-center gap-2"><Plus size={18} /> Add New Asset</h3>
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        handleAddAsset({
                          name: formData.get('name') as string,
                          type: formData.get('type') as any,
                          quantity: Number(formData.get('quantity')),
                          symbol: formData.get('symbol') as string || undefined,
                          totalAmount: formData.get('totalAmount') ? Number(formData.get('totalAmount')) : undefined,
                          paidAmount: formData.get('paidAmount') ? Number(formData.get('paidAmount')) : undefined,
                          dueDate: formData.get('dueDate') as string || undefined,
                        });
                        e.currentTarget.reset();
                      }}
                      className="space-y-3"
                    >
                      <input required name="name" placeholder="Asset Name (e.g. HDFC Stock)" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                      <select name="type" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                        <option value="liquid">Liquid (Cash/Bank)</option>
                        <option value="gold">Gold (Grams)</option>
                        <option value="silver">Silver (Grams)</option>
                        <option value="stock">Stock (Units)</option>
                        <option value="receivable">Receivable (Money Owed to You)</option>
                        <option value="payable">Payable (Money You Owe)</option>
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <input required name="quantity" type="number" step="0.001" placeholder="Quantity/Amount" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                        <input name="symbol" placeholder="Symbol (for stocks)" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input name="totalAmount" type="number" placeholder="Total Amount (for Rec/Pay)" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                        <input name="paidAmount" type="number" placeholder="Paid Amount (for Rec/Pay)" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                      </div>
                      <input name="dueDate" type="date" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                      <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold">Add Asset</button>
                    </form>
                  </div>

                  {/* Asset List */}
                  <div className="space-y-3">
                    <h3 className="font-bold flex items-center gap-2"><TrendingUp size={18} /> Your Holdings</h3>
                    {assets.map(asset => (
                      <div key={asset.id} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm">{asset.name}</p>
                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded uppercase font-bold text-slate-500">{asset.type}</span>
                          </div>
                          <p className="text-xs text-slate-500">
                            {asset.type === 'receivable' || asset.type === 'payable' ? (
                              `₹${asset.paidAmount || 0} / ₹${asset.totalAmount || 0} settled`
                            ) : (
                              `${asset.quantity} ${asset.type === 'liquid' ? 'INR' : asset.type === 'stock' ? 'Units' : 'Grams'}`
                            )}
                          </p>
                          {(asset.type === 'receivable' || asset.type === 'payable') && asset.dueDate && (
                            <p className="text-[10px] text-indigo-600 font-bold mt-1">Due: {format(new Date(asset.dueDate), 'MMM dd, yyyy')}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className={cn(
                            "font-bold text-sm",
                            asset.type === 'payable' ? "text-red-600" : "text-indigo-600"
                          )}>
                            ₹{Math.round(
                              asset.type === 'liquid' ? asset.quantity :
                              asset.type === 'gold' ? asset.quantity * assetPrices.gold :
                              asset.type === 'silver' ? asset.quantity * assetPrices.silver :
                              asset.type === 'stock' && asset.symbol ? asset.quantity * (assetPrices.stocks[asset.symbol] || 0) :
                              asset.type === 'receivable' || asset.type === 'payable' ? (asset.totalAmount || 0) - (asset.paidAmount || 0) : 0
                            ).toLocaleString()}
                          </p>
                          <div className="flex items-center gap-2 justify-end mt-1">
                            <input 
                              type="number" 
                              defaultValue={asset.quantity}
                              onBlur={(e) => handleUpdateAssetQuantity(asset.id, Number(e.target.value))}
                              className="w-16 text-right text-xs border-b border-slate-200 outline-none focus:border-indigo-500"
                              title="Update Quantity/Current Amount"
                            />
                            <button 
                              onClick={() => setAssets(prev => prev.filter(a => a.id !== asset.id))}
                              className="text-red-400 hover:text-red-600"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                  <p className="text-sm text-indigo-700 font-medium mb-1">Market Rates (Live-ish)</p>
                  <div className="flex gap-4 text-xs font-bold text-indigo-900">
                    <span>Gold: ₹{assetPrices.gold}/g</span>
                    <span>Silver: ₹{assetPrices.silver}/g</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Recurring Transaction Modal */}
      <AnimatePresence>
        {isManagingRecurring && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsManagingRecurring(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[95vh] m-2"
            >
              <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h2 className="text-lg md:text-xl font-bold">Recurring Transactions</h2>
                  <p className="text-[10px] md:text-xs text-slate-500">Automate your regular income and expenses</p>
                </div>
                <button onClick={() => setIsManagingRecurring(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle size={24} />
                </button>
              </div>
              
              <div className="p-4 md:p-6 overflow-y-auto flex-1 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Add Recurring Form */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <h3 className="font-bold mb-4 flex items-center gap-2 text-indigo-600"><Plus size={18} /> New Template</h3>
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        const newRt: RecurringTransaction = {
                          id: generateId(),
                          amount: Number(formData.get('amount')),
                          recipient: formData.get('recipient') as string,
                          description: formData.get('description') as string,
                          type: formData.get('type') as TransactionType,
                          method: formData.get('method') as PaymentMethod,
                          category: formData.get('category') as string,
                          frequency: formData.get('frequency') as RecurringFrequency,
                          startDate: new Date(formData.get('startDate') as string).toISOString(),
                          isActive: true,
                        };
                        setRecurringTransactions(prev => [...prev, newRt]);
                        e.currentTarget.reset();
                        addToast('Recurring transaction set up');
                      }}
                      className="space-y-3"
                    >
                      <div className="flex p-1 bg-white rounded-lg border border-slate-200">
                        <label className="flex-1 cursor-pointer">
                          <input type="radio" name="type" value="expense" defaultChecked className="sr-only peer" />
                          <div className="text-center py-1.5 rounded-md peer-checked:bg-red-50 peer-checked:text-red-600 text-[10px] font-bold uppercase transition-all">Expense</div>
                        </label>
                        <label className="flex-1 cursor-pointer">
                          <input type="radio" name="type" value="income" className="sr-only peer" />
                          <div className="text-center py-1.5 rounded-md peer-checked:bg-green-50 peer-checked:text-green-600 text-[10px] font-bold uppercase transition-all">Income</div>
                        </label>
                      </div>
                      <input required name="recipient" placeholder="Recipient / Source" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                      <div className="grid grid-cols-2 gap-2">
                        <input required name="amount" type="number" placeholder="Amount" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                        <select name="frequency" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                          {FREQUENCIES.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select name="category" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                          {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                        <input required name="startDate" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                      </div>
                      <input name="description" placeholder="Description" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                      <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold shadow-md shadow-indigo-100">Start Recurring</button>
                    </form>
                  </div>

                  {/* Recurring List */}
                  <div className="space-y-3">
                    <h3 className="font-bold flex items-center gap-2 text-slate-700"><Clock size={18} /> Active Schedules</h3>
                    {recurringTransactions.map(rt => (
                      <div key={rt.id} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center group">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm">{rt.recipient}</p>
                            <span className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase",
                              rt.type === 'expense' ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                            )}>{rt.frequency}</span>
                          </div>
                          <p className="text-xs text-slate-500">₹{rt.amount.toLocaleString()} • {rt.category}</p>
                          {rt.lastProcessedDate && (
                            <p className="text-[9px] text-slate-400 mt-1">Last: {format(new Date(rt.lastProcessedDate), 'MMM dd')}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setRecurringTransactions(prev => prev.map(item => item.id === rt.id ? { ...item, isActive: !item.isActive } : item))}
                            className={cn(
                              "p-1.5 rounded-lg transition-colors",
                              rt.isActive ? "text-green-600 bg-green-50" : "text-slate-400 bg-slate-50"
                            )}
                          >
                            <CheckCircle2 size={16} />
                          </button>
                          <button 
                            onClick={() => setRecurringTransactions(prev => prev.filter(item => item.id !== rt.id))}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {recurringTransactions.length === 0 && (
                      <div className="text-center py-10 border-2 border-dashed border-slate-100 rounded-xl">
                        <Repeat className="mx-auto text-slate-200 mb-2" size={32} />
                        <p className="text-xs text-slate-400">No recurring transactions set up</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {pendingTransactions.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[95vh] m-2"
            >
              <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50">
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-indigo-900">✅ {pendingTransactions.length} Detected</h2>
                  <p className="text-[10px] md:text-sm text-indigo-700">Review and confirm extraction</p>
                </div>
                <button onClick={() => setPendingTransactions([])} className="text-slate-400 hover:text-slate-600">
                  <XCircle size={24} />
                </button>
              </div>
              
              <div className="p-4 md:p-6 overflow-y-auto flex-1 space-y-4">
                {pendingTransactions.map((tx, idx) => (
                  <div key={tx.id} className={cn(
                    "p-3 md:p-4 rounded-xl border flex flex-col gap-4",
                    tx.confidence === 'low' ? "border-red-200 bg-red-50/30" : "border-slate-200"
                  )}>
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Recipient</label>
                        <input 
                          value={tx.recipient}
                          onChange={(e) => {
                            const newTxs = [...pendingTransactions];
                            newTxs[idx].recipient = e.target.value;
                            setPendingTransactions(newTxs);
                          }}
                          className="w-full bg-transparent border-b border-slate-200 focus:border-indigo-500 outline-none font-bold py-1 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Amount (₹)</label>
                        <input 
                          type="number"
                          value={tx.amount}
                          onChange={(e) => {
                            const newTxs = [...pendingTransactions];
                            newTxs[idx].amount = Number(e.target.value);
                            setPendingTransactions(newTxs);
                          }}
                          className="w-full bg-transparent border-b border-slate-200 focus:border-indigo-500 outline-none font-bold py-1 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Description</label>
                        <input 
                          value={tx.description}
                          onChange={(e) => {
                            const newTxs = [...pendingTransactions];
                            newTxs[idx].description = e.target.value;
                            setPendingTransactions(newTxs);
                          }}
                          className="w-full bg-transparent border-b border-slate-200 focus:border-indigo-500 outline-none text-xs py-1"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Date</label>
                        <input 
                          type="date"
                          value={format(new Date(tx.date), 'yyyy-MM-dd')}
                          onChange={(e) => {
                            const newTxs = [...pendingTransactions];
                            newTxs[idx].date = new Date(e.target.value).toISOString();
                            setPendingTransactions(newTxs);
                          }}
                          className="w-full bg-transparent border-b border-slate-200 focus:border-indigo-500 outline-none text-xs py-1"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Category</label>
                        <select 
                          value={tx.category}
                          onChange={(e) => {
                            const newTxs = [...pendingTransactions];
                            newTxs[idx].category = e.target.value;
                            setPendingTransactions(newTxs);
                          }}
                          className="w-full bg-transparent border-b border-slate-200 focus:border-indigo-500 outline-none text-xs py-1"
                        >
                          {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                          {!CATEGORIES.includes(tx.category) && <option value={tx.category}>{tx.category}</option>}
                          <option value="CUSTOM">+ Custom Category</option>
                        </select>
                        {tx.category === 'CUSTOM' && (
                          <input 
                            placeholder="Type custom category..."
                            onBlur={(e) => {
                              if (e.target.value) {
                                const newTxs = [...pendingTransactions];
                                newTxs[idx].category = e.target.value;
                                setPendingTransactions(newTxs);
                              }
                            }}
                            className="w-full mt-1 bg-slate-50 px-2 py-1 rounded text-[10px] border border-slate-200 outline-none"
                          />
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                      <span className={cn(
                        "text-[9px] px-2 py-0.5 rounded-full font-bold uppercase",
                        tx.confidence === 'high' ? "bg-green-100 text-green-700" :
                        tx.confidence === 'medium' ? "bg-amber-100 text-amber-700" :
                        "bg-red-100 text-red-700"
                      )}>
                        {tx.confidence} Confidence
                      </span>
                      <button 
                        onClick={() => setPendingTransactions(prev => prev.filter((_, i) => i !== idx))}
                        className="text-red-400 hover:text-red-600 p-1"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 md:p-6 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={() => setPendingTransactions([])}
                  className="w-full sm:flex-1 px-6 py-3 rounded-xl font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all text-sm"
                >
                  Discard All
                </button>
                <button 
                  onClick={confirmTransactions}
                  className="w-full sm:flex-[2] bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 text-sm"
                >
                  Confirm {pendingTransactions.length} Txs
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Spending Insights Modal */}
      <AnimatePresence>
        {isViewingInsights && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsViewingInsights(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[95vh] m-2"
            >
              <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-slate-900">Spending Insights</h2>
                  <p className="text-[10px] md:text-xs text-slate-500">Visual breakdown of your finances</p>
                </div>
                <button onClick={() => setIsViewingInsights(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle size={24} />
                </button>
              </div>
              
              <div className="p-4 md:p-6 overflow-y-auto flex-1 space-y-6 md:space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                  {/* Category Breakdown */}
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <Tag size={18} className="text-indigo-600" />
                      Category Breakdown
                    </h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={stats.categoryData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {stats.categoryData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'][index % 7]} />
                            ))}
                          </Pie>
                          <Tooltip 
                            formatter={(value: number) => `₹${value.toLocaleString()}`}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Legend verticalAlign="bottom" height={36}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Monthly Trend */}
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <BarChart3 size={18} className="text-indigo-600" />
                      Monthly Trend
                    </h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.monthlyTrend}>
                          <XAxis dataKey="name" axisLine={false} tickLine={false} />
                          <YAxis hide />
                          <Tooltip 
                            formatter={(value: number) => `₹${value.toLocaleString()}`}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                    <p className="text-[10px] font-bold text-green-600 uppercase">Avg. Monthly Income</p>
                    <p className="text-xl font-bold text-green-900">₹{Math.round(stats.monthlyTrend.reduce((acc, m) => acc + m.income, 0) / 6).toLocaleString()}</p>
                  </div>
                  <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                    <p className="text-[10px] font-bold text-red-600 uppercase">Avg. Monthly Expense</p>
                    <p className="text-xl font-bold text-red-900">₹{Math.round(stats.monthlyTrend.reduce((acc, m) => acc + m.expense, 0) / 6).toLocaleString()}</p>
                  </div>
                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                    <p className="text-[10px] font-bold text-indigo-600 uppercase">Savings Rate</p>
                    <p className="text-xl font-bold text-indigo-900">
                      {stats.totalIncome > 0 ? Math.round((stats.savings / stats.totalIncome) * 100) : 0}%
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Financial Goals Management Modal */}
      <AnimatePresence>
        {isManagingGoals && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsManagingGoals(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[95vh] m-2"
            >
              <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-slate-900">Financial Goals</h2>
                  <p className="text-[10px] md:text-xs text-slate-500">Track your progress towards big dreams</p>
                </div>
                <button onClick={() => setIsManagingGoals(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle size={24} />
                </button>
              </div>
              
              <div className="p-4 md:p-6 overflow-y-auto flex-1 space-y-6">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const newGoal: FinancialGoal = {
                      id: generateId(),
                      name: formData.get('name') as string,
                      targetAmount: Number(formData.get('targetAmount')),
                      currentAmount: Number(formData.get('currentAmount')),
                      category: formData.get('category') as string,
                      deadline: formData.get('deadline') as string || undefined,
                    };
                    setGoals(prev => [...prev, newGoal]);
                    e.currentTarget.reset();
                    addToast(`Goal "${newGoal.name}" created!`);
                  }}
                  className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200"
                >
                  <h3 className="font-bold text-sm flex items-center gap-2"><Plus size={16} /> Create New Goal</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Goal Name</label>
                      <input name="name" required placeholder="e.g. Dream House" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Target (₹)</label>
                        <input name="targetAmount" type="number" required placeholder="0.00" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Saved (₹)</label>
                        <input name="currentAmount" type="number" required placeholder="0.00" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Category</label>
                        <select name="category" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500">
                          <option value="Savings">Savings</option>
                          <option value="Investment">Investment</option>
                          <option value="Purchase">Purchase</option>
                          <option value="Emergency">Emergency</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Deadline</label>
                        <input name="deadline" type="date" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                    </div>
                  </div>
                  <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold shadow-md shadow-indigo-100 hover:bg-indigo-700 transition-colors">
                    Create Goal
                  </button>
                </form>

                <div className="space-y-3">
                  <h3 className="font-bold text-sm text-slate-700">Active Goals</h3>
                  {goals.map(goal => (
                    <div key={goal.id} className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center group">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm text-slate-900">{goal.name}</p>
                          <span className="text-[9px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded font-bold uppercase">{goal.category}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-[100px]">
                            <div className="h-full bg-indigo-500" style={{ width: `${(goal.currentAmount / goal.targetAmount) * 100}%` }} />
                          </div>
                          <p className="text-[10px] text-slate-500">₹{goal.currentAmount.toLocaleString()} / ₹{goal.targetAmount.toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => {
                            const amount = prompt("Enter amount to add to this goal:");
                            if (amount && !isNaN(Number(amount))) {
                              setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, currentAmount: g.currentAmount + Number(amount) } : g));
                              addToast(`Added ₹${amount} to ${goal.name}`);
                            }
                          }}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          title="Add savings"
                        >
                          <Plus size={16} />
                        </button>
                        <button 
                          onClick={() => setGoals(prev => prev.filter(g => g.id !== goal.id))}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {goals.length === 0 && (
                    <div className="text-center py-10 border-2 border-dashed border-slate-100 rounded-xl">
                      <TrendingUp className="mx-auto text-slate-200 mb-2" size={32} />
                      <p className="text-xs text-slate-400">No goals set yet</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Budget Management Modal */}
      <AnimatePresence>
        {isManagingBudgets && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsManagingBudgets(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[95vh] m-2"
            >
              <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-slate-900">Monthly Budgets</h2>
                  <p className="text-[10px] md:text-xs text-slate-500">Set spending limits for each category</p>
                </div>
                <button onClick={() => setIsManagingBudgets(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle size={24} />
                </button>
              </div>
              
              <div className="p-4 md:p-6 overflow-y-auto flex-1 space-y-6">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const category = formData.get('category') as string;
                    const limit = Number(formData.get('limit'));
                    
                    setBudgets(prev => {
                      const existing = prev.find(b => b.category === category);
                      if (existing) {
                        return prev.map(b => b.category === category ? { ...b, limit } : b);
                      }
                      return [...prev, { category, limit }];
                    });
                    e.currentTarget.reset();
                    addToast(`Budget set for ${category}`);
                  }}
                  className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200"
                >
                  <h3 className="font-bold text-sm flex items-center gap-2"><Plus size={16} /> Set New Budget</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Category</label>
                      <select name="category" required className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500">
                        {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Limit (₹)</label>
                      <input name="limit" type="number" required placeholder="0.00" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>
                  <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold shadow-md shadow-indigo-100 hover:bg-indigo-700 transition-colors">
                    Set Budget
                  </button>
                </form>

                <div className="space-y-3">
                  <h3 className="font-bold text-sm text-slate-700">Current Budgets</h3>
                  {budgets.map(budget => (
                    <div key={budget.category} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center group">
                      <div>
                        <p className="font-bold text-sm text-slate-900">{budget.category}</p>
                        <p className="text-xs text-slate-500">Limit: ₹{budget.limit.toLocaleString()}</p>
                      </div>
                      <button 
                        onClick={() => setBudgets(prev => prev.filter(b => b.category !== budget.category))}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {budgets.length === 0 && (
                    <div className="text-center py-10 border-2 border-dashed border-slate-100 rounded-xl">
                      <Filter className="mx-auto text-slate-200 mb-2" size={32} />
                      <p className="text-xs text-slate-400">No budgets set yet</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notifications */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 20, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={cn(
                "px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 pointer-events-auto min-w-[200px]",
                toast.type === 'success' ? "bg-slate-900 text-white" :
                toast.type === 'error' ? "bg-red-600 text-white" :
                "bg-indigo-600 text-white"
              )}
            >
              {toast.type === 'success' && <CheckCircle size={18} className="text-green-400" />}
              {toast.type === 'error' && <AlertCircle size={18} className="text-white" />}
              {toast.type === 'info' && <Info size={18} className="text-white" />}
              <span className="text-sm font-medium">{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
