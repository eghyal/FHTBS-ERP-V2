import crypto from "crypto";

export interface WotQrPayload {
  v: number;              // Version (1)
  wot_id: string;         // UUID of WOT
  lot: string;            // Human readable lot number
  prj: string;            // Project code/number
  st: string;             // Station code/name
  proc: string;           // Process name
  mch: string;            // Machine code/name
  qty: number;            // Batch quantity
  ts: string;             // Timestamp ISO
  sig?: string;           // HMAC-SHA256 signature
}

const QR_SECRET_KEY = process.env.QR_SECRET_KEY || "FHTBS_ERP_SECURE_QR_KEY_2026_PRODUCTION";
const ENCRYPTION_KEY = crypto.createHash("sha256").update(QR_SECRET_KEY).digest(); // 32 bytes for AES-256
const IV_LENGTH = 16; // 16 bytes for AES-CBC

/**
 * Generate HMAC-SHA256 signature for WOT payload
 */
export function signWotPayload(payloadWithoutSig: Omit<WotQrPayload, "sig">): string {
  const canonicalString = [
    payloadWithoutSig.v,
    payloadWithoutSig.wot_id,
    payloadWithoutSig.lot,
    payloadWithoutSig.prj,
    payloadWithoutSig.st,
    payloadWithoutSig.proc,
    payloadWithoutSig.mch,
    payloadWithoutSig.qty,
    payloadWithoutSig.ts
  ].join("|");

  return crypto.createHmac("sha256", QR_SECRET_KEY).update(canonicalString).digest("hex");
}

/**
 * Encrypt arbitrary string using AES-256-CBC
 */
export function encryptQrPayload(plainText: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt string using AES-256-CBC
 */
export function decryptQrPayload(cipherText: string): string | null {
  try {
    const parts = cipherText.split(":");
    if (parts.length !== 2) return null;
    const iv = Buffer.from(parts[0], "hex");
    const encryptedText = parts[1];
    const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    return null;
  }
}

/**
 * Generate complete signed WOT QR Payload
 */
export function generateSignedWotQr(data: {
  wot_id: string;
  lot: string;
  prj: string;
  st?: string;
  proc?: string;
  mch?: string;
  qty: number;
  ts?: string;
}): {
  payloadObj: WotQrPayload;
  rawJson: string;
  encryptedQrText: string;
} {
  const payloadWithoutSig: Omit<WotQrPayload, "sig"> = {
    v: 1,
    wot_id: data.wot_id,
    lot: data.lot,
    prj: data.prj,
    st: data.st || "ST-01",
    proc: data.proc || "General",
    mch: data.mch || "MANUAL",
    qty: Number(data.qty) || 1,
    ts: data.ts || new Date().toISOString()
  };

  const sig = signWotPayload(payloadWithoutSig);
  const payloadObj: WotQrPayload = { ...payloadWithoutSig, sig };
  const rawJson = JSON.stringify(payloadObj);
  const encryptedQrText = encryptQrPayload(rawJson);

  return {
    payloadObj,
    rawJson,
    encryptedQrText
  };
}

/**
 * Verify and parse WOT QR Payload from camera scanner or input string
 */
export function verifyAndParseWotQr(rawInput: string): {
  isValid: boolean;
  payload?: WotQrPayload;
  reason?: string;
  isFallbackLot?: boolean;
} {
  if (!rawInput || typeof rawInput !== "string") {
    return { isValid: false, reason: "EMPTY_PAYLOAD" };
  }

  const trimmed = rawInput.trim();

  // Case 1: Encrypted with AES-256-CBC (iv:ciphertext)
  let jsonString = trimmed;
  if (trimmed.includes(":") && !trimmed.startsWith("{")) {
    const decrypted = decryptQrPayload(trimmed);
    if (decrypted) {
      jsonString = decrypted;
    }
  }

  // Case 2: Base64-encoded JSON string
  if (!jsonString.startsWith("{")) {
    try {
      const decoded = Buffer.from(jsonString, "base64").toString("utf8");
      if (decoded.startsWith("{")) {
        jsonString = decoded;
      }
    } catch (_) {}
  }

  // Case 3: Parse JSON
  if (jsonString.startsWith("{")) {
    try {
      const parsed: WotQrPayload = JSON.parse(jsonString);

      if (!parsed.wot_id && !parsed.lot) {
        return { isValid: false, reason: "MALFORMED_PAYLOAD" };
      }

      // Check HMAC signature if present
      if (parsed.sig) {
        const expectedSig = signWotPayload({
          v: parsed.v || 1,
          wot_id: parsed.wot_id,
          lot: parsed.lot,
          prj: parsed.prj,
          st: parsed.st,
          proc: parsed.proc,
          mch: parsed.mch,
          qty: parsed.qty,
          ts: parsed.ts
        });

        if (parsed.sig !== expectedSig) {
          return {
            isValid: false,
            reason: "INVALID_SIGNATURE",
            payload: parsed
          };
        }

        return { isValid: true, payload: parsed };
      } else {
        // Unsigned JSON payload
        return {
          isValid: false,
          reason: "UNSIGNED_PAYLOAD",
          payload: parsed
        };
      }
    } catch (e: any) {
      return { isValid: false, reason: "JSON_PARSE_ERROR" };
    }
  }

  // Case 4: Plain manual lot number entry (e.g. WOT-LOT-001)
  // Permitted as manual operator fallback on kiosk terminal
  return {
    isValid: true,
    isFallbackLot: true,
    payload: {
      v: 1,
      wot_id: "",
      lot: trimmed,
      prj: "",
      st: "",
      proc: "",
      mch: "",
      qty: 0,
      ts: new Date().toISOString()
    }
  };
}
