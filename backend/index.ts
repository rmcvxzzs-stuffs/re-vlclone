import uWS from "uWebSockets.js";
import * as protobuf from "protobufjs";
import path from "path";
import fs from "fs";
import "dotenv/config";
import { getHlsOutputDir, isTranscoded, transcodeToHls } from "./transcode.js";

const PORT = 9000;
const PASSWORD = process.env.VLCLONE_PASSWORD ?? "admin";
const PROTECTED = process.env.PROTECTED === "true";
const sessions = new Set<string>();

function isAuthed(req: uWS.HttpRequest): boolean {
  if (!PROTECTED) return true;
  const sid = req.getHeader("x-session-id");
  return sid !== "" && sessions.has(sid);
}

const root = await protobuf.load([
  path.resolve("proto/media.proto"),
  path.resolve("proto/auth.proto"),
]);

const MediaList = root.lookupType("vlclone.MediaList");
const PlaybackRequest = root.lookupType("vlclone.PlaybackRequest");
const PlaybackResponse = root.lookupType("vlclone.PlaybackResponse");

// temp in-memory media library
function scanMediaLibrary() {
  const mediaDir = path.resolve("media");
  if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir);

  const files = fs
    .readdirSync(mediaDir)
    .filter((f) =>
      [".mp4", ".webm", ".mkv"].includes(path.extname(f).toLowerCase()),
    );

  return files.map((filename, index) => {
    const name = path.basename(filename, path.extname(filename));
    return {
      id: String(index + 1),
      title: name,
      description: "",
      filename,
      duration: 0,
      thumbnail: "",
    };
  });
}

let mediaLibrary = scanMediaLibrary();

uWS
  .App()
  .get("/api/media", (res, req) => {
    if (!isAuthed(req)) {
      res.writeStatus("401").end();
      return;
    }
    mediaLibrary = scanMediaLibrary();
    const payload = MediaList.create({ items: mediaLibrary });
    const encoded = MediaList.encode(payload).finish();
    res
      .writeHeader("Content-Type", "application/x-protobuf")
      .writeHeader("Access-Control-Allow-Origin", "*")
      .end(encoded);
  })
  .post("/api/play", (res, req) => {
    if (!isAuthed(req)) {
      res.writeStatus("401").end();
      return;
    }
    let buffer = Buffer.alloc(0);
    res.onData((chunk, isLast) => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      if (isLast) {
        const request = PlaybackRequest.decode(buffer);
        const item = mediaLibrary.find((m) => m.id === request.mediaId);
        if (!item) {
          res.writeStatus("404 Not Found").end();
          return;
        }
        const payload = PlaybackResponse.create({
          streamUrl: `/stream/${item.filename}`,
          media: item,
        });
        const encoded = PlaybackResponse.encode(payload).finish();
        res
          .writeHeader("Content-Type", "application/x-protobuf")
          .writeHeader("Access-Control-Allow-Origin", "*")
          .end(encoded);
      }
    });
    res.onAborted(() => {});
  })
  .post("/api/auth/login", (res, req) => {
    let buffer = Buffer.alloc(0);
    res.onData((chunk, isLast) => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      if (isLast) {
        const LoginRequest = root.lookupType("vlclone.LoginRequest");
        const LoginResponse = root.lookupType("vlclone.LoginResponse");
        const request = LoginRequest.decode(buffer) as any;
        if (request.password === PASSWORD) {
          const sessionId = crypto.randomUUID();
          sessions.add(sessionId);
          const payload = LoginResponse.create({ success: true, sessionId });
          const encoded = LoginResponse.encode(payload).finish();
          res
            .writeHeader("Content-Type", "application/x-protobuf")
            .writeHeader("Access-Control-Allow-Origin", "*")
            .end(encoded);
        } else {
          const payload = LoginResponse.create({
            success: false,
            error: "Wrong password",
          });
          const encoded = LoginResponse.encode(payload).finish();
          res
            .writeStatus("401")
            .writeHeader("Content-Type", "application/x-protobuf")
            .writeHeader("Access-Control-Allow-Origin", "*")
            .end(encoded);
        }
      }
    });
    res.onAborted(() => {});
  })
  .get("/api/config", (res, req) => {
    const payload = JSON.stringify({ protected: PROTECTED });
    res
      .writeHeader("Content-Type", "application/json")
      .writeHeader("Access-Control-Allow-Origin", "*")
      .end(payload);
  })
  .get("/stream/:filename", (res, req) => {
    const filename = req.getParameter(0) ?? "";
    const filepath = path.resolve("media", filename);
    if (!fs.existsSync(filepath)) {
      res.writeStatus("404 Not Found").end();
      return;
    }
    const stat = fs.statSync(filepath);
    const total = stat.size;
    const rangeHeader = req.getHeader("range") ?? "";

    let aborted = false;

    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace("bytes=", "").split("-");
      const start = parseInt(startStr ?? "0");
      const end = endStr
        ? parseInt(endStr)
        : Math.min(start + 1024 * 1024, total - 1);
      const chunkSize = end - start + 1;

      res.cork(() => {
        res.writeStatus("206 Partial Content");
        res.writeHeader("Content-Range", `bytes ${start}-${end}/${total}`);
        res.writeHeader("Accept-Ranges", "bytes");
        res.writeHeader("Content-Length", String(chunkSize));
        res.writeHeader("Content-Type", "video/mp4");
        res.writeHeader("Access-Control-Allow-Origin", "*");
      });

      const stream = fs.createReadStream(filepath, { start, end });
      res.onAborted(() => {
        aborted = true;
        stream.destroy();
      });
      stream.on("data", (chunk) => {
        if (aborted) return;
        res.cork(() => {
          res.write(chunk as Buffer);
        });
      });
      stream.on("end", () => {
        if (aborted) return;
        res.cork(() => {
          res.end();
        });
      });
      stream.on("error", () => {
        if (aborted) return;
        res.cork(() => {
          res.writeStatus("500").end();
        });
      });
    } else {
      res.cork(() => {
        res.writeHeader("Content-Type", "video/mp4");
        res.writeHeader("Access-Control-Allow-Origin", "*");
        res.writeHeader("Accept-Ranges", "bytes");
      });

      const stream = fs.createReadStream(filepath);
      res.onAborted(() => {
        aborted = true;
        stream.destroy();
      });
      stream.on("data", (chunk) => {
        if (aborted) return;
        res.cork(() => {
          res.write(chunk as Buffer);
        });
      });
      stream.on("end", () => {
        if (aborted) return;
        res.cork(() => {
          res.end();
        });
      });
      stream.on("error", () => {
        if (aborted) return;
        res.end();
      });
    }
  })
  .get("/hls/:id/playlist.m3u8", async (res, req) => {
    if (!isAuthed(req)) {
      res.writeStatus("401").end();
      return;
    }
    let aborted = false;
    res.onAborted(() => {
      aborted = true;
    });

    const id = req.getParameter(0) ?? "";
    const item = mediaLibrary.find((m) => m.id === id);
    if (!item) {
      res.writeStatus("404 Not Found").end();
      return;
    }

    if (!isTranscoded(id)) {
      try {
        await transcodeToHls(id, path.resolve("media", item.filename));
      } catch (err) {
        console.error("Transcode failed:", err);
        if (!aborted) {
          res.cork(() => res.writeStatus("500").end("Transcode failed"));
        }
        return;
      }
    }

    if (aborted) return;

    const playlistPath = path.join(getHlsOutputDir(id), "playlist.m3u8");
    const file = fs.readFileSync(playlistPath, "utf-8");
    res.cork(() => {
      res
        .writeHeader("Content-Type", "application/vnd.apple.mpegurl")
        .writeHeader("Access-Control-Allow-Origin", "*")
        .end(file);
    });
  })
  .get("/hls/:id/:segment", (res, req) => {
    if (!isAuthed(req)) {
      res.writeStatus("401").end();
      return;
    }
    const id = req.getParameter(0) ?? "";
    const segment = req.getParameter(1) ?? "";
    const segmentPath = path.join(getHlsOutputDir(id), segment);

    if (!fs.existsSync(segmentPath)) {
      res.writeStatus("404 Not Found").end();
      return;
    }

    const data = fs.readFileSync(segmentPath);
    res.cork(() => {
      res
        .writeHeader("Content-Type", "video/mp2t")
        .writeHeader("Access-Control-Allow-Origin", "*")
        .end(data);
    });
  })
  .get("/proto/media.proto", (res, req) => {
    const file = fs.readFileSync(path.resolve("proto/media.proto"), "utf-8");
    res
      .writeHeader("Content-Type", "text/plain")
      .writeHeader("Access-Control-Allow-Origin", "*")
      .end(file);
  })
  .get("/proto/auth.proto", (res, req) => {
    const file = fs.readFileSync(path.resolve("proto/auth.proto"), "utf-8");
    res
      .writeHeader("Content-Type", "text/plain")
      .writeHeader("Access-Control-Allow-Origin", "*")
      .end(file);
  })
  .listen(PORT, (token) => {
    if (token) console.log(`re-vlclone backend running on :${PORT}`);
    else console.error("Failed to start server");
  });
