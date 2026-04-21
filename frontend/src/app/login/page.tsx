"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import AuthCard from "@/components/AuthCard";

export default function LoginPage() {
  const { token, login, authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && token) {
      router.push("/dashboard");
    }
  }, [token, authLoading, router]);

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-background">
      <AuthCard onAuthComplete={(t, u) => {
        login(t, u);
        router.push("/dashboard");
      }} />
    </div>
  );
}
