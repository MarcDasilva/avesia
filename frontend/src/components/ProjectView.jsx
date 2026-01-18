import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  IconChevronLeft,
  IconPlus,
  IconVideo,
  IconFile,
} from "@tabler/icons-react";
import { Button } from "./ui/button";
import { ParticleCard } from "./MagicBento";
import "./MagicBento.css";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { projectsAPI } from "../lib/api";

// Custom node component
const CustomNode = ({ data, selected }) => {
  return (
    <div
      className={`px-4 py-2 shadow-lg rounded border-2 ${
        selected ? "border-white bg-gray-800" : "border-gray-600 bg-gray-900"
      }`}
      style={{ minWidth: "120px" }}
    >
      <div className="text-white font-semibold text-sm">{data.label}</div>
      {data.description && (
        <div className="text-gray-400 text-xs mt-1">{data.description}</div>
      )}
    </div>
  );
};

// Initial nodes and edges
const initialNodes = [
  {
    id: "1",
    type: "custom",
    position: { x: 250, y: 100 },
    data: { label: "Start Node", description: "Flow entry point" },
  },
];

const initialEdges = [];

export function ProjectView({ project, onBack }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [nodeId, setNodeId] = useState(2);
  const reactFlowWrapper = useRef(null);

  // Video and dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [videos, setVideos] = useState([]); // Array of video sources (file URLs or camera streams)
  const [webcamStream, setWebcamStream] = useState(null);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [hoveredVideoIndex, setHoveredVideoIndex] = useState(null);
  const [isLoadingVideos, setIsLoadingVideos] = useState(true);
  const fileInputRef = useRef(null);
  const videoRefs = useRef({}); // Refs for video elements to control playback
  const blobUrlsRef = useRef([]); // Track blob URLs for cleanup

  const onConnect = useCallback(
    (params) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#ffffff",
            },
          },
          eds
        )
      );
    },
    [setEdges]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const type = event.dataTransfer.getData("application/reactflow");

      // Check if the dropped element is valid
      if (typeof type === "undefined" || !type) {
        return;
      }

      const position = {
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      };

      const newNode = {
        id: `${nodeId}`,
        type: "custom",
        position,
        data: {
          label: `Node ${nodeId}`,
          description: "Custom node",
        },
      };

      setNodes((nds) => nds.concat(newNode));
      setNodeId((id) => id + 1);
    },
    [nodeId, setNodes]
  );

  // Node palette items that can be dragged
  const paletteNodeTypes = [
    { type: "custom", label: "Custom Node", description: "Buildable node" },
  ];

  // Define node types for ReactFlow
  const flowNodeTypes = {
    custom: CustomNode,
  };

  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  // Handle file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if it's a video file (mp4, webm, etc.)
    if (file.type.startsWith("video/")) {
      try {
        console.log("Uploading video:", file.name, file.type);
        // Upload to backend
        const uploadResult = await projectsAPI.uploadVideo(project.id, file);
        console.log("Upload result:", uploadResult);

        // Small delay to ensure MongoDB update is committed
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Reload videos from backend to get the new video with proper blob URL
        const projectData = await projectsAPI.getById(project.id);
        console.log("Project data after upload:", projectData);
        console.log("Does projectData have videos?", "videos" in projectData);
        console.log("Full projectData keys:", Object.keys(projectData));
        const projectVideos = projectData.videos || [];
        console.log(
          "Videos after upload:",
          projectVideos.length,
          projectVideos
        );

        // Convert backend video data to frontend format with blob URLs
        const loadedVideos = await Promise.all(
          projectVideos.map(async (video) => {
            try {
              // Fetch video as blob with authentication and create blob URL
              const blobUrl = await projectsAPI.getVideoBlobUrl(
                project.id,
                video.id
              );
              blobUrlsRef.current.push(blobUrl);
              return {
                type: "file",
                url: blobUrl,
                name: video.filename,
                videoId: video.id,
              };
            } catch (error) {
              console.error(`Error loading video ${video.id}:`, error);
              // Fallback to regular URL if blob fetch fails
              return {
                type: "file",
                url: projectsAPI.getVideoUrl(project.id, video.id),
                name: video.filename,
                videoId: video.id,
              };
            }
          })
        );

        setVideos(loadedVideos);
        setIsDialogOpen(false);
      } catch (error) {
        console.error("Error uploading video:", error);
        alert(`Failed to upload video: ${error.message}`);
      }
    } else {
      alert("Please select a video file (mp4, webm, etc.)");
    }
  };

  // Handle webcam activation
  const handleWebcamStart = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      setWebcamStream(stream);
      setIsWebcamActive(true);
      setIsDialogOpen(false);

      // Add webcam to videos list
      setVideos((prev) => [...prev, { type: "webcam", stream: stream }]);
    } catch (error) {
      console.error("Error accessing webcam:", error);
      alert("Unable to access webcam. Please ensure permissions are granted.");
    }
  };

  // Handle webcam stop
  const stopWebcam = () => {
    if (webcamStream) {
      webcamStream.getTracks().forEach((track) => track.stop());
      setWebcamStream(null);
      setIsWebcamActive(false);
      setVideos((prev) => prev.filter((v) => v.type !== "webcam"));
    }
  };

  // Load videos from backend when project is loaded
  useEffect(() => {
    const loadVideos = async () => {
      setIsLoadingVideos(true);

      // Cleanup previous blob URLs
      blobUrlsRef.current.forEach((url) => {
        if (url.startsWith("blob:")) {
          URL.revokeObjectURL(url);
        }
      });
      blobUrlsRef.current = [];

      try {
        console.log("Loading videos for project:", project.id);
        const projectData = await projectsAPI.getById(project.id);
        console.log("Project data received:", projectData);
        console.log(
          "Full project data structure:",
          JSON.stringify(projectData, null, 2)
        );
        const projectVideos = projectData.videos || [];
        console.log("Videos found:", projectVideos.length, projectVideos);

        if (projectVideos.length === 0) {
          console.log("No videos found in project");
          setVideos([]);
          setIsLoadingVideos(false);
          return;
        }

        // Convert backend video data to frontend format with blob URLs
        const loadedVideos = await Promise.all(
          projectVideos.map(async (video) => {
            try {
              console.log(`Loading video: ${video.id} - ${video.filename}`);
              // Fetch video as blob with authentication and create blob URL
              const blobUrl = await projectsAPI.getVideoBlobUrl(
                project.id,
                video.id
              );
              console.log(`Video blob URL created for ${video.id}:`, blobUrl);
              blobUrlsRef.current.push(blobUrl);
              return {
                type: "file",
                url: blobUrl,
                name: video.filename,
                videoId: video.id,
              };
            } catch (error) {
              console.error(`Error loading video ${video.id} as blob:`, error);
              // Try using direct URL with authentication token in query param as fallback
              try {
                const { supabase } = await import("../lib/supabase.js");
                const {
                  data: { session },
                } = await supabase.auth.getSession();

                if (session?.user?.id) {
                  // Add user ID as query param for authentication
                  const videoUrl = `${projectsAPI.getVideoUrl(
                    project.id,
                    video.id
                  )}?userId=${session.user.id}`;
                  console.log(`Using fallback URL for ${video.id}:`, videoUrl);
                  return {
                    type: "file",
                    url: videoUrl,
                    name: video.filename,
                    videoId: video.id,
                  };
                }
              } catch (fallbackError) {
                console.error(`Error creating fallback URL:`, fallbackError);
              }

              // Last resort: regular URL (may fail due to auth, but worth trying)
              return {
                type: "file",
                url: projectsAPI.getVideoUrl(project.id, video.id),
                name: video.filename,
                videoId: video.id,
              };
            }
          })
        );

        console.log("Loaded videos:", loadedVideos);
        setVideos(loadedVideos);
      } catch (error) {
        console.error("Error loading videos:", error);
        setVideos([]);
      } finally {
        setIsLoadingVideos(false);
      }
    };

    if (project.id) {
      loadVideos();
    }

    // Cleanup blob URLs on unmount or when project changes
    return () => {
      blobUrlsRef.current.forEach((url) => {
        if (url.startsWith("blob:")) {
          URL.revokeObjectURL(url);
        }
      });
      blobUrlsRef.current = [];
    };
  }, [project.id]);

  // Function to play video with fallback to muted if needed
  const playVideoWithFallback = async (videoElement) => {
    try {
      // Try to play with sound first
      videoElement.muted = false;
      await videoElement.play();
    } catch (error) {
      // If autoplay with sound is blocked, try muted
      try {
        videoElement.muted = true;
        await videoElement.play();
      } catch (mutedError) {
        // Autoplay may be blocked by browser policy
        console.log("Autoplay prevented:", mutedError);
      }
    }
  };

  // Cleanup webcam on unmount
  useEffect(() => {
    return () => {
      if (webcamStream) {
        webcamStream.getTracks().forEach((track) => track.stop());
      }
      // Note: We don't need to revoke URLs for backend videos
      // Only revoke blob URLs if we add any
    };
  }, [webcamStream]);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header with back button */}
      <div className="flex items-center gap-4 p-4 border-b border-gray-700">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8"
        >
          <IconChevronLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold text-white">{project.name}</h1>
      </div>

      {/* Two horizontal rectangles - each taking half the screen */}
      <div
        className="flex flex-col h-full"
        style={{ height: "calc(100vh - 80px)" }}
      >
        {/* Top rectangle - 50% of screen */}
        <div
          className="w-full border-b border-gray-700"
          style={{ height: "50%", overflow: "auto" }}
        >
          <div className="p-4 h-full">
            {/* Display videos if any */}
            {isLoadingVideos ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-white">Loading videos...</div>
              </div>
            ) : videos.length > 0 ? (
              <div className="flex flex-wrap justify-center items-center gap-6 h-full p-4">
                {videos.map((video, index) => (
                  <div
                    key={index}
                    className="relative bg-gray-900 rounded-lg overflow-hidden border-2 border-gray-600 shadow-lg video-container"
                    style={{
                      maxWidth: "600px",
                      width: "100%",
                      aspectRatio: "16/9",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onMouseEnter={() => setHoveredVideoIndex(index)}
                    onMouseLeave={() => setHoveredVideoIndex(null)}
                  >
                    {video.type === "file" ? (
                      <video
                        ref={(el) => {
                          videoRefs.current[`video-${index}`] = el;
                          if (el) {
                            // Ensure video plays when element is mounted
                            const playVideo = async () => {
                              await playVideoWithFallback(el);
                            };

                            // If video is already loaded, play immediately
                            if (el.readyState >= 2) {
                              playVideo();
                            } else {
                              // Otherwise, wait for video to load
                              const handleCanPlay = () => {
                                playVideo();
                                el.removeEventListener(
                                  "canplay",
                                  handleCanPlay
                                );
                              };
                              el.addEventListener("canplay", handleCanPlay);
                            }
                          }
                        }}
                        src={video.url}
                        controls={hoveredVideoIndex === index}
                        autoPlay
                        playsInline
                        className="w-full h-full object-contain"
                      >
                        Your browser does not support the video tag.
                      </video>
                    ) : video.type === "webcam" && video.stream ? (
                      <video
                        ref={(el) => {
                          if (el && video.stream) {
                            el.srcObject = video.stream;
                          }
                        }}
                        autoPlay
                        playsInline
                        className="w-full h-full object-contain"
                      >
                        Your browser does not support the video tag.
                      </video>
                    ) : null}
                    {video.type === "webcam" && (
                      <button
                        onClick={stopWebcam}
                        className="absolute top-3 right-3 bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 text-sm shadow-lg z-10"
                      >
                        Stop Camera
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <ParticleCard
                  className="magic-bento-card magic-bento-card--border-glow"
                  style={{
                    backgroundColor: "#060010",
                    "--glow-color": "255, 255, 255",
                    cursor: "pointer",
                    width: "400px",
                    maxWidth: "100%",
                  }}
                  clickEffect={true}
                  enableMagnetism={true}
                >
                  <div
                    onClick={() => setIsDialogOpen(true)}
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
                    <span className="text-white text-sm text-center px-2">
                      Add Pre-Recorded or Live Footage
                    </span>
                  </div>
                </ParticleCard>
              </div>
            )}
          </div>
        </div>

        {/* Bottom rectangle - 50% of screen with React Flow */}
        <div className="w-full" style={{ height: "50%" }}>
          <div className="h-full flex">
            {/* Node palette sidebar */}
            <div
              className="border-r border-gray-700 p-4 bg-gray-950"
              style={{ width: "200px", minWidth: "200px" }}
            >
              <h3 className="text-white font-semibold mb-3 text-sm">
                Node Palette
              </h3>
              {paletteNodeTypes.map((nodeType) => (
                <div
                  key={nodeType.type}
                  draggable
                  onDragStart={(e) => onDragStart(e, nodeType.type)}
                  className="px-3 py-2 mb-2 bg-gray-800 border border-gray-600 rounded cursor-move hover:bg-gray-700 transition-colors"
                >
                  <div className="text-white text-xs font-medium">
                    {nodeType.label}
                  </div>
                  <div className="text-gray-400 text-xs mt-1">
                    {nodeType.description}
                  </div>
                </div>
              ))}
            </div>

            {/* React Flow canvas */}
            <div
              ref={reactFlowWrapper}
              className="w-full h-full bg-gray-950"
              style={{ height: "100%" }}
            >
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onDrop={onDrop}
                onDragOver={onDragOver}
                nodeTypes={flowNodeTypes}
                fitView
                className="bg-gray-950"
                colorMode="dark"
              >
                <Background color="#374151" gap={16} />
                <Controls />
              </ReactFlow>
            </div>
          </div>
        </div>
      </div>

      {/* Dialog for choosing video source */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Video Source</DialogTitle>
            <DialogDescription>
              Choose how you want to add video footage
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <Button
              variant="outline"
              onClick={handleWebcamStart}
              className="flex items-center gap-2 justify-start h-auto py-4"
            >
              <IconVideo className="h-5 w-5" />
              <div className="flex flex-col items-start">
                <span className="font-semibold">Web Camera</span>
                <span className="text-xs text-muted-foreground">
                  Use your live camera feed
                </span>
              </div>
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 justify-start h-auto py-4"
            >
              <IconFile className="h-5 w-5" />
              <div className="flex flex-col items-start">
                <span className="font-semibold">File Upload</span>
                <span className="text-xs text-muted-foreground">
                  Upload an MP4 video file
                </span>
              </div>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
