import uWS from "uWebSockets.js";
import fs from "fs";
import path from "path";
import "dotenv/config";
import db from "./db.js";
import { getOrCreateUserId } from "./identity.js";

// ffmpeg in node.js is hell.
import {
  generateThumbnail,
  getHlsOutputDir,
  getThumbnailPath,
  hasThumbnail,
  isTranscoded,
  transcodeToHls,
} from "./transcode.js";

const PORT = 9000;
const HOST = process.env.HOST ?? "localhost";
const PASSWORD = process.env.REVLCLONE_PASSWORD ?? "admin";
const PROTECTED = process.env.PROTECTED === "true";
const sessions = new Set<string>();

function isAuthed(req: uWS.HttpRequest): boolean {
  if (!PROTECTED) return true;
  const sid = req.getHeader("x-session-id");
  return sid !== "" && sessions.has(sid);
}

// same goes for protos.
import {
  LoginRequest,
  LoginResponse,
  MediaList,
  PlaybackRequest,
  PlaybackResponse,
  PlaybackState,
} from "./proto.js";

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
      thumbnail: `/thumbnails/${String(index + 1)}`,
    };
  });
}

let mediaLibrary = scanMediaLibrary();

function parseCookies(req: uWS.HttpRequest): Record<string, string> {
  const header = req.getHeader("cookie") ?? "";
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) cookies[key] = rest.join("=");
  }
  return cookies;
}

uWS // fuck youuuuuuuu
  .App()
  .get("/api/media", (res, req) => {
    if (!isAuthed(req)) {
      res.writeStatus("401").end();
      return;
    }
    const { userId, setCookieHeader } = getOrCreateUserId(req);
    mediaLibrary = scanMediaLibrary();
    const payload = MediaList.create({ items: mediaLibrary });
    const encoded = MediaList.encode(payload).finish();
    res.cork(() => {
      res.writeHeader("Content-Type", "application/x-protobuf");
      if (setCookieHeader) res.writeHeader("Set-Cookie", setCookieHeader);
      res.writeHeader("Access-Control-Allow-Origin", "*").end(encoded);
    });
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
  .post("/api/progress", (res, req) => {
    if (!isAuthed(req)) {
      res.writeStatus("401").end();
      return;
    }
    const sessionId = req.getHeader("x-session-id");
    const { userId, setCookieHeader } = getOrCreateUserId(req);

    let buffer = Buffer.alloc(0);
    res.onData((chunk, isLast) => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      if (isLast) {
        const state = PlaybackState.decode(buffer) as any;

        db.prepare(
          `
        INSERT INTO watch_history (session_id, media_id, position, user_id, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(session_id, media_id)
        DO UPDATE SET position = excluded.position, user_id = excluded.user_id, updated_at = excluded.updated_at
      `,
        ).run(sessionId, state.mediaId, state.position, userId);

        res.cork(() => {
          res.writeStatus("200");
          if (setCookieHeader) res.writeHeader("Set-Cookie", setCookieHeader);
          res.writeHeader("Access-Control-Allow-Origin", "*").end();
        });
      }
    });
    res.onAborted(() => {});
  })
  .get("/api/history", (res, req) => {
    if (!isAuthed(req)) {
      res.writeStatus("401").end();
      return;
    }
    const { userId, setCookieHeader } = getOrCreateUserId(req);

    const rows = db
      .prepare(
        `
    SELECT media_id, position, updated_at
    FROM watch_history
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `,
      )
      .all(userId) as {
      media_id: string;
      position: number;
      updated_at: string;
    }[];

    const payload = JSON.stringify({ history: rows });
    res.cork(() => {
      res.writeHeader("Content-Type", "application/json");
      if (setCookieHeader) res.writeHeader("Set-Cookie", setCookieHeader);
      res.writeHeader("Access-Control-Allow-Origin", "*").end(payload);
    });
  })
  .post("/api/auth/login", (res, req) => {
    let buffer = Buffer.alloc(0);
    res.onData((chunk, isLast) => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      if (isLast) {
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
  .get("/thumbnails/:id", async (res, req) => {
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

    if (!hasThumbnail(id)) {
      try {
        await generateThumbnail(id, path.resolve("media", item.filename));
      } catch (err) {
        console.error("Thumbnail generation failed:", err);
        if (!aborted) res.cork(() => res.writeStatus("500").end());
        return;
      }
    }

    if (aborted) return;

    const data = fs.readFileSync(getThumbnailPath(id));
    res.cork(() => {
      res
        .writeHeader("Content-Type", "image/jpeg")
        .writeHeader("Access-Control-Allow-Origin", "*")
        .end(data);
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
    if (token)
      console.log(`re-vlclone backend running on ${process.env.HOST}:${PORT}`);
    else console.error("Failed to start server");
  });
