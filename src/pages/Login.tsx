import { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth, db } from '@/src/lib/firebase';
import { doc, getDoc, writeBatch, collection, query, where, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setLoading(true);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const idToken = await user.getIdToken();
      
      const response = await fetch('/api/auth/onboarding', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to complete onboarding');
      }
      
      const data = await response.json();
      console.log("[LOGIN] Onboarding complete, org:", data.orgId);
      
      toast.success('Logged in successfully');
      navigate('/dashboard');
    } catch (e: any) {
      console.error("Login error:", e);
      let errorMessage = 'Login failed. Please try again.';
      switch (e.code) {
        case 'auth/invalid-credential':
        case 'auth/invalid-login-credentials':
          errorMessage = 'Invalid credentials. Please check your account details.';
          break;
        case 'auth/user-disabled':
          errorMessage = 'This account has been locked or disabled. Please contact support.';
          break;
        case 'auth/user-not-found':
          errorMessage = 'No account found with these credentials.';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Incorrect password.';
          break;
        case 'auth/popup-closed-by-user':
          errorMessage = 'Sign-in popup was closed before completing.';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Network error. Please check your internet connection.';
          break;
        case 'auth/account-exists-with-different-credential':
          errorMessage = 'An account already exists with the same email. Please sign in using the provider associated with this email address.';
          break;
        default:
          if (e.message) {
            errorMessage = e.message;
          }
      }
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm border bg-white shadow-sm p-8 rounded-xl text-center space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
          <p className="text-neutral-500 text-sm mt-2">Sign in to manage your invoices</p>
        </div>
        <Button onClick={handleLogin} disabled={loading} className="w-full">
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </Button>
      </div>
    </div>
  );
}
