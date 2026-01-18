"""
Node Options - Centralized list of dropdown options for different node types
"""


class ConditionOptions:
    """Available condition type options"""
    OPTIONS = [
        "weather: rain/snow/fog",
        "lighting: day/night/low-light",
        "time",
        "zone",
        "duration",
        "frequency",
        "custom",
    ]


class ListenerOptions:
    """Available listener type options"""
    OPTIONS = [
        "object (person, car, animal, package)",
        "activity (walking, running, fighting)",
        "motion",
        "face (known / unknown)",
        "license_plate",
        "gesture (hands up, waving)",
        "custom_prompt (natural language)",
        "custom",
    ]


class EventOptions:
    """Available event type options (if needed in the future)"""
    OPTIONS = [
        "Email", "Text", "Emergency"
    ]


class AccessoryOptions:
    """Available accessory type options"""
    OPTIONS = [
        "Smart Light Bulb",
        "Smart Plug",
        "Motion Sensor",
        "Smart Switch",
        "Smart Lock",
        "Smart Thermostat",
    ]
