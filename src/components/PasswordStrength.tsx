import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PasswordChecks {
  length: boolean;
  uppercase: boolean;
  special: boolean;
}

export const evaluatePassword = (pwd: string): PasswordChecks => ({
  length: pwd.length >= 6 && pwd.length <= 10,
  uppercase: /[A-Z]/.test(pwd),
  special: /[^A-Za-z0-9]/.test(pwd),
});

export const isPasswordValid = (pwd: string) => {
  const c = evaluatePassword(pwd);
  return c.length && c.uppercase && c.special;
};

interface Props {
  password: string;
}

export const PasswordStrength = ({ password }: Props) => {
  const checks = evaluatePassword(password);
  const score = [checks.length, checks.uppercase, checks.special].filter(Boolean).length;

  const barColor =
    score === 0
      ? "bg-white/15"
      : score === 1
        ? "bg-red-400"
        : score === 2
          ? "bg-amber-400"
          : "bg-emerald-400";

  const label =
    score === 0 ? "" : score === 1 ? "Fraca" : score === 2 ? "Média" : "Forte";

  const Item = ({ ok, text }: { ok: boolean; text: string }) => (
    <div className="flex items-center gap-1.5">
      {ok ? (
        <Check className="h-3 w-3 text-emerald-400 shrink-0" />
      ) : (
        <X className="h-3 w-3 text-white/40 shrink-0" />
      )}
      <span className={cn("text-[10px] leading-tight", ok ? "text-emerald-300" : "text-white/55")}>
        {text}
      </span>
    </div>
  );

  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className={cn("h-full transition-all duration-300", barColor)}
            style={{ width: `${(score / 3) * 100}%` }}
          />
        </div>
        {label && (
          <span className="text-[10px] font-semibold text-white/70 w-10 text-right">{label}</span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-0.5">
        <Item ok={checks.length} text="Entre 6 e 10 caracteres" />
        <Item ok={checks.uppercase} text="Pelo menos 1 letra maiúscula" />
        <Item ok={checks.special} text="Pelo menos 1 caractere especial (!@#...)" />
      </div>
    </div>
  );
};
