const { initializeApp } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');

initializeApp({
  projectId: 'gen-lang-client-00224039-a9ae1'
});

async function testBucket() {
  const buckets = [
    'gen-lang-client-00224039-a9ae1.firebasestorage.app',
    'gen-lang-client-00224039-a9ae1.appspot.com'
  ];
  
  const storage = getStorage();
  
  for (const b of buckets) {
    try {
      const bucket = storage.bucket(b);
      const [exists] = await bucket.exists();
      console.log(`Bucket ${b} exists: ${exists}`);
    } catch(e) {
      console.log(`Bucket ${b} error: ${e.message}`);
    }
  }
}
testBucket();
