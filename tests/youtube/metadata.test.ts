import { afterEach, describe, expect, it, vi } from "vitest";

import { VideoProcessingError } from "@/lib/video-errors";
import {
  assertPlayable,
  fetchYouTubeMetadata
} from "@/lib/youtube/metadata";

describe("YouTube metadata classification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not classify generic sign-in interstitials as age restricted", () => {
    expect(() =>
      assertPlayable({
        playabilityStatus: {
          status: "LOGIN_REQUIRED",
          reason: "Sign in to confirm you are not a bot"
        }
      })
    ).toThrowError(VideoProcessingError);

    try {
      assertPlayable({
        playabilityStatus: {
          status: "LOGIN_REQUIRED",
          reason: "Sign in to confirm you are not a bot"
        }
      });
    } catch (error) {
      expect(error).toBeInstanceOf(VideoProcessingError);
      expect((error as VideoProcessingError).type).toBe("NETWORK_ERROR");
    }
  });

  it("keeps explicit age verification classified as age restricted", () => {
    try {
      assertPlayable({
        playabilityStatus: {
          status: "LOGIN_REQUIRED",
          reason: "Sign in to confirm your age"
        }
      });
    } catch (error) {
      expect(error).toBeInstanceOf(VideoProcessingError);
      expect((error as VideoProcessingError).type).toBe("AGE_RESTRICTED");
    }
  });

  it("uses safe fallback metadata when watch HTML is blocked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => "<html><title>Sign in</title></html>"
      }))
    );

    await expect(
      fetchYouTubeMetadata({
        videoId: "8S0FDjFBj8o",
        normalizedUrl: "https://www.youtube.com/watch?v=8S0FDjFBj8o"
      })
    ).resolves.toMatchObject({
      videoId: "8S0FDjFBj8o",
      title: "YouTube lecture",
      thumbnailUrl: "https://i.ytimg.com/vi/8S0FDjFBj8o/hqdefault.jpg",
      normalizedUrl: "https://www.youtube.com/watch?v=8S0FDjFBj8o",
      metadataSource: "fallback",
      metadataErrorType: "NETWORK_ERROR"
    });
  });
});
