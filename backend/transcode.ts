import ffmpeg from "@ts-ffmpeg/fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import fs from "fs";
import path from "path";

const ffmpegPath = ffmpegStatic as unknown as string;
ffmpeg.setFfmpegPath(ffmpegPath as string);

const HLS_CACHE_DIR = path.resolve("hls_cache");
const THUMBNAIL_DIR = path.resolve("thumbnails");

/* 
console.log("ffmpeg binary path:", ffmpegPath);               <- for debugging when ffmpeg isnt recognized
console.log("exists on disk:", fs.existsSync(ffmpegPath));    <- same as above, to check if the binary actually exists at the path provided by ffmpeg-static
*/

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

export function getThumbnailPath(mediaId: string): string {
  return path.join(THUMBNAIL_DIR, `${mediaId}.jpg`);
}

export function hasThumbnail(mediaId: string): boolean {
  return fs.existsSync(getThumbnailPath(mediaId));
}

export function generateThumbnail(
  mediaId: string,
  inputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
    const outputPath = getThumbnailPath(mediaId);

    ffmpeg(inputPath)
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .screenshots({
        timestamps: ["10%"],
        filename: `${mediaId}.jpg`,
        folder: THUMBNAIL_DIR,
        size: "320x?",
      });
  });
}
