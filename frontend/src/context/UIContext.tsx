"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { API_BASE_URL } from "../config";
import { useAuth } from "./AuthContext";

interface Notification {
  message: string;
  type: 'success' | 'info' | 'error';
}

interface Activity {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  campaignId?: string;
  createdAt: string;
}

interface UIContextType {
  notification: Notification | null;
  showNotification: (message: string, type?: 'success' | 'info' | 'error') => void;
  activities: Activity[];
  isActivitiesOpen: boolean;
  setIsActivitiesOpen: (open: boolean) => void;
  fetchActivities: () => void;
  markActivityRead: (id: string, campaignId?: string) => Promise<void>;
  clearActivity: (id: string) => Promise<void>;
  clearAllActivities: () => Promise<void>;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [notification, setNotification] = useState<Notification | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isActivitiesOpen, setIsActivitiesOpen] = useState(false);

  const showNotification = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchActivities = () => {
    if (!token) return;
    fetch(`${API_BASE_URL}/api/notifications`, {
      headers: { "Authorization": `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setActivities(data))
      .catch(err => console.error("Notification fetch failed", err));
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

  useEffect(() => {
    if (token) {
      fetchActivities();
      const interval = setInterval(fetchActivities, 30000);
      return () => clearInterval(interval);
    }
  }, [token]);

  return (
    <UIContext.Provider value={{ 
      notification, 
      showNotification, 
      activities, 
      isActivitiesOpen, 
      setIsActivitiesOpen, 
      fetchActivities,
      markActivityRead,
      clearActivity,
      clearAllActivities
    }}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error("useUI must be used within a UIProvider");
  }
  return context;
}
