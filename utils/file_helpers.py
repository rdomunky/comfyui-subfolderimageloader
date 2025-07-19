# utils/file_helpers.py
import os
import time
from typing import List, Dict, Optional
import logging

class FileCache:
    """Simple file listing cache to improve performance."""
    
    def __init__(self, cache_timeout: int = 5):
        self.cache_timeout = cache_timeout
        self._cache: Dict[str, List[str]] = {}
        self._timestamps: Dict[str, float] = {}
    
    def get_files(self, directory: str, force_refresh: bool = False) -> List[str]:
        """Get cached file listing or refresh if needed."""
        current_time = time.time()
        
        if (not force_refresh and 
            directory in self._timestamps and 
            current_time - self._timestamps[directory] < self.cache_timeout):
            return self._cache.get(directory, [])
        
        # Refresh cache
        files = self._scan_directory(directory)
        self._cache[directory] = files
        self._timestamps[directory] = current_time
        
        return files
    
    def _scan_directory(self, directory: str) -> List[str]:
        """Scan directory for image files."""
        if not os.path.exists(directory):
            return []
        
        valid_extensions = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff', '.tif'}
        files = []
        
        try:
            for file in os.listdir(directory):
                if os.path.splitext(file.lower())[1] in valid_extensions:
                    files.append(file)
        except PermissionError:
            logging.warning(f"Permission denied accessing {directory}")
        
        return sorted(files)

# Global cache instance
file_cache = FileCache()
