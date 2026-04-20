"use client";

import { useState, useEffect } from "react";
import Papa from "papaparse";
import { API_BASE_URL } from "../config";

export default function CampaignWizard({ onComplete, onNotification, token, user }: { 
  onComplete: () => void,
  onNotification: (msg: string, type: 'success' | 'info' | 'error') => void,
  token: string | null,
  user: any
}) {
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [csvData, setCsvData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  
  // Mapping will now hold { email: "...", username: "...", followers: "...", var1: "csv_header", ... }
  const [mapping, setMapping] = useState<Record<string, string>>({ email: "", username: "", followers: "" });
  const [detectedVariables, setDetectedVariables] = useState<string[]>([]);
  
  const [campaignName, setCampaignName] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (token) {
      fetch(`${API_BASE_URL}/api/templates`, {
        headers: { "Authorization": `Bearer ${token}` }
      })
        .then((res) => res.json())
        .then((data) => setTemplates(data));
    }
  }, [token]);

  // When template changes, extract variables like {something}
  useEffect(() => {
    const template = templates.find(t => t.id === selectedTemplate);
    if (template) {
      const combined = template.subject + " " + template.content;
      // Use regex that allows spaces inside curly braces
      const matches = Array.from(combined.matchAll(/\{([^}]+)\}/g));
      const vars = Array.from(new Set(matches.map(m => {
        // Clean &nbsp; and other potential HTML noise from the variable name
        return m[1].replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').trim();
      })));
      
      setDetectedVariables(vars);
      
      // Initialize mapping for new variables if not already set
      const newMapping = { ...mapping };
      vars.forEach(v => {
        if (!newMapping[v]) newMapping[v] = "";
      });
      setMapping(newMapping);
    }
  }, [selectedTemplate, templates]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        complete: (results) => {
          setCsvData(results.data);
          if (results.meta.fields) {
            setHeaders(results.meta.fields);
          }
          setStep(3);
        },
      });
    }
  };

  const handleLaunch = async () => {
    if (!campaignName || !selectedTemplate || !mapping.email) return;

    // Trust but Verify: Fetch fresh profile configuration to bypass stale frontend state
    try {
      const profileRes = await fetch(`${API_BASE_URL}/api/user/profile`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const latestUser = await profileRes.json();
      
      if (!latestUser?.smtpEmail) {
        onNotification("MAIL_NOT_CONNECTED: Please connect your email in Settings before launching.", "error");
        return;
      }
    } catch (err) {
      console.error("Connectivity verification failed", err);
      // Fallback to prop-based check if fetch fails
      if (!user?.smtpEmail) {
        onNotification("MAIL_NOT_CONNECTED: Connectivity verification failed. Please try again.", "error");
        return;
      }
    }

    setIsSending(true);
    const contacts = csvData.map((row) => {
      // Build custom data object from all mapped variables
      const customData: Record<string, any> = {};
      detectedVariables.forEach(v => {
        if (mapping[v]) {
          customData[v] = row[mapping[v]];
        }
      });

      return {
        email: row[mapping.email],
        username: mapping.username ? row[mapping.username] : null,
        followers: mapping.followers ? parseInt(row[mapping.followers]) || 0 : 0,
        customData: customData
      };
    }).filter(c => c.email);

    try {
      const res = await fetch(`${API_BASE_URL}/api/campaigns`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          name: campaignName,
          templateId: selectedTemplate,
          contacts
        }),
      });

      if (res.ok) {
        onComplete();
      } else {
        const data = await res.json();
        onNotification(data.error || "System error during launch.", "error");
      }
    } catch (err) {
      onNotification("Network error or system timeout.", "error");
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-10">
      {/* Step Indicator (Minimalist & Responsive) */}
      <div className="flex items-center justify-between mb-10 md:mb-16 px-4 md:px-6 overflow-x-auto scrollbar-hide gap-4">
        {[1, 2, 3, 4].map((s) => (
          <div 
            key={s} 
            className={`flex items-center gap-2 md:gap-3 flex-shrink-0 ${s <= step ? 'cursor-pointer group/step' : 'cursor-default opacity-50'}`}
            onClick={() => { if (s <= step) setStep(s); }}
          >
            <div 
              className={`w-7 h-7 rounded-sm flex items-center justify-center font-bold text-[10px] tracking-widest transition-all duration-300 ${
                step === s ? "bg-primary text-on-primary shadow-sm" : 
                s < step ? "bg-primary/20 text-primary group-hover/step:bg-primary group-hover/step:text-on-primary" : 
                "bg-surface-container-high text-slate-400"
              }`}
            >
              0{s}
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap 
              ${step === s ? 'text-on-surface opacity-100 block' : 'hidden md:opacity-0 md:w-0'}`}>
              {s === 1 ? 'Configure' : s === 2 ? 'Contacts' : s === 3 ? 'Match' : 'Launch'}
            </span>
            {s < 4 && <div className={`w-8 md:w-16 h-px ${step > s ? "bg-primary/20" : "bg-outline-variant/10"}`}></div>}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="vudu-card border-l-4 border-primary">
            <div className="mb-8">
               <p className="text-[10px] font-bold uppercase text-primary tracking-[0.1em] mb-1">Step 01 / Configuration</p>
               <h2 className="text-2xl font-black tracking-tight text-on-surface">Campaign Details</h2>
            </div>
            
            <div className="space-y-6">
               <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-wider">Internal Identifier</label>
                  <input 
                   className="vudu-input w-full font-bold" 
                   placeholder="e.g. INFLUENCER_OUTREACH" 
                   value={campaignName}
                   onChange={(e) => setCampaignName(e.target.value)}
                 />
              </div>
              <div>
                 <label className="block text-[10px] font-bold uppercase text-slate-500 mb-2 tracking-wider">Source Template</label>
                <select 
                  className="vudu-input w-full font-bold appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22currentColor%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M19%209l-7%207-7-7%22%20%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_1.5rem_center] bg-[length:1.2em_1.2em]"
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                >
                  <option value="">Select Template...</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              
              <div className="pt-6">
                <button 
                  disabled={!campaignName || !selectedTemplate}
                  onClick={async () => {
                    const res = await fetch(`${API_BASE_URL}/api/campaigns/check/${encodeURIComponent(campaignName)}`);
                    const data = await res.json();
                    if (data.exists) {
                       onNotification("A campaign with this name already exists.", "error");
                    } else {
                       setStep(2);
                    }
                  }}
                  className="vudu-btn-primary w-full py-4 text-xs tracking-widest font-bold uppercase disabled:opacity-20 transition-all flex items-center justify-center gap-3"
                >
                  Continue to Contacts
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>

          {/* New: Step 1 Live Preview Column */}
          <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-700">
            <label className="block text-[10px] font-bold uppercase text-primary tracking-widest mb-4 px-1">Selected Asset Preview</label>
            <div className="flex-1 bg-surface-container-lowest rounded-md border border-outline-variant/10 overflow-hidden flex flex-col shadow-sm min-h-[440px]">
               <div className="bg-surface-container-high p-3 border-bottom border-outline-variant/5 flex items-center gap-2">
                  <div className="flex gap-1">
                     <div className="w-1.5 h-1.5 rounded-full bg-error/20"></div>
                     <div className="w-1.5 h-1.5 rounded-full bg-warning/20"></div>
                     <div className="w-1.5 h-1.5 rounded-full bg-primary/20"></div>
                  </div>
                  <div className="bg-surface-container-lowest flex-1 px-2 py-0.5 rounded text-[8px] text-slate-400 font-medium truncate italic tracking-tighter uppercase">
                     {templates.find(t => t.id === selectedTemplate)?.subject || 'Select a template to visualize...'}
                  </div>
               </div>
               <div className="p-8 overflow-y-auto bg-white flex-1 custom-scrollbar">
                  <div 
                     className="prose prose-sm max-w-none text-on-surface leading-relaxed"
                     dangerouslySetInnerHTML={{ 
                        __html: templates.find(t => t.id === selectedTemplate)?.content || 
                        '<p class="text-slate-300 italic text-center py-20 font-bold uppercase tracking-widest text-[10px]">No template selected</p>' 
                     }}
                  />
               </div>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="animate-in zoom-in-95 duration-300">
          <div className="vudu-card border-dashed border-2 border-outline-variant/30 py-20 text-center hover:border-primary/50 transition-all cursor-pointer" onClick={() => document.getElementById('csv-upload')?.click()}>
            <div className="w-14 h-14 rounded-full bg-surface-container-low flex items-center justify-center mx-auto mb-6 text-slate-400 group-hover:text-primary">
              <span className="material-symbols-outlined text-2xl">upload_file</span>
            </div>
            <h2 className="text-xl font-black mb-2 uppercase tracking-tight text-on-surface">Upload Contact Sheet</h2>
            <p className="text-slate-400 mb-10 font-medium text-xs">Choose your .CSV contact database</p>
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleFileUpload}
              className="hidden" 
              id="csv-upload" 
            />
            <button className="vudu-btn-primary px-10 py-3 mx-auto flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">add</span>
              Select CSV File
            </button>
          </div>
          <div className="mt-8 flex justify-center">
            <button 
              onClick={() => setStep(1)}
              className="px-8 py-3 rounded-md text-slate-400 hover:bg-surface-container-low font-bold text-[10px] uppercase tracking-widest transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Back to Configuration
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="vudu-card border-l-4 border-primary animate-in slide-in-from-right-4 duration-500">
          <div className="mb-8">
             <p className="text-[10px] font-bold uppercase text-primary tracking-[0.1em] mb-1">Step 03 / Matching Columns</p>
             <h2 className="text-2xl font-black tracking-tight text-on-surface">Header Matching</h2>
          </div>

          <div className="space-y-1">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-surface-container-low p-5 rounded-md border border-outline-variant/10 mb-4 gap-4">
              <div>
                <span className="font-bold text-primary block text-[10px] uppercase tracking-wider mb-1">Email Header</span>
                <span className="text-[11px] text-slate-400 font-medium italic">Essential Link</span>
              </div>
              <select 
                className="vudu-input w-full md:w-64 text-xs font-bold uppercase"
                value={mapping.email}
                onChange={(e) => setMapping({...mapping, email: e.target.value})}
              >
                <option value="">Select Header...</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div className="pt-4 border-t border-outline-variant/10">
               <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-6 flex items-center gap-2">
                 <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                 Custom Email Tags
               </p>
               <div className="space-y-1">
                 {detectedVariables.length === 0 ? (
                    <div className="py-8 text-center bg-surface-container-lowest border border-dashed border-outline-variant/20 rounded-md text-[10px] text-slate-400 font-medium italic">
                      No tags detected in source design.
                    </div>
                 ) : (
                   detectedVariables.map(v => (
                     <div key={v} className="flex flex-col md:flex-row justify-between items-start md:items-center bg-surface-container-lowest p-5 rounded-md border border-outline-variant/10 hover:bg-surface-container-low transition-colors gap-4">
                       <div>
                         <span className="font-bold text-on-surface block text-[11px] mb-1">{`{${v}}`}</span>
                         <span className="text-[10px] text-slate-400 font-medium italic">Template Variable</span>
                       </div>
                       <select 
                         className="vudu-input w-full md:w-64 text-xs font-bold uppercase"
                         value={mapping[v] || ""}
                         onChange={(e) => setMapping({...mapping, [v]: e.target.value})}
                       >
                         <option value="">Map To...</option>
                         {headers.map(h => <option key={h} value={h}>{h}</option>)}
                       </select>
                     </div>
                   ))
                 )}
               </div>
            </div>

            <div className="flex gap-4 mt-10">
              <button 
                onClick={() => setStep(2)}
                className="px-8 py-3 rounded-md text-slate-400 hover:bg-surface-container-low font-bold text-[10px] uppercase tracking-widest transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                Back
              </button>
              <button 
                disabled={!mapping.email || detectedVariables.some(v => !mapping[v])}
                onClick={() => setStep(4)}
                className="vudu-btn-primary flex-1 py-3 text-[10px] tracking-widest font-bold uppercase disabled:opacity-20 transition-all shadow-sm"
              >
                Review & Launch Campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="animate-in zoom-in-95 duration-300 grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="vudu-card border-l-4 border-tertiary h-fit">
            <div className="mb-10">
               <p className="text-[10px] font-bold uppercase text-tertiary tracking-[0.1em] mb-1">Step 04 / Final Review</p>
               <h2 className="text-2xl font-black tracking-tight text-on-surface">Check & Send</h2>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-10">
              <div className="bg-surface-container-low p-6 rounded-md">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Contacts</span>
                <span className="text-3xl font-black text-on-surface">{csvData.length}</span>
              </div>
              <div className="bg-surface-container-low p-6 rounded-md">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Identifier</span>
                <span className="text-base font-bold text-on-surface truncate block">{campaignName}</span>
              </div>
            </div>

            <div className="flex gap-4">
              <button 
                disabled={isSending}
                onClick={() => setStep(3)}
                className="px-8 py-4 rounded-md text-slate-400 hover:bg-surface-container-low font-bold text-[10px] uppercase tracking-widest transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                Back
              </button>
              <button 
                disabled={isSending}
                onClick={handleLaunch}
                className="vudu-btn-primary flex-1 py-4 text-xs tracking-widest font-bold uppercase flex items-center justify-center gap-3"
              >
                {isSending ? "Launching Campaign..." : "Confirm & Send"}
              </button>
            </div>
          </div>

          {/* Personalized Sample Preview */}
          <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-700">
            <div className="flex justify-between items-end mb-4 px-1">
              <div>
                <label className="block text-[10px] font-bold uppercase text-primary tracking-widest mb-1">Email Preview</label>
                <p className="text-[9px] text-slate-400 font-medium">Visualizing column matching for first contact record</p>
              </div>
              <span className="bg-primary/10 text-primary text-[8px] font-black uppercase px-2 py-1 rounded tracking-tighter">Preview Verified</span>
            </div>
            
            <div className="flex-1 bg-surface-container-lowest rounded-md border border-outline-variant/10 overflow-hidden flex flex-col shadow-sm min-h-[440px]">
               <div className="bg-surface-container-high p-3 border-bottom border-outline-variant/5 flex items-center gap-2">
                  <div className="flex gap-1">
                     <div className="w-1.5 h-1.5 rounded-full bg-error/20"></div>
                     <div className="w-1.5 h-1.5 rounded-full bg-warning/20"></div>
                     <div className="w-1.5 h-1.5 rounded-full bg-primary/20"></div>
                  </div>
                  <div className="bg-surface-container-lowest flex-1 px-2 py-0.5 rounded text-[8px] text-slate-400 font-medium truncate italic tracking-tighter uppercase">
                     {(() => {
                        const template = templates.find(t => t.id === selectedTemplate);
                        if (!template) return "...";
                        let subject = template.subject;
                        detectedVariables.forEach(v => {
                          const val = csvData[0]?.[mapping[v]] || `[${v}]`;
                          // Super robust regex: handles HTML tags, &nbsp;, and whitespace between characters
                          const pattern = `{${v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').split(/\s+/).map(word => 
                            word.split('').join('(?:<[^>]*>|&nbsp;|\\s)*')
                          ).join('(?:<[^>]*>|&nbsp;|\\s)+')}}`;
                          subject = subject.replace(new RegExp(pattern, 'g'), val);
                        });
                        return subject;
                     })()}
                  </div>
               </div>
               <div className="p-10 overflow-y-auto bg-white flex-1 custom-scrollbar">
                  <div 
                     className="prose prose-sm max-w-none text-on-surface leading-relaxed"
                     dangerouslySetInnerHTML={{ 
                        __html: (() => {
                          const template = templates.find(t => t.id === selectedTemplate);
                          if (!template) return "<p>Loading canvas...</p>";
                          let content = template.content;
                          detectedVariables.forEach(v => {
                            const val = csvData[0]?.[mapping[v]] || `[${v}]`;
                            const pattern = `{${v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').split(/\s+/).map(word => 
                              word.split('').join('(?:<[^>]*>|&nbsp;|\\s)*')
                            ).join('(?:<[^>]*>|&nbsp;|\\s)+')}}`;
                            content = content.replace(new RegExp(pattern, 'g'), val);
                          });
                          return content;
                        })()
                     }}
                  />
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
