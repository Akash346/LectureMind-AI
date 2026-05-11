"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useFacultyStore } from "@/lib/faculty/store";

export function FacultySignoutButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const reset = useFacultyStore((state) => state.reset);

  async function signout() {
    await fetch("/api/faculty/signout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId })
    });
    window.localStorage.removeItem("lecturemind_faculty_session");
    reset();
    router.push("/");
  }

  return (
    <Button variant="outline" onClick={() => void signout()}>
      <LogOut className="h-4 w-4" />
      Sign out
    </Button>
  );
}
