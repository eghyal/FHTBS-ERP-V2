import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useEffect } from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  value: string | number | undefined | null,
): string {
  if (value === undefined || value === null || value === "") return "";
  const stringValue =
    typeof value === "number" ? value.toString() : value.replace(/[^\d]/g, "");
  if (!stringValue) return "";
  return stringValue.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function parseCurrency(value: string): number {
  return Number(value.replace(/,/g, ""));
}

export function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onEscape]);
}

/**
 * Standardized formatting utilities for IDR currency and Indonesian number standards.
 */

export const formatIDR = (
  amount: number | string | null | undefined,
): string => {
  const value = typeof amount === "string" ? parseFloat(amount) : amount || 0;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(value || 0)
    .replace(/^Rp\s*/, "Rp\u00A0")
    .replace(/\s+/g, "\u00A0");
};

export const formatIDRWithDecimals = (
  amount: number | string | null | undefined,
  decimals = 2,
): string => {
  const value = typeof amount === "string" ? parseFloat(amount) : amount || 0;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
    .format(value || 0)
    .replace(/^Rp\s*/, "Rp\u00A0")
    .replace(/\s+/g, "\u00A0");
};

export const parseRawNumber = (formattedValue: string): number => {
  if (!formattedValue) return 0;
  return parseFloat(formattedValue.replace(/[^\d]/g, "")) || 0;
};

export const formatNumberWithDots = (val: string | number): string => {
  const strVal = String(val).replace(/[^\d]/g, "");
  if (!strVal) return "";
  return strVal.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};
