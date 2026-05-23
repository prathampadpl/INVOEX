const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'gen-lang-client-00224039-a9ae1',
  storageBucket: 'gen-lang-client-00224039-a9ae1.firebasestorage.app'
});

async function setCors() {
  const bucket = admin.storage().bucket();
  console.log('Setting CORS for bucket:', bucket.name);
  
  await bucket.setCorsConfiguration([
    {
      origin: ['*'],
      method: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'HEAD'],
      responseHeader: ['*'],
      maxAgeSeconds: 3600
    }
  ]);
  
  console.log('CORS set successfully!');
}

setCors().catch(console.error);
