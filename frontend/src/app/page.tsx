"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Templates from "../components/Templates";
import CampaignWizard from "../components/CampaignWizard";
import AuthCard from "../components/AuthCard";
import ProfileSettings from "../components/ProfileSettings";
import { API_BASE_URL } from "../config";

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Sync state with URL
  const activeTab = searchParams.get("tab") || "dashboard";
  const viewingCampaignId = searchParams.get("id");
  const isCreating = searchParams.get("new") === "true";

  // Core Application States
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'info' | 'error'} | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{id: string, type: 'campaign' | 'template'} | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  
  // Data Management States
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [statusFilter, setStatusFilter] = useState("all"); // all, engaged
  const [sortBy, setSortBy] = useState("newest"); // newest, engagement, volume
  const [activities, setActivities] = useState<any[]>([]);
  const [isActivitiesOpen, setIsActivitiesOpen] = useState(false);
  const [showRepliedOnly, setShowRepliedOnly] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dismissedWizard, setDismissedWizard] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Auth Integration
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const setTab = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    params.delete("id");
    params.delete("new");
    router.push(`?${params.toString()}`);
  };

  const setViewCampaign = (id: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) {
       params.set("id", id);
       params.delete("new");
    } else {
       params.delete("id");
    }
    router.push(`?${params.toString()}`);
  };

  const setIsCreating = (val: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    if (val) {
      params.set("new", "true");
      params.delete("id");
    } else {
      params.delete("new");
    }
    router.push(`?${params.toString()}`);
  };

  const showNotification = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => {
    // Check for 3-day persistent session
    const savedToken = localStorage.getItem("vudu_auth_token");
    const savedUser = localStorage.getItem("vudu_user");
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      
      // Critical: Refetch profile to ensure server-side flags (like hasSmtpConfigured) are up-to-date
      fetch("${API_BASE_URL}/api/user/profile", {
        headers: { "Authorization": `Bearer ${savedToken}` }
      })
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          const updatedUser = { ...data, hasSmtpConfigured: true }; // hasSmtpConfigured is true if API returns profile without error
          setUser(updatedUser);
          localStorage.setItem("vudu_user", JSON.stringify(updatedUser));
        }
      })
      .catch(err => console.error("Profile sync failed", err));
    }
    setAuthLoading(false);
  }, []);

  // Persist user changes to localStorage to ensure session consistency
  useEffect(() => {
    if (user) {
      localStorage.setItem("vudu_user", JSON.stringify(user));
    }
  }, [user]);

  useEffect(() => {
    if (token) {
      fetchCampaigns();
    }
  }, [activeTab, isCreating, token]);

  useEffect(() => {
    if (viewingCampaignId && token) {
      fetch(`${API_BASE_URL}/api/campaigns/${viewingCampaignId}`, {
        headers: { "Authorization": `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setSelectedCampaign(data))
        .catch(err => console.warn("Campaign polling paused (Network unreachable)"));
    } else {
      setSelectedCampaign(null);
    }
  }, [viewingCampaignId, token]);

  const fetchCampaigns = () => {
    if (!token) return;
    fetch("${API_BASE_URL}/api/campaigns", {
      headers: { "Authorization": `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => setCampaigns(data))
      .catch(err => console.error("Fetch failed", err));
  };

  // Logic for Search, Filter & Pagination Pipeline
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
    // newest (default)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const totalSentCount = campaigns.reduce((acc, c) => acc + (c.emails?.length || 0), 0);

  const totalPages = Math.ceil(sortedCampaigns.length / (itemsPerPage || 1));
  const paginatedCampaigns = sortedCampaigns.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1); // Reset to first page on search/filter/sort change
  }, [searchQuery, itemsPerPage, statusFilter, sortBy]);

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
        setViewCampaign(null);
      }
    } catch (err: any) {
      showNotification(`System Error: ${err.message}`, "error");
    }
  };

  const [isRefreshing, setIsRefreshing] = useState(false);
  const syncReplies = (config?: any) => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    showNotification("Refreshing data pipeline...", "info");
    
    fetch("${API_BASE_URL}/api/sync-replies", { 
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        smtpConfig: config,
        campaignId: viewingCampaignId || undefined
      })
    })
    .then(res => res.json())
    .then(data => {
      showNotification(data.message || "Outreach sync complete", "success");
      fetchCampaigns();
      if (viewingCampaignId) {
        fetch(`${API_BASE_URL}/api/campaigns/${viewingCampaignId}`, {
          headers: { "Authorization": `Bearer ${token}` }
        })
          .then(res => res.json())
          .then(c => setSelectedCampaign(c));
      }
    })
    .catch(err => showNotification("Refresh failed: " + err.message, "error"))
    .finally(() => setIsRefreshing(false));
  };

  const fetchActivities = () => {
    if (!token) return;
    fetch("${API_BASE_URL}/api/notifications", {
        headers: { "Authorization": `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setActivities(data))
      .catch(err => console.error("Notification fetch failed", err));
  };

  const clearActivity = async (id: string) => {
    await fetch(`${API_BASE_URL}/api/notifications/${id}`, { 
        method: 'DELETE',
        headers: { "Authorization": `Bearer ${token}` }
    });
    fetchActivities();
  };

  const clearAllActivities = async () => {
    await fetch(`${API_BASE_URL}/api/notifications`, { 
        method: 'DELETE',
        headers: { "Authorization": `Bearer ${token}` }
    });
    fetchActivities();
  };

  const markActivityRead = async (id: string, campaignId?: string) => {
    await fetch(`${API_BASE_URL}/api/notifications/${id}`, { 
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ isRead: true })
    });
    fetchActivities();
    if (campaignId) {
      setViewCampaign(campaignId);
      setIsActivitiesOpen(false);
    }
  };

  useEffect(() => {
    fetchActivities();
    const interval = setInterval(fetchActivities, 30000); // Poll notifications every 30s
    return () => clearInterval(interval);
  }, [token]);

  // High-Frequency Polling: Auto-refresh current campaign every 5s for real-time status (QUEUED -> SENDING -> SENT)
  useEffect(() => {
    if (viewingCampaignId && token) {
      const interval = setInterval(() => {
        fetch(`${API_BASE_URL}/api/campaigns/${viewingCampaignId}`, {
          headers: { "Authorization": `Bearer ${token}` }
        })
          .then(res => res.json())
          .then(data => {
            if (data && !data.error) setSelectedCampaign(data);
          })
          .catch(err => console.warn("Real-time polling paused (Network unreachable)"));
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [viewingCampaignId, token]);

  // Background Polling: Refresh main campaign list every 15s
  useEffect(() => {
    if (token && activeTab !== 'templates') {
      const interval = setInterval(fetchCampaigns, 15000);
      return () => clearInterval(interval);
    }
  }, [token, activeTab]);

  const getHelpContent = () => {
    if (isCreating) return {
      title: "Campaign Setup",
      steps: [
        "Select an email template to define your message.",
        "Ingest your lead database (CSV format required).",
        "Review the configuration and dispatch.",
        "Monitor initialization progress in real-time."
      ]
    };
    if (viewingCampaignId) return {
      title: "Contact Intelligence",
      steps: [
        "Track individual contact status and engagement.",
        "Use 'Refreshing' to sync the latest reply data.",
        "Analyze interaction logs in the engagement timeline.",
        "Export granular performance reports as CSV."
      ]
    };
    switch (activeTab) {
      case 'templates': return {
        title: "My Templates",
        steps: [
          "Craft editorial messages in the template builder.",
          "Insert {{name}} variables for automated personalization.",
          "Organize your library with instant template previews.",
          "Maintain integrity via protected deletion workflows."
        ]
      };
      case 'campaigns': return {
        title: "Campaign Operations",
        steps: [
          "Observe the status of every active outreach campaign.",
          "Initiate new campaigns using the 'New Campaign' button.",
          "Export campaign reports for external analysis.",
          "Navigate large sets using integrated pagination."
        ]
      };
      default: return {
        title: "Dashboard Overview",
        steps: [
          "Monitor total emails sent and engagement metrics.",
          "Use the Search to find any campaign quickly.",
          "Filter by 'Engaged' to prioritize active threads.",
          "Sort by 'Performance' to identify high-interest leads."
        ]
      };
    }
  };

  const renderDashboardTable = () => (
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
              onClick={() => setViewCampaign(c.id)}
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
                    className="p-1.5 text-slate-300 hover:text-error transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg">delete</span>
                  </button>
                  <a 
                    href={`${API_BASE_URL}/api/campaigns/${c.id}/export?token=${token}`}
                    onClick={(e) => e.stopPropagation()}
                    className="w-8 h-8 flex items-center justify-center bg-on-surface text-surface rounded-sm hover:opacity-90 transition-all"
                    title="Export CSV"
                  >
                    <span className="material-symbols-outlined text-sm">download</span>
                  </a>
                </div>
              </td>
            </tr>
          ))}
          {sortedCampaigns.length === 0 && (
            <tr>
              <td colSpan={5} className="py-24 sm:py-32 relative">
                <div className="sticky left-0 w-[calc(100vw-2rem)] md:w-full flex flex-col items-center justify-center text-center px-4">
                    <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-6 text-slate-200">
                      <span className="material-symbols-outlined text-4xl">inventory_2</span>
                    </div>
                    {campaigns.length === 0 ? (
                      <>
                        <p className="font-black text-[10px] sm:text-[11px] uppercase tracking-widest mb-6 text-on-surface">No Campaigns Created Yet</p>
                        <button onClick={() => setIsCreating(true)} className="vudu-btn-primary px-8 py-3 text-[9px] tracking-widest uppercase">Create First Campaign</button>
                      </>
                    ) : (
                      <>
                        <p className="font-black text-[10px] sm:text-[11px] uppercase tracking-widest mb-6 text-on-surface">No Data Matching Search</p>
                        <button onClick={() => {setSearchQuery(""); setStatusFilter("all"); setSortBy("newest"); setCurrentPage(1);}} className="text-primary font-black underline uppercase tracking-widest text-[10px]">Reset All Filters</button>
                      </>
                    )}
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Pagination Footer */}
      {sortedCampaigns.length > 0 && (
        <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant/10 flex items-center justify-between">
           <div className="flex items-center gap-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Show
              </span>
              <div className="relative flex items-center">
                <select 
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="appearance-none bg-surface-container-lowest border border-outline-variant/10 rounded-sm pl-3 pr-8 py-1.5 text-[10px] font-black focus:ring-1 focus:ring-primary/20 focus:outline-none transition-all cursor-pointer"
                >
                  {[10, 25, 50, 100].map(val => <option key={val} value={val}>{val}</option>)}
                </select>
                <span className="material-symbols-outlined absolute right-2 text-xs pointer-events-none text-slate-400">expand_more</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                campaigns per page
              </span>
           </div>

           <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-4">
                Page {currentPage} of {totalPages}
              </span>
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="w-8 h-8 flex items-center justify-center rounded-sm bg-surface-container-lowest border border-outline-variant/10 text-slate-400 disabled:opacity-30 hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined text-lg">chevron_left</span>
              </button>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="w-8 h-8 flex items-center justify-center rounded-sm bg-surface-container-lowest border border-outline-variant/10 text-slate-400 disabled:opacity-30 hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined text-lg">chevron_right</span>
              </button>
           </div>
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    if (isCreating) {
      return (
        <CampaignWizard 
          token={token}
          user={user}
          onNotification={(msg: string, type: any) => showNotification(msg, type)}
          onComplete={() => {
            setIsCreating(false);
            setTab("dashboard");
            showNotification("Campaign initialized.", "success");
          }} 
        />
      );
    }

    if (selectedCampaign) {
      return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 md:mb-8 gap-4">
            <div className="flex items-center gap-4 md:gap-6">
              <button 
                onClick={() => setViewCampaign(null)}
                className="w-10 h-10 flex items-center justify-center rounded-md bg-surface-container-low text-slate-400 hover:text-primary transition-all border border-outline-variant/10 flex-shrink-0"
              >
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
              <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight text-on-surface truncate max-w-[200px] md:max-w-none">{selectedCampaign.name}</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:gap-4 w-full md:w-auto">
              <button 
                onClick={() => setShowRepliedOnly(!showRepliedOnly)}
                className={`flex-1 md:flex-none px-5 py-2.5 md:py-2 rounded-md font-black text-[10px] flex items-center justify-center gap-2 transition-all border uppercase tracking-widest ${
                  showRepliedOnly 
                    ? 'bg-tertiary/10 border-tertiary text-tertiary' 
                    : 'bg-surface-container-low border-outline-variant/10 text-slate-500 hover:text-primary'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{showRepliedOnly ? 'check_circle' : 'filter_list'}</span>
                {showRepliedOnly ? 'Show All' : 'Responses'}
              </button>
              <button 
                onClick={() => syncReplies()}
                disabled={isRefreshing}
                className={`flex-1 md:flex-none px-5 py-2.5 md:py-2 rounded-md font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-sm border border-outline-variant/10 ${
                  isRefreshing ? 'bg-surface-container-high text-slate-300' : 'bg-surface-container-low text-slate-600 hover:bg-surface-container-high'
                }`}
              >
                <span className={`material-symbols-outlined text-sm ${isRefreshing ? 'animate-spin' : ''}`}>sync</span>
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-1">
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
                    {selectedCampaign.contacts
                      .filter((contact: any) => {
                        const emailLog = selectedCampaign.emails.find((e: any) => e.recipient === contact.email);
                        const matchesSearch = contact.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                             (contact.username || "").toLowerCase().includes(searchQuery.toLowerCase());
                        
                        if (showRepliedOnly) {
                          return matchesSearch && emailLog?.status === 'REPLIED';
                        }
                        return matchesSearch;
                      })
                      .map((contact: any, idx: number) => {
                        const emailLog = selectedCampaign.emails.find((e: any) => e.recipient === contact.email);
                        return (
                          <tr key={contact.id} className="hover:bg-surface-container-low transition-colors duration-200">
                          <td className="px-6 py-5 font-black text-xs text-slate-300 tracking-tighter">{String(idx + 1).padStart(2, '0')}</td>
                          <td className="px-6 py-5">
                             <div className="font-bold text-sm text-on-surface mb-0.5">{contact.email}</div>
                             <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{contact.username || 'n/a'}</div>
                          </td>
                          <td className="px-6 py-5 text-center">
                             <span className={`px-2 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-widest border border-current transition-all ${
                               emailLog?.status === 'REPLIED' ? 'bg-tertiary-container/10 text-tertiary' : 
                               emailLog?.status === 'SENDING' ? 'bg-primary/5 text-primary animate-pulse' :
                               emailLog?.status === 'SENT' ? 'bg-slate-50 text-slate-400 border-slate-100' :
                               'bg-error-container/10 text-error'
                             }`}>
                               {emailLog?.status || 'PENDING'}
                             </span>
                          </td>
                          <td className="px-6 py-5 max-w-md">
                             <div className="text-xs font-medium text-on-surface-variant italic leading-relaxed line-clamp-1 group-hover:line-clamp-none transition-all">
                                {emailLog?.replies?.length > 0 
                                  ? `"${emailLog.replies.sort((a: any, b: any) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0].body}"` 
                                  : '---'
                                }
                             </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
               </table>
            </div>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case "templates":
        return (
          <Templates 
            token={token}
            onNotification={(msg: string, type: any) => showNotification(msg, type)}
            onDeleteRequest={(id: string) => setConfirmDelete({ id, type: 'template' })}
            searchQuery={searchQuery}
          />
        );
      case "campaigns":
        return (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
             <div className="flex justify-between items-end mb-8">
                <div>
                   <h1 className="text-3xl font-black tracking-tight text-on-surface">My Campaigns</h1>
                </div>
                <button 
                  onClick={() => setIsCreating(true)}
                  className="bg-gradient-to-br from-primary to-primary-container text-on-primary px-6 py-2.5 rounded-md font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity shadow-lg shadow-primary/10"
                >
                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>add</span>
                  New Campaign
                </button>
             </div>
             {renderDashboardTable()}
          </div>
        );
      case "dashboard":
      default:
         return (
           <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
                 <div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight text-on-surface text-balance">Dashboard</h1>
                    <p className="text-[10px] md:text-xs text-slate-400 font-medium mt-1">Welcome back to Vuducom MailMerge.</p>
                 </div>
                 {campaigns.length > 0 && (
                   <button 
                     onClick={() => setIsCreating(true)}
                     className="w-full md:w-auto bg-primary text-on-primary px-6 py-2.5 rounded-md font-bold text-[10px] uppercase tracking-widest flex items-center justify-center md:justify-start gap-2 hover:opacity-90 transition-opacity shadow-lg shadow-primary/10"
                   >
                     <span className="material-symbols-outlined text-sm">add</span>
                     New Campaign
                   </button>
                 )}
              </div>

              {/* Initial Setup Wizard for New Users */}
              {campaigns.length === 0 && totalSentCount === 0 && !dismissedWizard && (
                <div className="vudu-card border-l-4 border-warning bg-warning/5 mb-10 overflow-hidden relative" id="initial-setup-wizard">
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
                              onClick={() => setShowSettings(true)}
                              className="inline-flex items-center gap-2 text-[9px] font-black uppercase text-primary hover:underline tracking-tighter"
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
                            setTab("templates");
                          }}
                          className="w-full md:w-auto vudu-btn-primary px-8 py-3 text-[10px] tracking-[0.2em]"
                        >
                          I'VE CONNECTED / START CAMPAIGN
                        </button>
                      </div>
                   </div>
                </div>
              )}

              {/* Stats Ribbon (Asymmetric) */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-1 mb-8">
                 <div className="col-span-1 md:col-span-4 bg-surface-container-lowest p-4 rounded-lg flex flex-col justify-between h-28 border border-outline-variant/10 shadow-sm transition-all hover:bg-surface-container-low cursor-default group">
                   <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Active Campaigns</span>
                   <div className="flex items-end justify-between">
                     <span className="text-4xl font-black text-on-surface">{campaigns.length}</span>
                     <span className="text-tertiary text-xs font-bold bg-tertiary-fixed px-2 py-0.5 rounded-full flex items-center gap-1">
                       <span className="material-symbols-outlined text-[14px] font-bold">trending_up</span> 100%
                     </span>
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
                   <div className="absolute right-0 bottom-0 top-0 w-1/2 opacity-20 pointer-events-none">
                     <div className="h-full w-full bg-gradient-to-l from-white/40 to-transparent"></div>
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
                       <span className="material-symbols-outlined absolute right-3 text-xs pointer-events-none text-slate-400">expand_more</span>
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
                       <span className="material-symbols-outlined absolute right-3 text-xs pointer-events-none text-slate-400">expand_more</span>
                    </div>
                 </div>
              </div>

              <div className="vudu-card p-0 overflow-x-auto scrollbar-hide">
                 {renderDashboardTable()}
              </div>
           </div>
         );
    }
  };

  const getTabLabel = () => {
    if (viewingCampaignId && selectedCampaign) return selectedCampaign.name;
    if (isCreating) return "New Campaign";
    switch(activeTab) {
      case 'templates': return "Templates";
      case 'campaigns': return "Campaigns";
      default: return "Dashboard";
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("vudu_auth_token");
    localStorage.removeItem("vudu_user");
    setToken(null);
    setUser(null);
    setIsProfileOpen(false);
  };

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

  if (!token) {
    return <AuthCard onAuthComplete={(t, u) => { setToken(t); setUser(u); }} />;
  }

  return (
    <div className="min-h-screen bg-background text-on-background font-sans selection:bg-primary/20 selection:text-primary overflow-x-hidden">
      {/* Mobile Hamburger Toggle (Top Bar) */}
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

      {/* SideNavBar Shell */}
      <aside 
        className={`fixed left-0 top-0 h-full z-50 flex flex-col border-r border-outline-variant/10 bg-white font-inter text-[13px] tracking-tight transition-all duration-500 ease-in-out 
          ${isMobileMenuOpen ? 'w-[280px] translate-x-0 shadow-2xl' : 'w-64 -translate-x-full md:translate-x-0'}
        `}
      >
        <div className="flex flex-col items-center pt-12 md:pt-8 pb-4 gap-8 h-full relative bg-white">
          <div className="hidden md:flex flex-col items-center gap-1 w-full px-4 overflow-hidden mb-4">
            <span className="font-black tracking-tighter text-primary text-2xl transition-all duration-500">
              VUDUCOM
            </span>
          </div>

          <nav className="flex flex-col w-full" onClick={() => setIsMobileMenuOpen(false)}>
            {/* Dashboard */}
            <button 
              onClick={() => setTab("dashboard")}
              className={`flex items-center py-4 px-6 gap-4 transition-all active:scale-95 ${activeTab === 'dashboard' && !isCreating && !viewingCampaignId ? 'text-primary border-l-4 border-primary bg-white' : 'text-slate-500 hover:bg-slate-50 hover:text-primary'}`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: (activeTab === 'dashboard' && !isCreating && !viewingCampaignId) ? "'FILL' 1" : "" }}>grid_view</span>
              <span className="text-[11px] font-black uppercase tracking-widest whitespace-nowrap">Dashboard</span>
            </button>

            {/* Templates */}
            <button 
              onClick={() => setTab("templates")}
              className={`flex items-center py-4 px-6 gap-4 transition-all active:scale-95 ${activeTab === 'templates' ? 'text-primary border-l-4 border-primary bg-white' : 'text-slate-500 hover:bg-slate-50 hover:text-primary'}`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'templates' ? "'FILL' 1" : "" }}>description</span>
              <span className="text-[11px] font-black uppercase tracking-widest whitespace-nowrap">Templates</span>
            </button>

            {/* Campaigns */}
            <button 
              onClick={() => setTab("campaigns")}
              className={`flex items-center py-4 px-6 gap-4 transition-all active:scale-95 ${activeTab === 'campaigns' || isCreating ? 'text-primary border-l-4 border-primary bg-white' : 'text-slate-500 hover:bg-slate-50 hover:text-primary'}`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: (activeTab === 'campaigns' || isCreating) ? "'FILL' 1" : "" }}>campaign</span>
              <span className="text-[11px] font-black uppercase tracking-widest whitespace-nowrap">Campaigns</span>
            </button>
          </nav>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[45]" 
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}

      {/* TopAppBar Shell */}
      <header className="hidden md:flex justify-between items-center fixed top-0 z-30 h-12 bg-white/80 backdrop-blur-xl border-b border-outline-variant/10 font-inter text-sm font-medium transition-all duration-500 pr-6 pl-72 w-full">
        <div className="flex items-center gap-4">
          <span className="text-primary font-bold cursor-pointer hover:opacity-80" onClick={() => setTab("dashboard")}>Dashboard</span>
          <span className="text-slate-300 font-normal">/</span>
          <span className="text-on-surface truncate max-w-[240px]">{getTabLabel()}</span>
        </div>

        <div className="flex items-center gap-6">
          <div className="relative flex items-center group">
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 pr-4 bg-surface-container-low border-none rounded-md text-xs focus:ring-1 focus:ring-primary/20 w-64 transition-all"
            />
            <span className="material-symbols-outlined absolute left-2 text-slate-400 text-lg group-focus-within:text-primary">search</span>
          </div>

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

              {/* Notification Tray Popover */}
              {isActivitiesOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsActivitiesOpen(false)}></div>
                  <div className="absolute right-0 top-10 w-80 bg-white border border-outline-variant/20 rounded-sm shadow-2xl z-50 animate-in slide-in-from-top-2 duration-300 overflow-hidden">
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
                              onClick={() => markActivityRead(a.id, a.campaignId)}
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
                                className="absolute top-4 right-4 text-slate-200 hover:text-error opacity-0 group-hover:opacity-100 transition-all"
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

            <button 
              onClick={() => setShowHelp(true)}
              className="hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-xl">help</span>
            </button>
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
                        onClick={handleLogout}
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

      {/* Main Content Canvas */}
      <main className="transition-all duration-500 pt-12 min-h-screen md:pl-64 pl-0">
        <div className="p-4 sm:p-10 max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>

      {/* Floating Notifications */}
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

      {/* Profile & SMTP Settings */}
      {showSettings && token && (
        <ProfileSettings 
          token={token} 
          onClose={() => setShowSettings(false)} 
          onUpdate={(u) => setUser(u)} 
        />
      )}

      {/* Confirmation Modal (ConfirmDelete) */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="vudu-card text-center max-w-sm w-full animate-in zoom-in-95 duration-300 shadow-2xl border border-outline-variant/20">
              <div className="bg-error-container w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 text-error text-2xl">
                <span className="material-symbols-outlined text-3xl">delete</span>
              </div>
              <h3 className="text-xl font-black mb-2 uppercase tracking-tight text-on-surface">Confirm Deletion</h3>
              <p className="text-on-surface-variant text-sm font-medium mb-10 leading-relaxed px-4">
                This action is permanent and cannot be reversed. Are you sure you want to delete this {confirmDelete.type}?
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-4 rounded-sm text-slate-500 font-bold hover:bg-surface-container-low transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDelete(confirmDelete.id, confirmDelete.type)}
                  className="flex-1 py-4 bg-error text-on-error rounded-sm font-black uppercase tracking-widest text-[10px] hover:opacity-90 transition-all shadow-lg shadow-error/20"
                >
                  Yes, Delete
                </button>
              </div>
           </div>
        </div>
      )}

      {/* Guidance Modal (Walkthrough) */}
      {showHelp && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-500">
           <div className="vudu-card max-w-lg w-full animate-in zoom-in-95 duration-500 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary to-primary-container"></div>
              
              <button 
                onClick={() => setShowHelp(false)}
                className="absolute top-6 right-6 text-slate-400 hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined font-black">close</span>
              </button>

              <div className="mb-10">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-2">VUDUCOM MAILMERGE SUPPORT</p>
                <h3 className="text-3xl font-black tracking-tighter text-on-surface underline decoration-primary/20 decoration-4 underline-offset-8">
                  {getHelpContent().title}
                </h3>
              </div>

              <div className="space-y-6 mb-12">
                {getHelpContent().steps.map((step, idx) => (
                  <div key={idx} className="flex gap-6 group">
                     <div className="flex-shrink-0 w-10 h-10 rounded-sm bg-surface-container-high flex items-center justify-center text-primary font-black text-sm border border-outline-variant/10 group-hover:bg-primary group-hover:text-on-primary transition-all duration-500">
                        {idx + 1}
                     </div>
                     <div className="flex-grow pt-2">
                        <p className="text-[13px] font-bold text-on-surface-variant leading-relaxed tracking-tight">
                          {step}
                        </p>
                     </div>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => setShowHelp(false)}
                className="w-full py-5 bg-on-surface text-surface rounded-sm font-black uppercase tracking-[0.2em] text-[11px] hover:opacity-90 transition-all shadow-xl shadow-black/10"
              >
                Understand & Continue
              </button>
           </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
