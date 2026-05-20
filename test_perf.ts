import { writeBatch, doc, setDoc, collection, getFirestore } from 'firebase/firestore';

async function mockSetDoc(ref: any, data: any, options?: any) {
  return new Promise(resolve => setTimeout(resolve, 50)); // simulate 50ms latency
}

async function runWithoutBatch(invoicesList: any[], db: any, invoiceRef: any, orgId: string, file: any, auth: any, fileUrl: string) {
  const start = performance.now();
  let isFirstInList = true;
  for (const processedData of invoicesList) {
    if (isFirstInList) {
      await mockSetDoc(invoiceRef, {
        ...processedData,
        status: processedData.validationErrors?.length ? 'Ready for Review' : 'Approved',
      }, { merge: true });
    } else {
      const freshRef = { id: Math.random().toString() }; // mock ref
      await mockSetDoc(freshRef, {
        orgId,
        fileType: file.type,
        uploadedBy: auth.currentUser?.email || 'unknown',
        uploadedAt: Date.now(),
        ...processedData,
        fileName: processedData.fileName || file.name,
        fileUrl: processedData.fileUrl || fileUrl,
        status: processedData.validationErrors?.length ? 'Ready for Review' : 'Approved',
      });
    }
    isFirstInList = false;
  }
  const end = performance.now();
  return end - start;
}

class MockBatch {
  count = 0;
  set(ref: any, data: any, options?: any) {
    this.count++;
  }
  async commit() {
    return new Promise(resolve => setTimeout(resolve, 50)); // simulate 50ms for the whole batch
  }
}

async function runWithBatch(invoicesList: any[], db: any, invoiceRef: any, orgId: string, file: any, auth: any, fileUrl: string) {
  const start = performance.now();
  let isFirstInList = true;
  const batch = new MockBatch();
  for (const processedData of invoicesList) {
    if (isFirstInList) {
      batch.set(invoiceRef, {
        ...processedData,
        status: processedData.validationErrors?.length ? 'Ready for Review' : 'Approved',
      }, { merge: true });
    } else {
      const freshRef = { id: Math.random().toString() }; // mock ref
      batch.set(freshRef, {
        orgId,
        fileType: file.type,
        uploadedBy: auth.currentUser?.email || 'unknown',
        uploadedAt: Date.now(),
        ...processedData,
        fileName: processedData.fileName || file.name,
        fileUrl: processedData.fileUrl || fileUrl,
        status: processedData.validationErrors?.length ? 'Ready for Review' : 'Approved',
      });
    }
    isFirstInList = false;
  }
  await batch.commit();
  const end = performance.now();
  return end - start;
}

async function main() {
  const items = Array.from({length: 10}).map((_, i) => ({ id: i }));
  const db = {};
  const invoiceRef = {};
  const orgId = "org123";
  const file = { type: 'pdf', name: 'test.pdf' };
  const auth = { currentUser: { email: 'test@example.com' } };
  const fileUrl = 'http://test';

  const t1 = await runWithoutBatch(items, db, invoiceRef, orgId, file, auth, fileUrl);
  console.log(`Without batch (baseline): ${t1.toFixed(2)}ms`);

  const t2 = await runWithBatch(items, db, invoiceRef, orgId, file, auth, fileUrl);
  console.log(`With batch (optimized): ${t2.toFixed(2)}ms`);
}

main();
