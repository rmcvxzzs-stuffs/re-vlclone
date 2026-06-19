<template>
  <div class="history">
    <h2>Watch History</h2>
    <p v-if="entries.length === 0" class="empty">Nothing watched yet.</p>
    <div v-else class="grid">
      <div v-for="entry in entries" :key="entry.media_id" class="card">
        <div class="thumbnail">
          <img :src="`/thumbnails/${entry.media_id}`" :alt="entry.title" />
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: progressPct(entry) + '%' }"
            />
          </div>
        </div>
        <p class="title">{{ entry.title }}</p>
        <p class="meta">
          {{ formatTime(entry.position) }} watched ·
          {{ formatDate(entry.updated_at) }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";

interface HistoryEntry {
  media_id: string;
  position: number;
  updated_at: string;
  title: string;
  duration: number;
}

const entries = ref<HistoryEntry[]>([]);

onMounted(async () => {
  const res = await fetch("/api/history", {
    headers: { "x-session-id": sessionStorage.getItem("session_id") ?? "" },
  });
  if (!res.ok) return;
  const data = await res.json();

  // media is protobuf so we just use the thumbnail and title from a simple map
  // for now use media_id as title fallback until we have a proper media map
  entries.value = data.history.map((h: any) => ({
    ...h,
    title: h.media_id,
    duration: 0,
  }));
});

function progressPct(entry: HistoryEntry): number {
  if (!entry.duration) return 0;
  return Math.min((entry.position / entry.duration) * 100, 100);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}
</script>

<style scoped>
.history {
  padding: 40px;
}
h2 {
  font-size: 1.5rem;
  margin-bottom: 24px;
}
.empty {
  color: #aaa;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
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
.progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.2);
}
.progress-fill {
  height: 100%;
  background: #e50914;
}
.title {
  margin-top: 8px;
  font-weight: bold;
  font-size: 0.95rem;
}
.meta {
  font-size: 0.75rem;
  color: #aaa;
  margin-top: 4px;
}
</style>
