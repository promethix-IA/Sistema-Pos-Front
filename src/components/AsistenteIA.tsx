import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { UserRole } from "../lib/auth";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS: Record<string, string[]> = {
  owner: ["¿Cuánto vendí hoy?", "¿Qué productos se están agotando?", "¿Quién me debe más?", "¿Cómo voy este mes frente al pasado?"],
  administrador: ["¿Cuánto vendí hoy?", "¿Qué productos se están agotando?", "¿Quién me debe más?", "¿Cómo voy este mes frente al pasado?"],
  cajero: ["¿Cuánto llevo vendido en el turno?", "¿Cuánto efectivo debería haber en caja?", "¿Quién tiene créditos pendientes?"],
  inventario: ["¿Qué productos están agotados?", "¿Qué tiene stock bajo?", "¿Qué no se ha vendido en 30 días?"],
};

/** Negritas (**texto**) dentro de una línea. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={index} className="font-bold text-navy-900">{part.slice(2, -2)}</strong>
      : <Fragment key={index}>{part}</Fragment>,
  );
}

/** Texto plano con viñetas "- " y negritas. Nunca HTML del modelo. */
function Formatted({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-1 list-disc space-y-0.5 pl-5">
        {bullets.map((item, index) => <li key={index}>{inline(item)}</li>)}
      </ul>,
    );
    bullets = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flush();
    if (line) blocks.push(<p key={`p-${blocks.length}`} className="my-1">{inline(line.replace(/^#+\s*/, ""))}</p>);
  }
  flush();
  return <>{blocks}</>;
}

function RobotIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v3" />
      <circle cx="12" cy="2.5" r="0.5" fill="currentColor" />
      <rect x="4" y="6" width="16" height="12" rx="3.5" />
      <path d="M2 11v3M22 11v3" />
      <circle cx="9" cy="11.5" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="15" cy="11.5" r="1.25" fill="currentColor" stroke="none" />
      <path d="M9.5 15h5" />
      <path d="M9 18v2.5M15 18v2.5" />
    </svg>
  );
}

export function AsistenteIA({ role }: { role: UserRole }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (role === "admin") return null;

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: question.slice(0, 1000) }];
    setMessages(next);
    setDraft("");
    setError(null);
    setLoading(true);
    try {
      const { reply } = await api<{ reply: string }>("/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ messages: next.slice(-12) }),
      });
      setMessages(current => [...current, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos responder. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const suggestions = SUGGESTIONS[role] ?? SUGGESTIONS.owner;

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label="Asistente de datos"
          className="animate-rise fixed inset-x-3 bottom-20 z-50 flex max-h-[min(72dvh,620px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-[var(--surface)] shadow-card sm:inset-x-auto sm:right-5 sm:w-[400px]"
        >
          <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
            <span className="grid size-9 place-items-center rounded-2xl bg-brand-600 text-white"><RobotIcon className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold text-navy-900">Asistente de datos</p>
              <p className="text-xs text-slate-500">Pregunta por ventas, stock, caja o créditos</p>
            </div>
            {messages.length > 0 && (
              <button type="button" onClick={() => { setMessages([]); setError(null); }} className="rounded-xl px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-navy-900">
                Nueva
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar asistente" className="grid size-8 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-navy-900">
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>

          <div ref={listRef} className="min-h-[220px] flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm leading-relaxed" aria-live="polite">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-slate-600">Hola. Respondo con los datos reales de tu negocio. Prueba con:</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map(item => (
                    <button key={item} type="button" onClick={() => void send(item)} className="rounded-2xl border border-brand-200 bg-brand-50 px-3 py-1.5 text-left text-xs font-semibold text-brand-700 hover:bg-brand-100">
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message, index) =>
              message.role === "user" ? (
                <div key={index} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-600 px-3 py-2 text-white">
                  {message.content}
                </div>
              ) : (
                <div key={index} className="mr-auto max-w-[92%] rounded-2xl rounded-bl-md bg-slate-100 px-3 py-1.5 text-slate-700">
                  <Formatted text={message.content} />
                </div>
              ),
            )}
            {loading && (
              <div className="mr-auto flex w-fit gap-1 rounded-2xl rounded-bl-md bg-slate-100 px-3 py-3" aria-label="Pensando">
                {[0, 1, 2].map(dot => (
                  <span key={dot} className="size-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${dot * 120}ms` }} />
                ))}
              </div>
            )}
            {error && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
          </div>

          <form
            className="flex items-end gap-2 border-t border-slate-200 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              maxLength={1000}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
              placeholder="Escribe tu pregunta…"
              aria-label="Pregunta para el asistente"
              className="max-h-28 min-h-10 flex-1 resize-none rounded-2xl border border-slate-200 bg-[var(--surface)] px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-400"
            />
            <button
              type="submit"
              disabled={loading || !draft.trim()}
              aria-label="Enviar"
              className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-600 text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" /></svg>
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        aria-label={open ? "Cerrar asistente" : "Abrir asistente de datos"}
        aria-expanded={open}
        className="fixed bottom-4 right-4 z-50 grid size-13 place-items-center rounded-full bg-brand-600 text-white shadow-brand transition-transform hover:scale-105 hover:bg-brand-700 sm:right-5"
      >
        <RobotIcon className="size-6" />
      </button>
    </>
  );
}
