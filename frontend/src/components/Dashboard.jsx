import React, { useState, useEffect } from "react";
import "../index.css";
import "../App.css";
import { AppSidebar } from "./app-sidebar";
import { SiteHeader } from "./site-header";
import { SidebarProvider, SidebarInset } from "./ui/sidebar";
import { useAuth } from "../contexts/AuthContext";

export function Dashboard() {
  const { user, signOut } = useAuth();
  const [isFadingIn, setIsFadingIn] = useState(true);

  // Get user data for the sidebar
  const userData = {
    name: user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User",
    email: user?.email || "",
    avatar: user?.user_metadata?.avatar_url || "/avatars/shadcn.jpg",
  };

  // Apply dark theme to body and handle fade-in
  useEffect(() => {
    document.documentElement.classList.add("dark");
    
    // Start fade-in after a brief black screen (500ms)
    const timer = setTimeout(() => {
      setIsFadingIn(false);
    }, 500);

    return () => {
      clearTimeout(timer);
      document.documentElement.classList.remove("dark");
    };
  }, []);

  return (
    <div className="dark" style={{ position: "relative", width: "100%", height: "100vh" }}>
      {/* Black screen overlay for fade-in */}
      <div
        className={`fade-overlay ${isFadingIn ? "visible" : "fade-out"}`}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "#000000",
          zIndex: 9999,
          pointerEvents: isFadingIn ? "auto" : "none",
        }}
      />
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
