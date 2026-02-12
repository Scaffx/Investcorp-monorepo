import logging

log = logging.getLogger(__name__)

def show_generation_popup(summary, out_dir):
    """Backend-safe stub: no GUI popup, only logs."""
    log.info("Report gerado: %s | pasta=%s", summary, out_dir)
