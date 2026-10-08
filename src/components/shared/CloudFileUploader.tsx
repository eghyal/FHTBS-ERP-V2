import React, { useState, useRef } from "react";
import { UploadCloud, CheckCircle2, AlertCircle, Loader2, X, FileText, ExternalLink } from "lucide-react";
import { uploadUniversalFile } from "@/lib/cloudStorage";

interface CloudFileUploaderProps {
  id?: string;
  label?: string;
  accept?: string;
  maxSizeMb?: number;
  value?: string;
  onChange?: (url: string) => void;
  onUploadSuccess?: (url: string, file: File) => void;
  pathPrefix?: string;
  className?: string;
  disabled?: boolean;
}

export function CloudFileUploader({
  id = "cloud-uploader",
  label = "Upload File (Cloud Storage)",
  accept = ".pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx",
  maxSizeMb = 15,
  value,
  onChange,
  onUploadSuccess,
  pathPrefix = "attachments",
  className = "",
  disabled = false,
}: CloudFileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    setErrorMessage(null);

    // Validate size
    if (file.size > maxSizeMb * 1024 * 1024) {
      setErrorMessage(`File size exceeds ${maxSizeMb} MB limit.`);
      return;
    }

    try {
      setUploading(true);
      setProgress(25);

      const progressTimer = setInterval(() => {
        setProgress((prev) => (prev < 90 ? prev + 15 : prev));
      }, 150);

      const downloadUrl = await uploadUniversalFile(file, pathPrefix);
      clearInterval(progressTimer);
      setProgress(100);

      if (onChange) onChange(downloadUrl);
      if (onUploadSuccess) onUploadSuccess(downloadUrl, file);
    } catch (err: any) {
      console.error("[CloudFileUploader] Upload failed:", err);
      setErrorMessage(err?.message || "Failed to upload file to Cloud Storage.");
    } finally {
      setUploading(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || uploading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onChange) onChange("");
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div id={id} className={`flex flex-col gap-1.5 ${className}`}>
      {label && <label className="text-xs font-semibold text-slate-700">{label}</label>}

      {value ? (
        <div className="flex items-center justify-between p-3 border border-emerald-200 bg-emerald-50/50 rounded-xl transition-all">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex flex-col truncate">
              <span className="text-xs font-medium text-slate-800 truncate">
                {value.split("/").pop()?.split("?")[0] || "Uploaded Document"}
              </span>
              <span className="text-[10px] text-emerald-700 flex items-center gap-1 font-semibold">
                <CheckCircle2 className="w-3 h-3" /> Stored in Cloud
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 text-slate-500 hover:text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors"
              title="Open File"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                title="Remove File"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
            isDragging
              ? "border-emerald-500 bg-emerald-50/40"
              : "border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50"
          } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
              }
            }}
            disabled={disabled || uploading}
          />

          {uploading ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
              <div className="flex flex-col items-center">
                <span className="text-xs font-semibold text-slate-700">Uploading to Cloud...</span>
                <div className="w-32 bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1.5">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 py-1">
              <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">
                  Click to upload <span className="font-normal text-slate-500">or drag & drop</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Max {maxSizeMb}MB ({accept.split(",").slice(0, 4).join(", ")})
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-1.5 text-[11px] text-rose-600 font-medium mt-0.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
