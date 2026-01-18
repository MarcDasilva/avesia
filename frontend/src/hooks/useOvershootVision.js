import { useState, useRef, useEffect, useCallback } from "react";
import { overshootAPI } from "../lib/api";

/**
 * Custom React hook for Overshoot SDK integration
 * Handles camera feed processing with Overshoot SDK
 */
export function useOvershootVision(config = {}) {
  const {
    apiUrl,
    apiKey,
    onResult,
    onError,
  } = config;

  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const visionRef = useRef(null);
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const resultCountRef = useRef(0);
  const changeDetectionIntervalRef = useRef(null);
  const lastFrameRef = useRef(null);
  const stillnessTimerRef = useRef(null);
  const canvasRef = useRef(null);
  const isVisionActiveRef = useRef(false);
  const isConnectingRef = useRef(false);

  // Helper function to log with timestamp (only important events)
  const logWithTimestamp = (message, data = null, level = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    if (level === "error") {
      console.error(`[${timestamp}] ${message}`, data || "");
    } else if (level === "warn") {
      console.warn(`[${timestamp}] ${message}`, data || "");
    } else {
      // Only log important info, skip verbose details
      console.log(`[${timestamp}] ${message}`);
    }
  };

  // Helper to log debug info (only in development, less verbose)
  const logDebug = (message, data = null) => {
    if (import.meta.env.DEV) {
      // Only log in development, and make it less verbose
      if (data && typeof data === 'object') {
        console.log(`[Debug] ${message}`);
      } else {
        console.log(`[Debug] ${message}`, data || "");
      }
    }
  };

  // Initialize Overshoot SDK
  const initializeSDK = useCallback(async () => {
    if (visionRef.current) {
      return visionRef.current;
    }

    try {
      // Fetch config and nodes from backend
      const [sdkConfig, nodesConfig] = await Promise.all([
        overshootAPI.getConfig(),
        overshootAPI.getNodes(),
      ]);

      const finalApiUrl = apiUrl || sdkConfig.apiUrl;
      const finalApiKey = apiKey || sdkConfig.apiKey;

      if (!finalApiKey || finalApiKey === "your-api-key") {
        throw new Error(
          "Overshoot API key not configured. Please set OVERSHOOT_API_KEY in backend/.env"
        );
      }

      logWithTimestamp(`✅ Config loaded (${nodesConfig.nodes?.length || 0} nodes)`);

      // Dynamically import Overshoot SDK
      const { RealtimeVision } = await import(
        "https://cdn.jsdelivr.net/npm/@overshoot/sdk@0.1.0-alpha.2/dist/index.mjs"
      );

      const visionConfig = {
        apiUrl: finalApiUrl,
        apiKey: finalApiKey,
        prompt: nodesConfig.prompt || "Read any visible text",
        onResult: async (result) => {
          resultCountRef.current++;
          const timestamp = new Date().toISOString();

          // Parse result if it's JSON
          let parsedResult = result.result;
          let isJson = false;

          if (nodesConfig.outputSchema && Object.keys(nodesConfig.outputSchema).length > 0) {
            try {
              parsedResult = JSON.parse(result.result);
              isJson = true;
            } catch (e) {
              // Silent fail for parsing
            }
          }

          // Only log every 5th result to reduce console noise
          if (resultCountRef.current % 5 === 0) {
            if (isJson) {
              logWithTimestamp(`Result #${resultCountRef.current}: ${Object.keys(parsedResult).join(", ")}`);
            } else {
              logWithTimestamp(`Result #${resultCountRef.current}`);
            }
          }

          // Send to backend (non-blocking)
          try {
            await overshootAPI.sendResult(
              parsedResult,
              timestamp,
              nodesConfig.prompt,
              nodesConfig.nodes?.length > 0 ? "structured" : null
            );
          } catch (err) {
            // Silent fail - backend might be slow
          }

          // Call custom onResult callback if provided
          if (onResult) {
            onResult(parsedResult, isJson, timestamp);
          }
        },
        onError: (error) => {
          const errorMsg = error.message || error.toString();
          
          // Only log significant errors
          if (!errorMsg.includes("WebSocket is closed") && !errorMsg.includes("before the connection")) {
            logWithTimestamp(`❌ SDK error: ${errorMsg}`, null, "error");
          }

          // Check stream health
          if (streamRef.current) {
            const activeTracks = streamRef.current
              .getTracks()
              .filter((t) => t.readyState === "live");

            if (activeTracks.length === 0) {
              logWithTimestamp("❌ Camera stream lost", null, "error");
              setError("Camera stream lost. Please restart.");
              setIsActive(false);
            }
          }

          // Handle specific error types
          if (
            errorMsg.includes("stream_not_found") ||
            errorMsg.includes("Keepalive failed")
          ) {
            logWithTimestamp("⚠️ Connection lost - restarting...", null, "warn");
          }

          if (onError) {
            onError(error);
          }
          setError(errorMsg);
        },
      };

      // Add outputSchema if configured
      if (nodesConfig.outputSchema && Object.keys(nodesConfig.outputSchema).length > 0) {
        visionConfig.outputSchema = nodesConfig.outputSchema;
      }

      const vision = new RealtimeVision(visionConfig);
      visionRef.current = vision;

      return vision;
    } catch (err) {
      logWithTimestamp(`❌ SDK init failed: ${err.message}`, null, "error");
      throw err;
    }
  }, [apiUrl, apiKey, onResult, onError]);

  const stopChangeDetection = useCallback(() => {
    if (changeDetectionIntervalRef.current) {
      clearInterval(changeDetectionIntervalRef.current);
      changeDetectionIntervalRef.current = null;
    }
    if (stillnessTimerRef.current) {
      clearTimeout(stillnessTimerRef.current);
      stillnessTimerRef.current = null;
    }
    lastFrameRef.current = null;
    logDebug("Change detection stopped.");
  }, []);

  const startChangeDetection = useCallback(async () => {
    stopChangeDetection(); // Stop any existing detection

    if (!videoRef.current) {
      logWithTimestamp("⚠️ Video element not ready for change detection", null, "warn");
      return;
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const width = 32;
    const height = 18;
    canvas.width = width;
    canvas.height = height;

    const getDownscaledFrameData = () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended || videoRef.current.videoWidth === 0) {
        return null;
      }
      try {
        context.drawImage(videoRef.current, 0, 0, width, height);
        return context.getImageData(0, 0, width, height).data;
      } catch (e) {
        logDebug("Error getting frame data", e.name);
        return null;
      }
    };

    lastFrameRef.current = getDownscaledFrameData();

    changeDetectionIntervalRef.current = setInterval(async () => {
      const currentFrameData = getDownscaledFrameData();
      if (!currentFrameData) {
        return;
      }

      if (lastFrameRef.current) {
        let diff = 0;
        for (let i = 0; i < currentFrameData.length; i++) {
            diff += Math.abs(lastFrameRef.current[i] - currentFrameData[i]);
        }
        
        const avgDiff = diff / currentFrameData.length;
        const threshold = 5; // Tunable threshold

        if (avgDiff > threshold) {
          logDebug(`Change detected (diff: ${avgDiff.toFixed(2)})`);
          
          if (!isVisionActiveRef.current && !isConnectingRef.current) {
            isConnectingRef.current = true;
            try {
                logWithTimestamp("🚀 Significant change detected. Starting vision service...");
                const vision = await initializeSDK();
                await vision.start();
                isVisionActiveRef.current = true;
                setIsActive(true); // Update state for UI
                logWithTimestamp("✅ Vision service active.");
            } catch (err) {
                logWithTimestamp(`❌ Failed to start vision on-demand: ${err.message}`, null, "error");
                setError(err.message);
            } finally {
                isConnectingRef.current = false;
            }
          }

          // Reset stillness timer
          if (stillnessTimerRef.current) {
            clearTimeout(stillnessTimerRef.current);
          }
          
          stillnessTimerRef.current = setTimeout(() => {
            logWithTimestamp("🎥 Scene appears still. Stopping vision service to save resources.");
            if (visionRef.current && isVisionActiveRef.current) {
              visionRef.current.stop();
              visionRef.current = null; // Force re-initialization on next start
              isVisionActiveRef.current = false;
              setIsActive(false); // Update state for UI
              logWithTimestamp("✅ Vision service stopped.");
            }
          }, 5000); // 5 seconds of stillness
        }
      }
      
      lastFrameRef.current = currentFrameData;

    }, 500); // Check for changes twice per second

  }, [initializeSDK, stopChangeDetection]);

  // Start vision processing
  const start = useCallback(async () => {
    if (isConnecting) { // Simpler check
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      logWithTimestamp("🚀 Starting camera and change detection...");

      // Get camera stream
      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user",
          },
          audio: false,
        }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Camera stream request timed out after 10 seconds")),
            10000
          )
        ),
      ]);

      streamRef.current = stream;

      // CRITICAL: Set video element with stream BEFORE starting detection
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Muted and playsinline are important for autoplay
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play().catch(e => logDebug("Play error (ignorable on start)", e.name));
      } else {
        logWithTimestamp("⚠️ Video element not found. Preview will not be available.", null, "warn");
      }

      // Instead of starting vision directly, start change detection
      await startChangeDetection();
      
      setIsConnecting(false); 
      logWithTimestamp("👀 Change detection active. Waiting for significant movement.");

    } catch (err) {
      logWithTimestamp(`❌ Failed to start: ${err.message}`, null, "error");
      setError(err.message);
      setIsConnecting(false);
      setIsActive(false);

      // Cleanup on error
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      throw err;
    }
  }, [isConnecting, startChangeDetection]);

  // Stop vision processing
  const stop = useCallback(async () => {
    logWithTimestamp("⏸️ Stopping all processes...");
    
    stopChangeDetection();

    if (visionRef.current) {
      try {
        await visionRef.current.stop();
        visionRef.current = null; // Clear the instance
      } catch (e) {
        logDebug("Error stopping vision service", e.name);
      }
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    isConnectingRef.current = false;
    isVisionActiveRef.current = false; // Reset ref
    setIsActive(false);
    setIsConnecting(false);
    setError(null);
    resultCountRef.current = 0;
    logWithTimestamp("✅ System stopped.");
  }, [stopChangeDetection]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      // Only cleanup on unmount, not when dependencies change
      stop(); // Use the main stop function for cleanup
    };
  }, [stop]); // Dependency on stop ensures it has the latest callbacks

  return {
    isActive,
    isConnecting,
    error,
    start,
    stop,
    videoRef,
  };
}

