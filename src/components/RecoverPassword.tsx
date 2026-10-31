import { FormEvent, useEffect, useState } from "react";
import { requestPasswordReset, resetPassword, verifyPasswordReset } from "../lib/auth";

type Step = "email" | "code" | "password";

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fieldClass =
  "min-h-12 w-full rounded-2xl border bg-white px-3.5 text-navy-900 outline-none ring-brand-500/25 transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4";

export function RecoverPassword({
  initialEmail,
  onCancel,
  onDone,
}: {
  initialEmail: string;
  onCancel: () => void;
  onDone: (email: string) => void;
}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  async function sendCode() {
    const error = await requestPasswordReset(email.trim());
    if (error) {
      setMessage({ type: "error", text: error });
      return false;
    }
    setMessage({
      type: "success",
      text: `Te enviamos un código de 6 dígitos a ${email.trim()}. Revísalo e escríbelo aquí.`,
    });
    setResendIn(60);
    return true;
  }

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!EMAIL_OK.test(email.trim())) {
      setMessage({ type: "error", text: "Ingresa un correo válido." });
      return;
    }
    setLoading(true);
    const ok = await sendCode();
    setLoading(false);
    if (ok) {
      setCode("");
      setStep("code");
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (code.length !== 6) {
      setMessage({ type: "error", text: "El código debe tener 6 dígitos." });
      return;
    }
    setLoading(true);
    const error = await verifyPasswordReset(email.trim(), code);
    setLoading(false);
    if (error) {
      setMessage({ type: "error", text: error || "El código no coincide con el del correo." });
      return;
    }
    setPassword("");
    setConfirm("");
    setMessage({ type: "success", text: "El código coincide. Ahora puedes cambiar la contraseña." });
    setStep("password");
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (password.length < 8) {
      setMessage({ type: "error", text: "La nueva contraseña debe tener al menos 8 caracteres." });
      return;
    }
    if (password !== confirm) {
      setMessage({ type: "error", text: "Las contraseñas no coinciden." });
      return;
    }
    setLoading(true);
    const error = await resetPassword(email.trim(), code, password);
    setLoading(false);
    if (error) {
      setMessage({ type: "error", text: error });
      return;
    }
    onDone(email.trim());
  }

  async function resend() {
    if (resendIn > 0 || loading) return;
    setMessage(null);
    setLoading(true);
    await sendCode();
    setLoading(false);
  }

  const title =
    step === "email" ? "Recuperar contraseña" : step === "code" ? "Código de verificación" : "Nueva contraseña";
  const subtitle =
    step === "email"
      ? "Escribe el correo de tu cuenta. Te enviamos un código al momento."
      : step === "code"
        ? `Escribe el código que llegó a ${email.trim()}. Si no coincide, no podrás cambiar la contraseña.`
        : "El código coincidió. Elige una contraseña nueva.";

  return (
    <>
      <ol className="mb-6 flex gap-2 text-[0.72rem] font-extrabold uppercase tracking-wide text-slate-400">
        <li className={step === "email" ? "text-brand-600" : "text-slate-400"}>1. Correo</li>
        <li aria-hidden="true">·</li>
        <li className={step === "code" ? "text-brand-600" : "text-slate-400"}>2. Código</li>
        <li aria-hidden="true">·</li>
        <li className={step === "password" ? "text-brand-600" : "text-slate-400"}>3. Contraseña</li>
      </ol>
      <h1 className="font-display text-[1.9rem] font-bold text-navy-900">{title}</h1>
      <p className="mt-2 text-slate-500">{subtitle}</p>

      {step === "email" && (
        <form className="mt-8 grid gap-5" onSubmit={submitEmail} noValidate>
          <div>
            <label className="mb-1.5 block text-[0.9rem] font-bold text-navy-900" htmlFor="recover-email">
              Correo electrónico
            </label>
            <input
              id="recover-email"
              type="email"
              autoComplete="email"
              placeholder="tu@negocio.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={`${fieldClass} border-slate-200`}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="min-h-[50px] appearance-none rounded-2xl bg-brand-600 font-extrabold text-white shadow-brand transition-colors hover:bg-brand-700 hover:text-white active:bg-brand-700 active:text-white disabled:opacity-70"
          >
            {loading ? "Enviando…" : "Enviar código"}
          </button>
          <p className="text-[0.82rem] leading-5 text-slate-500">
            El código sale de <span className="font-semibold text-navy-900">promethixia@gmail.com</span>. Si no se envía, en el back falta una contraseña de aplicación de Gmail (16 letras), no la contraseña de la cuenta.
          </p>
        </form>
      )}

      {step === "code" && (
        <form className="mt-8 grid gap-5" onSubmit={submitCode}>
          <div>
            <label className="mb-1.5 block text-[0.9rem] font-bold text-navy-900" htmlFor="recover-code">
              Código de 6 dígitos
            </label>
            <input
              id="recover-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className={`${fieldClass} border-slate-200 tracking-[0.35em]`}
            />
          </div>
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="min-h-[50px] appearance-none rounded-2xl bg-brand-600 font-extrabold text-white shadow-brand transition-colors hover:bg-brand-700 hover:text-white active:bg-brand-700 active:text-white disabled:opacity-70"
          >
            {loading ? "Comprobando…" : "Verificar código"}
          </button>
          <button
            type="button"
            disabled={loading || resendIn > 0}
            onClick={() => void resend()}
            className="text-[0.9rem] font-semibold text-brand-600 hover:underline disabled:text-slate-400 disabled:no-underline"
          >
            {resendIn > 0 ? `Reenviar código en ${resendIn}s` : "Reenviar código"}
          </button>
        </form>
      )}

      {step === "password" && (
        <form className="mt-8 grid gap-5" onSubmit={submitPassword}>
          <div>
            <label className="mb-1.5 block text-[0.9rem] font-bold text-navy-900" htmlFor="recover-password">
              Nueva contraseña
            </label>
            <div className="relative">
              <input
                id="recover-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${fieldClass} border-slate-200 pr-20`}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl px-2.5 py-1.5 text-[0.8rem] font-bold text-slate-500 hover:bg-slate-100 hover:text-navy-900"
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[0.9rem] font-bold text-navy-900" htmlFor="recover-confirm">
              Confirmar contraseña
            </label>
            <input
              id="recover-confirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className={`${fieldClass} border-slate-200`}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="min-h-[50px] appearance-none rounded-2xl bg-brand-600 font-extrabold text-white shadow-brand transition-colors hover:bg-brand-700 hover:text-white active:bg-brand-700 active:text-white disabled:opacity-70"
          >
            {loading ? "Guardando…" : "Cambiar contraseña"}
          </button>
        </form>
      )}

      {message && (
        <p
          className={`mt-5 rounded-xl border px-4 py-3 text-[0.9rem] ${
            message.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-brand-100 bg-brand-50 text-navy-900"
          }`}
          role={message.type === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}

      <button
        type="button"
        className="mt-6 text-[0.9rem] font-semibold text-slate-500 transition hover:text-navy-900"
        onClick={onCancel}
      >
        ← Volver al inicio de sesión
      </button>
    </>
  );
}
