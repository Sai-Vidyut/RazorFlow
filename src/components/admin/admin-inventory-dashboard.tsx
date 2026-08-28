"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminProductRecord } from "@/lib/services/admin-products";
import {
  AdminFeedback,
  Badge,
  DataTable,
  EmptyState,
  FilterBar,
  FilterSelect,
  LoadingState,
  PageHeader,
  SearchInput,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/admin/admin-ui";
import { Money } from "@/components/money";
import { DEFAULT_LOW_STOCK_THRESHOLD } from "@/lib/services/admin-dashboard";

function stockTone(product: AdminProductRecord): "success" | "warning" | "danger" | "neutral" {
  if (!product.active) return "neutral";
  if (product.inventory === 0) return "danger";
  if (product.inventory <= DEFAULT_LOW_STOCK_THRESHOLD) return "warning";
  return "success";
}

function stockLabel(product: AdminProductRecord): string {
  if (!product.active) return "Inactive";
  if (product.inventory === 0) return "Out of stock";
  if (product.inventory <= DEFAULT_LOW_STOCK_THRESHOLD) return "Low stock";
  return "In stock";
}

export function AdminInventoryDashboard() {
  const [products, setProducts] = useState<AdminProductRecord[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [stock, setStock] = useState<"all" | "in" | "low" | "out">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (status !== "all") params.set("status", status);
    return params.toString();
  }, [search, status]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/products?${queryString}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load inventory.");
      const payload = (await response.json()) as { products: AdminProductRecord[] };
      setProducts(payload.products);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load inventory.");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return products.filter((product) => {
      if (stock === "in") return product.active && product.inventory > DEFAULT_LOW_STOCK_THRESHOLD;
      if (stock === "low")
        return product.active && product.inventory > 0 && product.inventory <= DEFAULT_LOW_STOCK_THRESHOLD;
      if (stock === "out") return product.active && product.inventory === 0;
      return true;
    });
  }, [products, stock]);

  async function updateInventory(product: AdminProductRecord, inventory: number) {
    setSavingId(product.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventory }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not update inventory.");
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update inventory.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="rf-admin-page">
      <PageHeader
        title="Inventory"
        description="Stock levels for your active catalog. Changes apply immediately to buyer desk availability."
      />

      {error ? <AdminFeedback message={error} variant="error" /> : null}

      <FilterBar>
        <div className="min-w-[220px] flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder="Search SKU or product name" label="Search inventory" />
        </div>
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All products" },
            { value: "active", label: "Active only" },
            { value: "inactive", label: "Inactive only" },
          ]}
        />
        <FilterSelect
          label="Stock"
          value={stock}
          onChange={setStock}
          options={[
            { value: "all", label: "All stock levels" },
            { value: "in", label: "In stock" },
            { value: "low", label: "Low stock" },
            { value: "out", label: "Out of stock" },
          ]}
        />
      </FilterBar>

      {loading ? (
        <LoadingState label="Loading inventory…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No inventory records match"
          description="Products appear here once they exist in your catalog. Add products or adjust filters."
        />
      ) : (
        <DataTable>
          <TableHead>
            <tr>
              <TableHeaderCell>Product</TableHeaderCell>
              <TableHeaderCell>SKU</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Stock</TableHeaderCell>
              <TableHeaderCell>Units</TableHeaderCell>
              <TableHeaderCell>Price</TableHeaderCell>
            </tr>
          </TableHead>
          <tbody>
            {filtered.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  <p className="font-medium" translate="no">
                    {product.name}
                  </p>
                  <p className="text-xs text-muted">{product.category}</p>
                </TableCell>
                <TableCell>
                  <code className="font-mono text-xs">{product.sku}</code>
                </TableCell>
                <TableCell>
                  <Badge tone={stockTone(product)}>{stockLabel(product)}</Badge>
                </TableCell>
                <TableCell className="tabular">{product.inventory}</TableCell>
                <TableCell>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={product.inventory}
                    disabled={savingId === product.id}
                    aria-label={`Inventory for ${product.name}`}
                    className="rf-input w-24 min-h-9 rounded-[8px] border border-line/80 bg-surface px-2 py-1 text-sm font-mono tabular"
                    onBlur={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isInteger(next) && next >= 0 && next !== product.inventory) {
                        void updateInventory(product, next);
                      }
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Money value={product.price} />
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
