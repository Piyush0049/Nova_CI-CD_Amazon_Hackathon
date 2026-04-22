"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bot, Loader2, Mail, Lock } from "lucide-react";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const res = await signIn("credentials", {
                redirect: false,
                email,
                password,
            });

            if (res?.error) {
                setError(res.error);
            } else {
                router.push("/");
                router.refresh();
            }
        } catch {
            setError("An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="dark min-h-screen bg-[#0a0a0a] text-foreground flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary/20 blur-[120px] mix-blend-screen opacity-50" aria-hidden="true" />
            <div className="hero-gradient absolute inset-0 opacity-20 pointer-events-none" aria-hidden="true" />

            <div className="w-full max-w-md z-10 animate-fade-in-up">
                {/* Logo */}
                <div className="flex justify-center mb-8">
                    <Link href="/" className="relative group flex items-center justify-center w-16 h-16 rounded-2xl glass-dark border border-white/10 shadow-xl transition-transform duration-300 hover:scale-105 hover:border-primary/50">
                        <Bot className="w-8 h-8 text-primary group-hover:text-primary transition-colors" />
                        <div className="absolute inset-0 bg-primary/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
                    </Link>
                </div>

                {/* Card */}
                <div className="glass-dark border border-white/5 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-50" />

                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-cyan-500 to-blue-600 bg-clip-text text-transparent mb-2">Welcome to NerveFlow CI/CD</h2>
                        <p className="text-[13px] text-muted-foreground">Connect your GitHub account to get started</p>
                    </div>

                    <div className="space-y-6">
                        {/* Primary GitHub Login Button */}
                        <button
                            type="button"
                            onClick={() => signIn("github", { callbackUrl: "/app" })}
                            className="w-full py-4 px-6 flex items-center justify-center gap-3 bg-gradient-to-r from-gray-900 to-gray-800 text-white font-bold rounded-xl text-[15px] hover:from-gray-800 hover:to-gray-700 transition-all shadow-xl shadow-gray-900/50 hover:shadow-2xl hover:-translate-y-0.5 border border-white/10"
                        >
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd"/>
                            </svg>
                            Continue with GitHub
                        </button>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-border/50"></div>
                            </div>
                            <div className="relative flex justify-center text-[11px] uppercase tracking-wider font-semibold">
                                <span className="bg-[#0a0a0a] px-2 text-muted-foreground mix-blend-normal">Other sign in options</span>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => signIn("google", { callbackUrl: "/" })}
                            className="w-full py-3 px-4 flex items-center justify-center gap-3 bg-white/5 border border-white/10 text-foreground font-semibold rounded-xl text-[14px] hover:bg-white/10 transition-all shadow-sm"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            Continue with Google
                        </button>

                        <details className="group">
                            <summary className="cursor-pointer text-center text-[13px] text-muted-foreground hover:text-foreground transition-colors list-none">
                                <span className="inline-flex items-center gap-1">
                                    Sign in with credentials
                                    <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </span>
                            </summary>
                            <div className="mt-4">
                                <form onSubmit={handleSubmit} className="space-y-6">
                                    {error && (
                                        <div className="p-3 text-[13px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
                                            {error}
                                        </div>
                                    )}

                                    <div className="space-y-4">
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                <Mail className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                            </div>
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder="name@example.com"
                                                className="w-full pl-11 pr-4 py-3 bg-background/50 border border-border/50 rounded-xl text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                                                required
                                            />
                                        </div>

                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                <Lock className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                            </div>
                                            <input
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="••••••••"
                                                className="w-full pl-11 pr-4 py-3 bg-background/50 border border-border/50 rounded-xl text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full py-3 px-4 flex items-center justify-center bg-primary text-primary-foreground font-semibold rounded-xl text-[14px] shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:pointer-events-none disabled:transform-none"
                                    >
                                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign In"}
                                    </button>
                                </form>
                            </div>
                        </details>
                    </div>

                    <div className="mt-8 text-center text-[13px] text-muted-foreground">
                        Don&apos;t have an instance?{" "}
                        <Link href="/signup" className="text-primary hover:text-primary/80 font-semibold transition-colors">
                            Deploy one now
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
