"""
User Nodes System - Linked List Structure
Manages conditions -> listeners -> events chain
Each node is stored as a JSON file with pointers to next nodes
"""

import json
import os
import uuid
from typing import Dict, List, Optional, Any
from pathlib import Path
from node_options import ConditionOptions, ListenerOptions, EventOptions


class NodeType:
    """Enum-like class for node types"""
    CONDITION = "condition"
    LISTENER = "listener"
    EVENT = "event"


class Node:
    """Base node class representing a single node in the chain"""
    
    def __init__(self, node_id: str = None, node_type: str = None, data: Dict = None, next_nodes: List[str] = None):
        self.node_id = node_id or str(uuid.uuid4())
        self.node_type = node_type
        self.data = data or {}
        self.next_nodes = next_nodes or []  # List of node IDs this node points to
    
    def to_dict(self) -> Dict:
        """Convert node to dictionary for JSON serialization"""
        return {
            "node_id": self.node_id,
            "node_type": self.node_type,
            "data": self.data,
            "next_nodes": self.next_nodes
        }
    
    @staticmethod
    def from_dict(node_dict: Dict) -> 'Node':
        """Create node from dictionary"""
        return Node(
            node_id=node_dict.get("node_id"),
            node_type=node_dict.get("node_type"),
            data=node_dict.get("data", {}),
            next_nodes=node_dict.get("next_nodes", [])
        )
    
    def add_next_node(self, node_id: str):
        """Add a pointer to the next node"""
        if node_id not in self.next_nodes:
            self.next_nodes.append(node_id)
    
    def remove_next_node(self, node_id: str):
        """Remove a pointer to a next node"""
        if node_id in self.next_nodes:
            self.next_nodes.remove(node_id)


class ConditionNode(Node):
    """Condition node - points to listener nodes"""
    
    def __init__(self, node_id: str = None, data: Dict = None, next_nodes: List[str] = None):
        super().__init__(node_id, NodeType.CONDITION, data, next_nodes)
    
    def add_listener(self, listener_id: str):
        """Add a listener node reference"""
        self.add_next_node(listener_id)


class ListenerNode(Node):
    """Listener node - points to event nodes (can share events)"""
    
    def __init__(self, node_id: str = None, data: Dict = None, next_nodes: List[str] = None):
        super().__init__(node_id, NodeType.LISTENER, data, next_nodes)
    
    def add_event(self, event_id: str):
        """Add an event node reference"""
        self.add_next_node(event_id)


class EventNode(Node):
    """Event node - terminal node in the chain"""
    
    def __init__(self, node_id: str = None, data: Dict = None):
        super().__init__(node_id, NodeType.EVENT, data, next_nodes=[])


class UserNodes:
    """
    Main class managing the linked list structure of nodes
    Handles loading, saving, and traversing the node chain
    """
    
    def __init__(self, storage_path: str = None):
        self.storage_path = storage_path or os.path.join(os.path.dirname(__file__), "node_data")
        self.nodes: Dict[str, Node] = {}  # In-memory cache of nodes
        self._ensure_storage_exists()
    
    def _ensure_storage_exists(self):
        """Create storage directory if it doesn't exist"""
        Path(self.storage_path).mkdir(parents=True, exist_ok=True)
    
    def _get_node_file_path(self, node_id: str) -> str:
        """Get the file path for a node's JSON file"""
        return os.path.join(self.storage_path, f"{node_id}.json")
    
    # ==================== CREATE OPERATIONS ====================
    
    def create_condition(self, data: Dict = None) -> ConditionNode:
        """Create a new condition node"""
        node = ConditionNode(data=data)
        self.nodes[node.node_id] = node
        self.save_node(node.node_id)
        return node
    
    def create_listener(self, data: Dict = None) -> ListenerNode:
        """Create a new listener node"""
        node = ListenerNode(data=data)
        self.nodes[node.node_id] = node
        self.save_node(node.node_id)
        return node
    
    def create_event(self, data: Dict = None) -> EventNode:
        """Create a new event node"""
        node = EventNode(data=data)
        self.nodes[node.node_id] = node
        self.save_node(node.node_id)
        return node
    
    # ==================== LINK OPERATIONS ====================
    
    def link_condition_to_listener(self, condition_id: str, listener_id: str):
        """Link a condition to a listener - each condition can only link to ONE listener, but multiple conditions can share the same listener"""
        condition = self.get_node(condition_id)
        listener = self.get_node(listener_id)
        
        if condition.node_type != NodeType.CONDITION:
            raise ValueError(f"Node {condition_id} is not a condition")
        if listener.node_type != NodeType.LISTENER:
            raise ValueError(f"Node {listener_id} is not a listener")
        
        # Check if condition already has a listener
        if len(condition.next_nodes) > 0:
            raise ValueError(f"Condition {condition_id} already has a listener. Each condition can only be connected to ONE listener.")
        
        # Note: Multiple conditions CAN link to the same listener (this is allowed)
        
        condition.add_listener(listener_id)
        self.save_node(condition_id)
    
    def link_listener_to_event(self, listener_id: str, event_id: str):
        """Link a listener to an event - listeners CAN share events"""
        listener = self.get_node(listener_id)
        event = self.get_node(event_id)
        
        if listener.node_type != NodeType.LISTENER:
            raise ValueError(f"Node {listener_id} is not a listener")
        if event.node_type != NodeType.EVENT:
            raise ValueError(f"Node {event_id} is not an event")
        
        listener.add_event(event_id)
        self.save_node(listener_id)
    
    # ==================== READ OPERATIONS ====================
    
    def get_node(self, node_id: str) -> Optional[Node]:
        """Get a node by ID (from cache or load from disk)"""
        if node_id in self.nodes:
            return self.nodes[node_id]
        
        # Try to load from disk
        node_data = self._load_node_from_file(node_id)
        if node_data:
            node = Node.from_dict(node_data)
            self.nodes[node_id] = node
            return node
        
        return None
    
    def _load_node_from_file(self, node_id: str) -> Optional[Dict]:
        """Load node data from JSON file"""
        file_path = self._get_node_file_path(node_id)
        if os.path.exists(file_path):
            with open(file_path, 'r') as f:
                return json.load(f)
        return None
    
    def get_all_nodes(self) -> Dict[str, Node]:
        """Get all nodes (loads all from disk if needed)"""
        # Load all nodes from storage
        for filename in os.listdir(self.storage_path):
            if filename.endswith('.json'):
                node_id = filename[:-5]
                if node_id not in self.nodes:
                    self.get_node(node_id)
        return self.nodes
    
    def get_nodes_by_type(self, node_type: str) -> List[Node]:
        """Get all nodes of a specific type"""
        self.get_all_nodes()  # Ensure all nodes are loaded
        return [node for node in self.nodes.values() if node.node_type == node_type]
    
    # ==================== SAVE OPERATIONS ====================
    
    def save_node(self, node_id: str):
        """Save a node to disk as JSON file"""
        if node_id not in self.nodes:
            raise ValueError(f"Node {node_id} not found in cache")
        
        node = self.nodes[node_id]
        file_path = self._get_node_file_path(node_id)
        
        with open(file_path, 'w') as f:
            json.dump(node.to_dict(), f, indent=2)
    
    def save_all_nodes(self):
        """Save all cached nodes to disk"""
        for node_id in self.nodes:
            self.save_node(node_id)
    
    # ==================== DELETE OPERATIONS ====================
    
    def delete_node(self, node_id: str):
        """Delete a node and remove it from other nodes' references"""
        # Remove from other nodes' next_nodes lists
        for node in self.nodes.values():
            if node_id in node.next_nodes:
                node.remove_next_node(node_id)
                self.save_node(node.node_id)
        
        # Remove from cache
        if node_id in self.nodes:
            del self.nodes[node_id]
        
        # Remove file from disk
        file_path = self._get_node_file_path(node_id)
        if os.path.exists(file_path):
            os.remove(file_path)
    
    # ==================== TRAVERSAL OPERATIONS ====================
    
    def get_chain(self, start_node_id: str) -> List[Node]:
        """Get the full chain starting from a node"""
        chain = []
        visited = set()
        
        def traverse(node_id: str):
            if node_id in visited:
                return
            visited.add(node_id)
            
            node = self.get_node(node_id)
            if node:
                chain.append(node)
                for next_node_id in node.next_nodes:
                    traverse(next_node_id)
        
        traverse(start_node_id)
        return chain
    
    def get_listeners_for_condition(self, condition_id: str) -> List[ListenerNode]:
        """Get all listeners linked to a condition"""
        condition = self.get_node(condition_id)
        if not condition or condition.node_type != NodeType.CONDITION:
            return []
        
        listeners = []
        for listener_id in condition.next_nodes:
            listener = self.get_node(listener_id)
            if listener:
                listeners.append(listener)
        return listeners
    
    def get_events_for_listener(self, listener_id: str) -> List[EventNode]:
        """Get all events linked to a listener"""
        listener = self.get_node(listener_id)
        if not listener or listener.node_type != NodeType.LISTENER:
            return []
        
        events = []
        for event_id in listener.next_nodes:
            event = self.get_node(event_id)
            if event:
                events.append(event)
        return events
    
    def get_full_chain(self, condition_id: str) -> Dict[str, Any]:
        """Get the complete chain from condition -> listeners -> events"""
        condition = self.get_node(condition_id)
        if not condition or condition.node_type != NodeType.CONDITION:
            return {}
        
        chain = {
            "condition": condition.to_dict(),
            "listeners": []
        }
        
        for listener_id in condition.next_nodes:
            listener = self.get_node(listener_id)
            if listener:
                listener_data = {
                    "listener": listener.to_dict(),
                    "events": []
                }
                
                for event_id in listener.next_nodes:
                    event = self.get_node(event_id)
                    if event:
                        listener_data["events"].append(event.to_dict())
                
                chain["listeners"].append(listener_data)
        
        return chain
    
    # ==================== UTILITY OPERATIONS ====================
    
    def clear_cache(self):
        """Clear the in-memory cache"""
        self.nodes.clear()
    
    def export_all(self, output_file: str):
        """Export all nodes organized by listeners (same format as HTML visual editor)"""
        self.get_all_nodes()
        
        export_data = {
            "listeners": [],
            "total_listeners": 0
        }
        
        # Get all listener nodes
        listener_nodes = [node for node in self.nodes.values() if node.node_type == NodeType.LISTENER]
        
        for listener_node in listener_nodes:
            listener_data = {
                "listener_id": listener_node.node_id,
                "listener_data": listener_node.data,
                "conditions": [],
                "events": []
            }
            
            # Find all conditions connected to this listener
            for cond_id, cond_node in self.nodes.items():
                if cond_node.node_type == NodeType.CONDITION and listener_node.node_id in cond_node.next_nodes:
                    listener_data["conditions"].append({
                        "condition_id": cond_node.node_id,
                        "condition_data": cond_node.data
                    })
            
            # Find all events connected to this listener
            for event_id in listener_node.next_nodes:
                event_node = self.nodes.get(event_id)
                if event_node and event_node.node_type == NodeType.EVENT:
                    listener_data["events"].append({
                        "event_id": event_node.node_id,
                        "event_data": event_node.data
                    })
            
            export_data["listeners"].append(listener_data)
        
        export_data["total_listeners"] = len(export_data["listeners"])
        
        with open(output_file, 'w') as f:
            json.dump(export_data, f, indent=2)
    
    def export_all_flat(self, output_file: str):
        """Export all nodes in flat structure (legacy format)"""
        self.get_all_nodes()
        export_data = {
            "nodes": [node.to_dict() for node in self.nodes.values()]
        }
        with open(output_file, 'w') as f:
            json.dump(export_data, f, indent=2)
    
    def import_from_file(self, input_file: str):
        """Import nodes from a JSON file"""
        with open(input_file, 'r') as f:
            data = json.load(f)
        
        for node_data in data.get('nodes', []):
            node = Node.from_dict(node_data)
            self.nodes[node.node_id] = node
            self.save_node(node.node_id)


# ==================== EXAMPLE USAGE ====================

def example_usage():
    """Example of how to use the UserNodes system"""
    
    # Initialize the system
    user_nodes = UserNodes()
    
    # Clear old data from previous runs
    import shutil
    if os.path.exists(user_nodes.storage_path):
        shutil.rmtree(user_nodes.storage_path)
    user_nodes._ensure_storage_exists()
    user_nodes.clear_cache()
    
    # Example 1: Security camera motion detection
    print("Creating security camera motion detection setup...")
    condition1 = user_nodes.create_condition(data={"name": "nighttime", "threshold": 0.7, "type": "time"})
    condition2 = user_nodes.create_condition(data={"name": "motion_detected", "threshold": 0.85, "type": "motion"})
    listener1 = user_nodes.create_listener(data={"name": "security_camera_alert", "type": "video_stream"})
    event1 = user_nodes.create_event(data={"action": "send_notification", "recipient": "security@company.com"})
    event2 = user_nodes.create_event(data={"action": "record_video", "duration": "30s"})
    
    user_nodes.link_condition_to_listener(condition1.node_id, listener1.node_id)
    user_nodes.link_condition_to_listener(condition2.node_id, listener1.node_id)
    user_nodes.link_listener_to_event(listener1.node_id, event1.node_id)
    user_nodes.link_listener_to_event(listener1.node_id, event2.node_id)
    
    # Example 2: Package delivery detection
    print("Creating package delivery detection setup...")
    condition3 = user_nodes.create_condition(data={"name": "object_at_door", "threshold": 0.9, "type": "object_detection"})
    listener2 = user_nodes.create_listener(data={"name": "package_detector", "type": "doorbell_camera"})
    event3 = user_nodes.create_event(data={"action": "send_sms", "message": "Package delivered!"})
    
    user_nodes.link_condition_to_listener(condition3.node_id, listener2.node_id)
    user_nodes.link_listener_to_event(listener2.node_id, event3.node_id)
    
    # Example 3: Temperature monitoring
    print("Creating temperature monitoring setup...")
    condition4 = user_nodes.create_condition(data={"name": "high_temperature", "threshold": 75.0, "type": "sensor"})
    listener3 = user_nodes.create_listener(data={"name": "temp_monitor", "type": "iot_sensor"})
    event4 = user_nodes.create_event(data={"action": "trigger_alert", "priority": "high"})
    event5 = user_nodes.create_event(data={"action": "activate_cooling", "duration": "15m"})
    
    user_nodes.link_condition_to_listener(condition4.node_id, listener3.node_id)
    user_nodes.link_listener_to_event(listener3.node_id, event4.node_id)
    user_nodes.link_listener_to_event(listener3.node_id, event5.node_id)
    
    # Export all nodes
    print("\nExporting node configuration...")
    user_nodes.export_all("all_nodes_export.json")
    
    # Print the export data
    with open("all_nodes_export.json", 'r') as f:
        export_data = json.load(f)
    print("\n" + "="*60)
    print("📋 EXPORTED LISTENER STRUCTURE:")
    print("="*60)
    print(json.dumps(export_data, indent=2))
    
    # Process with node_processing to create prompts
    print("\n" + "="*60)
    print("🔄 PROCESSING NODES TO PROMPTS:")
    print("="*60)
    
    try:
        from node_processing import process_listeners
        processed_data = process_listeners(export_data)
        
        print("\n✅ Generated Prompts:")
        print(json.dumps(processed_data, indent=2))
        
        # Save processed output
        with open("processed_nodes_output.json", 'w') as f:
            json.dump(processed_data, f, indent=2)
        print("\n💾 Processed output saved to: processed_nodes_output.json")
        
    except Exception as e:
        print(f"\n⚠️  Error processing: {e}")
        print("Export data is still available in all_nodes_export.json")
    
    print("="*60 + "\n")
    
    return user_nodes


if __name__ == "__main__":
    example_usage()
