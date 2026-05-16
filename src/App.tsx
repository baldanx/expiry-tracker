import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  serverTimestamp, 
  writeBatch,
  where,
  getDocs
} from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  Calendar, 
  Plus, 
  Download, 
  Upload, 
  Edit2, 
  Trash2, 
  Archive,
  RefreshCw,
  ArchiveRestore,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Layers,
  LayoutGrid,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'motion/react';
import { db, auth } from './lib/firebase';
import { Product, Batch } from './types';

interface ReorderItemProps {
  p: Product;
  maxDaysPossible: number;
  slots: Record<number, number>;
  focusedProductId: string | null;
  setFocusedProductId: (id: string | null) => void;
  setEditingProduct: (p: Product | null) => void;
  setIsProductModalOpen: (open: boolean) => void;
  toggleArchive: (p: Product) => void;
  setProductToDelete: (p: Product | null) => void;
  setIsDeleteChoiceOpen: (open: boolean) => void;
  setActiveSlot: (slot: any) => void;
  setIsSlotModalOpen: (open: boolean) => void;
}

// Reorder Item Component for better performance and drag handle control
const ReorderItemComponent: React.FC<ReorderItemProps> = ({ 
  p, 
  maxDaysPossible, 
  slots, 
  focusedProductId, 
  setFocusedProductId, 
  setEditingProduct, 
  setIsProductModalOpen, 
  toggleArchive, 
  setProductToDelete, 
  setIsDeleteChoiceOpen,
  setActiveSlot,
  setIsSlotModalOpen
}) => {
  const dragControls = useDragControls();

  return (
    <Reorder.Item 
      value={p}
      dragControls={dragControls}
      dragListener={false}
      className="grid border-b border-slate-200/60 bg-white"
      style={{ gridTemplateColumns: `var(--col-prod) repeat(${maxDaysPossible}, var(--col-day))` }}
      onClick={() => setFocusedProductId(focusedProductId === p.id ? null : p.id)}
    >
      <div className={`sticky left-0 z-30 grid-cell relative px-2 group shadow-sm transition-colors ${focusedProductId === p.id ? 'bg-indigo-50' : 'bg-white'}`}>
        <div className="flex items-center w-full gap-2">
          <GripVertical 
            size={20} 
            className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-indigo-600 transition-colors shrink-0"
            onPointerDown={(e) => dragControls.start(e)}
          />
          <span className={`font-semibold text-slate-700 text-[13px] flex-1 text-center truncate italic leading-tight ${focusedProductId === p.id ? 'text-indigo-600' : ''}`}>
            {p.name}
          </span>
        </div>
        
        {/* Icons Overlay (Edit/Archive/Delete) */}
        <div className={`absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition-opacity bg-white/95 backdrop-blur-sm px-1 ${focusedProductId === p.id ? 'opacity-100' : 'pointer-events-none'}`}>
          <button onClick={(e) => { e.stopPropagation(); setEditingProduct(p); setIsProductModalOpen(true); }} className="p-1.5 rounded-md bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-colors">
            <Edit2 size={16} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); toggleArchive(p); }} className="p-1.5 rounded-md bg-amber-50 text-amber-600 hover:bg-amber-100 flex items-center justify-center transition-colors">
                            {p.isArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); setProductToDelete(p); setIsDeleteChoiceOpen(true); }} className="p-1.5 rounded-md bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition-colors">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {Array.from({ length: maxDaysPossible }).map((_, day) => {
        const qty = slots[day] || 0;
        const redStart = p.maxDays - p.redDays;
        const yellowStart = redStart - p.yellowDays;
        const isRed = day >= redStart;
        const isYellow = !isRed && day >= yellowStart;

        return (
          <div 
            key={day} 
            className={`grid-cell relative group ${isRed ? 'bg-expired' : isYellow ? 'bg-warning' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setActiveSlot({ productId: p.id, daysPassed: day, quantity: qty }); 
              setIsSlotModalOpen(true); 
            }}
          >
            {qty > 0 ? (
              <div 
                className={`status-dot cursor-pointer ${
                  isRed 
                    ? 'bg-red-500 shadow-red-200' 
                    : isYellow 
                      ? 'bg-amber-400 shadow-amber-200' 
                      : 'bg-emerald-500 shadow-emerald-200'
                }`}
              >
                {qty}
              </div>
            ) : (
              <div className="w-2 h-2 rounded-full bg-slate-200 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
        );
      })}
    </Reorder.Item>
  );
};

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [currentCategory, setCurrentCategory] = useState<'mignon' | 'monoporzione'>('mignon');
  const [showArchived, setShowArchived] = useState(false);

  const [focusedProductId, setFocusedProductId] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    return products
      .filter(p => {
        const category = p.category || 'mignon';
        return category === currentCategory && (!!p.isArchived === showArchived);
      })
      .sort((a, b) => {
        if ((a.sortOrder || 0) !== (b.sortOrder || 0)) {
          return (a.sortOrder || 0) - (b.sortOrder || 0);
        }
        return a.name.localeCompare(b.name);
      });
  }, [products, currentCategory, showArchived]);

  // Handle Drag Reorder
  const handleReorder = async (newOrder: Product[]) => {
    // Optimistic local update to avoid jumpiness
    const updatedProducts = products.map(p => {
      const reorderedItem = newOrder.find(ni => ni.id === p.id);
      if (reorderedItem) {
        const newIndex = newOrder.indexOf(reorderedItem);
        return { ...p, sortOrder: newIndex + 1 };
      }
      return p;
    });
    setProducts(updatedProducts);

    try {
      const batch = writeBatch(db);
      newOrder.forEach((p, index) => {
        const newOrderValue = index + 1;
        if (p.sortOrder !== newOrderValue) {
          batch.update(doc(db, 'shared_products', p.id), { sortOrder: newOrderValue });
        }
      });
      await batch.commit();
    } catch (err) {
      console.error("Reorder save error:", err);
    }
  };

  // Modals state
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState<{ productId: string, daysPassed: number, quantity: number } | null>(null);
  const [isDeleteChoiceOpen, setIsDeleteChoiceOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // Auth & Sync
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
      } else {
        signInAnonymously(auth).catch(err => {
          console.warn("Auth error (non-fatal):", err);
          // Don't show blocking error for auth, just let it fail gracefully
        });
      }
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    // If not authenticated yet, we can still show the UI, 
    // but Firestore might not sync yet.
    const qProducts = collection(db, 'shared_products');
    const qBatches = collection(db, 'shared_batches');

    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      setLoading(false);
    }, (err) => {
      console.error("Products sync error:", err);
      // Only set error if it's truly a breaking state
      if (err.message.includes('permission-denied')) {
        console.warn("Permission denied - check rules or auth");
      }
    });

    const unsubBatches = onSnapshot(qBatches, (snapshot) => {
      setBatches(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Batch)));
    }, (err) => {
      console.error("Batches sync error:", err);
    });

    return () => {
      unsubProducts();
      unsubBatches();
    };
  }, [user]);

  // Calculations
  const maxDaysPossible = useMemo(() => {
    return filteredProducts.reduce((max, p) => Math.max(max, p.maxDays), 0);
  }, [filteredProducts]);

  const getDaysPassed = (dateStr: string) => {
    const start = new Date(dateStr);
    const now = new Date();
    start.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  };

  const colTotals = useMemo(() => {
    const totals = new Array(maxDaysPossible).fill(0);
    batches.forEach(b => {
      const dp = getDaysPassed(b.entryDate);
      if (dp >= 0 && dp < maxDaysPossible) {
        totals[dp] += b.quantity;
      }
    });
    return totals;
  }, [batches, maxDaysPossible]);

  // Actions
  const handleSaveProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      maxDays: parseInt(formData.get('maxDays') as string),
      yellowDays: parseInt(formData.get('yellowDays') as string),
      redDays: parseInt(formData.get('redDays') as string),
      category: currentCategory, // Assign current category to new products
    };

    try {
      if (editingProduct) {
        await updateDoc(doc(db, 'shared_products', editingProduct.id), {
          ...data,
          updatedAt: serverTimestamp()
        });
      } else {
        // Calculate next sort order
        const maxOrder = products.length > 0 ? Math.max(...products.map(p => p.sortOrder || 0)) : 0;
        await addDoc(collection(db, 'shared_products'), {
          ...data,
          isArchived: false,
          sortOrder: maxOrder + 1,
          createdAt: serverTimestamp()
        });
      }
      setIsProductModalOpen(false);
      setEditingProduct(null);
    } catch (err) {
      console.error("Save product error:", err);
      alert("Errore durante il salvataggio");
    }
  };

  const handleDeleteProduct = async (id: string, onlyEmpty = false) => {
    try {
      const batch = writeBatch(db);
      if (!onlyEmpty) {
        batch.delete(doc(db, 'shared_products', id));
      }
      
      const batchesSnapshot = await getDocs(query(collection(db, 'shared_batches'), where('productId', '==', id)));
      batchesSnapshot.docs.forEach(d => batch.delete(d.ref));
      
      await batch.commit();
      setIsDeleteChoiceOpen(false);
      setProductToDelete(null);
    } catch (err) {
      console.error("Delete error:", err);
      alert("Errore durante l'eliminazione");
    }
  };

  const handleAddBatch = async (quantity: number) => {
    if (!activeProductId) return;
    try {
      await addDoc(collection(db, 'shared_batches'), {
        productId: activeProductId,
        quantity: quantity,
        entryDate: new Date().toISOString(),
        createdAt: serverTimestamp()
      });
      setIsBatchModalOpen(false);
    } catch (err) {
      console.error("Add batch error:", err);
    }
  };

  const handleUpdateSlot = async (newQty: number) => {
    if (!activeSlot) return;
    const { productId, daysPassed, quantity: currentTotal } = activeSlot;
    const diff = newQty - currentTotal;
    if (diff === 0) {
      setIsSlotModalOpen(false);
      return;
    }

    try {
      const batch = writeBatch(db);
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - daysPassed);
      targetDate.setHours(0, 0, 0, 0);
      const targetDateStr = targetDate.toISOString();

      if (diff > 0) {
        batch.set(doc(collection(db, 'shared_batches')), {
          productId,
          quantity: diff,
          entryDate: targetDateStr,
          createdAt: serverTimestamp()
        });
      } else {
        let toRemove = Math.abs(diff);
        const slotBatches = batches.filter(b => b.productId === productId && getDaysPassed(b.entryDate) === daysPassed);
        for (const b of slotBatches) {
          if (b.quantity <= toRemove) {
            toRemove -= b.quantity;
            batch.delete(doc(db, 'shared_batches', b.id));
          } else {
            batch.update(doc(db, 'shared_batches', b.id), { quantity: b.quantity - toRemove });
            toRemove = 0;
            break;
          }
          if (toRemove === 0) break;
        }
      }
      await batch.commit();
      setIsSlotModalOpen(false);
    } catch (err) {
      console.error("Update slot error:", err);
    }
  };

  const deleteColumn = async (dayIndex: number) => {
    if (!confirm(`Eliminare tutti i colli del giorno ${dayIndex}?`)) return;
    try {
      const batch = writeBatch(db);
      batches.filter(b => getDaysPassed(b.entryDate) === dayIndex).forEach(b => {
        batch.delete(doc(db, 'shared_batches', b.id));
      });
      await batch.commit();
    } catch (err) {
      console.error("Delete column error:", err);
    }
  };

  const toggleArchive = async (product: Product) => {
    try {
      await updateDoc(doc(db, 'shared_products', product.id), {
        isArchived: !product.isArchived,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Toggle archive error:", err);
    }
  };

  const moveProduct = async (product: Product, direction: 'up' | 'down') => {
    const visibleProducts = filteredProducts;
    const index = visibleProducts.findIndex(p => p.id === product.id);
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === visibleProducts.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const targetProduct = visibleProducts[targetIndex];

    const currentOrder = product.sortOrder || 0;
    const targetOrder = targetProduct.sortOrder || 0;

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'shared_products', product.id), { sortOrder: targetOrder });
      batch.update(doc(db, 'shared_products', targetProduct.id), { sortOrder: currentOrder });
      await batch.commit();
    } catch (err) {
      console.error("Move product error:", err);
    }
  };

  const handleExport = () => {
    const data = {
      products: products.map(({ id, ...p }) => p),
      batches: batches.map(({ id, ...b }) => b),
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.products && data.batches) {
          if (confirm(`Importare ${data.products.length} voci e ${data.batches.length} colli?`)) {
            const batch = writeBatch(db);
            const prods = await getDocs(collection(db, 'shared_products'));
            prods.docs.forEach(d => batch.delete(d.ref));
            const bats = await getDocs(collection(db, 'shared_batches'));
            bats.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();

            const importBatch = writeBatch(db);
            data.products.forEach((p: any) => batch.set(doc(collection(db, 'shared_products')), { ...p, createdAt: serverTimestamp() }));
            data.batches.forEach((b: any) => batch.set(doc(collection(db, 'shared_batches')), { ...b, createdAt: serverTimestamp() }));
            await importBatch.commit();
            alert('Importazione completata');
          }
        }
      } catch (err) {
        alert('Errore lettura file');
      }
    };
    reader.readAsText(file);
  };

  const seedMignonData = async () => {
    const initialMignons = [
      { name: 'Cannolo', category: 'mignon', maxDays: 3, redDays: 1, yellowDays: 1, sortOrder: 1, isArchived: false },
      { name: 'Bignè Crema', category: 'mignon', maxDays: 3, redDays: 1, yellowDays: 1, sortOrder: 2, isArchived: false },
      { name: 'Tartelletta Frutta', category: 'mignon', maxDays: 2, redDays: 1, yellowDays: 0, sortOrder: 3, isArchived: false },
      { name: 'Meringa', category: 'mignon', maxDays: 7, redDays: 2, yellowDays: 2, sortOrder: 4, isArchived: false },
      { name: 'Cestina Cioccolato', category: 'mignon', maxDays: 5, redDays: 1, yellowDays: 1, sortOrder: 5, isArchived: false },
    ];
    
    try {
      setLoading(true);
      const batchAction = writeBatch(db);
      initialMignons.forEach(p => {
        const ref = doc(collection(db, 'shared_products'));
        batchAction.set(ref, { ...p, createdAt: serverTimestamp() });
      });
      await batchAction.commit();
    } catch (err) {
      console.error("Seed error:", err);
      setError("Errore durante il caricamento dei dati iniziali");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center flex flex-col items-center justify-center h-full">
        <div className="bg-red-50 p-4 rounded-full mb-3 text-red-500">
          <AlertCircle size={40} />
        </div>
        <p className="text-slate-800 font-bold text-lg">Si è verificato un problema</p>
        <p className="text-slate-500 mt-1 mb-4">{error}</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 transition-colors">
          Ricarica Pagina
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen max-h-screen flex flex-col overflow-hidden bg-slate-100">
      {/* Glass Header */}
      <header className="glass-header z-40 relative shadow-sm shrink-0">
        <div className="max-w-[1920px] mx-auto px-3 sm:px-6 py-2 sm:py-4 flex flex-col md:flex-row justify-between items-center gap-2 sm:gap-4">
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-indigo-500 to-violet-600 text-white p-2 rounded-xl shadow-lg shadow-indigo-200">
                <Calendar size={20} className="sm:w-6 sm:h-6" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight leading-none">Expiry Tracker</h1>
                <p className="text-[10px] sm:text-xs font-medium text-indigo-500 uppercase tracking-wider mt-0.5">
                  {new Date().toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long' })}
                </p>
              </div>
            </div>
            
            {/* Quick Add for Mobile */}
            <button 
              onClick={() => { setEditingProduct(null); setIsProductModalOpen(true); }}
              className="md:hidden p-2 bg-indigo-600 text-white rounded-lg shadow-md"
            >
              <Plus size={20} />
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto justify-between md:justify-end overflow-x-auto no-scrollbar py-1">
            {/* View Toggle */}
            <div className="flex bg-slate-100 p-1 rounded-xl items-center gap-1 shadow-inner border border-slate-200 shrink-0">
              <button 
                onClick={() => setCurrentCategory('mignon')}
                className={`flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${currentCategory === 'mignon' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Layers size={14} /> <span className="hidden xs:inline">MIGNON</span>
              </button>
              <button 
                onClick={() => setCurrentCategory('monoporzione')}
                className={`flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${currentCategory === 'monoporzione' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <LayoutGrid size={14} /> <span className="hidden xs:inline">MONO</span>
              </button>
            </div>

            <div className="flex items-center gap-1 bg-white/50 rounded-lg p-1 border border-white/60 shrink-0">
              <button 
                onClick={() => setShowArchived(!showArchived)} 
                className={`p-1.5 sm:p-2 rounded-md transition-all ${showArchived ? 'bg-indigo-100 text-indigo-600' : 'text-slate-500 hover:text-indigo-600 hover:bg-white'}`}
                title={showArchived ? "Mostra Attivi" : "Mostra Archiviati"}
              >
                {showArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
              </button>
              <button onClick={handleExport} className="p-1.5 sm:p-2 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-md transition-all" title="Esporta Backup">
                <Download size={18} />
              </button>
              <label className="p-1.5 sm:p-2 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-md transition-all cursor-pointer" title="Importa Backup">
                <Upload size={18} />
                <input type="file" accept=".json" onChange={handleImport} className="hidden" />
              </label>
            </div>
            <button 
              onClick={() => { setEditingProduct(null); setIsProductModalOpen(true); }}
              className="hidden md:flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-lg shadow-md shadow-indigo-200 hover:shadow-lg hover:from-indigo-700 hover:to-violet-700 transition-all shrink-0"
            >
              <Plus size={20} />
              <span className="font-bold">Nuova Voce</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid Container */}
      <main id="main-content" className="flex-1 min-h-0 glass-panel m-2 sm:m-4 rounded-2xl overflow-hidden shadow-2xl shadow-indigo-100/50">
        <div id="scroll-container" className="block w-full h-full overflow-auto relative scrolling-touch overscroll-contain">
          {filteredProducts.length === 0 ? (
            <div id="empty-state" className="flex flex-col items-center justify-center min-w-full min-h-full text-slate-400 p-8 space-y-4">
              <div className="bg-white/80 p-8 rounded-full shadow-inner border border-slate-100">
                {showArchived ? <Archive size={64} className="text-slate-300" /> : <Calendar size={64} className="text-indigo-400/60" />}
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-slate-700">{showArchived ? 'Nessun prodotto archiviato' : 'Nessun prodotto attivo'}</p>
                <p className="text-sm text-slate-500 mt-2">{showArchived ? 'Tutti i prodotti sono correntemente in uso' : 'Il tuo database sembra vuoto'}</p>
              </div>
              {!showArchived && currentCategory === 'mignon' && (
                <button 
                  onClick={seedMignonData}
                  className="mt-4 px-6 py-3 bg-white text-indigo-600 font-bold rounded-xl border-2 border-indigo-50 shadow-sm hover:bg-indigo-50 transition-all flex items-center gap-2"
                >
                  <Download size={18} />
                  Carica Mignon Predefiniti
                </button>
              )}
              <button 
                onClick={() => { setEditingProduct(null); setIsProductModalOpen(true); }}
                className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 hover:scale-105 transition-transform"
              >
                Aggiungi Nuova Voce
              </button>
            </div>
          ) : (
            <div id="grid-layout" className="min-w-fit min-h-full inline-block pb-20" style={{ width: `calc(var(--col-prod) + ${maxDaysPossible} * var(--col-day))` }}>
              {/* Header Row */}
              <div 
                id="grid-header"
                className="grid sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80"
                style={{ gridTemplateColumns: `var(--col-prod) repeat(${maxDaysPossible}, var(--col-day))` }}
              >
                <div className="sticky-corner font-bold text-slate-400 text-[10px] tracking-widest uppercase border-r bg-white/95 h-12 flex items-center justify-center">PRODOTTO</div>
                {Array.from({ length: maxDaysPossible }).map((_, i) => {
                  const date = new Date();
                  date.setDate(date.getDate() - i);
                  return (
                    <div 
                      key={i} 
                      className="grid-cell flex-col border-b border-slate-200/40 bg-transparent h-12 hover:bg-indigo-50/50 transition-colors group cursor-pointer"
                      onClick={() => deleteColumn(i)}
                      title="Elimina colonna"
                    >
                      <span className="text-[9px] font-black text-indigo-500 uppercase tracking-tighter leading-none">{i}d</span>
                      <span className="text-[11px] font-bold text-slate-600 leading-tight">{date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}</span>
                    </div>
                  );
                })}
              </div>

              {/* Product Rows */}
              <Reorder.Group 
                axis="y" 
                values={filteredProducts} 
                onReorder={handleReorder}
                className="flex flex-col min-w-full"
              >
                {filteredProducts.map((p) => {
                  const pBatches = batches.filter(b => b.productId === p.id);
                  const slots: Record<number, number> = {};
                  pBatches.forEach(b => {
                    const dp = getDaysPassed(b.entryDate);
                    if (dp >= 0 && dp < maxDaysPossible) {
                      slots[dp] = (slots[dp] || 0) + b.quantity;
                    }
                  });

                  return (
                    <ReorderItemComponent
                      key={p.id}
                      p={p}
                      maxDaysPossible={maxDaysPossible}
                      slots={slots}
                      focusedProductId={focusedProductId}
                      setFocusedProductId={setFocusedProductId}
                      setEditingProduct={setEditingProduct}
                      setIsProductModalOpen={setIsProductModalOpen}
                      toggleArchive={toggleArchive}
                      setProductToDelete={setProductToDelete}
                      setIsDeleteChoiceOpen={setIsDeleteChoiceOpen}
                      setActiveSlot={setActiveSlot}
                      setIsSlotModalOpen={setIsSlotModalOpen}
                    />
                  );
                })}
              </Reorder.Group>

              {/* Total Row */}
              <div 
                className="grid border-t-2 border-slate-200 bg-slate-50"
                style={{ gridTemplateColumns: `var(--col-prod) repeat(${maxDaysPossible}, var(--col-day))` }}
              >
                <div className="sticky left-0 z-10 grid-cell font-bold text-[10px] text-slate-700 tracking-wider justify-center bg-slate-50 uppercase border-r shadow-sm">TOTALE</div>
                {colTotals.map((tot, i) => (
                  <div key={i} className={`grid-cell justify-center font-bold ${tot > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>
                    {tot > 0 ? tot : '-'}
                  </div>
                ))}
              </div>

              {/* Delete Column Row */}
              <div 
                className="grid border-t border-slate-200 bg-slate-50"
                style={{ gridTemplateColumns: `var(--col-prod) repeat(${maxDaysPossible}, var(--col-day))` }}
              >
                <div className="sticky left-0 z-10 grid-cell bg-slate-50 font-bold text-[10px] text-red-500 uppercase tracking-wider justify-center border-r shadow-sm">ELIMINA</div>
                {Array.from({ length: maxDaysPossible }).map((_, i) => (
                  <div key={i} className="grid-cell justify-center">
                    <button onClick={() => deleteColumn(i)} className="w-6 h-6 rounded-md text-red-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modals Implementation */}
      <AnimatePresence>
        {isProductModalOpen && (
          <Modal onClose={() => setIsProductModalOpen(false)}>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">{editingProduct ? 'Modifica Voce' : 'Nuova Voce'}</h2>
            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Nome Prodotto</label>
                <input 
                  name="name" 
                  defaultValue={editingProduct?.name || ''} 
                  required 
                  className="w-full px-4 py-2.5 bg-white/70 border border-white rounded-lg focus:ring-2 focus:ring-indigo-400 outline-none transition-all" 
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 mb-2 uppercase">Giorni Max</label>
                  <input name="maxDays" type="number" defaultValue={editingProduct?.maxDays || 30} required min="1" className="w-full px-3 py-2.5 bg-white/70 border border-white rounded-lg text-center" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-amber-600 mb-2 uppercase">Giallo</label>
                  <input name="yellowDays" type="number" defaultValue={editingProduct?.yellowDays || 5} required min="0" className="w-full px-3 py-2.5 bg-white/70 border border-white rounded-lg text-center" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-red-600 mb-2 uppercase">Rosso</label>
                  <input name="redDays" type="number" defaultValue={editingProduct?.redDays || 3} required min="0" className="w-full px-3 py-2.5 bg-white/70 border border-white rounded-lg text-center" />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsProductModalOpen(false)} className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg">Annulla</button>
                <button type="submit" className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-lg shadow-md">Salva</button>
              </div>
            </form>
          </Modal>
        )}

        {isBatchModalOpen && (
          <Modal onClose={() => setIsBatchModalOpen(false)}>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Aggiungi Collo</h2>
            <p className="text-sm text-slate-500 mb-6">per <strong className="text-indigo-600">{products.find(p => p.id === activeProductId)?.name}</strong></p>
            <QuantityInput onSave={handleAddBatch} onCancel={() => setIsBatchModalOpen(false)} initial={1} />
          </Modal>
        )}

        {isSlotModalOpen && activeSlot && (
          <Modal onClose={() => setIsSlotModalOpen(false)}>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Modifica Slot</h2>
            <p className="text-sm text-slate-500 mb-6">
              {(() => {
                const p = products.find(prod => prod.id === activeSlot.productId);
                const { daysPassed } = activeSlot;
                const daysToExpiry = p ? (p.maxDays - daysPassed) : 0;
                
                let infoText = `Giorno ${daysPassed} `;
                if (daysPassed === 0) infoText += " (Oggi)";
                else if (daysPassed === 1) infoText += " (Ieri)";

                if (p && daysPassed > p.maxDays) {
                  return "Scaduto";
                } else {
                  return `${infoText} - ${daysToExpiry}gg alla scadenza`;
                }
              })()}
            </p>
            <QuantityInput onSave={handleUpdateSlot} onCancel={() => setIsSlotModalOpen(false)} initial={activeSlot.quantity} />
          </Modal>
        )}

        {isDeleteChoiceOpen && productToDelete && (
          <Modal onClose={() => setIsDeleteChoiceOpen(false)}>
            <h2 className="text-xl font-bold text-slate-800 mb-2 text-center">Opzioni Eliminazione</h2>
            <p className="text-sm text-slate-500 mb-6 text-center">Cosa vuoi fare con <strong className="text-indigo-600">{productToDelete.name}</strong>?</p>
            <div className="space-y-3">
              <button 
                onClick={() => handleDeleteProduct(productToDelete.id, true)}
                className="w-full px-4 py-3 bg-amber-100 hover:bg-amber-200 text-amber-700 font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 size={20} /> Svuota Riga (Mantieni Prodotto)
              </button>
              <button 
                onClick={() => handleDeleteProduct(productToDelete.id, false)}
                className="w-full px-4 py-3 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 size={20} /> Elimina Definitivamente (Tutto)
              </button>
              <button onClick={() => setIsDeleteChoiceOpen(false)} className="w-full px-4 py-2.5 bg-slate-100 text-slate-600 font-semibold rounded-lg mt-2">Annulla</button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode, onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="glass-panel rounded-2xl p-8 max-w-md w-full shadow-2xl" 
        onClick={e => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </div>
  );
}

function QuantityInput({ onSave, onCancel, initial = 1 }: { onSave: (q: number) => void, onCancel: () => void, initial?: number }) {
  const [qty, setQty] = useState(initial);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center gap-4">
        <button onClick={() => setQty(Math.max(0, qty - 1))} className="w-12 h-12 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center text-slate-600 font-bold text-xl">−</button>
        <div className="w-20 text-center text-2xl font-bold px-4 py-3 bg-white/70 border border-white rounded-lg">{qty}</div>
        <button onClick={() => setQty(qty + 1)} className="w-12 h-12 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center text-slate-600 font-bold text-xl">+</button>
      </div>
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-lg">Annulla</button>
        <button onClick={() => onSave(qty)} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-lg">Salva</button>
      </div>
    </div>
  );
}
