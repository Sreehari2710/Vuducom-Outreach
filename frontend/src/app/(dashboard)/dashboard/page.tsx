"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/config";

export default function DashboardPage() {
  const { token, user } = useAuth();
  const { showNotification } = useUI();
  const router = useRouter();

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [confirmDelete, setConfirmDelete] = useState<{id: string, type: 'campaign' | 'template'} | null>(null);
  const [dismissedWizard, setDismissedWizard] = useState(false);

  useEffect(() => {
    if (token) {
      fetchCampaigns();
      const interval = setInterval(fetchCampaigns, 15000);
      return () => clearInterval(interval);
    }
  }, [token]);

  const fetchCampaigns = () => {
    if (!token) return;
    fetch(`${API_BASE_URL}/api/campaigns`, {
      headers: { "Authorization": `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => setCampaigns(data))
      .catch(err => console.error("Fetch failed", err));
  };

  const handleDelete = async (id: string, type: 'campaign' | 'template') => {
    try {
      const url = `${API_BASE_URL}/api/${type === 'template' ? 'templates' : 'campaigns'}/${id}`;
      const res = await fetch(url, { 
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        showNotification(`${type === 'template' ? 'Template' : 'Campaign'} successfully removed.`, 'success');
        fetchCampaigns();
        setConfirmDelete(null);
      }
    } catch (err: any) {
      showNotification(`System Error: ${err.message}`, "error");
    }
  };

  const filteredCampaigns = campaigns.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (c.template?.name || "").toLowerCase().includes(searchQuery.toLowerCase());
    
    if (statusFilter === 'engaged') {
      const engagementCount = c.emails.filter((e: any) => e.status === 'REPLIED').length;
      return matchesSearch && engagementCount > 0;
    }
    
    return matchesSearch;
  });

  const sortedCampaigns = [...filteredCampaigns].sort((a, b) => {
    if (sortBy === 'engagement') {
      const engA = a.emails.length > 0 ? (a.emails.filter((e: any) => e.status === 'REPLIED').length / a.emails.length) : 0;
      const engB = b.emails.length > 0 ? (b.emails.filter((e: any) => e.status === 'REPLIED').length / b.emails.length) : 0;
      return engB - engA;
    }
    if (sortBy === 'volume') {
      return b.emails.length - a.emails.length;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const totalPages = Math.ceil(sortedCampaigns.length / (itemsPerPage || 1));
  const paginatedCampaigns = sortedCampaigns.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, itemsPerPage, statusFilter, sortBy]);

  const totalSentCount = campaigns.reduce((acc, c) => acc + (c.emails?.length || 0), 0);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-on-surface text-balance">Dashboard</h1>
          <p className="text-[10px] md:text-xs text-slate-400 font-medium mt-1">Welcome back to Vuducom MailMerge.</p>
        </div>
        {campaigns.length > 0 && (
          <button 
            onClick={() => router.push("/campaigns/new")}
            className="w-full md:w-auto bg-primary text-on-primary px-6 py-2.5 rounded-md font-bold text-[10px] uppercase tracking-widest flex items-center justify-center md:justify-start gap-2 hover:opacity-90 transition-opacity shadow-lg shadow-primary/10"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            New Campaign
          </button>
        )}
      </div>

      {campaigns.length === 0 && totalSentCount === 0 && !dismissedWizard && (
        <div className="vudu-card border-l-4 border-warning bg-warning/5 mb-10 overflow-hidden relative">
           <div className="relative z-10">
              <div className="flex items-center gap-4 mb-6">
                 <div className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg shadow-primary/20">
                    <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>security</span>
                 </div>
                 <div>
                    <h2 className="text-xl md:text-2xl font-black tracking-tight text-on-surface">Setup Your MailMerge Connection</h2>
                    <p className="text-[9px] md:text-xs text-slate-500 font-bold uppercase tracking-widest mt-0.5">Required for outreach initialization</p>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
                 <div className="space-y-3 bg-white/50 p-4 md:p-6 rounded-md border border-warning/10">
                    <div className="flex items-center gap-2 mb-2">
                       <span className="w-6 h-6 rounded-full bg-on-surface text-surface text-[10px] font-black flex items-center justify-center">01</span>
                       <span className="text-[10px] font-black uppercase tracking-widest text-on-surface">Enable 2FA</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">Go to your Google Security settings and ensure 2-Step Verification is active.</p>
                    <a href="https://myaccount.google.com/security" target="_blank" className="inline-flex items-center gap-2 text-[9px] font-black uppercase text-primary hover:underline tracking-tighter">
                       Open Google Security
                       <span className="material-symbols-outlined text-xs">open_in_new</span>
                    </a>
                 </div>

                 <div className="space-y-3 bg-white/50 p-4 md:p-6 rounded-md border border-warning/10">
                    <div className="flex items-center gap-2 mb-2">
                       <span className="w-6 h-6 rounded-full bg-on-surface text-surface text-[10px] font-black flex items-center justify-center">02</span>
                       <span className="text-[10px] font-black uppercase tracking-widest text-on-surface">Generate App Secret</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">Search for "App Passwords" in your Google Account. Choose 'Mail' and rename to 'MailMerge'.</p>
                    <a href="https://myaccount.google.com/apppasswords" target="_blank" className="inline-flex items-center gap-2 text-[9px] font-black uppercase text-primary hover:underline tracking-tighter">
                       Generate Password
                       <span className="material-symbols-outlined text-xs">key</span>
                    </a>
                 </div>

                 <div className="space-y-3 bg-white/50 p-4 md:p-6 rounded-md border border-warning/10">
                    <div className="flex items-center gap-2 mb-2">
                       <span className="w-6 h-6 rounded-full bg-on-surface text-surface text-[10px] font-black flex items-center justify-center">03</span>
                       <span className="text-[10px] font-black uppercase tracking-widest text-on-surface">Connect Account</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">Open your profile settings here and paste the 16-character code into the App Password field.</p>
                    <button 
                      onClick={() => {}} // This should ideally trigger the settings modal, but for now we'll just refer to profile
                      className="inline-flex items-center gap-2 text-[9px] font-black uppercase text-primary hover:underline tracking-tighter cursor-default"
                    >
                       Open Profile Settings
                       <span className="material-symbols-outlined text-xs">contact_page</span>
                    </button>
                 </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    setDismissedWizard(true);
                    router.push("/campaigns/new");
                  }}
                  className="w-full md:w-auto vudu-btn-primary px-8 py-3 text-[10px] tracking-[0.2em]"
                >
                  I'VE CONNECTED / START CAMPAIGN
                </button>
              </div>
           </div>
        </div>
      )}

      {/* Stats Ribbon */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-1 mb-8">
         <div className="col-span-1 md:col-span-4 bg-surface-container-lowest p-4 rounded-lg flex flex-col justify-between h-28 border border-outline-variant/10 shadow-sm">
           <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Active Campaigns</span>
           <div className="flex items-end justify-between">
             <span className="text-4xl font-black text-on-surface">{campaigns.length}</span>
           </div>
         </div>

         <div className="col-span-1 md:col-span-3 bg-surface-container-low p-4 rounded-lg flex flex-col justify-between h-28">
           <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Avg. Engagement</span>
           <span className="text-4xl font-black text-on-surface">
             {campaigns.length > 0 
               ? Math.round((campaigns.reduce((acc, c) => acc + (c.emails.filter((e: any) => e.status === 'REPLIED').length / (c.emails.length || 1)), 0) / campaigns.length) * 100) 
               : 0}%
           </span>
         </div>

         <div className="col-span-1 md:col-span-5 bg-primary text-on-primary p-4 rounded-lg flex flex-col justify-between h-28 relative overflow-hidden group shadow-lg shadow-primary/20">
           <div className="relative z-10">
             <span className="text-[11px] font-bold uppercase text-white/70 tracking-wider">Total Emails Sent</span>
             <div className="text-4xl font-black whitespace-nowrap">
               {campaigns.reduce((acc, c) => acc + (c.emails?.length || 0), 0).toLocaleString()}
             </div>
           </div>
           <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-8xl text-white/10 group-hover:scale-110 transition-transform duration-700" style={{ fontVariationSettings: "'FILL' 1" }}>public</span>
         </div>
      </div>

      <div className="mb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
         <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 uppercase tracking-tight">
            Recent Campaigns
            <span className="bg-surface-container-high text-on-surface-variant text-[10px] px-2 py-0.5 rounded font-black">{campaigns.length} TOTAL</span>
         </h2>
         <div className="flex flex-wrap gap-2 md:gap-4 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none flex items-center">
               <span className="material-symbols-outlined absolute left-3 text-sm text-slate-400">filter_list</span>
               <select 
                 value={statusFilter}
                 onChange={(e) => setStatusFilter(e.target.value)}
                 className="w-full appearance-none bg-surface-container-low border border-outline-variant/10 rounded-sm pl-10 pr-10 py-2 text-[10px] font-black uppercase tracking-widest focus:ring-1 focus:ring-primary/20 focus:outline-none cursor-pointer transition-all hover:bg-surface-container-high"
               >
                  <option value="all">Every Status</option>
                  <option value="engaged">Engaged Only</option>
               </select>
            </div>
            <div className="relative flex-1 md:flex-none flex items-center">
               <span className="material-symbols-outlined absolute left-3 text-sm text-slate-400">sort</span>
               <select 
                 value={sortBy}
                 onChange={(e) => setSortBy(e.target.value)}
                 className="w-full appearance-none bg-surface-container-low border border-outline-variant/10 rounded-sm pl-10 pr-10 py-2 text-[10px] font-black uppercase tracking-widest focus:ring-1 focus:ring-primary/20 focus:outline-none cursor-pointer transition-all hover:bg-surface-container-high"
               >
                  <option value="newest">Latest First</option>
                  <option value="engagement">Performance</option>
                  <option value="volume">Volume</option>
               </select>
            </div>
         </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-sm overflow-hidden flex flex-col">
        <table className="w-full text-left">
          <thead className="bg-surface-container-low border-b border-outline-variant/10 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
            <tr>
              <th className="px-6 py-4">Campaign Name</th>
              <th className="px-6 py-4 text-center">Saved Template</th>
              <th className="px-6 py-4 text-center">Volume Sent</th>
              <th className="px-6 py-4 text-center">Engagement Rate</th>
              <th className="px-6 py-4 text-right">Report</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/5">
            {paginatedCampaigns.map((c) => (
              <tr 
                key={c.id} 
                onClick={() => router.push(`/campaigns?id=${c.id}`)}
                className="group hover:bg-surface-container-low transition-colors cursor-pointer"
              >
                <td className="px-6 py-3 font-bold text-sm text-on-surface group-hover:text-primary transition-colors">{c.name}</td>
                <td className="px-6 py-3 text-center">
                  <span className="bg-surface-container-high text-on-surface-variant text-[9px] font-black px-2 py-0.5 rounded tracking-tighter uppercase whitespace-nowrap">
                    {c.template?.name || "Deleted"}
                  </span>
                </td>
                <td className="px-6 py-3 text-center text-sm font-black text-on-surface">{c.emails.length}</td>
                <td className="px-6 py-3 text-center">
                  <span className={`text-[10px] font-black uppercase tracking-wider ${
                      c.emails.filter((e: any) => e.status === 'REPLIED').length > 0 ? 'text-tertiary' : 'text-slate-400'
                  }`}>
                    {c.emails.length > 0 ? Math.round((c.emails.filter((e: any) => e.status === 'REPLIED').length / c.emails.length) * 100) : 0}% Engagement
                  </span>
                </td>
                <td className="px-6 py-3 text-right">
                  <div className="flex justify-end gap-3 items-center">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: c.id, type: 'campaign' }); }}
                      className="p-1.5 text-slate-300 hover:text-error transition-colors font-bold"
                    >
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                    <a 
                      href={`${API_BASE_URL}/api/campaigns/${c.id}/export?token=${token}`}
                      onClick={(e) => e.stopPropagation()}
                      className="w-8 h-8 flex items-center justify-center bg-on-surface text-surface rounded-sm hover:opacity-90 transition-all font-bold"
                    >
                      <span className="material-symbols-outlined text-sm">download</span>
                    </a>
                  </div>
                </td>
              </tr>
            ))}
            {sortedCampaigns.length === 0 && (
              <tr>
                <td colSpan={5} className="py-24 text-center">
                    <p className="font-black text-[10px] uppercase tracking-widest mb-6 text-on-surface">No Data Found</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        
        {sortedCampaigns.length > 0 && (
          <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant/10 flex items-center justify-between">
             <div className="flex items-center gap-2">
                <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="w-8 h-8 flex items-center justify-center rounded-sm bg-surface-container-lowest border border-outline-variant/10 text-slate-400 disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-lg">chevron_left</span>
                </button>
                <button 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="w-8 h-8 flex items-center justify-center rounded-sm bg-surface-container-lowest border border-outline-variant/10 text-slate-400 disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-lg">chevron_right</span>
                </button>
             </div>
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
           <div className="vudu-card text-center max-w-sm w-full shadow-2xl border border-outline-variant/20">
              <div className="bg-error-container w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 text-error text-2xl">
                <span className="material-symbols-outlined text-3xl">delete</span>
              </div>
              <h3 className="text-xl font-black mb-2 uppercase tracking-tight text-on-surface">Confirm Deletion</h3>
              <p className="text-on-surface-variant text-sm font-medium mb-10 leading-relaxed px-4">
                This action is permanent and cannot be reversed. Are you sure?
              </p>
              <div className="flex gap-4">
                <button onClick={() => setConfirmDelete(null)} className="flex-1 py-4 text-slate-500 font-bold">Cancel</button>
                <button onClick={() => handleDelete(confirmDelete.id, confirmDelete.type)} className="flex-1 py-4 bg-error text-on-error font-black uppercase tracking-widest text-[10px]">Yes, Delete</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
