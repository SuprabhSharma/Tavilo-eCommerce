"""Safely resolve a client IP only from explicitly trusted reverse proxies."""

from functools import lru_cache
import ipaddress

from fastapi import Request

from src.config import Config


@lru_cache(maxsize=32)
def _parse_network(cidr: str) -> ipaddress.IPv4Network | ipaddress.IPv6Network:
    return ipaddress.ip_network(cidr.strip())


def _trusted_proxy_networks() -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
    return tuple(_parse_network(value) for value in Config.TRUSTED_PROXY_CIDRS.split(",") if value.strip())


def get_client_ip(request: Request) -> str:
    """Return X-Real-IP only when the direct peer is an approved proxy."""
    direct_peer = request.client.host if request.client else ""
    try:
        peer_address = ipaddress.ip_address(direct_peer)
    except ValueError:
        return "unknown"
    if not any(peer_address in network for network in _trusted_proxy_networks()):
        return str(peer_address)
    try:
        return str(ipaddress.ip_address(request.headers.get("x-real-ip", "").strip()))
    except ValueError:
        return str(peer_address)
