"use client";

import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import CampaignWizard from "@/components/CampaignWizard";
import { useRouter } from "next/navigation";

export default function NewCampaignPage() {
  const { token, user } = useAuth();
  const { showNotification } = useUI();
  const router = useRouter();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <CampaignWizard 
        token={token} 
        user={user} 
        onNotification={showNotification} 
        onComplete={() => {
          showNotification("Campaign initialized.", "success");
          router.push("/dashboard");
        }} 
      />
    </div>
  );
}
