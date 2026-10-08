import React, { useState, useEffect } from "react";
import {
  Briefcase,
  MapPin,
  Clock,
  Banknote,
  Coins,
  ArrowLeft,
  CheckCircle2,
  Send,
  FileText,
  ChevronRight,
  Sparkles,
  Building,
  ArrowRight,
  AlertCircle,
  UploadCloud,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { Modal } from "@/components/ui/Modal";

import { PublicHeader, PublicFooter } from "@/components/layouts/PublicLayout";
import { trackPageView, trackJobView, trackJobApplyClick, trackFilter } from "@/lib/tracker";

const formatSalaryString = (val?: string) => {
  if (!val) return "Competitive";
  // Standardize the separator to "s/d" and remove the second "Rp"
  return val.replace(
    /(Rp\s*[\d.,-]+)\s*(?:-|s\/d)\s*Rp\s*([\d.,-]+)/gi,
    "$1 s/d $2",
  );
};

interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  type: string;
  description: string;
  requirements: string; // JSON array or string
  benefits: string; // JSON array or string
  salary_string?: string;
  status: string;
  pamphlet_bg_color?: string;
  pamphlet_accent_color?: string;
  created_at: string;
}

export default function Careers() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false); // Graceful Degradation
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState("All");

  // CMS & Team
  const [cmsContent, setCmsContent] = useState<any>({});
  const [teamMembers, setTeamMembers] = useState<any[]>([]);

  // Tracking Application State
  const [isTracking, setIsTracking] = useState(false);
  const [trackEmail, setTrackEmail] = useState("");
  const [trackId, setTrackId] = useState("");
  const [trackResult, setTrackResult] = useState<any>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Application Form State
  const [isApplying, setIsApplying] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    linkedin: "",
    experience: "",
    coverLetter: "",
  });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);
  const [applicationId, setApplicationId] = useState("");

  // Resume Upload State
  const [uploadedFileUrl, setUploadedFileUrl] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const { showToast } = useToast();

  useEffect(() => {
    fetchData();
    trackPageView("CAREERS", "Portal Lowongan & Karir Pabrik Paving Joss", "/careers");
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setApiError(false);

      const [jobsRes, cmsRes, teamRes] = await Promise.all([
        apiFetch("/api/hr/jobs-public"),
        apiFetch("/api/cms/careers"),
        apiFetch("/api/public/team"),
      ]);

      if (jobsRes.ok) setJobs(jobsRes.data);
      if (cmsRes.ok) setCmsContent(cmsRes.data);
      if (teamRes.ok) setTeamMembers(teamRes.data);

      if (!jobsRes.ok) throw new Error("Jobs API failed");
    } catch (err) {
      console.error(err);
      setJobs([]);
      setApiError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleTrackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackEmail || !trackId) return;
    setTrackingLoading(true);
    try {
      const res = await apiFetch("/api/hr/track", {
        method: "POST",
        body: JSON.stringify({ email: trackEmail, tracking_id: trackId }),
      });
      if (res.ok) {
        setTrackResult(res.data);
      } else {
        showToast(res.error || "Application not found", "error");
        setTrackResult(null);
      }
    } catch (err) {
      showToast("Failed to track application Status", "error");
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
    ];

    if (!allowedTypes.includes(file.type)) {
      showToast(
        "Hanya dokumen PDF, DOC, DOCX, JPG, atau PNG yang diperbolehkan.",
        "error",
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      // 5MB limit
      showToast("Ukuran berkas melebihi batas maksimal 5MB.", "error");
      return;
    }

    try {
      setUploadingFile(true);
      const data = new FormData();
      data.append("file", file);

      const res = await apiFetch("/api/upload", {
        method: "POST",
        body: data,
      });

      if (res.ok) {
        setUploadedFileUrl(res.data.url || res.data.fileUrl);
        setUploadedFileName(file.name);
        showToast("Berkas resume berhasil diunggah!", "success");
      } else {
        throw new Error(res.error || "Gagal mengunggah berkas");
      }
    } catch (e) {
      console.error(e);
      showToast("Terjadi kesalahan saat mengunggah berkas.", "error");
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleChangeFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const departments = [
    "All",
    ...Array.from(new Set(jobs.map((j) => j.department))),
  ];

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept =
      selectedDept === "All" || job.department === selectedDept;
    return matchesSearch && matchesDept;
  });

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) return;

    if (
      !formData.name.trim() ||
      !formData.email.trim() ||
      !formData.phone.trim()
    ) {
      showToast("Harap isi semua kolom wajib", "error");
      return;
    }

    if (!uploadedFileUrl) {
      showToast(
        "Please select and upload your resume or CV document first.",
        "error",
      );
      return;
    }

    try {
      setFormSubmitting(true);
      trackJobApplyClick({ id: selectedJob.id, title: selectedJob.title });

      // Combine resume url and cover letter details in resume_text
      const finalResumeText = `[RESUME FILE]: ${uploadedFileUrl}\n\n${formData.coverLetter}`;

      const payload = {
        job_id: selectedJob.id,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        linkedin_url: formData.linkedin,
        experience: formData.experience,
        resume_text: finalResumeText,
      };

      const res = await apiFetch("/api/hr/applications", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setFormSuccess(true);
        setApplicationId(res.data?.id || "N/A");
        showToast("Your job application has been submitted successfully!", "success");
        setFormData({
          name: "",
          email: "",
          phone: "",
          linkedin: "",
          experience: "",
          coverLetter: "",
        });
        setUploadedFileUrl("");
        setUploadedFileName("");
      } else {
        throw new Error(res.error || "Failed to submit application");
      }
    } catch (err: any) {
      console.error(err);
      showToast(
        err.message || "An unexpected error occurred. Please try again.",
        "error",
      );
    } finally {
      setFormSubmitting(false);
    }
  };

  // Helper to parse lists
  const parseList = (jsonOrString: string): string[] => {
    try {
      if (!jsonOrString) return [];
      if (jsonOrString.startsWith("[")) {
        return JSON.parse(jsonOrString);
      }
      return jsonOrString.split("\n").filter((line) => line.trim().length > 0);
    } catch (e) {
      return [jsonOrString];
    }
  };

  return (
    <div className="bg-stone-50 min-h-screen text-stone-900 font-sans pb-0 flex flex-col">
      <PublicHeader />

      {/* Hero Banner */}
      <section className="bg-gradient-to-br from-brand to-[#8d1d1c]/95 text-white py-20 lg:py-28 px-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          {/* Subtle grid pattern background */}
          <div
            className="w-full h-full"
            style={{
              backgroundImage:
                "radial-gradient(ellipse at center, #fff 1px, transparent 1px)",
              backgroundSize: "16px 16px",
            }}
          />
        </div>

        <div className="container mx-auto max-w-5xl text-center relative z-10 transition-all duration-300">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold text-amber-300 mb-6 border border-white/10 uppercase tracking-widest"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {cmsContent?.hero_label || "Join Our Elite Team"}
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-5xl font-extrabold tracking-tight leading-tight mb-4"
          >
            {cmsContent?.hero_title || "Building the Future of Infrastructure"}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-stone-200 text-sm md:text-base max-w-2xl mx-auto leading-relaxed"
          >
            {cmsContent?.hero_subtitle ||
              "We believe our strength lies in our people. Join CV Batu Emas Group to build a thriving career in modern precast concrete and paving manufacturing."}
          </motion.p>
          <div className="mt-8 flex justify-center gap-4">
            <button
              onClick={() => {
                const el = document.getElementById("jobs-section");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-sm uppercase tracking-wider transition-colors cursor-pointer"
            >
              Explore Openings
            </button>
            <button
              onClick={() => setIsTracking(true)}
              className="px-6 py-3 bg-white/10 border border-white/20 hover:bg-white/20 text-white font-bold rounded-xl text-sm uppercase tracking-wider transition-colors cursor-pointer"
            >
              Track Application Status
            </button>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main
        id="jobs-section"
        className="container mx-auto px-4 py-16 lg:py-24 max-w-7xl flex-1 -mt-8 lg:-mt-12 relative z-20"
      >
        <AnimatePresence mode="wait">
          {apiError ? (
            <motion.div
              key="error-fallback"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white border-2 border-red-100 rounded-3xl p-12 text-center max-w-2xl mx-auto shadow-sm"
            >
              <h3 className="text-xl font-bold text-red-900 mb-2">
                Layanan Saat Ini Sedang Sibuk
              </h3>
              <p className="text-red-700 text-sm mb-6">
                Sistem HRIS internal kami sedang tidak dapat terhubung. Anda
                dapat mengirimkan CV Anda melalui surel ke{" "}
                <b>hrd@batuemas.com</b>.
              </p>
              <button
                onClick={() => fetchData()}
                className="text-xs font-bold uppercase tracking-wider bg-red-50 text-red-700 py-2 px-4 rounded-xl hover:bg-red-100"
              >
                Coba Ulang Hubungan
              </button>
            </motion.div>
          ) : !selectedJob ? (
            <motion.div
              key="list-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              {/* Search & Theme Headers */}
              <div className="bg-white border border-stone-200/80 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="w-full md:max-w-md relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search job title or required skills..."
                    className="w-full pl-11 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all text-sm font-medium"
                  />
                </div>

                {/* Department Filters */}
                <div className="flex flex-wrap gap-2 w-full md:w-auto justify-start md:justify-end overflow-x-auto pb-1 md:pb-0">
                  {departments.map((dept) => (
                    <button
                      key={dept}
                      onClick={() => {
                        setSelectedDept(dept);
                        trackFilter("Departemen Karir", dept, "CAREERS");
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap uppercase tracking-wider ${
                        selectedDept === dept
                          ? "bg-brand text-white shadow-md"
                          : "bg-stone-100 hover:bg-stone-200 text-stone-600"
                      }`}
                    >
                      {dept === "All" ? "Semua Divisi" : dept}
                    </button>
                  ))}
                </div>
              </div>

              {/* Jobs Grid/List */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-10 h-10 border-4 border-stone-200 border-t-brand rounded-full animate-spin mb-4" />
                  <p className="text-stone-500 font-semibold text-xs uppercase tracking-wider">
                    Memuat Lowongan Pekerjaan...
                  </p>
                </div>
              ) : filteredJobs.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center max-w-xl mx-auto shadow-sm">
                  <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-stone-100">
                    <Briefcase className="w-7 h-7 text-stone-400" />
                  </div>
                  <h3 className="font-bold text-lg text-stone-800 mb-1">
                    No Active Job Openings
                  </h3>
                  <p className="text-stone-500 text-sm mb-6">
                    There are currently no open positions matching the selected filters. Please check back soon or reset filters!
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedDept("All");
                    }}
                    className="px-4 py-2.5 bg-brand hover:bg-brand-dark text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all shadow-xs cursor-pointer"
                  >
                    Reset Filter
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredJobs.map((job) => (
                    <motion.div
                      layout
                      key={job.id}
                      onClick={() => {
                        setSelectedJob(job);
                        trackJobView({ id: job.id, title: job.title, department: job.department, location: job.location });
                      }}
                      className="bg-white border border-stone-200 hover:border-brand/50 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col justify-between group"
                    >
                      <div>
                        {/* Bullet / Division Tag */}
                        <div className="flex items-center justify-between mb-4">
                          <span className="px-3 py-1 bg-stone-100 text-[10px] font-bold text-stone-600 rounded-lg uppercase tracking-wider">
                            {job.department}
                          </span>
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        </div>

                        {/* Position Title */}
                        <h3 className="font-extrabold text-lg text-stone-900 group-hover:text-brand transition-colors line-clamp-2 leading-snug">
                          {job.title}
                        </h3>

                        {/* Specs */}
                        <div className="flex flex-col gap-2.5 mt-4 text-xs text-stone-500 font-semibold uppercase tracking-wider">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            <span>{job.location}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            <span>{job.type}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Coins className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            <span className="text-stone-800 lowercase first-letter:uppercase">
                              {formatSalaryString(job.salary_string)}
                            </span>
                          </div>
                        </div>

                        <p className="text-stone-600 text-xs line-clamp-3 mt-4 leading-relaxed">
                          {job.description}
                        </p>
                      </div>

                      {/* Apply button link */}
                      <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-widest">
                          ID: {job.id.slice(0, 10)}
                        </span>
                        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-brand group-hover:translate-x-1 transition-transform">
                          <span>Selengkapnya</span>
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="detail-view"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-4xl mx-auto"
            >
              {/* Back Button */}
              <button
                onClick={() => {
                  setSelectedJob(null);
                  setIsApplying(false);
                  setFormSuccess(false);
                }}
                className="inline-flex items-center gap-2 text-stone-500 hover:text-stone-900 transition-colors font-bold text-xs uppercase tracking-widest mb-6"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Job Openings
              </button>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Description Column */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Job Detail Header Card */}
                  <div className="bg-white border border-stone-200 rounded-3xl p-8 shadow-sm">
                    <span className="inline-block px-3 py-1 bg-stone-100 text-[10px] font-bold uppercase tracking-wider text-stone-600 rounded-lg mb-4">
                      {selectedJob.department}
                    </span>
                    <h2 className="text-2xl md:text-3xl font-extrabold text-stone-900 tracking-tight leading-snug mb-4">
                      {selectedJob.title}
                    </h2>

                    <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs text-stone-500 font-bold uppercase tracking-wider pt-4 border-t border-stone-100">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-stone-400" />
                        <span>{selectedJob.location}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-stone-400" />
                        <span>{selectedJob.type}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Coins className="w-4 h-4 text-stone-400" />
                        <span className="text-stone-800 lowercase first-letter:uppercase">
                          {formatSalaryString(selectedJob.salary_string)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Responsibilities */}
                  <div className="bg-white border border-stone-200 rounded-3xl p-8 shadow-sm space-y-4">
                    <h3 className="font-extrabold text-base text-stone-900 uppercase tracking-wider pb-2 border-b border-stone-100">
                      Job Responsibilities & Scope
                    </h3>
                    <p className="text-stone-600 text-sm leading-relaxed whitespace-pre-line">
                      {selectedJob.description}
                    </p>
                  </div>

                  {/* Requirements list */}
                  {parseList(selectedJob.requirements).length > 0 && (
                    <div className="bg-white border border-stone-200 rounded-3xl p-8 shadow-sm space-y-4">
                      <h3 className="font-extrabold text-base text-stone-900 uppercase tracking-wider pb-2 border-b border-stone-100">
                        Candidate Qualifications
                      </h3>
                      <ul className="space-y-3">
                        {parseList(selectedJob.requirements).map((req, idx) => (
                          <li
                            key={idx}
                            className="flex gap-3 text-stone-600 text-sm leading-relaxed"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 mt-2" />
                            <span>{req}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Benefits */}
                  {parseList(selectedJob.benefits).length > 0 && (
                    <div className="bg-white border border-stone-200 rounded-3xl p-8 shadow-sm space-y-4">
                      <h3 className="font-extrabold text-base text-stone-900 uppercase tracking-wider pb-2 border-b border-stone-100">
                        Benefits & Compensation
                      </h3>
                      <ul className="space-y-3">
                        {parseList(selectedJob.benefits).map((benefit, idx) => (
                          <li
                            key={idx}
                            className="flex gap-3 text-stone-600 text-sm leading-relaxed"
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Sidebar Sticky Apply Form */}
                <div className="lg:col-span-1">
                  <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm sticky top-24 space-y-6">
                    {!isApplying ? (
                      <div className="text-center py-4 space-y-4">
                        <div className="w-12 h-12 bg-stone-50 border border-stone-100 rounded-2xl flex items-center justify-center mx-auto text-stone-400">
                          <Building className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-bold text-sm text-stone-900">
                            Join Paving Joss Team
                          </h4>
                          <p className="text-xs text-stone-500">
                            Submit your dossier today! Our talent acquisition team will review your qualifications promptly.
                          </p>
                        </div>
                        <button
                          onClick={() => setIsApplying(true)}
                          className="w-full py-3.5 bg-brand hover:bg-brand-dark text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <span>Apply for This Role</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    ) : formSuccess ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-8 space-y-4"
                      >
                        <div className="w-16 h-16 bg-emerald-100 border border-emerald-200 rounded-full flex items-center justify-center mx-auto text-emerald-600">
                          <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <div className="space-y-1.5">
                          <h4 className="font-extrabold text-base text-stone-950">
                            Application Received!
                          </h4>
                          <p className="text-xs text-stone-500 leading-relaxed">
                            Thank you for your application. Your candidate profile has been recorded in our HR talent pool.
                          </p>
                          <div className="bg-stone-50 p-4 border border-stone-200 rounded-xl my-4">
                            <p className="text-[10px] text-stone-500 font-bold uppercase tracking-wider mb-1">
                              Your Tracking ID
                            </p>
                            <p className="text-xl font-mono text-stone-900 font-bold select-all">
                              {applicationId}
                            </p>
                            <p className="text-xs text-stone-500 mt-2">
                              Use this Tracking ID along with your email address to check status updates.
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedJob(null);
                            setIsApplying(false);
                            setFormSuccess(false);
                            setUploadedFileUrl("");
                            setUploadedFileName("");
                          }}
                          className="w-full py-3 bg-brand hover:bg-brand-dark text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-xs"
                        >
                          Back to Openings
                        </button>
                      </motion.div>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-4"
                      >
                        <div className="flex justify-between items-center pb-3 border-b border-stone-150">
                          <h4 className="font-extrabold text-sm text-stone-900 uppercase tracking-tight">
                            Application Form
                          </h4>
                          <button
                            onClick={() => {
                              setIsApplying(false);
                              setUploadedFileUrl("");
                              setUploadedFileName("");
                            }}
                            className="text-xs text-stone-400 hover:text-stone-900 font-bold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>

                        <form
                          onSubmit={handleApplySubmit}
                          className="space-y-4"
                        >
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                              Full Name *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. John Doe"
                              value={formData.name}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  name: e.target.value,
                                })
                              }
                              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/10 focus:border-brand transition-all text-xs font-semibold"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                              Email Address *
                            </label>
                            <input
                              type="email"
                              required
                              placeholder="e.g. johndoe@gmail.com"
                              value={formData.email}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  email: e.target.value,
                                })
                              }
                              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/10 focus:border-brand transition-all text-xs font-semibold"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                              Phone / WhatsApp Number *
                            </label>
                            <input
                              type="tel"
                              required
                              placeholder="e.g. +62 812 3456 7890"
                              value={formData.phone}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  phone: e.target.value,
                                })
                              }
                              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/10 focus:border-brand transition-all text-xs font-semibold"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                              LinkedIn Profile (Optional)
                            </label>
                            <input
                              type="url"
                              placeholder="e.g. linkedin.com/in/johndoe"
                              value={formData.linkedin}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  linkedin: e.target.value,
                                })
                              }
                              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/10 focus:border-brand transition-all text-xs font-semibold"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                              Professional Summary / Background *
                            </label>
                            <textarea
                              required
                              rows={3}
                              placeholder="Summarize your professional experience (e.g. 3 years in industrial manufacturing)..."
                              value={formData.experience}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  experience: e.target.value,
                                })
                              }
                              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/10 focus:border-brand transition-all text-xs font-semibold resize-none"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider font-sans">
                              Cover Letter / Note
                            </label>
                            <textarea
                              rows={3}
                              placeholder="Introduce yourself and explain why you are interested in this position..."
                              value={formData.coverLetter}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  coverLetter: e.target.value,
                                })
                              }
                              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/10 focus:border-brand transition-all text-xs font-semibold resize-none"
                            />
                          </div>

                          {/* Beautiful Interactive Drag and Drop Resume File field */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                              Upload Resume / CV *
                            </label>

                            {!uploadedFileUrl ? (
                              <div
                                onDragEnter={handleDrag}
                                onDragOver={handleDrag}
                                onDragLeave={handleDrag}
                                onDrop={handleDrop}
                                className={`border-2 border-dashed rounded-xl p-5 text-center transition-all ${
                                  dragActive
                                    ? "border-brand bg-brand/5"
                                    : "border-stone-250 bg-stone-50 hover:bg-stone-100/60"
                                } flex flex-col items-center justify-center cursor-pointer relative min-h-[110px]`}
                              >
                                {uploadingFile ? (
                                  <div className="flex flex-col items-center gap-2">
                                    <div className="w-5 h-5 border-2 border-stone-300 border-t-brand rounded-full animate-spin" />
                                    <span className="text-[10px] text-stone-500 font-bold uppercase tracking-wider animate-pulse">
                                      Uploading document...
                                    </span>
                                  </div>
                                ) : (
                                  <>
                                    <UploadCloud className="w-8 h-8 text-stone-400 mb-1.5" />
                                    <p className="text-xs font-semibold text-stone-700">
                                      Drag document here or click to browse
                                    </p>
                                    <p className="text-[9px] text-stone-400 uppercase font-semibold">
                                      Max 5MB (PDF/DOCX/JPG/PNG)
                                    </p>
                                    <input
                                      type="file"
                                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                      onChange={handleChangeFile}
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                  </>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center justify-between bg-stone-50 border border-stone-200 rounded-xl p-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <FileText className="w-5 h-5 text-brand shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-stone-800 truncate">
                                      {uploadedFileName}
                                    </p>
                                    <p className="text-[9px] text-emerald-600 font-semibold uppercase tracking-wider">
                                      READY TO SUBMIT
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUploadedFileUrl("");
                                    setUploadedFileName("");
                                  }}
                                  className="p-1.5 hover:bg-stone-250 rounded-lg text-stone-400 hover:text-stone-700 transition cursor-pointer"
                                  aria-label="Remove File"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>

                          <button
                            type="submit"
                            disabled={formSubmitting || uploadingFile}
                            className="w-full py-4 bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-extrabold text-[10px] uppercase tracking-[0.2em] rounded-xl transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            {formSubmitting
                              ? "Submitting Dossier..."
                              : "Submit Application"}
                          </button>
                        </form>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Modal
        isOpen={isTracking}
        onClose={() => setIsTracking(false)}
        maxWidth="md"
        contentClassName="p-8"
        title={
          <h3 className="text-xl font-bold text-stone-900 tracking-tight mb-2">
            Track Application Status
          </h3>
        }
      >
        <p className="text-sm text-stone-500 mb-6">
          Enter the email address and Tracking ID generated upon submitting your application.
        </p>
        <form onSubmit={handleTrackSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-stone-600 uppercase tracking-wider mb-2 block">
              Your Email Address
            </label>
            <input
              type="email"
              value={trackEmail}
              onChange={(e) => setTrackEmail(e.target.value)}
              required
              className="w-full border-b border-stone-200 pb-2 focus:outline-none focus:border-brand"
              placeholder="candidate@example.com"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-stone-600 uppercase tracking-wider mb-2 block">
              Application Tracking ID
            </label>
            <input
              type="text"
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              required
              className="w-full border-b border-stone-200 pb-2 focus:outline-none focus:border-brand"
              placeholder="APP-12345"
            />
          </div>
          <button
            type="submit"
            disabled={trackingLoading}
            className="w-full bg-brand text-white font-bold rounded-xl py-3 mt-4 hover:bg-brand-dark disabled:opacity-50 transition-all shadow-xs cursor-pointer"
          >
            {trackingLoading ? "Searching..." : "Track Status"}
          </button>
        </form>
        {trackResult && (
          <div className="mt-6 p-4 bg-stone-50 rounded-xl border border-stone-200">
            <div className="text-[10px] uppercase font-bold text-stone-400 tracking-widest mb-1">
              Application Milestone
            </div>
            <div className="text-lg font-bold text-stone-900 mb-2">
              {trackResult.status === "APPLIED" && (
                <span className="text-blue-600">Application Received</span>
              )}
              {trackResult.status === "SCREENING" && (
                <span className="text-purple-600">In Screening Review</span>
              )}
              {trackResult.status === "INTERVIEW" && (
                <span className="text-amber-600">Interview Scheduled</span>
              )}
              {trackResult.status === "OFFER_MADE" && (
                <span className="text-emerald-600">Offer Extended</span>
              )}
              {trackResult.status === "ACCEPTED" && (
                <span className="text-emerald-800">Accepted & Onboarded</span>
              )}
              {trackResult.status === "REJECTED" && (
                <span className="text-red-600">Application Closed</span>
              )}
            </div>
            <div className="text-xs font-bold text-stone-700">
              {trackResult.job_title} ({trackResult.department})
            </div>
            <div className="text-[10px] text-stone-500 mt-1">
              Submission Date:{" "}
              {new Date(trackResult.applied_at).toLocaleDateString("en-US", { dateStyle: "medium" })}
            </div>
          </div>
        )}
      </Modal>

      <PublicFooter />
    </div>
  );
}
