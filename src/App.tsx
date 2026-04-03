/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Upload, Filter, Search, IndianRupee, Receipt, Wallet, ArrowUpRight, ArrowDownLeft, CheckCircle2, XCircle, Trash2, TrendingUp, Coins, BarChart3, Calendar, Tag, AlertCircle, CheckCircle, Info, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { useDropzone } from 'react-dropzone';
import { Transaction, TransactionType, PaymentMethod, Asset, AssetPrice, ConfidenceLevel } from './types';
import { analyzeUPIScreenshot, fetchAssetPrices } from './services/geminiService';
import { cn } from './lib/utils';

const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Rent', 'Salary', 'Investment', 'Entertainment', 'Health', 'Other'];

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

  const [assetPrices, setAssetPrices] = useState<AssetPrice>({
    gold: 7500,
    silver: 95,
    stocks: {}
  });
  
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [isManagingAssets, setIsManagingAssets] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'refundable' | 'refunded' | 'income' | 'expense'>('all');
  const [filterCategory, setFilterCategory] = useState('All');
  const [searchRecipient, setSearchRecipient] = useState('');

  // Toast management
  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = crypto.randomUUID();
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

    const savings = totalIncome - totalExpenses;

    const assetValue = assets.reduce((acc, asset) => {
      if (asset.type === 'liquid') return acc + asset.quantity;
      if (asset.type === 'gold') return acc + (asset.quantity * assetPrices.gold);
      if (asset.type === 'silver') return acc + (asset.quantity * assetPrices.silver);
      if (asset.type === 'stock' && asset.symbol) return acc + (asset.quantity * (assetPrices.stocks[asset.symbol] || 0));
      return acc;
    }, 0);

    return { totalExpenses, totalIncome, totalRefundable, totalRefunded, savings, assetValue };
  }, [transactions, assets, assetPrices]);

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
      id: crypto.randomUUID(),
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
    setAssets(prev => [...prev, { ...newAsset, id: crypto.randomUUID() }]);
  };

  const handleUpdateAssetQuantity = (id: string, quantity: number) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, quantity } : a));
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    setIsUploading(true);
    try {
      const file = acceptedFiles[0];
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const extracted = await analyzeUPIScreenshot(base64);
      
      const newTxs = extracted.map(tx => ({
        id: crypto.randomUUID(),
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
    } catch (error) {
      console.error("Failed to process screenshot", error);
      addToast("Failed to process screenshot", "error");
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
      {/* Header & Stats */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-200">
                <IndianRupee className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  TrackMint
                </h1>
                <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Wealth Tracker</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setIsManagingAssets(true)}
                className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-slate-200 transition-colors"
              >
                <BarChart3 size={18} />
                Assets
              </button>
              <button 
                onClick={() => setIsAddingManual(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <Plus size={18} />
                Add
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"
            >
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <TrendingUp size={16} className="text-green-600" />
                <span className="text-xs font-medium">Total Income</span>
              </div>
              <p className="text-lg font-bold text-green-600">₹{stats.totalIncome.toLocaleString()}</p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"
            >
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <ArrowUpRight size={16} className="text-red-600" />
                <span className="text-xs font-medium">Total Expenses</span>
              </div>
              <p className="text-lg font-bold text-red-600">₹{stats.totalExpenses.toLocaleString()}</p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"
            >
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Wallet size={16} className="text-indigo-600" />
                <span className="text-xs font-medium">Net Savings</span>
              </div>
              <p className="text-lg font-bold text-indigo-600">₹{stats.savings.toLocaleString()}</p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"
            >
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Coins size={16} className="text-amber-600" />
                <span className="text-xs font-medium">Asset Worth</span>
              </div>
              <p className="text-lg font-bold text-amber-600">₹{Math.round(stats.assetValue).toLocaleString()}</p>
            </motion.div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-8">
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
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "p-3 rounded-lg",
                    tx.type === 'expense' ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                  )}>
                    {tx.type === 'expense' ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900">{tx.recipient}</h3>
                      {tx.confidence && (
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase",
                          tx.confidence === 'high' ? "bg-green-100 text-green-700" :
                          tx.confidence === 'medium' ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-700"
                        )}>
                          {tx.confidence} Confidence
                        </span>
                      )}
                      {tx.isNew && (
                        <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase">
                          New
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Calendar size={12} />{format(new Date(tx.date), 'MMM dd, yyyy')}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1"><Tag size={12} />{tx.category}</span>
                      <span>•</span>
                      <span className="uppercase">{tx.method.replace('_', ' ')}</span>
                      {tx.isRefundable && (
                        <>
                          <span>•</span>
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
                
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className={cn(
                      "text-lg font-bold",
                      tx.type === 'expense' ? "text-slate-900" : "text-green-600"
                    )}>
                      {tx.type === 'expense' ? '-' : '+'}₹{tx.amount.toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-400 truncate max-w-[150px]">{tx.description}</p>
                  </div>
                  
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
              className="bg-white w-full max-w-md rounded-2xl shadow-2xl relative z-10 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-xl font-bold">Add Transaction</h2>
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
                className="p-6 space-y-4"
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
              className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-xl font-bold">Asset Management</h2>
                <button onClick={() => setIsManagingAssets(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle size={24} />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <input required name="quantity" type="number" step="0.001" placeholder="Quantity" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                        <input name="symbol" placeholder="Symbol (for stocks)" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                      </div>
                      <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold">Add Asset</button>
                    </form>
                  </div>

                  {/* Asset List */}
                  <div className="space-y-3">
                    <h3 className="font-bold flex items-center gap-2"><TrendingUp size={18} /> Your Holdings</h3>
                    {assets.map(asset => (
                      <div key={asset.id} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-sm">{asset.name}</p>
                          <p className="text-xs text-slate-500">
                            {asset.quantity} {asset.type === 'liquid' ? 'INR' : asset.type === 'stock' ? 'Units' : 'Grams'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm text-indigo-600">
                            ₹{Math.round(
                              asset.type === 'liquid' ? asset.quantity :
                              asset.type === 'gold' ? asset.quantity * assetPrices.gold :
                              asset.type === 'silver' ? asset.quantity * assetPrices.silver :
                              asset.type === 'stock' && asset.symbol ? asset.quantity * (assetPrices.stocks[asset.symbol] || 0) : 0
                            ).toLocaleString()}
                          </p>
                          <input 
                            type="number" 
                            defaultValue={asset.quantity}
                            onBlur={(e) => handleUpdateAssetQuantity(asset.id, Number(e.target.value))}
                            className="w-20 text-right text-xs border-b border-slate-200 outline-none focus:border-indigo-500"
                          />
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

      {/* Pending Transactions Preview */}
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
              className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50">
                <div>
                  <h2 className="text-xl font-bold text-indigo-900">✅ {pendingTransactions.length} Transactions Detected</h2>
                  <p className="text-sm text-indigo-700">Review and confirm the extracted data</p>
                </div>
                <button onClick={() => setPendingTransactions([])} className="text-slate-400 hover:text-slate-600">
                  <XCircle size={24} />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1 space-y-4">
                {pendingTransactions.map((tx, idx) => (
                  <div key={tx.id} className={cn(
                    "p-4 rounded-xl border flex flex-col md:flex-row gap-4",
                    tx.confidence === 'low' ? "border-red-200 bg-red-50/30" : "border-slate-200"
                  )}>
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Recipient</label>
                        <input 
                          value={tx.recipient}
                          onChange={(e) => {
                            const newTxs = [...pendingTransactions];
                            newTxs[idx].recipient = e.target.value;
                            setPendingTransactions(newTxs);
                          }}
                          className="w-full bg-transparent border-b border-slate-200 focus:border-indigo-500 outline-none font-bold py-1"
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
                          className="w-full bg-transparent border-b border-slate-200 focus:border-indigo-500 outline-none font-bold py-1"
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
                          className="w-full bg-transparent border-b border-slate-200 focus:border-indigo-500 outline-none text-sm py-1"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Category</label>
                        <select 
                          value={tx.category}
                          onChange={(e) => {
                            const newTxs = [...pendingTransactions];
                            newTxs[idx].category = e.target.value;
                            setPendingTransactions(newTxs);
                          }}
                          className="w-full bg-transparent border-b border-slate-200 focus:border-indigo-500 outline-none text-sm py-1"
                        >
                          {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-col justify-between items-end">
                      <span className={cn(
                        "text-[10px] px-2 py-1 rounded-full font-bold uppercase",
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
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-6 border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => setPendingTransactions([])}
                  className="flex-1 px-6 py-3 rounded-xl font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Discard All
                </button>
                <button 
                  onClick={confirmTransactions}
                  className="flex-[2] bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                >
                  Confirm & Add {pendingTransactions.length} Transactions
                </button>
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
