interface BrandMarkProps {
  size?: "small" | "large";
  inverse?: boolean;
}

export default function BrandMark({ size = "small", inverse = false }: BrandMarkProps) {
  const dimensions = size === "large" ? "h-14 w-14 rounded-[18px]" : "h-9 w-9 rounded-xl";

  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center ${dimensions} ${
        inverse ? "bg-[#e8bc66] text-[#163a30]" : "bg-[#173b30] text-[#e8bc66]"
      }`}
    >
      <svg viewBox="0 0 40 40" fill="none" className={size === "large" ? "h-9 w-9" : "h-6 w-6"}>
        <path d="M10 8.5h19l-7 7H17v9h12v7H10V8.5Z" fill="currentColor" />
        <path d="M22 15.5h8v7h-8z" fill="currentColor" opacity=".62" />
      </svg>
    </span>
  );
}
