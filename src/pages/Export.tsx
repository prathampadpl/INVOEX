import { useState, useEffect } from 'react';
import { useAuth } from '@/src/lib/store';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Download, Calendar, Loader2 } from 'lucide-react';
import Papa from 'papaparse';

export default function Export() {
  const { workspaceId } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('Approved');
  const [filterVendor, setFilterVendor] = useState('');

  useEffect(() => {
    if (!workspaceId) return;
    const path = `workspaces/${workspaceId}/invoices`;
    const q = query(collection(db, path), orderBy('uploadedAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setInvoices(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return unsubscribe;
  }, [workspaceId]);

  const filteredInvoices = useMemo(() => {
    // Bolt Optimization: Hoist string transformations and date parsing outside the filter loop
    // Wrap in useMemo to prevent re-filtering on every render (e.g. when typing in a completely unrelated field, although not present here, it's good practice and avoids re-filtering when loading state changes)
    const vendorLower = filterVendor ? filterVendor.toLowerCase() : '';
    const startTimestamp = filterStartDate ? new Date(filterStartDate).getTime() : null;
    const endTimestamp = filterEndDate ? new Date(filterEndDate).getTime() : null;

    return invoices.filter(i => {
       if (filterStatus !== 'All' && i.status !== filterStatus) return false;

       if (vendorLower) {
          if (!i.vendorName || !i.vendorName.toLowerCase().includes(vendorLower)) return false;
       }

       if (startTimestamp && i.invoiceDate) {
          if (new Date(i.invoiceDate).getTime() < startTimestamp) return false;
       }
       if (endTimestamp && i.invoiceDate) {
          if (new Date(i.invoiceDate).getTime() > endTimestamp) return false;
       }

       return true;
    });
  }, [invoices, filterStatus, filterVendor, filterStartDate, filterEndDate]);

  const handleExport = async () => {
    if (filteredInvoices.length === 0) return alert('No invoices match the export filters.');

    const csvData = filteredInvoices.map(inv => ({
      'Invoice Number': inv.invoiceNumber || '',
      'Invoice Date': inv.invoiceDate || '',
      'Due Date': inv.dueDate || '',
      'Payment Terms': inv.paymentTerms || '',
      'Vendor Name': inv.vendorName || '',
      'Vendor GSTIN': inv.vendorGSTIN || '',
      'Vendor Address': inv.vendorAddress || '',
      'Buyer Name': inv.buyerName || '',
      'Buyer GSTIN': inv.buyerGSTIN || '',
      'Buyer Address': inv.buyerAddress || '',
      'Taxable Amount': inv.taxableAmount || 0,
      'CGST': inv.cgst || 0,
      'SGST': inv.sgst || 0,
      'IGST': inv.igst || 0,
      'Grand Total': inv.grandTotal || 0,
      'GST Rate': inv.gstRate || 0,
      'Advance Paid': inv.advancePaid || 0,
      'Balance Due': inv.balanceDue || 0,
      'Payment Mode': inv.paymentMode || '',
      'Extraction Layer': inv.extractionLayer || inv.modelVariant || '',
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `tally_export_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    
    // Save Export History
    try {
      const { addDoc, collection } = await import('firebase/firestore');
      const authModule = await import('@/src/lib/firebase'); // using auth from store wouldn't work async inside this easily
      const currentUser = authModule.auth.currentUser;
      if (workspaceId && currentUser) {
        await addDoc(collection(db, `workspaces/${workspaceId}/export_history`), {
          workspaceId,
          userId: currentUser.uid,
          filterParams: { filterStatus, filterVendor, filterStartDate, filterEndDate },
          format: 'CSV',
          rowCount: filteredInvoices.length,
          createdAt: Date.now()
        });
      }
    } catch(err) {
      console.error("Failed to save export history", err);
    }
  };

  return (
    <div className="space-y-8 max-w-[1200px] mx-auto pb-12">
      <div className="flex flex-col items-start gap-1">
         <div className="text-blue-600 font-bold text-[10px] tracking-widest uppercase mb-1">Export</div>
         <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-2">Download invoice data</h1>
         <p className="text-gray-500 text-sm">Prepare a UTF-8 CSV export that opens cleanly in Excel and Tally workflows.</p>
      </div>

      <Card className="shadow-sm border-gray-200">
        <CardContent className="pt-6">
           <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
              <div className="space-y-2">
                 <label className="text-xs font-semibold text-gray-600">From Date</label>
                 <div className="relative border border-gray-200 rounded-md bg-white h-10 flex items-center px-3">
                   <input type="date" className="text-sm font-medium text-gray-700 w-full outline-none" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} />
                 </div>
              </div>
              <div className="space-y-2">
                 <label className="text-xs font-semibold text-gray-600">To Date</label>
                 <div className="relative border border-gray-200 rounded-md bg-white h-10 flex items-center px-3">
                   <input type="date" className="text-sm font-medium text-gray-700 w-full outline-none" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} />
                 </div>
              </div>
              <div className="space-y-2">
                 <label className="text-xs font-semibold text-gray-600">Vendor (optional)</label>
                 <div className="relative border border-gray-200 rounded-md bg-white h-10 flex items-center px-3">
                   <input type="text" placeholder="Vendor name" className="text-sm font-medium text-gray-700 w-full outline-none" value={filterVendor} onChange={e => setFilterVendor(e.target.value)} />
                 </div>
              </div>
              <div className="space-y-2">
                 <label className="text-xs font-semibold text-gray-600">Status</label>
                 <select className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="All">All</option>
                    <option value="Approved">Approved</option>
                    <option value="Ready for Review">Ready for Review</option>
                    <option value="Failed">Failed</option>
                 </select>
              </div>
              <div className="space-y-2">
                 <label className="text-xs font-semibold text-gray-600">Format</label>
                 <select className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600">
                    <option>CSV</option>
                 </select>
              </div>
           </div>

           <Button onClick={handleExport} disabled={filteredInvoices.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm h-10 px-6">
             <Download className="w-4 h-4 mr-2" />
             Export {filteredInvoices.length} CSV rows
           </Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-gray-200">
         <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold text-gray-900 mb-1">Preview table</CardTitle>
            <p className="text-sm text-gray-500">First 10 rows that match your export filters.</p>
         </CardHeader>
         <CardContent>
            <Table>
               <TableHeader>
                  <TableRow className="border-gray-100">
                     <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Invoice #</TableHead>
                     <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Vendor</TableHead>
                     <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Date</TableHead>
                     <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</TableHead>
                     <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Total</TableHead>
                  </TableRow>
               </TableHeader>
               <TableBody>
                  {loading ? (
                     <TableRow>
                        <TableCell colSpan={5} className="text-center py-12">
                           <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400 mb-2" />
                           <span className="text-sm text-gray-500">Loading data...</span>
                        </TableCell>
                     </TableRow>
                  ) : filteredInvoices.length === 0 ? (
                     <TableRow>
                        <TableCell colSpan={5} className="text-center text-gray-400 py-12 text-sm">
                           No rows match this export.
                        </TableCell>
                     </TableRow>
                  ) : (
                     filteredInvoices.slice(0, 10).map((inv) => (
                        <TableRow key={inv.id} className="border-gray-100">
                           <TableCell className="font-semibold text-gray-900 text-sm whitespace-nowrap">{inv.invoiceNumber}</TableCell>
                           <TableCell className="font-medium text-gray-600 text-sm whitespace-nowrap">{inv.vendorName}</TableCell>
                           <TableCell className="text-gray-500 text-sm whitespace-nowrap">{inv.invoiceDate}</TableCell>
                           <TableCell className="text-gray-500 text-sm whitespace-nowrap">{inv.status}</TableCell>
                           <TableCell className="text-right text-gray-900 font-medium text-sm whitespace-nowrap">₹{(inv.grandTotal || 0).toFixed(2)}</TableCell>
                        </TableRow>
                     ))
                  )}
               </TableBody>
            </Table>
         </CardContent>
      </Card>
    </div>
  );
}
