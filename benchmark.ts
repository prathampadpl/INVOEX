import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, writeBatch, collection, connectFirestoreEmulator } from 'firebase/firestore';

// Setup Mock Firestore Emulator Database (needs emulator running, or we just measure execution time of the functions if not running)
const start = performance.now();
// ... write some bench
const end = performance.now();
console.log(end - start);
