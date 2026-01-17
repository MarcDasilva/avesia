"""
Python backend server to receive and process Overshoot RealtimeVision data
Run this first, then run the overshoot.js Node.js script
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
from datetime import datetime


class OvershootDataHandler(BaseHTTPRequestHandler):
    """HTTP request handler for receiving Overshoot data"""
    
    def do_POST(self):
        """Handle POST requests from the JavaScript Overshoot client"""
        if self.path == '/overshoot-data':
            # Read the data sent from JavaScript
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                # Parse the JSON data
                data = json.loads(post_data.decode('utf-8'))
                
                # Process the received data
                print("\n" + "=" * 60)
                print(f"📥 RECEIVED DATA AT {datetime.now().strftime('%H:%M:%S')}")
                print("=" * 60)
                
                # Print the vision result
                if 'result' in data:
                    print(f"🔍 Vision Result: {data['result']}")
                
                # Print all other fields
                for key, value in data.items():
                    if key != 'result':
                        print(f"   {key}: {value}")
                
                print("=" * 60)
                
                # Here you can add your backend processing logic
                self.process_overshoot_data(data)
                
                # Send success response
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode())
                
            except Exception as e:
                print(f"❌ Error processing data: {e}")
                self.send_response(500)
                self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def process_overshoot_data(self, data):
        """
        Process the Overshoot data for backend operations
        Add your custom processing logic here
        """
        # Example: Save to database, trigger actions, analyze text, etc.
        result = data.get('result', '')
        
        # Example processing: detect keywords
        keywords = ['error', 'warning', 'success', 'complete']
        found_keywords = [kw for kw in keywords if kw.lower() in result.lower()]
        
        if found_keywords:
            print(f"🔑 Keywords detected: {', '.join(found_keywords)}")
        
        # Add your custom backend processing here
        # - Save to database
        # - Trigger workflows
        # - Send notifications
        # - Analyze patterns
        # etc.
    
    def log_message(self, format, *args):
        """Suppress default HTTP logging"""
        pass


def main():
    """Start the Python backend server"""
    port = 3001
    server_address = ('', port)
    
    print("=" * 60)
    print("🚀 OVERSHOOT PYTHON BACKEND SERVER")
    print("=" * 60)
    print(f"✓ Server running on http://localhost:{port}")
    print(f"✓ Endpoint: http://localhost:{port}/overshoot-data")
    print("=" * 60)
    print("📝 Waiting for data from overshoot.js...")
    print("   Run: node overshoot.js")
    print("=" * 60)
    
    httpd = HTTPServer(server_address, OvershootDataHandler)
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n🛑 Server stopped")
        httpd.shutdown()


if __name__ == "__main__":
    main()
