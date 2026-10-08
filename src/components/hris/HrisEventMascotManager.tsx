import React, { useRef, useState } from "react";
import {
  ImagePlus,
  Presentation,
  Shirt,
  X,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  Sliders,
  Globe,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Edit3,
  Check,
  MessageSquare,
  HelpCircle,
} from "lucide-react";
import { useMascotStore, DEFAULT_WELCOME_MESSAGES } from "@/stores/mascotStore";
import { fileToDataUrl } from "@/lib/imageFile";
import { MascotBoard } from "@/components/mascot/MascotBoard";
import { useToast } from "@/contexts/ToastContext";
import type { BoardMessage } from "@/types/mascot";

interface UploadSlotProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  tip: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}

function UploadSlot({
  icon,
  title,
  description,
  tip,
  value,
  onChange,
}: UploadSlotProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      onChange(dataUrl);
      showToast(`${title} berhasil diperbarui!`, "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal memproses gambar.";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 p-5 rounded-2xl bg-white border border-stone-200/80 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-stone-900">
          <span className="p-1.5 rounded-lg bg-red-50 text-brand">{icon}</span>
          {title}
        </div>
        {value && (
          <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Kustom Aktif
          </span>
        )}
      </div>

      <p className="text-xs text-stone-500 font-medium">{tip}</p>

      {/* Drop zone / preview */}
      <div
        role="button"
        tabIndex={0}
        aria-label={value ? `Ganti ${title}` : `Unggah ${title}`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) =>
          (e.key === "Enter" || e.key === " ") && inputRef.current?.click()
        }
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`group relative flex h-40 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300 ease-motion ${
          dragging
            ? "border-brand bg-red-50/50"
            : "border-stone-300 bg-stone-50/80 hover:border-stone-400 hover:bg-stone-100/50"
        }`}
      >
        {value ? (
          <img
            src={value}
            alt={`Pratinjau ${title}`}
            className="h-full w-full object-contain p-2"
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <div className="p-3 rounded-full bg-white shadow-sm border border-stone-200 text-stone-400 group-hover:text-brand group-hover:scale-110 transition-all">
              <ImagePlus className="w-6 h-6" />
            </div>
            <p className="text-xs leading-snug font-semibold text-stone-700">
              {loading ? "Sedang memproses..." : description}
            </p>
            <span className="text-[11px] text-stone-400">
              Klik atau tarik gambar ke sini (PNG/JPG/WebP)
            </span>
          </div>
        )}

        {value && (
          <span className="absolute inset-x-0 bottom-0 bg-stone-900/80 py-1.5 text-center text-[10px] font-bold tracking-wider text-white uppercase opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            Klik / drop untuk mengganti
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {error && <p className="text-xs font-semibold text-brand">{error}</p>}

      {value && (
        <button
          type="button"
          onClick={() => {
            onChange(null);
            showToast(`${title} dikembalikan ke default.`, "info");
          }}
          className="inline-flex w-fit items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-600 transition-all duration-300 hover:border-red-300 hover:text-brand active:scale-[0.97] cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          Hapus Kustomisasi &amp; Kembali ke Default
        </button>
      )}
    </div>
  );
}

export function HrisEventMascotManager() {
  const isVisibleOnPublic = useMascotStore((s) => s.isVisibleOnPublic);
  const setIsVisibleOnPublic = useMascotStore((s) => s.setIsVisibleOnPublic);
  const boardImage = useMascotStore((s) => s.boardImage);
  const shirtPattern = useMascotStore((s) => s.shirtPattern);
  const messages = useMascotStore((s) => s.messages);
  const setBoardImage = useMascotStore((s) => s.setBoardImage);
  const setShirtPattern = useMascotStore((s) => s.setShirtPattern);
  const addMessage = useMascotStore((s) => s.addMessage);
  const updateMessage = useMascotStore((s) => s.updateMessage);
  const removeMessage = useMascotStore((s) => s.removeMessage);
  const resetMessages = useMascotStore((s) => s.resetMessages);
  const resetToDefault = useMascotStore((s) => s.resetToDefault);
  const { showToast } = useToast();

  // State untuk form tambah/edit pesan
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState<BoardMessage>({
    badge: "",
    title: "",
    subtitle: "",
  });
  const [isAddingNew, setIsAddingNew] = useState(false);

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setFormData(messages[index] || { badge: "", title: "", subtitle: "" });
    setIsAddingNew(false);
  };

  const startAdd = () => {
    setIsAddingNew(true);
    setEditingIndex(null);
    setFormData({ badge: "Info Penting", title: "", subtitle: "" });
  };

  const cancelForm = () => {
    setIsAddingNew(false);
    setEditingIndex(null);
    setFormData({ badge: "", title: "", subtitle: "" });
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.subtitle.trim()) {
      showToast("Judul dan Subtitle pesan tidak boleh kosong.", "error");
      return;
    }

    const payload: BoardMessage = {
      badge: formData.badge.trim() || "Info",
      title: formData.title.trim(),
      subtitle: formData.subtitle.trim(),
    };

    if (isAddingNew) {
      addMessage(payload);
      showToast("Pesan ucapan baru berhasil ditambahkan!", "success");
    } else if (editingIndex !== null) {
      updateMessage(editingIndex, payload);
      showToast("Pesan ucapan berhasil diperbarui!", "success");
    }

    cancelForm();
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Top Header & Overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 p-6 sm:p-8 rounded-3xl text-white shadow-xl border border-stone-700/50">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand/40 border border-red-500/30 rounded-full text-xs font-bold text-red-200 mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            Manajemen Maskot 3D Si Paving Joss
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
            Pengaturan Maskot &amp; Papan Ucapan
          </h2>
          <p className="mt-1 text-sm text-stone-300 max-w-2xl leading-relaxed">
            Kelola visibilitas, motif baju rompi, banner visual, dan rotasi pesan ucapan secara manual tanpa preset kaku.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              resetToDefault();
              showToast("Pengaturan maskot dikembalikan ke default.", "info");
            }}
            className="px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-600 text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset Semua</span>
          </button>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 bg-brand hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg hover:shadow-red-500/30"
          >
            <Globe className="w-4 h-4" />
            <span>Buka Beranda Publik</span>
          </a>
        </div>
      </div>

      {/* Main Grid: Control Panel (Left) & Live 3D Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: Controls & Messages */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card: Visibilitas Maskot Publik */}
          <div className="bg-white border border-stone-200/80 rounded-3xl p-6 shadow-sm flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={`p-2 rounded-xl ${
                    isVisibleOnPublic
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-stone-100 text-stone-500"
                  }`}
                >
                  {isVisibleOnPublic ? (
                    <Eye className="w-5 h-5" />
                  ) : (
                    <EyeOff className="w-5 h-5" />
                  )}
                </span>
                <h3 className="text-base font-black text-stone-900 tracking-tight">
                  Tampilkan Maskot di Halaman Publik
                </h3>
              </div>
              <p className="text-xs text-stone-500 max-w-md">
                Jika dinonaktifkan, maskot 3D tidak akan muncul di halaman beranda publik dan tata letak hero akan otomatis melebar rapi.
              </p>
            </div>

            <button
              onClick={() => {
                const nextVal = !isVisibleOnPublic;
                setIsVisibleOnPublic(nextVal);
                showToast(
                  nextVal
                    ? "Maskot sekarang AKTIF di halaman publik."
                    : "Maskot disembunyikan dari halaman publik.",
                  nextVal ? "success" : "info"
                );
              }}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isVisibleOnPublic ? "bg-brand" : "bg-stone-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isVisibleOnPublic ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Card: Upload Slots (Papan & Baju) */}
          <div className="bg-stone-50 border border-stone-200/80 rounded-3xl p-6 shadow-sm space-y-6">
            <div>
              <h3 className="text-lg font-black text-stone-900 tracking-tight flex items-center gap-2">
                <Sliders className="w-5 h-5 text-brand" />
                Kustomisasi Visual Maskot (Manual)
              </h3>
              <p className="text-xs text-stone-600 mt-0.5">
                Tentukan gambar isi papan pengumuman atau motif baju rompi secara manual sesuai kebutuhan promosi atau event perusahaan.
              </p>
            </div>

            <div className="space-y-5">
              {/* Slot 1: Board Content Image */}
              <UploadSlot
                icon={<Presentation className="w-4 h-4" />}
                title="Isi Papan Pengumuman (Banner Kustom)"
                description="Upload poster/banner khusus untuk mengisi papan maskot"
                tip="Gunakan gambar orientasi landscape. Jika kosong, papan akan menampilkan teks pesan dinamis di bawah."
                value={boardImage}
                onChange={setBoardImage}
              />

              {/* Slot 2: Shirt Pattern Image */}
              <UploadSlot
                icon={<Shirt className="w-4 h-4" />}
                title="Motif / Warna Baju Rompi Maskot"
                description="Upload gambar motif batik/kain/seragam kustom"
                tip="Gunakan pola seamless / seragam pabrik. Jika kosong, maskot mengenakan rompi bunga tropis bawaan pabrik."
                value={shirtPattern}
                onChange={setShirtPattern}
              />
            </div>
          </div>

          {/* Card: Manajemen Pesan Ucapan Dinamis (Manual) */}
          <div className="bg-white border border-stone-200/80 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
              <div>
                <h3 className="text-base font-black text-stone-900 tracking-tight flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-brand" />
                  Kelola Pesan Ucapan Papan Maskot ({messages.length} Pesan)
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Pesan akan berotasi otomatis setiap 6 detik di atas papan dan dapat dibuka detailnya oleh pengunjung saat maskot diklik.
                </p>
              </div>

              {!isAddingNew && editingIndex === null && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={startAdd}
                    className="px-3.5 py-1.5 bg-brand hover:bg-red-800 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Pesan</span>
                  </button>
                  <button
                    onClick={() => {
                      resetMessages();
                      showToast("Daftar pesan di-reset ke ucapan standar.", "info");
                    }}
                    title="Reset ke pesan selamat datang standar"
                    className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Form Tambah / Edit Pesan */}
            {(isAddingNew || editingIndex !== null) && (
              <form
                onSubmit={handleSaveForm}
                className="p-5 rounded-2xl bg-red-50/40 border border-red-200/80 space-y-4 animate-fadeIn"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-brand uppercase tracking-wider">
                    {isAddingNew ? "Tambah Pesan Baru" : `Edit Pesan #${editingIndex! + 1}`}
                  </span>
                  <button
                    type="button"
                    onClick={cancelForm}
                    className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      Badge Kategori (Contoh: Promo Spesial, Mutu SNI, Selamat Datang)
                    </label>
                    <input
                      type="text"
                      value={formData.badge}
                      onChange={(e) =>
                        setFormData({ ...formData, badge: e.target.value })
                      }
                      placeholder="e.g. Promo Pabrik"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-brand bg-white font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      Judul Utama Papan (Teks Besar)
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) =>
                        setFormData({ ...formData, title: e.target.value })
                      }
                      placeholder="e.g. Diskon Khusus Proyek Kawasan Industri"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-brand bg-white font-bold"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      Subtitle / Keterangan Singkat
                    </label>
                    <textarea
                      rows={2}
                      value={formData.subtitle}
                      onChange={(e) =>
                        setFormData({ ...formData, subtitle: e.target.value })
                      }
                      placeholder="e.g. Gratis ongkir Banyuwangi & Jember untuk pembelian di atas 500 m2."
                      className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-brand bg-white font-medium"
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={cancelForm}
                    className="px-3.5 py-1.5 rounded-xl border border-stone-300 text-xs font-bold text-stone-600 hover:bg-stone-100 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-brand hover:bg-red-800 text-xs font-bold text-white shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Simpan Pesan</span>
                  </button>
                </div>
              </form>
            )}

            {/* List Pesan Aktif */}
            <div className="space-y-2.5">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 hover:border-stone-300 flex items-start justify-between gap-4 transition-all"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-brand bg-red-100 px-2 py-0.5 rounded-md">
                        {msg.badge}
                      </span>
                      <span className="text-xs font-bold text-stone-900 truncate">
                        {msg.title}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 font-medium line-clamp-2">
                      {msg.subtitle}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => startEdit(idx)}
                      className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-lg transition-all cursor-pointer"
                      title="Edit Pesan"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    {messages.length > 1 && (
                      <button
                        onClick={() => {
                          removeMessage(idx);
                          showToast("Pesan berhasil dihapus.", "info");
                        }}
                        className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                        title="Hapus Pesan"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Live 3D Mascot Preview */}
        <div className="lg:col-span-5 sticky top-24 space-y-4">
          <div className="bg-white border-2 border-stone-200 rounded-[2.5rem] p-6 sm:p-8 shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                  Live Pratinjau Maskot 3D
                </span>
              </div>
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                  isVisibleOnPublic
                    ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                    : "text-stone-500 bg-stone-100"
                }`}
              >
                {isVisibleOnPublic ? "Aktif di Beranda" : "Disembunyikan"}
              </span>
            </div>

            {/* Live Mascot Rendering */}
            <div className="py-2 flex justify-center">
              <MascotBoard enableDetailModal={true} />
            </div>

            <div className="mt-6 pt-4 border-t border-stone-100 flex flex-col gap-2 text-xs text-stone-500">
              <div className="flex items-center gap-2 font-medium">
                <Eye className="w-4 h-4 text-brand" />
                <span>Klik maskot di atas untuk mencoba membuka modal detail pengumuman.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
