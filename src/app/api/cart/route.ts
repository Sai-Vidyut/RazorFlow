import { NextResponse } from "next/server";
import {
  addToCart,
  CartError,
  clearCart,
  cartToPublic,
  getCartForSession,
  removeCartLine,
  updateCartLineQuantity,
} from "@/lib/services/cart";

type CartBody = {
  sessionId?: string;
  sku?: string;
  lineId?: string;
  quantity?: number;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId")?.trim();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const cart = await getCartForSession(sessionId);
    return NextResponse.json({ cart: cartToPublic(cart) });
  } catch (error) {
    if (error instanceof CartError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/cart failed:", error);
    return NextResponse.json({ error: "Could not load cart" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CartBody;
    const sessionId = body.sessionId?.trim();
    const sku = body.sku?.trim();
    const quantity = body.quantity ?? 1;

    if (!sessionId || !sku) {
      return NextResponse.json({ error: "sessionId and sku are required" }, { status: 400 });
    }

    const cart = await addToCart(sessionId, sku, quantity);
    return NextResponse.json({ cart: cartToPublic(cart) });
  } catch (error) {
    if (error instanceof CartError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/cart failed:", error);
    return NextResponse.json({ error: "Could not update cart" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as CartBody;
    const sessionId = body.sessionId?.trim();
    const lineId = body.lineId?.trim();
    const quantity = body.quantity;

    if (!sessionId || !lineId || quantity == null) {
      return NextResponse.json({ error: "sessionId, lineId, and quantity are required" }, { status: 400 });
    }

    const cart = await updateCartLineQuantity(sessionId, lineId, quantity);
    return NextResponse.json({ cart: cartToPublic(cart) });
  } catch (error) {
    if (error instanceof CartError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("PATCH /api/cart failed:", error);
    return NextResponse.json({ error: "Could not update cart" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as CartBody & { clear?: boolean };
    const sessionId = body.sessionId?.trim();

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    if (body.clear) {
      const cart = await clearCart(sessionId);
      return NextResponse.json({ cart: cartToPublic(cart) });
    }

    const lineId = body.lineId?.trim();
    if (!lineId) {
      return NextResponse.json({ error: "lineId or clear is required" }, { status: 400 });
    }

    const cart = await removeCartLine(sessionId, lineId);
    return NextResponse.json({ cart: cartToPublic(cart) });
  } catch (error) {
    if (error instanceof CartError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("DELETE /api/cart failed:", error);
    return NextResponse.json({ error: "Could not update cart" }, { status: 500 });
  }
}
