import { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AuthProvider from "@/components/AuthProvider";

export const metadata: Metadata = {
  title: "AI Internet Operator - Automate Your Web Tasks",
  description: "The most powerful AI agent for web automation",
};

export default async function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthProvider>{children}</AuthProvider>;
}
