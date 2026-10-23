import { FormEvent, useState } from "react";
import { BRAND_NAME, DEMO_MAILTO, LANDING_URL, signIn, type UserRole } from "../lib/auth";

function Logo({ tone = "dark", size = 36, textSize = "1.2rem" }: { tone?: "dark" | "light"; size?: number; textSize?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5 font-display font-bold tracking-tight" style={{ fontSize: textSize }}>
      <img
        src="/brand/promethixia-mark.svg"
        alt=""
        width={size}
        height={size}
        className="shrink-0 drop-shadow-[0_6px_14px_rgba(27,110,243,0.35)]"
      />
      <span className={tone === "light" ? "text-white" : "text-navy-900"}>
        Promethix
        <span
          className={`bg-clip-text text-transparent ${
            tone === "light" ? "bg-gradient-to-br from-brand-300 to-brand-500" : "bg-gradient-to-br from-brand-500 to-brand-700"
          }`}
        >
          ia
        </span>
      </span>
    </span>
  );
}

export function LoginScreen({ onSuccess }: { onSuccess: (email: string, role: UserRole) => void }) {
  const year = new Date().getFullYear();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const emailInvalid = touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordInvalid = touched.password && password.length < 6;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setTouched({ email: true, password: true });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || password.length < 6) return;

    setLoading(true);
    const result = await signIn(email.trim(), password, remember);
    setLoading(false);

    if (result.error || !result.email || !result.role) {
      setMessage({ type: "error", text: result.error ?? "No pudimos iniciar sesión. Intenta de nuevo." });
      return;
    }

    onSuccess(result.email, result.role);
  }

  return (
    <div className="grid min-h-dvh animate-fade font-body lg:grid-cols-[1fr_1.05fr]">
      <aside className="mesh-navy relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col">
        <span className="aurora-orb -bottom-16 -right-10 size-80 bg-cyan-400/35" />
        <span className="aurora-orb top-10 left-8 size-52 bg-brand-400/40" style={{ animationDelay: "1.2s" }} />
        {LANDING_URL ? (
          <a className="relative w-fit" href={LANDING_URL} aria-label={`${BRAND_NAME} - Inicio`}>
            <Logo tone="light" size={40} textSize="1.3rem" />
          </a>
        ) : (
          <span className="relative w-fit">
            <Logo tone="light" size={40} textSize="1.3rem" />
          </span>
        )}

        <div className="relative my-auto max-w-[30rem] animate-rise">
          <p className="mb-4 text-[0.72rem] font-extrabold uppercase tracking-[0.28em] text-cyan-300">POS inteligente</p>
          <h2 className="font-display text-[clamp(1.8rem,2.8vw,2.55rem)] font-bold leading-tight">
            Tu negocio, claro y bajo control.
          </h2>
          <p className="mt-4 text-white/70">Ventas, inventario, clientes y facturación en un solo lugar, con IA que te ayuda a decidir.</p>
          <div className="mt-8 rounded-3xl border border-white/15 bg-white/8 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl" aria-hidden="true">
            <span className="text-[0.72rem] font-bold uppercase tracking-wide text-cyan-200">Asistente IA</span>
            <p className="mt-2 text-[0.95rem] text-blue-50">Las ventas aumentaron un 14% esta semana. Te recomiendo reponer arroz y gaseosas.</p>
          </div>
        </div>

        <p className="relative text-[0.8rem] text-white/50">© {year} {BRAND_NAME}</p>
      </aside>

      <main className="app-canvas relative flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <span className="lg:invisible">
            <Logo size={34} textSize="1.1rem" />
          </span>
          {LANDING_URL ? (
            <a className="text-[0.9rem] font-semibold text-slate-500 transition hover:text-navy-900" href={LANDING_URL}>
              ← Volver al inicio
            </a>
          ) : (
            <span />
          )}
        </div>

        <div className="glass-panel mx-auto my-auto w-full max-w-[420px] animate-rise rounded-[1.75rem] p-7 sm:p-8">
          <img
            src="/brand/promethixia-mark.svg"
            alt=""
            width={56}
            height={56}
            className="mb-6 drop-shadow-[0_10px_24px_rgba(27,110,243,0.35)]"
          />
          <h1 className="font-display text-[1.9rem] font-bold text-navy-900">Iniciar sesión</h1>
          <p className="mt-2 text-slate-500">Ingresa con la cuenta de tu negocio.</p>

          <form className="mt-8 grid gap-5" onSubmit={submit} noValidate>
            <div>
              <label className="mb-1.5 block text-[0.9rem] font-bold text-navy-900" htmlFor="email">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="tu@negocio.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => setTouched((current) => ({ ...current, email: true }))}
                aria-invalid={emailInvalid}
                aria-describedby="email-error"
                className={`min-h-12 w-full rounded-2xl border bg-white px-3.5 text-navy-900 outline-none ring-brand-500/25 transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 ${
                  emailInvalid ? "border-rose-400" : "border-slate-200"
                }`}
              />
              {emailInvalid && (
                <p id="email-error" className="mt-1.5 text-[0.82rem] font-semibold text-rose-600">
                  Ingresa un correo válido.
                </p>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[0.9rem] font-bold text-navy-900" htmlFor="password">
                  Contraseña
                </label>
                <a className="text-[0.85rem] font-semibold text-brand-600 hover:underline" href="mailto:promethixia@gmail.com?subject=Recuperar%20contrase%C3%B1a">
                  ¿Olvidaste tu contraseña?
                </a>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onBlur={() => setTouched((current) => ({ ...current, password: true }))}
                  aria-invalid={passwordInvalid}
                  aria-describedby="password-error"
                  className={`min-h-12 w-full rounded-2xl border bg-white px-3.5 pr-20 text-navy-900 outline-none ring-brand-500/25 transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 ${
                    passwordInvalid ? "border-rose-400" : "border-slate-200"
                  }`}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl px-2.5 py-1.5 text-[0.8rem] font-bold text-slate-500 hover:bg-slate-100 hover:text-navy-900"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              {passwordInvalid && (
                <p id="password-error" className="mt-1.5 text-[0.82rem] font-semibold text-rose-600">
                  La contraseña debe tener al menos 6 caracteres.
                </p>
              )}
            </div>

            <label className="inline-flex w-fit cursor-pointer items-center gap-2.5 text-[0.9rem] text-slate-500">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="size-4 accent-brand-600"
              />
              Mantener sesión iniciada
            </label>

            <button
              type="submit"
              disabled={loading}
              className="min-h-[50px] rounded-2xl bg-gradient-to-br from-brand-400 via-brand-600 to-brand-700 font-extrabold text-white shadow-brand transition hover:-translate-y-0.5 hover:brightness-110 disabled:translate-y-0 disabled:opacity-70"
            >
              {loading ? "Ingresando…" : "Ingresar"}
            </button>

            {message && (
              <p
                className={`rounded-xl border px-4 py-3 text-[0.9rem] ${
                  message.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-brand-100 bg-brand-50 text-navy-900"
                }`}
                role={message.type === "error" ? "alert" : "status"}
              >
                {message.text}
              </p>
            )}
          </form>

          <p className="mt-8 text-center text-[0.9rem] text-slate-500">
            ¿Aún no eres cliente?{" "}
            <a className="font-bold text-brand-600 hover:underline" href={DEMO_MAILTO}>
              Pide tu prueba gratis de 15 días
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
