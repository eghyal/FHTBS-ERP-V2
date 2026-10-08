import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { Clock, MapPin } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/utils/api";

export function AttendanceReminder() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [show, setShow] = useState(false);
  const [type, setType] = useState<"CLOCK_IN" | "CLOCK_OUT" | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!user) return;

    const checkAttendance = async () => {
      try {
        const d = new Date();

        // Get the accurate hour in Asia/Jakarta timezone
        const formatterHour = new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Jakarta",
          hour: "numeric",
          hour12: false,
        });
        const hr = parseInt(formatterHour.format(d), 10);

        // Cek jika jam 07:00 - 09:00 (Waktunya Clock In)
        const isClockInTime = hr >= 7 && hr < 9;
        // Cek jika jam 16:00 - 18:00 (Waktunya Clock Out)
        const isClockOutTime = hr >= 16 && hr < 18;

        if (!isClockInTime && !isClockOutTime) return;

        // Get accurate date string for Asia/Jakarta timezone
        const formatterDate = new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Jakarta",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        const parts = formatterDate.formatToParts(d);
        const year = parts.find((p) => p.type === "year")?.value;
        const month = parts.find((p) => p.type === "month")?.value;
        const day = parts.find((p) => p.type === "day")?.value;
        const jakartaDateStr = `${year}-${month}-${day}`;

        // Cek history absen hari ini menggunakan apiFetch yang aman
        const res = await apiFetch<any[]>("/api/hr/attendances", {
          method: "GET",
        }, user.username);

        if (!res.ok || !Array.isArray(res.data)) {
          return;
        }

        const todayRecord = res.data.find(
          (r: any) =>
            r.employee_username === user.username &&
            r.date === jakartaDateStr,
        );

        if (isClockInTime && !todayRecord) {
          setType("CLOCK_IN");
          setShow(true);
        } else if (isClockOutTime && todayRecord && !todayRecord.clock_out) {
          setType("CLOCK_OUT");
          setShow(true);
        }
      } catch (e) {
        console.warn("Failed to check attendance status gracefully:", e);
      }
    };

    // Check once on load
    checkAttendance();

    // Check every 10 minutes
    const interval = setInterval(checkAttendance, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  const getLocation = (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve(`${pos.coords.latitude},${pos.coords.longitude}`);
        },
        (err) => {
          console.warn("Gagal mendapatkan lokasi GPS:", err);
          resolve(null); // Continue even if failed
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
      );
    });
  };

  const handleAction = async () => {
    setIsProcessing(true);
    try {
      showToast("Acquiring location (GPS)...", "success");
      const location = await getLocation();
      if (!location) {
        showToast(
          "Warning: GPS location could not be recorded. Please ensure location services are enabled.",
          "error",
        );
      }

      const endpoint =
        type === "CLOCK_IN"
          ? "/api/hr/attendances/clock-in"
          : "/api/hr/attendances/clock-out";
      const method = type === "CLOCK_IN" ? "POST" : "PUT";

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify({ employee_username: user?.username, location }),
      }, user?.username || "");

      if (res.ok) {
        showToast(
          type === "CLOCK_IN"
            ? "Clock In Successful!"
            : "Clock Out Successful!",
          "success",
        );
        setShow(false);
      } else {
        showToast(res.error || "Failed to log attendance", "error");
      }
    } catch (e) {
      showToast("Connection error", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!show || !user) return null;

  return (
    <Modal
      isOpen={show}
      onClose={() => setShow(false)}
      maxWidth="md"
      contentClassName="p-6 font-sans"
    >
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
          <Clock className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h3 className="font-bold text-stone-900 text-lg">
            {type === "CLOCK_IN" ? "Time to Clock In!" : "Time to Clock Out!"}
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            {type === "CLOCK_IN"
              ? "Do not forget to log your attendance (Shift Starts: 08:00)"
              : "It is time to clock out (Shift Ends: 16:00)"}
          </p>
        </div>
      </div>

      <div className="bg-stone-50 rounded-xl p-3 mb-4 flex items-center gap-2 text-xs text-stone-600">
        <MapPin className="w-4 h-4 text-stone-400 flex-shrink-0" />
        <span>
          Your location (
          {navigator.geolocation ? "GPS Access Requested" : "GPS Not Supported"}
          ) will be automatically recorded for the attendance log.
        </span>
      </div>

      <button
        onClick={handleAction}
        disabled={isProcessing}
        className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
      >
        {isProcessing
          ? "Processing..."
          : type === "CLOCK_IN"
            ? "Clock In Now"
            : "Clock Out Now"}
      </button>
    </Modal>
  );
}
