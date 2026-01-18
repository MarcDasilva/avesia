"""
Converter - Converts prompt parser output to UserNodes export format
Takes the flat structure from Gemini and converts it to the listener-centric format
"""

import uuid
import json
import sys
import os
from typing import Dict, Any, List

# Add parent directory to path to import node_options
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from node_options import ConditionOptions, ListenerOptions, EventOptions, AccessoryOptions


def validate_and_correct_type(value: str, valid_options: List[str], field_name: str) -> str:
    """Validate if a type value is in the valid options list, otherwise return 'custom'.
    
    Args:
        value: The type value to validate
        valid_options: List of valid options from node_options.py
        field_name: Name of the field for logging purposes
        
    Returns:
        The original value if valid, otherwise 'custom'
    """
    if value in valid_options:
        return value
    else:
        print(f"⚠️  Invalid {field_name}: '{value}' not in options. Changing to 'custom'.")
        return "custom"


def convert_to_export_format(parsed_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert parsed prompt data to all_nodes_export.json format.
    
    Args:
        parsed_data: Output from prompt_parser with nested structure:
        {
            "listeners": [
                {
                    "listener_id": "...",
                    "listener_data": {"name": "...", "listener_type": "...", "description": "..."},
                    "listener_position": {"x": 450, "y": 100},
                    "conditions": [...],
                    "events": [...],
                    "accessories": [...]
                }
            ]
        }
    
    Returns:
        Dictionary in all_nodes_export.json format (same structure as input since Gemini now returns the correct format)
    """
    
    listeners_output = []
    
    # Get listeners from parsed structure
    listeners = parsed_data.get("listeners", [])
    
    # Process each listener (they already have the correct structure from Gemini)
    for listener in listeners:
        # Ensure all required fields exist with defaults if missing
        listener_id = listener.get("listener_id", str(uuid.uuid4()))
        
        listener_data = listener.get("listener_data", {})
        if not listener_data:
            listener_data = {
                "name": "unnamed_listener",
                "listener_type": "custom",
                "description": ""
            }
        
        # Validate listener_type
        if "listener_type" in listener_data:
            listener_data["listener_type"] = validate_and_correct_type(
                listener_data["listener_type"],
                ListenerOptions.OPTIONS,
                "listener_type"
            )
        
        # Process conditions (already in correct format)
        conditions_array = []
        for condition in listener.get("conditions", []):
            condition_id = condition.get("condition_id", str(uuid.uuid4()))
            condition_data = condition.get("condition_data", {})
            
            # Ensure required fields in condition_data
            if not condition_data.get("name"):
                condition_data["name"] = "unnamed_condition"
            if not condition_data.get("condition_type"):
                condition_data["condition_type"] = "custom"
            
            # Validate condition_type
            if "condition_type" in condition_data:
                condition_data["condition_type"] = validate_and_correct_type(
                    condition_data["condition_type"],
                    ConditionOptions.OPTIONS,
                    "condition_type"
                )
            
            conditions_array.append({
                "condition_id": condition_id,
                "condition_data": condition_data
            })
        
        # Process events (already in correct format)
        events_array = []
        for event in listener.get("events", []):
            event_id = event.get("event_id", str(uuid.uuid4()))
            event_data = event.get("event_data", {})
            
            # Ensure required fields in event_data
            if not event_data.get("name"):
                event_data["name"] = "unnamed_event"
            if not event_data.get("event_type"):
                event_data["event_type"] = "Gmail"
            if not event_data.get("action"):
                event_data["action"] = "notification"
            
            # Validate event_type
            if "event_type" in event_data:
                event_data["event_type"] = validate_and_correct_type(
                    event_data["event_type"],
                    EventOptions.OPTIONS,
                    "event_type"
                )
            
            # Ensure all event_data fields exist
            event_data.setdefault("message", "")
            event_data.setdefault("recipient", "")
            event_data.setdefault("number", "")
            event_data.setdefault("description", "")
            
            events_array.append({
                "event_id": event_id,
                "event_data": event_data
            })
        
        # Process accessories (already in correct format)
        accessories_array = []
        for accessory in listener.get("accessories", []):
            accessory_id = accessory.get("accessory_id", str(uuid.uuid4()))
            accessory_data = accessory.get("accessory_data", {})
            
            # Ensure required fields in accessory_data
            if not accessory_data.get("name"):
                accessory_data["name"] = "unnamed_accessory"
            if not accessory_data.get("accessory_type"):
                accessory_data["accessory_type"] = "custom"
            
            # Validate accessory_type
            if "accessory_type" in accessory_data:
                accessory_data["accessory_type"] = validate_and_correct_type(
                    accessory_data["accessory_type"],
                    AccessoryOptions.OPTIONS,
                    "accessory_type"
                )
            
            accessories_array.append({
                "accessory_id": accessory_id,
                "accessory_data": accessory_data
            })
        
        # Build complete listener object
        listener_obj = {
            "listener_id": listener_id,
            "listener_data": listener_data,
            "conditions": conditions_array,
            "events": events_array,
            "accessories": accessories_array
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
        "Notify security team if someone is detected in the parking lot after hours",
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
