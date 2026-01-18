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
        
        # Extract info from listener
        listener_type = listener_data.get("listener_type", "")
        listener_description = listener_data.get("description", "").strip()
        
        # Build a simple, natural language prompt
        if listener_description:
            # Use the description if provided
            prompt = listener_description
        else:
            # Generate a simple prompt based on type
            if "person" in listener_type.lower():
                prompt = "Is there a person?"
            elif "motion" in listener_type.lower():
                prompt = "Is there motion?"
            elif "face" in listener_type.lower():
                prompt = "Is there a face?"
            elif "license" in listener_type.lower():
                prompt = "Is there a license plate?"
            elif "object" in listener_type.lower():
                prompt = "Detect any objects"
            else:
                prompt = f"Detect {listener_type}"
        
        # Add condition context if present (simplified)
        conditions = listener.get("conditions", [])
        if conditions:
            cond_texts = []
            for condition in conditions:
                cond_data = condition.get("condition_data", {})
                cond_desc = cond_data.get("description", "").strip()
                if cond_desc:
                    cond_texts.append(cond_desc)
            
            if cond_texts:
                prompt += f" ({', '.join(cond_texts)})"
        
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
        "listener_id": "node_1768723871133_3",
        "listener_data": {
          "name": "listener_3",
          "listener_type": "license_plate",
          "description": "description\n"
        },
        "listener_position": {
          "x": 450,
          "y": 100
        },
        "conditions": [
          {
            "condition_id": "node_1768723848167_2",
            "condition_data": {
              "name": "condition_2",
              "condition_type": "time",
              "description": "hello jeremy\n"
            },
            "position": {
              "x": 183.47733639910302,
              "y": 47.46574210112318
            }
          },
          {
            "condition_id": "node_1768724109001_6",
            "condition_data": {
              "name": "condition_6",
              "condition_type": "custom",
              "description": "description"
            },
            "position": {
              "x": 250,
              "y": 250
            }
          }
        ],
        "events": [
          {
            "event_id": "node_1768723882700_5",
            "event_data": {
              "name": "event_node_1768723882700_5",
              "event_type": "Gmail",
              "action": "notification",
              "message": "",
              "description": "description"
            },
            "position": {
              "x": 652.1236595027013,
              "y": 26.733747156803474
            }
          },
          {
            "event_id": "node_1768723876433_4",
            "event_data": {
              "name": "event_node_1768723876433_4",
              "event_type": "Text",
              "action": "notification",
              "message": "",
              "description": "description\n"
            },
            "position": {
              "x": 650,
              "y": 250
            }
          }
        ]
      }
    ],
  "total_listeners": 1
}
    
    result = process_listeners(sample_json)
    print(json.dumps(result, indent=2))
