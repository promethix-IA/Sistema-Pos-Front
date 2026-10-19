const configured = import.meta.env.VITE_API_URL || "https://sistema-pos-back.onrender.com";

export const API_URL = configured.replace(/\/$/, "");
