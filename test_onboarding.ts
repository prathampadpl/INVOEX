import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

async function runTest() {
  console.log("Starting Onboarding Integration Test...");

  // Initialize firebase-admin locally if not already initialized
  if (admin.apps.length === 0) {
    // Look for service account in env or config
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccountJson))
      });
    } else {
      console.error("FIREBASE_SERVICE_ACCOUNT_JSON not set");
      process.exit(1);
    }
  }

  const uid = 'qUahDEq5x6OnYaQQ9HdZwZlMV463';
  console.log(`Generating Custom Token for UID: ${uid}`);
  const customToken = await admin.auth().createCustomToken(uid);

  // Now, since we need a Firebase ID token (not a custom token) to call verifyToken in Express,
  // we can exchange the custom token for an ID token using Google Auth REST API!
  const apiKey = process.env.VITE_FIREBASE_API_KEY || "AIzaSyABVbbCPK9A507FTM-mNVTh7L3v_dUXjck";
  console.log("Exchanging Custom Token for ID Token...");
  
  const tokenRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST',
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    headers: { 'Content-Type': 'application/json' }
  });

  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    console.error("Failed to exchange custom token:", errorBody);
    process.exit(1);
  }

  const tokenData = await tokenRes.json();
  const idToken = tokenData.idToken;
  console.log("Successfully obtained ID Token!");

  // Call the onboarding endpoint on the running dev server
  const onboardingUrl = 'http://localhost:3005/api/auth/onboarding';
  console.log(`Calling onboarding endpoint: ${onboardingUrl}`);

  const response = await fetch(onboardingUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json'
    }
  });

  console.log(`Response Status: ${response.status}`);
  const resData = await response.json();
  console.log("Response Body:", resData);

  if (response.ok && resData.success) {
    console.log("Onboarding integration test PASSED!");
  } else {
    console.error("Onboarding integration test FAILED!");
  }
}

runTest().catch(console.error);
