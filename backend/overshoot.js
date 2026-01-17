import { RealtimeVision } from '@overshoot/sdk'

// Python backend server endpoint
const PYTHON_BACKEND = 'http://localhost:3001/overshoot-data'

// Function to send data to Python backend
async function sendToPython(data) {
  try {
    const response = await fetch(PYTHON_BACKEND, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    })
    
    if (response.ok) {
      console.log('✓ Data sent to Python backend')
    } else {
      console.error('✗ Failed to send to Python:', response.status)
    }
  } catch (error) {
    console.error('✗ Error sending to Python:', error.message)
  }
}

const vision = new RealtimeVision({
  apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
  apiKey: 'ovs_5843dd2cf1b11eff5fb0bf41e0d73b18',
  prompt: 'Read any visible text',
  source: { type: 'camera', cameraFacing: 'environment' },
  onResult: async (result) => {
    console.log('📸 Overshoot Result:', result.result)
    
    // Send the result to Python backend for processing
    await sendToPython({
      result: result.result,
      timestamp: new Date().toISOString(),
      source: 'overshoot-realtime-vision'
    })
  }
})

console.log('🚀 Starting Overshoot RealtimeVision...')
console.log('📡 Will send data to Python backend at', PYTHON_BACKEND)

await vision.start()   // starts the camera and begins processing

// Keep running for 30 seconds (adjust as needed)
setTimeout(async () => {
  await vision.stop()
  console.log('🛑 Overshoot stopped')
  process.exit(0)
}, 30000) 