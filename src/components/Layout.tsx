import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Scissors, 
  Settings, 
  Sparkles,
  FileCode,
  DollarSign,
  BarChart3,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard, description: 'Overview and statistics' },
    { path: '/tailorings', label: 'Tailorings', icon: Scissors, description: 'Workload optimizations' },
    { path: '/fitprofiles', label: 'Fit Profiles', icon: Sparkles, description: 'Optimization strategies' },
    { path: '/analytics', label: 'Analytics', icon: BarChart3, description: 'Real-time resource metrics' },
    { path: '/costs', label: 'Cost Analysis', icon: DollarSign, description: 'OpenCost cost visibility' },
    { path: '/generator', label: 'YAML Generator', icon: FileCode, description: 'Generate FitProfile & Tailoring YAML' },
    { path: '/atelier', label: 'Atelier', icon: Settings, description: 'Global configuration' },
  ];

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-72 border-r border-border bg-card shadow-xl z-50">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-start h-20 px-6 border-b border-border bg-card">
            <div className="flex items-center">
              <img 
                src="/sartor-logo.png" 
                alt="Sartor" 
                className="h-12 w-auto drop-shadow-md"
              />
              <div className="ml-3">
                <span className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
                  Sartor
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">Resource Optimizer</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`group flex items-start px-4 py-3 rounded-xl transition-all duration-200 ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-lg'
                      : 'text-foreground hover:bg-accent'
                  }`}
                >
                  <Icon className={`w-5 h-5 mt-0.5 mr-3 flex-shrink-0 ${active ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground'}`} />
                  <div className="flex-1 min-w-0">
                    <span className={`font-semibold block ${active ? 'text-primary-foreground' : 'text-foreground'}`}>
                      {item.label}
                    </span>
                    <span className={`text-xs mt-0.5 block ${active ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                      {item.description}
                    </span>
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border bg-card flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Sartor v0.1.0
            </p>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-72">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
