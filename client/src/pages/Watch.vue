<template>
  <div class="watch-layout">
    <!-- Sidebar -->
    <div class="sidebar" :style="{ width: sidebarWidth + 'px' }">
      <div class="sidebar-list">
        <div
          v-for="item in mediaItems"
          :key="item.id"
          class="sidebar-card"
          :class="{ active: item.id === currentId }"
          @click="switchMedia(item)"
        >
          <div class="sidebar-thumb">
            <img :src="item.thumbnail || '/placeholder.jpg'" :alt="item.title" />
            <div class="sidebar-play">▶</div>
          </div>
          <div class="sidebar-info">
            <p class="sidebar-title">{{ item.title }}</p>
            <p class="sidebar-ext">{{ item.filename?.split('.').pop()?.toUpperCase() }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Divider -->
    <div class="divider" @mousedown="startDrag" />

    <!-- Player panel -->
    <div class="player-panel">
      <div class="player-wrap">
        <video ref="videoRef" controls autoplay class="player" />
      </div>
      <div class="media-info" v-if="media">
        <h2>{{ media.title }}</h2>
        <p class="meta">{{ media.filename }}</p>
      </div>
      <div v-else-if="error" class="error">{{ error }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Hls from "hls.js";
import protobuf from "protobufjs";
import { onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();
const currentId = ref(route.params.id as string);

const videoRef = ref<HTMLVideoElement | null>(null);
const media = ref<any>(null);
const mediaItems = ref<any[]>([]);
const error = ref("");
const sidebarWidth = ref(280);

let hls: Hls | null = null;
let progressInterval: number | null = null;
let isDragging = false;
let dragStartX = 0;
let dragStartWidth = 0;

let root: protobuf.Root;
let PlaybackRequest: protobuf.Type;
let PlaybackResponse: protobuf.Type;
let PlaybackState: protobuf.Type;
let MediaList: protobuf.Type;

onMounted(async () => {
  root = await protobuf.load(["/proto/media.proto", "/proto/auth.proto"]);
  PlaybackRequest = root.lookupType("revlclone.PlaybackRequest");
  PlaybackResponse = root.lookupType("revlclone.PlaybackResponse");
  PlaybackState = root.lookupType("revlclone.PlaybackState");
  MediaList = root.lookupType("revlclone.MediaList");

  await fetchMediaList();
  await loadMedia(currentId.value);

  window.addEventListener("mousemove", onDrag);
  window.addEventListener("mouseup", stopDrag);
});

onUnmounted(() => {
  if (progressInterval) clearInterval(progressInterval);
  if (hls) hls.destroy();
  window.removeEventListener("mousemove", onDrag);
  window.removeEventListener("mouseup", stopDrag);
});

async function fetchMediaList() {
  const res = await fetch("/api/media", {
    headers: { "x-session-id": sessionStorage.getItem("session_id") ?? "" },
  });
  if (!res.ok) return;
  const buf = await res.arrayBuffer();
  const list = MediaList.decode(new Uint8Array(buf));
  const obj = MediaList.toObject(list, { defaults: true }) as any;
  mediaItems.value = obj.items ?? [];
}

async function loadMedia(id: string) {
  currentId.value = id;
  media.value = null;
  error.value = "";

  if (progressInterval) clearInterval(progressInterval);
  if (hls) { hls.destroy(); hls = null; }

  const encoded = PlaybackRequest.encode(
    PlaybackRequest.create({ mediaId: id })
  ).finish();
  const res = await fetch("/api/play", {
    method: "POST",
    body: encoded as unknown as BodyInit,
    headers: {
      "Content-Type": "application/x-protobuf",
      "x-session-id": sessionStorage.getItem("session_id") ?? "",
    },
  });
  if (!res.ok) { error.value = "Could not load video."; return; }

  const buf = await res.arrayBuffer();
  const response = PlaybackResponse.decode(new Uint8Array(buf));
  media.value = PlaybackResponse.toObject(response, { defaults: true }) as any;

  attachHls(`/hls/${id}/playlist.m3u8`);

  const progressRes = await fetch(`/api/progress/${id}`, {
    headers: { "x-session-id": sessionStorage.getItem("session_id") ?? "" },
  });
  if (progressRes.ok) {
    const { position } = await progressRes.json();
    if (position > 0 && videoRef.value) {
      videoRef.value.currentTime = position;
    }
  }

  progressInterval = window.setInterval(() => {
    if (!videoRef.value) return;
    const state = PlaybackState.encode(
      PlaybackState.create({
        mediaId: id,
        position: videoRef.value.currentTime,
        paused: videoRef.value.paused,
      })
    ).finish();
    fetch("/api/progress", {
      method: "POST",
      body: state as unknown as BodyInit,
      headers: {
        "Content-Type": "application/x-protobuf",
        "x-session-id": sessionStorage.getItem("session_id") ?? "",
      },
    });
  }, 5000);
}

async function switchMedia(item: any) {
  router.replace(`/watch/${item.id}`);
  await loadMedia(item.id);
}

function attachHls(url: string) {
  const video = videoRef.value;
  if (!video) return;
  if (Hls.isSupported()) {
    hls = new Hls({
      xhrSetup: (xhr) => {
        xhr.setRequestHeader("x-session-id", sessionStorage.getItem("session_id") ?? "");
      },
    });
    hls.loadSource(url);
    hls.attachMedia(video);
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
  }
}

function startDrag(e: MouseEvent) {
  isDragging = true;
  dragStartX = e.clientX;
  dragStartWidth = sidebarWidth.value;
}

function onDrag(e: MouseEvent) {
  if (!isDragging) return;
  const delta = e.clientX - dragStartX;
  sidebarWidth.value = Math.max(180, Math.min(480, dragStartWidth + delta));
}

function stopDrag() {
  isDragging = false;
}
</script>

<style scoped>
.watch-layout {
  display: flex;
  height: calc(100vh - 68px);
  overflow: hidden;
}

.sidebar {
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  min-width: 180px;
  max-width: 480px;
  overflow: hidden;
  flex-shrink: 0;
}

.sidebar-list {
  overflow-y: auto;
  flex: 1;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sidebar-card {
  display: flex;
  gap: 10px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  align-items: center;
}
.sidebar-card:hover { background: #2a2a2a; }
.sidebar-card.active { background: #e50914; }

.sidebar-thumb {
  position: relative;
  width: 90px;
  aspect-ratio: 16/9;
  background: #333;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}
.sidebar-thumb img { width: 100%; height: 100%; object-fit: cover; }
.sidebar-play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  background: rgba(0,0,0,0.4);
  opacity: 0;
  transition: opacity 0.15s;
}
.sidebar-card:hover .sidebar-play { opacity: 1; }

.sidebar-info { flex: 1; min-width: 0; }
.sidebar-title {
  font-size: 0.85rem;
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sidebar-ext { font-size: 0.7rem; color: #aaa; margin-top: 2px; }

.divider {
  width: 4px;
  background: #2a2a2a;
  cursor: col-resize;
  flex-shrink: 0;
  transition: background 0.15s;
}
.divider:hover { background: #e50914; }

.player-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px;
  overflow-y: auto;
  gap: 16px;
}

.player-wrap {
  width: 100%;
  aspect-ratio: 16/9;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}
.player { width: 100%; height: 100%; }

.media-info h2 { font-size: 1.4rem; }
.meta { color: #aaa; font-size: 0.85rem; margin-top: 4px; }
.error { color: #e50914; }

/* responsive: stack at narrow widths */
@media (max-width: 640px) {
  .watch-layout { flex-direction: column; height: auto; }
  .sidebar { width: 100% !important; max-width: 100%; height: 200px; }
  .sidebar-list { flex-direction: row; overflow-x: auto; overflow-y: hidden; }
  .divider { width: 100%; height: 4px; cursor: row-resize; }
  .player-panel { padding: 12px; }
}
</style>