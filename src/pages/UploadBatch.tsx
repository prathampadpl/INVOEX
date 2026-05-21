import React, { useState } from 'react';
import { useAuth } from '@/src/lib/store';
import { auth, db, storage, functions } from '@/src/lib/firebase';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

export default function UploadBatch() {
  const { orgId } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [fileStatuses, setFileStatuses] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const isAllowedFile = (file: File) => {
    const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.heic', '.txt', '.docx'];
    const allowedMimePrefixes = ['image/', 'text/plain'];
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return allowedExtensions.some(ext => name.endsWith(ext)) ||
           allowedMimes.includes(type) ||
           allowedMimePrefixes.some(prefix => type.startsWith(prefix));
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      let dropped = Array.from(e.dataTransfer.files).filter(isAllowedFile);
      if (dropped.length > 10) { toast.warning('Max 10 files per batch. Truncating.'); dropped = dropped.slice(0, 10); }
      setFiles(dropped);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      let selected = Array.from(e.target.files).filter(isAllowedFile);
      if (selected.length > 10) { toast.warning('Max 10 files per batch. Truncating.'); selected = selected.slice(0, 10); }
      setFiles(selected);
    }
  };

  const updateStatus = (fileName: string, status: string) =>
    setFileStatuses(cur => ({ ...cur, [fileName]: status }));

  /**
   * Upload flow (FIXED architecture):
   *  1. POST /api/extract → receives invoiceId immediately (upload only, no pipeline)
   *  2. Poll Firestore every 3s until status ≠ 'Extracting' (pipeline runs server-side)
   *  3. Apply org rules to extracted data → merge back to Firestore
   */
  const processFile = async (file: File, rules: any[]) => {
    const token = await auth.currentUser?.getIdToken();
    updateStatus(file.name, '⬆️ Uploading...');
    // Upload is now handled below in the single try/catch block with logs
    
    const invoiceRef = doc(collection(db, `organizations/${orgId}/invoices`));
    const invoiceId = invoiceRef.id;

    const storedFilename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const storagePath = `invoices/${orgId}/${storedFilename}`;
    const storageRef = ref(storage, storagePath);
    const processInvoice = httpsCallable(functions, 'invoiceProcessorV3');

    let extractedData: any = null;
    try {
      console.log(`[${file.name}] Step 1: Uploading to Firebase Storage...`);
      const startTime = Date.now();
      
      await uploadBytes(storageRef, file, {
        contentType: file.type,
        customMetadata: { orgId: orgId as string, uploadedBy: auth.currentUser!.uid, originalName: file.name }
      });
      
      console.log(`[${file.name}] Upload complete in ${Date.now() - startTime}ms`);
      updateStatus(file.name, '🤖 AI extraction in progress...');
      console.log(`[${file.name}] Step 2: Calling Cloud Function invoiceProcessorV3...`);
      
      const fnStartTime = Date.now();
      const result = await processInvoice({
        orgId,
        invoiceId,
        storagePath,
        fileName: file.name,
        fileType: file.type
      });
      
      console.log(`[${file.name}] Cloud Function returned in ${Date.now() - fnStartTime}ms`, result.data);
      extractedData = result.data;
    } catch (err: any) {
      console.error(`[${file.name}] ERROR details:`, err);
      throw new Error(err.message || 'Pipeline failed during processing.');
    }

    if (!extractedData || extractedData.status === 'Failed') {
      throw new Error(extractedData?.errorDetails || 'Pipeline failed.');
    }

    // Step 3: Apply rules
    updateStatus(file.name, '📋 Applying rules...');
    let processed = { ...extractedData };
    for (const rule of rules) {
      try {
        const { conditionField, conditionOperator, conditionValue, actionField, actionValue } = rule;
        const v = String(processed[conditionField] ?? '').toLowerCase();
        const c = conditionValue.toLowerCase();
        const match = (conditionOperator === 'contains' && v.includes(c)) ||
                      (conditionOperator === 'equals' && v === c) ||
                      (conditionOperator === 'startsWith' && v.startsWith(c)) ||
                      (conditionOperator === 'endsWith' && v.endsWith(c));
        if (match) {
          processed[actionField] = ['gstRate', 'taxableAmount', 'cgst', 'sgst', 'igst', 'grandTotal',
            'advancePaid', 'balanceDue', 'roundOff'].includes(actionField)
            ? parseFloat(actionValue) : actionValue;
        }
      } catch {}
    }

    if (rules.length > 0) {
      await setDoc(invoiceRef, processed, { merge: true });
    }

    updateStatus(file.name, `✅ Done — ${extractedData.status}`);
  };

  const processBatch = async () => {
    if (!files.length) { toast.error('No files selected.'); return; }
    if (!orgId) { toast.error('No active organization. Try refreshing.'); return; }

    setIsUploading(true);
    setProgress(0);
    let done = 0, failed = 0;

    let rules: any[] = [];
    try {
      const snap = await getDocs(collection(db, `organizations/${orgId}/rules`));
      rules = snap.docs.map(d => d.data());
    } catch {}

    for (const file of files) {
      try {
        await processFile(file, rules);
      } catch (err: any) {
        updateStatus(file.name, `❌ ${err.message}`);
        toast.error(`${file.name}: ${err.message}`);
        failed++;
      }
      done++;
      setProgress((done / files.length) * 100);
    }

    setIsUploading(false);
    failed === 0 ? toast.success('All files processed!') : toast.warning(`${failed} file(s) failed.`);
    setFiles([]);
    setFileStatuses({});
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Upload Invoices</h1>

      <Card>
        <CardContent className="pt-6">
          <div
            className="border-2 border-dashed border-neutral-300 rounded-lg p-16 text-center hover:bg-neutral-50 transition-colors cursor-pointer"
            onDragOver={e => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => document.getElementById('file-upload')?.click()}
          >
            <input
              type="file"
              id="file-upload"
              className="hidden"
              multiple
              accept=".pdf,image/png,image/jpeg,image/webp,image/heic,.txt,.docx"
              onChange={handleFileSelect}
              onClick={e => e.stopPropagation()}
            />
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" x2="12" y1="3" y2="15"/>
              </svg>
            </div>
            <h3 className="text-lg font-semibold">Click to upload or drag and drop</h3>
            <p className="text-sm text-neutral-500 mt-2">PDF, PNG, JPG, WEBP, HEIC, TXT, or DOCX · Max 10MB per file · Up to 10 files</p>
          </div>

          {files.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold">{files.length} file(s) ready</h4>
                <button
                  type="button"
                  onClick={processBatch}
                  disabled={isUploading}
                  className="inline-flex items-center justify-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                >
                  {isUploading ? 'Processing...' : 'Upload & Extract'}
                </button>
              </div>

              {isUploading && (
                <div className="space-y-2 mb-4">
                  <Progress value={progress} />
                  <p className="text-sm text-neutral-500 text-center">{Math.round(progress)}% Complete</p>
                </div>
              )}

              <ul className="space-y-2 max-h-64 overflow-y-auto">
                {files.map((f, i) => (
                  <li key={i} className="flex flex-col py-2 px-3 bg-neutral-50 rounded text-sm">
                    <div className="flex items-center justify-between">
                      <span className="truncate max-w-[60%]">{f.name}</span>
                      <span className="text-neutral-500">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                    {fileStatuses[f.name] && (
                      <div className="text-xs mt-1 font-medium px-2 py-1 rounded inline-block w-fit
                        bg-blue-50 text-blue-700">
                        {fileStatuses[f.name]}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
