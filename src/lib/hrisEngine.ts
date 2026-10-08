/**
 * Centralized HRIS Calculation & Ruleset Engine (CV Batu Emas Group)
 * Standards:
 * - Depnaker Multi-Tiered Overtime Multiplier (1.5x, 2x, 3x, 4x)
 * - PPh 21 TER (Tarif Efektif Rata-Rata) Categories A, B, C (PP 58/2023 & PMK 168/2023)
 * - BPJS Ketenagakerjaan & BPJS Kesehatan with Dynamic Wage Caps
 * - Direct Labor (BTKL) vs Indirect/Operational Cost Allocation
 * - Shift-Bound Time Matching & Cross-Midnight Normalizer
 */

// BPJS Limits (Standard 2024/2026 Indonesia)
export const BPJS_CONFIG = {
  KESEHATAN_MAX_WAGE: 12000000, // Cap batas atas BPJS Kesehatan
  KESEHATAN_EMPLOYEE_RATE: 0.01, // 1% ditanggung karyawan
  KESEHATAN_EMPLOYER_RATE: 0.04, // 4% ditanggung perusahaan
  
  PENSIUN_MAX_WAGE: 10042300, // Cap batas atas Jaminan Pensiun (JP)
  JP_EMPLOYEE_RATE: 0.01, // 1% karyawan
  JP_EMPLOYER_RATE: 0.02, // 2% perusahaan
  
  JHT_EMPLOYEE_RATE: 0.02, // 2% JHT karyawan
  JHT_EMPLOYER_RATE: 0.037, // 3.7% JHT perusahaan
  
  JKK_EMPLOYER_RATE: 0.0089, // 0.89% JKK (Tingkat risiko sedang industri manufaktur)
  JKM_EMPLOYER_RATE: 0.003, // 0.3% JKM perusahaan
};

export type TERCategory = "A" | "B" | "C";

/**
 * Determines TER Category based on PTKP status
 * - Cat A: TK/0, TK/1, K/0
 * - Cat B: TK/2, TK/3, K/1, K/2
 * - Cat C: K/3
 */
export function getTERCategory(ptkpStatus: string = "TK/0"): TERCategory {
  const norm = ptkpStatus.toUpperCase().replace(/\s+/g, "");
  if (["TK/0", "TK/1", "K/0"].includes(norm)) return "A";
  if (["TK/2", "TK/3", "K/1", "K/2"].includes(norm)) return "B";
  if (["K/3"].includes(norm)) return "C";
  return "A";
}

/**
 * Calculates monthly PPh 21 based on official TER brackets
 */
export function calculatePPh21TER(monthlyGross: number, ptkpStatus: string = "TK/0"): number {
  if (monthlyGross <= 5400000) return 0;
  const category = getTERCategory(ptkpStatus);

  let rate = 0;
  if (category === "A") {
    if (monthlyGross <= 5400000) rate = 0;
    else if (monthlyGross <= 5650000) rate = 0.0025;
    else if (monthlyGross <= 5950000) rate = 0.005;
    else if (monthlyGross <= 6300000) rate = 0.0075;
    else if (monthlyGross <= 6750000) rate = 0.01;
    else if (monthlyGross <= 7500000) rate = 0.0125;
    else if (monthlyGross <= 8550000) rate = 0.015;
    else if (monthlyGross <= 9650000) rate = 0.0175;
    else if (monthlyGross <= 10050000) rate = 0.02;
    else if (monthlyGross <= 10350000) rate = 0.0225;
    else if (monthlyGross <= 10700000) rate = 0.025;
    else if (monthlyGross <= 12500000) rate = 0.03;
    else if (monthlyGross <= 13750000) rate = 0.04;
    else if (monthlyGross <= 15100000) rate = 0.05;
    else if (monthlyGross <= 16950000) rate = 0.06;
    else if (monthlyGross <= 19750000) rate = 0.07;
    else if (monthlyGross <= 24150000) rate = 0.08;
    else if (monthlyGross <= 26450000) rate = 0.09;
    else if (monthlyGross <= 28000000) rate = 0.10;
    else rate = 0.12;
  } else if (category === "B") {
    if (monthlyGross <= 6200000) rate = 0;
    else if (monthlyGross <= 6500000) rate = 0.0025;
    else if (monthlyGross <= 6850000) rate = 0.005;
    else if (monthlyGross <= 7300000) rate = 0.0075;
    else if (monthlyGross <= 9200000) rate = 0.01;
    else if (monthlyGross <= 10750000) rate = 0.015;
    else if (monthlyGross <= 12550000) rate = 0.02;
    else if (monthlyGross <= 14950000) rate = 0.03;
    else if (monthlyGross <= 16400000) rate = 0.04;
    else if (monthlyGross <= 17450000) rate = 0.05;
    else if (monthlyGross <= 19750000) rate = 0.06;
    else if (monthlyGross <= 24150000) rate = 0.07;
    else if (monthlyGross <= 26450000) rate = 0.08;
    else rate = 0.10;
  } else {
    // Category C
    if (monthlyGross <= 6600000) rate = 0;
    else if (monthlyGross <= 6950000) rate = 0.0025;
    else if (monthlyGross <= 7350000) rate = 0.005;
    else if (monthlyGross <= 7800000) rate = 0.0075;
    else if (monthlyGross <= 8850000) rate = 0.01;
    else if (monthlyGross <= 9800000) rate = 0.0125;
    else if (monthlyGross <= 10950000) rate = 0.015;
    else if (monthlyGross <= 12200000) rate = 0.0175;
    else if (monthlyGross <= 13400000) rate = 0.02;
    else if (monthlyGross <= 15100000) rate = 0.03;
    else if (monthlyGross <= 16950000) rate = 0.04;
    else rate = 0.08;
  }

  return Math.round(monthlyGross * rate);
}

/**
 * Calculates standard Depnaker tiered overtime pay
 * Hourly rate standard = 1/173 x (Basic Salary + Fixed Allowance)
 */
export function calculateTieredOvertimePay(
  basicSalary: number,
  fixedAllowance: number,
  overtimeHours: number,
  isHolidayOrWeekend: boolean = false
): { totalPay: number; hourlyRate: number; effectiveHours: number } {
  const wageBase = Math.max(0, basicSalary + fixedAllowance);
  const hourlyRate = wageBase > 0 ? wageBase / 173 : 0;

  let effectiveHours = 0;
  if (!isHolidayOrWeekend) {
    // Workday: 1.5x first hour, 2x subsequent hours
    if (overtimeHours <= 1) {
      effectiveHours = overtimeHours * 1.5;
    } else {
      effectiveHours = 1 * 1.5 + (overtimeHours - 1) * 2;
    }
  } else {
    // Holiday/Weekend (6-day or 5-day week standard):
    // First 7/8 hours: 2x, 8th/9th hour: 3x, 9th/10th hour onwards: 4x
    if (overtimeHours <= 7) {
      effectiveHours = overtimeHours * 2.0;
    } else if (overtimeHours === 8) {
      effectiveHours = 7 * 2.0 + 1 * 3.0;
    } else {
      effectiveHours = 7 * 2.0 + 1 * 3.0 + (overtimeHours - 8) * 4.0;
    }
  }

  return {
    totalPay: Math.round(hourlyRate * effectiveHours),
    hourlyRate: Math.round(hourlyRate),
    effectiveHours: Number(effectiveHours.toFixed(2)),
  };
}

/**
 * Full Employee Payroll Breakdown calculation
 */
export interface PayrollCalculationInput {
  username: string;
  name: string;
  role: string;
  level: string;
  department?: string;
  costCategory?: "DIRECT_LABOR" | "OPERATIONAL_EXPENSE";
  ptkpStatus?: string;
  basicSalary: number;
  positionAllowance?: number;
  fixedAllowance?: number;
  kpiScore?: number;
  overtimeHours?: number;
  isHolidayOvertime?: boolean;
  travelDays?: number;
  reimbursementAmount?: number;
  presentDays?: number;
  expectedDays?: number;
  otherDeductions?: number;
}

export interface PayrollCalculationResult {
  username: string;
  name: string;
  role: string;
  level: string;
  costCategory: "DIRECT_LABOR" | "OPERATIONAL_EXPENSE";
  basicSalary: number;
  positionAllowance: number;
  kpiBonus: number;
  overtimePay: number;
  overtimeHours: number;
  travelAllowance: number;
  reimbursementAmount: number;
  grossPay: number;
  absenceDeduction: number;
  bpjsKesehatanEmployee: number;
  bpjsKesehatanEmployer: number;
  bpjsTKEmpJHT: number;
  bpjsTKEmpJP: number;
  bpjsTKTotalEmployee: number;
  bpjsTKTotalEmployer: number;
  totalBPJSEmployeeDeduction: number;
  pph21Deduction: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
}

export function calculateEmployeePayroll(input: PayrollCalculationInput): PayrollCalculationResult {
  const basic = Math.max(0, Number(input.basicSalary || 0));
  const posAllow = Math.max(0, Number(input.positionAllowance || 0));
  const fixAllow = Math.max(0, Number(input.fixedAllowance || 0));
  const expDays = Math.max(1, Number(input.expectedDays || 22));
  const presDays = Number(input.presentDays ?? 22);
  const absentDays = Math.max(0, expDays - presDays);

  // 1. Absence Deduction
  const absenceDeduction = basic > 0 && absentDays > 0 ? Math.round((basic / expDays) * absentDays) : 0;

  // 2. KPI Bonus
  const kpi = Number(input.kpiScore || 0);
  let kpiBonus = 0;
  if (basic > 0) {
    if (kpi >= 90) kpiBonus = Math.round(basic * 0.15);
    else if (kpi >= 80) kpiBonus = Math.round(basic * 0.10);
    else if (kpi >= 70) kpiBonus = Math.round(basic * 0.05);
  }

  // 3. Overtime Pay
  const otHours = Math.max(0, Number(input.overtimeHours || 0));
  const otCalc = calculateTieredOvertimePay(basic, fixAllow, otHours, !!input.isHolidayOvertime);
  const overtimePay = otCalc.totalPay;

  // 4. Allowances & Reimbursements
  const travelDays = Math.max(0, Number(input.travelDays || 0));
  const travelAllowance = travelDays * 250000;
  const reimburse = Math.max(0, Number(input.reimbursementAmount || 0));

  // Gross Earnings
  const grossPay = basic + posAllow + fixAllow + kpiBonus + overtimePay + travelAllowance + reimburse;

  // 5. BPJS Calculations with Cap Limit
  const bpjsKesBase = Math.min(basic + fixAllow, BPJS_CONFIG.KESEHATAN_MAX_WAGE);
  const bpjsKesEmp = Math.round(bpjsKesBase * BPJS_CONFIG.KESEHATAN_EMPLOYEE_RATE);
  const bpjsKesComp = Math.round(bpjsKesBase * BPJS_CONFIG.KESEHATAN_EMPLOYER_RATE);

  const bpjsJPBase = Math.min(basic + fixAllow, BPJS_CONFIG.PENSIUN_MAX_WAGE);
  const bpjsJPEmp = Math.round(bpjsJPBase * BPJS_CONFIG.JP_EMPLOYEE_RATE);
  const bpjsJPComp = Math.round(bpjsJPBase * BPJS_CONFIG.JP_EMPLOYER_RATE);

  const bpjsJHTEmp = Math.round((basic + fixAllow) * BPJS_CONFIG.JHT_EMPLOYEE_RATE);
  const bpjsJHTComp = Math.round((basic + fixAllow) * BPJS_CONFIG.JHT_EMPLOYER_RATE);
  const bpjsJKKComp = Math.round((basic + fixAllow) * BPJS_CONFIG.JKK_EMPLOYER_RATE);
  const bpjsJKMComp = Math.round((basic + fixAllow) * BPJS_CONFIG.JKM_EMPLOYER_RATE);

  const bpjsTKTotalEmp = bpjsJHTEmp + bpjsJPEmp;
  const bpjsTKTotalComp = bpjsJHTComp + bpjsJPComp + bpjsJKKComp + bpjsJKMComp;
  const totalBPJSEmp = bpjsKesEmp + bpjsTKTotalEmp;

  // 6. Tax PPh 21 TER
  const pph21 = calculatePPh21TER(grossPay, input.ptkpStatus || "TK/0");

  // 7. Total Deductions & Net Pay
  const otherDed = Math.max(0, Number(input.otherDeductions || 0));
  const totalDeductions = absenceDeduction + totalBPJSEmp + pph21 + otherDed;
  const netPay = Math.max(0, grossPay - totalDeductions);

  // 8. Cost Allocation Category (Direct Labor / BTKL vs Operational Expense)
  const isDirectLaborRole = input.costCategory
    ? input.costCategory === "DIRECT_LABOR"
    : ["PRODUCTION", "OPERATOR", "FABRICATION", "MAINTENANCE"].includes(
        String(input.role || "").toUpperCase()
      );

  return {
    username: input.username,
    name: input.name || input.username,
    role: input.role,
    level: input.level,
    costCategory: isDirectLaborRole ? "DIRECT_LABOR" : "OPERATIONAL_EXPENSE",
    basicSalary: basic,
    positionAllowance: posAllow + fixAllow,
    kpiBonus,
    overtimePay,
    overtimeHours: otHours,
    travelAllowance,
    reimbursementAmount: reimburse,
    grossPay,
    absenceDeduction,
    bpjsKesehatanEmployee: bpjsKesEmp,
    bpjsKesehatanEmployer: bpjsKesComp,
    bpjsTKEmpJHT: bpjsJHTEmp,
    bpjsTKEmpJP: bpjsJPEmp,
    bpjsTKTotalEmployee: bpjsTKTotalEmp,
    bpjsTKTotalEmployer: bpjsTKTotalComp,
    totalBPJSEmployeeDeduction: totalBPJSEmp,
    pph21Deduction: pph21,
    otherDeductions: otherDed,
    totalDeductions,
    netPay,
  };
}
