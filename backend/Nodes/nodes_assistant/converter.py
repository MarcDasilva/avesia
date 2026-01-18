"""
Converter - Converts prompt parser output to UserNodes export format
Takes the flat structure from Gemini and converts it to the listener-centric format
"""

import uuid
import json
from typing import Dict, Any, List


def convert_to_export_format(parsed_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert parsed prompt data to all_nodes_export.json format.
    
    Args:
        parsed_data: Output from prompt_parser with flat structure:
        {
            "listeners": [{"name": "...", "type": "..."}],
            "conditions": [{"name": "...", "type": "...", "threshold": ...}],
            "events": [{"action": "...", "type": "...", "message": "..."}]
        }
    
    Returns:
        Dictionary in all_nodes_export.json format:
        {
            "listeners": [
                {
                    "listener_id": "uuid",
                    "listener_data": {...},
                    "conditions": [...],
                    "events": [...]
                }
            ],
            "total_listeners": N
        }
    """
    
    listeners_output = []
    
    # Get data from parsed structure
    listeners = parsed_data.get("listeners", [])
    conditions = parsed_data.get("conditions", [])
    events = parsed_data.get("events", [])
    
    # Strategy: Create one listener entry for each listener in the input
    # Each listener gets ALL conditions and ALL events
    # (In a more advanced version, you could use AI to match specific conditions/events to specific listeners)
    
    for listener in listeners:
        # Generate UUIDs
        listener_id = str(uuid.uuid4())
        
        # Build listener_data
        listener_data = {
            "name": listener.get("name", "unnamed_listener"),
            "type": listener.get("type", "custom")
        }
        
        # Build conditions array
        conditions_array = []
        for condition in conditions:
            condition_id = str(uuid.uuid4())
            condition_data = {
                "name": condition.get("name", "unnamed_condition"),
                "type": condition.get("type", "custom")
            }
            
            # Add optional fields if present
            if "threshold" in condition:
                condition_data["threshold"] = condition["threshold"]
            if "value" in condition:
                condition_data["value"] = condition["value"]
            
            conditions_array.append({
                "condition_id": condition_id,
                "condition_data": condition_data
            })
        
        # Build events array
        events_array = []
        for event in events:
            event_id = str(uuid.uuid4())
            event_data = {
                "action": event.get("action", "unnamed_action")
            }
            
            # Add optional fields if present
            if "type" in event:
                event_data["type"] = event["type"]
            if "recipient" in event:
                event_data["recipient"] = event["recipient"]
            if "message" in event:
                event_data["message"] = event["message"]
            if "duration" in event:
                event_data["duration"] = event["duration"]
            if "priority" in event:
                event_data["priority"] = event["priority"]
            
            events_array.append({
                "event_id": event_id,
                "event_data": event_data
            })
        
        # Build complete listener object
        listener_obj = {
            "listener_id": listener_id,
            "listener_data": listener_data,
            "conditions": conditions_array,
            "events": events_array
        }
        
        listeners_output.append(listener_obj)
    
    # Build final export structure
    export_data = {
        "listeners": listeners_output,
        "total_listeners": len(listeners_output)
    }
    
    return export_data


def parse_and_convert(user_prompt: str) -> Dict[str, Any]:
    """
    Parse a natural language prompt and convert to export format in one step.
    
    Args:
        user_prompt: Natural language automation description
        
    Returns:
        Dictionary in all_nodes_export.json format
    """
    from prompt_parser import parse_prompt
    
    print("🔄 Parsing prompt with Gemini...")
    parsed_data = parse_prompt(user_prompt)
    
    print("🔄 Converting to export format...")
    export_data = convert_to_export_format(parsed_data)
    
    print(f"✅ Conversion complete!")
    print(f"   Created {export_data['total_listeners']} listener(s)")
    
    return export_data


if __name__ == "__main__":
    import sys
    
    print("="*70)
    print("PROMPT TO EXPORT FORMAT CONVERTER")
    print("="*70)
    
    # Test with example prompts
    test_prompts = [
        "Notify me by text when an orange baby on the bed falls off the bed at night",
    ]
    
    for i, prompt in enumerate(test_prompts, 1):
        print(f"\n{'='*70}")
        print(f"TEST {i}: {prompt}")
        print('='*70)
        
        try:
            result = parse_and_convert(prompt)
            
            print("\n📋 EXPORT FORMAT RESULT:")
            print(json.dumps(result, indent=2))
            
            # Save to file
            output_file = f"converted_export_{i}.json"
            with open(output_file, 'w') as f:
                json.dump(result, f, indent=2)
            print(f"\n💾 Saved to: {output_file}")
            
        except Exception as e:
            print(f"\n⚠️  Error: {e}")
            import traceback
            traceback.print_exc()
        
        print()
    
    print("\n" + "="*70)
    print("You can also use this programmatically:")
    print("="*70)
    print("""
from nodes_assistant.converter import parse_and_convert

# Parse and convert in one step
result = parse_and_convert("Alert me when someone is at the door")

# Or convert existing parsed data
from nodes_assistant.converter import convert_to_export_format
from nodes_assistant.prompt_parser import parse_prompt

parsed = parse_prompt("Your prompt here")
export_format = convert_to_export_format(parsed)
    """)
