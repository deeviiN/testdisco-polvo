import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

type Step = {
  key: "welcome" | "login" | "app";
  label: string;
  path: string;
  matches: (pathname: string) => boolean;
};

interface Props {
  className?: string;
}

const AppBreadcrumbs = ({ className = "" }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const schoolParam = searchParams.get("school");
  const schoolQS = schoolParam ? `?school=${schoolParam}` : "";

  const steps: Step[] = [
    {
      key: "welcome",
      label: "Welcome",
      path: `/${schoolQS}`,
      matches: (p) => p === "/" || p === "/welcome",
    },
    {
      key: "login",
      label: "Login",
      path: `/auth${schoolQS}`,
      matches: (p) => p.startsWith("/auth"),
    },
  ];

  const activeIndex = Math.max(
    0,
    steps.findIndex((s) => s.matches(location.pathname))
  );

  return (
    <nav
      aria-label="Navegação"
      className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${className}`}
    >
      {steps.map((step, i) => {
        const isActive = i === activeIndex;
        return (
          <div key={step.key} className="flex items-center gap-1.5">
            {isActive ? (
              <span
                aria-current="page"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-amber-400/90 text-[hsl(220,60%,12%)] shadow-md"
              >
                {step.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => navigate(step.path)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/10 text-white/85 hover:bg-white/20 backdrop-blur-sm border border-white/20 transition-colors"
              >
                {step.label}
              </button>
            )}
            {i < steps.length - 1 && <span className="text-white/50">›</span>}
          </div>
        );
      })}
    </nav>
  );
};

export default AppBreadcrumbs;
