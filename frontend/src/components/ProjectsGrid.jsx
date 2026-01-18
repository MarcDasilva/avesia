import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ParticleCard, GlobalSpotlight } from "./MagicBento";
import "./MagicBento.css";
import { IconPlus, IconTrash } from "@tabler/icons-react";
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

export function ProjectsGrid({
  projects,
  onCreateProject,
  onSelectProject,
  onDeleteProject,
}) {
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const gridRef = useRef(null);

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
              }}
            >
              <div className="magic-bento-card__content">
                <h2 className="magic-bento-card__title">{project.name}</h2>
                <p className="magic-bento-card__description">Click to open</p>
              </div>
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
