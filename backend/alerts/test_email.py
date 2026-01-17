"""
Test script for email alerts
Reads email configuration from email_alerts_temp.json and sends a test email
Requires email_alerts_temp.json to exist in your directory, look at email_alerts_template.json for the structure.
"""
import json
from pathlib import Path
from email_alert import send_email

# Path to the JSON file
JSON_FILE = Path(__file__).parent / 'email_alerts_temp.json'

def load_test_email():
    """Load email details from JSON file"""
    if not JSON_FILE.exists():
        print(f"❌ Error: {JSON_FILE} not found")
        return None
    
    try:
        with open(JSON_FILE, 'r') as f:
            data = json.load(f)
        
        # Get the first email entry from the JSON
        if data.get("emails") and len(data["emails"]) > 0:
            email_entry = data["emails"][0]
            return {
                "recipient": email_entry.get("recipient"),
                "subject": email_entry.get("subject"),
                "message": email_entry.get("message")
            }
        else:
            print("❌ Error: No email entries found in JSON file")
            return None
    except json.JSONDecodeError as e:
        print(f"❌ Error: Invalid JSON format - {e}")
        return None
    except Exception as e:
        print(f"❌ Error loading JSON: {e}")
        return None


def main():
    """Main test function"""
    print("📧 Loading email configuration from JSON...")
    
    email_config = load_test_email()
    
    if not email_config:
        print("\n💡 Tip: Make sure email_alerts_temp.json has at least one email entry")
        return
    
    print(f"✅ Loaded email configuration:")
    print(f"   Recipient: {email_config['recipient']}")
    print(f"   Subject: {email_config['subject']}")
    print(f"   Message: {email_config['message'][:50]}...")
    print("\n📤 Sending email...")
    
    result = send_email(
        recipient_email=email_config['recipient'],
        subject=email_config['subject'],
        message=email_config['message']
    )
    
    if result["success"]:
        print(f"\n✅ {result['message']}")
        print(f"   Timestamp: {result.get('timestamp', 'N/A')}")
    else:
        print(f"\n❌ Error: {result['error']}")
        print("\n💡 Make sure you have set SENDER_EMAIL and SENDER_PASSWORD in backend/.env")


if __name__ == "__main__":
    main()

