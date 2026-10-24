export function ScreenFallback() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="size-9 rounded-full border-2 border-brand-200 border-t-brand-600" style={{ animation: "spin 0.6s linear infinite" }} />
    </div>
  );
}
