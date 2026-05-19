import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { auth, db } from '@/src/lib/firebase';
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
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Fetch user doc to get orgId
        try {
          const uDoc = await getDoc(doc(db, 'users', u.uid));
          if (uDoc.exists()) {
            const data = uDoc.data();
            if (data.lastOrgId) {
              try {
                const [memberDoc, orgDoc] = await Promise.all([
                  getDoc(doc(db, `organizations/${data.lastOrgId}/members`, u.uid)),
                  getDoc(doc(db, 'organizations', data.lastOrgId))
                ]);
                if (memberDoc.exists() && orgDoc.exists()) {
                  const role = memberDoc.data()?.role;
                  const validRole = ['owner', 'admin', 'member'].includes(role) ? role : 'member';
                  setOrgInfo(data.lastOrgId, validRole, orgDoc.data()?.name);
                } else {
                  console.error('User is no longer a member of this organization');
                  setOrgInfo(null, null);
                }
              } catch (memberErr) {
                console.error('Failed to fetch member doc or auto-fix', memberErr);
                setOrgInfo(null, null);
              }
            }
          }
        } catch (e) {
          console.error('Failed to fetch user org', e);
        }
      } else {
        setOrgInfo(null, null);
      }
      setLoaded(true);
    });
    return unsub;
  }, []);

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
