"use client";

import { ArrowUpDown, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type Claim, type ClaimStatus, mockClaims } from "@/lib/mock-claims";
import { cn } from "@/lib/utils";

const STATUSES_FILTER: ClaimStatus[] = [
  "drafted",
  "awaiting_approval",
  "queued_for_send",
  "low_confidence",
  "submitted",
  "approved",
  "denied",
  "expired",
  "no_response",
];

function statusBadgeVariant(
  status: ClaimStatus,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "approved":
      return "default";
    case "denied":
    case "expired":
      return "destructive";
    case "submitted":
    case "queued_for_send":
    case "awaiting_approval":
      return "secondary";
    default:
      return "outline";
  }
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function formatClaimType(t: Claim["claimType"]) {
  switch (t) {
    case "chat_script":
      return "Chat script";
    case "in_store":
      return "In store";
    case "self_service":
      return "Self service";
    default:
      return "Email";
  }
}

export default function ClaimsPage() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ClaimStatus | "all">("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mockClaims.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.claimId.toLowerCase().includes(q) ||
        c.platform.toLowerCase().includes(q) ||
        c.productName.toLowerCase().includes(q) ||
        c.windowLabel.toLowerCase().includes(q)
      );
    });
  }, [query, statusFilter]);

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Claims</h1>
        <p className="text-neutral-600 mt-1 text-sm">
          Track drafts, submissions, and outcomes across every monitored purchase.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search claims..."
            aria-label="Search claims"
            className="pl-9"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              buttonVariants({ variant: "outline" }),
              "w-full sm:w-auto justify-between",
            )}
          >
            <ArrowUpDown className="w-4 h-4 mr-2" aria-hidden />
            Status:{" "}
            <span className="font-normal ml-1">
              {statusFilter === "all" ? "All" : statusFilter.replace(/_/g, " ")}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuRadioGroup
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v === "all" ? "all" : (v as ClaimStatus))}
            >
              <DropdownMenuRadioItem value="all">All statuses</DropdownMenuRadioItem>
              {STATUSES_FILTER.map((s) => (
                <DropdownMenuRadioItem key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-neutral-0 overflow-hidden shadow-sm">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[112px]">Claim</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Est. refund</TableHead>
              <TableHead>Window</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-neutral-500">
                  No claims match your filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => (
                <TableRow key={c.claimId}>
                  <TableCell className="font-mono text-xs text-neutral-700">{c.claimId}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-neutral-900">{c.productName}</span>
                      <span className="text-xs text-neutral-500">{c.platform}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-neutral-700 text-sm capitalize">
                    {formatClaimType(c.claimType)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(c.status)}>
                      {c.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(c.amount, c.currency)}
                  </TableCell>
                  <TableCell className="text-neutral-700 text-sm max-w-[220px] whitespace-normal">
                    {c.windowLabel}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      render={<Link href={`/claims/${c.claimId}`} />}
                      size="sm"
                      variant="outline"
                    >
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
