'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import ThemeToggle from '@/components/ThemeToggle';
import { Bot, LogOut, User, Settings, Github, Activity, Home, Server } from 'lucide-react';

interface AppLayoutProps {
  children: React.ReactNode;
  pipelineCount?: number;
}

export default function AppLayout({ children, pipelineCount = 0 }: AppLayoutProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  const isActive = (path: string) => pathname === path;

  return (
    <div className="min-h-screen bg-background flex flex-col selection:bg-primary/20 selection:text-primary overflow-hidden">
      {/* Enhanced Modern Header with Navigation */}
      <header className="h-20 border-b border-cyan-500/20 bg-gradient-to-r from-card/98 via-card/95 to-card/98 backdrop-blur-2xl sticky top-0 z-50 px-6 shadow-2xl shadow-cyan-500/5 relative group">
        {/* Animated gradient border on hover */}
        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        {/* Subtle background pattern */}
        <div className="absolute inset-0 bg-dot-white/[0.02] pointer-events-none" />

        <div className="max-w-[1400px] mx-auto h-full flex items-center justify-between relative z-10">
          <div className="flex items-center gap-12">
            {/* Simple Logo */}
            <div className="flex items-center gap-3 cursor-pointer group/logo" onClick={() => router.push("/dashboard")}>
              <div className="relative w-10 h-10 rounded-xl  flex items-center justify-center shadow-md transition-all duration-300 group-hover/logo:scale-105 group-hover/logo:shadow-lg group-hover/logo:shadow-cyan-500/30">
                <Image
                  src="/logo.svg"
                  alt="NerveFlow CI/CD Platform Logo"
                  width={40}
                  height={40}
                  className="w-full h-full object-contain p-1.5"
                  priority
                />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-cyan-500 to-cyan-600 bg-clip-text text-transparent transition-all duration-300">
                  NerveFlow CI/CD
                </h1>
                <p className="text-[10px] text-muted-foreground font-medium">Powered by Claude 4.6 Sonnet AI</p>
              </div>
            </div>

            {/* Modern Nav with Pills Design */}
            <nav className="hidden lg:flex items-center gap-1.5 bg-muted/30 p-1.5 rounded-2xl border border-border/50 backdrop-blur-sm">
              <button
                onClick={() => router.push('/dashboard')}
                className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 flex items-center gap-2 relative ${
                  isActive('/dashboard')
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/40'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/80'
                }`}
              >
                <Home className={`w-4 h-4 ${isActive('/dashboard') ? 'animate-pulse' : ''}`} />
                <span>Dashboard</span>
                {isActive('/dashboard') && (
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl blur-xl opacity-30 -z-10" />
                )}
              </button>
              <button
                onClick={() => router.push('/repositories')}
                className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 flex items-center gap-2 relative ${
                  isActive('/repositories')
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/40'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/80'
                }`}
              >
                <Github className={`w-4 h-4 ${isActive('/repositories') ? 'animate-pulse' : ''}`} />
                <span>Repositories</span>
                {isActive('/repositories') && (
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl blur-xl opacity-30 -z-10" />
                )}
              </button>
              <button
                onClick={() => router.push('/pipelines')}
                className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 flex items-center gap-2 relative ${
                  isActive('/pipelines')
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/40'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/80'
                }`}
              >
                <Activity className={`w-4 h-4 ${isActive('/pipelines') ? 'animate-pulse' : ''}`} />
                <span>Pipelines</span>
                {pipelineCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                    {pipelineCount}
                  </span>
                )}
                {isActive('/pipelines') && (
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl blur-xl opacity-30 -z-10" />
                )}
              </button>
              <button
                onClick={() => router.push('/deployments')}
                className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 flex items-center gap-2 relative ${
                  isActive('/deployments')
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/40'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/80'
                }`}
              >
                <Server className={`w-4 h-4 ${isActive('/deployments') ? 'animate-pulse' : ''}`} />
                <span>Deployments</span>
                {isActive('/deployments') && (
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl blur-xl opacity-30 -z-10" />
                )}
              </button>
              {/* <button
                onClick={() => router.push('/chat')}
                className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 flex items-center gap-2 relative ${
                  isActive('/chat')
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/40'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/80'
                }`}
              >
                <Bot className={`w-4 h-4 ${isActive('/chat') ? 'animate-pulse' : ''}`} />
                <span>AI Chat</span>
                {isActive('/chat') && (
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl blur-xl opacity-30 -z-10" />
                )}
              </button> */}
            </nav>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-3">

            {/* Theme Toggle with Enhanced Style */}
            <div className="rounded-xl hover:bg-muted transition-colors border-border/50">
              <ThemeToggle />
            </div>

            {/* Enhanced User Menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-3 pl-2 pr-4 py-2 rounded-full bg-gradient-to-r from-muted/80 to-muted/60 hover:from-muted hover:to-muted/80 transition-all duration-300 shadow-sm hover:shadow-md border border-border/50 hover:border-cyan-500/30 group/user"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center ring-2 ring-cyan-500/20 group-hover/user:ring-cyan-500/40 transition-all">
                  <User className="w-4 h-4 text-white" />
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold leading-none">{session?.user?.name || "User"}</p>
                </div>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-3 w-64 rounded-2xl border border-border/50 bg-card/98 backdrop-blur-xl shadow-2xl shadow-cyan-500/5 z-[60] overflow-hidden animate-fade-in">
                  {/* User Info Header */}
                  <div className="p-4 bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-purple-500/10 border-b border-border/50">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center ring-2 ring-cyan-500/30">
                        <User className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{session?.user?.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{session?.user?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 text-[10px] font-bold rounded-full bg-green-500/20 text-green-500 border border-green-500/30">
                        {pipelineCount} Pipelines
                      </span>
                    </div>
                  </div>

                  {/* Menu Items */}
                  <div className="p-2">
                    <button
                      onClick={() => router.push("/settings")}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted text-sm font-medium transition-all group/item"
                    >
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center group-hover/item:bg-cyan-500/10 transition-colors">
                        <Settings className="w-4 h-4 text-muted-foreground group-hover/item:text-cyan-500" />
                      </div>
                      <span>Settings</span>
                    </button>
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-destructive/10 text-destructive text-sm font-medium transition-all group/item"
                    >
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center group-hover/item:bg-destructive/10 transition-colors">
                        <LogOut className="w-4 h-4" />
                      </div>
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto scrollbar-thin">
        {children}
      </main>

      {/* Simple Footer */}
      <footer className="h-10 border-t bg-card/95 backdrop-blur-xl flex items-center px-6 justify-between text-[11px] text-muted-foreground font-medium shrink-0 relative z-10">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Live</span>
          <span className="opacity-50">|</span>
          <span>NerveFlow Engine v1.0.4</span>
        </div>
        <div className="hidden sm:block">
          All data processed securely
        </div>
      </footer>
    </div>
  );
}
