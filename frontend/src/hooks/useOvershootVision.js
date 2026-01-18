import { useState, useRef, useEffect, useCallback } from "react";
import { overshootAPI } from "../lib/api";

/**
 * Custom React hook for Overshoot SDK integration
 * Handles camera feed processing with Overshoot SDK
 */
export function useOvershootVision(config = {}) {
  const { apiUrl, apiKey, onResult, onError, prompt, outputSchema, projectId } =
    config;

  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const visionRef = useRef(null);
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const resultCountRef = useRef(0);
  const isStoppingRef = useRef(false); // Track if we're intentionally stopping

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
          // CRITICAL: Include projectId so backend can trigger email alerts
          // Capture projectId from closure to ensure it's available in setTimeout
          const currentProjectId = projectId;
          setTimeout(() => {
            overshootAPI
              .sendResult(
                parsedResult,
                timestamp,
                finalPrompt,
                finalOutputSchema && Object.keys(finalOutputSchema).length > 0
                  ? "structured"
                  : null,
                currentProjectId // CRITICAL: Pass project ID for email alert triggers
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

          // CRITICAL: Ignore WebSocket errors if we're intentionally stopping
          // These are expected when switching projects or stopping the connection
          if (isStoppingRef.current) {
            if (
              errorMsg.includes("WebSocket") ||
              errorMsg.includes("closed") ||
              errorMsg.includes("connection") ||
              errorMsg.includes("WebSocket error occurred")
            ) {
              // Silently ignore WebSocket errors during intentional stops
              console.log(
                "ℹ️ WebSocket closed during intentional stop (expected)"
              );
              return;
            }
          }

          // DEBUG: Always log errors to help diagnose issues (unless we're stopping)
          if (!isStoppingRef.current) {
            console.error(
              "❌ Overshoot SDK onError callback triggered:",
              error
            );
            console.error("❌ Error message:", errorMsg);
            console.error("❌ Error stack:", error.stack);
            console.error("❌ Full error object:", error);
          }

          // Only log significant errors (ignore expected WebSocket closure messages)
          if (
            !errorMsg.includes("WebSocket is closed") &&
            !errorMsg.includes("before the connection") &&
            !errorMsg.includes("WebSocket error occurred") &&
            !isStoppingRef.current
          ) {
            logWithTimestamp(`❌ SDK error: ${errorMsg}`, null, "error");
          }

          // Check stream health (only if not intentionally stopping)
          if (!isStoppingRef.current && streamRef.current) {
            const activeTracks = streamRef.current
              .getTracks()
              .filter((t) => t.readyState === "live");

            if (activeTracks.length === 0 && isActive) {
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
  }, [apiUrl, apiKey, onResult, onError, prompt, outputSchema, projectId]);

  // Start vision processing
  const start = useCallback(async () => {
    // Reset stopping flag when starting - ensures we don't ignore errors during new session
    isStoppingRef.current = false;

    if (isActive || isConnecting) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      logWithTimestamp("🚀 Starting...");

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

      if (videoRef.current) {
        // Check if element is in DOM
        if (!videoRef.current.isConnected) {
          logWithTimestamp("⚠️ Video element not in DOM", null, "warn");
        }

        // Set the stream - CRITICAL: Keep stream reference alive to prevent garbage collection
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

            // CRITICAL: Keep video element active to prevent stream from being garbage collected
            // Some browsers stop the stream if the video element is not actively playing
            if (videoRef.current.paused) {
              // If somehow paused, play again
              await videoRef.current.play();
            }
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
        // CRITICAL: This prevents the stream from being stopped by the browser
        const playInterval = setInterval(() => {
          if (videoRef.current && !isStoppingRef.current) {
            // Check if stream is still attached
            if (!videoRef.current.srcObject) {
              logDebug("Video srcObject was cleared - reattaching");
              videoRef.current.srcObject = stream;
            }

            // Check if stream tracks are still active
            if (streamRef.current) {
              const activeTracks = streamRef.current
                .getTracks()
                .filter((t) => t.readyState === "live");

              if (activeTracks.length === 0) {
                logWithTimestamp(
                  "⚠️ Stream tracks ended - attempting recovery",
                  null,
                  "warn"
                );
                // Don't stop here - let the SDK handle it or retry
                return;
              }
            }

            // Ensure it's playing - critical for keeping stream alive
            if (videoRef.current.paused) {
              videoRef.current.play().catch((err) => {
                // Only log if not intentionally stopping
                if (!isStoppingRef.current) {
                  logDebug("Video play() failed in monitor:", err.name);
                }
              });
            }
          }
        }, 1000); // Check every second to keep stream alive

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

      // Monitor stream health - use refs to avoid stale closures
      stream.getTracks().forEach((track) => {
        // Store original handlers if any
        const originalOnended = track.onended;
        const originalOnerror = track.onerror;

        track.onended = () => {
          // Check if we're intentionally stopping - if so, ignore track ended events
          if (isStoppingRef.current) {
            return;
          }

          // Check current active state using a function to get latest value
          setIsActive((currentActive) => {
            if (currentActive) {
              logWithTimestamp(
                "⚠️ Camera track ended unexpectedly",
                null,
                "warn"
              );
              setError("Camera stream lost. Please restart.");
              return false;
            }
            return currentActive;
          });

          // Call original handler if it exists
          if (originalOnended) {
            originalOnended.call(track);
          }
        };

        track.onerror = (error) => {
          // Check if we're intentionally stopping - if so, ignore errors
          if (isStoppingRef.current) {
            return;
          }

          // Check current active state
          setIsActive((currentActive) => {
            if (currentActive) {
              logWithTimestamp("❌ Camera track error", null, "error");
              setError("Camera stream error. Please restart.");
              return false;
            }
            return currentActive;
          });

          // Call original handler if it exists
          if (originalOnerror) {
            originalOnerror.call(track, error);
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
  }, [isActive, isConnecting, apiKey, initializeSDK]);

  // Stop vision processing
  const stop = useCallback(async () => {
    if (!isActive && !isConnecting) {
      return;
    }

    try {
      // Mark that we're intentionally stopping to suppress expected WebSocket errors
      isStoppingRef.current = true;
      logWithTimestamp("⏸️ Stopping...");

      // Give a small delay to allow in-flight operations to complete
      // This reduces WebSocket errors during shutdown
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (visionRef.current) {
        try {
          await visionRef.current.stop();
        } catch (stopErr) {
          // Ignore WebSocket errors during stop - they're expected
          if (!stopErr.message?.includes("WebSocket")) {
            console.warn("Warning during SDK stop:", stopErr.message);
          }
        }
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
      // Don't log WebSocket errors during intentional stops
      if (!err.message?.includes("WebSocket")) {
        logWithTimestamp(`❌ Error stopping: ${err.message}`, null, "error");
        setError(err.message);
      }
    } finally {
      // Reset stopping flag after a delay to allow any pending error callbacks
      setTimeout(() => {
        isStoppingRef.current = false;
      }, 500);
    }
  }, [isActive, isConnecting]);

  // Cleanup on unmount only - CRITICAL: Don't interfere with normal operation
  useEffect(() => {
    return () => {
      // Only cleanup on unmount, not when dependencies change
      // Mark as stopping to suppress errors during unmount
      isStoppingRef.current = true;

      if (visionRef.current) {
        visionRef.current.stop().catch(() => {
          // Ignore errors during cleanup - expected on unmount
        });
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          // Only stop if not already stopped
          if (track.readyState !== "ended") {
            track.stop();
          }
        });
      }
      if (videoRef.current) {
        // Clear interval first
        if (videoRef.current._playInterval) {
          clearInterval(videoRef.current._playInterval);
        }
        // Clear cleanup listeners
        if (videoRef.current._cleanupVideoListeners) {
          videoRef.current._cleanupVideoListeners();
        }
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
