import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { addAddress, checkout, getAddresses, getCart } from "../api/shop";
import { BackLink } from "../components/Page";
import { Button, EmptyState, Input, Select } from "../components/ui";
import { formatCurrency } from "../lib/formatters";
import { getErrorMessage } from "../lib/errors";
import { setLastAddressUid } from "../lib/addressStorage";
import { useAuthStore } from "../store/authStore";
import { Check, Info } from "lucide-react";

const PHONE_REGEX = /^[6-9]\d{9}$/;
const PINCODE_REGEX = /^\d{6}$/;

export default function Checkout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showAddress, setShowAddress] = useState(false);
  const [error, setError] = useState("");
  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: getAddresses,
  });
  const cart = useQuery({ queryKey: ["cart"], queryFn: getCart });
  const addForm = useForm({ defaultValues: { payment_method: "cod" } });
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = addForm;
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const addressMutation = useMutation({
    mutationFn: addAddress,
    onSuccess: (data) => {
      queryClient.setQueryData(["addresses"], (current = []) => {
        const withoutDuplicate = current.filter(
          (address) => address.uid !== data.uid
        );
        return data.is_default
          ? [
              data,
              ...withoutDuplicate.map((address) => ({
                ...address,
                is_default: false,
              })),
            ]
          : [...withoutDuplicate, data];
      });
      addForm.reset({ payment_method: "cod", address_id: data.uid });
      setLastAddressUid(data.uid);
      setSelectedAddressId(data.uid);
      setValue("address_id", data.uid, { shouldValidate: true });
      setShowAddress(false);
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
    },
  });
  const order = useMutation({
    mutationFn: checkout,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-products"] });
      navigate(`/orders/${data.uid}/success`, { state: { order: data } });
    },
    onError: (e) => setError(getErrorMessage(e)),
  });
  const list = useMemo(() => addresses.data ?? [], [addresses.data]);
  useEffect(() => {
    if (!list.length) {
      setSelectedAddressId(null);
      if (addresses.isSuccess) {
        setShowAddress(true);
      }
      return;
    }

    const selectedStillExists = list.some(
      (address) => address.uid === selectedAddressId
    );
    const nextAddress =
      list.find((address) => address.uid === selectedAddressId) ||
      list.find((address) => address.is_default) ||
      list[0];
    if (!selectedStillExists || !selectedAddressId) {
      setSelectedAddressId(nextAddress.uid);
      setValue("address_id", nextAddress.uid, { shouldValidate: true });
    }
  }, [addresses.isSuccess, list, selectedAddressId, setValue]);
  if (!useAuthStore.getState().accessToken)
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <EmptyState
          title="Sign in to checkout"
          action={
            <Button onClick={() => navigate("/account?next=/checkout")}>
              Sign in
            </Button>
          }
        />
      </div>
    );
  const total = cart.data?.subtotal || 0;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <BackLink to="/cart" />
      <h1 className="text-2xl font-bold">Checkout</h1>
      <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-5">
          <div className="rounded-card border border-line bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">1. Delivery address</h2>
              <button
                type="button"
                onClick={() => setShowAddress((v) => !v)}
                className="text-sm font-semibold text-brand-600"
              >
                {showAddress ? "Cancel" : "+ Add new"}
              </button>
            </div>
            {!list.length && !addresses.isLoading && (
              <div
                role="status"
                aria-live="polite"
                className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4"
              >
                <p className="font-semibold text-amber-900">
                  Add a delivery address to continue
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  We need your address before we can place your order. It will
                  be saved securely for your future checkouts.
                </p>
                {!showAddress && (
                  <Button
                    type="button"
                    variant="soft"
                    className="mt-3"
                    onClick={() => setShowAddress(true)}
                  >
                    Add delivery address
                  </Button>
                )}
              </div>
            )}
            {showAddress && (
              <form
                onSubmit={handleSubmit((data) => addressMutation.mutate(data))}
                className="mt-5 grid gap-3 sm:grid-cols-2"
              >
                <Input
                  label="Name"
                  error={errors.name?.message}
                  {...register("name", { required: "Required" })}
                />
                <Input
                  label="Phone"
                  error={errors.phone?.message}
                  inputMode="numeric"
                  {...register("phone", {
                    required: "Required",
                    pattern: {
                      value: PHONE_REGEX,
                      message: "Enter a valid 10-digit phone number",
                    },
                  })}
                />
                <Input
                  label="Address line 1"
                  error={errors.line1?.message}
                  className="sm:col-span-2"
                  {...register("line1", { required: "Required" })}
                />
                <Input label="Address line 2" {...register("line2")} />
                <Input
                  label="City"
                  error={errors.city?.message}
                  {...register("city", { required: "Required" })}
                />
                <Input
                  label="State"
                  error={errors.state?.message}
                  {...register("state", { required: "Required" })}
                />
                <Input
                  label="Pincode"
                  error={errors.pincode?.message}
                  inputMode="numeric"
                  {...register("pincode", {
                    required: "Required",
                    pattern: {
                      value: PINCODE_REGEX,
                      message: "Enter a valid 6-digit pincode",
                    },
                  })}
                />
                <label className="sm:col-span-2 flex items-center gap-2 cursor-pointer text-sm font-medium text-ink select-none py-1">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-line accent-brand-600 cursor-pointer"
                    {...register("is_default")}
                  />
                  Make this my default address
                </label>
                <Button
                  loading={addressMutation.isPending}
                  className="sm:col-span-2"
                >
                  Save address
                </Button>
                {addressMutation.isError && (
                  <p
                    role="alert"
                    className="sm:col-span-2 text-sm font-medium text-red-600"
                  >
                    {getErrorMessage(addressMutation.error)}
                  </p>
                )}
              </form>
            )}
            {!showAddress && (
              <div className="mt-5 space-y-3">
                {list.map((address) => {
                  const isSelected = selectedAddressId === address.uid;
                  return (
                    <label
                      key={address.uid}
                      className={[
                        "flex cursor-pointer gap-3 rounded-xl border p-4 transition-all duration-200",
                        isSelected
                          ? "border-brand-500 bg-brand-50/25 ring-1 ring-brand-300 shadow-sm"
                          : "border-line bg-white hover:border-slate-300",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        value={address.uid}
                        {...register("address_id", { required: true })}
                        checked={isSelected}
                        onChange={() => {
                          setSelectedAddressId(address.uid);
                          setValue("address_id", address.uid, {
                            shouldValidate: true,
                          });
                        }}
                        className="mt-1 h-4 w-4 accent-brand-600 cursor-pointer"
                      />
                      <div className="min-w-0 flex-1 text-sm leading-relaxed">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-ink text-base">
                            {address.name}
                          </span>
                          <span className="text-sm font-medium text-slate-600">
                            {address.phone}
                          </span>
                          {address.is_default && (
                            <span className="inline-flex items-center rounded bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-700 border border-brand-200">
                              DEFAULT
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-slate-600 leading-relaxed">
                          {address.line1}
                          {address.line2 && `, ${address.line2}`}
                        </p>
                        <p className="text-slate-600 leading-relaxed">
                          {address.city}, {address.state} &mdash;{" "}
                          <span className="font-semibold text-ink">
                            {address.pincode}
                          </span>
                        </p>
                        {isSelected && (
                          <div className="mt-2.5 flex items-center justify-between border-t border-brand-100 pt-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700">
                              <Check size={13} className="text-brand-600" /> Deliver to this address
                            </span>
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
                {!list.length && (
                  <p className="text-sm text-muted">
                    Add a delivery address to continue.
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="rounded-card border border-line bg-white p-5">
            <h2 className="font-bold">2. Payment method</h2>
            <div className="mt-4 space-y-2">
              <label className="flex cursor-pointer gap-3 rounded-lg border border-line p-3">
                <input
                  type="radio"
                  value="cod"
                  defaultChecked
                  {...register("payment_method")}
                />
                <span className="text-sm">
                  <b>Cash on Delivery</b>
                  <br />
                  <span className="text-muted">
                    Pay when your order arrives
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer gap-3 rounded-lg border border-line p-3">
                <input
                  type="radio"
                  value="online_mock"
                  {...register("payment_method")}
                />
                <span className="text-sm">
                  <b>Pay online</b>
                  <br />
                  <span className="text-muted">
                    Demo payment for development
                  </span>
                </span>
              </label>
            </div>
          </div>
        </section>
        <aside className="h-fit rounded-card border border-line bg-white p-5 lg:sticky lg:top-24">
          <h2 className="font-bold">Order summary</h2>
          <div className="mt-5 flex justify-between text-sm text-muted">
            <span>{cart.data?.items?.length || 0} items</span>
            <span className="max-w-[55%] break-words text-right tabular-nums [overflow-wrap:anywhere]">{formatCurrency(total)}</span>
          </div>
          <div className="my-5 h-px bg-line" />
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span className="max-w-[55%] break-words text-right tabular-nums [overflow-wrap:anywhere]">{formatCurrency(total)}</span>
          </div>
          {error && (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          {!list.length && (
            <p className="mt-4 text-center text-xs text-muted">
              Place order becomes available after you add a delivery address.
            </p>
          )}

          {/* ── Cancellation policy notice ── */}
          <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-900">
            <Info size={15} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-xs leading-relaxed">
              <span className="font-semibold">Cancellation window:</span> You can cancel this order until a seller ships it.
            </p>
          </div>

          <Button
            className="mt-4 w-full"
            loading={order.isPending}
            disabled={!list.length}
            title={!list.length ? "Add a delivery address first" : undefined}
            onClick={handleSubmit((data) =>
              order.mutate({
                payload: data,
                idempotencyKey: crypto.randomUUID(),
              }),
            )}
          >
            Place order
          </Button>
        </aside>
      </div>
    </div>
  );
}
