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

// Python backend URL - defaults to port 3001 to match unified backend
// Can be overridden via PYTHON_BACKEND_URL env var if backend runs on different port
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:3001'
const NODE_SERVICE_PORT = process.env.NODE_SERVICE_PORT || 3001

let currentPrompt = process.env.INITIAL_PROMPT || 'explain surroundings'
let currentNodes = []
let currentOutputSchema = null

// Debug: Check API key
const apiKey = process.env.OVERSHOOT_API_KEY
if (!apiKey || apiKey === 'your-api-key') {
  console.warn('⚠️  Warning: OVERSHOOT_API_KEY not found or is placeholder')
  console.log('   Make sure OVERSHOOT_API_KEY is set in backend/.env')
} else {
  console.log(`✅ API Key loaded (${apiKey.substring(0, 10)}...)`)
}

// Endpoint to get current nodes configuration
app.get('/api/nodes', (req, res) => {
  res.json({
    nodes: currentNodes,
    outputSchema: currentOutputSchema,
    prompt: currentPrompt
  })
})

// Endpoint to get configuration for the HTML page
app.get('/', async (req, res) => {
  // If nodes haven't been set yet, try to fetch from Python backend
  if (currentNodes.length === 0) {
    try {
      const axios = (await import('axios')).default
      const response = await axios.get(`${PYTHON_BACKEND_URL}/api/nodes`, { timeout: 2000 })
      if (response.data && response.data.nodes) {
        currentNodes = response.data.nodes || []
        // Note: outputSchema and prompt would need to be regenerated, but for now just use what we have
        console.log('📥 Fetched nodes from Python backend:', currentNodes.length)
      }
    } catch (e) {
      console.log('⚠️  Could not fetch nodes from Python backend (it may not be running)')
    }
  }
  
  const config = {
    apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
    apiKey: process.env.OVERSHOOT_API_KEY || 'your-api-key',
    prompt: currentPrompt,
    pythonBackendUrl: PYTHON_BACKEND_URL,
    nodes: currentNodes.length > 0 ? JSON.stringify(currentNodes) : '',
    outputSchema: currentOutputSchema ? JSON.stringify(currentOutputSchema) : ''
  }
  
  // Build URL with config parameters
  const params = new URLSearchParams({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    prompt: config.prompt,
    pythonBackendUrl: config.pythonBackendUrl
  })
  
  // Add nodes and schema if they exist (using shorter parameter names)
  if (config.nodes) {
    params.append('nodes', config.nodes)
  }
  if (config.outputSchema) {
    params.append('schema', config.outputSchema)
  }
  
  // Redirect to the HTML page with config
  res.redirect(`/browser-runner.html?${params.toString()}`)
})

// Endpoint to update nodes from Python
app.post('/api/nodes', (req, res) => {
  const { nodes, outputSchema, prompt } = req.body
  
  if (!nodes || !Array.isArray(nodes)) {
    return res.status(400).json({ error: 'Nodes must be an array' })
  }

  currentNodes = nodes
  currentOutputSchema = outputSchema || null
  currentPrompt = prompt || currentPrompt

  console.log('📦 Nodes updated:', {
    nodeCount: currentNodes.length,
    hasSchema: !!currentOutputSchema,
    prompt: currentPrompt.substring(0, 50) + '...'
  })

  res.json({ 
    success: true, 
    message: 'Nodes updated. Refresh the browser page to apply the new configuration.',
    nodes: currentNodes,
    outputSchema: currentOutputSchema,
    prompt: currentPrompt 
  })
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
    nodesCount: currentNodes.length,
    hasOutputSchema: !!currentOutputSchema,
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
