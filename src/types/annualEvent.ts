export type EventThemeColor = 'burgundy' | 'gold' | 'emerald' | 'sapphire' | 'amber' | 'crimson';

export interface AnnualEventConfig {
  id: string;
  isActive: boolean;
  eventName: string;
  themeName: EventThemeColor;
  tagline: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  countdownEnabled: boolean;
  
  // Media Platform (uploaded image(s) for the hero media platform and event showcase)
  media: {
    heroImageUrl: string;
    heroImageCaption?: string;
    galleryImages: string[];
    actionButtonText?: string;
    actionButtonLink?: string; // e.g. '/shop' or '/careers'
  };

  // Customization per page
  publicSettings: {
    enabled: boolean;
    showHeroMedia: boolean;
    announcementBarEnabled: boolean;
    announcementText: string;
    heroBadgeText: string;
    themeColor: EventThemeColor;
  };

  careersSettings: {
    enabled: boolean;
    bannerTitle: string;
    bannerSubtitle: string;
    badgeText: string;
    bannerImageUrl?: string;
    highlightPerks: string[];
  };

  shopSettings: {
    enabled: boolean;
    promoBannerTitle: string;
    promoBannerSubtitle: string;
    voucherCode: string;
    discountPercentage: number;
    bannerImageUrl?: string;
    highlightTag: string;
  };

  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_ANNUAL_EVENT_CONFIG: AnnualEventConfig = {
  id: "annual_event_main",
  isActive: true,
  eventName: "Gebyar Akbar Manufaktur 2026",
  themeName: "burgundy",
  tagline: "Festival Mutu & Infrastruktur Tangguh Lintas Generasi",
  description: "Rayakan momen tahunan CV Batu Emas Group dengan rangkaian inovasi paving block K-300, diskon spesial proyek, dan perekrutan talenta terbaik.",
  startDate: new Date().toISOString().split("T")[0],
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  countdownEnabled: true,
  media: {
    heroImageUrl: "https://images.unsplash.com/photo-1541888946425-d0fbb186f5f7?w=1200&auto=format&fit=crop&q=80",
    heroImageCaption: "Dokumentasi Ekshibisi Mesin Cetak Hidrolik Otomatis & Fasilitas Baru",
    galleryImages: [
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?w=800&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1588880331179-bc9b93a8cb5e?w=800&auto=format&fit=crop&q=80"
    ],
    actionButtonText: "Lihat Katalog & Promo Event",
    actionButtonLink: "/shop"
  },
  publicSettings: {
    enabled: true,
    showHeroMedia: true,
    announcementBarEnabled: false,
    announcementText: "🎉 Gebyar Event Tahunan CV Batu Emas Group — Dapatkan penawaran proyek istimewa & voucher belanja!",
    heroBadgeText: "ANNUAL EVENT 2026",
    themeColor: "burgundy"
  },
  careersSettings: {
    enabled: true,
    bannerTitle: "Perekrutan Akbar Talenta Pabrik 2026",
    bannerSubtitle: "Bergabunglah dengan tim manufaktur paving terkemuka dalam rangkaian Event Tahunan. Proses seleksi diprioritaskan!",
    badgeText: "SPECIAL ANNUAL HIRING",
    bannerImageUrl: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=1200&auto=format&fit=crop&q=80",
    highlightPerks: [
      "Prioritas Verifikasi 2x Lebih Cepat",
      "Walk-in Interview & Onboarding Terpadu",
      "Bonus Selamat Datang Karyawan Baru"
    ]
  },
  shopSettings: {
    enabled: true,
    promoBannerTitle: "Festival Belanja Paving & Material Proyek",
    promoBannerSubtitle: "Gunakan kupon event untuk potongan harga hingga 20% langsung di Toko Pabrik!",
    voucherCode: "GEBYAR2026",
    discountPercentage: 15,
    bannerImageUrl: "https://images.unsplash.com/photo-1588880331179-bc9b93a8cb5e?w=1200&auto=format&fit=crop&q=80",
    highlightTag: "PROMO EVENT TAHUNAN"
  }
};
