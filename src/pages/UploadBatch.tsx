import React, { useState } from 'react';
import { useAuth } from '@/src/lib/store';
import { auth, db, storage } from '@/src/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

const compressImage = (file: File, maxW = 2000, maxH = 2000, quality = 0.85): Promise<Blob> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }

    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      let width = img.width;
      let height = img.height;

      if (width > maxW || height > maxH) {
        if (width > height) {
          height = Math.round((height * maxW) / width);
          width = maxW;
        } else {
          width = Math.round((width * maxH) / height);
          height = maxH;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      resolve(file);
    };
  });
};

export default function UploadBatch() {
  const { workspaceId } = useAuth();
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

  const processFile = async (file: File) => {
    let uploadPayload: Blob | File = file;
    let payloadType = file.type;

    if (file.type.startsWith('image/')) {
      updateStatus(file.name, '⚡ Compressing...');
      try {
        uploadPayload = await compressImage(file);
        payloadType = 'image/jpeg';
      } catch (e) {
        console.warn('Image compression failed, using original file', e);
      }
    }

    updateStatus(file.name, '⬆️ Uploading...');
    
    const uploadId = crypto.randomUUID();
    const userId = auth.currentUser!.uid;
    const storagePath = `workspaces/${workspaceId}/users/${userId}/uploads/${uploadId}`;
    const storageRef = ref(storage, storagePath);

    try {
      await uploadBytes(storageRef, uploadPayload, {
        contentType: payloadType,
        customMetadata: { workspaceId: workspaceId as string, uploadedBy: auth.currentUser!.uid, originalName: file.name }
      });
      
      const fileUrl = await getDownloadURL(storageRef);
      const invoiceRef = doc(db, `workspaces/${workspaceId}/invoices/${uploadId}`);
      
      await setDoc(invoiceRef, {
        status: 'Extracting',
        storagePath: storagePath,
        fileUrl,
        originalName: file.name,
        fileType: payloadType,
        updatedAt: Date.now(),
        createdAt: Date.now(),
        uploadedAt: Date.now(),
      });

      updateStatus(file.name, `✅ Uploaded (Backend Processing)`);

    } catch (err: any) {
      console.error(`[${file.name}] ERROR details:`, err);
      let displayMessage = err.message || 'Pipeline failed during processing.';

      try {
        const invoiceRef = doc(db, `workspaces/${workspaceId}/invoices/${uploadId}`);
        await setDoc(invoiceRef, {
          status: 'Failed',
          errorDetails: displayMessage,
          updatedAt: Date.now()
        }, { merge: true });
      } catch (dbErr) {
        console.error('Failed to update invoice status:', dbErr);
      }
      
      updateStatus(file.name, `❌ Failed: ${displayMessage}`);
      throw new Error(displayMessage);
    }
  };

  const processBatch = async () => {
    if (!files.length) { toast.error('No files selected.'); return; }
    if (!workspaceId) { toast.error('No active workspace. Try refreshing.'); return; }

    setIsUploading(true);
    setProgress(5);
    let done = 0, failed = 0;

    for (const file of files) {
      try {
        await processFile(file);
      } catch (err: any) {
        updateStatus(file.name, `❌ ${err.message}`);
        toast.error(`${file.name}: ${err.message}`);
        failed++;
      }
      done++;
      setProgress(5 + (done / files.length) * 95);
    }

    setIsUploading(false);
    failed === 0 ? toast.success('All files processed!') : toast.warning(`${failed} file(s) failed.`);
    setFiles([]);
    setFileStatuses({});
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
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
            <p className="text-sm text-neutral-500 mt-2">PDF, PNG, JPG, WEBP, HEIC, TXT, or DOCX · Up to 50MB for PDFs (chunked) · Up to 10 files (v2)</p>
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
