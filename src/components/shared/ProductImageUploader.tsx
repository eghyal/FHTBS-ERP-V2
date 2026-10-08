import React, { useState, useRef, useEffect } from "react";
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ExternalLink,
  Zap,
  Link as LinkIcon,
  RefreshCw,
  Sparkles,
  Grid,
  Plus,
  Star,
  Image as ImageIcon,
} from "lucide-react";
import { uploadUniversalFile } from "@/lib/cloudStorage";
import { optimizeProductImage, formatBytes } from "@/lib/imageOptimizer";

interface PresetItem {
  category: string;
  name: string;
  url: string;
  description: string;
}

const DEFAULT_PRESETS: PresetItem[] = [
  {
    category: "Paving",
    name: "Paving Block Truepave Bata 20x10x6 cm K-300",
    url: "https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?w=800&auto=format&fit=crop&q=80",
    description: "Paving bata presisi hidrolik mutu K-300",
  },
  {
    category: "Paving",
    name: "Paving Block Hexagon Segi Enam Merah K-350",
    url: "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800&auto=format&fit=crop&q=80",
    description: "Paving segi enam interlock area parkir berat",
  },
  {
    category: "Drainase",
    name: "Saluran Drainase U-Ditch Beton Precast 40x40x120",
    url: "https://images.unsplash.com/photo-1541888946425-d0fbb186f5f8?w=800&auto=format&fit=crop&q=80",
    description: "Saluran gorong-gorong U-ditch pracetak bertulang",
  },
  {
    category: "Kanstin",
    name: "Kanstin Taman / Curbstone Beton 40x20x10 cm",
    url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&auto=format&fit=crop&q=80",
    description: "Pembatas trotoar dan jalan perumahan PU",
  },
  {
    category: "Fabrikasi",
    name: "Tangki Stainless Steel SS304 Industrial",
    url: "https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?w=800&auto=format&fit=crop&q=80",
    description: "Tangki penyimpanan industri pengelasan TIG",
  },
  {
    category: "Fabrikasi",
    name: "CNC Laser Cutting & Profil Baja",
    url: "https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?w=800&auto=format&fit=crop&q=80",
    description: "Fabrikasi lembaran plat dan komponen baja",
  },
  {
    category: "Eco Paving",
    name: "Grass Block 8 Lubang Resapan Air",
    url: "https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=800&auto=format&fit=crop&q=80",
    description: "Blok beton porus resapan air ramah lingkungan",
  },
  {
    category: "Fasilitas",
    name: "Mesin Pres Hidrolik Pabrik",
    url: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&auto=format&fit=crop&q=80",
    description: "Lini produksi cetak otomatis bertekanan tinggi",
  },
];

export interface ProductImageUploaderProps {
  id?: string;
  label?: string;
  value?: string;
  galleryUrls?: string[];
  onChange?: (primaryUrl: string) => void;
  onGalleryChange?: (galleryUrls: string[]) => void;
  onImagesChange?: (primaryUrl: string, galleryUrls: string[]) => void;
  pathPrefix?: string;
  className?: string;
  disabled?: boolean;
}

export function ProductImageUploader({
  id = "product-image-uploader",
  label = "Product Gallery & Portfolio Photos (Multi-Upload Supported >= 1)",
  value = "",
  galleryUrls = [],
  onChange,
  onGalleryChange,
  onImagesChange,
  pathPrefix = "catalog_products",
  className = "",
  disabled = false,
}: ProductImageUploaderProps) {
  // Consolidate current images list
  const currentImages = React.useMemo(() => {
    const list: string[] = [];
    if (value && value.trim()) list.push(value.trim());
    if (Array.isArray(galleryUrls)) {
      galleryUrls.forEach((u) => {
        if (u && typeof u === "string" && u.trim() && !list.includes(u.trim())) {
          list.push(u.trim());
        }
      });
    }
    return list;
  }, [value, galleryUrls]);

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Optimizing Image...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const notifyChanges = (newImages: string[]) => {
    const primary = newImages[0] || "";
    if (onChange) onChange(primary);
    if (onGalleryChange) onGalleryChange(newImages);
    if (onImagesChange) onImagesChange(primary, newImages);
  };

  const handleAddImage = (newUrl: string) => {
    if (!newUrl || !newUrl.trim()) return;
    const cleanUrl = newUrl.trim();
    if (currentImages.includes(cleanUrl)) return;
    const updated = [...currentImages, cleanUrl];
    notifyChanges(updated);
  };

  const handleRemoveImage = (indexToRemove: number) => {
    const updated = currentImages.filter((_, idx) => idx !== indexToRemove);
    notifyChanges(updated);
  };

  const handleSetPrimary = (indexToPrimary: number) => {
    if (indexToPrimary <= 0 || indexToPrimary >= currentImages.length) return;
    const selected = currentImages[indexToPrimary];
    const rest = currentImages.filter((_, idx) => idx !== indexToPrimary);
    const updated = [selected, ...rest];
    notifyChanges(updated);
  };

  const processAndUploadFile = async (file: File) => {
    setErrorMessage(null);

    if (!file.type.startsWith("image/")) {
      setErrorMessage("File must be an image (JPG, PNG, WEBP, etc.).");
      return;
    }

    abortControllerRef.current = new AbortController();

    try {
      setIsProcessing(true);
      setStatusText("Compressing WebP Image...");

      const optResult = await optimizeProductImage(file, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.82,
        format: "image/webp",
      });

      setIsProcessing(false);
      setUploading(true);
      setStatusText("Uploading Photo...");
      setProgress(30);

      const uploadedUrl = await uploadUniversalFile(
        optResult.file,
        pathPrefix,
      );

      setProgress(100);
      handleAddImage(uploadedUrl);
    } catch (err: any) {
      console.error("Upload error:", err);
      setErrorMessage(err.message || "Failed to upload photo.");
    } finally {
      setIsProcessing(false);
      setUploading(false);
      setProgress(0);
    }
  };

  const handleMultipleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      await processAndUploadFile(files[i]);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleMultipleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className={`space-y-3 font-sans ${className}`}>
      {/* Label Bar */}
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
          {label}
        </label>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/jpg,image/avif"
        multiple
        className="hidden"
        onChange={(e) => handleMultipleFiles(e.target.files)}
        disabled={disabled || isProcessing || uploading}
      />

      {/* Upload Progress Loader */}
      {(isProcessing || uploading) && (
        <div className="p-4 bg-amber-50/50 border border-amber-200/80 rounded-2xl flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold text-stone-900 block truncate">
              {statusText}
            </span>
            <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden mt-1.5">
              <div
                className="bg-amber-600 h-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Multi-Photo Gallery Grid */}
      {currentImages.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-stone-500 font-medium">
            <span>
              {currentImages.length} Photo{currentImages.length > 1 ? "s" : ""} Attached • First photo is set as{" "}
              <strong className="text-stone-900">Main Cover</strong>
            </span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isProcessing || uploading}
              className="text-brand hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add More Photos</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {currentImages.map((imgUrl, idx) => (
              <div
                key={idx}
                className={`relative rounded-xl border overflow-hidden bg-white group shadow-2xs ${
                  idx === 0
                    ? "border-amber-500 ring-2 ring-amber-500/20"
                    : "border-stone-200 hover:border-stone-300"
                }`}
              >
                <div className="w-full aspect-4/3 bg-stone-100 overflow-hidden relative">
                  <img
                    src={imgUrl}
                    alt={`Product photo ${idx + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />

                  {/* Primary Cover Badge */}
                  {idx === 0 ? (
                    <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold bg-amber-500 text-white shadow-xs inline-flex items-center gap-1">
                      <Star className="w-2.5 h-2.5 fill-white" /> Main Cover
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSetPrimary(idx)}
                      className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-stone-900/80 hover:bg-stone-900 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      title="Set as Main Cover"
                    >
                      Set Cover
                    </button>
                  )}

                  {/* Remove Button */}
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      className="absolute top-1.5 right-1.5 p-1 rounded-md bg-stone-900/80 hover:bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                      title="Remove Photo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Drag and Drop Zone if empty or for adding more */}
      {currentImages.length === 0 && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() =>
            !disabled && !isProcessing && !uploading && fileInputRef.current?.click()
          }
          className={`relative border-2 border-dashed rounded-2xl p-5 sm:p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
            isDragging
              ? "border-amber-500 bg-amber-50/20"
              : "border-stone-200 hover:border-stone-300 bg-stone-50/50 hover:bg-stone-50"
          } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
        >
          <div className="flex flex-col items-center gap-2 py-1">
            <div className="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200/80 flex items-center justify-center text-stone-600">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-stone-800">
                Click or drag &amp; drop photos here to upload (multi-file upload supported)
              </p>
              <p className="text-[11px] text-stone-400 mt-1">
                Supports JPG, PNG, WEBP • Automatically compressed for fast loading
              </p>
            </div>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-1.5 text-[11px] text-rose-600 font-medium">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
