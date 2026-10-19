import logging
from pathlib import Path

from fastapi_mail import ConnectionConfig, FastMail , MessageSchema ,MessageType

from src.config import Config

BASE_DIR = Path(__file__).resolve().parent
logger = logging.getLogger(__name__)


class EmailDeliveryError(RuntimeError):
    """Raised when the SMTP provider rejects delivery immediately."""

mail_config = ConnectionConfig(
    MAIL_USERNAME=Config.MAIL_USERNAME,
    MAIL_PASSWORD=Config.MAIL_PASSWORD,
    MAIL_FROM=Config.MAIL_FROM,
    MAIL_PORT=Config.MAIL_PORT,
    MAIL_SERVER=Config.MAIL_SERVER,
    MAIL_FROM_NAME=Config.MAIL_FROM_NAME,
    MAIL_STARTTLS=Config.MAIL_STARTTLS,
    MAIL_SSL_TLS=Config.MAIL_SSL_TLS,
    USE_CREDENTIALS=Config.USE_CREDENTIALS,
    VALIDATE_CERTS=Config.VALIDATE_CERTS,
    TEMPLATE_FOLDER=Path(BASE_DIR , 'templates')
)


mail = FastMail(
    config=mail_config
)


def create_message(recipients: list[str] , subject : str,body : str):
    message = MessageSchema(
        recipients=recipients, subject=subject, body=body, subtype=MessageType.html
    )
    
    return message


async def deliver_message(message: MessageSchema, *, event: str) -> None:
    """Send an email through one error-handling boundary.

    SMTP may accept a message and bounce it later. Delayed bounces require a
    provider webhook; this handles immediate connection/authentication/rejection
    errors only.
    """
    try:
        await mail.send_message(message)
    except Exception as exc:
        # Do not log recipient addresses or message bodies because they may contain PII.
        logger.exception("Immediate email delivery failure; event=%s", event)
        raise EmailDeliveryError from exc


async def deliver_message_in_background(message: MessageSchema, *, event: str) -> None:
    """Prevent SMTP errors from becoming unhandled background-task exceptions."""
    try:
        await deliver_message(message, event=event)
    except EmailDeliveryError:
        # The account remains unverified; a resend flow can retry it later.
        return
