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
        
        # Extract description from listener - this is the primary prompt
        listener_description = listener_data.get("description", "").strip()
        listener_type = listener_data.get("listener_type", "")
        listener_name = listener_data.get("name", "")
        
        # Use description as the primary prompt (user's intent)
        # If no description, use a fallback based on listener type
        if listener_description:
            # User provided description - wrap it with conditional structure behind the scenes
            # User sees: "motion detected"
            # SDK receives: "if motion detected return true, otherwise false"
            base_prompt = f"if {listener_description} return true, otherwise false"
        elif listener_type and listener_type != "custom":
            # Fallback: use listener type if no description
            base_prompt = f"if {listener_type.lower()} return true, otherwise false"
        else:
            # Final fallback
            base_prompt = "if relevant objects or events detected return true, otherwise false"
        
        # Extract constraints from conditions (these refine the prompt)
        constraints = []
        for condition in listener.get("conditions", []):
            cond_data = condition.get("condition_data", {})
            cond_type = cond_data.get("condition_type", "")
            cond_description = cond_data.get("description", "").strip()
            
            constraint_parts = []
            if cond_description:
                # Use condition description if provided (most specific)
                constraint_parts.append(cond_description)
            elif cond_type and cond_type != "custom":
                # Fallback to condition type
                constraint_parts.append(cond_type)
            
            if constraint_parts:
                constraints.append(" ".join(constraint_parts))
        
        # Build the prompt string - use description as primary, conditions as additional context
        if constraints:
            # Combine base prompt with constraints naturally
            constraints_text = ", ".join(constraints)
            prompt = f"{base_prompt}. Conditions: {constraints_text}"
        else:
            # Just use the base prompt if no conditions
            prompt = base_prompt
        
        # Clean up prompt (remove extra whitespace, newlines)
        prompt = " ".join(prompt.split())
        
        print(f"📝 Listener {listener_id}: Generated prompt: {prompt}")
        
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
