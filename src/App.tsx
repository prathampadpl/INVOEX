import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { auth, db, initError } from '@/src/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/src/lib/store';
import ErrorBoundary from '@/src/components/ErrorBoundary';

// Layouts & Pages
import AuthLayout from './pages/AuthLayout';
import MainLayout from './pages/MainLayout';
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import UploadBatch from './pages/UploadBatch';
import Review from './pages/Review';
import Settings from './pages/Settings';
import Export from './pages/Export';

export default function App() {
  const { setUser, setOrgInfo, setLoaded, isLoaded, user } = useAuth();

  useEffect(() => {
    if (initError || !auth) {
      setLoaded(true);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          let lastOrgId = null;
          const uDoc = await getDoc(doc(db, 'users', u.uid));
          if (uDoc.exists()) {
            lastOrgId = uDoc.data()?.lastOrgId;
          }

          if (!lastOrgId) {
            console.log('[App] No user doc or lastOrgId found, calling onboarding endpoint...');
            const idToken = await u.getIdToken();
            const response = await fetch('/api/auth/onboarding', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
              }
            });
            if (response.ok) {
              const resData = await response.json();
              lastOrgId = resData.orgId;
            }
          }

          if (lastOrgId) {
            try {
              const [memberDoc, orgDoc] = await Promise.all([
                getDoc(doc(db, `organizations/${lastOrgId}/members`, u.uid)),
                getDoc(doc(db, 'organizations', lastOrgId))
              ]);
              if (memberDoc.exists() && orgDoc.exists()) {
                const role = memberDoc.data()?.role;
                const validRole = ['owner', 'admin', 'member'].includes(role) ? role : 'member';
                setOrgInfo(lastOrgId, validRole, orgDoc.data()?.name);
              } else {
                setOrgInfo(lastOrgId, 'owner', 'My Organization');
              }
            } catch (memberErr) {
              console.error('Failed to fetch member/org doc, falling back', memberErr);
              setOrgInfo(lastOrgId, 'owner', 'My Organization');
            }
          } else {
            setOrgInfo(null, null);
          }
        } catch (e) {
          console.error('Failed to fetch user org', e);
          setOrgInfo(null, null);
        }
      } else {
        setOrgInfo(null, null);
      }
      setLoaded(true);
    });
    return unsub;
  }, []);

  if (initError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFDFD] font-sans p-6">
        <div className="max-w-md w-full p-8 bg-white border rounded-xl shadow-sm space-y-4 text-center">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center text-xl font-bold mx-auto">!</div>
          <h2 className="text-xl font-bold text-gray-900">Configuration Error</h2>
          <p className="text-gray-600 text-sm">{initError}</p>
          <p className="text-xs text-gray-400">Ensure your VITE_FIREBASE_API_KEY and other Firebase variables are set in your environment.</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="min-h-screen flex items-center justify-center font-sans">Loading...</div>;
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
          </Route>
          
          {/* Protected Routes */}
          <Route element={user ? <MainLayout /> : <Navigate to="/login" />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/export" element={<Export />} />
            <Route path="/upload" element={<UploadBatch />} />
            <Route path="/review/:id" element={<Review />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
