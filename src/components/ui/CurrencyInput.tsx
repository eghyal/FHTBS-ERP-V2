import React from "react";

interface CurrencyInputProps {
  value: number | string;
  onChange: (val: number) => void;
  placeholder?: string;
  className?: string;
  prefix?: string;
  disabled?: boolean;
}

export const formatThousand = (num: number | string | undefined | null): string => {
  if (num === undefined || num === null || num === "") return "";
  const cleanStr = String(num).replace(/\D/g, "");
  if (!cleanStr) return "";
  return new Intl.NumberFormat("id-ID").format(Number(cleanStr));
};

export const parseThousand = (formattedStr: string): number => {
  if (typeof formattedStr === "number") return formattedStr;
  const cleanStr = String(formattedStr).replace(/\D/g, "");
  return cleanStr ? Number(cleanStr) : 0;
};

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onChange,
  placeholder = "0",
  className = "",
  prefix = "Rp ",
  disabled = false,
}) => {
  const displayValue = formatThousand(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawText = e.target.value;
    const parsedNum = parseThousand(rawText);
    onChange(parsedNum);
  };

  return (
    <div className={`relative flex items-center ${className}`}>
      {prefix && (
        <span className="absolute left-2.5 text-stone-400 font-mono text-[11px] font-bold pointer-events-none select-none">
          {prefix}
        </span>
      )}
      <input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        className={`w-full ${prefix ? "pl-8" : "px-2.5"} pr-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono font-bold text-stone-900 focus:bg-white focus:border-brand outline-none transition-all disabled:opacity-50`}
      />
    </div>
  );
};
