import { useState, useEffect, useRef } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, ExternalLink } from 'lucide-react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/src/lib/store';
import { db, auth, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { doc, getDoc, updateDoc, collection, query, getDocs, limit, orderBy, where } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function Review() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { orgId } = useAuth();
  
  const stateList = location.state?.list as string[] | undefined;
  let prevId: string | null = null;
  let nextId: string | null = null;
  if (stateList && id) {
    const idx = stateList.indexOf(id);
    if (idx !== -1) {
      if (idx > 0) prevId = stateList[idx - 1];
      if (idx < stateList.length - 1) nextId = stateList[idx + 1];
    }
  }

  const [invoice, setInvoice] = useState<any>(null);
  const [editData, setEditData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [historicalVendors, setHistoricalVendors] = useState<string[]>([]);
  const [historicalBuyers, setHistoricalBuyers] = useState<string[]>([]);
  const [vendorCorrections, setVendorCorrections] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchCorrections = async () => {
      if (!orgId) return;
      const currentVendorName = editData?.vendorName || invoice?.vendorName;
      if (!currentVendorName) {
        setVendorCorrections({});
        return;
      }
      
      try {
        const q = query(
          collection(db, `organizations/${orgId}/corrections_log`),
          where('vendor_name', '==', currentVendorName),
          orderBy('updated_at', 'desc')
        );
        const snapshot = await getDocs(q);
        const bestCorrections: Record<string, { value: string, count: number }> = {};
        
        snapshot.forEach(doc => {
          const data = doc.data();
          const field = data.field_name;
          const correctedValue = data.corrected_value;
          const count = data.occurrence_count || 1;
          
          if (!bestCorrections[field] || count > bestCorrections[field].count) {
             bestCorrections[field] = { value: correctedValue, count };
          }
        });
        
        const finalCorrections: Record<string, string> = {};
        Object.keys(bestCorrections).forEach(field => {
           finalCorrections[field] = bestCorrections[field].value;
        });
        setVendorCorrections(finalCorrections);
      } catch (err) {
        console.error("Failed to fetch historical corrections for vendor", err);
      }
    };
    
    fetchCorrections();
  }, [orgId, editData?.vendorName, invoice?.vendorName]);

  // Simple Levenshtein distance for fuzzy matching
  const getDistance = (a: string, b: string) => {
    if (!a) return b.length;
    if (!b) return a.length;
    // Optimization: if strings are too long, just do a prefix/contains check to avoid O(n^2) matrix
    if (a.length > 100 || b.length > 100) {
      return a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase()) ? 5 : 50;
    }
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
    }
    return matrix[b.length][a.length];
  };

  const SuggestionInput = ({ field, label, value, options }: { field: string, label: string, value: string, options: string[] }) => {
    // Find closest match if it isn't an exact match
    let closestMatch = "";
    let closestDist = Infinity;
    
    if (value && value.trim() && options.length > 0) {
      const lowerVal = value.trim().toLowerCase();
      // If exact case-insensitive match exists, we're good
      const exactMatch = options.find(o => o.toLowerCase() === lowerVal);
      if (!exactMatch) {
         options.forEach(opt => {
           let dist = getDistance(lowerVal, opt.toLowerCase());
           // Give a slight boost if startsWith or contains
           if (opt.toLowerCase().includes(lowerVal)) dist -= 1;
           if (dist < closestDist) {
              closestDist = dist;
              closestMatch = opt;
           }
         });
         
         // Only suggest if the distance is small relative to string length, 
         // meaning it is likely a typo and not just a different name.
         const maxAllowedDist = Math.max(3, Math.floor(value.length * 0.4));
         if (closestDist > maxAllowedDist) {
            closestMatch = ""; // don't suggest
         }
      }
    }

    return (
      <div className="space-y-1 relative">
        <Label>{label}</Label>
        <div className="relative">
          <Input 
             value={value || ''} 
             list={`${field}-suggestions`}
             onChange={(e) => handleChange(field, e.target.value)} 
             className={closestMatch ? "border-amber-400 focus-visible:ring-amber-400" : ""}
          />
          <datalist id={`${field}-suggestions`}>
             {options.map(o => <option key={o} value={o} />)}
          </datalist>
        </div>
        {closestMatch && (
           <p className="text-xs text-amber-600 bg-amber-50 p-1.5 rounded-sm border border-amber-200 shadow-sm mt-1 flex items-start gap-1">
             <span className="mt-0.5">💡</span>
             <span>Did you mean <button className="font-bold underline text-amber-700 hover:text-amber-900" onClick={() => handleChange(field, closestMatch)}>{closestMatch}</button>?</span>
           </p>
        )}
      </div>
    );
  };

  useEffect(() => {
    const fetchHistory = async () => {
      if (!orgId) return;
      try {
        const q = query(
          collection(db, `organizations/${orgId}/invoices`),
          where('status', '==', 'Approved'),
          orderBy('uploadedAt', 'desc'),
          limit(200)
        );
        const snapshot = await getDocs(q);
        const vNames = new Set<string>();
        const bNames = new Set<string>();
        snapshot.forEach(doc => {
          const data = doc.data();
          if (data.vendorName?.trim()) vNames.add(data.vendorName.trim());
          if (data.buyerName?.trim()) bNames.add(data.buyerName.trim());
        });
        setHistoricalVendors(Array.from(vNames).sort());
        setHistoricalBuyers(Array.from(bNames).sort());
      } catch (err) {
        console.error("Failed to fetch historical names", err);
      }
    };
    fetchHistory();
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !id) return;
    
    // Reset state when id changes
    setLoading(true);
    setInvoice(null);
    setEditData({});
    
    const fetchInvoice = async () => {
      try {
        const docRef = doc(db, `organizations/${orgId}/invoices`, id);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data && data.lineItems && Array.isArray(data.lineItems)) {
            const mergedItems: any[] = [];
            data.lineItems.forEach((item: any) => {
              // A line is considered a "new" item if it has any key numeric field or HSN
              // description alone (if preceded by a full item) is considered a wrap.
              const hasAmount = item.amount !== null && item.amount !== undefined && item.amount !== 0 && String(item.amount).trim() !== '';
              const hasRate = item.rate !== null && item.rate !== undefined && item.rate !== 0 && String(item.rate).trim() !== '';
              const hasQty = item.quantity !== null && item.quantity !== undefined && item.quantity !== 0 && String(item.quantity).trim() !== '';
              const hasHsn = item.hsnCode && String(item.hsnCode).trim() !== '';
              
              const isStartOfNewItem = hasAmount || hasRate || hasQty || hasHsn;

              if (!isStartOfNewItem && mergedItems.length > 0) {
                // This is likely a continuation of the previous description
                const prevIndex = mergedItems.length - 1;
                const prevDesc = mergedItems[prevIndex].description || '';
                const currDesc = item.description || '';
                if (currDesc) {
                  mergedItems[prevIndex].description = prevDesc.trim() ? `${prevDesc.trim()} ${currDesc.trim()}` : currDesc.trim();
                }
              } else {
                mergedItems.push({ ...item });
              }
            });

            data.lineItems = mergedItems.map((item: any) => {
              let q = Number(item.quantity);
              let r = Number(item.rate);
              let a = Number(item.amount);
              
              const isQ = !isNaN(q) && item.quantity !== null && item.quantity !== undefined && item.quantity !== '';
              const isR = !isNaN(r) && item.rate !== null && item.rate !== undefined && item.rate !== '';
              const isA = !isNaN(a) && item.amount !== null && item.amount !== undefined && item.amount !== '';
              
              if (isQ && isR && !isA) {
                 item.amount = Number((q * r).toFixed(2));
              } else if (isA && isQ && !isR && q !== 0) {
                 item.rate = Number((a / q).toFixed(2));
              } else if (isA && isR && !isQ && r !== 0) {
                 item.quantity = Number((a / r).toFixed(2));
              } else if (isQ && isR && isA) {
                 if (Math.abs(q * r - a) > 0.05) {
                    // Try to preserve amount, re-evaluate quantity or rate if there might have been OCR errors.
                    // But if amount is present, usually user trusts the amount printed on the total. 
                    // Let's just adjust amount to match Q * R to be safe, or just leave it.
                    // Actually, the prompt says "prioritizing math validation", so letting Amount = Q * R is good.
                    item.amount = Number((q * r).toFixed(2));
                 }
              }
              return item;
            });
          }

          setInvoice({ ...data });
          setEditData({ ...data });
        } else {
          toast.error('Invoice not found');
          navigate('/dashboard');
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `organizations/${orgId}/invoices/${id}`);
      } finally {
        setLoading(false);
      }
    };
    
    fetchInvoice();
  }, [id, orgId, navigate]);

  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<Date | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  
  // Refs to allow interval to access latest state
  const editDataRef = useRef(editData);
  const invoiceDataRef = useRef(invoice);
  
  useEffect(() => {
    editDataRef.current = editData;
  }, [editData]);

  useEffect(() => {
    invoiceDataRef.current = invoice;
  }, [invoice]);

  useEffect(() => {
    if (!orgId || !id) return;
    
    // Auto-save every 30 seconds
    const intervalId = setInterval(async () => {
      const currentEditData = editDataRef.current;
      const originalInvoice = invoiceDataRef.current;
      
      // Basic check: if there's no data or it's empty, skip
      if (!currentEditData || Object.keys(currentEditData).length === 0) return;
      
      // If no changes compared to the original invoice, skip
      if (JSON.stringify(currentEditData) === JSON.stringify(originalInvoice)) return;
      
      try {
        setIsAutoSaving(true);
        const docRef = doc(db, `organizations/${orgId}/invoices`, id);
        // Clean nulls and undefined before auto-save
        const cleanedData = { ...currentEditData };
        Object.keys(cleanedData).forEach(key => {
          if (cleanedData[key] === null || cleanedData[key] === undefined) {
            delete cleanedData[key];
          }
        });
        
        // Only update the document data. Avoid changing the explicit review status.
        // If status is 'Needs Review' or 'Ready for Review', we can let it be.
        await updateDoc(docRef, { ...cleanedData });
        setLastAutoSaveTime(new Date());
      } catch (err) {
        console.error('Auto-save failed:', err);
      } finally {
        setIsAutoSaving(false);
      }
    }, 30000);
    
    return () => clearInterval(intervalId);
  }, [orgId, id]);

  const handleChange = (field: string, value: any) => {
    setEditData((prev: any) => ({ ...prev, [field]: value }));
  };

  const isDateInvalid = (dateStr: string | undefined): string | null => {
    if (!dateStr) return null;
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return "Format must be YYYY-MM-DD";
    const [y, m, d] = dateStr.split('-');
    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
    if (dateObj.getFullYear() !== Number(y) || dateObj.getMonth() + 1 !== Number(m) || dateObj.getDate() !== Number(d)) {
      return "Invalid date";
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dateObj > today) return "Date cannot be in the future";
    return null;
  };

  const invoiceDateError = isDateInvalid(editData.invoiceDate);

  const handleSave = async (status: string) => {
    if (!orgId || !id) return;
    
    if (status === 'Approved' && invoiceDateError) {
      toast.error('Please fix validation errors before approving.');
      return;
    }

    try {
      const docRef = doc(db, `organizations/${orgId}/invoices`, id);

      if (status === 'Approved') {
        const fieldsToTrack = [
          'vendorName', 'vendorGSTIN', 'buyerName', 'buyerGSTIN', 'invoiceNumber', 'invoiceDate',
          'taxableAmount', 'cgst', 'sgst', 'igst', 'roundOff', 'grandTotal', 'gstRate'
        ];
        
        for (const field of fieldsToTrack) {
          const original = invoice?.[field] === undefined ? "" : invoice[field];
          const corrected = editData?.[field] === undefined ? "" : editData[field];
          
          if (original !== corrected && String(corrected).trim() !== '') {
            try {
               const { setDoc, increment } = await import('firebase/firestore');
               const vendorName = editData?.vendorName || invoice?.vendorName || 'Unknown';
               
               // Sanitize to prevent persistent prompt injection
               let cleanedCorrected = String(corrected).replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
               if (cleanedCorrected.length > 500) {
                 cleanedCorrected = cleanedCorrected.substring(0, 500);
               }
               const lowerCorr = cleanedCorrected.toLowerCase();
               const isSuspect = ["ignore", "instruction", "output", "system", "rule", "prompt"].some(p => lowerCorr.includes(p));
               if (isSuspect) {
                 console.warn("Rejected suspicious correction value to prevent prompt injection:", cleanedCorrected);
                 continue;
               }

               const safeId = btoa(unescape(encodeURIComponent(`${String(vendorName)}:${String(field)}:${String(original)}:${String(cleanedCorrected)}`)))
                  .replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '').substring(0, 500);
                  
               const correctionRef = doc(db, `organizations/${orgId}/corrections_log`, safeId);
               await setDoc(correctionRef, {
                  vendor_name: String(vendorName).substring(0, 200),
                  field_name: String(field).substring(0, 100),
                  original_value: String(original).substring(0, 500),
                  corrected_value: cleanedCorrected,
                  occurrence_count: increment(1),
                  updated_at: Date.now()
               }, { merge: true });
            } catch(e) {
               console.error("Error logging correction", e);
            }
          }
        }
      }

      await updateDoc(docRef, { ...editData, status });

      // Propagation logic: apply corrected values to other invoices with the same vendor (both unverified & approved)
      const fieldsToPropagate = [
        'vendorName', 'vendorGSTIN', 'buyerName', 'buyerGSTIN', 'gstRate'
      ];
      
      const propagationUpdates: Record<string, { original: any, corrected: any }> = {};
      for (const field of fieldsToPropagate) {
        const original = invoice?.[field];
        const corrected = editData?.[field];
        if (original !== undefined && corrected !== undefined && original !== corrected && String(corrected).trim() !== '') {
          propagationUpdates[field] = { original, corrected };
        }
      }
      
      const hasUpdates = Object.keys(propagationUpdates).length > 0;
      if (hasUpdates) {
        try {
          const { getDocs, collection, query, writeBatch } = await import('firebase/firestore');
          const invoicesColl = collection(db, `organizations/${orgId}/invoices`);
          const q = query(invoicesColl);
          const querySnapshot = await getDocs(q);
          const batch = writeBatch(db);
          let matchCount = 0;
          
          const currentVendor = (invoice?.vendorName || '').toLowerCase().trim();
          const newVendor = (editData?.vendorName || '').toLowerCase().trim();
          const currentGSTIN = (invoice?.vendorGSTIN || '').trim();
          
          querySnapshot.forEach((document) => {
            if (document.id === id) return;
            
            const data = document.data();
            const targetVendor = (data.vendorName || '').toLowerCase().trim();
            const targetGSTIN = (data.vendorGSTIN || '').trim();
            
            // Match invoices belonging to the same vendor context
            const isSameVendor = 
              (currentVendor && targetVendor === currentVendor) ||
              (newVendor && targetVendor === newVendor) ||
              (currentGSTIN && targetGSTIN === currentGSTIN);
              
            if (isSameVendor) {
              const updatesToApply: Record<string, any> = {};
              let hasMatch = false;
              
              for (const [field, val] of Object.entries(propagationUpdates)) {
                if (data[field] === val.original) {
                  updatesToApply[field] = val.corrected;
                  hasMatch = true;
                }
              }
              
              if (hasMatch) {
                const targetRef = doc(db, `organizations/${orgId}/invoices`, document.id);
                batch.update(targetRef, updatesToApply);
                matchCount++;
              }
            }
          });
          
          if (matchCount > 0) {
            await batch.commit();
            toast.info(`Propagated corrections to ${matchCount} matching invoices.`);
          }
        } catch (propErr) {
          console.error("Propagation failed:", propErr);
        }
      }

      toast.success('Invoice saved');
      if (nextId) {
        navigate(`/review/${nextId}`, { state: location.state });
      } else {
        navigate('/dashboard');
      }
    } catch (e) {
      toast.error('Failed to save invoice');
      console.error(e);
    }
  };

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [objectUrls, setObjectUrls] = useState<Record<string, string>>({});
  const [zoomScale, setZoomScale] = useState(1);

  useEffect(() => {
    auth.currentUser?.getIdToken().then(t => setAuthToken(t));
  }, []);

  useEffect(() => {
    // Generate object URLs for invoices to avoid passing JWT in query params
    const loadUrls = async () => {
       if (!authToken || !invoice) return;
       const urls = { ...objectUrls };
       let changed = false;
       
       const inv = invoice;
       let fetchUrl = inv.fileUrl;
       if (fetchUrl && fetchUrl.includes('/api/files/')) {
           const parts = fetchUrl.split('/api/files/');
           fetchUrl = '/api/files/' + parts[parts.length - 1];
       } else if (fetchUrl && fetchUrl.startsWith('http://') && !window.location.hostname.includes('localhost')) {
           fetchUrl = fetchUrl.replace('http://', 'https://');
       }
       
       if (fetchUrl && !urls[inv.fileUrl]) {
           try {
               const res = await fetch(fetchUrl, {
                   headers: { 'Authorization': `Bearer ${authToken}` }
               });
               if (res.ok) {
                   const blob = await res.blob();
                   const objectUrl = URL.createObjectURL(blob);
                   urls[inv.fileUrl] = objectUrl;
                   changed = true;
               }
           } catch (err) {
               console.error("Failed to load secure url for", fetchUrl, err);
           }
       }
       
       if (changed) {
          setObjectUrls(urls);
       }
    };
    loadUrls();
  }, [invoice, authToken]);

  const getSecureUrl = (url: string | null | undefined) => {
    if (!url) return null;
    return objectUrls[url] || null;
  };

  // Revoke object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      Object.values(objectUrls).forEach(url => {
        try { URL.revokeObjectURL(url as string); } catch {}
      });
    };
  }, [objectUrls]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      // Ignore if pressing modifier keys like Ctrl or Cmd
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      
      const key = e.key.toLowerCase();
      if (key === 'a') {
        e.preventDefault();
        handleSave('Approved');
      } else if (key === 'f') {
        e.preventDefault();
        handleSave('Failed');
      } else if (key === 's') {
        e.preventDefault();
        if (nextId) {
          navigate(`/review/${nextId}`, { state: location.state });
        } else {
          navigate('/dashboard');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editData, invoice, orgId, id, navigate, nextId, location.state]);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!invoice) return null;

  const renderFlaggedInput = (field: string, label: string) => {
    const histVal = vendorCorrections[field];
    const currentVal = String(editData[field] || '').trim();
    
    // If there's a historical correction for this field, and it differs from the current value
    const isDiscrepancy = histVal !== undefined && histVal !== '' && currentVal !== histVal;

    return (
      <div className="space-y-1">
        <Label>{label}</Label>
        <Input 
           value={editData[field] || ''} 
           onChange={(e) => handleChange(field, e.target.value)} 
           className={isDiscrepancy ? "border-amber-400 ring-1 ring-amber-400 focus-visible:ring-amber-500 bg-amber-50/50" : ""}
        />
        {isDiscrepancy && (
           <p className="text-xs text-amber-600 bg-amber-50 p-1.5 rounded-sm border border-amber-200 shadow-sm mt-1 flex items-start gap-1">
             <span className="mt-0.5">⚠️</span>
             <span>Past correction for this vendor: <button className="font-bold underline text-amber-700 hover:text-amber-900" onClick={() => handleChange(field, histVal)}>{histVal}</button></span>
           </p>
        )}
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col space-y-6 max-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/dashboard')} title="Back to Dashboard">← Back</Button>
          <h1 className="text-2xl font-bold tracking-tight">Review: {invoice.fileName}</h1>
          {stateList && (
            <div className="flex items-center gap-2 ml-4 border-l pl-4">
              <Button size="sm" variant="outline" disabled={!prevId} onClick={() => prevId && navigate(`/review/${prevId}`, { state: location.state })}>Prev Bill</Button>
              <Button size="sm" variant="outline" disabled={!nextId} onClick={() => nextId && navigate(`/review/${nextId}`, { state: location.state })}>Next Bill</Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          {isAutoSaving ? (
            <span className="text-xs text-gray-500 italic animate-pulse">Saving...</span>
          ) : lastAutoSaveTime ? (
            <span className="text-xs text-gray-400 italic">Saved {lastAutoSaveTime.toLocaleTimeString()}</span>
          ) : null}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => {
              if (nextId) navigate(`/review/${nextId}`, { state: location.state });
              else navigate('/dashboard');
            }} title="Skip (S)">Skip (S)</Button>
            <Button variant="outline" onClick={() => handleSave('Ready for Review')}>Save Draft</Button>
            <Button variant="destructive" onClick={() => handleSave('Failed')} title="Flag Details (F)">Flag Details (F)</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleSave('Approved')} title="Approve (A)">Approve (A)</Button>
          </div>
        </div>
      </div>
      
      <div className="flex-1 grid md:grid-cols-2 gap-6 min-h-0">
        <Card className="h-full flex flex-col border shadow-sm overflow-hidden">
          <CardHeader className="py-3 px-4 border-b bg-neutral-50 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Original Document</CardTitle>
            <div className="flex items-center gap-1">
              {invoice.fileType !== 'application/pdf' && invoice.fileUrl && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-neutral-500 hover:text-neutral-900" onClick={() => setZoomScale(z => Math.max(0.5, z - 0.25))} title="Zoom Out">
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-xs font-mono px-1 w-12 text-center text-neutral-600">{Math.round(zoomScale * 100)}%</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-neutral-500 hover:text-neutral-900" onClick={() => setZoomScale(z => Math.min(4, z + 0.25))} title="Zoom In">
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-neutral-500 hover:text-neutral-900" onClick={() => setZoomScale(1)} title="Reset Zoom">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </>
              )}
              {invoice.fileUrl && getSecureUrl(invoice.fileUrl) && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-neutral-500 hover:text-neutral-900 border-l pl-2 rounded-none ml-1" 
                  onClick={() => window.open(getSecureUrl(invoice.fileUrl)!, '_blank')} 
                  title="Open original document in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-auto bg-neutral-200 flex items-start justify-center relative min-h-0">
            {invoice.fileType === 'application/pdf' ? (
              getSecureUrl(invoice.fileUrl) ? (
                <iframe src={`${getSecureUrl(invoice.fileUrl)}#toolbar=0`} className="w-full h-full border-0 absolute inset-0" title="Invoice" />
              ) : (
                <div className="text-neutral-500">Loading document...</div>
              )
            ) : invoice.fileUrl && getSecureUrl(invoice.fileUrl) ? (
              <div 
                className="w-full h-full overflow-auto p-4 flex items-start justify-center"
              >
                <img 
                  src={getSecureUrl(invoice.fileUrl)!} 
                  alt="Invoice" 
                  style={{ 
                    width: `${zoomScale * 100}%`, 
                    minWidth: `${zoomScale * 100}%`,
                    height: 'auto',
                    transition: 'width 0.15s ease-out, min-width 0.15s ease-out',
                    objectFit: 'contain'
                  }} 
                />
              </div>
            ) : (
              <div className="text-neutral-500">{invoice.fileUrl ? "Loading document..." : "No document to display"}</div>
            )}
          </CardContent>
        </Card>
        
        <Card className="h-full flex flex-col border shadow-sm">
          <CardHeader className="py-3 px-4 border-b bg-neutral-50 flex flex-row items-center justify-between">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-sm font-medium">Extracted Data</CardTitle>
              {invoice.modelVariant && (
                <div className="flex flex-col items-start gap-0.5">
                  <span className="text-[10px] text-neutral-500 font-mono uppercase tracking-widest">Model: {invoice.modelVariant}</span>
                  {invoice.pages && Array.isArray(invoice.pages) && (
                    <span className="text-[10px] text-neutral-400 font-mono uppercase tracking-widest">
                      Source Pages: {invoice.pages.sort((a: any, b: any) => a - b).join(', ')}
                    </span>
                  )}
                </div>
              )}
            </div>
            {invoice.confidenceScore !== undefined && (
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                invoice.confidenceScore > 80 ? 'bg-emerald-100 text-emerald-700' : 
                invoice.confidenceScore > 50 ? 'bg-amber-100 text-amber-700' : 
                'bg-red-100 text-red-700'
              }`}>
                {invoice.confidenceScore}% Confidence
              </span>
            )}
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-6 space-y-6">
            
            {invoice.status === 'Failed' && (
              <div className="p-4 bg-red-50 border border-red-200 rounded text-sm text-red-700 space-y-2">
                <p className="font-bold flex items-center"><span className="text-lg mr-2">❌</span> Extraction Failed</p>
                <p>{invoice.errorDetails || "An unknown error occurred during extraction."}</p>
                <p className="text-xs opacity-80 mt-2">You can review the original document on the left and input the data manually, or flag the invoice.</p>
              </div>
            )}

            {invoice.validationErrors && invoice.validationErrors.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 space-y-1">
                <p className="font-semibold">Validation Issues:</p>
                <ul className="list-disc pl-5">
                  {invoice.validationErrors.map((err: string, i: number) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <SuggestionInput field="vendorName" label="Vendor Name" value={editData.vendorName} options={historicalVendors} />
              {renderFlaggedInput('vendorGSTIN', 'Vendor GSTIN')}
              <SuggestionInput field="buyerName" label="Buyer Name" value={editData.buyerName} options={historicalBuyers} />
              {renderFlaggedInput('buyerGSTIN', 'Buyer GSTIN')}
              <div className="space-y-1">
                <Label>Invoice Number</Label>
                <Input value={editData.invoiceNumber || ''} onChange={(e) => handleChange('invoiceNumber', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Invoice Date</Label>
                <Input 
                  className={invoiceDateError ? "border-red-500 focus-visible:ring-red-500" : ""}
                  value={editData.invoiceDate || ''} 
                  placeholder="YYYY-MM-DD" 
                  onChange={(e) => handleChange('invoiceDate', e.target.value)} 
                />
                {invoiceDateError && <p className="text-xs text-red-500">{invoiceDateError}</p>}
              </div>
            </div>

            <div className="border-t pt-4 grid grid-cols-2 gap-4">
               <div className="space-y-1">
                <Label>Taxable Amount</Label>
                <Input type="number" value={editData.taxableAmount || ''} onChange={(e) => handleChange('taxableAmount', parseFloat(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>GST Rate (%)</Label>
                <Input type="number" value={editData.gstRate || ''} onChange={(e) => handleChange('gstRate', parseFloat(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>CGST</Label>
                <Input type="number" value={editData.cgst || ''} onChange={(e) => handleChange('cgst', parseFloat(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>SGST</Label>
                <Input type="number" value={editData.sgst || ''} onChange={(e) => handleChange('sgst', parseFloat(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>IGST</Label>
                <Input type="number" value={editData.igst || ''} onChange={(e) => handleChange('igst', parseFloat(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>Round Off</Label>
                <Input type="number" value={editData.roundOff || ''} onChange={(e) => handleChange('roundOff', parseFloat(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label className="font-bold text-gray-900">Grand Total</Label>
                <Input type="number" className="font-bold bg-neutral-50" value={editData.grandTotal || ''} onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  const cleanVal = isNaN(val) ? 0 : val;
                  setEditData((prev: any) => ({ ...prev, grandTotal: cleanVal, balanceDue: cleanVal - (prev.advancePaid || 0) }));
                }} />
              </div>
              <div className="space-y-1">
                <Label>Advance Paid</Label>
                <Input type="number" className="bg-blue-50/30 font-medium" value={editData.advancePaid || ''} onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  const cleanVal = isNaN(val) ? 0 : val;
                  setEditData((prev: any) => ({ ...prev, advancePaid: cleanVal, balanceDue: (prev.grandTotal || 0) - cleanVal }));
                }} />
              </div>
              <div className="space-y-1">
                <Label>Balance Due</Label>
                <Input type="number" className="bg-amber-50/30 font-bold" value={editData.balanceDue || ''} onChange={(e) => handleChange('balanceDue', parseFloat(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>Payment Mode</Label>
                <Input value={editData.paymentMode || ''} onChange={(e) => handleChange('paymentMode', e.target.value)} placeholder="Cash, UPI, etc." />
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <Label className="font-bold text-gray-900">Line Items</Label>
              {(!editData.lineItems || editData.lineItems.length === 0) ? (
                <div className="text-sm text-gray-500 italic">No line items extracted.</div>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-neutral-50 text-neutral-600 border-b">
                      <tr>
                        <th className="px-4 py-2 font-medium">Description</th>
                        <th className="px-4 py-2 font-medium w-24">HSN</th>
                        <th className="px-4 py-2 font-medium w-20">Qty</th>
                        <th className="px-4 py-2 font-medium w-20">Unit</th>
                        <th className="px-4 py-2 font-medium w-24">Rate</th>
                        <th className="px-4 py-2 font-medium w-20">Disc</th>
                        <th className="px-4 py-2 font-medium w-28">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y relative">
                      {editData.lineItems.map((item: any, idx: number) => {
                        return (
                        <tr key={idx} className="bg-white">
                          <td className="px-2 py-1"><Input className="h-8 shadow-none" value={item.description || ''} onChange={(e) => {
                            const newItems = [...editData.lineItems];
                            newItems[idx].description = e.target.value;
                            setEditData({ ...editData, lineItems: newItems });
                          }} /></td>
                          <td className="px-2 py-1"><Input className="h-8 shadow-none w-20" value={item.hsnCode || ''} onChange={(e) => {
                            const newItems = [...editData.lineItems];
                            newItems[idx].hsnCode = e.target.value;
                            setEditData({ ...editData, lineItems: newItems });
                          }} /></td>
                          <td className="px-2 py-1"><Input className="h-8 shadow-none w-16" type="number" value={item.quantity || ''} onChange={(e) => {
                            const newItems = [...editData.lineItems];
                            newItems[idx].quantity = Number(e.target.value);
                            if (newItems[idx].amount && !newItems[idx].rate && newItems[idx].quantity) {
                              newItems[idx].rate = Number((newItems[idx].amount / newItems[idx].quantity).toFixed(2));
                            } else if (newItems[idx].rate) {
                              const disc = newItems[idx].discount || 0;
                              const isPercent = newItems[idx].discountType === 'percent';
                              const sub = newItems[idx].quantity * newItems[idx].rate;
                              newItems[idx].amount = Number((isPercent ? sub * (1 - disc/100) : sub - disc).toFixed(2));
                            }
                            setEditData({ ...editData, lineItems: newItems });
                          }} /></td>
                          <td className="px-2 py-1"><Input className="h-8 shadow-none w-16" value={item.unit || ''} onChange={(e) => {
                            const newItems = [...editData.lineItems];
                            newItems[idx].unit = e.target.value;
                            setEditData({ ...editData, lineItems: newItems });
                          }} /></td>
                          <td className="px-2 py-1"><Input className="h-8 shadow-none w-20" type="number" value={item.rate || ''} onChange={(e) => {
                            const newItems = [...editData.lineItems];
                            newItems[idx].rate = Number(e.target.value);
                            if (newItems[idx].amount && !newItems[idx].quantity && newItems[idx].rate) {
                              newItems[idx].quantity = Number((newItems[idx].amount / newItems[idx].rate).toFixed(2));
                            } else if (newItems[idx].quantity) {
                              const disc = newItems[idx].discount || 0;
                              const isPercent = newItems[idx].discountType === 'percent';
                              const sub = newItems[idx].quantity * newItems[idx].rate;
                              newItems[idx].amount = Number((isPercent ? sub * (1 - disc/100) : sub - disc).toFixed(2));
                            }
                            setEditData({ ...editData, lineItems: newItems });
                          }} /></td>
                          <td className="px-2 py-1 flex items-center gap-1">
                            <Input className="h-8 shadow-none w-14 px-1" type="number" value={item.discount || ''} onChange={(e) => {
                              const newItems = [...editData.lineItems];
                              newItems[idx].discount = Number(e.target.value);
                              const sub = newItems[idx].quantity * newItems[idx].rate;
                              const isPercent = newItems[idx].discountType === 'percent';
                              newItems[idx].amount = Number((isPercent ? sub * (1 - newItems[idx].discount/100) : sub - newItems[idx].discount).toFixed(2));
                              setEditData({ ...editData, lineItems: newItems });
                            }} />
                            <select 
                              className="h-8 border rounded text-[10px] w-9 focus:outline-none" 
                              value={item.discountType || 'none'} 
                              onChange={(e) => {
                                const newItems = [...editData.lineItems];
                                newItems[idx].discountType = e.target.value;
                                const sub = newItems[idx].quantity * newItems[idx].rate;
                                const isPercent = e.target.value === 'percent';
                                newItems[idx].amount = Number((isPercent ? sub * (1 - (newItems[idx].discount||0)/100) : sub - (newItems[idx].discount||0)).toFixed(2));
                                setEditData({ ...editData, lineItems: newItems });
                              }}
                            >
                              <option value="none">-</option>
                              <option value="percent">%</option>
                              <option value="flat">₹</option>
                            </select>
                          </td>
                          <td className="px-2 py-1"><Input className="h-8 shadow-none w-24" type="number" value={item.amount || ''} onChange={(e) => {
                            const newItems = [...editData.lineItems];
                            newItems[idx].amount = Number(e.target.value);
                            setEditData({ ...editData, lineItems: newItems });
                          }} /></td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
