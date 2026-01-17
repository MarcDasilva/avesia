"""
Email Alert Automation Script
Sends email alerts with configurable recipient, subject, and message.

Usage: python email_alert.py <recipient_email> <subject> <message>

Example:
  python email_alert.py "user@example.com" "Alert" "This is an alert message"

Or use as a module:
  from email_alert import send_email
  send_email("user@example.com", "Alert", "Message")
"""
import os
import json
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from backend/.env
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

# Email configuration from .env
SMTP_SERVER = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
SMTP_PORT = int(os.getenv('SMTP_PORT', '587'))
SENDER_EMAIL = os.getenv('SENDER_EMAIL', '')
SENDER_PASSWORD = os.getenv('SENDER_PASSWORD', '')

# Temp JSON file path
TEMP_JSON_FILE = Path(__file__).parent / 'email_alerts_temp.json'


def load_email_history():
    """Load email history from temp JSON file"""
    if TEMP_JSON_FILE.exists():
        try:
            with open(TEMP_JSON_FILE, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            return {"emails": []}
    return {"emails": []}


def save_email_history(history):
    """Save email history to temp JSON file"""
    with open(TEMP_JSON_FILE, 'w') as f:
        json.dump(history, f, indent=2)


def send_email(recipient_email, subject, message):
    """
    Send an email alert
    
    Args:
        recipient_email (str): Email address of the recipient
        subject (str): Email subject line
        message (str): Email message body
    
    Returns:
        dict: Result with success status and message
    """
    # Validate configuration
    if not SENDER_EMAIL or not SENDER_PASSWORD:
        return {
            "success": False,
            "error": "SENDER_EMAIL and SENDER_PASSWORD must be set in backend/.env"
        }
    
    if not recipient_email:
        return {
            "success": False,
            "error": "Recipient email is required"
        }
    
    # Create email
    msg = MIMEMultipart()
    msg['From'] = SENDER_EMAIL
    msg['To'] = recipient_email
    msg['Subject'] = subject
    
    # Add message body
    msg.attach(MIMEText(message, 'plain'))
    
    try:
        # Connect to SMTP server
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()  # Enable encryption
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        
        # Send email
        text = msg.as_string()
        server.sendmail(SENDER_EMAIL, recipient_email, text)
        server.quit()
        
        # Save to history
        history = load_email_history()
        email_record = {
            "timestamp": datetime.now().isoformat(),
            "recipient": recipient_email,
            "subject": subject,
            "message": message,
            "status": "sent"
        }
        history["emails"].append(email_record)
        
        # Keep only last 100 emails
        if len(history["emails"]) > 100:
            history["emails"] = history["emails"][-100:]
        
        save_email_history(history)
        
        print(f"✅ Email sent successfully to {recipient_email}")
        return {
            "success": True,
            "message": f"Email sent successfully to {recipient_email}",
            "timestamp": email_record["timestamp"]
        }
        
    except smtplib.SMTPAuthenticationError:
        error_msg = "SMTP authentication failed. Check SENDER_EMAIL and SENDER_PASSWORD in .env"
        print(f"❌ {error_msg}")
        return {"success": False, "error": error_msg}
    
    except smtplib.SMTPException as e:
        error_msg = f"SMTP error: {str(e)}"
        print(f"❌ {error_msg}")
        return {"success": False, "error": error_msg}
    
    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        print(f"❌ {error_msg}")
        return {"success": False, "error": error_msg}


def get_email_history(limit=10):
    """Get recent email history"""
    history = load_email_history()
    emails = history.get("emails", [])
    return emails[-limit:] if limit else emails


def main():
    """Command-line interface for sending emails"""
    import sys
    
    if len(sys.argv) < 4:
        print("Usage: python email_alert.py <recipient_email> <subject> <message>")
        print("\nExample:")
        print('  python email_alert.py "user@example.com" "Alert" "This is an alert message"')
        print("\nOr use as a module:")
        print("  from email_alert import send_email")
        print('  send_email("user@example.com", "Alert", "Message")')
        sys.exit(1)
    
    recipient = sys.argv[1]
    subject = sys.argv[2]
    message = sys.argv[3]
    
    result = send_email(recipient, subject, message)
    
    if result["success"]:
        print(f"✅ {result['message']}")
        sys.exit(0)
    else:
        print(f"❌ Error: {result['error']}")
        sys.exit(1)


if __name__ == "__main__":
    main()

