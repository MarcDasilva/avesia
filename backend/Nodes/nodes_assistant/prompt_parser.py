"""
Prompt Parser - Uses Gemini to parse natural language prompts into node configurations
Takes user input and returns structured JSON for listener, conditions, and events
"""

import os
import json
from typing import Dict, Any
from google import genai
from dotenv import load_dotenv
import sys

# Add parent directory to path to import node_options
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from node_options import ConditionOptions, ListenerOptions, EventOptions, AccessoryOptions

load_dotenv()

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    client = genai.Client(api_key=GEMINI_API_KEY)
else:
    client = None
    print("⚠️  Warning: GEMINI_API_KEY not found in environment variables")


SYSTEM_PROMPT = f"""You are a smart assistant that converts natural language automation requests into structured node configurations.

USER INPUT: A natural language description of what they want to monitor and what actions to take.

YOUR TASK: Parse the input and return a JSON structure with listener(s), condition(s), and event(s).

AVAILABLE OPTIONS:
Listener Types:
{json.dumps(ListenerOptions.OPTIONS, indent=2)}

Condition Types:
{json.dumps(ConditionOptions.OPTIONS, indent=2)}

Event Types:
{json.dumps(EventOptions.OPTIONS, indent=2)}

Accessory Types:
{json.dumps(AccessoryOptions.OPTIONS, indent=2)}

OUTPUT FORMAT (return ONLY valid JSON, no markdown):
{{
  "listeners": [
    {{
      "listener_id": "unique_id",
      "listener_data": {{
        "name": "descriptive_name",
        "listener_type": "one of the listener types from the list above",
        "description": "description of what to detect"
      }},
      "conditions": [
        {{
          "condition_id": "unique_id",
          "condition_data": {{
            "name": "descriptive_name",
            "condition_type": "one of the condition types from the list above",
            "description": "description of the condition"
          }}
        }}
      ],
      "events": [
        {{
          "event_id": "unique_id",
          "event_data": {{
            "name": "descriptive_name",
            "event_type": "one of the event types from the list above",
            "action": "notification",
            "message": "message text",
            "recipient": "email or phone",
            "number": "phone number if applicable",
            "description": "description of the event"
          }}
        }}
      ],
      "accessories": [
        {{
          "accessory_id": "unique_id",
          "accessory_data": {{
            "name": "descriptive_name",
            "accessory_type": "one of the accessory types from the list above"
          }}
        }}
      ]
    }}
  ]
}}

PARSING RULES:
1. **Listeners**: Identify WHAT to monitor/detect
   - "detect motion" → motion listener
   - "watch for cars" → object listener
   - "monitor temperature" → custom listener with sensor type
   - "recognize faces" → face listener

2. **Conditions**: Identify WHEN or UNDER WHAT CIRCUMSTANCES
   - "at night" → lighting condition (day/night/low-light)
   - "when temperature exceeds 75" → custom condition with threshold
   - "during business hours" → time condition
   - "in the parking lot" → zone condition
   - "if it rains" → weather condition

3. **Events**: Identify WHAT ACTIONS to take
   - "send email" → Email event
   - "send text" → Text event
   - "notify security team" → Email event with recipient
   - "record video" → custom event with action details

4. **Accessories**: Identify SMART DEVICES to control
   - "turn on lights" → Smart Light Bulb accessory
   - "lock the door" → Smart Lock accessory
   - "adjust temperature" → Smart Thermostat accessory
   - "activate camera" → Smart Camera accessory

5. **Multiple Items**: If the user describes multiple scenarios, create multiple listeners/conditions/events/accessories

6. **Smart Matching**: Match user descriptions to the closest available option from the lists above

7. **IDs**: Generate unique IDs for all items (listener_id, condition_id, event_id, accessory_id)

EXAMPLES:

Input: "Alert me via email when motion is detected at night"
Output:
{{
  "listeners": [
    {{
      "listener_id": "listener_001",
      "listener_data": {{
        "name": "motion_detector",
        "listener_type": "motion",
        "description": "Detect motion activity"
      }},
      "conditions": [
        {{
          "condition_id": "condition_001",
          "condition_data": {{
            "name": "nighttime",
            "condition_type": "lighting: day/night/low-light",
            "description": "Only trigger at night"
          }}
        }}
      ],
      "events": [
        {{
          "event_id": "event_001",
          "event_data": {{
            "name": "email_alert",
            "event_type": "Email",
            "action": "notification",
            "message": "Motion detected at night",
            "recipient": "",
            "number": "",
            "description": "Send email notification"
          }}
        }}
      ],
      "accessories": []
    }}
  ]
}}

Input: "Send me a text when someone approaches the door at night and turn on the lights"
Output:
{{
  "listeners": [
    {{
      "listener_id": "listener_002",
      "listener_data": {{
        "name": "person_detector",
        "listener_type": "object (person, car, animal, package)",
        "description": "Detect person approaching door"
      }},
      "conditions": [
        {{
          "condition_id": "condition_002",
          "condition_data": {{
            "name": "nighttime",
            "condition_type": "lighting: day/night/low-light",
            "description": "Only at night"
          }}
        }}
      ],
      "events": [
        {{
          "event_id": "event_002",
          "event_data": {{
            "name": "text_notification",
            "event_type": "Text",
            "action": "notification",
            "message": "Person detected at door",
            "recipient": "",
            "number": "",
            "description": "Send text message"
          }}
        }}
      ],
      "accessories": [
        {{
          "accessory_id": "accessory_001",
          "accessory_data": {{
            "name": "front_light",
            "accessory_type": "Smart Light Bulb"
          }}
        }}
      ]
    }}
  ]
}}

Now parse the user's input and return ONLY the JSON output."""


def parse_prompt_with_gemini(user_prompt: str) -> Dict[str, Any]:
    """
    Parse a natural language prompt into structured node configuration.
    
    Args:
        user_prompt: Natural language description of automation request
        
    Returns:
        Dictionary with listeners, conditions, and events structure
    """
    if not client:
        raise ValueError("GEMINI_API_KEY not configured. Please set it in your .env file.")
    
    try:
        # Send to Gemini
        response = client.models.generate_content(
            model='models/gemini-2.5-flash',
            contents=f"{SYSTEM_PROMPT}\n\nUSER INPUT:\n{user_prompt}"
        )
        
        # Parse response
        response_text = response.text.strip()
        
        # Remove markdown code blocks if present
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()
        
        # Parse JSON
        result = json.loads(response_text)
        
        # Validate structure
        if "listeners" not in result:
            result["listeners"] = []
        
        # Count nested items
        total_conditions = sum(len(listener.get("conditions", [])) for listener in result["listeners"])
        total_events = sum(len(listener.get("events", [])) for listener in result["listeners"])
        total_accessories = sum(len(listener.get("accessories", [])) for listener in result["listeners"])
        
        print(f"✅ Parsed prompt successfully")
        print(f"   Listeners: {len(result['listeners'])}")
        print(f"   Conditions: {total_conditions}")
        print(f"   Events: {total_events}")
        print(f"   Accessories: {total_accessories}")
        
        return result
        
    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse Gemini response as JSON: {e}")
        print(f"Response was: {response_text[:500]}...")
        raise
    except Exception as e:
        print(f"❌ Error processing with Gemini: {e}")
        raise


def parse_prompt(user_prompt: str) -> Dict[str, Any]:
    """
    Main function to parse user prompt.
    Alias for parse_prompt_with_gemini for cleaner imports.
    """
    return parse_prompt_with_gemini(user_prompt)


if __name__ == "__main__":
    # Example usage
    print("="*70)
    print("PROMPT PARSER - Natural Language to Node Configuration")
    print("="*70)
    
    # Test examples
    test_prompts = [
        "Alert me via email when motion is detected at night",
        "Send me a text if a package is delivered to my front door",
        "Notify security team if someone is detected in the parking lot after hours",
        "If it's raining and someone approaches the door, send me an alert"
    ]
    
    for i, prompt in enumerate(test_prompts, 1):
        print(f"\n{'='*70}")
        print(f"TEST {i}: {prompt}")
        print('='*70)
        
        try:
            result = parse_prompt(prompt)
            print("\n📋 PARSED RESULT:")
            print(json.dumps(result, indent=2))
            
            # Save to file
            output_file = f"parsed_prompt_{i}.json"
            with open(output_file, 'w') as f:
                json.dump(result, f, indent=2)
            print(f"\n💾 Saved to: {output_file}")
            
        except Exception as e:
            print(f"\n⚠️  Error: {e}")
        
        print()
