import React, { useState, useEffect } from 'react';
import { 
  Server, 
  UploadCloud, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  AlertTriangle,
  FileText,
  Loader2
} from 'lucide-react';

import { useAuth } from '@/src/lib/store';
import { db } from '@/src/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, writeBatch } from 'firebase/firestore';

export default function SAPIntegration() {
  const { workspaceId } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  
  useEffect(() => {
    if (!workspaceId) return;
    const path = `workspaces/${workspaceId}/invoices`;
    const q = query(collection(db, path), orderBy('uploadedAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Map Firebase invoices to SAP format
      const data = snapshot.docs.map(doc => {
        const inv = doc.data();
        return {
          id: doc.id,
          invoex_id: inv.invoiceNumber || doc.id,
          vendor_name: inv.vendorName || '',
          vendor_account_number: inv.vendorAccountNumber || '',
          gstin: inv.vendorGSTIN || '',
          invoice_number: inv.invoiceNumber || '',
          invoice_date: inv.invoiceDate || '',
          due_date: inv.dueDate || '',
          line_items: (inv.lineItems || []).map((item: any) => ({
            material_description: item.description || '',
            quantity: item.quantity || 0,
            unit_price: item.rate || 0,
            hsn_sac_code: item.hsnCode || ''
          })),
          cgst_amount: inv.cgst || 0,
          sgst_amount: inv.sgst || 0,
          igst_amount: inv.igst || 0,
          total_amount: inv.grandTotal || 0,
          currency: "INR",
          status: inv.sap_status || (inv.status === 'Approved' ? 'READY' : 'PENDING'),
          sap_document_number: inv.sap_document_number || null,
          error_message: inv.sap_error_message || null,
          firebase_status: inv.status
        };
      });
      // Only show invoices that are approved in INVOEX or already interacted with SAP
      const approvedOrSap = data.filter(i => i.firebase_status === 'Approved' || i.status !== 'PENDING');
      setInvoices(approvedOrSap);
    }, (error) => {
      console.error("Failed to fetch invoices for SAP", error);
    });

    return unsubscribe;
  }, [workspaceId]);

  const handlePushToSAP = async () => {
    if (!workspaceId) return;
    setIsUploading(true);
    
    // Optimistic UI update
    setInvoices(prev => prev.map(inv => ({ ...inv, status: 'PROCESSING' })));
    
    try {
      // Filter out invoices that are already APPROVED in SAP
      const pendingInvoices = invoices.filter(i => i.status !== 'APPROVED');
      const payload = {
        invoices: pendingInvoices.map(({ status, sap_document_number, error_message, firebase_status, id, ...rest }) => rest)
      };
      
      const API_BASE = import.meta.env.VITE_PADDLE_URL || 'http://localhost:8080';
      const response = await fetch(`${API_BASE}/api/sap/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const updatedStatuses = await response.json();
      
      // Update Firebase with the new SAP statuses
      const batch = writeBatch(db);
      updatedStatuses.forEach((update: any) => {
        // We included the firebase doc 'id' in the payload or we can find it
        // Wait, I stripped 'id' in the payload. Let's find the original invoice by invoex_id.
        const originalInvoice = pendingInvoices.find(i => i.invoex_id === update.invoex_id);
        if (originalInvoice && originalInvoice.id) {
          const docRef = doc(db, `workspaces/${workspaceId}/invoices`, originalInvoice.id);
          batch.update(docRef, {
            sap_status: update.status,
            sap_document_number: update.sap_document_number || null,
            sap_error_message: update.error_message || null
          });
        }
      });
      await batch.commit();
      
      // The onSnapshot listener will automatically update the UI state, 
      // but we can also handle local fallback just in case:
      setInvoices(prev => prev.map(inv => {
        const update = updatedStatuses.find((u: any) => u.invoex_id === inv.invoex_id);
        if (update) {
          return {
            ...inv,
            status: update.status,
            sap_document_number: update.sap_document_number,
            error_message: update.error_message
          };
        }
        return inv;
      }));
      
    } catch (error) {
      console.error("Error pushing to SAP", error);
      alert("Failed to connect to backend server. Make sure Paddle Server is running on port 8080.");
      setInvoices(prev => prev.map(inv => 
        inv.status === 'PROCESSING' ? { ...inv, status: 'READY' } : inv
      ));
    } finally {
      setIsUploading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'APPROVED':
        return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200"><CheckCircle size={12}/> Approved</span>;
      case 'PENDING':
        return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200"><Clock size={12}/> Pending</span>;
      case 'FAILED':
        return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-200"><AlertCircle size={12}/> Failed</span>;
      case 'PROCESSING':
        return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200"><Loader2 size={12} className="animate-spin"/> Pushing...</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-gray-50 text-gray-600 border border-gray-200"><FileText size={12}/> Ready</span>;
    }
  };

  const stats = {
    total: invoices.length,
    approved: invoices.filter(i => i.status === 'APPROVED').length,
    failed: invoices.filter(i => i.status === 'FAILED').length,
    pending: invoices.filter(i => i.status === 'PENDING').length,
  };

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex justify-between items-center mb-8 pb-4 border-b">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <Server size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">SAP Integration</h1>
            <p className="text-sm text-gray-500 mt-1">Seamless invoice synchronization to SAP ERP OData services</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-xl border shadow-sm flex flex-col gap-1">
          <span className="text-sm text-gray-500 font-medium">Total Invoices</span>
          <span className="text-3xl font-bold text-gray-900">{stats.total}</span>
        </div>
        <div className="bg-white p-5 rounded-xl border shadow-sm flex flex-col gap-1">
          <span className="text-sm text-emerald-600 font-medium">Successfully Posted</span>
          <span className="text-3xl font-bold text-gray-900">{stats.approved}</span>
        </div>
        <div className="bg-white p-5 rounded-xl border shadow-sm flex flex-col gap-1">
          <span className="text-sm text-rose-600 font-medium">Validation Failed</span>
          <span className="text-3xl font-bold text-gray-900">{stats.failed}</span>
        </div>
        <div className="bg-white p-5 rounded-xl border shadow-sm flex flex-col gap-1">
          <span className="text-sm text-amber-600 font-medium">Pending Review</span>
          <span className="text-3xl font-bold text-gray-900">{stats.pending}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-6 border-b flex justify-between items-center bg-gray-50/50">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Batch Upload Queue</h2>
            <p className="text-sm text-gray-500">Review verified extracted invoices before pushing to SAP.</p>
          </div>
          <button 
            onClick={handlePushToSAP}
            disabled={isUploading || invoices.every(i => ['APPROVED', 'PENDING'].includes(i.status))}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {isUploading ? (
              <><Loader2 size={18} className="animate-spin" /> Communicating with SAP...</>
            ) : (
              <><UploadCloud size={18} /> Push Batch to SAP</>
            )}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b">
              <tr>
                <th className="px-6 py-4">INVOEX ID</th>
                <th className="px-6 py-4">Vendor</th>
                <th className="px-6 py-4">Invoice No.</th>
                <th className="px-6 py-4">Amount (INR)</th>
                <th className="px-6 py-4">SAP Status</th>
                <th className="px-6 py-4">Document No.</th>
              </tr>
            </thead>
            <tbody className="divide-y text-gray-700">
              {invoices.map((inv) => (
                <tr key={inv.invoex_id} className={`hover:bg-gray-50 transition-colors ${inv.status === 'FAILED' ? 'bg-rose-50/30' : ''}`}>
                  <td className="px-6 py-4 font-medium text-gray-900">{inv.invoex_id}</td>
                  <td className="px-6 py-4">
                    <div>{inv.vendor_name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">GSTIN: {inv.gstin || 'Missing'}</div>
                  </td>
                  <td className="px-6 py-4">{inv.invoice_number}</td>
                  <td className="px-6 py-4 font-semibold text-gray-900">₹{inv.total_amount.toLocaleString('en-IN')}</td>
                  <td className="px-6 py-4">
                    {getStatusBadge(inv.status)}
                    {inv.status === 'FAILED' && inv.error_message && (
                      <div className="flex items-center gap-1.5 text-xs text-rose-600 mt-2 font-medium bg-rose-50 p-2 rounded border border-rose-100 whitespace-normal min-w-[200px]">
                        <AlertTriangle size={14} className="shrink-0"/> 
                        <span>{inv.error_message}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {inv.sap_document_number ? (
                      <span className="font-mono text-emerald-600 font-semibold">{inv.sap_document_number}</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
