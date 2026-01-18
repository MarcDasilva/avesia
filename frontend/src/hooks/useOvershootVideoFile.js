import { useState, useRef, useCallback } from "react";
import { overshootAPI } from "../lib/api";

/**
 * Custom React hook for Overshoot SDK integration with video files
 * Handles video file processing with Overshoot SDK
 */
export function useOvershootVideoFile() {
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

        // Fetch config and nodes from backend
        const [sdkConfig, nodesConfig] = await Promise.all([
          overshootAPI.getConfig(),
          overshootAPI.getNodes(),
        ]);

        const apiUrl = sdkConfig.apiUrl;
        const apiKey = sdkConfig.apiKey;

        if (!apiKey || apiKey === "your-api-key") {
          throw new Error(
            "Overshoot API key not configured. Please set OVERSHOOT_API_KEY in backend/.env"
          );
        }

        logWithTimestamp(
          `✅ Config loaded (${
            nodesConfig.nodes?.length || 0
          } nodes) for ${videoName}`
        );

        // Dynamically import Overshoot SDK
        const { RealtimeVision } = await import(
          "https://cdn.jsdelivr.net/npm/@overshoot/sdk@0.1.0-alpha.2/dist/index.mjs"
        );

        // Create vision instance for this video
        const visionConfig = {
          apiUrl,
          apiKey,
          prompt: nodesConfig.prompt || "Describe what you see",
          source: { type: "video", file: videoFile }, // CRITICAL: Use video file as source
          onResult: async (result) => {
            resultCountRef.current++;
            const timestamp = new Date().toISOString();

            // Parse result if it's JSON
            let parsedResult = result.result;
            let isJson = false;

            if (
              nodesConfig.outputSchema &&
              Object.keys(nodesConfig.outputSchema).length > 0
            ) {
              try {
                parsedResult = JSON.parse(result.result);
                isJson = true;
              } catch (e) {
                // Silent fail for parsing
              }
            }

            // Log results to console (every 5th result to reduce noise)
            if (resultCountRef.current % 5 === 0) {
              if (isJson) {
                logWithTimestamp(
                  `📹 [${videoName}] Result #${
                    resultCountRef.current
                  }: ${Object.keys(parsedResult).join(", ")}`
                );
              } else {
                logWithTimestamp(
                  `📹 [${videoName}] Result #${resultCountRef.current}`
                );
              }
            }

            // Always log the result to console (as requested)
            console.log(`[${videoName}] Overshoot Result:`, {
              video: videoName,
              videoId: videoId,
              result: parsedResult,
              isJson: isJson,
              timestamp: timestamp,
            });

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
          },
          onError: (error) => {
            const errorMsg = error.message || error.toString();

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
        if (
          nodesConfig.outputSchema &&
          Object.keys(nodesConfig.outputSchema).length > 0
        ) {
          visionConfig.outputSchema = nodesConfig.outputSchema;
        }

        const vision = new RealtimeVision(visionConfig);
        visionRefs.current.set(videoId, vision);

        logWithTimestamp(`⏳ [${videoName}] Connecting to Overshoot...`);

        // Start processing the video
        await Promise.race([
          vision.start(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Connection timeout")), 30000)
          ),
        ]);

        logWithTimestamp(`✅ [${videoName}] Video processing started`);
        setIsProcessing(false);
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
    []
  );

  // Stop processing a specific video
  const stopProcessing = useCallback(async (videoId) => {
    const vision = visionRefs.current.get(videoId);
    if (!vision) {
      return;
    }

    try {
      logWithTimestamp(`⏸️ Stopping processing for video ${videoId}`);
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
