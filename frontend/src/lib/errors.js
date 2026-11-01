const messages = {
  invalid_email_or_password: "The email or password is incorrect.",
  user_exists: "An account with this email already exists.",
  invalid_verification_token:
    "This verification link is invalid or expired. Request a new verification email.",
  account_not_verified: "Please verify your email before continuing.",
  insufficient_permissions: "You do not have access to this area.",
  product_not_found: "That product is no longer available.",
  invalid_token: "Your session has expired. Please sign in again.",
  server_error: "Something went wrong on our side. Please try again.",
};

const validationMessage = (detail) => {
  if (!Array.isArray(detail)) return null;

  const firstError = detail[0];
  if (typeof firstError === "string") return firstError;
  if (!firstError || typeof firstError !== "object") return null;

  const location = Array.isArray(firstError.loc)
    ? firstError.loc.filter((part) => part !== "body").join(" > ")
    : "";
  const message = typeof firstError.msg === "string" ? firstError.msg : null;
  return message
    ? location
      ? `${location}: ${message}`
      : message
    : null;
};

export const getErrorMessage = (error) => {
  const response = error?.response?.data;
  const detail =
    typeof response?.detail === "string"
      ? response.detail
      : validationMessage(response?.detail);
  const message =
    typeof response?.message === "string" ? response.message : null;

  return (
    messages[response?.error_code] ||
    message ||
    detail ||
    (typeof error?.message === "string" ? error.message : null) ||
    "Something went wrong. Please try again."
  );
};
