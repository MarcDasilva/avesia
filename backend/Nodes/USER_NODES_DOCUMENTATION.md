# User Nodes System Documentation

## Overview

The User Nodes System is a linked-list data structure that manages a chain of nodes: **Conditions → Listeners → Events**. Each node is stored as a separate JSON file with pointers to connected nodes, allowing for persistent storage and flexible node relationships.

### Key Concepts

- **Conditions** can link to ONLY ONE **Listener** (enforced)
- **Multiple Conditions** CAN link to the SAME **Listener** (allowed)
- **Listeners** can link to multiple **Events**
- **Events** can be shared by multiple Listeners (allowed)

---

## Class Structure

### NodeType

A utility class defining node type constants.

**Properties:**
- `CONDITION = "condition"`
- `LISTENER = "listener"`
- `EVENT = "event"`

---

## Node Class

Base class representing a single node in the chain.

### Constructor Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `node_id` | `str` | `None` | Unique identifier (auto-generated if not provided) |
| `node_type` | `str` | `None` | Type of node: "condition", "listener", or "event" |
| `data` | `Dict` | `{}` | Custom data dictionary for storing node information |
| `next_nodes` | `List[str]` | `[]` | List of node IDs this node points to |

### Properties

- **`node_id`** (`str`) - Unique identifier for the node (UUID4 format)
- **`node_type`** (`str`) - Type classification of the node
- **`data`** (`Dict`) - Custom data storage (flexible schema)
- **`next_nodes`** (`List[str]`) - Array of connected node IDs

### Methods

#### `to_dict() -> Dict`
Converts the node to a dictionary for JSON serialization.

**Returns:** Dictionary containing all node properties

**Example:**
```python
node_dict = node.to_dict()
# Returns: {"node_id": "...", "node_type": "...", "data": {...}, "next_nodes": [...]}
```

---

#### `from_dict(node_dict: Dict) -> Node`
Static method to create a Node instance from a dictionary.

**Parameters:**
- `node_dict` (`Dict`) - Dictionary containing node data

**Returns:** New `Node` object

**Example:**
```python
node = Node.from_dict({"node_id": "123", "node_type": "condition", ...})
```

---

#### `add_next_node(node_id: str) -> None`
Adds a pointer to another node (prevents duplicates).

**Parameters:**
- `node_id` (`str`) - ID of the node to link to

**Example:**
```python
node.add_next_node("listener_xyz")
```

---

#### `remove_next_node(node_id: str) -> None`
Removes a pointer to a connected node.

**Parameters:**
- `node_id` (`str`) - ID of the node to unlink

**Example:**
```python
node.remove_next_node("listener_xyz")
```

---

## ConditionNode Class

Specialized node class for conditions (inherits from Node).

### Constructor Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `node_id` | `str` | `None` | Unique identifier |
| `data` | `Dict` | `{}` | Condition-specific data |
| `next_nodes` | `List[str]` | `[]` | List of listener node IDs |

### Methods

#### `add_listener(listener_id: str) -> None`
Adds a listener node reference (wrapper for `add_next_node`).

**Parameters:**
- `listener_id` (`str`) - ID of the listener to connect

---

## ListenerNode Class

Specialized node class for listeners (inherits from Node).

### Constructor Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `node_id` | `str` | `None` | Unique identifier |
| `data` | `Dict` | `{}` | Listener-specific data |
| `next_nodes` | `List[str]` | `[]` | List of event node IDs |

### Methods

#### `add_event(event_id: str) -> None`
Adds an event node reference (wrapper for `add_next_node`).

**Parameters:**
- `event_id` (`str`) - ID of the event to connect

---

## EventNode Class

Specialized node class for events (inherits from Node). Terminal node with no outgoing connections.

### Constructor Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `node_id` | `str` | `None` | Unique identifier |
| `data` | `Dict` | `{}` | Event-specific data |

**Note:** `next_nodes` is always an empty list for EventNode.

---

## UserNodes Class

Main class managing the entire linked list structure. Handles all CRUD operations and node traversal.

### Constructor Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `storage_path` | `str` | `None` | Directory path for storing JSON files (defaults to `./node_data`) |

### Properties

- **`storage_path`** (`str`) - Directory where node JSON files are stored
- **`nodes`** (`Dict[str, Node]`) - In-memory cache of loaded nodes

---

## UserNodes Methods

### Create Operations

#### `create_condition(data: Dict = None) -> ConditionNode`
Creates a new condition node, saves it to disk, and adds it to cache.

**Parameters:**
- `data` (`Dict`, optional) - Custom data for the condition

**Returns:** New `ConditionNode` instance

**Example:**
```python
condition = user_nodes.create_condition(data={"name": "person_detected", "threshold": 0.8})
```

---

#### `create_listener(data: Dict = None) -> ListenerNode`
Creates a new listener node, saves it to disk, and adds it to cache.

**Parameters:**
- `data` (`Dict`, optional) - Custom data for the listener

**Returns:** New `ListenerNode` instance

**Example:**
```python
listener = user_nodes.create_listener(data={"name": "motion_sensor", "type": "camera"})
```

---

#### `create_event(data: Dict = None) -> EventNode`
Creates a new event node, saves it to disk, and adds it to cache.

**Parameters:**
- `data` (`Dict`, optional) - Custom data for the event

**Returns:** New `EventNode` instance

**Example:**
```python
event = user_nodes.create_event(data={"action": "send_alert", "message": "Person detected"})
```

---

### Link Operations

#### `link_condition_to_listener(condition_id: str, listener_id: str) -> None`
Links a condition to a listener. **Enforces that each condition can only have ONE listener. Multiple conditions CAN share the same listener.**

**Parameters:**
- `condition_id` (`str`) - ID of the condition node
- `listener_id` (`str`) - ID of the listener node

**Raises:**
- `ValueError` - If node IDs are invalid, wrong types, or condition already has a listener

**Example:**
```python
user_nodes.link_condition_to_listener(condition.node_id, listener.node_id)
```

---

#### `link_listener_to_event(listener_id: str, event_id: str) -> None`
Links a listener to an event. **Listeners CAN share events** (multiple listeners can point to the same event).

**Parameters:**
- `listener_id` (`str`) - ID of the listener node
- `event_id` (`str`) - ID of the event node

**Raises:**
- `ValueError` - If node IDs are invalid or wrong types

**Example:**
```python
user_nodes.link_listener_to_event(listener.node_id, event.node_id)
```

---

### Read Operations

#### `get_node(node_id: str) -> Optional[Node]`
Retrieves a node by ID from cache or loads it from disk.

**Parameters:**
- `node_id` (`str`) - ID of the node to retrieve

**Returns:** `Node` object or `None` if not found

**Example:**
```python
node = user_nodes.get_node("condition_123")
```

---

#### `get_all_nodes() -> Dict[str, Node]`
Loads all nodes from disk and returns the complete node dictionary.

**Returns:** Dictionary mapping node IDs to Node objects

**Example:**
```python
all_nodes = user_nodes.get_all_nodes()
for node_id, node in all_nodes.items():
    print(f"{node_id}: {node.node_type}")
```

---

#### `get_nodes_by_type(node_type: str) -> List[Node]`
Retrieves all nodes of a specific type.

**Parameters:**
- `node_type` (`str`) - Type to filter by ("condition", "listener", or "event")

**Returns:** List of Node objects matching the type

**Example:**
```python
all_conditions = user_nodes.get_nodes_by_type(NodeType.CONDITION)
all_events = user_nodes.get_nodes_by_type(NodeType.EVENT)
```

---

#### `get_listeners_for_condition(condition_id: str) -> List[ListenerNode]`
Gets all listeners directly connected to a specific condition.

**Parameters:**
- `condition_id` (`str`) - ID of the condition node

**Returns:** List of `ListenerNode` objects

**Example:**
```python
listeners = user_nodes.get_listeners_for_condition(condition.node_id)
```

---

#### `get_events_for_listener(listener_id: str) -> List[EventNode]`
Gets all events directly connected to a specific listener.

**Parameters:**
- `listener_id` (`str`) - ID of the listener node

**Returns:** List of `EventNode` objects

**Example:**
```python
events = user_nodes.get_events_for_listener(listener.node_id)
```

---

#### `get_chain(start_node_id: str) -> List[Node]`
Traverses and returns the full chain of nodes starting from a given node.

**Parameters:**
- `start_node_id` (`str`) - ID of the starting node

**Returns:** List of all connected nodes in traversal order

**Example:**
```python
chain = user_nodes.get_chain(condition.node_id)
```

---

#### `get_full_chain(condition_id: str) -> Dict[str, Any]`
Gets the complete hierarchical structure from a condition through all its listeners and events.

**Parameters:**
- `condition_id` (`str`) - ID of the condition node

**Returns:** Nested dictionary with structure:
```python
{
    "condition": {...},
    "listeners": [
        {
            "listener": {...},
            "events": [{...}, {...}]
        }
    ]
}
```

**Example:**
```python
full_chain = user_nodes.get_full_chain(condition.node_id)
print(json.dumps(full_chain, indent=2))
```

---

### Save Operations

#### `save_node(node_id: str) -> None`
Saves a single node to disk as a JSON file.

**Parameters:**
- `node_id` (`str`) - ID of the node to save

**Raises:**
- `ValueError` - If node ID is not found in cache

**Example:**
```python
user_nodes.save_node(node.node_id)
```

---

#### `save_all_nodes() -> None`
Saves all cached nodes to disk.

**Example:**
```python
user_nodes.save_all_nodes()
```

---

### Delete Operations

#### `delete_node(node_id: str) -> None`
Deletes a node from cache, disk, and removes all references to it from other nodes.

**Parameters:**
- `node_id` (`str`) - ID of the node to delete

**Example:**
```python
user_nodes.delete_node("listener_xyz")
```

---

### Utility Operations

#### `clear_cache() -> None`
Clears the in-memory node cache (does not delete files).

**Example:**
```python
user_nodes.clear_cache()
```

---

#### `export_all(output_file: str) -> None`
Exports all nodes to a single JSON file.

**Parameters:**
- `output_file` (`str`) - Path to the output JSON file

**Example:**
```python
user_nodes.export_all("backup_nodes.json")
```

**Output Format:**
```json
{
    "nodes": [
        {"node_id": "...", "node_type": "...", "data": {...}, "next_nodes": [...]},
        ...
    ]
}
```

---

#### `import_from_file(input_file: str) -> None`
Imports nodes from a JSON file and saves them to the storage directory.

**Parameters:**
- `input_file` (`str`) - Path to the input JSON file

**Example:**
```python
user_nodes.import_from_file("backup_nodes.json")
```

---

## Complete Usage Example

```python
from user_nodes import UserNodes, NodeType

# Initialize the system
user_nodes = UserNodes()

# Create nodes
condition1 = user_nodes.create_condition(data={
    "name": "person_detected",
    "threshold": 0.8,
    "camera": "front_door"
})

condition2 = user_nodes.create_condition(data={
    "name": "motion_detected",
    "threshold": 0.5,
    "camera": "back_door"
})

listener1 = user_nodes.create_listener(data={
    "name": "motion_sensor",
    "type": "camera",
    "location": "entrance"
})

event1 = user_nodes.create_event(data={
    "action": "send_alert",
    "message": "Person detected at front door",
    "priority": "high"
})

event2 = user_nodes.create_event(data={
    "action": "log_event",
    "message": "Detection logged to database"
})

# Link nodes together
# Multiple conditions can link to the same listener
user_nodes.link_condition_to_listener(condition1.node_id, listener1.node_id)
user_nodes.link_condition_to_listener(condition2.node_id, listener1.node_id)  # Same listener!

# Listener can link to multiple events
user_nodes.link_listener_to_event(listener1.node_id, event1.node_id)
user_nodes.link_listener_to_event(listener1.node_id, event2.node_id)

# Retrieve data
full_chain = user_nodes.get_full_chain(condition1.node_id)
print(json.dumps(full_chain, indent=2))

# Export everything
user_nodes.export_all("my_nodes_backup.json")

# Get all conditions
all_conditions = user_nodes.get_nodes_by_type(NodeType.CONDITION)
for cond in all_conditions:
    print(f"Condition: {cond.data.get('name')}")
```

---

## File Storage Structure

Each node is stored as a separate JSON file in the storage directory:

```
node_data/
├── condition_1_abc123.json
├── listener_2_def456.json
├── event_3_ghi789.json
└── ...
```

**JSON File Format:**
```json
{
  "node_id": "condition_1_abc123",
  "node_type": "condition",
  "data": {
    "name": "person_detected",
    "threshold": 0.8
  },
  "next_nodes": [
    "listener_2_def456"
  ]
}
```

---

## Important Constraints

1. **Condition-Listener Relationship**: Each condition can only be connected to ONE listener
   - Attempting to link a condition to a second listener will raise a `ValueError`
   - However, MULTIPLE conditions CAN link to the SAME listener (allowed)
   
2. **Event Sharing**: Multiple listeners CAN point to the same event
   - This is allowed and encouraged for shared actions

3. **Node Type Validation**: Link operations validate node types
   - `link_condition_to_listener` requires a condition and listener
   - `link_listener_to_event` requires a listener and event

4. **Automatic Persistence**: All create and link operations automatically save to disk

5. **Lazy Loading**: Nodes are loaded from disk only when accessed

---

## Error Handling

The system raises `ValueError` exceptions for:
- Invalid node types in link operations
- Attempting to link a listener to multiple conditions
- Attempting to save a node that doesn't exist in cache
- Node ID not found when loading

Always wrap operations in try-except blocks when needed:

```python
try:
    user_nodes.link_condition_to_listener(cond_id, listener_id)
except ValueError as e:
    print(f"Link failed: {e}")
```
