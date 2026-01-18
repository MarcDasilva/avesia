import React, { useState, useEffect } from "react";
import { Routes, Route, useParams, useNavigate } from "react-router-dom";
import "../index.css";
import "../App.css";
import { AppSidebar } from "./app-sidebar";
import { SiteHeader } from "./site-header";
import { SidebarProvider, SidebarInset } from "./ui/sidebar";
import { useAuth } from "../contexts/AuthContext";
import { ProjectsGrid } from "./ProjectsGrid";
import { ProjectView } from "./ProjectView";
import { projectsAPI } from "../lib/api";

// ProjectView wrapper to handle URL params
function ProjectViewWrapper({ projects }) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const project = projects.find((p) => p.id === projectId);

  const handleBack = () => {
    navigate("/");
  };

  if (!project) {
    return <div className="text-white p-4">Project not found</div>;
  }

  return <ProjectView project={project} onBack={handleBack} />;
}

export function Dashboard() {
  const { user, signOut } = useAuth();
  const [isFadingIn, setIsFadingIn] = useState(true);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  // Fetch projects from MongoDB when user is loaded
  useEffect(() => {
    const fetchProjects = async () => {
      if (!user) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const fetchedProjects = await projectsAPI.getAll();
        setProjects(fetchedProjects);
      } catch (err) {
        console.error('Error fetching projects:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [user]);

  const handleCreateProject = async (projectName) => {
    try {
      const newProject = await projectsAPI.create(projectName);
      setProjects([...projects, newProject]);
    } catch (err) {
      console.error('Error creating project:', err);
      setError(err.message);
      throw err; // Re-throw so the UI can handle it
    }
  };

  const handleDeleteProject = async (projectId) => {
    try {
      await projectsAPI.delete(projectId);
      setProjects(projects.filter((p) => p.id !== projectId));
    } catch (err) {
      console.error('Error deleting project:', err);
      setError(err.message);
      alert(`Failed to delete project: ${err.message}`);
    }
  };

  const handleSelectProject = (project) => {
    // Navigation is handled by ProjectsGrid using useNavigate
  };

  const handleProjectsRefresh = async () => {
    if (!user) return;
    
    try {
      const fetchedProjects = await projectsAPI.getAll();
      setProjects(fetchedProjects);
    } catch (err) {
      console.error('Error refreshing projects:', err);
    }
  };

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
        <SidebarInset style={{ marginLeft: "16rem", minWidth: 0 }}>
          <SiteHeader />
          <div 
            className="flex flex-1 flex-col gap-4 p-4 pt-0" 
            style={{ 
              overflow: "auto", 
              position: "relative",
              width: "100%",
              maxWidth: "100%",
              boxSizing: "border-box",
              overflowX: "hidden",
              minWidth: 0,
            }}
          >
            <Routes>
              <Route
                path="/"
                element={
                  <ProjectsGrid
                    projects={projects}
                    onCreateProject={handleCreateProject}
                    onSelectProject={handleSelectProject}
                    onDeleteProject={handleDeleteProject}
                    onProjectsRefresh={handleProjectsRefresh}
                  />
                }
              />
              <Route
                path="/project/:projectId"
                element={<ProjectViewWrapper projects={projects} />}
              />
            </Routes>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
