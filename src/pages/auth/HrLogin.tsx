import { apiFetch } from "@/utils/api";
import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowRight, Lock, Unlock, User, Globe } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { useNavigate } from "react-router-dom";

import { hasGodMode } from "@/utils/pbac";

export default function HrLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        if (res.data.user.role === "HR" || hasGodMode(res.data.user)) {
          login(res.data.user);
          navigate("/hr");
        } else {
          setError(
            "Access denied. This portal is strictly for Human Resources personnel.",
          );
        }
      } else {
        setError(res.error || "Login failed");
      }
    } catch (err) {
      setError("A network error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] flex items-center justify-center p-4 font-sans relative overflow-hidden">
      {/* Visit Public Website top-right button */}
      <div className="absolute top-6 right-6 md:top-8 md:right-8 z-20">
        <a
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/90 hover:bg-stone-50 border border-stone-200/80 backdrop-blur-md rounded-full text-[11px] font-bold uppercase tracking-widest text-stone-700 transition-all shadow-sm active:scale-95 group"
        >
          <Globe className="w-4 h-4 text-stone-400 group-hover:text-stone-600 transition-colors" />
          <span>Visit Public Website</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform text-stone-400 group-hover:text-stone-600" />
        </a>
      </div>

      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-brand/5 to-transparent -z-10" />
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-brand/5 rounded-full blur-3xl opacity-50 -z-10" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-stone-100 rounded-full blur-3xl opacity-50 -z-10" />

      <div className="max-w-md w-full">
        <div className="text-center mb-10">
          <a
            href="/"
            className="inline-flex items-center justify-center w-20 h-20 mb-6 drop-shadow-md hover:scale-105 transition-transform cursor-pointer"
          >
            <img
              src="/logo.png"
              alt="Paving Joss Logo"
              className="w-20 h-20 object-contain drop-shadow-sm"
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
            />
          </a>
          <h1 className="text-xl font-light text-stone-900 tracking-tight">
            Human Resources
          </h1>
          <p className="text-stone-500 mt-2 text-sm tracking-wide">
            Secure Organization Portal
          </p>
        </div>

        <div className="bg-white border border-stone-100 rounded-3xl p-8 shadow-2xl shadow-stone-200/50 animate-in fade-in zoom-in duration-300">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 text-brand text-xs font-semibold rounded-xl text-center animate-in fade-in zoom-in duration-200">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Employee ID
              </label>
              <Input
                icon={<User className="w-4 h-4" />}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter HR username"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Secure Passcode
              </label>
              <div className="relative">
                <Input
                  icon={<Lock className="w-4 h-4" />}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors cursor-pointer flex items-center justify-center outline-none"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <Unlock className="w-4 h-4" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-brand text-white font-bold text-[10px] uppercase tracking-[0.2em] rounded-[1.25rem] hover:bg-brand-dark transition-all flex items-center justify-center gap-2 group shadow-xl shadow-red-900/20 active:scale-[0.98] disabled:opacity-50 mt-4 cursor-pointer"
            >
              {isLoading ? "Authenticating..." : "Sign In"}{" "}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
