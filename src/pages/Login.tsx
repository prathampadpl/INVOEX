import { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '@/src/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/src/lib/store';

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { setWorkspaceInfo } = useAuth();

  const handleResetPassword = async () => {
    if (!email) {
      toast.error('Please enter your email address first');
      return;
    }
    try {
      setLoading(true);
      await sendPasswordResetEmail(auth, email);
      toast.success('Password reset email sent! Check your inbox.');
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to send reset email: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: import('react').FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter both email and password');
      return;
    }

    try {
      setLoading(true);
      let user;
      
      if (isSignUp) {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        user = result.user;
        toast.success('Account created successfully');
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        user = result.user;
      }
      
      if (!isSignUp) toast.success('Logged in successfully');
      navigate('/dashboard');
    } catch (e: any) {
      console.error("Auth error:", e);
      let errorMessage = 'Authentication failed. Please try again.';
      switch (e.code) {
        case 'auth/invalid-credential':
        case 'auth/invalid-login-credentials':
          errorMessage = 'Invalid email or password.';
          break;
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email.';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Incorrect password.';
          break;
        case 'auth/email-already-in-use':
          errorMessage = 'An account already exists with this email address.';
          break;
        case 'auth/weak-password':
          errorMessage = 'Password must be at least 6 characters long.';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Network error. Please check your internet connection.';
          break;
        default:
          if (e.message) errorMessage = e.message;
      }
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm border bg-white shadow-sm p-8 rounded-xl space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight">{isSignUp ? 'Create an Account' : 'Welcome back'}</h2>
          <p className="text-neutral-500 text-sm mt-2">{isSignUp ? 'Sign up to get started' : 'Sign in to manage your invoices'}</p>
        </div>
        
        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
              placeholder="••••••••"
              required
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Sign In')}
          </Button>
          {!isSignUp && (
            <button 
              type="button" 
              onClick={handleResetPassword}
              className="text-primary text-sm font-medium hover:underline w-full text-center mt-2"
            >
              Forgot Password?
            </button>
          )}
        </form>

        <div className="text-center text-sm">
          <span className="text-neutral-500">
            {isSignUp ? 'Already have an account?' : 'Don\'t have an account?'}
          </span>{' '}
          <button 
            type="button" 
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-primary font-medium hover:underline"
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </div>
      </div>
    </div>
  );
}
