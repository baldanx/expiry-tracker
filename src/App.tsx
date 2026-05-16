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
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from './lib/firebase';
import { Product, Batch } from './types';

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [currentCategory, setCurrentCategory] = useState<'mignon' | 'monoporzione'>('mignon');
  const [showArchived, setShowArchived] = useState(false);

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
          console.error("Auth error:", err);
          setError("Errore di autenticazione");
        });
      }
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    const qProducts = collection(db, 'shared_products');
    const qBatches = collection(db, 'shared_batches');

    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      setLoading(false);
    }, (err) => {
      console.error("Products sync error:", err);
      setError("Errore sincronizzazione prodotti");
    });

    const unsubBatches = onSnapshot(qBatches, (snapshot) => {
      setBatches(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Batch)));
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
    <div className="h-full flex flex-col">
      {/* Glass Header */}
      <header className="glass-header z-40 relative shadow-sm">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-indigo-500 to-violet-600 text-white p-2.5 rounded-xl shadow-lg shadow-indigo-200">
              <Calendar size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">Expiry Tracker</h1>
              <p className="text-xs font-medium text-indigo-500 uppercase tracking-wider mt-0.5">
                {new Date().toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View Toggle */}
            <div className="flex bg-slate-100 p-1 rounded-xl items-center gap-1 shadow-inner border border-slate-200">
              <button 
                onClick={() => setCurrentCategory('mignon')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${currentCategory === 'mignon' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Layers size={14} /> MIGNON
              </button>
              <button 
                onClick={() => setCurrentCategory('monoporzione')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${currentCategory === 'monoporzione' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <LayoutGrid size={14} /> MONO
              </button>
            </div>

            <div className="flex items-center gap-1 bg-white/50 rounded-lg p-1 border border-white/60">
              <button 
                onClick={() => setShowArchived(!showArchived)} 
                className={`p-2 rounded-md transition-all ${showArchived ? 'bg-indigo-100 text-indigo-600' : 'text-slate-500 hover:text-indigo-600 hover:bg-white'}`}
                title={showArchived ? "Mostra Attivi" : "Mostra Archiviati"}
              >
                {showArchived ? <ArchiveRestore size={20} /> : <Archive size={20} />}
              </button>
              <button onClick={handleExport} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-md transition-all" title="Esporta Backup">
                <Download size={20} />
              </button>
              <label className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-md transition-all cursor-pointer" title="Importa Backup">
                <Upload size={20} />
                <input type="file" accept=".json" onChange={handleImport} className="hidden" />
              </label>
            </div>
            <button 
              onClick={() => { setEditingProduct(null); setIsProductModalOpen(true); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-lg shadow-md shadow-indigo-200 hover:shadow-lg hover:from-indigo-700 hover:to-violet-700 transition-all"
            >
              <Plus size={20} />
              <span className="font-bold hidden sm:inline">Nuova Voce</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid Container */}
      <main className="flex-1 overflow-hidden glass-panel m-2 sm:m-4 rounded-2xl">
        <div 
          className="w-full h-full overflow-auto relative" 
          style={{ 
            display: filteredProducts.length > 0 ? 'grid' : 'flex' ,
            gridTemplateColumns: filteredProducts.length > 0 ? `minmax(140px, 180px) repeat(${maxDaysPossible}, 40px)` : 'none'
          }}
        >
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center w-full h-full text-slate-400 p-8">
              <div className="bg-white/50 p-6 rounded-full mb-4">
                {showArchived ? <Archive size={48} className="text-slate-300" /> : <Calendar size={48} className="text-indigo-300" />}
              </div>
              <p className="text-lg font-medium text-slate-600">{showArchived ? 'Nessun prodotto archiviato' : 'Nessun prodotto attivo'}</p>
              <p className="text-sm text-slate-500 mt-1">{showArchived ? 'Torna agli attivi' : 'Premi "Nuova Voce" per iniziare'}</p>
            </div>
          ) : (
            <>
              {/* Header Row */}
              <div className="sticky-corner font-bold text-slate-400 text-[10px] tracking-wider uppercase border-r">PRODOTTO</div>
              {Array.from({ length: maxDaysPossible }).map((_, i) => {
                const date = new Date();
                date.setDate(date.getDate() - i);
                return (
                  <div key={i} className="sticky-header-row grid-cell flex-col border-b border-slate-200">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">{i} g</span>
                    <span className="text-xs font-semibold text-slate-600">{date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}</span>
                  </div>
                );
              })}

              {/* Product Rows */}
              {filteredProducts.map((p, pIndex) => {
                const pBatches = batches.filter(b => b.productId === p.id);
                const slots: Record<number, number> = {};
                pBatches.forEach(b => {
                  const dp = getDaysPassed(b.entryDate);
                  if (dp >= 0 && dp < maxDaysPossible) {
                    slots[dp] = (slots[dp] || 0) + b.quantity;
                  }
                });

                return (
                  <div key={p.id} className="contents">
                    <div className="sticky-col-product grid-cell relative px-2 group bg-white">
                      <div className="flex items-center w-full gap-1">
                        <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => moveProduct(p, 'up')} className="p-0.5 text-slate-400 hover:text-indigo-600" title="Sposta su">
                            <ChevronUp size={14} />
                          </button>
                          <button onClick={() => moveProduct(p, 'down')} className="p-0.5 text-slate-400 hover:text-indigo-600" title="Sposta giù">
                            <ChevronDown size={14} />
                          </button>
                        </div>
                        <span className="font-semibold text-slate-700 text-[13px] flex-1 text-center truncate italic leading-tight">{p.name}</span>
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 backdrop-blur-sm px-1">
                        <button onClick={() => { setActiveProductId(p.id); setIsBatchModalOpen(true); }} className="p-1 px-1.5 rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center justify-center transition-colors">
                          <Plus size={16} />
                        </button>
                        <button onClick={() => { setEditingProduct(p); setIsProductModalOpen(true); }} className="p-1 px-1.5 rounded-md bg-slate-50 text-slate-500 hover:bg-slate-100 flex items-center justify-center transition-colors">
                          <Edit2 size={12} />
                        </button>
                        <button onClick={() => toggleArchive(p)} className="p-1 px-1.5 rounded-md bg-amber-50 text-amber-600 hover:bg-amber-100 flex items-center justify-center transition-colors" title={p.isArchived ? "Ripristina" : "Archivia"}>
                          {p.isArchived ? <ArchiveRestore size={12} /> : <Archive size={12} />}
                        </button>
                        <button onClick={() => { setProductToDelete(p); setIsDeleteChoiceOpen(true); }} className="p-1 px-1.5 rounded-md bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center transition-colors">
                          <Trash2 size={12} />
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
                          onClick={qty === 0 ? () => { setActiveSlot({ productId: p.id, daysPassed: day, quantity: 0 }); setIsSlotModalOpen(true); } : undefined}
                        >
                          {qty > 0 ? (
                            <div 
                              className={`status-dot cursor-pointer ${
                                isRed 
                                  ? 'bg-red-500 hover:bg-red-600 shadow-red-200' 
                                  : isYellow 
                                    ? 'bg-amber-400 hover:bg-amber-500 shadow-amber-200' 
                                    : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200'
                              }`}
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setActiveSlot({ productId: p.id, daysPassed: day, quantity: qty }); 
                                setIsSlotModalOpen(true); 
                              }}
                            >
                              {qty}
                            </div>
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-slate-200 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Total Row */}
              <div className="sticky-col-product grid-cell font-bold text-[10px] text-slate-700 tracking-wider justify-center bg-slate-50 border-t-2 border-slate-200 uppercase">TOTALE</div>
              {colTotals.map((tot, i) => (
                <div key={i} className={`grid-cell justify-center font-bold bg-slate-50 border-t-2 border-slate-200 ${tot > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>
                  {tot > 0 ? tot : '-'}
                </div>
              ))}

              {/* Delete Column Row */}
              <div className="sticky-col-product grid-cell bg-slate-50 font-bold text-[10px] text-red-500 uppercase tracking-wider justify-center">ELIMINA COLONNA</div>
              {Array.from({ length: maxDaysPossible }).map((_, i) => (
                <div key={i} className="grid-cell bg-slate-50 justify-center">
                  <button onClick={() => deleteColumn(i)} className="w-6 h-6 rounded-md text-red-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </>
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
