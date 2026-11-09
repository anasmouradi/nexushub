"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="p-8">Chargement…</div>;
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r bg-muted/20 p-5 sm:block">
        <Link href="/dashboard" className="mb-8 block text-lg font-semibold">
          NexusHub
        </Link>
        <nav className="space-y-2 text-sm">
          <Link
            href="/dashboard"
            className="block rounded-md px-3 py-2 hover:bg-muted"
          >
            Dashboard
          </Link>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-5 py-3 sm:justify-end sm:gap-4">
          <span className="text-sm font-medium">{name || user.email}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await logout();
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Déconnexion impossible",
                );
              } finally {
                router.replace("/login");
              }
            }}
          >
            Déconnexion
          </Button>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
