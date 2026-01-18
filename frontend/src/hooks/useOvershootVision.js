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

  // Start vision processing
  const start = useCallback(async () => {
    if (isActive || isConnecting) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      logWithTimestamp("🚀 Starting...");

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

      // CRITICAL: Set video element with stream BEFORE SDK starts
      // The SDK gets the stream internally, but we need to display it in our video element
      // MediaStream tracks can be shared, so both can use the same stream
      
      // Wait for video element to be in DOM - it should be rendered by now
      // But we'll wait a bit more and check multiple times
      let attempts = 0;
      const maxAttempts = 10;
      while (!videoRef.current && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      if (!videoRef.current) {
        logWithTimestamp("⚠️ Video element not found after waiting", null, "warn");
        logWithTimestamp("⚠️ Make sure video element is rendered before starting camera", null, "warn");
        // Continue anyway - SDK will still work, just no preview
      }
      
      if (videoRef.current) {
        // Check if element is in DOM
        if (!videoRef.current.isConnected) {
          logWithTimestamp("⚠️ Video element not in DOM", null, "warn");
        }
        
        // Set the stream
        videoRef.current.srcObject = stream;
        logDebug("Stream set on video element", {
          hasStream: !!videoRef.current.srcObject,
          tracks: stream.getVideoTracks().length
        });
        
        // Ensure video plays - this is critical
        const playVideo = async () => {
          if (!videoRef.current) return;
          try {
            // Force play
            await videoRef.current.play();
            logDebug("Video play() called successfully");
          } catch (playError) {
            logDebug("Video play() error (may still work)", playError.name);
            // Try again after a moment - sometimes autoplay is blocked initially
            setTimeout(async () => {
              if (videoRef.current && videoRef.current.paused) {
                try {
                  await videoRef.current.play();
                  logDebug("Video play() retry successful");
                } catch (e) {
                  // Ignore - might be autoplay policy
                }
              }
            }, 500);
          }
        };
        
        await playVideo();
        
        // Set up event listeners to ensure video stays active
        const onLoadedMetadata = () => {
          logDebug("Video metadata loaded", {
            width: videoRef.current?.videoWidth,
            height: videoRef.current?.videoHeight,
            readyState: videoRef.current?.readyState
          });
          // Ensure it's playing
          if (videoRef.current && videoRef.current.paused) {
            videoRef.current.play().catch(() => {});
          }
        };
        
        const onCanPlay = () => {
          logDebug("Video can play");
          if (videoRef.current && videoRef.current.paused) {
            videoRef.current.play().catch(() => {});
          }
        };
        
        videoRef.current.addEventListener('loadedmetadata', onLoadedMetadata);
        videoRef.current.addEventListener('canplay', onCanPlay);
        
        // Store cleanup function
        videoRef.current._cleanupVideoListeners = () => {
          if (videoRef.current) {
            videoRef.current.removeEventListener('loadedmetadata', onLoadedMetadata);
            videoRef.current.removeEventListener('canplay', onCanPlay);
          }
        };
        
        // Set up periodic check to ensure video stays playing
        const playInterval = setInterval(() => {
          if (videoRef.current) {
            // Check if stream is still attached
            if (!videoRef.current.srcObject) {
              logDebug("Video srcObject was cleared - reattaching");
              videoRef.current.srcObject = stream;
            }
            // Ensure it's playing
            if (videoRef.current.paused && isActive) {
              videoRef.current.play().catch(() => {});
            }
          }
        }, 1000);
        
        // Store interval ID to clear later
        videoRef.current._playInterval = playInterval;
        
        // Wait for video to initialize
        await new Promise((resolve) => {
          if (videoRef.current) {
            if (videoRef.current.readyState >= 2) {
              resolve();
            } else {
              const onReady = () => {
                if (videoRef.current) {
                  videoRef.current.removeEventListener('loadedmetadata', onReady);
                }
                resolve();
              };
              videoRef.current.addEventListener('loadedmetadata', onReady);
              setTimeout(resolve, 1000); // Longer wait to ensure video is ready
            }
          } else {
            resolve();
          }
        });
        
        logDebug("Video element setup complete", {
          hasSrcObject: !!videoRef.current.srcObject,
          paused: videoRef.current.paused,
          readyState: videoRef.current.readyState
        });
      } else {
        logWithTimestamp("❌ Video element ref is null", null, "error");
      }

      // Monitor stream health
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (isActive) {
            logWithTimestamp("⚠️ Camera track ended", null, "warn");
            setError("Camera stream lost. Please restart.");
            setIsActive(false);
          }
        };

        track.onerror = (error) => {
          if (isActive) {
            logWithTimestamp("❌ Camera track error", null, "error");
            setError("Camera stream error. Please restart.");
            setIsActive(false);
          }
        };
      });

      // Initialize and start SDK
      const vision = await initializeSDK();
      logWithTimestamp("⏳ Connecting...");

      await Promise.race([
        vision.start(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Connection timeout")),
            30000
          )
        ),
      ]);

      logWithTimestamp("✅ Camera active");

      setIsActive(true);
      setIsConnecting(false);
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
  }, [isActive, isConnecting, apiKey, initializeSDK]);

  // Stop vision processing
  const stop = useCallback(async () => {
    if (!isActive && !isConnecting) {
      return;
    }

    try {
      logWithTimestamp("⏸️ Stopping...");

      if (visionRef.current) {
        await visionRef.current.stop();
        visionRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (videoRef.current) {
        // Clear play interval if it exists
        if (videoRef.current._playInterval) {
          clearInterval(videoRef.current._playInterval);
          delete videoRef.current._playInterval;
        }
        // Clean up event listeners
        if (videoRef.current._cleanupVideoListeners) {
          videoRef.current._cleanupVideoListeners();
          delete videoRef.current._cleanupVideoListeners;
        }
        videoRef.current.srcObject = null;
      }

      setIsActive(false);
      setIsConnecting(false);
      setError(null);
      resultCountRef.current = 0;
      logWithTimestamp("✅ Stopped");
    } catch (err) {
      logWithTimestamp(`❌ Error stopping: ${err.message}`, null, "error");
      setError(err.message);
    }
  }, [isActive, isConnecting]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      // Only cleanup on unmount, not when dependencies change
      if (visionRef.current) {
        visionRef.current.stop().catch(() => {
          // Ignore errors during cleanup
        });
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, []); // Empty dependency array - only run on mount/unmount

  return {
    isActive,
    isConnecting,
    error,
    start,
    stop,
    videoRef,
  };
}

