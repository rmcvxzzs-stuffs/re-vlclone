import ffmpeg from "@ts-ffmpeg/fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import path from "path";
import fs from "fs";

const ffmpegPath = ffmpegStatic as unknown as string;
ffmpeg.setFfmpegPath(ffmpegPath as string);

const HLS_CACHE_DIR = path.resolve("hls_cache");

console.log("ffmpeg binary path:", ffmpegPath);
console.log("exists on disk:", fs.existsSync(ffmpegPath));
ffmpeg.setFfmpegPath(ffmpegPath);
export function getHlsOutputDir(mediaId: string): string {
  return path.join(HLS_CACHE_DIR, mediaId);
}

export function isTranscoded(mediaId: string): boolean {
  const outputDir = getHlsOutputDir(mediaId);
  return fs.existsSync(path.join(outputDir, "playlist.m3u8"));
}

export function transcodeToHls(
  mediaId: string,
  inputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const outputDir = getHlsOutputDir(mediaId);
    fs.mkdirSync(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, "playlist.m3u8");

    ffmpeg(inputPath)
      .outputOptions([
        "-c",
        "copy",
        "-start_number",
        "0",
        "-hls_time",
        "6",
        "-hls_list_size",
        "0",
        "-f",
        "hls",
      ])
      .output(outputPath)
      .on("start", (cmd: string) => console.log("ffmpeg start:", cmd))
      .on("stderr", (line: string) => console.log("ffmpeg stderr:", line))
      .on("end", () => {
        console.log("ffmpeg done:", mediaId);
        resolve();
      })
      .on("error", (err: Error) => {
        console.error("ffmpeg error:", err.message);
        reject(err);
      })
      .run();
  });
}
