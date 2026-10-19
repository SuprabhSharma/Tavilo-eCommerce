import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { addAddress, checkout, getAddresses, getCart } from "../api/shop";
import { BackLink } from "../components/Page";
import { Button, EmptyState, Input, Select } from "../components/ui";
import { formatCurrency } from "../lib/formatters";
import { getErrorMessage } from "../lib/errors";
import { useAuthStore } from "../store/authStore";

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
  const addForm = useForm();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = addForm;
  const addressMutation = useMutation({
    mutationFn: addAddress,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
      setShowAddress(false);
      addForm.reset();
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
  const list = addresses.data || [];
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
                onClick={() => setShowAddress((v) => !v)}
                className="text-sm font-semibold text-brand-600"
              >
                {showAddress ? "Cancel" : "+ Add new"}
              </button>
            </div>
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
                  {...register("phone", { required: "Required" })}
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
                  {...register("pincode", { required: "Required" })}
                />
                <Button
                  loading={addressMutation.isPending}
                  className="sm:col-span-2"
                >
                  Save address
                </Button>
              </form>
            )}
            {!showAddress && (
              <div className="mt-5 space-y-2">
                {list.map((address) => (
                  <label
                    key={address.uid}
                    className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
                  >
                    <input
                      type="radio"
                      value={address.uid}
                      defaultChecked={address.is_default || list.length === 1}
                      {...register("address_id", { required: true })}
                    />
                    <span className="text-sm">
                      <b>{address.name}</b>
                      <br />
                      {address.line1}, {address.city}, {address.state} —{" "}
                      {address.pincode}
                      <br />
                      <span className="text-muted">{address.phone}</span>
                    </span>
                  </label>
                ))}
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
            <span>{formatCurrency(total)}</span>
          </div>
          <div className="my-5 h-px bg-line" />
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
          {error && (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <Button
            className="mt-5 w-full"
            loading={order.isPending}
            disabled={!list.length}
            onClick={handleSubmit((data) => order.mutate(data))}
          >
            Place order
          </Button>
        </aside>
      </div>
    </div>
  );
}
