"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import ProfileSettings from "@/components/ProfileSettings";
import { API_BASE_URL } from "@/config";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { token, user, authLoading, logout, updateUser } = useAuth();
  const { 
    notification, 
    activities, 
    isActivitiesOpen, 
    setIsActivitiesOpen, 
    clearAllActivities, 
    clearActivity, 
    markActivityRead 
  } = useUI();
  
  const router = useRouter();
  const pathname = usePathname();
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!authLoading && !token) {
      router.push("/login");
    }
  }, [token, authLoading, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary animate-pulse">Initializing Security...</p>
        </div>
      </div>
    );
  }

  if (!token) return null;

  const getPageTitle = () => {
    if (pathname.startsWith("/dashboard")) return "Dashboard";
    if (pathname.startsWith("/templates")) return "Templates";
    if (pathname.startsWith("/campaigns/new")) return "New Campaign";
    if (pathname.startsWith("/campaigns/")) return "Campaign Details";
    return "Outreach CRM";
  };

  return (
    <div className="min-h-screen bg-background text-on-background font-sans selection:bg-primary/20 selection:text-primary overflow-x-hidden">
      
      {/* Mobile Hamburger Toggle */}
      <div className="md:hidden fixed top-0 left-0 z-[60] w-full h-12 bg-white/90 backdrop-blur-md border-b border-outline-variant/10 flex items-center px-4 justify-between">
           <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="w-10 h-10 flex items-center justify-center text-primary"
              >
                <span className="material-symbols-outlined">{isMobileMenuOpen ? 'close' : 'menu'}</span>
              </button>
              <span className="font-black tracking-tighter text-lg text-primary">VUDUCOM</span>
           </div>
           <div className="flex items-center gap-3">
              <button onClick={() => setIsActivitiesOpen(!isActivitiesOpen)} className="w-8 h-8 flex items-center justify-center text-slate-500">
                <span className="material-symbols-outlined">notifications</span>
              </button>
              <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[18px]">person</span>
              </button>
           </div>
      </div>

      {/* Sidebar */}
      <aside 
        className={`fixed left-0 top-0 h-full z-50 flex flex-col border-r border-outline-variant/10 bg-white font-inter text-[13px] tracking-tight transition-all duration-500 ease-in-out 
          ${isMobileMenuOpen ? 'w-[280px] translate-x-0 shadow-2xl' : 'w-64 -translate-x-full md:translate-x-0'}
        `}
      >
        <div className="flex flex-col items-center pt-12 md:pt-8 pb-4 gap-8 h-full relative bg-white">
          <div className="hidden md:flex flex-col items-center gap-1 w-full px-4 overflow-hidden mb-4">
             <Link href="/dashboard" className="font-black tracking-tighter text-primary text-2xl transition-all duration-500">
               VUDUCOM
             </Link>
          </div>

          <nav className="flex flex-col w-full" onClick={() => setIsMobileMenuOpen(false)}>
            <Link 
              href="/dashboard"
              className={`flex items-center py-4 px-6 gap-4 transition-all active:scale-95 ${pathname === '/dashboard' ? 'text-primary border-l-4 border-primary bg-white' : 'text-slate-500 hover:bg-slate-50 hover:text-primary'}`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: pathname === '/dashboard' ? "'FILL' 1" : "" }}>grid_view</span>
              <span className="text-[11px] font-black uppercase tracking-widest whitespace-nowrap">Dashboard</span>
            </Link>

            <Link 
              href="/templates"
              className={`flex items-center py-4 px-6 gap-4 transition-all active:scale-95 ${pathname === '/templates' ? 'text-primary border-l-4 border-primary bg-white' : 'text-slate-500 hover:bg-slate-50 hover:text-primary'}`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: pathname === '/templates' ? "'FILL' 1" : "" }}>description</span>
              <span className="text-[11px] font-black uppercase tracking-widest whitespace-nowrap">Templates</span>
            </Link>

            <Link 
              href="/dashboard?tab=campaigns"
              className={`flex items-center py-4 px-6 gap-4 transition-all active:scale-95 ${pathname.startsWith('/campaigns') ? 'text-primary border-l-4 border-primary bg-white' : 'text-slate-500 hover:bg-slate-50 hover:text-primary'}`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: pathname.startsWith('/campaigns') ? "'FILL' 1" : "" }}>campaign</span>
              <span className="text-[11px] font-black uppercase tracking-widest whitespace-nowrap">Campaigns</span>
            </Link>
          </nav>
        </div>
      </aside>

      {/* Desktop Header */}
      <header className="hidden md:flex justify-between items-center fixed top-0 z-30 h-12 bg-white/80 backdrop-blur-xl border-b border-outline-variant/10 font-inter text-sm font-medium transition-all duration-500 pr-6 pl-72 w-full">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-primary font-bold cursor-pointer hover:opacity-80">Dashboard</Link>
          <span className="text-slate-300 font-normal">/</span>
          <span className="text-on-surface truncate max-w-[240px]">{getPageTitle()}</span>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 text-slate-600">
            <div className="relative">
              <button 
                onClick={() => setIsActivitiesOpen(!isActivitiesOpen)}
                className={`relative flex items-center justify-center w-8 h-8 rounded-md transition-all ${isActivitiesOpen ? 'bg-surface-container-high text-primary' : 'hover:text-primary text-slate-500'}`}
              >
                <span className="material-symbols-outlined text-[23px]">notifications</span>
                {activities.some(a => !a.isRead) && (
                  <span className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 bg-error text-[10px] font-black text-white flex items-center justify-center rounded-full animate-in zoom-in duration-300 ring-2 ring-white shadow-lg shadow-error/20">
                    <span className="absolute inset-0 rounded-full bg-error animate-ping opacity-25"></span>
                    <span className="relative">{activities.filter(a => !a.isRead).length}</span>
                  </span>
                )}
              </button>

              {isActivitiesOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsActivitiesOpen(false)}></div>
                  <div className="absolute right-0 top-10 w-80 bg-white border border-outline-variant/20 rounded-sm shadow-2xl z-50 animate-in slide-in-from-top-2 duration-300 overflow-hidden text-left">
                    <div className="px-4 py-3 border-b border-outline-variant/10 bg-slate-50 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Activity Feed</span>
                      {activities.length > 0 && (
                        <button 
                          onClick={clearAllActivities}
                          className="text-[9px] font-black uppercase text-primary hover:underline"
                        >
                          Clear All
                        </button>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {activities.length === 0 ? (
                        <div className="px-10 py-12 text-center">
                          <span className="material-symbols-outlined text-slate-200 text-4xl mb-2">notifications_off</span>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">No new activity</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-outline-variant/5">
                          {activities.map((a) => (
                            <div 
                              key={a.id} 
                              className={`p-4 hover:bg-slate-50 transition-colors flex gap-3 group relative cursor-pointer ${!a.isRead ? 'bg-primary/[0.02]' : ''}`}
                              onClick={() => {
                                markActivityRead(a.id, a.campaignId);
                                if (a.campaignId) router.push(`/campaigns?id=${a.campaignId}`);
                                setIsActivitiesOpen(false);
                              }}
                            >
                              <div className={`p-1.5 rounded-sm h-fit ${
                                a.type === 'REPLY' ? 'bg-tertiary/10 text-tertiary' : 
                                a.type === 'SUCCESS' ? 'bg-emerald-50 text-emerald-500' : 
                                a.type === 'ERROR' ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'
                              }`}>
                                <span className="material-symbols-outlined text-sm">
                                  {a.type === 'REPLY' ? 'chat' : a.type === 'SUCCESS' ? 'check_circle' : a.type === 'ERROR' ? 'warning' : 'info'}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0 pr-4">
                                <p className="text-[11px] font-black text-on-surface mb-0.5 leading-tight">{a.title}</p>
                                <p className="text-[10px] font-medium text-slate-500 leading-normal line-clamp-2">{a.message}</p>
                                <p className="text-[8px] font-bold text-slate-300 uppercase mt-2">{new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); clearActivity(a.id); }}
                                className="absolute top-4 right-4 text-slate-200 hover:text-error opacity-0 group-hover:opacity-100 transition-all font-bold"
                              >
                                <span className="material-symbols-outlined text-sm">close</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="relative">
              <button 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary transition-all hover:bg-primary/20 active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px] font-bold">person</span>
              </button>
              
              {isProfileOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsProfileOpen(false)}></div>
                  <div className="absolute top-11 right-0 w-48 bg-white border border-outline-variant/10 rounded-sm shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-1 space-y-0.5">
                      <button 
                        onClick={() => { setShowSettings(true); setIsProfileOpen(false); }}
                        className="w-full text-left px-4 py-3 hover:bg-surface-container-low rounded-sm flex items-center gap-3 transition-colors group"
                      >
                        <span className="material-symbols-outlined text-base text-slate-400 group-hover:text-primary">contact_page</span>
                        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface">View Profile</span>
                      </button>
                      <div className="h-px bg-outline-variant/10 mx-2"></div>
                      <button 
                        onClick={logout}
                        className="w-full text-left px-4 py-3 hover:bg-error/5 rounded-sm flex items-center gap-3 transition-colors group"
                      >
                        <span className="material-symbols-outlined text-base text-slate-400 group-hover:text-error">logout</span>
                        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-error">Sign Out</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="transition-all duration-500 pt-12 min-h-screen md:pl-64 pl-0">
        <div className="p-4 sm:p-10 max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Notifications */}
      {notification && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-10 duration-500 w-full max-w-sm px-4">
           <div className={`vudu-card flex items-center gap-4 py-4 px-8 border-t-4 shadow-2xl backdrop-blur-md ${
             notification.type === 'success' ? 'border-emerald-500' : 
             notification.type === 'error' ? 'border-red-500' : 'border-primary'
           }`}>
             <div className={`p-2 rounded-full ${
               notification.type === 'success' ? 'bg-emerald-50 text-emerald-500' : 
               notification.type === 'error' ? 'bg-red-50 text-red-500' : 'bg-surface-container-high text-primary'
             }`}>
               <span className="material-symbols-outlined text-lg">{notification.type === 'success' ? 'check' : notification.type === 'error' ? 'close' : 'info'}</span>
             </div>
             <p className="font-bold text-sm tracking-tight">{notification.message}</p>
           </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && token && (
        <ProfileSettings 
          token={token} 
          onClose={() => setShowSettings(false)} 
          onUpdate={updateUser} 
        />
      )}
    </div>
  );
}
