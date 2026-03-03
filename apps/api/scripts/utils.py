import logging

log = logging.getLogger(__name__)

def apply_app_icon(window):  # pragma: no cover - backend stub
    """No-op for backend (sem GUI)."""
    return None

def show_generation_popup(summary, out_dir):
    """Backend-safe stub: no GUI popup, only logs."""
    log.info("Report gerado: %s | pasta=%s", summary, out_dir)
