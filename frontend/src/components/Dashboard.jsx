import React from "react";
import "../index.css";
import { AppSidebar } from "./app-sidebar";
import { SiteHeader } from "./site-header";
import { SidebarProvider, SidebarInset } from "./ui/sidebar";
import { useAuth } from "../contexts/AuthContext";

export function Dashboard() {
  const { user, signOut } = useAuth();

  // Get user data for the sidebar
  const userData = {
    name: user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User",
    email: user?.email || "",
    avatar: user?.user_metadata?.avatar_url || "/avatars/shadcn.jpg",
  };

  // Apply dark theme to body
  React.useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, []);

  return (
    <div className="dark">
      <SidebarProvider>
        <AppSidebar user={userData} onSignOut={signOut} />
        <SidebarInset>
          <SiteHeader />
          <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
            {/* Dashboard content will go here */}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
