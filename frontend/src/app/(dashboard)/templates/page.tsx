"use client";

import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import Templates from "@/components/Templates";
import { useState } from "react";
import { API_BASE_URL } from "@/config";

export default function TemplatesPage() {
  const { token } = useAuth();
  const { showNotification } = useUI();
  const [confirmDelete, setConfirmDelete] = useState<{id: string, type: 'template' | 'campaign'} | null>(null);

  const handleDelete = async (id: string, type: 'campaign' | 'template') => {
    try {
      const url = `${API_BASE_URL}/api/templates/${id}`;
      const res = await fetch(url, { 
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        showNotification(`Template removed successfully.`, 'success');
        setConfirmDelete(null);
        // The Templates component handles its own internal refresh usually via fetchTemplates on mount or state
        window.location.reload(); // Simple way to refresh for now as Templates component is mostly internal
      }
    } catch (err: any) {
      showNotification(`System Error: ${err.message}`, "error");
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <Templates 
        token={token} 
        onNotification={showNotification} 
        onDeleteRequest={(id) => setConfirmDelete({ id, type: 'template' })}
        searchQuery="" 
      />

      {confirmDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
           <div className="vudu-card text-center max-w-sm w-full shadow-2xl border border-outline-variant/20 py-8 px-6">
              <div className="bg-error-container w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 text-error text-2xl">
                <span className="material-symbols-outlined text-3xl">delete</span>
              </div>
              <h3 className="text-xl font-black mb-2 uppercase tracking-tight text-on-surface">Confirm Deletion</h3>
              <p className="text-on-surface-variant text-sm font-medium mb-10 leading-relaxed px-4">
                This template will be permanently removed. Are you sure?
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
