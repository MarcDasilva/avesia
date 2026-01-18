import { useState, useRef, useCallback } from "react";
import { overshootAPI } from "../lib/api";

/**
 * Custom React hook for Overshoot SDK integration with video files
 * Handles video file processing with Overshoot SDK
 *
 * @param {string} prompt - Optional project-specific prompt (if not provided, will fetch default nodes)
 * @param {object} outputSchema - Optional output schema (if not provided, will fetch default nodes)
 */
export function useOvershootVideoFile(prompt = null, outputSchema = null) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const visionRefs = useRef(new Map()); // Store vision instances per video ID
  const resultCountRef = useRef(0);

  // Helper function to log with timestamp
  const logWithTimestamp = (message, data = null, level = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    if (level === "error") {
      console.error(`[${timestamp}] ${message}`, data || "");
    } else if (level === "warn") {
      console.warn(`[${timestamp}] ${message}`, data || "");
    } else {
      console.log(`[${timestamp}] ${message}`);
    }
  };

  // Process a single video file with Overshoot SDK
  const processVideoFile = useCallback(
    async (videoFile, videoId, videoName) => {
      if (!videoFile) {
        throw new Error("Video file is required");
      }

      // Check if already processing this video
      if (visionRefs.current.has(videoId)) {
        logWithTimestamp(
          `⚠️ Video ${videoName} is already being processed`,
          null,
          "warn"
        );
        return;
      }

      setIsProcessing(true);
      setError(null);

      try {
        logWithTimestamp(`🚀 Starting processing for video: ${videoName}`);

        // Use provided prompt/outputSchema or fetch default nodes
        let finalPrompt = prompt;
        let finalOutputSchema = outputSchema;
        let nodesConfig = null;

        // Fetch config (always needed for API key)
        const configPromise = overshootAPI.getConfig();

        // Only fetch nodes if prompt not provided
        const nodesPromise = !finalPrompt
          ? overshootAPI.getNodes()
          : Promise.resolve(null);

        const [sdkConfig, defaultNodesConfig] = await Promise.all([
          configPromise,
          nodesPromise,
        ]);

        const apiUrl = sdkConfig.apiUrl;
        const apiKey = sdkConfig.apiKey;

        if (!apiKey || apiKey === "your-api-key") {
          throw new Error(
            "Overshoot API key not configured. Please set OVERSHOOT_API_KEY in backend/.env"
          );
        }

        // Use provided prompt or fall back to default nodes
        if (!finalPrompt && defaultNodesConfig) {
          nodesConfig = defaultNodesConfig;
          finalPrompt = nodesConfig.prompt || "Describe what you see";
          finalOutputSchema = nodesConfig.outputSchema;
          logWithTimestamp(
            `✅ Using default config (${
              nodesConfig.nodes?.length || 0
            } nodes) for ${videoName}`
          );
        } else if (finalPrompt) {
          logWithTimestamp(
            `✅ Using project-specific prompt for ${videoName}: "${finalPrompt}"`
          );
        }

        // Dynamically import Overshoot SDK
        const { RealtimeVision } = await import(
          "https://cdn.jsdelivr.net/npm/@overshoot/sdk@0.1.0-alpha.2/dist/index.mjs"
        );

        // Debug: Log the prompt being used for this video
        console.log(`🎯 [${videoName}] Overshoot SDK Prompt:`, finalPrompt);
        console.log(`📋 [${videoName}] Output Schema:`, finalOutputSchema);

        // CRITICAL: Verify video file before starting SDK (similar to camera stream verification)
        console.log(`🔧 [${videoName}] Preparing video file for Overshoot SDK`);
        console.log(`🔍 [${videoName}] Video file verification:`, {
          hasFile: !!videoFile,
          fileName: videoFile?.name,
          fileSize: videoFile?.size,
          fileType: videoFile?.type,
          fileLastModified: videoFile?.lastModified,
        });

        if (!videoFile) {
          throw new Error(`Video file is required for ${videoName}`);
        }

        if (!(videoFile instanceof File) && !(videoFile instanceof Blob)) {
          throw new Error(`Invalid video file type for ${videoName}`);
        }

        // Create vision instance for this video
        // CRITICAL: Configure for continuous processing (same pattern as camera feed)
        const visionConfig = {
          apiUrl,
          apiKey,
          prompt: finalPrompt,
          source: { type: "video", file: videoFile }, // CRITICAL: Use video file as source
          // Continuous processing configuration
          // Ensure SDK processes frames continuously even if video loops
          // clip_length_seconds: 0.5, // Process in 0.5s windows (shorter = more real-time)
          // delay_seconds: 0.5, // Get results every 0.5s (faster updates)
          // fps: 30, // Capture at 30fps
          // sampling_ratio: 1.0, // Process all frames (no frame skipping)
          // Real-time optimization: make onResult synchronous for immediate processing
          // Match camera feed pattern exactly
          onResult: (result) => {
            // DEBUG: Log that callback was triggered (same as camera feed)
            console.log(
              `🔔 [${videoName}] onResult callback triggered!`,
              result
            );

            // Process immediately (synchronous) for lowest latency
            resultCountRef.current++;
            const timestamp = new Date().toISOString();

            // Get vision instance to update lastResultTime (for continuous monitoring)
            // This will be set after vision is created below
            const visionInstance = visionRefs.current.get(videoId);
            if (
              visionInstance &&
              visionInstance._lastResultTime !== undefined
            ) {
              visionInstance._lastResultTime = Date.now();
            }

            // Parse result if it's JSON (synchronous, no async/await delays)
            let parsedResult = result.result;
            let isJson = false;

            if (
              finalOutputSchema &&
              Object.keys(finalOutputSchema).length > 0
            ) {
              try {
                parsedResult = JSON.parse(result.result);
                isJson = true;
              } catch (e) {
                // Silent fail for parsing
              }
            }

            // Log immediately (synchronous) - no async delays
            // Include the prompt that was used for this result to verify alignment
            // Match camera feed logging pattern exactly
            if (isJson) {
              console.log(
                `🔍 [${videoName}] Overshoot Result #${resultCountRef.current}`,
                `\n📝 Prompt Used: "${finalPrompt}"`,
                `\n📊 Result:`,
                parsedResult
              );
              logWithTimestamp(
                `📹 [${videoName}] Result #${
                  resultCountRef.current
                }: ${Object.keys(parsedResult).join(", ")}`
              );
            } else {
              console.log(
                `🔍 [${videoName}] Overshoot Result #${resultCountRef.current}`,
                `\n📝 Prompt Used: "${finalPrompt}"`,
                `\n📊 Result:`,
                parsedResult
              );
              logWithTimestamp(
                `📹 [${videoName}] Result #${resultCountRef.current}: ${parsedResult}`
              );
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
                    console.warn(
                      `[${videoName}] Failed to send result to backend:`,
                      err
                    );
                  }
                });
            }, 0);
          },
          onError: (error) => {
            const errorMsg = error.message || error.toString();

            // DEBUG: Always log errors to help diagnose issues
            console.error(
              `❌ [${videoName}] Overshoot SDK onError callback triggered:`,
              error
            );
            console.error(`❌ [${videoName}] Error message:`, errorMsg);
            console.error(`❌ [${videoName}] Error stack:`, error.stack);
            console.error(`❌ [${videoName}] Full error object:`, error);

            // Log significant errors
            if (
              !errorMsg.includes("WebSocket is closed") &&
              !errorMsg.includes("before the connection")
            ) {
              logWithTimestamp(
                `❌ [${videoName}] SDK error: ${errorMsg}`,
                null,
                "error"
              );
            }

            // Log error to console
            console.error(`[${videoName}] Overshoot Error:`, {
              video: videoName,
              videoId: videoId,
              error: errorMsg,
            });

            setError(errorMsg);
          },
        };

        // Add outputSchema if configured
        if (finalOutputSchema && Object.keys(finalOutputSchema).length > 0) {
          visionConfig.outputSchema = finalOutputSchema;
        }

        const vision = new RealtimeVision(visionConfig);
        visionRefs.current.set(videoId, vision);

        // DEBUG: Log SDK instance creation (same pattern as camera feed)
        console.log(`🔧 [${videoName}] RealtimeVision instance created:`, {
          hasPrompt: !!finalPrompt,
          hasOutputSchema: !!(
            finalOutputSchema && Object.keys(finalOutputSchema).length > 0
          ),
          hasOnResult: typeof visionConfig.onResult === "function",
          hasOnError: typeof visionConfig.onError === "function",
          sourceType: visionConfig.source?.type || "video",
          hasFile: !!visionConfig.source?.file,
        });

        // Track last result time for continuous processing monitoring
        let lastResultTime = Date.now();

        // Store lastResultTime on vision instance for monitoring
        vision._lastResultTime = lastResultTime;
        vision._videoName = videoName; // Store for logging

        logWithTimestamp(`⏳ [${videoName}] Connecting to Overshoot...`);

        // CRITICAL: Verify configuration before starting SDK (same as camera feed)
        console.log(
          `⏳ [${videoName}] Calling vision.start() - SDK should process video file`
        );
        console.log(`🔧 [${videoName}] Vision instance state:`, {
          hasStart: typeof vision.start === "function",
          hasStop: typeof vision.stop === "function",
          configPrompt: vision.config?.prompt || "not accessible",
          configHasOnResult: typeof vision.config?.onResult === "function",
          configSource: vision.config?.source || "not accessible",
        });

        // Start processing the video (same error handling pattern as camera feed)
        try {
          const startResult = await Promise.race([
            vision.start(),
            new Promise((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      `[${videoName}] Connection timeout after 30 seconds`
                    )
                  ),
                30000
              )
            ),
          ]);
          console.log(
            `✅ [${videoName}] vision.start() resolved:`,
            startResult
          );
        } catch (startError) {
          console.error(
            `❌ [${videoName}] vision.start() rejected:`,
            startError
          );
          console.error(`❌ [${videoName}] Start error details:`, {
            message: startError.message,
            stack: startError.stack,
            name: startError.name,
            error: startError,
          });
          throw startError;
        }

        logWithTimestamp(
          `✅ [${videoName}] Video processing started - will process continuously`
        );
        console.log(
          `✅ [${videoName}] Overshoot SDK connected successfully - waiting for results...`
        );
        console.log(
          `🔍 [${videoName}] Results should appear in console via onResult callback`
        );
        console.log(
          `🔄 [${videoName}] Overshoot SDK is now continuously processing video frames`
        );
        console.log(
          `📊 [${videoName}] Results will appear in console as frames are processed`
        );

        // Get prompt from vision config (same pattern as camera feed)
        const visionPrompt =
          vision?.config?.prompt || finalPrompt || "No prompt set";
        console.log(`📊 [${videoName}] Current prompt:`, visionPrompt);
        console.log(`⚙️ [${videoName}] SDK Config:`, {
          hasPrompt: !!finalPrompt,
          hasOutputSchema: !!(
            finalOutputSchema && Object.keys(finalOutputSchema).length > 0
          ),
          sourceType: "video",
          hasFile: !!videoFile,
        });

        setIsProcessing(false);

        // Monitor that results continue to come in (for debugging continuous processing)
        const processingMonitor = setInterval(() => {
          const timeSinceLastResult = Date.now() - vision._lastResultTime;
          // If no results for 10 seconds, log a warning (allowing for normal gaps)
          if (timeSinceLastResult > 10000) {
            console.warn(
              `⚠️ [${
                vision._videoName || videoName
              }] No results received for ${Math.round(
                timeSinceLastResult / 1000
              )}s - processing may have stopped`
            );
          }
        }, 10000);

        // Store monitor interval for cleanup
        vision._processingMonitor = processingMonitor;
      } catch (err) {
        logWithTimestamp(
          `❌ [${videoName}] Failed to process: ${err.message}`,
          null,
          "error"
        );
        setError(err.message);
        setIsProcessing(false);

        // Cleanup on error
        if (visionRefs.current.has(videoId)) {
          visionRefs.current.delete(videoId);
        }

        throw err;
      }
    },
    [prompt, outputSchema] // Re-run if prompt or outputSchema changes
  );

  // Stop processing a specific video
  const stopProcessing = useCallback(async (videoId) => {
    const vision = visionRefs.current.get(videoId);
    if (!vision) {
      return;
    }

    try {
      logWithTimestamp(`⏸️ Stopping processing for video ${videoId}`);

      // Clean up processing monitor
      if (vision._processingMonitor) {
        clearInterval(vision._processingMonitor);
        delete vision._processingMonitor;
      }

      await vision.stop();
      visionRefs.current.delete(videoId);
      logWithTimestamp(`✅ Stopped processing for video ${videoId}`);
    } catch (err) {
      logWithTimestamp(
        `❌ Error stopping video ${videoId}: ${err.message}`,
        null,
        "error"
      );
      visionRefs.current.delete(videoId);
    }
  }, []);

  // Stop all processing
  const stopAll = useCallback(async () => {
    const stopPromises = Array.from(visionRefs.current.keys()).map((videoId) =>
      stopProcessing(videoId)
    );
    await Promise.allSettled(stopPromises);
    visionRefs.current.clear();
  }, [stopProcessing]);

  // Cleanup function
  const cleanup = useCallback(() => {
    // Cleanup all vision instances
    visionRefs.current.forEach((vision, videoId) => {
      vision.stop().catch(() => {
        // Ignore errors during cleanup
      });
    });
    visionRefs.current.clear();
  }, []);

  return {
    isProcessing,
    error,
    processVideoFile,
    stopProcessing,
    stopAll,
    cleanup,
  };
}
