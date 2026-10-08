import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { BoardMessage } from "@/types/mascot";
import { apiFetch } from "@/utils/api";

/**
 * Konten default pesan ucapan maskot CV Batu Emas.
 */
export const DEFAULT_WELCOME_MESSAGES: BoardMessage[] = [
  {
    badge: "Selamat Datang",
    title: "Halo! Selamat Datang di CV Batu Emas",
    subtitle: "Paving blok presisi hidrolik mutu K-300 & K-400.",
  },
  {
    badge: "Mutu SNI",
    title: "Uji Lab Beton Terpercaya",
    subtitle: "Kuat tekan teruji untuk jalan, trotoar & kawasan industri.",
  },
  {
    badge: "Pabrik Langsung",
    title: "Harga Tangan Pertama",
    subtitle: "Produksi sendiri, armada sendiri, pengiriman terjadwal.",
  },
];

const safeStorage = {
  getItem: (name: string) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      /* ignore */
    }
  },
  removeItem: (name: string) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

interface MascotState {
  /** Apakah maskot tampil di halaman publik (Beranda) */
  isVisibleOnPublic: boolean;
  /** Daftar pesan ucapan yang dikelola secara manual oleh user */
  messages: BoardMessage[];
  /** Indeks pesan aktif saat ini */
  index: number;
  /** Rotasi otomatis pesan */
  playing: boolean;
  /** Data URL gambar kustom untuk isi papan (null = teks pesan dinamis) */
  boardImage: string | null;
  /** Data URL motif/warna baju manual (null = baju rompi default asli) */
  shirtPattern: string | null;

  // Actions
  setIsVisibleOnPublic: (visible: boolean) => void;
  setMessages: (messages: BoardMessage[]) => void;
  addMessage: (message: BoardMessage) => void;
  updateMessage: (index: number, message: BoardMessage) => void;
  removeMessage: (index: number) => void;
  resetMessages: () => void;
  next: () => void;
  goTo: (index: number) => void;
  togglePlay: () => void;
  setBoardImage: (dataUrl: string | null) => void;
  setShirtPattern: (dataUrl: string | null) => void;
  resetToDefault: () => void;
  fetchFromServer: () => Promise<void>;
  current: () => BoardMessage;
}

export const useMascotStore = create<MascotState>()(
  persist(
    (set, get) => ({
      isVisibleOnPublic: true,
      messages: DEFAULT_WELCOME_MESSAGES,
      index: 0,
      playing: true,
      boardImage: null,
      shirtPattern: null,

      setIsVisibleOnPublic: (visible) => {
        set({ isVisibleOnPublic: visible });
        // Sinkronisasi ke server SQLite & Socket.io secara instan
        apiFetch("/api/mascot", {
          method: "POST",
          body: { isVisibleOnPublic: visible },
        }).catch((err) => {
          console.warn("Failed to sync mascot visibility to server:", err);
        });
      },

      setMessages: (messages) => {
        const nextList = messages.length > 0 ? messages : DEFAULT_WELCOME_MESSAGES;
        set({ messages: nextList });
        apiFetch("/api/mascot", {
          method: "POST",
          body: { messages: nextList },
        }).catch(() => {});
      },

      addMessage: (msg) => {
        const updated = [...get().messages, msg];
        set({ messages: updated });
        apiFetch("/api/mascot", {
          method: "POST",
          body: { messages: updated },
        }).catch(() => {});
      },

      updateMessage: (idx, msg) => {
        const updated = [...get().messages];
        if (updated[idx]) {
          updated[idx] = msg;
        }
        set({ messages: updated });
        apiFetch("/api/mascot", {
          method: "POST",
          body: { messages: updated },
        }).catch(() => {});
      },

      removeMessage: (idx) => {
        const updated = get().messages.filter((_, i) => i !== idx);
        const final = updated.length > 0 ? updated : DEFAULT_WELCOME_MESSAGES;
        set({ messages: final, index: 0 });
        apiFetch("/api/mascot", {
          method: "POST",
          body: { messages: final },
        }).catch(() => {});
      },

      resetMessages: () => {
        set({ messages: DEFAULT_WELCOME_MESSAGES, index: 0 });
        apiFetch("/api/mascot", {
          method: "POST",
          body: { messages: DEFAULT_WELCOME_MESSAGES },
        }).catch(() => {});
      },

      next: () => {
        const { messages, index } = get();
        if (messages.length <= 1) return;
        set({ index: (index + 1) % messages.length });
      },

      goTo: (idx) => {
        const { messages } = get();
        set({ index: idx % messages.length });
      },

      togglePlay: () => set((s) => ({ playing: !s.playing })),

      setBoardImage: (dataUrl) => {
        set({ boardImage: dataUrl });
        apiFetch("/api/mascot", {
          method: "POST",
          body: { boardImage: dataUrl },
        }).catch(() => {});
      },

      setShirtPattern: (dataUrl) => {
        set({ shirtPattern: dataUrl });
        apiFetch("/api/mascot", {
          method: "POST",
          body: { shirtPattern: dataUrl },
        }).catch(() => {});
      },

      resetToDefault: () => {
        set({
          isVisibleOnPublic: true,
          boardImage: null,
          shirtPattern: null,
          messages: DEFAULT_WELCOME_MESSAGES,
          index: 0,
          playing: true,
        });
        apiFetch("/api/mascot", {
          method: "POST",
          body: {
            isVisibleOnPublic: true,
            boardImage: null,
            shirtPattern: null,
            messages: DEFAULT_WELCOME_MESSAGES,
          },
        }).catch(() => {});
      },

      fetchFromServer: async () => {
        try {
          const res = await apiFetch<{
            success: boolean;
            isVisibleOnPublic?: boolean;
            boardImage?: string | null;
            shirtPattern?: string | null;
            messages?: BoardMessage[] | null;
          }>("/api/mascot", { method: "GET" });

          if (res.ok && res.data) {
            const data = res.data;
            set((s) => ({
              isVisibleOnPublic:
                data.isVisibleOnPublic !== undefined
                  ? Boolean(data.isVisibleOnPublic)
                  : s.isVisibleOnPublic,
              boardImage:
                data.boardImage !== undefined ? data.boardImage : s.boardImage,
              shirtPattern:
                data.shirtPattern !== undefined
                  ? data.shirtPattern
                  : s.shirtPattern,
              messages:
                data.messages && Array.isArray(data.messages) && data.messages.length > 0
                  ? data.messages
                  : s.messages,
            }));
          }
        } catch (e) {
          console.warn("Failed to fetch mascot settings from server:", e);
        }
      },

      current: () => {
        const { messages, index } = get();
        const list = messages.length > 0 ? messages : DEFAULT_WELCOME_MESSAGES;
        return list[index % list.length];
      },
    }),
    {
      name: "paving-joss-custom-v3",
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        isVisibleOnPublic: s.isVisibleOnPublic,
        messages: s.messages,
        boardImage: s.boardImage,
        shirtPattern: s.shirtPattern,
      }),
    }
  )
);

// Inisialisasi otomatis sinkronisasi server & event listener saat di browser
if (typeof window !== "undefined") {
  // 1. Fetch data dari server
  useMascotStore.getState().fetchFromServer();

  // 2. Listener perubahan cross-tab localStorage
  window.addEventListener("storage", (e) => {
    if (e.key === "paving-joss-custom-v3") {
      try {
        if (e.newValue) {
          const parsed = JSON.parse(e.newValue);
          if (parsed?.state) {
            useMascotStore.setState({
              isVisibleOnPublic:
                parsed.state.isVisibleOnPublic !== undefined
                  ? Boolean(parsed.state.isVisibleOnPublic)
                  : true,
              messages: parsed.state.messages || DEFAULT_WELCOME_MESSAGES,
              boardImage: parsed.state.boardImage ?? null,
              shirtPattern: parsed.state.shirtPattern ?? null,
            });
          }
        }
      } catch (err) {}
    }
  });
}
