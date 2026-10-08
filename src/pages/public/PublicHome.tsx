import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, AnimatePresence } from "motion/react";
import {
  MapPin,
  Phone,
  Mail,
  ArrowRight,
  Star,
  X,
  Download,
  Sparkles,
  ShieldCheck,
  Layers,
} from "lucide-react";
import { PublicHeader, PublicFooter } from "@/components/layouts/PublicLayout";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/utils/api";
import { LiveTileCollage, CatalogProductItem } from "@/components/public/LiveTileCollage";
import { trackPageView, trackContactClick, trackActivity } from "@/lib/tracker";
import { MascotBoard } from "@/components/mascot/MascotBoard";
import { useMascotStore } from "@/stores/mascotStore";

const defaultCatalogPhotos: CatalogProductItem[] = [
  {
    id: "CAP-01",
    name: "Mesin Cetak Paving Hidrolik Otomatis Mutu K-300 / K-400",
    category: "Paving & Precast",
    spec: "Presisi Tinggi & Kuat Tekan SNI",
    badge: "FASILITAS PABRIK",
    image_url: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&auto=format&fit=crop&q=80",
    uom: "M2",
  },
  {
    id: "CAP-02",
    name: "Fabrikasi Baja & Sheet Metal CNC Fiber Laser Cutting",
    category: "Fabrikasi Baja",
    spec: "Toleransi Presisi ±0.1mm CAD/BIM",
    badge: "HIGH PRECISION",
    image_url: "https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?w=800&auto=format&fit=crop&q=80",
    uom: "UNIT",
  },
  {
    id: "CAP-03",
    name: "Kanstin Pembatas Jalan & Trotoar Standar PU",
    category: "Drainase & Kanstin",
    spec: "Mutu K-300 Finishing Chamfer",
    badge: "STANDAR PU",
    image_url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&auto=format&fit=crop&q=80",
    uom: "PCS",
  },
  {
    id: "CAP-04",
    name: "Saluran U-Ditch & Box Culvert Beton Bertulang",
    category: "Drainase & Kanstin",
    spec: "Tulangan Besi Ulir Mutu K-350",
    badge: "HEAVY INFRA",
    image_url: "https://images.unsplash.com/photo-1541888946425-d0fbb186f5f8?w=800&auto=format&fit=crop&q=80",
    uom: "BATANG",
  },
  {
    id: "CAP-05",
    name: "Pengelasan TIG & Fabrikasi Tangki SS304/SS316",
    category: "Fabrikasi Baja",
    spec: "Food-Grade & Industrial Quality",
    badge: "SS304 GRADE",
    image_url: "https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?w=800&auto=format&fit=crop&q=80",
    uom: "UNIT",
  },
  {
    id: "CAP-06",
    name: "Paving Block Bata & Segienam Interlocking",
    category: "Paving & Precast",
    spec: "Tahan Beban Truk & Lalu Lintas Berat",
    badge: "SNI K-300",
    image_url: "https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?w=800&auto=format&fit=crop&q=80",
    uom: "M2",
  },
  {
    id: "CAP-07",
    name: "Grass Block 8 Lubang Ramah Lingkungan",
    category: "Paving & Precast",
    spec: "Resapan Air 40% & Ruang Rumput",
    badge: "ECO PRECAST",
    image_url: "https://images.unsplash.com/photo-1565008447742-97f6f38c985c?w=800&auto=format&fit=crop&q=80",
    uom: "M2",
  },
  {
    id: "CAP-08",
    name: "Armada Truk Pengiriman Langsung ke Lokasi Proyek",
    category: "Paving & Precast",
    spec: "Pengiriman Terjadwal Se-Jawa Timur",
    badge: "ARMADA PABRIK",
    image_url: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&auto=format&fit=crop&q=80",
    uom: "TRIP",
  },
  {
    id: "CAP-09",
    name: "Laboratorium Uji Tekan Mutu Beton Standar SNI",
    category: "Paving & Precast",
    spec: "Uji Tekan Berkala & Laporan Uji Lab",
    badge: "QC VERIFIED",
    image_url: "https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=800&auto=format&fit=crop&q=80",
    uom: "BATCH",
  },
];

export default function PublicHome() {
  const [products, setProducts] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const isMascotVisible = useMascotStore((s) => s.isVisibleOnPublic);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await apiFetch("/api/public/products");
        if (res.ok && Array.isArray(res.data)) {
          setProducts(res.data);
        } else {
          setProducts([]);
        }
      } catch (e) {
        setProducts([]);
      }
    };
    fetchProducts();
    useMascotStore.getState().fetchFromServer();
    trackPageView("PUBLIC", "Beranda & Profil Pabrik Paving Joss", "/");
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F5F4] font-sans text-stone-900 overflow-x-clip selection:bg-brand selection:text-white">
      <PublicHeader />

      <main className="relative pb-16 lg:pb-24">
        {/* Hero Section */}
        <section className="relative pt-6 pb-8 sm:pt-10 sm:pb-10 md:pt-12 md:pb-12 lg:pt-16 lg:pb-16 px-4 lg:px-8 max-w-[1400px] mx-auto z-10 overflow-hidden">
          {/* Ambient background glow (purely aesthetic decoration, 0 layout height) */}
          <div className="absolute top-1/3 right-4 sm:right-12 -translate-y-1/2 w-[350px] sm:w-[500px] h-[350px] sm:h-[500px] bg-red-200/35 rounded-full blur-3xl pointer-events-none -z-10" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
            {/* Left Column: Headline & Action Buttons */}
            <div
              className={`w-full ${
                isMascotVisible
                  ? "lg:col-span-6 xl:col-span-6 max-w-2xl"
                  : "lg:col-span-12 max-w-4xl"
              }`}
            >
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="relative z-20"
              >
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand/10 text-brand rounded-full text-xs font-bold uppercase tracking-widest mb-6 border border-brand/20">
                  <Star className="w-3.5 h-3.5 fill-brand" />
                  Manufaktur Paving Blok &amp; Material
                </div>
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-black text-stone-900 tracking-tighter leading-[1.05] mb-6 relative">
                  Spesialis{" "}
                  <br className="hidden md:block" />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-red-600 relative inline-block pb-1 sm:pb-2">
                    Jangka Panjang.
                    <svg
                      className="absolute w-full h-3.5 sm:h-4 -bottom-3 sm:-bottom-4 left-0 text-red-200 pointer-events-none"
                      viewBox="0 0 100 10"
                      preserveAspectRatio="none"
                    >
                      <path
                        d="M0 5 Q 50 15 100 5"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="transparent"
                      />
                    </svg>
                  </span>
                </h1>
                <p className="text-lg md:text-xl text-stone-600 mb-8 sm:mb-10 max-w-2xl leading-relaxed font-medium">
                  Kami bukan sekadar pabrik paving. CV Batu Emas Group memadukan
                  teknologi cetak presisi dan mutu K300 untuk infrastruktur yang
                  bertahan lintas generasi.
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <Link
                    to="/shop"
                    onClick={() => {
                      trackActivity({
                        module: "PUBLIC",
                        activity_type: "SECTION_VIEW",
                        title: "Klik Pesan Sekarang menuju Toko",
                        page_url: "/shop",
                      });
                    }}
                    className="px-8 py-4 bg-brand hover:bg-red-800 text-white font-bold rounded-2xl shadow-lg hover:shadow-red-500/30 transition-all hover:-translate-y-1 flex items-center gap-2 group cursor-pointer"
                  >
                    <span>Pesan Sekarang</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                  <button
                    onClick={() => {
                      trackActivity({
                        module: "PUBLIC",
                        activity_type: "SECTION_VIEW",
                        title: "Membuka Modal Galeri Katalog Produk",
                        page_url: "/",
                      });
                      setIsCatalogModalOpen(true);
                    }}
                    className="px-8 py-4 bg-white text-stone-800 hover:text-brand font-bold rounded-2xl shadow-sm border border-stone-200 hover:border-brand/30 hover:bg-brand/5 transition-all cursor-pointer"
                  >
                    Lihat Katalog
                  </button>
                </div>
              </motion.div>
            </div>

            {/* Right Column: 3D Motion Mascot Paver (Desktop only, enlarged and toggleable) */}
            {isMascotVisible && (
              <div className="hidden lg:block lg:col-span-6 xl:col-span-6 w-full max-w-2xl xl:max-w-3xl mx-auto relative z-20">
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.85, delay: 0.15, ease: "easeOut" }}
                  className="w-full"
                >
                  <MascotBoard className="scale-105 xl:scale-115 origin-center" />
                </motion.div>
              </div>
            )}
          </div>
        </section>

        {/* Relocated About Info / Informasi Lokasi */}
        <section className="relative z-30 max-w-[1200px] mx-auto px-4 lg:px-8 mb-12 sm:mb-16 lg:mb-24">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-2xl border border-stone-100 flex flex-col md:flex-row gap-8 lg:gap-16 items-center"
          >
            <div className="flex-1 space-y-6">
              <h2 className="text-3xl font-extrabold text-stone-900">
                Tentang Kami
              </h2>
              <p className="text-stone-600 leading-relaxed font-medium">
                Berlokasi strategis di{" "}
                <strong>Dusun Petahunan, Gambiran, Banyuwangi</strong>, CV. Batu
                Emas Group telah menjadi tulang punggung penyediaan material
                konstruksi untuk proyek skala kecil hingga besar di wilayah Jawa
                Timur dan sekitarnya.
              </p>
              <div className="flex flex-col gap-3">
                <a
                  href="tel:081111113993"
                  className="flex items-center gap-3 text-stone-800 font-bold hover:text-brand transition-colors group w-fit"
                >
                  <div className="w-10 h-10 rounded-full bg-stone-100 group-hover:bg-red-50 flex items-center justify-center transition-colors">
                    <Phone className="w-4 h-4" />
                  </div>
                  0811-1111-3993
                </a>
                <a
                  href="mailto:pavingjoss@gmail.com"
                  className="flex items-center gap-3 text-stone-800 font-bold hover:text-brand transition-colors group w-fit"
                >
                  <div className="w-10 h-10 rounded-full bg-stone-100 group-hover:bg-red-50 flex items-center justify-center transition-colors">
                    <Mail className="w-4 h-4" />
                  </div>
                  pavingjoss@gmail.com
                </a>
              </div>
            </div>
            <div className="w-full md:w-[45%] h-64 md:h-[400px] bg-stone-100 rounded-3xl overflow-hidden relative group">
              {/* Location Map Preview */}
              {/* Professional Grayscale SVG Map Illustration */}
              <svg
                className="absolute inset-0 w-full h-full object-cover transition-all duration-700 opacity-90 group-hover:opacity-100 group-hover:scale-[1.03]"
                viewBox="0 0 800 600"
                preserveAspectRatio="xMidYMid slice"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <pattern
                    id="grid"
                    x="0"
                    y="0"
                    width="40"
                    height="40"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 40 0 L 0 0 0 40"
                      fill="none"
                      stroke="#e5e5e5"
                      strokeWidth="1"
                    />
                    <path
                      d="M 10 0 L 10 40 M 20 0 L 20 40 M 30 0 L 30 40 M 0 10 L 40 10 M 0 20 L 40 20 M 0 30 L 40 30"
                      fill="none"
                      stroke="#f5f5f5"
                      strokeWidth="0.5"
                    />
                  </pattern>
                  <filter id="shadow">
                    <feDropShadow
                      dx="0"
                      dy="8"
                      stdDeviation="12"
                      floodOpacity="0.05"
                    />
                  </filter>
                  <filter id="shadow-sm">
                    <feDropShadow
                      dx="0"
                      dy="2"
                      stdDeviation="4"
                      floodOpacity="0.05"
                    />
                  </filter>
                </defs>

                <rect width="100%" height="100%" fill="#fafafa" />
                <rect width="100%" height="100%" fill="url(#grid)" />

                {/* Abstract topography / coastline */}
                <path
                  d="M 550,-50 C 580,150 480,300 650,480 C 720,550 780,580 850,650 L 850,-50 Z"
                  fill="#f4f4f5"
                />
                <path
                  d="M 550,-50 C 580,150 480,300 650,480 C 720,550 780,580 850,650"
                  fill="none"
                  stroke="#e4e4e7"
                  strokeWidth="2"
                />

                {/* Industrial / Residential area outline blocks */}
                <g
                  fill="#ffffff"
                  stroke="#e5e5e5"
                  strokeWidth="1"
                  filter="url(#shadow)"
                >
                  <rect x="240" y="240" width="60" height="80" rx="6" />
                  <rect x="320" y="260" width="110" height="60" rx="6" />
                  <rect x="240" y="340" width="190" height="40" rx="6" />
                  <rect x="140" y="240" width="80" height="40" rx="6" />
                  <rect x="140" y="300" width="80" height="80" rx="6" />

                  {/* additional blocks */}
                  <rect x="320" y="180" width="60" height="60" rx="6" />
                  <rect x="400" y="210" width="40" height="30" rx="4" />
                  <rect x="180" y="160" width="120" height="60" rx="6" />
                </g>

                {/* Main structural highways and roads (light gray) */}
                <path
                  d="M -50,150 L 230,230 L 450,230 L 850,100"
                  fill="none"
                  stroke="#d4d4d8"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M 230,230 L 230,650"
                  fill="none"
                  stroke="#d4d4d8"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M 450,230 L 450,650"
                  fill="none"
                  stroke="#e4e4e7"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Local connection roads */}
                <path
                  d="M 100,290 L 230,290"
                  fill="none"
                  stroke="#e4e4e7"
                  strokeWidth="4"
                />
                <path
                  d="M 310,230 L 310,400 L 450,400"
                  fill="none"
                  stroke="#e4e4e7"
                  strokeWidth="4"
                />
                <path
                  d="M 230,400 L -50,400"
                  fill="none"
                  stroke="#e4e4e7"
                  strokeWidth="4"
                />

                {/* Highlighted Focus - The Production Facility */}
                <rect
                  x="320"
                  y="260"
                  width="110"
                  height="60"
                  rx="6"
                  fill="#f4f4f5"
                  stroke="#d4d4d8"
                  strokeWidth="2"
                  filter="url(#shadow-sm)"
                />
                <g stroke="#e4e4e7" strokeWidth="2" strokeLinecap="round">
                  <line x1="335" y1="275" x2="415" y2="275" />
                  <line x1="335" y1="285" x2="415" y2="285" />
                  <line x1="335" y1="295" x2="415" y2="295" />
                  <line x1="335" y1="305" x2="385" y2="305" />
                </g>

                {/* Location Pin Dot with expanding pulse circles */}
                <circle cx="375" cy="290" r="28" fill="#fee2e2" opacity="0.4" />
                <circle cx="375" cy="290" r="16" fill="#fca5a5" opacity="0.5" />
                <circle cx="375" cy="290" r="5" fill="#b02524" />
                <circle cx="375" cy="290" r="2" fill="#ffffff" />
              </svg>
              <div className="absolute inset-0 bg-gradient-to-t from-stone-100/50 via-transparent to-transparent pointer-events-none" />

              <div className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-xl p-4 rounded-[20px] flex items-center justify-between shadow-2xl border border-white/50 transform translate-y-2 opacity-90 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 ease-out z-10">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center shrink-0 border border-red-100 mt-0.5">
                    <MapPin className="w-4 h-4 text-brand" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-stone-900 mb-0.5">
                      Berpusat di Banyuwangi
                    </div>
                    <div className="text-[10px] text-stone-500 font-medium leading-tight max-w-[200px]">
                      Dusun Petahunan, Gambiran
                      <br />
                      Jawa Timur 68486
                    </div>
                  </div>
                </div>
                <a
                  href="https://www.google.com/maps/place/PAVING+JOSS/@-8.4492075,114.1783708,1559m/data=!3m2!1e3!4b1!4m6!3m5!1s0x2dd3ff56bde07a6b:0xe5fd54602e96e050!8m2!3d-8.4492128!4d114.1832417!16s%2Fg%2F11h2kbpp_r"
                  target="_blank"
                  rel="noreferrer"
                  className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-stone-900 text-white rounded-xl text-[10px] font-bold tracking-wide hover:bg-brand transition-colors shrink-0"
                >
                  Rute <ArrowRight className="w-3 h-3" />
                </a>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Specialist Experts Section */}
        <section className="max-w-[1400px] mx-auto px-4 lg:px-8 py-8 lg:py-16">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-black text-stone-900 tracking-tight">
              Keahlian & Kepercayaan
            </h2>
            <p className="text-stone-500 mt-3 font-medium max-w-2xl mx-auto leading-relaxed">
              Kualitas material berawal dari tangan-tangan ahli yang
              berdedikasi. Kami menghadirkan spesialis terbaik yang menjamin
              kontrol mutu dan konsistensi di setiap tahap produk yang kami
              ciptakan untuk Anda.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 max-w-5xl mx-auto xl:max-w-6xl">
            {/* Ludy */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              className="bg-white rounded-[2rem] p-8 lg:p-10 shadow-2xl shadow-stone-200/50 border border-stone-100 flex flex-col md:flex-row gap-6 items-center md:items-start group hover:-translate-y-1 transition-transform"
            >
              <div className="w-24 h-24 lg:w-32 lg:h-32 bg-stone-50 rounded-full flex-shrink-0 flex items-center justify-center border-4 border-white shadow-inner relative overflow-hidden group-hover:border-red-50 transition-colors">
                <span className="text-5xl font-black text-stone-300">L</span>
              </div>
              <div className="text-center md:text-left">
                <h3 className="text-2xl font-black text-stone-900 mb-1">
                  Bachtiar Ludy{" "}
                  <span className="text-sm font-bold text-stone-400">
                    (@Ludy)
                  </span>
                </h3>
                <div className="text-brand font-bold text-xs uppercase tracking-widest mb-4 inline-block bg-red-50 px-3 py-1 rounded-lg">
                  Product Specialist
                </div>
                <p className="text-stone-600 leading-relaxed font-medium text-sm">
                  Saya adalah penjaga standar mutu sejati yang memastikan tidak
                  ada kompromi pada kualitas akhir produk. Mata telanjang saya
                  memiliki ketajaman analitis yang tak tergantikan dalam
                  mengeleminasi mikrocacat yang tidak terlihat. Fokus obsesif
                  saya terhadap konsistensi mutu standar SNI & K300 menjadikan
                  kualitas material kami sebagai pilihan paling terpercaya untuk
                  para pengembang serta arsitek berstandar tinggi.
                </p>
              </div>
            </motion.div>

            {/* Eghy */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-[2rem] p-8 lg:p-10 shadow-2xl shadow-stone-200/50 border border-stone-100 flex flex-col md:flex-row gap-6 items-center md:items-start group hover:-translate-y-1 transition-transform"
            >
              <div className="w-24 h-24 lg:w-32 lg:h-32 bg-stone-50 rounded-full flex-shrink-0 flex items-center justify-center border-4 border-white shadow-inner relative overflow-hidden group-hover:border-red-50 transition-colors">
                <span className="text-5xl font-black text-stone-300">E</span>
              </div>
              <div className="text-center md:text-left">
                <h3 className="text-2xl font-black text-stone-900 mb-1">
                  Eghy Al Vandi{" "}
                  <span className="text-sm font-bold text-stone-400">
                    (@Eghy)
                  </span>
                </h3>
                <div className="text-brand font-bold text-xs uppercase tracking-widest mb-4 inline-block bg-red-50 px-3 py-1 rounded-lg">
                  Machinery Specialist
                </div>
                <p className="text-stone-600 leading-relaxed font-medium text-sm">
                  Dengan keahlian mendalam dalam konfigurasi dan kalibrasi
                  sistem manufaktur berteknologi tinggi, saya memberikan garansi
                  zero-defect pada proses awal rekayasa fabrikasi kami.
                  Integritas teknis yang saya miliki memastikan bahwa setiap
                  balok beton dan paving dicetak dengan presisi mesin terakurat,
                  mendefinisikan ulang reliabilitas infrastruktur jangka panjang
                  yang bisa selalu Anda andalkan dalam setiap pesanan berat.
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Kolase Foto Produk & Finished Goods (Read-Only Showcase) */}
        <section
          id="katalog"
          className="max-w-[1400px] mx-auto px-4 lg:px-8 py-12 lg:py-20"
        >
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 lg:mb-10">
            <div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-brand/10 text-brand rounded-full text-xs font-bold uppercase tracking-wider mb-3 border border-brand/20">
                <Sparkles className="w-3.5 h-3.5 fill-brand" />
                Galeri Fasilitas &amp; Portofolio
              </div>
              <motion.h2
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="text-4xl md:text-5xl font-black text-stone-900 tracking-tight"
              >
                Kapabilitas <span className="text-brand">Manufaktur.</span>
              </motion.h2>
              <p className="text-stone-500 mt-3 max-w-xl font-medium text-sm md:text-base leading-relaxed">
                Dokumentasi teknologi cetak hidrolik presisi, mesin fabrikasi baja, dan armada pengiriman mandiri CV Batu Emas Group yang selaras dengan layanan made-to-order kami.
              </p>
            </div>
          </div>

          {/* Windows Phone Live Tile Collage or Elegant Minimalist Showcase */}
          {products.length === 0 ? (
            <div className="w-full bg-white rounded-3xl border border-stone-200/90 p-8 sm:p-12 text-center shadow-xs my-4">
              <div className="w-14 h-14 rounded-2xl bg-red-50 text-brand flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold text-brand uppercase tracking-widest bg-red-50 px-3 py-1 rounded-full border border-red-100 inline-block mb-3">
                Layanan Made-to-Order &amp; Custom Blueprint
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
                Portofolio Galeri Sedang Disiapkan
              </h3>
              <p className="text-xs sm:text-sm text-stone-500 mt-2.5 max-w-lg mx-auto leading-relaxed font-medium">
                Seluruh pemesanan material paving block, kanstin, u-ditch, dan fabrikasi baja dilayani langsung berdasarkan rancangan teknis &amp; kebutuhan spesifik proyek Anda.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
                <a
                  href="https://wa.me/6281111113993?text=Halo%20Paving%20Joss,%20saya%20ingin%20konsultasi%20katalog%20produk%20dan%20penawaran%20harga%20custom%20proyek."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-6 py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm active:scale-95 inline-flex items-center justify-center gap-2"
                >
                  <span>Konsultasi via WhatsApp (0811-1111-3993)</span>
                </a>
                <Link
                  to="/shop"
                  className="w-full sm:w-auto px-6 py-3 bg-white hover:bg-stone-50 text-stone-800 border border-stone-200 rounded-xl font-bold text-xs uppercase tracking-wider transition-all inline-flex items-center justify-center gap-2"
                >
                  <span>Kunjungi Halaman Shop</span>
                </Link>
              </div>
              <div className="mt-8 pt-6 border-t border-stone-100 flex flex-wrap items-center justify-center gap-3 text-[11px] font-medium text-stone-400">
                <span>✓ Mutu K-300 / K-500 SNI</span>
                <span>•</span>
                <span>✓ Presisi Toleransi Cetak ±0.1mm</span>
                <span>•</span>
                <span>✓ Pengiriman Mandiri Se-Jawa Timur</span>
              </div>
            </div>
          ) : (
            <>
              {/* Category Filter Tabs */}
              <div className="flex flex-wrap items-center gap-2 mb-8">
                {[
                  { id: "ALL", label: "Semua Fasilitas" },
                  { id: "Paving & Precast", label: "Paving & Precast" },
                  { id: "Drainase & Kanstin", label: "Drainase & Kanstin" },
                  { id: "Fabrikasi Baja", label: "Fabrikasi Baja" },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      activeCategory === cat.id
                        ? "bg-stone-900 text-white shadow-sm"
                        : "bg-white text-stone-600 hover:text-stone-900 hover:bg-stone-100 border border-stone-200/80"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Windows Phone Live Tile Collage (Varied Sizes, Zero-Gap Seamless, Elegant Staggered Flip/Slide) */}
              <LiveTileCollage
                products={products}
                activeCategory={activeCategory}
              />
            </>
          )}
        </section>

        {/* Visual Break / Call To Action Banner */}
        <section className="mt-16 lg:mt-24 mb-16 lg:mb-24 px-4 lg:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="max-w-[1400px] mx-auto bg-white rounded-[2.5rem] border border-stone-200/90 p-10 md:p-16 lg:p-20 text-center relative overflow-hidden shadow-2xs"
          >
            <div className="relative z-10">
              <h2 className="text-3xl md:text-5xl font-black text-stone-900 mb-6 tracking-tight">
                Siap Membangun
                <br />
                Bersama Kami?
              </h2>
              <p className="text-stone-600 font-medium mb-10 max-w-lg mx-auto">
                Konsultasikan kebutuhan material proyek Anda, dan dapatkan
                penawaran terbaik langsung dari pabrik.
              </p>
              <a
                href="https://wa.me/6281111113993"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 px-8 py-4 bg-stone-900 text-white hover:bg-stone-800 font-bold rounded-full shadow-sm transition-all hover:scale-105 active:scale-95"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="currentColor"
                >
                  <path d="M16.75 13.96c.25.13.41.2.46.3.06.11.04.61-.21 1.18-.2.56-1.24 1.1-1.7 1.12-.46.02-.47.36-2.96-.73-2.49-1.09-3.99-3.75-4.11-3.92-.12-.17-.96-1.38-.92-2.61.05-1.22.69-1.8.95-2.04.24-.26.51-.29.68-.26h.47c.15 0 .36-.06.55.45l.69 1.87c.06.13.1.28.01.44l-.27.41-.39.42c-.12.12-.26.25-.12.5c.12.26.62 1.09 1.32 1.78c.91.88 1.71 1.17 1.95 1.3c.24.14.39.12.54-.04l.81-.94c.19-.25.35-.19.58-.11l1.67.88M12 2a10 10 0 0 1 10 10a10 10 0 0 1-10 10c-1.97 0-3.8-.57-5.35-1.55L2 22l1.55-4.65A9.969 9.969 0 0 1 2 12A10 10 0 0 1 12 2m0 2a8 8 0 0 0-8 8c0 1.72.54 3.31 1.46 4.61L4.5 19.5l2.89-.96A7.95 7.95 0 0 0 12 20a8 8 0 0 0 8-8a8 8 0 0 0-8-8z" />
                </svg>
                Hubungi via WhatsApp
              </a>
            </div>
          </motion.div>
        </section>
      </main>

      {/* Catalog Modal */}
      <Modal
        isOpen={isCatalogModalOpen}
        onClose={() => setIsCatalogModalOpen(false)}
        maxWidth="5xl"
        title="Katalog Produk & Company Profile"
        className="overflow-hidden rounded-[2rem]"
        contentClassName="p-0 flex flex-col h-[85vh] bg-stone-50 border-t border-stone-100"
      >
        <div className="flex-1 w-full overflow-y-auto bg-stone-100/50 flex flex-col p-6 items-center custom-scrollbar shadow-inner relative">
          <div className="w-full max-w-3xl bg-white rounded-[2rem] shadow-xl border border-stone-200 overflow-hidden relative flex flex-col mb-8 shrink-0">
            {/* PDF Viewer Header */}
            <div className="px-4 py-3 bg-stone-50 border-b border-stone-100 flex items-center justify-between z-10 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
                <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
              </div>
              <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest flex items-center gap-2">
                compro-batu-emas-group.pdf
              </div>
              <div className="w-12 text-right text-xs font-bold text-stone-400">
                1 / 1
              </div>
            </div>

            {/* PDF Document Page */}
            <div className="flex-1 p-8 md:p-16 flex flex-col items-center text-center bg-white">
              <div className="w-full h-2 bg-brand rounded-full mb-12"></div>
              <div className="w-24 h-24 mb-8 bg-stone-50 rounded-full flex items-center justify-center border border-stone-100">
                <img
                  src="/logo.png"
                  alt="Logo"
                  className="w-16 h-16 object-contain"
                />
              </div>
              <h1 className="text-4xl font-black text-stone-900 tracking-tighter mb-4 uppercase">
                Company Profile
              </h1>
              <h2 className="text-xl font-bold text-brand mb-4 tracking-tight">
                CV. Batu Emas Group
              </h2>
              <p className="text-stone-500 font-medium mb-12 max-w-md mx-auto leading-relaxed">
                Penyedia material bangunan dan paving block pracetak berkualitas
                tinggi. Melayani proyek komersial dan residensial dengan standar
                durabilitas maksimum.
              </p>

              <div className="grid grid-cols-2 gap-4 w-full mb-12">
                <div className="aspect-[4/3] bg-stone-50 rounded-xl border border-stone-100 flex items-center justify-center p-4">
                  <div className="w-full h-full border-2 border-dashed border-stone-200 rounded-lg flex items-center justify-center flex-col gap-2">
                    <div className="w-10 h-10 bg-stone-100 rounded-full"></div>
                    <div className="w-2/3 h-2 bg-stone-200 rounded-full"></div>
                  </div>
                </div>
                <div className="aspect-[4/3] bg-stone-50 rounded-xl border border-stone-100 flex items-center justify-center p-4">
                  <div className="w-full h-full border-2 border-dashed border-stone-200 rounded-lg flex items-center justify-center flex-col gap-2">
                    <div className="w-10 h-10 bg-stone-100 rounded-full"></div>
                    <div className="w-2/3 h-2 bg-stone-200 rounded-full"></div>
                  </div>
                </div>
              </div>

              <div className="mt-auto flex items-center justify-center gap-2 text-stone-400 w-full pt-8 border-t border-stone-100">
                <Star className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  Katalog Produk 2026
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="p-6 border-t border-stone-200 bg-white flex justify-center gap-4 shrink-0 rounded-b-[2rem]">
          <button
            onClick={() => setIsCatalogModalOpen(false)}
            className="px-6 py-2.5 rounded-xl text-sm font-bold bg-stone-100 text-stone-700 hover:bg-stone-200 transition-colors"
          >
            Tutup
          </button>
          <a
            href="/compro.pdf"
            download="compro-batu-emas.pdf"
            className="px-6 py-2.5 rounded-xl text-sm font-bold bg-brand text-white hover:bg-red-800 shadow-md flex items-center gap-2 transition-all"
          >
            <Download className="w-4 h-4" />
            Export PDF (A4)
          </a>
        </div>
      </Modal>

      <PublicFooter />
    </div>
  );
}
