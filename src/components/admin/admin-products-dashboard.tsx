"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminFeedback, Button, DataTable, Dialog, EmptyState, FilterBar, FilterSelect, LoadingState, PageHeader, SearchInput, Sheet, StatusBadge, TableCell, TableHead, TableHeaderCell, TableRow, formatWhen, productCatalogLabel, productCatalogTone } from "@/components/admin/admin-ui";
import { Money } from "@/components/money";
import type { AdminProductRecord } from "@/lib/services/admin-products";

type ProductFormState = {
  name: string;
  sku: string;
  description: string;
  category: string;
  priceInr: string;
  inventory: string;
  tags: string;
  image: string;
  imageAlt: string;
  attachSku: string;
  attachRate: string;
  active: boolean;
};

const emptyForm: ProductFormState = {
  name: "",
  sku: "",
  description: "",
  category: "",
  priceInr: "",
  inventory: "0",
  tags: "",
  image: "/products/placeholder.png",
  imageAlt: "",
  attachSku: "",
  attachRate: "",
  active: true,
};

function formFromProduct(product: AdminProductRecord): ProductFormState {
  return {
    name: product.name,
    sku: product.sku,
    description: product.description,
    category: product.category,
    priceInr: String(product.price),
    inventory: String(product.inventory),
    tags: product.tags.join(", "),
    image: product.image,
    imageAlt: product.imageAlt,
    attachSku: product.attachSku ?? "",
    attachRate: product.attachRate != null ? String(product.attachRate) : "",
    active: product.active,
  };
}

export function AdminProductsDashboard() {
  const [products, setProducts] = useState<AdminProductRecord[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<AdminProductRecord | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<AdminProductRecord | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (status !== "all") params.set("status", status);
    if (category !== "all") params.set("category", category);
    return params.toString();
  }, [search, status, category]);

  const loadProducts = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/admin/products?${queryString}`, { credentials: "include" });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not load products.");
      }
      const payload = (await response.json()) as {
        products: AdminProductRecord[];
        categories: string[];
      };
      setProducts(payload.products);
      setCategories(payload.categories);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load products.");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    setLoading(true);
    void loadProducts();
  }, [loadProducts]);

  function openCreatePanel() {
    setEditing(null);
    setForm(emptyForm);
    setPanelOpen(true);
    setFeedback(null);
  }

  function openEditPanel(product: AdminProductRecord) {
    setEditing(product);
    setForm(formFromProduct(product));
    setPanelOpen(true);
    setFeedback(null);
  }

  function closePanel() {
    setPanelOpen(false);
    setEditing(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFeedback(null);

    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      description: form.description.trim(),
      category: form.category.trim(),
      priceInr: Number(form.priceInr),
      inventory: Number(form.inventory),
      tags: form.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      image: form.image.trim(),
      imageAlt: form.imageAlt.trim() || form.name.trim(),
      attachSku: form.attachSku.trim() || null,
      attachRate: form.attachRate.trim() ? Number(form.attachRate) : null,
      ...(editing ? { active: form.active } : {}),
    };

    try {
      const response = await fetch(
        editing ? `/api/admin/products/${editing.id}` : "/api/admin/products",
        {
          method: editing ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const body = (await response.json()) as { error?: string; product?: AdminProductRecord };
      if (!response.ok) {
        throw new Error(body.error ?? "Could not save product.");
      }

      setFeedback(editing ? "Product updated." : "Product created.");
      closePanel();
      await loadProducts();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save product.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateProduct(product: AdminProductRecord) {
    setSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Could not deactivate product.");
      }
      setFeedback(`${product.name} deactivated. Historical orders remain intact.`);
      setConfirmDeactivate(null);
      await loadProducts();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not deactivate product.");
    } finally {
      setSaving(false);
    }
  }

  async function activateProduct(product: AdminProductRecord) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not activate product.");
      setFeedback(`${product.name} activated.`);
      await loadProducts();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not activate product.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rf-admin-page">
      <PageHeader
        title="Products"
        description="Manage your merchant catalog. Inactive or zero-inventory products are excluded from agent recommendations immediately."
        actions={
          <Button type="button" onClick={openCreatePanel}>
            Add product
          </Button>
        }
      />

      {feedback ? <AdminFeedback message={feedback} /> : null}
      {error ? <AdminFeedback message={error} variant="error" /> : null}

      <FilterBar>
        <SearchInput
          label="Search"
          value={search}
          onChange={setSearch}
          placeholder="Name, SKU, category, or tag"
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={(value) => setStatus(value as typeof status)}
          options={[
            { value: "all", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
        <FilterSelect
          label="Category"
          value={category}
          onChange={setCategory}
          options={[
            { value: "all", label: "All categories" },
            ...categories.map((item) => ({ value: item, label: item })),
          ]}
        />
      </FilterBar>

      {loading ? (
        <LoadingState label="Loading catalog…" />
      ) : products.length === 0 ? (
        <EmptyState
          title="No products match"
          description="Add a product or adjust search criteria."
        />
      ) : (
        <DataTable>
          <TableHead>
            <tr>
              <TableHeaderCell>Product</TableHeaderCell>
              <TableHeaderCell>SKU</TableHeaderCell>
              <TableHeaderCell>Category</TableHeaderCell>
              <TableHeaderCell className="text-right">Price</TableHeaderCell>
              <TableHeaderCell className="text-right">Stock</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Updated</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </tr>
          </TableHead>
          <tbody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  <div className="flex gap-3">
                    <div className="relative size-10 shrink-0 overflow-hidden rounded-[8px] bg-canvas-2">
                      <Image
                        src={product.image}
                        alt={product.imageAlt}
                        fill
                        className="object-cover"
                        sizes="40px"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">{product.name}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted">{product.description}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                <TableCell className="capitalize">{product.category}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <Money value={product.price} />
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{product.inventory}</TableCell>
                <TableCell>
                  <StatusBadge
                    label={productCatalogLabel(product.active, product.inventory)}
                    tone={productCatalogTone(product.active, product.inventory)}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted">
                  {formatWhen(product.updatedAt)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" onClick={() => openEditPanel(product)}>
                      Edit
                    </Button>
                    {product.active ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setConfirmDeactivate(product)}
                        className="text-danger hover:text-danger"
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button type="button" variant="secondary" onClick={() => void activateProduct(product)}>
                        Activate
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </DataTable>
      )}

      {panelOpen ? (
        <Sheet title={editing ? "Edit product" : "Add product"} onClose={closePanel}>
          <p className="mb-4 text-sm text-muted">
            {editing
              ? "Price and inventory changes apply to future agent decisions."
              : "New products become eligible for recommendations when active and in stock."}
          </p>
            <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span>Name</span>
                  <input
                    required
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    className="min-h-10 rounded-[8px] border border-line/80 bg-canvas/70 px-3"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>SKU</span>
                  <input
                    required
                    disabled={Boolean(editing)}
                    value={form.sku}
                    onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))}
                    className="min-h-10 rounded-[8px] border border-line/80 bg-canvas/70 px-3 disabled:opacity-60"
                  />
                </label>
              </div>

              <label className="grid gap-1 text-sm">
                <span>Description</span>
                <textarea
                  required
                  rows={3}
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  className="rounded-[8px] border border-line/80 bg-canvas/70 px-3 py-2"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-1 text-sm">
                  <span>Category</span>
                  <input
                    required
                    value={form.category}
                    onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                    className="min-h-10 rounded-[8px] border border-line/80 bg-canvas/70 px-3"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Price (INR)</span>
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={form.priceInr}
                    onChange={(event) => setForm((current) => ({ ...current, priceInr: event.target.value }))}
                    className="min-h-10 rounded-[8px] border border-line/80 bg-canvas/70 px-3 font-mono tabular"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Inventory</span>
                  <input
                    required
                    type="number"
                    min="0"
                    step="1"
                    value={form.inventory}
                    onChange={(event) => setForm((current) => ({ ...current, inventory: event.target.value }))}
                    className="min-h-10 rounded-[8px] border border-line/80 bg-canvas/70 px-3 font-mono tabular"
                  />
                </label>
              </div>

              <label className="grid gap-1 text-sm">
                <span>Tags (comma separated)</span>
                <input
                  value={form.tags}
                  onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                  className="min-h-10 rounded-[8px] border border-line/80 bg-canvas/70 px-3"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span>Image URL</span>
                  <input
                    required
                    value={form.image}
                    onChange={(event) => setForm((current) => ({ ...current, image: event.target.value }))}
                    className="min-h-10 rounded-[8px] border border-line/80 bg-canvas/70 px-3"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Image alt text</span>
                  <input
                    value={form.imageAlt}
                    onChange={(event) => setForm((current) => ({ ...current, imageAlt: event.target.value }))}
                    className="min-h-10 rounded-[8px] border border-line/80 bg-canvas/70 px-3"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span>Attach SKU (optional)</span>
                  <input
                    value={form.attachSku}
                    onChange={(event) => setForm((current) => ({ ...current, attachSku: event.target.value }))}
                    className="min-h-10 rounded-[8px] border border-line/80 bg-canvas/70 px-3 font-mono text-xs"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Attach rate (0-1, optional)</span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={form.attachRate}
                    onChange={(event) => setForm((current) => ({ ...current, attachRate: event.target.value }))}
                    className="min-h-10 rounded-[8px] border border-line/80 bg-canvas/70 px-3 font-mono tabular"
                  />
                </label>
              </div>

              {editing ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                  />
                  Product is active in catalog
                </label>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={closePanel}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving}>
                  {editing ? "Save changes" : "Create product"}
                </Button>
              </div>
            </form>
        </Sheet>
      ) : null}

      {confirmDeactivate ? (
        <Dialog
          title="Deactivate product?"
          onClose={() => setConfirmDeactivate(null)}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setConfirmDeactivate(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                loading={saving}
                onClick={() => void deactivateProduct(confirmDeactivate)}
              >
                Deactivate
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink-soft">
            {confirmDeactivate.name} will stop appearing in agent recommendations. Historical orders
            and decisions are preserved.
          </p>
        </Dialog>
      ) : null}
    </div>
  );
}
