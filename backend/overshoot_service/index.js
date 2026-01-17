import dotenv from 'dotenv'
import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load .env from parent directory (backend folder)
const envPath = join(__dirname, '..', '.env')
const envResult = dotenv.config({ path: envPath })

// Debug: Check if .env was loaded
if (envResult.error) {
  console.error('⚠️  Warning: Could not load .env file:', envResult.error.message)
  console.log(`   Looking for .env at: ${envPath}`)
} else {
  console.log('✅ .env file loaded successfully')
}

const app = express()
app.use(express.json())
app.use(express.static(__dirname)) // Serve static files (HTML, etc.)

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000'
const NODE_SERVICE_PORT = process.env.NODE_SERVICE_PORT || 3001

let currentPrompt = process.env.INITIAL_PROMPT || 'Read any visible text'

// Debug: Check API key
const apiKey = process.env.OVERSHOOT_API_KEY
if (!apiKey || apiKey === 'your-api-key') {
  console.warn('⚠️  Warning: OVERSHOOT_API_KEY not found or is placeholder')
  console.log('   Make sure OVERSHOOT_API_KEY is set in backend/.env')
} else {
  console.log(`✅ API Key loaded (${apiKey.substring(0, 10)}...)`)
}

// Endpoint to get configuration for the HTML page
app.get('/', (req, res) => {
  const config = {
    apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
    apiKey: process.env.OVERSHOOT_API_KEY || 'your-api-key',
    prompt: currentPrompt,
    pythonBackendUrl: PYTHON_BACKEND_URL
  }
  
  // Build URL with config parameters
  const params = new URLSearchParams({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    prompt: config.prompt,
    pythonBackendUrl: config.pythonBackendUrl
  })
  
  // Redirect to the HTML page with config
  res.redirect(`/browser-runner.html?${params.toString()}`)
})

// Endpoint to update prompt from Python
app.post('/api/prompt', (req, res) => {
  const { prompt } = req.body
  
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt must be a non-empty string' })
  }

  currentPrompt = prompt

  res.json({ 
    success: true, 
    message: 'Prompt updated. Refresh the browser page to apply the new prompt.',
    prompt: currentPrompt 
  })
})

// Endpoint to start vision service (informational - the HTML page handles start/stop)
app.post('/api/start', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Vision service control is in the browser. Make sure the browser page is open at http://localhost:3001'
  })
})

// Endpoint to stop vision service (informational)
app.post('/api/stop', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Vision service control is in the browser. Use the stop button on the page or close the browser tab.'
  })
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    currentPrompt,
    message: 'Open http://localhost:3001 in your browser to start vision processing'
  })
})

// Start the Express server
app.listen(NODE_SERVICE_PORT, () => {
  console.log(`Node.js Overshoot service running on port ${NODE_SERVICE_PORT}`)
  console.log(`Python backend URL: ${PYTHON_BACKEND_URL}`)
  console.log('')
  console.log('🌐 Open your browser and navigate to:')
  console.log(`   http://localhost:${NODE_SERVICE_PORT}`)
  console.log('')
  console.log('📹 The Overshoot SDK will run in your browser with camera access.')
  console.log(`🔍 Initial prompt: "${currentPrompt}"`)
})
