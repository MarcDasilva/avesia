import { RealtimeVision } from '@overshoot/sdk'
 
const vision = new RealtimeVision({
  apiUrl: 'https://cluster1.overshoot.ai/api/v0.2',
  apiKey: 'ovs_5843dd2cf1b11eff5fb0bf41e0d73b18',
  prompt: 'Describe the video content',
  onResult: (result) => {
    console.log(result.result)
  }
})
 
await vision.start()   // starts the camera and begins processing
await vision.stop()    // stops everything