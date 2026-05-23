const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Admin SDK
admin.initializeApp({
  projectId: 'gen-lang-client-00224039-a9ae1',
  storageBucket: 'gen-lang-client-00224039-a9ae1.firebasestorage.app'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function runTest() {
  const workspaceId = 'test-workspace-123';
  const userId = 'test-user-456';
  const uploadId = 'test-upload-789';

  console.log('1. Setting up mock workspace...');
  await db.doc(`workspaces/${workspaceId}`).set({ name: 'Stress Test Workspace' });
  await db.doc(`workspaces/${workspaceId}/members/${userId}`).set({ role: 'owner' });

  console.log('2. Creating a dummy invoice text file...');
  const dummyContent = 'Invoice #9999\nVendor: Acme Corp\nTotal: $420.00\nDate: 2026-05-22';
  fs.writeFileSync('dummy_invoice.txt', dummyContent);

  const storagePath = `workspaces/${workspaceId}/users/${userId}/uploads/${uploadId}`;
  
  console.log(`3. Uploading to Storage path: ${storagePath}`);
  await bucket.upload('dummy_invoice.txt', {
    destination: storagePath,
    metadata: {
      contentType: 'text/plain',
      metadata: {
        workspaceId,
        uploadedBy: userId
      }
    }
  });

  console.log('4. Upload complete. Waiting for Firestore trigger to process...');
  
  // Listen for the invoice document
  const unsubscribe = db.doc(`workspaces/${workspaceId}/invoices/${uploadId}`).onSnapshot((snap) => {
    if (!snap.exists) {
      console.log(' - Document not created yet...');
      return;
    }
    const data = snap.data();
    console.log(` - Current Status: ${data.status}`);
    
    if (data.status === 'Ready for Review') {
      console.log('✅ Extraction Successful!');
      console.log('Data:', JSON.stringify(data, null, 2));
      unsubscribe();
      process.exit(0);
    } else if (data.status === 'Failed') {
      console.error('❌ Extraction Failed!', data.errorDetails);
      unsubscribe();
      process.exit(1);
    }
  });

  // Timeout after 60s
  setTimeout(() => {
    console.error('❌ Timeout: Backend trigger took too long or failed silently.');
    unsubscribe();
    process.exit(1);
  }, 60000);
}

runTest().catch(console.error);
