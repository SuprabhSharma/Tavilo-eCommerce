import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import {
  login,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  signup,
  verifyEmail,
} from "../api/auth";
import { Button, Input, PasswordInput } from "../components/ui";
import { brand } from "../config/brand";
import { getErrorMessage } from "../lib/errors";
import { useAuthStore } from "../store/authStore";

export function AuthLayout({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mx-auto flex w-32 items-center">
          <img
            src={brand.logo}
            alt={brand.logoAlt}
            className="h-auto w-full object-contain"
          />
        </Link>
        <div className="mt-8 rounded-card border border-line bg-white p-6 shadow-card sm:p-8">
          {children}
        </div>
        <p className="mt-5 text-center text-xs text-muted">
          By continuing, you agree to our terms and privacy policy.
        </p>
      </div>
    </div>
  );
}
export function Login() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setSession = useAuthStore((state) => state.setSession);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm();
  const [error, setError] = useState("");
  const submit = async (data) => {
    try {
      setError("");
      const session = await login(data);
      queryClient.clear();
      setSession(session);
      const next = search.get("next");
      navigate(
        next ||
          (session.user?.role === "admin"
            ? "/admin"
            : session.user?.role === "vendor"
              ? "/vendor"
              : "/"),
      );
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };
  return (
    <AuthLayout>
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-2 text-sm text-muted">
        Your gateway to shopping, selling, and managing you business.
      </p>
      <form onSubmit={handleSubmit(submit)} className="mt-6 space-y-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email", { required: "Email is required" })}
        />
        <PasswordInput
          label="Password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password", { required: "Password is required" })}
        />
        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <Button className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
      <div className="mt-5 flex justify-between text-sm">
        <Link to="/forgot-password" className="font-semibold text-brand-600">
          Forgot password?
        </Link>
        <Link
          to={`/signup${search.get("next") ? `?next=${search.get("next")}` : ""}`}
          className="font-semibold text-brand-600"
        >
          Create account
        </Link>
      </div>
    </AuthLayout>
  );
}
export function Signup() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm();
  const [error, setError] = useState("");
  const submit = async (data) => {
    try {
      setError("");
      await signup(data);
      navigate("/check-email", { state: { email: data.email } });
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };
  return (
    <AuthLayout>
      <h1 className="text-2xl font-bold">Create your account</h1>
      <p className="mt-2 text-sm text-muted">Join Tavilo in under a minute.</p>
      <form onSubmit={handleSubmit(submit)} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="First name"
            error={errors.first_name?.message}
            {...register("first_name", { required: "Required" })}
          />
          <Input
            label="Last name"
            error={errors.last_name?.message}
            {...register("last_name", { required: "Required" })}
          />
        </div>
        <Input
          label="Username"
          error={errors.username?.message}
          {...register("username", {
            required: "Required",
            minLength: { value: 3, message: "At least 3 characters" },
          })}
        />
        <Input
          label="Email"
          type="email"
          error={errors.email?.message}
          {...register("email", { required: "Required" })}
        />
        <PasswordInput
          label="Password"
          error={errors.password?.message}
          {...register("password", {
            required: "Required",
            minLength: { value: 6, message: "At least 6 characters" },
          })}
        />
        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <Button className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link
          to={`/login${search.get("next") ? `?next=${search.get("next")}` : ""}`}
          className="font-semibold text-brand-600"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
export function VerifyEmail() {
  const { token: tokenFromPath } = useParams();
  const location = useLocation();
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("ready");
  const [error, setError] = useState("");

  useEffect(() => {
    const tokenFromFragment = new URLSearchParams(location.hash.slice(1)).get(
      "token",
    );
    const verificationToken = tokenFromFragment || tokenFromPath;

    if (!verificationToken) {
      setError("This verification link is incomplete. Request a new verification email.");
      setStatus("error");
      return;
    }

    setToken(verificationToken);
    // Existing emailed links used a path token. Remove either form from the
    // address bar before making a request, preventing referrer/history leaks.
    window.history.replaceState(null, "", "/verify-email");
  }, [location.hash, tokenFromPath]);

  const submit = async () => {
    try {
      setError("");
      setStatus("loading");
      await verifyEmail(token);
      setToken("");
      setStatus("done");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setStatus("error");
    }
  };

  return (
    <AuthLayout>
      <div className="text-center">
        {status === "loading" && (
          <LoaderCircle
            className="mx-auto animate-spin text-brand-600"
            size={36}
          />
        )}
        {status === "done" && (
          <CheckCircle2 className="mx-auto text-emerald-600" size={40} />
        )}
        {status === "error" && (
          <>
            <p className="text-red-600">{error}</p>
            <Link
              to="/check-email"
              className="mt-5 inline-block text-sm font-semibold text-brand-600"
            >
              Request a new verification email
            </Link>
          </>
        )}
        <h1 className="mt-5 text-xl font-bold">
          {status === "ready"
            ? "Verify your email"
            : status === "done"
            ? "Account created and email verified"
            : status === "loading"
              ? "Verifying your email…"
              : "Verification failed"}
        </h1>
        {status === "ready" && (
          <>
            <p className="mt-2 text-sm leading-6 text-muted">
              Confirm that you want to verify this email address. This link can
              only be used once.
            </p>
            <Button className="mt-5" onClick={submit}>
              Verify email address
            </Button>
          </>
        )}
        {status === "done" && (
          <Link
            to="/login"
            className="mt-5 inline-block text-sm font-semibold text-brand-600"
          >
            Continue to sign in
          </Link>
        )}
      </div>
    </AuthLayout>
  );
}

export function CheckEmail() {
  const location = useLocation();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm({ defaultValues: { email: location.state?.email || "" } });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async ({ email }) => {
    try {
      setError("");
      await resendVerification(email);
      setSent(true);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  return (
    <AuthLayout>
      <div className="text-center">
        <CheckCircle2 className="mx-auto text-brand-600" size={40} />
        <h1 className="mt-5 text-xl font-bold">Check your email</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Your Tavilo account is not created yet. Open the verification link to
          finish creating it before signing in.
        </p>
      </div>

      <form onSubmit={handleSubmit(submit)} className="mt-6 space-y-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          {...register("email", { required: "Email is required" })}
        />
        {sent && (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            If a pending signup exists, a fresh verification link is on its way.
          </p>
        )}
        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <Button className="w-full" loading={isSubmitting}>
          Resend verification email
        </Button>
      </form>

      <Link
        to="/login"
        className="mt-5 block text-center text-sm font-semibold text-brand-600"
      >
        Back to sign in
      </Link>
    </AuthLayout>
  );
}
export function ForgotPassword() {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm();
  const [sent, setSent] = useState(false);
  const submit = async ({ email }) => {
    await requestPasswordReset(email);
    setSent(true);
  };
  return (
    <AuthLayout>
      {sent ? (
        <div className="text-center">
          <CheckCircle2 className="mx-auto text-emerald-600" size={40} />
          <h1 className="mt-5 text-xl font-bold">Check your inbox</h1>
          <p className="mt-2 text-sm text-muted">
            If an account exists for that email, a reset link is on its way.
          </p>
          <Link
            to="/login"
            className="mt-5 inline-block text-sm font-semibold text-brand-600"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="mt-2 text-sm text-muted">
            Enter your email and we’ll send instructions.
          </p>
          <form onSubmit={handleSubmit(submit)} className="mt-6 space-y-4">
            <Input
              label="Email"
              type="email"
              {...register("email", { required: true })}
            />
            <Button className="w-full" loading={isSubmitting}>
              Send reset link
            </Button>
          </form>
          <Link
            to="/login"
            className="mt-5 block text-center text-sm font-semibold text-brand-600"
          >
            Back to sign in
          </Link>
        </>
      )}
    </AuthLayout>
  );
}
export function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm();
  const [error, setError] = useState("");
  const submit = async (data) => {
    try {
      await resetPassword(token, {
        new_password: data.password,
        confirm_new_password: data.confirm,
      });
      navigate("/login?reset=1");
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };
  return (
    <AuthLayout>
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      <form onSubmit={handleSubmit(submit)} className="mt-6 space-y-4">
        <PasswordInput
          label="New password"
          {...register("password", { required: true, minLength: 6 })}
        />
        <PasswordInput
          label="Confirm password"
          {...register("confirm", { required: true })}
        />
        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <Button className="w-full" loading={isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
