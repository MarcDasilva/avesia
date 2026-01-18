import { useState, useRef, useEffect, useCallback } from "react";
import { overshootAPI } from "../lib/api";

/**
 * Custom React hook for Overshoot SDK integration
 * Handles camera feed processing with Overshoot SDK
 */
export function useOvershootVision(config = {}) {
  const { apiUrl, apiKey, onResult, onError, prompt, outputSchema } = config;

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
      if (data && typeof data === "object") {
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
      // Use provided prompt (fastest path - no fetch needed)
      let finalPrompt = prompt;
      let finalOutputSchema = outputSchema;

      // Fetch config in parallel with nodes (if needed) for maximum speed
      const promises = [overshootAPI.getConfig()];

      // Only fetch nodes if no prompt provided
      if (!finalPrompt) {
        promises.push(overshootAPI.getNodes());
      }

      // Wait for all needed data in parallel (much faster)
      const results = await Promise.all(promises);
      const sdkConfig = results[0];

      const finalApiUrl = apiUrl || sdkConfig.apiUrl;
      const finalApiKey = apiKey || sdkConfig.apiKey;

      if (!finalApiKey || finalApiKey === "your-api-key") {
        throw new Error(
          "Overshoot API key not configured. Please set OVERSHOOT_API_KEY in backend/.env"
        );
      }

      // If we fetched nodes, use them now
      if (!finalPrompt && results.length > 1) {
        const nodesConfig = results[1];
        finalPrompt = nodesConfig.prompt || "Read any visible text";
        finalOutputSchema = nodesConfig.outputSchema;
        logWithTimestamp(
          `✅ Using default config (${nodesConfig.nodes?.length || 0} nodes)`
        );
      } else if (finalPrompt) {
        logWithTimestamp(`✅ Using project-specific prompt`);
      }

      // Dynamically import Overshoot SDK (do this early, in parallel if possible)
      // This import is cached by the browser, so it's fast on subsequent calls
      const { RealtimeVision } = await import(
        "https://cdn.jsdelivr.net/npm/@overshoot/sdk@0.1.0-alpha.2/dist/index.mjs"
      );

      // Debug: Log the prompt being sent to Overshoot
      console.log(`🎯 Overshoot SDK Prompt:`, finalPrompt);
      console.log(`📋 Output Schema:`, finalOutputSchema);

      // For camera feeds, Overshoot SDK auto-detects camera stream
      // No explicit source needed - SDK will use getUserMedia stream automatically
      // However, we should explicitly set source: { type: "camera" } for clarity
      // But since we don't have the stream yet (parallel initialization), we'll let SDK auto-detect
      const visionConfig = {
        apiUrl: finalApiUrl,
        apiKey: finalApiKey,
        prompt: finalPrompt,
        // Source not set here - SDK will auto-detect camera when start() is called
        // This allows parallel initialization for faster connection
        // Real-time optimization: make onResult synchronous for immediate processing
        onResult: (result) => {
          // DEBUG: Log that callback was triggered
          console.log("🔔 onResult callback triggered!", result);

          // Process immediately (synchronous) for lowest latency
          resultCountRef.current++;
          const timestamp = new Date().toISOString();

          // Parse result if it's JSON (synchronous, no async/await delays)
          let parsedResult = result.result;
          let isJson = false;

          if (finalOutputSchema && Object.keys(finalOutputSchema).length > 0) {
            try {
              parsedResult = JSON.parse(result.result);
              isJson = true;
            } catch (e) {
              // Silent fail for parsing
            }
          }

          // Log immediately (synchronous) - no async delays
          // Include the prompt that was used for this result to verify alignment
          if (isJson) {
            console.log(
              `🔍 Overshoot Result #${resultCountRef.current}`,
              `\n📝 Prompt Used: "${finalPrompt}"`,
              `\n📊 Result:`,
              parsedResult
            );
            logWithTimestamp(
              `Result #${resultCountRef.current} (${Object.keys(
                parsedResult
              ).join(", ")})`
            );
          } else {
            console.log(
              `🔍 Overshoot Result #${resultCountRef.current}`,
              `\n📝 Prompt Used: "${finalPrompt}"`,
              `\n📊 Result:`,
              parsedResult
            );
            logWithTimestamp(
              `Result #${resultCountRef.current}: ${parsedResult}`
            );
          }

          // Call custom onResult callback immediately (synchronous)
          if (onResult) {
            onResult(parsedResult, isJson, timestamp);
          }

          // Send to backend asynchronously (fire and forget, no blocking)
          // Use setTimeout(0) to ensure callback completes first
          setTimeout(() => {
            overshootAPI
              .sendResult(
                parsedResult,
                timestamp,
                finalPrompt,
                finalOutputSchema && Object.keys(finalOutputSchema).length > 0
                  ? "structured"
                  : null
              )
              .catch((err) => {
                // Silent fail - backend might be slow
                if (import.meta.env.DEV) {
                  console.warn("Failed to send result to backend:", err);
                }
              });
          }, 0);
        },
        onError: (error) => {
          const errorMsg = error.message || error.toString();

          // DEBUG: Always log errors to help diagnose issues
          console.error("❌ Overshoot SDK onError callback triggered:", error);
          console.error("❌ Error message:", errorMsg);
          console.error("❌ Error stack:", error.stack);
          console.error("❌ Full error object:", error);

          // Only log significant errors
          if (
            !errorMsg.includes("WebSocket is closed") &&
            !errorMsg.includes("before the connection")
          ) {
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
            logWithTimestamp(
              "⚠️ Connection lost - restarting...",
              null,
              "warn"
            );
          }

          if (onError) {
            onError(error);
          }
          setError(errorMsg);
        },
      };

      // Add outputSchema if configured
      if (finalOutputSchema && Object.keys(finalOutputSchema).length > 0) {
        visionConfig.outputSchema = finalOutputSchema;
      }

      const vision = new RealtimeVision(visionConfig);
      visionRef.current = vision;

      // DEBUG: Log SDK instance creation
      console.log("🔧 RealtimeVision instance created:", {
        hasPrompt: !!finalPrompt,
        hasOutputSchema: !!(
          finalOutputSchema && Object.keys(finalOutputSchema).length > 0
        ),
        hasOnResult: typeof visionConfig.onResult === "function",
        hasOnError: typeof visionConfig.onError === "function",
        sourceType: visionConfig.source?.type || "camera",
      });

      return vision;
    } catch (err) {
      logWithTimestamp(`❌ SDK init failed: ${err.message}`, null, "error");
      throw err;
    }
  }, [apiUrl, apiKey, onResult, onError, prompt, outputSchema]);

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
      logWithTimestamp(
        "⚠️ Video element not ready for change detection",
        null,
        "warn"
      );
      return;
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const width = 32;
    const height = 18;
    canvas.width = width;
    canvas.height = height;

    const getDownscaledFrameData = () => {
      if (
        !videoRef.current ||
        videoRef.current.paused ||
        videoRef.current.ended ||
        videoRef.current.videoWidth === 0
      ) {
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
              logWithTimestamp(
                "🚀 Significant change detected. Starting vision service..."
              );
              const vision = await initializeSDK();
              await vision.start();
              isVisionActiveRef.current = true;
              setIsActive(true); // Update state for UI
              logWithTimestamp("✅ Vision service active.");
            } catch (err) {
              logWithTimestamp(
                `❌ Failed to start vision on-demand: ${err.message}`,
                null,
                "error"
              );
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
            logWithTimestamp(
              "🎥 Scene appears still. Stopping vision service to save resources."
            );
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
    if (isConnecting) {
      // Simpler check
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      logWithTimestamp("🚀 Starting camera and change detection...");

      // CRITICAL: Initialize SDK and get camera stream IN PARALLEL for fastest connection
      // This significantly reduces connection time (can save 1-2 seconds)
      const [stream, vision] = await Promise.all([
        // Get camera stream - optimized for real-time performance
        Promise.race([
          navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640, max: 1280 }, // Lower resolution = lower latency
              height: { ideal: 480, max: 720 },
              frameRate: { ideal: 30, max: 30 }, // Consistent frame rate
              facingMode: "user",
              resizeMode: "none", // Prevent unnecessary resizing
            },
            audio: false,
          }),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error("Camera stream request timed out after 10 seconds")
                ),
              10000
            )
          ),
        ]),
        // Initialize SDK in parallel (doesn't need stream immediately)
        initializeSDK().catch((err) => {
          logWithTimestamp(`⚠️ SDK init error: ${err.message}`, null, "warn");
          throw err;
        }),
      ]);

      streamRef.current = stream;

      // CRITICAL: The Overshoot SDK auto-detects camera streams
      // When no source is specified in config, SDK automatically uses getUserMedia for camera
      // Since we got the stream via getUserMedia, the SDK will detect it when start() is called
      // However, to ensure proper connection, we should verify stream is active
      if (!vision) {
        throw new Error("Vision instance not initialized");
      }

      // Verify stream is active before starting SDK
      const streamTracks = stream.getTracks();
      const activeTracks = streamTracks.filter((t) => t.readyState === "live");

      console.log("🔧 Preparing camera stream for Overshoot SDK");
      console.log("🔍 Stream verification:", {
        hasStream: !!stream,
        trackCount: streamTracks.length,
        activeTracks: activeTracks.length,
        trackIds: streamTracks.map((t) => t.id),
        trackStates: streamTracks.map((t) => t.readyState),
        trackKinds: streamTracks.map((t) => t.kind),
        trackSettings: streamTracks.map((t) => t.getSettings()),
      });

      if (activeTracks.length === 0) {
        throw new Error(
          "Camera stream has no active tracks - cannot start SDK"
        );
      }

      // SDK will auto-detect camera source when start() is called
      // The getUserMedia stream is automatically captured by the SDK
      console.log(
        "✅ Stream verified - SDK will auto-detect camera when start() is called"
      );

      // CRITICAL: Set video element with stream BEFORE SDK starts
      // The SDK gets the stream internally, but we need to display it in our video element
      // MediaStream tracks can be shared, so both can use the same stream

      // Don't wait for video element - start SDK connection immediately
      // The video element can be set up in parallel while SDK connects
      // This significantly reduces connection time
      if (!videoRef.current) {
        logWithTimestamp(
          "⚠️ Video element not found - continuing anyway (will attach when ready)",
          null,
          "warn"
        );
        // Continue - SDK will work, video will attach when element is ready
      }

      // CRITICAL: Set video element with stream BEFORE starting detection
      if (videoRef.current) {
        // Check if element is in DOM
        if (!videoRef.current.isConnected) {
          logWithTimestamp("⚠️ Video element not in DOM", null, "warn");
        }

        // Set the stream
        videoRef.current.srcObject = stream;
        logDebug("Stream set on video element", {
          hasStream: !!videoRef.current.srcObject,
          tracks: stream.getVideoTracks().length,
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
            }, 100); // Faster retry (100ms instead of 500ms) for real-time responsiveness
          }
        };

        await playVideo();

        // Set up event listeners to ensure video stays active
        const onLoadedMetadata = () => {
          logDebug("Video metadata loaded", {
            width: videoRef.current?.videoWidth,
            height: videoRef.current?.videoHeight,
            readyState: videoRef.current?.readyState,
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

        videoRef.current.addEventListener("loadedmetadata", onLoadedMetadata);
        videoRef.current.addEventListener("canplay", onCanPlay);

        // Store cleanup function
        videoRef.current._cleanupVideoListeners = () => {
          if (videoRef.current) {
            videoRef.current.removeEventListener(
              "loadedmetadata",
              onLoadedMetadata
            );
            videoRef.current.removeEventListener("canplay", onCanPlay);
          }
        };

        // Set up periodic check to ensure video stays playing (faster interval for real-time)
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
        }, 500); // Faster check interval (500ms instead of 1000ms) for real-time responsiveness

        // Store interval ID to clear later
        videoRef.current._playInterval = playInterval;

        // Don't wait for video initialization - start SDK connection immediately
        // Video setup happens in parallel, SDK doesn't need it to start connecting
        // This removes a major delay in connection time

        logDebug("Video element setup complete", {
          hasSrcObject: !!videoRef.current.srcObject,
          paused: videoRef.current.paused,
          readyState: videoRef.current.readyState,
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

      // SDK is already initialized (done in parallel above)
      // Just start it immediately - no initialization delay
      logWithTimestamp("⏳ Connecting to Overshoot...");

      // CRITICAL: Verify stream is active before starting SDK
      const activeTracksBeforeStart = stream
        .getTracks()
        .filter((t) => t.readyState === "live");
      console.log("🔍 Stream verification before SDK start:", {
        totalTracks: stream.getTracks().length,
        activeTracks: activeTracksBeforeStart.length,
        trackIds: stream.getTracks().map((t) => t.id),
        trackStates: stream.getTracks().map((t) => t.readyState),
      });

      if (activeTracksBeforeStart.length === 0) {
        throw new Error(
          "Camera stream has no active tracks - cannot start SDK"
        );
      }

      console.log(
        "⏳ Calling vision.start() - SDK should auto-detect camera stream"
      );
      console.log("🔧 Vision instance state:", {
        hasStart: typeof vision.start === "function",
        hasStop: typeof vision.stop === "function",
        configPrompt: vision.config?.prompt || "not accessible",
        configHasOnResult: typeof vision.config?.onResult === "function",
      });

      // Start SDK connection immediately with reduced timeout for faster feedback
      // Overshoot SDK automatically detects camera stream from getUserMedia
      try {
        const startResult = await Promise.race([
          vision.start(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Connection timeout after 15 seconds")),
              15000
            )
          ),
        ]);
        console.log("✅ vision.start() resolved:", startResult);
      } catch (startError) {
        console.error("❌ vision.start() rejected:", startError);
        console.error("❌ Start error details:", {
          message: startError.message,
          stack: startError.stack,
          name: startError.name,
          error: startError,
        });
        throw startError;
      }

      logWithTimestamp("✅ Camera active");
      console.log(
        "✅ Overshoot SDK connected successfully - waiting for results..."
      );
      console.log("🔍 Results should appear in console via onResult callback");

      // Get prompt from vision config (stored in SDK instance)
      const visionPrompt = vision?.config?.prompt || prompt || "No prompt set";
      console.log("📊 Current prompt:", visionPrompt);

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
