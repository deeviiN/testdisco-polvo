import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ReqIdCopyButtonProps {
  reqId: string;
}

/** Small inline pill that shows a reqId and copies it on click. */
export function ReqIdCopyButton({ reqId }: ReqIdCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reqId);
      setCopied(true);
      toast.success(`reqId copiado: ${reqId}`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="h-6 px-2 gap-1 font-mono text-[11px] inline-flex items-center align-middle"
      title="Copiar reqId para buscar nos logs"
    >
      <span>reqId: {reqId}</span>
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

/**
 * Splits a string on `reqId: <id>` matches and returns parts so callers can
 * render the copy button inline.
 */
export function renderWithReqIdButtons(text: string): Array<string | { reqId: string }> {
  const re = /reqId:\s*([A-Za-z0-9_-]{4,})/g;
  const out: Array<string | { reqId: string }> = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) out.push(text.slice(lastIndex, m.index));
    out.push({ reqId: m[1] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

/**
 * Walks React children and replaces any string segment matching `reqId: xxx`
 * with an inline copy button. Use as a wrapper around ReactMarkdown children.
 */
import type { ReactNode } from "react";
import { Children, Fragment, isValidElement, cloneElement } from "react";

export function withReqIdButtons(children: ReactNode): ReactNode {
  return Children.map(children, (child, idx) => {
    if (typeof child === "string") {
      const parts = renderWithReqIdButtons(child);
      if (parts.length === 1 && typeof parts[0] === "string") return child;
      return (
        <Fragment key={idx}>
          {parts.map((p, i) =>
            typeof p === "string" ? (
              <Fragment key={i}>{p}</Fragment>
            ) : (
              <ReqIdCopyButton key={i} reqId={p.reqId} />
            ),
          )}
        </Fragment>
      );
    }
    if (isValidElement(child)) {
      const el = child as React.ReactElement<{ children?: ReactNode }>;
      if (el.props?.children !== undefined) {
        return cloneElement(el, { children: withReqIdButtons(el.props.children) });
      }
    }
    return child;
  });
}

