"""
Node Processing Module - Converts listener nodes into prompt strings
Combines listener goals with their conditions into a single prompt string
"""

import json
from typing import Dict, List, Any


def process_listeners(listeners_json: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process listeners by combining listener goals with their conditions into a prompt string.
    
    Args:
        listeners_json: The JSON output from user_nodes.export_all()
        
    Returns:
        Processed JSON with prompts in the format:
        {
          "nodes": [
            {"name": "...", "datatype": "boolean", "prompt": "Goal: ..., Constraints: ..."}
          ]
        }
    """
    nodes = []
    
    for listener in listeners_json.get("listeners", []):
        listener_id = listener.get("listener_id", "")
        listener_data = listener.get("listener_data", {})
        conditions = listener.get("conditions", [])
        
        # Extract goal from listener
        listener_name = listener_data.get("name", "detection")
        listener_type = listener_data.get("type", "")
        
        goal = f"{listener_name}"
        if listener_type:
            goal += f" ({listener_type})"
        
        # Extract constraints from conditions
        constraints = []
        for condition in conditions:
            cond_data = condition.get("condition_data", {})
            cond_name = cond_data.get("name", "")
            cond_threshold = cond_data.get("threshold")
            cond_type = cond_data.get("type", "")
            
            constraint_parts = []
            if cond_name:
                constraint_parts.append(cond_name)
            if cond_threshold is not None:
                constraint_parts.append(f"threshold: {cond_threshold}")
            if cond_type:
                constraint_parts.append(f"type: {cond_type}")
            
            if constraint_parts:
                constraints.append(", ".join(constraint_parts))
        
        # Build the prompt string
        if constraints:
            prompt = f"Goal: {goal}, Constraints: {'; '.join(constraints)}"
        else:
            prompt = f"Goal: {goal}, Constraints: none"
        
        nodes.append({
            "name": listener_id,
            "datatype": "boolean",
            "prompt": prompt
        })
    
    print(f"✅ Processed {len(nodes)} listener nodes")
    return {"nodes": nodes}

if __name__ == "__main__":
    # Test with sample data
    sample_json = {
  "listeners": [
    {
      "listener_id": "74a5b922-120f-4ab3-9711-1340fa17b91a",
      "listener_data": {
        "name": "package_detection",
        "type": "object (person, car, animal, package)"
      },
      "conditions": [
        {
          "condition_id": "e613e065-2a3a-4c68-8507-4324a2445e7f",
          "condition_data": {
            "name": "front_door_zone",
            "type": "zone"
          }
        }
      ],
      "events": [
        {
          "event_id": "b147eb0d-3a85-456d-98be-ba015eeaf524",
          "event_data": {
            "action": "send_notification",
            "type": "Text",
            "message": "Package delivered to front door"
          }
        }
      ]
    }
  ],
  "total_listeners": 1
}
    
    result = process_listeners(sample_json)
    print(json.dumps(result, indent=2))
