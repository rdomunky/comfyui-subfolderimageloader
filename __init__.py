# __init__.py
from .subfolder_loader import SubfolderImageLoader

# Web directory for frontend assets
WEB_DIRECTORY = "./web"

# Required: Maps node identifier to class
NODE_CLASS_MAPPINGS = {
    "SubfolderImageLoader": SubfolderImageLoader,
}

# Optional: Maps identifier to display name
NODE_DISPLAY_NAME_MAPPINGS = {
    "SubfolderImageLoader": "Subfolder Image Loader",
}

# Export for ComfyUI discovery
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
