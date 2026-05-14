"use client";

import { ArrowUpDown, Hotel, Plane, Search, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
import {
  getPurchasesForListView,
  type Purchase,
  type PurchaseCategory,
} from "@/lib/mock-purchases";
import { cn } from "@/lib/utils";

function categoryIcon(cat: PurchaseCategory) {
  switch (cat) {
    case "airline":
      return <Plane className="w-4 h-4" aria-hidden />;
    case "hotel":
      return <Hotel className="w-4 h-4" aria-hidden />;
    default:
      return <ShoppingBag className="w-4 h-4" aria-hidden />;
  }
}

function statusBadgeTone(status: Purchase["status"]) {
  if (status === "approved") return "default" as const;
  if (status === "window ending soon") return "destructive" as const;
  if (status === "submitted" || status === "claim drafted") return "secondary" as const;
  return "outline" as const;
}

export default function PurchasesPage() {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<PurchaseCategory | "all">("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return getPurchasesForListView().filter((p) => {
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.purchaseId.toLowerCase().includes(q) ||
        p.platform.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q)
      );
    });
  }, [categoryFilter, query]);

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Purchases</h1>
        <p className="text-neutral-600 mt-1 text-sm">
          Every receipt we monitor — see status, timelines, and what needs action.
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
            placeholder="Search purchases..."
            aria-label="Search purchases"
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
            Category:{" "}
            <span className="font-normal ml-1">
              {categoryFilter === "all" ? "All" : categoryFilter}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuRadioGroup
              value={categoryFilter}
              onValueChange={(v) =>
                setCategoryFilter(v === "all" ? "all" : (v as PurchaseCategory))
              }
            >
              <DropdownMenuRadioItem value="all">All categories</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="retail">Retail</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="airline">Airline</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="hotel">Hotel</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-neutral-0 overflow-hidden shadow-sm">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[120px]">Purchase</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Window</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-neutral-500">
                  No purchases match your filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((p) => (
                <TableRow key={p.purchaseId}>
                  <TableCell className="font-mono text-xs text-neutral-700">
                    {p.purchaseId}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-neutral-900">{p.title}</span>
                      <span className="text-xs text-neutral-500">{p.platform}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="inline-flex items-center gap-2 text-neutral-700 text-sm capitalize">
                      {categoryIcon(p.category)}
                      {p.category}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeTone(p.status)}>{p.status}</Badge>
                  </TableCell>
                  <TableCell className="text-neutral-700 text-sm max-w-[240px] whitespace-normal">
                    {p.windowRemaining}
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
