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
  const fileInputRef = useRef(null);

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
  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if it's a video file (mp4, webm, etc.)
    if (file.type.startsWith("video/")) {
      const videoUrl = URL.createObjectURL(file);
      setVideos((prev) => [
        ...prev,
        { type: "file", url: videoUrl, name: file.name },
      ]);

      // TODO: Upload file to backend/database
      // const formData = new FormData();
      // formData.append("video", file);
      // formData.append("projectId", project.id);
      // await uploadVideoToBackend(formData);

      setIsDialogOpen(false);
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

  // Cleanup webcam on unmount
  useEffect(() => {
    return () => {
      if (webcamStream) {
        webcamStream.getTracks().forEach((track) => track.stop());
      }
      // Clean up file URLs
      videos.forEach((video) => {
        if (video.type === "file" && video.url) {
          URL.revokeObjectURL(video.url);
        }
      });
    };
  }, []);

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
            {videos.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 h-full">
                {videos.map((video, index) => (
                  <div
                    key={index}
                    className="relative bg-black rounded overflow-hidden"
                  >
                    {video.type === "file" ? (
                      <video
                        src={video.url}
                        controls
                        className="w-full h-full object-contain"
                        style={{ maxHeight: "100%" }}
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
                        style={{ maxHeight: "100%" }}
                      >
                        Your browser does not support the video tag.
                      </video>
                    ) : null}
                    {video.type === "webcam" && (
                      <button
                        onClick={stopWebcam}
                        className="absolute top-2 right-2 bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 text-sm"
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
