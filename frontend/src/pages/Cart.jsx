import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { getCart, removeCartItem, updateCartItem } from "../api/shop";
import ProductPrice from "../components/ProductPrice";
import { Button, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { formatCurrency, productImage } from "../lib/formatters";
import { useAuthStore } from "../store/authStore";

export default function Cart() {
  const loggedIn = Boolean(useAuthStore((state) => state.accessToken));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["cart"],
    queryFn: getCart,
    enabled: loggedIn,
  });
  const remove = useMutation({
    mutationFn: removeCartItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cart"] }),
  });
  const update = useMutation({
    mutationFn: ({ uid, quantity }) => updateCartItem(uid, quantity),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cart"] }),
  });
  const data = query.data?.items || [];
  const subtotal = query.data?.subtotal || 0;
  if (query.isLoading) return <CartSkeleton />;
  if (query.isError)
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <ErrorState onRetry={query.refetch} />
      </div>
    );
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <ShoppingBag className="text-brand-600" />
        <h1 className="text-2xl font-bold">Your cart</h1>
      </div>
      {!data.length ? (
        <div className="mt-8">
          <EmptyState
            title="Your cart is empty"
            description="Find something you love and it will show up here."
            action={
              <Link to="/products">
                <Button>Continue shopping</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            {data.map((item) => (
              <div
                key={item.uid}
                className="flex gap-3 rounded-card border border-line bg-white p-3 sm:gap-5 sm:p-4"
              >
                <img
                  src={productImage(item.product)}
                  alt=""
                  width="96"
                  height="96"
                  className="h-24 w-24 rounded-lg bg-slate-100 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold">
                    {item.product_title}
                  </p>
                  <ProductPrice
                    price={item.unit_price}
                    mrp={item.product?.mrp}
                    className="mt-1 text-sm"
                  />
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex h-9 items-center rounded-lg border border-line">
                      <button
                        aria-label="Decrease"
                        disabled={item.quantity <= 1}
                        onClick={() =>
                          update.mutate({
                            uid: item.uid,
                            quantity: item.quantity - 1,
                          })
                        }
                        className="grid h-9 w-8 place-items-center disabled:opacity-40"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-8 text-center text-sm">
                        {item.quantity}
                      </span>
                      <button
                        aria-label="Increase"
                        onClick={() =>
                          update.mutate({
                            uid: item.uid,
                            quantity: item.quantity + 1,
                          })
                        }
                        className="grid h-9 w-8 place-items-center"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <button
                      aria-label={`Remove ${item.product_title}`}
                      onClick={() => remove.mutate(item.uid)}
                      className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <p className="hidden max-w-full self-center break-words text-right text-sm font-bold tabular-nums [overflow-wrap:anywhere] sm:block">
                  {formatCurrency(item.line_total)}
                </p>
              </div>
            ))}
          </div>
          <aside className="h-fit rounded-card border border-line bg-white p-5 lg:sticky lg:top-24">
            <h2 className="font-bold">Price details</h2>
            <div className="mt-5 flex justify-between text-sm text-muted">
              <span>Subtotal</span>
              <span className="max-w-[55%] break-words text-right tabular-nums [overflow-wrap:anywhere]">{formatCurrency(subtotal)}</span>
            </div>
            <div className="mt-3 flex justify-between text-sm text-muted">
              <span>Delivery</span>
              <span className="font-medium text-emerald-600">FREE</span>
            </div>
            <div className="my-5 h-px bg-line" />
            <div className="flex justify-between font-bold">
              <span>Total</span>
              <span className="max-w-[55%] break-words text-right tabular-nums [overflow-wrap:anywhere]">{formatCurrency(subtotal)}</span>
            </div>
            <Button
              className="mt-5 w-full"
              onClick={() =>
                navigate(loggedIn ? "/checkout" : "/account?next=/checkout")
              }
            >
              Proceed to checkout
            </Button>
            {!loggedIn && (
              <p className="mt-3 text-center text-xs text-muted">
                Sign in to complete your order
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
function CartSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-8 h-28 w-full" />
    </div>
  );
}
