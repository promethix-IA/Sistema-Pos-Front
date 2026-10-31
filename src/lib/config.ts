const configured =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "/api" : "https://sistema-pos-back.onrender.com");

export const API_URL = configured.replace(/\/$/, "");
