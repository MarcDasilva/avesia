import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  IconChevronLeft,
  IconPlus,
  IconVideo,
  IconFile,
  IconChartBar,
  IconSparkles,
} from "@tabler/icons-react";
import { Button } from "./ui/button";
import { ParticleCard } from "./MagicBento";
import "./MagicBento.css";
import { useOvershootVision } from "../hooks/useOvershootVision";
import { useOvershootVideoFile } from "../hooks/useOvershootVideoFile";
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
import { projectsAPI, overshootAPI } from "../lib/api";
import {
  ConditionNode,
  ListenerNode,
  EventNode,
  AccessoryNode,
} from "./nodeComponents";
import {
  ConditionOptions,
  ListenerOptions,
  EventOptions,
  AccessoryOptions,
} from "../lib/nodeOptions";
import {
  canConnectNodes,
  reactFlowToUserNodes,
  userNodesToReactFlow,
} from "../lib/nodeUtils";

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

// Initial nodes and edges (empty - will load from MongoDB)
const initialNodes = [];
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

  // Project prompt state - fetched from MongoDB nodes
  const [projectPrompt, setProjectPrompt] = useState(null);
  const [projectOutputSchema, setProjectOutputSchema] = useState(null);
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);

  // View state - switch between Nodes and Analytics
  const [currentView, setCurrentView] = useState("nodes"); // "nodes" or "analytics"
  const [analyticsEvents, setAnalyticsEvents] = useState([]);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  // Clip video player state
  const [isClipDialogOpen, setIsClipDialogOpen] = useState(false);
  const [selectedClip, setSelectedClip] = useState(null);
  const [clipVideoUrl, setClipVideoUrl] = useState(null);

  // Handle opening clip video player
  const handleClipClick = useCallback(
    async (event) => {
      if (!event.clipId) return;

      setSelectedClip(event);

      // Get userId for clip URL
      try {
        const { supabase } = await import("../lib/supabase.js");
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user?.id) {
          const clipUrl = `${projectsAPI.getClipUrl(
            project.id,
            event.clipId
          )}?userId=${session.user.id}`;
          setClipVideoUrl(clipUrl);
          setIsClipDialogOpen(true);
        } else {
          // Fallback without userId (might not work but won't crash)
          setClipVideoUrl(projectsAPI.getClipUrl(project.id, event.clipId));
          setIsClipDialogOpen(true);
        }
      } catch (error) {
        console.error("Error getting clip URL:", error);
        // Fallback
        setClipVideoUrl(projectsAPI.getClipUrl(project.id, event.clipId));
        setIsClipDialogOpen(true);
      }
    },
    [project.id]
  );

  // AI prompt parsing state
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isParsingPrompt, setIsParsingPrompt] = useState(false);
  const [aiError, setAiError] = useState(null);

  // Overshoot SDK integration for camera - uses project-specific prompt
  const {
    isActive: isOvershootActive,
    isConnecting: isOvershootConnecting,
    error: overshootError,
    start: startOvershoot,
    stop: stopOvershoot,
    videoRef: overshootVideoRef,
  } = useOvershootVision({
    prompt: projectPrompt,
    outputSchema: projectOutputSchema,
    projectId: project.id, // CRITICAL: Pass project ID for email alerts and prompt isolation
    onResult: (result, isJson, timestamp) => {
      // Results are automatically sent to backend via the hook
      // Log immediately for visibility
      console.log(`📊 ProjectView Result [${timestamp}]:`, result);
    },
    onError: (error) => {
      console.error("❌ Overshoot error in ProjectView:", error);
    },
  });

  // Overshoot SDK integration for video files
  // Pass project-specific prompt and outputSchema to video processing
  const {
    isProcessing: isProcessingVideos,
    error: videoProcessingError,
    processVideoFile,
    stopAll: stopAllVideoProcessing,
    cleanup: cleanupVideoProcessing,
  } = useOvershootVideoFile(projectPrompt, projectOutputSchema, project.id); // CRITICAL: Pass project ID

  // Handle node type change from dropdown
  const handleNodeTypeChange = useCallback((nodeId, newType) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          const updatedData = { ...node.data };
          // Use the correct field name based on node type
          if (node.type === "condition") {
            updatedData.condition_type = newType;
          } else if (node.type === "listener") {
            updatedData.listener_type = newType;
          } else if (node.type === "event") {
            updatedData.event_type = newType;
          }
          return {
            ...node,
            data: updatedData,
          };
        }
        return node;
      })
    );
  }, []);

  // Handle node description change
  const handleNodeDescriptionChange = useCallback((nodeId, newDescription) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              description: newDescription,
            },
          };
        }
        return node;
      })
    );
  }, []);

  // Handle event config change (for Email, Text, Emergency)
  const handleEventConfigChange = useCallback((nodeId, config) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              ...config,
            },
          };
        }
        return node;
      })
    );
  }, []);

  const onConnect = useCallback(
    (params) => {
      // Validate connection based on node types
      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);

      if (sourceNode && targetNode) {
        if (!canConnectNodes(sourceNode, targetNode)) {
          alert(
            `Invalid connection: ${sourceNode.type} cannot connect to ${targetNode.type}. Only Condition→Listener, Listener→Event, and Listener→Accessory are allowed.`
          );
          return;
        }

        // Additional validation: Condition can only connect to ONE listener
        if (sourceNode.type === "condition") {
          const existingEdges = edges.filter((e) => e.source === params.source);
          if (existingEdges.length > 0) {
            alert("Condition can only be connected to one Listener.");
            return;
          }
        }
      }

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
    [nodes, edges, setEdges]
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

      // Generate unique ID for new node
      const newNodeId = `node_${Date.now()}_${nodeId}`;

      // Create node based on type (matching HTML structure)
      let newNode;
      if (type === "condition") {
        newNode = {
          id: newNodeId,
          type: "condition",
          position,
          data: {
            name: `condition_${nodeId}`,
            condition_type: ConditionOptions[0] || "custom",
            description: "",
            onTypeChange: handleNodeTypeChange,
            onDescriptionChange: handleNodeDescriptionChange,
          },
        };
      } else if (type === "listener") {
        newNode = {
          id: newNodeId,
          type: "listener",
          position,
          data: {
            name: `listener_${nodeId}`,
            listener_type: ListenerOptions[0] || "custom",
            description: "",
            onTypeChange: handleNodeTypeChange,
            onDescriptionChange: handleNodeDescriptionChange,
          },
        };
      } else if (type === "event") {
        newNode = {
          id: newNodeId,
          type: "event",
          position,
          data: {
            name: `event_${nodeId}`,
            event_type: EventOptions[0] || "Text",
            recipient: "",
            number: "",
            message: "",
            onTypeChange: handleNodeTypeChange,
            onConfigChange: handleEventConfigChange,
          },
        };
      } else if (type === "accessory") {
        newNode = {
          id: newNodeId,
          type: "accessory",
          position,
          data: {
            name: `accessory_${nodeId}`,
            accessory_type: AccessoryOptions[0] || "Smart Light Bulb",
            onTypeChange: handleNodeTypeChange,
          },
        };
      } else {
        // Fallback for custom node type
        newNode = {
          id: newNodeId,
          type: "custom",
          position,
          data: {
            label: `Node ${nodeId}`,
            description: "Custom node",
          },
        };
      }

      setNodes((nds) => nds.concat(newNode));
      setNodeId((id) => id + 1);
    },
    [
      nodeId,
      setNodes,
      handleNodeTypeChange,
      handleNodeDescriptionChange,
      handleEventConfigChange,
    ]
  );

  // Node palette items that can be dragged
  const paletteNodeTypes = [
    {
      type: "condition",
      label: "Condition",
      description: "Triggers on conditions",
    },
    { type: "listener", label: "Listener", description: "Monitors events" },
    { type: "event", label: "Event", description: "Sends notifications" },
    {
      type: "accessory",
      label: "Accessory",
      description: "Smart home devices",
    },
  ];

  // Define node types for ReactFlow
  const flowNodeTypes = {
    custom: CustomNode,
    condition: ConditionNode,
    listener: ListenerNode,
    event: EventNode,
    accessory: AccessoryNode,
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

        // Reload videos from backend to get the new video with direct streaming URL
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

        // Convert backend video data to frontend format with direct streaming URLs (YouTube-style)
        const { supabase } = await import("../lib/supabase.js");
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const loadedVideos = await Promise.all(
          projectVideos.map(async (video) => {
            try {
              if (!session?.user?.id) {
                throw new Error("Unauthorized: User ID required");
              }

              // Use direct URL with query param for authentication (YouTube-style streaming)
              const videoUrl = `${projectsAPI.getVideoUrl(
                project.id,
                video.id
              )}?userId=${session.user.id}`;

              console.log(
                `Using direct streaming URL for ${video.id}:`,
                videoUrl
              );

              return {
                type: "file",
                url: videoUrl,
                name: video.filename,
                videoId: video.id,
              };
            } catch (error) {
              console.error(`Error loading video ${video.id}:`, error);
              // Fallback to regular URL if auth fails
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

        // Reset file input so it can be clicked again
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } catch (error) {
        console.error("Error uploading video:", error);
        alert(`Failed to upload video: ${error.message}`);
      }
    } else {
      alert("Please select a video file (mp4, webm, etc.)");
    }
  };

  // Handle Overshoot camera activation - optimized for fastest connection
  const handleWebcamStart = async () => {
    let videoId = null;
    try {
      setIsDialogOpen(false);

      // CRITICAL: Don't wait for prompt - start connection immediately
      // Prompt can be updated while connecting if needed
      // Use default prompt if not ready yet (will update when prompt loads)
      if (!projectPrompt && !isLoadingPrompt) {
        console.warn("No prompt available, using default");
        setProjectPrompt(
          "Analyze the video feed and detect any relevant objects or events."
        );
      }

      // If prompt is still loading, start with default - it will update when ready
      // This prevents delay in connection start

      // CRITICAL: Add Overshoot camera to videos list FIRST so the video element gets rendered
      videoId = Date.now();
      setVideos((prev) => [...prev, { type: "overshoot", id: videoId }]);

      // Start Overshoot immediately - don't wait for React render
      // The SDK will handle video element setup internally, but starting early is faster
      // Use single requestAnimationFrame for minimal delay (one frame instead of two)
      requestAnimationFrame(() => {
        startOvershoot().catch((error) => {
          console.error("Error starting Overshoot vision:", error);
          // Remove the video entry if start failed
          if (videoId !== null) {
            setVideos((prev) =>
              prev.filter((v) => v.type !== "overshoot" || v.id !== videoId)
            );
          }
          alert(
            error.message ||
              "Unable to start camera processing. Please check console for details."
          );
        });
      });

      // Don't await - let it start in background for fastest connection
      return;
    } catch (error) {
      console.error("Error starting Overshoot vision:", error);
      // Remove the video entry if start failed
      if (videoId !== null) {
        setVideos((prev) =>
          prev.filter((v) => v.type !== "overshoot" || v.id !== videoId)
        );
      }
      alert(
        error.message ||
          "Unable to start camera processing. Please check console for details."
      );
    }
  };

  // Handle Overshoot camera stop
  const stopWebcam = async () => {
    try {
      await stopOvershoot();
      setVideos((prev) => prev.filter((v) => v.type !== "overshoot"));
    } catch (error) {
      console.error("Error stopping Overshoot vision:", error);
    }
  };

  // Load videos from backend when project is loaded
  useEffect(() => {
    const loadVideos = async () => {
      setIsLoadingVideos(true);

      // No blob URL cleanup needed - using direct streaming URLs now

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

        // Convert backend video data to frontend format with direct streaming URLs (YouTube-style)
        // Filter out videos that can't be loaded (e.g., missing files)
        const loadedVideosResults = await Promise.allSettled(
          projectVideos.map(async (video) => {
            try {
              console.log(`Loading video: ${video.id} - ${video.filename}`);

              // Get session for authentication
              const { supabase } = await import("../lib/supabase.js");
              const {
                data: { session },
              } = await supabase.auth.getSession();

              if (!session?.user?.id) {
                throw new Error("Unauthorized: User ID required");
              }

              // Use direct URL with query param for authentication (YouTube-style streaming)
              const videoUrl = `${projectsAPI.getVideoUrl(
                project.id,
                video.id
              )}?userId=${session.user.id}`;

              console.log(
                `Using direct streaming URL for ${video.id}:`,
                videoUrl
              );

              return {
                type: "file",
                url: videoUrl,
                name: video.filename,
                videoId: video.id,
              };
            } catch (error) {
              console.error(`Error loading video ${video.id}:`, error);

              // If video file doesn't exist (404), throw error to filter it out
              if (
                error.message?.includes("Not Found") ||
                error.message?.includes("404")
              ) {
                throw new Error(`Video file not found: ${video.filename}`);
              }

              throw error;
            }
          })
        );

        // Filter out failed video loads (e.g., missing files) and keep only successful ones
        const loadedVideos = loadedVideosResults
          .filter((result) => result.status === "fulfilled")
          .map((result) => result.value);

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

    // No cleanup needed - using direct streaming URLs now
  }, [project.id]);

  // Track which videos have been processed to avoid re-processing
  const processedVideoIdsRef = useRef(new Set());

  // Process videos with Overshoot SDK when they're loaded
  // CRITICAL: Wait for project prompt to be loaded before processing videos
  useEffect(() => {
    const processVideosWithOvershoot = async () => {
      // Don't process if prompt is still loading (we need project-specific prompt)
      if (isLoadingPrompt) {
        console.log(
          "⏳ Waiting for project prompt before processing videos..."
        );
        return;
      }

      // Ensure we have a prompt before processing videos
      if (!projectPrompt) {
        console.warn(
          "⚠️ No project prompt available, skipping video processing"
        );
        return;
      }

      // Only process file videos (not overshoot camera feeds)
      const fileVideos = videos.filter(
        (video) => video.type === "file" && video.videoId
      );

      if (fileVideos.length === 0) {
        return;
      }

      // Filter out videos that have already been processed
      const videosToProcess = fileVideos.filter(
        (video) => !processedVideoIdsRef.current.has(video.videoId)
      );

      if (videosToProcess.length === 0) {
        return; // All videos already processed
      }

      console.log(
        `Processing ${videosToProcess.length} new video(s) with Overshoot SDK...`
      );
      console.log(`📝 Using project prompt: "${projectPrompt}"`);

      // Process each video with Overshoot SDK
      for (const video of videosToProcess) {
        try {
          console.log(
            `[${video.name}] Fetching video file for Overshoot processing...`
          );

          // Get session for authentication
          const { supabase } = await import("../lib/supabase.js");
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!session?.user?.id) {
            console.warn(
              `[${video.name}] Skipping Overshoot processing: Unauthorized`
            );
            continue;
          }

          // Fetch the video as a blob
          const videoUrl = `${projectsAPI.getVideoUrl(
            project.id,
            video.videoId
          )}?userId=${session.user.id}`;
          const response = await fetch(videoUrl);

          if (!response.ok) {
            console.error(
              `[${video.name}] Failed to fetch video for processing: ${response.statusText}`
            );
            continue;
          }

          const blob = await response.blob();

          // Convert blob to File object (Overshoot SDK expects File)
          // Extract filename from video name or use a default
          const filename = video.name || `video-${video.videoId}.mp4`;
          const videoFile = new File([blob], filename, {
            type: blob.type || "video/mp4",
          });

          console.log(`[${video.name}] Starting Overshoot processing...`);

          // Mark video as being processed
          processedVideoIdsRef.current.add(video.videoId);

          // Process video file with Overshoot SDK (non-blocking)
          processVideoFile(videoFile, video.videoId, video.name).catch(
            (error) => {
              console.error(
                `[${video.name}] Error processing video with Overshoot:`,
                error
              );
              // Remove from processed set on error so it can be retried
              processedVideoIdsRef.current.delete(video.videoId);
            }
          );
        } catch (error) {
          console.error(
            `[${video.name}] Error setting up Overshoot processing:`,
            error
          );
        }
      }
    };

    if (videos.length > 0 && !isLoadingVideos) {
      processVideosWithOvershoot();
    }
  }, [
    videos,
    isLoadingVideos,
    project.id,
    processVideoFile,
    projectPrompt,
    projectOutputSchema,
    isLoadingPrompt,
  ]);

  // Function to play video with fallback to muted if needed
  // CRITICAL: This ensures continuous playback for Overshoot SDK frame capture
  const playVideoWithFallback = async (videoElement) => {
    if (!videoElement) return;

    try {
      // Ensure loop is set for continuous processing
      videoElement.loop = true;

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
        // Still ensure loop is set even if play fails
        videoElement.loop = true;
      }
    }
  };

  // Monitor video playback to ensure continuous processing
  useEffect(() => {
    if (!isProcessingVideos) return;

    // Set up periodic check to ensure all videos stay playing
    const playbackMonitor = setInterval(() => {
      Object.entries(videoRefs.current).forEach(([key, videoEl]) => {
        if (!videoEl || key.includes("overshoot")) return; // Skip Overshoot camera feed

        // Ensure loop is set
        if (!videoEl.loop) {
          videoEl.loop = true;
          console.log(`[Video ${key}] Enabled loop for continuous processing`);
        }

        // If video is paused and we're processing, resume it
        if (videoEl.paused && isProcessingVideos) {
          console.log(
            `[Video ${key}] Video paused - resuming for continuous processing`
          );
          playVideoWithFallback(videoEl).catch(() => {
            // Ignore errors
          });
        }

        // If video has ended, restart it immediately
        if (videoEl.ended) {
          console.log(
            `[Video ${key}] Video ended - restarting for continuous processing`
          );
          videoEl.currentTime = 0;
          playVideoWithFallback(videoEl).catch(() => {
            // Ignore errors
          });
        }
      });
    }, 1000); // Check every second

    return () => {
      clearInterval(playbackMonitor);
    };
  }, [isProcessingVideos, videoRefs]);

  // CRITICAL: Cleanup when project changes - stop all prompts to prevent overlap
  // Use a ref to track the previous project ID to avoid cleanup on initial mount
  const previousProjectIdRef = useRef(project.id);

  useEffect(() => {
    // Store current project ID
    const currentProjectId = project.id;

    // Only cleanup if project ID actually changed (not on initial mount)
    if (
      previousProjectIdRef.current !== null &&
      previousProjectIdRef.current !== currentProjectId
    ) {
      console.log(
        "🧹 Cleaning up Overshoot for previous project:",
        previousProjectIdRef.current
      );

      // Stop all processing gracefully - WebSocket errors during cleanup are expected and will be suppressed
      Promise.all([
        stopOvershoot().catch((err) => {
          // Suppress WebSocket errors during cleanup - they're expected when switching projects
          if (!err.message?.includes("WebSocket")) {
            console.warn("Error stopping Overshoot on cleanup:", err);
          }
        }),
        stopAllVideoProcessing().catch((err) => {
          // Suppress WebSocket errors during cleanup
          if (!err.message?.includes("WebSocket")) {
            console.warn("Error stopping video processing on cleanup:", err);
          }
        }),
      ]).finally(() => {
        cleanupVideoProcessing();

        // Reset prompt state to prevent old prompts from being used
        setProjectPrompt(null);
        setProjectOutputSchema(null);
      });
    }

    // Update ref for next render
    previousProjectIdRef.current = currentProjectId;
  }, [project.id]); // CRITICAL: Only depend on project.id, not the functions

  // Load nodes and prompt from MongoDB when project loads (parallel for speed)
  // Use ref to track if we've already loaded this project to prevent re-loading
  const loadedProjectIdRef = useRef(null);

  useEffect(() => {
    const loadProjectData = async () => {
      if (!project.id) return;

      // CRITICAL: Only stop and reload if this is a different project
      // Don't stop if we're already on this project (prevents camera from cutting off)
      const isNewProject = loadedProjectIdRef.current !== project.id;

      if (isNewProject) {
        // CRITICAL: Stop any existing prompts BEFORE loading new project
        // This ensures no prompt overlap when switching projects
        console.log(
          "🛑 Stopping existing prompts before loading NEW project:",
          project.id
        );
        await Promise.all([
          stopOvershoot().catch((err) => {
            // Suppress WebSocket errors - they're expected when stopping connections
            if (!err.message?.includes("WebSocket")) {
              console.warn("Warning stopping Overshoot:", err);
            }
          }),
          stopAllVideoProcessing().catch((err) => {
            // Suppress WebSocket errors during stop
            if (!err.message?.includes("WebSocket")) {
              console.warn("Warning stopping video processing:", err);
            }
          }),
        ]);
        cleanupVideoProcessing();

        // Small delay to ensure WebSocket connections are fully closed
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Clear old prompt state to ensure clean start
        setProjectPrompt(null);
        setProjectOutputSchema(null);
      } else {
        // Same project - just ensure prompt is loaded (don't stop camera)
        console.log("📋 Same project, skipping stop - keeping camera active");
      }

      // Mark this project as loaded
      loadedProjectIdRef.current = project.id;

      setIsLoadingPrompt(true);

      try {
        // Fetch project data and prompt in parallel for maximum speed
        const [projectData, promptData] = await Promise.all([
          projectsAPI.getById(project.id),
          projectsAPI.getProjectPrompt(project.id).catch((err) => {
            console.warn("Failed to fetch prompt, using default:", err);
            return {
              prompt:
                "Analyze the video feed and detect any relevant objects or events.",
              hasNodes: false,
              outputSchema: {},
              nodes: [],
            };
          }),
        ]);

        // Set prompt and output schema for Overshoot
        const finalPrompt =
          promptData.prompt ||
          "Analyze the video feed and detect any relevant objects or events.";
        console.log(`🎯 Project Prompt Loaded:`, finalPrompt);
        console.log(`📋 Output Schema:`, promptData.outputSchema);
        setProjectPrompt(finalPrompt);
        setProjectOutputSchema(promptData.outputSchema || null);
        setIsLoadingPrompt(false);

        // Load nodes for React Flow
        if (projectData.nodes && projectData.nodes.listeners) {
          const { nodes: loadedNodes, edges: loadedEdges } =
            userNodesToReactFlow(projectData.nodes);

          // Attach handlers based on node type
          const nodesWithHandlers = loadedNodes.map((node) => {
            const updatedData = {
              ...node.data,
              onTypeChange: handleNodeTypeChange,
            };

            if (node.type === "condition" || node.type === "listener") {
              updatedData.onDescriptionChange = handleNodeDescriptionChange;
            } else if (node.type === "event") {
              updatedData.onConfigChange = handleEventConfigChange;
            }

            return {
              ...node,
              data: updatedData,
            };
          });

          setNodes(nodesWithHandlers);
          setEdges(loadedEdges);

          // Update nodeId counter to avoid conflicts
          const maxId = Math.max(
            ...loadedNodes.map((n) => {
              const match = n.id.match(/\d+$/);
              return match ? parseInt(match[0]) : 0;
            }),
            0
          );
          setNodeId(maxId + 1);
        }
      } catch (error) {
        console.error("Error loading project data:", error);
        setIsLoadingPrompt(false);
        // Set default prompt on error
        setProjectPrompt(
          "Analyze the video feed and detect any relevant objects or events."
        );
        setProjectOutputSchema(null);
      }
    };

    loadProjectData();
    // CRITICAL: Only depend on project.id - don't include handlers that might change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // Save nodes to MongoDB
  const handleSaveNodes = useCallback(async () => {
    try {
      // Convert React Flow format to UserNodes format
      const userNodesData = reactFlowToUserNodes(nodes, edges);

      // Save to MongoDB via API
      await projectsAPI.saveNodes(project.id, userNodesData);

      // Refresh prompt after saving nodes (parallel for speed)
      const promptData = await projectsAPI
        .getProjectPrompt(project.id)
        .catch((err) => {
          console.warn("Failed to refresh prompt:", err);
          return {
            prompt:
              "Analyze the video feed and detect any relevant objects or events.",
            hasNodes: false,
            outputSchema: {},
            nodes: [],
          };
        });

      const finalPrompt =
        promptData.prompt ||
        "Analyze the video feed and detect any relevant objects or events.";
      console.log(`🎯 Prompt Updated After Save:`, finalPrompt);
      console.log(`📋 Updated Output Schema:`, promptData.outputSchema);
      setProjectPrompt(finalPrompt);
      setProjectOutputSchema(promptData.outputSchema || null);

      alert("Nodes saved successfully! Prompt updated.");
    } catch (error) {
      console.error("Error saving nodes:", error);
      alert(`Failed to save nodes: ${error.message}`);
    }
  }, [nodes, edges, project.id]);

  // Load analytics events
  const loadAnalytics = useCallback(async () => {
    setIsLoadingAnalytics(true);
    try {
      const data = await projectsAPI.getAnalytics(project.id);
      setAnalyticsEvents(data.events || []);
    } catch (error) {
      console.error("Error loading analytics:", error);
      setAnalyticsEvents([]);
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, [project.id]);

  // Handle view switch
  const handleViewSwitch = useCallback(
    (view) => {
      setCurrentView(view);
      if (view === "analytics") {
        loadAnalytics();
      }
    },
    [loadAnalytics]
  );

  // Handle AI prompt parsing
  const handleAiPromptParse = useCallback(async () => {
    if (!aiPrompt.trim()) {
      setAiError("Please enter a prompt");
      return;
    }

    setIsParsingPrompt(true);
    setAiError(null);

    try {
      console.log("🤖 Parsing AI prompt:", aiPrompt);
      
      // Call backend API to parse prompt
      const result = await overshootAPI.parsePrompt(aiPrompt);
      
      console.log("✅ AI Parse result:", result);
      
      if (!result.success || !result.nodes) {
        throw new Error(result.message || "Failed to parse prompt");
      }

      // Convert the parsed nodes to React Flow format
      const { nodes: newNodes, edges: newEdges } = userNodesToReactFlow(
        result.nodes,
        { x: 250, y: 100 }
      );

      // Attach handlers to the new nodes
      const nodesWithHandlers = newNodes.map((node) => {
        const updatedData = {
          ...node.data,
          onTypeChange: handleNodeTypeChange,
        };

        if (node.type === "condition" || node.type === "listener") {
          updatedData.onDescriptionChange = handleNodeDescriptionChange;
        } else if (node.type === "event") {
          updatedData.onConfigChange = handleEventConfigChange;
        }

        return {
          ...node,
          data: updatedData,
        };
      });

      // Add new nodes to existing nodes (don't replace)
      setNodes((existingNodes) => [...existingNodes, ...nodesWithHandlers]);
      setEdges((existingEdges) => [...existingEdges, ...newEdges]);

      // Update nodeId counter
      const maxId = Math.max(
        ...nodesWithHandlers.map((n) => {
          const match = n.id.match(/\d+$/);
          return match ? parseInt(match[0]) : 0;
        }),
        nodeId
      );
      setNodeId(maxId + 1);

      // Close dialog and reset state
      setIsAiDialogOpen(false);
      setAiPrompt("");
      
    } catch (error) {
      console.error("❌ Error parsing AI prompt:", error);
      setAiError(error.message || "Failed to parse prompt. Please try again.");
    } finally {
      setIsParsingPrompt(false);
    }
  }, [
    aiPrompt,
    nodeId,
    handleNodeTypeChange,
    handleNodeDescriptionChange,
    handleEventConfigChange,
  ]);

  // Cleanup webcam and video processing on unmount
  // Cleanup on unmount only - don't interfere with active camera
  useEffect(() => {
    return () => {
      // Only cleanup old webcamStream on unmount, not when it changes
      // The useOvershootVision hook manages its own stream cleanup
      if (webcamStream && !isOvershootActive) {
        webcamStream.getTracks().forEach((track) => {
          if (track.readyState !== "ended") {
            track.stop();
          }
        });
      }
      // Cleanup video file processing when component unmounts
      cleanupVideoProcessing();
      // Note: We don't need to revoke URLs for backend videos
      // Only revoke blob URLs if we add any
    };
  }, []); // CRITICAL: Empty deps - only cleanup on unmount, not during normal operation

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header with back button */}
      <div className="flex items-center justify-between gap-4 p-4 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="h-8 w-8"
          >
            <IconChevronLeft className="h-4 w-4" />
          </Button>
          <h1
            className="text-2xl font-semibold text-white"
            style={{ fontFamily: "Zalando Sans Expanded, sans-serif" }}
          >
            {project.name}
          </h1>
        </div>
      </div>

      {/* Two horizontal rectangles - each taking half the screen */}
      <div
        className="flex flex-col h-full"
        style={{ height: "calc(100vh - 80px)" }}
      >
        {/* Top rectangle - 50% of screen */}
        <div
          className="w-full border-b border-gray-700"
          style={{ height: "50%", overflow: "hidden" }}
        >
          <div className="p-4 h-full flex items-center justify-center">
            {/* Display videos if any */}
            {isLoadingVideos ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-white">Loading videos...</div>
              </div>
            ) : videos.length > 0 ? (
              <div
                className={`flex ${
                  videos.length === 1 ? "justify-center" : "justify-center"
                } items-center gap-4 h-full w-full`}
                style={{ maxHeight: "100%", overflow: "hidden" }}
              >
                {videos.map((video, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-center ${
                      videos.length > 1 ? "flex-1" : ""
                    }`}
                    style={{
                      maxWidth: videos.length > 1 ? "calc(50% - 8px)" : "100%",
                      maxHeight: "100%",
                      height: "100%",
                    }}
                  >
                    <div
                      className="relative bg-gray-900 rounded-lg overflow-hidden border-2 border-gray-600 shadow-lg video-container"
                      style={{
                        width: "100%",
                        maxWidth: "100%",
                        maxHeight: "100%",
                        aspectRatio: "16/9",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: "auto",
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

                              // CRITICAL: Ensure video loops for continuous processing
                              // Overshoot SDK needs continuous frames to process
                              el.loop = true;

                              // Handle video ended - restart immediately for continuous processing
                              const handleEnded = () => {
                                console.log(
                                  `[${video.name}] Video ended - restarting for continuous processing`
                                );
                                el.currentTime = 0;
                                playVideo().catch((err) => {
                                  console.warn(
                                    `[${video.name}] Failed to restart video:`,
                                    err
                                  );
                                });
                              };
                              el.addEventListener("ended", handleEnded);

                              // Handle video pause - resume if paused while processing
                              const handlePause = () => {
                                // Only auto-resume if Overshoot is processing this video
                                if (isProcessingVideos) {
                                  console.log(
                                    `[${video.name}] Video paused - resuming for continuous processing`
                                  );
                                  playVideo().catch(() => {
                                    // Ignore autoplay errors
                                  });
                                }
                              };
                              el.addEventListener("pause", handlePause);

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

                              // Store cleanup function
                              el._cleanupVideoListeners = () => {
                                el.removeEventListener("ended", handleEnded);
                                el.removeEventListener("pause", handlePause);
                              };
                            }
                          }}
                          src={video.url}
                          controls={hoveredVideoIndex === index}
                          autoPlay
                          playsInline
                          loop
                          className="w-full h-full object-contain"
                          style={{
                            maxWidth: "100%",
                            maxHeight: "100%",
                            width: "auto",
                            height: "auto",
                          }}
                        >
                          Your browser does not support the video tag.
                        </video>
                      ) : video.type === "overshoot" ? (
                        <div
                          className="w-full h-full relative bg-black"
                          style={{ minHeight: "300px" }}
                        >
                          <video
                            ref={overshootVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-contain"
                            style={{
                              width: "100%",
                              height: "100%",
                              maxHeight: "100%",
                              backgroundColor: "#000",
                              display: "block",
                            }}
                          >
                            Your browser does not support the video tag.
                          </video>
                          {overshootError && (
                            <div className="absolute top-2 left-2 bg-red-600 text-white px-3 py-1 rounded text-sm">
                              {overshootError}
                            </div>
                          )}
                          {isOvershootConnecting && (
                            <div className="absolute top-2 left-2 bg-yellow-600 text-white px-3 py-1 rounded text-sm">
                              Connecting...
                            </div>
                          )}
                          {isOvershootActive && (
                            <div className="absolute top-2 left-2 bg-green-600 text-white px-3 py-1 rounded text-sm">
                              Processing
                            </div>
                          )}
                        </div>
                      ) : null}
                      {video.type === "overshoot" && (
                        <button
                          onClick={stopWebcam}
                          className="absolute top-2 right-2 bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 text-sm"
                          disabled={isOvershootConnecting}
                        >
                          {isOvershootConnecting
                            ? "Stopping..."
                            : "Stop Camera"}
                        </button>
                      )}
                    </div>
                    {/* Plus button to add another video - only show if less than 2 videos */}
                    {videos.length < 2 && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log("Plus button clicked, opening dialog");
                          setIsDialogOpen(true);
                        }}
                        className="h-12 w-12 rounded-full bg-gray-800 border-2 border-gray-600 hover:bg-gray-700 hover:border-gray-500 text-white shrink-0"
                        title="Add another video"
                      >
                        <IconPlus className="h-6 w-6" />
                      </Button>
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
              
              {/* AI Create Nodes Button */}
              <div
                onClick={() => setIsAiDialogOpen(true)}
                className="px-2 py-1.5 mb-2 bg-gray-900 border-[3px] rounded cursor-pointer hover:bg-gray-800 transition-colors relative overflow-hidden"
                style={{
                  borderImage: "linear-gradient(90deg, #9333ea, #2563eb, #9333ea, #2563eb) 1",
                  borderImageSlice: 1,
                  animation: "gradient-shift 3s linear infinite",
                  backgroundSize: "200% 100%",
                }}
              >
                <style>{`
                  @keyframes gradient-shift {
                    0% { border-image-source: linear-gradient(90deg, #9333ea, #2563eb, #9333ea, #2563eb); }
                    50% { border-image-source: linear-gradient(90deg, #2563eb, #9333ea, #2563eb, #9333ea); }
                    100% { border-image-source: linear-gradient(90deg, #9333ea, #2563eb, #9333ea, #2563eb); }
                  }
                `}</style>
                <div className="flex items-center gap-1.5">
                  <IconSparkles size={14} className="text-purple-400" />
                  <div className="text-white text-xs font-medium">
                    AI Create
                  </div>
                </div>
                <div className="text-gray-400 text-[10px] mt-0.5">
                  Generate with AI
                </div>
              </div>
              
              {paletteNodeTypes.map((nodeType) => {
                // Get border color based on node type
                let borderColor = "#6b7280"; // Default gray
                if (nodeType.type === "condition") {
                  borderColor = "#e91e63"; // Pink/red
                } else if (nodeType.type === "listener") {
                  borderColor = "#2196F3"; // Blue
                } else if (nodeType.type === "event") {
                  borderColor = "#4caf50"; // Green
                } else if (nodeType.type === "accessory") {
                  borderColor = "#ff9800"; // Orange
                }

                return (
                  <div
                    key={nodeType.type}
                    draggable
                    onDragStart={(e) => onDragStart(e, nodeType.type)}
                    className="px-2 py-1.5 mb-2 bg-gray-900 border-2 rounded cursor-move hover:bg-gray-800 transition-colors"
                    style={{ borderColor }}
                  >
                    <div className="text-white text-xs font-medium">
                      {nodeType.label}
                    </div>
                    <div className="text-gray-400 text-[10px] mt-0.5">
                      {nodeType.description}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* React Flow canvas or Analytics view */}
            <div
              ref={reactFlowWrapper}
              className="w-full h-full bg-gray-950 relative"
              style={{ height: "100%" }}
            >
              {/* View toggle buttons - positioned top right */}
              <div className="absolute top-4 right-4 z-10 flex gap-2">
                {/* Analytics button */}
                <Button
                  onClick={() =>
                    handleViewSwitch(
                      currentView === "analytics" ? "nodes" : "analytics"
                    )
                  }
                  className={`rounded-none bg-black border-2 text-white hover:bg-gray-900 ${
                    currentView === "analytics"
                      ? "border-white"
                      : "border-gray-600"
                  }`}
                >
                  <IconChartBar className="h-4 w-4 mr-2" />
                  {currentView === "analytics"
                    ? "View Nodes"
                    : "View Analytics"}
                </Button>
                {/* Save Nodes button - only show in nodes view */}
                {currentView === "nodes" && (
                  <Button
                    onClick={handleSaveNodes}
                    className="rounded-none bg-black border-2 border-white text-white hover:bg-gray-900"
                  >
                    Save Nodes
                  </Button>
                )}
              </div>
              {currentView === "nodes" ? (
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
                  fitViewOptions={{
                    padding: 0.2, // Add 20% padding around nodes for better zoom out
                    minZoom: 0.1, // Allow zooming out more
                    maxZoom: 1.5, // Limit maximum zoom
                    duration: 400, // Smooth animation
                  }}
                  className="bg-gray-950"
                  colorMode="dark"
                >
                  <Background color="#374151" gap={16} />
                  <Controls />
                </ReactFlow>
              ) : (
                // Analytics view
                <div className="w-full h-full p-4 overflow-auto">
                  <div className="max-w-6xl mx-auto">
                    <h2 className="text-white text-2xl font-semibold mb-6">
                      Event History
                    </h2>
                    {isLoadingAnalytics ? (
                      <div className="text-white text-center py-8">
                        Loading events...
                      </div>
                    ) : analyticsEvents.length === 0 ? (
                      <div className="text-gray-400 text-center py-8">
                        No events recorded yet
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {analyticsEvents.map((event) => {
                          // Format timestamp
                          const eventTimestamp =
                            event.timestamp || event.createdAt;
                          const eventDate = eventTimestamp
                            ? new Date(eventTimestamp).toLocaleString()
                            : "Unknown time";

                          return (
                            <div
                              key={event.id}
                              onClick={() =>
                                event.clipId && handleClipClick(event)
                              }
                              className={`bg-gray-900 border border-gray-700 p-4 transition-colors ${
                                event.clipId
                                  ? "cursor-pointer hover:bg-gray-800 hover:border-white"
                                  : ""
                              }`}
                              style={{ borderRadius: 0 }}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    <div
                                      className="px-3 py-1 bg-blue-600 text-white text-xs font-medium"
                                      style={{ borderRadius: 0 }}
                                    >
                                      {event.listenerCategory
                                        ? event.listenerCategory
                                            .charAt(0)
                                            .toUpperCase() +
                                          event.listenerCategory
                                            .slice(1)
                                            .replace(/_/g, " ")
                                        : event.eventType === "email_alert"
                                        ? "Email Alert"
                                        : event.type || "Event"}
                                    </div>
                                    <span className="text-gray-400 text-sm">
                                      {eventDate}
                                    </span>
                                  </div>
                                  <div className="text-white font-medium mb-1">
                                    {event.description || "Event occurred"}
                                    {event.clipId && (
                                      <span className="text-gray-500 text-xs ml-2">
                                        (Click to view clip)
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-gray-400 text-sm space-y-1">
                                    {event.videoId && (
                                      <div>
                                        <span className="text-gray-500">
                                          Video ID:{" "}
                                        </span>
                                        <span className="text-gray-300">
                                          {event.videoId}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
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

      {/* Dialog for playing clip video */}
      <Dialog
        open={isClipDialogOpen}
        onOpenChange={(open) => {
          setIsClipDialogOpen(open);
          if (!open) {
            setClipVideoUrl(null);
            setSelectedClip(null);
          }
        }}
      >
        <DialogContent
          className="max-w-4xl bg-gray-950 border border-gray-700 p-0"
          style={{ borderRadius: 0 }}
        >
          <DialogHeader className="p-4 border-b border-gray-700">
            <DialogTitle className="text-white">
              {selectedClip?.description || "Event Clip"}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {selectedClip?.timestamp
                ? new Date(selectedClip.timestamp).toLocaleString()
                : "Event recording"}
            </DialogDescription>
          </DialogHeader>
          {clipVideoUrl && (
            <div className="p-4">
              <video
                controls
                autoPlay
                className="w-full"
                style={{ borderRadius: 0 }}
              >
                <source src={clipVideoUrl} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          )}
          <DialogFooter className="p-4 border-t border-gray-700">
            <Button
              variant="outline"
              onClick={() => setIsClipDialogOpen(false)}
              className="rounded-none"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog for AI prompt parsing */}
      <Dialog open={isAiDialogOpen} onOpenChange={setIsAiDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconSparkles className="h-5 w-5 text-purple-500" />
              AI Node Creator
            </DialogTitle>
            <DialogDescription>
              Describe what you want to detect and what actions to take. AI will
              create the nodes and connect them automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="ai-prompt" className="text-sm font-medium text-black">
                Your Automation Request
              </label>
              <textarea
                id="ai-prompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Example: Alert me via email when motion is detected at night"
                className="min-h-[120px] w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                disabled={isParsingPrompt}
              />
              <p className="text-xs text-gray-500 mt-1">
                Try: "Send me a text if a package is delivered" or "Notify
                security when someone enters the parking lot after hours"
              </p>
            </div>

            {aiError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                {aiError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAiDialogOpen(false);
                setAiPrompt("");
                setAiError(null);
              }}
              disabled={isParsingPrompt}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAiPromptParse}
              disabled={isParsingPrompt || !aiPrompt.trim()}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
            >
              {isParsingPrompt ? (
                <>
                  <span className="mr-2">Creating...</span>
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                </>
              ) : (
                <>
                  <IconSparkles size={16} className="mr-2" />
                  Create Nodes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
