import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { signOut } from 'firebase/auth';
import { auth } from '@/src/lib/firebase';
import { FileText, Upload, BarChart2, Brain } from 'lucide-react';
import { useAuth } from '@/src/lib/store';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, workspaceName, workspaceRole } = useAuth();
  const isAdmin = workspaceRole === 'owner' || workspaceRole === 'admin';
  
  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  const nav = [
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Export', path: '/export' },
  ];

  const adminNav = [
    { name: 'Analytics', path: '/analytics', icon: Brain },
  ];

  const userInitials = user?.email ? user.email.substring(0, 2).toUpperCase() : 'U';

  return (
    <div className="min-h-screen bg-[#FDFDFD] flex flex-col font-sans">
       <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6 md:px-12 sticky top-0 z-50">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-gray-900">INVOEX</span>
        </Link>
        
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {nav.map((item) => (
             <Link key={item.path} to={item.path}
               className={`${
                 location.pathname === item.path ? 'bg-blue-50 text-blue-700 px-3 py-1.5 rounded-md' : 'text-gray-500 hover:text-gray-900 px-3 py-1.5'
               }`}
             >
               {item.name}
             </Link>
          ))}
          {isAdmin && adminNav.map((item) => (
             <Link key={item.path} to={item.path}
               className={`flex items-center gap-1 ${
                 location.pathname === item.path ? 'bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-md' : 'text-gray-500 hover:text-gray-900 px-3 py-1.5'
               }`}
             >
               <item.icon className="w-3.5 h-3.5" />
               {item.name}
             </Link>
          ))}
        </nav>
        
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="hidden sm:flex text-gray-600 font-medium">
            <BarChart2 className="w-4 h-4 mr-2" />
            {workspaceName || 'Loading...'}
          </Button>
          
          <Link to="/upload">
             <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm">
               <Upload className="w-4 h-4 mr-2" />
               Upload
             </Button>
          </Link>
          
          <DropdownMenu>
            <DropdownMenuTrigger className="w-8 h-8 flex items-center justify-center bg-gray-900 text-white rounded-full text-xs font-bold text-center ml-2 border border-gray-900 focus:outline-none cursor-pointer">
                {userInitials}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5 text-sm text-gray-500 truncate">{user?.email}</div>
              <DropdownMenuItem onClick={() => navigate('/settings')}>Settings</DropdownMenuItem>
              {isAdmin && <DropdownMenuItem onClick={() => navigate('/analytics')} className="text-indigo-600 focus:bg-indigo-50">Analytics</DropdownMenuItem>}
              <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:bg-red-50">Logout</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6 md:p-12">
        <Outlet />
      </main>
    </div>
  );
}
