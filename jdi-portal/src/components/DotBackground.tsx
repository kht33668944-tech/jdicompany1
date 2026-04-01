export default function DotBackground() {
  return (
    <div
      className="fixed inset-0 z-0 opacity-[0.35]"
      style={{
        backgroundImage: "radial-gradient(#94a3b8 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }}
    />
  );
}
