"use client";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <button
      onClick={handleLogout}
      className={`cursor-pointer hover:text-slate-100 transition-colors ${className}`}
    >
      Sign out
    </button>
  );
}
