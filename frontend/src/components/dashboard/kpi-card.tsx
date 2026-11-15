import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function KpiCard({
  label,
  value,
  icon: Icon,
  href,
  highlight,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  href?: string;
  highlight?: boolean;
}) {
  const content = (
    <Card
      className={`h-full transition-colors ${
        href ? "hover:bg-muted/50" : ""
      } ${highlight ? "border-destructive/40 bg-destructive/5" : ""}`}
    >
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p
            className={`mt-2 text-3xl font-semibold tabular-nums ${
              highlight ? "text-destructive" : ""
            }`}
          >
            {value.toLocaleString("fr-FR")}
          </p>
        </div>
        <span
          className={`rounded-lg p-2 ${
            highlight
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary"
          }`}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </CardContent>
      {href && (
        <div className="sr-only">
          Voir {label.toLocaleLowerCase("fr-FR")}
        </div>
      )}
      {href && (
        <ArrowUpRight
          className="absolute right-4 bottom-4 size-4 text-muted-foreground"
          aria-hidden="true"
        />
      )}
    </Card>
  );

  return href ? (
    <Link
      href={href}
      className="relative block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Voir ${label.toLocaleLowerCase("fr-FR")} : ${value}`}
    >
      {content}
    </Link>
  ) : (
    content
  );
}
