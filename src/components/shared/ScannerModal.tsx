import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode, CameraDevice } from "html5-qrcode";
import {
  Camera,
  X,
  AlertCircle,
  RefreshCw,
  Smartphone,
  ShieldCheck,
  Info,
  Upload,
} from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

interface ScannerModalProps {
  isOpen: boolean;
  onScan: (text: string) => void;
  onClose: () => void;
}

type ScannerStatus =
  "IDLE" | "PERMISSION" | "INITIALIZING" | "SCANNING" | "ERROR";

export const ScannerModal = ({
  isOpen,
  onScan,
  onClose,
}: ScannerModalProps) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isInitializing = useRef(false);
  const [status, setStatus] = useState<ScannerStatus>("IDLE");
  const [hasError, setHasError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const [isManual, setIsManual] = useState(() => {
    // Check if running in a restricted sandbox/iframe or lacking media devices capabilities
    const isInsideIframe =
      typeof window !== "undefined" && window.self !== window.top;
    const hasMediaCapabilities =
      typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia;
    return isInsideIframe || !hasMediaCapabilities;
  });
  const [manualCode, setManualCode] = useState("");

  useEffect(() => {
    if (isOpen && !isManual) {
      const isAuthorized = localStorage.getItem("camera_authorized");
      if (isAuthorized) {
        initScanner();
      } else {
        setStatus("PERMISSION");
      }
    } else {
      stopAndClearScanner();
    }
    return () => {
      stopAndClearScanner();
    };
  }, [isOpen, isManual]);

  const handleAuthorize = () => {
    localStorage.setItem("camera_authorized", "true");
    initScanner();
  };

  const checkPermission = async () => {
    setStatus("IDLE");
    setHasError(null);
    initScanner();
  };

  const initScanner = async () => {
    if (isInitializing.current) return;
    isInitializing.current = true;
    setStatus("INITIALIZING");
    try {
      const devices = await fetchCameras();
      if (devices.length > 0) {
        await startScanner(devices[0].id);
      }
    } catch (err) {
      handleCameraError(err, "Failed to initialize");
    } finally {
      isInitializing.current = false;
    }
  };

  const fetchCameras = async (): Promise<CameraDevice[]> => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        const backCamera = devices.find(
          (d) =>
            d.label.toLowerCase().includes("back") ||
            d.label.toLowerCase().includes("rear") ||
            d.label.toLowerCase().includes("environment"),
        );
        setCameras(devices);
        const targetId = backCamera ? backCamera.id : devices[0].id;
        setSelectedCameraId(targetId);
        return devices;
      } else {
        throw new Error("No camera detected on your device.");
      }
    } catch (err: any) {
      throw err;
    }
  };

  const handleCameraError = (err: any, context: string) => {
    console.error(context, err);
    const errMsg = (
      typeof err === "string" ? err : err?.message || err?.name || ""
    ).toLowerCase();

    if (
      errMsg.includes("notallowed") ||
      errMsg.includes("denied") ||
      errMsg.includes("permission")
    ) {
      setStatus("ERROR");
      setHasError(
        "Camera access is blocked by the browser settings. Please allow camera access in your settings or try Manual Entry.",
      );
    } else if (
      errMsg.includes("notreadable") ||
      errMsg.includes("not readable") ||
      errMsg.includes("could not start video source")
    ) {
      setStatus("ERROR");
      setHasError(
        "The camera stream could not be started or is busy in another app. Please switch to Manual Entry.",
      );
    } else if (errMsg.includes("not found") || errMsg.includes("no camera")) {
      setStatus("ERROR");
      setHasError(
        "No video cameras were detected on your device. Please use Manual Entry mode.",
      );
    } else {
      setStatus("ERROR");
      setHasError(
        "Failed to initialize video stream: " +
          (err?.message ||
            "Internal hardware driver error. Please type the trace code manually."),
      );
    }
  };

  const stopAndClearScanner = async () => {
    const scanner = scannerRef.current;
    if (scanner) {
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
        await scanner.clear();
      } catch (err) {
        console.warn("Sensor shutdown notice", err);
      } finally {
        scannerRef.current = null;
      }
    }
    // Deep kill: ensure all media tracks are actually stopped
    try {
      const streams = await navigator.mediaDevices.enumerateDevices();
      if (streams) {
        // This is a generic approach, html5-qrcode should handle it but let's be sure
        const tracks = (window as any).currentStream?.getTracks();
        tracks?.forEach((track: any) => track.stop());
      }
    } catch (e) {}
  };

  const startScanner = async (cameraId: string | null) => {
    setStatus("INITIALIZING");
    setHasError(null);
    await stopAndClearScanner();

    // Give hardware time to synchronize
    await new Promise((resolve) => setTimeout(resolve, 400));

    try {
      if (!document.getElementById("reader")) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      const scanner = new Html5Qrcode("reader");
      scannerRef.current = scanner;

      const config = {
        fps: 30,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.floor(minEdge * 0.8);
          return { width: size, height: size };
        },
        aspectRatio: 1.0,
        disableFlip: false,
        videoConstraints: {
          focusMode: "continuous",
          advanced: [{ focusMode: "continuous" } as any],
          width: { min: 640, ideal: 1920 },
          height: { min: 480, ideal: 1080 },
          facingMode: cameraId ? undefined : "environment",
        },
      };

      const cameraConfig = cameraId
        ? { deviceId: { exact: cameraId } }
        : { facingMode: "environment" };

      await scanner.start(
        cameraConfig,
        config as any,
        (decodedText) => {
          onScan(decodedText);
          handleStop();
        },
        (_err) => {
          /* Scan background cycle */
        },
      );
      setStatus("SCANNING");
    } catch (err: any) {
      handleCameraError(err, "Stream Link Failure");
    }
  };

  const handleStop = async () => {
    await stopAndClearScanner();
    onClose();
  };

  const switchCamera = async () => {
    if (cameras.length > 1 && selectedCameraId) {
      const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
      const nextIndex = (currentIndex + 1) % cameras.length;
      const nextCameraId = cameras[nextIndex].id;
      setSelectedCameraId(nextCameraId);
      await startScanner(nextCameraId);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Use html5-qrcode's static scanFile function if available,
    // or use the instance if it exists but is not scanning
    const html5QrCode = new Html5Qrcode("reader");
    try {
      showToast("Processing image...", "info");
      const result = await html5QrCode.scanFileV2(file, true);
      onScan(result.decodedText);
      onClose();
    } catch (err) {
      console.error(err);
      showToast("No valid QR code found in the image.", "error");
    } finally {
      html5QrCode.clear();
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[500] bg-stone-800/95 backdrop-blur-3xl flex items-center justify-center p-0 md:p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full h-full md:h-[650px] md:max-w-[400px] bg-stone-800 md:rounded-[2.5rem] overflow-hidden shadow-[0_50px_100px_rgba(0,0,0,0.6)] flex flex-col border border-white/10"
      >
        {/* Modern Switcher Tabs */}
        <div className="flex border-b border-white/[0.06] bg-stone-800 px-6 pt-5 pb-0 shrink-0 select-none z-20">
          <button
            type="button"
            onClick={() => {
              setIsManual(false);
              setHasError(null);
            }}
            className={cn(
              "flex-1 pb-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-all relative",
              !isManual ? "text-white" : "text-stone-500 hover:text-stone-400",
            )}
          >
            Camera Lens
            {!isManual && (
              <motion.div
                layoutId="scannerTabIndicator"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-emerald-500"
              />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsManual(true);
              stopAndClearScanner();
              setHasError(null);
            }}
            className={cn(
              "flex-1 pb-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-all relative",
              isManual ? "text-white" : "text-stone-500 hover:text-stone-400",
            )}
          >
            Manual Entry
            {isManual && (
              <motion.div
                layoutId="scannerTabIndicator"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-emerald-500"
              />
            )}
          </button>
        </div>

        <div className="flex-1 relative bg-stone-800 flex flex-col overflow-hidden items-center justify-center">
          <AnimatePresence mode="wait">
            {isManual ? (
              <motion.div
                key="manual-form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute inset-0 z-10 bg-stone-800 flex flex-col justify-center p-8 text-center"
              >
                <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Smartphone className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="text-base font-bold text-white mb-1 uppercase tracking-tight">
                  Direct Trace Entry
                </h3>
                <p className="text-[9px] text-stone-500 mb-8 leading-relaxed font-bold uppercase tracking-widest max-w-[280px] mx-auto">
                  Type a purchase ID, SKU/item code, or serial token directly to
                  bypass camera scanner hardware.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (manualCode.trim()) {
                      onScan(manualCode.trim());
                      handleStop();
                    }
                  }}
                  className="space-y-4 w-full max-w-[280px] mx-auto"
                >
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="e.g. PR-0001, ITEM-001, etc."
                    className="w-full bg-white/5 border border-white/10 text-white placeholder:text-stone-700 rounded-xl px-5 py-4 text-xs font-bold uppercase tracking-wider text-center focus:bg-white/10 focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!manualCode.trim()}
                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:hover:bg-emerald-500 text-stone-950 font-bold text-[10px] uppercase tracking-[0.25em] rounded-xl transition-all shadow-md active:scale-[0.98]"
                  >
                    Submit Code
                  </button>
                </form>
              </motion.div>
            ) : (
              <>
                {status === "PERMISSION" && (
                  <motion.div
                    key="permission"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-50 bg-stone-800 flex flex-col items-center justify-center p-12 text-center"
                  >
                    <div className="w-20 h-20 bg-stone-800 rounded-3xl flex items-center justify-center mb-8">
                      <ShieldCheck className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2 uppercase tracking-tight">
                      Security Clear
                    </h3>
                    <p className="text-[10px] text-stone-500 mb-8 leading-relaxed font-bold uppercase tracking-widest">
                      Inisialisasi modul optik diperlukan.
                    </p>
                    <button
                      onClick={handleAuthorize}
                      className="w-full py-5 bg-white text-stone-950 font-bold text-[10px] uppercase tracking-[0.3em] rounded-2xl hover:bg-stone-200 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                    >
                      Authorize Unit
                    </button>
                  </motion.div>
                )}

                {status === "ERROR" && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-50 bg-stone-800 flex flex-col items-center justify-center p-12 text-center"
                  >
                    <div className="w-20 h-20 bg-rose-500/10 text-rose-500 rounded-3xl flex items-center justify-center mb-8">
                      <AlertCircle className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2 uppercase tracking-tight">
                      Access Failure
                    </h3>
                    <p className="text-[10px] text-rose-400/60 mb-10 leading-relaxed font-semibold uppercase tracking-widest">
                      {hasError}
                    </p>
                    <div className="flex flex-col gap-3 w-full">
                      <button
                        type="button"
                        onClick={() => {
                          setIsManual(true);
                          stopAndClearScanner();
                          setStatus("IDLE");
                        }}
                        className="w-full py-4.5 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold text-[10px] uppercase tracking-[0.2em] rounded-2xl transition-all active:scale-[0.98] shadow-md"
                      >
                        Use Manual Entry
                      </button>
                      <button
                        type="button"
                        onClick={checkPermission}
                        className="w-full py-4 bg-white hover:bg-stone-100 text-stone-950 font-bold text-[10px] uppercase tracking-[0.2em] rounded-2xl transition-colors"
                      >
                        Reconnect
                      </button>
                      <button
                        type="button"
                        onClick={onClose}
                        className="w-full py-4 bg-stone-800 text-stone-500 hover:text-stone-400 font-bold text-[10px] uppercase tracking-[0.2em] rounded-2xl"
                      >
                        Abort Scanner
                      </button>
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </AnimatePresence>

          {!isManual && (
            <>
              <div
                id="reader"
                className="w-full h-full"
                style={{ width: "100%", height: "100%" }}
              ></div>
              <style
                dangerouslySetInnerHTML={{
                  __html: `
                #reader video {
                  object-fit: cover !important;
                  width: 100% !important;
                  height: 100% !important;
                  border-radius: 0 !important;
                }
                #reader #reader__scan_region {
                  background: #0c0a09 !important;
                  height: 100% !important;
                }
                #reader #reader__dashboard_section_csr {
                  display: none !important; 
                }
              `,
                }}
              />

              {status === "SCANNING" && (
                <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center bg-stone-900/20">
                  <div className="relative w-[280px] h-[280px] border-2 border-white/20 rounded-3xl overflow-hidden shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-500 rounded-tl-3xl"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-500 rounded-tr-3xl"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-500 rounded-bl-3xl"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-500 rounded-br-3xl"></div>

                    <motion.div
                      initial={{ top: "0%" }}
                      animate={{ top: "100%" }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      className="absolute left-0 right-0 h-[2px] bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.8)]"
                    />
                  </div>
                  <div className="absolute top-8 text-center text-xs font-bold tracking-[0.3em] uppercase text-white/50">
                    Point exactly at code
                  </div>
                </div>
              )}

              {status === "SCANNING" && cameras.length > 1 && (
                <div className="absolute bottom-8 right-8 z-20">
                  <button
                    onClick={switchCamera}
                    className="w-12 h-12 bg-stone-800/50 backdrop-blur-xl rounded-full flex items-center justify-center text-white border border-white/10 hover:bg-stone-900 transition-all active:scale-90 shadow-2xl"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                </div>
              )}

              {status === "INITIALIZING" && (
                <div className="absolute inset-0 z-30 bg-stone-800 flex flex-col items-center justify-center text-white">
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Minimal Control Footer */}
        <div className="p-6 bg-stone-800 flex flex-col items-center gap-3">
          {!isManual && (
            <>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full max-w-[280px] py-4 bg-white/5 text-white/70 font-bold text-xs uppercase tracking-[0.2em] rounded-2xl hover:bg-white/10 transition-all flex items-center justify-center gap-3 active:scale-[0.98] border border-white/5"
              >
                <Upload className="w-4 h-4" />
                Upload Image
              </button>
            </>
          )}
          <button
            onClick={handleStop}
            className="w-full max-w-[280px] py-4 bg-stone-800/50 text-stone-500 font-bold text-xs uppercase tracking-[0.2em] rounded-2xl hover:bg-rose-600/20 hover:text-rose-400 transition-all flex items-center justify-center gap-3 active:scale-[0.98] border border-stone-800"
          >
            <X className="w-4 h-4" />
            Close Scanner
          </button>
        </div>
      </motion.div>
    </div>
  );
};
