"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { API_BASE_URL } from "../config";
import "react-quill/dist/quill.snow.css";

// Dynamic import for ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false });

export default function Templates({ onNotification, onDeleteRequest, searchQuery = "", token }: { 
  onNotification: (msg: string, type: 'success' | 'error') => void,
  onDeleteRequest: (id: string) => void,
  searchQuery?: string,
  token: string | null
}) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newTemplate, setNewTemplate] = useState({ name: "", subject: "", content: "" });

  useEffect(() => {
    if (token) fetchTemplates();
  }, [token]);

  const fetchTemplates = () => {
    fetch("${API_BASE_URL}/api/templates", {
        headers: { "Authorization": `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => setTemplates(data));
  };

  const handleEdit = (template: any) => {
    setEditingId(template.id);
    setNewTemplate({
      name: template.name,
      subject: template.subject,
      content: template.content
    });
    setIsAdding(true);
  };

  const handleSave = async () => {
    if (!newTemplate.name || !newTemplate.subject) {
      onNotification("Incomplete design data.", "error");
      return;
    }

    try {
      const url = editingId 
        ? `${API_BASE_URL}/api/templates/${editingId}`
        : "${API_BASE_URL}/api/templates";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(newTemplate),
      });

      if (res.ok) {
        onNotification(editingId ? "Template updated successfully." : "Template saved successfully.", "success");
        fetchTemplates();
        setIsAdding(false);
        setEditingId(null);
        setNewTemplate({ name: "", subject: "", content: "" });
      } else {
        const data = await res.json();
        onNotification(data.error || "A conflict occurred while saving.", "error");
      }
    } catch (err) {
      onNotification("Save failure.", "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 md:mb-8 gap-4">
        <div>
           <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary mb-1">My Template Library</p>
           <h1 className="text-2xl md:text-3xl font-black tracking-tight text-on-surface flex items-center gap-4">
             Templates
             <span className="bg-surface-container-high text-on-surface-variant text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-widest">{templates.length} TOTAL</span>
           </h1>
        </div>
        <button 
          onClick={() => { setIsAdding(true); setEditingId(null); setNewTemplate({ name: "", subject: "", content: "" }); }}
          className="w-full md:w-auto bg-gradient-to-br from-primary to-primary-container text-on-primary px-6 py-3 md:py-2 rounded-md font-medium text-sm flex items-center justify-center md:justify-start gap-2 hover:opacity-90 transition-opacity shadow-sm"
        >
          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>add</span>
          Create New
        </button>
      </div>

      {isAdding && (
        <div className="vudu-card border-l-4 border-primary animate-in slide-in-from-top-4 duration-500 mb-10">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-black uppercase tracking-tight text-on-surface">{editingId ? 'Edit Template' : 'New Email Template'}</h3>
            <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-primary transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Column 1: Configuration, Variables & Canvas */}
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-2">Internal Identifier</label>
                  <input 
                    className="vudu-input w-full font-bold" 
                    placeholder="TEMPLATE TITLE" 
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({...newTemplate, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-2">Subject Header</label>
                  <input 
                    className="vudu-input w-full font-medium" 
                    placeholder="Unlocking the potential..." 
                    value={newTemplate.subject}
                    onChange={(e) => setNewTemplate({...newTemplate, subject: e.target.value})}
                  />
                </div>
              </div>

              {/* Detected Variables Section */}
              <div className="p-4 bg-surface-container-low rounded-sm border border-outline-variant/10">
                <label className="block text-[10px] font-bold uppercase text-primary tracking-widest mb-3">Detected Variables</label>
                <div className="flex flex-wrap gap-2">
                  {Array.from(new Set([
                    ...(newTemplate.subject.match(/{([^}]+)}/g) || []),
                    ...(newTemplate.content.match(/{([^}]+)}/g) || [])
                  ])).map(v => v.replace(/{|}/g, '').replace(/&nbsp;/g, ' ')).length > 0 ? (
                    Array.from(new Set([
                      ...(newTemplate.subject.match(/{([^}]+)}/g) || []),
                      ...(newTemplate.content.match(/{([^}]+)}/g) || [])
                    ])).map(v => v.replace(/{|}/g, '').replace(/&nbsp;/g, ' ')).map((varName, i) => (
                      <span key={i} className="bg-white px-2 py-1 border border-outline-variant/20 rounded text-[10px] font-black text-on-surface flex items-center gap-2 group">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                        {varName}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter italic">No variables detected in content</span>
                  )}
                </div>
              </div>

              {/* Email Editor */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-wider mb-2">Email Message</label>
                <div className="bg-white rounded-md border border-outline-variant/20 overflow-hidden shadow-sm h-[400px]">
                  <ReactQuill 
                    theme="snow" 
                    value={newTemplate.content} 
                    onChange={(val: string) => setNewTemplate({...newTemplate, content: val})}
                    className="vudu-editor h-full pb-10"
                  />
                </div>
              </div>
            </div>

            {/* Column 2: Email Preview */}
            <div className="flex flex-col h-full pt-1">
              <label className="block text-[10px] font-bold uppercase text-primary tracking-widest mb-2">Email Preview</label>
              <div className="flex-1 bg-surface-container-lowest rounded-md border border-outline-variant/20 overflow-hidden flex flex-col shadow-inner min-h-[500px]">
                 <div className="bg-surface-container-high p-3 border-bottom border-outline-variant/10 flex items-center gap-2">
                    <div className="flex gap-1">
                       <div className="w-1.5 h-1.5 rounded-full bg-error/20"></div>
                       <div className="w-1.5 h-1.5 rounded-full bg-warning/20"></div>
                       <div className="w-1.5 h-1.5 rounded-full bg-primary/20"></div>
                    </div>
                    <div className="bg-surface-container-lowest flex-1 px-2 py-0.5 rounded text-[8px] text-slate-400 font-medium truncate italic tracking-tighter uppercase">
                       {newTemplate.subject || 'Drafting live content...'}
                    </div>
                 </div>
                 <div className="p-10 overflow-y-auto bg-white flex-1 custom-scrollbar">
                    <div 
                       className="prose prose-sm max-w-none text-on-surface leading-relaxed"
                       dangerouslySetInnerHTML={{ __html: newTemplate.content || '<p class="text-slate-300 italic">Content visualization pending...</p>' }}
                    />
                 </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-end gap-2 md:gap-4 p-6 bg-surface-container-low -mx-6 -mb-6 border-t border-outline-variant/10">
            <button 
              onClick={() => { setIsAdding(false); setEditingId(null); }}
              className="w-full md:w-auto px-6 py-3 md:py-2 rounded-md font-bold text-slate-400 hover:text-primary transition-colors text-[10px] uppercase tracking-widest order-2 md:order-1"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              className="w-full md:w-auto vudu-btn-primary px-8 py-3 md:py-2 text-[10px] order-1 md:order-2"
            >
              {editingId ? 'Update Template' : 'Save Template'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1">
        {templates.filter(t => 
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
          t.subject.toLowerCase().includes(searchQuery.toLowerCase())
        ).map((t) => (
          <div 
            key={t.id} 
            onClick={() => handleEdit(t)}
            className="group bg-surface-container-lowest border border-outline-variant/5 p-5 hover:bg-surface-container-low transition-colors duration-200 cursor-pointer flex flex-col min-h-[200px]"
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-[10px] font-bold text-primary mb-0.5 uppercase tracking-tighter">NAME: {t.name}</p>
                <p className="text-[11px] text-slate-400 font-medium uppercase tracking-tighter">{new Date(t.createdAt).toLocaleDateString([], { month: 'short', day: '2-digit', year: 'numeric' })}</p>
              </div>
              
              <div className="flex gap-1 transition-opacity">
                <button 
                  onClick={(e) => { e.stopPropagation(); onDeleteRequest(t.id); }}
                  className="p-1 px-1.5 bg-surface-container-lowest border border-outline-variant/20 text-slate-400 hover:text-error transition-colors rounded-md"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            </div>

            <h3 className="font-bold text-on-surface text-sm mb-2 line-clamp-1 group-hover:text-primary transition-colors">{t.subject}</h3>
            
            <p className="text-xs text-slate-500 leading-relaxed line-clamp-3 mb-4 italic">
              "{t.content.replace(/<[^>]*>/g, '').substring(0, 120)}..."
            </p>

            <div className="mt-auto flex items-center gap-2">
              <span className="bg-secondary-fixed text-on-secondary-fixed text-[9px] font-bold px-2 py-0.5 rounded tracking-tighter uppercase">E-Mail</span>
              <span className="bg-surface-container-high text-on-surface-variant text-[9px] font-bold px-2 py-0.5 rounded tracking-tighter uppercase">Design</span>
            </div>
          </div>
        ))}
        
        {/* Add New Empty Card Placeholder */}
        <div 
          onClick={() => { setIsAdding(true); setEditingId(null); setNewTemplate({ name: "", subject: "", content: "" }); }}
          className="group border-2 border-dashed border-outline-variant/30 p-5 flex flex-col items-center justify-center hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 cursor-pointer min-h-[200px]"
        >
          <div className="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-primary mb-3 shadow-sm group-hover:scale-110 transition-transform">
            <span className="material-symbols-outlined font-black" style={{ fontVariationSettings: "'FILL' 1" }}>add</span>
          </div>
          <p className="text-xs font-bold text-on-surface uppercase tracking-tight">New Template</p>
          <p className="text-[10px] text-slate-400 uppercase mt-1 tracking-tighter">Start from scratch</p>
        </div>
      </div>
    </div>
  );
}
