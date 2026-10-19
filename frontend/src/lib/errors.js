const messages = {
  invalid_email_or_password: 'The email or password is incorrect.', user_exists: 'An account with this email already exists.', invalid_verification_token: 'This verification link is invalid or expired. Request a new verification email.',
  account_not_verified: 'Please verify your email before continuing.', insufficient_permissions: 'You do not have access to this area.',
  product_not_found: 'That product is no longer available.', invalid_token: 'Your session has expired. Please sign in again.',
  server_error: 'Something went wrong on our side. Please try again.',
}
export const getErrorMessage = (error) => messages[error?.response?.data?.error_code] || error?.response?.data?.message || error?.message || 'Something went wrong. Please try again.'
