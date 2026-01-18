/**
 * Node Utilities - Conversion and validation functions
 */

// Validate if two nodes can be connected
export function canConnectNodes(sourceNode, targetNode) {
  // Condition → Listener: ✅ Allowed
  if (sourceNode.type === "condition" && targetNode.type === "listener") {
    return true;
  }
  
  // Listener → Event: ✅ Allowed
  if (sourceNode.type === "listener" && targetNode.type === "event") {
    return true;
  }
  
  // Listener → Accessory: ✅ Allowed
  if (sourceNode.type === "listener" && targetNode.type === "accessory") {
    return true;
  }
  
  // All other connections: ❌ Blocked
  return false;
}

// Convert React Flow format to UserNodes format
export function reactFlowToUserNodes(nodes, edges) {
  const userNodesFormat = {
    listeners: [],
    total_listeners: 0,
  };

  // Find all listener nodes
  const listenerNodes = nodes.filter((n) => n.type === "listener");

  for (const listenerNode of listenerNodes) {
    const listenerData = {
      listener_id: listenerNode.id,
      listener_data: {
        name: listenerNode.data.name || `listener_${listenerNode.id}`,
        listener_type: listenerNode.data.listener_type || "custom",
        description: listenerNode.data.description || "", // Save description
      },
      listener_position: listenerNode.position, // Save listener position
      conditions: [],
      events: [],
    };

    // Find conditions connected to this listener
    const conditionEdges = edges.filter(
      (e) => e.target === listenerNode.id && e.source
    );
    for (const edge of conditionEdges) {
      const conditionNode = nodes.find((n) => n.id === edge.source);
      if (conditionNode && conditionNode.type === "condition") {
        listenerData.conditions.push({
          condition_id: conditionNode.id,
          condition_data: {
            name: conditionNode.data.name || `condition_${conditionNode.id}`,
            condition_type: conditionNode.data.condition_type || "custom",
            threshold: conditionNode.data.threshold,
            description: conditionNode.data.description || "", // Save description
          },
          position: conditionNode.position, // Save position
        });
      }
    }

    // Find events connected from this listener
    const eventEdges = edges.filter(
      (e) => e.source === listenerNode.id && e.target
    );
    for (const edge of eventEdges) {
      const eventNode = nodes.find((n) => n.id === edge.target);
      if (eventNode && eventNode.type === "event") {
        listenerData.events.push({
          event_id: eventNode.id,
          event_data: {
            name: eventNode.data.name || `event_${eventNode.id}`,
            event_type: eventNode.data.event_type || "Text",
            action: eventNode.data.action || "notification",
            message: eventNode.data.message,
            recipient: eventNode.data.recipient || "",
            number: eventNode.data.number || "",
            description: eventNode.data.description || "", // Save description
          },
          position: eventNode.position, // Save position
        });
      }
    }

    // Find accessories connected from this listener
    const accessoryEdges = edges.filter(
      (e) => e.source === listenerNode.id && e.target
    );
    for (const edge of accessoryEdges) {
      const accessoryNode = nodes.find((n) => n.id === edge.target);
      if (accessoryNode && accessoryNode.type === "accessory") {
        if (!listenerData.accessories) {
          listenerData.accessories = [];
        }
        listenerData.accessories.push({
          accessory_id: accessoryNode.id,
          accessory_data: {
            name: accessoryNode.data.name || `accessory_${accessoryNode.id}`,
            accessory_type: accessoryNode.data.accessory_type || "Smart Light Bulb",
          },
          position: accessoryNode.position, // Save position
        });
      }
    }

    if (listenerData.conditions.length > 0 || listenerData.events.length > 0 || (listenerData.accessories && listenerData.accessories.length > 0)) {
      userNodesFormat.listeners.push(listenerData);
    }
  }

  userNodesFormat.total_listeners = userNodesFormat.listeners.length;
  return userNodesFormat;
}

// Convert UserNodes format to React Flow format
export function userNodesToReactFlow(userNodesData, basePosition = { x: 250, y: 100 }) {
  const nodes = [];
  const edges = [];
  const nodeIdMap = new Map(); // Map old IDs to new IDs
  let currentX = basePosition.x;
  let currentY = basePosition.y;
  const verticalSpacing = 150;

  for (const listenerData of userNodesData.listeners || []) {
    // Create listener node (use saved position or default)
    const listenerNode = {
      id: listenerData.listener_id,
      type: "listener",
      position: listenerData.listener_position || { x: currentX + 200, y: currentY },
      data: {
        name: listenerData.listener_data.name || `listener_${listenerData.listener_id}`,
        listener_type: listenerData.listener_data.listener_type || "custom",
        description: listenerData.listener_data.description || "", // Load description
        onTypeChange: null, // Will be set by parent component
        onDescriptionChange: null,
      },
    };
    nodes.push(listenerNode);
    nodeIdMap.set(listenerData.listener_id, listenerData.listener_id);

    // Create condition nodes (use saved positions or defaults)
    let conditionY = currentY;
    for (const conditionData of listenerData.conditions || []) {
      const conditionNode = {
        id: conditionData.condition_id,
        type: "condition",
        position: conditionData.position || { x: currentX, y: conditionY },
        data: {
          name: conditionData.condition_data.name || `condition_${conditionData.condition_id}`,
          condition_type: conditionData.condition_data.condition_type || "custom",
          threshold: conditionData.condition_data.threshold,
          description: conditionData.condition_data.description || "", // Load description
          onTypeChange: null,
          onDescriptionChange: null,
        },
      };
      nodes.push(conditionNode);
      
      // Create edge: condition → listener
      edges.push({
        id: `${conditionData.condition_id}-${listenerData.listener_id}`,
        source: conditionData.condition_id,
        target: listenerData.listener_id,
        markerEnd: { type: "arrowclosed", color: "#ffffff" },
      });

      // Use saved position if available, otherwise use calculated position
      if (conditionData.position) {
        conditionY = Math.max(conditionY, conditionData.position.y + verticalSpacing);
      } else {
        conditionY += verticalSpacing;
      }
    }

    // Create event nodes (use saved positions or defaults)
    let eventY = currentY;
    for (const eventData of listenerData.events || []) {
      const eventNode = {
        id: eventData.event_id,
        type: "event",
        position: eventData.position || { x: currentX + 400, y: eventY },
        data: {
          name: eventData.event_data.name || `event_${eventData.event_id}`,
          event_type: eventData.event_data.event_type || "Text",
          action: eventData.event_data.action || "notification",
          message: eventData.event_data.message,
          description: eventData.event_data.description || "", // Load description
          onTypeChange: null,
          onDescriptionChange: null,
        },
      };
      nodes.push(eventNode);
      
      // Create edge: listener → event
      edges.push({
        id: `${listenerData.listener_id}-${eventData.event_id}`,
        source: listenerData.listener_id,
        target: eventData.event_id,
        markerEnd: { type: "arrowclosed", color: "#ffffff" },
      });

      // Use saved position if available, otherwise use calculated position
      if (eventData.position) {
        eventY = Math.max(eventY, eventData.position.y + verticalSpacing);
      } else {
        eventY += verticalSpacing;
      }
    }

    // Create accessory nodes (use saved positions or defaults)
    let accessoryY = currentY;
    for (const accessoryData of listenerData.accessories || []) {
      const accessoryNode = {
        id: accessoryData.accessory_id,
        type: "accessory",
        position: accessoryData.position || { x: currentX + 400, y: accessoryY },
        data: {
          name: accessoryData.accessory_data.name || `accessory_${accessoryData.accessory_id}`,
          accessory_type: accessoryData.accessory_data.accessory_type || "Smart Light Bulb",
          onTypeChange: null,
          onDescriptionChange: null,
        },
      };
      nodes.push(accessoryNode);
      
      // Create edge: listener → accessory
      edges.push({
        id: `${listenerData.listener_id}-${accessoryData.accessory_id}`,
        source: listenerData.listener_id,
        target: accessoryData.accessory_id,
        markerEnd: { type: "arrowclosed", color: "#ffffff" },
      });

      // Use saved position if available, otherwise use calculated position
      if (accessoryData.position) {
        accessoryY = Math.max(accessoryY, accessoryData.position.y + verticalSpacing);
      } else {
        accessoryY += verticalSpacing;
      }
    }

    currentY += Math.max(
      (listenerData.conditions?.length || 0) * verticalSpacing,
      (listenerData.events?.length || 0) * verticalSpacing,
      (listenerData.accessories?.length || 0) * verticalSpacing,
      verticalSpacing
    );
  }

  return { nodes, edges };
}

