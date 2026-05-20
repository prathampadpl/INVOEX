import React, { useState } from 'react';
import { useAuth } from '@/src/lib/store';
import { auth, db } from '@/src/lib/firebase';
import { collection, doc, setDoc, getDocs } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

export default function UploadBatch() {
  const { orgId } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [fileStatuses, setFileStatuses] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const isAllowedFile = (file: File) => {
    const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.txt', '.docx'];
    const allowedMimePrefixes = ['image/', 'text/plain'];
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];

    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();

    const matchesExtension = allowedExtensions.some(ext => name.endsWith(ext));
    const matchesMime = allowedMimes.includes(type) || allowedMimePrefixes.some(prefix => type.startsWith(prefix));

    return matchesExtension || matchesMime;
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      let droppedFiles = Array.from(e.dataTransfer.files).filter((f: any) => isAllowedFile(f));
      if (droppedFiles.length > 100) {
        toast.warning("Maximum 100 files allowed per batch. Truncating to 100.");
        droppedFiles = droppedFiles.slice(0, 100);
      }
      setFiles(droppedFiles);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      let selectedFiles = Array.from(e.target.files).filter((f: any) => isAllowedFile(f));
      if (selectedFiles.length > 100) {
        toast.warning("Maximum 100 files allowed per batch. Truncating to 100.");
        selectedFiles = selectedFiles.slice(0, 100);
      }
      setFiles(selectedFiles);
    }
  };

  const processBatch = async () => {
    if (files.length === 0) {
      toast.error('No files selected for extraction.');
      return;
    }
    if (!orgId) {
      toast.error('No active organization found. Please try refreshing or re-logging.');
      return;
    }
    
    setIsUploading(true);
    setProgress(0);
    
    let completed = 0;
    let failed = 0;
    const incrementProgress = (isSuccess: boolean) => {
      completed++;
      if (!isSuccess) failed++;
      setProgress((completed / files.length) * 100);
    };

    const updateFileStatus = (file: any, status: string) => {
      setFileStatuses((current) => ({ ...current, [file.name]: status }));
    }

    const processFile = async (file: File, rules: any[]) => {
      let invoiceRef: any = null;
      try {
        const token = await auth.currentUser?.getIdToken();

        // Create Firestore record immediately so we can track status
        updateFileStatus(file, 'Initializing database record...');
        invoiceRef = doc(collection(db, `organizations/${orgId}/invoices`));
        await setDoc(invoiceRef, {
          orgId,
          status: 'Extracting',
          fileName: file.name,
          fileType: file.type,
          fileUrl: '',
          uploadedBy: auth.currentUser!.uid,
          uploadedAt: Date.now()
        });

        updateFileStatus(file, 'AI extraction in progress... (may take up to 2 mins)');

        // Send the file directly to /api/extract in a single request.
        // This avoids the Vercel serverless ephemeral filesystem problem where
        // a file uploaded in one function invocation is gone by the time /api/extract runs.
        const formData = new FormData();
        formData.append('file', file);
        if (orgId) {
          formData.append('orgId', orgId);
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes

        let data;
        try {
          const res = await fetch('/api/extract', {
            method: 'POST',
            body: formData,
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          updateFileStatus(file, 'Finalizing Extraction...');
          const textRes = await res.text();
          if (!res.ok) {
            let serverError = `API returned ${res.status}: ${res.statusText}`;
            try {
              const errJson = JSON.parse(textRes);
              if (errJson.error) serverError = errJson.error;
              if (errJson.details) serverError += ` - ${errJson.details}`;
            } catch (e) {
              serverError += ` - ${textRes.slice(0, 150)}...`;
            }
            throw new Error(serverError);
          }
          try {
            data = JSON.parse(textRes);
          } catch (e) {
            throw new Error(`Invalid JSON from API (Status ${res.status}): ${textRes.slice(0, 100)}...`);
          }
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          throw fetchErr;
        }
        
        updateFileStatus(file, 'Applying rules and saving...');
        // 4. Fetch and apply org rules
        const invoicesList = Array.isArray(data) ? data : [data];
        let isFirstInList = true;

        for (const dataItem of invoicesList) {
          let processedData = { ...dataItem };
          try {
            for (const rule of rules) {
               const { conditionField, conditionOperator, conditionValue, actionField, actionValue } = rule;
               const fieldValue = processedData[conditionField];
               if (fieldValue !== undefined) {
                 let match = false;
                 const valStr = String(fieldValue).toLowerCase();
                 const condStr = conditionValue.toLowerCase();
                 if (conditionOperator === 'contains' && valStr.includes(condStr)) match = true;
                 if (conditionOperator === 'equals' && valStr === condStr) match = true;
                 if (conditionOperator === 'startsWith' && valStr.startsWith(condStr)) match = true;
                 if (conditionOperator === 'endsWith' && valStr.endsWith(condStr)) match = true;
                 
                 if (match) {
                   processedData[actionField] = actionField === 'gstRate' || actionField.toLowerCase().includes('amount') ? parseFloat(actionValue) : actionValue;
                 }
               }
            }
          } catch (e) {
            console.error("Rule evaluation error", e);
          }

          Object.keys(processedData).forEach(key => {
            if (processedData[key] === null) {
              delete processedData[key];
            }
          });

          if (isFirstInList) {
            await setDoc(invoiceRef, {
              ...processedData,
              status: processedData.validationErrors?.length ? 'Ready for Review' : 'Approved',
            }, { merge: true });
          } else {
            const freshRef = doc(collection(db, `organizations/${orgId}/invoices`));
            await setDoc(freshRef, {
              orgId,
              fileType: file.type,
              uploadedBy: auth.currentUser?.email || 'unknown',
              uploadedAt: Date.now(),
              ...processedData,
              fileName: processedData.fileName || file.name,
              fileUrl: processedData.fileUrl || '',
              status: processedData.validationErrors?.length ? 'Ready for Review' : 'Approved',
            });
          }
          isFirstInList = false;
        }

        updateFileStatus(file, `Completed Successfully (${invoicesList.length})`);
        incrementProgress(true);
      } catch (err: any) {
        console.error('File process error', err);
        const errorMessage = `Failed: ${err.message || 'Unknown error'}. Please fix manually in Review tab.`;
        updateFileStatus(file, errorMessage);
        if (invoiceRef) {
          try {
            await setDoc(invoiceRef, { 
              status: 'Failed',
              errorDetails: errorMessage
            }, { merge: true });
          } catch (e) {
             console.error("Could not update status to failed", e);
          }
        }
        toast.error(`Failed to process ${file.name}`);
        incrementProgress(false);
      }
    };

    let rules: any[] = [];
    try {
      const rulesSnap = await getDocs(collection(db, `organizations/${orgId}/rules`));
      rules = rulesSnap.docs.map(d => d.data());
    } catch (e) {
      console.error("Failed to fetch rules", e);
    }

    // Process with a concurrency limit of 1 for safety on shared infrastructure and rate limits
    const CONCURRENCY_LIMIT = 1;
    const queue = [...files];
    const workers = Array(Math.min(CONCURRENCY_LIMIT, files.length)).fill(0).map(async () => {
      while (queue.length > 0) {
        const file = queue.shift();
        if (file) await processFile(file, rules);
      }
    });

    await Promise.all(workers);
    
    setIsUploading(false);
    if (failed === 0) {
      toast.success('Batch processing complete!');
    } else {
      toast.warning(`Batch processing complete with ${failed} failure(s).`);
    }
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
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => document.getElementById('file-upload')?.click()}
          >
            <input 
              type="file" 
              id="file-upload" 
              className="hidden" 
              multiple 
              accept=".pdf,image/png,image/jpeg,image/webp,.txt,.docx" 
              onChange={handleFileSelect}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
            </div>
            <h3 className="text-lg font-semibold">Click to upload or drag and drop</h3>
            <p className="text-sm text-neutral-500 mt-2">PDF, PNG, JPG, WEBP, TXT, or DOCX (Max 35MB per file). Up to 100 files.</p>
          </div>

          {files.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold">{files.length} file(s) selected</h4>
                <Button type="button" onClick={(e) => { e.preventDefault(); processBatch(); }} disabled={isUploading}>
                  {isUploading ? 'Processing...' : 'Upload & Extract'}
                </Button>
              </div>
              
              {isUploading && (
                <div className="space-y-2 mb-4">
                  <Progress value={progress} />
                  <p className="text-sm text-neutral-500 text-center">{Math.round(progress)}% Complete</p>
                </div>
              )}
              
              <ul className="space-y-2 max-h-60 overflow-y-auto">
                {files.map((f: any, i) => (
                  <li key={i} className="flex flex-col py-2 px-3 bg-neutral-50 rounded text-sm">
                    <div className="flex items-center justify-between">
                      <span className="truncate">{f.name}</span>
                      <span className="text-neutral-500">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                    {fileStatuses[f.name] && (
                       <div className="text-xs text-blue-600 mt-1 font-medium bg-blue-50 px-2 py-1 rounded inline-block w-fit">
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
