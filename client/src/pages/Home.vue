<template>
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
    <div class="grid">
      <div
        v-for="item in mediaItems"
        :key="item.id"
        class="card"
        @click="goToWatch(item)"
      >
        <div class="thumbnail">
          <img :src="item.thumbnail || '/placeholder.jpg'" :alt="item.title" />
          <div class="overlay">▶</div>
        </div>
        <p class="title">{{ item.title }}</p>
        <p class="desc">{{ item.description }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import protobuf from "protobufjs";
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const authed = ref(false);
const password = ref("");
const loginError = ref("");
const mediaItems = ref<any[]>([]);
const isProtected = ref(true);

let root: protobuf.Root;
let LoginRequest: protobuf.Type;
let LoginResponse: protobuf.Type;
let MediaList: protobuf.Type;

onMounted(async () => {
  root = await protobuf.load(["/proto/media.proto", "/proto/auth.proto"]);
  LoginRequest = root.lookupType("revlclone.LoginRequest");
  LoginResponse = root.lookupType("revlclone.LoginResponse");
  MediaList = root.lookupType("revlclone.MediaList");

  const configRes = await fetch("/api/config");
  const config = await configRes.json();
  isProtected.value = config.protected;
  if (!isProtected.value) {
    authed.value = true;
    await fetchMedia();
  }
});

function goToWatch(item: any) {
  router.push(`/watch/${item.id}`);
}

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
</script>

<style scoped>
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
</style>
