import React, { useState, useCallback, useRef } from "react";
import { IconChevronLeft, IconPlus } from "@tabler/icons-react";
import { Button } from "./ui/button";
import { ParticleCard } from "./MagicBento";
import "./MagicBento.css";
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
          <div className="p-4 h-full flex items-center justify-center">
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
                onClick={() => {
                  // Handle click - add functionality here
                  console.log("Plus button clicked");
                }}
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
    </div>
  );
}
