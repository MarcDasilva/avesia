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
import { projectsAPI } from "../lib/api";
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

  // Overshoot SDK integration for camera
  const {
    isActive: isOvershootActive,
    isConnecting: isOvershootConnecting,
    error: overshootError,
    start: startOvershoot,
    stop: stopOvershoot,
    videoRef: overshootVideoRef,
  } = useOvershootVision({
    onResult: (result, isJson, timestamp) => {
      // Results are automatically sent to backend via the hook
      // You can add custom handling here if needed
      console.log("Result received in ProjectView:", result);
    },
    onError: (error) => {
      console.error("Overshoot error in ProjectView:", error);
    },
  });

  // Overshoot SDK integration for video files
  const {
    isProcessing: isProcessingVideos,
    error: videoProcessingError,
    processVideoFile,
    stopAll: stopAllVideoProcessing,
    cleanup: cleanupVideoProcessing,
  } = useOvershootVideoFile();

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

  // Handle event config change (for Gmail, Text, Emergency)
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

  // Handle Overshoot camera activation
  const handleWebcamStart = async () => {
    let videoId = null;
    try {
      setIsDialogOpen(false);

      // CRITICAL: Add Overshoot camera to videos list FIRST so the video element gets rendered
      videoId = Date.now();
      setVideos((prev) => [...prev, { type: "overshoot", id: videoId }]);

      // Wait for React to render the video element (use requestAnimationFrame for better timing)
      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(resolve, 50); // Small additional delay
          });
        });
      });

      // Now start the camera - the video element should be in the DOM
      await startOvershoot();
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
  useEffect(() => {
    const processVideosWithOvershoot = async () => {
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
  }, [videos, isLoadingVideos, project.id, processVideoFile]);

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

  // Load nodes from MongoDB when project loads
  useEffect(() => {
    const loadNodes = async () => {
      try {
        const projectData = await projectsAPI.getById(project.id);

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
        console.error("Error loading nodes:", error);
      }
    };

    if (project.id) {
      loadNodes();
    }
  }, [project.id, handleNodeTypeChange, handleNodeDescriptionChange]);

  // Save nodes to MongoDB
  const handleSaveNodes = useCallback(async () => {
    try {
      // Convert React Flow format to UserNodes format
      const userNodesData = reactFlowToUserNodes(nodes, edges);

      // Save to MongoDB via API
      await projectsAPI.saveNodes(project.id, userNodesData);

      alert("Nodes saved successfully!");
    } catch (error) {
      console.error("Error saving nodes:", error);
      alert(`Failed to save nodes: ${error.message}`);
    }
  }, [nodes, edges, project.id]);

  // Cleanup webcam and video processing on unmount
  useEffect(() => {
    return () => {
      if (webcamStream) {
        webcamStream.getTracks().forEach((track) => track.stop());
      }
      // Cleanup video file processing
      cleanupVideoProcessing();
      // Note: We don't need to revoke URLs for backend videos
      // Only revoke blob URLs if we add any
    };
  }, [webcamStream, cleanupVideoProcessing]);

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
          <h1 className="text-2xl font-semibold text-white">{project.name}</h1>
        </div>
        <Button
          onClick={handleSaveNodes}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          Save Nodes
        </Button>
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
              <div
                className={`flex ${
                  videos.length === 1 ? "justify-center" : "justify-start"
                } items-center gap-4 h-full p-4 overflow-x-auto`}
              >
                {videos.map((video, index) => (
                  <div
                    key={index}
                    className={`flex items-center gap-3 ${
                      videos.length > 1 ? "flex-1" : ""
                    }`}
                    style={
                      videos.length > 1 ? { maxWidth: "calc(50% - 8px)" } : {}
                    }
                  >
                    <div
                      className="relative bg-gray-900 rounded-lg overflow-hidden border-2 border-gray-600 shadow-lg video-container"
                      style={{
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
                              minHeight: "300px",
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
                    className="px-3 py-2 mb-2 bg-gray-900 border-2 rounded cursor-move hover:bg-gray-800 transition-colors"
                    style={{ borderColor }}
                  >
                    <div className="text-white text-xs font-medium">
                      {nodeType.label}
                    </div>
                    <div className="text-gray-400 text-xs mt-1">
                      {nodeType.description}
                    </div>
                  </div>
                );
              })}
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
