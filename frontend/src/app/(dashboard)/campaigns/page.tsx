"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import { useRouter, useSearchParams } from "next/navigation";
import { API_BASE_URL } from "@/config";

function CampaignDetailsContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { token } = useAuth();
  const { showNotification } = useUI();
  const router = useRouter();

  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [isStopping, setIsStopping] = useState(false);

  useEffect(() => {
    if (token && id) {
      fetchCampaign();
      const interval = setInterval(fetchCampaign, 5000);
      return () => clearInterval(interval);
    }
  }, [token, id]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, itemsPerPage]);

  const fetchCampaign = () => {
    fetch(`${API_BASE_URL}/api/campaigns/${id}`, {
      headers: { "Authorization": `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data && !data.error) setSelectedCampaign(data);
      })
      .catch(err => console.warn("Polling paused"));
  };

  const syncReplies = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    showNotification("Refreshing data pipeline...", "info");
    
    fetch(`${API_BASE_URL}/api/sync-replies`, { 
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ campaignId: id })
    })
    .then(res => res.json())
    .then(data => {
      showNotification(data.message || "Sync complete", "success");
      fetchCampaign();
    })
    .catch(err => showNotification("Sync failed", "error"))
    .finally(() => setIsRefreshing(false));
  };

  const stopCampaign = () => {
    if (isStopping || !window.confirm("Are you sure you want to stop this campaign? All queued emails will be cancelled.")) return;
    setIsStopping(true);
    showNotification("Stopping campaign...", "info");
    
    fetch(`${API_BASE_URL}/api/campaigns/${id}/stop`, { 
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    })
    .then(res => res.json())
    .then(data => {
      showNotification(data.message || "Campaign stopped", "success");
      fetchCampaign();
    })
    .catch(err => showNotification("Failed to stop campaign", "error"))
    .finally(() => setIsStopping(false));
  };

  const downloadFilteredCSV = () => {
    if (!selectedCampaign) return;

    // Filter contacts based on current statusFilter and searchQuery
    const filteredContacts = selectedCampaign.contacts.filter((contact: any) => {
      const emailLog = selectedCampaign.emails.find((e: any) => e.recipient === contact.email);
      const matchesSearch = contact.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           (contact.username || "").toLowerCase().includes(searchQuery.toLowerCase());
      if (statusFilter !== "all") {
        const actualStatus = emailLog?.status || 'PENDING';
        if (actualStatus !== statusFilter) return false;
      }
      return matchesSearch;
    });

    if (filteredContacts.length === 0) {
      showNotification("No data to download for the selected filter.", "warning");
      return;
    }

    const header = "Email,Username,Status,Latest Reply\n";
    const rows = filteredContacts.map((contact: any) => {
      const emailLog = selectedCampaign.emails.find((e: any) => e.recipient === contact.email);
      let latestReply = '';
      if (emailLog?.replies?.length > 0) {
        latestReply = emailLog.replies.sort((a: any, b: any) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0].body;
        // Escape quotes for CSV
        latestReply = latestReply.replace(/"/g, '""');
      }
      return `"${contact.email}","${contact.username || ''}","${emailLog?.status || 'PENDING'}","${latestReply}"`;
    }).join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${selectedCampaign.name}_${statusFilter}_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!id) {
    router.push("/dashboard");
    return null;
  }

  if (!selectedCampaign) return (
     <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading Campaign Analytics...</p>
     </div>
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 md:mb-8 gap-4">
        <div className="flex items-center gap-4 md:gap-6">
          <button 
            onClick={() => router.push("/dashboard")}
            className="w-10 h-10 flex items-center justify-center rounded-md bg-surface-container-low text-slate-400 hover:text-primary transition-all border border-outline-variant/10 flex-shrink-0"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-on-surface truncate max-w-[200px] md:max-w-none">{selectedCampaign.name}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:gap-4 w-full md:w-auto">
          {selectedCampaign?.emails?.some((e: any) => e.status === 'QUEUED' || e.status === 'SENDING') && (
            <button 
              onClick={stopCampaign}
              disabled={isStopping}
              className={`flex-1 md:flex-none px-5 py-2.5 md:py-2 rounded-md font-black text-[10px] flex items-center justify-center gap-2 transition-all border uppercase tracking-widest ${
                isStopping 
                  ? 'bg-surface-container-high border-outline-variant/10 text-slate-300 cursor-not-allowed' 
                  : 'bg-error/10 border-error text-error hover:bg-error hover:text-on-error'
              }`}
            >
              <span className={`material-symbols-outlined text-[16px] ${isStopping ? 'animate-spin' : ''}`}>
                {isStopping ? 'sync' : 'stop_circle'}
              </span>
              {isStopping ? 'Stopping...' : 'Stop Campaign'}
            </button>
          )}
          <div className="relative flex-1 md:flex-none flex items-center">
            <span className="material-symbols-outlined absolute left-3 text-[16px] text-slate-400">filter_list</span>
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full appearance-none bg-surface-container-low border border-outline-variant/10 rounded-md pl-10 pr-10 py-2.5 md:py-2 text-[10px] font-black uppercase tracking-widest focus:ring-1 focus:ring-primary/20 focus:outline-none cursor-pointer transition-all hover:text-primary text-slate-500"
            >
              <option value="all">All Statuses</option>
              <option value="REPLIED">Replied</option>
              <option value="SENT">Sent</option>
              <option value="QUEUED">Queued</option>
              <option value="SENDING">Sending</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <button 
            onClick={syncReplies}
            disabled={isRefreshing}
            className={`flex-1 md:flex-none px-5 py-2.5 md:py-2 rounded-md font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-sm border border-outline-variant/10 ${
              isRefreshing ? 'bg-surface-container-high text-slate-300' : 'bg-surface-container-low text-slate-600 hover:bg-surface-container-high'
            }`}
          >
            <span className={`material-symbols-outlined text-sm ${isRefreshing ? 'animate-spin' : ''}`}>sync</span>
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button 
            onClick={downloadFilteredCSV}
            className={`flex-1 md:flex-none px-5 py-2.5 md:py-2 rounded-md font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-sm border border-outline-variant/10 bg-surface-container-low text-slate-600 hover:bg-surface-container-high hover:text-primary`}
          >
            <span className="material-symbols-outlined text-sm">download</span>
            Download
          </button>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-sm overflow-x-auto scrollbar-hide">
         <table className="w-full text-left">
            <thead className="bg-surface-container-low border-b border-outline-variant/10">
              <tr>
                 <th className="px-6 py-4 font-black text-[9px] uppercase tracking-widest text-slate-500 w-16">#</th>
                 <th className="px-6 py-4 font-black text-[9px] uppercase tracking-widest text-slate-500">Contact Details</th>
                 <th className="px-6 py-4 font-black text-[9px] uppercase tracking-widest text-slate-500 text-center">Status</th>
                 <th className="px-6 py-4 font-black text-[9px] uppercase tracking-widest text-slate-500">Latest Interaction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
               {(() => {
                const filteredContacts = selectedCampaign.contacts.filter((contact: any) => {
                  const emailLog = selectedCampaign.emails.find((e: any) => e.recipient === contact.email);
                  const matchesSearch = contact.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                       (contact.username || "").toLowerCase().includes(searchQuery.toLowerCase());
                  if (statusFilter !== "all") {
                    const actualStatus = emailLog?.status || 'PENDING';
                    if (actualStatus !== statusFilter) return false;
                  }
                  return matchesSearch;
                });

                const totalPages = Math.ceil(filteredContacts.length / itemsPerPage);
                const startIndex = (currentPage - 1) * itemsPerPage;
                const paginatedContacts = filteredContacts.slice(startIndex, startIndex + itemsPerPage);

                return (
                  <>
                    {paginatedContacts.map((contact: any, idx: number) => {
                      const emailLog = selectedCampaign.emails.find((e: any) => e.recipient === contact.email);
                      return (
                        <tr key={contact.id} className="hover:bg-surface-container-low transition-colors duration-200">
                          <td className="px-6 py-5 font-black text-xs text-slate-300 tracking-tighter">{String(startIndex + idx + 1).padStart(2, '0')}</td>
                          <td className="px-6 py-5">
                            <div className="font-bold text-sm text-on-surface mb-0.5">{contact.email}</div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{contact.username || 'n/a'}</div>
                          </td>
                          <td className="px-6 py-5 text-center">
                            <span className={`px-2 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-widest border border-current transition-all ${
                              emailLog?.status === 'REPLIED' ? 'bg-tertiary-container/10 text-tertiary' : 
                              emailLog?.status === 'SENDING' ? 'bg-primary/5 text-primary animate-pulse' :
                              emailLog?.status === 'SENT' ? 'bg-slate-50 text-slate-400 border-slate-100' :
                              emailLog?.status === 'CANCELLED' ? 'bg-slate-800 text-slate-500 border-slate-700 opacity-70' :
                              'bg-error-container/10 text-error'
                            }`}>
                              {emailLog?.status || 'PENDING'}
                            </span>
                          </td>
                          <td className="px-6 py-5 max-w-md">
                            <div className="text-xs font-medium text-on-surface-variant italic leading-relaxed line-clamp-1">
                               {emailLog?.replies?.length > 0 
                                 ? `"${emailLog.replies.sort((a: any, b: any) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0].body}"` 
                                 : '---'
                               }
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredContacts.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-20 text-center">
                           <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">No matching contacts found</p>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })()}
            </tbody>
         </table>
      </div>

      {(() => {
        const filteredContactsCount = selectedCampaign.contacts.filter((contact: any) => {
          const emailLog = selectedCampaign.emails.find((e: any) => e.recipient === contact.email);
          const matchesSearch = contact.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
                               (contact.username || "").toLowerCase().includes(searchQuery.toLowerCase());
          if (statusFilter !== "all") {
            const actualStatus = emailLog?.status || 'PENDING';
            if (actualStatus !== statusFilter) return false;
          }
          return matchesSearch;
        }).length;

        const totalPages = Math.ceil(filteredContactsCount / itemsPerPage);

        if (totalPages <= 1) return null;

        return (
          <div className="mt-8 flex flex-col md:flex-row items-center justify-between pb-10 gap-4">
            <div className="flex items-center gap-8">
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">
                Page {currentPage} of {totalPages}
              </div>
              
              <div className="hidden md:flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Show:</span>
                <div className="relative flex items-center">
                  <select 
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                    className="appearance-none bg-surface-container-low border border-outline-variant/10 rounded-sm pl-3 pr-8 py-1.5 text-[9px] font-black uppercase tracking-widest focus:ring-1 focus:ring-primary/20 focus:outline-none cursor-pointer transition-all hover:bg-surface-container-high"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-1.5 text-[14px] text-slate-400 pointer-events-none">expand_more</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => {
                  setCurrentPage(prev => Math.max(1, prev - 1));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="w-10 h-10 flex items-center justify-center rounded-md bg-surface-container-low text-slate-400 hover:text-primary transition-all border border-outline-variant/10 disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => {
                  setCurrentPage(prev => Math.min(totalPages, prev + 1));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="w-10 h-10 flex items-center justify-center rounded-md bg-surface-container-low text-slate-400 hover:text-primary transition-all border border-outline-variant/10 disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default function CampaignDetailsPage() {
  return (
    <Suspense fallback={null}>
      <CampaignDetailsContent />
    </Suspense>
  );
}
