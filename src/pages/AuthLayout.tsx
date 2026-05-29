import { Outlet, Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-[#FDFDFD] flex flex-col font-sans relative">
      {/* Subtle grid background */}
      <div 
        className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" 
        style={{
          backgroundImage: `linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}
      />
      
      <header className="py-4 px-6 md:px-12 flex items-center justify-between z-10 border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <Link to="/" className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-gray-900">INVOEX</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
          <Link to="/" className="hover:text-black">Features</Link>
          <Link to="/dashboard" className="hover:text-black">Dashboard</Link>
        </nav>
        <Link to="/login" className={buttonVariants({ variant: "default", className: "bg-blue-600 hover:bg-blue-700 text-white shadow-sm" })}>
          Start Free Trial
        </Link>
      </header>
      <main className="flex-1 flex flex-col z-10">
        <Outlet />
      </main>
    </div>
  );
}
