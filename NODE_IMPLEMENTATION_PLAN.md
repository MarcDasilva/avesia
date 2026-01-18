# Node System Implementation Plan

## Overview

Implementing Condition → Listener → Event node system in React Flow with MongoDB persistence.

## Node Types & Dropdowns

### Condition Node

- **Dropdown Options**: weather, lighting, time, zone, duration, frequency, custom
- **Can Connect To**: Only ONE Listener (but multiple conditions can share same listener)
- **Cannot Connect To**: Events
- **Color**: Red/Pink gradient

### Listener Node

- **Dropdown Options**: object, activity, motion, sound, face, license_plate, gesture, custom_prompt, custom
- **Can Connect To**: Multiple Events
- **Cannot Connect To**: Conditions (only receives from Conditions)
- **Color**: Blue/Cyan gradient

### Event Node

- **Dropdown Options**: Email, Text
- **Can Connect To**: Nothing (terminal node)
- **Cannot Connect To**: Any node (end of chain)
- **Color**: Green gradient

## Connection Rules

1. **Condition → Listener**: ✅ Allowed (1:1 per condition, but multiple conditions can share listener)
2. **Listener → Event**: ✅ Allowed (1:many)
3. **Condition → Event**: ❌ Blocked
4. **Listener → Condition**: ❌ Blocked
5. **Event → Anything**: ❌ Blocked

## Data Flow

### React Flow → UserNodes Format (for saving)

```javascript
// React Flow format (nodes + edges)
const reactFlowData = { nodes: [...], edges: [...] }

// Convert to UserNodes format
const userNodesFormat = {
  listeners: [
    {
      listener_id: "...",
      listener_data: { name: "...", type: "..." },
      conditions: [{ condition_id: "...", condition_data: {...} }],
      events: [{ event_id: "...", event_data: {...} }]
    }
  ],
  total_listeners: N
}
```

### MongoDB Storage

- Store in project document: `project.nodes = { listeners: [...], total_listeners: N }`
- Save endpoint: `PUT /api/projects/{project_id}/nodes`
- Load: Automatically loaded with project data

## Implementation Steps

1. ✅ Create dropdown options constant in frontend
2. ⏳ Create Condition/Listener/Event node components
3. ⏳ Add connection validation
4. ⏳ Implement save to MongoDB
5. ⏳ Implement load from MongoDB
6. ⏳ Update node palette
