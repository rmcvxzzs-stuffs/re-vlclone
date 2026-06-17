<template>
  <div id="app">
    <!-- Login screen -->
    <div v-if="!authed && isProtected" class="login-screen">
      <div class="login-box">
        <h1>re-vlclone</h1>
        <input
          v-model="password"
          type="password"
          placeholder="Enter password"
          @keyup.enter="login"
        />
        <button @click="login">Enter</button>
        <p v-if="loginError" class="error">{{ loginError }}</p>
      </div>
    </div>

    <!-- Media grid -->
    <div v-else class="main">
      <header>
        <h1>re-vlclone</h1>
      </header>
      <div class="grid">
        <div
          v-for="item in mediaItems"
          :key="item.id"
          class="card"
          @click="play(item)"
        >
          <div class="thumbnail">
            <img
              :src="item.thumbnail || '/placeholder.jpg'"
              :alt="item.title"
            />
            <div class="overlay">▶</div>
          </div>
          <p class="title">{{ item.title }}</p>
          <p class="desc">{{ item.description }}</p>
        </div>
      </div>
    </div>

    <!-- Player -->
    <div v-if="currentMedia" class="player-overlay">
      <div class="player-box">
        <button class="close" @click="currentMedia = null">✕</button>
        <h2>{{ currentMedia.title }}</h2>
        <video ref="videoRef" controls autoplay class="player" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import protobuf from "protobufjs";
import Hls from "hls.js";
import { nextTick } from "vue";

const authed = ref(false);
const password = ref("");
const loginError = ref("");
const mediaItems = ref<any[]>([]);
const currentMedia = ref<any>(null);
const streamUrl = ref("");
const isProtected = ref(true);
const videoRef = ref<HTMLVideoElement | null>(null);

let hls: Hls | null = null;
let root: protobuf.Root;
let LoginRequest: protobuf.Type;
let LoginResponse: protobuf.Type;
let MediaList: protobuf.Type;
let PlaybackRequest: protobuf.Type;

onMounted(async () => {
  root = await protobuf.load(["/proto/media.proto", "/proto/auth.proto"]);
  LoginRequest = root.lookupType("vlclone.LoginRequest");
  LoginResponse = root.lookupType("vlclone.LoginResponse");
  MediaList = root.lookupType("vlclone.MediaList");
  PlaybackRequest = root.lookupType("vlclone.PlaybackRequest");

  const configRes = await fetch("/api/config");
  const config = await configRes.json();
  isProtected.value = config.protected;
  if (!isProtected.value) {
    authed.value = true;
    await fetchMedia();
  }
});
async function login() {
  const encoded = LoginRequest.encode(
    LoginRequest.create({ password: password.value }),
  ).finish();
  const res = await fetch("/api/auth/login", {
    method: "POST",
    body: encoded as unknown as BodyInit,
    headers: { "Content-Type": "application/x-protobuf" },
  });
  const buf = await res.arrayBuffer();
  const response = LoginResponse.decode(new Uint8Array(buf));
  const obj = LoginResponse.toObject(response) as any;
  if (obj.success) {
    sessionStorage.setItem("session_id", obj.sessionId);
    authed.value = true;
    await fetchMedia();
  } else {
    loginError.value = obj.error || "Wrong password";
  }
}

async function fetchMedia() {
  const res = await fetch("/api/media", {
    headers: { "x-session-id": sessionStorage.getItem("session_id") ?? "" },
  });
  const buf = await res.arrayBuffer();
  const list = MediaList.decode(new Uint8Array(buf));
  const obj = MediaList.toObject(list, { defaults: true }) as any;
  mediaItems.value = obj.items ?? [];
}

async function play(item: any) {
  const encoded = PlaybackRequest.encode(
    PlaybackRequest.create({ mediaId: item.id }),
  ).finish();
  const res = await fetch("/api/play", {
    method: "POST",
    body: encoded as unknown as BodyInit,
    headers: {
      "Content-Type": "application/x-protobuf",
      "x-session-id": sessionStorage.getItem("session_id") ?? "",
    },
  });
  if (!res.ok) return;

  currentMedia.value = item;
  streamUrl.value = `/hls/${item.id}/playlist.m3u8`;
  await nextTick();
  attachHls(streamUrl.value);
}

function attachHls(url: string) {
  if (hls) {
    hls.destroy();
    hls = null;
  }
  const video = videoRef.value;
  if (!video) return;

  if (Hls.isSupported()) {
    hls = new Hls();
    hls.loadSource(url);
    hls.attachMedia(video);
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
  }
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
body {
  background: #141414;
  color: white;
  font-family: sans-serif;
}

.login-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
}
.login-box {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #222;
  padding: 40px;
  border-radius: 8px;
  min-width: 300px;
}
.login-box h1 {
  font-size: 2rem;
  margin-bottom: 8px;
}
.login-box input {
  padding: 10px;
  border-radius: 4px;
  border: none;
  background: #333;
  color: white;
  font-size: 1rem;
}
.login-box button {
  padding: 10px;
  background: #e50914;
  border: none;
  color: white;
  font-size: 1rem;
  border-radius: 4px;
  cursor: pointer;
}
.error {
  color: #e50914;
  font-size: 0.9rem;
}

header {
  padding: 20px 40px;
  background: #0a0a0a;
}
header h1 {
  font-size: 1.8rem;
  color: #e50914;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  padding: 40px;
}
.card {
  cursor: pointer;
}
.thumbnail {
  position: relative;
  aspect-ratio: 16/9;
  background: #333;
  border-radius: 4px;
  overflow: hidden;
}
.thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  background: rgba(0, 0, 0, 0.4);
  opacity: 0;
  transition: opacity 0.2s;
}
.card:hover .overlay {
  opacity: 1;
}
.title {
  margin-top: 8px;
  font-weight: bold;
  font-size: 0.95rem;
}
.desc {
  font-size: 0.8rem;
  color: #aaa;
  margin-top: 4px;
}

.player-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.player-box {
  background: #1a1a1a;
  border-radius: 8px;
  padding: 24px;
  max-width: 900px;
  width: 90%;
  position: relative;
}
.player-box h2 {
  margin-bottom: 12px;
}
.player {
  width: 100%;
  border-radius: 4px;
}
.close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  color: white;
  font-size: 1.2rem;
  cursor: pointer;
}
</style>
