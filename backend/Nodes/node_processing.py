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
            {"listener_id": "...", "prompt": "Goal: ..., Constraints: ..."}
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
            "listener_id": listener_id,
            "prompt": prompt
        })
    
    print(f"✅ Processed {len(nodes)} listener nodes")
    return {"nodes": nodes}

if __name__ == "__main__":
    # Test with sample data
    sample_json = {
        "listeners": [
            {
                "listener_id": "listener_1",
                "listener_data": {
                    "name": "person_detector",
                    "type": "camera"
                },
                "conditions": [
                    {
                        "condition_id": "cond_1",
                        "condition_data": {
                            "name": "night_only",
                            "threshold": 0.8
                        }
                    }
                ],
                "events": [
                    {
                        "event_id": "event_1",
                        "event_data": {
                            "action": "send_alert"
                        }
                    }
                ]
            }
        ],
        "total_listeners": 1
    }
    
    result = process_listeners(sample_json)
    print(json.dumps(result, indent=2))
