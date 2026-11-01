import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  MapPin,
  PenLine,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button, ErrorState, Input, Skeleton } from "../components/ui";
import { getErrorMessage } from "../lib/errors";
import { setLastAddressUid } from "../lib/addressStorage";
import {
  addAddress,
  deleteAddress,
  getAddresses,
  setDefaultAddress,
  updateAddress,
} from "../api/shop";

const PHONE_REGEX = /^[6-9]\d{9}$/;
const PINCODE_REGEX = /^\d{6}$/;

const FIELDS = [
  { name: "name", label: "Full name", required: true, half: false },
  {
    name: "phone",
    label: "Phone",
    required: true,
    half: true,
    pattern: { value: PHONE_REGEX, message: "Enter a valid 10-digit phone" },
  },
  { name: "line1", label: "Address line 1", required: true, half: false },
  { name: "line2", label: "Address line 2", required: false, half: true },
  { name: "city", label: "City", required: true, half: true },
  { name: "state", label: "State", required: true, half: true },
  {
    name: "pincode",
    label: "Pincode",
    required: true,
    half: true,
    pattern: { value: PINCODE_REGEX, message: "Enter a valid 6-digit pincode" },
  },
];

function AddressForm({ defaultValues, onSubmit, onCancel, isPending }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm({
    defaultValues: {
      ...defaultValues,
      is_default: defaultValues?.is_default ?? !defaultValues?.uid,
    },
  });
  const firstInputRef = useRef(null);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  const isEditing = Boolean(defaultValues?.uid);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="grid gap-3 sm:grid-cols-2"
      noValidate
    >
      {FIELDS.map((field, idx) => (
        <div
          key={field.name}
          className={field.half ? "" : "sm:col-span-2"}
        >
          <Input
            label={field.label}
            error={errors[field.name]?.message}
            ref={idx === 0 ? firstInputRef : undefined}
            {...register(field.name, {
              required: field.required ? "Required" : false,
              pattern: field.pattern,
            })}
          />
        </div>
      ))}
      <label className="sm:col-span-2 flex items-center gap-2 cursor-pointer text-sm font-medium text-ink select-none py-1">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-line accent-brand-600 cursor-pointer"
          {...register("is_default")}
        />
        Remember this address for future orders
      </label>
      <div className="sm:col-span-2 flex gap-3 pt-2">
        <Button type="submit" loading={isPending} className="flex-1">
          {isEditing ? "Update address" : "Save address"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            reset();
            onCancel();
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
  isDeleting,
  isSettingDefault,
}) {
  const isDefault = Boolean(address.is_default);

  return (
    <div
      className={[
        "relative rounded-xl border bg-white p-4 transition-all duration-200",
        isDefault
          ? "border-brand-500 ring-1 ring-brand-300 shadow-sm"
          : "border-line hover:border-slate-300",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <label
          className="mt-0.5 cursor-pointer flex items-center justify-center p-0.5"
          title={isDefault ? "Remembered address" : "Click to remember this address"}
        >
          <input
            type="radio"
            name="remembered_address_selector"
            checked={isDefault}
            onChange={() => onSetDefault(address.uid)}
            disabled={isSettingDefault || isDefault}
            className="h-4 w-4 accent-brand-600 cursor-pointer"
          />
        </label>
        <div className="min-w-0 flex-1 text-sm leading-relaxed">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-ink">{address.name}</p>
            {isDefault && (
              <span className="inline-flex items-center gap-1 text-xs text-brand-700 font-medium">
                <Check size={12} className="text-brand-600" /> Remembered
              </span>
            )}
          </div>
          <p className="mt-0.5 text-muted">
            {address.line1}
            {address.line2 && `, ${address.line2}`}
          </p>
          <p className="text-muted">
            {address.city}, {address.state} &mdash; {address.pincode}
          </p>
          <p className="mt-0.5 text-xs text-muted">{address.phone}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5">
        {isDefault ? (
          <span className="text-xs text-muted">Primary address</span>
        ) : (
          <button
            type="button"
            onClick={() => onSetDefault(address.uid)}
            disabled={isSettingDefault}
            className="text-xs font-medium text-muted hover:text-brand-600 transition-colors disabled:opacity-50"
          >
            Remember this address
          </button>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onEdit(address)}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-ink transition-colors"
          >
            <PenLine size={13} /> Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(address.uid)}
            disabled={isDeleting}
            className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function Collapse({ open, children }) {
  return (
    <div
      className={[
        "overflow-hidden transition-all duration-300 ease-in-out",
        open ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0",
      ].join(" ")}
    >
      <div className="pt-4">{children}</div>
    </div>
  );
}

function DeleteConfirmModal({ onConfirm, onCancel, loading, error }) {
  const containerRef = useRef(null);
  const cancelBtnRef = useRef(null);

  useEffect(() => {
    cancelBtnRef.current?.focus();
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !loading) {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [loading, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-address-title"
        aria-describedby="delete-address-description"
        className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl animate-[dialog-in_0.2s_ease-out]"
      >
        <div className="flex items-start justify-between">
          <h3 id="delete-address-title" className="text-base font-bold text-ink">
            Delete address?
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            aria-label="Close delete confirmation"
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-ink transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>
        <p id="delete-address-description" className="mt-2 text-sm text-muted">
          This address will be removed from your saved list.
        </p>
        <div className="mt-5 flex gap-3">
          <Button
            type="button"
            variant="danger"
            loading={loading}
            className="flex-1"
            onClick={onConfirm}
          >
            Delete
          </Button>
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-xs font-medium text-red-600">
            {getErrorMessage(error)}
          </p>
        )}
      </div>
    </div>
  );
}

export default function Addresses() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const topRef = useRef(null);

  const {
    data: list = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["addresses"],
    queryFn: getAddresses,
    staleTime: 30000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["addresses"] });

  const addMut = useMutation({
    mutationFn: addAddress,
    onSuccess: (data) => {
      invalidate();
      setShowAdd(false);
      if (data.is_default || list.length === 0) setLastAddressUid(data.uid);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ uid, payload }) => updateAddress(uid, payload),
    onSuccess: (data) => {
      invalidate();
      setEditingAddress(null);
      if (data.is_default) setLastAddressUid(data.uid);
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteAddress,
    onSuccess: () => {
      invalidate();
      setDeletingId(null);
    },
  });

  const setDefaultMut = useMutation({
    mutationFn: setDefaultAddress,
    onSuccess: (data) => {
      invalidate();
      setLastAddressUid(data.uid);
    },
  });

  useEffect(() => {
    if ((showAdd || editingAddress) && topRef.current) {
      topRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showAdd, editingAddress]);

  const openAdd = () => {
    setEditingAddress(null);
    setShowAdd(true);
  };
  const openEdit = (addr) => {
    setShowAdd(false);
    setEditingAddress(addr);
  };
  const closeForm = () => {
    setShowAdd(false);
    setEditingAddress(null);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link
        to="/account"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft size={15} /> Back to account
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Saved addresses</h1>
          <p className="mt-1 text-sm text-muted">
            Manage your delivery addresses and preferences
          </p>
        </div>
        <Button onClick={openAdd} className="shrink-0" aria-label="Add new address">
          <Plus size={15} /> Add new
        </Button>
      </div>

      <div ref={topRef}>
        <Collapse open={showAdd && !editingAddress}>
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-ink">New address</h2>
              <button
                onClick={closeForm}
                className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-ink transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <AddressForm
              onSubmit={(values) => addMut.mutate(values)}
              onCancel={closeForm}
              isPending={addMut.isPending}
            />
            {addMut.isError && (
              <p className="mt-3 text-xs text-red-600 font-medium">
                {getErrorMessage(addMut.error)}
              </p>
            )}
          </div>
        </Collapse>
      </div>

      {isLoading && (
        <div className="mt-6 space-y-3">
          {[1, 2].map((k) => (
            <Skeleton key={k} className="h-28" />
          ))}
        </div>
      )}

      {isError && (
        <div className="mt-6">
          <ErrorState onRetry={refetch} message={getErrorMessage(error)} />
        </div>
      )}

      {!isLoading && !isError && (
        <div className="mt-6 space-y-3">
          {list.length === 0 && !showAdd && (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-line bg-white py-16 text-center">
              <MapPin size={32} className="mb-3 text-slate-300" />
              <p className="font-semibold text-ink">No addresses yet</p>
              <p className="mt-1 text-sm text-muted">
                Add an address to speed up checkout
              </p>
              <Button className="mt-5" onClick={openAdd}>
                <Plus size={14} /> Add address
              </Button>
            </div>
          )}
          {list.map((item) => (
            <div key={item.uid}>
              <AddressCard
                address={item}
                onEdit={openEdit}
                onDelete={setDeletingId}
                onSetDefault={setDefaultMut.mutate}
                isDeleting={deleteMut.isPending && deletingId === item.uid}
                isSettingDefault={setDefaultMut.isPending}
              />
              <Collapse open={editingAddress?.uid === item.uid}>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 mt-2">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-semibold text-ink">Edit address</h2>
                    <button
                      onClick={closeForm}
                      className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-ink transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {editingAddress?.uid === item.uid && (
                    <AddressForm
                      defaultValues={editingAddress}
                      onSubmit={(payload) =>
                        updateMut.mutate({ uid: editingAddress.uid, payload })
                      }
                      onCancel={closeForm}
                      isPending={updateMut.isPending}
                    />
                  )}
                  {updateMut.isError && (
                    <p className="mt-3 text-xs text-red-600 font-medium">
                      {getErrorMessage(updateMut.error)}
                    </p>
                  )}
                </div>
              </Collapse>
            </div>
          ))}
        </div>
      )}

      {deletingId && (
        <DeleteConfirmModal
          loading={deleteMut.isPending}
          error={deleteMut.error}
          onConfirm={() => deleteMut.mutate(deletingId)}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}
