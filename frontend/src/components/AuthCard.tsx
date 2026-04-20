"use client";

import { useState } from "react";

interface AuthCardProps {
  onAuthComplete: (token: string, user: any) => void;
}

export default function AuthCard({ onAuthComplete }: AuthCardProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isLogin && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const endpoint = isLogin ? "/api/auth/signin" : "/api/auth/signup";
      const res = await fetch(`http://localhost:8000${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed");

      if (data.token) {
        localStorage.setItem("vudu_auth_token", data.token);
        localStorage.setItem("vudu_user", JSON.stringify(data.user));
        onAuthComplete(data.token, data.user);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/90 backdrop-blur-2xl animate-in fade-in duration-1000 overflow-y-auto">
      <div className="w-full max-w-[900px] flex flex-col md:flex-row bg-surface border border-outline-variant/20 shadow-[0_48px_96px_-24px_rgba(0,0,0,0.4)] animate-in zoom-in-95 duration-700 relative overflow-hidden rounded-sm my-auto">
        {/* Left Branding Side */}
        <div className="w-full md:w-[380px] bg-on-surface p-6 md:p-12 flex flex-col justify-between relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6 md:mb-10">
              <div className="w-8 h-8 bg-primary rounded-sm flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-xl font-bold">rocket_launch</span>
              </div>
              <span className="text-xl font-black tracking-tighter text-surface uppercase">Vuducom</span>
            </div>
            
            <div className="space-y-4">
              <h1 className="text-3xl md:text-5xl font-black text-surface tracking-tighter leading-none text-balance">
                Email Automation.
              </h1>
              <p className="text-surface/60 text-xs md:text-sm font-bold tracking-tight max-w-[240px]">
                Enter your credentials to access the Vuducom email automation environment.
              </p>
            </div>
          </div>

          <div className="relative z-10 pt-8 md:pt-12 hidden sm:block">
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-primary text-2xl font-bold">verified_user</span>
              <p className="text-[10px] text-surface/50 font-bold uppercase tracking-[0.2em]">Secure Automation Workspace</p>
            </div>
          </div>

          {/* Abstract background elements */}
          <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-primary/20 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-1000"></div>
          <div className="absolute top-1/4 -left-10 w-32 h-32 bg-primary-container/10 rounded-full blur-2xl"></div>
        </div>

        {/* Right Form Side */}
        <div className="flex-1 p-6 md:p-12 bg-surface">
          <div className="mb-6 md:mb-10 flex justify-between items-end">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-1">Authorization required</p>
              <h2 className="text-2xl md:text-3xl font-black tracking-tighter text-on-surface uppercase">
                {isLogin ? "Sign In" : "Sign Up"}
              </h2>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {!isLogin && (
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="FULL NAME"
                    className="w-full bg-surface-container-low border-b border-outline-variant/30 px-4 py-3 text-sm font-bold tracking-tight focus:border-primary focus:outline-none transition-all placeholder:text-slate-300 placeholder:font-medium"
                  />
                </div>
              )}

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@vuducom.in"
                  className="w-full bg-surface-container-low border-b border-outline-variant/30 px-4 py-3 text-sm font-bold tracking-tight focus:border-primary focus:outline-none transition-all placeholder:text-slate-300 placeholder:font-medium"
                />
              </div>

              <div className="space-y-1.5 md:col-span-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={showPassword ? "PASSWORD" : "••••••••"}
                    className="w-full bg-surface-container-low border-b border-outline-variant/30 px-4 py-3 text-sm font-black focus:border-primary focus:outline-none transition-all placeholder:tracking-widest"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
              </div>

              {!isLogin && (
                <div className="space-y-1.5 md:col-span-1 animate-in slide-in-from-right-2 duration-300">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Confirm Password</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={showPassword ? "PASSWORD" : "••••••••"}
                    className="w-full bg-surface-container-low border-b border-outline-variant/30 px-4 py-3 text-sm font-black focus:border-primary focus:outline-none transition-all"
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="p-4 bg-error-container/10 border-l-2 border-error text-error text-[10px] font-bold uppercase tracking-tight leading-relaxed animate-shake">
                {error}
              </div>
            )}

            <div className="pt-6 space-y-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-on-surface text-surface text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary transition-all disabled:opacity-50 relative group overflow-hidden shadow-xl shadow-on-surface/10 rounded-sm"
              >
                <span className="relative z-10">{loading ? "Authenticating..." : isLogin ? "Sign In" : "Sign Up"}</span>
                <div className="absolute inset-0 bg-primary translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-in-out"></div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError(null);
                }}
                className="w-full text-center py-2 group"
              >
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest group-hover:text-on-surface transition-colors">
                  {isLogin ? "Need an account? " : "Already have an account? "}
                  <span className="text-primary group-hover:underline underline-offset-4 ml-1">
                    {isLogin ? "Sign Up" : "Sign In"}
                  </span>
                </p>
              </button>
            </div>
          </form>

          <p className="mt-12 text-[10px] font-bold text-slate-300 tracking-[0.1em] text-center uppercase">
            © 2026 Vuducom MailMerge
          </p>
        </div>
      </div>
    </div>
  );
}
