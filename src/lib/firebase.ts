import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { initializeFirestore, type Firestore } from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";
import { getStorage, type FirebaseStorage } from "firebase/storage";

/**
 * Firebase configuration is fully environment-driven.
 *
 * Client (Vite build):  VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN,
 *                       VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET,
 *                       VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID,
 *                       VITE_FIREBASE_FIRESTORE_DATABASE_ID
 * Server (Node/tsx):    the same keys without the VITE_ prefix are also read
 *                       as a fallback (e.g. FIREBASE_API_KEY).
 *
 * No credentials are hardcoded in the repository anymore (previously embedded
 * via the Google AI Studio generated firebase-applet-config.json).
 */
const readEnv = (key: string): string => {
  try {
    // Vite injects import.meta.env at build/dev time on the client bundle.
    const viteEnv = (import.meta as any)?.env;
    if (viteEnv && typeof viteEnv[key] === "string" && viteEnv[key]) {
      return viteEnv[key];
    }
  } catch {
    /* import.meta.env unavailable outside Vite */
  }
  if (typeof process !== "undefined" && process.env) {
    return process.env[key] || "";
  }
  return "";
};

const readConfigValue = (baseKey: string): string =>
  readEnv(`VITE_${baseKey}`) || readEnv(baseKey);

const firebaseConfig = {
  apiKey: readConfigValue("FIREBASE_API_KEY"),
  authDomain: readConfigValue("FIREBASE_AUTH_DOMAIN"),
  projectId: readConfigValue("FIREBASE_PROJECT_ID"),
  storageBucket: readConfigValue("FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: readConfigValue("FIREBASE_MESSAGING_SENDER_ID"),
  appId: readConfigValue("FIREBASE_APP_ID"),
  firestoreDatabaseId: readConfigValue("FIREBASE_FIRESTORE_DATABASE_ID"),
};

/** True when the minimum viable Firebase configuration is present. */
export const isFirebaseConfigured: boolean = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

let app: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let storageInstance: FirebaseStorage | null = null;

if (isFirebaseConfigured) {
  app = getApps().length > 0 ? getApp() : initializeApp({
    apiKey: firebaseConfig.apiKey,
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId,
  });

  firestoreInstance = initializeFirestore(
    app,
    { experimentalAutoDetectLongPolling: true },
    firebaseConfig.firestoreDatabaseId || "(default)",
  );
  authInstance = getAuth(app);
  storageInstance = getStorage(app);
} else if (typeof console !== "undefined") {
  console.warn(
    "[Firebase] Configuration env vars are not set. Cloud sync, realtime listeners, and Firebase auth are disabled.",
  );
}

/**
 * Guards that throw a descriptive error only when Firebase is actually used
 * without configuration. Call sites that must degrade gracefully should check
 * `isFirebaseConfigured` first.
 */
const notConfigured = (service: string): never => {
  throw new Error(
    `[Firebase] ${service} requested but Firebase is not configured. ` +
      `Set the FIREBASE_* / VITE_FIREBASE_* environment variables to enable it.`,
  );
};

export const firebaseApp: FirebaseApp = new Proxy({} as FirebaseApp, {
  get: (_t, prop) => (app ? (app as any)[prop] : notConfigured("Firebase App")),
});

export const firestore: Firestore = new Proxy({} as Firestore, {
  get: (_t, prop) =>
    firestoreInstance ? (firestoreInstance as any)[prop] : notConfigured("Firestore"),
});

export const auth: Auth = new Proxy({} as Auth, {
  get: (_t, prop) => (authInstance ? (authInstance as any)[prop] : notConfigured("Firebase Auth")),
});

export const storage: FirebaseStorage = new Proxy({} as FirebaseStorage, {
  get: (_t, prop) =>
    storageInstance ? (storageInstance as any)[prop] : notConfigured("Firebase Storage"),
});
