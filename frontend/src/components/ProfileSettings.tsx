"use client";

import { useState, useEffect } from "react";

interface ProfileSettingsProps {
  token: string;
  onClose: () => void;
  onUpdate: (user: any) => void;
}

export default function ProfileSettings({ token, onClose, onUpdate }: ProfileSettingsProps) {
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'smtp'>('profile');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  // Profile State
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    password: "",
  });

  // SMTP State
  const [smtp, setSmtp] = useState({
    senderName: "",
    smtpEmail: "",
    smtpPassword: "",
  });

  const [isPasswordLocked, setIsPasswordLocked] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/api/user/profile", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
         setProfile({ name: data.name || "", email: data.email || "", password: "" });
         setSmtp({ 
           senderName: data.senderName || "", 
           smtpEmail: data.smtpEmail || "", 
           smtpPassword: data.smtpPassword || "" 
         });
         // Lock if password exists
         if (data.smtpPassword) setIsPasswordLocked(true);
      }
    } catch (err) {
      console.error("Failed to fetch profile", err);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/user/profile", {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify(profile)
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ text: "Profile updated successfully", type: 'success' });
        onUpdate(data.user);
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSMTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/user/settings", {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify(smtp)
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ text: "Outreach settings updated. Refreshing system...", type: 'success' });
        if (data.user) onUpdate(data.user);
        // Force full reload to guarantee state synchronization as requested
        setTimeout(() => window.location.reload(), 1000);
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-background/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-[800px] h-full md:h-[600px] max-h-[90vh] md:max-h-none flex flex-col md:flex-row bg-surface border border-outline-variant/20 shadow-2xl animate-in zoom-in-95 duration-500 overflow-hidden rounded-sm">
        
        {/* Settings Sidebar / Top Nav on Mobile */}
        <div className="w-full md:w-64 bg-surface-container-low border-b md:border-b-0 md:border-r border-outline-variant/10 p-4 md:p-8 flex flex-col justify-between">
          <div>
            <div className="mb-6 md:mb-10 flex justify-between items-center md:block">
              <div>
                <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-0.5 md:mb-1">Account & Settings</p>
                <h2 className="text-xl md:text-2xl font-black tracking-tighter text-on-surface uppercase">PROFILE</h2>
              </div>
              <button onClick={onClose} className="md:hidden w-8 h-8 flex items-center justify-center text-slate-400">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0 scrollbar-hide">
              <button 
                onClick={() => setActiveSubTab('profile')}
                className={`flex-shrink-0 md:flex-1 text-left px-4 py-2 md:py-3 rounded-sm flex items-center gap-2 md:gap-3 transition-all ${activeSubTab === 'profile' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'hover:bg-surface-container-high text-slate-400'}`}
              >
                <span className="material-symbols-outlined text-[18px] md:text-[20px]">person</span>
                <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">Account Details</span>
              </button>
              <button 
                onClick={() => setActiveSubTab('smtp')}
                className={`flex-shrink-0 md:flex-1 text-left px-4 py-2 md:py-3 rounded-sm flex items-center gap-2 md:gap-3 transition-all ${activeSubTab === 'smtp' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'hover:bg-surface-container-high text-slate-400'}`}
              >
                <span className="material-symbols-outlined text-[18px] md:text-[20px]">mail</span>
                <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">Email Setup</span>
              </button>
            </nav>
          </div>

          <button onClick={onClose} className="hidden md:flex group items-center gap-2 text-slate-400 hover:text-on-surface transition-colors mt-auto">
            <span className="material-symbols-outlined text-lg group-hover:-translate-x-1 transition-transform">arrow_back</span>
            <span className="text-[10px] font-bold uppercase tracking-widest">Return</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 md:p-12 overflow-y-auto custom-scrollbar relative">
          
          {activeSubTab === 'profile' ? (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="mb-8">
                <h3 className="text-xl font-black tracking-tighter text-on-surface uppercase mb-2">Account Management</h3>
                <p className="text-xs text-slate-400 font-bold">Update your login credentials and personal identification.</p>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Team Name</label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className="w-full bg-surface-container-low border-b border-outline-variant/30 px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Login Email</label>
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="w-full bg-surface-container-low border-b border-outline-variant/30 px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">New Password (Optional)</label>
                  <input
                    type="password"
                    value={profile.password}
                    onChange={(e) => setProfile({ ...profile, password: e.target.value })}
                    placeholder="Leave blank to keep current"
                    className="w-full bg-surface-container-low border-b border-outline-variant/30 px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none transition-all"
                  />
                </div>

                <div className="pt-4">
                  <button
                    disabled={loading}
                    className="px-8 py-4 bg-on-surface text-surface text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary transition-all disabled:opacity-50"
                  >
                    {loading ? "SAVING..." : "UPDATE PROFILE"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
               <div className="mb-8">
                <h3 className="text-xl font-black tracking-tighter text-on-surface uppercase mb-2">Email Connection</h3>
                <p className="text-xs text-slate-400 font-bold">Configure your email settings. The 'Sender Name' will appear on all sent emails.</p>
              </div>

              <form onSubmit={handleUpdateSMTP} className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Your Sender Name</label>
                  <input
                    type="text"
                    value={smtp.senderName}
                    onChange={(e) => setSmtp({ ...smtp, senderName: e.target.value })}
                    placeholder="YOUR SENDER NAME"
                    className="w-full bg-surface-container-low border-b border-outline-variant/30 px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Outreach Email (Gmail)</label>
                  <input
                    type="email"
                    value={smtp.smtpEmail}
                    onChange={(e) => setSmtp({ ...smtp, smtpEmail: e.target.value })}
                    placeholder="YOUR EMAIL ADDRESS"
                    className="w-full bg-surface-container-low border-b border-outline-variant/30 px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none transition-all"
                  />
                </div>
                <div className="space-y-1.5 bg-surface-container-low/40 p-4 rounded-sm border border-outline-variant/10">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Google App Password (16 chars)</label>
                    <button 
                      type="button"
                      onClick={() => setIsPasswordLocked(!isPasswordLocked)}
                      className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-sm transition-all ${isPasswordLocked ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-warning/10 text-warning hover:bg-warning/20'}`}
                    >
                      {isPasswordLocked ? 'Unlock' : 'Lock'}
                    </button>
                  </div>
                  <div className="relative group/passwd">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={smtp.smtpPassword}
                      readOnly={isPasswordLocked}
                      onChange={(e) => setSmtp({ ...smtp, smtpPassword: e.target.value })}
                      placeholder="•••• •••• •••• ••••"
                      className={`w-full bg-surface-container-low/50 pl-4 pr-12 py-3 text-sm font-bold focus:outline-none transition-all border-b ${isPasswordLocked ? 'border-transparent text-slate-400 cursor-not-allowed' : 'border-primary text-on-surface'}`}
                    />
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowPassword(!showPassword);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-all z-20 w-8 h-8 flex items-center justify-center cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-lg pointer-events-none">
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-400 font-medium mt-3 italic">
                    Generate this in your Google Account &gt; Security &gt; App Passwords.
                  </p>
                </div>

                <div className="pt-4">
                  <button
                    disabled={loading}
                    className="px-8 py-4 bg-on-surface text-surface text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary transition-all disabled:opacity-50"
                  >
                    {loading ? "CONNECTING..." : "SAVE & CONNECT MAIL"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {message && (
             <div className={`absolute bottom-8 right-8 p-4 border-l-4 font-bold text-[10px] uppercase tracking-widest shadow-xl animate-in slide-in-from-bottom-4 duration-500 ${message.type === 'success' ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : 'bg-red-50 border-red-500 text-red-600'}`}>
               {message.text}
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
