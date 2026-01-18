import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ParticleCard, GlobalSpotlight } from "./MagicBento";
import "./MagicBento.css";
import { IconPlus, IconTrash, IconPhoto } from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { projectsAPI } from "../lib/api";

export function ProjectsGrid({
  projects,
  onCreateProject,
  onSelectProject,
  onDeleteProject,
  onProjectsRefresh,
}) {
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const gridRef = useRef(null);
  const [userId, setUserId] = useState(null);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(null);
  const fileInputRefs = useRef({});

  // Get userId from session
  useEffect(() => {
    const getUserId = async () => {
      try {
        const { supabase } = await import("../lib/supabase.js");
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user?.id) {
          setUserId(session.user.id);
        }
      } catch (error) {
        console.error("Error getting user ID:", error);
      }
    };
    getUserId();
  }, []);

  const handleCreateClick = () => {
    setIsDialogOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (projectName.trim()) {
      onCreateProject(projectName.trim());
      setProjectName("");
      setIsDialogOpen(false);
    }
  };

  const handleThumbnailUpload = async (projectId, event) => {
    event.stopPropagation();
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if it's an image file
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    setUploadingThumbnail(projectId);
    try {
      await projectsAPI.uploadThumbnail(projectId, file);
      // Refresh projects list
      if (onProjectsRefresh) {
        await onProjectsRefresh();
      } else {
        // Fallback: refresh using API
        const updatedProjects = await projectsAPI.getAll();
        // Update projects via parent (would need callback)
      }
      alert("Thumbnail uploaded successfully!");
    } catch (error) {
      console.error("Error uploading thumbnail:", error);
      alert(`Failed to upload thumbnail: ${error.message}`);
    } finally {
      setUploadingThumbnail(null);
      // Reset file input
      if (fileInputRefs.current[projectId]) {
        fileInputRefs.current[projectId].value = "";
      }
    }
  };

  const handleThumbnailButtonClick = (projectId, event) => {
    event.stopPropagation();
    if (fileInputRefs.current[projectId]) {
      fileInputRefs.current[projectId].click();
    }
  };

  return (
    <>
      <GlobalSpotlight
        gridRef={gridRef}
        disableAnimations={false}
        enabled={true}
        spotlightRadius={50}
        glowColor="255, 255, 255"
      />
      <div
        ref={gridRef}
        className="card-grid bento-section projects-grid"
        style={{
          gridTemplateColumns: "repeat(3, 1fr)",
        }}
      >
        {projects.map((project) => (
          <ParticleCard
            key={project.id}
            className="magic-bento-card magic-bento-card--border-glow"
            style={{
              backgroundColor: "#060010",
              "--glow-color": "255, 255, 255",
              cursor: "pointer",
            }}
            clickEffect={true}
            enableMagnetism={true}
          >
            <div
              onClick={() => navigate(`/project/${project.id}`)}
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Thumbnail image - lower section */}
              {project.thumbnailFilename && userId ? (
                <img
                  src={`${projectsAPI.getThumbnailUrl(
                    project.id
                  )}?userId=${userId}`}
                  alt={project.name}
                  style={{
                    width: "100%",
                    height: "60%",
                    objectFit: "cover",
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    zIndex: 0,
                  }}
                  onError={(e) => {
                    // Hide image if it fails to load
                    e.target.style.display = "none";
                  }}
                />
              ) : null}

              {/* Overlay gradient for text readability at top */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: "50%",
                  background:
                    "linear-gradient(to bottom, rgba(6, 0, 16, 0.95) 0%, rgba(6, 0, 16, 0.7) 50%, transparent 100%)",
                  zIndex: 1,
                }}
              />

              <div
                className="magic-bento-card__content"
                style={{ position: "relative", zIndex: 2 }}
              >
                <h2 className="magic-bento-card__title">{project.name}</h2>
                <p className="magic-bento-card__description">Click to open</p>
              </div>

              {/* Thumbnail upload button */}
              <button
                onClick={(e) => handleThumbnailButtonClick(project.id, e)}
                className="absolute bottom-2 left-2 p-1.5 rounded hover:bg-gray-800 transition-colors text-white hover:text-blue-400 bg-gray-900 bg-opacity-70"
                style={{ zIndex: 10 }}
                title="Upload thumbnail image"
                disabled={uploadingThumbnail === project.id}
              >
                {uploadingThumbnail === project.id ? (
                  <span className="text-xs">Uploading...</span>
                ) : (
                  <IconPhoto size={18} />
                )}
              </button>

              {/* Hidden file input for thumbnail upload */}
              <input
                ref={(el) => (fileInputRefs.current[project.id] = el)}
                type="file"
                accept="image/*"
                onChange={(e) => handleThumbnailUpload(project.id, e)}
                style={{ display: "none" }}
              />

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (
                    window.confirm(
                      `Are you sure you want to delete "${project.name}"?`
                    )
                  ) {
                    onDeleteProject(project.id);
                  }
                }}
                className="absolute top-2 right-2 p-1.5 rounded hover:bg-gray-800 transition-colors text-white hover:text-red-400"
                style={{ zIndex: 10 }}
                title="Delete project"
              >
                <IconTrash size={18} />
              </button>
            </div>
          </ParticleCard>
        ))}

        {/* Create Project Card - part of the grid */}
        <ParticleCard
          className="magic-bento-card magic-bento-card--border-glow"
          style={{
            backgroundColor: "#060010",
            "--glow-color": "255, 255, 255",
            cursor: "pointer",
          }}
          clickEffect={true}
          enableMagnetism={true}
        >
          <div
            onClick={handleCreateClick}
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
            }}
          >
            <IconPlus className="text-white" size={32} />
            <span className="text-white text-sm">Create Project</span>
          </div>
        </ParticleCard>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Enter a name for your new project
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Project Name</Label>
                <Input
                  id="name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="My Project"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
