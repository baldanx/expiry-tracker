import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
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
  ArchiveRestore,
  GripVertical,
  Layers,
  LayoutGrid,
  AlertCircle,
  ListOrdered
} from 'lucide-react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'motion/react';
import { db, auth } from './lib/firebase';
import { Product, Batch } from './types';

interface ReorderItemProps {
  isReorderMode: boolean;
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
  setIsDragging: (dragging: boolean) => void;
  saveOrder: () => void;
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
  setIsSlotModalOpen,
  setIsDragging,
  saveOrder,
  isReorderMode
}) => {
  const dragControls = useDragControls();

  return (
    <Reorder.Item 
      value={p}
      id={p.id}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => { setIsDragging(false); saveOrder(); }}
      dragControls={dragControls}
      dragListener={false}
      className="grid border-b border-slate-200/60 bg-white"
      style={{ gridTemplateColumns: `var(--col-prod) repeat(${maxDaysPossible}, var(--col-day))` }}
      onClick={() => setFocusedProductId(focusedProductId === p.id ? null : p.id)}
    >
      <div className={`sticky left-0 z-30 grid-cell relative px-2 group shadow-sm transition-colors ${focusedProductId === p.id ? 'bg-indigo-50' : 'bg-white'}`}>
        <div className="flex items-center w-full gap-2">
          {isReorderMode && (
            <GripVertical 
              size={20} 
              className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-indigo-600 transition-colors shrink-0 touch-none"
              onPointerDown={(e) => {
                e.preventDefault();
                dragControls.start(e);
              }}
            />
          )}
          <span className={`font-bold text-slate-700 text-[14px] flex-1 text-center truncate leading-tight ${focusedProductId === p.id ? 'text-indigo-600' : ''}`}>
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
        const isBeyondMax = day >= p.maxDays;
        const redStart = p.maxDays - p.redDays;
        const yellowStart = redStart - p.yellowDays;
        const isRed = !isBeyondMax && day >= redStart;
        const isYellow = !isBeyondMax && !isRed && day >= yellowStart;

        return (
          <div 
            key={day} 
            className={`grid-cell relative group ${
              isBeyondMax 
                ? 'bg-slate-100/70' 
                : isRed 
                  ? 'bg-expired' 
                  : isYellow 
                    ? 'bg-warning' 
                    : ''
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setActiveSlot({ productId: p.id, daysPassed: day, quantity: qty }); 
              setIsSlotModalOpen(true); 
            }}
          >
            {qty > 0 ? (
              <div 
                className={`status-dot cursor-pointer ${
                  isBeyondMax
                    ? 'bg-rose-800 shadow-rose-300 ring-2 ring-rose-300'
                    : isRed 
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
  const [isReorderMode, setIsReorderMode] = useState(false);

  const [focusedProductId, setFocusedProductId] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    return products
      .filter(p => {
        const category = p.category || 'mignon';
        return category === currentCategory && (!!p.isArchived === showArchived);
      })
      .sort((a, b) => {
        const orderA = a.sortOrder !== undefined ? a.sortOrder : Infinity;
        const orderB = b.sortOrder !== undefined ? b.sortOrder : Infinity;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return a.name.localeCompare(b.name);
      });
  }, [products, currentCategory, showArchived]);

  const [displayProducts, setDisplayProducts] = useState<Product[]>([]);
  const displayProductsRef = useRef<Product[]>([]);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!isDragging.current) {
      setDisplayProducts(filteredProducts);
      displayProductsRef.current = filteredProducts;
    }
  }, [filteredProducts]);

  // Handle Drag Reorder
  const handleReorder = (newOrder: Product[]) => {
    // Immediate visual update for Framer Motion, without triggering a full recalculation of filteredProducts
    displayProductsRef.current = newOrder;
    setDisplayProducts(newOrder);
  };

  const saveOrder = async () => {
    try {
      const currentOrder = displayProductsRef.current;
      const batch = writeBatch(db);
      let hasChanges = false;
      currentOrder.forEach((p, index) => {
        const newOrderValue = index + 1;
        if (p.sortOrder !== newOrderValue) {
          batch.update(doc(db, 'shared_products', p.id), { sortOrder: newOrderValue });
          hasChanges = true;
        }
      });
      if (hasChanges) {
        await batch.commit();
      }
    } catch (err) {
      console.error("Reorder save error:", err);
    }
  };

  // Modals & Feedback state
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productFormError, setProductFormError] = useState<string | null>(null);
  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState<{ productId: string, daysPassed: number, quantity: number } | null>(null);
  const [isDeleteChoiceOpen, setIsDeleteChoiceOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    variant?: 'danger' | 'primary';
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Auth & Sync
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
      } else {
        signInAnonymously(auth).catch(err => {
          console.error("Auth error:", err);
          setError("Impossibile autenticarsi. Controlla la connessione e riprova.");
          setLoading(false);
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
      setError(null);
      setLoading(false);
    }, (err) => {
      console.error("Products sync error:", err);
      if (err.message.includes('permission-denied')) {
        setError("Permessi insufficienti per accedere al database.");
      }
      setLoading(false);
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
    return Math.round((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  };

  const colTotals = useMemo(() => {
    const totals = new Array(maxDaysPossible).fill(0);
    const validProductIds = new Set(filteredProducts.map(p => p.id));
    
    batches.forEach(b => {
      if (!validProductIds.has(b.productId)) return;
      const dp = getDaysPassed(b.entryDate);
      if (dp >= 0 && dp < maxDaysPossible) {
        totals[dp] += b.quantity;
      }
    });
    return totals;
  }, [batches, filteredProducts, maxDaysPossible]);

  // Actions
  const handleSaveProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string || '').trim();
    const maxDays = parseInt(formData.get('maxDays') as string, 10);
    const yellowDays = parseInt(formData.get('yellowDays') as string, 10);
    const redDays = parseInt(formData.get('redDays') as string, 10);

    if (!name) {
      setProductFormError('Inserisci un nome valido per il prodotto.');
      return;
    }
    if (Number.isNaN(maxDays) || Number.isNaN(yellowDays) || Number.isNaN(redDays) || maxDays < 1 || yellowDays < 0 || redDays < 0) {
      setProductFormError('Inserisci valori numerici validi per i giorni.');
      return;
    }
    if (yellowDays + redDays > maxDays) {
      setProductFormError(`La somma di Giallo (${yellowDays}) + Rosso (${redDays}) non può superare Giorni Max (${maxDays}).`);
      return;
    }

    setProductFormError(null);

    const data = {
      name,
      maxDays,
      yellowDays,
      redDays,
      category: editingProduct ? (editingProduct.category || currentCategory) : currentCategory,
    };

    try {
      localStorage.setItem('lastProductDaysConfig', JSON.stringify({
        maxDays: data.maxDays,
        yellowDays: data.yellowDays,
        redDays: data.redDays
      }));
    } catch {
      // Ignore storage quota errors
    }

    const productToEdit = editingProduct;
    setIsProductModalOpen(false);
    setEditingProduct(null);

    try {
      if (productToEdit) {
        await updateDoc(doc(db, 'shared_products', productToEdit.id), {
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
    } catch (err) {
      console.error("Save product error:", err);
      showToast('Errore durante il salvataggio del prodotto.', 'error');
    }
  };

  const handleDeleteProduct = async (id: string, onlyEmpty = false) => {
    setIsDeleteChoiceOpen(false);
    setProductToDelete(null);
    try {
      const batchesSnapshot = await getDocs(query(collection(db, 'shared_batches'), where('productId', '==', id)));
      const refsToDelete = [
        ...(!onlyEmpty ? [doc(db, 'shared_products', id)] : []),
        ...batchesSnapshot.docs.map(d => d.ref)
      ];
      const CHUNK_SIZE = 450;
      for (let i = 0; i < refsToDelete.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        refsToDelete.slice(i, i + CHUNK_SIZE).forEach(ref => batch.delete(ref));
        await batch.commit();
      }
    } catch (err) {
      console.error("Delete error:", err);
      showToast("Errore durante l'eliminazione", 'error');
    }
  };

  const handleUpdateSlot = async (newQty: number) => {
    if (!activeSlot) return;
    const { productId, daysPassed, quantity: currentTotal } = activeSlot;
    const diff = newQty - currentTotal;
    setIsSlotModalOpen(false);
    if (diff === 0) {
      return;
    }

    try {
      const batch = writeBatch(db);
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - daysPassed);
      targetDate.setHours(12, 0, 0, 0);
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
    } catch (err) {
      console.error("Update slot error:", err);
      showToast("Errore durante l'aggiornamento dello slot.", 'error');
    }
  };

  const deleteColumn = (dayIndex: number) => {
    const validProductIds = new Set(filteredProducts.map(p => p.id));
    const targetBatches = batches.filter(b => validProductIds.has(b.productId) && getDaysPassed(b.entryDate) === dayIndex);
    if (targetBatches.length === 0) return;

    const categoryLabel = currentCategory === 'mignon' ? 'Mignon' : 'Monoporzione';
    setConfirmDialog({
      title: `Elimina Giorno ${dayIndex}d`,
      message: `Eliminare tutti i colli (${categoryLabel}) del giorno ${dayIndex}?`,
      confirmLabel: 'Elimina',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const CHUNK_SIZE = 450;
          for (let i = 0; i < targetBatches.length; i += CHUNK_SIZE) {
            const batch = writeBatch(db);
            targetBatches.slice(i, i + CHUNK_SIZE).forEach(b => {
              batch.delete(doc(db, 'shared_batches', b.id));
            });
            await batch.commit();
          }
        } catch (err) {
          console.error("Delete column error:", err);
          showToast("Errore durante l'eliminazione della colonna.", 'error');
        }
      }
    });
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

  const handleExport = () => {
    const data = {
      products: products.map(({ createdAt, ...p }) => p),
      batches: batches.map(({ id, createdAt, ...b }) => b),
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
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (!Array.isArray(data.products) || !Array.isArray(data.batches)) {
          showToast('Formato file di backup non valido.', 'error');
          return;
        }

        setConfirmDialog({
          title: 'Importa Backup',
          message: `Sostituire i dati attuali con ${data.products.length} voci e ${data.batches.length} colli?`,
          confirmLabel: 'Importa',
          variant: 'primary',
          onConfirm: async () => {
            try {
              const CHUNK_SIZE = 450;

              // 1. Delete existing products and batches in safe chunks
              const [prods, bats] = await Promise.all([
                getDocs(collection(db, 'shared_products')),
                getDocs(collection(db, 'shared_batches'))
              ]);
              const refsToDelete = [...prods.docs.map(d => d.ref), ...bats.docs.map(d => d.ref)];
              for (let i = 0; i < refsToDelete.length; i += CHUNK_SIZE) {
                const delBatch = writeBatch(db);
                refsToDelete.slice(i, i + CHUNK_SIZE).forEach(ref => delBatch.delete(ref));
                await delBatch.commit();
              }

              // 2. Prepare new product docs & remap old productId -> new Firestore doc id
              const idMap = new Map<string, string>();
              const operations: Array<{ ref: ReturnType<typeof doc>; payload: Record<string, any> }> = [];

              data.products.forEach((rawProd: any) => {
                const { id: oldId, createdAt, updatedAt, ...prodFields } = rawProd;
                const newRef = doc(collection(db, 'shared_products'));
                if (oldId) {
                  idMap.set(oldId, newRef.id);
                }
                operations.push({
                  ref: newRef,
                  payload: { ...prodFields, createdAt: serverTimestamp() }
                });
              });

              data.batches.forEach((rawBatch: any) => {
                const { id: _oldBatchId, createdAt, updatedAt, ...batchFields } = rawBatch;
                const mappedProductId = idMap.get(batchFields.productId) ?? batchFields.productId;
                const newRef = doc(collection(db, 'shared_batches'));
                operations.push({
                  ref: newRef,
                  payload: { ...batchFields, productId: mappedProductId, createdAt: serverTimestamp() }
                });
              });

              // 3. Commit imported documents in safe chunks
              for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
                const importBatch = writeBatch(db);
                operations.slice(i, i + CHUNK_SIZE).forEach(op => {
                  importBatch.set(op.ref, op.payload);
                });
                await importBatch.commit();
              }

              showToast('Importazione completata con successo.', 'success');
            } catch (err) {
              console.error("Import commit error:", err);
              showToast("Errore durante l'importazione dei dati.", 'error');
            }
          }
        });
      } catch (err) {
        console.error("Import parse error:", err);
        showToast('Errore lettura file JSON.', 'error');
      } finally {
        input.value = '';
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
    <div className="h-[100dvh] max-h-[100dvh] flex flex-col overflow-hidden bg-slate-100">
      {/* Glass Header */}
      <header className="glass-header z-40 relative shadow-sm shrink-0">
        <div className="max-w-[1920px] mx-auto px-4 py-2 sm:py-3 flex flex-col xs:flex-row justify-between items-center gap-2">
          {/* Logo and Mobile Actions */}
          <div className="flex items-center justify-between w-full xs:w-auto gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-indigo-500 to-violet-600 text-white p-1.5 sm:p-2 rounded-xl shadow-lg shadow-indigo-200 shrink-0">
                <Calendar size={18} className="sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight leading-tight truncate">Expiry Tracker</h1>
                <p className="text-[9px] sm:text-[10px] font-medium text-indigo-500 uppercase tracking-wider">
                  {new Date().toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long' })}
                </p>
              </div>
            </div>
            
            {/* Quick Add for Mobile - Only on very small screens */}
            <button 
              onClick={() => { setEditingProduct(null); setIsProductModalOpen(true); }}
              className="xs:hidden p-1.5 bg-indigo-600 text-white rounded-lg shadow-md shrink-0"
            >
              <Plus size={18} />
            </button>
          </div>

          {/* Controls Bar */}
          <div className="flex items-center gap-2 w-full xs:w-auto justify-between sm:justify-end">
            {/* View Toggle */}
            <div className="flex bg-slate-200/50 p-1 rounded-xl items-center gap-0.5 shadow-inner border border-white/50 shrink-0">
              <button 
                onClick={() => setCurrentCategory('mignon')}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] sm:text-xs font-black transition-all ${currentCategory === 'mignon' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <LayoutGrid size={12} /> <span>MIGNON</span>
              </button>
              <button 
                onClick={() => setCurrentCategory('monoporzione')}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] sm:text-xs font-black transition-all ${currentCategory === 'monoporzione' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Layers size={12} /> <span>MONO</span>
              </button>
            </div>

            <div className="flex items-center gap-1">
              <div className="flex items-center gap-1 bg-white/40 rounded-lg p-1 border border-white/60 shrink-0">
                <button 
                  onClick={() => setShowArchived(!showArchived)} 
                  className={`p-1.5 rounded-md transition-all ${showArchived ? 'bg-indigo-100 text-indigo-600' : 'text-slate-500 hover:text-indigo-600 hover:bg-white'}`}
                  title={showArchived ? "Mostra Attivi" : "Mostra Archiviati"}
                >
                  {showArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                </button>
                <button onClick={handleExport} className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-md transition-all" title="Esporta Backup">
                  <Download size={16} />
                </button>
                <label className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-md transition-all cursor-pointer" title="Importa Backup">
                  <Upload size={16} />
                  <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                </label>
              </div>
              
              <button 
                onClick={() => { setEditingProduct(null); setIsProductModalOpen(true); }}
                className="hidden xs:flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-lg shadow-md shadow-indigo-100 hover:shadow-lg transition-all shrink-0"
              >
                <Plus size={16} />
                <span className="text-xs font-black uppercase tracking-wider">Nuova</span>
              </button>
            </div>
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
                <div className="sticky-corner font-bold text-slate-400 text-[10px] tracking-widest uppercase border-r bg-white/95 h-12 flex items-center px-1">
                  <div className="flex-1 text-center pl-4">PRODOTTO</div>
                  <button 
                    onClick={() => setIsReorderMode(!isReorderMode)}
                    className={`p-1.5 rounded transition-colors ${isReorderMode ? 'bg-indigo-100 text-indigo-600' : 'text-slate-300 hover:text-indigo-500'}`}
                    title={isReorderMode ? "Disattiva riordino" : "Attiva riordino"}
                  >
                    <ListOrdered size={16} />
                  </button>
                </div>
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
                values={displayProducts} 
                onReorder={handleReorder}
                className="flex flex-col min-w-full"
              >
                {displayProducts.map((p) => {
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
                      setIsDragging={(d) => { isDragging.current = d; }}
                      saveOrder={saveOrder}
                      isReorderMode={isReorderMode}
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
          <Modal onClose={() => { setIsProductModalOpen(false); setProductFormError(null); }}>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">{editingProduct ? 'Modifica Voce' : 'Nuova Voce'}</h2>
            <form onSubmit={handleSaveProduct} className="space-y-4">
              {productFormError && (
                <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-medium">
                  {productFormError}
                </div>
              )}
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
                {(() => {
                  let defaultDays = { maxDays: 30, yellowDays: 5, redDays: 2 };
                  try {
                    const saved = localStorage.getItem('lastProductDaysConfig');
                    if (saved) {
                      const parsed = JSON.parse(saved);
                      defaultDays = {
                        maxDays: typeof parsed.maxDays === 'number' ? parsed.maxDays : 30,
                        yellowDays: typeof parsed.yellowDays === 'number' ? parsed.yellowDays : 5,
                        redDays: typeof parsed.redDays === 'number' ? parsed.redDays : 2,
                      };
                    }
                  } catch {
                    // Ignore invalid JSON in localStorage
                  }
                  return (
                    <>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-700 mb-2 uppercase">Giorni Max</label>
                        <input name="maxDays" type="number" defaultValue={editingProduct?.maxDays ?? defaultDays.maxDays} required min="1" className="w-full px-3 py-2.5 bg-white/70 border border-white rounded-lg text-center" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-amber-600 mb-2 uppercase">Giallo</label>
                        <input name="yellowDays" type="number" defaultValue={editingProduct?.yellowDays ?? defaultDays.yellowDays} required min="0" className="w-full px-3 py-2.5 bg-white/70 border border-white rounded-lg text-center" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-red-600 mb-2 uppercase">Rosso</label>
                        <input name="redDays" type="number" defaultValue={editingProduct?.redDays ?? defaultDays.redDays} required min="0" className="w-full px-3 py-2.5 bg-white/70 border border-white rounded-lg text-center" />
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => { setIsProductModalOpen(false); setProductFormError(null); }} className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg">Annulla</button>
                <button type="submit" className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-lg shadow-md">Salva</button>
              </div>
            </form>
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
                
                let infoText = `Giorno ${daysPassed}`;
                if (daysPassed === 0) infoText += " (Oggi)";
                else if (daysPassed === 1) infoText += " (Ieri)";

                if (p && daysPassed >= p.maxDays) {
                  return `${infoText} - Scaduto (max ${p.maxDays}gg)`;
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

        {confirmDialog && (
          <Modal onClose={() => setConfirmDialog(null)}>
            <h2 className="text-xl font-bold text-slate-800 mb-2 text-center">{confirmDialog.title}</h2>
            <p className="text-sm text-slate-600 mb-6 text-center">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={async () => {
                  const action = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  await action();
                }}
                className={`flex-1 px-4 py-2.5 font-semibold rounded-lg text-white shadow-md transition-colors ${
                  confirmDialog.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-gradient-to-r from-indigo-600 to-violet-600'
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </Modal>
        )}

        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold text-white ${
              toast.type === 'error' ? 'bg-red-600' : 'bg-slate-800'
            }`}
          >
            {toast.message}
          </motion.div>
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
  useEffect(() => {
    setQty(initial);
  }, [initial]);
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
