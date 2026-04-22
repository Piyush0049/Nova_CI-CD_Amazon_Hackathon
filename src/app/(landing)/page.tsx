"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Bot,
  Sparkles,
  Zap,
  Shield,
  Globe,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  Star,
  LogIn,
  UserPlus,
  GitBranch
} from "lucide-react";
import Button from "@/components/ui/Button";
import ThemeToggle from "@/components/ThemeToggle";

export default function LandingPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/app");
    }
  }, [status, router]);

  const features = [
    {
      icon: <Sparkles className="w-6 h-6" />,
      title: "AI-Powered Generation",
      description:
        "Claude 4.6 Sonnet AI analyzes your repository and generates optimized pipelines automatically.",
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: "Lightning Fast Setup",
      description:
        "Generate production-ready pipelines in seconds. No manual YAML configuration needed.",
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Secure & Reliable",
      description:
        "GitHub OAuth integration with encrypted secrets. Your code and credentials stay safe.",
    },
    {
      icon: <Globe className="w-6 h-6" />,
      title: "Multi-Stack Support",
      description:
        "Works with Node.js, Python, Docker, Go, and more. Detects your tech stack automatically.",
    },
    {
      icon: <TrendingUp className="w-6 h-6" />,
      title: "Best Practices Built-in",
      description:
        "Pipelines include testing, linting, security scans, and deployment stages by default.",
    },
    {
      icon: <Bot className="w-6 h-6" />,
      title: "Smart Configuration",
      description:
        "AI understands your project structure and generates context-aware pipeline configurations.",
    },
  ];

  const useCases = [
    "Automatically generate pipelines for Next.js, React, and Node.js projects",
    "Create Python CI/CD with testing, linting, and deployment stages",
    "Docker multi-stage builds with security scanning included",
    "Full-stack pipelines with separate frontend and backend jobs",
    "Kubernetes and container deployment configurations",
    "Customizable YAML that you can review and modify",
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
                <GitBranch className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-cyan-500 to-cyan-600 bg-clip-text text-transparent">
                NerveFlow CI/CD
              </span>
            </Link>

            <div className="flex items-center gap-4">
              <ThemeToggle />
              <Button
                variant="ghost"
                onClick={() => router.push("/login")}
                className="hidden sm:flex text-sm font-medium"
              >
                Login
              </Button>
              <Button
                onClick={() => router.push("/signup")}
                className="bg-primary text-primary-foreground text-sm font-medium px-5"
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Powered by Claude 4.6 Sonnet
            </div>

            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
              Generate CI/CD pipelines
              <br />
              <span className="text-primary">powered by AI</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Connect your GitHub repositories and let Claude 4.6 Sonnet AI automatically
              generate optimized CI/CD pipelines tailored to your project.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Button
                size="lg"
                onClick={() => router.push("/signup")}
                className="bg-primary text-primary-foreground px-8 h-12 text-base font-semibold rounded-xl"
              >
                Start free trial
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="px-8 h-12 text-base font-semibold rounded-xl"
                onClick={() => {
                  const el = document.getElementById('features');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Learn more
              </Button>
            </div>

            <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground pt-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span>GitHub OAuth integration</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span>Free to use</span>
              </div>
            </div>
          </div>

          <div className="max-w-5xl mx-auto mt-16">
            <div className="aspect-video rounded-2xl border bg-muted/30 flex items-center justify-center shadow-sm">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-background border flex items-center justify-center mx-auto shadow-sm">
                  <GitBranch className="w-8 h-8 text-primary" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">Pipeline Generation Demo Coming Soon</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-muted/20 border-y">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Everything you need
            </h2>
            <p className="text-muted-foreground">
              Powerful tools to automate your browser tasks with the latest AI technology.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {features.map((feature, index) => (
              <div
                key={index}
                className="p-8 rounded-2xl border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-6">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-bold mb-3">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-24">
        <div className="container mx-auto px-6">
          <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
            <div className="space-y-8 text-left">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
                Built for modern
                <span className="text-primary block">development workflows</span>
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                From simple web apps to complex microservices, our AI generates production-ready pipelines. Connect your GitHub and get started in minutes.
              </p>
              <Button
                onClick={() => router.push("/signup")}
                size="lg"
                className="bg-primary text-primary-foreground px-6 h-12 font-semibold"
              >
                Try it now
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>

            <div className="grid gap-3">
              {useCases.map((useCase, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:border-primary/30 transition-colors shadow-sm"
                >
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium">{useCase}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Simplified CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto bg-primary rounded-3xl p-12 text-center text-primary-foreground">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to automate your CI/CD?
          </h2>
          <p className="text-lg opacity-90 mb-10 max-w-xl mx-auto">
            Join developers worldwide who are generating pipelines with AI-powered intelligence.
          </p>
          <Button
            onClick={() => router.push("/signup")}
            size="lg"
            variant="secondary"
            className="px-10 h-14 text-lg font-bold rounded-xl"
          >
            Create your account
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </section>

      {/* Simple Footer */}
      <footer className="border-t py-12 px-6">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg">
                <GitBranch className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold tracking-tight">CI/CD Platform</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              © 2024 CI/CD Platform. Powered by Claude 4.6 Sonnet AI.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
