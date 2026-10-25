import Image from "next/image";

export function NovaAvatar({ className = "" }: { className?: string }) {
  return (
    <span className={`mb-0.5 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface ${className}`}>
      <Image src="/bott.jpeg" alt="Nova" width={36} height={36} className="size-full object-cover" />
    </span>
  );
}
