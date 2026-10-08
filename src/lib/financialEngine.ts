/**
 * Centralized Financial Precision Engine for FHTBS ERP
 * Single Source of Truth for:
 * Gross Amount -> Discount -> DPP (Full) -> DPP Nilai Lain (11/12) -> PPN (12% formal / 11% de facto) -> Grand Total -> PPh (WHT) -> Net Payable / Net Cash
 */

export type TaxScheme = "DPP_NILAI_LAIN" | "STANDARD" | "NON_PKP";

export interface FinancialBreakdown {
  grossAmount: number;
  discountRate: number;
  discountAmount: number;
  roundingFactor: number;
  dpp: number; // Pure DPP / Transaction value after discount
  dppNilaiLain: number; // DPP Nilai Lain = (11/12) * DPP for PMK regulation
  isDppNilaiLain: boolean;
  taxScheme: TaxScheme;
  taxRate: number; // Formal statutory PPN rate (12%)
  effectivePpnRate: number; // Effective PPN rate
  ppnAmount: number; // PPN Terutang = 12% * DPP Nilai Lain (or taxRate * DPP)

  pphRate: number; // PPh withholding rate (e.g. 2% or 0%)
  pphAmount: number; // WHT Amount = DPP * (pphRate / 100)
  grandTotal: number; // Total Tagihan / Invoice Total = DPP + PPN + roundingFactor
  netPayable: number; // Nilai Pembayaran Bersih = Grand Total - PPh Withholding
  netCashReceived: number; // Alias for netPayable
  terbilang: string;
}

export interface CalculateFinanceParams {
  grossAmount?: number;
  items?: Array<{ qty?: number; quantity?: number; unit_price?: number; price?: number; subtotal?: number }>;
  discountRate?: number;
  discountAmount?: number;
  taxRate?: number;
  pphRate?: number;
  roundingFactor?: number;
  dpp?: number;
  dppNilaiLain?: number;
  grandTotal?: number;
  taxScheme?: TaxScheme;
  useDppNilaiLain?: boolean;
}

/**
 * Calculates complete financial breakdown with mathematical rigor,
 * complying with Indonesian PMK regulations for DPP Nilai Lain (PPN 12% with de facto 11% effective rate)
 * and proper Withholding Tax (WHT / PPh 23) deduction on net payable.
 */
export function calculateFinancialBreakdown(
  params: CalculateFinanceParams,
): FinancialBreakdown {
  let computedGross = Number(params.grossAmount) || 0;

  if (computedGross === 0 && params.items && params.items.length > 0) {
    computedGross = params.items.reduce((sum, item) => {
      const qty = Number(item.qty ?? item.quantity ?? 1);
      const unitPrice = Number(item.unit_price ?? item.price ?? 0);
      const itemSubtotal = item.subtotal !== undefined ? Number(item.subtotal) : qty * unitPrice;
      return sum + itemSubtotal;
    }, 0);
  }

  const discountRate = Number(params.discountRate) || 0;

  // If gross is still 0 but DPP is known with a discount rate, reconstruct gross
  if (computedGross === 0 && Number(params.dpp) > 0) {
    if (discountRate > 0 && discountRate < 100) {
      computedGross = Math.round(Number(params.dpp) / (1 - discountRate / 100));
    } else {
      computedGross = Number(params.dpp);
    }
  }

  const discountAmount =
    params.discountAmount !== undefined &&
    params.discountAmount !== null &&
    Number(params.discountAmount) > 0
      ? Number(params.discountAmount)
      : Math.round(computedGross * (discountRate / 100));

  // DPP (Dasar Pengenaan Pajak) is Gross minus Discount
  const dpp = Math.max(0, computedGross - discountAmount);

  const taxRate =
    params.taxRate !== undefined && params.taxRate !== null
      ? Number(params.taxRate)
      : 12;

  const pphRate =
    params.pphRate !== undefined && params.pphRate !== null
      ? Number(params.pphRate)
      : 0;

  // Determine tax scheme
  let taxScheme: TaxScheme = params.taxScheme || (taxRate === 0 ? "NON_PKP" : "DPP_NILAI_LAIN");
  if (params.useDppNilaiLain === false) {
    taxScheme = taxRate === 0 ? "NON_PKP" : "STANDARD";
  } else if (params.useDppNilaiLain === true && taxRate > 0) {
    taxScheme = "DPP_NILAI_LAIN";
  }

  let dppNilaiLain = dpp;
  let ppnAmount = 0;
  let effectivePpnRate = 0;
  let isDppNilaiLain = false;

  if (taxRate > 0 && taxScheme === "DPP_NILAI_LAIN") {
    // Indonesian PMK Regulation:
    // Basis PPN (DPP Nilai Lain) = 11/12 * DPP
    // PPN Terutang = 12% * DPP Nilai Lain
    dppNilaiLain = Math.round((dpp * 11) / 12);
    ppnAmount = Math.round(dppNilaiLain * 0.12);
    effectivePpnRate = 12;
    isDppNilaiLain = true;
  } else if (taxRate > 0 && taxScheme === "STANDARD") {
    dppNilaiLain = dpp;
    ppnAmount = Math.round(dpp * (taxRate / 100));
    effectivePpnRate = taxRate;
    isDppNilaiLain = false;
  } else {
    // NON_PKP or 0%
    dppNilaiLain = dpp;
    ppnAmount = 0;
    effectivePpnRate = 0;
    isDppNilaiLain = false;
  }

  // WHT / PPh Withholding: strictly calculated on DPP (Dasar Pengenaan Pajak)
  const pphAmount = Math.round(dpp * (pphRate / 100));

  // Invoice / PO Grand Total = DPP + PPN (Gross commercial billing before WHT deduction)
  const unroundedTotal = dpp + ppnAmount;

  let roundingFactor = 0;
  let grandTotal = unroundedTotal;

  if (params.roundingFactor !== undefined && params.roundingFactor !== null) {
    roundingFactor = Number(params.roundingFactor) || 0;
    grandTotal = unroundedTotal + roundingFactor;
  } else if (Number(params.grandTotal) > 0 && computedGross === 0 && !params.items) {
    grandTotal = Number(params.grandTotal);
    roundingFactor = grandTotal - unroundedTotal;
  } else {
    grandTotal = unroundedTotal;
    roundingFactor = 0;
  }

  // Net Payable / Net Cash Received: What the payer actually transfers after deducting Withholding Tax (PPh)
  const netPayable = Math.max(0, grandTotal - pphAmount);

  return {
    grossAmount: Math.round(computedGross),
    discountRate,
    discountAmount: Math.round(discountAmount),
    roundingFactor: Math.round(roundingFactor),
    dpp: Math.round(dpp),
    dppNilaiLain: Math.round(dppNilaiLain),
    isDppNilaiLain,
    taxScheme,
    taxRate,
    effectivePpnRate,
    ppnAmount: Math.round(ppnAmount),
    pphRate,
    pphAmount: Math.round(pphAmount),
    grandTotal: Math.round(grandTotal),
    netPayable: Math.round(netPayable),
    netCashReceived: Math.round(netPayable),
    terbilang: angkaKeTerbilang(grandTotal),
  };
}

/**
 * Converts numeric value to standard Indonesian Terbilang wording.
 */
export function angkaKeTerbilang(nilai: number): string {
  if (!nilai || nilai === 0) return "Nol Rupiah";

  const bilangan = [
    "",
    "Satu",
    "Dua",
    "Tiga",
    "Empat",
    "Lima",
    "Enam",
    "Tujuh",
    "Delapan",
    "Sembilan",
    "Sepuluh",
    "Sebelas",
  ];

  let temp = "";
  const n = Math.floor(Math.abs(nilai));

  if (n < 12) {
    temp = " " + bilangan[n];
  } else if (n < 20) {
    temp = angkaKeTerbilang(n - 10).replace(" Rupiah", "") + " Belas";
  } else if (n < 100) {
    temp =
      angkaKeTerbilang(Math.floor(n / 10)).replace(" Rupiah", "") +
      " Puluh" +
      angkaKeTerbilang(n % 10).replace(" Rupiah", "");
  } else if (n < 200) {
    temp = " Seratus" + angkaKeTerbilang(n - 100).replace(" Rupiah", "");
  } else if (n < 1000) {
    temp =
      angkaKeTerbilang(Math.floor(n / 100)).replace(" Rupiah", "") +
      " Ratus" +
      angkaKeTerbilang(n % 100).replace(" Rupiah", "");
  } else if (n < 2000) {
    temp = " Seribu" + angkaKeTerbilang(n - 1000).replace(" Rupiah", "");
  } else if (n < 1000000) {
    temp =
      angkaKeTerbilang(Math.floor(n / 1000)).replace(" Rupiah", "") +
      " Ribu" +
      angkaKeTerbilang(n % 1000).replace(" Rupiah", "");
  } else if (n < 1000000000) {
    temp =
      angkaKeTerbilang(Math.floor(n / 1000000)).replace(" Rupiah", "") +
      " Juta" +
      angkaKeTerbilang(n % 1000000).replace(" Rupiah", "");
  } else if (n < 1000000000000) {
    temp =
      angkaKeTerbilang(Math.floor(n / 1000000000)).replace(" Rupiah", "") +
      " Milyar" +
      angkaKeTerbilang(n % 1000000000).replace(" Rupiah", "");
  } else if (n < 1000000000000000) {
    temp =
      angkaKeTerbilang(Math.floor(n / 1000000000000)).replace(" Rupiah", "") +
      " Triliun" +
      angkaKeTerbilang(n % 1000000000000).replace(" Rupiah", "");
  }

  const result = temp.trim();
  if (result.endsWith("Rupiah")) {
    return result;
  }
  return result + " Rupiah";
}
