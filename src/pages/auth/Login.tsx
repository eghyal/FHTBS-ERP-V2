import { apiFetch } from "@/utils/api";
import React, { useState } from "react";
import { useAuth, Role } from "@/contexts/AuthContext";
import { getRolePolicies, Action } from "@/utils/pbac";
import {
  Lock,
  Unlock,
  User,
  ArrowRight,
  ShieldCheck,
  Briefcase,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [isTokenExchange, setIsTokenExchange] = useState(false);
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>("ENGINEERING");
  const [level, setLevel] = useState<"STAFF" | "MANAGER">("STAFF");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setIsLoading(true);

    try {
      if (isTokenExchange) {
        const res = await apiFetch("/api/auth/exchange-token", {
          method: "POST",
          body: JSON.stringify({ token, password }),
        });

        if (res.ok) {
          setMessage(res.data.message || "Account created! You can now login.");
          setIsTokenExchange(false);
          setIsLogin(true);
          setToken("");
          setPassword("");
        } else {
          setError(res.error || "Token exchange failed");
        }
      } else if (isLogin) {
        const res = await apiFetch("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ username, password }),
        });

        if (res.ok) {
          login(res.data.user, res.data.token);
        } else {
          setError(res.error || "Login failed");
        }
      } else {
        const res = await apiFetch("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({ username, password, role, level, name }),
        });

        if (res.ok) {
          setMessage(res.data.message || "Account created successfully.");
          if (res.data.user) {
            login(res.data.user);
          } else {
            setIsLogin(true);
            setPassword("");
          }
        } else {
          setError(res.error || "Registration failed");
        }
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

      {/* Elegant background elements */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-stone-100 to-transparent -z-10" />
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-stone-100 rounded-full blur-3xl opacity-50 -z-10" />
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
            Enterprise Portal
          </h1>
          <p className="text-stone-500 mt-2 text-sm tracking-wide">
            Secure access to your project workspace
          </p>
        </div>

        <div className="bg-white border border-stone-100 rounded-3xl p-8 shadow-2xl shadow-stone-200/50">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs font-medium rounded-xl text-center animate-in fade-in zoom-in duration-200">
                {error}
              </div>
            )}
            {message && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-medium rounded-xl text-center animate-in fade-in zoom-in duration-200">
                {message}
              </div>
            )}

            {isTokenExchange && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                  Onboarding Token
                </label>
                <Input
                  icon={<Unlock className="w-4 h-4" />}
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Enter 13-character token"
                  required
                />
              </div>
            )}

            {!isTokenExchange && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                  Username
                </label>
                <Input
                  icon={<User className="w-4 h-4" />}
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  required
                />
              </div>
            )}

            {!isLogin && !isTokenExchange && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                  Full Name
                </label>
                <Input
                  icon={<User className="w-4 h-4" />}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Password {isTokenExchange ? "(New Account Password)" : ""}
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

            {!isLogin && !isTokenExchange && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                    Department Role
                  </label>
                  <Select
                    icon={<Briefcase className="w-4 h-4" />}
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    required
                  >
                    <option value="ENGINEERING">Engineering</option>
                    <option value="PURCHASING">Purchasing</option>
                    <option value="WAREHOUSE">Warehouse</option>
                    <option value="PRODUCTION">Production</option>
                    <option value="SALES">Sales</option>
                    <option value="HR">Human Resources</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                    Level
                  </label>
                  <Select
                    icon={<ShieldCheck className="w-4 h-4 text-stone-500" />}
                    value={level}
                    onChange={(e) => setLevel(e.target.value as any)}
                    required
                  >
                    <option value="STAFF">Staff</option>
                    <option value="MANAGER">Manager</option>
                  </Select>
                </div>
              </div>
            )}

            {!isLogin && !isTokenExchange && (
              <div className="bg-stone-50 border border-stone-100 rounded-2xl p-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-4 h-4 text-stone-500" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
                    Access Preview
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(getRolePolicies()[role] || []).map((action) => (
                    <span
                      key={action}
                      className="px-2 py-0.5 bg-stone-200/50 text-stone-600 text-[9px] font-mono rounded-md uppercase"
                    >
                      {action.replace(/_/g, " ")}
                    </span>
                  ))}
                  {(getRolePolicies()[role] || []).length === 0 && (
                    <span className="text-xs text-stone-400 italic">
                      No special actions assigned by default.
                    </span>
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-stone-800 text-white font-bold text-[10px] uppercase tracking-[0.2em] rounded-[1.25rem] hover:bg-stone-900 transition-all flex items-center justify-center gap-2 group shadow-xl shadow-stone-900/10 active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading
                ? "Processing..."
                : isTokenExchange
                  ? "Activate Account"
                  : isLogin
                    ? "Sign In"
                    : "Request Account"}{" "}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
        </div>

        <div className="mt-8 flex flex-col items-center space-y-4 text-center text-sm font-medium">
          <button
            type="button"
            onClick={() => {
              if (isTokenExchange) {
                setIsTokenExchange(false);
                setIsLogin(true);
              } else {
                setIsLogin(!isLogin);
              }
              setError("");
              setMessage("");
            }}
            className="text-stone-500 hover:text-stone-900 transition-colors"
          >
            {isTokenExchange
              ? "Back to Login"
              : isLogin
                ? "Don't have an account? Request one"
                : "Already have an account? Sign in"}
          </button>

          {!isTokenExchange && (
            <button
              type="button"
              onClick={() => {
                setIsTokenExchange(true);
                setIsLogin(false);
                setError("");
                setMessage("");
              }}
              className="text-stone-400 hover:text-emerald-700 transition-colors font-bold text-xs"
            >
              Have an Onboarding Token?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
